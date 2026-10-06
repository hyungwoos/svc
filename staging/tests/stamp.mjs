// tests/stamp.mjs — index.html 의 «버전 꼬리표 묶음» 만들기·확인 (㊿+153 · ES 모듈)
//   node tests/stamp.mjs          → index.html 의 <!-- stamp:begin --> … <!-- stamp:end --> 와 CSP 해시를 지금 app-ver · app-js 로 다시 씀
//   node tests/stamp.mjs --check  → 맞는지만 확인(다르면 종료 코드 1) · tests/check.mjs 도 같은 함수를 씀
//   · 버전은 <meta name="app-ver"> 한 곳. 여기서 그 값으로 app.css · 모든 모듈 주소에 ?v= 를 붙임(importmap) → 새 버전을 올리면 브라우저가 새 파일을 받음
//   · importmap 은 인라인 <script> 라 CSP 가 막으므로, 그 내용의 sha256 을 script-src 에 넣음(내용이 바뀌면 해시도 바뀜 — 그래서 손으로 고치지 말고 이 파일로)
//   · 처음부터 받을 모듈 = main.js 에서 정적 import 로 닿는 것(modulepreload) · 나머지(js/lazy.js 가 import() 로 받는 것)는 처음 열 때
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';

export function stampOf(html, readJs) {
  const ver = (/<meta name="app-ver" content="([^"]+)">/.exec(html) || [])[1];
  const list = ((/<meta name="app-js" content="([^"]+)">/.exec(html) || [])[1] || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!ver || !list.length) throw new Error('index.html 에 app-ver · app-js meta 가 없음');
  const v = encodeURIComponent(ver);
  // main.js 에서 정적 import 로 닿는 모듈
  const eager = new Set(); const todo = ['js/main.js'];
  while (todo.length) {
    const f = todo.pop(); if (eager.has(f)) continue; eager.add(f);
    const src = readJs(f) || '';
    for (const m of src.matchAll(/^\s*import\s+(?:[\s\S]*?\s+from\s+)?['"]\.\/([\w.-]+\.js)['"]\s*;/gm)) todo.push('js/' + m[1]);
  }
  const mods = list.filter((f) => f !== 'js/main.js');
  const map = JSON.stringify({ imports: Object.fromEntries(mods.map((f) => ['./' + f, './' + f + '?v=' + v])) });
  const hash = "'sha256-" + crypto.createHash('sha256').update(map, 'utf8').digest('base64') + "'";
  const block = '<!-- stamp:begin — tests/stamp.mjs 가 app-ver · app-js 로 만든 부분(손으로 고치지 말 것 · 버전을 올린 뒤 다시 실행 · tests/check.mjs 가 확인) -->\n' +
    '<link rel="stylesheet" href="app.css?v=' + v + '">\n' +
    '<script type="importmap">' + map + '</script>\n' +
    mods.filter((f) => eager.has(f)).map((f) => '<link rel="modulepreload" href="' + f + '?v=' + v + '">').join('\n') + '\n' +
    '<script type="module" src="js/main.js?v=' + v + '"></script>\n' +
    '<!-- stamp:end -->';
  return { ver, list, eager: [...eager], lazy: mods.filter((f) => !eager.has(f)), map, hash, block };
}
export function applyStamp(html, st) {
  if (!/<!-- stamp:begin[\s\S]*?<!-- stamp:end -->/.test(html)) throw new Error('index.html 에 <!-- stamp:begin --> … <!-- stamp:end --> 가 없음');
  let out = html.replace(/<!-- stamp:begin[\s\S]*?<!-- stamp:end -->/, () => st.block);
  out = out.replace(/(<meta http-equiv="Content-Security-Policy" content="[^"]*?script-src 'self')( 'sha256-[A-Za-z0-9+/=]+')?/, (m, a) => a + ' ' + st.hash);
  return out;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const p = path.join(ROOT, 'index.html'); const html = fs.readFileSync(p, 'utf8');
  const st = stampOf(html, (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return null; } });
  const out = applyStamp(html, st);
  if (process.argv.includes('--check')) { console.log(out === html ? '✓ stamp 최신 (' + st.ver + ')' : '✗ stamp 가 지금 버전과 다름 — node tests/stamp.mjs 실행'); process.exit(out === html ? 0 : 1); }
  if (out !== html) fs.writeFileSync(p, out);
  console.log('stamp ' + st.ver + ' · 처음부터 ' + st.eager.length + ' · 처음 열 때 ' + st.lazy.join(', ') + (out !== html ? ' · index.html 고침' : ' · 그대로'));
}
