/* ===== analysis.js — AI 지식 · 데이터 점검 · 유입경로 분석 · 월 목표 · 임대 장비 운영 보드 · 사업 영역 화면 =====
   ES 모듈(㊿+153) — 다른 파일의 이름은 아래 import 로만 씀 · 이 파일의 최상위 var/function 은 전부 export · 즉시 실행 문장은 js/init.js 의 start() 에 */
import { APP_VER, IS_QA, ST } from './state.js';
import { Viz } from './viz.js';
import { $, amtGuard, amtHint, baseLabel, bizKey, bizLabel, bizY, canWrite, cssv, esc, isGN, kwToWon, lline, llineVer, mk, rawHtml, SB_KEY, SB_URL, STATE, tickMemo, tpl, won, wonFull, wonKo, wonToKw, yOf } from './core.js';
import { dIdx, ico, idxDate, loadFromDb, onData, SB_RAW, sbHeaders, sbTry, sbWrite, toast, todayStr } from './shell.js';
import { hbars, idxs, monthlyTotal } from './dash.js';
import { CHURN_OPTS, codeActive, GRIDS, LEAD_OPTS, LINE_OPTS } from './grids.js';
import { bizHostEl, bizNz, BIZV, eqIsPh, eqScan, eqSerials, syncOrderAssets } from './equipment.js';
import { c360Match, fkNorm, openCust360, subgrpSync } from './tools.js';
import { helpBox, helpWire, kxCustMrr, kxLive, kxMrr, kxWire } from './sales.js';
import { BLANK_LABEL, ctRevPlan, DV, editCell, openFilterPanel, readRowInputs, renderGrid, switchView, wireRowInputs, xlsxAoa } from './grid.js';
import { closeOvl, logChange, monthRows, openOvl, ymFromInput } from './edit.js';

/* ===== AI 지식 — 사람이 AI 에게 가르치는 사실·규칙·용어 (ai_knowledge · active 인 행은 매 질문의 시스템 프롬프트에 들어감) ===== */
/* ===== 데이터 점검 (80점 프로젝트 ③ 데이터 정합성 · ㊿+133) — 메모리 데이터(DATA/RAWX)로 규칙을 돌려 어긋난 행 + 바로가기 =====
   · 규칙 추가는 dcRules() 에 rule(id, sev, 제목, 설명, items[{label,sub,go,key}], 화면이름) 한 줄. sev: crit(바로 고침) · warn(확인) · info(참고)
   · DB 쪽 제약(공백·목록 값 정규화 · 시리얼 UNIQUE · FK)은 SQL 90 — 이 화면은 그 전후로 «지금 어긋난 것»을 보여주는 용도 */
export var DC={open:{}, sev:''};
/* ㊿+170 데이터 점검 — 규칙마다 «업무 영향»(무엇이 틀려 보이는지) · 기술 설명(why)은 관리자만 */
export var DC_IMPACT={c_nocust:'고객 360·LIVE 고객 수에서 빠지고 화면에 «?»로 보입니다', c_parent:'부속 계약이 원계약과 묶이지 않아 만료·재약정 판단이 틀어집니다', c_dates:'기간·LIVE·월 매출 판정이 틀어집니다',
  c_lapsed:'이미 LIVE 에서 빠져 고객 수·MRR 이 줄어 보입니다 — 연장이면 되살려야 합니다', c_renew_dup:'연장 회차·만기가 두 번 잡혀 만기 처리가 틀어집니다', c_renew_overlap:'같은 기간 매출이 두 번 잡혀 MRR 이 부풀 수 있습니다',
  c_renew_sync:'홈 «만기 처리» 숫자와 슬랙 만기 알림이 다를 수 있습니다', c_vocab:'필터·집계에서 따로 묶이거나 빠집니다', c_rev_after_end:'해지·종료 뒤 매출이 남아 MRR·연 매출이 부풀려집니다',
  c_noend:'만료 예정·만기 처리 목록에서 빠집니다', c_s1no:'에스원 정산 대조에서 짝을 찾지 못합니다', c_live_zero:'이달 MRR 이 실제보다 적게 보입니다(월납이면 입력 누락)',
  c_mrr:'계약 MRR 과 월 매출 중 어느 쪽이 맞는지 불분명 — 재계약 제안 금액이 틀릴 수 있습니다', c_amt_odd:'매출·목표 달성률이 크게 틀립니다(천원·원 단위 실수)', c_cloud_meta:'6.0 전환율·노드 기준 분석에서 빠집니다',
  c_lead:'유입경로 분석에서 «미지정»으로 묶입니다', cu_dup:'같은 회사가 두 곳으로 세어져 고객 수·고객 360 이 나뉩니다', eq_serial_dup:'임대중 대수·회수 처리가 두 번 셉니다',
  eq_gap:'장비 대시보드·고객 360 장비 수가 신청과 다릅니다', eq_orphan:'어느 신청에도 안 묶여 회수 대상에서 빠질 수 있습니다', eq_noserial:'실제 장비를 찾거나 회수할 때 시리얼을 모릅니다',
  eq_vocab:'상태 보드·대시보드에서 카드가 사라집니다', oi_overdue:'파이프라인·이번 분기 예상에 지난 건이 섞입니다'};
/** ㊿+170 일괄 수정 미리 보기 — 무엇이 바뀌는지 표로 보여 주고, 사람이 «n건 반영»을 눌러야만 실행(자동 실행 없음) */
export function previewDlg(o){
  var ov=document.getElementById('ovlPrev');
  if(!ov){ ov=document.createElement('div'); ov.className='ovl'; ov.id='ovlPrev'; ov.innerHTML='<div class="modal" style="width:min(760px,100%)" role="dialog" aria-modal="true" aria-labelledby="pvT"><h3 id="pvT"></h3><p class="cap" id="pvI"></p><div class="tbl-wrap" style="max-height:50vh;overflow:auto"><table class="dgrid" id="pvTb"></table></div><div class="mact"><span class="mmsg" id="pvM"></span><button type="button" class="pill ghost" data-close="ovlPrev">취소</button><button type="button" class="pill pri" id="pvOk"></button></div></div>'; document.body.appendChild(ov); }
  /** @type {any} */(document.getElementById('pvT')).textContent=o.title; /** @type {any} */(document.getElementById('pvI')).textContent=o.intro||'';
  /** @type {any} */(document.getElementById('pvTb')).innerHTML=tpl`<thead><tr>${rawHtml(o.head.map(function(x){ return tpl`<th>${x}</th>`; }).join(''))}</tr></thead><tbody>${rawHtml(o.rows.slice(0,300).map(function(r){ return tpl`<tr>${rawHtml(r.map(function(v){ return tpl`<td>${String(v==null?'':v)}</td>`; }).join(''))}</tr>`; }).join(''))}</tbody>`;
  var ok=/** @type {any} */(document.getElementById('pvOk')); ok.textContent=o.ok; ok.disabled=false; /** @type {any} */(document.getElementById('pvM')).textContent=o.rows.length>300? '처음 300건만 보입니다 (전체 '+o.rows.length+'건 반영)' : '';
  ok.onclick=function(){ ok.disabled=true; closeOvl('ovlPrev'); o.run(); };
  openOvl('ovlPrev');
}
export function dcRules(){
  var rows=(ST.DATA&&ST.DATA.rows)||[], T=(ST.DATA&&ST.DATA.nowIdx)||0, R=ST.RAWX||{}, out=[];
  function rule(id, sev, title, why, items, go, act){ out.push({id:id, sev:sev, title:title, why:why, items:items||[], go:go||'', act:act||null}); }   // act: {label,run} = 규칙 전체에 대한 일괄 동작 버튼(선택)
  var goGrid=function(view,q){ return function(){ switchView(view); var e=document.getElementById('dvSearch'); if(e){ e.value=q||''; } try{ renderGrid(); }catch(x){} }; };
  var term=function(r){ return /해지|서비스종료|종료|통합과금|CN전환/.test(String(r.status||'').replace(/\s/g,'')); };
  var ci=function(r){ return {label:r.cust+' — '+lline(r.line), sub:(r.status||'상태 없음')+' · '+(r.startRaw!=null? mk(r.startRaw):'?')+' ~ '+(r.endRaw!=null? mk(r.endRaw):'진행')+' · #'+r._id, go:goGrid('contracts', r.cust==='?'? '':r.cust), key:r._id}; };
  var ids={}; rows.forEach(function(r){ ids[r._id]=1; });
  /* ㊿+148 항목을 누르면 열리는 수정 창(dcFixOpen) 스펙 — tbl·view(쓰기 권한 화면)·id·고칠 칸 f(GRIDS 열 키)·ex(추가 동작) */
  var fxC=function(f, ex){ return function(r){ var it=ci(r); it.fix={tbl:'contracts', view:'contracts', id:r._id, f:f, ex:ex||''}; return it; }; };
  var fxO=function(it, tbl, view, id, f){ it.fix={tbl:tbl, view:view, id:id, f:f, ex:''}; return it; };
  /* ── 계약 ── */
  rule('c_nocust','crit','고객사 연결 없음','계약의 customer_id 가 고객사 표에 없음 — 화면에 «?» 로 나오고 LIVE·고객 360 에서 빠집니다. 고객사를 다시 지정하거나 계약을 삭제하세요.',
    rows.filter(function(r){ return r.cust==='?' || !r.cid; }).map(fxC(['customer_id'])), '계약 관리');
  rule('c_parent','crit','부속 계약의 원계약이 없음','parent_contract_id 가 가리키는 계약이 없음(삭제됨) — 이 금액은 어느 원계약에도 합쳐지지 않습니다.',
    rows.filter(function(r){ return r.parent && !ids[r.parent]; }).map(fxC(['parent_contract_id'])), '계약 관리');
  rule('c_dates','crit','종료월이 시작월보다 앞섬','start_month > end_month — 기간·LIVE 판정이 틀어집니다.',
    rows.filter(function(r){ return r.startRaw!=null && r.endRaw!=null && r.endRaw<r.startRaw; }).map(fxC(['start_month','end_month'])), '계약 관리');
  var RS=null; try{ RS=renewScan(T); }catch(e){}
  rule('c_lapsed','crit','만기 지났는데 미처리','종료월이 지났는데 연장·해지·종료 처리가 없음 — 이미 LIVE 에서 빠져 있습니다.',
    (RS? RS.lapsed:[]).map(function(r){ var it=ci(r); it.go=function(){ openRenewList('lapsed'); }; return it; }), '홈 › 만기 처리');
  /* ㊿+159 연장 중복 — 같은 계약에 연장이 14일 안에 두 번(재약정 행을 지우고 다시 연장 등) · 항목에서 «마지막 연장 되돌리기» */
  var rnImp=function(h){ return /migration|sheet-sync/i.test(String((h&&h.by)||'')); };   /* 시트 이관으로 만들어진 이력은 사람이 한 연장이 아님 (inbound.js 와 같은 기준) */
  var rnDay=function(h){ if(!h || rnImp(h)) return null; var t=Date.parse(String(h.at||'')); return isFinite(t)? t : null; };
  rule('c_renew_dup','warn','연장이 짧은 사이에 두 번','같은 계약에 연장이 14일 안에 두 번 기록됨 — 재약정 행을 지우고 다시 연장하는 등 중복 입력 의심. 한 번만 연장한 게 맞으면 «↩ 마지막 연장 되돌리기»로 취소하세요(연장 전 종료월·MRR·노드수로 돌아가고, 그 전 달 월 매출은 그대로).',
    rows.filter(function(r){ var h=r.renewHist||[]; if(h.length<2) return false; var a=rnDay(h[h.length-1]), b=rnDay(h[h.length-2]); return a!=null && b!=null && Math.abs(a-b)<=14*864e5; })
      .map(function(r){ var it=ci(r), h=r.renewHist, l=h[h.length-1], p=h[h.length-2];
        it.sub='연장 '+r.renew+'회 · 마지막 '+String(l.at).slice(0,10)+' ('+String(l.from||'').slice(0,7)+'~'+String(l.to||'').slice(0,7)+' 월 '+won(l.mrr||0)+'천원) · 그 전 '+String(p.at).slice(0,10)+' · #'+r._id;
        if(canWrite('contracts')) it.act={label:'↩ 마지막 연장 되돌리기', run:function(){ renewUndoFlow(r).then(function(ok){ if(ok && ST.CUR_VIEW==='dcheck') renderDataCheck(); }).catch(function(e){ toast('되돌리기 실패', String(e.message||e), 'info'); }); }};
        return it; }), '입력·수정 › 갱신');
  /* ㊿+159 연장한 계약과 같은 기간에 «재약정» 행이 또 있음 → 겹치는 달 월 매출이 두 번 잡힘 */
  var revOn=function(x, m){ return (x.segs||[]).some(function(sg){ return sg[2] && sg[0]<=m && m<=sg[1]; }); };
  var ovl=[]; rows.forEach(function(a){ if(!a.renew || a.parent) return; var h=(a.renewHist||[])[(a.renewHist||[]).length-1]; if(!h || !h.from || rnImp(h)) return;
    var f=dIdx(h.from), e=(a.endRaw!=null? a.endRaw : a.endIdx); if(e==null || e<f) return;
    rows.forEach(function(b){ if(b._id===a._id || b.parent || b.cid!==a.cid || b.line!==a.line) return; if(b.ctype==='추가' || !(b.ctype==='재약정' || b.status==='재약정') || (b.renew && !(b.renewHist||[]).every(rnImp))) return;   /* ㊿+160·163 포탈에서 연장해 구분·상태가 «재약정»이 된 행은 따로 만든 재약정 행이 아님 (시트 이관 이력만 있는 행은 그대로 검사) */
      var bs=(b.startRaw!=null? b.startRaw : b.startIdx); if(bs==null || bs<f || bs>e) return;
      var n=0; for(var m=f;m<=e;m++) if(revOn(a, m) && revOn(b, m)) n++; if(!n) return;   /* 두 계약 모두 월 매출이 있는 달만 */
      var it=ci(b); it.sub='#'+a._id+' 연장 '+a.renew+'회('+mk(f)+'~'+mk(e)+') 와 겹치는 재약정 행 #'+b._id+'('+mk(bs)+'~'+(b.endRaw!=null? mk(b.endRaw):'')+' · 월 '+won(b.mrr||0)+'천원) · 두 번 잡힌 달 '+n+'개월 — 하나만 남기세요'; ovl.push(it); }); });
  rule('c_renew_overlap','warn','연장한 계약과 겹치는 재약정 행','연장(«연장 n회»)으로 기간을 늘린 계약이 있는데 같은 고객·서비스에 같은 기간의 «재약정» 행이 또 있음 — 겹치는 달 월 매출이 두 번 잡힙니다. 재약정 행을 지우거나, 그 행을 남길 거면 원계약의 연장을 «↩ 마지막 연장 되돌리기»로 취소하세요.', ovl, '계약 관리');
  /* 포탈(renewScan) ↔ DB(renew_watch · SQL 84) 만기 판정 대조 — 슬랙 알림(remind)은 DB 쪽을 쓰므로 두 쪽이 어긋나면 알림과 화면 숫자가 달라짐. 결과는 dcRenewSync() 가 비동기로 채움(DC.rw) */
  var rw=DC.rw, rwItems=[];
  if(rw && rw.T===T && rw.diff) rw.diff.forEach(function(d){ var r=rows.filter(function(x){ return x._id===d.id; })[0]; var it=r? fxC(['status','end_month','auto_renew','live_override'])(r) : {label:'#'+d.id+' '+(d.cust||''), sub:'', go:null, key:d.id}; it.sub=(d.side==='portal'? '포탈만 ':'DB(renew_watch)만 ')+'«'+d.kind+'»'+(d.other? ' · 상대쪽 «'+d.other+'»':'')+(it.sub? ' · '+it.sub:''); rwItems.push(it); });
  rule('c_renew_sync', (!rw || rw.error || rw.pending)? 'info':'warn', '만기 판정 포탈 ↔ DB 불일치', rw? (rw.error? 'DB 쪽(renew_watch) 조회 실패 — '+rw.error+' (SQL 84 미실행이면 정상)' : '홈 «만기 처리»(포탈 계산)와 슬랙 알림(DB 함수 renew_watch)이 보는 미처리·이달·다음 달 목록이 다름 — 보통 auto_renew·live_override·상태값이 한쪽 규칙에만 걸린 경우. 포탈 '+rw.portalN+'건 vs DB '+rw.dbN+'건.') : '확인 중… (DB 함수 renew_watch 와 대조)', rwItems, '홈 › 만기 처리');
  var bad=[]; rows.forEach(function(r){ var w=[], f=[];
    if(!codeActive('contract_status', r.status)){ w.push('상태 «'+r.status+'»'); f.push('status'); }
    if(!codeActive('contract_type', r.ctype)){ w.push('계약유형 «'+r.ctype+'»'); f.push('contract_type'); }
    if(!codeActive('channel', r.channel)){ w.push('채널 «'+r.channel+'»'); f.push('channel'); }
    if(!codeActive('line', r.line)){ w.push('서비스 «'+r.line+'»'); f.push('line'); }
    if(!codeActive('lead_src', r.lead)){ w.push('유입경로 «'+r.lead+'»'); f.push('lead_src'); }
    if(!codeActive('live_override', r.liveOv)){ w.push('LIVE 예외 «'+r.liveOv+'»'); f.push('live_override'); }
    if(w.length){ var it=fxC(f)(r); it.sub=w.join(' · '); it.fix.bad=f; bad.push(it); } });
  rule('c_vocab','warn','선택 목록에 없는 값','상태·계약유형·채널·서비스·유입경로·LIVE 예외가 코드 목록(관리자 › 코드 관리)에 없는 값이면 필터·집계·만기 판정에서 빠집니다. 표에서 목록 값으로 고르거나, 정식 값이면 코드 관리에서 추가(또는 숨긴 값 켜기)하세요. DB 는 값이 바뀔 때 이 목록으로 검증합니다(SQL 93).', bad, '계약 관리');
  rule('c_rev_after_end','warn','해지·종료 뒤에도 월 매출이 있음','상태가 해지·서비스종료인데 종료월 뒤 달에 monthly_revenue 가 남아 있음 — MRR·연 매출이 부풀려집니다. (만기 처리 창의 해지/서비스종료는 뒤 매출을 지우므로 예전 수기 처리분일 가능성)',
    rows.filter(function(r){ return /해지|서비스종료|종료/.test(String(r.status||'').replace(/\s/g,'')) && r.endRaw!=null && r.dataLast!=null && r.dataLast>r.endRaw; }).map(function(r){ var it=fxC(['status','end_month'],'rev_after')(r); it.sub+=' · 마지막 매출 '+mk(r.dataLast); return it; }), '계약 관리');
  rule('c_noend','warn','종료월 없음 (자동연장 아님)','진행 중 원계약인데 종료월이 비어 있고 자동연장 표시도 없음 — 만기 알림·LIVE 증감이 이 계약을 못 봅니다. 종료월을 넣거나 «자동연장»을 켜세요.',
    rows.filter(function(r){ return liveRoot(r) && r.endRaw==null && !r.autoRenew && r.liveOv!=='제외' && !term(r); }).map(fxC(['end_month','auto_renew'])), '계약 관리');
  rule('c_s1no','warn','에스원 계약인데 계약번호 없음','채널이 에스원(또는 S1 서비스)인 LIVE 계약에 s1_no 가 비어 있음 — 정산 자동 대조(에스원 정산)·만기 슬랙에 번호가 안 나옵니다.',
    rows.filter(function(r){ return liveActiveAt(r,T) && (String(r.channel||'')==='에스원' || /^(S1|MDR_S1)$/.test(String(r.line||''))) && !r.s1no; }).map(fxC(['s1_no'])), '계약 관리');
  var lz=rows.filter(function(r,k){ return liveActiveAt(r,T) && !(ST.MAT[k]&&ST.MAT[k][T]) && !/일시납|연납|반년납|분기납/.test(String(r.billing||'')); });
  rule('c_live_zero','info','LIVE 인데 이달 매출 0','LIVE 로 집계되는 원계약인데 이달 monthly_revenue 가 없음 — 연납·일시납이면 정상, 월납이면 입력 누락. 아래 «mrr 로 채우기»는 mrr 이 있는 계약의 이달 매출을 mrr 금액으로 한 번에 넣습니다(확인 후).',
    lz.map(function(r){ var it=fxC(['billing'],'rev_now')(r); it.sub+=' · 과금 '+(r.billing||'미지정')+' · mrr '+(r.mrr? won(r.mrr)+' 천원':'없음'); return it; }), '계약 관리',
    lz.some(function(r){ return r.mrr>0; }) && canWrite('contracts')? {label:'이달 매출을 mrr 로 채우기', run:function(){ dcFillMrr(lz.filter(function(r){ return r.mrr>0; }), T); }} : null);
  rule('c_mrr','info','MRR 과 이달 월 매출이 다름','계약의 mrr 과 이달 monthly_revenue 가 1% 넘게 다름 — 재약정 뒤 mrr 을 안 고쳤거나 월 매출 입력 오류.',
    rows.map(function(r,k){ return {r:r,k:k}; }).filter(function(x){ var v=(ST.MAT[x.k]&&ST.MAT[x.k][T])||0; return x.r.mrr>0 && v>0 && Math.abs(v-x.r.mrr)/x.r.mrr>0.01; }).map(function(x){ var it=fxC(['mrr'],'mrr_now')(x.r); it.fix.now=ST.MAT[x.k][T]; it.sub='mrr '+won(x.r.mrr)+' vs 이달 '+won(ST.MAT[x.k][T])+' 천원'; return it; }), '계약 관리');
  /* ㊿+157 금액 단위 실수 의심 — 월 매출이 전월의 50배↑·1/50↓ 로 튀거나, MRR·월 매출이 1만원 미만 (천원/원을 헷갈려 넣은 경우 · 2026-10 월 4.8억 입력 사고) */
  /* ㊿+158 첫 달·마지막 달은 일할 계산이라 빼고 봄 — 에스원은 월말에 개시하면 첫 달이 몇 천원(예: 2,433원), 해지 달도 일할 (사용자: «에스원이 첫달은 일할 계산») */
  var odd=[]; rows.forEach(function(r,k){ var m=ST.MAT[k]||[], w=[], f=-1, l=-1;
    for(var x=0;x<m.length;x++){ if(m[x]>0){ if(f<0) f=x; l=x; } }
    var part=function(i){ return i===f || i===l || i===r.startRaw || i===r.endRaw; };
    for(var i=1;i<m.length;i++){ if(part(i) || part(i-1)) continue; var a=m[i-1]||0, b=m[i]||0; if(a>0 && b>0 && (b>=a*50 || b*50<=a)){ w.push(mk(i)+' 월 매출 '+wonKo(b)+' (전월 '+wonKo(a)+')'); break; } }
    for(var j=0;j<m.length;j++){ if(part(j)) continue; if(m[j]>0 && m[j]<10000){ w.push(mk(j)+' 월 매출 '+Math.round(m[j]).toLocaleString('ko-KR')+'원'); break; } }
    if(r.mrr>0 && r.mrr<10000) w.push('MRR '+Math.round(r.mrr).toLocaleString('ko-KR')+'원');
    if(w.length){ var it=fxC(['mrr'])(r); it.sub=w.join(' · ')+' · '+it.sub; odd.push(it); } });
  rule('c_amt_odd','crit','금액 단위 실수 의심','월 매출이 전월보다 50배 넘게 뛰거나 1/50 아래로 떨어진 달, 또는 1만원 미만 금액(첫 달·마지막 달은 일할 계산이라 뺌) — 천원·원을 헷갈려 넣었을 가능성이 큽니다. 여기서 MRR 을 바른 금액(천원)으로 고치면 이번 달(시작 전이면 시작월)부터 종료월까지 월 매출도 같이 맞춥니다. 지난 달 금액은 ✏️ 입력·수정 › 금액 수정에서 구간을 골라 고치세요.',
    odd, '계약 관리');
  rule('c_cloud_meta','info','Cloud 계약의 버전·노드수 미입력','Cloud NAC 원계약인데 Ver. 또는 노드수가 비어 있음 — 6.0 전환율·노드 기준 분석에서 빠집니다.',
    rows.filter(function(r){ return r.line==='Cloud' && liveActiveAt(r,T) && (!r.ver || !r.qty); }).map(function(r){ var it=fxC(['version','qty'])(r); it.sub='Ver '+(r.ver||'—')+' · 노드 '+(r.qty||'—'); return it; }), '계약 관리');
  rule('c_lead','info','유입경로 미지정','LIVE 원계약인데 유입경로가 비어 있음 — 유입경로 분석에서 «미지정»으로 묶입니다.',
    rows.filter(function(r){ return liveActiveAt(r,T) && !r.parent && !r.lead; }).map(fxC(['lead_src'])), '유입경로 분석');
  /* ── 고객사 ── */
  var byKey={}; (R.customers||[]).forEach(function(c){ var k=(nmKeys(c.name)||[])[0]; if(!k) return; (byKey[k]=byKey[k]||[]).push(c); });
  var cn={}; (R.contracts||[]).forEach(function(c){ cn[c.customer_id]=(cn[c.customer_id]||0)+1; });
  var dup=[]; Object.keys(byKey).forEach(function(k){ var l=byKey[k]; if(l.length>1) dup.push({label:l.map(function(c){ return c.name; }).join(' ≈ '), sub:l.map(function(c){ return '#'+c.id+' 계약 '+(cn[c.id]||0)+'건'; }).join(' · ')+' — 같은 회사면 «병합»(한 곳으로 계약·장비·OI 를 옮기고 다른 표기는 별칭)', go:function(){ openCust360(l[0].name); }, key:k,
    act: (ST.IS_SUPER || /^(admin|super_admin)$/.test(String(ST.MY_ROLE||'')))? {label:'병합', run:function(){ dcMergeDlg(l, cn); }} : null}); });
  rule('cu_dup','warn','고객사 이름 중복 의심','정규화한 이름(㈜·공백·괄호 무시)이 같은 고객사가 2개 이상 — LIVE 고객사 수·고객 360 이 갈라집니다. 관리자는 «병합»으로 합칠 수 있습니다(merge_customers · SQL 93 · 되돌리기는 change_log 참고).', dup, '고객 360');
  /* ── 장비 ── */
  var sm={}; (R.assets||[]).forEach(function(a){ var sn=String(a.serial||'').trim().toUpperCase(); if(!sn||eqIsPh(sn)) return; (sm[sn]=sm[sn]||[]).push(a); });
  var sdup=[]; Object.keys(sm).forEach(function(sn){ if(sm[sn].length>1) sdup.push({label:sn+' × '+sm[sn].length, sub:sm[sn].map(function(a){ return (a.customer||'?')+'/'+(a.status||'')+'/#'+a.id; }).join(' · '), go:goGrid('assets', sn), key:sn}); });
  rule('eq_serial_dup','crit','장비 현황에 같은 시리얼이 여러 행','equipment_assets 에 시리얼이 중복 — 임대중 수·회수 처리가 두 번 셉니다. SQL 90 이 최근 행만 남기고 UNIQUE 인덱스를 만듭니다.', sdup, '임대 장비 현황');
  var es=null; try{ es=eqScan(); }catch(e){}
  rule('eq_gap','warn','신청 ↔ 현황 불일치','신청 내역과 장비 현황이 어긋남(수량·시리얼·상태) — 신청 내역 › 「신청 ↔ 현황 대조」에서 맞추기.',
    (es? es.gap:[]).map(function(g){ return {label:(g.o.customer||'?')+' — '+(g.o.model||'')+' × '+(g.o.qty||1), sub:g.why, go:goGrid('orders', g.o.customer), key:g.o.id}; }), '임대 장비 신청 내역');
  rule('eq_orphan','warn','신청 없이 임대중인 장비','현황에 임대중인데 어떤 신청에도 연결되지 않음(수기 입력) — 신청을 만들어 연결하거나 상태를 고치세요.',
    (es? es.orphan:[]).map(function(a){ return fxO({label:(a.serial||'?')+' · '+(a.model||''), sub:(a.customer||'?')+' · '+(a.channel||''), go:goGrid('assets', a.serial), key:a.id}, 'equipment_assets', 'assets', a.id, ['status','customer','note']); }), '임대 장비 현황');
  rule('eq_noserial','info','설치완료인데 시리얼 없음','상태가 설치완료/회수예정인데 시리얼이 비어 있음(임시 «미등록-» 시리얼로만 현황에 있음) — 실제 시리얼을 넣으세요.',
    (R.orders||[]).filter(function(o){ return /설치완료|회수예정/.test(String(o.status||'')) && !eqSerials(o).length; }).map(function(o){ return fxO({label:(o.customer||'?')+' — '+(o.model||'')+' × '+(o.qty||1), sub:(o.status||'')+' · 설치 '+(o.install_date||'—'), go:goGrid('orders', o.customer), key:o.id}, 'equipment_orders', 'orders', o.id, ['serials']); }), '임대 장비 신청 내역');
  rule('eq_vocab','warn','장비 신청의 상태·채널 값이 목록에 없음','상태 보드·대시보드가 이 값을 못 받아 카드가 사라집니다. (목록: 관리자 › 코드 관리 › 장비 신청 상태·채널)',
    (R.orders||[]).filter(function(o){ return !codeActive('order_status', o.status) || !codeActive('order_channel', o.channel); }).map(function(o){ var it=fxO({label:(o.customer||'?')+' — '+(o.model||''), sub:'상태 «'+(o.status||'')+'» · 채널 «'+(o.channel||'')+'»', go:goGrid('orders', o.customer), key:o.id}, 'equipment_orders', 'orders', o.id, ['status','channel']); it.fix.bad=[!codeActive('order_status', o.status)? 'status':'', !codeActive('order_channel', o.channel)? 'channel':''].filter(Boolean); return it; }), '임대 장비 신청 내역');
  /* ── OI ── */
  var nowYm=mk(T);
  rule('oi_overdue','info','예정 월이 지난 진행 중 OI','등록·진행 단계인데 예상 시기가 이미 지남 — 단계를 바꾸거나 예상 시기를 미루세요.',
    (R.oi||[]).filter(function(o){ return /등록|진행/.test(String(o.stage||'')) && o.expect_month && String(o.expect_month).slice(0,7)<nowYm; }).map(function(o){ return fxO({label:(o.customer||'?')+' — '+(o.deal_name||''), sub:(o.stage||'')+' · 예정 '+String(o.expect_month).slice(0,7)+' · '+(o.owner||''), go:goGrid('oi', o.customer), key:o.id}, 'oi_deals', 'oi', o.id, ['stage','expect_month','next_action']); }), 'OI 현황');
  return out;
}
export var DC_SEV={crit:['🔴','바로 고쳐야 함','var(--critical,#d03b3b)'], warn:['🟠','확인 필요','var(--warn-ink)'], info:['🔵','참고','var(--muted)']};
export function dcSummary(){ var rules=dcRules(), o={crit:0,warn:0,info:0,items:{}}; rules.forEach(function(r){ if(r.items.length){ o[r.sev]+=r.items.length; o.items[r.title]=r.items.length; } }); return o; }
export function renderDataCheck(){
  var tw=$('#dvTable').parentElement; tw.style.display='none';
  var host=bizHostEl(); host.style.display='';
  if(!ST.DATA || !ST.DATA.rows){ host.innerHTML='<div class="cap" style="padding:30px;text-align:center">데이터가 아직 없습니다</div>'; return; }
  dcRenewSync();   // DB renew_watch 와 대조(비동기 · 데이터 로드마다 1회) — 도착하면 다시 그림
  var t0=Date.now(), rules=dcRules(), ms=Date.now()-t0; DC._rules=rules;
  var n={crit:0,warn:0,info:0}, cnt={crit:0,warn:0,info:0}, items=0;
  rules.forEach(function(r){ if(r.items.length){ n[r.sev]++; cnt[r.sev]+=r.items.length; items+=r.items.length; } });
  var h=tpl`<div class="dbar" style="margin-bottom:12px;flex-wrap:wrap;gap:8px;align-items:center">`+
    tpl`<span class="mini">규칙 ${rules.length}개 · 어긋난 항목 <b>${rawHtml(items)}</b>건 · ${rawHtml(ms)}ms · 데이터 ${ST.DATA.generatedAt||''} 기준</span>`+
    tpl`<span class="mtabs" style="margin:0" id="dcSev">${rawHtml([['','전체'],['crit','바로 고칠 '+cnt.crit],['warn','확인 '+cnt.warn],['info','참고 '+cnt.info]].map(function(t){ return tpl`<button type="button" data-s="${rawHtml(t[0])}" aria-pressed="${DC.sev===t[0]}">${rawHtml(t[1])}</button>`; }).join(''))}</span>`+
    tpl`<span style="flex:1"></span><button type="button" class="pill ghost" id="dcXlsx">엑셀</button><button type="button" class="pill ghost" id="dcRefresh">↻ 다시 점검</button></div>`;
  h+=tpl`<div class="dc-sev" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:14px">${rawHtml(['crit','warn','info'].map(function(sv){ return tpl`<div class="card" style="padding:12px 14px"><div class="mini">${rawHtml(DC_SEV[sv][0])} ${rawHtml(DC_SEV[sv][1])}</div><div style="font-size:22px;font-weight:800;color:${rawHtml(DC_SEV[sv][2])}">${rawHtml(cnt[sv])}<span class="mini" style="font-weight:400"> 건 · 규칙 ${rawHtml(n[sv])}개</span></div></div>`; }).join(''))}</div>`;
  var ord={crit:0,warn:1,info:2};
  /* ㊿+170 문제 있는 규칙 먼저(심각도 → 건수) · 이상 없는 규칙은 맨 아래 접힘 */
  var list=rules.filter(function(r){ return !DC.sev || r.sev===DC.sev; }).sort(function(a,b){ return ((a.items.length? 0:1)-(b.items.length? 0:1)) || (ord[a.sev]-ord[b.sev]) || (b.items.length-a.items.length); });
  var nOk=list.filter(function(r){ return !r.items.length; }).length;
  var ADM=ST.IS_SUPER || /^(admin|super_admin)$/.test(String(ST.MY_ROLE||''));
  var cardOf=function(r){ var open=!!DC.open[r.id], ok=!r.items.length, imp=DC_IMPACT[r.id]||'';
    return tpl`<div class="card dc-rule" data-sev="${rawHtml(r.sev)}" style="padding:12px 14px;margin-bottom:8px">`+
      tpl`<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;cursor:${ok? 'default':'pointer'}" data-dc="${rawHtml(r.id)}">`+
        tpl`<span>${rawHtml(ok? '✅':DC_SEV[r.sev][0])}</span><b style="font-size:14px">${r.title}</b>`+
        tpl`<span class="ctag${ok? ' ok':(r.sev==='warn'? ' warn':r.sev==='info'? ' info':' late')}">${rawHtml(ok? '이상 없음':r.items.length+'건')}</span>`+
        tpl`<span class="mini" style="margin-left:auto">${r.go}${ok? '':(open? ' ▴':' ▾')}</span></div>`+
      /* ㊿+170 문제(제목) · 업무 영향 · 대상 · 해결 행동 — DB·SQL 설명(why)은 관리자에게만 «기술 상세» */
      tpl`${rawHtml(ok? (imp? tpl`<div class="mini dc-ok">${imp} — 지금은 이상 없음</div>` : '') : tpl`<dl class="dc-dl">${rawHtml(imp? tpl`<div><dt>업무 영향</dt><dd>${imp}</dd></div>` : '')}<div><dt>대상</dt><dd>${String(r.items.length)}건 — ${r.items.slice(0,3).map(function(it){ return it.label; }).join(' · ')}${r.items.length>3? ' 외 '+(r.items.length-3)+'건' : ''}</dd></div>`+
        tpl`<div><dt>해결 행동</dt><dd>${r.go? r.go+'에서 고치기' : '항목별로 확인'}${r.items.some(function(it){ return it.fix; })? ' · 항목을 누르면 바로 수정 창' : ''}${rawHtml(r.act? tpl` <button type="button" class="pill ghost dc-bulk" data-dcact="${rawHtml(r.id)}">${r.act.label.replace(/^[⚡↩]\s*/,'')} — 미리 보기</button>` : '')}</dd></div></dl>`)}`+
      tpl`${rawHtml(ADM? tpl`<details class="dc-tech"><summary>기술 상세 (관리자)</summary><div class="mini">${r.why}</div></details>` : '')}`+ tpl`${rawHtml(open&&!ok&&r.items.some(function(it){ return it.fix; })? '<div class="mini" style="margin:8px 0 0 26px">항목을 누르면 수정 창이 열립니다 — 저장하면 다음 항목으로 넘어갑니다</div>':'')}`+ tpl`${rawHtml(open&&!ok? tpl`<table class="rn-tbl" style="margin:8px 0 0 26px;width:calc(100% - 26px)"><tbody>${rawHtml(r.items.slice(0,60).map(function(it,i){ return tpl`<tr><td><a href="#" data-dcgo="${rawHtml(r.id)}:${rawHtml(i)}">${it.label}</a></td><td class="mini">${it.sub||''}${rawHtml(it.act? tpl` <button type="button" class="pill ghost" style="padding:1px 8px;font-size:12px" data-dcitem="${rawHtml(r.id)}:${rawHtml(i)}">${it.act.label}</button>`:'')}</td></tr>`; }).join(''))}${rawHtml(r.items.length>60? tpl`<tr><td colspan="2" class="mini">… 외 ${r.items.length-60}건 (엑셀로 전체)</td></tr>`:'')}</tbody></table>`:'')}`+
      tpl`</div>`; };
  h+=list.filter(function(r){ return r.items.length; }).map(cardOf).join('');
  if(nOk) h+=tpl`<details class="dc-okall"${rawHtml(DC.okOpen?' open':'')}><summary>이상 없는 규칙 ${String(nOk)}개</summary>${rawHtml(list.filter(function(r){ return !r.items.length; }).map(cardOf).join(''))}</details>`;
  host.innerHTML=h;
  host.querySelectorAll('#dcSev button').forEach(function(b){ b.onclick=function(){ DC.sev=b.dataset.s; renderDataCheck(); }; });
  host.querySelectorAll('[data-dc]').forEach(function(d){ d.onclick=function(){ var r=rules.filter(function(x){ return x.id===d.dataset.dc; })[0]; if(!r||!r.items.length) return; DC.open[r.id]=!DC.open[r.id]; renderDataCheck(); }; });
  host.querySelectorAll('[data-dcgo]').forEach(function(a){ a.onclick=function(e){ e.preventDefault(); e.stopPropagation(); var p=a.dataset.dcgo.split(':'); var r=rules.filter(function(x){ return x.id===p[0]; })[0]; var it=r&&r.items[+p[1]]; if(!it) return;
    if(it.fix) dcFixOpen(r.id, +p[1]); else if(it.go) it.go(); else if(it.act) it.act.run(); }; });   /* ㊿+159: 이름은 화면 이동 — 동작(되돌리기 등)은 옆 버튼으로만 */   /* ㊿+148: 고칠 수 있는 항목은 수정 창, 아니면 예전처럼 화면 이동 */
  host.querySelectorAll('[data-dcact]').forEach(function(b){ b.onclick=function(e){ e.stopPropagation(); var r=rules.filter(function(x){ return x.id===b.dataset.dcact; })[0]; if(r&&r.act) r.act.run(); }; });
  host.querySelectorAll('[data-dcitem]').forEach(function(b){ b.onclick=function(e){ e.stopPropagation(); var p=b.dataset.dcitem.split(':'); var r=rules.filter(function(x){ return x.id===p[0]; })[0]; var it=r&&r.items[+p[1]]; if(it&&it.act) it.act.run(); }; });
  host.querySelector('#dcRefresh').onclick=function(){ renderDataCheck(); };
  var oka=/** @type {any} */(host.querySelector('.dc-okall')); if(oka) oka.ontoggle=function(){ DC.okOpen=oka.open; };
  dcLogOnce(cnt, rules);
  host.querySelector('#dcXlsx').onclick=function(){ var out=[]; rules.forEach(function(r){ r.items.forEach(function(it){ out.push([DC_SEV[r.sev][1], r.title, it.label, it.sub||'', r.go]); }); }); if(!out.length){ toast('내보낼 항목이 없습니다','전부 이상 없음'); return; } xlsxAoa('데이터점검_'+new Date().toISOString().slice(0,10), ['심각도','규칙','항목','내용','고치는 화면'], out); };
}
/* 포탈 renewScan(T) ↔ DB renew_watch(p_month) 대조 — 같은 DATA 배열에 대해 1회만 호출(DC.rw.src 로 기억) · 결과 {T, portalN, dbN, diff:[{id,cust,kind,side,other}], error} */
export function dcRenewSync(){
  var rows=(ST.DATA&&ST.DATA.rows)||[], T=(ST.DATA&&ST.DATA.nowIdx)||0;
  if(!rows.length || !ST.SB_TOKEN) return; if(DC.rw && DC.rw.src===rows && DC.rw.T===T) return;
  DC.rw={src:rows, T:T, pending:true};
  var RS=null; try{ RS=renewScan(T); }catch(e){ RS={lapsed:[],due:[],next:[]}; }
  var portal={}; ['lapsed','due','next'].forEach(function(k){ (RS[k]||[]).forEach(function(r){ portal[r._id]={kind:k, cust:r.cust}; }); });
  fetch(SB_URL+'/rest/v1/rpc/renew_watch',{method:'POST', headers:sbHeaders(true), body:JSON.stringify({p_month:idxDate(T)})}).then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }).then(function(db){
    var dbm={}; (db||[]).forEach(function(x){ if(/^(lapsed|due|next)$/.test(x.kind)) dbm[x.contract_id]={kind:x.kind, cust:x.customer}; });
    var diff=[];
    Object.keys(portal).forEach(function(id){ var d=dbm[id]; if(!d) diff.push({id:+id, cust:portal[id].cust, kind:portal[id].kind, side:'portal'}); else if(d.kind!==portal[id].kind) diff.push({id:+id, cust:portal[id].cust, kind:portal[id].kind, side:'portal', other:d.kind}); });
    Object.keys(dbm).forEach(function(id){ if(!portal[id]) diff.push({id:+id, cust:dbm[id].cust, kind:dbm[id].kind, side:'db'}); });
    DC.rw={src:rows, T:T, portalN:Object.keys(portal).length, dbN:Object.keys(dbm).length, diff:diff};
    if(ST.CUR_VIEW==='dcheck') renderDataCheck();
  }).catch(function(e){ DC.rw={src:rows, T:T, error:String(e.message||e).slice(0,120), diff:[], portalN:Object.keys(portal).length, dbN:0}; if(ST.CUR_VIEW==='dcheck') renderDataCheck(); });
}
/* 점검 결과를 세션당 1회 change_log(action 'data_check') 에 남김 — 배포 전후·날짜별 어긋남 추이를 기록 탭·AI 가 볼 수 있게 (㊿+137) */
export function dcLogOnce(cnt, rules){
  if(DC._logged || !ST.SB_TOKEN || IS_QA) return; DC._logged=true;
  var top={}; rules.forEach(function(r){ if(r.items.length) top[r.id]=r.items.length; });
  try{ logChange('data_check','dcheck',APP_VER,{crit:cnt.crit, warn:cnt.warn, info:cnt.info, rules:top}); }catch(e){}
}
/* 고객사 병합 창 — 남길 고객사를 고르면 나머지를 하나씩 merge_customers(keep, drop) (SQL 93 · 관리자 이상 · SECURITY DEFINER) */
/* ===== ㊿+148 데이터 점검 — 항목을 누르면 수정 창 (사용자: «데이터 점검에서 실제 바로 처리할 수 있도록» · «항목 누르면 수정 창») =====
   · 항목의 fix = {tbl, view, id, f:[GRIDS 열 키], ex:'rev_now'|'rev_after'|'mrr_now'|'', bad:[목록 밖 값 칸]} — dcRules() 에서 붙임
   · 칸은 그 표(GRIDS[view])의 편집 칸을 그대로 씀(editCell · 목록·날짜 동작 같음) · 고객사(customer_id)·원계약(parent_contract_id)은 전용 칸
   · 저장 = 바뀐 칸만 PATCH(+ change_log «데이터 점검») → 데이터 다시 읽기 → 이 항목이 규칙에서 빠졌으면 같은 규칙의 다음 항목, 아직 걸리면 그대로 두고 이유 표시
   · 쓰기 권한은 그 표의 화면 기준(canWrite(view)) — 없으면 보기만 */
