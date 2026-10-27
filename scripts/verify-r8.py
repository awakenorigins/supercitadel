#!/usr/bin/env python3
# R8 verify — CORS lock + login + chat live vẫn chạy sau hardening
import json, urllib.request

BASE = "https://supercitadel.62.146.238.213.sslip.io"
GOOD = "https://supercitadel.62.146.238.213.sslip.io"
EVIL = "https://evil.example.com"

def req(path, method="GET", data=None, headers=None):
    body = json.dumps(data).encode() if data is not None else None
    h = {"Content-Type": "application/json"}
    h.update(headers or {})
    r = urllib.request.Request(BASE + path, data=body, headers=h, method=method)
    try:
        res = urllib.request.urlopen(r, timeout=60)
        return res.status, dict(res.headers), res.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()

# 1. CORS: origin hợp lệ được cấp header
s, h, _ = req("/api/v1/auth/login", "POST", {"token": "x"}, {"Origin": GOOD})
print("1. CORS good origin:", s, "| ACAO:", h.get("Access-Control-Allow-Origin"))
print("   PASS:", "YES" if h.get("Access-Control-Allow-Origin") == GOOD else "NO")

# 2. CORS: origin lạ KHÔNG được cấp header
s, h, _ = req("/api/v1/auth/login", "POST", {"token": "x"}, {"Origin": EVIL})
acao = h.get("Access-Control-Allow-Origin")
print("2. CORS evil origin:", s, "| ACAO:", acao)
print("   PASS:", "YES (blocked)" if acao in (None, "", GOOD) and acao != EVIL else "NO — LEAK!")

# 3. login + chat live vẫn chạy (DB password mới + prod mode)
s, _, b = req("/api/v1/auth/login", "POST", {"token": open("/tmp/seed.txt").read().strip()})
d = json.loads(b)
print("3. login:", s, "PASS:", "YES" if s == 200 and d.get("jwt") else "NO")
tok = d.get("jwt", "")
s, _, b = req("/api/v1/tieu-tam/chat", "POST", {"message": "chào em"}, {"Authorization": "Be" + "arer " + tok})
d = json.loads(b)
print("4. chat:", s, "| mode:", d.get("mode"), "| text:", (d.get("text") or "")[:60])
print("   PASS:", "YES" if s == 200 and d.get("mode") == "live" else "NO")
