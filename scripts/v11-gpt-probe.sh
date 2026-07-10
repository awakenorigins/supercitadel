#!/bin/bash
# Probe LLM2 (gpt-5.5) trực tiếp: check raw completion có content không
B=$(grep '^LLM2_BASE_URL=' /root/.openclaw/workspace/supercitadellab/.env | cut -d= -f2)
K=$(grep '^LLM2_API_KEY=' /root/.openclaw/workspace/supercitadellab/.env | cut -d= -f2)
M=$(grep '^LLM2_MODEL=' /root/.openclaw/workspace/supercitadellab/.env | cut -d= -f2)
echo "== no tools, temp 0.7 =="
curl -s -m 60 "$B/chat/completions" -H "Authorization: Bearer $K" -H 'Content-Type: application/json' \
  -d "{\"model\":\"$M\",\"stream\":false,\"max_tokens\":200,\"temperature\":0.7,\"messages\":[{\"role\":\"user\",\"content\":\"Nói ngắn: 1+1=?\"}]}" | head -c 800; echo
echo "== with 1 tool =="
curl -s -m 60 "$B/chat/completions" -H "Authorization: Bearer $K" -H 'Content-Type: application/json' \
  -d "{\"model\":\"$M\",\"stream\":false,\"max_tokens\":200,\"messages\":[{\"role\":\"user\",\"content\":\"Nói ngắn: 2+2=?\"}],\"tools\":[{\"type\":\"function\",\"function\":{\"name\":\"noop\",\"description\":\"none\",\"parameters\":{\"type\":\"object\",\"properties\":{}}}}]}" | head -c 800; echo
echo "== max_completion_tokens variant =="
curl -s -m 60 "$B/chat/completions" -H "Authorization: Bearer $K" -H 'Content-Type: application/json' \
  -d "{\"model\":\"$M\",\"stream\":false,\"max_completion_tokens\":200,\"messages\":[{\"role\":\"user\",\"content\":\"Nói ngắn: 3+3=?\"}]}" | head -c 800; echo
