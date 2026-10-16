// watch Edge Function 테스트 — deno run -A tests/fn/watch.test.ts
//   Auth · REST · 포탈 사이트 · 함수 · GitHub · Slack 전부 가짜(가상 이메일). 서비스 키 직접 호출 거절 · 슈퍼 관리자만 · 지금 점검은 Slack 안 보냄 ·
//   자동(일회용 번호 · 꺼짐이면 안 함) · Slack 은 감시 · «Slack 사용» 둘 다 켜졌을 때만 · 같은 문제 반복 막기 · 정상 복귀 한 번 · 배포 확인(버전) · 시험 한 줄 · DB 숫자 판정
import { installFetch, loadFn, call, ok, report, J } from './_mock.ts';

let superAdmin = true, autoOn = true, slackOn = false, nsSlack = true, fn404 = '', siteVer = '2026-09-16 ㊿+209', dbOk = true, ghFail = false;
let backupDay = '', errN = 2;
const N1 = '11111111-2222-4333-8444-555555555555', N2 = '21111111-2222-4333-8444-555555555555', N3 = '31111111-2222-4333-8444-555555555555', N4 = '41111111-2222-4333-8444-555555555555', N5 = '51111111-2222-4333-8444-555555555555';
const runs: any[] = [N1, N2, N3, N4, N5].map((n, i) => ({ id: i + 1, nonce: n, created_at: new Date(Date.now() - (i === 4 ? 30 : 1) * 60000).toISOString(), used_at: null, result: null }));
const logs: any[] = [], slack: any[] = []; let logId = 0;
const today = () => { const d = new Date(Date.now() - 864e5); return d.toISOString().slice(0, 10).replace(/-/g, ''); };
installFetch((url, method, body, init) => {
  const h = (init?.headers || {}) as Record<string, string>; const auth = String(h.Authorization || h.authorization || '');
  if (url.includes('/auth/v1/user')) return /Bearer (sb_secret_|svc)/.test(auth) ? J({ msg: 'invalid JWT' }, 401) : J({ id: 'u1', email: 'Boss@Example.com' });
  if (url.includes('/rpc/is_super_admin')) return J(superAdmin);
  if (url.includes('/rpc/watch_db')) return dbOk ? J({ at: new Date().toISOString(), db_mb: 120, backup: { schema: true, last_day: backupDay || today() }, errors: { n24: errN, users24: 1, top: 'TypeError: 가상' }, perf: { boot_n: 20, boot_p90: 3000 }, cron: [{ name: 'svc-snap-nightly', active: true, last_status: 'succeeded', fails24: 0 }], net: { total24: 40, fail24: 0 }, aicheck: { run_at: new Date().toISOString(), pass: 15, total: 15 } }) : J({ message: 'not found' }, 404);
  if (url.includes('/rest/v1/watch_settings')) return J([{ id: 1, auto_on: autoOn, slack_on: slackOn, inbox_on: true, channel: 'C0WATCH123', err_24h: 30, boot_p90_ms: 8000, backup_h: 30, repeat_h: 6 }]);
  if (url.includes('/rest/v1/notify_settings')) return J([{ slack_on: nsSlack, team_channel: 'C0TEAM1234' }]);
  if (url.includes('/rest/v1/watch_run')) {
    const q = new URL(url).searchParams, b = JSON.parse(body || '{}');
    if (method === 'PATCH' && q.get('nonce')) { if (auth !== 'Bearer svc') return J([]); const r = runs.find((x) => 'eq.' + x.nonce === q.get('nonce') && !x.used_at && x.created_at > String(q.get('created_at')).slice(3)); if (!r) return J([]); Object.assign(r, b); return J([r]); }
    if (method === 'PATCH' && q.get('id')) { const r = runs.find((x) => 'eq.' + x.id === q.get('id')); if (r) Object.assign(r, b); return new Response(null, { status: 204 }); }
  }
  if (url.includes('/rest/v1/watch_log')) {
    if (method === 'POST') { const row = JSON.parse(body || '{}'); row.id = ++logId; row.at = new Date().toISOString(); logs.push(row); return J([{ id: row.id }], 201); }
    const q = new URL(url).searchParams; let L = logs.slice().reverse();
    const kind = q.get('kind'); if (kind) { const ks = kind.replace(/^in\.\(|\)$/g, '').split(','); L = L.filter((x) => ks.includes(x.kind)); }
    if (q.get('slack')) L = L.filter((x) => x.slack === q.get('slack')!.slice(3));
    const w = q.get('worst'); if (w) L = L.filter((x) => w.startsWith('neq.') ? x.worst !== w.slice(4) : x.worst === w.slice(3));
    if (q.get('sig')) L = L.filter((x) => x.sig === q.get('sig')!.slice(3));
    return J(L.slice(0, 1));
  }
  if (url.startsWith('https://svc.genians.co.kr/index.html')) return new Response(`<html><head><meta name="app-ver" content="${siteVer}"></head><body><script type="module" src="js/main.js?v=x"></script></body></html>`, { status: 200 });
  if (url.startsWith('https://svc.genians.co.kr/js/main.js')) return new Response('//ok', { status: 200 });
  if (url.includes('/functions/v1/')) { const f = url.split('/functions/v1/')[1]; return new Response('ok', { status: f === fn404 ? 404 : 200 }); }
  if (url.includes('api.github.com')) return ghFail ? J({ workflow_runs: [{ name: 'test', status: 'completed', conclusion: 'failure', created_at: '2026-10-16T01:00:00Z' }] }) : J({ workflow_runs: [{ name: 'test', status: 'completed', conclusion: 'success', created_at: '2026-10-16T01:00:00Z' }] });
  if (url.includes('slack.com/api/chat.postMessage')) { slack.push(JSON.parse(body || '{}')); return J({ ok: true, ts: '1.2' }); }
  return undefined;
});
Deno.env.set('SUPABASE_URL', 'https://mock.supabase.co'); Deno.env.set('SUPABASE_ANON_KEY', 'anon'); Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'svc'); Deno.env.set('SLACK_BOT_TOKEN', 'xoxb-test'); Deno.env.set('GITHUB_TOKEN', 'ghtest');
await loadFn('watch');
const M = await import(new URL('../../supabase/functions/watch/index.ts', import.meta.url).href);

