# 第六章：RAG 检索增强生成 —— 让 Agent 拥有知识库

## 6.1 什么是 RAG？

**RAG（Retrieval-Augmented Generation，检索增强生成）** 是让 AI Agent 使用**外部知识**的核心技术。

### 为什么需要 RAG？

LLM 有两个天然缺陷：

1. **知识截止日期**：训练数据有截止日期，不知道最新信息
2. **没有私有知识**：不了解你的公司文档、个人笔记、项目代码

**RAG 的解决方案：** 先搜索相关信息，再把搜到的内容塞给 LLM，LLM 基于这些信息回答。

```
传统 LLM：
  用户问题 → LLM（只用自己的知识）→ 回答（可能过时或编造）

RAG 增强：
  用户问题 → 搜索知识库 → 把搜到的内容 + 问题一起给 LLM → 准确的回答
```

### JS 开发者的类比

```javascript
// 没有 RAG：LLM 全靠"背诵"
function answer(question) {
  return llm.generateFromMemory(question); // 可能答错
}

// 有 RAG：先查文档，再回答
async function answerWithRAG(question) {
  const relevantDocs = await searchKnowledgeBase(question); // 先搜
  return llm.generateWithContext(question, relevantDocs);   // 再答
}
```

## 6.2 RAG 的完整流程

```
                    离线阶段（建立索引）
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ 原始文档 │─→│ 文本分块 │─→│ 生成向量 │─→│ 存入向量 │
│ PDF/MD/  │  │ Chunk    │  │ Embedding│  │ 数据库   │
│ 代码/... │  └──────────┘  └──────────┘  └──────────┘
└──────────┘

                    在线阶段（查询回答）
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐
│ 用户问题 │─→│ 生成向量 │─→│ 搜索相似 │─→│ 组合     │─→│LLM回答 │
└──────────┘  │ Embedding│  │ 文档片段 │  │ Prompt   │  └────────┘
              └──────────┘  └──────────┘  │ 上下文   │
                                          └──────────┘
```

## 6.3 核心概念详解

### 向量嵌入（Embedding）

Embedding 就是把文本变成一串数字（向量），使得**语义相近的文本在数学空间中距离更近**。

```javascript
// 文本 → 向量
"JavaScript 是一种编程语言" → [0.12, -0.34, 0.56, ..., 0.78]  // 1536维向量
"JS 是一门程序设计语言"     → [0.11, -0.33, 0.55, ..., 0.77]  // 非常相似！
"今天天气真不错"           → [0.89, 0.23, -0.67, ..., 0.12]  // 完全不同
```

用 OpenAI 生成 Embedding：

```javascript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small', // 便宜且好用
    input: text,
  });
  return response.data[0].embedding; // 返回 1536 维向量
}

const vec = await getEmbedding('JavaScript 是一种编程语言');
console.log(`向量维度: ${vec.length}`); // 1536
console.log(`前5个值: ${vec.slice(0, 5)}`);
```

### 向量相似度

用**余弦相似度**衡量两个向量有多"像"：

```javascript
// 余弦相似度计算
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 示例
const vec1 = await getEmbedding('如何用 JavaScript 写一个服务器？');
const vec2 = await getEmbedding('Node.js 创建 HTTP 服务的方法');
const vec3 = await getEmbedding('今天中午吃什么？');

console.log('vec1 vs vec2:', cosineSimilarity(vec1, vec2)); // ~0.85 很相似
console.log('vec1 vs vec3:', cosineSimilarity(vec1, vec3)); // ~0.15 不相似
```

### 文本分块（Chunking）

长文档需要切分成小块，每块单独生成向量：

```javascript
// 简单的文本分块器
function chunkText(text, options = {}) {
  const {
    chunkSize = 500,    // 每块大约 500 个字符
    overlap = 50,       // 相邻块重叠 50 个字符（保持上下文连贯）
  } = options;

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = start + chunkSize;
    
    // 尽量在句号、换行处断开，避免切断句子
    if (end < text.length) {
      const breakPoints = ['\n\n', '\n', '。', '. ', '！', '？'];
      for (const bp of breakPoints) {
        const idx = text.lastIndexOf(bp, end);
        if (idx > start + chunkSize * 0.5) {
          end = idx + bp.length;
          break;
        }
      }
    }

    chunks.push({
      text: text.slice(start, end).trim(),
      start,
      end,
    });

    start = end - overlap;
  }

  return chunks;
}

// 使用
const longText = `第一段很长的内容...。第二段内容...。第三段...。`;
const chunks = chunkText(longText, { chunkSize: 200, overlap: 30 });
console.log(`分成 ${chunks.length} 块`);
```

