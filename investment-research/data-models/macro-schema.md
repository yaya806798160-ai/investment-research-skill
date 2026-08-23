# Macro Schema

## Objective
定义宏观分析的标准输入格式，统一宏观对行业与资产影响评估的数据契约。

## 字段规范

| 字段 | 类型 | 说明 |
|---|---|---|
| Interest Rate | object | 利率水平与方向（政策利率、收益率） |
| Inflation | object | 通胀水平与趋势（CPI/PPI） |
| Currency | object | 汇率与方向 |
| Liquidity | object | 流动性环境（货币供应、信用） |
| Economic Cycle | string | 经济周期位置 |
| Geopolitical Risk | object | 地缘风险与影响 |

## 使用规范
- 每个字段标注数据来源与更新时间。
- 区分实际值/预期值，注意边际变化。
- 该 schema 作为 macro impact 评估的输入契约。
