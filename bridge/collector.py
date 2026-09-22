#!/usr/bin/env python3
"""Investment OS -> ChatGPT live bridge collector.

Runs on the user's Windows machine. Reuses the local Investment OS proxy at
http://127.0.0.1:8080 and writes/pushes bridge/live/latest.json plus key-time
archives. No credentials are stored in this file.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import os
import pathlib
import subprocess
import sys
import urllib.parse
import urllib.request
from typing import Any

TZ = dt.timezone(dt.timedelta(hours=8))
ROOT = pathlib.Path(__file__).resolve().parents[1]
LIVE = ROOT / "bridge" / "live"
LOGS = ROOT / "bridge" / "logs"
PROXY = os.environ.get("INVESTMENT_OS_PROXY", "http://127.0.0.1:8080")
STALE_MINUTES = 8

# Critical snapshots that must be visible to ChatGPT through GitHub.
PUSH_TIMES = {
    "0935", "1000", "1125", "1330", "1400", "1405", "1410", "1415",
    "1420", "1425", "1430", "1435", "1440", "1445", "1450", "1452", "1455"
}

INDEX_SECIDS = {
    "上证": "1.000001",
    "创业板": "0.399006",
    "科创50": "1.000688",
}

THEME_KEYWORDS = {
    "PCB": ["PCB", "印制电路板", "覆铜板"],
    "CPO/光模块": ["CPO", "光模块", "光通信"],
    "AI算力": ["算力", "液冷", "数据中心"],
    "半导体设备": ["半导体设备"],
    "国产GPU/AI芯片": ["GPU", "AI芯片", "先进封装"],
}

FUND_MAP = {
    "021528": {"name": "财通成长C", "themes": ["CPO/光模块", "PCB", "AI算力"]},
    "017811": {"name": "东方人工智能", "themes": ["半导体设备"]},
    "018123": {"name": "永赢数字经济智选C", "themes": ["国产GPU/AI芯片", "AI算力"]},
    "008888": {"name": "华夏国证半导体", "themes": ["半导体设备", "国产GPU/AI芯片"]},
}


def now_cn() -> dt.datetime:
    return dt.datetime.now(TZ)


def in_market_window(t: dt.datetime) -> bool:
    if t.weekday() >= 5:
        return False
    hm = t.hour * 60 + t.minute
    return (9 * 60 + 25 <= hm <= 11 * 60 + 30) or (13 * 60 <= hm <= 15 * 60 + 5)


def setup_logging() -> None:
    LOGS.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.FileHandler(LOGS / "collector.log", encoding="utf-8"), logging.StreamHandler()],
    )


def get_json(path: str, params: dict[str, Any], timeout: int = 10) -> dict[str, Any]:
    query = urllib.parse.urlencode(params)
    url = f"{PROXY}/emq/{path}?{query}"
    req = urllib.request.Request(url, headers={"User-Agent": "investment-os-bridge/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", errors="replace"))


def collect_indices(missing: list[str]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for name, secid in INDEX_SECIDS.items():
        try:
            data = get_json("api/qt/stock/get", {
                "secid": secid,
                "fields": "f43,f44,f45,f46,f47,f48,f57,f58,f60,f169,f170",
                "fltt": 2,
                "invt": 2,
            }).get("data") or {}
            out[name] = {
                "code": data.get("f57"), "name": data.get("f58") or name,
                "price": data.get("f43"), "pct": data.get("f170"),
                "turnover": data.get("f48"), "volume": data.get("f47"),
            }
        except Exception as e:
            logging.warning("index %s failed: %s", name, e)
            missing.append(f"index:{name}")
    return out


def collect_boards(missing: list[str]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    try:
        payload = get_json("api/qt/clist/get", {
            "pn": 1, "pz": 300, "po": 1, "np": 1, "fltt": 2, "invt": 2,
            "fid": "f62", "fs": "m:90+t:2",
            "fields": "f12,f14,f2,f3,f62,f66,f69,f72,f75,f78,f81,f84,f87,f184",
        })
        rows = ((payload.get("data") or {}).get("diff") or [])
    except Exception as e:
        logging.warning("board list failed: %s", e)
        missing.append("boards")
        return {}, []

    themes: dict[str, Any] = {}
    for theme, kws in THEME_KEYWORDS.items():
        matches = [r for r in rows if any(k.lower() in str(r.get("f14", "")).lower() for k in kws)]
        if not matches:
            missing.append(f"theme:{theme}")
            continue
        # Prefer strongest main-flow match, then gain.
        matches.sort(key=lambda r: ((r.get("f62") or -10**18), (r.get("f3") or -999)), reverse=True)
        r = matches[0]
        themes[theme] = {
            "board_code": r.get("f12"), "board_name": r.get("f14"),
            "pct": r.get("f3"), "main_flow": r.get("f62"),
            "super_large_flow": r.get("f66"), "large_flow": r.get("f72"),
            "medium_flow": r.get("f78"), "small_flow": r.get("f84"),
            "main_flow_ratio": r.get("f184"),
        }
    return themes, rows


def collect_breadth_and_limits(missing: list[str]) -> dict[str, Any]:
    try:
        payload = get_json("api/qt/clist/get", {
            "pn": 1, "pz": 6000, "po": 1, "np": 1, "fltt": 2, "invt": 2,
            "fid": "f3", "fs": "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23",
            "fields": "f12,f14,f2,f3,f62",
        }, timeout=15)
        rows = ((payload.get("data") or {}).get("diff") or [])
    except Exception as e:
        logging.warning("breadth failed: %s", e)
        missing.append("breadth")
        return {}

    up = sum(1 for r in rows if isinstance(r.get("f3"), (int, float)) and r["f3"] > 0)
    down = sum(1 for r in rows if isinstance(r.get("f3"), (int, float)) and r["f3"] < 0)
    flat = len(rows) - up - down
    limit10, limit20 = [], []
    for r in rows:
        pct = r.get("f3")
        code = str(r.get("f12") or "")
        if not isinstance(pct, (int, float)):
            continue
        is20 = code.startswith(("300", "301", "688"))
        if is20 and pct >= 19.5:
            limit20.append({"code": code, "name": r.get("f14"), "pct": pct, "main_flow": r.get("f62")})
        elif (not is20) and pct >= 9.5:
            limit10.append({"code": code, "name": r.get("f14"), "pct": pct, "main_flow": r.get("f62")})
    return {
        "up": up, "down": down, "flat": flat,
        "limit_up_20cm_count": len(limit20), "limit_up_10cm_count": len(limit10),
        "limit_up_20cm": limit20[:40], "limit_up_10cm": limit10[:80],
    }


def theme_limit_diffusion(themes: dict[str, Any], breadth: dict[str, Any]) -> None:
    # Simple text mapping of limit-up names into board/theme keywords.
    all_limits = (breadth.get("limit_up_20cm") or []) + (breadth.get("limit_up_10cm") or [])
    for theme, kws in THEME_KEYWORDS.items():
        rec = themes.get(theme)
        if not rec:
            continue
        board_name = str(rec.get("board_name") or "")
        matched = []
        for x in all_limits:
            n = str(x.get("name") or "")
            if any(k.lower() in n.lower() for k in kws):
                matched.append(x)
        rec["limit_up_diffusion"] = {
            "count": len(matched), "stocks": matched[:20],
            "note": "name-keyword approximation; board-level limit-up diffusion still preserved separately",
            "board_name": board_name,
        }


def fund_mapping(themes: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for code, meta in FUND_MAP.items():
        vals = [themes[t] for t in meta["themes"] if t in themes]
        score_parts = [v.get("pct") for v in vals if isinstance(v.get("pct"), (int, float))]
        flow_parts = [v.get("main_flow") for v in vals if isinstance(v.get("main_flow"), (int, float))]
        out[code] = {
            "name": meta["name"], "themes": meta["themes"],
            "theme_pct_avg": round(sum(score_parts) / len(score_parts), 3) if score_parts else None,
            "theme_main_flow_sum": sum(flow_parts) if flow_parts else None,
        }
    return out


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", *args], cwd=ROOT, text=True, capture_output=True, check=check)


def push_snapshot(now: dt.datetime, archive: pathlib.Path) -> None:
    try:
        git("add", str(LIVE.relative_to(ROOT)))
        status = git("status", "--porcelain", check=False).stdout.strip()
        if not status:
            return
        msg = f"live: market snapshot {now.strftime('%Y-%m-%d %H:%M')}"
        c = git("commit", "-m", msg, check=False)
        if c.returncode != 0 and "nothing to commit" not in (c.stdout + c.stderr).lower():
            raise RuntimeError(c.stderr or c.stdout)
        p = git("push", check=False)
        if p.returncode != 0:
            raise RuntimeError(p.stderr or p.stdout)
        logging.info("pushed %s", archive.name)
    except Exception as e:
        logging.error("git push failed: %s", e)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="collect outside market window")
    ap.add_argument("--push", action="store_true", help="force git commit/push")
    args = ap.parse_args()
    setup_logging()
    t = now_cn()
    if not args.force and not in_market_window(t):
        return 0

    missing: list[str] = []
    indices = collect_indices(missing)
    themes, _ = collect_boards(missing)
    breadth = collect_breadth_and_limits(missing)
    theme_limit_diffusion(themes, breadth)

    generated = now_cn()
    snapshot = {
        "schema_version": 1,
        "generated_at": generated.isoformat(timespec="seconds"),
        "source_time": generated.isoformat(timespec="seconds"),
        "trade_date": generated.strftime("%Y-%m-%d"),
        "market_time": generated.strftime("%H:%M:%S"),
        "source": ["Investment OS local proxy", "Eastmoney push2 via /emq/"],
        "stale": False,
        "stale_after_minutes": STALE_MINUTES,
        "missing": sorted(set(missing)),
        "indices": indices,
        "breadth": breadth,
        "themes": themes,
        "fund_mapping": fund_mapping(themes),
        "rules": {
            "local_strength_independent_confirmation": True,
            "note": "PCB/CPO/etc can be locally strong even when broad communication/semiconductor flow is negative; do not require whole-tech confirmation.",
        },
    }

    LIVE.mkdir(parents=True, exist_ok=True)
    latest = LIVE / "latest.json"
    latest.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    archive = LIVE / f"{generated.strftime('%Y%m%d-%H%M')}.json"
    archive.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    logging.info("snapshot written %s missing=%s", generated.strftime("%H:%M"), len(missing))

    # Keep the stock scan in the same refresh/publication chain as fund snapshots.
    from short_scan import scan, write_failure
    try:
        scan()
    except Exception as exc:
        logging.exception("short scan failed; invalidating scan and continuing snapshot publication")
        write_failure(exc)

    hm = generated.strftime("%H%M")
    if args.push or hm in PUSH_TIMES:
        push_snapshot(generated, archive)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
