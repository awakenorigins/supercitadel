/* mini harness — đếm pass/fail, exit 1 nếu đỏ */
let pass = 0, fail = 0; const errs: string[] = [];
export async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; const m = e instanceof Error ? e.message : String(e); errs.push(`${name}: ${m}`); console.log('  ✗', name, '—', m); }
}
export function ok(v: unknown, msg = 'expected truthy') { if (!v) throw new Error(msg); }
export function eq(a: unknown, b: unknown, msg = '') {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(`${msg} expected=${jb} got=${ja}`);
}
export async function throws(fn: () => Promise<unknown>, includes?: string) {
  try { await fn(); } catch (e) { const m = e instanceof Error ? e.message : String(e); if (includes && !m.includes(includes)) throw new Error(`sai lỗi: "${m}" (cần chứa "${includes}")`); return; }
  throw new Error('expected throw');
}
export function done(suite: string) {
  console.log(`${suite}: ${pass}/${pass + fail} PASS${fail ? ` — ${fail} FAIL` : ''}`);
  if (fail) { console.error(errs.join('\n')); process.exit(1); }
}