## 6.4 实战：从零构建一个 RAG 系统

### 项目结构

```
rag-demo/
├── package.json
├── ingest.mjs      # 步骤1：导入文档，建立索引
├── search.mjs      # 步骤2：搜索相关文档
├── rag-chat.mjs    # 步骤3：RAG 增强对话
├── vector-store.mjs # 简单的向量存储
└── docs/           # 你的知识库文档
    ├── js-basics.md
    └── node-guide.md
```

### 步骤一：向量存储（简单版本）

```javascript
// vector-store.mjs
import fs from 'fs/promises';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class SimpleVectorStore {
  constructor(storePath = './vector-store.json') {
    this.storePath = storePath;
    this.documents = []; // { id, text, embedding, metadata }
  }

  // 加载已有数据
  async load() {
    try {
      const data = await fs.readFile(this.storePath, 'utf-8');
      this.documents = JSON.parse(data);
      console.log(`已加载 ${this.documents.length} 条文档向量`);
    } catch {
      this.documents = [];
    }
  }

  // 保存到文件
  async save() {
    await fs.writeFile(this.storePath, JSON.stringify(this.documents));
    console.log(`已保存 ${this.documents.length} 条文档向量`);
  }

  // 生成 Embedding
  async getEmbedding(text) {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  }

  // 添加文档
  async addDocument(text, metadata = {}) {
    const embedding = await this.getEmbedding(text);
    this.documents.push({
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      text,
      embedding,
      metadata,
    });
  }

  // 批量添加
  async addDocuments(items) {
    // 批量生成 Embeddings（更高效）
    const texts = items.map(item => item.text);
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
    });

    for (let i = 0; i < items.length; i++) {
      this.documents.push({
        id: Date.now().toString() + i,
        text: items[i].text,
        embedding: response.data[i].embedding,
        metadata: items[i].metadata || {},
      });
    }
  }

  // 搜索最相似的文档
  async search(query, topK = 3) {
    const queryEmbedding = await this.getEmbedding(query);

    // 计算每个文档和查询的相似度
    const scored = this.documents.map(doc => ({
      ...doc,
      score: this.cosineSimilarity(queryEmbedding, doc.embedding),
    }));

    // 按相似度降序排列，取前 K 个
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ text, score, metadata }) => ({ text, score, metadata }));
  }

  cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export { SimpleVectorStore };
```

### 步骤二：导入文档

```javascript
// ingest.mjs — 将文档导入向量数据库
import fs from 'fs/promises';
import path from 'path';
import { SimpleVectorStore } from './vector-store.mjs';

// 文本分块
function chunkText(text, chunkSize = 500, overlap = 50) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    if (end < text.length) {
      const breakIdx = text.lastIndexOf('\n', end);
      if (breakIdx > start + chunkSize * 0.5) end = breakIdx;
    }
    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
  }
  return chunks.filter(c => c.length > 20); // 过滤太短的块
}

async function ingestDocs(docsDir) {
  const store = new SimpleVectorStore();
  
  // 读取所有 markdown 文件
  const files = await fs.readdir(docsDir);
  const mdFiles = files.filter(f => f.endsWith('.md'));
  
  for (const file of mdFiles) {
    console.log(`📄 处理: ${file}`);
    const content = await fs.readFile(path.join(docsDir, file), 'utf-8');
    const chunks = chunkText(content);
    
    console.log(`  分成 ${chunks.length} 块`);
    
    // 批量导入
    await store.addDocuments(
      chunks.map((text, index) => ({
        text,
        metadata: { source: file, chunkIndex: index },
      }))
    );
  }
  
  await store.save();
  console.log(`\n✅ 导入完成！共 ${store.documents.length} 个文档块`);
}

// 运行
await ingestDocs('./docs');
```

### 步骤三：RAG 对话

