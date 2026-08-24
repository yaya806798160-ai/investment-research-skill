/**
 * Investment Journal — 智能投资日志（交易生命周期 + 累计仓位 + 卖出分析）
 * 数据：结构化交易记录（localStorage ios_journal_v3）
 * 规则：累计投入 / 当前市值 / 组合占比 / 平均成本 / 已实现盈亏 由交易流水实时计算
 * 用途：v1.9 Memory & Learning Layer（卖出复盘统计）
 */
'use strict';

const JOURNAL_ACTIONS = ['Buy', 'Add', 'Hold', 'Reduce', 'Sell', 'Exit'];
const SELL_REASONS = ['Target Reached', 'Valuation Too High', 'Thesis Changed', 'Risk Control', 'Better Opportunity', 'Emergency Liquidity'];

function journalKey() { return 'ios_journal_v3'; }

function migrateEntry(e, i) {
  const actionMap = { Buy: 'Buy', 'Add Gradually': 'Add', Add: 'Add', Hold: 'Hold', Reduce: 'Reduce', Sell: 'Sell', Exit: 'Exit', Review: 'Hold', 买入: 'Buy', 卖出: 'Sell', 复盘: 'Hold' };
  return {
    id: e.id || 'legacy-' + i + '-' + Date.now(),
    date: e.date || '',
    action: actionMap[e.action] || 'Hold',
    asset: e.asset || '',
    amount: Number(e.amount || e.sellAmount) || 0,
    quantity: Number(e.quantity) || 0,
    price: Number(e.price) || 0,
    thesis: e.thesis || '', reason: e.reason || '', expectedOutcome: e.expectedOutcome || '',
    risk: e.risk || '', invalidationCondition: e.invalidationCondition || '', holdingPeriod: e.holdingPeriod || '',
    sellReason: e.sellReason || '',
    postSell: e.postSell || { keptRising: 'unknown', judgment: 'unknown', lesson: '' },
    reviewStatus: e.reviewStatus || 'Pending Review'
  };
}

