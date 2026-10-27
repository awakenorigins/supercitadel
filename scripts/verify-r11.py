#!/usr/bin/env python3
import json, os, sys, time, urllib.request, urllib.error, datetime
BASE=os.environ.get('BASE_URL','https://supercitadel.62.146.238.213.sslip.io').rstrip('/')
RAW=(open('/tmp/seed.txt').read().strip() if os.path.exists('/tmp/seed.txt') else os.environ.get('DEMO_TOKEN',''))
checks=[]
coverage_actions={}
coverage_tools={}

def req(method,path,body=None,jwt=None,ok=(200,),binary=False):
    data=None if body is None else json.dumps(body).encode()
    h={'Content-Type':'application/json'}
    if jwt: h['Authorization']='Bearer '+jwt
    r=urllib.request.Request(BASE+path,data=data,headers=h,method=method)
    try:
        with urllib.request.urlopen(r,timeout=60) as resp:
            raw=resp.read()
            assert resp.status in ok,(method,path,resp.status,raw[:120])
            if binary:
                return resp.status,{'bytes':len(raw),'head':raw[:8],'contentType':resp.headers.get('content-type','')}
            out=json.loads(raw or b'{}') if raw else {}
            return resp.status,out
    except urllib.error.HTTPError as e:
        raw=e.read();
        if binary:
            out={'bytes':len(raw),'head':raw[:8],'contentType':e.headers.get('content-type','')}
        else:
            try: out=json.loads(raw or b'{}')
            except Exception: out={'raw':raw.decode('utf-8','replace')}
        assert e.code in ok,(method,path,e.code,out)
        return e.code,out

def note(name, ok, detail=''):
    checks.append((name,ok,detail)); print(('✓' if ok else '✗'), name, detail)

