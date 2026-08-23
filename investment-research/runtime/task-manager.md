# Task Manager

## Objective
定义任务管理：记录任务类型、触发、执行状态与输出。

## 任务类型

### 1. Immediate Research
- 即时研究，例如：分析 NVDA。
- 触发：用户请求或临时决策。

### 2. Scheduled Research
- 定时研究，例如：每日市场扫描、每周复盘。
- 触发：时间计划。

### 3. Event Trigger
- 事件触发，例如：财报发布、大跌、重大新闻。
- 触发：事件规则命中。

## 记录字段

| 字段 | 说明 |
|---|---|
| Task ID | 任务唯一标识 |
| Task Type | Immediate / Scheduled / Event Trigger |
| Trigger | 触发条件（请求/计划/事件） |
| Agent | 分配的分析师 |
| Status | 待执行/执行中/完成/失败 |
| Output | 输出报告或结果 |

## 管理规则
- 任务状态全程可追踪，失败可重试。
- 事件触发任务按优先级排队，避免积压。
