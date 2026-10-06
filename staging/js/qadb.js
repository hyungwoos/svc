/* ===== qadb.js — «저장하면 실제로 바뀌는» 가짜 DB (㊿+157 · 데이터 입력·수정 점검용) =====
   · 스테이징 QA 의 «데이터 입력·수정» 단계(?qa=data · js/qadata.js)와 tests/fakedb.mjs(smoke)가 같이 씀 — 운영 DB 에는 절대 닿지 않음
   · 메모리 안의 표 + PostgREST 흉내: select · 필터(eq/neq/gt/gte/lt/lte/in/is/like/ilike/not · or=()) · order · limit/offset · count=exact ·
     POST(여러 행 · on_conflict + resolution=merge-duplicates · return=representation) · PATCH · DELETE · rpc/load_all(표에서 바로 만듦)
   · 계약을 지우면 그 계약의 월 매출도 지움(DB 의 ON DELETE CASCADE 와 같게) · 고유 키(시리얼 등)는 23505 로 거절
   · 데이터는 전부 가짜(가상고객…) — 날짜는 «이번 달» 기준으로 만들어 언제 돌려도 같은 모양
   · 이 파일은 다른 포탈 파일을 import 하지 않음 (Node 의 smoke 테스트도 그대로 씀) */
var QA_UNIQ={ equipment_assets:[['serial']], monthly_targets:[['year','month']], user_perms:[['email','view']], upd_notify:[['email']], mx_memos:[['line','year','month']],
  cloud_invoices:[['ym','account_id']], code_lists:[['kind','value']], monthly_revenue:[['contract_id','month']], targets:[['year']] };
var QA_NOID={ user_roles:1, targets:1, monthly_targets:1, upd_ack:1, upd_notify:1, user_perms:1, code_lists:1, weekly_meta:1 };
var QA_RESERVED={ select:1, order:1, limit:1, offset:1, on_conflict:1, columns:1 };
function qaClone(x){ return JSON.parse(JSON.stringify(x)); }
/* 월 인덱스(2020-06 = 0 · 포탈 dIdx 와 같음) ↔ 'YYYY-MM-01' */
export function qaIdx(s){ return (+String(s).slice(0,4)-2020)*12 + (+String(s).slice(5,7)-6); }
export function qaYm(i){ var t=2020*12+5+i; return Math.floor(t/12)+'-'+String((t%12)+1).padStart(2,'0')+'-01'; }
export function qaNow(d){ d=d||new Date(); return (d.getFullYear()-2020)*12 + (d.getMonth()+1-6); }

