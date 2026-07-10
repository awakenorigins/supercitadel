#!/usr/bin/env python3
"""
SOUL-MEETING — ASR worker THAM KHẢO (sidecar, chạy NGOÀI Node host).
⚠ DOCS-ONLY / UNTESTED-BY-CI: file này KHÔNG chạy trong gate CI của module
(CI Node/PGlite không có Python+GPU). Clean-room module vẫn xanh không cần nó.

Hợp đồng với module (SmCaps.asr):
  transcribe({fileRef, lang, engine}) -> [{startMs, endMs, text, speakerLabel?, confidence?}]

Triển khai gợi ý: HTTP POST /transcribe {file_ref, lang, engine}
→ host adapter wiring:
  caps: { asr: { transcribe: (inp) => fetch(ASR_URL+'/transcribe', {method:'POST',
          body: JSON.stringify(inp)}).then(r => r.json()) } }

Model khuyến nghị tiếng Việt: vinai/PhoWhisper-small (CTranslate2 qua faster-whisper)
hoặc openai/whisper-small. GPU 4GB đủ cho small; CPU int8 chạy được nhưng chậm.
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

try:
    from faster_whisper import WhisperModel  # pip install faster-whisper
except ImportError:
    WhisperModel = None

ENGINE_MAP = {
    "phowhisper-small": "vinai/PhoWhisper-small",
    "whisper-small": "small",
    "whisper-medium": "medium",
}
_model_cache = {}


def get_model(engine: str):
    name = ENGINE_MAP.get(engine, ENGINE_MAP["phowhisper-small"])
    if name not in _model_cache:
        device = os.environ.get("ASR_DEVICE", "auto")
        compute = os.environ.get("ASR_COMPUTE", "int8")
        _model_cache[name] = WhisperModel(name, device=device, compute_type=compute)
    return _model_cache[name]


def resolve_file(file_ref: str) -> str:
    """files://xxx → đường dẫn thật. Host mount kho file vào FILES_ROOT."""
    root = os.environ.get("FILES_ROOT", "/data/files")
    return os.path.join(root, file_ref.replace("files://", ""))


def transcribe(file_ref: str, lang: str = "vi", engine: str = "phowhisper-small"):
    if WhisperModel is None:
        raise RuntimeError("faster-whisper chưa cài: pip install faster-whisper")
    model = get_model(engine)
    segments, _info = model.transcribe(
        resolve_file(file_ref), language=lang, vad_filter=True, beam_size=5,
    )
    out = []
    for s in segments:
        out.append({
            "startMs": int(s.start * 1000),
            "endMs": int(s.end * 1000),
            "text": s.text.strip(),
            # faster-whisper không diarize; gán 1 speaker — module cho rename sau.
            # Nâng cấp: pyannote.audio diarization rồi map speaker theo overlap.
            "speakerLabel": "Người nói 1",
            "confidence": round(float(getattr(s, "avg_logprob", 0.0)), 3),
        })
    return out


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/transcribe":
            self.send_response(404); self.end_headers(); return
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        try:
            result = transcribe(body["file_ref"], body.get("lang", "vi"), body.get("engine", "phowhisper-small"))
            payload = json.dumps(result).encode()
            self.send_response(200)
        except Exception as e:  # noqa: BLE001 — trả lỗi cho module ghi vào recordings.error
            payload = json.dumps({"error": str(e)}).encode()
            self.send_response(500)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *a):  # gọn log
        sys.stderr.write("[asr] " + (a[0] % a[1:]) + "\n")


if __name__ == "__main__":
    port = int(os.environ.get("ASR_PORT", "8791"))
    print(f"[asr] worker tham khảo nghe :{port} (POST /transcribe)")
    HTTPServer(("0.0.0.0", port), Handler).serve_forever()
