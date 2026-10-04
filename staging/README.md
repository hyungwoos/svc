# SVC 포탈 — Genians 서비스사업부 통합 관리 포탈

GitHub Pages 에 올라가는 **정적 포탈**(HTML + CSS + JS) 과, 그 포탈이 쓰는 **Supabase Edge Function 소스**, 그리고 둘을 검사하는 **테스트**가 한 저장소에 있습니다.
운영 주소: `https://hyungwoos.github.io/svc/index.html` · 스테이징: `…/svc/staging/index.html` (같은 DB · 노란 띠).

> 고객·매출 데이터, 비밀 키, 인수인계 문서(CLAUDE.md), SQL 마이그레이션 파일은 이 **공개** 저장소에 올리지 않습니다 (`.gitignore`). 테스트 fixture 는 전부 가상 데이터입니다.

## 구성

```
index.html            뼈대 — <meta name="app-ver"> 가 포탈 버전(㊿+NN), <meta name="app-js"> 가 js 로드 순서. 인라인 스크립트·onclick 없음(CSP)
app.css               스타일 (디자인 3종: cc 커맨드 센터 · simple · classic)
js/boot.js            head — meta 에서 APP_VER 를 읽어 app.css?v= 로드  (내용이 바뀌지 않는 파일)
js/load.js            body 끝 — app-js 목록을 ?v=APP_VER 로 순서대로 로드 (내용이 바뀌지 않는 파일)
js/*.js (17개)        기능별 선언 파일 — 전역 var/function 만, 아무것도 실행하지 않음
  viz · core · shell · dash · ai · grids · equipment · analysis · tools · price · inbound · admin · sales · report · grid · edit
js/init.js            즉시 실행 문장 전부(이벤트 등록 · GRIDS 표 정의 · boot()) — 새 초기화 코드는 이 파일 끝, boot() 앞에
quote.html report.html s1.html kk.html orders.html   위성 페이지(iframe) — 세션은 sessionStorage['svc_sess'] 공유
manifest.webmanifest sw.js pwa-*.png                 홈 화면 앱(PWA) — js 파일을 더하면 sw.js SHELL 도 함께
staging/              스테이징 사본 (배포·운영 › «운영 → 스테이징 동기화» 가 만듦)
cloudflare/quote-worker/worker.js   견적 저장 서버(Cloudflare Worker) 소스 — 포탈 로그인 토큰 검증 · 배포는 Cloudflare 대시보드 Edit code 에 붙여넣기 ※ 사이트 배포엔 포함되지 않음
supabase/functions/   Edge Function 소스 — ops(배포·운영) · remind(만기 슬랙) · aicheck(AI 야간 점검)   ※ 사이트 배포엔 포함되지 않음 · ask(AI) 소스는 업무 지식(고객명·금액)이 들어 있어 공개 저장소에 두지 않음(.gitignore)
tests/                정적 검사 · 브라우저 스모크 · 함수 테스트 (아래)
.github/workflows/deploy.yml   테스트 통과 → Pages 배포
```

버전 규칙: **app.css 나 js/ 를 바꾸면 index.html 의 `app-ver` 를 +1** 해서 같이 올립니다(HTML·CSS·JS 가 항상 같은 버전으로 짝). 포탈 «배포·운영» 이 index.html 없이 코드만 올리면 경고합니다.

## 테스트

| 명령 | 무엇 | 필요한 것 |
|---|---|---|
| `npm run check` | 정적 검사 — 모든 HTML/JS 문법, 비밀값 패턴, CSP·SRI, APP_VER 한 곳, app-js ↔ sw.js SHELL 일치, 최상위 함수 이름 중복, 코드 목록(CODE_KIND) 정합, fixture 가 가상 데이터인지 | Node 20 |
| `npm test` | 브라우저 스모크(Playwright) — 가짜 Supabase/CDN 으로 포탈을 띄워 화면 20여 개 · 만기 처리 · MFA · 배포·운영 · 코드 관리 · 데이터 점검 동작과 **쓰기 요청 본문**을 확인. 운영 DB 접근 없음 | `npm install && npm run test:install` |
| `npm run test:fn` | Edge Function·견적 Worker — `deno check` + ops/remind/aicheck/quote-worker 를 가짜 외부 서비스(GitHub·Management API·Auth·Slack·ask)로 실행해 인증·동작·보호 경로·PIN 잠금·슬랙 본문·점검 판정 확인 | Deno 2 |

`tests/fixture/load_all.json` 은 `rpc/load_all` 의 가짜 응답(고객명 «가상고객NN»). 실데이터를 fixture 로 쓰지 마세요 — `check.mjs` 가 막습니다.

## 배포 흐름

1. 포탈 **관리자 › 🚀 배포·운영** 에서 파일/폴더를 끌어넣어 **스테이징** 대상으로 커밋 (또는 git push)
2. GitHub Actions `test-and-deploy`: `test`(정적 + 스모크) 와 `functions`(deno check + 함수 테스트) 가 **둘 다** 통과해야 `deploy` 가 `_site`(tests·supabase·.github·*.md·sql*.sql 제외)를 Pages 에 올림 — 실패하면 라이브는 이전 버전 그대로
3. `…/svc/staging/index.html` 에서 확인 → 배포·운영 «스테이징 → 운영 승격»
4. Edge Function 은 배포·운영 › Edge Function 탭에서 소스를 붙여 배포 (Verify JWT 는 **끔** — 함수 안에서 토큰 검사) · SQL 은 SQL 탭에서

저장소 Settings › Pages › Source 는 **GitHub Actions** 여야 2번이 배포를 맡습니다.

## 백엔드(요약)

- Supabase(REST/RPC + RLS) — 공개 코드에는 anon 키만, 실제 경계는 RLS. 선택 목록은 `code_lists` 표 한 곳(포탈 select · 데이터 점검 · DB 트리거 검증이 모두 참조).
- Edge Functions: `ask`(AI 질문·도구 — 소스는 비공개 보관) · `ops`(GitHub 커밋 · SQL 실행 · 함수 배포 — 토큰은 Secrets 에만, 포탈엔 작업 PIN) · `remind`(월말 만기 슬랙) · `aicheck`(매일 새벽 AI 답 품질 점검 → ai_check_log · 통과율 미달 시 슬랙).
- 견적 저장 서버(Cloudflare Worker `aged-union-cdd3`): GitHub 토큰은 Worker 시크릿에만, 포탈·견적서는 로그인 토큰(Bearer)으로 호출 → Worker 가 Supabase 로 토큰·역할·메뉴 권한(quote)을 확인. 저장·삭제는 change_log 에도 기록.
- 모든 데이터 변경은 `change_log`, 운영 동작은 `ops_log`, 밤마다 `snap` 스키마에 스냅샷.
