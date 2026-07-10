# Soul-Meeting Integration Audit

Date: 2026-07-10 · Scope: local integration only · No deploy, push, tag, or commit.

## 1. Incoming artifact audit

Source ZIP: `media/inbound/openclaw-staged-1b3762f8-6dd7-45cf-a082-d886d4eeb762/soul-meeting-1a-v1.0---4eb7c0cb-5877-458d-b980-0bd2754968c9.zip` (146,663 bytes).

- Enumerated every ZIP entry before extraction. No absolute paths, `..` components, backslash traversal, symlinks, or executable mode bits were found.
- File inventory was source/docs/SQL/JSON plus one optional Python ASR reference worker; no compiled binaries were found.
- Secret-pattern scan found no embedded credential. References to tokens/permissions are application vocabulary, not secret values.
- Dependencies reviewed: `drizzle-orm`, `hono`, `zod`, `xlsx`; development-only `tsx`, TypeScript, Node types, PGlite. Versions align with host conventions. Lockfile was regenerated at workspace root.
- Reviewed supplied manifest, README, audit, wiring patch, routes, schema, migrations, tools/actions, tutorial docs and tests. Host-compatible manifest retained, with icon adapted from unsupported `i-calendar` to host `clock`.

## 2. Integration performed

- Added isolated workspace package `modules/soul-meeting` with supplied schema, additive `0000_init.sql` and `0001_rls.sql`, services, validation, route contract, Hono host adapter, 10 read tools, 22 write actions, tests and docs.
- Added API workspace dependency and loader builder for `/api/v1/soul-meeting` with auth, module gate and audit integration.
- Registered all 14 `sm.*` permissions in core; manager receives `sm.*`; sensitive mutation/approval/publish permissions require security level 2.
- Registered Soul-Meeting read tools in the shared Tiểu Tâm registry and all write actions in the action dispatcher.
- Added `/soul-meeting` Next.js page using the supplied UI, without modifying another module page.
- Added deploy migration discovery entry only; no migration was executed and no production data was touched.
- Added discoverable `docs/GUIDE.md`, `docs/TIEU-TAM.md`, and expanded `docs/TUTORIAL.md` with seven guided lessons, Owner/Manager/Staff guidance, FAQ, safety guidance and five-answer quiz.

## 3. Isolation and safety findings

- Tables and indexes use the dedicated `sm_` namespace, avoiding collisions with existing modules.
- Service context is organization-scoped; host adapter derives organization from authenticated context. Supplied RLS migration remains defense-in-depth.
- Published minutes are immutable; sensitive actions are represented as confirmation/security-level-2 actions.
- ASR worker is optional and degrades cleanly if capability is absent.
- Existing unrelated untracked file `SUPERCITADEL-V12-PROMOTION-REPORT.md` was present before work and was not modified.

## 4. Verification evidence

### Passed
- Module TypeScript: PASS.
- Native module smoke suite: PASS, **189 assertions / 0 failures** across core, preparation, live vote/quorum, harvest/action/minutes, recording/ASR, reporting/ICS/Excel/scheduled jobs, HTTP bridge, tool registry and Tiểu Tâm action contract.
- Core permission and manifest tests: PASS.
- Web production build: PASS; static route `/soul-meeting` emitted successfully.
- Manifest/docs audit scripts were run; outputs are available in the command logs during this worktree session.

### Pre-existing blocker outside module scope
- API typecheck reaches the integrated API but fails in existing `packages/tieu-tam/src/adapters.ts` lines 43, 44, 53 and 64: `MessageContent` may be an image-content array but is passed where `string` is required. This file was not changed by Soul-Meeting integration. Module typecheck and web build both pass; no Soul-Meeting-specific TypeScript error was reported.

## 5. Files/scopes changed

- `modules/soul-meeting/**`
- `apps/web/app/soul-meeting/page.tsx`
- `services/api/package.json`
- `services/api/src/modules/loader.ts`
- `services/api/src/index.ts`
- `services/api/src/tieu-tam/actions.ts`
- `packages/core/src/permissions.ts`
- `deploy.sh`
- `pnpm-lock.yaml`
- this audit report

## 6. Deployment status

