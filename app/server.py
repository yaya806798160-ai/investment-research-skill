#!/usr/bin/env python3
"""
Investment OS 本地服务器 + 数据代理（Phase 1）
- 静态托管 app/ 目录
- /mt/<path>  -> https://market.ft.tech/gateway/<path>  （市场数据，含 X-Client-Name）
- /ai/<path>  -> https://ftai.chat/<path>                （security info）
运行: python server.py   (默认 http://127.0.0.1:8080，可用 PORT 环境变量覆盖)
"""
import http.server
import socketserver
import urllib.request
import urllib.error
import os

PORT = int(os.environ.get("PORT", "8080"))
MT = "https://market.ft.tech/gateway"
AI = "https://ftai.chat"
ROOT = os.path.dirname(os.path.abspath(__file__))
HEADERS = {"X-Client-Name": "ft-claw", "User-Agent": "investment-os/1.0"}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        p = self.path
        if p.startswith("/mt/"):
            self._proxy(MT, p[len("/mt"):])
            return
        if p.startswith("/ai/"):
            self._proxy(AI, p[len("/ai"):])
            return
        super().do_GET()

    def _proxy(self, base, rest):
        url = base + rest  # rest 保留 /api/... 与 query
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read()
                ctype = r.headers.get("Content-Type", "application/json")
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except urllib.error.HTTPError as e:
            body = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:  # noqa: BLE001
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(('{"code":502,"message":"proxy error: %s","data":null}' % e).encode("utf-8"))

    def log_message(self, fmt, *args):  # 静默访问日志
        pass


if __name__ == "__main__":
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler) as srv:
        print("Investment OS server: http://127.0.0.1:%d" % PORT)
        srv.serve_forever()