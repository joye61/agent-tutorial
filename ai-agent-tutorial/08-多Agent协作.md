# 第八章：多 Agent 协作 —— 让智能体组团工作

## 8.1 为什么需要多 Agent？

就像一个复杂的软件项目需要前端、后端、测试、产品经理分工合作，复杂的 AI 任务也需要多个 Agent 各司其职。

### 单 Agent vs 多 Agent

| 单 Agent | 多 Agent |
|---|---|
| 一个 Agent 身兼数职 | 每个 Agent 专精一个领域 |
| System Prompt 很长很复杂 | 每个 Agent 的 Prompt 简洁专注 |
| 容易"忘记"自己的角色 | 角色分工明确，不会混乱 |
| 适合简单任务 | 适合复杂任务 |

### 真实案例

```
用户需求："帮我开发一个 Todo 应用的后端 API"

单 Agent 方式：
  一个 Agent 同时思考 → 设计 API → 写代码 → 写测试 → 写文档 → 容易乱

多 Agent 方式：
  📋 产品经理 Agent → 分析需求，设计 API 接口
  💻 开发者 Agent   → 根据设计编写代码
  🧪 测试 Agent     → 编写测试用例
  📝 文档 Agent     → 撰写 API 文档
  👔 项目经理 Agent → 协调以上所有 Agent
```

## 8.2 多 Agent 协作模式

### 模式一：顺序流水线（Sequential Pipeline）

Agent 按固定顺序依次工作，前一个的输出是后一个的输入：

```
Agent A → Agent B → Agent C → 最终结果
(需求分析)  (编写代码)  (代码审查)
```

```javascript
// sequential-pipeline.mjs
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 定义流水线中的 Agent
const agents = {
  analyst: {
    name: '需求分析师',
    prompt: `你是一个资深需求分析师。分析用户需求，输出：
1. 功能列表
2. 数据模型设计
3. API 接口清单
用 Markdown 格式输出。`,
  },

  developer: {
    name: '开发者',
    prompt: `你是一个资深 Node.js 开发者。根据需求分析的结果，编写完整的代码实现。
使用 Express 框架，代码要生产级质量。`,
  },

  reviewer: {
    name: '代码审查员',
    prompt: `你是一个严格的代码审查专家。审查代码质量，指出问题并给出改进后的最终版本。
关注：安全性、性能、错误处理、代码风格。`,
  },
};

async function callAgent(agentConfig, input) {
  console.log(`\n🤖 [${agentConfig.name}] 正在工作...`);
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: agentConfig.prompt },
      { role: 'user', content: input },
    ],
    temperature: 0,
  });
  
  const output = response.choices[0].message.content;
  console.log(`✅ [${agentConfig.name}] 完成`);
  return output;
}

// 顺序执行流水线
async function pipeline(userRequest) {
  // 第一步：需求分析
  const analysis = await callAgent(agents.analyst, userRequest);
  
  // 第二步：编写代码
  const code = await callAgent(agents.developer, 
    `需求分析结果：\n${analysis}\n\n请根据以上分析编写完整代码。`);
  
  // 第三步：代码审查
  const finalCode = await callAgent(agents.reviewer, 
    `原始需求：${userRequest}\n\n代码：\n${code}\n\n请审查并给出最终版本。`);
  
  return { analysis, code, finalCode };
}

const result = await pipeline('开发一个用户注册登录的 REST API');
console.log('\n📋 最终结果:', result.finalCode);
```

### 模式二：监督者模式（Supervisor）

一个"老板" Agent 负责分配任务、协调其他 Agent：

```
                ┌──────────┐
                │ Supervisor│ ← 负责协调
                └─────┬────┘
          ┌───────────┼───────────┐
          │           │           │
     ┌────▼───┐ ┌────▼───┐ ┌────▼───┐
     │Worker A│ │Worker B│ │Worker C│
     └────────┘ └────────┘ └────────┘
```

```javascript
// supervisor-pattern.mjs
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class SupervisorAgent {
  constructor() {
    this.workers = {};
  }

  // 注册 Worker Agent
  registerWorker(name, config) {
    this.workers[name] = config;
  }

  // Supervisor 决策：分配任务给哪个 Worker
  async delegate(userRequest) {
    const workerList = Object.entries(this.workers)
      .map(([name, config]) => `- ${name}: ${config.description}`)
      .join('\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `你是一个项目经理，负责将任务分配给合适的团队成员。

