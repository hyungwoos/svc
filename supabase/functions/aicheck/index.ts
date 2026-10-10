// aicheck v1.6 — 포탈 AI 야간 자동 점검 (90점 프로젝트 ⑥ AI 2단계 · 2026-10-03)
//   · v1.6(2026-10-10 · ㊿+178 «숫자 기준 하나로»): 채점을 숫자로 — 예전엔 «2026» 안에 «2»가 들어 있으면 «2건» 통과 · 금액은 아무 금액이나 통과 · 연도 · % 는 표기만 보면 통과
//     · 건수: 단위(건 · 곳 · 개 · 대 · 명)가 붙은 숫자와 정확히 같아야 · 년/월/일/% 앞 숫자는 셈하지 않음
//     · 금액: 답의 금액(억 · 천만 · 백만 · 만 · 천원 · 원)을 원으로 바꿔 기대값과 ±1% 안 · OI 는 진행 중 건수(oi_open) · 연도별은 SQL 110 rev_years(작년 합 ±2%)
//     · 성장률은 «숫자 %» · 에스원은 금액 표기 — 기대값이 없으면(SQL 110 전) 예전 규칙
//   · v1.5(2026-10-07 · 야간 점검이 매일 «HTTP 401 · Conflicting API keys»): Supabase 새 API 키(sb_publishable/sb_secret)에서는
//     ask 를 부를 때 apikey(공개 키)와 Authorization(서비스 키)이 서로 다른 키면 게이트웨이가 거부함 → 둘 다 서비스 키로 (askHdr)
//     · 실패 안내(fixHint)에 «Conflicting API keys» 경우 추가 · ask 최신 버전 표기 v3.4
//   · v1.4(2026-10-05 · 사용자: «C0BQR2JCU3Z 채널로 · 상세 내용 말고 성공/실패만 간단하게»):
//     슬랙은 매일 한 줄 — «✅ 포탈 야간 점검 성공» / «❌ 포탈 야간 점검 실패 — 포탈 › 배포·운영 › 기록에서 확인»
//     · 채널 기본 C0BQR2JCU3Z(AICHECK_SLACK_CHANNEL 로만 바꿈 — remind 의 SLACK_CHANNEL 은 안 따름)
//     · AICHECK_NOTIFY = all(기본 · 성공도 알림) | fail(실패만) | off
//     · 실패 = 통과율 < AICHECK_MIN · ask 호출 막힘 · 기대값(ai_check_expect) 못 읽음 · 점검 자체 오류
//     · 실패 이유·고치는 방법은 슬랙에 넣지 않고 ai_check_log(질문별 why) · 함수 Logs · 응답(reason/hint)에
//     · v1.2 의 «브라우저 오류·배포 실패 요약»은 슬랙에서 뺌(포탈 › 배포·운영 › 기록에서 봄)
//     · 점검을 못 한 날(ask 막힘·기대값 못 읽음)은 ai_check_log.fails 첫 칸에 «⛔ 이유 → 해결» — 포탈 «AI 점검 추이» 실패 질문 칸에 그대로 보임
//   · v1.3(2026-10-05): 첫 야간 실행이 «0/12 · 오류: 응답 없음 · 0.0초» — ask 가 아니라 그 앞(게이트웨이 등)에서 막힌 것으로 보이는데
//     응답 본문에 error 칸이 없어 이유가 안 보였음 → ① 실패 이유에 HTTP 상태 + message/msg/code 를 그대로 ② 질문 전에 ask 에 ping 한 번 —
//     안 되면 12문을 돌리지 않고 «무엇이 막혔는지 + 고치는 방법» 한 줄로 슬랙(같은 오류 12줄 대신)
//   · v1.2(㊿+147): 야간 운영 요약 — 지난 24시간 브라우저 오류(client_errors) · 배포·운영 실패(ops_log ok=false)를 함께 모아,
//     AI 통과율 미달 «또는» 오류·실패가 하나라도 있으면 슬랙 한 통(없으면 조용). 끄려면 Secrets AICHECK_DIGEST=0
//   · 숫자 기대값: 만원·원 표기도 인정(포탈 aiHasNum 과 같게)
//   · 대표 질문 12개를 ask 함수(서비스 키 경로 · 요약은 ask 가 ai_digest 로 직접 만듦)에 동시 3개씩 보내고,
//     답에 DB 로 계산한 기대값(ai_check_expect · SQL 94)이 들어 있는지 + 비어 있지 않은지 + 중단되지 않았는지 확인
//   · 결과를 ai_check_log(source cron) 에 기록 → 포탈 배포·운영 › 기록 › «AI 점검 추이» · 통과율이 AICHECK_MIN(기본 0.7) 미만이면 슬랙
//   · 인증: 서비스 키(SUPABASE_SERVICE_ROLE_KEY) 또는 AICHECK_KEY(크론용) 또는 super_admin 사용자 JWT · ?dry=1 / {dry:true} 면 기록·슬랙 없이 결과만
//   · v1.1: 크론 호출(서비스 키·AICHECK_KEY)은 즉시 202 를 돌려주고 뒤에서 실행(EdgeRuntime.waitUntil) — pg_net 기본 대기 5초 안에 응답 · {wait:true} 면 기다림
//   · Secrets: (필수 없음) · 선택 AICHECK_KEY · AICHECK_MIN · SLACK_BOT_TOKEN · AICHECK_SLACK_CHANNEL(기본 C0BQR2JCU3Z) · AICHECK_NOTIFY · PORTAL_URL · AICHECK_CONC(동시 수)
//   · Verify JWT 는 끔(ask·remind·ops 와 같게 — 함수 안에서 토큰 검사)
const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const AICHECK_KEY = Deno.env.get('AICHECK_KEY') ?? '';
const MIN_PASS = Math.min(1, Math.max(0, Number(Deno.env.get('AICHECK_MIN') ?? '0.7') || 0.7));
const CONC = Math.min(5, Math.max(1, Number(Deno.env.get('AICHECK_CONC') ?? '3') || 3));
const SLACK_TOKEN = Deno.env.get('SLACK_BOT_TOKEN') ?? '';
export const DEFAULT_CH = 'C0BQR2JCU3Z';
const slackCh = () => Deno.env.get('AICHECK_SLACK_CHANNEL') || DEFAULT_CH;
const notifyMode = () => { const m = (Deno.env.get('AICHECK_NOTIFY') || 'all').trim().toLowerCase(); return m === 'fail' || m === 'off' ? m : 'all'; };
const PORTAL_URL = Deno.env.get('PORTAL_URL') ?? '';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
async function fetchT(url: string, init: RequestInit, ms: number) { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); try { return await fetch(url, { ...init, signal: c.signal }); } finally { clearTimeout(t); } }

