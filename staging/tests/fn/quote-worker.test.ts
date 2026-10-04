// 견적 Worker v2 테스트 — deno run -A tests/fn/quote-worker.test.ts
//   Cloudflare Worker 모듈(export default { fetch })을 직접 불러 Request 를 넣어 봄. Supabase(Auth·REST·RPC)·GitHub 는 전부 가짜.
//   인증(JWT·만료·역할·메뉴 권한·MFA 미완료) · 옛 비밀번호 전환 기간 · CORS · 경로 제한 · 저장/삭제 기록 · 캐시 · 토큰 비유출을 확인.
import { ok, report, calls, installFetch, J } from './_mock.ts';

const ORIGIN = 'https://hyungwoos.github.io';
const b64u = (o: unknown) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (email: string, expIn = 3600) => 'h.' + b64u({ sub: 'u-' + email, email, aal: 'aal1', exp: Math.floor(Date.now() / 1000) + expIn }) + '.sig';
const USERS: Record<string, { role: string; read?: boolean; write?: boolean }> = {
  'super@example.com': { role: 'super_admin' },
  'admin@example.com': { role: 'admin' },
  'viewer@example.com': { role: 'admin_viewer' },
  'poc@example.com': { role: 'poc' },
  'mfa@example.com': { role: '' },                                   // MFA 미완료 → RLS 로 역할이 비어 보임
  'noquote@example.com': { role: 'admin', read: false, write: false }, // 메뉴 권한에서 견적 숨김
  'readonly@example.com': { role: 'admin', read: true, write: false },
};
const TOK: Record<string, string> = {}; Object.keys(USERS).forEach((e) => TOK[e] = jwt(e));
const tokEmail = (auth: string) => { const t = auth.replace(/^Bearer\s+/, ''); return Object.keys(TOK).find((e) => TOK[e] === t) || ''; };
let authHits = 0; const gh: { method: string; url: string; body: any }[] = []; const audits: any[] = [];

installFetch(async (url, method, body, init) => {
  const h = (init?.headers || {}) as Record<string, string>;
  const auth = h.Authorization || h.authorization || '';
  if (url.includes('/auth/v1/user')) { authHits++; const e = tokEmail(auth); return e ? J({ id: 'u-' + e, email: e }) : J({ msg: 'invalid JWT' }, 401); }
  if (url.includes('/rest/v1/user_roles')) { const e = tokEmail(auth); const u = USERS[e]; return J(u && u.role ? [{ role: u.role }] : []); }
  if (url.includes('/rest/v1/rpc/has_perm')) { const e = tokEmail(auth); const u = USERS[e]; const lvl = JSON.parse(body || '{}').p_level; const v = !u ? false : lvl === 'write' ? u.write !== false : u.read !== false; return J(v); }
  if (url.includes('/rest/v1/change_log')) { audits.push({ auth: tokEmail(auth), body: JSON.parse(body || '{}') }); return new Response('', { status: 201 }); }
  if (url.includes('api.github.com')) {
    gh.push({ method, url, body: body ? JSON.parse(body) : null });
    if (!String(h.Authorization || '').includes('ghp_test')) return J({ message: 'Bad credentials' }, 401);
    if (method === 'GET' && /\/contents\/quotes\?ref=/.test(url)) return J([{ type: 'file', name: '20261001_가상고객01_1.json', path: 'quotes/20261001_가상고객01_1.json' }, { type: 'file', name: 'note.txt', path: 'quotes/note.txt' }, { type: 'dir', name: 'old', path: 'quotes/old' }, { type: 'file', name: '20261002_가상고객02_2.pdf', path: 'quotes/20261002_가상고객02_2.pdf' }]);
    if (method === 'GET' && /\/contents\/quotes\/.+\.json\?ref=/.test(url)) { if ((h.Accept || '').includes('raw')) return new Response('{"customerName":"가상고객01"}', { status: 200 }); return J({ sha: 'sha123' }); }
    if (method === 'GET' && /\/contents\/quotes\/.+\.pdf\?ref=/.test(url)) return new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 });
    if (method === 'PUT') return J({ content: { path: 'x' } }, 201);
    if (method === 'DELETE') return J({ commit: {} }, 200);
    return J({ message: 'not mocked' }, 404);
  }
  return undefined;
});

