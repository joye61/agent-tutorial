# 第二章 Agent 深度解析

## 2.1 Agent 的本质

在 Mastra 中，Agent = LLM + 指令 + 工具 + 记忆。它不是简单的 API 调用包装，而是一个具有推理能力、能自主决策使用哪些工具、并持续迭代直到得出最终答案的自治单元。

**一个直观的类比：** 如果 LLM 是一个聪明但没有手的大脑，那 Agent 就是给它装上了手（Tools）、给了它地图（Instructions）、还让它有了记忆力（Memory）。

## 2.2 Agent 配置详解

### 基本配置

```typescript
import { Agent } from '@mastra/core/agent'

const myAgent = new Agent({
  id: 'my-agent',         // 唯一标识
  name: 'My Agent',       // 显示名称
  instructions: '...',    // 系统指令
  model: 'openai/gpt-5.1', // 模型选择
  tools: { ... },         // 可用工具
  memory: new Memory(),   // 记忆配置
  voice: new OpenAIVoice(), // 语音能力（可选）
})
```

### 指令（Instructions）的多种格式

指令是 Agent 的"灵魂"，Mastra 支持多种格式：

```typescript
// 1. 最简单：一个字符串
instructions: '你是一个翻译助手，只把中文翻译成英文。'

// 2. 字符串数组（会被拼接为多条系统消息）
instructions: [
  '你是一个代码审查专家。',
  '重点关注安全性和性能问题。',
  '用中文回答。',
]

// 3. 系统消息数组（最精细的控制）
instructions: [
  { role: 'system', content: '你是一个代码审查专家。' },
  { role: 'system', content: '你精通 TypeScript 和 React。' },
]

// 4. 带提供商专属选项（如 Anthropic 的缓存、OpenAI 的推理深度）
instructions: {
  role: 'system',
  content: '你是一个深度思考的分析师。',
  providerOptions: {
    openai: { reasoningEffort: 'high' },      // OpenAI 推理模型
    anthropic: { cacheControl: { type: 'ephemeral' } }, // Anthropic 缓存
  },
}
```

### 动态指令

指令可以是一个异步函数，在每次请求时动态生成。这在以下场景特别有用：
- 根据用户身份个性化指令
- 从外部系统获取最新的提示词
- A/B 测试不同的提示词版本

```typescript
const agent = new Agent({
  id: 'dynamic-agent',
  instructions: async ({ requestContext }) => {
    const userTier = requestContext.get('user-tier')
    return userTier === 'enterprise'
      ? '你是一个企业级顾问，提供详细的分析报告。'
      : '你是一个简洁的助手，用最少的话回答问题。'
  },
  model: 'openai/gpt-4.1',
})
```

### 模型选择的策略

Mastra 使用 `provider/model-name` 格式选择模型，模型也可以动态切换：

```typescript
const agent = new Agent({
  id: 'smart-router',
  // 根据用户等级动态选择模型
  model: ({ requestContext }) => {
    const tier = requestContext.get('user-tier')
    return tier === 'enterprise'
      ? 'openai/gpt-5'
      : 'openai/gpt-4.1-nano'
  },
})
```

> **实战建议**：开发阶段用便宜的模型（如 `gpt-4.1-nano`），生产环境根据任务复杂度路由到不同模型。这能省很多钱。

## 2.3 生成回复

### generate（一次性生成）

```typescript
const agent = mastra.getAgent('myAgent')

// 简单字符串输入
const res1 = await agent.generate('你好')
console.log(res1.text)

// 多条消息输入
const res2 = await agent.generate([
  { role: 'user', content: '帮我安排今天的日程' },
  { role: 'user', content: '我9点到17:30工作' },
  { role: 'user', content: '午休12:30到13:30' },
])
console.log(res2.text)
```

### stream（流式输出）

流式输出适合面向用户的场景，可以逐 Token 显示：

```typescript
const stream = await agent.stream('给我写一篇300字的文章')

for await (const chunk of stream.textStream) {
  process.stdout.write(chunk)  // 实时输出每个 token
}
```

> **什么时候用 generate，什么时候用 stream？**
> - `generate`：适合内部处理、短回复、调试场景
> - `stream`：适合 UI 展示，让用户尽快看到内容

## 2.4 结构化输出

Agent 不仅能输出文本，还能输出结构化的 JSON 数据。通过 Zod 或 JSON Schema 定义输出格式：

```typescript
import { z } from 'zod'

const response = await agent.generate(
  '分析这段代码的质量',
  {
    output: z.object({
      score: z.number().min(0).max(100),
      issues: z.array(z.object({
        severity: z.enum(['high', 'medium', 'low']),
        description: z.string(),
        line: z.number().optional(),
      })),
      summary: z.string(),
    }),
  }
)

// response.object 是类型安全的
console.log(response.object.score)       // number
console.log(response.object.issues[0])   // { severity, description, line? }
```

