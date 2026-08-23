# Ranking Engine

## Objective
定义股票/基金排名系统：基于多维度综合排序，输出 Opportunity Ranking。

## 输入
- Factor Score：因子得分。
- Valuation：估值。
- Risk：风险。
- Catalyst：催化剂。

## 输出
Opportunity Ranking，格式：

| Rank | Asset | Score | Strength | Weakness | Risk |
|---|---|---|---|---|---|
| 1 | ... | ... | ... | ... | ... |

## 规则
- 不能只按涨幅排名。
- 排名需说明 Strength / Weakness / Risk，供人工复核。