export var DCF={rule:'', idx:0, busy:false};
export var DCF_RAW={contracts:'contracts', equipment_orders:'orders', equipment_assets:'assets', oi_deals:'oi'};
export function dcFixRaw(fix){ var arr=(ST.RAWX&&ST.RAWX[DCF_RAW[fix.tbl]])||[]; return arr.filter(function(x){ return x.id===fix.id; })[0]||null; }
export function dcFixCtx(fix, raw){
  if(!raw) return '';
  var kv=function(k,v){ return tpl`<span class="mini" style="color:var(--muted)">${rawHtml(k)}</span> ${v==null||v===''? '—':String(v)}`; };
  var cu=function(id){ var c=(ST.RAWX.customers||[]).filter(function(x){ return x.id===id; })[0]; return c? c.name : '?'; };
  var parts;
  if(fix.tbl==='contracts') parts=[kv('고객사', cu(raw.customer_id)), kv('서비스', llineVer(raw.line, raw.version)), kv('상태', raw.status), kv('기간', String(raw.start_month||'').slice(0,7)+' ~ '+(raw.end_month? String(raw.end_month).slice(0,7):'진행')), kv('MRR', raw.mrr? won(raw.mrr)+' 천원':''), kv('채널', raw.channel), kv('계약', '#'+raw.id)];
  else if(fix.tbl==='equipment_orders') parts=[kv('고객사', raw.customer), kv('모델', (raw.model||'')+' × '+(raw.qty||1)), kv('상태', raw.status), kv('채널', raw.channel), kv('설치', raw.install_date), kv('신청', '#'+raw.id)];
  else if(fix.tbl==='equipment_assets') parts=[kv('시리얼', raw.serial), kv('모델', raw.model), kv('고객사', raw.customer), kv('상태', raw.status), kv('출고', raw.deployed_date), kv('행', '#'+raw.id)];
  else parts=[kv('고객사', raw.customer), kv('사업명', raw.deal_name), kv('단계', raw.stage), kv('예상', String(raw.expect_month||'').slice(0,7)), kv('담당', raw.owner), kv('OI', '#'+raw.id)];
  return tpl`<div class="dcf-ctx">${rawHtml(parts.join('<span class="dcf-dot">·</span>'))}</div>`;
}
export function dcFixFields(fix, raw, g){
  var cols=(g&&g.cols)||[], T=(ST.DATA&&ST.DATA.nowIdx)||0;
  var h=fix.f.map(function(k){
    var bad=(fix.bad||[]).indexOf(k)>=0, cur=raw? raw[k] : null, inner='', lbl='';
    if(k==='customer_id'){
      lbl='고객사';
      inner=tpl`<input id="dcfCust" list="dcfCustList" autocomplete="off" placeholder="고객사 이름 입력 후 목록에서 선택" value="">`+
        tpl`<datalist id="dcfCustList">${rawHtml((ST.RAWX.customers||[]).slice().sort(function(a,b){ return String(a.name).localeCompare(String(b.name),'ko'); }).map(function(c){ return tpl`<option value="${c.name}"></option>`; }).join(''))}</datalist>`;
    } else if(k==='parent_contract_id'){
      lbl='원계약';
      var mine=(ST.RAWX.contracts||[]).filter(function(c){ return raw && c.customer_id===raw.customer_id && c.id!==raw.id && !c.parent_contract_id; });
      inner=tpl`<select id="dcfParent"><option value="">— 원계약 없음 (독립 계약으로) —</option>${rawHtml(mine.map(function(c){ return tpl`<option value="${rawHtml(c.id)}">#${rawHtml(c.id)} · ${llineVer(c.line, c.version)} · ${String(c.start_month||'').slice(0,7)} ~ ${c.end_month? String(c.end_month).slice(0,7):'진행'} · ${c.status||''}</option>`; }).join(''))}</select>`;
    } else {
      var c=cols.filter(function(x){ return x.k===k; })[0]; if(!c) return '';
      lbl=c.l; inner=editCell(c, cur);
      if(c.won && c.t==='number') lbl=tpl`${lbl.replace(/\(천원\)$/,'')} <span class="mini">(천원)</span>`;
    }
    return tpl`<div class="dcf-row${bad? ' bad':''}"><label>${rawHtml(lbl)}</label><div class="dcf-in">${rawHtml(inner)}${rawHtml(bad? tpl`<div class="mini dcf-bad">목록에 없는 값 «${cur==null? '':String(cur)}» — 목록 값으로 고르세요 (정식 값이면 관리자 › 코드 관리에서 추가)</div>`:'')}</div></div>`;
  }).join('');
  if(fix.ex==='rev_now'){
    var mrr=raw&&raw.mrr? wonToKw(raw.mrr) : '';
    h+=tpl`<div class="dcf-row"><label>${mk(T)} 월 매출 <span class="mini">(천원)</span></label><div class="dcf-in"><input id="dcfRev" type="number" min="0" step="any" value="${mrr}" placeholder="천원"><div class="mini">월납이면 이달 금액을 넣고 저장 · 연납·일시납이면 위 «과금방식»만 바꾸고 이 칸은 비우세요</div></div></div>`;
  }
  if(fix.ex==='mrr_now' && fix.now) h+=tpl`<div class="dcf-row"><label></label><div class="dcf-in"><button type="button" class="pill ghost" id="dcfUseNow">이달 월 매출 ${won(fix.now)} 천원으로 맞추기</button></div></div>`;
  if(fix.ex==='rev_after'){
    var n=0, sum=0, end=raw&&raw.end_month? String(raw.end_month).slice(0,7) : '';
    var k0=(ST.DATA.rows||[]).findIndex(function(r){ return r._id===fix.id; });
    if(k0>=0 && ST.MAT[k0]) ST.MAT[k0].forEach(function(v,i){ if(v && end && mk(i)>end){ n++; sum+=v; } });
    h+=tpl`<div class="dcf-row"><label>종료월 뒤 매출</label><div class="dcf-in"><label class="mini" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="dcfRevDel" checked> 종료월 뒤 월 매출 ${rawHtml(n)}개월 (${won(sum)} 천원) 삭제</label><div class="mini">종료월을 고치면 고친 종료월 뒤만 지웁니다</div></div></div>`;
  }
  return h;
}
export function dcFixClose(){ var o=document.getElementById('ovlDcFix'); if(o) o.remove(); DCF.busy=false; }
export function dcFixOpen(ruleId, idx, msg){
  var rules=dcRules(); DC._rules=rules;
  var rule=rules.filter(function(x){ return x.id===ruleId; })[0];
  if(!rule || !rule.items.length){ dcFixClose(); if(rule) toast('✅ «'+rule.title+'» 모두 정리했습니다', '이 규칙에 남은 항목이 없습니다'); if(ST.CUR_VIEW==='dcheck') renderDataCheck(); return; }
  idx=Math.max(0, Math.min(idx||0, rule.items.length-1)); DCF.rule=ruleId; DCF.idx=idx;
  var it=rule.items[idx], fix=it.fix;
  if(!fix){ dcFixClose(); if(it.act) it.act.run(); else if(it.go) it.go(); return; }
  var g=GRIDS[fix.view], raw=dcFixRaw(fix), can=canWrite(fix.view) && !ST.IS_VIEWER_ROLE;
  var ov=document.getElementById('ovlDcFix');
  if(!ov){ ov=document.createElement('div'); ov.id='ovlDcFix'; ov.className='ovl on'; ov.style.cssText='z-index:9000;align-items:center'; document.body.appendChild(ov); }
  var sv=DC_SEV[rule.sev]||['','',''];
  ov.innerHTML=tpl`<div class="modal dcf" style="width:min(620px,100%);padding:20px 22px" role="dialog" aria-modal="true" aria-labelledby="dcfTitle">`+
    tpl`<div style="display:flex;gap:8px;align-items:center;margin-bottom:4px"><span>${rawHtml(sv[0])}</span><h3 id="dcfTitle" style="margin:0;font-size:15px;flex:1">${rule.title}</h3>`+
      tpl`<button type="button" class="pill ghost" id="dcfPrev" aria-label="이전 항목"${idx? '':' disabled'}>◀</button><span class="mini" id="dcfPos">${rawHtml(idx+1)} / ${rule.items.length}</span><button type="button" class="pill ghost" id="dcfNext" aria-label="다음 항목"${idx<rule.items.length-1? '':' disabled'}>▶</button></div>`+
    tpl`<div class="mini" style="line-height:1.6;margin-bottom:10px">${rule.why}</div>`+
    tpl`<div class="dcf-item"><b>${it.label}</b><div class="mini">${it.sub||''}</div>${rawHtml(dcFixCtx(fix, raw))}</div>`+ tpl`${rawHtml(raw? tpl`<div class="dcf-form" id="dcfForm">${rawHtml(dcFixFields(fix, raw, g))}</div>` : '<p class="cap">이 행을 메모리 데이터에서 찾지 못했습니다 — «화면에서 보기»로 여세요.</p>')}`+ tpl`${rawHtml(can? '' : tpl`<p class="mini" style="color:var(--warn-ink);margin:8px 0 0">이 화면(«${it.fix.view}»)의 쓰기 권한이 없어 보기만 됩니다.</p>`)}`+
    tpl`<div class="mmsg" id="dcfMsg" style="min-height:18px;margin-top:8px">${rawHtml(msg? esc(msg):'')}</div>`+
    tpl`<div class="mact" style="display:flex;gap:8px;align-items:center;margin-top:10px"><button type="button" class="pill ghost" id="dcfGo">화면에서 보기</button><span style="flex:1"></span><button type="button" class="pill ghost" id="dcfClose">닫기</button>${rawHtml(raw&&can? '<button type="button" class="pill pri" id="dcfSave">저장</button>':'')}</div></div>`;
  var form=ov.querySelector('#dcfForm');
  if(form){ try{ wireRowInputs(form, g); }catch(e){}
    form.querySelectorAll('.dcf-row').forEach(function(row, i){ var lab=row.querySelector(':scope > label'), el=row.querySelector('.dcf-in input:not([type=hidden]), .dcf-in select, .dcf-in textarea'); if(lab && el && lab.textContent.trim()){ if(!el.id) el.id='dcf_f'+i; lab.htmlFor=el.id; } });   /* 칸 이름(접근성) */
    if(!can) form.querySelectorAll('input,select,textarea,button').forEach(function(e){ e.disabled=true; }); }
  var un=ov.querySelector('#dcfUseNow'); if(un) un.onclick=function(){ var i=form.querySelector('[data-k="mrr"]'); if(i){ i.value=wonToKw(fix.now); i.dispatchEvent(new Event('input',{bubbles:true})); } };   /* 칸은 천원 (㊿+157) */
  amtHint(ov.querySelector('#dcfRev'), raw&&raw.mrr, true);
  ov.querySelector('#dcfPrev').onclick=function(){ dcFixOpen(ruleId, idx-1); };
  ov.querySelector('#dcfNext').onclick=function(){ dcFixOpen(ruleId, idx+1); };
  ov.querySelector('#dcfClose').onclick=dcFixClose;
  ov.querySelector('#dcfGo').onclick=function(){ dcFixClose(); if(it.go) it.go(); };
  var sb=ov.querySelector('#dcfSave'); if(sb) sb.onclick=function(){ dcFixSave(rule, it, raw, g, form); };
  if(msg){ var m=ov.querySelector('#dcfMsg'); m.style.color='var(--warn-ink)'; }
  setTimeout(function(){ var f=form&&form.querySelector('input:not([disabled]),select:not([disabled])'); if(f) try{ f.focus(); }catch(e){} }, 30);
}
export function dcFixNorm(k, v){ if(v==null || v==='') return ''; if(/_month$/.test(k)) return String(v).slice(0,7); if(typeof v==='boolean') return v? '1':''; return String(v); }
export async function dcFixSave(rule, it, raw, g, form){
  if(DCF.busy) return;
  var fix=it.fix, msgEl=document.getElementById('dcfMsg');
  var say=function(t,bad){ if(msgEl){ msgEl.textContent=t||''; msgEl.style.color=bad? 'var(--critical)':'var(--muted)'; } };
  var body={}, extra=/** @type {Array<{m:string, p:string, b?:any, d?:string}>} */ ([]);
  try{
    var inp=readRowInputs(form, g);
    Object.keys(inp).forEach(function(k){ if(fix.f.indexOf(k)>=0 && dcFixNorm(k, inp[k])!==dcFixNorm(k, raw[k])) body[k]=inp[k]; });
  }catch(e){ say(String(e.message||e), true); return; }
  if(fix.f.indexOf('customer_id')>=0){
    var nm=String((form.querySelector('#dcfCust')||{}).value||'').trim();
    if(!nm){ say('고객사를 입력하고 목록에서 고르세요', true); return; }
    var hit=(ST.RAWX.customers||[]).filter(function(c){ return c.name===nm; })[0];
    if(!hit){ var key=(nmKeys(nm)||[])[0]; hit=(ST.RAWX.customers||[]).filter(function(c){ return key && (nmKeys(c.name)||[])[0]===key; })[0]; }
    if(!hit){ say('«'+nm+'» 는 고객사 목록에 없습니다 — 고객 360 이나 입력·수정에서 먼저 고객사를 만드세요', true); return; }
    if(hit.id!==raw.customer_id) body.customer_id=hit.id;
  }
  if(fix.f.indexOf('parent_contract_id')>=0){
    var pv=(form.querySelector('#dcfParent')||{}).value||''; var np=pv? +pv : null;
    if(np!==(raw.parent_contract_id||null)) body.parent_contract_id=np;
  }
  var sm=dcFixNorm('start_month', 'start_month' in body? body.start_month : raw.start_month), em=dcFixNorm('end_month', 'end_month' in body? body.end_month : raw.end_month);
  if(fix.tbl==='contracts' && sm && em && em<sm){ say('종료월('+em+')이 시작월('+sm+')보다 앞섭니다', true); return; }
  var T=(ST.DATA&&ST.DATA.nowIdx)||0;
  if(fix.ex==='rev_now'){ var rv=String((form.querySelector('#dcfRev')||{}).value||'').trim(); if(rv!==''){ var amt=kwToWon(rv)||0; if(amt>0 && !amtGuard(amt, raw&&raw.mrr, mk(T)+' 월 매출', true)){ say('저장하지 않았습니다 — 금액을 확인하세요', true); return; } if(!(amt>0)){ say('이달 매출은 0보다 큰 천원 금액으로 넣으세요', true); return; } extra.push({m:'POST', p:'monthly_revenue', b:{contract_id:fix.id, month:idxDate(T), amount:amt}, d:mk(T)+' 매출 '+won(amt)+' 천원'}); } }
  if(fix.ex==='rev_after' && (form.querySelector('#dcfRevDel')||{}).checked && em){ extra.push({m:'DELETE', p:'monthly_revenue?contract_id=eq.'+fix.id+'&month=gt.'+em+'-01', d:'종료월('+em+') 뒤 매출 삭제'}); }
  /* ㊿+157 금액(천원 칸) 확인 · 계약의 MRR·기간·상태를 바꾸면 월 매출도 같이 맞춤(계약 표 ✎ 와 같은 규칙 · ctRevPlan) */
  if(body.mrr!=null && Number(body.mrr)!==Number(raw&&raw.mrr||0) && !amtGuard(body.mrr, raw&&raw.mrr, 'MRR', true)){ say('저장하지 않았습니다 — 금액을 확인하세요', true); return; }
  if(fix.tbl==='contracts' && raw && Object.keys(body).length){ var rp=ctRevPlan(raw, body, {noMrr: fix.ex==='mrr_now'}); if(rp.bad){ say(rp.bad, true); return; }   /* «이달 월 매출로 MRR 맞추기»는 MRR 만 (월 매출이 기준) */
    if(rp.ops.length){ if(!confirm('월 매출(월별 종합 장표)도 같이 맞춥니다:\n\n'+rp.lines.join('\n')+'\n\n[확인] 함께 저장 · [취소] 저장하지 않음')){ say('저장하지 않았습니다', true); return; }
      extra=extra.concat(rp.ops.map(function(o){ return {m:o.m, p:o.p, b:o.b, d:'월 매출 맞춤'}; })); } }
  if(!Object.keys(body).length && !extra.length){ say('바뀐 값이 없습니다', true); return; }
  var sbtn=document.getElementById('dcfSave'); DCF.busy=true; if(sbtn) sbtn.disabled=true; say('저장 중…');
  try{
    if(Object.keys(body).length){
      var pb=Object.assign({}, body); if(fix.tbl==='contracts') pb.updated_at=new Date().toISOString();
      await sbWrite('PATCH', fix.tbl+'?id=eq.'+fix.id, pb, undefined, fix.view);
    }
    for(var i=0;i<extra.length;i++) await sbWrite(extra[i].m, extra[i].p, extra[i].b, undefined, fix.view);
    try{ await logChange('update', fix.tbl, fix.id, Object.assign({_via:'데이터 점검 · '+rule.title}, body, extra.length? {_also:extra.map(function(x){ return x.d; })}:{})); }catch(e){}
    if(fix.tbl==='equipment_orders'){ try{ await syncOrderAssets(Object.assign({}, raw, body)); }catch(e){} }
    say('저장됨 — 다시 점검하는 중…');
    var d=await loadFromDb(); onData(d);
    await new Promise(function(res){ try{ ensureLeadSrc(function(){ res(); }); }catch(e){ res(); } });
    if(ST.CUR_VIEW==='dcheck') renderDataCheck();
    DCF.busy=false;
    var r2=dcRules().filter(function(x){ return x.id===rule.id; })[0], k2=r2? r2.items.findIndex(function(x){ return x.key===it.key; }) : -1;
    if(k2>=0){ dcFixOpen(rule.id, k2, '저장했지만 아직 이 규칙에 걸립니다 — '+(r2.items[k2].sub||'값을 다시 확인하세요')); return; }
    toast('고쳤습니다', it.label+(r2&&r2.items.length? ' · 이 규칙 남은 '+r2.items.length+'건':''));
    dcFixOpen(rule.id, DCF.idx);
  }catch(e){ DCF.busy=false; if(sbtn) sbtn.disabled=false; say('저장 실패: '+String(e.message||e).slice(0,200), true); }
}
export function dcMergeDlg(list, cn){
  var old=document.getElementById('ovlDcMerge'); if(old) old.remove();
  var ov=document.createElement('div'); ov.id='ovlDcMerge'; ov.className='ovl on'; ov.style.cssText='z-index:9000;align-items:center';
  ov.innerHTML=tpl`<div class="modal" style="width:min(520px,100%);padding:22px" role="dialog" aria-modal="true" aria-labelledby="dcmTitle">`+
    tpl`<h3 id="dcmTitle" style="margin:0 0 6px;font-size:18px">고객사 병합</h3>`+
    tpl`<p class="cap" style="margin:0 0 12px">남길 고객사를 고르세요. 나머지 고객사의 <b>계약·월 매출·장비 신청/현황·OI·인바운드·MDR</b> 은 남길 고객사로 옮겨지고, 그 이름은 <b>별칭</b>으로 남습니다(검색·자동 매칭에 계속 잡힘). 되돌리려면 change_log 의 merge_customers 기록을 참고해 수동으로.</p>`+
    tpl`<div id="dcmList" style="display:grid;gap:6px">${rawHtml(list.map(function(c,i){ return tpl`<label style="display:flex;gap:10px;align-items:center;padding:8px 10px;border:1px solid var(--ring);border-radius:10px;cursor:pointer"><input type="radio" name="dcmKeep" value="${rawHtml(c.id)}"${i===0? ' checked':''}><span style="flex:1"><b>${c.name}</b> <span class="mini">#${rawHtml(c.id)} · 계약 ${rawHtml(cn[c.id]||0)}건${rawHtml(c.aliases&&c.aliases.length? ' · 별칭 '+esc(c.aliases.join(', ')):'')}</span></span></label>`; }).join(''))}</div>`+
    tpl`<div class="mmsg" id="dcmMsg" style="min-height:18px;margin-top:8px"></div>`+
    tpl`<div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end"><button type="button" class="pill ghost" id="dcmCancel">취소</button><button type="button" class="pill" id="dcmGo">병합</button></div></div>`;
  document.body.appendChild(ov);
  var msgEl=ov.querySelector('#dcmMsg'); function say(t,bad){ msgEl.textContent=t||''; msgEl.style.color=bad? 'var(--critical,#d03b3b)':'var(--muted)'; }
  ov.querySelector('#dcmCancel').onclick=function(){ ov.remove(); };
  ov.querySelector('#dcmGo').onclick=async function(){
    var keep=+(ov.querySelector('input[name="dcmKeep"]:checked')||{value:''}).value; if(!keep){ say('남길 고객사를 고르세요', true); return; }
    var drops=list.filter(function(c){ return c.id!==keep; }); var keepC=list.filter(function(c){ return c.id===keep; })[0];
    if(!confirm('«'+keepC.name+'» 를 남기고 '+drops.map(function(c){ return '«'+c.name+'»'; }).join(', ')+' 를 합칩니다. 계속할까요?')) return;
    this.disabled=true; say('병합 중…');
    var done=0, tot={contracts:0, orders:0, assets:0, oi:0};
    try{
      for(var i=0;i<drops.length;i++){
        var r=await sbWrite('POST','rpc/merge_customers',{p_keep:keep, p_drop:drops[i].id});
        done++; ['contracts','orders','assets','oi'].forEach(function(k){ tot[k]+=(r&&r[k])||0; });
      }
      toast('고객사 병합 완료', keepC.name+' ← '+done+'곳 · 계약 '+tot.contracts+' · 장비 '+(tot.orders+tot.assets)+' · OI '+tot.oi);
      ov.remove(); DC._rules=null;
      loadFromDb().then(function(d){ onData(d); if(ST.CUR_VIEW==='dcheck') renderDataCheck(); }).catch(function(){});
    }catch(e){ say('병합 실패: '+(e.message||e), true); this.disabled=false; }
  };
}
/* LIVE 인데 이달 매출 0 → mrr 금액으로 monthly_revenue 한 번에 넣기 (월납 계약만 · 확인 후 · 한 번의 POST) */
export async function dcFillMrr(rows, T){
  if(!rows.length) return;
  var ym=mk(T), body=rows.map(function(r){ return {contract_id:r._id, month:idxDate(T), amount:Math.round(r.mrr)}; });   // r.mrr · monthly_revenue.amount 모두 «원»
  var sum=rows.reduce(function(a,r){ return a+(r.mrr||0); }, 0);
  /* ㊿+170 미리 보기 창에서 확인한 뒤에만 실행 */
  previewDlg({title:ym+' 월 매출을 MRR 로 채우기 — 미리 보기', intro:rows.length+'건 · 합계 '+won(sum)+' 천원을 월 매출(monthly_revenue)에 넣습니다. 연납·일시납·분기납·반년납 계약은 이미 뺐습니다. 맞으면 아래 버튼을 누르세요.',
    head:['고객사','서비스','상태','월','넣을 금액(천원)'], rows:rows.map(function(r){ return [r.cust, lline(r.line), r.status||'', ym, won(r.mrr||0)]; }), ok:rows.length+'건 반영', run:function(){ dcFillMrrRun(rows, T, body, ym, sum); }});
}
export async function dcFillMrrRun(rows, T, body, ym, sum){
  try{
    await sbWrite('POST','monthly_revenue', body);
    await logChange('bulk_fill','monthly_revenue',ym,{n:rows.length, sum:sum, ids:rows.map(function(r){ return r._id; }).slice(0,200)});
    toast('이달 매출 채움', rows.length+'건 · '+won(sum)+' 천원'); DC._rules=null;
    loadFromDb().then(function(d){ onData(d); if(ST.CUR_VIEW==='dcheck') renderDataCheck(); }).catch(function(){});
  }catch(e){ toast('채우기 실패', (e.message||String(e)).slice(0,160), 'warn'); }
}
/* ===== 유입경로 분석 (contracts.lead_src · SQL 80) — 유입경로별 매출 규모 ===== */
export var LEAD_FETCHED=null;   // 마지막으로 보강한 RAWX.contracts 배열 — 새로 불러오면(배열이 바뀌면) 다시 보강 (㊿+127: 예전엔 한 번만 받아 저장 뒤 새로고침에 값이 사라졌음)
export function ensureLeadSrc(cb){
  var cts=ST.RAWX.contracts||[];
  if(!cts.length || LEAD_FETCHED===cts || cts.some(function(c){ return c.lead_src!==undefined && c.auto_renew!==undefined; })){ if(cb) cb(false); return; }
  LEAD_FETCHED=cts;   // load_all() 이 열을 명시하는 옛 버전 → id·lead_src(·auto_renew) 만 한 번 더 읽어 합침. auto_renew 열이 아직 없으면(SQL 84 전) lead_src 만
  sbTry('contracts?select=id,lead_src,auto_renew').then(function(rows){ return rows || sbTry('contracts?select=id,lead_src'); }).then(function(rows){
    if(!rows){ if(cb) cb(false); return; }
    var m={}, a={}; rows.forEach(function(r){ m[r.id]=r.lead_src||null; a[r.id]=!!r.auto_renew; });
    cts.forEach(function(c){ c.lead_src=m[c.id]||null; c.auto_renew=!!a[c.id]; });
    ((ST.DATA&&ST.DATA.rows)||[]).forEach(function(r){ r.lead=m[r._id]||''; r.autoRenew=!!a[r._id]; });
    if(cb) cb(true);
  });
}
export var LS={base:null, line:'', pick:''};
export var LEAD_COLOR={'직접영업':'--s1','파트너영업':'--s3','인바운드':'--s2','프로모션':'--s4','기타':'--muted','미지정':'--axis'};
export function leadOf(r){ return r.lead||'미지정'; }
export function renderLeadSrc(){
  var tw=$('#dvTable').parentElement; tw.style.display='none';
  var host=bizHostEl(); host.style.display='';
  if(!ST.DATA || !ST.DATA.rows || !ST.DATA.rows.length){ host.innerHTML='<div class="cap" style="padding:30px;text-align:center">데이터가 아직 없습니다</div>'; return; }
  if(LS.base==null || LS.base>=ST.M) LS.base=STATE.base;
  var b=LS.base, rows=ST.DATA.rows, SRC=LEAD_OPTS.concat(['미지정']);
  var y0=yOf(b), yStart=Math.max(0, b-((b-yOf0Idx(y0))||0));
  function yOf0Idx(y){ var i=dIdx(y+'-01-01'); return i==null? 0 : Math.max(0,i); }
  yStart=yOf0Idx(y0);
  var m12=[]; for(var i=Math.max(0,b-11); i<=b; i++) m12.push(i);
  /* 집계 */
  var agg={}; SRC.forEach(function(k){ agg[k]={mrr:0, ytd:0, n:0, custs:{}, newN:0, byLine:{}, trend:m12.map(function(){ return 0; }), rows:[]}; });
  var total=0, totYtd=0, lineSet={};
  rows.forEach(function(r,k){
    if(LS.line && r.line!==LS.line) return;
    var src=leadOf(r), a=agg[src]||agg['미지정'], v=ST.MAT[k][b]||0;
    if(v){ a.mrr+=v; total+=v; a.n++; a.custs[r.cust]=1; a.byLine[r.line]=(a.byLine[r.line]||0)+v; lineSet[r.line]=1; a.rows.push({k:k, v:v}); }
    for(var i=yStart;i<=b;i++){ var t=ST.MAT[k][i]||0; a.ytd+=t; totYtd+=t; }
    m12.forEach(function(mi,j){ a.trend[j]+=ST.MAT[k][mi]||0; });
    if(!r.parent && r.startIdx!=null && r.startIdx>=yStart && r.startIdx<=b) a.newN++;
  });
  var lines=LINE_OPTS.filter(function(l){ return lineSet[l]; }).concat(Object.keys(lineSet).filter(function(l){ return LINE_OPTS.indexOf(l)<0; }));
  var order=SRC.slice().sort(function(x,y){ return Number(x==='미지정')-Number(y==='미지정') || agg[y].mrr-agg[x].mrr; });
  var unassigned=agg['미지정'];
  /* 헤더 컨트롤 */
  var mopts=''; for(i=0;i<ST.M;i++) mopts+=tpl`<option value="${rawHtml(i)}"${i===b?' selected':''}>${mk(i)}</option>`;
  var h=tpl`<div class="dbar" style="margin-bottom:12px;flex-wrap:wrap;gap:8px;align-items:center">`+
    tpl`<label class="mini">기준월 <select id="lsBase" class="qb-in" style="height:30px;width:auto">${rawHtml(mopts)}</select></label>`+
    tpl`<label class="mini">서비스 <select id="lsLine" class="qb-in" style="height:30px;width:auto"><option value="">전체</option>${rawHtml(LINE_OPTS.map(function(l){ return tpl`<option value="${rawHtml(l)}"${LS.line===l?' selected':''}>${lline(l)}</option>`; }).join(''))}</select></label>`+
    tpl`<span class="mini">기준월 MRR 합계 <b>${won(total)}천원</b> · ${rawHtml(y0)}년 누적 <b>${won(totYtd)}천원</b> · 단위 천원</span>`+ tpl`${rawHtml(unassigned.n? tpl`<span class="ctag warn" style="margin-left:auto" title="유입경로가 비어 있는 계약">미지정 ${rawHtml(unassigned.n)}건 · ${won(unassigned.mrr)}천원</span><button type="button" class="cbtn" id="lsFix" style="height:26px;font-size:12px">계약 관리에서 지정 →</button>`:'')}`+
    tpl`</div>`;
  /* 타일 */
  h+=tpl`<div class="kpis" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:14px">${rawHtml(order.map(function(src){
    var a=agg[src], sh=total? a.mrr/total*100 : 0, col=cssv(LEAD_COLOR[src]||'--muted');
    return tpl`<div class="kpi ls-tile" data-src="${src}" style="padding:12px 14px;cursor:pointer${rawHtml(LS.pick===src?';outline:2px solid '+col:'')}" title="누르면 이 유입경로의 계약 목록">`+
      tpl`<div class="k" style="display:flex;align-items:center;gap:6px"><i style="width:9px;height:9px;border-radius:50%;background:${rawHtml(col)};display:inline-block"></i>${src}</div>`+
      tpl`<div style="font-size:22px;font-weight:800;margin-top:2px">${won(a.mrr)} <small style="font-size:12px;font-weight:500;color:var(--muted);white-space:nowrap">천원 · ${sh.toFixed(1)}%</small></div>`+
      tpl`<div class="mini" style="margin-top:4px">계약 ${rawHtml(a.n)}건 · 고객사 ${Object.keys(a.custs).length}곳${rawHtml(a.newN? ' · 올해 신규 '+a.newN+'건':'')}</div>`+
      tpl`<div class="mini">${rawHtml(y0)}년 누적 ${won(a.ytd)}천원</div></div>`; }).join(''))}`+ tpl`</div>`;
  /* 차트 2개 */
  h+=tpl`<div class="ls-2col">`+
    tpl`<div class="pr-card"><div style="font-size:14px;font-weight:650;margin-bottom:8px">유입경로별 MRR <span class="mini">${mk(b)}</span></div><div id="lsBars"></div></div>`+
    tpl`<div class="pr-card"><div style="font-size:14px;font-weight:650;margin-bottom:8px">최근 12개월 추이 <span class="mini">유입경로별 월 매출</span></div><div id="lsTrend" style="height:210px"></div>`+
    tpl`<div class="mini" style="display:flex;gap:12px;flex-wrap:wrap;margin-top:6px">${rawHtml(order.filter(function(src){ return agg[src].trend.some(function(v){ return v>0; }); }).map(function(src){ return tpl`<span><i style="display:inline-block;width:10px;height:3px;border-radius:2px;background:${rawHtml(cssv(LEAD_COLOR[src]||'--muted'))};vertical-align:middle;margin-right:4px"></i>${src}</span>`; }).join(''))}</div></div></div>`;
  /* 표: 유입경로 × 서비스 */
  h+=tpl`<div class="pr-card" style="margin-bottom:14px"><div style="font-size:14px;font-weight:650;margin-bottom:8px">유입경로 × 서비스 <span class="mini">${mk(b)} MRR · 천원</span></div>`+
    tpl`<div class="tbl-wrap" tabindex="0"><table class="dgrid"><thead><tr><th>유입경로</th>${rawHtml(lines.map(function(l){ return tpl`<th class="n">${lline(l)}</th>`; }).join(''))}<th class="n">합계</th><th class="n">비중</th><th class="n">계약</th><th class="n">고객사</th></tr></thead><tbody>`+
    tpl`${rawHtml(order.map(function(src){ var a=agg[src]; return tpl`<tr><td>${src}</td>${rawHtml(lines.map(function(l){ return tpl`<td class="n">${a.byLine[l]? won(a.byLine[l]):'·'}</td>`; }).join(''))}<td class="n"><b>${won(a.mrr)}</b></td><td class="n">${rawHtml(total? (a.mrr/total*100).toFixed(1)+'%':'·')}</td><td class="n">${rawHtml(a.n)}</td><td class="n">${Object.keys(a.custs).length}</td></tr>`; }).join(''))}`+
    tpl`<tr style="font-weight:700;background:var(--surface-2)"><td>합계</td>${rawHtml(lines.map(function(l){ var t=0; order.forEach(function(src){ t+=agg[src].byLine[l]||0; }); return tpl`<td class="n">${won(t)}</td>`; }).join(''))}<td class="n">${won(total)}</td><td class="n">100%</td><td class="n">${rawHtml(order.reduce(function(t,src){ return t+agg[src].n; },0))}</td><td class="n"></td></tr>`+
    tpl`</tbody></table></div></div>`;
  /* 선택한 유입경로의 계약 목록 */
  if(LS.pick && agg[LS.pick]){
    var lst=agg[LS.pick].rows.slice().sort(function(x,y){ return y.v-x.v; });
    h+=tpl`<div class="pr-card"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><div style="font-size:14px;font-weight:650">${LS.pick} — 계약 ${lst.length}건 <span class="mini">${mk(b)} MRR 큰 순</span></div><button type="button" class="cbtn" id="lsPickX" style="height:24px;font-size:12px;margin-left:auto">닫기</button></div>`+
      tpl`<div class="tbl-wrap" tabindex="0" style="max-height:46vh"><table class="dgrid"><thead><tr><th>고객사</th><th>서비스</th><th>판매 채널</th><th>파트너</th><th>시작월</th><th>종료월</th><th class="n">MRR</th></tr></thead><tbody>`+
      tpl`${rawHtml(lst.slice(0,200).map(function(x){ var r=rows[x.k]; return tpl`<tr><td>${r.cust}${rawHtml(r.parent?' <span class="mini">↳부속</span>':'')}</td><td>${lline(r.line)}</td><td>${r.channel||''}</td><td>${r.ptn||''}</td><td>${rawHtml(r.startRaw!=null? esc(mk(r.startRaw)):'·')}</td><td>${rawHtml(r.endRaw!=null? esc(mk(r.endRaw)):'·')}</td><td class="n">${won(x.v)}</td></tr>`; }).join(''))}`+ tpl`${rawHtml(lst.length>200? tpl`<tr><td colspan="7" class="mini">외 ${lst.length-200}건</td></tr>`:'')}</tbody></table></div></div>`;
  }
  host.innerHTML=h;
  /* 차트 그리기 */
  try{ hbars('#lsBars', order.filter(function(src){ return agg[src].mrr>0; }).map(function(src){ return {name:src, v:agg[src].mrr, c:cssv(LEAD_COLOR[src]||'--muted')}; }), total, false); }catch(e){}
  try{ var ser=order.filter(function(src){ return agg[src].trend.some(function(v){ return v>0; }); }).map(function(src){ return {label:src, data:agg[src].trend, color:cssv(LEAD_COLOR[src]||'--muted')}; });
    if(ser.length) Viz.lines(document.getElementById('lsTrend'),{labels:m12.map(function(i){ return mk(i).slice(2).replace('-','.'); }), series:ser, fmt:won, tipFmt:wonFull, fill:false});
    else document.getElementById('lsTrend').innerHTML='<p class="cap">데이터 없음</p>'; }catch(e){}
  /* 이벤트 */
  $('#lsBase').onchange=function(){ LS.base=+this.value; renderLeadSrc(); };
  $('#lsLine').onchange=function(){ LS.line=this.value; renderLeadSrc(); };
  var fx=$('#lsFix'); if(fx) fx.onclick=function(){ switchView('contracts'); setTimeout(function(){ try{ var sr=$('#dvSearch'); if(sr){ sr.value=''; } DV.filters={}; DV.filters.lead_src=[BLANK_LABEL]; DV.page=0; renderGrid(); }catch(e){} }, 80); };
  host.querySelectorAll('.ls-tile').forEach(function(t){ t.onclick=function(){ LS.pick=(LS.pick===t.dataset.src)? '' : t.dataset.src; renderLeadSrc(); }; });
  var px=$('#lsPickX'); if(px) px.onclick=function(){ LS.pick=''; renderLeadSrc(); };
}
export var AK={log:false, q:''};   // AI 지식 화면 상태 — 기록은 기본 숨김(사용자: «학습에 업데이트만 하고 기록은 따로»)
export function renderAiKnow(){
  var tw=$('#dvTable').parentElement; tw.style.display='none';
  var host=bizHostEl(); host.style.display='';
  var L=(ST.RAWX.aiknow||[]).slice().sort(function(a,b){ return (b.id||0)-(a.id||0); });
  /* ㊿+178 SQL 110: 관리자 · 편집자는 «제안» → 슈퍼 관리자가 «반영»해야 AI 에 들어감 (SQL 110 전에는 예전처럼 관리자가 바로) */
  var v2=L.some(function(x){ return x && Object.prototype.hasOwnProperty.call(x, 'status'); }), isSup=!!ST.IS_SUPER, me=String(ST.AUTH_USER||'').toLowerCase();
  var canW=!!ST.SB_TOKEN && !ST.IS_VIEWER && (isSup || ST.MY_ROLE==='admin' || (v2 && ST.MY_ROLE==='editor'));
  var canAct=v2? isSup : canW, mine=function(x){ return String(x.proposed_by||x.created_by||'').toLowerCase()===me; };
  var props=v2? L.filter(function(x){ return x.status==='제안'; }) : [];
  var nOn=L.filter(function(x){ return x.active!==false && (!v2 || x.status==='반영'); }).length;
  $('#dvCount').textContent = L.length? '적용 중 '+nOn+'개' : '';
  var h=tpl`<div class="pr-card" style="margin-bottom:14px;max-width:920px"><div style="font-size:14px;font-weight:650;margin-bottom:8px">AI 에게 가르치기</div>`+
    tpl`<div class="mini" style="margin-bottom:10px;line-height:1.7">예: «에스원 경유 계약은 설치비를 정산월에 따로 인식한다» · «MDR 은 노드가 아니라 에이전트 수로 과금» · ««위세아이텍» 은 «위세» 로도 부른다». 짧고 사실적으로 한 줄씩. 숫자 값은 넣지 말고 규칙·용어·해석 방법을 적으세요 — 숫자는 AI 가 DB 에서 직접 봅니다. 저장하면 다음 질문부터 바로 반영됩니다.</div>`+
    tpl`<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start"><input id="akTopic" class="qb-in" placeholder="주제 (예: 에스원 계약)" style="width:180px;height:34px">`+
    tpl`<textarea id="akBody" class="qb-in" placeholder="AI 가 알아야 할 내용 (한 줄 한 사실)" style="flex:1;min-width:260px;min-height:34px;height:60px;padding:8px 10px;resize:vertical"></textarea>`+
    tpl`<button type="button" class="cbtn pri" id="akAdd" style="height:34px"${canW?'':' disabled'}>${v2 && !isSup? '＋ 제안하기' : '＋ 가르치기'}</button></div>`+
    tpl`${rawHtml(v2 && !isSup? '<div class="mini" style="margin-top:6px">제안한 내용은 슈퍼 관리자가 «반영»하면 AI 에 들어갑니다(모든 사람의 답에 쓰이므로).</div>' : '')}`+
    tpl`<div class="mini" style="margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span>${rawHtml(L.length? '지금 AI 가 쓰는 팀 지식 '+nOn+'개'+(L.length>nOn? ' (꺼둔 것 '+(L.length-nOn)+'개)':'') : '아직 가르친 내용이 없습니다 — AI 는 포탈 규칙(MRR·LIVE·장비·OI)과 DB 표만 알고 있습니다')}</span>`+ tpl`${rawHtml(L.length? tpl`<button type="button" class="cbtn" id="akLog" style="height:26px;font-size:12px">${AK.log?'기록 닫기':'기록 보기'}</button>`:'')}</div></div>`;
  if(props.length){   /* ㊿+178 제안 — 슈퍼 관리자 «반영» · «거절» / 제안한 사람은 지우기 */
    h+=tpl`<div class="pr-card ak-props" style="margin-bottom:14px;max-width:920px"><div style="font-size:14px;font-weight:650;margin-bottom:8px">제안 ${String(props.length)}개 <span class="mini">— ${isSup? '«반영»하면 다음 질문부터 AI 가 씁니다' : '슈퍼 관리자가 반영하면 AI 에 들어갑니다'}</span></div>`+
      tpl`<div class="qb-deck-list">${rawHtml(props.map(function(x){ return tpl`<div class="qb-deck-it" data-id="${rawHtml(x.id)}"><span class="ctag">${x.topic||''}</span><span style="flex:1;min-width:240px;font-size:14px;line-height:1.55;white-space:pre-wrap">${x.content||''}</span>`+
        tpl`<span class="mini">${String(x.proposed_by||x.created_by||'').split('@')[0]} · ${String(x.created_at||'').slice(0,10)}${x.from_feedback? ' · 👎 #'+x.from_feedback : ''}</span>`+
        tpl`<span style="display:flex;gap:4px">${rawHtml(isSup? tpl`<button type="button" class="cbtn pri" data-ak="ok">반영</button><button type="button" class="cbtn" data-ak="no">거절</button>` : '')}${rawHtml(isSup || mine(x)? '<button type="button" class="cbtn" data-ak="del" style="color:var(--critical)" aria-label="제안 지우기">×</button>' : '')}</span></div>`; }).join(''))}</div></div>`;
  }
  if(AK.log && L.length){
    var q=String(AK.q||'').trim().toLowerCase();
    var M=q? L.filter(function(x){ return ((x.topic||'')+' '+(x.content||'')).toLowerCase().indexOf(q)>=0; }) : L;
    h+=tpl`<div class="pr-card" style="max-width:920px"><div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap"><div style="font-size:14px;font-weight:650">가르친 기록</div><span class="mini">${M.length}개 · 최근 것부터 · «적용» 을 끄면 AI 가 쓰지 않습니다(기록은 남음)</span>`+
      tpl`<input id="akQ" class="qb-in" placeholder="찾기" value="${AK.q||''}" style="width:160px;height:28px;margin-left:auto"></div>`+
      tpl`<div class="qb-deck-list">${rawHtml(M.filter(function(x){ return !v2 || x.status!=='제안'; }).map(function(x){ return tpl`<div class="qb-deck-it" data-id="${rawHtml(x.id)}" style="${x.active===false?'opacity:.55':''}"><span class="ctag">${x.topic||''}</span>${rawHtml(v2 && x.status==='거절'? '<span class="ctag crit">거절</span>' : '')}<span style="flex:1;min-width:240px;font-size:14px;line-height:1.55;white-space:pre-wrap">${x.content||''}</span>`+
      tpl`<span class="mini">${String(x.created_by||'').split('@')[0]} · ${String(x.created_at||'').slice(0,10)}</span>`+
      tpl`<span style="display:flex;gap:4px;align-items:center"><label class="mini qb-chk"><input type="checkbox" data-ak="active"${x.active===false?'':' checked'}${canAct && (!v2 || x.status==='반영')?'':' disabled'}> 적용</label><button type="button" class="cbtn" data-ak="del" style="color:var(--critical)" aria-label="지우기"${canAct?'':' disabled'}>×</button></span></div>`; }).join(''))}`+ tpl`${rawHtml(M.length? '' : '<div class="cap" style="padding:16px;text-align:center">찾는 내용이 없습니다</div>')}</div></div>`;
  }
  host.innerHTML=h;
  function reload(){ return sbTry('ai_knowledge?select=*&order=id').then(function(rows){ ST.RAWX.aiknow=rows||[]; renderAiKnow(); }); }
  var add=$('#akAdd'); if(add) add.onclick=async function(){ var t=($('#akTopic').value||'').trim()||'일반', c=($('#akBody').value||'').trim(); if(!c){ toast('내용을 적어 주세요','','bad'); return; }
    add.disabled=true; try{ var out=await sbWrite('POST','ai_knowledge?select=id,status',[{topic:t, content:c, created_by:ST.AUTH_USER||null}],'return=representation'); var k=(out||[])[0]||{}; try{ logChange('insert','ai_knowledge',k.id||null,{topic:t, status:k.status||null}); }catch(e){}
      if(k.status==='제안') toast('제안했습니다', t+' — 슈퍼 관리자가 반영하면 AI 에 들어갑니다', 'ok'); else toast('가르쳤습니다', t+' — 다음 질문부터 반영', 'ok'); await reload(); var ta=$('#akBody'); if(ta) ta.focus(); }catch(e){ toast('저장 실패', String(e.message||e).slice(0,120), 'bad'); add.disabled=false; } };
  var lg=$('#akLog'); if(lg) lg.onclick=function(){ AK.log=!AK.log; renderAiKnow(); };
  var qi=$('#akQ'); if(qi){ qi.oninput=function(){ AK.q=qi.value; var v=qi.value, pos=qi.selectionStart; renderAiKnow(); var n=$('#akQ'); if(n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch(e){} } }; }
  host.querySelectorAll('.qb-deck-it').forEach(function(row){ var id=row.dataset.id;
    var cb=row.querySelector('[data-ak="active"]'); if(cb) cb.onchange=async function(){ try{ await sbWrite('PATCH','ai_knowledge?id=eq.'+id,{active:cb.checked, updated_at:new Date().toISOString()}); if(!v2) logChange('update','ai_knowledge',id,{active:cb.checked}); await reload(); }catch(e){ toast('저장 실패', String(e.message||e).slice(0,120), 'bad'); } };
    var dl=row.querySelector('[data-ak="del"]'); if(dl) dl.onclick=async function(){ if(!confirm('이 지식을 지울까요?')) return; try{ await sbWrite('DELETE','ai_knowledge?id=eq.'+id); logChange('delete','ai_knowledge',id,{}); await reload(); }catch(e){ toast('삭제 실패', String(e.message||e).slice(0,120), 'bad'); } };
    /* ㊿+178 제안 반영 · 거절(슈퍼 관리자) — 기록은 DB 트리거(change_log approve/reject · doc_hist) */
    ['ok','no'].forEach(function(k){ var b=row.querySelector('[data-ak="'+k+'"]'); if(b) /** @type {any} */(b).onclick=async function(){
      var x=(ST.RAWX.aiknow||[]).filter(function(y){ return String(y.id)===String(id); })[0]||{};
      if(!confirm((k==='ok'? '이 지식을 반영합니다 — 다음 질문부터 모든 사람의 AI 답에 쓰입니다.' : '이 제안을 거절합니다.')+'\n\n['+(x.topic||'')+'] '+String(x.content||'').slice(0,200))) return;
      try{ await sbWrite('PATCH','ai_knowledge?id=eq.'+id,{status:k==='ok'? '반영' : '거절'}); toast(k==='ok'? '반영했습니다' : '거절했습니다', x.topic||'', 'ok'); await reload(); }catch(e){ toast('저장 실패', String(/** @type {any} */(e).message||e).slice(0,120), 'bad'); } }; });
  });
}
export function renderBizMonthly(){
  var tw=$('#dvTable').parentElement; tw.style.display='none';
  var host=bizHostEl(); host.style.display=''; host.innerHTML='';
  if(!BIZL.at && ST.SB_TOKEN){ bizLoadLocks().then(function(){ if(ST.CUR_VIEW==='biz' && !BIZV.edit) renderBizMonthly(); }); }   /* ㊿+176 마감 · SQL 107 여부 */
  var rows=ST.RAWX.biz||[];
  /* ㊿+176 달 = 'YYYY-MM' 열쇠(bizKey) — 예전엔 «8월»만이라 해가 바뀌면 섞였음 */
  var months=[], seen={};
  rows.forEach(function(r){ if(!r.ym) return; var k=bizKey(r); if(!seen[k]){ seen[k]=1; months.push(k); } });
  months.sort(function(a,b){ return a<b? 1 : a>b? -1 : 0; });
  if(BIZV.edit){ renderBizEditor(host, months); return; }
  if(BIZV.ym==null || !seen[BIZV.ym]) BIZV.ym=months[0]||null;
  $('#dvCount').textContent = months.length? months.length+'개월 입력됨' : '';
  var lk=BIZV.ym? bizLock(BIZV.ym) : null, canW=bizCanWrite();

  // 월 선택 + 동작 버튼
  var bar=document.createElement('div');
  bar.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px';
  months.forEach(function(m){
    var b=document.createElement('button'); b.className='pill'+(m===BIZV.ym?'':' ghost'); b.textContent=bizLabel(m)+(bizLock(m)? ' 🔒' : ''); if(bizLock(m)) b.title='마감됨';
    if(m===BIZV.ym){ b.style.background='var(--s1-solid,#226bc4)'; b.style.color='#fff'; b.style.borderColor='var(--s1-solid,#226bc4)'; }
    b.onclick=function(){ BIZV.ym=m; renderBizMonthly(); };
    bar.appendChild(b);
  });
  if(!ST.IS_VIEWER){
    var sp=document.createElement('span'); sp.style.flex='1'; bar.appendChild(sp);
    var bn=document.createElement('button'); bn.className='pill'; bn.textContent='＋ 새 달 입력';
    bn.onclick=function(){ if(!ST.SB_TOKEN){openOvl('ovlAuth');return;} BIZV.edit=true; BIZV.newMonth=true; renderBizMonthly(); };
    bar.appendChild(bn);
    if(BIZV.ym && !lk){
      var be=document.createElement('button'); be.className='pill ghost'; be.textContent='✎ 이 달 수정';
      be.onclick=function(){ if(!ST.SB_TOKEN){openOvl('ovlAuth');return;} BIZV.edit=true; BIZV.newMonth=false; renderBizMonthly(); };
      bar.appendChild(be);
      var bd=document.createElement('button'); bd.className='pill ghost'; bd.textContent='🗑 이 달 삭제'; bd.style.color='var(--critical,#d03b3b)';
      bd.onclick=async function(){
        if(!ST.SB_TOKEN){openOvl('ovlAuth');return;}
        var k=BIZV.ym; if(!confirm(bizLabel(k)+'('+k+') 입력을 전부 삭제할까요?'+(BIZL.ok? '\n(지운 내용은 «이력»에서 되돌릴 수 있습니다)' : ''))) return;
        try{
          await bizDeleteMonth(k);
          logChange('delete','biz_recon',0,{ym:k});
          bizReplaceLocal(k, []);
          BIZV.ym=null; renderBizMonthly();
        }catch(e){ $('#dvMsg').textContent=String(e.message||e); }
      };
      bar.appendChild(bd);
    }
  }
  /* ㊿+176 월 마감 · 이력 (SQL 107) */
  if(BIZV.ym && BIZL.ok){
    if(lk){ var ls=document.createElement('span'); ls.className='ubadge biz-lock'; ls.textContent='🔒 마감 · '+String(lk.locked_by||'').split('@')[0]+' · '+String(lk.locked_at||'').slice(0,10); ls.title=lk.note||'마감됨 — 고치려면 슈퍼 관리자가 «마감 풀기»'; bar.appendChild(ls);
      if(ST.IS_SUPER){ var bu0=document.createElement('button'); bu0.className='pill ghost'; bu0.id='bizUnlock'; bu0.textContent='마감 풀기…'; bu0.onclick=function(){ bizUnlock(BIZV.ym); }; bar.appendChild(bu0); } }
    else if(canW){ var bl=document.createElement('button'); bl.className='pill ghost'; bl.id='bizLockBtn'; bl.textContent='🔒 이 달 마감…'; bl.title='마감하면 이 달은 슈퍼 관리자가 풀기 전까지 고치거나 지울 수 없습니다'; bl.onclick=function(){ bizLockMonth(BIZV.ym); }; bar.appendChild(bl); }
    var bh=document.createElement('button'); bh.className='pill ghost'; bh.id='bizHist'; bh.textContent='이력'; bh.title='이 달을 고치거나 지우기 전의 내용 — 그 판으로 되돌리기'; bh.onclick=function(){ bizHistOpen(BIZV.ym); }; bar.appendChild(bh);
  }
  /* 비즈포탈 엑셀 자동 대조 — 파일을 읽어 바로 비교 (저장하지 않음) */
  var bu=document.createElement('label'); bu.className='pill'; bu.style.cssText='cursor:pointer;display:inline-flex;align-items:center;gap:6px'; bu.title='비즈포탈에서 내려받은 매출 목록(.xlsx)을 올리면 그 달 포탈 매출과 회사 단위로 자동 대조합니다 — 파일은 저장하지 않습니다';
  bu.innerHTML='📥 비즈포탈 엑셀 올려서 자동 대조 <input type="file" id="bzxFile" accept=".xlsx,.xls,.csv" style="display:none">';
  bu.querySelector('input').onchange=function(){ bzxOpenFile(this.files[0]); this.value=''; };
  bar.insertBefore(bu, bar.children[months.length]||null);
  host.appendChild(bar);
  if(BZX.res){ bzxRender(host); }

  // ── 월 목표 대비 달성률 ─────────────────────────────
  renderTargetTable(host, rows);

  if(!BIZV.ym){
    var em=document.createElement('p'); em.className='cap';
    em.textContent='아직 입력된 달이 없습니다. 「＋ 새 달 입력」으로 시작하세요.';
    host.appendChild(em); return;
  }
  var mr=rows.filter(function(r){return bizKey(r)===BIZV.ym;});
  var sums=mr.filter(function(r){return r.kind==='sum';});
  var dets=mr.filter(function(r){return r.kind==='detail';});
  var asOf=(mr[0]&&mr[0].as_of)? String(mr[0].as_of).slice(0,10):'';

  var head=document.createElement('p'); head.className='cap';
  head.textContent=(+BIZV.ym.slice(0,4))+'년 '+(+BIZV.ym.slice(5,7))+'월 대조 결과'+(asOf? ' · 작성일 '+asOf:'')+(lk? ' · 🔒 마감됨' : '');
  host.appendChild(head);

  var st=document.createElement('table'); st.className='dgrid'; st.style.maxWidth='560px';
  var sb='<thead><tr><th>항목</th><th style="text-align:right">금액(천원)</th></tr></thead><tbody>';
  sums.forEach(function(r){
    var hl=/차액/.test(r.item||'');
    sb+=tpl`<tr${rawHtml(hl?' style="font-weight:700;border-top:2px solid var(--axis)"':'')}><td>${r.item}</td>`+
        tpl`<td style="text-align:right${rawHtml(hl?';color:'+((r.biz||0)>=0?'var(--good,#0ca30c)':'var(--critical,#d03b3b)'):'')}">`+
        tpl`${rawHtml(Math.round(Number(r.biz||0)/1000).toLocaleString('ko-KR'))}</td></tr>`;
  });
  st.innerHTML=tpl`${rawHtml(sb)}</tbody>`;
  host.appendChild(st);

  if(dets.length){
    var h2=document.createElement('p'); h2.className='cap'; h2.style.marginTop='18px'; h2.innerHTML='고객사별 차이 <b style="color:var(--brand,#2a78d6)">· 단위: 천원</b>';
    host.appendChild(h2);
    var dt=document.createElement('table'); dt.className='dgrid';
    var db='<thead><tr><th>고객사</th><th style="text-align:right">비즈포탈(천원)</th><th style="text-align:right">매출시트(천원)</th><th style="text-align:right">차이(천원)</th><th>사유</th></tr></thead><tbody>';
    dets.forEach(function(r){
      db+=tpl`<tr><td>${r.item}</td><td style="text-align:right">${won(r.biz)}</td>`+
          tpl`<td style="text-align:right">${won(r.sheet)}</td>`+
          tpl`<td style="text-align:right;color:${(r.diff||0)>=0?'var(--good,#0ca30c)':'var(--critical,#d03b3b)'}">${won(r.diff)}</td>`+
          tpl`<td style="font-size:12px;color:var(--muted)">${r.note||''}</td></tr>`;
    });
    dt.innerHTML=tpl`${rawHtml(db)}</tbody>`;
    host.appendChild(dt);
  }
}

