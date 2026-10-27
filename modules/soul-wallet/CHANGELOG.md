# Changelog — Soul-Wallet

## 1.0.0 (2026-07-06)
Bản phát hành đầu. Chi tiết đầy đủ trong docs/GUIDE.md §Changelog.
- Core: 25 bảng sw_* + RLS FORCE; sổ kép mini delta-ledger; số dư derive; đảo bút toán; splits; doc_no tuần tự; audit mọi mutation.
- Kỷ luật: 6 Hũ + envelope rollover + risk dự phóng; hũ mục tiêu; sổ nợ lãi đơn + aging 5 bucket + nhắc hạn; recurring catch-up/draft/bắt tăng giá; rule engine.
- Máy móc: import 6 preset bank VN + dup-hash + preview→commit; export CSV/XLSX; reconcile adjust có dấu.
- Insights: snapshot OHLC ngày (nến); monthly/category/networth summary rebuild-từ-ledger; anomaly 5 loại; runway; 8 báo cáo + narrate.
- Tiểu Tâm: 12 tools + 13 actions dry-run→confirm; 17 intents.
- FE: dashboard 6 tab SVG thuần. Nightly automation per (org, owner).
- Kiểm định: 134/134 test PGlite RLS-thật; typecheck module + api + web 0 lỗi; audit-manifests & audit-module-docs PASS; WIRING.patch git-diff authentic.
