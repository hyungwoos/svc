/* ===== dash.js — 필터/집계 · 컨트롤 · 대시보드 렌더 · 위젯 · 월별 종합 장표 · 설치비 · KPI · 차트 =====
   ES 모듈(㊿+153) — 다른 파일의 이름은 아래 import 로만 씀 · 이 파일의 최상위 var/function 은 전부 export · 즉시 실행 문장은 js/init.js 의 start() 에 */
import { APP_VER, ST } from './state.js';
import { Viz } from './viz.js';
import { $, $$, kwToWon, wonToKw, baseLabel, baseRange, buildBaseSelect, cssv, el, esc, isCC, isGN, lline, mk, mkLabel, monOf, pct, rawHtml, seriesColor, STATE, tpl, won,
  wonFull, wrapNavIcons, yOf } from './core.js';
import { boot, CACHE_KEY, ccAfterKpis, ccAnaCount, ccAnalysisOpen, ccHomeLayout, loadFromDb, onData, renderInbox, SB_RAW, sbWrite, toast } from './shell.js';
import { abortAsk, ask, closeAnswer, isAsking, loadAiConfig, runQuery, shortQ } from './ai.js';
import { GRIDS } from './grids.js';
import { CH_DEFS, chOf, liveData, liveDeltaHtml, openRenewList, renderChannelView } from './analysis.js';
import { renderTodo } from './tools.js';
import { renderCloud } from './cloud.js';
import { closeMxPop, mxKey, MXM, mxPlace, openMxMemo, renderInbStat } from './inbound.js';
import { KX_H6, kxBase, renderChurn, renderChurnRate, renderCustFlow } from './sales.js';
import { a11yTileRole, DV, renderGrid, switchView, xlsxAoa } from './grid.js';
import { closeOvl, logChange, openOvl } from './edit.js';
import { lazyGet } from './lazy.js';


/* ==================================================================
   2. 필터 / 집계
   ================================================================== */
export function passes(r){
  if(!STATE.lines[r.line]) return false;
  if(STATE.ind && r.ind!==STATE.ind) return false;
  if(STATE.partner){
    if(STATE.partner.charAt(0)==='@'){ if(r.partner!==STATE.partner.slice(1)) return false; }
    else if(r.ptn!==STATE.partner) return false;
  }
  if(STATE.status && statusOf(r)!==STATE.status) return false;
  if(STATE.search){
    var q=STATE.search.toLowerCase();
    if((r.cust+' '+r.csm+' '+r.partner).toLowerCase().indexOf(q)<0) return false;
  }
  return true;
}
export function statusOf(r){
  var s=r.status||'';
  if(/해지|중지/.test(s)) return '해지';
  if(/서비스\s*종료/.test(s)) return '서비스 종료';
  if(/재약정|갱신/.test(s)) return '재약정';
  if(/신규/.test(s)) return '신규';
  return s||'기타';
}
export function idxs(){ var a=[]; for(var i=0;i<ST.DATA.rows.length;i++) if(passes(ST.DATA.rows[i])) a.push(i); return a; }

export function monthlyTotal(list, j){ var s=0; for(var k=0;k<list.length;k++) s+=ST.MAT[list[k]][j]; return s; }
export function monthlySeries(list){ var a=new Array(ST.M); for(var j=0;j<ST.M;j++) a[j]=monthlyTotal(list,j); return a; }
export function monthlyByLine(list){
  var out={};
  ST.DATA.lines.forEach(function(l){ out[l.label]=new Array(ST.M).fill(0); });
  list.forEach(function(k){ var r=ST.DATA.rows[k],a=ST.MAT[k],o=out[r.line]; if(!o)return;
    for(var j=0;j<ST.M;j++) o[j]+=a[j]; });
  return out;
}
export function groupSum(list, key, j){
  var m={};
  list.forEach(function(k){ var r=ST.DATA.rows[k]; var g=(typeof key==='function')?key(r):r[key]; if(!g)g='미지정';
    m[g]=(m[g]||0)+ST.MAT[k][j]; });
  return Object.keys(m).map(function(k){return {name:k,v:m[k]};}).filter(function(x){return x.v!==0;})
    .sort(function(a,b){return b.v-a.v;});
}
export function groupCount(list, key){
  var m={};
  list.forEach(function(k){ var r=ST.DATA.rows[k]; var g=(typeof key==='function')?key(r):r[key]; if(!g)return;
    m[g]=(m[g]||0)+1; });
  return Object.keys(m).map(function(k){return {name:k,v:m[k]};}).sort(function(a,b){return b.v-a.v;});
}
export function activeCustomers(list, j){
  var s={}; list.forEach(function(k){ if(ST.MAT[k][j]>0) s[ST.DATA.rows[k].cust]=1; }); return Object.keys(s).length;
}
export function rangeSum(list, from, to){
  var s=0; for(var j=Math.max(0,from); j<=Math.min(ST.M-1,to); j++) s+=monthlyTotal(list,j); return s;
}

/* ==================================================================
   3. 컨트롤 구성
   ================================================================== */
/* ㊿+147: 색 바탕 위 글자색 — 흰색과 검정 중 대비가 큰 쪽(밝은 노랑·주황·청록 칩에 흰 글자는 2~3:1) */
export function inkOn(bg){
  try{ var c=String(bg||'').trim(), m;
    if((m=/^#([0-9a-f]{6})$/i.exec(c))) c=m[1]; else if((m=/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(c))) c=[m[1],m[2],m[3]].map(function(x){ return ('0'+(+x).toString(16)).slice(-2); }).join(''); else return '#fff';
    var L=[0,2,4].map(function(i){ var v=parseInt(c.substr(i,2),16)/255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4); });
    var l=0.2126*L[0]+0.7152*L[1]+0.0722*L[2];
    return (1.05/(l+0.05) >= (l+0.05)/0.05)? '#fff' : '#111'; }catch(e){ return '#fff'; }
}
var CTRL_RZ=false;   // 창 크기 바뀌면 다시 그리기 — 한 번만 연결
export function buildControls(){
  // 사업라인 칩
  var box=$('#lineChips'); box.innerHTML='';
  ST.DATA.lines.forEach(function(l){
    var b=el('button','pill',lline(l.label));
    b.setAttribute('aria-pressed','true');
    b.style.borderColor=seriesColor(l.color);
    b.style.setProperty('--c', seriesColor(l.color));   // 심플 디자인: 색 점으로 표시
    b.onclick=function(){
      STATE.lines[l.label]=!STATE.lines[l.label];
      b.setAttribute('aria-pressed',STATE.lines[l.label]?'true':'false');
      if(STATE.lines[l.label]){ b.style.background=seriesColor(l.color); b.style.color=inkOn(seriesColor(l.color)); }
      else { b.style.background='transparent'; b.style.color=cssv('--muted'); }
      renderAll();
    };
    b.style.background=seriesColor(l.color); b.style.color=inkOn(seriesColor(l.color));
    box.appendChild(b);
  });

  // 기준 (월/분기/연)
  buildBaseSelect();
  $('#fBase').onchange=function(){ STATE.base=+this.value; renderAll(); };
  $('#fUnit').value=STATE.unit;
  $('#fUnit').onchange=function(){ STATE.unit=this.value; buildBaseSelect(); renderAll(); };

  fillSelect('#fInd', uniq(function(r){return r.ind;}));
  (function(){
    var sel=$('#fPartner'); sel.innerHTML='<option value="">전체</option>';
    var og1=document.createElement('optgroup'); og1.label='실제 파트너';
    ['다원티에스','글로웰시스템','에티버스','직접(계산서)'].forEach(function(n){
      var o=document.createElement('option'); o.value=n; o.textContent=n; og1.appendChild(o);
    });
    sel.appendChild(og1);
    var og2=document.createElement('optgroup'); og2.label='계산서 발행처';
    uniq(function(r){return r.partner;}).forEach(function(n){
      var o=document.createElement('option'); o.value='@'+n; o.textContent=n; og2.appendChild(o);
    });
    sel.appendChild(og2);
  })();
  fillSelect('#fStatus', uniq(statusOf));

  $('#fInd').onchange=function(){ STATE.ind=this.value; renderAll(); };
  $('#fPartner').onchange=function(){ STATE.partner=this.value; renderAll(); };
  $('#fStatus').onchange=function(){ STATE.status=this.value; renderAll(); };
  var t;
  $('#fSearch').oninput=function(){ var v=this.value; clearTimeout(t); t=setTimeout(function(){ STATE.search=v; renderAll(); },200); };
  $('#btnReset').onclick=function(){
    STATE.ind=STATE.partner=STATE.status=STATE.search='';
    STATE.unit='month';
    $('#fInd').value=$('#fPartner').value=$('#fStatus').value=''; $('#fSearch').value='';
    ST.DATA.lines.forEach(function(l){ STATE.lines[l.label]=true; });
    buildControls(); renderAll();
  };

  $('#segTrend').onclick=function(e){ if(e.target.tagName!=='BUTTON')return;
    $$('#segTrend button').forEach(function(b){b.setAttribute('aria-pressed','false');});
    e.target.setAttribute('aria-pressed','true'); STATE.trendR=+e.target.dataset.r; renderTrend(); };
  $('#segExp').onclick=function(e){ if(e.target.tagName!=='BUTTON')return; setExpN(+e.target.dataset.m); };
  STATE.expM=expN(); $$('#segExp button').forEach(function(b){ b.setAttribute('aria-pressed', +b.dataset.m===STATE.expM? 'true':'false'); });

  $$('[data-tv]').forEach(function(b){
    b.setAttribute('aria-pressed','false');
    b.onclick=function(){
      var card=b.closest('.card');
      var box=card.querySelector('.chartbox');
      var tv=card.querySelector('.tbl-wrap');
      var legend=card.querySelector('.legend');
      var showTable=tv.classList.contains('hidden');
      tv.classList.toggle('hidden',!showTable);
      if(box) box.classList.toggle('hidden',showTable);
      if(legend) legend.classList.toggle('hidden',showTable);
      b.setAttribute('aria-pressed',showTable?'true':'false');
      b.textContent = showTable? '차트' : '표';
    };
  });

  try{ wrapNavIcons(); ccHomeLayout(); }catch(e){}
  $('#btnTheme').onclick=function(){
    var l = document.documentElement.getAttribute('data-theme')==='light';
    document.documentElement.setAttribute('data-theme', l?'dark':'light');
    this.textContent = l? '◐ 라이트' : '◐ 다크';
    try{ localStorage.setItem('svc_theme', l?'dark':'light'); }catch(e){}
    renderAll();
  };
  // 저장된 테마 복원 (기본: 라이트)
  try{
    var th=localStorage.getItem('svc_theme');
    if(th==='dark'){
      document.documentElement.setAttribute('data-theme','dark');
      $('#btnTheme').textContent='◐ 라이트';
    }
  }catch(e){}
  $('#btnReload').onclick=function(){
    closeAnswer();                       // 새로 읽은 데이터와 어긋나지 않게 이전 답변은 닫습니다
    $('#app').classList.add('hidden'); $('#loading').classList.remove('hidden');
    $('#loading').innerHTML='<div class="spin"></div><div>다시 읽고 있습니다…</div>';
    boot(true);   // 캐시 무시하고 DB에서 새로 읽기
  };

  /* ===== 자동 갱신 =====
     · 다른 탭 갔다 돌아오면: 마지막 로딩이 5분 넘었을 때만 조용히 다시 읽음
     · 화면을 계속 켜두면: 15분마다 조용히 다시 읽음
     · 데이터가 실제로 바뀐 경우에만 다시 그리고, 그때도 필터·정렬·페이지는 유지
     · 갱신 도중 다른 화면으로 이동했으면 절대 되돌리지 않음                    */
  ST.LAST_LOAD=Date.now();
  var REFRESHING=false;
  function silentRefresh(reason){
    if(REFRESHING || !ST.SB_TOKEN || !ST.DATA) return;
    if(document.getElementById('ovlEdit').classList.contains('on')) return;   // 입력 중엔 건드리지 않음
    if(document.getElementById('ovlAuth').classList.contains('on')) return;
    REFRESHING=true;
    var keep=ST.CUR_VIEW;
    var prevSnap=''; try{ prevSnap=sessionStorage.getItem(CACHE_KEY)||''; }catch(e){}
    loadFromDb().then(function(nd){
      ST.LAST_LOAD=Date.now();
      // 데이터가 그대로면 화면을 건드리지 않음 (의미 없는 다시 그리기 방지)
      var same=false;
      try{
        var a=JSON.parse(prevSnap||'{}').res, b=JSON.parse(sessionStorage.getItem(CACHE_KEY)||'{}').res;
        same = !!a && !!b && JSON.stringify(a)===JSON.stringify(b);
      }catch(e){}
      if(same){ REFRESHING=false; return; }
      closeAnswer('데이터가 갱신되어 이전 답변은 닫았습니다 — 다시 물어봐 주세요');
      if(ST.IS_EQUIP){ if(GRIDS[keep]) renderGrid(); }
      else{
        onData(nd);
        if(keep && keep===ST.CUR_VIEW && keep!=='dash' && keep!=='weekly'){
          // switchView 는 필터를 초기화하므로 쓰지 않고, 화면 종류별로 데이터만 다시 그림
          if(GRIDS[keep]) renderGrid();                       // 필터·정렬·페이지 유지
          else if(CH_DEFS[keep]) try{ renderChannelView(keep); }catch(e){}
          else if(keep==='inbstat') try{ renderInbStat(); }catch(e){}
          else if(keep==='report'){ var RPm=lazyGet('report'); if(RPm && !RPm.RP._touched) try{ RPm.renderReport(); }catch(e){} }   // 수정 중이면 덮어쓰지 않음
          else if(keep==='churn') try{ renderChurn(); }catch(e){}
          else if(keep==='churnrate') try{ renderChurnRate(); }catch(e){}
          else if(keep==='custflow') try{ renderCustFlow(); }catch(e){}
          else if(keep==='cloud') try{ renderCloud(); }catch(e){}
          // price 등 자체 데이터 화면은 건드리지 않음
        }
      }
      REFRESHING=false;
    }).catch(function(){ REFRESHING=false; });
  }
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='visible' && Date.now()-ST.LAST_LOAD>5*60*1000) silentRefresh('focus');
  });
  setInterval(function(){
    if(document.visibilityState==='visible' && Date.now()-ST.LAST_LOAD>15*60*1000) silentRefresh('timer');
  }, 60*1000);

  $('#btnAsk').onclick=function(){ if(isAsking()){ abortAsk(); return; } ask($('#q').value); };
  var ax=document.getElementById('ansClose'); if(ax) ax.onclick=function(){ closeAnswer('', true); };   /* ㊿+159 AI 답변 ✕ 닫기 */
  $('#q').addEventListener('keydown',function(e){   // Enter 로 질문 (자동완성 끄면서 빠졌던 기능 복원)
    if(e.key==='Enter' && !e.isComposing){ e.preventDefault(); ask(this.value); }
  });
  // setupSuggest();   // 질문창 자동완성 드롭다운 — 사용자 요청으로 끔 (아래 칩 예시는 유지)

  var samples=['이번 달 매출','이번 분기 실적','올해 매출 어때?','분기별 비교','연도별 매출',
    '작년이랑 비교','파트너별 실적','live 고객사 수','곧 재약정 챙겨야 할 데 있어?',
    '왜 이렇게 많이 해지했지?','제일 큰 고객 누구야?','제일 큰 계약 5개'];
  var cb=$('#chips'); cb.innerHTML='';
  samples.forEach(function(s){ var c=el('button','chip',s); c.onclick=function(){ $('#q').value=s; ask(s); }; cb.appendChild(c); });
  if(isCC()){ var mb=el('button','chip chip-more', cb.classList.contains('all')? '접기 ▴':'예시 더 보기 ▾'); mb.type='button';
    mb.onclick=function(){ var all=cb.classList.toggle('all'); mb.textContent= all? '접기 ▴':'예시 더 보기 ▾'; }; cb.appendChild(mb); }

  if(!CTRL_RZ){ CTRL_RZ=true; onResize(function(){ if(ST.DATA) renderAll(); }); }
  loadAiConfig();

  (function(){ var nP=ST.DATA.rows.filter(function(r){return !r.parent;}).length, nC=ST.DATA.rows.length-nP;
    $('#periodLabel').textContent = ST.DATA.monthKeys[0]+' ~ '+ST.DATA.monthKeys[ST.M-1]+' · 계약 '+nP.toLocaleString('ko-KR')+'건'+(nC? ' (+부속 '+nC+')':''); })();
  $('#loadedAt').textContent = '읽은 시각 '+ST.DATA.generatedAt;
  $('#foot').innerHTML = tpl`원본: Supabase DB · <b>금액 단위: 천원</b> (입력도 천원 · 가격표·견적 단가만 원) · 모든 수정은 변경 이력에 기록됩니다 · 포탈 버전 ${rawHtml(APP_VER)}`+ tpl`${rawHtml(ST.DATA.warnings&&ST.DATA.warnings.length? tpl`<br>⚠️ ${rawHtml(ST.DATA.warnings.join(' / '))}` : '')}`;
}
export function uniq(f){
  var s={}; ST.DATA.rows.forEach(function(r){ var v=f(r); if(v) s[v]=1; });
  return Object.keys(s).sort(function(a,b){return a.localeCompare(b,'ko');});
}
export function fillSelect(sel, arr){
  var e=$(sel); var cur=e.value;
  e.innerHTML='<option value="">전체</option>';
  arr.forEach(function(v){ var o=el('option',null,v); o.value=v; e.appendChild(o); });
  e.value=cur;
}

