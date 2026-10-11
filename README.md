# SVC 포탈 — Genians 서비스사업부 통합 관리 포탈

GitHub Pages 에 올라가는 **정적 포탈**(HTML + CSS + JS) 과, 그 포탈이 쓰는 **Supabase Edge Function 소스**, 그리고 둘을 검사하는 **테스트**가 한 저장소에 있습니다.
운영 주소: `https://hyungwoos.github.io/svc/index.html` · 스테이징: `…/svc/staging/index.html` (같은 DB · 노란 띠).

> 고객·매출 데이터, 비밀 키, 인수인계 문서(CLAUDE.md), SQL 마이그레이션 파일은 이 **공개** 저장소에 올리지 않습니다 (`.gitignore`). 테스트 fixture 는 전부 가상 데이터입니다.

## 구성 (2026-10-11 · ㊿+182)

```
index.html            뼈대 — <meta name="app-ver"> 가 포탈 버전(㊿+NN) · <script type="importmap"> 가 js 주소에 ?v=버전 · 인라인 스크립트·onclick 없음(CSP)
app.css               스타일 (디자인 3종: cc 커맨드 센터 · simple · classic · 다크)
js/main.js            시작점(ES 모듈) — 아래 파일을 import 하고 window.SVC(읽기 전용 손잡이: 시험 · 스테이징 QA · 위성 페이지) → init.js start()
js/state.js           여러 파일이 함께 바꾸는 상태 ST 한 곳 · IS_QA · IS_STAGING · APP_VER
js/*.js (ES 모듈)     core(세션 · 권한 · 금액 · fetchT) · shell(로드 · 캐시 · 홈) · grid/grids(표) · dash(대시보드 계산) · analysis(분석 · 데이터 점검)
                      sales · equipment · inbound · cloud · notify(알림함 · Slack) · guard(옛 탭 · 동시 수정) · edit · tools · home · ai · upd · viz · qadb/qadata(스테이징 QA)
js/lazy.js            처음 열 때 받는 큰 화면 — report.js(리포트) · admin.js(관리자 · 배포·운영 · 내 계정) · price.js(가격표)
js/boot.js js/load.js 옛 고전 스크립트 로더(㊿+153 전) — 지금은 쓰지 않음(운영 저장소에만 남아 있음)
sat/*.js sat/*.css    위성 페이지 코드 — quote.html report.html s1.html kk.html orders.html (iframe · 세션은 sessionStorage['svc_sess'] 공유 · sat/common.js 먼저)
manifest.webmanifest sw.js pwa-*.png   홈 화면 앱(PWA)
staging/              스테이징 사본 (배포·운영 › «운영 → 스테이징 동기화» · 1_github 떼기)
cloudflare/quote-worker/worker.js      견적 저장 서버(Cloudflare Worker) 소스 — 배포는 Cloudflare 대시보드 Edit code ※ 사이트 배포엔 포함되지 않음
supabase/functions/   Edge Function 소스 — ops · notify · remind · aicheck · export ※ 사이트 배포엔 포함되지 않음 · ask(AI) 소스는 업무 지식이 들어 있어 공개 저장소에 두지 않음
tests/                정적 검사 · 단위 시험 · 브라우저 스모크 · 함수 테스트 (아래)
.github/workflows/deploy.yml   테스트 통과 → Pages 배포
```

버전 규칙: **app.css 나 js/ 를 바꾸면 index.html 의 `app-ver` 를 +1** 하고 `node tests/stamp.mjs`(importmap · 위성 `?v=` 갱신) · `js/upd.js` UPD_SEED 에 안내 한 줄 · `tests/check.mjs` 에 그 버전의 규칙. 포탈 «배포·운영» 이 index.html 없이 코드만 올리면 경고합니다.

코드 규칙(검사가 막음): 화면 HTML 은 `tpl```(값은 자동 이스케이프 · 그대로 넣을 조각만 `rawHtml`) · 오늘 날짜는 `todayStr()`(한국 · `toISOString().slice(0,10)` 은 UTC 라 금지) · 바깥 호출은 `fetchT(url, opts, ms, 이름)`(시간 제한 · 쓰기는 자동으로 다시 보내지 않음) · 공유 상태는 `ST.*` · 포탈 코드끼리는 import 로만(window.SVC 안 씀).

## 테스트

| 명령 | 무엇 | 필요한 것 |
|---|---|---|
| `npm run check` | 정적 검사 — 모든 HTML/JS 문법, 비밀값 패턴, CSP·SRI, APP_VER, 버전별 규칙, UTC 날짜 금지, 코드 목록 정합, fixture 가 가상 데이터인지 + **단위 시험**을 함께 돌림 | Node 22 |
| `npm run test:unit` | 단위 시험(`node --test tests/unit.mjs`) — 금액 천원↔원 · 날짜(한국) · 월 인덱스 · 비밀번호 규칙 · 붙여넣기 · 엑셀 수식 막기 · 데이터 점검 키 · 비슷한 이름 · 대시보드 합계. 화면 없이 1초 | Node 22 |
| `npm run lint` | ESLint(포탈 · 위성) · 타입 검사(TypeScript JSDoc) · 공유 상태 · import 규칙 | `npm install` |
| `npm test` | 브라우저 스모크(Playwright) — 가짜 Supabase/CDN/Slack/Worker 로 포탈을 띄워 화면 · 저장 · 권한 · 보안 · 폰 · 연동 동작과 **쓰기 요청 본문**을 확인. 운영 DB 접근 없음. 기본 **3개 병렬**(블록 단위 · `SMOKE_SHARDS=1` 이면 차례대로 · `SMOKE_ONLY=글자` 는 그 시험만) | `npm install && npm run test:install` |
| `npm run test:fn` | Edge Function·견적 Worker — `deno check` + ops/remind/aicheck/notify/export/quote-worker 를 가짜 외부 서비스(GitHub·Management API·Auth·Slack·ask)로 실행해 인증·동작·보호 경로·속도 제한·기록 확인 | Deno 2 |

