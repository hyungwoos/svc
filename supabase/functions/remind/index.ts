// ============================================================================
//  Supabase Edge Function: remind  (v1.5 · 2026-10-12 · ㊿+192 «사이트 → 계약 전환 점검» 메시지(SQL 115 site_watch) — 월말 크론이면 갱신 메시지 다음에 따로 한 번 · body.only:'sites' 면 그것만 · SQL 115 전이면 건너뜀(응답에 이유)
//   v1.4 · 2026-10-11 · ㊿+182 Slack 속도 제한(429)이면 Retry-After 만큼 기다렸다 다시(최대 2번) · 기록(remind_log)을 남긴 뒤 응답 — v1.3 2026-10-02)
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
function onlyList(v: unknown): string[] { const arr = Array.isArray(v) ? v : (typeof v === 'string' ? v.split(/[,+\s]+/) : []); return arr.map(String).filter(Boolean); }
function pickKinds(v: unknown): Kind[] {
  const ks = onlyList(v).filter((k): k is Kind => (ALL_KINDS as string[]).includes(k));
  return ks.length ? Array.from(new Set(ks)) : ALL_KINDS;
}
// ㊿+192 사이트 → 계약 전환 점검 (SQL 115 site_watch) — 정책서버를 만들어 주고 발주 없이 쓰는 일이 없게, 월말에 채널로 한 번
type SiteRow = { id: number; sitename: string; product: string | null; edition: string | null; devices: number | null; customer: string | null; requested_by: string | null; created_at: string;
  purpose: string | null; due_date: string | null; site_status: string | null; status_note: string | null; contract_id: number | null; contract_cust: string | null; contract_status: string | null; days: number; state: string };
