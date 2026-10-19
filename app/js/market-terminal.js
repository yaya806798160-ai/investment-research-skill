/** Investment OS 市场全景：只读取 OS 自有 bridge 快照，不接入 TickFlow 数据服务。 */
'use strict';

function mtEsc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}
function mtNumber(value, digits) {
  const number = Number(value);
  return value == null || !Number.isFinite(number) ? '—' : number.toLocaleString('zh-CN', { maximumFractionDigits: digits == null ? 2 : digits });
}
function mtPct(value) {
  const number = Number(value);
  return value == null || !Number.isFinite(number) ? '—' : (number > 0 ? '+' : '') + number.toFixed(2) + '%';
}
function mtColor(value) {
  return Number(value) > 0 ? 'mt-up' : Number(value) < 0 ? 'mt-down' : '';
}
function mtTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  return new Date(value).toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' });
}
function mtStatus(data, now) {
  if (!data || !Number.isFinite(Date.parse(data.generated_at)) || !Number.isFinite(Date.parse(data.expires_at))) {
    return { fresh: false, label: '快照不可用' };
  }
  const time = now instanceof Date ? now.getTime() : Date.now();
  const generated = Date.parse(data.generated_at);
  const expires = Date.parse(data.expires_at);
  if (data.stale !== false || generated > time + 60 * 1000 || expires < generated || time > expires) {
    return { fresh: false, label: '已过期 · 禁止交易引用' };
  }
  if (data.partial || (Array.isArray(data.missing) && data.missing.length)) {
    return { fresh: true, label: '部分数据缺失' };
  }
  return { fresh: true, label: '时效有效' };
}
function mtRows(rows, emptyText) {
  return rows.length ? rows.join('') : '<tr><td colspan="5" class="mt-muted">' + mtEsc(emptyText) + '</td></tr>';
}
function mtBuild(snapshot, scan, now) {
  const source = mtStatus(snapshot, now);
  const signal = mtStatus(scan, now);
  const indices = snapshot && snapshot.indices && typeof snapshot.indices === 'object' ? snapshot.indices : {};
  const indexCards = ['上证', '创业板', '科创50'].map(function (key) {
    const item = indices[key] || {};
    return '<div class="mt-stat"><div class="mt-muted">' + mtEsc(item.name || key) + '</div><strong>' + mtNumber(item.price) + '</strong><span class="' + mtColor(item.pct) + '">' + mtPct(item.pct) + '</span></div>';
  }).join('');
  const breadth = snapshot && snapshot.breadth && typeof snapshot.breadth === 'object' ? snapshot.breadth : null;
  const missing = (snapshot && Array.isArray(snapshot.missing)) ? snapshot.missing : [];
  const breadthPartial = Boolean(snapshot && snapshot.partial) || missing.some(function (x) { return String(x).indexOf('breadth') >= 0; });
  const up = breadth && Number.isFinite(Number(breadth.up)) ? Number(breadth.up) : 0;
  const down = breadth && Number.isFinite(Number(breadth.down)) ? Number(breadth.down) : 0;
  const flat = breadth && Number.isFinite(Number(breadth.flat)) ? Number(breadth.flat) : 0;
  const percent = up + down + flat ? (100 * up / (up + down + flat)) : 0;
  const breadthHtml = breadth ?
    '<div class="mt-stat-grid"><div class="mt-stat"><div class="mt-muted">上涨</div><strong class="mt-up">' + mtNumber(breadth.up, 0) + '</strong></div>' +
    '<div class="mt-stat"><div class="mt-muted">下跌</div><strong class="mt-down">' + mtNumber(breadth.down, 0) + '</strong></div>' +
    '<div class="mt-stat"><div class="mt-muted">平盘</div><strong>' + mtNumber(breadth.flat, 0) + '</strong></div>' +
    '<div class="mt-stat"><div class="mt-muted">涨停（10cm / 20cm）</div><strong>' + mtNumber(breadth.limit_up_10cm_count, 0) + ' / ' + mtNumber(breadth.limit_up_20cm_count, 0) + '</strong></div></div>' +
    '<div class="mt-bar" aria-label="已采集标的中的上涨占比"><span style="width:' + percent.toFixed(1) + '%"></span></div>' +
    '<p class="mt-muted">覆盖 ' + mtNumber(breadth.stock_count, 0) + ' 只 · 上涨占已覆盖样本 ' + percent.toFixed(1) + '% · ' + (breadthPartial ? '<span class="mt-warning">部分数据缺失，不代表全市场</span>' : '采集记录') + '</p>' :
    '<p class="mt-muted">市场宽度数据不可用</p>';
  const themes = snapshot && snapshot.themes && typeof snapshot.themes === 'object' ? snapshot.themes : {};
  const themeRows = Object.keys(themes).map(function (key) {
    const item = themes[key] || {};
    return '<tr><td>' + mtEsc(key) + '<div class="mt-muted">' + mtEsc(item.board_name || '') + '</div></td><td class="' + mtColor(item.pct) + '">' + mtPct(item.pct) + '</td><td>' + (item.main_flow == null ? '—' : mtNumber(Number(item.main_flow) / 1e8) + ' 亿') + '</td><td>' + mtTime(item.source_time) + '</td></tr>';
  });
  const boards = scan && Array.isArray(scan.strong_boards) ? scan.strong_boards.slice(0, 8) : [];
  const boardRows = boards.map(function (item) {
    return '<tr><td>' + mtEsc(item.name || item.board_name || item.code || '—') + '</td><td class="' + mtColor(item.pct) + '">' + mtPct(item.pct) + '</td><td>' + mtNumber(item.score) + '</td></tr>';
  });
  const candidates = scan && Array.isArray(scan.candidates) ? scan.candidates.slice(0, 8) : [];
  const candidateRows = candidates.map(function (item) {
    const intraday = item.intraday || {};
    return '<tr><td>' + mtEsc(item.name || item.code) + '<div class="mt-muted">' + mtEsc(item.code) + '</div></td><td class="' + mtColor(item.pct) + '">' + mtPct(item.pct) + '</td><td>' + mtNumber(item.score, 0) + '</td><td>' + mtEsc(intraday.vwap_status || item.vwap_status || '—') + '</td><td>' + mtEsc(item.candidate_status || '候选') + '</td></tr>';
  });
  const scanMissing = scan && Array.isArray(scan.missing) ? scan.missing : [];
  const issues = snapshot && Array.isArray(snapshot.source_errors) ? snapshot.source_errors : [];
  const statusLine = '<div class="mt-status"><span class="' + (source.fresh ? (snapshot.partial ? 'mt-warning' : 'mt-up') : 'mt-warning') + '">市场快照：' + mtEsc(source.label) + '</span>' +
    '<span class="' + (signal.fresh ? (scan.partial ? 'mt-warning' : 'mt-up') : 'mt-warning') + '">扫描器：' + mtEsc(signal.label) + '</span></div>' +
    '<p class="mt-muted">行情生成：' + mtTime(snapshot && snapshot.generated_at) + ' · 快照到期：' + mtTime(snapshot && snapshot.expires_at) +
    ' · 扫描生成：' + mtTime(scan && scan.generated_at) + ' · 来源：Investment OS bridge</p>';
  return '<section class="mt-terminal"><div class="mt-header"><div><h2>市场全景 · 量化看板</h2><p class="mt-muted">参考 TickFlow 的信息布局，数据来自 Investment OS 自有采集链</p></div><button class="btn" id="mtReload">刷新快照</button></div>' +
    statusLine + (!source.fresh || !signal.fresh ? '<p class="mt-blocked">历史/过期快照仅供回顾，不得用于实时下单或当日买卖建议。</p>' : '') +
    '<div class="mt-index-grid">' + indexCards + '</div>' +
    '<div class="grid cols-2 mt-section">' +
    '<div class="card"><h3>市场宽度</h3>' + breadthHtml + '</div>' +
    '<div class="card"><h3>扫描健康度</h3><div class="mt-stat-grid"><div class="mt-stat"><div class="mt-muted">候选数</div><strong>' + (scan ? mtNumber((scan.candidates || []).length, 0) : '—') + '</strong></div><div class="mt-stat"><div class="mt-muted">缺失项</div><strong>' + (scan ? mtNumber(scanMissing.length, 0) : '—') + '</strong></div></div><p class="mt-muted">' + mtEsc(issues.length ? '市场数据异常：' + issues.length + ' 项' : '市场数据异常：暂无记录') + '</p><p class="mt-muted">扫描独立数据缺失：' + mtEsc(scanMissing.slice(0, 4).join('、') || '—') + '</p></div>' +
    '</div><div class="grid cols-2 mt-section">' +
    '<div class="card"><h3>核心板块热度</h3><table><thead><tr><th>板块</th><th>涨跌幅</th><th>主力流入</th><th>数据时间</th></tr></thead><tbody>' + mtRows(themeRows, '板块数据缺失') + '</tbody></table></div>' +
    '<div class="card"><h3>强势板块（扫描器）</h3><table><thead><tr><th>板块</th><th>涨跌幅</th><th>评分</th></tr></thead><tbody>' + mtRows(boardRows, '暂无可验证板块') + '</tbody></table></div>' +
    '</div><div class="card mt-section"><h3>短线观察池 · 不是买入指令</h3><table><thead><tr><th>标的</th><th>涨跌幅</th><th>评分</th><th>VWAP 状态</th><th>确认级别</th></tr></thead><tbody>' + mtRows(candidateRows, '暂无扫描候选（可能是扫描失败）') + '</tbody></table></div>' +
    '<p class="mt-muted mt-credit">布局参考：<a href="https://github.com/shy3130/tick-stock-panel" target="_blank" rel="noopener noreferrer">TickFlow Stock Panel</a>（MIT 开源项目）。本模块未复制其源码，也未连接其付费 API。</p></section>';
}
async function renderMarketTerminal(content) {
  const urls = ['/os/live/latest.json', '/os/live/short_scan.json'];
  const results = await Promise.all(urls.map(async function (url) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) { return null; }
  }));
  content.innerHTML = mtBuild(results[0], results[1], new Date());
  document.getElementById('mtReload').addEventListener('click', function () { renderMarketTerminal(content); });
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { mtEsc, mtStatus, mtBuild, mtPct };
}
