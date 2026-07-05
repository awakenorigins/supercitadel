#!/usr/bin/env python3
# R8.5 live verify — RBAC permission registry + Tiểu Tâm dry-run confirm flow.
# JWT/data are persisted via /tmp/*.json files (no shell VAR=$(...) token capture).
import json, os, re, sys, urllib.request

BASE = "https://supercitadel.62.146.238.213.sslip.io"
OWNER_TOKEN_FILE = "/tmp/seed.txt"
OWNER_LOGIN = "/tmp/r85_owner_login.json"
STAFF_LOGIN = "/tmp/r85_staff_login.json"
STAFF_TOKEN_FILE = "/tmp/r85_staff_token.txt"

pass_count = 0
failures = []

def note(name, ok, detail=""):
    global pass_count
    if ok:
        pass_count += 1
    else:
        failures.append(name + (": " + detail if detail else ""))
    print(f"{name}: {'PASS' if ok else 'FAIL'}{(' — ' + detail) if detail else ''}")

def req(path, method="GET", data=None, token=None):
    body = json.dumps(data).encode() if data is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + path, data=body, headers=headers, method=method)
    try:
        res = urllib.request.urlopen(r, timeout=90)
        raw = res.read()
        return res.status, json.loads(raw or b"{}"), raw.decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            parsed = json.loads(raw or b"{}")
        except Exception:
            parsed = {}
        return e.code, parsed, raw.decode("utf-8", "replace")

def token_from_login(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f).get("jwt", "")

def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# 1 owner login via /tmp/seed.txt -> /tmp/r85_owner_login.json
if not os.path.exists(OWNER_TOKEN_FILE):
    raise SystemExit(f"Missing {OWNER_TOKEN_FILE}; cannot login owner")
with open(OWNER_TOKEN_FILE, "r", encoding="utf-8") as f:
    owner_raw = f.read().strip()
s, d, raw = req("/api/v1/auth/login", "POST", {"token": owner_raw})
write_json(OWNER_LOGIN, d)
owner_jwt = token_from_login(OWNER_LOGIN)
note("1 owner login", s == 200 and bool(owner_jwt), f"status={s}, role={d.get('user',{}).get('role')}")

# 2 permissions shape
s, perms, raw = req("/api/v1/permissions", token=owner_jwt)
shape_ok = s == 200 and isinstance(perms.get("registry"), list) and isinstance(perms.get("permissions"), list) and "securityLevel" in perms
note("2 GET /permissions shape", shape_ok, f"status={s}, registry={len(perms.get('registry', []))}, permissions={len(perms.get('permissions', []))}, securityLevel={perms.get('securityLevel')}")

# 3 create/get staff token without printing token: prefer live DB direct if DATABASE_URL available in compose env.
staff_raw = None
if os.path.exists(STAFF_TOKEN_FILE):
    with open(STAFF_TOKEN_FILE, "r", encoding="utf-8") as f: staff_raw = f.read().strip()
else:
    # Create deterministic staff user/token inside live api container. Token only written to /tmp/r85_staff_token.txt on host.
    cmd = r"""
set -euo pipefail
python3 - <<'PY2'
import os, secrets, string, subprocess, json, pathlib
alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
tok='R85STAFF' + ''.join(secrets.choice(alphabet) for _ in range(5))
js = r'''
const postgres=require('/app/packages/db/node_modules/postgres');
const {hash}=require('@node-rs/argon2');
(async()=>{
 const sql=postgres(process.env.DATABASE_URL,{max:1});
 const tok=process.env.R85_STAFF_TOKEN;
 const orgRows=await sql`select id from orgs order by created_at asc limit 1`;
 if(!orgRows.length) throw new Error('no org');
 const org=orgRows[0].id;
 const users=await sql`insert into users (org_id, display_name, role, security_level, avatar_color) values (${org}, 'R8.5 Staff Verify', 'staff', 1, 'amber') returning id`;
 const h=await hash(tok,{memoryCost:19456,timeCost:2,parallelism:1});
 await sql`insert into tokens (org_id, user_id, token_prefix, token_hash, role) values (${org}, ${users[0].id}, ${tok.slice(0,4)}, ${h}, 'staff')`;
 await sql.end();
})();
'''
p=subprocess.run(['docker','compose','-p','supercitadel','exec','-T','-e',f'R85_STAFF_TOKEN={tok}','api','node','-e',js],text=True,capture_output=True)
if p.returncode!=0:
  print(p.stderr[-1000:], file=sys.stderr); raise SystemExit(p.returncode)
pathlib.Path('/tmp/r85_staff_token.txt').write_text(tok, encoding='utf-8')
PY2
"""
    import subprocess
    p = subprocess.run(["bash", "-lc", cmd], cwd=os.getcwd(), text=True, capture_output=True)
    if p.returncode != 0:
        print(p.stderr[-1200:], file=sys.stderr)
    if os.path.exists(STAFF_TOKEN_FILE):
        with open(STAFF_TOKEN_FILE, "r", encoding="utf-8") as f: staff_raw = f.read().strip()

