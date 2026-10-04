/* ===== init.js — 즉시 실행 문장 모음 (④ 아키텍처 2단계 · ㊿+136) =====
   다른 js/*.js 는 선언(var·function)만 있고 아무것도 실행하지 않습니다. 페이지 로드 때 «실행»되는 문장(이벤트 등록 · setInterval · 즉시 호출 · 설정값 읽기 · GRIDS 같이 함수 호출이 든 표 정의 · boot())은
   원래 app.js 에 있던 순서 그대로 여기에 모았습니다 — 그래서 어떤 파일 순서로 선언을 나눠도 동작이 같습니다. 각 문장 위 주석 [파일 N행] 은 원래 app.js 위치.
   ★ 새 즉시 실행 코드(이벤트 등록·초기화)는 이 파일 끝(boot() 앞)에 추가하세요. 선언만 있는 함수는 해당 도메인 파일에. */

/* [core.js 99행] */
window.addEventListener('message', function(ev){
  if(!ev || !ev.data || ev.data.type!=='openReport' || !ev.data.id) return;
  var pf=document.getElementById('preportFrame');
  if(pf) pf.src='report.html?v='+encodeURIComponent(APP_VER)+'&id='+encodeURIComponent(ev.data.id);
  try{ switchView('preport'); }catch(e){}
});

/* [core.js 116행] */
var IS_STAGING=/\/staging\//.test(location.pathname);

/* [core.js 117행] */
if(IS_STAGING){ document.addEventListener('DOMContentLoaded', function(){ var b=document.createElement('div'); b.id='stagingBar'; b.innerHTML='🧪 <b>STAGING</b> — 시험용 포탈입니다 (운영과 같은 데이터 · 여기서 저장하면 운영에도 반영됩니다) · <a href="'+location.pathname.replace('/staging/','/')+'">운영 포탈로 →</a>'; document.body.prepend(b); document.title='[STAGING] '+document.title; }); }

/* [core.js 129행] */
window.addEventListener('error', function(e){ logClientError(e.message, e.filename, e.lineno, e.colno, e.error&&e.error.stack); });

/* [core.js 130행] */
window.addEventListener('unhandledrejection', function(e){ var r=e.reason; logClientError((r&&r.message)||String(r), '', null, null, r&&r.stack); });

/* [core.js 134행] */
if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
  window.addEventListener('load', function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); });
}

/* [core.js 137행] */
window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); PWA.deferred=e; pwaHintSync(); });

/* [core.js 138행] */
window.addEventListener('appinstalled', function(){ PWA.deferred=null; try{ toast('앱으로 설치됐습니다', '홈 화면의 «SVC 포탈» 아이콘으로 여세요', 'ok'); }catch(e){} pwaHintSync(); });

/* [core.js 256행] */
setInterval(function(){
  var s=sessRead();
  if(!SB_TOKEN || !s || !s.e) return;
  if(Math.floor(Date.now()/1000) > (s.e - 300)) refreshToken();   // 만료 5분 전 미리 연장
}, 60*1000);

/* [core.js 446행] */
var IDLE_KEY='svc_idle_min', IDLE_LAST=Date.now(), IDLE_WARNED=false;

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