/* ── ㊿+176 비즈포탈 차액: 연도 · 월 마감 · 이력 (SQL 107 — 없으면 예전 방식 그대로) ──
   · 저장 · 삭제 = biz_month_replace · biz_month_delete 함수(지우고 넣기가 한 번에 · 바뀌기 전 행 목록이 doc_hist 에)
   · 마감 = period_lock('biz', 'YYYY-MM') · 풀기 = 슈퍼 관리자 period_unlock(사유) · 마감된 달은 DB 가 막음 */
export var BIZL={ok:null, locks:{}, at:0};
export async function bizLoadLocks(force){
  if(!force && BIZL.at && Date.now()-BIZL.at<30000) return BIZL;
  try{ var r=await fetch(SB_URL+'/rest/v1/period_locks?select=*', {headers:sbHeaders()}); BIZL.ok=r.ok; var m={}; if(r.ok) ((await r.json())||[]).forEach(function(x){ m[x.kind+':'+x.period]=x; }); BIZL.locks=m; }
  catch(e){ BIZL.ok=false; }
  BIZL.at=Date.now(); return BIZL;
}
export function bizLock(k){ return (k && BIZL.locks['biz:'+k]) || null; }
export function bizCanWrite(){ return !!ST.SB_TOKEN && !ST.IS_VIEWER && (ST.IS_SUPER || ST.MY_ROLE==='admin' || ST.MY_ROLE==='editor'); }
export function bizRowsOf(k){ return (ST.RAWX.biz||[]).filter(function(r){ return bizKey(r)===k; }); }
export function bizReplaceLocal(k, ins){ ST.RAWX.biz=(ST.RAWX.biz||[]).filter(function(r){ return bizKey(r)!==k; }).concat(ins||[]); }
export async function bizSaveMonth(k, out, note){
  var y=+k.slice(0,4), m=+k.slice(5,7), ym=m+'월';
  out.forEach(function(r){ r.ym=ym; r.y=y; });
  if(BIZL.ok===null) await bizLoadLocks();
  if(BIZL.ok) return (await sbWrite('POST','rpc/biz_month_replace',{p_y:y, p_m:m, p_rows:out, p_note:note||null}, undefined, 'biz'))||[];
  /* SQL 107 전 — 예전 방식(달만 · y 칸 없음) */
  var old=out.map(function(r){ var o=Object.assign({}, r); delete o.y; return o; });
  await sbWrite('DELETE','biz_recon?ym=eq.'+encodeURIComponent(ym));
  return (await sbWrite('POST','biz_recon?select=*',old,'return=representation'))||[];
}
export async function bizDeleteMonth(k){
  var y=+k.slice(0,4), m=+k.slice(5,7);
  if(BIZL.ok===null) await bizLoadLocks();
  if(BIZL.ok) return sbWrite('POST','rpc/biz_month_delete',{p_y:y, p_m:m}, undefined, 'biz');
  return sbWrite('DELETE','biz_recon?ym=eq.'+encodeURIComponent(m+'월'));
}
export async function bizLockMonth(k){
  var rs=bizRowsOf(k), sum=rs.filter(function(r){ return r.kind==='sum'; }).map(function(r){ return r.item+' '+won(r.biz)+'천원'; }).join(' · ');
  if(!confirm(bizLabel(k)+' 비즈포탈 차액을 마감합니다\n\n'+(sum||'(요약 없음)')+'\n\n마감하면 슈퍼 관리자가 «마감 풀기» 전까지 고치거나 지울 수 없습니다. 마감할까요?')) return;
  try{ await sbWrite('POST','rpc/period_lock',{p_kind:'biz', p_period:k, p_note:null}, undefined, 'biz'); await bizLoadLocks(true); toast('마감했습니다', bizLabel(k)+' 비즈포탈 차액'); renderBizMonthly(); }
  catch(e){ toast('마감하지 못했습니다', String(/** @type {any} */(e).message||e).slice(0,160), 'bad'); }
}
export async function bizUnlock(k){
  var why=prompt(bizLabel(k)+' 마감을 풉니다 — 사유를 적어 주세요(변경 이력에 남습니다)', '');
  if(why==null) return; why=String(why).trim(); if(why.length<2){ toast('마감을 풀지 않았습니다','사유를 두 글자 이상 적어 주세요','info'); return; }
  try{ await sbWrite('POST','rpc/period_unlock',{p_kind:'biz', p_period:k, p_reason:why}, undefined, 'biz'); await bizLoadLocks(true); toast('마감을 풀었습니다', bizLabel(k)+' · '+why); renderBizMonthly(); }
  catch(e){ toast('마감을 풀지 못했습니다', String(/** @type {any} */(e).message||e).slice(0,160), 'bad'); }
}
export var BIZ_OP={insert:'처음 저장', replace:'고침', restore:'되돌림', delete:'삭제'};
/** 이력 창 — 이 달을 고치거나 지우기 전의 내용 · 그 판으로 되돌리기 */
export async function bizHistOpen(k){
  var ov=document.getElementById('ovlBizHist');
  if(!ov){ ov=document.createElement('div'); ov.id='ovlBizHist'; ov.className='ovl'; document.body.appendChild(ov); }
  ov.innerHTML=tpl`<div class="modal" role="dialog" aria-modal="true" aria-labelledby="bhH" style="width:min(720px,100%)"><h3 id="bhH">${bizLabel(k)} 비즈포탈 차액 — 이력</h3><p class="cap" id="bhCap">읽는 중…</p><div id="bhBody"></div>`+
    tpl`<div class="mact"><span class="mmsg" id="bhMsg"></span><button type="button" class="pill ghost" data-close="ovlBizHist">닫기</button></div></div>`;
  openOvl('ovlBizHist');
  var rows=null; try{ var r=await fetch(SB_URL+'/rest/v1/doc_hist?select=id,at,actor,op,old,new,note&kind=eq.biz_recon&ref=eq.'+encodeURIComponent(k)+'&order=at.desc&limit=30', {headers:sbHeaders()}); if(r.ok) rows=await r.json(); }catch(e){}
  var cap=/** @type {any} */(ov.querySelector('#bhCap')), body=/** @type {any} */(ov.querySelector('#bhBody'));
  if(rows===null){ cap.textContent='이력을 읽지 못했습니다 — SQL 107 을 실행했는지 확인해 주세요'; return; }
  var locked=!!bizLock(k), canW=bizCanWrite();
  cap.textContent=rows.length? '고치거나 지우기 «전»의 내용입니다. 되돌리면 지금 내용도 이력에 남습니다.'+(locked? ' (마감된 달 — 되돌리려면 먼저 마감 풀기)' : '') : '아직 고치거나 지운 기록이 없습니다.';
  var sumOf=function(old){ var a=(old||[]).filter(function(x){ return x.kind==='sum'; }); return a.map(function(x){ return x.item+' '+won(x.biz); }).join(' · '); };
  body.innerHTML=rows.length? tpl`<div class="tbl-wrap"><table class="rn-tbl"><thead><tr><th>언제</th><th>누가</th><th>무엇</th><th>바뀌기 전(천원)</th><th></th></tr></thead><tbody>${rawHtml(rows.map(function(h, i){
    var n=Array.isArray(h.old)? h.old.length : 0;
    return tpl`<tr><td class="num">${String(h.at||'').slice(0,16).replace('T',' ')}</td><td>${String(h.actor||'').split('@')[0]}</td><td>${BIZ_OP[h.op]||h.op}${rawHtml(h.note? tpl`<div class="mini">${h.note}</div>` : '')}</td>`+
      tpl`<td class="mini">${n? n+'행 · '+sumOf(h.old) : '(없음)'}</td><td>${rawHtml(n && canW && !locked? tpl`<button type="button" class="cbtn" data-bh="${String(i)}">이 판으로 되돌리기…</button>` : '')}</td></tr>`; }).join(''))}</tbody></table></div>` : '';
  body.querySelectorAll('[data-bh]').forEach(function(b){ /** @type {any} */(b).onclick=async function(){
    var h=rows[+/** @type {any} */(b).dataset.bh]; if(!h) return;
    if(!confirm(bizLabel(k)+'을 '+String(h.at||'').slice(0,16).replace('T',' ')+' '+(BIZ_OP[h.op]||h.op)+' 전의 내용('+h.old.length+'행)으로 되돌립니다.\n지금 내용은 이력에 남습니다. 되돌릴까요?')) return;
    var msg=/** @type {any} */(ov.querySelector('#bhMsg'));
    try{ var keep=h.old.map(function(x){ var o=Object.assign({}, x); delete o.id; delete o.created_at; delete o.updated_at; return o; });
      var ins=await bizSaveMonth(k, keep, 'restore #'+h.id); bizReplaceLocal(k, ins); logChange('update','biz_recon',0,{ym:k, restore:h.id, rows:keep.length});
      closeOvl('ovlBizHist'); toast('되돌렸습니다', bizLabel(k)+' · '+keep.length+'행'); BIZV.ym=k; renderBizMonthly(); }
    catch(e){ msg.textContent=String(/** @type {any} */(e).message||e).slice(0,200); msg.className='mmsg bad'; }
  }; });
}