Not deployed. No database migration applied. No Git commit, tag, branch, push, or GitHub action was performed.

## Live namespace collision remediation — 2026-07-10 23:xx CEST

- **Decision:** Soul Meeting exclusively owns collision-proof DB namespace `smeet_*` (20 tables). Public/API/TypeScript contracts remain unchanged (`sm.*` tools/actions/events, `smSettings` symbols, `soul-meeting` route/permission IDs).
- **Inventory before change:** live Lab had 39 `sm_*` tables. Repository ownership proved `sm_settings` plus HR/payroll tables belong to `modules/soul-manager`; 19 meeting-domain tables had been additively created by the earlier Soul Meeting deploy. No pre-existing `sm_*` table was dropped, renamed, altered, or cleaned.
- Changed only Soul Meeting DB table/index/policy/raw-SQL identifiers to `smeet_*`; migrations remain additive. Live migration created exactly 20 `smeet_*` tables with RLS migration applied.
- Live API log: `[module-loader] ✅ Nạp 15 module · ❌ Từ chối 0`.
- Live HTTP: `/health` 200; `/soul-meeting` 200; authenticated `/api/v1/soul-meeting/settings`, `/types`, `/meetings` all 200 after module entitlement activation. Settings now returns Soul Meeting schema including `hourlyCost` (no collision with Soul Manager `sm_settings`).
- Module gates: typecheck PASS; native test suite PASS **189/189** (38 core + 27 prep + 22 live + 35 harvest + 20 recording + 23 report + 24 bridge); API typecheck PASS. Bridge proves 10 Tiểu Tâm read tools + 22 write actions and HTTP lifecycle/export contracts.
- Deploy surfaced existing seed defect (`orgs_slug_key`, `ca-phe-nha-minh`). `packages/db/src/seed.ts` is now idempotent: detects existing demo org and exits cleanly rather than duplicating demo rows.
- Cleanup rule: Soul Meeting test cleanup is restricted to `smeet_*`; legacy/unrelated `sm_*` tables are untouched.

## Final Lab runtime proof — 2026-07-10 23:17–23:25 CEST

- Full `./deploy.sh` rebuild/rerun completed. Build emitted `/soul-meeting`; loader reported `✅ Nạp 15 module · ❌ Từ chối 0`; all migrations were additive/idempotent; seed emitted exactly `[seed] demo org ca-phe-nha-minh already exists — skip (idempotent)` and no duplicate-org error. Evidence: `logs/soul-meeting-final-deploy-rerun-20260710.log`.
- Authenticated owner regression: `GET /api/v1/chat/rooms` → 200. Probes to guessed `/settings` paths for `ke-toan-10a`, `soul-manager`, `soul-wallet`, `soul-inventory` each returned 404 (route contract has no such endpoint); no entitlement/business data was changed. Their web routes were all emitted by the same production rebuild. This is documented, not treated as an API pass.
- Live Soul Meeting API created temporary meeting `130f0338-0988-44f7-be2a-9765acc7b2a0`. Successful 200 steps: create meeting; add agenda; publish agenda; start; add live note; open/close vote; record decision; create action; finish; generate/submit/approve/publish minutes; weekly report; XLSX export (16,363 bytes); ICS export (394 bytes). Exact result log: `logs/soul-meeting-live-evidence.json`.
- Route limitation observed honestly: meeting creation auto-added the chair, so explicit participant add returned 422 `PARTICIPANT_DUPLICATE`; the script then lacked that existing participant ID and ballot cast returned 400 (`participant_id` null). Vote close still returned 200 but correctly recorded no valid ballot / not passed. Participant lifecycle is therefore proven via automatic chair creation plus duplicate enforcement, but successful ballot casting remains unproven in this live run.
- Cleanup used only `smeet_*` tables. Temporary meeting and dependent rows were removed; final `smeet_meetings` residual count for the ID = 0. Settings/catalog were preserved; no `sm_*` table was touched.
- Discovery/source verification: `smReadTools` contains exactly 10 named read tools; `smWriteActions` contains exactly 22 named actions (32 total definitions). `docs/TIEU-TAM.md` explicitly documents the `10 read + 22 action` contract; `GUIDE.md` and `TUTORIAL.md` remain packaged/discoverable.
