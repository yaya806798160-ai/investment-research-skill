/** Investment OS 七步交易工作台：无外部依赖，复用既有数据层。 */
'use strict';
function tlEsc(x){return String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function tlFmt(x,dp=2){return x==null||!Number.isFinite(Number(x))?'—':Number(x).toLocaleString('zh-CN',{maximumFractionDigits:dp});}

function tlPer(x){return x==null||!Number.isFinite(Number(x))?'—':(Number(x)*100).toFixed(1)+'%';}

function tlCard(title,desc,body){return '<section class="card tl-card"><h3>'+tlEsc(title)+'</h3><p class="tl-note">'+tlEsc(desc)+'</p>'+body+'</section>';}

function tlHtml(s){
  const market=labValidSnapshot(s.snapshot,s.now,false);
  const scanner=labValidSnapshot(s.scan,s.now,false);
  const plans=labProposals(s.snapshot,s.scan,s.now);
  const risk=labPortfolioStress(s.portfolio?.holdings||[]);
  const journal=labJournalCheck(s.journal);
  const usable=market.ok&&scanner.ok;
  const status='<header class="tl-header"><div><h2>七步交易研究台</h2><p>只读取已有数据；交易场景并非预测或交易委托</p></div><button id="tlRefresh" class="btn">刷新研究数据</button></header>'+
   '<div class="tl-status"><span>市场：'+(market.ok?'数据有效':'不可用 · '+tlEsc(market.reason))+'</span><span>扫描：'+(scanner.ok?'数据有效':'不可用 · '+tlEsc(scanner.reason))+'</span><span>组合档案：'+tlEsc(s.portfolio?.updatedAt||'未知')+'</span></div>'+
   '<p class="tl-note">市场快照：'+tlEsc(s.snapshot?.generated_at||'无')+'；短线扫描：'+tlEsc(s.scan?.generated_at||'无')+'。失效数据不会产生可执行信号。</p>';
  let idea='<p class="tl-warn">'+tlEsc(plans.reason)+'</p>';
  if(plans.rows.length){
    idea+='<div class="tl-scroll"><table><thead><tr><th>标的</th><th>触发入场</th><th>观察止损</th><th>2R假设目标</th><th>收益/风险</th></tr></thead><tbody>'+
      plans.rows.map(x=>'<tr><td>'+tlEsc(x.name)+' <small>'+tlEsc(x.code)+'</small></td><td>'+tlFmt(x.entry,3)+'</td><td>'+tlFmt(x.stop,3)+'</td><td>'+tlFmt(x.target,3)+'</td><td>2 : 1</td></tr>').join('')+'</tbody></table></div>'+
      '<p class="tl-note">价格由已验证阻力位与止损假设计算，不是回测胜率、更不是保证盈利；成交量、周线与基本面仍需复核。</p>';
  }
  const tech='<div class="tl-inline"><input type="text" id="tlSymbol" placeholder="股票代码 600435" maxlength="12" aria-label="股票代码"/><button id="tlAnalyze" class="btn">分析日线</button></div>'+
    '<div class="tl-result" id="tlTechnical">'+(usable?'输入当前扫描股票代码查询 MA/RSI/MACD。':'当前快照失效，技术信号暂停。')+' 周线数据尚未接入。</div>';
  const news='<p class="tl-warn">新闻数据源未验证：暂不生成预测价格区间。</p><p class="tl-note">后续新闻适配字段：新闻原始链接、发布时间、事件事实、市场预期差、影响路径、可证伪条件。没有可靠来源不能自动执行交易。</p><a href="#/research">查看已有研究 →</a>';
  const backtest='<p class="tl-note">调用现有腾讯复权日K接口；MA5/MA20 交叉，昨日收盘判断、次日开盘模拟成交、单边成本 10bp。没有样本不显示胜率。</p>'+
    '<div class="tl-inline"><input id="tlBacktestSym" value="sh512480" aria-label="回测代码" placeholder="sh512480"/><button class="btn" id="tlRunBacktest">回测历史</button></div><div class="tl-result" id="tlBacktestResult">尚未运行；仅支持 sh / sz 六位数字代码。</div>';
  let stress='<p class="tl-warn">组合金额缺失，不能计算压力测试。</p>';
  if(risk.status==='ok'){
    stress='<div class="tl-kpis"><div><small>档案市值 / 人民币</small><strong>¥'+tlFmt(risk.total,0)+'</strong></div><div><small>统一下跌20%损失</small><strong class="tl-warn">¥'+tlFmt(-risk.loss20,0)+'</strong></div><div><small>最大单仓</small><strong>'+tlPer(risk.largest.weight)+'</strong></div></div>'+
      '<p class="tl-note">'+tlEsc(risk.stressNote)+'。档案不等于已核验的当日实际仓位。</p>'+
      '<p>类别暴露：'+risk.categories.slice(0,5).map(x=>tlEsc(x.category)+' '+tlPer(x.weight)).join('；')+'</p>'+
      '<p class="tl-note">同一科技类别可能有重合；个股相关系数与对冲成本缺失时，不编造相关性或期权对冲数量。</p><a href="#/action">已有风控行动中心 →</a>';
  }
  let journals='<p class="tl-warn">'+tlEsc(journal.reason||'未读取到真实交易日志')+'。不会把演示交易列为真实样本。</p>';
  if(journal.status==='ok')journals='<p>最近 '+journal.count+' 笔；缺失止损 '+journal.missingStop+' 笔；缺失成交价 '+journal.missingPrice+' 笔；待复盘 '+journal.pendingReview+' 笔。</p><ol class="tl-rules">'+journal.rules.map(x=>'<li>'+tlEsc(x)+'</li>').join('')+'</ol><p class="tl-note">'+tlEsc(journal.note)+'</p>';
  journals+='<p><a href="#/journal">进入原有投资日志 →</a></p>';
  const checklist='<p class="tl-note">北京时间，仅在A股交易日适用。预案为风控清单，不会自动发出交易委托。</p><div class="tl-steps">'+labDailyChecklist().map(x=>'<div><strong>'+tlEsc(x.at)+'</strong><span>'+tlEsc(x.task)+'</span></div>').join('')+'</div>';
  return '<div class="tl-workbench">'+status+'<div class="tl-grid">'+
    tlCard('01｜交易机会生成器','有效、完整的市场和扫描快照才可生成最多5个条件场景。',idea)+
    tlCard('02｜技术分析师','复用扫描器日线与VWAP；独立周线尚待接入。',tech)+
    tlCard('03｜新闻→交易影响','独立新闻来源、价格事件研究尚待上线。',news)+
    tlCard('04｜策略回测','复用已有历史K线，不与实时模拟交易账本混合。',backtest)+
    tlCard('05｜组合压力测试','读取原有组合档案，不复制仓位数据库。',stress)+
    tlCard('06｜最近20笔交易复盘','只使用浏览器中实际保存的日志。',journals)+
    tlCard('07｜每日交易计划','固定盘前、盘中和尾盘时间检查点。',checklist)+
    '</div><p class="tl-note tl-footer">当前为 A 股工作台。美股模拟盘、冠军策略模拟盘仍独立记录。盈利因子、日周线、新闻预测等须以对应数据实际加载结果为准。</p></div>';
}

async function renderTradingLab(content){
  async function getJson(url){try{const r=await fetch(url,{cache:'no-store'});return r.ok?await r.json():null;}catch(e){return null;}}
  const data=await Promise.all([getJson('/os/live/latest.json'),getJson('/os/live/short_scan.json'),typeof loadPortfolio==='function'?loadPortfolio().catch(()=>null):Promise.resolve(null)]);
  let journal=[];try{const raw=localStorage.getItem('ios_journal_v3');const p=raw?JSON.parse(raw):[];journal=Array.isArray(p)?p:[];}catch(e){}
  const [snapshot,scan,portfolio]=data;
  content.innerHTML=tlHtml({snapshot,scan,portfolio,journal,now:new Date()});
  document.getElementById('tlRefresh').addEventListener('click',()=>renderTradingLab(content));
  document.getElementById('tlAnalyze').addEventListener('click',()=>{
    const id=String(document.getElementById('tlSymbol').value||'').trim();
    const node=document.getElementById('tlTechnical');
    if(!labValidSnapshot(snapshot,new Date(),false).ok||!labValidSnapshot(scan,new Date(),false).ok){node.textContent='数据失效，禁止使用旧技术信号。';return;}
    const cand=(Array.isArray(scan.candidates)?scan.candidates:[]).find(c=>String(c.code||'')===id);
    const v=labTechnical(cand);
    node.innerHTML='<p><strong>'+tlEsc(v.signal)+'</strong>：'+tlEsc(v.reason)+'</p>'+(v.price?'<p class="tl-note">现价 '+tlFmt(v.price)+' · MA5 '+tlFmt(v.ma5)+' · MA10 '+tlFmt(v.ma10)+' · MA20 '+tlFmt(v.ma20)+' · RSI '+tlFmt(v.rsi)+'</p>':'')+'<p class="tl-warn">'+tlEsc(v.weekly)+'</p>';
  });
  document.getElementById('tlRunBacktest').addEventListener('click',async()=>{
    const el=document.getElementById('tlBacktestResult');
    const symbol=String(document.getElementById('tlBacktestSym').value||'').trim().toLowerCase();
    if(!/^(sh|sz)\d{6}$/.test(symbol)){el.textContent='请输入 sh 或 sz 加6位代码';return;}
    el.textContent='正在读取历史K线...';
    try{
      if(typeof fetchKlineSeries!=='function'){el.textContent='OS历史行情接口不可用';return;}
      const bars=await fetchKlineSeries(symbol),r=labBacktestSma(bars,5,20,10);
      if(r.status!=='ok'){el.textContent='回测不可用：'+r.reason;return;}
      el.innerHTML='<div class="tl-kpis"><div><small>已平仓次数</small><strong>'+tlFmt(r.trades,0)+'</strong></div>'+
        '<div><small>胜率</small><strong>'+tlPer(r.winRate)+'</strong></div>'+
        '<div><small>盈利因子</small><strong>'+tlFmt(r.profitFactor)+'</strong></div>'+
        '<div><small>最大回撤</small><strong>'+tlPer(r.maxDrawdown)+'</strong></div></div>'+
        '<p class="tl-note">'+tlEsc(r.dateStart)+' 至 '+tlEsc(r.dateEnd)+'，'+r.sampleBars+'根复权日K；单边成本10bp，当前仍持仓：'+(r.openTrade?'是':'否')+'；'+(r.trades<20?'少于20笔已完成交易，无法证明胜率稳定':'仍须进行样本外检验')+'。数值为历史模拟，非真实成交。</p>';
    }catch(e){el.textContent='回测失败：'+String(e&&e.message||e);}
  });
}
