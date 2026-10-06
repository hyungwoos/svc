// tests/lint.mjs — 정적 검사(ESLint) + 모듈 연결 검사 (㊿+147 · ㊿+153 ES 모듈)
//   · js/*.js 는 ES 모듈 — 다른 파일 이름은 import 로만. 여기서 확인하는 것:
//     ① import 한 이름이 그 파일에 실제로 export 돼 있음 · 안 쓰는 import 없음 · 같은 이름을 두 파일이 export 하지 않음(window.SVC 가 한 줄로 모음)
//     ② 처음 열 때 불러오는 모듈(js/lazy.js 의 import())을 다른 모듈이 바로 import 하지 않음 — 하면 처음부터 같이 내려와 지연 로드가 깨짐
//     ③ 파일을 읽을 때(최상위 var 초기값) 다른 파일 이름을 쓰지 않음 — 모듈은 읽는 순서가 고전 스크립트와 달라 아직 비어 있을 수 있음(시작 코드는 init.js start())
//     ④ window.<모듈 이름> 으로 쓰지 않음(import 로) · import 한 이름에 값 넣지 않음(ESLint no-import-assign)
//     ⑤ ESLint no-undef 등 — 오타·없는 이름
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint'; import globals from 'globals'; import * as espree from 'espree'; import * as eslintScope from 'eslint-scope';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const LIST = (/name="app-js" content="([^"]+)"/.exec(html) || [, ''])[1].split(',').map((s) => s.trim()).filter(Boolean);
const EXTRA = ['js/sqlbox.js'];   // 격리 칸 전용 고전 스크립트(따로 검사)
// window 에 직접 두는 값(로그인 역할 · 데이터 사본 · CDN 라이브러리) — 모듈 이름이 아니라 브라우저 전역
const WINDOW_PROPS = ['RAWX', 'MY_ROLE', 'IS_SUPER', 'IS_VIEWER', 'IS_VIEWER_ROLE', 'IS_EQUIP', 'EQUIP_HOME', 'XLSX', 'PptxGenJS', 'pdfjsLib', 'cLivePreview', 'nLivePreview', 'DASH_BASE0', 'LAST_LOAD'];
let fail = 0; const say = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) fail++; };
const P = (src) => espree.parse(src, { ecmaVersion: 2022, sourceType: 'module', range: true, loc: true });
const mods = {};
for (const f of LIST) { const src = fs.readFileSync(path.join(ROOT, f), 'utf8'); const ast = P(src); mods[f] = { src, ast, sm: eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module' }) }; }
// ① export · import
const exp = new Map(), dupE = [];
for (const [f, m] of Object.entries(mods)) for (const st of m.ast.body) if (st.type === 'ExportNamedDeclaration' && st.declaration) {
  const d = st.declaration; for (const n of d.type === 'VariableDeclaration' ? d.declarations.map((x) => x.id.name) : [d.id.name]) { if (exp.has(n)) dupE.push(n + '(' + exp.get(n) + ',' + f + ')'); exp.set(n, f); }
}
say(!dupE.length, '같은 이름을 두 파일이 export 하지 않음 (' + exp.size + '개)' + (dupE.length ? ' — ' + dupE.slice(0, 8).join(' · ') : ''));
const badImp = [], unused = [], graph = {};
for (const [f, m] of Object.entries(mods)) {
  graph[f] = [];
  for (const st of m.ast.body) if (st.type === 'ImportDeclaration') {
    const spec = st.source.value, tgt = 'js/' + spec.replace(/^\.\//, '');
    if (!/^\.\/[\w-]+\.js$/.test(spec) || !mods[tgt]) { badImp.push(f + ': ' + spec + ' — app-js 목록에 없는 파일'); continue; }
    graph[f].push(tgt);
    for (const s of st.specifiers) if (s.type === 'ImportSpecifier' && exp.get(s.imported.name) !== tgt) badImp.push(f + ': ' + s.imported.name + ' — ' + tgt + ' 에 export 없음');
  }
  const ms = m.sm.globalScope.childScopes[0];
  for (const v of ms.variables) if (v.defs[0] && v.defs[0].type === 'ImportBinding' && v.defs[0].node.type === 'ImportSpecifier' && !v.references.length) unused.push(f + ': ' + v.name);
}
say(!badImp.length, 'import 한 이름이 그 파일에 export 돼 있음' + (badImp.length ? '\n      ' + badImp.slice(0, 15).join('\n      ') : ''));
say(!unused.length, '안 쓰는 import 없음' + (unused.length ? ' — ' + unused.slice(0, 10).join(' · ') : ''));
// ② 지연 모듈
const lazySrc = mods['js/lazy.js'] ? mods['js/lazy.js'].src : '';
const LAZY = [...lazySrc.matchAll(/import\(\s*'\.\/([\w-]+\.js)'\s*\)/g)].map((m) => 'js/' + m[1]);
const eager = new Set(); (function walk(f) { if (eager.has(f) || !graph[f]) return; eager.add(f); graph[f].forEach(walk); })('js/main.js');
const leak = LAZY.filter((f) => eager.has(f));
say(LAZY.length >= 3 && !leak.length, '처음 열 때 불러오는 모듈 ' + LAZY.map((f) => path.basename(f)).join('·') + ' 을 처음부터 받는 모듈이 import 하지 않음' + (leak.length ? ' — 새는 것: ' + leak.join(', ') + ' (lazyView/lazyGet 으로)' : ''));
say(LIST.filter((f) => !eager.has(f) && !LAZY.includes(f)).length === 0, 'app-js 의 모든 모듈이 main.js 에서 닿거나 지연 모듈' + (LIST.filter((f) => !eager.has(f) && !LAZY.includes(f)).length ? ' — 고아: ' + LIST.filter((f) => !eager.has(f) && !LAZY.includes(f)).join(', ') : ''));
// ③ 파일을 읽을 때 다른 파일 이름을 쓰지 않음 (최상위 var 초기값 · 중첩 함수 안은 괜찮음)
const evalRefs = [];
function evalIds(node, out) {
  if (!node || typeof node !== 'object') return; if (Array.isArray(node)) { node.forEach((n) => evalIds(n, out)); return; }
  if (/Function/.test(node.type)) return; if (node.type === 'Identifier') { out.push(node); return; }
  if (node.type === 'MemberExpression') { evalIds(node.object, out); if (node.computed) evalIds(node.property, out); return; }
  if (node.type === 'Property') { if (node.computed) evalIds(node.key, out); evalIds(node.value, out); return; }
  for (const k of Object.keys(node)) if (!['type', 'range', 'loc'].includes(k)) evalIds(node[k], out);
}
const TOP_OK = { 'js/main.js': true };
const topBad = [];
for (const [f, m] of Object.entries(mods)) {
  const ms = m.sm.globalScope.childScopes[0]; const imported = new Set(ms.variables.filter((v) => v.defs[0] && v.defs[0].type === 'ImportBinding').map((v) => v.name));
  for (const st0 of m.ast.body) {
    const st = st0.type === 'ExportNamedDeclaration' ? st0.declaration : st0;
    if (st0.type === 'ImportDeclaration' || (st && st.type === 'FunctionDeclaration')) continue;
    if (st && st.type === 'VariableDeclaration') { for (const d of st.declarations) { const ids = []; evalIds(d.init, ids); ids.filter((i) => imported.has(i.name)).forEach((i) => evalRefs.push(f + ':' + i.loc.start.line + ' ' + d.id.name + ' ← ' + i.name)); } continue; }
    if (!TOP_OK[f]) topBad.push(f + ':' + st0.loc.start.line + ' ' + st0.type);
  }
}
say(!topBad.length, '모듈은 선언만(실행 문장은 init.js 의 start() · 시작은 main.js)' + (topBad.length ? ' — ' + topBad.slice(0, 8).join(' · ') : ''));
say(!evalRefs.length, '파일을 읽을 때(최상위 var 초기값) 다른 파일 이름을 쓰지 않음' + (evalRefs.length ? ' — ' + evalRefs.slice(0, 8).join(' · ') + ' (init.js start() 나 함수 안으로)' : ''));
// ④ window.<모듈 이름>
const winUse = [];
for (const [f, m] of Object.entries(mods)) (function walk(n) {
  if (!n || typeof n !== 'object') return; if (Array.isArray(n)) { n.forEach(walk); return; }
  if (n.type === 'MemberExpression' && !n.computed && n.object.type === 'Identifier' && n.object.name === 'window' && exp.has(n.property.name)) winUse.push(f + ':' + n.loc.start.line + ' window.' + n.property.name);
  for (const k of Object.keys(n)) if (k !== 'range' && k !== 'loc') walk(n[k]);
})(m.ast);
say(!winUse.length, 'window.<모듈 이름> 으로 쓰지 않음(import 로)' + (winUse.length ? ' — ' + winUse.slice(0, 8).join(' · ') : ''));
// 공유 상태 (㊿+150) — 17개는 ST 안에만
const MOVED = ['AUTH_USER', 'CODES', 'CUR_VIEW', 'DATA', 'DIRTY', 'HIST', 'HIST_LOADED', 'IDLE_LAST', 'IDLE_WARNED', 'INB_Y', 'LIVE_SRC', 'M', 'MAT', 'OI_CONVERT', 'PERMS', 'SB_TOKEN', 'TCOQ'];
const back = MOVED.filter((n) => exp.has(n));
say(!back.length, 'ST 로 옮긴 17개가 모듈 이름으로 다시 생기지 않음' + (back.length ? ' — ' + back.join(', ') : ''));
{ const st = mods['js/state.js'] ? mods['js/state.js'].src : ''; const miss = MOVED.filter((n) => !new RegExp('^\\s*' + n + ':', 'm').test(st));
  say(exp.get('ST') === 'js/state.js' && !miss.length, 'js/state.js 가 ST 를 export 하고 17개 키 모두 있음' + (miss.length ? ' — 없음: ' + miss.join(', ') : '')); }
// ⑤ ESLint
const G = Object.assign({}, globals.browser); WINDOW_PROPS.forEach((n) => { G[n] = 'writable'; });
const RULES = { 'no-undef': 'error', 'no-dupe-keys': 'error', 'no-dupe-args': 'error', 'no-duplicate-case': 'error', 'no-unreachable': 'error', 'no-func-assign': 'error', 'no-const-assign': 'error',
  'no-self-assign': 'error', 'use-isnan': 'error', 'valid-typeof': 'error', 'no-debugger': 'error', 'no-dupe-else-if': 'error', 'no-invalid-regexp': 'error', 'no-obj-calls': 'error', 'no-unsafe-negation': 'error',
  'no-compare-neg-zero': 'error', 'for-direction': 'error', 'getter-return': 'error', 'no-unsafe-finally': 'error', 'no-empty-character-class': 'error', 'no-redeclare': ['error', { builtinGlobals: false }],
  'no-import-assign': 'error', 'no-inner-declarations': 'off' };
const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: true, overrideConfig: [
  { files: LIST, languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: G }, rules: RULES },
  { files: EXTRA, languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: Object.assign({}, globals.browser, { alasql: 'readonly' }) }, rules: RULES } ] });
const res = await eslint.lintFiles(LIST.concat(EXTRA.filter((f) => fs.existsSync(path.join(ROOT, f)))));
const errs = []; res.forEach((r) => r.messages.forEach((m) => errs.push(path.relative(ROOT, r.filePath) + ':' + m.line + ' ' + m.ruleId + ' — ' + m.message)));
say(!errs.length, 'ESLint ' + res.length + '개 파일 · 오류 ' + errs.length + (errs.length ? '\n      ' + errs.slice(0, 25).join('\n      ') : ''));
console.log(fail ? '\n정적 검사(lint) 실패 ' + fail : '\n정적 검사(lint) 통과');
process.exit(fail ? 1 : 0);
