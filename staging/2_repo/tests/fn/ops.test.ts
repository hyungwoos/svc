// ops Edge Function 테스트 — deno run -A tests/fn/ops.test.ts
//   GitHub · Supabase Management · Auth · REST · Slack 전부 가짜. 인증 4중(JWT·OWNER·super_admin·PIN)·동작·보호 경로·PIN 잠금을 확인.
import { installFetch, loadFn, call, ok, report, J, calls } from './_mock.ts';

const OWNER = 'owner@example.com';
const logRows: Record<string, unknown>[] = [];
let email = OWNER, role = 'super_admin';
const TREE = [
  { path: 'index.html', type: 'blob', sha: 'b1', size: 60, mode: '100644' }, { path: 'sw.js', type: 'blob', sha: 'b2', size: 10, mode: '100644' },
  { path: 'app.css', type: 'blob', sha: 'b3', size: 10, mode: '100644' }, { path: 'js/app.js', type: 'blob', sha: 'b4', size: 10, mode: '100644' },
  { path: 'tests/smoke.mjs', type: 'blob', sha: 'b5', size: 10, mode: '100644' }, { path: '.github/workflows/deploy.yml', type: 'blob', sha: 'b6', size: 10, mode: '100644' },
  { path: 'supabase/functions/ops/index.ts', type: 'blob', sha: 'b7', size: 10, mode: '100644' }, { path: 'staging/index.html', type: 'blob', sha: 'b8', size: 60, mode: '100644' },
  { path: 'staging/js/app.js', type: 'blob', sha: 'b9', size: 10, mode: '100644' }, { path: '도장.jpg', type: 'blob', sha: 'b10', size: 10, mode: '100644' }, { path: 'staging/도장.jpg', type: 'blob', sha: 'b11', size: 10, mode: '100644' },
];
const b64 = (s: string) => { const u = new TextEncoder().encode(s); let bin = ''; u.forEach((c) => bin += String.fromCharCode(c)); return btoa(bin); };
const treePosts: string[][] = [];
let blobInFlight = 0, blobMax = 0, blobPosts = 0;
let lastDeployMeta: any = null;

