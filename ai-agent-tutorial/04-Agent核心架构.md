# 第四章：Agent 核心架构 —— 理解智能体的内部运作机制

## 4.1 Agent 架构全景图

让我们从宏观角度理解一个 AI Agent 的完整架构：

```
              ┌────────────┐
              │  用户输入   │
              └─────┬──────┘
                    │
              ┌─────▼──────┐
              │   感知层    │  理解输入（文本/图像/语音）
              └─────┬──────┘
                    │
     ┌──────────────▼───────────────┐
     │        决策层（大脑）          │
     │                              │
     │   推理引擎（LLM）              │
     │     ├── 规划                  │
     │     └── 反思/评估             │
     │                              │
     │        记忆系统               │
     │     短期 | 长期 | 工作         │
     └──────────────┬───────────────┘
                    │
              ┌─────▼──────┐
              │   执行层    │  调用工具、执行动作
              │  Tool 1-3  │
              └─────┬──────┘
                    │
              ┌────────────┐
              │  输出结果   │
              └────────────┘
```

## 4.2 三种经典 Agent 架构模式

### 模式一：ReAct（推理 + 行动）

**最经典、最常用**的 Agent 模式。核心思想：交替进行推理和行动。

```
思考(Thought) → 行动(Action) → 观察(Observation) → 思考 → 行动 → ... → 最终答案
```

```javascript
// react-agent.mjs — 一个最简单的 ReAct Agent 实现
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 定义可用工具
const tools = {
  calculate: (expression) => {
    try {
      // 安全的数学计算（注意：生产环境请使用 mathjs 等安全库）
      const result = Function(`"use strict"; return (${expression.replace(/[^0-9+\-*/().]/g, '')})`)();
      return String(result);
    } catch {
      return '计算错误';
    }
  },
  get_time: () => new Date().toLocaleString('zh-CN'),
  get_random: (max) => String(Math.floor(Math.random() * Number(max)) + 1),
};

const SYSTEM_PROMPT = `
你是一个能使用工具的助手。对每个问题，按以下格式思考：

Thought: 分析问题，决定下一步
Action: 工具名称
Action Input: 工具参数
Observation: (系统会填写工具返回的结果)

可以多次 Thought → Action 循环。当你有足够信息后：

Thought: 我已经有答案了
Final Answer: 你的最终回答

可用工具：
- calculate(expression): 数学计算，如 calculate(2 + 3 * 4)
- get_time(): 获取当前时间
- get_random(max): 生成 1 到 max 之间的随机数
`;

async function reactAgent(userInput) {
  let messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userInput },
  ];
  
  const maxIterations = 10; // 防止无限循环
  
  for (let i = 0; i < maxIterations; i++) {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0,
    });
    
    const output = response.choices[0].message.content;
    console.log(`\n--- 第 ${i + 1} 轮 ---`);
    console.log(output);
    
    // 检查是否有最终答案
    if (output.includes('Final Answer:')) {
      const answer = output.split('Final Answer:')[1].trim();
      return answer;
    }
    
    // 解析 Action
    const actionMatch = output.match(/Action:\s*(\w+)/);
    const inputMatch = output.match(/Action Input:\s*(.+)/);
    
    if (actionMatch && inputMatch) {
      const toolName = actionMatch[1];
      const toolInput = inputMatch[1].trim();
      
      // 执行工具
      const toolFn = tools[toolName];
      if (toolFn) {
        const result = toolFn(toolInput);
        console.log(`[工具执行] ${toolName}(${toolInput}) → ${result}`);
        
        // 将结果加入对话
        messages.push({ role: 'assistant', content: output });
        messages.push({ role: 'user', content: `Observation: ${result}` });
      } else {
        messages.push({ role: 'assistant', content: output });
        messages.push({ role: 'user', content: `Observation: 错误 - 工具 ${toolName} 不存在` });
      }
    } else {
      // 没有找到 Action，也没有 Final Answer
      messages.push({ role: 'assistant', content: output });
      messages.push({ role: 'user', content: 'Observation: 请按照格式输出 Action 或 Final Answer' });
    }
  }
  
  return '达到最大迭代次数，任务未完成';
}

// 测试
const answer = await reactAgent('现在几点了？然后帮我算一下 123 * 456 等于多少');
console.log('\n最终答案:', answer);
```

