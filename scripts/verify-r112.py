#!/usr/bin/env python3
import json, os, pathlib, requests, sys, time
BASE=os.environ.get('BASE','https://supercitadel.62.146.238.213.sslip.io')
seed=pathlib.Path('/tmp/seed.txt').read_text().splitlines()
token=next((x.strip() for x in seed if x.strip() and not x.startswith('#')), None)
if not token: raise SystemExit('no token in /tmp/seed.txt')
s=requests.Session()
r=s.post(BASE+'/api/v1/auth/login', json={'token':token}, timeout=20); print('login', r.status_code); r.raise_for_status()
jwt=r.json()['jwt']; h={'Authorization':'Bearer '+jwt}

def call(m,p,**kw):
    r=s.request(m,BASE+p,headers=h,timeout=20,**kw); print(m,p,r.status_code,r.text[:180].replace('\n',' ')); return r
r=call('GET','/api/v1/tieu-tam/settings'); r.raise_for_status(); old=r.json()
new_mode='concise' if old.get('personaMode')!='concise' else 'friendly'
r=call('PATCH','/api/v1/tieu-tam/settings',json={'personaMode':new_mode,'proactive':False}); r.raise_for_status(); assert r.json()['personaMode']==new_mode and r.json()['proactive'] is False
r=call('GET','/api/v1/tieu-tam/settings'); r.raise_for_status(); assert r.json()['personaMode']==new_mode and r.json()['proactive'] is False
# restore proactive true, keep selected mode acceptable
call('PATCH','/api/v1/tieu-tam/settings',json={'proactive':True}).raise_for_status()
r=call('GET','/api/v1/org'); r.raise_for_status(); org=r.json()['org']; assert org['name'] and org['slug']
r=call('PATCH','/api/v1/org',json={'name':org['name'],'logoEmoji':org.get('logoEmoji') or '☕'}); r.raise_for_status()
r=call('GET','/api/v1/org/members'); r.raise_for_status(); assert isinstance(r.json().get('members'),list)
for p in ['/api/v1/tieu-tam/settings','/api/v1/org','/api/v1/org/members']:
    call('GET',p).raise_for_status()
print('R11.2_VERIFY_OK', json.dumps({'base':BASE,'members':len(r.json().get('members',[]))}, ensure_ascii=False))
