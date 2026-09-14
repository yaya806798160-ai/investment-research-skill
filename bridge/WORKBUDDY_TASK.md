# Codex / WorkBuddy 执行任务：打通 Investment OS → ChatGPT

请直接在本仓库完成，不要只写方案。

## 目标

让 ChatGPT 以后在用户问“现在呢”“14:30怎么操作”时，能够通过 GitHub 连接器读取 `bridge/live/latest.json`，获得分钟级盘中快照，再做基金决策。

## 实现要求

1. 复用现有 `app/server.py` 以及 `/em/`、`/qq/`、`/qz/`、`/emq/` 等数据代理，不重造整套行情系统。
2. 把 WorkBuddy 今天已能生成的板块资金 CSV/HTML 快照接入统一导出器；若已有现成脚本，优先复用。
3. 新增本地采集/归一化脚本，输出必须符合 `bridge/latest.example.json` 的字段结构。
4. 输出：
   - `bridge/live/latest.json`
   - `bridge/live/YYYYMMDD-HHMM.json`（关键时点归档）
5. 数据必须带 `generated_at`、`source_time`、来源与缺失字段；旧于 8 分钟的数据必须标记 stale。
6. 交易日强制刷新：09:35、10:00、11:25、13:30、14:00、14:15、14:30、14:35、14:45、14:52；14:00–15:00 可每 5 分钟刷新。
7. 14:00 后额外抓：涨停扩散、20CM/10CM数量、板块主力/超大单资金、核心股分时回流。
8. 重点主题：CPO/光模块、PCB、AI算力、半导体设备、国产GPU/AI芯片。
9. 重点基金映射：021528、017811、018123、008888。
10. 采集完成后自动 `git add bridge/live`，仅在关键时点提交并 push，避免无意义高频 commit；建议 14:30、14:45、14:52 强制 push，其余本地保留或批量提交。
11. Windows 上建立自动任务/常驻进程，开机后可自启动；失败要重试并写 `bridge/logs/collector.log`。
12. 不得把任何 API key、cookie、个人凭据提交到 GitHub。

## 验收

- 运行一次后 `bridge/live/latest.json` 有当天时间戳和真实数据。
- ChatGPT 能通过 GitHub 读取该文件。
- 2026-09-14 的 PCB 类型案例能被识别：多股涨停扩散 + PCB资金净流入，即使通信/半导体整体净流出，也必须在快照中明确体现局部强势。
- 若数据源失败，快照明确写 missing/stale，不能伪造。
