// Chạy TRONG container api: dump ACTION_TOOLS thật ra JSON để probe
const { ACTION_TOOLS } = await import('/app/services/api/dist/services/api/src/tieu-tam/actions.js').catch(async () => {
  // thử các path dist khả dĩ
  for (const p of ['/app/services/api/dist/src/tieu-tam/actions.js','/app/services/api/dist/tieu-tam/actions.js']) {
    try { return await import(p); } catch {}
  }
  throw new Error('không tìm thấy actions.js trong dist');
});
console.log(JSON.stringify(ACTION_TOOLS));
