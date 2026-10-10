/* ===== home.js — ㊿+171 AI 중심 홈 · 검색·질문 하나로 =====
   ES 모듈 — 다른 파일의 이름은 아래 import 로만 씀 · 이 파일의 최상위 var/function 은 전부 export · 즉시 실행 문장은 js/init.js 의 start() 에
   · 홈(지니언스): ① AI 검색·질문 ② 핵심 현황 3칸(당월 매출 · LIVE 고객 · 재약정 대응 필요) ③ 지금 챙길 일 3줄 ④ 사업 분석 · 전체 할 일 · 최근 작업
   · 위쪽 «검색»(Ctrl+K): 홈에서는 가운데 입력칸 · 다른 화면에서는 같은 검색·질문 창(보던 화면 · 조건을 문맥으로 함께)
   · 추천 질문 4개는 포탈이 직접 계산(같은 조건의 화면 숫자와 같음 · AI 가 안 돼도 답함) · 나머지 질문은 기존 ask 그대로
   · 답 = 핵심 → 근거 → 원본 보기 → 다음 행동 + 기준(기간 · 단위 · 갱신 · 조건) · 답의 버튼은 화면만 엶(저장·발송은 그 화면에서 확인한 뒤에만) */
import { ST } from './state.js';
import { esc, isGN, lline, mk, navText, rawHtml, STATE, tpl, won } from './core.js';
import { ccAnalysisOpen, ccUnsnooze, ico, toast, visBtn } from './shell.js';
import { expNote, idxs, kpiOpen, monthlyTotal, renderAll, renewNeedScan } from './dash.js';
import { ask, closeAnswer, isAsking } from './ai.js';
import { liveData, openRenewList } from './analysis.js';
import { DV, gridGoPre, NAV, navDepth, navMenu, oiOpen, qvCfg, qvDefs, qvSave, switchView, wvCur } from './grid.js';
import { GRIDS } from './grids.js';
import { c360Match, fkNorm, fkSources, freqTop, navSub, openCust360, recentKey, viewLabel } from './tools.js';
import { loadInbound } from './inbound.js';
import { closeOvl, openOvl } from './edit.js';

/** 홈 상태 — mode: ''(AI 홈) · biz(사업 분석) · todo(전체 할 일) · recent(최근 작업) @type {any} */
export var HOME={mode:'', rows:[], zeros:[], snz:0, thread:[], last:null, inp:'q', ctx:null, ctxOn:true, ovView:null, open:{}, bound:0};
export var HOME_CHIPS=['이번 달 매출 변화','재약정 대응할 고객','내가 처리할 일','고객사 현황 찾기'];
export var HOME_MODES={biz:'사업 분석', todo:'전체 할 일', recent:'최근 작업'};
export function homeOn(){ return isGN() && !ST.IS_EQUIP; }

/* ------------------------------------------------------------------
   ① AI 검색·질문 (홈 가운데) — 제목 · 입력칸 · 추천 질문 4개
   ------------------------------------------------------------------ */
export function homeSetup(){
  if(!homeOn()) return;
  var h=document.getElementById('askH'); if(h) h.textContent='오늘 어떤 업무를 도와드릴까요?';
  var q=/** @type {any} */(document.getElementById('q'));
  if(q){ q.placeholder=window.innerWidth<520? '고객사 · 매출 · 할 일 물어보기' : '고객사 찾기, 매출 분석, 처리할 일을 물어보세요.'; q.setAttribute('aria-label','검색하거나 질문하기 — 고객사 · 화면 · 시리얼 찾기 · 매출 · 할 일 질문'); }
  var cb=document.getElementById('chips');
  if(cb){ cb.innerHTML=''; cb.classList.remove('all'); cb.setAttribute('role','group'); cb.setAttribute('aria-label','추천 질문');
    HOME_CHIPS.forEach(function(s){ var c=document.createElement('button'); c.type='button'; c.className='chip'; c.textContent=s;
      c.onclick=function(){ if(s==='고객사 현황 찾기'){ homeFindCust(); return; } HOME.inp='q'; HOME.ctx=null; ask(s); }; cb.appendChild(c); }); }
  if(q && !HOME.bound){ HOME.bound=1; srchBind(q, /** @type {any} */(document.getElementById('sug')), 'home'); }
  var cmd=document.getElementById('cmdBar');
  if(cmd){ cmd.innerHTML=tpl`${rawHtml(ico('search',16))}<span class="ph">검색</span><kbd>Ctrl K</kbd>`; cmd.setAttribute('aria-label','검색·질문 (Ctrl+K)'); cmd.title='검색·질문 — 고객사 · 화면 · 시리얼 찾기와 AI 질문 (Ctrl+K)'; }
}
/** «고객사 현황 찾기» — 입력칸에 바로 고객사 이름을 적도록(최근 본 고객사 · 월 매출 상위를 먼저 보여 줌) */
export function homeFindCust(){
  var q=/** @type {any} */(document.getElementById('q')); if(!q) return;
  q.value=''; HOME.custHint=1; q.focus(); srchRender(q, /** @type {any} */(document.getElementById('sug')), 'home');
}
/** 위쪽 «검색» 버튼 · Ctrl+K — 홈(기본)은 가운데 입력칸으로, 그 밖은 검색·질문 창 */
export function homeSearchOpen(){
  if(!ST.SB_TOKEN || !ST.DATA) return;
  if(homeOn() && ST.CUR_VIEW==='dash' && !HOME.mode){
    var q=/** @type {any} */(document.getElementById('q')); if(!q) return;
    try{ window.scrollTo({top:0, behavior:'smooth'}); }catch(e){}
    q.focus(); srchRender(q, /** @type {any} */(document.getElementById('sug')), 'home'); return;
  }
  openFindX();
}

/* ------------------------------------------------------------------
   검색 — 정확히 같은 고객사 · 시리얼 · 화면을 먼저, 그다음 비슷한 것, 맨 끝에 «질문하기»
   ------------------------------------------------------------------ */
