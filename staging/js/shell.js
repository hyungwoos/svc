/* ===== shell.js — 커맨드 센터(레일·커맨드 바·인박스·홈 위계) · 데이터 빌드(buildFromRes) · 고객 360 보강 · 토스트 · 제한 역할 · 로그인 화면 =====
   ES 모듈(㊿+153) — 다른 파일의 이름은 아래 import 로만 씀 · 이 파일의 최상위 var/function 은 전부 export · 즉시 실행 문장은 js/init.js 의 start() 에 */
import { IS_QA, ST } from './state.js';
import { Viz } from './viz.js';
import { $, applyPerms, canView, canWrite, clearSess, cssv, el, isCC, keepLogin, LIVE2CODE, lline, loadPerms, mfaGate, mfaVerifiedOf,
  mfaWarnIfNeeded, mk, monOf, navText, permWriteGuard, refreshToken, restoreSess, saveSess, SB_KEY, SB_URL, seriesColor, sessRead, sessWrite, STATE,
  won } from './core.js';
import { buildControls, esc, expN, goWidget, hbars, idxs, renderAll, renderInstall, renderKpis, renderMatrix } from './dash.js';
import { ask } from './ai.js';
import { applyCodes, loadCodes } from './grids.js';
import { eqOrderById, eqRetSet, eqScan, eqSerialsHtml, eqWant, syncOrderAssets } from './equipment.js';
import { applyChannelMenu, chOf, dcSummary, ensureLeadSrc, liveData, openRenewList, renewScan } from './analysis.js';
import { applyMenuConf, fkNorm, menuSegments, navSub, openCust360, openMenuEdit, renderTodo, subgrpSync } from './tools.js';
import { loadInbound, loadMxMemos } from './inbound.js';
import { UPD, updCheck } from './upd.js';
import { applyMenuFold, closeDrawer, ensureGroupOpen, setupSide } from './sales.js';
import { btnBackSync, loadHide, NAV, navMenu, renderGrid, switchView } from './grid.js';
import { closeOvl, logChange, openOvl, OVL_SKIP_CLEAN, ovlMarkClean, setupEdit } from './edit.js';


/* ==================================================================
   커맨드 센터 (v5) — 아이콘 레일 · 커맨드 바 · 인박스 홈 · 운영 보드 · 고객 360 패널 · 모바일 탭
   ================================================================== */
/* 이 창에서 한 번만 하는 일 표시 (㊿+154: 예전 window.__ccInbLoad · __editInit · __pwaStart) */
export var SHELL_ONCE={inb:0, edit:0, pwa:0};
export var ICO={
  home:'<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  chart:'<path d="M4 19h16"/><path d="M6 16V9"/><path d="M11 16V5"/><path d="M16 16v-6"/>',
  cloud:'<path d="M7 18a4 4 0 0 1-.6-7.95A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/>',
  shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  layers:'<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  box:'<path d="M3 8l9-4 9 4-9 4-9-4z"/><path d="M3 8v8l9 4 9-4V8"/><path d="M12 12v8"/>',
  flask:'<path d="M9 3h6"/><path d="M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  inbox:'<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l2 3h4l2-3h5"/>',
  scale:'<path d="M12 3v18"/><path d="M5 8l7-3 7 3"/><path d="M3 14l2-6 2 6a2 2 0 0 1-4 0z"/><path d="M17 14l2-6 2 6a2 2 0 0 1-4 0z"/>',
  tool:'<path d="M21 7a5 5 0 0 1-6.6 4.7L6 20l-2-2 8.3-8.4A5 5 0 0 1 17 3l-3 3 2 2 3-3z"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="M4.9 4.9l2.1 2.1"/><path d="M17 17l2.1 2.1"/><path d="M4.9 19.1L7 17"/><path d="M17 7l2.1-2.1"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  spark:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check:'<path d="M5 12l5 5L20 7"/>',
  menu:'<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  board:'<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="9.5" y="4" width="5" height="10" rx="1"/><rect x="16" y="4" width="5" height="13" rx="1"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5a5 5 0 0 1 6 5"/>',
  arrow:'<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
  doc:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 13h6"/><path d="M9 17h6"/>'
};
export function ico(name, size){ size=size||18; return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(ICO[name]||ICO.doc)+'</svg>'; }
export function iconFor(label, v){
  var L=String(label||'');
  if(v==='dash') return 'home'; if(v==='weekly') return 'calendar'; if(v==='account') return 'user'; if(v==='eqboard') return 'board';
  if(/^사업 영역$/.test(L)) return 'layers';
  if(/전체 데이터|계약|매출/.test(L)) return 'chart';
  if(/Cloud NAC|CLOUD/i.test(L)) return 'cloud';
  if(/MDR/.test(L)) return 'shield';
  if(/기타|유통/.test(L)) return 'layers';
  if(/장비/.test(L)) return 'box';
  if(/PoC|POC|데모/.test(L)) return 'flask';
  if(/영업|OI/.test(L)) return 'target';
  if(/인바운드/.test(L)) return 'inbox';
  if(/정산|목표/.test(L)) return 'scale';
  if(/도구/.test(L)) return 'tool';
  if(/관리자/.test(L)) return 'gear';
  if(/주간|회의/.test(L)) return 'calendar';
  return 'doc';
}
export function visBtn(b){ return !!b && !b.classList.contains('mhide') && !b.classList.contains('pdeny') && b.style.display!=='none'; }

/* ---- 아이콘 레일 (사이드바 구조 menuSegments() 를 그대로 따라 만듦 · 메뉴 편집/채널 숨김 반영) ---- */
export function buildRail(){
  var rail=document.getElementById('rail'); if(!rail || !isCC()) return;
  var segs=[]; try{ segs=menuSegments(); }catch(e){}
  var h='<div class="rlogo" data-v="dash" title="홈 (대시보드)">G</div>';
  h+='<button type="button" data-v="dash" title="홈" aria-label="홈">'+ico('home')+'</button>';
  segs.forEach(function(s){
    if(s.grp){
      if(s.grp.classList.contains('mhide')) return;
      var vis=s.buttons.filter(visBtn); if(!vis.length) return;
      h+='<button type="button" data-seg="'+esc(s.key)+'" title="'+esc(s.label)+'" aria-label="'+esc(s.label)+'" aria-haspopup="menu">'+ico(iconFor(s.label))+'</button>';
    }else{
      if(!visBtn(s.btn)) return;
      var t=navText(s.btn);
      h+='<button type="button" data-v="'+esc(s.btn.dataset.v)+'" title="'+esc(t)+'" aria-label="'+esc(t)+'">'+ico(iconFor(t, s.btn.dataset.v))+'</button>';
    }
  });
  h+='<div class="rsp"></div>';
  h+='<button type="button" data-v="account" title="내 계정 · 설정" aria-label="내 계정">'+ico('gear')+'</button>';
  h+='<div class="ravatar" data-v="account" title="'+esc(ST.AUTH_USER||'')+'">'+esc(((ST.AUTH_USER||'?').split('@')[0]).slice(0,1).toUpperCase())+'</div>';
  rail.innerHTML=h;
  rail.querySelectorAll('[data-v]').forEach(function(b){ b.onclick=function(){ railFlyClose(); navMenu(b.dataset.v); }; });
  rail.querySelectorAll('[data-seg]').forEach(function(b){ b.onclick=function(e){ e.stopPropagation(); railFlyToggle(b, b.dataset.seg); }; });
  railSync(ST.CUR_VIEW);
}
export var RAIL_OPEN=null;
export function railFlyClose(){ var f=document.getElementById('railFly'); if(f) f.classList.remove('on'); RAIL_OPEN=null; }
export function railFlyToggle(btn, key){
  var f=document.getElementById('railFly'); if(!f) return;
  if(RAIL_OPEN===key){ railFlyClose(); return; }
  var seg=menuSegments().filter(function(s){ return s.key===key; })[0]; if(!seg) return;
  /* ㊿+142: 그룹 안 소제목(사업 영역 › Cloud NAC/MDR/기타)도 플라이아웃에 — 보이는 메뉴가 있는 소제목만 */
  var its=(seg.items||seg.buttons||[]).filter(function(el){ return el.tagName==='BUTTON'? visBtn(el) : !el.classList.contains('sub-empty'); });
  f.innerHTML='<div class="fh">'+esc(seg.label)+'</div>'+its.map(function(b){
    if(b.tagName!=='BUTTON') return '<div class="fsub">'+esc(b.textContent.trim())+'</div>';
    return '<button type="button" data-v="'+esc(b.dataset.v)+'" aria-current="'+(b.dataset.v===ST.CUR_VIEW)+'">'+esc(navText(b))+'</button>'; }).join('');
  f.querySelectorAll('button').forEach(function(b){ b.onclick=function(){ railFlyClose(); navMenu(b.dataset.v); }; });
  var r=btn.getBoundingClientRect();
  f.style.top='0px'; f.classList.add('on'); RAIL_OPEN=key;
  var top=Math.max(8, Math.min(r.top, window.innerHeight - f.offsetHeight - 12));
  f.style.top=top+'px';
}


export function railSync(v){
  var rail=document.getElementById('rail'); if(!rail) return;
  var segs=[]; try{ segs=menuSegments(); }catch(e){}
  var inSeg={}; segs.forEach(function(s){ if(s.grp && s.buttons.some(function(b){ return b.dataset.v===v; })) inSeg[s.key]=1; });
  rail.querySelectorAll('button').forEach(function(b){
    var cur = b.dataset.v? (b.dataset.v===v) : !!inSeg[b.dataset.seg];
    b.setAttribute('aria-current', cur? 'true':'false');
  });
  /* 장비 그룹에 처리 대기 건수 배지 */
  var pend=(ST.RAWX.orders||[]).filter(function(o){ return ['접수','출하요청','배송중'].indexOf(o.status)>=0; }).length;
  rail.querySelectorAll('[data-seg]').forEach(function(b){
    var old=b.querySelector('.rb'); if(old) old.remove();
    if(/장비/.test(b.dataset.seg) && pend){ var s=document.createElement('span'); s.className='rb'; s.textContent=pend>99?'99+':pend; b.appendChild(s); }
  });
  mtabsSync(v);
}

/* ---- 모바일 하단 탭 (≤760px) ---- */
export function buildMtabs(){
  var m=document.getElementById('mtabs'); if(!m) return;
  var tabs=[['dash','홈','home'],['contracts','매출','chart'],[ST.IS_EQUIP? 'orders':'eqboard','장비','box'],['weekly','주간회의','calendar'],['_menu','전체','menu']];
  if(ST.IS_EQUIP) tabs[1]=['assets','현황','layers'];
  tabs=tabs.filter(function(t){ return t[0]==='_menu' || canView(t[0]); });
  m.innerHTML=tabs.map(function(t){ return '<button type="button" data-v="'+t[0]+'" aria-current="false">'+ico(t[2],20)+esc(t[1])+'</button>'; }).join('');
  m.querySelectorAll('button').forEach(function(b){
    b.onclick=function(){
      if(b.dataset.v==='_menu'){ var open=document.getElementById('side').classList.toggle('open'); document.getElementById('sideDim').classList.toggle('on', open); return; }
      closeDrawer(); navMenu(b.dataset.v);
    };
  });
  mtabsSync(ST.CUR_VIEW);
}
export function mtabsSync(v){
  var m=document.getElementById('mtabs'); if(!m) return;
  m.querySelectorAll('button').forEach(function(b){ b.setAttribute('aria-current', b.dataset.v===v? 'true':'false'); });
}

/* ---- 커맨드 바 → 전역 검색 창 (화면 이동 + 데이터 검색 + AI 질문) ---- */
export function cmdMenuHits(q){
  var out=[], qn=fkNorm(q);
  if(!qn) return out;
  document.querySelectorAll('#side button[data-v]').forEach(function(b){
    if(!visBtn(b) && b.dataset.v!=='dash' && b.dataset.v!=='account') return;
    var sub=navSub(b), t=(sub? sub+' · ':'')+navText(b); if(fkNorm(t).indexOf(qn)<0) return;   /* ㊿+142: «MDR · 일반 판매» 처럼 소제목을 붙여 구분 */
    if(ST.IS_EQUIP && !EQUIP_VIEWS[b.dataset.v]) return;
    out.push({t:'이동', nm:t, sb:'화면 열기', go:(function(v){ return function(){ navMenu(v); }; })(b.dataset.v), kmenu:1});
  });
  return out.slice(0,5);
}
export function cmdAskHit(q){
  q=String(q||'').trim(); if(q.length<2 || ST.IS_EQUIP) return null;
  return {t:'AI', nm:'«'+q+'» 물어보기', sb:'매출·고객·계약 데이터를 기준으로 답합니다 (Enter 대신 클릭)', kai:1,
    go:function(){ switchView('dash'); var qi=document.getElementById('q'); if(qi){ qi.value=q; } try{ ask(q); }catch(e){} try{ document.querySelector('.ask').scrollIntoView({block:'start',behavior:'smooth'}); }catch(e){} }};
}

