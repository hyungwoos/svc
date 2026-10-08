/* ===== qadata.js — 스테이징 QA «데이터 입력·수정» 단계 (㊿+157 · 사용자: «QA에 지금 이 검증도 추가해줘») =====
   · 주소에 ?qa=data 를 붙여 열면(스테이징 QA 가 iframe 으로) 포탈이 «가짜 DB»(js/qadb.js)로만 동작 — Supabase 로 가는 요청을 전부 가로채
     메모리 안의 표에 저장합니다. 로그인·세션·브라우저 저장소도 이 창 안에서만(운영 데이터·다른 탭의 로그인에 닿지 않음)
   · qaDataList() = 시나리오 이름 · qaDataRun(i) = i번째를 «사람처럼» 실행(칸 채우기 → 저장 → 가짜 DB 값(원) · 다시 읽은 화면 · 합계 대조)
     → {ok, detail, diag[]} · 시나리오마다 가짜 DB 를 처음 상태로 되돌림(qaDataReset)
   · 시나리오는 이 버전의 코드와 같이 있음 — 운영 포탈의 QA 가 스테이징의 이 파일을 불러 쓰므로 «올린 버전의 규칙»으로 점검 */
import { IS_QA_DATA, ST } from './state.js';
import { SB_URL } from './core.js';
import { qaDb, qaSeed, qaNow, qaYm, qaIdx } from './qadb.js';
import { loadFromDb, onData, ccAnalysisOpen } from './shell.js';
import { dcFixOpen, dcRules, liveCalc, openRenewList, openTargetEditor } from './analysis.js';
import { navMenu, switchView } from './grid.js';
import { GRIDS } from './grids.js';
import { openPaste, pasteCols } from './tools.js';

/** 지금 쓰는 가짜 DB (스테이징 QA 가 들여다봄 · ?qa=data 일 때만) */
export var QADB=null;
export var QA_DATA_MSG='';
var QA_EMAIL='qa@fake.local';
function qaMemStore(){ var m={}; return {getItem:function(k){ return Object.prototype.hasOwnProperty.call(m, k)? m[k] : null; }, setItem:function(k, v){ m[k]=String(v); }, removeItem:function(k){ delete m[k]; },
  clear:function(){ m={}; }, key:function(i){ return Object.keys(m)[i]||null; }, get length(){ return Object.keys(m).length; }}; }
