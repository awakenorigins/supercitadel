// Dump + audit ACTION_TOOLS thật, rồi probe gpt-5.5 với đúng bộ tools này
import fs from 'fs';
const m = await import('../services/api/src/tieu-tam/actions.js');
const tools = m.ACTION_TOOLS as any[];
console.log('count', tools.length);
const bad = tools.filter((x) => !x.function.parameters || x.function.parameters.type !== 'object');
console.log('badSchema', bad.length, bad.map((b) => b.function.name));
const names = tools.map((x) => x.function.name);
console.log('longNames', names.filter((n) => n.length > 64));
console.log('dupNames', names.filter((n, i) => names.indexOf(n) !== i));
fs.writeFileSync('/tmp/v11-tools.json', JSON.stringify(tools));

// probe gpt-5.5 với bộ tools THẬT
const env = Object.fromEntries(fs.readFileSync('/root/.openclaw/workspace/supercitadellab/.env','utf8').split('\n').filter((l)=>l.includes('=')).map((l)=>[l.slice(0,l.indexOf('=')), l.slice(l.indexOf('=')+1)]));
const body = { model: env.LLM2_MODEL, stream: false, max_tokens: 8192, temperature: 0.7,
  messages: [{ role:'system', content:'Bạn là Tiểu Tâm, trợ lý ảo doanh nghiệp.' }, { role:'user', content:'Chào em, em giúp gì được? Trả lời 1 câu.' }],
  tools, tool_choice: 'auto' };
const r = await fetch(`${env.LLM2_BASE_URL}/chat/completions`, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${env.LLM2_API_KEY}` }, body: JSON.stringify(body) });
const raw = await r.text();
let msg: any; try { msg = JSON.parse(raw).choices?.[0]?.message; } catch { msg = { parseError: raw.slice(0,300) }; }
console.log('gpt55 status', r.status, 'content_len', (msg?.content ?? '').length, 'tool_calls', msg?.tool_calls?.length ?? 0);
if (!(msg?.content) && !(msg?.tool_calls?.length)) console.log('RAW:', raw.slice(0, 600));