/* [grids.js 4703행] */
var GRIDS={
  contracts:{
    title:'계약 관리', table:'contracts',
    cap:'행 클릭 = 고객 360 · ✎ 수정 · 금액은 ✏️ 입력·수정 사용 · 삭제는 슈퍼 관리자만',
    add:false, del:'super',
    rowClick:function(r){ openCust360(String(r._custName||'').replace(/^↳ /,'')); },
    rows:function(){
      var cmap={}; (RAWX.customers||[]).forEach(function(x){ cmap[x.id]=x; });
      var out=(RAWX.contracts||[]).map(function(c){
      var cu=cmap[c.customer_id]||{};
      c._custName=cu.name||'?';
      c._sector=cu.sector||''; c._sectorDup=!!cu.sector_dup; c._sectorChk=!!cu.sector_check; return c; });
      // 최신 항목이 맨 위 — 시작월 내림차순, 같으면 나중에 입력한 것(id) 위
      out.sort(function(a,b){
        var n=String(b.start_month||'').localeCompare(String(a.start_month||''));
        if(n) return n;
        return (b.id||0)-(a.id||0);
      });
      /* 부속 계약(추가 구매)은 원계약 바로 아래에 ↳ 로 붙입니다 */
      var byId={}; out.forEach(function(c){ byId[c.id]=c; });
      var kids={}; out.forEach(function(c){ if(c.parent_contract_id && byId[c.parent_contract_id]) (kids[c.parent_contract_id]=kids[c.parent_contract_id]||[]).push(c); });
      var res=[]; out.forEach(function(c){
        if(c.parent_contract_id && byId[c.parent_contract_id]) return;
        res.push(c);
        (kids[c.id]||[]).sort(function(a,b){ return String(a.start_month||'').localeCompare(String(b.start_month||'')); })
          .forEach(function(k){ k._custName='↳ '+k._custName.replace(/^↳ /,''); res.push(k); });
      });
      return res; },
    cols:[
      {k:'_custName',l:'고객사',ro:true},
      /* 업종은 고객사(customers.sector)에 붙는 값 — 여기서 고치면 그 고객사의 모든 계약에 함께 반영됩니다 */
      {k:'_sector',l:'업종',t:'list',opts:function(){ return SECTOR_OPTS; },tbl:'customers',ref:'customer_id',src:'sector',
       fmt:function(v,r0){ return (r0&&r0._sector)||'·'; }},
      {k:'line',l:'서비스',t:'select',opts:LINE_OPTS,fmt:function(v,r0){ return llineVer(v, r0&&r0.version); }},   /* Cloud NAC 5.0 / 6.0 을 구분해 표시·필터 */
      {k:'version',l:'Ver.',t:'select',opts:VER_OPTS,fmt:function(v){ return v||'·'; }},                             /* V6.0 · V5.0 · ZTNA (Cloud NAC 계약) */
      {k:'channel',l:'판매 채널',t:'select',opts:CH_OPTS},
      {k:'lead_src',l:'유입경로',t:'select',opts:LEAD_OPTS,fmt:function(v){ return v||'·'; }},   /* 직접영업/파트너영업/인바운드/프로모션/기타 (SQL 80) */
      {k:'partner',l:'파트너',t:'list',opts:PTN_OPTS},           /* 목록에서 고르거나 직접 입력 */
      {k:'biller',l:'계산서발행처'},
      {k:'combine',l:'모듈',t:'select',opts:COMBINE_OPTS},
      {k:'contract_type',l:'구분',t:'select',opts:CTYPE_OPTS},
      {k:'status',l:'상태',t:'select',opts:CSTATUS_OPTS},
      {k:'live_override',l:'LIVE 예외',t:'select',opts:LIVEOV_OPTS,fmt:function(v){ return v? (v==='포함'? '포함(고정)':'제외(고정)') : '·'; }},   /* 규칙보다 우선 — 비우면 규칙대로 (64단계) */
      {k:'live_override_note',l:'LIVE 예외 사유'},
      {k:'auto_renew',l:'자동연장',t:'bool',fmt:function(v){ return v? '✅ 매월':'·'; }},   /* 월 단위 자동연장 — 만기 목록·슬랙 알림에서 제외 (SQL 84 · ㊿+127) */
      {k:'renew_count',l:'연장',ro:true,fmt:renewLabel},                /* 연장 회차 — «갱신» 탭으로 올라감 */
      {k:'churn_reason',l:'해지사유',t:'list',opts:CHURN_OPTS},
      {k:'start_month',l:'시작월',t:'month'},
      {k:'end_month',l:'종료월',t:'month'},
      {k:'churn_month',l:'해지월',t:'month',fmt:function(v,r0){ return v? String(v).slice(0,7) : (/해지|종료/.test(String(r0&&r0.status||''))&&r0.end_month? String(r0.end_month).slice(0,7)+' (종료월)' : '·'); }},
      {k:'s1_no',l:'에스원 계약번호',t:'list',opts:function(){ return s1NoOpts(); }},
      {k:'mrr',l:'MRR(천원)',t:'number',won:1},
      {k:'qty',l:'노드수',t:'number',fmt:function(v){ return v? Number(v).toLocaleString('ko-KR') : '·'; }},   /* 매출시트 «노드수» — LIVE 노드 합계의 근거 */
      {k:'csm',l:'CSM(사이트명)'},                              /* 영문 사이트명 (site name) */
      {k:'billing',l:'과금방식',t:'list',opts:BILLING_OPTS},     /* 목록에서 고르거나 직접 입력 */
      {k:'install_fee',l:'설치비(천원)',t:'number',won:1},        /* 1회성 · 주로 에스원(S1) 계약 */
      {k:'settle_month',l:'대금정산일',t:'month'},                /* 설치비를 인식하는 달 */
      {k:'note',l:'비고',t:'list',opts:CNOTE_OPTS}
    ]
  },
  live:(function(){
    /* LIVE 고객사 — 두 가지 보기 (LIVE_SRC): «계약 기준(자동 판정)» 은 계약 표로 계산한 읽기 전용 명단, «시트 명단» 은 예전 LIVE 고객사 탭(live_customers · 직접 편집 가능) */
    var SHEET_COLS=[
      {k:'industry',l:'산업군',t:'select',opts:IND_OPTS},
      {k:'name',l:'고객사',req:true},
      {k:'product',l:'제품군'},
      {k:'line',l:'서비스',t:'select',opts:LINE_OPTS,fmt:function(v){return lline(v);}},
      {k:'nodes',l:'노드',t:'number'},
      {k:'start_month',l:'시작월',t:'month'},
      {k:'end_month',l:'종료월',t:'month'},
      {k:'churn_month',l:'해지연월',t:'month'},
      {k:'dup',l:'중복',t:'bool'},
      {k:'note',l:'비고'}
    ];
    var DB_COLS=[
      {k:'ind',l:'산업군'},
      {k:'cust',l:'고객사'},
      {k:'line',l:'서비스',fmt:function(v){return lline(v);}},
      {k:'channel',l:'판매 채널'},
      {k:'partner',l:'파트너'},
      {k:'nodes',l:'노드',t:'number'},
      {k:'start',l:'최초 개시월',fmt:function(v){ return v||'·'; }},
      {k:'curStart',l:'현행 시작월',fmt:function(v){ return v||'·'; }},
      {k:'end',l:'현행 종료월',fmt:function(v){ return v||'없음(진행 중)'; }},
      {k:'csm',l:'CSM(사이트명)'},
      {k:'status',l:'상태'},
      {k:'basis',l:'LIVE 근거'},
      {k:'ov',l:'예외',fmt:function(v,r){ return v? (v+(r&&r.ovNote? ' — '+r.ovNote:'')) : '·'; }}
    ];
    var g={
      title:'LIVE 고객사',
      rowClick:function(r){ openCust360(r.name||r.cust); },
      rows:function(){
        if(LIVE_SRC==='sheet') return (RAWX.live||[]).slice().sort(function(a,b){
          var n=String(b.start_month||'').localeCompare(String(a.start_month||''));
          return n || ((b.id||0)-(a.id||0)); });
        var lv=liveCalc(LV.T!=null? LV.T : undefined);
        return lv.rows.slice().sort(function(a,b){ return String(b.curStart||'').localeCompare(String(a.curStart||'')) || String(a.cust).localeCompare(String(b.cust),'ko'); });
      }
    };
    Object.defineProperty(g,'cols',{get:function(){ return LIVE_SRC==='sheet'? SHEET_COLS : DB_COLS; }});
    Object.defineProperty(g,'table',{get:function(){ return LIVE_SRC==='sheet'? 'live_customers' : ''; }});
    Object.defineProperty(g,'ro',{get:function(){ return LIVE_SRC!=='sheet'; }});
    Object.defineProperty(g,'add',{get:function(){ return LIVE_SRC==='sheet'; }});
    Object.defineProperty(g,'del',{get:function(){ return LIVE_SRC==='sheet'; }});
    Object.defineProperty(g,'cap',{get:function(){ return LIVE_SRC==='sheet'
      ? '예전 LIVE 고객사 탭을 옮겨 둔 명단(직접 편집) — 대조용 · 행 클릭 = 고객 360'
      : '계약을 등록하면 자동으로 따라오는 명단 — 따로 등록하지 않습니다 · 새 고객은 입력·수정 › 계약에서 신규 계약, 빠질 때는 해지 처리 · 행 클릭 = 고객 360'; }});
    return g;
  })(),
  lg:{
    title:'LG U+ 판매', table:'lg_sales',
    cap:'LG 경유 판매 계약 (매출은 각 라인에 포함)', add:true, del:true,
    rows:function(){ return RAWX.lg||[]; },
    cols:[
      {k:'customer',l:'고객사',req:true},
      {k:'partner',l:'구축파트너'},
      {k:'product',l:'제품'},
      {k:'nodes',l:'노드',t:'number'},
      {k:'start_month',l:'시작월',t:'month'},
      {k:'end_month',l:'종료월',t:'month'},
      {k:'months',l:'개월',t:'number'},
      {k:'monthly_fee',l:'월액(천원)',t:'number',won:1}
    ]
  },
  biz:{
    title:'비즈포탈 차액', table:'biz_recon',
    cap:'한 달에 한 번, 월 단위로 대조 결과를 입력합니다', add:false, del:false,
    custom:function(){ renderBizMonthly(); },
    rows:function(){ return RAWX.biz||[]; },
    cols:[
      {k:'ym',l:'월(예:7월)',req:true},
      {k:'as_of',l:'작성일',t:'date'},
      {k:'kind',l:'종류',t:'select',opts:['sum','detail']},
      {k:'item',l:'항목/고객사',req:true},
      {k:'biz',l:'비즈포탈(천원)',t:'number',won:1},
      {k:'sheet',l:'매출시트(천원)',t:'number',won:1},
      {k:'diff',l:'차이(천원)',t:'number',won:1},
      {k:'note',l:'사유'}
    ]
  },
  targets:{
    title:'연간 목표 (ARR 기준)', table:'targets',
    cap:'목표 = 그 해 연말 ARR (12월 MRR × 12). 예: 2026년 목표 13억 = 12월 MRR 1.083억 달성 시 100%', add:true, del:true,
    rows:function(){ return RAWX.targets||[]; },
    cols:[
      {k:'year',l:'연도',t:'select',num:true,req:true,opts:function(){
        var ys=[], y0=new Date().getFullYear();
        for(var y=2020;y<=y0+5;y++) ys.push(String(y));
        return ys;
      }},
      {k:'amount',l:'목표 ARR(천원)',t:'number',won:1,req:true},
      {k:'note',l:'메모'}
    ]
  },
  oi:{
    title:'OI 현황 (영업기회)', table:'oi_deals',
    chipsField:'stage', chipsOpts:OI_STAGE,
    cap:'행 클릭 = 고객 360 · 진행 상태 관리 · 신규 등록은 영업 › OI 등록', add:false, del:true,
    rowClick:function(r){ openCust360(r.customer); },
    rows:function(){ return RAWX.oi||[]; },
    cols:[
      {k:'created_at',l:'등록일',ro:true,fmt:function(v){return String(v||'').slice(0,10);}},
      {k:'stage',l:'진행상태',t:'select',opts:OI_STAGE},
      {k:'win_prob',l:'수주가능성',t:'select',num:true,opts:OI_PROB.map(function(x){return String(x[0]);}),
        fmt:function(v){ return (v==null?0:v)+'%'; }},
      {k:'customer',l:'고객사',req:true},
      {k:'deal_name',l:'사업명'},
      {k:'deal_type',l:'사업형태',t:'select',opts:OI_TYPE},
      {k:'industry',l:'산업군',t:'select',opts:OI_IND},
      {k:'owner',l:'담당자'},
      {k:'partner',l:'구축파트너'},
      {k:'products',l:'제품군',ro:true,fmt:function(v){ return (v&&v.length)? v.join(', ') : '·'; }},
      {k:'items',l:'수량',ro:true,fmt:function(v){
        try{ return (v&&v.length)? v.map(function(x){ return x.product+(x.qty? ' '+x.qty:''); }).join(', ') : '·'; }
        catch(e){ return '·'; } }},
      {k:'expect_month',l:'계약예상',t:'month'},
      {k:'expect_amount',l:'예상단가(천원)',t:'number',won:1},
      {k:'contract_id',l:'계약전환',ro:true,fmt:function(v){ return v? '✅ #'+v : '·'; }},
      {k:'quote_file',l:'견적서',ro:true,
        href:function(v){ return 'quote.html?view='+encodeURIComponent(v); },
        fmt:function(v){ if(!v) return '·'; var L=qLabel(String(v).split('/').pop()); return '📄 '+(L.d||L.c); }},
      {k:'rival_price',l:'경쟁사가(천원)',t:'number',won:1},
      {k:'next_action',l:'다음 할 일'},
      {k:'next_date',l:'예정일',t:'date'},
      {k:'cust_name',l:'고객 담당자'},
      {k:'cust_phone',l:'연락처'},
      {k:'lost_reason',l:'실패사유'},
      {k:'note',l:'비고'}
    ]
  },
  mdrops:{
    title:'MDR 운영·신청 현황', table:'mdr_ops',
    chipsField:'status', chipsOpts:['신청','대기','진행중','데모','구독','종료'],
    cap:'행 클릭 = 고객 360 · PoC 신청부터 운영까지 — 신청 → 진행중 → 데모 → 구독 · 설치율 = 설치 ÷ 계약 수량', add:true, del:true,
    rowClick:function(r){ if(!window.IS_EQUIP) openCust360(r.customer); },
    rows:function(){ return (RAWX.mdrops||[]).slice().sort(function(a,b){
      var n=String(b.start_date||'').localeCompare(String(a.start_date||''));
      return n || ((b.id||0)-(a.id||0)); }); },
    cols:[
      {k:'svc_type',l:'서비스유형',t:'select',opts:['IDC 상면','CLOUD','구축(Onprem)']},
      {k:'customer',l:'고객명',req:true},
      {k:'status',l:'상태',t:'select',opts:['신청','대기','진행중','데모','구독','종료']},
      {k:'on_rev_sheet',l:'수주기입',t:'bool',fmt:function(v){return v?'✅':'·';}},
      {k:'plan_qty',l:'계약수량',t:'number'},
      {k:'agents_total',l:'설치 전체',t:'number'},
      {k:'_fill',l:'설치율',ro:true,fmt:function(v,r0){
        if(!r0 || !r0.plan_qty) return '·';
        var t=+r0.agents_total||0, p=+r0.plan_qty;
        var pct=Math.round(t/p*100);
        return pct+'%'+(t>p? ' ⚠초과':'');
      }},
      {k:'agents_win',l:'Win',t:'number'},
      {k:'agents_mac',l:'Mac',t:'number'},
      {k:'agents_linux',l:'Linux',t:'number'},
      {k:'license',l:'라이선스',t:'list',opts:['EDR','EDR+AV','EDR+RANSOMWARE','EDR+RANSOMWARE+AV']},
      {k:'channel',l:'유입채널',t:'list',opts:['다원티에스','IN BOUND','에스원','엘지유플러스','SK쉴더스','론스텍','에티버스','대신정보통신','직접']},
      {k:'start_date',l:'시작일',t:'date'},
      {k:'slack_ops',l:'슬랙 운영'},
      {k:'mgr_name',l:'고객 담당자'},
      {k:'mgr_phone',l:'연락처'},
      {k:'_mods',l:'신청 모듈',ro:true,fmt:function(v,r0){
        if(!r0) return '·';
        var m=[r0.mod_edr?'EDR':'',r0.mod_ransom?'랜섬웨어':'',r0.mod_av?'백신':'',r0.mod_media?'매체제어':''].filter(Boolean);
        return m.length? m.join('+') : '·'; }},
      {k:'sales_name',l:'영업담당'},
      {k:'progress',l:'진행 내역'},
      {k:'note',l:'비고'}
    ]
  },
  orders:{
    title:'임대 장비 신청 내역', table:'equipment_orders',
    chipsField:'channel', chipsOpts:ORD_CH_OPTS,
    cap:'저장할 때마다 장비 현황에 자동 반영됩니다 — 접수·출하요청·배송중은 재고, 설치완료·회수예정은 임대중, 회수완료는 회수완료 (취소는 현황에서 내림) · 시리얼 칩을 눌러 회수 표시 → «회수 처리 저장» (일부·전부 모두, ↩ 버튼은 체크 목록 방식) · 시리얼을 비워두면 «미등록-신청번호» 로 수량만큼 임시 등록 · 신규 신청은 장비 › 임대 장비 신청', add:true, del:true,
    rows:function(){ return RAWX.orders||[]; },
    cols:[
      {k:'created_at',l:'신청일',ro:true,fmt:function(v){return String(v||'').slice(0,10);}},
      {k:'channel',l:'채널',t:'select',opts:ORD_CH_OPTS},
      {k:'order_type',l:'유형',t:'select',opts:['신규발주','추가','교체(장애)','교체(증설)','철거·회수']},
      {k:'customer',l:'고객사',req:true},
      {k:'contract_no',l:'계약번호'},
      {k:'mgr_name',l:'담당자'},
      {k:'install_date',l:'설치희망',t:'date'},
      {k:'edition',l:'에디션',t:'select',opts:['Enterprise Edition','Basic Edition']},
      {k:'nodes',l:'노드',t:'number'},
      {k:'model',l:'모델',t:'select',opts:MODEL_OPTS},   /* 장비 현황의 모델 목록과 동일 — code_lists model (SQL 93) */
      {k:'qty',l:'수량',t:'number'},
      {k:'standalone_pod',l:'단독Pod',t:'bool',fmt:function(v){return v?'✅ 단독':'·';}},
      {k:'recv_name',l:'수령인'},
      {k:'ship_date',l:'수령희망',t:'date'},
      {k:'status',l:'상태',t:'select',opts:ORD_STATUS_OPTS},
      {k:'returned_date',l:'회수일',t:'date',fmt:function(v,r){
        if(v) return String(v).slice(0,10);
        return (r&&r.status==='회수완료')? '· ⚠ 미입력' : '·';     /* 회수완료인데 날짜가 없으면 표시 */
      }},
      {k:'returned_serials',l:'회수 현황',fmt:function(v,r){      /* 일부 회수: 회수된 시리얼 수 / 전체 (↩ 버튼으로 선택) */
        var all=eqWant(r||{}), ret=eqRetSet(r||{});
        if(!all.length) return v? String(v) : '·';
        if(r.status==='회수완료') return all.length+'/'+all.length+' 회수';
        return ret.length? (ret.length+'/'+all.length+' 일부 회수') : '·';
      }},
      {k:'serials',l:'시리얼',html:true,raw:true,fmt:function(v,r){ return eqSerialsHtml(r||{}); }},
      {k:'request_note',l:'요청사항'}
    ]
  },
  assets:{
    title:'임대 장비 현황 (시리얼 단위)', table:'equipment_assets',
    chipsField:'channel', chipsOpts:ORD_CH_OPTS,
    cap:'신청 내역에서 자동으로 만들어지는 시리얼 단위 저장소입니다 — 신청에 붙은 장비(🔒)는 «임대 장비 신청 내역» 에서 ✎ 수정·↩ 회수 처리하면 따라옵니다 · 여기서는 신청과 무관한 재고·데모·판매 장비만 직접 등록·수정', add:true, del:true,
    rows:function(){
      var om={}; (RAWX.orders||[]).forEach(function(o){ om[String(o.id)]=o; });
      var out=(RAWX.assets||[]).slice();
      out.forEach(function(a){ var o=(a.order_id!=null)? om[String(a.order_id)] : null; a._ostat=o? (o.status||''):''; });
      return out.sort(function(a,b){
        var x=a.in_date||a.deployed_date||'', y=b.in_date||b.deployed_date||'';
        if(x!==y) return String(y).localeCompare(String(x));      // 최신 위, 빈 값 아래
        return String(a.serial||'').localeCompare(String(b.serial||'')); }); },
    cols:[
      {k:'serial',l:'시리얼',req:true},
      {k:'model',l:'모델',t:'select',opts:MODEL_OPTS},
      {k:'usage',l:'구분',t:'select',opts:['임대','데모','대여','판매','하자보수']},
      {k:'status',l:'상태',t:'select',opts:['재고','임대중','회수완료','판매완료','수리중','분실','폐기']},
      {k:'_ostat',l:'신청상태',ro:true,fmt:function(v,r){ return (r&&r.order_id==null)? '· 신청 없음' : (v||'· 신청 삭제됨'); }},
      {k:'customer',l:'고객사'},
      {k:'channel',l:'채널',t:'select',opts:ORD_CH_OPTS},
      {k:'partner',l:'파트너'},
      {k:'in_date',l:'입고일',t:'date'},
      {k:'deployed_date',l:'출고일',t:'date'},
      {k:'returned_date',l:'회수일',t:'date',fmt:function(v,r){
        if(!v) return '·';
        /* 임대중인데 회수일이 남아 있으면 이전 임대의 값이 남은 것 — 사람 확인 필요 */
        return String(v).slice(0,10)+((r&&r.status==='임대중')? ' ⚠':'');
      }},
      {k:'note',l:'비고'},
      {k:'order_id',l:'신청#',ro:true,fmt:function(v){ return v? ('#'+v):'·'; }}
    ]
  },
  inbound:{
    title:'인바운드 목록', table:'inbound_leads',
    cap:'원본은 구글시트 — 수정은 시트에서, 포탈은 매일 아침 7시 자동으로 가져옵니다 (위에서 지금 가져오기·가져온 기록) · 행을 누르면 상세 보기',
    add:false, del:false, ro:true,
    rowClick:function(r){ openInbDetail(r); },
    rows:function(){
      var out=(RAWX.inbound||[]).slice();
      out.forEach(function(r){
        if(r._days===undefined){
          var last=[r.on_date,r.s1d,r.s2d,r.s21d,r.s3d].filter(function(d){return d&&/^\d{4}-\d{2}-\d{2}/.test(d);}).sort().pop();
          r._last=last||'';
          r._days=last? Math.floor((Date.now()-new Date(last).getTime())/864e5) : null;
        }
      });
      out.sort(function(a,b){
        var n=String(b.on_date||'').localeCompare(String(a.on_date||''));
        return n || ((b.no||0)-(a.no||0));
      });
      return out;
    },
    cols:[
      {k:'on_date',l:'접수일',ro:true},
      {k:'y',l:'연도',ro:true},
      {k:'industry',l:'산업군',ro:true},
      {k:'org',l:'기관(고객)명',ro:true},
      {k:'product',l:'문의 제품',ro:true},
      {k:'qtype',l:'유형',ro:true},
      {k:'owner',l:'담당',ro:true},
      {k:'_last',l:'최근 대응일',ro:true},
      {k:'_days',l:'경과일',t:'number',ro:true,fmt:function(v,r){
        if(v==null) return '·';
        return (r&&r.result==='진행중'&&v>=14)? v+'일 ⚠':v+'일'; }},
      {k:'result',l:'상태',ro:true},
      {k:'amount',l:'수주액(천원)',t:'number',won:1,ro:true},
      {k:'note',l:'비고',ro:true,fmt:function(v){return String(v||'').slice(0,40);}}
    ]
  },
  dcheck:{
    title:'데이터 점검', table:'contracts',
    cap:'계약·고객사·장비·OI 데이터를 규칙으로 훑어 어긋난 행을 보여줍니다 (메모리 데이터 · 서버 왕복 없음) — 항목을 누르면 고칠 화면으로', add:false, del:false, ro:true,
    custom:function(){ renderDataCheck(); },
    rows:function(){ return []; },
    cols:[{k:'id',l:'규칙'}]
  },
  leadsrc:{
    title:'유입경로 분석', table:'contracts',
    cap:'계약의 «유입경로»(직접영업·파트너영업·인바운드·프로모션·기타)별 매출 규모 — 값은 계약 관리 표의 유입경로 열에서 지정', add:false, del:false, ro:true,
    custom:function(){ renderLeadSrc(); },
    rows:function(){ return []; },
    cols:[{k:'lead_src',l:'유입경로'}]
  },
  aiknow:{
    title:'AI 지식 — AI 에게 가르치기', table:'ai_knowledge',
    cap:'여기 적은 사실·규칙·용어는 포탈 AI 가 모든 질문에 답할 때 최우선으로 참고합니다 (SQL 78 · ask 함수 v3)', add:false, del:false,
    custom:function(){ renderAiKnow(); },
    rows:function(){ return RAWX.aiknow||[]; },
    cols:[{k:'topic',l:'주제'},{k:'content',l:'내용'},{k:'active',l:'적용',t:'bool'}]
  },
  log:{
    title:'변경 이력', table:'change_log',
    cap:'웹에서 수정한 기록 (최근 300건)', add:false, del:false, ro:true,
    rows:function(){ return RAWX.log||[]; },
    cols:[
      {k:'at',l:'시각',ro:true,fmt:function(v){return String(v||'').replace('T',' ').slice(0,16);}},
      {k:'actor',l:'누가',ro:true},
      {k:'action',l:'동작',ro:true},
      {k:'target',l:'대상',ro:true},
      {k:'target_id',l:'ID',ro:true},
      {k:'detail',l:'내용',ro:true,fmt:function(v){return v? JSON.stringify(v).slice(0,80):'';}}
    ]
  }
};

