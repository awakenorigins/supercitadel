#!/usr/bin/env python3
import json, os, sys, time, urllib.request, urllib.error

BASE = os.environ.get('BASE_URL', 'https://supercitadel.62.146.238.213.sslip.io').rstrip('/')
OWNER_RAW_TOKEN = os.environ.get('CITADEL_OWNER_TOKEN') or os.environ.get('OWNER_TOKEN')
MANAGER_RAW_TOKEN = os.environ.get('CITADEL_MANAGER_TOKEN') or os.environ.get('STAFF_TOKEN')
OWNER_TOKEN_FILE = os.environ.get('OWNER_TOKEN_FILE', '/tmp/seed.txt')
STAFF_TOKEN_FILE = os.environ.get('STAFF_TOKEN_FILE', '/tmp/r85_staff_token.txt')

checks = []

def req(path, token=None, method='GET', data=None):
    body = None if data is None else json.dumps(data).encode()
    r = urllib.request.Request(BASE + path, data=body, method=method)
    if token:
        r.add_header('Authorization', f'Bearer {token}')
    if body:
        r.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(r, timeout=15) as res:
            raw = res.read().decode('utf-8', 'replace')
            try: js = json.loads(raw) if raw else None
            except Exception: js = raw
            return res.status, js
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8', 'replace')
        try: js = json.loads(raw) if raw else None
        except Exception: js = raw
        return e.code, js

def ok(name, cond, detail=''):
    checks.append((name, bool(cond), detail))
    print(('✓' if cond else '✗'), name, detail)

def read_token(raw, path):
    if raw:
        return raw.strip()
    try:
        return open(path).read().strip()
    except FileNotFoundError:
        return ''

def login(raw):
    s, d = req('/api/v1/auth/login', None, 'POST', {'token': raw})
    return s, d.get('jwt') if isinstance(d, dict) else None, d

def main():
    owner_raw = read_token(OWNER_RAW_TOKEN, OWNER_TOKEN_FILE)
    manager_raw = read_token(MANAGER_RAW_TOKEN, STAFF_TOKEN_FILE)
    s, OWNER_TOKEN, me = login(owner_raw)
    ok('owner token login', s == 200 and bool(OWNER_TOKEN), str(s))
    s, MANAGER_TOKEN, _ = login(manager_raw)
    ok('staff token login', s == 200 and bool(MANAGER_TOKEN), str(s))

    s, cat = req('/api/v1/modules', OWNER_TOKEN)
    ids = sorted([m.get('id') for m in (cat if isinstance(cat, list) else cat.get('modules', []) if isinstance(cat, dict) else [])])
    required = ['accounting','chat','crm','hr','inventory','notification','om']
    ok('catalog contains 7 manifest modules', s == 200 and all(x in ids for x in required), ','.join(ids))

    s, ls = req('/api/v1/modules/loader-status', OWNER_TOKEN)
    loaded = sorted([m.get('id') for m in ls.get('loaded', [])]) if isinstance(ls, dict) else []
    rejected = ls.get('rejected', []) if isinstance(ls, dict) else []
    ok('loader-status owner 200', s == 200, str(s))
    ok('loader loaded 7 rejected 0', all(x in loaded for x in required) and len(rejected) == 0, f'loaded={loaded} rejected={rejected}')

    s, _ = req('/api/v1/modules/loader-status', MANAGER_TOKEN)
    ok('loader-status non-owner forbidden', s == 403, str(s))

    routes = ['/api/v1/accounting/accounts','/api/v1/crm/contacts','/api/v1/hr/employees','/api/v1/om/balance']
    for p in routes:
        s, _ = req(p, OWNER_TOKEN)
        ok(f'module route alive {p}', s in (200, 201), str(s))

    s, chat = req('/api/v1/tieu-tam/chat', OWNER_TOKEN, 'POST', {'message':'xin chào, kiểm tra regression R9'})
    ok('regression chat/action endpoint alive', s in (200, 201), str(s))

    passed = sum(1 for _, c, _ in checks if c)
    total = len(checks)
    print(f'[verify-r9] {passed}/{total} PASS base={BASE}')
    return 0 if passed == total else 1

if __name__ == '__main__':
    sys.exit(main())