### 模式二：Plan-and-Execute（先规划，再执行）

先制定完整计划，再逐步执行。适合复杂任务：

```
用户请求 → [规划阶段] 生成任务清单 → [执行阶段] 逐一执行 → 汇总结果
```

```javascript
// plan-execute-agent.mjs
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 第一步：规划
async function planTasks(userRequest) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `你是一个任务规划器。将用户请求拆解为具体的执行步骤。
输出 JSON 格式：
{
  "goal": "最终目标",
  "steps": [
    { "id": 1, "task": "具体任务描述", "tool": "需要的工具", "depends_on": [] }
  ]
}`
      },
      { role: 'user', content: userRequest }
    ],
  });

  return JSON.parse(response.choices[0].message.content);
}

// 第二步：逐步执行
async function executeStep(step, previousResults) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: '你是一个任务执行器。根据任务描述和之前步骤的结果，执行当前任务。'
      },
      {
        role: 'user',
        content: `
当前任务：${step.task}
之前的结果：${JSON.stringify(previousResults)}
请执行并返回结果。`
      }
    ],
  });

  return response.choices[0].message.content;
}

// 主流程
async function planAndExecuteAgent(userRequest) {
  console.log('📋 正在规划任务...\n');
  const plan = await planTasks(userRequest);
  
  console.log(`目标：${plan.goal}`);
  console.log(`步骤（共 ${plan.steps.length} 步）：`);
  plan.steps.forEach(s => console.log(`  ${s.id}. ${s.task}`));
  
  const results = {};
  
  for (const step of plan.steps) {
    console.log(`\n🔄 执行步骤 ${step.id}: ${step.task}`);
    const result = await executeStep(step, results);
    results[step.id] = result;
    console.log(`✅ 完成: ${result.substring(0, 100)}...`);
  }
  
  return results;
}

// 测试
await planAndExecuteAgent('帮我设计一个 TodoList 的 React 组件，需要增删改查功能');
```

### 模式三：反思模式（Reflection / Self-Refine）

Agent 执行后自我评估，不满意则修正：

```
执行 → 评估 → 不满意 → 修正 → 重新评估 → 满意 → 输出
```

```javascript
// reflection-agent.mjs
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateWithReflection(task, maxRounds = 3) {
  // 第一轮生成
  let currentOutput = await generate(task);
  console.log('📝 初始生成完成\n');
  
  for (let round = 0; round < maxRounds; round++) {
    // 反思评估
    const reflection = await reflect(task, currentOutput);
    console.log(`🔍 第 ${round + 1} 轮反思:`, reflection.summary);
    
    // 如果满意，结束
    if (reflection.score >= 8) {
      console.log('✅ 质量达标，输出最终结果');
      return currentOutput;
    }
    
    // 不满意，根据反馈改进
    console.log('🔄 正在改进...');
    currentOutput = await improve(task, currentOutput, reflection.feedback);
  }
  
  return currentOutput;
}

async function generate(task) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: '你是一个高水平的程序员。' },
      { role: 'user', content: task }
    ],
  });
  return response.choices[0].message.content;
}

async function reflect(task, output) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `你是一个严格的代码审查专家。评估以下输出是否完美满足需求。
输出 JSON：
{
  "score": 1-10,
  "summary": "一句话评价",
  "feedback": ["具体改进建议1", "具体改进建议2"]
}`
      },
      {
        role: 'user',
        content: `需求：${task}\n\n输出：${output}`
      }
    ],
  });
  return JSON.parse(response.choices[0].message.content);
}

async function improve(task, currentOutput, feedback) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: '你是一个高水平的程序员。根据反馈改进之前的输出。'
      },
      {
        role: 'user',
        content: `原始需求：${task}
        
当前输出：${currentOutput}

改进建议：
${feedback.map((f, i) => `${i + 1}. ${f}`).join('\n')}

请输出改进后的完整版本。`
      }
    ],
  });
  return response.choices[0].message.content;
}
```

## 4.3 三种模式对比

