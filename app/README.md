# Investment OS — UI MVP

Investment Research Skill v2.5 的前端 MVP（`app/` 独立目录，不影响任何 Skill 文档）。

## 技术栈
- 纯 HTML / CSS / 原生 JavaScript（无框架、无构建、无外部依赖）
- 单页应用（SPA），hash 路由
- 图表为手写 SVG 环形图（无图表库）
- 数据层为 Mock + `DataSource` 接口，可无缝替换为真实 API

## 页面
| 路由 | 页面 | 说明 |
|---|---|---|
| `#/dashboard` | 仪表盘 | Market Overview、Portfolio Overview、Asset Allocation（饼图）、Opportunity Ranking、Watchlist、Latest Research |
| `#/decision` | 决策中心 | 输入股票/基金名称 → 投资评分、买卖建议、风险提示、逻辑变化条件 |
| `#/portfolio` | 组合 | 持仓列表、仓位、分类、风险暴露、调整建议 |
| `#/research` | 研究报告 | 股票/基金/行业研究报告列表 |
| `#/journal` | 投资日志 | 记录买入/卖出理由与复盘（localStorage 持久化） |

## 运行方式
无需构建。任选其一：

1. 直接双击打开 `app/index.html`（file:// 可用）。
2. 本地静态服务器（推荐）：
   ```bash
   cd app
   python -m http.server 8080
   # 打开 http://localhost:8080
   ```
3. Node：
   ```bash
   cd app
   npx serve .
   ```

## 接入真实数据
在 `app/js/data.js` 中实现 `DataSource` 接口（`getMarket` / `getPortfolio` / `getAllocation` / `getOpportunities` / `getWatchlist` / `getResearch` / `getHoldings` / `analyzeAsset`），
返回结构保持不变即可，视图层无需改动。建议按 v1.6 `api/data-interface.md` 的 JSON 契约对接。

## 说明
- 当前为 Mock 数据演示版，数据不构成投资建议。
- 所有展示均为示意；真实决策需结合个人投资政策与人工判断。