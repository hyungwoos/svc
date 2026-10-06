// tests/fakedb.mjs — 저장하면 실제로 바뀌는 «가짜 Supabase» (㊿+157 · 데이터 입력·수정 점검용)
//   · 가짜 DB 자체는 js/qadb.js (스테이징 QA «데이터 입력·수정» 단계와 같은 코드) — 여기는 Playwright 연결(fakeBackend)과 예전 이름만
//   · 데이터는 전부 가짜(가상고객…) — 운영 DB·실제 고객 정보와 무관
//   사용: const db = new FakeDB(seedData()); await fakeBackend(page, db, { role:'super_admin' }); … db.t.contracts · db.rev(id) · db.ct(id)
import { qaDb, qaSeed, qaNow, qaYm, qaIdx } from '../js/qadb.js';
export function FakeDB(seed) { return qaDb(seed); }
export const seedData = (d) => qaSeed(d || new Date());
export const nowIdx = (d) => qaNow(d || new Date());
export const idxYm = qaYm;
export const ymIdx = qaIdx;

/* 브라우저 쪽 연결 — Supabase REST/RPC 는 FakeDB 로 · 인증·함수·CDN 은 기존 mockBackend 와 같은 가짜 */
export async function fakeBackend(page, db, { role = 'super_admin', email = 'tester@example.com', token = 'tok', extra = null } = {}) {
  await page.addInitScript(({ email, token }) => {
    try { if (!sessionStorage.getItem('svc_sess')) { localStorage.clear(); sessionStorage.setItem('svc_sess', JSON.stringify({ a: token, r: null, e: Math.floor(Date.now() / 1000) + 3600, u: email, p: true })); } } catch (e) { /* noop */ }
  }, { email, token });
  await page.route('**/*supabase.co/**', async (route) => {
    const req = route.request(), u = req.url(), m = req.method();
    if (extra) { const r = await extra(route, u, m); if (r) return; }
    if (u.includes('/auth/v1/user')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'u1', email, user_metadata: { pw_changed: true }, factors: [] }) });
    if (u.includes('/functions/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: 'mock', queries: [], mode: 'ping' }) });
    if (u.includes('/rest/v1/')) {
      let r; try { r = db.handle(m, u, req.headers()['prefer'], req.postData(), role); } catch (e) { r = { status: 400, body: JSON.stringify({ message: String(e.message || e) }) }; }
      if (r) return route.fulfill({ status: r.status, contentType: 'application/json', headers: Object.assign({ 'Access-Control-Expose-Headers': 'content-range' }, r.headers || {}), body: r.body });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '*/0' }, body: '[]' });
  });
  await page.route(/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.route(/open\.er-api\.com|api\.exchangerate|api\.frankfurter/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"rates":{"KRW":1400}}' }));
}

