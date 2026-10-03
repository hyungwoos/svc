/* ===== grid.js — 뒤로가기 · 콤보 입력 · 열 보이기 · 열 필터 · 데이터 그리드 렌더 =====
   포탈 본체(js/app.js)를 ④ 아키텍처 2단계(㊿+136)에서 기능별로 나눈 파일. 전역 var/function 그대로 — 즉시 실행 문장은 전부 js/init.js 에.
   로드 순서는 index.html <meta name="app-js"> (js/load.js 가 그 순서대로 ?v=APP_VER 를 붙여 불러옴) */


/* ---- 뒤로가기 — 화면 이동을 브라우저 히스토리에 남겨 상단 ← 버튼·브라우저/폰 뒤로가기·Alt+← 가 모두 이전 화면으로 ----
   주소 해시(#oi 처럼)에 현재 화면을 적어 두므로 새로고침·링크 공유 때도 그 화면이 열립니다. */
var NAV={i:0, pop:false, ready:false};
function navValid(v){ return v==='dash' || !!document.querySelector('#side button[data-v="'+v+'"]'); }
function navDepth(){ try{ return (history.state && typeof history.state.i==='number')? history.state.i : 0; }catch(e){ return 0; } }
function navRecord(prev, v){
  if(NAV.pop || prev===v) return;
  try{
    if(NAV.ready){ NAV.i++; history.pushState({v:v, i:NAV.i}, '', location.pathname+location.search+'#'+v); }
    else history.replaceState({v:v, i:0}, '', location.pathname+location.search+(v==='dash'?'':'#'+v));
  }catch(e){}
  btnBackSync();
}
function btnBackSync(){ var b=document.getElementById('btnBack'); if(!b) return; b.style.display=(navDepth()>0 || (CUR_VIEW && CUR_VIEW!=='dash'))? 'inline-flex':'none'; }
function goBack(){
  if(navDepth()>0){ history.back(); return; }           // 이 포탈 안에서 쌓인 이동만 되돌림 (포탈 밖으로 나가지 않음) · popstate 가 화면을 바꿈
  if(CUR_VIEW!=='dash') switchView('dash');
}


/* Backspace = 뒤로가기 — 글자를 입력하는 칸(input·textarea·select·편집 가능 영역)에 커서가 있을 때는 그대로 글자 지우기 */

function switchView(v){
  if(v==='mdrpoc') v='mdrops';                       // 통합 전 이름 호환
  if((v==='ordernew'||v==='mdrnew'||v==='oinew'||v==='csite'||v==='preport'||v==='s1'||v==='kk') && !SB_TOKEN){ openOvl('ovlAuth'); return; }
  if(window.IS_EQUIP && !EQUIP_VIEWS[v]) v=window.EQUIP_HOME||'orders';   // 제한 계정은 허용된 화면만
  if(v==='log' && !window.IS_SUPER) v='dash';                             // 변경 이력은 슈퍼 관리자만
  if(v==='ops' && !window.IS_SUPER) v='dash';                             // 배포·운영도 슈퍼 관리자만 (함수가 다시 OPS_OWNER 로 좁힘)
  if(v==='csite' && !window.IS_SUPER){ toast('권한 없음','Cloud 사이트 생성·수정은 슈퍼 관리자만 할 수 있습니다','info'); v='dash'; }
  if(!canView(v)){ toast('권한 없음','이 메뉴는 보기 권한이 없습니다 — 슈퍼 관리자에게 요청하세요','info'); v='dash'; }
  permEnter(v);
  try{ navRecord(CUR_VIEW, v); }catch(e){}
  CUR_VIEW=v;
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
  if(adminx && !window.IS_SUPER){ v='dash'; dash=true; adminx=false; CUR_VIEW='dash'; }
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
  if(ops){ renderOps(); return; }
  if(csite){ renderCsite(); return; }
  if(report){ renderReport(); return; }
  if(churn){ renderChurn(); return; }
  if(crate){ renderChurnRate(); return; }
  if(cflow){ renderCustFlow(); return; }
  if(price){ renderPrice(); return; }
  if(cloud){ renderCloud(); return; }
  if(inbstat){ renderInbStat(); return; }
  if(weekly){ renderWeekly(); return; }
  if(adminx){ renderAdmin(); return; }
  if(chv){ renderChannelView(v); return; }
  if(acct){ renderAccount(); return; }
  if(onew){
    msg('odMsg','');
    $('#odFormWrap').style.display='';
    $('#odDone').style.display='none';
    loadRecvPresets();
    setTimeout(function(){ $('#odCustomer').focus(); },50);
    return;
  }
  if(oinew){
    msg('oiMsg','');
    $('#oiFormWrap').style.display='';
    $('#oiDone').style.display='none';
    initOiForm();
    setTimeout(function(){ $('#oiCust').focus(); },50);
    return;
  }
  if(mnew){
    msg('mpMsg','');
    $('#mpFormWrap').style.display='';
    $('#mpDone').style.display='none';
    if(!$('#mpDate').value) $('#mpDate').value=todayStr();
    if(!$('#mpSales').value && AUTH_USER) $('#mpSales').value='';
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
    if(DIRTY){ DIRTY=false; loadFromDb().then(onData); }
    return;
  }
  if(v==='aiknow' && !RAWX.aiknow){
    sbTry('ai_knowledge?select=*&order=id').then(function(rows){ RAWX.aiknow=rows||[]; if(CUR_VIEW==='aiknow') renderGrid(); });
  }
  if(v==='leadsrc' || v==='contracts') ensureLeadSrc(function(){ if(CUR_VIEW===v) renderGrid(); });   // load_all 이 lead_src 를 안 주는 버전이면 따로 채움
  if(v==='log' && !RAWX.log){
    sbTry('change_log?select=*&order=id.desc&limit=300').then(function(rows){
      RAWX.log=rows||[]; renderGrid();
    });
  }
  if(v==='inbound' && !RAWX.inbound){
    loadInbound(function(){ if(CUR_VIEW==='inbound') renderGrid(); });
  }
  DV.page=0; DV.sortK=null; DV.sortDir=1; DV.chipVal=''; DV.filters={}; closeColFilter();
  var g=GRIDS[v];
  renderOiTiles(v==='oi');
  /* 금액 열(won:1)이 있는 표는 제목 옆에 «천원 단위» 배지를 붙입니다 */
  var hasWon=(g.cols||[]).some(function(c){ return c.won; });
  $('#dvTitle').innerHTML=esc(g.title)+(hasWon? ' <span class="ubadge sm">₩ 금액 단위 = 천원</span>':'');
  $('#dvCap').textContent=g.cap + (hasWon? ' · 표의 금액은 천원 단위 (입력·수정 창은 원 단위)':'') + (window.IS_VIEWER? ' · 조회 전용 계정입니다':'');
  $('#dvAdd').style.display=(g.add && !window.IS_VIEWER)?'':'none';
  $('#dvPaste').style.display=(g.add && !window.IS_VIEWER)?'':'none';
  $('#dvSearch').value='';
  renderGrid();
  applyDense();
}

