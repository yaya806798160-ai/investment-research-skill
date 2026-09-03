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
    { name: '建信新兴市场QDII', amount: 90000, category: 'QDII全球', region: '新兴市场', fundCode: '539002', costBasis: null },
    { name: '财通成长C', amount: 18000, category: '成长', region: 'A股', fundCode: '021528', costBasis: null },
    { name: '华夏国证半导体', amount: 11000, category: '科技/AI', region: 'A股', fundCode: '008887', costBasis: null },
    { name: '东方人工智能', amount: 11000, category: '科技/AI', region: 'A股', fundCode: '005844', costBasis: null },
    { name: '浦银智能科技', amount: 10000, category: '科技/AI', region: 'A股', fundCode: '006555', costBasis: null },
    { name: '永赢数字经济', amount: 4000, category: '科技/AI', region: 'A股', fundCode: '018122', costBasis: null },
    { name: '纳斯达克基金', amount: 7000, category: 'QDII全球', region: '美国', fundCode: '', costBasis: null },
    { name: '南方红利低波', amount: 2000, category: '红利', region: 'A股', fundCode: '008163', costBasis: null }
  ],
  profile: {
    goal: '10年以上资产增长',
    riskTolerance: '中等偏高',
    maxDrawdown: '25%-30%',
    strategy: '全球成长 + 科技 + 现金流'
  },
  actionCenter: {
    status: '组合偏集中：建信新兴市场QDII 单仓 58.8%，科技/AI 暴露 23.5%，红利仅 1.3%，防御缓冲不足',
    suggestions: [
      { action: '降低单仓集中度', reason: '最大单仓占比 58.8%，超过 v2.3 集中度上限（40%）', trigger: '单仓占比 > 40% 触发；回落至 30% 以下后停止' },
      { action: '回补红利/现金流仓位', reason: '红利+现金仅 1.3%，防御缓冲不足（<10%）', trigger: '红利+现金占比 < 10% 触发；> 20% 后停止' },
      { action: '科技/AI 逢高减仓', reason: '科技/AI 暴露 23.5%，接近 30% 上限', trigger: '科技暴露 > 30% 触发减仓；回落至 20% 以下后停止' }
    ],
    alerts: [
      { level: '高', text: '单一新兴市场 QDII 占比 58.8%，地域集中风险高' },
      { level: '中', text: '汇率风险：QDII 全球类合计约 63%，关注人民币汇率波动' },
      { level: '中', text: '防御缓冲不足：红利+现金仅 1.3%，回撤保护弱' }
    ]
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
  const maxName = holdings.reduce(function (a, b) { return Number(a.amount) > Number(b.amount) ? a : b; }).name;
  const regions = Object.keys(regionMap).map(function (k) {
    return { name: k, pct: pct(regionMap[k], total), amount: regionMap[k] };
  }).sort(function (a, b) { return b.pct - a.pct; });
  return {
    score: score, label: label, cls: cls,
    techPct: techPct, emergingPct: pct(regionMap['新兴市场'] || 0, total),
    maxHoldPct: maxHoldPct, maxHoldName: maxName, regions: regions
  };
}

/**
 * 集中度评分（0-100）——基于 v2.3 Portfolio Risk（Concentration / Position Size）：
 * 最大持仓占比 ≥50% → 90 | 40–50% → 70 | 30–40% → 50 | 20–30% → 30 | <20% → 10
 */
function computeConcentrationScore(maxHoldPct) {
  let s = 10;
  if (maxHoldPct >= 50) s = 90;
  else if (maxHoldPct >= 40) s = 70;
  else if (maxHoldPct >= 30) s = 50;
  else if (maxHoldPct >= 20) s = 30;
  return { score: s, label: s >= 70 ? '高' : s >= 40 ? '中' : '低' };
}


/* ============ 真实数据接入（Phase 1）============
 * 数据源：market.ft.tech/gateway（东方财富口径）+ ftai.chat
 * 访问：优先同源代理 /mt /ai（运行 app/server.py）；兜底直连上游
 * 原则：只展示真实返回；失败显示"数据源暂不可用"，绝不伪造行情
 */
