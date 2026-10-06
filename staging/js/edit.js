/* ===== edit.js — 입력·수정(Supabase 쓰기) · 로그인 모달 · 계약 검색 · 저장 동작 · 사명 변경 · boot =====
   ES 모듈(㊿+153) — 다른 파일의 이름은 아래 import 로만 씀 · 이 파일의 최상위 var/function 은 전부 export · 즉시 실행 문장은 js/init.js 의 start() 에 */
import { ST } from './state.js';
import { $, amtGuard, amtHint, clearSess, doLogout, el, esc, kwToWon, lline, mfaGate, mfaVerifiedOf, mk, rawHtml, saveSess, SB_KEY, SB_URL, sessRead, sessWrite, tpl, won, wonToKw } from './core.js';
import { afterLoad, idxDate, loadFromDb, onData, onErr, SB_RAW, sbWrite, showAuthUi, showLoading, toast } from './shell.js';
import { s1NoInfo, s1NoOpts } from './grids.js';
import { chOf, doChurn, doRenew, liveCalc, nmKeys } from './analysis.js';
import { switchView } from './grid.js';


/* ==================================================================
   입력·수정 (Supabase 쓰기)
   ================================================================== */
export function openOvl(id){ document.getElementById(id).classList.add('on'); }
export function closeOvl(id){ document.getElementById(id).classList.remove('on'); }

/* ── 창(.ovl) 공통 동작 (㊿+141 · 사용자: «닫기 버튼이 아니라 옆 공간을 클릭해도 닫히게») ──
   · 바깥(어두운 배경) 클릭 · Esc → ovlDismiss: 창의 [data-close] 버튼 → 아래쪽 «닫기/취소» 버튼 → 없으면 숨김(정적)/제거(동적) 순서로 «원래 닫는 방법»을 그대로 씀
   · 입력 중인 내용이 있으면 확인 후 닫음(ovlIsDirty) · 2단계 인증 창(#ovlMfa)·data-noesc 창은 바깥 클릭/Esc 로 닫지 않음
   · 열릴 때 role=dialog·aria-modal·제목 연결 · 초점을 창 안으로 · Tab 은 창 안에서만 돎 · 닫히면 초점을 연 버튼으로 되돌림
   init.js 끝에서 ovlInit() 이 이벤트를 등록함 */
