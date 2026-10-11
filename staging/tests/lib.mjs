// 포탈 스모크 테스트 공용 — 저장소 루트를 정적 서버로 띄우고, Supabase/CDN 호출은 전부 가짜로 막는다 (운영 DB·AI 에 절대 닿지 않음)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FIX = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixture', 'load_all.json'), 'utf8'));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

/** 저장소 루트(또는 지정 폴더)를 /svc/ 경로 아래에 서빙 — GitHub Pages 와 같은 하위 경로 구조 */
export function serve(dir = ROOT, base = '/svc') {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.startsWith(base)) p = p.slice(base.length);
      if (p === '' || p.endsWith('/')) p += 'index.html';
      const f = path.join(dir, p);
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}${base}` }));
  });
}

/** Supabase · CDN 가짜 응답. role: super_admin | admin | admin_viewer ... · onWrite: 쓰기 요청 기록 콜백 */
/** token: 주입할 access token(기본 'tok' · JWT 모양이면 aal 검사에 쓰임) · noSession: 세션 없이 시작(로그인 화면 테스트) */
export async function mockBackend(page, { role = 'super_admin', email = 'tester@example.com', onWrite = null, extra = null, token = 'tok', noSession = false, keepStore = false } = {}) {
  const data = JSON.stringify(Object.assign({}, FIX, { roles: [{ role }] }));
  await page.route('**/*supabase.co/**', async (route) => {
    const u = route.request().url(), m = route.request().method();
    if (extra) { const r = await extra(route, u, m); if (r) return; }
    const hdr = { 'content-range': '0-0/0', 'Access-Control-Expose-Headers': 'content-range' };
    if (u.includes('/rpc/load_all')) return route.fulfill({ status: 200, contentType: 'application/json', body: data });
    if (u.includes('/auth/v1/user')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'u1', email, user_metadata: { pw_changed: true }, factors: [] }) });
    if (u.includes('/functions/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: 'mock', queries: [], mode: 'ping' }) });
    if (/POST|PATCH|DELETE|PUT/.test(m)) { if (onWrite) onWrite({ m, url: u, body: route.request().postData() }); return route.fulfill({ status: m === 'POST' ? 201 : 204, contentType: 'application/json', headers: hdr, body: '[]' }); }
    return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: '[]' });
  });
  await page.route(/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.route(/open\.er-api\.com|api\.exchangerate|api\.frankfurter/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"rates":{"KRW":1400}}' }));
  await page.addInitScript(({ email, token, noSession, keepStore }) => {
    try { if (!keepStore) { localStorage.clear(); sessionStorage.clear(); } } catch (e) { /* noop */ }   /* keepStore(㊿+180): 새로고침 · 포탈 안 빈 iframe 에서 저장소를 지우지 않음(로그인 유지 · 로그아웃 시험) */
    try { if (!noSession) sessionStorage.setItem('svc_sess', JSON.stringify({ a: token, r: null, e: Math.floor(Date.now() / 1000) + 3600, u: email, p: true })); } catch (e) { /* 격리 칸(sandbox · 출처 없음)에선 저장소가 없음 — 무시 */ }
  }, { email, token, noSession, keepStore });
}

/** 페이지 오류·콘솔 오류 수집 */
export function collect(page) {
  const errs = [], csp = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
  page.on('console', (msg) => { if (msg.type() === 'error') { const t = msg.text(); if (/Content Security Policy|Refused to/.test(t)) csp.push(t.slice(0, 200)); } });
  return { errs, csp };
}

export class Suite {
  constructor(name) { this.name = name; this.results = []; }
  async t(label, fn) {
    if (process.env.SMOKE_ONLY && !label.includes(process.env.SMOKE_ONLY)) return;   // 개발용: 이름에 이 글자가 든 시험만 (CI 는 안 씀)
    const t0 = Date.now();
    try { const info = await fn(); this.results.push({ label, ok: true, ms: Date.now() - t0, info }); console.log(`  ✓ ${label}${info ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 120) : ''}`); }
    catch (e) { this.results.push({ label, ok: false, ms: Date.now() - t0, error: String(e && e.message || e).slice(0, 400) }); console.log(`  ✗ ${label} — ${String(e && e.message || e).slice(0, 300)}`); }
  }
  get failed() { return this.results.filter((r) => !r.ok); }
  report() {
    const f = this.failed.length, n = this.results.length;
    /* ㊿+158 실패한 시험을 Actions 요약 화면 «Annotations» 에 (로그는 로그인해야 보이지만 주석은 공개 화면에 보임) */
    if (process.env.GITHUB_ACTIONS) this.failed.slice(0, 10).forEach((r) => console.log('::error title=' + this.name + ' 실패::' + (r.label + ' — ' + r.error).replace(/%/g, '%25').replace(/\r?\n/g, '%0A').slice(0, 900)));
    console.log(`\n${this.name}: ${n - f}/${n} 통과${f ? ` · 실패 ${f}` : ''}`);
    return f === 0;
  }
}
export function assert(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