/* ==================================================================
   4. 렌더
   ================================================================== */
export function renderAll(){
  var list=idxs();
  $('#filterCount').textContent = list.length.toLocaleString('ko-KR')+'건 선택됨';
  renderKpis(list);
  renderGoal(list);
  renderTrend(list);
  renderYear(list);
  renderBars(list);
  renderNcWidget(list);
  renderExpiring(list);
  renderLg();
  renderVs();
  renderMatrix(list);
  try{ renderInstall(); }catch(e){}
  renderAllTable(list);
  renderHero(list);
  renderQWidgets();
  applyWidgetOrder();
  initWidgetDnD();
  applyWidgets();
}

/* ---- 대시보드 인사 + 알림 배너 ---- */
export function renderHero(list){
  var el0=$('#dashHero'); if(!el0) return;
  var b=STATE.base;
  // 할 일 알림 배너 (클릭 → 해당 화면)
  var pend=(ST.RAWX.orders||[]).filter(function(o){ return ['접수','출하요청','배송중','회수예정'].indexOf(o.status)>=0; }).length;
  var expCnt=0, expAmt=0;
  list.forEach(function(k){
    var e=ST.DATA.rows[k].endIdx;
    if(e!=null && e>=b && e<=b+expN()-1 && !/해지|종료|CN전환/.test(String(ST.DATA.rows[k].status||''))){ expCnt++; expAmt+=ST.MAT[k][Math.min(e,ST.M-1)]||ST.DATA.rows[k].mrr||0; }
  });
  var curYm=monOf(b)+'월';
  var bizDone=(ST.RAWX.biz||[]).some(function(r){ return r.ym===curYm; });
  var items=[];
  if(pend) items.push({t:'warn', ic:'📦', msg:tpl`처리 대기 장비 요청이 <b>${rawHtml(pend)}건</b> 있습니다.`, go:function(){ switchView('orders'); }});
  if(expCnt) items.push({t:'info', ic:'⏳', msg:tpl`${rawHtml(expN())}개월 내 만료 계약이 <b>${rawHtml(expCnt)}건</b> (${won(expAmt)}천원) 있습니다 — 재약정 타깃.`, go:function(){ goWidget('exp','계약 만료 예정'); }});
  if(!bizDone) items.push({t:'warn', ic:'⚖️', msg:'이번 달('+curYm+') 비즈포탈 차액이 아직 입력되지 않았습니다.', go:function(){ switchView('biz'); }});
  var st=$('#noticeStack'); st.innerHTML='';
  if(!items.length){
    var ok=document.createElement('div'); ok.className='nb nb-ok';
    ok.innerHTML='<span class="ni">✓</span><span>처리할 알림이 없습니다. 모든 항목이 정리되어 있어요.</span>';
    st.appendChild(ok);
  }else{
    items.forEach(function(it){
      var d=document.createElement('div'); d.className='nb nb-'+it.t;
      d.innerHTML=tpl`<span class="ni">${rawHtml(it.ic)}</span><span style="flex:1">${rawHtml(it.msg)}</span><span class="na">확인 →</span>`;
      d.onclick=it.go;
      st.appendChild(d);
    });
  }
  try{ renderInbox(); }catch(e){}
}

/* ---- 커스텀 질문 위젯 (검색 결과 고정) ---- */
export function qwKey(){ return 'svc_qw_'+(ST.AUTH_USER||'anon'); }
export function qwList(){ try{ return JSON.parse(localStorage.getItem(qwKey())||'[]')||[]; }catch(e){ return []; } }
export function qwSave(l){ try{ localStorage.setItem(qwKey(), JSON.stringify(l)); }catch(e){} }
export function pinQuery(q){
  q=String(q||'').trim();
  if(!q) return;
  if(q.length>200) q=q.slice(0,200);      // 지나치게 긴 질문은 잘라서 고정
  var l=qwList();
  if(l.some(function(w){return w.q===q;})){ toast('이미 고정된 질문입니다', q, 'info'); return; }
  l.push({id:'q'+Date.now().toString(36), q:q});
  qwSave(l);
  renderQWidgets(); applyWidgetOrder(); initWidgetDnD();
  toast('대시보드 위젯으로 고정했습니다', q);
}
export function removeQWidget(id){
  qwSave(qwList().filter(function(w){ return w.id!==id; }));
  var el0=document.querySelector('[data-w="'+id+'"]'); if(el0) el0.remove();
  toast('위젯을 제거했습니다','','info');
}
export function renderQWidgets(){
  var grid=document.querySelector('#viewDash .grid'); if(!grid) return;
  document.querySelectorAll('#viewDash [data-w^="q"]').forEach(function(e){ if(/^q[0-9a-z]+$/.test(e.dataset.w)) e.remove(); });
  qwList().forEach(function(w){
    var res=null; try{ res=runQuery(w.q); }catch(e){}
    var sec=document.createElement('section');
    sec.className='card c6'; sec.dataset.w=w.id;
    sec.innerHTML=tpl`<div class="qw-head"><div class="t">`+
      tpl`<h2 style="font-size:13.5px">📌 ${shortQ((res&&res.title)||w.q)}</h2>`+
      tpl`<p class="cap" style="margin:2px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${w.q}">${shortQ(w.q)}</p></div>`+
      tpl`<button class="qw-btn" data-a="rf" title="새로고침">↻</button>`+
      tpl`<button class="qw-btn" data-a="rm" title="위젯 제거">✕</button></div>`+ tpl`${rawHtml((res&&res.hero)? tpl`<div class="qw-hero">${res.hero}<small> ${res.unit||''}</small></div>`:'')}`+ tpl`${rawHtml((res&&res.sub)? tpl`<p class="cap" style="margin:-4px 0 8px">${res.sub}</p>`:'')}`+
      tpl`<div id="qwc_${rawHtml(w.id)}" style="min-height:60px"></div>`;
    grid.appendChild(sec);
    var host=document.getElementById('qwc_'+w.id);
    if(res && res.chart && res.chart.labels && res.chart.labels.length){
      var c=res.chart, fmt=c.money? won : function(v){ return Math.round(v)+'건'; };
      try{
        if(c.horizontal){
          host.innerHTML=tpl`<div id="qwb_${rawHtml(w.id)}" style="overflow:auto;max-height:220px"></div>`;
          var tot=c.series[0].data.reduce(function(a,b2){ return a+b2; },0);
          hbars('#qwb_'+w.id, c.labels.map(function(nm,i){ return {name:nm, v:c.series[0].data[i], c:c.series[0].color}; }), tot, !c.money);
        }else{
          host.style.height='190px';
          if(c.type==='line') Viz.lines(host,{labels:c.labels,series:c.series,fmt:fmt,tipFmt:c.money?wonFull:fmt,fill:c.series.length===1});
          else Viz.bars(host,{labels:c.labels,series:c.series,fmt:fmt,tipFmt:c.money?wonFull:fmt});
        }
      }catch(e){ host.innerHTML='<p class="cap">차트를 그리지 못했습니다</p>'; }
    } else if(res && res.table && res.table.rows.length){
      host.innerHTML=tpl`<div class="tbl-wrap" tabindex="0" style="max-height:220px"><table><thead><tr>`+
        tpl`${rawHtml(res.table.cols.map(function(c2,i){ return tpl`<th${rawHtml(i?' class="n"':'')}>${c2}</th>`; }).join(''))}</tr></thead><tbody>`+
        tpl`${rawHtml(res.table.rows.slice(0,8).map(function(r){ return tpl`<tr>${rawHtml(r.map(function(v,i){ return tpl`<td${rawHtml(i?' class="n"':'')}>${v}</td>`; }).join(''))}</tr>`; }).join(''))}`+
        tpl`</tbody></table></div>${rawHtml(res.table.rows.length>8? '<p class="mini" style="margin-top:6px">상위 8행 표시 · 전체는 질문창에서</p>':'')}`;
    } else if(!res || !res.hero){
      host.innerHTML='<p class="cap" style="padding-top:14px">표시할 데이터가 없습니다</p>';
    }
    sec.querySelector('[data-a="rm"]').onclick=function(){ removeQWidget(w.id); };
    sec.querySelector('[data-a="rf"]').onclick=function(){ renderQWidgets(); applyWidgetOrder(); initWidgetDnD(); toast('위젯을 갱신했습니다','','info'); };
  });
}

/* ---- 위젯 드래그 배치 ---- */
export var DRAG_W=null;
export function initWidgetDnD(){
  var grid=document.querySelector('#viewDash .grid'); if(!grid) return;
  document.querySelectorAll('#viewDash .grid > [data-w]').forEach(function(sec){
    if(sec.querySelector('.whandle')) return;
    var head=sec.querySelector('.card-head')||sec.querySelector('.qw-head')||sec.querySelector('h2');
    if(!head) return;
    var hd=document.createElement('span');
    hd.className='whandle'; hd.textContent='⠿'; hd.title='드래그하여 위치 이동'; hd.draggable=true;
    hd.addEventListener('dragstart',function(e){
      DRAG_W=sec; sec.classList.add('dragging');
      e.dataTransfer.effectAllowed='move';
      try{ e.dataTransfer.setData('text','w'); }catch(_){}
    });
    hd.addEventListener('dragend',function(){
      sec.classList.remove('dragging'); DRAG_W=null; saveWidgetOrder();
    });
    head.appendChild(hd);
  });
  if(!grid.__dnd){
    grid.__dnd=1;
    grid.addEventListener('dragover',function(/** @type {MouseEvent} */ e){
      if(!DRAG_W) return;
      e.preventDefault();
      var tgt=e.target.closest? e.target.closest('[data-w]'):null;
      if(!tgt || tgt===DRAG_W || tgt.parentElement!==grid) return;
      var r=tgt.getBoundingClientRect();
      var before=(e.clientY < r.top + r.height/2);
      grid.insertBefore(DRAG_W, before? tgt : tgt.nextSibling);
    });
    grid.addEventListener('drop',function(e){ e.preventDefault(); });
  }
}
export function saveWidgetOrder(){
  var grid=document.querySelector('#viewDash .grid'); if(!grid) return;
  var keys=[].map.call(grid.querySelectorAll(':scope > [data-w]'),function(s){ return s.dataset.w; });
  var o=widgetPrefs(); o.__order=keys;
  try{ localStorage.setItem(widgetKey(), JSON.stringify(o)); }catch(e){}
  toast('위젯 배치를 저장했습니다','','info');
}
/* sticky 상단바의 실제 높이를 --tbh 에 기록 — 카드 스크롤 여백 계산에 씁니다.
   상단바는 좁은 화면에서 두 줄로 접히므로 값이 고정이 아닙니다. */
export var _tbRaf=0;
export function measureTopbar(now){
  /* offsetHeight 읽기는 문서 전체 배치를 강제로 계산시킵니다(큰 화면에서 수백 ms).
     그래서 그리는 도중에는 바로 재지 않고 다음 프레임으로 미룹니다. */
  function run(){
    try{
      var tb=document.querySelector('.topbar');
      if(tb && tb.offsetHeight) document.documentElement.style.setProperty('--tbh', tb.offsetHeight+'px');
    }catch(e){}
    _tbRaf=0;
  }
  if(now===true) return run();
  if(_tbRaf) return;
  _tbRaf=requestAnimationFrame(run);
}
/* 위젯 하나로 이동 — 꺼져 있으면 켜고, 상단바에 가리지 않게 스크롤한 뒤 잠깐 강조 */
export function goWidget(k, label){
  if(ST.CUR_VIEW!=='dash'){ switchView('dash'); }
  try{ if(isCC()) ccAnalysisOpen(true, true); }catch(e){}
  var el0=widgetEl(k);
  if(!el0){ toast('이동할 위젯을 찾지 못했습니다', label||k, 'info'); return; }
  if(el0.classList.contains('w-off')){
    var o=widgetPrefs(); o[k]=true;
    try{ localStorage.setItem(widgetKey(), JSON.stringify(o)); }catch(e){}
    applyWidgets();
    toast('«'+(label||k)+'» 위젯을 다시 켰습니다','숨겨져 있어서 켜고 이동합니다','info');
  }
  measureTopbar();
  requestAnimationFrame(function(){
    el0.scrollIntoView({behavior:'smooth',block:'start'});
    el0.classList.remove('card-flash');
    void el0.offsetWidth;                 // 애니메이션 재시작
    el0.classList.add('card-flash');
    setTimeout(function(){ el0.classList.remove('card-flash'); }, 1700);
  });
}
export function applyWidgetOrder(){
  var o=widgetPrefs(); if(!o.__order) return;
  var grid=document.querySelector('#viewDash .grid'); if(!grid) return;
  o.__order.forEach(function(k){
    if(!/^[\w-]+$/.test(k)) return;
    var el0=grid.querySelector('[data-w="'+k+'"]');
    if(el0 && el0.parentElement===grid) grid.appendChild(el0);
  });
}