/* ---- 월 목표 대비 달성률 (비즈포탈 회계매출 · 매출시트 매출 두 기준) ---- */
export function bizYear(rows){
  var k=''; (rows||[]).forEach(function(r){ if(r.ym){ var x=bizKey(r); if(x>k) k=x; } });   /* ㊿+176 가장 최근 입력 달의 해 */
  return +(k.slice(0,4) || new Date().getFullYear());
}
export function bizMonthNum(ym){ var m=String(ym||'').match(/(\d+)/); return m? +m[1] : 0; }
export function bizPick(rows, ym, re){
  var hit=(rows||[]).filter(function(r){ return r.ym===ym && r.kind==='sum' && re.test(r.item||''); })[0];
  return hit? Number(hit.biz)||0 : null;
}
/* ㊿+168 정산 달성률 — 미입력과 0원을 구분
   · 달: 입력 안 한 달은 «미입력»(이미 지난 달) 또는 «—»(아직 안 온 달) · 입력된 0 은 0 · 작성일(as_of)을 «입력 상태»에
   · 분기·상반기·누계: «입력 n/m개월» · 다 입력되면 «입력 완료»(㊿+172 — 실제 마감 상태가 따로 없으므로 «확정»이라 하지 않음), 일부면 «잠정», 하나도 없으면 «미집계»
     달성률 = 입력된 달끼리(입력 월 기준) · 아래 작은 줄 = 그 기간 전체 목표 대비 지금까지 누계 · 미입력 달을 0원으로 치지 않음
   · 목표·회계매출 데이터는 그대로(표시만) */
export function bizEntryDate(rows, ym){ var d=''; (rows||[]).forEach(function(r){ if(r.ym===ym){ var v=String(r.as_of||r.updated_at||r.created_at||'').slice(0,10); if(v>d) d=v; } }); return d; }
export function renderTargetTable(host, rows){
  var year=BIZV.year||bizYear(rows);
  BIZV.year=year;
  rows=(rows||[]).filter(function(r){ return bizY(r)===year; });   /* ㊿+176 그해 행만(예전엔 «8월»이 해마다 섞였음) */
  var tg={};
  (ST.RAWX.mtargets||[]).forEach(function(t){ if(+t.year===year) tg[+t.month]=Number(t.amount)||0; });
  var now=new Date(), curY=now.getFullYear(), curM=now.getMonth()+1;
  var isFuture=function(m){ return year>curY || (year===curY && m>curM); };
  var latest=''; (rows||[]).forEach(function(r){ var v=String(r.as_of||r.updated_at||r.created_at||'').slice(0,10); if(v>latest) latest=v; });

  var box=document.createElement('section');
  box.style.cssText='margin-bottom:22px;padding-bottom:18px;border-bottom:1px solid var(--ring)';

  var hd=document.createElement('div');
  hd.style.cssText='display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px';
  hd.innerHTML=tpl`<button type="button" class="cbtn" id="bizYPrev" aria-label="앞 해">‹</button><b style="font-size:14px">${rawHtml(year)}년 월 목표 대비 달성률</b><button type="button" class="cbtn" id="bizYNext" aria-label="다음 해">›</button>`+
    tpl`<span class="ubadge sm">₩ 천원</span>`+
    tpl`<span class="cap" style="margin:0">달성률 = 입력된 달끼리 비교(입력 월 기준) · 작은 줄 = 기간 전체 목표 대비 현재 누계 · 미입력 달은 0원으로 치지 않음${rawHtml(latest? ' · 최신 반영 '+esc(latest) : '')}</span>`;
  if(!ST.IS_VIEWER){
    var sp=document.createElement('span'); sp.style.flex='1'; hd.appendChild(sp);
    var be=document.createElement('button'); be.className='pill'; be.textContent='✎ 월 목표 입력';
    be.onclick=function(){ if(!ST.SB_TOKEN){openOvl('ovlAuth');return;} openTargetEditor(year); };
    hd.appendChild(be);
  }
  box.appendChild(hd);
  /** @type {any} */(hd.querySelector('#bizYPrev')).onclick=function(){ BIZV.year=year-1; renderBizMonthly(); };
  /** @type {any} */(hd.querySelector('#bizYNext')).onclick=function(){ BIZV.year=year+1; renderBizMonthly(); };

  var t=document.createElement('table'); t.className='dgrid biz-tg';
  var h=tpl`<thead><tr><th>구분</th><th>입력 상태</th><th style="text-align:right">목표(천원)</th>`+
        tpl`<th style="text-align:right">비즈포탈 회계매출(천원)</th><th style="text-align:right">달성률</th>`+
        tpl`<th style="text-align:right">매출시트 매출(천원)</th><th style="text-align:right">달성률</th></tr></thead><tbody>`;

  function pctTxt(v, base){ if(!base) return null; return v/base*100; }
  function pctCell(r){
    if(r==null) return '<td style="text-align:right;color:var(--muted)">—</td>';
    var c = r>=100? 'var(--good,#0ca30c)' : (r>=95? 'var(--warn-ink,#8a5200)' : 'var(--critical,#d03b3b)');
    return tpl`<td style="text-align:right;font-weight:650;color:${rawHtml(c)}">${r.toFixed(1)}%</td>`;
  }
  function money(v){ return v==null? '—' : won(v); }        /* 천원 단위 */
  function miss(m){ return isFuture(m)? '<span class="biz-na">—</span>' : '<span class="biz-miss">미입력</span>'; }
  /* 기간 묶음(분기·상반기·누계) — 목표가 있는 달 기준 */
  function agg(ms){
    var o={n:ms.length, T:0, B:{n:0,v:0,t:0}, S:{n:0,v:0,t:0}};
    ms.forEach(function(x){ o.T+=x.tgt; if(x.bz!=null){ o.B.n++; o.B.v+=x.bz; o.B.t+=x.tgt; } if(x.sh!=null){ o.S.n++; o.S.v+=x.sh; o.S.t+=x.tgt; } });
    return o;
  }
  function aggRow(label, o, cls){
    if(!o.n) return '';
    var nIn=Math.max(o.B.n, o.S.n), st= nIn===0? '<span class="biz-na">미집계</span>' : (nIn===o.n? tpl`<span class="biz-ok" title="모든 달이 입력됨 — 정산 마감(확정) 표시는 따로 없습니다">입력 완료 · ${rawHtml(o.n)}/${rawHtml(o.n)}개월</span>` : tpl`<span class="biz-part">잠정 · ${rawHtml(o.n)}개월 중 ${rawHtml(nIn)}개월 입력</span>`);
    function cells(x){
      if(!x.n) return '<td style="text-align:right;color:var(--muted)">—</td><td style="text-align:right;color:var(--muted)">미집계</td>';
      var a=pctTxt(x.v, x.t), b2=pctTxt(x.v, o.T);
      return tpl`<td style="text-align:right">${won(x.v)}${rawHtml(x.n<o.n? tpl`<div class="biz-sub">${rawHtml(x.n)}개월 합</div>`:'')}</td>`+
        tpl`<td style="text-align:right">${rawHtml(a==null? '—' : tpl`<b class="${a>=100?'biz-up':(a>=95?'biz-mid':'biz-dn')}">${a.toFixed(1)}%</b>`)}${rawHtml(x.n<o.n && b2!=null? tpl`<div class="biz-sub">기간 목표 대비 ${b2.toFixed(1)}%</div>`:'')}</td>`;
    }
    return tpl`<tr class="${rawHtml(cls)}"><td>${label}</td><td>${rawHtml(st)}</td><td style="text-align:right">${won(o.T)}</td>${rawHtml(cells(o.B))}${rawHtml(cells(o.S))}</tr>`;
  }

  var all=[], q=[], half=[];
  for(var m=1;m<=12;m++){
    var ym=m+'월';
    var bz=bizPick(rows, ym, /비즈포탈\s*회계매출/);
    var sh=bizPick(rows, ym, /^매출시트\s*매출$/) ;
    if(sh==null) sh=bizPick(rows, ym, /매출시트\s*매출/);
    var tgt=tg[m]||0, ed=bizEntryDate(rows, ym);
    if(tgt || bz!=null || sh!=null){
      var stM= (bz!=null||sh!=null)? tpl`<span class="biz-ok">입력${rawHtml(ed? ' · '+esc(ed.slice(5)):'')}</span>` : rawHtml(miss(m));
      h+=tpl`<tr><td>${rawHtml(m)}월</td><td>${rawHtml(stM)}</td><td style="text-align:right">${rawHtml(money(tgt||null))}</td>`+
         tpl`<td style="text-align:right">${rawHtml(bz!=null? won(bz) : '<span class="biz-na">—</span>')}</td>${rawHtml(bz!=null? pctCell(pctTxt(bz,tgt)) : '<td style="text-align:right;color:var(--muted)">—</td>')}`+
         tpl`<td style="text-align:right">${rawHtml(sh!=null? won(sh) : '<span class="biz-na">—</span>')}</td>${rawHtml(sh!=null? pctCell(pctTxt(sh,tgt)) : '<td style="text-align:right;color:var(--muted)">—</td>')}</tr>`;
    }
    if(tgt>0){ var x={m:m, tgt:tgt, bz:bz, sh:sh}; all.push(x); q.push(x); if(m<=6) half.push(x); }   /* 목표가 있는 달만 기간 묶음에 */
    if(m%3===0){ h+=aggRow((m/3)+'분기', agg(q), 'biz-q'); q=[]; }
    if(m===6) h+=aggRow('상반기', agg(half), 'biz-h');
  }
  h+=aggRow(year+'년 누계', agg(all), 'biz-y');
  t.innerHTML=tpl`${rawHtml(h)}</tbody>`;
  var tw=document.createElement('div'); tw.className='tbl-wrap'; tw.style.maxHeight='none'; tw.appendChild(t);
  box.appendChild(tw);

  if(!all.length){
    var p0=document.createElement('p'); p0.className='cap'; p0.style.marginTop='8px';
    p0.textContent='월 목표가 없습니다. 「✎ 월 목표 입력」으로 넣으면 달성률이 계산됩니다.';
    box.appendChild(p0);
  }
  host.appendChild(box);
}

/* ---- 월 목표 입력 ---- */
export function openTargetEditor(year){
  var tg={};
  (ST.RAWX.mtargets||[]).forEach(function(t){ if(+t.year===year) tg[+t.month]=Number(t.amount)||0; });
  var ovl=document.createElement('div'); ovl.className='ovl on'; ovl.id='ovlTarget';
  var rowsHtml='';
  for(var m=1;m<=12;m++){
    rowsHtml+=tpl`<div><label>${rawHtml(m)}월</label><input type="number" data-m="${rawHtml(m)}" min="0" step="any" placeholder="천원" value="${tg[m]? wonToKw(tg[m]) : ''}"></div>`;
  }
  ovl.innerHTML=tpl`<div class="modal" style="width:min(560px,100%)">`+
    tpl`<h3>${rawHtml(year)}년 월 목표</h3>`+
    tpl`<p class="cap">연초에 정한 월별 목표 금액을 <b>천원 단위로</b> 넣으세요 (표와 같은 단위 · 1억원 → 100000). 비워두면 그 달은 달성률을 계산하지 않습니다.</p>`+
    tpl`<div class="frm">${rawHtml(rowsHtml)}</div>`+
    tpl`<div class="mact"><span class="mmsg" id="tgMsg" style="flex:1"></span>`+
    tpl`<button class="pill ghost" id="tgCancel">취소</button>`+
    tpl`<button class="pill pri" id="tgSave">저장</button></div></div>`;
  document.body.appendChild(ovl);
  ovl.querySelectorAll('input[data-m]').forEach(function(i){ amtHint(i, null, false); });
  ovl.querySelector('#tgCancel').onclick=function(){ ovl.remove(); };
  ovl.querySelector('#tgSave').onclick=async function(){
    var btn=this; btn.disabled=true;
    var msg=ovl.querySelector('#tgMsg'); msg.textContent='저장 중…';
    try{
      var payload=[];
      ovl.querySelectorAll('input[data-m]').forEach(function(inp){
        var v=kwToWon(inp.value);   /* 칸은 천원 (㊿+157) */
        if(v!=null) payload.push({year:year, month:+inp.dataset.m, amount:v});
      });
      if(payload.length){
        await sbWrite('POST','monthly_targets?on_conflict=year,month',payload,'resolution=merge-duplicates');
      }
      // 비운 달은 삭제
      var keep={}; payload.forEach(function(x){ keep[x.month]=1; });
      var del=(ST.RAWX.mtargets||[]).filter(function(t){ return +t.year===year && !keep[+t.month]; });
      for(var i=0;i<del.length;i++){
        await sbWrite('DELETE','monthly_targets?year=eq.'+year+'&month=eq.'+del[i].month);
      }
      // 화면은 방금 입력한 값으로 즉시 갱신 (재조회가 실패해도 값이 사라지지 않게)
      ST.RAWX.mtargets=(ST.RAWX.mtargets||[]).filter(function(t){ return +t.year!==year; }).concat(payload);
      try{
        var fresh=await sbTry('monthly_targets?select=*&order=year,month');
        if(fresh && fresh.length) ST.RAWX.mtargets=fresh;
      }catch(_){}
      logChange('update','monthly_targets',year,{months:payload.length});
      toast('월 목표 저장 완료', year+'년 '+payload.length+'개월');
      ovl.remove(); renderBizMonthly();
    }catch(e){ msg.textContent=String(e.message||e); btn.disabled=false; }
  };
}

export function renderBizEditor(host, months){
  var rows=ST.RAWX.biz||[];
  var editYm = BIZV.newMonth? '' : BIZV.ym;   /* ㊿+176 'YYYY-MM' */
  var src = BIZV.newMonth
    ? rows.filter(function(r){ return bizKey(r)===months[0] && r.kind==='sum'; }).map(function(r){ return {item:r.item, biz:null}; })
    : rows.filter(function(r){ return bizKey(r)===editYm && r.kind==='sum'; });
  if(!src.length) src=[{item:'비즈포탈 회계매출',biz:null},{item:'매출시트 매출',biz:null},{item:'차액 총계',biz:null}];
  var dsrc = BIZV.newMonth? [] : rows.filter(function(r){ return bizKey(r)===editYm && r.kind==='detail'; });
  var asOf = BIZV.newMonth? todayStr() : ((rows.find(function(r){return bizKey(r)===editYm;})||{}).as_of||'').slice(0,10);
  if(BIZV.newMonth){ var lm=new Date(); lm.setDate(1); lm.setMonth(lm.getMonth()-1); editYm=lm.getFullYear()+'-'+('0'+(lm.getMonth()+1)).slice(-2); }   /* 새 달 = 지난달(정산은 보통 지난달) */

  var f=document.createElement('div'); f.style.maxWidth='760px';
  f.innerHTML=
    tpl`<div class="frm" style="max-width:420px;margin-bottom:14px">`+
      tpl`<div><label for="bzYm">연월 *</label><input id="bzYm" type="month" value="${editYm}"></div>`+
      tpl`<div><label>작성일</label><input id="bzAsOf" type="date" value="${asOf}"></div>`+
    tpl`</div>`+
    tpl`<div class="cap" style="margin-bottom:6px">요약 항목 — 금액은 <b>천원 단위로 입력</b> (표와 같은 단위)</div><div id="bzSums"></div>`+
    tpl`<button class="pill ghost" id="bzAddSum" style="margin:6px 0 16px">＋ 항목 추가</button>`+
    tpl`<div class="cap" style="margin-bottom:6px">고객사별 차이 (없으면 비워두세요 · 차이는 자동 계산) — <b>천원 단위로 입력</b></div><div id="bzDets"></div>`+
    tpl`<button class="pill ghost" id="bzAddDet" style="margin:6px 0 18px">＋ 고객사 추가</button>`+
    tpl`<div style="display:flex;gap:10px;align-items:center">`+
      tpl`<span class="mini" id="bzMsg" style="flex:1"></span>`+
      tpl`<button class="pill ghost" id="bzCancel">취소</button>`+
      tpl`<button class="pill pri" id="bzSave">저장</button>`+
    tpl`</div>`;
  host.appendChild(f);

  function sumRow(item,amt){
    var d=document.createElement('div'); d.style.cssText='display:flex;gap:8px;margin-bottom:6px;max-width:640px';
    d.innerHTML=tpl`<input class="bz-item" placeholder="항목명" style="flex:2" value="${item||''}">`+
      tpl`<input class="bz-amt" placeholder="금액(천원)" style="flex:1;text-align:right" value="${amt==null?'':(Math.round(Number(amt))/1000).toLocaleString('ko-KR',{maximumFractionDigits:3})}">`;
    var x=document.createElement('button'); x.className='pill ghost'; x.textContent='✕';
    x.onclick=function(){ d.remove(); }; d.appendChild(x);
    return d;
  }
  function detRow(r){
    r=r||{};
    var d=document.createElement('div'); d.style.cssText='display:flex;gap:8px;margin-bottom:6px';
    d.innerHTML=tpl`<input class="bd-cust" placeholder="고객사" style="flex:2" value="${r.item||''}">`+
      tpl`<input class="bd-biz" placeholder="비즈포탈(천원)" style="flex:1;text-align:right" value="${r.biz==null?'':wonToKw(r.biz)}">`+
      tpl`<input class="bd-sheet" placeholder="매출시트(천원)" style="flex:1;text-align:right" value="${r.sheet==null?'':wonToKw(r.sheet)}">`+
      tpl`<input class="bd-note" placeholder="사유" style="flex:2" value="${r.note||''}">`;
    var x=document.createElement('button'); x.className='pill ghost'; x.textContent='✕';
    x.onclick=function(){ d.remove(); }; d.appendChild(x);
    return d;
  }
  src.forEach(function(r){ $('#bzSums').appendChild(sumRow(r.item,r.biz)); });
  dsrc.forEach(function(r){ $('#bzDets').appendChild(detRow(r)); });
  $('#bzAddSum').onclick=function(){ $('#bzSums').appendChild(sumRow('',null)); };
  $('#bzAddDet').onclick=function(){ $('#bzDets').appendChild(detRow()); };
  $('#bzCancel').onclick=function(){ BIZV.edit=false; renderBizMonthly(); };
  $('#bzSave').onclick=async function(){
    var k=$('#bzYm').value.trim();
    if(!/^\d{4}-\d{2}$/.test(k)){ $('#bzMsg').textContent='연월을 고르세요 (예: 2026-08)'; return; }
    if(bizLock(k)){ $('#bzMsg').textContent=bizLabel(k)+'은 마감됐습니다 — 슈퍼 관리자가 «마감 풀기» 후 고칠 수 있습니다'; return; }
    var ym=(+k.slice(5,7))+'월', y=+k.slice(0,4);
    if(BIZV.newMonth && bizRowsOf(k).length && !confirm(bizLabel(k)+' 입력이 이미 있습니다. 새로 적은 내용으로 바꿀까요?')) return;
    var asof=$('#bzAsOf').value||null;
    var out=[];
    $('#bzSums').querySelectorAll('div').forEach(function(d){
      var it=d.querySelector('.bz-item').value.trim();
      var amt=kwToWon(bizNz(d.querySelector('.bz-amt').value));   /* 칸은 천원 (㊿+157) */
      if(it) out.push({ym:ym, y:y, as_of:asof, kind:'sum', item:it, biz:amt});
    });
    $('#bzDets').querySelectorAll('div').forEach(function(d){
      var cu=d.querySelector('.bd-cust').value.trim(); if(!cu) return;
      var bz=kwToWon(bizNz(d.querySelector('.bd-biz').value)), sh=kwToWon(bizNz(d.querySelector('.bd-sheet').value));
      out.push({ym:ym, y:y, as_of:asof, kind:'detail', item:cu, biz:bz, sheet:sh,
                diff:(bz!=null&&sh!=null)? bz-sh:null, note:d.querySelector('.bd-note').value.trim()||null});
    });
    if(!out.length){ $('#bzMsg').textContent='입력된 항목이 없습니다'; return; }
    this.disabled=true; $('#bzMsg').textContent='저장 중…';
    try{
      var ins=await bizSaveMonth(k, out, null);
      bizReplaceLocal(k, ins);
      logChange('update','biz_recon',0,{ym:k, rows:out.length});
      toast('저장되었습니다', bizLabel(k)+' 비즈포탈 대조 결과');
      ST.DIRTY=true; BIZV.edit=false; BIZV.ym=k;
      renderBizMonthly();
    }catch(e){ $('#bzMsg').textContent=String(e.message||e); this.disabled=false; }
  };
}

/* ==================================================================
   비즈포탈 매출 엑셀 자동 대조 (목업 · 65단계)
   · 비즈포탈(회사 메인 포탈)에서 내려받은 매출 목록(.xlsx)을 브라우저에서 읽어 — 저장하지 않고 — 포탈 DB 의 같은 달 매출과 회사 단위로 맞춰 봅니다.
   · 비즈포탈 쪽: 진행상태 «종료» 행의 «회계매출»만 (실패·중지는 참고로만 표시)
   · 포탈 쪽: 그 달 monthly_revenue 합 + 대금정산일이 그 달인 설치비(install_fee)
   · 회사 이름은 띄어쓰기·㈜·(에스원)·괄호·별칭을 무시하고 묶음. 양쪽에 같은 금액이 한쪽씩만 있으면 «표기 차이(추정)»로 짝을 제안.
   · 사유는 담당자가 적고, 「비즈포탈 차액 표에 저장」을 누르면 기존 biz_recon 표(월 요약 + 고객사별 차이)에 들어갑니다.
   ================================================================== */
export var BZX={rows:null, month:null, file:'', notes:{}, res:null, showEq:false, showSkip:false, showRuled:false};
/* 비교에 넣는 행: 진행상태가 실패·중지·취소류만 빼고 전부 (종료 · 계산서발행 모두 회계매출로 인식된 행입니다)
   — 예전엔 «종료» 만 넣어서 «계산서발행» 140여 행이 통째로 빠져 «포탈에만 있음» 으로 잡혔습니다 */
export var BZX_SKIP=/실패|중지|취소|보류|반려|삭제|드랍|드롭|lost|drop|cancel/i;
export function bzxCounted(b){ return !BZX_SKIP.test(String(b.st||'')); }
export function bzxLev(a,b){ var m=a.length,n=b.length; if(!m) return n; if(!n) return m; var prev=[],cur=[]; for(var j=0;j<=n;j++) prev[j]=j;
  for(var i=1;i<=m;i++){ cur=[i]; for(var k=1;k<=n;k++){ cur[k]=Math.min(prev[k]+1, cur[k-1]+1, prev[k-1]+(a[i-1]===b[k-1]?0:1)); } prev=cur; } return prev[n]; }
/* 두 회사명이 같은 회사일 가능성 0~1 — 한 글자 오타(브랜드/브랜즈 · 에프엔비/에프앤비 · 에어로페이스/에어로스페이스)를 잡습니다 */
export function bzxSim(a,b){
  var ka=bzxKeys(a), kb=bzxKeys(b), best=0;
  ka.forEach(function(x){ kb.forEach(function(y){
    if(x===y){ best=1; return; }
    var L=Math.max(x.length,y.length), l=Math.min(x.length,y.length);
    if(l>=4 && (x.indexOf(y)>=0||y.indexOf(x)>=0)) best=Math.max(best, 0.9);
    if(l>=4) best=Math.max(best, 1-bzxLev(x,y)/L);
  }); });
  return best;
}
/* 반복 차이 규칙(biz_rules · 65단계) — 처음 필요할 때 한 번 읽어 둠. 표가 아직 없으면 빈 배열 */
export function bzxRules(){ if(ST.RAWX.bizRules!==undefined) return Promise.resolve(ST.RAWX.bizRules||[]);
  return sbTry('biz_rules?select=*&active=eq.true&order=id').then(function(r){ ST.RAWX.bizRules=r||[]; return ST.RAWX.bizRules; }).catch(function(){ ST.RAWX.bizRules=[]; return []; }); }
export function bzxRuleFor(q){ var ks=bzxKeys(q.name); var hit=null;
  (ST.RAWX.bizRules||[]).forEach(function(r){ if(r.active===false || r.cat!==q.cat) return; if(bzxKeys(r.name).some(function(k){ return ks.indexOf(k)>=0; })) hit=r; });
  return hit; }
/* ── 외부 라이브러리 로더 — SRI(무결성 해시) + 다중 CDN 폴백 (80점 프로젝트 ② 보안)
   해시는 npm 배포본(sha384)에서 계산 → jsdelivr/unpkg 는 npm 과 같은 바이트라 항상 일치, cdnjs 는 폴백. 해시가 다르면 브라우저가 실행을 거부하고 onerror → 다음 URL.
   라이브러리 버전을 올릴 때는 해시도 함께 바꿀 것 (tests/check.mjs 가 형식을 검사). */
export var LIBS={
  xlsx:  {label:'엑셀 라이브러리(SheetJS)', test:function(){ return !!window.XLSX; }, sri:'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw',
          urls:['https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js','https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js','https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js']},
  /* alasql 은 ㊿+147 부터 격리 칸(sqlbox.html · js/sqlbox.js)에서만 불러옴 — 본 포탈 CSP 에 'unsafe-eval' 이 없어 여기서는 못 돌림 */
  pptx:  {label:'PPT 라이브러리(PptxGenJS)', test:function(){ return !!window.PptxGenJS; }, sri:'sha384-Cck14aA9cifjYolcnjebXRfWGkz5ltHMBiG4px/j8GS+xQcb7OhNQWZYyWjQ+UwQ',
          urls:['https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js','https://unpkg.com/pptxgenjs@3.12.0/dist/pptxgen.bundle.js']},
  pdfjs: {label:'PDF 읽기 라이브러리(pdf.js)', test:function(){ return !!window.pdfjsLib; }, sri:'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e',
          urls:['https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js','https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js','https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js']}
};
export var PDFJS_WORKER={sri:'sha384-SnzOobpRMLXZ52iJvZm/C0fYw0OQemTXzTjIsdsfMcrCtCEe9qgzxTd3RSklO5x2',
  urls:['https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js','https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js','https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js']};
export function loadLib(name){
  var L=LIBS[name]; if(!L) return Promise.reject(new Error('알 수 없는 라이브러리: '+name));
  if(L.test()) return Promise.resolve();
  if(L._p) return L._p;
  L._p=new Promise(function(res,rej){
    (function nx(i){
      if(i>=L.urls.length){ L._p=null; return rej(new Error(L.label+'을(를) 불러오지 못했습니다 — 네트워크·사내 차단을 확인해 주세요')); }
      var s=document.createElement('script'); s.src=L.urls[i]; s.integrity=L.sri; s.crossOrigin='anonymous';
      s.onload=function(){ if(L.test()) res(); else { s.remove(); nx(i+1); } };
      s.onerror=function(){ s.remove(); nx(i+1); };
      document.head.appendChild(s);
    })(0);
  });
  return L._p;
}
/* Web Worker 스크립트는 integrity 속성을 못 쓰므로 직접 받아 sha384 를 맞춰 본 뒤 blob URL 로 — 어긋나면 null (호출 쪽이 폴백) */
export function loadWorkerBlob(W){
  if(W._url) return Promise.resolve(W._url);
  if(!(window.crypto&&crypto.subtle)) return Promise.resolve(null);
  return (function nx(i){
    if(i>=W.urls.length) return Promise.resolve(null);
    return fetch(W.urls[i]).then(function(r){ if(!r.ok) throw 0; return r.arrayBuffer(); })
      .then(function(buf){ return crypto.subtle.digest('SHA-384', buf).then(function(h){
        var b64=btoa(String.fromCharCode.apply(null, new Uint8Array(h)));
        if('sha384-'+b64!==W.sri) throw 0;
        W._url=URL.createObjectURL(new Blob([buf],{type:'text/javascript'})); return W._url; }); })
      .catch(function(){ return nx(i+1); });
  })(0);
}
export function bzxLoadLib(){ return loadLib('xlsx'); }
/* 엑셀 날짜 → JS Date (날짜만).  ★ SheetJS 의 cellDates 는 시간대 보정으로 «8/1 00:00» 을 «7/31 23:59:08» 로 만들어
   8월 1일자 하위매출 84행이 7월로 밀려 통째로 빠졌습니다 → 일련번호(숫자)를 직접 날짜로 바꾸고, Date 가 와도 30분을 더해 반올림합니다 */