const DATA_SOURCE_NAME = 'market.ft.tech · 东方财富';

function two(n) { return n < 10 ? '0' + n : '' + n; }
function ymd(d) { return '' + d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()); }
function nowStamp() {
  const d = new Date();
  return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + ' ' + two(d.getHours()) + ':' + two(d.getMinutes());
}
function last30Ymd() { const d = new Date(); d.setDate(d.getDate() - 30); return ymd(d); }
function fmtLevel(v) { return v == null ? '' : Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 2 }); }
function signedPct(v) {
  if (v == null || isNaN(v)) return null;
  return (v > 0 ? '+' : '') + (Math.round(v * 1000) / 1000) + '%';
}

async function apiJson(path) {
  let upstream = null;
  if (path.indexOf('/mt/') === 0) upstream = 'https://market.ft.tech/gateway' + path.slice(3);
  else if (path.indexOf('/ai/') === 0) upstream = 'https://ftai.chat' + path.slice(3);
  else if (path.indexOf('/em/') === 0) upstream = 'https://api.fund.eastmoney.com' + path.slice(3);
  else if (path.indexOf('/qq/') === 0) upstream = 'https://qt.gtimg.cn' + path.slice(3);
  else if (path.indexOf('/emq/') === 0) upstream = 'https://push2.eastmoney.com' + path.slice(3);
  if (!upstream) return null;
  const haveOrigin = typeof location !== 'undefined' && location.protocol !== 'file:';
  const attempts = [];
  if (haveOrigin) attempts.push(location.origin + path);
  attempts.push(upstream);
  for (const u of attempts) {
    try {
      const r = await fetch(u, { headers: { 'X-Client-Name': 'ft-claw' } });
      if (!r.ok) continue;
      const j = await r.json();
      if (j && (j.code === 200 || Array.isArray(j.data) || (j.data && (j.data.items || j.data.records)))) return j;
    } catch (e) { /* try next */ }
  }
  return null;
}

/* 文本类接口（如腾讯行情） */
async function apiText(path) {
  const map = { '/qq/': 'https://qt.gtimg.cn', '/em/': 'https://api.fund.eastmoney.com', '/emq/': 'https://push2.eastmoney.com', '/mt/': 'https://market.ft.tech/gateway', '/ai/': 'https://ftai.chat' };
  let upstream = null;
  Object.keys(map).forEach(function (k) { if (path.indexOf(k) === 0) upstream = map[k] + path.slice(k.length); });
  if (!upstream) return null;
  const haveOrigin = typeof location !== 'undefined' && location.protocol !== 'file:';
  const attempts = [];
  if (haveOrigin) attempts.push(location.origin + path);
  attempts.push(upstream);
  for (const u of attempts) {
    try {
      const r = await fetch(u, { headers: { 'X-Client-Name': 'ft-claw' } });
      if (r.ok) return await r.text();
    } catch (e) { /* next */ }
  }
  return null;
}

