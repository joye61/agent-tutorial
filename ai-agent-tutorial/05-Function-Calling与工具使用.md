# 第五章：Function Calling 与工具使用 —— 让 Agent 真正"动手做事"

## 5.1 什么是 Function Calling？

Function Calling（函数调用）是让 LLM 能够**调用外部函数/工具**的关键能力。

简单理解：

> 你告诉 LLM "这里有一些工具可以用"，LLM 会根据用户需求**自己决定**何时调用哪个工具、传什么参数。

```
没有 Function Calling:
  用户: "北京天气怎么样？"
  LLM: "我无法获取实时天气，建议你上网查查。"

有 Function Calling:
  用户: "北京天气怎么样？"
  LLM: (思考) 我应该调用 get_weather 工具
  LLM → 调用 get_weather({ city: "北京" })
  工具返回: { temp: 25, weather: "晴" }
  LLM: "北京今天天气晴朗，气温 25°C。"
```

## 5.2 Function Calling 的工作流程

```
┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐
│ 用户   │───→│ LLM    │───→│ 你的   │───→│ LLM    │───→│ 用户   │
│ 输入   │    │ 决策   │    │ 代码   │    │ 总结   │    │ 输出   │
└────────┘    └────────┘    └────────┘    └────────┘    └────────┘
              │                 │
         "我要调用          执行函数
         get_weather"       返回结果
```

关键点：**LLM 不会自己执行函数**，它只是告诉你"我想调用这个函数，参数是这些"，真正执行函数的是你的代码。

## 5.3 实战：OpenAI Function Calling

### 基础示例：天气查询 Agent

```javascript
// function-calling.mjs
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ===== 第一步：定义工具 =====

// 工具的实际实现（你的业务代码）
const toolImplementations = {
  get_weather: async ({ city }) => {
    // 实际项目中这里调用真实的天气 API
    // 这里用模拟数据演示
    const mockData = {
      '北京': { temp: 25, weather: '晴', humidity: 40 },
      '上海': { temp: 28, weather: '多云', humidity: 65 },
      '深圳': { temp: 32, weather: '阵雨', humidity: 80 },
    };
    return mockData[city] || { error: `未找到 ${city} 的天气数据` };
  },

  get_time: async ({ timezone }) => {
    return {
      time: new Date().toLocaleString('zh-CN', { timeZone: timezone || 'Asia/Shanghai' }),
      timezone: timezone || 'Asia/Shanghai',
    };
  },

  calculate: async ({ expression }) => {
    // 安全计算：只允许数字和基本运算符
    const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '');
    if (sanitized !== expression) {
      return { error: '表达式包含非法字符' };
    }
    try {
      const result = Function(`"use strict"; return (${sanitized})`)();
      return { expression, result };
    } catch {
      return { error: '计算错误' };
    }
  },
};

// 工具的描述（告诉 LLM 有哪些工具可用，也就是 JSON Schema ）
const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '获取指定城市的当前天气信息',
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: '城市名称，如"北京"、"上海"',
          },
        },
        required: ['city'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_time',
      description: '获取当前时间',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: '时区，如 "Asia/Shanghai"、"America/New_York"',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: '计算数学表达式',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: '数学表达式，如 "2 + 3 * 4"',
          },
        },
        required: ['expression'],
      },
    },
  },
];

// ===== 第二步：Agent 主循环 =====

async function agent(userMessage) {
  const messages = [
    { role: 'system', content: '你是一个有用的助手，可以使用工具来帮助用户。' },
    { role: 'user', content: userMessage },
  ];

  // Agent 循环
  while (true) {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      tools: toolDefinitions,
      temperature: 0,
    });

    const message = response.choices[0].message;
    messages.push(message);

    // 检查是否需要调用工具
    if (message.tool_calls) {
      console.log(`🔧 LLM 决定调用 ${message.tool_calls.length} 个工具：`);

      // 执行每个工具调用
      for (const toolCall of message.tool_calls) {
        const fnName = toolCall.function.name;
        const fnArgs = JSON.parse(toolCall.function.arguments);
        
        console.log(`  → ${fnName}(${JSON.stringify(fnArgs)})`);

        // 执行工具
        const fn = toolImplementations[fnName];
        const result = fn ? await fn(fnArgs) : { error: '工具不存在' };
        
        console.log(`  ← 结果:`, result);

        // 将工具结果反馈给 LLM
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
      // 继续循环，让 LLM 根据工具结果生成回复
    } else {
      // LLM 没有调用工具，返回最终回复
      return message.content;
    }
  }
}

// ===== 第三步：测试 =====

// 测试 1：需要调用一个工具
console.log('--- 测试 1 ---');
console.log(await agent('北京今天天气怎样？'));

// 测试 2：需要调用多个工具
console.log('\n--- 测试 2 ---');
console.log(await agent('北京和上海哪个更热？'));

// 测试 3：工具组合使用
console.log('\n--- 测试 3 ---');
console.log(await agent('现在几点了？如果温度和小时数相乘，北京的结果是多少？'));
```

