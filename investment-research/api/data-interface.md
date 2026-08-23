# Data Interface

## Objective
定义统一数据接口规范，解耦数据源与分析流程，保持供应商可替换。

## 输入
- Security：标的（代码/名称，如 NVDA、600000.SH）。
- Date：日期或日期区间。
- Data Type：数据类型（market / financial / macro / news）。

## 输出
标准 JSON 数据结构：

```json
{
  "security": "NVDA",
  "date": "2026-08-23",
  "data_type": "market",
  "data": { }
}
```

- market：行情（price、volume、market_cap、moving_average、volatility 等）。
- financial：财务（revenue、eps、gross_margin、operating_margin、fcf、balance_sheet、guidance、estimates）。
- macro：宏观（interest_rate、inflation、currency、liquidity、cycle、geopolitical）。
- news：新闻（company、industry、earnings、policy、sentiment）。

## 要求
- 不绑定具体供应商：接口只定义契约，数据源可替换。
- 字段命名稳定，扩展用可选字段。
- 错误与缺失显式返回（null / error），禁止静默失败。
