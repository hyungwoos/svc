/**
 * Genians 견적 시스템 - GitHub 저장/조회 프록시 (Cloudflare Worker) — v2 (포탈 로그인 토큰 검증)
 *
 * v1 → v2 (2026-10-04)
 *  · 인증: 팀 공용 비밀번호(X-Access-Password) → 포탈 로그인 토큰(Authorization: Bearer <Supabase JWT>)
 *      - Supabase /auth/v1/user 로 토큰 검증(로그아웃·만료 즉시 반영) → user_roles 로 역할 → has_perm('quote', read|write) 로 메뉴 권한
 *      - 2단계 인증(MFA)을 켠 계정이 코드 확인 없이 받은 토큰은 SQL 88 정책 때문에 역할 조회가 비어 → 자동으로 거부됨
 *      - 검증 결과는 토큰별로 60초 캐시(같은 Worker 인스턴스 안)
 *  · 전환 기간: ACCESS_PASSWORD 시크릿이 남아 있고 오늘(KST)이 LEGACY_UNTIL(기본 2026-10-18) 이하면 옛 비밀번호도 받음
 *      → ACCESS_PASSWORD 시크릿을 지우면 그 즉시 비밀번호 방식 종료 (지운 뒤엔 코드 수정 불필요)
 *  · 권한: 목록·열기 = QUOTE_READ_ROLES · 저장 = QUOTE_WRITE_ROLES · 삭제 = QUOTE_DELETE_ROLES (기본값 아래 DEFAULTS)
 *  · 경로 제한: /load · /delete 는 GITHUB_FOLDER 바로 아래 .json/.pdf 파일만 (v1 은 저장소 아무 파일이나 읽고 지울 수 있었음)
 *              /save 의 fileName 은 슬래시·역슬래시·제어문자 없는 .json/.pdf 이름만 (폴더 밖으로 못 나감)
 *  · CORS: ALLOWED_ORIGINS(기본 https://hyungwoos.github.io) 에서 온 브라우저 요청만 · 다른 사이트의 브라우저 요청은 403
 *  · 기록: 저장·삭제는 커밋 메시지에 «by 이메일» + 포탈 change_log(quote_save / quote_delete) · 비밀번호 방식 사용은 Workers 로그에 경고
 *  · 응답에 Cache-Control: no-store (견적 = 고객 정보)
 *
 * [배포 방법 — 대시보드]
 *  Workers & Pages → aged-union-cdd3 → Edit code → 이 파일 전체로 교체 → Deploy
 *  기존 시크릿(GITHUB_TOKEN · GITHUB_OWNER · GITHUB_REPO · GITHUB_BRANCH · GITHUB_FOLDER · ACCESS_PASSWORD) 그대로 사용 — 새로 넣을 값 없음
 *  선택 변수(Text): SUPABASE_URL · SUPABASE_ANON_KEY(공개 키) · ALLOWED_ORIGINS · LEGACY_UNTIL(YYYY-MM-DD)
 *                   QUOTE_READ_ROLES · QUOTE_WRITE_ROLES · QUOTE_DELETE_ROLES (쉼표 구분 역할 이름)
 *  ※ Supabase 서비스 키(관리자 키)는 이 Worker 에 넣지 않습니다 (필요 없음 — 사용자 본인 토큰으로만 조회)
 */

const DEFAULTS = {
  SUPABASE_URL: 'https://amzbrdhkvzsyxjfjtugu.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_s_BGJf84vUQoASbT8F0H4g_L2MBOGZF',   // 공개(publishable) 키 — 포탈 HTML 에도 있는 값
  ALLOWED_ORIGINS: 'https://hyungwoos.github.io',
  LEGACY_UNTIL: '2026-10-18',
  QUOTE_READ_ROLES: 'super_admin,admin,admin_viewer',
  QUOTE_WRITE_ROLES: 'super_admin,admin,admin_viewer',   // 견적서 PDF 발행 때 자동 저장되므로 조회 전용 관리자도 기본 허용 — 막으려면 변수로 'super_admin,admin'
  QUOTE_DELETE_ROLES: 'super_admin,admin',
};
const CACHE_MS = 60 * 1000;
const MAX_SAVE_B64 = 8 * 1024 * 1024;         // 저장 본문(base64) 상한 8MB
const authCache = new Map();                   // sha256(token) → { at, exp, user }

