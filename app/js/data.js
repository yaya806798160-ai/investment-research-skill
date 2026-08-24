/**
 * Investment OS — Data Layer
 * - 组合数据：从 portfolio-data.json 读取（file:// 模式下用内置兜底副本）
 * - 自动计算：总资产、类别占比、科技暴露、新兴市场比例、风险评分（v2.3 规则）
 * - 市场/机会/观察池/研究：当前为演示数据
 * - 接入真实行情/财务 API 时：实现 DataSource 的 getXxx() 为 fetch 即可，视图层无需改动
 */
'use strict';

/* portfolio-data.json 的内置兜底副本（file:// 无法 fetch 时使用） */
const DEFAULT_PORTFOLIO = {
  updatedAt: '2026-08-24',
  currency: 'CNY',
  holdings: [
    { name: '建信新兴市场QDII', amount: 90000, category: 'QDII全球', region: '新兴市场' },
    { name: '财通成长C', amount: 18000, category: '成长', region: 'A股' },
    { name: '华夏国证半导体', amount: 11000, category: '科技/AI', region: 'A股' },
    { name: '东方人工智能', amount: 11000, category: '科技/AI', region: 'A股' },
    { name: '浦银智能科技', amount: 10000, category: '科技/AI', region: 'A股' },
    { name: '永赢数字经济', amount: 4000, category: '科技/AI', region: 'A股' },
    { name: '纳斯达克基金', amount: 7000, category: 'QDII全球', region: '美国' },
    { name: '南方红利低波', amount: 2000, category: '红利', region: 'A股' }
  ],
  profile: {
    goal: '10年以上资产增长',
    riskTolerance: '中等偏高',
    maxDrawdown: '25%-30%',
    strategy: '全球成长 + 科技 + 现金流'
  },
  actionCenter: {
    currentAdvice: '科技/AI 与 QDII 占比偏高（合计约 87%），建议分批止盈部分高波动仓位，回补红利/现金流仓位',
    riskAlert: 'QDII 占比约 63%，关注汇率与海外市场波动；最大回撤目标 25%-30%，单只高波动基金需设减仓纪律',
    nextAction: '在决策中心逐只分析持仓；加仓/减仓前记录理由到投资日志；每月复查再平衡'
  }
};

const CATEGORY_COLORS = {
  'QDII全球': '#3b82f6',
  '科技/AI': '#35c48d',
  '成长': '#eab308',
  '红利': '#a78bfa',
  '现金': '#64748b'
};
const CATEGORY_ADVICE = {
  'QDII全球': '维持（注意汇率）',
  '科技/AI': '关注集中度，逢高减',
  '成长': '维持',
  '红利': '可逐步增配'
};

let _portfolioCache = null;
async function loadPortfolio() {
  if (_portfolioCache) return _portfolioCache;
  try {
    const r = await fetch('portfolio-data.json');
    if (r.ok) {
      const d = await r.json();
      if (d && d.holdings && d.holdings.length) { _portfolioCache = d; return d; }
    }
  } catch (e) { /* fall through */ }
  _portfolioCache = DEFAULT_PORTFOLIO;
  return _portfolioCache;
}

function sumHoldings(holdings) {
  return holdings.reduce(function (s, h) { return s + Number(h.amount); }, 0);
}
function pct(part, total) {
  return Math.round((part / total) * 1000) / 10;
}

/**
 * 风险评分（0-100）——基于 v2.3 risk-framework / risk-budgeting：
 * Portfolio Risk：Concentration（集中度）/ Correlation（地域相关性）/ Position Size（单仓）
 * + 高波动资产风险限制（科技暴露）+ 防御缓冲（红利/现金）+ 分散度
 *  1) 集中度（最大单仓权重）：>50% +25 | 30–50% +15 | <30% +5
 *  2) 科技/AI 暴露：>30% +20 | 15–30% +12 | <15% +5
 *  3) 地域集中（最大地区权重）：>50% +15 | 30–50% +8 | <30% +3
 *  4) 防御缓冲（红利+现金占比）：<10% +15 | 10–20% +8 | >20% +3
 *  5) 分散度（持仓数量）：≤5 +10 | 6–10 +4 | >10 +2
 * 分级：≥80 高 | 61–79 偏高 | 31–60 中 | ≤30 低
 */
