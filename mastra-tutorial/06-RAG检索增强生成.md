# 第六章 RAG 检索增强生成

## 6.1 RAG 解决什么问题

LLM 的知识有两个天然缺陷：
1. **知识截止**：训练数据有截止日期，不知道最新发生的事
2. **缺乏专有知识**：不了解你公司的内部文档、产品手册、代码库

RAG（Retrieval-Augmented Generation）的策略很简单：**先从你的数据源中检索相关信息，然后把检索结果作为上下文传给 LLM，让它基于你的数据生成回答。**

Mastra 的 RAG 系统提供了完整的工具链：文档处理 → 向量化 → 存储 → 检索。

## 6.2 RAG 流程全览

```
文档 → 分块(Chunk) → 向量化(Embed) → 存储(Store) → 查询(Query)

具体步骤：
1. 加载文档（文本、PDF、网页等）
2. 把文档切分成小块（chunking）
3. 用嵌入模型把每个块转换为向量
4. 存入向量数据库
5. 查询时，把用户问题也向量化
6. 找到最相似的文档块
7. 把这些块作为上下文传给 LLM
```

## 6.3 文档处理

### 创建文档

```typescript
import { MDocument } from '@mastra/rag'

// 从文本创建
const doc = MDocument.fromText(`
  Mastra 是一个 TypeScript AI 框架...
  它支持 Agent、Workflow、Tools 等核心功能...
`)

// 也可以从其他格式创建
// MDocument.fromPDF(...)
// MDocument.fromHTML(...)
```

### 分块策略

```typescript
const chunks = await doc.chunk({
  strategy: 'recursive',  // 递归分块（推荐）
  size: 512,              // 每个块的最大 token 数
  overlap: 50,            // 相邻块之间重叠的 token 数
})
```

**为什么需要分块？** 因为：
- 嵌入模型通常有输入长度限制
- 较小的块能提供更精确的检索结果
- 重叠（overlap）确保不会在块边界处丢失重要上下文

**分块策略选择：**
| 策略 | 说明 | 适用场景 |
|------|------|---------|
| `recursive` | 递归分割，尽量保持语义完整 | 通用文本（推荐默认） |
| `sliding-window` | 固定窗口滑动 | 需要均匀块大小时 || `character` | 按字符数分割 | 简单场景 |
| `token` | 按 token 数分割 | 精确控制块的 token 长度 |
| `markdown` | 按 Markdown 标题/段落分割 | Markdown 文档 |
| `html` | 按 HTML 标签分割 | 网页内容 |
## 6.4 向量化（Embedding）

```typescript
import { embedMany } from 'ai'
import { ModelRouterEmbeddingModel } from '@mastra/core/llm'

const { embeddings } = await embedMany({
  values: chunks.map(chunk => chunk.text),
  model: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
})
```

> **嵌入模型选择建议**：
> - `text-embedding-3-small`：性价比最高，适合大多数场景
> - `text-embedding-3-large`：精度更高，适合对质量要求极高的场景
> - 选型时关注：维度数、性能、价格三个指标

## 6.5 向量存储

Mastra 支持多种向量数据库：

```typescript
// PostgreSQL + pgvector
import { PgVector } from '@mastra/pg'
const pgVector = new PgVector({
  id: 'pg-vector',
  connectionString: process.env.POSTGRES_CONNECTION_STRING,
})

// 存入向量
await pgVector.upsert({
  indexName: 'my-embeddings',
  vectors: embeddings,
})
```

**支持的向量数据库：**
- **PgVector**：PostgreSQL 扩展，适合已有 PG 基础设施
- **Pinecone**：全托管向量数据库，适合大规模场景
- **Qdrant**：高性能开源向量数据库
- **MongoDB Atlas**：MongoDB 内置向量搜索

### Pinecone

```typescript
import { PineconeVector } from '@mastra/pinecone'

const pinecone = new PineconeVector({
  id: 'pinecone-store',
  apiKey: process.env.PINECONE_API_KEY!,
})

// 创建索引
await pinecone.createIndex({
  indexName: 'my-docs',
  dimension: 1536, // 必须与嵌入模型维度一致
  metric: 'cosine',
})

// 存入向量
await pinecone.upsert({
  indexName: 'my-docs',
  vectors: embeddings,
  metadata: chunks.map(c => ({ text: c.text, source: 'tutorial.md' })),
})

// 查询（支持 namespace 隔离）
const results = await pinecone.query({
  indexName: 'my-docs',
  queryVector: queryEmbedding,
  topK: 5,
  namespace: 'production', // 可选：命名空间隔离
})
```

### Qdrant

```typescript
import { QdrantVector } from '@mastra/qdrant'

const qdrant = new QdrantVector({
  url: 'http://localhost:6333',       // Qdrant 实例地址
  apiKey: process.env.QDRANT_API_KEY, // 云版需要
  https: false,                        // 本地开发用 false
})

await qdrant.createIndex({
  indexName: 'my-docs',
  dimension: 1536,
  metric: 'cosine',
})

await qdrant.upsert({
  indexName: 'my-docs',
  vectors: embeddings,
  metadata: chunks.map(c => ({ text: c.text })),
})

const results = await qdrant.query({
  indexName: 'my-docs',
  queryVector: queryEmbedding,
  topK: 5,
  filter: { source: 'tutorial.md' }, // 元数据过滤
})
```

### MongoDB Atlas

> 注意：必须使用 MongoDB Atlas 托管服务，本地 MongoDB 不支持向量搜索。