/** 화면(메뉴) 찾기 — 이름이 같으면 exact */
export function srchMenus(q){
  var qn=fkNorm(q), out=[]; if(!qn) return out;
  document.querySelectorAll('#side button[data-v]').forEach(function(b){
    var el=/** @type {any} */(b), v=el.dataset.v; if(!visBtn(el) && v!=='dash') return; if(v==='account') return;
    var sub=navSub(el), nm=navText(el), t=(sub? sub+' · ':'')+nm, n1=fkNorm(nm), n2=fkNorm(t);
    if(n2.indexOf(qn)<0) return;
    out.push({t:'화면', nm:t, sb:'화면 열기', exact:(n1===qn || n2===qn), go:(function(v2){ return function(){ navMenu(v2); }; })(v), k:'menu'});
  });
  out.sort(function(a,b){ return (b.exact?1:0)-(a.exact?1:0); });
  return out.slice(0,4);
}
/** 검색 결과 — [{t, nm, sb, go, exact, k}] · 순서: 정확히 같은 것 → 고객사(고객 360) → 화면 → 개별 기록 → 질문하기 */
export function srchHits(q){
  var qn=fkNorm(q), hits=[]; if(!qn) return hits;
  var menus=srchMenus(q), src=fkSources(), cust={}, exact=[], recs=[], seen={};
  src.forEach(function(s){ if(s.cust && fkNorm(s.cust).indexOf(qn)>=0){ var c=cust[s.cust]=cust[s.cust]||{n:0, ex:fkNorm(s.cust)===qn}; c.n++; } });
  Object.keys(cust).forEach(function(c){ if(cust[c].ex) exact.push({t:'고객 360', nm:c, sb:'계약 · LIVE · OI · 장비 한눈에', go:function(){ openCust360(c); }, exact:true, k:'c360'}); });
  src.forEach(function(s){ if(s.t==='장비' && fkNorm(s.nm)===qn) exact.push({t:'장비 시리얼', nm:s.nm, sb:s.sb, go:s.go, exact:true, k:'sn'}); });
  menus.filter(function(m){ return m.exact; }).forEach(function(m){ exact.push(m); });
  hits=hits.concat(exact);
  if(qn.length>=2){
    Object.keys(cust).filter(function(c){ return !cust[c].ex; }).sort(function(a,b){ return fkNorm(a).indexOf(qn)-fkNorm(b).indexOf(qn) || a.length-b.length; }).slice(0,4)
      .forEach(function(c){ hits.push({t:'고객 360', nm:c, sb:'계약 · LIVE · OI · 장비 한눈에', go:function(){ openCust360(c); }, k:'c360'}); });
  }
  menus.filter(function(m){ return !m.exact; }).slice(0,3).forEach(function(m){ hits.push(m); });
  var shown={}; hits.forEach(function(h){ if(h.k==='c360') shown[h.nm]=1; });
  if(qn.length>=2) src.forEach(function(s){
    if(recs.length>=5) return; if(s.k==='sn') return;
    if(s.cust && shown[s.cust] && (s.t==='계약' || s.t==='LIVE' || s.t==='임대신청')) return;   /* 고객 360 에 이미 있는 고객사의 계약 · LIVE 줄은 빼고(고객 360 안에 다 있음) */
    if(fkNorm(s.nm).indexOf(qn)<0 && fkNorm(s.sb).indexOf(qn)<0) return;
    if(s.t==='장비' && fkNorm(s.nm)===qn) return;
    var key=s.t+'|'+s.nm+'|'+s.sb; if(seen[key]) return; seen[key]=1; recs.push({t:s.t, nm:s.nm, sb:s.sb, go:s.go, k:'rec'});
  });
  hits=hits.concat(recs);
  if(String(q).trim().length>=2 && !ST.IS_EQUIP) hits.push({t:'질문', nm:String(q).trim(), sb:'매출 · 고객 · 계약 · 할 일 데이터로 답합니다', k:'ask'});
  return hits;
}
/** 입력이 비어 있을 때 — 최근 질문 · 최근 본 고객사 · 자주 쓰는 화면(예전 펼침 메뉴 맨 아래 «자주 쓰는 화면»을 여기 한 곳으로) */
export function srchEmpty(where){
  var out=[], seen={};
  if(HOME.custHint){
    rcCusts().slice(0,4).forEach(function(c){ if(seen['c'+c]) return; seen['c'+c]=1; out.push({t:'최근 본 고객사', nm:c, sb:'고객 360', go:function(){ openCust360(c); }, k:'c360', grp:'고객사 — 이름을 적으면 바로 찾습니다'}); });
    topCusts(6).forEach(function(c){ if(seen['c'+c.c] || out.length>=7) return; seen['c'+c.c]=1; out.push({t:'월 매출 상위', nm:c.c, sb:won(c.v)+'천원 · 고객 360', go:function(){ openCust360(c.c); }, k:'c360', grp:'고객사 — 이름을 적으면 바로 찾습니다'}); });
    return out;
  }
  (ST.HIST||[]).slice().reverse().forEach(function(h){ var t=String(h.q||'').split('\n')[0]; if(!t || seen['q'+t] || out.length>=3) return; seen['q'+t]=1; out.push({t:'질문', nm:t, sb:'다시 물어보기', k:'ask', grp:'최근 질문'}); });
  rcCusts().slice(0,3).forEach(function(c){ out.push({t:'고객 360', nm:c, sb:'최근 본 고객사', go:function(){ openCust360(c); }, k:'c360', grp:'최근 본 고객사'}); });
  var rec=[]; try{ rec=JSON.parse(localStorage.getItem(recentKey())||'[]')||[]; }catch(e){}
  var fq=freqTop(5), vs=[]; fq.concat(rec).forEach(function(v){ if(vs.indexOf(v)<0 && v!==ST.CUR_VIEW && document.querySelector('#side button[data-v="'+v+'"]')) vs.push(v); });
  vs.slice(0,5).forEach(function(v){ out.push({t:'화면', nm:viewLabel(v), sb:'자주 · 최근 연 화면', go:function(){ navMenu(v); }, k:'menu', grp:'자주 쓰는 화면'}); });
  if(where==='home' && !out.length) return [];
  return out;
}
/** 최근 연 고객 360 (이 브라우저 · 계정별) */
export function rcKey(){ return 'svc_rc360_'+(ST.AUTH_USER||'anon'); }
export function rcCusts(){ try{ return JSON.parse(localStorage.getItem(rcKey())||'[]')||[]; }catch(e){ return []; } }
export function rcPush(c){ if(!c) return; try{ var a=rcCusts().filter(function(x){ return x!==c; }); a.unshift(c); localStorage.setItem(rcKey(), JSON.stringify(a.slice(0,8))); }catch(e){} }
/** 기준월 인식 금액이 큰 고객사 n곳 (홈 필터 그대로) */
export function topCusts(n){
  if(!ST.DATA) return []; var b=STATE.base, m={};
  idxs().forEach(function(k){ var v=ST.MAT[k][b]||0; if(!v) return; var c=ST.DATA.rows[k].cust; m[c]=(m[c]||0)+v; });
  return Object.keys(m).map(function(c){ return {c:c, v:m[c]}; }).sort(function(a,b){ return b.v-a.v; }).slice(0, n||5);
}
/** 입력칸 + 결과 목록 묶기 — where: home(홈 가운데 · 아래로 펼침) / ovl(검색·질문 창 · 창 안에 바로) */
export function srchBind(inp, box, where){
  if(!inp || !box) return;
  box.setAttribute('role','listbox'); box.setAttribute('aria-label','검색 결과');
  inp.setAttribute('role','combobox'); inp.setAttribute('aria-autocomplete','list'); inp.setAttribute('aria-controls', box.id); inp.setAttribute('aria-expanded','false');
  inp.addEventListener('input', function(){ HOME.custHint=0; clearTimeout(box._t); box._t=setTimeout(function(){ srchRender(inp, box, where); }, 80); });
  inp.addEventListener('focus', function(){ if(where==='home' && !inp.value.trim() && !HOME.custHint) return; srchRender(inp, box, where); });
  if(where==='home') inp.addEventListener('blur', function(){ setTimeout(function(){ if(document.activeElement!==inp) srchClose(inp, box); }, 160); });
  inp.addEventListener('keydown', function(e){
    if(e.isComposing || e.keyCode===229) return;
    var L=box._hits||[], on=!box.hidden && L.length;
    if(e.key==='ArrowDown' && on){ e.preventDefault(); srchSel(inp, box, (box._sel+1)%L.length); }
    else if(e.key==='ArrowUp' && on){ e.preventDefault(); srchSel(inp, box, (box._sel-1+L.length)%L.length); }
    else if(e.key==='Escape'){ if(on && where==='home'){ e.preventDefault(); e.stopPropagation(); srchClose(inp, box); } }
    else if(e.key==='Enter'){ e.preventDefault(); e.stopPropagation();
      var v=inp.value.trim();
      /* 입력이 목록보다 앞서 있으면(빨리 치고 Enter) 지금 글자로 다시 고름 */
      if(v && box._q!==v){ clearTimeout(box._t); srchRender(inp, box, where); L=box._hits||[]; on=!box.hidden && L.length; }
      if(on && box._sel>=0) srchRun(L[box._sel], inp, box, where);
      else if(v) srchRun({k:'ask', nm:v}, inp, box, where); }
  }, true);
}
export function srchClose(inp, box){ box.hidden=true; box.classList.remove('on'); box.innerHTML=''; box._hits=[]; box._sel=-1; inp.setAttribute('aria-expanded','false'); inp.removeAttribute('aria-activedescendant'); }
export function srchSel(inp, box, i){
  box._sel=i; box.querySelectorAll('.sr-it').forEach(function(x, j){ x.setAttribute('aria-selected', j===i? 'true':'false'); if(j===i) try{ x.scrollIntoView({block:'nearest'}); }catch(e){} });
  if(i>=0) inp.setAttribute('aria-activedescendant', box.id+'_'+i); else inp.removeAttribute('aria-activedescendant');
}
export function srchRender(inp, box, where){
  clearTimeout(box._t);
  var v=inp.value.trim(), hits=v? srchHits(v) : srchEmpty(where); box._q=v;
  if(!hits.length){ srchClose(inp, box); if(where==='ovl' && v){ box.hidden=false; box.innerHTML='<p class="cap sr-none">찾는 항목이 없습니다 — Enter 로 질문하세요</p>'; } return; }
  /* 기본 선택(Enter 대상) = 정확히 같은 항목 · 없으면 «질문하기»(입력이 있을 때) · 빈 입력이면 선택 없음 */
  var sel=-1; if(v){ for(var i=0;i<hits.length;i++){ if(hits[i].exact){ sel=i; break; } } if(sel<0) for(i=0;i<hits.length;i++){ if(hits[i].k==='ask'){ sel=i; break; } } }
  var lastG='';
  box.innerHTML=hits.map(function(h, i){
    var g=h.grp && h.grp!==lastG? tpl`<div class="sr-g" role="presentation">${h.grp}</div>` : ''; if(h.grp) lastG=h.grp;
    var tp=h.k==='ask'? '질문' : h.t;
    return g+tpl`<div class="sr-it k-${h.k||'rec'}${h.exact?' ex':''}" role="option" id="${box.id}_${String(i)}" data-i="${String(i)}" aria-selected="false"><span class="tp">${tp}</span><span class="nm">${h.k==='ask'? '«'+h.nm+'» 물어보기' : h.nm||''}</span><span class="sb">${h.exact? '일치 · ' : ''}${h.sb||''}</span>${rawHtml(h.exact||h.k==='ask'? '<kbd class="ent" aria-hidden="true">Enter</kbd>':'')}</div>`; }).join('');
  box._hits=hits; box.hidden=false; box.classList.add('on'); inp.setAttribute('aria-expanded','true');
  srchSel(inp, box, sel);
  box.querySelectorAll('.sr-it').forEach(function(row){
    row.onmousedown=function(e){ e.preventDefault(); };
    row.onclick=function(){ srchRun(hits[+row.dataset.i], inp, box, where); }; });
}
export function srchRun(h, inp, box, where){
  if(!h) return;
  clearTimeout(box._t); srchClose(inp, box); HOME.custHint=0;
  if(h.k==='ask'){ inp.value='';
    if(where==='ovl'){ homeAskOvl(h.nm); return; }
    HOME.inp='q'; HOME.ctx=null; ask(h.nm); return; }
  if(where==='ovl') closeOvl('ovlFind');
  inp.value='';
  try{ h.go(); }catch(e){ console.warn('search go', e); }
}

