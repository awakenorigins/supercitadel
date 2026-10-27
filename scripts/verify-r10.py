#!/usr/bin/env python3
import json, os, sys, time, urllib.request, urllib.error
BASE=os.environ.get('BASE_URL','https://supercitadel.62.146.238.213.sslip.io').rstrip('/')
TOKEN=os.environ.get('DEMO_TOKEN') or (open('/tmp/seed.txt').read().strip() if os.path.exists('/tmp/seed.txt') else '')
STAFF=os.environ.get('STAFF_JWT') or (open('/tmp/r85_staff_token.txt').read().strip() if os.path.exists('/tmp/r85_staff_token.txt') else '')

def req(method,path,body=None,jwt=None,ok=(200,)):
    data=None if body is None else json.dumps(body).encode()
    h={'Content-Type':'application/json'}
    if jwt: h['Authorization']='Bearer '+jwt
    r=urllib.request.Request(BASE+path,data=data,headers=h,method=method)
    try:
        with urllib.request.urlopen(r,timeout=15) as resp:
            txt=resp.read().decode(); out=json.loads(txt) if txt else {}
            assert resp.status in ok, (method,path,resp.status,out)
            return resp.status,out
    except urllib.error.HTTPError as e:
        txt=e.read().decode(); out=json.loads(txt) if txt else {}
        assert e.code in ok, (method,path,e.code,out)
        return e.code,out

def main():
    assert TOKEN, 'missing DEMO_TOKEN or /tmp/seed.txt'
    _,login=req('POST','/api/v1/auth/login',{'token':TOKEN})
    jwt=login['jwt']
    checks=[]
    code,_=req('GET','/api/v1/outbox/stats',jwt=jwt); checks.append(('owner stats 200',code==200))
    code,_=req('GET','/api/v1/outbox/events?status=pending&limit=5',jwt=jwt); checks.append(('owner events 200',code==200))
    if STAFF:
        code,_=req('GET','/api/v1/outbox/stats',jwt=STAFF,ok=(401,403)); checks.append(('staff outbox blocked',code in (401,403)))
    req('POST','/api/v1/modules/accounting/activate',jwt=jwt,ok=(200,409))
    req('POST','/api/v1/accounting/chart/seed',jwt=jwt,ok=(200,201,409))
    _,inv=req('POST','/api/v1/accounting/invoices',{'invoiceType':'sales','partyName':'R10 Live','postingDate':__import__('datetime').date.today().isoformat(),'lines':[{'description':'Verify R10','qty':1,'rate':12345}]},jwt=jwt,ok=(200,201))
    checks.append(('invoice create 200', bool(inv)))
    found=False
    notif=False
    for _ in range(10):
        _,ev=req('GET','/api/v1/outbox/events?status=dispatched&limit=20',jwt=jwt)
        found = any(e.get('topic')=='accounting.invoice.created' and (e.get('payload') or {}).get('partyName')=='R10 Live' for e in ev.get('events',[]))
        _,ns=req('GET','/api/v1/notifications',jwt=jwt)
        notif = any('R10 Live' in ((n.get('bodyText') or n.get('body_text') or '') + (n.get('title') or '')) for n in ns.get('notifications',ns if isinstance(ns,list) else []))
        if found and notif: break
        time.sleep(1)
    checks.append(('outbox dispatched invoice event <=10s',found))
    checks.append(('notification created <=10s',notif))
    # R8.5 regression dry-run/permission-ish smoke
    _,chat=req('POST','/api/v1/tieu-tam/chat',{'message':'tạo phiếu thu 50000 cho R10 Live'},jwt=jwt)
    checks.append(('tieu-tam dry-run/action path alive', bool(chat)))
    failed=[name for name,ok in checks if not ok]
    for name,ok in checks: print(('✓' if ok else '✗'),name)
    if failed:
        print('FAILED',failed); sys.exit(1)
    print('[verify-r10] PASS %d/%d live %s'%(len(checks),len(checks),BASE))
if __name__=='__main__': main()
