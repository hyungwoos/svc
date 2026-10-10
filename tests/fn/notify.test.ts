// notify Edge Function 테스트 — deno run -A tests/fn/notify.test.ts
//   Auth · REST · Slack 전부 가짜(가상 이메일 · 가상 고객명). 자동 발송 거절(서비스 키) · 슈퍼 관리자만 · Slack 꺼짐이면 거절 ·
//   채널은 설정과 같아야 · DM 은 받는 사람으로 정한 계정만 · dry · 전체 호출 지움 · DM 순서(lookup → open → post) · missing_scope 안내 · notify_log(글 없음)
//   ㊿+177 예약 발송: 일회용 번호(있고 · 안 썼고 · 10분 안)만 · 한 번만 · 꺼짐이면 안 보냄 · 보낼 글 72시간 넘으면 안 보냄(기록) · 채널은 설정 것 · DM 은 auto_dm 일 때 받는 사람만
import { installFetch, loadFn, call, ok, report, J } from './_mock.ts';

let superAdmin = true, slackOn = true, scopeMiss = false, notIn = false, autoOn = true, autoDm = false;
const SET = () => ({ slack_on: slackOn, auto_on: autoOn, auto_dm: autoDm, team_channel: 'C0TEST1234', renew_emails: ['a@example.com'], eq_emails: ['b@example.com'], biz_emails: [], dc_emails: [] });
const N1 = '11111111-2222-4333-8444-555555555555', N2 = '21111111-2222-4333-8444-555555555555', N3 = '31111111-2222-4333-8444-555555555555', N4 = '41111111-2222-4333-8444-555555555555';
const runs: any[] = [N1, N2, N3, N4].map((n, i) => ({ id: i + 1, slot: '2026-10-12 09:0' + i, nonce: n, created_at: new Date(Date.now() - (i === 2 ? 20 : 1) * 60000).toISOString(), used_at: null, result: null }));
let snap: any = { at: new Date(Date.now() - 2 * 36e5).toISOString(), by_email: 'boss@example.com', n: 2, team: { text: '🔔 포탈 알림 — 2건 · 가상고객01', n: 2 }, dms: [{ email: 'a@example.com', text: '나에게 1건', n: 1 }, { email: 'stranger@example.com', text: 'x', n: 1 }] };
const logs: any[] = [], slack: { m: string; body: any }[] = [];
installFetch((url, method, body, init) => {
  const h = (init?.headers || {}) as Record<string, string>; const auth = String(h.Authorization || h.authorization || '');
  if (url.includes('/auth/v1/user')) return /Bearer (sb_secret_|svc)/.test(auth) ? J({ msg: 'invalid JWT' }, 401) : J({ id: 'u1', email: 'Boss@Example.com' });
  if (url.includes('/rpc/is_super_admin')) return J(superAdmin);
  if (url.includes('/rest/v1/notify_settings')) return J([SET()]);
  if (url.includes('/rest/v1/notify_auto_run')) {
    const q = new URL(url).searchParams, b = JSON.parse(body || '{}');
    if (method === 'PATCH' && q.get('nonce')) { if (auth !== 'Bearer svc') return J([], 200); const r = runs.find((x) => 'eq.' + x.nonce === q.get('nonce') && !x.used_at && x.created_at > String(q.get('created_at')).slice(3)); if (!r) return J([]); Object.assign(r, b); return J([r]); }
    if (method === 'PATCH' && q.get('id')) { const r = runs.find((x) => 'eq.' + x.id === q.get('id')); if (r) Object.assign(r, b); return new Response('', { status: 204 }); }
  }
  if (url.includes('/rest/v1/notify_snapshot')) return J(snap ? [snap] : []);
  if (url.includes('/rest/v1/user_owner_map')) return J(auth === 'Bearer svc' ? [{ email: 'c@example.com' }] : []);
  if (url.includes('/rest/v1/work_assign')) return J(auth === 'Bearer svc' ? [{ assignee: 'd@example.com' }] : []);
  if (url.includes('/rest/v1/notify_log')) { (JSON.parse(body || '[]') as any[]).forEach((x) => logs.push(x)); return new Response('', { status: 201 }); }
  if (url.includes('slack.com/api/')) {
    const m = url.split('/api/')[1].split('?')[0]; slack.push({ m, body: body ? JSON.parse(body) : url });
    if (m === 'users.lookupByEmail') return J(scopeMiss ? { ok: false, error: 'missing_scope' } : /zz%40/.test(url) ? { ok: false, error: 'users_not_found' } : { ok: true, user: { id: 'U' + url.length } });
    if (m === 'conversations.open') return J({ ok: true, channel: { id: 'D123' } });
    if (m === 'chat.postMessage') return J(notIn ? { ok: false, error: 'not_in_channel' } : { ok: true, ts: '1.2' });
  }
  return undefined;
});
Deno.env.set('SUPABASE_URL', 'https://mock.supabase.co'); Deno.env.set('SUPABASE_ANON_KEY', 'anon'); Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'svc'); Deno.env.set('SLACK_BOT_TOKEN', 'xoxb-test');
await loadFn('notify');
const TEAM = { channel: 'C0TEST1234', text: '🔔 포탈 알림 — 가상고객01 <!channel> @here', n: 3 };

