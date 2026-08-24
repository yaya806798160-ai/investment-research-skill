/**
 * Decision Engine — 基于规则的评分数据层
 * 输入：资产名称
 * 规则来源：
 *  - v1.8 Strategy Intelligence：业务质量 / 周期 / 估值 / 风险收益
 *  - v2.1 Quantitative Intelligence：质量 / 成长 / 价值因子
 *  - v2.3 Risk Management：风险水平与集中度约束
 *  - v2.5 Portfolio Data：当前组合权重与重叠度
 * 说明：规则输入为研究假设（demo），未接真实行情；接入真实数据时替换 ENGINE_PROFILES 的数据来源。
 */
'use strict';

/* 资产规则档案（demo 假设：quality/growth/valuation/cycle 各 0-20 分，risk 风险水平） */
const ENGINE_PROFILES = {
  nvda: {
    name: 'NVDA', category: '科技/AI', region: '美国', risk: 'high',
    quality: 18, growth: 19, valuation: 10, cycle: 18,
    thesis: 'AI 算力核心：CUDA 生态与产品迭代构成护城河，受益数据中心资本开支周期',
    strengths: ['AI 需求确定性强', '生态壁垒与定价权', '毛利率高、现金流强'],
    risks: ['估值处于历史高分位', '客户资本开支周期波动', '出口管制'],
    change: '数据中心资本开支下修、或推理成本大幅下降导致需求证伪时，需重新评估'
  },
  tsm: {
    name: '台积电', category: '科技/AI', region: '美国', risk: 'mid',
    quality: 18, growth: 16, valuation: 14, cycle: 17,
    thesis: '先进制程代工龙头，AI 芯片放量带动 3nm/CoWoS 满载，具备稀缺性与定价权',
    strengths: ['制程技术领先', '先进封装产能瓶颈', '客户结构优质'],
    risks: ['地缘政治', '资本开支强度高', '先进制程竞争'],
    change: 'AI 订单下修或地缘风险显著升级时，需重新评估'
  },
  tencent: {
    name: '腾讯控股', category: '成长', region: '中国', risk: 'mid',
    quality: 16, growth: 14, valuation: 15, cycle: 14,
    thesis: '游戏+广告复苏，微信生态稳固，AI 应用落地打开第二增长曲线',
    strengths: ['生态与流量壁垒', '现金流充沛', '估值处历史中位偏低'],
    risks: ['宏观消费疲软', '监管政策', '投资资产波动'],
    change: '游戏流水大幅低于预期、或监管明显收紧时，需重新评估'
  },
  hs300: {
    name: '沪深300ETF', category: '核心', region: 'A股', risk: 'low',
    quality: 15, growth: 12, valuation: 17, cycle: 13,
    thesis: '核心资产宽基，估值处历史低位，经济复苏期具备修复弹性',
    strengths: ['分散度好、流动性强', '估值低位', '核心配置属性'],
    risks: ['经济复苏不及预期', '汇率与外资流向'],
    change: '盈利预期持续下修或市场风险偏好恶化时，需重新评估'
  },
  divlow: {
    name: '红利低波ETF', category: '红利', region: 'A股', risk: 'low',
    quality: 16, growth: 8, valuation: 16, cycle: 15,
    thesis: '高股息+低波动，现金流稳定，作为组合防御与现金流资产',
    strengths: ['股息现金流', '低波动防御', '与成长/科技低相关'],
    risks: ['利率快速上行', '高股息陷阱'],
    change: '股息率显著收窄或利率大幅上行时，需重新评估'
  },
  jianxin: {
    name: '建信新兴市场QDII', category: 'QDII全球', region: '新兴市场', risk: 'high',
    quality: 14, growth: 15, valuation: 14, cycle: 14,
    thesis: '新兴市场权益，受益全球流动性宽松与成长股修复；当前为组合最大单仓',
    strengths: ['跨境分散', '新兴市场估值与成长空间', '人民币贬值对冲'],
    risks: ['单一市场波动大', '汇率风险', '集中度过高（已占 58.8%）'],
    change: '新兴市场资金持续外流或汇率大幅波动时，需重新评估'
  },
  caitong: {
    name: '财通成长C', category: '成长', region: 'A股', risk: 'mid',
    quality: 14, growth: 16, valuation: 13, cycle: 14,
    thesis: 'A 股成长风格基金，聚焦高景气成长赛道',
    strengths: ['成长弹性', '主动管理', '风格清晰'],
    risks: ['风格回撤', '基金经理变动', '高估值成长股波动'],
    change: '成长风格持续跑输或基金经理变更时，需重新评估'
  },
  huaxia: {
    name: '华夏国证半导体', category: '科技/AI', region: 'A股', risk: 'high',
    quality: 13, growth: 17, valuation: 12, cycle: 15,
    thesis: '半导体国产替代+景气周期，指数化暴露芯片设计/制造/设备',
    strengths: ['国产替代逻辑', '周期弹性', '主题集中'],
    risks: ['行业周期下行', '估值波动大', '与组合科技暴露重叠'],
    change: '半导体周期见顶或国产替代进度低于预期时，需重新评估'
  },
  dongfang: {
    name: '东方人工智能', category: '科技/AI', region: 'A股', risk: 'high',
    quality: 13, growth: 17, valuation: 11, cycle: 16,
    thesis: 'AI 主题基金，聚焦算力/大模型/应用，高弹性高波动',
    strengths: ['AI 主题弹性', '产业链覆盖广', '景气度高'],
    risks: ['主题估值高', '波动剧烈', '与组合科技暴露高度重叠'],
    change: 'AI 资本开支不及预期或主题退潮时，需重新评估'
  },
  puyin: {
    name: '浦银智能科技', category: '科技/AI', region: 'A股', risk: 'high',
    quality: 13, growth: 16, valuation: 12, cycle: 15,
    thesis: '智能科技主题基金，覆盖 AI/半导体/智能硬件',
    strengths: ['科技成长弹性', '主动选股', '行业覆盖'],
    risks: ['主题波动', '估值偏高', '与组合科技暴露重叠'],
    change: '科技板块盈利下修或流动性收紧时，需重新评估'
  },
  yongying: {
    name: '永赢数字经济', category: '科技/AI', region: 'A股', risk: 'mid',
    quality: 13, growth: 15, valuation: 13, cycle: 15,
    thesis: '数字经济主题基金，覆盖数字化基础设施与应用',
    strengths: ['政策支持', '数字产业化方向', '估值相对合理'],
    risks: ['主题波动', '与组合科技暴露重叠', '成长兑现不及预期'],
    change: '数字经济政策转向或盈利兑现低于预期时，需重新评估'
  },
  nasdaq: {
    name: '纳斯达克基金', category: 'QDII全球', region: '美国', risk: 'mid',
    quality: 16, growth: 15, valuation: 12, cycle: 15,
    thesis: '美股科技宽基，聚焦全球科技龙头，跨境分散',
    strengths: ['全球科技龙头', '跨境分散', '流动性好'],
    risks: ['美股估值高位', '汇率风险', '利率环境'],
    change: '美股盈利预期下修或利率大幅上行时，需重新评估'
  },
  nanfang: {
    name: '南方红利低波', category: '红利', region: 'A股', risk: 'low',
    quality: 15, growth: 7, valuation: 16, cycle: 15,
    thesis: '红利低波策略，高股息+低波动，增强组合防御与现金流',
    strengths: ['股息现金流', '防御属性', '与科技/成长低相关'],
    risks: ['利率上行', '高股息标的盈利波动'],
    change: '股息率显著收窄或利率大幅上行时，需重新评估'
  }
};

