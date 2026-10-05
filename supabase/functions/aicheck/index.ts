// aicheck v1.2 — 포탈 AI 야간 자동 점검 (90점 프로젝트 ⑥ AI 2단계 · 2026-10-03)
//   · v1.2(㊿+147): 야간 운영 요약 — 지난 24시간 브라우저 오류(client_errors) · 배포·운영 실패(ops_log ok=false)를 함께 모아,
//     AI 통과율 미달 «또는» 오류·실패가 하나라도 있으면 슬랙 한 통(없으면 조용). 끄려면 Secrets AICHECK_DIGEST=0
//   · 숫자 기대값: 만원·원 표기도 인정(포탈 aiHasNum 과 같게)
//   · 대표 질문 12개를 ask 함수(서비스 키 경로 · 요약은 ask 가 ai_digest 로 직접 만듦)에 동시 3개씩 보내고,
//     답에 DB 로 계산한 기대값(ai_check_expect · SQL 94)이 들어 있는지 + 비어 있지 않은지 + 중단되지 않았는지 확인
//   · 결과를 ai_check_log(source cron) 에 기록 → 포탈 배포·운영 › 기록 › «AI 점검 추이» · 통과율이 AICHECK_MIN(기본 0.7) 미만이면 슬랙
//   · 인증: 서비스 키(SUPABASE_SERVICE_ROLE_KEY) 또는 AICHECK_KEY(크론용) 또는 super_admin 사용자 JWT · ?dry=1 / {dry:true} 면 기록·슬랙 없이 결과만
//   · v1.1: 크론 호출(서비스 키·AICHECK_KEY)은 즉시 202 를 돌려주고 뒤에서 실행(EdgeRuntime.waitUntil) — pg_net 기본 대기 5초 안에 응답 · {wait:true} 면 기다림
//   · Secrets: (필수 없음) · 선택 AICHECK_KEY · AICHECK_MIN · SLACK_BOT_TOKEN · AICHECK_SLACK_CHANNEL(없으면 SLACK_CHANNEL → C08RA3PPDH8) · PORTAL_URL · AICHECK_CONC(동시 수)
//   · Verify JWT 는 끔(ask·remind·ops 와 같게 — 함수 안에서 토큰 검사)
const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const AICHECK_KEY = Deno.env.get('AICHECK_KEY') ?? '';
const MIN_PASS = Math.min(1, Math.max(0, Number(Deno.env.get('AICHECK_MIN') ?? '0.7') || 0.7));
const CONC = Math.min(5, Math.max(1, Number(Deno.env.get('AICHECK_CONC') ?? '3') || 3));
const SLACK_TOKEN = Deno.env.get('SLACK_BOT_TOKEN') ?? '';
const SLACK_CH = Deno.env.get('AICHECK_SLACK_CHANNEL') || Deno.env.get('SLACK_CHANNEL') || 'C08RA3PPDH8';
const PORTAL_URL = Deno.env.get('PORTAL_URL') ?? '';
const DIGEST = (Deno.env.get('AICHECK_DIGEST') ?? '1') !== '0';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
async function fetchT(url: string, init: RequestInit, ms: number) { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); try { return await fetch(url, { ...init, signal: c.signal }); } finally { clearTimeout(t); } }

