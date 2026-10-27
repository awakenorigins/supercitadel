// Tìm ngưỡng: gpt-5.5 proxy trả in_progress rỗng khi bộ tools thật quá lớn?
import fs from 'fs';
const tools = JSON.parse(fs.readFileSync('/tmp/v11-tools.json','utf8')) as any[];
const env = Object.fromEntries(fs.readFileSync('/root/.openclaw/workspace/supercitadellab/.env','utf8').split('\n').filter((l)=>l.includes('=')).map((l)=>[l.slice(0,l.indexOf('=')), l.slice(l.indexOf('=')+1)]));
async function probe(n: number, attempt = 1): Promise<string> {
  const sub = tools.slice(0, n);
  const body = { model: env.LLM2_MODEL, stream: false, max_tokens: 2048, temperature: 0.7,
    messages: [{ role:'system', content:'Bạn là Tiểu Tâm, trợ lý ảo doanh nghiệp.' }, { role:'user', content:'Chào em, trả lời 1 câu.' }],
    ...(n ? { tools: sub, tool_choice: 'auto' } : {}) };
  const t0 = Date.now();
  const r = await fetch(`${env.LLM2_BASE_URL}/chat/completions`, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${env.LLM2_API_KEY}` }, body: JSON.stringify(body) });
  const raw = await r.text(); const ms = Date.now()-t0;
  let d: any; try { d = JSON.parse(raw); } catch { return `n=${n} PARSE_ERR ${raw.slice(0,120)}`; }
  const msg = d.choices?.[0]?.message; const fin = d.choices?.[0]?.finish_reason;
  return `n=${n} try${attempt} ${ms}ms finish=${fin} content_len=${(msg?.content??'').length} bytes=${JSON.stringify(body).length}`;
}
for (const n of [150, 180, 205]) console.log(await probe(n));
// retry 205 thêm 2 lần xem có phải flaky không
console.log(await probe(205, 2));
console.log(await probe(205, 3));
