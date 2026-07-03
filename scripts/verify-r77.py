#!/usr/bin/env python3
# R7.7 live verify — theme buy (non-consumable) + owned list + select + back to jade
import json, urllib.request

BASE = "https://supercitadel.62.146.238.213.sslip.io"

def call(path, method="GET", data=None, auth=None):
    body = json.dumps(data).encode() if data is not None else None
    h = {"Content-Type": "application/json"}
    if auth:
        h["Authorization"] = "Be" + "arer " + auth
    req = urllib.request.Request(BASE + path, data=body, headers=h, method=method)
    try:
        r = urllib.request.urlopen(req, timeout=90)
        return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

_, login = call("/api/v1/auth/login", "POST", {"token": open("/tmp/seed.txt").read().strip()})
tok = login["jwt"]

# ensure balance enough: buy theme-ho-phach (200 Om). may already own → still fine.
s, d = call("/api/v1/store/items/theme-ho-phach/buy", "POST", {"qty": 1}, tok)
print("1. buy Hổ Phách:", s, "|", (d.get("message") or d.get("error", {}).get("message") or "")[:80])

# owned themes
s, d = call("/api/v1/inventory-items/themes", auth=tok)
owned = d.get("owned", [])
print("2. owned themes:", s, owned)

# find owned inventory id of theme to 'use' (should NOT consume)
s, inv = call("/api/v1/inventory-items", auth=tok)
theme_item = next((i for i in inv.get("items", []) if i.get("itemCode") == "theme-ho-phach"), None)
if theme_item:
    qty_before = theme_item["qty"]
    s, d = call(f"/api/v1/inventory-items/{theme_item['id']}/use", "POST", {}, tok)
    print("3. use theme → qtyLeft:", d.get("qtyLeft"), "| before:", qty_before, "| NON-CONSUME:", "YES" if d.get("qtyLeft") == qty_before else "NO")

# select gold
s, d = call("/api/v1/inventory-items/themes/select", "POST", {"theme": "gold"}, tok)
print("4. select gold:", s, "|", (d.get("message") or "")[:60])
s, d = call("/api/v1/tieu-tam/state", auth=tok)
print("4b. soul.theme:", d.get("theme"), "PASS:", "YES" if d.get("theme") == "gold" else "NO")

# select sage without owning → should 403
s, d = call("/api/v1/inventory-items/themes/select", "POST", {"theme": "sage"}, tok)
sage_owned = "sage" in owned
print("5. select sage (owned=%s):" % sage_owned, s, "|", (d.get("message") or d.get("error", {}).get("message") or "")[:60])

# back to jade (always allowed)
s, d = call("/api/v1/inventory-items/themes/select", "POST", {"theme": "jade"}, tok)
print("6. back to Cơ Bản:", s, "|", (d.get("message") or "")[:50])
s, d = call("/api/v1/tieu-tam/state", auth=tok)
print("6b. soul.theme:", d.get("theme"), "PASS:", "YES" if d.get("theme") == "jade" else "NO")