const PROD: Record<string, string> = { ztna: 'Cloud ZTNA', edr: 'Cloud EDR', nac: 'Cloud NAC' };
function siteLine(r: SiteRow, who: (e: string | null) => string): string {
  const bits = [r.customer || '(고객사 없음)', (PROD[String(r.product || '').toLowerCase()] || r.product || '') + (r.edition ? '/' + r.edition : ''), r.devices ? r.devices + '노드' : '', who(r.requested_by), '경과 ' + r.days + '일'];
  if (r.purpose === 'poc') bits.push('PoC 종료일 ' + (r.due_date || '미정')); else if (r.due_date) bits.push('예상 발주일 ' + r.due_date);
  if (r.state === 'ended') bits.push('계약 ' + (r.contract_status || '종료') + (r.contract_cust ? ' · ' + r.contract_cust : ''));
  return `• *${r.sitename}* — ${bits.filter(Boolean).join(' · ')}`;
}
function siteSection(title: string, rows: SiteRow[], who: (e: string | null) => string, max = 25): unknown[] {
  if (!rows.length) return [];
  const body = rows.slice(0, max).map((r) => siteLine(r, who)).join('\n') + (rows.length > max ? `\n… 외 ${rows.length - max}건` : '');
  return [{ type: 'section', text: { type: 'mrkdwn', text: `*${title}* — ${rows.length}건` } }, { type: 'section', text: { type: 'mrkdwn', text: body.slice(0, 2900) } }];
}
function buildSites(rows: SiteRow[], who: (e: string | null) => string, portalUrl = PORTAL_URL) {
  const by = (s: string) => rows.filter((r) => r.state === s);
  const overdue = by('overdue'), waiting = by('waiting'), pocOver = by('poc_over'), ended = by('ended');
  const alert = overdue.length + waiting.length + pocOver.length + ended.length;
  const oldest = [...overdue, ...waiting].sort((a, b) => b.days - a.days)[0];
  const head = alert ? `🛰️ 계약 없이 쓰는 Cloud 사이트 ${alert}개${oldest ? ` — 가장 오래된 건 ${oldest.days}일` : ''}` : '🛰️ Cloud 사이트 → 계약 전환 점검 — 계약 없이 쓰는 사이트 없음 ✅';
  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: head.slice(0, 150) } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `${SLACK_MENTION ? SLACK_MENTION + ' ' : ''}포탈에서 만든 정책서버(사이트)마다 계약(CSM 사이트명)이 붙었는지 — 발주서 없이 무상 사용되는 일을 막기 위한 월말 점검 · 처리는 ${portalUrl ? `<${portalUrl}#csite|포탈 › Cloud 사이트 관리 › 계약 전환 점검>` : '포탈 › Cloud 사이트 관리 › 계약 전환 점검'}` }] },
  ];
  blocks.push(...siteSection('🔴 예상 발주일이 지났는데 계약 없음', overdue, who));
  blocks.push(...siteSection('🟠 계약 대기 (오래된 순)', [...waiting].sort((a, b) => b.days - a.days), who));
  blocks.push(...siteSection('🟡 PoC 종료일이 지남 — 전환하거나 사이트를 정리', pocOver, who));
  blocks.push(...siteSection('⚫ 계약은 끝났는데 사이트가 남아 있음', ended, who));
  const tail = [`PoC 진행 ${by('poc').length}`, `내부·데모 ${by('internal').length}`, `계약 연결 ${by('linked').length}`, `종료·무상 승인 ${by('closed').length + by('exempt').length}`].join(' · ');
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `그 밖에 — ${tail} · 사이트를 만들 때 용도(유상 · PoC · 내부)와 예상 발주일을 적어 두면 이 점검이 정확해집니다` }] });
  const text = `${head} — 발주일 지남 ${overdue.length} · 계약 대기 ${waiting.length} · PoC 종료 ${pocOver.length} · 계약 끝남 ${ended.length}`;
  return { blocks, text, total: alert, counts: { overdue: overdue.length, waiting: waiting.length, poc_over: pocOver.length, ended: ended.length, poc: by('poc').length, internal: by('internal').length, linked: by('linked').length, closed: by('closed').length + by('exempt').length } };
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
  const only = onlyList(body.only);
  const wantRenew = !only.length || only.some((k) => (ALL_KINDS as string[]).includes(k));
  const wantSites = !only.length || only.includes('sites');   /* ㊿+192 월말 전체 실행이면 갱신 메시지 다음에 «사이트 점검»도 · only:'sites' 면 그것만 */
  const kinds = pickKinds(body.only);
  const portalUrl = (typeof body.portal_url === 'string' && /^https:\/\/[^\s<>|"']{8,200}$/.test(body.portal_url)) ? body.portal_url : PORTAL_URL;

  // ── 슬랙 보내기(공통) — 429 면 Retry-After 만큼 기다렸다 다시(두 번까지) · 시간 초과는 다시 보내지 않음 ──
  async function postSlack(text: string, blocks: unknown[]): Promise<{ ok: boolean; error: string; ts?: string }> {
    if (!SLACK_TOKEN) return { ok: false, error: 'SLACK_BOT_TOKEN 이 설정되지 않았습니다 (Edge Functions › Secrets)' };
    try {
      const post = () => fetchT('https://slack.com/api/chat.postMessage', {
        method: 'POST', headers: { Authorization: 'Bearer ' + SLACK_TOKEN, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ channel: SLACK_CHANNEL, text, blocks, unfurl_links: false }),
      }, 15000);
      let sr = await post();
      for (let i = 0; sr.status === 429 && i < 2; i++) { const ra = Number(sr.headers.get('Retry-After')); await sr.body?.cancel().catch(() => null); await new Promise((ok) => setTimeout(ok, Math.min(isFinite(ra) && ra >= 0 ? ra * 1000 : 2000, 10000))); sr = await post(); }
      const j = await sr.json().catch(() => ({ ok: false, error: sr.status === 429 ? 'ratelimited' : 'http_' + sr.status }));
      if (!j || !j.ok) return { ok: false, error: 'slack: ' + String((j && j.error) || sr.status) + (j && j.error === 'not_in_channel' ? ' — 봇을 채널에 초대하세요 (/invite @봇이름)' : '') };
      return { ok: true, error: '', ts: j.ts ? String(j.ts) : undefined };
    } catch (e) { return { ok: false, error: 'slack: ' + String((e as Error).message) }; }
  }

  // ── ① 갱신 처리 대상 ──
  let msg: ReturnType<typeof buildMessage> | null = null, ok = true, error = '', slackTs: string | undefined;
  if (wantRenew) {
    const r = await fetchT(SB_URL + '/rest/v1/rpc/renew_watch', { method: 'POST', headers: hdr, body: JSON.stringify({ p_month: thisM }) }, 15000);
    if (!r.ok) return json({ ok: false, error: 'renew_watch 실패 (' + r.status + '): ' + (await r.text()).slice(0, 200) + ' — SQL 84 를 실행했는지 확인' }, 500);
    const rows = (await r.json()) as Row[];
    msg = buildMessage(rows, thisM, nextM, kinds, portalUrl);
    if (!dry) { const sres = await postSlack(msg.text, msg.blocks); ok = sres.ok; error = sres.error; slackTs = sres.ts; }
    // ── 기록 (표가 없어도 실패하지 않음) ──
    if (svcKey) {
      await fetchT(SB_URL + '/rest/v1/remind_log', { method: 'POST', headers: { ...hdr, Prefer: 'return=minimal' },
        body: JSON.stringify({ period: nextM.slice(0, 7), kind: kinds.length === ALL_KINDS.length ? 'monthly' : kinds.join('+'), channel: SLACK_CHANNEL, n_lapsed: msg.lapsed.length, n_due: msg.due.length, n_next: msg.next.length, ok, error: error || null, dry, sent_by: sentBy }) }, 8000).catch(() => null);
    }
  }

  // ── ② 사이트 → 계약 전환 점검 (㊿+192 · SQL 115) ──
  let sites: Record<string, unknown> | undefined;
  if (wantSites) {
    const sr = await fetchT(SB_URL + '/rest/v1/rpc/site_watch', { method: 'POST', headers: hdr, body: '{}' }, 15000).catch(() => null);
    if (!sr || !sr.ok) {
      const why = sr ? 'site_watch 실패 (' + sr.status + ') — SQL 115 를 실행했는지 확인' : 'site_watch 호출 실패';
      sites = { ok: false, skipped: true, error: why };
      if (only.includes('sites')) return json({ ok: false, error: why, dry }, 500);
    } else {
      const srows = (await sr.json()) as SiteRow[];
      const names: Record<string, string> = {};
      if (svcKey) { const pr = await fetchT(SB_URL + '/rest/v1/portal_profiles?select=email,name,title', { headers: hdr }, 8000).catch(() => null);
        if (pr && pr.ok) for (const p of (await pr.json()) as { email: string; name: string | null; title: string | null }[]) if (p.name) names[String(p.email).toLowerCase()] = p.name + (p.title ? ' ' + p.title : ''); }
      const who = (e: string | null) => { const em = String(e || '').toLowerCase(); return em ? (names[em] || em.split('@')[0]) : ''; };
      const sm = buildSites(srows, who, portalUrl);
      let sok = true, serr = '', sts: string | undefined;
      if (!dry) { const res = await postSlack(sm.text, sm.blocks); sok = res.ok; serr = res.error; sts = res.ts; }
      if (svcKey) {
        await fetchT(SB_URL + '/rest/v1/remind_log', { method: 'POST', headers: { ...hdr, Prefer: 'return=minimal' },
          body: JSON.stringify({ period: thisM.slice(0, 7), kind: 'sites', channel: SLACK_CHANNEL, n_lapsed: sm.counts.overdue + sm.counts.poc_over + sm.counts.ended, n_due: sm.counts.waiting, n_next: 0, ok: sok, error: serr || null, dry, sent_by: sentBy }) }, 8000).catch(() => null);
      }
      sites = { ok: sok, error: serr || undefined, total: sm.total, counts: sm.counts, text: sm.text, preview: dry ? sm.blocks : undefined, slack_ts: sts };
      if (!wantRenew) { ok = sok; error = serr; }
      else if (!sok) { ok = false; error = (error ? error + ' / ' : '') + '사이트 점검: ' + serr; }
    }
  }
  return json({ ok, error: error || undefined, dry, period: nextM.slice(0, 7), kinds: wantRenew ? kinds : [], only: only.length ? only : undefined, total: msg ? msg.total : (sites && typeof sites.total === 'number' ? sites.total : 0), portal_url: portalUrl || undefined,
    counts: msg ? { due: msg.due.length, next: msg.next.length, lapsed: msg.lapsed.length } : undefined, text: msg ? msg.text : (sites && sites.text) || '',
    preview: dry && msg ? msg.blocks : undefined, slack_ts: slackTs, channel: SLACK_CHANNEL, sites });
});