### 运行效果

```
--- 测试 1 ---
🔧 LLM 决定调用 1 个工具：
  → get_weather({"city":"北京"})
  ← 结果: { temp: 25, weather: '晴', humidity: 40 }
北京今天天气晴朗，气温 25°C，湿度 40%，非常适合外出。

--- 测试 2 ---
🔧 LLM 决定调用 2 个工具：
  → get_weather({"city":"北京"})
  ← 结果: { temp: 25, weather: '晴', humidity: 40 }
  → get_weather({"city":"上海"})
  ← 结果: { temp: 28, weather: '多云', humidity: 65 }
上海更热。上海 28°C，北京 25°C，上海比北京高 3°C。
```

> 注意 LLM 在测试 2 中**并行调用了两个工具**（一次返回两个 tool_calls），这是 OpenAI API 的特性。

## 5.4 并行 Function Calling

LLM 可以在一次响应中返回多个 tool_calls，表示这些工具可以**并行执行**：

```javascript
// 并行执行工具调用，提升性能
async function executeToolCallsInParallel(toolCalls) {
  const results = await Promise.all(
    toolCalls.map(async (toolCall) => {
      const fnName = toolCall.function.name;
      const fnArgs = JSON.parse(toolCall.function.arguments);
      const fn = toolImplementations[fnName];
      
      const result = fn ? await fn(fnArgs) : { error: '工具不存在' };
      
      return {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      };
    })
  );
  
  return results;
}
```

## 5.5 设计好用的 Tool（工具设计原则）

### 原则一：工具描述要清晰

LLM 通过 `description` 来理解工具用途。描述越清晰，LLM 调用越准确。

```javascript
// ❌ 模糊的描述
{
  name: 'search',
  description: '搜索',
}

// ✅ 清晰的描述
{
  name: 'search_docs',
  description: '在项目文档中搜索内容。输入关键词，返回匹配的文档片段和所在文件路径。适合查找 API 文档、配置说明等。',
}
```

### 原则二：参数描述要完整

```javascript
// ❌ 缺少描述
parameters: {
  type: 'object',
  properties: {
    q: { type: 'string' },
    n: { type: 'number' },
  },
}

// ✅ 每个参数都有描述和约束
parameters: {
  type: 'object',
  properties: {
    query: { 
      type: 'string', 
      description: '搜索关键词，支持空格分隔多个关键词' 
    },
    maxResults: { 
      type: 'number', 
      description: '返回的最大结果数量，默认 5，最大 20',
      minimum: 1,
      maximum: 20,
    },
  },
  required: ['query'],
}
```

### 原则三：工具职责单一

```javascript
// ❌ 一个工具做太多事
{
  name: 'file_manager',
  description: '读取、写入、删除、重命名文件',
}

// ✅ 每个工具职责清晰
{ name: 'read_file', description: '读取指定文件的内容' },
{ name: 'write_file', description: '将内容写入指定文件（覆盖已有内容）' },
{ name: 'delete_file', description: '删除指定文件' },
{ name: 'rename_file', description: '重命名文件' },
```