const conf = (env, k) => (env && env[k] != null && String(env[k]).trim() !== '' ? String(env[k]).trim() : DEFAULTS[k]);
const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

function jwtPayload(t) {
  try {
    const p = t.split('.')[1]; if (!p) return null;
    const b = p.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b + '='.repeat((4 - (b.length % 4)) % 4)), (c) => c.charCodeAt(0))));
  } catch { return null; }
}
async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function safeEq(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || !b || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
// 파일 이름: 한 단계(슬래시 없음) · 제어문자 없음 · 점으로 시작 안 함 · .json/.pdf · 200자 이하
const NAME_OK = (n) => typeof n === 'string' && n.length > 5 && n.length <= 200 && !/[\/\\\u0000-\u001f\u007f]/.test(n) && !n.startsWith('.') && /\.(json|pdf)$/i.test(n);

/** 포탈 로그인 토큰 검증 → { email, role, read, write, del } 또는 { error, status } */
async function verifyUser(token, env) {
  const p = jwtPayload(token);
  if (!p || !p.exp) return { error: '로그인 정보가 올바르지 않습니다 — 포탈에서 다시 로그인해 주세요', status: 401 };
  const nowS = Math.floor(Date.now() / 1000);
  if (p.exp <= nowS) return { error: '로그인이 만료되었습니다 — 포탈을 새로고침하거나 다시 로그인해 주세요', status: 401 };
  const key = await sha256(token);
  const hit = authCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS && hit.exp > nowS) return hit.user;

  const SB = conf(env, 'SUPABASE_URL').replace(/\/+$/, ''), ANON = conf(env, 'SUPABASE_ANON_KEY');
  const h = { apikey: ANON, Authorization: 'Bearer ' + token };
  const who = await fetch(SB + '/auth/v1/user', { headers: h });
  if (!who.ok) return { error: '로그인이 만료되었거나 올바르지 않습니다 — 포탈에서 다시 로그인해 주세요', status: 401 };
  const u = await who.json().catch(() => ({}));
  const email = String(u.email || '').toLowerCase();

  const [rr, pr, pw] = await Promise.all([
    fetch(SB + '/rest/v1/user_roles?select=role', { headers: h }),
    fetch(SB + '/rest/v1/rpc/has_perm', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_view: 'quote', p_level: 'read' }) }),
    fetch(SB + '/rest/v1/rpc/has_perm', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_view: 'quote', p_level: 'write' }) }),
  ]);
  const roles = rr.ok ? await rr.json().catch(() => []) : [];
  const role = Array.isArray(roles) && roles[0] ? String(roles[0].role || '') : '';
  // has_perm 이 없거나(SQL 79 전) 실패하면 역할만으로 판단
  const permRead = pr.ok ? (await pr.json().catch(() => true)) !== false : true;
  const permWrite = pw.ok ? (await pw.json().catch(() => true)) !== false : true;

  const user = {
    email, role, auth: 'jwt',
    read: list(conf(env, 'QUOTE_READ_ROLES')).includes(role) && permRead,
    write: list(conf(env, 'QUOTE_WRITE_ROLES')).includes(role) && permWrite,
    del: list(conf(env, 'QUOTE_DELETE_ROLES')).includes(role) && permWrite,
  };
  if (!role) user.why = '역할이 지정되지 않은 계정이거나, 2단계 인증 코드 확인이 끝나지 않은 로그인입니다';
  authCache.set(key, { at: Date.now(), exp: p.exp, user });
  if (authCache.size > 300) { const old = [...authCache.keys()].slice(0, 100); old.forEach((k) => authCache.delete(k)); }
  return user;
}

