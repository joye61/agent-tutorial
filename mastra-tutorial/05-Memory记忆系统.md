# 第五章 Memory 记忆系统

## 5.1 为什么 Agent 需要记忆

没有记忆的 Agent 就像一条金鱼——每次对话都从零开始。用户说"我叫小明"，下一轮就忘了。记忆系统解决的核心问题是：**让 Agent 在多轮对话和多次会话之间保持上下文连贯性。**

Mastra 提供了四种互补的记忆类型：

```
┌────────────────────────────────────────────────┐
│                 Memory 记忆系统                  │
│                                                  │
│  消息历史 ←→ 短期对话上下文                        │
│  观察记忆 ←→ 长期压缩记忆（替代消息历史增长）        │
│  工作记忆 ←→ 持久化的用户数据和偏好                 │
│  语义召回 ←→ 根据语义相似度检索历史信息              │
└────────────────────────────────────────────────┘
```

**我的理解**：这四种记忆对应了人类记忆的不同方面——消息历史是"刚才的对话"，观察记忆是"概括性回忆"，工作记忆是"你记住的关于某人的事实"，语义召回是"突然想起某个相关的事"。

## 5.2 前提：配置存储适配器

使用记忆之前，必须先配置存储适配器。Mastra 支持多种数据库：

```typescript
// PostgreSQL
import { PostgresStore } from '@mastra/pg'
const storage = new PostgresStore({
  id: 'pg-store',
  connectionString: process.env.DATABASE_URL,
})

// libSQL (SQLite 兼容，适合开发)
import { LibSQLStore } from '@mastra/libsql'
const storage = new LibSQLStore({
  id: 'libsql-store',
  url: 'file:./mastra.db',
})

// MongoDB
import { MongoDBStore } from '@mastra/mongodb'
const storage = new MongoDBStore({
  id: 'mongo-store',
  uri: process.env.MONGODB_URI,
})

// Upstash (Serverless Redis)
import { UpstashStore } from '@mastra/upstash'
const storage = new UpstashStore({
  id: 'upstash-store',
  url: process.env.UPSTASH_URL,
  token: process.env.UPSTASH_TOKEN,
})
```

存储可以在两个层级配置：

```typescript
// 实例级别：所有 Agent 共享
const mastra = new Mastra({
  storage: new LibSQLStore({ id: 'shared', url: 'file:./mastra.db' }),
  agents: { myAgent },
})

// Agent 级别：某个 Agent 专用
const agent = new Agent({
  id: 'my-agent',
  memory: new Memory({
    storage: new PostgresStore({ ... }), // 专属存储
  }),
})
```

## 5.3 消息历史（Message History）

最基础的记忆类型——保留最近的对话消息，让 Agent 知道"我们之前聊了什么"。

```typescript
import { Memory } from '@mastra/memory'

const memory = new Memory({
  options: {
    lastMessages: 20, // 保留最近 20 条消息（默认值也是合理的）
  },
})

const agent = new Agent({
  id: 'chat-agent',
  instructions: '你是一个友好的聊天助手。',
  model: 'openai/gpt-4.1',
  memory,
})

// 使用时需要指定 thread（对话线程）
const response = await agent.generate('你好，我叫小明', {
  memory: {
    thread: 'conversation-001',   // 对话标识
    resource: 'user-001',         // 用户标识
  },
})

// 后续对话中，Agent 能记住之前说的
const response2 = await agent.generate('你还记得我叫什么吗？', {
  memory: {
    thread: 'conversation-001',
    resource: 'user-001',
  },
})
// Agent 会回答：你叫小明
```

**thread 和 resource 的概念：**
- `thread`：一次对话的标识（类似聊天窗口）
- `resource`：用户的标识（一个用户可以有多个 thread）

## 5.4 观察记忆（Observational Memory）

> 需要 `@mastra/memory@1.1.0+`

这是 Mastra 最强大的创新特性。随着对话增长，消息历史会变得很大，占满上下文窗口，导致两个问题：
- **上下文腐化（Context Rot）**：历史消息越多，Agent 表现越差
- **上下文浪费（Context Waste）**：大量历史 token 其实已经不需要了