/* ---- 홈: 인사 · 인박스 ---- */
export function ccGreeting(n){   /* 인사말 카드는 쓰지 않음 — 인박스 머리에 건수·읽은 시각만 (예전 본문은 ㊿+147 에서 정리) */
  var el0=document.getElementById('ccHi'); if(el0) el0.style.display='none';
}
export function ccSnoozed(key){ try{ var u=localStorage.getItem('svc_snz_'+key); return !!u && u>=todayStr(); }catch(e){ return false; } }
export function ccSnooze(key, days){
  var d=new Date(); d.setDate(d.getDate()+days);
  try{ localStorage.setItem('svc_snz_'+key, todayStr(d)); }catch(e){}
  renderInbox(); toast('보류했습니다', days>=7? '다음 주에 다시 알려드립니다':'내일 다시 알려드립니다', 'info');
}
export function ccUnsnooze(){ try{ Object.keys(localStorage).filter(function(k){ return k.indexOf('svc_snz_')===0; }).forEach(function(k){ localStorage.removeItem(k); }); }catch(e){} renderInbox(); }
export function renderInbox(){
  if(!isCC()) return;
  var box=document.getElementById('ccInbox'); if(!box || !ST.DATA || !ST.SB_TOKEN){ if(box) box.innerHTML=''; return; }
  var list=idxs(), b=STATE.base, EN=expN(), EQ=!!ST.IS_EQUIP;
  var orders=ST.RAWX.orders||[];
  var pendL=orders.filter(function(o){ return ['접수','출하요청','배송중'].indexOf(o.status)>=0; });
  var retL=orders.filter(function(o){ return o.status==='회수예정'; });
  var expL=[], expAmt=0;
  if(!EQ) list.forEach(function(k){ var r=ST.DATA.rows[k], e=r.endIdx;
    if(e!=null && e>=b && e<=b+EN-1 && !/해지|종료|CN전환/.test(String(r.status||''))){ expL.push(r); expAmt+=ST.MAT[k][Math.min(e,ST.M-1)]||r.mrr||0; } });
  var curYm=monOf(b)+'월', bizDone=EQ || (ST.RAWX.biz||[]).some(function(r){ return r.ym===curYm; });
  var todayS=todayStr();
  var oiLate=EQ? [] : (ST.RAWX.oi||[]).filter(function(o){ return o.next_date && String(o.next_date).slice(0,10)<todayS && !/수주|실패/.test(String(o.stage||'')); });
  var inbN=EQ? 0 : (ST.INB_TODO? ST.INB_TODO.n : null);
  var dow=new Date().getDay(), toMon=(8-dow)%7, wkTxt= dow===1? '오늘':'D-'+(toMon===0?7:toMon);
  var rows=[], zeros=[], snz=0;
  function add(key, o){ if(ccSnoozed(key)){ snz++; return; } o.key=key; rows.push(o); }
  function names(arr, f, n){ var u={}; arr.forEach(function(x){ var v=f(x); if(v) u[v]=1; }); var ks=Object.keys(u); return ks.slice(0,n||3).join(', ')+(ks.length>(n||3)? ' 외 '+(ks.length-(n||3))+'곳':''); }
  if(pendL.length){
    var oldest=pendL.map(function(o){ return String(o.created_at||'').slice(0,10); }).filter(Boolean).sort()[0];
    var age=oldest? Math.floor((new Date(todayS)-new Date(oldest))/864e5) : 0;
    var byCh={}; pendL.forEach(function(o){ byCh[o.channel||'기타']=(byCh[o.channel||'기타']||0)+1; });
    add('eq', {ic:'box', cls:'warn', t:'처리 대기 장비 신청 <span class="num">'+pendL.length+'건</span>'+(age>=1? ' — 가장 오래된 건 '+age+'일 경과':''),
      s:Object.keys(byCh).map(function(c){ return c+' '+byCh[c]; }).join(' · ')+' · '+names(pendL, function(o){ return o.customer; }),
      acts:[{l:'보류', go:function(){ ccSnooze('eq',1); }},{l:'장비 대시보드 →', pri:1, go:function(){ switchView('eqboard'); }}]});
  }
  if(retL.length){
    add('ret', {ic:'box', cls:'info', t:'회수 진행 중 <span class="num">'+retL.length+'건</span>',
      s:retL.slice(0,3).map(function(o){ var all=eqWant(o).length, d=eqRetSet(o).length; return (o.customer||'')+' '+d+'/'+all+'대'; }).join(' · ')+(retL.length>3? ' 외 '+(retL.length-3)+'건':''),
      acts:[{l:'장비 대시보드 →', pri:1, go:function(){ switchView('eqboard'); }}]});
  }
  /* 만기 관리 (㊿+127): 종료월이 지났는데 미처리 → 이미 LIVE 에서 빠짐 · 이달 만기 → 다음 달 1일에 빠짐. 각 행 원클릭 처리 창으로 */
  var RS=null; if(!EQ){ try{ RS=renewScan(b); }catch(e){ RS=null; } ensureLeadSrc(function(filled){ if(filled) try{ renderInbox(); renderKpis(); }catch(e2){} }); }
  if(RS && RS.lapsed.length){
    var lsum=RS.lapsed.reduce(function(a,r){ return a+(r.mrr||0); },0), lrec=RS.checking.length;
    add('rnl', {ic:'clock', cls:'crit', t:'만기 지났는데 미처리 <span class="num">'+RS.lapsed.length+'건</span> — 이미 LIVE 에서 빠졌습니다'+(lrec? ' (최근 2개월 '+lrec+'건)':''),
      s:names(RS.lapsed, function(r){ return r.cust; })+' · 월 '+won(lsum)+'천원 · 연장이면 되살리고, 끝났으면 서비스종료·해지로 정리',
      acts:[{l:'처리하기 →', pri:1, go:function(){ openRenewList('lapsed'); }}]});
  }
  if(RS && RS.due.length){
    var dsum=RS.due.reduce(function(a,r){ return a+(r.mrr||0); },0);
    add('rnd', {ic:'clock', cls:'warn', t:mk(b)+' 만기 <span class="num">'+RS.due.length+'건</span> — '+mk(b+1)+' 1일 LIVE 에서 빠집니다',
      s:names(RS.due, function(r){ return r.cust; })+' · 월 '+won(dsum)+'천원'+(RS.next.length? ' · 다음 달 만기 '+RS.next.length+'건 대기':''),
      acts:[{l:'보류', go:function(){ ccSnooze('rnd',3); }},{l:'처리하기 →', pri:1, go:function(){ openRenewList('due'); }}]});
  }
  /* 데이터 점검 (㊿+133): 바로 고쳐야 할 항목이 있으면 한 줄 */
  if(!EQ){ var DS=null; try{ DS=dcSummary(); }catch(e){}
    if(DS && DS.crit){ add('dc', {ic:'scale', cls:'crit', t:'데이터 점검 — 바로 고칠 항목 <span class="num">'+DS.crit+'건</span>'+(DS.warn? ' · 확인 필요 '+DS.warn+'건':''),
      s:Object.keys(DS.items).filter(function(k){ return DS.items[k]; }).slice(0,3).map(function(k){ return k+' '+DS.items[k]; }).join(' · '),
      acts:[{l:'보류', go:function(){ ccSnooze('dc',3); }},{l:'점검 화면 →', pri:1, go:function(){ switchView('dcheck'); }}]}); } }
  if(expL.length && !(RS && EN===1 && RS.due.length)){
    var ends=expL.map(function(r){ return r.endIdx; }).sort(function(x,y){ return x-y; });
    add('exp', {ic:'clock', cls:'info', t:EN+'개월 내 만료 계약 <span class="num">'+expL.length+'건</span> — <span class="num">'+won(expAmt)+'</span>천원/월',
      s:names(expL, function(r){ return r.cust; })+' · 종료 '+mk(ends[0])+(ends.length>1? '~'+mk(ends[ends.length-1]):'')+' · 재약정 타깃',
      acts:[{l:'고객 360', go:function(){ if(expL.length===1) openCust360(expL[0].cust); else goWidget('exp','계약 만료 예정'); }},{l:'재계약 타진', pri:1, go:function(){ goWidget('exp','계약 만료 예정'); }}]});
  }
  if(!bizDone){
    add('biz', {ic:'scale', cls:'', t:curYm+' 비즈포탈 차액이 아직 입력되지 않았습니다', s:'엑셀을 올리면 고객사·회계매출 기준으로 자동 대조합니다',
      acts:[{l:'다음 주에', go:function(){ ccSnooze('biz',7); }},{l:'엑셀 올리기', pri:1, go:function(){ switchView('biz'); }}]});
  }
  if(!EQ){
    if(inbN>0) add('inb', {ic:'inbox', cls:'crit', t:'인바운드 미대응 <span class="num">'+inbN+'건</span>', s:'진행중인데 3개월 이상 대응 기록이 없습니다', acts:[{l:'인바운드 통계 →', pri:1, go:function(){ switchView('inbstat'); }}]});
    else zeros.push('인바운드 미대응 '+(inbN==null? '…':'0'));
    if(oiLate.length) add('oi', {ic:'target', cls:'warn', t:'OI 밀린 액션 <span class="num">'+oiLate.length+'건</span>', s:names(oiLate, function(o){ return o.customer; })+' · 다음 일정이 지났습니다', acts:[{l:'OI 현황 →', pri:1, go:function(){ switchView('oi'); }}]});
    else zeros.push('OI 밀린 액션 0');
  }
  zeros.push('주간회의 '+wkTxt);
  var la=document.getElementById('loadedAt');
  var h='<div class="ib-head"><h2>인박스 <span class="ctag'+(rows.length?' warn':' ok')+'">'+rows.length+'</span></h2><span class="mini" style="display:flex;align-items:center;gap:6px"><i style="width:7px;height:7px;border-radius:50%;background:var(--brand);display:inline-block"></i>'+(la&&la.textContent? esc(la.textContent):'')+' · 자동 갱신</span></div>';
  if(!rows.length) h+='<div class="ib-empty"><span class="ib-ic ok">'+ico('check',16)+'</span>처리할 알림이 없습니다. 모든 항목이 정리되어 있어요.</div>';
  rows.forEach(function(o,i){
    h+='<div class="ib-row" data-i="'+i+'"><span class="ib-ic '+o.cls+'">'+ico(o.ic,16)+'</span><div class="ib-b"><div class="ib-t">'+o.t+'</div><div class="ib-s" title="'+esc(o.s||'')+'">'+esc(o.s||'')+'</div></div>'+
      '<div class="ib-acts">'+o.acts.map(function(a,j){ return '<button type="button" class="cbtn'+(a.pri?' pri':'')+'" data-i="'+i+'" data-j="'+j+'">'+esc(a.l)+'</button>'; }).join('')+'</div></div>';
  });
  h+='<div class="ib-foot"><span>'+zeros.map(esc).join(' · ')+'</span>'+(snz? '<a id="ibUnsnz">보류한 '+snz+'건 다시 보기</a>':'<span class="mini">주간회의는 매주 월요일 · 일요일 저녁 자동 취합</span>')+'</div>';
  box.innerHTML=h;
  box.querySelectorAll('.cbtn').forEach(function(bt){ bt.onclick=function(e){ e.stopPropagation(); rows[+bt.dataset.i].acts[+bt.dataset.j].go(); }; });
  var un=document.getElementById('ibUnsnz'); if(un) un.onclick=ccUnsnooze;
  ccGreeting(rows.length);
  try{ railSync(ST.CUR_VIEW); }catch(e){}
}

