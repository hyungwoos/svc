// ============================================================================
//  Supabase Edge Function: ops  (v1.4 · 2026-10-03 · APP_VER 를 <meta name="app-ver"> 에서도 읽음(㊿+136) · v1.3 gh_copy 하위 폴더 · v1.2 gh_delete · v1.1 gh_copy)
//   포탈 «관리자 › 배포·운영» 화면 뒤의 단일 중계 함수 — 포탈(공개 HTML)에는 어떤 토큰도 두지 않고 전부 여기 Secrets 에만.
//     · GitHub   : 저장소 파일 목록/내용 · 여러 파일을 커밋 하나로(Git Data API: blob → tree → commit → ref) · 파일 이력 · 이전 버전 복원
//     · Supabase : SQL 실행(Management API /database/query · 읽기 전용 토글) · Edge Function 목록/코드 조회/배포/Verify JWT · Secrets 이름 조회/설정/삭제
//     · 기록     : 모든 동작을 ops_log(SQL 85)에 · 선택: 슬랙 채널에 한 줄 알림
//   인증(모두 충족): ① 사용자 JWT ② 이메일이 OPS_OWNER 목록에 있음(이 기능은 지정한 사람만) ③ user_roles = super_admin ④ 작업 PIN == OPS_PIN(status 제외)
//     PIN 5회 틀리면 15분 잠금(ops_log 로 집계). 서비스 키·크론 경로 없음 — 사람이 포탈에서 누를 때만.
//   Secrets: OPS_OWNER(허용 이메일, 콤마 구분) · OPS_PIN · GITHUB_TOKEN(fine-grained · SVC 저장소 · Contents R/W) · 선택 GITHUB_REPO(기본 hyungwoos/svc) · 선택 GITHUB_BRANCH(기본 main)
//            MGMT_ACCESS_TOKEN(sbp_… Supabase 액세스 토큰 — 프로젝트 한정 fine-grained: Database SQL Write + Edge Functions Write) · 선택 OPS_SLACK_CHANNEL(+ SLACK_BOT_TOKEN 이 있을 때만 알림)
//   ★ 함수 설정 «Verify JWT» 는 끌 것(ask·remind 와 같게). 함수 이름(슬러그)은 반드시 ops.
// ============================================================================
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-ops-pin', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SB_URL = Deno.env.get('SUPABASE_URL') || '';
const SB_ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PROJECT_REF = (() => { try { return new URL(SB_URL).hostname.split('.')[0]; } catch { return ''; } })();
const OWNERS = (Deno.env.get('OPS_OWNER') || '').split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
const OPS_PIN = Deno.env.get('OPS_PIN') || '';
const GH_TOKEN = Deno.env.get('GITHUB_TOKEN') || '';
const GH_REPO = Deno.env.get('GITHUB_REPO') || 'hyungwoos/svc';   // 저장소 이름은 소문자 svc (Pages 주소도 /svc/ — 대소문자 구분)
const GH_BRANCH = Deno.env.get('GITHUB_BRANCH') || 'main';
const MGMT_TOKEN = Deno.env.get('MGMT_ACCESS_TOKEN') || '';   // Supabase 개인/프로젝트 액세스 토큰(sbp_…) — Secrets 이름은 SUPABASE_ 로 시작할 수 없어 MGMT_ACCESS_TOKEN
const MGMT = 'https://api.supabase.com';
const SLACK_TOKEN = Deno.env.get('SLACK_BOT_TOKEN') || '';
const OPS_SLACK = Deno.env.get('OPS_SLACK_CHANNEL') || '';

const MAX_TEXT = 3 * 1024 * 1024;        // 파일 내용 왕복 상한 (index.html ≈ 1.4MB)
const PIN_MAX_FAIL = 5, PIN_WINDOW_MIN = 15;