function qaJson(status, o){ return new Response(status===204? null : JSON.stringify(o), {status:status, headers:{'Content-Type':'application/json'}}); }
function qaRespond(u, init){
  var m=String((init&&init.method)||'GET').toUpperCase(), h=(init&&init.headers)||{}, pref=h.Prefer||h.prefer||'', body=init&&init.body!=null? String(init.body) : null;
  if(u.indexOf('/auth/v1/user')>=0) return qaJson(200, {id:'qa', email:QA_EMAIL, user_metadata:{pw_changed:true}, factors:[]});
  if(u.indexOf('/auth/v1/token')>=0) return qaJson(200, {access_token:'qa-fake', refresh_token:'qa-fake-r', expires_in:86400, user:{id:'qa', email:QA_EMAIL, user_metadata:{pw_changed:true}}});
  if(u.indexOf('/auth/v1/')>=0) return qaJson(200, {});
  if(u.indexOf('/functions/v1/')>=0) return qaJson(200, {ok:true, text:'(QA 가짜 DB — 함수는 부르지 않음)', queries:[], mode:'ping'});
  if(u.indexOf('/storage/v1/')>=0) return qaJson(404, {message:'QA 가짜 DB'});
  var r=QADB? QADB.handle(m, u, pref, body, 'super_admin') : null;
  if(!r) return qaJson(404, {message:'QA 가짜 DB: 모르는 주소'});
  return new Response(r.status===204? null : r.body, {status:r.status, headers:Object.assign({'Content-Type':'application/json'}, r.headers||{})});
}
/** ?qa=data 일 때 main.js 가 start() 전에 부름 — 저장소 분리 · 가짜 세션 · Supabase 요청 가로채기 · 안내 띠 */
export function qaDataInstall(){
  if(!IS_QA_DATA) return false;
  try{ Object.defineProperty(window, 'sessionStorage', {value:qaMemStore(), configurable:true}); Object.defineProperty(window, 'localStorage', {value:qaMemStore(), configurable:true}); }catch(e){}
  var iso=false; try{ iso=window.sessionStorage.getItem('svc_sess')===null && window.localStorage.getItem('svc_sess')===null; }catch(e){}
  if(!iso){ QA_DATA_MSG='이 브라우저에서는 저장소를 분리할 수 없어 «데이터 입력·수정» 점검을 건너뜁니다'; }
  QADB=qaDb(qaSeed(new Date()));
  var real=window.fetch.bind(window);
  window.fetch=function(input, init){ var u=typeof input==='string'? input : String((input && /** @type {any} */ (input).url)||''); if(u.indexOf(SB_URL)===0) return Promise.resolve(qaRespond(u, init||{})); return real(input, init); };
  if(iso) try{ window.sessionStorage.setItem('svc_sess', JSON.stringify({a:'qa-fake', r:'qa-fake-r', e:Math.floor(Date.now()/1000)+86400, u:QA_EMAIL, p:true})); }catch(e){}
  document.addEventListener('DOMContentLoaded', function(){ var b=document.createElement('div'); b.id='qaDataBar';
    b.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#6b21a8;color:#fff;font:12px/1.6 system-ui;padding:3px 10px;text-align:center;pointer-events:none';
    b.textContent='🧪 QA 가짜 데이터 — 여기서 저장한 것은 실제 DB 에 들어가지 않습니다'+(QA_DATA_MSG? ' · '+QA_DATA_MSG : ''); document.body.appendChild(b); });
  return iso;
}
/** 가짜 DB 를 처음 상태로 + 화면 다시 읽기 + 열린 창 닫기 */
export async function qaDataReset(){
  QADB=qaDb(qaSeed(new Date()));
  document.querySelectorAll('.ovl.on').forEach(function(o){ if(/^ovl(Target|DcFix)$/.test(o.id)) o.remove(); else o.classList.remove('on'); });
  try{ switchView('dash'); }catch(e){}
  var nd=await loadFromDb(); onData(nd);
  await qaPause(150);
}
function qaPause(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
/* 시나리오 도우미 — 칸 채우기 · 누르기 · 기다리기 · 확인 창 대답 · 표 ✎ */
function qaHelp(log){
  var h={
    T:qaNow(new Date()), ym:function(i){ return qaYm(i).slice(0,7); }, ix:qaIdx, sleep:qaPause,
    q:function(s){ return document.querySelector(s); },
    must:function(s){ var e=typeof s==='string'? document.querySelector(s) : s; if(!e) throw new Error('화면에 없음: '+s); return e; },
    fill:function(s, v){ var e=h.must(s); e.value=v; e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true})); },
    click:function(s){ h.must(s).click(); },
    ok:function(c, msg){ if(!c) throw new Error(msg); },
    until:async function(fn, ms, what){ var t0=Date.now(); while(Date.now()-t0<(ms||8000)){ try{ if(fn()) return true; }catch(e){} await qaPause(80); } throw new Error((what||'기다리던 화면')+' — '+((ms||8000)/1000)+'초 안에 안 됨'); },
    /* 확인 창(confirm) 대답 정하기 — policy(글자) → true(확인)/false(취소) · 없으면 전부 확인 */
    dlg:function(policy){ window.confirm=function(m){ log.push('확인 창: '+String(m).replace(/\s+/g,' ').slice(0,160)); return policy? !!policy(String(m)) : true; }; window.alert=function(m){ log.push('알림: '+String(m).slice(0,120)); }; window.prompt=function(){ return null; }; },
    asked:function(re){ return log.some(function(x){ return re.test(x); }); },
    sum:function(i){ return ST.DATA.rows.reduce(function(a, r){ return a+r.segs.reduce(function(b, sg){ return b+(sg[0]<=i && i<=sg[1]? sg[2] : 0); }, 0); }, 0); },
    live:function(i){ return liveCalc(i).uniq; },
    reload:async function(){ var nd=await loadFromDb(); onData(nd); await qaPause(150); },
    openEdit:async function(tab){ if(!document.querySelector('#ovlEdit.on')){ switchView('dash'); h.click('#btnEdit'); await qaPause(120); } h.click('#eTabs button[data-t="'+tab+'"]'); await qaPause(60); },
    pick:async function(find, pk, cust){ h.fill('#'+find, cust); await qaPause(80); h.click('#'+pk+' .pi'); await qaPause(60); },
    save:async function(){ h.click('#eGo'); await h.until(function(){ var m=document.getElementById('eMsg'); return m && /✅|bad/.test(m.textContent+' '+m.className) && !document.getElementById('eGo').disabled; }, 10000, '입력·수정 저장'); var m=document.getElementById('eMsg'); if(/bad/.test(m.className)) throw new Error('저장 실패: '+m.textContent); await qaPause(150); return m.textContent; },
    gridEdit:async function(view, cust, pairs){
      switchView(view); await qaPause(150); h.fill('#dvSearch', cust); await qaPause(250);
      var tr=[].slice.call(document.querySelectorAll('#dvTable tbody tr')).filter(function(x){ return x.textContent.indexOf(cust)>=0; })[0]; h.ok(tr, '표에 «'+cust+'» 행 없음');
      var be=[].slice.call(tr.querySelectorAll('button')).filter(function(b){ return b.textContent==='✎'; })[0]; h.ok(be, '✎ 버튼 없음'); be.click(); await qaPause(120);
      var ed=[].slice.call(document.querySelectorAll('#dvTable tbody tr')).filter(function(x){ return x.querySelector('button.sv'); })[0]; h.ok(ed, '수정 칸이 안 열림');
      var hs=[].slice.call(document.querySelectorAll('#dvTable thead th')).map(function(x){ return x.textContent.trim(); }), before={};
      pairs.forEach(function(p){ var k=hs.findIndex(function(x){ return x.indexOf(p[0])===0; }); h.ok(k>=0, '열 없음: '+p[0]); var el=ed.children[k].querySelector('input,select'); h.ok(el, '칸 없음: '+p[0]); before[p[0]]=el.value; h.fill(el, p[1]); });
      ed.querySelector('button.sv').click(); await qaPause(900); return before;
    }
  };
  return h;
}
/* ── 시나리오 (smoke 의 ㊿+157 블록과 같은 내용 — 여기 것은 브라우저 안에서 · 스테이징 QA 용) ── */
function qaScenarios(){
  return [
    {id:'renew', label:'만기 처리 › 연장 — «480» = 48만원 · «480000» 은 확인 창(취소 → 그대로)', run:async function(h, db){
      var c=db.byCust('가상고객_만기지남')[0]; h.dlg(function(m){ return !/단위입니다/.test(m); });
      openRenewList('lapsed'); await h.sleep(200); h.click('#rnList tr[data-id="'+c.id+'"] .cbtn[data-a="renew"]'); await h.sleep(100);
      h.ok(h.must('#rnMrr').value==='300', '미리 채운 값이 천원이 아님: '+h.must('#rnMrr').value);
      h.fill('#rnMrr', '480000'); h.fill('#rnEnd', h.ym(h.T+11)); h.click('#rnGo'); await h.sleep(500);
      h.ok(db.ct(c.id).mrr===300000 && h.asked(/1,600배/), '480000(원으로 착각)이 확인 없이 저장됨 — mrr '+db.ct(c.id).mrr);
      h.fill('#rnMrr', '480'); h.click('#rnGo'); await h.until(function(){ return db.ct(c.id).renew_count===1 && db.rev(c.id)[h.ym(h.T+11)]===480000; }, 6000, '연장 저장(계약 + 월 매출)');
      var rv=db.rev(c.id); h.ok(db.ct(c.id).mrr===480000 && rv[h.ym(h.T)]===480000 && rv[h.ym(h.T+11)]===480000, 'DB: mrr '+db.ct(c.id).mrr+' · '+h.ym(h.T)+' '+rv[h.ym(h.T)]);
      return '480 → 480,000원 × 12개월 · 480000 은 확인 창에서 막힘'; }},
    {id:'gridMrr', label:'계약 표 ✎ — MRR 칸(천원) 480 → 48만원 + 이번 달~종료월 월 매출 · 확인 창 취소 = 그대로', run:async function(h, db){
      var a=db.byCust('가상고객07')[0], m0=a.mrr; h.dlg(function(m){ return !/같이 맞춥니다/.test(m); });
      var b0=await h.gridEdit('contracts', '가상고객07', [['MRR', '999']]);
      h.ok(b0.MRR===String(m0/1000), 'MRR 칸이 천원이 아님: «'+b0.MRR+'»'); h.ok(db.ct(a.id).mrr===m0 && db.rev(a.id)[h.ym(h.T)]===m0, '취소했는데 바뀜');
      h.dlg(); var c=db.byCust('가상고객_이달만기')[0]; await h.gridEdit('contracts', '가상고객_이달만기', [['MRR', '480']]);
      await h.until(function(){ return db.rev(c.id)[h.ym(h.T)]===480000; }, 6000, '월 매출 맞춤');
      h.ok(db.ct(c.id).mrr===480000 && h.asked(/같이 맞춥니다/), 'DB mrr '+db.ct(c.id).mrr); return '취소 → 그대로 · 480 → 480,000원 + 이달 장표'; }},
    {id:'gridPeriod', label:'계약 표 ✎ — 종료월 당김·늘림 · 상태 해지 · 시작>종료 막음', run:async function(h, db){
      h.dlg(); var a=db.byCust('가상고객04')[0], ea=h.ix(a.end_month); await h.gridEdit('contracts', '가상고객04', [['종료월', h.ym(ea-3)]]);
      await h.until(function(){ return !Object.keys(db.rev(a.id)).some(function(k){ return k>h.ym(ea-3); }); }, 6000, '종료월 뒤 매출 삭제');
      var b=db.byCust('가상고객05')[0], eb=h.ix(b.end_month); await h.gridEdit('contracts', '가상고객05', [['종료월', h.ym(eb+6)]]);
      await h.until(function(){ return db.rev(b.id)[h.ym(eb+6)]===b.mrr; }, 6000, '늘린 달 채움');
      var c=db.byCust('가상고객06')[0]; await h.gridEdit('contracts', '가상고객06', [['상태', '해지'], ['해지월', h.ym(h.T)], ['해지사유', '비용이슈']]);
      await h.until(function(){ return db.ct(c.id).status==='해지' && !db.rev(c.id)[h.ym(h.T+1)]; }, 6000, '해지 뒤 매출 삭제');
      var d=db.byCust('가상고객09')[0], de=d.end_month; await h.gridEdit('contracts', '가상고객09', [['종료월', h.ym(h.ix(d.start_month)-2)]]);
      h.ok(db.ct(d.id).end_month===de, '시작월보다 앞선 종료월이 저장됨'); var cc=[].slice.call(document.querySelectorAll('#dvTable button')).filter(function(x){ return x.textContent==='취소'; })[0]; if(cc) cc.click();
      return '당김 · 늘림 · 해지 · 막음'; }},
    {id:'edit', label:'입력·수정 (천원 칸) — 신규 · 에스원 설치비 · 추가 · 갱신 · 금액 수정 · 해지 → DB 원 · 합계 · LIVE', run:async function(h, db){
      h.dlg(); var T=h.T, s0=h.sum(T), l0=h.live(T);
      await h.openEdit('new'); h.fill('#nCust', '가상고객_신규'); h.fill('#nStart', h.ym(T)); h.fill('#nEnd', h.ym(T+11)); h.fill('#nMrr', '385'); await h.save();
      var n1=db.byCust('가상고객_신규')[0]; h.ok(n1 && n1.mrr===385000 && Object.keys(db.rev(n1.id)).length===12, '신규 '+(n1&&n1.mrr));
      await h.openEdit('new'); h.fill('#nCust', '가상고객_에스원2'); h.fill('#nLine', 'S1'); h.fill('#nStart', h.ym(T)); h.fill('#nEnd', h.ym(T+23)); h.fill('#nMrr', '1200'); h.fill('#nFee', '2000'); await h.save();
      var n2=db.byCust('가상고객_에스원2')[0]; h.ok(n2 && n2.mrr===1200000 && n2.install_fee===2000000, '에스원 '+(n2&&n2.mrr)+'/'+(n2&&n2.install_fee));
      await h.openEdit('add'); await h.pick('aFind', 'aPick', '가상고객_MDR'); h.fill('#aQty', '30'); h.fill('#aStart', h.ym(T)); h.fill('#aMrr', '90'); await h.save();
      var kid=db.byCust('가상고객_MDR').filter(function(c){ return c.parent_contract_id; }).sort(function(x, y){ return y.id-x.id; })[0]; h.ok(kid.mrr===90000, '추가 '+kid.mrr);
      var r0=db.byCust('가상고객_이달만기')[0]; await h.openEdit('renew'); await h.pick('rFind', 'rPick', '가상고객_이달만기'); h.fill('#rEnd', h.ym(T+12)); h.fill('#rMrr', '550'); await h.save();
      h.ok(db.ct(r0.id).mrr===550000 && db.rev(r0.id)[h.ym(T+1)]===550000, '갱신');
      var f0=db.byCust('가상고객01')[0], fm=f0.mrr; await h.openEdit('fix'); await h.pick('fFind', 'fPick', '가상고객01'); h.fill('#fFrom', h.ym(T)); h.fill('#fMrr', '700'); await h.save();
      h.ok(db.ct(f0.id).mrr===700000 && db.rev(f0.id)[h.ym(T)]===700000, '금액 수정');
      var c0=db.byCust('가상고객03')[0]; await h.openEdit('churn'); await h.pick('cFind', 'cPick', '가상고객03'); h.fill('#cMonth', h.ym(T)); h.fill('#cReason', '비용이슈'); await h.save();
      h.ok(db.ct(c0.id).status==='해지' && !db.rev(c0.id)[h.ym(T+1)], '해지');
      document.getElementById('ovlEdit').classList.remove('on'); await h.reload();
      var want=s0+385000+1200000+90000+(700000-fm), s1=h.sum(T), l1=h.live(T);
      h.ok(s1===want, '이번 달 합계 '+s1+' ≠ '+want); h.ok(l1===l0+1, 'LIVE '+l0+'→'+l1+' (신규 2 − 이번 달 해지 1)');
      return '합계 +'+(s1-s0).toLocaleString('ko-KR')+'원 · LIVE '+l0+'→'+l1; }},
    {id:'equip', label:'장비 — 신청 접수 → 현황 재고 · 신청 내역 ✎ 설치완료 → 임대중 + 처리 대기 숫자 감소', run:async function(h, db){
      h.dlg(); navMenu('ordernew'); await h.sleep(200); h.fill('#odCustomer', '가상고객05'); h.fill('#odMgr', '담당자B'); h.fill('#odQty', '2'); h.fill('#odSerials', 'TSTN0001, TSTN0002'); h.click('#odGo');
      await h.until(function(){ return db.t.equipment_assets.filter(function(a){ return /^TSTN/.test(a.serial) && a.status==='재고'; }).length===2; }, 6000, '접수 → 현황 재고 2대');
      var badge=function(){ var b=document.querySelector('#rail [data-seg] .rb'); return b? +b.textContent : 0; };
      var p0=badge(); await h.gridEdit('orders', '가상고객05', [['상태', '설치완료']]);
      await h.until(function(){ return db.t.equipment_assets.filter(function(a){ return /^TSTN/.test(a.serial) && a.status==='임대중'; }).length===2; }, 6000, '설치완료 → 현황 임대중');
      h.ok(badge()===p0-1, '왼쪽 장비 «처리 대기» 숫자가 그대로 '+p0+' → '+badge()); return '접수 2대 재고 → 설치완료 임대중 · 대기 '+p0+'→'+badge(); }},
    {id:'dcheck', label:'데이터 점검 «금액 단위 실수 의심» — 실제 사고 상태(월 4.8억 · MRR 480원) 잡고 복구 · 에스원 일할 계산은 안 잡음', run:async function(h, db){
      h.dlg(); var c=db.byCust('가상고객_만기지남')[0]; c.end_month=qaYm(h.T+11); c.mrr=480; c.renew_count=1;
      for(var i=h.T;i<=h.T+11;i++) db.t.monthly_revenue.push({contract_id:c.id, month:qaYm(i), amount:480000000});
      await h.reload(); navMenu('dcheck'); await h.sleep(300);
      var R=dcRules().filter(function(x){ return x.id==='c_amt_odd'; })[0], k=R? R.items.findIndex(function(x){ return /가상고객_만기지남/.test(x.label); }) : -1; h.ok(R && R.sev==='crit' && k>=0, '규칙이 못 잡음');
      h.ok(!R.items.some(function(x){ return /가상고객_에스원(일할|해지)/.test(x.label); }), '에스원 일할 계산(첫 달·해지 달 몇 천원)을 실수로 잡음');
      dcFixOpen('c_amt_odd', k, ''); await h.sleep(250); h.ok(h.must('#dcfForm [data-k="mrr"]').value==='0.48', 'MRR 칸이 천원이 아님');
      h.fill('#dcfForm [data-k="mrr"]', '480'); h.click('#dcfSave'); await h.until(function(){ return db.rev(c.id)[h.ym(h.T+11)]===480000; }, 8000, '월 매출 복구');
      h.ok(db.ct(c.id).mrr===480000, 'mrr '+db.ct(c.id).mrr); var ov=document.getElementById('ovlDcFix'); if(ov) ov.remove(); return '잡음 → MRR 480 → 이번 달~종료월 480,000원'; }},
    {id:'kw', label:'설치비 칸 · 월 목표 · OI 예상단가 · 붙여넣기(원 시트 → 확인 창) — 천원 입력', run:async function(h, db){
      h.dlg(function(m){ return !/이상해 보이는/.test(m); });
      var c=db.byCust('가상고객_에스원')[0], y=+c.settle_month.slice(0,4), mo=+c.settle_month.slice(5,7);
      navMenu('dash'); try{ ccAnalysisOpen(true, true); }catch(e){} var w=document.querySelector('[data-w="ifee"]'); if(w) w.classList.remove('w-off'); await h.sleep(300);
      h.click('td.ifc[data-y="'+y+'"][data-m="'+mo+'"]'); await h.sleep(250); h.ok(h.must('.ifin[data-f="c'+c.id+'"]').value==='2000', '설치비 칸이 천원이 아님');
      h.fill('.ifin[data-f="c'+c.id+'"]', '2500'); h.click('#ifSave'); await h.until(function(){ return db.ct(c.id).install_fee===2500000; }, 6000, '설치비 저장');
      var yr=new Date().getFullYear(); openTargetEditor(yr); await h.sleep(200); h.ok(h.must('#ovlTarget input[data-m="1"]').value==='90000', '월 목표 칸이 천원이 아님');
      h.fill('#ovlTarget input[data-m="1"]', '95000'); h.click('#tgSave'); await h.until(function(){ var t=db.t.monthly_targets.filter(function(x){ return x.year===yr && x.month===1; })[0]; return t && t.amount===95000000; }, 6000, '월 목표 저장');
      navMenu('oinew'); await h.sleep(200); h.fill('#oiCust', '가상고객_OI2'); h.fill('#oiAmt', '12000'); h.click('#oiGo');
      await h.until(function(){ var o=db.t.oi_deals.filter(function(x){ return x.customer==='가상고객_OI2'; })[0]; return o && o.expect_amount===12000000; }, 6000, 'OI 저장');
      switchView('targets'); await h.sleep(200); openPaste(); var heads=pasteCols(GRIDS.targets).map(function(x){ return x.k; });
      h.fill('#pasteTa', heads.map(function(k){ return k==='year'? String(yr+2) : k==='amount'? '1500000000' : ''; }).join('\t')); h.click('#pasteGo'); await h.sleep(400);
      h.ok(h.asked(/이상해 보이는/) && !db.t.targets.some(function(x){ return +x.year===yr+2; }), '원으로 된 값을 붙여도 확인 창 없이 추가됨');
      document.getElementById('ovlPaste').classList.remove('on'); return '설치비 2,500 · 월 목표 95,000 · OI 12,000(천원) → 원 · 붙여넣기 이상 금액 확인'; }},
    {id:'renewMerge', label:'재약정 — 신규 240노드 + 추가 30노드 → 연장 270노드(합치기) · 지난 달 매출 그대로 · 겹치는 재약정 행 확인 · 두 번 연장 → 점검 · 되돌리기 ×2', run:async function(h, db){
      h.dlg(); var T=h.T, e0=T-3, mx=function(a){ return a.reduce(function(m, x){ return Math.max(m, +x.id||0); }, 0); }, cu=mx(db.t.customers)+1, id=mx(db.t.contracts)+1, NM='가상고객_재약정통합';
      db.t.customers.push({id:cu, name:NM, industry:'기업', sector:'IT·소프트웨어', aliases:[]});
      var base={customer_id:cu, line:'Cloud', partner:'직접(계산서)', biller:null, channel:'일반', billing:'월납입', install_fee:null, settle_month:null, renew_count:0, renew_history:[], auto_renew:false,
        version:'V6.0', combine:null, csm:null, s1_no:null, live_override:null, churn_reason:null, churn_month:null, note:null, lead_src:null};
      db.t.contracts.push(Object.assign({}, base, {id:id, contract_type:'신규', status:'신규', parent_contract_id:null, qty:240, mrr:240000, start_month:qaYm(T-14), end_month:qaYm(e0), term_months:12, total_amount:2880000}));
      db.t.contracts.push(Object.assign({}, base, {id:id+1, contract_type:'추가', status:'추가', parent_contract_id:id, qty:30, mrr:42000, start_month:qaYm(T-8), end_month:qaYm(e0), term_months:6, total_amount:252000}));
      for(var i=T-14;i<=e0;i++) db.t.monthly_revenue.push({contract_id:id, month:qaYm(i), amount:240000});
      for(var j=T-8;j<=e0;j++) db.t.monthly_revenue.push({contract_id:id+1, month:qaYm(j), amount:42000});
      await h.reload();
      var past=function(){ var r=db.rev(id); return JSON.stringify(Object.keys(r).filter(function(k){ return k<=h.ym(e0); }).map(function(k){ return k+'='+r[k]; })); };
      var p0=past(), n0=db.t.contracts.length, s0=db.monthSum(qaYm(e0));
      var pickBy=async function(word){ h.fill('#rFind', NM); await h.sleep(80); var it=[].slice.call(document.querySelectorAll('#rPick .pi')).filter(function(x){ return x.textContent.indexOf(word)>=0; })[0]; h.ok(it, '갱신 목록에 «'+word+'» 행 없음'); it.click(); await h.sleep(80); };
      /* ① 만기 처리 › 연장 — 노드 240+30 · 추가 계약 체크 · 미리보기 «그대로» */
      openRenewList('lapsed'); await h.sleep(200); h.click('#rnList tr[data-id="'+id+'"] .cbtn[data-a="renew"]'); await h.sleep(150);
      h.ok(h.must('#rnQty').value==='270', '노드수 기본값이 240+30 이 아님: '+h.must('#rnQty').value);
      var mate=/** @type {any} */ (h.must('#rnList .rnMate')); h.ok(mate.checked && +mate.value===id+1, '같이 끝나는 추가 계약이 안 보임');
      h.fill('#rnMrr', '270'); h.fill('#rnEnd', h.ym(e0+12)); h.ok(/그대로/.test(h.must('#rnPrev').textContent), '미리보기에 «그대로» 없음: '+h.must('#rnPrev').textContent);
      h.click('#rnGo'); await h.until(function(){ return db.ct(id).renew_count===1 && db.rev(id)[h.ym(e0+12)]===270000 && /재약정 통합/.test(db.ct(id+1).note||''); }, 6000, '연장 저장(계약 · 월 매출 · 추가 계약)');
      var c=db.ct(id), rv=db.rev(id), kid=db.ct(id+1);
      h.ok(c.mrr===270000 && c.qty===270 && h.ix(c.end_month)===e0+12 && c.status==='재약정' && c.contract_type==='신규', '원계약: mrr '+c.mrr+' · 노드 '+c.qty+' · 종료 '+c.end_month+' · '+c.contract_type+'|'+c.status);
      h.ok(past()===p0 && rv[h.ym(e0+1)]===270000 && rv[h.ym(e0+12)]===270000, '월 매출: 지난 달이 바뀌었거나 새 기간이 270 이 아님 — 전 '+p0+' / 후 '+past()+' · '+h.ym(e0+1)+'='+rv[h.ym(e0+1)]+' · '+h.ym(e0+12)+'='+rv[h.ym(e0+12)]);
      h.ok(/재약정 통합/.test(kid.note||'') && kid.status==='추가' && !db.rev(id+1)[h.ym(e0+1)], '추가 계약: '+kid.status+' · '+kid.note);
      h.ok(db.t.contracts.length===n0 && db.monthSum(qaYm(e0))===s0, '재약정 행이 따로 생겼거나 '+h.ym(e0)+' 합계가 바뀜');
      /* ② 신규 등록으로 같은 기간 «재약정» 행 → 겹침 확인 창 (취소 → 저장 안 됨) */
      h.dlg(function(m){ return !/겹치는 계약/.test(m); });
      await h.openEdit('new'); h.fill('#nCust', NM); h.fill('#nType', '재약정'); h.fill('#nStart', h.ym(e0+1)); h.fill('#nEnd', h.ym(e0+12)); h.fill('#nMrr', '270'); h.click('#eGo'); await h.sleep(500);
      h.ok(h.asked(/겹치는 계약/) && db.t.contracts.length===n0, '겹치는 재약정 행이 확인 없이 저장됨');
      /* ③ 갱신 탭으로 한 번 더 연장(중복 실수) → 데이터 점검이 잡음 → 되돌리기 두 번 */
      h.dlg(); await h.openEdit('renew'); await pickBy('연장 '); h.fill('#rEnd', h.ym(e0+24)); h.fill('#rMrr', '270'); await h.save();
      h.ok(db.ct(id).renew_count===2, '두 번째 연장 안 됨'); document.getElementById('ovlEdit').classList.remove('on'); await h.reload();
      var R=dcRules().filter(function(x){ return x.id==='c_renew_dup'; })[0], it=R && R.items.filter(function(x){ return x.label.indexOf(NM)>=0; })[0]; h.ok(it && it.act, '데이터 점검 «연장이 짧은 사이에 두 번»이 못 잡음');
      await h.openEdit('renew'); await pickBy('연장 '); h.click('#rUndoGo'); await h.until(function(){ return db.ct(id).renew_count===1 && !db.rev(id)[h.ym(e0+13)] && h.q('#rUndoGo'); }, 6000, '되돌리기 1회');
      c=db.ct(id); rv=db.rev(id); h.ok(c.status==='재약정', '1번 되돌린 뒤(연장 1회 남음) 상태 '+c.status); h.ok(h.ix(c.end_month)===e0+12 && c.mrr===270000 && rv[h.ym(e0+12)]===270000 && !rv[h.ym(e0+13)] && past()===p0, '되돌리기 1: 종료 '+c.end_month+' · '+h.ym(e0+13)+' '+rv[h.ym(e0+13)]);
      await h.until(function(){ return h.q('#rUndoGo'); }, 3000, '되돌리기 버튼 다시'); h.click('#rUndoGo'); await h.until(function(){ return db.ct(id).renew_count===0 && !db.rev(id)[h.ym(e0+1)] && !/재약정 통합/.test(db.ct(id+1).note||''); }, 6000, '되돌리기 2회');
      c=db.ct(id); rv=db.rev(id); h.ok(c.status==='신규', '연장 0회로 되돌린 뒤 상태 '+c.status); h.ok(c.mrr===240000 && c.qty===240 && h.ix(c.end_month)===e0 && !rv[h.ym(e0+1)] && past()===p0 && !(c.renew_history||[]).length, '되돌리기 2: mrr '+c.mrr+' · 노드 '+c.qty+' · 종료 '+c.end_month);
      h.ok(!/재약정 통합/.test(db.ct(id+1).note||''), '추가 계약의 «재약정 통합» 표시가 안 돌아옴');
      document.getElementById('ovlEdit').classList.remove('on');
      return '연장 270노드·추가 통합 · 지난 달 그대로 · 겹침 확인 · 2회 → 1회 → 0회'; }}
  ];
}
/** 시나리오 이름 목록 [{id, label}] */
export function qaDataList(){ return qaScenarios().map(function(s){ return {id:s.id, label:s.label}; }); }
/** i번째 시나리오 실행 → {ok, detail, diag[], ms} — 시작 전에 가짜 DB·화면을 처음 상태로 */
export async function qaDataRun(i){
  var s=qaScenarios()[i], log=[], t0=Date.now(); if(!s) return {ok:false, detail:'시나리오 없음 #'+i, diag:[], ms:0};
  if(!IS_QA_DATA || QA_DATA_MSG) return {ok:false, skip:true, detail:QA_DATA_MSG||'?qa=data 로 연 창이 아님', diag:[], ms:0};
  var keep={c:window.confirm, a:window.alert, p:window.prompt};
  try{ await qaDataReset(); var h=qaHelp(log); var d=await s.run(h, QADB); return {ok:true, detail:d||'', diag:log.slice(0,12), ms:Date.now()-t0}; }
  catch(e){ return {ok:false, detail:String((e&&e.message)||e).slice(0,200), diag:log.slice(0,12).concat([String((e&&e.stack)||'').split('\n').slice(0,3).join(' ⏎ ')]), ms:Date.now()-t0}; }
  finally{ window.confirm=keep.c; window.alert=keep.a; window.prompt=keep.p; }
}