| 特征 | ReAct | Plan-and-Execute | Reflection |
|---|---|---|---|
| **流程** | 边想边做 | 先想后做 | 做了再改 |
| **适合场景** | 通用场景、工具调用 | 复杂多步任务 | 高质量内容生成 |
| **优点** | 灵活，能随时调整 | 有全局视角 | 输出质量高 |
| **缺点** | 可能迷失方向 | 计划不一定准确 | 耗时更多 |
| **类比** | 随机应变的程序员 | 写详细设计再编码 | 反复修改代码评审 |

> 💡 **实际项目中**，这三种模式经常组合使用。比如先 Plan-and-Execute 做整体规划，每个步骤内用 ReAct 执行，最后用 Reflection 检查质量。

## 4.4 Agent Loop 的完整实现

让我们实现一个更完整的 Agent Loop，它是所有 Agent 的核心骨架：

```javascript
// agent-loop.mjs
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class Agent {
  constructor(config) {
    this.name = config.name;
    this.systemPrompt = config.systemPrompt;
    this.tools = config.tools || {};
    this.maxIterations = config.maxIterations || 15;
    this.messages = [{ role: 'system', content: this.systemPrompt }];
  }

  // 核心：Agent 主循环
  async run(userInput) {
    this.messages.push({ role: 'user', content: userInput });
    
    for (let i = 0; i < this.maxIterations; i++) {
      console.log(`\n🔄 迭代 ${i + 1}`);
      
      // 1. 调用 LLM 决策
      const response = await this.think();
      const message = response.choices[0].message;
      
      // 2. 将 AI 回复加入历史
      this.messages.push(message);
      
      // 3. 检查是否需要调用工具
      if (message.tool_calls && message.tool_calls.length > 0) {
        // 执行所有工具调用
        for (const toolCall of message.tool_calls) {
          const result = await this.executeTool(toolCall);
          
          // 将工具结果加入消息历史
          this.messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }
        // 继续循环，让 LLM 根据工具结果决定下一步
      } else {
        // 没有工具调用，说明 LLM 准备给出最终回答
        console.log('✅ Agent 完成');
        return message.content;
      }
    }
    
    return '达到最大迭代次数';
  }

  // LLM 思考
  async think() {
    // 转换工具定义为 OpenAI 格式
    const toolDefinitions = Object.entries(this.tools).map(([name, tool]) => ({
      type: 'function',
      function: {
        name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    return openai.chat.completions.create({
      model: 'gpt-4o',
      messages: this.messages,
      tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
      temperature: 0,
    });
  }

  // 执行工具
  async executeTool(toolCall) {
    const { name } = toolCall.function;
    const args = JSON.parse(toolCall.function.arguments);
    
    console.log(`🔧 调用工具: ${name}(${JSON.stringify(args)})`);
    
    const tool = this.tools[name];
    if (!tool) {
      return { error: `工具 ${name} 不存在` };
    }
    
    try {
      const result = await tool.execute(args);
      console.log(`📎 结果: ${JSON.stringify(result).substring(0, 200)}`);
      return result;
    } catch (err) {
      console.log(`❌ 工具错误: ${err.message}`);
      return { error: err.message };
    }
  }
}

// ========== 使用示例 ==========

const myAgent = new Agent({
  name: 'MathHelper',
  systemPrompt: '你是一个数学助手。使用提供的工具来解决用户的数学问题。先分析问题，再调用工具计算。',
  tools: {
    add: {
      description: '加法',
      parameters: {
        type: 'object',
        properties: {
          a: { type: 'number', description: '第一个数' },
          b: { type: 'number', description: '第二个数' },
        },
        required: ['a', 'b'],
      },
      execute: ({ a, b }) => ({ result: a + b }),
    },
    multiply: {
      description: '乘法',
      parameters: {
        type: 'object',
        properties: {
          a: { type: 'number', description: '第一个数' },
          b: { type: 'number', description: '第二个数' },
        },
        required: ['a', 'b'],
      },
      execute: ({ a, b }) => ({ result: a * b }),
    },
  },
});

const answer = await myAgent.run('计算 (12 + 8) * 5 等于多少？');
console.log('\n最终答案:', answer);

export { Agent };
```

## 4.5 状态机视角理解 Agent

如果你习惯前端开发的思维，可以把 Agent 理解为一个**状态机**：

