/**
 * Investment OS — 应用入口：hash 路由、导航、初始化
 */
'use strict';
const VIEWS = {
  dashboard: { title: '仪表盘', render: renderDashboard },
  decision: { title: '决策中心', render: renderDecision },
  portfolio: { title: '组合', render: renderPortfolio },
  research: { title: '研究报告', render: renderResearch },
  journal: { title: '投资日志', render: renderJournal }
};

function currentView() {
  const h = location.hash.replace(/^#\//, '') || 'dashboard';
  return VIEWS[h] ? h : 'dashboard';
}

function render() {
  const view = currentView();
  const meta = VIEWS[view];
  document.getElementById('pageTitle').textContent = meta.title;
  document.querySelectorAll('.nav-item').forEach(function (n) {
    n.classList.toggle('active', n.getAttribute('data-view') === view);
  });
  const content = document.getElementById('content');
  content.innerHTML = '<div style="color:var(--text-dim);padding:20px">加载中…</div>';
  Promise.resolve(meta.render(content)).catch(function (err) {
    content.innerHTML = '<div class="card"><h3>出错</h3><p>' + esc(err && err.message ? err.message : String(err)) + '</p></div>';
  });
  // 移动端关闭侧栏
  document.getElementById('sidebar').classList.remove('open');
}

async function init() {
  document.getElementById('today').textContent = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  try {
    const mkt = await DataSource.getMarket();
    const chip = document.getElementById('marketChipVal');
    chip.textContent = mkt.global.regime + ' · 风险 ' + mkt.global.riskLevel;
    chip.style.color = getComputedStyle(document.documentElement).getPropertyValue('--warn');
  } catch (e) {}
  window.addEventListener('hashchange', render);
  document.getElementById('menuBtn').addEventListener('click', function () {
    document.getElementById('sidebar').classList.toggle('open');
  });
  render();
}

document.addEventListener('DOMContentLoaded', init);