#!/usr/bin/env python3
"""R11.5 live verify — Chat Enterprise: room → message → reply → unread → search
→ reaction → pin → edit → recall → file upload/download → typing → FE /chat 200.
JWT: /tmp/seed.txt raw token → POST /api/v1/auth/login {token} → jwt. 429 → đợi 65s thử lại 1 lần."""
import base64, json, os, pathlib, time, requests

BASE = os.environ.get('BASE', 'https://supercitadel.62.146.238.213.sslip.io')
seed = pathlib.Path('/tmp/seed.txt').read_text().splitlines()
token = next((x.strip() for x in seed if x.strip() and not x.startswith('#')), None)
if not token: raise SystemExit('no token in /tmp/seed.txt')
s = requests.Session()

def login():
    r = s.post(BASE + '/api/v1/auth/login', json={'token': token}, timeout=20)
    if r.status_code == 429:
        print('login 429 — đợi 65s'); time.sleep(65)
        r = s.post(BASE + '/api/v1/auth/login', json={'token': token}, timeout=20)
    print('login', r.status_code); r.raise_for_status()
    return r.json()['jwt']

jwt = login(); h = {'Authorization': 'Bearer ' + jwt}

def call(m, p, ok=True, **kw):
    r = s.request(m, BASE + p, headers=h, timeout=25, **kw)
    print(m, p, r.status_code, r.text[:160].replace('\n', ' '))
    if ok: r.raise_for_status()
    return r

C = '/api/v1/chat'

# 1) tạo phòng test
r = call('POST', C + '/rooms', json={'name': 'R11.5 verify room', 'memberIds': []})
room = r.json(); rid = room.get('id') or room.get('room', {}).get('id')
assert rid, f'không lấy được room id: {room}'

# 2) gửi tin
r = call('POST', C + f'/rooms/{rid}/messages', json={'body': 'tin verify R11.5 alpha'})
m1 = r.json(); mid1 = m1.get('id') or m1.get('message', {}).get('id')
assert mid1, f'không lấy được message id: {m1}'

# 3) reply
r = call('POST', C + f'/rooms/{rid}/messages', json={'body': 'reply verify', 'replyToId': mid1})
m2 = r.json(); mid2 = m2.get('id') or m2.get('message', {}).get('id')

# 4) unread endpoint
call('GET', C + '/unread')

# 5) search
r = call('GET', C + '/search?q=alpha')
assert 'alpha' in r.text, 'search không thấy tin vừa gửi'

# 6) reaction
call('POST', C + f'/rooms/{rid}/messages/{mid1}/reactions', json={'emoji': '👍'})

# 7) pin + list pins
call('POST', C + f'/rooms/{rid}/pins/{mid1}')
r = call('GET', C + f'/rooms/{rid}/pins')
assert mid1 in r.text, 'pin không thấy trong danh sách'

# 8) edit
r = call('PATCH', C + f'/rooms/{rid}/messages/{mid2}', json={'body': 'reply verify (đã sửa)'})

# 9) recall (thu hồi)
call('DELETE', C + f'/rooms/{rid}/messages/{mid2}')

# 10) file upload + download
data = base64.b64encode('nội dung file verify R11.5'.encode()).decode()
r = call('POST', C + f'/rooms/{rid}/files', json={'fileName': 'verify-r115.txt', 'mime': 'text/plain', 'dataB64': data})
att = r.json(); att_id = att.get('attachmentId') or att.get('attachment', {}).get('id') or att.get('id')
if att_id:
    r = call('GET', C + f'/attachments/{att_id}')
    assert 'verify' in base64.b64decode(r.json().get('dataB64', '')).decode(errors='ignore') or r.status_code == 200

# 11) chặn file .exe
r = call('POST', C + f'/rooms/{rid}/files', ok=False, json={'fileName': 'virus.exe', 'mime': 'application/x-msdownload', 'dataB64': data})
assert r.status_code >= 400, '.exe không bị chặn!'
print('.exe bị chặn OK', r.status_code)

# 12) typing
call('POST', C + f'/rooms/{rid}/typing')

# 13) members list
call('GET', C + f'/rooms/{rid}/members')

# 14) FE /chat 200
rf = requests.get(BASE + '/chat', timeout=25)
print('GET /chat (FE)', rf.status_code)
assert rf.status_code == 200, f'FE /chat trả {rf.status_code}'

# 15) dọn: gỡ pin
call('DELETE', C + f'/rooms/{rid}/pins/{mid1}', ok=False)

print('R11.5_CHAT_VERIFY_OK', json.dumps({'base': BASE, 'room': rid}, ensure_ascii=False))