/* ------------------------------------------------------------------
   검색·질문 창 (다른 화면) — 보던 화면 · 보기 · 검색 · 조건을 문맥으로
   ------------------------------------------------------------------ */
/** 지금 보던 화면의 문맥 — {v, label, parts:[…], text} */
export function srchCtx(){
  var v=ST.CUR_VIEW||'dash', parts=[], label=v==='dash'? '홈' : viewLabel(v);
  if(v==='dash'){ if(HOME.mode) label='홈 › '+HOME_MODES[HOME.mode]; if(HOME.mode==='biz'){ parts.push('기준월 '+mk(STATE.base)); var hc=homeCond(); if(!/필터 없음/.test(hc)) parts.push(hc); } }
  else if(GRIDS[v]){
    var w=null; try{ w=wvCur(v); }catch(e){} if(w) parts.push('보기 «'+w[0]+'»');
    var s=/** @type {any} */(document.getElementById('dvSearch')); if(s && s.value.trim()) parts.push('검색 «'+s.value.trim()+'»');
    if(DV.pre && DV.pre.label) parts.push('조건 «'+String(DV.pre.label).split(' — ')[0]+'»');
    var fk=Object.keys(DV.filters||{}).filter(function(k){ var x=DV.filters[k]; return x!=null && x!=='' && !(Array.isArray(x) && !x.length); });
    if(fk.length) parts.push('열 필터 '+fk.length+'개');
  }
  return {v:v, label:label, parts:parts, text:'(참고 — 사용자가 보던 화면: '+label+(parts.length? ' · '+parts.join(' · ') : '')+')'};
}
export function openFindX(){
  if(!ST.SB_TOKEN || !ST.DATA) return;
  if(ST.RAWX.inbound===undefined && !ST.IS_EQUIP) try{ loadInbound(function(){}); }catch(e){}
  var inp=/** @type {any} */(document.getElementById('fkInput')), out=/** @type {any} */(document.getElementById('fkOut')), host=document.getElementById('fkAns'); if(!inp || !out) return;
  if(!inp._sb){ inp._sb=1; srchBind(inp, out, 'ovl');
    var ab=document.getElementById('fkAsk'); if(ab) ab.onclick=function(){ if(isAsking()){ try{ closeAnswer('', true); }catch(e){} return; } var v=inp.value.trim(); if(v) srchRun({k:'ask', nm:v}, inp, out, 'ovl'); else inp.focus(); };
  }
  /* 다른 화면에서 다시 열면 지난 대화는 정리(같은 화면이면 이어서) */
  var C=srchCtx();
  if(HOME.ovView!==C.v+'|'+HOME.mode){ ansHome(); try{ closeAnswer('', true); }catch(e){} }
  HOME.ovView=C.v+'|'+HOME.mode; HOME.ctx=C; HOME.ctxOn=true; fkCtxPaint();
  openOvl('ovlFind'); inp.value=''; srchRender(inp, out, 'ovl');
  if(host && document.getElementById('answer') && document.getElementById('answer').classList.contains('on')) ansTo(host);
  setTimeout(function(){ inp.focus(); }, 60);
}
export function fkCtxPaint(){
  var c=document.getElementById('fkCtx'), C=HOME.ctx; if(!c) return;
  if(!C || C.v==='dash' && !HOME.mode){ c.hidden=true; c.innerHTML=''; return; }
  c.hidden=false;
  c.innerHTML=tpl`<span class="fk-cl">문맥</span><span class="fk-cv${HOME.ctxOn?'':' off'}">${C.label}${C.parts.length? ' · '+C.parts.join(' · ') : ''}</span>`+
    tpl`<button type="button" class="cbtn" id="fkCtxX" title="질문에 보던 화면 · 조건을 함께 보낼지">${HOME.ctxOn? '문맥 빼기' : '문맥 넣기'}</button>`;
  /** @type {any} */(c.querySelector('#fkCtxX')).onclick=function(){ HOME.ctxOn=!HOME.ctxOn; fkCtxPaint(); };
}
/** 창 안에서 질문 — 답(#answer)을 창 안으로 옮겨 그 자리에서 보여 줌(보던 목록 · 필터 · 쪽 · 스크롤은 그대로) */
export function homeAskOvl(q){
  var host=document.getElementById('fkAns'); if(host) ansTo(host);
  HOME.inp='fkInput'; ask(q, {ctx:HOME.ctxOn? HOME.ctx : null});
}
/** 답 자리 옮기기 */
export function ansTo(host){ var a=document.getElementById('answer'); if(a && host && a.parentElement!==host) host.appendChild(a); }
export function ansHome(){ var ask0=document.querySelector('#viewDash .ask'), a=document.getElementById('answer'); if(a && ask0 && a.parentElement!==ask0) ask0.appendChild(a); HOME.inp='q'; }

/* ------------------------------------------------------------------
   ② 핵심 현황 (한 줄 3칸) · ③ 지금 챙길 일 (3줄) · ④ 상세 업무 진입
   ------------------------------------------------------------------ */
