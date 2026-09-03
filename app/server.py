#!/usr/bin/env python3
"""Investment OS 本地服务器 + 数据代理（urllib 版，含 /qz 腾讯日K）"""
import http.server, socketserver, urllib.request, urllib.error, os
PORT = int(os.environ.get("PORT", "8080"))
ROUTES = {
    "/mt/": "https://market.ft.tech/gateway",
    "/ai/": "https://ftai.chat",
    "/em/": "https://api.fund.eastmoney.com",
    "/qq/": "https://qt.gtimg.cn",
    "/qz/": "https://web.ifzq.gtimg.cn",
    "/emq/": "https://push2.eastmoney.com",
}
EXTRA = {"/em/": {"Referer": "https://fundf10.eastmoney.com/"}, "/qz/": {"Referer": "https://gu.qq.com/"}, "/emq/": {"Referer": "https://quote.eastmoney.com/"}}
BASE = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) investment-os/1.0", "X-Client-Name": "ft-claw"}
ROOT = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def do_GET(self):
        p = self.path
        for prefix, base in ROUTES.items():
            if p.startswith(prefix):
                self._proxy(base, p[len(prefix):], EXTRA.get(prefix)); return
        super().do_GET()
    def _proxy(self, base, rest, extra=None):
        try:
            hdrs = dict(BASE)
            if extra: hdrs.update(extra)
            req = urllib.request.Request(base + rest, headers=hdrs)
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read(); ctype = r.headers.get("Content-Type", "application/json")
            self.send_response(200); self.send_header("Content-Type", ctype); self.send_header("Access-Control-Allow-Origin", "*"); self.send_header("Cache-Control", "no-store"); self.end_headers(); self.wfile.write(body)
        except urllib.error.HTTPError as e:
            body = e.read(); self.send_response(e.code); self.send_header("Content-Type", "application/json"); self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers(); self.wfile.write(body)
        except Exception as e:
            self.send_response(502); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(('{"code":502,"message":"proxy error: %s","data":null}' % e).encode("utf-8"))
    def log_message(self, fmt, *args): pass

if __name__ == "__main__":
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler) as srv:
        print("Investment OS server: http://127.0.0.1:%d" % PORT); srv.serve_forever()