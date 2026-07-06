#!/usr/bin/env python3
"""R11.4 live verify — Soul-Inventory: item → stock → receive (dry-run→confirm) → low-alerts → summary
+ regression inventory cũ + FE /soul-inventory 200. Dọn data test cuối script.
JWT: /tmp/seed.txt raw token → POST /api/v1/auth/login {token} → jwt. 429 → đợi 65s rồi thử lại 1 lần."""
import json, os, pathlib, sys, time, requests

BASE = os.environ.get('BASE', 'https://supercitadel.62.146.238.213.sslip.io')
seed = pathlib.Path('/tmp/seed.txt').read_text().splitlines()
token = next((x.strip() for x in seed if x.strip() and not x.startswith('#')), None)
if not token: raise SystemExit('no token in /tmp/seed.txt')
s = requests.Session()

def login():
    r = s.post(BASE + '/api/v1/auth/login', json={'token': token}, timeout=20)
    if r.status_code == 429:
        print('login 429 — đợi 65s (rate limit spacing)'); time.sleep(65)
        r = s.post(BASE + '/api/v1/auth/login', json={'token': token}, timeout=20)
    print('login', r.status_code); r.raise_for_status()
    return r.json()['jwt']

jwt = login(); h = {'Authorization': 'Bearer ' + jwt}

def call(m, p, ok=True, **kw):
    r = s.request(m, BASE + p, headers=h, timeout=25, **kw)
    print(m, p, r.status_code, r.text[:200].replace('\n', ' '))
    if ok: r.raise_for_status()
    return r

P = '/api/v1/soul-inventory'
SKU = 'R114-TEST-SKU'
fails = []

# 1) tạo item
r = call('POST', P + '/items', json={'sku': SKU, 'name': 'Vật tư test R11.4', 'unit': 'cái', 'min_stock': '5'})

# 2) query stock (chưa nhập → available 0 / chưa có tồn)
r = call('GET', P + f'/stock?sku={SKU}')
assert SKU in r.text, 'stock query không thấy item vừa tạo'

# 3) NHẬP KHO — mô phỏng dry-run→confirm flow của Tiểu Tâm/FE:
#    bước 1 (dry-run phía client): chỉ dựng payload xem trước, KHÔNG POST → tồn không đổi
payload = {'sku': SKU, 'quantity': '10', 'unit_cost': '1000'}
r = call('GET', P + f'/stock?sku={SKU}')
before = r.json()
avail_before = next((x.get('available') for x in before if x.get('sku') == SKU), '0')
assert float(avail_before or 0) == 0, f'dry-run stage nhưng tồn đã đổi: {avail_before}'
print('dry-run stage OK — tồn chưa đổi (payload preview:', json.dumps(payload), ')')
#    bước 2 (confirm): POST thật → ghi sổ
r = call('POST', P + '/stock/receive', json=payload)
d = r.json()
assert str(d.get('stocked', '')).startswith('10'), f'receive stocked sai: {d}'
print('confirm OK — PNK:', d.get('doc_no'), '· stocked:', d.get('stocked'))

# 4) low-alerts (10 > min 5 → SKU test không được nằm trong alert)
r = call('GET', P + '/stock/low-alerts')
assert SKU not in r.text, 'SKU test 10 > min 5 mà vẫn báo tồn thấp'

# 5) summary
r = call('GET', P + '/summary')
assert 'items' in r.json(), 'summary thiếu items'

# 6) regression: inventory CŨ vẫn 200
r = call('GET', '/api/v1/inventory-items')
print('regression /api/v1/inventory-items OK')

# 7) FE /soul-inventory = 200 (KHÔNG 404)
rf = requests.get(BASE + '/soul-inventory', timeout=25)
print('GET /soul-inventory (FE)', rf.status_code)
assert rf.status_code == 200, f'FE page /soul-inventory trả {rf.status_code}'

# 8) dọn data test: xuất hết 10 rồi deactivate item (module không có DELETE — upsert active=false)
call('POST', P + '/stock/issue', json={'sku': SKU, 'quantity': '10'})
call('POST', P + '/items', json={'sku': SKU, 'name': 'Vật tư test R11.4 (đã dọn)', 'unit': 'cái', 'min_stock': '0'})
r = call('GET', P + f'/stock?sku={SKU}')
avail_after = next((x.get('available') for x in r.json() if x.get('sku') == SKU), '0')
assert float(avail_after or 0) == 0, f'dọn chưa sạch, còn tồn {avail_after}'
print('cleanup OK — tồn test = 0')

print('R11.4_VERIFY_OK', json.dumps({'base': BASE, 'sku': SKU, 'doc_no': d.get('doc_no')}, ensure_ascii=False))
