# 第四章 Workflow 工作流引擎

## 4.1 Agent vs Workflow：何时用哪个

这是一个初学者最容易困惑的问题。简单的判断标准：

| 场景 | 选择 | 原因 |
|------|------|------|
| "帮我总结这篇文章" | Agent | 开放性任务，让 LLM 自由发挥 |
| "先验证数据 → 再调用 API → 最后生成报告" | Workflow | 明确的步骤顺序，需要精确控制 |
| "分析用户的问题，决定分发给哪个部门" | Agent | 需要推理判断 |
| "每天凌晨抓取数据 → 清洗 → 入库" | Workflow | 固定流程，无需 LLM 推理 |

**我的理解是**：Agent 像是"自由发挥的创意总监"，Workflow 像是"严格执行的流水线"。两者可以互相嵌套——Workflow 的某个步骤可以调用 Agent，Agent 也可以触发 Workflow。

## 4.2 核心概念

Mastra Workflow 基于三个核心概念：
1. **Step（步骤）**：用 `createStep` 定义，每个步骤有输入 Schema、输出 Schema 和执行逻辑
2. **Workflow（工作流）**：用 `createWorkflow` 编排多个步骤的执行顺序
3. **Run（运行实例）**：用 `createRun` 创建工作流的一次执行

## 4.3 创建步骤

```typescript
import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'

const validateStep = createStep({
  id: 'validate',
  inputSchema: z.object({
    email: z.string().email(),
    name: z.string().min(1),
  }),
  outputSchema: z.object({
    isValid: z.boolean(),
    normalizedEmail: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { email, name } = inputData
    return {
      isValid: true,
      normalizedEmail: email.toLowerCase().trim(),
    }
  },
})
```

**Schema 匹配规则（重要！）**：
- 第一个步骤的 `inputSchema` 必须匹配工作流的 `inputSchema`
- 最后一个步骤的 `outputSchema` 必须匹配工作流的 `outputSchema`
- 相邻步骤：前一步的 `outputSchema` 必须匹配后一步的 `inputSchema`
- 如果不匹配，用 `.map()` 做数据转换

## 4.4 控制流

### 顺序执行：`.then()`

最简单的模式。步骤按顺序执行，每一步可以访问前一步的结果。

```typescript
const workflow = createWorkflow({
  id: 'sequential-example',
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ result: z.string() }),
})
  .then(step1)   // 先执行 step1
  .then(step2)   // 再执行 step2
  .commit()       // 完成定义
```

### 并行执行：`.parallel()`

多个步骤同时执行，全部完成后再进入下一步。

```typescript
const formatStep = createStep({
  id: 'format-step',
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ formatted: z.string() }),
  execute: async ({ inputData }) => ({
    formatted: inputData.message.toUpperCase(),
  }),
})

const countStep = createStep({
  id: 'count-step',
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ count: z.number() }),
  execute: async ({ inputData }) => ({
    count: inputData.message.length,
  }),
})

// 合并步骤：注意 inputSchema 的结构要匹配 parallel 的输出
const combineStep = createStep({
  id: 'combine-step',
  inputSchema: z.object({
    'format-step': z.object({ formatted: z.string() }),
    'count-step': z.object({ count: z.number() }),
  }),
  outputSchema: z.object({ result: z.string() }),
  execute: async ({ inputData }) => {
    const formatted = inputData['format-step'].formatted
    const count = inputData['count-step'].count
    return { result: `${formatted} (${count} characters)` }
  },
})

const workflow = createWorkflow({
  id: 'parallel-example',
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ result: z.string() }),
})
  .parallel([formatStep, countStep])  // 并行执行
  .then(combineStep)                   // 合并结果
  .commit()
```

**parallel 的输出结构**：是一个对象，key 是每个步骤的 `id`，value 是该步骤的输出。所以下一步的 `inputSchema` 要使用步骤 id 作为字段名。

### 条件分支：`.branch()`

根据条件选择执行哪个分支：

```typescript
const workflow = createWorkflow({
  inputSchema: z.object({ value: z.number() }),
  outputSchema: z.object({ result: z.string() }),
})
  .then(initialStep)
  .branch([
    // [条件函数, 满足时执行的步骤]
    [async ({ inputData: { value } }) => value > 10, highValueStep],
    [async ({ inputData: { value } }) => value <= 10, lowValueStep],
  ])
  .commit()
```