/* ---- 대시보드 위젯 커스터마이징 (사용자별, 이 브라우저에 저장) ---- */
export var WIDGET_DEFS=[
  ['hero','히어로 요약'],
  ['kpi','KPI 카드'], ['goal','연간 목표 진행'], ['mx','월별 종합 장표'],
  ['trend','MRR 추이'], ['year','연도별 매출'], ['line','서비스별 MRR'],
  ['ifee','설치비 현황'],
  ['ptn','파트너 실적'], ['ind','산업군'], ['nc','신규·해지 고객수 추이'],
  ['churn','해지·중지 사유'], ['exp','계약 만료 예정'],
  ['vs','비즈포탈 차액'], ['all','계약 목록']
];
// 기본으로 꺼둘 위젯 (설정에서 켜면 켜집니다)
export var WIDGET_OFF_DEFAULT={vs:1};
export function widgetKey(){ return 'svc_widgets_'+(ST.AUTH_USER||'anon'); }
export function widgetPrefs(){
  try{ return JSON.parse(localStorage.getItem(widgetKey())||'{}')||{}; }catch(e){ return {}; }
}
export function widgetEl(k){
  if(k==='kpi') return $('#kpis');
  if(k==='goal') return $('#goalBar');
  if(k==='hero') return $('#dashHero');
  return document.querySelector('[data-w="'+k+'"]');
}
export function widgetOn(k, off){
  // 저장된 설정이 있으면 그걸 따르고, 없으면 기본값(WIDGET_OFF_DEFAULT) 적용
  if(off && Object.prototype.hasOwnProperty.call(off,k)) return off[k]!==false;
  return !WIDGET_OFF_DEFAULT[k];
}
export function applyWidgets(){
  var off=widgetPrefs();
  WIDGET_DEFS.forEach(function(d){
    var el=widgetEl(d[0]); if(!el) return;
    el.classList.toggle('w-off', !widgetOn(d[0], off));
  });
  var lg=document.querySelector('[data-w="lg"]');   // LG 판매 위젯은 대시보드에서 제외
  if(lg) lg.style.display='none';
  measureTopbar();
  try{ ccAnaCount(); }catch(e){}
}
export function toggleWidgetPanel(){
  var p=document.getElementById('widgetPanel');
  if(p){ p.remove(); return; }
  var off=widgetPrefs();
  p=document.createElement('div'); p.id='widgetPanel';
  p.style.cssText='position:fixed;top:56px;right:18px;z-index:1300;width:238px;background:var(--surface);'+
    'border:1px solid var(--ring);border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.16);padding:14px 16px';
  var h='<div style="font-size:12.5px;font-weight:700;margin-bottom:10px">⊞ 대시보드 위젯</div>';
  WIDGET_DEFS.forEach(function(d){
    h+=tpl`<label style="display:flex;gap:8px;align-items:center;padding:4px 0;font-size:12.5px;cursor:pointer">`+
       tpl`<input type="checkbox" data-wk="${rawHtml(d[0])}" ${widgetOn(d[0],off)?'checked':''} style="width:15px;height:15px"> ${d[1]}</label>`;
  });
  var qws=qwList();
  if(qws.length){
    h+='<div style="font-size:11px;color:var(--muted);letter-spacing:.08em;margin:10px 0 4px">고정한 질문</div>';
    qws.forEach(function(w){
      h+=tpl`<div style="display:flex;gap:6px;align-items:center;padding:3px 0;font-size:12px">`+
         tpl`<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📌 ${w.q}</span>`+
         tpl`<button class="qw-btn" data-qrm="${rawHtml(w.id)}" style="width:22px;height:22px">✕</button></div>`;
    });
  }
  if(qws.length){
    h+=tpl`<button class="pill ghost" id="wpQClear" style="width:100%;justify-content:center;margin-top:6px;`+
       tpl`border-color:var(--critical,#d03b3b);color:var(--critical,#d03b3b)">고정 질문 모두 지우기</button>`;
  }
  h+='<button class="pill ghost" id="wpForget" style="width:100%;justify-content:center;margin-top:6px">🧠 AI 대화 기억 지우기</button>';
  h+=tpl`<div style="display:flex;gap:8px;margin-top:10px"><button class="pill ghost" id="wpAll" style="flex:1;justify-content:center">모두 표시</button>`+
     tpl`<button class="pill" id="wpClose" style="flex:1;justify-content:center">닫기</button></div>`+
     tpl`<div class="mini" style="margin-top:8px;color:var(--muted)">내 계정·이 브라우저에만 적용됩니다</div>`;
  p.innerHTML=h;
  document.body.appendChild(p);
  p.querySelectorAll('input[data-wk]').forEach(function(cb){
    cb.onchange=function(){
      var o=widgetPrefs(); o[this.dataset.wk]=this.checked? true:false;
      try{ localStorage.setItem(widgetKey(), JSON.stringify(o)); }catch(e){}
      applyWidgets();
    };
  });
  var wf=p.querySelector('#wpForget');
  if(wf) wf.onclick=function(){
    if(!ST.SB_TOKEN){ openOvl('ovlAuth'); return; }
    if(!confirm('AI가 기억하고 있는 내 대화 이력을 모두 지울까요?\n(내 계정 것만 지워집니다)')) return;
    sbWrite('POST','rpc/ai_forget',{}).then(function(n){
      ST.HIST=[]; ST.HIST_LOADED=true;
      toast('AI 기억 삭제', (n||0)+'건의 대화를 지웠습니다','info');
    }).catch(function(e){ toast('삭제 실패', String(e.message||e).slice(0,80),'info'); });
  };
  p.querySelector('#wpAll').onclick=function(){
    try{ localStorage.removeItem(widgetKey()); }catch(e){}
    p.querySelectorAll('input[data-wk]').forEach(function(cb){ cb.checked=true; });
    applyWidgets();
  };
  p.querySelector('#wpClose').onclick=function(){ p.remove(); };
  var qc=p.querySelector('#wpQClear');
  if(qc) qc.onclick=function(){
    if(!confirm('대시보드에 고정한 질문을 모두 지울까요?')) return;
    qwSave([]);
    document.querySelectorAll('#viewDash [data-w^="q"]').forEach(function(e){ if(/^q[0-9a-z]+$/.test(e.dataset.w)) e.remove(); });
    p.remove(); toast('고정 질문을 모두 지웠습니다','','info');
  };
  p.querySelectorAll('[data-qrm]').forEach(function(b){
    b.onclick=function(){ removeQWidget(this.dataset.qrm); this.parentElement.remove(); };
  });
}

/* ㊿+146: 버튼 줄이 화면보다 길어 옆으로 밀리는 경우(폰) 고른 버튼이 보이게 — 연도 탭은 최근 연도가 오른쪽 끝이라 그냥 두면 안 보임 */
export function segScrollSel(seg){
  try{ if(!seg || seg.scrollWidth<=seg.clientWidth+1) return; var b=seg.querySelector('[aria-pressed="true"]'); if(!b) return;
    var l=b.offsetLeft, r=l+b.offsetWidth; if(l>=seg.scrollLeft && r<=seg.scrollLeft+seg.clientWidth) return;
    seg.scrollLeft=Math.max(0, r-seg.clientWidth+8); }catch(e){}
}
/* ---- 월별 종합 장표 (시트 첫 장표 스타일) ---- */
export var MX_YEAR=null;
export var MX_LIST=null;   // 장표를 그릴 때 쓴 계약 목록(필터 반영) — 셀 «내역 보기»가 같은 기준으로 계산합니다
export function renderMatrix(list){
  list=list||idxs();
  MX_LIST=list;
  var years={};
  for(var i=0;i<ST.M;i++) years[yOf(i)]=1;
  var ys=Object.keys(years).map(Number).sort();
  if(MX_YEAR==null) MX_YEAR=yOf(STATE.base);

  // 연도 선택 버튼
  var seg=$('#segMxYear');
  if(seg && !seg._built){
    seg._built=1;
    ys.forEach(function(y){
      var b=document.createElement('button');
      b.textContent=String(y); b.dataset.y=String(y);
      b.onclick=function(){ MX_YEAR=+this.dataset.y; renderMatrix(); };
      seg.appendChild(b);
    });
  }
  if(seg) seg.querySelectorAll('button').forEach(function(b){
    b.setAttribute('aria-pressed', +b.dataset.y===MX_YEAR?'true':'false');
  });
  segScrollSel(seg);

  var Y=MX_YEAR;
  $('#capMx').textContent = Y+'년 · 월별 인식 금액 · 미래 월은 계약상 예정';

  // 라인×월 집계
  var lines=ST.DATA.lines.map(function(l){return l.label;}).filter(function(lb){return STATE.lines[lb];});
  function cell(lb,y,m){
    var idx=(y-2020)*12+(m-6);
    if(idx<0||idx>=ST.M) return 0;
    var s=0;
    list.forEach(function(k){ if(!lb || ST.DATA.rows[k].line===lb) s+=ST.MAT[k][idx]; });
    return s;
  }
  function num(v){ return v? Math.round(v/1000).toLocaleString('ko-KR') : '·'; }   // 천원 단위

  var t=$('#tMx'); t.innerHTML='';
  var thead=document.createElement('thead');
  var h='<tr><th>구분</th>';
  for(var m=1;m<=12;m++) h+=tpl`<th class="n">${rawHtml(m)}월</th>`;
  h+='<th class="n" style="border-left:1px solid var(--ring)">연 합계</th><th class="n">전년비</th></tr>';
  thead.innerHTML=h;
  t.appendChild(thead);

  var tb=document.createElement('tbody');
  var nowI=STATE.base;
  function rowHtml(label, lb, strong){
    var sum=0, prev=0, tds='';
    for(var m=1;m<=12;m++){
      var v=cell(lb,Y,m); sum+=v;
      var idx=(Y-2020)*12+(m-6);
      var fut=idx>nowI;
      /* 셀 메모(특이사항) — 있으면 우상단에 삼각 표시, 마우스 올리면 내용 미리보기 */
      var mk=MXM[mxKey(lb,Y,m)];
      var tip=mk? ' title="'+esc(String(mk.body).slice(0,400))+'\n\n(클릭: 내역 보기 · 메모 수정)"' : ' title="클릭: 이 달 계약 내역 보기 · 특이사항 메모"';
      tds+=tpl`<td class="n mxc${mk?' mxm':''}"${rawHtml(fut?' style="color:var(--muted)"':'')}`+
        tpl` data-mxl="${lb||''}" data-mxm="${rawHtml(m)}"${rawHtml(tip)}>${rawHtml(num(v))}</td>`;
    }
    for(var m2=1;m2<=12;m2++) prev+=cell(lb,Y-1,m2);
    var yoy=prev? ((sum-prev)/prev*100) : null;
    var yoyTxt=yoy==null? '—' : (yoy>=0?'+':'')+yoy.toFixed(1)+'%';
    var yoyCls=yoy==null? '' : (yoy>=0?'up':'down');
    var tr=document.createElement('tr');
    if(strong) tr.style.cssText='font-weight:700;border-top:2px solid var(--axis);background:var(--surface-2)';
    tr.innerHTML=tpl`<td>${label}</td>${rawHtml(tds)}`+
      tpl`<td class="n" style="border-left:1px solid var(--ring);font-weight:650">${rawHtml(num(sum))}</td>`+
      tpl`<td class="n ${rawHtml(yoyCls)}">${rawHtml(yoyTxt)}</td>`;
    tb.appendChild(tr);
  }
  lines.forEach(function(lb){ rowHtml(lline(lb), lb, false); });
  rowHtml('합계', null, true);
  t.appendChild(tb);

  // 셀 클릭 → 특이사항 메모
  t.querySelectorAll('td.mxc').forEach(function(td){
    td.onclick=function(){
      var lb=td.dataset.mxl||'', m=+td.dataset.mxm;
      var lab=lb? lline(lb):'합계';
      openMxMemo(td, lb, Y, m, lab);
    };
  });
  // 단위 안내
  var cap=$('#capMx');
  var nMemo=Object.keys(MXM).filter(function(k){ return k.split('|')[1]===String(Y); }).length;
  cap.textContent = Y+'년 · 단위: 천원 · 미래 월은 계약상 예정 금액 (회색) · 셀을 클릭하면 계약 내역 조회 · 특이사항 메모'+
    (nMemo? ' (올해 '+nMemo+'건 작성됨 — 표시된 셀에 마우스를 올려보세요)':'');
}

/* ---- 설치비 현황 (매출시트 «통계» 탭의 «에스원_설치/설거비» 줄) ----
   시트 수식:  그 달 = SUMIFS(S1!설치비, S1!대금정산일, "YYYY년 M월") + 손으로 더한 값
   · 앞부분은 계약의 설치비·대금정산일로 계산합니다
   · 계약에 없는 설치비·철거비는 install_extra 표에 «고객사 · 구분 · 금액» 줄 단위로 담습니다 (70단계 — 예전 install_adj 수동 조정은 여기로 옮겨졌습니다) */
