/**
 * Investment OS — 视图渲染层
 */
'use strict';
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function card(title, inner) {
  return '<div class="card"><h3>' + title + '</h3>' + inner + '</div>';
}

/* ---------- Dashboard ---------- */
async function renderDashboard(content) {
  const [mkt, pf, profile, action, alloc, opps, wl, research] = await Promise.all([
    DataSource.getMarket(), DataSource.getPortfolio(), DataSource.getProfile(),
    DataSource.getActionCenter(), DataSource.getAllocation(), DataSource.getOpportunities(),
    DataSource.getWatchlist(), DataSource.getResearch()
  ]);
  // 市场状态
  const tiles = mkt.items.map(function (it) {
    const cls = it.dir === 'up' ? 'up' : it.dir === 'down' ? 'down' : 'flat';
    return '<div class="mkt"><div class="label">' + esc(it.label) + '</div>' +
      '<div class="value">' + esc(it.value) + '</div>' +
      '<div class="sub ' + cls + '">' + esc(it.chg) + '</div></div>';
  }).join('');
  const events = mkt.events.map(function (e) {
    return '<div class="list-item"><div><div class="title">' + esc(e.t) + '</div></div>' +
      '<div class="right"><span class="badge b">' + esc(e.tag) + '</span></div></div>';
  }).join('');
  const marketCard = card('Market Overview · 市场概览', 
    '<div class="market-tiles">' + tiles + '</div>' +
    '<h3 style="margin-top:16px">Major Events · 重要事件</h3>' + events);
  // 组合概览（真实数据 + 自动计算指标）
  const kpis = [
    { l: '总资产', v: fmtMoney(pf.total) },
    { l: '持仓数量', v: String(pf.count) + ' 只' },
    { l: '科技暴露', v: pf.techExposure + '%' },
    { l: '新兴市场', v: pf.emergingExposure + '%' },
    { l: '风险评分', v: String(pf.riskScore) + ' · ' + pf.riskLabel, cls: pf.riskCls },
    { l: '最大回撤', v: pf.maxDrawdown },
    { l: '今日变化', v: pf.today },
    { l: '收益率', v: pf.return }
  ].map(function (k) {
    return '<div class="kpi"><div class="label">' + k.l + '</div><div class="value' + (k.cls ? ' ' + k.cls : '') + '">' + esc(k.v) + '</div></div>';
  }).join('');
  const portfolioCard = card('Portfolio Overview · 组合概览',
    '<div class="kpis">' + kpis + '</div>' +
    '<p class="score-meta" style="margin-top:10px">风险评分基于 v2.3 规则：集中度 / 科技暴露 / 地域集中 / 防御缓冲 / 分散度；今日变化与收益率待行情接入。</p>');
  // 投资者画像
  const profileItems = [
    { l: '投资目标', v: profile.goal },
    { l: '风险承受', v: profile.riskTolerance },
    { l: '最大回撤', v: profile.maxDrawdown },
    { l: '策略', v: profile.strategy }
  ].map(function (p) {
    return '<div class="list-item"><div class="title">' + p.l + '</div><div class="right">' + esc(p.v) + '</div></div>';
  }).join('');
  const profileCard = card('Investor Profile · 投资者画像', profileItems);
  // 行动中心（精简卡片）
  const suggRows = action.suggestions.slice(0, 2).map(function (s) {
    return '<div class="list-item"><div><div class="title">' + esc(s.action) + '</div>' +
      '<div class="desc">' + esc(s.reason) + '</div></div>' +
      '<div class="right" style="max-width:50%;text-align:left">' + esc(s.trigger) + '</div></div>';
  }).join('');
  const alertItems = action.alerts.map(function (a) {
    const lv = a.level === '高' ? 'risk-high' : 'risk-mid';
    return '<div class="list-item"><div class="title">' + esc(a.text) + '</div>' +
      '<div class="right"><span class="' + lv + '">' + esc(a.level) + '</span></div></div>';
  }).join('');
  const actionCard = card('Action Center · 行动中心',
    '<div class="list-item"><div class="title">当前状态</div>' +
    '<div class="right" style="text-align:left;max-width:70%">' + esc(action.status) + '</div></div>' +
    '<h3 style="margin-top:12px">操作建议 · Suggestions</h3>' + suggRows +
    '<h3 style="margin-top:12px">风险提醒 · Alerts</h3>' + alertItems);
  // 资产配置（真实数据）
  const legend = alloc.map(function (a) {
    return '<div class="legend-item"><span class="swatch" style="background:' + a.color + '"></span>' +
      '<span>' + esc(a.name) + '</span><span class="pct">' + a.value + '% · ' + fmtMoney(a.amount) + '</span></div>';
  }).join('');
  const allocCard = card('Asset Allocation · 资产配置',
    '<div class="allocation-wrap"><div id="donut"></div><div class="legend">' + legend + '</div></div>');
  // 机会排名（演示数据）
  const oppRows = opps.map(function (o) {
    return '<tr><td><strong>' + esc(o.asset) + '</strong></td>' +
      '<td class="num"><span class="' + gradeClass(o.grade) + '">' + esc(o.grade) + '</span> ' + o.score + '</td>' +
      '<td>' + esc(o.reason) + '</td>' +
      '<td><span class="risk-mid">' + esc(o.risk) + '</span></td></tr>';
  }).join('');
  const oppCard = card('Opportunity Ranking · 机会排名',
    '<table><thead><tr><th>Asset</th><th>Score</th><th>Reason · 理由</th><th>Risk · 风险</th></tr></thead><tbody>' + oppRows + '</tbody></table>');
  // 观察池（演示数据）
  const wlItems = wl.map(function (w) {
    return '<div class="list-item"><div><div class="title">' + esc(w.asset) + '</div>' +
      '<div class="desc">' + esc(w.thesis) + '</div>' +
      '<div class="desc">买入条件：' + esc(w.entry) + '</div>' +
      '<div class="desc"><span class="risk-high">风险条件：</span>' + esc(w.risk) + '</div></div></div>';
  }).join('');
  const wlCard = card('Watchlist · 观察列表', wlItems);
  // 最新研究（演示数据）
  const latest = [].concat(research.stock, research.fund, research.industry)
    .sort(function (a, b) { return b.date < a.date ? -1 : 1; }).slice(0, 5)
    .map(function (r) {
      return '<div class="list-item"><div><div class="title">' + esc(r.title) + '</div>' +
        '<div class="desc">' + esc(r.date) + '</div></div>' +
        '<div class="right"><span class="badge b">' + esc(r.type) + '</span></div></div>';
    }).join('');
  const researchCard = card('Latest Research · 最新研究', latest);

  content.innerHTML =
    '<div class="grid" style="gap:14px">' + marketCard + '</div>' +
    '<div class="grid" style="gap:14px;margin-top:14px">' + portfolioCard + '</div>' +
    '<div class="grid cols-2" style="gap:14px;margin-top:14px">' + allocCard + profileCard + '</div>' +
    '<div class="grid" style="gap:14px;margin-top:14px">' + actionCard + '</div>' +
    '<div class="grid" style="gap:14px;margin-top:14px">' + oppCard + '</div>' +
    '<div class="grid cols-2" style="gap:14px;margin-top:14px">' + wlCard + researchCard + '</div>';

  donutChart(document.getElementById('donut'), alloc);
}