async function fetchT(url: string, opt: RequestInit = {}, ms = 20000): Promise<Response> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opt, signal: ctl.signal }); } finally { clearTimeout(t); }
}
function safeEq(a: string, b: string): boolean {   // 상수 시간 비교
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length; for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}
const b64enc = (s: string) => { const u = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(bin); };
const b64dec = (b: string) => { const bin = atob(b.replace(/\s/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(u); };
const b64bytes = (b: string) => { const bin = atob(b.replace(/\s/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const appVer = (text: string) => { const m = /name="app-ver" content="([^"]+)"/.exec(text) || /var APP_VER='([^']+)'/.exec(text); return m ? m[1] : null; };   // ㊿+136 meta 형식 + 예전 인라인 var

// ── ops_log ──
type LogRow = { actor: string; action: string; target?: string | null; summary?: string | null; ok: boolean; error?: string | null; ms?: number; detail?: unknown };
const svcHdr = () => ({ apikey: SB_SVC, Authorization: 'Bearer ' + SB_SVC, 'Content-Type': 'application/json' });
async function logOp(r: LogRow) {
  if (!SB_SVC) return;
  await fetchT(SB_URL + '/rest/v1/ops_log', { method: 'POST', headers: { ...svcHdr(), Prefer: 'return=minimal' }, body: JSON.stringify(r) }, 6000).catch(() => null);
}
async function pinFailures(actor: string): Promise<number> {
  if (!SB_SVC) return 0;
  const since = new Date(Date.now() - PIN_WINDOW_MIN * 60000).toISOString();
  const r = await fetchT(SB_URL + `/rest/v1/ops_log?select=id&actor=eq.${encodeURIComponent(actor)}&action=eq.pin_fail&at=gte.${encodeURIComponent(since)}`, { headers: svcHdr() }, 6000).catch(() => null);
  if (!r || !r.ok) return 0;
  const rows = await r.json().catch(() => []); return Array.isArray(rows) ? rows.length : 0;
}
async function recentLogs(n = 30) {
  if (!SB_SVC) return [];
  const r = await fetchT(SB_URL + `/rest/v1/ops_log?select=id,at,actor,action,target,summary,ok,error,ms&order=at.desc&limit=${n}`, { headers: svcHdr() }, 6000).catch(() => null);
  if (!r || !r.ok) return [];
  return await r.json().catch(() => []);
}
async function slackNote(text: string) {
  if (!SLACK_TOKEN || !OPS_SLACK) return;
  await fetchT('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { Authorization: 'Bearer ' + SLACK_TOKEN, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ channel: OPS_SLACK, text, unfurl_links: false }) }, 8000).catch(() => null);
}

// ── GitHub (Git Data API) ──
const ghHdr = () => ({ Authorization: 'Bearer ' + GH_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', 'User-Agent': 'svc-portal-ops' });
async function gh(path: string, init: RequestInit = {}, ms = 25000) {
  if (!GH_TOKEN) throw new Error('GITHUB_TOKEN 이 설정되지 않았습니다 (Edge Functions › Secrets)');
  const r = await fetchT(`https://api.github.com${path}`, { ...init, headers: { ...ghHdr(), ...(init.headers || {}) } }, ms);
  const txt = await r.text(); let j: any = null; try { j = JSON.parse(txt); } catch { /* not json */ }
  if (!r.ok) throw new Error(`GitHub ${r.status} ${path.split('?')[0]}: ${(j && j.message) || txt.slice(0, 200)}`);
  return j;
}
type GhTreeEntry = { path: string; type: string; sha: string; size?: number; mode: string };
async function ghTree(ref = GH_BRANCH): Promise<GhTreeEntry[]> {
  const t = await gh(`/repos/${GH_REPO}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  return (t.tree || []) as GhTreeEntry[];
}
async function ghBlobText(sha: string): Promise<string> {
  const b = await gh(`/repos/${GH_REPO}/git/blobs/${sha}`);
  if (b.encoding !== 'base64') return String(b.content || '');
  return b64dec(String(b.content || ''));
}
async function ghCommitFiles(files: { path: string; content_b64: string }[], message: string, actor: string) {
  const ref = await gh(`/repos/${GH_REPO}/git/ref/heads/${encodeURIComponent(GH_BRANCH)}`);
  const headSha = ref.object.sha as string;
  const head = await gh(`/repos/${GH_REPO}/git/commits/${headSha}`);
  const tree: unknown[] = [];
  for (const f of files) {
    const blob = await gh(`/repos/${GH_REPO}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: f.content_b64, encoding: 'base64' }) }, 60000);
    tree.push({ path: f.path.replace(/^\/+/, ''), mode: '100644', type: 'blob', sha: blob.sha });
  }
  const newTree = await gh(`/repos/${GH_REPO}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree }) });
  const commit = await gh(`/repos/${GH_REPO}/git/commits`, { method: 'POST', body: JSON.stringify({ message, tree: newTree.sha, parents: [headSha], author: { name: 'SVC 포탈', email: actor, date: new Date().toISOString() } }) });
  await gh(`/repos/${GH_REPO}/git/refs/heads/${encodeURIComponent(GH_BRANCH)}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
  return { sha: commit.sha as string, url: `https://github.com/${GH_REPO}/commit/${commit.sha}`, parent: headSha };
}

// ── Supabase Management API ──
async function mgmt(path: string, init: RequestInit = {}, ms = 60000): Promise<{ status: number; json: any; text: string; headers: Headers }> {
  if (!MGMT_TOKEN) throw new Error('MGMT_ACCESS_TOKEN 이 설정되지 않았습니다 (Edge Functions › Secrets · Account › Access Tokens 의 sbp_ 토큰)');
  const r = await fetchT(`${MGMT}${path}`, { ...init, headers: { Authorization: 'Bearer ' + MGMT_TOKEN, ...(init.headers || {}) } }, ms);
  const text = await r.text(); let j: any = null; try { j = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json: j, text, headers: r.headers };
}
function mgmtErr(r: { status: number; json: any; text: string }, what: string): never {
  const m = (r.json && (r.json.message || r.json.error || r.json.msg)) || r.text.slice(0, 300);
  throw new Error(`${what} 실패 (${r.status}): ${m}${r.status === 401 ? ' — MGMT_ACCESS_TOKEN 확인' : r.status === 403 ? ' — 토큰 권한(scope) 부족' : ''}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
  const t0 = Date.now();
  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: 'JSON 본문이 필요합니다' }, 400); }
  const action = String(body.action || '');

  // ── 인증 ① 사용자 ──
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ ok: false, error: '인증 필요' }, 401);
  const who = await fetchT(SB_URL + '/auth/v1/user', { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + token } }, 8000).catch(() => null);
  if (!who || !who.ok) return json({ ok: false, error: '로그인이 만료되었습니다' }, 401);
  const u = await who.json(); const actor = String(u.email || '').toLowerCase();
  // ── ② 지정한 사람만 ──
  if (!OWNERS.length) return json({ ok: false, error: 'OPS_OWNER 가 설정되지 않았습니다 — Edge Functions › Secrets 에 허용할 이메일을 넣으세요' }, 403);
  if (!OWNERS.includes(actor)) { await logOp({ actor, action: 'denied', target: action, ok: false, error: 'not owner' }); return json({ ok: false, error: '이 기능은 지정된 계정만 쓸 수 있습니다' }, 403); }
  // ── ③ super_admin ──
  const rr = await fetchT(SB_URL + '/rest/v1/user_roles?select=role', { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + token } }, 5000).catch(() => null);
  const roles = rr && rr.ok ? await rr.json() : [];
  if (!(Array.isArray(roles) && roles.some((x: any) => x && x.role === 'super_admin'))) return json({ ok: false, error: '슈퍼 관리자만 쓸 수 있습니다' }, 403);

  // ── status: PIN 없이 설정 상태만 ──
  if (action === 'status') {
    return json({ ok: true, actor, project_ref: PROJECT_REF, pin_set: !!OPS_PIN, owner_ok: true,
      github: { repo: GH_REPO, branch: GH_BRANCH, token_set: !!GH_TOKEN }, mgmt_token_set: !!MGMT_TOKEN, log_ok: !!SB_SVC,
      slack: !!(SLACK_TOKEN && OPS_SLACK), recent: await recentLogs(30) });
  }

  // ── ④ PIN ──
  if (!OPS_PIN) return json({ ok: false, error: 'OPS_PIN 이 설정되지 않았습니다 — Edge Functions › Secrets 에 작업 PIN 을 넣으세요' }, 403);
  const pin = String(body.pin ?? req.headers.get('x-ops-pin') ?? '');
  const fails = await pinFailures(actor);
  if (fails >= PIN_MAX_FAIL) return json({ ok: false, error: `PIN 을 ${PIN_MAX_FAIL}회 틀려 ${PIN_WINDOW_MIN}분 동안 잠겼습니다` }, 423);
  if (!pin || !safeEq(pin, OPS_PIN)) {
    await logOp({ actor, action: 'pin_fail', target: action, ok: false, error: 'wrong pin' });
    return json({ ok: false, error: `PIN 이 틀립니다 (${fails + 1}/${PIN_MAX_FAIL})` }, 403);
  }

  // ── 동작 ──
  let target: string | null = null, summary: string | null = null, detail: unknown = null, notify = '';
  try {
    let out: Record<string, unknown> = {};
    switch (action) {
      /* ── GitHub ── */
      case 'gh_list': {
        const tree = await ghTree();
        out = { repo: GH_REPO, branch: GH_BRANCH, files: tree.filter((e) => e.type === 'blob').map((e) => ({ path: e.path, size: e.size || 0, sha: e.sha })) };
        summary = `${(out.files as unknown[]).length}개 파일`; break;
      }
      case 'gh_get': {
        const path = String(body.path || '').replace(/^\/+/, ''); target = path;
        const e = (await ghTree(body.ref ? String(body.ref) : GH_BRANCH)).find((x) => x.type === 'blob' && x.path === path);
        if (!e) throw new Error(`저장소에 ${path} 가 없습니다`);
        if ((e.size || 0) > MAX_TEXT) throw new Error(`파일이 너무 큽니다 (${e.size} bytes)`);
        const text = await ghBlobText(e.sha);
        out = { path, size: e.size || text.length, sha: e.sha, app_ver: appVer(text), content: text }; summary = `${path} ${e.size}b`; break;
      }
      case 'gh_put': {
        const files = Array.isArray(body.files) ? body.files : [];
        if (!files.length) throw new Error('올릴 파일이 없습니다');
        const norm = files.map((f: any) => {
          const path = String(f.path || '').replace(/^\/+/, '');
          if (!path || /\.\.|^\.git\//.test(path)) throw new Error('잘못된 경로: ' + path);
          const content_b64 = f.content_b64 ? String(f.content_b64) : b64enc(String(f.content ?? ''));
          if (content_b64.length > MAX_TEXT * 1.4) throw new Error(`${path}: 파일이 너무 큽니다`);
          return { path, content_b64 };
        });
        const message = String(body.message || `포탈에서 배포 (${norm.map((f: any) => f.path).join(', ')})`).slice(0, 500);
        const c = await ghCommitFiles(norm, message, actor);
        target = norm.map((f: any) => f.path).join(', '); summary = message; detail = { sha: c.sha, parent: c.parent };
        notify = `🚀 GitHub 커밋 — ${target}\n${message}\n${c.url}`;
        out = { commit: c.sha, url: c.url, files: norm.map((f: any) => f.path), note: 'GitHub Pages 반영까지 보통 1~2분' }; break;
      }
      case 'gh_copy': {
        /* 한 폴더의 파일을 다른 폴더로 복사한 커밋 — blob 은 재업로드 없이 sha 로 재사용. src/dst = '' (루트) 또는 'staging'
           운영 → 스테이징 동기화(src '' → dst 'staging') · 스테이징 → 운영 승격(src 'staging' → dst ''). only=[경로…] 면 그 파일만 */
        const norm = (v: unknown) => String(v ?? '').replace(/^\/+|\/+$/g, '');
        const src = norm(body.src), dst = norm(body.dst);
        if (src === dst) throw new Error('원본과 대상 폴더가 같습니다');
        if (![src, dst].every((v) => v === '' || /^[a-z0-9_-]{1,32}$/i.test(v))) throw new Error('폴더 이름은 영문·숫자·-·_ (예: staging)');
        const SITE_FILE = /\.(html?|js|mjs|css|json|webmanifest|png|jpe?g|svg|ico|txt|xml)$/i;
        const only: string[] | null = Array.isArray(body.only) ? body.only.map((x: unknown) => String(x)) : null;
        const tree = await ghTree();
        // 운영(루트) 범위 = 저장소 루트 + 사이트 하위 폴더(js/ css/ img/ …) — staging/·tests/·supabase/·.github/·node_modules/ 는 제외 (v1.3: ㊿+134 가 js/·app.css 로 분리됨)
        const NOT_SITE = /^(staging|tests|supabase|node_modules|\.github)\//;
        const inSrc = tree.filter((e) => e.type === 'blob' && (src ? e.path.startsWith(src + '/') : !NOT_SITE.test(e.path)) && SITE_FILE.test(e.path) && !/^\.|\/\./.test(e.path));
        const pick = inSrc.filter((e) => { const rel = src ? e.path.slice(src.length + 1) : e.path; return !only || only.includes(rel); });
        if (!pick.length) throw new Error(src ? `${src}/ 에 복사할 파일이 없습니다` : '루트에 복사할 파일이 없습니다');
        const ref = await gh(`/repos/${GH_REPO}/git/ref/heads/${encodeURIComponent(GH_BRANCH)}`); const headSha = ref.object.sha as string;
        const head = await gh(`/repos/${GH_REPO}/git/commits/${headSha}`);
        const entries = pick.map((e) => ({ path: (dst ? dst + '/' : '') + (src ? e.path.slice(src.length + 1) : e.path), mode: '100644', type: 'blob', sha: e.sha }));
        const newTree = await gh(`/repos/${GH_REPO}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree: entries }) });
        const message = String(body.message || (dst === 'staging' ? `운영 → 스테이징 동기화 (${entries.length}개 파일)` : src === 'staging' ? `스테이징 → 운영 승격 (${entries.length}개 파일)` : `${src || '루트'} → ${dst || '루트'} 복사 (${entries.length}개 파일)`)).slice(0, 500);
        const commit = await gh(`/repos/${GH_REPO}/git/commits`, { method: 'POST', body: JSON.stringify({ message, tree: newTree.sha, parents: [headSha], author: { name: 'SVC 포탈', email: actor, date: new Date().toISOString() } }) });
        await gh(`/repos/${GH_REPO}/git/refs/heads/${encodeURIComponent(GH_BRANCH)}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
        target = `${src || '/'} → ${dst || '/'}`; summary = message; detail = { sha: commit.sha, files: entries.map((e) => e.path) };
        notify = `${src === 'staging' ? '🚀 스테이징 → 운영 승격' : '🧪 운영 → 스테이징 동기화'} — ${entries.length}개 파일\nhttps://github.com/${GH_REPO}/commit/${commit.sha}`;
        out = { commit: commit.sha, url: `https://github.com/${GH_REPO}/commit/${commit.sha}`, files: entries.map((e) => e.path), note: dst === 'staging' ? '스테이징 주소: 포탈 주소의 index.html 앞에 staging/ 를 넣어 여세요 (Pages 반영 1~2분)' : 'GitHub Pages 반영까지 보통 1~2분' }; break;
      }
      case 'gh_delete': {
        /* 파일 삭제 커밋 — tree 항목에 sha:null 을 주면 Git Data API 가 그 경로를 지운다(blob 업로드 없음). 여러 경로를 커밋 하나로.
           용도: 도장.jpg 처럼 공개 저장소에 있으면 안 되는 파일을 루트·staging/ 에서 함께 제거(SQL 87 비공개 Storage 로 옮긴 뒤). */
        const paths = (Array.isArray(body.paths) ? body.paths : [body.path]).map((x: unknown) => String(x ?? '').replace(/^\/+/, '')).filter(Boolean);
        if (!paths.length) throw new Error('지울 경로가 없습니다');
        for (const p of paths) if (/\.\.|^\.git\//.test(p) || /^\.github\//.test(p) || p === 'index.html' || p === 'staging/index.html') throw new Error('이 경로는 포탈에서 지울 수 없습니다: ' + p);
        const tree = await ghTree();
        const have = new Set(tree.filter((e) => e.type === 'blob').map((e) => e.path));
        const del = paths.filter((p) => have.has(p)), missing = paths.filter((p) => !have.has(p));
        if (!del.length) throw new Error('저장소에 없는 경로입니다: ' + missing.join(', '));
        const ref = await gh(`/repos/${GH_REPO}/git/ref/heads/${encodeURIComponent(GH_BRANCH)}`); const headSha = ref.object.sha as string;
        const head = await gh(`/repos/${GH_REPO}/git/commits/${headSha}`);
        const newTree = await gh(`/repos/${GH_REPO}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree: del.map((p) => ({ path: p, mode: '100644', type: 'blob', sha: null })) }) });
        const message = String(body.message || `저장소에서 삭제: ${del.join(', ')} (포탈)`).slice(0, 500);
        const commit = await gh(`/repos/${GH_REPO}/git/commits`, { method: 'POST', body: JSON.stringify({ message, tree: newTree.sha, parents: [headSha], author: { name: 'SVC 포탈', email: actor, date: new Date().toISOString() } }) });
        await gh(`/repos/${GH_REPO}/git/refs/heads/${encodeURIComponent(GH_BRANCH)}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
        target = del.join(', '); summary = message; detail = { sha: commit.sha, deleted: del, missing };
        notify = `🗑️ GitHub 파일 삭제 — ${del.join(', ')}\nhttps://github.com/${GH_REPO}/commit/${commit.sha}`;
        out = { commit: commit.sha, url: `https://github.com/${GH_REPO}/commit/${commit.sha}`, deleted: del, missing, note: 'Git 이력에는 남습니다 — 완전 삭제는 로컬 git filter-repo 가 필요' }; break;
      }
      case 'gh_history': {
        const path = String(body.path || '').replace(/^\/+/, ''); target = path;
        const n = Math.min(30, Math.max(1, Number(body.n) || 10));
        const cs = await gh(`/repos/${GH_REPO}/commits?sha=${encodeURIComponent(GH_BRANCH)}&per_page=${n}${path ? '&path=' + encodeURIComponent(path) : ''}`);
        out = { path, commits: (cs || []).map((c: any) => ({ sha: c.sha, short: String(c.sha).slice(0, 7), date: c.commit?.author?.date || c.commit?.committer?.date, message: String(c.commit?.message || '').split('\n')[0].slice(0, 140), author: c.commit?.author?.name, url: c.html_url })) };
        summary = `${(out.commits as unknown[]).length}건`; break;
      }
      case 'gh_restore': {
        const path = String(body.path || '').replace(/^\/+/, ''), ref = String(body.ref || ''); target = path;
        if (!path || !/^[0-9a-f]{7,40}$/i.test(ref)) throw new Error('path 와 커밋 sha 가 필요합니다');
        const e = (await ghTree(ref)).find((x) => x.type === 'blob' && x.path === path);
        if (!e) throw new Error(`${ref.slice(0, 7)} 에 ${path} 가 없습니다`);
        const blob = await gh(`/repos/${GH_REPO}/git/blobs/${e.sha}`);
        const content_b64 = blob.encoding === 'base64' ? String(blob.content).replace(/\s/g, '') : b64enc(String(blob.content || ''));
        const message = `되돌리기: ${path} ← ${ref.slice(0, 7)} (포탈)`;
        const c = await ghCommitFiles([{ path, content_b64 }], message, actor);
        summary = message; detail = { sha: c.sha, from: ref }; notify = `↩️ GitHub 되돌리기 — ${path} ← ${ref.slice(0, 7)}\n${c.url}`;
        out = { commit: c.sha, url: c.url, app_ver: blob.encoding === 'base64' ? appVer(b64dec(String(blob.content))) : null }; break;
      }
      /* ── Supabase: SQL ── */
      case 'sql_run': {
        const sql = String(body.sql || '').trim(); if (!sql) throw new Error('SQL 이 비어 있습니다');
        if (sql.length > 400000) throw new Error('SQL 이 너무 깁니다 (400KB)');
        const read_only = !!body.read_only;
        const r = await mgmt(`/v1/projects/${PROJECT_REF}/database/query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql, read_only }) }, 120000);
        if (r.status >= 300) { detail = { read_only, sql: sql.slice(0, 2000) }; mgmtErr(r, 'SQL'); }
        let rows: unknown = r.json; let truncated = false;
        if (Array.isArray(rows) && rows.length > 500) { rows = rows.slice(0, 500); truncated = true; }
        const stmts = sql.split(/;\s*(?:\n|$)/).filter((s) => s.trim()).length;
        target = `${stmts}개 문장${read_only ? ' · 읽기 전용' : ''}`; summary = sql.replace(/\s+/g, ' ').slice(0, 160); detail = { read_only, sql: sql.slice(0, 20000) };
        if (!read_only) notify = `🛠️ SQL 실행 (${stmts}개 문장) — ${actor}\n\`${summary}\``;
        out = { rows, row_count: Array.isArray(r.json) ? r.json.length : null, truncated, read_only }; break;
      }
      /* ── Supabase: Edge Functions ── */
      case 'fn_list': {
        const r = await mgmt(`/v1/projects/${PROJECT_REF}/functions`); if (r.status >= 300) mgmtErr(r, '함수 목록');
        out = { functions: (r.json || []).map((f: any) => ({ slug: f.slug, name: f.name, status: f.status, version: f.version, verify_jwt: f.verify_jwt, entrypoint_path: f.entrypoint_path, updated_at: f.updated_at, created_at: f.created_at })) };
        summary = `${(out.functions as unknown[]).length}개`; break;
      }
      case 'fn_get': {
        const slug = String(body.slug || ''); target = slug; if (!/^[a-z0-9_-]{1,64}$/i.test(slug)) throw new Error('slug 가 올바르지 않습니다');
        const meta = await mgmt(`/v1/projects/${PROJECT_REF}/functions/${slug}`); if (meta.status >= 300) mgmtErr(meta, '함수 정보');
        const files: { name: string; size: number; content: string | null }[] = [];
        const bodyR = await fetchT(`${MGMT}/v1/projects/${PROJECT_REF}/functions/${slug}/body`, { headers: { Authorization: 'Bearer ' + MGMT_TOKEN, Accept: 'multipart/form-data' } }, 60000);
        if (bodyR.ok) {
          const ct = bodyR.headers.get('content-type') || '';
          if (/multipart/i.test(ct)) {
            const fd = await new Response(bodyR.body, { headers: { 'content-type': ct } }).formData();
            for (const [k, v] of fd.entries()) {
              if (v instanceof File) { const txt = v.size <= MAX_TEXT ? await v.text() : null; files.push({ name: v.name || k, size: v.size, content: txt }); }
            }
          } else { const txt = await bodyR.text(); files.push({ name: meta.json?.entrypoint_path || 'index.ts', size: txt.length, content: txt.slice(0, MAX_TEXT) }); }
        }
        out = { meta: { slug: meta.json.slug, name: meta.json.name, version: meta.json.version, verify_jwt: meta.json.verify_jwt, entrypoint_path: meta.json.entrypoint_path, import_map_path: meta.json.import_map_path, updated_at: meta.json.updated_at }, files, body_status: bodyR.status };
        summary = `${slug} v${meta.json.version} · 파일 ${files.length}`; break;
      }
      case 'fn_deploy': {
        const slug = String(body.slug || ''); target = slug; if (!/^[a-z0-9_-]{1,64}$/i.test(slug)) throw new Error('slug 가 올바르지 않습니다 (영문·숫자·-·_)');
        const files = Array.isArray(body.files) ? body.files.filter((f: any) => f && typeof f.content === 'string' && f.content.trim()) : [];
        if (!files.length) throw new Error('배포할 코드가 없습니다');
        let entry = String(body.entrypoint_path || '');
        let verify = body.verify_jwt === true;   // 기본 끔 (ask·remind·ops 모두 함수 안에서 토큰 검사)
        const cur = await mgmt(`/v1/projects/${PROJECT_REF}/functions/${slug}`);
        const exists = cur.status < 300;
        if (exists && body.verify_jwt == null) verify = !!cur.json?.verify_jwt;
        if (!entry) entry = (exists && cur.json?.entrypoint_path) ? String(cur.json.entrypoint_path) : 'index.ts';
        const entryBase = entry.split('/').pop() || 'index.ts';
        const fd = new FormData();
        const meta: Record<string, unknown> = { name: String(body.name || cur.json?.name || slug), entrypoint_path: entry, verify_jwt: verify };
        if (exists && cur.json?.import_map_path) meta.import_map_path = cur.json.import_map_path;
        fd.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
        const names: string[] = [];
        files.forEach((f: any, i: number) => {
          let name = String(f.name || (i === 0 ? entryBase : `file${i}.ts`));
          if (files.length === 1 && name !== entry && name !== entryBase) name = entry;      // 파일 하나면 진입점 이름으로
          else if (name === entryBase && entry !== entryBase) name = entry;
          names.push(name);
          fd.append('file', new Blob([f.content], { type: 'application/typescript' }), name);
        });
        const r = await mgmt(`/v1/projects/${PROJECT_REF}/functions/deploy?slug=${encodeURIComponent(slug)}`, { method: 'POST', body: fd }, 120000);
        if (r.status >= 300) mgmtErr(r, '함수 배포');
        summary = `${slug} → v${r.json?.version} · verify_jwt ${verify ? 'on' : 'off'} · ${names.join(', ')}`; detail = { version: r.json?.version, entry, verify, files: names, bytes: files.reduce((a: number, f: any) => a + f.content.length, 0) };
        notify = `⚡ Edge Function 배포 — ${summary}`;
        out = { slug, version: r.json?.version, verify_jwt: r.json?.verify_jwt, entrypoint_path: r.json?.entrypoint_path, created: !exists, url: `${SB_URL}/functions/v1/${slug}` }; break;
      }
      case 'fn_patch': {
        const slug = String(body.slug || ''); target = slug; if (!/^[a-z0-9_-]{1,64}$/i.test(slug)) throw new Error('slug 가 올바르지 않습니다');
        const patch: Record<string, unknown> = {}; if (body.verify_jwt != null) patch.verify_jwt = !!body.verify_jwt; if (body.name) patch.name = String(body.name);
        const r = await mgmt(`/v1/projects/${PROJECT_REF}/functions/${slug}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
        if (r.status >= 300) mgmtErr(r, '함수 설정');
        summary = `${slug} ${JSON.stringify(patch)}`; notify = `⚙️ Edge Function 설정 — ${summary}`;
        out = { slug, verify_jwt: r.json?.verify_jwt, version: r.json?.version }; break;
      }
      /* ── Supabase: Secrets (값은 절대 돌려주지 않음) ── */
      case 'secrets_list': {
        const r = await mgmt(`/v1/projects/${PROJECT_REF}/secrets`); if (r.status >= 300) mgmtErr(r, 'Secrets 목록');
        out = { names: (r.json || []).map((s: any) => s.name).filter(Boolean).sort() }; summary = `${(out.names as unknown[]).length}개`; break;
      }
      case 'secrets_set': {
        const name = String(body.name || '').trim(), value = String(body.value ?? ''); target = name;
        if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(name)) throw new Error('이름은 대문자·숫자·_ (예: SLACK_BOT_TOKEN)');
        if (/^SUPABASE_/.test(name)) throw new Error('SUPABASE_ 로 시작하는 이름은 예약돼 있습니다');
        if (!value) throw new Error('값이 비어 있습니다');
        const r = await mgmt(`/v1/projects/${PROJECT_REF}/secrets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([{ name, value }]) });
        if (r.status >= 300) mgmtErr(r, 'Secret 설정');
        summary = `${name} 설정 (${value.length}자)`; notify = `🔑 Secret 설정 — ${name}`;
        out = { name, note: 'Secrets 를 읽는 함수는 다시 배포해야 새 값을 씁니다' }; break;
      }
      case 'secrets_delete': {
        const names = (Array.isArray(body.names) ? body.names : [body.name]).map((s: unknown) => String(s || '').trim()).filter((s: string) => /^[A-Z][A-Z0-9_]{1,63}$/.test(s) && !/^SUPABASE_/.test(s));
        if (!names.length) throw new Error('지울 이름이 없습니다'); target = names.join(', ');
        const r = await mgmt(`/v1/projects/${PROJECT_REF}/secrets`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(names) });
        if (r.status >= 300) mgmtErr(r, 'Secret 삭제');
        summary = `${names.join(', ')} 삭제`; notify = `🗑️ Secret 삭제 — ${names.join(', ')}`; out = { names }; break;
      }
      default: throw new Error('알 수 없는 action: ' + action);
    }
    const ms = Date.now() - t0;
    await logOp({ actor, action, target, summary, ok: true, ms, detail });
    if (notify) slackNote(notify + `\n_${actor} · 포탈 배포·운영_`);
    return json({ ok: true, action, ms, ...out });
  } catch (e) {
    const msg = String((e as Error).message || e);
    await logOp({ actor, action, target, summary, ok: false, error: msg.slice(0, 1000), ms: Date.now() - t0, detail });
    return json({ ok: false, action, error: msg }, 400);
  }
});
