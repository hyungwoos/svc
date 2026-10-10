/* ===== grid.js — 뒤로가기 · 콤보 입력 · 열 보이기 · 열 필터 · 데이터 그리드 렌더 =====
   ES 모듈(㊿+153) — 다른 파일의 이름은 아래 import 로만 씀 · 이 파일의 최상위 var/function 은 전부 export · 즉시 실행 문장은 js/init.js 의 start() 에 */
import { APP_VER, ST } from './state.js';
import { Viz } from './viz.js';
import { $, amtGuard, amtHint, canView, cssv, esc, kwToWon, lline, mk, navText, permEnter, rawHtml, STATE, tpl, won, wonFull, wonKo, wonToKw } from './core.js';
import { cmdAskHit, dIdx, EQB, EQUIP_VIEWS, ico, idxDate, loadFromDb, onData, railSync, renderEqBoard, sbTry, sbWrite, toast, todayStr } from './shell.js';
import { buildControls, renderAll } from './dash.js';
import { GRIDS } from './grids.js';
import { eqRetOpen, eqWant, renderEqPanel, syncOrderAssets } from './equipment.js';
import { AK, BZX, CH_DEFS, ctOrig, DC, ensureLeadSrc, liveCalc, liveDiff, loadLib, LS, LV, renderChannelView, setLiveSrc } from './analysis.js';
import { applyDense, PR, pushRecent, renderTodo } from './tools.js';
import { CL, renderCloud } from './cloud.js';
import { inbLast, loadInbound, renderInbPanel, renderInbStat, renderWeekly } from './inbound.js';
import { CHURN, CR, CS, csSetTab, ensureGroupOpen, helpBox, helpWire, initOiForm, loadRecvPresets, oiLinkQuote, oiToContract, renderChurn,
  renderChurnRate, renderCsite, renderCustFlow, renderOiTiles, wzReset } from './sales.js';
import { logChange, monthRows, msg, openOvl } from './edit.js';
import { lazyGet, lazyView } from './lazy.js';
import { closeAnswer } from './ai.js';
import { HOME, homeModeSet } from './home.js';


/* ---- 뒤로가기 — 화면 이동을 브라우저 히스토리에 남겨 상단 ← 버튼·브라우저/폰 뒤로가기·Alt+← 가 모두 이전 화면으로 ----
   주소 해시(#oi 처럼)에 현재 화면을 적어 두므로 새로고침·링크 공유 때도 그 화면이 열립니다. */
export var NAV={i:0, pop:false, ready:false};
export function navValid(v){ return v==='dash' || !!document.querySelector('#side button[data-v="'+v+'"]'); }
export function navDepth(){ try{ return (history.state && typeof history.state.i==='number')? history.state.i : 0; }catch(e){ return 0; } }
export function navRecord(prev, v){
  if(NAV.pop || prev===v) return;
  try{
    if(NAV.ready){ NAV.i++; history.pushState({v:v, i:NAV.i}, '', location.pathname+location.search+'#'+v); }
    else history.replaceState({v:v, i:0}, '', location.pathname+location.search+(v==='dash'?'':'#'+v));
  }catch(e){}
  btnBackSync();
}
export function btnBackSync(){ var b=document.getElementById('btnBack'); if(!b) return; b.style.display=(navDepth()>0 || (ST.CUR_VIEW && ST.CUR_VIEW!=='dash'))? 'inline-flex':'none'; }
export function goBack(){
  if(navDepth()>0){ history.back(); return; }           // 이 포탈 안에서 쌓인 이동만 되돌림 (포탈 밖으로 나가지 않음) · popstate 가 화면을 바꿈
  if(ST.CUR_VIEW!=='dash') switchView('dash');
}


/* ---- ㊿+145: 메뉴를 눌러 들어가면 그 메뉴의 «첫 화면» ----
   · 사이드 메뉴 · 레일 · 모바일 탭 · Ctrl+K 메뉴 · 대시보드 바로가기 → navMenu(v): 그 화면의 탭 · 검색 · 펼침 · 기간 고르기를 처음 값으로, 스크롤은 맨 위
   · 뒤로가기(← · 브라우저 · Alt+←)와 대시보드 숫자·카드를 눌러 «그 조건으로» 들어가는 이동은 switchView 그대로(이어서 보기)
   · 처음 값 = 파일을 읽은 직후의 상태 객체 사본(viewSnapInit · init.js). 이 브라우저에 저장하는 «설정»(LIVE 판정 기준 · 통화 · 만기 개월 · 글자 크기 등)은 그대로 둠
   · 배포·운영의 «운영/스테이징» 대상과 올릴 파일 목록은 되돌리지 않음(안전 — 고른 대상이 몰래 바뀌면 안 됨)
   · 화면에 새 상태를 더하면 VIEW_UI 에 «화면: {객체: [키…]}» 한 줄 */
export var VIEW_UI={
  live:{LV:['T','diff']}, churn:{CHURN:['f','t','q','fil','sk','sd','inclRenew']},
  churnrate:{CR:['unit','base','cnd','rows','exDen','sup','from','upto','open','f','adv']}, custflow:{CR:['unit','base','cnd','rows','exDen','sup','from','upto','open','f']},
  leadsrc:{LS:['base','line','pick']}, dcheck:{DC:['open','sev']}, eqboard:{EQB:['ch','q','more','only']},
  price:{PR:['seg','ver','op','q','basis']}, cloud:{CL:['mode','sel','months','mon']}, aiknow:{AK:['log','q']},
  biz:{BZX:['showEq','showSkip','showRuled']}, report:{RPV:['tab']}, csite:{CS:['tab']},
  ops:{OPS:['tab','msg','msgCls']}, adminx:{CD:['kind','showOff'], AP:['user'], ADM:['tab']}
};
export var VIEW_SNAP=null;
/* VIEW_UI 의 상태 객체 이름 → 객체 (㊿+154: 예전 window[이름] — 모듈 이름은 window 에 없음) · 처음 열 때 받는 모듈(리포트·관리자) 것은 받은 뒤에만 */
export function viewObj(n){
  var M={LV:LV, CHURN:CHURN, CR:CR, LS:LS, DC:DC, EQB:EQB, PR:PR, CL:CL, AK:AK, BZX:BZX, CS:CS};
  if(Object.prototype.hasOwnProperty.call(M, n)) return M[n];
  var lz=n==='RPV'? lazyGet('report') : /^(OPS|CD|AP|ADM)$/.test(n)? lazyGet('admin') : null;
  return lz? lz[n] : null;
}
export function viewSnapInit(){ VIEW_SNAP={}; viewSnapAdd(); }
/* ㊿+153: 처음 열 때 불러오는 화면(리포트·관리자·가격표)의 상태 객체는 그 코드를 받은 직후에 사본(lazyHook · init.js) — 아직 없는 것은 건너뜀 */
export function viewSnapAdd(){
  if(!VIEW_SNAP) return;
  Object.keys(VIEW_UI).forEach(function(v){ Object.keys(VIEW_UI[v]).forEach(function(n){
    var o=viewObj(n); if(!o || VIEW_SNAP[n]) return; var s={}, un=[];
    VIEW_UI[v][n].forEach(function(k){ if(o[k]===undefined) un.push(k); else s[k]=o[k]; });
    VIEW_SNAP[n]={json:JSON.stringify(s), undef:un};   // 처음에 없던 키는 되돌릴 때 지움
  }); });
}
export function viewReset(v){
  if(!VIEW_SNAP) return;
  var m=VIEW_UI[v]; if(m) Object.keys(m).forEach(function(n){
    var o=viewObj(n), sn=VIEW_SNAP[n]; if(!o || !sn) return; var s=JSON.parse(sn.json);
    m[n].forEach(function(k){ if(sn.undef.indexOf(k)>=0) delete o[k]; else o[k]=s[k]; });
  });
  if(v==='churn') delete CHURN._focus;
  if(v==='churnrate' || v==='custflow'){ delete CR.crCnd; delete CR.cfCnd; delete CR.cfSrc; }
  /* 화면 HTML 에 그대로 남는 입력칸(다시 그리지 않는 곳) */
  var clr={eqboard:'eqbQ', adminx:'axQ', csite:'csHistQ'}[v]; if(clr){ var q=document.getElementById(clr); if(q) q.value=''; }
  if(v==='dash'){ dashResetIfChanged(); try{ if(HOME.mode) homeModeSet('', true); }catch(e){} }   /* ㊿+171 홈 메뉴로 들어오면 AI 홈(사업 분석 · 전체 할 일 · 최근 작업에서 나옴) */
}
/* 대시보드: 위쪽 거르기(사업라인 · 기준월 · 단위 · 업종 · 파트너 · 상태 · 검색)가 처음과 다를 때만 «초기화»와 같은 동작 */
export function dashResetIfChanged(){
  if(!ST.DATA || ST.IS_EQUIP) return;
  var off=(ST.DATA.lines||[]).some(function(l){ return STATE.lines[l.label]===false; });
  var base0=(ST.DASH_BASE0!=null)? ST.DASH_BASE0 : STATE.base;
  if(!off && STATE.unit==='month' && STATE.base===base0 && !STATE.ind && !STATE.partner && !STATE.status && !STATE.search) return;
  STATE.base=base0; var b=document.getElementById('btnReset');
  if(b && b.onclick) b.onclick.call(b); else { try{ buildControls(); renderAll(); }catch(e){} }
}
export function navMenu(v){
  try{ viewReset(v); }catch(e){}
  delete DVMEM[v];
  switchView(v);
  try{ window.scrollTo(0, 0); }catch(e){}
  if(v==='csite') try{ csSetTab('create'); }catch(e){}
}

/* Backspace = 뒤로가기 — 글자를 입력하는 칸(input·textarea·select·편집 가능 영역)에 커서가 있을 때는 그대로 글자 지우기 */

export function switchView(v){
  if(v==='mdrpoc') v='mdrops';                       // 통합 전 이름 호환
  if((v==='ordernew'||v==='mdrnew'||v==='oinew'||v==='csite'||v==='preport'||v==='s1'||v==='kk') && !ST.SB_TOKEN){ openOvl('ovlAuth'); return; }
  if(ST.IS_EQUIP && !EQUIP_VIEWS[v]) v=ST.EQUIP_HOME||'orders';   // 제한 계정은 허용된 화면만
  if(v==='log' && !ST.IS_SUPER) v='dash';                             // 변경 이력은 슈퍼 관리자만
  if(v==='ops' && !ST.IS_SUPER) v='dash';                             // 배포·운영도 슈퍼 관리자만 (함수가 다시 OPS_OWNER 로 좁힘)
  if(v==='csite' && !ST.IS_SUPER){ toast('권한 없음','Cloud 사이트 생성·수정은 슈퍼 관리자만 할 수 있습니다','info'); v='dash'; }
  if(!canView(v)){ toast('권한 없음','이 메뉴는 보기 권한이 없습니다 — 슈퍼 관리자에게 요청하세요','info'); v='dash'; }
  permEnter(v);
  try{ navRecord(ST.CUR_VIEW, v); }catch(e){}
  if(GRIDS[ST.CUR_VIEW] && ST.CUR_VIEW!==v && !GRIDS[ST.CUR_VIEW].custom){ try{ DVMEM[ST.CUR_VIEW]=dvSnap(); }catch(e){} }   /* ㊿+169 떠나는 목록의 상태 */
  if(ST.CUR_VIEW==='dash' && v!=='dash'){ try{ closeAnswer(); }catch(e){} }   /* ㊿+159 홈을 떠나면 AI 답변 닫기 (생각 중이면 그대로) */
  ST.CUR_VIEW=v;
  try{ document.body.dataset.view=v; document.body.dataset.ct=(/^(contracts|live|churn|renew)$/.test(v) || CH_DEFS[v])? '1':''; }catch(e){}   /* ㊿+169 화면에 맞는 도구만(위젯 = 홈) · ㊿+171 «계약 입력·수정»은 계약 관련 화면에서만(data-ct) */
  try{ pushRecent(v); }catch(e){}
  $('#side').querySelectorAll('button').forEach(function(b){
    b.setAttribute('aria-current', b.dataset.v===v?'true':'false');
  });
  try{ ensureGroupOpen(v); }catch(e){}
  try{ railSync(v); }catch(e){}
  var eqb=v==='eqboard';
  $('#viewEqBoard').classList.toggle('hidden',!eqb);
  var dash=v==='dash', quote=v==='quote', preport=v==='preport', s1v=v==='s1', kkv=v==='kk', onew=v==='ordernew', acct=v==='account', mnew=v==='mdrnew', oinew=v==='oinew', csite=v==='csite';
  var adminx=v==='adminx', weekly=v==='weekly', inbstat=v==='inbstat', price=v==='price', report=v==='report', churn=v==='churn', cloud=v==='cloud', crate=v==='churnrate', cflow=v==='custflow', ops=v==='ops';
  if(adminx && !ST.IS_SUPER){ v='dash'; dash=true; adminx=false; ST.CUR_VIEW='dash'; }
  $('#viewChurnRate').classList.toggle('hidden',!crate);
  $('#viewCustFlow').classList.toggle('hidden',!cflow);
  var chv=CH_DEFS[v]||null;
  $('#viewReport').classList.toggle('hidden',!report);
  $('#viewChurn').classList.toggle('hidden',!churn);
  $('#viewPrice').classList.toggle('hidden',!price);
  $('#viewCloud').classList.toggle('hidden',!cloud);
  $('#viewInb').classList.toggle('hidden',!inbstat);
  $('#viewDash').classList.toggle('hidden',!dash);
  $('#viewQuote').classList.toggle('hidden',!quote);
  $('#viewPreport').classList.toggle('hidden',!preport);
  $('#viewS1').classList.toggle('hidden',!s1v);
  $('#viewKk').classList.toggle('hidden',!kkv);
  $('#viewOrderNew').classList.toggle('hidden',!onew);
  $('#viewMdrNew').classList.toggle('hidden',!mnew);
  $('#viewCsite').classList.toggle('hidden',!csite);
  $('#viewOiNew').classList.toggle('hidden',!oinew);
  $('#viewAccount').classList.toggle('hidden',!acct);
  $('#viewAdmin').classList.toggle('hidden',!adminx);
  $('#viewOps').classList.toggle('hidden',!ops);
  $('#viewWeekly').classList.toggle('hidden',!weekly);
  $('#viewChannel').classList.toggle('hidden',!chv);
  $('#viewData').classList.toggle('hidden',dash||quote||preport||s1v||kkv||onew||mnew||oinew||csite||acct||adminx||ops||weekly||inbstat||price||report||churn||cloud||crate||cflow||eqb||!!chv);
  if(eqb){ renderEqBoard(); return; }
  if(ops){ lazyView('admin','viewOps','renderOps'); return; }
  if(csite){ renderCsite(); return; }
  if(report){ lazyView('report','viewReport','renderReport'); return; }
  if(churn){ renderChurn(); return; }
  if(crate){ renderChurnRate(); return; }
  if(cflow){ renderCustFlow(); return; }
  if(price){ lazyView('price','viewPrice','renderPrice'); return; }
  if(cloud){ renderCloud(); return; }
  if(inbstat){ renderInbStat(); return; }
  if(weekly){ renderWeekly(); return; }
  if(adminx){ lazyView('admin','viewAdmin','renderAdmin'); return; }
  if(chv){ renderChannelView(v); return; }
  if(acct){ lazyView('admin','viewAccount','renderAccount'); return; }
  if(onew){
    try{ wzReset('od'); }catch(e){}
    msg('odMsg','');
    $('#odFormWrap').style.display='';
    $('#odDone').style.display='none';
    loadRecvPresets();
    setTimeout(function(){ $('#odCustomer').focus(); },50);
    return;
  }
  if(oinew){
    try{ wzReset('oi'); }catch(e){}
    msg('oiMsg','');
    $('#oiFormWrap').style.display='';
    $('#oiDone').style.display='none';
    initOiForm();
    setTimeout(function(){ $('#oiCust').focus(); },50);
    return;
  }
  if(mnew){
    try{ wzReset('mp'); }catch(e){}
    msg('mpMsg','');
    $('#mpFormWrap').style.display='';
    $('#mpDone').style.display='none';
    if(!$('#mpDate').value) $('#mpDate').value=todayStr();
    if(!$('#mpSales').value && ST.AUTH_USER) $('#mpSales').value='';
    setTimeout(function(){ $('#mpCompany').focus(); },50);
    return;
  }
  if(kkv){
    var kf=$('#kkFrame');
    if(!kf.src){ kf.src='kk.html?v='+encodeURIComponent(APP_VER); }
    return;
  }
  if(s1v){
    var sf=$('#s1Frame');
    if(!sf.src){ sf.src='s1.html?v='+encodeURIComponent(APP_VER); }
    return;
  }
  if(preport){
    var pf=$('#preportFrame');
    if(!pf.src){ pf.src='report.html?v='+encodeURIComponent(APP_VER); }
    return;
  }
  if(quote){
    var fr=$('#quoteFrame');
    if(!fr.src){ fr.src='quote.html?v='+encodeURIComponent(APP_VER); }   // 포탈 버전을 붙여 옛 견적 화면이 캐시에서 나오는 일을 막음
    else{
      // 메뉴를 다시 누르면 견적 종류(기업/공공)를 다시 고를 수 있게
      try{ fr.contentWindow.postMessage({type:'quoteReset'},'*'); }catch(e){}
    }
    return;
  }
  if(dash){
    try{ renderTodo(); }catch(e){}
    if(ST.DIRTY){ ST.DIRTY=false; loadFromDb().then(onData); }
    return;
  }
  if(v==='aiknow' && !ST.RAWX.aiknow){
    sbTry('ai_knowledge?select=*&order=id').then(function(rows){ ST.RAWX.aiknow=rows||[]; if(ST.CUR_VIEW==='aiknow') renderGrid(); });
  }
  if(v==='leadsrc' || v==='contracts') ensureLeadSrc(function(){ if(ST.CUR_VIEW===v) renderGrid(); });   // load_all 이 lead_src 를 안 주는 버전이면 따로 채움
  if(v==='log' && !ST.RAWX.log){
    sbTry('change_log?select=*&order=id.desc&limit=300').then(function(rows){
      ST.RAWX.log=rows||[]; renderGrid();
    });
  }
  if(v==='inbound' && !ST.RAWX.inbound){
    loadInbound(function(){ if(ST.CUR_VIEW==='inbound') renderGrid(); });
  }
  var mem=(NAV.pop && DVMEM[v])? DVMEM[v] : null;   /* ㊿+169 «뒤로»로 돌아오면 떠날 때 상태 그대로 · 메뉴·다른 화면에서 들어오면 처음부터 */
  if(mem){ DV.page=mem.page; DV.sortK=mem.sortK; DV.sortDir=mem.sortDir; DV.chipVal=mem.chipVal; DV.filters=mem.filters; DV.lens=mem.lens; DV.lensAll=mem.lensAll; DV.pre=mem.pre; }
  else { DV.page=0; DV.sortK=null; DV.sortDir=1; DV.chipVal=''; DV.filters={}; DV.pre=null; }
  closeColFilter();
  var g=GRIDS[v];
  renderOiTiles(v==='oi');
  /* 금액 열(won:1)이 있는 표는 제목 옆에 «천원 단위» 배지를 붙입니다 */
  var hasWon=(g.cols||[]).some(function(c){ return c.won; });
  $('#dvTitle').innerHTML=esc(g.title)+(hasWon? ' <span class="ubadge sm">₩ 금액 단위 = 천원</span>':'');
  dvCapRender(v, g.cap + (hasWon? ' · 금액은 보기·입력 모두 천원 단위':'') + (ST.IS_VIEWER? ' · 조회 전용 계정입니다':''));
  $('#dvAdd').style.display=(g.add && !ST.IS_VIEWER)?'':'none';
  $('#dvPaste').style.display=(g.add && !ST.IS_VIEWER)?'':'none';
  $('#dvSearch').value=mem? mem.q : '';
  renderGrid();
  applyDense();
  if(mem) setTimeout(function(){ try{ window.scrollTo(0, mem.sy); var tw=$('#dvTable').parentElement; if(tw) tw.scrollLeft=mem.sx; }catch(e){} }, 0);
}