/* ---------- Decision Center ---------- */
function renderDecision(content) {
  let lastDecision = null;
  content.innerHTML =
    '<div class="card">' +
    '<h3>Decision Center · 决策中心</h3>' +
    '<div class="decision-input">' +
    '<input id="assetInput" type="text" placeholder="输入股票 / 基金名称，例如：NVDA、腾讯、沪深300ETF" />' +
    '<button class="btn" id="analyzeBtn">分析</button>' +
    '</div>' +
    '<div id="decisionResult"></div>' +
    '</div>';
  const run = async function () {
    const name = document.getElementById('assetInput').value.trim();
    const resEl = document.getElementById('decisionResult');
    if (!name) { resEl.innerHTML = '<p style="color:var(--text-dim)">请输入标的名称。</p>'; return; }
    const r = await analyzeWithEngine(name);
    const stList = r.strengths.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
    const rkList = r.risks.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
    resEl.innerHTML =
      '<div class="grid cols-2" style="margin-top:6px">' +
      '<div class="card"><h3>1 · 投资评分 · Investment Grade</h3>' +
      '<div class="score-ring"><span class="score-big">' + r.score + '</span>' +
      '<span class="badge ' + gradeClass(r.grade) + '">' + esc(r.grade) + '</span></div>' +
      '<div class="score-meta">' + esc(r.grade) + ' · ' + esc(r.gradeLabel) + '</div></div>' +
      '<div class="card"><h3>6 · 建议 · Recommendation</h3>' +
      '<p style="font-size:16px;font-weight:700;color:var(--accent)">' + esc(r.recommendation) + '</p>' +
      '<p class="score-meta" style="margin-top:8px">' + esc(r.reason) + '</p></div>' +
      '</div>' +
      '<div class="grid cols-2" style="gap:14px;margin-top:14px">' +
      '<div class="card"><h3>2 · 投资论点 · Investment Thesis</h3><p style="line-height:1.8">' + esc(r.thesis) + '</p></div>' +
      '<div class="card"><h3>5 · 组合影响 · Portfolio Impact</h3><p style="line-height:1.8">' + esc(r.portfolioImpact) + '</p></div>' +
      '</div>' +
      '<div class="grid cols-2" style="gap:14px;margin-top:14px">' +
      '<div class="card"><h3>3 · 优势 · Strengths</h3><ul style="padding-left:18px;line-height:1.9">' + stList + '</ul></div>' +
      '<div class="card"><h3>4 · 风险 · Risks</h3><ul style="padding-left:18px;line-height:1.9">' + rkList + '</ul></div>' +
      '</div>' +
      '<div class="card" style="margin-top:14px"><h3>7 · 理由 · Reason</h3><p style="line-height:1.8">' + esc(r.reason) + '</p></div>' +
      '<div class="card" style="margin-top:14px"><h3>8 · 什么会改变决策 · What Would Change Decision</h3><p style="line-height:1.8">' + esc(r.whatWouldChangeDecision) + '</p></div>' +
      '<div style="margin-top:14px"><button class="btn" id="saveToJournalBtn">记录到投资日志</button></div>';
    lastDecision = { name: name, r: r };
    document.getElementById('saveToJournalBtn').addEventListener('click', function () {
      if (!lastDecision) return;
      saveDecisionToJournal(lastDecision.name, lastDecision.r);
      alert('已记录到投资日志（复盘状态：待复盘）');
      location.hash = '#/journal';
    });
  };
  document.getElementById('analyzeBtn').addEventListener('click', run);
  document.getElementById('assetInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') run();
  });
}

