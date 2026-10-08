/* ===== ai.js — 자연어 질문 엔진 · AI 요약(buildDigest) · 규칙형 해석기 · 자동완성 =====
   ES 모듈(㊿+153) — 다른 파일의 이름은 아래 import 로만 씀 · 이 파일의 최상위 var/function 은 전부 export · 즉시 실행 문장은 js/init.js 의 start() 에 */
import { APP_VER, ST } from './state.js';
import { Viz } from './viz.js';
import { $, $$, cssv, el, esc, lline, mk, mkLabel, monOf, pct, rawHtml, refreshToken, SB_KEY, SB_URL, seriesColor, STATE, tpl, won, wonFull, yOf } from './core.js';
import { sbGet, sbWrite, toast } from './shell.js';
import { activeCustomers, groupCount, hbars, monthlySeries, monthlyTotal, pinQuery, statusOf, uniq } from './dash.js';
import { dcSummary, liveData, liveDelta, liveSrcLabel, renewScan } from './analysis.js';
import { CL, clBuild, clEnsure, clFxRate, clSum } from './cloud.js';
import { openOvl } from './edit.js';


/* ==================================================================
   5. 자연어 질문 엔진 (규칙형 · 외부 API 불필요)
   ================================================================== */
/** 사업 라인 별칭 — [찾는 정규식, 라인 코드] @type {Array<[RegExp, string]>} */
export var LINE_ALIAS=[
  [/\bdrm\b|디알엠|문서보안/i,'DRM'],
  [/\bdlp\b|디엘피|정보유출/i,'DLP'],
  [/클라우드|cloud|클라우|클라드|나크|nac/i,'Cloud'],
  [/mdr[_\-]?s1|에스원mdr|mdr에스원|엠디알에스원/i,'MDR_S1'],
  [/\bmdr\b|엠디알|탐지대응/i,'MDR'],
  [/\bpns\b|피엔에스|알림서비스|푸시/i,'PNS'],
  [/\bs1\b|에스원|세콤/i,'S1']
];
export var AICFG = {enabled:false, narrate:true, maskNames:true, model:''};
/* 계정별 대화 기억 — DB(ai_chat_history)에서 최근 문답을 불러옵니다 (최초 1회) */
export function loadHist(){
  if(ST.HIST_LOADED || !ST.SB_TOKEN) return Promise.resolve();
  ST.HIST_LOADED=true;
  return sbGet('ai_chat_history?select=q,a&order=id.desc&limit=8').catch(function(){ return null; }).then(function(rows){
    if(rows && rows.length){
      var prev=rows.reverse().map(function(r){ return {q:r.q, a:r.a||''}; });
      ST.HIST=prev.concat(ST.HIST).slice(-8);
    }
  });
}
/* 문답 한 턴을 계정 기억에 저장 (실패해도 조용히 넘어감) */
export function saveHistTurn(q,a){
  if(!ST.SB_TOKEN) return;
  try{ sbWrite('POST','ai_chat_history',[{q:q, a:String(a||'').slice(0,2000), email:ST.AUTH_USER||null}])
        .catch(function(){}); }catch(e){}
}

export function aiEndpoint(){ return SB_URL + '/functions/v1/ask'; }
/* 중계 함수가 응답을 주지 않으면 fetch 는 영원히 안 끝납니다.
   타임아웃을 걸어 반드시 끝나게 하고, 끝나지 않으면 내장 규칙으로 답합니다. */
export var AI_TIMEOUT_MS = 90000;   // 중계 함수(ask v3.2)의 총 예산 78초 + 여유 — 함수가 예산 안에 반드시 답을 돌려주므로 여기까지 오는 일은 드묾
export var AI_PING_MS    = 12000;      // 연결 확인은 짧게
export async function aiFetch(payload, ms){
  ms = ms || (payload && payload.mode==='ping' ? AI_PING_MS : AI_TIMEOUT_MS);
  var ctl = (typeof AbortController!=='undefined') ? new AbortController() : null;
  var timedOut=false;
  var t = setTimeout(function(){ timedOut=true; if(ctl) ctl.abort(); }, ms);
  var t0 = Date.now();
  if(payload && payload.mode==='chat') AI_CUR=ctl;          // «중단» 버튼용
  try{
    var opt={ method:'POST',
      headers:{'Content-Type':'application/json', apikey:SB_KEY, Authorization:'Bearer '+(ST.SB_TOKEN||'')},
      body:JSON.stringify(payload) };
    if(ctl) opt.signal=ctl.signal;
    var r=await fetch(aiEndpoint(), opt);
    if(r.status===401 && ST.SB_TOKEN && await refreshToken()){      // 로그인 토큰 만료 → 연장 후 1회 재시도
      opt.headers.Authorization='Bearer '+ST.SB_TOKEN;
      r=await fetch(aiEndpoint(), opt);
    }
    var j=null; try{ j=await r.json(); }catch(e){}
    if(r.status===401) throw new Error('로그인이 만료되었습니다 — 다시 로그인해 주세요');
    if(!r.ok) throw new Error((j&&j.error)||('HTTP '+r.status));
    if(j) j._ms = Date.now()-t0;
    return j;
  }catch(e){
    if(timedOut) throw new Error(Math.round(ms/1000)+'초 안에 응답이 없어 중단했습니다 (중계 함수 ask 응답 없음)');
    if(e && e.name==='AbortError') throw new Error('요청을 중단했습니다');
    throw e;
  }finally{ clearTimeout(t); if(AI_CUR===ctl) AI_CUR=null; }
}
export var AI_CUR=null;             // 진행 중인 chat 요청의 AbortController
export var ASK_T0=0, ASK_TICK=null; // «생각 중… n초» 표시용
export function loadAiConfig(){
  var badge=$('#aiBadge');
  if(!ST.SB_TOKEN){
    badge.className='ai-badge'; badge.textContent='규칙형';
    badge.title='로그인하면 AI 질문을 사용할 수 있습니다.';
    AICFG.enabled=false; return;
  }
  badge.className='ai-badge'; badge.textContent='AI 확인 중…';
  // 가벼운 호출로 중계 함수(ask) 연결 여부만 확인합니다
  aiFetch({mode:'ping'}).then(function(){ aiOn(badge); })
    .catch(function(e){
      var m=String(e.message||e);
      if(/질문이 비어/.test(m)){ aiOn(badge); return; }   // 함수는 살아있음 = 연결 OK
      AICFG.enabled=false;
      badge.className='ai-badge'; badge.textContent='규칙형 (AI 미연결)';
      badge.title='Claude 연결이 없어 내장 규칙형으로 동작합니다.\n'+m;
    });
}
export function aiOn(badge){
  AICFG.enabled=true;
  badge.className='ai-badge on';
  badge.innerHTML='<span class="d"></span>AI 연결됨';
  badge.title='Claude API · 중계: Supabase Edge Function (ask v3 — DB 를 스스로 조회하는 도구 사용)'+
    '\n· 금액 계산은 전부 포탈이 DB 원본으로 직접 수행합니다'+
    '\n· AI 해설: '+(AICFG.narrate?'켜짐':'꺼짐')+
    '\n· 고객명 마스킹: '+(AICFG.maskNames?'켜짐':'꺼짐');
  $('#q').placeholder='아무렇게나 물어보세요 — 예: 요즘 클라우드 좀 어때? 제일 큰 고객 누구야? 곧 재약정 챙겨야 할 데 있어?';
}

export function setAsking(on){
  var b=$('#btnAsk');
  if(ASK_TICK){ clearInterval(ASK_TICK); ASK_TICK=null; }
  b.disabled=false;                         // 기다리는 동안에도 눌러서 «중단» 할 수 있게
  b.classList.toggle('asking', !!on);
  if(!on){ b.textContent='질문'; b.title=''; return; }
  ASK_T0=Date.now();
  b.textContent='생각 중… 0초'; b.title='누르면 중단합니다';
  ASK_TICK=setInterval(function(){
    var s=Math.round((Date.now()-ASK_T0)/1000);
    b.textContent='생각 중… '+s+'초'+(s>=8? ' · 중단':'');
    if(s>=25 && !b._slowTold){ b._slowTold=1; toast('AI 가 오래 걸리고 있습니다','DB 를 여러 번 조회하는 질문이면 1분 가까이 걸릴 수 있어요. 버튼을 누르면 중단합니다','info'); }
  },1000);
  b._slowTold=0;
}
export function isAsking(){ return $('#btnAsk').classList.contains('asking'); }
export function abortAsk(){
  if(AI_CUR){ try{ AI_CUR.abort(); }catch(e){} }
  setAsking(false);
  var say=$('#aiSay'); if(say){ say.className='ai-say on'; say.innerHTML='<span class="lb">AI</span>중단했습니다.'; }
}

export function shortQ(q){ q=String(q||''); return q.length>90? q.slice(0,90)+'…' : q; }
/* 도구 호출 요약: run_sql×2 · customer_360 */
export function aiToolBrief(qs){
  var n={}; (qs||[]).forEach(function(q){ n[q.tool]=(n[q.tool]||0)+1; });
  return Object.keys(n).map(function(k){ return k+(n[k]>1?'×'+n[k]:''); }).join(' · ');
}
/* AI 답변은 «그 시점 데이터»로 만든 것이라, 데이터를 다시 읽으면 닫습니다.
   ㊿+159 (사용자: «다른 메뉴 갔다와도 남아있네») — 홈에서 다른 메뉴로 가도 닫고(grid.js switchView), 답변 위 «✕ 닫기»로도 닫음.
   force: ✕ 닫기 — 생각 중이면 질문을 멈추고 닫음 */
export var AI_SEQ={n:0, closed:0};   /* 질문 번호 · ✕ 로 닫은 마지막 번호 — 닫은 뒤 늦게 온 답은 화면에 다시 열지 않음 */
export function closeAnswer(why, force){
  var a=$('#answer'); if(!a || !a.classList.contains('on')) return;
  /* 질문이 진행 중(생각 중…)이면 닫지 않습니다 — 자동 새로고침이 겹치면 답이 와도 보이지 않던 문제 */
  if(typeof isAsking==='function' && isAsking()){ if(!force) return; AI_SEQ.closed=AI_SEQ.n; try{ abortAsk(); }catch(e){} }
  if(force) AI_SEQ.closed=AI_SEQ.n;
  a.classList.remove('on');
  try{ clearSay(); }catch(e){}
  var t=$('#ansTitle'); if(t) t.textContent='';
  var h=$('#ansHero'); if(h) h.textContent='';
  var b=$('#ansSub');  if(b) b.textContent='';
  var g=document.getElementById('ansGrid'); if(g) g.style.display='none';
  if(why) toast('AI 답변을 닫았습니다', why, 'info');
}
export function ask(q){
  q=(q||'').trim();
  if(!q){ $('#answer').classList.remove('on'); return; }
  $('#q').value='';            // 물어본 뒤에는 입력칸을 비웁니다
  $('#sug').classList.remove('on');
  if(!AICFG.enabled){ localAnswer(q); return; }

  setAsking(true);
  var mySeq=++AI_SEQ.n, gone=function(){ return AI_SEQ.closed>=mySeq; };   /* ✕ 로 닫았으면 늦게 온 답·오류는 조용히 버림 */
  // 답변 자리를 먼저 열고 "생각 중" 표시
  $('#answer').classList.add('on');
  $('#ansRestate').className='restate';
  $('#ansTitle').textContent=shortQ(q);
  $('#ansHero').textContent=''; $('#ansSub').textContent='';
  $('#aiComment').className='ai-comment';
  var say=$('#aiSay');
  say.className='ai-say on loading';
  say.innerHTML='<span class="lb">AI</span>데이터를 보고 있습니다<span class="dots"><span>·</span><span>·</span><span>·</span></span>';
  var grid=document.getElementById('ansGrid'); if(grid) grid.style.display='none';

  // 최후 안전장치 — 어떤 이유로든 체인이 끝나지 않아도 버튼은 반드시 풀립니다
  var guard=setTimeout(function(){
    if(gone()) return;
    if(isAsking()){
      setAsking(false);
      localAnswer(q,'⚠ AI가 응답하지 않아 내장 규칙으로 답했습니다 — 잠시 후 다시 물어봐 주세요.');
    }
  }, AI_TIMEOUT_MS+5000);
  Promise.all([loadHist(), clEnsure()]).then(function(){
    return aiFetch({mode:'chat', question:q, digest:buildDigest(), history:ST.HIST.slice(-6)});
  })
    .then(function(r){
      clearTimeout(guard); if(gone()) return; setAsking(false);
      if(!r || !r.ok || !r.text){ localAnswer(q,'⚠ AI가 답하지 못해 내장 규칙(간단 패턴)으로 답했습니다 — AI 답변이 아닙니다. '+String((r&&r.error)||'').slice(0,100)); return; }
      revealAnswer();
      say.className='ai-say on';
      say.innerHTML=tpl`<span class="lb">AI</span>${cleanSay(r.text)}`+
        tpl`<div style="font-size:11px;color:var(--muted);margin-top:6px">`+
        tpl`${String(r.model||'').replace(/^claude-/,'')}`+ tpl`${rawHtml(r.queries&&r.queries.length? tpl` · DB 조회 ${r.queries.length}회 <span title="${r.queries.map(function(q){ return q.tool+' '+((q.ms||0)/1000).toFixed(1)+'s'+(q.error?' ✗':''); }).join(' · ')}">(${aiToolBrief(r.queries)})</span>`:'')}`+ tpl`${rawHtml(r.llm&&r.llm.length? ' · 모델 '+r.llm.length+'회 '+(r.llm.reduce(function(a,x){ return a+(x.ms||0); },0)/1000).toFixed(1)+'s':'')}`+ tpl`${rawHtml(r.cut? tpl` · <span style="color:var(--warn-ink)">${r.degraded? '답 미완성: '+r.cut : '도구 중단: '+r.cut}</span>`:'')}`+ tpl`${rawHtml(r.tried&&r.tried.length? tpl` · <span style="color:var(--warn-ink)">폴백: ${r.tried.join(' / ')}</span>`:'')}`+ tpl`${rawHtml(r._ms? ' · '+(r._ms/1000).toFixed(1)+'초':'')}`+
        tpl` · ${rawHtml(new Date().toTimeString().slice(0,5))} 데이터 기준`+
        tpl`<span class="ai-fb" role="group" aria-label="이 답변 평가"><button type="button" data-fb="up" aria-label="도움이 됐어요" title="도움이 됐어요">👍</button><button type="button" data-fb="down" aria-label="틀렸거나 부족해요" title="틀렸거나 부족해요 — 무엇이 틀렸는지 적으면 AI 지식 보강에 씁니다">👎</button></span></div>`;
      aiFeedbackBind(say, q, r);
      ST.HIST.push({q:q, a:r.text}); if(ST.HIST.length>10) ST.HIST.shift();
      saveHistTurn(q, r.text);                  // 계정별 누적 기억 (세션 무관)
      // 표·그래프가 도움이 되는 질문이면 포탈이 직접 계산해서 아래에 붙입니다
      if(r.view && r.view.intent){
        try{
          var pp=planToP(r.view), res=computeFromP(pp);
          res.restate=''; res.suggestions=[];
          renderAnswerBody(res);
        }catch(e){ /* 계산 실패해도 대화 답변은 그대로 둡니다 */ }
      }
    })
    .catch(function(e){
      clearTimeout(guard); if(gone()) return; setAsking(false);
      if(/^요청을 중단했습니다/.test(String(e&&e.message||''))){ $('#q').value=q; return; }   // 사용자가 끊음 → 질문 복원 (타임아웃은 아래로)
      if(/로그인이 만료/.test(String(e&&e.message||''))){ $('#q').value=q; toast('로그인이 만료되었습니다','다시 로그인하면 질문이 그대로 남아 있습니다','warn'); openOvl('ovlAuth'); return; }
      localAnswer(q,'⚠ AI 호출 실패 — 이 답은 AI가 아니라 내장 규칙(간단 패턴)입니다. ('+String(e&&e.message||e).slice(0,120)+')');
      aiRetryBtn(q);
    });
}

