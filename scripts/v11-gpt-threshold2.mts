// Dò ngưỡng thấp hơn với tools THẬT + thử max_tokens cao + thử chờ lâu
import fs from 'fs';
const tools = JSON.parse(fs.readFileSync('/tmp/v11-tools.json','utf8')) as any[];
const env = Object.fromEntries(fs.readFileSync('/root/.openclaw/workspace/supercitadellab/.env','utf8').split('\n').filter((l)=>l.includes('=')).map((l)=>[l.slice(0,l.indexOf('=')), l.slice(l.indexOf('=')+1)]));
async function probe(n: number, extra: any = {}, label = '') {
  const sub = tools.slice(0, n);
  const body = { model: env.LLM2_MODEL, stream: false, max_tokens: 2048, temperature: 0.7,
    messages: [{ role:'system', content:'Bạn là Tiểu Tâm, trợ lý ảo doanh nghiệp.' }, { role:'user', content:'Chào em, trả lời 1 câu.' }],
    ...(n ? { tools: sub, tool_choice: 'auto' } : {}), ...extra };
  const t0 = Date.now();
  const r = await fetch(`${env.LLM2_BASE_URL}/chat/completions`, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${env.LLM2_API_KEY}` }, body: JSON.stringify(body) });
  const raw = await r.text(); const ms = Date.now()-t0;
  let d: any; try { d = JSON.parse(raw); } catch { console.log(`n=${n}${label} PARSE_ERR ${raw.slice(0,120)}`); return; }
  const msg = d.choices?.[0]?.message; const fin = d.choices?.[0]?.finish_reason;
  console.log(`n=${n}${label} ${ms}ms finish=${fin} content_len=${(msg?.content??'').length} bytes=${JSON.stringify(body).length}`);
}
for (const n of [40, 80, 100, 120, 140]) await probe(n);
await probe(205, { max_tokens: 16384 }, ' mt16k');
