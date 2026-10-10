/* ===== grids.js — 선택 목록(LINE_OPTS 등) · 표 정의(GRIDS · buildGrids) · 데모 데이터 =====
   ES 모듈(㊿+153) — 다른 파일의 이름은 아래 import 로만 씀 · 이 파일의 최상위 var/function 은 전부 export · 즉시 실행 문장은 js/init.js 의 start() 에 */
import { ST } from './state.js';
import { LINE_LABEL, lline, llineVer, tpl, VER_OPTS } from './core.js';
import { sbTry } from './shell.js';
import { eqRetSet, eqSerialsHtml, eqWant } from './equipment.js';
import { liveCalc, LV, renderAiKnow, renderBizMonthly, renderDataCheck, renderLeadSrc } from './analysis.js';
import { openCust360 } from './tools.js';
import { openInbDetail } from './inbound.js';
import { qLabel } from './sales.js';
import { SECTOR_OPTS } from './edit.js';


/* ==================================================================
   6. 데모 데이터 (Apps Script 밖에서 열었을 때만)
   ================================================================== */
/* ==================================================================
   좌측 메뉴 · 데이터 관리 그리드
   ================================================================== */

/* ===== 코드 목록 (code_lists 표 · SQL 93 · ㊿+137) =====
   아래 *_OPTS 상수는 «기본값(표가 없을 때)». 로그인 뒤 loadCodes() 가 DB 의 code_lists 를 읽어 applyCodes() 로 **같은 배열 객체의 내용을 바꿔 넣음**
   (arr.length=0 후 push) → GRIDS 열 opts·폼·데이터 점검 규칙 등 이 배열을 참조하는 모든 곳에 자동 반영. 값 추가·숨김은 관리자 › 코드 관리.
   DB 쪽도 같은 표를 트리거로 검증(값이 바뀔 때만) 하므로 포탈·DB 가 한 목록을 봄. 주의: order_status(장비 상태 흐름 EQ_ST·상태 보드 열)·line(LIVE 규칙) 은
   값에 화면 로직이 붙어 있어 새 값을 더하면 코드도 손봐야 함 — 코드 관리 화면에 그 안내가 있음. */
export var CODE_KIND={contract_status:'CSTATUS_OPTS', contract_type:'CTYPE_OPTS', channel:'CH_OPTS', line:'LINE_OPTS', lead_src:'LEAD_OPTS', live_override:'LIVEOV_OPTS',
  order_status:'ORD_STATUS_OPTS', order_channel:'ORD_CH_OPTS', model:'MODEL_OPTS', billing:'BILLING_OPTS', churn_reason:'CHURN_OPTS', partner:'PTN_OPTS', industry:'IND_OPTS', version:'VER_OPTS'};
export var CODE_KIND_LABEL={contract_status:'계약 상태', contract_type:'계약 유형', channel:'판매 채널', line:'서비스', lead_src:'유입경로', live_override:'LIVE 예외',
  order_status:'장비 신청 상태', order_channel:'장비 신청 채널', model:'장비 모델', billing:'과금 방식', churn_reason:'해지 사유', partner:'파트너', industry:'산업군', version:'Cloud 버전'};
