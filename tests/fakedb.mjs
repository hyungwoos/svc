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


/** ㊿+200 SQL 120 feedback_act 흉내 — 부르는 사람(이메일 · 슈퍼 관리자 여부)을 정해 db.rpc.feedback_act 에 끼움 · 규칙은 SQL 과 같게 */
export function fbActRpc(email, su) {
  return (b, db) => {
    const me = String(email).toLowerCase(), now = new Date().toISOString(), body = String(b.p_body || '').trim() || null;
    const f = db.table('portal_feedback').find((x) => x.id === +b.p_id); if (!f) throw new Error('요청을 찾을 수 없습니다');
    const own = String(f.created_by || '').toLowerCase() === me; if (!su && !own) throw new Error('이 요청을 볼 수 있는 사람이 아닙니다');
    const msg = (kind) => db.table('portal_feedback_msgs').push({ id: db.nextId('portal_feedback_msgs'), fb_id: f.id, kind, body, created_by: me, created_at: now });
    const act = b.p_act;
    if (act === 'seen') { if (own) f.req_seen_at = now; return { ok: true }; }
    if (act === 'assign') { if (!su) throw new Error('담당은 슈퍼 관리자만 맡을 수 있습니다'); if (f.status === 'done') throw new Error('완료된 요청입니다'); Object.assign(f, { status: 'doing', assignee: me, assigned_at: now, last_by: me, last_at: now }); msg('assign'); }
    else if (act === 'reply') { if (!body) throw new Error('내용을 적어 주세요'); Object.assign(f, { last_by: me, last_at: now }); if (own) f.req_seen_at = now; msg('reply'); }
    else if (act === 'done') { if (!su) throw new Error('완료 처리는 슈퍼 관리자만'); if (!body) throw new Error('어떻게 처리했는지 적어 주세요'); Object.assign(f, { status: 'done', done_by: me, done_at: now, assignee: f.assignee || me, assigned_at: f.assigned_at || now, confirmed_at: null, last_by: me, last_at: now }); msg('done'); }
    else if (act === 'reopen') { if (f.status !== 'done') throw new Error('완료된 요청만 다시 열 수 있습니다'); if (!body && !su) throw new Error('무엇이 아직 안 됐는지 적어 주세요'); Object.assign(f, { status: f.assignee ? 'doing' : 'new', done_by: null, done_at: null, confirmed_at: null, reopen_n: (f.reopen_n || 0) + 1, last_by: me, last_at: now }); if (own) f.req_seen_at = now; msg('reopen'); }
    else if (act === 'confirm') { if (!own) throw new Error('요청한 사람만 확인할 수 있습니다'); if (f.status !== 'done') throw new Error('아직 완료되지 않았습니다'); Object.assign(f, { confirmed_at: now, req_seen_at: now, last_by: me, last_at: now }); msg('confirm'); }
    else throw new Error('모르는 동작입니다: ' + act);
    return f;
  };
}
