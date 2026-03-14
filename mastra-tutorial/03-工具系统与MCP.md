# 第三章 工具系统与 MCP

## 3.1 为什么 Agent 需要工具

LLM 本身只能生成文本。当你需要它做这些事的时候，就需要工具：
- 查询实时天气、股价、新闻
- 调用内部 API 或数据库
- 执行计算、文件操作
- 与第三方服务交互

**工具的本质是：给 Agent 提供一个有明确输入输出的函数，让它在推理过程中自主决定何时调用。**

## 3.2 创建自定义工具

### 基本结构

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

export const weatherTool = createTool({
  id: 'weather-tool',
  description: '获取指定城市的当前天气信息', // 描述很关键，LLM 靠它决定是否调用
  inputSchema: z.object({
    location: z.string().describe('城市名称，如"北京"'),
  }),
  outputSchema: z.object({
    weather: z.string(),
  }),
  execute: async (inputData) => {
    const { location } = inputData
    const response = await fetch(
      `https://wttr.in/${encodeURIComponent(location)}?format=3`
    )
    const weather = await response.text()
    return { weather }
  },
})
```

**工具设计的黄金法则：**
1. `description` 要简洁精准——LLM 靠它判断何时调用
2. `inputSchema` 的字段名要有语义——`location` 比 `param1` 好得多
3. 一个工具只做一件事——宁可多建几个工具，也别做成"瑞士军刀"

### 工具输出的"模型视图"

有时候你的工具返回的数据很丰富（给前端展示用），但模型只需要看到其中一部分。用 `toModelOutput` 解决：

```typescript
export const weatherTool = createTool({
  id: 'weather-tool',
  description: '获取天气信息',
  inputSchema: z.object({ location: z.string() }),
  outputSchema: z.object({
    location: z.string(),
    temperature: z.string(),
    condition: z.string(),
    weatherIconUrl: z.string(),
    source: z.any(), // 完整的原始数据
  }),
  execute: async ({ location }) => {
    const response = await fetch(`https://wttr.in/${location}?format=j1`)
    const data = await response.json()
    return {
      location,
      temperature: data.current_condition[0].temp_C,
      condition: data.current_condition[0].weatherDesc[0].value,
      weatherIconUrl: data.current_condition[0].weatherIconUrl[0].value,
      source: data, // 完整数据保留给应用层
    }
  },
  // 只给模型看摘要信息，避免浪费 token
  toModelOutput: (output) => ({
    type: 'content',
    value: [
      { type: 'text', text: `${output.location}: ${output.temperature}°C, ${output.condition}` },
      { type: 'image-url', url: output.weatherIconUrl },
    ],
  }),
})
```

> **我的理解**：`toModelOutput` 是一个巧妙的设计。现实中工具返回的数据往往很大（比如一个 API 返回的完整 JSON），但模型的上下文窗口很宝贵。通过 `toModelOutput`，你可以把"给前端展示的数据"和"给模型理解的数据"分开，既省 token 又不丢信息。

## 3.3 将工具绑定到 Agent

```typescript
import { Agent } from '@mastra/core/agent'
import { weatherTool } from '../tools/weather-tool'
import { calculatorTool } from '../tools/calculator-tool'

export const assistantAgent = new Agent({
  id: 'assistant',
  name: 'Smart Assistant',
  instructions: `
    你是一个智能助手，可以查询天气和做数学计算。
    当用户问天气相关问题时，使用 weatherTool。
    当用户问数学问题时，使用 calculatorTool。
  `,
  model: 'openai/gpt-4.1',
  tools: { weatherTool, calculatorTool }, // 绑定多个工具
})
```

**Agent 如何决定调用哪个工具？** 它根据以下信息做判断：
1. 工具的 `description`
2. 工具的 `inputSchema`（参数名和描述）
3. Agent 自身的 `instructions`
4. 用户的输入

所以，好的工具描述和 Agent 指令是工具被正确调用的关键。

## 3.4 工作流作为工具

Workflow 也可以被注册为 Agent 的工具：

```typescript
import { createWorkflow } from '@mastra/core/workflows'

export const researchWorkflow = createWorkflow({
  id: 'research-workflow',
  description: '搜集指定主题的信息并生成摘要报告', // 必须要有 description
  inputSchema: z.object({ topic: z.string() }),
  outputSchema: z.object({ summary: z.string(), sources: z.array(z.string()) }),
})
  .then(searchStep)
  .then(summarizeStep)
  .commit()

// Agent 中使用
const agent = new Agent({
  id: 'research-agent',
  instructions: '你是一个研究助手，使用研究工作流来收集信息。',
  model: 'openai/gpt-4.1',
  tools: { weatherTool },
  workflows: { researchWorkflow }, // 工作流也能当工具用
})
```

工作流被调用后，Agent 会收到一个包含 `result` 和 `runId` 的响应，可以用来追踪执行状态。

## 3.5 toolName 的命名规则

在流式响应中，工具名是由你注册时的 key 决定的：

```typescript
// 方式1：用变量名作 key
tools: { weatherTool }        // → toolName: "weatherTool"

// 方式2：用工具 id 作 key
tools: { [weatherTool.id]: weatherTool }  // → toolName: "weather-tool"

// 方式3：自定义 key
tools: { 'my-weather': weatherTool }      // → toolName: "my-weather"