export var CODE_KIND_NOTE={order_status:'상태 흐름(재고·임대중 판정 EQ_ST, 상태 보드 열)이 코드에 있음 — 새 값은 코드 수정도 필요', line:'LIVE·MRR 규칙과 라벨(LINE_LABEL)이 코드에 있음 — 새 서비스는 코드 수정도 필요', live_override:'포함/제외 두 값만 의미가 있음'};
export var LIVEOV_OPTS=['포함','제외'];
export var ORD_STATUS_OPTS=['접수','출하요청','배송중','설치완료','회수예정','회수완료','취소'];
export var ORD_CH_OPTS=['에스원','LGU+','조달','일반','기타'];
export var MODEL_OPTS=['S100','S200','S10_R2','S20_R2','S30H_R1','ES30'];
export async function loadCodes(){
  if(!ST.SB_TOKEN){ return null; }
  try{
    var rows=await sbTry('code_lists?select=kind,value,label,sort,active,note&order=kind,sort,value');
    if(!rows || !rows.length){ ST.CODES=null; return null; }   // 표 없음(SQL 93 전 · sbAll 은 404 도 [] 로 돌려줌)·비어 있음 → 상수 그대로
    var m=/** @type {Object<string, import('./state.js').CodeItem[]>} */ ({}); rows.forEach(function(r){ (m[r.kind]=m[r.kind]||[]).push(r); });
    ST.CODES=m; try{ sessionStorage.setItem('svc_codes', JSON.stringify(m)); }catch(e){}
    applyCodes(); return m;
  }catch(e){ ST.CODES=null; return null; }
}
/* 종류 → 기본값 배열 객체 (㊿+154: 예전 window[CODE_KIND[kind]] — 모듈 이름은 window 에 없음). 배열은 이 파일 아래쪽에 선언돼 있어 부를 때 찾음 */
export function codeArr(kind){
  var A={CSTATUS_OPTS:CSTATUS_OPTS, CTYPE_OPTS:CTYPE_OPTS, CH_OPTS:CH_OPTS, LINE_OPTS:LINE_OPTS, LEAD_OPTS:LEAD_OPTS, LIVEOV_OPTS:LIVEOV_OPTS, ORD_STATUS_OPTS:ORD_STATUS_OPTS,
    ORD_CH_OPTS:ORD_CH_OPTS, MODEL_OPTS:MODEL_OPTS, BILLING_OPTS:BILLING_OPTS, CHURN_OPTS:CHURN_OPTS, PTN_OPTS:PTN_OPTS, IND_OPTS:IND_OPTS, VER_OPTS:VER_OPTS};
  return A[CODE_KIND[kind]]||null;
}
export function applyCodes(){
  if(!ST.CODES) return;
  Object.keys(CODE_KIND).forEach(function(kind){
    var arr=codeArr(kind), list=ST.CODES[kind]; if(!Array.isArray(arr) || !list) return;
    var vals=list.filter(function(c){ return c.active!==false; }).sort(function(a,b){ return (a.sort||0)-(b.sort||0) || String(a.value).localeCompare(String(b.value)); }).map(function(c){ return c.value; });
    if(!vals.length) return;                           // 전부 숨기면 기본값 유지(화면이 비지 않게)
    arr.length=0; vals.forEach(function(v){ arr.push(v); });
    if(kind==='line' && LINE_LABEL) list.forEach(function(c){ if(c.label) LINE_LABEL[c.value]=c.label; });
  });
  fillModelSelect();
}
export function codeList(kind){ return (ST.CODES && ST.CODES[kind]) || (codeArr(kind)||[]).map(function(v){ return {kind:kind, value:v, active:true}; }); }
export function codeActive(kind, v){ if(v==null || v==='') return true; var arr=codeArr(kind); return !arr || arr.indexOf(v)>=0; }
/* 발주 신청 폼의 모델 select (#odModel) 를 MODEL_OPTS 로 다시 채움 — 현재 값 유지 */
export function fillModelSelect(){ var s=document.getElementById('odModel'); if(!s) return; var cur=s.value; s.innerHTML=MODEL_OPTS.map(function(m){ return tpl`<option>${m}</option>`; }).join(''); if(cur && MODEL_OPTS.indexOf(cur)>=0) s.value=cur; }