/* ---------- Portfolio ---------- */
async function renderPortfolio(content) {
  const holdings = await DataSource.getHoldings();
  const rows = holdings.map(function (h) {
    const rk = h.risk === '高' ? 'risk-high' : h.risk === '中' ? 'risk-mid' : 'risk-low';
    return '<tr><td><strong>' + esc(h.asset) + '</strong></td>' +
      '<td class="num">' + fmtMoney(h.amount) + '</td>' +
      '<td>' + esc(h.cat) + '</td>' +
      '<td class="num">' + h.pct + '%</td>' +
      '<td class="' + rk + '">' + esc(h.risk) + '</td>' +
      '<td>' + esc(h.advice) + '</td></tr>';
  }).join('');
  content.innerHTML =
    '<div class="card"><h3>持仓列表 · Portfolio Holdings</h3>' +
    '<p class="score-meta" style="margin-bottom:10px">数据来源：portfolio-data.json（手动录入，待行情接入）</p>' +
    '<table><thead><tr><th>名称</th><th>金额</th><th>分类</th><th>占比</th><th>风险暴露</th><th>建议</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div>';
}

/* ---------- Research ---------- */
async function renderResearch(content) {
  const research = await DataSource.getResearch();
  const tabs = [
    { key: 'stock', label: '股票研究' },
    { key: 'fund', label: '基金研究' },
    { key: 'industry', label: '行业研究' }
  ];
  const tabHtml = tabs.map(function (t, i) {
    return '<span class="tab' + (i === 0 ? ' active' : '') + '" data-tab="' + t.key + '">' + t.label + '</span>';
  }).join('');
  content.innerHTML = '<div class="tabs" id="resTabs">' + tabHtml + '</div><div id="resList"></div>';
  const show = function (key) {
    const list = research[key] || [];
    const html = list.map(function (r) {
      return '<div class="list-item"><div><div class="title">' + esc(r.title) + '</div>' +
        '<div class="desc">' + esc(r.date) + '</div></div>' +
        '<div class="right"><span class="badge b">' + esc(r.type) + '</span></div></div>';
    }).join('');
    document.getElementById('resList').innerHTML = html || '<p style="color:var(--text-dim)">暂无报告。</p>';
  };
  document.querySelectorAll('#resTabs .tab').forEach(function (t) {
    t.addEventListener('click', function () {
      document.querySelectorAll('#resTabs .tab').forEach(function (x) { x.classList.remove('active'); });
      t.classList.add('active');
      show(t.getAttribute('data-tab'));
    });
  });
  show('stock');
}

