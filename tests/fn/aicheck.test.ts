// aicheck Edge Function 테스트 — deno run -A tests/fn/aicheck.test.ts
//   ask · ai_check_expect · ai_check_log · Auth · Slack 전부 가짜. 인증 · 기대값 비교 · 동시 실행 · 기록 · 통과율 미달 슬랙 · dry 를 확인.
import { installFetch, loadFn, call, ok, report, J, calls } from './_mock.ts';

const EXPECT = { month: '2026-10', due_n: 3, next_n: 2, lapsed_n: 0, live_customers: 357, live_products: 362, month_revenue: 71295828, assets_rented: 48, oi_open: 11 };
let role = 'super_admin', mode: 'good' | 'bad' | 'error' = 'good', expectFail = false;
const logs: any[] = [], slack: any[] = []; let askN = 0, inflight = 0, maxInflight = 0;
let errRows: any[] = [], opsRows: any[] = [];   // v1.2 야간 운영 요약용 가짜 표
const GOOD: Record<string, string> = {
  '이번 달 MRR 얼마야?': '이번 달 MRR 은 71,296천원(약 0.7억) 입니다.',
  'LIVE 고객사 몇 곳이야?': '2026-10 기준 LIVE 고객사는 357곳(제품별 합 362)입니다.',
  '서비스별 MRR 알려줘': 'Cloud NAC 40,000천원 · MDR 20,000천원 · S1 11,296천원',
  '만기 지났는데 미처리인 계약 몇 건이야?': '만기 지났는데 미처리인 계약은 없습니다.',
  '이번 달 만기 계약 몇 건이야?': '이번 달 만기는 3건입니다.',
  '다음 달 만기 계약 몇 건이야?': '다음 달 만기는 2건입니다.',
  '지금 임대중인 장비가 몇 대야?': '임대중 장비는 48대입니다.',
  'OI 파이프라인 어때?': '진행 중 11건, 비가중 3.2억 · 가중 기대 1.1억 원',
  '연도별 매출 추이 알려줘': '2024년 6.1억 → 2025년 7.4억 → 2026년(누적) 6.8억',
  '에스원 채널 MRR 은 얼마야?': '에스원 채널 MRR 은 11,296천원',
  'MRR 성장률이 어때?': '전월 대비 +1.2%, 전년 대비 +8.4%',
  '포탈에서 2단계 인증은 어떻게 켜?': '내 계정 › 보안 › 2단계 인증 켜기에서 인증 앱으로 QR 을 스캔하세요.',
};
installFetch(async (url, method, body, init) => {
  const auth = String((init?.headers as Record<string, string>)?.Authorization || '');
  if (url.includes('/auth/v1/user')) return J({ id: 'u1', email: 'tester@example.com' });
  if (url.includes('/rest/v1/user_roles')) return J([{ role }]);
  if (url.includes('/rpc/ai_check_expect')) { if (!auth.includes('svc')) return J({ message: 'denied' }, 401); return expectFail ? J({ message: 'function not found' }, 404) : J(EXPECT); }
  if (url.includes('/rest/v1/ai_check_log')) { logs.push(JSON.parse(body || '{}')); return new Response('', { status: 201 }); }
  if (url.includes('/functions/v1/ask')) {
    askN++; inflight++; maxInflight = Math.max(maxInflight, inflight); await new Promise((r) => setTimeout(r, 60)); inflight--;
    if (!auth.includes('Bearer svc')) return J({ ok: false, error: '인증 필요' }, 401);
    const q = JSON.parse(body || '{}').question as string;
    if (mode === 'error') return J({ ok: false, error: 'ANTHROPIC 500' }, 500);
    if (mode === 'bad') return J({ ok: true, text: q.includes('2단계') ? '내 계정 › 보안에서' : '자료가 없습니다.', model: 'claude-sonnet-5', queries: [] });
    return J({ ok: true, text: GOOD[q] || '네.', model: 'claude-sonnet-5', queries: [{ tool: 'run_sql', ms: 300 }] });
  }
  if (url.includes('slack.com')) { slack.push(JSON.parse(body || '{}')); return J({ ok: true, ts: '1' }); }
  if (url.includes('/rest/v1/client_errors')) return /at=gte\./.test(url) && auth.includes('svc') ? J(errRows) : J({ message: 'bad' }, 400);
  if (url.includes('/rest/v1/ops_log')) return /ok=is\.false/.test(url) && auth.includes('svc') ? J(opsRows) : J({ message: 'bad' }, 400);
  return undefined;
});
Deno.env.set('SUPABASE_URL', 'https://mock.supabase.co'); Deno.env.set('SUPABASE_ANON_KEY', 'anon'); Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'svc');
Deno.env.set('AICHECK_KEY', 'cronkey-test'); Deno.env.set('SLACK_BOT_TOKEN', 'xoxb-test'); Deno.env.set('PORTAL_URL', 'https://example.github.io/svc/index.html');
await loadFn('aicheck');