可用团队成员：
${workerList}

根据用户请求，制定执行计划。输出 JSON：
{
  "plan": [
    { "worker": "成员名称", "task": "具体任务描述", "depends_on": [] }
  ],
  "summary": "计划总结"
}

depends_on 中填写当前步骤依赖的前序步骤索引（从0开始），
没有依赖的步骤可以并行执行。`
        },
        { role: 'user', content: userRequest }
      ],
    });

    return JSON.parse(response.choices[0].message.content);
  }

  // 执行 Worker
  async executeWorker(workerName, task, context = '') {
    const worker = this.workers[workerName];
    if (!worker) throw new Error(`Worker ${workerName} 不存在`);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: worker.prompt },
        { 
          role: 'user', 
          content: context ? `背景信息：\n${context}\n\n任务：${task}` : task 
        },
      ],
    });

    return response.choices[0].message.content;
  }

  // 主流程
  async run(userRequest) {
    // 1. 制定计划
    console.log('📋 Supervisor 正在制定计划...');
    const plan = await this.delegate(userRequest);
    console.log(`计划: ${plan.summary}`);
    plan.plan.forEach((step, i) => 
      console.log(`  ${i + 1}. [${step.worker}] ${step.task}`)
    );

    // 2. 按依赖顺序执行
    const results = {};
    
    for (let i = 0; i < plan.plan.length; i++) {
      const step = plan.plan[i];
      
      // 收集依赖步骤的结果作为上下文
      const context = (step.depends_on || [])
        .map(depIdx => `[步骤${depIdx + 1}的结果]:\n${results[depIdx]}`)
        .join('\n\n');

      console.log(`\n🔄 执行步骤 ${i + 1}: [${step.worker}] ${step.task}`);
      results[i] = await this.executeWorker(step.worker, step.task, context);
      console.log(`✅ 步骤 ${i + 1} 完成`);
    }

    // 3. Supervisor 汇总
    const summaryContext = Object.entries(results)
      .map(([idx, result]) => `[步骤${Number(idx) + 1}: ${plan.plan[idx].task}]\n${result}`)
      .join('\n\n---\n\n');

    const finalResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: '你是项目经理。团队已完成所有任务，请整合结果给用户一个完整的回复。'
        },
        { role: 'user', content: `原始需求：${userRequest}\n\n各步骤执行结果：\n${summaryContext}` }
      ],
    });

    return finalResponse.choices[0].message.content;
  }
}

// ===== 使用示例 =====

const supervisor = new SupervisorAgent();

supervisor.registerWorker('frontend_dev', {
  description: '前端开发专家，精通 React/Vue/HTML/CSS',
  prompt: '你是一个资深前端开发者，精通 React 和现代 CSS。输出高质量的前端代码。',
});

supervisor.registerWorker('backend_dev', {
  description: '后端开发专家，精通 Node.js/Express/数据库',
  prompt: '你是一个资深 Node.js 后端开发者。输出生产级质量的后端代码。',
});

supervisor.registerWorker('ui_designer', {
  description: 'UI 设计师，擅长用户体验设计',
  prompt: '你是一个 UI/UX 设计师。描述界面布局和交互设计，使用 ASCII art 展示线框图。',
});

const result = await supervisor.run('开发一个简单的个人博客系统，支持文章发布和评论');
console.log('\n\n📦 最终结果:\n', result);
```

### 模式三：辩论模式（Debate / Adversarial）

多个 Agent 从不同角度分析问题，通过"辩论"达成更好的答案：

