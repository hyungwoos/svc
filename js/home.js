/* ===== home.js — AI 를 바로 쓰고, 질문하지 않아도 현황을 보고 일을 시작하는 홈 · 검색·질문 하나로 · AI 대화 패널 =====
   ES 모듈 — 다른 파일의 이름은 아래 import 로만 씀 · 이 파일의 최상위 var/function 은 전부 export · 즉시 실행 문장은 js/init.js 의 start() 에
   ㊿+171 → ㊿+172 (사용자: «홈이 더 불편해졌다» — 사업 현황이 안 보임 · 할 일 3줄만 · 질문칸이 큼 · 답이 홈을 밀어냄 · 들어가면 검색창·현황이 사라짐)
   · 홈(지니언스) 고정 순서: ① 한 줄 검색·AI 질문 + 추천 질문 ② 핵심 현황 3칸(전체 사업 · 이번 달 고정 — 사업 분석 필터와 무관)
     ③ 바로가기(계약 · 고객 검색 · OI · 장비 · 견적 · 주간회의) ④ 매출 추이(하나) + 우선 업무(내 업무 / 팀 전체) ⑤ 최근 본 고객 · 최근 작업
     ⑥ «사업 현황 상세 · 분석»은 같은 화면에서 펼침(검색창 · 핵심 현황은 그대로)
   · AI 답은 오른쪽 AI 패널(좁으면 전체 화면) — 홈 배치를 밀지 않음 · 패널을 닫아도 대화 유지(«AI 대화»로 다시 열기) · 새 대화 / 대화 삭제 구분
     · 지난 답은 요약이 아니라 원래 답 · 근거 · 버튼 그대로(접어 둠) · 원본 보기로 다른 화면에 갔다 와도 그대로
   · 검색 Enter = 고른 검색 결과(고객 · 시리얼 · 화면 · 기록이 있으면 그것이 먼저 골라짐) · AI 질문은 «AI 에 질문» 버튼 · Ctrl+Enter · 맨 끝 질문 항목
     · 문장(물음표 · «알려줘» 등)이면 질문이 먼저 골라짐 · 지금 Enter 가 무엇을 하는지 목록 아래에 표시 · 검색어 · 고른 줄은 돌아와도 그대로
   · 답의 버튼은 화면만 엶 — 저장 · 발송은 그 화면에서 확인한 뒤에만 */
import { ST } from './state.js';
import { cssv, esc, isGN, lline, mk, navText, rawHtml, STATE, tpl, won, wonFull } from './core.js';
import { ccPref, ccPrefSet, ccUnsnooze, ico, sbTry, toast, visBtn } from './shell.js';
import { expNote, kpiOpen, monthlyTotal, onResize, renderAll, renewNeedScan } from './dash.js';
import { abortAsk, ask, isAsking } from './ai.js';
import { liveData, openRenewList } from './analysis.js';
import { dashResetIfChanged, DV, gridFilteredSorted, gridGoPre, meMatch, myOwner, navMenu, oiOpen, qvCfg, qvDefs, qvSave, switchView, wvCur } from './grid.js';
import { GRIDS } from './grids.js';
import { c360Match, fkNorm, fkSources, freqTop, navSub, openCust360, recentKey, viewLabel } from './tools.js';
import { loadInbound } from './inbound.js';
import { closeOvl, openOvl } from './edit.js';
import { Viz } from './viz.js';

/** 홈 상태 @type {any} */
export var HOME={rows:[], zeros:[], snz:0, cur:null, nTurn:0, ctx:null, ctxOn:true, open:{}, bound:0, scope:'', allOpen:false, newChat:false, hist:[], srch:{home:{q:'', i:-1}, ovl:{q:'', i:-1}}, ownerTry:0, rz:0};
export var HOME_CHIPS=['이번 달 매출 변화','재약정 대응할 고객','내가 처리할 일','고객사 현황 찾기'];
export function homeOn(){ return isGN() && !ST.IS_EQUIP; }

/* ------------------------------------------------------------------
   ① 한 줄 검색 · AI 질문 + 추천 질문
   ------------------------------------------------------------------ */
export function homeSetup(){
  try{ aipInit(); }catch(e){ console.warn('ai panel', e); }
  if(!homeOn()) return;
  var h=document.getElementById('askH'); if(h) h.textContent='검색 · AI 질문';
  var q=/** @type {any} */(document.getElementById('q'));
  if(q){ q.placeholder=homePh(); q.setAttribute('aria-label','검색 — 고객사 · 시리얼 · 화면 · 사업명 / 문장으로 쓰면 AI 에 질문'); }
  var b=document.getElementById('btnAsk'); if(b && !b.classList.contains('asking')){ b.textContent='AI 에 질문'; b.title='입력한 글을 AI 에 질문(Ctrl+Enter) — Enter 는 고른 검색 결과'; }
  var cb=document.getElementById('chips');
  if(cb){ cb.innerHTML=''; cb.classList.remove('all'); cb.setAttribute('role','group'); cb.setAttribute('aria-label','추천 질문');
    HOME_CHIPS.forEach(function(s){ var c=document.createElement('button'); c.type='button'; c.className='chip'; c.textContent=s;
      c.onclick=function(){ if(s==='고객사 현황 찾기'){ homeFindCust(); return; } ask(s, {from:'home'}); }; cb.appendChild(c); }); }
  if(q && !HOME.bound){ HOME.bound=1; srchBind(q, /** @type {any} */(document.getElementById('sug')), 'home'); }
  var cmd=document.getElementById('cmdBar');
  if(cmd){ cmd.innerHTML=tpl`${rawHtml(ico('search',16))}<span class="ph">검색</span><kbd>Ctrl K</kbd>`; cmd.setAttribute('aria-label','검색 · AI 질문 (Ctrl+K)'); cmd.title='검색 · AI 질문 — 고객사 · 시리얼 · 화면 찾기와 AI 질문 (Ctrl+K)'; }
  try{ placeSearchBtn(); }catch(e){}
  try{ homeOwnerLoad(); }catch(e){}
}
export function homePh(){ return window.innerWidth<520? '고객사 · 화면 검색 / AI 질문' : '고객사 · 시리얼 · 화면 검색 — 문장으로 쓰면 AI 에 질문 (예: 이번 달 매출 왜 늘었어?)'; }
/** 위쪽 «검색» 버튼 · «AI 대화» 다시 열기 — 넓은 화면은 오른쪽 위(메뉴 줄 오른쪽 · 관리 왼쪽) · 폰은 위 띠 */
export function placeSearchBtn(){
  var cmd=document.getElementById('cmdBar'), op=aipOpenBtn(), right=document.querySelector('#rail .gn-right'), tb=document.querySelector('#app .topbar');
  if(!cmd || !tb) return;
  var wide=isGN() && !!right && window.innerWidth>760;
  function toTop(){ var ub=document.getElementById('unitBadge'); if(cmd.parentElement!==tb) tb.insertBefore(cmd, ub||null); if(op && op.parentElement!==tb) tb.insertBefore(op, cmd.nextSibling); }
  if(wide){ if(cmd.parentElement!==right) right.insertBefore(cmd, right.firstChild); if(op && op.parentElement!==right) right.insertBefore(op, cmd.nextSibling);
    /* 위 메뉴 묶음이 잘리면(좁은 노트북 폭) 검색 · AI 대화는 아래 띠로 — 메뉴가 먼저 */
    var tabs=document.querySelector('#rail .gn-tabs'); if(tabs && tabs.scrollWidth>tabs.clientWidth+1) toTop(); }
  else toTop();
  if(!HOME.rz){ HOME.rz=1; onResize(placeSearchBtn); }
}
/** «고객사 현황 찾기» — 입력칸에 고객사 이름을 바로 적도록(최근 본 고객사 · 월 매출 상위를 먼저 보여 줌) */
export function homeFindCust(){
  var q=/** @type {any} */(document.getElementById('q')); if(!q){ openFindX(); return; }
  if(ST.CUR_VIEW!=='dash') switchView('dash');
  q.value=''; HOME.custHint=1; q.focus(); srchRender(q, /** @type {any} */(document.getElementById('sug')), 'home');
}
/** 위쪽 «검색» 버튼 · Ctrl+K — 홈은 맨 위 입력칸, 그 밖은 검색 창(보던 화면은 그대로) */
export function homeSearchOpen(){
  if(!ST.SB_TOKEN || !ST.DATA) return;
  if(homeOn() && ST.CUR_VIEW==='dash'){
    var q=/** @type {any} */(document.getElementById('q')); if(!q) return;
    try{ window.scrollTo({top:0, behavior:'smooth'}); }catch(e){}
    q.focus(); try{ q.select(); }catch(e){} srchRender(q, /** @type {any} */(document.getElementById('sug')), 'home', true); return;
  }
  openFindX();
}

/* ------------------------------------------------------------------
   검색 — 결과가 있으면 결과를 먼저 고름(Enter = 그것) · AI 질문은 따로
   ------------------------------------------------------------------ */