export var IFEE_MODE='y';
/* 계약에 없는 설치비·철거비(추가 항목) — 고객사별 줄 단위로 install_extra 에 담깁니다 */
export function ifeeExtras(Y,M){
  return ((ST.RAWX&&ST.RAWX.iextra)||[]).filter(function(x){ return (Y==null||+x.year===+Y) && (M==null||+x.month===+M); });
}
export function ifeeAdj(){
  var m={};
  ifeeExtras().forEach(function(x){ m[x.year+'|'+x.month]=(m[x.year+'|'+x.month]||0)+Number(x.amount||0); });
  return m;
}
export var IFEE_KINDS=['설치비','철거비','추가설치','기타'];
/* 계약 → 설치비를 인식하는 연·월. 대금정산일이 있으면 그 달, 없으면 시작월 다음 달(시트 관행) */
export function ifeeYm(r){
  if(r.settle){
    var y=+String(r.settle).slice(0,4), m=+String(r.settle).slice(5,7);
    if(y&&m) return [y,m,false];
  }
  /* 대금정산일이 없을 때만 시작월+1 로 추정 — 단, 아직 시작하지 않은 계약(인식 금액이 한 달도 없음)이나
     시작월이 데이터 범위 밖(예: 이관 때 임시로 들어간 2020-05)이면 «정산일 미정»으로 두고 달에 배치하지 않습니다 */
  if(r.startIdx==null || r.startIdx<0) return null;
  if(r.dataFirst==null && ST.DATA && r.startIdx<=ST.DATA.nowIdx) return null;   // 시작했어야 하는데 인식 금액이 한 달도 없음 = 아직 시작 전
  var t=(2020*12+5)+r.startIdx+1;
  return [Math.floor(t/12), (t%12)+1, true];
}
export var IFEE_LINE='설치비';   // mx_memos 의 line 값 — 서비스 코드와 겹치지 않는 이름
export function openIfeeDetail(td, Y, M, det, adj){
  var rows=det.filter(function(d){ return d.y===Y && d.m===M; }).sort(function(a,b){ return b.fee-a.fee; });
  var ex=ifeeExtras(Y,M).slice();
  var a=ex.reduce(function(x,e){ return x+Number(e.amount||0); },0);
  var sum=rows.reduce(function(x,d){ return x+d.fee; },0)+a;
  var ed=ifeeCanEdit();
  /* 금액은 «천원 단위»로 입력합니다 (㊿+157 — 표와 같은 단위 · 저장은 원) */
  function amtIn(v, key){
    return tpl`<input class="ifin" data-f="${rawHtml(key)}" type="number" step="any" value="${v===''||v==null?'':wonToKw(v)}" placeholder="천원" `+
           tpl`style="width:104px;text-align:right;font-size:12px;padding:3px 5px;border:1px solid var(--ring);border-radius:6px;background:var(--surface)">`;
  }
  var h=tpl`<div class="mxdet"><table><thead><tr><th style="min-width:150px">고객사</th><th>구분·서비스</th><th>근거</th><th class="n">설치비(천원)</th>${rawHtml(ed?'<th></th>':'')}</tr></thead><tbody>`;
  rows.forEach(function(d,i){
    h+=tpl`<tr data-i="${rawHtml(i)}" data-cid="${rawHtml(d.id||'')}"><td><b>${d.cust}</b>`+
       tpl` <button class="ifgo" data-i="${rawHtml(i)}" title="계약 화면에서 보기" style="border:none;background:none;cursor:pointer;color:var(--mut)">↗</button></td>`+
       tpl`<td>${lline(d.line)}</td>`+
       tpl`<td style="color:var(--mut)">${d.guess? '시작월+1 (대금정산일 없음)':'계약 · 대금정산일'}</td>`+
       tpl`<td class="n">${rawHtml(ed? amtIn(d.fee,'c'+(d.id||'')) : won(d.fee))}</td>${rawHtml(ed?'<td></td>':'')}</tr>`;
  });
  /* 추가 항목 — 계약에 없는 설치·철거 비용을 고객사별로 */
  h+=tpl`<tr class="ifhead"><td colspan="${ed?5:4}" style="background:var(--surface-2);color:var(--mut);font-size:12px;padding:5px 6px">`+
     tpl`추가 항목 — 계약에 없는 설치비·철거비 (고객사를 고르거나 직접 입력)</td></tr>`;
  function exRow(e,i){
    var cust=e? e.customer:'', kind=e? e.kind:'설치비', amt=e? e.amount:'', note=e? (e.note||''):'';
    if(!ed) return tpl`<tr><td><b>${cust}</b></td><td>${kind}</td><td style="color:var(--mut)">${note||'추가 항목'}</td><td class="n">${won(amt)}</td></tr>`;
    return tpl`<tr class="ifex" data-x="${rawHtml(i)}" data-id="${rawHtml(e&&e.id?e.id:'')}">`+
      tpl`<td><input class="ifin" data-f="x${rawHtml(i)}_cust" list="dlIfeeCust" type="text" value="${cust}" placeholder="고객사"`+
        tpl` style="width:100%;min-width:130px;font-size:12px;padding:3px 5px;border:1px solid var(--ring);border-radius:6px;background:var(--surface)"></td>`+
      tpl`<td><select class="ifin" aria-label="항목 종류" data-f="x${rawHtml(i)}_kind" style="font-size:12px;padding:3px 4px;border:1px solid var(--ring);border-radius:6px;background:var(--surface)">`+
        tpl`${rawHtml(IFEE_KINDS.map(function(k){ return tpl`<option${k===kind?' selected':''}>${rawHtml(k)}</option>`; }).join(''))}</select></td>`+
      tpl`<td><input class="ifin" data-f="x${rawHtml(i)}_note" type="text" value="${note}" placeholder="비고(선택)"`+
        tpl` style="width:100%;min-width:110px;font-size:12px;padding:3px 5px;border:1px solid var(--ring);border-radius:6px;background:var(--surface)"></td>`+
      tpl`<td class="n">${rawHtml(amtIn(amt,'x'+i+'_amt'))}</td>`+
      tpl`<td><button class="ifdel" data-x="${rawHtml(i)}" title="이 줄 지우기" style="border:none;background:none;cursor:pointer;color:var(--critical,#d03b3b);font-size:13.5px">✕</button></td></tr>`;
  }
  ex.forEach(function(e,i){ h+=exRow(e,i); });
  if(ed) h+='<tr id="ifAddRow"><td colspan="5" style="padding:4px 6px"><button class="pill ghost" id="ifAdd" style="font-size:12px;padding:4px 10px">＋ 설치·철거비 추가</button></td></tr>';
  if(!rows.length && !ex.length && !ed) h+='<tr><td colspan="4" style="text-align:center;color:var(--muted)">이 달 설치비 내역이 없습니다</td></tr>';
  h+=tpl`</tbody><tfoot><tr><td colspan="${ed?3:2}">계약 ${rows.length}건${rawHtml(ex.length? ' + 추가 '+ex.length+'건':'')}</td>`+
     tpl`<td class="n" id="ifSum">${won(sum)}천원</td>${rawHtml(ed?'<td></td>':'')}</tr></tfoot></table></div>`+
     tpl`<datalist id="dlIfeeCust"></datalist>`+ tpl`${rawHtml(ed? tpl`<div class="act" style="margin-top:6px"><span class="msg" id="ifMsg" style="font-size:12px"></span><span class="sp"></span>`+
          tpl`<button class="pill pri" id="ifSave">저장</button></div>`+
          tpl`<div class="who" style="margin-top:4px">금액은 <b>천원 단위</b>로 입력합니다 (100만원 → 1000) · 환급·차감이면 음수 · 고객사 옆 ↗ 를 누르면 그 계약으로 이동</div>`
        : '<div class="who" style="margin-top:6px">줄을 누르면 그 고객사의 계약 화면으로 이동 · 금액 수정은 편집 권한이 있는 계정만</div>')}`;
  openMxMemo(td, IFEE_LINE, Y, M, '설치비', null, {detail:{html:h, count:rows.length+ex.length, sum:sum,
    go:function(i){ var d=rows[i]; if(!d) return; switchView('contracts'); var sInp=$('#dvSearch'); if(sInp){ sInp.value=d.cust; DV.page=0; renderGrid(); } },
    ready:function(box){ ifeeWire(box, Y, M, rows, ex, td); }}});
}
/* 설치비 금액을 고칠 수 있는 계정인지 — install_extra 쓰기 정책과 같은 기준 */
export function ifeeCanEdit(){ return !!ST.SB_TOKEN && !ST.IS_VIEWER && (ST.IS_SUPER || ST.MY_ROLE==='admin' || ST.MY_ROLE==='editor'); }
export function ifeeWire(box, Y, M, rows, ex, td){
  box.querySelectorAll('.ifgo').forEach(function(b){ b.onclick=function(ev){ ev.stopPropagation();
    var d=rows[+b.dataset.i]; if(!d) return; closeMxPop(); switchView('contracts');
    var sInp=$('#dvSearch'); if(sInp){ sInp.value=d.cust; DV.page=0; renderGrid(); } }; });
  var dl=box.querySelector('#dlIfeeCust');
  if(dl){ var seen={}; (SB_RAW.customers||[]).forEach(function(c){ if(c.name&&!seen[c.name]){ seen[c.name]=1; var o=document.createElement('option'); o.value=c.name; dl.appendChild(o); } }); }
  var save=box.querySelector('#ifSave'); if(!save) return;
  var nextX=ex.length, del={};
  function sumNow(){
    var t=0;
    box.querySelectorAll('.ifin[data-f]').forEach(function(i){
      var f=i.dataset.f;
      if(f.indexOf('_amt')<0 && f.charAt(0)!=='c') return;
      var tr=i.closest('tr'); if(tr && tr.dataset.x!==undefined && del[tr.dataset.x]) return;
      t+=kwToWon(i.value)||0;
    });
    var el=box.querySelector('#ifSum'); if(el) el.textContent=won(t)+'천원';
  }
  function wireRow(tr){
    tr.querySelectorAll('.ifin').forEach(function(i){ i.addEventListener('input',sumNow); i.addEventListener('change',sumNow); });
    var d=tr.querySelector('.ifdel');
    if(d) d.onclick=function(){
      var x=d.dataset.x;
      if(tr.dataset.id){ del[x]=tr.dataset.id; tr.style.opacity=.4; tr.style.textDecoration='line-through';
        tr.querySelectorAll('input,select').forEach(function(i){ i.disabled=true; }); d.textContent='되돌리기'; d.style.textDecoration='none';
        d.onclick=function(){ delete del[x]; tr.style.opacity=''; tr.style.textDecoration='';
          tr.querySelectorAll('input,select').forEach(function(i){ i.disabled=false; }); sumNow(); wireRow(tr); };
      } else { tr.remove(); }
      sumNow();
    };
  }
  box.querySelectorAll('tr.ifex').forEach(wireRow);
  box.querySelectorAll('.ifin[data-f^="c"]').forEach(function(i){ i.addEventListener('input',sumNow); });
  var add=box.querySelector('#ifAdd');
  if(add) add.onclick=function(){
    var tr=document.createElement('tr'); tr.className='ifex'; tr.dataset.x=String(nextX); tr.dataset.id='';
    tr.innerHTML=tpl`<td><input class="ifin" data-f="x${rawHtml(nextX)}_cust" list="dlIfeeCust" type="text" placeholder="고객사" style="width:100%;min-width:130px;font-size:12px;padding:3px 5px;border:1px solid var(--ring);border-radius:6px;background:var(--surface)"></td>`+
      tpl`<td><select class="ifin" aria-label="항목 종류" data-f="x${rawHtml(nextX)}_kind" style="font-size:12px;padding:3px 4px;border:1px solid var(--ring);border-radius:6px;background:var(--surface)">`+
        tpl`${rawHtml(IFEE_KINDS.map(function(k){ return tpl`<option>${rawHtml(k)}</option>`; }).join(''))}</select></td>`+
      tpl`<td><input class="ifin" data-f="x${rawHtml(nextX)}_note" type="text" placeholder="비고(선택)" style="width:100%;min-width:110px;font-size:12px;padding:3px 5px;border:1px solid var(--ring);border-radius:6px;background:var(--surface)"></td>`+
      tpl`<td class="n"><input class="ifin" data-f="x${rawHtml(nextX)}_amt" type="number" step="any" placeholder="천원" style="width:104px;text-align:right;font-size:12px;padding:3px 5px;border:1px solid var(--ring);border-radius:6px;background:var(--surface)"></td>`+
      tpl`<td><button class="ifdel" data-x="${rawHtml(nextX)}" title="이 줄 지우기" style="border:none;background:none;cursor:pointer;color:var(--critical,#d03b3b);font-size:13.5px">✕</button></td>`;
    var anchor=box.querySelector('#ifAddRow');
    anchor.parentNode.insertBefore(tr, anchor);
    wireRow(tr); nextX++;
    var f=tr.querySelector('input'); if(f) f.focus();
    if(td) mxPlace(box, td);
  };
  save.onclick=async function(){
    var msg=box.querySelector('#ifMsg'); msg.textContent='저장 중…'; save.disabled=true;
    try{
      var jobs=[], changed=0;
      /* ① 계약 설치비 */
      rows.forEach(function(d){
        var inp=box.querySelector('.ifin[data-f="c'+d.id+'"]'); if(!inp||!d.id) return;
        var v=kwToWon(inp.value);
        if(Number(v||0)===Number(d.fee||0)) return;
        changed++;
        jobs.push(sbWrite('PATCH','contracts?id=eq.'+d.id,{install_fee:v, updated_at:new Date().toISOString()}).then(function(){
          logChange('update','contracts',d.id,{install_fee:v});
          (ST.RAWX.contracts||[]).forEach(function(c){ if(c.id===d.id) c.install_fee=v; });
          (ST.DATA.rows||[]).forEach(function(r){ if(r._id===d.id) r.fee=Number(v||0); });
        }));
      });
      /* ② 추가 항목 — 새 줄 insert · 바뀐 줄 update · 지운 줄 delete */
      var ins=[];
      box.querySelectorAll('tr.ifex').forEach(function(tr){
        var x=tr.dataset.x, id=tr.dataset.id;
        if(del[x]) return;
        var g=function(f){ var e=box.querySelector('.ifin[data-f="x'+x+'_'+f+'"]'); return e? e.value : ''; };
        var cust=String(g('cust')||'').trim(), amt=kwToWon(g('amt'));
        var kind=g('kind')||'설치비', note=String(g('note')||'').trim()||null;
        if(!cust && !amt) return;
        if(!cust){ throw new Error('추가 항목의 고객사를 입력하세요'); }
        if(amt===null){ throw new Error('「'+cust+'」 금액을 입력하세요'); }
        var old=ex.filter(function(e){ return String(e.id)===String(id); })[0];
        if(id && old){
          if(old.customer===cust && old.kind===kind && Number(old.amount)===amt && (old.note||null)===note) return;
          changed++;
          jobs.push(sbWrite('PATCH','install_extra?id=eq.'+id,{customer:cust, kind:kind, amount:amt, note:note, updated_by:ST.AUTH_USER||'', updated_at:new Date().toISOString()}).then(function(){
            logChange('update','install_extra',+id,{customer:cust,kind:kind,amount:amt});
            (ST.RAWX.iextra||[]).forEach(function(e){ if(String(e.id)===String(id)){ e.customer=cust; e.kind=kind; e.amount=amt; e.note=note; } });
          }));
        }else{
          changed++;
          ins.push({year:Y, month:M, customer:cust, kind:kind, amount:amt, note:note, updated_by:ST.AUTH_USER||''});
        }
      });
      if(ins.length) jobs.push(sbWrite('POST','install_extra?select=*',ins,'return=representation').then(function(out){
        logChange('insert','install_extra',0,{year:Y,month:M,rows:ins.length});
        var got=(out&&out.length)? out : ins;                 /* 응답이 비어 와도 화면에는 바로 반영 */
        got.forEach(function(e){ (ST.RAWX.iextra=ST.RAWX.iextra||[]).push(e); });
      }));
      Object.keys(del).forEach(function(x){
        var id=del[x]; changed++;
        jobs.push(sbWrite('DELETE','install_extra?id=eq.'+id).then(function(){
          logChange('delete','install_extra',+id,{year:Y,month:M});
          ST.RAWX.iextra=(ST.RAWX.iextra||[]).filter(function(e){ return String(e.id)!==String(id); });
        }));
      });
      if(!changed){ msg.textContent='바뀐 내용이 없습니다'; save.disabled=false; return; }
      await Promise.all(jobs);
      closeMxPop();
      toast('설치비 저장', Y+'년 '+M+'월 · '+changed+'건 반영');
      ST.DIRTY=true; renderInstall();
    }catch(e){ msg.textContent=String(e.message||e).slice(0,140); save.disabled=false; }
  };
}
export function renderInstall(){
  var sec=document.querySelector('[data-w="ifee"]'); if(!sec) return;
  var t=$('#tIfee'); if(!t) return;

  var seg=$('#segIfeeMode');
  if(seg && !seg._built){
    seg._built=1;
    seg.querySelectorAll('button').forEach(function(b){
      b.onclick=function(){ IFEE_MODE=b.dataset.m; renderInstall(); };
    });
  }
  if(seg) seg.querySelectorAll('button').forEach(function(b){
    b.setAttribute('aria-pressed', b.dataset.m===IFEE_MODE?'true':'false');
  });

  var adj=ifeeAdj();
  var cell={}, det=[], pend=[], nGuess=0, nFee=0;
  (ST.DATA.rows||[]).forEach(function(r){
    var f=Number(r.fee||0); if(!f) return;
    var ym=ifeeYm(r);
    if(!ym){ pend.push({cust:r.cust, line:r.line, fee:f}); return; }   // 정산일 미정 — 달에 넣지 않음
    nFee++; if(ym[2]) nGuess++;
    cell[ym[0]+'|'+ym[1]]=(cell[ym[0]+'|'+ym[1]]||0)+f;
    det.push({y:ym[0], m:ym[1], cust:r.cust, line:r.line, fee:f, guess:ym[2], id:r._id});
  });
  Object.keys(adj).forEach(function(k){ cell[k]=(cell[k]||0)+adj[k]; });

  var ys={};
  Object.keys(cell).forEach(function(k){ if(cell[k]) ys[+k.split('|')[0]]=1; });
  var years=Object.keys(ys).map(Number).sort();

  if(!years.length){
    t.innerHTML='';
    $('#capIfee').textContent='설치비가 입력된 계약이 없습니다 — 52단계 SQL 실행 후 스프레드시트 메뉴에서 «시트 값 가져오기(syncSheetExtras)» 를 한 번 돌려주세요';
    return;
  }

  function n(v){ return v? Math.round(v/1000).toLocaleString('ko-KR') : '·'; }
  var html='';

  if(IFEE_MODE==='y'){
    html+='<thead><tr><th>연도</th>';
    for(var m=1;m<=12;m++) html+=tpl`<th class="n">${rawHtml(m)}월</th>`;
    html+=tpl`<th class="n" style="border-left:1px solid var(--ring)">연 합계</th>`+
          tpl`<th class="n">그중 추가</th></tr></thead><tbody>`;
    var gTot=0, gAdj=0, gm=[];
    for(var i=0;i<=12;i++) gm[i]=0;
    years.forEach(function(Y){
      var sum=0, a=0, tds='';
      for(var m=1;m<=12;m++){
        var v=cell[Y+'|'+m]||0; sum+=v; gm[m]+=v;
        var mk=MXM[mxKey(IFEE_LINE,Y,m)];
        var tip=mk? ' title="'+esc(String(mk.body).slice(0,400))+'\n\n(클릭: 내역 보기 · 메모 수정)"' : ' title="클릭: 이 달 설치비 내역 · 특이사항 메모"';
        tds+=tpl`<td class="n ifc${mk?' mxm':''}" data-y="${rawHtml(Y)}" data-m="${rawHtml(m)}"${rawHtml(tip)}>${rawHtml(n(v))}</td>`;
        a+=adj[Y+'|'+m]||0;
      }
      gTot+=sum; gAdj+=a;
      html+=tpl`<tr><td><b>${rawHtml(Y)}</b></td>${rawHtml(tds)}`+
        tpl`<td class="n" style="border-left:1px solid var(--ring);font-weight:650">${rawHtml(n(sum))}</td>`+
        tpl`<td class="n" style="color:var(--mut)">${rawHtml(n(a))}</td></tr>`;
    });
    var gtds='';
    for(var m3=1;m3<=12;m3++) gtds+=tpl`<td class="n">${rawHtml(n(gm[m3]))}</td>`;
    html+=tpl`<tr style="font-weight:700;border-top:2px solid var(--axis);background:var(--surface-2)">`+
      tpl`<td>합계</td>${rawHtml(gtds)}`+
      tpl`<td class="n" style="border-left:1px solid var(--ring)">${rawHtml(n(gTot))}</td>`+
      tpl`<td class="n" style="color:var(--mut)">${rawHtml(n(gAdj))}</td></tr></tbody>`;
  }else{
    det.sort(function(a,b){ return (b.y-a.y)||(b.m-a.m)||(b.fee-a.fee); });
    html+=tpl`<thead><tr><th>인식월</th><th>고객사</th><th>서비스</th>`+
          tpl`<th class="n">설치비(천원)</th><th>근거</th></tr></thead><tbody>`;
    det.slice(0,400).forEach(function(d){
      html+=tpl`<tr><td>${rawHtml(d.y)}-${rawHtml(('0'+d.m).slice(-2))}</td><td>${d.cust}</td>`+
        tpl`<td>${lline(d.line)}</td><td class="n">${rawHtml(n(d.fee))}</td>`+
        tpl`<td style="color:var(--mut)">${d.guess? '시작월+1 (대금정산일 없음)':'대금정산일'}</td></tr>`;
    });
    pend.forEach(function(d){
      html+=tpl`<tr style="color:var(--mut)"><td>미정</td><td>${d.cust}</td><td>${lline(d.line)}</td><td class="n">${rawHtml(n(d.fee))}</td>`+
        tpl`<td>대금정산일 없음 · 아직 시작 전 — 계약에 대금정산일을 넣으면 그 달에 반영</td></tr>`;
    });
    ifeeExtras().slice().sort(function(a,b){ return (b.year-a.year)||(b.month-a.month)||String(a.customer).localeCompare(String(b.customer),'ko'); })
      .forEach(function(e){
        html+=tpl`<tr style="background:var(--surface-2)"><td>${rawHtml(e.year)}-${rawHtml(('0'+e.month).slice(-2))}</td>`+
          tpl`<td>${e.customer}</td><td>${e.kind||''}</td>`+
          tpl`<td class="n">${rawHtml(n(e.amount))}</td><td style="color:var(--mut)">추가 항목${rawHtml(e.note? ' · '+esc(e.note):'')}</td></tr>`;
      });
    html+='</tbody>';
  }
  t.innerHTML=html;
  // 셀 클릭 → 그 달 설치비 내역 팝업
  t.querySelectorAll('td.ifc').forEach(function(td){
    td.onclick=function(){ openIfeeDetail(td, +td.dataset.y, +td.dataset.m, det, adj); };
  });

  var nAdj=ifeeExtras().length;
  var pendSum=pend.reduce(function(a,d){ return a+d.fee; },0);
  $('#capIfee').textContent='단위: 천원 · 설치비가 있는 계약 '+nFee+'건'+
    (nGuess? ' (그중 '+nGuess+'건은 대금정산일이 없어 시작월 다음 달로 잡았습니다)':'')+
    (pend.length? ' · 정산일 미정 '+pend.length+'건 '+n(pendSum)+'천원은 표에 넣지 않음 (월별 상세에서 확인)':'')+
    ' · 추가 항목(설치·철거) '+nAdj+'건 · 달 칸을 누르면 금액을 고치거나 추가할 수 있습니다 · 이 금액은 MRR 합계에 들어가지 않습니다 (시트와 동일)';
}