installFetch(async (url, method, body, init) => {
  if (url.includes('/auth/v1/user')) return J({ id: 'u1', email });
  if (url.includes('/rest/v1/user_roles')) return J([{ role }]);
  if (url.includes('/rest/v1/ops_log')) {
    if (method === 'POST') { logRows.push(JSON.parse(body!)); return new Response('', { status: 201 }); }
    if (url.includes('action=eq.pin_fail')) return J(logRows.filter((r) => r.action === 'pin_fail' && r.actor === email));
    return J(logRows.slice(-30));
  }
  if (url.includes('api.github.com')) {
    if (url.includes('/git/trees/') && method === 'GET') return J({ tree: TREE });
    if (url.includes('/git/trees') && method === 'POST') { treePosts.push(JSON.parse(body!).tree.map((e: any) => e.path + '←' + e.sha)); return J({ sha: 'newtree' }, 201); }
    if (url.includes('/git/blobs/b1')) return J({ encoding: 'base64', content: b64('<html><meta name="app-ver" content="2026-09-16 ㊿+137"></html>') });
    if (url.includes('/git/blobs/b8')) return J({ encoding: 'base64', content: b64("<html><script>var APP_VER='2026-09-16 ㊿+129';</script></html>") });
    if (url.includes('/git/blobs') && method === 'POST') { blobPosts++; blobInFlight++; blobMax = Math.max(blobMax, blobInFlight); await new Promise((r) => setTimeout(r, 30)); blobInFlight--; return J({ sha: 'nb' + calls.length }, 201); }
    if (url.includes('/git/ref/heads/')) return J({ object: { sha: 'headsha' } });
    if (url.includes('/git/commits/headsha')) return J({ tree: { sha: 'treesha' } });
    if (url.includes('/git/commits') && method === 'POST') return J({ sha: 'c0ffee1234567' }, 201);
    if (url.includes('/git/refs/heads/') && method === 'PATCH') return J({ object: { sha: 'c0ffee1234567' } });
    if (url.includes('/commits?')) return J([{ sha: 'aaaa1111', html_url: 'u1', commit: { message: 'm1', author: { name: 'x', date: '2026-10-03T00:00:00Z' } } }]);
    return J({ message: 'not mocked ' + url }, 404);
  }
  if (url.includes('api.supabase.com')) {
    if (url.endsWith('/database/query')) { const b = JSON.parse(body!); if (/boom/.test(b.query)) return J({ message: 'syntax error at boom' }, 400); return J([{ kind: 'due', n: 9 }], 201); }
    if (/\/functions$/.test(url)) return J([{ slug: 'ask', name: 'ask', version: 60, verify_jwt: false, entrypoint_path: 'index.ts' }, { slug: 'remind', name: 'remind', version: 3, verify_jwt: false, entrypoint_path: 'index.ts' }]);
    if (/\/functions\/remind\/body$/.test(url)) { const fd = new FormData(); fd.append('file', new Blob(['// remind code'], { type: 'text/plain' }), 'index.ts'); const r = new Response(fd); return new Response(await r.text(), { status: 200, headers: { 'content-type': r.headers.get('content-type')! } }); }
    if (/\/functions\/remind$/.test(url) && method === 'GET') return J({ slug: 'remind', name: 'remind', version: 3, verify_jwt: false, entrypoint_path: 'file:///tmp/user_fn_x_2/source/file:///tmp/user_fn_x_1/source/index.ts' });
    if (url.includes('/functions/deploy?slug=')) { const fd = init!.body as FormData; const meta = JSON.parse(await (fd.get('metadata') as Blob).text()); lastDeployMeta = meta; return J({ slug: new URL(url).searchParams.get('slug'), version: 4, verify_jwt: meta.verify_jwt, entrypoint_path: meta.entrypoint_path }, 201); }
    if (url.endsWith('/secrets') && method === 'GET') return J([{ name: 'SLACK_BOT_TOKEN', value: 'x' }]);
    return J({ message: 'not mocked ' + url }, 404);
  }
  if (url.includes('slack.com')) return J({ ok: true, ts: '1' });
  return undefined;
});
Deno.env.set('SUPABASE_URL', 'https://mockref.supabase.co'); Deno.env.set('SUPABASE_ANON_KEY', 'anon'); Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'svc');
Deno.env.set('OPS_OWNER', OWNER + ', other@example.com'); Deno.env.set('OPS_PIN', '7391');
Deno.env.set('GITHUB_TOKEN', 'ghp_test'); Deno.env.set('MGMT_ACCESS_TOKEN', 'sbp_test'); Deno.env.set('OPS_SLACK_CHANNEL', 'C1'); Deno.env.set('SLACK_BOT_TOKEN', 'xoxb');
await loadFn('ops');
const P = (o: Record<string, unknown>) => Object.assign({ pin: '7391' }, o);

console.log('ops 함수');
{ const r = await call({ action: 'status' }, { token: null }); ok(r.status === 401, '토큰 없음 → 401', r.status); }
{ const r = await call({ action: 'status' }); ok(r.status === 200 && r.j.ok && r.j.pin_set && r.j.github?.token_set && r.j.mgmt_token_set, 'status: PIN 없이 설정 상태', r.j && { pin_set: r.j.pin_set, gh: r.j.github?.repo }); }
{ const r = await call({ action: 'gh_list' }); ok(r.status === 403 && /PIN/.test(r.j.error), 'PIN 없음 → 403', r.j?.error); }
{ const r = await call(P({ action: 'gh_list' })); ok(r.j.ok && Array.isArray(r.j.tree ?? r.j.files ?? r.j.items) || (r.j.ok && JSON.stringify(r.j).includes('index.html')), 'gh_list: 트리', Object.keys(r.j)); }
{ const r = await call(P({ action: 'gh_get', path: 'index.html' })); ok(r.j.ok && r.j.app_ver === '2026-09-16 ㊿+137', 'gh_get: meta app-ver 인식', r.j.app_ver); }
{ const r = await call(P({ action: 'gh_get', path: 'staging/index.html' })); ok(r.j.ok && r.j.app_ver === '2026-09-16 ㊿+129', 'gh_get: 옛 var APP_VER 도 인식', r.j.app_ver); }
{ treePosts.length = 0; const r = await call(P({ action: 'gh_put', files: [{ path: 'index.html', content: '<html>x</html>' }, { path: 'js/app.js', content: 'var a=1;' }], message: 'test' }));
  ok(r.j.ok && r.j.commit === 'c0ffee1234567' && treePosts.length === 1 && treePosts[0].length === 2, 'gh_put: 파일 2개 → 커밋 1개', treePosts[0]); }
