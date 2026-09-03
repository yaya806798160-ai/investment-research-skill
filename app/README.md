# Investment OS — UI MVP

Investment Research Skill v2.5 的前端 MVP（`app/` 独立目录，不影响任何 Skill 文档）。

## 技术栈
- 纯 HTML / CSS / 原生 JavaScript（无框架、无构建、无外部依赖）
- 单页应用（SPA），hash 路由；图表为手写 SVG 环形图
- 数据层：`DataSource` 接口 + `portfolio-data.json`（个人组合）+ 演示数据

## 页面
| 路由 | 页面 | 说明 |
|---|---|---|
| `#/dashboard` | 仪表盘 | Market Overview、Portfolio Overview（真实组合）、Asset Allocation（真实分类饼图）、Investor Profile、Action Center、Opportunity Ranking、Watchlist、Latest Research |
| `#/decision` | 决策中心 | 输入股票/基金名称 → 投资评分、买卖建议、风险提示、逻辑变化条件 |
| `#/portfolio` | 组合 | 持仓列表（来自 portfolio-data.json）：名称/金额/分类/占比/风险/建议 |
| `#/research` | 研究报告 | 股票/基金/行业研究报告列表 |
| `#/journal` | 投资日志 | 记录买入/卖出理由与复盘（localStorage 持久化） |

## 个人组合数据
编辑 `app/portfolio-data.json`：
- `holdings`：每只基金/资产（name、amount 金额、category 分类）
- `profile`：投资者画像（目标/风险承受/最大回撤/策略）
- `actionCenter`：当前建议 / 风险提醒 / 下一步动作

仪表盘与组合页会自动读取该文件；`file://` 直接打开时使用内置兜底副本（需同步修改 `js/data.js` 的 `DEFAULT_PORTFOLIO`）。

## 运行方式（真实行情需走本地代理）
```bash
cd app
python server.py                # 静态托管 + 数据代理，打开 http://127.0.0.1:8080
# 或 python -m http.server 8080（无真实行情代理，仅静态演示）
```
`file://` 直接打开可用（组合数据走内置兜底，行情为演示/不可用）。

## 真实数据（Phase 1）
- 数据源：`market.ft.tech/gateway`（东方财富口径）+ `ftai.chat`，由 `server.py` 同源代理 `/mt`、`/ai`。
- 已接入：A股 沪深300（东财日估值）、港股 恒生指数（东财日K）、美股 S&P500（腾讯证券为主/东财兜底）、美联储政策利率（月频）。
- 基金净值：东方财富 lsjz（主，带重试）→ ftshare（备）；今日涨跌/盈亏按持仓市值估算。
- 原则：只展示真实返回并标注 数据源/数据时间；拉取失败显示“数据暂不可用”，**不伪造行情**。

## 接入真实数据
在 `app/js/data.js` 中实现 `DataSource` 接口（`getMarket` / `getPortfolio` / `getAllocation` / `getProfile` / `getActionCenter` / `getHoldings` 等），返回结构保持不变即可，视图层无需改动。建议按 v1.6 `api/data-interface.md` 的 JSON 契约对接。

## 说明
- 组合为手动录入的真实持仓（金额）；今日变化在配置基金代码且数据源覆盖后可自动计算；累计收益需成本口径（Phase 2）。
- 市场概览的 A股/港股/利率为真实数据；美股指数与持仓基金净值视数据源覆盖而定。
- 机会排名、观察池、研究列表仍为演示数据，不构成投资建议。
- 所有建议均为示意；真实决策需结合个人投资政策与人工判断。
## Phase 2 数据（基金代码 / 成本口径）
- `portfolio-data.json`：`amount` = 当前持仓市值（非成本）；每只持仓 `fundCode`（东财 6 位代码，来源见下）与 `costBasis: null`（**预留成本，后续补真实成本后开启累计收益率**；禁止用市值反推成本）。
- 基金代码解析来源：`fund.eastmoney.com/js/fundcode_search.js`（全市场 27,763 只名称→代码）。A/C 份额按显示名默认取 A；若有出入改 `fundCode` 即可。
- 已确认：纳斯达克基金 = 建信纳斯达克100指数(QDII)A人民币 `539001`；浦银智能科技 = 浦银全球智能科技(QDII)A `006555`，已归类 QDII全球/全球（原误标 A股/科技AI）。
- 未解决：`costBasis` 仍为 null（累计收益率/累计盈亏保持关闭，待真实成本）；若某持仓实际为 C 份额可改 `fundCode`。

## Phase 3 Opportunity Radar
- 仪表盘「Opportunity Radar · 机会雷达」取代演示排名：9 个候选（沪深300/红利低波50/医药/消费/新能源车/黄金/半导体ETF/腾讯/纳指100已持有）。
- 维度：趋势/动量/资金(量能)/波动率/拥挤度 = 腾讯日K真实计算；估值/盈利/催化剂 = 规则假设(已标注)；重合度 = 基于 portfolio-data.json 的 类别/地区暴露。
- 约束：类别暴露 >40% → 回避；>25% → 小仓试探；已持有(如建信纳指) → “回避（已持有）”，避免追高已有暴露方向。
- 运行：`python server.py`（含 /qz 腾讯日K 代理）。K线维度需本机可访问 qt.gtimg.cn/web.ifzq.gtimg.cn；失败时该行显示“数据不足”，不伪造。