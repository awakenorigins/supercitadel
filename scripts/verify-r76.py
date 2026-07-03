#!/usr/bin/env python3
# R7.6 live verify — action add employee + multi-turn memory + history endpoint
import json, urllib.request

BASE = "https://supercitadel.62.146.238.213.sslip.io"

def call(path, method="GET", data=None, auth=None):
    body = json.dumps(data).encode() if data is not None else None
    h = {"Content-Type": "application/json"}
    if auth:
        h["Authorization"] = "Be" + "arer " + auth
    req = urllib.request.Request(BASE + path, data=body, headers=h, method=method)
    r = urllib.request.urlopen(req, timeout=120)
    return r.status, json.loads(r.read())

_, login = call("/api/v1/auth/login", "POST", {"token": open("/tmp/seed.txt").read().strip()})
tok = login["jwt"]

s, d = call("/api/v1/tieu-tam/chat", "POST", {"message": "add nhân viên mới tên Bặc Ca Ăn Socola vào vị trí Phòng Không"}, tok)
print("1. add NV:", s, "|", (d.get("text") or "")[:100])

s, d = call("/api/v1/tieu-tam/chat", "POST", {"message": "tên tao là Nấng Tối Thượng nhé, nhớ đó"}, tok)
print("2a. seed name:", s, "|", (d.get("text") or "")[:70])

s, d = call("/api/v1/tieu-tam/chat", "POST", {"message": "tao vừa nói tên tao là gì?"}, tok)
txt = d.get("text") or ""
print("2b. recall:", s, "|", txt[:120])
print("2b PASS:", "YES" if "nấng" in txt.lower() else "NO")

s, d = call("/api/v1/tieu-tam/chat/history?limit=10", auth=tok)
print("3. history:", s, "| msgs:", len(d.get("messages", [])))