console.log('watch 함수');
{ const r = await call({ mode: 'run' }, { token: null }); ok(r.status === 401, '토큰 없음 → 401', r.status); }
{ const r = await call({ mode: 'run' }, { token: 'svc' }); ok(r.status === 403, '서비스 키 → 403', r.j?.error); }
{ const r = await call({ mode: 'run' }, { token: 'sb_secret_x' }); ok(r.status === 403, '비밀 키 → 403'); }
superAdmin = false; { const r = await call({ mode: 'run' }); ok(r.status === 403 && /슈퍼 관리자/.test(r.j?.error), '슈퍼 관리자 아님 → 403'); } superAdmin = true;
slackOn = true;
{ slack.length = 0; const n0 = logs.length; const r = await call({ mode: 'run' });
  ok(r.status === 200 && r.j.worst === 'ok' && r.j.kind === 'manual' && r.j.slack === null && slack.length === 0, '지금 점검: 정상 · Slack 안 보냄(켜져 있어도)', { w: r.j?.worst, s: r.j?.slack });
  const ks = (r.j.items || []).map((i: any) => i.k);
  ok(['site', 'site_js', 'fn:ask', 'fn:export', 'fn:notify', 'db', 'backup', 'errors', 'perf', 'gh'].every((k) => ks.includes(k)), '항목: 사이트 · 시작 파일 · 함수 6 · DB · 백업 · 오류 · 속도 · GitHub', ks.join(','));
  ok(logs.length === n0 + 1 && logs[logs.length - 1].kind === 'manual' && logs[logs.length - 1].by_email === 'boss@example.com' && !/xoxb|ghtest|svc"/.test(JSON.stringify(logs[logs.length - 1])), '기록 1줄(manual · 이메일) · 토큰 없음'); }
{ const r = await call({ cron: 'not-a-uuid' }, { token: null }); ok(r.status === 403, '자동: 번호 형식 아님 → 403'); }
{ const r = await call({ cron: N5 }, { token: null }); ok(r.status === 403, '자동: 10분 지난 번호 → 403'); }
autoOn = false; { const n0 = logs.length; const r = await call({ cron: N1 }, { token: null }); ok(r.j?.ok === false && /꺼져/.test(r.j?.error) && logs.length === n0 && /꺼짐/.test(runs[0].result), '자동 감시 꺼짐 → 점검 안 함 · 기록 «꺼짐»', runs[0].result); } autoOn = true;
{ const r = await call({ cron: N1 }, { token: null }); ok(r.status === 403, '쓴 번호 다시 → 403'); }
// 문제 생김 → Slack 1번 · 같은 문제 → 안 보냄 · 풀림 → 복귀 1번
fn404 = 'export';
{ slack.length = 0; const r = await call({ cron: N2 }, { token: null });
  ok(r.j.worst === 'bad' && r.j.slack === 'sent' && slack.length === 1 && slack[0].channel === 'C0WATCH123' && /문제 1/.test(slack[0].text) && /함수 export/.test(slack[0].text) && !/<!channel>/.test(slack[0].text), '자동: 함수 없음(404) → 문제 · Slack 1번(설정 채널)', slack[0]?.text); }
{ slack.length = 0; const r = await call({ cron: N3 }, { token: null }); ok(r.j.worst === 'bad' && r.j.slack === 'same' && slack.length === 0, '같은 문제(6시간 안) → Slack 안 보냄', r.j.slack); }
fn404 = '';
{ slack.length = 0; const r = await call({ cron: N4 }, { token: null }); ok(r.j.worst === 'ok' && r.j.slack === 'sent' && slack.length === 1 && /정상으로 돌아왔습니다/.test(slack[0].text), '풀림 → 정상 복귀 1번', slack[0]?.text); }
// 배포 확인
siteVer = '2026-09-16 ㊿+208';
{ slack.length = 0; const r = await call({ mode: 'deploy', expect: '2026-09-16 ㊿+209' });
  const site = (r.j.items || []).find((i: any) => i.k === 'site');
  ok(r.j.kind === 'deploy' && r.j.worst === 'bad' && site?.sev === 'bad' && /기대 2026-09-16 ㊿\+209/.test(site.info) && slack.length === 1 && /배포 뒤 확인/.test(slack[0].text), '배포 확인: 운영 버전이 다르면 문제 · Slack(켠 경우)', site?.info); }
siteVer = '2026-09-16 ㊿+209';
{ slack.length = 0; const r = await call({ mode: 'deploy', expect: '2026-09-16 ㊿+209' }); ok(r.j.worst === 'ok' && (r.j.items || []).find((i: any) => i.k === 'site')?.sev === 'ok', '배포 확인: 버전 맞음 → 정상', r.j.slack); }
{ const r = await call({ mode: 'deploy' }); ok(r.status === 400, '배포 확인: 기대 버전 없음 → 400'); }
// Slack 꺼짐 · «Slack 사용» 꺼짐
nsSlack = false; fn404 = 'ask';
{ slack.length = 0; const r = await call({ mode: 'deploy', expect: '2026-09-16 ㊿+209' }); ok(r.j.worst === 'bad' && /^off/.test(r.j.slack) && slack.length === 0, '«Slack 사용» 꺼짐 → 안 보냄', r.j.slack); }
nsSlack = true; slackOn = false;
{ slack.length = 0; const r = await call({ mode: 'deploy', expect: '2026-09-16 ㊿+209' }); ok(r.j.slack === 'off' && slack.length === 0, '감시 Slack 꺼짐(기본) → 안 보냄'); }
fn404 = '';
{ const r = await call({ mode: 'slack_test' }); ok(r.status === 409, 'Slack 시험: 감시 Slack 꺼짐 → 409'); }
slackOn = true;
{ slack.length = 0; const r = await call({ mode: 'slack_test' }); ok(r.j.ok && slack.length === 1 && /시험/.test(slack[0].text) && r.j.channel === 'C0WATCH123', 'Slack 시험 한 줄', r.j); }
// DB 못 읽음 · GitHub 실패
dbOk = false; ghFail = true;
{ const r = await call({ mode: 'run' }); const it = (k: string) => (r.j.items || []).find((i: any) => i.k === k);
  ok(it('db')?.sev === 'bad' && /SQL 123/.test(it('db').info) && it('gh')?.sev === 'warn', 'watch_db 없음 → 문제(SQL 123 안내) · Actions 실패 → 주의', [it('db'), it('gh')]); }
dbOk = true; ghFail = false;
// DB 숫자 판정(순수 함수)
{ const S = { backup_h: 30, err_24h: 30, boot_p90_ms: 8000 }, now = Date.UTC(2026, 9, 16, 9, 0);
  const d = { db_mb: 1, backup: { schema: true, last_day: '20261013' }, errors: { n24: 100, users24: 3 }, perf: { boot_n: 10, boot_p90: 9500 }, cron: [{ name: 'svc-snap-nightly', active: true, last_status: 'failed', fails24: 1, last_msg: 'x' }, { name: 'svc-notify-auto', active: true, last_status: 'succeeded', fails24: 2 }, { name: 'old', active: false, last_status: 'failed' }], net: { total24: 50, fail24: 7 }, aicheck: { run_at: '2026-10-14T00:00:00Z', pass: 15, total: 15 } };
  const I = M.dbItems(d, S, now), g = (k: string) => I.find((i: any) => i.k === k);
  ok(g('backup').sev === 'bad' && g('errors').sev === 'bad' && g('perf').sev === 'warn' && g('cron:svc-snap-nightly').sev === 'bad' && g('cron:svc-notify-auto').sev === 'warn' && !g('cron:old') && g('net').sev === 'warn' && g('ai').sev === 'warn', 'DB 판정: 백업 63시간(2배 넘음) · 오류 100(3배) · 속도 · 백업 작업 실패 · 다른 작업 실패 · 꺼진 작업 빼기 · 서버 호출 · AI 점검 늦음', I.map((i: any) => i.k + ':' + i.sev).join(' '));
  ok(M.worstOf([{ sev: 'ok' }, { sev: 'warn' }] as any) === 'warn' && M.sigOf([{ k: 'b', sev: 'bad' }, { k: 'a', sev: 'warn' }, { k: 'c', sev: 'ok' }] as any) === 'a:warn,b:bad', '가장 나쁜 것 · 문제 모양(정렬)');
  ok(M.verOf('<meta name="app-ver" content="2026-09-16 ㊿+209">') === '2026-09-16 ㊿+209', '버전 읽기'); }
report('watch');
