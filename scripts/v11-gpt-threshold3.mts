import fs from 'fs';
const tools = JSON.parse(fs.readFileSync('/tmp/v11-tools.json','utf8')) as any[];
const env = Object.fromEntries(fs.readFileSync('/root/.openclaw/workspace/supercitadellab/.env','utf8').split('\n').filter((l)=>l.includes('=')).map((l)=>[l.slice(0,l.indexOf('=')), l.slice(l.indexOf('=')+1)]));
async function probe(n: number) {
  const body = { model: env.LLM2_MODEL, stream: false, max_tokens: 1024, temperature: 0.7,
    messages: [{ role:'system', content:'Bạn là Tiểu Tâm.' }, { role:'user', content:'Trả lời 1 câu: chào.' }],
    tools: tools.slice(0, n), tool_choice: 'auto' };
  const r = await fetch(`${env.LLM2_BASE_URL}/chat/completions`, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${env.LLM2_API_KEY}` }, body: JSON.stringify(body) });
  const raw = await r.text();
  let d: any; try { d = JSON.parse(raw); } catch { console.log(`n=${n} PARSE_ERR`); return false; }
  const ok = (d.choices?.[0]?.message?.content ?? '').length > 0 || (d.choices?.[0]?.message?.tool_calls?.length ?? 0) > 0;
  console.log(`n=${n} ok=${ok} bytes=${JSON.stringify(body).length}`);
  return ok;
}
for (const n of [50, 60, 64, 70, 76]) await probe(n);
