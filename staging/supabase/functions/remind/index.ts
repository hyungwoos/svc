// ============================================================================
//  Supabase Edge Function: remind  (v1.3 · 2026-10-02)
//   계약 만기 알림 — 매월 말(25일) 슬랙 팀 채널에 «다음 달 갱신 처리 대상» 을 한 번에 보냄
//     · 이번 달 만기(다음 달 1일 LIVE 에서 빠짐) · 다음 달 만기 · 만기 지났는데 미처리
//     · 데이터는 DB 함수 renew_watch() (SQL 84) — 포탈 LIVE 규칙과 같은 기준
//   호출: ① 크론(서비스 키 · Supabase Cron 연동) ② 포탈 슈퍼 관리자가 «지금 보내기» (사용자 JWT) ③ ?dry=1 또는 {"dry":true} 면 슬랙에 안 보내고 미리보기만
//   body.only: 'lapsed' | 'due' | 'next' 또는 배열 — 그 구역만 보냄(포탈에서 «이 탭 보내기»). 없으면 세 구역 전부(월말 크론)
//   Secrets: SLACK_BOT_TOKEN(xoxb-… · chat:write · 봇을 채널에 초대) · SLACK_CHANNEL(기본 C08RA3PPDH8) · 선택 SLACK_MENTION(<@U…> 영업지원 담당) · 선택 PORTAL_URL · 선택 REMIND_KEY
//   ★ 배포 설정: 함수의 «Verify JWT» 는 끌 것(ask 와 같게). 켜져 있으면 게이트웨이가 CORS 헤더 없이 401 을 돌려 포탈에서 «Failed to fetch» 가 됩니다.
//     이 함수가 직접 토큰을 검사합니다 — 서비스 키(legacy service_role JWT 또는 새 sb_secret_… 키) · REMIND_KEY · 사용자 JWT(super_admin 만).
// ============================================================================
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SB_URL = Deno.env.get('SUPABASE_URL') || '';
const SB_ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SLACK_TOKEN = Deno.env.get('SLACK_BOT_TOKEN') || '';
const SLACK_CHANNEL = Deno.env.get('SLACK_CHANNEL') || 'C08RA3PPDH8';
const SLACK_MENTION = Deno.env.get('SLACK_MENTION') || '';
const PORTAL_URL = Deno.env.get('PORTAL_URL') || '';   // 포탈 주소 — Secrets 에 넣어 두면 크론 메시지에 링크가 붙음. 포탈에서 보낼 때는 body.portal_url(포탈이 자기 주소를 보냄)이 우선. 없으면 링크 없이 문구만

type Row = { kind: 'lapsed' | 'due' | 'next'; contract_id: number; customer: string; line: string; channel: string | null; partner: string | null; csm: string | null; s1_no: string | null;
  start_month: string | null; end_month: string; term_months: number | null; mrr: number | null; renew_count: number; status: string | null; note: string | null };