// 子代理和工作流的命名规则
agents: { weather: weatherAgent }          // → toolName: "agent-weather"
workflows: { research: researchWorkflow }  // → toolName: "workflow-research"
```

## 3.6 MCP：模型上下文协议

### MCP 是什么

MCP（Model Context Protocol）是一个开放标准，可以理解为"AI 工具的 USB-C 接口"。有了它，Agent 可以连接任何支持 MCP 的服务，不管那个服务是用什么语言写的。

Mastra 对 MCP 的支持分两个方向：
- **MCPClient**：让你的 Agent 使用别人的 MCP 服务（消费者）
- **MCPServer**：让你的 Agent 和工具暴露为 MCP 服务（提供者）

### 安装

```bash
npm install @mastra/mcp@latest
```

### MCPClient：连接外部 MCP 服务

```typescript
import { MCPClient } from '@mastra/mcp'

export const mcpClient = new MCPClient({
  id: 'my-mcp-client',
  servers: {
    // 方式1：本地 npx 包
    wikipedia: {
      command: 'npx',
      args: ['-y', 'wikipedia-mcp'],
    },
    // 方式2：远程 HTTP 服务
    weather: {
      url: new URL(
        `https://server.smithery.ai/@smithery-ai/national-weather-service/mcp?api_key=${process.env.SMITHERY_API_KEY}`
      ),
    },
  },
})
```

### 在 Agent 中使用 MCP 工具

```typescript
import { Agent } from '@mastra/core/agent'
import { mcpClient } from '../mcp/my-mcp-client'

export const mcpAgent = new Agent({
  id: 'mcp-agent',
  name: 'MCP Agent',
  instructions: `
    你是一个信息助手，可以访问以下 MCP 服务：
    - Wikipedia：查询百科知识
    - 天气服务：查询美国天气
    用这些工具来回答用户的问题。
  `,
  model: 'openai/gpt-4.1',
  tools: await mcpClient.listTools(), // 一行代码加载所有 MCP 工具
})
```

### 静态 vs 动态工具

| 场景 | 方法 | 适用情况 |
|------|------|---------|
| 单用户/固定配置 | `listTools()` | CLI 工具、内部服务 |
| 多用户/动态配置 | `listToolsets()` | SaaS 应用，每个用户有不同 API key |

动态工具示例（多租户场景）：

```typescript
async function handleRequest(userPrompt: string, userApiKey: string) {
  // 每个请求创建独立的 MCP 客户端
  const userMcp = new MCPClient({
    servers: {
      weather: {
        url: new URL('http://localhost:8080/mcp'),
        requestInit: {
          headers: { Authorization: `Bearer ${userApiKey}` },
        },
      },
    },
  })

  const agent = mastra.getAgent('myAgent')
  const response = await agent.generate(userPrompt, {
    toolsets: await userMcp.listToolsets(), // 在 generate 时传入
  })

  await userMcp.disconnect() // 用完断开
  return response.text
}
```

### MCPServer：暴露你的服务

反过来，你也可以让自己的 Agent 和工具通过 MCP 协议被外部系统访问：

```typescript
import { MCPServer } from '@mastra/mcp'
import { myAgent } from '../agents/my-agent'
import { myTool } from '../tools/my-tool'
import { myWorkflow } from '../workflows/my-workflow'

export const mcpServer = new MCPServer({
  id: 'my-mcp-server',
  name: 'My AI Server',
  version: '1.0.0',
  agents: { myAgent },
  tools: { myTool },
  workflows: { myWorkflow },
})
```

注册到 Mastra 实例：

```typescript
import { Mastra } from '@mastra/core/mastra'
import { mcpServer } from './mcp/my-mcp-server'

export const mastra = new Mastra({
  mcpServers: { mcpServer },
})
```

### MCP 注册中心

MCP 服务可以通过注册中心发现和连接。Mastra 支持多个主流注册中心：
- **Klavis AI**：企业级认证
- **mcp.run**：通用注册中心
- **Composio.dev**：API 集成平台
- **Smithery.ai**：社区 MCP 集合

## 3.7 工具设计最佳实践

基于实际使用经验，总结几条工具设计原则：

1. **每个工具职责单一**：不要做"万能工具"，把查询天气和计算温度分成两个工具
2. **描述要面向 LLM**：写描述时想象你在给一个聪明但没有背景知识的实习生解释这个工具做什么
3. **输入参数用语义化命名**：`cityName` 比 `param` 好，`startDate` 比 `d1` 好
4. **用 `.describe()` 补充说明**：`z.string().describe('ISO 格式的日期，如 2024-01-15')` 
5. **合理使用 `toModelOutput`**：当工具返回大量数据时，只给模型看摘要
6. **错误处理要友好**：返回有意义的错误信息，而不是 throw 一个模糊的异常

## 3.8 本章小结

| 概念 | 关键要点 |
|------|---------|
| createTool | 用 Zod 定义输入输出 Schema，description 是灵魂 |
| toModelOutput | 分离"给应用的数据"和"给模型的数据" |
| Agent + Tools | 通过 tools 属性绑定，Agent 自主决策调用 |
| Workflow as Tool | 工作流也能当工具用，命名规则为 `workflow-<key>` |
| MCPClient | 连接外部 MCP 服务，`listTools()` / `listToolsets()` 两种模式 |
| MCPServer | 把自己的 Agent/工具暴露为 MCP 服务 |

下一章我们将学习 Workflow（工作流），这是 Mastra 中最强大但也最有深度的功能。