export var LINE_OPTS=['Cloud','S1','MDR','MDR_S1','DRM','PNS','DLP'];
export var PTN_OPTS=['지니언스(직접)','다원티에스','글로웰시스템','에티버스','직접(계산서)'];
/* 에스원 계약번호 후보 — 계약(s1_no) · 에스원 정산 매핑(s1_map) · 임대 장비 신청(equipment_orders.contract_no) 을 모아 보여줍니다 */
export function s1NoOpts(){
  var set={}, R=ST.RAWX||{};
  (R.contracts||[]).forEach(function(c){ if(c.s1_no) set[String(c.s1_no).trim()]=1; });
  (R.s1map||[]).forEach(function(m){ if(m.contract_no) set[String(m.contract_no).trim()]=1; });
  (R.orders||[]).forEach(function(o){ if(o.contract_no) set[String(o.contract_no).trim()]=1; });
  (R.assets||[]).forEach(function(a){ if(a.contract_no) set[String(a.contract_no).trim()]=1; });
  return Object.keys(set).sort();
}
/* 계약번호로 알아낸 고객사 — 신규 등록 때 «이 번호는 ○○» 안내에 씁니다 */
export function s1NoInfo(no){
  no=String(no||'').trim(); if(!no) return null;
  var R=ST.RAWX||{};
  var m=(R.s1map||[]).filter(function(x){ return String(x.contract_no).trim()===no; })[0];
  if(m) return {src:'에스원 정산', cust:m.customer||m.s1_name||'', biz:m.biz_no||null};
  var o=(R.orders||[]).filter(function(x){ return String(x.contract_no||'').trim()===no; })[0];
  if(o) return {src:'장비 신청', cust:o.customer||'', biz:null};
  var c=(R.contracts||[]).filter(function(x){ return String(x.s1_no||'').trim()===no; })[0];
  if(c){ var cu=(R.customers||[]).filter(function(x){ return x.id===c.customer_id; })[0]; return {src:'기존 계약', cust:(cu&&cu.name)||'', biz:null}; }
  return null;
}
export var IND_OPTS=['기업','공공','금융','의료','미분류'];
/* 계약 관리 선택 목록 */
export var CH_OPTS=['일반','조달','LGU+','에스원','유통'];
export var LEAD_OPTS=['직접영업','파트너영업','인바운드','프로모션','기타'];   /* 매출 유입경로 (contracts.lead_src · SQL 80) */
export var CTYPE_OPTS=['신규','재약정','추가'];
export var CSTATUS_OPTS=['신규','재약정','추가','서비스종료','해지','CN전환','통합과금'];
export var CNOTE_OPTS=['재약정 완료','재약정 예정','정부 지원','중도 해지','미연장','매월 연장 확인 필요'];
/* 연장 회차 표기: 0 → '·', n → '연장 n회' (툴팁에 회차별 기간·금액) */
export function renewLabel(v,r0){                       /* 그리드 셀은 텍스트로 그려지므로 문자열만 */
  var n=Number(v)||0; if(!n) return '·';
  var h=(r0&&Array.isArray(r0.renew_history))? r0.renew_history : (r0&&r0.renewHist)||[];
  var last=h[h.length-1];
  return '연장 '+n+'회'+(last&&last.to? ' (~'+String(last.to).slice(0,7)+')':'');
}
export var CHURN_OPTS=['경영악화','비용이슈','폐업','고객사정','구축형전환','기타'];
/* 과금방식 — 목록에서 고르거나 없는 값은 직접 입력할 수 있습니다 (t:'list') */
export var BILLING_OPTS=['월납입','일시납','분기납','반년납','연납'];
/* OI (영업기회) — 비즈포탈 체계 그대로 */
export var OI_STAGE=['등록','진행','수주','계산서발행','종료','중지','실패'];
export var OI_STAGE_DESC={'등록':'초기문의단계','진행':'영업진행단계','수주':'발주서접수','계산서발행':'세금계산서 발행',
  '종료':'수금완료','중지':'진행일시 중지','실패':'수주실패'};
export var OI_PROB=[
  [0,'초기 영업단계'],
  [10,'고객 Need/Pain 파악, 설명회 수준의 소개, 초기 견적 제출'],
  [20,'고객 시스템 구성 확인, 제안서 제출'],
  [30,'제안구성에 대한 고객의 Acceptance (H/W 등 관련 제품 사양 포함)'],
  [40,'Demo, BMT, POC Test 완료, 예산확보'],
  [50,'고객 핵심 인력의 확정'],
  [60,'최종 견적, 고객 내부 기안 완료, RFP 공동 작업'],
  [70,'최종결정자 결재, 구매/입찰 일정 확정'],
  [80,'입찰 선정, 최종 협상'],
  [90,'고객 발주 접수'],
  [100,'지니네트웍스에 발주 완료']
];
export var OI_TYPE=['신규제안','윈백제안','확산(증설)'];
export var OI_IND=['공공','의료','학교','기업','금융','국방','홈네트워크'];
/* MDR 결합 모듈 (매출시트 Combine 열) — AV=안티바이러스, AR=안티랜섬웨어 */
export var COMBINE_OPTS=['Add-on','MDR+AV','MDR+AR','MDR+AV+AR'];
/* 제품군은 서비스사업부에서 다루는 것만 (+ 직접입력) */
export var OI_PRODUCTS=['Cloud NAC','S1 Cloud NAC','Cloud EDR','MDR','S1 MDR','MDR Add-on',
  'AV (안티바이러스)','AR (안티랜섬웨어)','PNS','DRM','DLP'];
