// aicheck Edge Function 테스트 — deno run -A tests/fn/aicheck.test.ts
//   ask · ai_check_expect · ai_check_log · Auth · Slack 전부 가짜. 인증 · 기대값 비교 · 동시 실행 · 기록 · 슬랙 한 줄(성공/실패 · v1.4) · dry 를 확인.
import { installFetch, loadFn, call, ok, report, J, calls } from './_mock.ts';

const EXPECT = { month: '2026-10', due_n: 3, next_n: 2, lapsed_n: 0, live_customers: 357, live_products: 362, month_revenue: 71295828, assets_rented: 48, oi_open: 11 };
let gwConflict = 0;
let role = 'super_admin', mode: 'good' | 'bad' | 'error' | 'gw401' | 'nobody' = 'good', expectFail = false;
const logs: any[] = [], slack: any[] = []; let askN = 0, inflight = 0, maxInflight = 0;
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
    // v1.5: Supabase 새 API 키 게이트웨이 흉내 — apikey 와 Authorization 의 키가 다르면 401 «Conflicting API keys» (2026-10 실제 야간 실패)
    const apikey = String((init?.headers as Record<string, string>)?.apikey || '');
    if (apikey !== auth.replace(/^Bearer\s+/i, '')) { gwConflict++; return J({ message: 'Conflicting API keys' }, 401); }
    // v1.3: 질문 전 ping — 게이트웨이가 막는 경우(JWT 검사 ON + 서비스 키 거부)·본문 없는 오류 흉내
    if (mode === 'gw401') return J({ code: 401, message: 'Invalid JWT' }, 401);
    if (mode === 'nobody') return J({}, 503);
    if (JSON.parse(body || '{}').mode === 'ping') return auth.includes('Bearer svc') ? J({ ok: true, version: 'v3.3' }) : J({ ok: false, error: '로그인이 필요합니다' }, 401);
    askN++; inflight++; maxInflight = Math.max(maxInflight, inflight); await new Promise((r) => setTimeout(r, 60)); inflight--;
    if (!auth.includes('Bearer svc')) return J({ ok: false, error: '인증 필요' }, 401);
    const q = JSON.parse(body || '{}').question as string;
    if (mode === 'error') return J({ ok: false, error: 'ANTHROPIC 500' }, 500);
    if (mode === 'bad') return J({ ok: true, text: q.includes('2단계') ? '내 계정 › 보안에서' : '자료가 없습니다.', model: 'claude-sonnet-5', queries: [] });
    return J({ ok: true, text: GOOD[q] || '네.', model: 'claude-sonnet-5', queries: [{ tool: 'run_sql', ms: 300 }] });
  }
  if (url.includes('slack.com')) { slack.push(JSON.parse(body || '{}')); return J({ ok: true, ts: '1' }); }
  return undefined;
});
Deno.env.set('SUPABASE_URL', 'https://mock.supabase.co'); Deno.env.set('SUPABASE_ANON_KEY', 'anon'); Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'svc');
Deno.env.set('AICHECK_KEY', 'cronkey-test'); Deno.env.set('SLACK_BOT_TOKEN', 'xoxb-test'); Deno.env.set('PORTAL_URL', 'https://example.github.io/svc/index.html');
Deno.env.set('SLACK_CHANNEL', 'C08RA3PPDH8');   // remind 용 팀 채널 — aicheck 는 따르지 않아야 함
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
  ok(slack.length === 1 && slack[0].text === '✅ 포탈 야간 점검 성공' && slack[0].channel === 'C0BQR2JCU3Z', 'v1.4 성공 → «✅ 포탈 야간 점검 성공» 한 줄 · C0BQR2JCU3Z(remind 의 SLACK_CHANNEL 무시)', slack[0]);
  ok(slack[0].unfurl_links === false && slack[0].unfurl_media === false && r.j.passed === true && !r.j.reason, '링크 미리보기 끔 · passed true'); }
{ mode = 'bad'; logs.length = 0; slack.length = 0; const r = await call({}, { token: 'svc' });
  ok(r.j.ok && r.j.pass <= 2 && r.j.fails.length >= 10 && r.j.fails.every((f: any) => /기대값 없음/.test(f.why)), '나쁜 답 → 기대값 없음으로 실패', { pass: r.j.pass, why: r.j.fails[0]?.why });
  ok(slack.length === 1 && /^❌ 포탈 야간 점검 실패 — <https:\/\/example\.github\.io\/svc\/index\.html#ops\|포탈 › 배포·운영 › 기록>에서 확인$/.test(slack[0].text) && slack[0].channel === 'C0BQR2JCU3Z', '통과율 미달 → «❌ … 실패» 한 줄 + 포탈 기록 링크', slack[0]?.text);
  ok(!/\n/.test(slack[0].text) && !/MRR|기대값|통과|기준/.test(slack[0].text), '슬랙에 질문·이유 같은 상세 없음');
  ok(r.j.passed === false && /AI \d+\/12 통과\(기준 70%\) · 기대값 없음/.test(r.j.reason) && /15문 점검/.test(r.j.hint), '이유·고치는 방법은 응답(reason/hint)에', { reason: r.j.reason, hint: r.j.hint });
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
{ mode = 'gw401'; slack.length = 0; logs.length = 0; askN = 0;
  const r = await call({ wait: true }, { token: 'cronkey-test' });
  ok(r.j.pass === 0 && r.j.blocked && /HTTP 401 · Invalid JWT/.test(r.j.blocked) && askN === 0 && r.j.fails.every((f: any) => /ask 호출 실패 — HTTP 401 · Invalid JWT/.test(f.why)), 'v1.3 ping 막힘(게이트웨이 401 Invalid JWT) → 질문 안 보냄 · 이유가 그대로', { blocked: r.j.blocked, askN });
  ok(slack.length === 1 && /^❌ 포탈 야간 점검 실패/.test(slack[0].text) && !/Verify JWT|401/.test(slack[0].text), '슬랙: 막혀도 «실패» 한 줄만', slack[0]?.text);
  ok(/^ask 호출 실패 — HTTP 401 · Invalid JWT$/.test(r.j.reason) && /Verify JWT/.test(r.j.hint), '이유·해결(Verify JWT 끄기)은 응답에', { reason: r.j.reason, hint: r.j.hint });
  ok(logs.length === 1 && logs[0].pass === 0 && /Invalid JWT/.test(logs[0].fails[0].why) && logs[0].fails.length === 1 && /^⛔ 점검 못 함 — ask 호출 실패 — HTTP 401 · Invalid JWT → 해결: .*Verify JWT/.test(logs[0].fails[0].q), 'ai_check_log: 포탈 «실패 질문» 칸에 이유+해결 한 칸', logs[0]?.fails);
  mode = 'nobody'; slack.length = 0; const r2 = await call({ wait: true }, { token: 'cronkey-test' });
  ok(/HTTP 503/.test(r2.j.blocked || '') && !/응답 없음/.test(JSON.stringify(r2.j.fails)), '본문 없는 오류도 «응답 없음» 대신 HTTP 상태', r2.j.blocked);
  mode = 'good'; }
{ expectFail = true; slack.length = 0; const r = await call({ wait: true }, { token: 'cronkey-test' });
  ok(r.j.pass >= 11 && r.j.passed === false && /기대값 못 읽음/.test(r.j.reason) && /SQL 94/.test(r.j.hint) && slack.length === 1 && /^❌/.test(slack[0].text), '기대값을 못 읽으면 통과해도 실패(숫자 확인을 못 했으므로)', { reason: r.j.reason }); expectFail = false; }
{ Deno.env.set('AICHECK_NOTIFY', 'fail'); slack.length = 0;
  await call({ wait: true }, { token: 'cronkey-test' }); ok(slack.length === 0, 'AICHECK_NOTIFY=fail → 성공이면 알림 없음');
  mode = 'bad'; await call({ wait: true }, { token: 'cronkey-test' }); ok(slack.length === 1 && /^❌/.test(slack[0].text), 'AICHECK_NOTIFY=fail → 실패는 알림'); mode = 'good';
  Deno.env.set('AICHECK_NOTIFY', 'off'); slack.length = 0; mode = 'bad'; await call({ wait: true }, { token: 'cronkey-test' }); ok(slack.length === 0, 'AICHECK_NOTIFY=off → 알림 없음'); mode = 'good';
  Deno.env.delete('AICHECK_NOTIFY'); Deno.env.set('AICHECK_SLACK_CHANNEL', 'C0TESTCH'); slack.length = 0;
  await call({ wait: true }, { token: 'cronkey-test' }); ok(slack.length === 1 && slack[0].channel === 'C0TESTCH', 'AICHECK_SLACK_CHANNEL 로만 채널 변경', slack[0]?.channel);
  Deno.env.delete('AICHECK_SLACK_CHANNEL'); }
{ const m = await import(new URL('../../supabase/functions/aicheck/index.ts', import.meta.url).href);
  ok(m.DEFAULT_CH === 'C0BQR2JCU3Z' && m.slackLine(true) === '✅ 포탈 야간 점검 성공' && /^❌ 포탈 야간 점검 실패/.test(m.slackLine(false)), 'slackLine 두 가지');
  ok(m.opsDigest === undefined && m.digestText === undefined, 'v1.2 상세 요약 함수 제거'); }
{ const m = await import(new URL('../../supabase/functions/aicheck/index.ts', import.meta.url).href);
  ok(m.hasNum('이번 달(2026-10) MRR은 약 9,956만원(99,557,735원)이고', 99557735) && m.hasNum('99,557,735원', 99557735) && m.hasNum('약 9955만원', 99557735), '만원·원 표기 인정(㊿+147)');
  ok(!m.hasNum('약 8,000만원', 99557735) && !m.hasNum('자료가 없습니다', 99557735), '다른 금액·숫자 없음은 불인정'); }
ok(!calls.some((c) => c.body && /xoxb-test|cronkey-test/.test(c.body)), '슬랙 토큰·크론 키가 요청 본문에 새지 않음');
// v1.5 — ask 를 부를 때 apikey·Authorization 이 같은 서비스 키 (새 키 체계 게이트웨이 «Conflicting API keys» 401 방지) · 안내 문구
{ gwConflict = 0; const r = await call({ dry: true }); ok(r.j.ok && r.j.pass === 12 && gwConflict === 0, 'v1.5: ask 호출 헤더가 같은 키 → 게이트웨이 거부 0', { gwConflict, pass: r.j.pass });
  const mod = await import('../../supabase/functions/aicheck/index.ts');
  ok(/v1\.5/.test(mod.fixHint('ask 호출 실패 — HTTP 401 · Conflicting API keys')), 'fixHint: Conflicting API keys → aicheck v1.5 안내', mod.fixHint('ask 호출 실패 — HTTP 401 · Conflicting API keys'));
  ok(/한 번 더 배포/.test(mod.fixHint('ask 호출 실패 — OpenRouter API 키가 거부되었습니다 — Supabase › Edge Functions › Secrets 의 OPENROUTER_API_KEY 값을 확인하세요')), 'fixHint: OpenRouter 키 거부 → Secret 확인 + ask 다시 배포'); }
console.log('채점 규칙 v1.6 (㊿+178)');
{ const M = await import(new URL('../../supabase/functions/aicheck/index.ts', import.meta.url).href);
  ok(!M.hasCount('2026년 3월 만기는 5건입니다', 2) && !M.hasCount('2026-10 기준 7건', 2) && M.hasCount('이달 만기 2건(재약정 1)', 2) && !M.hasCount('3월 만기 5건', 3), '건수: «2026» · «3월» 안의 숫자는 셈하지 않음 · 단위 붙은 숫자와 정확히');
  ok(M.hasCount('LIVE 고객사는 357곳', 357) && M.hasCount('총 48 대', 48) && M.hasCount('미처리 계약은 없습니다', 0) && !M.hasCount('10건', 0), '건수: 곳 · 대 · 0 은 «없음»');
  ok(M.near('MRR 은 71,296천원', 71295828) && M.near('약 7,130만원', 71295828) && M.near('0.71억', 71295828) && !M.near('MRR 은 65,000천원', 71295828) && !M.near('2026년 10월', 71295828), '금액: 천원 · 만원 · 억을 원으로 바꿔 ±1% · 아무 금액이나 통과 안 됨');
  ok(M.near('1억 2,345만원', 123450000) && M.nums('1억 2,345만원').some((x: any) => x.v === 123450000), '금액: «1억 2,345만» 은 한 금액');
  const E = { month: '2026-10', rev_years: { '2024': 610000000, '2025': 740000000, '2026': 680000000 } };
  ok(M.yearsOk(E, '2024년 6.1억 → 2025년 7.4억 → 2026년 6.8억') && !M.yearsOk(E, '2025년 9.9억 · 2026년 6.8억') && !M.yearsOk(E, '2025년이 좋았습니다') && M.yearsOk({ month: '2026-10' }, '2025년'), '연도별: 작년 합 ±2% + 연도 둘 · 기대값 없으면 연도 표기만'); }
report('aicheck');
