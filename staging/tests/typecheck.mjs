// tests/typecheck.mjs — 타입 검사 (TypeScript 의 checkJs · ㊿+155 «이름표 붙이기»)
//   node tests/typecheck.mjs   (tests/lint.mjs 도 같은 함수를 부름)
//   · 대상: index.html app-js 의 모듈 전부 + 아래 DECLS(전역 · 느슨한 DOM 선언)
//   · 엄격 모드는 끔(이 포탈은 JSDoc 이 일부만 있음) — 그래도 잡는 것: 없는 이름 · 함수 인자 수 · 객체에 없는 속성(오타) · 내장 함수 잘못 쓰기 ·
//     JSDoc 으로 모양을 적어 둔 값(ST · 행 · 표 정의 · lazy · h)에 다른 모양을 넣는 것
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 타입 검사용 선언(전역 · 느슨한 DOM) — 예전엔 tests/types/*.d.ts 였는데, 승격(gh_copy)이 .ts 파일을 옮기지 않아 이 파일 안에 둠
//   (사이트에 배포되지 않음 · TypeScript 에는 가상 파일로 넘김)
export const DECLS = {
  'globals.d.ts': `// CDN 라이브러리 — core.js loadLib() 가 SRI 로 받아 window 에 둠(엑셀 · PPT · PDF 읽기)
declare var XLSX: any;
declare var PptxGenJS: any;
declare var pdfjsLib: any;
// main.js 가 만드는 «포탈 이름 손잡이»(읽기 전용) — 스테이징 QA 가 다른 창의 포탈을 볼 때 씀
interface Window { SVC?: any }
// iOS Safari 홈 화면 앱 여부 (core.js pwaStandalone)
interface Navigator { standalone?: boolean }
// 인증·DB 오류에 HTTP 상태를 붙여 던짐 (core.js authApi 등)
interface Error { status?: number }
`,
  'dom-loose.d.ts': `// 포탈 코드는 getElementById·querySelector 로 얻은 요소에 .value · .checked · .onclick · .dataset 등을 바로 쓰고,
// 한 번만 묶었는지 표시(__bound 등)도 요소에 붙임 → 요소 종류(HTMLInputElement 등)를 일일이 적지 않도록 DOM 쪽은 느슨하게.
// 타입 검사는 «우리 코드»의 이름 · 함수 인자 수 · 객체 모양 · 내장 함수 사용에 집중합니다.
interface EventTarget { [key: string]: any }
interface GlobalEventHandlers { [key: string]: any }
// setAttribute 는 숫자·참거짓도 받아 글자로 바꿈(차트 SVG 좌표 등) · contains 는 이벤트 대상(e.target)을 그대로 받음
interface Element { setAttribute(qualifiedName: string, value: number | boolean): void }
interface Node { contains(other: EventTarget | null): boolean }
`,
};
export async function typecheck(root = ROOT) {
  let ts; try { ts = (await import('typescript')).default; } catch (e) { return { skipped: 'typescript 패키지가 없음(npm install)' }; }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const files = (/name="app-js" content="([^"]+)"/.exec(html) || [, ''])[1].split(',').map((s) => path.join(root, s.trim())).filter((f) => fs.existsSync(f));
  const norm = (f) => f.replace(/\\/g, '/'); const vdir = norm(path.join(root, 'tests', '_decl'));
  const virt = new Map(Object.entries(DECLS).map(([n, t]) => [vdir + '/' + n, t])); const dts = [...virt.keys()];
  const opts = { allowJs: true, checkJs: true, noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'], strict: false, noImplicitAny: false, skipLibCheck: true, types: [] };
  const host = ts.createCompilerHost(opts); const gsf = host.getSourceFile.bind(host), fe = host.fileExists.bind(host), rf = host.readFile.bind(host);
  host.getSourceFile = (f, lang, ...r) => (virt.has(norm(f)) ? ts.createSourceFile(f, virt.get(norm(f)), lang) : gsf(f, lang, ...r));
  host.fileExists = (f) => virt.has(norm(f)) || fe(f); host.readFile = (f) => (virt.has(norm(f)) ? virt.get(norm(f)) : rf(f));
  const program = ts.createProgram(files.concat(dts), opts, host);
  const diags = ts.getPreEmitDiagnostics(program).filter((d) => d.file && !d.file.fileName.includes('node_modules'));
  const list = diags.map((d) => { const { line } = d.file.getLineAndCharacterOfPosition(d.start); return path.relative(root, d.file.fileName) + ':' + (line + 1) + ' TS' + d.code + ' ' + ts.flattenDiagnosticMessageText(d.messageText, ' ').slice(0, 200); });
  return { files: files.length, errors: list, version: ts.version };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = await typecheck(); if (r.skipped) { console.log('건너뜀 — ' + r.skipped); process.exit(0); }
  r.errors.forEach((e) => console.log('  ' + e)); console.log('타입 검사(TypeScript ' + r.version + ') ' + r.files + '개 파일 · 오류 ' + r.errors.length); process.exit(r.errors.length ? 1 : 0);
}