export var OI_OWNERS=['송기영 부장','최형우 차장'];
export var OI_PARTNERS=['다원티에스','글로웰시스템','에티버스','지니언스(주)'];



/* ===== 표 정의 GRIDS — 화면 이름 → {제목·표·열·행 만들기} (㊿+153: init.js 에서 옮김)
   만드는 중에 OI_PROB.map 같은 호출이 있어 파일을 읽을 때가 아니라 시작할 때(init.js start → buildGrids) 만듦 */
/** 표 화면 정의 하나 (GRIDS[화면] — grid.js renderGrid 가 그림 · ㊿+155 이름표)
 * @typedef {Object} GridDef
 * @property {string} title 화면 제목 @property {string} table Supabase 표 이름 @property {string} cap 표 위 설명
 * @property {boolean|string} add 행 추가 허용 @property {boolean|string} del 삭제 허용 ('super' = 슈퍼 관리자만) @property {boolean} [ro] 읽기 전용
 * @property {function(): any[]} rows 그릴 행 @property {GridCol[]} cols 열 @property {function(any): void} [rowClick] 행 누름
 * @property {function(): void} [custom] 표 대신 그리는 화면(데이터 점검 등) @property {string} [chipsField] 위쪽 칩으로 거를 열 @property {any} [chipsOpts] 칩 값 목록
 * @property {?Object<string, any>} [_lens] 관점 필터(계약 메뉴)로 남길 행 id — grid.js 가 그릴 때 붙임
 * @property {string[]} [pin] 가로로 밀어도 왼쪽에 고정할 열(이름 · 상태)
 */
/** 표 열 하나
 * @typedef {Object} GridCol
 * @property {string} k 행의 키 @property {string} l 머리글 @property {boolean|number} [ro] 고칠 수 없음 @property {string} [t] 입력 종류(select·list·bool·num·date…)
 * @property {any} [opts] 고를 값(배열 또는 함수) @property {string} [tbl] 다른 표에 저장 @property {string} [ref] 그 표의 연결 키 @property {string} [src] 그 표의 열
 * @property {function(any, any=): any} [fmt] 셀 표시 @property {boolean|number} [won] 원 단위 @property {boolean|number} [req] 필수 @property {boolean|number} [num] 숫자
 * @property {any} [href] 링크 @property {boolean|number} [html] fmt 결과가 HTML @property {boolean|number} [raw] 원본 그대로
 * @property {boolean|number} [badge] 상태 배지로 표시 @property {function(any): boolean} [na] 비어 있을 때 해당 없음(빈칸)인지 — 아니면 미입력(—)
 */
