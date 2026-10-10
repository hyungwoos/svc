/* ===== shell.js — 커맨드 센터(레일·커맨드 바·인박스·홈 위계) · 데이터 빌드(buildFromRes) · 고객 360 보강 · 토스트 · 제한 역할 · 로그인 화면 =====
   ES 모듈(㊿+153) — 다른 파일의 이름은 아래 import 로만 씀 · 이 파일의 최상위 var/function 은 전부 export · 즉시 실행 문장은 js/init.js 의 start() 에 */
import { IS_QA, ST } from './state.js';
import { Viz } from './viz.js';
import { $, applyPerms, bizHas, bizKey, canView, canWrite, clearSess, cssv, el, esc, isCC, isGN, keepLogin, LIVE2CODE, lline, loadPerms, mfaGate, mfaVerifiedOf, mfaWarnIfNeeded, mk, monOf, navText, PERF, perfDev, perfNet, perfRec, permWriteGuard, rawHtml, refreshToken, restoreSess, saveSess, SB_KEY, SB_URL, seriesColor, sessRead, sessWrite, STATE, tpl, won } from './core.js';
import { buildControls, expN, expScan, hbars, idxs, kpiOpen, monthlyTotal, renderAll, renderInstall, renderKpis, renderMatrix, renewNeedScan } from './dash.js';
import { ask } from './ai.js';
import { applyCodes, GRIDS, loadCodes } from './grids.js';
import { eqCanRet, eqOrderById, eqRetOpen, eqRetSet, eqScan, eqSerialsHtml, eqWant, syncOrderAssets } from './equipment.js';
import { applyChannelMenu, chOf, ctRawOf, ctSuccessor, dcRules, ensureLeadSrc, liveData, openRenewList, renewScan } from './analysis.js';
import { applyMenuConf, fkNorm, freqTop, menuSegments, navSub, openMenuEdit, renderTodo, subgrpSync, viewLabel } from './tools.js';
import { loadInbound, loadMxMemos } from './inbound.js';
import { UPD, updCheck } from './upd.js';
import { applyMenuFold, closeDrawer, ensureGroupOpen, setupSide } from './sales.js';
import { btnBackSync, gridGoPre, loadHide, NAV, navMenu, oiOpen, openDetail, qvCfg, qvGo, renderGrid, switchView, VIEW_UI, viewResetHard } from './grid.js';
import { closeOvl, logChange, openOvl, OVL_SKIP_CLEAN, ovlMarkClean, setupEdit, toggleAuthMenu } from './edit.js';
import { homeOn, homeRender, placeSearchBtn, srchCtx } from './home.js';
import { NTF, ntfAfterData, ntfWho } from './notify.js';
import { verBeforeWrite } from './guard.js';


/* ==================================================================
   커맨드 센터 (v5) — 아이콘 레일 · 커맨드 바 · 인박스 홈 · 운영 보드 · 고객 360 패널 · 모바일 탭
   ================================================================== */
/* 이 창에서 한 번만 하는 일 표시 (㊿+154: 예전 window.__ccInbLoad · __editInit · __pwaStart) */
export var SHELL_ONCE={inb:0, edit:0, pwa:0, gnm:0};
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
  bell:'<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  check:'<path d="M5 12l5 5L20 7"/>',
  menu:'<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  board:'<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="9.5" y="4" width="5" height="10" rx="1"/><rect x="16" y="4" width="5" height="13" rx="1"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5a5 5 0 0 1 6 5"/>',
  arrow:'<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
  doc:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 13h6"/><path d="M9 17h6"/>',
  eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  more:'<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  trash:'<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
  clip:'<path d="M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/>',
  undo:'<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  filter:'<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  cols:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="M15 4v16"/>',
  down:'<path d="M12 4v12"/><path d="M6 11l6 6 6-6"/><path d="M5 20h14"/>',
  reload:'<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  star:'<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  moon:'<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M5 5l1.5 1.5"/><path d="M17.5 17.5L19 19"/><path d="M5 19l1.5-1.5"/><path d="M17.5 6.5L19 5"/>',
  plus:'<path d="M12 5v14"/><path d="M5 12h14"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  back:'<path d="M15 18l-6-6 6-6"/>'
};
/* ㊿+169 아이콘 한 가지 모양 — 위쪽·표 도구 버튼의 이모지/기호(✏️ ⊞ ↻ ⬇ 🧱 ☰ ❔ 📋)를 같은 선 아이콘 + 글자로 (id·이름표는 그대로) */
export var UI_ICO={btnEdit:['edit','계약 입력·수정'], btnNew:['plus','등록'], btnWidgets:['board','위젯'], btnReload:['reload','새로고침'], btnFind:['spark','검색'],
  dvAdd:['plus','행 추가'], dvPaste:['doc','붙여넣기 입력'], dvReload:['reload','다시 읽기'], dvCsv:['down','엑셀'], dvDense:['menu','밀도'], dvHelp:['spark','']};
export function icoLbl(name, label){ return ico(name,15)+(label? tpl`<span>${label}</span>` : ''); }
export function uiIconize(){
  Object.keys(UI_ICO).forEach(function(id){ var b=document.getElementById(id); if(b && !b.querySelector('svg')){ b.innerHTML=icoLbl(UI_ICO[id][0], UI_ICO[id][1]); b.classList.add('icb'); } });
  themeBtnSync();
}
export function themeBtnSync(){ var b=document.getElementById('btnTheme'); if(!b) return; var dark=document.documentElement.getAttribute('data-theme')==='dark'; b.innerHTML=icoLbl(dark? 'sun':'moon', dark? '라이트':'다크'); b.classList.add('icb'); }
export function ico(name, size){ size=size||18; return tpl`<svg width="${rawHtml(size)}" height="${rawHtml(size)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${rawHtml(ICO[name]||ICO.doc)}</svg>`; }
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
  if(isGN()){ buildGnNav(rail); return; }
  if(rail.parentElement!==document.body) document.body.insertBefore(rail, document.getElementById('railFly'));   /* 지니언스 → 커맨드 센터로 바꾸면 레일을 제자리로 */
  var segs=[]; try{ segs=menuSegments(); }catch(e){}
  var h='<div class="rlogo" data-v="dash" title="홈 (대시보드)">G</div>';
  h+=tpl`<button type="button" data-v="dash" title="홈" aria-label="홈">${rawHtml(ico('home'))}</button>`;
  segs.forEach(function(s){
    if(s.grp){
      if(s.grp.classList.contains('mhide')) return;
      var vis=s.buttons.filter(visBtn); if(!vis.length) return;
      h+=tpl`<button type="button" data-seg="${s.key}" title="${s.label}" aria-label="${s.label}" aria-haspopup="menu">${rawHtml(ico(iconFor(s.label)))}</button>`;
    }else{
      if(!visBtn(s.btn)) return;
      var t=navText(s.btn);
      h+=tpl`<button type="button" data-v="${s.btn.dataset.v}" title="${t}" aria-label="${t}">${rawHtml(ico(iconFor(t, s.btn.dataset.v)))}</button>`;
    }
  });
  h+='<div class="rsp"></div>';
  h+=tpl`<button type="button" data-v="account" title="내 계정 · 설정" aria-label="내 계정">${rawHtml(ico('gear'))}</button>`;
  h+=tpl`<div class="ravatar" data-v="account" title="${ST.AUTH_USER||''}">${((ST.AUTH_USER||'?').split('@')[0]).slice(0,1).toUpperCase()}</div>`;
  rail.innerHTML=h;
  rail.querySelectorAll('[data-v]').forEach(function(b){ b.onclick=function(){ railFlyClose(); navMenu(b.dataset.v); }; });
  rail.querySelectorAll('[data-seg]').forEach(function(b){ b.onclick=function(e){ e.stopPropagation(); railFlyToggle(b, b.dataset.seg); }; });
  railSync(ST.CUR_VIEW);
}
export var RAIL_OPEN=null;
export function railFlyClose(){ var f=document.getElementById('railFly'); if(f) f.classList.remove('on'); RAIL_OPEN=null; try{ if(GN_NAV.open) gnMenuClose(); }catch(e){} }
export function railFlyToggle(btn, key){
  var f=document.getElementById('railFly'); if(!f) return;
  if(RAIL_OPEN===key){ railFlyClose(); return; }
  var seg=menuSegments().filter(function(s){ return s.key===key; })[0]; if(!seg) return;
  /* ㊿+142: 그룹 안 소제목(사업 영역 › Cloud NAC/MDR/기타)도 플라이아웃에 — 보이는 메뉴가 있는 소제목만 */
  var its=(seg.items||seg.buttons||[]).filter(function(el){ return el.tagName==='BUTTON'? visBtn(el) : !el.classList.contains('sub-empty'); });
  f.innerHTML=tpl`<div class="fh">${seg.label}</div>${rawHtml(its.map(function(b){
    if(b.tagName!=='BUTTON') return tpl`<div class="fsub">${b.textContent.trim()}</div>`;
    return tpl`<button type="button" data-v="${b.dataset.v}" aria-current="${b.dataset.v===ST.CUR_VIEW}">${navText(b)}</button>`; }).join(''))}`;
  f.querySelectorAll('button').forEach(function(b){ b.onclick=function(){ railFlyClose(); navMenu(b.dataset.v); }; });
  var r=btn.getBoundingClientRect();
  f.style.top='0px'; f.classList.add('on'); RAIL_OPEN=key;
  var top=Math.max(8, Math.min(r.top, window.innerHeight - f.offsetHeight - 12));
  f.style.top=top+'px';
}


/* ---- ㊿+167 «지니언스» 상단 메뉴 (㊿+166 의 왼쪽 사이드바를 대신) — #rail 을 상단바(.topbar) 첫 줄로 옮겨 차콜 메뉴 막대로
   · 구조는 menuSegments() 그대로(메뉴 편집·채널 숨김·권한 반영) · 그룹이 많아 묶음: PoC·데모+영업+인바운드 = «영업», 정산·목표+도구 = «정산·도구», 관리자 = 오른쪽 «관리»
   · 묶음 버튼을 누르면 큰 펼침 메뉴(#gnMenu · 그룹/소제목마다 한 칸) · 다른 묶음에 마우스를 올리면 바로 옮겨 감 · Esc·바깥 클릭·이동하면 닫힘 · ↓ 로 첫 항목
   · 배지: 홈 = 인박스 건수 · 데이터 점검 = 바로 고칠 항목 · 임대 장비 대시보드 = 처리 대기 · 인바운드 목록 = 미대응 → 묶음 버튼엔 합계 ---- */
export var GN_ICO={dash:'home', weekly:'calendar', contracts:'doc', live:'target', churn:'chart', churnrate:'chart', custflow:'users', leadsrc:'arrow', dcheck:'check',
  cngen:'cloud', cnpub:'cloud', cns1:'cloud', cnlgu:'cloud', mdrgen:'shield', mdrs1:'shield', mdrlgu:'shield', chdist:'layers', cnpns:'layers',
  eqboard:'board', ordernew:'doc', orders:'box', assets:'box', mdrnew:'flask', mdrops:'flask', oinew:'target', oi:'target', inbstat:'chart', inbound:'inbox',
  biz:'scale', targets:'target', quote:'doc', quotes:'doc', preport:'doc', s1:'scale', kk:'scale', price:'doc', cloud:'cloud', csite:'cloud', report:'doc', aiknow:'spark',
  log:'clock', adminx:'gear', ops:'tool', account:'user'};
