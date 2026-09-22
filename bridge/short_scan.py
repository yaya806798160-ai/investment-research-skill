#!/usr/bin/env python3
"""Evidence-first A-share scanner; stdlib, existing Eastmoney bridge sources."""
from __future__ import annotations

import argparse
import concurrent.futures as futures
import datetime as dt
import http.client
import json
import math
import os
import pathlib
import statistics
import time
import urllib.parse
import urllib.error
import urllib.request

import collector

TZ = collector.TZ
FIELDS = 'f2,f3,f5,f6,f8,f10,f12,f13,f14,f15,f16,f17,f18,f62,f66,f124'
OPTIONAL_MISSING = ['ETF creation/redemption flows', 'LHB institutional seats',
                    'northbound/other institutional ownership flows', 'aggressor-side buy orders']


def num(x):
    try:
        v = float(x)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def stamp(x):
    try:
        return dt.datetime.fromtimestamp(float(x), TZ)
    except (ValueError, TypeError, OverflowError, OSError):
        return None


def iso(t):
    return t.isoformat(timespec='seconds') if t else None


def fresh(t, now):
    return bool(t and t.date() == now.date() and -60 <= (now-t).total_seconds() <= collector.STALE_MINUTES*60)


def pct(a, b):
    return (a / b - 1) * 100 if a is not None and b else None


def mean(xs):
    return statistics.mean(xs) if xs else None


