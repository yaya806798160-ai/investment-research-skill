# Earnings History

## Objective
建立财报历史数据库规范，追踪业绩趋势、预期差与分析师观点变化。

## 字段规范

| 字段 | 说明 |
|---|---|
| Revenue Growth | 营收同比增速 |
| EPS Growth | EPS 同比增速 |
| Gross Margin | 毛利率 |
| Operating Margin | 营业利润率 |
| Free Cash Flow | 自由现金流 |
| Guidance | 公司指引（营收/利润） |
| Earnings Surprise | 业绩超预期/不及预期幅度 |
| Analyst Revision | 分析师盈利预测修正 |
| Management Commentary | 管理层点评要点 |

## 用途
- 业绩趋势与经营杠杆判断。
- 预期差与指引变化的边际信号。
- 分析师修正作为情绪与预期指标。

## 维护规则
- 按报告期记录，区分报告期与发布日期。
- 口径一致（GAAP/non-GAAP 需标注）。
- 管理层点评记录关键语句与变化。
