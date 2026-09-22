import datetime as dt
import json
import math
import pathlib
import tempfile
import unittest
from unittest.mock import patch

import short_scan as s


def validate_schema(value, schema, root=None):
    """Validate the subset used by the checked-in schema, without a dependency."""
    root=root or schema
    if '$ref' in schema:
        return validate_schema(value,root['$defs'][schema['$ref'].split('/')[-1]],root)
    if 'anyOf' in schema:
        for choice in schema['anyOf']:
            try:
                validate_schema(value,choice,root)
                return
            except AssertionError:
                pass
        raise AssertionError('no schema alternative matched')
    kinds={'null':lambda x:x is None,'object':lambda x:isinstance(x,dict),
        'array':lambda x:isinstance(x,list),'number':lambda x:type(x) in (int,float) and math.isfinite(x),
        'integer':lambda x:type(x) is int,'string':lambda x:isinstance(x,str),'boolean':lambda x:type(x) is bool}
    if 'type' in schema:
        types=schema['type'] if isinstance(schema['type'],list) else [schema['type']]
        assert any(kinds[t](value) for t in types),(value,types)
    if 'const' in schema: assert value==schema['const']
    if 'enum' in schema: assert value in schema['enum']
    if 'minimum' in schema: assert value>=schema['minimum']
    if 'maximum' in schema: assert value<=schema['maximum']
    if 'maxItems' in schema: assert len(value)<=schema['maxItems']
    if schema.get('format')=='date-time': assert dt.datetime.fromisoformat(value).tzinfo
    if isinstance(value,dict):
        assert set(schema.get('required',[]))<=value.keys()
        for k,sub in schema.get('properties',{}).items():
            if k in value: validate_schema(value[k],sub,root)
    if isinstance(value,list) and 'items' in schema:
        for item in value: validate_schema(item,schema['items'],root)


