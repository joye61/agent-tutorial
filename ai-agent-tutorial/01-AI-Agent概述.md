# 第一章：AI Agent 概述 —— 从零认识智能体

## 1.1 什么是 AI Agent？

**一句话理解：** AI Agent（智能体）就是一个能**自主思考、做决策、执行动作**的 AI 程序。

你可以把它想象成一个"超级实习生"：

| 普通聊天 AI | AI Agent |
|---|---|
| 你问一句，它答一句 | 你给一个目标，它自己拆分步骤去完成 |
| 只能聊天 | 能调用工具、读写文件、搜索网页、操作数据库…… |
| 没有记忆 | 有记忆系统，能记住之前的对话和任务状态 |
| 被动响应 | 主动规划，遇到问题会自行调整策略 |

### 举个例子

**普通 AI 聊天：**
```
你：帮我查一下北京明天的天气
AI：北京明天晴，气温 15-25°C
```

**AI Agent：**
```
你：帮我规划明天北京一日游
Agent 思考：我需要 → ①查天气 → ②根据天气推荐景点 → ③查交通路线 → ④生成行程表
Agent 执行：调用天气API → 搜索景点信息 → 调用地图API → 整合输出完整方案
```

## 1.2 AI Agent 的核心组成

一个完整的 AI Agent 通常包含以下几个核心模块：

```
┌────────────────────────────────────────────┐
│                  AI Agent                  │
│                                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ 大脑     │  │ 工具     │  │ 记忆     │  │
│  │ (LLM)    │  │ (Tools)  │  │ (Memory) │  │
│  └──────────┘  └──────────┘  └──────────┘  │
│                                            │
│  ┌──────────┐  ┌──────────┐                │
│  │ 规划     │  │ 感知     │                │
│  │(Planning)│  │(Perceive)│                │
│  └──────────┘  └──────────┘                │
└────────────────────────────────────────────┘
```

### 1. 🧠 大脑（LLM - 大语言模型）

Agent 的核心决策引擎。负责理解用户意图、推理分析、生成回复。常见的有：

- **OpenAI GPT-5 / GPT-4o** — 综合能力最强
- **Claude Opus 4.6 / Sonnet 4** — 推理和代码能力出色
- **Google Gemini 2.5** — 多模态能力强大
- **开源模型：Llama 3.3、Qwen 2.5、DeepSeek** — 可本地部署

### 2. 🔧 工具（Tools）

Agent 的"手"，让它能与外部世界交互：

- 搜索引擎（Google、Bing）
- 数据库读写
- 文件操作
- API 调用（天气、地图、邮件……）
- 代码执行
- 浏览器操作

### 3. 💾 记忆（Memory）

Agent 的"笔记本"，分为：

- **短期记忆：** 当前对话上下文
- **长期记忆：** 跨会话的持久化信息（用户偏好、历史任务等）
- **工作记忆：** 任务执行中的临时状态

### 4. 📋 规划（Planning）

Agent 的"大脑前额叶"，负责：

- 将复杂任务拆解为子任务
- 确定执行顺序
- 遇到失败时重新规划

### 5. 👁️ 感知（Perception）

Agent 的"五官"，负责理解输入：

- 文本理解
- 图像识别
- 语音识别
- 其他多模态输入

## 1.3 AI Agent 的工作流程

一个典型的 Agent 工作循环（也叫 **Agent Loop**）：

```
用户输入 → 感知理解 → 思考规划 → 选择动作 → 执行动作 → 观察结果 → 思考规划 → ... → 输出结果
```

用代码思维来理解：

```javascript
async function agentLoop(userInput) {
  // 1. 感知：理解用户输入
  const task = understand(userInput);
  
  // 2. 初始化执行上下文
  const context = { task, history: [], memory: loadMemory() };
  
  // 3. Agent 循环
  while (!isTaskComplete(context)) {
    // 思考：分析当前状态，决定下一步
    const plan = await think(context);
    
    // 行动：选择并执行工具
    const action = selectAction(plan);
    const result = await executeAction(action);
    
    // 观察：将结果加入上下文
    context.history.push({ action, result });
    
    // 反思：评估是否需要调整计划
    await reflect(context);
  }
  
  // 4. 输出最终结果
  return generateResponse(context);
}
```

这就是著名的 **ReAct（Reasoning + Acting）** 模式：**思考 → 行动 → 观察**，循环往复。

## 1.4 AI Agent 的典型应用场景