观察记忆的解决方案：用两个后台 Agent（Observer + Reflector）把原始消息压缩成"观察笔记"，保持上下文窗口小而精。

简单来说：**观察记忆 = 自动摘要 + 知识蒸馏。**

### 快速开始

```typescript
import { Memory } from '@mastra/memory'
import { Agent } from '@mastra/core/agent'

const agent = new Agent({
  name: 'my-agent',
  instructions: 'You are a helpful assistant.',
  model: 'openai/gpt-4.1',
  memory: new Memory({
    options: {
      observationalMemory: true, // 就这一行，默认用 google/gemini-2.5-flash
    },
  }),
})
```

### 自定义模型

```typescript
const memory = new Memory({
  options: {
    observationalMemory: {
      model: 'deepseek/deepseek-reasoner', // 指定观察者/反思者使用的模型
    },
  },
})
```

推荐使用上下文窗口 128K+ 且速度快的模型。已测试兼容的模型：
- `google/gemini-2.5-flash`（默认）
- `openai/gpt-5-mini`
- `anthropic/claude-haiku-4-5`
- `deepseek/deepseek-reasoner`

### 工作原理：三层记忆

```
┌─────────────────────────────────────────────────────┐
│ 1. 近期消息（Recent Messages）                        │
│    → 精确的当前对话记录                                │
├─────────────────────────────────────────────────────┤
│ 2. 观察笔记（Observations）                           │
│    → 当消息 token 超过阈值（默认 30K），Observer 把     │
│      消息压缩为简洁的观察笔记，压缩率 5~40 倍           │
├─────────────────────────────────────────────────────┤
│ 3. 反思（Reflections）                                │
│    → 当观察笔记超过阈值（默认 40K），Reflector 再次     │
│      浓缩，合并相关条目，提炼模式                       │
└─────────────────────────────────────────────────────┘
```

### 作用域（Scope）

```typescript
// thread scope（默认）：每个线程独立的观察记忆
const memory = new Memory({
  options: {
    observationalMemory: {
      model: 'google/gemini-2.5-flash',
      scope: 'thread',
    },
  },
})

// resource scope（实验性）：同一用户所有线程共享观察记忆
const memory = new Memory({
  options: {
    observationalMemory: {
      model: 'google/gemini-2.5-flash',
      scope: 'resource', // 跨对话记忆
    },
  },
})
```

### Token 预算配置

```typescript
const memory = new Memory({
  options: {
    observationalMemory: {
      model: 'google/gemini-2.5-flash',
      observation: {
        messageTokens: 30_000, // 消息超过 30K token 时触发 Observer（默认）
      },
      reflection: {
        observationTokens: 40_000, // 观察笔记超过 40K token 时触发 Reflector（默认）
      },
    },
  },
})
```

### 异步缓冲（Async Buffering）

默认开启。Observer 在后台预计算观察笔记，触发阈值时立即激活，Agent 无需暂停：

```typescript
const memory = new Memory({
  options: {
    observationalMemory: {
      model: 'google/gemini-2.5-flash',
      observation: {
        bufferTokens: 0.2,       // 每 20% 的 messageTokens 缓冲一次（默认）
        bufferActivation: 0.8,   // 激活时保留 20% 的消息历史
        blockAfter: 1.2,         // 安全阈值，1.2x 时强制同步观察
      },
    },
  },
})

// 关闭异步缓冲（改为同步触发）
const memory = new Memory({
  options: {
    observationalMemory: {
      model: 'google/gemini-2.5-flash',
      observation: {
        bufferTokens: false,
      },
    },
  },
})
```

### 存储适配器限制

观察记忆目前只支持 `@mastra/pg`、`@mastra/libsql` 和 `@mastra/mongodb` 三种存储适配器。

### 与其他记忆类型的对比

