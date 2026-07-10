# ASR Worker — sidecar THAM KHẢO (docs-only, untested-by-CI)

Bóc băng tiếng Việt cho Soul-Meeting. Chạy **ngoài** Node host (Python + GPU/CPU),
nói chuyện với host qua HTTP. Module **không phụ thuộc** worker: thiếu →
`ASR_UNAVAILABLE`, mọi tính năng khác chạy bình thường.

## Chạy
```bash
pip install faster-whisper
FILES_ROOT=/data/files ASR_PORT=8791 python worker.py
```
GPU: `ASR_DEVICE=cuda ASR_COMPUTE=float16`. CPU: mặc định `int8`.

## Nối vào host (services/api wiring)
```ts
const ASR_URL = process.env.SM_ASR_URL; // ví dụ http://localhost:8791
const smCaps = ASR_URL ? { asr: { transcribe: async (inp: any) => {
  const r = await fetch(`${ASR_URL}/transcribe`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ file_ref: inp.fileRef, lang: inp.lang, engine: inp.engine }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? 'ASR worker error');
  return j;
} } } : undefined;
// truyền smCaps vào buildSoulMeetingRoutes({..., caps: smCaps}),
// soulMeetingTools(db, { caps: smCaps }), soulMeetingTieuTamActions(smCaps),
// startSoulMeetingNightlyAutomation(db, { caps: smCaps })
```

## Model tiếng Việt
| engine (settings.asr_engine) | model | ghi chú |
|---|---|---|
| `phowhisper-small` (mặc định) | vinai/PhoWhisper-small | tốt nhất cho VN, ~1GB VRAM int8 |
| `whisper-small` | openai small | đa ngôn ngữ |
| `whisper-medium` | openai medium | chính xác hơn, nặng hơn |

Diarization (tách người nói) chưa gồm — mọi segment gán "Người nói 1",
thư ký dùng **rename-speaker** trong module để gán tên sau. Nâng cấp:
pyannote.audio → map speaker theo overlap thời gian.

## Retention
Module **không xóa file** (file thuộc host). Nightly trả `purge_candidates`
(ghi âm quá `audio_retention_days`) — host cron tự xóa kho file + có thể
DELETE bản ghi `smeet_recordings` nếu muốn.
