#!/usr/bin/env python3
import base64, datetime, json, os, sys, time, urllib.error, urllib.request, zipfile, io
BASE=os.environ.get('BASE_URL','https://supercitadel.62.146.238.213.sslip.io').rstrip('/')
RAW=(open('/tmp/seed.txt').read().strip() if os.path.exists('/tmp/seed.txt') else os.environ.get('DEMO_TOKEN',''))
checks=[]
def req(method,path,body=None,jwt=None,ok=(200,)):
    data=None if body is None else json.dumps(body).encode()
    h={'Content-Type':'application/json'}
    if jwt: h['Authorization']='Bearer '+jwt
    r=urllib.request.Request(BASE+path,data=data,headers=h,method=method)
    try:
        with urllib.request.urlopen(r,timeout=90) as resp:
            raw=resp.read(); assert resp.status in ok,(method,path,resp.status,raw[:200])
            return resp.status,json.loads(raw or b'{}') if raw else {}
    except urllib.error.HTTPError as e:
        raw=e.read()
        try: out=json.loads(raw or b'{}')
        except Exception: out={'raw':raw.decode('utf-8','replace')}
        assert e.code in ok,(method,path,e.code,out)
        return e.code,out
def note(name, ok, detail=''):
    checks.append((name,ok,detail)); print(('✓' if ok else '✗'), name, detail)
def tiny_xlsx_b64():
    # Minimal XLSX with shared strings: headers Tên hàng/SL/ĐVT, row Bút live R111/7/cái.
    files={
      '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>',
      '_rels/.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/_rels/workbook.xml.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
      'xl/workbook.xml':'<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/sharedStrings.xml':'<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="6" uniqueCount="6"><si><t>Tên hàng</t></si><si><t>SL</t></si><si><t>ĐVT</t></si><si><t>Bút live R111</t></si><si><t>7</t></si><si><t>cái</t></si></sst>',
      'xl/worksheets/sheet1.xml':'<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="s"><v>5</v></c></row></sheetData></worksheet>'
    }
    bio=io.BytesIO()
    with zipfile.ZipFile(bio,'w',zipfile.ZIP_DEFLATED) as z:
        for k,v in files.items(): z.writestr(k,v)
    return base64.b64encode(bio.getvalue()).decode()
def main():
    assert RAW, 'missing /tmp/seed.txt or DEMO_TOKEN'
    jwt=req('POST','/api/v1/auth/login',{'token':RAW})[1]['jwt']
    req('POST','/api/v1/modules/ke-toan-10a/activate',jwt=jwt,ok=(200,409))
    req('POST','/api/v1/modules/inventory/activate',jwt=jwt,ok=(200,409,400))
    req('POST','/api/v1/ke-toan-10a/setup',{'standard':'TT133'},jwt=jwt,ok=(200,201,409))
    cases=[('/budgets',{}, {'year':2026,'accountCode':'642','amount':'1234'}),('/fx/revalue',{}, {'accountCode':'111','foreignAmount':'1','newRate':'24000'}),('/advances',{}, {'type':'EMPLOYEE_ADVANCE','contactName':'Live Advance R111','amount':'1000','reason':'test'}),('/recurring',{}, {'name':'Live recur','kind':'PAYMENT','frequency':'MONTHLY','payload':{'counterAccountCode':'642','amount':'1000'},'startDate':datetime.date.today().isoformat()})]
    for path,bad,good in cases:
        s,d=req('POST','/api/v1/ke-toan-10a'+path,bad,jwt=jwt,ok=(400,)); note(path+' missing -> 400 VN',s==400 and 'error' in d,json.dumps(d,ensure_ascii=False)[:120])
        s,d=req('POST','/api/v1/ke-toan-10a'+path,good,jwt=jwt,ok=(200,201)); note(path+' valid -> 2xx',s in (200,201),str(s))
    s,d=req('POST','/api/v1/tieu-tam/files',{'filename':'r111-live.xlsx','fileBase64':tiny_xlsx_b64()},jwt=jwt,ok=(201,)); file=d['file']; note('upload xlsx parsed rows', '1 dòng' in file.get('summary',''), file.get('summary',''))
    s,d=req('GET','/api/v1/tieu-tam/files',jwt=jwt); note('GET files sees upload', any(x['id']==file['id'] for x in d.get('files',[])))
    s,d=req('GET',f"/api/v1/tieu-tam/files/{file['id']}",jwt=jwt); note('GET file rows visible', len((d.get('file',{}).get('rows') or d.get('file',{}).get('rowsJson',{}).get('rows') or []))>=1)
    s,d=req('POST',f"/api/v1/tieu-tam/files/{file['id']}/import",{'target':'inventory'},jwt=jwt); note('import dry-run preview', d.get('dryRun') and len(d.get('preview',[]))==1)
    s,d=req('POST',f"/api/v1/tieu-tam/files/{file['id']}/import",{'target':'inventory','confirm':True},jwt=jwt); note('import confirm created inventory', d.get('created')==1)
    s,d=req('GET','/api/v1/inventory/items',jwt=jwt); note('inventory item appears', any(x.get('name')=='Bút live R111' for x in d.get('items',[])))
    print('SUMMARY',sum(1 for _,ok,_ in checks if ok),'/',len(checks))
    if not all(ok for _,ok,_ in checks): sys.exit(1)
if __name__=='__main__': main()
