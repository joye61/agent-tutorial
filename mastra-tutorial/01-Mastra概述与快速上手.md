# 第一章 Mastra 概述与快速上手

## 1.1 Mastra 是什么

Mastra 是一个基于 TypeScript 的 AI 应用开发框架，由 Gatsby 团队（没错，就是做 React 静态站点生成器的那群人）打造。它的核心目标是：**让开发者用熟悉的 TypeScript 技术栈，快速构建生产级别的 AI 应用和智能体（Agent）。**

简单来说，如果你会写 TypeScript，那么 Mastra 能帮你：
- 用几行代码创建一个能调用工具、具备记忆力的 AI Agent
- 用直观的链式语法编排复杂的多步骤工作流
- 通过 MCP 协议让你的 Agent 接入几乎任何外部服务
- 一键部署到 Vercel、Cloudflare 等云平台

### 为什么选 Mastra 而不是 LangChain / CrewAI？

| 对比维度 | Mastra | LangChain | CrewAI |
|---------|--------|-----------|--------|
| 语言 | TypeScript 原生 | Python 为主，JS 次之 | Python |
| 工作流 | 图引擎 + 链式 API（`.then()`, `.branch()`, `.parallel()`） | LCEL 管道 | 基于角色分工 |
| MCP 支持 | 原生内置（客户端 + 服务端） | 需要额外集成 | 无 |
| UI 调试 | 内置 Studio（开箱即用） | LangSmith（独立服务） | 无 |
| 前端集成 | React / Next.js 原生适配 | 需自行封装 | 需自行封装 |
| 内存管理 | 四种记忆类型（消息/观察/工作/语义） | 简单记忆管理 | 简单记忆管理 |
| 模型支持 | 600+ 模型统一路由 | 多提供商但接口不统一 | 依赖 LiteLLM |

**我的理解是：** Mastra 最大的差异化在于"TypeScript 原生"和"全家桶式"设计。如果你的技术栈是 JS/TS，或者你需要把 AI 能力嵌入到 React/Next.js 应用中，Mastra 几乎是目前最丝滑的选择。它不试图做一个大而全的抽象层，而是贴合 TS 开发者的思维习惯，提供了足够实用的工具集。

## 1.2 核心架构一览

Mastra 的架构可以用一张图来理解：

```
┌─────────────────────────────────────────────┐
│                 Mastra 实例                   │
│                                              │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐  │
│  │  Agent   │  │ Workflow  │  │   Tools    │  │
│  │ (智能体) │  │ (工作流)  │  │  (工具集)   │  │
│  └────┬─────┘  └────┬─────┘  └─────┬──────┘  │
│       │             │              │          │
│  ┌────┴─────────────┴──────────────┴──────┐  │
│  │            共享基础设施                    │  │
│  │  Memory · Storage · Vector · Logger    │  │
│  │  Observability · MCP · Scorers         │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

关键组件：
- **Agent（智能体）**：核心主角，接收指令、调用工具、生成回复
- **Workflow（工作流）**：当你需要精确控制每一步的执行顺序时使用
- **Tool（工具）**：Agent 的"手"，用来调用 API、查数据库等
- **Memory（记忆）**：让 Agent 记住对话历史、用户偏好
- **MCP（模型上下文协议）**：连接外部工具和服务的通用接口
- **Storage（存储）**：持久化状态和数据
- **Scorers（评估器）**：评测 Agent 输出质量

## 1.3 环境准备

### 系统要求
- Node.js v22.13.0 或更高版本
- 支持 npm / pnpm / yarn / bun 任意包管理器
- 运行时支持：Node.js、Bun、Deno、Cloudflare Workers

### 获取 API Key

Mastra 支持 40+ 模型提供商的 600+ 模型。最常用的：
- **OpenAI**：设置 `OPENAI_API_KEY`
- **Anthropic**：设置 `ANTHROPIC_API_KEY`
- **Google Gemini**：设置 `GOOGLE_GENERATIVE_AI_API_KEY`

> 💡 如果你没有偏好，用 OpenAI 的 key 入门即可。

## 1.4 创建第一个 Mastra 项目

### 方式一：CLI 快速创建（推荐）

```bash
npm create mastra@latest
```

运行后会引导你选择：
1. 模型提供商（如 OpenAI）
2. 输入对应的 API Key
3. 是否使用示例代码

完成后会生成如下项目结构：

```
my-mastra-app/
├── src/
│   └── mastra/
│       ├── index.ts                  # Mastra 实例入口
│       ├── agents/
│       │   └── weather-agent.ts      # 示例 Agent
│       ├── tools/
│       │   └── weather-tool.ts       # 示例工具
│       ├── workflows/
│       │   └── weather-workflow.ts   # 示例工作流
│       └── scorers/
│           └── weather-scorer.ts     # 示例评估器
├── .env                              # 环境变量
└── package.json
```

### 方式二：手动安装到现有项目

```bash
# 安装核心包
npm install @mastra/core@latest

