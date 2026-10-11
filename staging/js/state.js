/* state.js — 여러 파일이 함께 바꾸는 상태를 한곳에 (ES 모듈 전환 1단계 · ㊿+150)
   · 예전엔 17개가 각 파일의 전역 var 였고 다른 파일이 값을 바꿨음(«공유 상태» · tests/lint.mjs 가 세던 목록).
     모듈로 바꾸면 파일 안 var 는 파일 밖에서 안 보이므로, 먼저 전부 ST.* 로 모아 둠 — 2단계에서 이 파일만 export 하면 됨.
   · 규칙: 두 파일 이상이 «값을 바꾸는» 변수는 여기에만 둔다(lint 가 새로 생기면 실패). 한 파일 안에서만 쓰는 상태는 그 파일의 var 그대로.
   · 이름은 ST (STATE 는 dash.js 의 대시보드 거르기 상태라 다름). app-js 목록 맨 앞에서 로드. */
/** 포탈 데이터 — shell.js buildFromRes() 가 만드는 모양 (키를 잘못 쓰면 타입 검사가 잡음 · 키를 더하면 여기도)
 * @typedef {Object} PortalData
 * @property {string} generatedAt 만든 시각 @property {string} todayKey @property {number} nowIdx 이번 달 인덱스 @property {string[]} monthKeys 'YYYY-MM' 목록(2020-06 부터)
 * @property {{label:string, color:number}[]} lines 사업 라인(표시 순서) @property {PortalRow[]} rows 계약 행 @property {any[]} warnings
 * @property {any} live LIVE 시트 요약(shapeLive) @property {any} lg LGU+ 요약(shapeLg) @property {any} vs 비즈포탈 대조(shapeVs) @property {string} sheetUrl
 */
/** 계약 한 줄(매출 행) — 금액은 원 단위 · 월은 monthKeys 인덱스
 * @typedef {Object} PortalRow
 * @property {number} _id 계약 id @property {string} line 사업 라인 코드 @property {string} ind 업종 @property {string} cust 고객사
 * @property {string} sector @property {string} sectorDetail @property {boolean} sectorDup @property {boolean} sectorChk
 * @property {string} partner 계산서 발행처 @property {string} ptn 파트너 @property {string} ctype 계약 유형 @property {string} status 상태 @property {string} note
 * @property {string} churn 해지 사유 @property {string} saleType @property {string} ver 버전 @property {string} csm @property {string} channel 판매 채널 @property {string} lead 유입경로 @property {string} combine 모듈
 * @property {?number} startIdx 시작월(없으면 첫 매출 월) @property {?number} endIdx 종료월(없으면 마지막 매출 월) @property {?number} dataFirst @property {?number} dataLast
 * @property {?number} startRaw 계약서 시작월 @property {?number} endRaw 계약서 종료월 @property {string} liveOv LIVE 예외 포함/제외 @property {string} liveOvNote
 * @property {number} term 계약 개월 @property {number} qty 수량 @property {number} total 총액 @property {string} billing 과금 @property {number} mrr @property {number} fee 설치비 @property {string} settle 대금정산일
 * @property {number} renew 연장 회차 @property {any[]} renewHist @property {boolean} autoRenew 월 자동연장 @property {string} s1no 에스원 계약번호
 * @property {number} cid 고객사 id @property {?number} parent 원계약 id(부속 계약) @property {boolean} noCount 고객사 수·신규·해지에서 뺌
 * @property {number} sum 매출 합계 @property {Array<[number, number, number]>} segs 같은 금액 구간 [시작, 끝, 금액]
 * @property {number} [_f] 첫 매출 월(없으면 -1) @property {number} [_l] 마지막 매출 월 @property {number} [_k] ST.MAT 의 행 번호 @property {boolean} [_hw] H/W 판매(MRR 집계 제외) — 넷 다 shell.js onData 가 붙임
 */
/** 메뉴 하나의 권한 — 보기 · 읽기 · 쓰기 (user_perms · SQL 79) @typedef {{v:boolean, r:boolean, w:boolean}} ViewPerm */
/** 코드 목록 한 줄 (code_lists · SQL 93) @typedef {{kind:string, value:string, label?:string, sort?:number, active?:boolean, note?:string}} CodeItem */
/** AI 대화 한 턴 @typedef {{q:string, a?:string, restate?:string}} ChatTurn */
/** 여러 파일이 함께 쓰는 상태 — 아래 ST 의 «이름표»(키를 잘못 쓰면 타입 검사가 잡음 · 새 키는 여기와 ST 에 함께)
 * @typedef {Object} AppState
 * @property {?PortalData} DATA 서버에서 받은 원본 @property {number} M 월 개수 @property {Array<Float64Array|number[]>} MAT 행마다 월별 금액
 * @property {?string} SB_TOKEN 로그인 토큰 @property {?string} AUTH_USER 로그인 이메일 @property {?Object<string, ViewPerm>} PERMS 메뉴 권한
 * @property {?Object<string, CodeItem[]>} CODES 코드 목록 @property {string} CUR_VIEW 지금 화면 @property {boolean} DIRTY 저장 뒤 다시 읽기 필요
 * @property {string} LIVE_SRC LIVE 판정 기준 db|sheet @property {string} INB_Y 인바운드 연도 @property {any} TCOQ TCO 비교 견적 @property {any} OI_CONVERT 전환 중인 OI 행
 * @property {ChatTurn[]} HIST AI 대화 이력 @property {boolean} HIST_LOADED @property {number} IDLE_LAST 마지막 입력 시각 @property {number} [IDLE_SAVED] 마지막 활동을 localStorage 에 쓴 시각(㊿+180) @property {boolean} IDLE_WARNED
 * @property {?Object<string, any>} RAWX 표별 원본 행 @property {string} MY_ROLE 역할 @property {boolean} IS_SUPER @property {boolean} IS_VIEWER_ROLE @property {boolean} IS_VIEWER
 * @property {boolean} IS_EQUIP 장비·PoC 제한 계정 @property {?string} EQUIP_HOME @property {?number} DASH_BASE0 @property {number} LAST_LOAD @property {?{t:number, n:?number}} INB_TODO
 * @property {?string[]} OWNER_NAMES 계정에 연결된 담당자 이름(SQL 103 user_owner_map) · null = 연결 없음/표 없음
 */
