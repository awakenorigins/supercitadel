import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../../..');
const workspace = join(repo, '..');
const analysisDir = join(workspace, 'module-qldn-v1a/analysis');
const reportsDir = join(analysisDir, 'block-reports');
const inventoryPath = join(analysisDir, 'inventory.json');
const overridesPath = join(here, 'overrides.json');
const outPath = join(here, 'definitions.seed.json');

type StepConfig = { order:number; name:string; approverRole:string; slaHours?:number; condition?:string; minAmount?:number; maxAmount?:number };
type Def = { code:string; name:string; domain:string; entityType:string; stepsConfig:StepConfig[]; thresholdRules:any[]; version:number; isActive:boolean; trace:{source:string; block:string; parser:string; overrideReason?:string} };
const blocks = [
  { file:'block-1-hcns.md', domain:'hr', prefix:'hcns', block:'block-1-hcns.md' },
  { file:'block-2-ketoan.md', domain:'finance', prefix:'ketoan', block:'block-2-ketoan.md' },
  { file:'block-3-kinhdoanh.md', domain:'sales', prefix:'kinhdoanh', block:'block-3-kinhdoanh.md' },
  { file:'block-4-marketing.md', domain:'marketing', prefix:'marketing', block:'block-4-marketing.md' },
  { file:'block-5-vanhanh.md', domain:'operations', prefix:'vanhanh', block:'block-5-vanhanh.md' },
];
const roleMap: [RegExp,string][] = [
  [/ban\s*(tgđ|tong giam doc)|tổng giám đốc|tong giam doc|tgđ|ceo/i,'ban-tgd'],[/giám đốc|giam doc|\bgđ\b|\bgd\b/i,'giam-doc'],[/kế toán trưởng|ke toan truong|kt trưởng|kt truong/i,'ke-toan-truong'],[/thủ quỹ|thu quy/i,'thu-quy'],[/kt thanh toán|p\. kế toán|bp\. kế toán|phòng kế toán|p\.kế toán|kế toán|ke toan/i,'phong-ke-toan'],[/trưởng phòng ns|phòng ns|p\.ns|hcns|nhân sự|nhan su/i,'phong-ns'],[/p\.đt|phòng đào tạo|dao tao|đào tạo/i,'phong-dt'],[/quản lý trực tiếp|ql trực tiếp|trưởng bộ phận|trưởng phòng|quan ly|phụ trách/i,'quan-ly-truc-tiep'],[/p\. vật tư|phòng vật tư|vat tu/i,'phong-vat-tu'],[/kinh doanh|ttkd|sale/i,'phong-kinh-doanh'],[/marketing|mkt/i,'phong-marketing'],[/kỹ thuật|ky thuat|bảo hành|bao hanh/i,'phong-ky-thuat'],[/vận hành|van hanh|sản xuất|san xuat|kho\b/i,'phong-van-hanh'],[/mua hàng|procurement|cung ứng/i,'phong-mua-hang'],[/chỉ huy trưởng|chi huy truong/i,'chi-huy-truong'],[/người đề nghị|người làm đề nghị|nhân viên|nv/i,'nguoi-de-nghi'],
];
const approvalRe = /(duyệt|phê duyệt|phe duyet|ký duyệt|ky duyet|ký xác nhận|xác nhận|xem xét|kiểm tra|thẩm định|đối soát|nghiệm thu|review|chấp thuận)/i;
const skipActorRe = /(người đề nghị|người làm đề nghị|khách hàng|ncc|nhà cung cấp|ứng viên|người nhận)/i;
function stripNum(s:string){return s.replace(/^\d+\.\s*/,'').trim()}
function slug(s:string){return stripNum(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,52)}
function roleOf(line:string){ for (const [re,role] of roleMap) if (re.test(line)) return role; return 'quan-ly-truc-tiep'; }
function stepName(line:string, role:string){ const clean=line.replace(/^\s*\d+\.\s*/,'').replace(/\s+/g,' ').trim(); const act=(clean.match(/(duyệt|phê duyệt|ký duyệt|ký xác nhận|xác nhận|xem xét|kiểm tra|thẩm định|đối soát|nghiệm thu)[^.;,]*/i)?.[0]||'Duyệt/Xác nhận').trim(); return `${act.charAt(0).toUpperCase()+act.slice(1)} (${role})`.slice(0,150); }
function entityFor(name:string, domain:string){ const n=name.toLowerCase();
 if(/chi tiền mặt|thanh toán|tạm ứng/.test(n)) return 'qfi_payment_requests'; if(/thu tiền|xoá nợ|xóa nợ|công nợ/.test(n)) return 'qfi_customer_debt_statements'; if(/lương/.test(n)) return 'qfi_payroll_runs';
 if(/đào tạo|dao tao/.test(n)) return 'qhr_training_requests'; if(/tuyển dụng|tuyen dung/.test(n)) return 'qhr_recruitment_requests'; if(/thôi việc|sa thải|vi phạm|hvvp|kỷ luật/.test(n)) return 'qhr_violation_cases'; if(/hợp đồng/.test(n)) return 'qhr_employment_contracts'; if(/thử việc/.test(n)) return 'qhr_probation_periods'; if(/thuyên chuyển/.test(n)) return 'qhr_transfer_requests'; if(/công tác/.test(n)) return 'qhr_business_trip_requests'; if(domain==='hr') return 'qhr_audit_plans';
 if(/khiếu nại|bảo hành/.test(n)) return 'qsa_warranty_claims'; if(/đổi trả/.test(n)) return 'qsa_return_requests'; if(/đấu thầu/.test(n)) return 'qsa_sales_tenders'; if(/khuyến mãi/.test(n)) return 'qsa_promotions'; if(/xuất khẩu/.test(n)) return 'qsa_export_shipments'; if(/nhượng quyền/.test(n)) return 'qsa_franchise_deals'; if(domain==='sales') return 'qsa_sales_orders';
 if(/ngân sách|budget|ads|adwords|facebook|kol|video|content|landingpage|sự kiện/.test(n)) return 'qmk_campaigns'; if(/nghiên cứu|định giá|đối thủ|khảo sát/.test(n)) return 'qmk_research_projects'; if(/khủng hoảng/.test(n)) return 'qmk_reports'; if(/thiết kế/.test(n)) return 'qmk_task_assignments';
 if(/mua hàng|nhà cung cấp|đấu thầu|thuê dv|thiết bị để bán/.test(n)) return 'qpr_purchase_requests'; if(/sửa chữa|bảo dưỡng|ô tô|mmtb/.test(n)) return 'qas_maintenance_tickets'; if(/xe/.test(n)) return 'qas_vehicles'; if(/xuất - nhập|kho|tồn/.test(n)) return 'inventory_items'; if(/quy trình|qt/.test(n)) return 'wf_procedure_rollouts'; return domain==='operations'?'qpr_procurement_requests':'wf_procedure_rollouts'; }