`tests/fixture/load_all.json` · `tests/fakedb.mjs` 는 가짜 데이터(고객명 «가상고객NN»). 실데이터를 fixture 로 쓰지 마세요 — `check.mjs` 가 막습니다.

## 배포 흐름

1. 포탈 **관리자 › 🚀 배포·운영** 에서 파일/폴더를 끌어넣어 **스테이징** 대상으로 커밋 (또는 git push)
2. GitHub Actions `test-and-deploy`: `test`(정적 + 스모크) 와 `functions`(deno check + 함수 테스트) 가 **둘 다** 통과해야 `deploy` 가 `_site`(tests·supabase·.github·*.md·sql*.sql 제외)를 Pages 에 올림 — 실패하면 라이브는 이전 버전 그대로
3. `…/svc/staging/index.html` 에서 확인 → 배포·운영 «스테이징 → 운영 승격»
4. Edge Function 은 배포·운영 › Edge Function 탭에서 소스를 붙여 배포 (Verify JWT 는 **끔** — 함수 안에서 토큰 검사) · SQL 은 SQL 탭에서

저장소 Settings › Pages › Source 는 **GitHub Actions** 여야 2번이 배포를 맡습니다(«Deploy from a branch» 면 테스트가 실패해도 그대로 라이브에 올라감).

### 파일을 어디에 두나 (2026-10-04 · ㊿+143)

| 파일 | 자리 | 올리는 방법 |
|---|---|---|
| 사이트(index.html · app.css · js/ · 위성 · sw.js · 이미지) · `tests/*.mjs` · `tests/fixture/` | 스테이징 → 승격 | 포탈 배포·운영 › 대상 «스테이징» → 확인 → «스테이징 → 운영 승격» (테스트도 사이트와 같은 버전으로 함께 승격) |
| 저장소 파일: `tests/fn/` · `supabase/functions/` · `cloudflare/` · `README.md` · `package.json` · `.gitignore` | **항상 루트** | 포탈에 끌어 넣으면 대상과 상관없이 루트로 커밋 (승격은 이 파일들을 옮기지 않음) |
| `.github/workflows/deploy.yml` | 루트 | **GitHub 웹에서 직접 편집** — 포탈 토큰에 Workflows 권한이 없음 (포탈에 넣으면 «내용 복사 · GitHub 에서 열기» 안내) |

- 파일 하나만 끌어 넣어도 자리를 맞춥니다: `check.mjs`·`smoke.mjs`·`lib.mjs` → `tests/` · `*.test.ts`·`_mock.ts` → `tests/fn/` · `deploy.yml` → `.github/workflows/` · `worker.js` → `cloudflare/quote-worker/`. `index.ts` 는 함수 이름을 알 수 없어 경로를 고쳐야 커밋됩니다.
- 커밋 전에 «루트에 .mjs/.ts/.yml 이 놓임» · «index.html app-js 목록에 없는 js» 를 경고합니다.
- 배포·운영 › GitHub › **🧹 저장소 점검**: 안 쓰는 파일(예: 옛 `js/app.js`) · 스테이징에만 있는 저장소 파일 · 루트에 없는 테스트/함수 · deploy.yml 상태를 보여 주고 정리(삭제 커밋)합니다.
- CI 실행 환경은 `ubuntu-24.04` 고정 · Node 22 · 액션은 Node 24 로 도는 주 버전. Ubuntu 를 올릴 때는 이 줄만 바꾸고 Actions 결과를 확인하세요.

## 백엔드(요약)

- Supabase(REST/RPC + RLS) — 공개 코드에는 anon 키만, 실제 경계는 RLS. 선택 목록은 `code_lists` 표 한 곳(포탈 select · 데이터 점검 · DB 트리거 검증이 모두 참조).
- Edge Functions: `ask`(AI 질문·도구 — 소스는 비공개 보관) · `ops`(GitHub 커밋 · SQL 실행 · 함수 배포 · 연동 상태 — 토큰은 Secrets 에만, 포탈엔 작업 PIN) · `notify`(알림함 → Slack · 예약 발송) · `remind`(월말 만기 슬랙) · `aicheck`(매일 새벽 AI 답 품질 점검 → ai_check_log) · `export`(외부 시스템용 읽기 API · API 키).
- 연동 상태 한눈에: 포탈 배포·운영 › 기록 › «연동 확인» — GitHub · Supabase 관리 토큰(유효 · 만료일) · Slack 봇 권한 · 예약 발송 · 만기 알림 · AI 야간 점검 · 내보내기 API · 견적 저장 서버 · Cloud 사이트 API · 환율 (읽기만).
- 견적 저장 서버(Cloudflare Worker `aged-union-cdd3`): GitHub 토큰은 Worker 시크릿에만, 포탈·견적서는 로그인 토큰(Bearer)으로 호출 → Worker 가 Supabase 로 토큰·역할·메뉴 권한(quote)을 확인. 저장·삭제는 change_log 에도 기록.
- 모든 데이터 변경은 `change_log`, 운영 동작은 `ops_log`, 밤마다 `snap` 스키마에 스냅샷.