async function fetchIndexCn() {
  const j = await apiJson('/mt/api/v1/market/data/eastmoney-market-valuation?market_code=000300&page=1&page_size=1');
  const rec = j && j.data && j.data.records && j.data.records[0];
  if (!rec || rec.close_price == null) return null;
  const chg = Number(rec.change_rate);
  return { label: 'A股', name: '沪深300', level: Number(rec.close_price), chg: chg, dir: chg > 0 ? 'up' : chg < 0 ? 'down' : 'flat', date: String(rec.trade_date || '') };
}
async function fetchIndexHk() {
  const j = await apiJson('/mt/api/v1/market/data/eastmoney-hk-index-daily-kline?index_code=HSI&start_date=' + last30Ymd() + '&end_date=' + ymd(new Date()) + '&page=1&page_size=200');
  const recs = j && j.data && (j.data.records || []);
  if (!recs || recs.length < 1) return null;
  const last = recs[0], prev = recs[1]; // 接口按交易日倒序，最新在前
  let chg = null;
  if (last && last.change_pct !== undefined && String(last.change_pct || '') !== '') chg = Number(last.change_pct);
  else if (last && prev && Number(prev.close)) chg = (Number(last.close) - Number(prev.close)) / Number(prev.close) * 100;
  const dir = chg == null ? 'flat' : chg > 0 ? 'up' : chg < 0 ? 'down' : 'flat';
  return { label: '港股', name: '恒生指数', level: Number(last.close), chg: chg, dir: dir, date: String(last.trade_date || '') };
}
/* 美股指数：腾讯证券（主），东财 push2（备） */
async function fetchIndexUs() {
  const qq = await apiText('/qq/q=usINX');
  if (qq && typeof qq === 'string') {
    const m = qq.match(/v_usINX="([^"]*)"/);
    if (m) {
      const f = m[1].split('~');
      const price = Number(f[3]), pct = Number(f[32]);
      if (price) {
        const dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
        return { source: '腾讯证券', label: '美股', name: 'S&P 500', level: price, chg: pct, dir: dir, date: String(f[30] || '').slice(0, 10) };
      }
    }
  }
  const em = await apiJson('/emq/api/qt/stock/get?secid=100.SPX&fields=f43,f44,f45,f46,f60,f170&fltt=2&invt=2');
  const dd = em && em.data;
  if (dd && dd.f43 != null) {
    const pct = Number(dd.f170);
    const dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
    return { source: '东方财富', label: '美股', name: 'S&P 500', level: Number(dd.f43), chg: pct, dir: dir, date: '' };
  }
  return null;
}

function fmtYmd(v) {
  const s = String(v || '');
  return s.length === 8 ? s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8) : s;
}
/* 基金净值：东财 lsjz（主，重试1次），ftshare（备）。返回 {unitNav, navDate, grwPct} */
async function fetchFundNav(code) {
  if (!code) return null;
  for (let tryI = 0; tryI < 2; tryI++) {
    const em = await apiJson('/em/f10/lsjz?fundCode=' + encodeURIComponent(code) + '&pageIndex=1&pageSize=5');
    const list = em && em.Data && em.Data.LSJZList;
    if (list && list.length) {
      const row = list[0];
      return { unitNav: Number(row.DWJZ), navDate: fmtYmd(row.FSRQ), grwPct: row.JZZZL === '' ? null : Number(row.JZZZL), source: '东方财富' };
    }
    if (tryI === 0) await new Promise(function (r) { setTimeout(r, 250); });
  }
  const ft = await apiJson('/mt/api/v1/market/data/fund/fund-net-value?fund_code=' + encodeURIComponent(code) +
    '&start_date=' + last30Ymd() + '&end_date=' + ymd(new Date()) + '&page=1&page_size=5');
  const items = ft && ft.data && (ft.data.items || []);
  if (items && items.length) {
    const row = items[0];
    return { unitNav: Number(row.unit_nav), navDate: fmtYmd(row.nav_date || row.publish_date || ''), grwPct: row.unit_nav_growth === undefined ? null : Number(row.unit_nav_growth), source: 'ftshare' };
  }
  return null;
}
/* 顺序拉取持仓净值（避免东财并发限流） */
async function loadNavRows(holdings) {
  // 返回与 holdings 等长数组：失败为 null，保证索引对齐
  const rows = [];
  for (const h of holdings) {
    let r = null;
    if (h.fundCode) r = await fetchHoldingNav(h).catch(function () { return null; });
    rows.push(r);
    if (h.fundCode) await new Promise(function (res) { setTimeout(res, 120); });
  }
  return rows;
}

async function fetchRateUs() {
  const j = await apiJson('/mt/api/v1/market/data/economic/us-economic?type=fed-funds-rate-upper');
  const rows = j && (Array.isArray(j.data) ? j.data : (j.data || []));
  const r = rows && rows[0];
  if (!r) return null;
  return { label: '美联储利率', name: '政策利率(月)', level: Number(r.current_value), chg: null, dir: 'flat', date: String(r.release_date || ''), note: '月频 · ' + String(r.month || '') };
}