/* ---- 홈: KPI 뒤처리 — 첫 타일을 히어로로, 목표 막대 병합, 벤토 타일 추가 ---- */
export function ccAfterKpis(box, list, b){
  if(!isCC()) return;
  var host=document.getElementById('ccHeroHost'); if(!host || !box.children.length) return;
  var gb0=document.getElementById('goalBar'); if(gb0 && host.contains(gb0)) box.parentElement.insertBefore(gb0, box);   /* 히어로를 비우기 전에 목표 막대를 꺼내 둠 */
  var hero=box.children[0]; host.innerHTML=''; host.appendChild(hero); hero.classList.add('cc-hero');
  /* 연환산 ARR 타일은 히어로 안 한 줄로 */
  var arr=box.children[0];
  if(arr && /연환산 ARR|기말 MRR/.test((arr.querySelector('.k')||{}).textContent||'')){
    var line=document.createElement('div'); line.className='arr'; line.innerHTML=esc(arr.querySelector('.k').textContent)+' <b class="num">'+(arr.querySelector('.v')||{}).innerHTML+'</b>'; arr.remove(); hero.appendChild(line);
  }
  var gb=document.getElementById('goalBar'); if(gb) hero.appendChild(gb);
  /* LIVE 타일에 제품별 막대 */
  try{
    var lt=[].slice.call(box.children).filter(function(c){ return /^LIVE|^활성 고객사/.test((c.querySelector('.k')||{}).textContent||''); })[0];
    var lv=liveData(b);
    if(lt && lv && lv.ok){
      var per={}; lv.rows.forEach(function(x){ (per[x.line]=per[x.line]||{})[x.cust]=1; });
      var arr2=Object.keys(per).map(function(l){ return [l, Object.keys(per[l]).length]; }).sort(function(x,y){ return y[1]-x[1]; }).slice(0,3);
      var mx=arr2.length? arr2[0][1]:1, cols={};
      (ST.DATA.lines||[]).forEach(function(l){ cols[l.label]=seriesColor(l.color); });
      var w=document.createElement('div'); w.style.marginTop='6px';
      w.innerHTML=arr2.map(function(x){ return '<div class="mbar"><span class="l">'+esc(lline(x[0]))+'</span><span class="t"><i style="width:'+Math.round(x[1]/mx*100)+'%;background:'+(cols[x[0]]||'var(--s1)')+'"></i></span><span class="n num">'+x[1]+'</span></div>'; }).join('');
      lt.appendChild(w);
    }
  }catch(e){}
  /* 전년 대비 타일 → 히어로 한 줄 */
  try{
    var yoy=[].slice.call(box.children).filter(function(c){ return /전년/.test((c.querySelector('.k')||{}).textContent||''); })[0];
    if(yoy){ var hd=hero.querySelector('.d'), vv=yoy.querySelector('.v'), yd=yoy.querySelector('.d');
      if(hd && vv){ var sp=document.createElement('span'); sp.className='yoy';
        sp.innerHTML=(hd.textContent.trim()? ' · ':'')+esc(yoy.querySelector('.k').textContent)+' <b class="'+(yd&&yd.classList.contains('up')?'up':(yd&&yd.classList.contains('down')?'down':''))+'">'+vv.innerHTML+'</b>'; hd.appendChild(sp); }
      yoy.remove(); }
  }catch(e){}
  /* 1차 타일 4개: LIVE · 신규/해지 · 만료 · 장비 운영 */
  try{ box.appendChild(ccTileEquip()); }catch(e){}
  /* 2차 «지표 더 보기»: 채널별 MRR · 파이프라인 · 주간회의 */
  var more=ccMoreHost(box);
  if(more){ more.innerHTML='';
    try{ more.appendChild(ccTileChannel(list,b)); }catch(e){}
    if(!ST.IS_EQUIP){ try{ more.appendChild(ccTilePipe()); }catch(e){} }
    try{ more.appendChild(ccTileWeekly()); }catch(e){}
    var mc=document.getElementById('ccMoreCnt'); if(mc) mc.textContent=more.children.length+'개 — 채널별 MRR · 파이프라인 · 주간회의'; }
  try{ ccBrief(list,b); }catch(e){}
  try{ ccAnaCount(); }catch(e){}
}
/* ---- 홈 위계: 접힘 섹션 (지표 더 보기 · 분석) — 상태는 이 브라우저에 기억 ---- */
export function ccPref(k){ try{ return localStorage.getItem(k)==='1'; }catch(e){ return false; } }
export function ccPrefSet(k,v){ try{ if(v) localStorage.setItem(k,'1'); else localStorage.removeItem(k); }catch(e){} }
export function ccMoreHost(kpis){
  var m=document.getElementById('ccMore');
  if(!m){
    m=document.createElement('div'); m.id='ccMore';
    m.innerHTML='<button type="button" class="cc-anah" id="ccMoreBtn" aria-expanded="false"><span>지표 더 보기</span><span class="mini" id="ccMoreCnt"></span><span class="chev">▾</span></button><div class="kpis" id="ccMoreTiles"></div>';
    kpis.parentNode.insertBefore(m, kpis.nextSibling);
    m.querySelector('#ccMoreBtn').onclick=function(){ var o=!m.classList.contains('open'); m.classList.toggle('open', o); this.setAttribute('aria-expanded', o? 'true':'false'); ccPrefSet('svc_cc_more', o); };
    if(ccPref('svc_cc_more')){ m.classList.add('open'); m.querySelector('#ccMoreBtn').setAttribute('aria-expanded','true'); }
  }
  return m.querySelector('#ccMoreTiles');
}
export function ccHomeLayout(){
  if(!isCC() || document.getElementById('ccAnalysis')) return;
  var vd=document.getElementById('viewDash'); if(!vd) return;
  var flt=vd.querySelector('.filters'), grid=vd.querySelector('.grid'); if(!flt||!grid) return;
  var sec=document.createElement('section'); sec.id='ccAnalysis'; sec.className='cc-ana';
  sec.innerHTML='<button type="button" class="cc-anah" id="ccAnaBtn" aria-expanded="false"><span>분석 — 차트 · 표 · 필터</span><span class="mini" id="ccAnaCnt"></span><span class="chev">▾</span></button><div class="cc-anab" id="ccAnaBody"></div>';
  grid.parentNode.insertBefore(sec, grid);
  var body=sec.querySelector('#ccAnaBody'); body.appendChild(flt); body.appendChild(grid);
  sec.querySelector('#ccAnaBtn').onclick=function(){ ccAnalysisOpen(!sec.classList.contains('open')); };
  ccAnalysisOpen(ccPref('svc_cc_ana'), true);
}
export function ccAnalysisOpen(open, silent){
  var sec=document.getElementById('ccAnalysis'); if(!sec) return;
  sec.classList.toggle('open', !!open);
  var b=document.getElementById('ccAnaBtn'); if(b) b.setAttribute('aria-expanded', open? 'true':'false');
  ccPrefSet('svc_cc_ana', !!open);
  if(open && !silent && ST.DATA){ requestAnimationFrame(function(){ try{ renderAll(); }catch(e){} }); }
}
export function ccAnaCount(){
  var c=document.getElementById('ccAnaCnt'); if(!c) return;
  var n=document.querySelectorAll('#viewDash .grid > section:not(.w-off)').length;
  c.textContent=(n? n+'개 위젯 · ':'')+'서비스·기간·산업군 필터 · 월별 종합 장표 · 계약 목록';
}
export function ccTileChannel(list,b){
  var m={}, tot=0; list.forEach(function(k){ var a=ST.MAT[k][b]||0; if(!a) return; var c=chOf(ST.DATA.rows[k]); m[c]=(m[c]||0)+a; tot+=a; });
  var arr=Object.keys(m).map(function(c){ return [c,m[c]]; }).sort(function(x,y){ return y[1]-x[1]; });
  var top=arr.slice(0,4), cols=['var(--ink)','var(--ink-2)','var(--muted)','var(--axis)'];
  var c=el('div','kpi');
  c.innerHTML='<div class="k">채널별 MRR <span class="mini">'+esc(mk(b))+'</span></div>'+
    '<div class="stk">'+top.map(function(x,i){ return '<i style="width:'+(tot? x[1]/tot*100:0)+'%;background:'+cols[i]+'"></i>'; }).join('')+'</div>'+
    '<div class="mlist">'+top.map(function(x,i){ return '<div class="mrow"><span><i style="background:'+cols[i]+'"></i>'+esc(x[0])+'</span><span class="num">'+won(x[1])+'</span></div>'; }).join('')+'</div>'+
    '<div class="d" style="margin-top:auto;padding-top:6px">단위 천원'+(top[0]&&tot? ' · '+esc(top[0][0])+' 비중 '+Math.round(top[0][1]/tot*100)+'%':'')+(arr.length>4? ' · 외 '+(arr.length-4)+'개 채널':'')+'</div>';
  c.style.cursor='pointer'; c.title='채널별 매출 — 누르면 계약 목록'; c.setAttribute('role','button'); c.tabIndex=0;
  c.onclick=function(){ switchView('contracts'); };
  return c;
}
export function ccTileEquip(){
  var A=ST.RAWX.assets||[], O=ST.RAWX.orders||[];
  var lent=A.filter(function(a){ return a.status==='임대중'; }).length, stock=A.filter(function(a){ return a.status==='재고'; }).length;
  var live=O.filter(function(o){ return o.status!=='회수완료' && o.status!=='취소'; });
  var prog=live.filter(function(o){ return o.status==='회수예정' || eqRetSet(o).length; });
  var s=null; try{ s=eqScan(); }catch(e){}
  var tag= s? (s.gap.length? '<span class="ctag warn">맞지 않음 '+s.gap.length+'</span>':'<span class="ctag ok">신청 ↔ 현황 일치</span>') : '';
  var first=prog[0], ph='';
  if(first){ var all=eqWant(first), done=eqRetSet(first).length;
    ph='<div class="mrow" style="margin-top:8px;font-size:12px"><span>'+esc(first.customer||'')+' · 회수</span><span class="num mini">'+done+'/'+all.length+'대</span></div><div class="eqb-prog">'+all.map(function(sn,i){ return '<i class="'+(i<done?'on':'')+'"></i>'; }).join('')+'</div>'; }
  var c=el('div','kpi');
  c.innerHTML='<div class="k">임대 장비 운영 '+tag+'</div>'+
    '<div class="tri"><div><b class="num">'+lent+'</b><span>임대중</span></div><div><b class="num">'+stock+'</b><span>재고</span></div><div><b class="num" style="color:'+(prog.length?'var(--warn-ink)':'inherit')+'">'+prog.length+'</b><span>회수 진행</span></div></div>'+ph+
    '<div class="d" style="margin-top:auto;padding-top:6px;color:var(--s1-ink);font-weight:500">장비 대시보드 →</div>';
  c.style.cursor='pointer'; c.title='임대 장비 대시보드 (클릭)'; c.setAttribute('role','button'); c.tabIndex=0;
  c.onclick=function(){ switchView('eqboard'); };
  return c;
}
export function ccTilePipe(){
  var oi=ST.RAWX.oi||[], today=new Date(), ym=today.getFullYear()+'-'+('0'+(today.getMonth()+1)).slice(-2);
  var open=oi.filter(function(o){ return !/수주|계산서|종료|중지|실패/.test(String(o.stage||'')); });
  var due=open.filter(function(o){ return String(o.expect_month||'').slice(0,7)===ym; });
  var st={}; open.forEach(function(o){ var k=String(o.stage||'기타'); st[k]=(st[k]||0)+1; });
  var wk=new Date(today); wk.setDate(wk.getDate()-7); var wkS=todayStr(wk);
  var inb=ST.RAWX.inbound===undefined? null : (ST.RAWX.inbound||[]).filter(function(r){ return String(r.on_date||'').slice(0,10)>=wkS; }).length;
  if(ST.RAWX.inbound===undefined && !SHELL_ONCE.inb){ SHELL_ONCE.inb=1; try{ loadInbound(function(){ if(ST.CUR_VIEW==='dash') try{ renderKpis(); }catch(e){} }); }catch(e){} }
  var c=el('div','kpi');
  c.innerHTML='<div class="k">이번 주 파이프라인 <span class="ctag info">인바운드 자동 07:00</span></div>'+
    '<div class="tri" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div><b class="num">'+(inb==null?'…':inb)+'</b><span>최근 7일 인바운드</span></div><div><b class="num">'+open.length+'</b><span>진행 중 OI</span></div></div>'+
    '<div style="display:flex;flex-direction:column;gap:3px;font-size:12.5px;margin-top:8px">'+Object.keys(st).slice(0,3).map(function(k){ return '<div class="mrow"><span>'+esc(k)+' 단계</span><span class="num">'+st[k]+'</span></div>'; }).join('')+
    '<div class="mrow"><span>이달 계약예상</span><span class="num" style="font-weight:600">'+due.length+'</span></div></div>';
  c.style.cursor='pointer'; c.title='OI 현황 (클릭)'; c.setAttribute('role','button'); c.tabIndex=0;
  c.onclick=function(){ switchView('oi'); };
  return c;
}
export function ccTileWeekly(){
  var today=new Date(), dow=today.getDay(), toMon=(8-dow)%7; if(toMon===0) toMon=7;
  var wkTxt= dow===1? '오늘':'D-'+toMon;
  var next=new Date(today); next.setDate(next.getDate()+(dow===1? 0:toMon));
  var c=el('div','kpi');
  c.innerHTML='<div class="k">주간회의</div><div class="v">'+esc(wkTxt)+'</div>'+
    '<div class="d">'+(dow===1? '오늘 회의 · 보고 화면 열기' : (next.getMonth()+1)+'월 '+next.getDate()+'일 월요일 · 일요일 저녁 자동 취합')+'</div>'+
    '<div class="d" style="margin-top:auto;padding-top:6px;color:var(--brand);font-weight:500">주간회의 화면 →</div>';
  c.style.cursor='pointer'; c.title='주간회의 (클릭)'; c.setAttribute('role','button'); c.tabIndex=0;
  c.onclick=function(){ switchView('weekly'); };
  return c;
}
/* ---- 오늘의 브리핑 — 숫자를 문장으로 (규칙 기반 · AI 비용 없음) + «AI로 더 자세히» ---- */
export function ccBrief(list,b){   /* 오늘의 브리핑 카드는 쓰지 않음 (질문 칸·추천 질문은 그대로) — 예전 본문은 ㊿+147 에서 정리 */
  var box=document.getElementById('ccBrief'); if(box) box.style.display='none';
}

/* ==================================================================
   임대 장비 운영 보드 (칸반) — 상태 = 열, 카드 끌기 = 상태 변경 → 현황 자동 반영
   ================================================================== */