export function bzxDate(v){
  if(v==null||v==='') return null;
  if(v instanceof Date){ if(isNaN(v.getTime())) return null; var r=new Date(v.getTime()+30*60*1000); return new Date(r.getFullYear(),r.getMonth(),r.getDate()); }
  if(typeof v==='number' && v>20000 && v<80000 && window.XLSX){ var d=XLSX.SSF.parse_date_code(Math.round(v*1440)/1440); return d? new Date(d.y,d.m-1,d.d) : null; }
  var m=String(v).match(/(\d{4})[-./]\s*(\d{1,2})(?:[-./]\s*(\d{1,2}))?/); return m? new Date(+m[1],+m[2]-1,m[3]? +m[3]:1) : null;
}
/* 엑셀 → 행 배열. 머릿글 행을 «고객사»·«회계매출» 이 있는 줄로 찾습니다(위에 제목 줄이 있어도 됨) */
export function bzxParse(buf){
  var wb=XLSX.read(buf,{type:'array'});           // cellDates 를 쓰지 않습니다 — 날짜는 bzxDate 가 일련번호에서 직접 계산
  var ws=wb.Sheets[wb.SheetNames[0]];
  var aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null});
  var hi=-1; for(var i=0;i<Math.min(aoa.length,20);i++){ var r=aoa[i]||[]; if(r.indexOf('고객사')>=0 && r.some(function(c){ return /회계\s*매출/.test(String(c||'')); })){ hi=i; break; } }
  if(hi<0) throw new Error('머릿글에 «고객사»·«회계매출» 열이 있는 시트가 아닙니다. 비즈포탈 매출 목록을 그대로 내려받은 파일을 올려주세요.');
  var H=aoa[hi].map(function(c){ return String(c||'').replace(/\s+/g,''); });
  function col(re){ for(var j=0;j<H.length;j++) if(re.test(H[j])) return j; return -1; }
  var C={no:col(/^등록번호/), kind:col(/^매출종류/), proj:col(/^프로젝트명/), cust:col(/^고객사/), ch:col(/^영업채널/), biller:col(/^계산서발행대상/), st:col(/^진행상태/),
         sales:col(/^매출액$/), acc:col(/^회계매출/), when:col(/^예상시기/), insp:col(/^검수일/), owner:col(/^담당자/), why:col(/^변경사유/)};
  if(C.acc<0||C.cust<0) throw new Error('«고객사» 또는 «회계매출» 열을 찾지 못했습니다.');
  var out=[];
  for(i=hi+1;i<aoa.length;i++){ r=aoa[i]||[]; if(!r[C.cust]) continue;
    var g=function(k){ return C[k]>=0? r[C[k]] : null; };
    out.push({no:g('no'), kind:g('kind'), proj:String(g('proj')||''), cust:String(g('cust')||'').trim(), ch:g('ch')||'', biller:g('biller')||'', st:String(g('st')||'').trim(),
              sales:Number(g('sales'))||0, acc:Number(g('acc'))||0, when:bzxDate(g('when')), insp:bzxDate(g('insp')), owner:g('owner')||'', why:g('why')||''}); }
  return out;
}
/* 회사 매칭 키: (에스원)·(S1) 표기 제거 → nmKeys(별칭·괄호·(주)·공백 무시) → ㈜·재단법인·유한회사·기호도 제거. 짧은 괄호 키(지역·사이트명)는 버림 */
export var BZX_SITE=/^(중국|미국|청주|페루|괌|사우디|이집트|말레이시아|스웨덴|스웬덴|창원|대전센터|이레빌딩|판교|수원|천안|본사|물류센터)/;
export var BZX_SUFFIX=/(점|센터|지점|지사|공장|사업장|캠퍼스|본점|영업소)$/;   // «이투스 창원점» «여성긴급전화1366 세종센터» 의 꼬리 토큰
export function bzxKeys(name){
  var t=String(name||'').replace(/\((에스원|S1)\)/g,'').replace(/\s+-\s+.*$/,'');   // «○○ - 대전센터» 같은 사이트 꼬리 제거
  var plain=t.replace(/\([^)]*\)/g,'').trim();
  var base=nmKeys(plain);
  /* 띄어쓴 마지막 토큰이 사이트명(지역·○○점·○○센터)이면 뺀 이름도 키로 — 관리포탈은 «이투스(창원)», 비즈포탈은 «이투스 창원점» 식으로 적기 때문 */
  var toks=plain.split(/\s+/); if(toks.length>=2){ var last=toks[toks.length-1]; if(BZX_SITE.test(last)||BZX_SUFFIX.test(last)) base=base.concat(nmKeys(toks.slice(0,-1).join(' '))); }
  /* 괄호 안 표기 — 영문 약칭(SQDA·GCCL)이나 옛 이름도 키로 (3자 이상, 지역·사이트명은 제외) */
  var par=[]; var re=/\(([^)]*)\)/g, m; while((m=re.exec(t))){ var x=m[1].trim(); if(/^구\.?\s*/.test(x) || (x.length>=3 && !BZX_SITE.test(x) && !/^(주|유|사|재)$/.test(x))) par=par.concat(nmKeys(x.replace(/^구\.?\s*/,''))); }
  return base.concat(par).map(function(k){ return k.replace(/^(㈜|재단법인|사단법인|유한회사|학교법인)|(㈜|유한회사)$/g,'').replace(/[㈜·,.\-]/g,''); }).filter(function(k){ return k.length>=2; });
}
export function bzxMonthIdx(rows){
  var cnt={}; rows.forEach(function(r){ if(r.when){ var k=r.when.getFullYear()+'-'+('0'+(r.when.getMonth()+1)).slice(-2); cnt[k]=(cnt[k]||0)+1; } });
  var best=Object.keys(cnt).sort(function(a,b){ return cnt[b]-cnt[a]; })[0];
  return {ym:best||null, idx:best? dIdx(best) : null, months:Object.keys(cnt).sort(), cnt:cnt};
}
/* 그룹 분류 — 병합 뒤에도 다시 계산할 수 있게 따로 */
export function bzxCat(q){
  var hasBiz=q.bizAmt!==0, hasDb=q.db.length>0, hasZero=q.zero&&q.zero.length>0;
  if(!hasBiz && !hasDb){ q.cat=hasZero? 'skip' : 'skip'; return; }               // 비교할 금액이 양쪽 다 없음
  if(hasBiz && hasDb && Math.abs(q.diff)<=1){ q.diff=0; q.cat='eq'; return; }   // 12분할 반올림 1원 차이는 일치로
  if(hasBiz && hasDb){ q.cat=((q.bizFee||q.dbFee) && Math.round((q.bizAmt-q.bizFee)-(q.dbTot-q.dbFee))===0)? 'fee' : 'amt'; return; }
  if(hasBiz){ q.cat='bizonly'; return; }
  q.cat=hasZero? 'zero' : 'dbonly';                                                // 비즈포탈에 행은 있지만 회계매출 0
}
/* 대조 본체 */
export function bzxCompare(rows, T){
  // 관리포탈 쪽: 그 달 월 매출(계약별) + 정산일이 그 달인 설치비  (달은 문자열이 아니라 월 인덱스로 비교 — 형식이 달라도 안전)
  var byCt={}, nearCnt={};
  (ST.RAWX.mrs||[]).forEach(function(x){ var i=dIdx(x.month); if(i==null) return;
    if(i===T) byCt[x.contract_id]=(byCt[x.contract_id]||0)+Number(x.amount||0);
    if(Math.abs(i-T)<=2) nearCnt[i]=(nearCnt[i]||0)+1; });
  var dbRows=[]; (ST.DATA.rows||[]).forEach(function(r){
    var a=byCt[r._id]||0, fee=(r.fee && String(r.settle||'').slice(0,7)===mk(T))? r.fee : 0;
    if(!a && !fee) return;
    dbRows.push({r:r, cust:r.cust, line:r.line, amt:a, fee:fee, status:r.status, note:r.note});
  });
  // 키 → 그룹 (union)
  var G={}, nid=0; function gid(ks){ var ids=[]; ks.forEach(function(k){ if(G[k]!=null && ids.indexOf(G[k])<0) ids.push(G[k]); }); var g=ids.length? Math.min.apply(null,ids) : (++nid);
    if(ids.length>1) Object.keys(G).forEach(function(k){ if(ids.indexOf(G[k])>=0) G[k]=g; }); ks.forEach(function(k){ G[k]=g; }); return g; }
  var custAl={}; (SB_RAW.customers||[]).forEach(function(c){ custAl[c.name]=c.aliases||[]; });
  dbRows.forEach(function(d){ d.g=gid(bzxKeys(d.cust).concat((custAl[d.cust]||[]).reduce(function(a,al){ return a.concat(bzxKeys(al)); },[]))); });
  rows.forEach(function(b){ b.g=gid(bzxKeys(b.cust)); });
  var groups={};
  function grp(g){ return groups[g]=groups[g]||{g:g, biz:[], db:[], names:{}}; }
  dbRows.forEach(function(d){ var q=grp(d.g); q.db.push(d); q.names[d.cust]=1; });
  rows.forEach(function(b){ var q=grp(b.g); q.biz.push(b); q.names[b.cust]=1; });
  var out=[];
  Object.keys(groups).forEach(function(k){
    var q=groups[k];
    var done=q.biz.filter(bzxCounted), skip=q.biz.filter(function(b){ return !bzxCounted(b); });
    q.zero=done.filter(function(b){ return !b.acc; });            // 행은 있는데 회계매출 0 (하위매출 미등록 · 수금 변경 행 · 상위 행)
    q.zeroSales=q.zero.reduce(function(a,b){ return a+(b.sales||0); },0);
    q.bizAmt=done.reduce(function(a,b){ return a+b.acc; },0); q.skipAmt=skip.reduce(function(a,b){ return a+b.acc; },0);
    q.bizFee=done.filter(function(b){ return /설치비/.test(b.proj); }).reduce(function(a,b){ return a+b.acc; },0);
    q.dbAmt=q.db.reduce(function(a,d){ return a+d.amt; },0); q.dbFee=q.db.reduce(function(a,d){ return a+d.fee; },0);
    q.dbTot=q.dbAmt+q.dbFee; q.diff=Math.round(q.bizAmt-q.dbTot);
    q.name=Object.keys(q.names).sort(function(a,b){ return b.length-a.length; })[0];
    q.bizName=(done[0]||q.biz[0]||{}).cust||q.name;
    bzxCat(q);
    out.push(q);
  });
  /* 표기 차이 병합: 비즈포탈만 ↔ 포탈만 인데 이름이 거의 같은 짝(한 글자 오타 수준)은 금액이 달라도 한 회사로 묶어 비교합니다
     — 예전엔 금액까지 같아야 짝을 지어서, 오타 + 금액 차이면 «비즈포탈에만 있음» + «포탈에만 있음» 두 줄로 갈라졌습니다 */
  (function(){
    var bo=out.filter(function(q){ return q.cat==='bizonly'; }), dbo=out.filter(function(q){ return q.cat==='dbonly'; });
    bo.forEach(function(b){
      var best=/** @type {any} */ (null), bs=0, second=0;
      dbo.forEach(function(d){ if(d.merged) return; var sc=bzxSim(b.bizName,d.name); if(sc>bs){ second=bs; bs=sc; best=d; } else if(sc>second) second=sc; });
      if(!best || bs<0.8 || second>=0.8) return;                 // 유일하게 닮은 짝만
      b.db=best.db; b.dbAmt=best.dbAmt; b.dbFee=best.dbFee; b.dbTot=best.dbTot; b.diff=Math.round(b.bizAmt-b.dbTot);
      Object.keys(best.names).forEach(function(n){ b.names[n]=1; });
      b.aliasHint={biz:b.bizName, db:best.name, sim:bs};
      best.merged=true; bzxCat(b);
    });
    out=out.filter(function(q){ return !q.merged; });
  })();
  // 표기 차이 추정: 비즈포탈만 ↔ 포탈만 중 금액이 같은 짝(유일할 때만). 이름이 닮았거나 금액이 흔하지 않으면 «표기 차이(추정)», 아니면 «금액만 같음(확인 필요)»
  var bo=out.filter(function(q){ return q.cat==='bizonly'; }), dbo=out.filter(function(q){ return q.cat==='dbonly'; });
  var amtCnt={}; out.forEach(function(q){ if(q.bizAmt) amtCnt[Math.round(q.bizAmt)]=(amtCnt[Math.round(q.bizAmt)]||0)+1; if(q.dbTot) amtCnt[Math.round(q.dbTot)]=(amtCnt[Math.round(q.dbTot)]||0)+1; });
  function similar(a,b){ var ka=bzxKeys(a), kb=bzxKeys(b); return ka.some(function(x){ return kb.some(function(y){ if(x.indexOf(y)>=0||y.indexOf(x)>=0) return true; for(var i=0;i+3<=x.length;i++){ if(y.indexOf(x.slice(i,i+3))>=0) return true; } return false; }); }); }
  bo.forEach(function(b){ var c=dbo.filter(function(d){ return !d.pair && Math.round(d.dbTot)===Math.round(b.bizAmt); });
    if(c.length===1){ var d=c[0], conf=(similar(b.name,d.name) || (amtCnt[Math.round(b.bizAmt)]||0)<=2)? 'high':'low';
      b.pair=d; d.pair=b; b.pairConf=d.pairConf=conf; b.cat='alias'; d.cat='alias2'; } });
  // 비즈포탈에만 있는 회사: 포탈에 고객사·계약은 있는지(이 달 매출만 없는지) 확인해 둠
  out.forEach(function(q){ if(q.cat!=='bizonly') return; var ks=bzxKeys(q.name);
    q.dbCts=(ST.DATA.rows||[]).filter(function(r){ return !r.parent && bzxKeys(r.cust).some(function(k){ return ks.indexOf(k)>=0; }); }); });
  // 반복 차이 규칙: 같은 회사·같은 종류의 차이면 묻지 않고 규칙의 사유를 씀
  out.forEach(function(q){ q.rule=(['dbonly','bizonly','fee','amt','zero'].indexOf(q.cat)>=0)? bzxRuleFor(q) : null; });
  var sum={biz:0, db:0, skip:0, n:{}, ruled:0, ruledAmt:0, ign:0, ignBiz:0, ignDb:0};
  out.forEach(function(q){ sum.skip+=q.skipAmt; sum.n[q.cat]=(sum.n[q.cat]||0)+1;
    if(q.rule && q.rule.mode==='ignore'){ sum.ign++; sum.ignBiz+=q.bizAmt; sum.ignDb+=q.dbTot; return; }   // 무시 규칙: 총계에서 아예 뺌
    sum.biz+=q.bizAmt; sum.db+=q.dbTot; if(q.rule){ sum.ruled++; sum.ruledAmt+=q.diff; } });
  sum.diff=Math.round(sum.biz-sum.db);
  /* 진단 — 차이가 비정상적으로 많을 때 어디가 문제인지 바로 보이게 */
  var diag={ nearCnt:nearCnt, dbCts:Object.keys(byCt).length, dbRows:dbRows.length, bizCusts:0, matched:0, unit:null, nearMiss:[] };
  var bc={}; rows.forEach(function(b){ if(bzxCounted(b) && b.acc) bc[b.cust]=1; }); diag.bizCusts=Object.keys(bc).length;
  out.forEach(function(q){ if(q.biz.length && q.db.length) diag.matched++; });
  if(sum.biz>0 && sum.db>0){ var r=sum.db/sum.biz; if(r>400&&r<2500) diag.unit='관리포탈 금액이 비즈포탈의 약 '+Math.round(r)+'배 — 단위(원/천원)가 다른 것 같습니다'; else if(r<1/400&&r>1/2500) diag.unit='비즈포탈 금액이 관리포탈의 약 '+Math.round(1/r)+'배 — 단위(원/천원)가 다른 것 같습니다'; }
  var portalNames={}; (ST.DATA.rows||[]).forEach(function(r){ if(r.cust) portalNames[r.cust]=1; }); portalNames=Object.keys(portalNames);
  out.filter(function(q){ return q.cat==='bizonly'; }).slice(0,60).forEach(function(q){
    var best=null,bs=0; portalNames.forEach(function(n){ var sc=bzxSim(q.bizName,n); if(sc>bs){ bs=sc; best=n; } });
    if(best && bs>=0.5) diag.nearMiss.push({biz:q.bizName, db:best, sim:bs});
  });
  diag.nearMiss.sort(function(a,b){ return b.sim-a.sim; });
  return {groups:out, sum:sum, T:T, diag:diag};
}
export var BZX_CAT={eq:['일치','var(--ok,#2e7d32)'], fee:['설치비 인식 시점','var(--warn,#b26a00)'], amt:['금액 다름','var(--critical)'], bizonly:['비즈포탈에만 있음','var(--critical)'], dbonly:['관리포탈에만 있음','var(--critical)'], zero:['비즈포탈 회계매출 0','var(--warn,#b26a00)'], alias:['표기 차이(추정)','var(--s1)'], alias2:['표기 차이(추정)','var(--s1)'], aliasq:['금액만 같음(확인 필요)','var(--warn,#b26a00)'], skip:['실패·중지(참고)','var(--muted)']};
export function bzxPrevNote(name){
  // 예전 달 biz_recon 에 같은 고객사 사유가 있으면 기본값으로 (같은 차이가 매달 반복될 때 다시 안 적게)
  var hit=/** @type {any} */ (null); (ST.RAWX.biz||[]).forEach(function(r){ if(r.kind==='detail' && r.note && r.item && bzxKeys(r.item).some(function(k){ return bzxKeys(name).indexOf(k)>=0; })){ if(!hit || (r.id||0)>(hit.id||0)) hit=r; } });
  return hit? String(hit.note).replace(/^🔁\s*/,'') : '';
}
export function bzxNoteKey(q){ return mk(BZX.res.T)+'|'+q.name; }
export function bzxRender(host){
  var res=BZX.res, S=res.sum, T=res.T;
  var box=document.createElement('section'); box.id='bzxBox'; box.style.cssText='margin:6px 0 22px;padding:14px 16px;border:1px solid var(--ring);border-radius:12px;background:var(--surface)';
  function w(v){ return Math.round(v).toLocaleString('ko-KR'); }
  var diffsAll=res.groups.filter(function(q){ return ['fee','amt','bizonly','dbonly','alias','zero'].indexOf(q.cat)>=0; }).sort(function(a,b){ return Math.abs(b.diff)-Math.abs(a.diff); });
  var diffs=diffsAll.filter(function(q){ return !q.rule; }), ruled=diffsAll.filter(function(q){ return q.rule; });
  var eqs=res.groups.filter(function(q){ return q.cat==='eq'; }), skips=res.groups.filter(function(q){ return q.cat==='skip' || q.skipAmt; });
  var h=tpl`<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:8px"><b style="font-size:15px">📥 비즈포탈 엑셀 자동 대조 — ${mk(T)}</b><span class="mini" style="color:var(--muted)">${BZX.file} · ${BZX.rows.length}행 · 파일은 저장하지 않고 이 화면에서만 씁니다</span></div>`;
  h+=tpl`<div class="kpis" style="margin-bottom:12px">`+
    tpl`<div class="kpi"><div class="k">비즈포탈 회계매출 (종료·계산서발행)</div><div class="v">${rawHtml(w(S.biz/1000))}<small>천원</small></div><div class="d">실패·중지 ${rawHtml(w(S.skip/1000))}천원 제외${rawHtml(S.ign? ' · 무시 규칙 '+w(S.ignBiz/1000)+'천원 제외':'')}</div></div>`+
    tpl`<div class="kpi"><div class="k">관리포탈 매출 (월 매출 + 설치비)</div><div class="v">${rawHtml(w(S.db/1000))}<small>천원</small></div><div class="d">이 포탈 DB 의 ${mk(T)} 인식 금액 · 정산일 ${mk(T)} 설치비 포함${rawHtml(S.ign? ' · 무시 규칙 '+w(S.ignDb/1000)+'천원 제외':'')}</div></div>`+
    tpl`<div class="kpi ${S.diff>=0?'up':'down'}"><div class="k">차액 (비즈포탈 − 관리포탈)</div><div class="v">${S.diff>0?'+':''}${rawHtml(w(S.diff/1000))}<small>천원</small></div><div class="d">일치 ${rawHtml(S.n.eq||0)}곳 · 확인할 차이 ${diffs.length}곳${rawHtml(S.n.alias? ' (표기 차이 추정 '+S.n.alias+'쌍 포함)':'')}${rawHtml(ruled.length? ' · 반복 규칙 '+ruled.length+'곳'+(S.ign? ' (무시 '+S.ign+')':''):'')}</div></div></div>`;
  (function(){
    var D=res.diag||{}, total=res.groups.length||1, bad=diffs.length/total;
    var lines=[];
    var nearTxt=Object.keys(D.nearCnt||{}).sort().map(function(i){ return mk(+i)+' '+D.nearCnt[i]+'건'; }).join(' · ');
    lines.push(tpl`관리포탈 월 매출(monthly_revenue) ${mk(T)}: 계약 <b>${rawHtml(D.dbCts||0)}건</b>${rawHtml(nearTxt? tpl` <span style="color:var(--muted)">(인접 달: ${rawHtml(nearTxt)})</span>`:'')}`+ tpl`${rawHtml((D.dbCts||0)===0? ' — <b style="color:var(--critical)">이 달 인식 금액이 하나도 없습니다. 월 매출 인식이 아직 안 돌았거나 대상 월이 다릅니다</b>':'')}`);
    if((D.dbCts||0)>0){
      lines.push(tpl`비즈포탈 회계매출 있는 고객사 <b>${rawHtml(D.bizCusts||0)}곳</b> · 이름으로 관리포탈과 붙은 회사 <b>${rawHtml(D.matched||0)}곳</b>`+ tpl`${rawHtml((D.bizCusts||0)>0 && (D.matched||0)/(D.bizCusts||1)<0.5? ' — <b style="color:var(--critical)">절반도 안 붙었습니다. 두 쪽 고객사 표기 방식이 체계적으로 다른 것 같습니다 (아래 비슷한 이름 목록에서 패턴을 봐 주세요)</b>':'')}`);
    } else lines.push('→ 관리포탈에 '+mk(T)+' 월 매출을 먼저 만들고(매출 인식·재계산) 엑셀을 다시 올리면 됩니다. 이 상태의 «비즈포탈에만 있음» 은 전부 그 때문이라 저장하지 마세요.');
    if(D.unit) lines.push(tpl`<b style="color:var(--critical)">⚠ ${rawHtml(D.unit)}</b>`);
    if((D.dbCts||0)>0 && D.nearMiss && D.nearMiss.length) lines.push(tpl`비즈포탈에만 있는 회사 중 관리포탈에 <i>비슷한 이름</i>이 있는 경우 (표기 패턴 확인용): `+
      tpl`${rawHtml(D.nearMiss.slice(0,12).map(function(x){ return tpl`${x.biz} ≈ <span style="color:var(--s1-ink)">${x.db}</span> (${Math.round(x.sim*100)}%)`; }).join(' · '))}`);
    if(BZX.monthCnt){ var mc=Object.keys(BZX.monthCnt).sort().map(function(k){ return k+' '+BZX.monthCnt[k]+'행'; }).join(' · ');
      var dropped=Object.keys(BZX.monthCnt).filter(function(k){ return k!==BZX.month; }).reduce(function(a,k){ return a+BZX.monthCnt[k]; },0);
      lines.unshift('엑셀 «예상시기» 월 분포: '+mc+(dropped? ' — 다른 달로 적힌 '+dropped+'행도 모두 대조에 넣었습니다 (엑셀은 그 달 목록이므로 날짜로 걸러내지 않습니다)':' (전부 '+BZX.month+')')); }
    var open=bad>0.3 || (D.dbCts||0)===0 || !!D.unit || (BZX.monthCnt && Object.keys(BZX.monthCnt).length>1);
    h+=tpl`<details${open?' open':''} style="margin:0 0 10px;padding:8px 12px;border:1px dashed var(--ring);border-radius:10px;background:var(--surface-2,rgba(0,0,0,.02))"><summary class="mini" style="cursor:pointer"><b>🩺 대조 진단</b>`+ tpl`${rawHtml(open? ' <span style="color:var(--critical)">— 차이가 비정상적으로 많아 자동으로 펼쳤습니다. 아래 줄을 확인하세요</span>':'')}</summary>`+
       tpl`<div class="mini" style="line-height:1.8;margin-top:6px">${rawHtml(lines.map(function(l){ return '· '+l; }).join('<br>'))}</div></details>`;
  })();
  h+='<div style="overflow-x:auto"><table class="pr" style="width:100%;table-layout:fixed"><colgroup><col style="width:130px"><col style="width:24%"><col style="width:100px"><col style="width:100px"><col style="width:100px"><col style="width:200px"><col></colgroup><thead><tr><th>구분</th><th>고객사</th><th class="n">비즈포탈(원)</th><th class="n">관리포탈(원)</th><th class="n">차이(원)</th><th></th><th>사유 <span class="mini" style="color:var(--muted)">(담당자 입력 · 지난달 같은 사유는 미리 채움 · 회색 글은 자동 판단)</span></th></tr></thead><tbody>';
  if(!diffs.length) h+=tpl`<tr><td colspan="7" class="mini" style="color:var(--muted)">${ruled.length? '확인할 차이 없음 — 남은 차이는 모두 반복 규칙으로 처리됐습니다 ✓' : '차이 없음 — 전부 일치합니다 🎉'}</td></tr>`;
  diffs.forEach(function(q,i){
    var c=BZX_CAT[q.cat==='alias' && q.pairConf==='low'? 'aliasq' : q.cat], key=bzxNoteKey(q), note=(BZX.notes[key]!=null)? BZX.notes[key] : bzxPrevNote(q.name);
    var pairTxt=q.pair? ' ⇄ '+esc(q.pair.name) : (q.aliasHint? tpl` <span class="mini" style="color:var(--s1-ink)">⇄ ${q.aliasHint.db} (표기 차이 추정)</span>` : '');
    var auto=q.cat==='fee'? '설치비 '+w(q.bizFee||q.dbFee)+'원 — 비즈포탈은 이 달, 관리포탈 정산일은 '+(q.db.filter(function(d){return d.r.fee;}).map(function(d){ return String(d.r.settle||'').slice(0,7)||'없음'; })[0]||'다른 달')
           : q.cat==='alias'? (q.pairConf==='low'? '금액만 같고 이름은 전혀 달라 같은 회사인지 확인 필요 — 맞으면 별칭 저장, 아니면 각각 사유 기입' : '양쪽에 같은 금액 — 이름 표기만 다름(별칭 저장 권장)')
           : (q.cat==='bizonly' && q.dbCts && q.dbCts.length)? '관리포탈에 고객사는 있으나 이 달 매출 없음 — 계약 '+q.dbCts.map(function(r){ return lline(r.line)+' '+(r.startRaw!=null?mk(r.startRaw):'?')+'~'+(r.endRaw!=null?mk(r.endRaw):'')+' '+(r.status||''); }).join(', ')
           : q.cat==='bizonly'? '관리포탈에 이 고객사가 없음 — 계약 미등록 또는 사명이 전혀 다름'
           : q.cat==='dbonly'? '관리포탈(이 DB)에는 이 달 매출이 있는데 비즈포탈 엑셀에는 행이 없음 — 비즈포탈 미등록·인식 월 차이·사명 불일치 중 하나'
           : q.cat==='zero'? ('비즈포탈에 행은 있지만 회계매출이 0 — 매출액 '+w(q.zeroSales)+'원 · '+esc(q.zero.map(function(b){ return (b.st||'')+(b.why? '/'+b.why:''); }).filter(function(x,i,a){ return a.indexOf(x)===i; }).join(', '))+' (하위매출 미등록·수금 변경 행이면 비즈포탈에서 회계매출 등록 필요)')
           : (q.aliasHint && q.cat==='amt')? ('표기 차이 «'+esc(q.aliasHint.biz)+'» ⇄ «'+esc(q.aliasHint.db)+'» 로 묶어 비교 — 금액이 다릅니다') : '';
    var bizAmt=q.cat==='alias'? q.bizAmt : q.bizAmt, dbAmt=q.cat==='alias'? q.pair.dbTot : q.dbTot, diff=q.cat==='alias'? 0 : q.diff;
    h+=tpl`<tr data-i="${rawHtml(i)}"><td><span class="chip" style="pointer-events:none;color:${rawHtml(c[1])};border-color:${rawHtml(c[1])}">${rawHtml(c[0])}</span></td>`+
       tpl`<td style="overflow-wrap:anywhere;white-space:normal"><b>${q.name}</b>${rawHtml(pairTxt)}${rawHtml(Object.keys(q.names).length>1 && !q.pair? tpl`<div class="mini" style="color:var(--muted)">${Object.keys(q.names).filter(function(n){return n!==q.name;}).join(' · ')}</div>`:'')}</td>`+
       tpl`<td class="n">${rawHtml(q.biz.some(bzxCounted)? w(bizAmt):'·')}</td><td class="n">${rawHtml((q.db.length||q.pair)? w(dbAmt):'·')}</td>`+
       tpl`<td class="n" style="font-weight:700;color:${diff===0?'var(--muted)':diff>0?'var(--ok,#2e7d32)':'var(--critical)'}">${diff>0?'+':''}${rawHtml(w(diff))}</td>`+
       tpl`<td style="white-space:normal"><div style="display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center"><button class="chip bzx-det" data-i="${rawHtml(i)}" title="양쪽 원본 행 보기">내역</button>${rawHtml((q.cat==='alias'||q.aliasHint) && !ST.IS_VIEWER? tpl`<button class="chip bzx-alias" data-i="${rawHtml(i)}" title="비즈포탈 표기를 포탈 고객사의 별칭으로 저장 — 다음 달부터 자동으로 맞춰짐">별칭 저장</button>`:'')}`+ tpl`${rawHtml((q.cat!=='alias' || q.pairConf==='low') && !ST.IS_VIEWER? tpl`<select class="chip bzx-rule" data-i="${rawHtml(i)}" title="이 회사가 매달 같은 종류의 차이로 잡힐 때 어떻게 할지 — 다시 묻지 않습니다. 사유 기록 = 차액 인정·사유 자동 기록 / 무시 = 우리 차액 아님·총계와 표에서 제외" style="font:inherit;font-size:12px;cursor:pointer;width:124px;max-width:124px;box-sizing:border-box;padding-right:14px;text-overflow:ellipsis"><option value="">🔁 반복 규칙</option><option value="note">사유 기록 반복</option><option value="ignore">무시 반복</option></select>`:'')}</div></td>`+
       tpl`<td><input class="bzx-note" data-key="${key}" value="${note}" placeholder="${auto||'왜 다른지 한 줄로'}" title="${auto||''}" style="width:100%;box-sizing:border-box;font:inherit;padding:5px 8px;border:1px solid var(--ring);border-radius:8px;background:var(--surface-2);color:inherit"></td></tr>`;
    h+=tpl`<tr class="bzx-detrow" data-i="${rawHtml(i)}" style="display:none"><td colspan="7" style="background:var(--surface-2,rgba(0,0,0,.02))"><div class="mini" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">`+
       tpl`<div><b>비즈포탈 행</b>${rawHtml(q.biz.length? tpl`<table class="pr" style="margin-top:4px"><tbody>${rawHtml(q.biz.map(function(b){ return tpl`<tr><td>${b.proj}</td><td>${b.st}</td><td class="n">${rawHtml(w(b.acc))}</td><td class="mini">${b.why||''}</td></tr>`; }).join(''))}</tbody></table>` : '<div style="color:var(--muted)">없음</div>')}</div>`+
       tpl`<div><b>관리포탈 계약 (이 DB)</b>${rawHtml((q.pair? q.pair.db : q.db).length? tpl`<table class="pr" style="margin-top:4px"><tbody>${rawHtml((q.pair? q.pair.db : q.db).map(function(d){ return tpl`<tr><td>${d.cust}</td><td>${lline(d.line)} · ${d.status||''}</td><td class="n">${rawHtml(w(d.amt))}${rawHtml(d.fee? ' + 설치비 '+w(d.fee):'')}</td><td class="mini">${(d.note||'').slice(0,40)}</td></tr>`; }).join(''))}</tbody></table>` : tpl`<div style="color:var(--muted)">이 달 매출 없음${q.cat==='bizonly'? ' — 계약 미등록·사명 불일치·인식 월 차이 중 하나':''}</div>`)}</div></div></td></tr>`;
  });
  h+='</tbody></table></div>';
  h+=tpl`<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px">`+ tpl`${rawHtml(ruled.length? tpl`<button class="chip" id="bzxRuled" aria-pressed="${rawHtml(BZX.showRuled)}" title="한 번 정한 규칙으로 매달 자동 처리되는 차이 — 사유 기록 반복은 저장 시 사유가 붙어 기록되고, 무시 반복은 총계·표에서 빠집니다">🔁 반복 규칙 ${ruled.length}곳 · 기록 ${ruled.length-S.ign} / 무시 ${rawHtml(S.ign)} ${BZX.showRuled?'접기':'보기'}</button>`:'')}`+
     tpl`<button class="chip" id="bzxEq" aria-pressed="${rawHtml(BZX.showEq)}">일치 ${eqs.length}곳 ${BZX.showEq?'접기':'보기'}</button>`+
     tpl`<button class="chip" id="bzxSkip" aria-pressed="${rawHtml(BZX.showSkip)}">실패·중지 참고 ${skips.length}곳 · ${rawHtml(w(S.skip/1000))}천원 ${BZX.showSkip?'접기':'보기'}</button>`+
     tpl`<span class="spacer" style="flex:1"></span>`+ tpl`${rawHtml(ST.IS_VIEWER? '' : tpl`<button class="pill pri" id="bzxSave">💾 비즈포탈 차액 표에 저장 (${rawHtml(T!=null? (+mk(T).slice(5,7))+'월':'')})</button>`)}`+
     tpl`<button class="pill ghost" id="bzxClose">닫기</button></div>`;
  if(BZX.showRuled && ruled.length) h+=tpl`<div class="mini" style="margin-top:8px"><b>🔁 반복 규칙으로 처리된 차이</b> — <b>사유 기록</b>은 저장 시 사유가 붙어 차액 표에 남고, <b>무시</b>는 우리 차액이 아닌 것으로 보아 총계·표에서 빠집니다. 차이 종류가 바뀌면 자동으로 다시 확인 표에 올라옵니다<table class="pr" style="margin-top:4px"><thead><tr><th>규칙</th><th>구분</th><th>고객사</th><th class="n">비즈포탈</th><th class="n">포탈</th><th class="n">차이</th><th>사유(규칙)</th><th></th></tr></thead><tbody>`+
    tpl`${rawHtml(ruled.map(function(q){ var c=BZX_CAT[q.cat], ig=q.rule.mode==='ignore'; return tpl`<tr${rawHtml(ig? ' style="color:var(--muted)"':'')}><td><span class="chip" style="pointer-events:none;${ig? 'color:var(--muted)':'color:var(--s1-ink);border-color:var(--s1)'}">${ig? '무시':'사유 기록'}</span></td><td><span class="chip" style="pointer-events:none;color:${rawHtml(c[1])};border-color:${rawHtml(c[1])}">${rawHtml(c[0])}</span></td><td>${q.name}</td><td class="n">${rawHtml(q.bizAmt? w(q.bizAmt):'·')}</td><td class="n">${rawHtml(q.dbTot? w(q.dbTot):'·')}</td><td class="n">${q.diff>0?'+':''}${rawHtml(w(q.diff))}</td><td>${q.rule.note} <span style="color:var(--muted)">(${rawHtml(String(q.rule.created_at||'').slice(0,10))}${rawHtml(q.rule.created_by? ' · '+esc(q.rule.created_by):'')})</span></td><td>${rawHtml(ST.IS_VIEWER? '' : tpl`<button class="chip bzx-unrule" data-id="${rawHtml(q.rule.id)}" title="규칙을 끄면 다음 대조부터 다시 확인 표에 나옵니다">규칙 해제</button>`)}</td></tr>`; }).join(''))}</tbody></table></div>`;
  if(BZX.showEq) h+=tpl`<div class="mini" style="margin-top:8px;line-height:1.7"><b>일치</b> — ${rawHtml(eqs.map(function(q){ return esc(q.name)+' '+w(q.bizAmt); }).join(' · '))}</div>`;
  if(BZX.showSkip) h+=tpl`<div class="mini" style="margin-top:8px"><b>실패·중지 행</b> (회계매출이 적혀 있어도 비교에서 뺐습니다 — 중복 등록·해지 건)<table class="pr" style="margin-top:4px"><tbody>${rawHtml(skips.map(function(q){ return q.biz.filter(function(b){ return !bzxCounted(b); }).map(function(b){ return tpl`<tr><td>${b.cust}</td><td>${b.proj}</td><td>${b.st}</td><td class="n">${rawHtml(w(b.acc))}</td><td class="mini">${b.why||''}</td></tr>`; }).join(''); }).join(''))}</tbody></table></div>`;
  h+=tpl`<div style="margin-top:10px">${rawHtml(helpBox('bzx','이 대조는 어떻게 계산하나요?',[
    ['비즈포탈 쪽','엑셀에서 쓰는 열은 «고객사»·«회계매출»·«진행상태» 셋뿐입니다. 진행상태가 «종료»·«계산서발행» 인 행의 «회계매출» 합 (실패·중지·취소류만 비교에서 빼고 참고로 보여줍니다). 행은 있는데 회계매출이 0 인 회사(상위 행만 있고 하위매출 미등록, 수금 변경 행)는 «비즈포탈 회계매출 0» 으로 따로 잡습니다. «예상시기» 는 대상 월 이름을 정할 때만 쓰고 행을 걸러내지 않습니다.'],
    ['관리포탈 쪽','이 통합 관리 포탈 DB 의 그 달 계약별 월 매출(monthly_revenue) 합 + 대금정산일이 그 달인 설치비. 비즈포탈은 설치비를 별도 행으로 잡기 때문에 같이 봐야 맞습니다. 표에서 «관리포탈» 은 항상 이 포탈, «비즈포탈» 은 올린 엑셀을 뜻합니다.'],
    ['회사 묶기','띄어쓰기·㈜·(에스원)·괄호 안 사이트명·사명 변경 별칭을 무시하고 회사 단위로 묶습니다(두산에너빌리티 사우디/괌/이집트 → 1곳). 이름이 한 글자 오타 수준으로 닮은 짝(브랜드/브랜즈, 에프엔비/에프앤비)은 금액이 달라도 한 회사로 묶어 비교하고 «⇄ 표기 차이 추정» 으로 표시합니다. 그 위에 «비즈포탈에만 있음» = 엑셀에만 있음, «관리포탈에만 있음» = 이 포탈 DB 에만 있음입니다. 이름은 전혀 다른데 양쪽 금액이 같으면 «표기 차이(추정)»로 짝을 제안합니다. «별칭 저장»을 누르면 다음 달부터 자동으로 맞춰집니다.'],
    ['사유','차이 행마다 담당자가 한 줄로 적습니다. 지난달에 같은 고객사로 적은 사유가 있으면 미리 채워 두니 확인만 하면 됩니다. 「저장」을 누르면 요약 3줄 + 고객사별 차이가 아래 «비즈포탈 차액» 표에 들어갑니다.'],
    ['🔁 매달 반복','<b>매달 같은 이유로 생기는 차이</b>는 사유를 적고 «매달 반복»에서 종류를 고르면 규칙으로 저장돼 다음 달부터 묻지 않습니다. <b>사유 기록 반복</b> = 차액은 그대로 인정하고 저장할 때 이 사유가 자동으로 붙어 기록됨(예: 설치비 인식 시점, 분기납 인식 차이). <b>무시 반복</b> = 우리 쪽 차액이 아닌 것(다른 부서 담당자가 등록하는 조달 건 등)으로 보고 총계·고객사별 표에서 아예 빼며 기록하지 않음. 둘 다 «반복 규칙» 묶음에서 확인·해제할 수 있고, 차이 종류가 바뀌면(예: 포탈에만 있음 → 금액 다름) 다시 확인을 받습니다.'],
    ['엑셀 파일','저장하지 않습니다. 화면을 닫으면 사라지고, 다음 달에는 새 파일을 다시 올리면 됩니다.']
  ]))}`+ tpl`</div>`;
  box.innerHTML=h; host.insertBefore(box, host.firstChild.nextSibling);
  helpWire(box);
  box.querySelectorAll('.bzx-note').forEach(function(inp){ inp.oninput=function(){ BZX.notes[inp.dataset.key]=inp.value; }; });
  box.querySelectorAll('.bzx-det').forEach(function(b){ b.onclick=function(){ var r=box.querySelector('.bzx-detrow[data-i="'+b.dataset.i+'"]'); r.style.display=r.style.display==='none'? '':'none'; }; });
  box.querySelectorAll('.bzx-alias').forEach(function(b){ b.onclick=function(){ bzxSaveAlias(diffs[+b.dataset.i]); }; });
  box.querySelectorAll('.bzx-rule').forEach(function(sel){ sel.onchange=function(){ var m=sel.value; sel.value=''; if(m) bzxSaveRule(diffs[+sel.dataset.i], m); }; });
  box.querySelectorAll('.bzx-unrule').forEach(function(b){ b.onclick=function(){ bzxDropRule(+b.dataset.id); }; });
  var rb=box.querySelector('#bzxRuled'); if(rb) rb.onclick=function(){ BZX.showRuled=!BZX.showRuled; renderBizMonthly(); };
  box.querySelector('#bzxEq').onclick=function(){ BZX.showEq=!BZX.showEq; renderBizMonthly(); };
  box.querySelector('#bzxSkip').onclick=function(){ BZX.showSkip=!BZX.showSkip; renderBizMonthly(); };
  box.querySelector('#bzxClose').onclick=function(){ BZX.res=null; BZX.rows=null; renderBizMonthly(); };
  var sv=box.querySelector('#bzxSave'); if(sv) sv.onclick=function(){ bzxSave(diffs); };
}
export async function bzxSaveRule(q, mode){
  if(!ST.SB_TOKEN){ openOvl('ovlAuth'); return; }
  mode=(mode==='ignore')? 'ignore':'note';
  var cat=(q.cat==='alias')? (q.bizAmt? 'bizonly':'dbonly') : q.cat;      // 금액만 같은 짝을 규칙으로 → 비즈포탈만/포탈만 규칙으로
  var note=BZX.notes[bzxNoteKey(q)]; if(note==null) note=bzxPrevNote(q.name);
  if(!note){ note=prompt('«'+q.name+'» 가 매달 «'+BZX_CAT[cat][0]+'»으로 잡힐 때 '+(mode==='ignore'? '무시하는 이유':'붙일 사유')+'를 적어주세요'); if(!note) return; BZX.notes[bzxNoteKey(q)]=note; }
  var what=(mode==='ignore')? '무시 반복 — 우리 차액이 아닌 것으로 보고 총계·고객사별 표에서 빼며 기록하지 않습니다' : '사유 기록 반복 — 저장할 때 이 사유가 자동으로 붙어 차액 표에 기록됩니다';
  if(!confirm('«'+q.name+'» · '+BZX_CAT[cat][0]+'\n사유: '+note+'\n\n'+what+'\n다음 달부터 같은 종류의 차이는 묻지 않습니다. 저장할까요?')) return;
  try{
    var ins=await sbWrite('POST','biz_rules?select=*',[{name:q.name, cat:cat, note:note, mode:mode, created_by:(ST.AUTH_USER||null)}],'return=representation');
    ST.RAWX.bizRules=(ST.RAWX.bizRules||[]).concat((ins||[]).map(function(r){ if(!r.mode) r.mode=mode; return r; }));
    logChange('insert','biz_rules',(ins&&ins[0]&&ins[0].id)||0,{name:q.name, cat:cat, mode:mode, note:note});
    toast('반복 규칙 저장', q.name+' — '+(mode==='ignore'? '무시':'사유 기록')+' · 다음 달부터 자동 처리');
    BZX.res=bzxCompare(BZX.rows, BZX.res.T); BZX.showRuled=true; renderBizMonthly();
  }catch(e){ var m=String(e.message||e); toast('규칙 저장 실패', /biz_rules|relation|404/.test(m)? '65_biz_rules.sql 을 먼저 실행해야 합니다' : m.slice(0,120), 'info'); }
}
export async function bzxDropRule(id){
  if(!ST.SB_TOKEN){ openOvl('ovlAuth'); return; }
  var r=(ST.RAWX.bizRules||[]).filter(function(x){ return x.id===id; })[0]; if(!r) return;
  if(!confirm('«'+r.name+'» 반복 규칙을 해제할까요? 다음 대조부터 다시 확인 표에 나옵니다.')) return;
  try{
    await sbWrite('PATCH','biz_rules?id=eq.'+id,{active:false, updated_at:new Date().toISOString()});
    ST.RAWX.bizRules=(ST.RAWX.bizRules||[]).filter(function(x){ return x.id!==id; });
    logChange('update','biz_rules',id,{active:false});
    toast('규칙 해제', r.name);
    BZX.res=bzxCompare(BZX.rows, BZX.res.T); renderBizMonthly();
  }catch(e){ toast('규칙 해제 실패', String(e.message||e).slice(0,120), 'info'); }
}
export async function bzxSaveAlias(q){
  if(!ST.SB_TOKEN){ openOvl('ovlAuth'); return; }
  var dbSide=(q.pair? q.pair.db : q.db)||[], dbName=dbSide[0] && dbSide[0].cust, bizName=q.bizName||(q.biz[0] && q.biz[0].cust);
  if(!dbName||!bizName) return;
  var al=String(bizName).replace(/\s*\((에스원|S1)\)\s*$/,'').trim();
  if(!confirm('«'+al+'» 를 포탈 고객사 «'+dbName+'» 의 별칭으로 저장할까요?\n다음 달부터 이 표기는 자동으로 같은 회사로 맞춰집니다.')) return;
  try{
    var cu=(SB_RAW.customers||[]).filter(function(c){ return c.name===dbName; })[0]; if(!cu) throw new Error('고객사 마스터에서 찾지 못했습니다');
    var next=(cu.aliases||[]).slice(); if(next.indexOf(al)<0) next.push(al);
    await sbWrite('PATCH','customers?id=eq.'+cu.id,{aliases:next});
    cu.aliases=next; logChange('update','customers',cu.id,{alias_add:al, from:'비즈포탈 대조'});
    toast('별칭 저장', al+' → '+dbName);
    BZX.res=bzxCompare(BZX.rows, BZX.res.T); renderBizMonthly();
  }catch(e){ toast('별칭 저장 실패', String(e.message||e), 'info'); }
}
export async function bzxSave(diffs){
  if(!ST.SB_TOKEN){ openOvl('ovlAuth'); return; }
  var res=BZX.res, T=res.T, ym=(+mk(T).slice(5,7))+'월', y=+mk(T).slice(0,4), k=mk(T);
  var today=todayStr(), asof=(+today.slice(0,4)===y)? today : (y+'-'+mk(T).slice(5,7)+'-'+('0'+new Date(y,+mk(T).slice(5,7),0).getDate()).slice(-2));
  if(bizLock(k)){ toast('저장하지 않았습니다', bizLabel(k)+'은 마감됐습니다 — 슈퍼 관리자가 «마감 풀기» 후', 'bad'); return; }
  var exists=bizRowsOf(k).length>0;
  if(exists && !confirm(bizLabel(k)+' 대조 결과가 이미 있습니다. 이번 자동 대조 결과로 바꿀까요?'+(BIZL.ok? '\n(바꾸기 전 내용은 «이력»에 남습니다)' : ''))) return;
  var out=[
    {ym:ym, as_of:asof, kind:'sum', item:'비즈포탈 회계매출', biz:Math.round(res.sum.biz)},
    {ym:ym, as_of:asof, kind:'sum', item:'관리포탈 매출', biz:Math.round(res.sum.db)},
    {ym:ym, as_of:asof, kind:'sum', item:'차액 총계', biz:res.sum.diff}
  ];
  // 반복 규칙으로 처리된 차이도 표에는 들어감 (사유 = 규칙 문장)
  BZX.res.groups.filter(function(q){ return q.rule && q.rule.mode!=='ignore'; }).forEach(function(q){
    out.push({ym:ym, as_of:asof, kind:'detail', item:q.name, biz:Math.round(q.bizAmt), sheet:Math.round(q.dbTot), diff:q.diff, note:'🔁 '+q.rule.note});
  });
  var nIgn=BZX.res.groups.filter(function(q){ return q.rule && q.rule.mode==='ignore'; }).length;   // 요약 3줄(res.sum)은 무시 규칙을 이미 뺀 금액
  diffs.forEach(function(q){
    if(q.cat==='alias' && q.pairConf!=='low') return;   // 표기 차이는 금액 차이가 아니므로 표에 넣지 않음 (별칭 저장으로 해결)
    if(q.cat==='alias'){ var note2=BZX.notes[bzxNoteKey(q)]||bzxPrevNote(q.name)||('금액만 같은 짝(확인 필요): '+q.pair.name);
      out.push({ym:ym, as_of:asof, kind:'detail', item:q.name, biz:Math.round(q.bizAmt), sheet:0, diff:Math.round(q.bizAmt), note:note2});
      out.push({ym:ym, as_of:asof, kind:'detail', item:q.pair.name, biz:0, sheet:Math.round(q.pair.dbTot), diff:-Math.round(q.pair.dbTot), note:note2}); return; }
    var note=BZX.notes[bzxNoteKey(q)]; if(note==null) note=bzxPrevNote(q.name);
    if(!note && q.cat==='fee') note='설치비 인식 시점 차이 (비즈포탈 '+mk(T)+' · 포탈 정산일 기준)';
    out.push({ym:ym, as_of:asof, kind:'detail', item:q.name, biz:Math.round(q.bizAmt), sheet:Math.round(q.dbTot), diff:q.diff, note:note||null});
  });
  out.forEach(function(r){ r.y=y; });
  try{
    var ins=await bizSaveMonth(k, out, '엑셀 자동 대조');
    bizReplaceLocal(k, ins);
    logChange('update','biz_recon',0,{ym:k, rows:out.length, from:'엑셀 자동 대조', file:BZX.file, ignored_by_rule:nIgn});
    toast('저장되었습니다', bizLabel(k)+' 비즈포탈 대조 결과 · 차이 '+(out.length-3)+'곳');
    ST.DIRTY=true; BIZV.ym=k; BZX.res=null; BZX.rows=null; renderBizMonthly();
  }catch(e){ toast('저장 실패', String(e.message||e), 'info'); }
}
export async function bzxOpenFile(file){
  if(!file) return;
  var msgEl=$('#dvMsg'); msgEl.textContent='엑셀 읽는 중…';
  try{
    await bzxLoadLib(); await bzxRules();
    var buf=await file.arrayBuffer();
    var rows=bzxParse(buf);
    var mi=bzxMonthIdx(rows);
    if(mi.idx==null) throw new Error('«예상시기» 열에서 대상 월을 읽지 못했습니다.');
    /* 엑셀은 이미 «그 달» 매출 목록입니다 — 고객사·회계매출·진행상태만 쓰고, 날짜 열은 대상 월 이름을 정하는 데만 씁니다.
       (예전엔 «예상시기» 가 다른 달로 읽힌 행을 버렸는데, 날짜 해석 오류로 8/1 자 하위매출 84행이 통째로 빠지는 사고가 났습니다) */
    if(mi.months.length>1) toast('예상시기에 여러 달이 섞여 있음', mi.months.join(', ')+' — 행은 모두 대조에 넣고 대상 월은 '+mi.ym+' 로 표시합니다', 'info');
    BZX.rows=rows;
    BZX.file=file.name; BZX.month=mi.ym; BZX.monthCnt=mi.cnt; BZX.notes={}; BZX.showEq=false; BZX.showSkip=false;
    BZX.res=bzxCompare(BZX.rows, mi.idx);
    msgEl.textContent='';
    renderBizMonthly();
  }catch(e){ msgEl.textContent=String(e.message||e); toast('엑셀 대조 실패', String(e.message||e).slice(0,120), 'info'); }
}

