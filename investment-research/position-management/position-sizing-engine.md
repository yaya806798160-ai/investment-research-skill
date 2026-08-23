# Position Sizing Engine

## Objective
定义仓位模型：根据确信度、估值、波动与组合约束确定仓位。

## 考虑
- Conviction：确信度。
- Valuation Margin：估值安全边际。
- Volatility：波动率。
- Portfolio Exposure：组合敞口。
- Liquidity：流动性。

## 输出
Position Size Recommendation：
- Initial Position：初始仓位。
- Add Position：加仓仓位。
- Maximum Position：最大仓位。

## 规则
- 仓位绑定确信度与风险，禁止仅凭情绪决定仓位。