/* ---------- Journal (v2 结构化) ---------- */
function journalKey() { return 'ios_journal_v2'; }
function journalStore() {
  try {
    const raw = localStorage.getItem(journalKey());
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  try {
    const old = localStorage.getItem('ios_journal');
    if (old) {
      const legacy = JSON.parse(old);
      const migrated = legacy.map(function (e, i) {
        return {
          id: 'legacy-' + i + '-' + Date.now(),
          date: e.date || '',
          action: e.type === '买入' ? 'Buy' : e.type === '卖出' ? 'Sell' : 'Review',
          asset: e.asset || '', amount: 0, thesis: '', reason: e.reason || '',
          expectedOutcome: '', risk: '', invalidationCondition: '', holdingPeriod: '',
          reviewStatus: 'Pending Review'
        };
      });
      localStorage.removeItem('ios_journal');
      if (migrated.length) return migrated;
    }
  } catch (e) {}
  return MockDB.journalDefaults.map(function (e) { return Object.assign({}, e); });
}
function persistJournal(list) {
  try { localStorage.setItem(journalKey(), JSON.stringify(list)); } catch (e) {}
}
function newJournalId() { return 'j-' + Date.now() + '-' + Math.floor(Math.random() * 1000); }
function learningSummary(entries) {
  const reviewed = entries.filter(function (e) { return e.reviewStatus && e.reviewStatus !== 'Pending Review'; });
  const correct = reviewed.filter(function (e) { return e.reviewStatus === 'Correct'; }).length;
  const partial = reviewed.filter(function (e) { return e.reviewStatus === 'Partially Correct'; }).length;
  const wrong = reviewed.filter(function (e) { return e.reviewStatus === 'Wrong'; }).length;
  let rate = '—';
  if (reviewed.length) rate = Math.round(((correct + 0.5 * partial) / reviewed.length) * 100) + '%';
  const wrongByAction = {}, partialByAction = {};
  reviewed.forEach(function (e) {
    if (e.reviewStatus === 'Wrong') wrongByAction[e.action] = (wrongByAction[e.action] || 0) + 1;
    if (e.reviewStatus === 'Partially Correct') partialByAction[e.action] = (partialByAction[e.action] || 0) + 1;
  });
  const mistakes = [];
  Object.keys(wrongByAction).forEach(function (a) { mistakes.push(a + ' 被证伪 ' + wrongByAction[a] + ' 次'); });
  Object.keys(partialByAction).forEach(function (a) { mistakes.push(a + ' 部分正确 ' + partialByAction[a] + ' 次'); });
  return { decisions: entries.length, rate: rate, reviewed: reviewed.length, mistakes: mistakes };
}
function actionBadge(action) {
  const cls = action === 'Buy' ? 'badge a' : action === 'Sell' ? 'badge d' : action === 'Hold' ? 'badge b' : 'badge c';
  return '<span class="' + cls + '">' + esc(action) + '</span>';
}
function learningHtml(s) {
  return '<div class="learn-kpis">' +
    '<div class="learn-kpi"><div class="label">决策次数</div><div class="value">' + s.decisions + '</div></div>' +
    '<div class="learn-kpi"><div class="label">成功率</div><div class="value">' + s.rate + '</div>' +
    '<div class="label" style="margin-top:4px">已复盘 ' + s.reviewed + ' 笔</div></div>' +
    '<div class="learn-kpi"><div class="label">常见错误</div>' +
    (s.mistakes.length ? '<ul>' + s.mistakes.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>' : '<ul><li>暂无已复盘错误</li></ul>') +
    '</div></div>';
}
function renderJournal(content) {
  let entries = journalStore();
  const form =
    '<div class="card" style="margin-bottom:14px"><h3>记录投资决策 · New Entry</h3>' +
    '<div class="journal-form">' +
    '<select id="jAction"><option value="Buy">Buy 买入</option><option value="Sell">Sell 卖出</option><option value="Hold">Hold 持有</option><option value="Review">Review 复盘</option></select>' +
    '<input id="jAsset" type="text" placeholder="标的（如 建信新兴市场QDII / NVDA）" />' +
    '<input id="jAmount" type="number" placeholder="金额（可选）" />' +
    '<input id="jDate" type="date" />' +
    '<input id="jPeriod" type="text" placeholder="持有期（如 6个月）" />' +
    '<select id="jReview"><option value="Pending Review">复盘状态：待复盘</option><option value="Correct">Correct 正确</option><option value="Partially Correct">Partially Correct 部分正确</option><option value="Wrong">Wrong 错误</option></select>' +
    '<input id="jThesis" class="full" type="text" placeholder="投资论点 Investment Thesis" />' +
    '<textarea id="jReason" placeholder="决策理由 Reason"></textarea>' +
    '<input id="jExpected" type="text" placeholder="预期结果 Expected Outcome" />' +
    '<textarea id="jRisk" placeholder="风险 Risk"></textarea>' +
    '<textarea id="jInvalid" placeholder="失效条件 Invalidation Condition"></textarea>' +
    '<button class="btn" id="jSave" style="grid-column:1/-1;justify-self:start">保存</button>' +
    '</div></div>';
  const renderList = function () {
    const items = entries.map(function (e) {
      const reviewOpts = ['Pending Review', 'Correct', 'Partially Correct', 'Wrong'].map(function (s) {
        return '<option' + (e.reviewStatus === s ? ' selected' : '') + '>' + s + '</option>';
      }).join('');
      return '<div class="entry" data-id="' + esc(e.id) + '">' +
        '<div class="entry-head">' + actionBadge(e.action) +
        '<strong>' + esc(e.asset) + '</strong>' +
        (e.amount ? '<span class="num">' + fmtMoney(e.amount) + '</span>' : '') +
        '<span class="right">' + esc(e.date || '') + (e.holdingPeriod ? ' · ' + esc(e.holdingPeriod) : '') + '</span></div>' +
        '<div class="entry-grid">' +
        (e.thesis ? '<div class="f full"><label>Investment Thesis</label><div>' + esc(e.thesis) + '</div></div>' : '') +
        (e.expectedOutcome ? '<div class="f"><label>Expected Outcome</label><div>' + esc(e.expectedOutcome) + '</div></div>' : '') +
        (e.risk ? '<div class="f"><label>Risk</label><div>' + esc(e.risk) + '</div></div>' : '') +
        (e.invalidationCondition ? '<div class="f full"><label>Invalidation Condition</label><div>' + esc(e.invalidationCondition) + '</div></div>' : '') +
        (e.reason ? '<div class="f full"><label>Reason</label><div>' + esc(e.reason) + '</div></div>' : '') +
        '</div>' +
        '<div class="entry-foot">' +
        '<select class="jReviewSel">' + reviewOpts + '</select>' +
        '<button class="btn-sm jDel">删除</button>' +
        '</div></div>';
    }).join('');
    document.getElementById('jList').innerHTML = items || '<p style="color:var(--text-dim)">暂无记录。</p>';
    document.querySelectorAll('.jReviewSel').forEach(function (sel) {
      sel.addEventListener('change', function () {
        const id = sel.closest('.entry').getAttribute('data-id');
        const en = entries.find(function (x) { return x.id === id; });
        if (en) { en.reviewStatus = sel.value; persistJournal(entries); }
      });
    });
    document.querySelectorAll('.jDel').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = btn.closest('.entry').getAttribute('data-id');
        entries = entries.filter(function (x) { return x.id !== id; });
        persistJournal(entries);
        document.getElementById('jSummary').innerHTML = learningHtml(learningSummary(entries));
        renderList();
      });
    });
  };
  content.innerHTML = '<div id="jSummary">' + learningHtml(learningSummary(entries)) + '</div>' + form +
    '<div class="card"><h3>投资日志 · Investment Journal</h3><div id="jList"></div></div>';
  document.getElementById('jDate').value = new Date().toISOString().slice(0, 10);
  renderList();
  document.getElementById('jSave').addEventListener('click', function () {
    const entry = {
      id: newJournalId(),
      date: document.getElementById('jDate').value || new Date().toISOString().slice(0, 10),
      action: document.getElementById('jAction').value,
      asset: document.getElementById('jAsset').value.trim() || '组合',
      amount: Number(document.getElementById('jAmount').value) || 0,
      thesis: document.getElementById('jThesis').value.trim(),
      reason: document.getElementById('jReason').value.trim(),
      expectedOutcome: document.getElementById('jExpected').value.trim(),
      risk: document.getElementById('jRisk').value.trim(),
      invalidationCondition: document.getElementById('jInvalid').value.trim(),
      holdingPeriod: document.getElementById('jPeriod').value.trim(),
      reviewStatus: document.getElementById('jReview').value
    };
    if (!entry.reason && !entry.thesis) { alert('请至少填写投资论点或决策理由'); return; }
    entries.unshift(entry);
    persistJournal(entries);
    document.getElementById('jSummary').innerHTML = learningHtml(learningSummary(entries));
    renderList();
    ['jAsset', 'jAmount', 'jThesis', 'jReason', 'jExpected', 'jRisk', 'jInvalid', 'jPeriod'].forEach(function (id) {
      const el = document.getElementById(id); if (el) el.value = '';
    });
  });
}

