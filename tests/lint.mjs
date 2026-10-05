// tests/lint.mjs — 정적 검사(ESLint) + 파일 간 전역 이름 지도 (㊿+147 · 아키텍처 1단계)
//   · 포탈 js/ 는 아직 «한 전역 공간을 나눠 쓰는» 고전 스크립트 → 모든 파일의 최상위 선언을 서로의 전역으로 알려 주고 no-undef 로 오타·없는 이름을 잡음
//   · 같은 최상위 이름을 두 파일이 선언하면 실패(나중 파일이 앞 파일 것을 덮어씀)
//   · 다른 파일의 «상태 변수»에 쓰는 곳은 목록으로만 보여 줌(모듈 전환 때 state 로 옮길 대상) — 새로 늘면 실패
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint'; import globals from 'globals'; import * as espree from 'espree'; import * as eslintScope from 'eslint-scope';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const LIST = ['js/boot.js', 'js/load.js'].concat((/name="app-js" content="([^"]+)"/.exec(html) || [, ''])[1].split(',').map((s) => s.trim()).filter(Boolean));
const EXTRA = ['js/sqlbox.js'];   // 격리 칸 전용(따로 검사 · 포탈 전역과 섞지 않음)
const WINDOW_PROPS = ['RAWX', 'MY_ROLE', 'IS_SUPER', 'IS_VIEWER', 'IS_VIEWER_ROLE', 'IS_EQUIP', 'EQUIP_HOME', 'XLSX', 'PptxGenJS', 'pdfjsLib', 'cLivePreview', 'nLivePreview', 'DASH_BASE0', 'LAST_LOAD'];
let fail = 0; const say = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) fail++; };
// 1) 최상위 선언 · 파일 간 쓰기
const owner = {}, through = {};
for (const f of LIST) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const ast = espree.parse(src, { ecmaVersion: 2022, sourceType: 'script', range: true, loc: true });
  const g = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'script' }).globalScope;
  g.variables.forEach((v) => { (owner[v.name] = owner[v.name] || []).push(f); });
  through[f] = g.through.map((r) => ({ n: r.identifier.name, w: r.isWrite(), line: r.identifier.loc.start.line }));
}
const dups = Object.entries(owner).filter(([, fs2]) => fs2.length > 1);
say(!dups.length, '같은 최상위 이름을 두 파일이 선언하지 않음' + (dups.length ? ' — ' + dups.slice(0, 8).map(([n, a]) => n + '(' + a.join(',') + ')').join(' · ') : ''));
const writes = [];
for (const f of LIST) for (const r of through[f]) { const o = owner[r.n]; if (o && o[0] !== f && r.w) writes.push(r.n); }
const shared = [...new Set(writes)].sort();
const SHARED_OK = [];   // ㊿+150: 17개 전부 js/state.js 의 ST.* 로 옮김 — 다른 파일이 값을 바꾸는 전역 var 는 이제 0개여야 함
const extraShared = shared.filter((n) => !SHARED_OK.includes(n));
say(!extraShared.length, '다른 파일이 값을 바꾸는 전역 var 0개(공유 상태는 js/state.js 의 ST 에만)' + (extraShared.length ? ' — 새로 생김: ' + extraShared.join(', ') + ' → ST 로 옮기세요' : ''));
const MOVED = ['AUTH_USER', 'CODES', 'CUR_VIEW', 'DATA', 'DIRTY', 'HIST', 'HIST_LOADED', 'IDLE_LAST', 'IDLE_WARNED', 'INB_Y', 'LIVE_SRC', 'M', 'MAT', 'OI_CONVERT', 'PERMS', 'SB_TOKEN', 'TCOQ'];
const back = MOVED.filter((n) => owner[n]);
say(!back.length, 'ST 로 옮긴 17개가 전역 var 로 다시 선언되지 않음' + (back.length ? ' — ' + back.join(', ') : ''));
{ const st = fs.readFileSync(path.join(ROOT, 'js', 'state.js'), 'utf8'); const miss = MOVED.filter((n) => !new RegExp('^\\s*' + n + ':', 'm').test(st));
  say(owner.ST && owner.ST[0] === 'js/state.js' && !miss.length, 'js/state.js 가 ST 를 선언하고 17개 키 모두 있음' + (miss.length ? ' — 없음: ' + miss.join(', ') : '')); }
// 2) ESLint — 오타·없는 이름 · 흔한 실수
const G = Object.assign({}, globals.browser);
Object.keys(owner).concat(WINDOW_PROPS).forEach((n) => { G[n] = 'writable'; });
const RULES = { 'no-undef': 'error', 'no-dupe-keys': 'error', 'no-dupe-args': 'error', 'no-duplicate-case': 'error', 'no-unreachable': 'error', 'no-func-assign': 'error', 'no-const-assign': 'error',
  'no-self-assign': 'error', 'use-isnan': 'error', 'valid-typeof': 'error', 'no-debugger': 'error', 'no-dupe-else-if': 'error', 'no-invalid-regexp': 'error', 'no-obj-calls': 'error', 'no-unsafe-negation': 'error',
  'no-compare-neg-zero': 'error', 'for-direction': 'error', 'getter-return': 'error', 'no-unsafe-finally': 'error', 'no-empty-character-class': 'error', 'no-redeclare': ['error', { builtinGlobals: false }] };
const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: true, overrideConfig: [
  { files: LIST, languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: G }, rules: RULES },
  { files: EXTRA, languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: Object.assign({}, globals.browser, { alasql: 'readonly' }) }, rules: RULES } ] });
const res = await eslint.lintFiles(LIST.concat(EXTRA.filter((f) => fs.existsSync(path.join(ROOT, f)))));
const errs = []; res.forEach((r) => r.messages.forEach((m) => errs.push(path.relative(ROOT, r.filePath) + ':' + m.line + ' ' + m.ruleId + ' — ' + m.message)));
say(!errs.length, 'ESLint ' + res.length + '개 파일 · 오류 ' + errs.length + (errs.length ? '\n      ' + errs.slice(0, 25).join('\n      ') : ''));
console.log(fail ? '\n정적 검사(lint) 실패 ' + fail : '\n정적 검사(lint) 통과');
process.exit(fail ? 1 : 0);
