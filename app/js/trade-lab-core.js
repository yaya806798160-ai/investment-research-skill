/** Investment OS 七步交易台核心：纯计算，缺数据一律 fail-closed。 */
'use strict';
function labValidSnapshot(doc, now, allowPartial) {
  const time = now instanceof Date ? now.getTime() : new Date(now || Date.now()).getTime();
  if (!doc || typeof doc !== 'object') return {ok:false,reason:'数据不存在'};
  const gen = Date.parse(doc.generated_at), exp=Date.parse(doc.expires_at);
  if (!Number.isFinite(gen)||!Number.isFinite(exp)) return {ok:false,reason:'缺少有效时间戳'};
  if (doc.stale!==false || time>exp || gen>time+60000 || exp<gen) return {ok:false,reason:'快照已过期'};
  if (!allowPartial && (doc.partial===true || (Array.isArray(doc.missing)&&doc.missing.length))) return {ok:false,reason:'数据采集不完整'};
  return {ok:true,reason:doc.partial?'时效有效，但采集不完整':'时效有效'};
}

function labProposals(snapshot,scan,now) {
  const a=labValidSnapshot(snapshot,now,false), b=labValidSnapshot(scan,now,false);
  if(!a.ok||!b.ok) return {status:'blocked',reason:'未满足完整且新鲜的数据要求：市场'+a.reason+'；扫描'+b.reason,rows:[]};
  const list=Array.isArray(scan.candidates)?scan.candidates:[];
  const rows=[];
  for(const x of list){
    const price=Number(x.price), resistance=Number(x.resistance), low=Number(x.low), vwap=Number(x.intraday&&x.intraday.vwap);
    if(![price,resistance,low,vwap].every(v=>Number.isFinite(v)&&v>0)) continue;
    if(x.stale || (x.intraday&&x.intraday.fresh!==true))continue;
    const entry=Math.max(price,resistance)*1.002;
    const stop=Math.min(low,vwap)*0.995;
    const per=entry-stop;
    if(per<=0 || per/entry>0.10)continue;
    const target=entry+2*per;
    rows.push({code:String(x.code||''),name:String(x.name||''),entry:+entry.toFixed(3),stop:+stop.toFixed(3),target:+target.toFixed(3),rr:2,score:Number.isFinite(Number(x.score))?Number(x.score):null,observationOnly:true,reason:'突破观察：突破阻力'+resistance.toFixed(3)+'并站稳，回撤不跌破观察止损，需复核成交量/VWAP及基本面。'});
    if(rows.length===5)break;
  }
  return {status:rows.length?'conditional':'no_candidates',reason:rows.length?'仅为数学推演场景；未经历史回测，不代表高胜率或可执行订单':'数据完整但不足以生成具有明确参考水平的场景',rows};
}

function labTechnical(candidate) {
  if(!candidate)return {signal:'数据不足',reason:'未找到标的当日扫描指标',weekly:'周线数据未接入'};
  if([candidate.price,candidate.ma20,candidate.ma5,candidate.ma10,candidate.rsi].some(v=>v==null||v===''))return {signal:'数据不足',reason:'日线指标缺失',weekly:'周线数据未接入'};
  const price=Number(candidate.price),ma20=Number(candidate.ma20),ma5=Number(candidate.ma5),ma10=Number(candidate.ma10),rsi=Number(candidate.rsi);
  if(![price,ma20,ma5,ma10,rsi].every(Number.isFinite)||[price,ma20].some(v=>v<=0)||rsi<0||rsi>100)return {signal:'数据不足',reason:'日线移动平均或 RSI 缺失',weekly:'周线数据未接入'};
  let signal='持有/观察',reason='价格围绕均线，等待趋势确认';
  if(price<ma20 && ma5<ma10){signal='减仓观察';reason='价格在MA20下方且MA5弱于MA10，关注已有仓位风险';}
  else if(price>ma20 && ma5>ma10 && rsi>=50 && rsi<=70){signal='候选观察';reason='价格在MA20上方且短均线占优，仍需确认板块、资金和分时支撑';}
  else if(rsi>75){signal='不追高';reason='RSI超过75，短线超买风险偏高';}
  return {signal,reason,price,ma5,ma10,ma20,rsi,macd:candidate.macd||null,weekly:'周线数据未接入；日线信号不能替代周线确认'};
}

