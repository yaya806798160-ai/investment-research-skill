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

## 运行方式
```bash
cd app
python -m http.server 8080     # 打开 http://localhost:8080
# 或直接双击 app/index.html（file:// 可用，组合数据走内置兜底）
```

## 接入真实数据
在 `app/js/data.js` 中实现 `DataSource` 接口（`getMarket` / `getPortfolio` / `getAllocation` / `getProfile` / `getActionCenter` / `getHoldings` 等），返回结构保持不变即可，视图层无需改动。建议按 v1.6 `api/data-interface.md` 的 JSON 契约对接。

## 说明
- 组合为手动录入的真实持仓（金额），行情类字段（今日变化/收益率）待接入行情后填充。
- 机会排名、观察池、研究列表为演示数据，不构成投资建议。
- 所有建议均为示意；真实决策需结合个人投资政策与人工判断。