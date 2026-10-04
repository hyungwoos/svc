// 정적 검사 — 모든 HTML 의 <script> 블록 문법 · APP_VER 형식 · 비밀값/실데이터 유출 휴리스틱 · 필수 파일 존재
// 실행: node tests/check.mjs   (브라우저 불필요 · 1초)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'svc-check-'));
let fail = 0; const say = (ok, m) => { console.log((ok ? '  ✓ ' : '  ✗ ') + m); if (!ok) fail++; };

const htmls = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
say(htmls.includes('index.html'), 'index.html 존재');
for (const f of htmls) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const blocks = [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((b) => b.trim());
  let bad = 0;
  blocks.forEach((b, i) => { const p = path.join(tmp, `${f}.${i}.js`); fs.writeFileSync(p, b); const r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' }); if (r.status !== 0) { bad++; console.log('    ' + r.stderr.split('\n').slice(0, 3).join(' | ')); } });
  say(bad === 0, `${f}: 스크립트 ${blocks.length}블록 문법${bad ? ` — 오류 ${bad}` : ''}`);
  // 비밀값 휴리스틱: 서비스 키 JWT · sbp_ · github_pat · xoxb · sk-ant
  const leak = /(service_role|sb_secret_[A-Za-z0-9_]{8,}|sbp_[a-f0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xoxb-[0-9A-Za-z-]{10,}|sk-ant-[A-Za-z0-9_-]{20,})/.exec(src);
  say(!leak, `${f}: 비밀값 패턴 없음${leak ? ` — «${leak[1].slice(0, 24)}…»` : ''}`);
}
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
// ④ 아키텍처 2단계(㊿+136): 버전은 <meta name="app-ver">, 코드 목록은 <meta name="app-js"> — js/boot.js(head) · js/load.js(body 끝) 가 읽어 ?v= 로 로드. 인라인 <script>/onclick 없음 → CSP script-src 에 'unsafe-inline' 없음
const ver = /<meta name="app-ver" content="(\d{4}-\d{2}-\d{2} ㊿\+\d+)">/.exec(html);
say(!!ver, `APP_VER 형식(meta app-ver) ${ver ? ver[1] : '(없음)'}`);
const jsMeta = /<meta name="app-js" content="([^"]+)">/.exec(html); const JS_LIST = jsMeta ? jsMeta[1].split(',').map((x) => x.trim()) : [];
say(JS_LIST.length >= 10 && JS_LIST[JS_LIST.length - 1] === 'js/init.js', `app-js 목록 ${JS_LIST.length}개 · 마지막 js/init.js`);
say(/<script src="js\/boot\.js"><\/script>/.test(html) && /<script src="js\/load\.js"><\/script>/.test(html), 'index.html 이 js/boot.js(head) · js/load.js(body 끝)만 로드');
say(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'index.html 에 인라인 <script> 없음');
say(!/ on[a-z]+="/.test(html), 'index.html 에 인라인 on* 핸들러 없음');
const cspIdx = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
say(!!cspIdx && !/script-src[^;]*'unsafe-inline'/.test(cspIdx[1]), "index.html CSP script-src 에 'unsafe-inline' 없음");
const JS_FILES = ['js/boot.js', 'js/load.js'].concat(JS_LIST);
let jsAll = '';
for (const f of JS_FILES) {
  const p = path.join(ROOT, f); say(fs.existsSync(p), `${f} 존재`);
  if (!fs.existsSync(p)) continue;
  const r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' }); say(r.status === 0, `${f}: 문법${r.status ? ' — ' + r.stderr.split('\n').slice(0, 2).join(' | ') : ''}`);
  const src = fs.readFileSync(p, 'utf8'); jsAll += '\n' + src;
  const leak = /(service_role|sb_secret_[A-Za-z0-9_]{8,}|sbp_[a-f0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xoxb-[0-9A-Za-z-]{10,}|sk-ant-[A-Za-z0-9_-]{20,})/.exec(src); if (leak) say(false, `${f}: 비밀값 패턴 — «${leak[1].slice(0, 20)}…»`);
}
say(fs.existsSync(path.join(ROOT, 'app.css')), 'app.css 존재');
const bootSrc = fs.existsSync(path.join(ROOT, 'js/boot.js')) ? fs.readFileSync(path.join(ROOT, 'js/boot.js'), 'utf8') : '';
say(/^var APP_VER=/m.test(bootSrc) && !(/^\s*var APP_VER=/m.test(jsAll.replace(bootSrc, ''))), 'APP_VER 정의는 js/boot.js 한 곳뿐');
// 선언 파일에는 즉시 실행 문장이 없어야 함(= init.js 로만) — 간단 휴리스틱: 파일 맨 왼쪽에서 시작하는 줄이 function/var/주석/닫는 괄호가 아니면 경고
for (const f of JS_LIST) { if (f === 'js/init.js' || f === 'js/viz.js' || !fs.existsSync(path.join(ROOT, f))) continue; const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n'); const bad = lines.filter((l) => /^[A-Za-z$_(\[]/.test(l) && !/^(function|async function|var|let|const)\b/.test(l)); if (bad.length) say(false, `${f}: 즉시 실행으로 보이는 최상위 줄 ${bad.length} — ${bad[0].slice(0, 60)}`); }
// sw.js 의 SHELL 이 코드 파일을 전부 품는지
const sw = fs.existsSync(path.join(ROOT, 'sw.js')) ? fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8') : '';
say(JS_FILES.every((f) => sw.includes("'./" + f + "'")), 'sw.js SHELL 에 코드 파일 전부 포함');
// 중복 최상위 선언(함수가 두 파일에 있으면 나중 것이 덮어씀) 검사
{ const seen = new Map(), dup = []; for (const f of JS_LIST) { if (!fs.existsSync(path.join(ROOT, f))) continue; const src = fs.readFileSync(path.join(ROOT, f), 'utf8'); for (const m of src.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) { if (seen.has(m[1])) dup.push(m[1] + '(' + seen.get(m[1]) + '·' + f + ')'); seen.set(m[1], f); } } say(!dup.length, `최상위 함수 이름 중복 없음${dup.length ? ' — ' + dup.slice(0, 5).join(', ') : ''}`); }
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
const sris = [...idx.matchAll(/sri:'([^']+)'/g)].map((m) => m[1]);
say(sris.length >= 5 && sris.every((h) => /^sha384-[A-Za-z0-9+/]{64}$/.test(h)), `index.html: SRI 해시 ${sris.length}개 형식 OK`);
for (const f of ['kk.html', 's1.html']) if (htmls.includes(f)) { const t = fs.readFileSync(path.join(ROOT, f), 'utf8'); say(/sc\.integrity=sri/.test(t) && /sha384-/.test(t), `${f}: 엑셀 로더에 integrity`); }
say((idx.match(/mfaGate\(/g) || []).length >= 4, 'index.html: MFA 관문(mfaGate) 이 로그인·세션 복원 경로에 연결됨');
// ③ 데이터 정합성 (㊿+137): 코드 목록 — 포탈 CODE_KIND 의 모든 종류가 *_OPTS 배열로 존재 · GRIDS 에 상태/채널/모델 리터럴 배열이 남아 있지 않음(한 목록을 봐야 함) · 코드 관리 UI 마크업
{
  const ck = /var CODE_KIND=\{([\s\S]*?)\};/.exec(jsAll); const kinds = ck ? [...ck[1].matchAll(/(\w+):'(\w+)'/g)] : [];
  say(kinds.length >= 12 && kinds.every((m) => new RegExp('^var ' + m[2] + '=\\[', 'm').test(jsAll)), `코드 목록: CODE_KIND ${kinds.length}종 모두 *_OPTS 배열 있음`);
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
  say(/^\s+functions:/m.test(y) && /setup-deno/.test(y) && /needs:\s*\[test, functions\]/.test(y), 'deploy.yml: functions 잡(deno) 이 있고 deploy 가 test·functions 둘 다 기다림');
  say(fs.existsSync(path.join(ROOT, 'README.md')), 'README.md 존재 (사이트 배포에서는 *.md 제외)');
} else if (!fs.existsSync(path.join(ROOT, 'README.md'))) warn('README.md 가 저장소 루트에 없음');
// ⑤ UX 2단계 · ⑥ AI 2단계 (㊿+139)
{ const init = fs.readFileSync(path.join(ROOT, 'js/init.js'), 'utf8');
  say(/function ovlInit\(/.test(jsAll) && /function ovlDismiss\(/.test(jsAll) && /^ovlInit\(\);/m.test(init) && init.indexOf('ovlInit();') < init.lastIndexOf('boot();') && /ovlDismiss\(top\)/.test(init), 'UX(㊿+141): 창 바깥 클릭 닫기·입력 중 확인·초점 관리(ovlInit) 가 init.js 에서 boot() 전에 등록됨 · Esc 도 ovlDismiss');
  say(/ovlMarkClean\(\)/.test(jsAll.slice(jsAll.indexOf('async function sbWrite('), jsAll.indexOf('async function sbWrite(') + 2500)), 'UX(㊿+141): 저장 성공(sbWrite) 뒤 «입력 중» 표시 지움');
  say(/h\.status>=500\) throw/.test(jsAll), '데이터 로드: 서버 오류(5xx)를 빈 목록으로 넘기지 않음(sbAll)');
  say(/function opsTgtHtml\(/.test(jsAll) && /\.rn-tbl td\.wrap\{/.test(fs.readFileSync(path.join(ROOT, 'app.css'), 'utf8')), '배포·운영 기록: 긴 파일 목록 접기 · 줄바꿈(카드 밖 넘침 방지)'); }
{ /* ㊿+142: 글자 크기는 7단계만 (주간회의 확대·전체 화면 · 폰 입력칸 16px · 24px 이상 큰 숫자 · 차트 viz.js 는 예외) */
  const STEP = new Set(['11', '12', '12.5', '13.5', '15', '18', '22']); const off = [];
  /* 실제로 불러오는 파일만(meta app-js 목록) — 저장소에 남은 옛 js/app.js 같은 안 쓰는 파일은 제외 */
  const used = ((/name="app-js" content="([^"]+)"/.exec(html) || [])[1] || '').split(',').map((x) => x.trim()).filter((x) => x && !/viz\.js$/.test(x) && fs.existsSync(path.join(ROOT, x)));
  const src = [['app.css', fs.readFileSync(path.join(ROOT, 'app.css'), 'utf8')], ['index.html', html]].concat(used.map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));
  if (fs.existsSync(path.join(ROOT, 'js', 'app.js')) && !used.includes('js/app.js')) warn('js/app.js 는 ㊿+136 부터 안 쓰는 옛 파일 — 지워도 됨(공개 사이트에 그대로 올라가 있음)');
  for (const [f, t] of src) t.split('\n').forEach((ln, i) => { if (/data-zoom|:fullscreen|#viewLogin input\{height:42px;font-size:16px/.test(ln)) return; for (const m of ln.matchAll(/font-size:\s*([0-9.]+)px/g)) { if (+m[1] < 24 && !STEP.has(m[1])) off.push(f + ':' + (i + 1) + ' ' + m[1] + 'px'); } });
  say(!off.length, '글자 크기 7단계(11·12·12.5·13.5·15·18·22 + 큰 숫자) 밖 값 없음' + (off.length ? ' — ' + off.slice(0, 6).join(', ') : ''));
  say(/function colwApply\(/.test(jsAll) && /colwApply\(t, CUR_VIEW\)/.test(jsAll) && /\.dgrid\.colw-fixed\{table-layout:fixed\}/.test(fs.readFileSync(path.join(ROOT, 'app.css'), 'utf8')), '표 열 너비 조절(colw) 연결');
  say(/class="subgrp" data-sub="Cloud NAC"/.test(html) && (html.match(/class="grp"[^>]*>사업 영역</g) || []).length === 1 && /function menuConfMigrate\(/.test(jsAll), '메뉴: «사업 영역» 한 그룹 + 소제목 · 예전 메뉴 편집 설정 옮김');
  say(!/class="pill"[^>]*style="[^"]*background:var\(--(s1|brand)\)[^"]*color:#fff/.test(html + jsAll), '버튼: 주요 버튼을 style 로 칠하지 않음(class="pill pri")'); }
say(/id="dvHelp"/.test(html) && /id="ovlKeys"/.test(html) && /function askScreenHelp\(/.test(jsAll) && /function dvCapRender\(/.test(jsAll) && /function gridActPad\(/.test(jsAll), 'UX: ❔ 화면 도움말 · 단축키 창 · 설명 접기 · 동작 열 여백 코드 있음');
say(/function aiFeedback\(/.test(jsAll) && /ai_feedback/.test(jsAll) && /function aiqHtml\(/.test(jsAll) && /ai_check_log/.test(jsAll), 'AI: 👍/👎 피드백 · 점검 추이 코드 있음');
say(/\^ai_feedback\\b\|\^ai_check_log\\b/.test(jsAll), 'permWriteGuard 예외에 ai_feedback·ai_check_log');
// ② 보안 마무리 (㊿+140): 견적 Worker v2 — 팀 공용 비밀번호 제거 · 포탈 로그인 토큰
{
  const satQ = htmls.includes('quote.html') ? fs.readFileSync(path.join(ROOT, 'quote.html'), 'utf8') : '';
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