export var EQB={ch:'', q:'', more:{}};
export var EQB_COLS=[['접수','#9A9DA5','현황 재고'],['출하요청','var(--info-ink)','현황 재고'],['배송중','var(--warn-ink)','현황 재고'],['설치완료','var(--brand)','현황 임대중'],['회수예정','#D95926','칩으로 일부 회수'],['회수완료','var(--ink-2)','최근 90일']];
export function eqRefresh(){ if(ST.CUR_VIEW==='eqboard') renderEqBoard(); else try{ renderGrid(); }catch(e){} }
export var EQ_CH_CLS={'에스원':'ch-s1','LGU+':'ch-lg','LG U+':'ch-lg','조달':'ch-gov','일반':'ch-gen'};
export function eqChTag(ch){ ch=ch||'기타'; return '<span class="ctag '+(EQ_CH_CLS[ch]||'')+'">'+esc(ch)+'</span>'; }
export function eqChColor(ch){ return ({'에스원':cssv('--s1'),'LGU+':cssv('--s5'),'LG U+':cssv('--s5'),'조달':cssv('--s4'),'일반':cssv('--s3')})[ch]||cssv('--muted'); }
/* 대시보드 윗부분 — 요약 타일 6개 + 차트 3개 (현황 자산 + 신청 내역 기준) */
export function renderEqDash(){
  var K=document.getElementById('eqbKpis'); if(!K) return;
  var A=ST.RAWX.assets||[], O=ST.RAWX.orders||[], todayS=todayStr(), ym=todayS.slice(0,7);
  var pm=new Date(); pm.setMonth(pm.getMonth()-1); var pym=todayStr(pm).slice(0,7);
  var lent=A.filter(function(a){ return a.status==='임대중'; }), stock=A.filter(function(a){ return a.status==='재고'; });
  var lentCust={}; lent.forEach(function(a){ if(a.customer) lentCust[a.customer]=1; });
  var retd=A.filter(function(a){ return a.status==='회수완료'; }), retdModel={}, retdCust={}, retdLast='';
  retd.forEach(function(a){ var m=a.model||'미지정'; retdModel[m]=(retdModel[m]||0)+1; if(a.customer) retdCust[a.customer]=1; var d=String(a.returned_date||'').slice(0,10); if(d>retdLast) retdLast=d; });
  var pend=O.filter(function(o){ return ['접수','출하요청','배송중'].indexOf(o.status)>=0; });
  var pendBy={}; pend.forEach(function(o){ pendBy[o.status]=(pendBy[o.status]||0)+1; });
  var oldest=pend.map(function(o){ return String(o.created_at||'').slice(0,10); }).filter(Boolean).sort()[0];
  var age=oldest? Math.floor((new Date(todayS)-new Date(oldest))/864e5):0;
  var retL=O.filter(function(o){ return o.status==='회수예정' || (o.status!=='회수완료' && o.status!=='취소' && eqRetSet(o).length); });
  var retAll=0, retDone=0; retL.forEach(function(o){ retAll+=eqWant(o).length; retDone+=eqRetSet(o).length; });
  var instM=O.filter(function(o){ return ['설치완료','회수예정','회수완료'].indexOf(o.status)>=0 && String(o.install_date||'').slice(0,7)===ym; });
  var instP=O.filter(function(o){ return ['설치완료','회수예정','회수완료'].indexOf(o.status)>=0 && String(o.install_date||'').slice(0,7)===pym; });
  var retM=O.filter(function(o){ return o.status==='회수완료' && String(o.returned_date||'').slice(0,7)===ym; });
  var qty=function(arr){ return arr.reduce(function(a,o){ return a+(+o.qty||eqWant(o).length||1); },0); };
  function tile(cls, dot, k, v, u, d, go){
    return '<div class="kpi '+cls+'" role="button" tabindex="0" data-go="'+go+'"><div class="k">'+(dot? '<i style="background:'+dot+'"></i>':'')+esc(k)+'</div><div class="v">'+v+(u? '<small>'+u+'</small>':'')+'</div><div class="d">'+d+'</div></div>';
  }
  K.innerHTML=
    tile('good', 'var(--brand)', '임대중', lent.length, '대', '고객사 '+Object.keys(lentCust).length+'곳 · 현황 기준', 'assets:임대중')+
    tile(pend.length? (age>7? 'crit':'hot'):'', 'var(--info-ink)', '처리 대기', pend.length, '건', pend.length? ['접수','출하요청','배송중'].filter(function(k){ return pendBy[k]; }).map(function(k){ return k+' '+pendBy[k]; }).join(' · ')+(age>=1? ' · 최장 '+age+'일':'') : '대기 중인 신청 없음', 'col:접수')+
    tile(retL.length? 'hot':'', '#D95926', '회수 진행', retL.length, '건', retL.length? '회수 '+retDone+'/'+retAll+'대 · 시리얼 칩으로 처리':'진행 중인 회수 없음', 'col:회수예정')+
    tile('', 'var(--ink-2)', '회수 장비', retd.length, '대', retd.length? Object.keys(retdModel).sort(function(a,b){ return retdModel[b]-retdModel[a]; }).slice(0,3).map(function(m){ return esc(m)+' '+retdModel[m]; }).join(' · ')+' · 고객사 '+Object.keys(retdCust).length+'곳'+(retdLast? ' · 최근 '+retdLast:'') : '회수완료 장비 없음', 'assets:회수완료');
  var tc=document.getElementById('eqcTrendCap'); if(tc) tc.textContent='이달 설치 '+qty(instM)+'대 · 회수 '+qty(retM)+'대 · 지난달 설치 '+qty(instP)+'대 · 최근 12개월';
  K.querySelectorAll('[data-go]').forEach(function(t){
    t.onclick=function(){
      var g=t.dataset.go.split(':');
      if(g[0]==='assets'){ switchView('assets'); var sb=document.getElementById('dvSearch'); if(sb){ sb.value=g[1]; try{ renderGrid(); }catch(e){} } return; }
      var col=document.querySelector('.eqb-col[data-st="'+g[1]+'"]'); if(col){ col.scrollIntoView({behavior:'smooth',block:'start'}); col.classList.add('hl'); setTimeout(function(){ col.classList.remove('hl'); },1600); }
    };
    t.onkeydown=function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); t.click(); } };
  });
  /* 차트 */
  try{
    var byCh={}; lent.forEach(function(a){ var c=a.channel||'기타'; byCh[c]=(byCh[c]||0)+1; });
    var chArr=Object.keys(byCh).sort(function(a,b){ return byCh[b]-byCh[a]; }).map(function(c){ return {name:c, v:byCh[c], c:cssv('--brand')}; });
    hbars('#eqcCh', chArr, lent.length, true);
    document.getElementById('eqcChCap').textContent=lent.length? '총 '+lent.length+'대':'';
    var models={}; lent.forEach(function(a){ var m=a.model||'미지정'; (models[m]=models[m]||{l:0,s:0,r:0}).l++; }); stock.forEach(function(a){ var m=a.model||'미지정'; (models[m]=models[m]||{l:0,s:0,r:0}).s++; }); retd.forEach(function(a){ var m=a.model||'미지정'; (models[m]=models[m]||{l:0,s:0,r:0}).r++; });
    var mk2=Object.keys(models).sort(function(a,b){ return (models[b].l+models[b].s+models[b].r)-(models[a].l+models[a].s+models[a].r); }).slice(0,6);
    var cnt=function(v){ return Math.round(v)+'대'; };
    var hostM=document.getElementById('eqcModel');
    hostM.innerHTML= mk2.length? '<div class="h">모델별 (임대중 · 재고 · 회수)</div>'+mk2.map(function(m){ var x=models[m]; return '<div class="mrow"><span>'+esc(m)+'</span><span class="num" style="font-weight:500;color:var(--ink-2)"><b style="color:var(--ink)">'+x.l+'</b> · '+x.s+' · '+x.r+'</span></div>'; }).join('') : '';
    var months=[], d=new Date(); d.setDate(1);
    for(var i=11;i>=0;i--){ var t=new Date(d.getFullYear(), d.getMonth()-i, 1); months.push(t.getFullYear()+'-'+('0'+(t.getMonth()+1)).slice(-2)); }
    var inst=months.map(function(){ return 0; }), rets=months.map(function(){ return 0; });
    O.forEach(function(o){
      var q=+o.qty||eqWant(o).length||1;
      if(['설치완료','회수예정','회수완료'].indexOf(o.status)>=0){ var i1=months.indexOf(String(o.install_date||'').slice(0,7)); if(i1>=0) inst[i1]+=q; }
      if(o.status==='회수완료'){ var i2=months.indexOf(String(o.returned_date||'').slice(0,7)); if(i2>=0) rets[i2]+=q; }
    });
    Viz.bars(document.getElementById('eqcTrend'),{labels:months.map(function(m){ return m.slice(2).replace('-','.'); }), fmt:function(v){ return Math.round(v); }, tipFmt:cnt, maxBar:16, padL:34,
      series:[{label:'설치', data:inst, color:cssv('--s1')},{label:'회수', data:rets, color:cssv('--s2')}]});
  }catch(e){ console.warn('eq dash charts', e); }
}
export function renderEqBoard(){
  var wrap=document.getElementById('eqbCols'); if(!wrap) return;
  try{ requestAnimationFrame(renderEqDash); }catch(e){}
  var O=(ST.RAWX.orders||[]).slice(), q=fkNorm(EQB.q||'');
  /* 채널 칩 */
  var chs={}; O.forEach(function(o){ if(o.status!=='취소') chs[o.channel||'기타']=(chs[o.channel||'기타']||0)+1; });
  var chipBox=document.getElementById('eqbChips');
  chipBox.innerHTML='<button type="button" class="cbtn" data-ch="" aria-pressed="'+(EQB.ch===''? 'true':'false')+'">전체</button>'+
    Object.keys(chs).sort(function(a,b2){ return chs[b2]-chs[a]; }).map(function(c){ return '<button type="button" class="cbtn" data-ch="'+esc(c)+'" aria-pressed="'+(EQB.ch===c? 'true':'false')+'">'+esc(c)+' <span class="num" style="opacity:.6">'+chs[c]+'</span></button>'; }).join('');
  chipBox.querySelectorAll('button').forEach(function(bt){ bt.onclick=function(){ EQB.ch=bt.dataset.ch; renderEqBoard(); }; });
  /* 일치 표시 */
  try{ var s=eqScan(); document.getElementById('eqbMatch').innerHTML= s.gap.length
      ? '<span class="ctag warn" style="cursor:pointer" title="신청 내역 화면의 대조 패널에서 맞추기">'+ico('clock',12)+' 맞지 않음 '+s.gap.length+'건 · 신청 내역에서 맞추기</span>'
      : '<span class="ctag ok">'+ico('check',12)+' 신청 ↔ 현황 일치 · '+s.ok+'건</span>';
    var mt=document.getElementById('eqbMatch').firstChild; if(mt && s.gap.length) mt.onclick=function(){ switchView('orders'); };
  }catch(e){}
  var rows=O.filter(function(o){
    if(EQB.ch && (o.channel||'기타')!==EQB.ch) return false;
    if(q){ var hay=fkNorm([o.customer,o.model,o.serials,o.channel,o.order_type,o.mgr_name,'#'+o.id].join(' ')); if(hay.indexOf(q)<0) return false; }
    return true;
  });
  rows.sort(function(a,b2){ return String(b2.created_at||'')>String(a.created_at||'')? 1:-1; });
  var cancel=rows.filter(function(o){ return o.status==='취소'; }).length;
  document.getElementById('eqbCount').textContent=(rows.length-cancel)+'건'+(cancel? ' · 취소 '+cancel+'건은 보드에 안 보임':'');
  var canEdit=!ST.IS_VIEWER && !!ST.SB_TOKEN, todayS=todayStr();
  var h='', tracks=[];
  EQB_COLS.forEach(function(col, ci){
    var st=col[0], list=rows.filter(function(o){ return o.status===st; }), older=0;
    if(st==='회수완료'){ var cut=new Date(); cut.setDate(cut.getDate()-90); var cutS=todayStr(cut);
      var recent=list.filter(function(o){ return String(o.returned_date||o.created_at||'').slice(0,10)>=cutS; }); older=list.length-recent.length; list=recent; }
    var lim=EQB.more[st]? 1e9 : (st==='설치완료'? 12 : 30);
    /* 비어 있는 열은 가늘게 접어 자리만 남김(드롭은 가능) — 화면을 실제 카드가 있는 열에 몰아줌 */
    if(!list.length){
      tracks.push('52px');
      h+='<section class="eqb-col empty" data-st="'+esc(st)+'" aria-label="'+esc(st)+' 0건" title="'+esc(st)+' — 0건'+(st==='회수완료'&&older? ' (90일 이전 '+older+'건은 신청 내역에서)':'')+'">'+
        '<div class="eqb-ch slim"><i style="background:'+col[1]+'"></i><span class="n">0</span><span class="lbl">'+esc(st)+'</span></div>'+
        (st==='접수' && canEdit? '<button type="button" class="eqb-plus" data-new="1" title="새 장비 신청">＋</button>':'')+'</section>';
      return;
    }
    tracks.push('minmax(0,1fr)');
    h+='<section class="eqb-col'+(st==='회수예정'?' warm':'')+'" data-st="'+esc(st)+'" aria-label="'+esc(st)+'">'+
      '<div class="eqb-ch" title="'+esc(col[2])+'"><i style="background:'+col[1]+'"></i>'+esc(st)+' <span class="n">'+list.length+'</span>'+(st==='회수완료'? '<span class="to">최근 90일</span>':'')+'</div>';
    list.slice(0,lim).forEach(function(o){ h+=eqbCard(o, canEdit, todayS); });
    if(list.length>lim) h+='<button type="button" class="eqb-more" data-more="'+esc(st)+'">외 '+(list.length-lim)+'건 더 보기</button>';
    if(st==='접수' && canEdit) h+='<button type="button" class="eqb-more" data-new="1">＋ 새 신청</button>';
    if(st==='회수완료' && older) h+='<div class="eqb-empty">90일 이전 '+older+'건은 신청 내역(목록)에서</div>';
    h+='</section>';
  });
  wrap.innerHTML=h;
  var wide=tracks.filter(function(t){ return t!=='52px'; }).length;
  wrap.style.gridTemplateColumns = (window.innerWidth>760 && (window.innerWidth>1400 || wide<=3))? tracks.join(' ') : '';   // 좁은 화면에서 열이 많으면 CSS 3열 배치로
  wrap.querySelectorAll('[data-more]').forEach(function(bt){ bt.onclick=function(){ EQB.more[bt.dataset.more]=1; renderEqBoard(); }; });
  wrap.querySelectorAll('[data-new]').forEach(function(bt){ bt.onclick=function(){ switchView('ordernew'); }; });
  wrap.querySelectorAll('[data-next]').forEach(function(bt){ bt.onclick=function(e){ e.stopPropagation(); var r=eqOrderById(bt.dataset.oid); if(r) eqSetStatus(r, bt.dataset.next); }; });
  wrap.querySelectorAll('[data-open]').forEach(function(bt){ bt.onclick=function(e){ e.stopPropagation(); var r=eqOrderById(bt.dataset.open); if(!r) return; switchView('orders'); var sb=document.getElementById('dvSearch'); if(sb){ sb.value=r.customer||('#'+r.id); try{ renderGrid(); }catch(x){} } }; });
  if(canEdit) eqbDnD(wrap);
}
export function eqbCard(o, canEdit, todayS){
  var all=eqWant(o), ret=eqRetSet(o), done=o.status==='회수완료';
  var age='', ageD=0; if(['접수','출하요청','배송중'].indexOf(o.status)>=0 && o.created_at){ ageD=Math.floor((new Date(todayS)-new Date(String(o.created_at).slice(0,10)))/864e5); if(ageD>=1) age=(ageD>7? ' <span class="ctag late">'+ageD+'일 경과</span>' : ' · '+ageD+'일'); }
  var meta=['<b>'+esc(o.model||'모델 미정')+' ×'+(o.qty||all.length||1)+'</b>', o.order_type||''];
  if(o.status==='설치완료' && o.install_date) meta.push('설치 <span class="num">'+esc(String(o.install_date).slice(0,10))+'</span>');
  else if(o.install_date && !done) meta.push('설치희망 <span class="num">'+esc(String(o.install_date).slice(0,10))+'</span>');
  if(done && o.returned_date) meta.push('회수일 <span class="num">'+esc(String(o.returned_date).slice(0,10))+'</span>');
  var prog='';
  if(!done && (o.status==='회수예정' || ret.length) && all.length){
    prog='<div style="display:flex;align-items:center;gap:8px"><div class="eqb-prog" style="flex:1;margin:0">'+all.map(function(sn){ return '<i class="'+(ret.indexOf(sn.toUpperCase())>=0?'on':'')+'"></i>'; }).join('')+'</div><span class="num" style="font-size:12px;font-weight:600">'+ret.length+'/'+all.length+'</span></div>';
  }
  var idx=EQB_COLS.map(function(c){ return c[0]; }).indexOf(o.status), nextSt=idx>=0 && idx<EQB_COLS.length-1? EQB_COLS[idx+1][0] : null;
  var who=o.mgr_name? o.mgr_name : (o.requester? String(o.requester).split('@')[0] : '');
  var ft='<div class="ft"><span class="mini" title="담당 '+esc(who)+'">'+esc(who)+'</span><span class="acts">'+
    '<button type="button" class="cbtn" data-open="'+o.id+'" title="신청 내역에서 열기·수정">✎</button>'+
    (canEdit && nextSt? '<button type="button" class="cbtn nx'+(['출하요청','배송중','설치완료'].indexOf(nextSt)>=0?' pri':'')+'" data-oid="'+o.id+'" data-next="'+esc(nextSt)+'" title="'+esc(nextSt)+' 로 이동">'+esc(nextSt)+' →</button>':'')+'</span></div>';
  /* 카드: 이름 한 줄 → 메타 한 줄(채널 · 모델×수량 · 유형 · 날짜) → 시리얼 칩(4개까지, 나머지 접힘) → 담당·동작. 안내 문구·채널 박스 없음 */
  return '<article class="eqb-card" draggable="'+(canEdit?'true':'false')+'" data-oid="'+o.id+'">'+
    '<div class="tp"><span class="cu" title="'+esc(o.customer||'')+'">'+esc(o.customer||'(고객사 없음)')+'</span><span class="mini num">#'+o.id+age+'</span></div>'+
    '<div class="mt"><span class="chn">'+esc(o.channel||'기타')+'</span> · '+meta.filter(Boolean).join(' · ')+'</div>'+prog+
    '<div class="sn">'+eqSerialsHtml(o,{full:true, max:4, bar:'auto'})+'</div>'+ft+'</article>';
}
export function eqbDnD(wrap){
  var dragging=null;
  wrap.querySelectorAll('.eqb-card').forEach(function(c){
    c.addEventListener('dragstart', function(e){ if(e.target.closest && e.target.closest('.eqsn,.eqbar,button,input')) { e.preventDefault(); return; } dragging=c.dataset.oid; c.classList.add('drag'); try{ e.dataTransfer.setData('text/plain', dragging); e.dataTransfer.effectAllowed='move'; }catch(x){} });
    c.addEventListener('dragend', function(){ c.classList.remove('drag'); wrap.querySelectorAll('.eqb-col.over').forEach(function(x){ x.classList.remove('over'); }); });
  });
  wrap.querySelectorAll('.eqb-col').forEach(function(col){
    col.addEventListener('dragover', function(e){ if(!dragging) return; e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', function(){ col.classList.remove('over'); });
    col.addEventListener('drop', function(e){ e.preventDefault(); col.classList.remove('over'); var r=eqOrderById(dragging); dragging=null; if(!r) return; eqSetStatus(r, col.dataset.st); });
  });
}
/* 상태 변경 — 신청 내역 표에서 상태 칸을 고쳐 저장하는 것과 같은 결과 (회수일 자동 · 현황 동기화 · 변경 이력) */
export async function eqSetStatus(r, st){
  if(!r || !st || r.status===st) return;
  if(!ST.SB_TOKEN){ openOvl('ovlAuth'); return; }
  if(ST.IS_VIEWER){ toast('조회 전용 계정', '상태를 바꿀 수 없습니다', 'info'); return; }
  var all=eqWant(r), body={status:st};
  if(st==='회수완료'){
    if(!confirm('#'+r.id+' '+(r.customer||'')+' — '+(all.length||r.qty||1)+'대 전부 회수완료로 처리할까요?\n(일부만 회수했으면 취소하고 카드의 시리얼 칩을 눌러 개별 회수 처리하세요)')) { renderEqBoard(); return; }
    if(!r.returned_date) body.returned_date=todayStr();
  }
  if(r.status==='회수완료' && st!=='회수완료'){ body.returned_date=null; body.returned_serials=null; }
  try{
    await sbWrite('PATCH','equipment_orders?id=eq.'+r.id, body);
    var from=r.status; Object.keys(body).forEach(function(k){ r[k]=body[k]; });
    logChange('update','equipment_orders',r.id,{status:st, from:from, via:'장비 대시보드'});
    ST.DIRTY=true; renderEqBoard();
    var x=await syncOrderAssets(r, null, true);
    toast('상태 변경', '#'+r.id+' '+(r.customer||'')+' · '+from+' → '+st+(body.returned_date? ' · 회수일 '+body.returned_date:'')+(x? ' · '+x:''), 'ok');
    try{ railSync(ST.CUR_VIEW); }catch(e){}
  }catch(e){ toast('상태 변경 실패', String(e.message||e).slice(0,100), 'bad'); renderEqBoard(); }
}

/* ---- 고객 360 — 요약 4칸 · 다음 액션 제안 · 섹션 탭 (모달 본문 위에 덧붙임) ---- */
export function c360Enhance(nm, cts, lives, ois, inbs, asts, ords){
  var body=document.getElementById('c360Body'); if(!body) return;
  var b=STATE.base, mrr=0, cum=0, nextEnd=null, churned=0;
  cts.forEach(function(r){
    var k=ST.DATA.rows.indexOf(r); if(k>=0){ mrr+=ST.MAT[k][b]||0; for(var j=0;j<ST.M;j++) cum+=ST.MAT[k][j]||0; }
    if(/해지/.test(String(r.status||''))) churned++;
    else if(r.endIdx!=null && r.endIdx>=b && (nextEnd==null || r.endIdx<nextEnd)) nextEnd=r.endIdx;
  });
  var live=ords.filter(function(o){ return o.status!=='회수완료' && o.status!=='취소'; });
  var lent=0, retN=0; live.forEach(function(o){ var all=eqWant(o); lent+=all.length; retN+=eqRetSet(o).length; });
  if(!live.length) lent=asts.filter(function(a){ return a.status==='임대중'; }).length;
  var dLeft=null; if(nextEnd!=null){ var y=+mk(nextEnd).slice(0,4), m=+mk(nextEnd).slice(5,7); var endD=new Date(y, m, 0); dLeft=Math.ceil((endD-new Date())/864e5); }
  var sum='<div class="c360-sum">'+
    '<div><div class="l">월 MRR ('+esc(mk(b))+')</div><div class="v num">'+won(mrr)+'<small> 천원</small></div></div>'+
    '<div><div class="l">누적 매출</div><div class="v num">'+won(cum)+'<small> 천원</small></div></div>'+
    '<div><div class="l">임대 장비</div><div class="v num">'+lent+'<small> 대'+(retN? ' · 회수 '+retN:'')+'</small></div></div>'+
    (dLeft!=null? '<div class="'+(dLeft<=90?'warn':'')+'"><div class="l">다음 만료</div><div class="v num">D-'+Math.max(0,dLeft)+'</div></div>' : '<div><div class="l">다음 만료</div><div class="v">—</div></div>')+'</div>';
  /* 다음 액션 제안 (규칙) */
  var tips=[], acts=[];
  if(dLeft!=null && dLeft<=90){ var ec=cts.filter(function(r){ return r.endIdx===nextEnd; })[0]; tips.push((ec? lline(ec.line)+' 계약이 ':'계약이 ')+Math.max(0,dLeft)+'일 뒤 종료됩니다'+(churned? ' (과거 해지 이력 '+churned+'건)':' (해지 이력 없음)')+'.'); acts.push(['재계약 OI 만들기', function(){ closeOvl('ovlC360'); switchView('oinew'); setTimeout(function(){ var c=document.getElementById('oiCust'); if(c){ c.value=nm; } },80); }]); }
  if(retN && retN<lent) tips.push('장비 '+lent+'대 중 '+retN+'대가 회수 진행 중입니다. 잔여 '+(lent-retN)+'대 회수 여부를 함께 확인하세요.');
  else if(live.some(function(o){ return o.status==='회수예정'; })) tips.push('장비 회수가 예정되어 있습니다.');
  if(live.length) acts.push(['장비 대시보드', function(){ closeOvl('ovlC360'); EQB.q=nm; switchView('eqboard'); var qi=document.getElementById('eqbQ'); if(qi) qi.value=nm; }]);
  var openOi=ois.filter(function(o){ return !/수주|계산서|종료|중지|실패/.test(String(o.stage||'')); });
  if(openOi.length) tips.push('진행 중 OI '+openOi.length+'건이 있습니다'+(openOi[0].next_date? ' · 다음 일정 '+String(openOi[0].next_date).slice(0,10):'')+'.');
  var stale=inbs.filter(function(r){ return /진행중/.test(String(r.result||'')); });
  if(stale.length) tips.push('진행중인 인바운드 '+stale.length+'건이 남아 있습니다.');
  if(!tips.length) tips.push(cts.length? '만료·회수·미결 항목이 없습니다. 정기 점검(분기 1회) 정도면 충분합니다.' : '계약 정보가 없는 고객사입니다 — OI·인바운드 기록을 확인하세요.');
  var next='<div class="c360-next"><b>'+ico('spark',14)+'다음 액션 제안</b><p>'+esc(tips.join(' '))+'</p>'+(acts.length? '<div class="ba">'+acts.map(function(a,i){ return '<button type="button" class="cbtn" data-a="'+i+'">'+esc(a[0])+'</button>'; }).join('')+'</div>':'')+'</div>';
  /* 섹션 탭 */
  var secs=[].slice.call(body.querySelectorAll('.c360-sec'));
  var tabs='<div class="c360-tabs" role="tablist"><button type="button" role="tab" aria-selected="true" data-t="-1">전체</button>'+secs.map(function(sc,i){ var h4=sc.querySelector('h4'); var t=h4? h4.textContent.replace(/^\S+\s/,'').replace(/\s*\d+건\s*$/,'').replace(/계약 기준.*$/,'').trim() : '섹션'; var ct=h4&&h4.querySelector('.ct')? h4.querySelector('.ct').textContent.replace('건','') : ''; return '<button type="button" role="tab" aria-selected="false" data-t="'+i+'">'+esc(t)+(ct? '<span class="ct">'+esc(ct)+'</span>':'')+'</button>'; }).join('')+'</div>';
  var head=document.createElement('div'); head.innerHTML=sum+next+tabs;
  body.insertBefore(head, body.firstChild);
  head.querySelectorAll('[data-a]').forEach(function(bt){ bt.onclick=function(){ acts[+bt.dataset.a][1](); }; });
  head.querySelectorAll('[role="tab"]').forEach(function(bt){ bt.onclick=function(){
    head.querySelectorAll('[role="tab"]').forEach(function(x){ x.setAttribute('aria-selected', x===bt? 'true':'false'); });
    var t=+bt.dataset.t; secs.forEach(function(sc,i){ sc.style.display=(t<0||t===i)? '':'none'; }); }; });
}

export function showAuthUi(){
  try{ loadHide(); }catch(e){}
  $('#btnAuth').textContent=(ST.AUTH_USER||'').split('@')[0]+' ▾';
  $('#btnAuth').title='내 계정 · 로그아웃';
  $('#btnLogout').style.display='none';   // 로그아웃은 계정 메뉴 안으로 이동
}

/* ---- 토스트 알림 ---- */
export function toast(title, sub, type){
  var box=document.getElementById('toasts');
  if(!box){ box=document.createElement('div'); box.id='toasts'; document.body.appendChild(box); }
  var t=document.createElement('div'); t.className='toast '+(type||'ok');
  t.innerHTML='<span class="ti">'+(type==='bad'?'✕':type==='warn'?'!':(type==='info'?'i':'✓'))+'</span>'+
    '<span><b>'+esc(title)+'</b>'+(sub?'<span class="tm">'+esc(sub)+'</span>':'')+'</span>';
  box.appendChild(t);
  setTimeout(function(){ t.classList.add('out'); setTimeout(function(){ t.remove(); },260); }, 4000);
}

export function showLoading(t){
  $('#app').classList.add('hidden');
  var l=$('#loading'); l.classList.remove('hidden');
  l.innerHTML='<div class="spin"></div><div>'+t+'</div>';
}

export function sbHeaders(json){
  var h={apikey:SB_KEY, Authorization:'Bearer '+(ST.SB_TOKEN||SB_KEY)};
  if(json) h['Content-Type']='application/json';
  return h;
}
export async function sbGet(q){
  var r=await fetch(SB_URL+'/rest/v1/'+q,{headers:sbHeaders()});
  if(!r.ok) throw new Error('DB 읽기 실패 ('+r.status+'): '+(await r.text()).slice(0,180));
  return r.json();
}
export async function sbAll(q){
  // 1000행 페이지네이션 — count 먼저 얻고 병렬로
  var h=await fetch(SB_URL+'/rest/v1/'+q+(q.indexOf('?')>=0?'&':'?')+'limit=1',
    {headers:Object.assign(sbHeaders(),{Prefer:'count=exact'})});
  /* ㊿+141: 서버 오류(5xx)를 «0행»으로 넘기면 데이터가 다 사라진 것처럼 보임 → 오류로 올림.
     401/403/404(권한·표 없음)는 예전처럼 빈 목록 — 장비 전용 계정 판별·선택 표(sbTry)가 그 동작에 기대고 있음 */
  if(h.status>=500) throw new Error('DB 읽기 실패 ('+h.status+') — '+q.split('?')[0]);
  var total=+((h.headers.get('content-range')||'/0').split('/')[1]||0);
  if(!total) return [];
  var jobs=[];
  for(var off=0; off<total; off+=1000){
    jobs.push(sbGet(q+(q.indexOf('?')>=0?'&':'?')+'limit=1000&offset='+off));
  }
  var pages=await Promise.all(jobs);
  return [].concat.apply([],pages);
}
export async function sbWrite(method, path, body, prefer, asView){   /* asView(㊿+148): 다른 화면에서 저장할 때 그 표의 화면 권한으로 검사 — 예: 데이터 점검 수정 창 → 'contracts' */
  if(!ST.SB_TOKEN) throw new Error('로그인이 필요합니다.');
  permWriteGuard(method, path, asView);
  var r=await fetch(SB_URL+'/rest/v1/'+path,{
    method:method, headers:Object.assign(sbHeaders(true), prefer?{Prefer:prefer}:{}),
    body: body!==undefined? JSON.stringify(body): undefined
  });
  if(r.status===401 && await refreshToken()){   // 토큰 만료 → 연장 후 1회 재시도
    r=await fetch(SB_URL+'/rest/v1/'+path,{
      method:method, headers:Object.assign(sbHeaders(true), prefer?{Prefer:prefer}:{}),
      body: body!==undefined? JSON.stringify(body): undefined
    });
  }
  if(!r.ok) throw new Error('저장 실패 ('+r.status+'): '+(await r.text()).slice(0,220));
  // 저장 성공 → 이전 캐시는 옛 데이터이므로 즉시 무효화 (새로고침 시 옛 화면 방지)
  // 단, rpc/load_… 는 읽기 전용 호출이라 캐시를 지우지 않음
  if(!/^rpc\/load_/.test(path)) cacheDrop();
  /* ㊿+141: 저장이 됐으니 열린 창의 «입력 중» 표시를 지움 (바깥 클릭·Esc 로 닫을 때 확인을 묻지 않게) — 기록용 표는 제외 */
  if(!/^rpc\/load_/.test(path) && !OVL_SKIP_CLEAN.test(path)) try{ ovlMarkClean(); }catch(e){}
  var t=await r.text();
  return t? JSON.parse(t): null;
}

/* 오늘 날짜(현지 시각 기준) — toISOString() 은 UTC 라서 한국에서 아침 9시 전에는 «어제»가 나옵니다 */
export function todayStr(d){ d=d||new Date(); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
export function thisMonthStr(){ return todayStr().slice(0,7); }
export function dIdx(dateStr){  // 'YYYY-MM-…' → 월 인덱스 (2020-06 = 0)
  if(!dateStr) return null;
  var y=+String(dateStr).slice(0,4), m=+String(dateStr).slice(5,7);
  if(!y||!m) return null;
  return (y-2020)*12+(m-6);
}
export function idxDate(i){  // 인덱스 → 'YYYY-MM-01'
  var t=(2020*12+5)+i, y=Math.floor(t/12), m=(t%12)+1;
  return y+'-'+('0'+m).slice(-2)+'-01';
}

export var SB_RAW={customers:[],contracts:[]};   // 편집 화면에서 재사용

export function sbYm(v){ return v? String(v).slice(0,7):''; }
export async function sbTry(q){ try{ return await sbAll(q); }catch(e){ return null; } }
/* 첫 화면을 늦추지 않으려고 부가 표는 나중에 병렬로 읽어 채웁니다
   · s1_map    : 계약의 «에스원 계약번호» 자동완성 목록 (없어도 화면은 정상)
   · install_extra : 설치비 현황의 추가 항목 (오면 그 카드만 다시 그림) */
export function loadExtrasLater(needMap, needExtra){
  var jobs=[];
  if(needMap) jobs.push(sbTry('s1_map?select=contract_no,s1_name,biz_no,customer&active=is.true&order=contract_no')
    .then(function(r){ if(r&&r.length) ST.RAWX.s1map=r; }));
  if(needExtra) jobs.push(sbTry('install_extra?select=*&order=year,month,id')
    .then(function(r){ if(r&&r.length){ ST.RAWX.iextra=r; try{ renderInstall(); }catch(e){} } }));
  /* 캐시는 다시 쓰지 않습니다 — 큰 JSON 을 한 번 더 만드느라 화면이 멈추는 것보다,
     다음에 들어올 때 이 두 표만 다시 읽는 편이 빠릅니다 */
}

export function shapeLive(rows){
  if(!rows||!rows.length) return null;
  var out=rows.map(function(r){ return {ind:r.industry||'미분류',cust:r.name,key:r.mss_key||'',
    prod:r.product||'미분류',line:(LIVE2CODE[String(r.line||'').trim()]||r.line||''),nodes:Number(r.nodes)||0,
    start:sbYm(r.start_month),end:sbYm(r.end_month),churnMon:sbYm(r.churn_month),dup:!!r.dup}; });
  var uq={},uqND={};
  out.forEach(function(x){ uq[x.cust]=1; if(!x.dup)uqND[x.cust]=1; });
  return {ok:true,count:out.length,uniq:Object.keys(uq).length,uniqNoDup:Object.keys(uqND).length,rows:out};
}
export function shapeLg(rows){
  if(!rows||!rows.length) return null;
  var fee=0;
  var out=rows.map(function(r){ fee+=Number(r.monthly_fee)||0;
    return {cust:r.customer,partner:r.partner||'',prod:r.product||'',nodes:Number(r.nodes)||0,
      start:sbYm(r.start_month),end:sbYm(r.end_month),months:Number(r.months)||0,fee:Number(r.monthly_fee)||0}; });
  return {ok:true,count:out.length,feeSum:fee,rows:out};
}
export function shapeVs(rows){
  if(!rows||!rows.length) return null;
  // 여러 달이 들어있으면 «가장 최근 달» 만 대시보드에 보여줍니다 (과거는 정산·목표 › 비즈포탈 차액에서)
  function mNum(r){
    var m=String(r.ym||'').match(/(\d+)/);
    var n=m? +m[1] : 0;
    var y=String(r.as_of||'').slice(0,4);
    return (y? +y*100 : 0) + n;                    // 연도+월 로 비교
  }
  var best=null, bestKey=-1, bestId=-1;
  rows.forEach(function(r){
    var k=mNum(r), id=Number(r.id)||0;
    if(k>bestKey || (k===bestKey && id>bestId)){ bestKey=k; bestId=id; best=r.ym||''; }
  });
  var pick=rows.filter(function(r){ return (r.ym||'')===best; });
  if(!pick.length) pick=rows;

  var items=[],details=[],ym=best||'',asOf='';
  pick.forEach(function(r){
    if(r.as_of) asOf=String(r.as_of).slice(0,10);
    if(r.kind==='sum') items.push({k:r.item,v:Number(r.biz)||0});
    else details.push({cust:r.item,biz:Number(r.biz)||0,sheet:Number(r.sheet)||0,diff:Number(r.diff)||0,note:r.note||''});
  });
  return {ok:true,asOf:asOf,month:ym,items:items,details:details,monthCount:(function(){
    var seen={},n=0; rows.forEach(function(r){ if(r.ym&&!seen[r.ym]){seen[r.ym]=1;n++;} }); return n;
  })()};
}

export var CACHE_KEY='svc_cache_v1';
export async function sbRpc(name){
  var r=await fetch(SB_URL+'/rest/v1/rpc/'+name,{
    method:'POST', headers:sbHeaders(true), body:'{}'});
  if(!r.ok) throw new Error('rpc '+name+' '+r.status);
  return r.json();
}
export async function loadFromDb(){
  var permP=loadPerms();   // 메뉴 권한은 데이터와 병렬로 (표가 없거나 행이 없으면 null = 역할 기본)
  var codeP=loadCodes();   // 코드 목록(code_lists · SQL 93)도 병렬로 — 표가 없으면 상수 그대로 (㊿+137)
  // 1) 고속 경로: load_all() 함수로 한 번에 (10_fast_load.sql 적용 시)
  try{
    var j=await sbRpc('load_all');
    try{ await permP; }catch(e){} try{ await codeP; }catch(e){}
    if(j && j.customers){
      var mrsRows;
      if(j.mrsegs){
        // 서버 구간 압축본([계약, 시작월, 끝월, 금액])을 월별 행으로 펼침 (47단계 — 전송량 절감)
        mrsRows=[];
        j.mrsegs.forEach(function(a){
          var i0=dIdx(a[1]), i1=dIdx(a[2]);
          if(i0==null||i1==null) return;
          for(var i=i0;i<=i1;i++) mrsRows.push({contract_id:a[0], month:idxDate(i), amount:a[3]});
        });
        mrsRows.sort(function(x,y){ return x.contract_id-y.contract_id || (x.month<y.month?-1:1); });
      }else{
        mrsRows=(j.mrs||[]).map(function(a){ return {contract_id:a[0], month:a[1], amount:a[2]}; });
      }
      var res0=[
        j.customers, j.contracts,
        mrsRows,
        j.live, j.lg, j.biz, j.targets, j.orders, j.roles, j.assets, j.mdrpoc, j.mtargets, j.oi, j.mdrops,
        j.iadj || [],
        j.s1map || [],           /* 에스원 계약번호 자동완성 — load_all 에 없으면 아래에서 뒤늦게 채웁니다 */
        j.iextra || []           /* 설치비 추가 항목 — 화면을 먼저 그리고 뒤에서 채웁니다 */
      ];
      cacheWriteLater(res0);   /* ㊿+145: 큰 JSON 저장은 화면을 그린 뒤로 */
      var built=buildFromRes(res0);
      if(!j.s1map || !j.iextra) loadExtrasLater(!j.s1map, !j.iextra);   // 첫 화면을 붙잡지 않도록 뒤에서 병렬로
      return built;
    }
  }catch(e){ /* 함수 미설치 등 → 아래 기존 방식으로 */ }
  var res=await Promise.all([
    sbAll('customers?select=id,name,industry&order=id'),
    sbAll('contracts?select=*&order=id'),
    sbAll('monthly_revenue?select=contract_id,month,amount&order=contract_id,month'),
    sbTry('live_customers?select=*&order=id'),
    sbTry('lg_sales?select=*&order=id'),
    sbTry('biz_recon?select=*&order=id'),
    sbTry('targets?select=*&order=year'),
    sbTry('equipment_orders?select=*&order=id.desc'),
    sbTry('user_roles?select=role'),
    sbTry('equipment_assets?select=*&order=serial'),
    Promise.resolve([]),   // (통합됨) 예전 mdr_poc_requests 자리 — 인덱스 유지용
    sbTry('monthly_targets?select=*&order=year,month'),
    sbTry('oi_deals?select=*&order=id.desc'),
    sbTry('mdr_ops?select=*&order=id'),
    sbTry('install_adj?select=*&order=year,month'),   /* 52단계 미설치면 빈 배열 */
    sbTry('s1_map?select=contract_no,s1_name,biz_no,customer&active=is.true&order=contract_no'),   /* 68단계 — 에스원 계약번호 자동완성 */
    sbTry('install_extra?select=*&order=year,month,id')   /* 70단계 — 설치비 추가 항목(설치·철거) */
  ]);
  cacheWriteLater(res);
  try{ await permP; }catch(e){} try{ await codeP; }catch(e){}
  return buildFromRes(res);
}
/* 다음 방문용 사본(sessionStorage) — 수 MB JSON 이라 만들고 쓰는 데 시간이 걸려, 첫 화면을 그린 다음 한가할 때 씁니다.
   그사이 저장(sbWrite)이 있었으면 쓰지 않음(옛 데이터가 사본으로 남지 않게) */
export var CACHE_GEN=0;
export function cacheDrop(){ CACHE_GEN++; try{ sessionStorage.removeItem(CACHE_KEY); }catch(e){} }   /* 예약된 사본 쓰기까지 취소 (로그아웃 뒤 이전 사용자 데이터가 남지 않게) */
export function cacheWriteLater(res){
  var g=++CACHE_GEN, t0=Date.now(); if(IS_QA) return;
  var run=function(){ if(g!==CACHE_GEN || !ST.SB_TOKEN) return; try{ sessionStorage.setItem(CACHE_KEY, JSON.stringify({t:t0, res:res})); }catch(e){} };
  try{ if(window.requestIdleCallback) requestIdleCallback(run, {timeout:3000}); else setTimeout(run, 400); }catch(e){ setTimeout(run, 400); }
}
export function loadFromCache(){
  // 이전 방문 때 저장한 데이터로 즉시 그린 뒤, 백그라운드에서 최신본으로 교체
  try{
    var c=JSON.parse(sessionStorage.getItem(CACHE_KEY)||'null');
    if(c && c.res && c.res[0] && c.res[0].length){
      if(Date.now()-(c.t||0) > 10*60*1000) return null;   // 10분 넘은 캐시는 쓰지 않음
      return buildFromRes(c.res);
    }
  }catch(e){}
  return null;
}
export function buildFromRes(res){
  var custs=res[0], cts=res[1], mrs=res[2];
  var LIVE=shapeLive(res[3]), LGD=shapeLg(res[4]), VSD=shapeVs(res[5]);
  var prevRawx=ST.RAWX||{};   // 별도 화면 캐시(가격표·인바운드·변경이력)는 자동 갱신에 휩쓸려 지우지 않음
  ST.RAWX={customers:custs, contracts:cts, live:res[3]||[], lg:res[4]||[], biz:res[5]||[],
    targets:res[6]||[], orders:res[7]||[], assets:res[9]||[], mdrpoc:res[10]||[], mtargets:res[11]||[], oi:res[12]||[], mdrops:res[13]||[], iadj:res[14]||[], s1map:res[15]||[], iextra:res[16]||[], log:prevRawx.log||null, mrs:mrs};
  ST.RAWX.price=prevRawx.price; ST.RAWX.inbound=prevRawx.inbound; ST.RAWX._inbAt=prevRawx._inbAt; ST.RAWX.cloud=prevRawx.cloud;
  ST.MY_ROLE = (res[8] && res[8].length && res[8][0].role) || '';
  ST.IS_VIEWER_ROLE = (ST.MY_ROLE==='viewer' || ST.MY_ROLE==='admin_viewer');   // 역할상 조회 전용
  ST.IS_VIEWER = ST.IS_VIEWER_ROLE;   // 화면마다 permEnter() 가 «쓰기 권한 없음» 을 더함
  ST.IS_SUPER = ST.MY_ROLE==='super_admin';
  try{ if(ST.PERMS===null){ var pc=sessionStorage.getItem('svc_perms'); if(pc) ST.PERMS=JSON.parse(pc); } }catch(e){}   // 캐시 경로에서도 권한 유지
  try{ if(ST.CODES===null){ var cc=sessionStorage.getItem('svc_codes'); if(cc){ ST.CODES=JSON.parse(cc); applyCodes(); } } }catch(e){}   // 캐시 경로에서도 코드 목록 유지 (㊿+137)
  var abtn=document.querySelector('.side button[data-v="adminx"]');
  if(abtn) abtn.style.display = ST.IS_SUPER? '':'none';
  var obtn=document.querySelector('.side button[data-v="ops"]');
  if(obtn) obtn.style.display = ST.IS_SUPER? '':'none';   // 배포·운영은 슈퍼 관리자 + 함수 쪽 OPS_OWNER 지정 계정만 (㊿+128)
  var lbtn=document.querySelector('.side button[data-v="log"]');
  if(lbtn) lbtn.style.display = ST.IS_SUPER? '':'none';   // 변경 이력은 슈퍼 관리자만
  var cbtn=document.querySelector('.side button[data-v="csite"]');
  if(cbtn) cbtn.style.display = ST.IS_SUPER? '':'none';   // Cloud 사이트 생성·수정은 슈퍼 관리자만 (Edge Function 도 같은 규칙)
  var ggrp=document.getElementById('grpAdmin');
  if(ggrp) ggrp.style.display = ST.IS_SUPER? '':'none';   // 「관리자」 그룹 헤더도 슈퍼만
  var mbtn=document.getElementById('btnMenuEdit');
  if(mbtn) mbtn.style.display = (ST.IS_SUPER||ST.MY_ROLE==='admin')? '':'none';   // 메뉴 편집은 admin 이상
  SB_RAW.customers=custs; SB_RAW.contracts=cts;
  var cMap={}; custs.forEach(function(c){ cMap[c.id]=c; });

  // 계약별 월 금액 → segs (연속 구간 압축)
  var byCt={};
  mrs.forEach(function(x){ (byCt[x.contract_id]=byCt[x.contract_id]||[]).push(x); });
  var maxIdx=0;
  var rows=cts.map(function(c){
    var list=(byCt[c.id]||[]);
    var segs=[], cur=null, sum=0, first=null, last=null;
    list.forEach(function(x){
      var i=dIdx(x.month), v=Number(x.amount);
      if(i==null||!v) return;
      sum+=v; if(first==null)first=i; last=i; if(i>maxIdx)maxIdx=i;
      if(cur && cur.v===v && cur.e===i-1) cur.e=i;
      else { if(cur) segs.push([cur.s,cur.e,cur.v]); cur={s:i,e:i,v:v}; }
    });
    if(cur) segs.push([cur.s,cur.e,cur.v]);
    var cu=cMap[c.customer_id]||{};
    return {
      _id:c.id, line:c.line, ind:cu.industry||'미분류', cust:cu.name||'?',
      sector:cu.sector||'', sectorDetail:cu.sector_detail||'', sectorDup:!!cu.sector_dup,
      sectorChk:!!cu.sector_check,
      partner:c.biller||'미지정', ptn:c.partner||'직접(계산서)',
      ctype:c.contract_type||'', status:c.status||'', note:c.note||'',
      churn:c.churn_reason||'', saleType:c.sale_type||'', ver:c.version||'', csm:c.csm||'', channel:c.channel||'일반',
      lead:c.lead_src||'',                                                                                  /* 유입경로 (비면 미지정) */
      combine:c.combine||'',
      startIdx:c.start_month? dIdx(c.start_month): first,
      endIdx:c.end_month? dIdx(c.end_month): last,
      dataFirst:first, dataLast:last,
      startRaw:c.start_month? dIdx(c.start_month): null, endRaw:c.end_month? dIdx(c.end_month): null,   /* 계약서에 적힌 날짜만 (매출로 보정하지 않은 값 · LIVE 판정용) */
      liveOv:c.live_override||'', liveOvNote:c.live_override_note||'',                                    /* LIVE 예외: 포함/제외 (64단계) */
      term:Number(c.term_months)||0, qty:Number(c.qty)||0,
      total:Number(c.total_amount)||0, billing:c.billing||'', mrr:Number(c.mrr)||0,
      fee:Number(c.install_fee)||0, settle:c.settle_month||'',   /* 설치비 · 대금정산일 */
      renew:Number(c.renew_count)||0, renewHist:Array.isArray(c.renew_history)? c.renew_history : [],   /* 연장 회차 */
      autoRenew:!!c.auto_renew, s1no:c.s1_no||'',                                                        /* 월 단위 자동연장(만기 알림 제외 · SQL 84) · 에스원 계약번호 */
      cid:c.customer_id, parent:c.parent_contract_id||null,                                              /* 부속 계약(추가 구매)이면 원계약 id */
      noCount:!!c.no_count,                                                                               /* 매출은 세되 고객사 수·신규·해지에서는 빼는 행(시트 LIVE 집계의 «중복» 등) */
      sum:sum, segs:segs
    };
  });
  var monthKeys=[];
  for(var i=0;i<=Math.max(maxIdx,dIdx(new Date().getFullYear()+'-'+('0'+(new Date().getMonth()+1)).slice(-2)));i++){
    var t=(2020*12+5)+i; monthKeys.push(Math.floor(t/12)+'-'+('0'+((t%12)+1)).slice(-2));
  }
  var now=new Date();
  return {
    generatedAt: now.getFullYear()+'-'+('0'+(now.getMonth()+1)).slice(-2)+'-'+('0'+now.getDate()).slice(-2)+' '+
                 ('0'+now.getHours()).slice(-2)+':'+('0'+now.getMinutes()).slice(-2),
    todayKey:'', nowIdx: dIdx(now.getFullYear()+'-'+('0'+(now.getMonth()+1)).slice(-2)),
    monthKeys:monthKeys,
    lines:(function(){
      var ORDER=['Cloud','S1','MDR','MDR_S1','DRM','PNS','DLP'];   // 표시 순서: Cloud NAC > S1 Cloud NAC > MDR > S1 MDR > DRM > PNS
      var seen={}; rows.forEach(function(r){ if(r.line) seen[r.line]=1; });
      return ORDER.filter(function(l){ return seen[l]; })
        .concat(Object.keys(seen).filter(function(l){ return ORDER.indexOf(l)<0; }))
        .map(function(l,i){ return {label:l, color:i+1}; });
    })(),
    rows:rows, warnings:[], live:LIVE, lg:LGD, vs:VSD, sheetUrl:''
  };
}

export function afterLoad(dd){
  if(isEquipAcct(dd)){ enterEquipMode(dd); return; }
  onData(dd);
}
/* ---- 제한 역할(장비/POC 전용) : 포탈 안에서 해당 메뉴만 사용 ---- */
export var ROLE_VIEWS={
  equipment:     {orders:1, assets:1, ordernew:1, eqboard:1, weekly:1, account:1},   // (구) — equipment_poc 로 통합됨
  poc:           {mdrnew:1, mdrops:1, weekly:1, account:1},
  equipment_poc: {orders:1, assets:1, ordernew:1, eqboard:1, mdrnew:1, mdrops:1, weekly:1, account:1}
};
export var ROLE_LABEL={equipment:'장비 관리 전용', poc:'PoC 전용', equipment_poc:'장비·PoC 전용'};
export var EQUIP_VIEWS=ROLE_VIEWS.equipment;   // 현재 계정에 허용된 화면 (아래에서 교체)
export function isEquipAcct(d){
  if(!ST.SB_TOKEN) return false;
  if(ROLE_VIEWS[ST.MY_ROLE]) return true;
  return !d.rows.length;                // 역할 미지정 + 매출 안 보임 → 장비 전용으로 간주
}
export function enterEquipMode(d){
  ST.IS_EQUIP=true;
  var role=ST.MY_ROLE||'';
  EQUIP_VIEWS=ROLE_VIEWS[role]||ROLE_VIEWS.equipment;
  ST.EQUIP_HOME=Object.keys(EQUIP_VIEWS)[0];
  ST.DATA=d; ST.M=d.monthKeys.length; ST.MAT=[];
  var side=$('#side');
  side.querySelectorAll('button').forEach(function(b){
    if(!EQUIP_VIEWS[b.dataset.v]) b.style.display='none';
  });
  side.querySelectorAll('.grp').forEach(function(g){
    var el=g.nextElementSibling, vis=false;
    while(el && !el.classList.contains('grp')){
      if(el.tagName==='BUTTON' && el.style.display!=='none') vis=true;
      el=el.nextElementSibling;
    }
    g.style.display=vis? '':'none';
  });
  try{ subgrpSync(); }catch(e){}
  $('#btnEdit').style.display='none';
  $('#btnWidgets').style.display='none';
  showAuthUi();
  $('#loading').classList.add('hidden');
  $('#app').classList.remove('hidden');
  side.classList.remove('hidden');
  document.body.style.paddingLeft='';
  try{ buildRail(); buildMtabs(); }catch(e){}
  $('#periodLabel').textContent=ROLE_LABEL[role]||'장비 관리 전용';
  switchView(EQUIP_VIEWS[ST.CUR_VIEW]? ST.CUR_VIEW : ST.EQUIP_HOME);
}
export function boot(skipCache){
  if(!SHELL_ONCE.edit){ SHELL_ONCE.edit=1; setupEdit(); setupSide(); }
  restoreSess().then(function(ok){
    /* ㊿+145: 로그인 안 된 상태 → 서버에 묻지 않고 바로 로그인 화면 (예전엔 익명으로 load_all 을 한 번 불러 «빈 결과»를 확인한 뒤에야 보여 줌 — 로그아웃이 느렸던 이유) */
    if(!ok){ showLoginScreen(); return null; }
    if(ok){
      showAuthUi();
      // 이전 방문 캐시가 있으면 즉시 그리고, 최신 데이터는 뒤에서 받아 교체
      var cached=skipCache? null : loadFromCache();
      if(cached && cached.rows.length){
        onData(cached);
        var pl=$('#periodLabel'); pl.textContent += ' · 최신 데이터 확인 중…';
        loadFromDb().then(function(d2){
          var keep=ST.CUR_VIEW;                    // 보고 있던 화면 유지한 채 데이터만 최신으로
          afterLoad(d2);
          // 로딩 사이에 다른 화면으로 이동했으면 되돌리지 않음 · 주간회의는 다시 그리지 않음
          if(keep && keep===ST.CUR_VIEW && keep!=='dash' && keep!=='weekly' && !ST.IS_EQUIP) try{ switchView(keep); }catch(e){}
        }).catch(function(e){ pl.textContent=pl.textContent.replace(' · 최신 데이터 확인 중…','');
          /* ㊿+141: 조용히 넘어가면 옛 사본을 최신으로 착각함 → 알림 */
          try{ toast('최신 데이터를 불러오지 못했습니다','지금 화면은 이전 방문 때 저장한 사본입니다 — 잠시 뒤 ↻ 새로고침 ('+String(e&&e.message||e).slice(0,80)+')','warn'); }catch(x){} });
        return null;   // 아래 then 건너뜀
      }
      showLoading('데이터를 불러오는 중…');
    }
    return loadFromDb();
  }).then(function(d){
    if(d===null) return;   // 캐시 경로에서 이미 처리됨
    if(isEquipAcct(d)){
      // 로그인했는데 매출 데이터가 안 보임 = 장비 전용(equipment) 계정
      enterEquipMode(d);
      return;
    }
    if(!d.rows.length && !ST.SB_TOKEN){
      showLoginScreen();   // 비로그인: 전용 로그인 화면
      return;
    }
    onData(d);
  }).catch(onErr);
}

/* ---- 로그인 전용 화면 ---- */
export function showLoginScreen(){
  $('#side').classList.add('hidden');
  document.body.style.paddingLeft='0';
  $('#app').classList.add('hidden');
  $('#loading').classList.add('hidden');
  $('#viewLogin').classList.remove('hidden');
  try{ var im=sessionStorage.getItem('svc_idle_msg'); if(im){ sessionStorage.removeItem('svc_idle_msg'); var lm=$('#lsMsg'); if(lm){ lm.style.color='var(--ink-2)'; lm.textContent=im; } } }catch(x){}
  /* 마지막으로 로그인한 이메일을 미리 채움 (이 브라우저에 기억 · 비밀번호는 저장하지 않음) → 브라우저 자동완성과 무관하게 아이디가 비지 않음 */
  var e=$('#lsEmail'); try{ var last=localStorage.getItem('svc_last_email')||''; if(e && !e.value && last) e.value=last; }catch(x){}
  try{ var kc=$('#lsKeep'); if(kc) kc.checked=keepLogin(); }catch(x){}   // 앱·모바일이면 기본 켬, 전에 고른 값이 있으면 그 값
  setTimeout(function(){ var em=$('#lsEmail'), pw=$('#lsPw'); if(em && em.value && pw && !pw.value) pw.focus(); else if(em) em.focus(); },60);
}
export function enterAfterLogin(){
  /* ㊿+145: 로그인하면 항상 메인 대시보드 — 주소에 남은 #메뉴 · ?v= 로 이전 화면을 열지 않음 */
  try{ history.replaceState(null, '', location.pathname); }catch(e){}
  ST.CUR_VIEW='dash';
  $('#viewLogin').classList.add('hidden');
  $('#loading').classList.remove('hidden');
  document.body.style.paddingLeft='';
  showLoading('로그인 완료 — 데이터를 불러오는 중…');
  loadFromDb().then(afterLoad).catch(onErr);
}
export async function screenLogin(){
  var em=$('#lsEmail').value.trim(), pw=$('#lsPw').value, m=$('#lsMsg');
  if(!em||!pw){ m.textContent='이메일과 비밀번호를 입력하세요'; return; }
  m.style.color='var(--muted)'; m.textContent='확인 중…';
  try{
    var r=await fetch(SB_URL+'/auth/v1/token?grant_type=password',{
      method:'POST', headers:{apikey:SB_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({email:em, password:pw})});
    var j=await r.json();
    if(!r.ok||!j.access_token) throw new Error(j.error_description||j.msg||'이메일 또는 비밀번호가 올바르지 않습니다');
    ST.SB_TOKEN=j.access_token; ST.AUTH_USER=em;
    try{ var kc=$('#lsKeep'); if(kc) localStorage.setItem('svc_keep', kc.checked? '1':'0'); }catch(x){}
    saveSess(j, em);
    try{ localStorage.setItem('svc_last_email', em); }catch(x){}
    var vf0=mfaVerifiedOf(j.user&&j.user.factors);   /* ㊿+145: 확인된 인증 앱이 없으면 빠른 길(확인은 데이터 읽기와 병렬) */
    if(!(await mfaGate(j.access_token, em, j.user&&j.user.factors, {fast:!vf0.length}))){ clearSess(); ST.SB_TOKEN=null; ST.AUTH_USER=null; m.style.color='var(--muted)'; m.textContent='2단계 인증을 취소해 로그인하지 않았습니다'; return; }
    showAuthUi();
    var changed=j.user && j.user.user_metadata && j.user.user_metadata.pw_changed;
    if(!changed){
      $('#lsLogin').style.display='none'; $('#lsForce').style.display='';
      m.textContent='';
      setTimeout(function(){ $('#lsNpw1').focus(); },60);
      return;
    }
    enterAfterLogin();
  }catch(e){ m.style.color='var(--critical,#d03b3b)'; m.textContent=String(e.message||e); }
}
export async function screenPw(){
  var p1=$('#lsNpw1').value, p2=$('#lsNpw2').value, m=$('#lsMsg');
  if(p1.length<6){ m.style.color='var(--critical,#d03b3b)'; m.textContent='6자 이상으로 입력하세요'; return; }
  if(p1!==p2){ m.style.color='var(--critical,#d03b3b)'; m.textContent='비밀번호 확인이 일치하지 않습니다'; return; }
  m.style.color='var(--muted)'; m.textContent='변경 중…';
  try{
    var r=await fetch(SB_URL+'/auth/v1/user',{
      method:'PUT', headers:{apikey:SB_KEY,'Content-Type':'application/json',Authorization:'Bearer '+ST.SB_TOKEN},
      body:JSON.stringify({password:p1, data:{pw_changed:true}})});
    var j=await r.json();
    if(!r.ok) throw new Error(j.error_description||j.msg||'변경 실패');
    try{ var s0=sessRead(); if(s0){ s0.p=true; sessWrite(s0); } }catch(e){}
    enterAfterLogin();
  }catch(e){ m.style.color='var(--critical,#d03b3b)'; m.textContent=String(e.message||e); }
}

export function onErr(e){
  $('#loading').innerHTML = '<div class="card err" style="max-width:620px">'+
    '<h2>데이터를 불러오지 못했습니다</h2><p class="cap">'+String(e&&e.message||e)+'</p>'+
    '<p class="cap">네트워크 상태와 Supabase 프로젝트 상태(일시정지 여부)를 확인해 주세요.</p></div>';
}

export function onData(d){
  try{ mfaWarnIfNeeded(); }catch(e){}
  if(!UPD.checked) setTimeout(function(){ try{ updCheck(); }catch(e){} }, 1500);   /* ㊿+148 업데이트 안내 팝업 — 첫 화면을 그린 뒤 1번 */
  $('#side').classList.remove('hidden');
  try{ applyPerms(); }catch(e){}
  /* PWA 바로가기(manifest shortcuts) — index.html?v=eqboard 처럼 열리면 첫 화면을 그 메뉴로 */
  if(!SHELL_ONCE.pwa){ SHELL_ONCE.pwa=1; try{ var qv=new URLSearchParams(location.search).get('v') || (location.hash||'').replace('#',''); if(qv && qv!=='dash' && document.querySelector('#side button[data-v="'+qv+'"]')){ setTimeout(function(){ try{ switchView(qv); }catch(e){} NAV.ready=true; btnBackSync(); }, 50); } else setTimeout(function(){ NAV.ready=true; try{ history.replaceState({v:ST.CUR_VIEW, i:0}, '', location.pathname+location.search+(ST.CUR_VIEW==='dash'?'':'#'+ST.CUR_VIEW)); }catch(e){} btnBackSync(); }, 60); }catch(e){ NAV.ready=true; } }
  document.body.style.paddingLeft='';
  /* 장표 셀 메모는 한 번만 읽고, 오면 장표만 다시 그립니다 */
  if(!ST.RAWX._mxAt) loadMxMemos(function(){ try{ if(ST.CUR_VIEW==='dash') renderMatrix(); }catch(e){} });
  $('#btnEdit').style.display = (ST.IS_VIEWER_ROLE || !canWrite('contracts'))? 'none':'';
  (d.rows||[]).forEach(function(r){
    if(!r.ptn){
      var p0=String(r.partner||'');
      r.ptn=/다원/.test(p0)?'다원티에스':/글로웰/.test(p0)?'글로웰시스템':/에티버스/i.test(p0)?'에티버스':'직접(계산서)';
    }
  });
  ST.DATA = d; ST.M = d.monthKeys.length;
  ST.MAT = d.rows.map(function(r){
    var a = new Float64Array(ST.M);
    // H/W 판매(일시 매출)는 MRR·차트 집계에서 제외 — 계약 목록에는 그대로 표시
    if(/H\/W/i.test(r.saleType||'') || /H\/W/i.test(r.ctype||'')){ r._hw=true; return a; }
    r.segs.forEach(function(s){
      for(var i=Math.max(0,s[0]); i<=Math.min(ST.M-1,s[1]); i++) a[i]+=s[2];
    });
    return a;
  });
  d.rows.forEach(function(r,i){
    var a=ST.MAT[i], f=-1, l=-1;
    for(var j=0;j<ST.M;j++){ if(a[j]!==0){ if(f<0)f=j; l=j; } }
    r._f=f; r._l=l; r._k=i;                    // _k = MAT 행 인덱스 (indexOf 없이 바로 찾기)
    if(r.startIdx==null||r.startIdx<0) r.startIdx=f;
    if(r.endIdx==null||r.endIdx<0) r.endIdx=l;
  });

  // 기준월 = 데이터가 있는 마지막 달 중 오늘 이하
  var lastData = 0;
  for(var j=0;j<ST.M;j++){ var s=0; for(var i=0;i<ST.MAT.length;i++) s+=ST.MAT[i][j]; if(s!==0) lastData=j; }
  STATE.base = Math.min(d.nowIdx>=0? d.nowIdx : lastData, lastData);
  if(STATE.base<0) STATE.base = lastData;
  ST.DASH_BASE0=STATE.base;   /* ㊿+145: 홈 메뉴를 누르면 이 기준월로 돌아감 (navMenu) */

  d.lines.forEach(function(l){ STATE.lines[l.label]=true; });

  buildControls();
  applyChannelMenu();
  try{ applyMenuConf(); }catch(e){}
  applyMenuFold();
  try{ buildRail(); buildMtabs(); }catch(e){}
  try{ rpbBadge(); }catch(e){}
  var meBtn=document.getElementById('btnMenuEdit');
  if(meBtn && !meBtn.__b){ meBtn.__b=1; meBtn.onclick=openMenuEdit; }
  if(ST.CUR_VIEW) try{ ensureGroupOpen(ST.CUR_VIEW); }catch(e){}
  ST.LAST_LOAD=Date.now();
  $('#loading').classList.add('hidden');
  $('#app').classList.remove('hidden');
  // 레이아웃이 확정된 다음에 그려야 차트 폭이 정확합니다
  /* ㊿+145: 첫 화면(차트·숫자)을 먼저 그리고, 할 일 카드·폭 감시는 화면이 뜬 다음 차례로 (로그인 직후 체감 속도) */
  requestAnimationFrame(function(){ renderAll(); setTimeout(function(){ watchWidth(); try{ renderTodo(); }catch(e){} }, 0); });
}

/* 카드 폭이 바뀌면 (창 크기, 사이드바, 인쇄) 다시 그립니다 */
export var _lastW = 0, _wwOn = false;
export function watchWidth(){
  /* ㊿+145: 감시는 한 번만 — 예전엔 데이터를 다시 읽을 때마다(onData) 감시자가 하나씩 늘어 창 크기를 바꾸면 renderAll 이 여러 번 돌았음 */
  if(_wwOn || typeof ResizeObserver === 'undefined') return;
  var host = document.getElementById('chTrend'); if(!host) return; _wwOn = true;
  _lastW = host.clientWidth;
  var t;
  new ResizeObserver(function(){
    var w = host.clientWidth;
    if(Math.abs(w - _lastW) < 8) return;
    _lastW = w;
    clearTimeout(t); t = setTimeout(function(){ renderAll(); }, 120);
  }).observe(host);
}

/* ---- 리포트 «PPT 슬라이드에 담은 항목» 목록 — 사이드 메뉴 배지(rpbBadge)가 처음부터 필요해서 여기 (㊿+153: report.js 에서 옮김 · 리포트 화면은 처음 열 때 불러옴) ---- */
export var RPB={items:null};
export function rpbKey(){ return 'svc_rpb_'+(ST.AUTH_USER||'anon'); }
export function rpbList(){ if(!RPB.items){ try{ RPB.items=JSON.parse(localStorage.getItem(rpbKey())||'[]')||[]; }catch(e){ RPB.items=[]; } } return RPB.items; }
export function rpbBadge(){
  var n=rpbList().length;
  var b=document.querySelector('.side button[data-v="report"]'); if(b){ var old=b.querySelector('.rpb-cnt'); if(old) old.remove(); if(n){ var s=document.createElement('span'); s.className='rpb-cnt'; s.textContent=n; b.appendChild(s); } }
}