class Source:
    """Try the configured proxy first, then the identical public upstream."""
    def __init__(self):
        self.events = []
        self.proxy_failed = set()
        self.unavailable_until = {}
        self.deadline = time.monotonic() + 150

    def get(self, path, params, history=False):
        if time.monotonic() >= self.deadline:
            raise TimeoutError('scan collection budget exhausted')
        query = urllib.parse.urlencode(params)
        proxy_key = (path, params.get('fs'), params.get('secid'))
        host = 'https://push2his.eastmoney.com' if history else 'https://push2.eastmoney.com'
        error = None
        if not history and proxy_key not in self.proxy_failed:
            try:
                j = collector.get_json(path, params, timeout=4)
                if j.get('rc', 0) != 0 or not j.get('data'):
                    raise ValueError('empty/error proxy payload')
                return j
            except Exception as e:
                # Endpoint-scoped for this refresh only; other endpoints still try proxy.
                self.proxy_failed.add(proxy_key)
                self.events.append({'source': 'Investment OS /emq/', 'status': 'fallback', 'error': type(e).__name__})
        if time.monotonic() < self.unavailable_until.get(host, 0):
            raise ConnectionError(f'{host}: temporary circuit open after upstream failure')
        transport_failures = 0
        for attempt in range(2):
            try:
                remaining = self.deadline-time.monotonic()
                if remaining <= 0:
                    raise TimeoutError('scan collection budget exhausted')
                req = urllib.request.Request(host+'/'+path+'?'+query,
                    headers={'User-Agent': 'Mozilla/5.0 investment-os-short-scan/1.0',
                             'Referer': 'https://quote.eastmoney.com/'})
                with urllib.request.urlopen(req, timeout=min(8,remaining)) as r:
                    j = json.load(r)
                if j.get('rc', 0) != 0 or not j.get('data'):
                    raise ValueError('empty upstream data')
                return j
            except Exception as e:
                error = type(e).__name__
                if isinstance(e, urllib.error.HTTPError):
                    transport_failures += int(e.code >= 500)
                elif isinstance(e, (TimeoutError, ConnectionError, urllib.error.URLError, http.client.RemoteDisconnected)):
                    transport_failures += 1
        if transport_failures == 2:
            self.unavailable_until[host] = time.monotonic()+30
        raise ValueError(f'{host}/{path}: {error}')

    def rows(self, fs, fid='f12'):
        rows, seen = [], set()
        for page in range(1, 101):
            d = self.get('api/qt/clist/get', {'pn': page, 'pz': 100, 'po': 1,
                'np': 1, 'fltt': 2, 'invt': 2, 'fid': fid, 'fs': fs, 'fields': FIELDS})['data']
            batch = d.get('diff') or []
            if isinstance(batch, dict):
                batch = list(batch.values())
            new = [r for r in batch if (r.get('f13'), r.get('f12')) not in seen]
            if not new:
                if len(rows) < int(d.get('total') or 0):
                    raise ValueError('incomplete/repeated pagination')
                break
            rows.extend(new)
            seen.update((r.get('f13'), r.get('f12')) for r in new)
            if len(rows) >= int(d.get('total') or len(rows)):
                break
        else:
            raise ValueError('pagination limit reached')
        return rows

    def daily(self, secid):
        d = self.get('api/qt/stock/kline/get', {'secid': secid, 'klt': 101,
            'fqt': 1, 'end': '20500101', 'lmt': 90, 'fields1': 'f1,f2,f3',
            'fields2': 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61'}, True)['data']
        out = []
        for line in d.get('klines') or []:
            p = line.split(',')
            if len(p) >= 7 and all(num(x) is not None for x in p[1:7]):
                out.append(dict(zip(['date','open','close','high','low','volume','amount'], [p[0]]+[float(x) for x in p[1:7]])))
        return sorted({r['date']: r for r in out}.values(), key=lambda r: r['date'])

    def flows(self, secid):
        d = self.get('api/qt/stock/fflow/daykline/get', {'secid': secid, 'klt': 101,
            'lmt': 12, 'fields1': 'f1,f2,f3', 'fields2': 'f51,f52,f53,f54,f55,f56'}, True)['data']
        out = []
        for s in d.get('klines') or []:
            p = s.split(',')
            if len(p) >= 6 and num(p[1]) is not None and num(p[5]) is not None:
                out.append({'date': p[0], 'main': float(p[1]), 'super_large': float(p[5])})
        return out

    def minutes(self, secid):
        d = self.get('api/qt/stock/trends2/get', {'secid': secid, 'ndays': 1, 'iscr': 0,
            'fields1': 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11',
            'fields2': 'f51,f52,f53,f54,f55,f56,f57,f58'}, True)['data']
        rows = []
        for line in d.get('trends') or []:
            p = line.split(',')
            if len(p) >= 8 and all(num(x) is not None for x in p[1:8]):
                rows.append(dict(zip(['time','open','close','high','low','volume','amount','vwap'],
                                    [p[0]]+[float(x) for x in p[1:8]])))
        return rows


def quote(r):
    return {'code': str(r.get('f12') or ''), 'name': r.get('f14'),
            'secid': f"{r.get('f13')}.{r.get('f12')}",
            **{k: num(r.get(f)) for k, f in {'price':'f2','pct':'f3','volume':'f5',
                'amount':'f6','turnover':'f8','volume_ratio':'f10','high':'f15','low':'f16',
                'open':'f17','prev_close':'f18','main_flow':'f62','super_large_flow':'f66'}.items()},
            'source_time': iso(stamp(r.get('f124')))}


def ema(xs, n):
    out = [xs[0]]
    for x in xs[1:]:
        out.append(out[-1]+2/(n+1)*(x-out[-1]))
    return out


def technical(bars, q, market5, board5, today):
    history = [b for b in bars if b['date'] < today]
    quote_today = bool(q.get('source_time') and q['source_time'][:10] == today)
    prices = [b['close'] for b in history] + ([q['price']] if q['price'] and quote_today else [])
    result = {'ma5': None, 'ma10': None, 'ma20': None, 'macd': None, 'rsi': None,
        'return_5d': None, 'rs': {'market': None, 'board': None}, 'resistance': None,
        'breakout': None, 'volume_pattern': None, 'risk_flags': [], 'score': 0, 'reject': False}
    if len(prices) < 36 or not q['price']:
        result['risk_flags'].append('insufficient_daily_history')
        return result
    ma = {n: mean(prices[-n:]) for n in (5,10,20)}
    result.update({f'ma{n}': round(v,4) for n,v in ma.items()})
    dif = [a-b for a,b in zip(ema(prices,12),ema(prices,26))]
    dea = ema(dif,9)
    result['macd'] = {'dif': round(dif[-1],4), 'dea': round(dea[-1],4), 'histogram': round(2*(dif[-1]-dea[-1]),4)}
    changes = [b-a for a,b in zip(prices,prices[1:])]
    gain = mean([max(x,0) for x in changes[:14]])
    loss = mean([max(-x,0) for x in changes[:14]])
    for x in changes[14:]:
        gain,loss = (gain*13+max(x,0))/14,(loss*13+max(-x,0))/14
    rsi = 100-100/(1+gain/loss) if loss else (100 if gain else 50)
    ret = pct(prices[-1],prices[-6])
    resistance = max(b['high'] for b in history[-20:])
    pairs=list(zip(history,history[1:]))[-10:]
    up = [b['volume'] for a,b in pairs if b['close']>a['close']]
    down = [b['volume'] for a,b in pairs if b['close']<a['close']]
    pattern = bool(up and down and mean(up)>mean(down)*1.1)
    result.update(rsi=round(rsi,2), return_5d=round(ret,3),
        rs={'market': None if market5 is None else round(ret-market5,3),
            'board': None if board5 is None else round(ret-board5,3)},
        resistance=round(resistance,3), breakout={'above_prior_20d_high': q['price']>resistance,
            'distance_pct': round(pct(q['price'],resistance),3)}, volume_pattern={
            'up_volume_mean': mean(up),'down_volume_mean':mean(down), 'up_expand_down_contract':pattern})
    score = 0
    score += 8 if ma[5]>ma[10] and ma[5]>mean(prices[-6:-1]) and ma[10]>mean(prices[-11:-1]) else 0
    score += 6 if q['price']>ma[20] else 0
    score += 6 if dif[-1]>dea[-1] and abs(dif[-1]/q['price'])<.02 else 0
    score += 5 if pattern else 0
    score += 8 if all(v is not None and v>0 for v in result['rs'].values()) else 0
    score += 5 if 45<=rsi<=70 else 0
    score += 4 if -5<=pct(q['price'],resistance)<=3 else 0
    flags = result['risk_flags']
    if ret>15: flags.append('five_day_gain_above_15pct'); score-=min(18,(ret-15)*1.5+6)
    if rsi>=78: flags.append('rsi_overheated'); score-=12
    d5,d10 = pct(q['price'],ma[5]),pct(q['price'],ma[10])
    if d5>8 or d10>12: flags.append('extended_above_ma'); score-=12
    threshold = 19.5 if q['code'].startswith(('300','301','688','689')) else (29.5 if q['code'].startswith(('4','8','920')) else 9.5)
    closes = [b['close'] for b in history]
    recent = [pct(b,a) for a,b in zip(closes,closes[1:])]
    if quote_today and q['pct'] is not None:
        recent.append(q['pct'])
    recent = recent[-2:]
    if len(recent)==2 and all(x>=threshold for x in recent): flags.append('consecutive_limit_ups'); result['reject']=True
    hi,lo,op = q['high'],q['low'],q['open']
    if hi and lo and op and hi>lo and (hi-max(op,q['price']))/(hi-lo)>.45 and (q['volume_ratio'] or 0)>2:
        flags.append('explosive_volume_upper_wick'); result['reject']=True
    if op and q['prev_close'] and pct(op,q['prev_close'])>3 and pct(q['price'],hi)<-3:
        flags.append('gap_up_fade'); result['reject']=True
    if (ret>30) or (rsi>=85 and d5>6) or d5>15:
        flags.append('climax_structure'); result['reject']=True
    result['score']=round(max(0,score),2)
    return result


def capital(flows, expected_date, expected_dates=None):
    if expected_date is None:
        flows = []
    rows = sorted({r['date']:r for r in flows if r['date']<=expected_date}.values(),key=lambda r:r['date'])
    complete = len(rows)>=5 and rows[-1]['date']==expected_date
    if expected_dates is not None:
        complete = complete and [r['date'] for r in rows[-5:]] == expected_dates[-5:]
    n=0
    for r in reversed(rows):
        if r['main']<=0: break
        n+=1
    m3 = sum(r['main'] for r in rows[-3:]) if len(rows)>=3 else None
    m5 = sum(r['main'] for r in rows[-5:]) if len(rows)>=5 else None
    delta = rows[-1]['super_large']-rows[-2]['super_large'] if len(rows)>=2 else None
    score = (8*(m3>0)+8*(m5>0)+min(n,4)*2+6*(delta>0)) if complete else 0
    return {'main_3d':m3,'main_5d':m5,'consecutive_inflow_days':n,
        'super_large_change':delta, 'capital_inflow_score':score, 'complete':complete,
        'source_date':rows[-1]['date'] if rows else None,
        'institution_verified':False, 'basis':'completed trading days; order-size flow is not institutional identity',
        'evidence':rows[-5:], 'risk_flags':[] if complete else ['missing_or_outdated_5d_capital_history']}


def intraday(rows, now):
    rows = [r for r in rows if r['time'].startswith(now.date().isoformat()) and r['time'][11:]>='09:30']
    out = {'vwap':None,'vwap_status':'unknown','source_time':None,'fresh':False,
           'pullback_support':False,'recent_volume_ratio':None,'return_5m':None,
           'drawdown_from_high_pct':None,'active_buy_orders':None}
    if not rows: return out
    last=rows[-1]
    t=dt.datetime.fromisoformat(last['time']).replace(tzinfo=TZ)
    vwap=last['vwap']
    recent=rows[-5:]
    support = len(rows)>=6 and any(r['low']<=r['vwap']*1.005 for r in recent[:-1]) and all(r['close']>=r['vwap']*.997 for r in recent) and last['close']>=vwap
    out.update(vwap=vwap,vwap_status='above' if last['close']>=vwap else 'below',
        source_time=iso(t),fresh=fresh(t,now),pullback_support=support,
        recent_volume_ratio=(sum(r['volume'] for r in rows[-5:])/sum(r['volume'] for r in rows[-10:-5])) if len(rows)>=10 and sum(r['volume'] for r in rows[-10:-5]) else None,
        return_5m=pct(last['close'],rows[-6]['close']) if len(rows)>=6 else None,
        drawdown_from_high_pct=pct(last['close'],max(r['high'] for r in rows)))
    return out


def return5(bars, price, today, source_time=None):
    completed=[b for b in bars if b['date']<today]
    if source_time and source_time[:10] == today:
        return pct(price,completed[-5]['close']) if len(completed)>=5 else None
    return pct(completed[-1]['close'],completed[-6]['close']) if len(completed)>=6 else None


def confirmation_status(reject, stale, capital_complete, technical_ready, signal, synchrony, core_link):
    if reject:
        return 'rejected'
    if (not stale and capital_complete and technical_ready and signal['fresh']
            and signal['vwap_status']=='above' and signal['pullback_support']
            and signal.get('active_buy_orders') is True and synchrony and core_link):
        return 'confirmed'
    return 'waiting'


def atomic_write(path, result):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix('.tmp')
    temp.write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
    os.replace(temp,path)


def write_failure(error):
    """Unexpected scanner errors must invalidate its file, not stop legacy publication."""
    now=iso(collector.now_cn())
    result={'schema_version':1,'generated_at':now,'market_time':None,'stale':True,
        'stale_after_minutes':collector.STALE_MINUTES,'expires_at':now,'data_sources':[],
        'market_regime':{'label':'unavailable'},'strong_boards':[],'candidates':[],
        'top3':[],'rejected':[],'missing':['scanner execution failed'],
        'source_errors':[{'source':'scanner','error':type(error).__name__}],
        'transport_events':[],'coverage':{},'rules':{'not_a_buy_signal':True,
        'reader_must_recheck_age_minutes':collector.STALE_MINUTES}}
    atomic_write(collector.LIVE/'short_scan.json',result)
    return result


def scan(top=10, board_limit=8, stock_limit=100, output=None):
    source=Source()
    started=collector.now_cn()
    today=started.date().isoformat()
    missing=list(OPTIONAL_MISSING)
    failures=[]
    data_sources=[]
    def safe(label, fn, default):
        try: return fn()
        except Exception as e:
            failures.append({'source':label,'error':str(e)})
            return default
    with futures.ThreadPoolExecutor(max_workers=4) as pool:
        jobs=[pool.submit(safe,'industry_boards',lambda:source.rows('m:90+t:2'),[]),
              pool.submit(safe,'concept_boards',lambda:source.rows('m:90+t:3'),[]),
              pool.submit(safe,'market_quote',lambda:source.rows('i:1.000001'),[]),
              pool.submit(safe,'market_history',lambda:source.daily('1.000001'),[])]
        industry,concept,index_rows,index_bars=[j.result() for j in jobs]
    market=quote(index_rows[0]) if index_rows else None
    market5=return5(index_bars,market['price'],today,market['source_time']) if market else None
    expected=max((b['date'] for b in index_bars if b['date']<today),default=None)
    expected_dates=[b['date'] for b in index_bars if b['date']<today]
    if expected is None: missing.append('market trading-day reference')
    market_time=dt.datetime.fromisoformat(market['source_time']) if market and market['source_time'] else None
    data_sources.append({'source':'Eastmoney market quote','source_time':iso(market_time),'stale':not fresh(market_time,started)})
    all_boards={r['f12']:r for r in industry+concept if r.get('f12')}
    board_quotes=[quote(r) for r in all_boards.values()]
    def board_score(q):
        # Flow intensity avoids ranking only the largest, overlapping universes.
        intensity=(q['main_flow']/q['amount']*100) if q['amount'] else 0
        return min(q['pct'] or 0,10)*3+max(-10,min(15,intensity))+ (4 if (q['super_large_flow'] or 0)>0 else 0)
    eligible=[q for q in board_quotes if (q['pct'] or 0)>0 and (q['main_flow'] or 0)>0]
    eligible.sort(key=board_score,reverse=True)
    selected=eligible[:board_limit]
    strong=[]
    def inspect_board(q):
        code=q['code']
        members=safe('members:'+code,lambda:source.rows('b:'+code),[])
        bars=safe('board_history:'+code,lambda:source.daily('90.'+code),[])
        qs=[quote(r) for r in members]
        cores=sorted([x for x in qs if x['amount']],key=lambda x:x['amount'],reverse=True)[:3]
        core_signals=[]
        for core in cores:
            signal=intraday(safe('core_minutes:'+core['code'],lambda c=core:source.minutes(c['secid']),[]),collector.now_cn())
            core_signals.append({'code':core['code'],'name':core['name'],'pct':core['pct'],**signal})
        board_signal=intraday(safe('board_minutes:'+code,lambda:source.minutes('90.'+code),[]),collector.now_cn())
        completed=[b for b in bars if b['date']<today]
        limit_count=sum((x['pct'] or 0)>=(19.5 if x['code'].startswith(('300','301','688','689')) else 9.5) for x in qs)
        record={**q,'score':round(board_score(q),2), 'return_5d':return5(bars,q['price'],today,q['source_time']),
            'turnover_vs_previous_full_day':q['amount']/completed[-1]['amount'] if completed and completed[-1]['amount'] and q['amount'] else None,
            'turnover_comparison_note':'partial session / prior full day, not same-time growth',
            'etf_flow':None,'member_count':len(qs),'limit_up_count':limit_count,
            'large_gain_count':sum((x['pct'] or 0)>=5 for x in qs),
            'rising_fraction':sum((x['pct'] or 0)>0 for x in qs)/len(qs) if qs else None,
            'core_stocks':core_signals,'intraday':board_signal,
            'history_date':completed[-1]['date'] if completed else None}
        return record,qs
    with futures.ThreadPoolExecutor(max_workers=4) as pool:
        inspected=list(pool.map(inspect_board,selected))
    stocks={}
    for board,members in inspected:
        strong.append(board)
        for q in members:
            if not q['code'].startswith(('0','3','6','4','8','920')) or not q['price'] or q['price']<=0: continue
            if q['code'] not in stocks: stocks[q['code']]={**q,'boards':[]}
            stocks[q['code']]['boards'].append(board['code'])
    # Cheap preselection is disclosed; full histories/minutes are bounded for five-minute refreshes.
    ranked=sorted(stocks.values(),key=lambda q:(q['price']<=30, (q['main_flow'] or 0)>0,
        (q['main_flow'] or 0)/(q['amount'] or 1),-(abs(q['pct'] or 0))),reverse=True)[:stock_limit]
    board_map={b['code']:b for b in strong}
    def inspect_stock(q):
        bars=safe('daily:'+q['code'],lambda:source.daily(q['secid']),[])
        flows=safe('capital:'+q['code'],lambda:source.flows(q['secid']),[])
        minutes=safe('minutes:'+q['code'],lambda:source.minutes(q['secid']),[])
        board=board_map[q['boards'][0]]
        tech=technical(bars,q,market5,board['return_5d'],today)
        cap=capital(flows,expected,expected_dates)
        sig=intraday(minutes,collector.now_cn())
        sig['opening_gap_pct']=pct(q['open'],q['prev_close'])
        history_dates=[b['date'] for b in bars if b['date']<today]
        technical_flags=tech.pop('risk_flags')
        flags=technical_flags+cap['risk_flags']
        if not history_dates or history_dates[-1]!=expected: flags.append('outdated_daily_history')
        if 'ST' in (q['name'] or '').upper() or '退' in (q['name'] or ''): flags.append('special_treatment_or_delisting')
        if q['price']>30: flags.append('price_above_preference')
        board_t=dt.datetime.fromisoformat(board['source_time']) if board['source_time'] else None
        qt=dt.datetime.fromisoformat(q['source_time']) if q['source_time'] else None
        critical_stale=not (fresh(qt,collector.now_cn()) and fresh(board_t,collector.now_cn()) and sig['fresh'] and fresh(market_time,collector.now_cn()) and board['intraday']['fresh'] and any(x['fresh'] for x in board['core_stocks']))
        critical_stale = critical_stale or not cap['complete'] or not history_dates or history_dates[-1]!=expected or board['history_date']!=expected or tech['ma20'] is None
        if critical_stale: flags.append('critical_live_data_stale_or_missing')
        if tech['ma20'] is None: flags.append('technical_data_incomplete')
        if not cap['complete']: flags.append('capital_confirmation_unavailable')
        # Public minutes do not identify aggressor-side orders. Never invent this gate.
        flags.append('active_buy_orders_unavailable')
        synced=(sig['return_5m'] is not None and board['intraday']['return_5m'] is not None and sig['return_5m']>0 and board['intraday']['return_5m']>0)
        core_link=any(x['fresh'] and x['vwap_status']=='above' and (x['return_5m'] or 0)>0 for x in board['core_stocks'])
        reject=tech.pop('reject') or 'special_treatment_or_delisting' in flags or (sig['drawdown_from_high_pct'] is not None and sig['drawdown_from_high_pct']<-5)
        if sig['drawdown_from_high_pct'] is not None and sig['drawdown_from_high_pct']<-5: flags.append('intraday_large_reversal')
        technical_ready=bool(tech['ma5'] and tech['ma10'] and tech['ma20'] and tech['ma5']>tech['ma10'] and q['price']>tech['ma20'] and all(x is not None and x>0 for x in tech['rs'].values()) and not technical_flags)
        status=confirmation_status(reject,critical_stale,cap['complete'],technical_ready,sig,synced,core_link)
        score=tech.pop('score')+cap['capital_inflow_score']+min(board['score'],20)
        score+=5 if sig['vwap_status']=='above' and sig['pullback_support'] else 0
        score-=10 if critical_stale else 0
        score-=5 if q['price']>30 else 0
        if not cap['complete'] or tech['ma20'] is None: score=min(score,30)
        critical_times=[iso(market_time),q['source_time'],sig['source_time'],board['source_time'],board['intraday']['source_time']]+[x['source_time'] for x in board['core_stocks']]
        return {**q,'boards':[{'code':c,'name':board_map[c]['name']} for c in q['boards']],
            'capital_3d_5d':cap,'capital_inflow_score':cap['capital_inflow_score'],**tech,
            'vwap_status':sig['vwap_status'],'intraday':{**sig,'board_synchrony':synced,'core_linkage':core_link},
            'intraday_status':status,'candidate_status':'rejected' if reject else 'candidate',
            'score':round(max(0,score),2),'stale':critical_stale,'critical_source_times':critical_times,
            'evidence':{'capital':cap['evidence'],'capital_interpretation':cap['basis'],
                'technical':'daily adjusted bars + current quote; volume pattern uses completed sessions',
                'board_strength':board['score'],'institutional_inflow_claim':False,
                'confirmation_blockers':(['aggressor-side buy orders unavailable']
                    +(['critical source missing/stale'] if critical_stale else [])
                    +(['technical structure not ready'] if not technical_ready else [])
                    +(['VWAP pullback not confirmed'] if not sig['pullback_support'] else [])
                    +(['board synchrony absent'] if not synced else [])
                    +(['core linkage absent'] if not core_link else []))},
            'risk_flags':sorted(set(flags))}
    with futures.ThreadPoolExecutor(max_workers=6) as pool:
        assessed=list(pool.map(inspect_stock,ranked))
    generated=collector.now_cn()
    # Re-evaluate at end: collection itself must not manufacture freshness.
    for c in assessed:
        if any(not fresh(dt.datetime.fromisoformat(t) if t else None,generated) for t in c['critical_source_times']):
            c['stale']=True
            c['risk_flags']=sorted(set(c['risk_flags']+['critical_live_data_stale_or_missing']))
            if c['intraday_status']=='confirmed': c['intraday_status']='waiting'
    rejected=sorted([c for c in assessed if c['intraday_status']=='rejected'],key=lambda c:c['score'],reverse=True)
    candidates=sorted([c for c in assessed if c['intraday_status']!='rejected'],key=lambda c:c['score'],reverse=True)[:top]
    for n,c in enumerate(candidates,1): c['rank']=n; c['top3']=n<=3
    stale=not fresh(market_time,generated) or not strong or not candidates or any(c['stale'] for c in candidates) or not industry or not concept
    if stale:
        for c in candidates:
            if c['intraday_status']=='confirmed': c['intraday_status']='waiting'
    all_times=[dt.datetime.fromisoformat(t) for c in candidates for t in c['critical_source_times'] if t]
    expires_at=min(all_times)+dt.timedelta(minutes=collector.STALE_MINUTES) if all_times else generated
    data_sources[0]['stale']=not fresh(market_time,generated)
    missing+=['source:'+x['source'] for x in failures]
    if not industry: missing.append('industry boards')
    if not concept: missing.append('concept boards')
    for b in strong:
        t=dt.datetime.fromisoformat(b['source_time']) if b['source_time'] else None
        data_sources.append({'source':'Eastmoney board:'+b['code'],'source_time':b['source_time'],'stale':not fresh(t,generated)})
    for c in candidates:
        data_sources.append({'source':'Eastmoney stock:'+c['code'],'source_time':c['source_time'],
            'minute_time':c['intraday']['source_time'],'capital_date':c['capital_3d_5d']['source_date'],'stale':c['stale']})
    result={'schema_version':1,'generated_at':iso(generated),'market_time':iso(market_time),
        'stale':stale,'stale_after_minutes':collector.STALE_MINUTES,
        'expires_at':iso(expires_at),
        'data_sources':data_sources,'market_regime':{'index':market,'return_5d':market5,
            'label':'risk_on' if market and (market['pct'] or 0)>0 and (market5 or 0)>0 else 'mixed_or_defensive'},
        'strong_boards':strong,'candidates':candidates,'top3':[c['code'] for c in candidates[:3]],'rejected':rejected,
        'missing':sorted(set(missing)),'source_errors':failures,'transport_events':source.events,
        'coverage':{'industry_boards':len(industry),'concept_boards':len(concept),
            'positive_price_and_flow_boards':len(eligible),'selected_boards':len(strong),
            'unique_constituents':len(stocks),'fully_assessed':len(assessed),
            'board_limit':board_limit,'stock_limit':stock_limit,
            'collection_budget_seconds':150,
            'preselection':'price <=30 preferred, positive main flow and flow/turnover; overlapping boards deduplicated'},
        'rules':{'not_a_buy_signal':True,'capital_not_institution_identity':True,
            'confirmation_requires':['fresh quote/board/index/minutes','complete capital history','technical structure',
                'VWAP pullback support','active buy orders','board synchrony','core linkage','no overheating'],
            'reader_must_recheck_age_minutes':collector.STALE_MINUTES,
            'optional_unavailable':OPTIONAL_MISSING}}
    atomic_write(output or collector.LIVE/'short_scan.json',result)
    return result


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--force',action='store_true')
    ap.add_argument('--top',type=int,default=10)
    ap.add_argument('--boards',type=int,default=8)
    ap.add_argument('--stocks',type=int,default=100)
    args=ap.parse_args()
    if args.force or collector.in_market_window(collector.now_cn()):
        r=scan(max(1,args.top),max(1,args.boards),max(1,args.stocks))
        print(json.dumps({'generated_at':r['generated_at'],'stale':r['stale'],
            'top3':r['top3'],'candidates':len(r['candidates']),'rejected':len(r['rejected']),
            'coverage':r['coverage']},ensure_ascii=False))