function thresholds(text:string){ const nums=[...text.matchAll(/(500\s*k|500\.000|2\s*tr|2\.000\.000|5\s*tr|5\.000\.000|20\s*tr|20\.000\.000)/gi)].map(m=>m[1].toLowerCase().replace(/\s/g,'')); const map:any={'500k':500000,'500.000':500000,'2tr':2000000,'2.000.000':2000000,'5tr':5000000,'5.000.000':5000000,'20tr':20000000,'20.000.000':20000000}; return [...new Set(nums.map(n=>map[n]).filter(Boolean))].sort((a,b)=>a-b).map((minAmount,i)=>({minAmount, addSteps:[{order:90+i,name:`Duyệt bổ sung theo ngưỡng ${minAmount.toLocaleString('vi-VN')}đ`,approverRole:minAmount>=20000000?'ban-tgd':minAmount>=5000000?'giam-doc':'quan-ly-truc-tiep',minAmount}]})); }
function parseSections(md:string){ const matches=[...md.matchAll(/^## (.+)$/gm)]; return matches.filter(m=>!/TỔNG HỢP/i.test(m[1])).map((m,i)=>({name:m[1].trim(), body:md.slice((m.index||0), matches[i+1]?.index ?? md.length)})); }
function parseSteps(body:string):StepConfig[]{ const lines=[...body.matchAll(/^\s*(\d+)\.\s+(.+)$/gm)].map(m=>`${m[1]}. ${m[2]}`); const picked:StepConfig[]=[]; const seen=new Set<string>();
 for(const l of lines){ if(!approvalRe.test(l)) continue; const role=roleOf(l); if(skipActorRe.test(l) && role==='nguoi-de-nghi') continue; const key=role+'|'+stepName(l,role).replace(/\(.+\)$/,''); if(seen.has(key)) continue; seen.add(key); picked.push({order:picked.length+1,name:stepName(l,role),approverRole:role,slaHours:24}); }
 if(!picked.length){ picked.push({order:1,name:'Quản lý trực tiếp xác nhận/duyệt quy trình',approverRole:'quan-ly-truc-tiep',slaHours:24}); }
 return picked.map((s,i)=>({...s,order:i+1})); }
const inv=JSON.parse(readFileSync(inventoryPath,'utf8'));
function sourceFor(processName:string, blockTitle:string){ const procs=inv.blocks?.[blockTitle]?.processes||{}; const norm=(x:string)=>slug(x).replace(/^qt-/,''); const target=norm(processName); let best=''; for(const [p,v] of Object.entries<any>(procs)){ if(norm(p)===target || norm(p).includes(target) || target.includes(norm(p))) { best=(v.files||[]).find((f:any)=>f.kind==='process')?.rel || (v.files||[])[0]?.rel; break; } } return best || `${blockTitle}/${processName}`; }
const overrides = (()=>{try{return JSON.parse(readFileSync(overridesPath,'utf8'))}catch{return {}}})();
const defs:Def[]=[]; let auto=0, overridden=0;
for(const b of blocks){ const md=readFileSync(join(reportsDir,b.file),'utf8'); const blockTitle = b.file.includes('hcns')?'1. QT Hành chính Nhân sự':b.file.includes('ketoan')?'2. QT Kế toán':b.file.includes('kinhdoanh')?'3. QT Kinh doanh':b.file.includes('marketing')?'4. QT Marketing':'5. QT Vận hành';
 for(const sec of parseSections(md)){ const code=`${b.prefix}.${slug(sec.name)}`; const ov=overrides[code]||{}; const base:Def={code,name:stripNum(sec.name),domain:b.domain,entityType:ov.entityType||entityFor(sec.name,b.domain),stepsConfig:ov.stepsConfig||parseSteps(sec.body),thresholdRules:ov.thresholdRules||thresholds(sec.body),version:1,isActive:true,trace:{source:sourceFor(sec.name,blockTitle),block:b.file,parser:ov.stepsConfig?'override':'auto',overrideReason:ov.reason}}; defs.push(base); ov.stepsConfig?overridden++:auto++; }
}
if(defs.length!==80) throw new Error(`Expected 80 definitions, got ${defs.length}`);
writeFileSync(outPath, JSON.stringify(defs,null,2)+'\n');
console.log(JSON.stringify({written:relative(process.cwd(),outPath), count:defs.length, auto, overridden},null,2));