/** @type {?Object<string, GridDef>} */
export var GRIDS=null;
export function buildGrids(){
  GRIDS={
    contracts:{
      title:'계약 관리', table:'contracts',
      cap:'행 클릭 = 고객 360 · 연필 = 이 행 수정 · 금액 변경은 위 «입력·수정» · 삭제는 «더보기»(슈퍼 관리자만)',
      add:false, del:'super', pin:['_custName','status'],
      rowClick:function(r){ openCust360(String(r._custName||'').replace(/^↳ /,'')); },
      rows:function(){
        var cmap={}; (ST.RAWX.customers||[]).forEach(function(x){ cmap[x.id]=x; });
        var out=(ST.RAWX.contracts||[]).map(function(c){
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
        {k:'version',l:'Ver.',t:'select',opts:VER_OPTS,fmt:function(v){ return v||'·'; },na:function(r){ return !/^(Cloud|S1)$/.test(String(r.line||'')); }},                             /* V6.0 · V5.0 · ZTNA (Cloud NAC 계약) */
        {k:'channel',l:'판매 채널',t:'select',opts:CH_OPTS},
        {k:'lead_src',l:'유입경로',t:'select',opts:LEAD_OPTS,fmt:function(v){ return v||'·'; }},   /* 직접영업/파트너영업/인바운드/프로모션/기타 (SQL 80) */
        {k:'partner',l:'파트너',t:'list',opts:PTN_OPTS},           /* 목록에서 고르거나 직접 입력 */
        {k:'biller',l:'계산서발행처'},
        {k:'combine',l:'모듈',t:'select',opts:COMBINE_OPTS,na:function(r){ return !/^(Cloud|S1)$/.test(String(r.line||'')); }},
        {k:'contract_type',l:'구분',t:'select',opts:CTYPE_OPTS},
        {k:'status',l:'상태',t:'select',opts:CSTATUS_OPTS,badge:1},
        {k:'live_override',l:'LIVE 예외',t:'select',opts:LIVEOV_OPTS,fmt:function(v){ return v? (v==='포함'? '포함(고정)':'제외(고정)') : '·'; },na:function(){ return true; }},   /* 규칙보다 우선 — 비우면 규칙대로 (64단계) */
        {k:'live_override_note',l:'LIVE 예외 사유',na:function(r){ return !r.live_override; }},
        {k:'auto_renew',l:'자동연장',t:'bool',fmt:function(v){ return v? '매월 자동연장':'·'; }},   /* 월 단위 자동연장 — 만기 목록·슬랙 알림에서 제외 (SQL 84 · ㊿+127) */
        {k:'renew_count',l:'연장',ro:true,fmt:renewLabel,na:function(){ return true; }},                /* 연장 회차 — «갱신» 탭으로 올라감 */
        {k:'churn_reason',l:'해지사유',t:'list',opts:CHURN_OPTS,na:function(r){ return !/해지|종료|CN전환/.test(String(r.status||'')); }},
        {k:'start_month',l:'시작월',t:'month'},
        {k:'end_month',l:'종료월',t:'month'},
        {k:'churn_month',l:'해지월',t:'month',fmt:function(v,r0){ return v? String(v).slice(0,7) : (/해지|종료/.test(String(r0&&r0.status||''))&&r0.end_month? String(r0.end_month).slice(0,7)+' (종료월)' : '·'); },na:function(){ return true; }},
        {k:'s1_no',l:'에스원 계약번호',t:'list',opts:function(){ return s1NoOpts(); },na:function(r){ return r.channel!=='에스원' && !/^(S1|MDR_S1)$/.test(String(r.line||'')); }},
        {k:'mrr',l:'MRR(천원)',t:'number',won:1},
        {k:'qty',l:'노드수',t:'number',fmt:function(v){ return v? Number(v).toLocaleString('ko-KR') : '·'; }},   /* 매출시트 «노드수» — LIVE 노드 합계의 근거 */
        {k:'csm',l:'CSM(사이트명)',na:function(r){ return !/^(Cloud|S1)$/.test(String(r.line||'')); }},                              /* 영문 사이트명 (site name) */
        {k:'billing',l:'과금방식',t:'list',opts:BILLING_OPTS},     /* 목록에서 고르거나 직접 입력 */
        {k:'install_fee',l:'설치비(천원)',t:'number',won:1,na:function(r){ return r.channel!=='에스원'; }},        /* 1회성 · 주로 에스원(S1) 계약 */
        {k:'settle_month',l:'대금정산일',t:'month',na:function(r){ return !r.install_fee; }},                /* 설치비를 인식하는 달 */
        {k:'note',l:'비고',t:'list',opts:CNOTE_OPTS,na:function(){ return true; }}
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
      var g=/** @type {GridDef} */ ({
        title:'LIVE 고객사',
        rowClick:function(r){ openCust360(r.name||r.cust); },
        rows:function(){
          if(ST.LIVE_SRC==='sheet') return (ST.RAWX.live||[]).slice().sort(function(a,b){
            var n=String(b.start_month||'').localeCompare(String(a.start_month||''));
            return n || ((b.id||0)-(a.id||0)); });
          var lv=liveCalc(LV.T!=null? LV.T : undefined);
          return lv.rows.slice().sort(function(a,b){ return String(b.curStart||'').localeCompare(String(a.curStart||'')) || String(a.cust).localeCompare(String(b.cust),'ko'); });
        }
      });
      Object.defineProperty(g,'cols',{get:function(){ return ST.LIVE_SRC==='sheet'? SHEET_COLS : DB_COLS; }});
      Object.defineProperty(g,'table',{get:function(){ return ST.LIVE_SRC==='sheet'? 'live_customers' : ''; }});
      Object.defineProperty(g,'ro',{get:function(){ return ST.LIVE_SRC!=='sheet'; }});
      Object.defineProperty(g,'add',{get:function(){ return ST.LIVE_SRC==='sheet'; }});
      Object.defineProperty(g,'del',{get:function(){ return ST.LIVE_SRC==='sheet'; }});
      Object.defineProperty(g,'cap',{get:function(){ return ST.LIVE_SRC==='sheet'
        ? '예전 LIVE 고객사 탭을 옮겨 둔 명단(직접 편집) — 대조용 · 행 클릭 = 고객 360'
        : '계약을 등록하면 자동으로 따라오는 명단 — 따로 등록하지 않습니다 · 새 고객은 입력·수정 › 계약에서 신규 계약, 빠질 때는 해지 처리 · 행 클릭 = 고객 360'; }});
      return g;
    })(),
    lg:{
      title:'LG U+ 판매', table:'lg_sales',
      cap:'LG 경유 판매 계약 (매출은 각 라인에 포함)', add:true, del:true,
      rows:function(){ return ST.RAWX.lg||[]; },
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
      rows:function(){ return ST.RAWX.biz||[]; },
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
      rows:function(){ return ST.RAWX.targets||[]; },
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
      cap:'행 클릭 = 고객 360 · 진행 상태 관리 · 신규 등록은 영업 › OI 등록 · 삭제는 «더보기»', add:false, del:true, pin:['customer','stage'],
      rowClick:function(r){ openCust360(r.customer); },
      rows:function(){ return ST.RAWX.oi||[]; },
      cols:[
        {k:'created_at',l:'등록일',ro:true,fmt:function(v){return String(v||'').slice(0,10);}},
        {k:'stage',l:'진행상태',t:'select',opts:OI_STAGE,badge:1},
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
        {k:'contract_id',l:'계약전환',ro:true,fmt:function(v){ return v? '전환됨 #'+v : '·'; },na:function(r){ return !/수주|계산서발행|종료/.test(String(r.stage||'')); }},
        {k:'quote_file',l:'견적서',ro:true,
          href:function(v){ return 'quote.html?view='+encodeURIComponent(v); },
          fmt:function(v){ if(!v) return '·'; if(/^q:/.test(String(v))) return '견적서 '+String(v).slice(2); var L=qLabel(String(v).split('/').pop()); return '견적서 '+(L.d||L.c); },na:function(){ return true; }},   /* ㊿+177 q:견적번호 = 포탈 DB 견적 */
        {k:'rival_price',l:'경쟁사가(천원)',t:'number',won:1,na:function(){ return true; }},
        {k:'next_action',l:'다음 할 일',na:function(r){ return /수주|계산서발행|종료|중지|실패/.test(String(r.stage||'')); }},
        {k:'next_date',l:'예정일',t:'date',na:function(r){ return /수주|계산서발행|종료|중지|실패/.test(String(r.stage||'')); }},
        {k:'cust_name',l:'고객 담당자'},
        {k:'cust_phone',l:'연락처'},
        {k:'lost_reason',l:'실패사유',na:function(r){ return !/실패|중지/.test(String(r.stage||'')); }},
        {k:'note',l:'비고',na:function(){ return true; }}
      ]
    },
    mdrops:{
      title:'MDR 운영·신청 현황', table:'mdr_ops',
      chipsField:'status', chipsOpts:['신청','대기','진행중','데모','구독','종료'],
      cap:'행 클릭 = 고객 360 · PoC 신청부터 운영까지 — 신청 → 진행중 → 데모 → 구독 · 설치율 = 설치 ÷ 계약 수량', add:true, del:true,
      rowClick:function(r){ if(!ST.IS_EQUIP) openCust360(r.customer); },
      rows:function(){ return (ST.RAWX.mdrops||[]).slice().sort(function(a,b){
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
      chipsField:'channel', chipsOpts:ORD_CH_OPTS, pin:['customer','status'],
      cap:'저장할 때마다 장비 현황에 자동 반영됩니다 — 접수·출하요청·배송중은 재고, 설치완료·회수예정은 임대중, 회수완료는 회수완료 (취소는 현황에서 내림) · 시리얼 칩 = 시리얼 상세 · 회수는 행의 «회수 처리»(일부·전부·취소 미리 보기 → 저장 → 되돌리기) · 시리얼을 비워두면 «미등록 시리얼»로 수량만큼 임시 등록 · 신규 신청은 장비 › 임대 장비 신청 · 삭제는 «더보기»', add:true, del:true,
      rows:function(){ return ST.RAWX.orders||[]; },
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
        {k:'standalone_pod',l:'단독Pod',t:'bool',fmt:function(v){return v?'단독':'·';}},
        {k:'recv_name',l:'수령인'},
        {k:'ship_date',l:'수령희망',t:'date'},
        {k:'status',l:'상태',t:'select',opts:ORD_STATUS_OPTS,badge:1},
        {k:'returned_date',l:'회수일',t:'date',na:function(r){ return !/회수/.test(String(r.status||'')); },fmt:function(v,r){
          if(v) return String(v).slice(0,10);
          return (r&&r.status==='회수완료')? '· ⚠ 미입력' : '·';     /* 회수완료인데 날짜가 없으면 표시 */
        }},
        {k:'returned_serials',l:'회수 현황',fmt:function(v,r){      /* 일부 회수: 회수된 시리얼 수 / 전체 (↩ 버튼으로 선택) */
          var all=eqWant(r||{}), ret=eqRetSet(r||{});
          if(!all.length) return v? String(v) : '·';
          if(r.status==='회수완료') return all.length+'/'+all.length+' 회수';
          return ret.length? (ret.length+'/'+all.length+' 일부 회수') : '·';
        },na:function(r){ return !/회수/.test(String(r.status||'')) && !eqRetSet(r).length; }},
        {k:'serials',l:'시리얼',html:true,raw:true,fmt:function(v,r){ return eqSerialsHtml(r||{}); }},
        {k:'request_note',l:'요청사항',na:function(){ return true; }}
      ]
    },
    assets:{
      title:'임대 장비 현황 (시리얼 단위)', table:'equipment_assets',
      chipsField:'channel', chipsOpts:ORD_CH_OPTS, pin:['serial','status'],
      cap:'신청 내역에서 자동으로 만들어지는 시리얼 단위 저장소입니다 — 신청에 붙은 장비(자물쇠)는 «임대 장비 신청 내역»에서 수정·회수 처리하면 따라옵니다 · 여기서는 신청과 무관한 재고·데모·판매 장비만 직접 등록·수정', add:true, del:true,
      rows:function(){
        var om={}; (ST.RAWX.orders||[]).forEach(function(o){ om[String(o.id)]=o; });
        var out=(ST.RAWX.assets||[]).slice();
        out.forEach(function(a){ var o=(a.order_id!=null)? om[String(a.order_id)] : null; a._ostat=o? (o.status||''):''; });
        return out.sort(function(a,b){
          var x=a.in_date||a.deployed_date||'', y=b.in_date||b.deployed_date||'';
          if(x!==y) return String(y).localeCompare(String(x));      // 최신 위, 빈 값 아래
          return String(a.serial||'').localeCompare(String(b.serial||'')); }); },
      cols:[
        {k:'serial',l:'시리얼',req:true},
        {k:'model',l:'모델',t:'select',opts:MODEL_OPTS},
        {k:'usage',l:'구분',t:'select',opts:['임대','데모','대여','판매','하자보수']},
        {k:'status',l:'상태',t:'select',opts:['재고','임대중','회수완료','판매완료','수리중','분실','폐기'],badge:1},
        {k:'_ostat',l:'신청상태',ro:true,fmt:function(v,r){ return (r&&r.order_id==null)? '· 신청 없음' : (v||'· 신청 삭제됨'); }},
        {k:'customer',l:'고객사'},
        {k:'channel',l:'채널',t:'select',opts:ORD_CH_OPTS},
        {k:'partner',l:'파트너'},
        {k:'in_date',l:'입고일',t:'date'},
        {k:'deployed_date',l:'출고일',t:'date'},
        {k:'returned_date',l:'회수일',t:'date',na:function(r){ return r.status!=='회수완료'; },fmt:function(v,r){
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
        var out=(ST.RAWX.inbound||[]).slice();
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
      cap:'계약·고객사·장비·OI 데이터를 규칙으로 훑어 어긋난 행을 보여줍니다 (메모리 데이터 · 서버 왕복 없음) — 항목을 누르면 수정 창이 열려 바로 고칩니다', add:false, del:false, ro:true,
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
    quotes:{   /* ㊿+177 견적을 포탈 DB 에(SQL 109) — 내용은 견적 화면에서 · 여기선 상태 · OI 연결 · 메모 */
      title:'견적 목록', table:'quotes',
      cap:'견적·발주 시스템에서 «💾 저장» · «PDF 발행»한 견적(포탈 DB) · 여기서는 상태(발송 · 수주 · 실주) · OI 번호 · 메모만 고침 — 내용은 행의 📄(견적 화면에서 열기) · 발송한 견적을 고치면 새 번호 · 금액은 원(VAT 포함)',
      add:false, del:'super', pin:['quote_no','customer_name'],
      rows:function(){ return ST.RAWX.quotes||[]; },
      cols:[
        {k:'quote_no',l:'번호',ro:true,fmt:function(v,r){ return v || ('발주서 #'+r.id); }},
        {k:'quote_date',l:'견적일',ro:true},
        {k:'customer_name',l:'고객사',ro:true},
        {k:'qtype',l:'종류',ro:true,fmt:function(v){ return ({enterprise:'기업용', public:'공공용', po:'발주서'})[v]||v||''; }},
        {k:'grand_total',l:'합계(원)',ro:true,num:true,fmt:function(v){ return v==null? '' : Math.round(+v).toLocaleString('ko-KR'); }},
        {k:'status',l:'상태',t:'select',opts:['작성','발송','수주','실주'],badge:1},
        {k:'oi_id',l:'OI 번호',t:'number'},
        {k:'manager',l:'견적 담당',ro:true},
        {k:'note',l:'메모'},
        {k:'created_by',l:'작성',ro:true,fmt:function(v){ return String(v||'').split('@')[0]; }},
        {k:'updated_at',l:'고친 시각',ro:true,fmt:function(v){ return String(v||'').replace('T',' ').slice(0,16); }}
      ]
    },
    aiknow:{
      title:'AI 지식 — AI 에게 가르치기', table:'ai_knowledge',
      cap:'여기 적은 사실·규칙·용어는 포탈 AI 가 모든 질문에 답할 때 최우선으로 참고합니다 (SQL 78 · ask 함수 v3)', add:false, del:false,
      custom:function(){ renderAiKnow(); },
      rows:function(){ return ST.RAWX.aiknow||[]; },
      cols:[{k:'topic',l:'주제'},{k:'content',l:'내용'},{k:'active',l:'적용',t:'bool'}]
    },
    log:{
      title:'변경 이력', table:'change_log',
      cap:'웹에서 수정한 기록 (최근 300건)', add:false, del:false, ro:true,
      rows:function(){ return ST.RAWX.log||[]; },
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
}