console.log('notify 함수');
{ const r = await call({ team: TEAM }, { token: null }); ok(r.status === 401, '토큰 없음 → 401', r.status); }
{ slack.length = 0; const r = await call({ team: TEAM }, { token: 'svc' }); ok(r.status === 403 && slack.length === 0, '서비스 키(크론 · 자동 발송) → 403 · 안 보냄', r.j?.error); }
{ slack.length = 0; const r = await call({ team: TEAM }, { token: 'sb_secret_abc' }); ok(r.status === 403 && slack.length === 0, '비밀 키 → 403', r.j?.error); }
superAdmin = false; { slack.length = 0; const r = await call({ team: TEAM }); ok(r.status === 403 && slack.length === 0, '슈퍼 관리자 아님 → 403', r.j?.error); } superAdmin = true;
slackOn = false; { slack.length = 0; const r = await call({ team: TEAM }); ok(r.status === 409 && slack.length === 0 && /꺼져/.test(r.j?.error), 'Slack 꺼짐(설정) → 409 · 안 보냄', r.j?.error); } slackOn = true;
{ const r = await call({ team: { ...TEAM, channel: 'C0OTHER999' } }); ok(r.status === 400 && /설정과 다릅니다/.test(r.j?.error), '설정과 다른 채널 → 400'); }
{ const r = await call({ dms: [{ email: 'stranger@example.com', text: 'x', n: 1 }] }); ok(r.status === 400 && /정해지지 않은/.test(r.j?.error), '받는 사람이 아닌 계정 DM → 400', r.j?.error); }
{ const r = await call({ dms: Array.from({ length: 31 }, (_, i) => ({ email: `p${i}@example.com`, text: 'x' })) }); ok(r.status === 400, 'DM 31명 → 400'); }
{ const r = await call({}); ok(r.status === 400, '보낼 곳 없음 → 400'); }
{ slack.length = 0; logs.length = 0; const r = await call({ team: TEAM, dms: [{ email: 'a@example.com', text: 'a', n: 1 }], dry: true });
  ok(r.status === 200 && r.j.dry === true && slack.length === 0 && r.j.results.length === 2, 'dry: Slack 호출 0 · 결과 2', r.j?.results);
  ok(logs.length === 2 && logs.every((x) => x.dry === true && !('text' in x)), 'dry 도 기록(글은 저장 안 함)', logs[0]); }
{ slack.length = 0; logs.length = 0;
  const r = await call({ team: TEAM, dms: [{ email: 'A@example.com', text: '나에게 2건', n: 2 }, { email: 'c@example.com', text: 'CSM 1건', n: 1 }, { email: 'd@example.com', text: '처리 담당 1건', n: 1 }] });
  ok(r.status === 200 && r.j.ok && r.j.results.length === 4, '팀 1 + DM 3(설정 · 담당자 연결 · 처리 담당) 모두 보냄', r.j?.results);
  const team = slack.find((s) => s.m === 'chat.postMessage' && s.body.channel === 'C0TEST1234');
  ok(team && !/<!channel>/.test(team.body.text) && !/@here/.test(team.body.text) && /가상고객01/.test(team.body.text), '팀 채널 글: 전체 호출(<!channel> · @here) 지움', team?.body.text);
  const seq = slack.filter((s) => s.m !== 'chat.postMessage' || s.body.channel === 'D123').map((s) => s.m).slice(0, 3).join('>');
  ok(seq === 'users.lookupByEmail>conversations.open>chat.postMessage', 'DM 순서 lookup → open → post', seq);
  ok(logs.length === 4 && logs[0].sent_by === 'boss@example.com' && logs.some((x) => x.target === 'dm:a@example.com'), 'notify_log 대상마다 · 보낸 사람 소문자', logs.map((x) => x.target)); }
