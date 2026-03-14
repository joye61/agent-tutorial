# 第十章：Electron + AI Agent 实战 —— 构建桌面智能体应用

> 这是本教程的核心章节，我们将把前面学到的所有知识整合起来，用 Electron 构建一个完整的桌面 AI Agent 应用。

## 10.1 应用设计

### 我们要做什么？

一个名为 **"SmartDesk"** 的桌面 AI 助手，功能包括：

- 💬 与 AI 对话（流式输出，打字机效果）
- 🔧 使用工具（读写文件、执行命令、搜索）
- 💾 记忆系统（记住用户偏好，跨会话持久化）
- 📚 RAG 知识库（导入本地文档，基于知识回答）
- ⚙️ 设置面板（配置 API Key、选择模型）

### 技术栈

```
前端（渲染进程）：HTML + CSS + 原生 JS（保持简单）
后端（主进程）：  Electron + Vercel AI SDK
存储：           SQLite（better-sqlite3）
通信：           Electron IPC
```

### 架构图

```
┌───────────────────────────────────────────────────────┐
│                     Electron 应用                     │
│                                                       │
│  ┌─────────────────────┐   IPC   ┌─────────────────┐  │
│  │ 渲染进程            │ ←─────→ │ 主进程          │  │
│  │ (Renderer)          │         │ (Main)          │  │
│  │                     │         │                 │  │
│  │ ┌───────────────┐   │         │ ┌───────────┐   │  │
│  │ │ 聊天界面      │   │         │ │ AI Agent  │   │  │
│  │ │ 消息列表      │   │         │ │ 引擎      │   │  │
│  │ │ 输入框        │   │         │ └───────────┘   │  │
│  │ │ 设置面板      │   │         │ ┌───────────┐   │  │
│  │ └───────────────┘   │         │ │ 工具管理  │   │  │
│  │                     │         │ └───────────┘   │  │
│  │                     │         │ ┌───────────┐   │  │
│  │                     │         │ │ 记忆存储  │   │  │
│  │                     │         │ └───────────┘   │  │
│  └─────────────────────┘         └─────────────────┘  │
└───────────────────────────────────────────────────────┘
                           │
                      ┌────▼────┐
                      │ LLM API │  OpenAI / Ollama
                      └─────────┘
```

## 10.2 项目初始化

### 创建项目

```bash
mkdir smart-desk && cd smart-desk

# 初始化
npm init -y

# 安装依赖
npm install electron --save-dev
npm install ai @ai-sdk/openai zod better-sqlite3 dotenv
```

### 项目结构

```
smart-desk/
├── package.json
├── .env                    # API Key 配置（不要提交到 Git！）
├── .gitignore
├── main/                   # 主进程代码
│   ├── index.js           # Electron 入口
│   ├── agent.js           # AI Agent 引擎
│   ├── tools.js           # 工具定义
│   ├── memory.js          # 记忆系统
│   └── ipc-handlers.js    # IPC 消息处理
├── renderer/               # 渲染进程代码
│   ├── index.html         # 主页面
│   ├── styles.css         # 样式
│   ├── app.js             # 前端逻辑
│   └── preload.js         # 预加载脚本
└── data/                   # 数据目录
    └── .gitkeep
```

### package.json

```json
{
  "name": "smart-desk",
  "version": "1.0.0",
  "main": "main/index.js",
  "scripts": {
    "start": "electron .",
    "dev": "electron . --dev"
  }
}
```

### .env

```
OPENAI_API_KEY=sk-your-key-here
```

### .gitignore

```
node_modules/
.env
data/*.db
```

## 10.3 主进程：Electron 入口

```javascript
// main/index.js
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { setupIpcHandlers } from './ipc-handlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, '../renderer/preload.js'),
      contextIsolation: true,   // 安全：开启上下文隔离
      nodeIntegration: false,    // 安全：禁用 Node 集成
    },
    titleBarStyle: 'hiddenInset',
    title: 'SmartDesk AI',
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  createWindow();
  setupIpcHandlers(ipcMain, mainWindow);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

## 10.4 预加载脚本：安全桥梁

```javascript
// renderer/preload.js
const { contextBridge, ipcRenderer } = require('electron');