export function fmtCell(c,v,r){
  if(c.fmt) return c.fmt(v,r);
  if(v===null||v===undefined||v==='') return '·';
  if(c.t==='month') return String(v).slice(0,7);
  if(c.t==='date') return String(v).slice(0,10);
  if(c.t==='bool') return v? '중복':'·';
  if(c.t==='number') return (c.won? Math.round(Number(v)/1000):Number(v)).toLocaleString('ko-KR');
  return String(v);
}
export function editCell(c,v){
  /* 금액 열(c.won): 표시도 입력도 천원(㊿+157 — 예전엔 입력만 원이라 머리글 «(천원)» 과 어긋났음) · 저장은 원(readRowInputs 가 ×1000) */
  if(c.t==='select'){
    var opts=(typeof c.opts==='function'? c.opts():c.opts).slice();
    if(!c.req && opts.indexOf('')<0) opts.unshift('');              // 비울 수 있게
    var cv=(v==null?'':String(v));
    // 공백만 다른 표기(예: '서비스 종료' vs '서비스종료')는 같은 값으로 취급 → 중복 옵션 방지
    var nz=function(x){ return String(x).replace(/\s+/g,''); };
    var same=opts.filter(function(o){ return nz(o)===nz(cv); })[0];
    if(cv && same!==undefined) cv=same;
    else if(cv && opts.indexOf(cv)<0) opts.splice(1,0,cv);           // 정말 없는 값만 보존
    return tpl`<select data-k="${rawHtml(c.k)}">${rawHtml(opts.map(function(o){
      var lb=(c.k==='line')? lline(o) : (o===''? '— 없음 —' : o);
      return tpl`<option value="${o}"${cv===o?' selected':''}>${lb}</option>`;}).join(''))}`+ tpl`</select>`;
  }
  if(c.t==='list'){
    /* 목록에서 고르거나 직접 입력 — 칸을 누르면(또는 ▾) 값이 이미 있어도 전체 목록이 열립니다 */
    return tpl`<span class="cbo"><input type="text" class="cbi" data-k="${rawHtml(c.k)}" autocomplete="off" value="${v==null?'':String(v)}">`+
           tpl`<button type="button" class="cbb" tabindex="-1" title="목록 열기">▾</button></span>`;
  }
  if(c.t==='bool') return tpl`<input type="checkbox" data-k="${rawHtml(c.k)}"${v?' checked':''}>`;
  var ty=c.t==='month'?'month':c.t==='date'?'date':c.t==='number'?'number':'text';
  var isWon=(c.won && c.t==='number');
  var val=v==null?'':(c.t==='month'?String(v).slice(0,7):c.t==='date'?String(v).slice(0,10):isWon? wonToKw(v):v);
  /* 금액 열은 «천원 단위» — 칸 아래 실시간 환산(amtHint · wireRowInputs) · data-prev = 지금 값(원, 이상 금액 확인용) */
  if(isWon) return tpl`<input type="number" step="any" data-k="${rawHtml(c.k)}" data-won="1" data-prev="${v==null?'':String(v)}" value="${String(val)}" placeholder="천원" title="천원 단위로 입력하세요 (48만원 → 480)">`;
  return tpl`<input type="${rawHtml(ty)}" data-k="${rawHtml(c.k)}" value="${String(val)}">`;
}
/* 편집 행의 입력칸 보조 동작
   · 날짜 칸: 값이 있으면 옆에 ✕(비우기) — 브라우저 날짜 입력은 지우는 법이 잘 안 보입니다
   · 임대 장비: 상태를 «임대중»으로 바꾸면 회수일을 비우고, «회수완료»로 바꾸면 회수일이 비어 있을 때 오늘을 넣습니다 */
/* ===== 목록형 입력칸(콤보) =====
   칸을 누르면 전체 목록이 뜨고, 글자를 치면 그에 맞게 좁혀집니다. 목록에 없는 값도 그대로 입력해 저장할 수 있습니다. */
export var CB={inp:null, off:null};
export function comboClose(){
  var m=document.getElementById('cbMenu'); if(m) m.remove();
  if(CB.off){ document.removeEventListener('mousedown', CB.off, true); CB.off=null; }
  CB.inp=null;
}
/* 열려 있는 목록을 입력칸 아래(또는 위)에 다시 붙입니다 — 표를 스크롤해도 따라다니게 */
export function comboPlace(){
  var m=document.getElementById('cbMenu'), inp=CB.inp;
  if(!m || !inp || !document.body.contains(inp)) return;
  var r=inp.getBoundingClientRect();
  if(r.bottom<0 || r.top>window.innerHeight){ comboClose(); return; }   /* 칸이 화면 밖으로 나가면 닫기 */
  var w=Math.max(r.width+24, 150);
  m.style.width=w+'px';
  m.style.left=Math.max(6, Math.min(r.left, window.innerWidth-w-8))+'px';
  var below=window.innerHeight-r.bottom;
  if(below<180 && r.top>below){ m.style.top=''; m.style.bottom=(window.innerHeight-r.top+4)+'px'; }
  else { m.style.bottom=''; m.style.top=(r.bottom+4)+'px'; }
}
export function comboWire(inp, opts, onPick){
  opts=(opts||[]).map(function(o){ return String(o); });
  var box=inp.closest('.cbo') || inp.parentElement;
  var btn=box? box.querySelector('.cbb') : null;
  function open(filter){
    comboClose();
    var q=String(filter==null? '' : filter).trim().toLowerCase();
    var cur=String(inp.value||'').trim();
    var list=opts.filter(function(o){ return !q || o.toLowerCase().indexOf(q)>=0; });
    var m=document.createElement('div'); m.className='cbmenu'; m.id='cbMenu';
    if(!list.length) m.innerHTML='<div class="hint">목록에 없는 값입니다 — 그대로 입력하면 저장됩니다</div>';
    else m.innerHTML=list.map(function(o){
      return tpl`<div class="it${o===cur?' cur':''}" data-v="${o}">${o}</div>`; }).join('')+
      (cur && opts.indexOf(cur)<0? tpl`<div class="sep"></div><div class="hint">지금 값 「${cur}」 은 목록에 없지만 그대로 저장됩니다</div>`:'')+
      (cur? '<div class="sep"></div><div class="it" data-v="">— 비우기 —</div>':'');
    document.body.appendChild(m);
    CB.inp=inp; comboPlace();
    /* 닫기는 «바깥을 눌렀을 때»만 — 목록의 스크롤바를 눌러도 닫히지 않습니다 */
    if(CB.off) document.removeEventListener('mousedown', CB.off, true);
    CB.off=function(ev){
      var mm=document.getElementById('cbMenu');
      if(!mm){ comboClose(); return; }
      if(mm.contains(ev.target) || ev.target===inp || (btn && (ev.target===btn || btn.contains(ev.target)))) return;
      comboClose();
    };
    document.addEventListener('mousedown', CB.off, true);
    m.addEventListener('mousedown', function(ev){
      /* 스크롤바·빈 곳을 눌러도 입력칸의 포커스를 유지 (항목은 아래에서 따로 처리) */
      if(ev.target===m) ev.preventDefault();
    });
    m.querySelectorAll('.it').forEach(function(it){
      it.onmousedown=function(ev){ ev.preventDefault(); };      /* 값을 넣기 전에 포커스가 빠지지 않게 */
      it.onclick=function(){
        inp.value=it.dataset.v||'';
        inp.dispatchEvent(new Event('input',{bubbles:true}));
        inp.dispatchEvent(new Event('change',{bubbles:true}));
        comboClose(); inp.focus();
        if(typeof onPick==='function') onPick(inp.value);
      };
    });
    var on=m.querySelector('.it.cur'); if(on) on.scrollIntoView({block:'nearest'});
  }
  inp.addEventListener('focus', function(){ open(''); });
  inp.addEventListener('click', function(){ open(''); });
  inp.addEventListener('input', function(){ open(inp.value); });
  /* 탭 등으로 다른 칸으로 옮겨갈 때만 닫습니다 (마우스로 목록을 다루는 중에는 닫지 않음) */
  inp.addEventListener('keydown', function(e){ if(e.key==='Tab') comboClose(); });
  inp.addEventListener('keydown', function(e){
    var m=document.getElementById('cbMenu');
    if(e.key==='Escape'){ comboClose(); return; }
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      if(!m){ open(inp.value); return; }
      e.preventDefault();
      var its=[].slice.call(m.querySelectorAll('.it'));
      if(!its.length) return;
      var i=its.findIndex(function(x){ return x.classList.contains('on'); });
      if(i<0) i=its.findIndex(function(x){ return x.classList.contains('cur'); });
      i=(e.key==='ArrowDown')? Math.min(its.length-1, i+1) : Math.max(0, i-1);
      its.forEach(function(x){ x.classList.remove('on'); });
      its[i].classList.add('on'); its[i].scrollIntoView({block:'nearest'});
      return;
    }
    if(e.key==='Enter' && m){
      var sel=m.querySelector('.it.on');
      if(sel){ e.preventDefault(); sel.click(); }
      else comboClose();
    }
  });
  if(btn) btn.onclick=function(ev){
    ev.preventDefault(); ev.stopPropagation();
    if(document.getElementById('cbMenu')) comboClose();
    else { inp.focus(); open(''); }
  };
}
/* 목록 안에서 굴린 스크롤은 그대로 두고, 화면·표를 스크롤하면 위치만 따라갑니다 (예전에는 닫혔습니다) */


export function wireRowInputs(tr,g){
  /* 목록형(콤보) 칸 연결 — 열 정의의 opts 를 그때그때 읽습니다(계약번호처럼 값이 늘어나는 목록 때문) */
  tr.querySelectorAll('input.cbi[data-k]').forEach(function(inp){
    var c=((g&&g.cols)||[]).filter(function(x){ return x.k===inp.dataset.k; })[0];
    var o=c? (typeof c.opts==='function'? c.opts() : c.opts) : [];
    comboWire(inp, o||[]);
  });
  tr.querySelectorAll('input[type=date],input[type=month]').forEach(function(inp){
    var x=document.createElement('button'); x.type='button'; x.className='dclr'; x.textContent='✕'; x.title='비우기';
    x.onclick=function(){ inp.value=''; inp.dispatchEvent(new Event('change')); };
    inp.insertAdjacentElement('afterend', x);
    var sync=function(){ x.style.display = inp.value? '' : 'none'; };
    inp.addEventListener('input', sync); inp.addEventListener('change', sync); sync();
  });
  tr.querySelectorAll('input[data-won]').forEach(function(inp){ amtHint(inp, null, /^(mrr|monthly_fee)$/.test(inp.dataset.k)); });   /* ㊿+157 «= 48만원» */
  if(g && g.table==='equipment_assets'){
    var st=tr.querySelector('select[data-k="status"]'), rd=tr.querySelector('input[data-k="returned_date"]');
    if(st && rd) st.addEventListener('change', function(){
      if(st.value==='임대중' && rd.value){
        rd.value=''; rd.dispatchEvent(new Event('change'));
        toast('회수일을 비웠습니다','임대중인 장비는 회수일이 없어야 합니다 — 필요하면 다시 입력하세요','info');
      }else if(st.value==='회수완료' && !rd.value){
        rd.value=todayStr(); rd.dispatchEvent(new Event('change'));
      }
    });
  }
}
export function readRowInputs(tr,g){
  var body={};
  tr.querySelectorAll('[data-k]').forEach(function(inp){
    var c=g.cols.filter(function(x){return x.k===inp.dataset.k;})[0];
    if(!c || c.ro || c.k[0]==='_') return;          // 계산 열은 저장하지 않음
    var v;
    if(c.t==='bool') v=inp.checked;
    else if(c.t==='select' && c.num) v=Number(inp.value);
    else if(c.t==='number' && c.won) v=kwToWon(inp.value);           /* 천원 칸 → 원 (㊿+157) */
    else if(c.t==='number') v=inp.value===''? null: Number(inp.value);
    else if(c.t==='month') v=inp.value? inp.value+'-01': null;
    else if(c.t==='date') v=inp.value||null;
    else v=inp.value.trim()||null;
    if(c.req && (v===null||v==='')) throw new Error('「'+c.l+'」 은 필수입니다.');
    body[c.k]=v;
  });
  return body;
}

export var DV={page:0, per:100, sortK:null, sortDir:1, filters:{}};

/* ===== ㊿+169 업무 보기 — 계약·OI 표를 «하는 일»별 열 묶음으로 (사용자: 표 기본 보기 재설계 · 운영/갱신/정산/전체 · 개인 저장)
   · 보기마다 보일 열·순서가 다름 — 열 설정에서 바꾸면 그 보기에만 내 브라우저에 저장(HIDE['contracts@운영']) · «전체»는 예전 열 설정(HIDE['contracts']) 그대로
   · 고른 보기도 기억(svc_wv_계정) · 검색은 숨긴 열까지 전부 봄(예전과 같음) */
