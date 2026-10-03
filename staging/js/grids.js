/* ===== grids.js — 선택 목록(LINE_OPTS 등) · 표 정의(GRIDS 는 init.js) · 데모 데이터 =====
   포탈 본체(js/app.js)를 ④ 아키텍처 2단계(㊿+136)에서 기능별로 나눈 파일. 전역 var/function 그대로 — 즉시 실행 문장은 전부 js/init.js 에.
   로드 순서는 index.html <meta name="app-js"> (js/load.js 가 그 순서대로 ?v=APP_VER 를 붙여 불러옴) */


/* ==================================================================
   6. 데모 데이터 (Apps Script 밖에서 열었을 때만)
   ================================================================== */
/* ==================================================================
   좌측 메뉴 · 데이터 관리 그리드
   ================================================================== */
var CUR_VIEW='dash', DIRTY=false;

/* ===== 코드 목록 (code_lists 표 · SQL 93 · ㊿+137) =====
   아래 *_OPTS 상수는 «기본값(표가 없을 때)». 로그인 뒤 loadCodes() 가 DB 의 code_lists 를 읽어 applyCodes() 로 **같은 배열 객체의 내용을 바꿔 넣음**
   (arr.length=0 후 push) → GRIDS 열 opts·폼·데이터 점검 규칙 등 이 배열을 참조하는 모든 곳에 자동 반영. 값 추가·숨김은 관리자 › 코드 관리.
   DB 쪽도 같은 표를 트리거로 검증(값이 바뀔 때만) 하므로 포탈·DB 가 한 목록을 봄. 주의: order_status(장비 상태 흐름 EQ_ST·상태 보드 열)·line(LIVE 규칙) 은
   값에 화면 로직이 붙어 있어 새 값을 더하면 코드도 손봐야 함 — 코드 관리 화면에 그 안내가 있음. */
var CODES=null;              // {kind:[{value,label,sort,active,note}]} · null = 표 없음/아직 안 읽음 → 상수 그대로
var CODE_KIND={contract_status:'CSTATUS_OPTS', contract_type:'CTYPE_OPTS', channel:'CH_OPTS', line:'LINE_OPTS', lead_src:'LEAD_OPTS', live_override:'LIVEOV_OPTS',
  order_status:'ORD_STATUS_OPTS', order_channel:'ORD_CH_OPTS', model:'MODEL_OPTS', billing:'BILLING_OPTS', churn_reason:'CHURN_OPTS', partner:'PTN_OPTS', industry:'IND_OPTS', version:'VER_OPTS'};
var CODE_KIND_LABEL={contract_status:'계약 상태', contract_type:'계약 유형', channel:'판매 채널', line:'서비스', lead_src:'유입경로', live_override:'LIVE 예외',
  order_status:'장비 신청 상태', order_channel:'장비 신청 채널', model:'장비 모델', billing:'과금 방식', churn_reason:'해지 사유', partner:'파트너', industry:'산업군', version:'Cloud 버전'};
var CODE_KIND_NOTE={order_status:'상태 흐름(재고·임대중 판정 EQ_ST, 상태 보드 열)이 코드에 있음 — 새 값은 코드 수정도 필요', line:'LIVE·MRR 규칙과 라벨(LINE_LABEL)이 코드에 있음 — 새 서비스는 코드 수정도 필요', live_override:'포함/제외 두 값만 의미가 있음'};
var LIVEOV_OPTS=['포함','제외'];
var ORD_STATUS_OPTS=['접수','출하요청','배송중','설치완료','회수예정','회수완료','취소'];
var ORD_CH_OPTS=['에스원','LGU+','조달','일반','기타'];
var MODEL_OPTS=['S100','S200','S10_R2','S20_R2','S30H_R1','ES30'];
async function loadCodes(){
  if(!SB_TOKEN){ return null; }
  try{
    var rows=await sbTry('code_lists?select=kind,value,label,sort,active,note&order=kind,sort,value');
    if(!rows || !rows.length){ CODES=null; return null; }   // 표 없음(SQL 93 전 · sbAll 은 404 도 [] 로 돌려줌)·비어 있음 → 상수 그대로
    var m={}; rows.forEach(function(r){ (m[r.kind]=m[r.kind]||[]).push(r); });
    CODES=m; try{ sessionStorage.setItem('svc_codes', JSON.stringify(m)); }catch(e){}
    applyCodes(); return m;
  }catch(e){ CODES=null; return null; }
}
function applyCodes(){
  if(!CODES) return;
  Object.keys(CODE_KIND).forEach(function(kind){
    var arr=window[CODE_KIND[kind]], list=CODES[kind]; if(!Array.isArray(arr) || !list) return;
    var vals=list.filter(function(c){ return c.active!==false; }).sort(function(a,b){ return (a.sort||0)-(b.sort||0) || String(a.value).localeCompare(String(b.value)); }).map(function(c){ return c.value; });
    if(!vals.length) return;                           // 전부 숨기면 기본값 유지(화면이 비지 않게)
    arr.length=0; vals.forEach(function(v){ arr.push(v); });
    if(kind==='line' && window.LINE_LABEL) list.forEach(function(c){ if(c.label) LINE_LABEL[c.value]=c.label; });
  });
  fillModelSelect();
}
function codeList(kind){ return (CODES && CODES[kind]) || (window[CODE_KIND[kind]]||[]).map(function(v){ return {kind:kind, value:v, active:true}; }); }
function codeActive(kind, v){ if(v==null || v==='') return true; var arr=window[CODE_KIND[kind]]; return !arr || arr.indexOf(v)>=0; }
/* 발주 신청 폼의 모델 select (#odModel) 를 MODEL_OPTS 로 다시 채움 — 현재 값 유지 */
function fillModelSelect(){ var s=document.getElementById('odModel'); if(!s) return; var cur=s.value; s.innerHTML=MODEL_OPTS.map(function(m){ return '<option>'+esc(m)+'</option>'; }).join(''); if(cur && MODEL_OPTS.indexOf(cur)>=0) s.value=cur; }