```typescript
import { MongoDBVector } from '@mastra/mongodb'

const mongoVector = new MongoDBVector({
  id: 'mongodb-vector',
  uri: process.env.MONGODB_URI!,
  dbName: process.env.MONGODB_DATABASE!,
})

await mongoVector.createIndex({
  indexName: 'my-docs',
  dimension: 1536,
  metric: 'cosine',
})

await mongoVector.upsert({
  indexName: 'my-docs',
  vectors: embeddings,
  metadata: chunks.map(c => ({ text: c.text })),
})

const results = await mongoVector.query({
  indexName: 'my-docs',
  queryVector: queryEmbedding,
  topK: 5,
  minScore: 0.7, // 最低相似度阈值
})

// 用完记得断开连接
await mongoVector.disconnect()
```

### 向量库选型参考

| 向量库 | 部署方式 | 特色 | 适用场景 |
|---------|---------|------|--------|
| PgVector | 自管/云 | PG 生态集成 | 已有 PostgreSQL 的项目 |
| Pinecone | 全托管 | Namespace、Hybrid Search | 大规模、无运维能力 |
| Qdrant | 自管/云 | 命名向量、Payload 索引 | 高性能需求 |
| MongoDB Atlas | 托管 | 和业务数据同库 | 已用 MongoDB 的项目 |

## 6.6 查询检索

```typescript
// 1. 把用户问题转为向量
import { embed } from 'ai'

const { embedding: queryVector } = await embed({
  value: '什么是 Mastra 的工作流？',
  model: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
})

// 2. 在向量数据库中查找最相似的块
const results = await pgVector.query({
  indexName: 'my-embeddings',
  queryVector,
  topK: 3,  // 返回最相似的 3 个块
})

console.log('匹配的文档块:', results)
```

## 6.7 完整 RAG 示例

把前面的步骤串起来：

```typescript
import { MDocument } from '@mastra/rag'
import { embedMany, embed } from 'ai'
import { PgVector } from '@mastra/pg'
import { ModelRouterEmbeddingModel } from '@mastra/core/llm'
import { Agent } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

// ========================
// 1. 离线：索引文档
// ========================

const doc = MDocument.fromText('你的文档内容...')
const chunks = await doc.chunk({ strategy: 'recursive', size: 512, overlap: 50 })

const embeddingModel = new ModelRouterEmbeddingModel('openai/text-embedding-3-small')
const { embeddings } = await embedMany({
  values: chunks.map(c => c.text),
  model: embeddingModel,
})

const pgVector = new PgVector({
  id: 'pg-vector',
  connectionString: process.env.POSTGRES_CONNECTION_STRING,
})

await pgVector.upsert({ indexName: 'docs', vectors: embeddings })

// ========================
// 2. 在线：创建 RAG 工具
// ========================

const ragTool = createTool({
  id: 'search-docs',
  description: '从知识库中搜索相关文档',
  inputSchema: z.object({
    query: z.string().describe('搜索查询'),
  }),
  outputSchema: z.object({
    results: z.array(z.string()),
  }),
  execute: async ({ query }) => {
    const { embedding } = await embed({
      value: query,
      model: embeddingModel,
    })
    const results = await pgVector.query({
      indexName: 'docs',
      queryVector: embedding,
      topK: 3,
    })
    return {
      results: results.map(r => r.text),
    }
  },
})

// ========================
// 3. 创建 RAG Agent
// ========================

const ragAgent = new Agent({
  id: 'rag-agent',
  name: 'Knowledge Agent',
  instructions: `
    你是一个知识库助手。
    当用户提问时，先使用 search-docs 工具搜索相关文档，
    然后基于搜索结果回答问题。
    如果搜索结果中没有相关信息，如实告知用户。
    不要编造不在搜索结果中的信息。
  `,
  model: 'openai/gpt-4.1',
  tools: { ragTool },
})
```

## 6.8 RAG 优化建议

基于实践经验，几个关键优化点：

### 分块质量
- **块大小**：太大则检索不精确，太小则丢失上下文。512 token 是个好起点
- **重叠**：50-100 token 的重叠可以避免在块边界丢失关键信息
- **元数据**：给每个块附加元数据（来源文件、章节、日期），方便过滤

### 检索质量
- **topK 不要太大**：返回太多结果会稀释相关性，3-5 通常够用
- **hybrid search**：结合关键词搜索和向量搜索，效果更好
- **re-ranking**：先检索多个结果，再用模型重新排序

### 提示词工程
- 明确告诉 Agent "只基于检索结果回答"
- 让 Agent 在答案中标注信息来源
- 告诉 Agent 如果找不到答案就说"不知道"，而不是编造

## 6.9 本章小结

| 环节 | Mastra 工具 | 说明 |
|------|------------|------|
| 文档加载 | `MDocument` | 支持文本、PDF 等格式 |
| 分块 | `doc.chunk()` | recursive、sliding-window 策略 |
| 向量化 | `embedMany()` / `embed()` | 通过模型路由支持多提供商 |
| 存储 | `PgVector` / `Pinecone` 等 | 多种向量数据库 |
| 检索 | `vector.query()` | topK 相似度查询 |

**核心理念**：RAG 不是一个独立功能，而是 Agent + Tool + Vector DB 的组合使用模式。你创建一个"搜索知识库"的工具，绑定到 Agent 上，Agent 就具备了基于你自己数据回答问题的能力。

下一章我们将学习语音能力，让 Agent 能说会听。
