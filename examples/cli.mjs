import { pathToFileURL } from 'node:url';
import { runAgent } from './agent.mjs';

export function createResponder({ apiKey, model, signal, fetchImpl = fetch }) {
  if (!apiKey || !model) throw new Error('Set OPENAI_API_KEY and OPENAI_MODEL');
  return async request => {
    const response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, model }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Model API HTTP ${response.status}`);
    return response.json();
  };
}

export async function mockRespond(request) {
  const outputs = request.input.filter(item => item.type === 'function_call_output');
  if (outputs.length === 0) {
    return { status: 'completed', output: [{
      type: 'function_call', name: 'search_docs', call_id: 'mock-call-1',
      arguments: JSON.stringify({ query: request.input[0].content }),
    }] };
  }
  const result = JSON.parse(outputs.at(-1).output);
  const text = result.ok && result.documents.length
    ? result.documents.map(document => `${document.text} [${document.id}]`).join('\n')
    : '没有找到证据，无法回答。';
  return { status: 'completed', output: [{
    type: 'message', role: 'assistant', content: [{ type: 'output_text', text }],
  }] };
}

async function main() {
  const [mode, ...words] = process.argv.slice(2);
  if (!['--mock', '--live'].includes(mode)) {
    throw new Error('Usage: node cli.mjs --mock|--live [question]');
  }
  const respond = mode === '--mock' ? mockRespond : createResponder({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL,
    signal: AbortSignal.timeout(60000),
  });
  const result = await runAgent({ question: words.join(' ') || '请假需要谁审批？', respond });
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'answered') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}