class ScanTests(unittest.TestCase):
    def test_freshness_boundary_and_future(self):
        now=dt.datetime(2026,9,22,10,0,tzinfo=s.TZ)
        self.assertTrue(s.fresh(now-dt.timedelta(minutes=8),now))
        self.assertFalse(s.fresh(now-dt.timedelta(minutes=8,seconds=1),now))
        self.assertFalse(s.fresh(now+dt.timedelta(minutes=2),now))
        self.assertFalse(s.fresh(None,now))

    def test_capital_never_infers_institution_from_one_day(self):
        c=s.capital([{'date':'2026-09-21','main':1e9,'super_large':1e9}],'2026-09-21')
        self.assertFalse(c['institution_verified'])
        self.assertEqual(c['capital_inflow_score'],0)
        self.assertIsNone(c['main_3d'])
        self.assertFalse(c['complete'])

    def test_capital_completed_days_and_deduplication(self):
        flows=[{'date':f'2026-09-{d:02}','main':d,'super_large':d*2} for d in range(15,20)]
        c=s.capital(flows+flows,'2026-09-19')
        self.assertEqual(c['main_5d'],85)
        self.assertEqual(c['main_3d'],54)
        self.assertEqual(c['consecutive_inflow_days'],5)
        self.assertFalse(s.capital(flows,'2026-09-21')['complete'])
        self.assertEqual(s.capital(flows,None)['capital_inflow_score'],0)
        self.assertFalse(s.capital(flows,'2026-09-19',['2026-09-11']+[r['date'] for r in flows[1:]])['complete'])

    def test_pagination_does_not_assume_requested_page_size(self):
        src=s.Source()
        with patch.object(src,'get',side_effect=[{'data':{'total':3,'diff':[{'f12':'a'},{'f12':'b'}]}},{'data':{'total':3,'diff':[{'f12':'c'}]}}]):
            self.assertEqual(len(src.rows('test')),3)
        with patch.object(src,'get',return_value={'data':{'total':3,'diff':[{'f12':'a'}]}}):
            with self.assertRaises(ValueError): src.rows('test')

    def bars(self):
        start=dt.date(2026,7,1)
        return [{'date':(start+dt.timedelta(days=i)).isoformat(),'open':10,'close':10,
            'high':10.1,'low':9.9,'volume':100,'amount':100000} for i in range(60)]

    def q(self,price=10):
        return {'code':'000001','price':price,'pct':0,'open':price,'high':price,'low':price,'source_time':'2026-09-22T10:00:00+08:00',
            'prev_close':10,'volume_ratio':1,'turnover':2}

    def test_flat_prices_and_indicator_alignment(self):
        t=s.technical(self.bars(),self.q(),0,0,'2026-09-22')
        self.assertEqual(t['ma5'],10)
        self.assertEqual(t['ma20'],10)
        self.assertEqual(t['rsi'],50)
        self.assertEqual(t['macd']['histogram'],0)
        self.assertEqual(t['return_5d'],0)
        self.assertFalse(t['reject'])

    def test_overheat_and_upper_wick_rejected(self):
        t=s.technical(self.bars(),self.q(14),0,0,'2026-09-22')
        self.assertTrue(t['reject'])
        self.assertIn('climax_structure',t['risk_flags'])
        q=self.q(10.1);q.update(open=10,high=11,low=9.9,volume_ratio=4)
        self.assertTrue(s.technical(self.bars(),q,0,0,'2026-09-22')['reject'])

    def test_intraday_excludes_old_and_auction(self):
        now=dt.datetime(2026,9,22,10,0,tzinfo=s.TZ)
        row={'time':'2026-09-21 15:00','open':10,'close':10,'high':10,'low':10,'volume':1,'amount':1000,'vwap':10}
        self.assertFalse(s.intraday([row],now)['fresh'])
        row['time']='2026-09-22 09:25'
        self.assertFalse(s.intraday([row],now)['fresh'])
        row['time']='2026-09-22 09:59'
        self.assertTrue(s.intraday([row],now)['fresh'])
        self.assertIsNone(s.intraday([row],now)['active_buy_orders'])

    def test_prior_day_quote_not_appended_as_new_session(self):
        bars=self.bars();bars[-1]['close']=11
        q=self.q(11);q['source_time']=bars[-1]['date']+'T15:00:00+08:00'
        t=s.technical(bars,q,0,0,'2026-09-22')
        self.assertEqual(t['ma5'],10.2)

    def test_second_limit_up_today_is_rejected(self):
        bars=self.bars();bars[-1]['close']=11
        q=self.q(12.1);q.update(pct=10,prev_close=11)
        t=s.technical(bars,q,0,0,'2026-09-22')
        self.assertTrue(t['reject'])
        self.assertIn('consecutive_limit_ups',t['risk_flags'])

    def test_confirmation_requires_every_gate_and_freshness(self):
        signal={'fresh':True,'vwap_status':'above','pullback_support':True,'active_buy_orders':True}
        self.assertEqual(s.confirmation_status(False,False,True,True,signal,True,True),'confirmed')
        self.assertEqual(s.confirmation_status(False,True,True,True,signal,True,True),'waiting')
        signal['active_buy_orders']=None
        self.assertEqual(s.confirmation_status(False,False,True,True,signal,True,True),'waiting')
        self.assertEqual(s.confirmation_status(True,False,True,True,signal,True,True),'rejected')

    def test_total_source_failure_still_writes_stale_json(self):
        with tempfile.TemporaryDirectory() as d, patch.object(s.Source,'get',side_effect=ValueError('offline')):
            path=pathlib.Path(d)/'short_scan.json'
            r=s.scan(output=path)
            self.assertTrue(r['stale'])
            self.assertEqual(r['candidates'],[])
            self.assertEqual(r['top3'],[])
            self.assertTrue(r['source_errors'])
            self.assertEqual(json.loads(path.read_text(encoding='utf8'))['schema_version'],1)

    def test_full_scan_schema_ranking_and_stale_gate(self):
        now=dt.datetime(2026,9,22,10,5,tzinfo=s.TZ)
        def row(code,market,price):
            return {'f12':code,'f13':market,'f14':code,'f2':price,'f3':1,'f5':1000,'f6':1e7,
                'f8':2,'f10':1.3,'f15':price*1.001,'f16':price*.99,'f17':price*.998,
                'f18':price/1.01,'f62':1e6,'f66':5e5,'f124':now.timestamp()}
        bars=[]
        for i in range(60):
            close=10+i*.002+math.sin(i)*.04
            bars.append({'date':(now.date()-dt.timedelta(days=60-i)).isoformat(),
                'open':close-.01,'close':close,'high':close+.02,'low':close-.02,'volume':100,'amount':1e7})
        flows=[{'date':b['date'],'main':1e5,'super_large':i*1e4} for i,b in enumerate(bars[-5:])]
        minutes=[{'time':(now-dt.timedelta(minutes=9-i)).strftime('%Y-%m-%d %H:%M'),
            'open':10.11,'close':10.12,'high':10.13,'low':10.1,'volume':100,'amount':101200,'vwap':10.11} for i in range(10)]
        def rows(_self,fs,fid='f12'):
            if fs.startswith('m:90'):return [row('BK1',90,10.12)]
            if fs.startswith('i:'):return [row('000001',1,10.12)]
            return [row('000002',0,10.12),row('000003',0,14)]
        with tempfile.TemporaryDirectory() as d,patch.object(s.collector,'now_cn',return_value=now),patch.object(s.Source,'rows',rows),patch.object(s.Source,'daily',return_value=bars),patch.object(s.Source,'flows',return_value=flows),patch.object(s.Source,'minutes',return_value=minutes):
            path=pathlib.Path(d)/'scan.json'
            r=s.scan(output=path)
            self.assertEqual(r['top3'],['000002'])
            self.assertEqual(r['candidates'][0]['intraday_status'],'waiting')
            self.assertEqual(r['rejected'][0]['code'],'000003')
            self.assertFalse(r['stale'])
            self.assertEqual(r['expires_at'],'2026-09-22T10:13:00+08:00')
            schema=json.loads(pathlib.Path(__file__).with_name('short_scan.schema.json').read_text(encoding='utf8'))
            validate_schema(r,schema)
            with patch.object(s.collector,'now_cn',return_value=now+dt.timedelta(minutes=9)):
                r=s.scan(output=path)
                self.assertTrue(r['stale'])
                self.assertFalse(any(c['intraday_status']=='confirmed' for c in r['candidates']))

    def test_proxy_api_error_uses_upstream_fallback(self):
        payload={'rc':0,'data':{'total':1,'diff':[]}}
        import io
        with patch.object(s.collector,'get_json',return_value={'rc':1,'data':None}),patch.object(s.urllib.request,'urlopen',return_value=io.BytesIO(json.dumps(payload).encode())):
            source=s.Source()
            self.assertEqual(source.get('api/qt/clist/get',{}),payload)
            self.assertIn(('api/qt/clist/get',None,None),source.proxy_failed)
            self.assertNotIn(('api/qt/clist/get','another universe',None),source.proxy_failed)

    def test_source_deadline_and_circuit_breaker(self):
        source=s.Source();source.deadline=0
        with self.assertRaises(TimeoutError):source.get('test',{})
        source=s.Source()
        with patch.object(s.urllib.request,'urlopen',side_effect=ConnectionError('offline')) as request:
            with self.assertRaises(ValueError):source.get('test',{},history=True)
            self.assertEqual(request.call_count,2)
            with self.assertRaises(ConnectionError):source.get('other',{},history=True)
            self.assertEqual(request.call_count,2)

    def test_empty_symbol_does_not_trip_host_circuit(self):
        import io
        responses=[io.BytesIO(b'{"rc":0,"data":null}'),io.BytesIO(b'{"rc":0,"data":null}'),io.BytesIO(b'{"rc":0,"data":{"ok":true}}')]
        source=s.Source()
        with patch.object(s.urllib.request,'urlopen',side_effect=responses):
            with self.assertRaises(ValueError):source.get('missing-stock',{},history=True)
            self.assertEqual(source.unavailable_until,{})
            self.assertTrue(source.get('valid-stock',{},history=True)['data']['ok'])

    def test_unexpected_failure_clears_old_candidate_file(self):
        with tempfile.TemporaryDirectory() as d,patch.object(s.collector,'LIVE',pathlib.Path(d)):
            r=s.write_failure(ValueError('internal'))
            self.assertTrue(r['stale'])
            self.assertEqual(r['candidates'],[])
            schema=json.loads(pathlib.Path(__file__).with_name('short_scan.schema.json').read_text(encoding='utf8'))
            validate_schema(r,schema)

    def test_collector_still_publishes_on_scanner_error(self):
        with tempfile.TemporaryDirectory() as d,patch.object(s.collector,'LIVE',pathlib.Path(d)),patch.object(s.collector,'setup_logging'),patch.object(s.collector,'collect_indices',return_value={}),patch.object(s.collector,'collect_boards',return_value=({},[])),patch.object(s.collector,'collect_breadth_and_limits',return_value={}),patch.object(s,'scan',side_effect=ValueError('test failure')),patch.object(s.collector,'push_snapshot') as push,patch.object(s.collector.logging,'exception'),patch('sys.argv',['collector.py','--force','--push']):
            self.assertEqual(s.collector.main(),0)
            push.assert_called_once()
            result=json.loads((pathlib.Path(d)/'short_scan.json').read_text(encoding='utf8'))
            self.assertTrue(result['stale'])


if __name__=='__main__': unittest.main()