// v1.5 커밋 빠르게 — 내용이 같은 파일은 건너뜀(git blob SHA 비교) · 바뀐 파일은 동시에 업로드 · 전부 같으면 커밋 안 함
{ const mod = await import('../../supabase/functions/ops/index.ts');
  const sha = await mod.gitBlobSha(b64('hello\n')); ok(sha === 'ce013625030ba8dba906f756967f9e9ca394464a', 'gitBlobSha = git hash-object 와 같음', sha);
  TREE.push({ path: 'js/same.js', type: 'blob', sha: await mod.gitBlobSha(b64('var same=1;\n')), size: 12, mode: '100644' });
  treePosts.length = 0; blobPosts = 0;
  const r = await call(P({ action: 'gh_put', files: [{ path: 'js/same.js', content: 'var same=1;\n' }, { path: 'js/new.js', content: 'var n=2;' }], message: 'skip' }));
  ok(r.j.ok && treePosts[0]?.length === 1 && treePosts[0][0].startsWith('js/new.js') && blobPosts === 1 && r.j.skipped?.[0] === 'js/same.js' && r.j.files?.join() === 'js/new.js', 'gh_put: 같은 내용 파일은 건너뛰고 바뀐 것만 커밋', { files: r.j.files, skipped: r.j.skipped, blobPosts });
  treePosts.length = 0; const r2 = await call(P({ action: 'gh_put', files: [{ path: 'js/same.js', content: 'var same=1;\n' }], message: 'none' }));
  ok(!r2.j.ok && /바뀐 파일이 없습니다/.test(r2.j.error) && !treePosts.length, 'gh_put: 전부 같으면 커밋하지 않음', r2.j.error);
  blobMax = 0; blobPosts = 0; const many = Array.from({ length: 16 }, (_, i) => ({ path: 'js/f' + i + '.js', content: 'var x' + i + '=1;' }));
  const t0 = Date.now(); const r3 = await call(P({ action: 'gh_put', files: many, message: 'many' })); const ms = Date.now() - t0;
  ok(r3.j.ok && blobPosts === 16 && blobMax >= 4 && blobMax <= 6 && treePosts.slice(-1)[0].length === 16, '파일 16개 → 동시에 올림(최대 6) · 커밋 1개', { blobMax, ms }); }
{ treePosts.length = 0; const r = await call(P({ action: 'gh_copy', src: '', dst: 'staging' }));
  const paths = (treePosts[0] || []).map((x) => x.split('←')[0]);
  ok(r.j.ok && paths.includes('staging/js/app.js') && paths.includes('staging/app.css') && paths.includes('staging/index.html') && !paths.some((p) => /^staging\/(tests|supabase|\.github)\//.test(p)), 'gh_copy 루트→staging: js/·app.css 포함 · tests/supabase/.github 제외', paths); }
{ treePosts.length = 0; const r = await call(P({ action: 'gh_copy', src: 'staging', dst: '' }));
  const paths = (treePosts[0] || []).map((x) => x.split('←')[0]);
  ok(r.j.ok && paths.includes('index.html') && paths.includes('js/app.js') && !paths.some((p) => p.startsWith('staging/')), 'gh_copy staging→루트(승격)', paths); }
{ const r = await call(P({ action: 'gh_copy', src: '', dst: '' })); ok(!r.j.ok, 'gh_copy: 같은 폴더 거부', r.j.error); }
{ treePosts.length = 0; const r = await call(P({ action: 'gh_delete', paths: ['도장.jpg', 'staging/도장.jpg', 'none.jpg'] }));
  ok(r.j.ok && r.j.deleted?.length === 2 && r.j.missing?.[0] === 'none.jpg' && treePosts[0]?.every((x) => /←null$/.test(x)), 'gh_delete: 2개 삭제(sha null) · 없는 경로 missing', { deleted: r.j.deleted, missing: r.j.missing }); }
{ const r = await call(P({ action: 'gh_delete', paths: ['index.html'] })); ok(!r.j.ok && /지울 수 없/.test(r.j.error), 'gh_delete: index.html 보호', r.j.error); }
{ const r = await call(P({ action: 'gh_delete', paths: ['.github/workflows/deploy.yml'] })); ok(!r.j.ok, 'gh_delete: .github 보호', r.j.error); }
{ const r = await call(P({ action: 'gh_history', path: 'index.html' })); ok(r.j.ok && Array.isArray(r.j.commits ?? r.j.history) , 'gh_history', Object.keys(r.j)); }
{ const r = await call(P({ action: 'sql_run', sql: 'select 1', read_only: true })); ok(r.j.ok && Array.isArray(r.j.rows) && r.j.rows.length === 1, 'sql_run 읽기 전용 → 행', r.j.rows); }
{ const r = await call(P({ action: 'sql_run', sql: 'select boom' })); ok(!r.j.ok && /boom/.test(r.j.error), 'sql_run 오류 전달', r.j.error); }
{ const r = await call(P({ action: 'fn_list' })); ok(r.j.ok && JSON.stringify(r.j).includes('remind'), 'fn_list'); }
{ const r = await call(P({ action: 'fn_get', slug: 'remind' })); ok(r.j.ok && /remind code/.test(JSON.stringify(r.j)), 'fn_get: 코드 본문(multipart)'); }
{ const r = await call(P({ action: 'fn_deploy', slug: 'remind', files: [{ path: 'index.ts', content: '// v2' }], verify_jwt: false })); ok(r.j.ok && (r.j.version === 4 || /4/.test(JSON.stringify(r.j))), 'fn_deploy', Object.keys(r.j)); }
ok(lastDeployMeta && lastDeployMeta.entrypoint_path === 'index.ts', 'fn_deploy: 진입점은 파일 이름만(예전 file:///… 경로가 겹치지 않음)', lastDeployMeta && lastDeployMeta.entrypoint_path);
{ const r = await call(P({ action: 'secrets_list' })); ok(r.j.ok && JSON.stringify(r.j).includes('SLACK_BOT_TOKEN') && !JSON.stringify(r.j).includes('"value"'), 'secrets_list: 이름만(값 없음)'); }
{ const r = await call(P({ action: 'secrets_set', name: 'SUPABASE_X', value: 'v' })); ok(!r.j.ok, 'secrets_set: SUPABASE_ 접두 거부', r.j.error); }
// 거부 경로
role = 'admin'; { const r = await call(P({ action: 'gh_list' })); ok(r.status === 403 && /슈퍼/.test(r.j.error), 'admin 역할 → 403', r.j.error); } role = 'super_admin';
email = 'stranger@example.com'; { const r = await call(P({ action: 'gh_list' })); ok(r.status === 403 && /지정된 계정/.test(r.j.error), 'OWNER 아님 → 403 + denied 로그', r.j.error); ok(logRows.some((l) => l.action === 'denied' && l.actor === 'stranger@example.com'), 'denied 가 ops_log 에 기록'); } email = OWNER;
// PIN 틀림 → 5회 → 잠금
{ let seen403 = 0, lockedAt = 0; for (let i = 0; i < 8; i++) { const r = await call({ action: 'gh_list', pin: '0000' }); if (r.status === 403 && /\/5\)/.test(r.j.error)) seen403++; if (r.status === 423) { lockedAt = i + 1; break; } }
  ok(seen403 >= 4 && lockedAt > 0 && lockedAt <= 6, 'PIN 틀림 누적(n/5) → 5회부터 423 잠금', { seen403, lockedAt });
  const r = await call(P({ action: 'gh_list' })); ok(r.status === 423, '잠금 중엔 맞는 PIN 도 423', r.j.error); }
ok(logRows.every((l) => !JSON.stringify(l).includes('ghp_test') && !JSON.stringify(l).includes('sbp_test') && !JSON.stringify(l).includes('7391')), 'ops_log 에 토큰·PIN 값 없음');
report('ops');