**branch 的关键**：
- 条件按定义顺序评估，第一个为 true 的分支被执行
- 只有一个分支会执行
- 后续步骤的 inputSchema 要用 optional 字段来处理不同分支的输出

### 循环：`.dountil()` / `.dowhile()` / `.foreach()`

```typescript
// do-until：执行直到条件为真
workflow
  .dountil(
    incrementStep,
    async ({ inputData: { number } }) => number > 10  // 当 number > 10 时停止
  )
  .commit()

// do-while：当条件为真时持续执行
workflow
  .dowhile(
    incrementStep,
    async ({ inputData: { number } }) => number < 10  // 当 number < 10 时继续
  )
  .commit()

// foreach：对数组的每个元素执行相同步骤
workflow
  .foreach(processItemStep)              // 默认顺序执行
  .foreach(processItemStep, { concurrency: 5 })  // 并行5个
  .commit()
```

`foreach` 是最实用的循环方式，比如批量处理文档、批量调用 API 等。

### 数据映射：`.map()`

当步骤之间的 Schema 不匹配时，用 `.map()` 转换数据：

```typescript
workflow
  .then(step1)
  .map(async ({ inputData }) => {
    // 把 step1 的输出转换成 step2 需要的格式
    return {
      bar: `transformed: ${inputData.foo}`,
    }
  })
  .then(step2)
  .commit()
```

`.map()` 还提供了辅助函数：
- `getStepResult(stepId)`：获取指定步骤的结果
- `getInitData()`：获取工作流的初始输入
- `mapVariable()`：声明式字段映射

## 4.5 工作流状态

工作流状态让你可以在步骤之间共享数据，而不需要通过每一步的 inputSchema/outputSchema 传递：

```typescript
const step1 = createStep({
  id: 'step-1',
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ formatted: z.string() }),
  stateSchema: z.object({ counter: z.number() }), // 定义状态 Schema
  execute: async ({ inputData, state, setState }) => {
    // 读取状态
    console.log('当前计数:', state.counter)
    // 更新状态
    setState({ ...state, counter: state.counter + 1 })
    return { formatted: inputData.message.toUpperCase() }
  },
})
```

> **什么时候用状态？** 当某些数据需要跨多个步骤累积（如计数器、结果收集器），或者需要共享配置时。

## 4.6 挂起与恢复（Human-in-the-Loop）

这是 Mastra Workflow 最强大的特性之一。工作流可以在任意步骤暂停，等待人工确认后再继续。

### 定义可挂起的步骤

```typescript
const approvalStep = createStep({
  id: 'approval',
  inputSchema: z.object({ userEmail: z.string() }),
  outputSchema: z.object({ output: z.string() }),
  resumeSchema: z.object({ approved: z.boolean() }), // 恢复时需要的数据
  execute: async ({ inputData, resumeData, suspend }) => {
    const { userEmail } = inputData
    const { approved } = resumeData ?? {}

    // 如果还没被批准，挂起工作流
    if (!approved) {
      return await suspend({})
    }

    // 被批准后继续执行
    return { output: `Email sent to ${userEmail}` }
  },
})
```

### 恢复执行

```typescript
const workflow = mastra.getWorkflow('myWorkflow')
const run = await workflow.createRun()

// 启动运行（会在 approval 步骤挂起）
const result = await run.start({
  inputData: { userEmail: 'user@example.com' },
})

if (result.status === 'suspended') {
  // 某个时刻（可能几分钟后，也可能几天后），恢复执行
  const finalResult = await run.resume({
    step: 'approval',
    resumeData: { approved: true },
  })
}
```

### 使用场景

- **审批流程**：生成报告后等待主管审批
- **人工确认**：发送邮件前确认内容和收件人
- **等待外部回调**：调用第三方 API 后等待 Webhook 回调
- **限流**：控制 API 调用频率

### Sleep：定时暂停

```typescript
workflow
  .then(step1)
  .sleep(60000)              // 暂停 60 秒
  .then(step2)
  .sleepUntil(new Date('2025-01-01'))  // 等到指定时间
  .then(step3)
  .commit()
```

## 4.7 工作流嵌套

工作流可以作为另一个工作流的步骤：

```typescript
const childWorkflow = createWorkflow({
  id: 'child-workflow',
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ emphasized: z.string() }),
})
  .then(step1)
  .then(step2)
  .commit()

const parentWorkflow = createWorkflow({
  id: 'parent-workflow',
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ emphasized: z.string() }),
})
  .then(childWorkflow) // 子工作流作为一个步骤
  .commit()
```