```javascript
// rag-chat.mjs — RAG 增强的对话系统
import OpenAI from 'openai';
import * as readline from 'readline';
import { SimpleVectorStore } from './vector-store.mjs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const store = new SimpleVectorStore();
await store.load();

async function ragChat(question) {
  // 第一步：检索相关文档
  console.log('🔍 搜索相关知识...');
  const results = await store.search(question, 3);
  
  // 第二步：构造带上下文的 Prompt
  const context = results
    .map((r, i) => `[文档${i + 1}] (相关度: ${(r.score * 100).toFixed(1)}%, 来源: ${r.metadata.source})\n${r.text}`)
    .join('\n\n');

  const messages = [
    {
      role: 'system',
      content: `你是一个知识库问答助手。根据提供的参考文档回答用户问题。

规则：
- 优先使用参考文档中的信息回答
- 如果文档中没有相关信息，诚实说明"在知识库中未找到相关信息"
- 引用来源时标注文档编号
- 不要编造文档中没有的信息`
    },
    {
      role: 'user',
      content: `参考文档：
${context}

---
用户问题：${question}`
    }
  ];

  // 第三步：LLM 生成回答
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    temperature: 0,
  });

  return {
    answer: response.choices[0].message.content,
    sources: results.map(r => ({
      source: r.metadata.source,
      score: r.score,
      preview: r.text.substring(0, 100) + '...',
    })),
  };
}

// 交互式对话
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask() {
  rl.question('\n你的问题: ', async (q) => {
    if (q === 'exit') { rl.close(); return; }
    
    const { answer, sources } = await ragChat(q);
    console.log(`\n💬 回答: ${answer}`);
    console.log('\n📚 参考来源:');
    sources.forEach(s => console.log(`  - ${s.source} (相关度: ${(s.score * 100).toFixed(1)}%)`));
    
    ask();
  });
}

console.log('RAG 知识库问答（输入 exit 退出）');
ask();
```

## 6.5 使用专业向量数据库

上面的 `SimpleVectorStore` 只适合学习，实际项目建议使用专业向量数据库：

### 方案一：Chroma（推荐入门）

```bash
npm install chromadb
```

```javascript
// chroma-rag.mjs
import { ChromaClient } from 'chromadb';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const chroma = new ChromaClient();

// 创建集合
const collection = await chroma.getOrCreateCollection({
  name: 'my-knowledge-base',
});

// 添加文档
async function addDocs(texts, metadatas) {
  // 生成 Embeddings
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
  });
  
  await collection.add({
    ids: texts.map((_, i) => `doc_${Date.now()}_${i}`),
    documents: texts,
    embeddings: response.data.map(d => d.embedding),
    metadatas,
  });
}

// 搜索
async function search(query, topK = 3) {
  const queryEmb = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  });

  return collection.query({
    queryEmbeddings: [queryEmb.data[0].embedding],
    nResults: topK,
  });
}
```

### 方案二：使用 SQLite + 向量扩展（适合 Electron）

对于 Electron 桌面应用，使用本地数据库是最佳选择：

```bash
npm install better-sqlite3
# 或使用支持向量的 sqlite-vss
```

```javascript
// 对于 Electron 应用，可以把向量存在 SQLite 中
// 这样数据完全在本地，无需外部数据库服务

import Database from 'better-sqlite3';

const db = new Database('knowledge.db');

// 创建表
db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    embedding BLOB NOT NULL,
    source TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 存储向量（将 Float64Array 序列化为 Buffer）
function storeEmbedding(text, embedding, source) {
  const buffer = Buffer.from(new Float64Array(embedding).buffer);
  db.prepare('INSERT INTO documents (text, embedding, source) VALUES (?, ?, ?)')
    .run(text, buffer, source);
}

// 读取向量并计算相似度
function searchSimilar(queryEmbedding, topK = 3) {
  const rows = db.prepare('SELECT id, text, embedding, source FROM documents').all();
  
  return rows
    .map(row => {
      const embedding = Array.from(new Float64Array(row.embedding.buffer));
      return {
        text: row.text,
        source: row.source,
        score: cosineSimilarity(queryEmbedding, embedding),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
```

## 6.6 RAG 优化技巧

### 技巧一：混合搜索（关键词 + 语义）