| 场景 | 描述 | 示例 |
|---|---|---|
| **智能助手** | 个人/企业效率工具 | Cursor、GitHub Copilot、Notion AI |
| **客服机器人** | 自动处理客户问题 | 自动查订单、退换货处理 |
| **数据分析** | 自动分析数据并生成报告 | 自然语言查数据库、生成图表 |
| **自动化工作流** | 替代重复性工作 | 自动写周报、邮件分类处理 |
| **代码助手** | 辅助编程开发 | 代码生成、Bug 修复、Code Review |
| **创意生成** | 内容创作辅助 | 文章撰写、视频脚本、设计方案 |

## 1.5 2025-2026 年 Agent 技术发展现状

### 当前趋势

1. **MCP 协议（Model Context Protocol）** — Anthropic 发布的开放标准，让 Agent 能标准化地连接各种工具和数据源
2. **Computer Use / 浏览器操作** — Agent 可以直接操作电脑界面（Claude Computer Use、OpenAI Operator）
3. **多 Agent 协作** — 多个 Agent 分工合作完成复杂任务（CrewAI、AutoGen、LangGraph）
4. **本地化部署** — 小模型也能跑 Agent（Llama 3、Qwen 2.5、Phi-4）
5. **Agent 即应用** — Agent 从后端走向前端产品化

### JS/Node.js 生态中的 Agent 工具

作为 JS 开发者，你有很多可用的工具：

| 工具/框架 | 用途 | 特点 |
|---|---|---|
| **Mastra** | Agent 全栈框架 | TS 原生，Agent+Workflow+RAG+Memory+Evals |
| **Vercel AI SDK** | AI 应用开发 | 与 Next.js 深度集成 |
| **LangChain.js** | Agent 开发框架 | 生态最全 |
| **OpenAI Agents SDK** | 多 Agent 编排 | 官方 Agent 编排方案 |
| **MCP SDK (TypeScript)** | MCP 协议 | 官方 TypeScript SDK |

## 1.6 本教程学习路径

本教程专为 **JS/Electron 开发者**设计，学习路径如下：

```
基础理论                          实战技能
────────                        ────────
第1章 AI Agent 概述         ←  你在这里 ⭐
第2章 大语言模型基础              学会调用 LLM API
第3章 提示词工程                 掌握与 AI 对话的技巧
第4章 Agent 核心架构              理解 Agent 内部原理
第5章 Function Calling            让 Agent 使用工具
第6章 RAG 检索增强生成            让 Agent 有知识库
第7章 记忆与上下文管理            让 Agent 有记忆
第8章 多 Agent 协作               让多个 Agent 协同工作
第9章 主流开发框架实战            Mastra / Vercel AI SDK / LangChain.js
第10章 Electron + Agent 实战      构建桌面 AI Agent 应用
第11章 安全、部署与优化           生产级最佳实践
第12章 前沿技术与资源             保持学习，跟进前沿
```

## 1.7 环境准备

在开始之前，确保你有以下环境：

### 必需

```bash
# Node.js 18+ （推荐 20 LTS）
node --version

# npm 或 pnpm
npm --version

# Git
git --version
```

### 推荐安装

```bash
# pnpm（更快的包管理器）
npm install -g pnpm

# TypeScript（Agent 开发推荐使用 TS，但不强制）
npm install -g typescript
```

### API Key 准备

你至少需要一个 LLM API Key（后续章节会详细讲解如何获取）：

- **OpenAI API Key** — 最推荐，生态最成熟
- **或 Anthropic API Key** — Claude 模型
- **或国内替代** — 智谱 AI、百度文心、通义千问等（均兼容 OpenAI 格式）

> 💡 **提示：** 如果暂时没有 API Key，可以先用 Ollama 在本地运行开源模型，完全免费。后面章节会介绍。

## 1.8 小结

本章你了解了：

- ✅ AI Agent 是什么：能自主思考和行动的 AI 程序
- ✅ Agent 的五大核心组件：大脑、工具、记忆、规划、感知
- ✅ Agent 的工作循环：思考 → 行动 → 观察
- ✅ 当前技术趋势：MCP、Computer Use、多 Agent、本地化
- ✅ JS 生态中的 Agent 开发工具
- ✅ 本教程的学习路径和环境准备

**下一章**我们将深入了解 AI Agent 的"大脑" —— 大语言模型（LLM），并动手写出第一行 AI 代码。