function qaVal(v){ if(v==='null') return null; if(v==='true') return true; if(v==='false') return false; return v; }
function qaCmp(a, b){   /* 숫자끼리는 숫자로 · 그 밖은 글자로 */
  if(a==null || b==null) return a==null && b==null? 0 : a==null? -1 : 1;
  var na=typeof a==='number' || (typeof a==='string' && a!=='' && !isNaN(+a) && !/^\d{4}-/.test(a));
  var nb=typeof b==='number' || (typeof b==='string' && b!=='' && !isNaN(+b) && !/^\d{4}-/.test(b));
  if(na && nb) return (+a)-(+b);
  return String(a)<String(b)? -1 : String(a)>String(b)? 1 : 0;
}
function qaSplit(s){ var out=[], d=0, cur='', q=false; for(var i=0;i<s.length;i++){ var ch=s[i]; if(ch==='"') q=!q; if(!q && ch==='(') d++; if(!q && ch===')') d--; if(!q && d===0 && ch===','){ out.push(cur); cur=''; } else cur+=ch; } if(cur) out.push(cur); return out; }
function qaLike(p, ci){ return new RegExp('^'+p.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/[*%]/g,'.*')+'$', ci? 'i':''); }
function qaTest1(v, opv){   /* 'op.val' 하나 */
  var not=false; if(opv.indexOf('not.')===0){ not=true; opv=opv.slice(4); }
  var k=opv.indexOf('.'), op=opv.slice(0,k), raw=opv.slice(k+1), r=false;
  if(op==='eq') r=v!=null && qaCmp(v, qaVal(raw))===0;
  else if(op==='neq') r=v!=null && qaCmp(v, qaVal(raw))!==0;
  else if(op==='gt') r=v!=null && qaCmp(v, raw)>0;
  else if(op==='gte') r=v!=null && qaCmp(v, raw)>=0;
  else if(op==='lt') r=v!=null && qaCmp(v, raw)<0;
  else if(op==='lte') r=v!=null && qaCmp(v, raw)<=0;
  else if(op==='is') r=raw==='null'? v==null : raw==='true'? v===true : raw==='false'? v===false : false;
  else if(op==='in'){ var items=qaSplit(raw.replace(/^\(|\)$/g,'')).map(function(x){ return qaVal(x.replace(/^"|"$/g,'')); }); r=v!=null && items.some(function(x){ return qaCmp(v, x)===0; }); }
  else if(op==='like' || op==='ilike') r=v!=null && qaLike(raw, op==='ilike').test(String(v));
  else throw new Error('가짜 DB: 모르는 연산자 '+op);
  return not? !r : r;
}
function qaPart(row, p){ var i=p.indexOf('.'); return qaTest1(row[p.slice(0,i)], p.slice(i+1)); }
function qaOr(row, expr){ return qaSplit(expr.replace(/^\(|\)$/g,'')).some(function(part){ return part.indexOf('and(')===0? qaSplit(part.slice(4,-1)).every(function(p){ return qaPart(row, p); }) : qaPart(row, part); }); }
function qaFilter(rows, sp){
  var fs=[]; sp.forEach(function(v, k){ if(QA_RESERVED[k]) return; if(k==='or') fs.push(function(r){ return qaOr(r, v); }); else if(k==='and') fs.push(function(r){ return qaSplit(v.replace(/^\(|\)$/g,'')).every(function(p){ return qaPart(r, p); }); }); else fs.push(function(r){ return qaTest1(r[k], v); }); });
  return rows.filter(function(r){ return fs.every(function(f){ return f(r); }); });
}
function qaOrder(rows, ord){
  if(!ord) return rows;
  var keys=ord.split(',').map(function(x){ var p=x.split('.'); return {c:p[0], desc:p[1]==='desc'}; });
  return rows.slice().sort(function(a, b){ for(var i=0;i<keys.length;i++){ var r=qaCmp(a[keys[i].c], b[keys[i].c]); if(r) return keys[i].desc? -r : r; } return 0; });
}
function qaProject(rows, sel){
  if(!sel || /\*/.test(sel)) return rows.map(qaClone);
  var cols=qaSplit(sel).map(function(c){ return c.trim(); }).filter(function(c){ return c && c.indexOf('(')<0; });
  return rows.map(function(r){ var o={}; cols.forEach(function(c){ var p=c.split(':'), src=p.length>1? p[1]:p[0], al=p[0]; o[al]=r[src]===undefined? null : qaClone(r[src]); }); return o; });
}
/** 가짜 DB 하나 — seed = {표 이름: 행 배열} · t = 표들(직접 들여다봄) · writes = 쓰기 기록 · handle() = PostgREST 요청 하나 처리 */
export function qaDb(seed){
  var db={t:{}, seq:{}, writes:[], calls:[], rpc:{}, fail:null};
  Object.keys(seed||{}).forEach(function(k){ db.t[k]=qaClone(seed[k]); });
  db.table=function(n){ return (db.t[n]=db.t[n]||[]); };
  db.nextId=function(n){ if(db.seq[n]==null) db.seq[n]=db.table(n).reduce(function(m, r){ return Math.max(m, +r.id||0); }, 0); return ++db.seq[n]; };
  db.mrsegs=function(){   /* 계약별 월 매출 → [계약, 시작월, 끝월, 금액] 연속 구간 (load_all 의 mrsegs 와 같은 압축) */
    var by={}; db.table('monthly_revenue').forEach(function(r){ (by[r.contract_id]=by[r.contract_id]||[]).push(r); });
    var out=[]; Object.keys(by).map(Number).sort(function(a, b){ return a-b; }).forEach(function(cid){
      var cur=null; by[cid].slice().sort(function(a, b){ return a.month<b.month? -1 : 1; }).forEach(function(r){ var i=qaIdx(r.month), v=Number(r.amount);
        if(cur && cur[3]===v && qaIdx(cur[2])===i-1) cur[2]=r.month; else { if(cur) out.push(cur); cur=[cid, r.month, r.month, v]; } });
      if(cur) out.push(cur); });
    return out;
  };
  db.loadAll=function(role){
    var T=function(n, o){ return qaOrder(db.table(n), o).map(qaClone); };
    return {customers:T('customers','id'), contracts:T('contracts','id'), mrsegs:db.mrsegs(), live:T('live_customers','id'), lg:T('lg_sales','id'), biz:T('biz_recon','id'),
      targets:T('targets','year'), orders:T('equipment_orders','id.desc'), roles:[{role:role}], assets:T('equipment_assets','serial'), mdrpoc:[], mtargets:T('monthly_targets','year,month'),
      oi:T('oi_deals','id.desc'), mdrops:T('mdr_ops','id'), iadj:T('install_adj','year,month'), s1map:T('s1_map','contract_no'), iextra:T('install_extra','year,month,id')};
  };
  db.uniqHit=function(n, row, except){
    var L=QA_UNIQ[n]||[];
    for(var i=0;i<L.length;i++){ var cols=L[i]; if(cols.some(function(c){ return row[c]==null; })) continue;
      var hit=db.table(n).filter(function(x){ return x!==except && cols.every(function(c){ return qaCmp(x[c], row[c])===0; }); })[0]; if(hit) return {cols:cols, hit:hit}; }
    return null;
  };
  db.handle=function(method, url, prefer, bodyText, role){   /* → {status, headers, body(글자)} · REST 가 아니면 null */
    var u=new URL(url), m=/\/rest\/v1\/(.+)$/.exec(u.pathname); if(!m) return null;
    var name=decodeURIComponent(m[1]), sp=u.searchParams, pref=String(prefer||''), body=bodyText? JSON.parse(bodyText) : undefined;
    db.calls.push({method:method, name:name, q:u.search, body:body});
    if(db.fail && db.fail(method, name, body)) return {status:400, body:JSON.stringify({code:'P0001', message:'가짜 DB: 일부러 실패'})};
    if(name.indexOf('rpc/')===0){ var fn=name.slice(4);
      if(fn==='load_all') return {status:200, body:JSON.stringify(db.loadAll(role||'super_admin'))};
      if(db.rpc[fn]){ db.writes.push({method:'RPC', table:fn, body:body}); return {status:200, body:JSON.stringify(db.rpc[fn](body||{}, db))}; }
      return {status:200, body:'null'}; }
    var rows=db.table(name), sel=sp.get('select');
    if(method==='GET' || method==='HEAD'){
      var r=qaOrder(qaFilter(rows, sp), sp.get('order')), total=r.length, off=+(sp.get('offset')||0), lim=sp.get('limit')!=null? +sp.get('limit') : null;
      r=r.slice(off, lim==null? undefined : off+lim);
      return {status:200, headers:{'content-range':(r.length? off+'-'+(off+r.length-1) : '*')+'/'+(/count=exact/.test(pref)? total : '*')}, body:JSON.stringify(qaProject(r, sel))};
    }
    var rep=/return=representation/.test(pref);
    if(method==='POST'){
      var list=Array.isArray(body)? body : [body], merge=/resolution=merge-duplicates/.test(pref), conf=(sp.get('on_conflict')||'').split(',').filter(Boolean), out=[];
      for(var i=0;i<list.length;i++){ var b=qaClone(list[i]), target=null;
        if(merge){ var cc=conf.length? conf : ['id']; if(cc.every(function(c){ return b[c]!=null; })) target=rows.filter(function(x){ return cc.every(function(c){ return qaCmp(x[c], b[c])===0; }); })[0]||null; }
        if(target){ Object.assign(target, b); out.push(target); db.writes.push({method:'UPSERT', table:name, body:b}); continue; }
        if(!QA_NOID[name] && b.id==null) b.id=db.nextId(name);
        if(!('created_at' in b) && name!=='monthly_revenue') b.created_at=new Date().toISOString();
        var dup=db.uniqHit(name, b); if(dup) return {status:409, body:JSON.stringify({code:'23505', message:'duplicate key value violates unique constraint ('+dup.cols.join(',')+')'})};
        rows.push(b); out.push(b); db.writes.push({method:'POST', table:name, body:b}); }
      return {status:201, body:rep? JSON.stringify(qaProject(out, sel)) : ''};
    }
    if(method==='PATCH'){
      var hit=qaFilter(rows, sp);
      for(var j=0;j<hit.length;j++){ var dp=db.uniqHit(name, Object.assign({}, hit[j], body), hit[j]); if(dp) return {status:409, body:JSON.stringify({code:'23505', message:'duplicate key ('+dp.cols.join(',')+')'})}; }
      hit.forEach(function(x){ Object.assign(x, qaClone(body)); db.writes.push({method:'PATCH', table:name, id:x.id, body:body}); });
      return {status:rep? 200 : 204, body:rep? JSON.stringify(qaProject(hit, sel)) : ''};
    }
    if(method==='DELETE'){
      var gone=qaFilter(rows, sp); db.t[name]=rows.filter(function(x){ return gone.indexOf(x)<0; });
      if(name==='contracts'){ var ids=gone.map(function(x){ return x.id; }); db.t.monthly_revenue=db.table('monthly_revenue').filter(function(x){ return ids.indexOf(x.contract_id)<0; }); }
      gone.forEach(function(x){ db.writes.push({method:'DELETE', table:name, id:x.id, row:x}); });
      return {status:rep? 200 : 204, body:rep? JSON.stringify(gone) : ''};
    }
    return {status:405, body:'{}'};
  };
  /* 검사 도우미 — 계약 하나의 월 매출 {'YYYY-MM':금액} · 어떤 달의 전체 합 · 계약 행 · 고객사 이름으로 계약들 */
  db.rev=function(cid){ var o={}; db.table('monthly_revenue').filter(function(r){ return r.contract_id===cid; }).sort(function(a, b){ return a.month<b.month? -1 : 1; }).forEach(function(r){ o[String(r.month).slice(0,7)]=Number(r.amount); }); return o; };
  db.monthSum=function(ym){ return db.table('monthly_revenue').filter(function(r){ return String(r.month).slice(0,7)===ym; }).reduce(function(a, r){ return a+Number(r.amount); }, 0); };
  db.ct=function(id){ return db.table('contracts').filter(function(c){ return c.id===id; })[0]; };
  db.byCust=function(name){ var cu=db.table('customers').filter(function(c){ return c.name===name; })[0]; return cu? db.table('contracts').filter(function(c){ return c.customer_id===cu.id; }) : []; };
  return db;
}

