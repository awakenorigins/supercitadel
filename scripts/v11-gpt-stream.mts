// Thử stream:true với full 205 tools thật — nghi proxy 9route non-stream cắt sớm (in_progress)
import fs from 'fs';
const tools = JSON.parse(fs.readFileSync('/tmp/v11-tools.json','utf8')) as any[];
const env = Object.fromEntries(fs.readFileSync('/root/.openclaw/workspace/supercitadellab/.env','utf8').split('\n').filter((l)=>l.includes('=')).map((l)=>[l.slice(0,l.indexOf('=')), l.slice(l.indexOf('=')+1)]));
const body = { model: env.LLM2_MODEL, stream: true, max_tokens: 2048, temperature: 0.7,
  messages: [{ role:'system', content:'Bạn là Tiểu Tâm, trợ lý ảo doanh nghiệp.' }, { role:'user', content:'Chào em, trả lời 1 câu.' }],
  tools, tool_choice: 'auto' };
const t0 = Date.now();
const r = await fetch(`${env.LLM2_BASE_URL}/chat/completions`, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${env.LLM2_API_KEY}` }, body: JSON.stringify(body) });
const raw = await r.text();
const ms = Date.now()-t0;
console.log('status', r.status, 'ms', ms, 'ct', r.headers.get('content-type'));
// ráp SSE
let text = ''; let toolCalls = 0; let finish = '';
for (const line of raw.split('\n')) {
  const s = line.trim(); if (!s.startsWith('data:')) continue;
  const payload = s.slice(5).trim(); if (payload === '[DONE]') continue;
  try { const d = JSON.parse(payload); const del = d.choices?.[0]?.delta; if (del?.content) text += del.content; if (del?.tool_calls) toolCalls++; if (d.choices?.[0]?.finish_reason) finish = d.choices[0].finish_reason; } catch {}
}
console.log('finish', finish, 'content_len', text.length, 'toolCallChunks', toolCalls);
console.log('TEXT:', text.slice(0, 200));
if (!text) console.log('RAW HEAD:', raw.slice(0, 500));