### 原则四：返回有用的错误信息

```javascript
const toolImplementations = {
  read_file: async ({ path }) => {
    try {
      const content = await fs.readFile(path, 'utf-8');
      return { success: true, content };
    } catch (err) {
      if (err.code === 'ENOENT') {
        return { success: false, error: `文件不存在: ${path}` };
      }
      if (err.code === 'EACCES') {
        return { success: false, error: `没有权限读取: ${path}` };
      }
      return { success: false, error: `读取失败: ${err.message}` };
    }
  },
};
```

## 5.6 构建实用工具集

以下是一个 Electron Agent 应用常用的工具集：

```javascript
// tools/index.mjs
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const agentTools = {
  // 文件操作
  read_file: {
    description: '读取文件内容',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件的绝对路径或相对路径' },
      },
      required: ['path'],
    },
    execute: async ({ path }) => {
      const content = await fs.readFile(path, 'utf-8');
      return { content };
    },
  },

  write_file: {
    description: '写入内容到文件（会覆盖已有内容）',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        content: { type: 'string', description: '要写入的内容' },
      },
      required: ['path', 'content'],
    },
    execute: async ({ path, content }) => {
      await fs.writeFile(path, content, 'utf-8');
      return { success: true, path };
    },
  },

  list_directory: {
    description: '列出目录下的所有文件和文件夹',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '目录路径' },
      },
      required: ['path'],
    },
    execute: async ({ path }) => {
      const entries = await fs.readdir(path, { withFileTypes: true });
      return {
        items: entries.map(e => ({
          name: e.name,
          type: e.isDirectory() ? 'directory' : 'file',
        })),
      };
    },
  },

  // 命令执行（注意安全！）
  run_command: {
    description: '在终端中执行命令。仅用于安全的只读命令，如 ls、cat、git status 等',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的终端命令' },
      },
      required: ['command'],
    },
    execute: async ({ command }) => {
      // 安全检查：禁止危险命令
      const dangerousPatterns = [
        /rm\s+(-rf?|--force)/i,
        /del\s+\/[sf]/i,
        /format\s/i,
        /mkfs/i,
        /dd\s+if=/i,
        />\s*\/dev\//i,
      ];
      
      if (dangerousPatterns.some(p => p.test(command))) {
        return { error: '拒绝执行危险命令' };
      }

      try {
        const { stdout, stderr } = await execAsync(command, { timeout: 30000 });
        return { stdout, stderr };
      } catch (err) {
        return { error: err.message };
      }
    },
  },

  // 网络请求
  fetch_url: {
    description: '发送 HTTP GET 请求获取网页或 API 数据',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL 地址' },
      },
      required: ['url'],
    },
    execute: async ({ url }) => {
      // URL 验证
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return { error: '仅支持 http/https 协议' };
        }
      } catch {
        return { error: '无效的 URL' };
      }

      const response = await fetch(url);
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/json')) {
        return { data: await response.json() };
      }
      
      const text = await response.text();
      // 截断过长内容
      return { 
        data: text.length > 5000 ? text.substring(0, 5000) + '...(已截断)' : text 
      };
    },
  },
};
```

## 5.7 MCP：工具调用的标准化协议

**MCP（Model Context Protocol）** 是 Anthropic 在 2024 年底发布的开放协议，目的是标准化 AI Agent 与外部工具/数据源的连接方式。

### 为什么需要 MCP？

```
之前的问题：
  每个 Agent 框架 × 每种工具 = N × M 种集成方式 😱

有了 MCP：
  Agent ←→ MCP 协议 ←→ 工具
  所有 Agent 和工具都说"同一种语言" ✅
```

### MCP 的基本概念

```
┌─────────────┐      MCP 协议      ┌─────────────┐
│  MCP Client  │ ←──────────────→  │  MCP Server  │
│  (你的 Agent) │    JSON-RPC       │  (工具提供方) │
└─────────────┘                    └─────────────┘
```