function normalizeKey(name) {
  const s = String(name || '').trim().toLowerCase();
  // 先匹配具体持仓基金（避免被通用规则抢先）
  if (/南方红利/.test(s)) return 'nanfang';
  if (/建信|新兴市场/.test(s)) return 'jianxin';
  if (/财通成长/.test(s)) return 'caitong';
  if (/华夏国证/.test(s) || /半导体/.test(s)) return 'huaxia';
  if (/东方人工智能/.test(s) || /人工智能/.test(s)) return 'dongfang';
  if (/浦银/.test(s)) return 'puyin';
  if (/永赢/.test(s)) return 'yongying';
  if (/纳斯达克/.test(s)) return 'nasdaq';
  // 再匹配通用标的
  if (/nvidia|英伟达/.test(s)) return 'nvda';
  if (/台积电|tsm/.test(s)) return 'tsm';
  if (/腾讯/.test(s)) return 'tencent';
  if (/沪深300/.test(s)) return 'hs300';
  if (/红利低波/.test(s)) return 'divlow';
  return null;
}

function fallbackProfile(name) {
  return {
    name: String(name || '未知标的'), category: '未知', region: '未知', risk: 'mid',
    quality: 12, growth: 12, valuation: 12, cycle: 10,
    thesis: '待补充深度研究：该标的不在规则知识库中，需完成行业/公司/估值/风险分析后再评分',
    strengths: ['—'],
    risks: ['数据不足', '未在观察池中', '需人工复核'],
    change: '完成深度研究后再给出结论'
  };
}

