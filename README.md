# AI智能体快速入门教程

> 面向前端 / JavaScript 开发者的 AI Agent 完整开发教程
>
> 从基础概念到框架实战，系统掌握 AI Agent 开发技能

## 教程概览

本项目包含两个循序渐进的子教程：

| 教程 | 简介 | 章节数 |
|------|------|--------|
| [AI Agent 开发教程](ai-agent-tutorial/) | 从零开始，系统讲解 AI Agent 核心概念、架构设计到 Electron 桌面应用实战 | 12 章 |
| [Mastra 中文教程](mastra-tutorial/) | 基于 Mastra v1.10.0，深入掌握这个 TypeScript AI 应用开发框架 | 9 章 |

## 完整目录

### 📘 AI Agent 开发教程

> 从零基础到构建 Electron 桌面 AI Agent 应用

| 章节 | 内容 | 难度 |
|------|------|------|
| [第 1 章：AI Agent 概述](ai-agent-tutorial/01-AI-Agent概述.md) | Agent 定义、核心组件、应用场景、环境搭建 | ⭐ |
| [第 2 章：大语言模型基础](ai-agent-tutorial/02-大语言模型基础.md) | LLM 概念、API 调用、流式输出、多轮对话 | ⭐ |
| [第 3 章：提示词工程](ai-agent-tutorial/03-提示词工程.md) | 提示词技巧、ReAct 模式、System Prompt 设计 | ⭐⭐ |
| [第 4 章：Agent 核心架构](ai-agent-tutorial/04-Agent核心架构.md) | ReAct、Plan-and-Execute、Reflection 架构 | ⭐⭐ |
| [第 5 章：Function Calling 与工具使用](ai-agent-tutorial/05-Function-Calling与工具使用.md) | 工具定义、并行调用、MCP 协议 | ⭐⭐ |
| [第 6 章：RAG 检索增强生成](ai-agent-tutorial/06-RAG检索增强生成.md) | 向量检索、文本分块、RAG 完整实现 | ⭐⭐⭐ |
| [第 7 章：记忆与上下文管理](ai-agent-tutorial/07-记忆与上下文管理.md) | 短期/长期记忆、摘要压缩、Token 预算 | ⭐⭐⭐ |
| [第 8 章：多 Agent 协作](ai-agent-tutorial/08-多Agent协作.md) | 流水线、监督者、辩论、黑板架构 | ⭐⭐⭐ |
| [第 9 章：主流开发框架实战](ai-agent-tutorial/09-主流开发框架实战.md) | Vercel AI SDK、LangChain.js、框架选型 | ⭐⭐ |
| [第 10 章：Electron 与 Agent 实战](ai-agent-tutorial/10-Electron与Agent实战.md) | 完整的 SmartDesk AI 桌面应用 | ⭐⭐⭐ |
| [第 11 章：安全、部署与优化](ai-agent-tutorial/11-安全部署与优化.md) | 安全防护、性能优化、打包分发 | ⭐⭐⭐ |
| [第 12 章：前沿技术与资源](ai-agent-tutorial/12-前沿技术与资源.md) | Computer Use、MCP 生态、学习路线 | ⭐⭐ |

### 📗 Mastra 中文教程

> 基于 Mastra v1.10.0，面向中文开发者的系统性框架教程

**基础篇**

| 章节 | 内容 | 你将学到 |
|------|------|---------|
| [01-Mastra 概述与快速上手](mastra-tutorial/01-Mastra概述与快速上手.md) | 框架介绍、架构、环境搭建 | 5 分钟跑起第一个 Agent |
| [02-Agent 深度解析](mastra-tutorial/02-Agent深度解析.md) | Agent 配置、生成、流式、结构化输出 | 掌握 Agent 的全部能力 |
| [03-工具系统与 MCP](mastra-tutorial/03-工具系统与MCP.md) | Tool 创建、MCP 客户端/服务端 | 让 Agent 与外部世界交互 |
| [04-Workflow 工作流引擎](mastra-tutorial/04-Workflow工作流引擎.md) | 控制流、状态、暂停恢复、嵌套 | 编排复杂的多步骤流程 |

**进阶篇**

| 章节 | 内容 | 你将学到 |
|------|------|---------|
| [05-Memory 记忆系统](mastra-tutorial/05-Memory记忆系统.md) | 四种记忆类型、存储适配器、Working Memory | 让 Agent 具备长期记忆 |
| [06-RAG 检索增强生成](mastra-tutorial/06-RAG检索增强生成.md) | 文档处理、向量存储、检索查询 | 构建知识库驱动的 Agent |
| [07-语音能力](mastra-tutorial/07-语音能力.md) | TTS/STT、实时语音、混合提供商 | 给 Agent 加上语音交互 |

**生产篇**

| 章节 | 内容 | 你将学到 |
|------|------|---------|
| [08-评估与可观测性](mastra-tutorial/08-评估与可观测性.md) | 评分器、Live/Trace Evals、Tracing | 量化 Agent 质量并监控运行 |
| [09-部署与生产实践](mastra-tutorial/09-部署与生产实践.md) | Server、云平台、Docker、生产清单 | 把应用稳定地跑在线上 |

## 推荐学习路径

```
第一阶段（入门）  →  AI Agent 教程 第 1-3 章（概念 + LLM + 提示词）
第二阶段（核心）  →  AI Agent 教程 第 4-5 章（Agent 架构 + 工具调用）
第三阶段（进阶）  →  AI Agent 教程 第 6-8 章（RAG + 记忆 + 多 Agent）
第四阶段（框架）  →  Mastra 教程 第 1-4 章（掌握 Mastra 框架核心）
第五阶段（深入）  →  Mastra 教程 第 5-7 章（记忆 + RAG + 语音）
第六阶段（实战）  →  AI Agent 教程 第 9-10 章（框架选型 + Electron 应用）
第七阶段（生产）  →  AI Agent 教程 第 11-12 章 + Mastra 教程 第 8-9 章
```

## 技术栈

- **语言**：JavaScript / TypeScript / Node.js（ESM）
- **桌面框架**：Electron
- **AI 框架**：Mastra、Vercel AI SDK、OpenAI Agents SDK、LangChain.js
- **模型**：GPT-5、GPT-4o、Claude Opus 4.6、Claude Sonnet 4、Gemini 2.5、DeepSeek、Qwen、Ollama 本地模型
- **协议**：MCP（Model Context Protocol）、A2A（Agent-to-Agent Protocol）

## License

MIT
