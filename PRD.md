# PRD — Citadel V2 (Forge Build)

> **OpenBuild Law H1:** PRD phải tồn tại trước `/build`. Đây là file đó.
> **Project:** citadel-v2 · **Date:** 2026-06-04 · **Predecessor:** RESEARCH.md + PLAN.md (verdict ĐI)

## 1. Một câu
Citadel V2 là Tiểu Tâm-First Business OS đa-tenant cho SME Việt (F&B/Retail), nơi AI hiểu xuyên module và là giao diện tương tác chính — forge thành codebase Docker-self-host, deploy được trên VPS.

## 2. Mục tiêu build này (scope đã chốt)
- Forge theo Approach B (vertical-slice): nền vững → Tiểu Tâm → Chat (lát cắt chứng minh) → nhân bản module.
- Mỗi milestone kết thúc = codebase `docker compose up` chạy thật.
- Tiểu Tâm chạy **stubbed-reply mode** (không cần LLM key); cắm key sau qua `LLM_MODE=live`.
- Verify mỗi beat bằng chạy thật (PGlite trong chat; Postgres+pgvector trong docker-compose).

## 3. Ngoài scope (lần build này KHÔNG làm)
- 25 module đầy đủ (chỉ CRM làm mẫu ở M5).
- Mobile app (Expo) — web trước.
- LLM thật (stubbed đến khi Mỗ cắm key).
- Marketplace thanh toán thật (Om mô phỏng).

## 4. Người dùng & nhu cầu
- **Chủ quán (Owner):** xem nhịp kinh doanh, hỏi Tiểu Tâm, quản lý tổ chức.
- **Quản lý (Manager):** vận hành ca, chat nhóm, theo dõi module.
- **Nhân viên (Staff):** chat, nhận việc, dùng module được cấp quyền.

## 5. Trụ cột kỹ thuật (kế thừa blueprint, không đổi)
- Monorepo: pnpm + turbo. `apps/web`, `packages/{core,db,ui}`, `services/{api,ws}`, `modules/*`.
- Backend: Hono.js 4.x gateway. Realtime: ws + Redis pub/sub (in-memory adapter cho dev).
- DB: Postgres 16 + pgvector + Drizzle ORM. Multi-tenant + RBAC module-scoped.
- Auth: V2.1 Token 13 ký tự → JWT (ADR-0001).
- Module Runtime: folder + manifest.json, plug-and-play.
- Frontend: Next.js 15 (web).

## 6. Acceptance toàn project (Definition of Done)
- [ ] `docker compose up` → mọi service healthy, web mở được.
- [ ] Login token 13 ký tự → JWT đúng payload + org_id.
- [ ] Tenant isolation: org A không đọc data org B (test thật).
- [ ] Tiểu Tâm trả lời stubbed theo intent, WS real-time hoạt động.
- [ ] Chat: 2 user nhắn real-time, Tiểu Tâm đọc được message.
- [ ] 1 module nghiệp vụ (CRM) + Om economy chạy.
- [ ] Multi-review pass ≥80 trước ship.
- [ ] README deploy: OpenClaw chạy 1 lệnh là lên.

## 7. Ràng buộc vận hành
- Sandbox reset giữa session → xuất state + ZIP cuối mỗi session.
- ZIP giao cho Mỗ phải đúng đuôi `.zip` (verify trước khi giao).
- Stubbed LLM phải có canned reply cho ≥6 intent phổ biến (doanh thu, deal, kho, ca, nhắc, chào).

## 8. Hooks (OpenBuild)
- H1: PRD tồn tại ✅ (file này).
- H6: beat >6K token → split.
- H7: beat chưa verify → BLOCK, không qua beat sau.