/* ── 기대값 비교 (포탈 aiHasNum/aiHasCount 와 같은 규칙) ── */
export function hasNum(a: string, won: unknown): boolean {
  if (won == null || isNaN(Number(won))) return true;
  const t = String(a || '').replace(/\s/g, ''); const w = Number(won); const c: string[] = [];
  const k = Math.round(w / 1000); c.push(String(k), k.toLocaleString('ko-KR'));
  for (const m of [Math.round(w / 1e4), Math.floor(w / 1e4)]) if (m > 0) c.push(m + '만', m.toLocaleString('ko-KR') + '만');   // 만원 표기 (포탈 aiHasNum 과 같게 · ㊿+147)
  if (Math.abs(w) >= 1000) c.push(Math.round(w).toLocaleString('ko-KR') + '원', String(Math.round(w)) + '원');
  const mm = Math.round(w / 1e6); if (mm > 0) c.push(mm + '백만', mm.toLocaleString('ko-KR') + '백만');
  const ek = w / 1e8; if (ek >= 0.1) c.push(ek.toFixed(1) + '억', ek.toFixed(2) + '억', (Math.round(ek * 10) / 10) + '억');
  return c.some((x) => x && t.includes(x));
}
export function hasCount(a: string, n: unknown): boolean {
  if (n == null) return true; const t = String(a || '').replace(/\s/g, ''); const v = Number(n);
  if (v === 0) return /없|0건|0곳|0개|않습니다/.test(t);
  return t.includes(String(v));
}
type Expect = Record<string, unknown>;
type Q = { q: string; l: string; check: (E: Expect, a: string) => boolean };
export const QS: Q[] = [
  // MRR 은 ask 가 ai_digest(DB 함수)로 만든 요약을 보고 답하므로 월 매출 단순 합계와 정의가 다를 수 있음 → 합계 일치 또는 «금액 표기가 있음» 이면 통과(정확 비교는 포탈 15문 점검이 담당)
  { q: '이번 달 MRR 얼마야?', l: '이달 월 매출(합계 또는 금액 표기)', check: (E, a) => hasNum(a, E.month_revenue) || /\d[\d,.]*\s*(천원|백만|억|만원|원)/.test(a) },
  { q: 'LIVE 고객사 몇 곳이야?', l: 'LIVE 고객사 수', check: (E, a) => hasCount(a, E.live_customers) },
  { q: '서비스별 MRR 알려줘', l: 'Cloud·MDR 언급', check: (_E, a) => /cloud|클라우드|nac/i.test(a) && /mdr/i.test(a) },
  { q: '만기 지났는데 미처리인 계약 몇 건이야?', l: '미처리 건수', check: (E, a) => hasCount(a, E.lapsed_n) },
  { q: '이번 달 만기 계약 몇 건이야?', l: '이달 만기 건수', check: (E, a) => hasCount(a, E.due_n) },
  { q: '다음 달 만기 계약 몇 건이야?', l: '다음 달 만기 건수', check: (E, a) => hasCount(a, E.next_n) },
  { q: '지금 임대중인 장비가 몇 대야?', l: '임대중 장비 수', check: (E, a) => hasCount(a, E.assets_rented) },
  { q: 'OI 파이프라인 어때?', l: '건수 + 가중 금액', check: (_E, a) => /건/.test(a) && /가중|기대|금액|원/.test(a) },
  { q: '연도별 매출 추이 알려줘', l: '연도 표기', check: (_E, a) => /20\d{2}/.test(a) },
  { q: '에스원 채널 MRR 은 얼마야?', l: '에스원 언급 + 숫자', check: (_E, a) => /에스원|S1/i.test(a) && /\d/.test(a) },
  { q: 'MRR 성장률이 어때?', l: '퍼센트 표기', check: (_E, a) => /%|퍼센트/.test(a) },
  { q: '포탈에서 2단계 인증은 어떻게 켜?', l: '사용법 안내(팀 지식)', check: (_E, a) => /내 계정|보안|인증 앱|2단계|OTP|Authenticator/i.test(a) },
];