scopeMiss = true; { const r = await call({ team: TEAM, dms: [{ email: 'b@example.com', text: 'x', n: 1 }] });
  ok(r.status === 200 && !r.j.ok && r.j.results[0].ok && !r.j.results[1].ok && /users:read\.email/.test(r.j.hint || ''), 'DM 권한 없음 → 팀은 보내고 DM 실패 + 권한 안내', r.j); } scopeMiss = false;
notIn = true; { const r = await call({ team: TEAM }); ok(!r.j.ok && /invite/.test(r.j.results[0].error), 'not_in_channel → 초대 안내', r.j.results[0]); } notIn = false;
{ const r = await call({ dms: [{ email: 'a@example.com', text: 'x' }, { email: 'a@example.com', text: 'y' }] }); ok(r.status === 400, '같은 계정 두 번 → 400'); }
console.log('예약 발송 (㊿+177)');
{ slack.length = 0; const r = await call({ auto: 'not-a-uuid' }, { token: null }); ok(r.status === 403 && slack.length === 0, '번호 형식 아님 → 403', r.j?.error); }
{ slack.length = 0; const r = await call({ auto: '99999999-2222-4333-8444-555555555555' }, { token: null }); ok(r.status === 403 && slack.length === 0, '없는 번호 → 403 · 안 보냄', r.j?.error); }
{ slack.length = 0; const r = await call({ auto: N3 }, { token: null }); ok(r.status === 403 && slack.length === 0, '10분 지난 번호 → 403', r.j?.error); }
{ slack.length = 0; logs.length = 0; const r = await call({ auto: N1 }, { token: null });
  const t = slack.find((x) => x.m === 'chat.postMessage');
  ok(r.status === 200 && r.j.ok && r.j.auto && slack.length === 1 && t.body.channel === 'C0TEST1234' && /^⏰ 예약 발송 · 기준 \d\d\/\d\d \d\d:\d\d 포탈 계산\n🔔 포탈 알림/.test(t.body.text), '예약: 설정 채널로 팀 1번(머리말 + 보낼 글) · DM 은 꺼짐이라 0', t?.body.text);
  ok(logs.length === 1 && logs[0].sent_by === '예약' && logs[0].target === 'team:C0TEST1234' && !('text' in logs[0]) && /1곳 보냄/.test(runs[0].result) && runs[0].used_at, '기록: notify_log 예약 · 실행 기록 결과', runs[0].result); }
{ slack.length = 0; const r = await call({ auto: N1 }, { token: null }); ok(r.status === 403 && slack.length === 0, '같은 번호 두 번 → 403(한 번만)', r.j?.error); }
autoDm = true; { slack.length = 0; logs.length = 0; const r = await call({ auto: N2 }, { token: null });
  const posts = slack.filter((x) => x.m === 'chat.postMessage');
  ok(r.j.ok && r.j.results.length === 2 && posts.length === 2 && r.j.results[1].target === 'dm:a@example.com' && /^⏰ 예약 발송/.test(posts[1].body.text) && !logs.some((x) => /stranger/.test(x.target)), 'auto_dm: 받는 사람(a)에게만 DM · 정해지지 않은 계정은 뺌', r.j.results); } autoDm = false;
snap.at = new Date(Date.now() - 80 * 36e5).toISOString(); { slack.length = 0; logs.length = 0; const r = await call({ auto: N4 }, { token: null });
  ok(r.j && !r.j.ok && slack.length === 0 && /80시간 전/.test(r.j.error) && logs[0]?.target === 'skip' && /72시간/.test(runs[3].result), '보낼 글 80시간 전 → 안 보냄 · 기록', r.j?.error); }
autoOn = false; runs.push({ id: 9, slot: 'x', nonce: '91111111-2222-4333-8444-555555555555', created_at: new Date().toISOString(), used_at: null });
{ slack.length = 0; const r = await call({ auto: '91111111-2222-4333-8444-555555555555' }, { token: null }); ok(r.j && !r.j.ok && slack.length === 0 && /꺼져/.test(r.j.error), '예약 꺼짐(설정) → 안 보냄', r.j?.error); } autoOn = true;
report('notify');