**这个功能非常实用**，可以让 Agent 的输出直接对接你的业务逻辑，而不需要手动解析文本。

## 2.5 多模态能力

### 图片分析

Agent 可以分析图片内容：

```typescript
const response = await agent.generate([
  {
    role: 'user',
    content: [
      {
        type: 'image',
        image: 'https://example.com/chart.png',
        mimeType: 'image/png',
      },
      {
        type: 'text',
        text: '请描述这张图表的关键数据点',
      },
    ],
  },
])
```

## 2.6 maxSteps 与多步推理

`maxSteps` 控制 Agent 最多能执行多少轮"思考-工具调用-处理结果"的循环。默认值是 5。

```typescript
const response = await agent.generate('帮我分析最近7天的销售数据趋势', {
  maxSteps: 10,  // 允许更多轮的工具调用
})
```

**为什么需要这个？** 当 Agent 需要调用多个工具、或者需要根据前一步的结果决定下一步时，一轮调用是不够的。`maxSteps` 就是给 Agent 的"思考步数上限"。

你还可以用 `onStepFinish` 回调来监控每一步：

```typescript
const response = await agent.generate('复杂任务', {
  maxSteps: 10,
  onStepFinish: ({ text, toolCalls, toolResults, finishReason, usage }) => {
    console.log('完成一步:', { 
      text: text?.slice(0, 50), 
      toolCalls: toolCalls?.length,
      finishReason,
      tokens: usage,
    })
  },
})
```

## 2.7 RequestContext：请求级上下文

`RequestContext` 让你能根据请求的上下文动态调整 Agent 行为：

```typescript
export type UserTier = {
  'user-tier': 'enterprise' | 'pro'
}

export const myAgent = new Agent({
  id: 'context-agent',
  name: 'Context Agent',
  // 根据用户等级选择不同模型
  model: ({ requestContext }) => {
    const userTier = requestContext.get('user-tier') as UserTier['user-tier']
    return userTier === 'enterprise'
      ? 'openai/gpt-5'
      : 'openai/gpt-4.1-nano'
  },
})
```

这在多租户 SaaS 应用中特别有价值——不同等级的用户可以获得不同质量的服务。

## 2.8 Agent 的注册与引用

### 注册

把 Agent 注册到 Mastra 实例，让它能被全局访问：

```typescript
import { Mastra } from '@mastra/core'
import { myAgent } from './agents/my-agent'

export const mastra = new Mastra({
  agents: { myAgent },
})
```

### 引用

**始终通过 `mastra.getAgent()` 获取 Agent 引用**，而非直接 import：

```typescript
// ✅ 推荐：通过 Mastra 实例获取
const agent = mastra.getAgent('myAgent')

// ❌ 不推荐：直接 import
import { myAgent } from './agents/my-agent'
```

通过实例获取的好处：
- 自动注入共享资源（日志、遥测、存储）
- 能访问其他已注册的 Agent 和工具
- Studio 可以自动发现和管理

## 2.9 Agent 作为工具（Supervisor 模式）

Agent 可以被注册为另一个 Agent 的子代理，形成"主管-下属"模式：

```typescript
const researchAgent = new Agent({
  id: 'research-agent',
  name: 'Research Agent',
  description: '擅长信息检索和资料整理', // description 很重要，帮助父 Agent 决策
  instructions: '你是一个研究助手...',
  model: 'openai/gpt-4.1',
})

const writerAgent = new Agent({
  id: 'writer-agent',
  name: 'Writer Agent',
  description: '擅长把研究资料写成流畅的文章',
  instructions: '你是一个写作助手...',
  model: 'openai/gpt-4.1',
})

// 父 Agent（主管）
const supervisorAgent = new Agent({
  id: 'supervisor',
  name: 'Supervisor',
  instructions: '你负责协调研究和写作任务。先让研究员收集资料，再让写手撰写文章。',
  model: 'openai/gpt-5.1',
  agents: { researchAgent, writerAgent }, // 注册子代理
})
```

子代理会自动被转换为工具，命名规则为 `agent-<name>`。例如上面的例子中，主管可以调用 `agent-researchAgent` 和 `agent-writerAgent`。

## 2.10 本章小结

这一章我们深入了解了 Agent 的方方面面：

| 概念 | 要点 |
|------|------|
| 指令 | 支持字符串、数组、异步函数等多种格式 |
| 模型 | 使用 `provider/model` 格式，支持动态路由 |
| 输出 | generate（同步）和 stream（流式）两种模式 |
| 结构化输出 | 通过 Zod Schema 约束输出格式 |
| 多模态 | 支持图片分析等多模态输入 |
| maxSteps | 控制 Agent 的最大推理步数 |
| RequestContext | 请求级上下文，适合多租户场景 |
| Supervisor | Agent 间可以形成主管-下属的委托模式 |

下一章我们将学习 Tools（工具）和 MCP（模型上下文协议），这是让 Agent "动手做事"的关键。