/* 组合持仓最新净值（按 fundCode；东财→ftshare 多源） */
async function fetchHoldingNav(holding) {
  if (!holding.fundCode) return null;
  const nav = await fetchFundNav(holding.fundCode);
  if (!nav) return null;
  return { holding: holding, chg: nav.grwPct, unitNav: nav.unitNav, navDate: nav.navDate, source: nav.source };
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
    { id: 'jd1', date: '2026-07-01', action: 'Buy', asset: '建信新兴市场QDII', amount: 30000, quantity: 20000, price: 1.5,
      thesis: '新兴市场权益，跨境分散+成长修复', reason: '分批建仓，控制初始仓位',
      expectedOutcome: '12 个月 +10%~20%', risk: '新兴市场波动、汇率', invalidationCondition: '资金持续外流或汇率大幅波动',
      holdingPeriod: '—', sellReason: '', postSell: { keptRising: 'unknown', judgment: 'unknown', lesson: '' }, reviewStatus: 'Pending Review' },
    { id: 'jd2', date: '2026-07-20', action: 'Add', asset: '建信新兴市场QDII', amount: 10000, quantity: 6250, price: 1.6,
      thesis: '趋势确认，分批加仓', reason: '回调后加仓，摊薄成本',
      expectedOutcome: '摊薄成本至 1.53 附近', risk: '仓位集中度上升', invalidationCondition: '突破买入逻辑',
      holdingPeriod: '—', sellReason: '', postSell: { keptRising: 'unknown', judgment: 'unknown', lesson: '' }, reviewStatus: 'Pending Review' },
    { id: 'jd3', date: '2026-08-15', action: 'Sell', asset: '建信新兴市场QDII', amount: 5000, quantity: 2777.78, price: 1.8,
      thesis: '目标价触及，分批止盈', reason: '达到目标收益率，落袋部分利润',
      expectedOutcome: '实现部分盈利并降低集中度', risk: '卖出后继续上涨', invalidationCondition: '—',
      holdingPeriod: '1.5个月', sellReason: 'Target Reached',
      postSell: { keptRising: 'yes', judgment: 'partly', lesson: '卖出后继续上涨，可分批止盈更佳' }, reviewStatus: 'Pending Review' }
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
  async getMarket() {
    const [cn, hk, us, rate] = await Promise.all([
      fetchIndexCn().catch(function () { return null; }),
      fetchIndexHk().catch(function () { return null; }),
      fetchIndexUs().catch(function () { return null; }),
      fetchRateUs().catch(function () { return null; })
    ]);
    const item = function (src, fallback) {
      if (!src) return fallback;
      return { key: src.label, label: src.label, value: fmtLevel(src.level), chg: src.chg != null ? signedPct(src.chg) : '—', dir: src.dir, source: src.source };
    };
    const items = [
      item(cn, { key: 'cn', label: 'A股', value: '沪深300', chg: '数据暂不可用', dir: 'flat', source: '' }),
      item(hk, { key: 'hk', label: '港股', value: '恒生指数', chg: '数据暂不可用', dir: 'flat', source: '' }),
      item(us, { key: 'us', label: '美股', value: 'S&P 500', chg: '数据暂不可用', dir: 'flat', source: '' }),
      item(rate, { key: 'rate', label: '美联储利率', value: '—', chg: '数据暂不可用', dir: 'flat', source: '' })
    ];
    const srcs = [cn, hk, us, rate].map(function (x) { return x && x.source; }).filter(Boolean).join(' / ') || DATA_SOURCE_NAME;
    const date = [cn, hk, us, rate].map(function (x) { return x && x.date ? x.date : ''; }).filter(Boolean).sort().pop() || '';
    return {
      global: { trend: '—', regime: '实时行情', riskLevel: '—', riskColor: 'risk-mid', source: srcs, dataDate: date, updatedAt: nowStamp() },
      items: items,
      events: []
    };
  },
  async getPortfolio() {
    const d = await loadPortfolio();
    const total = sumHoldings(d.holdings);
    const risk = computeRiskScore(d.holdings, total);
    const coded = d.holdings.filter(function (h) { return h.fundCode; });
    const noCode = d.holdings.filter(function (h) { return !h.fundCode; });
    let today = null, todayPnl = null, dataNote = '', dataDate = '', srcUsed = '';
    if (!coded.length) {
      dataNote = '持仓未配置基金代码：纳斯达克基金待确认（同名 61 只）';
      if (noCode.length) dataNote = noCode.map(function (h) { return h.name; }).join('、') + ' 未配置基金代码';
    } else {
      const rows = (await loadNavRows(d.holdings)).filter(Boolean);
      if (!rows.length) {
        dataNote = '数据源暂未覆盖已配置代码的基金净值';
      } else {
        const coveredSum = rows.reduce(function (s, r) { return s + Number(r.holding.amount); }, 0);
        const weightToday = rows.reduce(function (s, r) {
          return s + (r.chg == null ? 0 : r.chg / 100 * Number(r.holding.amount) / (1 + (r.chg == null ? 0 : r.chg) / 100));
        }, 0);
        const pnl = rows.reduce(function (s, r) {
          if (r.chg == null) return s;
          return s + Number(r.holding.amount) * (r.chg / 100) / (1 + r.chg / 100);
        }, 0);
        if (coveredSum > 0) today = pnl / coveredSum * 100;
        todayPnl = Math.round(pnl);
        dataDate = rows.map(function (r) { return r.navDate; }).filter(Boolean).sort().pop() || '';
        srcUsed = rows.map(function (r) { return r.source; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' / ');
        const missing = coded.length - rows.length;
        const noNav = d.holdings.length - rows.length;
        if (noNav > 0) dataNote = '部分持仓无净值（' + noNav + '/' + d.holdings.length + '），今日变化为已覆盖部分加权估算';
      }
    }
    return {
      total: total,
      count: d.holdings.length,
      techExposure: risk.techPct,
      emergingExposure: risk.emergingPct,
      riskScore: risk.score,
      riskLabel: risk.label,
      riskCls: risk.cls,
      maxDrawdown: '目标 ' + d.profile.maxDrawdown,
      today: today == null ? '—' : signedPct(today),
      todayPnl: todayPnl == null ? null : (todayPnl >= 0 ? '+' : '-') + fmtMoney(Math.abs(todayPnl)),
      return: '—（待 costBasis，Phase 2）',
      source: srcUsed || DATA_SOURCE_NAME,
      dataDate: dataDate || (d.updatedAt || ''),
      updatedAt: nowStamp(),
      dataNote: dataNote
    };
  },
  async getProfile() { return (await loadPortfolio()).profile; },
  async getActionCenter() { return (await loadPortfolio()).actionCenter; },
  async getRiskDashboard() {
    const d = await loadPortfolio();
    const total = sumHoldings(d.holdings);
    const risk = computeRiskScore(d.holdings, total);
    const conc = computeConcentrationScore(risk.maxHoldPct);
    return {
      techPct: risk.techPct,
      regions: risk.regions,
      maxHoldPct: risk.maxHoldPct,
      maxHoldName: risk.maxHoldName,
      concentration: conc.score,
      concentrationLabel: conc.label,
      riskScore: risk.score,
      riskLabel: risk.label,
      riskCls: risk.cls
    };
  },
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
    const navs = await loadNavRows(d.holdings);
    return d.holdings.map(function (h, i) {
      const n = navs[i];
      const amt = Number(h.amount);
      const grw = n && n.chg != null ? n.chg : null;
      const todayPnl = grw == null ? null : Math.round(amt * (grw / 100) / (1 + grw / 100));
      return {
        asset: h.name,
        amount: h.amount,
        fundCode: h.fundCode || '',
        cat: h.category,
        region: h.region || '—',
        pct: pct(amt, total),
        risk: h.category === '科技/AI' ? '高' : h.category === 'QDII全球' ? '中' : '低',
        advice: CATEGORY_ADVICE[h.category] || '维持',
        unitNav: n ? n.unitNav : null,
        navDate: n ? n.navDate : '',
        navSource: n ? n.source : '',
        todayChg: grw == null ? null : grw,
        todayPnl: todayPnl
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