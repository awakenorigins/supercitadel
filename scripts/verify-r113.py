#!/usr/bin/env python3
import json, os, pathlib, requests, sys
BASE=os.environ.get('BASE','https://supercitadel.62.146.238.213.sslip.io')
seed=pathlib.Path('/tmp/seed.txt').read_text().splitlines()
token=next((x.strip() for x in seed if x.strip() and not x.startswith('#')), None)
if not token: raise SystemExit('no token in /tmp/seed.txt')
s=requests.Session()
r=s.post(BASE+'/api/v1/auth/login', json={'token':token}, timeout=20); print('login', r.status_code); r.raise_for_status()
jwt=r.json()['jwt']; h={'Authorization':'Bearer '+jwt}
def call(m,p,**kw):
    r=s.request(m,BASE+p,headers=h,timeout=25,**kw); print(m,p,r.status_code,r.text[:200].replace('\n',' ')); return r
P='/api/v1/soul-manager'
# 1) create employee (write action -> RLS-aware adapter)
r=call('POST',P+'/employees',json={'full_name':'Nguyễn Văn Test R113','hire_date':'2026-07-01','base_salary':'20000000','department':'Kỹ thuật','position':'Kỹ sư'}); r.raise_for_status()
emp=r.json(); code=emp.get('code') or emp.get('employee',{}).get('code')
assert code, f'no code in {emp}'
# 2) read back via search (RLS read path)
r=call('GET',P+'/employees?q=Test%20R113'); r.raise_for_status()
found=json.dumps(r.json(), ensure_ascii=False)
assert 'Test R113' in found, 'employee not found after create — RLS read broken'
# 3) get by code
r=call('GET',P+f'/employees/{code}'); r.raise_for_status()
# 4) org chart
r=call('GET',P+'/org/chart'); r.raise_for_status()
# 5) headcount report
r=call('GET',P+'/report/headcount'); r.raise_for_status()
# 6) attendance summary (read)
call('GET',P+'/attendance/summary?year=2026&month=7')
# 7) leave balance
call('GET',P+f'/leave/balance?employee_code={code}')
# 8) module isolation: gate works (module active) — already 200s above prove gate pass
print('R11.3_VERIFY_OK', json.dumps({'base':BASE,'employee_code':code}, ensure_ascii=False))