const mod = await import(new URL('../../cloudflare/quote-worker/worker.js', import.meta.url).href);
const W = mod.default as { fetch: (r: Request, env: any, ctx: any) => Promise<Response> };
const ENV = { GITHUB_TOKEN: 'ghp_test', GITHUB_OWNER: 'owner', GITHUB_REPO: 'repo', GITHUB_BRANCH: 'main', GITHUB_FOLDER: 'quotes', ACCESS_PASSWORD: 'team-pw-1', LEGACY_UNTIL: '2099-12-31' };
const waits: Promise<unknown>[] = []; const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p) };
async function req(path: string, o: { method?: string; email?: string; token?: string; pw?: string; body?: unknown; origin?: string | null; env?: any } = {}) {
  const h: Record<string, string> = {};
  if (o.origin !== null) h.Origin = o.origin ?? ORIGIN;
  if (o.email) h.Authorization = 'Bearer ' + TOK[o.email];
  if (o.token) h.Authorization = 'Bearer ' + o.token;
  if (o.pw) h['X-Access-Password'] = o.pw;
  if (o.body !== undefined) h['Content-Type'] = 'application/json';
  const r = await W.fetch(new Request('https://aged-union-cdd3.example.workers.dev' + path, { method: o.method || (o.body !== undefined ? 'POST' : 'GET'), headers: h, body: o.body !== undefined ? JSON.stringify(o.body) : undefined }), o.env || ENV, ctx);
  await Promise.all(waits.splice(0));
  const ct = r.headers.get('content-type') || ''; const txt = await r.text(); let j: any = null; try { j = JSON.parse(txt); } catch { /* binary */ }
  return { status: r.status, j, txt, h: r.headers, ct };
}