function labBacktestSma(raw,fast,slow,costBps) {
  const f=Number(fast||5),s=Number(slow||20),bps=Number(costBps==null?10:costBps);
  if(!Number.isInteger(f)||!Number.isInteger(s)||f<2||s<=f||s>120||!Number.isFinite(bps)||bps<0||bps>100)throw Error('无效的回测参数');
  if(!Array.isArray(raw))return {status:'insufficient',reason:'没有价格序列'};
  const bars=raw.filter(x=>x&&String(x.date||'')&&[x.open,x.high,x.low,x.close].every(v=>Number.isFinite(Number(v))&&Number(v)>0))
    .map(x=>({date:String(x.date),open:Number(x.open),close:Number(x.close),high:Number(x.high),low:Number(x.low)}));
  if(bars.length<s+3)return {status:'insufficient',reason:'有效K线不足'};
  for(let i=1;i<bars.length;i++){if(bars[i].date<=bars[i-1].date)return {status:'insufficient',reason:'K线未按日期递增或有重复'};}
  const ma=(end,len)=>{let sum=0;for(let j=end-len+1;j<=end;j++)sum+=bars[j].close;return sum/len;};
  let cash=1,qty=0,cost=0,peak=1,dd=0,closed=[],equityCurve=[];
  const fee=bps/10000;
  for(let i=s+1;i<bars.length;i++){
    const prevFast=ma(i-2,f),prevSlow=ma(i-2,s);
    const curFast=ma(i-1,f),curSlow=ma(i-1,s);
    const buy=prevFast<=prevSlow&&curFast>curSlow;
    const sell=prevFast>=prevSlow&&curFast<curSlow;
    if(qty && sell){
      cash=qty*bars[i].open*(1-fee);
      closed.push({entry:cost,exit:cash,pnl:cash/cost-1,date:bars[i].date});
      qty=0;cost=0;
    }else if(!qty && buy){
      cost=cash;
      qty=cash*(1-fee)/bars[i].open;
      cash=0;
    }
    const equity=qty?qty*bars[i].close:cash;
    peak=Math.max(peak,equity);
    dd=Math.min(dd,(equity/peak)-1);
    equityCurve.push({date:bars[i].date,equity});
  }
  const wins=closed.filter(t=>t.pnl>0), losses=closed.filter(t=>t.pnl<0);
  const grossWin=wins.reduce((sum,t)=>sum+Math.max(0,t.exit-t.entry),0);
  const grossLoss=losses.reduce((sum,t)=>sum+Math.max(0,t.entry-t.exit),0);
  return {status:'ok',sampleBars:bars.length,dateStart:bars[0].date,dateEnd:bars[bars.length-1].date,trades:closed.length,winRate:closed.length?wins.length/closed.length:null,profitFactor:grossLoss>0?grossWin/grossLoss:null,maxDrawdown:dd,endingEquity:equityCurve.length?equityCurve[equityCurve.length-1].equity:1,openTrade:qty>0,feeBps:bps,fast:f,slow:s,curve:equityCurve};
}

function labPortfolioStress(holdings) {
  if(!Array.isArray(holdings)||!holdings.length)return {status:'insufficient'};
  let sum=0;const buckets={};let largest=null;
  for(const h of holdings){
    const amount=Number(h.amount);
    if(!Number.isFinite(amount)||amount<0)continue;
    sum+=amount;
    const cat=String(h.category||'未分类');
    buckets[cat]=(buckets[cat]||0)+amount;
    if(!largest||amount>largest.amount)largest={name:String(h.name||'未知'),amount};
  }
  if(sum<=0)return {status:'insufficient'};
  const weights=Object.entries(buckets).map(([category,amount])=>({category,amount,weight:amount/sum})).sort((a,b)=>b.weight-a.weight);
  return {status:'ok',total:sum,loss20:-sum*0.2,largest:{...largest,weight:largest.amount/sum},categories:weights,stressNote:'假设各持仓市值同时下跌20%，非概率预测；未计汇率、税费、相关性变化或衍生品对冲成本'};
}

function labJournalCheck(raw) {
  if(!Array.isArray(raw)||!raw.length)return {status:'insufficient',reason:'没有用户保存的真实交易记录'};
  const recent=raw.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,20);
  const noStop=recent.filter(e=>!String(e.invalidationCondition||'').trim() || String(e.invalidationCondition).trim()==='—').length;
  const noPrice=recent.filter(e=>!(Number(e.price)>0)).length;
  const pending=recent.filter(e=>!e.reviewStatus||e.reviewStatus==='Pending Review').length;
  const rules=[];
  if(noStop)rules.push('每笔交易在下单前记录明确的失效/止损条件（最近20笔缺失'+noStop+'笔）');
  if(noPrice)rules.push('补齐每笔成交价格与金额，禁止用推测价格计算盈亏（缺失'+noPrice+'笔）');
  if(pending)rules.push('每周复盘仍未完成的交易决策（待复盘'+pending+'笔）');
  if(rules.length<3)rules.push('把交易前的入场理由与交易后的执行偏差分开记录');
  if(rules.length<3)rules.push('汇总手续费与滑点后再比较不同策略绩效');
  return {status:'ok',count:recent.length,missingStop:noStop,missingPrice:noPrice,pendingReview:pending,rules:rules.slice(0,3),note:'此处仅评估日志完整性与纪律，未核验真实成交和已实现盈亏'};
}

function labDailyChecklist(){
  return [{at:'09:15',task:'核验行情源时效、隔夜风险、A股开市日、持仓暴露与待确认订单'},
  {at:'09:30',task:'观察集合竞价与首30分钟量价，标记强弱板块；不开盘追价'},
  {at:'11:30',task:'盘中复核指数/市场宽度/持仓变化，记录候选入场条件'},
  {at:'13:30',task:'检查午后资金回流、板块同步、VWAP与持仓赎回条件'},
  {at:'14:30',task:'最终买/卖/撤回双向决策；风险、费用与成交约束优先'},
  {at:'14:55',task:'核对可执行订单及撤单截止规则；无可靠数据则保持观望'},
  {at:'15:10',task:'盘后记录结果与下一交易日条件，避免用事后数据填充盘中信号'}];
}

if (typeof module !== 'undefined' && module.exports) module.exports = {labValidSnapshot,labProposals,labTechnical,labBacktestSma,labPortfolioStress,labJournalCheck,labDailyChecklist};
