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
  // 组合概览（真实数据）
  const kpis = [
    { l: '总资产', v: fmtMoney(pf.total) },
    { l: '持仓数量', v: String(pf.count) + ' 只' },
    { l: '今日变化', v: pf.today },
    { l: '收益率', v: pf.return },
    { l: '风险评分', v: String(pf.riskScore) },
    { l: '最大回撤', v: pf.maxDrawdown }
  ].map(function (k) {
    return '<div class="kpi"><div class="label">' + k.l + '</div><div class="value">' + esc(k.v) + '</div></div>';
  }).join('');
  const portfolioCard = card('Portfolio Overview · 组合概览', '<div class="kpis">' + kpis + '</div>');
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
  // 行动中心
  const actionItems =
    '<div class="list-item"><div class="title">当前建议</div><div class="right" style="text-align:left;max-width:75%">' + esc(action.currentAdvice) + '</div></div>' +
    '<div class="list-item"><div class="title" style="color:var(--warn)">风险提醒</div><div class="right" style="text-align:left;max-width:75%">' + esc(action.riskAlert) + '</div></div>' +
    '<div class="list-item"><div class="title" style="color:var(--accent)">下一步动作</div><div class="right" style="text-align:left;max-width:75%">' + esc(action.nextAction) + '</div></div>';
  const actionCard = card('Action Center · 行动中心', actionItems);
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
    const r = await DataSource.analyzeAsset(name);
    const riskList = r.risks.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
    resEl.innerHTML =
      '<div class="grid cols-2" style="margin-top:6px">' +
      '<div class="card"><h3>投资评分 · Investment Score</h3>' +
      '<div class="score-ring"><span class="score-big">' + r.score + '</span>' +
      '<span class="badge ' + gradeClass(r.grade) + '">' + esc(r.rating) + '</span></div>' +
      '<div class="score-meta">等级：' + esc(r.grade) + ' · ' + esc(r.rating) + '</div></div>' +
      '<div class="card"><h3>行动建议 · Recommendation</h3>' +
      '<p style="font-size:16px;font-weight:700;color:var(--accent)">' + esc(r.action) + '</p>' +
      '<p class="score-meta" style="margin-top:8px">' + esc(r.change) + '</p></div>' +
      '</div>' +
      '<div class="card" style="margin-top:14px"><h3>风险提示 · Risk Alerts</h3><ul style="padding-left:18px;line-height:1.9">' + riskList + '</ul></div>';
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

/* ---------- Journal ---------- */
function journalStore() {
  try {
    const raw = localStorage.getItem('ios_journal');
    return raw ? JSON.parse(raw) : MockDB.journalDefaults;
  } catch (e) { return MockDB.journalDefaults; }
}
function renderJournal(content) {
  let entries = journalStore();
  const form = '<div class="card" style="margin-bottom:14px"><h3>记录投资决策 · New Entry</h3>' +
    '<div class="journal-form">' +
    '<select id="jType"><option value="买入">买入</option><option value="卖出">卖出</option><option value="复盘">复盘</option></select>' +
    '<input id="jAsset" type="text" placeholder="标的（如 建信新兴市场QDII）" />' +
    '<input id="jDate" type="date" />' +
    '<textarea id="jReason" placeholder="买入/卖出理由或复盘内容"></textarea>' +
    '<button class="btn" id="jSave">保存</button>' +
    '</div></div>';
  const render = function () {
    const items = entries.map(function (e) {
      return '<div class="list-item"><div><div class="title">[' + esc(e.type) + '] ' + esc(e.asset) + '</div>' +
        '<div class="desc">' + esc(e.reason) + '</div></div>' +
        '<div class="right">' + esc(e.date) + '</div></div>';
    }).join('');
    document.getElementById('jList').innerHTML = items || '<p style="color:var(--text-dim)">暂无记录。</p>';
  };
  content.innerHTML = form + '<div class="card"><h3>投资日志 · Investment Journal</h3><div id="jList"></div></div>';
  document.getElementById('jDate').value = new Date().toISOString().slice(0, 10);
  render();
  document.getElementById('jSave').addEventListener('click', function () {
    const type = document.getElementById('jType').value;
    const asset = document.getElementById('jAsset').value.trim() || '组合';
    const reason = document.getElementById('jReason').value.trim();
    const date = document.getElementById('jDate').value;
    if (!reason) { alert('请填写理由或复盘内容'); return; }
    entries.unshift({ date: date || new Date().toISOString().slice(0, 10), type: type, asset: asset, reason: reason });
    try { localStorage.setItem('ios_journal', JSON.stringify(entries)); } catch (e) {}
    document.getElementById('jAsset').value = '';
    document.getElementById('jReason').value = '';
    render();
  });
}