/* ===== 사업 영역 계약 목록 — 고객사별 최신 1건 + 이력 보기 + 열 필터 ===== */
/* ---- 사업 영역 계약 목록 (㊿+168 기준월 중심) ----
   · 현재 유효(기본): 기준월에 유효한 계약(시작월 ≤ 기준월 ≤ 종료월)이나 그 달 매출이 있는 고객사 1줄 — 고객 합계(당월 매출) · 현행 계약 기간 · 갱신 상태
   · 시작 예정: 기준월 다음부터 시작하는 계약(재약정 등록분 등) 1건 1줄
   · 전체 이력: 모든 계약 1건 1줄 + 기준월 상태(유효 · 시작 예정 · 종료 · 추가 계약)
   · 금액: 고객 합계 = 그 고객의 이 영역 계약들의 기준월 인식 금액 합(= 위 «당월 MRR» 합계와 맞음) · 개별 계약 금액은 고객사를 눌러 이력 창에서 */
export var CHV={key:null, all:[], kOf:null, b:null, mode:'cur', q:'', filters:{}, sortK:'sum', sortDir:-1};
export function chvAmt(r){ var k=CHV.kOf? (CHV.kOf.has(r)? CHV.kOf.get(r) : CHV.kOf.get(Object.getPrototypeOf(r))) : ST.DATA.rows.indexOf(r); var b=CHV.b!=null? CHV.b : STATE.base; return (k!=null && k>=0 && ST.MAT[k])? (ST.MAT[k][b]||0) : 0; }
export function chvValidAt(r, b){ return r.startIdx!=null && r.startIdx<=b && (r.endIdx==null || r.endIdx>=b); }
export function chvPhase(r, b){
  var p= r.startIdx!=null && r.startIdx>b? '시작 예정' : (r.endIdx!=null && r.endIdx<b? '종료' : '유효');
  return r.parent? '추가 계약 · '+p : p;
}
/* 갱신 상태(현재 유효 보기) — 후속 계약 · 자동연장 · 남은 개월 */
export function chvRenewText(main, b){
  if(!main) return '';
  if(main.autoRenew) return '자동연장';
  if(main.endIdx==null) return '종료월 없음';
  var s=null; try{ s=ctSuccessor(main); }catch(e){}
  if(s && s.sure) return '재약정 등록됨 · '+mk(s.row.startIdx)+' 시작';
  var left=main.endIdx-b;
  if(s) return '후속 계약 확인 필요 · '+mk(main.endIdx)+' 만료';
  if(left<=0) return '이달 만료 · 처리 필요';
  if(left<=3) return '만료 임박 · '+left+'개월 남음';
  return '유효 · '+mk(main.endIdx)+' 만료';
}
export function chvCurRows(all, b){
  var by={}, order=[];
  all.forEach(function(r){ var k=r.cust||'?'; if(!by[k]){ by[k]=[]; order.push(k); } by[k].push(r); });
  var out=[];
  order.forEach(function(c){
    var cs=by[c], valid=cs.filter(function(r){ return chvValidAt(r,b); }), sum=cs.reduce(function(a,r){ return a+chvAmt(r); },0);
    if(!valid.length && !sum) return;
    var mains=valid.filter(function(r){ return !r.parent; }).sort(function(x,y){ return (y.startIdx-x.startIdx) || ((y.mrr||0)-(x.mrr||0)); });
    var main=mains[0] || valid[0] || cs.slice().sort(function(x,y){ return chvAmt(y)-chvAmt(x); })[0];
    var o=Object.create(main);
    o._hist=cs.slice().sort(function(x,y){ return (y.startIdx-x.startIdx) || (y.endIdx-x.endIdx) || ((y.mrr||0)-(x.mrr||0)); });
    o._sum=sum; o._valid=valid; o._addN=valid.filter(function(r){ return r.parent; }).length; o._mainN=mains.length;
    o._lines=valid.map(function(r){ return lline(r.line); }).filter(function(v,i,a){ return v && a.indexOf(v)===i; }).join(' · ') || lline(main.line);
    o._renew=chvRenewText(mains[0]||null, b);
    o._next=cs.filter(function(r){ return r.startIdx!=null && r.startIdx>b; }).length;
    out.push(o);
  });
  return out;
}
export function chvNextRows(all, b){
  return all.filter(function(r){ return r.startIdx!=null && r.startIdx>b; }).map(function(r){
    var o=Object.create(r);
    var cur=all.filter(function(x){ return x!==r && !x.parent && x.cust===r.cust && chvValidAt(x,b); }).sort(function(x,y){ return (y.endIdx||0)-(x.endIdx||0); })[0];
    o._prev= cur? mk(cur.endIdx)+' 종료 예정 ('+lline(cur.line)+')' : '현재 유효 계약 없음';
    o._hist=all.filter(function(x){ return x.cust===r.cust; });
    return o;
  }).sort(function(x,y){ return x.startIdx-y.startIdx; });
}
export function chvAllRows(all, b){
  return all.map(function(r){ var o=Object.create(r); o._phase=chvPhase(r,b); o._hist=all.filter(function(x){ return x.cust===r.cust; }); return o; })
    .sort(function(x,y){ return String(x.cust).localeCompare(String(y.cust),'ko') || (y.startIdx-x.startIdx); });
}
var CHV_C_CUST={k:'cust', l:'고객사', link:true, text:function(r){ return r.cust||''; }};
var CHV_C_CSM={k:'csm', l:'CSM(사이트명)', text:function(r){ return r.csm||''; }};
var CHV_C_PTN={k:'ptn', l:'파트너', text:function(r){ return r.ptn||''; }};
export var CHV_COLS_BY={
  cur:[CHV_C_CUST,
    {k:'svc', l:'서비스', text:function(r){ return r._lines||''; }},
    CHV_C_CSM, CHV_C_PTN,
    {k:'period', l:'현행 계약 기간', text:function(r){ return (mk(r.startIdx)||'?')+' ~ '+(r.endIdx!=null? mk(r.endIdx):'—')+(r._addN? ' · 추가 계약 '+r._addN+'건' : '')+(r._mainN>1? ' · 원계약 '+r._mainN+'건' : ''); }},
    {k:'renew', l:'갱신 상태', text:function(r){ return r._renew||''; }},
    {k:'sum', l:'고객 합계 · 당월 매출(천원)', num:function(r){ return r._sum||0; }, right:true, text:function(r){ return won(r._sum||0); }}],
  next:[CHV_C_CUST,
    {k:'line', l:'서비스', text:function(r){ return lline(r.line)||''; }},
    {k:'ctype', l:'구분', text:function(r){ return r.parent? '추가 계약' : (r.ctype||''); }},
    {k:'start', l:'시작 예정월', text:function(r){ return mk(r.startIdx)||''; }},
    {k:'end', l:'종료월', text:function(r){ return r.endIdx!=null? mk(r.endIdx):''; }},
    {k:'prev', l:'현재 계약', text:function(r){ return r._prev||''; }},
    {k:'mrr', l:'계약 월 금액(천원)', num:function(r){ return r.mrr||0; }, right:true, text:function(r){ return won(r.mrr||0); }}],
  all:[CHV_C_CUST,
    {k:'phase', l:'기준월 상태', text:function(r){ return r._phase||''; }},
    {k:'line', l:'서비스', text:function(r){ return lline(r.line)||''; }},
    CHV_C_CSM, CHV_C_PTN,
    {k:'partner', l:'계산서발행처', text:function(r){ return r.partner||''; }},
    {k:'ctype', l:'구분', text:function(r){ return r.ctype||''; }},
    {k:'status', l:'상태', text:function(r){ return r.status||''; }},
    {k:'start', l:'시작월', text:function(r){ return mk(r.startIdx)||''; }},
    {k:'end', l:'종료월', text:function(r){ return r.endIdx!=null? mk(r.endIdx):''; }},
    {k:'cur', l:'당월 인식(천원)', num:function(r){ return chvAmt(r); }, right:true, text:function(r){ return won(chvAmt(r)); }},
    {k:'mrr', l:'계약 월 금액(천원)', num:function(r){ return r.mrr||0; }, right:true, text:function(r){ return won(r.mrr||0); }}]
};
export function chvCols(){ return CHV_COLS_BY[CHV.mode]||CHV_COLS_BY.cur; }
export var CHV_COLS=CHV_COLS_BY.cur;   /* 예전 이름(다른 곳에서 읽을 수 있게) — 지금 보기는 chvCols() */
export function chvText(c,r){ var t=String(c.text(r)||'').trim(); return t===''? BLANK_LABEL : t; }
export function chvSource(){
  var b=CHV.b!=null? CHV.b : STATE.base;
  return CHV.mode==='next'? chvNextRows(CHV.all,b) : (CHV.mode==='all'? chvAllRows(CHV.all,b) : chvCurRows(CHV.all,b));
}
/* 예전 «고객사별 최신 1건» (호환용 — 지금 화면은 chvSource) */
export function chvLatest(rows){
  var by={}, order=[];
  rows.forEach(function(r){ var k=r.cust||'?'; if(!by[k]){ by[k]=[]; order.push(k); } by[k].push(r); });
  return order.map(function(k){
    var arr=by[k].slice().sort(function(a,b){ return (b.startIdx-a.startIdx) || (b.endIdx-a.endIdx) || ((b.mrr||0)-(a.mrr||0)); });
    var top=Object.create(arr[0]); top._hist=arr; return top;
  });
}
export function chvPass(r,skipK){
  var cols=chvCols();
  for(var k in CHV.filters){
    if(k===skipK) continue;
    var sel=CHV.filters[k]; if(!sel||!sel.length) continue;
    var col=null;
    for(var i=0;i<cols.length;i++){ if(cols[i].k===k){ col=cols[i]; break; } }
    if(!col) continue;
    if(sel.indexOf(chvText(col,r))<0) return false;
  }
  return true;
}
export function chvBase(skipK){
  var q=(($('#chvQ')&&$('#chvQ').value)||'').trim().toLowerCase();
  var toks=q? q.split(/\s+/).filter(Boolean):[];
  var cols=chvCols();
  return chvSource().filter(function(r){
    if(!chvPass(r,skipK)) return false;
    if(!toks.length) return true;
    var hay='';
    cols.forEach(function(c){ hay+=String(c.text(r)||'').replace(/\s+/g,''); });
    (r._hist||[]).forEach(function(h){ hay+=String(h.note||'').replace(/\s+/g,''); });
    hay=hay.toLowerCase();
    return toks.every(function(t){ return hay.indexOf(t.replace(/\s+/g,''))>=0; });
  });
}
export function chvModeBar(){
  var bar=$('#chvMode'); if(!bar) return;
  var b=CHV.b!=null? CHV.b : STATE.base, n={cur:chvCurRows(CHV.all,b).length, next:chvNextRows(CHV.all,b).length, all:CHV.all.length};
  var M=[['cur','현재 유효',n.cur,'곳'],['next','시작 예정',n.next,'건'],['all','전체 이력',n.all,'건']];
  bar.innerHTML=M.map(function(m){ return tpl`<button type="button" data-m="${rawHtml(m[0])}" aria-pressed="${CHV.mode===m[0]?'true':'false'}">${m[1]} <b>${rawHtml(m[2])}</b>${rawHtml(m[3])}</button>`; }).join('');
  bar.querySelectorAll('button').forEach(function(bt){ bt.onclick=function(){ if(CHV.mode===bt.dataset.m) return; CHV.mode=bt.dataset.m; CHV.filters={}; CHV.sortK= CHV.mode==='cur'? 'sum' : (CHV.mode==='next'? 'start':'cust'); CHV.sortDir= CHV.mode==='cur'? -1 : 1; try{ localStorage.setItem('svc_chv_mode', CHV.mode); }catch(e){} renderChvTable(); }; });
}
export function renderChvTable(){
  var cols=chvCols(), rows=chvBase(null), b=CHV.b!=null? CHV.b : STATE.base;
  if(CHV.sortK){
    var col=null;
    for(var i=0;i<cols.length;i++){ if(cols[i].k===CHV.sortK){ col=cols[i]; break; } }
    if(col) rows=rows.slice().sort(function(a,c2){
      if(col.num) return (col.num(a)-col.num(c2))*CHV.sortDir;
      if(col.k==='start') return ((a.startIdx||0)-(c2.startIdx||0))*CHV.sortDir;
      return String(col.text(a)).localeCompare(String(col.text(c2)),'ko')*CHV.sortDir;
    });
  }
  chvModeBar();
  var src=chvSource(), cap='';
  if(CHV.mode==='cur'){ var tot=src.reduce(function(a,r){ return a+(r._sum||0); },0);
    cap=mk(b)+' 유효 고객사 '+src.length+'곳 · 고객 합계(당월 매출) 합 '+won(tot)+'천원 = 위 «당월 MRR» · 고객 합계 = 그 고객의 이 영역 계약들의 '+mk(b)+' 인식 금액 합 · 개별 계약 금액·이력은 고객사를 눌러서'; }
  else if(CHV.mode==='next') cap=mk(b)+' 다음 달부터 시작하는 계약 '+src.length+'건 (재약정 등록분·신규 예정) · 금액은 계약 월 금액 — 아직 당월 매출에는 없음';
  else { var cnt={}; src.forEach(function(r){ var p=String(r._phase||'').replace(/^추가 계약 · /,''); cnt[p]=(cnt[p]||0)+1; }); var addN=src.filter(function(r){ return r.parent; }).length;
    cap='전체 이력 '+src.length+'건 · '+mk(b)+' 기준 유효 '+(cnt['유효']||0)+' · 시작 예정 '+(cnt['시작 예정']||0)+' · 종료 '+(cnt['종료']||0)+(addN? ' · 그중 추가 계약 '+addN:'')+' · 당월 인식 = 그 계약의 '+mk(b)+' 금액 · 계약 월 금액 = 계약서 MRR'; }
  $('#chvCtCap').textContent=cap;
  $('#chvCnt').textContent=rows.length.toLocaleString('ko-KR')+(CHV.mode==='cur'?'곳':'건')+(rows.length!==src.length? ' / '+src.length+(CHV.mode==='cur'?'곳':'건'):'');
  var nf=0; for(var k in CHV.filters){ if(CHV.filters[k]&&CHV.filters[k].length) nf++; }
  var fb=$('#chvFclr'); fb.style.display=nf? '':'none'; fb.textContent='✕ 필터 해제 ('+nf+')';

  var t=$('#chvCt');
  t.innerHTML=tpl`<thead><tr>${rawHtml(cols.map(function(c){
      return tpl`<th${rawHtml(c.right?' class="n"':'')}></th>`; }).join(''))}`+ tpl`</tr></thead>`+
    tpl`<tbody>${rawHtml(rows.length? rows.slice(0,300).map(function(r,i){
      return tpl`<tr data-i="${rawHtml(i)}">${rawHtml(cols.map(function(c){
        var txt=chvText(c,r); if(txt===BLANK_LABEL) txt='—';
        if(c.link){
          var n=(r._hist? r._hist.length:1);
          return tpl`<td><a href="#" class="chv-cust" data-i="${rawHtml(i)}" style="color:var(--s1-ink);font-weight:700;text-decoration:none" title="이 고객사의 계약별 금액 · 전체 이력">`+
                 tpl`${txt}</a>${rawHtml(n>1? tpl` <span class="mini">(${rawHtml(n)})</span>`:'')}</td>`;
        }
        if(c.k==='renew' || c.k==='phase'){ var cls=/재약정 등록됨|유효$|^유효/.test(txt)? 'ok' : (/확인 필요|처리 필요|임박/.test(txt)? 'warn' : (/종료/.test(txt)? '' : (/시작 예정/.test(txt)? 'info':'')));
          return tpl`<td><span class="ctag ${rawHtml(cls)}">${txt}</span></td>`; }
        return tpl`<td${rawHtml(c.right?' class="n"':'')}>${txt}</td>`;
      }).join(''))}`+ tpl`</tr>`;
    }).join('') : tpl`<tr><td colspan="${rawHtml(cols.length)}" class="mini" style="padding:16px">${CHV.mode==='next'? '기준월 이후 시작하는 계약이 없습니다.' : '해당하는 계약이 없습니다.'}</td></tr>`)}`+ tpl`</tbody>`;

  // 헤더 (정렬 + 값 골라 보기)
  var ths=t.querySelectorAll('thead th');
  cols.forEach(function(c,ci){
    var th=ths[ci];
    var on=!!(CHV.filters[c.k] && CHV.filters[c.k].length);
    var wrap=document.createElement('div'); wrap.className='thw';
    var lab=document.createElement('span');
    lab.textContent=c.l+(CHV.sortK===c.k? (CHV.sortDir>0?' ▲':' ▼'):'');
    lab.style.cursor='pointer'; lab.title='클릭: 정렬';
    lab.onclick=function(){
      if(CHV.sortK===c.k) CHV.sortDir*=-1; else { CHV.sortK=c.k; CHV.sortDir=1; }
      renderChvTable();
    };
    var fb2=document.createElement('button');
    fb2.type='button'; fb2.className='fbtn'+(on?' on':''); fb2.textContent='▼';
    fb2.title=on? c.l+' 필터 적용 중 — 클릭해서 바꾸기' : c.l+' 값 골라 보기'; fb2.setAttribute('aria-label', fb2.title);
    fb2.onclick=function(ev){
      ev.stopPropagation();
      var base=chvBase(c.k), cnt={}, order=[];
      base.forEach(function(r){
        var v=chvText(c,r);
        if(cnt[v]===undefined){ cnt[v]=0; order.push(v); }
        cnt[v]++;
      });
      openFilterPanel(fb2,{ label:c.l, order:order, cnt:cnt, num:!!c.num,
        selected:CHV.filters[c.k]||null,
        onApply:function(sel){
          if(sel) CHV.filters[c.k]=sel; else delete CHV.filters[c.k];
          renderChvTable();
        }});
    };
    wrap.appendChild(lab); wrap.appendChild(fb2);
    th.appendChild(wrap);
  });

  t.querySelectorAll('a.chv-cust').forEach(function(a){
    a.onclick=function(ev){ ev.preventDefault(); openChvHist(rows[+a.dataset.i]); };
  });
}

/* 고객사 계약 이력 (중복 포함) */
export function openChvHist(r){
  if(!r) return;
  var hist=(r._hist||[r]).slice();
  $('#chvHTitle').textContent=r.cust||'?';
  var b0=CHV.b!=null? CHV.b : STATE.base, live=hist.filter(function(h){ return chvValidAt(h,b0); });
  var cur=hist.reduce(function(a,h){ return a+chvAmt(h); },0);
  /* ㊿+168 고객 합계(기준월 인식 금액 합)와 계약별 금액을 나눠 보여 줌 · 기준월 상태(유효 · 시작 예정 · 종료 · 추가 계약) */
  $('#chvHCap').textContent=(CH_DEFS[CHV.key]? CH_DEFS[CHV.key][0].replace(/^\S+ /,'')+' · ':'')+hist.length+'건 · 최근 계약이 위쪽 · '+mk(b0)+' 유효 '+live.length+'건'+
    ' · 고객 합계(당월 매출) '+won(cur)+'천원 = 아래 «당월 인식» 합';
  $('#chvHBody').innerHTML=tpl`<div class="tbl-wrap" tabindex="0" style="max-height:min(58vh,460px)"><table class="dgrid">`+
    tpl`<thead><tr><th>기준월 상태</th><th>서비스</th><th>파트너</th><th>계산서발행처</th><th>구분</th><th>상태</th>`+
    tpl`<th>시작월</th><th>종료월</th><th class="n">당월 인식(천원)</th><th class="n">계약 월 금액(천원)</th><th>비고</th></tr></thead><tbody>`+
    tpl`${rawHtml(hist.map(function(h){
      var ph=chvPhase(h,b0);
      return tpl`<tr${rawHtml(chvValidAt(h,b0)?' style="background:var(--brand-t,rgba(20,158,64,.07))"':'')}>`+
        tpl`<td><span class="ctag ${rawHtml(/유효/.test(ph)?'ok':(/시작 예정/.test(ph)?'info':''))}">${ph}</span></td>`+
        tpl`<td>${lline(h.line)||'—'}</td><td>${h.ptn||'—'}</td><td>${h.partner||'—'}</td>`+
        tpl`<td>${h.ctype||'—'}</td><td>${h.status||'—'}</td>`+
        tpl`<td>${mk(h.startIdx)||'—'}</td><td>${h.endIdx!=null? mk(h.endIdx):'—'}</td>`+
        tpl`<td class="n">${won(chvAmt(h))}</td><td class="n">${won(h.mrr||0)}</td>`+
        tpl`<td>${[h.note,h.churn].filter(Boolean).join(' · ')||'—'}</td></tr>`;
    }).join(''))}`+ tpl`</tbody></table></div>`;
  openOvl('ovlChvHist');
}

/* ---- 사업 영역(판매 채널) 화면 ---- */
export function chOf(r){ return r.channel||'일반'; }   // «공공»은 산업군 오인 표기 — 조달로 집계하지 않음 (48단계 SQL로 정리)
/* [라벨, 장비 채널(''=장비 타일 없음), 설명, 매처(r)] — 제품 × 채널로 세분화 */
export var CH_DEFS={
  cngen:['🤝 Cloud NAC · 일반 판매','',        '파트너 경유 + 직판 (Cloud NAC · 조달·LG U+ 제외)',
         function(r){ return r.line==='Cloud' && chOf(r)!=='조달' && chOf(r)!=='LGU+'; }],   /* 조달·LG U+ 는 각각 따로 — 셋을 더하면 Cloud NAC 전체 */
  cnpub:['🏛️ Cloud NAC · 조달 판매','조달',    '조달(공공) 사업 (Cloud NAC)',
         function(r){ return r.line==='Cloud' && chOf(r)==='조달'; }],
  cns1: ['🔒 Cloud NAC · 에스원','에스원',      '에스원 채널 — S1 Cloud NAC',
         function(r){ return r.line==='S1'; }],
  cnlgu:['📶 Cloud NAC · LG U+','LGU+',        'LG U+ 경유 판매 (Cloud NAC)',
         function(r){ return r.line==='Cloud' && chOf(r)==='LGU+'; }],
  chdist:['📀 DLP/DRM','',                      '블루문소프트 DLP·DRM 유통 사업',
         function(r){ return r.line==='DRM'||r.line==='DLP'; }],
  cnpns:['🧷 PNS','',                           'SSL PNS 사업',
         function(r){ return r.line==='PNS'; }],
  mdrgen:['🤝 MDR · 일반 판매','',              'MDR (에스원·LG U+ 외 전 채널)',
         function(r){ return r.line==='MDR' && chOf(r)!=='LGU+'; }],
  mdrs1:['🔒 MDR · 에스원','에스원',            '에스원 채널 — S1 MDR',
         function(r){ return r.line==='MDR_S1'; }],
  mdrlgu:['📶 MDR · LG U+','LGU+',              'LG U+ 경유 판매 (MDR)',
         function(r){ return r.line==='MDR' && chOf(r)==='LGU+'; }]
};