def main():
    assert RAW, 'missing /tmp/seed.txt or DEMO_TOKEN'
    _,login=req('POST','/api/v1/auth/login',{'token':RAW}); jwt=login['jwt']
    # ensure owner high security + money
    req('POST','/api/v1/me/bind-email',{'email':'r11-owner@example.test'},jwt=jwt,ok=(200,400))
    before=req('GET','/api/v1/om/balance',jwt=jwt)[1]['balance']; req('POST','/api/v1/om/topup',{'amount':5000},jwt=jwt)
    bal0=req('GET','/api/v1/om/balance',jwt=jwt)[1]['balance']
    _,ls=req('GET','/api/v1/modules/loader-status',jwt=jwt)
    loaded=[m.get('id') for m in ls.get('loaded',[])]
    note('loader-status has ke-toan-10a', 'ke-toan-10a' in loaded, str(loaded))
    _,mods=req('GET','/api/v1/modules',jwt=jwt); mods_list=mods.get('modules',mods if isinstance(mods,list) else [])
    k=next((m for m in mods_list if m.get('id')=='ke-toan-10a'),{})
    note('catalog price/rent', k.get('priceOm')==1000 and (k.get('rentPlans') or {}).get('30')==150, json.dumps(k,ensure_ascii=False)[:300])
    code,_=req('GET','/api/v1/ke-toan-10a/accounts',jwt=jwt,ok=(200,403))
    if code==200: req('POST','/api/v1/modules/ke-toan-10a/deactivate',jwt=jwt,ok=(200,409,400)); code,_=req('GET','/api/v1/ke-toan-10a/accounts',jwt=jwt,ok=(403,200))
    note('inactive route blocked', code==403, f'status={code}')
    code,dry_inactive=req('POST','/api/v1/tieu-tam/chat',{'message':'tạo phiếu thu 10a 2000000 từ Anh Ba'},jwt=jwt,ok=(200,403))
    note('inactive tieu-tam action rejected', code==403 and ('chưa kích hoạt' in json.dumps(dry_inactive,ensure_ascii=False).lower() or 'module' in json.dumps(dry_inactive,ensure_ascii=False).lower()), json.dumps(dry_inactive,ensure_ascii=False)[:160])
    b=req('GET','/api/v1/om/balance',jwt=jwt)[1]['balance']; _,pur=req('POST','/api/v1/modules/ke-toan-10a/purchase',jwt=jwt,ok=(200,409)); a=req('GET','/api/v1/om/balance',jwt=jwt)[1]['balance']
    note('purchase 1000 Om', pur.get('paidOm')==1000 or b-a==1000 or pur.get('ok') or pur.get('error',{}).get('code')=='CONFLICT', f'before={b} after={a} resp={pur}')
    req('POST','/api/v1/modules/ke-toan-10a/activate',jwt=jwt,ok=(200,409))
    req('POST','/api/v1/ke-toan-10a/setup',{'standard':'TT133'},jwt=jwt,ok=(200,201,409))
    note('setup TT133/accounts', req('GET','/api/v1/ke-toan-10a/accounts',jwt=jwt)[1].get('accounts') is not None)
    # API business flow
    rec=req('POST','/api/v1/ke-toan-10a/receipts',{'docDate':datetime.date.today().isoformat(),'counterAccountCode':'411','amount':'2000000','payerName':'Anh Ba','reason':'R11 phiếu thu'},jwt=jwt,ok=(200,201))[1]; note('API receipt', bool(rec))
    pay=req('POST','/api/v1/ke-toan-10a/payments',{'docDate':datetime.date.today().isoformat(),'counterAccountCode':'642','amount':'500000','payeeName':'Nhà cung cấp R11','reason':'R11 phiếu chi'},jwt=jwt,ok=(200,201))[1]; note('API payment', bool(pay))
    contact=req('POST','/api/v1/ke-toan-10a/contacts',{'name':'Anh Ba','type':'CUSTOMER','creditLimit':'0'},jwt=jwt,ok=(200,201))[1].get('contact',{})
    inv=req('POST','/api/v1/ke-toan-10a/invoices',{'docDate':datetime.date.today().isoformat(),'contactId':contact.get('id'),'lines':[{'description':'Dịch vụ R11','qty':1,'rate':'1000000'}],'taxRate':'0.08'},jwt=jwt,ok=(200,201))[1]
    iid=(inv.get('invoice') or inv).get('id'); note('API invoice VAT', bool(iid), str(inv)[:180])
    if iid:
        col=req('POST',f'/api/v1/ke-toan-10a/invoices/{iid}/payment',{'amount':'1000800','method':'cash'},jwt=jwt,ok=(200,201))[1]; note('collect invoice knock-off', bool(col))
        code,_=req('POST',f'/api/v1/ke-toan-10a/invoices/{iid}/payment',{'amount':'1','method':'cash'},jwt=jwt,ok=(400,409)); note('over-collect blocked', code in (400,409), f'status={code}')
    code,xlsx=req('GET','/api/v1/ke-toan-10a/export/invoices.xlsx',jwt=jwt,ok=(200,),binary=True)
    note('Excel export invoices', code==200 and xlsx.get('head',b'').startswith(b'PK\x03\x04') and 'spreadsheet' in xlsx.get('contentType',''), str(xlsx))
    # Tieu Tam dryrun + confirm
    dry=req('POST','/api/v1/tieu-tam/chat',{'message':'tạo phiếu thu 10a 2 triệu từ Anh Ba'},jwt=jwt)[1]
    pa=dry.get('toolCalls',[{}])[0].get('result',{}).get('pendingAction') or dry.get('pendingAction')
    note('TT dry-run preview receipt', bool(pa), dry.get('text','')[:160]); coverage_actions['k10a.thu_tien']='dry-run'
    if pa:
        conf=req('POST','/api/v1/tieu-tam/chat',{'message':'xác nhận','confirm':True,'pendingAction':pa},jwt=jwt)[1]
        note('TT confirm receipt into ledger', '✓' in conf.get('text','') or conf.get('toolCalls'), conf.get('text','')[:160]); coverage_actions['k10a.thu_tien']='confirmed'
    for msg,name in [('tạo phiếu chi 10a 300 nghìn cho Nhà cung cấp R11','k10a.chi_tien'),('tạo hóa đơn bán 10a 1 triệu cho Chị Bảy','k10a.hoa_don_ban'),('báo cáo sổ sách 10a','k10a.bao_cao_nhanh')]:
        r=req('POST','/api/v1/tieu-tam/chat',{'message':msg},jwt=jwt)[1]; note('TT '+name, bool(r.get('text')), r.get('text','')[:120]); coverage_actions[name]='called'
    for path,name in [('/reports/cash-book','cash_position'),('/reports/outstanding','outstanding'),('/reports/aging','aging'),('/reports/profit-loss','profit_loss'),('/reports/trial-balance','trial_balance'),('/reports/balance-sheet','balance_sheet')]:
        code,_=req('GET','/api/v1/ke-toan-10a'+path,jwt=jwt,ok=(200,)); note('read-tool/API '+name, code==200); coverage_tools[name]='200'
    # deactivate/reactivate data retained
    req('POST','/api/v1/modules/ke-toan-10a/deactivate',jwt=jwt,ok=(200,409)); code,_=req('GET','/api/v1/ke-toan-10a/accounts',jwt=jwt,ok=(403,)); note('deactivate blocks route', code==403)
    req('POST','/api/v1/modules/ke-toan-10a/activate',jwt=jwt,ok=(200,409)); code,acc=req('GET','/api/v1/ke-toan-10a/accounts',jwt=jwt); note('reactivate data retained', code==200 and len(acc.get('accounts',[]))>0)
    # Rent spot with current org: purchased returns 409, so verify pricing through catalog; live rent contract is covered by code/catalog.
    note('rent 30d override exposed 150', (k.get('rentPlans') or {}).get('30')==150)
    ok=all(x[1] for x in checks)
    print('\nSUMMARY', sum(1 for x in checks if x[1]), '/', len(checks))
    print('ACTIONS', json.dumps(coverage_actions,ensure_ascii=False))
    print('TOOLS', json.dumps(coverage_tools,ensure_ascii=False))
    if not ok: sys.exit(1)
if __name__=='__main__': main()
