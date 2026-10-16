// ============================================================================
//  Supabase Edge Function: watch  (v1.0 · 2026-10-16 · ㊿+209) — 운영 감시(선택 · 기본 꺼짐)
//   포탈이 의존하는 것들이 살아 있는지 한 번에 보고 기록(watch_log) · 문제가 생기거나 풀리면 Slack(선택)
//   세 가지로만 불림:
//    ① 자동(15분마다): DB 의 watch_tick()(pg_cron svc-watch)이 자동 감시를 켰을 때만 { cron: 일회용 번호 } 로 부름
//       · 번호가 watch_run 에 있고(10분 안 · 아직 안 씀) 쓰는 순간 «씀»으로 바뀌어야만 진행 — 아무나 불러도 점검 · 발송 안 함
//    ② 지금 점검: 포탈(배포·운영 › 기록 › 운영 감시)에서 슈퍼 관리자가 { mode:'run' } — Slack 은 보내지 않음 · { mode:'slack_test' } = 시험 한 줄
//    ③ 배포 뒤 확인: 승격한 뒤 포탈이 { mode:'deploy', expect:'2026-09-16 ㊿+209' } — 운영 포탈 버전이 맞는지 + 같은 점검 · 실패면 Slack(켠 경우)
//   점검: 포탈 사이트(운영 index · 버전 · 시작 파일) · 함수(ask · export · notify · remind · ops · aicheck — 응답하는지만 · OPTIONS)
//         · DB(watch_db — 야간 백업 · 브라우저 오류 · 처음 열기 속도 · 자동 작업 실패 · 서버 호출 실패 · 야간 AI 점검) · GitHub Actions 마지막 실행(토큰 있으면)
//   Slack: watch_settings.slack_on 과 알림 설정 «Slack 사용»(notify_settings.slack_on)이 둘 다 켜져 있고 SLACK_BOT_TOKEN 이 있을 때만
//          · 같은 문제는 repeat_h 시간마다 한 번 · 정상으로 돌아오면 한 번 · 채널 = 설정 channel → OPS_SLACK_CHANNEL → 알림 설정 팀 채널
//   Secrets(전부 있는 것 · 새 것 없음): SLACK_BOT_TOKEN · 선택 OPS_SLACK_CHANNEL · PORTAL_URL(기본 https://svc.genians.co.kr) · GITHUB_TOKEN · GITHUB_REPO · GITHUB_BRANCH · 선택 WATCH_FUNCS
//   ★ 배포: 이름 watch · «Verify JWT» 끔(notify · ops 와 같게 — 자동 호출 · 포탈 CORS). 이 함수가 직접 확인합니다.
//   기록: watch_log(항목 이름 · 상태 · 짧은 설명만 — 업무 데이터 · 토큰 없음)
// ============================================================================
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SB_URL = Deno.env.get('SUPABASE_URL') || '';
const SB_ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SLACK_TOKEN = Deno.env.get('SLACK_BOT_TOKEN') || '';
const OPS_SLACK = Deno.env.get('OPS_SLACK_CHANNEL') || '';
const PORTAL = (Deno.env.get('PORTAL_URL') || 'https://svc.genians.co.kr').replace(/\/+$/, '');
const GH_TOKEN = Deno.env.get('GITHUB_TOKEN') || '';
const GH_REPO = Deno.env.get('GITHUB_REPO') || 'hyungwoos/svc';
const GH_BRANCH = Deno.env.get('GITHUB_BRANCH') || 'main';
const FUNCS = (Deno.env.get('WATCH_FUNCS') || 'ask,export,notify,remind,ops,aicheck').split(',').map((s) => s.trim()).filter((s) => /^[a-z0-9-]{2,40}$/.test(s)).slice(0, 12);
const NONCE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHANNEL = /^[CG][A-Z0-9]{6,20}$/;
export const VER = 'v1.0';

