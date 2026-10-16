/* ===== help.js — ㊿+206 포탈 사용 설명서 · 운영자 매뉴얼 (처음 열 때 받음 · js/lazy.js 'help') =====
   · 사용자: «문서 · 사용 안내 개선 — 포탈 안 사용 설명서(메뉴별 · 검색 · 화면에서 바로) + 운영자 매뉴얼(슈퍼 관리자)»
   · 내용(HELP)과 찾기 규칙은 js/helpdata.js (다른 파일을 부르지 않는 순수 자료 — tests/unit.mjs · check.mjs 가 직접 읽어 검사)
   · 여기는 화면: 권한별로 거르기 · 창 · 목록 · 본문 · «이 화면 열기» · «AI 에게 더 묻기»
   · 화면: 더보기(⋯) › «사용 설명서» · 표 위 «도움말» · 포탈 AI 가 «어떻게 해?»를 물으면 맞는 항목을 함께 받아 답함(ai.js helpForQ)
   · 내용 규칙(helpdata.js): 버튼 · 메뉴 이름은 화면에 보이는 그대로 · 키 · 비밀번호 · 토큰 값은 절대 넣지 않음(이름만) */
import { ST } from './state.js';
import { rawHtml, tpl } from './core.js';
import { navMenu } from './grid.js';
import { closeOvl, openOvl } from './edit.js';
import { cmdAskHit, EQUIP_VIEWS, toast } from './shell.js';
import { HELP, HELP_GROUPS, HELP_VIEW_MAP, helpForQIn, helpSearchIn } from './helpdata.js';