export function srchMenus(q){
  var qn=fkNorm(q), out=[]; if(!qn) return out;
  document.querySelectorAll('#side button[data-v]').forEach(function(b){
    var el=/** @type {any} */(b), v=el.dataset.v; if(!visBtn(el) && v!=='dash') return; if(v==='account') return;
    var sub=navSub(el), nm=navText(el), t=(sub? sub+' · ':'')+nm, n1=fkNorm(nm), n2=fkNorm(t);
    if(n2.indexOf(qn)<0) return;
    out.push({t:'화면', nm:t, sb:'화면 열기(마지막 상태)', exact:(n1===qn || n2===qn), pre:n1.indexOf(qn)===0, v:v, go:(function(v2){ return function(){ navMenu(v2); }; })(v), k:'menu'});
  });
  /* 같은 급이면 자주 연 화면 → 목록 화면(등록 · 입력 화면은 뒤) */
  var fq=freqTop(30), fr=function(m){ var i=fq.indexOf(m.v); return i<0? 99 : i; }, inp=function(m){ return /new$/.test(m.v) || /등록/.test(m.nm)? 1 : 0; };
  out.sort(function(a,b){ return (b.exact?1:0)-(a.exact?1:0) || (b.pre?1:0)-(a.pre?1:0) || fr(a)-fr(b) || inp(a)-inp(b); });
  return out.slice(0,4);
}
/** 문장 · 질문처럼 보이는지 — 이때만 «AI 에 질문»이 먼저 골라짐 */
export function looksQuestion(v){
  v=String(v||'').trim(); if(v.length<4) return false;
  if(/[?？]$/.test(v)) return true;
  return /\s/.test(v) && /(알려|보여|어때|얼마|몇\s?(곳|건|개|명)|누구|무엇|뭐야|왜|어떻게|할까|해줘|해 줘|정리|요약|비교|추이|변화|늘었|줄었|있어|없어|인가|일까|이야)/.test(v);
}
/** 검색 결과 — [{t, nm, sb, go, exact, k}] · 순서: 정확히 같은 것 → 고객 360 → 화면 → 개별 기록 → (맨 끝) AI 에 질문 */
export function srchHits(q){
  var qn=fkNorm(q), hits=[]; if(!qn) return hits;
  var menus=srchMenus(q), src=fkSources(), cust={}, exact=[], recs=[], seen={};
  src.forEach(function(s){ if(s.cust && fkNorm(s.cust).indexOf(qn)>=0){ var c=cust[s.cust]=cust[s.cust]||{n:0, ex:fkNorm(s.cust)===qn}; c.n++; } });
  Object.keys(cust).forEach(function(c){ if(cust[c].ex) exact.push({t:'고객 360', nm:c, sb:'계약 · LIVE · OI · 장비 한눈에', go:function(){ openCust360(c); }, exact:true, k:'c360'}); });
  src.forEach(function(s){ if(s.t==='장비' && fkNorm(s.nm)===qn) exact.push({t:'장비 시리얼', nm:s.nm, sb:s.sb, go:s.go, exact:true, k:'sn'}); });
  menus.filter(function(m){ return m.exact; }).forEach(function(m){ exact.push(m); });
  hits=hits.concat(exact);
  /* 정확히 같은 것 다음: 이름이 그 글자로 «시작»하는 고객 → 시작하는 화면 → 중간에 들어 있는 고객 → 나머지 화면 (예: «OI» = OI 현황 화면이 «검증_OI» 고객보다 먼저) */
  var cp=function(c){ return fkNorm(c).indexOf(qn)===0; };
  var cs=Object.keys(cust).filter(function(c){ return !cust[c].ex; }).sort(function(a,b){ return fkNorm(a).indexOf(qn)-fkNorm(b).indexOf(qn) || a.length-b.length; }).slice(0,4);
  var cH=function(c){ return {t:'고객 360', nm:c, sb:'계약 · LIVE · OI · 장비 한눈에', go:function(){ openCust360(c); }, k:'c360'}; };
  var ms=menus.filter(function(m){ return !m.exact; }).slice(0,3);
  cs.filter(cp).forEach(function(c){ hits.push(cH(c)); });
  ms.filter(function(m){ return m.pre; }).forEach(function(m){ hits.push(m); });
  cs.filter(function(c){ return !cp(c); }).forEach(function(c){ hits.push(cH(c)); });
  ms.filter(function(m){ return !m.pre; }).forEach(function(m){ hits.push(m); });
  var shown={}; hits.forEach(function(h){ if(h.k==='c360') shown[h.nm]=1; });
  if(qn.length>=2) src.forEach(function(s){
    if(recs.length>=5) return;
    if(s.cust && shown[s.cust] && (s.t==='계약' || s.t==='LIVE' || s.t==='임대신청')) return;   /* 고객 360 에 있는 고객사의 계약 · LIVE 줄은 빼고 */
    if(fkNorm(s.nm).indexOf(qn)<0 && fkNorm(s.sb).indexOf(qn)<0) return;
    if(s.t==='장비' && fkNorm(s.nm)===qn) return;
    var key=s.t+'|'+s.nm+'|'+s.sb; if(seen[key]) return; seen[key]=1; recs.push({t:s.t, nm:s.nm, sb:s.sb, go:s.go, k:'rec'});
  });
  hits=hits.concat(recs);
  if(String(q).trim().length>=2 && !ST.IS_EQUIP) hits.push({t:'AI 질문', nm:String(q).trim(), sb:'매출 · 고객 · 계약 · 할 일 데이터로 답합니다', k:'ask'});
  return hits;
}
/** 빈 입력(클릭 · Ctrl+K 같음) — 최근 본 고객 · 자주 쓰는 화면 · 최근 질문 */
export function srchEmpty(){
  var out=[], seen={};
  if(HOME.custHint){
    rcCusts().slice(0,4).forEach(function(c){ if(seen['c'+c]) return; seen['c'+c]=1; out.push({t:'최근 본 고객', nm:c, sb:'고객 360', go:function(){ openCust360(c); }, k:'c360', grp:'고객사 — 이름 일부를 적고 Enter'}); });
    topCusts(6).forEach(function(c){ if(seen['c'+c.c] || out.length>=7) return; seen['c'+c.c]=1; out.push({t:'월 매출 상위', nm:c.c, sb:won(c.v)+'천원 · 고객 360', go:function(){ openCust360(c.c); }, k:'c360', grp:'고객사 — 이름 일부를 적고 Enter'}); });
    return out;
  }
  var rc=rcCusts().slice(0,4);
  rc.forEach(function(c){ out.push({t:'고객 360', nm:c, sb:'최근 본 고객', go:function(){ openCust360(c); }, k:'c360', grp:'최근 본 고객'}); });
  /* 처음 쓰는 브라우저(최근 기록 없음)에도 같은 모양 — 월 매출 상위 고객 · 기본 바로가기 화면 */
  if(!rc.length) topCusts(3).forEach(function(c){ out.push({t:'고객 360', nm:c.c, sb:'월 매출 상위 · '+won(c.v)+'천원', go:function(){ openCust360(c.c); }, k:'c360', grp:'주요 고객 — 이름 일부를 적고 Enter'}); });
  var rec=[]; try{ rec=JSON.parse(localStorage.getItem(recentKey())||'[]')||[]; }catch(e){}
  var vs=[]; freqTop(5).concat(rec).concat(HOME_QUICK.map(function(x){ return x[0]; })).forEach(function(v){ if(vs.indexOf(v)<0 && v!==ST.CUR_VIEW && v.charAt(0)!=='@' && document.querySelector('#side button[data-v="'+v+'"]') && visBtn(/** @type {any} */(document.querySelector('#side button[data-v="'+v+'"]')))) vs.push(v); });
  vs.slice(0,5).forEach(function(v){ out.push({t:'화면', nm:viewLabel(v), sb:'자주 · 최근 연 화면', go:function(){ navMenu(v); }, k:'menu', grp:'자주 쓰는 화면'}); });
  (ST.HIST||[]).slice().reverse().forEach(function(h){ var t=String(h.q||'').split('\n')[0]; if(!t || seen['q'+t] || out.filter(function(x){ return x.k==='ask'; }).length>=3) return; seen['q'+t]=1; out.push({t:'AI 질문', nm:t, sb:'다시 물어보기', k:'ask', grp:'최근 질문'}); });
  return out;
}
/** 최근 연 고객 360 (이 브라우저 · 계정별) */
export function rcKey(){ return 'svc_rc360_'+(ST.AUTH_USER||'anon'); }
export function rcCusts(){ try{ return JSON.parse(localStorage.getItem(rcKey())||'[]')||[]; }catch(e){ return []; } }
export function rcPush(c){ if(!c) return; try{ var a=rcCusts().filter(function(x){ return x!==c; }); a.unshift(c); localStorage.setItem(rcKey(), JSON.stringify(a.slice(0,8))); }catch(e){} }
/** 홈 기준월 인식 금액이 큰 고객사 n곳 (전체 사업) */
export function topCusts(n){
  if(!ST.DATA) return []; var b=homeB(), m={};
  ST.DATA.rows.forEach(function(r, k){ var v=ST.MAT[k][b]||0; if(!v) return; m[r.cust]=(m[r.cust]||0)+v; });
  return Object.keys(m).map(function(c){ return {c:c, v:m[c]}; }).sort(function(a,b){ return b.v-a.v; }).slice(0, n||5);
}
/** 입력칸 + 결과 목록 — where: home(홈 맨 위 · 아래로 펼침) / ovl(검색 창) */
export function srchBind(inp, box, where){
  if(!inp || !box) return;
  box.removeAttribute('role');   /* 목록(role=listbox)은 안쪽 .sr-lb — 아래 «Enter 가 할 일» 줄은 목록 밖 */
  inp.setAttribute('role','combobox'); inp.setAttribute('aria-autocomplete','list'); inp.setAttribute('aria-controls', box.id+'_lb'); inp.setAttribute('aria-expanded','false');
  inp.addEventListener('input', function(){ HOME.custHint=0; clearTimeout(box._t); box._t=setTimeout(function(){ srchRender(inp, box, where); }, 80); });
  inp.addEventListener('focus', function(){ srchRender(inp, box, where, true); try{ if(inp.value) inp.select(); }catch(e){} });   /* 클릭 · Ctrl+K 모두 같은 목록 · 지난 검색어는 골라진 채(바로 바꿔 쓰기) */
  inp.addEventListener('mousedown', function(){ if(document.activeElement===inp && box.hidden) setTimeout(function(){ srchRender(inp, box, where, true); }, 0); });
  if(where==='home') inp.addEventListener('blur', function(){ setTimeout(function(){ if(document.activeElement!==inp) srchClose(inp, box); }, 160); });
  inp.addEventListener('keydown', function(e){
    if(e.isComposing || e.keyCode===229) return;
    var L=box._hits||[], on=!box.hidden && L.length;
    if(e.key==='ArrowDown'){ e.preventDefault(); if(!on){ srchRender(inp, box, where, true); return; } srchSel(inp, box, (box._sel+1)%L.length); }
    else if(e.key==='ArrowUp' && on){ e.preventDefault(); srchSel(inp, box, (box._sel-1+L.length)%L.length); }
    else if(e.key==='Escape'){ if(on && where==='home'){ e.preventDefault(); e.stopPropagation(); srchClose(inp, box); } }
    else if(e.key==='Enter'){ e.preventDefault(); e.stopPropagation();
      var v=inp.value.trim();
      if((e.ctrlKey || e.metaKey) && v){ srchRun({k:'ask', nm:v}, inp, box, where); return; }   /* Ctrl+Enter = AI 에 질문 */
      if(v && box._q!==v){ clearTimeout(box._t); srchRender(inp, box, where); L=box._hits||[]; on=!box.hidden && L.length; }   /* 빨리 치고 Enter — 지금 글자로 */
      if(on && box._sel>=0) srchRun(L[box._sel], inp, box, where);
      else if(v) srchRun({k:'ask', nm:v}, inp, box, where); }
  }, true);
}
export function srchClose(inp, box){ box.hidden=true; box.classList.remove('on'); box.innerHTML=''; box._hits=[]; box._sel=-1; inp.setAttribute('aria-expanded','false'); inp.removeAttribute('aria-activedescendant'); }
export function srchSel(inp, box, i){
  box._sel=i; box.querySelectorAll('.sr-it').forEach(function(x, j){ x.setAttribute('aria-selected', j===i? 'true':'false'); if(j===i) try{ x.scrollIntoView({block:'nearest'}); }catch(e){} });
  if(i>=0) inp.setAttribute('aria-activedescendant', box.id+'_'+i); else inp.removeAttribute('aria-activedescendant');
  var h=(box._hits||[])[i], f=box.querySelector('.sr-foot');
  if(f) f.innerHTML=h? tpl`<kbd>Enter</kbd> ${h.k==='ask'? 'AI 에 질문 «'+h.nm+'»' : h.t+' «'+h.nm+'» 열기'}${rawHtml(String(inp.value).trim().length>=2 && h.k!=='ask'? ' · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> AI 에 질문' : '')}` : tpl`<kbd>↑</kbd><kbd>↓</kbd> 고르기`;
}
/** keep: 지난 검색어 · 고른 줄로 다시 그림(돌아왔을 때) */
export function srchRender(inp, box, where, keep){
  clearTimeout(box._t);
  var M=HOME.srch[where]||{q:'', i:-1};
  if(keep && !inp.value && M.q && where==='ovl') inp.value=M.q;
  var v=inp.value.trim(), hits=v? srchHits(v) : srchEmpty(); box._q=v;
  if(!hits.length){ srchClose(inp, box); if(where==='ovl' && v){ box.hidden=false; box.innerHTML='<p class="cap sr-none">찾는 항목이 없습니다 — «AI 에 질문»으로 물어보세요</p>'; } return; }
  /* 기본 선택(Enter 대상): 정확히 같은 것 → 문장이면 AI 질문 → 아니면 첫 검색 결과 → 결과가 없을 때만 AI 질문 · 빈 입력이면 선택 없음 */
  var sel=-1, ai=-1; hits.forEach(function(x, j){ if(x.k==='ask' && ai<0) ai=j; });
  if(v){ for(var i=0;i<hits.length;i++){ if(hits[i].exact){ sel=i; break; } }
    if(sel<0 && looksQuestion(v) && ai>=0) sel=ai;
    if(sel<0) for(i=0;i<hits.length;i++){ if(hits[i].k!=='ask'){ sel=i; break; } }
    if(sel<0) sel=ai; }
  if(keep && M.q===v && M.i>=0 && M.i<hits.length) sel=M.i;
  /* 묶음(고객 · 화면 · 기록 …)마다 role=group + 이름표 — listbox 안에는 option · group 만 */
  var groups=[], cur=null;
  hits.forEach(function(h, j){ var g=h.grp||''; if(!cur || cur.g!==g){ cur={g:g, items:[]}; groups.push(cur); } cur.items.push(j); });
  var opt=function(j){ var h=hits[j]; return tpl`<div class="sr-it k-${h.k||'rec'}${h.exact?' ex':''}" role="option" id="${box.id}_${String(j)}" data-i="${String(j)}" aria-selected="false"><span class="tp">${h.t}</span><span class="nm">${h.k==='ask'? '«'+h.nm+'» AI 에 질문' : h.nm||''}</span><span class="sb">${h.exact? '일치 · ' : ''}${h.sb||''}</span><kbd class="ent" aria-hidden="true">Enter</kbd></div>`; };
  box.innerHTML=tpl`<div class="sr-lb" role="listbox" id="${box.id}_lb" aria-label="검색 결과">${rawHtml(groups.map(function(G, gi){
    var items=G.items.map(opt).join('');
    return G.g? tpl`<div class="sr-grp" role="group" aria-labelledby="${box.id}_g${String(gi)}"><div class="sr-g" id="${box.id}_g${String(gi)}" aria-hidden="true">${G.g}</div>${rawHtml(items)}</div>` : items; }).join(''))}</div><div class="sr-foot" aria-live="polite"></div>`;
  box._hits=hits; box.hidden=false; box.classList.add('on'); inp.setAttribute('aria-expanded','true');
  srchSel(inp, box, sel);
  box.querySelectorAll('.sr-it').forEach(function(row){
    /** @type {any} */(row).onmousedown=function(e){ e.preventDefault(); };
    /** @type {any} */(row).onclick=function(){ srchRun(hits[+/** @type {any} */(row).dataset.i], inp, box, where); }; });
}
export function srchRun(h, inp, box, where){
  if(!h) return;
  HOME.srch[where]={q:inp.value.trim(), i:box._sel};   /* 돌아왔을 때 검색어 · 고른 줄 그대로 */
  clearTimeout(box._t); srchClose(inp, box); HOME.custHint=0;
  if(h.k==='ask'){ askFrom(where, h.nm); return; }
  if(where==='ovl') closeOvl('ovlFind');
  try{ inp.blur(); }catch(e){}
  try{ h.go(); }catch(e){ console.warn('search go', e); }
}
/** 입력칸에서 AI 에 질문 — 답은 AI 패널(홈 배치를 밀지 않음) · 입력칸은 비우고 «검색으로 바꾸기»로 되돌릴 수 있음 */
export function askFrom(where, q){
  q=String(q||'').trim(); if(!q) return;
  var C=null;
  if(where==='ovl'){ C=HOME.ctxOn? HOME.ctx : null; closeOvl('ovlFind'); var fi=/** @type {any} */(document.getElementById('fkInput')); if(fi) fi.value=''; }
  else { var qi=/** @type {any} */(document.getElementById('q')); if(qi){ qi.value=''; try{ qi.blur(); }catch(e){} } }
  ask(q, {from:where, ctx:C});
}

