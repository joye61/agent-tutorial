import test from 'node:test';
import assert from 'node:assert/strict';
import { executeTool, runAgent } from './agent.mjs';
import { createResponder, mockRespond } from './cli.mjs';

const call = (overrides = {}) => ({
  type: 'function_call', name: 'search_docs', call_id: 'call-1',
  arguments: JSON.stringify({ query: '请假' }), ...overrides,
});
const completed = output => ({ status: 'completed', output });
const answer = text => ({
  type: 'message', role: 'assistant', content: [{ type: 'output_text', text }],
});

test('search returns evidence and no internal keywords', () => {
  const result = executeTool(call());
  assert.equal(result.documents[0].id, 'leave-2026');
  assert.equal('keywords' in result.documents[0], false);
});

test('unknown query returns no fabricated evidence', () => {
  assert.deepEqual(executeTool(call({ arguments: '{"query":"火星差旅"}' })), {
    ok: true, documents: [],
  });
});

test('dispatcher rejects unknown tool and invalid JSON', () => {
  assert.equal(executeTool(call({ name: 'delete_file' })).error, 'UNKNOWN_TOOL');
  assert.equal(executeTool(call({ arguments: '{' })).error, 'INVALID_JSON');
});

test('runtime validation rejects malformed and excessive arguments', () => {
  for (const args of [null, [], {}, { query: 1 }, { query: ' ' },
    { query: 'a'.repeat(201) }, { query: '请假', userId: 'other' }]) {
    assert.equal(executeTool(call({ arguments: JSON.stringify(args) })).error, 'INVALID_ARGUMENTS');
  }
});

test('loop preserves all output items and pairs every tool call', async () => {
  const reasoning = { type: 'reasoning', id: 'reasoning-1', encrypted_content: 'opaque' };
  let requests = 0;
  const result = await runAgent({
    question: '请假和报销怎么办？',
    respond: async request => {
      requests += 1;
      assert.equal(request.store, false);
      assert.deepEqual(request.include, ['reasoning.encrypted_content']);
      if (requests === 1) {
        return completed([reasoning, call(), call({
          call_id: 'call-2', arguments: '{"query":"报销"}',
        })]);
      }
      assert.deepEqual(request.input[1], reasoning);
      const results = request.input.filter(item => item.type === 'function_call_output');
      assert.deepEqual(results.map(item => item.call_id), ['call-1', 'call-2']);
      assert.equal(JSON.parse(results[1].output).documents[0].id, 'expense-2026');
      return completed([answer('请假需主管审批 [leave-2026]。')]);
    },
  });
  assert.equal(requests, 2);
  assert.equal(result.status, 'answered');
  assert.match(result.text, /leave-2026/);
});

test('tool errors are returned to the model as data', async () => {
  let requests = 0;
  await runAgent({ question: 'test', respond: async request => {
    requests += 1;
    if (requests === 1) return completed([call({ arguments: '{' })]);
    assert.equal(JSON.parse(request.input.at(-1).output).error, 'INVALID_JSON');
    return completed([answer('无法检索。')]);
  } });
});

test('endless tool requests stop at turn limit', async () => {
  let requests = 0;
  const result = await runAgent({ question: 'test', maxTurns: 2, respond: async () => {
    requests += 1;
    return completed([call()]);
  } });
  assert.equal(result.status, 'turn_limit');
  assert.equal(requests, 2);
  assert.equal(result.text, '');
});

test('oversized tool batch is rejected before execution', async () => {
  const result = await runAgent({ question: 'test', maxToolCalls: 1,
    respond: async () => completed([call(), call({ call_id: 'call-2' })]),
  });
  assert.equal(result.status, 'tool_limit');
  assert.equal(result.trace.some(event => event.tool), false);
});

test('incomplete output is not executed or treated as an answer', async () => {
  const result = await runAgent({ question: 'test', respond: async () => ({
    status: 'incomplete', output: [call(), answer('partial')],
  }) });
  assert.equal(result.status, 'incomplete');
  assert.equal(result.text, '');
  assert.equal(result.trace.some(event => event.tool), false);
});

test('refusal-only response is not successful text', async () => {
  const result = await runAgent({ question: 'test', respond: async () => completed([{
    type: 'message', content: [{ type: 'refusal', refusal: 'Cannot help.' }],
  }]) });
  assert.equal(result.status, 'no_answer');
});

test('commentary is not presented as a final answer', async () => {
  const commentary = { ...answer('I will search.'), phase: 'commentary' };
  const empty = await runAgent({ question: 'test',
    respond: async () => completed([commentary]),
  });
  assert.equal(empty.status, 'no_answer');
  const final = await runAgent({ question: 'test',
    respond: async () => completed([commentary, { ...answer('Done.'), phase: 'final_answer' }]),
  });
  assert.equal(final.text, 'Done.');
});

test('invalid input and limits fail before calling the model', async () => {
  const respond = async () => assert.fail('must not call the model');
  await assert.rejects(runAgent({ question: '', respond }), /Question/);
  await assert.rejects(runAgent({ question: 'test', maxTurns: 0, respond }), /limits/);
});

test('offline demo runs without credentials', async () => {
  const result = await runAgent({ question: '请假', respond: mockRespond });
  assert.equal(result.status, 'answered');
  assert.match(result.text, /leave-2026/);
});

test('HTTP adapter sets endpoint, model, credentials and cancellation', async () => {
  const signal = AbortSignal.abort();
  const respond = createResponder({ apiKey: 'fake-key', model: 'test-model', signal,
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal(options.headers.Authorization, 'Bearer fake-key');
      assert.equal(JSON.parse(options.body).model, 'test-model');
      assert.equal(options.signal.aborted, true);
      return { ok: true, json: async () => completed([answer('test')]) };
    },
  });
  assert.equal((await respond({ input: [] })).status, 'completed');
});

test('HTTP errors do not leak upstream bodies', async () => {
  const respond = createResponder({ apiKey: 'fake-key', model: 'test-model',
    fetchImpl: async () => ({ ok: false, status: 429 }),
  });
  await assert.rejects(respond({}), /^Error: Model API HTTP 429$/);
  assert.throws(() => createResponder({}), /OPENAI_API_KEY/);
});