var LINE_OPTS=['Cloud','S1','MDR','MDR_S1','DRM','PNS','DLP'];
var PTN_OPTS=['지니언스(직접)','다원티에스','글로웰시스템','에티버스','직접(계산서)'];
/* 에스원 계약번호 후보 — 계약(s1_no) · 에스원 정산 매핑(s1_map) · 임대 장비 신청(equipment_orders.contract_no) 을 모아 보여줍니다 */
function s1NoOpts(){
  var set={}, R=window.RAWX||{};
  (R.contracts||[]).forEach(function(c){ if(c.s1_no) set[String(c.s1_no).trim()]=1; });
  (R.s1map||[]).forEach(function(m){ if(m.contract_no) set[String(m.contract_no).trim()]=1; });
  (R.orders||[]).forEach(function(o){ if(o.contract_no) set[String(o.contract_no).trim()]=1; });
  (R.assets||[]).forEach(function(a){ if(a.contract_no) set[String(a.contract_no).trim()]=1; });
  return Object.keys(set).sort();
}
/* 계약번호로 알아낸 고객사 — 신규 등록 때 «이 번호는 ○○» 안내에 씁니다 */
function s1NoInfo(no){
  no=String(no||'').trim(); if(!no) return null;
  var R=window.RAWX||{};
  var m=(R.s1map||[]).filter(function(x){ return String(x.contract_no).trim()===no; })[0];
  if(m) return {src:'에스원 정산', cust:m.customer||m.s1_name||'', biz:m.biz_no||null};
  var o=(R.orders||[]).filter(function(x){ return String(x.contract_no||'').trim()===no; })[0];
  if(o) return {src:'장비 신청', cust:o.customer||'', biz:null};
  var c=(R.contracts||[]).filter(function(x){ return String(x.s1_no||'').trim()===no; })[0];
  if(c){ var cu=(R.customers||[]).filter(function(x){ return x.id===c.customer_id; })[0]; return {src:'기존 계약', cust:(cu&&cu.name)||'', biz:null}; }
  return null;
}
var IND_OPTS=['기업','공공','금융','의료','미분류'];
/* 계약 관리 선택 목록 */
var CH_OPTS=['일반','조달','LGU+','에스원','유통'];
var LEAD_OPTS=['직접영업','파트너영업','인바운드','프로모션','기타'];   /* 매출 유입경로 (contracts.lead_src · SQL 80) */
var CTYPE_OPTS=['신규','재약정','추가'];
var CSTATUS_OPTS=['신규','재약정','추가','서비스종료','해지','CN전환','통합과금'];
var CNOTE_OPTS=['재약정 완료','재약정 예정','정부 지원','중도 해지','미연장','매월 연장 확인 필요'];
/* 연장 회차 표기: 0 → '·', n → '연장 n회' (툴팁에 회차별 기간·금액) */
function renewLabel(v,r0){                       /* 그리드 셀은 텍스트로 그려지므로 문자열만 */
  var n=Number(v)||0; if(!n) return '·';
  var h=(r0&&Array.isArray(r0.renew_history))? r0.renew_history : (r0&&r0.renewHist)||[];
  var last=h[h.length-1];
  return '연장 '+n+'회'+(last&&last.to? ' (~'+String(last.to).slice(0,7)+')':'');
}
var CHURN_OPTS=['경영악화','비용이슈','폐업','고객사정','구축형전환','기타'];
/* 과금방식 — 목록에서 고르거나 없는 값은 직접 입력할 수 있습니다 (t:'list') */
var BILLING_OPTS=['월납입','일시납','분기납','반년납','연납'];
/* OI (영업기회) — 비즈포탈 체계 그대로 */
var OI_STAGE=['등록','진행','수주','계산서발행','종료','중지','실패'];
var OI_STAGE_DESC={'등록':'초기문의단계','진행':'영업진행단계','수주':'발주서접수','계산서발행':'세금계산서 발행',
  '종료':'수금완료','중지':'진행일시 중지','실패':'수주실패'};
var OI_PROB=[
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
var OI_TYPE=['신규제안','윈백제안','확산(증설)'];
var OI_IND=['공공','의료','학교','기업','금융','국방','홈네트워크'];
/* MDR 결합 모듈 (매출시트 Combine 열) — AV=안티바이러스, AR=안티랜섬웨어 */
var COMBINE_OPTS=['Add-on','MDR+AV','MDR+AR','MDR+AV+AR'];
/* 제품군은 서비스사업부에서 다루는 것만 (+ 직접입력) */
var OI_PRODUCTS=['Cloud NAC','S1 Cloud NAC','Cloud EDR','MDR','S1 MDR','MDR Add-on',
  'AV (안티바이러스)','AR (안티랜섬웨어)','PNS','DRM','DLP'];
var OI_OWNERS=['송기영 부장','최형우 차장'];
var OI_PARTNERS=['다원티에스','글로웰시스템','에티버스','지니언스(주)'];

