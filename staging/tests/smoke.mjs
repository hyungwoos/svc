// 스모크 테스트 — 포탈이 "열리고 · 주요 화면이 그려지고 · 저장 동작이 올바른 요청을 보내는지" 를 가짜 백엔드로 확인
// 실행: node tests/smoke.mjs      (Playwright chromium 필요: npx playwright install --with-deps chromium)
// 환경: SMOKE_DIR=서빙할 폴더(기본 저장소 루트) · SMOKE_SHOT=1 이면 실패 화면을 tests/out/ 에 저장
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { ROOT, serve, mockBackend, collect, Suite, assert } from './lib.mjs';

const DIR = process.env.SMOKE_DIR || ROOT;
const OUT = path.join(ROOT, 'tests', 'out'); fs.mkdirSync(OUT, { recursive: true });
const { srv, url } = await serve(DIR);
const browser = await chromium.launch();
const S = new Suite('smoke');
const VIEWS = ['contracts', 'orders', 'assets', 'eqboard', 'oi', 'mdrops', 'live', 'churn', 'churnrate', 'custflow', 'leadsrc', 'price', 'cloud', 'report', 'weekly', 'inbstat', 'account', 'adminx', 'ops', 'log'];
const VIEW_HOST = { contracts: '#viewData', orders: '#viewData', assets: '#viewData', eqboard: '#viewEqBoard', oi: '#viewData', mdrops: '#viewData', live: '#viewData', churn: '#viewChurn', churnrate: '#viewChurnRate', custflow: '#viewCustFlow', leadsrc: '#viewData', price: '#viewPrice', cloud: '#viewCloud', report: '#viewReport', weekly: '#viewWeekly', inbstat: '#viewInb', account: '#viewAccount', adminx: '#viewAdmin', ops: '#viewOps', log: '#viewData' };

const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');   // 1×1 PNG
const jwt = (aal, email = 'tester@example.com') => 'h.' + Buffer.from(JSON.stringify({ sub: 'u1', email, aal, exp: 9999999999 })).toString('base64url') + '.s';   // 가짜 JWT (aal 검사용)
async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage(); const c = collect(page);
  await mockBackend(page, opts);
  await page.goto(url + '/index.html'); await page.waitForTimeout(2200);
  return { ctx, page, ...c };
}
async function shot(page, name) { try { await page.screenshot({ path: path.join(OUT, name + '.png') }); } catch { /* noop */ } }

