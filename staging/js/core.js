/* ===== core.js — 공통 유틸 · 데이터 로드 · Supabase · PWA · 메뉴 권한 · 세션 · 2단계 인증 · 자동 로그아웃 · 화면 디자인 =====
   ES 모듈(㊿+153) — 다른 파일의 이름은 아래 import 로만 씀 · 이 파일의 최상위 var/function 은 전부 export · 즉시 실행 문장은 js/init.js 의 start() 에 */
import { APP_VER, IS_QA, IS_STAGING, ST } from './state.js';
import { buildMtabs, buildRail, cacheDrop, dIdx, sbTry, toast } from './shell.js';
import { subgrpSync } from './tools.js';
import { logChange } from './edit.js';
/* ==================================================================
   0. 공통 유틸
   ================================================================== */
export var CH = {};              // Chart 인스턴스
export var HIDDEN = {};          // 라인 legend 토글
export var STATE = { lines:{}, base:0, unit:'month', ind:'', partner:'', status:'', search:'', trendR:24, expM:3, sortAll:{k:'mrr',d:-1} };

export function $(s){ return document.querySelector(s); }
export function $$(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); }
/* ㊿+173 성능: CSS 변수 값 사본 — getComputedStyle 은 바로 앞에서 화면을 바꿨으면 문서 전체 스타일을 다시 계산하게 해 차트마다 수십~수백 ms.
   열쇠 = <html> 의 속성 전부(테마 · 디자인 · 글자 크기 style · class) + 밝게/어둡게 설정 — 속성 읽기는 스타일 계산을 일으키지 않음 · 바뀌면 그 자리에서 비움
   빈 값(스타일 시트 읽기 전)은 담지 않음 */
export var CSSV={m:new Map(), k:'', mq:null};
export function cssvKey(){
  var h=document.documentElement, a=h.attributes, k='';
  for(var i=0;i<a.length;i++) k+=a[i].name+'='+a[i].value+';';
  if(CSSV.mq===null){ try{ CSSV.mq=window.matchMedia('(prefers-color-scheme: dark)'); }catch(e){ CSSV.mq=false; } }
  return k+(CSSV.mq && CSSV.mq.matches? 'D' : 'L')+document.styleSheets.length;
}
export function cssv(n){
  var k=cssvKey(); if(k!==CSSV.k){ CSSV.m.clear(); CSSV.k=k; }
  var v=CSSV.m.get(n); if(v!==undefined) return v;
  v=getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  if(v) CSSV.m.set(n, v);
  return v;
}
/** ㊿+173 성능: 한 번의 계산 묶음(같은 동기 실행) 안에서만 쓰는 사본 — 다음 마이크로태스크에서 비움.
    deps(배열 · 참조 비교)가 바뀌면 그 자리에서 다시 만듦 — 데이터를 새로 읽거나 행이 늘고 줄면 같은 묶음 안에서도 새로 */
export var TICK={m:null};
export function tickMemo(key, deps, build){
  if(!TICK.m){ TICK.m=new Map(); Promise.resolve().then(function(){ TICK.m=null; }); }
  var c=TICK.m.get(key);
  if(c && c.d.length===deps.length && c.d.every(function(x, i){ return x===deps[i]; })) return c.v;
  var v=build(); TICK.m.set(key, {d:deps.slice(), v:v}); return v;
}
export function el(t,c,x){ var e=document.createElement(t); if(c)e.className=c; if(x!=null)e.textContent=x; return e; }

/* 포탈 전체 금액 표시 단위 = 천원 (원 단위 이하는 표시하지 않음)
   · won(v)     → 천원 숫자만 (예: 150,000)  — 호출부에서 '천원' 을 붙입니다
   · wonFull(v) → 천원 + 단위 (예: 150,000천원)
   · 가격표·견적서의 단가는 원 단위 유지 (prWon 사용)
   · ㊿+157 금액 입력 칸도 천원(kwToWon/wonToKw) — 아래 */
export function won(v){ return Math.round(Number(v||0)/1000).toLocaleString('ko-KR'); }
export function wonFull(v){ return Math.round(Number(v||0)/1000).toLocaleString('ko-KR')+'천원'; }
/* ===== ㊿+157 금액 «입력»도 천원 — 화면 표시와 같은 단위 (사용자 결정 2026-10-06 · 2026-10 월 4.8억 입력 사고)
   예전엔 입력·수정·표 ✎·월 목표·설치비는 원, 만기 처리·데이터 점검은 천원이라 같은 사람이 단위를 헷갈렸음.
   · 칸에는 천원(소수 가능: 52.8 = 52,800원) · DB 에는 원(×1000) — kwToWon / wonToKw
   · 칸 아래 실시간 환산(amtHint): «= 48만원 · 480,000원» · 저장 직전 이상한 금액 확인(amtGuard): 이전의 5배↑·1/5↓ · 1만원 미만 · 월 1억원 이상 */
export function kwToWon(v){ if(v==null) return null; var s=String(v).replace(/[,\s]/g,''); if(s==='') return null; var n=Number(s); return isFinite(n)? Math.round(n*1000) : null; }
export function wonToKw(w){ if(w==null || w==='') return ''; var n=Number(w); if(!isFinite(n)) return ''; return String(Math.round(n*1000)/1e6); }   /* 52800 → '52.8' · 소수 원도 그대로 되돌아감 */
export function wonKo(w){   /* 읽기 쉬운 금액 — 4.8억원 · 48만원 · 5.3만원 · 9,000원 */
  var n=Math.round(Number(w)||0), a=Math.abs(n), sg=n<0? '−':'';
  var t=function(x,d){ return String(Math.round(x*Math.pow(10,d))/Math.pow(10,d)).replace(/\B(?=(\d{3})+(?!\d))/g,','); };
  if(a>=1e8) return sg+t(a/1e8, a>=1e10? 0 : 2)+'억원';
  if(a>=1e4) return sg+t(a/1e4, a>=1e6? 0 : 1)+'만원';
  return sg+a.toLocaleString('ko-KR')+'원';
}
export function amtWhy(newWon, prevWon, monthly){   /* 이상한 금액이면 이유 글자 · 아니면 '' */
  var n=Math.abs(Number(newWon)||0), p=Math.abs(Number(prevWon)||0);
  if(!n) return '';
  if(n<10000) return '1만원 미만입니다';
  if(p>0 && n>=p*5) return '이전 금액('+wonKo(p)+')의 '+(Math.round(n/p*10)/10).toLocaleString('ko-KR')+'배입니다';
  if(p>0 && n*5<=p) return '이전 금액('+wonKo(p)+')의 1/'+(Math.round(p/n*10)/10).toLocaleString('ko-KR')+'입니다';
  if(monthly!==false && !p && n>=1e8) return '월 1억원 이상입니다';
  return '';
}
export function amtGuard(newWon, prevWon, what, monthly){   /* 저장 직전 확인 — true = 그대로 진행 */
  var why=amtWhy(newWon, prevWon, monthly); if(!why) return true;
  return confirm((what||'금액')+' '+wonKo(newWon)+' ('+wonFull(newWon)+') — '+why+'.\n\n금액 칸은 «천원» 단위입니다 (48만원 → 480).\n이대로 저장할까요?');
}
export function amtHint(inp, prevWon, monthly){   /* 금액 칸 바로 아래 실시간 환산 · 이상하면 빨간 글씨 */
  if(!inp || inp.__amtHint) return; inp.__amtHint=true;
  var h=document.createElement('span'); h.className='amt-hint'; h.setAttribute('aria-live','polite');
  inp.insertAdjacentElement('afterend', h);
  var upd=function(){ var w=kwToWon(inp.value); if(w==null){ h.textContent='천원 단위'; h.classList.remove('warn'); return; }
    var why=amtWhy(w, prevWon!=null? prevWon : inp.dataset.prev, monthly); h.textContent='= '+wonKo(w)+(Math.abs(w)>=1e4? ' · '+w.toLocaleString('ko-KR')+'원':'')+(why? ' — ⚠ '+why : ''); h.classList.toggle('warn', !!why); };
  inp.addEventListener('input', upd); inp.addEventListener('change', upd); upd();
}
export function pct(v){ return (v>0?'+':'')+v.toFixed(1)+'%'; }
export function mk(i){ return ST.DATA.monthKeys[i]||mkFuture(i); }
// 데이터 범위를 넘어선 미래 월 라벨 (전망에서 사용)
export function mkFuture(i){
  if(i==null||i<0) return '';
  var t=(2020*12+5)+i;
  return Math.floor(t/12)+'-'+('0'+((t%12)+1)).slice(-2);
}
export var LINE_LABEL={Cloud:'Cloud NAC', S1:'S1 Cloud NAC', MDR:'MDR', MDR_S1:'S1 MDR', PNS:'PNS', DRM:'DRM', DLP:'DLP',
  'Cloud NAC':'Cloud NAC', 'SSL PNS':'PNS'};