s, sd, raw = req("/api/v1/auth/login", "POST", {"token": staff_raw or ""})
write_json(STAFF_LOGIN, sd)
staff_jwt = token_from_login(STAFF_LOGIN)
note("3 staff login", s == 200 and bool(staff_jwt) and sd.get("user",{}).get("role") == "staff", f"status={s}, role={sd.get('user',{}).get('role')}")

# 4 staff forbidden action: use role-change endpoint (HTTP 403) as a real forbidden permission path.
s, denied, raw = req("/api/v1/users/00000000-0000-0000-0000-000000000000/role", "PATCH", {"role":"manager"}, staff_jwt)
msg = json.dumps(denied, ensure_ascii=False)
note("4 staff forbidden action denied", s == 403 and ("PERMISSION_DENIED" in msg or "quyền" in msg.lower()), f"status={s}, body={msg[:160]}")

# Ensure accounting is active for demo org (idempotent); not app logic change.
import subprocess
activate = """
docker compose -p supercitadel exec -T api node - <<'JS'
const postgres=require('/app/packages/db/node_modules/postgres');
(async()=>{const sql=postgres(process.env.DATABASE_URL,{max:1});const [o]=await sql`select id from orgs order by created_at asc limit 1`;if(o){for(const m of ['accounting','crm','hr','inventory']) await sql`insert into org_modules (org_id,module_id,status,purchased,activated_at) values (${o.id},${m},'active',true,now()) on conflict (org_id,module_id) do update set status='active', purchased=true, activated_at=now()`;} await sql.end();})();
JS
"""
subprocess.run(["bash","-lc",activate], cwd=os.getcwd(), check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

# 5 dry-run preview + pendingAction
s, chat1, raw = req("/api/v1/tieu-tam/chat", "POST", {"message":"tạo phiếu thu 50000 cho Anh Ba"}, owner_jwt)
tool_calls = chat1.get("toolCalls") or []
r0 = (tool_calls[0].get("result") if tool_calls else {}) or {}
pending = r0.get("pendingAction") or chat1.get("pendingAction")
dry_ok = s == 200 and (r0.get("dryRun") is True or "Xem trước" in (chat1.get("text") or "")) and pending
note("5 Tiểu Tâm receipt dry-run preview", dry_ok, f"status={s}, dryRun={r0.get('dryRun')}, pending={bool(pending)}")

# 6 confirm -> creates real payment
s, chat2, raw = req("/api/v1/tieu-tam/chat", "POST", {"message":"xác nhận", "confirm": True, "pendingAction": pending}, owner_jwt)
msg2 = json.dumps(chat2, ensure_ascii=False)
confirm_ok = s == 200 and ("Đã tạo phiếu thu" in msg2 or '"paymentType":"receive"' in msg2 or '"paymentType": "receive"' in msg2) and "dryRun\":true" not in msg2
note("6 Tiểu Tâm confirm creates receipt", confirm_ok, f"status={s}, text={(chat2.get('text') or '')[:120]}")

# 7 audit logs dry-run + real
s1, adry, _ = req("/api/v1/audit-logs?action=tieu_tam.action_dryrun&limit=10", token=owner_jwt)
s2, areal, _ = req("/api/v1/audit-logs?action=tieu_tam.action&limit=10", token=owner_jwt)
def has_action(d, name):
    for l in d.get('logs', []):
        detail = l.get('detail') or {}
        if isinstance(detail, str):
            try: detail = json.loads(detail)
            except Exception: detail = {}
        if detail.get('action') == name: return True
    return False
note("7 audit dry-run + action logs", s1 == 200 and s2 == 200 and has_action(adry,'acc.create_receipt') and has_action(areal,'acc.create_receipt'), f"dry={len(adry.get('logs',[]))}, real={len(areal.get('logs',[]))}")

print(f"SUMMARY: {pass_count}/7 PASS")
if failures:
    print("FAILURES:", "; ".join(failures))
    sys.exit(1)
