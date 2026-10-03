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
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const ver = /var APP_VER='(\d{4}-\d{2}-\d{2} ㊿\+\d+)'/.exec(idx);
say(!!ver, `APP_VER 형식 ${ver ? ver[1] : '(없음)'}`);
// Supabase 함수 소스가 저장소에 있으면 비밀값 검사만 (deno 는 CI 에 없을 수 있음)
const fnDir = path.join(ROOT, 'supabase', 'functions');
if (fs.existsSync(fnDir)) for (const d of fs.readdirSync(fnDir)) { const p = path.join(fnDir, d, 'index.ts'); if (fs.existsSync(p)) { const s = fs.readFileSync(p, 'utf8'); const leak = /(sb_secret_[A-Za-z0-9_]{8,}|sbp_[a-f0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xoxb-[0-9A-Za-z-]{10,}|sk-ant-[A-Za-z0-9_-]{20,})/.exec(s); say(!leak, `functions/${d}: 비밀값 패턴 없음`); } }
// 테스트 fixture 에 실데이터가 섞이지 않았는지 — 고객명은 «가상고객NN» 만
const fix = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixture', 'load_all.json'), 'utf8'));
say((fix.customers || []).every((c) => /^가상고객\d+$/.test(c.name)), 'fixture 고객명이 전부 가상');
// 필수 파일
for (const f of ['manifest.webmanifest', 'sw.js']) say(fs.existsSync(path.join(ROOT, f)), `${f} 존재`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n정적 검사 실패 ${fail}건` : '\n정적 검사 통과');
process.exit(fail ? 1 : 0);
