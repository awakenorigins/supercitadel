import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
import { validateStepsConfig } from '../server/service.js';
const defs=JSON.parse(readFileSync(join(here,'definitions.seed.json'),'utf8'));
const domains=new Set(['hr','finance','sales','marketing','operations']);
if(defs.length!==80) throw new Error(`Expected 80 got ${defs.length}`);
for(const d of defs){ if(!domains.has(d.domain)) throw new Error(`bad domain ${d.code}`); if(!d.trace?.source||!d.trace?.block) throw new Error(`missing trace ${d.code}`); validateStepsConfig(d.stepsConfig); }
const counts=defs.reduce((a:any,d:any)=>(a[d.domain]=(a[d.domain]||0)+1,a),{});
console.log('VERIFY_OK', {count:defs.length, domains:counts});
const sampleCodes=['ketoan.qt-chi-tien-mat','hcns.qt-dao-tao','kinhdoanh.qt-tiep-nhan-va-xu-ly-don-hang','marketing.qt-booking-kols','vanhanh.qt-dau-thau','ketoan.qt-thanh-toan-tam-ung-cong-tac-phi','hcns.qt-trien-khai-tuyen-dung','kinhdoanh.qt-khuyen-mai-xa-hang','marketing.qt-xu-ly-khung-hoang-truyen-thong','vanhanh.qt-mua-hang-de-ban-moi'];
console.table(defs.filter((d:any)=>sampleCodes.includes(d.code)).map((d:any)=>({code:d.code, steps:d.stepsConfig.map((s:any)=>`${s.approverRole}:${s.name}`).join(' | '), trace:d.trace.source})));
