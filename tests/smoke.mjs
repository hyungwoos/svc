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
  const { ctx, page, errs } = await open({ extra: async (route, u, m) => {
    if (!u.includes('/functions/v1/ops')) return false;
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch { /* noop */ }
    opsCalls.push(body);
    const A = body.action; let out = { ok: true };
    if (A === 'status') out = { ok: true, pin_set: true, github: { repo: 'x/svc', branch: 'main', token_set: true }, mgmt_token_set: true, log_ok: true, recent: [] };
    else if (body.pin !== '1234') out = { ok: false, error: 'PIN 이 틀립니다' };
    else if (A === 'gh_put') out = { ok: true, commit: 'abc1234def', url: 'u', files: body.files.map((f) => f.path) };
    else if (A === 'gh_copy') out = { ok: true, commit: 'cafe0001', url: 'u', files: ['index.html'], note: 'n' };
    else if (A === 'sql_run') out = { ok: true, rows: [{ ok: 1, at: '2026-10-03T00:00:00' }], row_count: 1 };
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
await browser.close(); srv.close();
const ok = S.report();
fs.writeFileSync(path.join(OUT, 'smoke.json'), JSON.stringify(S.results, null, 1));
process.exit(ok ? 0 : 1);
