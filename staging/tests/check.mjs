// 정적 검사 — 모든 HTML 의 <script> 블록 문법 · APP_VER 형식 · 비밀값/실데이터 유출 휴리스틱 · 필수 파일 존재
// 실행: node tests/check.mjs   (브라우저 불필요 · 1초)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'svc-check-'));
const ghErr = (title, m) => { if (process.env.GITHUB_ACTIONS) console.log('::error title=' + title + '::' + String(m).replace(/%/g, '%25').replace(/\r?\n/g, '%0A').slice(0, 900)); };   /* ㊿+158 실패를 Actions 요약 화면(로그인 없이 보임)에 주석으로 */
let fail = 0; const say = (ok, m) => { console.log((ok ? '  ✓ ' : '  ✗ ') + m); if (!ok) { fail++; ghErr('정적 검사 실패', m); } };

const htmls = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
/** 위성 페이지 HTML + 그 페이지가 부르는 sat/*.js (㊿+154 부터 코드는 sat/ 파일에) */
const pageCode = (f) => { const h = fs.readFileSync(path.join(ROOT, f), 'utf8'); return h + [...h.matchAll(/<script src="(sat\/[\w-]+\.js)[^"]*"><\/script>/g)].map((m) => { try { return '\n' + fs.readFileSync(path.join(ROOT, m[1]), 'utf8'); } catch (e) { return ''; } }).join(''); };
say(htmls.includes('index.html'), 'index.html 존재');
for (const f of htmls) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const blocks = [...src.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="importmap")[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((b) => b.trim());   /* importmap 은 JSON — 아래에서 따로 */
  let bad = 0;
  blocks.forEach((b, i) => { const p = path.join(tmp, `${f}.${i}.js`); fs.writeFileSync(p, b); const r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' }); if (r.status !== 0) { bad++; console.log('    ' + r.stderr.split('\n').slice(0, 3).join(' | ')); } });
  say(bad === 0, `${f}: 스크립트 ${blocks.length}블록 문법${bad ? ` — 오류 ${bad}` : ''}`);
  // 비밀값 휴리스틱: 서비스 키 JWT · sbp_ · github_pat · xoxb · sk-ant
  const leak = /(service_role|sb_secret_[A-Za-z0-9_]{8,}|sbp_[a-f0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xoxb-[0-9A-Za-z-]{10,}|sk-ant-[A-Za-z0-9_-]{20,})/.exec(src);
  say(!leak, `${f}: 비밀값 패턴 없음${leak ? ` — «${leak[1].slice(0, 24)}…»` : ''}`);
}
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
// ④ 아키텍처 2단계(㊿+136) → ES 모듈(㊿+153): 버전은 <meta name="app-ver">, 코드 목록은 <meta name="app-js">. 시작점은 <script type="module" src="js/main.js?v="> 하나 ·
//   각 모듈 주소의 ?v= 는 <script type="importmap"> (tests/stamp.mjs 가 만들고 CSP 에 그 sha256) · 인라인 스크립트는 그 importmap 하나뿐 → script-src 에 'unsafe-inline' 없음
const ver = /<meta name="app-ver" content="(\d{4}-\d{2}-\d{2} ㊿\+\d+)">/.exec(html);
say(!!ver, `APP_VER 형식(meta app-ver) ${ver ? ver[1] : '(없음)'}`);
const jsMeta = /<meta name="app-js" content="([^"]+)">/.exec(html); const JS_LIST = jsMeta ? jsMeta[1].split(',').map((x) => x.trim()) : [];
say(JS_LIST.length >= 10 && JS_LIST[JS_LIST.length - 1] === 'js/main.js' && JS_LIST.includes('js/init.js') && JS_LIST[0] === 'js/state.js', `app-js 목록 ${JS_LIST.length}개 · 처음 js/state.js · init.js 있음 · 마지막 js/main.js(시작점)`);
{ const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
  const mains = scripts.filter((t) => /type="module"/.test(t));
  say(mains.length === 1 && /src="js\/main\.js\?v=[^"]+"/.test(mains[0]) && scripts.every((t) => /type="(module|importmap)"/.test(t)), 'index.html 이 js/main.js(모듈) 하나만 부름 · 고전 <script src> 없음(boot.js·load.js 안 씀)');
  const maps = [...html.matchAll(/<script type="importmap">([\s\S]*?)<\/script>/g)];
  let mapOk = maps.length === 1; try { const j = JSON.parse(maps[0][1]); mapOk = mapOk && JS_LIST.filter((f) => f !== 'js/main.js').every((f) => j.imports['./' + f] === './' + f + '?v=' + encodeURIComponent(ver ? ver[1] : '')); } catch (e) { mapOk = false; }
  say(mapOk, 'importmap: app-js 의 모든 모듈 → ?v=<app-ver> (새 버전이면 새 주소)');
  say(scripts.length === maps.length + mains.length, 'index.html 에 인라인 <script> 는 importmap 하나뿐'); }
try { const { stampOf, applyStamp } = await import('./stamp.mjs');
  const st = stampOf(html, (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return null; } });
  say(applyStamp(html, st) === html, 'stamp 최신 — app.css·importmap·modulepreload·main.js 의 ?v= 와 CSP 해시가 지금 app-ver · app-js 와 같음 (다르면 node tests/stamp.mjs)');
  say(st.lazy.length >= 3, '처음 열 때 불러오는 모듈 ' + st.lazy.length + '개 (' + st.lazy.join(', ') + ') · 처음부터 ' + st.eager.length + '개'); }
catch (e) { say(false, 'tests/stamp.mjs 를 못 씀 — ' + String(e.message || e).slice(0, 120)); }
say(!/ on[a-z]+="/.test(html), 'index.html 에 인라인 on* 핸들러 없음');
const cspIdx = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
say(!!cspIdx && !/script-src[^;]*'unsafe-inline'/.test(cspIdx[1]), "index.html CSP script-src 에 'unsafe-inline' 없음");
const JS_FILES = JS_LIST.slice();
let jsAll = '';
for (const f of JS_FILES) {
  const p = path.join(ROOT, f); say(fs.existsSync(p), `${f} 존재`);
  if (!fs.existsSync(p)) continue;
  const q = path.join(tmp, path.basename(f).replace(/\.js$/, '.mjs')); fs.copyFileSync(p, q);   /* .mjs = ES 모듈로 문법 검사 */
  const r = spawnSync(process.execPath, ['--check', q], { encoding: 'utf8' }); say(r.status === 0, `${f}: 문법(모듈)${r.status ? ' — ' + r.stderr.split('\n').slice(0, 2).join(' | ') : ''}`);
  const src = fs.readFileSync(p, 'utf8'); jsAll += '\n' + src;
  const leak = /(service_role|sb_secret_[A-Za-z0-9_]{8,}|sbp_[a-f0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xoxb-[0-9A-Za-z-]{10,}|sk-ant-[A-Za-z0-9_-]{20,})/.exec(src); if (leak) say(false, `${f}: 비밀값 패턴 — «${leak[1].slice(0, 20)}…»`);
}
say(fs.existsSync(path.join(ROOT, 'app.css')), 'app.css 존재');
{ const stSrc = fs.existsSync(path.join(ROOT, 'js/state.js')) ? fs.readFileSync(path.join(ROOT, 'js/state.js'), 'utf8') : '';
  say(/^export var APP_VER=/m.test(stSrc) && (jsAll.match(/^\s*(?:export )?var APP_VER=/gm) || []).length === 1, 'APP_VER 정의는 js/state.js 한 곳뿐(meta app-ver 를 읽음)'); }
// 선언 파일에는 즉시 실행 문장이 없어야 함(= init.js start() 로만) — 간단 휴리스틱(정확한 검사는 tests/lint.mjs): 파일 맨 왼쪽에서 시작하는 줄이 import/export/function/var/주석/닫는 괄호가 아니면 실패
for (const f of JS_LIST) { if (/js\/(init|viz|main)\.js$/.test(f) || !fs.existsSync(path.join(ROOT, f))) continue; const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n'); const bad = lines.filter((l) => /^[A-Za-z$_(\[]/.test(l) && !/^(?:export\s+)?(function|async function|var|let|const)\b|^import\b/.test(l)); if (bad.length) say(false, `${f}: 즉시 실행으로 보이는 최상위 줄 ${bad.length} — ${bad[0].slice(0, 60)}`); }
// sw.js 의 SHELL 이 코드 파일을 전부 품는지
const sw = fs.existsSync(path.join(ROOT, 'sw.js')) ? fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8') : '';
say(JS_FILES.every((f) => sw.includes("'./" + f + "'")), 'sw.js SHELL 에 코드 파일 전부 포함');
// 중복 최상위 선언(모듈은 이름이 겹치면 window.SVC 에서 하나가 가려짐 — 정확한 검사는 lint) 검사
{ const seen = new Map(), dup = []; for (const f of JS_LIST) { if (!fs.existsSync(path.join(ROOT, f))) continue; const src = fs.readFileSync(path.join(ROOT, f), 'utf8'); for (const m of src.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) { if (seen.has(m[1])) dup.push(m[1] + '(' + seen.get(m[1]) + '·' + f + ')'); seen.set(m[1], f); } } say(!dup.length, `최상위 함수 이름 중복 없음${dup.length ? ' — ' + dup.slice(0, 5).join(', ') : ''}`); }
// ㊿+154 위성 페이지(quote·report·s1·kk): 코드는 sat/*.js 파일 · 인라인 <script>·on* 핸들러 없음 → CSP script-src 에 'unsafe-inline' 없음 · ?v= 꼬리표가 지금 버전
try { const { SAT_PAGES, stampSat } = await import('./stamp.mjs'); const satFiles = new Set();
  for (const f of SAT_PAGES) { const p = path.join(ROOT, f); if (!fs.existsSync(p)) continue; const h = fs.readFileSync(p, 'utf8'), h2 = h.replace(/<!--[\s\S]*?-->/g, '');
    say(!/<script(?![^>]*\bsrc=)[^>]*>/.test(h2) && !/\son(click|change|input|error|load|submit|key\w+|blur|focus|mouse\w+)=["']/i.test(h2), f + ': 인라인 <script> · on* 핸들러 없음 (data-click 등 → sat/common.js)');
    const css = [...h.matchAll(/<link rel="stylesheet" href="(sat\/[\w-]+\.css)\?v=[^"]*">/g)].map((m) => m[1]);
    say(!/<style[\s>]/i.test(h2) && css.length >= 1 && css.every((c) => fs.existsSync(path.join(ROOT, c))), f + ': 스타일은 ' + css.join('·') + ' (페이지 안 <style> 없음)');
    const c = (/http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(h) || [, ''])[1]; say(/script-src 'self'/.test(c) && !/script-src[^;]*'unsafe-(inline|eval)'/.test(c), f + ": CSP script-src 에 'unsafe-inline'·'unsafe-eval' 없음");
    const srcs = [...h.matchAll(/<script src="([^"?]+)(\?v=[^"]*)?"><\/script>/g)];
    say(srcs.length >= 2 && srcs[0][1] === 'sat/common.js' && srcs.every((m) => /^sat\/[\w-]+\.js$/.test(m[1]) && fs.existsSync(path.join(ROOT, m[1]))), f + ': sat/common.js 먼저 · 스크립트 ' + srcs.map((m) => m[1].replace('sat/', '')).join('·'));
    say(stampSat(h, ver ? ver[1] : '') === h, f + ': sat/*.js 의 ?v= 가 지금 버전(app-ver) — 다르면 node tests/stamp.mjs');
    srcs.forEach((m) => satFiles.add(m[1])); }
  for (const f of [...satFiles].sort()) { const p = path.join(ROOT, f), src = fs.readFileSync(p, 'utf8'); const q = path.join(tmp, path.basename(f).replace(/\.js$/, '.cjs')); fs.copyFileSync(p, q);
    const r = spawnSync(process.execPath, ['--check', q], { encoding: 'utf8' }); say(r.status === 0, `${f}: 문법(고전 스크립트)${r.status ? ' — ' + r.stderr.split('\n').slice(0, 2).join(' | ') : ''}`);
    const leak = /(service_role|sb_secret_[A-Za-z0-9_]{8,}|sbp_[a-f0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xoxb-[0-9A-Za-z-]{10,}|sk-ant-[A-Za-z0-9_-]{20,})/.exec(src); if (leak) say(false, `${f}: 비밀값 패턴`);
    say(!/\bon(click|change|input|error)=\\?["']/.test(src), f + ': 만드는 HTML 에도 인라인 on* 없음'); }
  { const o = fs.existsSync(path.join(ROOT, 'orders.html')) ? fs.readFileSync(path.join(ROOT, 'orders.html'), 'utf8') : ''; if (o) say(!/<script/i.test(o) && /http-equiv="refresh" content="0; url=index\.html\?v=ordernew"/.test(o), 'orders.html(옛 발주 화면): 스크립트 없이 포탈 «임대 장비 신청»으로 넘김'); } }
catch (e) { say(false, '위성 페이지 검사 실패 — ' + String(e.message || e).slice(0, 160)); }
// ㊿+155 «화면 만드는 방식 개선» · «이름표»: tpl``/rawHtml/esc 는 core.js 한 곳 · 타입 검사 파일(typecheck.mjs — 선언도 그 안에: 승격이 .ts 를 안 옮김) · package.json 에 typescript
{ const core = fs.existsSync(path.join(ROOT, 'js', 'core.js')) ? fs.readFileSync(path.join(ROOT, 'js', 'core.js'), 'utf8') : '';
  say(/^export function tpl\(strs, \.\.\.vals\)/m.test(core) && /^export function rawHtml\(/m.test(core) && /^export function esc\(/m.test(core) && (jsAll.match(/^export function esc\(/gm) || []).length === 1, 'tpl``·rawHtml·esc 는 js/core.js 에 하나씩');
  const pk = fs.existsSync(path.join(ROOT, 'package.json')) ? fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8') : '';
  say(/"typescript":/.test(pk) && fs.existsSync(path.join(ROOT, 'tests', 'typecheck.mjs')) && /export const DECLS = \{[\s\S]*declare var XLSX[\s\S]*interface EventTarget/.test(fs.readFileSync(path.join(ROOT, 'tests', 'typecheck.mjs'), 'utf8')), '타입 검사 준비: package.json typescript · tests/typecheck.mjs · 선언 DECLS (실행은 tests/lint.mjs)');
  say(/@typedef \{Object\} AppState/.test(jsAll) && /@type \{AppState\} \*\/\s*\nexport var ST=/.test(jsAll) && /@typedef \{Object\} PortalRow/.test(jsAll) && /@typedef \{Object\} GridDef/.test(jsAll), '이름표: ST(AppState) · 데이터 행(PortalRow) · 표 정의(GridDef) 에 JSDoc 모양'); }
// ㊿+156 펼친 목록·결과 닫기: core.js closeBtn(.x-close) · 배포·운영 opsClose 가 버튼마다 처리 · 장비 진단 · 위성 창 Esc/바깥 클릭은 sat/common.js
{ const css = fs.readFileSync(path.join(ROOT, 'app.css'), 'utf8'); const keys = ['files', 'ghList', 'hist', 'repo', 'seal', 'sqlRes', 'health', 'errs', 'aic'];
  say(/^export function closeBtn\(/m.test(jsAll) && /\.x-close\{/.test(css) && /export function opsClose\(k\)/.test(jsAll) && keys.every((k) => jsAll.includes("'data-ops-close':'" + k + "'") && jsAll.includes("k==='" + k + "'")) && /id:'eqDiagClose'/.test(jsAll), '닫기 버튼: closeBtn · .x-close · 배포·운영 ' + keys.length + '곳(opsClose) · 장비 진단');
  const sc = fs.existsSync(path.join(ROOT, 'sat', 'common.js')) ? fs.readFileSync(path.join(ROOT, 'sat', 'common.js'), 'utf8') : '';
  say(/Escape/.test(sc) && /contains\('ovl'\)/.test(sc), '위성 페이지 창: Esc · 바깥 클릭으로 닫기(sat/common.js 한 곳)'); }
// ㊿+157 금액 입력 = 천원 (화면 표시와 같은 단위 · 저장은 원) · 이상 금액 확인 · 계약 표 ✎ → 월 매출 맞춤 · 단위 실수 점검 규칙
{ const lbl = ['nMrr', 'aMrr', 'rMrr', 'fMrr', 'nFee', 'oiAmt'].filter((id) => !new RegExp('<label for="' + id + '">[^<]*천원').test(html));
  say(!lbl.length, '금액 입력칸 라벨이 «천원» (입력·수정 4칸 · 설치비 · OI 예상단가)' + (lbl.length ? ' — 아님: ' + lbl.join(', ') : ''));
  say(/^export function kwToWon\(/m.test(jsAll) && /^export function amtGuard\(/m.test(jsAll) && /^export function amtHint\(/m.test(jsAll) && /v=kwToWon\(inp\.value\)/.test(jsAll) && /wonToKw\(v\)/.test(jsAll), '천원 ↔ 원 변환(kwToWon·wonToKw) · 이상 금액 확인(amtGuard) · 칸 아래 환산(amtHint) · 표 ✎ 칸도 천원');
  say(!/<b>원 단위로|(?<!천)원 단위로 입력|placeholder="원 단위"/.test(jsAll + html), '«원 단위로 입력» 안내가 남아 있지 않음');
  say(/export function ctRevPlan\(c, body, opt\)/.test(jsAll) && /revPlan=\(g\.table==='contracts'\)\? ctRevPlan\(r, body\)/.test(jsAll) && /rule\('c_amt_odd','crit'/.test(jsAll), '계약 표 ✎ → 월 매출 맞춤(ctRevPlan) · 데이터 점검 «금액 단위 실수 의심»');
  say(/await syncOrderAssets\(out\[0\], null, true\)/.test(jsAll), '장비 신청 접수 → 현황 바로 반영');
  say(fs.existsSync(path.join(ROOT, 'tests', 'fakedb.mjs')), '가짜 DB(tests/fakedb.mjs) — 입력·수정 점검용');
  /* 스테이징 QA «데이터 입력·수정»: ?qa=data → 가짜 DB(js/qadb.js) · 시작 전에 끼움(main.js) · Supabase 요청은 전부 가로챔 · QA 가 이 단계를 부름 */
  const mainJs = fs.existsSync(path.join(ROOT, 'js', 'main.js')) ? fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8') : '';
  say(/export var IS_QA_DATA=/.test(jsAll) && /if\(m_state\.IS_QA_DATA\) m_qadata\.qaDataInstall\(\);\s*\n[^\n]*\n?m_init\.start\(\);|if\(m_state\.IS_QA_DATA\) m_qadata\.qaDataInstall\(\);[^\n]*\nm_init\.start\(\);/.test(mainJs) && /u\.indexOf\(SB_URL\)===0\) return Promise\.resolve\(qaRespond/.test(jsAll) && /await qaDataPhase\(run\);/.test(jsAll) && /export function qaDataList\(/.test(jsAll), 'QA «데이터 입력·수정»: ?qa=data 가짜 DB 를 시작 전에 끼움 · Supabase 요청 가로채기 · QA 가 이 단계 실행'); }
// ㊿+159 재약정(연장) — 원계약 한 줄 «연장 n회» 유지 · 노드수 · 같이 끝나는 추가 계약 합치기 · 마지막 연장 되돌리기 · 겹치는 재약정 행 확인 · 점검 규칙 2개 · AI 답변 닫기
{ say(/^export function renewMates\(r\)/m.test(jsAll) && /^export function renewUndoPlan\(r\)/m.test(jsAll) && /^export async function doUndoRenew\(r, plan\)/m.test(jsAll) && /^export async function doRenew\(r, ne, amt, note, opt\)/m.test(jsAll) && /prev_rev/.test(jsAll) && /prev_qty/.test(jsAll), '연장: 노드수·합치기(renewMates) · 이력에 이전 값(prev_qty·prev_rev) · 마지막 연장 되돌리기(renewUndoPlan·doUndoRenew)');
  say(/rule\('c_renew_dup','warn'/.test(jsAll) && /rule\('c_renew_overlap','warn'/.test(jsAll), '데이터 점검: «연장이 짧은 사이에 두 번» · «연장한 계약과 겹치는 재약정 행»');
  say(['rQty', 'rMates', 'rPrev', 'rUndo'].every((id) => html.includes('id="' + id + '"')) && /renewOpts\(r2, 'r', \$\('#tabRenew'\)\)/.test(jsAll) && /newOverlap\(cust, \$\('#nLine'\)\.value/.test(jsAll), '입력·수정: 갱신 탭 노드수·합치기·미리보기·되돌리기 · 신규 등록 기간 겹침 확인');
  say(html.includes('id="aiPanel"') && html.includes('id="aipClose"') && html.includes('id="aipNew"') && html.includes('id="aipDel"') && /^export function aipClose\(/m.test(jsAll) && !/if\(ST\.CUR_VIEW==='dash' && v!=='dash'\)\{ try\{ closeAnswer\(\); \}/.test(jsAll), 'AI 답변(㊿+172): 오른쪽 AI 패널 — 패널 닫기 · 새 대화 · 대화 삭제 구분 · 다른 화면으로 가도 대화 유지'); }
say(/^export var OPS_PKG_RE=/m.test(jsAll) && /OPS_PKG_RE\.test\(rel\)/.test(jsAll), '배포·운영(㊿+160): 묶음 폴더(1_github/ · 2_repo/) 이름 자동으로 뗌 · 저장소 점검이 이름 붙은 채 올라간 파일을 잡음');
say(/^export function c360RenewLine\(r\)/m.test(jsAll) && /'기간','연장','MRR\(천원\)'/.test(jsAll), '고객 360(㊿+161): 계약 표 «연장» 칸 + 연장한 계약 아래 회차별 기간·월 금액·노드');
say(/if\(memo\) ent\.prev_note=note0;/.test(jsAll) && /noteCur\.lastIndexOf\(noteMm\)/.test(jsAll) && /data-c360ct/.test(jsAll), '연장 메모 → 비고(㊿+162 · 되돌리면 그 메모만 뺌) · 고객 360 계약 행 → 계약 상세');
say(/^export function renewCtype\(r\)/m.test(jsAll) && /contract_type:renewCtype\(r\)/.test(jsAll) && /prev_ctype:/.test(jsAll) && /^export function ctOrig\(r\)/m.test(jsAll), '연장하면 구분도 «재약정»(㊿+163 · 처음 구분은 prev_ctype · 되돌리면 원래대로)');
say(/^export async function apiCreate\(\)/m.test(jsAll) && /rpc\/api_key_create/.test(jsAll) && html.includes('data-pane="api"') && html.includes('id="apiBox"'), '관리자 › 외부 연동 API 키(㊿+164 · 발급·폐기·호출 기록 · SQL 102 · 함수 export)');
{ const css = fs.readFileSync(path.join(ROOT, 'app.css'), 'utf8');
  say(/<symbol id="gnLogo"/.test(html) && /<symbol id="gnMark"/.test(html) && /id="viewLogin" class="hidden lg"/.test(html) && /id="lgDate"/.test(html) && /id="gnTitle"/.test(html) && /data-skin="gn"/.test(html)
    && /export var LOOKS=\{gn:/.test(jsAll) && /export function isGN\(/.test(jsAll) && /export function buildGnNav\(/.test(jsAll) && /export function gnMenuOpen\(/.test(jsAll) && /class="gn-trk"/.test(jsAll) && /class="ib-lanes"/.test(jsAll) && /id="gnBizH"|hb\.id='gnBizH'/.test(jsAll)
    && /html\[data-skin="gn"\] #rail \.gn-tb\{/.test(css) && /html\[data-skin="gn"\] \.ib-lanes\{/.test(css) && /\.lg-stage\{/.test(css) && !/html:not\(\[data-look="classic"\]\) #viewLogin \.card/.test(css) && !/lg-sub/.test(html), '새 디자인 «지니언스»(㊿+166~167 · 기본 · 정식 로고 심볼 · 상단 메뉴 + 펼침 메뉴 · 오늘 처리할 일 3칸 · 사업 현황 · 타원 목표 트랙 · 새 로그인 화면)'); }
say(/^export function expScan\(/m.test(jsAll) && /^export function expNote\(/m.test(jsAll) && /^export function ctSuccessor\(/m.test(jsAll) && /^export function chvModeBar\(/m.test(jsAll) && /^export function c360Equip\(/m.test(jsAll) && /^export function unitSync\(/m.test(jsAll) && /^export function openTerms\(/m.test(jsAll) && /biz-tg/.test(jsAll) && (jsAll.match(/expScan\(/g) || []).length >= 4, '1차 업무 UX(㊿+168 · 만료 공통 집계 expScan · 사업 영역 기준월 보기 · 고객 360 후속 계약·장비 4구분 · 정산 미입력/잠정 · 화면별 단위·용어)');
say(/^export var WORKV=/m.test(jsAll) && /^export function hidCur\(/m.test(jsAll) && /^export var DVMEM=/m.test(jsAll) && /^export function gridGoPre\(/m.test(jsAll) && /^export function rowMenu\(/m.test(jsAll) && /^export function gnSumRender\(/m.test(jsAll) && /^export function eqSnDetail\(/m.test(jsAll) && /^export function eqRetSum\(/m.test(jsAll) && /^export async function eqRetUndo\(/m.test(jsAll) && /^export function uiIconize\(/m.test(jsAll) && /pin:\['_custName','status'\]/.test(jsAll) && !/eqbar-save/.test(jsAll), '2차 업무 UX(㊿+169 · 표 업무 보기·고정 열·상태 배지·더보기 · 목록 상태 기억 · 홈 요약·할 일 대상/담당/기한/영향 · 장비 시리얼 상세·회수 미리 보기·되돌리기 · 아이콘 통일)');
say(/^export var WZ_DEF=/m.test(jsAll) && /^export function wzCheck\(/m.test(jsAll) && /^export function wzDup\(/m.test(jsAll) && /^export function openNewMenu\(/m.test(jsAll) && /^export function qvDefs\(/m.test(jsAll) && /^export function oiOpen\(/m.test(jsAll) && /^export function crApplied\(/m.test(jsAll) && /^export var DC_IMPACT=/m.test(jsAll) && /^export function previewDlg\(/m.test(jsAll) && /^export function qbAdvHtml\(/m.test(jsAll) && /_expRoot/.test(jsAll) && html.includes('id="btnNew"') && !/data-qbmode="ui" aria-pressed/.test(jsAll), '3차 업무 UX(㊿+170 · 입력 단계·즉시 확인·중복 의심·확인 단계 · ＋등록 · 영업/인바운드 빠른 보기·기준 · OI 진행 공통 기준 · 리포트 템플릿·SQL 고급 분석 · 해지율 적용 기준 · 데이터 점검 영향/대상/해결 · 일괄 수정 미리 보기)');
say(/^export function homeSetup\(/m.test(jsAll) && /^export function srchHits\(/m.test(jsAll) && /^export function looksQuestion\(/m.test(jsAll) && /^export function localIntent\(/m.test(jsAll) && /^export function renewNeedScan\(/m.test(jsAll) && /^export function homeRender\(/m.test(jsAll) && /^export function srchCtx\(/m.test(jsAll) && /^export function homeB\(/m.test(jsAll) && /^export function myOwner\(/m.test(jsAll) && /^export function viewResetHard\(/m.test(jsAll) && /^export function custGo\(/m.test(jsAll) && /^export function turnSnap\(/m.test(jsAll) && html.includes('id="ansThread"') && html.includes('id="fkCtx"') && html.includes('id="omUser"') && /#viewDash:not\(\.hm-detail\)/.test(fs.readFileSync(path.join(ROOT, 'app.css'), 'utf8')) && /retL=orders\.filter\(EQB_ONLY\.ret\[1\]\)/.test(jsAll) && /r\.id==='c_lapsed'/.test(jsAll) && !/biz-ok">확정/.test(jsAll) && /^export function qbPicked\(/m.test(jsAll) && /NAV\.reset==='quote'/.test(jsAll) && /svcFind/.test(fs.readFileSync(path.join(ROOT, 'sat', 'common.js'), 'utf8')) && /role="listbox" id="\$\{box\.id\}_lb"/.test(jsAll), '㊿+171~172 홈 업무 공간: 검색(결과 먼저 · AI 는 따로) · 핵심 현황(전체 사업 · 이번 달 고정) · 바로가기 · 매출 추이 + 우선 업무(내 업무/팀) · 최근 · 상세 펼침 · AI 패널(원래 답 보존) · 메뉴 재진입 상태 유지 · 초기화 · 고객 문맥 · 담당자 연결(SQL 103) · 비즈포탈 «입력 완료» · 리포트 템플릿 먼저 · 견적 쓰던 내용 유지(위성 화면 Ctrl+K)');
say(fs.existsSync(path.join(ROOT, 'supabase/functions/export/index.ts')) && fs.existsSync(path.join(ROOT, 'tests/fn/export.test.ts')), 'export 함수 소스 · 테스트 있음');
// ㊿+173 성능 — 계산 사본 · CSS 변수 사본 · 숨은 상세 미룸 · 목록/보드 먼저 일부 · 데이터 동시 요청 · 실사용 속도 기록
say(/^export function tickMemo\(/m.test(jsAll) && /^export function cssvKey\(/m.test(jsAll) && /tickMemo\('eqOwn'/.test(jsAll) && /tickMemo\('ctByStart'/.test(jsAll) && /tickMemo\('crPool'/.test(jsAll) && /^export function dashDetailShown\(/m.test(jsAll) && /^export function gridLayoutLater\(/m.test(jsAll) && /GRID_GEN/.test(jsAll) && /^export function eqbBind\(/m.test(jsAll) && /^export function prefetchData\(/m.test(jsAll) && /^export function perfRec\(/m.test(jsAll) && /rest\/v1\/client_perf/.test(jsAll) && /afterLayout: afterLayout/.test(jsAll), '㊿+173 성능: tickMemo(장비 주인 · 후속 계약 · 해지율 대상) · CSS 변수 사본 · 접힌 상세 그리기 미룸 · 표 폭 읽기는 배치 뒤 · 목록 30행 먼저 · 보드 8장 먼저(위임 동작) · 데이터 동시 요청 · client_perf');
// ㊿+174 알림함 · 처리 담당 · Slack(기본 꺼짐 · 눌러서 확인할 때만) — 자동 발송 경로가 생기지 않게
{ const nt = fs.existsSync(path.join(ROOT, 'js', 'notify.js')) ? fs.readFileSync(path.join(ROOT, 'js', 'notify.js'), 'utf8') : '';
  const fnP = path.join(ROOT, 'supabase', 'functions', 'notify', 'index.ts'), fnS = fs.existsSync(fnP) ? fs.readFileSync(fnP, 'utf8') : null;
  say(/^export var NTF_DEF=\{[^\n]*slack_on:false/m.test(nt) && (nt.match(/ntfCall\(/g) || []).length === 2 && /if\(!confirm\('Slack 으로 보냅니다[^\n]*\n[\s\S]{0,300}?await ntfCall\(/.test(nt) && !/setInterval/.test(nt) && !/sbWrite\([^)]*equipment_orders/.test(nt)
    && /^export function ntfItems\(/m.test(nt) && /tickMemo\('ntfItems'/.test(nt) && /expEligible\(r\)/.test(nt) && /'work_assign\?on_conflict=kind,ref'/.test(nt) && html.includes('id="ntfAdmin"')
    && (fnS === null || (/set\.slack_on !== true/.test(fnS) && /자동 발송은 받지 않습니다/.test(fnS) && /rpc\/is_super_admin/.test(fnS) && /team_channel\)/.test(fnS) && !/Deno\.cron/.test(fnS))),
  '㊿+174 알림함: Slack 기본 꺼짐 · 보내기는 미리 보기 → 확인 뒤 한 곳(ntfCall) · 타이머 발송 없음 · notify 함수는 사용자(슈퍼 관리자)만 · 서비스 키 거절 · slack_on 다시 확인 · 처리 담당은 work_assign(신청서 안 바꿈)'); }
// ㊿+175 운영 · 안정성 — 옛 탭 막기(저장 경로에 버전 확인) · 동시 수정 대조 · 저장 0행 확인 · 운영 상태 · 운영 되돌리기
{ const gd = fs.existsSync(path.join(ROOT, 'js', 'guard.js')) ? fs.readFileSync(path.join(ROOT, 'js', 'guard.js'), 'utf8') : '';
  const opsP = path.join(ROOT, 'supabase', 'functions', 'ops', 'index.ts'), opsS = fs.existsSync(opsP) ? fs.readFileSync(opsP, 'utf8') : null;
  say(/^export async function verBeforeWrite\(/m.test(gd) && /^export async function rowGuard\(/m.test(gd) && /cache:'no-store'/.test(gd) && /await verBeforeWrite\(method, path\);/.test(jsAll) && /rowGuard\(g\.table, r, body, g\.cols\)/.test(jsAll)
    && /'return=representation'\)\.then\(function\(res\)\{ if\(!savedRows\(res\)\)/.test(jsAll) && /^\s*verStart\(\);/m.test(jsAll) && /^export function opsItems\(/m.test(jsAll) && /rpc\/ops_status/.test(jsAll) && /^export function opsRbBind\(/m.test(jsAll)
    && (opsS === null || (/case 'gh_rollback'/.test(opsS) && /expect_head/.test(opsS) && /KEEP = \/\^\(staging\|supabase\|node_modules\|\\\.github\)\\\//.test(opsS))),
  '㊿+175 안정성: 저장 전 버전 확인(옛 탭 막음) · 표 저장 전 DB 대조(동시 수정) · 0행이면 «저장 안 됨» · 운영 상태(ops_status) · 운영 되돌리기(gh_rollback · staging/supabase/.github 제외 · 미리 본 HEAD)'); }
// ㊿+176 정산(A-1) — 비즈포탈 차액 연도(지우기가 다른 해를 지우지 않게) · 월 마감(period_locks) · 수정 이력(doc_hist) · 리포트 발행 잠금
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const cl = rd('sat/close.js'), sats = { s1: pageCode('s1.html'), kk: pageCode('kk.html'), rp: pageCode('report.html') };
  const rawDel = (jsAll.match(/sbWrite\('DELETE','biz_recon\?ym=eq\./g) || []).length;
  say(/^export function bizKey\(/m.test(jsAll) && /^export function bizHas\(/m.test(jsAll) && /'rpc\/biz_month_replace'/.test(jsAll) && /'rpc\/biz_month_delete'/.test(jsAll) && /'rpc\/period_unlock'/.test(jsAll) && /doc_hist\?select=/.test(jsAll)
    && rawDel === 2 && !/r\.ym===curYm/.test(jsAll) && (jsAll.match(/bizHas\(/g) || []).length >= 4
    && /^function clsBlockMsg\(/m.test(cl) && /rpc\/period_unlock/.test(cl) && /rpc\/report_reopen/.test(cl)
    && /clsInit\('s1',\s*'s1_settle'/.test(sats.s1) && /clsInit\('kk',\s*'kk_settle'/.test(sats.kk) && /clsInit\(null,\s*'project_reports'/.test(sats.rp) && /function rpStateSync\(/.test(sats.rp),
  `㊿+176 정산: 비즈포탈 차액 «연도-월» 열쇠(bizKey · bizHas) · 저장 · 삭제는 biz_month_replace/delete(SQL 107 전 대비 옛 방식 2곳만 · 지금 ${rawDel}) · 월 마감 · 마감 풀기(사유) · 이력 · 에스원 · 카카오 · 리포트(발행 잠금 · 발행 취소)`); }
// ㊿+177 Slack 예약 발송(기본 꺼짐 · DB 예약 + 일회용 번호 · 보낼 글은 포탈 계산) · 견적을 포탈 DB 에(quotes · 번호 · 발송 뒤 잠금 · OI 연결)
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const nt = rd('js/notify.js'), fnS = rd('supabase/functions/notify/index.ts'), qd = rd('sat/qdb.js'), qj = rd('sat/quote.js'), qh = rd('quote.html');
  say(/^export var NTF_DEF=\{[^\n]*auto_on:false/m.test(nt) && /^export async function ntfSnapSave\(/m.test(nt) && /IS_STAGING \|\| !ntfAutoOk\(\) \|\| !S\.slack_on \|\| !S\.auto_on/.test(nt) && !/setInterval/.test(nt)
    && (!fnS || (/async function autoRun\(nonce/.test(fnS) && /&used_at=is\.null&created_at=gt\./.test(fnS) && /set\.slack_on !== true \|\| set\.auto_on !== true/.test(fnS) && /MAX_AGE_H/.test(fnS) && !/Deno\.cron/.test(fnS)))
    && /^async function qdbBeforePrint\(/m.test(qd) && /if \(\(await qdbBeforePrint\(\)\) === false\) return;/.test(qj) && /<script src="sat\/qdb\.js[^"]*"><\/script>/.test(qh) && /id="quoteNoRow"/.test(qh)
    && /^export function quoteOpen\(/m.test(jsAll) && /quotes:\{[^\n]*\n\s*title:'견적 목록', table:'quotes'/.test(jsAll) && html.includes('data-v="quotes"'),
  '㊿+177 Slack 예약 발송(기본 꺼짐 · 서버는 DB 예약 · 일회용 번호 · 꺼짐/오래된 글이면 안 보냄 · 보낼 글은 포탈 계산 · 스테이징은 안 씀) · 견적 DB(저장 · 발행 때 저장+발송 · 견적 번호 표시 · 견적 목록 · OI 에서 열기)'); }
// ㊿+178 AI 품질 — 근거 표시 · 👎 신고 전체 · 지식 제안/반영 · 숫자 기준(이번 달 · 진행 중 OI) · 채점(건수 단위 · 금액 ±)
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const ai = rd('js/ai.js'), ac = rd('supabase/functions/aicheck/index.ts');
  say(/^export function aiSrcHtml\(/m.test(ai) && /var b=homeB\(\), all=/.test(ai) && /var open=o\.filter\(oiOpen\);/.test(ai) && !/고객명 마스킹/.test(ai) && /queries:aiQBrief\(/.test(ai)
    && /filter\(oiOpen\)/.test(rd('js/report.js')) && /^export function aiHasCount\(a, n\)\{\n/m.test(jsAll) && /^export function aiNear\(/m.test(jsAll) && /data-aiq="know"/.test(jsAll) && /data-ak="ok"/.test(jsAll)
    && (!ac || (/export function near\(/.test(ac) && /check: \(E, a\) => near\(a, E\.month_revenue, 0\.01\)/.test(ac) && !/t\.includes\(String\(v\)\)/.test(ac))),
  '㊿+178 AI: 답 근거(조회 · 행 수) · 👎 에 답 전체 · 조회 · 화면 조건 · 지식 제안 → 슈퍼 관리자 반영 · 이번 달 = homeB · 진행 중 OI = oiOpen(AI · 리포트) · 채점 = 단위 붙은 건수 · 금액 ±1% (포탈 15문 · aicheck v1.6)'); }
// ㊿+179 데이터(B-2): 내보내기 원 단위 · 수식 막기 · 붙여넣기 머리글 · 검사 · 중복 · 데이터 점검 정상 표시 · 추이 · 새 규칙 · 리포트 DB 저장 · 팀 공유
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const gr = rd('js/grid.js'), tl = rd('js/tools.js'), an = rd('js/analysis.js'), rp = rd('js/report.js'), nt = rd('js/notify.js');
  say(/^export function xlsxSafe\(v\)/m.test(gr) && /^export function xlsxHead\(c\)/m.test(gr) && /^export function pasteParse\(text, cols\)/m.test(tl) && /^export function pasteDups\(rows, cols, existing\)/m.test(tl) && /if\(P\.errs\.length\)\{/.test(tl)
    && /^export function bzxNum\(v\)/m.test(an) && /^export function dcAckKey\(it\)/m.test(an) && /DC_NOACK=\{c_nocust:1, c_parent:1, c_dates:1, c_lapsed:1, eq_serial_dup:1, c_renew_sync:1\}/.test(an) && /if\(IS_STAGING \|\| IS_QA \|\| DCD\.ok===false/.test(an)
    && /rule\('cu_similar'/.test(an) && /rule\('oi_dup'/.test(an) && /rule\('q_stale'/.test(an) && /rule\('cu_sector'/.test(an) && /dcAckLoad\(\)\.then/.test(nt)
    && /^export async function rqLoad\(force\)/m.test(rp) && /^export function qbMissing\(spec\)/m.test(rp) && /data-qshare=/.test(rp),
  '㊿+179 데이터: 엑셀 · CSV 원 단위 · 수식 막기(xlsxSafe) · 붙여넣기 머리글 · 검사 · 중복(pasteParse · pasteDups) · 비즈포탈 숫자(bzxNum) · 데이터 점검 정상 표시(구조 문제는 불가) · 추이(스테이징 안 씀) · 새 규칙 4 · 리포트 DB 저장 · 팀 공유 · 없어진 열 경고'); }
// ㊿+180 보안 · 계정: 서버 로그아웃 · 모든 기기 · 30일 재로그인 · 토큰 갱신이 «첫 비밀번호 변경»을 풀지 않음 · 비밀번호 규칙 · 연속 실패 대기 · 로그인 기록 · iframe 막기 · 보안 점검
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const co = rd('js/core.js'), sh = rd('js/shell.js'), ed = rd('js/edit.js'), ad = rd('js/admin.js'), it = rd('js/init.js'), sc = rd('sat/common.js');
  say(/^export function authLogout\(scope, tok\)/m.test(co) && /\/auth\/v1\/logout\?scope=/.test(co) && /^export async function logoutAll\(/m.test(co) && /^export function sessTooOld\(s\)/m.test(co) && /saveSess\(j,s\.u,sessPKeep\(j, s\)\)/.test(co) && /saveSess\(j, s\.u, sessPKeep\(j, s\)\)/.test(co) && !/saveSess\(j, ?s\.u, ?true\)/.test(co)
    && /^export function pwRule\(p, email, old\)/m.test(co) && /^export function lfFail\(email\)/m.test(co) && /var bad=pwRule\(p1/.test(sh) && /lfWait\(em\)/.test(sh) && /loginRecord\('password'\)/.test(sh) && /loginRecord\('password'\)/.test(ed) && /id="apPwCur"/.test(html)
    && /if\(!frameOk\(\)\)\{ frameBlock\(\); return; \}/.test(it) && /window\.top\.location\.origin===location\.origin/.test(sc) && /^export async function secRun\(/m.test(ad) && /^export function axResetPw\(em\)/m.test(ad) && !/prompt\(em\+' 의 새 비밀번호/.test(ad),
  '㊿+180 보안 · 계정: 서버 로그아웃 · 모든 기기 · 30일 재로그인 · 갱신이 첫 비밀번호 변경을 풀지 않음 · 비밀번호 10자 영문+숫자 · 지금 비밀번호 확인 · 연속 실패 대기 · 로그인 기록 · iframe 막기(포탈 · 위성) · 보안 점검 · 초기화 창'); }
// ㊿+181 화면 · 모바일: 폰 목록 카드(같은 표를 CSS 로 · 칸 이름 data-l · 주요 5칸 · 정렬/거르기 · 표로 보기) · 숫자/전화 키패드 · 터치 16px · 저장 줄 고정 · 필수 칸으로 · 빈 머리글 이름
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const gr = rd('js/grid.js'), ed = rd('js/edit.js'), css = rd('app.css');
  say(/^export function dvCardsOn\(\)/m.test(gr) && /^export function dvMainKeys\(g\)/m.test(gr) && /t\.classList\.toggle\('cards', DVC\.on\)/.test(gr) && /data-l="\$\{c\.l\}"/.test(gr) && /tr\.classList\.add\('editing'\)/.test(gr) && /<span class="sr">동작<\/span>/.test(gr)
    && /#dvTable\.cards thead\{display:none\}/.test(css) && /\{font-size:16px!important\}/.test(css) && /id="nMrr"[^>]*inputmode="decimal"/.test(html) && /id="odPhone"[^>]*type="tel"/.test(html) && /id="dvCardBar"/.test(html)
    && /^export function formFocusBad\(from\)/m.test(ed) && /if\(cls==='bad'\) try\{ formFocusBad\(e\); \}/.test(ed),
  '㊿+181 폰: 목록 카드(같은 표 · 칸 이름 · 주요 5칸 · 정렬/거르기 · 표로 보기) · 수정 중 표시(tr.editing) · 숫자/전화 키패드 · 터치 입력 16px · 필수 칸으로 이동 · 빈 머리글 이름'); }
// ㊿+160 연장하면 상태 «재약정»(구분 그대로) · 계약 상세에 «계약 기간 · 연장 이력»
say(/^export function renewStatus\(r\)/m.test(jsAll) && /var nst=renewStatus\(r\);/.test(jsAll) && /^export function ctPeriods\(c, mine\)/m.test(jsAll) && html.includes('id="dtRenew"'), '연장: 상태 «재약정»(renewStatus) · 계약 상세 연장 이력(ctPeriods · #dtRenew)');
const idx = html + jsAll;
// Supabase 함수 소스가 저장소에 있으면 비밀값 검사만 (deno 는 CI 에 없을 수 있음)
const fnDir = path.join(ROOT, 'supabase', 'functions');
if (fs.existsSync(fnDir)) for (const d of fs.readdirSync(fnDir)) { const p = path.join(fnDir, d, 'index.ts'); if (fs.existsSync(p)) { const s = fs.readFileSync(p, 'utf8'); const leak = /(sb_secret_[A-Za-z0-9_]{8,}|sbp_[a-f0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xoxb-[0-9A-Za-z-]{10,}|sk-ant-[A-Za-z0-9_-]{20,})/.exec(s); say(!leak, `functions/${d}: 비밀값 패턴 없음`); } }
// 테스트 fixture 에 실데이터가 섞이지 않았는지 — 고객명은 «가상고객NN» 만
const fix = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixture', 'load_all.json'), 'utf8'));
say((fix.customers || []).every((c) => /^가상고객\d+$/.test(c.name)), 'fixture 고객명이 전부 가상');
// 필수 파일
for (const f of ['manifest.webmanifest', 'sw.js']) say(fs.existsSync(path.join(ROOT, f)), `${f} 존재`);
// ② 보안: CSP meta · 외부 스크립트는 SRI 로더로만 · 해시 형식 · MFA 관문 · 직인 파일
for (const f of htmls) say(/<meta http-equiv="Content-Security-Policy"/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), `${f}: CSP meta 있음`);
say((idx.match(/createElement\('script'\)/g) || []).length === 1, 'index.html: 외부 스크립트 로더는 loadLib(SRI) 하나뿐');
const sris = [...idx.matchAll(/sri:'([^']+)'/g)].map((m) => m[1]);   // ㊿+147: alasql 은 격리 칸(js/sqlbox.js)으로 옮겨 4개
say(sris.length >= 4 && sris.every((h) => /^sha384-[A-Za-z0-9+/]{64}$/.test(h)), `index.html: SRI 해시 ${sris.length}개 형식 OK`);
for (const f of ['kk.html', 's1.html']) if (htmls.includes(f)) { const t = pageCode(f); say(/sc\.integrity=sri/.test(t) && /sha384-/.test(t), `${f}: 엑셀 로더에 integrity`); }
say((idx.match(/mfaGate\(/g) || []).length >= 4, 'index.html: MFA 관문(mfaGate) 이 로그인·세션 복원 경로에 연결됨');
// ③ 데이터 정합성 (㊿+137): 코드 목록 — 포탈 CODE_KIND 의 모든 종류가 *_OPTS 배열로 존재 · GRIDS 에 상태/채널/모델 리터럴 배열이 남아 있지 않음(한 목록을 봐야 함) · 코드 관리 UI 마크업
{
  const ck = /var CODE_KIND=\{([\s\S]*?)\};/.exec(jsAll); const kinds = ck ? [...ck[1].matchAll(/(\w+):'(\w+)'/g)] : [];
  say(kinds.length >= 12 && kinds.every((m) => new RegExp('^(?:export )?var ' + m[2] + '=\\[', 'm').test(jsAll)), `코드 목록: CODE_KIND ${kinds.length}종 모두 *_OPTS 배열 있음`);
  const init = fs.existsSync(path.join(ROOT, 'js/init.js')) ? fs.readFileSync(path.join(ROOT, 'js/init.js'), 'utf8') : '';
  say(!/opts:\['접수','출하요청'|opts:\['에스원','LGU\+'|opts:\['S1[0-9]|opts:\['S100'|chipsOpts:\['에스원'/.test(init), 'GRIDS: 장비 상태·채널·모델 목록은 리터럴이 아니라 ORD_STATUS_OPTS/ORD_CH_OPTS/MODEL_OPTS 참조');
  say(/id="cdTable"/.test(html) && /function cdLoad\(/.test(jsAll) && /function loadCodes\(/.test(jsAll) && /loadCodes\(\)/.test(jsAll.replace(/function loadCodes\(\)/, '')), '코드 관리 UI(#cdTable·cdLoad) · loadCodes 가 데이터 로드에 연결됨');
  say(/function dcMergeDlg\(/.test(jsAll) && /rpc\/merge_customers/.test(jsAll) && /function dcFillMrr\(/.test(jsAll), '데이터 점검: 고객사 병합(merge_customers)·mrr 채우기 동작 있음');
}
// ④ 아키텍처 (㊿+138): 함수 테스트가 저장소 안에 있고 CI 가 돌림 · README
/* 개발용 파일(tests/fn · supabase/functions · README · deploy.yml functions 잡)은 «저장소 루트»에 있어야 함.
   아직 루트에 안 올라온 저장소(스테이징에만 있음 등)에서는 ⚠ 로 알리고 사이트 배포는 막지 않음 — 올라오면 그때부터 엄격히 검사 */
const warn = (m) => console.log('  ⚠ ' + m);
const HAS_FN = fs.existsSync(path.join(ROOT, 'tests', 'fn'));
if (!HAS_FN) warn('tests/fn(함수 테스트)·supabase/functions·README.md 가 저장소 루트에 없음 — 함수 테스트는 CI 에서 건너뜀 (ci 묶음을 «운영(루트)» 대상으로 올리면 검사 시작)');
if (HAS_FN) {
  const fnTests = ['ops', 'remind', 'aicheck'].map((n) => path.join(ROOT, 'tests', 'fn', n + '.test.ts'));
  say(fnTests.every((f) => fs.existsSync(f)) && fs.existsSync(path.join(ROOT, 'tests', 'fn', '_mock.ts')), 'tests/fn: ops·remind·aicheck 함수 테스트 + _mock.ts 존재');
  const mock = fs.existsSync(path.join(ROOT, 'tests', 'fn', '_mock.ts')) ? fs.readFileSync(path.join(ROOT, 'tests', 'fn', '_mock.ts'), 'utf8') : '';
  say(/\.\.\/\.\.\/supabase\/functions\//.test(mock) && !/\/home\/|\/tmp\//.test(mock), 'tests/fn: 함수를 상대 경로로 불러옴(절대 경로 없음)');
  for (const f of fnTests) if (fs.existsSync(f)) { const t = fs.readFileSync(f, 'utf8'); say(!/(sb_secret_[A-Za-z0-9]{20,}|sbp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xoxb-[0-9]{8,}|sk-ant-[A-Za-z0-9-]{20,}|eyJhbGciOi[A-Za-z0-9._-]{60,})/.test(t), path.relative(ROOT, f) + ': 비밀값 패턴 없음'); }
  const wf = path.join(ROOT, '.github', 'workflows', 'deploy.yml'); const y = fs.existsSync(wf) ? fs.readFileSync(wf, 'utf8') : '';
  /* deploy.yml 은 포탈로 고칠 수 없어(토큰에 Workflows 권한 없음) 사이트 배포를 막지 않고 ⚠ 로 알림 */
  if (/^\s+functions:/m.test(y) && /setup-deno/.test(y) && /needs:\s*\[test, functions\]/.test(y)) say(true, 'deploy.yml: functions 잡(deno) 이 있고 deploy 가 test·functions 둘 다 기다림');
  else warn('deploy.yml 에 functions 잡이 없음 — 함수 테스트가 CI 에서 안 돌아감 (새 deploy.yml 을 GitHub 웹에서 붙여 넣기)');
  say(fs.existsSync(path.join(ROOT, 'README.md')), 'README.md 존재 (사이트 배포에서는 *.md 제외)');
} else if (!fs.existsSync(path.join(ROOT, 'README.md'))) warn('README.md 가 저장소 루트에 없음');
// ㊿+143: 배포 설정(deploy.yml) 권고 — 실행 환경 고정 · Node · 액션 버전 · 실패 덮기 (권고는 ⚠, 실패 덮기만 ✗)
{ const wf = path.join(ROOT, '.github', 'workflows', 'deploy.yml'); const y = (fs.existsSync(wf) ? fs.readFileSync(wf, 'utf8') : '').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');   /* 주석 줄은 빼고 */
  if (!y) warn('.github/workflows/deploy.yml 이 없음');
  else {
    if (/runs-on:\s*ubuntu-latest/.test(y)) warn('deploy.yml: runs-on ubuntu-latest — 2026-10-19 부터 Ubuntu 26 으로 바뀜 → ubuntu-24.04 로 고정 권장');
    if (/node-version:\s*['"]?20\b/.test(y)) warn('deploy.yml: Node 20(지원 종료) → 22 권장');
    if (/actions\/(checkout|setup-node|upload-artifact)@v4\b|actions\/deploy-pages@v4\b|actions\/configure-pages@v5\b|actions\/upload-pages-artifact@v3\b/.test(y)) warn('deploy.yml: 옛 액션 버전(Node 20 경고) → checkout@v6 · setup-node@v6 · upload-artifact@v6 · configure-pages@v6 · upload-pages-artifact@v5 · deploy-pages@v5');
    if (/deno run[^\n]*\|\|\s*echo/.test(y)) warn('deploy.yml: 함수 테스트 실패를 «|| echo» 로 덮는 줄이 있음 — 새 deploy.yml 로 교체 권장');
  } }
// ⑤ UX 2단계 · ⑥ AI 2단계 (㊿+139)
{ const init = fs.readFileSync(path.join(ROOT, 'js/init.js'), 'utf8');
  say(/function ovlInit\(/.test(jsAll) && /function ovlDismiss\(/.test(jsAll) && /^\s*ovlInit\(\);/m.test(init) && init.indexOf('ovlInit();') < init.lastIndexOf('boot();') && /ovlDismiss\(top\)/.test(init), 'UX(㊿+141): 창 바깥 클릭 닫기·입력 중 확인·초점 관리(ovlInit) 가 init.js 에서 boot() 전에 등록됨 · Esc 도 ovlDismiss');
  say(/ovlMarkClean\(\)/.test(jsAll.slice(jsAll.indexOf('async function sbWrite('), jsAll.indexOf('async function sbWrite(') + 2500)), 'UX(㊿+141): 저장 성공(sbWrite) 뒤 «입력 중» 표시 지움');
  say(/h\.status>=500\) throw/.test(jsAll), '데이터 로드: 서버 오류(5xx)를 빈 목록으로 넘기지 않음(sbAll)');
  say(/function opsTgtHtml\(/.test(jsAll) && /\.rn-tbl td\.wrap\{/.test(fs.readFileSync(path.join(ROOT, 'app.css'), 'utf8')), '배포·운영 기록: 긴 파일 목록 접기 · 줄바꿈(카드 밖 넘침 방지)'); }
{ /* ㊿+142: 글자 크기는 7단계만 (주간회의 확대·전체 화면 · 폰 입력칸 16px · 24px 이상 큰 숫자 · 차트 viz.js 는 예외) */
  const STEP = new Set(['12', '13', '14', '15', '18', '22']); const off = [];
  /* 실제로 불러오는 파일만(meta app-js 목록) — 저장소에 남은 옛 js/app.js 같은 안 쓰는 파일은 제외 */
  const used = ((/name="app-js" content="([^"]+)"/.exec(html) || [])[1] || '').split(',').map((x) => x.trim()).filter((x) => x && !/viz\.js$/.test(x) && fs.existsSync(path.join(ROOT, x)));
  const src = [['app.css', fs.readFileSync(path.join(ROOT, 'app.css'), 'utf8')], ['index.html', html]].concat(used.map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));
  if (fs.existsSync(path.join(ROOT, 'js', 'app.js')) && !used.includes('js/app.js')) warn('js/app.js 는 ㊿+136 부터 안 쓰는 옛 파일 — 지워도 됨(공개 사이트에 그대로 올라가 있음)');
  for (const [f, t] of src) t.split('\n').forEach((ln, i) => { if (/data-zoom|:fullscreen|#viewLogin input\{height:42px;font-size:16px|^\.otp-in\{|^\s*input:not\(\[type=checkbox\]\)[^{]*\{font-size:16px!important\}$/.test(ln)) return;   /* ㊿+181 터치 화면 입력칸 16px = iOS 확대 방지 */   /* .otp-in = 2단계 인증 숫자 칸(투명 · iOS 확대 방지 16px · ㊿+167) */ for (const m of ln.matchAll(/font-size:\s*([0-9.]+)px/g)) { if (+m[1] < 24 && !STEP.has(m[1])) off.push(f + ':' + (i + 1) + ' ' + m[1] + 'px'); } });
  say(!off.length, '글자 크기 6단계(본문 14·15 · 보조 12·13 · 제목 18·22 + 큰 숫자) 밖 값 없음 — ㊿+169 본문 14px↑·보조 12px↑' + (off.length ? ' — ' + off.slice(0, 6).join(', ') : ''));
  say(/function colwApply\(/.test(jsAll) && /colwApply\(t, ST\.CUR_VIEW\)/.test(jsAll) && /\.dgrid\.colw-fixed\{table-layout:fixed\}/.test(fs.readFileSync(path.join(ROOT, 'app.css'), 'utf8')), '표 열 너비 조절(colw) 연결');
  say(/class="subgrp" data-sub="Cloud NAC"/.test(html) && (html.match(/class="grp"[^>]*>사업 영역</g) || []).length === 1 && /function menuConfMigrate\(/.test(jsAll), '메뉴: «사업 영역» 한 그룹 + 소제목 · 예전 메뉴 편집 설정 옮김');
  say(!/class="pill"[^>]*style="[^"]*background:var\(--(s1|brand)\)[^"]*color:#fff/.test(html + jsAll), '버튼: 주요 버튼을 style 로 칠하지 않음(class="pill pri")'); }
say(/function opsAutoPath\(/.test(jsAll) && /function opsDest\(/.test(jsAll) && /OPS_WF_RE/.test(jsAll) && /function opsRepoCheck\(/.test(jsAll) && /function opsCheckFiles\(/.test(jsAll), '배포·운영 안전장치(㊿+143): 파일 자리 자동 · 저장소 파일 루트 · 워크플로 제외 · 커밋 전 경고 · 저장소 점검');
/* ㊿+145: 로그아웃·로그인 속도와 화면 이동 규칙 */
{ const sh = jsAll.slice(jsAll.indexOf('function boot('), jsAll.indexOf('function boot(') + 900); const init5 = fs.readFileSync(path.join(ROOT, 'js', 'init.js'), 'utf8');
  say(/if\(!ok\)\{ showLoginScreen\(\); return null; \}/.test(sh), '시작: 로그인 안 됨 → 서버에 묻지 않고 바로 로그인 화면(익명 load_all 없음 · ㊿+145)');
  say(/function reloadHome\(/.test(jsAll) && !/AUTH_USER=null; location\.reload\(\);/.test(jsAll), '로그아웃·자동 로그아웃은 reloadHome(주소의 #메뉴 지움)');
  say(/function enterAfterLogin\(\)\{[\s\S]{0,260}ST\.CUR_VIEW='dash'/.test(jsAll), '로그인 → 항상 대시보드');
  say(/function mfaBgCheck\(/.test(jsAll) && /opt && opt\.fast/.test(jsAll), '2단계 인증 확인은 데이터 읽기와 병렬(빠른 길 + 뒤 확인)');
  say(/function navMenu\(/.test(jsAll) && /viewSnapInit\(\)/.test(init5) && init5.indexOf('viewSnapInit()') < init5.lastIndexOf('boot();') && (jsAll.match(/navMenu\(/g) || []).length >= 7, '메뉴 클릭 → navMenu(첫 화면) 연결');
  say(/function cacheDrop\(/.test(jsAll) && !/sessionStorage\.removeItem\(CACHE_KEY\)/.test(jsAll.replace(/function cacheDrop\(\)\{[^\n]*/, '')), '사본 무효화는 cacheDrop 하나로(예약된 쓰기까지 취소)'); }
{ const css6 = fs.readFileSync(path.join(ROOT, 'app.css'), 'utf8');
  say(/\.card-head\{[^}]*flex-wrap:wrap/.test(css6) && /\.card-head \.t\{flex:1 1 220px/.test(css6) && /function segScrollSel\(/.test(jsAll), '카드 머리: 제목 최소 폭 · 버튼 줄은 아랫줄로 · 고른 연도 보이기(㊿+146 폰 장표)'); }
/* ㊿+147: CSP — 본 포탈 script-src 에 'unsafe-eval'·'unsafe-inline' 없음 · SQL 엔진은 격리 칸(sqlbox.html)만 · 색 토큰(…-solid · …-ink) */
{ const csp7 = (/http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html) || [, ''])[1], ss = (/script-src ([^;]+)/.exec(csp7) || [, ''])[1];
  say(ss && !/unsafe-eval|unsafe-inline/.test(ss), "index.html CSP script-src 에 'unsafe-eval'·'unsafe-inline' 없음 (㊿+147)");
  const sb = fs.existsSync(path.join(ROOT, 'sqlbox.html')) ? fs.readFileSync(path.join(ROOT, 'sqlbox.html'), 'utf8') : '';
  const sbCsp = (/http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(sb) || [, ''])[1];
  say(!!sb && /connect-src 'none'/.test(sbCsp) && /img-src 'none'/.test(sbCsp) && /<script src="js\/sqlbox\.js"><\/script>/.test(sb) && !/<script>/.test(sb), 'sqlbox.html: 외부 연결·이미지 막힘 · 인라인 스크립트 없음');
  say(/setAttribute\('sandbox','allow-scripts'\)/.test(jsAll) && !/allow-same-origin/.test(jsAll) && !/alasql\(/.test(jsAll), 'SQL 실행은 sandbox(allow-scripts 만) 칸에서만 · 본 포탈 코드에 alasql 호출 없음');
  const sbx = fs.existsSync(path.join(ROOT, 'js', 'sqlbox.js')) ? fs.readFileSync(path.join(ROOT, 'js', 'sqlbox.js'), 'utf8') : '';
  try { new Function(sbx); say(true, 'js/sqlbox.js 문법'); } catch (e) { say(false, 'js/sqlbox.js 문법 — ' + e.message); }
  const css7 = fs.readFileSync(path.join(ROOT, 'app.css'), 'utf8');
  say(['--brand-solid', '--s1-ink', '--s1-solid', '--warn-ink', '--info-ink', '--critical-solid'].every((t) => (css7.match(new RegExp(t + ':', 'g')) || []).length >= 2), '색 토큰: 글자용(…-ink)·바탕용(…-solid) 라이트·다크 둘 다 정의');
  say(!/background:\s*var\(--(brand|s1)\)[^}]*color:\s*#fff/.test(css7), '흰 글자 바탕은 …-solid 토큰만(어두운 화면 대비)'); }
/* ㊿+152: QA 보고서(Claude 에게) · 가격표 폭 */
{ const css = fs.readFileSync(path.join(ROOT, 'app.css'), 'utf8');
  say(/function qaReport\(/.test(jsAll) && /function qaCopy\(/.test(jsAll) && /id=\\?"qaCopy\\?"/.test(jsAll) && /function qaPath\(/.test(jsAll), 'QA 보고서: 마크다운 정리 · 복사 버튼 · 요소 경로');
  say(/#viewPrice \.pr-grid\{grid-template-columns:repeat\(auto-fill,minmax\(min\(100%,700px\),1fr\)\)\}/.test(css) && /#viewPrice \.pr-grid > \.pr-card\{min-width:0;overflow-x:auto\}/.test(css), '가격표: 좁으면 한 줄에 하나 · 카드 안에서만 스크롤(페이지 넘침 없음)'); }
/* ㊿+151: 스테이징 QA */
{ const init = fs.readFileSync(path.join(ROOT, 'js', 'init.js'), 'utf8');
  say(/function qaOpen\(/.test(jsAll) && /function qaRun\(/.test(jsAll) && /function qaInspect\(/.test(jsAll) && /function qaKpi\(/.test(jsAll) && /id="opsQa"/.test(jsAll) && /qaBadgeHtml\(\)/.test(jsAll), '스테이징 QA: 실행·검사·숫자 비교·버튼·배지');
  say(/^export var IS_QA=/m.test(fs.readFileSync(path.join(ROOT, 'js', 'state.js'), 'utf8')) && /serviceWorker\.register[\s\S]{0,40}/.test(init) && /test\(location\.protocol\) && !IS_QA\)/.test(init), 'IS_QA(?qa=1) — 서비스 워커 등록 생략');
  const gated = ['function logClientError', 'function cacheWriteLater', 'async function updCheck', 'function dcLogOnce', 'async function updSyncSeed'].filter((f) => { const i = jsAll.indexOf(f); return i < 0 || !/IS_QA/.test(jsAll.slice(i, i + 260)); });
  say(!gated.length, 'IS_QA 게이트: 오류 기록·사본 쓰기·업데이트 팝업·점검 로그·안내 시드' + (gated.length ? ' — 빠짐: ' + gated.join(', ') : ''));
  say(/qaLine/.test(jsAll) && /스테이징 QA 를 아직 실행하지 않았습니다/.test(jsAll), '승격 확인 창에 QA 상태'); }
/* ㊿+150: 공유 상태 17개 → js/state.js ST.* (모듈 전환 1단계) */
{ const MOVED = ['AUTH_USER', 'CODES', 'CUR_VIEW', 'DATA', 'DIRTY', 'HIST', 'HIST_LOADED', 'IDLE_LAST', 'IDLE_WARNED', 'INB_Y', 'LIVE_SRC', 'M', 'MAT', 'OI_CONVERT', 'PERMS', 'SB_TOKEN', 'TCOQ'];
  const win = JS_LIST.flatMap((f) => { const src = fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : ''; return MOVED.filter((n) => new RegExp('window\\.' + n + '\\b').test(src)).map((n) => f + ':' + n); });
  say(JS_LIST[0] === 'js/state.js' && /name="app-js" content="js\/state\.js,/.test(html), 'js/state.js 가 app-js 맨 앞(다른 파일보다 먼저 로드)');
  say(!win.length, 'window.<공유 상태> 접근 없음(ST.* 로)' + (win.length ? ' — ' + win.slice(0, 6).join(', ') : '')); }
/* ㊿+148: 데이터 점검 수정 창 · 업데이트 안내 팝업 */
{ say(/function dcFixOpen\(/.test(jsAll) && /function dcFixSave\(/.test(jsAll) && /dcFixOpen\(r\.id, \+p\[1\]\)/.test(jsAll), '데이터 점검: 항목 → 수정 창(dcFixOpen) · 저장(dcFixSave)');
  say(/async function sbWrite\(method, path, body, prefer, asView\)/.test(jsAll) && /function permWriteGuard\(method, path, asView\)/.test(jsAll), '저장 권한은 그 표의 화면 기준(sbWrite asView)');
  say(/function updCheck\(/.test(jsAll) && /updCheck\(\)/.test(fs.readFileSync(path.join(ROOT, 'js', 'shell.js'), 'utf8')) && /id="updAdmin"/.test(html) && /function updOpenAll\(/.test(jsAll), '업데이트 안내: 로그인 팝업(onData) · 관리자 칸 · 내 계정 내역');
  const vNow = +((/name="app-ver" content="[^"]*㊿\+(\d+)"/.exec(html) || [, 0])[1]);
  const seeds = [...jsAll.matchAll(/\{ver:'㊿\+(\d+)(?:~(\d+))?'/g)].map((m) => [+m[1], +(m[2] || m[1])]);
  const last = seeds[seeds.length - 1] || [0, 0];
  if (vNow && !(last[0] <= vNow && vNow <= last[1])) warn('UPD_SEED(js/admin.js) 마지막 안내가 ㊿+' + last.join('~') + ' — 지금 버전 ㊿+' + vNow + ' 안내를 맨 끝에 추가하세요(업데이트 팝업에 안 뜸)');
  else say(seeds.length >= 1, '업데이트 안내(UPD_SEED)에 지금 버전 ㊿+' + vNow + ' 항목 있음'); }
say(/id="dvHelp"/.test(html) && /id="ovlKeys"/.test(html) && /function askScreenHelp\(/.test(jsAll) && /function dvCapRender\(/.test(jsAll) && /function gridActPad\(/.test(jsAll), 'UX: ❔ 화면 도움말 · 단축키 창 · 설명 접기 · 동작 열 여백 코드 있음');
say(/function aiFeedback\(/.test(jsAll) && /ai_feedback/.test(jsAll) && /function aiqHtml\(/.test(jsAll) && /ai_check_log/.test(jsAll), 'AI: 👍/👎 피드백 · 점검 추이 코드 있음');
say(/\^ai_feedback\\b\|\^ai_check_log\\b/.test(jsAll), 'permWriteGuard 예외에 ai_feedback·ai_check_log');
// ② 보안 마무리 (㊿+140): 견적 Worker v2 — 팀 공용 비밀번호 제거 · 포탈 로그인 토큰
{
  const satQ = htmls.includes('quote.html') ? pageCode('quote.html') : '';
  say(!/X-Access-Password/.test(jsAll) && !/X-Access-Password['"]?\s*:/.test(satQ) && !/id="ghToken"/.test(satQ), '견적 저장 서버: 포탈·quote.html 이 X-Access-Password(팀 비밀번호)를 보내지 않음');
  say(/function qFetch\(/.test(jsAll) && (!satQ || /function workerFetch\(/.test(satQ)), '견적 저장 서버: qFetch(포탈) · workerFetch(quote.html) 가 Bearer 토큰으로 호출');
  const wf = path.join(ROOT, 'cloudflare', 'quote-worker', 'worker.js');
  if (fs.existsSync(wf)) { const w = fs.readFileSync(wf, 'utf8');
    say(/\/auth\/v1\/user/.test(w) && /user_roles/.test(w) && /has_perm/.test(w) && /NAME_OK/.test(w) && /ALLOWED_ORIGINS/.test(w), 'cloudflare/quote-worker/worker.js: 토큰 검증 · 역할 · 메뉴 권한 · 경로 제한 · CORS');
    say(!/(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|sb_secret_[A-Za-z0-9]{10,}|service_role)/.test(w), 'cloudflare/quote-worker/worker.js: 비밀값 없음 (service_role 미사용)');
    if (HAS_FN) say(fs.existsSync(path.join(ROOT, 'tests', 'fn', 'quote-worker.test.ts')), 'tests/fn/quote-worker.test.ts 존재'); }
}
for (const d of ['', 'staging']) { const p = path.join(ROOT, d, '도장.jpg'); if (fs.existsSync(p)) console.log(`  ⚠ ${d ? d + '/' : ''}도장.jpg 가 저장소에 있음 — 배포·운영 › GitHub › 보안 자산에서 Storage 로 올리고 삭제하세요 (SQL 87)`); }
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n정적 검사 실패 ${fail}건` : '\n정적 검사 통과');
process.exit(fail ? 1 : 0);