/** 홈 필터(사업 분석의 서비스·산업군 등) 문장 */
export function homeCond(){
  if(!ST.DATA) return '';
  var t=[], off=(ST.DATA.lines||[]).filter(function(l){ return STATE.lines[l.label]===false; }).map(function(l){ return lline(l.label); });
  if(off.length) t.push('서비스 '+off.length+'개 제외('+off.join('·')+')');
  if(STATE.ind) t.push('산업군 '+STATE.ind); if(STATE.partner) t.push('파트너 '+STATE.partner); if(STATE.status) t.push('상태 '+STATE.status); if(STATE.search) t.push('검색 «'+STATE.search+'»');
  return t.length? t.join(' · ') : '전체 서비스 · 필터 없음';
}
/** 핵심 현황 숫자 — 홈 3칸 · 추천 질문 답이 같은 값을 씀 */
export function homeNums(){
  var list=idxs(), b=STATE.base, m0=monthlyTotal(list,b), m1=b>0? monthlyTotal(list,b-1) : null;
  var lv=null; try{ lv=liveData(b); }catch(e){} var uq={}, per={}, ps=0;
  if(lv && lv.ok) lv.rows.forEach(function(x){ if(STATE.lines[x.line]===false) return; if(STATE.ind && x.ind!==STATE.ind) return; uq[x.cust]=1; (per[x.line]=per[x.line]||{})[x.cust]=1; });
  Object.keys(per).forEach(function(l){ ps+=Object.keys(per[l]).length; });
  var RN=renewNeedScan(list, b);
  return {list:list, b:b, m0:m0, m1:m1, d:(m1? (m0-m1)/m1*100 : null), liveOk:!!(lv && lv.ok), nC:Object.keys(uq).length, ps:ps, RN:RN};
}
export function homeSum(){
  var host=document.getElementById('gnSum'), box=document.getElementById('ccInbox');
  if(!homeOn() || !box || !ST.DATA){ if(host) host.remove(); return; }
  if(!host){ host=document.createElement('div'); host.id='gnSum'; host.className='gn-sum'; box.parentElement.insertBefore(host, box); }
  var N=homeNums(), b=N.b, RN=N.RN;
  function cell(k, cls, lab, v, u, sub, tip){ return tpl`<button type="button" class="gs-c ${rawHtml(cls)}" data-k="${k}" title="${tip}"><span class="gs-l">${lab}</span><span class="gs-v"><b class="num">${v}</b><small>${u}</small></span><span class="gs-s">${sub}</span></button>`; }
  host.setAttribute('aria-labelledby','gnSumH');
  host.innerHTML=tpl`<h2 class="sr" id="gnSumH">핵심 현황</h2>`+
    cell('mrr','', '당월 매출 · '+mk(b), won(N.m0), '천원', N.d==null? '전월 자료 없음' : '전월 대비 '+(N.d>=0?'+':'')+N.d.toFixed(1)+'%', '기준월 인식 매출(천원) — 눌러서 사업 분석')+
    cell('live','', 'LIVE 고객', N.liveOk? String(N.nC) : '—', N.liveOk? '곳' : '', N.liveOk? (N.ps>N.nC? '두 제품 이상 '+(N.ps-N.nC)+'곳 포함' : '회사 수 기준') : '불러오는 중', '회사 수 기준 — 눌러서 LIVE 고객사 목록')+
    cell('rnw', RN.rows.length? 'warn':'', '재약정 대응 필요', String(RN.rows.length), '건', RN.xs.EN+'개월 내 만료 '+RN.xs.rows.length+'건 중 · 월 '+won(RN.amt)+'천원', '자동연장 · 재약정 등록된 계약을 뺀 만료 원계약 — 눌러서 같은 목록');
  host.querySelectorAll('.gs-c').forEach(function(c){ /** @type {any} */(c).onclick=function(){ var k=/** @type {any} */(c).dataset.k;
    if(k==='mrr') homeModeSet('biz'); else if(k==='live') switchView('live'); else kpiOpen('expNeed'); }; });
}
/** 지금 챙길 일 — 급한 순 3줄(핵심 현황에 이미 있는 «재약정 대응»은 빼고) · 줄 = 업무 · 대상 수 · 기한 · 담당 · 버튼 1개 · 펼치면 대상/담당/기한/영향 */
export function homeTodo(rows, zeros, snz){
  HOME.rows=rows; HOME.zeros=zeros||[]; HOME.snz=snz||0;
  var box=document.getElementById('ccInbox'); if(!box) return;
  var top=rows.map(function(o,i){ return [o,i]; }).filter(function(x){ return !x[0].kpi; }).sort(function(a,c){ return (a[0].lv||2)-(c[0].lv||2) || a[1]-c[1]; });
  var all=HOME.mode==='todo', show=all? rows.map(function(o,i){ return [o,i]; }).sort(function(a,c){ return (a[0].lv||2)-(c[0].lv||2) || a[1]-c[1]; }) : top.slice(0,3);
  var h=tpl`<div class="ib-head hm-head"><h2>${all? '전체 할 일' : '지금 챙길 일'} <span class="ctag" data-n="${String(rows.length)}">${rows.length? rows.length+'가지' : '없음'}</span></h2>`+
    tpl`${rawHtml(!all && rows.length>show.length? tpl`<button type="button" class="hm-all" id="hmAll">전체 할 일 ${String(rows.length)}가지 →</button>` : '')}</div>`;
  if(!show.length) h+=tpl`<div class="ib-empty"><span class="ib-ic ok">${rawHtml(ico('check',16))}</span>${rows.length? '급한 일은 없습니다 — 예정된 일만 있어요' : '지금 챙길 일이 없습니다'}</div>`;
  else {
    var LV={1:'즉시',2:'확인',3:'예정'}, lastLv=0;
    h+='<div class="hm-cols" aria-hidden="true"><span></span><span>업무</span><span>대상</span><span>기한</span><span>담당</span><span></span></div>';
    if(!all) h+='<ul class="hm-list">';
    show.forEach(function(x){ var o=x[0], i=x[1], lv=o.lv||2;
      if(all && lv!==lastLv){ h+=(lastLv? '</ul>' : '')+tpl`<h3 class="hm-grp lv${String(lv)}">${['','즉시 처리','확인 필요','예정'][lv]}</h3><ul class="hm-list">`; lastLv=lv; }
      var pri=(o.acts||[]).filter(function(a){ return a.pri; })[0], rest=(o.acts||[]).filter(function(a){ return !a.pri; }), open=!!HOME.open[o.key];
      var own=o.own || '미지정';
      h+=tpl`<li class="ib-row hm-row lv${String(lv)}" data-i="${String(i)}">`+
        tpl`<span class="hm-lv" title="${LV[lv]}"><i></i><span class="sr">${LV[lv]}</span></span>`+
        tpl`<button type="button" class="hm-nm" aria-expanded="${open?'true':'false'}" aria-controls="hmD_${o.key}" title="눌러서 대상 · 담당 · 기한 · 영향">${o.nm||String(o.t).replace(/<[^>]+>/g,'')}<span class="chev" aria-hidden="true">▾</span></button>`+
        tpl`<span class="hm-n num">${o.cnt||''}</span><span class="hm-due">${o.dueS||o.due||''}</span><span class="hm-own${o.own?'':' none'}">${own}</span>`+
        tpl`<span class="hm-act">${rawHtml(pri? tpl`<button type="button" class="cbtn pri" data-i="${String(i)}" data-j="${String(o.acts.indexOf(pri))}">${pri.l}</button>` : '')}</span>`+
        tpl`<div class="hm-d" id="hmD_${o.key}"${rawHtml(open? '' : ' hidden')}><dl class="ib-meta">${rawHtml([['대상',o.who],['담당',o.own||'미지정'],['기한',o.due],['영향',o.imp]].filter(function(m){ return m[1]; }).map(function(m){ return tpl`<div><dt>${m[0]}</dt><dd>${m[1]}</dd></div>`; }).join(''))}</dl>`+
        tpl`${rawHtml(rest.length? tpl`<div class="hm-ra">${rawHtml(rest.map(function(a){ return tpl`<button type="button" class="cbtn" data-i="${String(i)}" data-j="${String(o.acts.indexOf(a))}">${a.l}</button>`; }).join(''))}</div>` : '')}</div></li>`;
    });
    h+='</ul>';
  }
  if(all) h+=tpl`<div class="ib-foot"><span>${(HOME.zeros||[]).join(' · ')}</span>${rawHtml(HOME.snz? tpl`<a id="ibUnsnz" href="#" role="button">보류한 ${String(HOME.snz)}건 다시 보기</a>` : '')}</div>`;
  box.innerHTML=h;
  box.querySelectorAll('.cbtn[data-j]').forEach(function(bt){ /** @type {any} */(bt).onclick=function(e){ e.stopPropagation(); var d=/** @type {any} */(bt).dataset; rows[+d.i].acts[+d.j].go(); }; });
  box.querySelectorAll('.hm-nm').forEach(function(bt){ /** @type {any} */(bt).onclick=function(){ var li=bt.closest('.hm-row'), o=rows[+/** @type {any} */(li).dataset.i], d=li.querySelector('.hm-d'), on=d.hidden;
    d.hidden=!on; bt.setAttribute('aria-expanded', on? 'true':'false'); HOME.open[o.key]=on; }; });
  var al=document.getElementById('hmAll'); if(al) al.onclick=function(){ homeModeSet('todo'); };
  var un=document.getElementById('ibUnsnz'); if(un) un.onclick=function(e){ e.preventDefault(); ccUnsnooze(); };
  homeLinks();
}
/** ④ 상세 업무 진입 — 사업 분석 · 전체 할 일 · 최근 작업 (같은 홈 안 · 뒤로가기로 돌아옴) */
export function homeLinks(){
  if(!homeOn()) return;
  var vd=document.getElementById('viewDash'), l=document.getElementById('gnLinks'); if(!vd) return;
  if(!l){ l=document.createElement('nav'); l.id='gnLinks'; l.className='gn-links'; l.setAttribute('aria-label','상세 업무'); vd.appendChild(l); }
  var n=(HOME.rows||[]).length;
  l.innerHTML=tpl`<button type="button" data-hm="biz">${rawHtml(ico('chart',16))}<span>사업 분석</span><small>매출 추이 · 목표 · 채널 · 장비</small></button>`+
    tpl`<button type="button" data-hm="todo">${rawHtml(ico('check',16))}<span>전체 할 일</span><small>${n? n+'가지' : '없음'}</small></button>`+
    tpl`<button type="button" data-hm="recent">${rawHtml(ico('clock',16))}<span>최근 작업</span><small>최근 화면 · 고객사 · 질문</small></button>`;
  l.querySelectorAll('button').forEach(function(b){ /** @type {any} */(b).onclick=function(){ homeModeSet(/** @type {any} */(b).dataset.hm); }; });
}
/** 홈 안 상세(사업 분석 · 전체 할 일 · 최근 작업) — 주소 기록(뒤로가기 · ← 홈) */
export function homeModeSet(m, fromPop){
  m=HOME_MODES[m]? m : '';
  var vd=document.getElementById('viewDash'); if(!vd) return;
  if(!homeOn()){ if(m==='biz') try{ ccAnalysisOpen(true); }catch(e){} return; }
  if(ST.CUR_VIEW!=='dash'){ switchView('dash'); }
  var prev=HOME.mode; HOME.mode=m;
  if(m) vd.setAttribute('data-hm', m); else vd.removeAttribute('data-hm');
  try{ if(m) document.body.dataset.hm=m; else delete document.body.dataset.hm; }catch(e){}
  if(!fromPop && prev!==m){
    try{ if(m){ NAV.i++; history.pushState({v:'dash', i:NAV.i, hm:m}, '', location.pathname+location.search+'#dash'); } else if(navDepth()>0 && history.state && history.state.hm){ history.back(); return; } }catch(e){}
  }
  var hd=document.getElementById('gnModeH');
  if(!hd){ hd=document.createElement('div'); hd.id='gnModeH'; hd.className='gn-modeh'; vd.insertBefore(hd, vd.firstChild); }
  hd.innerHTML=m? tpl`<button type="button" class="pill ghost" id="gnModeBack">${rawHtml(ico('back',15))}<span>홈</span></button><h2>${HOME_MODES[m]}</h2><span class="mini">${m==='biz'? mk(STATE.base)+' 기준 · 금액 천원' : m==='todo'? '급한 순 · 줄을 누르면 대상 · 담당 · 기한 · 영향' : '이 브라우저에서 최근에 본 것'}</span>` : '';
  var bk=document.getElementById('gnModeBack'); if(bk) bk.onclick=function(){ homeModeSet(''); };
  try{ var bt=document.getElementById('btnBack'); if(bt) bt.style.display=(navDepth()>0 || ST.CUR_VIEW!=='dash')? 'inline-flex':'none'; }catch(e){}
  if(m==='biz'){ try{ ccAnalysisOpen(true, true); }catch(e){} requestAnimationFrame(function(){ try{ renderAll(); }catch(e){} }); }
  if(m==='todo' || prev==='todo') homeTodo(HOME.rows, HOME.zeros, HOME.snz);
  if(m==='recent') homeRecent();
  try{ window.scrollTo(0,0); }catch(e){}
  if(m){ var f=document.getElementById('gnModeBack'); if(f && !fromPop) try{ f.focus({preventScroll:true}); }catch(e){} }
}
export function homeRecent(){
  var vd=document.getElementById('viewDash'), r=document.getElementById('gnRecent'); if(!vd) return;
  if(!r){ r=document.createElement('section'); r.id='gnRecent'; r.className='gn-recent'; vd.appendChild(r); }
  var rec=[]; try{ rec=JSON.parse(localStorage.getItem(recentKey())||'[]')||[]; }catch(e){}
  rec=rec.filter(function(v){ return !!document.querySelector('#side button[data-v="'+v+'"]'); });
  var cs=rcCusts(), qs=[], seen={}; (ST.HIST||[]).slice().reverse().forEach(function(x){ var t=String(x.q||'').split('\n')[0]; if(t && !seen[t] && qs.length<6){ seen[t]=1; qs.push(t); } });
  function col(t, items, empty){ return tpl`<div class="gr-col"><h3>${t}</h3>${rawHtml(items.length? tpl`<ul>${rawHtml(items.join(''))}</ul>` : tpl`<p class="cap">${empty}</p>`)}</div>`; }
  r.innerHTML=col('최근 연 화면', rec.map(function(v){ return tpl`<li><button type="button" data-go="${v}">${viewLabel(v)}</button></li>`; }), '아직 없습니다')+
    col('최근 본 고객사', cs.map(function(c){ return tpl`<li><button type="button" data-c="${c}">${c}</button></li>`; }), '고객 360 을 열면 여기에 남습니다')+
    col('최근 질문', qs.map(function(q){ return tpl`<li><button type="button" data-q="${q}">${q}</button></li>`; }), '질문하면 여기에 남습니다');
  r.querySelectorAll('[data-go]').forEach(function(b){ /** @type {any} */(b).onclick=function(){ navMenu(/** @type {any} */(b).dataset.go); }; });
  r.querySelectorAll('[data-c]').forEach(function(b){ /** @type {any} */(b).onclick=function(){ openCust360(/** @type {any} */(b).dataset.c); }; });
  r.querySelectorAll('[data-q]').forEach(function(b){ /** @type {any} */(b).onclick=function(){ var q=/** @type {any} */(b).dataset.q; homeModeSet(''); setTimeout(function(){ HOME.inp='q'; HOME.ctx=null; ask(q); }, 30); }; });
}

