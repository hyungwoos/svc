/* ===== init.js — 시작할 때 실행하는 문장 모음 (④ 아키텍처 2단계 · ㊿+136 → ES 모듈 ㊿+153) =====
   다른 js/*.js 는 선언(export var·function)만 있고 아무것도 실행하지 않습니다. 시작할 때 «실행»되는 문장(이벤트 등록 · setInterval · 즉시 호출 · 설정값)은
   원래 app.js 에 있던 순서 그대로 아래 start() 안에 모았습니다 — main.js 가 모든 파일을 읽은 뒤 start() 를 한 번 부릅니다. 각 문장 위 주석 [파일 N행] 은 원래 위치.
   ★ 새 즉시 실행 코드(이벤트 등록·초기화)는 start() 끝(boot() 앞)에 추가하세요. 선언만 있는 함수는 해당 도메인 파일에. */
import { APP_VER, IS_QA, IS_STAGING, ST } from './state.js';
import { applyLook, idleCheck, idleTouch, logClientError, perfFlush, PWA, pwaHintSync, rawHtml, refreshToken, sessRead, tpl } from './core.js';
import { boot, railFlyClose, screenLogin, screenPw, toast } from './shell.js';
import { measureTopbar, onResize, RESIZE_HOOKS } from './dash.js';
import { buildGrids, GRIDS } from './grids.js';
import { EQOPEN, eqSnDetail } from './equipment.js';
import { applyFs, openFind } from './tools.js';
import { wkFsSync, wkNext, wkPrev, wkToggleFs } from './inbound.js';
import { askScreenHelp, btnBackSync, comboPlace, goBack, gridActPad, LENS_DEFS, LENS_DESC, NAV, navValid, switchView, viewSnapAdd, viewSnapInit } from './grid.js';
import { closeOvl, fillSectorSel, ovlDismiss, ovlInit, ovlTop, renameShowPreview, syncCustMeta } from './edit.js';
import { lazyHook } from './lazy.js';
import { verStart } from './guard.js';