/* ------------------------------------------------------------------
   검색 창(다른 화면) — 보던 화면의 실제 조건을 문맥으로
   ------------------------------------------------------------------ */
/** 지금 보던 화면의 문맥 — {v, label, parts:[…], text, n, sums} · 표 화면은 실제 필터 값 · 보이는 행 수 · 금액 합계까지 */
export function srchCtx(){
  var v=ST.CUR_VIEW||'dash', parts=[], label=v==='dash'? '홈' : viewLabel(v), n=null, sums=[];
  if(v==='dash'){ parts.push('홈 기준월 '+mk(homeB())+' · 전체 사업'); var hc=homeCond(); if(!/필터 없음/.test(hc)) parts.push('사업 분석 조건 '+hc+'(홈 숫자에는 안 씀)'); }
  else if(GRIDS[v] && !GRIDS[v].custom){
    var g=GRIDS[v], w=null; try{ w=wvCur(v); }catch(e){} if(w) parts.push('보기 «'+w[0]+'»');
    var s=/** @type {any} */(document.getElementById('dvSearch')); if(s && s.value.trim()) parts.push('검색 «'+s.value.trim()+'»');
    if(DV.pre && DV.pre.label) parts.push('조건 «'+String(DV.pre.label).split(' — ')[0]+'»');
    if(g.chipsField && DV.chipVal) parts.push((g.cols.filter(function(c){ return c.k===g.chipsField; })[0]||{l:g.chipsField}).l+' = '+DV.chipVal);
    Object.keys(DV.filters||{}).forEach(function(k){ var x=DV.filters[k]; if(!x || !x.length) return; var c=g.cols.filter(function(c2){ return c2.k===k; })[0];
      parts.push((c? c.l : k)+' = '+[].concat(x).slice(0,6).join(', ')+(x.length>6? ' 외 '+(x.length-6)+'개':'')); });
    try{ var rows=gridFilteredSorted(g); n=rows.length;
      g.cols.filter(function(c){ return c.won; }).slice(0,3).forEach(function(c){ var t=rows.reduce(function(a,r){ return a+(Number(r[c.k])||0); },0); if(t) sums.push(c.l+' 합계 '+won(t/1000)+'천원'); }); }catch(e){}
    if(n!=null) parts.push('목록 '+n+'행'+(sums.length? ' · '+sums.join(' · ') : ''));
  }
  else {   /* 표가 아닌 분석 화면 — 화면에 적힌 «적용 기준» 그대로(해지율 · 고객 증감 등) */
    var ap=document.querySelector('.cr-applied'); if(ap && ap.offsetParent) parts.push(String(ap.textContent||'').replace(/\s+/g,' ').trim());
  }
  return {v:v, label:label, parts:parts, n:n, sums:sums, text:'(참고 — 사용자가 보던 화면: '+label+(parts.length? ' · '+parts.join(' · ') : '')+' · 이 조건은 화면 설명이며, 답에서 같은 조건을 적용했는지 밝혀 주세요)'};
}
export function openFindX(){
  if(!ST.SB_TOKEN || !ST.DATA) return;
  if(ST.RAWX.inbound===undefined && !ST.IS_EQUIP) try{ loadInbound(function(){}); }catch(e){}
  var inp=/** @type {any} */(document.getElementById('fkInput')), out=/** @type {any} */(document.getElementById('fkOut')); if(!inp || !out) return;
  if(!inp._sb){ inp._sb=1; srchBind(inp, out, 'ovl');
    var ab=document.getElementById('fkAsk'); if(ab) ab.onclick=function(){ var v=inp.value.trim(); if(v){ HOME.srch.ovl={q:v, i:-1}; askFrom('ovl', v); } else inp.focus(); }; }
  HOME.ctx=srchCtx(); HOME.ctxOn=true; fkCtxPaint();
  openOvl('ovlFind'); inp.value=HOME.srch.ovl.q||''; srchRender(inp, out, 'ovl', true);
  setTimeout(function(){ inp.focus(); try{ inp.select(); }catch(e){} }, 60);
}
export function fkCtxPaint(){
  var c=document.getElementById('fkCtx'), C=HOME.ctx; if(!c) return;
  if(!C || C.v==='dash'){ c.hidden=true; c.innerHTML=''; return; }
  c.hidden=false;
  c.innerHTML=tpl`<span class="fk-cl">AI 질문에 함께 보낼 화면 조건</span><span class="fk-cv${HOME.ctxOn?'':' off'}">${C.label}${C.parts.length? ' · '+C.parts.join(' · ') : ''}</span>`+
    tpl`<button type="button" class="cbtn" id="fkCtxX" title="AI 질문에 보던 화면 · 조건을 함께 보낼지">${HOME.ctxOn? '조건 빼기' : '조건 넣기'}</button>`;
  /** @type {any} */(c.querySelector('#fkCtxX')).onclick=function(){ HOME.ctxOn=!HOME.ctxOn; fkCtxPaint(); };
}

/* ------------------------------------------------------------------
   AI 패널 — 오른쪽(좁으면 전체) · 닫아도 대화 유지 · 새 대화 / 대화 삭제
   ------------------------------------------------------------------ */