/* ── 기대값 비교 (포탈 aiHasNum/aiHasCount/aiNums/aiNear 와 같은 규칙 · v1.6) ── */
const UNIT_W: Record<string, number> = { '억': 1e8, '천만': 1e7, '백만': 1e6, '만': 1e4, '만원': 1e4, '천원': 1e3, '원': 1 };
/** 답 속 숫자들 — {v: 값, u: 바로 뒤 단위} · «1억 2,345만» 은 한 금액으로 */
export function nums(a: string): { v: number; u: string }[] {
  const out: { v: number; u: string }[] = []; const t = String(a || '');
  for (const m of t.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*억\s*(\d[\d,]*(?:\.\d+)?)\s*만/g)) out.push({ v: Number(m[1].replace(/,/g, '')) * 1e8 + Number(m[2].replace(/,/g, '')) * 1e4, u: '원' });
  for (const m of t.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(억|천만|백만|만원|만|천원|원|건|곳|개사|개|대|명|년|월|일|%|시|분|초)?/g)) {
    const v = Number(m[1].replace(/,/g, '')); if (isNaN(v)) continue; const u = m[2] || '';
    if (UNIT_W[u]) out.push({ v: v * UNIT_W[u], u: '원' }); else out.push({ v, u });
  }
  return out;
}
/** 금액이 기대값(원)과 ±tol 안인가 */
export function near(a: string, won: unknown, tol = 0.01): boolean {
  if (won == null || isNaN(Number(won))) return true; const w = Number(won);
  if (w === 0) return /0원|없/.test(String(a || ''));
  return nums(a).some((x) => x.u === '원' && Math.abs(x.v - w) <= Math.abs(w) * tol);
}
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
  if (n == null) return true; const t = String(a || ''); const v = Number(n);
  if (v === 0) return /없|(^|[^\d.,])0\s*(건|곳|개|대|명)|않습니다/.test(t);
  const ns = nums(t), unit = ns.filter((x) => /^(건|곳|개사|개|대|명)$/.test(x.u));
  if (unit.length) return unit.some((x) => x.v === v);
  return ns.some((x) => x.v === v && x.u === '');   // 단위 없는 숫자만(년 · 월 · % · 금액 앞 숫자는 셈하지 않음)
}
/** 연도별: 작년 합이 ±2% 안 + 연도 둘 이상 — rev_years 가 없으면(SQL 110 전) 연도 표기만 */
export function yearsOk(E: Expect, a: string): boolean {
  const ry = (E.rev_years || null) as Record<string, number> | null;
  const ys = Object.keys(ry || {}).sort();
  if (!ys.length) return /20\d{2}/.test(a);
  const named = ys.filter((y) => a.includes(y)).length, prev = String(Number(String(E.month || '').slice(0, 4)) - 1);
  return named >= Math.min(2, ys.length) && (!ry || ry[prev] == null || near(a, ry[prev], 0.02));
}
type Expect = Record<string, unknown>;
type Q = { q: string; l: string; check: (E: Expect, a: string) => boolean };
export const QS: Q[] = [
  // MRR 은 ask 가 ai_digest(DB 함수)로 만든 요약을 보고 답하므로 월 매출 단순 합계와 정의가 다를 수 있음 → 합계 일치 또는 «금액 표기가 있음» 이면 통과(정확 비교는 포탈 15문 점검이 담당)
  { q: '이번 달 MRR 얼마야?', l: '이달 월 매출 ±1%', check: (E, a) => near(a, E.month_revenue, 0.01) },
  { q: 'LIVE 고객사 몇 곳이야?', l: 'LIVE 고객사 수', check: (E, a) => hasCount(a, E.live_customers) },
  { q: '서비스별 MRR 알려줘', l: 'Cloud·MDR 언급', check: (_E, a) => /cloud|클라우드|nac/i.test(a) && /mdr/i.test(a) },
  { q: '만기 지났는데 미처리인 계약 몇 건이야?', l: '미처리 건수', check: (E, a) => hasCount(a, E.lapsed_n) },
  { q: '이번 달 만기 계약 몇 건이야?', l: '이달 만기 건수', check: (E, a) => hasCount(a, E.due_n) },
  { q: '다음 달 만기 계약 몇 건이야?', l: '다음 달 만기 건수', check: (E, a) => hasCount(a, E.next_n) },
  { q: '지금 임대중인 장비가 몇 대야?', l: '임대중 장비 수', check: (E, a) => hasCount(a, E.assets_rented) },
  { q: 'OI 파이프라인 어때?', l: '진행 중 건수 + 가중 금액', check: (E, a) => hasCount(a, E.oi_open) && /가중|기대/.test(a) },
  { q: '연도별 매출 추이 알려줘', l: '연도 둘 이상 + 작년 합 ±2%', check: (E, a) => yearsOk(E, a) },
  { q: '에스원 채널 MRR 은 얼마야?', l: '에스원 언급 + 금액', check: (_E, a) => /에스원|S1/i.test(a) && nums(a).some((x) => x.u === '원') },
  { q: 'MRR 성장률이 어때?', l: '숫자 %', check: (_E, a) => /\d+(\.\d+)?\s*%/.test(a) },
  { q: '포탈에서 2단계 인증은 어떻게 켜?', l: '사용법 안내(팀 지식)', check: (_E, a) => /내 계정|보안|인증 앱|2단계|OTP|Authenticator/i.test(a) },
];

