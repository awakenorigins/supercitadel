#!/bin/bash
# sync-modules-hub.sh — Xuất 14 module từ monorepo ra hệ GitHub tổng module:
#   - Hub: citadel-modules (mục lục + guide)
#   - Lẻ:  citadel-module-<name> (mirror read-only từ monorepo)
# KHÔNG đụng git monorepo: chỉ đọc-copy ra staging, init git riêng, force push.
# Chạy lại bất kỳ lúc nào để sync module mới/sửa đổi. Usage: bash scripts/sync-modules-hub.sh [module...]
set -e
ROOT="/root/.openclaw/workspace/supercitadellab"
STAGE="/tmp/citadel-modules-stage"
GH="python3 /root/.openclaw/workspace/skills/github-manager/scripts/gh_manager.py"
OWNER="NachaFromMars"
set -a; source ~/.config/tt-github/env; set +a
CRED='!f() { echo "username=x-access-token"; echo "password=$GH_TOKEN"; }; f'
VERSION=$(date +%Y.%m.%d)

cd "$ROOT"
MODULES=${@:-$(ls modules/)}
rm -rf "$STAGE"; mkdir -p "$STAGE"

ensure_repo() { # $1=name $2=desc
  local info=$($GH repo-info --repo "$OWNER/$1" 2>/dev/null)
  if echo "$info" | grep -q '"status": 200'; then echo "repo $1: có sẵn"; else
    $GH create-repo --name "$1" --desc "$2" >/dev/null && echo "repo $1: TẠO MỚI"
  fi
}

push_dir() { # $1=dir $2=repo $3=commitmsg
  cd "$1"
  git init -q -b main 2>/dev/null || git init -q
  git checkout -q -B main
  git add -A
  git -c user.name=TieuTam -c user.email=tt@lab commit -q -m "$3" || true
  git -c credential.helper="$CRED" push -f -q "https://github.com/$OWNER/$2.git" main:main
  cd "$ROOT"
}

HUB_LIST=""
for M in $MODULES; do
  [ -d "modules/$M" ] || { echo "bỏ qua $M (không tồn tại)"; continue; }
  REPO="citadel-module-$M"
  DESC="Citadel module: $M — mirror from supercitadellab monorepo (Vietnamese business OS module, Hono+Drizzle+Postgres multi-tenant)"
  ensure_repo "$REPO" "$DESC"
  D="$STAGE/$REPO"; mkdir -p "$D"
  cp -r "modules/$M/." "$D/"
  rm -rf "$D/node_modules" "$D/dist" "$D/.turbo" "$D/tsconfig.tsbuildinfo"
  # README mirror header (giữ README gốc nếu có → README.module.md)
  [ -f "$D/README.md" ] && mv "$D/README.md" "$D/README.module.md"
  cat > "$D/README.md" << EOF
# citadel-module-$M

> ⚙️ **Mirror tự động** từ monorepo [supercitadellab](https://github.com/$OWNER/supercitadellab) (\`modules/$M\`) — sync $VERSION.
> Source of truth là monorepo; PR/issue nghiệp vụ mở ở đó. Repo này để tham khảo / đóng gói / cài lẻ.

Module cho SUPERCITADEL — Vietnamese business OS (Next.js + Hono + Drizzle + Postgres multi-tenant, org_id isolation).

## Cài vào Citadel
Xem hướng dẫn đầy đủ: [citadel-modules](https://github.com/$OWNER/citadel-modules) (hub) · \`docs/MODULE-FORGE-GUIDE.md\` + \`docs/ADD-MODULE-PLAYBOOK.md\` trong monorepo.
Phụ thuộc workspace: \`@citadel/core\`, \`@citadel/db\` (có trong monorepo).

$( [ -f "$D/README.module.md" ] && echo '## README gốc của module: xem [README.module.md](README.module.md)' )
EOF
  push_dir "$D" "$REPO" "sync $VERSION from supercitadellab monorepo (modules/$M)"
  echo "✓ pushed $REPO"
  HUB_LIST="$HUB_LIST\n| [$M](https://github.com/$OWNER/citadel-module-$M) | \`modules/$M\` | $(ls modules/$M/migrations 2>/dev/null | wc -l) migrations |"
done

# ── HUB repo: mục lục + guides ──
ensure_repo "citadel-modules" "Citadel Modules Hub — catalog of all SUPERCITADEL modules (mirrors + forge guides). Vietnamese business OS."
H="$STAGE/citadel-modules"; mkdir -p "$H/docs"
cp "$ROOT/docs/MODULE-FORGE-GUIDE.md" "$H/docs/" 2>/dev/null || true
cp "$ROOT/docs/ADD-MODULE-PLAYBOOK.md" "$H/docs/" 2>/dev/null || true
cat > "$H/README.md" << EOF
# 🏰 CITADEL MODULES HUB

Mục lục toàn bộ module của **SUPERCITADEL** — Vietnamese business OS. Mỗi module có repo mirror riêng; source of truth là monorepo [supercitadellab](https://github.com/$OWNER/supercitadellab).

> Sync gần nhất: $VERSION · Tự động bằng \`scripts/sync-modules-hub.sh\` trong monorepo.

## Danh sách module

| Module | Path monorepo | Ghi chú |
|---|---|---|$(echo -e "$HUB_LIST")

## Forge module mới
1. Đọc [docs/MODULE-FORGE-GUIDE.md](docs/MODULE-FORGE-GUIDE.md) — stack, manifest v2, contract, quy tắc.
2. Đọc [docs/ADD-MODULE-PLAYBOOK.md](docs/ADD-MODULE-PLAYBOOK.md) — quy trình nạp vào Citadel.
3. Module mới nạp vào monorepo xong → chạy \`bash scripts/sync-modules-hub.sh <tên-module>\` là tự có repo lẻ + cập nhật hub này.

## Kiến trúc chung
- **Multi-tenant:** mọi bảng có \`org_id\` + RLS fail-closed, mọi query filter org.
- **Manifest v2 strict:** loader validate tự động, module sai chuẩn bị từ chối nạp (không sập API).
- **Tiểu Tâm AI bao trùm:** module export tieu-tam-actions → tự động thành tool của trợ lý AI; tool trả \`data.downloadUrl\` → chat tự hiện nút tải file.
- **Outbox events:** module emit/subscribe event atomic qua manifest.
EOF
push_dir "$H" "citadel-modules" "hub sync $VERSION: catalog $(echo $MODULES | wc -w) modules + forge guides"
echo "✓ pushed citadel-modules HUB"
echo "DONE_ALL"