/* ------------------------------------------------------------------
   답 틀 — 핵심 → 근거 → 원본 보기 → 다음 행동 · 기준 · 이전 문답(이어서 묻기)
   ------------------------------------------------------------------ */
/** 질문이 창(검색·질문 창)에서 왔는지 — 창이 열려 있으면 답도 창 안, 아니면 홈 가운데 */
export function askInOvl(){ var o=document.getElementById('ovlFind'); return !!(o && o.classList.contains('on')); }
export function askInput(){ return /** @type {any} */(document.getElementById(askInOvl()? 'fkInput' : 'q')) || /** @type {any} */(document.getElementById('q')); }
/** 새 질문 직전 — 앞 문답을 «이전 질문»으로 접어 두고 답 틀을 비움 */
export function homeBeforeAsk(q, opt){
  if(askInOvl()){ HOME.inp='fkInput'; ansTo(document.getElementById('fkAns')); } else ansHome();
  var a=document.getElementById('answer'), th=document.getElementById('ansThread');
  if(a && a.classList.contains('on') && HOME.last && HOME.last.q && HOME.last.text){ HOME.thread.push(HOME.last); if(HOME.thread.length>5) HOME.thread.shift(); }
  HOME.last={q:q, text:''};
  if(th) th.innerHTML=HOME.thread.length? tpl`<div class="th-h">이전 질문 ${String(HOME.thread.length)}개 — 이어서 물으면 앞의 문답을 기억합니다</div>`+HOME.thread.map(function(t){ return tpl`<details class="th"><summary><b>Q</b> ${t.q}</summary><div class="th-a">${String(t.text).slice(0,700)}</div></details>`; }).join('') : '';
  var C=opt && opt.ctx;
  var qq=document.getElementById('ansQ'); if(qq) qq.innerHTML=tpl`<span class="ans-qq">${q}</span>${rawHtml(C? tpl`<span class="ans-ctx" title="질문과 함께 보낸 문맥">${C.label}${C.parts.length? ' · '+C.parts.join(' · ') : ''}</span>` : '')}`;
  ['ansLocal','ansEvLocal','ansSrcB','ansNext','ansMeta'].forEach(function(id){ var e=document.getElementById(id); if(e) e.innerHTML=''; });
  var st=document.getElementById('ansState'); if(st){ st.className='ans-state'; st.innerHTML=''; st.hidden=true; }
  var h=document.querySelector('#answer .ans-head'); if(h) /** @type {any} */(h).hidden=false;
  ansSync();
}
/** 답이 끝났을 때 — 이전 질문으로 접어 둘 글 */
export function homeAfter(text){ if(HOME.last) HOME.last.text=String(text||'').replace(/\s+/g,' ').trim(); ansSync(); }
export function ansClear(){ HOME.thread=[]; HOME.last=null; var th=document.getElementById('ansThread'); if(th) th.innerHTML=''; }
/** 비어 있는 칸(근거 · 원본 · 다음 행동)은 제목째 숨김 */
export function ansSync(){
  var g=/** @type {any} */(document.getElementById('ansGrid')), el=document.getElementById('ansEvLocal'), cm=document.getElementById('aiComment');
  var ev=document.getElementById('ansEv'); if(ev) /** @type {any} */(ev).hidden=!((g && g.style.display!=='none') || (el && el.innerHTML.trim()) || (cm && cm.classList.contains('on')));
  var sr=document.getElementById('ansSrc'), sb=document.getElementById('ansSrcB'); if(sr) /** @type {any} */(sr).hidden=!(sb && sb.innerHTML.trim());
  var nx=document.getElementById('ansNextBox'), nb=document.getElementById('ansNext'), sg=document.getElementById('ansSuggest'); if(nx) /** @type {any} */(nx).hidden=!((nb && nb.innerHTML.trim()) || (sg && sg.innerHTML.trim()));
  var hd=document.querySelector('#answer .ans-head'); if(hd){ var t=document.getElementById('ansTitle'), he=document.getElementById('ansHero'), su=document.getElementById('ansSub');
    /** @type {any} */(hd).hidden=!((t && t.textContent.trim()) || (he && he.textContent.trim()) || (su && su.textContent.trim())); }
}
/** 버튼 줄 — [{l, go, pri}] (화면만 엶) */
export function ansBtns(host, list){
  if(!host) return; host.innerHTML=(list||[]).map(function(a, i){ return tpl`<button type="button" class="cbtn${a.pri?' pri':''}" data-i="${String(i)}">${a.l}</button>`; }).join('');
  host.querySelectorAll('button').forEach(function(b){ /** @type {any} */(b).onclick=function(){ var a=list[+/** @type {any} */(b).dataset.i]; if(document.getElementById('ovlFind') && document.getElementById('ovlFind').classList.contains('on') && !a.stay) closeOvl('ovlFind'); a.go(); }; });
}
/** 기준 한 줄 — 기간 · 단위 · 데이터 갱신 · 조건 */
export function ansMetaSet(m){
  var host=document.getElementById('ansMeta'); if(!host) return;
  var it=[['기준 기간',m.period],['단위',m.unit],['데이터',m.upd || (ST.DATA && ST.DATA.generatedAt? ST.DATA.generatedAt+' 읽음' : '')],['조건',m.cond]].filter(function(x){ return x[1]; });
  host.innerHTML=tpl`<dl>${rawHtml(it.map(function(x){ return tpl`<div><dt>${x[0]}</dt><dd>${x[1]}</dd></div>`; }).join(''))}</dl>`;
}
/** 상태 줄 — need(데이터 부족 · 연결 필요) / fail(실패) / info */
export function ansStateSet(kind, html){
  var st=document.getElementById('ansState'); if(!st) return;
  st.hidden=!html; st.className='ans-state'+(kind? ' '+kind : ''); st.innerHTML=html||'';
}
/** AI · 규칙형 답의 원본 보기 · 기준 (ai.js 가 부름) — p: 규칙형 해석 결과(있으면) */
export function homeMetaAI(q, r, p, opt){
  var C=opt && opt.ctx, src=[], custs=p && (p.custs && p.custs.length? p.custs : (p.cust? [p.cust] : [])) || [];
  custs.slice(0,2).forEach(function(c){ src.push({l:'고객 360 — '+c, go:function(){ openCust360(c); }}); });
  if(p) src.push({l:'계약 목록에서 확인', go:function(){ switchView('contracts'); var s=/** @type {any} */(document.getElementById('dvSearch')); if(s && custs.length===1){ s.value=custs[0]; try{ s.dispatchEvent(new Event('input')); }catch(e){} } }});
  if(C && C.v && C.v!=='dash') src.push({l:'보던 화면으로 — '+C.label, go:function(){}});
  ansBtns(document.getElementById('ansSrcB'), src);
  ansMetaSet({period:p? '' : mk(STATE.base)+' 데이터 기준', unit:p? '천원(포탈 계산 표)' : '천원', cond:(C? '보던 화면: '+C.label+(C.parts.length? ' · '+C.parts.join(' · ') : '') : '') || (p? '' : '홈 · 전체 데이터')});
  ansSync();
}

