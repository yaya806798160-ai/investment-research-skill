# Investment Discipline Engine

## Objective
定义投资纪律检查：识别行为偏差，输出 Behavior Risk Report。

## 检测
- FOMO：追涨、怕错过。
- Panic Selling：恐慌卖出。
- Over Trading：过度交易。
- Confirmation Bias：只找支持自己的证据。
- Loss Aversion：亏损厌恶导致过早止损/过久持有。
- Concentration Risk：集中度过高。

## 输出
Behavior Risk Report：偏差类型、触发场景、影响、纠正动作。

## 检查示例
发现用户因下跌恐慌卖出时，系统应检查：
- 基本面是否改变。
- 原始投资逻辑是否失效。
- 是否只是市场波动。
若逻辑未变且仅是波动，应提示纪律而非顺应恐慌。
