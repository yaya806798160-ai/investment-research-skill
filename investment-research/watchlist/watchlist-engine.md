# Watchlist Engine

## Objective
定义投资观察池：持续跟踪候选标的，记录逻辑、入场条件与风险触发，输出定期观察报告。

## 支持类别
- Growth stocks
- AI companies
- Semiconductor companies
- Funds
- ETFs

## 记录字段

| 字段 | 说明 |
|---|---|
| Name | 名称 |
| Ticker | 代码 |
| Category | 类别 |
| Thesis | 投资逻辑 |
| Entry condition | 入场条件 |
| Target valuation | 目标估值 |
| Risk trigger | 风险触发条件 |
| Last review date | 最近复核日期 |

## 输出
Watchlist Report：
- New opportunities：新增机会。
- Thesis changes：逻辑变化。
- Risk alerts：风险预警。

## 维护规则
- 定期复核（周/月），更新 Last review date。
- 触发入场条件时转入正式研究；触发风险条件时降级或移除。