/* ------------------------------------------------------------------
   추천 질문 4개 — 포탈이 직접 계산(같은 조건의 화면 숫자와 같음 · AI 가 꺼져도 답함)
   ------------------------------------------------------------------ */
export function localIntent(q){
  var s=String(q||'').replace(/\s+/g,'');
  if(/^(이번달|당월|이달)매출(변화|변동|은?어때\??|증감)|^매출변화$/.test(s)) return 'mrr';
  if(/^재약정(대응할|챙길|대응이?필요한|할)고객|^재약정대응(필요)?$|^재계약대응/.test(s)) return 'renew';
  if(/^(내가)?(처리할|해야할|할)일$|^내할일$|^내가처리할일$|^내담당(업무|일)?$/.test(s)) return 'mine';
  return '';
}
export function homeLocal(q, kind, opt){
  var a=document.getElementById('answer'); if(!a) return;
  a.classList.add('on');
  ['aiSay','ansRestate','aiComment'].forEach(function(id){ var e=document.getElementById(id); if(e) e.className=id==='aiSay'? 'ai-say' : id==='ansRestate'? 'restate' : 'ai-comment'; });
  ['ansTitle','ansHero','ansSub','ansNote','ansSuggest'].forEach(function(id){ var e=document.getElementById(id); if(e) e.textContent=''; });
  var sgt=document.getElementById('ansSuggestTitle'); if(sgt) sgt.style.display='none';
  var g=/** @type {any} */(document.getElementById('ansGrid')); if(g) g.style.display='none';
  var pin=/** @type {any} */(document.getElementById('ansPin')); if(pin) pin.hidden=true;
  /** @type {any} */ var A=null;
  try{ A= kind==='mrr'? liMrr() : kind==='renew'? liRenew() : liMine(); }
  catch(e){ A={state:'fail', core:'계산하지 못했습니다 — '+String(/** @type {any} */(e).message||e).slice(0,120), retry:1}; }
  if(!ST.DATA) A={state:'need', core:'데이터를 아직 읽지 못했습니다 — 잠시 뒤 다시 물어봐 주세요.', retry:1};
  var core=document.getElementById('ansLocal');
  if(core) core.innerHTML=tpl`<p class="ans-core">${rawHtml(A.core)}</p>`+tpl`${rawHtml(A.extra||'')}`;
  if(A.state==='need') ansStateSet('need', tpl`<b>${A.stTitle||'데이터 부족'}</b> — ${A.stMsg||'숫자를 0 으로 보이지 않고 이유를 먼저 알려 드립니다'}`+(A.retry? tpl` <button type="button" class="cbtn" id="ansRetry">다시 시도</button>` : ''));
  else if(A.state==='fail') ansStateSet('fail', tpl`<b>계산 실패</b> — 잠시 뒤 다시 시도해 주세요 <button type="button" class="cbtn" id="ansRetry">다시 시도</button>`);
  var rb=document.getElementById('ansRetry'); if(rb) rb.onclick=function(){ ask(q, opt); };
  var ev=document.getElementById('ansEvLocal');
  if(ev) ev.innerHTML=A.table? ansTable(A.table) : '';
  if(ev && A.table) ev.querySelectorAll('[data-go]').forEach(function(x){ /** @type {any} */(x).onclick=function(){ var f=A.table.go[+/** @type {any} */(x).dataset.go]; if(f){ if(document.getElementById('ovlFind').classList.contains('on')) closeOvl('ovlFind'); f(); } }; });
  ansBtns(document.getElementById('ansSrcB'), A.src||[]);
  ansBtns(document.getElementById('ansNext'), A.next||[]);
  var sg=document.getElementById('ansSuggest'); if(sg){ sg.innerHTML=''; (A.follow||[]).forEach(function(s){ var c=document.createElement('button'); c.type='button'; c.className='chip'; c.textContent=s; c.onclick=function(){ ask(s, opt); }; sg.appendChild(c); }); if(sgt) sgt.style.display=(A.follow||[]).length? 'block':'none'; }
  ansMetaSet(A.meta||{});
  if(A.bind) try{ A.bind(); }catch(e){}
  var plain=String(A.core).replace(/<[^>]+>/g,'');
  homeAfter(plain);
  try{ ST.HIST.push({q:q, a:plain}); if(ST.HIST.length>10) ST.HIST.shift(); }catch(e){}   /* 이어서 AI 에 물을 때 앞의 문답으로(포탈 계산 답도) — DB 기록(ai_chat_history)은 AI 답만 */
  try{ var r=a.getBoundingClientRect(); if(r.top>innerHeight-120) a.scrollIntoView({behavior:'smooth', block:'start'}); }catch(e){}
}
/** 근거 표 — {cols, rows:[[…]], n:[숫자 열 번호], go:[행별 이동 함수], cap} */
export function ansTable(T){
  return tpl`${rawHtml(T.cap? tpl`<div class="cap ans-tcap">${T.cap}</div>` : '')}<div class="tbl-wrap ans-tw" tabindex="0"><table class="ans-t"><thead><tr>${rawHtml(T.cols.map(function(c, i){ return tpl`<th${rawHtml((T.n||[]).indexOf(i)>=0? ' class="n"':'')}>${c}</th>`; }).join(''))}</tr></thead><tbody>`+
    tpl`${rawHtml(T.rows.map(function(r, ri){ return tpl`<tr${rawHtml(r.tot? ' class="tot"':'')}>${rawHtml(r.c.map(function(v, i){ var cell=(i===0 && T.go && T.go[ri])? tpl`<button type="button" class="lnk" data-go="${String(ri)}">${v}</button>` : esc(v);
      return tpl`<td${rawHtml((T.n||[]).indexOf(i)>=0? ' class="n"':'')}>${rawHtml(cell)}</td>`; }).join(''))}</tr>`; }).join(''))}</tbody></table></div>`;
}
export function sgn(v){ return (v>0? '+' : v<0? '−' : '')+won(Math.abs(v)); }
/** «이번 달 매출 변화» — 홈 «당월 매출»과 같은 계산(monthlyTotal · 홈 필터) */
export function liMrr(){
  var N=homeNums(), b=N.b, list=N.list;
  var meta={period:mk(b)+(b>0? ' vs '+mk(b-1) : ''), unit:'천원(기준월 인식 매출)', cond:homeCond()+' · 원계약·부속 포함 월 인식 금액'};
  if(b<=0) return {state:'need', stTitle:'전월 자료 없음', stMsg:'비교할 지난달 데이터가 없습니다', core:mk(b)+' 매출은 '+won(N.m0)+'천원입니다.', meta:meta};
  var per={}, cu={};
  list.forEach(function(k){ var r=ST.DATA.rows[k], a=ST.MAT[k][b]||0, p=ST.MAT[k][b-1]||0; if(!a && !p) return;
    var l=per[r.line]=per[r.line]||[0,0]; l[0]+=a; l[1]+=p; var c=cu[r.cust]=cu[r.cust]||[0,0]; c[0]+=a; c[1]+=p; });
  var d=N.m0-N.m1, lines=Object.keys(per).map(function(l){ return {l:l, a:per[l][0], p:per[l][1], d:per[l][0]-per[l][1]}; }).sort(function(x,y){ return Math.abs(y.d)-Math.abs(x.d) || y.a-x.a; });
  var cs=Object.keys(cu).map(function(c){ return {c:c, d:cu[c][0]-cu[c][1]}; }).filter(function(x){ return Math.abs(x.d)>=0.5; });
  var up=cs.filter(function(x){ return x.d>0; }).sort(function(x,y){ return y.d-x.d; }).slice(0,3), dn=cs.filter(function(x){ return x.d<0; }).sort(function(x,y){ return x.d-y.d; }).slice(0,3);
  var core=tpl`<b>${mk(b)} 매출 ${won(N.m0)}천원</b> — ${mk(b-1)}(${won(N.m1)}천원)보다 <b>${won(Math.abs(d))}천원 ${Math.abs(d)<0.5? '변화 없음' : d>0? '늘었습니다' : '줄었습니다'}</b>${N.d==null? '' : ' ('+(N.d>=0?'+':'')+N.d.toFixed(1)+'%)'}.`;
  var ex='';
  if(up.length || dn.length) ex=tpl`<p class="ans-sub2">${rawHtml(up.length? tpl`늘어난 곳 ${up.map(function(x){ return x.c+' '+sgn(x.d); }).join(', ')}` : '')}${rawHtml(up.length && dn.length? ' · ' : '')}${rawHtml(dn.length? tpl`줄어든 곳 ${dn.map(function(x){ return x.c+' '+sgn(x.d); }).join(', ')}` : '')}</p>`;
  /** @type {any[]} */ var rows=lines.map(function(x){ return {c:[lline(x.l), won(x.a), won(x.p), sgn(x.d)]}; });
  rows.push({c:['합계', won(N.m0), won(N.m1), sgn(d)], tot:1});
  return {core:core, extra:ex, table:{cols:['서비스', mk(b), mk(b-1), '증감'], n:[1,2,3], rows:rows, cap:'서비스별 월 인식 매출(천원)'},
    src:[{l:'사업 분석에서 보기', pri:1, go:function(){ homeModeSet('biz'); }}, {l:'계약 목록', go:function(){ navMenu('contracts'); }}],
    follow:['최근 6개월 추이 보여줘','제일 큰 고객 누구야?'], meta:meta};
}
/** «재약정 대응할 고객» — 홈 «재약정 대응 필요»와 같은 행(renewNeedScan) */
export function liRenew(){
  var N=homeNums(), RN=N.RN, XS=RN.xs, b=N.b, end=XS.end;
  var meta={period:'종료월 '+mk(b)+' ~ '+mk(end)+' ('+XS.EN+'개월)', unit:'천원(종료월 월 금액)', cond:'원계약만(부속 · H/W · 해지 · 중지 제외) · 자동연장 · 재약정 등록 제외 · '+homeCond()};
  var exc=[]; if(RN.sure.length) exc.push('재약정 등록됨 '+RN.sure.length+'건'); if(RN.auto.length) exc.push('자동연장 '+RN.auto.length+'건');
  if(!XS.rows.length) return {core:tpl`앞으로 ${String(XS.EN)}개월(${mk(b)}~${mk(end)}) 안에 끝나는 원계약이 없습니다.`, meta:meta, src:[{l:'만료 기간 바꾸기(사업 분석)', go:function(){ homeModeSet('biz'); }}]};
  var core=tpl`앞으로 ${String(XS.EN)}개월(${mk(b)}~${mk(end)}) 안에 끝나는 원계약 ${String(XS.rows.length)}건 중 <b>재약정 대응이 필요한 계약은 ${String(RN.rows.length)}건</b>(고객사 ${String(RN.custN)}곳 · 월 ${won(RN.amt)}천원)입니다.${exc.length? ' '+exc.join(' · ')+'은 뺐습니다.' : ''}`;
  var ois=ST.RAWX.oi||[];
  var rows=RN.rows.slice(0,8).map(function(k){ var r=ST.DATA.rows[k];
    var oiN=ois.filter(function(o){ return oiOpen(o) && c360Match(o.customer, r.cust); }).length;
    var nt=[]; try{ var x=String(expNote(k)||''); if(x) nt.push(x); }catch(e){} if(oiN) nt.push('진행 중 OI '+oiN+'건');
    return {c:[r.cust, lline(r.line), mk(r.endIdx), won(ST.MAT[k][Math.min(r.endIdx, ST.M-1)]||r.mrr||0), nt.join(' · ')||'후속 계약 없음']}; });
  var go=RN.rows.slice(0,8).map(function(k){ var c=ST.DATA.rows[k].cust; return function(){ openCust360(c); }; });
  var first=RN.rows.length? ST.DATA.rows[RN.rows[0]].cust : '';
  var next=[]; if(first) next.push({l:'고객 360 — '+first, go:function(){ openCust360(first); }});
  next.push({l:'만기 처리 창 열기', go:function(){ openRenewList('due'); }});
  return {core:core, table:{cols:['고객사','서비스','종료월','월 금액','확인할 것'], n:[3], rows:rows, go:go, cap:RN.rows.length>8? '종료가 가까운 8건 — 전체 '+RN.rows.length+'건은 «목록으로 보기»' : '고객사를 누르면 고객 360'},
    src:[{l:'목록으로 보기 ('+RN.rows.length+'건)', pri:1, go:function(){ kpiOpen('expNeed'); }}], next:next, meta:meta};
}
/** «내가 처리할 일» — 계정 ↔ 담당자 이름이 연결돼 있어야 셈(없으면 0 이 아니라 «담당자 연결 필요») */
export function liMine(){
  var C=qvCfg(), me=C.me, meta={period:'오늘 '+new Date().toISOString().slice(0,10)+' 기준', unit:'건', cond:''};
  var team=(HOME.rows||[]).slice().sort(function(a,c){ return (a.lv||2)-(c.lv||2); }).slice(0,5);
  if(!me){
    var owners={}; (ST.RAWX.oi||[]).concat(ST.RAWX.inbound||[]).forEach(function(r){ String(r.owner||'').split(/[,/]/).forEach(function(o){ o=o.trim(); if(o) owners[o]=1; }); });
    var opts=Object.keys(owners).sort(function(a,c){ return a.localeCompare(c,'ko'); });
    meta.cond='계정 '+(ST.AUTH_USER||'')+' — 담당자 이름 연결 없음';
    return {state:'need', stTitle:'담당자 연결 필요', stMsg:'이 계정과 OI · 인바운드 «담당» 이름이 아직 연결되지 않아 내 일을 고를 수 없습니다(0건이 아닙니다)',
      core:'계정과 담당자 이름이 연결되면 내 담당 OI · 인바운드만 골라 보여 드립니다. 지금은 팀 전체에서 급한 일을 보여 드립니다.',
      extra:opts.length? tpl`<div class="ans-pick" data-nodirty><label for="ansMe">임시로 이 브라우저에서 내 이름 고르기</label><select id="ansMe"><option value="">— 고르기 —</option>${rawHtml(opts.map(function(o){ return tpl`<option>${o}</option>`; }).join(''))}</select><button type="button" class="cbtn" id="ansMeOk">이 브라우저에 저장</button><span class="cap">고른 이름은 이 브라우저에만 저장됩니다(계정별 연결은 관리자 화면에서 준비 중)</span></div>` : '',
      bind:function(){ var ok=document.getElementById('ansMeOk'); if(ok) ok.onclick=function(){ var s=/** @type {any} */(document.getElementById('ansMe')); if(!s || !s.value) return; var c=qvCfg(); c.me=s.value; qvSave(c); toast('내 이름 저장','«'+s.value+'» — 이 브라우저에만 · OI · 인바운드 «내 담당»도 같은 기준','info'); ask('내가 처리할 일'); }; },
      table:team.length? {cols:['팀 전체 — 지금 챙길 일','대상','담당'], rows:team.map(function(o){ return {c:[o.nm||'', o.cnt||'', o.own||'미지정']}; }), go:team.map(function(o){ var pa=(o.acts||[]).filter(function(x){ return x.pri; })[0]; return pa? pa.go : null; })} : null,
      src:[{l:'전체 할 일', go:function(){ homeModeSet('todo'); }}], meta:meta};
  }
  var oi=ST.RAWX.oi||[], inbL=ST.RAWX.inbound, mine=function(r){ return String(r.owner||'').indexOf(me)>=0; };
  var dO=qvDefs('oi')||[], dI=qvDefs('inbound')||[], fO={}, fI={}; dO.forEach(function(d){ fO[d[0]]=d; }); dI.forEach(function(d){ fI[d[0]]=d; });
  var oiOpenMine=oi.filter(function(r){ return mine(r) && oiOpen(r); });
  var rows=[], go=[];
  function add(view, d, base, lab){ if(!d) return; var n=base.filter(d[3]).length; rows.push({c:[lab, String(n)]}); go.push(function(){ gridGoPre(view, '내 담당 · '+d[1]+' — '+d[2], function(r){ return mine(r) && d[3](r); }); }); return n; }
  var nLate=add('oi', fO.late, oiOpenMine, 'OI 기한 초과'), nNone=add('oi', fO.nonext, oiOpenMine, 'OI 다음 행동 없음'), nToday=add('oi', fO.today, oiOpenMine, 'OI 오늘 할 일');
  var inbTxt='';
  if(inbL===undefined){ inbTxt=' · 인바운드는 불러오는 중'; try{ loadInbound(function(){ if(HOME.last && /내가?처리할일|내할일/.test(String(HOME.last.q).replace(/\s+/g,''))) ask(HOME.last.q); }); }catch(e){} }
  else { var inbMine=(inbL||[]).filter(mine); add('inbound', fI.first, inbMine, '인바운드 첫 대응 지연'); add('inbound', fI.idle, inbMine, '인바운드 장기 미접촉'); }
  meta.cond='담당 칸에 «'+me+'» 포함(이 브라우저에서 고른 이름) · OI 진행 중 · 첫 대응 '+C.inbFirst+'일 · 장기 미접촉 '+C.inbIdle+'일 · 계약 · 장비 신청은 담당 칸이 없어 빠짐';
  var core=tpl`<b>«${me}» 담당</b> — 진행 중 OI ${String(oiOpenMine.length)}건 중 기한 초과 ${String(nLate||0)} · 다음 행동 없음 ${String(nNone||0)} · 오늘 할 일 ${String(nToday||0)}${inbTxt}.`;
  return {core:core, table:{cols:['내 담당','건수'], n:[1], rows:rows, go:go, cap:'항목을 누르면 그 조건의 목록'},
    src:[{l:'OI 현황 — 내 담당', go:function(){ gridGoPre('oi', '내 담당 — 담당 «'+me+'»', mine); }}],
    next:[{l:'내 이름 바꾸기', stay:1, go:function(){ var c=qvCfg(); c.me=''; qvSave(c); ask('내가 처리할 일'); }}],
    meta:meta};
}