/* ---- LG U+ 경유 판매 ---- */
export function renderLg(){
  var lg=ST.DATA.lg, sec=$('#secLg');
  if(!lg || !lg.ok || !lg.rows.length){ if(sec) sec.style.display='none'; return; }
  sec.style.display='';
  $('#capLg').textContent = lg.count+'건 · 월액 합계 '+won(lg.feeSum)+'천원 · 매출은 각 서비스에 포함됨';
  var t=$('#tLg'); t.innerHTML='';
  var thead=document.createElement('thead'), tb=document.createElement('tbody');
  thead.innerHTML='<tr><th>고객사</th><th>제품</th><th style="text-align:right">노드</th><th>기간</th><th style="text-align:right">월액</th></tr>';
  lg.rows.forEach(function(x){
    var tr=document.createElement('tr');
    tr.innerHTML=tpl`<td>${x.cust}</td><td>${x.prod}</td><td style="text-align:right">${rawHtml(x.nodes||'-')}`+
      tpl`</td><td>${rawHtml(x.start||'-')}~${rawHtml(x.end||'무약정')}</td><td style="text-align:right">${won(x.fee)}천원</td>`;
    tb.appendChild(tr);
  });
  t.appendChild(thead); t.appendChild(tb);
}

/* ---- 비즈포탈 대사 ---- */
export function renderVs(){
  var vs=ST.DATA.vs, sec=$('#secVs');
  if(!vs || !vs.ok || (!vs.items.length && !vs.details.length)){ if(sec) sec.style.display='none'; return; }
  sec.style.display='';
  $('#capVs').textContent = (vs.month? vs.month+' 기준':'')+(vs.asOf? ' · 작성일 '+vs.asOf:'')+
    (vs.monthCount>1? ' · 최근 달만 표시 (전체는 정산·목표 › 비즈포탈 차액)':'');
  var sm=$('#vsSummary'); sm.innerHTML='';
  vs.items.forEach(function(x){
    var row=el('div'); row.style.cssText='display:flex;justify-content:space-between;gap:12px;padding:3px 2px;font-size:13.5px';
    var k=el('span','',x.k); k.style.color='var(--mut)';
    var v=el('b','',won(x.v)+'천원');
    if(/차액/.test(x.k)) v.style.color = x.v>=0? 'var(--up,#199e70)':'var(--dn,#d95926)';
    row.appendChild(k); row.appendChild(v); sm.appendChild(row);
  });
  var t=$('#tVs'); t.innerHTML='';
  if(vs.details.length){
    var thead=document.createElement('thead'), tb=document.createElement('tbody');
    thead.innerHTML='<tr><th>고객사</th><th style="text-align:right">비즈포탈</th><th style="text-align:right">매출시트</th><th style="text-align:right">차이</th><th>사유</th></tr>';
    vs.details.forEach(function(x){
      var tr=document.createElement('tr');
      tr.innerHTML=tpl`<td>${x.cust}</td><td style="text-align:right">${won(x.biz)}천원</td><td style="text-align:right">${won(x.sheet)}`+
        tpl`천원</td><td style="text-align:right">${won(x.diff)}천원</td><td style="font-size:12px;color:var(--mut)">${x.note}</td>`;
      tb.appendChild(tr);
    });
    t.appendChild(thead); t.appendChild(tb);
  }
}

/* ---- KPI ---- */
export function renderGoal(list){
  var box=$('#goalBar'); if(!box) return;
  var yr=yOf(STATE.base);
  var tg=(ST.RAWX.targets||[]).filter(function(t){return +t.year===yr;})[0];
  if(!tg||!tg.amount){ box.style.display='none'; return; }

  // 목표 = 그 해 연말 ARR (12월 MRR × 12)
  var curArr = monthlyTotal(list, STATE.base) * 12;          // 현재 ARR
  var decIdx = (yr - 2020) * 12 + (12 - 6);                  // 그 해 12월 인덱스
  var decArr = (decIdx >= 0 && decIdx < ST.M) ? monthlyTotal(list, decIdx) * 12 : 0;  // 연말 예정 ARR (계약 기준)
  var p1=Math.min(100,curArr/tg.amount*100), p2=Math.min(100,decArr/tg.amount*100);
  var needMrr = tg.amount / 12;                              // 달성에 필요한 12월 MRR

  box.style.display='';
  /* ㊿+166 지니언스: 로고 모양 타원 트랙(현재 ARR · 연한 줄 = 12월 계약분) + 같은 숫자 4줄 */
  if(isGN()){
    var trk=function(cls, p){ return tpl`<rect class="${rawHtml(cls)}" x="6" y="6" width="120" height="66" rx="33" pathLength="100" stroke-dasharray="${rawHtml(Math.max(0,Math.min(100,p)).toFixed(1))} 100"/>`; };
    box.innerHTML=tpl`<div class="gn-goal"><svg class="gn-trk" viewBox="0 0 132 78" role="img" aria-label="${rawHtml(yr)}년 목표 ARR 대비 현재 ${rawHtml(p1.toFixed(1))}%">`+
      tpl`<rect class="t0" x="6" y="6" width="120" height="66" rx="33"/>${rawHtml(decArr>curArr? trk('t2', p2) : '')}${rawHtml(trk(p1>=100?'t1 done':'t1', p1))}`+
      tpl`<text x="66" y="47" text-anchor="middle">${rawHtml(p1>=99.95? '100' : p1.toFixed(1))}%</text></svg>`+
      tpl`<div class="gn-gtx"><b>🎯 ${rawHtml(yr)}년 목표 ARR ${won(tg.amount)}천원</b><span>현재 ARR <b>${won(curArr)}천원</b> (${rawHtml(p1.toFixed(1))}%)</span>`+
      tpl`${rawHtml(decArr? tpl`<span>12월 계약분 기준 ${won(decArr)}천원 (${rawHtml(p2.toFixed(1))}%)</span>` : '')}<span>필요 12월 MRR <b>${won(needMrr)}천원</b></span></div></div>`;
    return;
  }
  box.innerHTML=
    tpl`<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:9px">`+
      tpl`<div style="font-size:12.5px;font-weight:650">🎯 ${rawHtml(yr)}년 목표 ARR ${won(tg.amount)}천원`+
        tpl`<span style="font-weight:500;color:var(--muted)"> · 필요 12월 MRR ${won(needMrr)}천원</span></div>`+
      tpl`<div style="font-size:12px;color:var(--ink-2)">현재 ARR <b style="color:var(--ink)">${won(curArr)}천원 (${p1.toFixed(1)}%)</b>`+ tpl`${rawHtml(decArr? ' · 12월 계약분 기준 '+won(decArr)+'천원 ('+p2.toFixed(1)+'%)':'')}</div></div>`+
    tpl`<div style="position:relative;height:14px;border-radius:7px;background:var(--surface-2);overflow:hidden">`+
      tpl`<div style="position:absolute;left:0;top:0;bottom:0;width:${Math.max(p1,p2)}%;background:var(--glow)"></div>`+
      tpl`<div style="position:absolute;left:0;top:0;bottom:0;width:${rawHtml(p1)}%;background:${p1>=100?'var(--good)':'var(--s1)'};border-radius:0 7px 7px 0"></div>`+
      tpl`<div style="position:absolute;left:calc(100% - 2px);top:0;bottom:0;width:2px;background:var(--axis)"></div>`+
    tpl`</div>`;
}