function fmtCell(c,v,r){
  if(c.fmt) return c.fmt(v,r);
  if(v===null||v===undefined||v==='') return '·';
  if(c.t==='month') return String(v).slice(0,7);
  if(c.t==='date') return String(v).slice(0,10);
  if(c.t==='bool') return v? '중복':'·';
  if(c.t==='number') return (c.won? Math.round(Number(v)/1000):Number(v)).toLocaleString('ko-KR');
  return String(v);
}
function editCell(c,v){
  /* 참고: 금액 열(c.won)은 화면 표시만 천원 단위이며, 입력·저장 값은 원 단위 그대로입니다 */
  if(c.t==='select'){
    var opts=(typeof c.opts==='function'? c.opts():c.opts).slice();
    if(!c.req && opts.indexOf('')<0) opts.unshift('');              // 비울 수 있게
    var cv=(v==null?'':String(v));
    // 공백만 다른 표기(예: '서비스 종료' vs '서비스종료')는 같은 값으로 취급 → 중복 옵션 방지
    var nz=function(x){ return String(x).replace(/\s+/g,''); };
    var same=opts.filter(function(o){ return nz(o)===nz(cv); })[0];
    if(cv && same!==undefined) cv=same;
    else if(cv && opts.indexOf(cv)<0) opts.splice(1,0,cv);           // 정말 없는 값만 보존
    return '<select data-k="'+c.k+'">'+opts.map(function(o){
      var lb=(c.k==='line')? lline(o) : (o===''? '— 없음 —' : o);
      return '<option value="'+esc(o)+'"'+(cv===o?' selected':'')+'>'+esc(lb)+'</option>';}).join('')+'</select>';
  }
  if(c.t==='list'){
    /* 목록에서 고르거나 직접 입력 — 칸을 누르면(또는 ▾) 값이 이미 있어도 전체 목록이 열립니다 */
    return '<span class="cbo"><input type="text" class="cbi" data-k="'+c.k+'" autocomplete="off" value="'+esc(v==null?'':String(v))+'">'+
           '<button type="button" class="cbb" tabindex="-1" title="목록 열기">▾</button></span>';
  }
  if(c.t==='bool') return '<input type="checkbox" data-k="'+c.k+'"'+(v?' checked':'')+'>';
  var ty=c.t==='month'?'month':c.t==='date'?'date':c.t==='number'?'number':'text';
  var val=v==null?'':(c.t==='month'?String(v).slice(0,7):c.t==='date'?String(v).slice(0,10):v);
  /* 금액 열은 «원 단위로 입력»임을 입력칸에서도 알 수 있게 안내 */
  var hint=(c.won&&c.t==='number')? ' placeholder="원 단위" title="원 단위로 입력하세요 — 목록·대시보드에는 천원으로 표시됩니다"':'';
  return '<input type="'+ty+'" data-k="'+c.k+'" value="'+esc(String(val))+'"'+hint+'>';
}
/* 편집 행의 입력칸 보조 동작
   · 날짜 칸: 값이 있으면 옆에 ✕(비우기) — 브라우저 날짜 입력은 지우는 법이 잘 안 보입니다
   · 임대 장비: 상태를 «임대중»으로 바꾸면 회수일을 비우고, «회수완료»로 바꾸면 회수일이 비어 있을 때 오늘을 넣습니다 */
/* ===== 목록형 입력칸(콤보) =====
   칸을 누르면 전체 목록이 뜨고, 글자를 치면 그에 맞게 좁혀집니다. 목록에 없는 값도 그대로 입력해 저장할 수 있습니다. */
var CB={inp:null, off:null};
function comboClose(){
  var m=document.getElementById('cbMenu'); if(m) m.remove();
  if(CB.off){ document.removeEventListener('mousedown', CB.off, true); CB.off=null; }
  CB.inp=null;
}
/* 열려 있는 목록을 입력칸 아래(또는 위)에 다시 붙입니다 — 표를 스크롤해도 따라다니게 */
function comboPlace(){
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
function comboWire(inp, opts, onPick){
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
      return '<div class="it'+(o===cur?' cur':'')+'" data-v="'+esc(o)+'">'+esc(o)+'</div>'; }).join('')+
      (cur && opts.indexOf(cur)<0? '<div class="sep"></div><div class="hint">지금 값 「'+esc(cur)+'」 은 목록에 없지만 그대로 저장됩니다</div>':'')+
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


