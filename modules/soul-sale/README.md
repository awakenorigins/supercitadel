# Soul-Sale 1A — Bán Hàng & Kênh Phân Phối (SuperCitadel module)

CRM + DMS hợp nhất cho SME Việt: cây kênh NPP→đại lý→điểm bán (closure table), lead→deal→báo giá→đơn hàng qua **cổng công nợ**, máy giá tầng, chỉ tiêu & hoa hồng, chốt kỳ công nợ, **Splitter** đối soát bảng kê Excel đại lý, intelligence rule-based + 6 job đêm. Tiểu Tâm điều khiển 100% qua **23 read tools + 34 write actions** (14 L2 dry-run→confirm, preview thật).

- Engine: SuperCitadel `>=11.4.0` · Schema PG riêng `soulsale`, prefix `ss_`, RLS fail-closed, đa tenant `org_id`
- Tiền: VND nguyên đồng `numeric(18,0)` · Stack: TS + Hono ^4.6 + Drizzle ^0.36 + Zod; test PGlite (102/102)
- Cài đặt: xem `INSTALL.md` + prompt tự động `SoulSale1A-NAP-MODULE-PROMPT.md` · Tài liệu: `docs/` (GUIDE, TOOLS, PERMISSIONS, EVENTS, IMPORT_FORMAT, AGENCY_RETAILER_RULES, RECONCILIATION_PLAYBOOK, TUTORIAL, CHANGELOG)
- Giới hạn V1 (trung thực): không POS, không e-invoice VN, chỉ VND, intelligence rule-based.

© Nacha — Proprietary. Xem `LICENSE`.
