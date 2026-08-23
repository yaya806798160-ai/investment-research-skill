# Company Database

## Objective
建立公司研究数据库规范，覆盖美股成长股、AI、半导体、科技公司，支撑公司质量、成长性与估值分析。

## 字段规范

| 字段 | 说明 |
|---|---|
| Company Name | 公司名称（官方名称） |
| Ticker | 股票代码（如 NVDA、TSM、MSFT） |
| Market | 上市市场（如 NASDAQ、NYSE） |
| Sector | 板块（如 Information Technology） |
| Industry | 行业（如 Semiconductors） |
| Value Chain Position | 产业链位置（上游/中游/下游、环节） |
| Core Products | 核心产品与服务 |
| Revenue Sources | 收入来源（分业务/分地区占比） |
| Competitive Advantages | 竞争优势（护城河来源） |
| Main Competitors | 主要竞争对手 |
| Growth Drivers | 成长驱动因素 |
| Key Risks | 关键风险 |

## 适用场景
- 美股成长股、AI、半导体、科技公司的研究建档。
- 公司间横向比较与行业图谱构建。

## 维护规则
- 数据标注来源与更新时间；重大变化（业务/管理层/风险）及时更新。
- 字段缺省时显式标注 unknown / N/A，禁止编造。
