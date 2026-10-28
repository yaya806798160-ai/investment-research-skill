const assert = require('node:assert/strict');
const { mtEsc, mtStatus, mtBuild, mtPct } = require('../js/market-terminal.js');
const now = new Date('2026-10-19T02:00:00Z');
function feed(overrides = {}) {
  return { stale: false, partial: false, generated_at: '2026-10-19T01:55:00Z', expires_at: '2026-10-19T02:03:00Z', ...overrides };
}
assert.equal(mtStatus(feed(), now).fresh, true);
assert.equal(mtStatus(feed({ stale: true }), now).fresh, false);
assert.equal(mtStatus(feed({ expires_at: '2026-10-19T01:59:00Z' }), now).fresh, false);
assert.equal(mtStatus(feed({ generated_at: '2026-10-19T02:02:00Z' }), now).fresh, false);
assert.equal(mtStatus(feed({ missing: ['breadth'] }), now).label, '部分数据缺失');
assert.equal(mtStatus(null, now).fresh, false);
assert.equal(mtStatus(feed({ expires_at: 'garbage' }), now).fresh, false);
assert.equal(mtEsc('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
assert.equal(mtPct(null), '—');
assert.match(mtBuild(null, null, now), /已过期|不可用/);
assert.match(mtBuild(feed({indices:{'上证':{name:'上证',price:3694,pct:-0.3}},partial:true,missing:['breadth:partial'],breadth:{stock_count:20,up:5,down:5,flat:10},themes:{PCB:{pct:-3,main_flow:-3e8,source_time:'2026-10-16T03:00:00Z'}}}),feed({candidates:[{name:'<b>',code:'000001',pct:1,score:80}],top3:['000001']}),now),/不代表全市场/);
assert.doesNotMatch(mtBuild(feed(), feed({candidates:[{name:'<script>',code:'AA'}]}), now), /<script>/);
assert.match(mtBuild(feed({ stale: true }), feed(), now), /禁止交易引用/);
console.log('market terminal checks passed');
