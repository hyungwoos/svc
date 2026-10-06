/* state.js — 여러 파일이 함께 바꾸는 상태를 한곳에 (ES 모듈 전환 1단계 · ㊿+150)
   · 예전엔 17개가 각 파일의 전역 var 였고 다른 파일이 값을 바꿨음(«공유 상태» · tests/lint.mjs 가 세던 목록).
     모듈로 바꾸면 파일 안 var 는 파일 밖에서 안 보이므로, 먼저 전부 ST.* 로 모아 둠 — 2단계에서 이 파일만 export 하면 됨.
   · 규칙: 두 파일 이상이 «값을 바꾸는» 변수는 여기에만 둔다(lint 가 새로 생기면 실패). 한 파일 안에서만 쓰는 상태는 그 파일의 var 그대로.
   · 이름은 ST (STATE 는 dash.js 의 대시보드 거르기 상태라 다름). app-js 목록 맨 앞에서 로드. */
export var ST={
  /* 데이터 (core.js buildFromRes 가 채움) */
  DATA:null,            // 서버에서 받은 원본(행 shape 포함) · null = 아직 없음
  M:0,                  // 월 개수
  MAT:[],               // rows[i] 의 월별 dense 배열
  /* 로그인·권한 */
  SB_TOKEN:null,        // access_token (쓰기용) · null = 로그아웃
  AUTH_USER:null,       // 로그인 이메일
  PERMS:null,           // 메뉴 권한 {view:{v,r,w}} · null = 지정 없음
  CODES:null,           // 코드 목록 {kind:[…]} · null = 표 없음/아직 안 읽음 → 상수 그대로
  /* 화면 */
  CUR_VIEW:'dash',      // 지금 화면
  DIRTY:false,          // 저장 뒤 다시 읽기 필요
  LIVE_SRC:(function(){ try{ return localStorage.getItem('svc_live_src')||'db'; }catch(e){ return 'db'; } })(),   // LIVE 판정 기준 db|sheet
  INB_Y:String(new Date().getFullYear()),   // 인바운드 연도
  TCOQ:null,            // TCO 비교 견적
  OI_CONVERT:null,      // 전환 중인 OI 행
  /* AI 대화 */
  HIST:[],              // 대화 이력
  HIST_LOADED:false,
  /* 자동 로그아웃 */
  IDLE_LAST:Date.now(),
  IDLE_WARNED:false,
  /* ㊿+154: 예전엔 window 에 바로 두던 값 — 모듈 전환 마무리(window 다리 제거)로 여기로 */
  RAWX:null,            // 표별 원본 행 {customers, contracts, orders, …} (shell.js 데이터 읽기가 채움 · 화면마다 더 읽어 붙임)
  MY_ROLE:'',           // 로그인 계정 역할 (super_admin · admin · admin_viewer · viewer · equipment …)
  IS_SUPER:false,       // 슈퍼 관리자
  IS_VIEWER_ROLE:false, // 역할상 조회 전용
  IS_VIEWER:false,      // 지금 화면에서 쓰기 못 함 (역할 + 메뉴 권한 — permEnter)
  IS_EQUIP:false,       // 장비·PoC 제한 계정
  EQUIP_HOME:null,      // 제한 계정의 첫 화면
  DASH_BASE0:null,      // 홈 «처음» 기준월 (navMenu 가 되돌림)
  LAST_LOAD:0,          // 마지막 데이터 읽기 시각(ms) — 자동 갱신 판단
  INB_TODO:null         // 인바운드 처리할 일 수 캐시 {t, n}
};

/* 환경 — ㊿+153: 예전 boot.js(APP_VER) · init.js(IS_STAGING · IS_QA) 에서 옮김 */
export var APP_VER=(function(){ var m=document.querySelector('meta[name="app-ver"]'); return (m&&m.content)||'0000-00-00 ㊿+0'; })();   // 포탈 버전 — index.html <meta name="app-ver"> 한 곳
export var IS_STAGING=/\/staging\//.test(location.pathname);
export var IS_QA=/[?&]qa=1(?:&|$)/.test(location.search);   /* ㊿+151: 스테이징 QA 가 iframe 으로 열 때 — 서비스 워커·사본·오류 기록·팝업 생략 */