function computeRiskScore(holdings, total) {
  const maxHold = Math.max.apply(null, holdings.map(function (h) { return Number(h.amount); }));
  const maxHoldPct = pct(maxHold, total);
  const catMap = {}, regionMap = {};
  let tech = 0, defensive = 0;
  holdings.forEach(function (h) {
    const amt = Number(h.amount);
    catMap[h.category] = (catMap[h.category] || 0) + amt;
    regionMap[h.region] = (regionMap[h.region] || 0) + amt;
    if (h.category === '科技/AI') tech += amt;
    if (h.category === '红利' || h.category === '现金') defensive += amt;
  });
  const techPct = pct(tech, total);
  const maxRegionPct = pct(Math.max.apply(null, Object.keys(regionMap).map(function (k) { return regionMap[k]; })), total);
  const defPct = pct(defensive, total);
  const count = holdings.length;

  let score = 0;
  score += maxHoldPct > 50 ? 25 : maxHoldPct >= 30 ? 15 : 5;
  score += techPct > 30 ? 20 : techPct >= 15 ? 12 : 5;
  score += maxRegionPct > 50 ? 15 : maxRegionPct >= 30 ? 8 : 3;
  score += defPct < 10 ? 15 : defPct <= 20 ? 8 : 3;
  score += count <= 5 ? 10 : count <= 10 ? 4 : 2;

  const label = score >= 80 ? '高' : score >= 61 ? '偏高' : score >= 31 ? '中' : '低';
  const cls = score >= 80 ? 'risk-high' : score >= 61 ? 'risk-mid' : 'risk-low';
  return { score: score, label: label, cls: cls, techPct: techPct, emergingPct: pct(regionMap['新兴市场'] || 0, total) };
}

/* 其余演示数据 */
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

function fmtMoney(n) {
  return '¥' + Number(n).toLocaleString('zh-CN');
}
function gradeClass(g) {
  return 'badge ' + String(g).toLowerCase();
}

/**
 * DataSource 接口 —— 接入真实数据时在此实现（返回结构保持不变）：
 * 例如：async getMarket() { const r = await fetch('/api/market'); return r.json(); }
 */
const DataSource = {
  async getMarket() { return MockDB.market; },
  async getPortfolio() {
    const d = await loadPortfolio();
    const total = sumHoldings(d.holdings);
    const risk = computeRiskScore(d.holdings, total);
    return {
      total: total,
      count: d.holdings.length,
      techExposure: risk.techPct,
      emergingExposure: risk.emergingPct,
      riskScore: risk.score,
      riskLabel: risk.label,
      riskCls: risk.cls,
      maxDrawdown: '目标 ' + d.profile.maxDrawdown,
      today: '待行情接入',
      return: '待行情接入'
    };
  },
  async getProfile() { return (await loadPortfolio()).profile; },
  async getActionCenter() { return (await loadPortfolio()).actionCenter; },
  async getAllocation() {
    const d = await loadPortfolio();
    const total = sumHoldings(d.holdings);
    const map = {};
    d.holdings.forEach(function (h) {
      map[h.category] = (map[h.category] || 0) + Number(h.amount);
    });
    const colors = ['#3b82f6', '#35c48d', '#eab308', '#a78bfa', '#64748b'];
    const names = Object.keys(map);
    return names.map(function (n, i) {
      return {
        name: n,
        value: pct(map[n], total),
        amount: map[n],
        color: CATEGORY_COLORS[n] || colors[i % colors.length]
      };
    });
  },
  async getOpportunities() { return MockDB.opportunities; },
  async getWatchlist() { return MockDB.watchlist; },
  async getResearch() { return MockDB.research; },
  async getHoldings() {
    const d = await loadPortfolio();
    const total = sumHoldings(d.holdings);
    return d.holdings.map(function (h) {
      return {
        asset: h.name,
        amount: h.amount,
        cat: h.category,
        region: h.region || '—',
        pct: pct(Number(h.amount), total),
        risk: h.category === '科技/AI' ? '高' : h.category === 'QDII全球' ? '中' : '低',
        advice: CATEGORY_ADVICE[h.category] || '维持'
      };
    });
  },
  async analyzeAsset(name) {
    const key = String(name || '').trim().toLowerCase();
    if (MockDB.analysisLib[key]) return MockDB.analysisLib[key];
    if (key.includes('腾讯')) return MockDB.analysisLib['腾讯'];
    if (key.includes('沪深300')) return MockDB.analysisLib['沪深300'];
    if (key.includes('nvidia') || key.includes('英伟达')) return MockDB.analysisLib['nvda'];
    if (key.includes('台积电') || key.includes('tsm')) return MockDB.analysisLib['台积电'];
    return {
      score: 60, grade: 'C', action: '等待更多数据 / 观察', rating: '观察',
      risks: ['数据不足，需补充基本面与估值', '未在观察池中', '需人工复核'],
      change: '待深度研究后再给出结论'
    };
  }
};