export var GN_MERGE={'g:PoC·데모':'영업', 'g:영업':'영업', 'g:인바운드':'영업', 'g:정산·목표':'정산·도구', 'g:도구':'정산·도구', 'g:관리자':'관리'};
export var GN_BADGE={inb:null, dc:null, inbound:null};
export var GN_NAV={menus:{}, open:null};
export function buildGnNav(rail){
  var tb=document.querySelector('#app .topbar');
  if(tb && rail.parentElement!==tb) tb.insertBefore(rail, tb.firstChild);   /* 상단바 첫 줄 — sticky 높이(--tbh)에 같이 들어감 */
  var segs=[]; try{ segs=menuSegments(); }catch(e){}
  var tops=[], menus={}, seen={};
  segs.forEach(function(s){
    if(s.grp){
      if(s.grp.classList.contains('mhide')) return;
      var its=(s.items||s.buttons||[]).filter(function(el){ return el.tagName==='BUTTON'? visBtn(el) : !el.classList.contains('sub-empty'); });
      if(!its.some(function(el){ return el.tagName==='BUTTON'; })) return;
      /* 소제목(사업 영역 › Cloud NAC/MDR/기타)이 있으면 소제목마다 한 칸 */
      var cols=[], cur=null;
      its.forEach(function(el){
        if(el.tagName!=='BUTTON'){ cur={t:el.textContent.trim(), items:[]}; cols.push(cur); return; }
        if(!cur){ cur={t:s.label, items:[]}; cols.push(cur); }
        cur.items.push({v:el.dataset.v, t:navText(el)});
      });
      cols=cols.filter(function(c){ return c.items.length; });
      var mk2=GN_MERGE[s.key]? 'm:'+GN_MERGE[s.key] : s.key, lab=GN_MERGE[s.key]||s.label;
      if(!menus[mk2]){ menus[mk2]={key:mk2, label:lab, cols:[]}; if(!seen[mk2]){ seen[mk2]=1; tops.push({seg:mk2}); } }
      if(GN_MERGE[s.key] && cols.length===1) cols[0].t=s.label;
      menus[mk2].cols=menus[mk2].cols.concat(cols);
    }else{
      if(!visBtn(s.btn)) return;
      tops.push({v:s.btn.dataset.v, t:navText(s.btn)});
    }
  });
  GN_NAV.menus=menus; GN_NAV.open=null;
  var chev='<svg class="gn-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  function topBtn(o){
    if(o.v) return tpl`<button type="button" class="gn-tb" data-v="${o.v}" title="${o.t}" aria-current="false">${o.t}<span class="gn-bd" hidden></span></button>`;
    var m=menus[o.seg];
    return tpl`<button type="button" class="gn-tb" data-seg="${o.seg}"${rawHtml(/장비/.test(o.seg)? ' data-eq="1"':'')} aria-haspopup="true" aria-expanded="false" aria-controls="gnMenu" aria-current="false" title="${m.label} — 눌러서 화면 목록">${m.label}<span class="gn-bd" hidden></span>${rawHtml(chev)}</button>`;
  }
  var adm=tops.filter(function(o){ return o.seg==='m:관리'; })[0];
  var h=tpl`<div class="gn-bar"><a class="gn-logo" data-v="dash" href="#" aria-label="Genians — 홈"><svg class="gn-lw" viewBox="0 0 587.2 133.4" aria-hidden="true"><use href="#gnLogo"/></svg><svg class="gn-lm" viewBox="0 0 171.1 133.4" aria-hidden="true"><use href="#gnMark"/></svg></a>`;
  h+=tpl`<nav class="gn-tabs" aria-label="주 메뉴">${rawHtml(topBtn({v:'dash', t:'홈'}))}${rawHtml(tops.filter(function(o){ return o!==adm; }).map(topBtn).join(''))}</nav>`;
  var me=String(ST.AUTH_USER||'');
  h+=tpl`<div class="gn-right">${rawHtml(adm? topBtn(adm) : '')}<button type="button" class="gn-me" data-v="account" title="내 계정 · 로그아웃" aria-label="내 계정 메뉴 (${me})"><span class="gn-av">${(me.split('@')[0]||'?').slice(0,1).toUpperCase()}</span><span class="gn-wst"><b>${me.split('@')[0]||'로그인'}</b><small>${me.indexOf('@')>0? '@'+me.split('@')[1] : ''}</small></span></button></div></div>`;
  h+=tpl`<div class="gn-menu" id="gnMenu" role="menu" hidden></div>`;
  /* ㊿+172 오른쪽 위로 옮겨 둔 «검색» · «AI 대화» 버튼은 메뉴 줄을 다시 그리기 전에 위 띠로 꺼내 두었다가 다시 놓음(지우지 않게) */
  (function(){ var tb0=document.querySelector('#app .topbar'); ['cmdBar','aipOpenBtn'].forEach(function(id){ var x=document.getElementById(id); if(x && tb0 && rail.contains(x)) tb0.appendChild(x); }); })();
  rail.innerHTML=h;
  /* 역할 나누기(㊿+167): 위 검색 바 = 화면 이동·검색 · 홈 질문 칸 = AI 분석 */
  /* ㊿+171 위 «검색»은 작은 버튼 + Ctrl+K · 홈 가운데 입력칸이 검색·질문 주 진입점(home.js homeSetup) */
  try{ var ph=document.querySelector('#cmdBar .ph'); if(ph) ph.textContent='검색'; }catch(e){}
  rail.querySelectorAll('.gn-bar [data-v]').forEach(function(b){ b.onclick=function(e){ e.preventDefault(); gnMenuClose();
    if(b.classList.contains('gn-me') && ST.SB_TOKEN){ e.stopPropagation(); b.setAttribute('aria-haspopup','menu'); toggleAuthMenu(b); return; }   /* ㊿+169 계정 진입점 하나: 내 계정 · 로그아웃 */
    navMenu(b.dataset.v); }; });
  rail.querySelectorAll('.gn-tb[data-seg]').forEach(function(b){
    b.onclick=function(e){ e.stopPropagation(); if(GN_NAV.open===b.dataset.seg) gnMenuClose(); else gnMenuOpen(b); };
    b.onmouseenter=function(){ if(GN_NAV.open && GN_NAV.open!==b.dataset.seg) gnMenuOpen(b); };
    b.onkeydown=function(e){ if(e.key==='ArrowDown'){ e.preventDefault(); gnMenuOpen(b); var f=document.querySelector('#gnMenu .gn-mi'); if(f) f.focus(); } };
  });
  if(!SHELL_ONCE.gnm){ SHELL_ONCE.gnm=1;
    document.addEventListener('click', function(e){ var r=document.getElementById('rail'); if(GN_NAV.open && r && !r.contains(e.target)) gnMenuClose(); });
    document.addEventListener('keydown', function(e){ if(e.key==='Escape' && GN_NAV.open){ var k=GN_NAV.open; gnMenuClose(); var b=document.querySelector('#rail .gn-tb[data-seg="'+k.replace(/["\\]/g,'')+'"]'); if(b) b.focus(); } });
  }
  try{ placeSearchBtn(); }catch(e){}
  railSync(ST.CUR_VIEW);
}
export function gnMenuClose(){
  var m=document.getElementById('gnMenu'); if(m){ m.hidden=true; m.innerHTML=''; }
  document.querySelectorAll('#rail .gn-tb[aria-expanded="true"]').forEach(function(b){ b.setAttribute('aria-expanded','false'); });
  GN_NAV.open=null;
}
export function gnMenuOpen(btn){
  var m=document.getElementById('gnMenu'), rail=document.getElementById('rail'), d=GN_NAV.menus[btn.dataset.seg]; if(!m || !rail || !d) return;
  document.querySelectorAll('#rail .gn-tb[aria-expanded="true"]').forEach(function(b){ b.setAttribute('aria-expanded','false'); });
  var bdOf=gnBadges(), v0=ST.CUR_VIEW;
  m.innerHTML=tpl`<div class="gn-mh"><b>${d.label}</b><span>${rawHtml(String(d.cols.reduce(function(a,c){ return a+c.items.length; },0)))}개 화면</span></div><div class="gn-cols">${rawHtml(d.cols.map(function(c){
    return tpl`<div class="gn-sec${c.items.length>5?' wide':''}"><div class="gn-st">${c.t}</div><div class="gn-sl">${rawHtml(c.items.map(function(it){ var n=bdOf[it.v]||0;
      return tpl`<button type="button" class="gn-mi" role="menuitem" data-v="${it.v}" aria-current="${it.v===v0?'true':'false'}">${rawHtml(ico(GN_ICO[it.v]||iconFor(it.t, it.v), 16))}<span class="gn-l">${it.t}</span>${rawHtml(n? tpl`<span class="gn-bd hot">${rawHtml(n>99?'99+':String(n))}</span>` : '')}</button>`; }).join(''))}</div></div>`; }).join(''))}</div>`;
  /* ㊿+171 «자주 쓰는 화면»은 묶음마다 반복하지 않고 검색(빈 입력칸 · Ctrl+K)과 홈 «최근 작업» 한 곳으로 — 지니언스 밖(예전 디자인)만 그대로 */
  var fq=isGN()? [] : freqTop(5).filter(function(v){ return v!==v0; });
  if(fq.length) m.insertAdjacentHTML('beforeend', tpl`<div class="gn-mf"><div class="gn-st">${rawHtml(ico('star',13))} 자주 쓰는 화면</div><div class="gn-fl">${rawHtml(fq.map(function(v){ var t0=viewLabel(v);
    return tpl`<button type="button" class="gn-mi gn-fq" role="menuitem" data-v="${v}">${rawHtml(ico(GN_ICO[v]||iconFor(t0, v), 15))}<span class="gn-l">${t0}</span></button>`; }).join(''))}</div></div>`);
  m.hidden=false; btn.setAttribute('aria-expanded','true'); GN_NAV.open=btn.dataset.seg;
  var rr=rail.getBoundingClientRect(), br=btn.getBoundingClientRect(), w=m.offsetWidth, left=br.left-rr.left;
  if(btn.closest('.gn-right')) left=br.right-rr.left-w;
  m.style.left=Math.max(12, Math.min(left, rr.width-w-12))+'px';
  var its=[].slice.call(m.querySelectorAll('.gn-mi'));
  its.forEach(function(b, i){
    b.onclick=function(){ gnMenuClose(); navMenu(b.dataset.v); };
    b.onkeydown=function(e){
      if(e.key==='ArrowDown' || e.key==='ArrowUp'){ e.preventDefault(); var j=(i+(e.key==='ArrowDown'?1:-1)+its.length)%its.length; its[j].focus(); }
      else if(e.key==='Tab'){ gnMenuClose(); }
    };
  });
}
/* 화면별 배지 숫자 (펼침 메뉴 · 묶음 버튼 합계) */
export function gnBadges(){
  var pend=(ST.RAWX.orders||[]).filter(function(o){ return ['접수','출하요청','배송중'].indexOf(o.status)>=0; }).length;
  return {dcheck:GN_BADGE.dc||0, inbound:GN_BADGE.inbound||0, eqboard:pend};
}
export function gnNavSync(rail, v){
  var bdOf=gnBadges();
  function setBd(b, n, hot){ var s=b.querySelector('.gn-bd'); if(!s) return; s.hidden=!n; s.textContent=n>99?'99+':String(n||''); s.classList.toggle('hot', !!hot); }
  rail.querySelectorAll('.gn-tb').forEach(function(b){
    if(b.dataset.v){ b.setAttribute('aria-current', b.dataset.v===v? 'true':'false'); if(b.dataset.v==='dash') setBd(b, GN_BADGE.inb, GN_BADGE.inb>0); return; }
    var d=GN_NAV.menus[b.dataset.seg]; if(!d) return;
    var vs=[]; d.cols.forEach(function(c){ c.items.forEach(function(it){ vs.push(it.v); }); });
    b.setAttribute('aria-current', vs.indexOf(v)>=0? 'true':'false');
    setBd(b, vs.reduce(function(a,x){ return a+(bdOf[x]||0); },0), true);
  });
  var me=rail.querySelector('.gn-me'); if(me) me.setAttribute('aria-current', v==='account'? 'true':'false');
  gnTitleSync(v);
}
/* 상단바 왼쪽 — 지금 화면 이름 + 한 줄(홈: 날짜 · 읽은 시각 / 그 밖: 메뉴 그룹) */
export function gnTitleSync(v){
  var t=document.getElementById('gnTitle'), s=document.getElementById('gnSub'); if(!t || !s) return;
  var b=[].slice.call(document.querySelectorAll('#side button[data-v]')).filter(function(x){ return x.dataset.v===(v||'dash'); })[0];
  var name= v==='dash'||!v? '홈' : (b? navText(b) : '');
  var grp='';
  if(b && v!=='dash'){ var sub=navSub(b); for(var el=b.previousElementSibling; el; el=el.previousElementSibling){ if(el.classList && el.classList.contains('grp')){ grp=el.textContent.trim(); break; } } grp=[grp, sub].filter(Boolean).join(' › '); }
  if(v==='dash'||!v){ var d=new Date(), la=document.getElementById('loadedAt'); grp=(d.getMonth()+1)+'월 '+d.getDate()+'일 ('+'일월화수목금토'.charAt(d.getDay())+')'+(la && la.textContent? ' · '+la.textContent.replace(/\d{4}-\d\d-\d\d\s*/,'') : ''); }
  t.textContent=name; s.textContent=grp;
  /* ㊿+172 메뉴 재진입은 마지막 상태 그대로 — 처음 상태로는 여기 «초기화»(표 · 화면별 선택이 있는 화면) */
  var rb=document.getElementById('btnViewReset'), tt=t.parentElement;
  var can=!!v && v!=='dash' && ((GRIDS[v] && !GRIDS[v].custom) || VIEW_UI[v]);
  if(!rb && tt){ rb=document.createElement('button'); rb.type='button'; rb.id='btnViewReset'; rb.className='cbtn vreset'; rb.textContent='초기화'; rb.title='이 화면을 처음 상태로 — 검색 · 필터 · 정렬 · 쪽 · 화면별 선택 (메뉴를 다시 눌러도 지금 상태는 그대로 남습니다)'; rb.onclick=function(){ viewResetHard(ST.CUR_VIEW); }; tt.appendChild(rb); }
  if(rb){ rb.hidden=!(can || v==='quote'); var qt=v==='quote';   /* 견적은 메뉴 재진입에 종류 고르기 창을 다시 띄우지 않음 — 여기서 */
    rb.textContent=qt? '견적 종류 다시 고르기' : '초기화'; rb.title=qt? '기업 · 공공 · 발주서 종류 고르기 창을 다시 엽니다' : '이 화면을 처음 상태로 — 검색 · 필터 · 정렬 · 쪽 · 화면별 선택 (메뉴를 다시 눌러도 지금 상태는 그대로 남습니다)'; }
}

/* ㊿+168 금액 단위 안내 — 화면마다 실제 단위(가격표 = 원 · 금액 없는 화면은 숨김 · 주간보고 예상매출 = 백만원) · 누르면 용어 설명 */
export var UNIT_NONE={quotes:1, ordernew:1, orders:1, assets:1, eqboard:1, inbound:1, inbstat:1, mdrnew:1, mdrops:1, log:1, account:1, adminx:1, ops:1, aiknow:1, csite:1, kk:1, s1:1, quote:1, preport:1};
export function unitSync(v){
  var u=document.getElementById('unitBadge'); if(!u) return;
  if(!u.__terms){ u.__terms=1; u.setAttribute('role','button'); u.tabIndex=0; u.style.cursor='pointer';
    u.onclick=function(){ openTerms(); }; u.onkeydown=function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openTerms(); } }; }
  var mode= v==='price'? 'won' : (UNIT_NONE[v]? 'none' : (v==='weekly'? 'weekly' : 'kw'));
  u.dataset.unit=mode; u.hidden=(mode==='none');
  if(mode==='won'){ u.innerHTML=tpl`₩ <b>원</b> 단위<span class="ub-long"> · VAT별도</span>`; u.title='가격표는 원 단위입니다 (원/노드·월 · 원/Agent·년 등 표마다 표시 · VAT별도). 포탈의 다른 화면은 천원 단위 — 누르면 용어 설명'; }
  else if(mode==='weekly'){ u.innerHTML=tpl`₩ <b>천원</b> 단위<span class="ub-long"> · 예상매출 백만원</span>`; u.title='주간회의의 금액은 천원 단위, 주간보고 «예상매출»은 시트 그대로 백만원 단위입니다 — 누르면 용어 설명'; }
  else { u.innerHTML=tpl`₩ <b>천원</b> 단위<span class="ub-long"> 표시</span>`; u.title='포탈의 금액은 천원 단위입니다 (입력도 천원 · 저장은 원) — 예) 480천원 = 480,000원 · 가격표·견적만 원 단위 · 누르면 MRR·매출·ARR 용어 설명'; }
}
export function openTerms(){
  var old=document.getElementById('ovlTerms'); if(old){ old.remove(); }
  var ov=document.createElement('div'); ov.id='ovlTerms'; ov.className='ovl on';
  var D=[['금액 단위','포탈 금액은 천원 단위입니다 — 입력도 천원(480 → 480,000원), 저장은 원. 가격표·견적서는 원 단위(VAT별도), 주간보고 «예상매출»은 백만원.'],
    ['계약 MRR','계약서의 월 금액(계약 1건). 계약 목록 · 고객 360의 «계약 월 금액».'],
    ['당월 인식 매출 (홈의 «당월 MRR»)','기준월에 월 매출표에 잡힌 금액의 합 — 부속 계약 포함, 시작·종료·해지 월을 반영. 사업 영역의 «고객 합계 · 당월 매출»도 같은 값.'],
    ['연환산 ARR','당월 인식 매출 × 12. 목표 ARR 진행은 12월 계약분(12월 MRR × 12)도 함께 표시.'],
    ['비즈포탈 회계매출','회계 시스템에 잡힌 매출(세금계산서 기준). 포탈 매출과의 차이는 정산 › 비즈포탈 차액에서 고객사별로 대조.'],
    ['곳 · 건 · 대','고객사 수는 «곳», 계약·신청·알림 대상은 «건», 실물 장비는 «대».']];
  ov.innerHTML=tpl`<div class="modal" role="dialog" aria-modal="true" aria-labelledby="termsT" style="width:min(560px,100%)"><h3 id="termsT">단위 · 용어</h3><dl class="terms">${rawHtml(D.map(function(x){ return tpl`<dt>${x[0]}</dt><dd>${x[1]}</dd>`; }).join(''))}</dl>`+
    tpl`<div class="mact"><button type="button" class="pill" id="termsX">닫기</button></div></div>`;
  document.body.appendChild(ov);
  var x=ov.querySelector('#termsX'); x.onclick=function(){ ov.remove(); }; ov.onclick=function(e){ if(e.target===ov) ov.remove(); };
  setTimeout(function(){ x.focus(); }, 30);
}
export function railSync(v){
  try{ unitSync(v); }catch(e){}
  var rail=document.getElementById('rail'); if(!rail) return;
  if(rail.querySelector('.gn-bar')){ gnNavSync(rail, v); mtabsSync(v); return; }
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
  m.innerHTML=tabs.map(function(t){ return tpl`<button type="button" data-v="${rawHtml(t[0])}" aria-current="false">${rawHtml(ico(t[2],20))}${t[1]}</button>`; }).join('');
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
    go:function(){
      /* ㊿+171 지니언스: 다른 화면에서는 그 자리에서 검색·질문 창으로(보던 목록 · 조건 그대로 · 문맥으로 함께) */
      if(homeOn()){ ask(q, {from:'help', ctx:ST.CUR_VIEW!=='dash'? srchCtx() : null}); return; }   /* ㊿+172 그 자리에서 AI 패널로(보던 화면 그대로) */
      switchView('dash'); var qi=document.getElementById('q'); if(qi){ qi.value=q; } try{ ask(q); }catch(e){} try{ document.querySelector('.ask').scrollIntoView({block:'start',behavior:'smooth'}); }catch(e){} }};
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
export var IB_OPEN={};
/* ㊿+169 홈 맨 위 요약 한 줄 — 매출 · 고객 · 만료 위험 · 처리 필요 (숫자는 아래 사업 현황 타일·처리할 일과 같은 계산) · 폰에서는 이 줄이 먼저 */
export function gnSumRender(rows){
  var host=document.getElementById('gnSum'), box=document.getElementById('ccInbox');
  if(!isGN() || !box || !ST.DATA || ST.IS_EQUIP){ if(host) host.remove(); return; }
  if(!host){ host=document.createElement('div'); host.id='gnSum'; host.className='gn-sum'; box.parentElement.insertBefore(host, box); }
  var list=idxs(), b=STATE.base, EN=expN(), m0=monthlyTotal(list,b), m1=b>0? monthlyTotal(list,b-1) : 0, d=m1? (m0-m1)/m1*100 : null;
  var lv=null; try{ lv=liveData(b); }catch(e){} var uq={}, ps=0, per={};
  if(lv && lv.ok) lv.rows.forEach(function(x){ if(STATE.lines[x.line]===false) return; if(STATE.ind && x.ind!==STATE.ind) return; uq[x.cust]=1; (per[x.line]=per[x.line]||{})[x.cust]=1; });
  Object.keys(per).forEach(function(l){ ps+=Object.keys(per[l]).length; }); var nC=Object.keys(uq).length;
  var XS=expScan(list,b,EN), l1=rows.filter(function(o){ return o.lv===1; }), l2=rows.filter(function(o){ return o.lv===2; });
  var n1=l1.reduce(function(a,o){ return a+(+o.n||0); },0), n2=l2.reduce(function(a,o){ return a+(+o.n||0); },0);
  function cell(k, cls, lab, v, u, sub, tip){ return tpl`<button type="button" class="gs-c ${rawHtml(cls)}" data-k="${k}" title="${tip}"><span class="gs-l">${lab}</span><span class="gs-v"><b class="num">${v}</b><small>${u}</small></span><span class="gs-s">${sub}</span></button>`; }
  host.innerHTML=tpl`<h2 class="sr">요약</h2>`+
    cell('mrr','', '당월 매출(MRR) · '+mk(b), won(m0), '천원', d==null? '전월 자료 없음' : '전월 대비 '+(d>=0?'+':'')+d.toFixed(1)+'%', '기준월 인식 매출(천원) — 눌러서 사업 현황으로')+
    cell('live','', 'LIVE 고객', String(nC), '곳', '제품별 합 '+ps+(ps>nC? ' (두 제품 이상 '+(ps-nC)+'곳)':''), '회사 수 기준 — 눌러서 LIVE 고객사 목록')+
    cell('exp', XS.rows.length? 'warn':'', EN+'개월 내 만료 위험', String(XS.rows.length), '건', '고객사 '+XS.custN+'곳 · 월 '+won(XS.amt)+'천원', '원계약 기준(부속 계약 제외) — 눌러서 같은 목록')+
    cell('todo', l1.length? 'crit':'', '처리 필요', String(n1+n2), '건', '즉시 '+l1.length+'종 '+n1+'건 · 확인 '+l2.length+'종 '+n2+'건', '오늘 처리할 일의 즉시·확인 칸 대상 건수 — 눌러서 처리할 일로');
  host.querySelectorAll('.gs-c').forEach(function(c){ c.onclick=function(){ var k=c.dataset.k;
    if(k==='mrr'){ var h=document.getElementById('gnBizH')||document.getElementById('ccHeroHost'); if(h) h.scrollIntoView({behavior:'smooth', block:'start'}); }
    else if(k==='live') switchView('live');
    else if(k==='exp') kpiOpen('exp');
    else { box.scrollIntoView({behavior:'smooth', block:'start'}); var f=box.querySelector('.ib-lane.crit .cbtn.pri, .ib-lane .cbtn.pri'); if(f) setTimeout(function(){ f.focus(); }, 300); } }; });
}
/** ㊿+172 장비 할 일 → 그 신청 하나로 바로(신청 내역에서 그 행만 · 시리얼 · 회수는 그 화면에서) */
export function eqLinks(list){ return (list||[]).slice(0,6).map(function(o){ return {l:(o.customer||'—')+' #'+o.id+(o.model? ' · '+o.model : ''), go:function(){ gridGoPre('orders', '신청 #'+o.id+' — '+(o.customer||''), function(r){ return r.id===o.id; }); }}; }); }
/** 이번 달 남은 날(오늘 포함) — 할 일 «기한» 급한 정도 */
export function monthLeft(){ var d=new Date(), e=new Date(d.getFullYear(), d.getMonth()+1, 0); return e.getDate()-d.getDate()+1; }
/** 장비 보드를 «처리 대기» 또는 «회수 진행»만 보이게 — 홈 알림·요약 타일과 같은 기준 */
export function eqbOnly(kind){ EQB.only=kind; switchView('eqboard'); }
export function renderInbox(){
  if(!isCC()) return;
  var box=document.getElementById('ccInbox'); if(!box || !ST.DATA || !ST.SB_TOKEN){ if(box) box.innerHTML=''; return; }
  var list=idxs(), b=STATE.base, EN=expN(), EQ=!!ST.IS_EQUIP, GNI0=isGN();
  var orders=ST.RAWX.orders||[];
  var pendL=orders.filter(function(o){ return ['접수','출하요청','배송중'].indexOf(o.status)>=0; });
  /* ㊿+171 회수 진행 = 장비 보드 «회수 진행»과 같은 범위(EQB_ONLY.ret) — 회수예정 + 일부 회수 중(회수완료·취소 아님 · 회수한 시리얼 있음) · 홈에는 둘을 나눠 표시 */
  var retL=orders.filter(EQB_ONLY.ret[1]), retA=retL.filter(function(o){ return o.status==='회수예정'; }), retP=retL.filter(function(o){ return o.status!=='회수예정'; });
  /* ㊿+168 만료 = 사업 현황 타일 · 만료 예정 위젯과 같은 공통 집계(expScan — 원계약만 · 부속은 함께 만료) */
  var XS=EQ? {rows:[], amt:0, custN:0} : expScan(list, b, EN), expL=XS.rows.map(function(k){ return ST.DATA.rows[k]; }), expAmt=XS.amt;
  var curYm=monOf(b)+'월', bizDone=EQ || bizHas(+mk(b).slice(0,4), monOf(b));   /* ㊿+176 연도까지 */
  var todayS=todayStr();
  var oiLate=EQ? [] : (ST.RAWX.oi||[]).filter(function(o){ return o.next_date && String(o.next_date).slice(0,10)<todayS && oiOpen(o); });   /* ㊿+170 진행 중 = 수주·계산서발행·종료·중지·실패 아님(OI 타일·빠른 보기와 같은 기준) */
  var inbN=EQ? 0 : (ST.INB_TODO? ST.INB_TODO.n : null);
  var dow=new Date().getDay(), toMon=(8-dow)%7, wkTxt= dow===1? '오늘':'D-'+(toMon===0?7:toMon);
  var rows=[], zeros=[], snz=0;
  function add(key, o){ if(ccSnoozed(key)){ snz++; return; } o.key=key; rows.push(o); }
  /* ㊿+174 장비 «담당» = 알림함에서 정한 처리 담당(work_assign) → 없으면 신청한 사람. 신청서의 mgr_name 은 «고객 담당자»(고객 쪽 사람)라 쓰지 않음 */
  function eqOwn(o){ var a=NTF.asg[String(o.id)]; return a? ntfWho(a.assignee) : (o.requester? String(o.requester).split('@')[0] : ''); }
  function names(arr, f, n){ var u={}; arr.forEach(function(x){ var v=f(x); if(v) u[v]=1; }); var ks=Object.keys(u); return ks.slice(0,n||3).join(', ')+(ks.length>(n||3)? ' 외 '+(ks.length-(n||3))+'곳':''); }
  if(pendL.length){
    var oldest=pendL.map(function(o){ return String(o.created_at||'').slice(0,10); }).filter(Boolean).sort()[0];
    var age=oldest? Math.floor((new Date(todayS).getTime()-new Date(oldest).getTime())/864e5) : 0;
    var byCh={}; pendL.forEach(function(o){ byCh[o.channel||'기타']=(byCh[o.channel||'기타']||0)+1; });
    var pq=pendL.reduce(function(a,o){ return a+(+o.qty||eqWant(o).length||1); },0);
    add('eq', {lv:age>=3?1:2, ic:'box', cls:'warn', n:pendL.length, t:tpl`처리 대기 장비 신청 <span class="num">${pendL.length}건</span>${rawHtml(age>=1? ' — 가장 오래된 건 '+age+'일 경과':'')}`,
      s:Object.keys(byCh).map(function(c){ return c+' '+byCh[c]; }).join(' · ')+' · '+names(pendL, function(o){ return o.customer; }),
      who:names(pendL, function(o){ return o.customer; }), own:names(pendL, eqOwn, 2)||'',
      due:age>=3? '오늘 — '+age+'일째 대기' : '3일 안', imp:'출고 대기 '+pq+'대 · '+Object.keys(byCh).map(function(c){ return c+' '+byCh[c]; }).join(' · '),
      links:eqLinks(pendL), nm:'장비 신청 처리 대기', cnt:'신청 '+pendL.length+'건', dueS:age>=3? '지남 · '+age+'일째' : '3일 안', dk:age>=3? 0 : 1,
      acts:[{l:'보류', go:function(){ ccSnooze('eq',1); }},{l:'대기 신청 '+pendL.length+'건 보기', pri:1, go:function(){ eqbOnly('pend'); }}]});
  }
  if(retL.length){
    var rA=0, rD=0; retL.forEach(function(o){ rA+=eqWant(o).length; rD+=eqRetSet(o).length; });
    add('ret', {lv:3, ic:'box', cls:'info', n:retL.length, t:tpl`회수 진행 중 <span class="num">${retL.length}건</span>${rawHtml(retP.length? ' — 회수예정 '+retA.length+' · 일부 회수 중 '+retP.length : '')}`,
      links:eqLinks(retL),
      nm:'장비 회수 진행'+(retA.length && retP.length? ' (회수예정 '+retA.length+' · 일부 회수 중 '+retP.length+')' : retP.length? ' (일부 회수 중)' : ''), cnt:'신청 '+retL.length+'건', dueS:'회수 일정대로', dk:3,
      s:retL.slice(0,3).map(function(o){ var all=eqWant(o).length, d=eqRetSet(o).length; return (o.customer||'')+' '+d+'/'+all+'대'; }).join(' · ')+(retL.length>3? ' 외 '+(retL.length-3)+'건':''),
      who:names(retL, function(o){ return o.customer; }), own:names(retL, eqOwn, 2)||'', due:'회수 일정대로', imp:'회수 완료 '+rD+'대 / 대상 '+rA+'대',
      acts:[{l:'회수 진행 '+retL.length+'건 보기', pri:1, go:function(){ eqbOnly('ret'); }}]});
  }
  /* 만기 관리 (㊿+127): 종료월이 지났는데 미처리 → 이미 LIVE 에서 빠짐 · 이달 만기 → 다음 달 1일에 빠짐. 각 행 원클릭 처리 창으로 */
  var RS=null; if(!EQ){ try{ RS=renewScan(b); }catch(e){ RS=null; } ensureLeadSrc(function(filled){ if(filled) try{ renderInbox(); renderKpis(); }catch(e2){} }); }
  if(RS && RS.lapsed.length){
    var lsum=RS.lapsed.reduce(function(a,r){ return a+(r.mrr||0); },0), lrec=RS.checking.length;
    add('rnl', {lv:1, ic:'clock', cls:'crit', n:RS.lapsed.length, t:tpl`만기 지났는데 미처리 <span class="num">${RS.lapsed.length}건</span> — 이미 LIVE 에서 빠졌습니다${rawHtml(lrec? ' (최근 2개월 '+lrec+'건)':'')}`,
      s:names(RS.lapsed, function(r){ return r.cust; })+' · 월 '+won(lsum)+'천원 · 연장이면 되살리고, 끝났으면 서비스종료·해지로 정리',
      who:names(RS.lapsed, function(r){ return r.cust; }), own:'', due:'지금 — 종료월이 지남', imp:'월 '+won(lsum)+'천원 · LIVE 에서 빠짐',
      nm:'만기 지났는데 미처리 계약', cnt:'계약 '+RS.lapsed.length+'건', dueS:'지남', dk:0,
      acts:[{l:'만기 지난 '+RS.lapsed.length+'건 연장·종료 처리', pri:1, go:function(){ openRenewList('lapsed'); }}]});
  }
  if(RS && RS.due.length){
    var dsum=RS.due.reduce(function(a,r){ return a+(r.mrr||0); },0);
    add('rnd', {lv:2, ic:'clock', cls:'warn', n:RS.due.length, t:tpl`${mk(b)} 만기 <span class="num">${RS.due.length}건</span> — ${mk(b+1)} 1일 LIVE 에서 빠집니다`,
      s:names(RS.due, function(r){ return r.cust; })+' · 월 '+won(dsum)+'천원'+(RS.next.length? ' · 다음 달 만기 '+RS.next.length+'건 대기':''),
      nm:mk(b)+' 만기 계약 처리', cnt:'계약 '+RS.due.length+'건', dueS:mk(b)+' 말까지', dk:monthLeft()<=3? 1 : 2,
      who:names(RS.due, function(r){ return r.cust; }), own:'', due:mk(b)+' 말까지 ('+mk(b+1)+' 1일 LIVE 제외)', imp:'월 '+won(dsum)+'천원'+(RS.next.length? ' · 다음 달 만기 '+RS.next.length+'건 대기':''),
      acts:[{l:'보류', go:function(){ ccSnooze('rnd',3); }},{l:'이달 만기 '+RS.due.length+'건 처리', pri:1, go:function(){ openRenewList('due'); }}]});
  }
  /* 데이터 점검 (㊿+133): 바로 고쳐야 할 항목이 있으면 한 줄 */
  /* ㊿+171 데이터 점검 «바로 고칠 것» — «만기 지났는데 미처리»(c_lapsed)는 위 만기 처리 줄과 같은 계약이라 빼고 셈(같은 문제를 두 번 · 두 메뉴에 강조하지 않음) */
  if(!EQ){ var DS=null; try{ DS={crit:0, warn:0, items:{}}; dcRules().forEach(function(r){ if(!r.items.length || r.id==='c_lapsed') return; if(r.sev==='crit' || r.sev==='warn') DS[r.sev]+=r.items.length; if(r.sev==='crit') DS.items[r.title]=r.items.length; }); }catch(e){ DS=null; }
    if(DS && DS.crit){ var dcs=Object.keys(DS.items).filter(function(k){ return DS.items[k]; }).slice(0,3).map(function(k){ return k+' '+DS.items[k]; }).join(' · ');
      add('dc', {lv:1, ic:'scale', cls:'crit', n:DS.crit, t:tpl`데이터 점검 — 바로 고칠 항목 <span class="num">${rawHtml(DS.crit)}건</span>${rawHtml(DS.warn? ' · 확인 필요 '+DS.warn+'건':'')}`,
      s:dcs, who:dcs, own:'관리자', due:'오늘', imp:'매출·LIVE·만기 숫자가 틀리게 나올 수 있음', nm:'데이터 바로 고칠 것', cnt:'항목 '+DS.crit+'건', dueS:'오늘', dk:1,
      acts:[{l:'보류', go:function(){ ccSnooze('dc',3); }},{l:'바로 고칠 '+DS.crit+'건 보기', pri:1, go:function(){ switchView('dcheck'); }}]}); } }
  if(GNI0 && !EQ){   /* ㊿+171 지니언스: 만료 예정 전체가 아니라 «재약정 대응 필요»(자동연장 · 재약정 등록 제외) — 홈 핵심 현황과 같은 숫자라 «지금 챙길 일» 3줄에서는 빠지고 «전체 할 일»에만 */
    var RN=renewNeedScan(list, b, EN), rnL=RN.rows.map(function(k){ return ST.DATA.rows[k]; });
    if(rnL.length){ var ends2=rnL.map(function(r){ return r.endIdx; }).sort(function(x,y){ return x-y; });
      add('exp', {lv:3, ic:'clock', cls:'info', n:rnL.length, kpi:1, t:tpl`재약정 대응 필요 <span class="num">${rnL.length}건</span> · 고객사 ${rawHtml(RN.custN)}곳 — 월 <span class="num">${won(RN.amt)}</span>천원`,
        nm:'재약정 대응(만료 전 연락)', cnt:'계약 '+rnL.length+'건', dueS:'종료 '+mk(ends2[0])+(ends2.length>1? '~'+mk(ends2[ends2.length-1]):''), dk:ends2[0]<=b? 2 : 3,
        who:names(rnL, function(r){ return r.cust; }), own:'', due:'종료 '+mk(ends2[0])+(ends2.length>1? '~'+mk(ends2[ends2.length-1]):''), imp:'월 '+won(RN.amt)+'천원 · '+EN+'개월 내 만료 '+XS.rows.length+'건 중 자동연장 '+RN.auto.length+' · 재약정 등록 '+RN.sure.length+' 제외',
        acts:[{l:'재약정 대응 '+rnL.length+'건 보기', pri:1, go:function(){ kpiOpen('expNeed'); }}]}); }
  }
  else if(expL.length && !(RS && EN===1 && RS.due.length)){
    var ends=expL.map(function(r){ return r.endIdx; }).sort(function(x,y){ return x-y; });
    add('exp', {lv:3, ic:'clock', cls:'info', n:expL.length, t:tpl`${rawHtml(EN)}개월 내 만료 원계약 <span class="num">${expL.length}건</span> · 고객사 ${rawHtml(XS.custN)}곳 — 월 <span class="num">${won(expAmt)}</span>천원`,
      s:names(expL, function(r){ return r.cust; })+' · 종료 '+mk(ends[0])+(ends.length>1? '~'+mk(ends[ends.length-1]):'')+' · 재약정 타깃',
      who:names(expL, function(r){ return r.cust; }), own:'', due:'종료 '+mk(ends[0])+(ends.length>1? '~'+mk(ends[ends.length-1]):''), imp:'월 '+won(expAmt)+'천원 · 재약정 대상',
      acts:[{l:'만료 원계약 '+expL.length+'건 보기', pri:1, go:function(){ kpiOpen('exp'); }}]});
  }
  if(!bizDone){
    add('biz', {lv:2, ic:'scale', cls:'', n:1, t:curYm+' 비즈포탈 차액이 아직 입력되지 않았습니다', s:'엑셀을 올리면 고객사·회계매출 기준으로 자동 대조합니다',
      who:curYm+' 비즈포탈 차액', own:'정산 담당', due:curYm+' 마감 전', imp:'정산·목표 달성률이 «미입력»으로 남음', nm:curYm+' 비즈포탈 차액 입력', cnt:'1개월', dueS:curYm+' 마감 전', dk:monthLeft()<=3? 1 : 2,
      acts:[{l:'다음 주에', go:function(){ ccSnooze('biz',7); }},{l:'비즈포탈 엑셀 올리기', pri:1, go:function(){ switchView('biz'); }}]});
  }
  if(!EQ){
    if(inbN>0){
      add('inb', {lv:1, ic:'inbox', cls:'crit', n:inbN, t:tpl`인바운드 미대응 <span class="num">${rawHtml(inbN)}건</span>`, s:'진행중인데 '+qvCfg().inbIdle+'일 이상 대응 기록이 없습니다',
      who:'올해 진행중 인바운드', own:'인바운드 담당', due:'오늘', imp:qvCfg().inbIdle+'일 넘게 대응 기록 없음 — 놓친 문의일 수 있음', nm:'인바운드 장기 미대응', cnt:'문의 '+inbN+'건', dk:0, dueS:'오늘',
      acts:[{l:'미대응 '+inbN+'건 보기', pri:1, go:function(){ qvGo('inbound', 'idle'); }}]}); }
    else zeros.push('인바운드 미대응 '+(inbN==null? '…':'0'));
    /* ㊿+171 OI: 일정 지남(late)과 다음 행동 없음(nonext — 다음 할 일 또는 예정일이 빈 진행 중 OI)을 한 줄로 — 일정이 없는 건을 «할 일 없음»으로 보이지 않게 · 빠른 보기와 같은 기준 */
    var oiNone=EQ? [] : (ST.RAWX.oi||[]).filter(function(o){ return oiOpen(o) && (!o.next_action || !o.next_date); }), oiU={};
    oiLate.concat(oiNone).forEach(function(o){ oiU[o.id!=null? o.id : (o.customer+'|'+o.deal_name)]=o; }); var oiAll=Object.keys(oiU).map(function(k){ return oiU[k]; });
    if(oiAll.length){ var od=oiLate.map(function(o){ return String(o.next_date).slice(0,10); }).sort()[0], oAmt=oiAll.reduce(function(a,o){ return a+(+o.expect_amount||0); },0);
      var oiParts=[]; if(oiLate.length) oiParts.push('일정 지남 '+oiLate.length); if(oiNone.length) oiParts.push('다음 행동 없음 '+oiNone.length);
      var oiActs=[]; if(oiLate.length) oiActs.push({l:'일정 지난 OI '+oiLate.length+'건 보기', pri:1, go:function(){ qvGo('oi', 'late'); }});
      if(oiNone.length) oiActs.push({l:'다음 행동 없는 OI '+oiNone.length+'건 보기', pri:!oiLate.length? 1:0, go:function(){ qvGo('oi', 'nonext'); }});
      add('oi', {lv:2, ic:'target', cls:'warn', n:oiAll.length, t:tpl`OI 다음 행동 점검 <span class="num">${oiAll.length}건</span> — ${oiParts.join(' · ')}`, s:names(oiAll, function(o){ return o.customer; }),
      nm:'OI 다음 행동 점검 ('+oiParts.join(' · ')+')', cnt:'OI '+oiAll.length+'건', dueS:oiLate.length? '예정일 지남' : '일정 정하기', dk:oiLate.length? 0 : 2,
      who:names(oiAll, function(o){ return o.customer; }), own:names(oiAll, function(o){ return o.owner; }, 2)||'', due:oiLate.length? '예정일 지남 (가장 오래된 '+od+')' : '다음 할 일 · 예정일을 정해야 함', imp:(oAmt? '예상 금액 '+won(oAmt)+'천원 · ' : '')+'진행 중인데 다음 일정이 없거나 지남',
      acts:oiActs}); }
    else zeros.push('OI 일정 · 다음 행동 모두 있음');
  }
  zeros.push('주간회의 '+wkTxt);
  var la=document.getElementById('loadedAt'), GNI=GNI0;
  /* ㊿+169 지니언스: 할 일마다 대상 · 담당 · 기한 · 영향 → 다음 행동(구체적인 버튼 이름) */
  function metaHtml(o){ var m=[['대상',o.who],['담당',o.own||'미지정'],['기한',o.due],['영향',o.imp]].filter(function(x){ return x[1]; });
    return tpl`<dl class="ib-meta">${rawHtml(m.map(function(x){ return tpl`<div${rawHtml(x[0]==='담당' && !o.own? ' class="none" title="계약·장비 신청에 담당자 칸이 없거나 비어 있습니다"':'')}><dt>${x[0]}</dt><dd>${x[1]}</dd></div>`; }).join(''))}</dl>`; }
  function rowHtml(o,i,hid){ return tpl`<div class="ib-row" data-i="${rawHtml(i)}"${rawHtml(hid? ' hidden':'')}><span class="ib-ic ${rawHtml(o.cls)}">${rawHtml(ico(o.ic,16))}</span><div class="ib-b"><div class="ib-t">${rawHtml(o.t)}</div>${rawHtml(GNI && o.who? metaHtml(o) : tpl`<div class="ib-s" title="${o.s||''}">${o.s||''}</div>`)}</div>`+
      tpl`<div class="ib-acts">${rawHtml(o.acts.map(function(a,j){ return tpl`<button type="button" class="cbtn${a.pri?' pri':''}" data-i="${rawHtml(i)}" data-j="${rawHtml(j)}">${a.l}</button>`; }).join(''))}</div></div>`; }
  /* ㊿+171 지니언스 홈: 지금 챙길 일 3줄 · 핵심 현황 3칸(home.js) — 대상 건수를 더한 «총합»은 쓰지 않음(규칙끼리 대상이 겹칠 수 있음) */
  if(GNI && !EQ){ try{ homeRender(rows, zeros, snz); }catch(e){ console.warn('home', e); }
    GN_BADGE.inb=null; GN_BADGE.inbound=inbN||0; GN_BADGE.dc=(DS && DS.crit)||0; ccGreeting(rows.length); try{ railSync(ST.CUR_VIEW); }catch(e){} return; }
  var tgtN=rows.reduce(function(a,o){ return a+(+o.n||0); },0);
  var h=tpl`<div class="ib-head"><h2>${GNI? '오늘 처리할 일' : '인박스'} <span class="ctag${rows.length?' warn':' ok'}" data-n="${rawHtml(rows.length)}">${rawHtml(GNI? (rows.length? '주의 항목 '+rows.length+'종 · 대상 '+tgtN+'건' : '없음') : String(rows.length))}</span></h2><span class="mini" style="display:flex;align-items:center;gap:6px"><i style="width:7px;height:7px;border-radius:50%;background:var(--brand);display:inline-block"></i>${rawHtml(la&&la.textContent? esc(la.textContent):'')} · 자동 갱신</span></div>`;
  if(!rows.length) h+=tpl`<div class="ib-empty"><span class="ib-ic ok">${rawHtml(ico('check',16))}</span>처리할 알림이 없습니다. 모든 항목이 정리되어 있어요.</div>`;
  else if(GNI){
    /* ㊿+167 지니언스: 급한 정도로 세 칸 — 즉시 처리(만기 지남·바로 고칠 데이터·미대응·오래된 장비 신청) / 확인 필요(이달 만기·정산·밀린 영업) / 예정(회수 진행·만료 예정) */
    var LANES=[[1,'즉시 처리','crit','오늘 처리'],[2,'확인 필요','warn','이번 달 안에'],[3,'예정','info','미리 챙길 일']];
    h+=tpl`<div class="ib-lanes">${rawHtml(LANES.map(function(L){
      var mine=rows.map(function(o,i){ return [o,i]; }).filter(function(x){ return (x[0].lv||2)===L[0]; });
      var open=!!IB_OPEN[L[0]], more=Math.max(0, mine.length-2);   /* 칸마다 2개까지 보이고 나머지는 «더 보기» */
      return tpl`<section class="ib-lane ${rawHtml(L[2])}" aria-label="${L[1]} ${rawHtml(mine.length)}종"><div class="ib-lh"><i></i><b>${L[1]}</b><span class="num">${rawHtml(mine.length)}</span><span class="ib-lsub">${L[3]}</span></div>`+
        tpl`${rawHtml(mine.length? mine.map(function(x, j){ return rowHtml(x[0], x[1], j>=2 && !open); }).join('') : tpl`<div class="ib-none">${rawHtml(ico('check',14))}없음</div>`)}`+
        tpl`${rawHtml(more? tpl`<button type="button" class="ib-more" data-lv="${rawHtml(L[0])}" aria-expanded="${open?'true':'false'}">${open? '접기' : '그 밖에 '+more+'종 더 보기'}</button>` : '')}</section>`; }).join(''))}</div>`;
  }
  else rows.forEach(function(o,i){ h+=rowHtml(o,i); });
  h+=tpl`<div class="ib-foot"><span>${rawHtml(zeros.map(esc).join(' · '))}</span>${rawHtml(snz? tpl`<a id="ibUnsnz">보류한 ${rawHtml(snz)}건 다시 보기</a>`:(GNI? '' : '<span class="mini">주간회의는 매주 월요일 · 일요일 저녁 자동 취합</span>'))}</div>`;
  box.innerHTML=h;
  box.querySelectorAll('.cbtn').forEach(function(bt){ bt.onclick=function(e){ e.stopPropagation(); rows[+bt.dataset.i].acts[+bt.dataset.j].go(); }; });
  box.querySelectorAll('.ib-more').forEach(function(bt){ bt.onclick=function(){ IB_OPEN[bt.dataset.lv]=!IB_OPEN[bt.dataset.lv]; renderInbox(); var nb=box.querySelector('.ib-more[data-lv="'+bt.dataset.lv+'"]'); if(nb) nb.focus(); }; });
  try{ gnSumRender(rows); }catch(e){}
  var un=document.getElementById('ibUnsnz'); if(un) un.onclick=ccUnsnooze;
  ccGreeting(rows.length);
  GN_BADGE.inb=rows.filter(function(o){ return o.lv===1; }).length; GN_BADGE.inbound=inbN||0; GN_BADGE.dc=(!EQ && DS && DS.crit)||0;   /* ㊿+167 지니언스 상단 메뉴 배지 — 홈 = «즉시 처리» 건수 */
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
    var line=document.createElement('div'); line.className='arr'; line.innerHTML=tpl`${arr.querySelector('.k').textContent} <b class="num">${rawHtml((arr.querySelector('.v')||{}).innerHTML)}</b>`; arr.remove(); hero.appendChild(line);
  }
  var gb=document.getElementById('goalBar'); if(gb) hero.appendChild(gb);
  /* LIVE 타일에 제품별 막대 */
  try{
    var lt=[].slice.call(box.children).filter(function(c){ return /^LIVE|^활성 고객사/.test((c.querySelector('.k')||{}).textContent||''); })[0];
    var lv=liveData(b);
    if(lt && lv && lv.ok){
      var per={}; lv.rows.forEach(function(x){ (per[x.line]=per[x.line]||{})[x.cust]=1; });
      var arr2=Object.keys(per).map(function(l){ return {line:l, n:Object.keys(per[l]).length}; }).sort(function(x,y){ return y.n-x.n; }).slice(0,3);
      var mx=arr2.length? arr2[0].n:1, cols={};
      (ST.DATA.lines||[]).forEach(function(l){ cols[l.label]=seriesColor(l.color); });
      var w=document.createElement('div'); w.style.marginTop='6px';
      w.innerHTML=arr2.map(function(x){ return tpl`<div class="mbar"><span class="l">${lline(x.line)}</span><span class="t"><i style="width:${Math.round(x.n/mx*100)}%;background:${rawHtml(cols[x.line]||'var(--s1)')}"></i></span><span class="n num">${rawHtml(x.n)}</span></div>`; }).join('');
      lt.appendChild(w);
    }
  }catch(e){}
  /* 전년 대비 타일 → 히어로 한 줄 */
  try{
    var yoy=[].slice.call(box.children).filter(function(c){ return /전년/.test((c.querySelector('.k')||{}).textContent||''); })[0];
    if(yoy){ var hd=hero.querySelector('.d'), vv=yoy.querySelector('.v'), yd=yoy.querySelector('.d');
      if(hd && vv){ var sp=document.createElement('span'); sp.className='yoy';
        sp.innerHTML=tpl`${rawHtml((hd.textContent.trim()? ' · ':'')+esc(yoy.querySelector('.k').textContent))} <b class="${yd&&yd.classList.contains('up')?'up':(yd&&yd.classList.contains('down')?'down':'')}">${rawHtml(vv.innerHTML)}</b>`; hd.appendChild(sp); }
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
  /* ㊿+167 지니언스: «오늘 처리할 일»(인박스) 아래 «사업 현황» 제목 — 숫자 카드 묶음과 할 일을 나눔 */
  if(isGN()){ var row=document.getElementById('ccRow'), hb=document.getElementById('gnBizH');
    if(row && !hb){ hb=document.createElement('div'); hb.id='gnBizH'; hb.className='gn-sech'; row.insertBefore(hb, host); }
    if(hb) hb.innerHTML=tpl`<h2>사업 현황</h2><span>${mk(b)} 기준 · 금액 단위 천원</span>`; }
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
  c.innerHTML=tpl`<div class="k">채널별 MRR <span class="mini">${mk(b)}</span></div>`+
    tpl`<div class="stk">${rawHtml(top.map(function(x,i){ return tpl`<i style="width:${tot? x[1]/tot*100:0}%;background:${rawHtml(cols[i])}"></i>`; }).join(''))}</div>`+
    tpl`<div class="mlist">${rawHtml(top.map(function(x,i){ return tpl`<div class="mrow"><span><i style="background:${rawHtml(cols[i])}"></i>${x[0]}</span><span class="num">${won(x[1])}</span></div>`; }).join(''))}</div>`+
    tpl`<div class="d" style="margin-top:auto;padding-top:6px">단위 천원${rawHtml(top[0]&&tot? ' · '+esc(top[0][0])+' 비중 '+Math.round(top[0][1]/tot*100)+'%':'')}${rawHtml(arr.length>4? ' · 외 '+(arr.length-4)+'개 채널':'')}</div>`;
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
  var tag= s? (s.gap.length? tpl`<span class="ctag warn">맞지 않음 ${s.gap.length}</span>`:'<span class="ctag ok">신청 ↔ 현황 일치</span>') : '';
  var first=prog[0], ph='';
  if(first){ var all=eqWant(first), done=eqRetSet(first).length;
    ph=tpl`<div class="mrow" style="margin-top:8px;font-size:12px"><span>${first.customer||''} · 회수</span><span class="num mini">${rawHtml(done)}/${all.length}대</span></div><div class="eqb-prog">${rawHtml(all.map(function(sn,i){ return tpl`<i class="${i<done?'on':''}"></i>`; }).join(''))}</div>`; }
  var c=el('div','kpi');
  c.innerHTML=tpl`<div class="k">임대 장비 운영 ${rawHtml(tag)}</div>`+
    tpl`<div class="tri"><div><b class="num">${rawHtml(lent)}</b><span>임대중</span></div><div><b class="num">${rawHtml(stock)}</b><span>재고</span></div><div><b class="num" style="color:${prog.length?'var(--warn-ink)':'inherit'}">${prog.length}</b><span>회수 진행</span></div></div>${rawHtml(ph)}`+
    tpl`<div class="d" style="margin-top:auto;padding-top:6px;color:var(--s1-ink);font-weight:500">장비 대시보드 →</div>`;
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
  c.innerHTML=tpl`<div class="k">이번 주 파이프라인 <span class="ctag info">인바운드 자동 07:00</span></div>`+
    tpl`<div class="tri" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div><b class="num">${rawHtml(inb==null?'…':inb)}</b><span>최근 7일 인바운드</span></div><div><b class="num">${open.length}</b><span>진행 중 OI</span></div></div>`+
    tpl`<div style="display:flex;flex-direction:column;gap:3px;font-size:13px;margin-top:8px">${rawHtml(Object.keys(st).slice(0,3).map(function(k){ return tpl`<div class="mrow"><span>${k} 단계</span><span class="num">${rawHtml(st[k])}</span></div>`; }).join(''))}`+
    tpl`<div class="mrow"><span>이달 계약예상</span><span class="num" style="font-weight:600">${due.length}</span></div></div>`;
  c.style.cursor='pointer'; c.title='OI 현황 (클릭)'; c.setAttribute('role','button'); c.tabIndex=0;
  c.onclick=function(){ switchView('oi'); };
  return c;
}
export function ccTileWeekly(){
  var today=new Date(), dow=today.getDay(), toMon=(8-dow)%7; if(toMon===0) toMon=7;
  var wkTxt= dow===1? '오늘':'D-'+toMon;
  var next=new Date(today); next.setDate(next.getDate()+(dow===1? 0:toMon));
  var c=el('div','kpi');
  c.innerHTML=tpl`<div class="k">주간회의</div><div class="v">${wkTxt}</div>`+
    tpl`<div class="d">${rawHtml(dow===1? '오늘 회의 · 보고 화면 열기' : (next.getMonth()+1)+'월 '+next.getDate()+'일 월요일 · 일요일 저녁 자동 취합')}</div>`+
    tpl`<div class="d" style="margin-top:auto;padding-top:6px;color:var(--brand);font-weight:500">주간회의 화면 →</div>`;
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
export var EQB={ch:'', q:'', more:{}, only:''};
/* ㊿+169 요약 타일 · 홈 알림과 같은 기준(보드를 이 조건으로만 거름) */
export var EQB_ONLY={pend:['처리 대기 — 접수·출하요청·배송중', function(o){ return ['접수','출하요청','배송중'].indexOf(o.status)>=0; }],
  ret:['회수 진행 — 회수예정 · 일부 회수된 신청', function(o){ return o.status==='회수예정' || (o.status!=='회수완료' && o.status!=='취소' && eqRetSet(o).length>0); }]};
export var EQB_COLS=[['접수','#9A9DA5','현황 재고'],['출하요청','var(--info-ink)','현황 재고'],['배송중','var(--warn-ink)','현황 재고'],['설치완료','var(--brand)','현황 임대중'],['회수예정','#D95926','«회수 처리»로 일부·전부 회수'],['회수완료','var(--ink-2)','최근 90일']];
export function eqRefresh(){ if(ST.CUR_VIEW==='eqboard') renderEqBoard(); else try{ renderGrid(); }catch(e){} try{ railSync(ST.CUR_VIEW); }catch(e){} }   /* ㊿+157 장비 «처리 대기» 빨간 숫자도 */
export var EQ_CH_CLS={'에스원':'ch-s1','LGU+':'ch-lg','LG U+':'ch-lg','조달':'ch-gov','일반':'ch-gen'};
export function eqChTag(ch){ ch=ch||'기타'; return tpl`<span class="ctag ${rawHtml(EQ_CH_CLS[ch]||'')}">${ch}</span>`; }
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
  var age=oldest? Math.floor((new Date(todayS).getTime()-new Date(oldest).getTime())/864e5):0;
  var retL=O.filter(EQB_ONLY.ret[1]);
  var retAll=0, retDone=0; retL.forEach(function(o){ retAll+=eqWant(o).length; retDone+=eqRetSet(o).length; });
  var instM=O.filter(function(o){ return ['설치완료','회수예정','회수완료'].indexOf(o.status)>=0 && String(o.install_date||'').slice(0,7)===ym; });
  var instP=O.filter(function(o){ return ['설치완료','회수예정','회수완료'].indexOf(o.status)>=0 && String(o.install_date||'').slice(0,7)===pym; });
  var retM=O.filter(function(o){ return o.status==='회수완료' && String(o.returned_date||'').slice(0,7)===ym; });
  var qty=function(arr){ return arr.reduce(function(a,o){ return a+(+o.qty||eqWant(o).length||1); },0); };
  function tile(cls, dot, k, v, u, d, go){
    return tpl`<div class="kpi ${rawHtml(cls)}" role="button" tabindex="0" data-go="${rawHtml(go)}"><div class="k">${rawHtml(dot? tpl`<i style="background:${rawHtml(dot)}"></i>`:'')}${k}</div><div class="v">${rawHtml(v)}${rawHtml(u? tpl`<small>${rawHtml(u)}</small>`:'')}</div><div class="d">${rawHtml(d)}</div></div>`;
  }
  /* ㊿+169 범위를 이름에 — 장비(대) = 현황(시리얼) 기준 · 신청(건) = 신청 내역 기준 · 누르면 같은 조건의 목록(숫자 그대로) */
  K.innerHTML=
    tile('good', 'var(--brand)', '임대중 · 현황', lent.length, '대', '고객사 '+Object.keys(lentCust).length+'곳 · 시리얼 기준', 'assets:임대중')+
    tile(pend.length? (age>7? 'crit':'hot'):'', 'var(--info-ink)', '처리 대기 · 신청', pend.length, '건', pend.length? qty(pend)+'대 · '+['접수','출하요청','배송중'].filter(function(k){ return pendBy[k]; }).map(function(k){ return k+' '+pendBy[k]; }).join(' · ')+(age>=1? ' · 최장 '+age+'일':'') : '대기 중인 신청 없음', 'only:pend')+
    tile(retL.length? 'hot':'', '#D95926', '회수 진행 · 신청', retL.length, '건', retL.length? '회수 완료 '+retDone+'대 / 대상 '+retAll+'대':'진행 중인 회수 없음', 'only:ret')+
    tile('', 'var(--ink-2)', '회수 완료 · 현황', retd.length, '대', retd.length? Object.keys(retdModel).sort(function(a,b){ return retdModel[b]-retdModel[a]; }).slice(0,3).map(function(m){ return esc(m)+' '+retdModel[m]; }).join(' · ')+' · 고객사 '+Object.keys(retdCust).length+'곳'+(retdLast? ' · 최근 '+retdLast:'') : '회수완료 장비 없음', 'assets:회수완료');
  var tc=document.getElementById('eqcTrendCap'); if(tc) tc.textContent='이달 설치 '+qty(instM)+'대 · 회수 '+qty(retM)+'대 · 지난달 설치 '+qty(instP)+'대 · 최근 12개월';
  K.querySelectorAll('[data-go]').forEach(function(t){
    t.onclick=function(){
      var g=t.dataset.go.split(':');
      if(g[0]==='assets'){ var st0=g[1]; gridGoPre('assets', '장비 현황 · 상태 '+st0, function(a){ return a.status===st0; }); return; }
      EQB.only=(EQB.only===g[1]? '' : g[1]); EQB.ch=''; EQB.q=''; var qi=/** @type {any} */(document.getElementById('eqbQ')); if(qi) qi.value=''; renderEqBoard();
      var bw=document.getElementById('eqbCols'); if(bw && EQB.only) bw.scrollIntoView({behavior:'smooth', block:'start'});
    };
    t.onkeydown=function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); t.click(); } };
  });
  /* 차트 */
  try{
    var byCh={}; lent.forEach(function(a){ var c=a.channel||'기타'; byCh[c]=(byCh[c]||0)+1; });
    var chArr=Object.keys(byCh).sort(function(a,b){ return byCh[b]-byCh[a]; }).map(function(c){ return {name:c, v:byCh[c], c:cssv('--brand')}; });
    hbars('#eqcCh', chArr, lent.length, '대');
    document.getElementById('eqcChCap').textContent=lent.length? '총 '+lent.length+'대':'';
    var models={}; lent.forEach(function(a){ var m=a.model||'미지정'; (models[m]=models[m]||{l:0,s:0,r:0}).l++; }); stock.forEach(function(a){ var m=a.model||'미지정'; (models[m]=models[m]||{l:0,s:0,r:0}).s++; }); retd.forEach(function(a){ var m=a.model||'미지정'; (models[m]=models[m]||{l:0,s:0,r:0}).r++; });
    var mk2=Object.keys(models).sort(function(a,b){ return (models[b].l+models[b].s+models[b].r)-(models[a].l+models[a].s+models[a].r); }).slice(0,6);
    var cnt=function(v){ return Math.round(v)+'대'; };
    var hostM=document.getElementById('eqcModel');
    hostM.innerHTML= mk2.length? tpl`<div class="h">모델별 (임대중 · 재고 · 회수)</div>${rawHtml(mk2.map(function(m){ var x=models[m]; return tpl`<div class="mrow"><span>${m}</span><span class="num" style="font-weight:500;color:var(--ink-2)"><b style="color:var(--ink)">${rawHtml(x.l)}</b> · ${rawHtml(x.s)} · ${rawHtml(x.r)}</span></div>`; }).join(''))}` : '';
    var months=[], d=new Date(); d.setDate(1);
    for(var i=11;i>=0;i--){ var t=new Date(d.getFullYear(), d.getMonth()-i, 1); months.push(t.getFullYear()+'-'+('0'+(t.getMonth()+1)).slice(-2)); }
    var inst=months.map(function(){ return 0; }), rets=months.map(function(){ return 0; });
    O.forEach(function(o){
      var q=+o.qty||eqWant(o).length||1;
      if(['설치완료','회수예정','회수완료'].indexOf(o.status)>=0){ var i1=months.indexOf(String(o.install_date||'').slice(0,7)); if(i1>=0) inst[i1]+=q; }
      if(o.status==='회수완료'){ var i2=months.indexOf(String(o.returned_date||'').slice(0,7)); if(i2>=0) rets[i2]+=q; }
    });
    (function(){ var eh=document.getElementById('eqcTrend'); Viz.afterLayout(eh, function(){ Viz.bars(eh,{labels:months.map(function(m){ return m.slice(2).replace('-','.'); }), fmt:function(v){ return Math.round(v); }, tipFmt:cnt, maxBar:16, padL:34,
      series:[{label:'설치', data:inst, color:cssv('--s1')},{label:'회수', data:rets, color:cssv('--s2')}]}); }); })();   /* ㊿+173 배치가 끝난 뒤 */
  }catch(e){ console.warn('eq dash charts', e); }
}
export function renderEqBoard(){
  var wrap=document.getElementById('eqbCols'); if(!wrap) return;
  try{ requestAnimationFrame(renderEqDash); }catch(e){}
  var O=(ST.RAWX.orders||[]).slice(), q=fkNorm(EQB.q||'');
  /* 채널 칩 */
  var chs={}; O.forEach(function(o){ if(o.status!=='취소') chs[o.channel||'기타']=(chs[o.channel||'기타']||0)+1; });
  var chipBox=document.getElementById('eqbChips');
  chipBox.innerHTML=tpl`<button type="button" class="cbtn" data-ch="" aria-pressed="${EQB.ch===''? 'true':'false'}">전체</button>`+
    tpl`${rawHtml(Object.keys(chs).sort(function(a,b2){ return chs[b2]-chs[a]; }).map(function(c){ return tpl`<button type="button" class="cbtn" data-ch="${c}" aria-pressed="${EQB.ch===c? 'true':'false'}">${c} <span class="num" style="opacity:.6">${rawHtml(chs[c])}</span></button>`; }).join(''))}`;
  chipBox.querySelectorAll('button').forEach(function(bt){ bt.onclick=function(){ EQB.ch=bt.dataset.ch; renderEqBoard(); }; });
  if(EQB_ONLY[EQB.only]){ var oc=document.createElement('span'); oc.className='eqb-only'; oc.innerHTML=tpl`<span class="ctag info">${rawHtml(ico('filter',13))} ${EQB_ONLY[EQB.only][0]}</span><button type="button" class="cbtn" aria-label="조건 해제 — 전체 보드 보기">조건 해제</button>`;
    /** @type {any} */(oc.querySelector('button')).onclick=function(){ EQB.only=''; renderEqBoard(); }; chipBox.insertBefore(oc, chipBox.firstChild); }
  /* 일치 표시 */
  try{ var s=eqScan(); document.getElementById('eqbMatch').innerHTML= s.gap.length
      ? tpl`<span class="ctag warn" style="cursor:pointer" title="신청 내역 화면의 대조 패널에서 맞추기">${rawHtml(ico('clock',12))} 맞지 않음 ${s.gap.length}건 · 신청 내역에서 맞추기</span>`
      : tpl`<span class="ctag ok">${rawHtml(ico('check',12))} 신청 ↔ 현황 일치 · ${rawHtml(s.ok)}건</span>`;
    var mt=document.getElementById('eqbMatch').firstChild; if(mt && s.gap.length) mt.onclick=function(){ switchView('orders'); };
  }catch(e){}
  var only=EQB_ONLY[EQB.only]||null;
  var rows=O.filter(function(o){
    if(only && !only[1](o)) return false;
    if(EQB.ch && (o.channel||'기타')!==EQB.ch) return false;
    if(q){ var hay=fkNorm([o.customer,o.model,o.serials,o.channel,o.order_type,o.mgr_name,'#'+o.id].join(' ')); if(hay.indexOf(q)<0) return false; }
    return true;
  });
  rows.sort(function(a,b2){ return String(b2.created_at||'')>String(a.created_at||'')? 1:-1; });
  var cancel=rows.filter(function(o){ return o.status==='취소'; }).length;
  document.getElementById('eqbCount').textContent=(rows.length-cancel)+'건'+(cancel? ' · 취소 '+cancel+'건은 보드에 안 보임':'');
  var canEdit=!ST.IS_VIEWER && !!ST.SB_TOKEN, todayS=todayStr();
  var h='', tracks=[], REST={};   /* ㊿+173 성능: 열마다 처음 8장만 먼저 그리고 나머지(최대 30장까지 · 더 보기 규칙 그대로)는 첫 그리기 직후 */
  EQB_COLS.forEach(function(col, ci){
    var st=col[0], list=rows.filter(function(o){ return o.status===st; }), older=0;
    if(st==='회수완료'){ var cut=new Date(); cut.setDate(cut.getDate()-90); var cutS=todayStr(cut);
      var recent=list.filter(function(o){ return String(o.returned_date||o.created_at||'').slice(0,10)>=cutS; }); older=list.length-recent.length; list=recent; }
    var lim=EQB.more[st]? 1e9 : (st==='설치완료'? 12 : 30);
    /* ㊿+169 빈 열도 같은 폭으로 남김(접지 않음) — 드롭할 자리 · «없음» 표시 */
    tracks.push('minmax(0,1fr)');
    h+=tpl`<section class="eqb-col${st==='회수예정'?' warm':''}${list.length? '':' none'}" data-st="${st}" aria-label="${st} ${rawHtml(list.length)}건">`+
      tpl`<div class="eqb-ch" title="${col[2]}"><i style="background:${rawHtml(col[1])}"></i>${st} <span class="n">${list.length}</span>${rawHtml(st==='회수완료'? '<span class="to">최근 90일</span>':'')}</div>`;
    if(!list.length) h+=tpl`<div class="eqb-empty">없음${rawHtml(st==='회수완료'&&older? ' · 90일 이전 '+older+'건은 신청 내역에서':'')}${rawHtml(canEdit? '<br><span class="mini">끌어서 옮길 수 있음</span>':'')}</div>`;
    var shown=list.slice(0,lim);
    shown.slice(0,8).forEach(function(o){ h+=eqbCard(o, canEdit, todayS); });
    if(shown.length>8){ REST[st]=shown.slice(8); h+=tpl`<i class="eqb-mk" data-mk="${st}" hidden></i>`; }
    if(list.length>lim) h+=tpl`<button type="button" class="eqb-more" data-more="${st}">외 ${list.length-lim}건 더 보기</button>`;
    if(st==='접수' && canEdit) h+='<button type="button" class="eqb-more" data-new="1">＋ 새 신청</button>';
    if(st==='회수완료' && older && list.length) h+=tpl`<div class="eqb-empty">90일 이전 ${rawHtml(older)}건은 신청 내역(목록)에서</div>`;
    h+='</section>';
  });
  wrap.innerHTML=h;
  wrap.style.gridTemplateColumns = '';   // ㊿+169 열 너비는 CSS(넓으면 6열 · 좁으면 3열 · 폰 1열) — 빈 열도 같은 폭
  wrap._canEdit=canEdit; eqbBind(wrap);
  var gen=wrap._gen=(wrap._gen||0)+1;
  if(Object.keys(REST).length){ var more=function(){ if(wrap._gen!==gen || !wrap.isConnected) return;
      Object.keys(REST).forEach(function(st){ var mk=wrap.querySelector('.eqb-mk[data-mk="'+st.replace(/["\\]/g,'')+'"]'); if(!mk) return; mk.insertAdjacentHTML('beforebegin', REST[st].map(function(o){ return eqbCard(o, canEdit, todayS); }).join('')); mk.remove(); }); };
    var later=function(){ try{ if(window.requestIdleCallback) window.requestIdleCallback(more, {timeout:180}); else setTimeout(more, 30); }catch(e){ setTimeout(more, 30); } };
    if(typeof requestAnimationFrame!=='undefined') requestAnimationFrame(later); else later(); }
}
/* ㊿+173 보드 동작은 보드 틀(wrap)에 한 번만 — 나중에 붙는 카드도 같은 동작(누르기 · 끌어 옮기기) */
export function eqbBind(wrap){
  if(wrap._eqbBound) return; wrap._eqbBound=1;
  wrap.addEventListener('click', function(e){
    var t=/** @type {any} */(e.target), bt=t && t.closest && t.closest('[data-more],[data-new],[data-next],[data-open],[data-ret]'); if(!bt || !wrap.contains(bt)) return;
    var d=bt.dataset, r;
    if(d.more!=null){ EQB.more[d.more]=1; renderEqBoard(); return; }
    if(d.new!=null){ switchView('ordernew'); return; }
    e.stopPropagation();
    if(d.next!=null){ r=eqOrderById(d.oid); if(r) eqSetStatus(r, d.next); return; }
    if(d.open!=null){ r=eqOrderById(d.open); if(!r) return; gridGoPre('orders', '신청 #'+r.id+' '+(r.customer||''), function(x){ return String(x.id)===String(r.id); }); return; }
    if(d.ret!=null){ r=eqOrderById(d.ret); if(r) eqRetOpen(r); }
  });
  eqbDnD(wrap);
}
export function eqbCard(o, canEdit, todayS){
  var all=eqWant(o), ret=eqRetSet(o), done=o.status==='회수완료';
  var age='', ageD=0; if(['접수','출하요청','배송중'].indexOf(o.status)>=0 && o.created_at){ ageD=Math.floor((new Date(todayS).getTime()-new Date(String(o.created_at).slice(0,10)).getTime())/864e5); if(ageD>=1) age=(ageD>7? tpl` <span class="ctag late">${rawHtml(ageD)}일 경과</span>` : ' · '+ageD+'일'); }
  var meta=[tpl`<b>${o.model||'모델 미정'} ×${rawHtml(o.qty||all.length||1)}</b>`, o.order_type||''];
  if(o.status==='설치완료' && o.install_date) meta.push(tpl`설치 <span class="num">${String(o.install_date).slice(0,10)}</span>`);
  else if(o.install_date && !done) meta.push(tpl`설치희망 <span class="num">${String(o.install_date).slice(0,10)}</span>`);
  if(done && o.returned_date) meta.push(tpl`회수일 <span class="num">${String(o.returned_date).slice(0,10)}</span>`);
  var prog='';
  if(!done && (o.status==='회수예정' || ret.length) && all.length){
    prog=tpl`<div style="display:flex;align-items:center;gap:8px"><div class="eqb-prog" style="flex:1;margin:0">${rawHtml(all.map(function(sn){ return tpl`<i class="${ret.indexOf(sn.toUpperCase())>=0?'on':''}"></i>`; }).join(''))}</div><span class="num" style="font-size:12px;font-weight:600">${ret.length}/${all.length}</span></div>`;
  }
  var idx=EQB_COLS.map(function(c){ return c[0]; }).indexOf(o.status), nextSt=idx>=0 && idx<EQB_COLS.length-1? EQB_COLS[idx+1][0] : null;
  var who=o.mgr_name? o.mgr_name : (o.requester? String(o.requester).split('@')[0] : '');
  var ft=tpl`<div class="ft"><span class="mini" title="담당 ${who}">${who}</span><span class="acts">`+
    tpl`<button type="button" class="cbtn ab" data-open="${rawHtml(o.id)}" title="신청 내역에서 열기·수정" aria-label="신청 #${rawHtml(o.id)} 신청 내역에서 열기·수정">${rawHtml(ico('edit',14))}</button>`+
    tpl`${rawHtml(canEdit && eqCanRet(o) && all.length? tpl`<button type="button" class="cbtn" data-ret="${rawHtml(o.id)}" title="시리얼을 골라 일부·전부 회수 또는 회수 취소">${done? '회수 취소…' : '회수 처리'}</button>`:'')}`+
    tpl`${rawHtml(canEdit && nextSt && nextSt!=='회수완료'? tpl`<button type="button" class="cbtn nx${['출하요청','배송중','설치완료'].indexOf(nextSt)>=0?' pri':''}" data-oid="${rawHtml(o.id)}" data-next="${nextSt}" title="${nextSt} 로 이동">${nextSt} →</button>`:'')}</span></div>`;
  /* 카드: 이름 한 줄 → 메타 한 줄(채널 · 모델×수량 · 유형 · 날짜) → 시리얼 칩(4개까지, 나머지 접힘) → 담당·동작. 안내 문구·채널 박스 없음 */
  return tpl`<article class="eqb-card" draggable="${canEdit?'true':'false'}" data-oid="${rawHtml(o.id)}">`+
    tpl`<div class="tp"><span class="cu" title="${o.customer||''}">${o.customer||'(고객사 없음)'}</span><span class="mini num">#${rawHtml(o.id)}${rawHtml(age)}</span></div>`+
    tpl`<div class="mt"><span class="chn">${o.channel||'기타'}</span> · ${rawHtml(meta.filter(Boolean).join(' · '))}</div>${rawHtml(prog)}`+
    tpl`<div class="sn">${rawHtml(eqSerialsHtml(o,{full:true, max:4}))}</div>${rawHtml(ft)}</article>`;
}
export function eqbDnD(wrap){   /* ㊿+173 보드 틀에 한 번(eqbBind) — 카드 · 열은 다시 그려도 그대로 동작 · 쓰기 권한이 없으면(wrap._canEdit) 아무것도 안 함 */
  var dragging=null;
  var cardOf=function(e){ var t=/** @type {any} */(e.target); return t && t.closest? t.closest('.eqb-card') : null; };
  var colOf=function(e){ var t=/** @type {any} */(e.target); return t && t.closest? t.closest('.eqb-col') : null; };
  wrap.addEventListener('dragstart', function(e){ var c=cardOf(e); if(!c || !wrap._canEdit) return;
    if(e.target.closest && e.target.closest('.eqsn,.eqbar,button,input')) { e.preventDefault(); return; } dragging=c.dataset.oid; c.classList.add('drag'); try{ e.dataTransfer.setData('text/plain', dragging); e.dataTransfer.effectAllowed='move'; }catch(x){} });
  wrap.addEventListener('dragend', function(e){ var c=cardOf(e); if(c) c.classList.remove('drag'); wrap.querySelectorAll('.eqb-col.over').forEach(function(x){ x.classList.remove('over'); }); });
  wrap.addEventListener('dragover', function(e){ var col=colOf(e); if(!col || !dragging) return; e.preventDefault(); col.classList.add('over'); });
  wrap.addEventListener('dragleave', function(e){ var col=colOf(e); if(col) col.classList.remove('over'); });
  wrap.addEventListener('drop', function(e){ var col=colOf(e); if(!col) return; e.preventDefault(); col.classList.remove('over'); var r=eqOrderById(dragging); dragging=null; if(!r || !wrap._canEdit) return; eqSetStatus(r, col.dataset.st); });
}
/* 상태 변경 — 신청 내역 표에서 상태 칸을 고쳐 저장하는 것과 같은 결과 (회수일 자동 · 현황 동기화 · 변경 이력) */
export async function eqSetStatus(r, st){
  if(!r || !st || r.status===st) return;
  if(!ST.SB_TOKEN){ openOvl('ovlAuth'); return; }
  if(ST.IS_VIEWER){ toast('조회 전용 계정', '상태를 바꿀 수 없습니다', 'info'); return; }
  var all=eqWant(r), body={status:st};
  if(st==='회수완료'){
    if(!confirm('#'+r.id+' '+(r.customer||'')+' — '+(all.length||r.qty||1)+'대 전부 회수완료로 처리할까요?\n(일부만 회수했으면 취소하고 카드의 «회수 처리» 버튼에서 시리얼을 고르세요)')) { renderEqBoard(); return; }
    if(!r.returned_date) body.returned_date=todayStr();
  }
  if(r.status==='회수완료' && st!=='회수완료'){ body.returned_date=null; body.returned_serials=null; }
  var prev={status:r.status, returned_date:r.returned_date||null, returned_serials:r.returned_serials||null};   /* ㊿+169 되돌리기 · 실패 복구 */
  try{
    await sbWrite('PATCH','equipment_orders?id=eq.'+r.id, body);
    var from=r.status; Object.keys(body).forEach(function(k){ r[k]=body[k]; });
    logChange('update','equipment_orders',r.id,{status:st, from:from, via:'장비 대시보드'});
    ST.DIRTY=true; renderEqBoard();
    var x=await syncOrderAssets(r, null, true);
    if(/자산 동기화 실패/.test(x||'')){
      try{ await sbWrite('PATCH','equipment_orders?id=eq.'+r.id, prev); Object.keys(prev).forEach(function(k){ r[k]=prev[k]; }); await syncOrderAssets(r, null, true); }catch(e3){}
      toast('상태 변경 실패 — 원래대로 되돌렸습니다', String(x).replace(/^ · /,''), 'bad'); renderEqBoard(); return;
    }
    toast('상태 변경', '#'+r.id+' '+(r.customer||'')+' · '+from+' → '+st+(body.returned_date? ' · 회수일 '+body.returned_date:'')+(x? ' · '+x:''), 'ok',
      {l:'되돌리기', go:function(){ eqSetBack(r, prev, st); }});
    try{ railSync(ST.CUR_VIEW); }catch(e){}
  }catch(e){ toast('상태 변경 실패 — 바뀐 것 없음', String(e.message||e).slice(0,100), 'bad'); renderEqBoard(); }
}
/** ㊿+169 상태 변경 되돌리기 */
export async function eqSetBack(r, prev, st){
  try{ await sbWrite('PATCH','equipment_orders?id=eq.'+r.id, prev); Object.keys(prev).forEach(function(k){ r[k]=prev[k]; });
    logChange('update','equipment_orders',r.id,{status:prev.status, from:st, via:'장비 대시보드 · 되돌리기'});
    var x=await syncOrderAssets(r, null, true); ST.DIRTY=true; renderEqBoard(); try{ railSync(ST.CUR_VIEW); }catch(e){}
    toast('되돌렸습니다', '#'+r.id+' '+(r.customer||'')+' · '+st+' → '+prev.status+(x? ' · '+x:''), 'info');
  }catch(e){ toast('되돌리기 실패', String(e.message||e).slice(0,100), 'bad'); renderEqBoard(); }
}

/* ---- 고객 360 — 요약 4칸 · 다음 액션 제안 · 섹션 탭 (모달 본문 위에 덧붙임) ----
   ㊿+168: 제안 전에 후속 계약(ctSuccessor) · 진행 중 OI 를 먼저 확인 — 재약정이 등록돼 있으면 «재약정 등록됨 → 후속 계약 보기»,
   같은 갱신 OI 가 있으면 그 OI 로, 관계가 불확실하면 «후속 계약 확인 필요» (자동 확정 안 함) · 계약 만료만으로 장비 회수를 권하지 않음
   장비 숫자는 «현재 임대중(시리얼 현황) · 회수 예정(회수예정 신청 중 아직 안 돌아온 대수) · 회수 완료 · 신청 이력(건)» 으로 나눔 */
export function c360Equip(asts, ords){
  var lentA=asts.filter(function(a){ return a.status==='임대중'; }), doneA=asts.filter(function(a){ return a.status==='회수완료'; });
  var retPend=0, retOrd=[], partial=[], open=[];
  ords.forEach(function(o){
    if(o.status==='회수예정'){ var all=eqWant(o), dn=eqRetSet(o); var left=all.filter(function(s){ return dn.indexOf(String(s).toUpperCase())<0; }).length; retPend+=left; retOrd.push(o); }
    else if(o.status==='설치완료' && eqRetSet(o).length) partial.push(o);
    else if(['접수','출하요청','배송중'].indexOf(o.status)>=0) open.push(o);
  });
  var lent=lentA.length, src='현황';
  if(!asts.length && ords.length){ src='신청'; ords.forEach(function(o){ if(o.status==='설치완료'||o.status==='회수예정'){ var all=eqWant(o), dn=eqRetSet(o); lent+=all.filter(function(s){ return dn.indexOf(String(s).toUpperCase())<0; }).length; } }); }
  return {lent:lent, src:src, retPend:retPend, retOrd:retOrd, retDone:doneA.length, partial:partial, open:open,
    ordN:ords.filter(function(o){ return o.status!=='취소'; }).length, ph:asts.filter(function(a){ return /^미등록-/.test(String(a.serial||'')); }).length};
}
/* 표 화면으로 가서 검색어로 좁힘 (상세에서 돌아와도 검색어 유지는 grid 쪽 규칙) */
export function gridGo(view, q){
  switchView(view);
  setTimeout(function(){ var s=document.getElementById('dvSearch'); if(s && q!=null){ s.value=q; try{ renderGrid(); }catch(e){} } }, 30);
}
export function c360Enhance(nm, cts, lives, ois, inbs, asts, ords){
  var body=document.getElementById('c360Body'); if(!body) return;
  var b=STATE.base, mrr=0, cum=0, churned=0;
  cts.forEach(function(r){
    var k=ST.DATA.rows.indexOf(r); if(k>=0){ mrr+=ST.MAT[k][b]||0; for(var j=0;j<ST.M;j++) cum+=ST.MAT[k][j]||0; }
    if(/해지/.test(String(r.status||''))) churned++;
  });
  /* 갱신 판단 대상 = 기준월 이후 끝나는 원계약(해지·중지·종료 제외) — 후속 계약이 확인된 계약·자동연장은 «다음 만료»에서 뺌 */
  var roots=cts.filter(function(r){ return !r.parent && r.endIdx!=null && r.endIdx>=b && !/해지|중지|종료|CN전환/.test(String(r.status||'')); });
  var succ=new Map(); roots.forEach(function(r){ var s=null; try{ s=ctSuccessor(r); }catch(e){} if(s) succ.set(r, s); });
  var pending=roots.filter(function(r){ var s=succ.get(r); return !(s && s.sure) && !r.autoRenew; }).sort(function(x,y){ return x.endIdx-y.endIdx; });
  var ec=pending[0]||null, nextEnd=ec? ec.endIdx : null;
  var EQ=c360Equip(asts, ords);
  var dLeft=null; if(nextEnd!=null){ var y=+mk(nextEnd).slice(0,4), m=+mk(nextEnd).slice(5,7); var endD=new Date(y, m, 0); dLeft=Math.ceil((endD.getTime()-Date.now())/864e5); }
  var sum=tpl`<div class="c360-sum">`+
    tpl`<div><div class="l">월 MRR</div><div class="v num">${won(mrr)}<small> 천원</small></div><div class="mini">${mk(b)} 인식 금액</div></div>`+
    tpl`<div><div class="l">누적 매출</div><div class="v num">${won(cum)}<small> 천원</small></div></div>`+
    tpl`<div title="현재 임대중 = 장비 현황(시리얼)에서 임대중 · 회수 예정 = 회수예정 신청 중 아직 회수 안 된 대수 · 신청 = 발주(신청) 이력 건수(취소 제외)"><div class="l">임대중 장비${rawHtml(EQ.src==='신청'? ' (신청 기준)':'')}</div><div class="v num">${rawHtml(EQ.lent)}<small> 대</small></div>`+
      tpl`<div class="mini">회수 예정 ${rawHtml(EQ.retPend)}대 · 완료 ${rawHtml(EQ.retDone)}대</div></div>`+
    tpl`${rawHtml(dLeft!=null? tpl`<div class="${dLeft<=90?'warn':''}" title="재약정이 등록되지 않은 계약 중 가장 먼저 끝나는 계약"><div class="l">다음 만료</div><div class="v num">D-${Math.max(0,dLeft)}</div><div class="mini">${lline(ec.line)} · ${mk(nextEnd)}</div></div>` : tpl`<div><div class="l">다음 만료</div><div class="v">—</div><div class="mini">${roots.length? '모두 재약정 등록·자동연장' : '진행 중 계약 없음'}</div></div>`)}</div>`;
  /* 다음 행동 제안 */
  var tips=[], acts=[];
  var openOi=ois.filter(function(o){ return !/수주|계산서|종료|중지|실패/.test(String(o.stage||'')); });
  function goSucc(r){ return function(){ var c=ctRawOf(r._id); if(c) openDetail(c); else toast('계약 상세','이 계약 원본을 아직 불러오지 못했습니다 — 잠시 뒤 다시 눌러 주세요','info'); }; }
  roots.forEach(function(r){ var s=succ.get(r); if(s && s.sure && r.endIdx-b<=6){
    tips.push(tpl`<b>재약정 등록됨</b> — ${lline(r.line)} ${mk(r.startIdx)}~${mk(r.endIdx)} 다음 계약 ${mk(s.row.startIdx)}~${s.row.endIdx!=null? mk(s.row.endIdx):''} (${s.row.status||s.row.ctype||''})`);
    if(acts.length<4) acts.push(['후속 계약 보기 ('+mk(s.row.startIdx)+'~)', goSucc(s.row)]); } });
  if(ec && dLeft!=null && dLeft<=90){
    var s0=succ.get(ec);
    var lead=tpl`${lline(ec.line)} 계약이 <b>${rawHtml(Math.max(0,dLeft))}일 뒤</b>(${mk(ec.endIdx)}) 끝납니다${rawHtml(churned? ' · 과거 해지 이력 '+churned+'건':'')}.`;
    if(s0 && !s0.sure){ tips.push(tpl`${rawHtml(lead)} <b>후속 계약 확인 필요</b> — ${s0.row.cust} ${lline(s0.row.line)} ${mk(s0.row.startIdx)}~ 계약이 같은 갱신인지 확인하세요(자동으로 연결하지 않음).`);
      acts.push(['후보 계약 보기 ('+mk(s0.row.startIdx)+'~)', goSucc(s0.row)]); }
    else if(openOi.length){ tips.push(tpl`${rawHtml(lead)} 진행 중 OI «${openOi[0].deal_name||'영업기회'}»(${openOi[0].stage||''}) — 그 OI 로 갱신을 진행하세요.`);
      acts.push(['진행 중 OI 보기', function(){ closeOvl('ovlC360'); gridGo('oi', nm); }]); }
    else { tips.push(tpl`${rawHtml(lead)} 등록된 후속 계약·진행 중 OI 가 없습니다.`);
      acts.push(['재계약 OI 만들기', function(){ closeOvl('ovlC360'); switchView('oinew'); setTimeout(function(){ var c=document.getElementById('oiCust'); if(c){ c.value=nm; } },80); }]); }
    if(EQ.lent) tips.push(tpl`임대 장비 ${rawHtml(EQ.lent)}대는 재약정하면 그대로 씁니다 — 종료가 확정될 때만 회수 신청을 하세요.`);
  }
  if(EQ.retPend) tips.push(tpl`회수 예정 장비 ${rawHtml(EQ.retPend)}대(신청 ${rawHtml(EQ.retOrd.map(function(o){ return '#'+o.id; }).join(', '))}) — 장비 대시보드에서 회수 처리.`);
  if(EQ.partial.length) tips.push(tpl`부분 회수된 신청 ${rawHtml(EQ.partial.length)}건 — 남은 장비를 계속 쓸지 확인하세요.`);
  if(EQ.open.length) tips.push(tpl`처리 대기 장비 신청 ${rawHtml(EQ.open.length)}건(${rawHtml(EQ.open.map(function(o){ return o.status; }).join('·'))}).`);
  if(EQ.ph) tips.push(tpl`시리얼 미등록 장비 ${rawHtml(EQ.ph)}대 — 시리얼 보완이 필요합니다.`);
  if(EQ.retPend || EQ.partial.length || EQ.open.length || EQ.ph) acts.push(['장비 대시보드', function(){ closeOvl('ovlC360'); EQB.q=nm; switchView('eqboard'); var qi=document.getElementById('eqbQ'); if(qi) qi.value=nm; }]);
  if(openOi.length && !(ec && dLeft!=null && dLeft<=90)) tips.push(tpl`진행 중 OI ${rawHtml(openOi.length)}건${rawHtml(openOi[0].next_date? ' · 다음 일정 '+esc(String(openOi[0].next_date).slice(0,10)):'')}.`);
  var stale=inbs.filter(function(r){ return /진행중/.test(String(r.result||'')); });
  if(stale.length) tips.push(tpl`진행중인 인바운드 ${rawHtml(stale.length)}건이 남아 있습니다.`);
  if(!tips.length) tips.push(cts.length? '만료·회수·미결 항목이 없습니다. 정기 점검(분기 1회) 정도면 충분합니다.' : '계약 정보가 없는 고객사입니다 — OI·인바운드 기록을 확인하세요.');
  var next=tpl`<div class="c360-next"><b>${rawHtml(ico('spark',14))}다음 행동 제안</b><ul>${rawHtml(tips.map(function(x){ return tpl`<li>${rawHtml(x)}</li>`; }).join(''))}</ul>${rawHtml(acts.length? tpl`<div class="ba">${rawHtml(acts.map(function(a,i){ return tpl`<button type="button" class="cbtn${i===0?' pri':''}" data-a="${rawHtml(i)}">${a[0]}</button>`; }).join(''))}</div>`:'')}</div>`;
  /* 요약 탭(기본): 지금 유효한 계약 + 시작 예정 + 장비 네 칸 · 상세는 기존 탭 */
  var valid=cts.filter(function(r){ return r.startIdx!=null && r.startIdx<=b && (r.endIdx==null || r.endIdx>=b) && !/해지|중지/.test(String(r.status||'')); });
  var upc=cts.filter(function(r){ return r.startIdx!=null && r.startIdx>b; });
  function line(r, tag){ var k=ST.DATA.rows.indexOf(r), a=k>=0? (ST.MAT[k][b]||0) : 0; var s=succ.get(r);
    return tpl`<tr data-c360sum="${rawHtml(r._id)}" tabindex="0" title="계약 상세"><td><span class="ctag ${rawHtml(tag==='유효'?'ok':'info')}">${rawHtml(r.parent? '추가 계약' : tag)}</span></td><td>${lline(r.line)}<span class="st">${r.status||r.ctype||''}</span></td><td>${mk(r.startIdx)} ~ ${r.endIdx!=null? mk(r.endIdx):'—'}</td>`+
      tpl`<td class="n">${tag==='유효'? won(a) : '—'}</td><td class="n">${won(r.mrr||0)}</td><td class="mini">${rawHtml(r.autoRenew? '자동연장' : (s? (s.sure? '재약정 등록됨' : '후속 계약 확인 필요') : ''))}</td></tr>`; }
  var summ=tpl`<div class="c360-summ"><h4>지금 계약 <span class="ct">유효 ${rawHtml(valid.length)}건${rawHtml(upc.length? ' · 시작 예정 '+upc.length+'건':'')} · 금액 단위 천원</span></h4>`+
    tpl`${rawHtml(valid.length||upc.length? tpl`<div class="c360-summ-w"><table><thead><tr><th>구분</th><th>서비스 · 계약 상태</th><th>기간</th><th class="n" title="기준월(${mk(b)})에 인식되는 금액">${mk(b)} 인식</th><th class="n" title="계약서 기준 월 금액">월 금액</th><th>갱신</th></tr></thead><tbody>${rawHtml(valid.map(function(r){ return line(r,'유효'); }).concat(upc.map(function(r){ return line(r,'시작 예정'); })).join(''))}</tbody></table></div>` : '<p class="cap" style="margin:2px 0 0">기준월에 유효한 계약이 없습니다 — «계약» 탭에서 이력을 확인하세요.</p>')}`+
    tpl`<h4 style="margin-top:14px">장비 <span class="ct">상세는 «장비» 탭</span></h4><div class="c360-eq4"><div><b class="num">${rawHtml(EQ.lent)}</b><span>현재 임대중 (대)</span></div><div><b class="num">${rawHtml(EQ.retPend)}</b><span>회수 예정 (대)</span></div><div><b class="num">${rawHtml(EQ.retDone)}</b><span>회수 완료 (대)</span></div><div><b class="num">${rawHtml(EQ.ordN)}</b><span>신청(발주) 이력 (건)</span></div></div></div>`;
  /* 섹션 탭 */
  var secs=[].slice.call(body.querySelectorAll('.c360-sec'));
  var tabs=tpl`<div class="c360-tabs" role="tablist"><button type="button" role="tab" aria-selected="true" data-t="-2">요약</button>${rawHtml(secs.map(function(sc,i){ var h4=sc.querySelector('h4'); var t=h4&&h4.dataset.l? h4.dataset.l : h4? h4.textContent.replace(/^\S+\s/,'').replace(/\s*[\d,]+\s*(건|대|곳)(\s*임대중)?\s*$/,'').replace(/계약 기준.*$/,'').trim() : '섹션'; var ct=h4&&h4.querySelector('.ct')? h4.querySelector('.ct').textContent.replace('건','').replace(/\s*임대중$/,'') : ''; return tpl`<button type="button" role="tab" aria-selected="false" data-t="${rawHtml(i)}">${t}${rawHtml(ct? tpl`<span class="ct">${ct}</span>`:'')}</button>`; }).join(''))}<button type="button" role="tab" aria-selected="false" data-t="-1">전체</button></div>`;
  var head=document.createElement('div'); head.innerHTML=sum+next+tabs;
  body.insertBefore(head, body.firstChild);
  var sv=document.createElement('div'); sv.className='c360-summary-pane'; sv.innerHTML=summ; head.appendChild(sv);
  head.querySelectorAll('[data-a]').forEach(function(bt){ bt.onclick=function(){ acts[+bt.dataset.a][1](); }; });
  sv.querySelectorAll('tr[data-c360sum]').forEach(function(tr){ var go=function(){ var c=ctRawOf(Number(tr.getAttribute('data-c360sum'))); if(c) openDetail(c); }; tr.onclick=go; tr.onkeydown=function(e){ if(e.key==='Enter'){ e.preventDefault(); go(); } }; });
  function show(t){ sv.style.display= t===-2? '' : 'none'; secs.forEach(function(sc,i){ sc.style.display=(t===-1||t===i)? '':'none'; }); }
  head.querySelectorAll('[role="tab"]').forEach(function(bt){ bt.onclick=function(){
    head.querySelectorAll('[role="tab"]').forEach(function(x){ x.setAttribute('aria-selected', x===bt? 'true':'false'); });
    show(+bt.dataset.t); }; });
  show(-2);
}

export function showAuthUi(){
  try{ loadHide(); }catch(e){}
  $('#btnAuth').textContent=(ST.AUTH_USER||'').split('@')[0]+' ▾';
  $('#btnAuth').title='내 계정 · 로그아웃'; $('#btnAuth').classList.add('in');
  $('#btnLogout').style.display='none';   // 로그아웃은 계정 메뉴 안으로 이동
}

/* ---- 토스트 알림 ---- */
export function toast(title, sub, type, act){
  var box=document.getElementById('toasts');
  if(!box){ box=document.createElement('div'); box.id='toasts'; box.setAttribute('role','status'); box.setAttribute('aria-live','polite'); document.body.appendChild(box); }
  var t=document.createElement('div'); t.className='toast '+(type||'ok');
  t.innerHTML=tpl`<span class="ti">${type==='bad'?'✕':type==='warn'?'!':(type==='info'?'i':'✓')}</span>`+
    tpl`<span><b>${title}</b>${rawHtml(sub?tpl`<span class="tm">${sub}</span>`:'')}</span>`;
  /* ㊿+169 되돌리기 같은 동작 하나 — 10초 동안 */
  if(act && act.go){ var b=document.createElement('button'); b.type='button'; b.className='tact'; b.textContent=act.l||'되돌리기';
    b.onclick=function(){ b.disabled=true; t.classList.add('out'); setTimeout(function(){ t.remove(); },260); act.go(); }; t.appendChild(b); }
  box.appendChild(t);
  setTimeout(function(){ t.classList.add('out'); setTimeout(function(){ t.remove(); },260); }, act? 10000 : 4000);
}

export function showLoading(t){
  $('#app').classList.add('hidden');
  var l=$('#loading'); l.classList.remove('hidden');
  l.innerHTML=tpl`<div class="spin"></div><div>${rawHtml(t)}</div>`;
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
  await verBeforeWrite(method, path);   /* ㊿+175 옛 탭(새 버전이 올라온 뒤의 탭)이면 저장 막음 */
  /* ㊿+175 연결이 끊기거나 60초 넘게 답이 없으면 알아보기 쉬운 오류(net · timeout) — 부르는 쪽이 «다시 시도»를 붙일 수 있음 */
  var send=async function(){
    var ctl=new AbortController(), tm=setTimeout(function(){ try{ ctl.abort(); }catch(e){} }, 60000);
    try{ return await fetch(SB_URL+'/rest/v1/'+path,{ method:method, headers:Object.assign(sbHeaders(true), prefer?{Prefer:prefer}:{}), body: body!==undefined? JSON.stringify(body): undefined, signal:ctl.signal }); }
    catch(e){ var to=/** @type {any} */(e) && /** @type {any} */(e).name==='AbortError'; var ne=/** @type {any} */(new Error(to? '서버 응답이 60초 넘게 없습니다 — 저장됐는지 새로 읽어 확인한 뒤 다시 시도해 주세요' : '서버에 연결하지 못했습니다 — 인터넷 연결을 확인하고 다시 시도해 주세요')); ne.net=true; ne.timeout=to; throw ne; }
    finally{ clearTimeout(tm); }
  };
  var r=await send();
  if(r.status===401 && await refreshToken()){   // 토큰 만료 → 연장 후 1회 재시도
    r=await send();
  }
  if(!r.ok) throw new Error('저장 실패 ('+r.status+'): '+(await r.text()).slice(0,220));
  // 저장 성공 → 이전 캐시는 옛 데이터이므로 즉시 무효화 (새로고침 시 옛 화면 방지)
  // 단, rpc/load_… 는 읽기 전용 호출이라 캐시를 지우지 않음
  if(!/^rpc\/load_|^notify_snapshot\b/.test(path)) cacheDrop();   /* ㊿+177 예약 발송 «보낼 글»은 업무 데이터가 아님 */
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
  /* ㊿+176 연도+달 열쇠(bizKey — SQL 107 의 y · 없으면 작성일로 추정) */
  var best=null, bestKey='', bestId=-1;
  rows.forEach(function(r){
    var k=bizKey(r), id=Number(r.id)||0;
    if(k>bestKey || (k===bestKey && id>bestId)){ bestKey=k; bestId=id; best=r.ym||''; }
  });
  var pick=rows.filter(function(r){ return bizKey(r)===bestKey; });
  if(!pick.length) pick=rows;

  var items=[],details=[],ym=best||'',asOf='';
  pick.forEach(function(r){
    if(r.as_of) asOf=String(r.as_of).slice(0,10);
    if(r.kind==='sum') items.push({k:r.item,v:Number(r.biz)||0});
    else details.push({cust:r.item,biz:Number(r.biz)||0,sheet:Number(r.sheet)||0,diff:Number(r.diff)||0,note:r.note||''});
  });
  return {ok:true,asOf:asOf,month:ym,items:items,details:details,monthCount:(function(){
    var seen={},n=0; rows.forEach(function(r){ var k=bizKey(r); if(r.ym&&!seen[k]){seen[k]=1;n++;} }); return n;
  })()};
}

export var CACHE_KEY='svc_cache_v1';
export async function sbRpc(name){
  var r=await fetch(SB_URL+'/rest/v1/rpc/'+name,{
    method:'POST', headers:sbHeaders(true), body:'{}'});
  if(!r.ok) throw new Error('rpc '+name+' '+r.status);
  return r.json();
}
/* ㊿+173 성능: 저장된 로그인(만료 전)이 있으면 로그인 확인(사용자 · 2단계 인증 상태)을 기다리지 않고 데이터 요청부터 시작 —
   쓰는 건 확인이 끝난 뒤 같은 토큰일 때만(2단계 인증 뒤에는 토큰이 바뀌어 새로 받음 · 권한은 DB RLS 가 그대로 판단) */
export var PREFETCH={tok:'', p:null, at:0};
export function prefetchData(){
  try{
    if(IS_QA) return;
    var s=sessRead(); if(!s || !s.a || s.p===false) return;
    if(Math.floor(Date.now()/1000) >= (s.e||0)-120) return;   // 곧 만료 → 연장 뒤 새 토큰으로 받음
    PREFETCH.tok=s.a; PREFETCH.at=Date.now();
    PREFETCH.p=fetch(SB_URL+'/rest/v1/rpc/load_all', {method:'POST', headers:{apikey:SB_KEY, Authorization:'Bearer '+s.a, 'Content-Type':'application/json'}, body:'{}'})
      .then(function(r){ return r.ok? r.json() : null; }).catch(function(){ return null; });
  }catch(e){ PREFETCH.p=null; }
}
export function prefetchTake(){
  var p=PREFETCH.p, ok=!!p && PREFETCH.tok===ST.SB_TOKEN && Date.now()-PREFETCH.at<60000;
  PREFETCH.p=null; PREFETCH.tok='';
  return ok? p : null;
}
export async function loadFromDb(){
  if(PERF.boot) PERF.ld=performance.now();   /* ㊿+173 다시 읽기 시간 */
  var permP=loadPerms();   // 메뉴 권한은 데이터와 병렬로 (표가 없거나 행이 없으면 null = 역할 기본)
  var codeP=loadCodes();   // 코드 목록(code_lists · SQL 93)도 병렬로 — 표가 없으면 상수 그대로 (㊿+137)
  // 1) 고속 경로: load_all() 함수로 한 번에 (10_fast_load.sql 적용 시)
  try{
    var pf=prefetchTake(), j=pf? await pf : null;
    if(!j || !j.customers) j=await sbRpc('load_all');
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
  /* ㊿+173 성능: 사본이 너무 크면(대략 4MB 넘음 — 브라우저 한도 근처) 만들지 않음 — 만드는 데만 화면이 0.3초 이상 멈추고 한도를 넘으면 어차피 저장 안 됨 */
  try{ var est=0; (res||[]).forEach(function(a, i){ if(Array.isArray(a)) est+=a.length*(i===2? 55 : 380); }); if(est>4e6){ cacheDrop(); return; } }catch(e){}   /* [2] = 월별 매출 행(작음) */
  var run=function(){ if(g!==CACHE_GEN || !ST.SB_TOKEN) return; try{ sessionStorage.setItem(CACHE_KEY, JSON.stringify({t:t0, res:res})); }catch(e){} };
  try{ if(window.requestIdleCallback) requestIdleCallback(run, {timeout:3000}); else setTimeout(run, 400); }catch(e){ setTimeout(run, 400); }
}
export function loadFromCache(){
  // 이전 방문 때 저장한 데이터로 즉시 그린 뒤, 백그라운드에서 최신본으로 교체
  try{
    var c=JSON.parse(sessionStorage.getItem(CACHE_KEY)||'null');
    if(c && c.res && c.res[0] && c.res[0].length){
      if(Date.now()-(c.t||0) > 10*60*1000) return null;   // 10분 넘은 캐시는 쓰지 않음
      var bc=buildFromRes(c.res); try{ bc._fromCache=true; }catch(e){} return bc;
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
    var segs=[], sum=0, first=null, last=null, cur=/** @type {?{s:number, e:number, v:number}} */ (null);   /* 같은 금액이 이어지는 구간 */
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
  var bn0=document.getElementById('btnNew'); if(bn0) bn0.style.display='none';
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
  if(!skipCache) prefetchData();   /* ㊿+173 로그인 확인과 동시에 데이터 요청 */
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
  /* ㊿+166 로그인 화면 아래 줄: 오늘 날짜 · 포탈 버전 */
  try{ var d0=new Date(), ld=$('#lgDate'), lv=$('#lgVer'), mv=document.querySelector('meta[name="app-ver"]');
    if(ld) ld.textContent=(d0.getMonth()+1)+'월 '+d0.getDate()+'일 '+'일월화수목금토'.charAt(d0.getDay())+'요일';
    if(lv && mv) lv.textContent='포탈 '+String(mv.content||'').replace(/^\S+\s+/,''); }catch(x){}
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
  $('#loading').innerHTML = tpl`<div class="card err" style="max-width:620px">`+
    tpl`<h2>데이터를 불러오지 못했습니다</h2><p class="cap">${rawHtml(String(e&&e.message||e))}</p>`+
    tpl`<p class="cap">네트워크 상태와 Supabase 프로젝트 상태(일시정지 여부)를 확인해 주세요.</p></div>`;
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
  var bnw=document.getElementById('btnNew'); if(bnw) bnw.style.display = ST.IS_VIEWER_ROLE? 'none':'';   /* ㊿+170 «＋ 등록» (메뉴 안 항목은 권한별) */
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
  requestAnimationFrame(function(){ renderAll(); setTimeout(function(){ watchWidth(); try{ renderTodo(); }catch(e){} }, 0); perfAfterData(d); ntfAfterData(); });
}
/* ㊿+173 실사용 속도: 처음 열 때(페이지를 연 순간부터 홈이 그려질 때까지) · 다시 읽기(요청부터 그려질 때까지) */
export function perfAfterData(d){
  try{
    var now=performance.now(), rows=(d && d.rows)? d.rows.length : null;
    if(!PERF.boot){ PERF.boot=now; perfRec('boot', ST.CUR_VIEW||'dash', now, {net_ms:perfNet('/rpc/load_all'), rows:rows, detail:Object.assign(perfDev(), {cache:!!(d && d._fromCache)})}); return; }
    if(PERF.ld!=null){ var t=PERF.ld; PERF.ld=null; perfRec('reload', ST.CUR_VIEW||'', now-t, {net_ms:perfNet('/rpc/load_all'), rows:rows}); }
  }catch(e){}
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
