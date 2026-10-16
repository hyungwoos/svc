// 정적 검사 — 모든 HTML 의 <script> 블록 문법 · APP_VER 형식 · 비밀값/실데이터 유출 휴리스틱 · 필수 파일 존재
// 실행: node tests/check.mjs   (브라우저 불필요 · 1초)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
say(/^export function homeSetup\(/m.test(jsAll) && /^export function srchHits\(/m.test(jsAll) && /^export function looksQuestion\(/m.test(jsAll) && /^export function localIntent\(/m.test(jsAll) && /^export function renewNeedScan\(/m.test(jsAll) && /^export function homeRender\(/m.test(jsAll) && /^export function srchCtx\(/m.test(jsAll) && /^export function homeB\(/m.test(jsAll) && /^export function myOwner\(/m.test(jsAll) && /^export function viewResetHard\(/m.test(jsAll) && /^export function custGo\(/m.test(jsAll) && /^export function turnSnap\(/m.test(jsAll) && html.includes('id="ansThread"') && html.includes('id="fkCtx"') && !html.includes('id="omUser"') && /#viewDash:not\(\.hm-detail\)/.test(fs.readFileSync(path.join(ROOT, 'app.css'), 'utf8')) && /retL=orders\.filter\(EQB_ONLY\.ret\[1\]\)/.test(jsAll) && /r\.id==='c_lapsed'/.test(jsAll) && !/biz-ok">확정/.test(jsAll) && /^export function qbPicked\(/m.test(jsAll) && /NAV\.reset==='quote'/.test(jsAll) && /svcFind/.test(fs.readFileSync(path.join(ROOT, 'sat', 'common.js'), 'utf8')) && /role="listbox" id="\$\{box\.id\}_lb"/.test(jsAll), '㊿+171~172 홈 업무 공간: 검색(결과 먼저 · AI 는 따로) · 핵심 현황(전체 사업 · 이번 달 고정) · 바로가기 · 매출 추이 + 우선 업무(내 업무/팀) · 최근 · 상세 펼침 · AI 패널(원래 답 보존) · 메뉴 재진입 상태 유지 · 초기화 · 고객 문맥 · (㊿+184 담당자 연결 화면 뺌) · 비즈포탈 «입력 완료» · 리포트 템플릿 먼저 · 견적 쓰던 내용 유지(위성 화면 Ctrl+K)');
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
    && /^export function quoteOpen\(/m.test(jsAll) && /quotes:\{[^\n]*\n\s*(emptyCta:\{[^}]*\}, )?title:'견적 목록', table:'quotes'/.test(jsAll) && html.includes('data-v="quotes"'),
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
// ㊿+182 연동 · 코드 품질: 호출 시간 제한(fetchT) · 연동 상태 · 함수 v1.7/v1.2/v1.4(속도 제한 · 기록) · 병렬 smoke · 단위 시험
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const co = rd('js/core.js'), ad = rd('js/admin.js'), sm = rd('tests/smoke.mjs'), lb = rd('tests/lib.mjs');
  const fnOk = !fs.existsSync(path.join(ROOT, 'tests', 'fn')) || (/integrations: body\.deep === true/.test(rd('supabase/functions/ops/index.ts')) && /r\.status === 429 && i < RETRY_429/.test(rd('supabase/functions/notify/index.ts')) && /body\.mode === 'health'/.test(rd('supabase/functions/notify/index.ts'))
    && /await fetchT\(SB_URL \+ '\/rest\/v1\/remind_log'/.test(rd('supabase/functions/remind/index.ts')));
  say(/^export async function fetchT\(url, opts, ms, what, rd\)/m.test(co) && /x\.timeout=to; x\.net=!to;/.test(co) && /fetchT\(SB_URL\+'\/rest\/v1\/'\+q,\{headers:sbHeaders\(\)\}, 60000, 'DB'\)/.test(jsAll)
    && /fetchT\(SB_URL\+'\/functions\/v1\/notify'/.test(jsAll) && /fetchT\(SB_URL\+'\/functions\/v1\/cloudsite'/.test(jsAll) && /^export async function opsIntegrations\(\)/m.test(ad) && /id="opsInteg"/.test(ad)
    && fnOk && /blk\(\) \{ this\.bi\+\+;/.test(lb) && /SMOKE_SHARDS/.test(sm) && fs.existsSync(path.join(ROOT, 'tests', 'unit.mjs')),
  '㊿+182 연동: 호출 시간 제한(fetchT · 쓰기는 다시 안 보냄) · 연동 상태(토큰 만료 · 봇 권한 · 마지막 실행) · ops v1.7 · notify v1.2(429 · 대상마다 기록 · health) · remind v1.4 · 병렬 smoke · 단위 시험'); }
// ㊿+183 숫자 차이 근거 · 계약 요약 + 다음 처리 · 폰 카드 우선 칸
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const an = rd('js/analysis.js'), gr = rd('js/grid.js'), gd = rd('js/grids.js'), sa = rd('js/sales.js'), sh = rd('js/shell.js'), da = rd('js/dash.js');
  say(/^export function diffOpen\(o\)/m.test(an) && /^export function liveMultiOpen\(T, rows\)/m.test(an) && /^export function liveDeltaOpen\(T\)/m.test(an) && /^export function renewOpenFor\(r, T\)/m.test(an)
    && /data-diff="multi"/.test(da) && /id="lvMulti"/.test(gr) && /^export function crDupOpen\(/m.test(sa) && /^export function dtSummary\(c\)/m.test(gr) && /button\.c360-do/.test(sh)
    && /mob:\['line','end_month','mrr','partner'\]/.test(gd) && /DVC\.ord=ord;/.test(gr) && /sbAll\('customers\?select=\*&order=id'\)/.test(sh) && /ST\.LOAD_PATH='slow'/.test(sh),
  '㊿+183 숫자 차이 근거(diffOpen · 두 제품 이상 · 변동 · 시트 차이 · 해지율 중복) · 계약 요약 + 다음 처리(dtSummary · renewOpenFor · 고객 360 만기 처리) · 폰 카드 우선 칸(mob)'); }
// ㊿+184 OI 담당 = 붙은 견적서의 작성자 · 인바운드는 홈 할 일에서 뺌 · 글로 만드는 리포트(ask v3.5 report)
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const gr = rd('js/grid.js'), hm = rd('js/home.js'), sh = rd('js/shell.js'), rp = rd('js/report.js'), ix = rd('index.html');
  say(/^export function oiOwnerOf\(r\)/m.test(gr) && /^export function oiQuotesReady\(key, cb\)/m.test(gr) && /\['noq','견적 전'/.test(gr) && !/id="qvMe"/.test(gr) && /return oiOpen\(r\) && oiMine\(r\);/.test(hm + gr)
    && !/add\('inb',/.test(sh) && !/id="omUser"/.test(ix) && !/hm-who/.test(hm) && /^export async function rpaAsk\(q, fix\)/m.test(rp) && /mode:'report'/.test(rp) && /id="rpAsk"/.test(rp) && /return \{ok:true, n:rows\.length\};/.test(rp) && /^export async function qoiOnSaved\(id, src\)/m.test(rd('js/sales.js')) && /win_prob:10/.test(rd('js/sales.js')) && /type: 'quoteSaved'/.test(rd('sat/qdb.js')) && /data\.type!=='quoteSaved'/.test(rd('js/init.js')),
  '㊿+184 내 OI = 견적 작성자(oiOwnerOf · 견적 전 · 이름 고르기 · 담당자 연결 없음) · 인바운드는 홈 할 일 아님 · 견적 → OI 자동 등록(10% · 진행 중 OI 면 연결 · 예전 견적은 미리 보기) · 글로 만드는 리포트(rpaAsk → ask report → 격리 칸 계산)'); }
// ㊿+185 우선 업무 줄 담당(work_assign area · 포탈 계정 목록) · 개선 요청(portal_feedback)
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const nt = rd('js/notify.js'), hm = rd('js/home.js'), sh = rd('js/shell.js'), ed = rd('js/edit.js');
  say(/^export var AREA_DEFS=/m.test(nt) && /^export async function ntfAreaOpen\(key\)/m.test(nt) && /^export async function ntfAccounts\(\)/m.test(nt) && /rpc\/portal_accounts/.test(nt) && /kind=in\.\(eq,area\)/.test(nt)
    && /^export function fbOpen\(opt\)/m.test(nt) && /portal_feedback/.test(nt) && /class="hm-own hm-asg/.test(hm) && /asg:'rnl', me:areaMe\('rnl'\)/.test(sh) && /data-a="fb"/.test(ed) && /bulb:'<path/.test(sh),
  '㊿+185 우선 업무 줄 담당(AREA_DEFS · ntfAreaOpen · 포탈 계정 portal_accounts · work_assign area) · 개선 요청(fbOpen · portal_feedback · 위 띠 💡 · 계정 메뉴)'); }
// ㊿+186 전역 정리 — 제목 한 번(vtDupSync) · 이모지 제거(deEmoji) · 더보기 메뉴(moreMenuSetup) · 빈 화면 버튼(emptyCta) · 푸터
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const sh = rd('js/shell.js'), gr = rd('js/grid.js'), da = rd('js/dash.js'), css = rd('app.css');
  say(/^export function vtDupSync\(v\)/m.test(sh) && /^export function deEmoji\(root\)/m.test(sh) && /^export function moreMenuSetup\(\)/m.test(sh) && /\['btnHelp','btnViewReset','btnReload','btnFont','btnTheme'\]/.test(sh) && /try\{ vtDupSync\(v\);/.test(sh)
    && /data-dge="cta"/.test(gr) && /emptyCta:\{l:'견적 만들기', v:'quote'/.test(rd('js/grids.js')) && !/원본: Supabase DB/.test(da) && /\.vt-dup \.vt-txt\{position:absolute/.test(css) && /td\.act \.ab\{opacity:0/.test(css) && !/43_inbound\.sql 실행과 Apps Script 코드 교체·배포가 필요합니다\.<\/p>/.test(rd('js/inbound.js')),
  '㊿+186 전역 정리(제목 한 번 · 이모지 제거 · «더보기» 메뉴 · 행 버튼 올렸을 때 · 빈 화면 버튼 · 푸터 · 설정 안내는 관리자만)'); }
// ㊿+187 표 위 필터 한 줄(fbarSync · #dvFilterPop · #dvChips · 저장된 보기 fv*) · 사업 영역 한 화면(renderAreaSel · areaPick · 상단 «사업 영역» 버튼)
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const sh = rd('js/shell.js'), gr = rd('js/grid.js'), an = rd('js/analysis.js'), css = rd('app.css');
  say(/^export function fbarSync\(g, isCustom\)/m.test(gr) && /^export function fbarChips\(g, isCustom\)/m.test(gr) && /^export function fvMenuOpen\(btn\)/m.test(gr) && /id='dvFilterPop'/.test(gr) && /id='dvChips'/.test(gr) && /\['dvReload','dvPaste','dvDense'\]/.test(gr) && /try\{ fbarSync\(g, isCustom\); \}/.test(gr)
    && /DV\.chipVal=''; DV\.page=0; renderGrid\(\); \}/.test(gr) && /^export function renderAreaSel\(key\)/m.test(an) && /^export function areaPick\(\)/m.test(an) && /tops\.push\(\{v:'area', t:s\.label\}\)/.test(sh) && /b\.dataset\.v==='area' && !!CH_DEFS\[v\]/.test(sh) && /if\(v==='area'\)\{ v=areaPick\(\);/.test(gr)
    && /\.fb-pop\{position:fixed/.test(css) && /\.area-sel\{display:flex/.test(css),
  '㊿+187 표 위 필터 한 줄(fbarSync · 필터 팝오버 · 조건 칩 · 저장된 보기 · ⋯ 도구) · 사업 영역 한 화면(renderAreaSel · areaPick · 상단 버튼 하나)'); }
// ㊿+188 화면별 정리 — 0 행 접기(foldZeroRows) · 필터 접기(crFltOpen) · 유입경로 0 경로 · 대조 카드(details#eqChk) · 눈금 중복 · 이력 읽기(logDetailText) · 상세 창 · 고객 360 · 위성 embed · 폰 도구줄(fbarPhoneSync)
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const to = rd('js/tools.js'), sa = rd('js/sales.js'), an = rd('js/analysis.js'), eq = rd('js/equipment.js'), gr = rd('js/grid.js'), vz = rd('js/viz.js'), sh = rd('js/shell.js'), css = rd('app.css'), ix = rd('index.html');
  say(/^export function foldZeroRows\(root, key, word\)/m.test(to) && /foldZeroRows\(host, 'cr'\)/.test(sa) && /foldZeroRows\(host, 'cf'\)/.test(sa) && /foldZeroRows\(host, 'ls', '경로'\)/.test(an) && /^export function crFltOpen\(id, G\)/m.test(sa) && /zeroSrc=isGN\(\)/.test(an)
    && /id="eqChk"/.test(eq) && /EQ_CHK=\{open:null\}/.test(eq) && /if \(txt === lastTxt && !isZero\) continue;/.test(vz) && /^export function logDetailText\(v, target, max\)/m.test(gr) && /logDetailText\(v, r&&r\.target, 160\)/.test(rd('js/grids.js')) && /id="dtChartCap"/.test(ix) && /dt-flat/.test(gr)
    && /^export function fbarPhoneSync\(g\)/m.test(gr) && /^export function satEmbed\(\)/m.test(gr) && /embed=gn/.test(rd('sat/common.js')) && /html\[data-embed="gn"\]/.test(rd('sat/settle.css')) && /class="sat-head"/.test(ix) && /var eqZero=isGN\(\)/.test(sh)
    && /\.zr-btn\{/.test(css) && /details\.eq-chk>summary\{/.test(css) && /\.ovl \.modal>\.mact\{position:sticky;bottom:-18px/.test(css) && /html\[data-skin="gn"\] \.ukw\{display:none\}/.test(css),
  '㊿+188 화면별 정리(0 행 접기 · 필터 접기 · 대조 한 줄 · 눈금 · 이력 읽기 · 상세 창 · 고객 360 · 위성 embed · 폰 도구줄)'); }
// ㊿+189 개선 요청 첨부(fbAttAdd · fbUpload · Storage feedback) · 표시 이름(portal_profiles · ntfProf · profEdit · 내 계정 · 관리자 계정)
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const nt = rd('js/notify.js'), ad = rd('js/admin.js'), co = rd('js/core.js'), css = rd('app.css');
  say(/^export function fbAttAdd\(files, msg\)/m.test(nt) && /^export async function fbUpload\(\)/m.test(nt) && /storage\/v1\/object\/feedback\//.test(nt) && /storage\/v1\/object\/authenticated\/feedback\//.test(nt) && /id="fbFile"/.test(nt) && /addEventListener\('paste'/.test(nt) && /(done_at,files&order|',files' : ''\))/.test(nt)
    && /^export function ntfProf\(e\)/m.test(nt) && /^export function profEdit\(email, opt\)/m.test(nt) && /portal_profiles\?on_conflict=email/.test(nt) && /return ntfDisp\(ntfProf\(e\)\) \|\| QMGR_MAP\[l\] \|\| l;/.test(nt) && /id="accProfEdit"/.test(ad) && /data-axpf=/.test(ad) && /\^portal_feedback\\b\|\^portal_profiles\\b/.test(co) && /\.fb-pv\{/.test(css),
  '㊿+189 개선 요청 첨부(fbAttAdd · fbUpload · 붙여넣기 · 버킷 feedback) · 표시 이름(ntfProf · profEdit · portal_profiles · 내 계정 · 관리자 계정 · 쓰기 관문 예외)'); }
// ㊿+190 사람은 어디서나 «이름 직급»(ntfName) — 홈 장비 줄 · 상단 내 계정(gnMeSync) · 표 작성/누가 열 · 이력 · 제안 · 마감 · 공유 · 첨부 · 알림 · 이름 캐시
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const nt = rd('js/notify.js'), sh = rd('js/shell.js'), gs = rd('js/grids.js'), gr = rd('js/grid.js'), an = rd('js/analysis.js');
  say(/^export function gnMeSync\(\)/m.test(sh) && /return a\? ntfName\(a\.assignee\) : \(o\.requester\? ntfName\(o\.requester\) : ''\);/.test(sh) && /var meNm=''; try\{ meNm=ntfDisp\(ntfProf\(me\)\); \}catch\(e\)\{\}/.test(sh)
    && /function namesCache\(\)/.test(nt) && /function namesStore\(acc\)/.test(nt) && /NAMES_LS='svc_names'/.test(nt) && /\(bare && a\.email\.split\('@'\)\[0\]===em\)/.test(nt) && /try\{ gnMeSync\(\); \}catch\(e\)\{\}/.test(nt) && !/ntfWho\(asg\)|ntfWho\(em\)|ntfWho\(e\)\+/.test(nt)
    && /k:'created_by',l:'작성',ro:true,fmt:function\(v\)\{ return ntfName\(v\); \}/.test(gs) && /k:'actor',l:'누가',ro:true,fmt:function\(v\)\{ return ntfName\(v\); \}/.test(gs) && /\$\{ntfName\(x\.actor\)\}/.test(gr) && /ntfName\(e\.by\)/.test(gr)
    && /ntfName\(h\.actor\)/.test(an) && /ntfName\(lk\.locked_by\)/.test(an) && /ntfName\(a\.by_email\)/.test(an) && /ntfName\(i\.uploaded_by\)/.test(rd('js/cloud.js')) && /ntfName\(who\.actor\)/.test(rd('js/guard.js')) && /who:ntfName\(x\.owner\)/.test(rd('js/report.js'))
    && /ntfName\(x\.handled_by\)/.test(rd('js/admin.js')) && /ntfName\(r\.requester\)/.test(rd('js/inbound.js')) && /ntfName\(r\.requester\)/.test(rd('js/tools.js')) && /ntfName\(h\.by\)/.test(rd('js/edit.js')),
  '㊿+190 사람은 어디서나 «이름 직급»(ntfName · gnMeSync · 이름 캐시 · 표 열 · 이력 · 알림)'); }
// ㊿+191 에스원 대조표 DK 건별 · 비즈포탈에만 · 차액 맞춰 보기 · 저장 payload(dk · biz_only · svc) / 카카오 회계매출 한 번(bizSumOnce) · 회계매출 · 차액 열 / 인쇄 공통(bundleMark · sec/sub 줄 · 짝수 줄 노란 · table-layout:fixed)
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const s1 = rd('sat/s1.js'), kk = rd('sat/kk.js'), st = rd('sat/settle.js');
  say(/^function bundleMark\(rows\)/m.test(st) && /^function bizSumOnce\(rows\)/m.test(st) && !/^function bundleMark/m.test(s1) && /r\.__sec/.test(st) && /tbody tr\.hl td,tbody tr\.hl:nth-child\(even\) td/.test(st) && /table-layout:fixed/.test(st) && /overflow-wrap:anywhere/.test(st)
    && /^function useFlags\(g, ym\)/m.test(s1) && /^function bizOnlyRows\(\)/m.test(s1) && /^function dkRowOut\(g\)/m.test(s1) && /dk:\(S\.use\.dk\|\|\[\]\)\.map\(dkRowOut\)/.test(s1) && /biz_only:bizOnlyRows\(\)/.test(s1) && /저장분에 건별 목록이 없음/.test(s1) && /차액 맞춰 보기/.test(s1) && /S\.use\.etc=(G\.filter|etc;)/.test(s1) && /svc:\(g\.lines\|\|\[\]\)\.map/.test(s1)
    && /var bizSum=bizSumOnce\(K\.rows\);/.test(kk) && /biz_total:bizSumOnce\(K\.rows\)/.test(kk) && /\{k:'acc',l:'회계매출',n:true,w:'12%',wrap:true\},\{k:'diff',l:'차액'/.test(kk) && !/\{k:'prod',l:'제공서비스'\}/.test(kk),
  '㊿+191 에스원 대조표(DK 건별 · 비즈포탈만 · 맞춰 보기 · 저장분) · 카카오(회계매출 한 번 · 열) · 인쇄 공통(묶음 · 구역 줄 · 노란 · 표 너비)'); }
// ㊿+192 Cloud 사이트 → 계약 전환 점검(site_watch · SW · 홈 줄 · 알림 kind site · 점검 탭 · 용도/기한 · 계약 입력 채우기 · EDR · 메뉴 권한 opt-in · remind v1.5 sites)
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const sa = rd('js/sales.js'), nt = rd('js/notify.js'), sh = rd('js/shell.js'), co = rd('js/core.js'), ad = rd('js/admin.js'), ix = rd('index.html'), rm = rd('supabase/functions/remind/index.ts'), css = rd('app.css');
  say(/^export var SW=\{rows:null, ok:null, at:0, loading:null\};/m.test(sa) && /^export function swLoad\(force\)/m.test(sa) && /rpc\/site_watch/.test(sa) && /^export function swRender\(load\)/m.test(sa) && /^export function swLinkContract\(id\)/m.test(sa) && /^export function swEdit\(id\)/m.test(sa) && /^export async function swSlack\(\)/m.test(sa) && /^export async function swAfterCreate\(sitename, purpose, due\)/m.test(sa)
    && /edr:'Cloud EDR'/.test(sa) && /id="csPaneWatch"/.test(ix) && /id="swHost"/.test(ix) && /id="csPurpose"/.test(ix) && /id="csDue"/.test(ix) && /<option value="edr">Cloud EDR \(edr\)<\/option>/.test(ix) && /data-t="watch"/.test(ix)
    && /kind:'site', key:'site:'/.test(nt) && /swLoad\(false\)\.then/.test(nt) && /add\('site', \{lv:swHi\? 1 : 2/.test(sh) && /\(ST\.IS_SUPER \|\| canView\('csite'\)\)\? '':'none'/.test(sh)
    && /^export var PERM_OPTIN=\{csite:1\};/m.test(co) && !/PERM_EXEMPT=\{[^}]*csite/.test(co) && /PERM_OPTIN\[v\]\? \{v:false, r:false, w:false\}/.test(co) && /apDefault\(role, v\)/.test(ad)
    && /rpc\/site_watch/.test(rm) && /function buildSites\(/.test(rm) && /only\.includes\('sites'\)/.test(rm) && /kind: 'sites'/.test(rm) && /\.sw-tiles\{/.test(css),
  '㊿+192 Cloud 사이트 → 계약 전환 점검(site_watch · 홈 줄 · 알림 · 점검 탭 · 용도/기한 · 계약 입력 · EDR · 메뉴 권한 · remind v1.5)'); }
// ㊿+193 인바운드 자동 회신(IA · inbound_auto · inbound_auto_log · 카드 · 설정 창 · 지금 실행 · 목록 열 · 상세 줄)
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const ib = rd('js/inbound.js'), gr = rd('js/grids.js'), css = rd('app.css'), vz = rd('js/viz.js'), ini = rd('js/init.js');
  say(/^export var IA=\{cfg:undefined, log:undefined, ok:null, at:0, open:false, map:null, busy:false\};/m.test(ib) && /^export function iaLoad\(cb\)/m.test(ib) && /inbound_auto\?select=\*&id=eq\.1/.test(ib) && /inbound_auto_log\?select=\*&order=at\.desc&limit=200/.test(ib)
    && /^export function iaCard\(\)/m.test(ib) && /^export function iaEdit\(\)/m.test(ib) && /^export function iaRun\(\)/m.test(ib) && /\?action=inbound_autoreply/.test(ib) && /sbWrite\('PATCH', 'inbound_auto\?id=eq\.1', body, 'return=minimal', 'inbound'\)/.test(ib)
    && /logChange\('update', 'inbound_auto', 1/.test(ib) && /ST\.IS_EQUIP\? '' : iaCard\(\)/.test(ib) && /^  iaWire\(host\);/m.test(ib) && /<b>자동 회신<\/b>/.test(ib) && /timeZone:'Asia\/Seoul'/.test(ib)
    && /\{k:'_auto',l:'자동 회신',ro:true,html:1/.test(gr) && /r\._auto=IA\.map\?/.test(gr) && /\.ia-card \.ia-tag\{/.test(css)
    && /function redrawAll\(\)/.test(vz) && /redrawAll: redrawAll/.test(vz) && /host\.__vizW = W;/.test(vz) && /Viz\.redrawAll\(\)/.test(ini) && /\.eqb-charts\{grid-template-columns:minmax\(0,1fr\) minmax\(0,1\.7fr\)\}/.test(css) && /\.eqb-charts \.card svg\[role="img"\]\{max-width:100%;height:auto\}/.test(css),
  '㊿+193 인바운드 자동 회신(IA · inbound_auto · 카드 · 설정 창 · 지금 실행 · 목록 «자동 회신» 열 · 상세 줄) · 차트 창 폭 따라 다시 그리기(Viz.redrawAll · eqb-charts minmax 0)'); }
// ㊿+194 AI 비용 탭 뺌 · 답에 공급자 · 장비 회수일/출고일 · 사이트 권한 오류 안내
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const ix = rd('index.html'), ad = rd('js/admin.js'), ai = rd('js/ai.js'), eq = rd('js/equipment.js'), sa = rd('js/sales.js'), ac = rd('supabase/functions/aicheck/index.ts');
  say(!/data-t="bill"/.test(ix) && !/data-pane="bill"/.test(ix) && !/abLoad|abSave|axBillKpi/.test(ad) && /var tabs=\['acct','sec','cfg','api'\];/.test(ad)
    && /^export function aiProvName\(p\)/m.test(ai) && /r\.provider\? tpl` · <span class="ai-prov"/.test(ai) && /r\.provider\? ' · '\+aiProvName\(r\.provider\)/.test(ad)
    && /^export function eqShipDate\(r, todayS\)/m.test(eq) && /var dep=gone\? eqShipDate\(r, todayS\) : null;/.test(eq) && !/\|\| todayS\) : null;/.test(eq) && !/slice\(0,10\):null\) \|\| todayS;/.test(eq)
    && /if\(stA && stA!=='회수완료' && a\.returned_date\) d\.push\('회수일'\);/.test(eq) && /a\.deployed_date && a\.status!=='재고'\) o\.deployed_date=/.test(eq)
    && /^export function csErrHint\(m\)/m.test(sa) && /권한 위임/.test(sa) && /ntfName\(x\.requested_by\)/.test(sa)
    && /aicheck v1\.7/.test(ac) && !/ANTHROPIC_API_KEY/.test(ac.replace(/^\/\/.*$/gm, '')),
  '㊿+194 AI 비용 탭 뺌 · 답 · 점검에 공급자 · 출고일 = 수령희망›신청일 · 회수일 지어내지 않음 · 회수일 어긋남 · 사이트 권한 오류 안내 · aicheck v1.7'); }
// ㊿+195 Cloud 사이트 요청 이력 한 화면 · 메시지 펼침 · 한국 시각 · API 계정 목록 실패 표시
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const sa = rd('js/sales.js'), ix = rd('index.html'), css = rd('app.css');
  say(/^export function csErrShort\(m\)/m.test(sa) && /^export function csKst\(v\)/m.test(sa) && /data-cshist=/.test(sa) && /class="cs-det"/.test(sa) && /CS\.credErr=/.test(sa) && /id="ccRetry"/.test(sa)
    && /id="csHistMsg"/.test(ix) && /<col class="c-tg">/.test(ix) && !/<th>메시지<\/th><th>요청자<\/th><th>API 계정<\/th><th>메모<\/th>/.test(ix) && /#csHist\{width:100%;table-layout:fixed\}/.test(css),
  '㊿+195 Cloud 사이트 요청 이력: 칸 7개 · 결과에 짧은 이유 · 메시지 펼침 · 모두 보기 · 한국 시각 · API 계정 목록 실패 표시'); }
// ㊿+196 에스원 정산 — 청구 총액 = 리스트 지급금액 · 기타 서비스 · 철거비 일회성
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const s1 = rd('sat/s1.js'), gr = rd('js/grid.js');
  say(/var keepCond=!!\(mem && NAV\.pop\);/.test(gr) && /\$\('#dvSearch'\)\.value=keepCond\? mem\.q : '';/.test(gr) && /^function useTot\(\)/m.test(s1) && /\/철거비\|회수비\/\.test\(proj\)\?'once'/.test(s1) && /headTotal:headTotal/.test(s1) && /S\.use\.etc=etc;/.test(s1) && /S\.use\.bizOnce=/.test(s1)
    && /total:T\.s1, biz_total:bizSum/.test(s1) && /etc:\(S\.use\.etc\|\|\[\]\)\.map\(useRowOut\), once:/.test(s1) && /기타 서비스\(EDR·MDR 등\)/.test(s1) && /일회성\(철거비\)/.test(s1) && /fee=Math\.round\(\(nacSum\+dkSum\)\*/.test(s1),
  '㊿+196 메뉴로 다시 들어오면 검색 · 필터 비움(뒤로는 그대로) · 에스원 정산: 청구 총액 = 리스트 «지급금액» · 기타 서비스(EDR·MDR) 합계 · 매칭 · 철거비 일회성 · 저장 · 불러오기 · 수수료 기준 그대로'); }
// ㊿+197 API 계정 키 교체(cloudsite v2 cred_rekey)
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const sa = rd('js/sales.js');
  say(/class="chip cc-rekey"/.test(sa) && /action:'cred_rekey', id:\+c\.id, apikey:key/.test(sa) && /type="password" class="cc-rk-in" autocomplete="new-password"/.test(sa) && /logChange\('update','api_credentials',\+c\.id,\{label:c\.label, action:'키 교체'\}\)/.test(sa),
  '㊿+197 API 계정 «키 교체»(비밀번호 칸 · cred_rekey · 이력에 키 없음)'); }
// ㊿+198 견적서 단가 = 가격표(price_books SaaS 최신 판) · 내장 값은 못 읽을 때만
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const q = rd('sat/quote.js'), qh = rd('quote.html'), qc = rd('sat/quote.css');
  say(/^function qpLoad\(\)/m.test(q) && /price_books\?select=label,applied,data&seg=eq\.saas&order=applied\.desc,id\.desc&limit=1/.test(q) && /^const QP_SVC = \{ MDR: 'GIES \(MDR Service\)', MDRA: 'MDR Add-on 24×7', CIE: 'Cloud EDR', AV: 'GIEA \(AV Service\)', RW: 'GIER \(Ransomware Service\)', DC: 'GIED \(Device Control\)' \};/m.test(q)
    && /'무약정': r\[1\], '1년약정': r\[2\], '2년약정': r\[3\], '3년약정': r\[4\]/.test(q) && /qpLoad\(\);   \/\/ ㊿\+198/.test(q) && /id="qpState" class="qp-state no-print"/.test(qh) && /@media print \{ \.qp-state \{ display: none !important; \} \}/.test(qc)
    && /"Cloud ZTNA \(PA\)": \{\n {8}type: "monthly",\n {8}tiers: \[\n {12}\{ max: 100, prices: \{ "무약정": 13300, "1년약정": 6000, "2년약정": 4500, "3년약정": 4000 \} \}/.test(q),
  '㊿+198 견적서 단가 = 가격표 SaaS 최신 판(서비스 key 매핑 · NAC/ZTNA 약정별 · 부가 서비스 · 작성자만 보는 출처 표시) · 내장 값 = 2026-09-21 판'); }
// ㊿+199 그림 글자만 있는 단추 → 아이콘(빈 단추 금지)
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const sh = rd('js/shell.js'), css = rd('app.css');
  say(/^export function deEmojiEl\(el\)/m.test(sh) && /for\(var i=0;i<els\.length;i\+\+\) n\+=deEmojiEl\(els\[i\]\);/.test(sh) && /'🗑':'trash','👍':'thumbUp','👎':'thumbDown','❔':'help'/.test(sh) && /thumbUp:'<path/.test(sh) && /if\(!nm \|\| el\.querySelector\('svg'\)\) return 0;/.test(sh) && /button\.emo-ico\{display:inline-flex/.test(css),
  '㊿+199 그림 글자만 있는 단추는 떼지 않고 선 아이콘 + 이름(deEmojiEl · EMO_ICO) — 짝 없으면 그대로'); }
// ㊿+200 개선 요청 흐름(SQL 120 feedback_act) · 외부 연동 안내 · 고객사 수 «개사»
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const nt = rd('js/notify.js'), ad = rd('js/admin.js'), cr = rd('js/core.js'), sh = rd('js/shell.js'), ds = rd('js/dash.js');
  say(/^export function fbItems\(\)/m.test(nt) && /sbWrite\('POST','rpc\/feedback_act',\{p_id:x\.id, p_act:act, p_body:body\|\|null\}\)/.test(nt) && /data-fbtab="inbox"/.test(nt) && /class="fb-steps"/.test(nt) && /dmOnly:true/.test(nt) && /var team=all\.filter\(function\(x\)\{ return !x\.dmOnly; \}\);/.test(nt) && /\^rpc\\\/feedback_act\\b/.test(cr)
    && /^export var API_DS=/m.test(ad) && /^export function apiUrl\(ds, fmt\)/m.test(ad) && /<div id="apiGuide">/.test(ad) && /class="api-flow"/.test(ad) && !/'곳'/.test(ds + sh) && /\['개사 · 건 · 대'/.test(sh),
  '㊿+200 개선 요청: 탭 · 진행 줄 · feedback_act · 요청자/처리자 알림(DM 만) / 외부 연동 안내(자료 · 주소 · 따라 하기) / 고객사 수 «개사»'); }
// ㊿+201 견적서: 소비자 단가 = 무약정 · 제안 단가 = 약정가 자동(고치면 유지) · V5.0 · MDR 통합은 예전 견적에만
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const q = rd('sat/quote.js'), pdb = (q.match(/const pricingDB = \{[\s\S]*?\n\};/) || [''])[0];
  say(/^function qpPeriod\(db, term, isLumpSum, billingMulti, p\)/m.test(q) && /const list = tier\.prices\['무약정'\] != null/.test(q) && /proposedEl\.dataset\.manual !== 'true'/.test(q) && /^function onProposedInput\(input\)/m.test(q) && /data-input="onProposedInput\(this\)"/.test(q)
    && /^const QP_LEGACY = \{/m.test(q) && /Object\.assign\(\{\}, QP_LEGACY, pricingDB, publicPricingDB\)/.test(q) && !/"Cloud NAC V5\.0"|"Genian MDR 통합"/.test(pdb) && /"Cloud EDR": \{\n {8}type: "yearly",\n {8}tiers: \[\n {12}\{ max: 49, prices: \{ "무약정": 86900/.test(pdb) && /"GIES \(MDR Service\)": \{\n {8}type: "yearly",\n {8}tiers: \[\n {12}\{ max: 49, prices: \{ "무약정": 130200/.test(pdb),
  '㊿+201 견적서: 소비자 단가 = 무약정 · 제안 단가 = 약정가 자동 · GIES = MDR 통합 · Cloud EDR · V5.0/MDR 통합 목록에서 뺌(예전 견적만)'); }
// ㊿+202 견적서 MDR 쪽 서비스 · 부가 서비스: 제안 단가 자동 = 가격표 «최소제안가» 칸(minD · 부가는 3번째 값) · 내장 값에도 min
{ const q = (() => { try { return fs.readFileSync(path.join(ROOT, 'sat/quote.js'), 'utf8'); } catch (e) { return ''; } })(), pdb = (q.match(/const pricingDB = \{[\s\S]*?\n\};/) || [''])[0];
  const svcMin = ['GIES \\(MDR Service\\)', 'MDR Add-on 24×7', 'Cloud EDR', 'GIEA \\(AV Service\\)', 'GIER \\(Ransomware Service\\)', 'GIED \\(Device Control\\)'].every((n) => new RegExp('"' + n + '": \\{\\n {8}type: "yearly",\\n {8}tiers: \\[\\n {12}\\{ max: 49, prices: \\{ "무약정": \\d+, "1년약정": \\d+ \\}, min: \\d+ \\}').test(pdb));
  say(svcMin && /"GIES \(MDR Service\)": \{\n {8}type: "yearly",\n {8}tiers: \[\n {12}\{ max: 49, prices: \{ "무약정": 130200, "1년약정": 130200 \}, min: 97700 \}/.test(pdb) && /const m = Array\.isArray\(s\.minD\) \? s\.minD : \[\];/.test(q) && /if \(qpNum\(a\[2\]\) && a\[2\] > 0\) tr\.min = a\[2\];/.test(q) && /"로그 장기 저장 1TB": \{\n {8}type: "yearly",\n {8}tiers: \[\n {12}\{ max: 9999999, prices: \{ "무약정": 1500000, "1년약정": 1500000 \}, min: 1050000 \}/.test(pdb) && /tier\.min != null \? tier\.min : tier\.prices\[term\] != null/.test(q) && !/min: /.test((pdb.match(/"Cloud NAC V6\.0": \{[\s\S]*?\n {4}\}/) || [''])[0]),
  '㊿+202 견적서 MDR 쪽 서비스 6종 · 부가 서비스 제안 단가 = «최소제안가»(가격표 minD · 부가 3번째 값 · 내장 값 min) · NAC/ZTNA 는 약정가 그대로'); }
// ㊿+202 에스원 설치비 정산: 철거 줄 ↔ 비즈포탈 철거비 · 리포트 계산서 발행일 · 품의일자 = 다음 달 발행일
{ const s1 = (() => { try { return fs.readFileSync(path.join(ROOT, 'sat/s1.js'), 'utf8'); } catch (e) { return ''; } })();
  say(/^function instKind\(r\)\{ return \/철거\|회수\//m.test(s1) && /return b\.kind==='install' \|\| b\.kind==='once';/.test(s1) && /same=biz\.filter\(function\(b\)\{ return b\.kind===want; \}\)/.test(s1) && /tile\('비즈포탈 설치·철거비'/.test(s1)
    && /nx\.setMonth\(nx\.getMonth\(\)\+1\);/.test(s1) && (s1.match(/title:title, date:tax, contact:''/g) || []).length === 2 && !/date:today, contact/.test(s1) && /work:x\.work\|\|''/.test(s1),
  '㊿+202 에스원 설치비 정산: 철거 줄 ↔ 비즈포탈 철거비(같은 종류끼리 자동 · 목록에 철거비) · 리포트 계산서 발행일 · 품의일자 = 다음 달 발행일'); }
// ㊿+203 외부 연동 «API 문서»(Swagger 형식) · 시험 호출 · openapi.json · export v1.2 — 명세(js/apispec.js)와 함수가 같은 조건 · 칸
try {
  const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const { openapiText } = await import('./openapi.mjs'); const want = await openapiText(ROOT);
  say(want === rd('openapi.json'), 'openapi.json = js/apispec.js 로 만든 것 (다르면 node tests/openapi.mjs)');
  const spec = await import(pathToFileURL(path.join(ROOT, 'js/apispec.js')).href), fn = rd('supabase/functions/export/index.ts');
  const arr = (name) => { const m = new RegExp('export const ' + name + ' = \\[([^\\]]*)\\]').exec(fn); return m ? [...m[1].matchAll(/'([\w]+)'/g)].map((x) => x[1]) : null; };
  const allow = (tbl) => { const m = new RegExp("getList\\('" + tbl + "', \\w+, '[^']+', p, key, \\[([^\\]]*)\\], \\['(\\w+)'").exec(fn); return m ? [...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1]).concat([m[2]]) : null; };
  const qn = (id) => spec.apiRes(id).q.map((q) => q.n).filter((n) => !['limit', 'offset', 'format'].includes(n)).sort().join(',');
  const fnm = (id) => spec.apiRes(id).f.map((f) => f[0]);
  const same = (a, b) => a && b && a.slice().sort().join(',') === b.slice().sort().join(',');
  const bad = [];
  if (!same(fnm('contracts'), (arr('CT_COLS') || []).concat(['customer', 'line_label']))) bad.push('contracts 칸');
  if (!same(fnm('poc'), (arr('POC_COLS') || []).concat(['modules']))) bad.push('poc 칸');
  if (!same(fnm('orders'), arr('ORD_COLS'))) bad.push('orders 칸');
  if (!same(fnm('assets'), arr('AST_COLS'))) bad.push('assets 칸');
  [['poc', 'mdr_ops'], ['orders', 'equipment_orders'], ['assets', 'equipment_assets']].forEach(([id, tbl]) => { const a = allow(tbl); if (!a || a.slice().sort().join(',') !== qn(id)) bad.push(id + ' 조건 ' + (a || []).join('·') + ' ≠ ' + qn(id)); });
  [['contracts', ['updated_since', 'line', 'status']], ['revenue', ['from', 'to', 'contract_id']], ['mrr', ['month', 'from', 'to']], ['customers', []]].forEach(([id, ns]) => { if (qn(id) !== ns.slice().sort().join(',') || !ns.every((n) => fn.includes("'" + n + "'"))) bad.push(id + ' 조건'); });
  if (!same(spec.API_RES.map((r) => r.id), arr('RESOURCES'))) bad.push('자료 목록');
  say(!bad.length, '명세(js/apispec.js) ↔ export 함수: 자료 7개 · 조건 · 내보내는 칸이 같음' + (bad.length ? ' — 다름: ' + bad.join(' / ') : ''));
  const ad = rd('js/admin.js');
  say(/export const VERSION = 'export v1\.2';/.test(fn) && /^export function corsOf\(req: Request\)/m.test(fn) && /one\('is_super_admin'\), one\('mfa_ok'\)/.test(fn) && /if \(!corsOf\(req\)\['Access-Control-Allow-Origin'\]\) \{ status = 401;/.test(fn) && /'Access-Control-Allow-Headers': 'x-api-key, authorization, apikey, x-client-info, x-svc-names'/.test(fn)
    && /^export async function apidTry\(id\)/m.test(ad) && /h\['X-API-Key'\]=k;/.test(ad) && /h\.Authorization='Bearer '\+ST\.SB_TOKEN;/.test(ad) && /'curl -H "X-API-Key: <받은 키>" "'\+u/.test(ad) && !/apidUrl[^\n]*APID\.key/.test(ad) && /key\.value=APID\.key\|\|'';/.test(ad)
    && /data-apitab=/.test(ad) && /js\/apispec\.js/.test(rd('index.html')) && /'\.\/js\/apispec\.js'/.test(rd('sw.js')),
  '㊿+203 API 문서: 시험 호출(내 로그인 Bearer · 발급 키 X-API-Key) · 키는 주소 · 예시 코드에 안 넣음 · export v1.2(포탈 출처만 CORS · 로그인은 슈퍼 관리자 + 2단계 인증)');
} catch (e) { say(false, '㊿+203 API 명세 검사를 못 함 — ' + String(e.message || e).slice(0, 160)); }
// ㊿+204 시작이 멈추지 않음 — 로그인 연장 · 2단계 인증 확인 · 로그인 요청에 시간 제한 · 단계 표시 · 20초 새로고침 안내(첫 화면 HTML · CSS)
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const co = rd('js/core.js'), sh = rd('js/shell.js'), css = rd('app.css');
  const rs = (co.match(/export async function restoreSess\(\)\{[\s\S]*?\n\}/) || [''])[0];
  say(/fetchT\(SB_URL\+'\/auth\/v1\/token\?grant_type=refresh_token'[\s\S]*?15000, '로그인 서버', true\)/.test(rs) && /x\.boot='auth'; throw x;/.test(rs) && !/await fetch\(/.test(rs)
    && /var r=await fetchT\(SB_URL\+'\/auth\/v1\/'\+path,/.test(co) && /fetchT\(SB_URL\+'\/rest\/v1\/rpc\/mfa_status'/.test(co) && !/await fetch\(SB_URL\+'\/auth\/v1\/token\?grant_type=(refresh_token|password)'/.test(co + sh)
    && /bootStage\('auth'\); bootWatch\(\);/.test(sh) && /^export function onErr\(e\)/m.test(sh) && /<a class="pill" href="">새로고침<\/a>/.test(sh) && /logClientError\('\[느린 시작\] '/.test(sh)
    && /<div id="loading" class="loading">[\s\S]*?class="ld-slow"[\s\S]*?<a href="">새로고침<\/a>/.test(html) && /\.loading \.ld-slow\{visibility:hidden;[^}]*animation:ldSlow 0s linear 20s forwards\}/.test(css) && /@keyframes ldSlow\{to\{visibility:visible\}\}/.test(css),
  '㊿+204 시작 멈춤 방지: 로그인 연장(15초 · 실패해도 로그인 유지 · 이유 + 새로고침) · 인증 서버 · 2단계 정책 · 로그인 요청 시간 제한 · 단계 · 초 표시 · 20초 새로고침 안내(HTML · CSS) · 느린 시작 기록'); }
// ㊿+205 성능: 비슷한 이름 후보 쌍(dcSimPairs) · 홈/알림함 요약 한 번(dcRulesQuick) · 포탈↔DB 대조 id 표 · 해지율 대상 규칙 한 번(crBase) · 폭 재기 rAF
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const an = rd('js/analysis.js'), sh = rd('js/shell.js'), nt = rd('js/notify.js'), sa = rd('js/sales.js'), hm = rd('js/home.js');
  const sim = (an.match(/export function dcSimilar\(CU\)\{[\s\S]*?\n\}/) || [''])[0];
  say(/^export function dcSimPairs\(K\)/m.test(an) && /var P=dcSimPairs\(S\.map/.test(sim) && !/for\(var j=i\+1;j<S\.length;j\+\+\)/.test(sim) && /^export function dcRulesQuick\(\)/m.test(an) && /dcRulesQuick\(\)\.forEach/.test(sh) && /dcRulesQuick\(\)\.filter/.test(nt)
    && /var rwById=null;/.test(an) && /^export function crBase\(\)/m.test(sa) && /return crBase\(\)\.filter/.test(sa) && /SBW\.n\+\+;/.test(sh) && /requestAnimationFrame\(function\(\)\{ if\(tabs\.scrollWidth>tabs\.clientWidth\+1/.test(hm),
  '㊿+205 성능: 비슷한 이름 후보 쌍만 · 홈/알림함 데이터 점검 요약 한 번 · 만기 대조 id 표 · 해지율 대상 규칙 한 번 · 위 메뉴 폭 재기는 그리기 직전'); }
// ㊿+206 사용 설명서 · 운영자 매뉴얼 — js/help.js(화면 · 처음 열 때) · js/helpdata.js(내용 · 찾기) · 더보기 «사용 설명서» · ❔ = 그 화면 · AI 사용법 질문에 설명서 항목
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const HD = await import(pathToFileURL(path.join(ROOT, 'js/helpdata.js')).href), hs = rd('js/help.js'), hsrc = rd('js/helpdata.js');
  const ids = HD.HELP.map((h) => h.id), views = new Set([...html.matchAll(/data-v="([a-z0-9]+)"/g)].map((m) => m[1]).concat(['area']));
  const bad = [];
  ids.forEach((x, i) => { if (ids.indexOf(x) !== i) bad.push('겹친 id ' + x); });
  HD.HELP.forEach((h) => { if (h.v && !views.has(h.v)) bad.push(h.id + ' 메뉴 키 ' + h.v); (h.see || []).forEach((x) => { if (!ids.includes(x)) bad.push(h.id + ' → ' + x); }); if (h.g === 'ops' && h.role !== 'super') bad.push(h.id + ' 운영자 매뉴얼인데 super 아님'); });
  Object.entries(HD.HELP_VIEW_MAP).forEach(([k, v]) => { if (!views.has(k) || !ids.includes(v)) bad.push('HELP_VIEW_MAP ' + k); });
  /* «…» 안 이름(버튼 · 메뉴 · 탭 글자)이 지금 코드 · 화면에 있는지 — 화면을 고치고 설명서를 안 고치면 여기서 걸림 */
  const corpus = [html, ...fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js') && !/^(helpdata|upd)\.js$/.test(f)).map((f) => rd('js/' + f)),
    ...fs.readdirSync(path.join(ROOT, 'sat')).filter((f) => f.endsWith('.js')).map((f) => rd('sat/' + f)), ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html') && f !== 'index.html').map((f) => rd(f))].join('\n');
  [...new Set([...hsrc.matchAll(/«([^»]{2,40})»/g)].map((m) => m[1]))].forEach((q) => { if (!corpus.includes(q)) bad.push('화면에 없는 이름 «' + q + '»'); });
  if (/(sb_secret_|sbp_[0-9a-f]{8}|xox[bpa]-\d|ghp_[A-Za-z0-9]{10}|sk-or-v1|eyJhbGciOi)/.test(hsrc)) bad.push('비밀값 모양');
  if (/^import /m.test(hsrc)) bad.push('helpdata.js 가 다른 파일을 부름');
  say(!bad.length && /help:function\(\)\{ return import\('\.\/help\.js'\); \}/.test(rd('js/lazy.js')) && /js\/helpdata\.js,js\/help\.js/.test(html) && /'\.\/js\/helpdata\.js', '\.\/js\/help\.js'/.test(rd('sw.js'))
    && /id="btnHelp"/.test(html) && /\['btnHelp','btnViewReset','btnReload','btnFont','btnTheme'\]/.test(jsAll) && /export function helpGo\(v\)\{\n  lazyLoad\('help'\)/.test(rd('js/grid.js'))
    && /getElementById\('dvHelp'\); if\(b\) b\.addEventListener\('click', function\(\)\{ helpGo\(ST\.CUR_VIEW\); \}\)/.test(rd('js/init.js')) && /question:aiHelpAdd\(/.test(rd('js/ai.js')) && /^export function helpOpen\(idOrView\)/m.test(hs) && /^export function helpCan\(h\)/m.test(hs),
  '㊿+206 사용 설명서: 항목 ' + ids.length + '개 · 메뉴 키 · 함께 보기 · 운영자 매뉴얼 = 슈퍼 관리자 · «…» 이름이 화면에 있음 · 비밀값 없음 · 처음 열 때 받음(lazy · app-js · sw) · 더보기 첫 줄 · ❔ = 그 화면 · AI 사용법 질문에 붙임' + (bad.length ? ' — ' + bad.slice(0, 8).join(' / ') : '')); }
// ㊿+207 MDR 정식 발주(EDR 발주요청서) — 같은 화면 «신청 구분» · 정식 발주만 새 칸(SQL 122) · 상태 «발주요청» · 현황 열은 DB 에 그 칸이 있을 때만 저장
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const sa = rd('js/sales.js'), gs = rd('js/grids.js'), gr = rd('js/grid.js');
  const sub = (sa.match(/export async function submitMdrPoc\(\)\{[\s\S]*?\n\}/) || [''])[0];
  say(/<select id="mpKind"><option value="poc">PoC · 데모<\/option><option value="order">정식 발주<\/option><\/select>/.test(html) && /id="mpContract"/.test(html) && /id="mpBiz"/.test(html) && /id="mpFirst"/.test(html) && /data-v="mdrnew">[^<]*PoC · 발주 신청</.test(html)
    && /status: ord\? '발주요청' : '신청'/.test(sub) && /if\(ord\) Object\.assign\(row, \{req_kind:'order', contract_no:cno\|\|null, biz_kind:biz, mod_first:/.test(sub) && /SQL 122 를 먼저/.test(sub) && /ICT지원사업 정식 발주는 계약번호가 필요합니다/.test(sub)
    && /reqIf:\{mpContract:\['계약번호'/.test(sa) && /D\.reqIf\[id\]\[1\]\(\)/.test(sa) && /\{k:'contract_no',l:'계약번호',ifCol:true\}/.test(gs) && /opts:\['발주요청','신청','대기','진행중','데모',(?:'발주전환',)?'구독','종료'\]/.test(gs) && /if\(c\.ifCol && !gridHasCol\(g, c\.k\)\) return;/.test(gr),
  '㊿+207 MDR 정식 발주: 신청 구분(PoC · 데모 / 정식 발주) · 계약번호(ICT지원사업만 꼭) · 사업 구분 · 초동조치 · 상태 «발주요청» · PoC 는 새 칸 안 보냄 · SQL 122 전 안내 · 현황 새 칸은 DB 에 있을 때만 저장'); }
// ㊿+208 «임대 장비 신청» → «Cloud NAC 발주» · 위 메뉴 «발주» 묶음 · 장비 = 대시보드 · 현황 · 예전 메뉴 설정 옮기기
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const nav = (html.match(/<div class="grp">발주<\/div>[\s\S]*?<div class="grp">영업<\/div>/) || [''])[0], tl = rd('js/tools.js'), sh = rd('js/shell.js');
  const ui = [html, ...fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js') && !/^(upd|helpdata)\.js$/.test(f)).map((f) => rd('js/' + f))].join('\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');
  say(/data-v="ordernew">[^<]*Cloud NAC 발주 신청<\/button>\s*<button data-v="orders">[^<]*Cloud NAC 발주 내역<\/button>\s*<button data-v="mdrnew">[^<]*MDR PoC · 발주 신청<\/button>\s*<button data-v="mdrops">[^<]*MDR 운영·신청 현황<\/button>\s*<div class="grp">장비<\/div>\s*<button data-v="eqboard">[^<]*장비 대시보드<\/button>\s*<button data-v="assets">[^<]*임대 장비 현황<\/button>/.test(nav)
    && !/<div class="grp">PoC·데모<\/div>/.test(html) && !/'g:PoC·데모':/.test(sh) && /var old208=/.test(tl) && /conf\.m208=1/.test(tl) && !/임대 장비 신청|'장비 신청'/.test(ui),
  '㊿+208 발주 묶음: Cloud NAC 발주 신청 · 내역 · MDR PoC · 발주 신청 · MDR 운영·신청 현황 → 장비(대시보드 · 임대 장비 현황) · PoC·데모 묶음 없음 · 예전 설정 옮김(한 번만) · 화면 글자에 «임대 장비 신청» · «장비 신청» 없음'); }
// ㊿+209 운영 감시(선택 · 기본 꺼짐) — watch 함수(자동 = 일회용 번호 · 포탈 = 슈퍼 관리자 · 서비스 키 거절 · 지금 점검은 Slack 안 보냄) · 포탈 «운영 감시» · 알림함 · 배포 뒤 확인
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const wf = rd('supabase/functions/watch/index.ts'), ad = rd('js/admin.js'), nt = rd('js/notify.js');
  say(!!wf && /if \(typeof body\.cron === 'string'\)/.test(wf) && /used_at=is\.null&created_at=gt\./.test(wf) && /서비스 키로 부르는 점검은 받지 않습니다/.test(wf) && /rpc\/is_super_admin/.test(wf)
    && /const slack = kind === 'manual' \? null : await slackDecide/.test(wf) && /if \(set\.slack_on !== true\) return 'off';/.test(wf) && /ns\.slack_on !== true/.test(wf) && /method: 'OPTIONS'/.test(wf) && !/SUPABASE_SERVICE_ROLE_KEY'\) \|\| '[^']/.test(wf)
    && /deno run -A tests\/fn\/watch\.test\.ts/.test(rd('package.json')) && fs.existsSync(path.join(ROOT, 'tests/fn/watch.test.ts'))
    && /^export function opsWatchHtml\(\)/m.test(ad) && /var h=opsWatchHtml\(\)\+tpl`/.test(ad) && /watchCall\(\{mode:'run'\}\)/.test(ad) && /if\(promote\) dwStart\(expV, prevV\);/.test(ad) && /watchCall\(\{mode:'deploy', expect:ver\}/.test(ad)
    && /^export function watchItems\(\)/m.test(nt) && /w\.set\.inbox_on===false/.test(nt) && /await watchLoad\(\);/.test(nt),
  '㊿+209 운영 감시: watch 함수(자동은 일회용 번호 · 포탈은 슈퍼 관리자 · 서비스 키 거절 · 지금 점검 Slack 없음 · Slack 은 감시 · «Slack 사용» 둘 다 켜야 · 함수는 OPTIONS 만) · 함수 시험 · 기록 탭 «운영 감시» · 알림함(설정 따라) · 승격 뒤 자동 확인'); }
// ㊿+210 프로젝트 리포트 NO.(영업현황 등록번호) = 여러 줄 글 칸(줄바꿈 그대로 · 길면 다음 줄 · 인쇄 한 장) · 계약일자 · 수금일자 칸 넓힘 · 메뉴 이름에 숫자 배지 안 붙음
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const rh = rd('report.html'), rc = rd('sat/report.css'), rj = rd('sat/report.js'), co = rd('js/core.js');
  say(/<div class="no"><span>NO\.<\/span><textarea data-k="no" rows="1"/.test(rh) && !/<input data-k="no"/.test(rh) && /<col style="width:29\.4%"><col style="width:32\.6%"><col style="width:27%"><col style="width:11%">/.test(rh) && (rh.match(/<td class="bold dt"><input class="ctr" type="date" data-k="(?:cdate|paydate)">/g) || []).length === 2
    && /\.no textarea \{[^}]*white-space: pre-wrap/.test(rc) && /\.page \.no\.long textarea \{ font-size: 9px/.test(rc) && /field-sizing: content/.test(rc) && /^function fitTa\(\)/m.test(rj) && /classList\.toggle\('long'/.test(rj)
    && /b\.querySelector\('\.rpb-cnt,\.rb,\.gn-bd'\)/.test(co),
  '㊿+210 프로젝트 리포트: NO. 여러 줄(줄바꿈 그대로 · 길면 다음 줄 · 3줄 넘으면 인쇄 글자 작게 · 한 장) · 계약일자 · 수금일자 칸 넓힘(달력 단추 작게) · 메뉴 이름에 숫자 배지(리포트1) 안 붙음'); }
// ㊿+210 MDR PoC · 데모 → 정식 발주 전환(행 «발주 전환» → 신청 화면 채움 → 정식 발주 새 행(src_id · SQL 124) → Slack 은 정식 발주와 같게(INSERT 웹훅) · PoC = «발주전환»)
{ const rd = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  const sa = rd('js/sales.js'), gr = rd('js/grid.js'), gs = rd('js/grids.js'), rp = rd('js/report.js');
  say(/^export function mpConvert\(r\)/m.test(sa) && /^export function mpCanConv\(r\)\{ return !!r && \('req_kind' in r\) && r\.req_kind!=='order' && r\.status!=='발주전환' && !mpConvOf\(r\); \}/m.test(sa)
    && /if\(conv\) \/\*\* @type \{any\} \*\/\(row\)\.src_id=conv\.id;/.test(sa) && /sbWrite\('PATCH','mdr_ops\?id=eq\.'\+conv\.id,\{status:'발주전환'\}\)/.test(sa) && /mdr_ops_src_uniq/.test(sa) && /noLink=true; return ins\(\);/.test(sa)
    && /mpCanConv\(r\) && canView\('mdrnew'\)/.test(gr) && /bo\.dataset\.act='toOrder'/.test(gr) && /mpConvClear\(\); wzReset\('mp'\);/.test(gr)
    && /chipsOpts:\['발주요청','신청','대기','진행중','데모','발주전환','구독','종료'\]/.test(gs) && /'PoC → 발주 #'\+o\.id/.test(gs)
    && (rp.match(/x\.req_kind!=='order'/g) || []).length === 2 && /<div id="mpConv" class="mp-conv" role="status" hidden>/.test(html),
  '㊿+210 MDR 발주 전환: PoC 행 «발주 전환»(구분 칸 있을 때 · 전환 안 된 PoC · 보기 권한) → 신청 화면 채움 · 정식 발주 고정 → 새 행 src_id(두 번 안 됨 · SQL 124 전엔 연결 없이) → PoC «발주전환» · 리포트 PoC 표에 정식 발주 안 셈'); }
// ㊿+211 MDR 정식 발주 양식 — ICT지원사업(초동조치 · EDR 발주요청서(ICT지원사업)) / 일반(EDR+MDR 발주요청서 · PoC 와 같은 모듈)
{ const sa = fs.readFileSync(path.join(ROOT, 'js/sales.js'), 'utf8');
  say(/<label class="mpchk mp-ord mp-ict"><input id="mpFirst"/.test(html) && /^export function mpIsIct\(\)/m.test(sa) && /mod_first:biz==='ICT지원사업' && \$\('#mpFirst'\)\.checked/.test(sa) && /mpIsIct\(\)\? \[\['mpAv','EDR\(백신\)'\],\['mpRansom','EDR\(안티랜섬웨어\)'\],\['mpMedia','매체제어'\],\['mpFirst','초동조치'\]\]/.test(sa) && /<label class="mpchk mp-noict"><input id="mpEdr"/.test(html) && /data-ict="EDR\(백신\)"/.test(html) && /if\(ord && biz==='ICT지원사업'\) row\.mod_edr=false;/.test(sa) && /\['mpEdr','mpWin','mpLinux','mpMac','mpWebui','mpNac'\]/.test(sa) && /EDR\+MDR 발주요청서 — 정식 발주/.test(sa),
  '㊿+211~212 MDR 정식 발주 양식: ICT = EDR(백신) · EDR(안티랜섬웨어) · 매체제어 · 초동조치(EDR+MDR 없음) · 일반 · PoC = EDR+MDR · 안티바이러스 · 안티랜섬웨어 · 매체제어 · Web UI 이메일 → NAC 순서 · 초동조치 = ICT지원사업만(화면 · 요약 · 저장) · 제목 ICT «EDR 발주요청서(ICT지원사업)» / 일반 «EDR+MDR 발주요청서»'); }
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
/* ㊿+182 날짜는 한국 기준 — new Date().toISOString().slice(0,10) 은 UTC 라 아침 9시 전엔 «어제» (todayStr() 를 쓸 것 · 위성 페이지는 localYmd) */
{ const utc = [];
  for (const f of [...fs.readdirSync(path.join(ROOT, 'js')).map((x) => 'js/' + x), ...(fs.existsSync(path.join(ROOT, 'sat')) ? fs.readdirSync(path.join(ROOT, 'sat')).map((x) => 'sat/' + x) : [])].filter((x) => x.endsWith('.js'))) {
    fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').forEach((l, i) => { if (/new Date\(\)\.toISOString\(\)\.slice\(0,\s*(7|10)\)|Date\.now\(\)\+9\*3600e3\)\.toISOString\(\)\.slice/.test(l)) utc.push(f + ':' + (i + 1)); }); }
  say(!utc.length, '오늘 날짜는 한국 기준(todayStr) — UTC 날짜(toISOString().slice(0,10)) 없음' + (utc.length ? ' — ' + utc.slice(0, 6).join(', ') : '')); }
/* ㊿+182 단위 시험(tests/unit.mjs · 순수 함수 · 1초) */
if (fs.existsSync(path.join(ROOT, 'tests', 'unit.mjs'))) {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', path.join(ROOT, 'tests', 'unit.mjs')], { encoding: 'utf8', cwd: ROOT, timeout: 60000 });
  const n = /# pass (\d+)/.exec(r.stdout || '') ? +/# pass (\d+)/.exec(r.stdout)[1] : null;
  say(r.status === 0, '단위 시험(tests/unit.mjs)' + (r.status === 0 ? '' : ' 실패 — ' + ((r.stdout || '') + (r.stderr || '')).split('\n').filter((l) => /not ok|Error|expected|actual|✖/.test(l)).slice(0, 8).join(' | ')) + (n != null ? ' · ' + n + '개' : ''));
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n정적 검사 실패 ${fail}건` : '\n정적 검사 통과');
process.exit(fail ? 1 : 0);