console.log('견적 Worker v2');
// CORS
{ const r = await W.fetch(new Request('https://w.dev/list', { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET' } }), ENV, ctx);
  ok(r.status === 204 && r.headers.get('access-control-allow-origin') === ORIGIN && /Authorization/.test(r.headers.get('access-control-allow-headers') || ''), 'preflight: 허용 사이트 → 204 · ACAO · Authorization 허용'); }
{ const r = await W.fetch(new Request('https://w.dev/list', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), ENV, ctx); ok(r.status === 403 && !r.headers.get('access-control-allow-origin'), 'preflight: 다른 사이트 → 403 · ACAO 없음'); }
{ const r = await req('/list', { email: 'super@example.com', origin: 'https://evil.example' }); ok(r.status === 403 && gh.length === 0, '다른 사이트의 실제 요청 → 403 (GitHub 호출 없음)'); }
{ const r = await req('/list', { email: 'super@example.com', origin: 'null' }); ok(r.status === 403, 'file:// (Origin null) → 403'); }
// 인증
{ const r = await req('/list'); ok(r.status === 401 && /로그인/.test(r.j.error), '토큰·비밀번호 없음 → 401'); }
{ authHits = 0; const r = await req('/list', { token: jwt('super@example.com', -10) }); ok(r.status === 401 && /만료/.test(r.j.error) && authHits === 0, '만료 토큰 → 401 (Supabase 안 부름)'); }
{ const r = await req('/list', { token: 'garbage' }); ok(r.status === 401, '형식 틀린 토큰 → 401'); }
{ const r = await req('/list', { token: jwt('stranger@example.com') }); ok(r.status === 401, 'Supabase 가 거부한 토큰 → 401'); }
{ gh.length = 0; authHits = 0; const r = await req('/list', { email: 'super@example.com' });
  ok(r.status === 200 && r.j.files.length === 2 && r.j.files[0].name.endsWith('.pdf') && r.h.get('access-control-allow-origin') === ORIGIN && r.h.get('cache-control') === 'no-store', 'super → 목록(.json/.pdf 만 · 정렬) · ACAO · no-store', r.j.files.map((f: any) => f.name));
  const r2 = await req('/list', { email: 'super@example.com' }); ok(r2.status === 200 && authHits === 1, '같은 토큰 두 번째 요청은 캐시 (auth 1회)', { authHits }); }
{ const r = await req('/whoami', { email: 'viewer@example.com' }); ok(r.j.ok && r.j.role === 'admin_viewer' && r.j.read && r.j.write && !r.j.delete && r.j.auth === 'jwt' && r.j.version === 2, '/whoami: admin_viewer = 조회·저장 O · 삭제 X', r.j); }
{ const r = await req('/list', { email: 'poc@example.com' }); ok(r.status === 403 && /조회 권한/.test(r.j.error) && /poc/.test(r.j.error), 'poc 역할 → 조회 403', r.j.error); }
{ const r = await req('/list', { email: 'mfa@example.com' }); ok(r.status === 403 && /2단계 인증/.test(r.j.error), '역할 비어 보임(MFA 코드 미확인) → 403 + 안내', r.j.error); }
{ const r = await req('/list', { email: 'noquote@example.com' }); ok(r.status === 403, '메뉴 권한에서 견적 숨김(has_perm read false) → 403'); }
{ const r = await req('/save', { email: 'readonly@example.com', body: { fileName: '20261003_가상고객01_3.json', content: btoa('{}') } }); ok(r.status === 403 && /저장 권한/.test(r.j.error), '메뉴 권한 읽기만 → 저장 403'); }
// 경로 제한
for (const p of ['README.md', '../secret.json', 'quotes/../x.json', 'quotes/sub/x.json', 'other/x.json', 'quotes/x.txt', 'quotes/.hidden.json']) {
  const r = await req('/load?path=' + encodeURIComponent(p), { email: 'super@example.com' }); ok(r.status === 400, `/load 경로 거부: ${p}`);
}
{ gh.length = 0; const r = await req('/load?path=' + encodeURIComponent('quotes/20261001_가상고객01_1.json'), { email: 'admin@example.com' });
  ok(r.status === 200 && /json/.test(r.ct) && r.j.customerName === '가상고객01' && /contents\/quotes\/20261001_/.test(gh[0].url), '/load JSON → 원문 · 경로 인코딩'); }
{ const r = await req('/load?path=' + encodeURIComponent('quotes/20261002_가상고객02_2.pdf'), { email: 'viewer@example.com' }); ok(r.status === 200 && r.ct === 'application/pdf' && r.txt.startsWith('%PDF'), '/load PDF → application/pdf'); }
// 저장
for (const n of ['../evil.json', 'a/b.json', '.x.json', 'a.txt', 'a\\b.json', 'x'.repeat(201) + '.json']) {
  const r = await req('/save', { email: 'admin@example.com', body: { fileName: n, content: btoa('{}') } }); ok(r.status === 400, `/save 이름 거부: ${n.slice(0, 20)}`);
}
{ const r = await req('/save', { email: 'admin@example.com', body: { fileName: '20261003_가상고객01_3.json', content: '<script>' } }); ok(r.status === 400 && /base64/.test(r.j.error), '/save base64 아닌 내용 거부'); }
{ gh.length = 0; audits.length = 0; const r = await req('/save', { email: 'viewer@example.com', body: { fileName: '20261003_가상고객 (주)01_3.json', content: btoa('{"a":1}'), message: '견적 저장: 가상고객01' } });
  const put = gh.find((g) => g.method === 'PUT');
  ok(r.status === 200 && r.j.path === 'quotes/20261003_가상고객 (주)01_3.json' && put && /견적 저장: 가상고객01 · by viewer@example.com$/.test(put.body.message) && put.body.branch === 'main', '/save → GitHub PUT · 커밋 메시지에 by 이메일 · 공백·괄호 이름 허용', put && put.body.message);
  ok(audits.length === 1 && audits[0].auth === 'viewer@example.com' && audits[0].body.action === 'quote_save' && audits[0].body.actor === 'viewer@example.com' && audits[0].body.target_id === r.j.path, '저장 → 포탈 change_log(quote_save · 사용자 토큰)', audits[0] && audits[0].body); }
// 삭제
{ const r = await req('/delete', { email: 'viewer@example.com', body: { path: 'quotes/20261001_가상고객01_1.json' } }); ok(r.status === 403 && /삭제 권한/.test(r.j.error), 'admin_viewer → 삭제 403'); }
{ const r = await req('/delete', { email: 'admin@example.com', body: { path: 'README.md' } }); ok(r.status === 400, '/delete 폴더 밖 경로 거부'); }
{ gh.length = 0; audits.length = 0; const r = await req('/delete', { email: 'admin@example.com', body: { path: 'quotes/20261001_가상고객01_1.json' } });
  const del = gh.find((g) => g.method === 'DELETE');
  ok(r.status === 200 && del && del.body.sha === 'sha123' && / · by admin@example.com$/.test(del.body.message), '/delete → sha 조회 후 DELETE · by 이메일');
  ok(audits.length === 1 && audits[0].body.action === 'quote_delete', '삭제 → change_log(quote_delete)'); }
// 옛 비밀번호 (전환 기간)
{ const r = await req('/list', { pw: 'team-pw-1' }); ok(r.status === 200 && r.h.get('x-auth-deprecated') === 'password', '전환 기간: 옛 비밀번호 → 200 + X-Auth-Deprecated'); }
{ const r = await req('/list', { pw: 'wrong' }); ok(r.status === 401 && /비밀번호가 올바르지/.test(r.j.error), '전환 기간: 틀린 비밀번호 → 401'); }
{ gh.length = 0; audits.length = 0; const r = await req('/save', { pw: 'team-pw-1', body: { fileName: '20261003_가상고객01_4.json', content: btoa('{}') } }); const put = gh.find((g) => g.method === 'PUT');
  ok(r.status === 200 && / · by 공용 비밀번호$/.test(put!.body.message) && audits.length === 0, '비밀번호 저장 → 커밋에 «공용 비밀번호» · change_log 없음'); }
{ const r = await req('/list', { pw: 'team-pw-1', env: { ...ENV, LEGACY_UNTIL: '2020-01-01' } }); ok(r.status === 401 && /2020-01-01 에 종료/.test(r.j.error), 'LEGACY_UNTIL 지남 → 비밀번호 401'); }
{ const e = { ...ENV }; delete (e as any).ACCESS_PASSWORD; const r = await req('/list', { pw: 'team-pw-1', env: e }); ok(r.status === 401 && /종료/.test(r.j.error), 'ACCESS_PASSWORD 시크릿 삭제 → 비밀번호 방식 즉시 종료'); }
{ const e = { ...ENV }; delete (e as any).ACCESS_PASSWORD; const r = await req('/list', { email: 'admin@example.com', env: e }); ok(r.status === 200, 'ACCESS_PASSWORD 없어도 로그인 토큰은 정상'); }
// 설정 누락 · 비유출
{ const r = await req('/list', { email: 'admin@example.com', env: { ...ENV, GITHUB_TOKEN: '' } }); ok(r.status === 500 && /GITHUB_TOKEN/.test(r.j.error), 'GitHub 시크릿 없음 → 500 안내'); }
{ const r = await req('/nope', { email: 'admin@example.com' }); ok(r.status === 404, '없는 경로 → 404'); }
ok(!calls.some((c) => (c.url.includes('supabase') || c.url.includes('change_log')) && JSON.stringify(c).includes('ghp_test')), 'GitHub 토큰이 Supabase 요청에 섞이지 않음');
ok(!calls.some((c) => c.url.includes('api.github.com') && /Bearer h\./.test(JSON.stringify(c))), '사용자 토큰이 GitHub 요청에 섞이지 않음');
report('quote-worker');
