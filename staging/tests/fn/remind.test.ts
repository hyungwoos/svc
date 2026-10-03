// remind Edge Function 테스트 — deno run -A tests/fn/remind.test.ts
//   renew_watch · Auth · Slack 전부 가짜(가상 고객명). 인증(super 만 · 서비스 키) · dry · only 구역 · 슬랙 본문 · remind_log · not_in_channel 안내를 확인.
import { installFetch, loadFn, call, ok, report, J, calls } from './_mock.ts';

const ROWS = [
  { kind: 'due', contract_id: 1, customer: '가상고객01', line: 'Cloud', channel: '일반', partner: '파트너A', csm: null, s1_no: null, start_month: '2023-11-01', end_month: '2026-10-01', term_months: 36, mrr: 117500, renew_count: 0, status: '신규', note: null },
  { kind: 'next', contract_id: 2, customer: '가상고객02', line: 'S1', channel: '에스원', partner: null, csm: null, s1_no: 'N0000001', start_month: '2023-12-01', end_month: '2026-11-01', term_months: 36, mrr: 100000, renew_count: 1, status: '신규', note: null },
  { kind: 'lapsed', contract_id: 3, customer: '가상고객03', line: 'Cloud', channel: '일반', partner: '직접(계산서)', csm: null, s1_no: null, start_month: '2024-09-01', end_month: '2026-08-01', term_months: 24, mrr: 150000, renew_count: 0, status: '신규', note: null },
];
let role = 'super_admin', slackFail = false;
const logs: any[] = [], slack: any[] = [];
installFetch((url, method, body, init) => {
  const auth = String((init?.headers as Record<string, string>)?.Authorization || (init?.headers as Record<string, string>)?.authorization || '');
  if (url.includes('/auth/v1/admin/users')) return new Response(auth.includes('sb_secret_abc') ? '[]' : '{"msg":"no"}', { status: auth.includes('sb_secret_abc') ? 200 : 401 });
  if (url.includes('/auth/v1/user')) return /Bearer sb_secret_/.test(auth) ? J({ msg: 'invalid JWT' }, 401) : J({ id: 'u1', email: 'tester@example.com' });   // 실제 GoTrue 는 비밀 키를 사용자 토큰으로 받지 않음
  if (url.includes('/rest/v1/user_roles')) return J([{ role }]);
  if (url.includes('/rpc/renew_watch')) return J(ROWS);
  if (url.includes('/rest/v1/remind_log')) { logs.push(JSON.parse(body || '{}')); return new Response('', { status: 201 }); }
  if (url.includes('slack.com')) { slack.push(JSON.parse(body || '{}')); return J(slackFail ? { ok: false, error: 'not_in_channel' } : { ok: true, ts: '1.2' }); }
  return undefined;
});
Deno.env.set('SUPABASE_URL', 'https://mock.supabase.co'); Deno.env.set('SUPABASE_ANON_KEY', 'anon'); Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'svc'); Deno.env.set('SLACK_BOT_TOKEN', 'xoxb-test');
await loadFn('remind');
const text = (m: any) => JSON.stringify(m.blocks || m);

console.log('remind 함수');
{ const r = await call({}, { token: null }); ok(r.status === 401, '토큰 없음 → 401', r.status); }
role = 'admin'; { const r = await call({ dry: true }); ok(r.status === 403, 'admin 역할 → 403', r.j?.error); } role = 'super_admin';
{ slack.length = 0; const r = await call({ dry: true, month: '2026-10-01' }); ok(r.status === 200 && r.j.ok && r.j.dry === true && slack.length === 0, 'dry: 슬랙 보내지 않음 · 건수 반환', { counts: r.j.counts ?? r.j.n ?? Object.keys(r.j) }); }
{ slack.length = 0; logs.length = 0; const r = await call({ month: '2026-10-01', portal_url: 'https://example.github.io/svc/index.html' });
  ok(r.j.ok && slack.length === 1, '전체 발송: 슬랙 1회', slack.length);
  const t = text(slack[0]); ok(/가상고객01/.test(t) && /가상고객02/.test(t) && /가상고객03/.test(t), '세 구역(이달·다음 달·미처리) 모두 포함');
  ok(/example\.github\.io\/svc\/index\.html/.test(t), 'portal_url 이 메시지 링크에 반영');
  ok(/N0000001/.test(t) && /117[,.]?5|117,500|118/.test(t), '행에 s1_no · 월액 표기');
  ok(logs.length === 1 && logs[0].kind === 'monthly' && logs[0].ok !== false, 'remind_log kind=monthly', logs[0] && { kind: logs[0].kind, ok: logs[0].ok }); }
{ slack.length = 0; logs.length = 0; const r = await call({ month: '2026-10-01', only: 'lapsed' });
  const t = text(slack[0] || {}); ok(r.j.ok && /가상고객03/.test(t) && !/가상고객01/.test(t) && !/가상고객02/.test(t), 'only=lapsed: 미처리 구역만');
  ok(/미처리/.test(t), '헤더가 구역 문구'); ok(logs[0]?.kind === 'lapsed', 'remind_log kind=lapsed', logs[0]?.kind); }
{ slack.length = 0; const r = await call({ month: '2026-10-01', only: ['due', 'next'] });
  const t = text(slack[0] || {}); ok(r.j.ok && /가상고객01/.test(t) && /가상고객02/.test(t) && !/가상고객03/.test(t), 'only=[due,next]: 이달·다음 달만'); }
{ slack.length = 0; const r = await call({ dry: true }, { token: 'sb_secret_abc' }); ok(r.status === 200 && r.j.ok, '서비스 키(sb_secret_) 토큰 → 크론 경로 통과', r.j?.error); }
{ const r = await call({ dry: true }, { token: 'sb_secret_wrong' }); ok(r.status === 401, '잘못된 sb_secret_ → 서비스 키 아님 → 사용자 토큰 검사 → 401', r.status); }
{ slackFail = true; logs.length = 0; const r = await call({ month: '2026-10-01' }); ok(!r.j.ok && /not_in_channel|초대/.test(String(r.j.error)), 'not_in_channel → 봇 초대 안내', r.j.error); ok(logs.length === 1 && logs[0].ok === false, '실패도 remind_log 에 기록'); slackFail = false; }
ok(!calls.some((c) => c.body && /xoxb-test/.test(c.body) && !c.url.includes('slack.com')), '슬랙 토큰이 슬랙 외 요청 본문에 새지 않음');
report('remind');
