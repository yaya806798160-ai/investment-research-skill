# Fund Schema

## Objective
定义基金分析的标准输入格式，统一基金评估与组合配置的数据契约。

## 字段规范

| 字段 | 类型 | 说明 |
|---|---|---|
| Fund Name | string | 基金名称 |
| Fund Code | string | 基金代码 |
| Category | string | 基金类型/分类 |
| Holdings | array | 前十大重仓 |
| Sector Exposure | object | 行业暴露 |
| Geographic Exposure | object | 地理/市场暴露 |
| Expense Ratio | number | 费率（%） |
| Historical Return | object | 历史收益（多区间） |
| Drawdown | number | 最大回撤（%） |
| Risk Level | string | 风险等级（R1–R5） |

## 使用规范
- 持仓与暴露需标注报告期。
- 收益与回撤标注区间与基准。
- 该 schema 作为 fund analysis 与组合重叠度分析的输入契约。