type Row = { q: string; l: string; ok: boolean; why: string; ms: number; model: string; tools: number; head: string };
async function askOne(q: string): Promise<{ r: any; ms: number }> {
  const t0 = Date.now();
  try {
    const r = await fetchT(SB_URL + '/functions/v1/ask', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_ANON, Authorization: 'Bearer ' + SB_SVC }, body: JSON.stringify({ mode: 'chat', question: q, history: [] }) }, 75000);
    const j = await r.json().catch(() => ({ ok: false, error: 'HTTP ' + r.status }));
    if (!r.ok && j && j.ok === undefined) j.ok = false;
    return { r: j, ms: Date.now() - t0 };
  } catch (e) { return { r: { ok: false, error: String((e as Error).message || e).slice(0, 120) }, ms: Date.now() - t0 }; }
}
/* ── 야간 운영 요약 (v1.2) — 지난 24시간 브라우저 오류 · 배포·운영 실패 ── */
export type Digest = { errors: number; users: number; top: { msg: string; n: number }[]; staging: number; opsFails: number; opsTop: string[]; err: string };
export async function opsDigest(sinceIso: string): Promise<Digest> {
  const H = { apikey: SB_SVC, Authorization: 'Bearer ' + SB_SVC };
  const d: Digest = { errors: 0, users: 0, top: [], staging: 0, opsFails: 0, opsTop: [], err: '' };
  try {
    const r = await fetchT(SB_URL + '/rest/v1/client_errors?select=email,msg,n,staging&at=gte.' + encodeURIComponent(sinceIso) + '&order=at.desc&limit=500', { headers: H }, 10000);
    if (r.ok) {
      const rows = await r.json() as { email: string; msg: string; n: number; staging: boolean }[];
      const by: Record<string, number> = {}, who = new Set<string>();
      rows.forEach((x) => { const k = String(x.msg || '').slice(0, 90); by[k] = (by[k] || 0) + (Number(x.n) || 1); who.add(String(x.email || '')); if (x.staging) d.staging++; });
      d.errors = rows.reduce((a, x) => a + (Number(x.n) || 1), 0); d.users = who.size;
      d.top = Object.keys(by).sort((a, b) => by[b] - by[a]).slice(0, 3).map((k) => ({ msg: k, n: by[k] }));
    } else d.err += 'client_errors ' + r.status + ' ';
  } catch (e) { d.err += 'client_errors ' + String((e as Error).message || e).slice(0, 40) + ' '; }
  try {
    const r = await fetchT(SB_URL + '/rest/v1/ops_log?select=action,target,error&ok=is.false&at=gte.' + encodeURIComponent(sinceIso) + '&order=at.desc&limit=100', { headers: H }, 10000);
    if (r.ok) {
      const rows = await r.json() as { action: string; target: string; error: string }[];
      d.opsFails = rows.length; d.opsTop = rows.slice(0, 3).map((x) => `${x.action}${x.target ? ' · ' + String(x.target).slice(0, 40) : ''} — ${String(x.error || '').slice(0, 70)}`);
    } else d.err += 'ops_log ' + r.status;
  } catch (e) { d.err += 'ops_log ' + String((e as Error).message || e).slice(0, 40); }
  return d;
}
export function digestText(res: { pass: number; total: number; avg_ms: number; model: string }, fails: { q: string; why: string }[], dg: Digest | null, aiBad: boolean, expectErr: string): string {
  const rate = res.total ? res.pass / res.total : 0;
  const head = [`🤖 AI ${res.pass}/${res.total} 통과` + (aiBad ? ` (${Math.round(rate * 100)}% · 기준 ${Math.round(MIN_PASS * 100)}%)` : ' ✓')];
  if (dg) { head.push(dg.errors ? `🧯 브라우저 오류 ${dg.errors}건(${dg.users}명${dg.staging ? ' · 스테이징 ' + dg.staging : ''})` : '🧯 브라우저 오류 0'); head.push(dg.opsFails ? `🚀 배포·운영 실패 ${dg.opsFails}건` : '🚀 배포·운영 실패 0'); }
  const lines: string[] = ['🌙 포탈 야간 점검 — ' + head.join(' · ')];
  if (aiBad) { lines.push(...fails.slice(0, 6).map((f) => `• AI: ${f.q} — ${f.why}`)); if (fails.length > 6) lines.push(`… 외 ${fails.length - 6}건`); if (res.model) lines.push(`모델 ${res.model} · 평균 ${(res.avg_ms / 1000).toFixed(1)}초`); }
  if (dg && dg.errors) lines.push(...dg.top.map((t) => `• 오류 ×${t.n}: ${t.msg}`));
  if (dg && dg.opsFails) lines.push(...dg.opsTop.map((t) => `• 배포·운영: ${t}`));
  if (expectErr) lines.push(`⚠ 기대값: ${expectErr}`);
  if (dg && dg.err) lines.push(`⚠ 요약 읽기: ${dg.err.trim()}`);
  if (PORTAL_URL) lines.push(`${PORTAL_URL}#ops`);
  return lines.join('\n');
}
export async function runCheck(expect: Expect, qs: Q[] = QS, conc = CONC): Promise<{ rows: Row[]; pass: number; total: number; avg_ms: number; model: string }> {
  const rows: Row[] = new Array(qs.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(conc, qs.length) }, async () => {
    while (i < qs.length) {
      const k = i++; const x = qs[k];
      const { r, ms } = await askOne(x.q);
      const text = String((r && r.text) || '');
      let ok = false, why = '';
      if (!r || !r.ok) why = '오류: ' + String((r && r.error) || '응답 없음').slice(0, 80);
      else if (!text.trim()) why = '빈 답';
      else if (r.degraded) why = '답 미완성: ' + String(r.cut || '').slice(0, 60);
      else if (!x.check(expect, text)) why = '기대값 없음 (' + x.l + ')';
      else ok = true;
      rows[k] = { q: x.q, l: x.l, ok, why, ms, model: String((r && r.model) || '').replace(/^claude-/, ''), tools: (r && Array.isArray(r.queries)) ? r.queries.length : 0, head: text.slice(0, 160) };
    }
  }));
  const pass = rows.filter((r) => r.ok).length, avg_ms = Math.round(rows.reduce((a, r) => a + r.ms, 0) / Math.max(1, rows.length));
  const cnt: Record<string, number> = {}; rows.forEach((r) => { if (r.model) cnt[r.model] = (cnt[r.model] || 0) + 1; });
  const model = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0] || '';
  return { rows, pass, total: rows.length, avg_ms, model };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch { /* empty */ } }
  const dry = url.searchParams.get('dry') === '1' || body.dry === true;

  // ── 인증 ──
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ ok: false, error: '인증 필요' }, 401);
  let actor = 'cron';
  const isSvc = (SB_SVC && token === SB_SVC) || (AICHECK_KEY && token === AICHECK_KEY);
  if (!isSvc) {
    const who = await fetchT(SB_URL + '/auth/v1/user', { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + token } }, 8000).catch(() => null);
    if (!who || !who.ok) return json({ ok: false, error: '로그인이 만료되었습니다' }, 401);
    const u = await who.json(); actor = String(u.email || u.id || 'user');
    const rr = await fetchT(SB_URL + '/rest/v1/user_roles?select=role', { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + token } }, 5000).catch(() => null);
    const roles = rr && rr.ok ? await rr.json() : [];
    if (!(Array.isArray(roles) && roles[0] && roles[0].role === 'super_admin')) return json({ ok: false, error: 'AI 점검은 슈퍼 관리자만 실행할 수 있습니다' }, 403);
  }
  if (!SB_SVC) return json({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY 가 없어 ask 를 서버 경로로 부를 수 없습니다' }, 500);

  // ── 기대값 (SQL 94) ──
  let expect: Expect = {}, expectErr = '';
  try {
    const r = await fetchT(SB_URL + '/rest/v1/rpc/ai_check_expect', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_SVC, Authorization: 'Bearer ' + SB_SVC }, body: '{}' }, 20000);
    if (r.ok) expect = await r.json(); else expectErr = 'ai_check_expect ' + r.status + ' — SQL 94 확인';
  } catch (e) { expectErr = String((e as Error).message || e).slice(0, 100); }

  // ── 실행 ──
  const work = async () => {
  const t0 = Date.now();
  const res = await runCheck(expect);
  const fails = res.rows.filter((r) => !r.ok).map((r) => ({ q: r.q, why: r.why, head: r.head }));
  const rate = res.total ? res.pass / res.total : 0;
  const summary = { ok: true, dry, source: actor === 'cron' ? 'cron' : 'manual', actor, pass: res.pass, total: res.total, rate: Math.round(rate * 100) / 100, avg_ms: res.avg_ms, model: res.model, expect_err: expectErr || undefined, expect, fails, rows: res.rows, ms: Date.now() - t0 };

  let logged = false, slack: unknown = null, digest: Digest | null = null;
  if (!dry) {
    try {
      const r = await fetchT(SB_URL + '/rest/v1/ai_check_log', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_SVC, Authorization: 'Bearer ' + SB_SVC, Prefer: 'return=minimal' },
        body: JSON.stringify({ source: 'cron', app_ver: null, pass: res.pass, total: res.total, avg_ms: res.avg_ms, model: res.model, fails, rows: res.rows.map((r) => ({ q: r.q, ok: r.ok, why: r.why, ms: r.ms, tools: r.tools })), actor }) }, 10000);
      logged = r.ok;
    } catch { /* 표 없음(SQL 94 전) 등 — 결과는 응답으로 돌려줌 */ }
    const aiBad = rate < MIN_PASS;
    digest = DIGEST ? await opsDigest(new Date(Date.now() - 24 * 3600 * 1000).toISOString()) : null;
    const opsBad = !!digest && (digest.errors > 0 || digest.opsFails > 0);
    if ((aiBad || opsBad) && SLACK_TOKEN) {
      const text = digestText(res, fails, digest, aiBad, expectErr);
      try {
        const r = await fetchT('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: 'Bearer ' + SLACK_TOKEN }, body: JSON.stringify({ channel: SLACK_CH, text }) }, 10000);
        slack = await r.json().catch(() => null);
      } catch (e) { slack = { ok: false, error: String((e as Error).message || e) }; }
    }
  }
  return { ...summary, logged, slack, digest };
  };
  // 크론(Supabase Cron · pg_net)은 응답을 몇 초만 기다리므로, 서비스 키/AICHECK_KEY 로 온 호출은 바로 202 를 돌려주고 뒤에서 끝까지 실행(EdgeRuntime.waitUntil).
  // 결과는 ai_check_log · 포탈 배포·운영 › 기록 › AI 점검 추이. {wait:true} 면 끝날 때까지 기다려 결과를 돌려줌(수동 확인용).
  const rt = (globalThis as any).EdgeRuntime;
  if (!dry && body.wait !== true && actor === 'cron' && rt && typeof rt.waitUntil === 'function') {
    rt.waitUntil(work().catch((e) => console.error('[aicheck] 실패', e)));
    return json({ ok: true, accepted: true, background: true, note: '점검을 뒤에서 실행합니다 — 1~2분 뒤 ai_check_log / 포탈 배포·운영 › 기록 › AI 점검 추이에서 확인' }, 202);
  }
  return json(await work());
});
