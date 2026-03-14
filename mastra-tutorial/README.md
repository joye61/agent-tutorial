# Mastra 中文教程

> 基于 Mastra v1.10.0 编写，一份面向中文开发者的系统性教程。

## 这是什么？

[Mastra](https://mastra.ai) 是由 Gatsby 团队打造的 TypeScript AI 应用开发框架，提供了 Agent、Workflow、Tools、MCP、Memory、RAG、Voice、Evals 等完整能力。本教程从零开始，系统性地讲解 Mastra 的核心概念和实战用法。

## 适合谁？

- 想用 TypeScript 构建 AI 应用的开发者
- 了解大语言模型基本概念，想动手做项目的人
- 已经在用 LangChain/CrewAI 等框架，想了解 Mastra 差异化优势的开发者

## 目录

### 基础篇

| 章节 | 内容 | 你将学到 |
|------|------|---------|
| [01-Mastra概述与快速上手](01-Mastra概述与快速上手.md) | 框架介绍、架构、环境搭建 | 5 分钟跑起第一个 Agent |
| [02-Agent深度解析](02-Agent深度解析.md) | Agent 配置、生成、流式、结构化输出 | 掌握 Agent 的全部能力 |
| [03-工具系统与MCP](03-工具系统与MCP.md) | Tool 创建、MCP 客户端/服务端 | 让 Agent 与外部世界交互 |
| [04-Workflow工作流引擎](04-Workflow工作流引擎.md) | 控制流、状态、暂停恢复、嵌套 | 编排复杂的多步骤流程 |

### 进阶篇

| 章节 | 内容 | 你将学到 |
|------|------|---------|
| [05-Memory记忆系统](05-Memory记忆系统.md) | 四种记忆类型、存储适配器、Working Memory | 让 Agent 具备长期记忆 |
| [06-RAG检索增强生成](06-RAG检索增强生成.md) | 文档处理、向量存储、检索查询 | 构建知识库驱动的 Agent |
| [07-语音能力](07-语音能力.md) | TTS/STT、实时语音、混合提供商 | 给 Agent 加上语音交互 |

### 生产篇

| 章节 | 内容 | 你将学到 |
|------|------|---------|
| [08-评估与可观测性](08-评估与可观测性.md) | 评分器、Live/Trace Evals、Tracing | 量化 Agent 质量并监控运行 |
| [09-部署与生产实践](09-部署与生产实践.md) | Server、云平台、Docker、生产清单 | 把应用稳定地跑在线上 |

## 阅读建议

- **从头开始**：如果你是 Mastra 新手，建议按顺序阅读 01-04
- **按需阅读**：05-07 是独立的功能模块，按需选读
- **上线必看**：08-09 是生产部署前的必读内容

## 环境要求

- Node.js >= 22.13.0
- TypeScript 项目
- 至少一个 LLM API Key（推荐 OpenAI）

## 快速开始

```bash
npm create mastra@latest
```

## 相关资源

- [Mastra 官方文档](https://mastra.ai/docs)
- [Mastra GitHub](https://github.com/mastra-ai/mastra)
- [Mastra Discord](https://discord.gg/mastra)