/* 👍/👎 — ai_feedback(SQL 94) 에 본인 행으로 기록. 👎 는 «무엇이 틀렸나» 메모(선택). 표가 없으면 토스트만. (⑥ AI 2단계 · ㊿+139) */
export function aiFeedbackBind(say, q, r){
  say.querySelectorAll('.ai-fb button').forEach(function(b){ b.onclick=function(){ aiFeedback(b.dataset.fb, q, r, say); }; });
}
export async function aiFeedback(verdict, q, r, say){
  var note=null;
  if(verdict==='down'){ note=prompt('무엇이 틀렸거나 부족했나요? (선택 — 비워도 기록됩니다)'); if(note===null) return; note=note.trim()||null; }
  var btns=say? say.querySelectorAll('.ai-fb button') : []; btns.forEach(function(b){ b.disabled=true; b.setAttribute('aria-pressed', String(b.dataset.fb===verdict)); });
  try{
    await sbWrite('POST','ai_feedback',{email:ST.AUTH_USER||'', verdict:verdict, question:String(q||'').slice(0,500), answer_head:String((r&&r.text)||'').slice(0,400), note:note, model:(r&&r.model)||null, ms:(r&&r._ms)||null, app_ver:APP_VER, view:ST.CUR_VIEW});
    toast(verdict==='up'? '고마워요 👍':'기록했어요 👎', verdict==='up'? '도움이 된 답으로 남겼습니다':'관리자가 배포·운영 › 기록에서 보고 AI 지식을 보강합니다');
  }catch(e){ btns.forEach(function(b){ b.disabled=false; b.removeAttribute('aria-pressed'); }); toast('피드백 저장 실패', /ai_feedback|404|schema cache/i.test(String(e.message||e))? 'SQL 94 가 아직 실행되지 않았습니다':String(e.message||e).slice(0,120), 'warn'); }
}
/* 답변 패널을 열고, 화면 밖에 있으면 보이는 위치로 살짝 스크롤 */
export function revealAnswer(){
  var a=$('#answer'); if(!a) return;
  a.classList.add('on');
  try{
    var r=a.getBoundingClientRect(), tb=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tbh'))||64;
    if(r.top<tb || r.top>innerHeight-120) a.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){}
}
/* AI 호출이 실패했을 때 «다시 시도» 버튼을 답변 영역에 붙입니다 */
export function aiRetryBtn(q){
  var say=$('#aiSay'); if(!say) return;
  say.className='ai-say on';
  say.innerHTML=tpl`<span class="lb">AI</span>AI가 답하지 못했습니다. `+
    tpl`<button class="pill" id="aiRetry" style="height:26px;padding:0 10px;font-size:12px;margin-left:6px">↻ 다시 시도</button>`;
  var b=document.getElementById('aiRetry');
  if(b) b.onclick=function(){ ask(q); };
}

