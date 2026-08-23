# Stock Schema

## Objective
定义股票分析的标准输入格式，统一研究流水线各环节的数据契约。

## 字段规范

| 字段 | 类型 | 说明 |
|---|---|---|
| Ticker | string | 股票代码（如 NVDA） |
| Market | string | 上市市场 |
| Sector | string | 板块 |
| Price | number | 当前价格 |
| Market Cap | number | 市值 |
| Revenue Growth | number | 营收增速（%） |
| Gross Margin | number | 毛利率（%） |
| Operating Margin | number | 营业利润率（%） |
| FCF | number | 自由现金流 |
| Valuation | object | 估值指标（PE/PS/EV/EBITDA/PEG 等） |
| Technical Indicators | object | 技术指标（均线、RSI、量价） |
| Risk Factors | array | 风险因素列表 |

## 使用规范
- 字段缺省显式标注，禁止编造。
- 单位与口径（货币、TTM/季度）在元数据中标注。
- 该 schema 作为 stock analysis 各工具的输入契约。