console.log('aicheck 함수');
{ const r = await call({}, { token: null }); ok(r.status === 401, '토큰 없음 → 401', r.status); }
role = 'admin'; { const r = await call({ dry: true }); ok(r.status === 403, 'admin 역할 → 403', r.j?.error); } role = 'super_admin';
{ askN = 0; maxInflight = 0; logs.length = 0; slack.length = 0; const r = await call({ dry: true });
  ok(r.status === 200 && r.j.ok && r.j.dry === true, 'super 사용자 · dry 실행', { pass: r.j.pass, total: r.j.total });
  ok(r.j.pass === r.j.total && r.j.total === 12, '좋은 답 → 12/12 통과', r.j.fails);
  ok(askN === 12 && maxInflight >= 2 && maxInflight <= 3, 'ask 12회 · 동시 2~3개', { askN, maxInflight });
  ok(r.j.model === 'sonnet-5' && r.j.avg_ms > 0 && r.j.expect && r.j.expect.live_customers === 357, '모델·평균 시간·기대값 포함');
  ok(logs.length === 0 && slack.length === 0, 'dry 면 기록·슬랙 없음'); }
{ logs.length = 0; slack.length = 0; const r = await call({}, { token: 'cronkey-test' });
  ok(r.status === 200 && r.j.source === 'cron' && r.j.logged === true, 'AICHECK_KEY → 크론 경로 · ai_check_log 기록', { logged: r.j.logged, source: r.j.source });
  ok(logs.length === 1 && logs[0].source === 'cron' && logs[0].pass === 12 && logs[0].total === 12 && Array.isArray(logs[0].rows) && logs[0].rows.length === 12, 'ai_check_log 본문', logs[0] && { pass: logs[0].pass, total: logs[0].total, rows: logs[0].rows?.length });
  ok(slack.length === 0, '통과율 100% → 슬랙 없음'); }
{ mode = 'bad'; logs.length = 0; slack.length = 0; const r = await call({}, { token: 'svc' });
  ok(r.j.ok && r.j.pass <= 2 && r.j.fails.length >= 10 && r.j.fails.every((f: any) => /기대값 없음/.test(f.why)), '나쁜 답 → 기대값 없음으로 실패', { pass: r.j.pass, why: r.j.fails[0]?.why });
  ok(slack.length === 1 && /통과/.test(slack[0].text) && /기준 70%/.test(slack[0].text) && /example\.github\.io/.test(slack[0].text) && slack[0].channel === 'C08RA3PPDH8', '통과율 미달 → 슬랙(기본 채널 · 포탈 링크)', slack[0] && slack[0].text.slice(0, 80));
  ok(logs.length === 1 && logs[0].fails.length >= 10, '실패 목록이 기록에'); mode = 'good'; }
{ mode = 'error'; logs.length = 0; slack.length = 0; const r = await call({ dry: true });
  ok(r.j.ok && r.j.pass === 0 && r.j.fails.every((f: any) => /^오류/.test(f.why)), 'ask 오류 → 전부 «오류: …» 로 실패(함수 자체는 ok)', r.j.fails[0]?.why); mode = 'good'; }
{ expectFail = true; const r = await call({ dry: true });
  ok(r.j.ok && /ai_check_expect 404/.test(r.j.expect_err) && r.j.pass >= 11, '기대값 RPC 없음(SQL 94 전) → expect_err 표시 · 숫자 비교는 통과 처리', { err: r.j.expect_err, pass: r.j.pass }); expectFail = false; }
{ const bgs: Promise<unknown>[] = []; (globalThis as any).EdgeRuntime = { waitUntil: (p: Promise<unknown>) => bgs.push(p) };
  logs.length = 0; askN = 0; const r = await call({}, { token: 'cronkey-test' });
  ok(r.status === 202 && r.j.accepted && r.j.background && logs.length === 0, '크론 호출 → 바로 202(뒤에서 실행)', r.j);
  await Promise.all(bgs); ok(logs.length === 1 && logs[0].source === 'cron' && askN === 12, '뒤에서 끝까지 실행 → ai_check_log 기록', { logs: logs.length, askN });
  logs.length = 0; const w = await call({ wait: true }, { token: 'cronkey-test' }); ok(w.status === 200 && w.j.pass === 12 && w.j.logged === true, '{wait:true} → 끝까지 기다려 결과');
  const d = await call({ dry: true }); ok(d.status === 200 && d.j.dry === true && d.j.total === 12, '사용자(super) dry 는 기다려 결과(백그라운드 아님)');
  delete (globalThis as any).EdgeRuntime; }
{ errRows = [{ email: 'a@x.kr', msg: 'TypeError: x is undefined', n: 2, staging: false }, { email: 'b@x.kr', msg: 'TypeError: x is undefined', n: 1, staging: true }];
  opsRows = [{ action: 'gh_put', target: 'index.html', error: 'GitHub 422' }]; slack.length = 0; logs.length = 0;
  const r = await call({ wait: true }, { token: 'cronkey-test' });
  ok(r.j.pass === 12 && r.j.digest && r.j.digest.errors === 3 && r.j.digest.users === 2 && r.j.digest.opsFails === 1, '야간 요약: 오류 3건(2명) · 배포 실패 1건 집계', r.j.digest);
  ok(slack.length === 1 && /AI 12\/12 통과 ✓/.test(slack[0].text) && /브라우저 오류 3건\(2명 · 스테이징 1\)/.test(slack[0].text) && /배포·운영 실패 1건/.test(slack[0].text) && /TypeError/.test(slack[0].text) && /GitHub 422/.test(slack[0].text), 'AI 는 정상이어도 오류·실패가 있으면 슬랙 한 통', slack[0]?.text);
  errRows = []; opsRows = []; slack.length = 0; await call({ wait: true }, { token: 'cronkey-test' }); ok(slack.length === 0, '오류·실패 0 · AI 정상 → 슬랙 없음'); }
{ const m = await import(new URL('../../supabase/functions/aicheck/index.ts', import.meta.url).href);
  ok(m.hasNum('이번 달(2026-10) MRR은 약 9,956만원(99,557,735원)이고', 99557735) && m.hasNum('99,557,735원', 99557735) && m.hasNum('약 9955만원', 99557735), '만원·원 표기 인정(㊿+147)');
  ok(!m.hasNum('약 8,000만원', 99557735) && !m.hasNum('자료가 없습니다', 99557735), '다른 금액·숫자 없음은 불인정'); }
ok(!calls.some((c) => c.body && /xoxb-test|cronkey-test/.test(c.body)), '슬랙 토큰·크론 키가 요청 본문에 새지 않음');
report('aicheck');