/* 계약이 하나도 없는 사업 영역 메뉴는 숨기고, 계약이 생기면 자동으로 나타납니다 */
export function applyChannelMenu(){
  if(ST.IS_EQUIP || !ST.DATA || !ST.DATA.rows) return;
  Object.keys(CH_DEFS).forEach(function(k){
    var btn=document.querySelector('.side button[data-v="'+k+'"]');
    if(!btn) return;
    var has=false;
    for(var i=0;i<ST.DATA.rows.length;i++){ if(CH_DEFS[k][3](ST.DATA.rows[i])){ has=true; break; } }
    btn.style.display=has? '':'none';
  });
  // 그룹 안 버튼이 전부 숨었으면 그룹 제목도 숨김
  document.querySelectorAll('.side .grp[data-chgrp]').forEach(function(g){
    var el=g.nextElementSibling, vis=false;
    while(el && !el.classList.contains('grp')){
      if(el.tagName==='BUTTON' && el.style.display!=='none') vis=true;
      el=el.nextElementSibling;
    }
    g.style.display=vis? '':'none';
  });
  try{ subgrpSync(); }catch(e){}
}
/* LIVE 고객사 탭의 각 행(사이트)을 사업 영역 하나에 배정합니다 — 대시보드 «LIVE 고객사» 수와 영역별 합이 맞도록.
   제품은 LIVE 행의 서비스, 채널은 같은 고객·서비스의 가장 최근 계약 채널(없으면 일반).
   Cloud 는 조달/LGU+ 외 전부 일반, MDR 은 LGU+ 외 전부 일반으로 묶습니다. */
export function liveAreaKey(x){
  var line=x.line||'';
  if(line==='S1') return 'cns1';
  if(line==='MDR_S1') return 'mdrs1';
  if(line==='PNS') return 'cnpns';
  if(line==='DRM'||line==='DLP') return 'chdist';
  var ch=liveChannel(x);
  if(line==='Cloud') return ch==='조달'? 'cnpub' : ch==='LGU+'? 'cnlgu' : 'cngen';   /* 일반 + 조달 + LG U+ = Cloud NAC 전체 */
  if(line==='MDR')   return ch==='LGU+'? 'mdrlgu' : 'mdrgen';
  return null;
}
/* 같은 서비스(LIVE 탭 «서비스» 열)의 영역 합계 — LIVE 탭에서 서비스로 걸렀을 때 나오는 수와 같아야 합니다 */
export var LIVE_GROUPS={ 'Cloud NAC':['cngen','cnpub','cnlgu'], 'MDR':['mdrgen','mdrlgu'] };
export function liveGroupNote(key){
  var g=Object.keys(LIVE_GROUPS).filter(function(n){ return LIVE_GROUPS[n].indexOf(key)>=0; })[0];
  if(!g) return 'LIVE 고객사 탭 기준';
  var parts=LIVE_GROUPS[g].map(function(k){ return (CH_DEFS[k][0].replace(/^\S+ /,'').split(' · ')[1]||k)+' '+liveN(liveForArea(k)); });
  var tot=LIVE_GROUPS[g].reduce(function(a,k){ return a+liveN(liveForArea(k)); },0);
  return 'LIVE 명단 '+g+' 전체 '+tot+'곳 = '+parts.join(' + ');
}
/* ─────────────────────────────────────────────────────────────────────────────
   LIVE 고객사 = 계약을 등록하면 자동으로 따라오는 결과 (64단계 · DB 함수 live_view() 와 같은 규칙)
   · 원계약만 · 상태 통합과금/추가 아님 · 구분 추가 아님 · no_count 아님 · H/W 아님
   · 시작월 ≤ 기준월 · (종료월 없음 | 종료월 > 기준월 | 종료월 = 기준월이면서 해지 아님) — 해지는 해지월부터 빠짐
   · CN전환(에스원 통합 과금)은 종료월이 없으므로 항상 LIVE · live_override 포함/제외가 규칙보다 우선
   회사 × 제품 = 1행. 최초 개시월 = 그 회사·제품의 가장 이른 원계약 시작월, 현행 = 가장 늦게 시작한 유효 계약.
   ──────────────────────────────────────────────────────────────────────────── */
   // 'db' = 계약으로 판정 · 'sheet' = 시트 명단(live_customers)
export var LV={T:null, diff:false};   // LIVE 메뉴 상태: 기준월(null = 대시보드 기준월) · 대조 표 펼침
export function setLiveSrc(v){ ST.LIVE_SRC=(v==='sheet'?'sheet':'db'); try{ localStorage.setItem('svc_live_src',ST.LIVE_SRC); }catch(e){} }
export function liveRoot(r){
  if(!r || r.parent) return false;
  var st=String(r.status||'');
  if(st==='통합과금' || st==='추가' || String(r.ctype||'')==='추가') return false;
  if(r.noCount || String(r.saleType||'')==='H/W') return false;
  return true;
}
export function liveActiveAt(r,T){
  if(!liveRoot(r)) return false;
  if(r.liveOv==='제외') return false;
  if(r.liveOv==='포함') return true;
  if(r.startRaw==null || r.startRaw>T) return false;
  var e=r.endRaw;
  if(e==null) return true;
  if(e>T) return true;
  return e===T && String(r.status||'')!=='해지';
}
export function liveBasis(r,T){
  var st=String(r.status||'');
  if(r.liveOv==='포함') return '예외 포함'+(r.liveOvNote? ' — '+r.liveOvNote:'');
  if(st==='CN전환') return 'CN전환(에스원 통합 과금) · 종료 없음';
  if(r.endRaw==null) return st+' · 종료월 없음(진행 중)';
  if(r.endRaw===T) return st+' · 이달 만기(재약정 대기)';
  return st+' · '+mk(r.startRaw)+'~'+mk(r.endRaw);
}
export var _liveCache={d:null, m:{}};
export function liveCalc(T){
  if(T==null) T=(STATE&&STATE.base!=null)? STATE.base : ST.DATA.nowIdx;
  var ck=String(T);
  if(_liveCache.d!==ST.DATA) _liveCache={d:ST.DATA, m:{}};                  // DATA 객체가 바뀌면(새로 불러오면) 다시 계산 · 기준월별로 기억(전월 대비 계산 때 같이 씀)
  if(_liveCache.m[ck]) return _liveCache.m[ck];
  var rows=ST.DATA.rows||[], byKey={}, firstStart={};
  rows.forEach(function(r){ if(!liveRoot(r) || r.startRaw==null) return; var k=r.cust+'|'+r.line; if(firstStart[k]==null || r.startRaw<firstStart[k]) firstStart[k]=r.startRaw; });
  var kidsQ={}; rows.forEach(function(r){ if(!r.parent) return; if(r.startRaw!=null && r.startRaw>T) return; if(r.endRaw!=null && r.endRaw<T) return; kidsQ[r.parent]=(kidsQ[r.parent]||0)+(r.qty||0); });
  rows.forEach(function(r){
    if(!liveActiveAt(r,T)) return;
    var k=r.cust+'|'+r.line, g=byKey[k];
    if(!g){ g=byKey[k]={cust:r.cust, cid:r.cid, ind:r.ind||'미분류', line:r.line, prod:lline(r.line), key:'', nodes:0, ids:[], n:0, cur:null, dup:false}; }
    g.n++; g.ids.push(r._id); g.nodes+=(r.qty||0)+(kidsQ[r._id]||0);
    if(!g.cur || (r.startRaw||-1)>(g.cur.startRaw||-1) || ((r.startRaw||-1)===(g.cur.startRaw||-1) && r._id>g.cur._id)) g.cur=r;
  });
  var out=Object.keys(byKey).map(function(k){
    var g=byKey[k], c=g.cur;
    g.start=(firstStart[k]!=null)? mk(firstStart[k]) : (c.startRaw!=null? mk(c.startRaw):'');
    g.curStart=c.startRaw!=null? mk(c.startRaw):''; g.end=c.endRaw!=null? mk(c.endRaw):''; g.churnMon='';
    g.csm=c.csm||''; g.key=c.csm||''; g.partner=c.ptn||''; g.channel=c.channel||'일반'; g.saleType=c.saleType||''; g.status=c.status||'';
    g.ov=c.liveOv||''; g.ovNote=c.liveOvNote||''; g.basis=liveBasis(c,T)+(g.n>1? ' · 유효 계약 '+g.n+'건':''); g.ctId=c._id;
    return g;
  });
  out.sort(function(a,b){ return String(a.line).localeCompare(String(b.line)) || String(a.cust).localeCompare(String(b.cust),'ko'); });
  var uq={}; out.forEach(function(x){ uq[x.cust]=1; });
  var v={ok:true, src:'db', T:T, rows:out, count:out.length, uniq:Object.keys(uq).length, uniqNoDup:Object.keys(uq).length};
  _liveCache.m[ck]=v; return v;
}
/* 화면들이 쓰는 LIVE 데이터 — 설정(LIVE_SRC)에 따라 계약 판정 또는 시트 명단. 모양은 shapeLive() 결과와 같음 */
export function liveData(T){
  if(ST.LIVE_SRC==='sheet'){ return (ST.DATA&&ST.DATA.live&&ST.DATA.live.ok)? ST.DATA.live : null; }
  if(!ST.DATA || !ST.DATA.rows) return null;
  return liveCalc(T);
}
export function liveSrcLabel(){ return ST.LIVE_SRC==='sheet'? 'LIVE 명단 시트 기준' : '계약 기준(자동 판정)'; }
/* 회사 이름 매칭 키 — 띄어쓰기·(주)·괄호 별칭·사명 변경 별칭을 무시하고 같은 회사로 봄 */
export function nmKeys(n){
  var CU=SB_RAW.customers||[];
  /* ㊿+173 성능: 별칭 표는 같은 계산 묶음 안에서 한 번만(이름마다 고객 전체로 다시 만들던 것) */
  var ALIAS=tickMemo('nmAlias', [CU, CU.length], function(){ var A={}; CU.forEach(function(c){ if(c.aliases&&c.aliases.length) A[c.name]=c.aliases; }); return A; });
  function k1(t){ var out=[], base=t.replace(/\([^)]*\)/g,''), m2; out.push(base); var re=/\(([^)]*)\)/g; while((m2=re.exec(t))) out.push(m2[1].replace(/^구\.?\s*/,'')); return out; }
  var t=String(n||''), out=k1(t); (ALIAS[t]||[]).forEach(function(a){ out=out.concat(k1(String(a))); });
  return out.map(function(x){ return x.replace(/^\(?주\)?|주식회사|\(주\)|\s|_/g,'').toLowerCase(); }).filter(function(x){ return x.length>=2; });
}
/* 계약 판정 LIVE 와 시트 명단의 차이 — LIVE 메뉴 대조 표 */
export function liveDiff(T){
  var db=liveCalc(T), sh=(ST.DATA.live&&ST.DATA.live.ok)? ST.DATA.live.rows : [];
  var shK={}; sh.forEach(function(x){ nmKeys(x.cust).forEach(function(k){ shK[k+'|'+x.line]=x; }); });
  var dbK={}; db.rows.forEach(function(x){ nmKeys(x.cust).forEach(function(k){ dbK[k+'|'+x.line]=x; }); });
  var onlyDb=db.rows.filter(function(x){ return !nmKeys(x.cust).some(function(k){ return shK[k+'|'+x.line]; }); });
  var seen={}, onlySheet=[];
  sh.forEach(function(x){ var id=x.cust+'|'+x.line; if(seen[id]) return; seen[id]=1;
    if(nmKeys(x.cust).some(function(k){ return dbK[k+'|'+x.line]; })) return;
    var ks=nmKeys(x.cust), cs=(ST.DATA.rows||[]).filter(function(r){ return !r.parent && r.line===x.line && nmKeys(r.cust).some(function(k){ return ks.indexOf(k)>=0; }); });
    var why;
    if(!cs.length) why='계약 없음 — 계약 미등록 또는 사명 불일치';
    else if(cs.every(function(r){ return r.startRaw==null; })) why='계약 예정 — 시작월이 비어 있음';
    else if(cs.some(function(r){ return r.noCount; })) why='고객 수 제외 행(no_count)';
    else if(cs.some(function(r){ return r.liveOv==='제외'; })) why='예외 제외 — '+(cs.filter(function(r){return r.liveOv==='제외';})[0].liveOvNote||'');
    else { var last=cs.slice().sort(function(a,b){ return (b.endRaw==null?9999:b.endRaw)-(a.endRaw==null?9999:a.endRaw); })[0];
      why=(/해지|종료/.test(String(last.status||''))? last.status+' ' : '만기 지남 ')+(last.startRaw!=null?mk(last.startRaw):'?')+'~'+(last.endRaw!=null?mk(last.endRaw):''); }
    onlySheet.push({cust:x.cust, line:x.line, why:why, cs:cs});
  });
  return {onlyDb:onlyDb, onlySheet:onlySheet, db:db, sheetN:(function(){ var u={}; sh.forEach(function(x){ u[x.cust]=1; }); return Object.keys(u).length; })(), sheetRows:sh.length};
}
export function liveForArea(key){
  var lv=liveData();
  if(!lv || !lv.ok) return null;
  return lv.rows.filter(function(x){ return liveAreaKey(x)===key; });
}
/* LIVE 명단의 «곳» = 회사 이름 기준 (한 회사가 사이트를 여러 줄로 갖고 있으면 1곳) */
export function liveN(rows){ var u={}; (rows||[]).forEach(function(x){ u[x.cust]=1; }); return Object.keys(u).length; }

/* ────────────────────────────────────────────────────────────────────────────
   만기 관리 (㊿+127 · SQL 84 · Edge Function remind)
   배경: 만기 처리가 사람 기억에 의존해 기준월이 바뀌는 날 LIVE 가 한꺼번에 빠져 보임(9월 360 → 10월 354).
   · 처리 대상 = LIVE 규칙과 같은 원계약(liveRoot) 중 종료월이 있고 자동연장(auto_renew)이 아니며 해지·종료·통합과금·CN전환이 아닌 것
       lapsed   = 종료월 < 기준월  → 이미 LIVE 에서 빠짐(최근 24개월) · 연장이면 되살리고 끝났으면 서비스종료/해지로 정리
       due      = 종료월 = 기준월  → 다음 달 1일 LIVE 에서 빠짐
       next     = 종료월 = 기준월+1 (미리 보기)
       checking = lapsed 중 최근 2개월 — LIVE 숫자에는 넣지 않고 타일에 «확인중 N건» 으로만 표시
   · 홈 인박스 항목(미처리 · 이달 만기) → 만기 처리 창(#ovlRenew)에서 행마다 연장 / 서비스종료 / 해지 / 자동연장 원클릭
     (입력·수정 › 갱신·해지 탭과 같은 저장 로직 doRenew/doChurn 을 공유)
   · 슈퍼 관리자 «📣 슬랙으로 보내기» = Edge Function remind (매월 25일 자동 발송과 같은 내용 · 미리보기 후 확인)
   ──────────────────────────────────────────────────────────────────────────── */
/* ㊿+168 후속 계약 찾기 (자동 확정 안 함) — 이 계약이 끝날 무렵 시작하는 같은 고객사의 다른 원계약
   · sure  : 고객사명이 같고(띄어쓰기·(주) 무시) 서비스(line)도 같으며 시작월이 종료월 -1 ~ +2 · 해지·중지 아님 → «재약정 등록됨»
   · maybe : 이름이 비슷하거나(포함 관계) 서비스가 다르거나 시작월이 종료월 +3 ~ +12 → «후속 계약 확인 필요» */
export function ctSuccessor(r){
  if(!r || r.endIdx==null || !ST.DATA || !ST.DATA.rows) return null;
  /** @type {any} */ var best=null; /** @type {any} */ var maybe=null; var me=fkNorm(r.cust);
  if(r.startIdx==null) return null;
  /* ㊿+173 성능: 시작월별 묶음(원래 행 순서 그대로)에서 종료월 −1 ~ +12 달만 봄 — 계약마다 전체 계약을 훑던 것과 같은 결과
     (같은 시작월이면 먼저 나온 행 · 시작월이 빠른 것이 이김 — 달 순서대로 보므로 그대로) */
  var rows=ST.DATA.rows;
  var byStart=tickMemo('ctByStart', [rows, rows.length], function(){
    var m=new Map(); rows.forEach(function(x){ if(x.parent || x.startIdx==null) return; var l=m.get(x.startIdx); if(!l) m.set(x.startIdx, l=[]); l.push(x); }); return m; });
  for(var s0=r.endIdx-1; s0<=r.endIdx+12; s0++){
    var bucket=byStart.get(s0); if(!bucket) continue;
    for(var i=0;i<bucket.length;i++){ var x=bucket[i];
      if(x===r || x.parent || x.startIdx==null || x.startIdx<=r.startIdx) continue;
      if(/해지|중지/.test(String(x.status||''))) continue;
      var gap=x.startIdx-r.endIdx; if(gap<-1 || gap>12) continue;
      var same=me && fkNorm(x.cust)===me;
      if(same && x.line===r.line && gap<=2){ if(!best || x.startIdx<best.startIdx) best=x; continue; }
      if(same || c360Match(x.cust, r.cust)){ if(!maybe || x.startIdx<maybe.startIdx) maybe=x; }
    }
  }
  return best? {row:best, sure:true} : (maybe? {row:maybe, sure:false} : null);
}
export function renewEligible(r){
  if(!liveRoot(r) || r.autoRenew || r.liveOv==='제외' || r.endRaw==null) return false;
  return !/해지|종료|통합과금|CN전환/.test(String(r.status||'').replace(/\s/g,''));
}
export function renewScan(T){
  if(T==null) T=(STATE&&STATE.base!=null)? STATE.base : ST.DATA.nowIdx;
  var out={T:T, lapsed:[], due:[], next:[], checking:[]};
  ((ST.DATA&&ST.DATA.rows)||[]).forEach(function(r){
    if(!renewEligible(r)) return;
    var e=r.endRaw;
    if(e<T){ if(e>=T-24) out.lapsed.push(r); if(e>=T-2) out.checking.push(r); }
    else if(e===T) out.due.push(r);
    else if(e===T+1) out.next.push(r);
  });
  var srt=function(a,b){ return (a.endRaw-b.endRaw) || String(a.cust).localeCompare(String(b.cust),'ko'); };
  ['lapsed','due','next','checking'].forEach(function(k){ out[k].sort(srt); });
  return out;
}
/* LIVE 고객사 수의 전월 대비 분해 — 늘어난 곳(신규·복귀) · 빠진 곳(만기 미처리·해지·종료·예외) · 확인중. 표시용(LIVE 숫자 자체는 liveCalc 그대로) */
export function liveDelta(T){
  if(T==null || T<1 || !ST.DATA || !ST.DATA.rows) return null;
  var cur=liveCalc(T), prev=liveCalc(T-1); if(!cur||!prev) return null;
  var cs={}, ps={}; cur.rows.forEach(function(x){ cs[x.cust]=1; }); prev.rows.forEach(function(x){ ps[x.cust]=1; });
  var byCust={}; ST.DATA.rows.forEach(function(r){ if(!liveRoot(r)) return; (byCust[r.cust]=byCust[r.cust]||[]).push(r); });
  var added=[], removed=[];
  Object.keys(cs).forEach(function(c){ if(ps[c]) return; var rs=byCust[c]||[];
    added.push({cust:c, kind: rs.some(function(r){ return r.startRaw===T; })? '신규' : '복귀'}); });
  Object.keys(ps).forEach(function(c){ if(cs[c]) return;
    var rs=(byCust[c]||[]).filter(function(r){ return liveActiveAt(r,T-1); });
    var st=rs.map(function(r){ return String(r.status||''); }).join(' '), ov=rs.map(function(r){ return r.liveOv||''; }).join(' ');
    removed.push({cust:c, kind: /해지/.test(st)? '해지' : /종료/.test(st)? '종료' : /제외/.test(ov)? '예외' : '만기'}); });
  var cnt=function(arr,k){ return arr.filter(function(x){ return x.kind===k; }).length; };
  return {T:T, curN:cur.uniq, prevN:prev.uniq, added:added, removed:removed,
          n:{신규:cnt(added,'신규'), 복귀:cnt(added,'복귀'), 만기:cnt(removed,'만기'), 해지:cnt(removed,'해지'), 종료:cnt(removed,'종료'), 예외:cnt(removed,'예외')},
          checking:renewScan(T).checking.length};
}
export function liveDeltaHtml(b){
  var dd=null; try{ dd=liveDelta(b); }catch(e){ return ''; }
  if(!dd) return '';
  var n=dd.n, dn=dd.curN-dd.prevN;
  var plus=[n.신규? '신규 '+n.신규:'', n.복귀? '복귀 '+n.복귀:''].filter(Boolean).join(' · ');
  var minus=[n.만기? '만기 미처리 '+n.만기:'', n.해지? '해지 '+n.해지:'', n.종료? '종료 '+n.종료:'', n.예외? '예외 제외 '+n.예외:''].filter(Boolean).join(' · ');
  return tpl`<div class="lv-delta" title="LIVE 고객사 수의 전월 대비 변화를 사유별로 나눈 것 — 숫자는 회사 단위 · 만기 미처리 = 종료월이 지났는데 연장·해지·종료 처리가 없어 빠진 곳">`+
    tpl`전월 ${rawHtml(dd.prevN)} → ${rawHtml(dd.curN)} <b class="${dn>0?'up':dn<0?'down':''}">(${dn>0?'+':''}${rawHtml(dn)})</b>`+ tpl`${rawHtml(dd.added.length? tpl` · <span class="up">+${dd.added.length}</span><span class="why">${plus}</span>`:'')}`+ tpl`${rawHtml(dd.removed.length? tpl` · <span class="down">−${dd.removed.length}</span><span class="why">${minus}</span>`:'')}`+ tpl`${rawHtml(dd.checking? tpl` · <button type="button" class="lnk" data-renew="checking" title="종료월이 최근 2개월 안에 지났는데 연장·해지 처리가 없는 계약 — LIVE 에 넣지 않고 표시만 합니다. 연장을 등록하면 되돌아옵니다">확인중 ${rawHtml(dd.checking)}건 →</button>`:'')}`+
    tpl`</div>`;
}
/* ── 만기 처리 창 ── */
export var RN={kind:'due', T:null, open:null, act:'', busy:false};
export function openRenewList(kind, T){
  if(!ST.DATA || !ST.DATA.rows) return;
  RN.kind=(kind==='checking')? 'lapsed' : (kind||'due'); RN.T=(T!=null? T : STATE.base); RN.open=null; RN.act='';
  var m=$('#rnMsg'); if(m){ m.textContent=''; m.className='mmsg'; }
  renderRenewList(); openOvl('ovlRenew');
}
export function renewKindLabel(k, T){ return k==='lapsed'? '만기 지남 · 미처리' : k==='due'? mk(T)+' 만기' : mk(T+1)+' 만기'; }
export function renewFormHtml(r, act){
  var dEnd=r.endRaw, term=r.term||12, ne=dEnd+term, cancel='<button type="button" class="pill ghost" id="rnCancel">취소</button>';
  if(act==='renew'){
    var mates=renewMates(r), q0=renewQty0(r, mates);
    return tpl`<div class="rn-f"><b>연장</b><span>기존 종료 ${mk(dEnd)} · 회차 ${rawHtml((r.renew||0)+1)}회</span>`+
    tpl`<label>새 종료월 <input type="month" id="rnEnd" value="${mk(ne)}"></label>`+
    tpl`<label>월 금액(천원) <input type="number" id="rnMrr" value="${wonToKw(r.mrr||0)}" data-prev="${rawHtml(r.mrr||0)}" min="0" step="any" style="width:110px"></label>`+
    tpl`<label>노드수 <input type="number" id="rnQty" value="${rawHtml(q0!=null? q0:'')}" min="0" step="1" style="width:90px" placeholder="그대로"></label>`+
    tpl`<label>메모 <input type="text" id="rnNote" placeholder="선택 — 비고에 덧붙임" style="width:200px"></label>`+
    tpl`${rawHtml(renewMatesHtml(r, mates, 'rn'))}`+
    tpl`<span class="mini rn-prev"><span id="rnPrev">${renewPrevText(r, ne, r.mrr||0, q0, mates)}</span>${/해지|종료/.test(r.status||'')? ' · 해지·종료였던 계약을 되살림':''}${dEnd<RN.T? ' · 지난 달 매출도 소급 생성':''}</span>`+
    tpl`<button type="button" class="pill" id="rnGo">연장 저장</button>${rawHtml(cancel)}</div>`;
  }
  if(act==='end') return tpl`<div class="rn-f"><b>서비스종료</b><span>상태를 «서비스종료»로 바꾸고 ${mk(dEnd)} 이후 월 매출을 지웁니다 · LIVE 에서는 ${mk(dEnd+1)}부터 제외</span>`+
    tpl`<label>메모 <input type="text" id="rnNote" placeholder="선택 — 비고에 덧붙임" style="width:220px"></label>`+
    tpl`<button type="button" class="pill" id="rnGo">종료 저장</button>${rawHtml(cancel)}</div>`;
  if(act==='churn') return tpl`<div class="rn-f"><b>해지</b>`+
    tpl`<label>해지월(이 달까지 매출 인식) <input type="month" id="rnMonth" value="${mk(dEnd)}"></label>`+
    tpl`<label>사유 <select id="rnReason">${rawHtml(CHURN_OPTS.map(function(o){ return tpl`<option>${o}</option>`; }).join(''))}</select></label>`+
    tpl`<span class="mini">해지월부터 LIVE 제외(매출은 해지월까지 인식) · 해지 분석·해지율에 반영</span>`+
    tpl`<button type="button" class="pill" id="rnGo">해지 저장</button>${rawHtml(cancel)}</div>`;
  if(act==='auto') return tpl`<div class="rn-f"><b>자동연장</b><span>월 단위로 자동 연장되는 계약으로 표시 — 만기 목록·슬랙 알림·«확인중»에서 빠지고 LIVE 판정은 그대로입니다. 계약 관리 표 «자동연장» 열에서 언제든 끌 수 있습니다.`+ tpl`${rawHtml(dEnd<RN.T? ' <b style="color:var(--critical)">⚠ 종료월이 지나 이미 LIVE 에서 빠진 계약입니다 — LIVE 에 두려면 «연장»으로 종료월을 늘리세요.</b>':'')}</span>`+
    tpl`<button type="button" class="pill" id="rnGo">자동연장 켜기</button>${rawHtml(cancel)}</div>`;
  return '';
}
export function renderRenewList(){
  var box=$('#rnList'); if(!box || !ST.DATA) return;
  var T=RN.T, S=renewScan(T), rows=S[RN.kind]||[], W=canWrite('contracts');
  var sum=rows.reduce(function(a,r){ return a+(r.mrr||0); },0);
  $('#rnTitle').textContent='만기 처리 — 기준 '+mk(T);
  var caps={lapsed:'종료월이 지났는데 연장·해지·서비스종료 처리가 없는 계약 — 이미 LIVE 고객사에서 빠져 있습니다(최근 24개월). 연장이면 «연장»으로 되살리고, 끝났으면 «서비스종료» 또는 «해지(사유)»로 정리하세요.',
            due:'종료월이 '+mk(T)+'인 계약 — 처리하지 않으면 '+mk(T+1)+' 1일부터 LIVE 고객사에서 빠집니다.',
            next:'종료월이 '+mk(T+1)+'인 계약 — 다음 달 안에 처리할 대상(미리 보기)입니다.'};
  $('#rnCap').textContent=caps[RN.kind]+' 월 단위 자동연장 계약은 «자동연장»을 켜면 이 목록과 슬랙 알림에서 빠집니다.'+(W? '' : ' (계약 쓰기 권한이 없어 열람만 됩니다)');
  $('#rnTabs').innerHTML=[['lapsed','만기 지남 · 미처리',S.lapsed.length],['due',mk(T)+' 만기',S.due.length],['next',mk(T+1)+' 만기',S.next.length]].map(function(t){
    return tpl`<button type="button" data-k="${rawHtml(t[0])}" aria-pressed="${RN.kind===t[0]}">${t[1]} <b class="num">${rawHtml(t[2])}</b></button>`; }).join('');
  $('#rnTabs').querySelectorAll('button').forEach(function(b){ b.onclick=function(){ RN.kind=b.dataset.k; RN.open=null; RN.act=''; renderRenewList(); }; });
  if(!rows.length){ box.innerHTML=tpl`<div class="ib-empty"><span class="ib-ic ok">${rawHtml(ico('check',16))}</span>처리할 계약이 없습니다.</div>`; }
  else {
    var h=tpl`<table class="rn-tbl"><thead><tr><th>고객사</th><th>서비스</th><th>채널 · 파트너</th><th>기간</th><th class="n">약정</th><th class="n">MRR(천원)</th><th>상태</th>${rawHtml(W? '<th>처리</th>':'')}</tr></thead><tbody>`;
    rows.forEach(function(r){
      var id=r._id, open=(RN.open===id);
      h+=tpl`<tr data-id="${rawHtml(id)}"${rawHtml(open?' class="rn-on"':'')}><td><a class="rn-cust" data-c="${r.cust}" title="고객 360">${r.cust}</a>${rawHtml(r.s1no? tpl` <span class="mini">${r.s1no}</span>`:'')}</td>`+
         tpl`<td>${llineVer(r.line,r.ver)}</td><td>${chOf(r)}${rawHtml(r.ptn&&r.ptn!=='직접(계산서)'? ' · '+esc(r.ptn):'')}</td>`+
         tpl`<td>${r.startRaw!=null? mk(r.startRaw):'?'} ~ <b>${mk(r.endRaw)}</b></td><td class="n">${rawHtml(r.term? r.term+'개월':'·')}</td><td class="n">${won(r.mrr)}</td>`+
         tpl`<td>${r.status||''}${rawHtml(r.renew? tpl` <span class="ubadge sm">연장 ${rawHtml(r.renew)}회</span>`:'')}</td>`;
      if(W) h+=tpl`<td class="rn-acts">${rawHtml([['renew','연장'],['end','서비스종료'],['churn','해지'],['auto','자동연장']].map(function(a){ return tpl`<button type="button" class="cbtn${open&&RN.act===a[0]?' pri':''}" data-id="${rawHtml(id)}" data-a="${rawHtml(a[0])}">${rawHtml(a[1])}</button>`; }).join(''))}</td>`;
      h+='</tr>';
      if(open && W) h+=tpl`<tr class="rn-form"><td colspan="8">${rawHtml(renewFormHtml(r, RN.act))}</td></tr>`;
    });
    h+=tpl`</tbody><tfoot><tr><td colspan="5">합계 ${rows.length}건</td><td class="n">${won(sum)}</td><td colspan="2"></td></tr></tfoot></table>`;
    box.innerHTML=h;
    box.querySelectorAll('.rn-cust').forEach(function(a){ a.onclick=function(){ closeOvl('ovlRenew'); openCust360(a.dataset.c); }; });
    box.querySelectorAll('.rn-acts .cbtn').forEach(function(bt){ bt.onclick=function(){
      var id=+bt.dataset.id;
      if(RN.open===id && RN.act===bt.dataset.a){ RN.open=null; RN.act=''; } else { RN.open=id; RN.act=bt.dataset.a; }
      renderRenewList();
      var f=box.querySelector('.rn-form'); if(f){ try{ f.scrollIntoView({block:'nearest'}); }catch(e){} amtHint(f.querySelector('#rnMrr'), null, true); if(RN.act==='renew') renewWire(rows.filter(function(r){ return r._id===RN.open; })[0], 'rn', f); var i=f.querySelector('input,select'); if(i) i.focus(); }
    }; });
    var go=box.querySelector('#rnGo'); if(go) go.onclick=function(){ renewSubmit(rows.filter(function(r){ return r._id===RN.open; })[0]); };
    var cc=box.querySelector('#rnCancel'); if(cc) cc.onclick=function(){ RN.open=null; RN.act=''; renderRenewList(); };
  }
  var sl=$('#rnSlack'); if(sl){ sl.style.display=ST.IS_SUPER? '':'none'; sl.onclick=function(){ renewSlack('tab'); }; }
  var sa=$('#rnSlackAll'); if(sa){ sa.style.display=ST.IS_SUPER? '':'none'; sa.onclick=function(){ renewSlack('all'); }; }
  $('#rnXls').onclick=function(){ xlsxAoa('만기처리_'+mk(T)+'_'+RN.kind, ['고객사','서비스','채널','파트너','시작월','종료월','약정(개월)','MRR(천원)','상태','연장회차','에스원 계약번호'],
    rows.map(function(r){ return [r.cust, llineVer(r.line,r.ver), chOf(r), r.ptn||'', r.startRaw!=null? mk(r.startRaw):'', mk(r.endRaw), r.term||'', Math.round((r.mrr||0)/1000), r.status||'', r.renew||0, r.s1no||'']; })); };
}
export async function renewSubmit(r){
  if(!r || RN.busy) return;
  var m=$('#rnMsg'); RN.busy=true; if(m){ m.textContent='저장 중…'; m.className='mmsg'; }
  try{
    var act=RN.act, txt='';
    if(act==='renew'){
      var ne=ymFromInput($('#rnEnd').value); if(ne==null) throw new Error('새 종료월을 입력하세요.');
      var amt=kwToWon($('#rnMrr').value) || r.mrr || 0; if(!amt) throw new Error('월 금액을 입력하세요.');
      if(!amtGuard(amt, r.mrr, '연장 월 금액', true)) throw new Error('저장하지 않았습니다 — 월 금액을 확인하세요 (천원 단위 · 48만원 → 480).');
      var ro=renewOpts(r, 'rn', $('#rnList'));
      var res=await doRenew(r, ne, amt, ($('#rnNote').value||'').trim(), ro);
      txt='연장 '+res.rno+'회 — '+r.cust+' → '+mk(ne)+' · 월 '+won(amt)+'천원'+(ro.qty!=null && ro.qty!==(r.qty||0)? ' · '+ro.qty+'노드':'')+(ro.merge.length? ' · 추가 '+ro.merge.length+'건 통합':'');
    } else if(act==='end'){
      await doEndService(r, ($('#rnNote').value||'').trim()); txt='서비스종료 — '+r.cust+' ('+mk(r.endRaw)+'까지 인식)';
    } else if(act==='churn'){
      var m0=ymFromInput($('#rnMonth').value), rs=$('#rnReason').value; if(m0==null||!rs) throw new Error('해지월·사유를 입력하세요.');
      await doChurn(r, m0, rs); txt='해지 — '+r.cust+' ('+mk(m0)+'까지 인식 · '+rs+')';
    } else if(act==='auto'){
      await doAutoRenew(r, true); txt='자동연장 표시 — '+r.cust;
    } else throw new Error('처리 종류를 고르세요.');
    toast('처리 완료 ✅', txt);
    RN.open=null; RN.act='';
    var nd=await loadFromDb(); onData(nd);
    if(m){ m.textContent=txt; m.className='mmsg ok'; }
    renderRenewList();
  }catch(e){ if(m){ m.textContent=String(e.message||e); m.className='mmsg bad'; } }
  RN.busy=false;
}
/* ㊿+159 연장 도우미 (사용자: 신규 240노드 + 추가 30노드 → 8월 재약정 270노드 · «연장 2회가 됨» · «전월 MRR 이 바뀌는 건 아닌지»)
   · 연장은 원계약 한 줄에 «연장 n회»(재약정 행을 따로 만들지 않음) — 기존 종료월까지의 월 매출은 그대로, 다음 달부터만 새 금액
   · 같은 달에 끝나는 «추가» 계약(부속 또는 같은 고객·서비스의 추가)은 연장 창에서 합칠 수 있음 → 노드수 더함 · 그 계약은 원래 종료월에 끝(«재약정 통합» 표시 · 이탈 아님)
   · 마지막 연장 되돌리기(renewUndoPlan/doUndoRenew) — 이력(renew_history)의 이전 값으로 종료월·MRR·상태·노드수·합친 계약을 되돌리고, 연장으로 생긴 달만 지움 */
