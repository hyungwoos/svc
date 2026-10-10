// ============================================================================
//  Supabase Edge Function: notify  (v1.1 · 2026-10-10 · ㊿+177 — v1.0 ㊿+174)
//   포탈 알림함 → Slack — 팀 채널에 요약 1번 + 받는 사람에게 개인 메시지(DM)
//   두 가지로만 불림:
//    ① 직접 보내기: 포탈에서 슈퍼 관리자가 «Slack 으로 보내기» → 미리 보기 → 확인 (사용자 로그인 토큰 · 슈퍼 관리자만)
//    ② 예약 발송(v1.1 · SQL 108 · 기본 꺼짐): DB 의 notify_auto_tick()(pg_cron 10분마다)이 예약 시각에 { auto: 일회용 번호 } 로 부름
//       · 그 번호가 notify_auto_run 에 있고(10분 안 · 아직 안 씀) 쓰는 순간 «씀»으로 바뀌어야만 진행 — 아무나 불러도 보내지 않음 · 같은 시각 두 번 안 보냄
//       · 설정(slack_on · auto_on)을 다시 확인 · 보낼 글은 notify_snapshot(슈퍼 관리자가 포탈을 열 때 알림함 계산으로 만든 것 · 72시간 안)
//       · 팀 채널은 설정의 채널 · DM 은 설정 auto_dm 을 켰을 때만 · 받는 사람 확인은 ①과 같음
//     · 서비스 키로 직접 부르는 것은 받지 않음 · notify_settings.slack_on(SQL 105 · 기본 꺼짐)이 꺼져 있으면 보내지 않음
//   메시지 글은 포탈이 만듦(알림함과 같은 계산) — 이 함수는 권한 · 켜짐 · 대상 · 길이만 검사하고 그대로 보냄
//     · 팀 채널은 notify_settings.team_channel 과 같아야 함 · DM 대상은 설정의 받는 사람 · 담당자 연결(user_owner_map) · 처리 담당(work_assign) 계정만
//     · @channel · @here · @everyone 같은 전체 호출은 지움 · 글 3,000자 · DM 30명까지
//   body: { team: {channel, text, n} | null, dms: [{email, text, n}], dry?: true } | { auto: '<uuid>' }   → { ok, results:[{target, ok, error?}], hint? }
//   Secrets: SLACK_BOT_TOKEN(remind 와 같은 봇 · chat:write — DM 은 users:read.email · im:write 권한을 더하고 앱 다시 설치) · 새 Secret 없음
//   ★ 배포: 이름 notify · «Verify JWT» 끔(remind · ask 와 같게 — 켜져 있으면 CORS 없이 401 → 포탈에서 «Failed to fetch» · 예약 호출도 막힘). 이 함수가 직접 확인합니다.
//   기록: notify_log(대상마다 한 줄 · 서비스 키로 씀 · 예약은 sent_by '예약') — 업무 내용(메시지 글)은 저장하지 않음
// ============================================================================
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SB_URL = Deno.env.get('SUPABASE_URL') || '';
const SB_ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SLACK_TOKEN = Deno.env.get('SLACK_BOT_TOKEN') || '';
const MAX_TEXT = 3000, MAX_DM = 30;
const EMAIL = /^[^@\s<>|]+@[^@\s<>|]+\.[^@\s<>|]+$/;
const CHANNEL = /^[CG][A-Z0-9]{6,20}$/;
const NONCE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AGE_H = 72;   // 예약 발송: 보낼 글(notify_snapshot)이 이보다 오래됐으면 보내지 않음(주말 넘어 월요일 아침 정도까지)

type Item = { email?: string; channel?: string; text?: string; n?: number };
type Result = { target: string; ok: boolean; error?: string; n?: number };