```javascript
// 纯语义搜索可能遗漏精确匹配
// 混合搜索 = 关键词搜索 + 向量搜索

async function hybridSearch(query, topK = 5) {
  // 1. 语义搜索
  const semanticResults = await store.search(query, topK);
  
  // 2. 关键词搜索
  const keywords = query.split(/\s+/);
  const keywordResults = store.documents
    .map(doc => ({
      ...doc,
      keywordScore: keywords.filter(kw => 
        doc.text.toLowerCase().includes(kw.toLowerCase())
      ).length / keywords.length,
    }))
    .filter(d => d.keywordScore > 0)
    .sort((a, b) => b.keywordScore - a.keywordScore)
    .slice(0, topK);
  
  // 3. 合并去重，综合排序
  const merged = new Map();
  
  semanticResults.forEach((r, i) => {
    merged.set(r.text, {
      ...r,
      semanticRank: i,
      finalScore: r.score * 0.7, // 语义权重 70%
    });
  });
  
  keywordResults.forEach((r, i) => {
    const existing = merged.get(r.text);
    if (existing) {
      existing.finalScore += r.keywordScore * 0.3; // 关键词权重 30%
    } else {
      merged.set(r.text, {
        text: r.text,
        metadata: r.metadata,
        finalScore: r.keywordScore * 0.3,
      });
    }
  });
  
  return [...merged.values()]
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, topK);
}
```

### 技巧二：Query 重写

用户的问题可能不够精确，先让 LLM 改写为更好的搜索查询：

```javascript
async function rewriteQuery(originalQuery) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: '将用户问题改写为更适合搜索知识库的查询。输出 3 个不同角度的搜索查询，每行一个。只输出查询，不要其他内容。'
      },
      { role: 'user', content: originalQuery }
    ],
  });
  
  return response.choices[0].message.content.split('\n').filter(q => q.trim());
}

// "React 怎么优化性能？" → [
//   "React 性能优化最佳实践",
//   "React useMemo useCallback 使用方法",
//   "React 组件重渲染优化"
// ]
```

### 技巧三：分块策略优化

```javascript
// 按 Markdown 标题分块（适合文档）
function chunkByHeading(markdown) {
  const chunks = [];
  const sections = markdown.split(/^(#{1,3}\s+.+)$/m);
  
  let currentHeading = '';
  let currentContent = '';
  
  for (const section of sections) {
    if (/^#{1,3}\s+/.test(section)) {
      if (currentContent.trim()) {
        chunks.push({
          text: `${currentHeading}\n${currentContent}`.trim(),
          heading: currentHeading,
        });
      }
      currentHeading = section;
      currentContent = '';
    } else {
      currentContent += section;
    }
  }
  
  if (currentContent.trim()) {
    chunks.push({
      text: `${currentHeading}\n${currentContent}`.trim(),
      heading: currentHeading,
    });
  }
  
  return chunks;
}

// 按代码块分块（适合代码文件）
function chunkByFunction(code) {
  // 简单的函数分块（实际项目可用 AST 解析）
  const functionPattern = /(?:function\s+\w+|const\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>))[^}]*\}/gs;
  const chunks = [];
  let match;
  
  while ((match = functionPattern.exec(code)) !== null) {
    chunks.push({ text: match[0], type: 'function' });
  }
  
  return chunks;
}
```

## 6.7 RAG 在 Agent 中的集成

将 RAG 作为 Agent 的一个工具来使用：

```javascript
// 将 RAG 搜索注册为 Agent 工具
const ragTool = {
  type: 'function',
  function: {
    name: 'search_knowledge_base',
    description: '在知识库中搜索相关信息。当用户问到项目文档、API、最佳实践等问题时使用。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索查询，尽可能具体和明确',
        },
        topK: {
          type: 'number',
          description: '返回的最大结果数，默认 3',
        },
      },
      required: ['query'],
    },
  },
};

// Agent 在需要知识时会自动调用这个工具
// 这比把所有文档都塞进 Context 更高效、更便宜
```

## 6.8 小结

本章你学到了：

- ✅ RAG 的核心思想：先检索相关知识，再让 LLM 回答
- ✅ 向量嵌入（Embedding）和相似度搜索
- ✅ 文本分块策略
- ✅ 从零构建一个完整的 RAG 系统
- ✅ 专业向量数据库的使用（Chroma、SQLite）
- ✅ RAG 优化技巧：混合搜索、Query 重写、分块策略
- ✅ RAG 与 Agent 的集成

### 练习

1. 把你最常用的几个技术文档导入 RAG 系统，测试问答效果
2. 尝试不同的分块大小（200/500/1000），比较搜索质量
3. 实现 Query 重写功能，对比效果差异

**下一章**我们将学习 Agent 的记忆系统，让你的 Agent 记住用户偏好和历史交互。