```javascript
// debate-pattern.mjs
async function debate(question, rounds = 2) {
  const agents = [
    {
      name: '乐观派',
      prompt: '你是一个乐观主义者，倾向于看到方案的优点和可行性。但你也要诚实指出真实的风险。',
    },
    {
      name: '悲观派',
      prompt: '你是一个批判性思考者，善于发现方案的漏洞和风险。但你也要承认方案的优点。',
    },
  ];

  let history = [];

  for (let round = 0; round < rounds; round++) {
    for (const agent of agents) {
      const context = history.length > 0
        ? `之前的讨论：\n${history.map(h => `[${h.name}]: ${h.content}`).join('\n\n')}`
        : '';

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: agent.prompt },
          { 
            role: 'user', 
            content: `问题：${question}\n\n${context}\n\n请给出你的分析（第 ${round + 1} 轮）。如果有前面的讨论，请回应对方观点。` 
          },
        ],
      });

      const content = response.choices[0].message.content;
      history.push({ name: agent.name, content });
      console.log(`\n🗣️ [${agent.name}] 第${round + 1}轮:\n${content}\n`);
    }
  }

  // 仲裁者总结
  const summary = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: '你是一个公正的仲裁者。综合辩论双方的观点，给出平衡的最终结论。'
      },
      {
        role: 'user',
        content: `问题：${question}\n\n辩论历史：\n${history.map(h => `[${h.name}]: ${h.content}`).join('\n\n---\n\n')}`
      }
    ],
  });

  return summary.choices[0].message.content;
}

const conclusion = await debate('是否应该用微服务架构开发一个初创公司的 MVP？');
console.log('\n⚖️ 最终结论:\n', conclusion);
```

## 8.3 Agent 之间的通信

### 消息传递模式

```javascript
// 简单的 Agent 消息总线
class AgentMessageBus {
  constructor() {
    this.agents = new Map();
    this.messageQueue = [];
  }

  // 注册 Agent
  register(agentId, handler) {
    this.agents.set(agentId, handler);
  }

  // 发送消息
  async send(from, to, message) {
    console.log(`📨 [${from}] → [${to}]: ${message.type}`);
    
    const handler = this.agents.get(to);
    if (!handler) throw new Error(`Agent ${to} 未注册`);
    
    const response = await handler({
      from,
      ...message,
    });
    
    return response;
  }

  // 广播消息给所有 Agent
  async broadcast(from, message) {
    const responses = {};
    for (const [agentId, handler] of this.agents) {
      if (agentId !== from) {
        responses[agentId] = await handler({ from, ...message });
      }
    }
    return responses;
  }
}

// 使用
const bus = new AgentMessageBus();

bus.register('planner', async (msg) => {
  // 处理消息并返回
  return { plan: ['步骤1', '步骤2'] };
});

bus.register('coder', async (msg) => {
  if (msg.type === 'write_code') {
    return { code: '...' };
  }
});

const plan = await bus.send('user', 'planner', { 
  type: 'create_plan', 
  content: '开发一个 API' 
});
```

### 共享黑板模式（Blackboard）

多个 Agent 通过共享的"黑板"协作：

```javascript
class Blackboard {
  constructor() {
    this.data = {};
    this.history = [];
  }

  write(agentId, key, value) {
    this.data[key] = { value, author: agentId, time: Date.now() };
    this.history.push({ action: 'write', agentId, key, time: Date.now() });
  }

  read(key) {
    return this.data[key]?.value;
  }

  readAll() {
    return Object.fromEntries(
      Object.entries(this.data).map(([k, v]) => [k, v.value])
    );
  }

  // 获取黑板状态摘要（可以加入 Agent 的 context）
  getSummary() {
    return Object.entries(this.data)
      .map(([key, { value, author }]) => `[${key}] by ${author}: ${JSON.stringify(value).substring(0, 200)}`)
      .join('\n');
  }
}

// 使用
const board = new Blackboard();
board.write('analyst', 'requirements', { features: ['登录', '注册'] });
board.write('designer', 'api_spec', { endpoints: ['/login', '/register'] });
// coder Agent 可以读取所有信息来编写代码
const requirements = board.read('requirements');
const apiSpec = board.read('api_spec');
```

## 8.4 错误处理和容错

多 Agent 系统需要处理各种失败情况：

```javascript
class ResilientMultiAgent {
  async executeWithRetry(agentFn, maxRetries = 2) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await agentFn();
      } catch (error) {
        console.log(`⚠️ 尝试 ${attempt + 1} 失败: ${error.message}`);
        if (attempt === maxRetries) {
          return { error: `Agent 执行失败: ${error.message}`, fallback: true };
        }
      }
    }
  }

  async executeWithTimeout(agentFn, timeoutMs = 30000) {
    return Promise.race([
      agentFn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Agent 执行超时')), timeoutMs)
      ),
    ]);
  }

  async executeWithFallback(primaryAgent, fallbackAgent, task) {
    try {
      return await this.executeWithTimeout(() => primaryAgent(task));
    } catch {
      console.log('🔄 主 Agent 失败，尝试备用 Agent...');
      return fallbackAgent(task);
    }
  }
}
```