```javascript
// Agent 状态机
const AgentState = {
  IDLE: 'idle',           // 空闲
  THINKING: 'thinking',   // 思考中
  ACTING: 'acting',       // 执行工具中
  OBSERVING: 'observing', // 观察结果中
  REFLECTING: 'reflecting', // 反思中
  DONE: 'done',           // 完成
  ERROR: 'error',         // 错误
};

// 状态转换
const transitions = {
  [AgentState.IDLE]:       (input) => AgentState.THINKING,
  [AgentState.THINKING]:   (decision) => decision.needsTool ? AgentState.ACTING : AgentState.DONE,
  [AgentState.ACTING]:     (result) => AgentState.OBSERVING,
  [AgentState.OBSERVING]:  (observation) => AgentState.THINKING,  // 回到思考
  [AgentState.REFLECTING]: (quality) => quality.ok ? AgentState.DONE : AgentState.THINKING,
};
```

用 React 的思维来类比：

```jsx
// Agent 就像一个特殊的 useEffect + useReducer
function AgentComponent() {
  const [state, dispatch] = useReducer(agentReducer, {
    status: 'idle',
    messages: [],
    tools: [],
  });

  // 类似 Agent Loop
  useEffect(() => {
    if (state.status === 'thinking') {
      callLLM(state.messages).then(response => {
        if (response.hasToolCall) {
          dispatch({ type: 'EXECUTE_TOOL', tool: response.toolCall });
        } else {
          dispatch({ type: 'COMPLETE', result: response.content });
        }
      });
    }
  }, [state.status]);
}
```

## 4.6 路由架构：根据意图分发

对于复杂的 Agent 应用，通常需要一个**路由层**来分发不同类型的请求：

```javascript
// router-agent.mjs

class RouterAgent {
  constructor() {
    // 注册专业 Agent
    this.agents = {
      code: new Agent({
        name: 'CodeAgent',
        systemPrompt: '你是编程专家...',
        tools: { /* 代码相关工具 */ },
      }),
      search: new Agent({
        name: 'SearchAgent', 
        systemPrompt: '你是搜索助手...',
        tools: { /* 搜索工具 */ },
      }),
      file: new Agent({
        name: 'FileAgent',
        systemPrompt: '你是文件管理助手...',
        tools: { /* 文件操作工具 */ },
      }),
    };
  }

  // 路由：判断用户意图，分发给对应 Agent
  async route(userInput) {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // 路由用小模型就够了
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `判断用户意图，输出 JSON：
{
  "intent": "code | search | file | chat",
  "confidence": 0.0-1.0,
  "reason": "判断理由"
}`
        },
        { role: 'user', content: userInput }
      ],
    });
    
    const { intent, confidence } = JSON.parse(response.choices[0].message.content);
    
    if (confidence < 0.6) {
      // 信心不足，直接用通用模型回答
      return this.generalChat(userInput);
    }
    
    const agent = this.agents[intent];
    if (agent) {
      return agent.run(userInput);
    }
    
    return this.generalChat(userInput);
  }
  
  async generalChat(input) {
    // 简单对话，不需要 Agent
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: input }],
    });
    return response.choices[0].message.content;
  }
}
```

## 4.7 架构选择指南

根据你的应用场景选择合适的架构：

```
简单对话助手
  └→ 单次 LLM 调用（不需要 Agent 架构）

需要使用工具的助手
  └→ ReAct 模式

复杂多步骤任务
  └→ Plan-and-Execute

高质量内容生成
  └→ Reflection 模式

大型应用（多种功能）
  └→ Router + 多专业 Agent

超复杂任务（多人协作级别）
  └→ 多 Agent 协作（第8章详解）
```

## 4.8 小结

本章你理解了：

- ✅ Agent 架构全景：感知层、决策层、执行层
- ✅ 三种核心模式：ReAct、Plan-and-Execute、Reflection
- ✅ Agent Loop 的完整实现
- ✅ 状态机视角理解 Agent
- ✅ 路由架构设计
- ✅ 架构选择指南

### 练习

1. 运行 ReAct Agent 示例，添加更多自定义工具（如字符串处理、日期计算）
2. 实现一个结合 Plan-and-Execute 和 Reflection 的混合 Agent
3. 设计你的 Electron Agent 应用的整体架构

**下一章**我们将深入 Function Calling——让 Agent 真正能"动手做事"的关键能力。