# 创建 .env 文件
echo "OPENAI_API_KEY=your-key-here" > .env
```

### 方式三：集成到现有框架

Mastra 原生支持集成到以下框架：
- Next.js
- React (Vite)
- Astro
- Express
- SvelteKit
- Hono

## 1.5 启动 Studio 调试

创建项目后，启动开发服务器：

```bash
npm run dev
```

然后打开浏览器访问 `http://localhost:4111/`，你会看到 Mastra Studio：

Studio 提供了以下功能：
- **Agents 面板**：直接与 Agent 对话，动态切换模型，调节 temperature 等参数
- **Workflows 面板**：可视化工作流图谱，逐步执行并观察数据流
- **Tools 面板**：独立测试工具，检查输入输出
- **MCP 面板**：查看已连接的 MCP 服务器及其工具
- **Observability 面板**：查看调用链路追踪（traces），了解每一步的耗时和数据
- **Scorers 面板**：运行评估器，量化 Agent 的输出质量

> **个人建议**：Studio 是 Mastra 区别于其他框架的一大杀手锏。在开发初期，不需要写前端 UI，直接在 Studio 里调试 Agent 和工作流，效率极高。

## 1.6 Hello World：你的第一个 Agent

让我们从零开始写一个最简单的 Agent：

```typescript
// src/mastra/agents/hello-agent.ts
import { Agent } from '@mastra/core/agent'

export const helloAgent = new Agent({
  id: 'hello-agent',
  name: 'Hello Agent',
  instructions: '你是一个友好的中文助手，用简洁幽默的方式回答问题。',
  model: 'openai/gpt-4.1-nano', // 使用便宜快速的模型即可
})
```

注册到 Mastra 实例：

```typescript
// src/mastra/index.ts
import { Mastra } from '@mastra/core'
import { helloAgent } from './agents/hello-agent'

export const mastra = new Mastra({
  agents: { helloAgent },
})
```

在代码中使用：

```typescript
// 获取 Agent 引用（推荐通过 mastra 实例获取）
const agent = mastra.getAgent('helloAgent')

// 生成回复
const response = await agent.generate('用一句话解释什么是 TypeScript')
console.log(response.text)

// 流式输出
const stream = await agent.stream('给我讲个程序员笑话')
for await (const chunk of stream.textStream) {
  process.stdout.write(chunk)
}
```

**关键点解读：**
- `id`：Agent 的唯一标识，用于日志追踪和 API 路由
- `instructions`：系统提示词，定义 Agent 的行为和人格
- `model`：使用 `provider/model-name` 格式，Mastra 内置了统一的模型路由
- `mastra.getAgent()`：优于直接 import，因为能获取到 Mastra 实例的共享资源（日志、遥测、存储等）

## 1.7 本章小结

这一章我们了解了：
- Mastra 是 TypeScript 原生的 AI 应用框架，特别适合 JS/TS 开发者
- 它采用"全家桶"设计，Agent + Workflow + Tools + Memory 一体化
- 通过 CLI 可以秒级创建项目，Studio 提供开箱即用的调试环境
- 一个基本的 Agent 只需要 `id`、`instructions`、`model` 三个配置

下一章我们将深入 Agent 的能力，包括工具调用、结构化输出、多模态支持等。
