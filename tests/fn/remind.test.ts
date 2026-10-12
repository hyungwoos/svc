// remind Edge Function 테스트 — deno run -A tests/fn/remind.test.ts
//   renew_watch · Auth · Slack 전부 가짜(가상 고객명). 인증(super 만 · 서비스 키) · dry · only 구역 · 슬랙 본문 · remind_log · not_in_channel 안내를 확인.
import { installFetch, loadFn, call, ok, report, J, calls } from './_mock.ts';

const ROWS = [
  { kind: 'due', contract_id: 1, customer: '가상고객01', line: 'Cloud', channel: '일반', partner: '파트너A', csm: null, s1_no: null, start_month: '2023-11-01', end_month: '2026-10-01', term_months: 36, mrr: 117500, renew_count: 0, status: '신규', note: null },
  { kind: 'next', contract_id: 2, customer: '가상고객02', line: 'S1', channel: '에스원', partner: null, csm: null, s1_no: 'N0000001', start_month: '2023-12-01', end_month: '2026-11-01', term_months: 36, mrr: 100000, renew_count: 1, status: '신규', note: null },
  { kind: 'lapsed', contract_id: 3, customer: '가상고객03', line: 'Cloud', channel: '일반', partner: '직접(계산서)', csm: null, s1_no: null, start_month: '2024-09-01', end_month: '2026-08-01', term_months: 24, mrr: 150000, renew_count: 0, status: '신규', note: null },
];
let role = 'super_admin', slackFail = false, rate429 = 0, logSlow = false, sitesOn = false, siteRows: any[] = [];   // ㊿+192 site_watch 가짜(SQL 115)
const SROWS = [
  { id: 1, sitename: 'vsite-a', product: 'ztna', edition: 'ent', devices: 100, customer: '가상기관A', requested_by: 'other@example.com', created_at: '2026-07-01T00:00:00Z', purpose: 'paid', due_date: '2026-09-30', site_status: null, status_note: null, contract_id: null, contract_cust: null, contract_status: null, contract_start: null, days: 103, state: 'overdue' },
  { id: 2, sitename: 'vsite-b', product: 'edr', edition: 'ent', devices: 50, customer: '가상기관B', requested_by: 'tester@example.com', created_at: '2026-09-20T00:00:00Z', purpose: null, due_date: null, site_status: null, status_note: null, contract_id: null, contract_cust: null, contract_status: null, contract_start: null, days: 22, state: 'waiting' },
  { id: 3, sitename: 'vsite-c', product: 'ztna', edition: 'ent', devices: 30, customer: '가상기관C', requested_by: 'other@example.com', created_at: '2026-08-01T00:00:00Z', purpose: 'poc', due_date: '2026-10-01', site_status: null, status_note: null, contract_id: null, contract_cust: null, contract_status: null, contract_start: null, days: 72, state: 'poc_over' },
  { id: 4, sitename: 'vsite-d', product: 'ztna', edition: 'ent', devices: 10, customer: '가상기관D', requested_by: 'other@example.com', created_at: '2026-09-01T00:00:00Z', purpose: 'poc', due_date: '2026-12-01', site_status: null, status_note: null, contract_id: null, contract_cust: null, contract_status: null, contract_start: null, days: 41, state: 'poc' },
  { id: 5, sitename: 'vsite-e', product: 'ztna', edition: 'ent', devices: 200, customer: '가상기관E', requested_by: 'other@example.com', created_at: '2026-05-01T00:00:00Z', purpose: 'paid', due_date: null, site_status: null, status_note: null, contract_id: 77, contract_cust: '가상기관E', contract_status: '신규', contract_start: '2026-06-01', days: 164, state: 'linked' },
  { id: 6, sitename: 'vsite-f', product: 'ztna', edition: 'ent', devices: 5, customer: null, requested_by: 'other@example.com', created_at: '2026-01-01T00:00:00Z', purpose: 'internal', due_date: null, site_status: null, status_note: null, contract_id: null, contract_cust: null, contract_status: null, contract_start: null, days: 284, state: 'internal' },
  { id: 7, sitename: 'vsite-g', product: 'ztna', edition: 'ent', devices: 20, customer: '가상기관G', requested_by: 'other@example.com', created_at: '2026-02-01T00:00:00Z', purpose: 'paid', due_date: null, site_status: 'exempt', status_note: '재무 승인 무상', contract_id: null, contract_cust: null, contract_status: null, contract_start: null, days: 253, state: 'exempt' },
  { id: 8, sitename: 'vsite-h', product: 'ztna', edition: 'ent', devices: 40, customer: '가상기관H', requested_by: 'other@example.com', created_at: '2025-01-01T00:00:00Z', purpose: 'paid', due_date: null, site_status: null, status_note: null, contract_id: 78, contract_cust: '가상기관H', contract_status: '해지', contract_start: '2025-02-01', days: 649, state: 'ended' },
];   // ㊿+182 속도 제한 횟수 · 기록이 늦게 끝남
const logs: any[] = [], slack: any[] = [];
installFetch((url, method, body, init) => {
  const auth = String((init?.headers as Record<string, string>)?.Authorization || (init?.headers as Record<string, string>)?.authorization || '');
  if (url.includes('/auth/v1/admin/users')) return new Response(auth.includes('sb_secret_abc') ? '[]' : '{"msg":"no"}', { status: auth.includes('sb_secret_abc') ? 200 : 401 });
  if (url.includes('/auth/v1/user')) return /Bearer sb_secret_/.test(auth) ? J({ msg: 'invalid JWT' }, 401) : J({ id: 'u1', email: 'tester@example.com' });   // 실제 GoTrue 는 비밀 키를 사용자 토큰으로 받지 않음
  if (url.includes('/rest/v1/user_roles')) return J([{ role }]);
  if (url.includes('/rpc/renew_watch')) return J(ROWS);
  if (url.includes('/rpc/site_watch')) return sitesOn ? J(siteRows) : J({ code: 'PGRST202', message: 'Could not find the function' }, 404);
  if (url.includes('/rest/v1/portal_profiles')) return J([{ email: 'other@example.com', name: '홍길동', title: '대리' }]);
  if (url.includes('/rest/v1/remind_log')) { const b = JSON.parse(body || '{}'); if (logSlow) return new Promise((res) => setTimeout(() => { logs.push(b); res(new Response('', { status: 201 })); }, 150)); logs.push(b); return new Response('', { status: 201 }); }
  if (url.includes('slack.com') && rate429 > 0) { rate429--; slack.push(JSON.parse(body || '{}')); return new Response(JSON.stringify({ ok: false, error: 'ratelimited' }), { status: 429, headers: { 'Retry-After': '0' } }); }
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
console.log('㊿+182 속도 제한 · 기록');
rate429 = 1; { slack.length = 0; logs.length = 0; const r = await call({ month: '2026-10-01' }); ok(r.j.ok && slack.length === 2 && logs[0]?.ok === true, '429(Retry-After) → 기다렸다 다시 → 보냄', { n: slack.length, ok: r.j.ok }); } rate429 = 0;
rate429 = 5; { slack.length = 0; logs.length = 0; const r = await call({ month: '2026-10-01' }); ok(!r.j.ok && slack.length === 3 && /ratelimited/.test(r.j.error) && logs[0]?.ok === false, '429 계속 → 2번 다시 · 실패 기록', { n: slack.length, e: r.j.error }); } rate429 = 0;
logSlow = true; { logs.length = 0; const r = await call({ month: '2026-10-01' }); ok(r.j.ok && logs.length === 1, 'remind_log 기록을 남긴 뒤 응답(150ms 늦은 기록)', logs.length); } logSlow = false;
console.log('㊿+192 사이트 → 계약 전환 점검');
sitesOn = true; siteRows = SROWS;
{ slack.length = 0; logs.length = 0; const r = await call({ month: '2026-10-01', portal_url: 'https://example.github.io/svc/index.html' });
  ok(r.j.ok && slack.length === 2, '월말 전체 실행: 갱신 메시지 + 사이트 점검 메시지 = 슬랙 2회', slack.length);
  const t = text(slack[1] || {}); ok(/계약 없이 쓰는 Cloud 사이트 4개/.test(t) && /가장 오래된 건 103일/.test(t), '머리: 미연결 4개(발주일 지남 · 대기 · PoC 종료 · 계약 끝남) · 가장 오래된 103일', (slack[1] || {}).text);
  ok(/vsite-a.*가상기관A.*Cloud ZTNA\/ent.*100노드.*홍길동 대리.*경과 103일.*예상 발주일 2026-09-30/.test(t), '줄: 사이트 · 고객 · 제품 · 노드 · 만든 사람 이름 · 경과 · 예상 발주일');
  ok(/vsite-b.*Cloud EDR.*tester.*경과 22일/.test(t) && /vsite-c.*PoC 종료일 2026-10-01/.test(t) && /vsite-h.*계약 해지 · 가상기관H/.test(t), 'EDR 표기 · 이름 없으면 id · PoC 종료일 · 계약 끝남');
  ok(!/vsite-d|vsite-e|vsite-f|vsite-g/.test(t.replace(/PoC 진행 1 · 내부·데모 1 · 계약 연결 1 · 종료·무상 승인 1/, '')) && /PoC 진행 1 · 내부·데모 1 · 계약 연결 1 · 종료·무상 승인 1/.test(t), '진행 중 PoC · 내부 · 연결 · 종료는 줄 없이 건수만');
  ok(/example\.github\.io\/svc\/index\.html#csite/.test(t), '포탈 링크 → #csite');
  ok(logs.length === 2 && logs[1].kind === 'sites' && logs[1].n_lapsed === 3 && logs[1].n_due === 1, 'remind_log kind=sites(n_lapsed = 발주일 지남+PoC 종료+계약 끝남 3 · n_due = 대기 1)', logs[1]);
  ok(r.j.sites && r.j.sites.ok && r.j.sites.total === 4 && r.j.sites.counts.overdue === 1 && r.j.sites.counts.linked === 1, '응답 sites.counts', r.j.sites && r.j.sites.counts); }
{ slack.length = 0; logs.length = 0; const r = await call({ only: 'sites' });
  ok(r.j.ok && slack.length === 1 && /^🛰️/.test(slack[0].text) && Array.isArray(r.j.kinds) && r.j.kinds.length === 0 && r.j.total === 4 && logs.length === 1 && logs[0].kind === 'sites', 'only=sites: 사이트 메시지만 · 갱신 메시지 없음', { n: slack.length, kinds: r.j.kinds, total: r.j.total }); }
{ slack.length = 0; const r = await call({ only: 'sites', dry: true }); ok(r.j.ok && slack.length === 0 && Array.isArray(r.j.sites.preview) && /사이트 4개/.test(String(r.j.text)), 'dry: 미리보기만', r.j.text); }
siteRows = SROWS.filter((x) => !/overdue|waiting|poc_over|ended/.test(x.state));
{ slack.length = 0; const r = await call({ only: 'sites' }); ok(r.j.ok && /계약 없이 쓰는 사이트 없음 ✅/.test(slack[0].text) && r.j.total === 0, '미연결 0 → 없음 ✅ 메시지(재무 확인용으로 보냄)', slack[0].text); }
sitesOn = false;
{ slack.length = 0; const r = await call({ month: '2026-10-01' }); ok(r.j.ok && slack.length === 1 && r.j.sites && r.j.sites.skipped && /SQL 115/.test(String(r.j.sites.error)), 'SQL 115 전: 갱신 메시지만 · sites.skipped 에 이유', r.j.sites); }
{ const r = await call({ only: 'sites' }); ok(r.status === 500 && /SQL 115/.test(String(r.j.error)), 'SQL 115 전 only=sites → 500 + 안내', r.j.error); }
report('remind');