## 8.5 A2A 协议：跨系统 Agent 协作的标准

前面的协作模式都是在**同一个系统内**协调多个 Agent。当你需要让来自**不同系统、不同组织**的 Agent 协作时，就需要标准化的通信协议——**A2A（Agent-to-Agent Protocol）**。

### 为什么需要 A2A？

```
没有 A2A：
  你的 Agent ←→ 自定义 API ←→ 合作方 Agent A
  你的 Agent ←→ 另一种 API ←→ 合作方 Agent B
  你的 Agent ←→ 又一种格式 ←→ 合作方 Agent C → N × M 种集成 😱

有了 A2A：
  你的 Agent ←→ A2A 协议 ←→ 任何 A2A 兼容 Agent ✅
```

### A2A 在多 Agent 系统中的角色

A2A 与 MCP 互补，共同构成 Agent 协作生态：

| 协议 | 解决的问题 | 类比 |
|------|-----------|------|
| **MCP** | Agent ↔ 工具/数据源 | USB-C（连外设） |
| **A2A** | Agent ↔ Agent | 网络协议（设备间通信） |

### 实践：用 A2A 构建跨 Agent 协作

```javascript
// 概念示例：Supervisor 通过 A2A 调度远程 Agent

import { A2AClient } from '@a2a-js/sdk';

class A2ASupervisor {
  constructor() {
    this.remoteAgents = new Map();
  }

  // 注册远程 Agent（通过 Agent Card URL 发现）
  async discoverAgent(cardUrl) {
    const client = new A2AClient(cardUrl);
    const card = await client.getAgentCard();
    this.remoteAgents.set(card.name, { client, card });
    console.log(`发现 Agent: ${card.name} - ${card.description}`);
    return card;
  }

  // 分配任务给远程 Agent
  async delegateTask(agentName, taskContent) {
    const agent = this.remoteAgents.get(agentName);
    if (!agent) throw new Error(`Agent ${agentName} 未注册`);

    const task = await agent.client.sendMessage({
      message: {
        role: 'user',
        parts: [{ type: 'text', text: taskContent }],
      },
    });

    return task;
  }
}

// 使用
const supervisor = new A2ASupervisor();

// 发现远程 Agent（它们可以是任何框架构建的）
await supervisor.discoverAgent('https://code-agent.example.com/.well-known/agent.json');
await supervisor.discoverAgent('https://test-agent.example.com/.well-known/agent.json');

// 协调任务
const codeResult = await supervisor.delegateTask('code-agent', '实现一个 REST API');
const testResult = await supervisor.delegateTask('test-agent', `为以下代码编写测试：${codeResult}`);
```

> 💡 **A2A v1.0 于 2026 年 3 月正式发布**，已有 JS/Python/Go/Java/.NET SDK。在第 12 章会进一步介绍其生态发展。

## 8.6 多 Agent 模式对比

| 模式 | 适用场景 | 优点 | 缺点 |
|---|---|---|---|
| **顺序流水线** | 步骤明确的任务 | 简单可控 | 不灵活，前面出错后面都错 |
| **Supervisor** | 复杂多面任务 | 灵活分配 | Supervisor 是单点瓶颈 |
| **辩论** | 决策分析 | 考虑全面 | 耗时较多 |
| **黑板** | 需要共享状态的协作 | 松耦合 | 协调复杂性高 |
| **A2A 远程协作** | 跨系统/跨组织 Agent 协作 | 标准化、跨平台 | 需要网络通信 |

> 💡 **实践建议**：从简单的顺序流水线开始，只在真正需要时才引入更复杂的多 Agent 模式。过度使用多 Agent 会增加延迟和成本。跨系统协作场景优先考虑 A2A 协议。

## 8.7 小结

本章你掌握了：

- ✅ 多 Agent 协作的必要性
- ✅ 四种协作模式：流水线、Supervisor、辩论、黑板
- ✅ A2A 协议：跨系统 Agent 协作标准
- ✅ Agent 间通信机制
- ✅ 错误处理和容错策略
- ✅ 模式选择指南

### 练习

1. 用流水线模式实现"需求→代码→测试"流程
2. 用 Supervisor 模式实现一个"项目经理 + 3 个开发者"的协作系统
3. 用辩论模式让两个 Agent 讨论一个技术方案的优劣

**下一章**我们将学习 JS 生态中主流的 Agent 开发框架，提升开发效率。