const LINE: Record<string, string> = { Cloud: 'Cloud NAC', S1: 'S1 Cloud NAC', MDR: 'MDR', MDR_S1: 'S1 MDR', PNS: 'PNS', DRM: 'DRM', DLP: 'DLP' };
const won = (v: number | null) => Math.round((Number(v) || 0) / 1000).toLocaleString('ko-KR') + '천원';
const ym = (d: string | null) => (d ? String(d).slice(0, 7) : '—');
function kstMonth(offset = 0): string {   // 'YYYY-MM-01'
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const t = d.getUTCFullYear() * 12 + d.getUTCMonth() + offset;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`;
}
async function fetchT(url: string, opt: RequestInit = {}, ms = 15000): Promise<Response> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opt, signal: ctl.signal }); } finally { clearTimeout(t); }
}
function isServiceToken(t: string): boolean {
  if (SB_SVC && t === SB_SVC) return true;
  const k = Deno.env.get('REMIND_KEY'); if (k && t === k) return true;
  try { const p = t.split('.')[1]; const pad = p.replace(/-/g, '+').replace(/_/g, '/'); const j = JSON.parse(atob(pad + '='.repeat((4 - pad.length % 4) % 4))); return j.role === 'service_role'; } catch { return false; }
}
// 새 API 키 체계의 비밀 키(sb_secret_…)는 JWT 가 아니라서 위로는 못 알아봄 → Auth 관리자 엔드포인트가 받아 주는지로 확인 (크론이 이 키를 쓸 때)
async function isServiceTokenAsync(t: string): Promise<boolean> {
  if (isServiceToken(t)) return true;
  if (!/^sb_secret_/.test(t)) return false;
  const r = await fetchT(SB_URL + '/auth/v1/admin/users?page=1&per_page=1', { headers: { apikey: t, Authorization: 'Bearer ' + t } }, 6000).catch(() => null);
  return !!(r && r.ok);
}

function line(r: Row): string {
  const bits = [LINE[r.line] || r.line, ym(r.end_month) + ' 만기', won(r.mrr) + '/월'];
  if (r.term_months) bits.push(r.term_months + '개월 약정');
  if (r.renew_count) bits.push('연장 ' + r.renew_count + '회');
  const who = [r.channel, r.partner && r.partner !== '직접(계산서)' ? r.partner : ''].filter(Boolean).join(' · ');
  return `• *${r.customer}* — ${bits.join(' · ')}${who ? `  _(${who})_` : ''}${r.s1_no ? `  ${r.s1_no}` : ''}`;
}
function section(title: string, rows: Row[], max = 25): unknown[] {
  if (!rows.length) return [];
  const sum = rows.reduce((a, r) => a + (Number(r.mrr) || 0), 0);
  const body = rows.slice(0, max).map(line).join('\n') + (rows.length > max ? `\n… 외 ${rows.length - max}건` : '');
  return [
    { type: 'section', text: { type: 'mrkdwn', text: `*${title}* — ${rows.length}건 · 월 ${won(sum)}` } },
    { type: 'section', text: { type: 'mrkdwn', text: body.slice(0, 2900) } },
  ];
}
type Kind = 'due' | 'next' | 'lapsed';
const ALL_KINDS: Kind[] = ['due', 'next', 'lapsed'];
function pickKinds(v: unknown): Kind[] {
  const arr = Array.isArray(v) ? v : (typeof v === 'string' ? v.split(/[,+\s]+/) : []);
  const ks = arr.map(String).filter((k): k is Kind => (ALL_KINDS as string[]).includes(k));
  return ks.length ? Array.from(new Set(ks)) : ALL_KINDS;
}
function buildMessage(rows: Row[], thisM: string, nextM: string, kinds: Kind[] = ALL_KINDS, portalUrl = PORTAL_URL) {
  const due = rows.filter((r) => r.kind === 'due'), next = rows.filter((r) => r.kind === 'next'), lapsed = rows.filter((r) => r.kind === 'lapsed');
  const has = (k: Kind) => kinds.includes(k);
  const total = (has('due') ? due.length : 0) + (has('next') ? next.length : 0) + (has('lapsed') ? lapsed.length : 0);
  const mTxt = (m: string) => m.slice(5, 7).replace(/^0/, '') + '월';
  const full = kinds.length === ALL_KINDS.length;
  const head = full ? `📅 ${nextM.slice(0, 7).replace('-', '년 ')}월 갱신 처리 대상 ${total}건`
    : kinds.length === 1 && kinds[0] === 'lapsed' ? `⚠️ 만기 지났는데 아직 미처리 ${total}건 — 이미 LIVE 에서 빠짐`
    : kinds.length === 1 && kinds[0] === 'due' ? `🔴 ${mTxt(thisM)} 만기 ${total}건 — ${mTxt(nextM)} 1일에 LIVE 에서 빠집니다`
    : kinds.length === 1 ? `🟠 ${mTxt(nextM)} 중 만기 ${total}건`
    : `📅 갱신 처리 대상 ${total}건`;
  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: head.slice(0, 150) } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `${SLACK_MENTION ? SLACK_MENTION + ' ' : ''}기준 ${thisM.slice(0, 7)} · 포탈 LIVE 규칙과 같은 계산 · 처리(연장·서비스종료·해지)는 ${portalUrl ? `<${portalUrl}#dash|포탈 홈 › 만기 처리>` : '포탈 홈 › 만기 처리'} 에서 한 번에` }] },
  ];
  if (!total) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '처리할 만기 계약이 없습니다 ✅' } });
  if (has('due')) blocks.push(...section(`🔴 ${mTxt(thisM)} 만기 — ${mTxt(nextM)} 1일에 LIVE 에서 빠집니다`, due));
  if (has('next')) blocks.push(...section(`🟠 ${mTxt(nextM)} 중 만기`, next));
  if (has('lapsed')) blocks.push(...section('⚠️ 만기 지났는데 아직 미처리 (이미 LIVE 에서 빠짐)', lapsed));
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: '연장이면 포탈에서 «연장»(회차·종료월·예정 매출 자동), 끝났으면 «서비스종료» 또는 «해지(사유)». 월 단위 자동연장 계약은 «자동연장» 표시를 켜면 이 알림에서 빠집니다.' }] });
  const parts = [has('due') ? `이달 만기 ${due.length}` : '', has('next') ? `다음 달 만기 ${next.length}` : '', has('lapsed') ? `미처리 ${lapsed.length}` : ''].filter(Boolean);
  const text = `${head} — ${parts.join(' · ')}`;
  return { blocks, text, due: has('due') ? due : [], next: has('next') ? next : [], lapsed: has('lapsed') ? lapsed : [], kinds, total };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch { /* empty */ } }
  const dry = url.searchParams.get('dry') === '1' || body.dry === true;

  // ── 인증: 서비스 키(크론) 또는 슈퍼 관리자 사용자 토큰 ──
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ ok: false, error: '인증 필요' }, 401);
  let sentBy = 'cron';
  const svc = await isServiceTokenAsync(token);
  if (!svc) {
    const who = await fetchT(SB_URL + '/auth/v1/user', { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + token } }, 8000).catch(() => null);
    if (!who || !who.ok) return json({ ok: false, error: '로그인이 만료되었습니다' }, 401);
    const u = await who.json(); sentBy = u.email || u.id || 'user';
    const rr = await fetchT(SB_URL + '/rest/v1/user_roles?select=role', { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + token } }, 5000).catch(() => null);
    const roles = rr && rr.ok ? await rr.json() : [];
    const role = Array.isArray(roles) && roles[0] ? String(roles[0].role || '') : '';
    if (role !== 'super_admin') return json({ ok: false, error: '슬랙 알림은 슈퍼 관리자만 보낼 수 있습니다' }, 403);
  }

  // ── 데이터 ──
  const thisM = typeof body.month === 'string' && /^\d{4}-\d{2}-01$/.test(body.month) ? body.month : kstMonth(0);
  const nextM = (() => { const [y, m] = thisM.split('-').map(Number); const t = y * 12 + (m - 1) + 1; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`; })();
  const svcKey = SB_SVC || (svc && /^sb_secret_/.test(token) ? token : '');
  const hdr = { apikey: svcKey || SB_ANON, Authorization: 'Bearer ' + (svcKey || token), 'Content-Type': 'application/json' };
  const r = await fetchT(SB_URL + '/rest/v1/rpc/renew_watch', { method: 'POST', headers: hdr, body: JSON.stringify({ p_month: thisM }) }, 15000);
  if (!r.ok) return json({ ok: false, error: 'renew_watch 실패 (' + r.status + '): ' + (await r.text()).slice(0, 200) + ' — SQL 84 를 실행했는지 확인' }, 500);
  const rows = (await r.json()) as Row[];
  const kinds = pickKinds(body.only);
  const portalUrl = (typeof body.portal_url === 'string' && /^https:\/\/[^\s<>|"']{8,200}$/.test(body.portal_url)) ? body.portal_url : PORTAL_URL;
  const msg = buildMessage(rows, thisM, nextM, kinds, portalUrl);

  // ── 슬랙 ──
  let slack: Record<string, unknown> | null = null, ok = true, error = '';
  if (!dry) {
    if (!SLACK_TOKEN) { ok = false; error = 'SLACK_BOT_TOKEN 이 설정되지 않았습니다 (Edge Functions › Secrets)'; }
    else {
      try {
        const sr = await fetchT('https://slack.com/api/chat.postMessage', {
          method: 'POST', headers: { Authorization: 'Bearer ' + SLACK_TOKEN, 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ channel: SLACK_CHANNEL, text: msg.text, blocks: msg.blocks, unfurl_links: false }),
        }, 15000);
        slack = await sr.json();
        if (!slack || !slack.ok) { ok = false; error = 'slack: ' + String((slack && slack.error) || sr.status) + (slack && slack.error === 'not_in_channel' ? ' — 봇을 채널에 초대하세요 (/invite @봇이름)' : ''); }
      } catch (e) { ok = false; error = 'slack: ' + String((e as Error).message); }
    }
  }
  // ── 기록 (표가 없어도 실패하지 않음) ──
  if (svcKey) {
    fetchT(SB_URL + '/rest/v1/remind_log', { method: 'POST', headers: { ...hdr, Prefer: 'return=minimal' },
      body: JSON.stringify({ period: nextM.slice(0, 7), kind: kinds.length === ALL_KINDS.length ? 'monthly' : kinds.join('+'), channel: SLACK_CHANNEL, n_lapsed: msg.lapsed.length, n_due: msg.due.length, n_next: msg.next.length, ok, error: error || null, dry, sent_by: sentBy }) }, 5000).catch(() => null);
  }
  return json({ ok, error: error || undefined, dry, period: nextM.slice(0, 7), kinds, total: msg.total, portal_url: portalUrl || undefined, counts: { due: msg.due.length, next: msg.next.length, lapsed: msg.lapsed.length }, text: msg.text,
    preview: dry ? msg.blocks : undefined, slack_ts: slack && slack.ts ? slack.ts : undefined, channel: SLACK_CHANNEL });
});