| 特性 | 观察记忆 | 消息历史 | 工作记忆 | 语义召回 |
|------|---------|---------|---------|--------|
| 核心作用 | 长期对话压缩 | 短期对话记录 | 结构化偏好存储 | 语义检索历史 |
| 上下文占用 | 低（高压缩率） | 高（原始消息） | 低（固定结构） | 中（按需检索） |
| 自动管理 | 全自动 | 需配置保留条数 | 半自动（Agent更新） | 自动 |
| 适用场景 | 长对话/长任务 | 短对话 | 用户信息 | 历史关联 |

**我的理解**：如果你的 Agent 经常有长对话（几十轮以上）或长时间任务（比如用 Playwright 自动化网页），观察记忆几乎是必选项。它在实际效果上可以替代消息历史 + 工作记忆的组合，而且成本更低、准确度更高。

## 5.5 工作记忆（Working Memory）

工作记忆是 Agent 的"便签本"——存储关于用户的持久化信息，如名字、偏好、目标等。

### 快速开始

```typescript
import { Memory } from '@mastra/memory'

const memory = new Memory({
  options: {
    workingMemory: {
      enabled: true,
    },
  },
})

const agent = new Agent({
  id: 'personal-assistant',
  name: 'PersonalAssistant',
  instructions: '你是一个贴心的个人助手。',
  model: 'openai/gpt-4.1',
  memory,
})
```

### 自定义模板

模板告诉 Agent 应该记住哪些信息：

```typescript
const memory = new Memory({
  options: {
    workingMemory: {
      enabled: true,
      template: `# 用户档案
## 个人信息
- 姓名:
- 位置:
- 时区:
## 偏好
- 沟通风格: [正式/随意]
- 项目目标:
- 关键截止日期:
  - [截止日期 1]: [日期]
## 会话状态
- 上次讨论的任务:
- 未解决的问题:
  - [问题 1]`,
    },
  },
})
```

**模板会随着对话自动更新。** 当用户说"我叫小明，在北京"，Agent 会自动把模板更新为：

```markdown
# 用户档案
## 个人信息
- 姓名: 小明
- 位置: 北京
- 时区:
...
```

### 结构化工作记忆（Schema 模式）

如果你需要更严格的数据结构，用 Zod Schema 替代模板：

```typescript
import { z } from 'zod'

const userProfileSchema = z.object({
  name: z.string().optional(),
  location: z.string().optional(),
  timezone: z.string().optional(),
  preferences: z.object({
    communicationStyle: z.string().optional(),
    projectGoal: z.string().optional(),
    deadlines: z.array(z.string()).optional(),
  }).optional(),
})

const memory = new Memory({
  options: {
    workingMemory: {
      enabled: true,
      schema: userProfileSchema, // 用 schema，不要同时设 template
    },
  },
})
```

Schema 模式使用**合并语义**（merge），Agent 只需要提供要更新的字段，其他字段自动保留：

```json
// 第一轮对话后
{ "name": "小明", "location": "北京" }

// 第二轮补充后（只更新了 timezone）
{ "name": "小明", "location": "北京", "timezone": "Asia/Shanghai" }
```

### 记忆持久化范围

| 范围 | 说明 | 适用场景 |
|------|------|---------|
| `resource`（默认） | 同一用户的所有对话共享 | 个人助手、客服 |
| `thread` | 每个对话线程独立 | 临时任务、互不相关的会话 |

```typescript
// 用户级别记忆（默认）
const memory = new Memory({
  options: {
    workingMemory: {
      enabled: true,
      scope: 'resource', // 同一用户的所有 thread 共享
    },
  },
})

// 线程级别记忆
const memory = new Memory({
  options: {
    workingMemory: {
      enabled: true,
      scope: 'thread', // 每个 thread 独立
    },
  },
})
```

### 编程式设置初始记忆

```typescript
// 创建线程时预设记忆
const thread = await memory.createThread({
  threadId: 'thread-123',
  resourceId: 'user-456',
  title: '初诊咨询',
  metadata: {
    workingMemory: `# 患者档案
- 姓名: 张三
- 血型: O+
- 过敏: 青霉素
- 当前用药: 无`,
  },
})

// 之后 Agent 生成回复时自动带上这些信息
await agent.generate('我的血型是什么？', {
  memory: { thread: thread.id, resource: 'user-456' },
})
// 回答：您的血型是 O+
```

