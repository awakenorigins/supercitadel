#!/usr/bin/env python3
"""Kiểm chứng thuê module ke-toan-10a 30 ngày = 150 Om trên org test sạch (R11)."""
import json
import urllib.request
import urllib.error

BASE = 'https://supercitadel.62.146.238.213.sslip.io'
tok = json.load(open('/tmp/rent-token.json'))['t']


def req(path, auth=None, method='GET', data=None):
    body = None if data is None else json.dumps(data).encode()
    r = urllib.request.Request(BASE + path, data=body, method=method)
    if auth:
        r.add_header('Authorization', 'Bearer ' + auth)
    if body:
        r.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(r, timeout=20) as res:
            return res.status, json.loads(res.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or '{}')
        except Exception:
            return e.code, {}


s, d = req('/api/v1/auth/login', None, 'POST', {'token': tok})
print('login', s)
auth = d.get('jwt')
s, om = req('/api/v1/om/balance', auth)
before = om.get('balance')
print('om before:', before)
s, rent = req('/api/v1/modules/ke-toan-10a/rent', auth, 'POST', {'days': 30})
print('rent:', s, json.dumps(rent, ensure_ascii=False)[:250])
s, om2 = req('/api/v1/om/balance', auth)
after = om2.get('balance')
print('om after:', after, '| debited:', (before - after) if isinstance(before, int) and isinstance(after, int) else '?')
s, mods = req('/api/v1/modules', auth)
items = mods.get('modules', mods) if isinstance(mods, dict) else mods
k = [m for m in items if m.get('id') == 'ke-toan-10a'][0]
print('module: active', k.get('active'), '| purchased', k.get('purchased'), '| rentedUntil', k.get('rentedUntil'), '| daysLeft', k.get('rentDaysLeft'))
s, _ = req('/api/v1/ke-toan-10a/setup/health', auth)
print('module route status (rented):', s)
