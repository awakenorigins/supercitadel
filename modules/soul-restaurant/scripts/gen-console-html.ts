/**
 * Sinh web/soul-restaurant-console.html (self-contained, bấm được) + web/capabilities.json
 * từ restoUiCatalog. Chạy: npx tsx scripts/gen-console-html.ts
 * Nhúng catalog qua JSON.stringify (node ghi UTF-8, an toàn tiếng Việt).
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { restoUiCatalog, restoUiSummary, UI_GROUPS } from '../src/ui-catalog.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

writeFileSync(join(root, 'web', 'capabilities.json'),
  JSON.stringify({ summary: restoUiSummary, capabilities: restoUiCatalog }, null, 2), 'utf8');

const HEAD = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Soul-Restaurant · Bảng điều khiển</title>
<style>
  :root{--bg:#0b1021;--card:#fff;--ink:#111827;--mut:#6b7280;--line:#e5e7eb;--act:#b45309;--read:#0369a1;--pri:#111827}
  *{box-sizing:border-box} body{margin:0;font-family:system-ui,Segoe UI,Roboto,sans-serif;color:var(--ink);background:#f7f7fb}
  header{background:var(--pri);color:#fff;padding:10px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
  header b{font-size:15px} .pill{font-size:11px;background:#374151;padding:3px 8px;border-radius:999px}
  header input,header select{font-size:12px;padding:5px 8px;border-radius:6px;border:1px solid #374151;background:#111827;color:#fff}
  .layout{display:grid;grid-template-columns:220px 1fr;gap:16px;padding:16px}
  aside{border-right:1px solid var(--line);padding-right:12px}
  aside button{display:block;width:100%;text-align:left;padding:8px 10px;margin-bottom:4px;border-radius:8px;border:none;cursor:pointer;background:#eef0f4;color:#111827;font-size:13px}
  aside button.on{background:#111827;color:#fff}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px}
  .card{border:1px solid var(--line);border-radius:12px;padding:14px;background:var(--card)}
  .card .top{display:flex;justify-content:space-between;align-items:center;gap:8px}
  .meta{font-size:11px} .meta.act{color:var(--act)} .meta.read{color:var(--read)}
  .fields{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}
  .fields label{font-size:12px;display:flex;flex-direction:column;gap:2px}
  .fields input,.fields select,.fields textarea{font-size:12px;padding:5px 6px;border:1px solid var(--line);border-radius:6px;width:100%}
  button.run{background:#111827;color:#fff;border:none;border-radius:8px;padding:7px 12px;cursor:pointer;font-size:13px}
  button.warn{background:#b45309} button.ghost{background:#e5e7eb;color:#111}
  pre.out{margin-top:10px;max-height:260px;overflow:auto;background:var(--bg);color:#d7e0ff;padding:10px;border-radius:8px;font-size:12px;white-space:pre-wrap}
  .hint{font-size:11px;color:var(--mut)}
  .dash{background:var(--bg);color:#d7e0ff;padding:12px;border-radius:10px;max-height:240px;overflow:auto;font-size:12px;margin-bottom:12px}
</style></head><body>
<header>
  <b>Soul-Restaurant · Bảng điều khiển</b>
  <span class="pill" id="count"></span>
  <span style="flex:1"></span>
  <label class="hint" style="color:#cbd5e1">Chế độ
    <select id="mode"><option value="demo">Demo (mock)</option><option value="live">Live (API thật)</option></select>
  </label>
  <input id="base" placeholder="/api/v1/soul-restaurant" size="26"/>
  <input id="token" placeholder="JWT (live)" size="16"/>
</header>
<div class="layout"><aside id="nav"></aside><main id="main"></main></div>
<script>`;

// ---- Browser app (KHÔNG dùng template literal ${} để tránh xung đột khi nhúng) ----
const APP = String.raw`
var $ = function(s){return document.querySelector(s)};
var state = { group: GROUPS[0] };
document.getElementById('count').textContent = CATALOG.length + ' năng lực · sống 100%';

// ---------- MOCK BACKEND (demo) ----------
var DB = {
  seq: 1,
  tables: [{name:'Bàn 1',area:'Tầng 1',status:'available',capacity:4},{name:'Bàn 5',area:'Tầng 1',status:'available',capacity:6},{name:'Bàn 8',area:'Sân vườn',status:'available',capacity:8}],
  menu: [{sku:'PHO-BO',name:'Phở bò',price:'45000',category:'Món chính',station:'Bếp nóng',has_options:true,sold_out:false},{sku:'TRA-DA',name:'Trà đá',price:'5000',category:'Đồ uống',station:'Bar',has_options:false,sold_out:false}],
  orders: {}, promos: [], customers: []
};
function money(n){return new Intl.NumberFormat('vi-VN').format(Math.round(n))+'₫'}
function findTable(t){return DB.tables.find(function(x){return x.name===t || x.name.replace(/\D/g,'')===String(t||'').replace(/\D/g,'')})}
function orderByRef(p){ if(p.order_code&&DB.orders[p.order_code])return DB.orders[p.order_code]; var t=p.table?findTable(p.table):null; if(t){for(var k in DB.orders){if(DB.orders[k].table===t.name&&DB.orders[k].status==='open')return DB.orders[k]}} return null }
function totals(o){ var sub=o.items.filter(function(i){return i.status!=='cancelled'}).reduce(function(s,i){return s+Number(i.price)*Number(i.qty)},0); var sc=Math.round(sub*0.05); var gross=sub+sc; var tax=Math.round(gross*8/108); return {subtotal:sub.toFixed(2),service_charge:sc.toFixed(2),tax_total:tax.toFixed(2),grand_total:gross.toFixed(2)} }

function mock(cap, p){
  var path = cap.path;
  if(path==='/restaurant/dashboard'){ var open=Object.keys(DB.orders).filter(function(k){return DB.orders[k].status==='open'}); return {open_orders:{total:open.length,orders:open.map(function(k){return {order_code:k,table:DB.orders[k].table,grand_total_fmt:money(Number(totals(DB.orders[k]).grand_total))}})},kitchen:{pending_kots:0,oldest_minutes:0,by_station:[]},today:{revenue_fmt:money(0),bills:0,orders:0},promotions:{active:DB.promos.length},customers:{total:DB.customers.length,top:DB.customers.slice(0,5).map(function(c){return {name:c.name,points:c.points_balance||'0.00'}})},generated_at:new Date().toISOString()} }
  if(path==='/restaurant/tables/map'){ var areas={}; DB.tables.forEach(function(t){(areas[t.area]=areas[t.area]||[]).push(t)}); return {areas:Object.keys(areas).map(function(a){return {area:a,tables:areas[a]}}),counts:{total:DB.tables.length,available:DB.tables.filter(function(t){return t.status==='available'}).length}} }
  if(path==='/restaurant/tables'&&cap.method==='POST'){ var ex=findTable(p.name); if(!ex){DB.tables.push({name:p.name,area:p.area||'Chung',status:'available',capacity:Number(p.capacity)||4})} return {table:p.name,area:p.area||'Chung',created:!ex} }
  if(path==='/restaurant/menu'&&cap.method==='GET'){ var q=(p.query||'').toLowerCase(); return {total:DB.menu.length,items:DB.menu.filter(function(m){return !q||m.name.toLowerCase().indexOf(q)>=0})} }
  if(path==='/restaurant/menu'&&cap.method==='POST'){ var e=DB.menu.find(function(m){return m.name===p.name}); if(!e){DB.menu.push({sku:p.sku||p.name,name:p.name,price:p.price,category:p.category||'',station:p.station||'',has_options:!!p.options,sold_out:false})} return {name:p.name,price:p.price,kind:p.combo_items?'combo':'item',created:!e} }
  if(path==='/restaurant/orders/open'){ var t=p.table?findTable(p.table):null; var code='DH-'+String(1000+(DB.seq++)); DB.orders[code]={code:code,table:t?t.name:null,type:p.type||'dine_in',status:'open',items:[]}; if(t)t.status='occupied'; return {order_code:code,table:t?t.name:null} }
  if(path==='/restaurant/orders/items'){ var o=orderByRef(p); if(!o)return {__err:'ORDER_NOT_FOUND'}; var items=Array.isArray(p.items)?p.items:[]; items.forEach(function(it){ var m=DB.menu.find(function(x){return x.name===it.name||x.sku===it.name})||{price:'0',name:it.name}; o.items.push({name:m.name,price:m.price,qty:it.qty||'1',status:'pending',course:it.course||1}) }); return {added:o.items.slice(-items.length).map(function(i){return {name:i.name,line_total:(Number(i.price)*Number(i.qty)).toFixed(2)}}),totals:totals(o)} }
  if(path==='/restaurant/orders/view'){ var o2=orderByRef(p); if(!o2)return {__err:'ORDER_NOT_FOUND'}; return {order_code:o2.code,table:o2.table,items:o2.items,totals:totals(o2)} }
  if(path==='/restaurant/orders/open-list'){ var ks=Object.keys(DB.orders).filter(function(k){return DB.orders[k].status==='open'}); return {total:ks.length,orders:ks.map(function(k){return {order_code:k,table:DB.orders[k].table,items_count:DB.orders[k].items.length,grand_total_fmt:money(Number(totals(DB.orders[k]).grand_total))}})} }
  if(path==='/restaurant/orders/send-kitchen'||path==='/restaurant/orders/fire-course'){ var o3=orderByRef(p); if(!o3)return {__err:'ORDER_NOT_FOUND'}; var pend=o3.items.filter(function(i){return i.status==='pending'&&(path.indexOf('fire')<0||i.course===Number(p.course))}); pend.forEach(function(i){i.status='sent'}); return {order_code:o3.code,course:p.course,kots:[{kot_code:'KOT-'+(DB.seq++),station:'Bếp nóng',items:pend.map(function(i){return {name:i.name,qty:i.qty}})}]} }
  if(path==='/restaurant/bills/pay'){ var o4=orderByRef(p); if(!o4)return {__err:'ORDER_NOT_FOUND'}; var g=Number(totals(o4).grand_total); var m=p.method||'cash'; var tender=p.amount?Number(p.amount):g; var applied=Math.min(tender,g); o4.status='paid'; if(o4.table){var tt=findTable(o4.table); if(tt)tt.status='available'} return {bill_code:'BILL-'+(DB.seq++),applied:applied.toFixed(2),applied_fmt:money(applied),change_fmt:money(Math.max(0,tender-applied)),bill_status:'paid',order_closed:true,loyalty:{redeemed:m==='points'?applied.toFixed(2):'0.00',earned:'0.00',customer_linked:!!p.customer_phone}} }
  if(path==='/restaurant/promotions'&&cap.method==='POST'){ DB.promos.push({code:p.code||null,name:p.name,discount_type:p.discount_type,value:p.value,used_count:0,active:true}); return {promo_id:'promo-'+(DB.seq++),code:p.code||null,name:p.name,discount_type:p.discount_type,value:p.value,created:true} }
  if(path==='/restaurant/promotions'&&cap.method==='GET'){ return {total:DB.promos.length,promos:DB.promos} }
  if(path==='/restaurant/promotions/apply'){ return {order_code:(orderByRef(p)||{code:'?'}).code,removed:!!p.remove,code:p.code,discount_amount_fmt:money(0),totals:{grand_total:'—'}} }
  if(path==='/restaurant/customers'&&cap.method==='POST'){ var c=DB.customers.find(function(x){return x.phone===p.phone}); if(!c){c={phone:p.phone,name:p.name||p.phone,points_balance:'0.00',visits:0};DB.customers.push(c)} return {customer_id:'cus-'+(DB.seq++),phone:p.phone,name:c.name,created:!c.__old,points_balance:c.points_balance,visits:c.visits} }
  if(path==='/restaurant/customers'&&cap.method==='GET'){ return {total:DB.customers.length,customers:DB.customers} }
  if(path==='/restaurant/customers/lookup'){ var cc=DB.customers.find(function(x){return x.phone===p.phone}); return cc?{found:true,customer:{customer_id:'cus',phone:cc.phone,name:cc.name,tier:'regular',points_balance:cc.points_balance,points_balance_fmt:money(Number(cc.points_balance)),visits:cc.visits},recent_orders:[]}:{found:false,recent_orders:[]} }
  if(path==='/restaurant/settings'&&cap.method==='GET'){ return {service_charge_pct:'5.00',tax_pct:'8.00',price_includes_tax:true,deduct_on:'paid',loyalty_enabled:false} }
  // mặc định: echo hành động (demo vẫn "sống")
  return {ok:true,demo:true,action:cap.tool,received:p,message:'(demo) đã nhận lệnh '+cap.label};
}

function callApi(cap, params, cb){
  var mode = $('#mode').value;
  if(mode==='demo'){ var r = mock(cap, params); if(r&&r.__err){cb({ok:false,status:422,error:{code:r.__err}})} else {cb({ok:true,status:200,data:r})} return; }
  var base = ($('#base').value||'/api/v1/soul-restaurant').replace(/\/$/,'');
  var rel = cap.path.replace(/^\/restaurant/,''); var url = base+rel;
  var opt = { method: cap.method, headers: {'Content-Type':'application/json'} };
  var tok = $('#token').value; if(tok) opt.headers['Authorization']='Bearer '+tok;
  if(cap.method==='GET'){ var qs=[]; for(var k in params){ if(params[k]!==undefined&&params[k]!=='') qs.push(encodeURIComponent(k)+'='+encodeURIComponent(params[k])) } if(qs.length)url+='?'+qs.join('&'); }
  else { opt.body = JSON.stringify(params); }
  fetch(url,opt).then(function(res){return res.json().then(function(b){return {res:res,b:b}})})
    .then(function(x){ cb(x.res.ok?{ok:true,status:x.res.status,data:x.b}:{ok:false,status:x.res.status,error:(x.b&&x.b.error)||x.b}) })
    .catch(function(e){ cb({ok:false,status:0,error:{message:String(e)}}) });
}

function coerce(f, raw){ if(raw===''||raw==null)return undefined; if(f.type==='number')return Number(raw); if(f.type==='bool')return raw==='true'; if(f.type==='json'){try{return JSON.parse(raw)}catch(e){return raw}} return raw; }

function card(cap){
  var el = document.createElement('div'); el.className='card';
  var top = document.createElement('div'); top.className='top';
  top.innerHTML = '<strong>'+cap.label+'</strong><span class="meta '+(cap.kind==='action'?'act':'read')+'">'+cap.method+' · '+cap.tool+(cap.sensitive?' · 🔒':'')+'</span>';
  el.appendChild(top);
  var fields = document.createElement('div'); fields.className='fields'; var inputs={};
  cap.fields.forEach(function(f){
    var lab=document.createElement('label'); var span=document.createElement('span'); span.textContent=f.label+(f.required?' *':''); lab.appendChild(span); var inp;
    if(f.type==='select'){ inp=document.createElement('select'); inp.innerHTML='<option value="">—</option>'+(f.options||[]).map(function(o){return '<option>'+o+'</option>'}).join(''); }
    else if(f.type==='bool'){ inp=document.createElement('select'); inp.innerHTML='<option value="">—</option><option value="true">Có</option><option value="false">Không</option>'; }
    else if(f.type==='json'||f.type==='textarea'){ inp=document.createElement('textarea'); inp.rows=2; }
    else { inp=document.createElement('input'); inp.type=f.type==='number'?'number':'text'; }
    inputs[f.name]=inp; lab.appendChild(inp); fields.appendChild(lab);
  });
  el.appendChild(fields);
  var out=document.createElement('pre'); out.className='out'; out.style.display='none';
  function collect(){ var p={}; cap.fields.forEach(function(f){var v=coerce(f,inputs[f.name].value); if(v!==undefined)p[f.name]=v}); return p; }
  function show(r){ out.style.display='block'; out.textContent=JSON.stringify(r,null,2); }
  var bar=document.createElement('div');
  if(cap.sensitive){
    var prep=document.createElement('button'); prep.className='run'; prep.textContent='Chuẩn bị…';
    prep.onclick=function(){ bar.innerHTML=''; var ok=document.createElement('button'); ok.className='run warn'; ok.textContent='Xác nhận chạy'; var no=document.createElement('button'); no.className='run ghost'; no.textContent='Hủy'; no.style.marginLeft='6px';
      ok.onclick=function(){ var p=collect(); p.confirm=true; callApi(cap,p,show); }; no.onclick=function(){ render(); }; bar.appendChild(ok); bar.appendChild(no); };
    bar.appendChild(prep);
  } else {
    var run=document.createElement('button'); run.className='run'; run.textContent='Chạy'; run.onclick=function(){ callApi(cap,collect(),show) }; bar.appendChild(run);
  }
  el.appendChild(bar); el.appendChild(out); return el;
}

function render(){
  var nav=$('#nav'); nav.innerHTML='';
  GROUPS.forEach(function(g){ var b=document.createElement('button'); b.textContent=g; if(g===state.group)b.className='on'; b.onclick=function(){state.group=g;render()}; nav.appendChild(b); });
  var main=$('#main'); main.innerHTML='';
  if(state.group==='Bảng điều khiển'){ var d=document.createElement('pre'); d.className='dash'; d.textContent='Đang tải tổng quan…'; main.appendChild(d);
    callApi({method:'GET',path:'/restaurant/dashboard'},{},function(r){ d.textContent=JSON.stringify(r.data||r.error,null,2) }); }
  var grid=document.createElement('div'); grid.className='grid';
  CATALOG.filter(function(c){return c.group===state.group}).forEach(function(c){ grid.appendChild(card(c)) });
  main.appendChild(grid);
}
render();
`;

const TAIL = `</script></body></html>`;

const html = HEAD
  + 'const CATALOG = ' + JSON.stringify(restoUiCatalog) + ';\n'
  + 'const GROUPS = ' + JSON.stringify([...UI_GROUPS]) + ';\n'
  + APP + '\n' + TAIL;

writeFileSync(join(root, 'web', 'soul-restaurant-console.html'), html, 'utf8');
console.log('Generated web/soul-restaurant-console.html (' + restoUiCatalog.length + ' capabilities) + web/capabilities.json');