/* [equipment.js 5180행] */
document.addEventListener('click', function(e){
  var t=e.target; if(!t || !t.closest) return;
  var more=t.closest('.eqser-more');
  if(more){ e.stopPropagation(); var f=more.parentElement.querySelector('.eqser-full'); if(!f) return;
    var open=f.style.display!=='none'; f.style.display=open? 'none':'block'; more.textContent=open? ((more.closest('.eqb-card')? '+':'외 ')+more.dataset.n+(more.closest('.eqb-card')? ' ▾':'대 ▾')) : '접기 ▴';
    if(more.dataset.oid) EQOPEN[more.dataset.oid]=!open; return; }
  var chip=t.closest('.eqsn.act');
  if(chip){ e.stopPropagation(); var oid=chip.dataset.oid, U=chip.dataset.sn, r=eqOrderById(oid); if(!r) return;
    var saved=(r.status==='회수완료')||eqRetSet(r).indexOf(U)>=0; var p=EQP[oid]=EQP[oid]||{};
    var cur=(U in p)? p[U] : saved; p[U]=!cur; if(p[U]===saved) delete p[U];
    EQOPEN[oid]=true; eqRefresh(); return; }
  var all=t.closest('.eqbar-all');
  if(all){ e.stopPropagation(); var bar=all.closest('.eqbar'), oid2=bar.dataset.oid, r2=eqOrderById(oid2); if(!r2) return;
    var p2=EQP[oid2]={}; eqWant(r2).forEach(function(sn){ p2[sn.toUpperCase()]=true; }); EQOPEN[oid2]=true; eqRefresh(); return; }
  var cancel=t.closest('.eqbar-cancel');
  if(cancel){ e.stopPropagation(); var oid3=cancel.closest('.eqbar').dataset.oid; delete EQP[oid3]; delete EQP['_d'+oid3]; eqRefresh(); return; }
  var save=t.closest('.eqbar-save');
  if(save){ e.stopPropagation(); var bar4=save.closest('.eqbar'), oid4=bar4.dataset.oid, r4=eqOrderById(oid4); if(!r4) return;
    var dI=bar4.querySelector('.eqbar-date'), date=(dI&&dI.value)||todayStr(); var p4=EQP[oid4]||{};
    var checked=eqWant(r4).filter(function(sn){ var U=sn.toUpperCase(); var saved=(r4.status==='회수완료')||eqRetSet(r4).indexOf(U)>=0; return (U in p4)? p4[U] : saved; });
    save.disabled=true; save.textContent='저장 중…';
    eqRetApply(r4, checked, date, '').then(function(){ delete EQP[oid4]; delete EQP['_d'+oid4]; }).catch(function(err){ toast('회수 처리 실패', String(err.message||err).slice(0,80), 'bad'); }).then(function(){ DIRTY=true; eqRefresh(); });
    return; }
});