function journalStore() {
  try {
    const raw = localStorage.getItem(journalKey());
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  try {
    const old = localStorage.getItem('ios_journal_v2') || localStorage.getItem('ios_journal');
    if (old) {
      const migrated = JSON.parse(old).map(migrateEntry);
      if (migrated.length) return migrated;
    }
  } catch (e) {}
  return MockDB.journalDefaults.map(function (e) { return Object.assign({}, e); });
}
function persistJournal(list) {
  try { localStorage.setItem(journalKey(), JSON.stringify(list)); } catch (e) {}
}
function newJournalId() { return 'j-' + Date.now() + '-' + Math.floor(Math.random() * 1000); }
function byDate(a, b) { return (a.date || '').localeCompare(b.date || ''); }

function actionBadge(action) {
  const map = { Buy: 'badge a', Add: 'badge a', Hold: 'badge b', Reduce: 'badge c', Sell: 'badge d', Exit: 'badge d' };
  return '<span class="' + (map[action] || 'badge c') + '">' + esc(action) + '</span>';
}
function statusLabel(action, qty, invested) {
  if (qty <= 0 && invested > 0) return '清仓';
  if (action === 'Buy') return '建仓';
  if (action === 'Add') return '加仓';
  if (action === 'Hold') return '持有';
  if (action === 'Reduce' || action === 'Sell') return '减仓';
  if (action === 'Exit') return '清仓';
  return '—';
}

/**
 * 累计仓位引擎：按日期顺序处理交易流水
 * 输出每个资产的：累计投入 / 当前市值 / 平均成本 / 已实现盈亏 / 状态 / 组合占比
 */
function computePositions(entries) {
  const byAsset = {};
  const sellStats = {};
  entries.slice().sort(byDate).forEach(function (e) {
    const key = String(e.asset || '未知').trim() || '未知';
    if (!byAsset[key]) {
      byAsset[key] = { asset: key, investedGross: 0, costBasis: 0, qty: 0, lastPrice: null, realized: 0, lastAction: null, lastActionDate: '' };
    }
    const p = byAsset[key];
    const amt = Number(e.amount) || 0;
    const q = Number(e.quantity) || null;
    const pr = Number(e.price) || 0;
    if (e.action === 'Buy' || e.action === 'Add') {
      p.investedGross += amt;
      p.costBasis += amt;
      if (q != null && q > 0) p.qty += q;
      else if (pr > 0) p.qty += amt / pr;
      if (pr > 0) p.lastPrice = pr;
      p.lastAction = e.action; p.lastActionDate = e.date || '';
    } else if (e.action === 'Sell' || e.action === 'Exit' || e.action === 'Reduce') {
      const sellAmt = amt;
      let realized = 0;
      if (p.qty > 0) {
        const avgCost = p.costBasis / p.qty;
        let soldQty = (q != null && q > 0) ? q : (pr > 0 ? sellAmt / pr : null);
        if (soldQty != null && soldQty > 0) {
          soldQty = Math.min(soldQty, p.qty);
          const costSold = avgCost * soldQty;
          realized = sellAmt - costSold;
          p.costBasis -= costSold;
          p.qty -= soldQty;
        } else if (soldQty == null) {
          const frac = Math.min(sellAmt / (avgCost * p.qty), 1);
          realized = sellAmt - avgCost * p.qty * frac;
          p.costBasis -= avgCost * p.qty * frac;
          p.qty -= p.qty * frac;
        }
      } else {
        p.costBasis = Math.max(0, p.costBasis - sellAmt);
        realized = sellAmt;
      }
      p.realized += realized;
      if (pr > 0) p.lastPrice = pr;
      p.lastAction = e.action; p.lastActionDate = e.date || '';
      const costSold = Math.max(0, sellAmt - realized);
      sellStats[e.id] = { realized: Math.round(realized * 100) / 100, returnRate: costSold > 0 ? Math.round((realized / costSold) * 1000) / 10 : null };
    } else if (e.action === 'Hold' && pr > 0) {
      p.lastPrice = pr;
      p.lastAction = 'Hold';
    }
  });
  const list = Object.keys(byAsset).map(function (k) {
    const p = byAsset[k];
    const avgCost = p.qty > 0 ? p.costBasis / p.qty : null;
    p.averageCost = avgCost ? Math.round(avgCost * 10000) / 10000 : null;
    p.currentValue = p.qty > 0 ? Math.round((p.qty * (p.lastPrice || avgCost || 0)) * 100) / 100 : 0;
    p.realizedPnl = Math.round(p.realized * 100) / 100;
    p.status = statusLabel(p.lastAction, p.qty, p.investedGross);
    return p;
  }).filter(function (p) { return p.investedGross > 0; });
  return { list: list, sellStats: sellStats };
}

function pctWeight(value, base) {
  if (!base || base <= 0) return 0;
  return Math.round((value / base) * 1000) / 10;
}

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
function learningHtml(s) {
  return '<div class="learn-kpis">' +
    '<div class="learn-kpi"><div class="label">决策次数</div><div class="value">' + s.decisions + '</div></div>' +
    '<div class="learn-kpi"><div class="label">成功率</div><div class="value">' + s.rate + '</div>' +
    '<div class="label" style="margin-top:4px">已复盘 ' + s.reviewed + ' 笔</div></div>' +
    '<div class="learn-kpi"><div class="label">常见错误</div>' +
    (s.mistakes.length ? '<ul>' + s.mistakes.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>' : '<ul><li>暂无已复盘错误</li></ul>') +
    '</div></div>';
}

/* Sell Analysis（v1.9 Memory & Learning） */
function sellAnalysis(entries, sellStats) {
  const sells = entries.filter(function (e) {
    return (e.action === 'Sell' || e.action === 'Exit' || e.action === 'Reduce') && sellStats[e.id];
  });
  const base = { best: null, tooEarly: null, tooLate: null, worst: null };
  if (!sells.length) return base;
  let best = null, worst = null;
  sells.forEach(function (e) {
    const st = sellStats[e.id];
    const ps = e.postSell || {};
    if (!best || st.returnRate > (best.st ? best.st.returnRate : -Infinity)) best = { e: e, st: st };
    if (!worst || st.returnRate < (worst.st ? worst.st.returnRate : Infinity)) worst = { e: e, st: st };
    if (ps.keptRising === 'yes' && (ps.judgment === 'wrong' || ps.judgment === 'partly')) base.tooEarly = { e: e, st: st };
    if (ps.keptRising === 'no' && ps.judgment === 'wrong') base.tooLate = { e: e, st: st };
  });
  base.best = best; base.worst = worst;
  return base;
}

function renderJournal(content) {
  let entries = journalStore();
  let portfolioTotal = 0;
  DataSource.getPortfolio().then(function (pf) { portfolioTotal = pf.total; }).catch(function () {}).then(function () {
    build();
  });
  function build() {
    const pos = computePositions(entries);
    const posRows = pos.list.map(function (p) {
      const pnl = p.realizedPnl >= 0 ? 'up' : 'down';
      return '<tr><td><strong>' + esc(p.asset) + '</strong></td>' +
        '<td>' + esc(p.status) + '</td>' +
        '<td class="num">' + fmtMoney(p.investedGross) + '</td>' +
        '<td class="num">' + fmtMoney(p.currentValue) + '</td>' +
        '<td class="num">' + pctWeight(p.currentValue, portfolioTotal) + '%</td>' +
        '<td class="num">' + (p.averageCost != null ? p.averageCost : '—') + '</td>' +
        '<td class="num ' + pnl + '">' + (p.realizedPnl >= 0 ? '+' : '') + p.realizedPnl + '</td>' +
        '<td>' + esc(p.lastAction || '—') + ' · ' + esc(p.lastActionDate || '') + '</td></tr>';
    }).join('');
    const posCard = '<div class="card" style="margin-bottom:14px"><h3>累计仓位 · Position Overview</h3>' +
      (pos.list.length
        ? '<table><thead><tr><th>资产</th><th>状态</th><th>累计投入</th><th>当前市值</th><th>组合占比</th><th>平均成本</th><th>已实现盈亏</th><th>最近动作</th></tr></thead><tbody>' + posRows + '</tbody></table>' +
          '<p class="score-meta" style="margin-top:8px">组合占比基准：当前记录组合总资产 ' + fmtMoney(portfolioTotal) + '（portfolio-data.json）；当前市值按最近交易价估算（未接行情）。</p>'
        : '<p class="score-meta">暂无仓位记录，录入 Buy/Add 交易后自动生成。</p>') +
      '</div>';
    const sa = sellAnalysis(entries, pos.sellStats);
    const sellItem = function (label, obj, fallback) {
      if (!obj) return '<div class="learn-kpi"><div class="label">' + label + '</div><div class="value" style="font-size:14px;color:var(--text-dim)">' + fallback + '</div></div>';
      const ret = obj.st.returnRate != null ? (obj.st.returnRate >= 0 ? '+' : '') + obj.st.returnRate + '%' : '—';
      return '<div class="learn-kpi"><div class="label">' + label + '</div><div class="value" style="font-size:15px">' + esc(obj.e.asset) + '</div>' +
        '<div class="label" style="margin-top:4px">' + esc(obj.e.date || '') + ' · 收益率 ' + ret + '</div></div>';
    };
    const sellCard = '<div class="card" style="margin-bottom:14px"><h3>卖出分析 · Sell Analysis（v1.9）</h3>' +
      '<div class="learn-kpis" style="margin-bottom:0">' +
      sellItem('最成功卖出', sa.best, '暂无卖出记录') +
      sellItem('过早卖出', sa.tooEarly, '暂无') +
      sellItem('过晚卖出', sa.tooLate, '暂无') +
      sellItem('最大错误', sa.worst, '暂无') +
      '</div></div>';
    const form =
      '<div class="card" style="margin-bottom:14px"><h3>记录投资交易 · New Transaction</h3>' +
      '<div class="journal-form">' +
      '<select id="jAction">' + JOURNAL_ACTIONS.map(function (a) { return '<option>' + a + '</option>'; }).join('') + '</select>' +
      '<input id="jAsset" type="text" placeholder="标的（如 建信新兴市场QDII / NVDA）" />' +
      '<input id="jAmount" type="number" placeholder="交易金额（元）" />' +
      '<input id="jQty" type="number" placeholder="数量/份额（可选）" />' +
      '<input id="jPrice" type="number" placeholder="成交价（可选）" />' +
      '<input id="jDate" type="date" />' +
      '<input id="jPeriod" type="text" placeholder="持有时间（如 6个月）" />' +
      '<select id="jReview"><option value="Pending Review">复盘状态：待复盘</option><option value="Correct">Correct 正确</option><option value="Partially Correct">Partially Correct 部分正确</option><option value="Wrong">Wrong 错误</option></select>' +
      '<input id="jThesis" class="full" type="text" placeholder="投资论点 Investment Thesis" />' +
      '<textarea id="jReason" placeholder="决策理由 Reason"></textarea>' +
      '<input id="jExpected" type="text" placeholder="预期结果 Expected Outcome" />' +
      '<textarea id="jRisk" placeholder="风险 Risk"></textarea>' +
      '<textarea id="jInvalid" placeholder="失效条件 Invalidation Condition"></textarea>' +
      '</div>' +
      '<div class="sell-fields" id="sellFields" style="display:none">' +
      '<h3 style="margin:10px 0">卖出字段 · Sell Fields</h3>' +
      '<div class="journal-form">' +
      '<input id="jSellAmount" type="number" placeholder="卖出金额（元）" />' +
      '<input id="jSellQty" type="number" placeholder="卖出份额（可选）" />' +
      '<input id="jSellPrice" type="number" placeholder="卖出价格（可选）" />' +
      '<input id="jRemaining" type="number" placeholder="卖出后剩余仓位（可选）" />' +
      '<select id="jSellReason">' + SELL_REASONS.map(function (r) { return '<option>' + r + '</option>'; }).join('') + '</select>' +
      '<input id="jKeptRising" type="text" placeholder="卖出后是否继续上涨？是/否/未知" />' +
      '<input id="jJudgment" type="text" placeholder="判断是否正确？正确/部分/错误" />' +
      '<textarea id="jLesson" placeholder="经验总结（卖出后复盘）"></textarea>' +
      '</div></div>' +
      '<div style="margin-top:10px"><button class="btn" id="jSave">保存交易</button></div></div>';
    const renderList = function () {
      const items = entries.slice().sort(function (a, b) { return -byDate(a, b); }).map(function (e) {
        const st = pos.sellStats[e.id];
        const reviewOpts = ['Pending Review', 'Correct', 'Partially Correct', 'Wrong'].map(function (s) {
          return '<option' + (e.reviewStatus === s ? ' selected' : '') + '>' + s + '</option>';
        }).join('');
        const sellInfo = (e.action === 'Sell' || e.action === 'Exit' || e.action === 'Reduce')
          ? '<div class="f"><label>Sell Amount / Reason</label><div>' + fmtMoney(Number(e.amount) || 0) + ' · ' + esc(e.sellReason || '—') + (st && st.returnRate != null ? ' · 收益率 ' + (st.returnRate >= 0 ? '+' : '') + st.returnRate + '%' : '') + '</div></div>'
          : '<div class="f"><label>Amount</label><div>' + fmtMoney(Number(e.amount) || 0) + '</div></div>';
        const ps = e.postSell || {};
        const postSellInfo = (ps.lesson || ps.keptRising !== 'unknown')
          ? '<div class="f full"><label>Post-Sell Review</label><div>' + esc(ps.keptRising || '') + (ps.keptRising ? ' · ' : '') + esc(ps.judgment || '') + (ps.lesson ? ' · ' + esc(ps.lesson) : '') + '</div></div>' : '';
        return '<div class="entry" data-id="' + esc(e.id) + '">' +
          '<div class="entry-head">' + actionBadge(e.action) +
          '<strong>' + esc(e.asset) + '</strong>' +
          '<span class="right">' + esc(e.date || '') + (e.holdingPeriod ? ' · 持有 ' + esc(e.holdingPeriod) : '') + '</span></div>' +
          '<div class="entry-grid">' +
          (e.thesis ? '<div class="f full"><label>Investment Thesis</label><div>' + esc(e.thesis) + '</div></div>' : '') +
          sellInfo +
          (e.expectedOutcome ? '<div class="f"><label>Expected Outcome</label><div>' + esc(e.expectedOutcome) + '</div></div>' : '') +
          (e.risk ? '<div class="f"><label>Risk</label><div>' + esc(e.risk) + '</div></div>' : '') +
          (e.invalidationCondition ? '<div class="f full"><label>Invalidation Condition</label><div>' + esc(e.invalidationCondition) + '</div></div>' : '') +
          (e.reason ? '<div class="f full"><label>Reason</label><div>' + esc(e.reason) + '</div></div>' : '') +
          postSellInfo +
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
          if (en) { en.reviewStatus = sel.value; persistJournal(entries); rebuildAll(); }
        });
      });
      document.querySelectorAll('.jDel').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const id = btn.closest('.entry').getAttribute('data-id');
          entries = entries.filter(function (x) { return x.id !== id; });
          persistJournal(entries);
          rebuildAll();
        });
      });
    };
    function rebuildAll() {
      document.getElementById('jSummary').innerHTML = learningHtml(learningSummary(entries));
      document.getElementById('jPos').innerHTML = posCard;
      document.getElementById('jSell').innerHTML = sellCard;
      renderList();
    }
    content.innerHTML =
      '<div id="jSummary">' + learningHtml(learningSummary(entries)) + '</div>' +
      '<div id="jPos">' + posCard + '</div>' +
      '<div id="jSell">' + sellCard + '</div>' +
      form +
      '<div class="card"><h3>投资日志 · Investment Journal</h3><div id="jList"></div></div>';
    document.getElementById('jDate').value = new Date().toISOString().slice(0, 10);
    const actionSel = document.getElementById('jAction');
    const sellFields = document.getElementById('sellFields');
    actionSel.addEventListener('change', function () {
      const a = actionSel.value;
      sellFields.style.display = (a === 'Sell' || a === 'Exit' || a === 'Reduce') ? 'block' : 'none';
    });
    renderList();
    document.getElementById('jSave').addEventListener('click', function () {
      const a = actionSel.value;
      const isSell = a === 'Sell' || a === 'Exit' || a === 'Reduce';
      const amount = isSell ? Number(document.getElementById('jSellAmount').value) || 0 : Number(document.getElementById('jAmount').value) || 0;
      const postSell = isSell ? {
        keptRising: document.getElementById('jKeptRising').value.trim() || 'unknown',
        judgment: document.getElementById('jJudgment').value.trim() || 'unknown',
        lesson: document.getElementById('jLesson').value.trim()
      } : { keptRising: 'unknown', judgment: 'unknown', lesson: '' };
      const entry = {
        id: newJournalId(),
        date: document.getElementById('jDate').value || new Date().toISOString().slice(0, 10),
        action: a,
        asset: document.getElementById('jAsset').value.trim() || '组合',
        amount: amount,
        quantity: Number(isSell ? document.getElementById('jSellQty').value : document.getElementById('jQty').value) || 0,
        price: Number(isSell ? document.getElementById('jSellPrice').value : document.getElementById('jPrice').value) || 0,
        thesis: document.getElementById('jThesis').value.trim(),
        reason: document.getElementById('jReason').value.trim(),
        expectedOutcome: document.getElementById('jExpected').value.trim(),
        risk: document.getElementById('jRisk').value.trim(),
        invalidationCondition: document.getElementById('jInvalid').value.trim(),
        holdingPeriod: document.getElementById('jPeriod').value.trim(),
        sellReason: isSell ? document.getElementById('jSellReason').value : '',
        postSell: postSell,
        reviewStatus: document.getElementById('jReview').value
      };
      if (!amount && !entry.thesis) { alert('请填写交易金额或投资论点'); return; }
      entries.unshift(entry);
      persistJournal(entries);
      rebuildAll();
      ['jAsset', 'jAmount', 'jQty', 'jPrice', 'jThesis', 'jReason', 'jExpected', 'jRisk', 'jInvalid', 'jPeriod', 'jSellAmount', 'jSellQty', 'jSellPrice', 'jRemaining', 'jKeptRising', 'jJudgment', 'jLesson'].forEach(function (id) {
        const el = document.getElementById(id); if (el) el.value = '';
      });
    });
  }
}

/* Decision Center → Journal 一键记录（结构化保存） */
function saveDecisionToJournal(name, r) {
  const entries = journalStore();
  const actionMap = { Buy: 'Buy', 'Add Gradually': 'Add', Hold: 'Hold', Wait: 'Hold', Reduce: 'Reduce' };
  const entry = {
    id: newJournalId(),
    date: new Date().toISOString().slice(0, 10),
    action: actionMap[r.recommendation] || 'Hold',
    asset: String(name).trim() || '',
    amount: 0, quantity: 0, price: 0,
    thesis: r.thesis || '', reason: r.reason || '',
    expectedOutcome: '按建议 ' + r.recommendation + ' 执行，在验证周期内观察论点兑现情况',
    risk: (r.risks || []).join('；'),
    invalidationCondition: r.whatWouldChangeDecision || '',
    holdingPeriod: '', sellReason: '',
    postSell: { keptRising: 'unknown', judgment: 'unknown', lesson: '' },
    reviewStatus: 'Pending Review'
  };
  entries.unshift(entry);
  persistJournal(entries);
  return entry;
}