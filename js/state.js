/* state.js — 여러 파일이 함께 바꾸는 상태를 한곳에 (ES 모듈 전환 1단계 · ㊿+150)
   · 예전엔 17개가 각 파일의 전역 var 였고 다른 파일이 값을 바꿨음(«공유 상태» · tests/lint.mjs 가 세던 목록).
     모듈로 바꾸면 파일 안 var 는 파일 밖에서 안 보이므로, 먼저 전부 ST.* 로 모아 둠 — 2단계에서 이 파일만 export 하면 됨.
   · 규칙: 두 파일 이상이 «값을 바꾸는» 변수는 여기에만 둔다(lint 가 새로 생기면 실패). 한 파일 안에서만 쓰는 상태는 그 파일의 var 그대로.
   · 이름은 ST (STATE 는 dash.js 의 대시보드 거르기 상태라 다름). app-js 목록 맨 앞에서 로드. */
var ST={
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
  IDLE_WARNED:false
};