export var WORKV={
  contracts:{def:'운영', views:[
    ['운영','지금 계약 — 상태 · 서비스 · 채널 · 노드 · 금액 · 기간', ['_custName','status','line','channel','partner','qty','mrr','start_month','end_month','csm']],
    ['갱신','만기·연장·해지 — 종료월 · 자동연장 · 연장 회차 · 해지 사유', ['_custName','status','line','contract_type','start_month','end_month','auto_renew','renew_count','mrr','churn_reason','churn_month']],
    ['정산','계산서·과금 — 발행처 · 과금방식 · 설치비 · 정산일 · 에스원 계약번호', ['_custName','status','line','channel','biller','billing','mrr','install_fee','settle_month','s1_no']],
    ['전체','모든 열 — 예전 열 설정 그대로', null]]},
  oi:{def:'진행', views:[
    ['진행','진행 관리 — 단계 · 가능성 · 담당 · 계약 예상 · 다음 할 일', ['customer','stage','deal_name','win_prob','owner','expect_month','expect_amount','next_action','next_date']],
    ['전체','모든 열 — 예전 열 설정 그대로', null]]}
};
export function wvKey(){ return 'svc_wv_'+(ST.AUTH_USER||'anon'); }
export function wvAll(){ try{ return JSON.parse(localStorage.getItem(wvKey())||'{}')||{}; }catch(e){ return {}; } }
export function wvCur(v){ v=v||ST.CUR_VIEW; var d=WORKV[v]; if(!d) return null; var k=wvAll()[v]||d.def; return d.views.filter(function(x){ return x[0]===k; })[0]||d.views[0]; }
export function wvSet(v, k){ var a=wvAll(); a[v]=k; try{ localStorage.setItem(wvKey(), JSON.stringify(a)); }catch(e){} }
export function hideView(){ var w=wvCur(); return ST.CUR_VIEW+(w && w[2]? '@'+w[0] : ''); }
/** 지금 보기에서 숨긴 열 — 업무 보기는 사용자가 바꾼 적 없으면 그 보기의 열만 보임 */
export function hidCur(g){
  var hv=hideView(), w=wvCur();
  if(w && w[2] && !HIDE[hv]) return g.cols.filter(function(c){ return w[2].indexOf(c.k)<0; }).map(function(c){ return c.k; });
  return (HIDE[hv]||[]).slice();
}
/** 고정 열(이름 · 상태) — 가로로 밀어도 왼쪽에 남음 */
export function pinCls(g, c){ var i=(g.pin||[]).indexOf(c.k); return i<0? '' : 'pin pin'+(i+1); }
export function pinSync(t){
  var p1=t.querySelector('thead th.pin1'); t.style.setProperty('--pin1w', (p1? p1.offsetWidth : 0)+'px');
}
/* ===== ㊿+169 목록 상태 기억 — 상세·다른 화면에 갔다가 «뒤로»(← · 브라우저 · Alt+←)로 오면 검색·필터·정렬·쪽·스크롤 그대로 ===== */
export var DVMEM={};
export function dvSnap(){
  var w=document.getElementById('dvTable'), wrap=w? w.parentElement : null;
  return {page:DV.page, sortK:DV.sortK, sortDir:DV.sortDir, chipVal:DV.chipVal, filters:JSON.parse(JSON.stringify(DV.filters||{})), lens:DV.lens, lensAll:DV.lensAll, pre:DV.pre||null,
    q:($('#dvSearch')||{}).value||'', sy:window.scrollY||0, sx:wrap? wrap.scrollLeft : 0};
}
/* ===== ㊿+169 홈 알림 → «그 조건으로 걸러진» 목록 (DV.pre — 이름이 붙은 조건 · ✕ 로 해제) ===== */
export function gridGoPre(view, label, fn){
  switchView(view); DV.pre={label:label, fn:fn}; DV.page=0; renderGrid();
}
/** 행 «더보기» 메뉴 — 삭제처럼 드물고 되돌리기 어려운 동작은 여기로 (권한 검사는 부르는 쪽 그대로) */
export function rowMenu(anchor, items){
  var old=document.getElementById('rowMenu'); if(old){ var same=old._a===anchor; old._close(); if(same) return; }
  var m=/** @type {any} */(document.createElement('div')); m.id='rowMenu'; m.className='rmenu'; m.setAttribute('role','menu'); m._a=anchor;
  items.forEach(function(it){ var b=document.createElement('button'); b.type='button'; b.setAttribute('role','menuitem'); b.className=it.danger? 'dz':''; b.innerHTML=(it.ic? ico(it.ic,15):'')+tpl`<span>${it.l}</span>`; if(it.tip) b.title=it.tip;
    b.onclick=function(e){ e.stopPropagation(); close(); it.go(); }; m.appendChild(b); });
  document.body.appendChild(m);
  var r=anchor.getBoundingClientRect(); m.style.top=Math.max(8, Math.min(r.bottom+4, window.innerHeight-m.offsetHeight-8))+'px'; m.style.left=Math.max(8, r.right-m.offsetWidth)+'px';
  anchor.setAttribute('aria-expanded','true');
  function close(){ m.remove(); anchor.setAttribute('aria-expanded','false'); document.removeEventListener('click', out, true); document.removeEventListener('keydown', key, true); }
  m._close=close;
  function out(e){ if(!m.contains(e.target) && e.target!==anchor && !anchor.contains(e.target)) close(); }
  function key(e){ var bs=[].slice.call(m.querySelectorAll('button')), i=bs.indexOf(/** @type {any} */(document.activeElement));
    if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); close(); anchor.focus(); }
    else if(e.key==='ArrowDown'){ e.preventDefault(); bs[(i+1)%bs.length].focus(); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); bs[(i-1+bs.length)%bs.length].focus(); }
    else if(e.key==='Tab'){ close(); } }
  setTimeout(function(){ document.addEventListener('click', out, true); document.addEventListener('keydown', key, true); var f=m.querySelector('button'); if(f) f.focus(); }, 0);
}
/** 상태 글자 → 배지 색(글자도 항상 같이 보임 — 색만으로 구분하지 않음) */
export function stBadge(txt){
  var s=String(txt||'');
  if(/해지|중지|취소|실패|미대응|분실|폐기/.test(s)) return 'crit';
  if(/종료|회수완료|CN전환|이전됨|계산서발행|판매완료/.test(s)) return '';
  if(/회수예정|출하요청|배송중|계약예정|진행|접수|수리중/.test(s)) return 'warn';
  if(/신규|활성|재약정|추가|통합과금|설치완료|임대중|수주|LIVE|대응/.test(s)) return 'ok';
  return 'info';
}

/* ===== ㊿+170 영업·인바운드 빠른 보기 — 내 담당 · 오늘 할 일 · 기한 초과 · 다음 행동 없음 · 장기 미접촉 / 첫 대응 지연
   · 기준(일수 · 내 이름)은 «기준» 버튼에서 바꾸고 내 브라우저에 저장(svc_qv_계정) · 홈 «오늘 처리할 일»도 같은 기준·같은 목록 */
export function qvKey(){ return 'svc_qv_'+(ST.AUTH_USER||'anon'); }
export function qvCfg(){ var d={me:'', oiIdle:30, inbFirst:3, inbIdle:90}; try{ var s=JSON.parse(localStorage.getItem(qvKey())||'{}')||{}; Object.keys(d).forEach(function(k){ if(s[k]!=null && s[k]!=='') d[k]=s[k]; }); }catch(e){} d.oiIdle=+d.oiIdle||30; d.inbFirst=+d.inbFirst||3; d.inbIdle=+d.inbIdle||90; return d; }
export function qvSave(c){ try{ localStorage.setItem(qvKey(), JSON.stringify(c)); }catch(e){} }
/** 진행 중인 OI — 수주·계산서발행·종료·중지·실패가 아닌 것 (OI 타일 · 홈 · 빠른 보기 공통) */
export function oiOpen(r){ return !/수주|계산서|종료|중지|실패/.test(String(r && r.stage || '')); }
export function daysSince(d){ if(!d) return null; var t=new Date(String(d).slice(0,10)).getTime(); return isNaN(t)? null : Math.floor((Date.now()-t)/864e5); }
export function inbIdleHit(r, C){ C=C||qvCfg(); if(String(r.y||'')!==String(new Date().getFullYear()) || r.result!=='진행중') return false; var d=daysSince(inbLast(r)); return d!=null && d>=C.inbIdle; }
export function qvDefs(v){
  var C=qvCfg(), today=todayStr();
  var me=['me','내 담당', C.me? '담당 «'+C.me+'»' : '«기준»에서 내 이름을 고르면 내 담당만', function(r){ return !!C.me && String(r.owner||'').indexOf(C.me)>=0; }];
  if(v==='oi') return [me,
    ['today','오늘 할 일','다음 할 일 예정일이 오늘(진행 중)', function(r){ return oiOpen(r) && String(r.next_date||'').slice(0,10)===today; }],
    ['late','기한 초과','예정일이 지났는데 진행 중', function(r){ return oiOpen(r) && !!r.next_date && String(r.next_date).slice(0,10)<today; }],
    ['nonext','다음 행동 없음','진행 중인데 다음 할 일 또는 예정일이 비어 있음', function(r){ return oiOpen(r) && (!r.next_action || !r.next_date); }],
    ['idle','장기 미접촉', C.oiIdle+'일 넘게 수정 없음(진행 중)', function(r){ var d=daysSince(r.updated_at||r.created_at); return oiOpen(r) && d!=null && d>=C.oiIdle; }]];
  if(v==='inbound') return [me,
    ['first','첫 대응 지연','접수 '+C.inbFirst+'일이 지났는데 1차 대응 기록 없음(진행중)', function(r){ var d=daysSince(r.on_date); return r.result==='진행중' && !r.s1d && d!=null && d>=C.inbFirst; }],
    ['idle','장기 미접촉','올해 진행중인데 마지막 대응이 '+C.inbIdle+'일 이상 — 홈 «인바운드 미대응»과 같은 기준', function(r){ return inbIdleHit(r, C); }],
    ['open','진행중 전체','결과가 «진행중»', function(r){ return r.result==='진행중'; }]];
  return null;
}
export function qvGo(view, key){
  switchView(view);
  var d=(qvDefs(view)||[]).filter(function(x){ return x[0]===key; })[0];
  if(d){ DV.pre={label:d[1]+' — '+d[2], fn:d[3], qv:key}; DV.page=0; renderGrid(); }
}
export function qvBar(g, rows){
  var qb=document.getElementById('dvQvBar'), defs=qvDefs(ST.CUR_VIEW);
  if(!qb){ qb=document.createElement('div'); qb.id='dvQvBar'; qb.className='qv-bar'; var bar=$('#dvSearch').parentElement; bar.parentElement.insertBefore(qb, bar); }
  if(!defs || g.custom){ qb.hidden=true; qb.innerHTML=''; return; }
  qb.hidden=false; var all=g.rows();
  var meOk=!!qvCfg().me;   /* ㊿+171 이름을 고르기 전 «내 담당»은 0 이 아니라 «연결 필요»(누르면 기준 창) */
  qb.innerHTML=tpl`<span class="wv-l">빠른 보기</span>${rawHtml(defs.map(function(d){ var n=all.filter(d[3]).length, on=!!(DV.pre && DV.pre.qv===d[0]), nc=d[0]==='me' && !meOk;
      return tpl`<button type="button" class="chip${n || nc? '':' zero'}${nc? ' need':''}" data-qv="${d[0]}" aria-pressed="${on?'true':'false'}" title="${nc? '담당자 연결 필요 — 눌러서 내 이름(담당자 칸 값) 고르기' : d[2]}">${d[1]} <b class="num">${nc? '연결 필요' : String(n)}</b></button>`; }).join(''))}`+
    tpl`<button type="button" class="cbtn" id="qvCfgBtn" aria-haspopup="dialog" title="빠른 보기 기준 — 내 이름 · 장기 미접촉 일수 · 첫 대응 일수">${rawHtml(ico('gear',14))} 기준</button>`;
  qb.querySelectorAll('[data-qv]').forEach(function(b){ b.onclick=function(){ var k=b.dataset.qv;
    if(k==='me' && !qvCfg().me){ qvCfgOpen(/** @type {any} */(document.getElementById('qvCfgBtn'))); return; }
    if(DV.pre && DV.pre.qv===k){ DV.pre=null; DV.page=0; renderGrid(); } else qvGo(ST.CUR_VIEW, k); }; });
  /** @type {any} */(document.getElementById('qvCfgBtn')).onclick=function(){ qvCfgOpen(this); };
}
export function qvCfgOpen(btn){
  var old=document.getElementById('qvCfg'); if(old){ old.remove(); return; }
  var C=qvCfg(), owners={}; (ST.RAWX.oi||[]).concat(ST.RAWX.inbound||[]).forEach(function(r){ String(r.owner||'').split(/[,/]/).forEach(function(o){ o=o.trim(); if(o) owners[o]=1; }); });
  var m=document.createElement('div'); m.id='qvCfg'; m.className='rmenu qv-cfg'; m.setAttribute('role','dialog'); m.setAttribute('aria-label','빠른 보기 기준');
  m.innerHTML=tpl`<b>빠른 보기 기준</b><label>내 이름(담당자 칸 값)<select id="qvMe"><option value="">— 고르기 —</option>${rawHtml(Object.keys(owners).sort(function(a,b){ return a.localeCompare(b,'ko'); }).map(function(o){ return tpl`<option${rawHtml(o===C.me?' selected':'')}>${o}</option>`; }).join(''))}</select></label>`+
    tpl`<label>OI 장기 미접촉 (일)<input id="qvOi" type="number" min="1" max="365" value="${String(C.oiIdle)}"></label><label>인바운드 첫 대응 지연 (일)<input id="qvIf" type="number" min="1" max="60" value="${String(C.inbFirst)}"></label>`+
    tpl`<label>인바운드 장기 미접촉 (일)<input id="qvIi" type="number" min="7" max="365" value="${String(C.inbIdle)}"></label><div class="pa"><button type="button" class="pill ghost" id="qvX">취소</button><button type="button" class="pill pri" id="qvOk">저장</button></div>`;
  document.body.appendChild(m);
  var r=btn.getBoundingClientRect(); m.style.top=(r.bottom+6)+'px'; m.style.left=Math.max(8, Math.min(r.left, window.innerWidth-m.offsetWidth-8))+'px';
  var close=function(){ m.remove(); document.removeEventListener('keydown', key, true); btn.focus(); };
  var key=function(e){ if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); close(); } };
  document.addEventListener('keydown', key, true);
  /** @type {any} */(m.querySelector('#qvX')).onclick=close;
  /** @type {any} */(m.querySelector('#qvOk')).onclick=function(){ var v=function(id){ return /** @type {any} */(document.getElementById(id)).value; };
    qvSave({me:v('qvMe'), oiIdle:+v('qvOi')||30, inbFirst:+v('qvIf')||3, inbIdle:+v('qvIi')||90}); close(); DV.pre=null; renderGrid(); toast('빠른 보기 기준 저장', '이 브라우저에만 적용 · 홈 «오늘 처리할 일»도 같은 기준', 'info'); };
  setTimeout(function(){ var f=/** @type {any} */(m.querySelector('select')); if(f) f.focus(); }, 0);
}


/* ===== 열 보이기/숨기기 (화면마다 따로 기억) =====
   계약처럼 열이 많은 표에서 지금 보고 싶은 열만 남깁니다. 숨겨도 값은 그대로 있고 검색·엑셀 내려받기에만 빠집니다. */