- **MCP Client**：你的 Agent 应用，消费工具
- **MCP Server**：提供工具的服务，如文件系统、数据库、GitHub 等
- **通信协议**：基于 JSON-RPC 2.0

### 用 TypeScript 创建一个 MCP Server

```bash
npm install @modelcontextprotocol/sdk
```

```javascript
// mcp-server.mjs — 一个简单的 MCP Server 示例
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
  name: 'my-tools',
  version: '1.0.0',
});

// 注册工具
server.tool(
  'get_weather',
  '获取指定城市的天气信息',
  {
    city: { type: 'string', description: '城市名称' },
  },
  async ({ city }) => {
    // 实际调用天气 API
    const mockWeather = { city, temp: 25, weather: '晴' };
    return {
      content: [{ type: 'text', text: JSON.stringify(mockWeather) }],
    };
  }
);

server.tool(
  'search_notes',
  '搜索用户的笔记',
  {
    query: { type: 'string', description: '搜索关键词' },
  },
  async ({ query }) => {
    // 搜索笔记数据库
    return {
      content: [{ type: 'text', text: `搜索 "${query}" 的结果...` }],
    };
  }
);

// 启动
const transport = new StdioServerTransport();
await server.connect(transport);
```

### 用 MCP Client 连接

```javascript
// mcp-client.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['mcp-server.mjs'],
});

const client = new Client({ name: 'my-agent', version: '1.0.0' });
await client.connect(transport);

// 列出可用工具
const tools = await client.listTools();
console.log('可用工具:', tools);

// 调用工具
const result = await client.callTool({
  name: 'get_weather',
  arguments: { city: '北京' },
});
console.log('结果:', result);
```

> 💡 MCP 已经有大量现成的 Server 可用：文件系统、GitHub、Google Drive、Slack、数据库等。你的 Electron 应用可以直接接入这些工具。

## 5.8 tool_choice：控制工具调用行为

你可以控制 LLM 是否以及如何使用工具：

```javascript
// 让 LLM 自行决定是否使用工具（默认）
{ tool_choice: 'auto' }

// 强制不使用任何工具
{ tool_choice: 'none' }

// 强制使用某个特定工具
{ tool_choice: { type: 'function', function: { name: 'get_weather' } } }

// 强制必须调用工具（但不限定哪个）
{ tool_choice: 'required' }
```

实际应用场景：

```javascript
// 场景：第一轮强制使用分类工具，后续自行决定
const firstResponse = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages,
  tools: toolDefinitions,
  tool_choice: { type: 'function', function: { name: 'classify_intent' } },
});

// 后续轮次
const nextResponse = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages,
  tools: toolDefinitions,
  tool_choice: 'auto', // 让 LLM 自行决定
});
```

## 5.9 安全注意事项

### 1. 工具执行沙箱化

```javascript
// ❌ 危险：直接执行用户输入的命令
execute: async ({ command }) => {
  return execAsync(command);
}

// ✅ 安全：白名单 + 参数校验
const ALLOWED_COMMANDS = ['ls', 'cat', 'head', 'tail', 'wc', 'grep', 'find', 'git'];

execute: async ({ command }) => {
  const baseCommand = command.split(/\s+/)[0];
  if (!ALLOWED_COMMANDS.includes(baseCommand)) {
    return { error: `不允许执行命令: ${baseCommand}` };
  }
  // 还需要检查命令注入（管道、分号等）
  if (/[;&|`$]/.test(command)) {
    return { error: '命令中包含非法字符' };
  }
  return execAsync(command, { timeout: 10000 });
}
```

### 2. 文件操作限制路径

```javascript
import path from 'path';

const ALLOWED_BASE_DIR = '/home/user/workspace';