### 只读工作记忆

某些场景下你要让 Agent 能看到记忆但不能修改：

```typescript
const response = await agent.generate('你了解我什么？', {
  memory: {
    thread: 'conversation-123',
    resource: 'user-456',
    options: {
      readOnly: true, // 只读，Agent 不会更新工作记忆
    },
  },
})
```

适用场景：路由 Agent、子 Agent（在多 Agent 系统中只需参考但不应修改记忆）。

## 5.6 语义召回（Semantic Recall）

语义召回基于语义相似度（而非关键词匹配）从历史消息中检索相关信息。

**类比**：消息历史是"翻阅最近的聊天记录"，语义召回是"突然想起三个月前聊过的相关话题"。

### 默认行为

语义召回**默认开启**。只要给 Agent 配了 Memory，就会自动启用：

```typescript
import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'

// 语义召回默认开启
const agent = new Agent({
  id: 'support-agent',
  name: 'SupportAgent',
  instructions: 'You are a helpful support agent.',
  model: 'openai/gpt-4.1',
  memory: new Memory(), // 自动使用 libSQL 作为默认存储和向量库
})
```

### 配置存储和向量库

```typescript
import { Memory } from '@mastra/memory'
import { Agent } from '@mastra/core/agent'
import { LibSQLStore, LibSQLVector } from '@mastra/libsql'

const agent = new Agent({
  memory: new Memory({
    storage: new LibSQLStore({
      id: 'agent-storage',
      url: 'file:./local.db',
    }),
    vector: new LibSQLVector({
      id: 'agent-vector',
      url: 'file:./local.db',
    }),
  }),
})
```

也可以用 PostgreSQL：

```typescript
import { PgStore, PgVector } from '@mastra/pg'

const agent = new Agent({
  memory: new Memory({
    storage: new PgStore({
      id: 'agent-storage',
      connectionString: process.env.DATABASE_URL,
    }),
    vector: new PgVector({
      id: 'agent-vector',
      connectionString: process.env.DATABASE_URL,
    }),
  }),
})
```

### 配置召回参数

```typescript
const agent = new Agent({
  memory: new Memory({
    options: {
      semanticRecall: {
        topK: 3,           // 检索 3 条最相似的消息（默认）
        messageRange: 2,   // 每条匹配结果包含前后 2 条消息作为上下文
        scope: 'resource', // 搜索范围：resource（跨线程）或 thread（仅当前线程）
      },
    },
  }),
})
```

### 配置嵌入模型

```typescript
import { Memory } from '@mastra/memory'
import { ModelRouterEmbeddingModel } from '@mastra/core/llm'

// 方式一：Model Router（推荐）
const memory = new Memory({
  embedder: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
})

// 方式二：本地嵌入（无需 API，离线可用）
import { fastembed } from '@mastra/fastembed'
const memory = new Memory({
  embedder: fastembed,
})
```

### 编程式调用 recall()

除了 Agent 自动使用，你也可以手动调用语义召回：

```typescript
const memory = await agent.getMemory()

// 按语义搜索历史消息
const { messages: relevantMessages } = await memory!.recall({
  threadId: 'thread-123',
  vectorSearchString: '我们之前讨论过的项目截止日期',
  threadConfig: {
    semanticRecall: true,
  },
})
```

### 禁用语义召回

如果你的场景不需要（比如短对话、实时语音），可以关闭以提升性能：

```typescript
const agent = new Agent({
  memory: new Memory({
    options: {
      semanticRecall: false, // 关闭语义召回
    },
  }),
})
```

### PostgreSQL 索引优化

大规模部署时，可以配置向量索引类型提升查询性能：