export var HELPS={q:'', sel:''};
export function helpCan(h){ if(ST.IS_EQUIP && !(h.id==='start' || h.id==='account' || (h.v && EQUIP_VIEWS[h.v]))) return false; if(!h.role) return true; if(h.role==='super') return !!ST.IS_SUPER; return !!(ST.IS_SUPER || ST.MY_ROLE==='admin'); }
export function helpList(){ return HELP.filter(helpCan); }
export function helpById(id){ return HELP.filter(function(h){ return h.id===id; })[0]||null; }
/** 화면 키 → 설명서 항목 (사업 영역 화면들은 «사업 영역» · 인바운드 통계는 «인바운드») */
export function helpForView(v){ var id=HELP_VIEW_MAP[v]||v, h=helpById(id); return h && helpCan(h)? h : helpById('start'); }
/** 찾기 · AI 용 — 지금 계정이 볼 수 있는 항목에서만(js/helpdata.js 의 같은 규칙) */
export function helpSearch(q){ return helpSearchIn(helpList(), q); }
export function helpForQ(q){ return helpForQIn(helpList(), q); }
export function helpItemHtml(h){
  var see=(h.see||[]).map(helpById).filter(function(x){ return x && helpCan(x); });
  return tpl`<article class="hp-doc" aria-labelledby="hpT"><h3 id="hpT">${h.t}</h3><p class="hp-what">${h.what}</p>`+
    tpl`${rawHtml(h.v || !ST.IS_EQUIP? tpl`<p class="hp-acts">${rawHtml(h.v? tpl`<button type="button" class="pill pri" data-hpgo="${h.v}">이 화면 열기</button>` : '')}${rawHtml(ST.IS_EQUIP? '' : tpl`<button type="button" class="pill ghost" data-hpai="${h.id}">AI 에게 더 묻기</button>`)}</p>` : '')}`+
    tpl`${rawHtml((h.tasks||[]).map(function(x){ return tpl`<section class="hp-task"><h4>${x.t}</h4><ol>${rawHtml(x.s.map(function(s){ return tpl`<li>${s}</li>`; }).join(''))}</ol></section>`; }).join(''))}`+
    tpl`${rawHtml((h.faq||[]).length? tpl`<section class="hp-faq"><h4>자주 묻는 것</h4>${rawHtml(h.faq.map(function(f){ return tpl`<details><summary>${f[0]}</summary><p>${f[1]}</p></details>`; }).join(''))}</section>` : '')}`+
    tpl`${rawHtml(see.length? tpl`<p class="hp-see">함께 보기: ${rawHtml(see.map(function(x){ return tpl`<button type="button" class="lnk" data-hpid="${x.id}">${x.t}</button>`; }).join(' · '))}</p>` : '')}</article>`;
}
export function helpNavHtml(){
  var L=helpList(), q=HELPS.q.trim(), hits=q? helpSearch(q) : null;
  if(hits) return hits.length? tpl`<p class="mini hp-cnt">«${q}» ${String(hits.length)}개</p><ul class="hp-ul">${rawHtml(hits.map(function(h){ return tpl`<li><button type="button" data-hpid="${h.id}" aria-current="${h.id===HELPS.sel? 'true' : 'false'}">${h.t}</button></li>`; }).join(''))}</ul>` : tpl`<p class="mini hp-cnt">«${q}»에 맞는 항목이 없습니다 — 다른 낱말로 찾거나 «AI 에게 묻기»</p>`;
  return HELP_GROUPS.map(function(g){ var its=L.filter(function(h){ return h.g===g[0]; }); if(!its.length) return '';
    return tpl`<div class="hp-g">${g[1]}</div><ul class="hp-ul">${rawHtml(its.map(function(h){ return tpl`<li><button type="button" data-hpid="${h.id}" aria-current="${h.id===HELPS.sel? 'true' : 'false'}">${h.t}</button></li>`; }).join(''))}</ul>`; }).join('');
}
export function helpPaint(){
  var nav=document.getElementById('hpNav'), body=document.getElementById('hpBody'); if(!nav || !body) return;
  nav.innerHTML=helpNavHtml(); var h=helpById(HELPS.sel)||helpById('start'); body.innerHTML=helpItemHtml(h); helpBind();
  var cur=nav.querySelector('[aria-current="true"]'); if(cur) try{ cur.scrollIntoView({block:'nearest'}); }catch(e){}   /* 목록이 길어도 지금 항목이 보이게(폰은 목록 칸이 낮음) */
}
export function helpBind(){
  var ov=document.getElementById('ovlHelp'); if(!ov) return;
  ov.querySelectorAll('[data-hpid]').forEach(function(b){ /** @type {any} */(b).onclick=function(){ HELPS.sel=/** @type {any} */(b).dataset.hpid; helpPaint(); var t=document.getElementById('hpT'); if(t) try{ t.setAttribute('tabindex','-1'); t.focus(); }catch(e){} var bd=document.getElementById('hpBody'); if(bd) bd.scrollTop=0; }; });
  ov.querySelectorAll('[data-hpgo]').forEach(function(b){ /** @type {any} */(b).onclick=function(){ closeOvl('ovlHelp'); try{ navMenu(/** @type {any} */(b).dataset.hpgo); }catch(e){} }; });
  ov.querySelectorAll('[data-hpai]').forEach(function(b){ /** @type {any} */(b).onclick=function(){ var h=helpById(/** @type {any} */(b).dataset.hpai); if(!h) return; closeOvl('ovlHelp');
    var q=h.v && h.g!=='ops'? '포탈의 «'+h.t+'» 화면은 어떻게 쓰나요? 주요 기능과 주의할 점을 짧게 알려줘' : '포탈에서 «'+h.t+'»은 어떻게 하나요? 순서와 주의할 점을 짧게 알려줘';
    var hit=cmdAskHit(q); if(hit && hit.go) hit.go(); else toast('AI 를 쓸 수 없습니다','조회 전용 장비 계정이거나 AI 가 꺼져 있습니다','warn'); }; });
}
/** 설명서 열기 — id 또는 화면 키(없으면 지금 화면) */
export function helpOpen(idOrView){
  var h=idOrView? (helpById(idOrView) && helpCan(/** @type {any} */(helpById(idOrView)))? helpById(idOrView) : helpForView(idOrView)) : helpForView(ST.CUR_VIEW);
  HELPS.sel=(h||helpById('start')).id; HELPS.q='';
  var ov=document.getElementById('ovlHelp');
  if(!ov){ ov=document.createElement('div'); ov.className='ovl'; ov.id='ovlHelp';
    ov.innerHTML=tpl`<div class="modal hp-modal" role="dialog" aria-modal="true" aria-labelledby="hpTitle"><div class="hp-head"><h2 id="hpTitle">사용 설명서</h2>`+
      tpl`<input type="search" id="hpQ" placeholder="찾기 — 예: 만기 처리 · 시리얼 · 2단계 인증" aria-label="설명서 찾기" autocomplete="off"><button type="button" class="pill ghost" data-close="ovlHelp">닫기</button></div>`+
      tpl`<div class="hp-wrap"><nav class="hp-nav" id="hpNav" aria-label="설명서 목록"></nav><div class="hp-body" id="hpBody" tabindex="-1"></div></div></div>`;
    document.body.appendChild(ov);
    var qi=/** @type {any} */(ov.querySelector('#hpQ')); qi.oninput=function(){ HELPS.q=String(qi.value||''); var nav=document.getElementById('hpNav'); if(nav){ nav.innerHTML=helpNavHtml(); helpBind(); } };
    qi.onkeydown=function(/** @type {any} */ e){ if(e.key==='Enter'){ var f=/** @type {any} */(document.querySelector('#hpNav [data-hpid]')); if(f) f.click(); } };
  }
  var qi2=/** @type {any} */(ov.querySelector('#hpQ')); if(qi2) qi2.value='';
  helpPaint(); openOvl('ovlHelp');
  /* 연 뒤(보일 때) 지금 항목까지 목록을 내림 · 초점은 찾기 칸 — 손가락 화면(폰)은 자판이 화면을 가리지 않게 제목에 */
  setTimeout(function(){ var cur=document.querySelector('#hpNav [aria-current="true"]'); if(cur) try{ cur.scrollIntoView({block:'nearest'}); }catch(e){}
    var touch=false; try{ touch=matchMedia('(pointer:coarse)').matches; }catch(e){}
    var f=document.getElementById(touch? 'hpT' : 'hpQ'); if(f) try{ if(touch) f.setAttribute('tabindex','-1'); f.focus(); }catch(e){} }, 30);
}