function wireRowInputs(tr,g){
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
function readRowInputs(tr,g){
  var body={};
  tr.querySelectorAll('[data-k]').forEach(function(inp){
    var c=g.cols.filter(function(x){return x.k===inp.dataset.k;})[0];
    if(!c || c.ro || c.k[0]==='_') return;          // 계산 열은 저장하지 않음
    var v;
    if(c.t==='bool') v=inp.checked;
    else if(c.t==='select' && c.num) v=Number(inp.value);
    else if(c.t==='number') v=inp.value===''? null: Number(inp.value);
    else if(c.t==='month') v=inp.value? inp.value+'-01': null;
    else if(c.t==='date') v=inp.value||null;
    else v=inp.value.trim()||null;
    if(c.req && (v===null||v==='')) throw new Error('「'+c.l+'」 은 필수입니다.');
    body[c.k]=v;
  });
  return body;
}

var DV={page:0, per:100, sortK:null, sortDir:1, filters:{}};

/* ===== 열 보이기/숨기기 (화면마다 따로 기억) =====
   계약처럼 열이 많은 표에서 지금 보고 싶은 열만 남깁니다. 숨겨도 값은 그대로 있고 검색·엑셀 내려받기에만 빠집니다. */
var HIDE={};
function hideKey(){ return 'svc_hidecols_'+(AUTH_USER||'anon'); }
function loadHide(){ try{ HIDE=JSON.parse(localStorage.getItem(hideKey())||'{}')||{}; }catch(e){ HIDE={}; } }
function saveHide(){ try{ localStorage.setItem(hideKey(), JSON.stringify(HIDE)); }catch(e){} }
function hiddenSet(view){ return (HIDE[view]||[]); }
function visCols(g){
  var h=hiddenSet(CUR_VIEW);
  if(!h.length) return g.cols;
  var out=g.cols.filter(function(c){ return h.indexOf(c.k)<0; });
  return out.length? out : g.cols;      /* 전부 숨기면 아무것도 안 보이니 원래대로 */
}
function openColPick(btn){
  var g=GRIDS[CUR_VIEW]; if(!g||g.custom) return;
  closeColFilter();
  var old=document.getElementById('colPick'); if(old) old.remove();
  var h=hiddenSet(CUR_VIEW).slice();
  var box=document.createElement('div'); box.id='colPick'; box.className='colmenu';
  box.style.cssText='position:absolute;z-index:80;background:var(--surface);border:1px solid var(--ring);border-radius:12px;'+
    'box-shadow:0 10px 30px rgba(0,0,0,.18);padding:10px;min-width:250px;max-height:60vh;overflow:auto;font-size:12px';
  var r=btn.getBoundingClientRect();
  box.style.left=Math.max(8, Math.min(r.left+window.scrollX, window.innerWidth-280))+'px';
  box.style.top=(r.bottom+window.scrollY+6)+'px';
  var head=document.createElement('div');
  head.style.cssText='display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap';
  head.innerHTML='<b style="font-size:12px">보일 열 고르기</b><span class="mini" style="color:var(--muted)">'+(g.cols.length-h.length)+'/'+g.cols.length+'</span>';
  var all=document.createElement('button'); all.className='chip'; all.textContent='전체 보기';
  all.onclick=function(){ HIDE[CUR_VIEW]=[]; saveHide(); box.remove(); renderGrid(); };
  head.appendChild(all);
  box.appendChild(head);
  g.cols.forEach(function(c){
    var lb=document.createElement('label');
    lb.style.cssText='display:flex;gap:7px;align-items:center;padding:4px 2px;cursor:pointer';
    var cb=document.createElement('input'); cb.type='checkbox'; cb.checked=h.indexOf(c.k)<0; cb.style.width='auto';
    cb.onchange=function(){
      var cur=hiddenSet(CUR_VIEW).slice();
      var i=cur.indexOf(c.k);
      if(cb.checked){ if(i>=0) cur.splice(i,1); } else if(i<0) cur.push(c.k);
      HIDE[CUR_VIEW]=cur; saveHide(); renderGrid();
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
var BLANK_LABEL='(빈 값)';
function cellText(c,v,r){
  var t;
  /* 계산 열(업종·설치율·경과일 등)은 fmt 가 행 전체를 봐야 값이 나옵니다 —
     행을 넘기지 않으면 모든 행이 «(빈 값)» 으로 잡힙니다 */
  try{ t=fmtCell(c,v,r); }catch(e){ t=v; }
  t=String(t==null?'':t).replace(/<[^>]*>/g,'').trim();
  if(t==='' || t==='·') t=BLANK_LABEL;
  return t;
}
function filterCount(){ var n=0; for(var k in DV.filters){ if(DV.filters[k]&&DV.filters[k].length) n++; } return n; }
function clearFilters(){ DV.filters={}; DV.lens=''; DV.page=0; renderGrid(); }
/* skipK 열의 필터만 빼고 나머지 조건을 통과하는지 */
function passFilters(r,g,skipK){
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
function baseRows(g,skipK){
  var q=($('#dvSearch').value||'').trim().toLowerCase();
  var toks=q? q.split(/\s+/).filter(Boolean):[];
  return g.rows().filter(function(r){
    if(g.chipsField && DV.chipVal && String(r[g.chipsField]||'')!==DV.chipVal) return false;
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

function closeColFilter(){
  var el=document.getElementById('colfPanel');
  if(el) el.remove();
  document.removeEventListener('mousedown',colfOutside,true);
  document.removeEventListener('keydown',colfEsc,true);
}
function colfOutside(e){
  var el=document.getElementById('colfPanel');
  if(el && !el.contains(e.target)) closeColFilter();
}
function colfEsc(e){ if(e.key==='Escape') closeColFilter(); }

/* 열의 값 목록을 세어서 범용 패널을 띄운다 */
function openColFilter(anchor,g,c){
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
function openFilterPanel(anchor,opt){
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
  el.innerHTML='<div class="colf-h">'+esc(opt.label)+' — 볼 값 고르기'+
      '<span id="colfCnt" style="float:right;font-weight:600;opacity:.65"></span></div>'+
    '<input type="search" id="colfQ" placeholder="값 검색 — 찾은 뒤 「모두」 를 누르면 그것만 선택">'+
    '<div class="colf-list" id="colfList"></div>'+
    '<div class="colf-a">'+
      '<button type="button" id="colfAll" title="검색 중이면 검색 결과만 선택, 아니면 전체 선택">모두</button>'+
      '<button type="button" id="colfNone" title="선택 전부 해제">해제</button>'+
      '<span style="flex:1"></span>'+
      '<button type="button" id="colfCancel">취소</button>'+
      '<button type="button" class="pri" id="colfOk">적용</button>'+
    '</div>';
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
      return '<label class="colf-i"><input type="checkbox" data-v="'+esc(v)+'"'+(picked[v]?' checked':'')+'>'+
        '<span class="t" title="'+esc(v)+'">'+esc(v)+'</span><span class="n">'+(cnt[v]||0)+'</span></label>';
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

function gridFilteredSorted(g){
  // 검색 개선: 공백 무시 + 여러 단어 AND + 표시명(예: MDR_S1→S1 MDR)도 함께 검색
  var q=($('#dvSearch').value||'').trim().toLowerCase();
  var toks=q? q.split(/\s+/).filter(Boolean):[];
  var rows=g.rows().filter(function(r){
    if(g._lens && !g._lens[r.id]) return false;                                   // 관점 필터(계약 메뉴)
    if(g.chipsField && DV.chipVal && String(r[g.chipsField]||'')!==DV.chipVal) return false;
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

function loadXlsxLib(){ return loadLib('xlsx'); }
async function xlsxBook(name, sheets){                       // sheets: [{name, head, rows}]
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
function xlsxAoa(name, head, rows){ return xlsxBook(name, [{name:'Sheet1', head:head, rows:rows}]); }
async function exportXlsx(){
  var g=GRIDS[CUR_VIEW]; if(!g) return;
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
function exportCsv(){
  var g=GRIDS[CUR_VIEW]; if(!g) return;
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
var LENS_DEFS=[
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
var LENS_DESC={}; 
function lensSets(){
  var cts=RAWX.contracts||[], cus={}; (RAWX.customers||[]).forEach(function(c){ cus[c.id]=c; });
  var nowYm=(DATA&&DATA.nowIdx>=0? mk(DATA.nowIdx) : new Date().toISOString().slice(0,7))+'-01';
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
  if(window.DATA && DATA.rows){ var lvNow=liveCalc(DATA.nowIdx); lvNow.rows.forEach(function(x){ (x.ids||[]).forEach(function(id){ var c=byId[id]; if(c) add('live',c); }); }); }
  LENS_DEFS.forEach(function(d){ var u={}; Object.keys(out[d[0]].ids).forEach(function(id){ var c=byId[id]; if(c) u[c.customer_id]=1; }); out[d[0]].n=Object.keys(u).length; out[d[0]].nRows=Object.keys(out[d[0]].ids).length; });
  return out;
}
/* LIVE 고객사 메뉴 상단 — 보기 전환(계약 기준 / 시트 명단) · 기준월 · 요약 · 대조 표 · 도움말 */
function renderLiveBar(lb){
  var isDb=(LIVE_SRC!=='sheet'), T=(LV.T!=null? LV.T : STATE.base), lv=liveCalc(T), sh=(DATA.live&&DATA.live.ok)? DATA.live : null;
  var perLine={}; lv.rows.forEach(function(x){ perLine[x.line]=(perLine[x.line]||0)+1; });
  var lineTxt=Object.keys(perLine).sort().map(function(l){ return lline(l)+' '+perLine[l]; }).join(' · ');
  var h='<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;width:100%">'+
    '<div class="seg" title="LIVE 고객사를 어디에서 가져올지"><button data-lsrc="db" aria-pressed="'+isDb+'" title="계약 표로 자동 판정 — 등록·해지가 그대로 반영됩니다">계약 기준(자동)</button><button data-lsrc="sheet" aria-pressed="'+(!isDb)+'" title="예전 LIVE 고객사 탭을 옮겨 둔 명단 — 대조·편집용">시트 명단</button></div>';
  if(isDb){
    var opts=''; for(var i=DATA.nowIdx+3;i>=Math.max(0,DATA.nowIdx-36);i--){ opts+='<option value="'+i+'"'+(i===T?' selected':'')+'>'+mk(i)+(i===DATA.nowIdx?' (이번 달)':'')+'</option>'; }
    h+='<label class="mini" style="display:flex;align-items:center;gap:6px">기준월 <select id="lvMonth" style="font:inherit;padding:4px 6px;border:1px solid var(--ring);border-radius:8px;background:var(--surface-2);color:inherit">'+opts+'</select></label>';
    h+='<span class="mini"><b>'+mk(T)+'</b> LIVE <b>'+lv.uniq+'곳</b>(회사) · 제품별 합 <b>'+lv.count+'</b> — '+lineTxt+(sh? ' · 시트 명단 '+sh.uniq+'곳 / '+sh.count+'건':'')+'</span>';
    if(sh){ var df=liveDiff(T); var nd=df.onlyDb.length+df.onlySheet.length;
      h+='<button class="chip" id="lvDiffBtn" aria-pressed="'+LV.diff+'" title="계약 기준과 시트 명단이 다른 곳만 보기">'+(nd? '⚠ 시트와 다른 곳 '+nd:'✓ 시트 명단과 일치')+'</button>'; }
  } else {
    h+='<span class="mini">시트 명단 <b>'+(sh?sh.uniq:0)+'곳</b> / '+(sh?sh.count:0)+'건 · 계약 기준 '+mk(T)+' '+lv.uniq+'곳</span>';
  }
  h+='<span class="mini" style="color:var(--muted)">'+(isDb? '따로 등록하지 않습니다 — 계약이 등록·해지되면 자동으로 바뀝니다':'이 명단은 직접 고쳐야 하며 대시보드에는 쓰이지 않습니다')+'</span></div>';
  if(isDb && sh && LV.diff){
    var d=liveDiff(T);
    function rowsOf(arr, kind){ if(!arr.length) return '<tr><td colspan="4" class="mini" style="color:var(--muted)">없음</td></tr>';
      return arr.map(function(x){ return '<tr><td>'+esc(x.cust)+'</td><td>'+esc(lline(x.line))+'</td><td>'+esc(kind==='db'? (x.basis||'') : x.why)+'</td><td>'+(kind==='db'? '시트 LIVE 탭에 추가하면 같아짐' : (/계약 없음/.test(x.why)? '계약을 등록하거나 사명을 맞춤(사명 변경 기능)' : /계약 예정/.test(x.why)? '시작하면 계약 화면에서 시작월 입력' : /no_count/.test(x.why)? '매출만 세는 행 — 시트에서도 «중복»으로 빼는 행이라 정상' : /예외 제외/.test(x.why)? '계약의 LIVE 예외 «제외» 지정 — 의도한 것' : /해지|종료/.test(x.why)? '시트 명단에서 빼야 함' : /만기/.test(x.why)? '재약정이면 연장 등록, 끝났으면 해지 처리' : '계약 화면 확인'))+'</td></tr>'; }).join(''); }
    h+='<div style="flex-basis:100%;margin-top:6px;padding:10px 12px;border:1px solid var(--ring);border-radius:10px;background:var(--surface-2,rgba(0,0,0,.02))">'+
      '<div class="mini" style="margin-bottom:6px"><b>계약 기준 '+mk(T)+'</b> '+d.db.uniq+'곳 vs <b>시트 명단</b> '+d.sheetN+'곳 — 이름은 띄어쓰기·(주)·괄호·별칭을 무시하고 맞춰 봤습니다. 아래 항목이 0이 되면 두 숫자가 같아집니다.</div>'+
      '<div style="overflow-x:auto"><table class="pr"><thead><tr><th>고객사</th><th>서비스</th><th>왜 다른가</th><th>어떻게 맞추나</th></tr></thead><tbody>'+
      '<tr><td colspan="4" style="background:var(--surface)"><b>계약으로는 LIVE 인데 시트 명단에 없음 — '+d.onlyDb.length+'</b></td></tr>'+rowsOf(d.onlyDb,'db')+
      '<tr><td colspan="4" style="background:var(--surface)"><b>시트 명단에는 있는데 계약으로는 LIVE 아님 — '+d.onlySheet.length+'</b></td></tr>'+rowsOf(d.onlySheet,'sheet')+
      '</tbody></table></div></div>';
  }
  h+='<div style="flex-basis:100%">'+helpBox('live', 'LIVE 고객사는 어떻게 정해지나요?', [
    ['계약 기준(자동)', '계약 표에서 <b>기준월에 유효한 원계약</b>이 있는 회사를 제품마다 1행으로 보여줍니다. 시작월 ≤ 기준월이고, 종료월이 없거나 기준월 이후면 LIVE. <b>해지</b>는 해지월부터 빠지고, 만기 달(종료월 = 기준월)은 아직 LIVE(재약정 대기)로 봅니다.'],
    ['빠지는 계약', '부속 계약(추가 구매)·상태 «통합과금»(에스원 CND 묶음 과금)·«추가»·고객 수 제외 행(no_count)·판매형태 H/W. 시작월이 비어 있으면 «계약 예정»으로 LIVE 아님.'],
    ['CN전환', 'CND(DeviceKeeper)에서 S1 Basic 으로 바뀌어 에스원 통합 과금으로 계속 쓰는 고객 — 종료월이 없으므로 항상 LIVE.'],
    ['최초 개시월 / 현행', '최초 개시월 = 그 회사·제품의 가장 이른 계약 시작월(재약정을 거쳐도 처음 시작한 달). 현행 = 지금 유효한 계약의 시작·종료월·CSM·노드(부속 계약 노드 포함).'],
    ['예외', '규칙으로 안 잡히는 경우(무상 시범, 파트너 내부용 등)는 계약 행의 «LIVE 예외»를 포함/제외로 두면 규칙보다 우선합니다. 예외 열에 사유가 보입니다.'],
    ['등록·삭제', '따로 등록하지 않습니다. 새 고객 → 입력·수정 › 계약에서 신규 계약(시작월·노드·CSM 입력) · 빠질 때 → 상태 «해지»와 해지월. 저장하면 LIVE·대시보드·해지율이 한 번에 바뀝니다.'],
    ['시트 명단', '예전 매출시트 «LIVE 고객사» 탭을 옮겨 둔 표(대조용). «시트와 다른 곳» 버튼으로 두 기준의 차이를 항목별로 볼 수 있습니다.']
  ], '기준월을 바꾸면 그 시점의 LIVE 명단이 나옵니다 — 시트로는 못 보던 과거 시점 비교가 됩니다.')+'</div>';
  lb.innerHTML=h;
  lb.querySelectorAll('button[data-lsrc]').forEach(function(b){ b.onclick=function(){ setLiveSrc(b.dataset.lsrc); DV.page=0; DV.filters={}; DV.sortK=null; switchView('live'); }; });
  var ms=lb.querySelector('#lvMonth'); if(ms) ms.onchange=function(){ LV.T=+ms.value; DV.page=0; renderGrid(); };
  var db=lb.querySelector('#lvDiffBtn'); if(db) db.onclick=function(){ LV.diff=!LV.diff; renderGrid(); };
  helpWire(lb);
}
function renderGrid(){
  var g=GRIDS[CUR_VIEW]; if(!g) return;
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
      if(DV.chipVal===v||(!DV.chipVal&&!v)){ btn.style.background='var(--brand,#149e40)'; btn.style.borderColor='var(--brand,#149e40)'; btn.style.color='#fff'; }
      btn.textContent=op;
      btn.onclick=function(){ DV.chipVal=v; DV.page=0; renderGrid(); };
      cb.appendChild(btn);
    });
  } else cb.style.display='none';
  /* 관점 필터(계약 메뉴 전용): 여러 제품 고객사 · 부속 계약 · 중복 등록 의심 · 계약 예정 … 한 번에 보기 */
  var lb=document.getElementById('dvLensBar');
  if(!lb){ lb=document.createElement('div'); lb.id='dvLensBar'; lb.style.cssText='display:none;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px';
    var bar2=$('#dvSearch').parentElement; bar2.parentElement.insertBefore(lb,bar2); }
  if(CUR_VIEW==='contracts' && !isCustom){
    lb.style.display='flex'; lb.innerHTML='<span class="mini" style="color:var(--muted);margin-right:2px">관점</span>';
    var LS=lensSets();
    var zero=LENS_DEFS.filter(function(d){ return !LS[d[0]].n; }).length;   /* ⑤ UX: 0곳인 관점은 접어 둠 (칩 10개가 늘어서 있던 것) */
    [['','전체','모든 계약']].concat(LENS_DEFS.map(function(d){ return [d[0], d[1]+' '+LS[d[0]].n+'곳', d[2]+' · 계약 '+LS[d[0]].nRows+'건']; })).forEach(function(op){
      var v=op[0], on=(DV.lens||'')===v;
      if(v && !LS[v].n && !DV.lensAll) return;
      var btn=document.createElement('button'); btn.className='chip'; btn.setAttribute('aria-pressed', on?'true':'false'); btn.textContent=op[1]; btn.title=op[2];
      if(v && !LS[v].n){ btn.disabled=true; btn.style.opacity=.45; }
      btn.onclick=function(){ DV.lens=(on? '':v); DV.page=0; renderGrid(); };
      lb.appendChild(btn);
    });
    if(zero){ var zb=document.createElement('button'); zb.type='button'; zb.className='mini'; zb.style.cssText='border:0;background:transparent;color:var(--muted);cursor:pointer;padding:0 4px;font:inherit;font-size:11.5px'; zb.textContent=DV.lensAll? '빈 관점 접기' : '+ 해당 없음 '+zero+'개'; zb.onclick=function(){ DV.lensAll=!DV.lensAll; renderGrid(); }; lb.appendChild(zb); }
    if(DV.lens && LENS_DESC[DV.lens]){ var dsc=document.createElement('span'); dsc.className='mini'; dsc.style.cssText='color:var(--ink-2);flex-basis:100%;margin-top:2px'; dsc.textContent='ⓘ '+LENS_DESC[DV.lens]; lb.appendChild(dsc); }
    g._lens=(DV.lens && LS[DV.lens])? LS[DV.lens].ids : null;
  } else if(CUR_VIEW==='live'){ lb.style.display='flex'; renderLiveBar(lb); g._lens=null; }
  else { lb.style.display='none'; g._lens=null; }
  ['dvSearch','dvCsv','dvCols'].forEach(function(id){ $('#'+id).style.display=isCustom?'none':''; });
  var nHid=hiddenSet(CUR_VIEW).filter(function(k){ return g.cols.some(function(c){ return c.k===k; }); }).length;
  var cbtn2=$('#dvCols'); if(cbtn2 && !isCustom){ cbtn2.textContent=nHid? ('🧱 열 '+(g.cols.length-nHid)+'/'+g.cols.length) : '🧱 열';
    cbtn2.style.borderColor=nHid?'var(--s1)':''; cbtn2.style.color=nHid?'var(--s1)':''; }
  var nf=filterCount();
  var fc=$('#dvFclr');
  fc.style.display=(isCustom||!nf)?'none':'';
  fc.textContent='✕ 필터 해제 ('+nf+')';
  $('#dvPager').style.display=isCustom?'none':'';
  try{ renderEqPanel(); }catch(e){}
  try{ renderInbPanel(); }catch(e){}
  if(isCustom){ g.custom(); return; }
  var bh=document.getElementById('bizHost'); if(bh) bh.style.display='none';
  $('#dvTable').parentElement.style.display='';
  var rows=gridFilteredSorted(g);

  /* 페이지 */
  var totalPages=Math.max(1,Math.ceil(rows.length/DV.per));
  if(DV.page>=totalPages) DV.page=totalPages-1;
  var start=DV.page*DV.per;
  var pageRows=rows.slice(start,start+DV.per);

  $('#dvCount').textContent=rows.length.toLocaleString('ko-KR')+'행 · '+
    (rows.length? (start+1)+'–'+(start+pageRows.length) : '0');

  var t=$('#dvTable'); t.innerHTML='';
  var thead=document.createElement('thead');
  var tr0=document.createElement('tr');
  visCols(g).forEach(function(c){
    var th=document.createElement('th');
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
    fb.textContent='▼';
    fb.title=on? ('필터 적용 중 ('+DV.filters[c.k].length+'개 값) — 클릭해서 바꾸기') : '값 골라 보기';
    fb.onclick=function(ev){ ev.stopPropagation(); openColFilter(fb,g,c); };
    wrap.appendChild(lab); wrap.appendChild(fb);
    th.appendChild(wrap);
    tr0.appendChild(th);
  });
  if(!g.ro){ var th2=document.createElement('th'); th2.style.width='110px'; th2.className='act'; tr0.appendChild(th2); }
  thead.appendChild(tr0);
  t.appendChild(thead);

  var tb=document.createElement('tbody');
  pageRows.forEach(function(r){ tb.appendChild(gridRow(r,g,false)); });
  if(!pageRows.length){   /* 빈 상태 (⑤ UX): 왜 비었는지 + 한 번에 되돌리는 버튼 */
    var q=($('#dvSearch').value||'').trim(), nfl=filterCount(), hasLens=!!DV.lens, hasChip=!!DV.chipVal;
    var why=q? '검색어 «'+esc(q)+'»' : (nfl? '열 필터 '+nfl+'개' : hasLens? '관점 필터' : hasChip? '«'+esc(DV.chipVal)+'» 탭' : '');
    var tr=document.createElement('tr'); tr.className='dg-empty';
    tr.innerHTML='<td colspan="'+(g.cols.length+2)+'" style="text-align:left;padding:34px 12px;color:var(--muted)"><div style="position:sticky;left:12px;width:min(520px,calc(100vw - 160px));text-align:center">'+
      (why? '<div style="font-size:13.5px">'+why+'에 맞는 행이 없습니다</div><div style="margin-top:10px;display:flex;gap:6px;justify-content:center;flex-wrap:wrap">'+
        (q? '<button type="button" class="cbtn" data-dge="q">검색어 지우기</button>':'')+((nfl||hasLens)? '<button type="button" class="cbtn" data-dge="f">필터 지우기</button>':'')+(hasChip? '<button type="button" class="cbtn" data-dge="c">전체 탭으로</button>':'')+'</div>'
          : '<div style="font-size:13.5px">아직 데이터가 없습니다</div>'+(g.add&&!window.IS_VIEWER? '<div class="mini" style="margin-top:6px">위의 «＋ 행 추가» 로 첫 행을 넣을 수 있습니다</div>':''))+'</div></td>';
    tb.appendChild(tr);
    tr.querySelectorAll('[data-dge]').forEach(function(b){ b.onclick=function(){ var k=b.dataset.dge; if(k==='q'){ $('#dvSearch').value=''; } if(k==='f'){ DV.filters={}; DV.lens=''; } if(k==='c'){ DV.chipVal=''; } DV.page=0; renderGrid(); }; });
  }
  t.appendChild(tb);

  /* 페이저 */
  var pg=$('#dvPager'); pg.innerHTML='';
  if(totalPages>1){
    function pbtn(txt,fn,dis,cur){
      var b=document.createElement('button');
      b.textContent=txt; b.disabled=!!dis;
      b.style.cssText='border:1px solid var(--ring);background:'+(cur?'var(--s1)':'var(--surface-2)')+
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

function openDetail(c){
  var cu=(RAWX.customers||[]).filter(function(x){return x.id===c.customer_id;})[0]||{};
  $('#dtTitle').textContent=cu.name||'?';
  $('#dtMeta').textContent=[c.line, c.partner, c.biller, (c.start_month||'').slice(0,7)+'~'+((c.end_month||'').slice(0,7)||'?'),
    c.status||'활성', (c.renew_count? '연장 '+c.renew_count+'회':''), c.churn_reason||''].filter(Boolean).join(' · ');
  openOvl('ovlDetail');
  // 월별 금액 차트
  var mine=(RAWX.mrs||[]).filter(function(x){return x.contract_id===c.id;});
  var host=$('#dtChart'); host.innerHTML='';
  if(mine.length>=2){
    Viz.lines(host,{labels:mine.map(function(x){return String(x.month).slice(2,7).replace('-','.');}),
      series:[{label:'월 금액',data:mine.map(function(x){return Number(x.amount);}),color:cssv('--s1')}],
      fmt:won, tipFmt:wonFull, fill:true});
  } else host.innerHTML='<p class="cap">월별 금액 데이터가 없습니다.</p>';
  // 변경 이력
  var t=$('#dtLog'); t.innerHTML='<tbody><tr><td class="mini">불러오는 중…</td></tr></tbody>';
  sbTry('change_log?select=*&target_id=eq.'+c.id+'&order=id.desc&limit=50').then(function(rows){
    rows=rows||[];
    t.innerHTML='<thead><tr><th>시각</th><th>누가</th><th>동작</th><th>내용</th></tr></thead><tbody>'+
      (rows.length? rows.map(function(x){
        return '<tr><td>'+String(x.at||'').replace('T',' ').slice(0,16)+'</td><td>'+esc(x.actor||'')+
          '</td><td>'+esc(x.action||'')+'</td><td class="mini">'+esc(x.detail?JSON.stringify(x.detail).slice(0,90):'')+'</td></tr>';
      }).join('') : '<tr><td colspan="4" class="mini">웹에서 수정한 기록이 없습니다 (최초 이관 데이터)</td></tr>')+'</tbody>';
  });
}

function gridRow(r,g,editing){
  var tr=document.createElement('tr');
  function view(){
    tr.innerHTML=visCols(g).map(function(c){
      var n=c.t==='number'?' class="n"':'';
      var txt=fmtCell(c,r[c.k],r);
      if(c.href && r[c.k]){
        return '<td'+n+'><a href="'+esc(c.href(r[c.k],r))+'" target="_blank" '+
               'style="color:var(--s1);text-decoration:none">'+esc(txt)+'</a></td>';
      }
      if(c.html) return '<td'+n+' style="white-space:normal">'+txt+'</td>';   /* fmt 가 안전한 HTML 을 만든 열 (시리얼 묶음 등) */
      return '<td'+n+'>'+esc(txt)+'</td>';
    }).join('')+(g.ro?'':'<td class="act"></td>');
    if(g.rowClick){ tr.style.cursor='pointer'; tr.onclick=function(e){
      if(e.target.closest('button')||e.target.closest('input')||e.target.closest('select')||e.target.closest('a')) return;
      g.rowClick(r);
    }; }
    if(!g.ro){
      var act=tr.lastChild;
      if(CUR_VIEW==='contracts'){
        var bv=document.createElement('button'); bv.textContent='👁'; bv.title='상세 보기';
        bv.onclick=function(){ openDetail(r); };
        act.appendChild(bv);
      }
      if(window.IS_VIEWER) return;
      if(CUR_VIEW==='oi'){
        // 수주(이후) 단계 + 아직 계약 미연결 → 계약으로 전환
        if(['수주','계산서발행','종료'].indexOf(r.stage)>=0 && !r.contract_id){
          var bc=document.createElement('button'); bc.textContent='→계약'; bc.title='이 수주 건을 신규 계약으로 전환';
          bc.style.color='var(--good,#0ca30c)';
          bc.onclick=function(){ oiToContract(r); };
          act.appendChild(bc);
        }
        var bq=document.createElement('button'); bq.textContent='📎';
        bq.title=r.quote_file? '연결된 견적서 바꾸기/해제' : '견적서 연결';
        bq.onclick=function(){ oiLinkQuote(r); };
        act.appendChild(bq);
      }
      if(g.table==='equipment_orders' && eqWant(r).length && ['설치완료','회수예정','회수완료'].indexOf(r.status)>=0){
        var br=document.createElement('button'); br.textContent='↩'; br.title='회수 처리 — 시리얼을 골라 일부만 회수할 수 있습니다';
        br.style.color='var(--s2,#d95926)';
        br.onclick=function(){ eqRetOpen(r); };
        act.appendChild(br);
      }
      if(g.table==='equipment_assets' && r.order_id!=null){
        /* 현황은 신청 내역에서 만들어지는 저장소 — 신청에 붙은 장비는 여기서 고치지 않고 신청 내역(↩ 회수 처리 · ✎)에서 고칩니다 */
        var lk=document.createElement('button'); lk.textContent='🔒'; lk.title='신청 #'+r.order_id+' 에서 만들어진 장비 — 수정·회수는 «임대 장비 신청 내역» 에서 (↩ 회수 처리)';
        lk.style.opacity='.6'; lk.onclick=function(){ toast('신청 내역에서 수정', '이 장비는 신청 #'+r.order_id+' 에 붙어 있습니다. 임대 장비 신청 내역에서 ✎ 또는 ↩ 회수 처리로 고치면 현황이 따라옵니다', 'info'); };
        act.appendChild(lk);
        return;
      }
      var be=document.createElement('button'); be.textContent='✎';
      be.onclick=function(){ edit(); };
      act.appendChild(be);
      var canDel = g.del===true || (g.del==='super' && window.IS_SUPER);
      if(canDel){
        var bd=document.createElement('button'); bd.textContent='🗑'; bd.className='dl';
        bd.onclick=function(){
          if(!SB_TOKEN){ openOvl('ovlAuth'); return; }
          var warn='이 행을 삭제할까요?\n'+g.cols.slice(0,2).map(function(c){return r[c.k];}).join(' · ');
          if(g.table==='contracts') warn='계약을 삭제할까요?\n'+ (r._custName||'') +' · '+lline(r.line||'')+
            '\n\n이 계약의 월별 인식 금액도 함께 삭제되고 되돌릴 수 없습니다.';
          if(!confirm(warn)) return;
          sbWrite('DELETE',g.table+'?id=eq.'+r.id).then(function(){
            logChange('delete',g.table,r.id,{});
            toast('삭제되었습니다', g.title, 'info');
            var arr=g.rows(); var i=(RAWX[CUR_VIEW]||[]).indexOf(r); if(i>=0) RAWX[CUR_VIEW].splice(i,1);
            DIRTY=true; renderGrid();
          }).catch(function(e){ $('#dvMsg').textContent=String(e.message||e); });
        };
        act.appendChild(bd);
      }
    }
  }
  function edit(){
    tr.innerHTML=visCols(g).map(function(c){
      return '<td>'+(c.ro? (c.html? fmtCell(c,r[c.k],r) : esc(fmtCell(c,r[c.k],r))) : editCell(c,r[c.k]))+'</td>';
    }).join('')+'<td class="act"></td>';
    wireRowInputs(tr,g);
    var act=tr.lastChild;
    var bs=document.createElement('button'); bs.textContent='저장'; bs.className='sv';
    bs.onclick=function(){
      if(!SB_TOKEN){ openOvl('ovlAuth'); return; }
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
            (RAWX.customers||[]).forEach(function(cu){ if(cu.id===x.id) cu[x.col]=x.val; });
            (RAWX.contracts||[]).forEach(function(c2){ if(c2[ (x.tbl==='customers'?'customer_id':'id') ]===x.id) c2[x.key]=x.val; });
            toast(x.label+' 저장', '이 고객사의 모든 계약에 함께 반영됩니다', 'info');
          });
        });
        Promise.all(sideJobs).then(function(){
        return (Object.keys(body).length? sbWrite('PATCH',g.table+'?id=eq.'+r.id,body) : Promise.resolve()); }).then(function(){
          Object.keys(body).forEach(function(k){ r[k]=body[k]; });
          if(Object.keys(body).length) logChange('update',g.table,r.id,body);
          DIRTY=true; $('#dvMsg').textContent='저장됨 ✅';
          toast('저장되었습니다', g.title);
          if(eqSync) syncOrderAssets(r).then(function(x){
            if(x){ toast('장비 현황 자동 반영', x.replace(/^ · /,''), 'info');
                   DIRTY=true; if(CUR_VIEW==='orders'||CUR_VIEW==='assets') renderGrid(); }
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

function gridAddRow(){
  var g=GRIDS[CUR_VIEW]; if(!g||!g.add) return;
  if(!SB_TOKEN){ openOvl('ovlAuth'); return; }
  var t=$('#dvTable'); var tb=t.querySelector('tbody'); if(!tb) return;
  var tr=document.createElement('tr');
  // 계산 열(설치율·신청 모듈처럼 ro 또는 «_» 로 시작)은 DB 에 없는 열 — 입력칸을 만들지 않음 (PGRST204 «_fill column» 오류 원인)
  tr.innerHTML=g.cols.map(function(c){ return '<td>'+((c.ro || c.k[0]==='_')? '<span class="mini">·</span>' : editCell(c,null))+'</td>'; }).join('')+'<td class="act"></td>';
  wireRowInputs(tr,g);
  var act=tr.lastChild;
  var bs=document.createElement('button'); bs.textContent='추가'; bs.className='sv';
  bs.onclick=function(){
    try{
      var body=readRowInputs(tr,g);
      // 자산: 이미 있는 시리얼이면 새 행 대신 기존 행을 찾아 보여줌
      if(g.table==='equipment_assets' && body.serial){
        var serU=String(body.serial).trim().toUpperCase(); body.serial=serU;
        var dup=(RAWX.assets||[]).some(function(a){ return String(a.serial||'').toUpperCase()===serU; });
        if(dup){
          DV.chipVal=''; $('#dvSearch').value=serU; DV.page=0; renderGrid();
          $('#dvMsg').textContent='이미 등록된 시리얼입니다 — 아래 기존 행을 ✎ 버튼으로 수정해주세요.';
          toast('중복 시리얼', serU+' 은(는) 이미 자산 목록에 있습니다');
          return;
        }
      }
      sbWrite('POST',g.table+'?select=*',[body],'return=representation').then(function(rows){
        toast('추가되었습니다', g.title);
        RAWX[CUR_VIEW]=RAWX[CUR_VIEW]||[]; RAWX[CUR_VIEW].push(rows[0]);
        logChange('insert',g.table,rows[0].id,body);
        DIRTY=true; $('#dvMsg').textContent='추가됨 ✅';
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