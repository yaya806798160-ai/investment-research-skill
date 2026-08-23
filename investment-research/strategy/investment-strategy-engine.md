# Investment Strategy Engine

## Objective
定义投资策略判断系统：判断一个投资动作是否符合长期盈利策略，而非价格本身。

## 输入
- Asset：标的
- Current Price：当前价格
- Valuation：估值
- Position Size：当前仓位
- Portfolio Context：组合背景
- Market Environment：市场环境

## 分析
1. Business Quality：业务质量与护城河。
2. Industry Cycle：行业周期位置。
3. Valuation：估值与隐含预期。
4. Risk Reward：风险收益比。
5. Opportunity Cost：机会成本（与其他机会比较）。
6. Portfolio Impact：对组合的影响（集中度、相关性、回撤）。

## 输出
Strategy Decision：
- Buy
- Add Gradually
- Hold
- Wait
- Reduce
- Exit

## 规则
- 不能只因为价格上涨或下跌给出建议。
- 决策必须绑定业务、周期、估值、风险与组合背景。
