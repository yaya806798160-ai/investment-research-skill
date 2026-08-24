/**
 * Investment OS — Data Layer
 * 当前为 Mock 数据（demo 用）。接入真实数据时：
 * 实现 DataSource 接口（见文件底部 TODO），把 getXxx() 替换为 fetch 调用即可，
 * 视图层无需改动。数据结构已在各返回对象中固定。
 */
'use strict';

const MockDB = {
  market: {
    global: { trend: '偏强', regime: '震荡上行', riskLevel: '中', riskColor: 'risk-mid' },
    items: [
      { key: 'us', label: '美股', value: 'S&P 500', chg: '+0.62%', dir: 'up' },
      { key: 'cn', label: 'A股', value: '沪深300', chg: '-0.21%', dir: 'down' },
      { key: 'hk', label: '港股', value: '恒生指数', chg: '+0.38%', dir: 'up' },
      { key: 'rate', label: '利率', value: '10Y UST', chg: '4.15%', dir: 'flat' },
      { key: 'risk', label: '风险等级', value: '中等', chg: 'Risk 62/100', dir: 'flat' }
    ],
    events: [
      { t: '美联储 7 月会议纪要：维持利率不变，措辞略偏鹰', tag: '宏观' },
      { t: 'NVDA 财报临近，AI 板块波动加大', tag: '财报' },
      { t: '中国 7 月社融数据超预期', tag: '数据' }
    ]
  },
  portfolio: {
    total: 1286500,
    today: '+0.82%',
    return: '+12.4%',
    riskScore: 62,
    maxDrawdown: '-8.3%'
  },
  allocation: [
    { name: '全球核心', value: 35, color: '#3b82f6' },
    { name: 'AI科技', value: 25, color: '#35c48d' },
    { name: '新兴市场', value: 15, color: '#eab308' },
    { name: '红利', value: 15, color: '#a78bfa' },
    { name: '现金', value: 10, color: '#64748b' }
  ],
  opportunities: [
    { asset: 'NVDA', score: 88, grade: 'A', reason: 'AI算力需求强劲，CoWoS 产能瓶颈支撑定价权', risk: '估值高、客户资本开支周期' },
    { asset: '台积电 (TSM)', score: 85, grade: 'A', reason: '先进制程代工龙头，受益 AI 芯片放量', risk: '地缘风险、资本开支强度' },
    { asset: '中际旭创', score: 78, grade: 'B', reason: '800G/1.6T 光模块放量，AI 集群互连需求', risk: '技术路线（CPO）替代' },
    { asset: '长江电力', score: 74, grade: 'B', reason: '现金流稳定，电力基础设施属性', risk: '利率上行压制估值' },
    { asset: '恒瑞医药', score: 63, grade: 'C', reason: '创新药管线，行业景气修复', risk: '集采、研发失败' }
  ],
  watchlist: [
    { asset: 'NVDA', thesis: 'AI 算力核心，生态壁垒', entry: '回调至 200 日均线附近分批', risk: '数据中心 Capex 下修' },
    { asset: '腾讯控股', thesis: '游戏+广告复苏，AI 应用落地', entry: '估值处于历史中位以下', risk: '监管、宏观消费' },
    { asset: '沪深300ETF', thesis: '核心资产，估值低位', entry: 'PE 分位 < 30% 加仓', risk: '经济复苏不及预期' },
    { asset: '红利低波ETF', thesis: '高股息防御，现金流', entry: '股息率 > 5% 买入', risk: '利率快速上行' }
  ],
  research: {
    stock: [
      { title: 'NVDA 深度研究：AI 资本开支周期下的算力之王', date: '2026-08-20', type: '股票研究' },
      { title: '台积电业绩点评：3nm 满载，CoWoS 扩产', date: '2026-08-18', type: '股票研究' },
      { title: '中际旭创：1.6T 光模块放量在即', date: '2026-08-12', type: '股票研究' }
    ],
    fund: [
      { title: 'AI 主题基金持仓穿透与重复度分析', date: '2026-08-16', type: '基金研究' },
      { title: '红利低波组合回撤与现金流测算', date: '2026-08-09', type: '基金研究' }
    ],
    industry: [
      { title: 'AI 产业链月报：从芯片到电力', date: '2026-08-15', type: '行业研究' },
      { title: '半导体周期位置与设备国产化', date: '2026-08-05', type: '行业研究' }
    ]
  },
  holdings: [
    { asset: '沪深300ETF', pos: '20%', cat: '核心仓', risk: '低', advice: '加仓' },
    { asset: '红利低波ETF', pos: '15%', cat: '核心仓', risk: '低', advice: '维持' },
    { asset: 'NVDA', pos: '12%', cat: '主题仓', risk: '高', advice: '减仓' },
    { asset: 'AI算力ETF', pos: '13%', cat: '主题仓', risk: '高', advice: '减仓' },
    { asset: '腾讯控股', pos: '10%', cat: '卫星仓', risk: '中', advice: '维持' },
    { asset: '新兴市场ETF', pos: '5%', cat: '卫星仓', risk: '中', advice: '观察' },
    { asset: '现金', pos: '25%', cat: '现金仓', risk: '低', advice: '维持' }
  ],
  analysisLib: {
    'nvda': { score: 88, grade: 'A', action: '持有 / 回调分批加仓', rating: '强关注',
      risks: ['估值处于历史高分位', '客户资本开支波动', '出口管制风险'],
      change: '数据中心资本开支下修、或推理成本崩塌时需重新评估' },
    '腾讯': { score: 76, grade: 'B', action: '持有 / 研究逐步建仓', rating: '研究',
      risks: ['宏观消费疲软', '游戏版号与监管', '投资资产波动'],
      change: '游戏流水大幅低于预期、或监管收紧时需重新评估' },
    '台积电': { score: 85, grade: 'A', action: '持有 / 可加仓', rating: '强关注',
      risks: ['地缘政治', '资本开支强度', '先进制程竞争'],
      change: 'AI 订单下修或地缘风险显著升级时需重新评估' },
    '沪深300': { score: 70, grade: 'B', action: '分批加仓', rating: '值得配置',
      risks: ['经济复苏不及预期', '汇率与外资流向'],
      change: '盈利预期持续下修时需重新评估' }
  },
  journalDefaults: [
    { date: '2026-08-12', type: '买入', asset: 'AI算力ETF', reason: 'AI 资本开支上修，主题景气度确认，分批建仓' },
    { date: '2026-08-05', type: '复盘', asset: '组合', reason: '7 月回撤 -3.2%，主因主题仓集中度过高，执行再平衡' }
  ]
};