如果需要复用工作流但独立追踪，用 `cloneWorkflow`：

```typescript
import { cloneWorkflow } from '@mastra/core/workflows'

const clonedWorkflow = cloneWorkflow(parentWorkflow, {
  id: 'cloned-workflow',
})
```

## 4.8 运行工作流

### 同步运行

```typescript
const workflow = mastra.getWorkflow('myWorkflow')
const run = await workflow.createRun()

const result = await run.start({
  inputData: { message: 'Hello world' },
})

if (result.status === 'success') {
  console.log(result.result)  // 最终输出
}
```

### 流式运行

```typescript
const stream = await run.stream({
  inputData: { message: 'Hello world' },
})

for await (const chunk of stream.stream) {
  console.log(chunk.payload.output.stats)
}
```

### 结果对象结构

```typescript
{
  status: 'success' | 'failed' | 'suspended' | 'tripwire' | 'paused',
  input: { message: 'Hello world' },
  steps: {
    'step-1': { status: 'success', payload: {...}, output: {...} },
    'step-2': { status: 'success', payload: {...}, output: {...} },
  },
  result: { ... },  // status === 'success' 时可用
  error: { ... },   // status === 'failed' 时可用
}
```

## 4.9 错误处理

### 重试配置

```typescript
// 工作流级别：所有步骤共享
const workflow = createWorkflow({
  retryConfig: {
    attempts: 5,
    delay: 2000,  // 毫秒
  },
})

// 步骤级别：覆盖工作流配置
const step1 = createStep({
  execute: async () => {
    const response = await fetch('https://api.example.com/data')
    if (!response.ok) throw new Error('API 调用失败')
    return { value: await response.json() }
  },
  retries: 3, // 这个步骤最多重试 3 次
})
```

### 生命周期回调

```typescript
const workflow = createWorkflow({
  id: 'order-processing',
  inputSchema: z.object({ orderId: z.string() }),
  outputSchema: z.object({ status: z.string() }),
  options: {
    onFinish: async (result) => {
      // 无论成功失败都会调用
      await analytics.track('workflow_completed', {
        status: result.status,
        workflowId: 'order-processing',
      })
    },
    onError: async (errorInfo) => {
      // 仅在失败时调用
      await alertService.notify({
        channel: 'alerts',
        message: `工作流失败: ${errorInfo.error?.message}`,
      })
    },
  },
})
```

### bail()：提前退出

```typescript
const step1 = createStep({
  id: 'check-cache',
  execute: async ({ inputData, bail }) => {
    const cached = await cache.get(inputData.key)
    if (cached) {
      return bail({ result: cached }) // 命中缓存，直接返回，跳过后续步骤
    }
    return { result: null }
  },
})
```

## 4.10 控制流模式速查表

| 方法 | 用途 | 输入→输出 |
|------|------|----------|
| `.then(step)` | 顺序执行 | T → U |
| `.parallel([a, b])` | 并行执行 | T → { a: U, b: V } |
| `.branch([...])` | 条件分支 | T → { selectedStep: U } |
| `.foreach(step)` | 数组遍历 | T[] → U[] |
| `.foreach(step, {concurrency: N})` | 并行遍历 | T[] → U[] |
| `.dountil(step, condition)` | 循环直到 | T → T |
| `.dowhile(step, condition)` | 当条件真时循环 | T → T |
| `.map(fn)` | 数据转换 | T → U |
| `.sleep(ms)` | 定时暂停 | T → T |
| `.sleepUntil(date)` | 等到指定时间 | T → T |

## 4.11 本章小结

Workflow 是 Mastra 中最"重"但也最强大的功能。核心要点：

1. **Step 是构建块**：每个步骤都有严格的输入输出 Schema
2. **链式 API 很直觉**：`.then()/.parallel()/.branch()/.foreach()` 覆盖了几乎所有控制流场景
3. **Schema 匹配是关键**：相邻步骤的 Schema 必须对齐，不对齐就用 `.map()` 转换
4. **挂起/恢复是杀手级**：支持 Human-in-the-Loop，工作流可以暂停数天后继续
5. **嵌套组合**：工作流可以嵌套，也可以被 Agent 当作工具调用

下一章我们将深入 Memory（记忆）系统，让 Agent 真正"记住"用户。
