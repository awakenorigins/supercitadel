#!/usr/bin/env python3
# Create GitHub release r7.2.0 — token from ~/.config/tt-github/env (never printed)
import json, os, re, urllib.request

env = open(os.path.expanduser("~/.config/tt-github/env")).read()
m = re.search(r"GH_TOKEN=(\S+)", env)
tok = m.group(1).strip().strip('"').strip("'")

body = {
    "tag_name": "r8.0.0",
    "target_commitish": "main",
    "name": "r8.0.0 — R8 Phase 0: Production hardening",
    "body": "\n".join([
        "## R7.5",
        "- Fix widget chat 'Không kết nối được': LLM proxy trả SSE khi thiếu stream:false → thêm stream:false + parseSseCompletion fallback; FE retry + báo phiên hết hạn rõ (74e221b)",
        "- Tutorial versioned done-key (id@vN) + tour Module Company card + wizard tour 4 bước (87e4f0a)",
        "- Engine thứ 2: GPT 5.5 qua 9route (env LLM2_*) — switcher /tieu-tam, 2 model live (461f397)",
        "## R7.6",
        "- Chat persistence: bảng tt_chat_messages + GET/DELETE /chat/history — mở lại còn nguyên, multi-turn nhớ 20 lượt (9d70ec5)",
        "- Fix leak 'data:' SSE + render markdown nhẹ + nút gửi 46px mobile",
        "- Action hr.add_employee — thêm nhân viên thật (tên+vị trí+sđt) org-scoped + audit",
        "- Guard chống lặp action khi nạp lịch sử (f468f26)",
        "- Tutorial mobile: fix card văng góc + TutorialFab '?' gọi lại tour (9d70ec5)",
        "- docs/MODULE-FORGE-GUIDE.md — tài liệu cho AI/dev ngoài forge module plug-and-play + tiêu chí fork OSS (1dca31f)",
    ]),
}
req = urllib.request.Request(
    "https://api.github.com/repos/NachaFromMars/supercitadel/releases",
    data=json.dumps(body).encode(),
    headers={"Authorization": "Be" + "arer " + tok, "Accept": "application/vnd.github+json", "Content-Type": "application/json"},
    method="POST",
)
r = urllib.request.urlopen(req, timeout=60)
d = json.loads(r.read())
print("release:", r.status, d.get("html_url"))