/* Decision Center → Journal 一键记录（结构化保存） */
function saveDecisionToJournal(name, r) {
  const entries = journalStore();
  const actionMap = { Buy: 'Buy', 'Add Gradually': 'Buy', Hold: 'Hold', Wait: 'Review', Reduce: 'Sell' };
  const entry = {
    id: newJournalId(),
    date: new Date().toISOString().slice(0, 10),
    action: actionMap[r.recommendation] || 'Review',
    asset: String(name).trim() || '',
    amount: 0,
    thesis: r.thesis || '',
    reason: r.reason || '',
    expectedOutcome: '按建议 ' + r.recommendation + ' 执行，在验证周期内观察论点兑现情况',
    risk: (r.risks || []).join('；'),
    invalidationCondition: r.whatWouldChangeDecision || '',
    holdingPeriod: '',
    reviewStatus: 'Pending Review'
  };
  entries.unshift(entry);
  persistJournal(entries);
  return entry;
}
/* ---------- Action Center + Risk Dashboard ---------- */
async function renderAction(content) {
  const [action, risk] = await Promise.all([DataSource.getActionCenter(), DataSource.getRiskDashboard()]);
  const suggRows = action.suggestions.map(function (s, i) {
    return '<tr><td><strong>' + (i + 1) + '. ' + esc(s.action) + '</strong></td>' +
      '<td>' + esc(s.reason) + '</td>' +
      '<td>' + esc(s.trigger) + '</td></tr>';
  }).join('');
  const alertItems = action.alerts.map(function (a) {
    const lv = a.level === '高' ? 'risk-high' : 'risk-mid';
    return '<div class="list-item"><div class="title">' + esc(a.text) + '</div>' +
      '<div class="right"><span class="' + lv + '">' + esc(a.level) + '</span></div></div>';
  }).join('');
  const actionCard = card('Action Center · 行动中心',
    '<div class="list-item"><div class="title">当前投资状态</div>' +
    '<div class="right" style="text-align:left;max-width:70%">' + esc(action.status) + '</div></div>' +
    '<table style="margin-top:10px"><thead><tr><th>操作建议</th><th>建议原因</th><th>触发条件</th></tr></thead>' +
    '<tbody>' + suggRows + '</tbody></table>' +
    '<h3 style="margin-top:16px">风险提醒 · Risk Alerts</h3>' + alertItems);
  const regionBars = risk.regions.map(function (r) {
    return '<div class="list-item"><div class="title">' + esc(r.name) + '</div>' +
      '<div class="right">' + r.pct + '%</div></div>';
  }).join('');
  const kpis = [
    { l: '科技暴露', v: risk.techPct + '%' },
    { l: '最大持仓', v: risk.maxHoldPct + '% · ' + esc(risk.maxHoldName) },
    { l: '集中度评分', v: String(risk.concentration) + ' · ' + risk.concentrationLabel, cls: risk.concentration >= 70 ? 'risk-high' : risk.concentration >= 40 ? 'risk-mid' : 'risk-low' },
    { l: '风险等级', v: String(risk.riskScore) + ' · ' + risk.riskLabel, cls: risk.riskCls }
  ].map(function (k) {
    return '<div class="kpi"><div class="label">' + k.l + '</div><div class="value' + (k.cls ? ' ' + k.cls : '') + '">' + esc(k.v) + '</div></div>';
  }).join('');
  const riskCard = card('Risk Dashboard · 风险面板',
    '<div class="kpis">' + kpis + '</div>' +
    '<h3 style="margin-top:16px">地区暴露 · Region Exposure</h3>' + regionBars +
    '<p class="score-meta" style="margin-top:10px">基于 v2.3 Risk Management Layer：集中度 / 科技暴露 / 地域集中 / 防御缓冲 / 分散度；数据来自 portfolio-data.json，未接行情。</p>');
  content.innerHTML =
    '<div class="grid" style="gap:14px">' + actionCard + '</div>' +
    '<div class="grid" style="gap:14px;margin-top:14px">' + riskCard + '</div>';
}