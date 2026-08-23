# Decision Memory

## Objective
定义投资决策记录系统：保存每次投资决策的完整上下文，供复盘与学习。

## 记录字段

| 字段 | 说明 |
|---|---|
| Decision ID | 决策唯一标识 |
| Date | 决策日期 |
| Asset | 标的 |
| Action | Buy / Add / Hold / Reduce / Exit |
| Decision Reason | 决策理由 |
| Investment Thesis | 投资论点 |
| Key Assumptions | 关键假设 |
| Expected Outcome | 预期结果 |
| Time Horizon | 时间期限 |
| Risk Factors | 风险因素 |

## 要求
- 保存每次投资决策的完整上下文。
- 决策时即记录，事后不修改；修正另建记录并关联。