function findProfile(name) {
  const key = normalizeKey(name);
  if (key) return ENGINE_PROFILES[key];
  const s = String(name || '').trim();
  const hit = Object.keys(ENGINE_PROFILES).map(function (k) { return ENGINE_PROFILES[k]; })
    .find(function (p) { return p.name === s; });
  return hit || null;
}

function riskBase(risk) {
  return risk === 'low' ? 20 : risk === 'mid' ? 14 : 7; // 0-20
}

/**
 * Investment Score（0-100）：
 *  - v1.8 + v2.1：quality(0-20) + growth(0-20) + valuation(0-20) + cycle(0-15) = 0-75
 *  - v2.3 + v2.5：riskFit(0-25) = 风险水平基础 + 组合影响调整（集中度惩罚 / 重叠 / 分散加成）
 */
async function computeScore(profile, held) {
  const base = profile.quality + profile.growth + profile.valuation + profile.cycle;
  let riskFit = riskBase(profile.risk);
  let adj = 5;
  if (held && held.pct > 40) adj -= 4;
  else if (held && held.pct > 20) adj -= 2;
  const portfolio = await DataSource.getHoldings();
  const catTotal = portfolio.filter(function (h) { return h.cat === profile.category; })
    .reduce(function (s, h) { return s + h.pct; }, 0);
  if (catTotal > 25) adj -= 1;                       // 与现有分类重叠
  if (profile.category === '红利' || profile.category === '核心') adj += 1; // 增加分散/防御
  riskFit = Math.max(0, Math.min(25, riskFit + adj));
  return Math.max(0, Math.min(100, Math.round(base + riskFit)));
}

function gradeFor(score) {
  if (score >= 90) return { grade: 'A', label: '强关注' };
  if (score >= 75) return { grade: 'B', label: '研究 / 逐步建仓' };
  if (score >= 60) return { grade: 'C', label: '观察' };
  return { grade: 'D', label: '回避' };
}

function recommend(score, held) {
  const w = held ? held.pct : 0;
  if (w > 40) return 'Reduce';
  if (score >= 85) return held ? 'Add Gradually' : 'Buy';
  if (score >= 75) return held ? 'Hold' : 'Buy';
  if (score >= 60) return held ? 'Hold' : 'Wait';
  return held ? 'Reduce' : 'Wait';
}

async function describeImpact(profile, held, portfolio) {
  if (held) {
    const catTotal = portfolio.filter(function (h) { return h.cat === profile.category; })
      .reduce(function (s, h) { return s + h.pct; }, 0);
    let msg = '已在组合中，权重 ' + held.pct + '%。';
    if (held.pct > 40) msg += ' 超过 40% 集中度上限（v2.3），加仓会进一步推高' + profile.category + '暴露（' + catTotal + '%），建议先降低集中度。';
    else if (held.pct > 20) msg += ' 权重偏高，注意与' + profile.category + '整体暴露（' + catTotal + '%）叠加。';
    else msg += ' 权重适中，对组合影响可控。';
    return msg;
  }
  const catTotal = portfolio.filter(function (h) { return h.cat === profile.category; })
    .reduce(function (s, h) { return s + h.pct; }, 0);
  let msg = '未持有；组合' + profile.category + '类暴露约 ' + catTotal + '%。';
  if (catTotal > 25) msg += ' 买入会进一步抬升该方向集中度，需控制初始仓位。';
  else if (profile.category === '红利' || profile.category === '核心') msg += ' 可起到分散/防御作用，适合小仓位补充。';
  else msg += ' 若买入建议小额分批，避免推高集中度。';
  return msg;
}

function buildReason(profile, score, held) {
  const parts = [];
  parts.push('质量/成长得分较高（' + (profile.quality + profile.growth) + '/40）');
  parts.push('估值与周期得分 ' + (profile.valuation + profile.cycle) + '/35');
  parts.push('风险适配 ' + (score - (profile.quality + profile.growth + profile.valuation + profile.cycle)) + '/25');
  if (held && held.pct > 40) parts.push('但单仓已超集中度上限');
  return parts.join('；') + '。';
}

async function analyzeWithEngine(name) {
  const profile = findProfile(name) || fallbackProfile(name);
  const portfolio = await DataSource.getHoldings();
  const held = portfolio.find(function (h) { return h.asset === profile.name; });
  const score = await computeScore(profile, held);
  const g = gradeFor(score);
  const rec = recommend(score, held);
  const impact = await describeImpact(profile, held, portfolio);
  return {
    score: score,
    grade: g.grade,
    gradeLabel: g.label,
    thesis: profile.thesis,
    strengths: profile.strengths,
    risks: profile.risks,
    portfolioImpact: impact,
    recommendation: rec,
    reason: buildReason(profile, score, held),
    whatWouldChangeDecision: profile.change
  };
}