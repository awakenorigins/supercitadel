// Probe gpt-5.5 với N dummy tools để xem content có bị rỗng không
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('/root/.openclaw/workspace/supercitadellab/.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')), l.slice(l.indexOf('=')+1)]));
const B = env.LLM2_BASE_URL, K = env.LLM2_API_KEY, M = env.LLM2_MODEL;
const mkTools = (n) => Array.from({length:n},(_,i)=>({type:'function',function:{name:`tool_${i}`,description:`Công cụ số ${i} làm việc gì đó`,parameters:{type:'object',properties:{x:{type:'string'}}}}}));
for (const n of [0, 30, 120]) {
  const body = { model:M, stream:false, max_tokens:8192, temperature:0.7, messages:[{role:'system',content:'Bạn là Tiểu Tâm, trợ lý ảo.'},{role:'user',content:'Chào em, em giúp gì được? Trả lời 1 câu.'}], ...(n?{tools:mkTools(n),tool_choice:'auto'}:{}) };
  const r = await fetch(`${B}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${K}`},body:JSON.stringify(body)});
  const raw = await r.text();
  let msg; try { msg = JSON.parse(raw).choices?.[0]?.message; } catch { msg = {parseError: raw.slice(0,200)}; }
  console.log(`tools=${n} status=${r.status} content_len=${(msg?.content??'').length} tool_calls=${msg?.tool_calls?.length??0}`);
  if (!(msg?.content) && !(msg?.tool_calls?.length)) console.log('  RAW:', raw.slice(0, 400));
}