// 1) 기본 로드
{
  const { ctx, page, errs, csp } = await open();
  await S.t('로그인 상태로 열림 · 오류 없음', async () => { assert(await page.evaluate(() => !document.getElementById('app').classList.contains('hidden') && !!window.DATA), '#app 숨김 또는 DATA 없음'); assert(!errs.length, 'pageerror: ' + errs.join(' | ')); return await page.evaluate(() => APP_VER); });
  await S.t('홈: KPI 타일·인박스', async () => { const k = await page.$$eval('#kpis .kpi, #ccHeroHost .kpi', (e) => e.length); const ib = await page.$$eval('#ccInbox .ib-row, #ccInbox .ib-empty', (e) => e.length); assert(k >= 4, 'kpi ' + k); assert(ib >= 1, 'inbox ' + ib); return { kpi: k, inbox: ib }; });
  await S.t('CSP 위반 없음(콘솔)', async () => { assert(!csp.length, csp.slice(0, 3).join(' | ')); });
  for (const v of VIEWS) {
    await S.t('화면 ' + v, async () => {
      const before = errs.length;
      await page.evaluate((v) => switchView(v), v); await page.waitForTimeout(350);
      const cur = await page.evaluate(() => CUR_VIEW); assert(cur === v, 'CUR_VIEW=' + cur);
      const host = VIEW_HOST[v]; const vis = await page.$eval(host, (e) => !e.classList.contains('hidden')); assert(vis, host + ' 숨김');
      if (errs.length > before) throw new Error(errs.slice(before).join(' | '));
    });
  }
  await S.t('뒤로가기(←) 동작', async () => { await page.evaluate(() => switchView('dash')); await page.evaluate(() => switchView('contracts')); await page.evaluate(() => switchView('oi')); await page.waitForTimeout(200); await page.evaluate(() => goBack()); await page.waitForTimeout(400); const v = await page.evaluate(() => CUR_VIEW); assert(v === 'contracts', 'back → ' + v); });
  await S.t('만기 처리 창 열림', async () => { await page.evaluate(() => openRenewList('due')); await page.waitForTimeout(200); assert(await page.evaluate(() => document.getElementById('ovlRenew').classList.contains('on')), 'ovlRenew 닫힘'); const tabs = await page.$$eval('#rnTabs button', (b) => b.length); assert(tabs === 3, 'tabs ' + tabs); await page.evaluate(() => closeOvl('ovlRenew')); });
  await S.t('AI 요약(buildDigest) 생성', async () => { const d = await page.evaluate(() => { const D = buildDigest(); return { live: D.LIVE고객사수, keys: Object.keys(D).length, renew: !!D.만기관리 }; }); assert(d.keys > 10 && d.renew, JSON.stringify(d)); return d; });
  await S.t('Ctrl+K 검색 열림', async () => { await page.keyboard.press('Control+k'); await page.waitForTimeout(200); assert(await page.evaluate(() => document.getElementById('ovlFind').classList.contains('on')), 'ovlFind 닫힘'); await page.keyboard.press('Escape'); });
  if (S.failed.length) await shot(page, 'smoke_fail_main');
  await ctx.close();
}
// 2) 저장 동작 — 계약 연장이 올바른 요청(PATCH + DELETE + POST 12행 + change_log)을 보내는지
{
  const writes = [];
  const { ctx, page, errs } = await open({ onWrite: (w) => writes.push(w) });
  await S.t('만기 처리 › 연장 저장 요청 모양', async () => {
    const r = await page.evaluate(async () => { const S = renewScan(); const row = S.due[0] || S.next[0] || S.lapsed[0] || DATA.rows.filter((x) => x.endRaw != null && !x.parent)[0]; if (!row) return null; const ne = row.endRaw + 12; const res = await doRenew(row, ne, row.mrr || 100000, 'smoke'); return { id: row._id, ne, rno: res.rno }; });
    assert(r, '연장할 계약 없음');
    const patch = writes.find((w) => w.m === 'PATCH' && w.url.includes('contracts?id=eq.' + r.id)); assert(patch && /renew_count/.test(patch.body), 'PATCH 없음');
    const del = writes.find((w) => w.m === 'DELETE' && w.url.includes('monthly_revenue')); assert(del, 'DELETE 없음');
    const post = writes.find((w) => w.m === 'POST' && w.url.includes('monthly_revenue')); assert(post && JSON.parse(post.body).length >= 1, 'POST 없음');
    const log = writes.find((w) => w.m === 'POST' && w.url.includes('change_log')); assert(log, 'change_log 없음');
    assert(!errs.length, errs.join(' | '));
    return { writes: writes.length, rno: r.rno };
  });
  await ctx.close();
}
// 3) 권한 — admin_viewer 는 쓰기 차단 · 배포·운영 메뉴 숨김
{
  const { ctx, page } = await open({ role: 'admin_viewer', email: 'viewer@example.com' });
  await S.t('admin_viewer: 쓰기 차단 · ops 메뉴 숨김', async () => {
    const r = await page.evaluate(async () => { let blocked = false; try { await sbWrite('PATCH', 'contracts?id=eq.1', { note: 'x' }); } catch (e) { blocked = /권한/.test(String(e.message || e)); } return { blocked, opsMenu: document.querySelector('#side button[data-v="ops"]').style.display !== 'none', isViewer: !!window.IS_VIEWER_ROLE }; });
    assert(r.blocked, '쓰기가 차단되지 않음'); assert(!r.opsMenu, 'ops 메뉴 보임'); assert(r.isViewer, 'IS_VIEWER_ROLE false'); return r;
  });
  await ctx.close();
}
// 4) 위성 페이지 — 세션 인식 · 오류 없음
for (const f of ['quote.html', 'report.html', 's1.html', 'kk.html']) {
  if (!fs.existsSync(path.join(DIR, f))) { console.log('  · ' + f + ' 없음(건너뜀)'); continue; }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const page = await ctx.newPage(); const c = collect(page);
  await mockBackend(page); await page.goto(url + '/' + f); await page.waitForTimeout(1500);
  await S.t('위성 ' + f + ' 로드', async () => { assert(!c.errs.length, c.errs.join(' | ')); const title = await page.title(); assert(title, '제목 없음'); return title.slice(0, 40); });
  await ctx.close();
}
// 5) 모바일 폭
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 820 }, isMobile: true }); const page = await ctx.newPage(); const c = collect(page);
  await mockBackend(page); await page.goto(url + '/index.html'); await page.waitForTimeout(2200);
  await S.t('모바일 390px: 하단 탭 · 오류 없음 · 가로 스크롤 없음', async () => { assert(!c.errs.length, c.errs.join(' | ')); const tabs = await page.$$eval('#mtabs button', (b) => b.length).catch(() => 0); assert(tabs >= 3, 'mtabs ' + tabs); const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert(over <= 2, '가로 넘침 ' + over + 'px'); return { tabs, over }; });
  await ctx.close();
}
// 6) 배포·운영 — 대상(운영/스테이징) · 폴더 경로 유지 · 동기화/승격 · 시스템 점검 (ops 함수는 가짜)
{
  const opsCalls = [];
  const seal = { exists: false, puts: [] };
  const { ctx, page, errs } = await open({ extra: async (route, u, m) => {
    if (u.includes('/storage/v1/object/')) {   // 직인(비공개 Storage) 가짜: 올리기 전엔 400, 올린 뒤엔 PNG
      if (m === 'POST') { seal.puts.push({ ct: route.request().headers()['content-type'], upsert: route.request().headers()['x-upsert'], auth: !!route.request().headers()['authorization'] }); seal.exists = true; await route.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"private/seal.jpg"}' }); return true; }
      if (!seal.exists) { await route.fulfill({ status: 400, contentType: 'application/json', body: '{"statusCode":"404","error":"not_found","message":"Object not found"}' }); return true; }
      await route.fulfill({ status: 200, contentType: 'image/png', body: PNG1 }); return true;
    }
    if (!u.includes('/functions/v1/ops')) return false;
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch { /* noop */ }
    opsCalls.push(body);
    const A = body.action; let out = { ok: true };
    if (A === 'status') out = { ok: true, pin_set: true, github: { repo: 'x/svc', branch: 'main', token_set: true }, mgmt_token_set: true, log_ok: true, recent: [] };
    else if (body.pin !== '1234') out = { ok: false, error: 'PIN 이 틀립니다' };
    else if (A === 'gh_put') out = { ok: true, commit: 'abc1234def', url: 'u', files: body.files.map((f) => f.path) };
    else if (A === 'gh_copy') out = { ok: true, commit: 'cafe0001', url: 'u', files: ['index.html'], note: 'n' };
    else if (A === 'sql_run') out = { ok: true, rows: [{ ok: 1, at: '2026-10-03T00:00:00' }], row_count: 1 };
    else if (A === 'gh_list') out = { ok: true, files: [{ path: 'index.html', size: 10, sha: 'a' }, { path: '도장.jpg', size: 10, sha: 'b' }, { path: 'staging/도장.jpg', size: 10, sha: 'c' }] };
    else if (A === 'gh_delete') out = { ok: true, commit: 'dead0001', url: 'u', deleted: body.paths, missing: [] };
    await route.fulfill({ status: out.ok ? 200 : 400, contentType: 'application/json', body: JSON.stringify(out) }); return true; } });
  page.on('dialog', (d) => (/새로고침|열까요/.test(d.message()) ? d.dismiss() : d.accept()));
  await page.evaluate(() => switchView('ops')); await page.waitForTimeout(500);
  await S.t('배포·운영: 스테이징 대상 + 폴더 경로 유지 커밋', async () => {
    await page.fill('#opsPin', '1234');
    await page.click('#opsTarget button[data-tg="staging"]'); await page.waitForTimeout(150);
    await page.evaluate(() => { OPS.files = [{ path: 'tests/smoke.mjs', size: 10, content: '// x' }, { path: 'index.html', size: 60, content: "<script>var APP_VER='2026-09-16 ㊿+999';</script>", ver: '2026-09-16 ㊿+999' }]; renderOps(true); });
    await page.click('#opsCommit'); await page.waitForTimeout(800);
    const put = opsCalls.find((c) => c.action === 'gh_put'); assert(put, 'gh_put 없음');
    const paths = put.files.map((f) => f.path); assert(paths.includes('staging/tests/smoke.mjs') && paths.includes('staging/index.html'), paths.join(','));
    assert(/^\[staging\]/.test(put.message), put.message); return paths;
  });
  await S.t('배포·운영: 운영→스테이징 동기화 · 스테이징→운영 승격', async () => {
    await page.click('#opsSync'); await page.waitForTimeout(300);
    await page.click('#opsPromote'); await page.waitForTimeout(300);
    const cp = opsCalls.filter((c) => c.action === 'gh_copy'); assert(cp.length === 2, 'gh_copy ' + cp.length);
    assert(cp[0].src === '' && cp[0].dst === 'staging' && cp[1].src === 'staging' && cp[1].dst === '', JSON.stringify(cp)); return cp.map((c) => (c.src || '/') + '→' + (c.dst || '/'));
  });
  await S.t('배포·운영: 보안 자산 — 직인 상태 · 올리기 · 저장소 도장.jpg 삭제(gh_delete)', async () => {
    await page.click('#opsTabs button[data-t="gh"]'); await page.waitForTimeout(150);
    await page.click('#opsSealCheck'); await page.waitForTimeout(300);
    assert(/아직 없음/.test(await page.$eval('#opsSealSt', (e) => e.textContent)), '없음 상태 아님: ' + await page.$eval('#opsSealSt', (e) => e.textContent));
    await page.setInputFiles('#opsSealFile', { name: 'seal.jpg', mimeType: 'image/jpeg', buffer: PNG1 }); await page.waitForTimeout(500);
    assert(seal.puts.length === 1 && seal.puts[0].upsert === 'true' && seal.puts[0].auth, 'storage POST ' + JSON.stringify(seal.puts));
    assert(/Storage 에 있음/.test(await page.$eval('#opsSealSt', (e) => e.textContent)), '올린 뒤 상태');
    assert(await page.$('#opsBody img[alt="직인 미리보기"]'), '미리보기 없음');
    await page.click('#opsSealRm'); await page.waitForTimeout(500);
    const del = opsCalls.find((c) => c.action === 'gh_delete'); assert(del, 'gh_delete 없음');
    assert(del.paths.length === 2 && del.paths.includes('도장.jpg') && del.paths.includes('staging/도장.jpg'), JSON.stringify(del.paths)); return del.paths;
  });
  await S.t('배포·운영: 시스템 점검 실행', async () => {
    await page.click('#opsTabs button[data-t="log"]'); await page.waitForTimeout(150);
    await page.click('#opsHealth'); await page.waitForTimeout(2500);
    const rows = await page.$$eval('#opsBody table tbody tr', (t) => t.map((x) => x.innerText.replace(/\s+/g, ' ').slice(0, 60)));
    assert(rows.length >= 6, 'rows ' + rows.length); assert(!errs.length, errs.join(' | ')); return rows.length + '항목';
  });
  await ctx.close();
}
// 7) 브라우저 오류 수집 — 화면 JS 오류가 client_errors 로 1번만 기록되는지
{
  const writes = [];
  const { ctx, page } = await open({ onWrite: (w) => writes.push(w) });
  await S.t('JS 오류 → client_errors 기록(중복 1회)', async () => {
    await page.evaluate(() => { setTimeout(() => { throw new Error('smoke-test-error'); }, 0); setTimeout(() => { throw new Error('smoke-test-error'); }, 10); });
    await page.waitForTimeout(600);
    const posts = writes.filter((w) => w.url.includes('client_errors')); assert(posts.length === 1, 'posts ' + posts.length);
    const b = JSON.parse(posts[0].body); assert(b.msg.includes('smoke-test-error') && b.ver && b.email, JSON.stringify(b).slice(0, 120)); return b.msg;
  });
  await ctx.close();
}
// 8) 스테이징 경로 — staging/ 사본이 있으면 띠가 보이는지
if (fs.existsSync(path.join(DIR, 'staging', 'index.html'))) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await ctx.newPage(); const c = collect(page);
  await mockBackend(page); await page.goto(url + '/staging/index.html'); await page.waitForTimeout(2200);
  await S.t('스테이징: STAGING 띠 · 배포 기본 대상 스테이징', async () => { assert(!c.errs.length, c.errs.join(' | ')); assert(await page.$('#stagingBar'), '띠 없음'); assert(await page.evaluate(() => IS_STAGING && /STAGING/.test(document.title)), 'IS_STAGING/title'); await page.evaluate(() => switchView('ops')); await page.waitForTimeout(300); assert(await page.evaluate(() => OPS.target === 'staging'), 'target ' + await page.evaluate(() => OPS.target)); });
  await ctx.close();
} else console.log('  · staging/ 없음(건너뜀)');
// 9) 2단계 인증(MFA) — 등록된 계정: 저장된 aal1 세션 → 코드 창 → aal2 세션 교체 · 취소 · 로그인 화면 흐름 · 내 계정 카드(끄기·켜기)
{
  const authCalls = []; let factors = [{ id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'SVC 포탈 2026-10-03', created_at: '2026-10-03T00:00:00Z' }];
  const mfaExtra = async (route, u, m) => {
    const J = async (o, st = 200) => { await route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(o) }); return true; };
    const auth = route.request().headers()['authorization'] || ''; const path = u.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const user = { id: 'u1', email: 'tester@example.com', user_metadata: { pw_changed: true }, factors };
    if (path === '/auth/v1/user') { authCalls.push('user'); return J(user); }
    let mm = /^\/auth\/v1\/factors\/([^/]+)\/(challenge|verify)$/.exec(path);
    if (mm && m === 'POST') {
      if (mm[2] === 'challenge') { authCalls.push('challenge:' + mm[1]); return J({ id: 'c-' + mm[1], expires_at: 9999999999 }); }
      const b = JSON.parse(route.request().postData() || '{}'); authCalls.push('verify:' + mm[1] + ':' + b.code);
      if (b.code === '123456' && b.challenge_id === 'c-' + mm[1]) { factors = factors.map((f) => f.id === mm[1] ? { ...f, status: 'verified' } : f); return J({ access_token: jwt('aal2'), refresh_token: 'r2', expires_in: 3600, token_type: 'bearer', user }); }
      return J({ msg: 'Invalid TOTP code entered', code: 422 }, 422);
    }
    if (path === '/auth/v1/factors' && m === 'POST') { authCalls.push('enroll'); factors = factors.concat([{ id: 'f2', factor_type: 'totp', status: 'unverified', friendly_name: 'SVC 포탈', created_at: '2026-10-03T01:00:00Z' }]); return J({ id: 'f2', type: 'totp', friendly_name: 'SVC 포탈', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#fff"/><rect x="2" y="2" width="6" height="6" fill="#000"/></svg>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' } }); }
    mm = /^\/auth\/v1\/factors\/([^/]+)$/.exec(path);
    if (mm && m === 'DELETE') { authCalls.push('unenroll:' + mm[1]); factors = factors.filter((f) => f.id !== mm[1]); return J({ id: mm[1] }); }
    if (u.includes('grant_type=password')) { authCalls.push('password'); return J({ access_token: jwt('aal1'), refresh_token: 'r1', expires_in: 3600, token_type: 'bearer', user }); }
    if (u.includes('/rpc/load_all') && factors.some((f) => f.status === 'verified') && !auth.includes(jwt('aal2'))) { authCalls.push('load_all:blocked'); return J({}); }   // SQL 88 흉내: 등록자는 aal2 만 데이터
    return false;
  };
  // A) 저장된 aal1 세션으로 시작 → 코드 창 → 틀림 → 맞음 → 데이터 로드
  {
    const { ctx, page, errs } = await open({ token: jwt('aal1'), extra: mfaExtra });
    await S.t('MFA: 저장된 aal1 세션 → 코드 창 → aal2 세션으로 교체', async () => {
      assert(await page.$('#ovlMfa'), '코드 창 없음'); assert(await page.evaluate(() => document.getElementById('app').classList.contains('hidden')), '코드 전에 앱이 열림');
      await page.fill('#mfaCode', '000000'); await page.waitForTimeout(400);
      assert(/맞지 않습니다/.test(await page.$eval('#mfaMsg', (e) => e.textContent)), '오답 안내 없음');
      await page.fill('#mfaCode', '123456'); await page.waitForTimeout(2500);
      assert(!(await page.$('#ovlMfa')), '코드 창이 남음'); assert(await page.evaluate(() => !document.getElementById('app').classList.contains('hidden') && !!window.DATA), '앱 미표시');
      const sess = await page.evaluate(() => JSON.parse(sessionStorage.getItem('svc_sess'))); assert(sess.a === jwt('aal2') && sess.r === 'r2', 'aal2 세션 저장 안 됨');
      assert(authCalls.includes('challenge:f1') && authCalls.includes('verify:f1:000000') && authCalls.includes('verify:f1:123456'), authCalls.join(','));
      assert(!errs.length, errs.join(' | ')); return authCalls.filter((x) => !/^user|^load_all/.test(x)).join(' → ');
    });
    await S.t('MFA: 내 계정 › 보안 카드 — 켜짐 표시 → 끄기 → 켜기(QR·코드)', async () => {
      page.on('dialog', (d) => d.accept());
      await page.evaluate(() => switchView('account')); await page.waitForTimeout(700);
      let t = await page.$eval('#accMfa', (e) => e.textContent); assert(/켜짐/.test(t) && /2단계 확인됨/.test(t), '카드: ' + t.slice(0, 80));
      await page.click('#mfaOff'); await page.waitForTimeout(600);
      t = await page.$eval('#accMfa', (e) => e.textContent); assert(/꺼짐/.test(t), '끈 뒤: ' + t.slice(0, 80)); assert(authCalls.includes('unenroll:f1'), 'DELETE f1 없음');
      await page.click('#mfaOn'); await page.waitForTimeout(600);
      assert(await page.$('#accMfa img[alt="인증 앱 등록 QR"]'), 'QR 없음');
      await page.waitForTimeout(200); const qr = await page.$eval('#accMfa img[alt="인증 앱 등록 QR"]', (e) => ({ ok: e.complete && e.naturalWidth > 0, src: e.getAttribute('src').slice(0, 40) })); assert(qr.ok, 'QR 이미지가 깨짐(# 포함 SVG data URL): ' + qr.src); assert(/JBSWY3DPEHPK3PXP/.test(await page.$eval('#accMfa', (e) => e.textContent)), '수동 키 없음');
      await page.fill('#mfaEnCode', '123456'); await page.click('#mfaEnGo'); await page.waitForTimeout(800);
      t = await page.$eval('#accMfa', (e) => e.textContent); assert(/켜짐/.test(t), '켠 뒤: ' + t.slice(0, 80));
      assert(authCalls.includes('enroll') && authCalls.includes('challenge:f2') && authCalls.includes('verify:f2:123456'), authCalls.join(','));
      const chg = await page.evaluate(() => sessionStorage.getItem('svc_sess')); assert(JSON.parse(chg).a === jwt('aal2'), '세션 유지'); return '끄기·켜기 OK';
    });
    await ctx.close();
  }
  // B) 코드 창에서 취소 → 세션 삭제 · 로그인 화면
  {
    factors = [{ id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'x', created_at: '2026-10-03T00:00:00Z' }];
    const { ctx, page } = await open({ token: jwt('aal1'), extra: mfaExtra });
    await S.t('MFA: 취소 → 로그인 화면 · 세션 삭제', async () => {
      await page.click('#mfaCancel'); await page.waitForTimeout(1500);
      assert(await page.evaluate(() => !document.getElementById('viewLogin').classList.contains('hidden')), '로그인 화면 아님');
      assert(await page.evaluate(() => !sessionStorage.getItem('svc_sess') && !localStorage.getItem('svc_sess')), '세션이 남음'); return 'OK';
    });
    await ctx.close();
  }
  // C) 로그인 화면에서 비밀번호 → 코드 → 입장
  {
    const { ctx, page } = await open({ noSession: true, extra: mfaExtra });
    await S.t('MFA: 로그인 화면 → 비밀번호 → 코드 → 입장', async () => {
      assert(await page.evaluate(() => !document.getElementById('viewLogin').classList.contains('hidden')), '로그인 화면 아님');
      await page.fill('#lsEmail', 'tester@example.com'); await page.fill('#lsPw', 'pw'); await page.click('#lsGo'); await page.waitForTimeout(800);
      assert(await page.$('#ovlMfa'), '코드 창 없음');
      await page.fill('#mfaCode', '123456'); await page.waitForTimeout(2500);
      assert(await page.evaluate(() => !document.getElementById('app').classList.contains('hidden') && !!window.DATA), '앱 미표시');
      assert(await page.evaluate(() => JSON.parse(sessionStorage.getItem('svc_sess')).a) === jwt('aal2'), 'aal2 세션 아님'); return 'OK';
    });
    await ctx.close();
  }
  // D) 등록하지 않은 계정은 영향 없음 (기본 mock: factors [])
  {
    const { ctx, page, errs } = await open({ token: jwt('aal1') });
    await S.t('MFA: 미등록 계정은 코드 창 없이 바로 입장', async () => { assert(!(await page.$('#ovlMfa')), '코드 창이 떴음'); assert(await page.evaluate(() => !!window.DATA), 'DATA 없음'); assert(!errs.length, errs.join(' | ')); });
    await ctx.close();
  }
}
// 10) 견적서 직인 — quote.html 이 비공개 Storage 에서 로그인 토큰으로 받아 <img> 에 넣는지 · 없으면 숨김
if (fs.existsSync(path.join(DIR, 'quote.html'))) {
  for (const has of [true, false]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const page = await ctx.newPage(); const c = collect(page); const got = [];
    await mockBackend(page, { extra: async (route, u, m) => { if (!u.includes('/storage/v1/object/authenticated/private/seal.jpg')) return false; got.push(route.request().headers()['authorization'] || ''); if (has) await route.fulfill({ status: 200, contentType: 'image/png', body: PNG1 }); else await route.fulfill({ status: 400, contentType: 'application/json', body: '{"message":"Object not found"}' }); return true; } });
    await page.goto(url + '/quote.html'); await page.waitForTimeout(1200);
    await S.t('직인(quote.html): Storage ' + (has ? '있음 → 표시' : '없음 → 숨김'), async () => {
      assert(!c.errs.length, c.errs.join(' | ')); assert(got.length === 1 && /^Bearer tok$/.test(got[0]), 'storage 요청 ' + JSON.stringify(got));
      const st = await page.$eval('#sealImg', (e) => ({ disp: e.style.display, src: e.getAttribute('src') || '' }));
      if (has) assert(st.disp === '' && /^blob:/.test(st.src), JSON.stringify(st)); else assert(st.disp === 'none', JSON.stringify(st));
      assert(!c.csp.length, c.csp.join(' | ')); return st.src.slice(0, 5) || 'hidden';
    });
    await ctx.close();
  }
}
await browser.close(); srv.close();
const ok = S.report();
fs.writeFileSync(path.join(OUT, 'smoke.json'), JSON.stringify(S.results, null, 1));
process.exit(ok ? 0 : 1);
