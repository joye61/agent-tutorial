# AI Agent 开发教程

> 面向 JavaScript 开发者的 AI Agent 完整学习路径
> 
> 从零基础到构建 Electron 桌面 AI Agent 应用

## 适合谁

- 有 JavaScript / Node.js 基础
- 对 AI Agent 开发感兴趣
- 想在 Electron 桌面应用中集成 AI 能力

## 目录

| 章节 | 内容 | 难度 |
|------|------|------|
| [第 1 章：AI Agent 概述](01-AI-Agent概述.md) | Agent 定义、核心组件、应用场景、环境搭建 | ⭐ |
| [第 2 章：大语言模型基础](02-大语言模型基础.md) | LLM 概念、API 调用、流式输出、多轮对话 | ⭐ |
| [第 3 章：提示词工程](03-提示词工程.md) | 提示词技巧、ReAct 模式、System Prompt 设计 | ⭐⭐ |
| [第 4 章：Agent 核心架构](04-Agent核心架构.md) | ReAct、Plan-and-Execute、Reflection 架构 | ⭐⭐ |
| [第 5 章：Function Calling 与工具使用](05-Function-Calling与工具使用.md) | 工具定义、并行调用、MCP 协议 | ⭐⭐ |
| [第 6 章：RAG 检索增强生成](06-RAG检索增强生成.md) | 向量检索、文本分块、RAG 完整实现 | ⭐⭐⭐ |
| [第 7 章：记忆与上下文管理](07-记忆与上下文管理.md) | 短期/长期记忆、摘要压缩、Token 预算 | ⭐⭐⭐ |
| [第 8 章：多 Agent 协作](08-多Agent协作.md) | 流水线、监督者、辩论、黑板架构 | ⭐⭐⭐ |
| [第 9 章：主流开发框架实战](09-主流开发框架实战.md) | Vercel AI SDK、LangChain.js、框架选型 | ⭐⭐ |
| [第 10 章：Electron 与 Agent 实战](10-Electron与Agent实战.md) | 完整的 SmartDesk AI 桌面应用 | ⭐⭐⭐ |
| [第 11 章：安全、部署与优化](11-安全部署与优化.md) | 安全防护、性能优化、打包分发 | ⭐⭐⭐ |
| [第 12 章：前沿技术与资源](12-前沿技术与资源.md) | Computer Use、MCP 生态、学习路线 | ⭐⭐ |

## 技术栈

- **语言**：JavaScript / TypeScript / Node.js（ESM）
- **桌面框架**：Electron
- **AI 框架**：Mastra（首推）、Vercel AI SDK、OpenAI Agents SDK、LangChain.js
- **模型**：GPT-5、GPT-4o、Claude Opus 4.6、Claude Sonnet 4、Gemini 2.5、DeepSeek、Qwen、Ollama 本地模型
- **存储**：SQLite（better-sqlite3）
- **协议**：MCP（Model Context Protocol）、A2A（Agent-to-Agent Protocol）

## 快速开始

```bash
# 确保已安装 Node.js 20+
node -v

# 创建项目
mkdir my-agent && cd my-agent
npm init -y

# 安装核心依赖
npm install ai @ai-sdk/openai

# 设置 API Key
echo "OPENAI_API_KEY=your-key-here" > .env
```

然后从 [第 1 章](01-AI-Agent概述.md) 开始阅读。

## 推荐学习路径

```
入门    →  第1-3章（概念 + LLM + 提示词）
核心    →  第4-5章（Agent 架构 + 工具调用）
进阶    →  第6-8章（RAG + 记忆 + 多Agent）
实战    →  第9-10章（框架 + Electron 应用）
生产    →  第11-12章（安全优化 + 前沿技术）
```

---

*教程更新于 2026 年 3 月，基于最新的 AI Agent 技术栈编写，涵盖 GPT-5、Claude 4.6、Mastra、MCP + A2A 双协议体系。*
