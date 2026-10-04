/* ===== core.js — 공통 유틸 · 데이터 로드 · Supabase · PWA · 메뉴 권한 · 세션 · 2단계 인증 · 자동 로그아웃 · 화면 디자인 =====
   포탈 본체(js/app.js)를 ④ 아키텍처 2단계(㊿+136)에서 기능별로 나눈 파일. 전역 var/function 그대로 — 즉시 실행 문장은 전부 js/init.js 에.
   로드 순서는 index.html <meta name="app-js"> (js/load.js 가 그 순서대로 ?v=APP_VER 를 붙여 불러옴) */
/* ==================================================================
   0. 공통 유틸
   ================================================================== */
var DATA = null;          // 서버에서 받은 원본
var M = 0;                // 월 개수
var MAT = [];             // rows[i] 의 월별 dense 배열
var CH = {};              // Chart 인스턴스
var HIDDEN = {};          // 라인 legend 토글
var STATE = { lines:{}, base:0, unit:'month', ind:'', partner:'', status:'', search:'', trendR:24, expM:3, sortAll:{k:'mrr',d:-1} };

function $(s){ return document.querySelector(s); }
function $$(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); }
function cssv(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function el(t,c,x){ var e=document.createElement(t); if(c)e.className=c; if(x!=null)e.textContent=x; return e; }

/* 포탈 전체 금액 표시 단위 = 천원 (원 단위 이하는 표시하지 않음)
   · won(v)     → 천원 숫자만 (예: 150,000)  — 호출부에서 '천원' 을 붙입니다
   · wonFull(v) → 천원 + 단위 (예: 150,000천원)
   · 가격표·견적서의 단가는 원 단위 유지 (prWon 사용) */
function won(v){ return Math.round(Number(v||0)/1000).toLocaleString('ko-KR'); }
function wonFull(v){ return Math.round(Number(v||0)/1000).toLocaleString('ko-KR')+'천원'; }
function pct(v){ return (v>0?'+':'')+v.toFixed(1)+'%'; }
function mk(i){ return DATA.monthKeys[i]||mkFuture(i); }
// 데이터 범위를 넘어선 미래 월 라벨 (전망에서 사용)
function mkFuture(i){
  if(i==null||i<0) return '';
  var t=(2020*12+5)+i;
  return Math.floor(t/12)+'-'+('0'+((t%12)+1)).slice(-2);
}
var LINE_LABEL={Cloud:'Cloud NAC', S1:'S1 Cloud NAC', MDR:'MDR', MDR_S1:'S1 MDR', PNS:'PNS', DRM:'DRM', DLP:'DLP',
  'Cloud NAC':'Cloud NAC', 'SSL PNS':'PNS'};
function lline(l){ return LINE_LABEL[l]||l; }
/* 서비스 + 버전 — Cloud NAC 은 5.0 / 6.0 (ZTNA) 이 함께 팔리므로 계약 표에서는 버전을 붙여 보여줍니다 (contracts.version: V5.0 / V6.0 / ZTNA) */
var VER_OPTS=['V6.0','V5.0','ZTNA'];
function verShort(v){ v=String(v||'').trim(); if(!v) return ''; if(/^ztna$/i.test(v)) return 'ZTNA'; var m=v.match(/(\d+(?:\.\d+)?)/); return m? m[1] : v; }
function llineVer(l, ver){ var base=lline(l), vs=verShort(ver); if(!vs) return base; if(l==='Cloud'||l==='S1'||l==='Cloud NAC') return vs==='ZTNA'? base.replace('NAC','ZTNA') : base+' '+vs; return base; }
// LIVE 시트 원문 표기 → 표준 코드
var LIVE2CODE={'Cloud NAC':'Cloud','S1':'S1','MDR':'MDR','SSL PNS':'PNS','PNS':'PNS','DRM':'DRM','DLP':'DLP','MDR_S1':'MDR_S1','Cloud':'Cloud'};
function qOfIdx(i){ return Math.ceil(monOf(i)/3); }
function baseRange(){ // 현재 단위 기준 [시작, 끝] 월 인덱스 (끝 = STATE.base)
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
function baseLabel(){
  var b=STATE.base;
  if(STATE.unit==='quarter') return yOf(b)+'년 '+qOfIdx(b)+'분기';
  if(STATE.unit==='year') return yOf(b)+'년';
  return mk(b);
}
function buildBaseSelect(){
  var sel=$('#fBase'); sel.innerHTML='';
  var i,o;
  if(STATE.unit==='month'){
    for(i=M-1;i>=0;i--){ o=el('option',null,mk(i)); o.value=i; sel.appendChild(o); }
    sel.value=STATE.base;
  }else if(STATE.unit==='quarter'){
    var seen={};
    for(i=M-1;i>=0;i--){
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
    for(i=M-1;i>=0;i--){
      var y=yOf(i);
      if(seenY[y]!=null) continue;
      seenY[y]=i; // 그 해의 마지막(데이터 내) 월
      o=el('option',null,y+'년'); o.value=i; sel.appendChild(o);
    }
    if(seenY[yOf(STATE.base)]!=null) STATE.base=seenY[yOf(STATE.base)];
    sel.value=STATE.base;
  }
}
function mkLabel(i){ var k=mk(i); return k? k.slice(2).replace('-','.') : ''; }
function yOf(i){ return +mk(i).slice(0,4); }
function monOf(i){ return +mk(i).slice(5,7); }
function seriesColor(n){ return cssv('--s'+((n-1)%8+1)); }

/* ==================================================================
   1. 데이터 로드
   ================================================================== */
/* ---- 에스원 정산(s1.html) → 프로젝트 리포트 화면 열기 ---- */


/* ---------- Supabase ---------- */
/* APP_VER 는 index.html <head> 의 인라인 스크립트에서 정의됩니다 (④ 아키텍처 · ㊿+134 — app.css/js 의 ?v= 캐시 무효화와 배포·운영 버전 비교가 그 값을 씀) */
var SB_URL='https://amzbrdhkvzsyxjfjtugu.supabase.co';
var SB_KEY='sb_publishable_s_BGJf84vUQoASbT8F0H4g_L2MBOGZF';
var SB_TOKEN=null;   // 로그인하면 access_token 저장 (쓰기용)

/* ---- PWA (홈 화면 앱) — 서비스 워커 등록 · 설치 안내 ---- */
/* ── 스테이징 띠 · 브라우저 오류 수집 (㊿+129) ──
   · …/staging/index.html 로 열리면 IS_STAGING — 상단에 노란 띠(운영 데이터를 쓰는 시험용 포탈임을 표시), 배포·운영의 기본 대상도 스테이징
   · 화면에서 난 JS 오류(error · unhandledrejection)는 client_errors 표(SQL 86)에 기록 → 관리자 › 배포·운영 › 기록 탭. 같은 메시지는 세션당 1번, 최대 8건 */


var ERRLOG={n:0, seen:{}, max:8};
function logClientError(msg, src, line, col, stack){
  try{
    if(!window.SB_TOKEN || !window.AUTH_USER) return;
    var key=String(msg||'').slice(0,120); if(!key || /ResizeObserver loop|Script error\.?$/.test(key)) return;
    if(ERRLOG.seen[key]){ ERRLOG.seen[key]++; return; } ERRLOG.seen[key]=1;
    if(++ERRLOG.n>ERRLOG.max) return;
    fetch(SB_URL+'/rest/v1/client_errors', {method:'POST', headers:{'Content-Type':'application/json', apikey:SB_KEY, Authorization:'Bearer '+SB_TOKEN, Prefer:'return=minimal'},
      body:JSON.stringify({email:AUTH_USER, ver:APP_VER, view:window.CUR_VIEW||'', msg:key.slice(0,500), url:String(src||location.href).slice(0,300), line:line||null, col:col||null, stack:String(stack||'').slice(0,2000), ua:navigator.userAgent.slice(0,200), staging:IS_STAGING})}).catch(function(){});
  }catch(e){}
}


var PWA={deferred:null};
function pwaStandalone(){ try{ return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone===true; }catch(e){ return false; } }
function pwaIsIOS(){ return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1); }


function pwaInstall(){ if(!PWA.deferred) return false; var ev=PWA.deferred; ev.prompt(); ev.userChoice.then(function(){ PWA.deferred=null; pwaHintSync(); }); return true; }
/* 설치 안내 카드 내용 (내 계정 › 설정) */
function pwaHintHtml(){
  if(pwaStandalone()) return '<span style="color:var(--brand);font-weight:650">지금 앱으로 실행 중입니다 ✓</span><div class="mini" style="margin-top:5px;line-height:1.6">홈 화면 아이콘으로 열린 상태입니다. 새 버전은 다음 실행 때 자동으로 반영됩니다.</div>';
  if(PWA.deferred) return '<button type="button" class="pill pri" id="accPwaGo">📱 홈 화면에 설치</button><div class="mini" style="margin-top:5px;line-height:1.6">설치하면 주소창 없이 전체 화면 앱처럼 열립니다. 스토어 등록·다운로드 없음, 새 버전은 자동 반영.</div>';
  if(pwaIsIOS()) return '<div style="font-size:13.5px;line-height:1.7">Safari 하단 <b>공유</b> 버튼 <span style="display:inline-block;border:1px solid var(--ring);border-radius:5px;padding:0 5px;font-size:11px">⎋</span> → <b>«홈 화면에 추가»</b> → 추가</div><div class="mini" style="margin-top:5px;line-height:1.6">아이폰·아이패드는 Safari 에서만 설치됩니다(Chrome 앱에서는 안 됨). 설치 후 홈 화면의 «SVC 포탈» 아이콘으로 열면 전체 화면 앱처럼 동작합니다.</div>';
  return '<div style="font-size:13.5px;line-height:1.7">Chrome 주소창 오른쪽의 <b>설치</b> 아이콘, 또는 메뉴(⋮) › <b>«앱 설치»</b> / «홈 화면에 추가»</div><div class="mini" style="margin-top:5px;line-height:1.6">안드로이드·PC Chrome·Edge 에서 됩니다. 설치하면 주소창 없이 전체 화면으로 열리고 새 버전은 자동 반영됩니다.</div>';
}
function pwaHintSync(){ var h=document.getElementById('accPwa'); if(!h) return; h.innerHTML=pwaHintHtml(); var b=document.getElementById('accPwaGo'); if(b) b.onclick=function(){ pwaInstall(); }; }

/* ---- 계정별 메뉴 권한 (user_perms · SQL 79) — 슈퍼 관리자가 관리자 › 메뉴 권한에서 지정 ----
   보기(v): 메뉴 표시·화면 열기 · 읽기(r): 화면 안 데이터 열람 · 쓰기(w): 추가·수정·삭제.
   행이 없는 메뉴는 역할 기본(admin 전부 · admin_viewer 보기+읽기). super_admin 은 항상 전부. 홈·내 계정은 항상 보임. */
var PERMS=null;                                   // {view:{v,r,w}} · null = 지정 없음
var PERM_EXEMPT={dash:1, account:1, adminx:1, log:1, csite:1, ops:1};   // 역할로만 다루는 화면
async function loadPerms(){
  if(!SB_TOKEN || !AUTH_USER){ PERMS=null; return null; }
  try{
    var rows=await sbTry('user_perms?select=view,can_view,can_read,can_write&email=eq.'+encodeURIComponent(String(AUTH_USER).toLowerCase()));
    var m=null; (rows||[]).forEach(function(r){ m=m||{}; m[r.view]={v:r.can_view!==false, r:r.can_read!==false, w:!!r.can_write}; });
    PERMS=m; try{ sessionStorage.setItem('svc_perms', JSON.stringify(m)); }catch(e){}
    return m;
  }catch(e){ PERMS=null; return null; }
}
function permOf(v){
  var roleW=!window.IS_VIEWER_ROLE;
  if(window.IS_SUPER || PERM_EXEMPT[v] || !v) return {v:true, r:true, w:roleW};
  var p=PERMS && PERMS[v];
  if(!p) return {v:true, r:true, w:roleW};
  return {v:!!p.v, r:!!(p.v&&p.r), w:!!(p.v&&p.r&&p.w&&roleW)};
}
function canView(v){ return permOf(v).v; }
function canRead(v){ return permOf(v).r; }
function canWrite(v){ return permOf(v).w; }
/* 메뉴에 반영 — 보기 없는 버튼 숨김, 버튼이 하나도 안 남은 그룹은 그룹도 숨김 */
function applyPerms(){
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
  try{ var be=$('#btnEdit'); if(be && SB_TOKEN) be.style.display=(window.IS_VIEWER_ROLE || !canWrite('contracts'))? 'none':''; }catch(e){}
}
/* 화면을 열 때 — 현재 화면의 쓰기 권한을 IS_VIEWER 에 반영(기존 조회 전용 로직을 그대로 재사용) · 읽기 없으면 안내로 덮음 */
function permEnter(v){
  window.IS_VIEWER = !!window.IS_VIEWER_ROLE || !canWrite(v);
  var app=document.getElementById('app'); if(app) app.classList.toggle('perm-deny', !canRead(v));
}
/* 쓰기 호출 공통 관문 — 현재 화면에 쓰기 권한이 없으면 저장 자체를 막음 (변경 이력·읽기용 RPC 는 예외) */
function permWriteGuard(method, path){
  if(!/^(POST|PATCH|PUT|DELETE)$/i.test(method)) return;
  if(/^change_log\b|^ai_chat_history\b|^ai_feedback\b|^ai_check_log\b|^rpc\/(load_|admin_|ai_)|^user_perms\b|^ai_billing\b|^recv_presets\b/.test(path)) return;   // 이력·개인 기록·관리자 RPC 는 화면 권한과 무관
  if(window.IS_SUPER) return;
  if(!canWrite(CUR_VIEW)){ var b=document.querySelector('#side button[data-v="'+CUR_VIEW+'"]'); var nm=b? navText(b) : CUR_VIEW; throw new Error('쓰기 권한이 없습니다 — 「'+nm+'」 화면은 읽기만 허용돼 있습니다. 슈퍼 관리자에게 «쓰기» 권한을 요청하세요.'); }
}

/* ---- 로그인 세션 유지 ----
   sessionStorage 에 두면 홈 화면 앱(PWA)은 닫을 때마다 로그아웃됩니다.
   «로그인 유지»(svc_keep · 앱/모바일에서는 기본 켬)면 localStorage 에도 복사해 두고, 시작할 때 sessionStorage 로 되살립니다
   (위성 페이지 quote/report/s1/kk 는 sessionStorage 를 읽으므로 그대로 동작). 자동 로그아웃 설정은 그대로 적용됩니다. */
var SESS_KEY='svc_sess';
function keepLogin(){ try{ var v=localStorage.getItem('svc_keep'); if(v!==null) return v==='1'; }catch(e){} return pwaStandalone() || (window.matchMedia && window.matchMedia('(max-width:760px)').matches); }
function sessRead(){
  var s=null; try{ s=JSON.parse(sessionStorage.getItem(SESS_KEY)||'null'); }catch(e){}
  if(!s){ try{ s=JSON.parse(localStorage.getItem(SESS_KEY)||'null'); if(s) sessionStorage.setItem(SESS_KEY, JSON.stringify(s)); }catch(e){} }
  return s;
}
function sessWrite(o){
  var j=JSON.stringify(o);
  try{ sessionStorage.setItem(SESS_KEY, j); }catch(e){}
  try{ if(keepLogin()) localStorage.setItem(SESS_KEY, j); else localStorage.removeItem(SESS_KEY); }catch(e){}
}
function saveSess(j,email,pOverride){
  sessWrite({
    a:j.access_token, r:j.refresh_token||null,
    e:Math.floor(Date.now()/1000)+(j.expires_in||3600), u:email,
    p:(pOverride!==undefined)? pOverride : !!(j.user&&j.user.user_metadata&&j.user.user_metadata.pw_changed)
  });
}
function clearSess(){ try{ sessionStorage.removeItem(SESS_KEY); }catch(e){} try{ localStorage.removeItem(SESS_KEY); }catch(e){} }
async function restoreSess(){
  var s=sessRead();
  if(!s || !s.a || s.p===false) return false;      // 비밀번호 미변경 계정은 다시 로그인
  if(Math.floor(Date.now()/1000) < (s.e||0)-120){ SB_TOKEN=s.a; AUTH_USER=s.u; }
  else {
    if(!s.r){ clearSess(); return false; }
    try{
      var r=await fetch(SB_URL+'/auth/v1/token?grant_type=refresh_token',{
        method:'POST', headers:{apikey:SB_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({refresh_token:s.r})});
      var j=await r.json();
      if(!r.ok||!j.access_token){ clearSess(); return false; }
      SB_TOKEN=j.access_token; AUTH_USER=s.u; saveSess(j,s.u,true);
    }catch(e){ clearSess(); return false; }
  }
  // 인증 앱이 등록된 계정인데 저장된 세션이 aal1(코드 미확인)이면 코드부터 — 취소하면 로그인 화면으로
  if(sessAal(SB_TOKEN)==='aal1' && !(await mfaGate(SB_TOKEN, AUTH_USER))){ clearSess(); SB_TOKEN=null; AUTH_USER=null; return false; }
  return true;
}
/* ---- 토큰 자동 연장: 화면을 계속 켜둬도 로그인이 안 끊기게 ---- */
async function refreshToken(){
  var s=sessRead();
  if(!s || !s.r) return false;
  try{
    var r=await fetch(SB_URL+'/auth/v1/token?grant_type=refresh_token',{
      method:'POST', headers:{apikey:SB_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({refresh_token:s.r})});
    var j=await r.json();
    if(!r.ok || !j.access_token) return false;
    SB_TOKEN=j.access_token; saveSess(j, s.u, true);
    return true;
  }catch(e){ return false; }
}


function doLogout(){
  if(!confirm('로그아웃할까요?')) return;
  clearSess(); try{ sessionStorage.removeItem(CACHE_KEY); }catch(e){}
  SB_TOKEN=null; AUTH_USER=null; location.reload();
}

/* ---- 2단계 인증 (MFA · 인증 앱 TOTP) — Supabase Auth factors API (80점 프로젝트 ② 보안 · SQL 88) ----
   · 선택 적용: 내 계정 › 보안에서 본인이 켬. 켠 계정은 로그인 뒤 6자리 코드를 넣어야 aal2 세션을 받고,
     SQL 88 의 restrictive 정책(mfa_ok)이 aal1 토큰의 데이터 접근을 DB 단에서 막음(등록하지 않은 계정은 영향 없음).
   · 저장된 세션(로그인 유지)이 aal1 인데 인증 앱이 등록돼 있으면 시작할 때 코드를 요구(restoreSess).
   · 복구: 폰을 잃어버리면 슈퍼 관리자가 배포·운영 › SQL 에서 auth.mfa_factors 행을 지움(SQL 88 끝 주석). */
function b64urlJson(p){ p=String(p||'').replace(/-/g,'+').replace(/_/g,'/'); while(p.length%4) p+='='; var bin=atob(p), u=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return JSON.parse(new TextDecoder().decode(u)); }
function sessAal(tok){ try{ return b64urlJson(String(tok||SB_TOKEN||'').split('.')[1]).aal||'aal1'; }catch(e){ return 'aal1'; } }
function authHdr(tok){ return {apikey:SB_KEY, 'Content-Type':'application/json', Authorization:'Bearer '+(tok||SB_TOKEN)}; }
async function authApi(method, path, body, tok){
  var r=await fetch(SB_URL+'/auth/v1/'+path, {method:method, headers:authHdr(tok), body:body? JSON.stringify(body) : undefined});
  var j=null; try{ j=await r.json(); }catch(e){ j={}; }
  if(!r.ok){ var e2=new Error((j&&(j.msg||j.error_description||j.message||j.error))||('인증 서버 오류 '+r.status)); e2.status=r.status; throw e2; }
  return j||{};
}
async function mfaFactors(tok){ var u=await authApi('GET','user',null,tok); return (u.factors||[]).filter(function(f){ return f.factor_type==='totp'; }); }
function mfaVerifiedOf(fs){ return (fs||[]).filter(function(f){ return f.status==='verified' && f.factor_type==='totp'; }); }
/* 로그인(또는 저장된 세션) 뒤 관문: 인증 앱이 등록돼 있고 토큰이 aal1 이면 코드를 받아 aal2 세션으로 교체. true=계속 · false=중단 */
var MFA_ST=null;   // 본인 정책(rpc mfa_status · SQL 89) — {required, deadline, today, enrolled, aal}
async function mfaPolicy(tok){
  try{ var r=await fetch(SB_URL+'/rest/v1/rpc/mfa_status',{method:'POST', headers:authHdr(tok), body:'{}'}); if(!r.ok) return null; return await r.json(); }catch(e){ return null; }
}
function mfaDue(st){ return !!(st && st.required && !st.enrolled && (!st.deadline || (st.today||new Date().toISOString().slice(0,10))>=st.deadline)); }
function mfaDaysLeft(st){ if(!st||!st.deadline) return 0; var a=new Date(st.deadline+'T00:00:00'), b=new Date((st.today||new Date().toISOString().slice(0,10))+'T00:00:00'); return Math.round((a-b)/86400000); }
async function mfaGate(tok, email, factorsHint){
  if(sessAal(tok)==='aal2') return true;
  var fs; try{ fs=mfaVerifiedOf(factorsHint||await mfaFactors(tok)); }catch(e){ return true; }   // 조회 실패 → 통과 (DB 쪽 SQL 88 이 2차 방어)
  if(fs.length) return mfaPrompt(fs[0], tok, email);
  // 등록된 인증 앱이 없음 → 관리자가 이 계정을 필수로 지정했는지 (SQL 89 · 함수가 없으면 null = 선택 적용)
  var st=await mfaPolicy(tok); MFA_ST=st;
  if(st && st.required){
    if(mfaDue(st)) return mfaForceEnroll(tok, email, st);      // 기한 없음/지남 → 등록해야 들어감 (DB 도 mfa_ok 가 false 라 데이터 없음)
    MFA_WARN=st;                                                // 유예 기간 → 들어가되 안내
  }
  return true;
}
var MFA_WARN=null;
function mfaWarnIfNeeded(){
  var st=MFA_WARN; if(!st) return; MFA_WARN=null;
  var d=mfaDaysLeft(st);
  toast('2단계 인증 등록이 필요합니다', '관리자 지정 — '+st.deadline+' 까지('+(d>0? d+'일 남음':'오늘')+') 내 계정 › 보안에서 켜 주세요. 지나면 등록 전까지 포탈을 쓸 수 없습니다.', 'warn');
}
/* 필수 지정 + 기한 지남: 등록 창을 띄우고 끝나야 들어감 (취소 = 로그아웃) */
function mfaForceEnroll(tok, email, st){
  return new Promise(function(resolve){
    var old=document.getElementById('ovlMfa'); if(old) old.remove();
    var ov=document.createElement('div'); ov.id='ovlMfa'; ov.className='ovl on'; ov.style.cssText='z-index:100000;align-items:center';
    ov.innerHTML='<div class="modal" style="width:min(560px,100%);padding:22px" role="dialog" aria-modal="true" aria-labelledby="mfaTitle">'+
      '<h3 id="mfaTitle" style="margin:0 0 6px;font-size:18px">🔐 2단계 인증 등록이 필요합니다</h3>'+
      '<p class="cap" style="margin:0 0 14px">관리자가 <b>'+esc(email||'')+'</b> 계정에 2단계 인증을 필수로 지정했습니다'+(st&&st.deadline? ' (기한 '+esc(st.deadline)+' 지남)':'')+'. 인증 앱을 등록해야 포탈을 쓸 수 있습니다 — 1분이면 끝납니다.</p>'+
      '<div id="mfaForceHost"></div>'+
      '<div style="margin-top:12px;display:flex;justify-content:flex-end"><button type="button" class="pill ghost" id="mfaForceCancel">나중에 (로그아웃)</button></div></div>';
    document.body.appendChild(ov);
    ov.querySelector('#mfaForceCancel').onclick=function(){ ov.remove(); resolve(false); };
    mfaEnrollFlow([], ov.querySelector('#mfaForceHost'), {tok:tok, email:email, onDone:function(ok){ if(ok){ ov.remove(); resolve(true); } }});
  });
}
function mfaApplySession(s, email){
  SB_TOKEN=s.access_token; if(email) AUTH_USER=email;
  var s0=sessRead(); saveSess(s, AUTH_USER, (s0&&s0.p!==undefined)? s0.p : undefined);
}
/* 코드 입력 창 — 로그인 화면·로딩 화면 위에도 떠야 하므로 z-index 를 크게. 취소 = 로그인 중단 */
function mfaPrompt(factor, tok, email){
  return new Promise(function(resolve){
    var old=document.getElementById('ovlMfa'); if(old) old.remove();
    var ov=document.createElement('div'); ov.id='ovlMfa'; ov.className='ovl on'; ov.style.cssText='z-index:100000;align-items:center';
    ov.innerHTML='<div class="modal" style="width:min(400px,100%);padding:22px" role="dialog" aria-modal="true" aria-labelledby="mfaTitle">'+
      '<h3 id="mfaTitle" style="margin:0 0 6px;font-size:18px">🔐 2단계 인증</h3>'+
      '<p class="cap" style="margin:0 0 14px">'+esc(email||AUTH_USER||'')+' 계정은 인증 앱이 등록돼 있습니다. 앱(Google Authenticator · Microsoft Authenticator 등)에 표시된 <b>6자리 코드</b>를 입력하세요.</p>'+
      '<input id="mfaCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" aria-label="인증 코드 6자리" style="width:100%;height:52px;font-size:26px;letter-spacing:.35em;text-align:center;border-radius:10px;border:1px solid var(--ring);background:var(--surface-2)">'+
      '<div class="mmsg" id="mfaMsg" style="min-height:18px;margin-top:8px"></div>'+
      '<div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end"><button type="button" class="pill ghost" id="mfaCancel">취소</button><button type="button" class="pill" id="mfaGo">확인</button></div></div>';
    document.body.appendChild(ov);
    var inp=ov.querySelector('#mfaCode'), msgEl=ov.querySelector('#mfaMsg'), go=ov.querySelector('#mfaGo'), ch=null, busy=false, fails=0;
    function say(t,bad){ msgEl.textContent=t||''; msgEl.style.color=bad? 'var(--critical,#d03b3b)':'var(--muted)'; }
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
        inp.value=''; inp.focus();
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
async function mfaCardRender(host){
  if(!host) return; host.innerHTML='<span class="mini">확인 중…</span>';
  var fs; try{ fs=await mfaFactors(); }catch(e){ host.innerHTML='<span class="mini" style="color:var(--critical)">상태를 읽지 못했습니다: '+esc(e.message)+'</span>'; return; }
  var vf=mfaVerifiedOf(fs), aal=sessAal();
  var pol=await mfaPolicy(); MFA_ST=pol||MFA_ST;
  var polHtml=(pol&&pol.required)? '<div class="mini" style="margin:0 0 6px;color:var(--s3,#b26a00)">관리자 지정: <b>필수</b>'+(pol.deadline? ' · 기한 '+esc(pol.deadline)+(!pol.enrolled? ' ('+(mfaDaysLeft(pol)>0? mfaDaysLeft(pol)+'일 남음':'지남')+')':''):'')+'</div>' : '';
  if(vf.length){
    host.innerHTML=polHtml+'<div><b style="color:var(--brand)">켜짐</b> <span class="mini">· '+esc(vf[0].friendly_name||'인증 앱')+' · 등록 '+esc(String(vf[0].created_at||'').slice(0,10))+' · 이 세션 '+(aal==='aal2'? '2단계 확인됨' : '<span style="color:var(--critical)">코드 미확인</span>')+'</span></div>'+
      '<div class="mini" style="margin:5px 0 8px;line-height:1.6">로그인할 때마다 인증 앱의 6자리 코드가 필요합니다. 인증 앱을 바꾸려면 끄고 다시 켜세요(코드 필요). 폰을 잃어버렸으면 슈퍼 관리자에게 해제를 요청하세요.</div>'+
      '<button type="button" class="pill ghost" id="mfaOff" style="border-color:var(--critical,#d03b3b);color:var(--critical,#d03b3b)">2단계 인증 끄기</button>';
    host.querySelector('#mfaOff').onclick=function(){ mfaDisable(vf, host); };
  } else {
    host.innerHTML=polHtml+'<div><b>꺼짐</b> <span class="mini">· 비밀번호만으로 로그인</span></div>'+
      '<div class="mini" style="margin:5px 0 8px;line-height:1.6">인증 앱(Google Authenticator · Microsoft Authenticator · 1Password 등)을 등록하면 비밀번호가 새어도 코드 없이는 들어올 수 없습니다. 이 계정에만 적용되며 다른 사용자는 영향이 없습니다.</div>'+
      '<button type="button" class="pill" id="mfaOn">🔐 2단계 인증 켜기</button>';
    host.querySelector('#mfaOn').onclick=function(){ mfaEnrollFlow(fs, host); };
  }
}
/* GoTrue 의 qr_code 는 SVG 원문(«<?xml …?><svg …», data: 접두 없음 — 문서: «data:image/svg+xml;utf-8, 를 앞에 붙이라») — 그대로 src 에 넣으면 깨지므로 percent-encoding 한 data URL 로 정규화 (㊿+131 수정) */
function mfaQrSrc(q){
  q=String(q||'').trim(); if(!q) return '';
  var svg=null, m=/^data:image\/svg\+xml(;[^,]*)?,([\s\S]*)$/i.exec(q);
  if(m){ if(/base64/i.test(m[1]||'')) return q; svg=m[2]; try{ svg=decodeURIComponent(svg); }catch(e){} }
  else if(/^data:/i.test(q)) return q;                 // PNG 등 다른 data URL 은 그대로
  else if(/<svg[\s>]/i.test(q)) svg=q;                 // GoTrue 실제 응답: «<?xml version="1.0"?><svg …» 원문 (data: 접두 없음)
  if(svg===null) return q;
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
async function mfaEnrollFlow(existing, host, opts){
  opts=opts||{}; var tok=opts.tok||null, who=opts.email||AUTH_USER;
  var back=function(ok){ if(opts.onDone) opts.onDone(ok); else mfaCardRender(host); };
  host.innerHTML='<span class="mini">등록 준비 중…</span>';
  try{
    if(!existing){ try{ existing=await mfaFactors(tok); }catch(e){ existing=[]; } }
    for(var i=0;i<(existing||[]).length;i++) if(existing[i].status!=='verified'){ try{ await authApi('DELETE','factors/'+existing[i].id,null,tok); }catch(e){} }   // 끝내지 않은 등록은 지우고 새로
    var name='SVC 포탈 '+new Date().toISOString().slice(0,10);
    var f=await authApi('POST','factors',{factor_type:'totp', friendly_name:name, issuer:'SVC 포탈'},tok);
    var totp=f.totp||{};
    host.innerHTML='<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">'+
      (totp.qr_code? '<img src="'+esc(mfaQrSrc(totp.qr_code))+'" alt="인증 앱 등록 QR" style="width:168px;height:168px;background:#fff;border:1px solid var(--ring);border-radius:8px;padding:6px;flex:none">':'')+
      '<div style="flex:1;min-width:220px"><ol class="mini" style="margin:0 0 8px 16px;padding:0;line-height:1.8"><li>인증 앱에서 «계정 추가 → QR 스캔»</li><li>스캔이 안 되면 키를 직접 입력: <code style="user-select:all;word-break:break-all">'+esc(totp.secret||'')+'</code></li><li>앱에 뜬 6자리 코드를 아래에 입력</li></ol>'+
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input id="mfaEnCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" aria-label="인증 코드" style="width:140px;height:40px;font-size:22px;letter-spacing:.3em;text-align:center"><button type="button" class="pill" id="mfaEnGo">확인하고 켜기</button><button type="button" class="pill ghost" id="mfaEnCancel">취소</button></div>'+
      '<div class="mmsg" id="mfaEnMsg" style="min-height:18px;margin-top:6px"></div></div></div>';
    var inp=host.querySelector('#mfaEnCode'), m=host.querySelector('#mfaEnMsg');
    host.querySelector('#mfaEnCancel').onclick=async function(){ try{ await authApi('DELETE','factors/'+f.id,null,tok); }catch(e){} back(false); };
    if(opts.onDone) host.querySelector('#mfaEnCancel').style.display='none';   // 강제 등록 창은 바깥의 «나중에(로그아웃)» 만
    async function go(){
      var code=(inp.value||'').replace(/\D/g,''); if(code.length!==6){ m.textContent='6자리 숫자를 입력하세요'; return; }
      m.textContent='확인 중…';
      try{
        var ch=await authApi('POST','factors/'+f.id+'/challenge',{},tok);
        var s=await authApi('POST','factors/'+f.id+'/verify',{challenge_id:ch.id, code:code},tok);
        mfaApplySession(s, who);
        logChange('mfa_on','auth',who,{factor:name, forced:!!opts.onDone});
        toast('2단계 인증 켜짐', '다음 로그인부터 인증 앱 코드가 필요합니다', 'ok');
        back(true);
      }catch(e){ m.textContent='코드가 맞지 않습니다 — 앱의 코드를 다시 확인하세요 ('+e.message+')'; inp.value=''; inp.focus(); }
    }
    host.querySelector('#mfaEnGo').onclick=go; inp.onkeydown=function(e){ if(e.key==='Enter'){ e.preventDefault(); go(); } };
    setTimeout(function(){ inp.focus(); },60);
  }catch(e){
    host.innerHTML='<span style="color:var(--critical)">등록을 시작하지 못했습니다: '+esc(e.message)+'</span> <span class="mini">— Supabase › Authentication › Multi-Factor 에서 TOTP 가 켜져 있어야 합니다</span> <button type="button" class="pill ghost" id="mfaRetry">다시</button>';
    host.querySelector('#mfaRetry').onclick=function(){ if(opts.onDone) mfaEnrollFlow(null, host, opts); else mfaCardRender(host); };
  }
}
async function mfaDisable(vf, host){
  if(!confirm('2단계 인증을 끕니다. 비밀번호만으로 로그인할 수 있게 됩니다. 계속할까요?')) return;
  host.innerHTML='<span class="mini">끄는 중…</span>';
  try{
    if(sessAal()!=='aal2'){ var ok=await mfaPrompt(vf[0], SB_TOKEN, AUTH_USER); if(!ok){ mfaCardRender(host); return; } }   // 해제엔 2단계 확인된 세션이 필요
    for(var i=0;i<vf.length;i++) await authApi('DELETE','factors/'+vf[i].id);
    logChange('mfa_off','auth',AUTH_USER,{});
    toast('2단계 인증 꺼짐', '비밀번호만으로 로그인합니다', 'warn');
  }catch(e){ toast('끄지 못했습니다', String(e.message||e), 'warn'); }
  mfaCardRender(host);
}

/* ---- 자동 로그아웃(무활동 타임아웃) — 내 계정 › 설정, 이 브라우저에만 저장 ----
   · 마우스·키보드·스크롤이 IDLE_KEY 분 동안 없으면 세션을 지우고 로그인 화면으로 (0 = 끔, 기본)
   · 1분 전에 안내 토스트 · 다른 탭에 갔다 돌아오면 즉시 확인                          */

var IDLE_OPTS=[0,15,30,60,120,240,480];
function idleMin(){ var v=0; try{ v=parseInt(localStorage.getItem(IDLE_KEY),10)||0; }catch(e){} return v>0? v:0; }
function idleLabel(m){ return !m? '끄기 (로그인 유지)' : (m>=60? (m/60)+'시간' : m+'분'); }
function idleTouch(){ IDLE_LAST=Date.now(); IDLE_WARNED=false; }

function idleLogout(m){
  clearSess(); try{ sessionStorage.removeItem(CACHE_KEY); }catch(e){}
  try{ sessionStorage.setItem('svc_idle_msg', idleLabel(m)+' 동안 활동이 없어 자동 로그아웃되었습니다. 다시 로그인하세요.'); }catch(e){}
  SB_TOKEN=null; AUTH_USER=null; location.reload();
}
function idleCheck(){
  var m=idleMin(); if(!m || !SB_TOKEN) return;
  var idle=Date.now()-IDLE_LAST, lim=m*60000;
  if(idle>=lim){ idleLogout(m); return; }
  if(!IDLE_WARNED && lim-idle<=60000){
    IDLE_WARNED=true;
    toast('곧 자동 로그아웃', '1분 더 활동이 없으면 로그아웃됩니다 — 시간은 내 계정 › 설정에서 바꿀 수 있습니다', 'info');
  }
}


/* ---- 화면 디자인: 커맨드 센터(기본, cc) / 심플(simple) / 클래식(classic) — 이 브라우저에만 저장 ----
   · cc      : 아이콘 레일 + 커맨드 바 + 인박스 홈 + 장비 보드 + 고객 360 패널 (v5 CSS · html[data-look="cc"])
   · simple  : 평면 디자인, 기존 사이드바 (v4 CSS · html:not([data-look="classic"]))
   · classic : 이전 디자인 그대로                                                                 */
var LOOKS={cc:'커맨드 센터 (기본)', simple:'심플', classic:'클래식 (이전 디자인)'};
function curLook(){ var v=null; try{ v=localStorage.getItem('svc_look'); }catch(e){} return LOOKS[v]? v : 'cc'; }
function isCC(){ return document.documentElement.getAttribute('data-look')==='cc'; }
function applyLook(){
  var v=curLook();
  if(v==='simple') document.documentElement.removeAttribute('data-look');
  else document.documentElement.setAttribute('data-look', v);
}
function setLook(v){
  if(!LOOKS[v]) v='cc';
  try{ if(v==='cc') localStorage.removeItem('svc_look'); else localStorage.setItem('svc_look',v); }catch(e){}
  applyLook();
  /* 레일·인박스 등 구조가 달라지므로 다시 읽는 편이 안전합니다 */
  setTimeout(function(){ location.reload(); }, 350);
}

/* 메뉴 글머리 이모지를 <span class="ic"> 로 감싸 심플 디자인에서는 숨길 수 있게 (textContent 는 그대로) */
function wrapNavIcons(){
  var re; try{ re=new RegExp('^([\\p{Extended_Pictographic}\\u2600-\\u27BF][\\uFE0F\\u20E3]?(?:\\u200D\\p{Extended_Pictographic}\\uFE0F?)*)\\s+(\\S.*)$','u'); }catch(e){ return; }
  document.querySelectorAll('#side button').forEach(function(b){
    if(b.querySelector('.ic') || b.children.length) return;
    var m=(b.textContent||'').trim().match(re); if(!m) return;
    b.textContent='';
    var ic=document.createElement('span'); ic.className='ic'; ic.textContent=m[1];
    b.appendChild(ic); b.appendChild(document.createTextNode(' '+m[2]));
  });
}
function navText(b){   // 메뉴 글자만 (심플 디자인에서는 이모지 제외)
  var t=(b.textContent||'').trim(), ic=b.querySelector('.ic');
  if(ic && document.documentElement.getAttribute('data-look')!=='classic') t=t.replace(ic.textContent,'').trim();
  return t;
}