export function renderKpis(list){
  list=list||idxs();
  var b=STATE.base;
  var br=baseRange(), f0=br[0];
  var mrr=monthlyTotal(list,b);
  var prevY=b>=12? monthlyTotal(list,b-12):0;
  var prevM=b>=1? monthlyTotal(list,b-1):0;
  var cust=activeCustomers(list,b);
  var custPrevY=b>=12? activeCustomers(list,b-12):0;

  /* 신규·해지 = 해지율·고객사 증감 화면과 같은 규칙
     · 신규 = 원계약(부속 제외)의 시작월이 기간 안 (계약 시작월 기준 · 매출 첫 달이 아님)
     · 해지 = 상태 «해지» 원계약의 해지월(종료월)이 기간 안 · 이탈 MRR = 해지월 인식 금액
     · 만료 = 종료월이 기준월~+2개월인 계약(해지·종료 상태 제외) */
  var newRows=[], churnRows=[], expRows=[], churnAmt=0, expAmt=0;
  list.forEach(function(k){
    var r=ST.DATA.rows[k]; if(r.parent || r.noCount || String(r.saleType||'')==='H/W') return;
    var st=String(r.status||'');
    if(st!=='통합과금' && r.startIdx!=null && r.startIdx>=0 && r.startIdx>=f0 && r.startIdx<=b) newRows.push(k);
    if(st==='해지' && !(r.line==='S1' && String(r.saleType||'')==='CND')){ var x=r.endIdx!=null? r.endIdx : r._l; if(x!=null && x>=f0 && x<=b){ churnRows.push(k); churnAmt+=(ST.MAT[k][x]||ST.MAT[k][Math.max(x-1,0)]||r.mrr||0); } }
    var e=r.endIdx, EN=expN();
    if(e!=null && e>=b && e<=b+EN-1 && !/해지|종료|CN전환/.test(st)){ expRows.push(k); expAmt+=ST.MAT[k][Math.min(e,ST.M-1)]||r.mrr||0; }
  });
  var newCnt=newRows.length, churnCnt=churnRows.length, expCnt=expRows.length;
  var uq2=function(ks){ var u={}; ks.forEach(function(k){ u[ST.DATA.rows[k].cust]=1; }); return Object.keys(u).length; };
  var newCu=uq2(newRows), churnCu=uq2(churnRows);

  // 분기/연 단위: 기간 합계와 전기·전년 동기 비교
  var perSum=0, perPrev=0, perPy=0, span=b-f0+1;
  if(STATE.unit!=='month'){
    for(var j=f0;j<=b;j++) perSum+=monthlyTotal(list,j);
    for(var j2=f0-span;j2<f0;j2++) if(j2>=0) perPrev+=monthlyTotal(list,j2);
    for(var j3=f0-12;j3<=b-12;j3++) if(j3>=0) perPy+=monthlyTotal(list,j3);
  }

  var ser=monthlySeries(list);
  var series24=ser.slice(Math.max(0,b-23), b+1);
  KPI_D={list:list, b:b, f0:f0, newRows:newRows, churnRows:churnRows, expRows:expRows, mrr:mrr, prevY:prevY, prevM:prevM, perSum:perSum, perPy:perPy, span:span};

  var tiles=[
    { k:'당월 MRR ('+mk(b)+')', v:won(mrr), u:'천원', d: prevM? deltaHtml(mrr,prevM,'전월'):'', spark:series24, open:'mrr', tip:'기준월에 인식된 월 금액 합계 (계약별 월 매출표 · 부속 계약 포함) — 누르면 고객사별 내역' },
    { k:'연환산 ARR', v:won(mrr*12), u:'천원', d:'MRR × 12 기준', open:'mrr', tip:'당월 MRR × 12' },
    { k:'전년 동월 대비', v:(prevY? pct((mrr-prevY)/prevY*100):'—'), u:'', d: prevY? mk(b-12)+' '+won(prevY)+'천원':'비교 데이터 없음',
      cls:(prevY&&mrr>=prevY)?'up':'down', open:'yoy', tip:'당월 MRR vs 전년 같은 달 MRR — 누르면 고객사별 증감' },
    (function(){
      var lv = liveData(b);
      if(lv && lv.ok){
        var anyLine = Object.keys(STATE.lines).some(function(k){ return STATE.lines[k]; });
        function selOf(rows){ return rows.filter(function(x){
          if(anyLine && STATE.lines[x.line] === false) return false;
          if(STATE.ind && x.ind!==STATE.ind) return false;
          return true;
        }); }
        var sel = selOf(lv.rows);
        var uq={}, perLine={}; sel.forEach(function(x){ uq[x.cust]=1; (perLine[x.line]=perLine[x.line]||{})[x.cust]=1; });
        var nCust=Object.keys(uq).length, nRow=sel.length, prodSum=Object.keys(perLine).reduce(function(a,l){ return a+Object.keys(perLine[l]).length; },0);
        var isDb=(lv.src==='db'), other='';
        if(isDb && ST.DATA.live && ST.DATA.live.ok){ var su={}; selOf(ST.DATA.live.rows).forEach(function(x){ su[x.cust]=1; }); var sn=Object.keys(su).length; other=' · 시트 명단 '+sn+(sn!==nCust? ' ('+(nCust-sn>0?'+':'')+(nCust-sn)+')':' ✓'); }
        return { k:'LIVE 고객사'+(isDb? ' ('+mk(b)+')':''), v:nCust.toLocaleString('ko-KR'), u:'곳',
                 d:'제품별 합 '+prodSum.toLocaleString('ko-KR')+(!isDb && prodSum>nCust? ' (복수 제품 '+(prodSum-nCust)+'곳)':'')+
                   (nRow>prodSum? ' · 사이트 '+nRow+'건':'')+other, open:'live',
                 extra:(isDb && !STATE.ind && Object.keys(STATE.lines).every(function(k){ return STATE.lines[k]; }))? liveDeltaHtml(b) : '',   /* 전월 대비 분해 (신규·복귀 / 만기 미처리·해지·종료) + «확인중» — 표시용 (㊿+127) */
                 tip:(isDb? '계약 기준 자동 판정 — 원계약이 '+mk(b)+'에 유효한 회사(시작월 ≤ 기준월, 종료 전 · 해지는 해지월부터 제외 · 통합과금/추가/H/W 제외 · CN전환 포함) · 곳 = 회사 단위 · 제품별 합 = 매출시트 LIVE 산정 방식(제품마다 1곳'+(prodSum>nCust? ' · 두 제품 이상 쓰는 '+(prodSum-nCust)+'곳이 겹침':'')+') · «시트 명단» 은 예전 LIVE 고객사 탭 사본 — 차이는 LIVE 화면 «시트와 다른 곳»에서 항목별로'
                            : 'LIVE 명단 시트 기준 — 곳 = 회사 단위 · 제품별 합 = 매출시트 LIVE 고객사 산정 방식(제품마다 1곳)')+' — 누르면 LIVE 고객사 화면' };
      }
      return { k:'활성 고객사', v:cust.toLocaleString('ko-KR'), u:'곳', d: custPrevY? deltaHtml(cust,custPrevY,'전년'):'', open:'live' };
    })(),
    { k:(STATE.unit==='month'?'당월':'기간 내')+' 신규 / 해지', v:newCnt+' / '+churnCnt, u:'건',
      d:'고객사 '+newCu+' / '+churnCu+'곳 · 이탈 MRR '+won(churnAmt)+'천원',
      cls: churnCnt>newCnt? 'down':'up', open:'nc', tip:'신규 = 원계약 시작월이 '+(STATE.unit==='month'? mk(b) : mk(f0)+'~'+mk(b))+' · 해지 = 상태 «해지» 해지월이 그 기간 (부속 계약·CND 제외 · 해지 분석·해지율 화면과 같은 기준) — 누르면 명단' },
    (function(){ var EN=expN(), eEnd=Math.min(b+EN-1,ST.M-1);
      var seg=tpl`<div class="expseg" style="display:flex;gap:3px;align-items:center;margin-top:8px;flex-wrap:wrap" title="만료 기간을 바꿉니다 (이 브라우저에 기억 · 아래 «만료 예정» 위젯도 같이 바뀜)"><span class="mini" style="color:var(--muted);margin-right:2px">기간</span>${rawHtml([1,2,3,6,12].map(function(n){ return tpl`<button type="button" data-expn="${rawHtml(n)}" aria-pressed="${n===EN}" style="font:inherit;font-size:11px;line-height:1;padding:4px 7px;border-radius:6px;border:1px solid var(--ring);cursor:pointer;background:${n===EN?'var(--s1-solid,#226bc4)':'var(--surface-2)'};color:${n===EN?'#fff':'var(--ink-2)'}">${rawHtml(n)}개월</button>`; }).join(''))}</div>`;
      return { k:EN+'개월 내 만료', v:won(expAmt), u:'천원', d: expCnt+'건 · 재약정 타깃 · '+mk(b)+'~'+mk(eEnd), cls: expCnt? 'down':'', open:'exp', extra:seg,
               tip:'종료월이 '+mk(b)+'~'+mk(eEnd)+'인 원계약(해지·종료 상태 제외) — 숫자를 누르면 명단 · 아래 버튼으로 기간 변경' }; })()
  ];
  if(STATE.unit!=='month'){
    tiles[0]={ k:baseLabel()+' 매출 합계', v:won(perSum), u:'천원',
      d: perPrev? deltaHtml(perSum,perPrev, STATE.unit==='quarter'?'전분기':'전년'):'', spark:series24, open:'mrr', tip:'기간 내 월 금액 합계 — 누르면 고객사별 내역(기말 월 기준)' };
    tiles[1]={ k:'기말 MRR ('+mk(b)+')', v:won(mrr), u:'천원', d:'연환산 ARR '+won(mrr*12)+'천원', open:'mrr' };
    tiles[2]={ k:'전년 동기 대비', v:(perPy? pct((perSum-perPy)/perPy*100):'—'), u:'',
      d: perPy? '전년 동기 '+won(perPy)+'천원':'비교 데이터 없음', cls:(perPy&&perSum>=perPy)?'up':'down', open:'yoy' };
  }
  var box=$('#kpis'); box.innerHTML='';
  tiles.forEach(function(t){
    var c=el('div','kpi');
    c.appendChild(el('div','k',t.k));
    var v=el('div','v'); v.innerHTML=t.v+(t.u?tpl`<small>${rawHtml(t.u)}</small>`:''); c.appendChild(v);
    var d=el('div','d'+(t.cls?' '+t.cls:'')); d.innerHTML=t.d||''; c.appendChild(d);
    if(t.extra){ var ex=document.createElement('div'); ex.innerHTML=t.extra; c.appendChild(ex.firstChild); }
    if(t.spark) c.appendChild(sparkline(t.spark));
    if(t.open){ c.style.cursor='pointer'; c.title=(t.tip||'')+(t.tip?' ':'')+'(클릭)'; c.setAttribute('role','button'); c.tabIndex=0;
      c.onclick=function(ev){ if(ev && ev.target && ev.target.closest('button')) return; kpiOpen(t.open); }; c.onkeydown=function(ev){ if(ev.target!==c) return; if(ev.key==='Enter'||ev.key===' '){ ev.preventDefault(); kpiOpen(t.open); } }; }
    /* 타일 안의 기간 버튼(만료 예정) — 타일 클릭(명단 열기)과 분리 */
    c.querySelectorAll('button[data-expn]').forEach(function(bt){ bt.onclick=function(ev){ ev.stopPropagation(); setExpN(+bt.dataset.expn); }; });
    c.querySelectorAll('button[data-renew]').forEach(function(bt){ bt.onclick=function(ev){ ev.stopPropagation(); openRenewList(bt.dataset.renew); }; });   /* LIVE 타일 «확인중 N건 →» */
    a11yTileRole(c);   /* ㊿+141: 안에 버튼이 있는 타일은 role=group (버튼 속 버튼 금지 · 키보드 Enter 는 그대로) */
    box.appendChild(c);
  });
  try{ ccAfterKpis(box, list, b); }catch(e){ console.warn('cc kpis', e); }
}
/* ── 대시보드 타일 상세 ── 타일을 누르면 그 숫자를 만든 행을 그대로 보여줍니다 */
export var KPI_D=null;
/* 만료 예정 타일의 기간(개월) — 타일 안의 1·2·3·6 버튼으로 바꾸며 이 브라우저에 기억 */
export function expN(){ var n=3; try{ n=+localStorage.getItem('svc_exp_n')||3; }catch(e){} return [1,2,3,6,12].indexOf(n)>=0? n : 3; }
export function setExpN(n){
  try{ localStorage.setItem('svc_exp_n',String(n)); }catch(e){}
  STATE.expM=n;   // «만료 예정» 위젯도 같은 기간으로
  $$('#segExp button').forEach(function(b){ b.setAttribute('aria-pressed', +b.dataset.m===n? 'true':'false'); });
  try{ renderKpis(); }catch(e){} try{ renderExpiring(); }catch(e){} try{ renderTodo(); }catch(e){}
}
export function kpiTable(title, cap, head, rows, xname, view){
  view=view||'contracts';
  $('#crTitle').textContent=title; $('#crCap').textContent=cap;
  $('#crList').innerHTML=tpl`<table class="pr"><thead><tr>${rawHtml(head.map(function(h){ return tpl`<th${rawHtml(h.n?' class="n"':'')}>${h.l}</th>`; }).join(''))}</tr></thead><tbody>`+
    tpl`${rawHtml(rows.map(function(r){ return tpl`<tr${rawHtml(r._cust?' data-c="'+esc(r._cust)+'" style="cursor:pointer"':'')}>${rawHtml(r.c.map(function(x,i){ return tpl`<td${rawHtml(head[i].n?' class="n"':'')}>${rawHtml(x)}</td>`; }).join(''))}</tr>`; }).join(''))}</tbody></table>`;
  $('#crList').querySelectorAll('tr[data-c]').forEach(function(tr){ tr.onclick=function(){ closeOvl('ovlCr'); switchView(view); var sb=$('#dvSearch'); if(sb){ sb.value=tr.dataset.c; try{ renderGrid(); }catch(e){} } }; });
  $('#crXls').onclick=function(){ xlsxAoa((xname||title).replace(/[\\/:*?"<>|]/g,' '), head.map(function(h){return h.l;}), rows.map(function(r){ return r.x||r.c.map(function(x){ return String(x).replace(/<[^>]+>/g,''); }); })); };
  openOvl('ovlCr');
}
export function kpiOpen(kind){
  var D=KPI_D; if(!D) return;
  var b=D.b, rows=[], head, tot=0;
  var base=function(r){ return [esc(r.cust), esc(lline(r.line)), esc(chOf(r)), esc(r.status||'활성')+(r.renew?tpl` <span class="ubadge sm">연장 ${rawHtml(r.renew)}회</span>`:''), mk(r.startIdx)||'', r.endIdx!=null? mk(r.endIdx):'']; };
  var H6=[{l:'고객사'},{l:'서비스'},{l:'채널'},{l:'상태'},{l:'시작월'},{l:'종료월'}];
  if(kind==='live'){ switchView('live'); return; }
  if(kind==='mrr'){
    D.list.forEach(function(k){ var r=ST.DATA.rows[k], a=ST.MAT[k][b]||0; if(!a) return; tot+=a; rows.push({_cust:r.cust, c:base(r).concat([r.parent?'부속':'', won(a)]), s:a}); });
    rows.sort(function(x,y){ return y.s-x.s; });
    head=H6.concat([{l:'구분'},{l:mk(b)+' 인식 금액(천원)',n:true}]);
    kpiTable(mk(b)+' MRR 내역 — '+won(tot)+'천원', '계약 '+rows.length+'건 · 그 달 월 매출표(monthly_revenue)에 금액이 있는 계약 전부 (부속 계약 포함) · 합계 = 대시보드 당월 MRR · 연환산 ARR = ×12 · 행을 누르면 계약 화면', head, rows, 'MRR_'+mk(b));
  }
  else if(kind==='yoy'){
    var pb=b-12; if(pb<0){ toast('전년 동월 데이터가 없습니다',''); return; }
    var m={}; D.list.forEach(function(k){ var r=ST.DATA.rows[k], a=ST.MAT[k][b]||0, p=ST.MAT[k][pb]||0; if(!a&&!p) return; var o=(m[r.cust]=m[r.cust]||{r:r,a:0,p:0}); o.a+=a; o.p+=p; });
    var ta=0,tp=0; Object.keys(m).forEach(function(c){ var o=m[c]; ta+=o.a; tp+=o.p; var kind2= !o.p? '신규':(!o.a? '이탈':(o.a>o.p?'증액':(o.a<o.p?'감액':'유지')));
      rows.push({_cust:c, c:[esc(c), esc(lline(o.r.line)), kind2, won(o.p), won(o.a), (o.a-o.p>0?'+':'')+won(o.a-o.p)], s:o.a-o.p}); });
    rows.sort(function(x,y){ return y.s-x.s; });
    head=[{l:'고객사'},{l:'서비스'},{l:'구분'},{l:mk(pb)+'(천원)',n:true},{l:mk(b)+'(천원)',n:true},{l:'증감(천원)',n:true}];
    kpiTable('전년 동월 대비 — '+mk(pb)+' '+won(tp)+' → '+mk(b)+' '+won(ta)+'천원 ('+(ta-tp>0?'+':'')+won(ta-tp)+')', '고객사 '+rows.length+'곳 · 신규 = 전년엔 없던 곳 · 이탈 = 올해 금액 0 · 증액/감액 = 같은 고객의 금액 변화 · 합계 차이가 타일의 % 입니다', head, rows, '전년동월대비_'+mk(b));
  }
  else if(kind==='nc'){
    var per=(STATE.unit==='month'? mk(b) : mk(D.f0)+'~'+mk(b));
    D.newRows.forEach(function(k){ var r=ST.DATA.rows[k]; rows.push({_cust:r.cust, c:['<b style="color:var(--ok,#2e7d32)">신규</b>'].concat(base(r), [esc(r.saleType||''), '', won(r.mrr||0)])}); });
    var ca=0; D.churnRows.forEach(function(k){ var r=ST.DATA.rows[k], x=r.endIdx!=null? r.endIdx : r._l, amt=(ST.MAT[k][x]||ST.MAT[k][Math.max(x-1,0)]||r.mrr||0); ca+=amt; rows.push({_cust:r.cust, c:['<b style="color:var(--critical)">해지</b>'].concat(base(r), [esc(r.saleType||''), esc(r.churn||''), won(amt)])}); });
    head=[{l:'구분'}].concat(H6, [{l:'판매형태'},{l:'해지 사유'},{l:'월액(천원)',n:true}]);
    kpiTable(per+' 신규 '+D.newRows.length+'건 / 해지 '+D.churnRows.length+'건', '신규 = 원계약 시작월이 '+per+' (부속 계약·CN전환 제외) · 해지 = 상태 «해지»이고 해지월(종료월)이 '+per+' — 해지율·고객사 증감 화면과 같은 기준 · 이탈 MRR '+won(ca)+'천원 = 해지월 인식 금액 · 대시보드 필터(서비스·산업군)가 적용된 상태', head, rows, '신규해지_'+per);
  }
  else if(kind==='exp'){
    D.expRows.forEach(function(k){ var r=ST.DATA.rows[k], a=ST.MAT[k][Math.min(r.endIdx,ST.M-1)]||r.mrr||0; tot+=a; rows.push({_cust:r.cust, c:base(r).concat([esc(r.saleType||''), r.parent?'부속':'', won(a)]), s:r.endIdx}); });
    rows.sort(function(x,y){ return x.s-y.s; });
    head=H6.concat([{l:'판매형태'},{l:'구분'},{l:'월액(천원)',n:true}]);
    var EN2=expN();
    kpiTable(EN2+'개월 내 만료 — '+rows.length+'건 · '+won(tot)+'천원', '종료월이 '+mk(b)+' ~ '+mk(Math.min(b+EN2-1,ST.M-1))+' 인 계약 (해지·서비스종료 상태 제외 · 원계약 기준) · 연장을 등록하면 여기서 빠집니다 · 기간은 타일의 1·2·3·6·12 버튼으로 · 행을 누르면 계약 화면', head, rows, '만료예정_'+EN2+'개월_'+mk(b));
  }
}
export function deltaHtml(a,b,label){
  if(!b) return '';
  var p=(a-b)/b*100;
  var up=p>=0;
  return tpl`<span class="${up?'up':'down'}">${up?'▲':'▼'} ${Math.abs(p).toFixed(1)}%</span> <span style="color:var(--muted)">${rawHtml(label)} 대비</span>`;
}
export function sparkline(arr){
  var w=220,h=26,n=arr.length;
  var mx=Math.max.apply(null,arr), mn=Math.min.apply(null,arr);
  var rg=(mx-mn)||1;
  var pts=arr.map(function(v,i){ return (i/(n-1||1)*w).toFixed(1)+','+(h-2-((v-mn)/rg)*(h-4)).toFixed(1); });
  var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 '+w+' '+h); svg.setAttribute('class','spark'); svg.setAttribute('preserveAspectRatio','none');
  var area=document.createElementNS('http://www.w3.org/2000/svg','polygon');
  area.setAttribute('points','0,'+h+' '+pts.join(' ')+' '+w+','+h);
  area.setAttribute('fill',cssv('--s1')); area.setAttribute('opacity','.14');
  var p=document.createElementNS('http://www.w3.org/2000/svg','polyline');
  p.setAttribute('points',pts.join(' ')); p.setAttribute('fill','none');
  p.setAttribute('stroke',cssv('--s1')); p.setAttribute('stroke-width','2');
  p.setAttribute('vector-effect','non-scaling-stroke'); p.setAttribute('stroke-linejoin','round');
  svg.appendChild(area); svg.appendChild(p);
  return svg;
}

/* ---- 차트 헬퍼 ---- */
export function hexA(hex,a){ return Viz.hexA(hex,a); }
export function kill(id){ /* Viz는 인스턴스를 남기지 않음 */ }
export var RESIZE_HOOKS=[];
export function onResize(fn){ RESIZE_HOOKS.push(fn); }


/* ---- MRR 추이 ---- */
export function renderTrend(list){
  list=list||idxs();
  var r=STATE.trendR;
  var to=STATE.base, from = r? Math.max(0,to-r+1) : 0;
  var byLine=monthlyByLine(list);
  var labels=[]; for(var j=from;j<=to;j++) labels.push(mkLabel(j));

  var series=[], legend=$('#legTrend'); legend.innerHTML='';
  ST.DATA.lines.filter(function(l){ return STATE.lines[l.label]; }).forEach(function(l){
    var col=seriesColor(l.color);
    var data=byLine[l.label].slice(from,to+1);
    if(!data.some(function(v){return v!==0;})) return;
    series.push({label:lline(l.label), data:data, color:col});
    var li=el('span','li');
    var sw=el('span','sw'); sw.style.background=col; li.appendChild(sw); li.appendChild(el('span',null,lline(l.label)));
    legend.appendChild(li);
  });

  $('#capTrend').textContent = '서비스별 월 반복매출 누적 · '+(labels[0]||'')+' ~ '+(labels[labels.length-1]||'');
  var host=document.getElementById('chTrend');
  if(series.length) Viz.area(host,{labels:labels,series:series,fmt:won,tipFmt:wonFull});
  else host.innerHTML='<p class="cap" style="padding-top:24px">선택한 조건에 데이터가 없습니다.</p>';

  var tv=$('#tvTrend').querySelector('table');
  var head=tpl`<thead><tr><th>월</th>${rawHtml(series.map(function(d){return tpl`<th class="n">${d.label}</th>`;}).join(''))}<th class="n">합계</th></tr></thead>`;
  var body=tpl`<tbody>${rawHtml(labels.map(function(lb,i){
    var sum=series.reduce(function(a,d){return a+d.data[i];},0);
    return tpl`<tr><td>${rawHtml(lb)}</td>${rawHtml(series.map(function(d){return tpl`<td class="n">${won(d.data[i])}</td>`;}).join(''))}<td class="n"><b>${won(sum)}</b></td></tr>`;
  }).reverse().join(''))}`+ tpl`</tbody>`;
  tv.innerHTML=head+body;
}

/* ---- 연도별 ---- */
export function renderYear(list){
  list=list||idxs();
  var ser=monthlySeries(list), by={};
  for(var j=0;j<ST.M;j++){ var y=yOf(j); by[y]=(by[y]||0)+ser[j]; }
  var years=Object.keys(by).sort();
  var vals=years.map(function(y){return by[y];});
  var nowY=yOf(STATE.base);
  Viz.bars(document.getElementById('chYear'),{
    labels:years, fmt:won, tipFmt:wonFull, maxBar:44,
    series:[{label:'연 매출', data:vals, colorAt:function(i){
      return +years[i]>nowY? Viz.hexA(cssv('--s1'),.42) : cssv('--s1'); }}],
    extra:function(i){ var pv=i>0?vals[i-1]:0;
      return pv? tpl`<div class="vt-x">전년 대비 ${pct((vals[i]-pv)/pv*100)}</div>`
               : (+years[i]>nowY? '<div class="vt-x">계약 기준 예정 금액</div>':''); }
  });
  var tv=$('#tvYear').querySelector('table');
  tv.innerHTML=tpl`<thead><tr><th>연도</th><th class="n">매출</th><th class="n">전년비</th></tr></thead><tbody>`+
    tpl`${rawHtml(years.map(function(y,i){ var p=i>0?vals[i-1]:0;
      return tpl`<tr><td>${rawHtml(y)}${rawHtml(+y>nowY?' <span class="badge b-warn">예정</span>':'')}</td><td class="n">${won(vals[i])}`+
      tpl`</td><td class="n ${p&&vals[i]>=p?'up':'down'}">${p?pct((vals[i]-p)/p*100):'—'}</td></tr>`; }).join(''))}`+
    tpl`</tbody>`;
}

/* ---- 수평 막대 3종 ---- */
export function renderBars(list){
  list=list||idxs();
  var b=STATE.base, tot=monthlyTotal(list,b);
  $('#capLine').textContent = mk(b)+' 기준 · 합계 '+won(tot)+'천원 (단위: 천원)';
  $('#capInd').textContent = mk(b)+' 기준 비중';

  hbars('#barLine', ST.DATA.lines.filter(function(l){return STATE.lines[l.label];}).map(function(l){
    return {name:lline(l.label), v:monthlyTotal(list.filter(function(k){return ST.DATA.rows[k].line===l.label;}),b), c:seriesColor(l.color)};
  }).filter(function(x){return x.v!==0;}).sort(function(a,b2){return b2.v-a.v;}), tot);

  $('#capPartner').textContent = mk(b)+' 기준 · 실제 파트너 3사 + 직접';
  hbars('#barPartner', groupSum(list,'ptn',b).map(function(x,i){
    return {name:x.name, v:x.v, c:seriesColor(i+1)};
  }), tot);

  hbars('#barBiller', groupSum(list,'partner',b).slice(0,8).map(function(x){
    return {name:x.name, v:x.v, c:cssv('--s1')};
  }), tot);

  hbars('#barInd', groupSum(list,'ind',b).map(function(x,i){
    return {name:x.name, v:x.v, c:seriesColor(i+1)};
  }), tot);

  // 해지 사유
  var churnList=list.filter(function(k){ return ST.DATA.rows[k].churn; });
  var reasons=groupCount(churnList,'churn').slice(0,8);
  var mxc=reasons.length?reasons[0].v:1;
  hbars('#barChurn', reasons.map(function(x){return {name:x.name,v:x.v,c:cssv('--critical')};}), mxc, true);
}
export function hbars(sel, arr, total, isCount){
  var box=$(sel); box.innerHTML='';
  if(!arr.length){ box.appendChild(el('p','cap','해당 조건에 데이터가 없습니다.')); return; }
  var mx=Math.max.apply(null,arr.map(function(x){return Math.abs(x.v);}))||1;
  arr.forEach(function(x){
    var row=el('div','bar-row');
    var nm=el('div','nm',x.name); nm.title=x.name;
    var tr=el('div','tr'); var fl=el('div','fl');
    fl.style.width=Math.max(1.5,Math.abs(x.v)/mx*100)+'%'; fl.style.background=x.c;
    tr.appendChild(fl);
    var vv=el('div','vv', isCount? x.v+'건' : won(x.v));
    if(!isCount && total) vv.title=wonFull(x.v)+' · '+(x.v/total*100).toFixed(1)+'%';
    row.appendChild(nm); row.appendChild(tr); row.appendChild(vv);
    box.appendChild(row);
  });
}

/* ---- 신규 / 해지 건수 (대시보드 위젯) ----
   ※ «해지 분석» 화면의 renderChurn() 과 이름이 같아 위젯이 비어 보이던 버그 → renderNcWidget 로 분리 */
/* ---- 신규 · 해지 고객수 추이 (월별 종합 장표와 같은 양식) ----
   · 신규 = 원계약 시작월 (부속·CN전환 제외) · 해지 = 상태 «해지» 원계약의 해지월(종료월), 에스원 CND 제외
   · 셀 = 그 달 고객사 수(같은 회사 계약 여러 건 = 1) · 합계 줄은 회사 단위로 중복 제거 · 대시보드 필터(서비스·산업군) 적용
   · 대시보드 «당월 신규/해지» 타일 · 해지 분석 · 해지율 · 고객사 증감 화면과 같은 규칙 */
export var NC_YEAR=null;
export function ncRows(list, kind, lb, s, e){                         // kind 'new'|'lost' · lb 서비스 코드('' = 전체) · [s,e] 월 인덱스
  var out=[];
  list.forEach(function(k){
    var r=ST.DATA.rows[k]; if(r.parent || r.noCount || String(r.saleType||'')==='H/W') return; if(lb && r.line!==lb) return;
    var st=String(r.status||'');
    if(kind==='new'){ if(st==='통합과금') return; if(r.startIdx!=null && r.startIdx>=0 && r.startIdx>=s && r.startIdx<=e) out.push(k); }
    else { if(st!=='해지') return; if(r.line==='S1' && String(r.saleType||'')==='CND') return; var x=r.endIdx!=null? r.endIdx : r._l; if(x!=null && x>=s && x<=e) out.push(k); }
  });
  return out;
}
export function ncCust(ks){ var u={}; ks.forEach(function(k){ u[ST.DATA.rows[k].cust]=1; }); return Object.keys(u).length; }
export function renderNcWidget(list){
  list=list||idxs();
  var t=$('#tNc'); if(!t) return;
  var years={}; for(var i=0;i<ST.M;i++) years[yOf(i)]=1;
  var ys=Object.keys(years).map(Number).sort(), nowI=STATE.base;
  if(NC_YEAR==null) NC_YEAR=yOf(STATE.base);
  var seg=$('#segNcYear');
  if(seg && !seg._built){ seg._built=1; ys.forEach(function(y){ if(y>yOf(Math.min(ST.DATA.nowIdx>=0?ST.DATA.nowIdx:ST.M-1,ST.M-1))) return; var b2=document.createElement('button'); b2.textContent=String(y); b2.dataset.y=String(y); b2.onclick=function(){ NC_YEAR=+this.dataset.y; renderNcWidget(); }; seg.appendChild(b2); }); }
  if(seg) seg.querySelectorAll('button').forEach(function(b2){ b2.setAttribute('aria-pressed', +b2.dataset.y===NC_YEAR?'true':'false'); });
  segScrollSel(seg);
  var Y=NC_YEAR, lines=ST.DATA.lines.map(function(l){return l.label;}).filter(function(lb){return STATE.lines[lb];});
  function idxOf(y,m){ return (y-2020)*12+(m-6); }
  function cnt(kind,lb,y,m){ var j=idxOf(y,m); if(j<0||j>=ST.M) return 0; return ncCust(ncRows(list,kind,lb,j,j)); }
  function yearCnt(kind,lb,y){ var s0=Math.max(0,idxOf(y,1)), e0=Math.min(ST.M-1,idxOf(y,12)); if(e0<s0) return 0; return ncCust(ncRows(list,kind,lb,s0,e0)); }
  var h='<thead><tr><th>구분</th>'; for(var m=1;m<=12;m++) h+=tpl`<th class="n">${rawHtml(m)}월</th>`;
  h+='<th class="n" style="border-left:1px solid var(--ring)">연 합계</th><th class="n">전년</th><th class="n">전년비</th></tr></thead><tbody>';
  function row(kind,label,lb,strong,color){
    var tds='', anyV=false;
    for(var m=1;m<=12;m++){ var j=idxOf(Y,m), v=cnt(kind,lb,Y,m); if(v) anyV=true;
      tds+=tpl`<td class="n ncc"${rawHtml(j>nowI?' style="color:var(--muted)"':'')} data-k="${rawHtml(kind)}" data-l="${lb||''}" data-m="${rawHtml(m)}" title="클릭: ${rawHtml(Y)}년 ${rawHtml(m)}월 ${kind==='new'?'신규':'해지'} 명단">${rawHtml(v? tpl`<b style="color:${rawHtml(color)}">${rawHtml(v)}</b>`:'<span style="color:var(--muted)">·</span>')}</td>`; }
    var sum=yearCnt(kind,lb,Y), prev=yearCnt(kind,lb,Y-1), yoy=prev? (sum-prev)/prev*100 : null;
    if(!anyV && !sum && !prev && !strong) return '';
    return tpl`<tr${rawHtml(strong?' style="font-weight:700;border-top:2px solid var(--axis);background:var(--surface-2)"':'')}><td>${label}</td>${rawHtml(tds)}`+
      tpl`<td class="n ncc" data-k="${rawHtml(kind)}" data-l="${lb||''}" data-m="0" style="border-left:1px solid var(--ring);font-weight:650" title="클릭: ${rawHtml(Y)}년 전체 명단">${rawHtml(sum? tpl`<b>${rawHtml(sum)}</b>`:'·')}</td><td class="n" style="color:var(--muted)">${rawHtml(prev||'·')}</td>`+
      tpl`<td class="n ${yoy==null?'':(kind==='new'? (yoy>=0?'up':'down') : (yoy<=0?'up':'down'))}">${rawHtml(yoy==null?'—':(yoy>=0?'+':'')+yoy.toFixed(0)+'%')}</td></tr>`;
  }
  h+='<tr><td colspan="16" style="background:var(--surface-2);font-weight:700;color:var(--ok,#2e7d32)">＋ 신규 고객사</td></tr>';
  lines.forEach(function(lb){ h+=row('new', lline(lb), lb, false, 'var(--ok,#2e7d32)'); });
  h+=row('new','신규 합계 (회사 단위)','',true,'var(--ok,#2e7d32)');
  h+='<tr><td colspan="16" style="background:var(--surface-2);font-weight:700;color:var(--critical)">－ 해지 고객사</td></tr>';
  lines.forEach(function(lb){ h+=row('lost', lline(lb), lb, false, 'var(--critical)'); });
  h+=row('lost','해지 합계 (회사 단위)','',true,'var(--critical)');
  // 순증
  var nets='', nsum=0, psum=0;
  for(var m3=1;m3<=12;m3++){ var j3=idxOf(Y,m3), n3=cnt('new','',Y,m3)-cnt('lost','',Y,m3); nsum+=n3;
    nets+=tpl`<td class="n ncc" data-k="net" data-l="" data-m="${rawHtml(m3)}" title="클릭: ${rawHtml(Y)}년 ${rawHtml(m3)}월 신규·해지 명단"${rawHtml(j3>nowI?' style="color:var(--muted)"':'')}>${rawHtml(n3? tpl`<b style="color:${n3>0?'var(--ok,#2e7d32)':'var(--critical)'}">${n3>0?'+':''}${rawHtml(n3)}</b>`:'<span style="color:var(--muted)">·</span>')}</td>`; }
  psum=yearCnt('new','',Y-1)-yearCnt('lost','',Y-1); nsum=yearCnt('new','',Y)-yearCnt('lost','',Y);
  h+=tpl`<tr style="font-weight:700;border-top:2px solid var(--axis)"><td>순증 (신규 − 해지)</td>${rawHtml(nets)}<td class="n ncc" data-k="net" data-l="" data-m="0" style="border-left:1px solid var(--ring)" title="클릭: ${rawHtml(Y)}년 신규·해지 명단"><b>${nsum>0?'+':''}${rawHtml(nsum)}</b></td><td class="n" style="color:var(--muted)">${psum>0?'+':''}${rawHtml(psum)}</td><td class="n"></td></tr>`;
  h+='</tbody>';
  t.innerHTML=h;
  var cap=$('#capNc'); if(cap) cap.textContent=Y+'년 · 셀 = 그 달 고객사 수(회사 단위) · 신규 = 그 달 시작한 원계약의 고객사(기존 고객의 다른 서비스·재계약 포함 — 첫 계약만 세는 «고객사 증감»의 신규보다 많을 수 있음) · 해지 = 상태 «해지» 해지월(CND 전환 고객 제외) · 미래 월은 계약상 예정(회색) · 셀을 누르면 명단';
  t.querySelectorAll('td.ncc').forEach(function(td){
    td.onclick=function(){
      var kind=td.dataset.k, lb=td.dataset.l, m=+td.dataset.m, s0, e0, lab;
      if(m){ s0=e0=idxOf(Y,m); lab=Y+'년 '+m+'월'; } else { s0=Math.max(0,idxOf(Y,1)); e0=Math.min(ST.M-1,idxOf(Y,12)); lab=Y+'년'; }
      var kinds=kind==='net'? ['new','lost'] : [kind], rows=[], nN=0, nL=0;
      kinds.forEach(function(kd){ var ks=ncRows(list,kd,lb,s0,e0), isL=kd==='lost'; if(isL) nL=ncCust(ks); else nN=ncCust(ks);
        ks.forEach(function(k){ var r=ST.DATA.rows[k], x=r.endIdx!=null? r.endIdx : r._l, a=isL? (ST.MAT[k][x]||ST.MAT[k][Math.max(x-1,0)]||r.mrr||0) : (r.mrr||0);
          rows.push({_cust:r.cust, c:[isL?'<b style="color:var(--critical)">해지</b>':'<b style="color:var(--ok,#2e7d32)">신규</b>'].concat(kxBase(r), [esc(r.saleType||''), isL? esc(r.churn||''):'', won(a)]), s:(isL? x : r.startIdx), o:isL?1:0}); }); });
      if(!rows.length){ toast('해당 건이 없습니다',''); return; }
      rows.sort(function(x,y){ return x.o-y.o || x.s-y.s || x._cust.localeCompare(y._cust,'ko'); });
      var ttl= kind==='net'? lab+' 순증 '+(nN-nL>0?'+':'')+(nN-nL)+' = 신규 '+nN+' − 해지 '+nL : lab+' '+(lb? lline(lb)+' ':'')+(kind==='lost'?'해지':'신규')+' '+(kind==='lost'?nL:nN)+'곳 ('+rows.length+'건)';
      kpiTable(ttl, '신규 = 원계약 시작월 기준(부속·CN전환 제외) · 해지 = 상태 «해지» 원계약 해지월 기준(CND 제외) · 월액 = 신규는 계약 MRR, 해지는 직전 월 매출 · 대시보드 필터 적용 · 행을 누르면 계약 화면',
        [{l:'구분'}].concat(KX_H6, [{l:'판매형태'},{l:'해지 사유'},{l:'월액(천원)',n:true}]), rows, (kind==='net'?'순증_':kind==='lost'?'해지_':'신규_')+lab);
    };
  });
}

/* ---- 만료 예정 ---- */
export function renderExpiring(list){
  list=list||idxs();
  var b=STATE.base, mm=STATE.expM;
  var rows=list.filter(function(k){
    var r=ST.DATA.rows[k];
    if(r.parent || r.noCount || String(r.saleType||'')==='H/W') return false;               // 대시보드 «N개월 내 만료» 타일과 같은 기준 (부속·고객수 제외 행·H/W 제외)
    if(/해지|종료|CN전환/.test(statusOf(r)+' '+String(r.status||''))) return false;
    return r.endIdx!=null && r.endIdx>=b && r.endIdx<=b+mm-1;
  }).sort(function(a,b2){ return ST.DATA.rows[a].endIdx-ST.DATA.rows[b2].endIdx || (ST.MAT[b2][Math.min(ST.DATA.rows[b2].endIdx,ST.M-1)]-ST.MAT[a][Math.min(ST.DATA.rows[a].endIdx,ST.M-1)]); });

  var amt=rows.reduce(function(s,k){ var r=ST.DATA.rows[k]; return s+(ST.MAT[k][Math.min(r.endIdx,ST.M-1)]||r.mrr||0); },0);
  $('#capExp').textContent = mk(b)+' 이후 '+mm+'개월 내 만료 '+rows.length+'건 · 해당 MRR 합계 '+won(amt)+'천원 · 원계약 기준(부속 계약은 원계약과 함께 만료) · 위 타일과 같은 수';

  var t=$('#tExp');
  t.innerHTML=tpl`<thead><tr><th>만료월</th><th>남은 개월</th><th>서비스</th><th>산업군</th><th>고객사</th><th>파트너</th>`+
    tpl`<th>계약구분</th><th>상태</th><th class="n">월 MRR(천원)</th><th class="n">총 계약액(천원)</th></tr></thead><tbody>`+ tpl`${rawHtml(rows.length? rows.map(function(k){
      var r=ST.DATA.rows[k]; var left=r.endIdx-b;
      var mrr=ST.MAT[k][Math.min(r.endIdx,ST.M-1)]||r.mrr||0;
      var cls = left<=1? 'b-churn' : left<=3? 'b-warn' : 'b-end';
      return tpl`<tr><td>${mk(r.endIdx)}</td><td><span class="badge ${rawHtml(cls)}">${rawHtml(left)}개월</span></td>`+
        tpl`<td>${lline(r.line)}</td><td>${r.ind}</td><td><b>${r.cust}</b></td><td>${r.partner}</td>`+
        tpl`<td>${r.ctype||'-'}</td><td>${rawHtml(statusBadge(r))}</td>`+
        tpl`<td class="n">${won(mrr)}</td><td class="n">${won(r.total)}</td></tr>`;
    }).join('') : '<tr><td colspan="10" class="mini" style="padding:16px">해당 기간에 만료되는 계약이 없습니다.</td></tr>')}`+ tpl`</tbody>`;
}
export function statusBadge(r){
  var s=statusOf(r);
  var c = s==='신규'?'b-new' : s==='재약정'?'b-re' : s==='해지'?'b-churn' : 'b-end';
  return tpl`<span class="badge ${rawHtml(c)}">${s}</span>${rawHtml(r.churn? tpl` <span class="mini">${r.churn}</span>`:'')}`;
}

/* ---- 전체 계약 목록 ---- */
export var ALL_COLS=[
  {k:'line',t:'라인'},{k:'ind',t:'산업군'},{k:'cust',t:'고객사'},{k:'partner',t:'파트너'},
  {k:'ctype',t:'계약구분'},{k:'_status',t:'상태'},{k:'_start',t:'시작',n:1},{k:'_end',t:'종료',n:1},
  {k:'term',t:'개월',n:1},{k:'mrr',t:'월 MRR(천원)',n:1},{k:'total',t:'총 계약액(천원)',n:1},{k:'sum',t:'누적 인식(천원)',n:1}
];
export function renderAllTable(list){
  list=list||idxs();
  var s=STATE.sortAll;
  var rows=list.slice().sort(function(a,b){
    var ra=ST.DATA.rows[a], rb=ST.DATA.rows[b];
    var va=sortVal(ra,s.k), vb=sortVal(rb,s.k);
    if(va<vb) return -s.d; if(va>vb) return s.d; return 0;
  }).slice(0,600);
  var t=$('#tAll');
  var head=tpl`<thead><tr>${rawHtml(ALL_COLS.map(function(c){
    var on = s.k===c.k;
    return tpl`<th class="${c.n?'n':''}" data-k="${rawHtml(c.k)}" style="cursor:pointer">${rawHtml(c.t)}${on?(s.d>0?' ▲':' ▼'):''}</th>`;
  }).join(''))}`+ tpl`</tr></thead>`;
  var body=tpl`<tbody>${rawHtml(rows.map(function(k){
    var r=ST.DATA.rows[k];
    return tpl`<tr>`+
      tpl`<td>${lline(r.line)}</td><td>${r.ind}</td><td><b>${r.cust}</b>${rawHtml(r.csm?tpl` <span class="mini">${r.csm}</span>`:'')}</td>`+
      tpl`<td>${r.partner}</td><td>${r.ctype||'-'}</td><td>${rawHtml(statusBadge(r))}</td>`+
      tpl`<td class="n">${r.startIdx!=null?mk(r.startIdx):'-'}</td><td class="n">${r.endIdx!=null?mk(r.endIdx):'-'}</td>`+
      tpl`<td class="n">${rawHtml(r.term||'-')}</td><td class="n">${won(r.mrr)}</td><td class="n">${won(r.total)}</td><td class="n">${won(r.sum)}</td></tr>`;
  }).join(''))}`+ tpl`</tbody>`;
  t.innerHTML=head+body;
  $('#capAll').textContent='필터 조건 '+list.length.toLocaleString('ko-KR')+'건'+(list.length>600?' (상위 600건 표시)':'')+' · 열 제목을 눌러 정렬';
  t.querySelectorAll('th').forEach(function(th){
    th.onclick=function(){
      var k=th.dataset.k; if(!k)return;
      if(STATE.sortAll.k===k) STATE.sortAll.d*=-1; else STATE.sortAll={k:k,d:-1};
      renderAllTable(list);
    };
  });
}
export function sortVal(r,k){
  if(k==='_status') return statusOf(r);
  if(k==='_start') return r.startIdx==null?-1:r.startIdx;
  if(k==='_end') return r.endIdx==null?-1:r.endIdx;
  var v=r[k]; return typeof v==='number'? v : String(v||'');
}