export var HIDE={};
export function hideKey(){ return 'svc_hidecols_'+(ST.AUTH_USER||'anon'); }
export function loadHide(){ try{ HIDE=JSON.parse(localStorage.getItem(hideKey())||'{}')||{}; }catch(e){ HIDE={}; } }
export function saveHide(){ try{ localStorage.setItem(hideKey(), JSON.stringify(HIDE)); }catch(e){} }
export function hiddenSet(view){ return (HIDE[view]||[]); }
export function visCols(g){
  var h=hidCur(g), w=wvCur();
  var out=g.cols.filter(function(c){ return h.indexOf(c.k)<0; });
  if(!out.length) out=g.cols.slice();      /* 전부 숨기면 아무것도 안 보이니 원래대로 */
  if(w && w[2]){ var ord=w[2]; out=out.map(function(c,i){ return [c,i]; }).sort(function(a,b){ var ia=ord.indexOf(a[0].k), ib=ord.indexOf(b[0].k); return (ia<0? 100+a[1]:ia)-(ib<0? 100+b[1]:ib); }).map(function(x){ return x[0]; }); }
  /* ㊿+169 이름·상태 열은 맨 앞(고정) */
  var pins=(g.pin||[]).map(function(k){ return out.filter(function(c){ return c.k===k; })[0]; }).filter(Boolean);
  if(pins.length) out=pins.concat(out.filter(function(c){ return pins.indexOf(c)<0; }));
  return out;
}
export function openColPick(btn){
  var g=GRIDS[ST.CUR_VIEW]; if(!g||g.custom) return;
  closeColFilter();
  var old=document.getElementById('colPick'); if(old) old.remove();
  var h=hidCur(g), WV=wvCur(), hv=hideView();
  var box=document.createElement('div'); box.id='colPick'; box.className='colmenu';
  box.style.cssText='position:absolute;z-index:80;background:var(--surface);border:1px solid var(--ring);border-radius:12px;'+
    'box-shadow:0 10px 30px rgba(0,0,0,.18);padding:10px;min-width:250px;max-height:60vh;overflow:auto;font-size:12px';
  var r=btn.getBoundingClientRect();
  box.style.left=Math.max(8, Math.min(r.left+window.scrollX, window.innerWidth-280))+'px';
  box.style.top=(r.bottom+window.scrollY+6)+'px';
  var head=document.createElement('div');
  head.style.cssText='display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap';
  head.innerHTML=tpl`<b style="font-size:12px">보일 열 고르기</b><span class="mini" style="color:var(--muted)">${g.cols.length-h.length}/${g.cols.length}</span>`;
  var all=document.createElement('button'); all.className='chip'; all.textContent='전체 보기';
  all.onclick=function(){ HIDE[hv]=[]; saveHide(); box.remove(); renderGrid(); };
  head.appendChild(all);
  if(WV && WV[2]){ var rv=document.createElement('button'); rv.className='chip'; rv.textContent='«'+WV[0]+'» 기본 열로'; rv.title='이 보기에서 바꾼 열 설정을 지우고 기본 열 묶음으로';
    rv.onclick=function(){ delete HIDE[hv]; saveHide(); box.remove(); renderGrid(); }; head.appendChild(rv); }
  /* ㊿+142: 끌어서 바꾼 열 너비가 있으면 한 번에 원래대로 */
  if(Object.keys(colwGet(ST.CUR_VIEW)).length){ var rw=document.createElement('button'); rw.className='chip'; rw.textContent='열 너비 원래대로'; rw.title='머리 칸 경계를 끌어 바꾼 너비를 모두 지웁니다';
    rw.onclick=function(){ box.remove(); colwReset(ST.CUR_VIEW); }; head.appendChild(rw); }
  box.appendChild(head);
  var tip=document.createElement('div'); tip.className='mini'; tip.style.cssText='color:var(--muted);margin:-2px 0 6px'; tip.textContent=(WV? '«'+WV[0]+'» 보기의 열 — 이 보기에만 저장 · ':'')+'열 너비는 머리 칸 오른쪽 경계를 끌어서 바꿉니다';
  box.appendChild(tip);
  g.cols.forEach(function(c){
    var lb=document.createElement('label');
    lb.style.cssText='display:flex;gap:7px;align-items:center;padding:4px 2px;cursor:pointer';
    var cb=document.createElement('input'); cb.type='checkbox'; cb.checked=h.indexOf(c.k)<0; cb.style.width='auto';
    cb.onchange=function(){
      var cur=hidCur(g);
      var i=cur.indexOf(c.k);
      if(cb.checked){ if(i>=0) cur.splice(i,1); } else if(i<0) cur.push(c.k);
      HIDE[hv]=cur; saveHide(); renderGrid();
      head.querySelector('.mini').textContent=(g.cols.length-cur.length)+'/'+g.cols.length;
    };
    lb.appendChild(cb); lb.appendChild(document.createTextNode(c.l));
    box.appendChild(lb);
  });
  document.body.appendChild(box);
  setTimeout(function(){
    document.addEventListener('click', function off(ev){
      if(box.contains(ev.target)||ev.target===btn) return;
      box.remove(); document.removeEventListener('click', off);
    });
  },0);
}

/* ===== 열 필터 (구글시트식 «값 골라 보기») ===== */
export var BLANK_LABEL='(빈 값)';
export function cellText(c,v,r){
  var t;
  /* 계산 열(업종·설치율·경과일 등)은 fmt 가 행 전체를 봐야 값이 나옵니다 —
     행을 넘기지 않으면 모든 행이 «(빈 값)» 으로 잡힙니다 */
  try{ t=fmtCell(c,v,r); }catch(e){ t=v; }
  t=String(t==null?'':t).replace(/<[^>]*>/g,'').trim();
  if(t==='' || t==='·') t=BLANK_LABEL;
  return t;
}
export function filterCount(){ var n=0; for(var k in DV.filters){ if(DV.filters[k]&&DV.filters[k].length) n++; } return n; }
export function clearFilters(){ DV.filters={}; DV.lens=''; DV.pre=null; DV.page=0; renderGrid(); }
/* skipK 열의 필터만 빼고 나머지 조건을 통과하는지 */
export function passFilters(r,g,skipK){
  for(var k in DV.filters){
    if(k===skipK) continue;
    var sel=DV.filters[k]; if(!sel||!sel.length) continue;
    var col=null;
    for(var i=0;i<g.cols.length;i++){ if(g.cols[i].k===k){ col=g.cols[i]; break; } }
    if(!col) continue;
    if(sel.indexOf(cellText(col,r[k],r))<0) return false;
  }
  return true;
}
/* 검색어·칩만 적용한 행 (필터 후보값 계산용) */
export function baseRows(g,skipK){
  var q=($('#dvSearch').value||'').trim().toLowerCase();
  var toks=q? q.split(/\s+/).filter(Boolean):[];
  return g.rows().filter(function(r){
    if(g.chipsField && DV.chipVal && String(r[g.chipsField]||'')!==DV.chipVal) return false;
    if(DV.pre && !DV.pre.fn(r)) return false;
    if(!passFilters(r,g,skipK)) return false;
    if(!toks.length) return true;
    var hay='';
    g.cols.forEach(function(c){
      var v=r[c.k];
      hay+=String(v==null?'':v).replace(/\s+/g,'')+'';
      if(c.fmt){ try{ var f=c.fmt(v,r); hay+=String(f==null?'':f).replace(/\s+/g,'')+''; }catch(e){} }
    });
    hay=hay.toLowerCase();
    return toks.every(function(t){ return hay.indexOf(t.replace(/\s+/g,''))>=0; });
  });
}

export function closeColFilter(){
  var el=document.getElementById('colfPanel');
  if(el) el.remove();
  document.removeEventListener('mousedown',colfOutside,true);
  document.removeEventListener('keydown',colfEsc,true);
}
export function colfOutside(e){
  var el=document.getElementById('colfPanel');
  if(el && !el.contains(e.target)) closeColFilter();
}
export function colfEsc(e){ if(e.key==='Escape') closeColFilter(); }

/* 열의 값 목록을 세어서 범용 패널을 띄운다 */
export function openColFilter(anchor,g,c){
  var rows=baseRows(g,c.k);
  var cnt={}, order=[];
  rows.forEach(function(r){
    var t=cellText(c,r[c.k],r);
    if(cnt[t]===undefined){ cnt[t]=0; order.push(t); }
    cnt[t]++;
  });
  openFilterPanel(anchor,{
    label:c.l, order:order, cnt:cnt, num:(c.t==='number'),
    selected:DV.filters[c.k]||null,
    onApply:function(sel){
      if(sel) DV.filters[c.k]=sel; else delete DV.filters[c.k];
      DV.page=0; renderGrid();
    }
  });
}

/* 범용 «값 골라 보기» 패널 — 계약 그리드와 사업 영역 표가 함께 씁니다
   opt = {label, order:[값], cnt:{값:개수}, num, selected:[]|null, onApply(sel|null)} */
export function openFilterPanel(anchor,opt){
  closeColFilter();
  var order=opt.order.slice(), cnt=opt.cnt||{};
  order.sort(function(a,b){
    if(a===BLANK_LABEL) return 1; if(b===BLANK_LABEL) return -1;
    if(opt.num){ var x=+String(a).replace(/[^0-9.-]/g,''), y=+String(b).replace(/[^0-9.-]/g,'');
      if(!isNaN(x)&&!isNaN(y)&&x!==y) return x-y; }
    return String(a).localeCompare(String(b),'ko');
  });
  var picked={};
  if(opt.selected && opt.selected.length) opt.selected.forEach(function(v){ picked[v]=1; });
  else order.forEach(function(v){ picked[v]=1; });

  var el=document.createElement('div');
  el.className='colf'; el.id='colfPanel';
  el.innerHTML=tpl`<div class="colf-h">${opt.label} — 볼 값 고르기`+
      tpl`<span id="colfCnt" style="float:right;font-weight:600;color:var(--muted)"></span></div>`+
    tpl`<input type="search" id="colfQ" placeholder="값 검색 — 찾은 뒤 「모두」 를 누르면 그것만 선택">`+
    tpl`<div class="colf-list" id="colfList"></div>`+
    tpl`<div class="colf-a">`+
      tpl`<button type="button" id="colfAll" title="검색 중이면 검색 결과만 선택, 아니면 전체 선택">모두</button>`+
      tpl`<button type="button" id="colfNone" title="선택 전부 해제">해제</button>`+
      tpl`<span style="flex:1"></span>`+
      tpl`<button type="button" id="colfCancel">취소</button>`+
      tpl`<button type="button" class="pri" id="colfOk">적용</button>`+
    tpl`</div>`;
  document.body.appendChild(el);

  function paint(){
    var q=(document.getElementById('colfQ').value||'').trim().toLowerCase();
    var list=document.getElementById('colfList');
    var vis=order.filter(function(v){ return !q || String(v).toLowerCase().indexOf(q)>=0; });
    var nsel=0; order.forEach(function(v){ if(picked[v]) nsel++; });
    var hd=document.getElementById('colfCnt');
    if(hd) hd.textContent=nsel+' / '+order.length+' 선택'+(q? ' · 검색 '+vis.length+'개':'');
    if(!vis.length){ list.innerHTML='<div class="cap" style="padding:10px;text-align:center">해당하는 값이 없습니다</div>'; return; }
    list.innerHTML=vis.map(function(v){
      return tpl`<label class="colf-i"><input type="checkbox" data-v="${v}"${picked[v]?' checked':''}>`+
        tpl`<span class="t" title="${v}">${v}</span><span class="n">${rawHtml(cnt[v]||0)}</span></label>`;
    }).join('');
    list.querySelectorAll('input[data-v]').forEach(function(i){
      i.onchange=function(){ if(i.checked) picked[i.dataset.v]=1; else delete picked[i.dataset.v];
        var n=0; order.forEach(function(v){ if(picked[v]) n++; });
        var h2=document.getElementById('colfCnt');
        var q2=(document.getElementById('colfQ').value||'').trim().toLowerCase();
        if(h2) h2.textContent=n+' / '+order.length+' 선택'+(q2? ' · 검색 '+vis.length+'개':'');
      };
    });
  }
  paint();
  document.getElementById('colfQ').oninput=paint;
  document.getElementById('colfAll').onclick=function(){
    var q=(document.getElementById('colfQ').value||'').trim().toLowerCase();
    if(q){ picked={}; order.forEach(function(v){ if(String(v).toLowerCase().indexOf(q)>=0) picked[v]=1; }); }
    else  { order.forEach(function(v){ picked[v]=1; }); }
    paint(); };
  document.getElementById('colfNone').onclick=function(){ picked={}; paint(); };
  document.getElementById('colfCancel').onclick=closeColFilter;
  document.getElementById('colfOk').onclick=function(){
    var sel=order.filter(function(v){ return picked[v]; });
    if(!sel.length){ alert('최소 한 개는 골라야 합니다. 전체를 보려면 「모두」 를 누르세요.'); return; }
    var out=(sel.length===order.length)? null : sel;
    closeColFilter();
    opt.onApply(out);
  };

  var r=anchor.getBoundingClientRect(), w=el.offsetWidth, h=el.offsetHeight;
  var left=Math.min(Math.max(8,r.left-w+r.width+8), window.innerWidth-w-8);
  var top=r.bottom+6;
  if(top+h>window.innerHeight-8) top=Math.max(8,r.top-h-6);
  el.style.left=left+'px'; el.style.top=top+'px';
  setTimeout(function(){
    document.addEventListener('mousedown',colfOutside,true);
    document.addEventListener('keydown',colfEsc,true);
    var qi=document.getElementById('colfQ'); if(qi&&order.length>8) qi.focus();
  },0);
}

export function gridFilteredSorted(g){
  // 검색 개선: 공백 무시 + 여러 단어 AND + 표시명(예: MDR_S1→S1 MDR)도 함께 검색
  var q=($('#dvSearch').value||'').trim().toLowerCase();
  var toks=q? q.split(/\s+/).filter(Boolean):[];
  var rows=g.rows().filter(function(r){
    if(g._lens && !g._lens[r.id]) return false;                                   // 관점 필터(계약 메뉴)
    if(g.chipsField && DV.chipVal && String(r[g.chipsField]||'')!==DV.chipVal) return false;
    if(DV.pre && !DV.pre.fn(r)) return false;                                     // ㊿+169 홈 알림에서 온 조건
    if(!passFilters(r,g,null)) return false;
    if(!toks.length) return true;
    // 열 안의 공백만 무시하고, 열 사이에는 경계 문자를 둬서
    // 옆 열과 이어붙은 가짜 매칭(DRM+DRM→"MDR")을 막는다
    var hay='';
    g.cols.forEach(function(c){
      var v=r[c.k];
      hay+=String(v==null?'':v).replace(/\s+/g,'')+'';
      if(c.fmt){ try{ var f=c.fmt(v,r); hay+=String(f==null?'':f).replace(/\s+/g,'')+''; }catch(e){} }
    });
    hay=hay.toLowerCase();
    return toks.every(function(t){ return hay.indexOf(t.replace(/\s+/g,''))>=0; });
  });
  if(DV.sortK){
    var col=g.cols.filter(function(c){return c.k===DV.sortK;})[0];
    var isNum = col && col.t==='number';
    rows=rows.slice().sort(function(a,b){
      var x=a[DV.sortK], y=b[DV.sortK];
      var ex=(x===null||x===undefined||x===''), ey=(y===null||y===undefined||y==='');
      if(ex&&ey) return 0; if(ex) return 1; if(ey) return -1;
      var r0 = isNum? (Number(x)-Number(y)) : String(x).localeCompare(String(y),'ko');
      return r0*DV.sortDir;
    });
  }
  return rows;
}