execute: async ({ filePath }) => {
  const resolved = path.resolve(filePath);
  // 防止路径穿越攻击
  if (!resolved.startsWith(ALLOWED_BASE_DIR)) {
    return { error: '访问路径超出允许范围' };
  }
  return fs.readFile(resolved, 'utf-8');
}
```

### 3. 网络请求限制

```javascript
execute: async ({ url }) => {
  const parsed = new URL(url);
  // 禁止访问内网
  if (['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname)) {
    return { error: '不允许访问本地地址' };
  }
  // 禁止非 HTTP(S) 协议
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { error: '仅支持 HTTP/HTTPS' };
  }
  // ... 执行请求
}
```

## 5.10 A2A：Agent 间通信的标准化协议

如果说 MCP 解决了 **Agent ↔ 工具** 的连接问题，那么 **A2A（Agent-to-Agent Protocol）** 解决的是 **Agent ↔ Agent** 的通信问题。

### MCP vs A2A

```
MCP（Model Context Protocol）：
  Agent ←→ 工具/数据源
  类比：USB-C 接口（连接外设）
  发起方：Anthropic

A2A（Agent-to-Agent Protocol）：
  Agent ←→ Agent
  类比：网络协议（设备间通信）
  发起方：Google（已加入 Linux 基金会）
```

两者**互补而非竞争**，共同构成 Agent 互操作的完整协议体系。

### A2A 核心概念

```
┌─────────────┐      A2A 协议       ┌─────────────┐
│  Agent A     │ ←───────────────→  │  Agent B     │
│  (客户端)    │   JSON-RPC 2.0     │  (服务端)    │
└─────────────┘    over HTTP(S)     └─────────────┘
```

A2A 的关键特性：
- **Agent Card（名片）**：每个 Agent 公开一个 JSON 描述文件，声明自己的能力、支持的交互方式
- **标准化通信**：基于 JSON-RPC 2.0 over HTTP(S)
- **灵活交互**：支持同步请求/响应、SSE 流式、异步推送通知
- **不透明协作**：Agent 无需暴露内部状态、记忆或工具实现

```javascript
// A2A Agent Card 示例
const agentCard = {
  name: 'code-review-agent',
  description: '代码审查专家，可以审查代码质量并给出改进建议',
  url: 'https://my-agent.example.com/a2a',
  version: '1.0.0',
  capabilities: {
    streaming: true,
    pushNotifications: false,
  },
  skills: [
    {
      id: 'review-code',
      name: '代码审查',
      description: '审查代码质量、安全性和性能',
      tags: ['code', 'review', 'quality'],
    },
  ],
};
```

```javascript
// 通过 A2A 调用远程 Agent（概念示例）
// npm install @a2a-js/sdk

import { A2AClient } from '@a2a-js/sdk';

const client = new A2AClient('https://code-review-agent.example.com/a2a');

// 发送任务给远程 Agent
const task = await client.sendMessage({
  message: {
    role: 'user',
    parts: [{ type: 'text', text: '请审查以下代码：\n```js\nfunction add(a, b) { return a + b; }\n```' }],
  },
});

console.log(task.status); // 'completed'
console.log(task.artifacts); // Agent 返回的审查结果
```

> 💡 **A2A 于 2026 年 3 月发布 v1.0 正式版**，已有 Python/Go/JS/Java/.NET SDK。当你构建多 Agent 系统、特别是跨组织协作场景时，A2A 是标准化通信的首选方案。

## 5.11 小结

本章你掌握了：

- ✅ Function Calling 的原理：LLM 决策 + 你的代码执行
- ✅ OpenAI Function Calling 完整实现
- ✅ 并行工具调用
- ✅ 工具设计四大原则：清晰描述、完整参数、职责单一、友好错误
- ✅ 构建实用工具集
- ✅ MCP 协议入门（Agent ↔ 工具标准化）
- ✅ A2A 协议入门（Agent ↔ Agent 标准化）
- ✅ tool_choice 控制
- ✅ 安全最佳实践

### 练习

1. 为你的 Agent 添加一个"搜索文件内容"工具（read_file + 正则搜索）
2. 实现一个简单的 MCP Server，提供自定义工具
3. 为所有工具添加安全检查和错误处理

**下一章**我们将学习 RAG（检索增强生成），让你的 Agent 拥有自己的知识库。
