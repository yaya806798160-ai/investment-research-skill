# Agent Orchestrator

## Objective
定义 Agent 调度系统：接收研究任务，自动分配分析师，汇总输出，避免重复工作。

## 接收任务
- Stock Analysis：股票分析。
- Fund Analysis：基金分析。
- Market Review：市场复盘。
- Portfolio Review：组合复盘。

## 自动分配
- Industry Analyst：行业与产业链任务。
- Company Analyst：公司质量与成长任务。
- Valuation Analyst：估值任务。
- Risk Manager：风险与仓位任务。

## 定义

### 输入
- 任务类型、标的（Ticker/Fund/Theme）、市场、期限。

### 调度顺序
1. 数据准备 → Industry Analyst → Company Analyst → Valuation Analyst → Risk Manager。
2. 无行业/产业链相关任务时跳过 Industry Analyst，避免重复。

### Agent 输出格式
- 每个 Agent 输出统一结构：结论、证据、假设来源、风险/不确定性。

### 汇总规则
- 主 Agent 汇总各 Agent 输出，交叉验证冲突，生成最终报告。
- 冲突项显式标注并给出裁决理由。

## 避免重复工作
- 按任务类型维护已完成/进行中的分析缓存。
- 相同标的相同维度的结果直接复用，不重复计算。