export function loadXlsxLib(){ return loadLib('xlsx'); }
export async function xlsxBook(name, sheets){                       // sheets: [{name, head, rows}]
  await loadXlsxLib();
  var wb=XLSX.utils.book_new();
  sheets.forEach(function(sh,si){
    var ws=XLSX.utils.aoa_to_sheet([sh.head].concat(sh.rows));
    ws['!cols']=sh.widths? sh.widths.map(function(w){ return {wch:w}; }) : sh.head.map(function(h2,i){
      var w=String(h2).length+2;
      sh.rows.slice(0,80).forEach(function(r){ var L=String(r[i]==null?'':r[i]).length+2; if(L>w) w=L; });
      return {wch:Math.min(42,w)};
    });
    XLSX.utils.book_append_sheet(wb, ws, String(sh.name||('Sheet'+(si+1))).replace(/[\\/:*?\[\]]/g,' ').slice(0,31));
  });
  XLSX.writeFile(wb, name.replace(/[\\/:*?"<>|]/g,'_')+'_'+todayStr()+'.xlsx');
}
export function xlsxAoa(name, head, rows){ return xlsxBook(name, [{name:'Sheet1', head:head, rows:rows}]); }
export async function exportXlsx(){
  var g=GRIDS[ST.CUR_VIEW]; if(!g) return;
  var rows=gridFilteredSorted(g);
  var VC=visCols(g);                                            /* 숨긴 열은 엑셀에도 빼고 내려받습니다 */
  var head=VC.map(function(c){return c.l;});
  var aoa=rows.map(function(r){ return VC.map(function(c){
    var v=r[c.k];
    if(c.t==='month'&&v) return String(v).slice(0,7);
    if(c.t==='bool') return v?'Y':'';
    if(c.won) return Math.round(Number(v||0)/1000);            // 천원 단위
    if(typeof v==='number') return v;
    if(c.raw) return v==null?'':String(v);                       /* 시리얼처럼 화면은 요약, 엑셀은 원본 */
    if(c.fmt){ try{ var fv=c.fmt(v,r); if(fv!=null) return String(fv).replace(/<[^>]*>/g,''); }catch(e){} }
    return v==null?'':String(v);
  }); });
  try{ await xlsxAoa(g.title.replace(/\s+/g,'_'), head, aoa); }
  catch(e){ exportCsv(); }   // 라이브러리 차단 시 CSV 폴백
}
export function exportCsv(){
  var g=GRIDS[ST.CUR_VIEW]; if(!g) return;
  var rows=gridFilteredSorted(g);
  var VC=visCols(g);
  var head=VC.map(function(c){return c.l;});
  function cell(v){ v=(v==null?'':String(v)); return /[",\n]/.test(v)? '"'+v.replace(/"/g,'""')+'"' : v; }
  var csv='\ufeff'+head.join(',')+'\n'+rows.map(function(r){
    return VC.map(function(c){
      var v=r[c.k];
      if(c.t==='month'&&v) v=String(v).slice(0,7);
      if(c.t==='bool') v=v?'Y':'';
      else if(c.won) v=Math.round(Number(v||0)/1000);          // 천원 단위 (열 이름에 (천원) 표기)
      else if(c.fmt) v=c.fmt(r[c.k],r);
      return cell(v);
    }).join(',');
  }).join('\n');
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download=g.title.replace(/\s+/g,'_')+'_'+todayStr()+'.csv';
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); },2000);
}

/* ── 계약 메뉴 «관점» 필터 ─────────────────────────────────────────────
   각 관점은 해당하는 계약 id 집합을 만들어 표를 그 계약들로만 좁힙니다. 부속 계약은 원계약과 함께 보입니다. */
export var LENS_DEFS=[
  ['multi','여러 제품 쓰는 고객사','유효한 원계약이 두 제품 이상인 고객사의 모든 계약'],
  ['kids','부속 계약 있는 고객사','라이선스·센서 추가(부속 계약)가 붙어 있는 원계약과 그 부속들'],
  ['dup','중복 등록 의심','같은 고객사·같은 서비스의 원계약이 같은 기간에 겹치는 것 (연장은 한 줄로 합쳐지고, [사이트명] 표기가 있는 별도 사이트는 제외)'],
  ['pending','계약 예정','시작월·종료월이 모두 비어 있는 계약 — 고객 수에 들어가지 않음'],
  ['overdue','만기 지났는데 미처리','종료월이 지났는데 상태가 아직 신규·재약정인 계약 — 연장 등록 또는 해지 처리 필요'],
  ['renew','연장 이력 있음','재약정으로 연장 회차가 쌓인 계약'],
  ['alias','사명 변경·사이트 통합','옛 사명이나 사이트명이 별칭으로 남아 있는 고객사'],
  ['cnd','CND 전환 고객','DeviceKeeper → S1 Basic 전환 고객 (에스원 통합 과금) 과 통합과금 행'],
  ['nocount','고객 수 집계 제외','통합과금 · 중복(no_count) · H/W 일시 판매 — 매출만 세고 고객 수에는 넣지 않는 계약'],
  ['liveov','LIVE 예외 지정','규칙과 무관하게 LIVE 에 «포함» 또는 «제외»로 고정한 계약 (사유는 LIVE 예외 사유 열)'],
  ['live','지금 LIVE 인 계약','이번 달 LIVE 고객사로 판정되는 원계약 (LIVE 고객사 메뉴와 같은 규칙)']
];
export var LENS_DESC={}; 
export function lensSets(){
  var cts=ST.RAWX.contracts||[], cus={}; (ST.RAWX.customers||[]).forEach(function(c){ cus[c.id]=c; });
  var nowYm=(ST.DATA&&ST.DATA.nowIdx>=0? mk(ST.DATA.nowIdx) : new Date().toISOString().slice(0,7))+'-01';
  var byId={}; cts.forEach(function(c){ byId[c.id]=c; });
  var kids={}; cts.forEach(function(c){ if(c.parent_contract_id) (kids[c.parent_contract_id]=kids[c.parent_contract_id]||[]).push(c.id); });
  var root=function(c){ return c.parent_contract_id? (byId[c.parent_contract_id]||c) : c; };
  var ended=function(c){ return /해지|종료|CN전환|통합과금/.test(String(c.status||'')); };
  var valid=function(c){ return !c.parent_contract_id && !ended(c) && !c.no_count && (c.end_month==null || c.end_month>=nowYm) && String(c.sale_type||'')!=='H/W'; };
  var out={}; LENS_DEFS.forEach(function(d){ out[d[0]]={ids:{},n:0}; });
  var add=function(k,c){ out[k].ids[c.id]=1; (kids[c.id]||[]).forEach(function(i){ out[k].ids[i]=1; }); if(c.parent_contract_id) out[k].ids[c.parent_contract_id]=1; };
  // 여러 제품
  var lines={}; cts.forEach(function(c){ if(valid(c)) (lines[c.customer_id]=lines[c.customer_id]||{})[c.line]=1; });
  cts.forEach(function(c){ var l=lines[c.customer_id]; if(l && Object.keys(l).length>1) add('multi',c); });
  // 부속
  cts.forEach(function(c){ if(kids[c.id]) add('kids',c); });
  // 중복 의심: 같은 고객·서비스 원계약 기간 겹침
  var grp={}; cts.forEach(function(c){ if(c.parent_contract_id) return; (grp[c.customer_id+'|'+c.line]=grp[c.customer_id+'|'+c.line]||[]).push(c); });
  Object.keys(grp).forEach(function(k){ var a=grp[k]; if(a.length<2) return;
    for(var i=0;i<a.length;i++) for(var j=i+1;j<a.length;j++){ var x=a[i], y=a[j];
      var xs=x.start_month||'0000', xe=x.end_month||'9999', ys=y.start_month||'0000', ye=y.end_month||'9999';
      var over = xs<=ye && ys<=xe;                                     // 기간 겹침(둘 다 날짜 없으면 겹침으로 봄)
      var site=/^\[/.test(String(x.note||''))||/^\[/.test(String(y.note||''));           // «[사이트명]» 표기가 있으면 한 회사의 별도 사이트 — 중복이 아님
      if(over && !site && !(ended(x)&&ended(y)&&x.start_month!==y.start_month)){ add('dup',x); add('dup',y); } } });
  cts.forEach(function(c){
    if(!c.parent_contract_id && !c.start_month && !c.end_month && !ended(c)) add('pending',c);
    if(!c.parent_contract_id && c.end_month && c.end_month<nowYm && !ended(c) && String(c.status||'')!=='추가') add('overdue',c);
    if(Number(c.renew_count)>0) add('renew',c);
    var cu=cus[c.customer_id]; if(cu && cu.aliases && cu.aliases.length) add('alias',c);
    if(c.line==='S1' && (String(c.sale_type||'')==='CND' || /CN전환|통합과금/.test(String(c.status||'')))) add('cnd',c);
    if(c.no_count || String(c.status||'')==='통합과금' || String(c.sale_type||'')==='H/W') add('nocount',c);
    if(c.live_override) add('liveov',c);
  });
  if(ST.DATA && ST.DATA.rows){ var lvNow=liveCalc(ST.DATA.nowIdx); lvNow.rows.forEach(function(x){ (x.ids||[]).forEach(function(id){ var c=byId[id]; if(c) add('live',c); }); }); }
  LENS_DEFS.forEach(function(d){ var u={}; Object.keys(out[d[0]].ids).forEach(function(id){ var c=byId[id]; if(c) u[c.customer_id]=1; }); out[d[0]].n=Object.keys(u).length; out[d[0]].nRows=Object.keys(out[d[0]].ids).length; });
  return out;
}
/* LIVE 고객사 메뉴 상단 — 보기 전환(계약 기준 / 시트 명단) · 기준월 · 요약 · 대조 표 · 도움말 */
export function renderLiveBar(lb){
  var isDb=(ST.LIVE_SRC!=='sheet'), T=(LV.T!=null? LV.T : STATE.base), lv=liveCalc(T), sh=(ST.DATA.live&&ST.DATA.live.ok)? ST.DATA.live : null;
  var perLine={}; lv.rows.forEach(function(x){ perLine[x.line]=(perLine[x.line]||0)+1; });
  var lineTxt=Object.keys(perLine).sort().map(function(l){ return lline(l)+' '+perLine[l]; }).join(' · ');
  var h=tpl`<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;width:100%">`+
    tpl`<div class="seg" title="LIVE 고객사를 어디에서 가져올지"><button data-lsrc="db" aria-pressed="${rawHtml(isDb)}" title="계약 표로 자동 판정 — 등록·해지가 그대로 반영됩니다">계약 기준(자동)</button><button data-lsrc="sheet" aria-pressed="${!isDb}" title="예전 LIVE 고객사 탭을 옮겨 둔 명단 — 대조·편집용">시트 명단</button></div>`;
  if(isDb){
    var opts=''; for(var i=ST.DATA.nowIdx+3;i>=Math.max(0,ST.DATA.nowIdx-36);i--){ opts+=tpl`<option value="${rawHtml(i)}"${i===T?' selected':''}>${mk(i)}${i===ST.DATA.nowIdx?' (이번 달)':''}</option>`; }
    h+=tpl`<label class="mini" style="display:flex;align-items:center;gap:6px">기준월 <select id="lvMonth" style="font:inherit;padding:4px 6px;border:1px solid var(--ring);border-radius:8px;background:var(--surface-2);color:inherit">${rawHtml(opts)}</select></label>`;
    h+=tpl`<span class="mini"><b>${mk(T)}</b> LIVE <b>${rawHtml(lv.uniq)}곳</b>(회사) · 제품별 합 <b>${rawHtml(lv.count)}</b> — ${rawHtml(lineTxt)}${rawHtml(sh? ' · 시트 명단 '+sh.uniq+'곳 / '+sh.count+'건':'')}</span>`;
    if(sh){ var df=liveDiff(T); var nd=df.onlyDb.length+df.onlySheet.length;
      h+=tpl`<button class="chip" id="lvDiffBtn" aria-pressed="${rawHtml(LV.diff)}" title="계약 기준과 시트 명단이 다른 곳만 보기">${rawHtml(nd? '⚠ 시트와 다른 곳 '+nd:'✓ 시트 명단과 일치')}</button>`; }
  } else {
    h+=tpl`<span class="mini">시트 명단 <b>${rawHtml(sh?sh.uniq:0)}곳</b> / ${rawHtml(sh?sh.count:0)}건 · 계약 기준 ${mk(T)} ${rawHtml(lv.uniq)}곳</span>`;
  }
  h+=tpl`<span class="mini" style="color:var(--muted)">${isDb? '따로 등록하지 않습니다 — 계약이 등록·해지되면 자동으로 바뀝니다':'이 명단은 직접 고쳐야 하며 대시보드에는 쓰이지 않습니다'}</span></div>`;
  if(isDb && sh && LV.diff){
    var d=liveDiff(T);
    function rowsOf(arr, kind){ if(!arr.length) return '<tr><td colspan="4" class="mini" style="color:var(--muted)">없음</td></tr>';
      return arr.map(function(x){ return tpl`<tr><td>${x.cust}</td><td>${lline(x.line)}</td><td>${kind==='db'? (x.basis||'') : x.why}</td><td>${kind==='db'? '시트 LIVE 탭에 추가하면 같아짐' : (/계약 없음/.test(x.why)? '계약을 등록하거나 사명을 맞춤(사명 변경 기능)' : /계약 예정/.test(x.why)? '시작하면 계약 화면에서 시작월 입력' : /no_count/.test(x.why)? '매출만 세는 행 — 시트에서도 «중복»으로 빼는 행이라 정상' : /예외 제외/.test(x.why)? '계약의 LIVE 예외 «제외» 지정 — 의도한 것' : /해지|종료/.test(x.why)? '시트 명단에서 빼야 함' : /만기/.test(x.why)? '재약정이면 연장 등록, 끝났으면 해지 처리' : '계약 화면 확인')}</td></tr>`; }).join(''); }
    h+=tpl`<div style="flex-basis:100%;margin-top:6px;padding:10px 12px;border:1px solid var(--ring);border-radius:10px;background:var(--surface-2,rgba(0,0,0,.02))">`+
      tpl`<div class="mini" style="margin-bottom:6px"><b>계약 기준 ${mk(T)}</b> ${rawHtml(d.db.uniq)}곳 vs <b>시트 명단</b> ${rawHtml(d.sheetN)}곳 — 이름은 띄어쓰기·(주)·괄호·별칭을 무시하고 맞춰 봤습니다. 아래 항목이 0이 되면 두 숫자가 같아집니다.</div>`+
      tpl`<div style="overflow-x:auto"><table class="pr"><thead><tr><th>고객사</th><th>서비스</th><th>왜 다른가</th><th>어떻게 맞추나</th></tr></thead><tbody>`+
      tpl`<tr><td colspan="4" style="background:var(--surface)"><b>계약으로는 LIVE 인데 시트 명단에 없음 — ${d.onlyDb.length}</b></td></tr>${rawHtml(rowsOf(d.onlyDb,'db'))}`+
      tpl`<tr><td colspan="4" style="background:var(--surface)"><b>시트 명단에는 있는데 계약으로는 LIVE 아님 — ${d.onlySheet.length}</b></td></tr>${rawHtml(rowsOf(d.onlySheet,'sheet'))}`+
      tpl`</tbody></table></div></div>`;
  }
  h+=tpl`<div style="flex-basis:100%">${rawHtml(helpBox('live', 'LIVE 고객사는 어떻게 정해지나요?', [
    ['계약 기준(자동)', '계약 표에서 <b>기준월에 유효한 원계약</b>이 있는 회사를 제품마다 1행으로 보여줍니다. 시작월 ≤ 기준월이고, 종료월이 없거나 기준월 이후면 LIVE. <b>해지</b>는 해지월부터 빠지고, 만기 달(종료월 = 기준월)은 아직 LIVE(재약정 대기)로 봅니다.'],
    ['빠지는 계약', '부속 계약(추가 구매)·상태 «통합과금»(에스원 CND 묶음 과금)·«추가»·고객 수 제외 행(no_count)·판매형태 H/W. 시작월이 비어 있으면 «계약 예정»으로 LIVE 아님.'],
    ['CN전환', 'CND(DeviceKeeper)에서 S1 Basic 으로 바뀌어 에스원 통합 과금으로 계속 쓰는 고객 — 종료월이 없으므로 항상 LIVE.'],
    ['최초 개시월 / 현행', '최초 개시월 = 그 회사·제품의 가장 이른 계약 시작월(재약정을 거쳐도 처음 시작한 달). 현행 = 지금 유효한 계약의 시작·종료월·CSM·노드(부속 계약 노드 포함).'],
    ['예외', '규칙으로 안 잡히는 경우(무상 시범, 파트너 내부용 등)는 계약 행의 «LIVE 예외»를 포함/제외로 두면 규칙보다 우선합니다. 예외 열에 사유가 보입니다.'],
    ['등록·삭제', '따로 등록하지 않습니다. 새 고객 → 입력·수정 › 계약에서 신규 계약(시작월·노드·CSM 입력) · 빠질 때 → 상태 «해지»와 해지월. 저장하면 LIVE·대시보드·해지율이 한 번에 바뀝니다.'],
    ['시트 명단', '예전 매출시트 «LIVE 고객사» 탭을 옮겨 둔 표(대조용). «시트와 다른 곳» 버튼으로 두 기준의 차이를 항목별로 볼 수 있습니다.']
  ], '기준월을 바꾸면 그 시점의 LIVE 명단이 나옵니다 — 시트로는 못 보던 과거 시점 비교가 됩니다.'))}`+ tpl`</div>`;
  lb.innerHTML=h;
  lb.querySelectorAll('button[data-lsrc]').forEach(function(b){ b.onclick=function(){ setLiveSrc(b.dataset.lsrc); DV.page=0; DV.filters={}; DV.sortK=null; switchView('live'); }; });
  var ms=lb.querySelector('#lvMonth'); if(ms) ms.onchange=function(){ LV.T=+ms.value; DV.page=0; renderGrid(); };
  var db=lb.querySelector('#lvDiffBtn'); if(db) db.onclick=function(){ LV.diff=!LV.diff; renderGrid(); };
  helpWire(lb);
}
/* 표 설명(cap) — 길면(120자 초과) 첫 문장만 보이고 «도움말 ▾» 로 펼침 · 펼침 상태는 화면별로 기억 (⑤ UX 2단계 · ㊿+139) */
export function dvCapRender(v, text){
  var el=$('#dvCap'); if(!el) return; text=String(text||'');
  var key='svc_capopen_'+v, open=false; try{ open=localStorage.getItem(key)==='1'; }catch(e){}
  if(text.length<=120){ el.textContent=text; return; }
  var cut=text.search(/ — | · /); var head=cut>20? text.slice(0,cut) : text.slice(0,90)+'…';
  el.innerHTML=tpl`<span class="cap-head">${open? text : head}</span> <button type="button" class="cap-more" aria-expanded="${rawHtml(open)}" aria-controls="dvCap">${open? '접기 ▴':'도움말 ▾'}</button>`;
  el.querySelector('.cap-more').onclick=function(){ try{ localStorage.setItem(key, open? '0':'1'); }catch(e){} dvCapRender(v, text); };
}
/* 데스크톱 가로 스크롤 표에서 오른쪽 고정 동작(✎/🗑) 열이 마지막 데이터 열을 덮지 않게 — 표가 넘칠 때만 마지막 데이터 열에 동작 열 너비만큼 오른쪽 여백 (⑤ UX 2단계) */
/* ㊿+141 접근성: 눌러서 여는 타일(role=button) 안에 버튼·입력칸이 또 있으면 «버튼 속 버튼»이 되어 화면 낭독기가 안쪽 버튼을 못 읽음
   → role=group + 이름(aria-label) 으로 바꿈. tabindex·Enter 동작은 그대로 */
export function a11yTileRole(c){
  if(!c || c.getAttribute('role')!=='button') return;
  if(!c.querySelector('button,a[href],input,select,textarea,[contenteditable="true"],[tabindex]:not([tabindex="-1"])')) return;
  c.setAttribute('role','group');
  if(!c.hasAttribute('aria-label')){ var k=c.querySelector('.k,.l,h3,h4'); c.setAttribute('aria-label', ((k&&k.textContent.trim())||(c.title||'').replace(/\s*\(클릭\)$/,'')||'항목').slice(0,60)+' — Enter: 자세히'); }
}
export function gridActPad(){
  var t=$('#dvTable'); if(!t) return; var wrap=t.parentElement, th=t.querySelector('thead th.act');
  if(!th || window.innerWidth<=760){ t.classList.remove('act-pad'); t.style.removeProperty('--actw'); return; }
  var over=wrap.scrollWidth>wrap.clientWidth+2;
  if(over) t.style.setProperty('--actw', th.offsetWidth+'px');
  t.classList.toggle('act-pad', over);
}
/* ❔ 이 화면 사용법 — 포탈 AI(팀 지식 SQL 91 포함)에게 현재 화면 사용법을 묻고 홈 답변 칸으로 이동 */
export function askScreenHelp(){
  var g=GRIDS[ST.CUR_VIEW], title=g? g.title : (function(){ var b=document.querySelector('#side button[data-v="'+ST.CUR_VIEW+'"]'); return b? navText(b) : ST.CUR_VIEW; })();
  var q='포탈의 «'+String(title||'').replace(/^[^\w가-힣]+/,'').trim()+'» 화면은 어떻게 쓰나요? 주요 기능과 주의할 점을 짧게 알려줘';
  var hit=cmdAskHit(q); if(hit && hit.go) hit.go(); else toast('AI 를 쓸 수 없습니다','조회 전용 장비 계정이거나 AI 가 꺼져 있습니다','warn');
}
/* ── 표 열 너비 조절 (㊿+142 · 사용자 선택) ─────────────────────────────
   머리 칸 오른쪽 경계를 끌면 그 열 너비가 바뀌고 화면별로 기억(localStorage svc_colw_<화면>) · 경계를 두 번 누르면 그 열만 원래대로.
   한 열이라도 정해 두면 표를 table-layout:fixed 로 바꿔(나머지 열은 지금 자연 너비로 고정) 넘치는 글자는 «…» 로 자름 — 칸에 마우스를 올리면 전체(title). */
export var COLW_MIN=44;
export function colwGet(v){ try{ return JSON.parse(localStorage.getItem('svc_colw_'+v)||'{}')||{}; }catch(e){ return {}; } }
export function colwPut(v,m){ try{ if(m && Object.keys(m).length) localStorage.setItem('svc_colw_'+v, JSON.stringify(m)); else localStorage.removeItem('svc_colw_'+v); }catch(e){} }
export function colwFreeze(t){   /* 지금 보이는 너비로 모든 열을 고정 */
  var ths=Array.prototype.slice.call(t.querySelectorAll('thead th'));
  var ws=ths.map(function(th){ return th.getBoundingClientRect().width; });
  ths.forEach(function(th,i){ th.style.width=Math.round(ws[i])+'px'; });
  t.style.width=Math.round(ws.reduce(function(a,b){ return a+b; },0))+'px';
  t.classList.add('colw-fixed');
}
export function colwApply(t, v){
  t.classList.remove('colw-fixed'); t.style.width='';
  var m=colwGet(v), ks=Object.keys(m); if(!ks.length) return;
  var ths=Array.prototype.slice.call(t.querySelectorAll('thead th'));
  var ws=ths.map(function(th){ var k=th.dataset.k; return (k && m[k])? m[k] : th.getBoundingClientRect().width; });
  ths.forEach(function(th,i){ th.style.width=Math.round(ws[i])+'px'; });
  t.style.width=Math.round(ws.reduce(function(a,b){ return a+b; },0))+'px';
  t.classList.add('colw-fixed');
  /* 잘린 칸은 마우스를 올리면 전체 글자 */
  t.querySelectorAll('tbody td:not(.act)').forEach(function(td){ if(!td.title && td.scrollWidth>td.clientWidth+1 && !td.querySelector('input,select,textarea')) td.title=td.textContent.trim(); });
}
export function colwStart(ev, th, t, v){
  ev.preventDefault(); ev.stopPropagation();
  if(!t.classList.contains('colw-fixed')) colwFreeze(t);
  var x0=ev.clientX, w0=th.getBoundingClientRect().width, tw0=t.getBoundingClientRect().width, k=th.dataset.k, h=ev.currentTarget;
  try{ h.setPointerCapture(ev.pointerId); }catch(e){}
  document.body.classList.add('colw-drag');
  var mv=function(e){ var w=Math.max(COLW_MIN, Math.round(w0+e.clientX-x0)); th.style.width=w+'px'; t.style.width=Math.round(tw0+(w-w0))+'px'; };
  var up=function(){ h.removeEventListener('pointermove',mv); h.removeEventListener('pointerup',up); h.removeEventListener('pointercancel',up); document.body.classList.remove('colw-drag');
    var w=Math.round(th.getBoundingClientRect().width); if(Math.abs(w-w0)<2) return;
    var m=colwGet(v); m[k]=w; colwPut(v,m); try{ gridActPad(); }catch(e){} };
  h.addEventListener('pointermove',mv); h.addEventListener('pointerup',up); h.addEventListener('pointercancel',up);
}
export function colwReset(v, k){ var m=colwGet(v); if(k) delete m[k]; else m={}; colwPut(v,m); renderGrid(); }
export function renderGrid(){
  var g=GRIDS[ST.CUR_VIEW]; if(!g) return;
  var isCustom=!!g.custom;
  // 채널 칩 필터
  var cb=document.getElementById('dvChipBar');
  if(!cb){
    cb=document.createElement('div'); cb.id='dvChipBar';
    cb.style.cssText='display:none;gap:8px;flex-wrap:wrap;margin-bottom:10px';
    var bar=$('#dvSearch').parentElement; bar.parentElement.insertBefore(cb,bar);
  }
  if(g.chipsField && !isCustom){
    cb.style.display='flex'; cb.innerHTML='';
    ['전체'].concat(g.chipsOpts).forEach(function(op){
      var v=(op==='전체')? '':op;
      var btn=document.createElement('button');
      btn.className='pill'+(DV.chipVal===v||(!DV.chipVal&&!v)?'':' ghost');
      if(DV.chipVal===v||(!DV.chipVal&&!v)){ btn.style.background='var(--brand-solid,#107b32)'; btn.style.borderColor='var(--brand-solid,#107b32)'; btn.style.color='#fff'; }
      var cn=v? g.rows().filter(function(x){ return String(x[g.chipsField]||'')===v; }) : g.rows();   /* ㊿+170 칩마다 건수(OI = 단계별 요약 · 금액은 툴팁) */
      btn.innerHTML=tpl`${op} <span class="num">${String(cn.length)}</span>`;
      if(ST.CUR_VIEW==='oi'){ var am=cn.reduce(function(a,x){ return a+(+x.expect_amount||0); },0); btn.title=op+' '+cn.length+'건 · 예상 '+won(am)+'천원'; }
      btn.onclick=function(){ DV.chipVal=v; DV.page=0; renderGrid(); };
      cb.appendChild(btn);
    });
  } else cb.style.display='none';
  /* 관점 필터(계약 메뉴 전용): 여러 제품 고객사 · 부속 계약 · 중복 등록 의심 · 계약 예정 … 한 번에 보기 */
  var lb=document.getElementById('dvLensBar');
  if(!lb){ lb=document.createElement('div'); lb.id='dvLensBar'; lb.style.cssText='display:none;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px';
    var bar2=$('#dvSearch').parentElement; bar2.parentElement.insertBefore(lb,bar2); }
  if(ST.CUR_VIEW==='contracts' && !isCustom){
    lb.style.display='flex'; lb.innerHTML='<span class="mini" style="color:var(--muted);margin-right:2px">관점</span>';
    var LS=lensSets();
    var zero=LENS_DEFS.filter(function(d){ return !LS[d[0]].n; }).length;   /* ⑤ UX: 0곳인 관점은 접어 둠 (칩 10개가 늘어서 있던 것) */
    [['','전체','모든 계약']].concat(LENS_DEFS.map(function(d){ return [d[0], d[1]+' '+LS[d[0]].n+'곳', d[2]+' · 계약 '+LS[d[0]].nRows+'건']; })).forEach(function(op){
      var v=op[0], on=(DV.lens||'')===v;
      if(v && !LS[v].n && !DV.lensAll) return;
      var btn=document.createElement('button'); btn.className='chip'; btn.setAttribute('aria-pressed', on?'true':'false'); btn.textContent=op[1]; btn.title=op[2];
      if(v && !LS[v].n){ btn.disabled=true; btn.style.opacity='.45'; }
      btn.onclick=function(){ DV.lens=(on? '':v); DV.page=0; renderGrid(); };
      lb.appendChild(btn);
    });
    if(zero){ var zb=document.createElement('button'); zb.type='button'; zb.className='mini'; zb.style.cssText='border:0;background:transparent;color:var(--muted);cursor:pointer;padding:0 4px;font:inherit;font-size:12px'; zb.textContent=DV.lensAll? '빈 관점 접기' : '+ 해당 없음 '+zero+'개'; zb.onclick=function(){ DV.lensAll=!DV.lensAll; renderGrid(); }; lb.appendChild(zb); }
    if(DV.lens && LENS_DESC[DV.lens]){ var dsc=document.createElement('span'); dsc.className='mini'; dsc.style.cssText='color:var(--ink-2);flex-basis:100%;margin-top:2px'; dsc.textContent='ⓘ '+LENS_DESC[DV.lens]; lb.appendChild(dsc); }
    g._lens=(DV.lens && LS[DV.lens])? LS[DV.lens].ids : null;
  } else if(ST.CUR_VIEW==='live'){ lb.style.display='flex'; renderLiveBar(lb); g._lens=null; }
  else { lb.style.display='none'; g._lens=null; }
  /* ㊿+169 업무 보기(운영 · 갱신 · 정산 · 전체) — 계약 · OI */
  var wb=document.getElementById('dvWvBar');
  if(!wb){ wb=document.createElement('div'); wb.id='dvWvBar'; wb.className='wv-bar'; cb.parentElement.insertBefore(wb, cb); }
  var WD=!isCustom && WORKV[ST.CUR_VIEW], WC=WD? wvCur() : null;
  if(WD){ wb.hidden=false;
    wb.innerHTML=tpl`<span class="wv-l" id="wvLbl">보기</span><div class="seg" role="group" aria-labelledby="wvLbl">${rawHtml(WD.views.map(function(x){ return tpl`<button type="button" data-wv="${x[0]}" aria-pressed="${x===WC?'true':'false'}" title="${x[1]}">${x[0]}</button>`; }).join(''))}</div><span class="mini wv-d">${WC[1]} · 보기마다 열 구성이 내 브라우저에 저장됩니다</span>`;
    wb.querySelectorAll('[data-wv]').forEach(function(b){ b.onclick=function(){ wvSet(ST.CUR_VIEW, b.dataset.wv); DV.page=0; renderGrid(); }; });
  } else { wb.hidden=true; wb.innerHTML=''; }
  /* ㊿+169 홈 알림에서 넘어온 조건 — 이름표 + ✕ */
  var pb=document.getElementById('dvPreBar');
  if(!pb){ pb=document.createElement('div'); pb.id='dvPreBar'; pb.className='pre-bar'; var bar4=$('#dvSearch').parentElement; bar4.parentElement.insertBefore(pb, bar4); }
  try{ qvBar(g); }catch(e){ console.warn('빠른 보기', e); }
  if(DV.pre && !isCustom && !DV.pre.qv){ pb.hidden=false; pb.innerHTML=tpl`<span class="ctag info">${rawHtml(ico('filter',13))} ${DV.pre.label}</span><button type="button" class="cbtn" id="dvPreX" aria-label="조건 해제 — ${DV.pre.label}">조건 해제</button>`;
    document.getElementById('dvPreX').onclick=function(){ DV.pre=null; DV.page=0; renderGrid(); }; }
  else { pb.hidden=true; pb.innerHTML=''; }
  ['dvSearch','dvCsv','dvCols'].forEach(function(id){ $('#'+id).style.display=isCustom?'none':''; });
  var nHid=isCustom? 0 : hidCur(g).filter(function(k){ return g.cols.some(function(c){ return c.k===k; }); }).length;
  var cbtn2=$('#dvCols'); if(cbtn2 && !isCustom){ cbtn2.innerHTML=ico('cols',15)+tpl`<span>${nHid? '열 '+(g.cols.length-nHid)+'/'+g.cols.length : '열'}</span>`; cbtn2.classList.add('icb');
    cbtn2.style.borderColor=nHid?'var(--s1)':''; cbtn2.style.color=nHid?'var(--s1)':''; }
  var nf=filterCount();
  var fc=$('#dvFclr');
  fc.style.display=(isCustom||!nf)?'none':'';
  fc.textContent='✕ 필터 해제 ('+nf+')';
  $('#dvPager').style.display=isCustom?'none':'';
  try{ renderEqPanel(); }catch(e){}
  try{ renderInbPanel(); }catch(e){}
  if(isCustom){ var dc0=document.getElementById('dvCount'); if(dc0){ dc0.textContent=''; dc0.title=''; } g.custom(); return; }   /* ㊿+170 이전 표의 «n행» 글자가 남지 않게 */
  var bh=document.getElementById('bizHost'); if(bh) bh.style.display='none';
  $('#dvTable').parentElement.style.display='';
  var rows=gridFilteredSorted(g);

  /* 페이지 */
  var totalPages=Math.max(1,Math.ceil(rows.length/DV.per));
  if(DV.page>=totalPages) DV.page=totalPages-1;
  var start=DV.page*DV.per;
  var pageRows=rows.slice(start,start+DV.per);

  $('#dvCount').textContent=rows.length.toLocaleString('ko-KR')+'행 · '+
    (rows.length? (start+1)+'–'+(start+pageRows.length) : '0')+' · — 미입력 · 빈칸 해당 없음';
  $('#dvCount').title='— = 값이 비어 있음(입력 필요할 수 있음) · 빈칸 = 이 계약/행에는 해당하지 않는 칸';

  var t=$('#dvTable'); t.innerHTML='';
  var thead=document.createElement('thead');
  var tr0=document.createElement('tr');
  visCols(g).forEach(function(c){
    var th=document.createElement('th');
    var pc=pinCls(g,c); if(pc) th.className=pc;
    if(DV.sortK===c.k) th.setAttribute('aria-sort', DV.sortDir>0? 'ascending':'descending');
    var arrow = DV.sortK===c.k ? (DV.sortDir>0?' ▲':' ▼') : '';
    var on=!!(DV.filters[c.k] && DV.filters[c.k].length);
    var wrap=document.createElement('div'); wrap.className='thw';
    var lab=document.createElement('span');
    lab.textContent=c.l+arrow;
    lab.style.cursor='pointer'; lab.title='클릭: 정렬';
    lab.onclick=function(){
      if(DV.sortK===c.k) DV.sortDir*=-1;
      else { DV.sortK=c.k; DV.sortDir=1; }
      DV.page=0; renderGrid();
    };
    var fb=document.createElement('button');
    fb.type='button'; fb.className='fbtn'+(on?' on':'');
    fb.textContent='▼'; fb.setAttribute('aria-label', c.l+' 열 값으로 거르기'+(on? ' (적용 중)':''));
    fb.title=on? ('필터 적용 중 ('+DV.filters[c.k].length+'개 값) — 클릭해서 바꾸기') : '값 골라 보기';
    fb.onclick=function(ev){ ev.stopPropagation(); openColFilter(fb,g,c); };
    wrap.appendChild(lab); wrap.appendChild(fb);
    th.appendChild(wrap); th.dataset.k=c.k;
    var rs=document.createElement('span'); rs.className='colrs'; rs.setAttribute('aria-hidden','true'); rs.title='끌어서 열 너비 조절 · 두 번 누르면 원래대로';
    rs.onpointerdown=function(ev){ if(ev.button!==0) return; colwStart(ev, th, t, ST.CUR_VIEW); };
    rs.onclick=function(ev){ ev.stopPropagation(); };
    rs.ondblclick=function(ev){ ev.stopPropagation(); colwReset(ST.CUR_VIEW, c.k); };
    th.appendChild(rs);
    tr0.appendChild(th);
  });
  if(!g.ro){ var th2=document.createElement('th'); th2.style.width='110px'; th2.className='act'; tr0.appendChild(th2); }
  thead.appendChild(tr0);
  t.appendChild(thead);

  var tb=document.createElement('tbody');
  pageRows.forEach(function(r){ tb.appendChild(gridRow(r,g,false)); });
  if(!pageRows.length){   /* 빈 상태 (⑤ UX): 왜 비었는지 + 한 번에 되돌리는 버튼 */
    var q=($('#dvSearch').value||'').trim(), nfl=filterCount(), hasLens=!!DV.lens, hasChip=!!DV.chipVal;
    var why=q? '검색어 «'+esc(q)+'»' : (nfl? '열 필터 '+nfl+'개' : hasLens? '관점 필터' : hasChip? '«'+esc(DV.chipVal)+'» 탭' : DV.pre? '조건 «'+esc(DV.pre.label)+'»' : '');
    var tr=document.createElement('tr'); tr.className='dg-empty';
    tr.innerHTML=tpl`<td colspan="${rawHtml(g.cols.length+2)}" style="text-align:left;padding:34px 12px;color:var(--muted)"><div style="position:sticky;left:12px;width:min(520px,calc(100vw - 160px));text-align:center">`+ tpl`${rawHtml(why? tpl`<div style="font-size:14px">${rawHtml(why)}에 맞는 행이 없습니다</div><div style="margin-top:10px;display:flex;gap:6px;justify-content:center;flex-wrap:wrap">`+ tpl`${rawHtml(q? '<button type="button" class="cbtn" data-dge="q">검색어 지우기</button>':'')}${rawHtml((nfl||hasLens)? '<button type="button" class="cbtn" data-dge="f">필터 지우기</button>':'')}${rawHtml(hasChip? '<button type="button" class="cbtn" data-dge="c">전체 탭으로</button>':'')}</div>`
          : tpl`<div style="font-size:14px">아직 데이터가 없습니다</div>${rawHtml(g.add&&!ST.IS_VIEWER? '<div class="mini" style="margin-top:6px">위의 «＋ 행 추가» 로 첫 행을 넣을 수 있습니다</div>':'')}`)}`+ tpl`</div></td>`;
    tb.appendChild(tr);
    tr.querySelectorAll('[data-dge]').forEach(function(b){ b.onclick=function(){ var k=b.dataset.dge; if(k==='q'){ $('#dvSearch').value=''; } if(k==='f'){ DV.filters={}; DV.lens=''; DV.pre=null; } if(k==='c'){ DV.chipVal=''; } DV.page=0; renderGrid(); }; });
  }
  t.appendChild(tb);
  colwApply(t, ST.CUR_VIEW);   /* ㊿+142: 사용자가 정한 열 너비 */
  gridActPad();
  pinSync(t);

  /* 페이저 */
  var pg=$('#dvPager'); pg.innerHTML='';
  if(totalPages>1){
    function pbtn(txt,fn,dis,cur){
      var b=document.createElement('button');
      b.textContent=txt; b.disabled=!!dis;
      b.style.cssText='border:1px solid '+(cur?'var(--brand-solid,#107b32)':'var(--ring)')+';background:'+(cur?'var(--brand-solid,#107b32)':'var(--surface-2)')+
        ';color:'+(cur?'#fff':'var(--ink-2)')+';border-radius:8px;padding:6px 11px;font-size:12px;cursor:pointer;font-family:inherit'+
        (dis?';opacity:.4;cursor:default':'');
      b.onclick=fn; return b;
    }
    pg.appendChild(pbtn('« 이전',function(){ DV.page--; renderGrid(); },DV.page===0));
    // 페이지 번호 (최대 9개, 현재 중심)
    var s0=Math.max(0,DV.page-4), e0=Math.min(totalPages,s0+9); s0=Math.max(0,e0-9);
    for(var p=s0;p<e0;p++){
      (function(p){ pg.appendChild(pbtn(String(p+1),function(){ DV.page=p; renderGrid(); },false,p===DV.page)); })(p);
    }
    pg.appendChild(pbtn('다음 »',function(){ DV.page++; renderGrid(); },DV.page>=totalPages-1));
  }
}

/** 'YYYY-MM' 에 n 달 더하기 */
export function ymAdd(ym, n){ if(!ym) return ''; var t=(+ym.slice(0,4))*12+(+ym.slice(5,7)-1)+n; return Math.floor(t/12)+'-'+('0'+(t%12+1)).slice(-2); }
/** ㊿+160 계약 상세의 «계약 기간 · 연장 이력» 행 — 최초 + 연장 회차별 (포탈 연장 기록 · 시트 이관 기록 둘 다) */
export function ctPeriods(c, mine){
  var h=Array.isArray(c.renew_history)? c.renew_history : []; if(!h.length) return [];
  var ym=function(v){ return v? String(v).slice(0,7) : ''; };
  var amtAt=function(m){ var x=(mine||[]).filter(function(r){ return String(r.month).slice(0,7)===m; })[0]; return x? Number(x.amount) : null; };
  var e0=h[0]||{}, s0=ym(c.start_month), end0=ym(e0.prev_end) || (ym(e0.from)? ymAdd(ym(e0.from), -1) : '');
  var out=[{k:'최초', from:s0, to:end0, mrr:(e0.prev_mrr!=null? Number(e0.prev_mrr) : amtAt(s0)), qty:(e0.prev_qty!=null? e0.prev_qty : null), info:(ctOrig(c)? '구분 '+ctOrig(c) : '')}];   /* ㊿+163 연장으로 «재약정»이 돼도 최초 줄은 처음 구분 */
  h.forEach(function(e, i){
    var last=out[out.length-1], from=ym(e.from) || (last.to? ymAdd(last.to, 1) : ''), to=ym(e.to || e.new_end);
    var mg=e.merged, info=[String(e.at||'').slice(0,10), e.by||'', /migration|sheet-sync/i.test(String(e.by||''))? '시트 이관' : '',
      Array.isArray(mg)? '추가 '+mg.length+'건 통합' : (mg? '재약정 행 #'+mg+' 합침' : ''), e.note||''].filter(Boolean).join(' · ');
    out.push({k:'연장 '+(e.no||e.renew_no||i+1)+'회', from:from, to:to, mrr:(e.mrr!=null? Number(e.mrr) : amtAt(from)), qty:(e.qty!=null? e.qty : (i===h.length-1 && c.qty? c.qty : null)), info:info});
  });
  return out;
}
export function openDetail(c){
  var cu=(ST.RAWX.customers||[]).filter(function(x){return x.id===c.customer_id;})[0]||{};
  $('#dtTitle').textContent=cu.name||'?';
  $('#dtMeta').textContent=[c.line, c.partner, c.biller, (c.start_month||'').slice(0,7)+'~'+((c.end_month||'').slice(0,7)||'?'),
    (c.contract_type? '구분 '+c.contract_type : ''), '상태 '+(c.status||'활성'), (c.renew_count? '연장 '+c.renew_count+'회':''), (c.qty? Number(c.qty).toLocaleString('ko-KR')+'노드':''), c.churn_reason||''].filter(Boolean).join(' · ');
  openOvl('ovlDetail');
  // 월별 금액 차트
  var mine=(ST.RAWX.mrs||[]).filter(function(x){return x.contract_id===c.id;});
  var host=$('#dtChart'); host.innerHTML='';
  if(mine.length>=2){
    Viz.lines(host,{labels:mine.map(function(x){return String(x.month).slice(2,7).replace('-','.');}),
      series:[{label:'월 금액',data:mine.map(function(x){return Number(x.amount);}),color:cssv('--s1')}],
      fmt:won, tipFmt:wonFull, fill:true});
  } else host.innerHTML='<p class="cap">월별 금액 데이터가 없습니다.</p>';
  // ㊿+160 계약 기간 · 연장 이력 (최초 + 연장 회차별 기간·월 금액·노드) — «기간만 늘어난 것처럼 보임» 대신 회차가 보이게
  var rb=document.getElementById('dtRenew');
  if(rb){ var ps=ctPeriods(c, mine);
    rb.innerHTML=ps.length? tpl`<div style="font-size:12px;color:var(--ink-2);opacity:.8;margin:14px 0 6px">계약 기간 · 연장 이력</div>`+
      tpl`<div class="tbl-wrap" tabindex="0"><table class="rn-tbl"><thead><tr><th>회차</th><th>기간</th><th class="n">월 금액(천원)</th><th class="n">노드</th><th>처리</th></tr></thead><tbody>${rawHtml(ps.map(function(p){
        return tpl`<tr><td><b>${p.k}</b></td><td>${p.from||'?'} ~ ${p.to||'?'}</td><td class="n">${rawHtml(p.mrr!=null? won(p.mrr) : '·')}</td><td class="n">${rawHtml(p.qty!=null? Number(p.qty).toLocaleString('ko-KR') : '·')}</td><td class="mini">${p.info}</td></tr>`; }).join(''))}</tbody></table></div>` : ''; }
  // 변경 이력
  var t=$('#dtLog'); t.innerHTML='<tbody><tr><td class="mini">불러오는 중…</td></tr></tbody>';
  sbTry('change_log?select=*&target_id=eq.'+c.id+'&order=id.desc&limit=50').then(function(rows){
    rows=rows||[];
    t.innerHTML=tpl`<thead><tr><th>시각</th><th>누가</th><th>동작</th><th>내용</th></tr></thead><tbody>`+ tpl`${rawHtml(rows.length? rows.map(function(x){
        return tpl`<tr><td>${rawHtml(String(x.at||'').replace('T',' ').slice(0,16))}</td><td>${x.actor||''}`+
          tpl`</td><td>${x.action||''}</td><td class="mini">${x.detail?JSON.stringify(x.detail).slice(0,90):''}</td></tr>`;
      }).join('') : '<tr><td colspan="4" class="mini">웹에서 수정한 기록이 없습니다 (최초 이관 데이터)</td></tr>')}`+ tpl`</tbody>`;
  });
}

export function gridRow(r,g,editing){
  var tr=document.createElement('tr');
  function view(){
    tr.innerHTML=visCols(g).map(function(c){
      var cl=[]; if(c.t==='number') cl.push('n'); var pc=pinCls(g,c); if(pc) cl.push(pc);
      var txt=fmtCell(c,r[c.k],r);
      /* ㊿+169 빈 칸 구분: «—» = 미입력(값이 있어야 할 수 있음) · 빈칸 = 해당 없음(c.na · 예/아니오 칸의 «아니오») */
      if(!c.html && (txt==null || txt==='' || txt==='·')){
        var na=c.t==='bool'; try{ if(c.na && c.na(r)) na=true; }catch(e){}
        cl.push(na? 'na':'nil');
        return na? tpl`<td class="${rawHtml(cl.join(' '))}" title="해당 없음"><span class="sr">해당 없음</span></td>` : tpl`<td class="${rawHtml(cl.join(' '))}" title="미입력">—</td>`;
      }
      var n=cl.length? tpl` class="${rawHtml(cl.join(' '))}"` : '';
      if(c.href && r[c.k]){
        return tpl`<td${rawHtml(n)}><a href="${c.href(r[c.k],r)}" target="_blank" `+
               tpl`style="color:var(--s1-ink);text-decoration:none">${txt}</a></td>`;
      }
      if(c.html) return tpl`<td${rawHtml(n)} style="white-space:normal">${rawHtml(txt)}</td>`;   /* fmt 가 안전한 HTML 을 만든 열 (시리얼 묶음 등) */
      if(c.badge) return tpl`<td${rawHtml(n)}><span class="ctag ${rawHtml(stBadge(txt))}">${txt}</span></td>`;   /* ㊿+169 상태 = 글자 + 배지 */
      return tpl`<td${rawHtml(n)}>${txt}</td>`;
    }).join('')+(g.ro?'':'<td class="act"></td>');
    if(g.rowClick){ tr.style.cursor='pointer'; tr.onclick=function(e){
      if(e.target.closest('button')||e.target.closest('input')||e.target.closest('select')||e.target.closest('a')) return;
      g.rowClick(r);
    }; }
    if(!g.ro){
      var act=tr.lastChild;
      /* ㊿+169 동작 버튼 = 같은 모양 아이콘 + 이름(aria-label · 툴팁) · 삭제는 «더보기» 안으로 */
      var ab=function(kind, ic, label, fn, cls){ var b=document.createElement('button'); b.type='button'; b.className='ab'+(cls? ' '+cls:''); b.dataset.act=kind; b.innerHTML=ico(ic,15); b.setAttribute('aria-label', label); b.title=label; b.onclick=fn; return b; };
      if(ST.CUR_VIEW==='contracts'){
        act.appendChild(ab('view','eye','상세 보기 — 계약 기간·연장 이력', function(){ openDetail(r); }));
      }
      if(ST.IS_VIEWER) return;
      if(ST.CUR_VIEW==='oi'){
        // 수주(이후) 단계 + 아직 계약 미연결 → 계약으로 전환
        if(['수주','계산서발행','종료'].indexOf(r.stage)>=0 && !r.contract_id){
          var bc=document.createElement('button'); bc.type='button'; bc.textContent='계약 전환'; bc.dataset.act='toContract'; bc.title='이 수주 건을 신규 계약으로 전환'; bc.setAttribute('aria-label','이 수주 건을 신규 계약으로 전환');
          bc.style.color='var(--good,#0ca30c)';
          bc.onclick=function(){ oiToContract(r); };
          act.appendChild(bc);
        }
        act.appendChild(ab('quote','clip', r.quote_file? '연결된 견적서 바꾸기·해제' : '견적서 연결', function(){ oiLinkQuote(r); }));
      }
      if(g.table==='equipment_orders' && eqWant(r).length && ['설치완료','회수예정','회수완료'].indexOf(r.status)>=0){
        act.appendChild(ab('return','undo','회수 처리 — 시리얼을 골라 일부·전부 회수 또는 회수 취소', function(){ eqRetOpen(r); }, 'ret'));
      }
      if(g.table==='equipment_assets' && r.order_id!=null){
        /* 현황은 신청 내역에서 만들어지는 저장소 — 신청에 붙은 장비는 여기서 고치지 않고 신청 내역(↩ 회수 처리 · ✎)에서 고칩니다 */
        var lk=ab('locked','lock','신청 #'+r.order_id+' 에서 만들어진 장비 — 수정·회수는 «임대 장비 신청 내역»에서(회수 처리)', function(){}, 'lk');
        lk.onclick=function(){ toast('신청 내역에서 수정', '이 장비는 신청 #'+r.order_id+' 에 붙어 있습니다. 임대 장비 신청 내역에서 «수정» 또는 «회수 처리»로 고치면 현황이 따라옵니다', 'info'); };
        act.appendChild(lk);
        return;
      }
      act.appendChild(ab('edit','edit','이 행 수정', function(){ edit(); }));
      var canDel = g.del===true || (g.del==='super' && ST.IS_SUPER);
      if(canDel){
        var bm=ab('more','more','더보기 — 삭제', function(){ rowMenu(bm, [{l:'삭제…', ic:'trash', danger:1, tip:'확인 후 삭제 — 되돌릴 수 없습니다', go:doDel}]); });
        bm.setAttribute('aria-haspopup','menu'); bm.setAttribute('aria-expanded','false');
        var doDel=function(){
          if(!ST.SB_TOKEN){ openOvl('ovlAuth'); return; }
          var warn='이 행을 삭제할까요?\n'+g.cols.slice(0,2).map(function(c){return r[c.k];}).join(' · ');
          if(g.table==='contracts') warn='계약을 삭제할까요?\n'+ (r._custName||'') +' · '+lline(r.line||'')+
            '\n\n이 계약의 월별 인식 금액도 함께 삭제되고 되돌릴 수 없습니다.';
          if(!confirm(warn)) return;
          sbWrite('DELETE',g.table+'?id=eq.'+r.id).then(function(){
            logChange('delete',g.table,r.id,{});
            toast('삭제되었습니다', g.title, 'info');
            var arr=g.rows(); var i=(ST.RAWX[ST.CUR_VIEW]||[]).indexOf(r); if(i>=0) ST.RAWX[ST.CUR_VIEW].splice(i,1);
            ST.DIRTY=true; try{ railSync(ST.CUR_VIEW); }catch(e){} renderGrid();
          }).catch(function(e){ $('#dvMsg').textContent=String(e.message||e); });
        };
        act.appendChild(bm);
      }
    }
  }
  function edit(){
    tr.innerHTML=tpl`${rawHtml(visCols(g).map(function(c){
      var pc=pinCls(g,c);
      return tpl`<td${rawHtml(pc? ' class="'+pc+'"':'')}>${rawHtml(c.ro? (c.html? fmtCell(c,r[c.k],r) : esc(fmtCell(c,r[c.k],r))) : editCell(c,r[c.k]))}</td>`;
    }).join(''))}`+ tpl`<td class="act"></td>`;
    wireRowInputs(tr,g);
    var act=tr.lastChild;
    var bs=document.createElement('button'); bs.textContent='저장'; bs.className='sv';
    bs.onclick=function(){
      if(!ST.SB_TOKEN){ openOvl('ovlAuth'); return; }
      try{
        var body=readRowInputs(tr,g);
        /* 다른 표에 붙는 열(예: 업종 = customers.sector)은 따로 떼어 그 표에 저장합니다 */
        var side=[];
        visCols(g).forEach(function(c){
          if(!c.tbl || !(c.k in body)) return;
          var val=body[c.k]; delete body[c.k];
          var refId=r[c.ref];
          if(!refId) return;
          if(String(val||'')===String(r[c.k]||'')) return;
          side.push({tbl:c.tbl, id:refId, col:c.src||c.k, val:val, key:c.k, label:c.l});
        });
        if(g.table==='equipment_assets' && body.status==='임대중' && body.returned_date &&
           confirm('상태는 «임대중»인데 회수일('+body.returned_date+')이 있습니다.\n회수일을 비우고 저장할까요?\n\n(취소 = 그대로 저장)')) body.returned_date=null;
        /* ㊿+157 금액 칸이 바뀌었으면 이상한 금액인지 한 번 확인 (이전의 5배↑·1/5↓ · 1만원 미만 · 월 1억원 이상) */
        var wonCols=g.cols.filter(function(c){ return c.won && c.t==='number' && (c.k in body) && Number(body[c.k]||0)!==Number(r[c.k]||0); });
        for(var wi=0; wi<wonCols.length; wi++){ var wc=wonCols[wi]; if(!amtGuard(body[wc.k], r[wc.k], wc.l.replace(/\(천원\)/,''), /^(mrr|monthly_fee)$/.test(wc.k))) return; }
        /* ㊿+157 계약의 MRR·시작월·종료월·상태(해지·종료)를 바꾸면 월 매출(월별 종합 장표)도 같이 맞춤 — 무엇을 바꾸는지 먼저 보여 주고 확인 */
        var revPlan=(g.table==='contracts')? ctRevPlan(r, body) : null;
        if(revPlan && revPlan.bad){ $('#dvMsg').textContent=revPlan.bad+' — 저장하지 않았습니다'; toast('저장하지 않았습니다', revPlan.bad, 'info'); return; }
        if(revPlan && revPlan.ops.length && !confirm('월 매출(월별 종합 장표)도 같이 맞춥니다:\n\n'+revPlan.lines.join('\n')+'\n\n[확인] 계약과 월 매출을 함께 저장\n[취소] 저장하지 않음 (월 매출만 따로 고치려면 ✏️ 입력·수정 › 금액 수정)')) return;
        if(revPlan && !revPlan.ops.length && revPlan.lines.length) toast('월 매출은 그대로', revPlan.lines.join(' ').replace(/^· /,''), 'info');
        var eqSync=(g.table==='equipment_orders');   /* 신청 내역을 저장하면 장비 현황을 항상 다시 맞춥니다 */
        if(eqSync && body.status==='회수완료' && r.status!=='회수완료' && !body.returned_date && !r.returned_date){
          body.returned_date=todayStr();               /* 회수완료로 바꾸는 날 = 회수일 (나중에 회수일 칸에서 수정 가능) */
          toast('회수일 자동 입력', body.returned_date+' — 다른 날이면 회수일 칸을 고쳐 저장하세요', 'info');
        }
        var sideJobs=side.map(function(x){
          var o={}; o[x.col]=x.val;
          return sbWrite('PATCH',x.tbl+'?id=eq.'+x.id,o).then(function(){
            logChange('update',x.tbl,x.id,o);
            r[x.key]=x.val;
            /* 같은 고객사의 다른 계약 행에도 즉시 반영 (다시 읽지 않아도 보이게) */
            (ST.RAWX.customers||[]).forEach(function(cu){ if(cu.id===x.id) cu[x.col]=x.val; });
            (ST.RAWX.contracts||[]).forEach(function(c2){ if(c2[ (x.tbl==='customers'?'customer_id':'id') ]===x.id) c2[x.key]=x.val; });
            toast(x.label+' 저장', '이 고객사의 모든 계약에 함께 반영됩니다', 'info');
          });
        });
        Promise.all(sideJobs).then(function(){
        return (Object.keys(body).length? sbWrite('PATCH',g.table+'?id=eq.'+r.id,body) : Promise.resolve()); }).then(function(){
          Object.keys(body).forEach(function(k){ r[k]=body[k]; });
          if(Object.keys(body).length) logChange('update',g.table,r.id,body);
          ST.DIRTY=true; $('#dvMsg').textContent='저장됨 ✅';
          toast('저장되었습니다', g.title);
          try{ railSync(ST.CUR_VIEW); }catch(e){}   /* ㊿+157 왼쪽 장비 아이콘의 «처리 대기» 빨간 숫자도 바로 (예전엔 장비 대시보드에서 바꿀 때만 줄었음) */
          if(revPlan && revPlan.ops.length) ctRevApply(r.id, revPlan).then(function(){
            toast('월 매출도 맞췄습니다', revPlan.lines.length+'건 — 월별 종합 장표에 반영', 'info');
            return loadFromDb().then(function(nd){ onData(nd); if(GRIDS[ST.CUR_VIEW]) renderGrid(); });
          }).catch(function(e){ $('#dvMsg').textContent='계약은 저장됐지만 월 매출 맞추기 실패: '+String(e.message||e); });
          if(eqSync) syncOrderAssets(r).then(function(x){
            if(x){ toast('장비 현황 자동 반영', x.replace(/^ · /,''), 'info');
                   ST.DIRTY=true; if(ST.CUR_VIEW==='orders'||ST.CUR_VIEW==='assets') renderGrid(); }
          });
          view();
        }).catch(function(e){ $('#dvMsg').textContent=String(e.message||e); });
      }catch(e){ $('#dvMsg').textContent=String(e.message||e); }
    };
    var bc=document.createElement('button'); bc.textContent='취소';
    bc.onclick=view;
    act.appendChild(bs); act.appendChild(bc);
  }
  if(editing) edit(); else view();
  return tr;
}

/* ===== ㊿+157 계약을 표에서 고칠 때 월 매출(monthly_revenue · 월별 종합 장표)도 맞추는 계획 (사용자 결정 «같이 맞춤»)
   c = 저장 전 계약 원본(RAWX.contracts 행) · body = 저장할 값(원) → {ops:[{m,p,b}], lines:[사람이 읽는 설명], bad:'막을 이유'}
   · 종료월을 당김 → 그 뒤 매출 삭제 · 시작월을 늦춤 → 그 앞 매출 삭제 · 상태를 해지·서비스종료로 → 해지월(없으면 종료월) 뒤 매출 삭제
   · MRR 변경 → 이번 달(시작 전이면 시작월)부터 종료월까지 새 금액으로 덮어씀 · 이미 끝난 계약이면 그대로(안내만)
   · 종료월을 늘림 / 시작월을 앞당김 → 새 기간 안에서 «매출이 비어 있는 달만» 채움(있는 금액은 안 건드림 · 지난 달은 예전 MRR · 해지·종료 계약은 안 채움) */
export function ctRevPlan(c, body, opt){
  var T=(ST.DATA&&ST.DATA.nowIdx)||0, has=function(k){ return Object.prototype.hasOwnProperty.call(body,k); };
  var ix=function(v){ return v? dIdx(v) : null; };
  var oS=ix(c.start_month), oE=ix(c.end_month), nS=has('start_month')? ix(body.start_month) : oS, nE=has('end_month')? ix(body.end_month) : oE;
  var oM=Number(c.mrr)||0, nM=has('mrr')? (Number(body.mrr)||0) : oM;
  var endish=function(st){ return /해지|서비스종료|종료/.test(String(st||'').replace(/\s/g,'')); };
  var nSt=has('status')? body.status : c.status, toTerm=has('status') && endish(body.status) && !endish(c.status), isTerm=endish(nSt);
  var ops=/** @type {Array<{m:string, p:string, b?:any}>} */ ([]), lines=[], P='monthly_revenue?contract_id=eq.'+c.id, cutAfter=null;
  if(nS!=null && nE!=null && nE<nS) return {ops:ops, lines:lines, bad:'종료월('+mk(nE)+')이 시작월('+mk(nS)+')보다 앞섭니다'};
  var have={}; (ST.RAWX.mrs||[]).forEach(function(x){ if(x.contract_id===c.id && Number(x.amount)) have[dIdx(x.month)]=1; });
  var mon=Object.keys(have).map(Number), first=mon.length? Math.min.apply(null, mon) : null, last=mon.length? Math.max.apply(null, mon) : null;
  var put=function(a, b, amt, why){ if(a==null || b==null || b<a || !(amt>0)) return; ops.push({m:'DELETE', p:P+'&month=gte.'+idxDate(a)+'&month=lte.'+idxDate(b)}); ops.push({m:'POST', p:'monthly_revenue', b:monthRows(c.id, a, b, amt)});
    for(var i=a;i<=b;i++) have[i]=1; lines.push('· '+mk(a)+(b>a? ' ~ '+mk(b) : '')+' 월 '+won(amt)+'천원('+wonKo(amt)+') — '+why); };
  var gap=function(a, b, why){   /* 비어 있는 달만 채움 — 이번 달 앞은 예전 MRR(없으면 새 MRR) · 이번 달부터는 새 MRR */
    if(a==null || b==null || b<a || isTerm) return; var rows=[], n=0;
    for(var i=a;i<=b;i++){ if(have[i]) continue; var amt=(i<T && oM>0)? oM : nM; if(!(amt>0)) continue; rows.push({contract_id:c.id, month:idxDate(i), amount:amt}); have[i]=1; n++; }
    if(!n) return; ops.push({m:'POST', p:'monthly_revenue', b:rows}); lines.push('· '+mk(a)+(b>a? ' ~ '+mk(b) : '')+' 중 비어 있던 '+n+'개월 채움 — '+why); };
  var after=function(e, why){ if(e==null || last==null || last<=e || (cutAfter!=null && cutAfter<=e)) return; cutAfter=e; ops.push({m:'DELETE', p:P+'&month=gt.'+idxDate(e)}); for(var i=e+1;i<=last;i++) delete have[i]; lines.push('· '+mk(e+1)+' 부터 매출 삭제 — '+why); };
  if(nE!=null && oE!==nE) after(nE, '종료월 '+mk(nE));
  if(nS!=null && first!=null && first<nS && oS!==nS){ ops.push({m:'DELETE', p:P+'&month=lt.'+idxDate(nS)}); for(var j=first;j<nS;j++) delete have[j]; lines.push('· '+mk(nS)+' 앞 매출 삭제 — 시작월 '+mk(nS)); }
  if(toTerm){ var ce=has('churn_month')&&body.churn_month? ix(body.churn_month) : (ix(c.churn_month)!=null? ix(c.churn_month) : nE);
    if(ce==null) lines.push('· 해지월·종료월이 없어 월 매출은 그대로입니다 — 해지월을 넣으면 그 뒤 매출을 지웁니다'); else after(ce, '상태 «'+body.status+'»'); }
  var to=(nE!=null? nE : last);
  if(nM!==oM && nM>0 && !isTerm && !(opt&&opt.noMrr)){
    var a0=Math.max(T, nS!=null? nS : T);
    if(to!=null && a0<=to) put(a0, to, nM, 'MRR '+wonKo(oM)+' → '+wonKo(nM));
    else if(to==null) lines.push('· 종료월·월 매출이 없어 월 매출은 만들지 않았습니다 — 기간은 ✏️ 입력·수정 › 갱신/금액 수정');
    else lines.push('· 이미 끝난 계약이라 월 매출은 그대로입니다 — 지난 달 금액은 ✏️ 입력·수정 › 금액 수정');
  }
  if(nE!=null && oE!=null && nE>oE) gap(Math.max(oE+1, nS!=null? nS : oE+1), nE, '종료월 '+mk(oE)+' → '+mk(nE));
  if(nS!=null && oS!=null && nS<oS) gap(nS, nE!=null? Math.min(oS-1, nE) : oS-1, '시작월 '+mk(oS)+' → '+mk(nS));
  return {ops:ops, lines:lines, bad:''};
}
export async function ctRevApply(id, plan, via){
  for(var i=0;i<plan.ops.length;i++){ var o=plan.ops[i]; await sbWrite(o.m, o.p, o.b, undefined, 'contracts'); }
  try{ await logChange('update','monthly_revenue',id,{_via:via||'계약 표 ✎', 맞춤:plan.lines}); }catch(e){}
}
export function gridAddRow(){
  var g=GRIDS[ST.CUR_VIEW]; if(!g||!g.add) return;
  if(!ST.SB_TOKEN){ openOvl('ovlAuth'); return; }
  var t=$('#dvTable'); var tb=t.querySelector('tbody'); if(!tb) return;
  var tr=document.createElement('tr');
  // 계산 열(설치율·신청 모듈처럼 ro 또는 «_» 로 시작)은 DB 에 없는 열 — 입력칸을 만들지 않음 (PGRST204 «_fill column» 오류 원인)
  tr.innerHTML=tpl`${rawHtml(g.cols.map(function(c){ return tpl`<td>${rawHtml((c.ro || c.k[0]==='_')? '<span class="mini">·</span>' : editCell(c,null))}</td>`; }).join(''))}<td class="act"></td>`;
  wireRowInputs(tr,g);
  var act=tr.lastChild;
  var bs=document.createElement('button'); bs.textContent='추가'; bs.className='sv';
  bs.onclick=function(){
    try{
      var body=readRowInputs(tr,g);
      // 자산: 이미 있는 시리얼이면 새 행 대신 기존 행을 찾아 보여줌
      if(g.table==='equipment_assets' && body.serial){
        var serU=String(body.serial).trim().toUpperCase(); body.serial=serU;
        var dup=(ST.RAWX.assets||[]).some(function(a){ return String(a.serial||'').toUpperCase()===serU; });
        if(dup){
          DV.chipVal=''; $('#dvSearch').value=serU; DV.page=0; renderGrid();
          $('#dvMsg').textContent='이미 등록된 시리얼입니다 — 아래 기존 행을 ✎ 버튼으로 수정해주세요.';
          toast('중복 시리얼', serU+' 은(는) 이미 자산 목록에 있습니다');
          return;
        }
      }
      var addWon=g.cols.filter(function(c){ return c.won && c.t==='number' && body[c.k]; });   /* ㊿+157 새 행의 금액도 확인 */
      for(var ai=0; ai<addWon.length; ai++){ if(!amtGuard(body[addWon[ai].k], 0, addWon[ai].l.replace(/\(천원\)/,''), /^(mrr|monthly_fee)$/.test(addWon[ai].k))) return; }
      sbWrite('POST',g.table+'?select=*',[body],'return=representation').then(function(rows){
        toast('추가되었습니다', g.title);
        if(g.table==='equipment_orders' && rows && rows[0]) syncOrderAssets(rows[0], null, true).catch(function(){});   /* 신청 → 현황 바로 반영 */
        ST.RAWX[ST.CUR_VIEW]=ST.RAWX[ST.CUR_VIEW]||[]; ST.RAWX[ST.CUR_VIEW].push(rows[0]);
        logChange('insert',g.table,rows[0].id,body);
        ST.DIRTY=true; $('#dvMsg').textContent='추가됨 ✅';
        try{ railSync(ST.CUR_VIEW); }catch(e){}
        renderGrid();
      }).catch(function(e){
        var s=String(e.message||e);
        if(s.indexOf('23505')>=0) s='이미 존재하는 값입니다 (중복 키) — 검색으로 기존 행을 찾아 수정해주세요.';
        $('#dvMsg').textContent=s;
      });
    }catch(e){ $('#dvMsg').textContent=String(e.message||e); }
  };
  var bc=document.createElement('button'); bc.textContent='취소'; bc.onclick=function(){ tr.remove(); };
  act.appendChild(bs); act.appendChild(bc);
  tb.insertBefore(tr, tb.firstChild);
  tr.querySelector('input,select') && tr.querySelector('input,select').focus();
}