type Sev = 'ok' | 'warn' | 'bad' | 'skip';
export type Item = { k: string; name: string; sev: Sev; info: string; ms?: number };
type Set = { auto_on?: boolean; slack_on?: boolean; inbox_on?: boolean; channel?: string | null; err_24h?: number; boot_p90_ms?: number; backup_h?: number; repeat_h?: number };

async function fetchT(url: string, opt: RequestInit = {}, ms = 10000): Promise<Response> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opt, signal: ctl.signal }); } finally { clearTimeout(t); }
}
const rest = (path: string, key: string, init: RequestInit = {}) =>
  fetchT(SB_URL + '/rest/v1/' + path, { ...init, headers: { apikey: key === SB_SVC ? SB_SVC : SB_ANON, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', ...(init.headers || {}) } }, 10000);
async function one<T>(path: string): Promise<T | null> {
  const r = await rest(path, SB_SVC).catch(() => null); if (!r || !r.ok) return null;
  const j = await r.json().catch(() => null); return Array.isArray(j) ? (j[0] ?? null) as T : null;
}
const short = (s: unknown, n = 140) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);
export function verOf(html: string): string { const m = /<meta name="app-ver" content="([^"]+)">/.exec(html); return m ? m[1] : ''; }

/** 포탈 사이트 — 운영 index · 버전(배포 확인이면 기대 버전) · 첫 시작 파일(js/main.js?v=…) */
async function checkSite(expect: string): Promise<Item[]> {
  const out: Item[] = []; const t0 = Date.now();
  const r = await fetchT(PORTAL + '/index.html?nocache=' + Date.now(), { headers: { 'Cache-Control': 'no-cache' } }, 15000).catch((e) => e as Error);
  if (r instanceof Error || !r.ok) { out.push({ k: 'site', name: '포탈 사이트', sev: 'bad', info: r instanceof Error ? '응답 없음(15초) — ' + short(r.message, 60) : 'HTTP ' + r.status }); return out; }
  const html = await r.text(), ver = verOf(html), ms = Date.now() - t0;
  if (!ver) { out.push({ k: 'site', name: '포탈 사이트', sev: 'bad', info: '버전 표시(app-ver)가 없음 — 배포 파일 확인', ms }); return out; }
  if (expect && ver !== expect) out.push({ k: 'site', name: '포탈 사이트', sev: 'bad', info: `운영 버전 ${ver} — 기대 ${expect}(승격 반영 전이거나 실패)`, ms });
  else out.push({ k: 'site', name: '포탈 사이트', sev: ms > 8000 ? 'warn' : 'ok', info: ver + ' · ' + (ms / 1000).toFixed(1) + '초', ms });
  const src = /<script type="module" src="([^"]+)"/.exec(html);
  if (src) {
    const u = new URL(src[1].replace(/&amp;/g, '&'), PORTAL + '/').toString();
    const m = await fetchT(u, {}, 15000).catch(() => null);
    out.push(m && m.ok ? { k: 'site_js', name: '포탈 시작 파일', sev: 'ok', info: 'js/main.js 받음' } : { k: 'site_js', name: '포탈 시작 파일', sev: 'bad', info: 'js/main.js 를 받지 못함(' + (m ? 'HTTP ' + m.status : '응답 없음') + ') — 배포가 반만 됐을 수 있음' });
    await m?.body?.cancel().catch(() => null);
  }
  return out;
}
/** 함수 — 응답하는지만(OPTIONS · 본문 없음 · 일을 시키지 않음) · 404 = 배포 안 됨 · 5xx/시간 초과 = 문제 */
async function checkFuncs(): Promise<Item[]> {
  return await Promise.all(FUNCS.map(async (f): Promise<Item> => {
    const t0 = Date.now();
    const r = await fetchT(SB_URL + '/functions/v1/' + f, { method: 'OPTIONS', headers: { Origin: PORTAL, 'Access-Control-Request-Method': 'POST' } }, 12000).catch(() => null);
    const ms = Date.now() - t0; await r?.body?.cancel().catch(() => null);
    if (!r) return { k: 'fn:' + f, name: '함수 ' + f, sev: 'bad', info: '응답 없음(12초)', ms };
    if (r.status === 404) return { k: 'fn:' + f, name: '함수 ' + f, sev: 'bad', info: '없음(404) — 배포되지 않음', ms };
    if (r.status >= 500) return { k: 'fn:' + f, name: '함수 ' + f, sev: 'bad', info: 'HTTP ' + r.status, ms };
    return { k: 'fn:' + f, name: '함수 ' + f, sev: ms > 8000 ? 'warn' : 'ok', info: (ms / 1000).toFixed(1) + '초', ms };
  }));
}
/** DB 숫자 → 항목 (기준은 설정) */
export function dbItems(d: Record<string, any> | null, s: Set, now = Date.now()): Item[] {
  if (!d) return [{ k: 'db', name: 'DB 상태', sev: 'bad', info: 'watch_db() 를 읽지 못함 — SQL 123 실행 · DB 상태 확인' }];
  const out: Item[] = [{ k: 'db', name: 'DB 상태', sev: 'ok', info: (d.db_mb != null ? d.db_mb + 'MB' : '응답함') }];
  const bh = Number(s.backup_h) || 30, b = d.backup || {};
  if (b.schema === false) out.push({ k: 'backup', name: '야간 백업', sev: 'warn', info: 'snap 스키마 없음 — SQL 86 · 자동 작업 확인' });
  else if (!b.last_day) out.push({ k: 'backup', name: '야간 백업', sev: 'bad', info: '백업이 한 번도 없음 — svc-snap-nightly 확인' });
  else {
    const day = String(b.last_day), at = Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8), 18, 10), h = Math.round((now - at) / 36e5);
    out.push({ k: 'backup', name: '야간 백업', sev: h > bh * 2 ? 'bad' : h > bh ? 'warn' : 'ok', info: `마지막 ${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)} (${Math.max(0, h)}시간 전)` });
  }
  if (d.errors) { const n = Number(d.errors.n24) || 0, lim = Number(s.err_24h) || 30;
    out.push({ k: 'errors', name: '브라우저 오류(24시간)', sev: n > lim * 3 ? 'bad' : n > lim ? 'warn' : 'ok', info: `${n}건 · ${Number(d.errors.users24) || 0}명` + (n && d.errors.top ? ' · 가장 많은 것: ' + short(d.errors.top, 80) : '') }); }
  if (d.perf && Number(d.perf.boot_n) >= 5) { const p = Number(d.perf.boot_p90) || 0, lim = Number(s.boot_p90_ms) || 8000;
    out.push({ k: 'perf', name: '처음 열기 속도(느린 쪽 90%)', sev: p > lim ? 'warn' : 'ok', info: (p / 1000).toFixed(1) + '초 · ' + d.perf.boot_n + '번' }); }
  for (const j of (Array.isArray(d.cron) ? d.cron : [])) {
    if (j.active === false) continue;
    const failed = !!j.last_status && !/succeeded|running|starting/.test(String(j.last_status)), n = Number(j.fails24) || 0;
    if (!failed && !n) continue;
    out.push({ k: 'cron:' + j.name, name: '자동 작업 ' + j.name, sev: /snap/.test(String(j.name)) && failed ? 'bad' : 'warn', info: (failed ? '마지막 실패 · ' : '') + (n ? `24시간 실패 ${n}번 · ` : '') + short(j.last_msg || j.last_status, 100) });
  }
  if (d.net && Number(d.net.fail24) >= 5) out.push({ k: 'net', name: '서버 호출(pg_net)', sev: 'warn', info: `24시간 실패 ${d.net.fail24} / ${d.net.total24} — 웹훅 · 예약 호출 확인` });
  if (d.aicheck && d.aicheck.run_at) { const h = Math.round((now - new Date(d.aicheck.run_at).getTime()) / 36e5), pass = Number(d.aicheck.pass) || 0, tot = Number(d.aicheck.total) || 0;
    if (h > 36) out.push({ k: 'ai', name: '야간 AI 점검', sev: 'warn', info: `${h}시간째 없음` });
    else if (tot && pass / tot < 0.7) out.push({ k: 'ai', name: '야간 AI 점검', sev: 'warn', info: `통과 ${pass}/${tot}` }); }
  return out;
}
/** GitHub Actions 마지막 실행(토큰 있을 때) */
async function checkGh(): Promise<Item[]> {
  if (!GH_TOKEN) return [{ k: 'gh', name: 'GitHub Actions', sev: 'skip', info: 'GITHUB_TOKEN 없음 — 건너뜀' }];
  const r = await fetchT(`https://api.github.com/repos/${GH_REPO}/actions/runs?per_page=1&branch=${encodeURIComponent(GH_BRANCH)}`, { headers: { Authorization: 'Bearer ' + GH_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'svc-watch' } }, 10000).catch(() => null);
  if (!r || !r.ok) { await r?.body?.cancel().catch(() => null); return [{ k: 'gh', name: 'GitHub Actions', sev: 'warn', info: r ? 'HTTP ' + r.status + ' — 토큰 권한(Actions: Read) 확인' : '응답 없음' }]; }
  const j = await r.json().catch(() => ({})) as Record<string, any>; const run = (j.workflow_runs || [])[0];
  if (!run) return [{ k: 'gh', name: 'GitHub Actions', sev: 'ok', info: '실행 기록 없음' }];
  const st = run.status === 'completed' ? run.conclusion : run.status;
  return [{ k: 'gh', name: 'GitHub Actions', sev: st === 'failure' ? 'warn' : 'ok', info: `마지막 ${short(run.name, 40)} · ${st} · ${String(run.created_at || '').slice(0, 16).replace('T', ' ')}` }];
}
export function worstOf(items: Item[]): 'ok' | 'warn' | 'bad' { return items.some((i) => i.sev === 'bad') ? 'bad' : items.some((i) => i.sev === 'warn') ? 'warn' : 'ok'; }
export function sigOf(items: Item[]): string { return items.filter((i) => i.sev === 'warn' || i.sev === 'bad').map((i) => i.k + ':' + i.sev).sort().join(','); }
export function slackText(kind: string, items: Item[], worst: string): string {
  const bad = items.filter((i) => i.sev === 'bad'), warn = items.filter((i) => i.sev === 'warn');
  const head = worst === 'ok' ? '✅ 포탈 운영 감시 — 정상으로 돌아왔습니다' : (worst === 'bad' ? '🚨' : '⚠️') + ` 포탈 운영 감시${kind === 'deploy' ? '(배포 뒤 확인)' : ''} — 문제 ${bad.length} · 주의 ${warn.length}`;
  const lines = bad.concat(warn).slice(0, 12).map((i) => `• ${i.sev === 'bad' ? '문제' : '주의'} ${i.name}: ${i.info}`);
  return [head].concat(lines, [`<${PORTAL}/#ops|포탈 › 배포·운영 › 기록 › 운영 감시>`]).join('\n').replace(/<!(channel|here|everyone)[^>]*>/gi, '').slice(0, 3000);
}
async function slackPost(channel: string, text: string): Promise<string> {
  const r = await fetchT('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { Authorization: 'Bearer ' + SLACK_TOKEN, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ channel, text, unfurl_links: false, unfurl_media: false }) }, 10000).catch(() => null);
  if (!r) return 'fail: Slack 응답 없음';
  const j = await r.json().catch(() => ({})) as Record<string, any>;
  return j.ok ? 'sent' : 'fail: ' + short(j.error || 'http_' + r.status, 60);
}
/** Slack 보낼지 — 켜짐(둘 다) · 토큰 · 채널 · 같은 문제 반복 막기 · 정상 복귀 한 번 */
async function slackDecide(kind: string, items: Item[], worst: string, sig: string, set: Set): Promise<string> {
  if (set.slack_on !== true) return 'off';
  const ns = await one<{ slack_on: boolean; team_channel: string }>('notify_settings?select=slack_on,team_channel&id=eq.1');
  if (!ns || ns.slack_on !== true) return 'off: 알림 · Slack «Slack 사용» 꺼짐';
  if (!SLACK_TOKEN) return 'fail: SLACK_BOT_TOKEN 없음';
  const ch = [set.channel, OPS_SLACK, ns.team_channel].map((x) => String(x || '')).find((x) => CHANNEL.test(x)) || '';
  if (!ch) return 'fail: 채널 없음(설정 · OPS_SLACK_CHANNEL · 알림 설정 팀 채널)';
  const prev = await one<{ worst: string; sig: string | null; slack: string | null }>('watch_log?select=worst,sig,slack&kind=in.(cron,deploy)&order=at.desc&limit=1');
  if (worst === 'ok') {
    if (!prev || prev.worst === 'ok') return 'same';
    const sentSince = await one<{ id: number }>('watch_log?select=id&slack=eq.sent&worst=neq.ok&order=at.desc&limit=1');
    const lastOk = await one<{ id: number }>('watch_log?select=id&kind=in.(cron,deploy)&worst=eq.ok&order=at.desc&limit=1');
    if (!sentSince || (lastOk && lastOk.id > sentSince.id)) return 'same';   // 알린 적 없는 문제였으면 복귀도 안 알림
    return await slackPost(ch, slackText(kind, items, 'ok'));
  }
  if (prev && prev.sig === sig && kind !== 'deploy') {
    const rh = Math.max(1, Number(set.repeat_h) || 6), since = new Date(Date.now() - rh * 36e5).toISOString();
    const recent = await one<{ id: number }>('watch_log?select=id&slack=eq.sent&sig=eq.' + encodeURIComponent(sig) + '&at=gt.' + encodeURIComponent(since) + '&limit=1');
    if (recent) return 'same';
  }
  return await slackPost(ch, slackText(kind, items, worst));
}
async function runAll(kind: 'cron' | 'manual' | 'deploy', by: string, set: Set, expect = ''): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  const dbr = await rest('rpc/watch_db', SB_SVC, { method: 'POST', body: '{}' }).catch(() => null);
  const d = dbr && dbr.ok ? await dbr.json().catch(() => null) : null;
  const [site, fns, gh] = await Promise.all([checkSite(expect), checkFuncs(), checkGh()]);
  const items: Item[] = [...site, ...fns, ...dbItems(d, set), ...gh];
  if (set.slack_on === true && !SLACK_TOKEN) items.push({ k: 'slack', name: 'Slack 알림', sev: 'warn', info: 'Slack 알림을 켰지만 SLACK_BOT_TOKEN 이 없음' });
  const worst = worstOf(items), sig = sigOf(items), ms = Date.now() - t0;
  const appVer = (site.find((i) => i.k === 'site')?.info || '').split(' · ')[0];
  const slack = kind === 'manual' ? null : await slackDecide(kind, items, worst, sig, set).catch((e) => 'fail: ' + short((e as Error).message, 60));
  const row = { kind, by_email: by || null, worst, n_warn: items.filter((i) => i.sev === 'warn').length, n_bad: items.filter((i) => i.sev === 'bad').length, items, sig: sig || null, slack, app_ver: appVer || null, ms };
  const lr = await rest('watch_log?select=id', SB_SVC, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) }).catch(() => null);
  const id = lr && lr.ok ? ((await lr.json().catch(() => [])) as { id: number }[])[0]?.id ?? null : null;
  return { ok: true, version: VER, kind, worst, items, slack, ms, log_id: id, logged: !!id, at: new Date().toISOString() };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST 만' }, 405);
  if (!SB_SVC) return json({ ok: false, error: '서비스 키가 없어 점검할 수 없습니다' }, 500);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: '본문(JSON)을 읽지 못했습니다' }, 400); }
  const set = (await one<Set>('watch_settings?select=*&id=eq.1')) || null;

  // ── ① 자동(일회용 번호) ──
  if (typeof body.cron === 'string') {
    const nonce = String(body.cron); if (!NONCE.test(nonce)) return json({ ok: false, error: '확인 실패' }, 403);
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const cr = await rest('watch_run?nonce=eq.' + nonce + '&used_at=is.null&created_at=gt.' + encodeURIComponent(since), SB_SVC,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ used_at: new Date().toISOString(), result: '점검 중' }) }).catch(() => null);
    const run = cr && cr.ok ? ((await cr.json().catch(() => [])) as { id: number }[])[0] : null;
    if (!run) return json({ ok: false, error: '확인 실패(없거나 이미 쓴 번호 · 10분 지남)' }, 403);
    const fin = (r: string) => rest('watch_run?id=eq.' + Number(run.id), SB_SVC, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ result: r.slice(0, 300) }) }).catch(() => null);
    if (!set) { await fin('watch_settings 를 읽지 못함 — SQL 123'); return json({ ok: false, error: 'watch_settings 없음' }, 500); }
    if (set.auto_on !== true) { await fin('꺼짐 — 점검 안 함'); return json({ ok: false, error: '자동 감시가 꺼져 있습니다' }); }
    const out = await runAll('cron', '자동', set); await fin(`${out.worst} · Slack ${out.slack ?? '-'}`);
    return json(out);
  }

  // ── ②③ 포탈: 사용자 로그인 토큰 + 슈퍼 관리자만 (서비스 키로 직접 부르는 것은 받지 않음) ──
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ ok: false, error: '인증 필요' }, 401);
  if (/^sb_secret_/.test(token) || token === SB_SVC) return json({ ok: false, error: '서비스 키로 부르는 점검은 받지 않습니다 — 자동 감시는 DB 예약(svc-watch)으로만' }, 403);
  const who = await fetchT(SB_URL + '/auth/v1/user', { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + token } }, 8000).catch(() => null);
  if (!who || !who.ok) return json({ ok: false, error: '로그인이 만료되었습니다 — 다시 로그인해 주세요' }, 401);
  const u = await who.json().catch(() => ({})) as Record<string, unknown>; const by = String(u.email || u.id || 'user').toLowerCase();
  const sa = await rest('rpc/is_super_admin', token, { method: 'POST', body: '{}' }).catch(() => null);
  if (!(sa && sa.ok && (await sa.json().catch(() => false)) === true)) return json({ ok: false, error: '운영 감시는 슈퍼 관리자만 쓸 수 있습니다' }, 403);
  if (!set) return json({ ok: false, error: 'watch_settings 를 읽지 못했습니다 — SQL 123 을 먼저 실행해 주세요' }, 500);

  if (body.mode === 'slack_test') {
    const s2: Set = { ...set }; if (s2.slack_on !== true) return json({ ok: false, error: '운영 감시 Slack 알림이 꺼져 있습니다' }, 409);
    const ns = await one<{ slack_on: boolean; team_channel: string }>('notify_settings?select=slack_on,team_channel&id=eq.1');
    if (!ns || ns.slack_on !== true) return json({ ok: false, error: '알림 · Slack «Slack 사용»이 꺼져 있습니다' }, 409);
    if (!SLACK_TOKEN) return json({ ok: false, error: 'SLACK_BOT_TOKEN 이 없습니다 (Edge Functions › Secrets)' }, 500);
    const ch = [set.channel, OPS_SLACK, ns.team_channel].map((x) => String(x || '')).find((x) => CHANNEL.test(x)) || '';
    if (!ch) return json({ ok: false, error: '보낼 채널이 없습니다' }, 400);
    const r = await slackPost(ch, `🧪 포탈 운영 감시 Slack 시험 — ${by} · 문제가 생기거나 풀리면 이 채널로 알립니다`);
    return json({ ok: r === 'sent', slack: r, channel: ch });
  }
  if (body.mode === 'deploy') {
    const expect = short(body.expect, 60);
    if (!expect) return json({ ok: false, error: '기대 버전(expect)이 없습니다' }, 400);
    return json(await runAll('deploy', by, set, expect));
  }
  if (body.mode === 'run') return json(await runAll('manual', by, set));
  return json({ ok: false, error: '모르는 요청' }, 400);
});