/** 简易格式化 */
function fmtMoney(n) {
  return '¥' + n.toLocaleString('zh-CN');
}
function gradeClass(g) {
  return 'badge ' + String(g).toLowerCase();
}

/**
 * DataSource 接口占位 —— 接入真实数据时在此实现：
 *   1. 用 fetch 调用后端/API（可参考 v1.6 api/data-interface.md 的 JSON 契约）
 *   2. 保持下方方法签名与返回结构不变
 * 例如：
 *   async getMarket() { const r = await fetch('/api/market'); return r.json(); }
 */
const DataSource = {
  async getMarket() { return MockDB.market; },
  async getPortfolio() { return MockDB.portfolio; },
  async getAllocation() { return MockDB.allocation; },
  async getOpportunities() { return MockDB.opportunities; },
  async getWatchlist() { return MockDB.watchlist; },
  async getResearch() { return MockDB.research; },
  async getHoldings() { return MockDB.holdings; },
  async analyzeAsset(name) {
    const key = String(name || '').trim().toLowerCase();
    if (MockDB.analysisLib[key]) return MockDB.analysisLib[key];
    if (key.includes('腾讯')) return MockDB.analysisLib['腾讯'];
    if (key.includes('沪深300')) return MockDB.analysisLib['沪深300'];
    if (key.includes('nvidia') || key.includes('英伟达')) return MockDB.analysisLib['nvda'];
    if (key.includes('台积电') || key.includes('tsm')) return MockDB.analysisLib['台积电'];
    // 未知标的：返回中性结果（真实系统应调用后端分析）
    return {
      score: 60, grade: 'C', action: '等待更多数据 / 观察', rating: '观察',
      risks: ['数据不足，需补充基本面与估值', '未在观察池中', '需人工复核'],
      change: '待深度研究后再给出结论'
    };
  }
};