export function lline(l){ return LINE_LABEL[l]||l; }
/* 서비스 + 버전 — Cloud NAC 은 5.0 / 6.0 (ZTNA) 이 함께 팔리므로 계약 표에서는 버전을 붙여 보여줍니다 (contracts.version: V5.0 / V6.0 / ZTNA) */
export var VER_OPTS=['V6.0','V5.0','ZTNA'];
export function verShort(v){ v=String(v||'').trim(); if(!v) return ''; if(/^ztna$/i.test(v)) return 'ZTNA'; var m=v.match(/(\d+(?:\.\d+)?)/); return m? m[1] : v; }
export function llineVer(l, ver){ var base=lline(l), vs=verShort(ver); if(!vs) return base; if(l==='Cloud'||l==='S1'||l==='Cloud NAC') return vs==='ZTNA'? base.replace('NAC','ZTNA') : base+' '+vs; return base; }
// LIVE 시트 원문 표기 → 표준 코드
export var LIVE2CODE={'Cloud NAC':'Cloud','S1':'S1','MDR':'MDR','SSL PNS':'PNS','PNS':'PNS','DRM':'DRM','DLP':'DLP','MDR_S1':'MDR_S1','Cloud':'Cloud'};
export function qOfIdx(i){ return Math.ceil(monOf(i)/3); }
export function baseRange(){ // 현재 단위 기준 [시작, 끝] 월 인덱스 (끝 = STATE.base)
  var b=STATE.base;
  if(STATE.unit==='quarter'){
    var s=dIdx(yOf(b)+'-'+('0'+((qOfIdx(b)-1)*3+1)).slice(-2));
    return [Math.max(0,s==null?b:s), b];
  }
  if(STATE.unit==='year'){
    var s2=dIdx(yOf(b)+'-01');
    return [Math.max(0,s2==null?b:s2), b];
  }
  return [b,b];
}
export function baseLabel(){
  var b=STATE.base;
  if(STATE.unit==='quarter') return yOf(b)+'년 '+qOfIdx(b)+'분기';
  if(STATE.unit==='year') return yOf(b)+'년';
  return mk(b);
}
export function buildBaseSelect(){
  var sel=$('#fBase'); sel.innerHTML='';
  var i,o;
  if(STATE.unit==='month'){
    for(i=ST.M-1;i>=0;i--){ o=el('option',null,mk(i)); o.value=i; sel.appendChild(o); }
    sel.value=STATE.base;
  }else if(STATE.unit==='quarter'){
    var seen={};
    for(i=ST.M-1;i>=0;i--){
      var k=yOf(i)+'Q'+qOfIdx(i);
      if(seen[k]!=null) continue;
      seen[k]=i; // 그 분기의 마지막(데이터 내) 월
      o=el('option',null,yOf(i)+'년 '+qOfIdx(i)+'분기'); o.value=i; sel.appendChild(o);
    }
    var ck=yOf(STATE.base)+'Q'+qOfIdx(STATE.base);
    if(seen[ck]!=null) STATE.base=seen[ck];
    sel.value=STATE.base;
  }else{
    var seenY={};
    for(i=ST.M-1;i>=0;i--){
      var y=yOf(i);
      if(seenY[y]!=null) continue;
      seenY[y]=i; // 그 해의 마지막(데이터 내) 월
      o=el('option',null,y+'년'); o.value=i; sel.appendChild(o);
    }
    if(seenY[yOf(STATE.base)]!=null) STATE.base=seenY[yOf(STATE.base)];
    sel.value=STATE.base;
  }
}
export function mkLabel(i){ var k=mk(i); return k? k.slice(2).replace('-','.') : ''; }
export function yOf(i){ return +mk(i).slice(0,4); }
export function monOf(i){ return +mk(i).slice(5,7); }
export function seriesColor(n){ return cssv('--s'+((n-1)%8+1)); }

/* ==================================================================
   1. 데이터 로드
   ================================================================== */
/* ---- 에스원 정산(s1.html) → 프로젝트 리포트 화면 열기 ---- */


/* ---------- Supabase ---------- */
/* APP_VER 는 js/state.js 가 index.html <meta name="app-ver"> 에서 읽습니다 (app.css/js 의 ?v= 캐시 무효화 — tests/stamp.mjs · 배포·운영 버전 비교가 그 값을 씀) */
export var SB_URL='https://amzbrdhkvzsyxjfjtugu.supabase.co';
export var SB_KEY='sb_publishable_s_BGJf84vUQoASbT8F0H4g_L2MBOGZF';

/* ---- PWA (홈 화면 앱) — 서비스 워커 등록 · 설치 안내 ---- */
/* ── 스테이징 띠 · 브라우저 오류 수집 (㊿+129) ──
   · …/staging/index.html 로 열리면 IS_STAGING — 상단에 노란 띠(운영 데이터를 쓰는 시험용 포탈임을 표시), 배포·운영의 기본 대상도 스테이징
   · 화면에서 난 JS 오류(error · unhandledrejection)는 client_errors 표(SQL 86)에 기록 → 관리자 › 배포·운영 › 기록 탭. 같은 메시지는 세션당 1번, 최대 8건 */


export var ERRLOG={n:0, seen:{}, max:8};
export function logClientError(msg, src, line, col, stack){
  try{
    if(!ST.SB_TOKEN || !ST.AUTH_USER || IS_QA) return;
    var key=String(msg||'').slice(0,120); if(!key || /ResizeObserver loop|Script error\.?$/.test(key)) return;
    if(ERRLOG.seen[key]){ ERRLOG.seen[key]++; return; } ERRLOG.seen[key]=1;
    if(++ERRLOG.n>ERRLOG.max) return;
    fetch(SB_URL+'/rest/v1/client_errors', {method:'POST', headers:{'Content-Type':'application/json', apikey:SB_KEY, Authorization:'Bearer '+ST.SB_TOKEN, Prefer:'return=minimal'},
      body:JSON.stringify({email:ST.AUTH_USER, ver:APP_VER, view:ST.CUR_VIEW||'', msg:key.slice(0,500), url:String(src||location.href).slice(0,300), line:line||null, col:col||null, stack:String(stack||'').slice(0,2000), ua:navigator.userAgent.slice(0,200), staging:IS_STAGING})}).catch(function(){});
  }catch(e){}
}


/* ── ㊿+173 실사용 속도 기록 (client_perf · SQL 104) ──
   · 첫 화면(로그인 상태로 열기 → 홈 숫자가 그려질 때까지) · 메뉴 이동(누른 뒤 화면이 그려질 때까지) 시간만 — 고객 · 계약 내용은 담지 않음
   · 세션당 최대 30건 · 30초마다 또는 창을 닫을 때 한 번에 보냄 · 표가 없으면(SQL 104 전) 조용히 그만둠
   · 관리자 › 배포·운영 › 기록 «포탈 속도(실사용)»에서 화면별 중앙값 · 느린 쪽(90%) */