async function fetchT(url: string, opt: RequestInit = {}, ms = 12000): Promise<Response> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opt, signal: ctl.signal }); } finally { clearTimeout(t); }
}
/** 전체 호출(<!channel> · <!here> · <!everyone> · @channel 등)을 지우고 길이를 자름 */
export function clean(t: unknown): string {
  return String(t ?? '').replace(/<!(channel|here|everyone|subteam\^[A-Z0-9]+)[^>]*>/gi, '').replace(/@(channel|here|everyone)\b/gi, '$1').slice(0, MAX_TEXT);
}
const rest = (path: string, key: string, init: RequestInit = {}) =>
  fetchT(SB_URL + '/rest/v1/' + path, { ...init, headers: { apikey: key === SB_SVC ? SB_SVC : SB_ANON, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', ...(init.headers || {}) } }, 8000);

async function slackApi(method: string, body: Record<string, unknown> | null, query = ''): Promise<Record<string, unknown>> {
  const r = await fetchT('https://slack.com/api/' + method + query, body
    ? { method: 'POST', headers: { Authorization: 'Bearer ' + SLACK_TOKEN, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) }
    : { method: 'GET', headers: { Authorization: 'Bearer ' + SLACK_TOKEN } });
  try { return await r.json(); } catch { return { ok: false, error: 'http_' + r.status }; }
}
function why(e: unknown): string {
  const s = String(e || '');
  if (s === 'not_in_channel') return 'not_in_channel — 봇을 채널에 초대하세요(/invite @봇이름)';
  if (s === 'channel_not_found') return 'channel_not_found — 채널 ID 를 확인하세요';
  if (s === 'users_not_found') return 'users_not_found — Slack 에 이 이메일의 사람이 없음';
  if (s === 'missing_scope') return 'missing_scope — Slack 앱 권한 부족';
  if (s === 'invalid_auth' || s === 'not_authed') return s + ' — SLACK_BOT_TOKEN 확인';
  return s.slice(0, 120);
}

/** DM 받을 수 있는 계정 — 설정의 받는 사람 + 담당자 연결(user_owner_map) + 처리 담당(work_assign) */
async function allowList(set: Record<string, unknown>): Promise<Set<string>> {
  const allow = new Set<string>();
  for (const k of ['renew_emails', 'eq_emails', 'biz_emails', 'dc_emails']) for (const e of (set[k] as string[]) || []) allow.add(String(e).toLowerCase());
  if (SB_SVC) {
    const om = await rest('user_owner_map?select=email', SB_SVC).catch(() => null); if (om && om.ok) for (const x of (await om.json().catch(() => [])) as { email: string }[]) allow.add(String(x.email || '').toLowerCase());
    const wa = await rest('work_assign?select=assignee', SB_SVC).catch(() => null); if (wa && wa.ok) for (const x of (await wa.json().catch(() => [])) as { assignee: string }[]) allow.add(String(x.assignee || '').toLowerCase());
  }
  return allow;
}
/** 팀 채널 1번 + DM 들 — 차례대로(Slack 속도 제한) */
async function sendAll(team: Item | null, dms: Item[], dry: boolean): Promise<{ results: Result[]; scopeMiss: boolean }> {
  const results: Result[] = []; let scopeMiss = false;
  if (team) {
    const tgt = 'team:' + team.channel;
    if (dry) results.push({ target: tgt, ok: true, n: Number(team.n) || 0 });
    else {
      const j = await slackApi('chat.postMessage', { channel: team.channel, text: clean(team.text), unfurl_links: false, unfurl_media: false }).catch((e) => ({ ok: false, error: String((e as Error).message) }));
      results.push({ target: tgt, ok: !!j.ok, error: j.ok ? undefined : why(j.error), n: Number(team.n) || 0 });
    }
  }
  for (const d of dms) {
    const e = String(d.email).toLowerCase(), tgt = 'dm:' + e;
    if (dry) { results.push({ target: tgt, ok: true, n: Number(d.n) || 0 }); continue; }
    try {
      const lu = await slackApi('users.lookupByEmail', null, '?email=' + encodeURIComponent(e));
      if (!lu.ok) { if (lu.error === 'missing_scope') scopeMiss = true; results.push({ target: tgt, ok: false, error: why(lu.error), n: Number(d.n) || 0 }); continue; }
      const uid = String(((lu.user || {}) as Record<string, unknown>).id || '');
      const op = await slackApi('conversations.open', { users: uid });
      if (!op.ok) { if (op.error === 'missing_scope') scopeMiss = true; results.push({ target: tgt, ok: false, error: why(op.error), n: Number(d.n) || 0 }); continue; }
      const ch = String(((op.channel || {}) as Record<string, unknown>).id || '');
      const pm = await slackApi('chat.postMessage', { channel: ch, text: clean(d.text), unfurl_links: false, unfurl_media: false });
      results.push({ target: tgt, ok: !!pm.ok, error: pm.ok ? undefined : why(pm.error), n: Number(d.n) || 0 });
    } catch (err) { results.push({ target: tgt, ok: false, error: why((err as Error).message), n: Number(d.n) || 0 }); }
  }
  return { results, scopeMiss };
}

async function logRows(results: Result[], sentBy: string, dry: boolean) {
  if (SB_SVC) await rest('notify_log', SB_SVC, { method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(results.map((r) => ({ sent_by: sentBy, target: r.target, n_items: r.n ?? null, ok: r.ok, error: r.error || null, dry }))) }).catch(() => null);
}
const HINT = 'DM 을 보내려면 Slack 앱(api.slack.com › 내 앱 › OAuth & Permissions)에 users:read.email · im:write 권한을 더하고 «Reinstall» 하세요. 팀 채널은 지금 권한(chat:write)으로 됩니다.';

/** ② 예약 발송 — notify_auto_tick() 이 { auto: 일회용 번호 } 로 부름 */
async function autoRun(nonce: string): Promise<Response> {
  if (!SB_SVC) return json({ ok: false, error: '서비스 키가 없어 예약을 확인할 수 없습니다' }, 500);
  if (!NONCE.test(nonce)) return json({ ok: false, error: '예약 확인 실패' }, 403);
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const cr = await rest('notify_auto_run?nonce=eq.' + nonce + '&used_at=is.null&created_at=gt.' + encodeURIComponent(since), SB_SVC,
    { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ used_at: new Date().toISOString(), result: '보내는 중' }) }).catch(() => null);
  const run = cr && cr.ok ? ((await cr.json().catch(() => [])) as Record<string, unknown>[])[0] : null;
  if (!run) return json({ ok: false, error: '예약 확인 실패(없거나 이미 쓴 번호 · 10분 지남)' }, 403);
  const fin = (result: string) => rest('notify_auto_run?id=eq.' + Number(run.id), SB_SVC, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ result: result.slice(0, 300) }) }).catch(() => null);
  const skip = async (why: string, code = 200) => { await fin(why); await logRows([{ target: 'skip', ok: false, error: why }], '예약', false); return json({ ok: false, auto: true, error: why }, code); };
  const sr = await rest('notify_settings?select=slack_on,auto_on,auto_dm,team_channel,renew_emails,eq_emails,biz_emails,dc_emails&id=eq.1', SB_SVC).catch(() => null);
  const set = sr && sr.ok ? ((await sr.json().catch(() => [])) as Record<string, unknown>[])[0] : null;
  if (!set) return skip('notify_settings 를 읽지 못함 — SQL 105 · 108 확인', 500);
  if (set.slack_on !== true || set.auto_on !== true) { await fin('꺼짐 — 보내지 않음'); return json({ ok: false, auto: true, error: '예약 발송이 꺼져 있습니다' }); }
  if (!CHANNEL.test(String(set.team_channel || ''))) return skip('팀 채널 ID 형식이 아님');
  const nr = await rest('notify_snapshot?select=at,by_email,n,team,dms&id=eq.1', SB_SVC).catch(() => null);
  const snap = nr && nr.ok ? ((await nr.json().catch(() => [])) as Record<string, unknown>[])[0] : null;
  if (!snap || !snap.team) return skip('보낼 글이 없음 — 슈퍼 관리자가 포탈을 열면 알림함 계산으로 만들어짐');
  const age = (Date.now() - new Date(String(snap.at)).getTime()) / 36e5;
  if (!(age <= MAX_AGE_H)) return skip(`보낼 글이 ${Math.round(age)}시간 전 것 — ${MAX_AGE_H}시간이 넘어 보내지 않음(슈퍼 관리자가 포탈을 열면 새로 만들어짐)`);
  const at = new Date(new Date(String(snap.at)).getTime() + 9 * 36e5).toISOString();   // 한국 시각 표시
  const head = `⏰ 예약 발송 · 기준 ${at.slice(5, 7)}/${at.slice(8, 10)} ${at.slice(11, 16)} 포탈 계산`;
  const st = snap.team as Item;
  const team: Item = { channel: String(set.team_channel), text: head + '\n' + String(st.text || ''), n: Number(st.n) || 0 };
  let dms: Item[] = [];
  if (set.auto_dm === true && Array.isArray(snap.dms)) {
    const allow = await allowList(set), seen = new Set<string>();
    dms = (snap.dms as Item[]).filter((d) => { const e = String(d.email || '').toLowerCase(); if (!EMAIL.test(e) || !allow.has(e) || seen.has(e) || !String(d.text || '').trim()) return false; seen.add(e); return true; })
      .slice(0, MAX_DM).map((d) => ({ email: String(d.email).toLowerCase(), text: head + '\n' + String(d.text), n: Number(d.n) || 0 }));
  }
  if (!SLACK_TOKEN) return skip('SLACK_BOT_TOKEN 이 설정되지 않음 (Edge Functions › Secrets)', 500);
  const { results, scopeMiss } = await sendAll(team, dms, false);
  await logRows(results, '예약', false);
  const bad = results.filter((r) => !r.ok);
  await fin(`${results.length - bad.length}곳 보냄` + (bad.length ? ` · ${bad.length}곳 실패: ` + bad.slice(0, 3).map((r) => r.target + ' ' + (r.error || '')).join(' · ') : '') + ` · 글 ${Math.round(age)}시간 전 계산`);
  return json({ ok: !bad.length, auto: true, results, hint: scopeMiss ? HINT : undefined });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST 만' }, 405);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: '본문(JSON)을 읽지 못했습니다' }, 400); }
  const dry = body.dry === true;

  // ── ② 예약 발송(DB 예약 · 일회용 번호) ──
  if (typeof body.auto === 'string') return await autoRun(String(body.auto));

  // ── ① 직접 보내기 인증: 사용자 로그인 토큰 + 슈퍼 관리자만 (서비스 키로 직접 부르는 것은 받지 않음) ──
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ ok: false, error: '인증 필요' }, 401);
  if (/^sb_secret_/.test(token) || (SB_SVC && token === SB_SVC)) return json({ ok: false, error: '서비스 키로 부르는 자동 발송은 받지 않습니다 — 예약 발송은 관리자 › 설정 › 알림 · Slack «예약 발송»(DB 예약)으로만' }, 403);
  try { const p = token.split('.')[1] || ''; const pad = p.replace(/-/g, '+').replace(/_/g, '/'); const c = JSON.parse(atob(pad + '='.repeat((4 - pad.length % 4) % 4)));
    if (c.role === 'service_role' || c.role === 'anon') return json({ ok: false, error: '사용자 로그인이 필요합니다' }, 403); } catch { /* 사용자 토큰 확인은 아래 Auth 가 함 */ }
  const who = await fetchT(SB_URL + '/auth/v1/user', { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + token } }, 8000).catch(() => null);
  if (!who || !who.ok) return json({ ok: false, error: '로그인이 만료되었습니다 — 다시 로그인해 주세요' }, 401);
  const u = await who.json().catch(() => ({})); const sentBy = String(u.email || u.id || 'user').toLowerCase();
  const sa = await rest('rpc/is_super_admin', token, { method: 'POST', body: '{}' }).catch(() => null);
  const isSuper = sa && sa.ok ? (await sa.json().catch(() => false)) === true : false;
  if (!isSuper) return json({ ok: false, error: 'Slack 보내기는 슈퍼 관리자만 할 수 있습니다' }, 403);

  // ── 켜짐 · 설정 다시 확인 (포탈 화면을 믿지 않음) ──
  const sr = await rest('notify_settings?select=slack_on,team_channel,renew_emails,eq_emails,biz_emails,dc_emails&id=eq.1', token).catch(() => null);
  if (!sr || !sr.ok) return json({ ok: false, error: 'notify_settings 를 읽지 못했습니다 — SQL 105 를 먼저 실행해 주세요' }, 500);
  const set = ((await sr.json().catch(() => [])) as Record<string, unknown>[])[0];
  if (!set) return json({ ok: false, error: 'notify_settings 행이 없습니다 — SQL 105 를 다시 실행해 주세요' }, 500);
  if (set.slack_on !== true) return json({ ok: false, error: 'Slack 사용이 꺼져 있습니다 — 관리자 › 설정 › 알림 · Slack 에서 켜야 보낼 수 있습니다' }, 409);

  // ── 요청 검사 ──
  const team = (body.team && typeof body.team === 'object') ? body.team as Item : null;
  const dms = Array.isArray(body.dms) ? (body.dms as Item[]) : [];
  if (!team && !dms.length) return json({ ok: false, error: '보낼 곳이 없습니다' }, 400);
  if (dms.length > MAX_DM) return json({ ok: false, error: `DM 은 한 번에 ${MAX_DM}명까지` }, 400);
  if (team) {
    if (!CHANNEL.test(String(team.channel || ''))) return json({ ok: false, error: '팀 채널 ID 형식이 아닙니다' }, 400);
    if (String(team.channel) !== String(set.team_channel)) return json({ ok: false, error: '팀 채널이 알림 설정과 다릅니다 — 화면을 새로 읽어 주세요' }, 400);
    if (!String(team.text || '').trim()) return json({ ok: false, error: '팀 메시지가 비어 있습니다' }, 400);
  }
  // DM 대상은 «알림을 받기로 정한 계정»만: 설정의 받는 사람 + 담당자 연결 + 처리 담당
  const allow = dms.length ? await allowList(set) : new Set<string>();
  const seen = new Set<string>();
  for (const d of dms) {
    const e = String(d.email || '').toLowerCase();
    if (!EMAIL.test(e)) return json({ ok: false, error: 'DM 대상 이메일 형식이 아닙니다: ' + e.slice(0, 60) }, 400);
    if (!allow.has(e)) return json({ ok: false, error: '알림 받는 사람으로 정해지지 않은 계정입니다: ' + e + ' — 관리자 › 설정 › 알림 · Slack' }, 400);
    if (seen.has(e)) return json({ ok: false, error: '같은 계정이 두 번: ' + e }, 400); seen.add(e);
    if (!String(d.text || '').trim()) return json({ ok: false, error: 'DM 메시지가 비어 있습니다: ' + e }, 400);
  }
  if (!dry && !SLACK_TOKEN) return json({ ok: false, error: 'SLACK_BOT_TOKEN 이 설정되지 않았습니다 (Edge Functions › Secrets)' }, 500);

  // ── 보내기 (차례대로 — Slack 속도 제한) ──
  const { results, scopeMiss } = await sendAll(team, dms, dry);

  // ── 기록 (대상마다 한 줄 · 메시지 글은 저장 안 함 · 표가 없어도 실패하지 않음) ──
  await logRows(results, sentBy, dry);
  const hint = scopeMiss ? HINT : undefined;
  return json({ ok: results.every((r) => r.ok), dry, results, hint });
});