/* [equipment.js 5204행] */
document.addEventListener('change', function(e){ var d=e.target; if(d && d.classList && d.classList.contains('eqbar-date')){ var oid=d.closest('.eqbar').dataset.oid; EQP['_d'+oid]=d.value; } });

/* [analysis.js 6775행] */
var LIVE_SRC=(function(){ try{ return localStorage.getItem('svc_live_src')||'db'; }catch(e){ return 'db'; } })();

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

/* [price.js 7630행] */
CL.cur = (function(){ try{ return localStorage.getItem('svc_cloud_cur')||'usd'; }catch(e){ return 'usd'; } })();

/* [price.js 7633행] */
CL.fxNow=null;

/* [price.js 8639행] */
document.addEventListener('DOMContentLoaded',function(){
  var b=document.getElementById('pnSave');
  if(!b) return;
  b.onclick=async function(){
    var seg=$('#pnSeg').value, lab=$('#pnLabel').value.trim(), dt=$('#pnDate').value, js=$('#pnJson').value.trim();
    var m=$('#pnMsg');
    if(!lab||!dt||!js){ m.textContent='판 이름·적용일·JSON은 필수입니다'; m.style.color='var(--critical)'; return; }
    var data; try{ data=JSON.parse(js); }catch(e){ m.textContent='JSON 형식 오류: '+e.message; m.style.color='var(--critical)'; return; }
    try{
      await sbWrite('POST','price_books',{seg:seg,label:lab,applied:dt,data:data});
      closeOvl('ovlPrNew'); toast('가격표 새 판 등록', lab);
      RAWX.price=null; PR.ver={saas:0,onprem:0};
      if(CUR_VIEW==='price') renderPrice();
    }catch(e){ m.textContent=String(e.message||e); m.style.color='var(--critical)'; }
  };
});