/* 답변에 JSON/코드펜스가 섞여 오면 사람이 읽을 문장만 남깁니다 */
export function cleanSay(t){
  t=String(t==null?'':t).trim();
  // ```json { "answer": "..." } ``` 형태면 answer 만 뽑기
  var m=t.match(/\{[\s\S]*"answer"\s*:\s*"([\s\S]*?)"\s*,\s*"view"/);
  if(m){
    var head=t.slice(0,t.indexOf('```')>=0? t.indexOf('```') : t.indexOf('{')).trim();
    if(head) return head;                       // 앞에 이미 사람말이 있으면 그것만
    try{ return JSON.parse(m[0].replace(/,\s*"view".*$/,'}')).answer; }catch(e){}
    return m[1].replace(/\\n/g,'\n');
  }
  t=t.replace(/```[\s\S]*?```/g,'').trim();     // 남은 코드블록 제거
  return t;
}
export function clearSay(){ var e=$('#aiSay'); if(e){ e.className='ai-say'; e.innerHTML=''; } }
export function localAnswer(q, note){
  clearSay();
  $('#q').value='';
  var res;
  try{ res=runQuery(q); }
  catch(e){ res={title:q, hero:'?', unit:'', sub:'질문을 이해하지 못했습니다', note:String(e.message||e)}; }
  if(note) res.note = note + (res.note? ' · '+res.note : '');
  showAnswer(q,res);
}

export function onPlan(q, r){
  if(!r || !r.ok){
    localAnswer(q, 'AI가 해석하지 못해 내장 규칙으로 답했습니다. ('+String((r&&r.error)||'?').slice(0,140)+')');
    return;
  }
  var plan=r.plan||{};
  if(plan.intent==='unknown' || !plan.intent){ showClarify(q, plan); return; }
  var res, pp;
  try{ pp=planToP(plan); res=computeFromP(pp); }
  catch(e){ localAnswer(q,'계산 중 문제가 생겨 내장 규칙으로 답했습니다. ('+String(e.message||e).slice(0,120)+')'); return; }
  if(pp.unresolved && pp.unresolved.length){
    res.note = '시트에서 「'+pp.unresolved.join('」, 「')+'」와(과) 일치하는 이름을 찾지 못해 그 조건은 빼고 계산했습니다.' +
      (res.note? ' · '+res.note : '');
  }
  res.restate=plan.restate||'';
  res.suggestions=plan.suggestions||[];
  ST.HIST.push({q:q, restate:plan.restate||''}); if(ST.HIST.length>6) ST.HIST.shift();
  showAnswer(q,res);
  if(AICFG.narrate) requestNarrate(q, plan, res);
}

export function showClarify(q, plan){
  // 정해진 조회 유형에 안 맞는 질문 → 데이터 요약을 주고 자유롭게 답하게 합니다
  showAnswer(q, {
    title: q, hero:'', unit:'',
    sub: '데이터를 살펴보는 중…',
    restate: plan.restate || '',
    note: '', suggestions: plan.suggestions || []
  });
  var box=$('#aiComment');
  box.className='ai-comment on loading'; box.textContent='답변을 정리하는 중…';
  aiFetch({mode:'free', question:q, digest:buildDigest()})
    .then(function(x){
      if(x && x.ok && x.text){
        $('#ansSub').textContent='';
        box.className='ai-comment on';
        box.innerHTML=tpl`<span class="lb">AI 답변</span>${rawHtml(esc(x.text).replace(/\n/g,'<br>'))}`;
      } else {
        box.className='ai-comment';
        $('#ansSub').textContent = plan.clarify || '질문을 조금 더 구체적으로 알려주세요.';
      }
    })
    .catch(function(){
      box.className='ai-comment';
      $('#ansSub').textContent = plan.clarify || '질문을 조금 더 구체적으로 알려주세요.';
    });
}

/* ---- 자유 질문용 데이터 요약 (전부 포탈이 직접 계산) ---- */
export function buildDigest(){
  var b=STATE.base, all=ST.DATA.rows.map(function(r,i){return i;});
  function tot(list,j){ return Math.round(monthlyTotal(list,j)); }
  function byKey(field){
    var agg={};
    all.forEach(function(k){
      var r=ST.DATA.rows[k], g=r[field]||'미지정', v=ST.MAT[k][b];
      if(v) agg[g]=Math.round((agg[g]||0)+v);
    });
    return agg;
  }
  // 최근 24개월 월별 합계
  var months=[];
  for(var j=Math.max(0,b-23); j<=b; j++) months.push([mk(j), tot(all,j)]);
  // 연도별 합계
  var byYear={};
  for(var j2=0;j2<=b;j2++){ var y=String(mk(j2)).slice(0,4); if(y) byYear[y]=Math.round((byYear[y]||0)+tot(all,j2)); }
  // 상위 고객 15
  var custAgg=byKey('cust');
  var topCust=Object.keys(custAgg).sort(function(a,c){return custAgg[c]-custAgg[a];}).slice(0,15)
    .map(function(n){ return [n, custAgg[n]]; });
  // 만료 예정 (12개월 내)
  var exp=[];
  all.forEach(function(k){
    var r=ST.DATA.rows[k];
    if(r.endIdx!=null && r.endIdx>=b && r.endIdx<=b+12 && ST.MAT[k][b])
      exp.push([r.cust, lline(r.line), mk(r.endIdx), Math.round(ST.MAT[k][b])]);
  });
  exp.sort(function(a,c){ return c[3]-a[3]; });
  // 해지
  var churn={};
  all.forEach(function(k){ var r=ST.DATA.rows[k]; if(r.churn) churn[r.churn]=(churn[r.churn]||0)+1; });

  var cur=tot(all,b);
  // 전망은 AI가 아니라 포탈이 직접 계산합니다 (복리 계산 오류 방지)
  var win=Math.min(12,b), pastV=tot(all,b-win);
  var gM=(pastV>0&&win>0)? Math.pow(cur/pastV,1/win)-1 : 0;
  var fc={}, curYear=+String(mk(b)).slice(0,4), curMon=+String(mk(b)).slice(5,7);
  for(var yy=curYear; yy<=curYear+6; yy++){
    var mAhead=(yy-curYear)*12+(12-curMon);           // 그 해 12월까지 개월 수
    if(mAhead<0) continue;
    fc[yy+'년말_예상ARR_억원']=Math.round(cur*Math.pow(1+gM,mAhead)*12/1e8*100)/100;
  }
  function eok(v){ return Math.round(v/1e8*100)/100; }
  return {
    설명:'금액은 원 단위 정수입니다. 1억원=100000000. 억원 단위 값을 함께 넣었으니 그대로 쓰세요.',
    금액읽는법:'기준월MRR_억원 · 현재ARR_억원 처럼 _억원 이 붙은 값은 이미 억원 단위입니다. 원 단위 값을 억원으로 다시 나누지 마세요.',
    기준월MRR_억원:eok(cur), 현재ARR_억원:eok(cur*12),
    최근12개월_월평균성장률_퍼센트:Math.round(gM*10000)/100,
    최근12개월_연환산성장률_퍼센트:Math.round((Math.pow(1+gM,12)-1)*10000)/100,
    전망_포탈계산:fc,
    전망_주의:'전망 값은 포탈이 최근 '+win+'개월 성장률로 이미 계산한 결과입니다. 직접 다시 계산하지 말고 이 값을 그대로 쓰세요. 신규 수주·해지는 반영되지 않았습니다.',
    기준월:mk(b), 데이터기간:[ST.DATA.monthKeys[0], ST.DATA.monthKeys[ST.M-1]],
    기준월MRR:cur, 현재ARR:cur*12,
    계약건수:ST.DATA.rows.length,
    LIVE고객사수: (function(){ var lv=liveData(b); return (lv&&lv.ok)? lv.uniqNoDup : null; })(),
    LIVE고객사_기준: liveSrcLabel(),
    서비스별MRR:byKey('line'), 사업영역별MRR:byKey('channel'),
    산업군별MRR:byKey('ind'), 파트너별MRR:byKey('ptn'),
    업종별: (function(){   // 2026-09 추가한 세분 업종(customers.sector) — 고객사 수 · 기준월 MRR
      var cnt={}, mrr={}, seen={}, unc=0, dup=0, chk=0;
      all.forEach(function(k){
        var r=ST.DATA.rows[k], sec=r.sector||'미분류';
        if(!ST.MAT[k][b]) return;                         // 기준월에 매출 있는(=활성) 계약만
        mrr[sec]=Math.round((mrr[sec]||0)+ST.MAT[k][b]);
        if(!seen[r.cust]){ seen[r.cust]=1; cnt[sec]=(cnt[sec]||0)+1; if(!r.sector) unc++; if(r.sectorDup) dup++; if(r.sectorChk) chk++; }
      });
      var top=Object.keys(cnt).sort(function(a,c){ return cnt[c]-cnt[a]; });
      return {설명:'업종(sector)은 산업군(industry: 기업/공공/금융/의료)보다 세분화된 분류입니다. «어느 업종이 많아?» 류 질문은 이 값을 쓰세요. 기준월에 매출 있는 고객 기준.',
        업종별_고객사수:top.reduce(function(o,k){ o[k]=cnt[k]; return o; },{}),
        업종별_기준월MRR:mrr, 미분류_고객사수:unc, 동명회사_확인필요:dup, 추정분류_확인필요:chk};
    })(),
    월별매출_최근24개월:months, 연도별매출:byYear,
    상위고객사15:topCust,
    만료예정_12개월내:exp.slice(0,20),
    해지사유별건수:churn,
    데이터점검: (function(){ try{ var d=dcSummary(); return {바로고침:d.crit, 확인필요:d.warn, 참고:d.info, 규칙별:d.items}; }catch(e){ return null; } })(),
    만기관리: (function(){   // ㊿+127 — LIVE 규칙 기준 처리 대상 (홈 › 만기 처리 창 · 매월 25일 슬랙 알림과 같은 계산)
      var S; try{ S=renewScan(b); }catch(e){ return null; }
      var row=function(r){ return [r.cust, lline(r.line), mk(r.endRaw), Math.round(r.mrr||0), r.status||'', r.channel||'']; };
      return {설명:'미처리 = 종료월이 지났는데 연장·해지·서비스종료 처리가 없어 이미 LIVE 에서 빠진 원계약(최근 24개월). 이달만기 = 종료월이 기준월 → 다음 달 1일 LIVE 에서 빠짐. 자동연장(auto_renew) 표시 계약은 제외. 행 = [고객사, 서비스, 종료월, MRR(원), 상태, 채널]. 처리는 포탈 홈 › 만기 처리 창에서 연장/서비스종료/해지 원클릭.',
        미처리_건수:S.lapsed.length, 미처리_월액합:Math.round(S.lapsed.reduce(function(a,r){ return a+(r.mrr||0); },0)), 미처리:S.lapsed.slice(0,25).map(row),
        이달만기_건수:S.due.length, 이달만기_월액합:Math.round(S.due.reduce(function(a,r){ return a+(r.mrr||0); },0)), 이달만기:S.due.slice(0,25).map(row),
        다음달만기_건수:S.next.length, 다음달만기:S.next.slice(0,25).map(row),
        확인중_최근2개월_미처리:S.checking.length};
    })(),
    LIVE증감_전월대비: (function(){   // ㊿+127 — LIVE 고객사 수가 왜 늘고 줄었는지 (회사 단위 · 표시용 분해)
      var d; try{ d=liveDelta(b); }catch(e){ return null; } if(!d) return null;
      return {설명:'LIVE 고객사 수(회사 단위)의 전월 대비 변화 분해. 만기미처리 = 종료월이 지나 빠졌지만 연장·해지 처리가 안 된 곳(연장 등록하면 되돌아옴). 확인중 = 그중 최근 2개월 — LIVE 숫자에는 넣지 않음.',
        전월:d.prevN, 기준월:d.curN, 증감:d.curN-d.prevN, 늘어난곳_사유별:{신규:d.n.신규, 복귀:d.n.복귀}, 빠진곳_사유별:{만기미처리:d.n.만기, 해지:d.n.해지, 종료:d.n.종료, 예외제외:d.n.예외},
        신규_복귀:d.added.slice(0,20).map(function(x){ return [x.cust, x.kind]; }), 빠진곳:d.removed.slice(0,20).map(function(x){ return [x.cust, x.kind]; }), 확인중:d.checking};
    })(),
    클라우드비용: (function(){   // 도구 › 클라우드 비용 (AWS 세전 USD · NCP 공급가액 ₩)
      if(!ST.RAWX.cloud || !ST.RAWX.cloud.costs || !ST.RAWX.cloud.costs.length) return null;
      var B=clBuild(); if(!B.months.length) return null;
      var M=B.months, li=M.length-1, pi=Math.max(0,li-1);
      var acc={}; B.awsKeys.concat(B.ncp? [B.ncp]:[]).forEach(function(k){ var a=B.acc[k];
        acc[a.label]={용도:a.purpose, 통화:a.currency, 최근월:M[li], 최근월금액:Math.round(a.totals[li]||0), 전월금액:Math.round(a.totals[pi]||0),
          최근12개월합:Math.round(clSum(a.totals.slice(-12)))}; });
      var awsM=M.map(function(_,i){ return Math.round(B.awsKeys.reduce(function(s,k){ return s+(B.acc[k].totals[i]||0); },0)); });
      var cnt=B.awsKeys.filter(function(k){ return B.acc[k].totals[li]!=null; }).length;
      return {설명:'AWS 는 세전 USD, NCP 는 공급가액 원. 원화환산 은 현재 환율(외부 조회)로 USD 를 바꾼 값(원). 최신 달은 인보이스가 덜 들어온 부분 집계일 수 있음 (집계 계정 수 참고).',
        현재환율_원달러:clFxRate(), 환율출처:(CL.fxNow&&CL.fxNow.src)||null,
        AWS_최근월_원화환산:Math.round(awsM[li]*clFxRate()),
        기간:[M[0],M[li]], AWS_월별합계_USD:M.map(function(m,i){ return [m, awsM[i]]; }), 최신달_집계된AWS계정수:cnt+'/'+B.awsKeys.length,
        계정별:acc, MDR인프라_USD:(B.acc.edr&&B.acc.tac)? {최근월:M[li], EDR:Math.round(B.acc.edr.totals[li]||0), awstac:Math.round(B.acc.tac.totals[li]||0)} : null};
    })(),
    임대장비: (function(){
      var a=ST.RAWX.assets||[]; if(!a.length) return null;
      var st={}, ch={}, us={};
      a.forEach(function(x){
        st[x.status||'미지정']=(st[x.status||'미지정']||0)+1;
        ch[x.channel||'미지정']=(ch[x.channel||'미지정']||0)+1;
        us[x.usage||'임대']=(us[x.usage||'임대']||0)+1;
      });
      return {전체대수:a.length, 상태별:st, 채널별:ch, 구분별:us};
    })(),
    장비요청: (function(){
      var o=ST.RAWX.orders||[]; if(!o.length) return null;
      var st={}; o.forEach(function(x){ st[x.status||'접수']=(st[x.status||'접수']||0)+1; });
      return {전체건수:o.length, 상태별:st};
    })(),
    MDR운영현황: (function(){
      var m=ST.RAWX.mdrops||[]; if(!m.length) return null;
      var st={}; m.forEach(function(x){ st[x.status||'대기']=(st[x.status||'대기']||0)+1; });
      var noRev=m.filter(function(x){ return x.status==='구독' && !x.on_rev_sheet; }).length;
      return {전체건수:m.length, 상태별:st, 구독인데_매출시트_미기입:noRev,
        신규신청:(m.filter(function(x){ return x.status==='신청'; }).slice(0,5)
          .map(function(x){ return [x.customer, String(x.created_at||'').slice(0,10)]; }))};
    })(),
    비즈포탈차액: (function(){
      var v=ST.DATA.vs; if(!v||!v.ok) return null;
      return {기준월:v.month, 항목:v.items.map(function(x){ return [x.k, x.v]; })};
    })(),
    OI파이프라인: (function(){   // 영업기회 — 10% 초기 딜도 빠짐없이 (우리 팀은 대부분 10% 로 두고 관리)
      var o=ST.RAWX.oi||[]; if(!o.length) return null;
      var open=o.filter(function(x){ return ['등록','진행','수주'].indexOf(x.stage)>=0; });
      var st={}, ln={}, ym={}, early=0, sum=0, wsum=0;
      open.forEach(function(x){ var a=Number(x.expect_amount)||0, p=Number(x.win_prob)||0, w=a*p/100;
        sum+=a; wsum+=w; if(p<=10) early++;
        var S=st[x.stage]=st[x.stage]||{건수:0,금액:0,가중:0}; S.건수++; S.금액+=a; S.가중+=w;
        var L=ln[x.line||'미지정']=ln[x.line||'미지정']||{건수:0,금액:0,가중:0}; L.건수++; L.금액+=a; L.가중+=w;
        var m=String(x.expect_month||'').slice(0,7)||'미정'; var Y=ym[m]=ym[m]||{건수:0,금액:0,가중:0}; Y.건수++; Y.금액+=a; Y.가중+=w; });
      var rnd=function(o2){ Object.keys(o2).forEach(function(k){ o2[k].금액=Math.round(o2[k].금액); o2[k].가중=Math.round(o2[k].가중); }); return o2; };
      var top=open.slice().sort(function(a,b){ return (Number(b.expect_amount)||0)-(Number(a.expect_amount)||0); }).slice(0,12)
        .map(function(x){ return [x.customer, x.stage, (Number(x.win_prob)||0)+'%', lline(x.line||''), String(x.expect_month||'').slice(0,7), Math.round(Number(x.expect_amount)||0)]; });
      var closed={}; o.forEach(function(x){ if(['종료','중지','실패','계산서발행'].indexOf(x.stage)>=0) closed[x.stage]=(closed[x.stage]||0)+1; });
      return {설명:'열린 OI(등록·진행·수주) 전체. win_prob 10% 는 «초기 단계» 표시일 뿐이므로 전망·파이프라인 답변에 반드시 포함하고, 비가중 합과 가중 기대치(금액×확률)를 함께 말할 것. 금액은 원.',
        열린건수:open.length, 초기단계_10퍼센트이하:early, 비가중금액합:Math.round(sum), 가중기대치:Math.round(wsum),
        단계별:rnd(st), 서비스별:rnd(ln), 예상월별:rnd(ym), 상위딜:[['고객','단계','확률','서비스','예상월','예상금액(원)']].concat(top), 닫힌건:closed};
    })()
  };
}

/* ---- 계산 결과를 AI에게 보내 한국어 코멘트 받기 ---- */
export function requestNarrate(q, plan, res){
  var box=$('#aiComment');
  box.className='ai-comment on loading'; box.textContent='코멘트를 쓰는 중…';
  var custSet={}; uniqCache('cust').forEach(function(n){ custSet[n]=1; });
  var mask=AICFG.maskNames;
  var alias={}, seq=0;
  function mn(s){
    if(!mask) return s;
    s=String(s==null?'':s);
    if(!custSet[s]) return s;
    if(!alias[s]) alias[s]='고객'+String.fromCharCode(65+(seq++ % 26))+(seq>26?seq:'');
    return alias[s];
  }
  var payload={
    question:q, restate:plan.restate||'', headline:(res.hero||'')+(res.unit||''), sub:res.sub||'',
    chart: res.chart&&res.chart.labels ? {
      labels: res.chart.labels.slice(-36).map(mn),
      series: res.chart.series.map(function(s){ return {label:s.label, data:s.data.slice(-36).map(function(v){return Math.round(v);})}; })
    } : null,
    table: res.table&&res.table.rows ? {
      cols: res.table.cols,
      rows: res.table.rows.slice(0,12).map(function(row){ return row.map(mn); })
    } : null,
    unit:'천원(KRW)', note:'미래 월은 계약상 예정 금액'
  };
  aiFetch({mode:'narrate', payload:payload})
    .then(function(x){
      if(x && x.ok && x.text){ box.className='ai-comment on'; box.innerHTML=tpl`<span class="lb">AI 코멘트</span>${x.text}`; }
      else box.className='ai-comment';
    })
    .catch(function(){ box.className='ai-comment'; });
}

/* ---- 이름 매칭 (표기 흔들림·오타 허용) ---- */
export function nrm(s){
  return String(s==null?'':s).toLowerCase()
    .replace(/주식회사|㈜|\(주\)|\(유\)|유한회사|아이앤씨/g,'')
    .replace(/[\s\-_·.,'"()\[\]\/]/g,'');
}
export function bigr(s){ var a={}; for(var i=0;i<s.length-1;i++) a[s.substr(i,2)]=1; return a; }
export function dice(a,b){
  if(a.length<2||b.length<2) return a===b?1:0;
  var A=bigr(a),B=bigr(b),ka=Object.keys(A),kb=Object.keys(B),hit=0;
  ka.forEach(function(k){ if(B[k]) hit++; });
  return 2*hit/(ka.length+kb.length);
}
export function resolveEntity(s, kind){
  var qn=nrm(s); if(qn.length<1) return null;
  var list=uniqCache(kind), best=null, bs=0;
  for(var i=0;i<list.length;i++){
    var nn=nrm(list[i]);
    if(!nn) continue;
    if(nn===qn) return list[i];
    var sc;
    if(qn.length>=2 && (nn.indexOf(qn)>=0 || qn.indexOf(nn)>=0)) sc = 0.9 + Math.min(qn.length,nn.length)/200;
    else sc = dice(qn,nn);
    if(sc>bs){ bs=sc; best=list[i]; }
  }
  return bs>=0.56 ? best : null;
}
export var UNRESOLVED=[];
export function resolveMany(arr, kind){
  var out=[];
  (arr||[]).forEach(function(s){
    var m=resolveEntity(s,kind);
    if(m){ if(out.indexOf(m)<0) out.push(m); }
    else if(String(s||'').trim()) UNRESOLVED.push(String(s).trim());
  });
  return out;
}

/* ---- LLM 조회계획 -> 내부 파라미터 ---- */
export function ymIdx(k){
  var m=String(k||'').match(/(\d{4})\D+(\d{1,2})/);
  if(!m) return null;
  return (+m[1]-2020)*12 + (+m[2]-6);
}
export var INTENT_MAP={sum:'sum',trend:'trend',rank:'rank',share:'share',growth:'growth',count:'count',
  churn:'churn','new':'new',renew:'renew',expiring:'expiring',contracts:'contracts',compare:'compare',
  forecast:'forecast'};

export function planToP(plan){
  UNRESOLVED=[];
  var p={raw:plan.restate||'', years:[], months:[], quarter:null, half:null, relN:null, from:null, to:null,
         lines:[], ind:null, partners:[], custs:[], partner:null, cust:null, statuses:[],
         topN:null, groupBy:null, metric:'sum', horizon:null, compareBy:null, compareItems:null};

  var per=plan.period||{};
  var yrs=(per.years||[]).map(Number).filter(function(y){return y>2000&&y<2100;});
  switch(String(per.type||'none')){
    case 'years':  p.years=yrs; break;
    case 'months': p.years=yrs; p.months=(per.months||[]).map(Number).filter(function(m){return m>=1&&m<=12;}); break;
    case 'quarter':p.years=yrs; p.quarter=per.quarter||null; break;
    case 'half':   p.years=yrs; p.half=per.half||null; break;
    case 'last_n_months': p.relN=Math.max(1,Math.min(120, per.n||6)); break;
    case 'range':  p.from=ymIdx(per.from); p.to=ymIdx(per.to);
                   if(p.from==null||p.to==null){ p.from=p.to=null; p.years=yrs; } break;
  }

  var valid={};
  ST.DATA.lines.forEach(function(l){ valid[l.label.toLowerCase()]=l.label; });
  (plan.lines||[]).forEach(function(s){ var v=valid[String(s).toLowerCase()]; if(v && p.lines.indexOf(v)<0) p.lines.push(v); });

  if(plan.industry==='기업'||plan.industry==='공공') p.ind=plan.industry;
  var CHOK={'일반':1,'조달':1,'공공':1,'LGU+':1,'에스원':1,'유통':1};   // 공공은 옛 표기 호환
  p.channels=(plan.channels||[]).map(String).filter(function(c){ return CHOK[c]; });
  p.partners=resolveMany(plan.partners,'partner');
  p.custs=resolveMany(plan.customers,'cust');
  p.partner=p.partners[0]||null; p.cust=p.custs[0]||null;
  p.statuses=(plan.statuses||[]).filter(function(s){ return ['신규','재약정','추가','서비스 종료','서비스종료','해지'].indexOf(s)>=0; })
    .map(function(s){ return s==='서비스종료'? '서비스 종료' : s; });

  var g=String(plan.groupBy||'none');
  if(['partner','ind','line','cust','month','year','churn','status','channel'].indexOf(g)>=0) p.groupBy=g;
  if(plan.topN>0) p.topN=Math.min(50, plan.topN|0);
  if(plan.horizonMonths>0) p.horizon=Math.min(120, plan.horizonMonths|0);

  var it=INTENT_MAP[String(plan.intent||'sum')] || 'sum';
  if(it==='rank'){ p.metric='sum'; p.topN=p.topN||10; if(!p.groupBy) p.groupBy='cust'; }
  else if(it==='compare'){
    p.metric='compare';
    p.compareBy=String(plan.compareBy||'none');
    p.compareItems=(plan.compareItems||[]).slice(0,5);
    if(p.compareBy==='partner') p.compareItems=resolveMany(p.compareItems,'partner');
    if(p.compareBy==='cust')    p.compareItems=resolveMany(p.compareItems,'cust');
    if(p.compareItems.length<2){ p.metric='sum'; p.compareBy=null; }
  }
  else p.metric=it;
  p.unresolved=UNRESOLVED.slice();
  return p;
}

/* ---------- 규칙형 해석기 (외부 호출 0) ---------- */

export var STOP = {'매출':1,'실적':1,'금액':1,'얼마':1,'올해':1,'작년':1,'내년':1,'추이':1,'비중':1,'순위':1,
  '고객':1,'고객사':1,'파트너':1,'산업군':1,'해지':1,'신규':1,'재약정':1,'계약':1,'만료':1,'성장':1,
  '알려줘':1,'보여줘':1,'어때':1,'누구':1,'누가':1,'어디':1,'상위':1,'최근':1,'요즘':1,'기준':1,'현재':1};

export var RX = {
  money:  /매출|매액|매상|금액|돈|수익|실적|얼마|얼만|얼마야|얼마니|얼마냐|얼마임|얼마정도|어느정도|얼마나돼|얼마나됨|얼마나했|얼마했|총액|총합|합계|누적|다합|달성|벌었|벌어|버는|벌고|번돈|판매|세일즈|수입|수주액|계약액|매출액수|mrr|arr|나왔|찍었|찍은|규모|외형|볼륨|토탈|얼마치/,
  count:  /몇(건|곳|개|군데|개사|명|사|업체|회사|고객|사이트)|건수|개수|고객수|고객사수|업체수|회사수|거래처수|계정수|계약수|사이트수|라이브|live|활성|액티브|active|유지중|유지되|구독중|사용중|이용중|운영중|살아있|남아있|총고객|전체고객|몇이|숫자|얼마나많|얼마나되는|몇군데/,
  growth: /성장|성장률|성장세|증가율|증감|늘었|늘어|늘었나|늘고|늘어난|줄었|줄어|줄고|줄어든|올랐|올라갔|떨어졌|떨어져|감소|상승|하락|증가|급증|급감|추락|껑충|yoy|전년대비|작년대비|작년보다|전년비|재작년보다|얼마나컸|얼마나늘|얼마나줄|몇프로늘|몇퍼늘|몇프로줄|몇프로|몇퍼센트|좋아졌|나빠졌|개선|악화|커졌|작아졌|배로|갑절|반토막|성장중|주춤|정체/,
  vibe:   /어때|어떻|어떤가|어떠|괜찮|상황|근황|현황|요약|브리핑|간단히|정리해|한눈에|어떻게돼가|잘되고|잘돼가|잘가고/,
  churn:  /해지|이탈|해약|중지|중단|끊|나갔|나감|떠난|떠났|떠나|잃었|잃은|빠졌|빠져나|빠진|취소|철수|종료했|그만둔|그만뒀|떨어져나간|짤린|짤렸|손실고객|계약해지|서비스중단|churn|이탈률|해지율/,
  neu:    /신규|새로|새롭게|새고객|새계약|따낸|따온|따와|수주|획득|들어온|영입|유치|런칭|개통|오픈한|신규계약|신규고객|올린|추가된/,
  renew:  /재약정|갱신|연장|재계약|재체결|리뉴얼|리뉴|renew/,
  expire: /만료|만기|끝나|끝날|끝나가|계약끝|종료예정|종료임박|재약정대상|재약정타깃|재약정타겟|재약정해야|갱신대상|갱신해야|갱신시점|곧끝|임박|다가오|챙겨야|챙길|마감|기한|데드라인|재계약대상|위험|리스크|놓치면|연내만료|만료예정/,
  trend:  /추이|트렌드|흐름|변화|추세|곡선|커브|히스토리|그래프|차트|어떻게변|월별변화|움직임|궤적/,
  share:  /비중|비율|점유|점유율|share|퍼센트|퍼센티지|프로차지|percent|차지|몫|셰어|구성비|구성|파이|포션/,
  rank:   /top|탑|상위|순위|랭킹|제일|가장|최고|최다|1위|일위|원탑|넘버원|베스트|best|잘나가|잘팔리|효자|주력|핵심고객|주요고객|대형고객|큰손|메인고객|많이벌|많이버는|많이하는|큰곳|누가제일|어디가제일|어느파트너|어떤파트너|어느고객|어떤고객|누가많이|어디가많이/,
  rankN:  /(제일|가장|최고|큰|많은|굵직한|덩치)\s*(큰|많은|비싼|버는|하는)?\s*(고객|고객사|업체|회사|거래처|파트너|총판|채널|계약|라인|제품)/,
  compare:/vs|비교|중에|중누가|어느쪽|보다더|누가더|어디가더|누가큰|누가높|누가낮|대비해서|맞대결|견줘|나란히|랑.*중|와.*중/,
  bottom: /하위|꼴찌|최하위|제일작|가장작|제일적|가장적|안팔리|저조|부진|바닥|작은순|낮은순|약한|밑에서/,
  gBiller:/계산서|발행처|발행대상|발행업체|빌링|인보이스|세금계산서|대리점|청구처|청구대상/,
  allTime:/역대|전체기간|전기간|지금까지|여태|여지껏|통틀어|올타임|처음부터|창립이래|서비스시작부터/,
  avg:    /평균|월평균|평균적|한달에보통|보통얼마|다달이/,
  contract:/계약규모|큰계약|계약이큰|계약top|큰건|굵직한계약|계약순위|계약금액|큰딜|딜규모|건별/,
  lgu:    /lgu|lg유|엘지유|유플러스|유플|엘지경유|lg경유|lg를통|lg통해|엘지를통|엘지통해|lg판매|엘지판매|엘지/,
  bizvs:  /비즈포탈|비즈포털|회계매출|대사|매출차이|차액|왜다르|왜달라|안맞|불일치/
};

export function nrmQ(s){ return String(s||'').toLowerCase().replace(/\s+/g,''); }
export function stripJosa(t){
  return String(t).replace(/(은|는|이|가|을|를|의|에서|에게|에|도|랑|이랑|와|과|보다|만|까지|부터|한테|께|로|으로)$/,'');
}

/** 문장에서 고객사/파트너 이름을 찾아냅니다 (표기 흔들림·오타 허용) */
export function findEntities(q, kind){
  var list = uniqCache(kind), qn = nrm(q), out = [];
  list.slice().sort(function(a,b){ return nrm(b).length - nrm(a).length; }).forEach(function(n){
    var nn = nrm(n);
    if (nn.length < 2) return;
    if (qn.indexOf(nn) >= 0 && out.indexOf(n) < 0) out.push(n);
  });
  if (out.length) return out.slice(0, 3);

  var toks = String(q).split(/[\s,·\/]+/)
    .map(function(t){ return stripJosa(t); })
    .filter(function(t){ return t.length >= 2 && !STOP[t]; })
    .map(nrm).filter(function(t){ return t.length >= 2; });
  var best = null, bs = 0;
  toks.forEach(function(t){
    list.forEach(function(n){ var sc = dice(t, nrm(n)); if (sc > bs) { bs = sc; best = n; } });
  });
  return bs >= 0.62 ? [best] : [];
}

export var Q_LAST = null;

export function parseQ(q){
  var p = parseRaw(q);
  if (Q_LAST && isFollowUp(q, p)) p = mergeP(Q_LAST, p);
  p.restate = describeP(p);
  Q_LAST = p;
  return p;
}

export function isFollowUp(q, p){
  var s = nrmQ(q).replace(/[?!.]+$/,'');
  if (/^(그럼|그러면|그리고|그건|여기서|이중에|거기서|그다음|반대로|그러면요)/.test(s)) return true;
  var hasPeriod = p.years.length || p.months.length || p.quarter || p.half || p.relN || p.from != null;
  if (hasPeriod || p.metricExplicit) return false;
  // "공공만", "파트너별로", "클라우드는?" 같은 조각
  return /(별로|별|만|은|는|도|쪽)$/.test(s) || s.length <= 5;
}

/** 이어지는 질문 — 앞 질문 조건에 이번 질문에서 바뀐 것만 덮어씀 @param {ParsedQ} prev @param {ParsedQ} cur @returns {ParsedQ} */
export function mergeP(prev, cur){
  var m = Object.assign({}, prev);
  ['years','months','lines','partners','custs'].forEach(function(k){ if (cur[k] && cur[k].length) m[k] = cur[k]; });
  ['quarter','half','relN','from','to','ind','topN','groupBy','horizon','compareBy','compareItems']
    .forEach(function(k){ if (cur[k] !== null && cur[k] !== undefined && cur[k] !== '' ) m[k] = cur[k]; });
  if (cur.metricExplicit) m.metric = cur.metric;
  m.partner = (m.partners && m.partners[0]) || null;
  m.cust = (m.custs && m.custs[0]) || null;
  m.raw = cur.raw; m.hits = cur.hits + 1; m.followUp = true;
  return m;
}

/** 질문 해석 결과 (parseRaw · mergeP · ㊿+155 이름표)
 * @typedef {Object} ParsedQ
 * @property {string} raw 질문 원문
 * @property {number[]} years @property {number[]} months @property {?number} quarter @property {?number} half
 * @property {?number} relN 최근 N개월 @property {?number} from 시작 월 인덱스(STATE.base 와 같은 눈금) @property {?number} to 끝 월 인덱스
 * @property {boolean} [_recentAuto] 요즘/현재 라는 말로 최근 6개월을 자동으로 잡음 @property {boolean} [avg] 월평균 @property {boolean} [bottom] 하위 N
 * @property {number[]} [quarters] 비교용 분기 여러 개 @property {string[]} [ptns] 파트너(정해진 이름) 여러 개
 * @property {string[]} lines 사업 라인 코드 @property {?string} ind 업종 @property {string[]} partners @property {string[]} custs
 * @property {?string} partner @property {?string} cust @property {string[]} statuses
 * @property {?number} topN @property {?string} groupBy @property {string} metric @property {boolean} metricExplicit @property {?number} horizon
 * @property {?string} compareBy @property {?string[]} compareItems @property {string[]} unresolved @property {number} hits 조건이 잡힌 수
 * @property {boolean} followUp 앞 질문을 이어받음 @property {?string} focus @property {string} [restate] 사람이 읽는 조건 요약
 */
/** @param {string} q @returns {ParsedQ} */
export function parseRaw(q){
  var raw = q, s = nrmQ(q);
  /** @type {ParsedQ} */
  var p = { raw: raw, years: [], months: [], quarter: null, half: null, relN: null, from: null, to: null,
    lines: [], ind: null, partners: [], custs: [], partner: null, cust: null, statuses: [],
    topN: null, groupBy: null, metric: 'sum', metricExplicit: false, horizon: null,
    compareBy: null, compareItems: null, unresolved: [], hits: 0, followUp: false, focus: null };

  var nowY = yOf(STATE.base), nowM = monOf(STATE.base);
  function hit(){ p.hits++; }

  /* ---- 명시적 구간: 2024년 3월부터 2025년 6월까지 ---- */
  var rg = raw.match(/(20\d{2})\s*년?\s*(\d{1,2})\s*월\s*(?:부터|~|-|–|에서)\s*(?:(20\d{2})\s*년?\s*)?(\d{1,2})\s*월/);
  if (rg) {
    var y1 = +rg[1], m1 = +rg[2], y2 = rg[3] ? +rg[3] : (/작년|지난해/.test(raw) ? nowY - 1 : y1), m2 = +rg[4];
    p.from = (y1 - 2020) * 12 + (m1 - 6);
    p.to = (y2 - 2020) * 12 + (m2 - 6);
    if (p.from > p.to) { var t = p.from; p.from = p.to; p.to = t; }
    hit();
  }

  /* ---- 상대 기간 ---- */
  var rn = raw.match(/(?:최근|지난|근)\s*(\d{1,3})\s*(개월|달)/);
  if (rn) { p.relN = Math.min(120, +rn[1]); hit(); }
  var ry = raw.match(/(?:최근|지난)\s*(\d{1,2})\s*년(?!\s*\d)/);
  if (!p.relN && ry) { p.relN = Math.min(120, +ry[1] * 12); hit(); }
  if (!p.relN && p.from == null && RX.allTime.test(s)) { p.from = 0; p.to = STATE.base; hit(); }
  if (!p.relN && !p.from && /요즘|최근에|근래|요새|최근|현재|지금(?!까지)/.test(raw) && !/20\d{2}/.test(raw)) { p.relN = 6; p._recentAuto = true; hit(); }
  if (RX.avg.test(s)) { p.avg = true; hit(); }

  /* ---- 연도 ---- */
  if (p.from == null && !p.relN) {
    (raw.match(/20\d{2}/g) || []).forEach(function(y){ p.years.push(+y); hit(); });
    (raw.match(/(?:^|[^0-9])([23][0-9])\s*년/g) || []).forEach(function(x){
      var v = +x.replace(/\D/g, '');
      if (v >= 20 && v <= 35) { p.years.push(2000 + v); hit(); }
    });
    if (/올해|금년|이번\s*해|당해|올\s*한\s*해|올\s*들어|연초부터|연초\s*이후/.test(raw)) { p.years.push(nowY); hit(); }
    if (/재작년/.test(raw)) { p.years.push(nowY - 2); hit(); }
    else if (/작년|지난해|전년/.test(raw)) { p.years.push(nowY - 1); hit(); }
    if (/내년|차년/.test(raw)) { p.years.push(nowY + 1); hit(); }
    p.years = p.years.filter(function(v,i,a){ return a.indexOf(v) === i; });
    if (p.years.length >= 2 && /[~\-–]|부터|까지|간|동안/.test(raw) && !RX.compare.test(s)) {
      var lo = Math.min.apply(null, p.years), hi = Math.max.apply(null, p.years), r2 = [];
      for (var y3 = lo; y3 <= hi; y3++) r2.push(y3);
      p.years = r2;
    }
  }

  /* ---- 월 / 분기 / 반기 ---- */
  if (p.from == null) {
    var mm = raw.match(/(\d{1,2})\s*월/g);
    if (mm && !rg) mm.forEach(function(x){ var v = +x.replace(/\D/g,''); if (v >= 1 && v <= 12) { p.months.push(v); hit(); } });
    if (/이번\s*달|당월|금월|이달/.test(raw)) { p.months.push(nowM); hit(); }
    if (/지난\s*달|전월|저번\s*달/.test(raw)) { p.months.push(nowM === 1 ? 12 : nowM - 1); hit(); }
    var qms = raw.match(/[1-4]\s*분기/g) || [];
    p.quarters = qms.map(function(x){ return +x.replace(/\D/g,''); }).filter(function(v,i,a){ return a.indexOf(v)===i; });
    var qm = raw.match(/([1-4])\s*분기|Q\s*([1-4])/i);
    if (qm) { p.quarter = +(qm[1] || qm[2]); hit(); }
    if (/이번\s*분기|금분기/.test(raw)) { p.quarter = Math.ceil(nowM / 3); if (!p.years.length) p.years.push(nowY); hit(); }
    if (/지난\s*분기|전분기|저번\s*분기/.test(raw)) {
      var pq = Math.ceil(nowM / 3) - 1;
      p.quarter = pq < 1 ? 4 : pq;
      if (!p.years.length) p.years.push(pq < 1 ? nowY - 1 : nowY);
      hit();
    }
    if (/상반기/.test(raw)) { p.half = 1; hit(); }
    if (/하반기/.test(raw)) { p.half = 2; hit(); }
  }

  /* ---- 사업라인 ---- */
  LINE_ALIAS.forEach(function(a){ if (a[0].test(s) && p.lines.indexOf(a[1]) < 0) { p.lines.push(a[1]); hit(); } });

  /* ---- 산업군 ---- */
  if (/공공|관공서|기관|지자체|공기업/.test(raw)) { p.ind = '공공'; hit(); }
  else if (/기업고객|민간|일반기업|기업쪽|기업은|기업만|기업\s*매출/.test(raw)) { p.ind = '기업'; hit(); }

  /* ---- 이름 ---- */
  p.ptns = [];
  if (/다원/.test(s)) p.ptns.push('다원티에스');
  if (/글로웰/.test(s)) p.ptns.push('글로웰시스템');
  if (/에티버스/.test(s)) p.ptns.push('에티버스');
  if (/직접판매|직판|직거래|직접계약|계산서발행(?!처|대상|업체)/.test(s)) p.ptns.push('직접(계산서)');
  if (p.ptns.length) hit();
  p.partners = p.ptns.length ? [] : findEntities(raw, 'partner');
  p.custs = findEntities(raw, 'cust');
  if (p.partners.length && p.custs.length) {
    var pl = nrm(p.partners[0]).length, cl = nrm(p.custs[0]).length;
    if (pl >= cl) p.custs = []; else p.partners = [];
  }
  p.partner = p.partners[0] || null;
  p.cust = p.custs[0] || null;
  if (p.partner || p.cust) hit();

  /* ---- 상위 N ---- */
  var tn = raw.match(/top\s*(\d+)|상위\s*(\d+)|(\d+)\s*위|(\d+)\s*개(?!월)|(\d+)\s*곳|(\d+)\s*건(?!수)/i);
  if (tn) { p.topN = +(tn[1] || tn[2] || tn[3] || tn[4] || tn[5] || tn[6]); hit(); }

  /* ---- 그룹 기준 ---- */
  if (RX.gBiller.test(s)) p.groupBy = 'biller';
  else if (/파트너별|채널별|총판별|파트너/.test(raw)) p.groupBy = 'partner';
  else if (/산업군|업종|섹터|분야별/.test(raw)) p.groupBy = 'ind';
  else if (/사업라인|라인별|제품별|상품별|서비스별|솔루션별|제품|상품|솔루션/.test(raw)) p.groupBy = 'line';
  else if (/고객사별|고객별|업체별|회사별|거래처별/.test(raw)) p.groupBy = 'cust';
  else if (/분기별|분기마다|쿼터별/.test(raw)) p.groupBy = 'quarter';
  else if (/월별|월간|매월|달별/.test(raw)) p.groupBy = 'month';
  else if (/연도별|연간|년도별|해마다|매년|년별/.test(raw)) p.groupBy = 'year';
  else if (/사유|이유|원인/.test(raw) || (/왜/.test(raw) && RX.churn.test(s))) p.groupBy = 'churn';
  if (p.groupBy) hit();

  /* ---- 최상급 표현에서 그룹 유추 ---- */
  var isRank = RX.rank.test(s) || RX.rankN.test(raw) || RX.bottom.test(s);
  if (RX.bottom.test(s)) { p.bottom = true; hit(); }
  if (isRank) {
    hit();
    if (!p.groupBy) {
      if (/파트너|총판|채널|대리점/.test(raw)) p.groupBy = 'partner';
      else if (/산업군|업종/.test(raw)) p.groupBy = 'ind';
      else if (/라인|제품|상품|솔루션/.test(raw)) p.groupBy = 'line';
      else if (/계약/.test(raw)) p.groupBy = null;
      else p.groupBy = 'cust';
    }
    if (!p.topN) p.topN = 10;
  }

  /* ---- 지표 ---- */
  function setM(m){ p.metric = m; p.metricExplicit = true; hit(); }
  if (RX.expire.test(s)) {
    setM('expiring');
    var hz = raw.match(/(\d{1,2})\s*개월\s*(내|이내|안)/);
    p.horizon = hz ? +hz[1] : (/곧|임박|바로/.test(raw) ? 3 : 6);
  }
  else if (RX.contract.test(s) || (isRank && /계약/.test(raw) && !/고객|파트너|산업/.test(raw))) setM('contracts');
  else if (RX.churn.test(s)) setM('churn');
  else if (RX.renew.test(s)) setM('renew');
  else if (RX.neu.test(s)) setM('new');
  else if (RX.count.test(s)) setM('count');
  else if (RX.share.test(s)) setM('share');
  else if (RX.growth.test(s) && !isRank) setM('growth');
  else if (RX.trend.test(s) || (!isRank && (p.relN || RX.vibe.test(s)))) setM('trend');
  else if (RX.money.test(s)) setM('sum');

  /* ---- 비교 ---- */
  if (RX.compare.test(s)) {
    if (p.lines.length >= 2) { p.compareBy = 'line'; p.compareItems = p.lines.slice(0, 5); p.lines = []; }
    else if (p.ptns && p.ptns.length >= 2) { p.compareBy = 'ptn'; p.compareItems = p.ptns.slice(0, 5); p.ptns = []; }
    else if (p.partners.length >= 2) { p.compareBy = 'partner'; p.compareItems = p.partners.slice(0, 5); p.partners = []; p.partner = null; }
    else if (p.custs.length >= 2) { p.compareBy = 'cust'; p.compareItems = p.custs.slice(0, 5); p.custs = []; p.cust = null; }
    else if (p.years.length >= 2) { p.compareBy = 'year'; p.compareItems = p.years.slice(0, 5).map(String); p.years = []; }
    else if (p.quarters && p.quarters.length >= 2) { p.compareBy = 'quarter'; p.compareItems = p.quarters.slice(0, 4).map(String); p.quarter = null; }
    else if (p.years.length === 1 && p.years[0] !== nowY) { p.compareBy = 'year'; p.compareItems = [String(p.years[0]), String(nowY)]; p.years = []; }
    if (p.compareItems) { p.metric = 'compare'; p.metricExplicit = true; hit(); }
  }
  // "분기별 비교" 처럼 항목 없이 비교를 말하면 분기별 집계로
  if (RX.compare.test(s) && !p.compareItems && p.groupBy === 'quarter') { p.metric = 'sum'; }

  /* ---- 기본 보정 ---- */
  if (p.metric === 'count' && p._recentAuto) { p.relN = null; }   // "현재 고객 수" → LIVE 탭 기준
  if ((p.quarter || p.half) && !p.years.length && p.from == null && !p.relN) p.years = [nowY];
  if (p.metric === 'sum' && p.groupBy === 'month') { p.metric = 'trend'; }
  if (p.metric === 'share' && !p.groupBy) {
    // "공공 비중" -> 산업군별로 나눠 보여주고 공공을 강조
    if (p.ind) { p.groupBy = 'ind'; p.focus = p.ind; p.ind = null; }
    else if (p.partner) { p.groupBy = 'partner'; p.focus = p.partner; p.partners = []; p.partner = null; }
    else if (p.lines.length === 1) { p.groupBy = 'line'; p.focus = p.lines[0]; p.lines = []; }
    else p.groupBy = 'line';
  }
  if (p.metric === 'growth' && !p.years.length) p.years = [nowY];
  if (p.topN && p.groupBy && ['month','year','churn'].indexOf(p.groupBy) < 0 &&
      ['expiring','contracts','churn','new','renew','count','compare'].indexOf(p.metric) < 0) {
    p.metric = p.metric === 'share' ? 'share' : 'sum';
  }
  return p;
}

/** 사람이 읽는 해석 문장 */
export function describeP(p){
  var per;
  if (p.metric === 'compare' && p.compareBy === 'year') per = '연도 비교';
  else if (p.relN) per = '최근 ' + p.relN + '개월';
  else if (p.from != null && p.to != null) per = mk(Math.max(0,p.from)) + '~' + mk(Math.min(ST.M-1,p.to));
  else if (p.years.length) per = p.years.join('·') + '년';
  else per = '기준월 ' + mk(STATE.base);
  if (p.metric === 'compare' && p.compareBy === 'year') return per + ' · ' + p.compareItems.join(' vs ') + '년';
  if (p.quarter) per += ' ' + p.quarter + '분기';
  if (p.half) per += ' ' + (p.half === 1 ? '상반기' : '하반기');
  if (p.months.length) per += ' ' + p.months.join(',') + '월';

  var who = [];
  if (p.lines.length) who.push(p.lines.join('+'));
  if (p.ind) who.push(p.ind);
  if (p.partners.length) who.push('파트너 ' + p.partners.join('+'));
  if (p.custs.length) who.push(p.custs.join('+'));

  var what = { sum: p.avg?'월평균 매출':'매출 합계', trend: p.avg?'월평균 매출':'월별 추이', share:'비중', growth:'전년 대비 성장률',
    count:'고객사 수 (LIVE 탭)', churn:'해지 계약', 'new':'신규 계약', renew:'재약정 계약',
    expiring:'만료 예정 계약', contracts:'계약 규모 순위', compare:'비교' }[p.metric] || '매출';
  if (p.metric === 'compare' && p.compareItems) what = p.compareItems.join(' vs ') + ' 비교';
  else if (p.metric === 'expiring') what = '향후 ' + (p.horizon || 6) + '개월 내 만료 계약';
  else if (p.topN && p.groupBy) what = gbLabel(p.groupBy) + (p.bottom ? ' 하위 ' : ' 상위 ') + p.topN + (p.metric === 'share' ? ' 비중' : '');
  else if (p.groupBy) what = gbLabel(p.groupBy) + '별 ' + what;

  return per + (who.length ? ' · ' + who.join(' · ') : '') + ' · ' + what +
         (p.followUp ? ' (앞 질문 이어서)' : '');
}

/** 못 알아들었을 때 띄울 후보 질문 */
export function suggestFor(p){
  var out = [];
  var who = p.custs[0] || p.partners[0] || (p.lines[0] || '');
  if (who) { out.push(who + ' 매출 추이'); out.push(who + ' 계약 만료 예정'); }
  var yr = p.years[0] || yOf(STATE.base);
  out.push(yr + '년 매출 얼마야?');
  out.push('제일 큰 고객 top10');
  out.push('6개월 내 만료 계약');
  return out.filter(function(v,i,a){ return a.indexOf(v) === i; }).slice(0, 4);
}

export var _uc={};
export function uniqCache(k){ if(!_uc[k]) _uc[k]=uniq(function(r){return r[k];}); return _uc[k]; }

/* ---------- 입력 자동완성 ---------- */
export var TEMPLATES = [
  '올해 매출 어때?','작년보다 얼마나 늘었어?','최근 6개월 추이 보여줘','제일 큰 고객 누구야?',
  '파트너별 top10','산업군별 비중','공공 비중이 얼마나 돼?','올해 해지 고객 몇 곳?',
  '해지 사유 알려줘','곧 재약정 챙겨야 할 데 있어?','6개월 내 만료 계약','제일 큰 계약 5개',
  '신규 계약 몇 건이야?','고객 몇 곳이나 돼?','상반기 매출','지난 분기 실적','연도별 매출',
  '월평균 얼마야?','역대 총매출','하위 5개 파트너','연내 만료되는 계약','live 고객사 수',
  'LG로 판매한 거 뭐 있어?','비즈포탈이랑 차이 왜 나?','효자 제품 뭐야?','클라우드 고객 몇 곳?'
];
export var SUG = { items: [], sel: -1 };

export function setupSuggest(){
  var q = $('#q'), box = $('#sug'), t;
  q.oninput = function(){ clearTimeout(t); var v = this.value; t = setTimeout(function(){ renderSuggest(v); }, 90); };
  q.onfocus = function(){ if (this.value.trim()) renderSuggest(this.value); };
  q.onblur = function(){ setTimeout(hideSuggest, 160); };
  q.onkeydown = function(e){
    var on = box.classList.contains('on');
    if (e.key === 'ArrowDown' && on) { e.preventDefault(); moveSel(1); }
    else if (e.key === 'ArrowUp' && on) { e.preventDefault(); moveSel(-1); }
    else if (e.key === 'Escape') { hideSuggest(); }
    else if (e.key === 'Enter') {
      if (on && SUG.sel >= 0) { e.preventDefault(); ask(SUG.items[SUG.sel].q); }
      else ask(this.value);
    }
  };
}
export function hideSuggest(){ $('#sug').classList.remove('on'); SUG.sel = -1; }
export function moveSel(d){
  var n = SUG.items.length; if (!n) return;
  SUG.sel = (SUG.sel + d + n + 1) % (n + 1) - 1;
  if (SUG.sel < 0) SUG.sel = d > 0 ? 0 : n - 1;
  $$('#sug .it').forEach(function(el2,i){ el2.classList.toggle('sel', i === SUG.sel); });
}
export function renderSuggest(v){
  var box = $('#sug');
  var s = String(v || '').trim();
  if (s.length < 1) { hideSuggest(); return; }
  var qn = nrm(s), items = [];

  function push(kind, label, question){
    if (items.length >= 7) return;
    if (items.some(function(x){ return x.q === question; })) return;
    items.push({ kind: kind, label: label, q: question });
  }
  // 고객사 / 파트너 이름
  ['cust','partner'].forEach(function(kind){
    if (items.length >= 5) return;
    uniqCache(kind).forEach(function(n){
      if (items.length >= 5) return;
      var nn = nrm(n);
      if (nn.length >= 1 && qn.length >= 1 && nn.indexOf(qn) === 0) {
        push(kind === 'cust' ? '고객사' : '파트너', n, n + (kind === 'cust' ? ' 매출 추이' : ' 실적 추이'));
      }
    });
  });
  ['cust','partner'].forEach(function(kind){
    if (items.length >= 6) return;
    uniqCache(kind).forEach(function(n){
      if (items.length >= 6) return;
      var nn = nrm(n);
      if (nn.length >= 2 && nn.indexOf(qn) > 0) {
        push(kind === 'cust' ? '고객사' : '파트너', n, n + (kind === 'cust' ? ' 매출 추이' : ' 실적 추이'));
      }
    });
  });
  // 템플릿 질문
  TEMPLATES.forEach(function(tp){ if (nrm(tp).indexOf(qn) >= 0) push('질문', tp, tp); });
  if (items.length < 3) TEMPLATES.slice(0, 3).forEach(function(tp){ push('질문', tp, tp); });

  if (!items.length) { hideSuggest(); return; }
  SUG.items = items; SUG.sel = -1;
  box.innerHTML = '';
  items.forEach(function(it, i){
    var d = el('div','it');
    var k = el('span','k', it.kind); d.appendChild(k);
    var txt = el('span'); txt.innerHTML = hl(it.q, s); d.appendChild(txt);
    d.onmousedown = function(e){ e.preventDefault(); ask(it.q); };
    box.appendChild(d);
  });
  box.classList.add('on');
}
export function hl(text, term){
  var t = esc(text), tn = nrm(text), qn = nrm(term);
  var i = tn.indexOf(qn);
  if (i < 0 || !qn) return t;
  // 정규화 인덱스는 원문과 어긋날 수 있어, 원문에서 다시 찾습니다
  var j = text.toLowerCase().indexOf(term.toLowerCase());
  if (j < 0) return t;
  return tpl`${text.slice(0,j)}<b>${text.slice(j, j+term.length)}</b>${text.slice(j+term.length)}`;
}

export function monthFilter(p){
  // 반환: 월 인덱스 배열
  if(p.relN){ var a=[]; for(var i=Math.max(0,STATE.base-p.relN+1); i<=STATE.base; i++) a.push(i); return a; }
  if(p.from!=null && p.to!=null){ var b=[]; for(var j=Math.max(0,p.from); j<=Math.min(ST.M-1,p.to); j++) b.push(j); return b.length?b:null; }
  var out=[];
  var years = p.years.length? p.years : null;
  for(j=0;j<ST.M;j++){
    var y=yOf(j), m=monOf(j);
    if(years && years.indexOf(y)<0) continue;
    if(p.months.length && p.months.indexOf(m)<0) continue;
    if(p.quarter && Math.ceil(m/3)!==p.quarter) continue;
    if(p.half && ((p.half===1&&m>6)||(p.half===2&&m<=6))) continue;
    out.push(j);
  }
  if(!years && !p.months.length && !p.quarter && !p.half) return null; // 기간 미지정
  return out;
}
export function rowFilter(p){
  return ST.DATA.rows.map(function(r,i){return i;}).filter(function(i){
    var r=ST.DATA.rows[i];
    if(p.lines.length && p.lines.indexOf(r.line)<0) return false;
    if(p.ind && r.ind!==p.ind) return false;
    if(p.ptns && p.ptns.length){ if(p.ptns.indexOf(r.ptn)<0) return false; }
    if(p.partners && p.partners.length){ if(p.partners.indexOf(r.partner)<0) return false; }
    else if(p.partner && r.partner!==p.partner) return false;
    if(p.custs && p.custs.length){ if(p.custs.indexOf(r.cust)<0) return false; }
    else if(p.cust && r.cust!==p.cust) return false;
    if(p.statuses && p.statuses.length && p.statuses.indexOf(statusOf(r))<0) return false;
    if(p.channels && p.channels.length && p.channels.indexOf(r.channel||'일반')<0) return false;
    return true;
  });
}
export function scopeText(p){
  var t=[];
  if(p.ptns && p.ptns.length) t.push('파트너 '+p.ptns.join('+'));
  if(p.years.length) t.push(p.years.join(', ')+'년');
  if(p.quarter) t.push(p.quarter+'분기');
  if(p.half) t.push(p.half===1?'상반기':'하반기');
  if(p.months.length) t.push(p.months.join(',')+'월');
  if(p.lines.length) t.push(p.lines.join('+'));
  if(p.ind) t.push(p.ind);
  if(p.channels && p.channels.length) t.push(p.channels.join('+'));
  if(p.relN) t.push('최근 '+p.relN+'개월');
  if(p.from!=null && p.to!=null) t.push(mk(Math.max(0,p.from))+'~'+mk(Math.min(ST.M-1,p.to)));
  if(p.partners && p.partners.length) t.push('파트너 '+p.partners.join('+'));
  else if(p.partner) t.push('파트너 '+p.partner);
  if(p.custs && p.custs.length) t.push(p.custs.join('+'));
  else if(p.cust) t.push(p.cust);
  if(p.statuses && p.statuses.length) t.push(p.statuses.join('/'));
  return t.length? t.join(' · ') : '전체 기간 · 전체 라인';
}

export function runQuery(q){
  var p = parseQ(q);
  if (p.avg && !p.years.length && p.from == null && !p.relN && !p.quarter && !p.half) p.relN = 12;
  var res = computeFromP(p);
  res.restate = p.restate;
  if (p.hits <= 1 && !p.followUp) res.suggestions = suggestFor(p);
  return res;
}

export function computeFromP(p){
  var q0 = String(p.raw||'').toLowerCase().replace(/\s+/g,'');
  if(RX.lgu.test(q0) && ST.DATA.lg && ST.DATA.lg.ok){
    var lg=ST.DATA.lg;
    return { title:'LG U+ 경유 판매 (LG 탭)', hero:lg.count.toLocaleString('ko-KR'), unit:'건',
      sub:'월액 합계 '+won(lg.feeSum)+'천원 · 매출은 각 서비스에 포함되어 있습니다',
      table:{cols:['고객사','제품','기간','월액'],
        rows:lg.rows.map(function(x){return [x.cust,x.prod,(x.start||'-')+'~'+(x.end||'무약정'),won(x.fee)+'천원'];})},
      note:'LG 탭 기준' };
  }
  if(RX.bizvs.test(q0) && ST.DATA.vs && ST.DATA.vs.ok){
    var vs=ST.DATA.vs;
    var diff=(vs.items.filter(function(x){return /차액/.test(x.k);})[0]||{}).v;
    return { title:'비즈포탈 차액 ('+(vs.month||'최근')+(vs.asOf? ' · 작성 '+vs.asOf:'')+')',
      hero: diff!=null? won(diff):'—', unit: diff!=null? '천원 차이':'',
      sub: vs.items.map(function(x){return x.k+' '+won(x.v)+'천원';}).join(' · '),
      table:{cols:['고객사','비즈포탈','매출시트','차이','사유'],
        rows:vs.details.map(function(x){return [x.cust,won(x.biz)+'천원',won(x.sheet)+'천원',won(x.diff)+'천원',x.note];})},
      note:'VS. 비즈포탈 탭 기준' };
  }

  var list=rowFilter(p);
  var mf=monthFilter(p);
  var scope=scopeText(p);

  /* --- 둘 이상 비교 --- */
  if(p.metric==='compare' && p.compareItems && p.compareItems.length>=2){
    var by=p.compareBy, items=p.compareItems.slice(0,5);
    var labels=[], series=[], totals=[];
    if(by==='year'){
      labels=['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
      items.forEach(function(y,i){
        var d=labels.map(function(_,mi){
          var j=ymIdx(y+'-'+(mi+1)); return (j!=null&&j>=0&&j<ST.M)? monthlyTotal(list,j):0; });
        series.push({label:y+'년', data:d, color:seriesColor(i+1)});
        totals.push({name:y+'년', v:d.reduce(function(a,b){return a+b;},0)});
      });
    } else if(by==='quarter'){
      var qy = p.years && p.years.length ? p.years[0] : yOf(STATE.base);
      labels=['1개월차','2개월차','3개월차'];
      items.forEach(function(q,i){
        var q0=+q;
        var d=[0,1,2].map(function(mi){
          var j=ymIdx(qy+'-'+((q0-1)*3+mi+1));
          return (j!=null&&j>=0&&j<ST.M)? monthlyTotal(list,j):0;
        });
        series.push({label:qy+'년 '+q0+'분기', data:d, color:seriesColor(i+1)});
        totals.push({name:qy+'년 '+q0+'분기', v:d.reduce(function(a,b){return a+b;},0)});
      });
    } else {
      var js=mf || (function(){var a=[];for(var j=Math.max(0,STATE.base-23);j<=STATE.base;j++)a.push(j);return a;})();
      labels=js.map(mkLabel);
      items.forEach(function(it,i){
        var sub=list.filter(function(k){
          var r=ST.DATA.rows[k];
          return by==='line'? r.line===it : by==='ptn'? r.ptn===it : by==='partner'? r.partner===it :
                 by==='cust'? r.cust===it : by==='ind'? r.ind===it : false;
        });
        var d=js.map(function(j){return monthlyTotal(sub,j);});
        series.push({label:it, data:d, color:seriesColor(i+1)});
        totals.push({name:it, v:d.reduce(function(a,b){return a+b;},0)});
      });
    }
    var sorted=totals.slice().sort(function(a,b){return b.v-a.v;});
    var gap = sorted.length>1 && sorted[1].v ? (sorted[0].v-sorted[1].v)/sorted[1].v*100 : 0;
    return {
      title: scope+' · '+(sorted.map(function(x){return x.name;}).join(' vs '))+' 비교',
      hero: sorted[0].name, unit:'',
      sub: sorted[0].name+' '+won(sorted[0].v)+'천원'+(sorted.length>1? ' · 2위 '+sorted[1].name+'보다 '+
           (gap>=0? gap.toFixed(1)+'% 많음':'') : ''),
      chart:{type:'line', labels:labels, series:series, money:true},
      table:{cols:['구분','합계','1위 대비'], rows:sorted.map(function(x){
        return [x.name, won(x.v)+'천원', sorted[0].v? (x.v/sorted[0].v*100).toFixed(1)+'%':'—']; })},
      note:'같은 기간·같은 기준으로 나란히 계산했습니다.'
    };
  }

  /* --- 개별 계약 순위 --- */
  if(p.metric==='contracts'){
    var n2=p.topN||10;
    var cs=list.slice().sort(function(a,b){ return (ST.DATA.rows[b].total||0)-(ST.DATA.rows[a].total||0); }).slice(0,n2);
    var sumT=cs.reduce(function(s,k){return s+(ST.DATA.rows[k].total||0);},0);
    return {
      title: scope+' · 계약 규모 상위 '+cs.length+'건',
      hero: won(sumT), unit:'천원',
      sub: '상위 '+cs.length+'건 총 계약액 합계',
      chart:{type:'bar', labels:cs.map(function(k){return ST.DATA.rows[k].cust;}),
             series:[{label:'총 계약액', data:cs.map(function(k){return ST.DATA.rows[k].total||0;}), color:cssv('--s1')}],
             money:true, horizontal:true},
      table:{cols:['고객사','라인','계약기간','개월','월 MRR(천원)','총 계약액(천원)'], rows:cs.map(function(k){
        var r=ST.DATA.rows[k];
        return [r.cust, r.line, (r.startIdx!=null?mk(r.startIdx):'-')+'~'+(r.endIdx!=null?mk(r.endIdx):'-'),
                (r.term||'-')+'', won(r.mrr)+'천원', won(r.total)+'천원'];})},
      note:'총 계약액(계약 전체 금액) 기준입니다.'
    };
  }

  /* --- 만료 예정 --- */
  if(p.metric==='expiring'){
    var h=p.horizon||6, b=STATE.base;
    var rows=list.filter(function(k){ var r=ST.DATA.rows[k];
      return !/해지/.test(statusOf(r)) && r.endIdx!=null && r.endIdx>=b && r.endIdx<=b+h-1; })
      .sort(function(a,b2){return ST.DATA.rows[a].endIdx-ST.DATA.rows[b2].endIdx;});
    var amt=rows.reduce(function(s,k){var r=ST.DATA.rows[k]; return s+(ST.MAT[k][Math.min(r.endIdx,ST.M-1)]||r.mrr||0);},0);
    var byM={}; rows.forEach(function(k){var r=ST.DATA.rows[k]; byM[mk(r.endIdx)]=(byM[mk(r.endIdx)]||0)+(ST.MAT[k][Math.min(r.endIdx,ST.M-1)]||r.mrr||0);});
    var lb=Object.keys(byM).sort();
    return {
      title: scope+' · 향후 '+h+'개월 내 만료 계약',
      hero: rows.length.toLocaleString('ko-KR'), unit:'건',
      sub: '해당 계약 MRR 합계 '+won(amt)+'천원',
      chart:{type:'bar', labels:lb, series:[{label:'만료 MRR', data:lb.map(function(x){return byM[x];}), color:cssv('--warning')}], money:true},
      table:{cols:['만료월','고객사','라인','파트너','월 MRR(천원)'],
        rows:rows.slice(0,120).map(function(k){var r=ST.DATA.rows[k];
          return [mk(r.endIdx), r.cust, r.line, r.partner, won(ST.MAT[k][Math.min(r.endIdx,ST.M-1)]||r.mrr||0)];})},
      note:'기준월 '+mk(b)+' · 상태가 「해지」인 계약은 제외했습니다.'
    };
  }

  /* --- 해지 / 신규 / 재약정 건수 --- */
  if(p.metric==='churn'||p.metric==='new'||p.metric==='renew'){
    var want = p.metric==='churn'? '해지' : p.metric==='new'? '신규' : '재약정';
    var sel = list.filter(function(k){
      var r=ST.DATA.rows[k];
      if(want==='해지') { if(!(/해지|중지/.test(r.status||'')||r.churn)) return false; }
      else if(want==='신규'){ var h0=(r.renewHist||[])[0], ct0=(h0 && h0.prev_ctype!=null)? h0.prev_ctype : (r.ctype||''); if(!/신규/.test(ct0+(r.status||''))) return false; }   /* ㊿+163 연장으로 «재약정»이 된 계약도 처음 «신규»였으면 신규 */
      else { if(!/재약정|갱신/.test((r.ctype||'')+(r.status||''))) return false; }
      if(mf){ // 기간: 해지=종료월, 신규/재약정=시작월
        var pivot = (want==='해지')? r._l : r._f;
        if(pivot==null||mf.indexOf(pivot)<0) return false;
      }
      return true;
    });
    var lostMrr = sel.reduce(function(s,k){ var r=ST.DATA.rows[k];
      return s + (want==='해지' ? (ST.MAT[k][Math.max(0,r._l)]||0) : (ST.MAT[k][Math.max(0,r._f)]||r.mrr||0)); },0);
    var gb = p.groupBy==='churn'? 'churn' : (p.groupBy||'partner');
    var grp = groupCount(sel, gb==='churn'? 'churn' : gb).slice(0, p.topN||8);
    var byMonth={};
    sel.forEach(function(k){ var r=ST.DATA.rows[k]; var pv=(want==='해지')?r._l:r._f; if(pv==null||pv<0)return;
      byMonth[mk(pv)]=(byMonth[mk(pv)]||0)+1; });
    var mlab=Object.keys(byMonth).sort();
    return {
      title: scope+' · '+want+' 계약',
      hero: sel.length.toLocaleString('ko-KR'), unit:'건',
      sub: (want==='해지'?'이탈 MRR ':'해당 MRR ')+won(lostMrr)+'천원 · 고객 '+
           Object.keys(sel.reduce(function(a,k){a[ST.DATA.rows[k].cust]=1;return a;},{})).length+'곳',
      chart:{type:'bar', labels:mlab, series:[{label:want+' 건수', data:mlab.map(function(x){return byMonth[x];}),
             color: want==='해지'? cssv('--critical'):cssv('--s1')}], money:false},
      table:{cols:[gbLabel(gb),'건수'], rows:grp.map(function(g){return [g.name, g.v+'건'];})},
      note: want==='해지'? '해지/중지 사유가 기록되었거나 상태가 해지인 계약 기준입니다.' : '계약 구분·상태 텍스트 기준입니다.'
    };
  }

  /* --- 성장률 --- */
  if(p.metric==='growth'){
    var ser=monthlySeries(list);
    var byY={}; for(var j2=0;j2<ST.M;j2++){ var yy=yOf(j2); byY[yy]=(byY[yy]||0)+ser[j2]; }
    var ys=Object.keys(byY).sort();
    var tgt = p.years.length? p.years[0] : yOf(STATE.base);
    var cur=byY[tgt]||0, prv=byY[tgt-1]||0;
    return {
      title: scope+' · 전년 대비 성장률',
      hero: prv? pct((cur-prv)/prv*100) : '—', unit:'',
      sub: tgt+'년 '+won(cur)+'천원  vs  '+(tgt-1)+'년 '+won(prv)+'천원',
      chart:{type:'bar', labels:ys, series:[{label:'연 매출', data:ys.map(function(y){return byY[y];}), color:cssv('--s1')}], money:true},
      table:{cols:['연도','매출','전년비'], rows:ys.map(function(y,i){
        var pp=i>0?byY[ys[i-1]]:0; return [y+'년', won(byY[y])+'천원', pp? pct((byY[y]-pp)/pp*100):'—']; })},
      note:'월별 인식 금액의 연 합계 기준입니다. 미래 연도는 계약에 따른 예정 금액입니다.'
    };
  }

  /* --- 고객 수 : LIVE 고객사 기준 (설정에 따라 계약 판정 또는 시트 명단) --- */
  var lvQ=liveData();
  if(p.metric==='count' && lvQ && lvQ.ok && !mf && !(p.partners&&p.partners.length) && !(p.custs&&p.custs.length)){
    var lv=lvQ;
    var lvSel=lv.rows.filter(function(x){   /* LIVE 행 (위의 sel 은 계약 인덱스라 이름을 나눔) */
      if(p.lines&&p.lines.length && p.lines.indexOf(x.line)<0) return false;
      if(p.ind && x.ind!==p.ind) return false;
      return true;
    });
    var uq={},uqND={},gInd={},gLine={},nodes=0;
    lvSel.forEach(function(x){ uq[x.cust]=1; if(!x.dup) uqND[x.cust]=1;
      gInd[x.ind]=(gInd[x.ind]||0)+1; gLine[x.line]=(gLine[x.line]||0)+1; nodes+=x.nodes||0; });
    var useInd = (p.groupBy==='ind') || (!!(p.lines&&p.lines.length) && p.groupBy!=='line');
    var g0 = useInd? gInd : gLine;
    var arr0=Object.keys(g0).map(function(k0){return [k0,g0[k0]];}).sort(function(a,b){return b[1]-a[1];});
    var sc0=[]; if(p.lines&&p.lines.length) sc0.push(p.lines.join('+')); if(p.ind) sc0.push(p.ind);
    return {
      title:(sc0.length? sc0.join(' · ')+' · ':'')+'LIVE 고객사 · '+liveSrcLabel(),
      hero: Object.keys(uq).length.toLocaleString('ko-KR'), unit:'곳',
      sub: '서비스 기준 '+lvSel.length.toLocaleString('ko-KR')+'건 (한 고객사가 여러 서비스를 쓰면 서비스마다 1건)'+
           (Object.keys(uqND).length!==Object.keys(uq).length? ' · 중복표시 제외 '+Object.keys(uqND).length+'곳':'')+
           (nodes? ' · 노드 '+nodes.toLocaleString('ko-KR')+'개':''),
      chart:{type:'bar', labels:arr0.map(function(x){return lline(x[0]);}),
             series:[{label:useInd?'산업군':'제품군', data:arr0.map(function(x){return x[1];}), color:cssv('--s1')}], money:false},
      table:{cols:[useInd?'산업군':'제품군','건수','비중'],
             rows:arr0.map(function(x){return [lline(x[0]), x[1]+'건', (x[1]/lvSel.length*100).toFixed(1)+'%'];})},
      note:(lv.src==='db'? '계약 데이터로 자동 판정한 LIVE 고객사입니다 (회사×제품 단위 · 기준 '+mk(lv.T)+').' : 'LIVE 고객사 탭을 그대로 셉니다 (사이트 단위).')+' 기간이나 파트너를 지정하면 월별 금액 기준으로 계산합니다.'
    };
  }

  /* --- 고객 수 (기간·파트너 지정 시) --- */
  if(p.metric==='count'){
    var jj = mf? mf[mf.length-1] : STATE.base;
    var cnt = activeCustomers(list, jj);
    var names={}; list.forEach(function(k){ if(ST.MAT[k][jj]>0) names[ST.DATA.rows[k].cust]=(names[ST.DATA.rows[k].cust]||0)+ST.MAT[k][jj]; });
    var top=Object.keys(names).map(function(n){return {name:n,v:names[n]};}).sort(function(a,b){return b.v-a.v;}).slice(0,p.topN||15);
    var trend=[],tl=[];
    for(var j3=Math.max(0,jj-23);j3<=jj;j3++){ trend.push(activeCustomers(list,j3)); tl.push(mkLabel(j3)); }
    return {
      title: scope+' · '+mk(jj)+' 기준 활성 고객사',
      hero: cnt.toLocaleString('ko-KR'), unit:'곳',
      sub: '해당 월 MRR '+won(monthlyTotal(list,jj))+'천원',
      chart:{type:'line', labels:tl, series:[{label:'활성 고객사', data:trend, color:cssv('--s1')}], money:false},
      table:{cols:['고객사','월 MRR'], rows:top.map(function(t){return [t.name, won(t.v)+'천원'];})},
      note:'해당 월에 금액이 인식된 고객사를 셉니다.'
    };
  }

  /* --- 순위 / 비중 / 그룹 집계 --- */
  if(p.topN || p.metric==='share' || (p.groupBy && p.groupBy!=='month' && p.groupBy!=='year' && p.groupBy!=='quarter')){
    var gb2 = p.groupBy || (p.cust? 'line' : 'cust');
    if(gb2==='churn'){
      var cl=list.filter(function(k){return ST.DATA.rows[k].churn;});
      var g2=groupCount(cl,'churn').slice(0,p.topN||10);
      return { title:scope+' · 해지 사유 분포', hero:cl.length.toLocaleString('ko-KR'), unit:'건',
        sub:'사유 '+g2.length+'종', chart:{type:'bar',labels:g2.map(function(x){return x.name;}),
          series:[{label:'건수',data:g2.map(function(x){return x.v;}),color:cssv('--critical')}],money:false,horizontal:true},
        table:{cols:['사유','건수'],rows:g2.map(function(x){return [x.name,x.v+'건'];})}, note:'' };
    }
    var jsel = mf, agg={};
    var fld2 = gb2==='partner'? 'ptn' : gb2==='biller'? 'partner' : gb2;   // channel 은 r.channel 사용
    list.forEach(function(k){
      var r=ST.DATA.rows[k], g=r[fld2]||(fld2==='channel'?'일반':'미지정'), a=ST.MAT[k], s=0;
      if(jsel){ jsel.forEach(function(j){ s+=a[j]; }); } else { s+=a[STATE.base]; }
      if(s) agg[g]=(agg[g]||0)+s;
    });
    var arr=Object.keys(agg).map(function(k2){return {name:k2,v:agg[k2]};}).sort(function(a,b){return b.v-a.v;});
    var total=arr.reduce(function(s,x){return s+x.v;},0);
    var top2=p.bottom? arr.slice().reverse().slice(0,p.topN||10) : arr.slice(0,p.topN||10);
    var fo = p.focus ? arr.filter(function(x){ return x.name===p.focus; })[0] : null;
    return {
      title: scope+' · '+gbLabel(gb2)+(jsel?' 기간 합계':' '+mk(STATE.base)+' MRR')+(p.metric==='share'?' 비중':(p.bottom?' 하위':' 순위')),
      hero: fo && total ? (fo.v/total*100).toFixed(1)+'%' : won(total),
      unit: fo && total ? '' : '천원',
      sub: fo ? (p.focus+' '+won(fo.v)+'천원 / 전체 '+won(total)+'천원')
              : (gbLabel(gb2)+' '+arr.length+'개 · 상위 '+top2.length+'개 비중 '+(total? (top2.reduce(function(s,x){return s+x.v;},0)/total*100).toFixed(1):0)+'%'),
      chart:{type:'bar', labels:top2.map(function(x){return x.name;}),
             series:[{label:gbLabel(gb2), data:top2.map(function(x){return x.v;}), color:cssv('--s1')}], money:true, horizontal:true},
      table:{cols:[gbLabel(gb2),'금액','비중'], rows:top2.map(function(x){return [x.name, won(x.v)+'천원', (x.v/total*100).toFixed(1)+'%'];})},
      note: jsel? '지정한 기간의 월별 인식 금액을 합산했습니다.' : '기간을 지정하지 않아 기준월('+mk(STATE.base)+') MRR로 계산했습니다.'
    };
  }

  /* --- 분기별 --- */
  if(p.groupBy==='quarter'){
    var qys = p.years.length? p.years.slice().sort() : [yOf(STATE.base)];
    var qlabels=[], qdata=[], qrows=[];
    qys.forEach(function(y){
      for(var q=1;q<=4;q++){
        var s=0, sPrev=0;
        for(var mi=1;mi<=3;mi++){
          var j=ymIdx(y+'-'+((q-1)*3+mi));
          if(j!=null&&j>=0&&j<ST.M) s+=monthlyTotal(list,j);
          var jp=ymIdx((y-1)+'-'+((q-1)*3+mi));
          if(jp!=null&&jp>=0&&jp<ST.M) sPrev+=monthlyTotal(list,jp);
        }
        qlabels.push((qys.length>1? String(y).slice(2)+"' ":'')+q+'분기');
        qdata.push(s);
        qrows.push([(qys.length>1? y+'년 ':'')+q+'분기', won(s)+'천원',
          sPrev? ((s-sPrev)/sPrev*100>=0?'+':'')+((s-sPrev)/sPrev*100).toFixed(1)+'%' : '—']);
      }
    });
    var qsum=qdata.reduce(function(a,b){return a+b;},0);
    return { title:scope+' · 분기별 매출', hero:won(qsum), unit:'천원',
      sub:(qys.length>1? qys[0]+'~'+qys[qys.length-1]+'년':qys[0]+'년')+' 분기 합계 · 전년 동분기 대비 포함',
      chart:{type:'bar', labels:qlabels, series:[{label:'분기 매출', data:qdata, color:cssv('--s1')}], money:true},
      table:{cols:['분기','매출','전년 동분기'], rows:qrows},
      note:'미래 분기는 계약상 예정 금액 기준입니다.' };
  }

  /* --- 추이 --- */
  /* --- 전망(추세 기반 ARR 예측) --- */
  if(p.metric==='forecast'){
    var hz = p.horizon || 60;                       // 개월 (기본 5년)
    b  = STATE.base;
    cur = monthlyTotal(list, b);                 // 기준월 MRR
    if(!cur) return { title:scope+' · 전망', hero:'—', unit:'',
      sub:'기준월 매출이 0원이라 추세를 계산할 수 없습니다', note:'' };

    // 최근 12개월 실적으로 월 성장률(CAGR) 산출
    var win = Math.min(12, b);
    var past = monthlyTotal(list, b-win);
    var g = (past>0 && win>0)? Math.pow(cur/past, 1/win)-1 : 0;
    var gYr = Math.pow(1+g,12)-1;

    // 계약상 확정된 미래 금액(이미 DB에 있는 예정 금액)
    var contractedIdx = Math.min(ST.M-1, b+hz);
    var contracted = monthlyTotal(list, contractedIdx);

    var labs=[], data=[], proj=[];
    for(var j6=Math.max(0,b-23); j6<=b; j6++){ labs.push(mkLabel(j6)); data.push(monthlyTotal(list,j6)); proj.push(null); }
    var step = hz>36? 6 : 3;                          // 표시 간격
    var projRows=[];   /* 전망 표 (앞 분기의 rows 는 계약 인덱스라 이름을 나눔) */
    for(var m2=step; m2<=hz; m2+=step){
      var v = cur*Math.pow(1+g, m2);
      labs.push(mk(b+m2).slice(2)); data.push(null); proj.push(v);
      projRows.push([mk(b+m2), won(Math.round(v))+'천원', won(Math.round(v*12))+'천원']);
    }
    var endMrr = cur*Math.pow(1+g, hz);
    var yrs = (hz/12);
    return {
      title: scope+' · '+(yrs>=1? (Math.round(yrs*10)/10)+'년 뒤':hz+'개월 뒤')+' 전망 (최근 '+win+'개월 추세 기준)',
      hero: won(Math.round(endMrr*12)), unit:'천원 (ARR)',
      sub: '기준월 MRR '+won(cur)+'천원 · 현재 ARR '+won(cur*12)+'천원 → '+mk(b+hz)+' 예상 MRR '+won(Math.round(endMrr))+'천원'+
           ' · 최근 월 성장률 '+(g*100).toFixed(2)+'% (연 '+(gYr*100).toFixed(1)+'%)',
      chart:{type:'line', labels:labs, money:true, series:[
        {label:'실적', data:data, color:cssv('--s1')},
        {label:'전망', data:proj, color:cssv('--s4')}
      ]},
      table:{cols:['시점','예상 MRR','예상 ARR'], rows:projRows},
      note:'※ 최근 '+win+'개월 성장률이 그대로 이어진다고 가정한 단순 추정입니다. 신규 수주·해지·가격 변동은 반영되지 않습니다.'+
           (contracted? ' 참고로 '+mk(contractedIdx)+' 시점에 계약상 확정된 금액은 '+won(contracted)+'천원입니다.' : '')
    };
  }

  if(p.metric==='trend' || p.groupBy==='month' || p.groupBy==='year'){
    if(p.groupBy==='year'){
      var ser2=monthlySeries(list), byY2={};
      for(var j4=0;j4<ST.M;j4++){ byY2[yOf(j4)]=(byY2[yOf(j4)]||0)+ser2[j4]; }
      var ys2=Object.keys(byY2).sort();
      return { title:scope+' · 연도별 매출', hero:won(ys2.reduce(function(s,y){return s+byY2[y];},0)), unit:'천원',
        sub:ys2[0]+' ~ '+ys2[ys2.length-1],
        chart:{type:'bar',labels:ys2,series:[{label:'연 매출',data:ys2.map(function(y){return byY2[y];}),color:cssv('--s1')}],money:true},
        table:{cols:['연도','매출'],rows:ys2.map(function(y){return [y+'년',won(byY2[y])+'천원'];})}, note:'' };
    }
    js = mf || (function(){ var a=[]; for(var j=Math.max(0,STATE.base-23);j<=STATE.base;j++) a.push(j); return a; })();
    var lab=js.map(mkLabel), dat=js.map(function(j){return monthlyTotal(list,j);});
    var sum=dat.reduce(function(a,b){return a+b;},0);
    return { title:scope+(p.avg?' · 월평균 매출':' · 월별 추이'), hero:won(p.avg? sum/js.length : sum), unit:'천원',
      sub:mk(js[0])+' ~ '+mk(js[js.length-1])+(p.avg? ' · 합계 '+won(sum)+'천원' : ' 합계 · 월평균 '+won(sum/js.length)+'천원'),
      chart:{type:'line',labels:lab,series:[{label:'월 매출',data:dat,color:cssv('--s1')}],money:true},
      table:{cols:['월','금액'],rows:js.map(function(j,i){return [mk(j),won(dat[i])+'천원'];}).reverse()}, note:'' };
  }

  /* --- 기본: 합계 --- */
  var js2 = mf, sum2=0, lab2=[], dat2=[];
  if(js2){ js2.forEach(function(j){ var v=monthlyTotal(list,j); sum2+=v; lab2.push(mkLabel(j)); dat2.push(v); }); }
  else { sum2=monthlyTotal(list,STATE.base); for(var j5=Math.max(0,STATE.base-23);j5<=STATE.base;j5++){ lab2.push(mkLabel(j5)); dat2.push(monthlyTotal(list,j5)); } }
  var byLine2={}; list.forEach(function(k){ var r=ST.DATA.rows[k],a=ST.MAT[k],s=0;
    if(js2) js2.forEach(function(j){s+=a[j];}); else s=a[STATE.base];
    if(s) byLine2[r.line]=(byLine2[r.line]||0)+s; });
  var lrows=Object.keys(byLine2).map(function(k2){return [k2, won(byLine2[k2])+'천원', (byLine2[k2]/sum2*100).toFixed(1)+'%'];});
  return {
    title: scope + (p.avg && js2? ' · 월평균 매출' : (js2? ' · 기간 합계 매출' : ' · '+mk(STATE.base)+' MRR')),
    hero: won(p.avg && js2? sum2/js2.length : sum2), unit:'천원',
    sub: js2? (mk(js2[0])+' ~ '+mk(js2[js2.length-1])+' · '+js2.length+'개월 · 월평균 '+won(sum2/js2.length)+'천원')
            : ('기준월 MRR · 연환산 '+won(sum2*12)+'천원'),
    chart:{type:'line', labels:lab2, series:[{label:'월 매출', data:dat2, color:cssv('--s1')}], money:true},
    table:{cols:['서비스','금액','비중'], rows:lrows},
    note: js2? '' : '기간을 지정하지 않아 기준월 기준으로 답했습니다. "2025년" 처럼 연도를 넣으면 합계로 계산합니다.'
  };
}
export function gbLabel(k){ return {partner:'파트너',biller:'계산서 발행처',ind:'산업군',line:'서비스',cust:'고객사',churn:'해지 사유',month:'월',year:'연도',channel:'사업 영역',status:'계약 상태'}[k]||k; }

export function showAnswer(q,res){
  revealAnswer();
  var ph=document.getElementById('ansPin');
  if(!ph){
    ph=document.createElement('button'); ph.id='ansPin'; ph.className='pill';
    ph.textContent='📌 위젯으로 고정'; ph.style.cssText='margin-top:10px';
    var hd0=document.querySelector('#answer .ans-head'); if(hd0) hd0.appendChild(ph);
  }
  ph.onclick=function(){ pinQuery(q); };
  var rs=$('#ansRestate');
  if(res.restate){ rs.className='restate on'; rs.innerHTML=tpl`이렇게 이해했어요 — <b>${res.restate}</b>`; }
  else rs.className='restate';
  $('#aiComment').className='ai-comment';
  var sg=$('#ansSuggest'); sg.innerHTML='';
  if(res.suggestions && res.suggestions.length){
    $('#ansSuggestTitle').style.display='block';
    res.suggestions.slice(0,4).forEach(function(s){
      var c=el('button','chip',s); c.onclick=function(){ ask(s); }; sg.appendChild(c);
    });
  } else $('#ansSuggestTitle').style.display='none';
  renderAnswerBody(res, q);
}

/* 답변의 숫자·그래프·표 부분 (대화 답변 아래에 붙습니다) */
export function renderAnswerBody(res, q){
  $('#ansTitle').textContent=shortQ(res.title||'');
  $('#ansHero').innerHTML=esc(res.hero)+(res.unit?tpl`<span class="u">${rawHtml(res.unit)}</span>`:'');
  $('#ansSub').textContent=res.sub||'';
  $('#ansNote').textContent=res.note||'';

  var lg=$('#ansLegend'); lg.innerHTML='';
  var host=document.getElementById('ansChart');
  host.innerHTML='';
  if(res.chart && res.chart.labels && res.chart.labels.length){
    var c=res.chart;
    var fmt = c.money? won : function(v){ return Math.round(v)+'건'; };
    if(c.series.length>1){
      c.series.forEach(function(sr){ var li=el('span','li'); var sw=el('span','sw'); sw.style.background=sr.color;
        li.appendChild(sw); li.appendChild(el('span',null,sr.label)); lg.appendChild(li); });
    }
    if(c.horizontal){
      // 순위형은 HTML 수평 막대로 (라벨이 길어도 잘리지 않음)
      var tot=c.series[0].data.reduce(function(a,b){return a+b;},0);
      host.innerHTML='<div id="ansBars" style="padding:4px 0;overflow:auto;max-height:236px"></div>';
      hbars('#ansBars', c.labels.map(function(nm,i){
        return {name:nm, v:c.series[0].data[i], c:c.series[0].color};
      }), tot, !c.money);
    } else if(c.type==='line'){
      Viz.lines(host,{labels:c.labels,series:c.series,fmt:fmt,tipFmt:c.money?wonFull:fmt,fill:c.series.length===1});
    } else {
      Viz.bars(host,{labels:c.labels,series:c.series,fmt:fmt,tipFmt:c.money?wonFull:fmt});
    }
  } else {
    host.innerHTML='<p class="cap" style="padding-top:28px">그래프로 보여줄 데이터가 없습니다.</p>';
  }
  // 차트도 표도 없으면 빈 카드 두 개를 띄우지 않고 접습니다
  var hasChart = !!(res.chart && res.chart.labels && res.chart.labels.length);
  var hasTable = !!(res.table && res.table.rows && res.table.rows.length);
  var gridEl = document.getElementById('ansGrid');
  if(gridEl) gridEl.style.display = (hasChart||hasTable)? '' : 'none';
  var t=$('#ansTable');
  if(res.table && res.table.rows.length){
    $('#ansTableCap').textContent='상세 ('+res.table.rows.length+'행)';
    t.innerHTML=tpl`<thead><tr>${rawHtml(res.table.cols.map(function(c2,i){return tpl`<th${rawHtml(i?' class="n"':'')}>${c2}</th>`;}).join(''))}</tr></thead>`+
      tpl`<tbody>${rawHtml(res.table.rows.map(function(r){return tpl`<tr>${rawHtml(r.map(function(v,i){return tpl`<td${rawHtml(i?' class="n"':'')}>${v}</td>`;}).join(''))}</tr>`;}).join(''))}</tbody>`;
  } else { $('#ansTableCap').textContent='상세'; t.innerHTML='<tbody><tr><td class="mini">표시할 상세 데이터가 없습니다.</td></tr></tbody>'; }
}