export var PERF={q:[], n:0, max:30, off:false, t:null, boot:null, ld:null, last:{}};
export function perfNet(name){
  try{ var es=performance.getEntriesByType('resource').filter(function(e){ return e.name.indexOf(name)>=0; }); var e=es[es.length-1]; return e? Math.round(e.duration) : null; }catch(e){ return null; }
}
export function perfDev(){
  var n=/** @type {any} */(navigator), c=n.connection||{};
  return {cpu:n.hardwareConcurrency||null, mem:n.deviceMemory||null, net:c.effectiveType||null, w:window.innerWidth};
}
export function perfRec(kind, view, ms, extra){
  try{
    if(PERF.off || IS_QA || !(ms>=0) || PERF.n>=PERF.max) return;
    PERF.n++; var r=Object.assign({kind:kind, view:view||'', ms:Math.round(ms), ver:APP_VER}, extra||{});
    PERF.last[kind+':'+(view||'')]=r; PERF.q.push(r);
    if(!PERF.t) PERF.t=setTimeout(perfFlush, 30000);
    if(PERF.q.length>=10) perfFlush();
  }catch(e){}
}
export function perfFlush(keep){
  try{
    if(PERF.t){ clearTimeout(PERF.t); PERF.t=null; }
    if(!PERF.q.length || PERF.off || !ST.SB_TOKEN || !ST.AUTH_USER) return;
    var rows=PERF.q.splice(0).map(function(r){ return {email:ST.AUTH_USER, ver:r.ver, kind:r.kind, view:r.view, ms:r.ms, net_ms:r.net_ms==null? null : r.net_ms, rows:r.rows==null? null : r.rows, detail:r.detail||null}; });
    fetch(SB_URL+'/rest/v1/client_perf', {method:'POST', keepalive:!!keep, headers:{'Content-Type':'application/json', apikey:SB_KEY, Authorization:'Bearer '+ST.SB_TOKEN, Prefer:'return=minimal'}, body:JSON.stringify(rows)})
      .then(function(res){ if([400,401,403,404].indexOf(res.status)>=0) PERF.off=true; }).catch(function(){});   /* 표가 없거나(SQL 104 전) 권한이 없으면 이 세션은 그만 */
  }catch(e){}
}
/** 메뉴 이동 시간 — 누른 뒤 두 번째 그리기(화면이 실제로 바뀐 뒤)까지 */
export function perfNav(v){
  if(PERF.off || IS_QA || typeof requestAnimationFrame==='undefined') return;
  var t0=performance.now();
  requestAnimationFrame(function(){ requestAnimationFrame(function(){ perfRec('nav', v, performance.now()-t0); }); });
}

export var PWA={deferred:null};
export function pwaStandalone(){ try{ return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone===true; }catch(e){ return false; } }
export function pwaIsIOS(){ return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1); }


export function pwaInstall(){ if(!PWA.deferred) return false; var ev=PWA.deferred; ev.prompt(); ev.userChoice.then(function(){ PWA.deferred=null; pwaHintSync(); }); return true; }
/* 설치 안내 카드 내용 (내 계정 › 설정) */
export function pwaHintHtml(){
  if(pwaStandalone()) return '<span style="color:var(--brand);font-weight:650">지금 앱으로 실행 중입니다 ✓</span><div class="mini" style="margin-top:5px;line-height:1.6">홈 화면 아이콘으로 열린 상태입니다. 새 버전은 다음 실행 때 자동으로 반영됩니다.</div>';
  if(PWA.deferred) return '<button type="button" class="pill pri" id="accPwaGo">📱 홈 화면에 설치</button><div class="mini" style="margin-top:5px;line-height:1.6">설치하면 주소창 없이 전체 화면 앱처럼 열립니다. 스토어 등록·다운로드 없음, 새 버전은 자동 반영.</div>';
  if(pwaIsIOS()) return '<div style="font-size:14px;line-height:1.7">Safari 하단 <b>공유</b> 버튼 <span style="display:inline-block;border:1px solid var(--ring);border-radius:5px;padding:0 5px;font-size:12px">⎋</span> → <b>«홈 화면에 추가»</b> → 추가</div><div class="mini" style="margin-top:5px;line-height:1.6">아이폰·아이패드는 Safari 에서만 설치됩니다(Chrome 앱에서는 안 됨). 설치 후 홈 화면의 «SVC 포탈» 아이콘으로 열면 전체 화면 앱처럼 동작합니다.</div>';
  return '<div style="font-size:14px;line-height:1.7">Chrome 주소창 오른쪽의 <b>설치</b> 아이콘, 또는 메뉴(⋮) › <b>«앱 설치»</b> / «홈 화면에 추가»</div><div class="mini" style="margin-top:5px;line-height:1.6">안드로이드·PC Chrome·Edge 에서 됩니다. 설치하면 주소창 없이 전체 화면으로 열리고 새 버전은 자동 반영됩니다.</div>';
}
export function pwaHintSync(){ var h=document.getElementById('accPwa'); if(!h) return; h.innerHTML=pwaHintHtml(); var b=document.getElementById('accPwaGo'); if(b) b.onclick=function(){ pwaInstall(); }; }

/* ---- 계정별 메뉴 권한 (user_perms · SQL 79) — 슈퍼 관리자가 관리자 › 메뉴 권한에서 지정 ----
   보기(v): 메뉴 표시·화면 열기 · 읽기(r): 화면 안 데이터 열람 · 쓰기(w): 추가·수정·삭제.
   행이 없는 메뉴는 역할 기본(admin 전부 · admin_viewer 보기+읽기). super_admin 은 항상 전부. 홈·내 계정은 항상 보임. */
export var PERM_EXEMPT={dash:1, account:1, adminx:1, log:1, csite:1, ops:1};   // 역할로만 다루는 화면
export async function loadPerms(){
  if(!ST.SB_TOKEN || !ST.AUTH_USER){ ST.PERMS=null; return null; }
  try{
    var rows=await sbTry('user_perms?select=view,can_view,can_read,can_write&email=eq.'+encodeURIComponent(String(ST.AUTH_USER).toLowerCase()));
    var m=null; (rows||[]).forEach(function(r){ m=m||{}; m[r.view]={v:r.can_view!==false, r:r.can_read!==false, w:!!r.can_write}; });
    ST.PERMS=m; try{ sessionStorage.setItem('svc_perms', JSON.stringify(m)); }catch(e){}
    return m;
  }catch(e){ ST.PERMS=null; return null; }
}
export function permOf(v){
  var roleW=!ST.IS_VIEWER_ROLE;
  if(ST.IS_SUPER || PERM_EXEMPT[v] || !v) return {v:true, r:true, w:roleW};
  var p=ST.PERMS && ST.PERMS[v];
  if(!p) return {v:true, r:true, w:roleW};
  return {v:!!p.v, r:!!(p.v&&p.r), w:!!(p.v&&p.r&&p.w&&roleW)};
}
export function canView(v){ return permOf(v).v; }
export function canRead(v){ return permOf(v).r; }
export function canWrite(v){ return permOf(v).w; }
/* 메뉴에 반영 — 보기 없는 버튼 숨김, 버튼이 하나도 안 남은 그룹은 그룹도 숨김 */
export function applyPerms(){
  var side=document.getElementById('side'); if(!side) return;
  side.querySelectorAll('button[data-v]').forEach(function(b){ var v=b.dataset.v; if(PERM_EXEMPT[v]) return; b.classList.toggle('pdeny', !canView(v)); });
  side.querySelectorAll('.grp').forEach(function(g){
    if(g.id==='grpAdmin') return;
    var any=false, el=g.nextElementSibling;
    while(el && !el.classList.contains('grp')){ if(el.tagName==='BUTTON' && !el.classList.contains('pdeny') && el.style.display!=='none') any=true; el=el.nextElementSibling; }
    g.classList.toggle('pdeny', !any);
  });
  try{ subgrpSync(); }catch(e){}
  try{ buildRail(); buildMtabs(); }catch(e){}
  try{ var be=$('#btnEdit'); if(be && ST.SB_TOKEN) be.style.display=(ST.IS_VIEWER_ROLE || !canWrite('contracts'))? 'none':''; }catch(e){}
}
/* 화면을 열 때 — 현재 화면의 쓰기 권한을 IS_VIEWER 에 반영(기존 조회 전용 로직을 그대로 재사용) · 읽기 없으면 안내로 덮음 */
export function permEnter(v){
  ST.IS_VIEWER = !!ST.IS_VIEWER_ROLE || !canWrite(v);
  var app=document.getElementById('app'); if(app) app.classList.toggle('perm-deny', !canRead(v));
}
/* 쓰기 호출 공통 관문 — 현재 화면에 쓰기 권한이 없으면 저장 자체를 막음 (변경 이력·읽기용 RPC 는 예외) */
export function permWriteGuard(method, path, asView){
  if(!/^(POST|PATCH|PUT|DELETE)$/i.test(method)) return;
  if(/^change_log\b|^ai_chat_history\b|^ai_feedback\b|^ai_check_log\b|^rpc\/(load_|admin_|ai_)|^user_perms\b|^ai_billing\b|^recv_presets\b/.test(path)) return;   // 이력·개인 기록·관리자 RPC 는 화면 권한과 무관
  if(ST.IS_SUPER) return;
  var pv=asView||ST.CUR_VIEW;
  if(!canWrite(pv)){ var b=document.querySelector('#side button[data-v="'+pv+'"]'); var nm=b? navText(b) : pv; throw new Error('쓰기 권한이 없습니다 — 「'+nm+'」 화면은 읽기만 허용돼 있습니다. 슈퍼 관리자에게 «쓰기» 권한을 요청하세요.'); }
}