export var OVL_SEQ=0, OVL_STATIC=null, OVL_DOWN=null;
export var OVL_SKIP_CLEAN=/^(change_log|client_errors|ai_feedback|ai_check_log|ai_chat_history)\b/;
export function ovlShown(o){ return !!(o && o.isConnected && o.classList.contains('on') && o.getClientRects().length); }
export function ovlTop(){
  var a=Array.prototype.slice.call(document.querySelectorAll('.ovl.on')).filter(ovlShown);
  if(!a.length) return null;
  a.forEach(function(o,i){ o.__ord=i; });
  a.sort(function(x,y){ return ((parseInt(getComputedStyle(x).zIndex,10)||0)-(parseInt(getComputedStyle(y).zIndex,10)||0)) || (x.__ord-y.__ord); });
  return a[a.length-1];
}
export function ovlCanClose(o){ return !!o && o.id!=='ovlMfa' && !o.hasAttribute('data-noesc'); }
export function ovlVal(t){ return (t.type==='checkbox'||t.type==='radio')? (t.checked?'1':'0') : String(t.value==null? '' : t.value); }
export function ovlTrackable(t){
  if(!t || !t.closest || !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return null;
  if(t.id==='fkInput' || t.type==='search' || t.type==='hidden' || t.closest('[data-nodirty]')) return null;
  return t.closest('.ovl');
}
export function ovlMarkDirty(o){ if(typeof o==='string') o=document.getElementById(o); if(o) o.__dirty=true; }
export function ovlMarkClean(){   /* 저장 성공(sbWrite) 뒤 — 지금 값을 새 기준으로. 저장 뒤 코드가 칸을 비우는 것(사람 입력 아님)은 «입력 중»으로 치지 않음(__ti) */
  var now=Date.now();
  Array.prototype.forEach.call(document.querySelectorAll('.ovl.on'), function(o){
    o.__dirty=false; o.__cleanAt=now; (o.__typed||[]).forEach(function(t){ if(t.isConnected) t.__v0=ovlVal(t); });
  });
}
export function ovlIsDirty(o){
  if(!o) return false; if(o.__dirty) return true;
  var c=o.__cleanAt||0;
  return (o.__typed||[]).some(function(t){ return t.isConnected && o.contains(t) && !t.disabled && (t.__ti||0)>c && ovlVal(t)!==t.__v0; });
}
export function ovlDismiss(o){
  if(!ovlCanClose(o)) return false;
  if(ovlIsDirty(o) && !confirm('입력하거나 바꾼 내용이 아직 저장되지 않았습니다.\n저장하지 않고 닫을까요?')) return false;
  o.__dirty=false; (o.__typed||[]).forEach(function(t){ delete t.__v0; }); o.__typed=[];
  var c=Array.prototype.slice.call(o.querySelectorAll('[data-close]')).filter(function(b){ return b.dataset.close===o.id; })[0];
  if(c){ c.click(); return true; }
  var foot=Array.prototype.slice.call(o.querySelectorAll('.mact button, .modal > div:last-child button')).filter(function(b){ return b.getClientRects().length && /^(닫기|취소|✕|×)$/.test(b.textContent.trim()); });
  if(foot.length){ foot[foot.length-1].click(); if(!ovlShown(o)) return true; }
  if(OVL_STATIC && OVL_STATIC.indexOf(o)>=0) o.classList.remove('on'); else o.remove();
  return true;
}
export function ovlFocusables(o){
  return Array.prototype.slice.call(o.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),iframe,[contenteditable="true"],[tabindex]:not([tabindex="-1"])'))
    .filter(function(e){ return e.getClientRects().length && getComputedStyle(e).visibility!=='hidden'; });
}
export function ovlDialogEl(o){ return o.matches('[role=dialog]')? o : (o.querySelector('[role=dialog]') || o.querySelector('.modal') || o.firstElementChild || o); }
export function ovlOnOpen(o){
  if(o.__open) return; o.__open=true; o.__dirty=false; o.__typed=[]; o.__cleanAt=0;
  var ae=document.activeElement; o.__opener=(ae && ae!==document.body && !o.contains(ae))? ae : null;
  var d=ovlDialogEl(o);
  if(!d.hasAttribute('role')) d.setAttribute('role','dialog');
  if(!d.hasAttribute('aria-modal')) d.setAttribute('aria-modal','true');
  if(!d.hasAttribute('aria-labelledby') && !d.hasAttribute('aria-label')){ var h=d.querySelector('h1,h2,h3,h4'); if(h){ if(!h.id) h.id='ovlH'+(++OVL_SEQ); d.setAttribute('aria-labelledby', h.id); } }
  if(!d.hasAttribute('tabindex')) d.setAttribute('tabindex','-1');
  setTimeout(function(){   /* 여는 함수가 직접 초점을 준 경우(검색칸 등)는 그대로 */
    if(!ovlShown(o) || o.contains(document.activeElement)) return;
    try{ d.focus({preventScroll:true}); }catch(e){}
  }, 60);
}
export function ovlOnClose(o){
  if(!o.__open) return; o.__open=false; var op=o.__opener; o.__opener=null;
  setTimeout(function(){
    var ae=document.activeElement;
    if(op && op.isConnected && op.getClientRects().length && (!ae || ae===document.body || !ae.isConnected || o.contains(ae))){ try{ op.focus({preventScroll:true}); }catch(e){} }
  }, 0);
}
export function ovlTrapTab(e){
  if(e.key!=='Tab' || e.ctrlKey || e.altKey || e.metaKey) return;
  var o=ovlTop(); if(!o) return;
  var F=ovlFocusables(o); if(!F.length){ e.preventDefault(); return; }
  var i=F.indexOf(document.activeElement);
  if(e.shiftKey){ if(i<=0){ e.preventDefault(); F[F.length-1].focus(); } }
  else if(i<0 || i===F.length-1){ e.preventDefault(); F[0].focus(); }
}
export function ovlWatch(o){
  if(o.__watched) return; o.__watched=true;
  new MutationObserver(function(){ if(o.classList.contains('on')) ovlOnOpen(o); else ovlOnClose(o); }).observe(o, {attributes:true, attributeFilter:['class']});
  if(o.classList.contains('on')) ovlOnOpen(o);
}
export function ovlInit(){
  OVL_STATIC=Array.prototype.slice.call(document.querySelectorAll('.ovl'));
  OVL_STATIC.forEach(ovlWatch);
  new MutationObserver(function(ms){ ms.forEach(function(m){
    Array.prototype.forEach.call(m.addedNodes, function(n){ if(n.nodeType===1 && n.classList.contains('ovl')) ovlWatch(n); });
    Array.prototype.forEach.call(m.removedNodes, function(n){ if(n.nodeType===1 && n.classList.contains('ovl')) ovlOnClose(n); });
  }); }).observe(document.body, {childList:true});
  /* 바깥 클릭: 누른 곳과 뗀 곳이 둘 다 배경일 때만(창 안에서 글자를 끌어 선택하다 배경에서 놓는 경우는 닫지 않음) */
  document.addEventListener('pointerdown', function(e){ OVL_DOWN=e.target; }, true);
  document.addEventListener('click', function(e){
    var o=e.target; if(!o || !o.classList || !o.classList.contains('ovl') || OVL_DOWN!==o) return;
    if(o!==ovlTop()) return; ovlDismiss(o);
  });
  document.addEventListener('focusin', function(e){ var t=e.target, o=ovlTrackable(t); if(!o) return; if(t.__v0===undefined){ t.__v0=ovlVal(t); (o.__typed=o.__typed||[]).push(t); } }, true);
  var late=function(e){ var t=e.target, o=ovlTrackable(t); if(!o || !e.isTrusted) return; t.__ti=Date.now();   /* 사람이 바꾼 시각 */
    if(t.__v0!==undefined) return;   /* 초점 없이 바뀐 칸(Safari 체크박스 등) — 원래 값을 모르면 «바뀜»으로 */
    t.__v0=(t.type==='checkbox'||t.type==='radio')? (t.checked?'0':'1') : '\u0001'; (o.__typed=o.__typed||[]).push(t); };
  document.addEventListener('input', late, true); document.addEventListener('change', late, true);
  document.addEventListener('keydown', ovlTrapTab);
}
export function msg(id,t,cls){ var e=$('#'+id); e.textContent=t||''; e.className='mmsg'+(cls?' '+cls:''); }

/* ---- 로그인 / 가입 / 비밀번호 변경 ---- */
export var AU_TAB='login';

export async function doLogin(){
  msg('auMsg','확인 중…');
  try{
    var r=await fetch(SB_URL+'/auth/v1/token?grant_type=password',{
      method:'POST', headers:{apikey:SB_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({email:$('#auEmail').value.trim(), password:$('#auPw').value})
    });
    var j=await r.json();
    if(!r.ok||!j.access_token) throw new Error(j.error_description||j.msg||'이메일 또는 비밀번호가 올바르지 않습니다');
    ST.SB_TOKEN=j.access_token; ST.AUTH_USER=($('#auEmail').value.trim());
    saveSess(j, ST.AUTH_USER);
    if(!(await mfaGate(j.access_token, ST.AUTH_USER, j.user&&j.user.factors, {fast:!mfaVerifiedOf(j.user&&j.user.factors).length}))){ clearSess(); ST.SB_TOKEN=null; ST.AUTH_USER=null; msg('auMsg','2단계 인증을 취소해 로그인하지 않았습니다'); return; }
    showAuthUi();
    msg('auMsg','');

    // 최초 로그인(비밀번호 미변경) 확인 — user_metadata.pw_changed 플래그
    var changed = j.user && j.user.user_metadata && j.user.user_metadata.pw_changed;
    if(!changed){
      FORCE_PW = true;
      setAuthTab('pw');
      $('#auTabs').style.display='none';
      $('#auClose').style.display='none';
      $('#auLogout').style.display='';
      msg('auMsg','최초 로그인입니다 — 본인 비밀번호로 변경해야 사용할 수 있습니다','bad');
      setTimeout(function(){ $('#apPw').focus(); },50);
      loadFromDb().then(afterLoad).catch(onErr);   // 뒤에서 미리 로드 (모달이 막고 있음)
      return;
    }
    closeOvl('ovlAuth');
    showLoading('로그인 완료 — 데이터를 불러오는 중…');
    loadFromDb().then(afterLoad).catch(onErr);
  }catch(e){ msg('auMsg',String(e.message||e),'bad'); }
}

export var FORCE_PW=false;

export async function doPwChange(){
  if(!ST.SB_TOKEN) return msg('auMsg','먼저 「로그인」 탭에서 로그인하세요','bad');
  var p1=$('#apPw').value, p2=$('#apPw2').value;
  if(p1.length<6) return msg('auMsg','6자 이상으로 입력하세요','bad');
  if(p1!==p2) return msg('auMsg','비밀번호 확인이 일치하지 않습니다','bad');
  msg('auMsg','변경 중…');
  try{
    var r=await fetch(SB_URL+'/auth/v1/user',{
      method:'PUT', headers:{apikey:SB_KEY,'Content-Type':'application/json',Authorization:'Bearer '+ST.SB_TOKEN},
      body:JSON.stringify({password:p1, data:{pw_changed:true}})
    });
    var j=await r.json();
    if(!r.ok) throw new Error(j.error_description||j.msg||'변경 실패');
    $('#apPw').value=$('#apPw2').value='';
    try{ var s0=sessRead(); if(s0){ s0.p=true; sessWrite(s0); } }catch(e){}
    msg('auMsg','비밀번호를 변경했습니다 ✅','ok');
    if(FORCE_PW){
      FORCE_PW=false;
      $('#auTabs').style.display='';
      $('#auClose').style.display='';
      setTimeout(function(){ closeOvl('ovlAuth'); },700);
    }
  }catch(e){ msg('auMsg',String(e.message||e),'bad'); }
}

export function setAuthTab(t){
  AU_TAB=t;
  $('#auTabs').querySelectorAll('button').forEach(function(b){
    b.setAttribute('aria-pressed', b.dataset.t===t?'true':'false');
  });
  $('#auTabLogin').style.display = t==='login'?'':'none';
  $('#auTabPw').style.display = t==='pw'?'':'none';
  $('#auGo').textContent = t==='login'?'로그인':'변경';
  msg('auMsg','');
}

export function toggleAuthMenu(){
  var old=document.getElementById('authMenu');
  if(old){ old.remove(); return; }
  var r=$('#btnAuth').getBoundingClientRect();
  var m=document.createElement('div'); m.id='authMenu';
  m.style.cssText='position:fixed;top:'+(r.bottom+6)+'px;right:'+Math.max(10,window.innerWidth-r.right)+'px;z-index:1200;'+
    'background:var(--surface);border:1px solid var(--ring);border-radius:12px;'+
    'box-shadow:0 14px 34px -14px rgba(0,0,0,.32);padding:6px;min-width:180px';
  var bs='display:block;width:100%;text-align:left;border:0;background:transparent;padding:9px 11px;border-radius:8px;font:inherit;font-size:13.5px;cursor:pointer;color:var(--ink)';
  m.innerHTML=tpl`<div style="padding:7px 11px 5px;font-size:11px;color:var(--muted);border-bottom:1px solid var(--line);margin-bottom:4px">${ST.AUTH_USER||''}</div>`+
    tpl`<button data-a="acct" style="${rawHtml(bs)}">👤 내 계정</button>`+
    tpl`<button data-a="out" style="${rawHtml(bs)};color:var(--critical,#d03b3b)">로그아웃</button>`;
  document.body.appendChild(m);
  m.querySelectorAll('button').forEach(function(b){
    b.onmouseenter=function(){ b.style.background='var(--surface-2)'; };
    b.onmouseleave=function(){ b.style.background='transparent'; };
  });
  m.querySelector('[data-a="acct"]').onclick=function(){ m.remove(); switchView('account'); };
  m.querySelector('[data-a="out"]').onclick=function(){ m.remove(); doLogout(); };
  setTimeout(function(){
    document.addEventListener('click', function h(e){
      if(!m.contains(e.target) && e.target.id!=='btnAuth'){ m.remove(); document.removeEventListener('click',h); }
    });
  },0);
}
export function setupAuth(){
  $('#btnAuth').onclick=function(){
    if(ST.SB_TOKEN){ toggleAuthMenu(); return; }   // 로그인 상태: 내 계정/로그아웃 메뉴
    $('#auTabs').querySelector('[data-t="login"]').style.display='';
    $('#auLogout').style.display='none';
    setAuthTab('login');
    openOvl('ovlAuth');
    setTimeout(function(){ $('#auEmail').focus(); },50);
  };
  $('#auLogout').onclick=function(){
    doLogout();
  };
  $('#auTabs').querySelectorAll('button').forEach(function(b){
    b.onclick=function(){ setAuthTab(this.dataset.t); };
  });
  $('#auGo').onclick=function(){
    if(AU_TAB==='login') doLogin();
    else doPwChange();
  };
  // Enter 로 제출
  ['auEmail','auPw','apPw','apPw2'].forEach(function(id){
    var el0=$('#'+id); if(!el0) return;
    el0.addEventListener('keydown',function(e){
      if(e.key==='Enter'){ e.preventDefault(); $('#auGo').click(); }
    });
  });
}

/* ---- 계약 검색 위젯 ---- */
export function ctLabel(r){
  return r.cust+' · '+lline(r.line)+' · '+(mk(r.startIdx)||'?')+'~'+(mk(r.endIdx)||'?')+' · '+won(r.mrr||0)+'천원';
}
export function setupPick(inputId, pickId, store){
  var inp=$('#'+inputId), box=$('#'+pickId);
  inp.oninput=function(){
    var q=this.value.trim().toLowerCase(); box.innerHTML=''; store.sel=null;
    if(store===PK_C && FORM_FN.cLivePreview) FORM_FN.cLivePreview();
    if(q.length<2) return;
    ST.DATA.rows.map(function(r,i){return r;}).filter(function(r){
      return r.cust.toLowerCase().indexOf(q)>=0;
    }).slice(0,30).forEach(function(r){
      var it=el('div','pi');
      it.innerHTML=tpl`<span>${r.cust} <small>${lline(r.line)} · ${rawHtml(r.status||'활성')}${rawHtml(r.renew? ' · 연장 '+r.renew+'회':'')}</small></span>`+
                   tpl`<small>${rawHtml(mk(r.startIdx)||'?')}~${rawHtml(mk(r.endIdx)||'?')} · ${won(r.mrr||0)}천원</small>`;
      it.onclick=function(){
        store.sel=r;
        /* ㊿+157 금액 칸 환산 «= 48만원» 의 «이전 금액» = 고른 계약의 MRR */
        var pm=(store===PK_R)? $('#rMrr') : (store===PK_F)? $('#fMrr') : null; if(pm){ pm.dataset.prev=String(r.mrr||''); pm.dispatchEvent(new Event('input')); }
        box.querySelectorAll('.pi').forEach(function(x){x.classList.remove('sel');});
        it.classList.add('sel');
        if(store===PK_F) showFixCurrent(r);
        if(store===PK_A) showAddParent(r);
        if(store===PK_C && FORM_FN.cLivePreview) FORM_FN.cLivePreview();
      };
      box.appendChild(it);
    });
  };
}

/* 추가 탭: 고른 원계약 요약 표시 (부속 계약은 원계약을 고를 수 없음 → 그 원계약으로 바꿔 줌) */
export function showAddParent(r){
  var box=$('#aSel'); if(!box) return;
  if(r.parent){ var p=ST.DATA.rows.filter(function(x){ return x._id===r.parent; })[0]; if(p){ PK_A.sel=p; r=p; } }
  box.style.display='';
  box.innerHTML=tpl`<label>원계약</label><div class="cap"><b>${r.cust}</b> · ${lline(r.line)} · ${chOf(r)} · ${r.ptn||''} · ${rawHtml(mk(r.startIdx)||'?')}~${rawHtml(mk(r.endIdx)||'?')} · 월 ${won(r.mrr||0)}천원`+ tpl`${rawHtml(r.renew? ' · 연장 '+r.renew+'회':'')}<br>이 계약에 이미 붙은 부속 계약 ${ST.DATA.rows.filter(function(x){ return x.parent===r._id; }).length}건</div>`;
  if(!$('#aEnd').value && r.endIdx!=null) $('#aEnd').placeholder=mk(r.endIdx);
}
/* 금액 수정 탭: 선택한 계약의 현재 월 금액 구간을 보여주고, 구간을 누르면 시작·종료월이 채워집니다 */
export function showFixCurrent(r){
  var box=$('#fCur'); if(!box) return;
  var segs=(r.segs||[]).slice();
  if(!segs.length){ box.style.display=''; box.innerHTML='<label>현재 금액</label><div class="cap">인식 금액 행이 없습니다</div>'; return; }
  box.style.display='';
  box.innerHTML=tpl`<label>현재 금액 구간 <small style="color:var(--muted)">(누르면 그 구간이 입력칸에 채워집니다)</small></label>`+
    tpl`<div class="pick" style="max-height:120px">${rawHtml(segs.map(function(sg,i){
      return tpl`<div class="pi" data-i="${rawHtml(i)}"><span>${mk(sg[0])} ~ ${mk(sg[1])} <small>${rawHtml(sg[1]-sg[0]+1)}개월</small></span><small>월 ${won(sg[2])}천원</small></div>`;
    }).join(''))}`+ tpl`</div>`;
  box.querySelectorAll('.pi').forEach(function(el0){
    el0.onclick=function(){
      var sg=segs[+el0.dataset.i]; if(!sg) return;
      $('#fFrom').value=mk(sg[0]); $('#fTo').value=mk(sg[1]); $('#fMrr').value=wonToKw(sg[2]); $('#fMrr').dispatchEvent(new Event('input')); $('#fMrr').focus();
      box.querySelectorAll('.pi').forEach(function(x){x.classList.remove('sel');}); el0.classList.add('sel');
    };
  });
}
/* 업종(세분 분류) 선택지 — 50단계 분류 체계와 같은 이름을 씁니다 (집계가 한 이름으로 모이도록) */
export var SECTOR_OPTS=['IT·소프트웨어','금융·보험','기계·금속·부품','전자·전기','바이오·제약·의료','반도체·디스플레이','자동차·모빌리티',
  '유통·소비재','화학·소재','공공·행정','건설·엔지니어링','미디어·콘텐츠·게임','전문서비스','에너지·환경','교육·연구','물류·운송','방산·항공','기타'];
export function fillSectorSel(){
  var sel=document.getElementById('nSector'); if(!sel || sel._filled) return; sel._filled=1;
  var h='<option value="">— 선택 (모르면 비워두세요) —</option>';
  SECTOR_OPTS.forEach(function(o){ h+=tpl`<option>${o}</option>`; });
  h+='<option value="__etc">직접 입력…</option>';
  sel.innerHTML=h;
  var etc=document.getElementById('nSectorEtc');
  sel.addEventListener('change', function(){ etc.style.display = sel.value==='__etc'? '' : 'none'; if(sel.value==='__etc') etc.focus(); });
}
export function nSectorVal(){
  var sel=document.getElementById('nSector'); if(!sel) return '';
  if(sel.value==='__etc') return (document.getElementById('nSectorEtc').value||'').trim();
  return sel.value||'';
}
/* 고객사 칸에 기존 고객을 고르면 그 고객의 산업군·업종을 자동으로 채웁니다 */
export function syncCustMeta(){
  var name=($('#nCust').value||'').trim(); if(!name) return;
  var c=(SB_RAW.customers||[]).filter(function(x){ return x.name===name; })[0]; if(!c) return;
  if(c.industry){ var ind=$('#nInd'); if(ind) ind.value=c.industry; }
  var sel=document.getElementById('nSector'); if(!sel) return;
  var sec=c.sector||'';
  if(!sec){ sel.value=''; return; }
  if(SECTOR_OPTS.indexOf(sec)>=0){ sel.value=sec; document.getElementById('nSectorEtc').style.display='none'; }
  else { sel.value='__etc'; var e=document.getElementById('nSectorEtc'); e.style.display=''; e.value=sec; }
}

/* 과금방식 select: «직접 입력…» 이면 옆 입력칸 값을 씁니다 */
export function nBillingVal(){
  var sel=$('#nBilling'); if(!sel) return '';
  if(sel.value==='__etc') return ($('#nBillingEtc').value||'').trim();
  return sel.value||'';
}


/* ---- 공통 쓰기 도우미 ---- */
export function ymFromInput(v){ // 'YYYY-MM' → idx
  if(!v) return null;
  return (+v.slice(0,4)-2020)*12 + (+v.slice(5,7)-6);
}
export async function logChange(action,target,id,detail){
  try{ await sbWrite('POST','change_log',{actor:ST.AUTH_USER,action:action,target:target,target_id:id,detail:detail}); }catch(e){}
}
export async function ensureCustomer(name, ind, sector){
  var f=SB_RAW.customers.filter(function(c){return c.name===name;})[0];
  if(f){
    if(sector && sector!==(f.sector||'')){          // 폼에서 업종을 골랐고 기존 값과 다르면 고객사 업종 갱신
      try{ await sbWrite('PATCH','customers?id=eq.'+f.id,{sector:sector, sector_check:false}); f.sector=sector;
           logChange('update','customers',f.id,{sector:sector}); }catch(e){}
    }
    return f.id;
  }
  var body={name:name,industry:ind||'미분류'}; if(sector) body.sector=sector;
  var r=await sbWrite('POST','customers?select=id',[body],'return=representation');
  SB_RAW.customers.push({id:r[0].id,name:name,industry:ind,sector:sector||null});
  return r[0].id;
}
export function monthRows(ctId, fromIdx, toIdx, amount){
  var out=[];
  for(var i=fromIdx;i<=toIdx;i++) out.push({contract_id:ctId, month:idxDate(i), amount:amount});
  return out;
}

/* ---- 저장 동작 ---- */
export var PK_C={sel:null}, PK_R={sel:null}, PK_F={sel:null}, PK_A={sel:null};
export var CUR_TAB='new';

export async function saveEdit(){
  if(!ST.SB_TOKEN){ msg('eMsg','먼저 로그인하세요 (우측 상단)','bad'); openOvl('ovlAuth'); return; }
  var btn=$('#eGo'); btn.disabled=true; msg('eMsg','저장 중…');
  try{
    if(CUR_TAB==='add'){
      var pa=PK_A.sel; if(!pa) throw new Error('원계약을 선택하세요.');
      var as0=ymFromInput($('#aStart').value), ae0=ymFromInput($('#aEnd').value), amrr=kwToWon($('#aMrr').value)||0;   /* 칸은 천원 (㊿+157) */
      if(as0==null||!amrr) throw new Error('시작월·월 금액은 필수입니다.');
      if(!amtGuard(amrr, 0, '추가 월 금액', true)) throw new Error('저장하지 않았습니다 — 금액을 확인하세요.');
      if(ae0==null) ae0=(pa.endIdx!=null? pa.endIdx : as0+11);
      if(ae0<as0) throw new Error('종료월이 시작월보다 빠릅니다.');
      var akind=$('#aKind').value, aq=+$('#aQty').value||null, aser=($('#aSerial').value||'').trim();
      var anote=[akind+(aq? ' +'+aq:''), aser? '시리얼 '+aser:'', ($('#aNote').value||'').trim()].filter(Boolean).join(' · ');
      var src=(SB_RAW.contracts||[]).filter(function(c){ return c.id===pa._id; })[0]||{};
      var act=await sbWrite('POST','contracts?select=id',[{
        customer_id: pa.cid, line: pa.line, partner: src.partner||null, channel: src.channel||null, combine: src.combine||null,
        version: src.version||null, biller: src.biller||null, csm: src.csm||null, billing: src.billing||null,
        contract_type:'추가', status:'추가', parent_contract_id: pa._id, note: anote||null,
        start_month: idxDate(as0), end_month: idxDate(ae0), term_months: ae0-as0+1, qty: aq,
        total_amount: amrr*(ae0-as0+1), mrr: amrr
      }],'return=representation');
      var aid=act[0].id;
      await sbWrite('POST','monthly_revenue', monthRows(aid,as0,ae0,amrr));
      await logChange('insert','contracts',aid,{action:'부속계약',parent:pa._id,kind:akind,qty:aq,mrr:amrr,from:idxDate(as0),to:idxDate(ae0)});
      msg('eMsg','추가 등록 ✅ — '+pa.cust+' · '+akind+(aq? ' +'+aq:'')+' · '+mk(as0)+'~'+mk(ae0)+' · 월 '+won(amrr)+'천원 (원계약에 부속)','ok');
      ['aQty','aStart','aEnd','aMrr','aSerial','aNote'].forEach(function(i){ $('#'+i).value=''; });
    }
    else if(CUR_TAB==='new'){
      var cust=$('#nCust').value.trim(), mrr=kwToWon($('#nMrr').value)||0;   /* 칸은 천원 (㊿+157) */
      var s0=ymFromInput($('#nStart').value), e0=ymFromInput($('#nEnd').value);
      if(!cust||!mrr||s0==null||e0==null) throw new Error('고객사·시작월·종료월·월 금액은 필수입니다.');
      if(!amtGuard(mrr, 0, '월 금액', true)) throw new Error('저장하지 않았습니다 — 금액을 확인하세요.');
      var nFeeW=kwToWon($('#nFee').value);
      if(nFeeW && !amtGuard(nFeeW, 0, '설치비', false)) throw new Error('저장하지 않았습니다 — 설치비를 확인하세요.');
      if(e0<s0) throw new Error('종료월이 시작월보다 빠릅니다.');
      var ptn=$('#nPtn').value;
      if(ptn==='__etc'){
        ptn=$('#nPtnEtc').value.trim();
        if(!ptn) throw new Error('파트너를 직접 입력해주세요.');
      }
      var cid=await ensureCustomer(cust, $('#nInd').value, nSectorVal());
      var ct=await sbWrite('POST','contracts?select=id',[{
        customer_id:cid, line:$('#nLine').value, partner:ptn,
        channel:$('#nChannel').value, combine: $('#nCombine').value||null,
        lead_src:($('#nLead')&&$('#nLead').value)||null,
        version: ($('#nVer')&&$('#nVer').value)||null,
        biller:$('#nBiller').value.trim()||null, contract_type:$('#nType').value,
        note:$('#nNote').value.trim()||null,
        start_month:idxDate(s0), end_month:idxDate(e0),
        term_months:e0-s0+1, qty:+$('#nQty').value||null,
        csm:($('#nCsm').value||'').trim()||null,
        s1_no:($('#nS1No').value||'').trim()||null,
        parent_contract_id: (+($('#nParent')&&$('#nParent').value)||null),   /* 같은 고객사 아래 계약번호별 하위 등록 */
        billing:nBillingVal()||null,
        install_fee: nFeeW,
        settle_month: $('#nSettle').value? $('#nSettle').value+'-01' : ($('#nFee').value? idxDate(s0+1) : null),
        total_amount:mrr*(e0-s0+1), mrr:mrr
      }],'return=representation');
      var id=ct[0].id;
      await sbWrite('POST','monthly_revenue', monthRows(id,s0,e0,mrr));
      await logChange('insert','contracts',id,{cust:cust,mrr:mrr,from:idxDate(s0),to:idxDate(e0)});
      var subPid=+($('#nParent')&&$('#nParent').value)||null;
      msg('eMsg','저장 완료 ✅ — '+cust+(subPid? ' (상위 계약 #'+subPid+'의 하위)':'')+' '+(e0-s0+1)+'개월'+($('#nType').value==='추가'? '' : (s0<=ST.DATA.nowIdx? ' · LIVE 고객사에 반영됨' : ' · '+mk(s0)+'부터 LIVE 에 들어옴'))+' (대시보드·LIVE·해지율이 함께 갱신됩니다)','ok');
      if(ST.OI_CONVERT){
        try{
          await sbWrite('PATCH','oi_deals?id=eq.'+ST.OI_CONVERT.id,
            {contract_id:id, updated_at:new Date().toISOString()});
          ST.OI_CONVERT.contract_id=id;
          logChange('update','oi_deals',ST.OI_CONVERT.id,{계약전환:id});
          toast('OI → 계약 전환 완료', ST.OI_CONVERT.customer+' · 계약 #'+id);
        }catch(e2){ toast('OI 연결 실패', String(e2.message||e2).slice(0,80),'info'); }
        ST.OI_CONVERT=null;
      }
      if(FORM_FN.resetNewForm) FORM_FN.resetNewForm();   // 다음 입력을 위해 즉시 비움
    }
    else if(CUR_TAB==='churn'){
      var r=PK_C.sel; if(!r) throw new Error('계약을 선택하세요.');
      var m0=ymFromInput($('#cMonth').value), rs=$('#cReason').value.trim();
      if(m0==null||!rs) throw new Error('해지월·사유는 필수입니다.');
      await doChurn(r, m0, rs);                                   /* 홈 › 만기 처리 창과 같은 저장 로직 (㊿+127) */
      msg('eMsg','해지 처리 완료 ✅ — '+r.cust+' ('+$('#cMonth').value+'까지 인식'+(r.parent? '' : ' · '+mk(m0)+'부터 LIVE 제외')+')','ok');
    }
    else if(CUR_TAB==='renew'){
      var r2=PK_R.sel; if(!r2) throw new Error('계약을 선택하세요.');
      var ne=ymFromInput($('#rEnd').value);
      if(ne==null) throw new Error('새 종료월은 필수입니다.');
      var amt=kwToWon($('#rMrr').value) || r2.mrr || 0;   /* 칸은 천원 (㊿+157) */
      if(!amt) throw new Error('연장 금액을 알 수 없습니다. 금액을 입력하세요.');
      if(!amtGuard(amt, r2.mrr, '연장 월 금액', true)) throw new Error('저장하지 않았습니다 — 금액을 확인하세요.');
      var rres=await doRenew(r2, ne, amt, ($('#rNote')&&$('#rNote').value.trim())||''), rno=rres.rno;   /* 홈 › 만기 처리 창과 같은 저장 로직 (㊿+127) */
      msg('eMsg','연장 '+rno+'회 등록 ✅ — '+r2.cust+' → '+$('#rEnd').value+' · 월 '+won(amt)+'천원','ok');
    }
    else if(CUR_TAB==='fix'){
      var r3=PK_F.sel; if(!r3) throw new Error('계약을 선택하세요.');
      var f0=ymFromInput($('#fFrom').value), f1=ymFromInput($('#fTo').value), na=kwToWon($('#fMrr').value);   /* 칸은 천원 (㊿+157) */
      if(f0==null||na==null) throw new Error('적용 시작월·새 금액은 필수입니다. (0원도 됩니다)');
      if(na && !amtGuard(na, r3.mrr, '새 월 금액', true)) throw new Error('저장하지 않았습니다 — 금액을 확인하세요.');
      var endI=(r3.endIdx!=null? r3.endIdx : r3.dataLast);
      if(f1==null) f1=endI;                                   // 비우면 계약 끝까지
      if(f1<f0) throw new Error('적용 종료월이 시작월보다 빠릅니다.');
      if(endI!=null && f1>endI) throw new Error('적용 종료월('+$('#fTo').value+')이 계약 종료월('+mk(endI)+')보다 늦습니다. 기간을 늘리려면 «갱신» 탭을 쓰세요.');
      /* 구간을 지우고 다시 넣습니다 — 그 달 행이 아직 없던 경우(중간 공백)도 채워집니다 */
      await sbWrite('DELETE','monthly_revenue?contract_id=eq.'+r3._id+'&month=gte.'+idxDate(f0)+'&month=lte.'+idxDate(f1));
      if(na>0) await sbWrite('POST','monthly_revenue', monthRows(r3._id,f0,f1,na));
      var toEnd=(endI==null || f1>=endI);
      if(toEnd) await sbWrite('PATCH','contracts?id=eq.'+r3._id,{mrr:na,updated_at:new Date().toISOString()});   // 끝까지 바꾼 경우만 대표 MRR 갱신
      await logChange('update','monthly_revenue',r3._id,{from:idxDate(f0),to:idxDate(f1),amount:na});
      msg('eMsg','금액 수정 완료 ✅ — '+r3.cust+' '+mk(f0)+'~'+mk(f1)+' 월 '+won(na)+'천원'+(toEnd?' (대표 MRR 도 갱신)':' (구간만 · 대표 MRR 유지)'),'ok');
    }
    else if(CUR_TAB==='rename'){
      var xo=($('#xOld').value||'').trim(), xn=($('#xNew').value||'').trim();
      if(!xo||!xn) throw new Error('기존 사명과 변경 사명을 모두 입력하세요.');
      if(xo===xn) throw new Error('기존 사명과 변경 사명이 같습니다.');
      var pv=renamePreview(xo,xn), tot=pv.total;
      if(!tot) throw new Error('«'+xo+'» 를 계약·LIVE·장비·OI 어디에서도 찾지 못했습니다. 자동완성 목록에서 골라 주세요.');
      var q='«'+xo+'» → «'+xn+'»\n\n'+pv.lines.join('\n')+(pv.merge? '\n\n⚠ «'+xn+'» 고객사가 이미 있어 그쪽으로 합쳐집니다 (계약 이동 · 빈 고객사 삭제).':'')+'\n\n실행할까요?';
      if(!confirm(q)) throw new Error('취소했습니다.');
      var rr=await sbWrite('POST','rpc/rename_customer',{p_old:xo, p_new:xn, p_keep_alias:!!$('#xAlias').checked});
      var LBL={contracts:'계약',live:'LIVE 명단',lg:'LG U+',orders:'장비 신청',assets:'장비 현황',oi:'OI',mdrops:'MDR 운영',mdrpoc:'PoC',weekly:'주간보고',biz:'비즈포탈 대조',inbound:'인바운드'};
      var parts=Object.keys(LBL).filter(function(k){ return rr && rr[k]; }).map(function(k){ return LBL[k]+' '+rr[k]; });
      msg('eMsg','사명 변경 완료 ✅ — '+xo+' → '+xn+(rr&&rr.merged?' (기존 고객사에 합침)':'')+' · '+(parts.join(' · ')||'변경 0건'),'ok');
      $('#xOld').value=''; $('#xNew').value=''; $('#xPrev').style.display='none';
    }
    // 데이터 새로고침
    var nd=await loadFromDb(); onData(nd);
  }catch(e){ msg('eMsg',String(e.message||e),'bad'); }
  btn.disabled=false;
}
/* ---- 사명 변경: 자동완성 목록 · 영향 미리보기 ---- */
export function renameAllNames(){
  var u={}, add=function(n){ n=String(n||'').trim(); if(n) u[n]=1; };
  (SB_RAW.customers||[]).forEach(function(c){ add(c.name); });
  var X=ST.RAWX||{};
  (X.live||[]).forEach(function(x){ add(x.name); }); (X.lg||[]).forEach(function(x){ add(x.customer); });
  (X.orders||[]).forEach(function(x){ add(x.customer); }); (X.assets||[]).forEach(function(x){ add(x.customer); });
  (X.oi||[]).forEach(function(x){ add(x.customer); }); (X.mdrops||[]).forEach(function(x){ add(x.customer); });
  return Object.keys(u).sort(function(a,b){ return a.localeCompare(b,'ko'); });
}
export function renameFillNames(){
  var dl=$('#dlAllNames'); if(!dl||dl._n===renameAllNames().length) return;
  var names=renameAllNames(); dl.innerHTML=''; names.forEach(function(n){ var o=document.createElement('option'); o.value=n; dl.appendChild(o); }); dl._n=names.length;
}
export function renamePreview(xo,xn){
  var X=ST.RAWX||{}, eq=function(a){ return String(a||'').trim()===xo; };
  var cus=(SB_RAW.customers||[]).filter(function(c){ return c.name===xo; })[0];
  var cnt={
    '계약': cus? (X.contracts||[]).filter(function(c){ return c.customer_id===cus.id; }).length : 0,
    'LIVE 명단': (X.live||[]).filter(function(x){ return eq(x.name); }).length,
    'LG U+': (X.lg||[]).filter(function(x){ return eq(x.customer); }).length,
    '장비 신청': (X.orders||[]).filter(function(x){ return eq(x.customer); }).length,
    '장비 현황': (X.assets||[]).filter(function(x){ return eq(x.customer); }).length,
    'OI': (X.oi||[]).filter(function(x){ return eq(x.customer); }).length,
    'MDR 운영': (X.mdrops||[]).filter(function(x){ return eq(x.customer); }).length,
    '비즈포탈 대조': (X.biz||[]).filter(function(x){ return x.kind==='detail' && eq(x.item); }).length
  };
  var lines=Object.keys(cnt).filter(function(k){ return cnt[k]; }).map(function(k){ return '· '+k+' '+cnt[k]+'건'; });
  var total=Object.keys(cnt).reduce(function(a,k){ return a+cnt[k]; },0);
  var merge=!!(xn && (SB_RAW.customers||[]).some(function(c){ return c.name===xn && c.name!==xo; }));
  return {cnt:cnt, lines:lines, total:total, merge:merge, master:!!cus};
}
export function renameShowPreview(){
  var box=$('#xPrev'); if(!box) return;
  var xo=($('#xOld').value||'').trim(), xn=($('#xNew').value||'').trim();
  if(!xo){ box.style.display='none'; return; }
  var pv=renamePreview(xo,xn);
  box.style.display='';
  box.innerHTML=tpl`<label>바뀌는 곳</label><div class="cap">${rawHtml(pv.total? esc(pv.lines.join(' · ').replace(/· /g,''))+(pv.master?'':' <b style="color:var(--critical)">(고객사 마스터에는 없는 이름 — 다른 표만 바뀜)</b>') : '<b style="color:var(--critical)">이 이름은 어디에도 없습니다</b>')}`+ tpl`${rawHtml(pv.merge? tpl`<br><b style="color:var(--warn,#b26a00)">⚠ «${xn}» 고객사가 이미 있습니다 → 계약을 그쪽으로 옮겨 하나로 합칩니다</b> (주간보고·PoC·인바운드는 서버에서 함께 바뀌며 실행 후 건수로 표시)`:'')}</div>`;
}


/* 입력 폼 함수 — setupEdit() 안에서 만들어(폼 상태를 품음) 다른 곳에서 부를 수 있게 담아 둠 (㊿+154: 예전 window.resetNewForm 등) */
export var FORM_FN={nFillParents:null, resetNewForm:null, nLivePreview:null, cLivePreview:null};
export function setupEdit(){
  var nl=document.getElementById('nLine');
  function syncCombine(){
    var v=(nl&&nl.value)||'', cb=document.getElementById('nCombine');
    if(!cb) return;
    var isMdr=(v==='MDR'||v==='MDR_S1');
    cb.disabled=!isMdr;
    cb.parentElement.style.opacity=isMdr? '':'0.45';
    if(!isMdr) cb.value='';
  }
  function syncFee(){
    var v=(nl&&nl.value)||'', fw=document.getElementById('nFeeWrap'), sw=document.getElementById('nSettleWrap');
    if(!fw||!sw) return;
    var isS1=(v==='S1'||v==='MDR_S1');
    /* 설치비는 에스원(S1) 계약에만 있는 항목 — 다른 서비스에서는 칸을 숨기고 값도 비웁니다 */
    fw.style.display=isS1? '':'none'; sw.style.display=isS1? '':'none';
    if(!isS1){ var f=document.getElementById('nFee'), st=document.getElementById('nSettle'); if(f) f.value=''; if(st) st.value=''; }
  }
  function syncVer(){
    var v=(nl&&nl.value)||'', vr=document.getElementById('nVer'), w=document.getElementById('nVerWrap');
    if(!vr||!w) return;
    var isCn=(v==='Cloud');
    vr.disabled=!isCn;
    w.style.opacity=isCn? '':'0.45';
    if(!isCn) vr.value='';
  }
  if(nl) nl.addEventListener('change',function(){
    var v=this.value, c=document.getElementById('nChannel');
    syncCombine(); syncVer(); syncFee();
    if(!c) return;
    if(v==='S1'||v==='MDR_S1') c.value='에스원';
    else if(v==='DRM'||v==='DLP') c.value='유통';
  });
  syncCombine(); syncVer(); syncFee();
  // 파트너 «직접 입력…» 선택 시 입력칸 표시
  var np=document.getElementById('nPtn'), npe=document.getElementById('nPtnEtc');
  if(np) np.addEventListener('change',function(){
    var etc=(this.value==='__etc');
    npe.style.display=etc? '':'none';
    if(etc) npe.focus(); else npe.value='';
  });
  /* ── 같은 고객사 아래 «계약번호별 하위 등록» ──
     에스원은 같은 고객사라도 사업장마다 계약번호가 새로 나옵니다. 고객사를 고르면 그 고객사의 기존 계약을 보여주고,
     하나를 고르면 그 계약의 하위(부속)로 저장합니다 — 고객사 수·LIVE 에 두 번 세지 않고 금액만 합쳐집니다. */
  function nFillParents(){
    var sel=document.getElementById('nParent'), wrap=document.getElementById('nSubWrap'), cap=document.getElementById('nSubCap');
    if(!sel||!wrap) return;
    var name=(document.getElementById('nCust').value||'').trim();
    var cu=(ST.RAWX.customers||[]).filter(function(c){ return String(c.name||'').trim()===name; })[0];
    var list=cu? (ST.RAWX.contracts||[]).filter(function(c){ return c.customer_id===cu.id && !c.parent_contract_id; }) : [];
    list.sort(function(a,b){ return String(b.start_month||'').localeCompare(String(a.start_month||'')); });
    var keep=sel.value;
    sel.innerHTML=tpl`<option value="">— 독립 계약으로 등록 —</option>${rawHtml(list.map(function(c){
      return tpl`<option value="${rawHtml(c.id)}">#${rawHtml(c.id)} · ${lline(c.line||'')} · ${rawHtml(String(c.start_month||'').slice(0,7))}~${rawHtml(String(c.end_month||'').slice(0,7)||'무약정')}`+ tpl`${rawHtml(c.s1_no? ' · '+esc(c.s1_no):'')}${rawHtml(c.qty? ' · '+c.qty+'노드':'')}</option>`;
    }).join(''))}`;
    if(keep && sel.querySelector('option[value="'+keep+'"]')) sel.value=keep;
    wrap.style.display=list.length? '':'none';
    if(cap) cap.innerHTML=list.length
      ? tpl`이 고객사에 계약이 <b>${list.length}건</b> 있습니다. 같은 고객사인데 계약번호가 새로 나온 건이면 위에서 상위 계약을 고르세요 — 목록에서 ↳ 로 붙어 보이고, 고객사 수·LIVE 에는 한 번만 셉니다.`
      : '';
  }
  /* 에스원 계약번호를 넣으면 그 번호가 어디서 온 것인지 알려주고, 고객사가 비어 있으면 채워 줍니다 */
  function nS1Sync(){
    var el=document.getElementById('nS1No'); if(!el) return;
    var info=s1NoInfo(el.value), cap=document.getElementById('nSubCap');
    var cu=document.getElementById('nCust');
    var nm='';
    if(info && info.cust){
      nm=String(info.cust).replace(/\s*\(에스원\)\s*$/,'').trim();
      if(cu && !cu.value.trim()){ cu.value=nm; cu.dispatchEvent(new Event('input')); }
    }
    nFillParents();                                   /* 먼저 목록·안내를 새로 그린 뒤 */
    if(info && cap) cap.innerHTML=tpl`<b>${el.value.trim()}</b> — ${info.src}에 있는 번호`+ tpl`${rawHtml(nm? ' (고객사 '+esc(nm)+(info.biz? ' · 비즈포탈 '+info.biz:'')+')':'')}`+ tpl`${rawHtml(cap.innerHTML? tpl`<br>${rawHtml(cap.innerHTML)}` : '')}`;     /* 안내 문구 위에 덧붙입니다 */
  }
  var nCustEl=document.getElementById('nCust'), nS1El=document.getElementById('nS1No');
  if(nCustEl){ nCustEl.addEventListener('change', nFillParents); nCustEl.addEventListener('blur', nFillParents); }
  if(nS1El){ nS1El.addEventListener('change', nS1Sync); nS1El.addEventListener('blur', nS1Sync); }
  FORM_FN.nFillParents=nFillParents;

  function resetNewForm(){
    ['nCust','nBiller','nStart','nEnd','nMrr','nQty','nNote','nPtnEtc','nCsm','nBillingEtc','nFee','nSettle','nSectorEtc','nS1No'].forEach(function(i){
      var el=document.getElementById(i); if(el) el.value='';
    });
    var nbe=document.getElementById('nBillingEtc'); if(nbe) nbe.style.display='none';
    var d={nInd:'기업', nLine:'Cloud', nChannel:'일반', nLead:'', nCombine:'', nVer:'', nPtn:'지니언스(직접)', nType:'신규', nBilling:'', nSector:''};
    var nse=document.getElementById('nSectorEtc'); if(nse) nse.style.display='none';
    Object.keys(d).forEach(function(i){ var el=document.getElementById(i); if(el) el.value=d[i]; });
    if(npe) npe.style.display='none';
    var npar=document.getElementById('nParent'); if(npar) npar.value='';
    var nsw=document.getElementById('nSubWrap'); if(nsw) nsw.style.display='none';
    var nsc=document.getElementById('nSubCap'); if(nsc) nsc.innerHTML='';
    syncCombine(); syncVer(); syncFee();
    // 계약 찾기 상태도 초기화
    [{find:'cFind', pick:'cPick', store:PK_C},{find:'rFind', pick:'rPick', store:PK_R},{find:'fFind', pick:'fPick', store:PK_F},{find:'aFind', pick:'aPick', store:PK_A}].forEach(function(x){
      var f=document.getElementById(x.find); if(f) f.value='';
      var pk=document.getElementById(x.pick); if(pk) pk.innerHTML='';
      if(x.store) x.store.sel=null;
    });
    ['cMonth','cReason','rEnd','rMrr','rNote','fFrom','fMrr','aQty','aStart','aEnd','aMrr','aSerial','aNote'].forEach(function(i){
      var el=document.getElementById(i); if(el) el.value='';
    });
    var asel=document.getElementById('aSel'); if(asel){ asel.style.display='none'; asel.innerHTML=''; }
    ['nLivePrev','cLivePrev'].forEach(function(i){ var el=document.getElementById(i); if(el){ el.style.display='none'; el.innerHTML=''; } });
  }
  FORM_FN.resetNewForm=resetNewForm;
  /* LIVE 영향 미리보기 — 이 계약을 저장하면 LIVE 고객사가 어떻게 바뀌는지 한 줄로 (처음 쓰는 사람도 결과를 바로 알 수 있게) */
  function nLivePreview(){
    var box=document.getElementById('nLivePrev'); if(!box) return;
    var cust=($('#nCust').value||'').trim(), line=$('#nLine').value, type=$('#nType').value, s0=ymFromInput($('#nStart').value), e0=ymFromInput($('#nEnd').value);
    if(!cust){ box.style.display='none'; return; }
    box.style.display='';
    var lv=(ST.DATA&&ST.DATA.rows)? liveCalc(ST.DATA.nowIdx) : null;
    var ks=nmKeys(cust);
    var mine=lv? lv.rows.filter(function(x){ return nmKeys(x.cust).some(function(k){ return ks.indexOf(k)>=0; }); }) : [];
    var same=mine.filter(function(x){ return x.line===line; })[0], others=mine.filter(function(x){ return x.line!==line; });
    var h='🟢 <b>LIVE 영향</b> — ';
    if(type==='추가'){ h+='구분 «추가»는 LIVE·고객사 수에 세지 않습니다. 기존 계약에 붙는 추가 구매라면 <b>«＋ 추가» 탭</b>에서 원계약을 골라 등록하세요.'; }
    else if(s0==null){ h+='시작월을 넣어야 LIVE 로 잡힙니다 (비어 있으면 «계약 예정»).'; }
    else if(same){ h+=tpl`<b>${cust}</b>는 이미 ${lline(line)} LIVE 입니다 (${same.basis}). 이 계약을 저장하면 유효 계약이 2건이 됩니다 — <b>재약정·연장이면 «갱신» 탭</b>에서 기존 계약의 종료월을 늘리는 게 맞고, 사이트가 다른 별도 계약이면 그대로 저장하세요.`; }
    else if(others.length){ h+=tpl`<b>${cust}</b>는 이미 LIVE(${rawHtml(others.map(function(x){ return esc(lline(x.line)); }).join('·'))}) 인 회사 — ${rawHtml(s0>ST.DATA.nowIdx? mk(s0)+'부터 ':'')}<b>${lline(line)}</b> 제품이 추가됩니다 (회사 수는 그대로, 제품별 합 +1).`; }
    else { h+=tpl`<b>${cust}</b>는 ${rawHtml(s0>ST.DATA.nowIdx? tpl`<b>${mk(s0)}</b>부터 `:'지금부터 ')}<b>${lline(line)} LIVE 고객사</b>로 들어옵니다 (신규 고객 +1)${rawHtml(e0!=null? ' · '+mk(e0)+'까지 유효, 그 뒤 연장·해지 처리 필요':'')}.`; }
    var miss=[]; if(!(+$('#nQty').value)) miss.push('수량(노드)'); if(!($('#nCsm').value||'').trim()) miss.push('CSM');
    if(miss.length && type!=='추가') h+=tpl` <span style="color:var(--muted)">${rawHtml(miss.join('·'))} 이(가) 비어 있습니다 — LIVE 화면의 노드·CSM 열에 그대로 비어 보입니다.</span>`;
    box.innerHTML=h;
  }
  ['nCust','nLine','nType','nStart','nEnd','nQty','nCsm'].forEach(function(i){ var e=document.getElementById(i); if(e){ e.addEventListener('input',nLivePreview); e.addEventListener('change',nLivePreview); } });
  FORM_FN.nLivePreview=nLivePreview;
  function cLivePreview(){
    var box=document.getElementById('cLivePrev'); if(!box) return;
    var r=PK_C.sel, m0=ymFromInput($('#cMonth').value);
    if(!r){ box.style.display='none'; return; }
    box.style.display='';
    var lv=(ST.DATA&&ST.DATA.rows)? liveCalc(ST.DATA.nowIdx) : null;
    var ks=nmKeys(r.cust), mine=lv? lv.rows.filter(function(x){ return nmKeys(x.cust).some(function(k){ return ks.indexOf(k)>=0; }); }) : [];
    var same=mine.filter(function(x){ return x.line===r.line; })[0], others=mine.filter(function(x){ return x.line!==r.line; });
    var h='🟢 <b>LIVE 영향</b> — ';
    if(r.parent) h+='부속 계약(추가 구매)이라 LIVE·고객사 수에는 변화가 없고 MRR 만 줄어듭니다.';
    else if(!same) h+='이 계약은 지금 LIVE 로 잡혀 있지 않습니다 — 해지 처리해도 LIVE 수는 그대로입니다.';
    else { h+=tpl`<b>${r.cust}</b> ${lline(r.line)} 은 ${rawHtml(m0!=null? tpl`<b>${mk(m0)}</b>부터 `:'해지월부터 ')}LIVE 에서 빠집니다${rawHtml(m0!=null? tpl` (매출은 ${mk(m0)}까지 인식)`:'')}`+ tpl`${rawHtml(same.n>1? ' — 같은 제품의 다른 유효 계약이 '+(same.n-1)+'건 남아 있어 제품 LIVE 는 유지됩니다' : others.length? ' (다른 제품 '+others.map(function(x){ return esc(lline(x.line)); }).join('·')+' 이 남아 회사로는 LIVE 유지 · 제품별 합 −1)' : ' (회사 수 −1 · 해지율에 «해지»로 집계)')}.`; }
    box.innerHTML=h;
  }
  FORM_FN.cLivePreview=cLivePreview;
  var cm=document.getElementById('cMonth'); if(cm){ cm.addEventListener('input',cLivePreview); cm.addEventListener('change',cLivePreview); }
  $('#btnEdit').onclick=function(){
    // 자동완성 목록 채우기
    var dl=$('#dlCust'); dl.innerHTML='';
    SB_RAW.customers.forEach(function(c){ var o=document.createElement('option'); o.value=c.name; dl.appendChild(o); });
    fillSectorSel();
    var ds=$('#dlS1No'); if(ds){ ds.innerHTML=''; s1NoOpts().forEach(function(v){ var o=document.createElement('option'); o.value=v;
      var inf=s1NoInfo(v); if(inf&&inf.cust) o.label=String(inf.cust).replace(/\s*\(에스원\)\s*$/,''); ds.appendChild(o); }); }
    var dr=$('#dlReason'); dr.innerHTML='';
    var seen={};
    ST.DATA.rows.forEach(function(r){ if(r.churn&&!seen[r.churn]){seen[r.churn]=1; var o=document.createElement('option'); o.value=r.churn; dr.appendChild(o);} });
    msg('eMsg','');
    resetNewForm();                       // 열 때마다 모든 칸 초기화 (직전 입력 잔상 제거)
    openOvl('ovlEdit');
  };
  var TAB_PANEL={new:'New', add:'Add', churn:'Churn', renew:'Renew', fix:'Fix', rename:'Rename'};
  $('#eTabs').querySelectorAll('button').forEach(function(b){
    b.onclick=function(){
      CUR_TAB=this.dataset.t;
      $('#eTabs').querySelectorAll('button').forEach(function(x){x.setAttribute('aria-pressed', x===b?'true':'false');});
      ['New','Add','Churn','Renew','Fix','Rename'].forEach(function(n){
        $('#tab'+n).style.display = (n===TAB_PANEL[CUR_TAB])?'':'none';
      });
      var nt=document.getElementById('nType');
      if(CUR_TAB==='new' && nt) nt.value='신규';
      if(CUR_TAB==='add' && nt) nt.value='추가';
      if(CUR_TAB==='rename') renameFillNames();
      $('#eGo').textContent = CUR_TAB==='rename'? '사명 변경 실행' : '저장';
      msg('eMsg','');
    };
  });
  /* ㊿+157 금액 칸(천원) 아래 실시간 환산 */
  ['nMrr','aMrr','rMrr','fMrr'].forEach(function(i){ amtHint(document.getElementById(i), null, true); }); amtHint(document.getElementById('nFee'), null, false);
  setupPick('cFind','cPick',PK_C);
  setupPick('rFind','rPick',PK_R);
  setupPick('fFind','fPick',PK_F);
  setupPick('aFind','aPick',PK_A);
  $('#eGo').onclick=saveEdit;
  setupAuth();
}

export function makeDemo(){
  var lines=[{label:'Cloud',color:1},{label:'S1',color:2},{label:'MDR',color:3},{label:'PNS',color:4},{label:'MDR_S1',color:5}];
  var inds=['기업','공공'];
  var partners=['다원티에스','글로웰시스템','엘림넷','카카오엔터프라이즈','에스원(S1)','LG U+','금호타이어','지니언스'];
  var sts=['신규','재약정','추가','서비스 종료','해지'];
  var reasons=['지원사업종료','미연장','고객변심/고객사정','비용이슈','폐업','경영악화'];
  var M2=(2029-2020)*12+12-5, rows=[], seed=7;
  function rnd(){ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; }
  for(var i=0;i<420;i++){
    var ln=lines[Math.floor(rnd()*(rnd()<.6?1:lines.length))];
    var start=Math.floor(rnd()*70), term=[12,24,36,60][Math.floor(rnd()*4)];
    var mrr=Math.round((50+rnd()*900)*1000/1000)*1000;
    var end=Math.min(M2-1,start+term-1);
    var st=sts[Math.floor(rnd()*sts.length)];
    rows.push({line:ln.label, ind:inds[rnd()<.85?0:1], cust:'샘플고객'+(i+1), csm:'',
      partner:partners[Math.floor(rnd()*partners.length)], ctype: rnd()<.7?'신규':'재약정',
      status:st, note:'', churn: st==='해지'? reasons[Math.floor(rnd()*reasons.length)]:'',
      saleType:'일반 판매', ver:'', startIdx:start, endIdx:end, term:term,
      qty:Math.floor(rnd()*1000), total:mrr*term, billing:'월납입', mrr:mrr,
      sum:mrr*(end-start+1), segs:[[start,end,mrr]]});
  }
  var keys=[]; for(var j=0;j<M2;j++){ var t=(2020*12+5)+j; keys.push(Math.floor(t/12)+'-'+String(t%12+1).padStart(2,'0')); }
  var now=new Date();
  return {generatedAt:'데모', todayKey:'', nowIdx:(now.getFullYear()-2020)*12+(now.getMonth()+1-6),
    monthKeys:keys, lines:lines, rows:rows, warnings:[], sheetUrl:''};
}