export function ctRawOf(id){ var a=(ST.RAWX&&ST.RAWX.contracts)||SB_RAW.contracts||[]; return a.filter(function(c){ return c.id===id; })[0]||null; }
export function ctRowIdx(r){ var rows=(ST.DATA&&ST.DATA.rows)||[], k=rows.indexOf(r); if(k<0) for(var i=0;i<rows.length;i++) if(rows[i]._id===r._id){ k=i; break; } return k; }
/** 연장할 계약의 «현재 종료월» — 종료월이 없고 매출도 없으면(endIdx -1) null */
export function renewEnd(r){ return (r && r.endIdx!=null && r.endIdx>=0)? r.endIdx : null; }
/** 같이 끝나는 추가 계약 — «추가»(구분 또는 상태)만 · 이 계약의 부속이거나, 부속이 아닌 같은 고객·서비스의 추가 행(다른 원계약의 부속·사이트별 하위 계약은 제외) */
export function renewMates(r){
  var re=renewEnd(r); if(re==null) return [];
  return ((ST.DATA&&ST.DATA.rows)||[]).filter(function(x){
    if(x._id===r._id || !(x.ctype==='추가' || x.status==='추가')) return false;
    if(x.parent? x.parent!==r._id : !(x.cid===r.cid && x.line===r.line)) return false;
    if(/해지|종료/.test(String(x.status||'')) || /재약정 통합/.test(String(x.note||''))) return false;
    var e=(x.endRaw!=null? x.endRaw : x.endIdx); return e===re;
  });
}
export function renewQty0(r, mates){ var q=(r.qty||0)+mates.filter(function(x){ return x.parent===r._id; }).reduce(function(a, x){ return a+(x.qty||0); }, 0); return q>0? q : null; }   /* 기본 체크(=이 계약의 부속)만 더함 */
export function renewMatesHtml(r, mates, p){
  if(!mates.length) return '';
  return tpl`<div class="rn-mates" style="flex-basis:100%;font-size:13px;line-height:1.7"><b>같이 끝나는 추가 계약</b> — 체크하면 이 연장에 합칩니다 (노드수에 더함 · 그 계약은 ${mk(renewEnd(r))}에 끝난 것으로 «재약정 통합» 표시 · 이탈 아님 · 월 매출은 그대로) · 이 계약에 붙은 추가는 미리 체크, 따로 등록된 추가는 직접 체크<br>`+
    tpl`${rawHtml(mates.map(function(x){ return tpl`<label style="margin-right:14px"><input type="checkbox" class="${rawHtml(p)}Mate" value="${rawHtml(x._id)}" data-q="${rawHtml(x.qty||0)}"${rawHtml(x.parent===r._id? ' checked':'')}> #${rawHtml(x._id)} ${x.ctype||x.status||'추가'}${rawHtml(x.parent===r._id? '':' (따로 등록)')} · ${rawHtml(x.qty||0)}노드 · 월 ${won(x.mrr||0)}천원 · ~${mk(x.endRaw!=null? x.endRaw : x.endIdx)}</label>`; }).join(''))}</div>`;
}
/** 새 월 매출을 쓰기 시작하는 달 — 기존 종료월 다음 달 · 종료월·매출이 없으면 시작월(없으면 새 종료월) */
export function renewFrom(r, ne){ var re=renewEnd(r); return re!=null? re+1 : (r.startRaw!=null? Math.min(r.startRaw, ne) : ne); }
/** 연장하면 무엇이 바뀌는지 한 줄 — «기존 종료월까지 월 매출은 그대로»를 분명히 */
export function renewPrevText(r, ne, amt, qty, mates){
  if(ne==null) return '새 종료월을 넣으세요';
  var re=renewEnd(r), from=renewFrom(r, ne);
  if(ne<from) return '⚠ 새 종료월이 기존 종료월('+mk(re)+')보다 빠릅니다';
  var out=[];
  if(re!=null) out.push(mk(re)+'까지 월 매출은 그대로');
  out.push(mk(from)+'~'+mk(ne)+' '+(ne-from+1)+'개월 월 '+won(amt||0)+'천원');
  if(qty!=null && qty!==(r.qty||0)) out.push('노드 '+(r.qty||0)+' → '+qty);
  var nt=renewCtype(r); if(nt!==(r.ctype||'')) out.push('구분 '+(r.ctype||'없음')+' → '+nt);
  var ns=renewStatus(r); if(ns!==(r.status||'')) out.push('상태 '+(r.status||'없음')+' → '+ns);
  if(mates && mates.length) out.push('추가 '+mates.length+'건은 '+mk(re)+'에 끝(재약정 통합)');
  out.push('재약정 행은 따로 만들지 않음');
  return out.join(' · ');
}
/** 연장 폼 연결 — p = 'rn'(만기 처리 창) | 'r'(입력·수정 › 갱신) · 체크를 바꾸면 노드수도 같이
    갱신 탭 칸은 그대로 남아 있으므로 리스너는 한 번만 달고, 지금 고른 계약의 미리보기 함수(RN_UPD[p])를 부름 */
export var RN_UPD={};
export function renewWire(r, p, host){
  if(!r) return; host=host||document;
  var en=/** @type {any} */ (host.querySelector('#'+p+'End')), mr=/** @type {any} */ (host.querySelector('#'+p+'Mrr')), qt=/** @type {any} */ (host.querySelector('#'+p+'Qty')), pv=host.querySelector('#'+p+'Prev');
  RN_UPD[p]=function(){ if(!pv) return; var o=renewOpts(r, p, host), mates=renewMates(r).filter(function(x){ return o.merge.indexOf(x._id)>=0; });
    var amt=(mr && kwToWon(mr.value)) || r.mrr || 0; pv.textContent=renewPrevText(r, en? ymFromInput(en.value) : null, amt, o.qty, mates); };
  [en, mr, qt].forEach(function(e){ if(e && !e.dataset.rnw){ e.dataset.rnw='1'; var f=function(){ if(RN_UPD[p]) RN_UPD[p](); }; e.addEventListener('input', f); e.addEventListener('change', f); } });
  host.querySelectorAll('.'+p+'Mate').forEach(function(cb){ var c=/** @type {any} */ (cb); c.addEventListener('change', function(){ if(qt){ var q=+qt.value||0, d=+c.dataset.q||0; qt.value=String(Math.max(0, q+(c.checked? d : -d))||''); } if(RN_UPD[p]) RN_UPD[p](); }); });
  RN_UPD[p]();
}
export function renewOpts(r, p, host){
  host=host||document; var qt=/** @type {any} */ (host.querySelector('#'+p+'Qty')), q=qt && qt.value!==''? Math.round(+qt.value) : null;
  var merge=[].slice.call(host.querySelectorAll('.'+p+'Mate')).filter(function(cb){ return cb.checked; }).map(function(cb){ return +cb.value; });
  return {qty:(q!=null && isFinite(q) && q>=0)? q : null, merge:merge};
}
/** ㊿+160 연장한 계약의 상태 — 원계약은 «재약정»(종료·해지였어도 되살림) · 추가 계약은 «추가» · CN전환·통합과금 등 특수 상태는 그대로
    (사용자 2026-10-08: 연장하면 상태만 재약정, 구분은 처음 들어온 대로) */
/** ㊿+163 연장하면 «구분»도 «재약정» (추가 계약은 그대로) — 처음 구분은 연장 이력 첫 칸의 prev_ctype 에 남음 (사용자 결정 2026-10-08) */
export function renewCtype(r){
  if(r.ctype==='추가' || String(r.status||'')==='추가') return r.ctype||'';
  return '재약정';
}
/** 처음 들어온 구분 — 연장으로 «재약정»이 됐어도 신규 집계·최초 기간 표시는 이 값으로 */
export function ctOrig(r){
  var h=(r && (Array.isArray(r.renew_history)? r.renew_history : r.renewHist))||[], h0=h[0];
  return (h0 && h0.prev_ctype!=null)? h0.prev_ctype : ((r && (r.contract_type!==undefined? r.contract_type : r.ctype))||'');
}
export function renewStatus(r){
  var st=String(r.status||'');
  if(r.ctype==='추가' || st==='추가') return '추가';
  if(!st || /^(신규|재약정)$/.test(st) || /해지|종료/.test(st)) return '재약정';
  return st;
}
/* ── 저장 로직 (입력·수정 › 갱신·해지 탭과 공유) ── */
export async function doRenew(r, ne, amt, note, opt){
  if(!canWrite('contracts')) throw new Error('계약 쓰기 권한이 없습니다.');
  opt=opt||{};
  /* 화면에 남아 있던 옛 행으로 두 번 저장하는 것 막기 — 다시 읽은 데이터(최신 행·DB 값)와 회차·종료월이 다르면 거부 (㊿+159) */
  var cur=((ST.DATA&&ST.DATA.rows)||[]).filter(function(x){ return x._id===r._id; })[0], raw=ctRawOf(r._id)||{};
  if((cur && cur!==r && (cur.renew!==r.renew || cur.endIdx!==r.endIdx)) || (raw.renew_count!=null && Number(raw.renew_count)!==Number(r.renew||0))) throw new Error('이 계약은 방금 바뀌었습니다 (연장 '+(cur? cur.renew : raw.renew_count)+'회) — 계약을 다시 골라 주세요.');
  if(cur) r=cur;
  var from=renewFrom(r, ne), re=renewEnd(r);
  if(ne<from) throw new Error('새 종료월이 기존 종료월보다 빠릅니다.');
  /* 연장 = 원계약 한 줄을 갱신 (회차 +1 · 상태 «재약정»(㊿+160) · 종료/해지였어도 되살림). 별도 «재약정» 행을 만들지 않습니다 */
  var rno=(r.renew||0)+1, k=ctRowIdx(r), mat=(k>=0 && ST.MAT[k])||[], prevRev=[];
  for(var m=from;m<mat.length;m++) if(mat[m]) prevRev.push({m:idxDate(m), v:mat[m]});   // 연장 전에 이미 있던 달(보통 없음) — 되돌리기에서 그대로 복구
  var mates=renewMates(r).filter(function(x){ return (opt.merge||[]).indexOf(x._id)>=0; });
  var qty=(opt.qty!=null && isFinite(opt.qty) && opt.qty>=0)? Math.round(opt.qty) : null;
  var ent={no:rno, from:idxDate(from), to:idxDate(ne), mrr:amt, prev_end:(re!=null? idxDate(re):null), prev_end_raw:(raw.end_month!==undefined? raw.end_month : null),
           prev_mrr:r.mrr, prev_status:r.status, prev_ctype:(raw.contract_type!==undefined? raw.contract_type : r.ctype)||null, prev_qty:(raw.qty!=null? raw.qty : (r.qty||null)),
           prev_churn_reason:raw.churn_reason||null, prev_churn_month:raw.churn_month||null,
           note:note||null, at:new Date().toISOString(), by:ST.AUTH_USER};
  if(qty!=null) ent.qty=qty;
  /* ㊿+162 메모는 계약 관리 «비고»에도 덧붙임 (같은 글이 이미 있으면 그대로) · 되돌리면 그 메모만 뺌 */
  var memo=String(note||'').trim(), note0=(raw.note!==undefined? raw.note : r.note)||null;
  if(memo) ent.prev_note=note0;
  if(prevRev.length) ent.prev_rev=prevRev;
  if(mates.length) ent.merged=mates.map(function(x){ var xr=ctRawOf(x._id)||{}; return {id:x._id, prev_status:(xr.status!==undefined? xr.status : x.status)||null, prev_note:(xr.note!==undefined? xr.note : x.note)||null}; });
  var hist=(Array.isArray(raw.renew_history)? raw.renew_history : (r.renewHist||[])).concat([ent]);
  var nst=renewStatus(r);   /* ㊿+160 연장하면 상태 «재약정»(구분은 처음 그대로) · 추가 계약은 «추가» 유지 */
  var body={end_month:idxDate(ne), mrr:amt, status:nst, contract_type:renewCtype(r), churn_reason:null, churn_month:null, renew_count:rno, renew_history:hist, updated_at:new Date().toISOString()};
  if(qty!=null) body.qty=qty;
  if(memo && (' · '+(note0||'')+' · ').indexOf(' · '+memo+' · ')<0){ body.note=[note0, memo].filter(Boolean).join(' · '); ent.note_added=true; }   /* 덧붙였을 때만 표시 — 되돌리기는 이 표시가 있을 때만 뺌 */
  await sbWrite('PATCH','contracts?id=eq.'+r._id, body);
  await sbWrite('DELETE','monthly_revenue?contract_id=eq.'+r._id+'&month=gte.'+idxDate(from));
  await sbWrite('POST','monthly_revenue', monthRows(r._id,from,ne,amt));
  for(var i=0;i<mates.length;i++){ var x=mates[i];
    var st2=(!x.parent && /^(신규|재약정)$/.test(String(x.status||'')))? '서비스종료' : x.status;   // 원계약 모양이면 만기 목록에서 빠지게 «서비스종료»(이탈 아님)
    var p2={note:[x.note, '재약정 통합 → #'+r._id+' 연장 '+rno+'회 ('+mk(from)+'~)'].filter(Boolean).join(' · '), updated_at:new Date().toISOString()}; if(st2!==x.status) p2.status=st2;
    await sbWrite('PATCH','contracts?id=eq.'+x._id, p2);
  }
  await logChange('update','contracts',r._id,{action:'연장',no:rno,newEnd:idxDate(ne),amount:amt,qty:qty,merged:mates.map(function(x){ return x._id; })});
  return {rno:rno, from:from, merged:mates.length};
}
/** 마지막 연장 되돌리기 계획 — {bad} 또는 {n, from, body, restore, merged, lines} */
export function renewUndoPlan(r){
  var raw=ctRawOf(r._id)||{}, hist=Array.isArray(raw.renew_history)? raw.renew_history : (r.renewHist||[]);
  var n=Number(raw.renew_count!=null? raw.renew_count : r.renew)||0, h=hist[hist.length-1];
  if(!n || !h) return {bad:'되돌릴 연장 기록이 없습니다.'};
  if(!h.from || !('prev_mrr' in h) || !('prev_end' in h)) return {bad:'이 연장 기록('+(h.no||n)+'회)에는 연장 전 값이 없어 자동으로 되돌릴 수 없습니다 (시트 이관 기록 등) — 계약 관리 표에서 종료월·MRR 을 직접 고쳐 주세요.'};
  var from=dIdx(h.from), k=ctRowIdx(r), mat=(k>=0 && ST.MAT[k])||[], del=0;
  for(var m=from;m<mat.length;m++) if(mat[m]) del++;
  var st=(h.prev_status!=null? h.prev_status : (raw.status||r.status||''));
  if(n-1>0 && st==='신규') st='재약정';   /* ㊿+160 아직 연장이 남아 있으면 «재약정» (예전 기록의 prev_status 는 «신규»로 남아 있음) */
  var pend=('prev_end_raw' in h)? h.prev_end_raw : (h.prev_end||null);   /* ㊿+159 이후 기록은 계약의 종료월 칸 그대로(무약정이면 비움) */
  var body={end_month:pend, mrr:Number(h.prev_mrr)||0, status:st, renew_count:n-1, renew_history:hist.slice(0,-1), updated_at:new Date().toISOString()};
  if('qty' in h && 'prev_qty' in h) body.qty=h.prev_qty;   /* 연장 때 노드수를 바꾼 경우만 (그 뒤 따로 고친 노드수는 그대로) */
  /* ㊿+163 구분: 이 연장 전 구분(prev_ctype) → 없으면 마지막 연장을 지울 때만 처음 구분(첫 칸 prev_ctype · SQL 101) · 연장이 남아 있으면 «재약정» */
  var ctNow=(raw.contract_type!==undefined? raw.contract_type : r.ctype)||'', ct0=hist[0] && hist[0].prev_ctype;
  var ctB=('prev_ctype' in h)? (h.prev_ctype||'') : ((n-1===0 && ct0!=null)? ct0 : ctNow);
  if(n-1>0 && ctB!=='추가') ctB='재약정';
  if(ctB!==ctNow) body.contract_type=ctB;
  /* ㊿+162 연장 메모를 비고에 덧붙였던 기록이면 그 메모 한 조각만 뺌 (그 뒤 따로 쓴 비고는 그대로) */
  var noteCur=String((raw.note!==undefined? raw.note : r.note)||''), noteMm=String(h.note||'').trim(), noteAt=(h.note_added && noteMm)? noteCur.lastIndexOf(noteMm) : -1;
  if(noteAt>=0){ body.note=[noteCur.slice(0,noteAt).replace(/\s*·\s*$/,''), noteCur.slice(noteAt+noteMm.length).replace(/^\s*·\s*/,'')].filter(Boolean).join(' · ')||null; }
  if('prev_churn_reason' in h){ body.churn_reason=h.prev_churn_reason; body.churn_month=h.prev_churn_month==null? null : h.prev_churn_month; }
  else if(/해지/.test(st)){ body.churn_reason=raw.churn_reason||null; body.churn_month=h.prev_end||null; }
  var restore=Array.isArray(h.prev_rev)? h.prev_rev : [], merged=Array.isArray(h.merged)? h.merged : [];
  var curEnd=(r.endRaw!=null? mk(r.endRaw) : '없음'), pe=pend? String(pend).slice(0,7) : '없음';
  var lines=['연장 '+n+'회 → '+(n-1)+'회'+(h.at? '  (취소할 연장: '+String(h.at).slice(0,10)+(h.by? ' · '+h.by:'')+')' : ''),
    '종료월 '+curEnd+' → '+pe, 'MRR '+won(raw.mrr!=null? raw.mrr : r.mrr)+' → '+won(body.mrr)+'천원'];
  if('qty' in body && Number(body.qty||0)!==Number(raw.qty!=null? raw.qty : r.qty||0)) lines.push('노드수 '+(raw.qty!=null? raw.qty : r.qty||0)+' → '+(body.qty==null? '비움' : body.qty));
  if(st!==(raw.status||r.status||'')) lines.push('상태 '+(raw.status||r.status||'')+' → '+st);
  lines.push('월 매출: '+mk(from)+'부터 '+del+'개월 삭제'+(restore.length? ' · 연장 전에 있던 '+restore.length+'개월 복구' : '')+' — '+mk(from-1)+'까지는 그대로');
  if('contract_type' in body) lines.push('구분 '+(ctNow||'없음')+' → '+(body.contract_type||'없음'));
  if('note' in body) lines.push('비고에서 연장 메모 «'+h.note+'» 빼기');
  if(merged.length) lines.push('합쳤던 추가 계약 '+merged.map(function(x){ return '#'+x.id; }).join('·')+' 의 «재약정 통합» 표시 되돌림');
  return {n:n, from:from, body:body, restore:restore, merged:merged, lines:lines};
}
export async function doUndoRenew(r, plan){
  if(!canWrite('contracts')) throw new Error('계약 쓰기 권한이 없습니다.');
  if(!plan || plan.bad) throw new Error((plan&&plan.bad)||'되돌릴 수 없습니다.');
  /* 순서: 월 매출 → 합쳤던 추가 계약 → 계약(이력 한 칸 지움)은 마지막 — 중간에 실패해도 다시 누르면 같은 연장을 다시 되돌림(이전 연장을 건드리지 않음) */
  await sbWrite('DELETE','monthly_revenue?contract_id=eq.'+r._id+'&month=gte.'+idxDate(plan.from));
  if(plan.restore.length) await sbWrite('POST','monthly_revenue', plan.restore.map(function(x){ return {contract_id:r._id, month:x.m, amount:x.v}; }));
  for(var i=0;i<plan.merged.length;i++){ var x=plan.merged[i], xr=ctRawOf(x.id)||{}, b2={note:x.prev_note, updated_at:new Date().toISOString()};
    if(x.prev_status!=null && x.prev_status!==xr.status) b2.status=x.prev_status;
    await sbWrite('PATCH','contracts?id=eq.'+x.id, b2); }
  await sbWrite('PATCH','contracts?id=eq.'+r._id, plan.body);
  await logChange('update','contracts',r._id,{action:'연장 취소',no:plan.n,end:plan.body.end_month,mrr:plan.body.mrr});
}
/** 확인 창 → 되돌리기 → 다시 읽기 (입력·수정 › 갱신 · 데이터 점검에서 같이 씀) · 되돌렸으면 true */
export async function renewUndoFlow(r){
  var cur=((ST.DATA&&ST.DATA.rows)||[]).filter(function(x){ return x._id===r._id; })[0]; if(cur) r=cur;   /* 다시 읽은 최신 행 기준 */
  var plan=renewUndoPlan(r);
  if(plan.bad){ toast('되돌릴 수 없습니다', plan.bad, 'info'); return false; }
  if(!confirm(r.cust+' · '+lline(r.line)+' (#'+r._id+') — 마지막 연장을 되돌립니다.\n\n'+plan.lines.join('\n')+'\n\n되돌릴까요?')) return false;
  await doUndoRenew(r, plan);
  toast('연장 되돌림 ✅', r.cust+' — 연장 '+plan.n+'회 → '+(plan.n-1)+'회');
  var nd=await loadFromDb(); onData(nd);
  return true;
}
export async function doChurn(r, m0, rs){
  if(!canWrite('contracts')) throw new Error('계약 쓰기 권한이 없습니다.');
  await sbWrite('PATCH','contracts?id=eq.'+r._id,{status:'해지',churn_reason:rs,end_month:idxDate(m0),churn_month:idxDate(m0),updated_at:new Date().toISOString()});
  await sbWrite('DELETE','monthly_revenue?contract_id=eq.'+r._id+'&month=gt.'+idxDate(m0));
  await logChange('update','contracts',r._id,{action:'해지',month:idxDate(m0),reason:rs});
}
export async function doEndService(r, note){
  if(!canWrite('contracts')) throw new Error('계약 쓰기 권한이 없습니다.');
  var e=(r.endRaw!=null? r.endRaw : r.endIdx); if(e==null) throw new Error('종료월이 없는 계약입니다 — 계약 관리에서 종료월을 먼저 넣으세요.');
  var p={status:'서비스종료', updated_at:new Date().toISOString()}; if(note) p.note=[r.note, note].filter(Boolean).join(' · ');
  await sbWrite('PATCH','contracts?id=eq.'+r._id, p);
  await sbWrite('DELETE','monthly_revenue?contract_id=eq.'+r._id+'&month=gt.'+idxDate(e));
  await logChange('update','contracts',r._id,{action:'서비스종료',end:idxDate(e),note:note||null});
}
export async function doAutoRenew(r, on){
  if(!canWrite('contracts')) throw new Error('계약 쓰기 권한이 없습니다.');
  await sbWrite('PATCH','contracts?id=eq.'+r._id,{auto_renew:!!on, updated_at:new Date().toISOString()});
  await logChange('update','contracts',r._id,{action:'자동연장',on:!!on});
}
/* ── 슬랙 발송 (슈퍼 관리자) — Edge Function remind: 미리보기(dry) → 확인 → 발송. 서비스 키는 함수 쪽 Secrets 에만
   scope 'tab' = 지금 탭 구역만(body.only) · 'all' = 세 구역 전부(월말 크론과 동일) ── */
export async function renewSlack(scope){
  if(!ST.IS_SUPER){ toast('슬랙 발송은 슈퍼 관리자만 할 수 있습니다',''); return; }
  var m=$('#rnMsg'), bts=[$('#rnSlack'),$('#rnSlackAll')].filter(Boolean); bts.forEach(function(b){ b.disabled=true; }); if(m){ m.textContent='미리보기 만드는 중…'; m.className='mmsg'; }
  var tabOnly=(scope!=='all'), tabName=renewKindLabel(RN.kind, RN.T);
  try{
    var url=SB_URL+'/functions/v1/remind', hdr={'Content-Type':'application/json', apikey:SB_KEY, Authorization:'Bearer '+ST.SB_TOKEN};
    var body={month:idxDate(RN.T), kind:'monthly'}; if(tabOnly) body.only=RN.kind;
    if(/^https:/.test(location.protocol+'//')) body.portal_url=location.origin+location.pathname;   /* 슬랙 메시지의 «포탈 홈 › 만기 처리» 링크 = 지금 열려 있는 이 포탈 주소 (함수 Secrets PORTAL_URL 보다 우선) */
    var pv=await fetch(url+'?dry=1',{method:'POST',headers:hdr,body:JSON.stringify(body)}).then(function(r){ return r.json(); });
    if(!pv || !pv.ok) throw new Error((pv&&pv.error)||'미리보기 실패 — remind 함수가 배포됐는지 확인');
    var c=pv.counts||{};
    var lines=tabOnly? ['«'+tabName+'» 탭만 — '+(pv.total!=null? pv.total : (c[RN.kind]||0))+'건'] : ['세 구역 전부 — 이달 만기 '+(c.due||0)+'건 · 다음 달 만기 '+(c.next||0)+'건 · 미처리 '+(c.lapsed||0)+'건'];
    if(tabOnly && pv.kinds && pv.kinds.length!==1) lines.push('⚠ 배포된 remind 함수가 구역 선택(only)을 모르는 옛 버전이라 세 구역이 전부 갑니다 — v1.2 로 올려 주세요');
    if(!confirm('슬랙 팀 채널('+(pv.channel||'')+')로 보냅니다.\n\n'+(pv.text||'')+'\n'+lines.join('\n')+'\n\n보낼까요?')) throw new Error('취소했습니다.');
    var rr=await fetch(url,{method:'POST',headers:hdr,body:JSON.stringify(body)}).then(function(r){ return r.json(); });
    if(!rr || !rr.ok) throw new Error((rr&&rr.error)||'발송 실패');
    toast('슬랙 발송 완료 📣', String(rr.text||'').slice(0,90));
    if(m){ m.textContent='슬랙 발송 완료 — '+(rr.text||''); m.className='mmsg ok'; }
  }catch(e){
    var em=String(e.message||e);
    if(/Failed to fetch|NetworkError|Load failed|network/i.test(em))   /* 브라우저가 응답을 못 받음 = 함수가 없거나 게이트웨이가 CORS 없이 거절 */
      em='remind 함수에 연결하지 못했습니다 (Failed to fetch) — ① Edge Functions 에 이름이 정확히 «remind» 인 함수가 배포돼 있는지 ② 그 함수 설정에서 «Verify JWT» 를 껐는지(ask 와 같게 — 함수가 로그인 토큰을 직접 검사합니다) 확인하세요. 방금 배포했으면 30초쯤 뒤 다시 눌러 보세요.';
    if(m){ m.textContent=em; m.className='mmsg bad'; }
  }
  bts.forEach(function(b){ b.disabled=false; });
}
/* LIVE 행의 채널 = 같은 고객·서비스의 «원계약» 중 가장 최근 것의 채널 (부속 계약은 채널 판단에 쓰지 않음 · 원계약이 없을 때만 부속 참고) */
export function liveChannel(x){
  var best=null, bestChild=null, nm=fkNorm(x.cust);
  (ST.DATA.rows||[]).forEach(function(r){
    if(r.line!==x.line || fkNorm(r.cust)!==nm) return;
    if(r.parent){ if(!bestChild || (r.startIdx||0)>(bestChild.startIdx||0)) bestChild=r; return; }
    if(!best || (r.startIdx||0)>(best.startIdx||0)) best=r;
  });
  var pick=best||bestChild;
  return pick? chOf(pick) : '일반';
}
export function renderChannelView(key){
  var def=CH_DEFS[key], ch=def[1], match=def[3];
  var host=$('#chBody');
  var list=[]; ST.DATA.rows.forEach(function(r,k){ if(match(r)) list.push(k); });
  var b=STATE.base;
  var mrr=monthlyTotal(list,b);
  var act=0, custs={};
  list.forEach(function(k){ if(ST.MAT[k][b]>0){ act++; custs[ST.DATA.rows[k].cust]=1; } });
  /* 고객사 수는 LIVE 고객사 탭 기준 (대시보드와 같은 기준) — 당월 매출 기준 수는 보조 표기 */
  var lv=liveForArea(key), lvCust={}; (lv||[]).forEach(function(x){ lvCust[x.cust]=1; });
  var lvN=lv? Object.keys(lvCust).length : null;
  var hasEq=!!ch;
  var pendEq=0, rentEq=0;
  if(hasEq){
    (ST.RAWX.orders||[]).forEach(function(o){ if(o.channel===ch && ['접수','출하요청','배송중','회수예정'].indexOf(o.status)>=0) pendEq++; });
    (ST.RAWX.assets||[]).forEach(function(a){ if(a.channel===ch && a.status==='임대중') rentEq++; });
  }
  function tile(k2,v2,u2,d2,kx){ return tpl`<div class="kpi"${rawHtml(kx?' data-kx="'+kx+'"':'')}><div class="k">${rawHtml(k2)}</div><div class="v">${rawHtml(v2)}<small>${rawHtml(u2)}</small></div><div class="d">${rawHtml(d2||'')}</div></div>`; }
  var h=tpl`<div style="display:flex;align-items:baseline;gap:12px;margin:2px 2px 14px">`+
    tpl`<span style="font-size:18px;font-weight:800">${rawHtml(isGN()? def[0].replace(/^[^\w가-힣]+\s*/,'') : def[0])} 사업 영역</span>`+
    tpl`<span class="ubadge sm">₩ 금액 단위 = 천원</span>`+
    tpl`<span class="mini">${def[2]} · ${baseLabel()} 기준</span></div>`;
  h+=tpl`<div class="kpis" style="margin-bottom:16px">`+
    tpl`${rawHtml(tile('당월 MRR', won(mrr), '천원', '연환산 '+won(mrr*12)+'천원','cv_mrr'))}`+ tpl`${rawHtml(lvN!=null
      ? tile('LIVE 고객사', liveN(lv).toLocaleString('ko-KR'), '곳', (lv.length!==liveN(lv)? '사이트 기준 '+lv.length+'건 · ':'')+liveGroupNote(key),'cv_live')
      : tile('고객사', Object.keys(custs).length.toLocaleString('ko-KR'), '곳', '당월 매출 기준','cv_cust'))}`+ tpl`${rawHtml(hasEq? tile('임대중 장비', rentEq, '대', pendEq? '처리 대기 요청 '+pendEq+'건':'대기 요청 없음','cv_eq')
          : tile('비중', (monthlyTotal(idxs(),b)? (mrr/monthlyTotal(idxs(),b)*100).toFixed(1):'0')+'%','','전체 당월 매출 대비','cv_mrr'))}`+
    tpl`</div>`;
  if(key==='cnpub'){
    var histC={}, valid={}, pubBad={}, othGov={}, indGov={};
    ST.DATA.rows.forEach(function(r){
      if(r.line==='Cloud'&&chOf(r)==='조달'){
        histC[r.cust]=1;
        if(!/해지|종료/.test(String(r.status||'')) && (r.endIdx==null||r.endIdx>=b)) valid[r.cust]=1;
      }
      if(r.channel==='공공') pubBad[r.cust]=1;                       // 산업군 오인 표기 — 조달 아님, 어떤 채널 집계에도 미포함
      if(chOf(r)==='조달'&&r.line!=='Cloud') othGov[r.line]=(othGov[r.line]||0)+1;
      if(r.ind==='공공'&&chOf(r)!=='조달') indGov[r.cust]=1;
    });
    var oth=Object.keys(othGov).map(function(k3){ return lline(k3)+' '+othGov[k3]+'건'; }).join(' · ');
    var pubN=Object.keys(pubBad).length;
    if(pubN||oth) h+=tpl`<section class="card c12" style="margin-bottom:16px"><h2>조달 표기 확인</h2>`+ tpl`${rawHtml(pubN? tpl`<p class="cap">⚠ 채널이 «공공»으로 입력된 고객사 ${rawHtml(pubN)}곳: ${Object.keys(pubBad).slice(0,12).join(', ')}${rawHtml(pubN>12?' 외 '+(pubN-12)+'곳':'')} — 산업군이 공공일 뿐 조달 판매가 아니면 «일반»으로, 실제 조달이면 «조달»로 수정하세요</p>`:'')}`+ tpl`${rawHtml(oth? tpl`<p class="cap">참고: Cloud NAC 외 제품의 조달 계약 ${rawHtml(oth)} — 이 화면에는 포함되지 않습니다</p>`:'')}`+
      tpl`</section>`;
  }
  h+='<div class="grid">';
  h+=tpl`<section class="card c12"><h2>월별 매출 추이<span class="ukw">천원</span></h2><p class="cap">최근 24개월 · ${def[0].replace(/^\S+ /,'')}</p><div class="chartbox h260" id="chvTrend"></div></section>`;
  h+=tpl`<section class="card c12"><h2>계약 목록<span class="ukw">천원</span></h2><div class="mtabs" id="chvMode" role="group" aria-label="목록 보기" style="margin:6px 0 8px"></div><p class="cap" id="chvCtCap"></p>`+
     tpl`<div class="dbar" style="margin-bottom:10px">`+
       tpl`<input type="search" id="chvQ" placeholder="검색 — 여러 단어로 좁히기 (예: 다원 MDR)">`+
       tpl`<button class="pill ghost" id="chvFclr" style="display:none;border-color:var(--critical);color:var(--critical)">✕ 필터 해제</button>`+
       tpl`<span class="spacer"></span><span class="mini" id="chvCnt"></span>`+
     tpl`</div>`+
     tpl`<div class="tbl-wrap" tabindex="0" style="max-height:460px"><table id="chvCt" class="dgrid"></table></div></section>`;
  h+='</div>';
  host.innerHTML=h;
  kxWire(host, {
    cv_mrr:function(){ kxMrr(list, b, def[0]+' '+mk(b)+' MRR', def[0]+' 사업 영역'); },
    cv_cust:function(){ kxCustMrr(list, b, def[0]+' 고객사', def[0]+' 사업 영역'); },
    cv_live:function(){ kxLive(lv||[], def[0]+' LIVE 고객사', def[0]+' 사업 영역 · '+liveGroupNote(key).replace(/<[^>]+>/g,'')); },
    cv_eq:function(){ switchView('assets'); }
  });

  // 추이 차트
  var from=Math.max(0,b-23), labels=[], data=[];
  for(var j=from;j<=b;j++){ labels.push(mk(j)); data.push(monthlyTotal(list,j)); }
  try{
    Viz.lines($('#chvTrend'),{labels:labels,series:[{label:def[0].replace(/^\S+ /,''),data:data,color:cssv('--s1')}],fmt:won,tipFmt:wonFull,fill:true});
  }catch(e){ $('#chvTrend').innerHTML='<p class="cap">데이터가 없습니다</p>'; }

  // 계약 테이블 — 고객사별 «최신 1건» 만, 나머지는 고객사 클릭으로
  CHV.key=key; CHV.q=''; CHV.filters={}; CHV.b=b;
  try{ var m0=localStorage.getItem('svc_chv_mode'); CHV.mode=(m0==='next'||m0==='all')? m0 : 'cur'; }catch(e){ CHV.mode='cur'; }
  CHV.sortK= CHV.mode==='cur'? 'sum' : (CHV.mode==='next'? 'start':'cust'); CHV.sortDir= CHV.mode==='cur'? -1 : 1;
  CHV.all=list.map(function(k){ return ST.DATA.rows[k]; });
  CHV.kOf=new Map(); list.forEach(function(k){ CHV.kOf.set(ST.DATA.rows[k], k); });
  $('#chvQ').oninput=function(){ renderChvTable(); };
  $('#chvFclr').onclick=function(){ CHV.filters={}; renderChvTable(); };
  renderChvTable();

}