/** 포탈 change_log 에 남김 (사용자 토큰 · 실패해도 무시) */
function audit(ctx, env, token, user, action, path, detail) {
  if (!token || !user || user.auth !== 'jwt') return;
  const SB = conf(env, 'SUPABASE_URL').replace(/\/+$/, '');
  const p = fetch(SB + '/rest/v1/change_log', {
    method: 'POST',
    headers: { apikey: conf(env, 'SUPABASE_ANON_KEY'), Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ actor: user.email, action, target: 'quote', target_id: path, detail }),
  }).catch(() => null);
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(p);
  return p;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowed = list(conf(env, 'ALLOWED_ORIGINS'));
    const originOk = !origin || allowed.includes(origin);

    const corsHeaders = {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Access-Password',
      'Access-Control-Max-Age': '600',
      'Vary': 'Origin',
      'Cache-Control': 'no-store',
    };
    if (origin && originOk) corsHeaders['Access-Control-Allow-Origin'] = origin;

    const jsonResponse = (data, status = 200, extra = {}) =>
      new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, ...extra, 'Content-Type': 'application/json; charset=utf-8' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: originOk ? 204 : 403, headers: corsHeaders });
    if (!originOk) return jsonResponse({ error: '허용되지 않은 사이트에서 온 요청입니다.' }, 403);

    // ── 인증 ──────────────────────────────────────
    const bearer = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const legacyPw = request.headers.get('X-Access-Password') || '';
    let user = null, token = '', deprecated = false;
    if (bearer) {
      token = bearer;
      const v = await verifyUser(bearer, env).catch((e) => ({ error: '인증 서버 확인 실패: ' + (e && e.message || e), status: 502 }));
      if (v.error) return jsonResponse({ error: v.error }, v.status);
      user = v;
    } else if (legacyPw) {
      const until = conf(env, 'LEGACY_UNTIL');
      if (!env.ACCESS_PASSWORD) return jsonResponse({ error: '비밀번호 방식은 종료되었습니다 — 포탈에 로그인한 상태에서 견적 시스템을 열어 주세요.' }, 401);
      if (kstToday() > until) return jsonResponse({ error: `비밀번호 방식은 ${until} 에 종료되었습니다 — 포탈에 로그인한 상태에서 견적 시스템을 열어 주세요.` }, 401);
      if (!safeEq(legacyPw, env.ACCESS_PASSWORD)) return jsonResponse({ error: '비밀번호가 올바르지 않습니다.' }, 401);
      user = { email: 'legacy-password', role: 'legacy', auth: 'legacy', read: true, write: true, del: true };
      deprecated = true;
      console.warn(`[quote-worker] 옛 비밀번호 방식 사용 — ${request.method} ${url.pathname} · origin=${origin || '-'} · ${until} 까지만 허용`);
    } else {
      return jsonResponse({ error: '포탈 로그인이 필요합니다.' }, 401);
    }
    const extra = deprecated ? { 'X-Auth-Deprecated': 'password' } : {};
    const deny = (what) => jsonResponse({ error: `${what} 권한이 없습니다` + (user.why ? ` (${user.why})` : ` (계정 역할: ${user.role || '없음'})`) }, 403, extra);

    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    const branch = env.GITHUB_BRANCH || 'main';
    const folder = (env.GITHUB_FOLDER || 'quotes').replace(/^\/+|\/+$/g, '');
    const ghToken = env.GITHUB_TOKEN;
    if (!owner || !repo || !ghToken) {
      return jsonResponse({ error: 'Worker 환경변수(GITHUB_OWNER/GITHUB_REPO/GITHUB_TOKEN)가 설정되지 않았습니다.' }, 500, extra);
    }
    const ghHeaders = { 'Authorization': `Bearer ${ghToken}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'genians-quote-proxy' };
    const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
    const inFolder = (p) => { const s = String(p || ''); return s.startsWith(folder + '/') && NAME_OK(s.slice(folder.length + 1)); };
    const by = user.auth === 'jwt' ? ` · by ${user.email}` : ' · by 공용 비밀번호';

    try {
      // ── 저장: POST /save { fileName, content(base64), message } ──
      if (url.pathname === '/save' && request.method === 'POST') {
        if (!user.write) return deny('저장');
        const body = await request.json().catch(() => ({}));
        if (!body.fileName || !body.content) return jsonResponse({ error: 'fileName, content는 필수입니다.' }, 400, extra);
        if (!NAME_OK(body.fileName)) return jsonResponse({ error: '파일 이름이 올바르지 않습니다 (슬래시 없이 .json/.pdf).' }, 400, extra);
        if (typeof body.content !== 'string' || body.content.length > MAX_SAVE_B64 || !/^[A-Za-z0-9+/=\r\n]+$/.test(body.content)) return jsonResponse({ error: '내용이 너무 크거나 base64 형식이 아닙니다.' }, 400, extra);

        const path = `${folder}/${body.fileName}`;
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${enc(path)}`, {
          method: 'PUT',
          headers: { ...ghHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: String(body.message || `견적 저장: ${body.fileName}`).slice(0, 300) + by, content: body.content, branch }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return jsonResponse({ error: data.message || `GitHub 오류 (HTTP ${res.status})` }, res.status, extra);
        audit(ctx, env, token, user, 'quote_save', path, { bytes: Math.round(body.content.length * 0.75) });
        return jsonResponse({ ok: true, path }, 200, extra);
      }

      // ── 목록 조회: GET /list ──
      if (url.pathname === '/list' && request.method === 'GET') {
        if (!user.read) return deny('조회');
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${enc(folder)}?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders });
        if (res.status === 404) return jsonResponse({ files: [] }, 200, extra);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return jsonResponse({ error: data.message || `GitHub 오류 (HTTP ${res.status})` }, res.status, extra);
        const files = (Array.isArray(data) ? data : [])
          .filter((f) => f.type === 'file' && /\.(json|pdf)$/i.test(f.name))
          .map((f) => ({ name: f.name, path: f.path }))
          .sort((a, b) => b.name.localeCompare(a.name));
        return jsonResponse({ files }, 200, extra);
      }

      // ── 개별 파일 불러오기: GET /load?path=quotes/xxx.json 또는 xxx.pdf ──
      if (url.pathname === '/load' && request.method === 'GET') {
        if (!user.read) return deny('조회');
        const filePath = url.searchParams.get('path');
        if (!filePath) return jsonResponse({ error: 'path 파라미터가 필요합니다.' }, 400, extra);
        if (!inFolder(filePath)) return jsonResponse({ error: `견적 폴더(${folder}/) 안의 .json/.pdf 파일만 열 수 있습니다.` }, 400, extra);
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${enc(filePath)}?ref=${encodeURIComponent(branch)}`, { headers: { ...ghHeaders, 'Accept': 'application/vnd.github.raw' } });
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          return jsonResponse({ error: `GitHub 오류 (HTTP ${res.status}): ${errText.slice(0, 200)}` }, res.status, extra);
        }
        const contentType = /\.pdf$/i.test(filePath) ? 'application/pdf' : 'application/json; charset=utf-8';
        const buf = await res.arrayBuffer();
        return new Response(buf, { headers: { ...corsHeaders, ...extra, 'Content-Type': contentType } });
      }

      // ── 삭제: POST /delete { path, message } ──
      if (url.pathname === '/delete' && request.method === 'POST') {
        if (!user.del) return deny('삭제');
        const body = await request.json().catch(() => ({}));
        if (!body.path) return jsonResponse({ error: 'path는 필수입니다.' }, 400, extra);
        if (!inFolder(body.path)) return jsonResponse({ error: `견적 폴더(${folder}/) 안의 .json/.pdf 파일만 지울 수 있습니다.` }, 400, extra);
        const encodedPath = enc(body.path);
        const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders });
        if (!getRes.ok) {
          const errData = await getRes.json().catch(() => ({}));
          return jsonResponse({ error: errData.message || `파일 조회 실패 (HTTP ${getRes.status})` }, getRes.status, extra);
        }
        const fileData = await getRes.json();
        const delRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`, {
          method: 'DELETE',
          headers: { ...ghHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: String(body.message || `견적 삭제: ${body.path}`).slice(0, 300) + by, sha: fileData.sha, branch }),
        });
        const delData = await delRes.json().catch(() => ({}));
        if (!delRes.ok) return jsonResponse({ error: delData.message || `삭제 실패 (HTTP ${delRes.status})` }, delRes.status, extra);
        audit(ctx, env, token, user, 'quote_delete', body.path, {});
        return jsonResponse({ ok: true }, 200, extra);
      }

      // ── 상태 확인: GET /whoami (포탈 «시스템 점검»·문제 확인용 — 누가 어떤 권한으로 보이는지) ──
      if (url.pathname === '/whoami' && request.method === 'GET') {
        return jsonResponse({ ok: true, email: user.email, role: user.role, auth: user.auth, read: user.read, write: user.write, delete: user.del, legacy_until: env.ACCESS_PASSWORD ? conf(env, 'LEGACY_UNTIL') : null, version: 2 }, 200, extra);
      }

      return jsonResponse({ error: 'Not found. /save, /list, /load, /delete, /whoami 중 하나로 요청하세요.' }, 404, extra);
    } catch (err) {
      return jsonResponse({ error: (err && err.message) || String(err) }, 500, extra);
    }
  },
};