/** 가짜 데이터 — «이번 달(T)» 기준 · 이름은 전부 가상(가상고객…) */
export function qaSeed(d){
  var T=qaNow(d), customers=[], contracts=[], mr=[];
  var cust=function(name, industry, sector){ var id=customers.length+1; customers.push({id:id, name:name, industry:industry||'기업', sector:sector||'IT·소프트웨어', aliases:[]}); return id; };
  var ct=function(o){
    var c=Object.assign({partner:'직접(계산서)', biller:null, contract_type:'신규', status:'신규', channel:'일반', billing:'월납입', install_fee:null, settle_month:null, renew_count:0, renew_history:[], auto_renew:false,
      parent_contract_id:null, qty:100, version:'V6.0', combine:null, csm:null, s1_no:null, live_override:null, churn_reason:null, churn_month:null, note:null, lead_src:null}, o);
    c.id=900+contracts.length; c.start_month=qaYm(o.s); c.end_month=o.e==null? null : qaYm(o.e); c.term_months=o.e==null? null : o.e-o.s+1; c.total_amount=o.e==null? null : o.mrr*(o.e-o.s+1);
    var to=o.revTo!=null? o.revTo : (o.e==null? T+12 : o.e); for(var i=o.s;i<=to;i++) mr.push({contract_id:c.id, month:qaYm(i), amount:o.mrr});
    delete c.s; delete c.e; delete c.revTo; contracts.push(c); return c.id; };
  /* 만기 지남(미처리) — 2026-10 실제 사고와 같은 모양: 12개월 · 월 30만원 · 지난달 종료 */
  ct({customer_id:cust('가상고객_만기지남'), line:'Cloud', s:T-12, e:T-1, mrr:300000, qty:50});
  ct({customer_id:cust('가상고객_이달만기'), line:'Cloud', s:T-11, e:T, mrr:500000});
  ct({customer_id:cust('가상고객_다음달만기','공공','공공·행정'), line:'Cloud', channel:'조달', s:T-23, e:T+1, mrr:820000});
  ct({customer_id:cust('가상고객_에스원','기업','금융·보험'), line:'S1', channel:'에스원', biller:'에스원', s:T-6, e:T+17, mrr:1200000, install_fee:2000000, settle_month:qaYm(T-5), s1_no:'S1-0001'});
  var mdrCu=cust('가상고객_MDR'), mdr=ct({customer_id:mdrCu, line:'MDR', s:T-24, e:T+12, mrr:2000000});
  ct({customer_id:mdrCu, line:'MDR', contract_type:'추가', status:'추가', parent_contract_id:mdr, s:T-3, e:T+12, mrr:150000, note:'노드 추가 +20'});
  ct({customer_id:cust('가상고객_해지'), line:'Cloud', s:T-14, e:T-3, mrr:400000, status:'해지', churn_reason:'비용이슈', churn_month:qaYm(T-3)});
  ct({customer_id:cust('가상고객_자동연장'), line:'Cloud', s:T-30, e:T-2, mrr:250000, auto_renew:true, revTo:T+2});
  ct({customer_id:cust('가상고객_예정'), line:'Cloud', s:T+2, e:T+13, mrr:600000});
  ct({customer_id:cust('가상고객_LGU','기업','유통·소비재'), line:'Cloud', channel:'LGU+', s:T-8, e:T+4, mrr:330000});
  for(var k=1;k<=16;k++) ct({customer_id:cust('가상고객'+String(k).padStart(2,'0')), line:k%4===0? 'MDR':'Cloud', channel:k%3===0? '유통':'일반', partner:k%3===0? '다원티에스':'직접(계산서)', s:T-20+k, e:T+4+k, mrr:100000*(1+(k%7))+15000*k});
  var inst=qaYm(T-8).slice(0,8)+'10';
  var orders=[
    {id:300, channel:'LGU+', order_type:'신규발주', customer:'가상고객_LGU', model:'S100', qty:2, serials:'TST0000001, TST0000002', status:'설치완료', install_date:inst, created_at:qaYm(T-8)+'T00:00:00', returned_date:null, returned_serials:null, request_note:''},
    {id:301, channel:'일반', order_type:'신규발주', customer:'가상고객01', model:'S200', qty:1, serials:'', status:'접수', install_date:null, created_at:qaYm(T)+'T00:00:00', returned_date:null, returned_serials:null, request_note:''}];
  var assets=[
    {id:1, serial:'TST0000001', model:'S100', usage:'임대', status:'임대중', customer:'가상고객_LGU', channel:'LGU+', order_id:300, deployed_date:inst, returned_date:null, note:null},
    {id:2, serial:'TST0000002', model:'S100', usage:'임대', status:'임대중', customer:'가상고객_LGU', channel:'LGU+', order_id:300, deployed_date:inst, returned_date:null, note:null},
    {id:3, serial:'TST0000099', model:'S100', usage:'재고', status:'재고', customer:null, channel:null, order_id:null, deployed_date:null, returned_date:null, note:null},
    {id:4, serial:'미등록-301-1', model:'S200', usage:'임대', status:'재고', customer:'가상고객01', channel:'일반', order_id:301, deployed_date:null, returned_date:null, note:null}];
  var y=+qaYm(T).slice(0,4), mt=[]; for(var m=1;m<=12;m++) mt.push({year:y, month:m, amount:90000000+(m-1)*1000000});
  return {customers:customers, contracts:contracts, monthly_revenue:mr, equipment_orders:orders, equipment_assets:assets,
    oi_deals:[{id:1, customer:'가상고객_OI', stage:'제안', prob:30, amount:12000000, expect_amount:1000000, line:'Cloud', owner:'담당자A', created_at:qaYm(T-1), expected_month:qaYm(T+1)}],
    mdr_ops:[{id:1, customer:'가상고객_PoC', kind:'PoC', status:'진행', start_date:qaYm(T-1), end_date:qaYm(T+1), created_at:qaYm(T-1)}],
    targets:[{year:y, amount:1200000000}], monthly_targets:mt,
    live_customers:[], lg_sales:[], biz_recon:[], install_adj:[], s1_map:[], install_extra:[], change_log:[], user_roles:[{role:'super_admin'}]};
}