export function aipOpenBtn(){
  var b=document.getElementById('aipOpenBtn');
  if(!b){ b=document.createElement('button'); b.type='button'; b.id='aipOpenBtn'; b.className='pill ghost aip-open'; b.hidden=true;
    b.onclick=function(){ aipOpen(true); }; var tb=document.querySelector('#app .topbar'); if(tb) tb.appendChild(b); }
  return b;
}
export function aipInit(){
  var p=document.getElementById('aiPanel'); if(!p || p._init) return; p._init=1;
  var c=document.getElementById('aipClose'); if(c) c.onclick=function(){ aipClose(); };
  var n=document.getElementById('aipNew'); if(n) n.onclick=function(){ aipNew(); };
  var d=document.getElementById('aipDel'); if(d) d.onclick=function(){ aipDel(); };
  var ts=document.getElementById('ansToSearch'); if(ts) ts.onclick=function(){ ansToSearch(); };
  var f=document.getElementById('aipForm'); if(f) f.addEventListener('submit', function(e){ e.preventDefault(); var i=/** @type {any} */(document.getElementById('aipInput')), v=i.value.trim(); if(!v) return; i.value='';
    var C=ST.CUR_VIEW!=='dash'? srchCtx() : null; ask(v, {from:'panel', ctx:C}); });
  p.addEventListener('keydown', function(e){ if(e.key==='Escape' && !document.querySelector('.ovl.on')){ e.stopPropagation(); aipClose(); } });
  /* 패널 밖에서도 Esc = 패널 닫기(대화는 그대로) — 다른 창이 열려 있거나 글을 입력하는 칸에 있으면 그쪽이 먼저 */
  document.addEventListener('keydown', function(e){
    if(e.key!=='Escape' || !aipShown() || document.querySelector('.ovl.on') || document.querySelector('.auth-menu, #authMenu')) return;
    var a=/** @type {any} */(document.activeElement); if(a && p.contains(a)) return;
    if(a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
    aipClose();
  }, true);
  aipOpenBtn(); aipSync();
}
export function aipShown(){ var p=document.getElementById('aiPanel'); return !!(p && !p.hidden); }
export function aipOpen(focus){
  var p=/** @type {any} */(document.getElementById('aiPanel')); if(!p) return;
  p.hidden=false; document.body.classList.add('aip-on'); aipSync();
  if(focus){ var i=document.getElementById('aipInput'); setTimeout(function(){ try{ /** @type {any} */(i).focus({preventScroll:true}); }catch(e){} }, 30); }
}
/** 패널만 닫기 — 질문 · 답은 그대로(«AI 대화»로 다시 열면 보던 위치 그대로) */
export function aipClose(){
  var p=/** @type {any} */(document.getElementById('aiPanel')); if(!p || p.hidden) return;
  var inside=p.contains(document.activeElement);
  p.hidden=true; document.body.classList.remove('aip-on'); aipSync();
  var b=document.getElementById('aipOpenBtn'); if(inside && b && !b.hidden) try{ b.focus({preventScroll:true}); }catch(e){}
}
export function aipHas(){ var a=document.getElementById('answer'); return !!((a && a.classList.contains('on')) || document.querySelector('#ansThread .th, #aipOld .old-chat')); }
export function aipSync(){
  var b=aipOpenBtn(), has=aipHas(), n=HOME.nTurn + (document.getElementById('answer') && document.getElementById('answer').classList.contains('on')? 1 : 0);
  if(b){ var wasHid=b.hidden; b.hidden=!has || aipShown(); if(wasHid!==b.hidden) try{ placeSearchBtn(); }catch(e){}   /* 버튼이 생기거나 없어지면 위 메뉴가 잘리는지 다시 봄 */
    b.innerHTML=tpl`${rawHtml(ico('spark',15))}<span>AI 대화</span>${rawHtml(n? tpl`<b class="num">${String(n)}</b>` : '')}`; b.setAttribute('aria-label','AI 대화 다시 열기'+(n? ' — 문답 '+n+'개' : '')); b.classList.toggle('busy', isAsking()); }
  var s=document.getElementById('aipSub'); if(s) s.textContent=n? '문답 '+n+'개'+(HOME.newChat? ' · 새 대화' : '') : '';
  var d=/** @type {any} */(document.getElementById('aipDel')), nw=/** @type {any} */(document.getElementById('aipNew')); if(d) d.disabled=!has; if(nw) nw.disabled=!has;
}
/** 새 대화 — 지금 대화는 «지난 대화»로 접어 두고(다시 펼쳐 볼 수 있음) 새로 시작 · AI 는 앞 대화를 이어 쓰지 않음 */
export function aipNew(){
  if(isAsking()) try{ abortAsk(); }catch(e){}
  turnSnap();
  var th=document.getElementById('ansThread'), old=document.getElementById('aipOld');
  if(th && old && th.children.length){
    var first=th.querySelector('.th summary .q'), box=document.createElement('details'); box.className='old-chat';
    box.innerHTML=tpl`<summary>지난 대화 — ${first? first.textContent : ''} <span class="mini">문답 ${String(th.querySelectorAll('.th').length)}개</span></summary>`;
    while(th.firstChild) box.appendChild(th.firstChild); old.insertBefore(box, old.firstChild); }
  ansBlank(); HOME.nTurn=0; HOME.newChat=true; HOME.hist=[]; aipSync();
  var i=document.getElementById('aipInput'); if(i) try{ /** @type {any} */(i).focus(); }catch(e){}
  toast('새 대화', '지난 대화는 패널 아래쪽에 접어 두었습니다', 'info');
}
/** 대화 삭제 — 이 패널의 질문 · 답을 모두 지움(확인 후) · 서버의 AI 기록 보관함은 그대로 */
export function aipDel(){
  if(!aipHas()) return;
  if(!confirm('이 패널의 AI 대화를 모두 지울까요?\n(지난 대화 포함 · 서버에 남는 AI 기록 보관함은 지우지 않습니다)')) return;
  if(isAsking()) try{ abortAsk(); }catch(e){}
  ansBlank(); var th=document.getElementById('ansThread'), old=document.getElementById('aipOld'); if(th) th.innerHTML=''; if(old) old.innerHTML='';
  HOME.nTurn=0; HOME.newChat=true; HOME.hist=[]; HOME.cur=null; aipSync();
}
/** 데이터를 다시 읽었을 때 — 대화는 그대로, 패널에 «이전 데이터 기준» 한 줄(예전: 답을 닫음) */
export function aipStale(){
  if(!aipHas()) return; var b=document.getElementById('aipBody'); if(!b) return;
  var n=document.getElementById('aipStaleN'); if(!n){ n=document.createElement('p'); n.id='aipStaleN'; n.className='cap aip-stale'; b.insertBefore(n, b.firstChild); }
  n.textContent='데이터를 다시 읽었습니다('+new Date().toTimeString().slice(0,5)+') — 아래 답은 그전 데이터 기준입니다. 숫자가 중요하면 다시 물어보세요.';
}
/** 지금 답 칸 비우기 */
export function ansBlank(){
  var a=document.getElementById('answer'); if(!a) return; a.classList.remove('on');
  ['ansQ','ansLocal','ansEvLocal','ansSrcB','ansNext','ansMeta','ansNote','aiSay','ansTitle','ansHero','ansSub','ansSuggest'].forEach(function(id){ var e=document.getElementById(id); if(e) e.innerHTML=''; });
  var s=document.getElementById('aiSay'); if(s) s.className='ai-say';
  var st=document.getElementById('ansState'); if(st){ st.hidden=true; st.innerHTML=''; }
  var g=/** @type {any} */(document.getElementById('ansGrid')); if(g) g.style.display='none';
  HOME.cur=null; ansSync();
}
/** 지금 답을 «이전 문답»으로 — 요약이 아니라 원래 답 · 근거 · 원본/다음 버튼 그대로(접어 둠) */
export function turnSnap(){
  var a=document.getElementById('answer'), th=document.getElementById('ansThread'), C=HOME.cur;
  if(!a || !th || !C || !a.classList.contains('on') || !C.done) return;
  var c=/** @type {any} */(a.cloneNode(true));
  c.querySelectorAll('.ai-fb, .ans-top, #ansPin, .ans-state[hidden], .ans-sec[hidden], .ans-head[hidden]').forEach(function(x){ x.remove(); });
  c.removeAttribute('id'); c.querySelectorAll('[id]').forEach(function(x){ x.removeAttribute('id'); });
  c.className='answer on ans-old';
  c.querySelectorAll('.ans-src .ans-btns button').forEach(function(b){ var it=(C.src||[])[+b.dataset.i]; if(it) b.onclick=function(){ ansGo(it); }; else b.disabled=true; });
  c.querySelectorAll('.ans-next .ans-btns button').forEach(function(b){ var it=(C.next||[])[+b.dataset.i]; if(it) b.onclick=function(){ ansGo(it); }; else b.disabled=true; });
  c.querySelectorAll('.ans-evl [data-go]').forEach(function(b){ var f=(C.tgo||[])[+b.dataset.go]; if(f) b.onclick=function(){ ansGo({go:f}); }; else b.disabled=true; });
  c.querySelectorAll('.chips .chip').forEach(function(b){ b.onclick=function(){ ask(b.textContent, {from:'panel'}); }; });
  c.querySelectorAll('.ans-pick').forEach(function(x){ x.remove(); });
  var d=document.createElement('details'); d.className='th';
  d.innerHTML=tpl`<summary><span class="q">${C.q}</span> <span class="mini">${C.t||''}</span></summary>`; d.appendChild(c);
  th.appendChild(d); HOME.nTurn++;
}
/** 원본 · 다음 행동 버튼 — 넓은 화면은 패널을 연 채로(대화 · 위치 그대로) · 좁으면 패널을 닫고(«AI 대화»로 다시) */
export function ansGo(it){
  if(document.getElementById('ovlFind') && document.getElementById('ovlFind').classList.contains('on') && !it.stay) closeOvl('ovlFind');
  if(window.innerWidth<1100 && !it.stay) aipClose();
  try{ it.go(); }catch(e){ console.warn('ans go', e); }
}
/** «검색으로 바꾸기» — AI 질문으로 잘못 넘어갔을 때 입력한 글을 검색 칸으로 되돌림(생각 중이면 멈춤) */
export function ansToSearch(){
  var C=HOME.cur; if(!C) return; var q=C.q;
  if(isAsking()) try{ abortAsk(); }catch(e){}
  if(ST.CUR_VIEW==='dash' && homeOn()){ var qi=/** @type {any} */(document.getElementById('q')); if(window.innerWidth<1100) aipClose(); if(qi){ qi.value=q; qi.focus(); srchRender(qi, /** @type {any} */(document.getElementById('sug')), 'home'); } }
  else { HOME.srch.ovl={q:q, i:-1}; openFindX(); }
}
/** 새 질문 직전 — 앞 문답을 원래 모양 그대로 접어 두고 답 칸을 비움 · 패널 열기 */
export function homeBeforeAsk(q, opt){
  turnSnap();
  ansBlank();
  var a=document.getElementById('answer'); if(a) a.classList.add('on');
  var C=opt && opt.ctx;
  HOME.cur={q:q, from:(opt && opt.from)||'', ctx:C, src:[], next:[], tgo:[], t:new Date().toTimeString().slice(0,5), done:false};
  var qq=document.getElementById('ansQ'); if(qq) qq.innerHTML=tpl`<span class="ans-qq">${q}</span>${rawHtml(C? tpl`<span class="ans-ctx" title="질문과 함께 보낸 화면 조건 — AI 가 이 조건을 적용했는지는 답 내용으로 확인">보던 화면: ${C.label}${C.parts.length? ' · '+C.parts.join(' · ') : ''}</span>` : '')}`;
  aipOpen(false);
  try{ var body=document.getElementById('aipBody'); if(body && a) body.scrollTop=a.offsetTop-8; }catch(e){}
  ansSync(); aipSync();
}
/** 답이 끝났을 때 */
export function homeAfter(text){
  if(HOME.cur){ HOME.cur.done=true; HOME.cur.text=String(text||'').replace(/\s+/g,' ').trim(); }
  if(HOME.cur && text) try{ HOME.hist.push({q:HOME.cur.q, a:HOME.cur.text}); if(HOME.hist.length>10) HOME.hist.shift(); }catch(e){}
  ansSync(); aipSync();
}
/** AI 에 보낼 앞 문답 — 새 대화를 시작했으면 그 뒤 문답만 */
export function aiHistory(){ return (HOME.newChat? HOME.hist : (ST.HIST||[])).slice(-6); }
export function ansClear(){ var th=document.getElementById('ansThread'); if(th) th.innerHTML=''; HOME.nTurn=0; HOME.cur=null; aipSync(); }
/** 비어 있는 칸(근거 · 원본 · 다음 행동)은 제목째 숨김 */
export function ansSync(){
  var g=/** @type {any} */(document.getElementById('ansGrid')), el=document.getElementById('ansEvLocal'), cm=document.getElementById('aiComment');
  var ev=document.getElementById('ansEv'); if(ev) /** @type {any} */(ev).hidden=!((g && g.style.display!=='none') || (el && el.innerHTML.trim()) || (cm && cm.classList.contains('on')));
  var sr=document.getElementById('ansSrc'), sb=document.getElementById('ansSrcB'); if(sr) /** @type {any} */(sr).hidden=!(sb && sb.innerHTML.trim());
  var nx=document.getElementById('ansNextBox'), nb=document.getElementById('ansNext'), sg=document.getElementById('ansSuggest'); if(nx) /** @type {any} */(nx).hidden=!((nb && nb.innerHTML.trim()) || (sg && sg.innerHTML.trim()));
  var hd=document.querySelector('#answer .ans-head'); if(hd){ var t=document.getElementById('ansTitle'), he=document.getElementById('ansHero'), su=document.getElementById('ansSub');
    /** @type {any} */(hd).hidden=!((t && t.textContent.trim()) || (he && he.textContent.trim()) || (su && su.textContent.trim())); }
}
/** 버튼 줄 — [{l, go, pri, stay}] (화면만 엶) · 이전 문답으로 접어도 다시 쓰게 기억 */
export function ansBtns(host, list){
  if(!host) return; list=list||[];
  if(HOME.cur){ if(host.id==='ansSrcB') HOME.cur.src=list; else if(host.id==='ansNext') HOME.cur.next=list; }
  host.innerHTML=list.map(function(a, i){ return tpl`<button type="button" class="cbtn${a.pri?' pri':''}" data-i="${String(i)}">${a.l}</button>`; }).join('');
  host.querySelectorAll('button').forEach(function(b){ /** @type {any} */(b).onclick=function(){ ansGo(list[+/** @type {any} */(b).dataset.i]); }; });
}
export function ansMetaSet(m){
  var host=document.getElementById('ansMeta'); if(!host) return;
  var it=[['기준 기간',m.period],['단위',m.unit],['데이터',m.upd || (ST.DATA && ST.DATA.generatedAt? ST.DATA.generatedAt+' 읽음' : '')],['조건',m.cond],['대조',m.cmp]].filter(function(x){ return x[1]; });
  host.innerHTML=tpl`<dl>${rawHtml(it.map(function(x){ return tpl`<div><dt>${x[0]}</dt><dd>${x[1]}</dd></div>`; }).join(''))}</dl>`;
}
export function ansStateSet(kind, html){
  var st=document.getElementById('ansState'); if(!st) return;
  st.hidden=!html; st.className='ans-state'+(kind? ' '+kind : ''); st.innerHTML=html||'';
}
/** AI · 규칙형 답의 원본 보기 · 기준 (ai.js 가 부름) — p: 규칙형 해석 결과(있으면) · 보던 화면 조건은 «참고로 보냄»(적용 여부는 AI 답으로 확인) + 화면의 같은 조건 결과(행 수 · 합계)를 대조용으로 */
export function homeMetaAI(q, r, p, opt){
  var C=opt && opt.ctx, src=[], custs=p && (p.custs && p.custs.length? p.custs : (p.cust? [p.cust] : [])) || [];
  custs.slice(0,2).forEach(function(c){ src.push({l:'고객 360 — '+c, go:function(){ openCust360(c); }}); });
  if(p) src.push({l:'계약 목록에서 확인', go:function(){ switchView('contracts'); var s=/** @type {any} */(document.getElementById('dvSearch')); if(s && custs.length===1){ s.value=custs[0]; try{ s.dispatchEvent(new Event('input')); }catch(e){} } }});
  if(C && C.v && C.v!=='dash' && ST.CUR_VIEW!==C.v) src.push({l:'보던 화면으로 — '+C.label, go:function(){ navMenu(C.v); }});
  ansBtns(document.getElementById('ansSrcB'), src);
  ansMetaSet({period:p? '' : mk(homeB())+' 데이터 기준', unit:p? '천원(포탈 계산 표)' : '천원',
    cond:C? '참고로 보낸 화면 조건 — '+C.label+(C.parts.length? ' · '+C.parts.join(' · ') : '')+' (AI 가 같은 조건을 적용했는지는 답 내용으로 확인)' : (p? '' : '홈 · 전체 데이터'),
    cmp:C && C.n!=null? '화면의 같은 조건 결과 — '+C.n+'행'+(C.sums.length? ' · '+C.sums.join(' · ') : '') : ''});
  ansSync();
}

/* ------------------------------------------------------------------
   ② 핵심 현황 — 전체 사업 · 이번 달 고정(사업 분석 필터와 무관) · ③ 바로가기 · ④ 매출 추이 + 우선 업무 · ⑤ 최근
   ------------------------------------------------------------------ */
/** 홈 기준월 — 처음 읽을 때 정한 «오늘이 속한 달(자료가 있는 마지막 달까지)» · 사업 분석의 기준월을 바꿔도 홈은 그대로 */
export function homeB(){ var b=ST.DASH_BASE0; if(b==null) b=STATE.base; return Math.max(0, Math.min(b, ST.M-1)); }
export function homeIsNow(){ return !!(ST.DATA && homeB()===ST.DATA.nowIdx); }
/** 사업 분석(상세)의 조건 문장 — 홈 숫자에는 쓰지 않음 */
export function homeCond(){
  if(!ST.DATA) return '';
  var t=[], off=(ST.DATA.lines||[]).filter(function(l){ return STATE.lines[l.label]===false; }).map(function(l){ return lline(l.label); });
  if(off.length) t.push('서비스 '+off.length+'개 제외('+off.join('·')+')');
  if(STATE.ind) t.push('산업군 '+STATE.ind); if(STATE.partner) t.push('파트너 '+STATE.partner); if(STATE.status) t.push('상태 '+STATE.status); if(STATE.search) t.push('검색 «'+STATE.search+'»');
  if(STATE.unit!=='month') t.push((STATE.unit==='quarter'? '분기':'연')+' 단위');
  if(STATE.base!==homeB()) t.push('기준월 '+mk(STATE.base));
  return t.length? t.join(' · ') : '전체 서비스 · 필터 없음';
}
/** 핵심 현황 숫자 — 홈 3칸 · 추천 질문 답이 같은 값 · 모든 계약 · 홈 기준월 */
export function homeNums(){
  var all=[]; for(var k=0;k<ST.DATA.rows.length;k++) all.push(k);
  var b=homeB(), m0=monthlyTotal(all,b), m1=b>0? monthlyTotal(all,b-1) : null, y1=b>=12? monthlyTotal(all,b-12) : null;
  var lv=null; try{ lv=liveData(b); }catch(e){} var uq={}, per={}, ps=0;
  if(lv && lv.ok) lv.rows.forEach(function(x){ uq[x.cust]=1; (per[x.line]=per[x.line]||{})[x.cust]=1; });
  Object.keys(per).forEach(function(l){ ps+=Object.keys(per[l]).length; });
  var RN=renewNeedScan(all, b);
  return {list:all, b:b, m0:m0, m1:m1, d:(m1? (m0-m1)/m1*100 : null), y1:y1, dy:(y1? (m0-y1)/y1*100 : null), liveOk:!!(lv && lv.ok), nC:Object.keys(uq).length, ps:ps, RN:RN};
}
export function homeMonthName(b){ return homeIsNow()? '이번 달('+mk(b)+')' : mk(b)+'(최근 집계월)'; }
/** 홈 섹션 자리 — #viewDash 안에 없으면 만듦(.ask 다음 순서는 CSS order) */
export function homeHost(id, cls, tag){
  var vd=document.getElementById('viewDash'), el=document.getElementById(id); if(!vd) return null;
  if(!el){ el=document.createElement(tag||'section'); el.id=id; el.className=cls||''; vd.appendChild(el); }
  return el;
}
export function homeSum(){
  if(!homeOn() || !ST.DATA) return;
  var host=homeHost('gnSum', 'gn-sum', 'div'); if(!host) return;
  var N=homeNums(), b=N.b, RN=N.RN;
  function cell(k, cls, lab, v, u, sub, basis, tip){ return tpl`<button type="button" class="gs-c ${rawHtml(cls)}" data-k="${k}" title="${tip}"><span class="gs-l">${lab}</span><span class="gs-v"><b class="num">${v}</b><small>${u}</small></span><span class="gs-s">${sub}</span><span class="gs-b">${basis}</span></button>`; }
  host.setAttribute('aria-labelledby','gnSumH');
  host.innerHTML=tpl`<h2 class="sr" id="gnSumH">핵심 현황 — 전체 사업 · ${mk(b)}</h2>`+
    cell('mrr','', homeMonthName(b)+' 매출', won(N.m0), '천원', N.d==null? '전월 자료 없음' : '전월 대비 '+(N.d>=0?'+':'')+N.d.toFixed(1)+'%', '전체 사업 · 월 인식 매출', '모든 계약의 '+mk(b)+' 인식 매출(천원) — 사업 분석의 필터와 무관 · 누르면 매출 추이')+
    cell('live','', 'LIVE 고객', N.liveOk? String(N.nC) : '—', N.liveOk? '곳' : '', N.liveOk? (N.ps>N.nC? '제품별 합 '+N.ps+' — 두 제품 이상 '+(N.ps-N.nC)+'곳' : '제품별 합 '+N.ps) : '불러오는 중', mk(b)+' 유효 원계약 · 회사 수', '회사 수 기준(제품별 합은 제품마다 1곳) — 누르면 LIVE 고객사 목록')+
    cell('rnw', RN.rows.length? 'warn':'', '재약정 대응 필요', String(RN.rows.length), '건', RN.xs.EN+'개월 내 만료 '+RN.xs.rows.length+'건 중 · 월 '+won(RN.amt)+'천원', '원계약 · 자동연장 · 재약정 등록 제외', '자동연장 · 후속 계약(재약정 등록)이 확실한 계약을 뺀 만료 원계약 — 누르면 같은 목록');
  host.querySelectorAll('.gs-c').forEach(function(c){ /** @type {any} */(c).onclick=function(){ var k=/** @type {any} */(c).dataset.k;
    if(k==='mrr'){ var t=document.getElementById('gnTrend'); if(t) try{ t.scrollIntoView({behavior:'smooth', block:'center'}); /** @type {any} */(t).focus({preventScroll:true}); }catch(e){} }
    else if(k==='live') switchView('live'); else kpiOpen('expNeed', {home:1}); }; });
}
/** 바로가기 — 자주 하는 업무에 한 번에(메뉴 재진입 = 마지막 상태 그대로) */
export var HOME_QUICK=[['contracts','계약','doc'],['@cust','고객 검색','search'],['oi','OI','target'],['eqboard','장비','box'],['quote','견적','scale'],['weekly','주간회의','calendar'],['inbound','인바운드','inbox']];
export function homeQuick(){
  var host=homeHost('gnQuick', 'gn-quick', 'nav'); if(!host) return; host.setAttribute('aria-label','바로가기');
  var its=HOME_QUICK.filter(function(x){ if(x[0]==='@cust') return true; var b=document.querySelector('#side button[data-v="'+x[0]+'"]'); return !!b && visBtn(/** @type {any} */(b)); });
  host.innerHTML=its.map(function(x){ var full=x[0]==='@cust'? '고객사 이름으로 고객 360 찾기' : (function(){ var b=document.querySelector('#side button[data-v="'+x[0]+'"]'); return b? navText(b) : x[1]; })();
    return tpl`<button type="button" data-q="${x[0]}" title="${full}${x[0]==='@cust'? '' : ' — 마지막 작업 상태로'}">${rawHtml(ico(x[2],16))}<span>${x[1]}</span></button>`; }).join('');
  host.querySelectorAll('button').forEach(function(b){ /** @type {any} */(b).onclick=function(){ var v=/** @type {any} */(b).dataset.q; if(v==='@cust') homeFindCust(); else navMenu(v); }; });
}
/** 매출 추이 — 최근 12개월 하나(전체 사업) · 상세 차트 · 분석은 아래 «사업 현황 상세»에서 펼침 */
export function homeTrend(){
  var host=homeHost('gnTrend', 'card gn-trend'); if(!host || !ST.DATA) return;
  host.tabIndex=-1;
  var N=homeNums(), b=N.b, from=Math.max(0, b-11), labs=[], dat=[];
  for(var j=from;j<=b;j++){ labs.push(mk(j).slice(2).replace('-','.')); dat.push(Math.round(monthlyTotal(N.list, j))); }
  var open=homeDetailOpen();
  host.innerHTML=tpl`<div class="gt-h"><h2>매출 추이 <span class="mini">최근 ${String(labs.length)}개월 · 전체 사업 · 월 인식 매출(천원)</span></h2>`+
    tpl`<span class="gt-d">${rawHtml(N.dy==null? '' : tpl`전년 같은 달 대비 <b class="${N.dy>=0?'up':'down'}">${(N.dy>=0?'+':'')+N.dy.toFixed(1)}%</b>`)}</span></div>`+
    tpl`<div class="chartbox gt-c" id="gnTrendC" role="img" aria-label="최근 ${String(labs.length)}개월 매출 추이 — ${labs[0]} ${won(dat[0])}천원에서 ${labs[labs.length-1]} ${won(dat[dat.length-1])}천원"></div>`+
    tpl`<button type="button" class="gt-more" id="gnDetailBtn" aria-expanded="${open?'true':'false'}" aria-controls="ccHeroHost">${open? '사업 현황 상세 · 분석 접기 ▴' : '사업 현황 상세 · 분석 펼치기 ▾'}<span class="mini">목표 ARR · LIVE 제품별 · 만료 기간 · 신규/해지 · 장비 · 채널 · 월별 장표</span></button>`;
  var c=document.getElementById('gnTrendC');
  try{ if(c) Viz.lines(c, {labels:labs, series:[{label:'월 매출', data:dat, color:cssv('--s1')}], fmt:won, tipFmt:wonFull, fill:true}); }catch(e){}
  var db=document.getElementById('gnDetailBtn'); if(db) db.onclick=function(){ homeDetail(!homeDetailOpen(), true); };
}
export function homeDetailOpen(){ return ccPref('svc_home_detail'); }
/** 사업 현황 상세 · 분석 — 같은 화면에서 펼침(위의 검색 · 핵심 현황 · 우선 업무는 그대로) */
export function homeDetail(open, scroll){
  ccPrefSet('svc_home_detail', !!open);
  var hadF=!!document.activeElement && document.activeElement.id==='gnDetailBtn';
  var vd=document.getElementById('viewDash'); if(vd) vd.classList.toggle('hm-detail', !!open); document.body.classList.toggle('hm-detail-on', !!open);
  var db=document.getElementById('gnDetailBtn'); if(db){ db.setAttribute('aria-expanded', open? 'true':'false'); db.firstChild.textContent=open? '사업 현황 상세 · 분석 접기 ▴' : '사업 현황 상세 · 분석 펼치기 ▾'; }
  homeDetailBar();
  if(open){ requestAnimationFrame(function(){ try{ renderAll(); }catch(e){} if(hadF){ var nb=/** @type {any} */(document.getElementById('gnDetailBtn')); if(nb) try{ nb.focus({preventScroll:true}); }catch(e){} } if(scroll){ var h=document.getElementById('gnBizH'); if(h) try{ h.scrollIntoView({behavior:'smooth', block:'start'}); }catch(e){} } }); }
}
/** 상세 머리 — 사업 분석 조건(이 영역에만 적용) · 해제 */
export function homeDetailBar(){
  var h=document.getElementById('gnBizH'); if(!h || !homeOn()) return;
  var c=homeCond(), plain=/필터 없음/.test(c);
  h.innerHTML=tpl`<h2>사업 현황 상세 · 분석</h2><span>이 영역의 조건: ${c}${rawHtml(plain? '' : ' — 위 핵심 현황 · 매출 추이에는 적용 안 됨')}</span>${rawHtml(plain? '' : '<button type="button" class="cbtn" id="gnBizReset">조건 해제</button>')}`;
  var r=document.getElementById('gnBizReset'); if(r) r.onclick=function(){ dashResetIfChanged(); homeDetailBar(); };   /* 서비스 · 기준월 · 단위 · 업종 · 파트너 · 상태 · 검색 모두 처음으로 */
}
/** 최근 본 고객 · 최근 작업 — 짧게 한 줄씩 */
export function homeRecentRow(){
  var host=homeHost('gnRecent', 'gn-recent', 'section'); if(!host) return; host.setAttribute('aria-label','최근 본 고객 · 최근 작업');
  var cs=rcCusts().slice(0,6), rec=[]; try{ rec=JSON.parse(localStorage.getItem(recentKey())||'[]')||[]; }catch(e){}
  rec=rec.filter(function(v){ return !!document.querySelector('#side button[data-v="'+v+'"]'); }).slice(0,6);
  host.innerHTML=tpl`<div class="gr-l"><b>최근 본 고객</b>${rawHtml(cs.length? cs.map(function(c){ return tpl`<button type="button" class="chip" data-c="${c}">${c}</button>`; }).join('') : '<span class="cap">고객 360 을 열면 여기에 남습니다</span>')}</div>`+
    tpl`<div class="gr-l"><b>최근 작업</b>${rawHtml(rec.length? rec.map(function(v){ return tpl`<button type="button" class="chip" data-go="${v}">${viewLabel(v)}</button>`; }).join('') : '<span class="cap">메뉴를 열면 여기에 남습니다(다시 열면 마지막 상태)</span>')}</div>`;
  host.querySelectorAll('[data-c]').forEach(function(b){ /** @type {any} */(b).onclick=function(){ openCust360(/** @type {any} */(b).dataset.c); }; });
  host.querySelectorAll('[data-go]').forEach(function(b){ /** @type {any} */(b).onclick=function(){ navMenu(/** @type {any} */(b).dataset.go); }; });
}
/** 사업 현황 상세로(추천 질문 답의 원본 보기) */
export function homeBiz(){ if(ST.CUR_VIEW!=='dash') switchView('dash'); homeDetail(true, true); }

/* ------------------------------------------------------------------
   우선 업무 — 내 업무 / 팀 전체 · 기한 · 지연 · 담당으로 고른 3~5개 · 전체는 펼침
   ------------------------------------------------------------------ */
/** 줄의 급한 정도 — 0 지남/오늘 · 1 사흘 안 · 2 이번 달 · 3 예정 */
export function dueK(o){ if(o.dk!=null) return o.dk; return o.lv===1? 0 : o.lv===2? 2 : 3; }
/** 내 업무 줄 — 담당 칸이 있는 OI · 인바운드를 내 이름(계정 연결 · 없으면 이 브라우저 임시)으로 · 빠른 보기와 같은 기준 */
export function myRows(){
  var MO=myOwner(); if(!MO.names.length) return null;
  var out=[], dO={}, dI={}; (qvDefs('oi')||[]).forEach(function(d){ dO[d[0]]=d; }); (qvDefs('inbound')||[]).forEach(function(d){ dI[d[0]]=d; });
  var who=MO.names.join(' / '), oi=(ST.RAWX.oi||[]).filter(function(r){ return meMatch(r.owner) && oiOpen(r); });
  function row(key, view, d, base, nm, unit, dk, lv){ if(!d) return; var hit=base.filter(d[3]); if(!hit.length) return;
    out.push({key:key, lv:lv, dk:dk, nm:nm, cnt:unit+' '+hit.length+'건', dueS:dk===0? '지남 · 오늘' : dk===1? '오늘' : '정하기', own:who, mine:1,
      who:hit.slice(0,3).map(function(r){ return r.customer||r.org||''; }).join(', ')+(hit.length>3? ' 외 '+(hit.length-3)+'건':''), due:d[2], imp:'내 담당 '+unit+' '+hit.length+'건',
      acts:[{l:'목록 보기', pri:1, go:function(){ gridGoPre(view, '내 담당 · '+d[1]+' — '+d[2], function(r){ return meMatch(r.owner) && d[3](r); }); }}]}); }
  row('my-oi-late','oi', dO.late, oi, '내 OI 기한 초과', 'OI', 0, 1);
  row('my-oi-today','oi', dO.today, oi, '오늘 할 내 OI', 'OI', 1, 1);
  row('my-oi-none','oi', dO.nonext, oi, '다음 행동 없는 내 OI', 'OI', 2, 2);
  if(ST.RAWX.inbound!==undefined){ var inb=(ST.RAWX.inbound||[]).filter(function(r){ return meMatch(r.owner); });
    row('my-inb-first','inbound', dI.first, inb, '내 인바운드 첫 대응 지연', '문의', 0, 1);
    row('my-inb-idle','inbound', dI.idle, inb, '내 인바운드 장기 미접촉', '문의', 2, 2); }
  return out;
}
export function homeTodo(rows, zeros, snz){
  HOME.rows=rows; HOME.zeros=zeros||[]; HOME.snz=snz||0;
  var box=document.getElementById('ccInbox'); if(!box) return;
  var MO=myOwner(), mine=myRows(), scope=HOME.scope || (mine && mine.length? 'me' : 'team');
  if(scope==='me' && !mine) scope='team';
  var base=scope==='me'? (mine||[]).concat(rows.filter(function(o){ return o.own && meMatch(o.own); })) : rows;
  var ord=base.map(function(o,i){ return [o,i]; }).sort(function(a,c){ return dueK(a[0])-dueK(c[0]) || (a[0].lv||2)-(c[0].lv||2) || a[1]-c[1]; });
  /* 처음 보이는 줄: 지났거나 사흘 안(기한 기준) 전부 — 최대 5 · 적으면 다음 급한 것으로 3개까지 */
  var urgent=ord.filter(function(x){ return dueK(x[0])<=1; }), show=urgent.slice(0,5);
  if(show.length<3) show=ord.slice(0, Math.min(3, ord.length));
  if(HOME.allOpen) show=ord;
  var more=ord.length-show.length;
  var seg=tpl`<div class="seg hm-scope" role="group" aria-label="우선 업무 범위"><button type="button" data-sc="me" aria-pressed="${scope==='me'?'true':'false'}">내 업무</button><button type="button" data-sc="team" aria-pressed="${scope==='team'?'true':'false'}">팀 전체</button></div>`;
  var h=tpl`<div class="ib-head hm-head"><h2>우선 업무 <span class="ctag" data-n="${String(ord.length)}" title="업무 종류 수 — 대상 건수는 줄마다(신청 · 계약 · OI · 문의 단위가 달라 더하지 않음)">업무 ${String(ord.length)}가지</span></h2>${rawHtml(seg)}</div>`;
  if(scope==='me' || !MO.names.length) h+=tpl`<div class="hm-who">${rawHtml(MO.names.length? tpl`내 이름 <b>${MO.names.join(' / ')}</b> <span class="mini">${MO.src==='account'? '계정 연결(관리자 지정)' : '이 브라우저에서 고른 이름(임시)'}</span>` : tpl`<b class="need">담당자 연결 필요</b> <span class="mini">계정에 담당자 이름이 연결되지 않아 내 업무를 고를 수 없습니다(0건이 아님) — 관리자 › 담당자 연결 · 아래는 팀 전체</span> <button type="button" class="cbtn" id="hmPickMe">임시로 내 이름 고르기</button>`)}</div>`;
  if(!show.length) h+=tpl`<div class="ib-empty"><span class="ib-ic ok">${rawHtml(ico('check',16))}</span>${scope==='me'? '내 담당으로 지금 챙길 일이 없습니다 — 팀 전체를 보세요' : '지금 챙길 일이 없습니다'}</div>`;
  else {
    var LV={1:'즉시',2:'확인',3:'예정'};
    h+='<ul class="hm-list">';
    show.forEach(function(x){ var o=x[0], lv=o.lv||2, key=o.key, i=rows.indexOf(o);
      var pri=(o.acts||[]).filter(function(a){ return a.pri; })[0], rest=(o.acts||[]).filter(function(a){ return !a.pri; }), open=!!HOME.open[key];
      h+=tpl`<li class="ib-row hm-row lv${String(lv)}" data-key="${key}">`+
        tpl`<span class="hm-lv" title="${LV[lv]}"><i></i><span class="sr">${LV[lv]}</span></span>`+
        tpl`<button type="button" class="hm-nm" aria-expanded="${open?'true':'false'}" aria-controls="hmD_${key}" title="눌러서 대상 · 담당 · 기한 · 영향">${o.nm||String(o.t).replace(/<[^>]+>/g,'')}<span class="chev" aria-hidden="true">▾</span></button>`+
        tpl`<span class="hm-n num">${o.cnt||''}</span>`+
        tpl`<span class="hm-sub"><span class="hm-due">${o.dueS||o.due||''}</span><span class="hm-own${o.own?'':' none'}">${o.own || '담당 미지정'}</span></span>`+
        tpl`<span class="hm-act">${rawHtml(pri? tpl`<button type="button" class="cbtn pri" data-a="${String((o.acts||[]).indexOf(pri))}">${pri.l}</button>` : '')}</span>`+
        tpl`<div class="hm-d" id="hmD_${key}"${rawHtml(open? '' : ' hidden')}><dl class="ib-meta">${rawHtml([['대상',o.who],['담당',o.own||'담당 미지정'],['기한',o.due],['영향',o.imp]].filter(function(m){ return m[1]; }).map(function(m){ return tpl`<div><dt>${m[0]}</dt><dd>${m[1]}</dd></div>`; }).join(''))}</dl>`+
        tpl`${rawHtml((o.links||[]).length? tpl`<div class="hm-ra hm-links"><span class="mini">대상 바로 열기</span>${rawHtml(o.links.map(function(l2, li){ return tpl`<button type="button" class="cbtn" data-l="${String(li)}">${l2.l}</button>`; }).join(''))}</div>` : '')}`+
        tpl`${rawHtml(rest.length? tpl`<div class="hm-ra">${rawHtml(rest.map(function(a){ return tpl`<button type="button" class="cbtn" data-a="${String(o.acts.indexOf(a))}">${a.l}</button>`; }).join(''))}</div>` : '')}</div></li>`;
    });
    h+='</ul>';
  }
  if(more>0 || HOME.allOpen) h+=tpl`<button type="button" class="hm-all" id="hmAll" aria-expanded="${HOME.allOpen?'true':'false'}">${HOME.allOpen? '급한 것만 보기 ▴' : '전체 '+ord.length+'가지 펼치기 ▾ (그 밖에 '+more+'가지)'}</button>`;
  if(HOME.allOpen && ((HOME.zeros||[]).length || HOME.snz)) h+=tpl`<div class="ib-foot"><span>${(HOME.zeros||[]).join(' · ')}</span>${rawHtml(HOME.snz? tpl`<a id="ibUnsnz" href="#" role="button">보류한 ${String(HOME.snz)}건 다시 보기</a>` : '')}</div>`;
  box.innerHTML=h;
  var byKey={}; base.forEach(function(o){ byKey[o.key]=o; });
  box.querySelectorAll('.hm-row').forEach(function(li){ var o=byKey[/** @type {any} */(li).dataset.key]; if(!o) return;
    li.querySelectorAll('.cbtn[data-a]').forEach(function(bt){ /** @type {any} */(bt).onclick=function(e){ e.stopPropagation(); o.acts[+/** @type {any} */(bt).dataset.a].go(); }; });
    li.querySelectorAll('.cbtn[data-l]').forEach(function(bt){ /** @type {any} */(bt).onclick=function(e){ e.stopPropagation(); o.links[+/** @type {any} */(bt).dataset.l].go(); }; });
    var nb=li.querySelector('.hm-nm'); if(nb) /** @type {any} */(nb).onclick=function(){ var d=li.querySelector('.hm-d'), on=/** @type {any} */(d).hidden; /** @type {any} */(d).hidden=!on; nb.setAttribute('aria-expanded', on? 'true':'false'); HOME.open[o.key]=on; }; });
  box.querySelectorAll('[data-sc]').forEach(function(b){ /** @type {any} */(b).onclick=function(){ HOME.scope=/** @type {any} */(b).dataset.sc; homeTodo(HOME.rows, HOME.zeros, HOME.snz); var nb=box.querySelector('[data-sc="'+HOME.scope+'"]'); if(nb) /** @type {any} */(nb).focus(); }; });
  var al=document.getElementById('hmAll'); if(al) al.onclick=function(){ HOME.allOpen=!HOME.allOpen; homeTodo(HOME.rows, HOME.zeros, HOME.snz); var nb=document.getElementById('hmAll'); if(nb) nb.focus(); };
  var un=document.getElementById('ibUnsnz'); if(un) un.onclick=function(e){ e.preventDefault(); ccUnsnooze(); };
  var pm=document.getElementById('hmPickMe'); if(pm) pm.onclick=function(){ ask('내가 처리할 일', {from:'home'}); };
}
/** 홈 전체 그리기(renderInbox 가 부름) */
export function homeRender(rows, zeros, snz){
  if(!homeOn()) return;
  ['gnLinks','gnModeH'].forEach(function(id){ var x=document.getElementById(id); if(x) x.remove(); });
  var vd=document.getElementById('viewDash'); if(vd){ vd.removeAttribute('data-hm'); vd.classList.toggle('hm-detail', homeDetailOpen()); } document.body.classList.toggle('hm-detail-on', homeDetailOpen());
  try{ homeSum(); }catch(e){ console.warn('home sum', e); }
  try{ homeQuick(); }catch(e){ console.warn('home quick', e); }
  try{ homeTrend(); }catch(e){ console.warn('home trend', e); }
  try{ homeTodo(rows, zeros, snz); }catch(e){ console.warn('home todo', e); }
  try{ homeRecentRow(); }catch(e){}
  try{ homeDetailBar(); }catch(e){}
}
/** 계정 ↔ 담당자 이름 (SQL 103 user_owner_map — 관리자 지정) · 표가 없거나 연결이 없으면 null(이 브라우저 임시 선택으로) */
export function homeOwnerLoad(force){
  if(!ST.SB_TOKEN || !ST.AUTH_USER || (HOME.ownerTry && !force)) return; HOME.ownerTry=1;
  sbTry('user_owner_map?select=owner_names&email=eq.'+encodeURIComponent(String(ST.AUTH_USER).toLowerCase())).then(function(rows){
    var r=rows && rows[0], a=r && r.owner_names; if(typeof a==='string') a=a.split(/[,\n]/);
    ST.OWNER_NAMES=(a||[]).map(function(x){ return String(x||'').trim(); }).filter(Boolean);
    if(!ST.OWNER_NAMES.length) ST.OWNER_NAMES=null;
    if(ST.CUR_VIEW==='dash') try{ homeTodo(HOME.rows, HOME.zeros, HOME.snz); }catch(e){}
  });
}

/* ------------------------------------------------------------------
   추천 질문 4개 — 포탈이 직접 계산(홈 숫자와 같음 · AI 가 꺼져도 답함)
   ------------------------------------------------------------------ */
export function localIntent(q){
  var s=String(q||'').replace(/\s+/g,'');
  if(/^(이번달|당월|이달)매출(변화|변동|은?어때\??|증감)|^매출변화$/.test(s)) return 'mrr';
  if(/^재약정(대응할|챙길|대응이?필요한|할)고객|^재약정대응(필요)?$|^재계약대응/.test(s)) return 'renew';
  if(/^(내가)?(처리할|해야할|할)일$|^내할일$|^내가처리할일$|^내담당(업무|일)?$/.test(s)) return 'mine';
  if(/^(이|지금|현재)목록(요약|정리)$/.test(s)) return 'list';
  return '';
}
export function homeLocal(q, kind, opt){
  var a=document.getElementById('answer'); if(!a) return;
  a.classList.add('on');
  var sgt=document.getElementById('ansSuggestTitle'); if(sgt) sgt.style.display='none';
  var pin=/** @type {any} */(document.getElementById('ansPin')); if(pin) pin.hidden=true;
  /** @type {any} */ var A=null;
  try{ A= kind==='mrr'? liMrr() : kind==='renew'? liRenew() : kind==='list'? liList(opt) : liMine(); }
  catch(e){ A={state:'fail', core:'계산하지 못했습니다 — '+String(/** @type {any} */(e).message||e).slice(0,120), retry:1}; }
  if(!ST.DATA) A={state:'need', core:'데이터를 아직 읽지 못했습니다 — 잠시 뒤 다시 물어봐 주세요.', retry:1};
  var core=document.getElementById('ansLocal');
  if(core) core.innerHTML=tpl`<p class="ans-core">${rawHtml(A.core)}</p>`+tpl`${rawHtml(A.extra||'')}`;
  if(A.state==='need') ansStateSet('need', tpl`<b>${A.stTitle||'데이터 부족'}</b> — ${A.stMsg||'숫자를 0 으로 보이지 않고 이유를 먼저 알려 드립니다'}`+(A.retry? tpl` <button type="button" class="cbtn" id="ansRetry">다시 시도</button>` : ''));
  else if(A.state==='fail') ansStateSet('fail', tpl`<b>계산 실패</b> — 잠시 뒤 다시 시도해 주세요 <button type="button" class="cbtn" id="ansRetry">다시 시도</button>`);
  var rb=document.getElementById('ansRetry'); if(rb) rb.onclick=function(){ ask(q, opt); };
  var ev=document.getElementById('ansEvLocal');
  if(ev) ev.innerHTML=A.table? ansTable(A.table) : '';
  if(HOME.cur) HOME.cur.tgo=(A.table && A.table.go) || [];
  if(ev && A.table) ev.querySelectorAll('[data-go]').forEach(function(x){ /** @type {any} */(x).onclick=function(){ var f=A.table.go[+/** @type {any} */(x).dataset.go]; if(f) ansGo({go:f}); }; });
  ansBtns(document.getElementById('ansSrcB'), A.src||[]);
  ansBtns(document.getElementById('ansNext'), A.next||[]);
  var sg=document.getElementById('ansSuggest'); if(sg){ sg.innerHTML=''; (A.follow||[]).forEach(function(s){ var c=document.createElement('button'); c.type='button'; c.className='chip'; c.textContent=s; c.onclick=function(){ ask(s, {from:'panel'}); }; sg.appendChild(c); }); if(sgt) sgt.style.display=(A.follow||[]).length? 'block':'none'; }
  ansMetaSet(A.meta||{});
  if(A.bind) try{ A.bind(); }catch(e){}
  var plain=String(A.core).replace(/<[^>]+>/g,'');
  homeAfter(plain);
  try{ ST.HIST.push({q:q, a:plain}); if(ST.HIST.length>10) ST.HIST.shift(); }catch(e){}   /* 이어서 AI 에 물을 때 앞의 문답으로(포탈 계산 답도) — DB 기록(ai_chat_history)은 AI 답만 */
}
/** 근거 표 — {cols, rows:[{c:[…], tot}], n:[숫자 열 번호], go:[행별 이동 함수], cap} */
export function ansTable(T){
  return tpl`${rawHtml(T.cap? tpl`<div class="cap ans-tcap">${T.cap}</div>` : '')}<div class="tbl-wrap ans-tw" tabindex="0"><table class="ans-t"><thead><tr>${rawHtml(T.cols.map(function(c, i){ return tpl`<th${rawHtml((T.n||[]).indexOf(i)>=0? ' class="n"':'')}>${c}</th>`; }).join(''))}</tr></thead><tbody>`+
    tpl`${rawHtml(T.rows.map(function(r, ri){ return tpl`<tr${rawHtml(r.tot? ' class="tot"':'')}>${rawHtml(r.c.map(function(v, i){ var cell=(i===0 && T.go && T.go[ri])? tpl`<button type="button" class="lnk" data-go="${String(ri)}">${v}</button>` : esc(v);
      return tpl`<td${rawHtml((T.n||[]).indexOf(i)>=0? ' class="n"':'')}>${rawHtml(cell)}</td>`; }).join(''))}</tr>`; }).join(''))}</tbody></table></div>`;
}
export function sgn(v){ return (v>0? '+' : v<0? '−' : '')+won(Math.abs(v)); }
/** «이번 달 매출 변화» — 홈 핵심 현황과 같은 계산(전체 사업 · 홈 기준월) */
export function liMrr(){
  var N=homeNums(), b=N.b, list=N.list;
  var meta={period:mk(b)+(b>0? ' vs '+mk(b-1) : ''), unit:'천원(월 인식 매출)', cond:'전체 사업 · 모든 계약(원계약 · 부속) — 사업 분석 필터와 무관'};
  if(b<=0) return {state:'need', stTitle:'전월 자료 없음', stMsg:'비교할 지난달 데이터가 없습니다', core:mk(b)+' 매출은 '+won(N.m0)+'천원입니다.', meta:meta};
  var per={}, cu={};
  list.forEach(function(k){ var r=ST.DATA.rows[k], a=ST.MAT[k][b]||0, p=ST.MAT[k][b-1]||0; if(!a && !p) return;
    var l=per[r.line]=per[r.line]||[0,0]; l[0]+=a; l[1]+=p; var c=cu[r.cust]=cu[r.cust]||[0,0]; c[0]+=a; c[1]+=p; });
  var d=N.m0-N.m1, lines=Object.keys(per).map(function(l){ return {l:l, a:per[l][0], p:per[l][1], d:per[l][0]-per[l][1]}; }).sort(function(x,y){ return Math.abs(y.d)-Math.abs(x.d) || y.a-x.a; });
  var cs=Object.keys(cu).map(function(c){ return {c:c, d:cu[c][0]-cu[c][1]}; }).filter(function(x){ return Math.abs(x.d)>=0.5; });
  var up=cs.filter(function(x){ return x.d>0; }).sort(function(x,y){ return y.d-x.d; }).slice(0,3), dn=cs.filter(function(x){ return x.d<0; }).sort(function(x,y){ return x.d-y.d; }).slice(0,3);
  var core=tpl`<b>${homeMonthName(b)} 매출 ${won(N.m0)}천원</b> — ${mk(b-1)}(${won(N.m1)}천원)보다 <b>${won(Math.abs(d))}천원 ${Math.abs(d)<0.5? '변화 없음' : d>0? '늘었습니다' : '줄었습니다'}</b>${N.d==null? '' : ' ('+(N.d>=0?'+':'')+N.d.toFixed(1)+'%)'}.`;
  var ex='';
  if(up.length || dn.length) ex=tpl`<p class="ans-sub2">${rawHtml(up.length? tpl`늘어난 곳 ${up.map(function(x){ return x.c+' '+sgn(x.d); }).join(', ')}` : '')}${rawHtml(up.length && dn.length? ' · ' : '')}${rawHtml(dn.length? tpl`줄어든 곳 ${dn.map(function(x){ return x.c+' '+sgn(x.d); }).join(', ')}` : '')}</p>`;
  /** @type {any[]} */ var rows=lines.map(function(x){ return {c:[lline(x.l), won(x.a), won(x.p), sgn(x.d)]}; });
  rows.push({c:['합계', won(N.m0), won(N.m1), sgn(d)], tot:1});
  return {core:core, extra:ex, table:{cols:['서비스', mk(b), mk(b-1), '증감'], n:[1,2,3], rows:rows, cap:'서비스별 월 인식 매출(천원)'},
    src:[{l:'홈 매출 추이', stay:0, go:function(){ if(ST.CUR_VIEW!=='dash') switchView('dash'); var t=document.getElementById('gnTrend'); if(t) try{ t.scrollIntoView({behavior:'smooth', block:'center'}); }catch(e){} }}, {l:'사업 현황 상세(월별 장표)', go:function(){ homeBiz(); }}, {l:'계약 목록', go:function(){ navMenu('contracts'); }}],
    next:up.concat(dn).slice(0,2).map(function(x){ return {l:'고객 360 — '+x.c, go:function(){ openCust360(x.c); }}; }),
    follow:['최근 6개월 추이 보여줘','제일 큰 고객 누구야?'], meta:meta};
}
/** «재약정 대응할 고객» — 홈 «재약정 대응 필요»와 같은 행 */
export function liRenew(){
  var N=homeNums(), RN=N.RN, XS=RN.xs, b=N.b, end=XS.end;
  var meta={period:'종료월 '+mk(b)+' ~ '+mk(end)+' ('+XS.EN+'개월)', unit:'천원(종료월 월 금액)', cond:'전체 사업 · 원계약만(부속 · H/W · 해지 · 중지 제외) · 자동연장 · 재약정 등록 제외'};
  var exc=[]; if(RN.sure.length) exc.push('재약정 등록됨 '+RN.sure.length+'건'); if(RN.auto.length) exc.push('자동연장 '+RN.auto.length+'건');
  if(!XS.rows.length) return {core:tpl`앞으로 ${String(XS.EN)}개월(${mk(b)}~${mk(end)}) 안에 끝나는 원계약이 없습니다.`, meta:meta, src:[{l:'만료 기간 바꾸기(사업 현황 상세 «N개월 내 만료»)', go:function(){ homeBiz(); }}]};
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
    src:[{l:'목록으로 보기 ('+RN.rows.length+'건)', pri:1, go:function(){ kpiOpen('expNeed', {home:1}); }}], next:next, meta:meta};
}
/** «이 목록 요약» — 보던 표의 실제 조건으로 포탈이 계산(현재 목록 기준이라고 말할 수 있는 유일한 답) */
export function liList(opt){
  var C=(opt && opt.ctx) || srchCtx(), v=C.v, g=GRIDS[v];
  if(!g || g.custom) return {state:'need', stTitle:'목록 화면이 아님', stMsg:'표 화면(계약 · LIVE · OI · 인바운드 · 장비 등)에서 물어보세요', core:'지금 화면은 표 목록이 아니라 요약할 행이 없습니다.', meta:{cond:C.label}};
  if(ST.CUR_VIEW!==v) return {state:'need', stTitle:'보던 목록이 바뀜', stMsg:'그 목록 화면에서 다시 물어보세요', core:C.label+' 화면을 떠나 지금 조건을 다시 읽을 수 없습니다.', meta:{cond:C.label}};
  var rows=gridFilteredSorted(g), wc=g.cols.filter(function(c){ return c.won; }).slice(0,3), cuK=['customer','cust','org'].filter(function(k){ return g.cols.some(function(c){ return c.k===k; }); })[0];
  var sums=wc.map(function(c){ return {l:c.l, v:rows.reduce(function(a,r){ return a+(Number(r[c.k])||0); },0)/1000}; });
  var cu={}; if(cuK) rows.forEach(function(r){ var k=r[cuK]||'—'; cu[k]=(cu[k]||0)+1; });
  var top=Object.keys(cu).sort(function(a,b){ return cu[b]-cu[a]; }).slice(0,5);
  var stK=['stage','status','result'].filter(function(k){ return g.cols.some(function(c){ return c.k===k; }); })[0], st={}; if(stK) rows.forEach(function(r){ var k=r[stK]||'—'; st[k]=(st[k]||0)+1; });
  var core=tpl`<b>${C.label} — 지금 목록 ${String(rows.length)}행</b>${rawHtml(sums.length? ' · '+sums.map(function(s){ return esc(s.l)+' 합계 '+won(s.v)+'천원'; }).join(' · ') : '')}${rawHtml(cuK? ' · 고객사 '+Object.keys(cu).length+'곳' : '')}.`;
  var trs=[]; if(stK) Object.keys(st).sort(function(a,b){ return st[b]-st[a]; }).forEach(function(k){ trs.push({c:[(g.cols.filter(function(c){ return c.k===stK; })[0]||{l:''}).l+' '+k, String(st[k])]}); });
  top.forEach(function(k){ trs.push({c:['고객사 '+k, String(cu[k])]}); });
  return {core:core, table:trs.length? {cols:['구분','행'], n:[1], rows:trs, cap:'보던 목록과 같은 행(검색 · 필터 · 보기 · 조건 그대로)'} : null,
    meta:{period:'지금', unit:'행 · 천원', cond:'현재 목록 기준 — '+C.label+(C.parts.length? ' · '+C.parts.join(' · ') : ''), cmp:'화면 «'+rows.length+'행»과 같은 계산'}};
}
/** «내가 처리할 일» — 계정 ↔ 담당자 이름 연결이 있어야 셈(없으면 0 이 아니라 «담당자 연결 필요») */
export function liMine(){
  var C=qvCfg(), MO=myOwner(), meta={period:'오늘 '+new Date().toISOString().slice(0,10)+' 기준', unit:'건', cond:''};
  var team=(HOME.rows||[]).slice().sort(function(a,c){ return dueK(a)-dueK(c) || (a.lv||2)-(c.lv||2); }).slice(0,5);
  if(!MO.names.length){
    var owners={}; (ST.RAWX.oi||[]).concat(ST.RAWX.inbound||[]).forEach(function(r){ String(r.owner||'').split(/[,/]/).forEach(function(o){ o=o.trim(); if(o) owners[o]=1; }); });
    var opts=Object.keys(owners).sort(function(a,c){ return a.localeCompare(c,'ko'); });
    meta.cond='계정 '+(ST.AUTH_USER||'')+' — 담당자 이름 연결 없음';
    return {state:'need', stTitle:'담당자 연결 필요', stMsg:'이 계정에 OI · 인바운드 «담당» 이름이 연결되지 않아 내 일을 고를 수 없습니다(0건이 아닙니다) — 관리자 › 담당자 연결',
      core:'계정에 담당자 이름이 연결되면 내 담당 OI · 인바운드만 골라 보여 드립니다. 지금은 팀 전체에서 급한 일을 보여 드립니다.',
      extra:opts.length? tpl`<div class="ans-pick" data-nodirty><label for="ansMe">관리자 연결 전 — 임시로 이 브라우저에서 내 이름 고르기</label><select id="ansMe"><option value="">— 고르기 —</option>${rawHtml(opts.map(function(o){ return tpl`<option>${o}</option>`; }).join(''))}</select><button type="button" class="cbtn" id="ansMeOk">이 브라우저에 저장</button></div>` : '',
      bind:function(){ var ok=document.getElementById('ansMeOk'); if(ok) ok.onclick=function(){ var s=/** @type {any} */(document.getElementById('ansMe')); if(!s || !s.value) return; var c=qvCfg(); c.me=s.value; qvSave(c); toast('내 이름 저장(임시)','«'+s.value+'» — 이 브라우저에만 · 관리자가 계정에 연결하면 그것을 씀','info'); HOME.scope=''; try{ homeTodo(HOME.rows, HOME.zeros, HOME.snz); }catch(e){} ask('내가 처리할 일', {from:'panel'}); }; },
      table:team.length? {cols:['팀 전체 — 우선 업무','대상','담당'], rows:team.map(function(o){ return {c:[o.nm||'', o.cnt||'', o.own||'담당 미지정']}; }), go:team.map(function(o){ var pa=(o.acts||[]).filter(function(x){ return x.pri; })[0]; return pa? pa.go : null; })} : null,
      src:[{l:'홈 우선 업무', go:function(){ if(ST.CUR_VIEW!=='dash') switchView('dash'); var b=document.getElementById('ccInbox'); if(b) try{ b.scrollIntoView({behavior:'smooth', block:'center'}); }catch(e){} }}], meta:meta};
  }
  var oi=ST.RAWX.oi||[], inbL=ST.RAWX.inbound;
  var dO=qvDefs('oi')||[], dI=qvDefs('inbound')||[], fO={}, fI={}; dO.forEach(function(d){ fO[d[0]]=d; }); dI.forEach(function(d){ fI[d[0]]=d; });
  var oiOpenMine=oi.filter(function(r){ return meMatch(r.owner) && oiOpen(r); });
  var rows=[], go=[];
  function add(view, d, base, lab){ if(!d) return 0; var n=base.filter(d[3]).length; rows.push({c:[lab, String(n)]}); go.push(function(){ gridGoPre(view, '내 담당 · '+d[1]+' — '+d[2], function(r){ return meMatch(r.owner) && d[3](r); }); }); return n; }
  var nLate=add('oi', fO.late, oiOpenMine, 'OI 기한 초과'), nNone=add('oi', fO.nonext, oiOpenMine, 'OI 다음 행동 없음'), nToday=add('oi', fO.today, oiOpenMine, 'OI 오늘 할 일');
  var inbTxt='';
  if(inbL===undefined){ inbTxt=' · 인바운드는 불러오는 중'; try{ loadInbound(function(){ if(HOME.cur && /내가?처리할일|내할일/.test(String(HOME.cur.q).replace(/\s+/g,''))) ask(HOME.cur.q, {from:'panel'}); }); }catch(e){} }
  else { var inbMine=(inbL||[]).filter(function(r){ return meMatch(r.owner); }); add('inbound', fI.first, inbMine, '인바운드 첫 대응 지연'); add('inbound', fI.idle, inbMine, '인바운드 장기 미접촉'); }
  meta.cond='담당 칸에 «'+MO.names.join(' / ')+'» 포함('+(MO.src==='account'? '계정 연결' : '이 브라우저에서 고른 이름')+') · OI 진행 중 · 첫 대응 '+C.inbFirst+'일 · 장기 미접촉 '+C.inbIdle+'일 · 계약 · 장비 신청은 담당 칸이 없어 빠짐';
  var core=tpl`<b>«${MO.names.join(' / ')}» 담당</b> — 진행 중 OI ${String(oiOpenMine.length)}건 중 기한 초과 ${String(nLate)} · 다음 행동 없음 ${String(nNone)} · 오늘 할 일 ${String(nToday)}${inbTxt}.`;
  return {core:core, table:{cols:['내 담당','건수'], n:[1], rows:rows, go:go, cap:'항목을 누르면 그 조건의 목록'},
    src:[{l:'OI 현황 — 내 담당', go:function(){ gridGoPre('oi', '내 담당 — 담당 «'+MO.names.join(' / ')+'»', function(r){ return meMatch(r.owner); }); }}],
    next:MO.src==='browser'? [{l:'임시 이름 지우기', stay:1, go:function(){ var c=qvCfg(); c.me=''; qvSave(c); ask('내가 처리할 일', {from:'panel'}); }}] : [],
    meta:meta};
}