/* 시작 순서 — main.js 가 모든 모듈을 읽은 뒤 한 번 부름. 아래 문장들은 예전 고전 스크립트 때의 «파일을 읽을 때 실행» 순서 그대로 */
export function start(){
  /* ㊿+180 다른 사이트가 포탈을 iframe 으로 끼워 넣어 클릭을 가로채지 못하게 — 같은 출처(포탈 안 위성 화면 · 스테이징 QA)만 허용
     GitHub Pages 는 frame-ancestors 헤더를 보낼 수 없어 여기서 막음 */
  if(!frameOk()){ frameBlock(); return; }

  /* [core.js 99행] */
  /* ㊿+172 포탈 안 화면(견적 · 프로젝트 리포트 · 정산 iframe)에서 Ctrl+K — 같은 출처만 */
  window.addEventListener('message', function(ev){
    if(!ev || ev.origin!==location.origin || !ev.data || ev.data.type!=='svcFind') return;
    var ok=['quoteFrame','preportFrame','s1Frame','kkFrame'].some(function(id){ var f=/** @type {any} */(document.getElementById(id)); return !!f && f.contentWindow===ev.source; });
    if(ok) try{ openFind(); }catch(e){}
  });
  window.addEventListener('message', function(ev){
    if(!ev || !ev.data || ev.data.type!=='openReport' || !ev.data.id) return;
    var pf=document.getElementById('preportFrame');
    if(pf) pf.src='report.html?v='+encodeURIComponent(APP_VER)+'&id='+encodeURIComponent(ev.data.id);
    try{ switchView('preport'); }catch(e){}
  });

  /* [core.js 117행] */
  if(IS_STAGING){ document.addEventListener('DOMContentLoaded', function(){ var b=document.createElement('div'); b.id='stagingBar'; b.innerHTML=tpl`🧪 <b>STAGING</b> — 시험용 포탈입니다 (운영과 같은 데이터 · 여기서 저장하면 운영에도 반영됩니다) · <a href="${rawHtml(location.pathname.replace('/staging/','/'))}">운영 포탈로 →</a>`; document.body.prepend(b); document.title='[STAGING] '+document.title; }); }

  /* [core.js 129행] */
  window.addEventListener('error', function(e){ logClientError(e.message, e.filename, e.lineno, e.colno, e.error&&e.error.stack); });

  /* [core.js 130행] */
  window.addEventListener('unhandledrejection', function(e){ var r=e.reason; logClientError((r&&r.message)||String(r), '', null, null, r&&r.stack); });
  /* ㊿+173 실사용 속도 기록은 창을 숨기거나 닫을 때 한 번에 */
  window.addEventListener('pagehide', function(){ perfFlush(true); });
  document.addEventListener('visibilitychange', function(){ if(document.visibilityState==='hidden') perfFlush(true); });
  /* ㊿+175 옛 탭 막기 — 서버에 새 버전이 올라오면 위쪽 띠 + 저장 막음(guard.js) */
  verStart();

  /* [core.js 134행] */
  if('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !IS_QA){
    window.addEventListener('load', function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); });
  }

  /* [core.js 137행] */
  window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); PWA.deferred=e; pwaHintSync(); });

  /* [core.js 138행] */
  window.addEventListener('appinstalled', function(){ PWA.deferred=null; try{ toast('앱으로 설치됐습니다', '홈 화면의 «SVC 포탈» 아이콘으로 여세요', 'ok'); }catch(e){} pwaHintSync(); });

  /* [core.js 256행] */
  setInterval(function(){
    var s=sessRead();
    if(!ST.SB_TOKEN || !s || !s.e) return;
    if(Math.floor(Date.now()/1000) > (s.e - 300)) refreshToken();   // 만료 5분 전 미리 연장
  }, 60*1000);

  /* [core.js 451행] */
  ['mousemove','mousedown','keydown','wheel','touchstart','scroll'].forEach(function(ev){
    document.addEventListener(ev, idleTouch, {passive:true, capture:true});
  });

  /* [core.js 468행] */
  setInterval(idleCheck, 15*1000);

  /* [core.js 469행] */
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) idleCheck(); });

  /* [core.js 490행] */
  applyLook();

  /* [shell.js 595행] */
  document.addEventListener('click', function(e){ var f=document.getElementById('railFly'); if(f && f.classList.contains('on') && !f.contains(e.target)) railFlyClose(); });

  /* [shell.js 596행] */
  document.addEventListener('keydown', function(e){ if(e.key!=='Escape') return; railFlyClose();
    /* ⑤ UX: Esc 로 맨 위 창 닫기 (2단계 인증 창·강제 등록 창은 제외 — 취소 버튼으로만) */
    var cf=document.querySelector('.colf'); if(cf){ cf.remove(); return; }
    /* ㊿+141: 맨 위 창 하나만, 창의 원래 닫기 버튼으로(동적 창은 제거) · 입력 중이면 확인 — ovlDismiss(edit.js) */
    var top=ovlTop(); if(top) ovlDismiss(top); });

  /* [shell.js 1605행] */
  (function(){
    var g=document.getElementById('lsGo'); if(!g) return;
    var f=document.getElementById('lsLogin'); if(f) f.addEventListener('submit',function(e){ e.preventDefault(); screenLogin(); });   // Enter·버튼 모두 submit 으로 → 비밀번호 관리자 저장 프롬프트도 정상 동작
    g.onclick=function(e){ e.preventDefault(); screenLogin(); };
    document.getElementById('lsPwGo').onclick=screenPw;
    ['lsEmail','lsPw'].forEach(function(id){
      document.getElementById(id).addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); screenLogin(); } });
    });
    ['lsNpw1','lsNpw2'].forEach(function(id){
      document.getElementById(id).addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); screenPw(); } });
    });
  })();

  /* [dash.js 2891행] */
  (function(){ var t; window.addEventListener('resize',function(){ clearTimeout(t);
    t=setTimeout(function(){
      try{ measureTopbar(); }catch(e){}          // 상단바가 두 줄로 접히면 높이가 바뀝니다
      RESIZE_HOOKS.forEach(function(f){ try{f();}catch(e){} });
    },160); }); })();

  /* 표 정의 — ㊿+153: grids.js 의 buildGrids() 로 (OI_PROB.map 같은 호출이 있어 시작할 때 만듦) */
  buildGrids();

  /* [equipment.js 5180행] */
  document.addEventListener('click', function(e){
    var t=e.target; if(!t || !t.closest) return;
    var more=t.closest('.eqser-more');
    if(more){ e.stopPropagation(); var f=more.parentElement.querySelector('.eqser-full'); if(!f) return;
      var open=f.style.display!=='none'; f.style.display=open? 'none':'block'; more.textContent=open? ((more.closest('.eqb-card')? '+':'외 ')+more.dataset.n+(more.closest('.eqb-card')? ' ▾':'대 ▾')) : '접기 ▴';
      if(more.dataset.oid) EQOPEN[more.dataset.oid]=!open; return; }
    var chip=t.closest('.eqsn.act');
    if(chip){ e.stopPropagation(); eqSnDetail(chip); return; }   /* ㊿+169 칩 = 시리얼 상세 (회수는 «회수 처리» 버튼으로) */
  });
  document.addEventListener('keydown', function(e){ var t=e.target; if((e.key==='Enter'||e.key===' ') && t && t.classList && t.classList.contains('eqsn') && t.classList.contains('act')){ e.preventDefault(); eqSnDetail(t); } });

  /* [equipment.js 5204행] ㊿+169 칩으로 회수 표시하던 막대(회수일 칸)는 없앰 */


  /* [tools.js 7264행] */
  document.addEventListener('keydown',function(e){
    if((e.ctrlKey||e.metaKey) && (e.key==='k'||e.key==='K')){ e.preventDefault(); openFind(); }
    if(e.key==='Escape'){                                             // 포커스가 어디 있어도 ESC로 닫기
      var ov=document.getElementById('ovlFind');
      if(ov && ov.classList.contains('on')) closeOvl('ovlFind');
    }
  });

  /* [tools.js 7537행] */
  (function(){
    var n=0; try{ n=+(localStorage.getItem('svc_fs')||0); }catch(e){}
    applyFs(n);
    document.addEventListener('DOMContentLoaded',function(){ applyFs(n); });
    var t=setInterval(function(){
      var b=document.getElementById('btnFont');
      if(!b) return;
      clearInterval(t);
      applyFs(n);
      b.onclick=function(){
        n=(n+1)%3;
        try{ localStorage.setItem('svc_fs', String(n)); }catch(e){}
        applyFs(n);   // 알림창 없음 — 버튼 글씨로 단계 표시 (연속 클릭 가능)
      };
    }, 300);
  })();


  /* [inbound.js 9350행] */
  document.addEventListener('fullscreenchange', wkFsSync);

  /* [inbound.js 9351행] */
  document.addEventListener('webkitfullscreenchange', wkFsSync);

  /* [inbound.js 9379행] */
  document.addEventListener('keydown',function(e){
    if(ST.CUR_VIEW!=='weekly') return;
    var t=e.target && e.target.tagName;
    if(t==='INPUT'||t==='TEXTAREA'||t==='SELECT') return;
    if(e.code==='Space'){ e.preventDefault(); wkNext(); return; }
    if(e.code==='ArrowDown'||e.code==='PageDown'){ e.preventDefault(); wkNext(); return; }
    if(e.code==='ArrowUp'||e.code==='PageUp'){ e.preventDefault(); wkPrev(); return; }
    if(e.key==='f'||e.key==='F'){ e.preventDefault(); wkToggleFs(); }
  });

  /* [grid.js 13477행] */
  window.addEventListener('popstate', function(e){
    var v=(e.state && e.state.v) || (location.hash||'').replace('#','') || 'dash';
    if(!navValid(v)) v='dash';
    NAV.pop=true; try{ switchView(v); }catch(x){} NAV.pop=false;
    btnBackSync();
  });

  /* [grid.js 13483행] */
  document.addEventListener('DOMContentLoaded', function(){ var b=document.getElementById('btnBack'); if(b) b.onclick=goBack; });

  /* [grid.js 13485행] */
  document.addEventListener('keydown', function(e){
    if(e.key!=='Backspace' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    var a=document.activeElement, tag=a? a.tagName : '';
    if(tag==='INPUT' || tag==='TEXTAREA' || tag==='SELECT' || (a && a.isContentEditable)) return;
    var app=document.getElementById('app'); if(!app || app.classList.contains('hidden')) return;   // 로그인 화면 등에서는 무시
    e.preventDefault(); goBack();
  });

  /* [grid.js 13766행] */
  window.addEventListener('scroll', function(e){
    var m=document.getElementById('cbMenu'); if(!m) return;
    if(e.target && e.target.nodeType===1 && m.contains(e.target)) return;   /* 목록 자체를 스크롤하는 중 */
    comboPlace();
  }, true);

  /* [grid.js 13771행] */
  window.addEventListener('resize', comboPlace);

  /* [grid.js 14134행] */
  LENS_DEFS.forEach(function(d){ LENS_DESC[d[0]]=d[2]; });

  /* [edit.js 14770행] */
  (function(){ fillSectorSel(); var nc=document.getElementById('nCust'); if(nc){ nc.addEventListener('change', syncCustMeta); nc.addEventListener('blur', syncCustMeta); } })();

  /* [edit.js 14777행] */
  (function(){
    var sel=document.getElementById('nBilling'), etc=document.getElementById('nBillingEtc');
    if(sel && etc) sel.addEventListener('change', function(){
      etc.style.display = sel.value==='__etc'? '' : 'none';
      if(sel.value==='__etc') etc.focus();
    });
  })();

  /* [edit.js 14980행] */
  (function(){ ['xOld','xNew'].forEach(function(i){ var e=document.getElementById(i); if(e){ e.addEventListener('input', renameShowPreview); e.addEventListener('change', renameShowPreview); } }); })();

  /* [index.html 인라인 onclick 대체 · ㊿+136 — CSP 에서 'unsafe-inline' 을 빼기 위해 data-close / data-sat 로 위임] */
  document.addEventListener('click', function(e){
    var t=e.target; if(!t || !t.closest) return;
    var c=t.closest('[data-close]'); if(c){ if(c.dataset.pre==='oiconv') ST.OI_CONVERT=null; closeOvl(c.dataset.close); return; }
    var a=t.closest('a[data-sat]'); if(a){ a.href=a.dataset.sat+'?v='+encodeURIComponent(APP_VER); }
  });
  document.addEventListener('submit', function(e){ if(e.target && e.target.id==='lsLogin') e.preventDefault(); });
  /* ⑤ UX 2단계 (㊿+139): 표 동작 열 여백은 창 크기에 따라 다시 계산 · ❔ 화면 도움말 · ? 단축키 안내 */
  onResize(function(){ if(ST.CUR_VIEW && GRIDS[ST.CUR_VIEW]) gridActPad(); });
  (function(){ var b=document.getElementById('dvHelp'); if(b) b.addEventListener('click', askScreenHelp); })();
  document.addEventListener('keydown', function(e){
    if(e.key!=='?' || e.ctrlKey || e.metaKey || e.altKey) return;
    var a=document.activeElement, tag=a? a.tagName : ''; if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(a&&a.isContentEditable)) return;
    var app=document.getElementById('app'); if(!app || app.classList.contains('hidden')) return;
    e.preventDefault(); var ov=document.getElementById('ovlKeys'); if(ov) ov.classList.toggle('on');
  });   /* 예전 onsubmit="return false" */
  /* ㊿+141: 창 공통 — 바깥 클릭으로 닫기 · 입력 중 확인 · 초점 들어가기/가두기/되돌리기 (edit.js ovlInit) */
  ovlInit();
  try{ viewSnapInit(); }catch(e){}   /* ㊿+145: 메뉴 «첫 화면» 값 — 상태 객체를 건드리기 전에 사본 */
  lazyHook(function(){ try{ viewSnapAdd(); }catch(e){} });   /* ㊿+153: 리포트·관리자·가격표는 처음 열 때 받으므로 그때 사본 */

  /* [edit.js 15194행] */
  boot();
}
/** 최상위 창이거나 같은 출처의 부모 안 — 다른 출처면 부모 위치를 읽을 때 오류 */
export function frameOk(){ try{ return window.top===window.self || window.top.location.origin===location.origin; }catch(e){ return false; } }
export function frameBlock(){
  try{ document.body.innerHTML=tpl`<p style="font:15px/1.6 sans-serif;padding:32px">보안을 위해 이 포탈은 다른 사이트 안에서 열 수 없습니다. <a href="${location.href}" target="_top" rel="noopener">포탈을 새 창으로 열기</a></p>`; }catch(e){}
}