/** @type {AppState} */
export var ST={
  /* 데이터 (core.js buildFromRes 가 채움) */
  DATA:/** @type {?PortalData} */ (null),   // 서버에서 받은 원본(행 shape 포함) · null = 아직 없음
  M:0,                  // 월 개수
  MAT:/** @type {Array<Float64Array|number[]>} */ ([]),   // rows[i] 의 월별 dense 배열
  /* 로그인·권한 */
  SB_TOKEN:/** @type {?string} */ (null),   // access_token (쓰기용) · null = 로그아웃
  AUTH_USER:/** @type {?string} */ (null),  // 로그인 이메일
  PERMS:/** @type {?Object<string, ViewPerm>} */ (null),   // 메뉴 권한 {view:{v,r,w}} · null = 지정 없음
  CODES:/** @type {?Object<string, CodeItem[]>} */ (null),   // 코드 목록 {kind:[…]} · null = 표 없음/아직 안 읽음 → 상수 그대로
  /* 화면 */
  CUR_VIEW:'dash',      // 지금 화면
  DIRTY:false,          // 저장 뒤 다시 읽기 필요
  LIVE_SRC:(function(){ try{ return localStorage.getItem('svc_live_src')||'db'; }catch(e){ return 'db'; } })(),   // LIVE 판정 기준 db|sheet
  INB_Y:String(new Date().getFullYear()),   // 인바운드 연도
  TCOQ:null,            // TCO 비교 견적
  OI_CONVERT:null,      // 전환 중인 OI 행
  /* AI 대화 */
  HIST:/** @type {ChatTurn[]} */ ([]),   // 대화 이력
  HIST_LOADED:false,
  /* 자동 로그아웃 */
  IDLE_LAST:Date.now(),
  IDLE_WARNED:false,
  /* ㊿+154: 예전엔 window 에 바로 두던 값 — 모듈 전환 마무리(window 다리 제거)로 여기로 */
  RAWX:/** @type {?Object<string, any>} */ (null),   // 표별 원본 행 {customers, contracts, orders, …} (shell.js 데이터 읽기가 채움 · 화면마다 더 읽어 붙임)
  MY_ROLE:'',           // 로그인 계정 역할 (super_admin · admin · admin_viewer · viewer · equipment …)
  IS_SUPER:false,       // 슈퍼 관리자
  IS_VIEWER_ROLE:false, // 역할상 조회 전용
  IS_VIEWER:false,      // 지금 화면에서 쓰기 못 함 (역할 + 메뉴 권한 — permEnter)
  IS_EQUIP:false,       // 장비·PoC 제한 계정
  EQUIP_HOME:/** @type {?string} */ (null),   // 제한 계정의 첫 화면
  DASH_BASE0:/** @type {?number} */ (null),   // 홈 «처음» 기준월 (navMenu 가 되돌림)
  LAST_LOAD:0,          // 마지막 데이터 읽기 시각(ms) — 자동 갱신 판단
  INB_TODO:/** @type {?{t:number, n:?number}} */ (null),   // 인바운드 처리할 일 수 캐시 {t, n}
  OWNER_NAMES:/** @type {?string[]} */ (null)   // ㊿+172 계정 ↔ 담당자 이름(관리자 지정 · SQL 103) — 없으면 이 브라우저에서 고른 이름(임시)
};

/* 환경 — ㊿+153: 예전 boot.js(APP_VER) · init.js(IS_STAGING · IS_QA) 에서 옮김 */
export var APP_VER=(function(){ var m=document.querySelector('meta[name="app-ver"]'); return (m&&m.content)||'0000-00-00 ㊿+0'; })();   // 포탈 버전 — index.html <meta name="app-ver"> 한 곳
export var IS_STAGING=/\/staging\//.test(location.pathname);
export var IS_QA=/[?&]qa=(?:1|data)(?:&|$)/.test(location.search);   /* ㊿+151: 스테이징 QA 가 iframe 으로 열 때 — 서비스 워커·사본·오류 기록·팝업 생략 */
export var IS_QA_DATA=/[?&]qa=data(?:&|$)/.test(location.search);   /* ㊿+157: QA «데이터 입력·수정» — 가짜 DB(js/qadb.js · js/qadata.js)로만 동작 */