// 安全地暴露 API 给渲染进程
contextBridge.exposeInMainWorld('agent', {
  // 发送消息给 Agent
  sendMessage: (message) => ipcRenderer.invoke('agent:send-message', message),
  
  // 监听流式回复
  onStreamChunk: (callback) => {
    ipcRenderer.on('agent:stream-chunk', (_, chunk) => callback(chunk));
  },
  
  // 监听流式结束
  onStreamEnd: (callback) => {
    ipcRenderer.on('agent:stream-end', (_, data) => callback(data));
  },

  // 监听工具调用事件
  onToolCall: (callback) => {
    ipcRenderer.on('agent:tool-call', (_, data) => callback(data));
  },
  
  // 获取对话历史
  getHistory: () => ipcRenderer.invoke('agent:get-history'),
  
  // 清除对话历史
  clearHistory: () => ipcRenderer.invoke('agent:clear-history'),

  // 设置相关
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
});
```

## 10.5 AI Agent 引擎

```javascript
// main/agent.js
import { streamText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { getTools } from './tools.js';
import { MemoryStore } from './memory.js';

class AgentEngine {
  constructor() {
    this.memory = new MemoryStore();
    this.conversationHistory = [];
    this.model = null;
  }

  initialize(config = {}) {
    const provider = createOpenAI({
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      baseURL: config.baseURL, // 支持自定义 API 地址（如 Ollama、DeepSeek）
    });

    this.model = provider(config.model || 'gpt-4o');
    this.memory.init();
    
    // 加载用户偏好
    this.userPreferences = this.memory.getAllPreferences();
  }

  buildSystemPrompt() {
    const prefsStr = Object.entries(this.userPreferences)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n');

    return `你是 SmartDesk，一个运行在用户桌面的 AI 助手。

## 能力
- 你可以读写本地文件
- 你可以执行终端命令
- 你可以搜索用户的文件

## 规则
- 执行文件写入或删除操作前，先告知用户
- 保持回答简洁有用
- 代码用代码块包裹，标明语言

${prefsStr ? `## 用户偏好\n${prefsStr}` : ''}`;
  }

  // 核心：处理用户消息（流式输出）
  async processMessage(userMessage, onChunk, onToolCall, onEnd) {
    // 加入历史
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    // 限制历史长度
    if (this.conversationHistory.length > 30) {
      this.conversationHistory = this.conversationHistory.slice(-20);
    }

    try {
      const { textStream, steps } = streamText({
        model: this.model,
        system: this.buildSystemPrompt(),
        messages: this.conversationHistory,
        tools: getTools(),
        maxSteps: 8,
        temperature: 0,
      });

      let fullResponse = '';

      // 流式输出
      for await (const chunk of textStream) {
        fullResponse += chunk;
        onChunk(chunk);
      }

      // 获取步骤信息（工具调用等）
      const allSteps = await steps;
      const toolCalls = [];
      for (const step of allSteps) {
        if (step.toolCalls) {
          for (const tc of step.toolCalls) {
            toolCalls.push({
              tool: tc.toolName,
              args: tc.args,
              result: tc.result,
            });
            onToolCall({
              tool: tc.toolName,
              args: tc.args,
              result: tc.result,
            });
          }
        }
      }

      // 保存助手回复到历史
      this.conversationHistory.push({
        role: 'assistant',
        content: fullResponse,
      });

      // 保存到持久存储
      this.memory.addConversation('user', userMessage);
      this.memory.addConversation('assistant', fullResponse);

      onEnd({ text: fullResponse, toolCalls });
      
      // 异步提取记忆（不阻塞回复）
      this.extractMemories(userMessage, fullResponse).catch(() => {});
      
    } catch (error) {
      onEnd({ error: error.message });
    }
  }

  // 从对话中提取长期记忆
  async extractMemories(userMessage, assistantReply) {
    // 简单的规则提取（也可以用 LLM 提取，参考第7章）
    const prefPatterns = [
      { regex: /我(?:喜欢|偏好|习惯)(?:用|使用)\s*(\S+)/g, key: '偏好工具' },
      { regex: /我是(?:一个|一名)?\s*(\S+(?:开发者|工程师|程序员|设计师))/g, key: '职业' },
      { regex: /我(?:在|用)\s*(\S+)\s*(?:开发|工作)/g, key: '工作环境' },
    ];
    
    for (const pattern of prefPatterns) {
      const match = pattern.regex.exec(userMessage);
      if (match) {
        this.memory.setPreference(pattern.key, match[1]);
        this.userPreferences[pattern.key] = match[1];
      }
    }
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  getHistory() {
    return this.conversationHistory;
  }
}

export { AgentEngine };
```

## 10.6 工具定义

```javascript
// main/tools.js
import { tool } from 'ai';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export function getTools() {
  return {
    readFile: tool({
      description: '读取本地文件的内容',
      parameters: z.object({
        filePath: z.string().describe('文件的绝对路径'),
      }),
      execute: async ({ filePath }) => {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          // 限制返回大小
          if (content.length > 10000) {
            return {
              content: content.substring(0, 10000),
              truncated: true,
              totalSize: content.length,
            };
          }
          return { content };
        } catch (err) {
          return { error: err.message };
        }
      },
    }),

    writeFile: tool({
      description: '将内容写入本地文件',
      parameters: z.object({
        filePath: z.string().describe('文件的绝对路径'),
        content: z.string().describe('要写入的内容'),
      }),
      execute: async ({ filePath, content }) => {
        try {
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, content, 'utf-8');
          return { success: true, path: filePath };
        } catch (err) {
          return { error: err.message };
        }
      },
    }),

    listDirectory: tool({
      description: '列出目录下的文件和子目录',
      parameters: z.object({
        dirPath: z.string().describe('目录的绝对路径'),
      }),
      execute: async ({ dirPath }) => {
        try {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          return {
            items: entries.slice(0, 100).map(e => ({
              name: e.name,
              type: e.isDirectory() ? 'dir' : 'file',
            })),
            total: entries.length,
          };
        } catch (err) {
          return { error: err.message };
        }
      },
    }),

    runCommand: tool({
      description: '在终端中执行命令（仅限安全的只读命令）',
      parameters: z.object({
        command: z.string().describe('要执行的命令'),
      }),
      execute: async ({ command }) => {
        // 安全检查
        const dangerous = [/rm\s+-rf?/i, /del\s+\/[sf]/i, /format/i, /mkfs/i];
        if (dangerous.some(p => p.test(command))) {
          return { error: '拒绝执行危险命令' };
        }
        if (/[;&|`$]/.test(command)) {
          return { error: '不允许使用管道或命令连接符' };
        }

        try {
          const { stdout, stderr } = await execAsync(command, {
            timeout: 15000,
            maxBuffer: 1024 * 1024,
          });
          return { stdout: stdout.substring(0, 5000), stderr };
        } catch (err) {
          return { error: err.message };
        }
      },
    }),

    searchFiles: tool({
      description: '在指定目录中搜索包含特定文本的文件',
      parameters: z.object({
        directory: z.string().describe('搜索的根目录'),
        searchText: z.string().describe('要搜索的文本'),
        filePattern: z.string().optional().describe('文件名通配符，如 *.js'),
      }),
      execute: async ({ directory, searchText, filePattern }) => {
        const results = [];
        
        async function searchDir(dir, depth = 0) {
          if (depth > 5 || results.length > 20) return;
          
          try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
              
              const fullPath = path.join(dir, entry.name);
              
              if (entry.isDirectory()) {
                await searchDir(fullPath, depth + 1);
              } else if (entry.isFile()) {
                if (filePattern && !entry.name.match(
                  new RegExp(filePattern.replace(/\*/g, '.*').replace(/\?/g, '.'))
                )) continue;
                
                try {
                  const content = await fs.readFile(fullPath, 'utf-8');
                  const lines = content.split('\n');
                  for (let i = 0; i < lines.length; i++) {
                    if (lines[i].toLowerCase().includes(searchText.toLowerCase())) {
                      results.push({
                        file: fullPath,
                        line: i + 1,
                        content: lines[i].trim().substring(0, 200),
                      });
                      if (results.length >= 20) return;
                    }
                  }
                } catch {}
              }
            }
          } catch {}
        }
        
        await searchDir(directory);
        return { results, total: results.length };
      },
    }),
  };
}
```

## 10.7 记忆存储层

```javascript
// main/memory.js
import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';

class MemoryStore {
  init() {
    const dbPath = path.join(app.getPath('userData'), 'smartdesk.db');
    this.db = new Database(dbPath);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    this.sessionId = Date.now().toString(36);
  }

  // 偏好
  setPreference(key, value) {
    this.db.prepare(
      'INSERT OR REPLACE INTO preferences (key, value, updated_at) VALUES (?, ?, datetime("now"))'
    ).run(key, value);
  }

  getPreference(key) {
    const row = this.db.prepare('SELECT value FROM preferences WHERE key = ?').get(key);
    return row?.value;
  }

  getAllPreferences() {
    return this.db.prepare('SELECT key, value FROM preferences').all()
      .reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
  }

  // 对话
  addConversation(role, content) {
    this.db.prepare(
      'INSERT INTO conversations (session_id, role, content) VALUES (?, ?, ?)'
    ).run(this.sessionId, role, content);
  }

  // 设置
  setSetting(key, value) {
    this.db.prepare(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
    ).run(key, JSON.stringify(value));
  }

  getSetting(key) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : null;
  }

  getAllSettings() {
    return this.db.prepare('SELECT key, value FROM settings').all()
      .reduce((acc, row) => ({ ...acc, [row.key]: JSON.parse(row.value) }), {});
  }
}

export { MemoryStore };
```

## 10.8 IPC 通信层

```javascript
// main/ipc-handlers.js
import { AgentEngine } from './agent.js';

const agent = new AgentEngine();

export function setupIpcHandlers(ipcMain, mainWindow) {
  // 初始化 Agent
  agent.initialize();

  // 处理用户消息
  ipcMain.handle('agent:send-message', async (event, message) => {
    return new Promise((resolve) => {
      agent.processMessage(
        message,
        // 流式 chunk 回调
        (chunk) => {
          mainWindow.webContents.send('agent:stream-chunk', chunk);
        },
        // 工具调用回调
        (toolCallInfo) => {
          mainWindow.webContents.send('agent:tool-call', toolCallInfo);
        },
        // 完成回调
        (result) => {
          mainWindow.webContents.send('agent:stream-end', result);
          resolve(result);
        }
      );
    });
  });

  // 获取历史
  ipcMain.handle('agent:get-history', () => {
    return agent.getHistory();
  });

  // 清除历史
  ipcMain.handle('agent:clear-history', () => {
    agent.clearHistory();
    return { success: true };
  });

  // 设置管理
  ipcMain.handle('settings:get', () => {
    return agent.memory.getAllSettings();
  });

  ipcMain.handle('settings:save', (event, settings) => {
    for (const [key, value] of Object.entries(settings)) {
      agent.memory.setSetting(key, value);
    }
    // 重新初始化 Agent（应用新设置）
    agent.initialize(settings);
    return { success: true };
  });
}
```

## 10.9 前端界面

```html
<!-- renderer/index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline';">
  <title>SmartDesk AI</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app">
    <!-- 标题栏 -->
    <header class="title-bar">
      <h1>🤖 SmartDesk AI</h1>
      <div class="title-actions">
        <button id="btn-clear" title="清除对话">🗑️</button>
        <button id="btn-settings" title="设置">⚙️</button>
      </div>
    </header>

    <!-- 聊天区域 -->
    <main id="chat-container">
      <div id="messages">
        <div class="message assistant">
          <div class="message-content">
            你好！我是 SmartDesk，你的桌面 AI 助手。我可以帮你读写文件、执行命令、搜索代码。有什么可以帮你的？
          </div>
        </div>
      </div>
    </main>

    <!-- 输入区域 -->
    <footer class="input-area">
      <textarea 
        id="user-input" 
        placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
        rows="1"
      ></textarea>
      <button id="btn-send">发送</button>
    </footer>

    <!-- 设置面板 -->
    <div id="settings-panel" class="hidden">
      <div class="settings-overlay" onclick="toggleSettings()"></div>
      <div class="settings-content">
        <h2>设置</h2>
        <label>
          API Key
          <input type="password" id="setting-api-key" placeholder="sk-...">
        </label>
        <label>
          API 地址（可选）
          <input type="text" id="setting-base-url" placeholder="https://api.openai.com/v1">
        </label>
        <label>
          模型
          <select id="setting-model">
            <option value="gpt-4o">GPT-4o</option>
            <option value="gpt-4o-mini">GPT-4o mini</option>
            <option value="gpt-5">GPT-5</option>
            <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
            <option value="deepseek-chat">DeepSeek Chat</option>
            <option value="qwen2.5">Qwen 2.5 (Ollama)</option>
          </select>
        </label>
        <div class="settings-actions">
          <button onclick="saveSettings()">保存</button>
          <button onclick="toggleSettings()">取消</button>
        </div>
      </div>
    </div>
  </div>

  <script src="app.js"></script>
</body>
</html>
```

```css
/* renderer/styles.css */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --bg-message-user: #0f3460;
  --bg-message-assistant: #1a1a2e;
  --text-primary: #e0e0e0;
  --text-secondary: #a0a0a0;
  --accent: #4a9eff;
  --border: #2a2a4a;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  height: 100vh;
  overflow: hidden;
}

#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

/* 标题栏 */
.title-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  -webkit-app-region: drag; /* 允许拖拽窗口 */
}

.title-bar h1 {
  font-size: 16px;
  font-weight: 600;
}

.title-actions {
  display: flex;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.title-actions button {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.title-actions button:hover {
  background: rgba(255,255,255,0.1);
}

/* 聊天区域 */
#chat-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

#messages {
  max-width: 800px;
  margin: 0 auto;
}

.message {
  margin-bottom: 16px;
  display: flex;
}

.message.user {
  justify-content: flex-end;
}

.message-content {
  max-width: 80%;
  padding: 12px 16px;
  border-radius: 12px;
  line-height: 1.6;
  font-size: 14px;
  white-space: pre-wrap;
  word-break: break-word;
}

.message.user .message-content {
  background: var(--bg-message-user);
  border-bottom-right-radius: 4px;
}

.message.assistant .message-content {
  background: var(--bg-secondary);
  border-bottom-left-radius: 4px;
  border: 1px solid var(--border);
}

.message-content code {
  background: rgba(0,0,0,0.3);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
}

.message-content pre {
  background: rgba(0,0,0,0.3);
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 8px 0;
}

.message-content pre code {
  background: none;
  padding: 0;
}

/* 工具调用提示 */
.tool-call {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 6px 12px;
  background: rgba(74, 158, 255, 0.1);
  border-radius: 6px;
  margin-bottom: 8px;
  border-left: 3px solid var(--accent);
}

/* 输入区域 */
.input-area {
  padding: 16px 20px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
  display: flex;
  gap: 12px;
  align-items: flex-end;
  max-width: 840px;
  width: 100%;
  margin: 0 auto;
}

#user-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
  resize: none;
  max-height: 120px;
  line-height: 1.5;
}

#user-input:focus {
  outline: none;
  border-color: var(--accent);
}

#btn-send {
  padding: 10px 20px;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  font-weight: 500;
}

#btn-send:hover {
  opacity: 0.9;
}

#btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 加载动画 */
.typing-indicator {
  display: inline-flex;
  gap: 4px;
  padding: 8px 12px;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  background: var(--text-secondary);
  border-radius: 50%;
  animation: typing 1.4s infinite;
}

.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-10px); opacity: 1; }
}

/* 设置面板 */
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
}

.settings-content {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--bg-secondary);
  padding: 24px;
  border-radius: 12px;
  width: 400px;
  border: 1px solid var(--border);
}

.settings-content h2 {
  margin-bottom: 16px;
}

.settings-content label {
  display: block;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--text-secondary);
}

.settings-content input,
.settings-content select {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
}

.settings-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  justify-content: flex-end;
}

.settings-actions button {
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  cursor: pointer;
}

.settings-actions button:first-child {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.hidden {
  display: none !important;
}
```

```javascript
// renderer/app.js

const messagesContainer = document.getElementById('messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('btn-send');
const clearBtn = document.getElementById('btn-clear');
const settingsBtn = document.getElementById('btn-settings');

let isStreaming = false;
let currentAssistantEl = null;

// ===== 发送消息 =====
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text || isStreaming) return;

  // 显示用户消息
  appendMessage('user', text);
  userInput.value = '';
  userInput.style.height = 'auto';

  // 准备 AI 回复区域
  isStreaming = true;
  sendBtn.disabled = true;
  currentAssistantEl = appendMessage('assistant', '');
  showTypingIndicator(currentAssistantEl);

  // 发送给 Agent
  await window.agent.sendMessage(text);
}

// 监听流式回复
window.agent.onStreamChunk((chunk) => {
  if (currentAssistantEl) {
    removeTypingIndicator(currentAssistantEl);
    const contentEl = currentAssistantEl.querySelector('.message-content');
    contentEl.textContent += chunk;
    scrollToBottom();
  }
});

// 监听工具调用
window.agent.onToolCall((data) => {
  const toolEl = document.createElement('div');
  toolEl.className = 'tool-call';
  toolEl.textContent = `🔧 调用工具: ${data.tool}(${JSON.stringify(data.args).substring(0, 100)})`;
  messagesContainer.appendChild(toolEl);
  scrollToBottom();
});

// 监听完成
window.agent.onStreamEnd((data) => {
  isStreaming = false;
  sendBtn.disabled = false;
  currentAssistantEl = null;

  if (data.error) {
    appendMessage('assistant', `❌ 错误: ${data.error}`);
  }
});

// ===== UI 辅助函数 =====

function appendMessage(role, content) {
  const msgEl = document.createElement('div');
  msgEl.className = `message ${role}`;

  const contentEl = document.createElement('div');
  contentEl.className = 'message-content';
  contentEl.textContent = content;

  msgEl.appendChild(contentEl);
  messagesContainer.appendChild(msgEl);
  scrollToBottom();

  return msgEl;
}

function showTypingIndicator(messageEl) {
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.innerHTML = '<span></span><span></span><span></span>';
  messageEl.querySelector('.message-content').appendChild(indicator);
}

function removeTypingIndicator(messageEl) {
  const indicator = messageEl.querySelector('.typing-indicator');
  if (indicator) indicator.remove();
}

function scrollToBottom() {
  const container = document.getElementById('chat-container');
  container.scrollTop = container.scrollHeight;
}

// ===== 事件绑定 =====

sendBtn.addEventListener('click', sendMessage);

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// 自动调整输入框高度
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
});

// 清除对话
clearBtn.addEventListener('click', async () => {
  await window.agent.clearHistory();
  messagesContainer.innerHTML = '';
  appendMessage('assistant', '对话已清除。有什么新的需要帮忙的吗？');
});

// 设置面板
settingsBtn.addEventListener('click', toggleSettings);

function toggleSettings() {
  const panel = document.getElementById('settings-panel');
  panel.classList.toggle('hidden');
}

async function saveSettings() {
  const settings = {
    apiKey: document.getElementById('setting-api-key').value,
    baseURL: document.getElementById('setting-base-url').value,
    model: document.getElementById('setting-model').value,
  };
  await window.agent.saveSettings(settings);
  toggleSettings();
  appendMessage('assistant', '✅ 设置已保存并生效。');
}
```

## 10.10 运行你的应用

```bash
# 在项目根目录
npm start
```

如果一切配置正确，你将看到一个深色主题的桌面聊天应用，能够：
- 与 AI 对话并看到流式打字效果
- AI 可以调用工具读写文件、执行命令
- 设置面板可以配置 API Key 和模型

## 10.11 进阶：添加 MCP 支持

你可以让 SmartDesk 支持外部 MCP Server 工具：

```javascript
// main/mcp-integration.js
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

class MCPManager {
  constructor() {
    this.clients = new Map();
  }

  // 连接到 MCP Server
  async connect(serverName, command, args = []) {
    const transport = new StdioClientTransport({ command, args });
    const client = new Client({ name: 'smartdesk', version: '1.0.0' });
    await client.connect(transport);
    
    this.clients.set(serverName, client);
    
    // 获取可用工具
    const { tools } = await client.listTools();
    console.log(`MCP ${serverName} 提供了 ${tools.length} 个工具`);
    
    return tools;
  }

  // 调用 MCP 工具
  async callTool(serverName, toolName, args) {
    const client = this.clients.get(serverName);
    if (!client) throw new Error(`MCP Server ${serverName} 未连接`);
    
    return client.callTool({ name: toolName, arguments: args });
  }

  // 将 MCP 工具转换为 Vercel AI SDK 格式
  convertToAITools(serverName, mcpTools) {
    const tools = {};
    
    for (const mcpTool of mcpTools) {
      tools[`mcp_${serverName}_${mcpTool.name}`] = tool({
        description: mcpTool.description || mcpTool.name,
        parameters: z.object(mcpTool.inputSchema || {}),
        execute: async (args) => {
          const result = await this.callTool(serverName, mcpTool.name, args);
          return result;
        },
      });
    }
    
    return tools;
  }
}

export { MCPManager };
```

## 10.12 小结

本章你完成了：

- ✅ 设计了完整的 Electron AI Agent 应用架构
- ✅ 实现了主进程-渲染进程的安全通信（IPC）
- ✅ 构建了 AI Agent 引擎（流式输出 + 工具调用）
- ✅ 实现了文件操作、命令执行等实用工具
- ✅ 集成了记忆存储系统（SQLite）
- ✅ 构建了现代化的聊天界面
- ✅ 了解了 MCP 集成方案

### 练习

1. 运行 SmartDesk，测试基本对话和工具调用
2. 添加一个新工具（如：搜索网页、生成图片描述等）
3. 实现 Markdown 渲染（在聊天消息中支持 Markdown 格式）
4. 添加多会话管理（左侧栏显示历史会话列表）

**下一章**我们将学习 Agent 应用的安全性、部署和性能优化。