```typescript
const memory = new Memory({
  storage: new PgStore({ id: 'store', connectionString: process.env.DATABASE_URL }),
  vector: new PgVector({ id: 'vector', connectionString: process.env.DATABASE_URL }),
  options: {
    semanticRecall: {
      topK: 5,
      messageRange: 2,
      indexConfig: {
        type: 'hnsw',          // HNSW 比默认的 IVFFlat 性能更好
        metric: 'dotproduct',  // OpenAI 嵌入推荐用内积距离
        m: 16,                 // 双向链接数
        efConstruction: 64,    // 构建时的候选列表大小
      },
    },
  },
})
```

## 5.7 记忆处理器（Memory Processors）

当你启用 Memory 的各项功能时，Mastra 在底层自动创建对应的处理器来管理消息流：

| 配置项 | 自动创建的处理器 | 输入阶段 | 输出阶段 |
|-------|----------------|---------|--------|
| `lastMessages` | `MessageHistory` | 从存储加载历史消息 | 持久化新消息 |
| `semanticRecall` | `SemanticRecall` | 向量搜索匹配消息 | 为新消息创建嵌入 |
| `workingMemory` | `WorkingMemory` | 加载工作记忆状态 | — |

### 执行顺序

```
输入阶段: [Memory Processors] → [你的 inputProcessors]
输出阶段: [你的 outputProcessors] → [Memory Processors]
```

这意味着：
- 输入 Guardrail（防护栏）在记忆加载**之后**运行
- 输出 Guardrail 在记忆保存**之前**运行 —— 如果 Guardrail 调用 `abort()`，消息不会被持久化

### 手动控制

如果你手动添加了某个处理器到 `inputProcessors` 或 `outputProcessors`，Mastra 不会再自动添加同类处理器，给你完全的控制权：

```typescript
import { MessageHistory, TokenLimiter } from '@mastra/core/processors'
import { LibSQLStore } from '@mastra/libsql'

const customHistory = new MessageHistory({
  storage: new LibSQLStore({ id: 'store', url: 'file:memory.db' }),
  lastMessages: 20, // 自定义保留 20 条
})

const agent = new Agent({
  name: 'custom-agent',
  instructions: 'You are a helpful assistant.',
  model: 'openai/gpt-4.1',
  memory: new Memory({
    storage: new LibSQLStore({ id: 'store', url: 'file:memory.db' }),
    lastMessages: 10, // 这个会被忽略，因为你手动添加了 MessageHistory
  }),
  inputProcessors: [
    customHistory,                    // 你的自定义版本
    new TokenLimiter({ limit: 4000 }), // Token 限制器
  ],
})
```

## 5.8 调试记忆

在 Studio 中开启 tracing 后，你可以清楚看到每次请求中 Agent 实际使用了哪些记忆内容——包括消息历史和语义召回的结果。这对于理解 Agent 为什么作出某个决策非常有帮助。

## 5.9 模板 vs Schema：怎么选？

| 维度 | 模板（Markdown） | Schema（Zod） |
|------|-----------------|--------------|
| 数据格式 | 自由文本 | 结构化 JSON |
| 更新语义 | 替换（全量） | 合并（增量） |
| 类型安全 | 无 | 有 |
| 编程访问 | 需解析文本 | 直接访问字段 |
| 灵活性 | 高（可以存任何文本） | 中（受 Schema 约束） |
| 适用场景 | 用户画像、笔记 | 配置、偏好、结构化数据 |

> **个人建议**：如果你需要在代码中读写工作记忆的具体字段，用 Schema；如果只是让 Agent 自己管理，用模板就够了。

## 5.10 本章小结

| 记忆类型 | 核心用途 | 关键配置 |
|---------|---------|---------|
| 消息历史 | 保持当前对话的连贯性 | `lastMessages` |
| 观察记忆 | 压缩长期对话为摘要 | 后台 Observer/Reflector |
| 工作记忆 | 持久化用户信息和偏好 | `template` 或 `schema` |
| 语义召回 | 按语义检索历史信息 | 向量数据库 + 嵌入模型 |

**核心概念：**
- `thread`：对话线程标识
- `resource`：用户标识
- `scope`：记忆的持久化范围（resource / thread）

下一章我们将学习 RAG（检索增强生成），让 Agent 基于你自己的数据生成更准确的回答。