/* [inbound.js 8657행] */
var INB_Y=String(new Date().getFullYear());

/* [inbound.js 9350행] */
document.addEventListener('fullscreenchange', wkFsSync);

/* [inbound.js 9351행] */
document.addEventListener('webkitfullscreenchange', wkFsSync);

/* [inbound.js 9379행] */
document.addEventListener('keydown',function(e){
  if(CUR_VIEW!=='weekly') return;
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
  var c=t.closest('[data-close]'); if(c){ if(c.dataset.pre==='oiconv') OI_CONVERT=null; closeOvl(c.dataset.close); return; }
  var a=t.closest('a[data-sat]'); if(a){ a.href=a.dataset.sat+'?v='+encodeURIComponent(APP_VER); }
});
document.addEventListener('submit', function(e){ if(e.target && e.target.id==='lsLogin') e.preventDefault(); });
/* ⑤ UX 2단계 (㊿+139): 표 동작 열 여백은 창 크기에 따라 다시 계산 · ❔ 화면 도움말 · ? 단축키 안내 */
onResize(function(){ if(CUR_VIEW && GRIDS[CUR_VIEW]) gridActPad(); });
(function(){ var b=document.getElementById('dvHelp'); if(b) b.addEventListener('click', askScreenHelp); })();
document.addEventListener('keydown', function(e){
  if(e.key!=='?' || e.ctrlKey || e.metaKey || e.altKey) return;
  var a=document.activeElement, tag=a? a.tagName : ''; if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(a&&a.isContentEditable)) return;
  var app=document.getElementById('app'); if(!app || app.classList.contains('hidden')) return;
  e.preventDefault(); var ov=document.getElementById('ovlKeys'); if(ov) ov.classList.toggle('on');
});   /* 예전 onsubmit="return false" */
/* ㊿+141: 창 공통 — 바깥 클릭으로 닫기 · 입력 중 확인 · 초점 들어가기/가두기/되돌리기 (edit.js ovlInit) */
ovlInit();

/* [edit.js 15194행] */
boot();