type Row = { q: string; l: string; ok: boolean; why: string; ms: number; model: string; tools: number; head: string };
/* 실패 이유 — ask 본문의 error, 없으면 게이트웨이 형식(message·msg·code)까지 · HTTP 상태를 붙임 (v1.3) */
export function failText(status: number, j: any): string {
  const m = String((j && (j.error || j.message || j.msg || j.error_description || j.code)) || '').slice(0, 120);
  return (status && status !== 200 ? 'HTTP ' + status + ' · ' : '') + (m || '응답 본문 없음');
}
/* 고치는 방법 한 줄 — 흔한 원인별 */
export function fixHint(why: string): string {
  if (/^기대값 못 읽음/.test(why)) return '→ 기대값 함수(SQL 94 ai_check_expect) 확인 — 배포·운영 › SQL 에서 select ai_check_expect()';
  if (/conflicting api keys/i.test(why)) return '→ aicheck 를 v1.5 이상으로 다시 배포 (ask 를 부를 때 apikey·Authorization 을 같은 서비스 키로 보냄 — Supabase 새 API 키에서 서로 다르면 거부)';
  if (/OPENROUTER_API_KEY|크레딧|사용 한도/.test(why)) return '→ Supabase › Edge Functions › Secrets 의 AI 키(OPENROUTER_API_KEY) 확인 — Secret 을 바꿨으면 ask 를 한 번 더 배포해야 반영됩니다';
  if (/401/.test(why) && /jwt/i.test(why)) return '→ 해결: 포탈 배포·운영 › Edge Function › 목록 불러오기 › ask › «Verify JWT» 체크 해제 › 설정만 저장 (ask 는 함수 안에서 토큰을 직접 확인합니다)';
  if (/401|403/.test(why)) return '→ ask 가 서비스 키를 거부 — ask 를 최신(v3.4)으로 다시 배포했는지, Verify JWT 가 꺼져 있는지 확인';
  if (/404/.test(why)) return '→ ask 함수를 찾지 못함 — 함수 이름(ask)과 배포 상태 확인';
  if (/ANTHROPIC_API_KEY/.test(why)) return '→ Supabase › Edge Functions › Secrets 에 ANTHROPIC_API_KEY 확인';
  if (/5\d\d|546|WORKER|BOOT/i.test(why)) return '→ ask 함수 실행 오류 — Supabase › Edge Functions › ask › Logs 에서 03:00 무렵 기록 확인';
  if (/abort|timed? ?out|시간/i.test(why)) return '→ ask 응답이 너무 느림 — 잠시 뒤 수동 점검(배포·운영 › 기록 › 15문 점검)으로 다시 확인';
  if (/기대값 없음|빈 답|답 미완성/.test(why)) return '→ AI 답이 기대값과 다름 — 포탈 › 배포·운영 › 기록 › 15문 점검으로 같은 질문 확인';
  return '→ Supabase › Edge Functions › ask › Logs 확인';
}
/* 질문 전에 ask 가 받는지 한 번 (ping — 모델 호출 없음) */
/* ask 호출 헤더 — apikey·Authorization 둘 다 서비스 키(같은 키) · 예전처럼 apikey 에 공개 키를 넣으면 새 키 체계에서 «Conflicting API keys» 401 (v1.5) */
export const askHdr = () => ({ 'Content-Type': 'application/json', apikey: SB_SVC, Authorization: 'Bearer ' + SB_SVC });
export async function askPing(): Promise<{ ok: boolean; why: string }> {
  try {
    const r = await fetchT(SB_URL + '/functions/v1/ask', { method: 'POST', headers: askHdr(), body: JSON.stringify({ mode: 'ping' }) }, 20000);
    const j = await r.json().catch(() => ({}));
    if (r.ok && j && j.ok) return { ok: true, why: '' };
    return { ok: false, why: failText(r.status, j) };
  } catch (e) { return { ok: false, why: String((e as Error).message || e).slice(0, 120) }; }
}
async function askOne(q: string): Promise<{ r: any; ms: number }> {
  const t0 = Date.now();
  try {
    const r = await fetchT(SB_URL + '/functions/v1/ask', { method: 'POST', headers: askHdr(), body: JSON.stringify({ mode: 'chat', question: q, history: [] }) }, 75000);
    const j = await r.json().catch(() => ({ ok: false, error: 'HTTP ' + r.status }));
    if (!r.ok && j) { j.ok = false; j.error = failText(r.status, j); }
    else if (j && !j.ok && !j.error) j.error = failText(r.status, j);
    return { r: j, ms: Date.now() - t0 };
  } catch (e) { return { r: { ok: false, error: String((e as Error).message || e).slice(0, 120) }, ms: Date.now() - t0 }; }
}
/* ── 슬랙 한 줄 (v1.4 · 성공/실패만) ── */
export function slackLine(ok: boolean): string {
  if (ok) return '✅ 포탈 야간 점검 성공';
  return '❌ 포탈 야간 점검 실패 — ' + (PORTAL_URL ? `<${PORTAL_URL}#ops|포탈 › 배포·운영 › 기록>에서 확인` : '포탈 › 배포·운영 › 기록에서 확인');
}
export async function notify(ok: boolean): Promise<unknown> {
  const mode = notifyMode();
  if (!SLACK_TOKEN || mode === 'off' || (mode === 'fail' && ok)) return null;
  try {
    const r = await fetchT('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: 'Bearer ' + SLACK_TOKEN }, body: JSON.stringify({ channel: slackCh(), text: slackLine(ok), unfurl_links: false, unfurl_media: false }) }, 10000);
    const j = await r.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    if (!j || !j.ok) console.warn('[aicheck] 슬랙 전송 실패', slackCh(), j && j.error, j && j.error === 'not_in_channel' ? '— 채널에서 /invite @봇 필요' : '');
    return j;
  } catch (e) { console.warn('[aicheck] 슬랙 전송 실패', String((e as Error).message || e)); return { ok: false, error: String((e as Error).message || e) }; }
}
/* 실패 이유 한 줄(로그·응답용 — 슬랙에는 안 씀) */
export function failReason(res: { pass: number; total: number; blocked?: string; rows: { ok: boolean; why: string }[] }, expectErr: string): string {
  if (res.blocked) return 'ask 호출 실패 — ' + res.blocked;
  const parts: string[] = [];
  if (res.total && res.pass / res.total < MIN_PASS) {
    const whys: Record<string, number> = {}; res.rows.filter((r) => !r.ok).forEach((r) => { whys[r.why] = (whys[r.why] || 0) + 1; });
    parts.push(`AI ${res.pass}/${res.total} 통과(기준 ${Math.round(MIN_PASS * 100)}%) · ` + Object.keys(whys).sort((x, y) => whys[y] - whys[x]).slice(0, 3).map((w) => `${w}${whys[w] > 1 ? ' ×' + whys[w] : ''}`).join(' / '));
  }
  if (expectErr) parts.push('기대값 못 읽음 — ' + expectErr);
  return parts.join(' · ');
}
export async function runCheck(expect: Expect, qs: Q[] = QS, conc = CONC): Promise<{ rows: Row[]; pass: number; total: number; avg_ms: number; model: string; blocked?: string }> {
  const rows: Row[] = new Array(qs.length);
  const pg = await askPing();
  if (!pg.ok) {
    const why = '오류: ask 호출 실패 — ' + pg.why;
    qs.forEach((x, k) => { rows[k] = { q: x.q, l: x.l, ok: false, why, ms: 0, model: '', tools: 0, head: '' }; });
    return { rows, pass: 0, total: rows.length, avg_ms: 0, model: '', blocked: pg.why };
  }
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
  const summary = { ok: true, dry, source: actor === 'cron' ? 'cron' : 'manual', actor, pass: res.pass, total: res.total, rate: Math.round(rate * 100) / 100, avg_ms: res.avg_ms, model: res.model, blocked: res.blocked || undefined, expect_err: expectErr || undefined, expect, fails, rows: res.rows, ms: Date.now() - t0 };

  const reason = failReason(res, expectErr), passed = !reason;
  const hint = reason ? fixHint(reason) : '';
  // 포탈 «AI 점검 추이»는 실패 칸에 fails[].q 를 보여 줌 → 점검을 못 한 날은 질문 12개 대신 «왜 못 했는지 + 해결» 한 칸 (v1.4 · 포탈 수정 없이)
  const logFails = res.blocked ? [{ q: `⛔ 점검 못 함 — ${reason} ${hint}`.trim(), why: reason, head: '' }]
    : expectErr ? [{ q: `⛔ 기대값 못 읽음 — ${expectErr}`, why: '기대값 못 읽음', head: '' }, ...fails] : fails;
  let logged = false, slack: unknown = null;
  if (!dry) {
    try {
      const r = await fetchT(SB_URL + '/rest/v1/ai_check_log', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_SVC, Authorization: 'Bearer ' + SB_SVC, Prefer: 'return=minimal' },
        body: JSON.stringify({ source: 'cron', app_ver: null, pass: res.pass, total: res.total, avg_ms: res.avg_ms, model: res.model, fails: logFails, rows: res.rows.map((r) => ({ q: r.q, ok: r.ok, why: r.why, ms: r.ms, tools: r.tools })), actor }) }, 10000);
      logged = r.ok;
    } catch { /* 표 없음(SQL 94 전) 등 — 결과는 응답으로 돌려줌 */ }
    if (!passed) console.warn('[aicheck] 점검 실패', reason, hint);
    slack = await notify(passed);
  }
  return { ...summary, passed, reason: reason || undefined, hint: hint || undefined, logged, slack };
  };
  // 점검 자체가 죽어도(예상 못 한 예외) 슬랙 «실패» 한 줄 — 조용히 사라지지 않게
  const safe = () => work().catch(async (e) => { console.error('[aicheck] 실패', e); if (!dry) await notify(false); return { ok: false, dry, passed: false, error: String((e as Error).message || e).slice(0, 200) }; });
  // 크론(Supabase Cron · pg_net)은 응답을 몇 초만 기다리므로, 서비스 키/AICHECK_KEY 로 온 호출은 바로 202 를 돌려주고 뒤에서 끝까지 실행(EdgeRuntime.waitUntil).
  // 결과는 ai_check_log · 포탈 배포·운영 › 기록 › AI 점검 추이. {wait:true} 면 끝날 때까지 기다려 결과를 돌려줌(수동 확인용).
  const rt = (globalThis as any).EdgeRuntime;
  if (!dry && body.wait !== true && actor === 'cron' && rt && typeof rt.waitUntil === 'function') {
    rt.waitUntil(safe());
    return json({ ok: true, accepted: true, background: true, note: '점검을 뒤에서 실행합니다 — 1~2분 뒤 ai_check_log / 포탈 배포·운영 › 기록 › AI 점검 추이에서 확인' }, 202);
  }
  const out = await safe();
  return json(out, out.ok === false ? 500 : 200);
});