/* ---- 로그인 세션 유지 ----
   sessionStorage 에 두면 홈 화면 앱(PWA)은 닫을 때마다 로그아웃됩니다.
   «로그인 유지»(svc_keep · 앱/모바일에서는 기본 켬)면 localStorage 에도 복사해 두고, 시작할 때 sessionStorage 로 되살립니다
   (위성 페이지 quote/report/s1/kk 는 sessionStorage 를 읽으므로 그대로 동작). 자동 로그아웃 설정은 그대로 적용됩니다. */
export var SESS_KEY='svc_sess';
export function keepLogin(){ try{ var v=localStorage.getItem('svc_keep'); if(v!==null) return v==='1'; }catch(e){} return pwaStandalone() || (window.matchMedia && window.matchMedia('(max-width:760px)').matches); }
export function sessRead(){
  var s=null; try{ s=JSON.parse(sessionStorage.getItem(SESS_KEY)||'null'); }catch(e){}
  if(!s){ try{ s=JSON.parse(localStorage.getItem(SESS_KEY)||'null'); if(s) sessionStorage.setItem(SESS_KEY, JSON.stringify(s)); }catch(e){} }
  return s;
}
export function sessWrite(o){
  var j=JSON.stringify(o);
  try{ sessionStorage.setItem(SESS_KEY, j); }catch(e){}
  try{ if(keepLogin()) localStorage.setItem(SESS_KEY, j); else localStorage.removeItem(SESS_KEY); }catch(e){}
}
export function saveSess(j,email,pOverride){
  var s0=null; try{ s0=sessRead(); }catch(e){}
  sessWrite({
    a:j.access_token, r:j.refresh_token||null,
    e:Math.floor(Date.now()/1000)+(j.expires_in||3600), u:email,
    p:(pOverride!==undefined)? pOverride : !!(j.user&&j.user.user_metadata&&j.user.user_metadata.pw_changed),
    m:(s0 && s0.u===email && s0.m) || ''   /* ㊿+145: 'none' = 지난번 확인 때 인증 앱 없음·필수 지정 기한 전 → 다음 시작 때 확인을 기다리지 않음 */
  });
}
export function sessMark(m){ try{ var s=sessRead(); if(s){ s.m=m||''; sessWrite(s); } }catch(e){} }
export function clearSess(){ try{ sessionStorage.removeItem(SESS_KEY); }catch(e){} try{ localStorage.removeItem(SESS_KEY); }catch(e){} }
export async function restoreSess(){
  var s=sessRead();
  if(!s || !s.a || s.p===false) return false;      // 비밀번호 미변경 계정은 다시 로그인
  if(Math.floor(Date.now()/1000) < (s.e||0)-120){ ST.SB_TOKEN=s.a; ST.AUTH_USER=s.u; }
  else {
    if(!s.r){ clearSess(); return false; }
    try{
      var r=await fetch(SB_URL+'/auth/v1/token?grant_type=refresh_token',{
        method:'POST', headers:{apikey:SB_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({refresh_token:s.r})});
      var j=await r.json();
      if(!r.ok||!j.access_token){ clearSess(); return false; }
      ST.SB_TOKEN=j.access_token; ST.AUTH_USER=s.u; saveSess(j,s.u,true);
    }catch(e){ clearSess(); return false; }
  }
  // 인증 앱이 등록된 계정인데 저장된 세션이 aal1(코드 미확인)이면 코드부터 — 취소하면 로그인 화면으로
  // ㊿+145: 지난번 확인에서 «인증 앱 없음»(s.m='none')이면 기다리지 않고 데이터부터 — 확인은 뒤에서(mfaBgCheck)
  if(sessAal(ST.SB_TOKEN)==='aal1' && !(await mfaGate(ST.SB_TOKEN, ST.AUTH_USER, null, {fast:(sessRead()||{}).m==='none'}))){ clearSess(); ST.SB_TOKEN=null; ST.AUTH_USER=null; return false; }
  return true;
}
/* ---- 토큰 자동 연장: 화면을 계속 켜둬도 로그인이 안 끊기게 ---- */
export async function refreshToken(){
  var s=sessRead();
  if(!s || !s.r) return false;
  try{
    var r=await fetch(SB_URL+'/auth/v1/token?grant_type=refresh_token',{
      method:'POST', headers:{apikey:SB_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({refresh_token:s.r})});
    var j=await r.json();
    if(!r.ok || !j.access_token) return false;
    ST.SB_TOKEN=j.access_token; saveSess(j, s.u, true);
    return true;
  }catch(e){ return false; }
}


export function doLogout(){
  if(!confirm('로그아웃할까요?')) return;
  clearSess(); cacheDrop();
  ST.SB_TOKEN=null; ST.AUTH_USER=null; reloadHome();
}
/* ㊿+145: 로그아웃 뒤에는 «이전 메뉴»가 아니라 처음(대시보드)부터 — 주소의 #메뉴 · ?v= 를 떼고 다시 엽니다 */
export function reloadHome(){ try{ location.replace(location.pathname); }catch(e){ location.reload(); } }

/* ---- 2단계 인증 (MFA · 인증 앱 TOTP) — Supabase Auth factors API (80점 프로젝트 ② 보안 · SQL 88) ----
   · 선택 적용: 내 계정 › 보안에서 본인이 켬. 켠 계정은 로그인 뒤 6자리 코드를 넣어야 aal2 세션을 받고,
     SQL 88 의 restrictive 정책(mfa_ok)이 aal1 토큰의 데이터 접근을 DB 단에서 막음(등록하지 않은 계정은 영향 없음).
   · 저장된 세션(로그인 유지)이 aal1 인데 인증 앱이 등록돼 있으면 시작할 때 코드를 요구(restoreSess).
   · 복구: 폰을 잃어버리면 슈퍼 관리자가 배포·운영 › SQL 에서 auth.mfa_factors 행을 지움(SQL 88 끝 주석). */
export function b64urlJson(p){ p=String(p||'').replace(/-/g,'+').replace(/_/g,'/'); while(p.length%4) p+='='; var bin=atob(p), u=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return JSON.parse(new TextDecoder().decode(u)); }
export function sessAal(tok){ try{ return b64urlJson(String(tok||ST.SB_TOKEN||'').split('.')[1]).aal||'aal1'; }catch(e){ return 'aal1'; } }
export function authHdr(tok){ return {apikey:SB_KEY, 'Content-Type':'application/json', Authorization:'Bearer '+(tok||ST.SB_TOKEN)}; }
export async function authApi(method, path, body, tok){
  var r=await fetch(SB_URL+'/auth/v1/'+path, {method:method, headers:authHdr(tok), body:body? JSON.stringify(body) : undefined});
  var j=null; try{ j=await r.json(); }catch(e){ j={}; }
  if(!r.ok){ var e2=new Error((j&&(j.msg||j.error_description||j.message||j.error))||('인증 서버 오류 '+r.status)); e2.status=r.status; throw e2; }
  return j||{};
}
export async function mfaFactors(tok){ var u=await authApi('GET','user',null,tok); return (u.factors||[]).filter(function(f){ return f.factor_type==='totp'; }); }
export function mfaVerifiedOf(fs){ return (fs||[]).filter(function(f){ return f.status==='verified' && f.factor_type==='totp'; }); }
/* 로그인(또는 저장된 세션) 뒤 관문: 인증 앱이 등록돼 있고 토큰이 aal1 이면 코드를 받아 aal2 세션으로 교체. true=계속 · false=중단 */
export var MFA_ST=null;   // 본인 정책(rpc mfa_status · SQL 89) — {required, deadline, today, enrolled, aal}
export async function mfaPolicy(tok){
  try{ var r=await fetch(SB_URL+'/rest/v1/rpc/mfa_status',{method:'POST', headers:authHdr(tok), body:'{}'}); if(!r.ok) return null; return await r.json(); }catch(e){ return null; }
}
export function mfaDue(st){ return !!(st && st.required && !st.enrolled && (!st.deadline || (st.today||new Date().toISOString().slice(0,10))>=st.deadline)); }
export function mfaDaysLeft(st){ if(!st||!st.deadline) return 0; var a=new Date(st.deadline+'T00:00:00'), b=new Date((st.today||new Date().toISOString().slice(0,10))+'T00:00:00'); return Math.round((a.getTime()-b.getTime())/86400000); }
export async function mfaGate(tok, email, factorsHint, opt){
  if(sessAal(tok)==='aal2') return true;
  /* ㊿+145 빠른 길: 로그인 응답에 «확인된 인증 앱»이 없거나(대부분의 계정) 지난번 확인 결과가 «없음»이면
     인증 서버 왕복 2번(인증 앱 목록 · 필수 지정)을 기다리지 않고 바로 통과 → 데이터 읽기와 병렬로 뒤에서 확인(mfaBgCheck).
     확인 결과 코드·등록이 필요하면 그때 창을 띄우고, 끝나면 새로고침. 보안 경계는 DB(SQL 88 mfa_ok) — aal1 토큰으론 데이터가 안 나옴 */
  if(opt && opt.fast){ setTimeout(function(){ mfaBgCheck(tok, email); }, 0); return true; }
  var fs; try{ fs=mfaVerifiedOf(factorsHint||await mfaFactors(tok)); }catch(e){ return true; }   // 조회 실패 → 통과 (DB 쪽 SQL 88 이 2차 방어)
  if(fs.length) return mfaPrompt(fs[0], tok, email);
  // 등록된 인증 앱이 없음 → 관리자가 이 계정을 필수로 지정했는지 (SQL 89 · 함수가 없으면 null = 선택 적용)
  var st=await mfaPolicy(tok); MFA_ST=st;
  if(st && st.required){
    if(mfaDue(st)) return mfaForceEnroll(tok, email, st);      // 기한 없음/지남 → 등록해야 들어감 (DB 도 mfa_ok 가 false 라 데이터 없음)
    MFA_WARN=st;                                                // 유예 기간 → 들어가되 안내
  }
  if(!factorsHint) sessMark('none');                            // 서버에서 직접 확인한 «없음» → 다음 새로고침은 빠른 길
  return true;
}
/* 뒤에서 확인 (빠른 길 다음) — 인증 앱 목록과 필수 지정을 동시에 물어봄 */
export async function mfaBgCheck(tok, email){
  var r; try{ r=await Promise.all([mfaFactors(tok).catch(function(){ return null; }), mfaPolicy(tok)]); }catch(e){ return; }
  if(ST.SB_TOKEN!==tok) return;                                    // 그사이 로그아웃 · 토큰 교체
  var fs=r[0], st=r[1], vf=mfaVerifiedOf(fs||[]); MFA_ST=st;
  function out(){ clearSess(); ST.SB_TOKEN=null; ST.AUTH_USER=null; reloadHome(); }
  if(vf.length){ sessMark(''); if(!(await mfaPrompt(vf[0], tok, email))) return out(); location.reload(); return; }
  if(st && st.required && mfaDue(st)){ sessMark(''); if(!(await mfaForceEnroll(tok, email, st))) return out(); location.reload(); return; }
  if(fs) sessMark('none');
  if(st && st.required){ MFA_WARN=st; if(ST.DATA) try{ mfaWarnIfNeeded(); }catch(e){} }
}
export var MFA_WARN=null;
export function mfaWarnIfNeeded(){
  var st=MFA_WARN; if(!st) return; MFA_WARN=null;
  var d=mfaDaysLeft(st);
  toast('2단계 인증 등록이 필요합니다', (/role/.test(st.source||'')? '관리자 계정 기본 정책' : '관리자 지정')+' — '+st.deadline+' 까지('+(d>0? d+'일 남음':'오늘')+') 내 계정 › 보안에서 켜 주세요. 지나면 등록 전까지 포탈을 쓸 수 없습니다.', 'warn');
}
/* ㊿+167 2단계 인증 창 새 디자인 — 6칸 숫자 상자(진짜 입력칸 하나를 투명하게 겹침 · 붙여넣기·자동 완성 그대로) · 30초 코드 주기 링 · 틀리면 흔들림 */
export function otpCellsHtml(id, label){
  return tpl`<div class="otp" data-otp="${id}"><input id="${id}" class="otp-in" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="${label}" spellcheck="false">`+
    tpl`<div class="otp-cells" aria-hidden="true">${rawHtml('<span></span>'.repeat(6))}</div></div>`;
}
export function otpBind(inp){
  var box=inp && inp.parentElement; if(!box) return;
  var cells=[].slice.call(box.querySelectorAll('.otp-cells span'));
  function paint(){ var v=(inp.value||'').replace(/\D/g,'').slice(0,6), foc=document.activeElement===inp;
    cells.forEach(function(c,i){ c.textContent=v.charAt(i)||''; c.classList.toggle('on', foc && (i===v.length || (v.length===6 && i===5))); c.classList.toggle('fill', i<v.length); }); }
  inp.addEventListener('input', paint); inp.addEventListener('focus', paint); inp.addEventListener('blur', paint); inp.addEventListener('keyup', paint);
  box.addEventListener('click', function(){ inp.focus(); });
  paint(); return paint;
}
export function otpShake(inp){ var box=inp && inp.parentElement; if(!box) return; box.classList.remove('bad'); void box.offsetWidth; box.classList.add('bad'); }
/* 코드가 바뀌기까지 남은 초 (인증 앱 30초 주기) — 링과 글자 */
export function mfaRingHtml(){
  return tpl`<div class="mfa-ring" aria-hidden="true"><svg viewBox="0 0 96 96"><circle class="r0" cx="48" cy="48" r="44"/><circle class="r1" cx="48" cy="48" r="44" pathLength="100"/></svg>`+
    tpl`<svg class="mfa-mark" viewBox="0 0 171.1 133.4"><use href="#gnMark"/></svg></div>`;
}
export function mfaRingRun(ov){
  var r=ov.querySelector('.mfa-ring .r1'), tx=ov.querySelector('.mfa-sec'); if(!r) return;
  function tick(){ if(!document.body.contains(ov)){ clearInterval(iv); return; }
    var s=30-((Date.now()/1000)%30); r.setAttribute('stroke-dasharray', (s/30*100).toFixed(2)+' 100'); r.classList.toggle('low', s<6);
    if(tx) tx.textContent='인증 앱 코드가 바뀌기까지 '+Math.ceil(s)+'초'; }
  var iv=setInterval(tick, 250); tick();
}
/* 필수 지정 + 기한 지남: 등록 창을 띄우고 끝나야 들어감 (취소 = 로그아웃) */
export function mfaForceEnroll(tok, email, st){
  return new Promise(function(resolve){
    var old=document.getElementById('ovlMfa'); if(old) old.remove();
    var ov=document.createElement('div'); ov.id='ovlMfa'; ov.className='ovl on'; ov.style.cssText='z-index:100000;align-items:center';
    ov.classList.add('mfa-ovl');
    ov.innerHTML=tpl`<div class="modal mfa-card wide" role="dialog" aria-modal="true" aria-labelledby="mfaTitle"><div class="mfa-top"><span class="mfa-shield">${rawHtml('<svg viewBox="0 0 171.1 133.4" aria-hidden="true"><use href="#gnMark"/></svg>')}</span>`+
      tpl`<div><h3 id="mfaTitle" class="mfa-h">2단계 인증 등록이 필요합니다</h3><p class="mfa-p">관리자가 <b>${email||''}</b> 계정에 2단계 인증을 필수로 지정했습니다${rawHtml(st&&st.deadline? ' (기한 '+esc(st.deadline)+' 지남)':'')}. 인증 앱을 등록해야 포탈을 쓸 수 있어요 — 1분이면 끝납니다.</p></div></div>`+
      tpl`<div id="mfaForceHost"></div>`+
      tpl`<div class="mfa-foot"><span>폰을 바꾸거나 잃어버리면 슈퍼 관리자에게 해제를 요청하세요</span><button type="button" class="pill ghost" id="mfaForceCancel">나중에 (로그아웃)</button></div></div>`;
    document.body.appendChild(ov);
    ov.querySelector('#mfaForceCancel').onclick=function(){ ov.remove(); resolve(false); };
    mfaEnrollFlow([], ov.querySelector('#mfaForceHost'), {tok:tok, email:email, onDone:function(ok){ if(ok){ ov.remove(); resolve(true); } }});
  });
}
export function mfaApplySession(s, email){
  ST.SB_TOKEN=s.access_token; if(email) ST.AUTH_USER=email;
  var s0=sessRead(); saveSess(s, ST.AUTH_USER, (s0&&s0.p!==undefined)? s0.p : undefined);
}
/* 코드 입력 창 — 로그인 화면·로딩 화면 위에도 떠야 하므로 z-index 를 크게. 취소 = 로그인 중단 */
export function mfaPrompt(factor, tok, email){
  return new Promise(function(resolve){
    var old=document.getElementById('ovlMfa'); if(old) old.remove();
    var ov=document.createElement('div'); ov.id='ovlMfa'; ov.className='ovl on'; ov.style.cssText='z-index:100000;align-items:center';
    ov.classList.add('mfa-ovl');
    ov.innerHTML=tpl`<div class="modal mfa-card" role="dialog" aria-modal="true" aria-labelledby="mfaTitle">${rawHtml(mfaRingHtml())}`+
      tpl`<h3 id="mfaTitle" class="mfa-h c">2단계 인증</h3><div class="mfa-who">${email||ST.AUTH_USER||''}</div>`+
      tpl`<p class="mfa-p c">인증 앱(Google · Microsoft Authenticator 등)에 보이는 <b>6자리 코드</b>를 입력하세요</p>`+
      tpl`${rawHtml(otpCellsHtml('mfaCode','인증 코드 6자리'))}<div class="mfa-sec"></div>`+
      tpl`<div class="mmsg mfa-msg" id="mfaMsg" role="status" aria-live="polite"></div>`+
      tpl`<div class="mfa-btns"><button type="button" class="pill ghost" id="mfaCancel">취소</button><button type="button" class="pill mfa-go" id="mfaGo">확인</button></div>`+
      tpl`<div class="mfa-note">폰을 바꾸거나 잃어버렸다면 슈퍼 관리자에게 해제를 요청하세요</div></div>`;
    document.body.appendChild(ov);
    var inp=ov.querySelector('#mfaCode'), msgEl=ov.querySelector('#mfaMsg'), go=ov.querySelector('#mfaGo'), ch=null, busy=false, fails=0;
    var repaint=otpBind(inp); mfaRingRun(ov);
    function say(t,bad){ msgEl.textContent=t||''; msgEl.style.color=bad? 'var(--critical,#d03b3b)':'var(--muted)'; if(bad) otpShake(inp); }
    function done(ok){ ov.remove(); resolve(ok); }
    async function challenge(){ try{ ch=await authApi('POST','factors/'+factor.id+'/challenge',{},tok); }catch(e){ ch=null; say('인증 요청을 만들지 못했습니다: '+e.message, true); } }
    async function submit(){
      var code=(inp.value||'').replace(/\D/g,''); if(code.length!==6){ say('6자리 숫자를 입력하세요', true); inp.focus(); return; }
      if(busy) return; busy=true; go.disabled=true; say('확인 중…');
      try{
        if(!ch) await challenge(); if(!ch) throw new Error('다시 시도해 주세요');
        var s=await authApi('POST','factors/'+factor.id+'/verify',{challenge_id:ch.id, code:code},tok);
        if(!s.access_token) throw new Error('세션을 받지 못했습니다');
        mfaApplySession(s, email); done(true); return;
      }catch(e){
        fails++; ch=null;   // 틀리거나 만료됐으면 다음엔 새 challenge
        say(fails>=5? '여러 번 틀렸습니다 — 인증 앱의 시간 설정을 확인하세요 ('+e.message+')' : '코드가 맞지 않습니다 — 다시 입력하세요', true);
        inp.value=''; inp.focus(); if(repaint) repaint();
      }
      busy=false; go.disabled=false;
    }
    go.onclick=submit; inp.onkeydown=function(e){ if(e.key==='Enter'){ e.preventDefault(); submit(); } };
    inp.oninput=function(){ inp.value=inp.value.replace(/\D/g,'').slice(0,6); if(inp.value.length===6 && !busy) submit(); };
    ov.querySelector('#mfaCancel').onclick=function(){ done(false); };
    challenge(); setTimeout(function(){ inp.focus(); },60);
  });
}
/* 내 계정 › 보안 카드 — 상태 · 켜기(QR 등록) · 끄기 */
export async function mfaCardRender(host){
  if(!host) return; host.innerHTML='<span class="mini">확인 중…</span>';
  var fs; try{ fs=await mfaFactors(); }catch(e){ host.innerHTML=tpl`<span class="mini" style="color:var(--critical)">상태를 읽지 못했습니다: ${e.message}</span>`; return; }
  var vf=mfaVerifiedOf(fs), aal=sessAal();
  var pol=await mfaPolicy(); MFA_ST=pol||MFA_ST;
  var polHtml=(pol&&pol.required)? tpl`<div class="mini" style="margin:0 0 6px;color:var(--s3-ink)">관리자 지정: <b>필수</b>${rawHtml(pol.deadline? ' · 기한 '+esc(pol.deadline)+(!pol.enrolled? ' ('+(mfaDaysLeft(pol)>0? mfaDaysLeft(pol)+'일 남음':'지남')+')':''):'')}</div>` : '';
  if(vf.length){
    host.innerHTML=tpl`${rawHtml(polHtml)}<div><b style="color:var(--brand)">켜짐</b> <span class="mini">· ${vf[0].friendly_name||'인증 앱'} · 등록 ${String(vf[0].created_at||'').slice(0,10)} · 이 세션 ${rawHtml(aal==='aal2'? '2단계 확인됨' : '<span style="color:var(--critical)">코드 미확인</span>')}</span></div>`+
      tpl`<div class="mini" style="margin:5px 0 8px;line-height:1.6">로그인할 때마다 인증 앱의 6자리 코드가 필요합니다. 인증 앱을 바꾸려면 끄고 다시 켜세요(코드 필요). 폰을 잃어버렸으면 슈퍼 관리자에게 해제를 요청하세요.</div>`+
      tpl`<button type="button" class="pill ghost" id="mfaOff" style="border-color:var(--critical,#d03b3b);color:var(--critical,#d03b3b)">2단계 인증 끄기</button>`;
    host.querySelector('#mfaOff').onclick=function(){ mfaDisable(vf, host); };
  } else {
    host.innerHTML=tpl`${rawHtml(polHtml)}<div><b>꺼짐</b> <span class="mini">· 비밀번호만으로 로그인</span></div>`+
      tpl`<div class="mini" style="margin:5px 0 8px;line-height:1.6">인증 앱(Google Authenticator · Microsoft Authenticator · 1Password 등)을 등록하면 비밀번호가 새어도 코드 없이는 들어올 수 없습니다. 이 계정에만 적용되며 다른 사용자는 영향이 없습니다.</div>`+
      tpl`<button type="button" class="pill" id="mfaOn">🔐 2단계 인증 켜기</button>`;
    host.querySelector('#mfaOn').onclick=function(){ mfaEnrollFlow(fs, host); };
  }
}
/* GoTrue 의 qr_code 는 SVG 원문(«<?xml …?><svg …», data: 접두 없음 — 문서: «data:image/svg+xml;utf-8, 를 앞에 붙이라») — 그대로 src 에 넣으면 깨지므로 percent-encoding 한 data URL 로 정규화 (㊿+131 수정) */
export function mfaQrSrc(q){
  q=String(q||'').trim(); if(!q) return '';
  var svg=null, m=/^data:image\/svg\+xml(;[^,]*)?,([\s\S]*)$/i.exec(q);
  if(m){ if(/base64/i.test(m[1]||'')) return q; svg=m[2]; try{ svg=decodeURIComponent(svg); }catch(e){} }
  else if(/^data:/i.test(q)) return q;                 // PNG 등 다른 data URL 은 그대로
  else if(/<svg[\s>]/i.test(q)) svg=q;                 // GoTrue 실제 응답: «<?xml version="1.0"?><svg …» 원문 (data: 접두 없음)
  if(svg===null) return q;
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
export async function mfaEnrollFlow(existing, host, opts){
  opts=opts||{}; var tok=opts.tok||null, who=opts.email||ST.AUTH_USER;
  var back=function(ok){ if(opts.onDone) opts.onDone(ok); else mfaCardRender(host); };
  host.innerHTML='<span class="mini">등록 준비 중…</span>';
  try{
    if(!existing){ try{ existing=await mfaFactors(tok); }catch(e){ existing=[]; } }
    for(var i=0;i<(existing||[]).length;i++) if(existing[i].status!=='verified'){ try{ await authApi('DELETE','factors/'+existing[i].id,null,tok); }catch(e){} }   // 끝내지 않은 등록은 지우고 새로
    var name='SVC 포탈 '+new Date().toISOString().slice(0,10);
    var f=await authApi('POST','factors',{factor_type:'totp', friendly_name:name, issuer:'SVC 포탈'},tok);
    var totp=f.totp||{};
    host.innerHTML=tpl`<div class="mfa-en">${rawHtml(totp.qr_code? tpl`<div class="mfa-qr"><img src="${mfaQrSrc(totp.qr_code)}" alt="인증 앱 등록 QR"><i></i><i></i><i></i><i></i></div>`:'')}`+
      tpl`<ol class="mfa-steps"><li><b>인증 앱 열기</b><span>Google · Microsoft Authenticator, 1Password 등 → «계정 추가»</span></li>`+
      tpl`<li><b>QR 스캔</b><span>안 되면 키를 직접 입력</span><span class="mfa-key"><code>${totp.secret||''}</code><button type="button" class="cbtn" id="mfaEnCopy">복사</button></span></li>`+
      tpl`<li><b>앱에 뜬 6자리 코드 입력</b>${rawHtml(otpCellsHtml('mfaEnCode','인증 코드'))}`+
      tpl`<div class="mfa-btns l"><button type="button" class="pill mfa-go" id="mfaEnGo">확인하고 켜기</button><button type="button" class="pill ghost" id="mfaEnCancel">취소</button></div>`+
      tpl`<div class="mmsg mfa-msg" id="mfaEnMsg" role="status" aria-live="polite"></div></li></ol></div>`;
    var inp=host.querySelector('#mfaEnCode'), m=host.querySelector('#mfaEnMsg'), repaint=otpBind(inp);
    var cp=host.querySelector('#mfaEnCopy'); if(cp) cp.onclick=function(){ try{ navigator.clipboard.writeText(String(totp.secret||'')).then(function(){ cp.textContent='복사됨'; }, function(){ cp.textContent='직접 선택'; }); }catch(e){ cp.textContent='직접 선택'; } };
    host.querySelector('#mfaEnCancel').onclick=async function(){ try{ await authApi('DELETE','factors/'+f.id,null,tok); }catch(e){} back(false); };
    if(opts.onDone) host.querySelector('#mfaEnCancel').style.display='none';   // 강제 등록 창은 바깥의 «나중에(로그아웃)» 만
    async function go(){
      var code=(inp.value||'').replace(/\D/g,''); if(code.length!==6){ m.textContent='6자리 숫자를 입력하세요'; m.style.color='var(--critical,#d03b3b)'; otpShake(inp); return; }
      m.textContent='확인 중…'; m.style.color='';
      try{
        var ch=await authApi('POST','factors/'+f.id+'/challenge',{},tok);
        var s=await authApi('POST','factors/'+f.id+'/verify',{challenge_id:ch.id, code:code},tok);
        mfaApplySession(s, who);
        logChange('mfa_on','auth',who,{factor:name, forced:!!opts.onDone});
        toast('2단계 인증 켜짐', '다음 로그인부터 인증 앱 코드가 필요합니다', 'ok');
        back(true);
      }catch(e){ m.textContent='코드가 맞지 않습니다 — 앱의 코드를 다시 확인하세요 ('+e.message+')'; m.style.color='var(--critical,#d03b3b)'; inp.value=''; otpShake(inp); if(repaint) repaint(); inp.focus(); }
    }
    host.querySelector('#mfaEnGo').onclick=go; inp.onkeydown=function(e){ if(e.key==='Enter'){ e.preventDefault(); go(); } };
    setTimeout(function(){ inp.focus(); },60);
  }catch(e){
    host.innerHTML=tpl`<span style="color:var(--critical)">등록을 시작하지 못했습니다: ${e.message}</span> <span class="mini">— Supabase › Authentication › Multi-Factor 에서 TOTP 가 켜져 있어야 합니다</span> <button type="button" class="pill ghost" id="mfaRetry">다시</button>`;
    host.querySelector('#mfaRetry').onclick=function(){ if(opts.onDone) mfaEnrollFlow(null, host, opts); else mfaCardRender(host); };
  }
}
export async function mfaDisable(vf, host){
  if(!confirm('2단계 인증을 끕니다. 비밀번호만으로 로그인할 수 있게 됩니다. 계속할까요?')) return;
  host.innerHTML='<span class="mini">끄는 중…</span>';
  try{
    if(sessAal()!=='aal2'){ var ok=await mfaPrompt(vf[0], ST.SB_TOKEN, ST.AUTH_USER); if(!ok){ mfaCardRender(host); return; } }   // 해제엔 2단계 확인된 세션이 필요
    for(var i=0;i<vf.length;i++) await authApi('DELETE','factors/'+vf[i].id);
    logChange('mfa_off','auth',ST.AUTH_USER,{});
    toast('2단계 인증 꺼짐', '비밀번호만으로 로그인합니다', 'warn');
  }catch(e){ toast('끄지 못했습니다', String(e.message||e), 'warn'); }
  mfaCardRender(host);
}

/* ---- 자동 로그아웃(무활동 타임아웃) — 내 계정 › 설정, 이 브라우저에만 저장 ----
   · 마우스·키보드·스크롤이 IDLE_KEY 분 동안 없으면 세션을 지우고 로그인 화면으로 (0 = 끔, 기본)
   · 1분 전에 안내 토스트 · 다른 탭에 갔다 돌아오면 즉시 확인                          */

export var IDLE_KEY='svc_idle_min';   // ㊿+153: init.js 에서 옮김
export var IDLE_OPTS=[0,15,30,60,120,240,480];
export function idleMin(){ var v=0; try{ v=parseInt(localStorage.getItem(IDLE_KEY),10)||0; }catch(e){} return v>0? v:0; }
export function idleLabel(m){ return !m? '끄기 (로그인 유지)' : (m>=60? (m/60)+'시간' : m+'분'); }
export function idleTouch(){ ST.IDLE_LAST=Date.now(); ST.IDLE_WARNED=false; }

export function idleLogout(m){
  clearSess(); cacheDrop();
  try{ sessionStorage.setItem('svc_idle_msg', idleLabel(m)+' 동안 활동이 없어 자동 로그아웃되었습니다. 다시 로그인하세요.'); }catch(e){}
  ST.SB_TOKEN=null; ST.AUTH_USER=null; reloadHome();
}
export function idleCheck(){
  var m=idleMin(); if(!m || !ST.SB_TOKEN) return;
  var idle=Date.now()-ST.IDLE_LAST, lim=m*60000;
  if(idle>=lim){ idleLogout(m); return; }
  if(!ST.IDLE_WARNED && lim-idle<=60000){
    ST.IDLE_WARNED=true;
    toast('곧 자동 로그아웃', '1분 더 활동이 없으면 로그아웃됩니다 — 시간은 내 계정 › 설정에서 바꿀 수 있습니다', 'info');
  }
}


/* ---- 화면 디자인: 커맨드 센터(기본, cc) / 심플(simple) / 클래식(classic) — 이 브라우저에만 저장 ----
   · cc      : 아이콘 레일 + 커맨드 바 + 인박스 홈 + 장비 보드 + 고객 360 패널 (v5 CSS · html[data-look="cc"])
   · simple  : 평면 디자인, 기존 사이드바 (v4 CSS · html:not([data-look="classic"]))
   · classic : 이전 디자인 그대로                                                                 */
/* ㊿+166 «지니언스»(gn) = 새 기본 — 구조는 커맨드 센터 그대로(data-look="cc") + 정식 로고·브랜드 색·글자 메뉴(data-skin="gn")
   · isCC() 는 gn 에서도 참(인박스·히어로·고객 360 패널 등 커맨드 센터 기능을 그대로 씀) · gn 만 다른 곳은 isGN() */
export var LOOKS={gn:'지니언스 (기본)', cc:'커맨드 센터', simple:'심플', classic:'클래식 (이전 디자인)'};
export function curLook(){ var v=null; try{ v=localStorage.getItem('svc_look'); }catch(e){} return LOOKS[v]? v : 'gn'; }
export function isCC(){ return document.documentElement.getAttribute('data-look')==='cc'; }
export function isGN(){ return document.documentElement.getAttribute('data-skin')==='gn'; }
export function applyLook(){
  var v=curLook(), h=document.documentElement;
  if(v==='simple') h.removeAttribute('data-look');
  else h.setAttribute('data-look', v==='gn'? 'cc' : v);
  if(v==='gn') h.setAttribute('data-skin','gn'); else h.removeAttribute('data-skin');
}
export function setLook(v){
  if(!LOOKS[v]) v='gn';
  try{ if(v==='gn') localStorage.removeItem('svc_look'); else localStorage.setItem('svc_look',v); }catch(e){}
  applyLook();
  /* 레일·인박스 등 구조가 달라지므로 다시 읽는 편이 안전합니다 */
  setTimeout(function(){ location.reload(); }, 350);
}

/* 메뉴 글머리 이모지를 <span class="ic"> 로 감싸 심플 디자인에서는 숨길 수 있게 (textContent 는 그대로) */
export function wrapNavIcons(){
  var re; try{ re=new RegExp('^([\\p{Extended_Pictographic}\\u2600-\\u27BF][\\uFE0F\\u20E3]?(?:\\u200D\\p{Extended_Pictographic}\\uFE0F?)*)\\s+(\\S.*)$','u'); }catch(e){ return; }
  document.querySelectorAll('#side button').forEach(function(b){
    if(b.querySelector('.ic') || b.children.length) return;
    var m=(b.textContent||'').trim().match(re); if(!m) return;
    b.textContent='';
    var ic=document.createElement('span'); ic.className='ic'; ic.textContent=m[1];
    b.appendChild(ic); b.appendChild(document.createTextNode(' '+m[2]));
  });
}
export function navText(b){   // 메뉴 글자만 (심플 디자인에서는 이모지 제외)
  var t=(b.textContent||'').trim(), ic=b.querySelector('.ic');
  if(ic && document.documentElement.getAttribute('data-look')!=='classic') t=t.replace(ic.textContent,'').trim();
  return t;
}

/* ㊿+153: admin.js 에서 옮김 — 인바운드 등 여러 화면이 씀(관리자 화면은 처음 열 때만 불러오므로) */
/* DB의 UTC 시각 → 보는 사람 시간대(한국이면 KST)로 */
export function axTime(v){
  if(!v) return '·';
  var d=new Date(/[zZ]|[+\-]\d\d:?\d\d$/.test(String(v))? v : v+'Z');   // 시간대 없으면 UTC 로 간주
  if(isNaN(d.getTime())) return String(v).replace('T',' ').slice(0,16);
  var p=function(n){ return (n<10?'0':'')+n; };
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());
}

/* ===== HTML 만들기 — 특수문자 자동 처리 (㊿+155 «화면 만드는 방식 개선») =====
   · esc(값): 글자 안의 & < > " 를 HTML 이 아닌 글자로 (예전부터 쓰던 것 · ㊿+155 에 dash.js 에서 여기로)
   · tpl`…${값}…`: 화면 HTML 을 만드는 태그 템플릿 — ${} 안의 값은 «자동으로» esc 됨 → DB·사용자 글자를 빠뜨려도 안전
     이미 만든 HTML 조각(다른 tpl`` 결과 · 태그를 직접 쓴 문자열)을 넣을 때만 rawHtml(…) 로 «이건 HTML» 이라고 밝힘
     예: tpl`<td title="${r.note}">${r.cust}</td>` · tpl`<ul>${rawHtml(rows.map(rowHtml).join(''))}</ul>`
   · 규칙(tests/lint.mjs): HTML 을 '+' 로 이어 붙이지 않고 tpl`` 로 · rawHtml(…) 은 개수를 세어 알려 줌(늘면 «HTML 이 맞는지» 확인)
   · 이름이 짧지 않은 이유: 이 포탈 코드에 h · html · raw 라는 지역 변수가 많아서 겹치지 않는 이름으로 */
/** @param {any} s @returns {string} */
export function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
/** rawHtml() 이 돌려주는 «이미 HTML» 표시 */
function RawHtml(s){ this.html=s; this.toString=rawHtmlStr; }   /* ㊿+156 toString: '+' 로 이어도 HTML 그대로(예: closeBtn() 을 글자에 붙일 때) */
function rawHtmlStr(){ return this.html; }
/** HTML 조각을 tpl`` 안에 그대로 넣을 때 — 값은 글자로 바꿔 그대로(예전 '+' 이어 붙이기와 같음) @param {any} s @returns {RawHtml} */
export function rawHtml(s){ return new RawHtml(String(s)); }
/* ㊿+156 펼친 목록·결과·미리보기를 닫는 버튼 — 모양 하나(«✕ 닫기» · 줄 오른쪽 끝 .x-close) · data = {속성이름: 값}(값은 esc) · text 를 주면 글자만 바꿈(예: «✕ 모두 빼기») · tpl 안에 ${closeBtn(…)} 로 */
export function closeBtn(data, title, text){ var a=''; Object.keys(data||{}).forEach(function(k){ a+=' '+k+'="'+esc(data[k])+'"'; }); return rawHtml(tpl`<button type="button" class="cbtn x-close" title="${title||'닫기'}" aria-label="${title||'닫기'}"${rawHtml(a)}>${text||'✕ 닫기'}</button>`); }
/** 화면 HTML 태그 템플릿 — ${값} 은 esc, rawHtml(…) 은 그대로 @param {TemplateStringsArray} strs @param {...any} vals @returns {string} */
export function tpl(strs, ...vals){
  var out=strs[0];
  for(var i=0;i<vals.length;i++){ var v=vals[i]; out+=(v instanceof RawHtml? v.html : esc(v))+strs[i+1]; }
  return out;
}
