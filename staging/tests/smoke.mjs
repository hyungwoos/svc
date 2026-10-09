// 스모크 테스트 — 포탈이 "열리고 · 주요 화면이 그려지고 · 저장 동작이 올바른 요청을 보내는지" 를 가짜 백엔드로 확인
// 실행: node tests/smoke.mjs      (Playwright chromium 필요: npx playwright install --with-deps chromium)
// 환경: SMOKE_DIR=서빙할 폴더(기본 저장소 루트) · SMOKE_SHOT=1 이면 실패 화면을 tests/out/ 에 저장
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { ROOT, serve, mockBackend, collect, Suite, assert } from './lib.mjs';
import { FakeDB, fakeBackend, seedData, nowIdx, idxYm } from './fakedb.mjs';

const DIR = process.env.SMOKE_DIR || ROOT;
const OUT = path.join(ROOT, 'tests', 'out'); fs.mkdirSync(OUT, { recursive: true });
const { srv, url } = await serve(DIR);
const browser = await chromium.launch();
const S = new Suite('smoke');
const VIEWS = ['contracts', 'orders', 'assets', 'eqboard', 'oi', 'mdrops', 'live', 'churn', 'churnrate', 'custflow', 'leadsrc', 'dcheck', 'price', 'cloud', 'report', 'weekly', 'inbstat', 'account', 'adminx', 'ops', 'log'];
const VIEW_HOST = { contracts: '#viewData', orders: '#viewData', assets: '#viewData', eqboard: '#viewEqBoard', oi: '#viewData', mdrops: '#viewData', live: '#viewData', churn: '#viewChurn', churnrate: '#viewChurnRate', custflow: '#viewCustFlow', leadsrc: '#viewData', dcheck: '#viewData', price: '#viewPrice', cloud: '#viewCloud', report: '#viewReport', weekly: '#viewWeekly', inbstat: '#viewInb', account: '#viewAccount', adminx: '#viewAdmin', ops: '#viewOps', log: '#viewData' };

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
  await S.t('로그인 상태로 열림 · 오류 없음', async () => { assert(await page.evaluate(() => !document.getElementById('app').classList.contains('hidden') && !!SVC.ST.DATA), '#app 숨김 또는 DATA 없음'); assert(!errs.length, 'pageerror: ' + errs.join(' | ')); return await page.evaluate(() => SVC.APP_VER); });
  await S.t('홈: KPI 타일·인박스', async () => { const k = await page.$$eval('#kpis .kpi, #ccHeroHost .kpi', (e) => e.length); const ib = await page.$$eval('#ccInbox .ib-row, #ccInbox .ib-empty', (e) => e.length); assert(k >= 4, 'kpi ' + k); assert(ib >= 1, 'inbox ' + ib); return { kpi: k, inbox: ib }; });
  await S.t('CSP 위반 없음(콘솔)', async () => { assert(!csp.length, csp.slice(0, 3).join(' | ')); });
  for (const v of VIEWS) {
    await S.t('화면 ' + v, async () => {
      const before = errs.length;
      await page.evaluate((v) => SVC.switchView(v), v); await page.waitForTimeout(350);
      const cur = await page.evaluate(() => SVC.ST.CUR_VIEW); assert(cur === v, 'CUR_VIEW=' + cur);
      const host = VIEW_HOST[v]; const vis = await page.$eval(host, (e) => !e.classList.contains('hidden')); assert(vis, host + ' 숨김');
      if (errs.length > before) throw new Error(errs.slice(before).join(' | '));
    });
  }
  await S.t('뒤로가기(←) 동작', async () => { await page.evaluate(() => SVC.switchView('dash')); await page.evaluate(() => SVC.switchView('contracts')); await page.evaluate(() => SVC.switchView('oi')); await page.waitForTimeout(200); await page.evaluate(() => SVC.goBack()); await page.waitForTimeout(400); const v = await page.evaluate(() => SVC.ST.CUR_VIEW); assert(v === 'contracts', 'back → ' + v); });
  await S.t('만기 처리 창 열림', async () => { await page.evaluate(() => SVC.openRenewList('due')); await page.waitForTimeout(200); assert(await page.evaluate(() => document.getElementById('ovlRenew').classList.contains('on')), 'ovlRenew 닫힘'); const tabs = await page.$$eval('#rnTabs button', (b) => b.length); assert(tabs === 3, 'tabs ' + tabs); await page.evaluate(() => SVC.closeOvl('ovlRenew')); });
  await S.t('AI 요약(buildDigest) 생성', async () => { const d = await page.evaluate(() => { const D = SVC.buildDigest(); return { live: D.LIVE고객사수, keys: Object.keys(D).length, renew: !!D.만기관리 }; }); assert(d.keys > 10 && d.renew, JSON.stringify(d)); return d; });
  await S.t('데이터 점검: 규칙 카드 · 요약 · 항목 → 바로가기', async () => {
    await page.keyboard.press('Escape'); await page.evaluate(() => SVC.switchView('dcheck')); await page.waitForTimeout(400);
    const n = await page.$$eval('#bizHost .dc-rule', (e) => e.length); assert(n >= 18, '규칙 ' + n);
    const sum = await page.evaluate(() => SVC.dcSummary()); assert(typeof sum.crit === 'number' && typeof sum.warn === 'number', 'dcSummary');
    const withItems = await page.$$eval('#bizHost .dc-rule', (e) => e.filter((x) => !/이상 없음/.test(x.textContent)).map((x) => x.querySelector('[data-dc]').dataset.dc));
    if (withItems.length) {
      await page.click('#bizHost [data-dc="' + withItems[0] + '"]'); await page.waitForTimeout(200);
      const links = await page.$$('#bizHost [data-dcgo]'); assert(links.length >= 1, '항목 링크 없음');
      await links[0].click(); await page.waitForTimeout(400);
      assert(await page.evaluate(() => SVC.ST.CUR_VIEW !== 'dcheck' || !!document.getElementById('ovlDcFix') || document.getElementById('ovlRenew').classList.contains('on')), '항목 → 수정 창/바로가기 안 됨 (' + withItems[0] + ')');
      await page.evaluate(() => { try { SVC.dcFixClose(); } catch (e) { /* */ } });
    }
    const dig = await page.evaluate(() => SVC.buildDigest().데이터점검); assert(dig && '바로고침' in dig, 'digest 데이터점검 없음');
    return { rules: n, crit: sum.crit, warn: sum.warn, info: sum.info, first: withItems[0] || '-' };
  });
  await S.t('Ctrl+K 검색 열림', async () => { await page.keyboard.press('Control+k'); await page.waitForTimeout(200); assert(await page.evaluate(() => document.getElementById('ovlFind').classList.contains('on')), 'ovlFind 닫힘'); await page.keyboard.press('Escape'); });
  if (S.failed.length) await shot(page, 'smoke_fail_main');
  await ctx.close();
}
// 2) 저장 동작 — 계약 연장이 올바른 요청(PATCH + DELETE + POST 12행 + change_log)을 보내는지
{
  const writes = [];
  const { ctx, page, errs } = await open({ onWrite: (w) => writes.push(w) });
  await S.t('만기 처리 › 연장 저장 요청 모양', async () => {
    const r = await page.evaluate(async () => { const S = SVC.renewScan(); const row = S.due[0] || S.next[0] || S.lapsed[0] || SVC.ST.DATA.rows.filter((x) => x.endRaw != null && !x.parent)[0]; if (!row) return null; const ne = row.endRaw + 12; const res = await SVC.doRenew(row, ne, row.mrr || 100000, 'smoke'); return { id: row._id, ne, rno: res.rno }; });
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
    const r = await page.evaluate(async () => { let blocked = false; try { await SVC.sbWrite('PATCH', 'contracts?id=eq.1', { note: 'x' }); } catch (e) { blocked = /권한/.test(String(e.message || e)); } return { blocked, opsMenu: document.querySelector('#side button[data-v="ops"]').style.display !== 'none', isViewer: !!SVC.ST.IS_VIEWER_ROLE }; });
    assert(r.blocked, '쓰기가 차단되지 않음'); assert(!r.opsMenu, 'ops 메뉴 보임'); assert(r.isViewer, 'IS_VIEWER_ROLE false'); return r;
  });
  await ctx.close();
}
// 4) 위성 페이지 — 세션 인식 · 오류 없음
for (const f of ['quote.html', 'report.html', 's1.html', 'kk.html']) {
  if (!fs.existsSync(path.join(DIR, f))) { console.log('  · ' + f + ' 없음(건너뜀)'); continue; }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const page = await ctx.newPage(); const c = collect(page);
  await mockBackend(page); await page.goto(url + '/' + f); await page.waitForTimeout(1500);
  await S.t('위성 ' + f + ' 로드', async () => { assert(!c.errs.length, c.errs.join(' | ')); assert(!c.csp.length, 'CSP 위반: ' + c.csp.join(' | ')); const title = await page.title(); assert(title, '제목 없음'); return title.slice(0, 40); });
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
  const opsWrites = [];
  const { ctx, page, errs } = await open({ onWrite: (w) => opsWrites.push(w), extra: async (route, u, m) => {
    if (m === 'GET' && u.includes('/rest/v1/ai_check_log')) { await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-1/2', 'Access-Control-Expose-Headers': 'content-range' }, body: JSON.stringify([{ run_at: '2026-10-03T18:00:00', source: 'cron', pass: 11, total: 12, avg_ms: 8200, model: 'claude-sonnet-5', fails: [{ q: '다음 달 만기 계약 몇 건이야?', why: '기대값 없음' }] }, { run_at: '2026-10-02T09:00:00', source: 'portal', pass: 15, total: 15, avg_ms: 9100, model: 'claude-sonnet-5', fails: [] }]) }); return true; }
    if (m === 'GET' && u.includes('/rest/v1/ai_feedback')) { await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-1/2', 'Access-Control-Expose-Headers': 'content-range' }, body: JSON.stringify([{ created_at: '2026-10-03T10:00:00', email: 'tester@example.com', verdict: 'down', question: '에스원 MRR?', answer_head: '자료 없음', note: '숫자가 빠짐' }, { created_at: '2026-10-03T09:00:00', email: 'tester@example.com', verdict: 'up', question: 'LIVE 몇 곳?', answer_head: '357곳', note: null }]) }); return true; }
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
  await page.evaluate(() => SVC.switchView('ops')); await page.waitForTimeout(500);
  await S.t('배포·운영: 스테이징 대상 + 폴더 경로 유지 커밋', async () => {
    await page.fill('#opsPin', '1234');
    await page.click('#opsTarget button[data-tg="staging"]'); await page.waitForTimeout(150);
    await page.evaluate(() => { SVC.OPS.files = [{ path: 'tests/smoke.mjs', size: 10, content: '// x' }, { path: 'index.html', size: 60, content: "<script>var APP_VER='2026-09-16 ㊿+999';</script>", ver: '2026-09-16 ㊿+999' }]; SVC.renderOps(true); });
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
  await S.t('배포·운영: AI 15문 점검 실행(가짜 ask) · 요약 · change_log', async () => {
    const before = opsCalls.length;
    await page.click('#opsAiCheck'); await page.waitForTimeout(2500);
    const n = await page.$$eval('#opsBody table tbody tr td:first-child', (t) => t.filter((x) => /^\d+$/.test(x.textContent.trim())).length); assert(n === 15, '질문 행 ' + n);
    const sum = await page.evaluate(() => SVC.OPS.aic && SVC.OPS.aic.summary); assert(sum && sum.total === 15 && typeof sum.pass === 'number', 'summary ' + JSON.stringify(sum));
    assert(await page.$('#opsAiXlsx'), '엑셀 버튼 없음');
    const lg = opsWrites.filter((w) => /ai_check_log/.test(w.url) && w.m === 'POST')[0]; assert(lg, 'ai_check_log POST 없음');
    const lb = JSON.parse(lg.body); assert(lb.source === 'portal' && lb.total === 15 && Array.isArray(lb.rows) && lb.rows.length === 15 && Array.isArray(lb.fails), JSON.stringify(lb).slice(0, 160));
    return sum.pass + '/' + sum.total + ' (mock 답이라 대부분 미통과가 정상)';
  });
  await S.t('배포·운영 › 기록: AI 점검 추이(수동+자동) · 👎 피드백 목록', async () => {
    await page.waitForTimeout(600);
    const t = await page.evaluate(() => { const h = document.getElementById('opsBody').innerText; return { trend: /AI 점검 추이/.test(h), auto: /🌙 자동/.test(h) && /11\/12/.test(h), manual: /🧑 수동/.test(h) && /15\/15/.test(h), fb: /답변 피드백/.test(h) && /숫자가 빠짐/.test(h) && /👍 1 · 👎 1/.test(h) }; });
    assert(t.trend && t.auto && t.manual && t.fb, JSON.stringify(t)); assert(!errs.length, errs.join(' | ')); return JSON.stringify(t);
  });
  await ctx.close();
}
// ⑤ UX 2단계 · ⑥ AI 2단계 (㊿+139): 동작 열 여백 · 설명 접기 · ❔ 화면 도움말 · ? 단축키 · aria-label · 👍/👎 피드백
{
  const writes = [];
  const { ctx, page, errs } = await open({ onWrite: (w) => writes.push(w) });
  await S.t('표 동작 열: 가로로 넘칠 때만 마지막 데이터 열에 여백(act-pad)', async () => {
    const check = async (v) => { await page.evaluate((v) => SVC.switchView(v), v); await page.waitForTimeout(300); return page.evaluate(() => { const t = document.getElementById('dvTable'), w = t.parentElement; return { over: w.scrollWidth > w.clientWidth + 2, pad: t.classList.contains('act-pad'), actw: t.style.getPropertyValue('--actw'), hasAct: !!t.querySelector('thead th.act') }; }); };
    const a = await check('contracts'); assert(!a.hasAct || a.pad === a.over, 'contracts ' + JSON.stringify(a)); if (a.pad) assert(/^\d+px$/.test(a.actw), 'actw ' + a.actw);
    await page.setViewportSize({ width: 900, height: 900 }); await page.waitForTimeout(400);
    const b = await check('orders'); assert(b.hasAct && b.over && b.pad && /^\d+px$/.test(b.actw), '900px orders ' + JSON.stringify(b));
    const padPx = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#dvTable thead th:nth-last-child(2)')).paddingRight)); assert(padPx >= parseFloat(b.actw) + 10, '여백 ' + padPx + ' vs ' + b.actw);
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.waitForTimeout(400);
    return JSON.stringify({ wide: a.pad, narrow: b.pad, actw: b.actw });
  });
  await S.t('표 설명 접기: 긴 cap → 첫 문장 + «도움말 ▾» → 펼침 기억', async () => {
    await page.evaluate(() => { try { localStorage.removeItem('svc_capopen_orders'); } catch (e) { /* noop */ } SVC.switchView('orders'); }); await page.waitForTimeout(300);
    const a = await page.evaluate(() => ({ len: document.querySelector('#dvCap .cap-head').textContent.length, btn: (document.querySelector('#dvCap .cap-more') || {}).textContent }));
    assert(a.len < 120 && /도움말/.test(a.btn), JSON.stringify(a));
    await page.click('#dvCap .cap-more'); await page.waitForTimeout(100);
    const b = await page.evaluate(() => ({ len: document.querySelector('#dvCap .cap-head').textContent.length, btn: document.querySelector('#dvCap .cap-more').textContent, saved: localStorage.getItem('svc_capopen_orders') }));
    assert(b.len > a.len + 40 && /접기/.test(b.btn) && b.saved === '1', JSON.stringify(b));
    await page.evaluate(() => { SVC.switchView('assets'); SVC.switchView('orders'); }); await page.waitForTimeout(300);
    const c = await page.evaluate(() => /접기/.test(document.querySelector('#dvCap .cap-more').textContent)); assert(c, '펼침 상태 기억 안 됨');
    const d = await page.evaluate(() => { SVC.switchView('contracts'); return document.querySelector('#dvCap .cap-more'); }); assert(!d, '짧은 cap 에 버튼이 생김');
    return a.len + '→' + b.len;
  });
  await S.t('❔ 이 화면 사용법 → 홈 AI 질문 · ? 단축키 안내 · Esc 닫기', async () => {
    await page.evaluate(() => SVC.switchView('orders')); await page.waitForTimeout(200);
    await page.click('#dvHelp'); await page.waitForTimeout(900);
    const st = await page.evaluate(() => ({ v: SVC.ST.CUR_VIEW, on: document.getElementById('answer').classList.contains('on'), title: document.getElementById('ansTitle').textContent, say: document.getElementById('aiSay').textContent }));
    assert(st.v === 'dash' && st.on && /화면/.test(st.title) && /mock/.test(st.say), JSON.stringify(st).slice(0, 200));
    await page.keyboard.press('Shift+?'); await page.waitForTimeout(150);
    let on = await page.evaluate(() => document.getElementById('ovlKeys').classList.contains('on')); assert(on, '? 로 단축키 창이 안 열림');
    const kbd = await page.$$eval('#ovlKeys kbd', (e) => e.length); assert(kbd >= 8, 'kbd ' + kbd);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    on = await page.evaluate(() => document.getElementById('ovlKeys').classList.contains('on')); assert(!on, 'Esc 로 안 닫힘');
    await page.focus('#q'); await page.keyboard.press('Shift+?'); await page.waitForTimeout(100);
    on = await page.evaluate(() => document.getElementById('ovlKeys').classList.contains('on')); const qv = await page.$eval('#q', (e) => e.value); assert(!on && qv === '?', '입력칸에서 ? 가 창을 열었음 / 입력값 ' + qv);
    await page.fill('#q', '');
    assert(!errs.length, errs.join(' | ')); return st.title.slice(0, 30);
  });
  await S.t('접근성: 아이콘 버튼 aria-label · focus-visible 규칙', async () => {
    const miss = await page.$$eval('.topbar button, .dbar button, #viewOps button', (bs) => bs.filter((b) => { const t = (b.textContent || '').replace(/\s/g, ''); return b.offsetParent !== null && !b.getAttribute('aria-label') && !b.title && t.length <= 2; }).map((b) => b.id || b.className || b.textContent));
    assert(miss.length === 0, '라벨 없는 아이콘 버튼 ' + JSON.stringify(miss));
    const named = await page.$$eval('#btnTheme,#btnReload,#btnFont,#btnFind,#dvHelp', (e) => e.every((b) => b.getAttribute('aria-label'))); assert(named, 'aria-label 누락');
    const fv = await page.evaluate(() => [...document.styleSheets].some((ss) => { try { return [...ss.cssRules].some((r) => /focus-visible/.test(r.selectorText || '')); } catch (e) { return false; } })); assert(fv, 'focus-visible 규칙 없음');
    return 'ok';
  });
  await S.t('AI 답 👍/👎 → ai_feedback POST (본인 이메일 · 👎 메모)', async () => {
    page.on('dialog', (d) => d.accept('숫자가 빠졌어요'));
    await page.evaluate(() => { SVC.switchView('dash'); SVC.ask('LIVE 고객사 몇 곳이야?'); }); await page.waitForTimeout(900);
    const fb = await page.$$('#aiSay .ai-fb button'); assert(fb.length === 2, '피드백 버튼 ' + fb.length);
    writes.length = 0; await fb[0].click(); await page.waitForTimeout(400);
    const up = writes.filter((w) => /ai_feedback/.test(w.url) && w.m === 'POST')[0]; assert(up, '👍 POST 없음 ' + JSON.stringify(writes.map((w) => w.url.split('/rest/v1/')[1])));
    const ub = JSON.parse(up.body); assert(ub.verdict === 'up' && ub.email === 'tester@example.com' && /LIVE/.test(ub.question) && ub.answer_head && ub.app_ver, JSON.stringify(ub).slice(0, 200));
    const pressed = await page.evaluate(() => [...document.querySelectorAll('#aiSay .ai-fb button')].map((b) => b.getAttribute('aria-pressed') + ':' + b.disabled)); assert(pressed[0] === 'true:true' && pressed[1] === 'false:true', JSON.stringify(pressed));
    await page.evaluate(() => SVC.ask('에스원 MRR 은?')); await page.waitForTimeout(900);
    writes.length = 0; const fb2 = await page.$$('#aiSay .ai-fb button'); await fb2[1].click(); await page.waitForTimeout(400);
    const dn = writes.filter((w) => /ai_feedback/.test(w.url) && w.m === 'POST')[0]; assert(dn, '👎 POST 없음');
    const db = JSON.parse(dn.body); assert(db.verdict === 'down' && db.note === '숫자가 빠졌어요', JSON.stringify(db).slice(0, 200));
    assert(!errs.length, errs.join(' | ')); return ub.verdict + ' / ' + db.verdict + ' «' + db.note + '»';
  });
  if (S.failed.length) await shot(page, 'smoke_fail_ux2');
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
  await S.t('스테이징: STAGING 띠 · 배포 기본 대상 스테이징', async () => { assert(!c.errs.length, c.errs.join(' | ')); assert(await page.$('#stagingBar'), '띠 없음'); /* ㊿+153: staging/ 은 다음 버전일 수 있음 — 모듈 전환 뒤 포탈 이름은 window.SVC 에(예전 버전은 window 에 바로) */
    assert(await page.evaluate(() => { const W = window.SVC || window; return W.IS_STAGING && /STAGING/.test(document.title); }), 'IS_STAGING/title'); await page.evaluate(() => (window.SVC || window).switchView('ops'));
    await page.waitForFunction(() => { const W = window.SVC || window; return W.OPS && W.OPS.target; }, null, { timeout: 8000 }).catch(() => null);   /* 관리자 코드는 처음 열 때 받음 */
    assert(await page.evaluate(() => (window.SVC || window).OPS.target === 'staging'), 'target ' + await page.evaluate(() => ((window.SVC || window).OPS || {}).target)); });
  await ctx.close();
} else console.log('  · staging/ 없음(건너뜀)');
// 9) 2단계 인증(MFA) — 등록된 계정: 저장된 aal1 세션 → 코드 창 → aal2 세션 교체 · 취소 · 로그인 화면 흐름 · 내 계정 카드(끄기·켜기)
{
  const authCalls = []; let factors = [{ id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'SVC 포탈 2026-10-03', created_at: '2026-10-03T00:00:00Z' }];
  let policy = { required: false, deadline: null };   // SQL 89 mfa_policy 흉내
  const today = new Date().toISOString().slice(0, 10); const adminCalls = [];
  const mfaExtra = async (route, u, m) => {
    const J = async (o, st = 200) => { await route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(o) }); return true; };
    const auth = route.request().headers()['authorization'] || ''; const path = u.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const user = { id: 'u1', email: 'tester@example.com', user_metadata: { pw_changed: true }, factors };
    const enrolled = factors.some((f) => f.status === 'verified'), aal2 = auth.includes(jwt('aal2'));
    const mfaOk = aal2 || (enrolled ? false : !(policy.required && (!policy.deadline || policy.deadline <= today)));
    if (path === '/rest/v1/rpc/mfa_status') return J({ email: 'tester@example.com', aal: aal2 ? 'aal2' : 'aal1', enrolled, required: policy.required, deadline: policy.deadline, today, ok: mfaOk });
    if (path === '/rest/v1/rpc/mfa_admin_list') return J([{ email: 'a@example.com', role: 'admin', enrolled: true, factor_at: '2026-10-01T00:00:00Z', required: true, deadline: null, note: null }, { email: 'b@example.com', role: 'admin_viewer', enrolled: false, required: false, deadline: null, note: null }, { email: 'tester@example.com', role: 'super_admin', enrolled, required: policy.required, deadline: policy.deadline, note: null }]);
    if (path === '/rest/v1/rpc/mfa_admin_set' || path === '/rest/v1/rpc/mfa_admin_reset') { const b = JSON.parse(route.request().postData() || '{}'); adminCalls.push({ fn: path.split('/').pop(), ...b }); return J(path.endsWith('reset') ? { email: b.p_email, deleted: 1 } : { email: b.p_email, required: b.p_required, deadline: b.p_deadline }); }
    if (u.includes('/rpc/load_all') && !mfaOk) { authCalls.push('load_all:blocked'); return J({}); }   // SQL 88/89 흉내: mfa_ok 가 false 면 데이터 없음
    if (path === '/auth/v1/user') { authCalls.push('user'); return J(user); }
    let mm = /^\/auth\/v1\/factors\/([^/]+)\/(challenge|verify)$/.exec(path);
    if (mm && m === 'POST') {
      if (mm[2] === 'challenge') { authCalls.push('challenge:' + mm[1]); return J({ id: 'c-' + mm[1], expires_at: 9999999999 }); }
      const b = JSON.parse(route.request().postData() || '{}'); authCalls.push('verify:' + mm[1] + ':' + b.code);
      if (b.code === '123456' && b.challenge_id === 'c-' + mm[1]) { factors = factors.map((f) => f.id === mm[1] ? { ...f, status: 'verified' } : f); return J({ access_token: jwt('aal2'), refresh_token: 'r2', expires_in: 3600, token_type: 'bearer', user }); }
      return J({ msg: 'Invalid TOTP code entered', code: 422 }, 422);
    }
    if (path === '/auth/v1/factors' && m === 'POST') { authCalls.push('enroll'); factors = factors.concat([{ id: 'f2', factor_type: 'totp', status: 'unverified', friendly_name: 'SVC 포탈', created_at: '2026-10-03T01:00:00Z' }]); return J({ id: 'f2', type: 'totp', friendly_name: 'SVC 포탈', totp: { qr_code: '<?xml version="1.0"?>\n<svg width="10" height="10" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><rect x="0" y="0" width="10" height="10" style="fill:white;stroke:none"/><rect x="2" y="2" width="6" height="6" style="fill:#000;stroke:none"/></svg>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' } }); }
    mm = /^\/auth\/v1\/factors\/([^/]+)$/.exec(path);
    if (mm && m === 'DELETE') { authCalls.push('unenroll:' + mm[1]); factors = factors.filter((f) => f.id !== mm[1]); return J({ id: mm[1] }); }
    if (u.includes('grant_type=password')) { authCalls.push('password'); return J({ access_token: jwt('aal1'), refresh_token: 'r1', expires_in: 3600, token_type: 'bearer', user }); }
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
      assert(!(await page.$('#ovlMfa')), '코드 창이 남음'); assert(await page.evaluate(() => !document.getElementById('app').classList.contains('hidden') && !!SVC.ST.DATA), '앱 미표시');
      const sess = await page.evaluate(() => JSON.parse(sessionStorage.getItem('svc_sess'))); assert(sess.a === jwt('aal2') && sess.r === 'r2', 'aal2 세션 저장 안 됨');
      assert(authCalls.includes('challenge:f1') && authCalls.includes('verify:f1:000000') && authCalls.includes('verify:f1:123456'), authCalls.join(','));
      assert(!errs.length, errs.join(' | ')); return authCalls.filter((x) => !/^user|^load_all/.test(x)).join(' → ');
    });
    await S.t('MFA: 내 계정 › 보안 카드 — 켜짐 표시 → 끄기 → 켜기(QR·코드)', async () => {
      page.on('dialog', (d) => d.accept());
      await page.evaluate(() => SVC.switchView('account')); await page.waitForTimeout(700);
      let t = await page.$eval('#accMfa', (e) => e.textContent); assert(/켜짐/.test(t) && /2단계 확인됨/.test(t), '카드: ' + t.slice(0, 80));
      await page.click('#mfaOff'); await page.waitForTimeout(600);
      t = await page.$eval('#accMfa', (e) => e.textContent); assert(/꺼짐/.test(t), '끈 뒤: ' + t.slice(0, 80)); assert(authCalls.includes('unenroll:f1'), 'DELETE f1 없음');
      await page.click('#mfaOn'); await page.waitForTimeout(600);
      assert(await page.$('#accMfa img[alt="인증 앱 등록 QR"]'), 'QR 없음');
      await page.waitForTimeout(200); const qr = await page.$eval('#accMfa img[alt="인증 앱 등록 QR"]', (e) => ({ ok: e.complete && e.naturalWidth > 0, src: e.getAttribute('src').slice(0, 40) })); assert(qr.ok && /^data:image\/svg\+xml;charset=utf-8,/.test(qr.src), 'QR 이미지가 깨짐(GoTrue 원문 SVG 미정규화): ' + qr.src); assert(/JBSWY3DPEHPK3PXP/.test(await page.$eval('#accMfa', (e) => e.textContent)), '수동 키 없음');
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
      assert(await page.evaluate(() => !document.getElementById('app').classList.contains('hidden') && !!SVC.ST.DATA), '앱 미표시');
      assert(await page.evaluate(() => JSON.parse(sessionStorage.getItem('svc_sess')).a) === jwt('aal2'), 'aal2 세션 아님'); return 'OK';
    });
    await ctx.close();
  }
  // D) 등록하지 않은 계정은 영향 없음 (기본 mock: factors [])
  {
    const { ctx, page, errs } = await open({ token: jwt('aal1') });
    await S.t('MFA: 미등록 계정은 코드 창 없이 바로 입장', async () => { assert(!(await page.$('#ovlMfa')), '코드 창이 떴음'); assert(await page.evaluate(() => !!SVC.ST.DATA), 'DATA 없음'); assert(!errs.length, errs.join(' | ')); });
    await ctx.close();
  }
  // E) 관리자가 필수(즉시) 지정 + 미등록 → 등록 강제 창 → QR·코드 → aal2 입장
  {
    factors = []; policy = { required: true, deadline: null };
    const { ctx, page, errs } = await open({ token: jwt('aal1'), extra: mfaExtra });
    await S.t('MFA 강제: 필수(즉시)·미등록 → 등록 창 → 등록 → 입장', async () => {
      assert(await page.$('#ovlMfa #mfaForceHost'), '강제 등록 창 없음'); assert(await page.evaluate(() => document.getElementById('app').classList.contains('hidden')), '등록 전에 앱이 열림');
      await page.waitForTimeout(500); assert(await page.$('#mfaForceHost img[alt="인증 앱 등록 QR"]'), 'QR 없음'); assert(!(await page.$eval('#mfaEnCancel', (e) => e.offsetParent !== null)), '안쪽 취소 버튼이 보임');
      await page.fill('#mfaEnCode', '123456'); await page.click('#mfaEnGo'); await page.waitForTimeout(2500);
      assert(!(await page.$('#ovlMfa')), '창이 남음'); assert(await page.evaluate(() => !document.getElementById('app').classList.contains('hidden') && !!SVC.ST.DATA), '앱 미표시');
      assert(await page.evaluate(() => JSON.parse(sessionStorage.getItem('svc_sess')).a) === jwt('aal2'), 'aal2 세션 아님'); assert(!errs.length, errs.join(' | '));
      return authCalls.filter((x) => /enroll|verify:f2/.test(x)).join(' → ');
    });
    await S.t('MFA 강제: 관리자 › 2단계 인증 정책 — 목록 · 필수 지정 저장 · 초기화', async () => {
      page.on('dialog', (d) => d.accept());
      await page.evaluate(async () => { await SVC.lazyLoad('admin'); SVC.switchView('adminx'); SVC.admTab('sec'); }); await page.waitForTimeout(900);
      const rows = await page.$$eval('#mfTable tbody tr', (t) => t.length); assert(rows === 3, 'rows ' + rows);
      assert(/차단 중|유예|등록/.test(await page.$eval('#mfTable', (e) => e.textContent)), '상태 표기 없음');
      await page.check('#mfTable [data-mf-req="b@example.com"]'); await page.waitForTimeout(100);
      const dl = await page.$eval('#mfTable [data-mf-dl="b@example.com"]', (e) => ({ v: e.value, dis: e.disabled })); assert(!dl.dis && /^\d{4}-\d{2}-\d{2}$/.test(dl.v), '기한 자동 입력 안 됨 ' + JSON.stringify(dl));
      await page.fill('#mfTable [data-mf-note="b@example.com"]', '테스트'); await page.click('#mfTable [data-mf-save="b@example.com"]'); await page.waitForTimeout(600);
      const set = adminCalls.find((c) => c.fn === 'mfa_admin_set'); assert(set && set.p_email === 'b@example.com' && set.p_required === true && set.p_deadline === dl.v && set.p_note === '테스트', JSON.stringify(set));
      await page.click('#mfTable [data-mf-reset="a@example.com"]'); await page.waitForTimeout(600);
      const rs = adminCalls.find((c) => c.fn === 'mfa_admin_reset'); assert(rs && rs.p_email === 'a@example.com', JSON.stringify(rs)); return adminCalls.map((c) => c.fn).join(',');
    });
    await ctx.close();
  }
  // F) 필수지만 기한이 남음 → 들어가되 안내 토스트
  {
    factors = []; const dl = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10); policy = { required: true, deadline: dl };
    const { ctx, page } = await open({ token: jwt('aal1'), extra: mfaExtra });
    await S.t('MFA 강제: 유예 기간 → 입장 + 안내 토스트', async () => {
      assert(!(await page.$('#ovlMfa')), '창이 떴음'); assert(await page.evaluate(() => !!SVC.ST.DATA), 'DATA 없음');
      const t = await page.$$eval('#toasts .toast', (e) => e.map((x) => x.textContent).join(' | ')); assert(/2단계 인증 등록이 필요/.test(t) && t.includes(dl), '토스트: ' + t.slice(0, 120));
      await page.evaluate(() => SVC.switchView('account')); await page.waitForTimeout(700);
      assert(/관리자 지정: 필수/.test(await page.$eval('#accMfa', (e) => e.textContent)), '카드에 필수 표시 없음'); return dl;
    });
    await ctx.close();
    policy = { required: false, deadline: null };
  }
  // G) ㊿+145 빠른 길: 지난번 «인증 앱 없음»(m:'none')으로 기억된 세션인데 그사이 다른 기기에서 등록 → 데이터 읽기 먼저 → 뒤 확인에서 코드 창 → 맞으면 새로고침
  {
    factors = [{ id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'x', created_at: '2026-10-03T00:00:00Z' }];
    const seq = []; const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await ctx.newPage();
    await mockBackend(page, { token: jwt('aal1'), extra: async (route, u, m) => { seq.push(u.replace(/^https?:\/\/[^/]+/, '').split('?')[0]); return mfaExtra(route, u, m); } });
    await page.addInitScript(() => { try { const s = JSON.parse(sessionStorage.getItem('svc_sess')); s.m = 'none'; sessionStorage.setItem('svc_sess', JSON.stringify(s)); } catch (e) { /* noop */ } });
    await page.goto(url + '/index.html'); await page.waitForTimeout(1800);
    await S.t('MFA 빠른 길(㊿+145): 기억된 «없음»이 틀려도 뒤 확인에서 코드 창 → 맞으면 새로고침', async () => {
      const iLoad = seq.indexOf('/rest/v1/rpc/load_all'), iUser = seq.indexOf('/auth/v1/user');
      assert(iLoad >= 0 && iUser >= 0 && iLoad < iUser, '데이터를 먼저 읽지 않음: ' + seq.slice(0, 8).join(','));
      assert(await page.$('#ovlMfa #mfaCode'), '뒤 확인에서 코드 창이 안 뜸');
      assert(await page.evaluate(() => (JSON.parse(sessionStorage.getItem('svc_sess')) || {}).m === ''), '«없음» 표시를 지우지 않음');
      const nav = page.waitForEvent('framenavigated', { timeout: 6000 });
      await page.fill('#mfaCode', '123456'); await nav;
      assert(authCalls.includes('verify:f1:123456'), authCalls.join(',')); return seq.slice(0, 5).join(' → ');
    });
    await ctx.close();
  }
  // H) ㊿+145 빠른 길: 로그인 응답에 확인된 인증 앱이 없으면 데이터 읽기와 인증 확인을 함께 → 확인 결과 «없음»을 세션에 기억
  {
    factors = []; const seq = [];
    const { ctx, page, errs } = await open({ noSession: true, extra: async (route, u, m) => { seq.push(u.replace(/^https?:\/\/[^/]+/, '').split('?')[0]); return mfaExtra(route, u, m); } });
    await S.t('MFA 빠른 길(㊿+145): 로그인 → 데이터 먼저 · 확인은 뒤에서 · m=none 기억', async () => {
      seq.length = 0;
      await page.fill('#lsEmail', 'tester@example.com'); await page.fill('#lsPw', 'pw'); await page.click('#lsGo'); await page.waitForTimeout(2000);
      const iLoad = seq.indexOf('/rest/v1/rpc/load_all'), iUser = seq.indexOf('/auth/v1/user'), iPol = seq.indexOf('/rest/v1/rpc/mfa_status');
      assert(iLoad >= 0 && iLoad < iUser && iLoad < iPol, '순서: ' + seq.join(','));
      assert(!(await page.$('#ovlMfa')), '코드 창이 뜸'); assert(await page.evaluate(() => !!SVC.ST.DATA && SVC.ST.CUR_VIEW === 'dash'), '대시보드 아님');
      assert(await page.evaluate(() => JSON.parse(sessionStorage.getItem('svc_sess')).m) === 'none', 'm 표시 없음');
      assert(!errs.length, errs.join(' | ')); return seq.slice(0, 6).join(' → ');
    });
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
// 코드 목록 (code_lists · SQL 93 · ㊿+137): 표 → *_OPTS 갱신 · 관리자 › 코드 관리 · 데이터 점검 병합·mrr 채우기
{
  const CODE_ROWS = [
    { kind: 'channel', value: '일반', label: null, sort: 1, active: true }, { kind: 'channel', value: '조달', label: null, sort: 2, active: true }, { kind: 'channel', value: '에스원', label: null, sort: 3, active: true },
    { kind: 'channel', value: 'LGU+', label: null, sort: 4, active: true }, { kind: 'channel', value: '유통', label: null, sort: 5, active: true }, { kind: 'channel', value: '테스트채널', label: null, sort: 6, active: true, note: 'smoke' },
    { kind: 'channel', value: '옛채널', label: null, sort: 99, active: false },
    { kind: 'order_status', value: '접수', sort: 1, active: true }, { kind: 'order_status', value: '출하요청', sort: 2, active: true }, { kind: 'order_status', value: '배송중', sort: 3, active: true }, { kind: 'order_status', value: '설치완료', sort: 4, active: true }, { kind: 'order_status', value: '회수예정', sort: 5, active: true }, { kind: 'order_status', value: '회수완료', sort: 6, active: true }, { kind: 'order_status', value: '취소', sort: 7, active: true },
    { kind: 'model', value: 'S100', sort: 1, active: true }, { kind: 'model', value: 'S200', sort: 2, active: true }, { kind: 'model', value: 'S10_R2', sort: 3, active: true }, { kind: 'model', value: 'S20_R2', sort: 4, active: true }, { kind: 'model', value: 'S30H_R1', sort: 5, active: true }, { kind: 'model', value: 'ES30', sort: 6, active: true }, { kind: 'model', value: 'S900', sort: 7, active: true, note: 'smoke' },
    { kind: 'line', value: 'Cloud', label: 'Cloud NAC', sort: 1, active: true }, { kind: 'line', value: 'S1', label: 'S1 Cloud NAC', sort: 2, active: true }, { kind: 'line', value: 'MDR', label: 'MDR', sort: 3, active: true }, { kind: 'line', value: 'MDR_S1', label: 'S1 MDR', sort: 4, active: true }, { kind: 'line', value: 'DRM', label: 'DRM', sort: 5, active: true }, { kind: 'line', value: 'PNS', label: 'PNS', sort: 6, active: true }, { kind: 'line', value: 'DLP', label: 'DLP', sort: 7, active: true },
  ];
  const writes = []; let rwRows = null;   // rwRows: renew_watch 가짜 응답(테스트 중 바꿈 · null 이면 기본 [] 응답)
  const { ctx, page, errs } = await open({ onWrite: (w) => writes.push(w), extra: async (route, u, m) => {
    if (u.includes('/rpc/renew_watch') && rwRows) { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rwRows) }); return true; }
    if (!u.includes('/rest/v1/code_lists') || m !== 'GET') return false;
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-27/28', 'Access-Control-Expose-Headers': 'content-range' }, body: JSON.stringify(CODE_ROWS) }); return true;
  } });
  page.on('dialog', (d) => d.accept());
  await S.t('코드 목록: code_lists → CH_OPTS·MODEL_OPTS 갱신 · 숨긴 값 제외 · 폼 select 반영', async () => {
    const st = await page.evaluate(() => ({ ch: SVC.CH_OPTS.slice(), model: SVC.MODEL_OPTS.slice(), ordCh: SVC.ORD_CH_OPTS.slice(), gridOpts: SVC.GRIDS.orders.cols.filter((c) => c.k === 'model')[0].opts === SVC.MODEL_OPTS, od: [...document.querySelectorAll('#odModel option')].map((o) => o.value), codes: !!SVC.ST.CODES, active: SVC.codeActive('channel', '옛채널'), active2: SVC.codeActive('channel', '테스트채널') }));
    assert(st.codes, 'CODES 비어 있음'); assert(st.ch.includes('테스트채널') && !st.ch.includes('옛채널'), 'CH_OPTS ' + st.ch.join(','));
    assert(st.model.includes('S900') && st.od.includes('S900'), 'MODEL_OPTS/#odModel ' + st.od.join(','));
    assert(st.gridOpts, 'GRIDS.orders 모델 열이 MODEL_OPTS 배열을 참조하지 않음'); assert(st.ordCh.length === 5, 'ORD_CH_OPTS(표에 없음) 는 기본값 유지');
    assert(st.active === false && st.active2 === true, 'codeActive');
    assert(!errs.length, errs.join(' | ')); return st.ch.join(',');
  });
  await S.t('관리자 › 코드 관리: 표 · 추가(POST) · 숨기기(PATCH) · 순서(PATCH×2)', async () => {
    await page.evaluate(async () => { await SVC.lazyLoad('admin'); SVC.switchView('adminx'); SVC.admTab('cfg'); }); await page.waitForTimeout(800);
    assert(await page.$('#cdTable tbody'), '코드 관리 표 없음'); const kinds = await page.$$eval('#cdKind option', (e) => e.length); assert(kinds >= 12, '종류 ' + kinds);
    await page.selectOption('#cdKind', 'channel'); await page.waitForTimeout(150);
    const rows = await page.$$eval('#cdTable tbody tr', (e) => e.map((x) => x.querySelector('td:nth-child(2) b').textContent)); assert(rows.length === 6 && rows[5] === '테스트채널', '채널 ' + rows.join(','));
    await page.click('#cdShowOff'); await page.waitForTimeout(150);
    const rows2 = await page.$$eval('#cdTable tbody tr', (e) => e.length); assert(rows2 === 7, '숨긴 값 포함 ' + rows2);
    writes.length = 0; await page.fill('#cdNewVal', '새채널'); await page.fill('#cdNewNote', 'smoke'); await page.click('#cdAdd'); await page.waitForTimeout(500);
    const add = writes.filter((w) => /code_lists/.test(w.url) && w.m === 'POST')[0]; assert(add, '추가 POST 없음 ' + JSON.stringify(writes.map((w) => w.m + ' ' + w.url.split('/rest/v1/')[1])));
    const ab = JSON.parse(add.body); assert(ab.kind === 'channel' && ab.value === '새채널' && ab.active === true && ab.sort === 100 && ab.note === 'smoke', JSON.stringify(ab));
    assert(writes.some((w) => /change_log/.test(w.url) && /code_add/.test(w.body)), 'change_log code_add 없음');
    writes.length = 0; await page.click('#cdTable [data-cd-tog="테스트채널"]'); await page.waitForTimeout(500);
    const tog = writes.filter((w) => /code_lists\?kind=eq\.channel&value=eq\.%ED%85%8C/.test(w.url) && w.m === 'PATCH')[0]; assert(tog && JSON.parse(tog.body).active === false, '숨기기 PATCH ' + JSON.stringify(writes.map((w) => w.m + ' ' + w.url.split('/rest/v1/')[1])));
    writes.length = 0; await page.click('#cdTable [data-cd-up="조달"]'); await page.waitForTimeout(500);
    const mv = writes.filter((w) => /code_lists/.test(w.url) && w.m === 'PATCH'); assert(mv.length === 2 && JSON.parse(mv[0].body).sort === 1 && JSON.parse(mv[1].body).sort === 2, '순서 PATCH ' + JSON.stringify(mv.map((w) => w.body)));
    assert(!errs.length, errs.join(' | ')); return rows.length + '→' + rows2;
  });
  await S.t('데이터 점검: 고객사 중복 → 병합 창 → rpc merge_customers(keep, drop)', async () => {
    await page.evaluate(() => { SVC.ST.RAWX.customers.push({ id: 99901, name: '(주)가상고객01', aliases: [] }); SVC.switchView('dcheck'); }); await page.waitForTimeout(500);
    const dup = await page.evaluate(() => { const r = SVC.dcRules().filter((x) => x.id === 'cu_dup')[0]; return r.items.map((i) => ({ label: i.label, act: !!i.act })); });
    const hit = dup.filter((d) => /가상고객01/.test(d.label))[0]; assert(hit && hit.act, 'cu_dup 항목/병합 버튼 없음 ' + JSON.stringify(dup).slice(0, 200));
    await page.click('#bizHost [data-dc="cu_dup"]'); await page.waitForTimeout(200);
    const btn = (await page.$$('#bizHost [data-dcitem^="cu_dup:"]'))[0]; assert(btn, '항목 병합 버튼 없음'); await btn.click(); await page.waitForTimeout(200);
    assert(await page.$('#ovlDcMerge'), '병합 창 없음'); const radios = await page.$$eval('#ovlDcMerge input[name="dcmKeep"]', (e) => e.map((x) => x.value)); assert(radios.length === 2 && radios[0] === '1', '후보 ' + radios.join(','));
    writes.length = 0; await page.click('#ovlDcMerge #dcmGo'); await page.waitForTimeout(900);
    const rpc = writes.filter((w) => /rpc\/merge_customers/.test(w.url))[0]; assert(rpc, 'merge_customers 호출 없음 ' + JSON.stringify(writes.map((w) => w.url.split('/rest/v1/')[1])));
    const b = JSON.parse(rpc.body); assert(b.p_keep === 1 && b.p_drop === 99901, JSON.stringify(b));
    assert(!(await page.$('#ovlDcMerge')), '병합 뒤 창이 닫히지 않음'); assert(!errs.length, errs.join(' | ')); return JSON.stringify(b);
  });
  await S.t('데이터 점검: 이달 매출 0 → mrr 로 채우기 (POST monthly_revenue · 원 단위 · change_log)', async () => {
    writes.length = 0;
    const exp = await page.evaluate(async () => { const r = SVC.ST.DATA.rows.filter((x) => x.mrr > 0)[0]; await SVC.dcFillMrr([r], SVC.ST.DATA.nowIdx); return { id: r._id, mrr: r.mrr, month: SVC.idxDate(SVC.ST.DATA.nowIdx) }; });
    await page.waitForTimeout(500);
    const post = writes.filter((w) => /monthly_revenue/.test(w.url) && w.m === 'POST')[0]; assert(post, 'monthly_revenue POST 없음 ' + JSON.stringify(writes.map((w) => w.m + ' ' + w.url.split('/rest/v1/')[1])));
    const b = JSON.parse(post.body); assert(Array.isArray(b) && b.length === 1 && b[0].contract_id === exp.id && b[0].amount === Math.round(exp.mrr) && b[0].month === exp.month, JSON.stringify(b) + ' vs ' + JSON.stringify(exp));
    assert(writes.some((w) => /change_log/.test(w.url) && /bulk_fill/.test(w.body)), 'change_log bulk_fill 없음');
    const dc = writes.filter((w) => /change_log/.test(w.url) && /data_check/.test(w.body)); assert(dc.length <= 1, 'data_check 로그가 세션당 1회를 넘음 ' + dc.length);
    assert(!errs.length, errs.join(' | ')); return b[0].amount + '원';
  });
  await S.t('데이터 점검: 만기 판정 포탈 ↔ DB(renew_watch) 대조 규칙', async () => {
    const rs = await page.evaluate(() => { const R = SVC.renewScan(SVC.ST.DATA.nowIdx); return { lapsed: R.lapsed.map((r) => r._id), due: R.due.map((r) => r._id), next: R.next.map((r) => r._id) }; });
    rwRows = rs.due.map((id) => ({ kind: 'due', contract_id: id, customer: 'x' })).concat([{ kind: 'lapsed', contract_id: 999999, customer: '가상DB전용' }]);
    await page.evaluate(() => { SVC.DC.rw = null; SVC.switchView('dcheck'); }); await page.waitForTimeout(900);
    const r = await page.evaluate(() => { const x = SVC.dcRules().filter((q) => q.id === 'c_renew_sync')[0]; return { sev: x.sev, n: x.items.length, subs: x.items.map((i) => i.sub.slice(0, 20)), rw: SVC.DC.rw && { portalN: SVC.DC.rw.portalN, dbN: SVC.DC.rw.dbN, pending: !!SVC.DC.rw.pending } }; });
    const expect = rs.lapsed.length + rs.next.length + 1;
    assert(r.rw && !r.rw.pending && r.rw.dbN === rs.due.length + 1, 'rw ' + JSON.stringify(r.rw));
    assert(r.sev === 'warn' && r.n === expect, 'diff ' + r.n + ' vs ' + expect + ' ' + JSON.stringify(r.subs).slice(0, 200));
    assert(r.subs.some((s) => /^DB\(renew_watch\)만/.test(s)) && (expect === 1 || r.subs.some((s) => /^포탈만/.test(s))), '양쪽 방향 표시 ' + JSON.stringify(r.subs).slice(0, 200));
    assert(!errs.length, errs.join(' | ')); rwRows = null; return 'portal ' + r.rw.portalN + ' · db ' + r.rw.dbN + ' · diff ' + r.n;
  });
  await S.t('코드 목록 표 없음(SQL 93 전) → 기본값 그대로 · 코드 관리는 안내', async () => {
    const { ctx: c2, page: p2, errs: e2 } = await open({ extra: async (route, u, m) => { if (!u.includes('/rest/v1/code_lists')) return false; await route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"relation \\"public.code_lists\\" does not exist"}' }); return true; } });
    const st = await p2.evaluate(() => ({ codes: SVC.ST.CODES, ch: SVC.CH_OPTS.slice() })); assert(st.codes === null && st.ch.length === 5, JSON.stringify(st));
    await p2.evaluate(() => SVC.switchView('adminx')); await p2.waitForTimeout(800);
    const msg = await p2.$eval('#cdMsg', (e) => e.textContent); assert(/SQL 93/.test(msg), msg);
    assert(!e2.length, e2.join(' | ')); await c2.close(); return msg.slice(0, 30);
  });
  if (S.failed.length) await shot(page, 'smoke_fail_codes');
  await ctx.close();
}
// 견적 Worker v2 (2026-10-04): 비밀번호 대신 포탈 로그인 토큰(Bearer) · 401 → 토큰 갱신 후 재시도 · 옛 비밀번호 정리 · 목록 이스케이프
{
  const wk = []; let w401 = 0, refreshed = 0;
  const workerRoute = async (route) => {
    const rq = route.request(), u = rq.url(), hd = rq.headers();
    wk.push({ m: rq.method(), path: new URL(u).pathname, auth: hd['authorization'] || '', pw: hd['x-access-password'] || '', body: rq.postData() });
    if (w401 > 0) { w401--; return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"로그인이 만료되었습니다"}' }); }
    const p = new URL(u).pathname;
    if (p === '/list') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ name: '20261001_가상고객01_1.json', path: 'quotes/20261001_가상고객01_1.json' }, { name: '<img src=x onerror=window.__xss=1>.json', path: 'quotes/x.json' }] }) });
    if (p === '/save') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"path":"quotes/x.json"}' });
    if (p === '/whoami') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, email: 'tester@example.com', role: 'super_admin', auth: 'jwt', read: true, write: true, delete: true, version: 2 }) });
    if (p === '/load') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ customerName: '가상고객01', quoteDate: '2026-10-01', grandTotal: '1,000,000', rows: [] }) });
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  };
  // (1) quote.html 단독
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const page = await ctx.newPage(); const c = collect(page);
    await mockBackend(page, { extra: async (route, u) => { if (!u.includes('/auth/v1/token')) return false; refreshed++; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'tok2', refresh_token: 'r2', expires_in: 3600 }) }); return true; } });
    await page.addInitScript(() => {   // mockBackend 의 세션에 refresh 토큰을 넣고, 옛 버전이 저장해 둔 «팀 공용 비밀번호»를 심어 둠
      const s = JSON.parse(sessionStorage.getItem('svc_sess') || '{}'); s.r = 'r1'; sessionStorage.setItem('svc_sess', JSON.stringify(s));
      localStorage.setItem('genians_quote_worker_config_v1', JSON.stringify({ baseUrl: 'https://aged-union-cdd3.choihw.workers.dev', accessPassword: 'old-team-pw' }));
    });
    await page.route(/workers\.dev/, workerRoute);
    await page.goto(url + '/quote.html'); await page.waitForTimeout(1200);
    await S.t('견적 Worker v2: quote.html — 옛 비밀번호 정리 · 목록/저장이 Bearer 토큰 · 비밀번호 헤더 없음 · 목록 이스케이프', async () => {
      await page.evaluate(() => { try { selectQuoteType('enterprise'); } catch (e) { /* 이미 선택 */ } }); await page.waitForTimeout(400);
      const cfg = await page.evaluate(() => JSON.parse(localStorage.getItem('genians_quote_worker_config_v1') || '{}'));
      assert(cfg.baseUrl && cfg.accessPassword === undefined, '옛 비밀번호가 남아 있음 ' + JSON.stringify(cfg));
      wk.length = 0; await page.evaluate(() => listGithubQuotes()); await page.waitForTimeout(500);
      const l = wk.filter((w) => w.path === '/list')[0]; assert(l && l.auth === 'Bearer tok' && !l.pw, '/list 헤더 ' + JSON.stringify(l));
      const rows = await page.$$eval('#githubListBody .btn-load', (e) => e.length); assert(rows === 2, '목록 ' + rows);
      const xss = await page.evaluate(() => ({ img: document.querySelectorAll('#githubListBody img').length, flag: !!window.__xss })); assert(xss.img === 0 && !xss.flag, '파일 이름이 HTML 로 해석됨 ' + JSON.stringify(xss));
      wk.length = 0; const sv = await page.evaluate(() => silentSaveToGithub()); const p = wk.filter((w) => w.path === '/save')[0];
      assert(sv.ok && p && p.auth === 'Bearer tok' && !p.pw && /"fileName"/.test(p.body), '/save ' + JSON.stringify({ sv, p: p && { auth: p.auth, pw: p.pw } }));
      assert(!c.errs.length, c.errs.join(' | ')); assert(!c.csp.length, c.csp.join(' | ')); return 'list·save Bearer tok';
    });
    await S.t('견적 Worker v2: 401 → 토큰 갱신(/auth/v1/token) → 새 토큰으로 재시도 · 설정 창 «연결·권한 확인»', async () => {
      await page.evaluate(() => openGithubSettings()); assert(!(await page.$('#ghToken')), '비밀번호 입력칸이 남아 있음');
      wk.length = 0; w401 = 1; refreshed = 0; await page.evaluate(() => checkWorkerAuth()); await page.waitForTimeout(500);
      const who = wk.filter((w) => w.path === '/whoami'); assert(who.length === 2 && who[0].auth === 'Bearer tok' && who[1].auth === 'Bearer tok2' && refreshed === 1, JSON.stringify(who.map((w) => w.auth)) + ' refresh ' + refreshed);
      const st = await page.evaluate(() => ({ a: JSON.parse(sessionStorage.getItem('svc_sess')).a, r: JSON.parse(sessionStorage.getItem('svc_sess')).r, info: document.getElementById('ghAuthInfo').textContent }));
      assert(st.a === 'tok2' && st.r === 'r2' && /✓ tester@example.com · 역할 super_admin · 조회·저장·삭제/.test(st.info), JSON.stringify(st));
      assert(!c.errs.length, c.errs.join(' | ')); return st.info;
    });
    await ctx.close();
  }
  // (2) 포탈 OI › 견적서 불러오기
  {
    const { ctx, page, errs } = await open();
    await page.addInitScript(() => localStorage.setItem('genians_quote_worker_config_v1', JSON.stringify({ baseUrl: 'https://aged-union-cdd3.choihw.workers.dev', accessPassword: 'old-team-pw' })));
    await page.evaluate(() => localStorage.setItem('genians_quote_worker_config_v1', JSON.stringify({ baseUrl: 'https://aged-union-cdd3.choihw.workers.dev', accessPassword: 'old-team-pw' })));
    await page.route(/workers\.dev/, workerRoute);
    await S.t('견적 Worker v2: 포탈 OI › 견적서 불러오기 — 비밀번호 창 없음 · Bearer · 옛 비밀번호 정리', async () => {
      assert(!(await page.$('#qpGate')) && !(await page.$('#qpPw')), '비밀번호 입력 영역이 남아 있음');
      wk.length = 0; await page.evaluate(() => SVC.openQuotePick()); await page.waitForTimeout(600);
      const l = wk.filter((w) => w.path === '/list')[0]; assert(l && l.auth === 'Bearer tok' && !l.pw, '/list ' + JSON.stringify(l));
      const n = await page.$$eval('#qpList .qp-row', (e) => e.length); assert(n === 2, '목록 ' + n);
      const cfg = await page.evaluate(() => JSON.parse(localStorage.getItem('genians_quote_worker_config_v1') || '{}')); assert(cfg.accessPassword === undefined, '옛 비밀번호 남음');
      wk.length = 0; await page.click('#qpList .qp-row'); await page.waitForTimeout(500);
      const ld = wk.filter((w) => w.path === '/load')[0]; assert(ld && ld.auth === 'Bearer tok', '/load ' + JSON.stringify(ld));
      assert(!errs.length, errs.join(' | ')); return 'list·load Bearer';
    });
    await ctx.close();
  }
}
// ㊿+141 UX: 창 바깥 클릭으로 닫기 · 입력 중 확인 · 초점 들어가기/가두기/되돌리기 · 배포·운영 기록 넘침 · 서버 오류 표시 · 접근성 이름
{
  const files = Array.from({ length: 22 }, (_, i) => 'staging/js/file' + i + '.js').join(', ');
  const recent = Array.from({ length: 8 }, (_, i) => ({ at: '2026-10-04T05:1' + i + ':00', actor: 'tester@example.com', action: i % 2 ? 'gh_put' : 'sql_run', target: i % 2 ? 'staging/.gitignore, staging/app.css, ' + files : '59개 문장', summary: '포탈 ㊿+141 · ' + files, ok: i !== 3, error: i === 3 ? 'GitHub 422 ' + files : null, ms: 900 }));
  const { ctx, page, errs } = await open({ extra: async (route, u) => { if (u.includes('/functions/v1/ops')) { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, log_ok: true, github: { repo: 'x/y', branch: 'main', token_set: true }, recent }) }); return true; } return false; } });
  const backdrop = async (sel) => { const b = await page.$eval(sel, (o) => { const m = o.querySelector('.modal') || o.firstElementChild; const r = m.getBoundingClientRect(); return { x: Math.max(4, r.left - 12), y: Math.min(window.innerHeight - 6, r.bottom + 12), mx: r.left, my: r.bottom }; }); await page.mouse.click(b.x < b.mx ? b.x : 6, b.y); await page.waitForTimeout(150); };
  const isOn = (id) => page.evaluate((id) => { const o = document.getElementById(id); return !!(o && o.classList.contains('on')); }, id);
  await S.t('창 바깥 클릭 → 닫힘 (단축키 창 · 고객 360) · 창 안 클릭은 유지', async () => {
    await page.evaluate(() => document.getElementById('ovlKeys').classList.add('on')); await page.waitForTimeout(120);
    await page.click('#ovlKeys .keys-tbl'); assert(await isOn('ovlKeys'), '창 안을 눌렀는데 닫힘');
    await backdrop('#ovlKeys'); assert(!(await isOn('ovlKeys')), '바깥 클릭으로 안 닫힘');
    await page.evaluate(() => { SVC.openOvl('ovlC360'); }); await page.waitForTimeout(120);
    await page.mouse.click(30, 500); await page.waitForTimeout(150); assert(!(await isOn('ovlC360')), '고객 360 바깥 클릭으로 안 닫힘');
    /* 창 안에서 누르고 배경에서 뗌(글자 끌어 선택) → 닫지 않음 */
    await page.evaluate(() => document.getElementById('ovlKeys').classList.add('on')); await page.waitForTimeout(120);
    const r = await page.$eval('#ovlKeys .keys-tbl', (e) => { const b = e.getBoundingClientRect(); return { x: b.left + 20, y: b.top + 10 }; });
    await page.mouse.move(r.x, r.y); await page.mouse.down(); await page.mouse.move(6, 880); await page.mouse.up(); await page.waitForTimeout(150);
    assert(await isOn('ovlKeys'), '드래그 선택이 배경에서 끝났는데 닫힘'); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    return 'keys·c360';
  });
  await S.t('입력 중인 창: 바깥 클릭 → 확인(취소면 유지 · 확인이면 닫힘) · 동적 창(월 목표)은 제거', async () => {
    await page.evaluate(() => SVC.openTargetEditor(2026)); await page.waitForTimeout(150);
    await page.focus('#ovlTarget input[data-m="1"]'); await page.keyboard.type('5000000');
    let dlg = null; page.once('dialog', async (d) => { dlg = d.message(); await d.dismiss(); });
    await backdrop('#ovlTarget'); assert(dlg && /저장되지 않았습니다/.test(dlg), '확인 창 없음 ' + dlg); assert(await page.$('#ovlTarget'), '취소했는데 닫힘');
    page.once('dialog', async (d) => { await d.accept(); }); await backdrop('#ovlTarget'); assert(!(await page.$('#ovlTarget')), '확인했는데 남음(동적 창은 제거)');
    /* 손대지 않은 창은 묻지 않고 닫힘 */
    await page.evaluate(() => SVC.openTargetEditor(2026)); await page.waitForTimeout(150);
    let asked = false; const h = () => { asked = true; }; page.on('dialog', h); await backdrop('#ovlTarget'); page.off('dialog', h);
    assert(!asked && !(await page.$('#ovlTarget')), '입력 없는데 확인을 물음/안 닫힘');
    /* 메뉴 편집: ↑↓ 로 순서만 바꿔도 «입력 중» */
    await page.evaluate(() => SVC.openMenuEdit()); await page.waitForTimeout(150);
    await page.click('#mcBody [data-mv="dn"]'); dlg = null; page.once('dialog', async (d) => { dlg = d.message(); await d.dismiss(); }); await backdrop('#ovlMenu');
    assert(dlg && (await isOn('ovlMenu')), '메뉴 순서 변경 후 확인 없음'); await page.evaluate(() => SVC.closeOvl('ovlMenu'));
    return 'confirm·remove·clean·menu';
  });
  await S.t('2단계 인증 창은 바깥 클릭·Esc 로 닫히지 않음 · 저장 성공 뒤엔 확인 없이 닫힘', async () => {
    const t = await page.evaluate(() => { const o = document.createElement('div'); o.id = 'ovlMfa'; o.className = 'ovl on'; o.style.zIndex = '100000'; o.innerHTML = '<div class="modal"><h3>코드</h3><input id="mfX"></div>'; document.body.appendChild(o); return true; });
    await page.waitForTimeout(100); await page.mouse.click(6, 880); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    assert(await page.$('#ovlMfa.on'), 'MFA 창이 닫힘'); await page.evaluate(() => document.getElementById('ovlMfa').remove());
    await page.evaluate(() => SVC.openTargetEditor(2026)); await page.waitForTimeout(150);
    await page.focus('#ovlTarget input[data-m="2"]'); await page.keyboard.type('7000000');
    await page.evaluate(() => SVC.sbWrite('POST', 'monthly_targets', [{ year: 2026, month: 2, amount: 7000000 }]));
    let asked = false; const h = (d) => { asked = true; d.dismiss(); }; page.on('dialog', h); await backdrop('#ovlTarget'); page.off('dialog', h);
    assert(!asked && !(await page.$('#ovlTarget')), '저장 뒤에도 확인을 물음'); return String(t);
  });
  await S.t('창 초점: 열리면 창 안으로 · Tab 은 창 안에서만 · 닫히면 연 버튼으로 · role=dialog 자동', async () => {
    await page.evaluate(() => SVC.switchView('dash')); await page.waitForTimeout(200);
    await page.focus('#btnTheme'); await page.keyboard.press('Shift+?'); await page.waitForTimeout(200);
    const a = await page.evaluate(() => { const o = document.getElementById('ovlKeys'); return { inside: o.contains(document.activeElement) }; }); assert(a.inside, '초점이 창 밖');
    let out = 0; for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); if (!(await page.evaluate(() => document.getElementById('ovlKeys').contains(document.activeElement)))) out++; }
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Shift+Tab');
    if (!(await page.evaluate(() => document.getElementById('ovlKeys').contains(document.activeElement)))) out++;
    assert(out === 0, 'Tab 이 창 밖으로 ' + out + '회');
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    const back = await page.evaluate(() => document.activeElement && document.activeElement.id); assert(back === 'btnTheme', '닫힌 뒤 초점 ' + back);
    await page.evaluate(() => SVC.openRenewList('due')); await page.waitForTimeout(300);
    const d = await page.evaluate(() => { const m = document.querySelector('#ovlRenew .modal'); return { role: m.getAttribute('role'), modal: m.getAttribute('aria-modal'), lb: m.getAttribute('aria-labelledby'), inside: document.getElementById('ovlRenew').contains(document.activeElement) }; });
    assert(d.role === 'dialog' && d.modal === 'true' && d.lb === 'rnTitle' && d.inside, JSON.stringify(d));
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    return JSON.stringify(d);
  });
  await S.t('배포·운영 › 기록: 긴 파일 목록이 카드 밖으로 넘치지 않음 · 접힌 목록 펼치기', async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => SVC.switchView('ops')); await page.waitForTimeout(700);
    await page.evaluate(() => { SVC.OPS.tab = 'log'; SVC.renderOps(); }); await page.waitForTimeout(300);
    const m = await page.evaluate(() => { const host = document.getElementById('opsHost').getBoundingClientRect(); const t = [...document.querySelectorAll('#opsHost table')].pop().getBoundingClientRect(); return { doc: document.documentElement.scrollWidth - window.innerWidth, over: Math.round(t.right - host.right), det: document.querySelectorAll('#opsHost details.ops-tgt').length, sum: (document.querySelector('#opsHost details.ops-tgt summary') || {}).textContent }; });
    assert(m.doc <= 0 && m.over <= 0, '넘침 ' + JSON.stringify(m)); assert(m.det >= 4 && /staging\/.*파일 24개/.test(m.sum), JSON.stringify(m));
    await page.click('#opsHost details.ops-tgt summary'); const open = await page.$eval('#opsHost details.ops-tgt', (d) => d.open && /file21\.js/.test(d.textContent)); assert(open, '펼쳐도 전체 목록 없음');
    const m2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert(m2 <= 0, '펼친 뒤 넘침 ' + m2);
    await page.setViewportSize({ width: 1440, height: 1000 });
    assert(!errs.length, errs.join(' | ')); return m.sum.slice(0, 40);
  });
  await S.t('접근성: 이름 없는 select 0 · 차트 aria-label · 버튼 속 버튼 0 · 조합 결과 표 tabindex', async () => {
    const bad = []; for (const v of ['churn', 'report', 'account', 'adminx', 'dash', 'eqboard', 'leadsrc']) {
      await page.evaluate((v) => SVC.switchView(v), v); await page.waitForTimeout(350);
      const r = await page.evaluate(() => {
        const nm = (e) => e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.title || (e.id && document.querySelector('label[for="' + e.id + '"]')) || e.closest('label');
        const sel = [...document.querySelectorAll('select')].filter((e) => e.getClientRects().length && !nm(e)).map((e) => e.id || e.dataset.qb || e.className);
        const svg = [...document.querySelectorAll('svg[role=img]')].filter((e) => e.getClientRects().length && !e.getAttribute('aria-label') && !e.querySelector('title')).length;
        const nest = [...document.querySelectorAll('[role=button]')].filter((e) => e.getClientRects().length && e.querySelector('button,a[href],input,select,textarea')).length;
        return { sel, svg, nest };
      });
      if (r.sel.length || r.svg || r.nest) bad.push(v + ':' + JSON.stringify(r));
    }
    assert(!bad.length, bad.join(' | ')); return 'ok';
  });
  await ctx.close();
}
// ㊿+141: 서버 오류(5xx)는 «데이터 없음»이 아니라 오류로 보임 · 캐시로 그린 뒤 최신 로드 실패는 알림
{
  const { ctx, page } = await open({ extra: async (route, u) => { if (u.includes('/rpc/load_all') || /\/rest\/v1\/(customers|contracts|monthly_revenue)\b/.test(u)) { await route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"down"}' }); return true; } return false; } });
  await S.t('DB 5xx → «데이터를 불러오지 못했습니다» (빈 화면으로 넘기지 않음)', async () => {
    const t = await page.evaluate(() => ({ load: (document.getElementById('loading') || {}).textContent || '', data: !!SVC.ST.DATA }));
    assert(/불러오지 못했습니다/.test(t.load) && /503/.test(t.load), JSON.stringify(t).slice(0, 200)); return t.load.slice(0, 40);
  });
  await ctx.close();
}
{
  let fail = false;
  const { ctx, page } = await open({ extra: async (route, u) => { if (fail && (u.includes('/rpc/load_all') || /\/rest\/v1\/(customers|contracts|monthly_revenue)\b/.test(u))) { await route.fulfill({ status: 502, contentType: 'application/json', body: '{}' }); return true; } return false; } });
  await S.t('캐시로 그린 뒤 최신 데이터 실패 → 경고 토스트', async () => {
    /* lib 의 init 스크립트가 새로고침마다 저장소를 비우므로, 같은 페이지에서 boot() 를 다시 불러 «캐시로 먼저 그리기» 경로를 탐 */
    const c = await page.evaluate(() => !!sessionStorage.getItem(SVC.CACHE_KEY)); assert(c, '캐시 없음');
    fail = true; await page.evaluate(() => SVC.boot()); await page.waitForTimeout(1500);
    const t = await page.evaluate(() => ({ data: !!SVC.ST.DATA, toast: [...document.querySelectorAll('.toast')].map((e) => e.textContent).join(' | ') }));
    assert(t.data && /최신 데이터를 불러오지 못했습니다/.test(t.toast), JSON.stringify(t).slice(0, 200)); return 'toast';
  });
  await ctx.close();
}
// ㊿+142 디자인 정리: 글자 크기 7단계 · 버튼 4종 · 표 열 너비 조절 · 메뉴 «사업 영역» 한 그룹
{
  const { ctx, page, errs } = await open();
  await S.t('글자 크기: 화면 글자는 6단계(보조 12·13 · 본문 14·15 · 제목 18·22) + 큰 숫자(≥24)만 · 12px 미만 0 (㊿+169)', async () => {
    const STEP = [12, 13, 14, 15, 18, 22]; const bad = {}; let small = 0;
    for (const v of ['dash', 'contracts', 'orders', 'eqboard', 'price', 'report', 'adminx', 'ops', 'oi', 'dcheck', 'leadsrc', 'account']) {
      await page.evaluate((v) => SVC.switchView(v), v); await page.waitForTimeout(300);
      const r = await page.evaluate(() => { const o = {}; document.querySelectorAll('body *').forEach((el) => { if (!el.getClientRects().length || el.closest('svg')) return; if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return; const f = parseFloat(getComputedStyle(el).fontSize); o[f] = (o[f] || 0) + 1; }); return o; });
      for (const f in r) { const x = +f; if (x < 12) small += r[f]; if (x < 24 && !STEP.includes(x)) bad[f] = (bad[f] || 0) + r[f]; }
    }
    assert(!small, '12px 미만 ' + small); assert(!Object.keys(bad).length, '단계 밖 크기 ' + JSON.stringify(bad));
    return '6단계';
  });
  await S.t('버튼: 주요(초록) 색 하나 · 기본 버튼 모양 통일(높이 28 · 모서리 8 · 글자 500)', async () => {
    await page.evaluate(() => SVC.openTargetEditor(2026)); await page.waitForTimeout(150);
    const p = await page.evaluate(() => { const b = document.getElementById('tgSave'); const cs = getComputedStyle(b); const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim(); return { cls: b.className, bg: cs.backgroundColor, fw: cs.fontWeight, inline: b.getAttribute('style') || '', brand }; });
    await page.evaluate(() => document.getElementById('ovlTarget').remove());
    assert(/\bpri\b/.test(p.cls) && !/background/.test(p.inline) && +p.fw >= 600, JSON.stringify(p));
    const probe = await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = '<button class="pill">a</button><button class="cbtn">b</button><button class="pill pri">c</button><button class="cbtn pri">d</button>'; document.body.appendChild(d); const r = [...d.children].map((b) => { const c = getComputedStyle(b); return [c.height, c.borderTopLeftRadius, c.fontWeight, c.backgroundColor].join(' '); }); d.remove(); return r; });
    const [pl, cb, pp, cp] = probe.map((x) => x.split(' '));
    assert(pl[0] === cb[0] && pl[0] === '28px' && pl[1] === cb[1] && pl[1] === '8px' && pl[2] === cb[2] && pl[2] === '500', '기본 ' + probe.join(' / '));
    assert(pp.slice(3).join(' ') === cp.slice(3).join(' ') && pp[2] === '600', '주요 ' + probe.join(' / '));
    return probe[2];
  });
  await S.t('표 열 너비: 머리 경계를 끌면 넓어지고 기억 · 정렬은 안 바뀜 · 두 번 누르면 원래대로', async () => {
    await page.evaluate(() => { localStorage.removeItem('svc_colw_contracts'); SVC.switchView('contracts'); }); await page.waitForTimeout(300);
    const th = await page.$('#dvTable thead th:nth-child(2)'); const k = await th.evaluate((e) => e.dataset.k);
    const w0 = await th.evaluate((e) => e.getBoundingClientRect().width); const box = await (await th.$('.colrs')).boundingBox();
    await page.mouse.move(box.x + 4, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + 104, box.y + box.height / 2, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(100);
    const st = await page.evaluate(() => ({ m: JSON.parse(localStorage.getItem('svc_colw_contracts') || '{}'), sortK: SVC.DV.sortK }));
    assert(st.m[k] >= w0 + 90 && !st.sortK, JSON.stringify({ w0, st }));
    await page.evaluate(() => { SVC.switchView('orders'); SVC.switchView('contracts'); }); await page.waitForTimeout(250);
    const w2 = await page.$eval('#dvTable thead th:nth-child(2)', (e) => e.getBoundingClientRect().width); const fx = await page.$eval('#dvTable', (e) => e.classList.contains('colw-fixed'));
    assert(Math.abs(w2 - st.m[k]) <= 1 && fx, '다시 열었을 때 ' + w2);
    await page.evaluate(() => document.querySelector('#dvTable thead th:nth-child(2) .colrs').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); await page.waitForTimeout(200);
    const w3 = await page.$eval('#dvTable thead th:nth-child(2)', (e) => e.getBoundingClientRect().width); const left = await page.evaluate(() => localStorage.getItem('svc_colw_contracts'));
    assert(Math.abs(w3 - w0) <= 1 && !left, '원래대로 ' + w3 + ' ' + left);
    assert(!errs.length, errs.join(' | ')); return Math.round(w0) + '→' + st.m[k] + '→' + Math.round(w3);
  });
  await S.t('메뉴: «사업 영역» 한 그룹(소제목 Cloud NAC·MDR·기타) · 레일 아이콘 1개 · Ctrl+K 에 소제목 붙음', async () => {
    const r = await page.evaluate(() => ({ g: [...document.querySelectorAll('#side .grp')].map((g) => g.textContent.trim()).filter((t) => /사업 영역/.test(t)), sub: [...document.querySelectorAll('#side .subgrp')].map((s) => s.dataset.sub), rail: document.querySelectorAll('#rail [data-seg^="g:사업 영역"]').length }));
    assert(r.g.length === 1 && r.g[0] === '사업 영역' && r.sub.join('|') === 'Cloud NAC|MDR|기타 (유통)' && r.rail === 1, JSON.stringify(r));
    const nm = await page.evaluate(() => SVC.cmdMenuHits('일반 판매').map((h) => h.nm)); assert(nm.every((x) => /·/.test(x)), JSON.stringify(nm));
    return JSON.stringify(nm);
  });
  await ctx.close();
}
{
  const { ctx, page, errs } = await open();
  await S.t('메뉴 편집 예전 설정(옛 «사업 영역 · MDR» 숨김·순서) → 새 그룹으로 옮김', async () => {
    await page.evaluate(() => { localStorage.setItem(SVC.menuConfKey(), JSON.stringify({ order: ['g:장비', 'g:사업 영역 · MDR', 'g:전체 데이터', 'g:사업 영역 · Cloud NAC'], hidden: { 'g:사업 영역 · MDR': 1 } })); SVC.applyMenuConf(); SVC.buildRail(); });
    const r = await page.evaluate(() => ({ conf: JSON.parse(localStorage.getItem(SVC.menuConfKey())), segs: SVC.menuSegments().filter((s) => s.grp).map((s) => s.label).slice(0, 3), mdrHidden: ['mdrgen', 'mdrs1', 'mdrlgu'].every((v) => document.querySelector('#side button[data-v="' + v + '"]').classList.contains('mhide')), subMdr: document.querySelector('#side .subgrp[data-sub="MDR"]').classList.contains('sub-empty'), cn: !document.querySelector('#side button[data-v="cngen"]').classList.contains('mhide') }));
    assert(r.conf.order.join('|') === 'g:장비|g:사업 영역|g:전체 데이터' && r.conf.hidden['b:mdrgen'] && !r.conf.hidden['g:사업 영역 · MDR'], JSON.stringify(r.conf));
    assert(r.segs.join('|') === '장비|사업 영역|전체 데이터' && r.mdrHidden && r.subMdr && r.cn, JSON.stringify(r));
    assert(!errs.length, errs.join(' | ')); return r.segs.join('·');
  });
  await ctx.close();
}
// ㊿+143 배포 안전장치: 파일 자리 자동 · 저장소 파일은 루트 · 워크플로는 커밋에서 빼고 안내 · 커밋 전 경고 · 저장소 점검/정리
{
  const calls = []; const dialogs = []; let dismissNext = false;
  const OLD_WF = "name: test-and-deploy\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with: { node-version: 20 }\n";
  const { ctx, page, errs } = await open({ extra: async (route, u) => {
    if (!u.includes('/functions/v1/ops')) return false;
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch { /* noop */ }
    calls.push(body); const A = body.action; let out = { ok: true };
    if (A === 'status') out = { ok: true, pin_set: true, github: { repo: 'x/svc', branch: 'main', token_set: true }, mgmt_token_set: true, log_ok: true, recent: [] };
    else if (A === 'gh_put') out = { ok: true, commit: 'abc1234def', url: 'u', files: body.files.map((f) => f.path) };
    else if (A === 'gh_list') out = { ok: true, files: ['index.html', 'js/app.js', 'js/core.js', 'staging/js/app.js', 'check.mjs', 'tests/check.mjs', '.github/workflows/deploy.yml', 'staging/.github/workflows/deploy.yml', 'staging/README.md', 'staging/tests/fn/ops.test.ts', 'staging/2_repo/supabase/functions/ops/index.ts'].map((p) => ({ path: p, size: 1, sha: 's' })) };
    else if (A === 'gh_get') out = { ok: true, path: body.path, content: OLD_WF };
    else if (A === 'gh_delete') out = { ok: true, commit: 'dead0002', url: 'u', deleted: body.paths, missing: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }); return true; } });
  page.on('dialog', async (d) => { dialogs.push(d.message()); if (/새로고침|열까요/.test(d.message()) || dismissNext) { dismissNext = false; await d.dismiss(); } else await d.accept(); });
  await page.evaluate(() => SVC.switchView('ops')); await page.waitForTimeout(500);
  await page.fill('#opsPin', '7391');
  await S.t('배포 안전장치: 파일 하나만 넣어도 자리 자동(check.mjs→tests/ · *.test.ts→tests/fn/ · deploy.yml→.github/workflows/)', async () => {
    await page.setInputFiles('#opsFile', [{ name: 'check.mjs', mimeType: 'text/javascript', buffer: Buffer.from('// c') }, { name: 'ops.test.ts', mimeType: 'text/plain', buffer: Buffer.from('// t') }, { name: 'deploy.yml', mimeType: 'text/yaml', buffer: Buffer.from('name: x') }]);
    await page.waitForTimeout(400);
    const ps = await page.evaluate(() => SVC.OPS.files.map((f) => f.path).sort());
    assert(ps.join('|') === '.github/workflows/deploy.yml|tests/check.mjs|tests/fn/ops.test.ts', ps.join('|'));
    const ui = await page.evaluate(() => ({ wf: !!document.querySelector('[data-wfcopy]'), root: [...document.querySelectorAll('#opsBody .ctag')].map((e) => e.textContent).join(',') }));
    assert(ui.wf && /저장소 루트/.test(ui.root) && /GitHub 웹에서/.test(ui.root), JSON.stringify(ui)); return ps.join(' · ');
  });
  await S.t('㊿+160 배포 안전장치: 묶음 폴더(1_github/ · 2_repo/)째 넣어도 이름 자동으로 뗌 → 저장소 파일은 루트 · 사이트 파일은 staging/', async () => {
    const keep = await page.evaluate(() => SVC.OPS.files.slice());
    const ap = await page.evaluate(() => ['2_repo/supabase/functions/ops/index.ts', '2_repo/tests/fn/ops.test.ts', '1_github/js/grid.js', '1_github/index.html', '1_github/check.mjs', 'js/x_github/a.js'].map((p) => SVC.opsAutoPath(p)));
    const ps = ap.map((x) => x.path).join('|');
    assert(ps === 'supabase/functions/ops/index.ts|tests/fn/ops.test.ts|js/grid.js|index.html|tests/check.mjs|js/x_github/a.js', ps);
    assert(/«2_repo\/» 폴더 이름은 떼고/.test(ap[0].auto) && /tests\//.test(ap[4].auto) && !ap[5].auto, JSON.stringify(ap));
    await page.evaluate(() => { SVC.OPS.target = 'staging'; SVC.OPS.files = [{ path: '2_repo/supabase/functions/ops/index.ts', size: 1, content: 'x' }]; });
    const dest = await page.evaluate(() => SVC.opsDest(SVC.opsAutoPath('2_repo/supabase/functions/ops/index.ts').path) + ' · ' + SVC.opsDest(SVC.opsAutoPath('1_github/js/grid.js').path));
    assert(dest === 'supabase/functions/ops/index.ts · staging/js/grid.js', dest);
    await page.evaluate((k) => { SVC.OPS.target = 'prod'; SVC.OPS.files = k; SVC.renderOps(true); }, keep);
    return dest;
  });
  await S.t('배포 안전장치: 스테이징 대상이어도 저장소 파일은 루트로 · 워크플로 파일은 커밋에서 빠지고 목록에 남음', async () => {
    await page.click('#opsTarget button[data-tg="staging"]'); await page.waitForTimeout(150);
    await page.evaluate(() => { SVC.OPS.files.push({ path: 'README.md', size: 3, content: '# r' }, { path: 'index.html', size: 60, content: '<meta name="app-ver" content="2026-09-16 ㊿+999"><meta name="app-js" content="js/core.js,js/init.js">', ver: '2026-09-16 ㊿+999' }); SVC.renderOps(true); });
    calls.length = 0; await page.click('#opsCommit'); await page.waitForTimeout(700);
    const put = calls.find((c) => c.action === 'gh_put'); assert(put, 'gh_put 없음');
    const paths = put.files.map((f) => f.path).sort();
    assert(paths.join('|') === 'README.md|staging/index.html|staging/tests/check.mjs|tests/fn/ops.test.ts', paths.join('|'));
    assert(/^\[staging\]/.test(put.message), put.message);
    const left = await page.evaluate(() => SVC.OPS.files.map((f) => f.path)); assert(left.length === 1 && left[0] === '.github/workflows/deploy.yml', left.join(','));
    return paths.join(' · ');
  });
  await S.t('배포 안전장치: 커밋 전 경고(루트의 .mjs · 안 쓰는 js) · index.ts 는 경로를 고쳐야 커밋', async () => {
    await page.click('#opsTarget button[data-tg="prod"]'); await page.waitForTimeout(100);
    await page.evaluate(() => { SVC.OPS.files = [{ path: 'foo.mjs', size: 1, content: 'x' }, { path: 'js/app.js', size: 1, content: 'x' }]; SVC.renderOps(true); });
    calls.length = 0; dialogs.length = 0; dismissNext = true; await page.click('#opsCommit'); await page.waitForTimeout(300);
    assert(dialogs[0] && /foo\.mjs.*루트/.test(dialogs[0]) && /js\/app\.js.*불러오지 않는/.test(dialogs[0]) && !calls.some((c) => c.action === 'gh_put'), (dialogs[0] || '').slice(0, 200));
    await page.evaluate(() => { SVC.OPS.files = []; SVC.opsAddFiles([new File(['x'], 'index.ts')]); }); await page.waitForTimeout(300);
    calls.length = 0; await page.click('#opsCommit'); await page.waitForTimeout(200);
    const m = await page.$eval('#opsMsg', (e) => e.textContent); assert(/supabase\/functions/.test(m) && !calls.some((c) => c.action === 'gh_put'), m);
    await page.evaluate(() => { SVC.OPS.files = []; SVC.renderOps(true); });
    return 'warn·block';
  });
  await S.t('배포 안전장치: 🧹 저장소 점검 — 안 쓰는 파일·스테이징 저장소 파일·루트에 없는 파일·deploy.yml → 정리(gh_delete)', async () => {
    await page.click('#opsRepoCheck'); await page.waitForTimeout(600);
    const R = await page.evaluate(() => SVC.OPS.repo);
    assert(R.unused.map((x) => x.p).sort().join('|') === 'check.mjs|js/app.js|staging/2_repo/supabase/functions/ops/index.ts|staging/js/app.js', JSON.stringify(R.unused));
    assert(/제자리\(supabase\/functions\/ops\/index\.ts\)에 없음/.test(R.unused.find((x) => /2_repo/.test(x.p)).why), JSON.stringify(R.unused));
    assert(R.stagingRepo.length === 3 && R.stagingRepo.find((x) => x.p === 'staging/README.md').root === false && R.stagingRepo.find((x) => x.p === 'staging/.github/workflows/deploy.yml').root === true, JSON.stringify(R.stagingRepo));
    assert(R.missing.includes('tests/fn/_mock.ts') && R.missing.includes('README.md') && R.wf.length >= 3, JSON.stringify({ m: R.missing, wf: R.wf }));
    /* 저장소에 실제로 있는 deploy.yml 은 점검에서 문제 0 이어야 함(주석의 «|| echo» 글자를 잡지 않음 · ㊿+144) */
    const wfPath = path.join(ROOT, '.github', 'workflows', 'deploy.yml');
    if (fs.existsSync(wfPath)) { const iss = await page.evaluate((y) => SVC.opsWfIssues(y), fs.readFileSync(wfPath, 'utf8')); assert(!iss.length || /ubuntu-latest|Node 20|옛 액션|functions 잡|export 함수 테스트/.test(iss.join(' ')), '저장소 deploy.yml 점검: ' + iss.join(' / ')); }
    calls.length = 0; await page.click('#opsRepoClean'); await page.waitForTimeout(500);
    const del = calls.find((c) => c.action === 'gh_delete'); assert(del, 'gh_delete 없음');
    assert(del.paths.sort().join('|') === 'check.mjs|js/app.js|staging/.github/workflows/deploy.yml|staging/2_repo/supabase/functions/ops/index.ts|staging/js/app.js', del.paths.join('|'));
    assert(!errs.length, errs.join(' | ')); return del.paths.length + '개 정리';
  });
  await ctx.close();
}
// ㊿+145: 로그아웃 → 서버 왕복 없이 로그인 화면 · 로그인 → 항상 대시보드 · 메뉴는 첫 화면 · 뒤로가기는 이어서 · AI 점검 표 · 사본 쓰기 취소 · 폭 감시 1개
{
  let sbN = 0; let counting = false;
  const { ctx, page, errs } = await open({ noSession: true, extra: async (route, u) => { if (counting) sbN++;
    if (u.includes('grant_type=password')) { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'tok', refresh_token: 'r1', expires_in: 3600, token_type: 'bearer', user: { id: 'u1', email: 'tester@example.com', user_metadata: { pw_changed: true } } }) }); return true; }
    return false; } });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await S.t('㊿+145 로그인 → 대시보드 · 다른 메뉴에서 로그아웃 → Supabase 호출 없이 로그인 화면 · 주소의 #메뉴 지움', async () => {
    assert(await page.evaluate(() => !document.getElementById('viewLogin').classList.contains('hidden')), '처음 로그인 화면 아님');
    await page.fill('#lsEmail', 'tester@example.com'); await page.fill('#lsPw', 'pw'); await page.click('#lsGo'); await page.waitForTimeout(1500);
    assert(await page.evaluate(() => SVC.ST.CUR_VIEW === 'dash' && !document.getElementById('viewDash').classList.contains('hidden')), '로그인 뒤 대시보드 아님');
    await page.evaluate(() => SVC.navMenu('contracts')); await page.waitForTimeout(400);
    assert(await page.evaluate(() => location.hash) === '#contracts', '해시 ' + await page.evaluate(() => location.hash));
    counting = true; sbN = 0;
    await page.evaluate(() => { setTimeout(() => SVC.doLogout(), 0); }); await page.waitForTimeout(1500);
    const st = await page.evaluate(() => ({ login: !document.getElementById('viewLogin').classList.contains('hidden'), hash: location.hash, sess: !!sessionStorage.getItem('svc_sess') }));
    counting = false;
    assert(st.login && !st.hash && !st.sess, JSON.stringify(st)); assert(sbN === 0, '로그아웃 뒤 Supabase 호출 ' + sbN + '번');
    await page.fill('#lsEmail', 'tester@example.com'); await page.fill('#lsPw', 'pw'); await page.click('#lsGo'); await page.waitForTimeout(1500);
    assert(await page.evaluate(() => SVC.ST.CUR_VIEW === 'dash' && !location.hash), '다시 로그인 뒤 대시보드 아님');
    assert(!errs.length, errs.join(' | ')); return 'logout→login 화면 Supabase 0회';
  });
  await S.t('㊿+145 주소에 #메뉴가 남은 채 로그인 화면에서 로그인해도 대시보드', async () => {
    await page.evaluate(() => { history.replaceState(null, '', location.pathname + '#ops'); SVC.doLogout(); }); await page.waitForTimeout(1500);
    await page.evaluate(() => history.replaceState(null, '', location.pathname + '#ops'));
    await page.fill('#lsEmail', 'tester@example.com'); await page.fill('#lsPw', 'pw'); await page.click('#lsGo'); await page.waitForTimeout(1500);
    const r = await page.evaluate(() => ({ v: SVC.ST.CUR_VIEW, h: location.hash })); assert(r.v === 'dash' && !r.h, JSON.stringify(r)); return 'dash';
  });
  await S.t('㊿+145 메뉴를 누르면 첫 화면(탭·검색·스크롤) · 뒤로가기는 이어서', async () => {
    await page.evaluate(() => SVC.navMenu('ops')); await page.waitForTimeout(500);
    await page.click('#opsTabs [data-t="log"]'); await page.waitForTimeout(500);
    assert(await page.evaluate(() => SVC.OPS.tab) === 'log', '기록 탭으로 안 바뀜');
    await page.evaluate(() => SVC.navMenu('contracts')); await page.waitForTimeout(400);
    await page.evaluate(() => SVC.goBack()); await page.waitForTimeout(600);
    assert(await page.evaluate(() => SVC.ST.CUR_VIEW === 'ops' && SVC.OPS.tab === 'log'), '뒤로가기가 이어서 보지 않음');
    await page.evaluate(() => document.querySelector('#side button[data-v="dash"]').click()); await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('#side button[data-v="ops"]').click()); await page.waitForTimeout(500);
    assert(await page.evaluate(() => SVC.OPS.tab) === 'gh', '메뉴로 들어왔는데 탭 유지: ' + await page.evaluate(() => SVC.OPS.tab));
    await page.evaluate(() => document.querySelector('#side button[data-v="churn"]').click()); await page.waitForTimeout(500);
    await page.evaluate(() => { SVC.CHURN.q = 'zz'; SVC.renderChurn(); window.scrollTo(0, 900); }); await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('#side button[data-v="dash"]').click()); await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('#side button[data-v="churn"]').click()); await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({ q: SVC.CHURN.q, y: Math.round(scrollY) })); assert(r.q === '' && r.y === 0, JSON.stringify(r));
    await page.evaluate(() => { SVC.STATE.ind = '제조'; }); await page.evaluate(() => document.querySelector('#side button[data-v="dash"]').click()); await page.waitForTimeout(400);
    assert(await page.evaluate(() => SVC.STATE.ind === '' && SVC.STATE.base === SVC.ST.DASH_BASE0), '홈 거르기 초기화 안 됨');
    assert(!errs.length, errs.join(' | ')); return 'ops 탭 · 해지 검색 · 스크롤 · 홈 거르기';
  });
  await S.t('㊿+145 AI 점검 표 — 질문 칸이 찌그러지지 않고 표가 카드 안에', async () => {
    await page.setViewportSize({ width: 1920, height: 1000 });
    await page.evaluate(() => { SVC.navMenu('ops'); SVC.OPS.tab = 'log'; const A = '이번 달(2026-10) MRR은 약 9,956만원(99,557,735원)이고, 연환산 ARR로는 11.95억원입니다. 전월(9월) 9,932만원에서 24만원 정도 늘어, 증가폭이 최근 몇 달보다 확 줄었습니다. 서비스별로는 Cloud NAC가 6,061만원';
      SVC.OPS.aic = { running: false, at: '2026-10-04T09:00:00', rows: SVC.AI_CHECK_QS.map((x, i) => ({ q: x.q, l: x.l, st: i ? '통과' : '기대값 없음', ok: !!i, ms: 6200, model: 'claude-sonnet-5-5', tools: 1, text: A })) }; SVC.renderOps(true); });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => { const t = document.querySelector('#opsAiCheck').closest('#opsBody').querySelector('td.q-col').closest('table'); const card = document.getElementById('opsHost');
      const qs = Array.from(t.querySelectorAll('td.q-col')).map((c) => c.getBoundingClientRect().width); const res = Array.from(t.querySelectorAll('td.nw')).map((c) => { const g = document.createRange(); g.selectNodeContents(c); const b = g.getBoundingClientRect(); return b.height; });   /* 칸 안 글자 높이(한 줄 ≈ 20px) */
      return { minQ: Math.min(...qs), maxResH: Math.max(...res), over: Math.round(t.getBoundingClientRect().right - card.getBoundingClientRect().right) }; });
    assert(r.minQ >= 140 && r.maxResH < 30 && r.over <= 2, JSON.stringify(r)); await page.setViewportSize({ width: 1440, height: 1000 }); return JSON.stringify(r);
  });
  await S.t('㊿+145 사본(sessionStorage) 쓰기는 나중에 · 무효화하면 예약도 취소 · 폭 감시는 1개', async () => {
    const r = await page.evaluate(async () => {
      SVC.cacheDrop(); SVC.cacheWriteLater([[1]]); SVC.cacheDrop(); await new Promise((ok) => setTimeout(ok, 3300)); const dropped = sessionStorage.getItem(SVC.CACHE_KEY) === null;
      SVC.cacheWriteLater([[{ id: 1 }]]); await new Promise((ok) => setTimeout(ok, 3300)); const written = !!sessionStorage.getItem(SVC.CACHE_KEY);
      SVC.navMenu('dash'); SVC.onData(SVC.ST.DATA); SVC.onData(SVC.ST.DATA); await new Promise((ok) => setTimeout(ok, 400));
      window.__rn = 0; new MutationObserver((ms) => { window.__rn += ms.length; }).observe(document.getElementById('filterCount'), { childList: true, characterData: true, subtree: true });   /* ㊿+153: 모듈 함수는 밖에서 바꿔 끼울 수 없어 renderAll 이 매번 쓰는 #filterCount 로 셈 */
      return { dropped, written, wwOn: SVC._wwOn };
    });
    await page.setViewportSize({ width: 1100, height: 1000 }); await page.waitForTimeout(700);
    const n = await page.evaluate(() => window.__rn);
    assert(r.dropped && r.written && r.wwOn && n <= 1, JSON.stringify(r) + ' renderAll×' + n); await page.setViewportSize({ width: 1440, height: 1000 }); return JSON.stringify(r) + ' 크기 바꿈 → renderAll ' + n + '번';
  });
  await ctx.close();
}
// ㊿+146: 폰 — 글자가 한 글자씩 세로로 쌓이는 곳 0 (대시보드 분석 펼침 · 데이터 점검 · 관리자 · 유입경로) · 장표 연도 탭은 고른 연도가 보임
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const page = await ctx.newPage(); const c = collect(page);
  await mockBackend(page, {}); await page.goto(url + '/index.html'); await page.waitForTimeout(2200);
  const stacked = () => page.evaluate(() => { const out = []; const w = document.createTreeWalker(document.getElementById('app'), NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { const t = n.nodeValue.replace(/\s+/g, ''); if (t.length < 4) continue; const el = n.parentElement; if (!el || !el.offsetParent) continue;
      const cs = getComputedStyle(el); const rg = document.createRange(); rg.selectNodeContents(n); const rr = Array.from(rg.getClientRects()).filter((x) => x.width > 0); if (!rr.length) continue;
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.35; const lines = Math.max(1, Math.round((Math.max(...rr.map((x) => x.bottom)) - Math.min(...rr.map((x) => x.top))) / lh));
      if (lines >= 3 && t.length / lines < 3.2) out.push(t.slice(0, 12) + '(' + lines + '줄)'); }
    return out; });
  await S.t('㊿+146 폰 대시보드(분석 펼침) — 세로로 쌓인 글자 없음 · 장표 연도 탭에 고른 연도가 보임', async () => {
    await page.evaluate(() => { const b = document.getElementById('ccAnaBtn'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); }); await page.waitForTimeout(1200);
    const bad = await stacked(); assert(!bad.length, bad.slice(0, 6).join(', '));
    const seg = await page.evaluate(() => { const s = document.getElementById('segMxYear'); const b = s && s.querySelector('[aria-pressed="true"]'); if (!s || !b || !s.offsetParent) return null;
      const sr = s.getBoundingClientRect(), br = b.getBoundingClientRect(); return { inView: br.left >= sr.left - 1 && br.right <= sr.right + 1, headH: Math.round(s.closest('.card-head').querySelector('h2').getBoundingClientRect().height) }; });
    assert(seg && seg.inView && seg.headH < 40, JSON.stringify(seg)); assert(!c.errs.length, c.errs.join(' | ')); return JSON.stringify(seg);
  });
  for (const v of ['dcheck', 'adminx', 'leadsrc', 'ops']) {
    await S.t('㊿+146 폰 ' + v + ' — 세로로 쌓인 글자 없음 · 페이지가 옆으로 밀리지 않음', async () => {
      await page.evaluate((v) => { SVC.navMenu(v); }, v); await page.waitForTimeout(900);
      const bad = await stacked(); const over = await page.evaluate(() => document.documentElement.scrollWidth - 390);
      assert(!bad.length && over <= 1, JSON.stringify({ bad: bad.slice(0, 4), over })); return 'OK';
    });
  }
  await ctx.close();
}
// ㊿+147: 100점 1차 — SQL 엔진 격리(unsafe-eval 없음) · AI 점검 만원 표기 · 색 대비 0(라이트·다크) · 관리자 MFA 역할 기본 · 칩 글자색
{
  const ALA = path.join(ROOT, 'node_modules', 'alasql', 'dist', 'alasql.min.js');
  const AXE = path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js');
  const roleCalls = []; let roleRows = [{ role: 'super_admin', required: true, grace_days: 14, since: '2026-10-05', deadline: '2026-10-19' }, { role: 'admin', required: true, grace_days: 14, since: '2026-10-05', deadline: '2026-10-19' }];
  const { ctx, page, errs, csp } = await open({ extra: async (route, u, m) => {
    if (u.includes('/rpc/mfa_role_list')) { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(roleRows) }); return true; }
    if (u.includes('/rpc/mfa_role_set')) { const b = JSON.parse(route.request().postData() || '{}'); roleCalls.push(b); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ role: b.p_role, required: b.p_required }) }); return true; }
    if (u.includes('/rpc/mfa_admin_list')) { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ email: 'tester@example.com', role: 'super_admin', enrolled: false, required: false, deadline: null, eff_required: true, eff_deadline: '2026-10-19', source: 'role' }, { email: 'v@example.com', role: 'viewer', enrolled: false, required: false, deadline: null, eff_required: false, eff_deadline: null, source: 'none' }]) }); return true; }
    return false; } });
  if (fs.existsSync(ALA)) await page.route(/cdn\.jsdelivr\.net\/npm\/alasql@4\.19\.0\/dist\/alasql\.min\.js/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(ALA, 'utf8') }));
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await S.t('㊿+147 AI 점검 숫자: 만원·원 표기 인정 · 다른 금액은 불인정 · 칩 글자색(밝은 바탕엔 검정)', async () => {
    await page.evaluate(() => SVC.lazyLoad('admin'));   /* ㊿+153: 관리자 코드는 처음 열 때 받음 */
    const r = await page.evaluate(() => ({ a: SVC.aiHasNum('이번 달 MRR은 약 9,956만원(99,557,735원)', 99557735), b: SVC.aiHasNum('99,557,735원', 99557735), c: SVC.aiHasNum('약 8,000만원', 99557735), d: SVC.inkOn('#eda100'), e: SVC.inkOn('#226bc4'), f: SVC.inkOn('rgb(27, 175, 122)') }));
    assert(r.a && r.b && !r.c && r.d === '#111' && r.e === '#fff', JSON.stringify(r)); return JSON.stringify(r);
  });
  await S.t('㊿+147 리포트 SQL: 격리 칸(sandbox · 출처 없음)에서 실행 · 결과 표 · 보조 함수 · 칸 제거 · 본 포탈엔 alasql 없음', async () => {
    if (!fs.existsSync(ALA)) return '건너뜀 — node_modules/alasql 없음(npm install)';
    await page.evaluate(() => { SVC.navMenu('report'); }); await page.waitForTimeout(700);
    await page.evaluate(() => { SVC.QB.mode = 'sql'; SVC.QB.sql = "SELECT SVC(ct.line) AS 서비스, NMKEY('(주)가상 고객_1') AS k, QTR('2026-05') AS q, COUNT(*) AS 계약수 FROM contracts ct GROUP BY SVC(ct.line)"; SVC.renderReport(); SVC.qbRunNow(); });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => ({ n: SVC.QB.res && SVC.QB.res.rows.length, cols: SVC.QB.res && SVC.QB.res.cols.map((c) => c.id).join(','), row: SVC.QB.res && SVC.QB.res.rows[0], err: (document.getElementById('qbSqlErr') || {}).textContent || '', frames: document.querySelectorAll('iframe[sandbox]').length, ala: !!window.alasql, nk: SVC.nmKeys('(주)가상 고객_1')[0] }));
    assert(r.n > 0 && /서비스,k,q,계약수/.test(r.cols) && r.row[1] === r.nk && r.row[2] === '2026-Q2' && !r.err && r.frames === 0 && !r.ala, JSON.stringify(r));
    await page.evaluate(() => { SVC.QB.sql = 'SELECT nope FROM nosuch'; SVC.renderReport(); SVC.qbRunNow(); }); await page.waitForTimeout(2000);
    const e2 = await page.evaluate(() => (document.getElementById('qbSqlErr') || {}).textContent || ''); assert(/표가 없습니다|nosuch|오류/.test(e2), '오류 안내: ' + e2);
    const f = await page.evaluate(() => { const src = SVC.sqlboxRun.toString(); return /setAttribute\('sandbox','allow-scripts'\)/.test(src) && !/allow-same-origin/.test(src); }); assert(f, 'sandbox 속성');
    await page.evaluate(() => { SVC.QB.mode = 'ui'; }); return r.n + '행 · ' + r.row.slice(0, 3).join(' / ');
  });
  await S.t('㊿+147 관리자 › 2단계 인증: 역할 기본(슈퍼·관리자 필수 14일) 표시 · 끄기 저장 → mfa_role_set · 목록에 «역할 기본»', async () => {
    await page.evaluate(async () => { await SVC.lazyLoad('admin'); SVC.navMenu('adminx'); SVC.admTab('sec'); }); await page.waitForTimeout(1200);
    const vis = await page.evaluate(() => { const b = document.getElementById('mfRole'); return !!b && b.style.display !== 'none' && /역할 기본/.test(b.textContent) && /유예 중/.test(b.textContent); });
    assert(vis, '역할 기본 칸 없음');
    assert(/역할 기본/.test(await page.$eval('#mfTable', (e) => e.textContent)), '목록에 역할 기본 표시 없음');
    await page.uncheck('#mfRole [data-mfr="admin"]'); await page.click('#mfRoleSave'); await page.waitForTimeout(600);
    assert(roleCalls.length === 1 && roleCalls[0].p_role === 'admin' && roleCalls[0].p_required === false && roleCalls[0].p_grace_days === 14, JSON.stringify(roleCalls));
    return JSON.stringify(roleCalls[0]);
  });
  for (const theme of ['light', 'dark']) {
    await S.t('㊿+147 색 대비(axe) ' + theme + ' — 홈(분석 펼침)·장비 보드·데이터 점검·해지율 0건', async () => {
      if (!fs.existsSync(AXE)) return '건너뜀 — node_modules/axe-core 없음';
      await page.evaluate((t) => { try { localStorage.setItem('svc_theme', t); applyTheme && applyTheme(t); } catch (e) { /* */ } document.documentElement.setAttribute('data-theme', t); }, theme);
      await page.evaluate(() => { if (!document.getElementById('noAnim')) { const st = document.createElement('style'); st.id = 'noAnim'; st.textContent = '*,*::before,*::after{animation-duration:0s!important;transition:none!important}'; document.head.appendChild(st); } });
      const bad = [];
      for (const v of ['dash', 'eqboard', 'dcheck', 'churnrate', 'ops']) {
        await page.evaluate((v) => { SVC.navMenu(v); if (v === 'dash') { const b = document.getElementById('ccAnaBtn'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); } if (v === 'ops') { SVC.OPS.tab = 'log'; SVC.renderOps(true); } }, v);
        await page.waitForTimeout(900);
        if (!(await page.evaluate(() => !!window.axe))) await page.evaluate(fs.readFileSync(AXE, 'utf8'));   // addScriptTag 는 CSP(인라인 금지)에 막힘
        const r = await page.evaluate(async () => { const res = await axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] }, resultTypes: ['violations'] }); return res.violations.flatMap((x) => x.nodes.map((n) => n.target.join(' ') + ' ' + ((n.any[0] || {}).data || {}).contrastRatio)); });
        r.slice(0, 3).forEach((x) => bad.push(v + ': ' + x));
      }
      assert(!bad.length, bad.slice(0, 6).join(' | ')); return '0';
    });
  }
  await S.t('㊿+147 오류·CSP 위반 없음', async () => { assert(!errs.length, errs.join(' | ')); assert(!csp.length, csp.join(' | ')); });
  await ctx.close();
}
// ㊿+148 데이터 점검 수정 창 · 업데이트 안내 팝업
{
  const { FIX } = await import('./lib.mjs');
  const writes = [], dialogs = []; let fixed = null, pending = { notify: false }, notesDb = [], notifyDb = [], ackDb = [], apiKeysDb = null, apiLogDb = [];
  const J = (route, o, st = 200) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(o) });
  const { ctx, page, errs } = await open({ onWrite: (w) => writes.push(w), extra: async (route, u, m) => {
    /* ㊿+164 외부 연동 API 키 — apiKeysDb 가 null 이면 «SQL 102 전»(함수 없음 404) */
    if (/\/rpc\/(api_key_list|api_access_recent|api_key_create|api_key_revoke)/.test(u)) { const fn = /\/rpc\/(\w+)/.exec(u)[1], b = JSON.parse(route.request().postData() || '{}'); writes.push({ m, url: u, body: route.request().postData() });
      if (!apiKeysDb) { await J(route, { code: 'PGRST202', message: 'Could not find the function public.' + fn }, 404); return true; }
      if (fn === 'api_key_list') { await J(route, apiKeysDb); return true; }
      if (fn === 'api_access_recent') { await J(route, apiLogDb); return true; }
      if (fn === 'api_key_create') { const id = apiKeysDb.length + 1, key = 'svc_' + String(id).repeat(64).slice(0, 64); apiKeysDb.unshift({ id, name: b.p_name, prefix: key.slice(0, 12), scopes: b.p_scopes, names: b.p_names, note: b.p_note, expires_at: b.p_days ? '2027-10-08T00:00:00Z' : null, active: true, revoked_at: null, expired: false, last_used_at: null, use_count: 0, calls_7d: 0, errors_7d: 0 }); await J(route, { id, name: b.p_name, key, prefix: key.slice(0, 12) }); return true; }
      if (fn === 'api_key_revoke') { const k = apiKeysDb.find((x) => x.id === b.p_id); k.active = false; k.revoked_at = '2026-10-08T09:00:00Z'; await J(route, { id: k.id, revoked_at: k.revoked_at }); return true; } }
    if (u.includes('/rpc/load_all') && fixed) { const d = JSON.parse(JSON.stringify(FIX)); d.contracts.forEach((c) => { if (fixed[c.id]) Object.assign(c, fixed[c.id]); }); d.roles = [{ role: 'super_admin' }]; await J(route, d); return true; }
    if (u.includes('/rpc/upd_pending')) { writes.push({ m, url: u, body: '' }); await J(route, pending); return true; }
    if (u.includes('/rpc/upd_ack_set')) { writes.push({ m, url: u, body: route.request().postData() }); await J(route, { ok: true, last_id: JSON.parse(route.request().postData()).p_last_id }); return true; }
    if (u.includes('/rest/v1/upd_notes') && m === 'GET') { await J(route, /select=ver$/.test(u.split('?')[1] || '') ? notesDb.map((n) => ({ ver: n.ver })) : notesDb); return true; }
    if (u.includes('/rest/v1/upd_notes') && m === 'POST') { const b = JSON.parse(route.request().postData()); writes.push({ m, url: u, body: route.request().postData() }); (Array.isArray(b) ? b : [b]).forEach((x) => notesDb.push(Object.assign({ id: notesDb.length + 1, active: true }, x))); await route.fulfill({ status: 201, body: '' }); return true; }
    if (u.includes('/rest/v1/upd_notify') && m === 'GET') { await J(route, notifyDb); return true; }
    if (u.includes('/rest/v1/upd_ack') && m === 'GET') { await J(route, ackDb); return true; }
    if (u.includes('/rpc/admin_list_users')) { await J(route, [{ email: 'tester@example.com', role: 'super_admin' }, { email: 'sales@example.com', role: 'admin' }]); return true; }
    return false; } });
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });
  await S.t('㊿+148 데이터 점검: 항목 → 수정 창(목록 밖 상태 표시) → 저장 PATCH(바뀐 칸만) · change_log · 다시 점검 → 다음 항목', async () => {
    await page.evaluate(() => SVC.switchView('dcheck')); await page.waitForTimeout(400);
    await page.click('#bizHost [data-dc="c_vocab"]'); await page.waitForTimeout(200);
    const n0 = await page.evaluate(() => SVC.dcRules().filter((r) => r.id === 'c_vocab')[0].items.length);
    await (await page.$$('#bizHost [data-dcgo^="c_vocab:"]'))[0].click(); await page.waitForTimeout(300);
    const ui = await page.evaluate(() => { const o = document.getElementById('ovlDcFix'); return o && { title: o.querySelector('#dcfTitle').textContent, pos: o.querySelector('#dcfPos').textContent, bad: o.querySelectorAll('.dcf-row.bad').length, sel: [...o.querySelectorAll('#dcfForm select[data-k]')].map((x) => x.dataset.k), save: !!o.querySelector('#dcfSave'), id: SVC.dcRules().filter((r) => r.id === 'c_vocab')[0].items[0].fix.id }; });
    assert(ui && /선택 목록/.test(ui.title) && ui.pos === '1 / ' + n0 && ui.bad >= 1 && ui.sel.includes('status') && ui.save, JSON.stringify(ui));
    const nothing = await page.evaluate(async () => { document.getElementById('dcfSave').click(); await new Promise((r) => setTimeout(r, 100)); return document.getElementById('dcfMsg').textContent; });
    assert(/바뀐 값이 없습니다/.test(nothing), '변경 없음 안내 ' + nothing);
    const pick = await page.evaluate(() => { const v = {}; document.querySelectorAll('#dcfForm select[data-k]').forEach((s) => { const o = [...s.options].map((x) => x.value).filter((x) => x && SVC.codeActive({ status: 'contract_status', contract_type: 'contract_type', channel: 'channel', line: 'line', lead_src: 'lead_src', live_override: 'live_override' }[s.dataset.k], x)); s.value = o[0]; s.dispatchEvent(new Event('change', { bubbles: true })); v[s.dataset.k] = o[0]; }); return v; });
    fixed = { [ui.id]: pick }; writes.length = 0;
    await page.click('#dcfSave'); await page.waitForTimeout(1600);
    const patch = writes.filter((w) => w.m === 'PATCH' && /contracts\?id=eq\./.test(w.url))[0]; assert(patch, 'PATCH 없음 ' + JSON.stringify(writes.map((w) => w.m + ' ' + w.url.split('/rest/v1/')[1])));
    const b = JSON.parse(patch.body); assert(patch.url.includes('id=eq.' + ui.id) && b.status === pick.status && b.updated_at && Object.keys(b).every((k) => k === 'updated_at' || k in pick), JSON.stringify(b));
    assert(writes.some((w) => /change_log/.test(w.url) && /데이터 점검/.test(w.body)), 'change_log(_via 데이터 점검) 없음');
    const after = await page.evaluate(() => { const o = document.getElementById('ovlDcFix'); return o && { pos: o.querySelector('#dcfPos').textContent, n: SVC.dcRules().filter((r) => r.id === 'c_vocab')[0].items.length }; });
    assert(after && after.n === n0 - 1 && after.pos === '1 / ' + (n0 - 1), '다음 항목으로 안 넘어감 ' + JSON.stringify(after) + ' n0=' + n0);
    return n0 + '→' + after.n + ' · ' + JSON.stringify(b).slice(0, 80);
  });
  await S.t('㊿+148 수정 창: ◀▶ 이동 · 아직 걸리면 그대로 · 이달 매출 입력(천원 → 원 POST) · 화면에서 보기', async () => {
    await page.evaluate(() => { SVC.dcFixClose(); SVC.dcFixOpen('c_lead', 0); }); await page.waitForTimeout(200);
    await page.click('#dcfNext'); await page.waitForTimeout(150);
    assert(/^2 \//.test(await page.$eval('#dcfPos', (e) => e.textContent)), '▶ 이동 안 됨');
    await page.click('#dcfPrev'); await page.waitForTimeout(150);
    // 저장했는데 (가짜 DB 가 그대로라) 아직 걸림 → 같은 항목 + 안내
    const lead = await page.evaluate(() => { const s = document.querySelector('#dcfForm [data-k="lead_src"]'); s.value = SVC.LEAD_OPTS[0]; return SVC.dcRules().filter((r) => r.id === 'c_lead')[0].items[0].fix.id; });
    fixed = null; writes.length = 0; await page.click('#dcfSave'); await page.waitForTimeout(1600);
    const msg = await page.$eval('#dcfMsg', (e) => e.textContent);
    assert(/아직 이 규칙에 걸립니다/.test(msg) && writes.some((w) => w.m === 'PATCH' && w.url.includes('id=eq.' + lead)), msg);
    // c_live_zero: 이달 매출을 비워 규칙에 걸리게 한 뒤 수정 창에서 천원 입력
    const ok = await page.evaluate(() => { const T = SVC.ST.DATA.nowIdx; const k = SVC.ST.DATA.rows.findIndex((r, i) => SVC.liveActiveAt(r, T) && !r.parent && SVC.ST.MAT[i] && SVC.ST.MAT[i][T] && !/일시납|연납|반년납|분기납/.test(String(r.billing || ''))); if (k < 0) return null; SVC.ST.MAT[k][T] = 0; const it = SVC.dcRules().filter((r) => r.id === 'c_live_zero')[0].items; return it.length ? it.findIndex((x) => x.fix.id === SVC.ST.DATA.rows[k]._id) : null; });
    if (ok == null || ok < 0) return '이달 매출 0 상황을 못 만듦 — 앞 단계만 확인';
    await page.evaluate((i) => { SVC.dcFixClose(); SVC.dcFixOpen('c_live_zero', i); }, ok); await page.waitForTimeout(200);
    await page.fill('#dcfRev', '1234'); writes.length = 0; await page.click('#dcfSave'); await page.waitForTimeout(1500);
    const post = writes.filter((w) => w.m === 'POST' && /monthly_revenue/.test(w.url))[0]; assert(post, 'monthly_revenue POST 없음');
    const pb = JSON.parse(post.body); assert(pb.amount === 1234000 && pb.month && pb.contract_id, JSON.stringify(pb));
    await page.evaluate(() => { SVC.dcFixClose(); SVC.dcFixOpen('c_s1no', 0); }); await page.waitForTimeout(200);
    await page.click('#dcfGo'); await page.waitForTimeout(400);
    assert(!(await page.$('#ovlDcFix')) && (await page.evaluate(() => SVC.ST.CUR_VIEW)) === 'contracts', '화면에서 보기 → 계약 관리 아님');
    return 'POST ' + JSON.stringify(pb);
  });
  await S.t('㊿+148 업데이트 안내: 슈퍼가 열면 안내문 자동 채움(오래된 것부터) · 체크된 계정에 팝업 · 확인 체크 전 비활성 · 확인 → upd_ack_set(최대 id)', async () => {
    notesDb = []; writes.length = 0;
    const n = await page.evaluate(async () => { SVC.UPD.checked = false; await SVC.updSyncSeed(); return SVC.UPD_SEED.length; });
    const post = writes.filter((w) => w.m === 'POST' && /upd_notes/.test(w.url))[0]; assert(post, 'upd_notes POST 없음');
    const pb = JSON.parse(post.body); assert(pb.length === n && pb[0].ver === '㊿+98~117' && pb[n - 1].ver === (await page.evaluate(() => (SVC.APP_VER.match(/㊿\+\d+/) || [''])[0])) && pb.every((x) => x.title && /^- /.test(x.body) && /^\d{4}-\d\d-\d\d$/.test(x.published_on)), JSON.stringify(pb.map((x) => x.ver)));
    writes.length = 0; await page.evaluate(async () => { await SVC.updSyncSeed(); }); assert(!writes.some((w) => w.m === 'POST' && /upd_notes/.test(w.url)), '이미 있으면 다시 넣지 않아야 함');
    pending = { notify: true, last_id: 0, notes: notesDb.slice(-2).reverse() };
    await page.evaluate(async () => { SVC.UPD.checked = false; await SVC.updCheck(); }); await page.waitForTimeout(200);
    const ui = await page.evaluate(() => { const o = document.getElementById('ovlUpd'); return o && { secs: o.querySelectorAll('.upd-sec').length, first: o.querySelector('.upd-sec b').textContent, dis: o.querySelector('#updDone').disabled, sub: o.querySelector('.mini').textContent, adm: o.querySelectorAll('.upd-adm').length, li: o.querySelectorAll('.upd-sec li').length }; });
    const expLi = pending.notes.reduce((a, n) => a + n.body.split('\n').filter((l) => /^- /.test(l)).length, 0), expAdm = pending.notes.reduce((a, n) => a + (n.body.match(/\(관리자\)/g) || []).length, 0);
    assert(ui && ui.secs === 2 && ui.first === notesDb[notesDb.length - 1].title && ui.dis && /지금까지/.test(ui.sub) && ui.adm === expAdm && ui.li === expLi, JSON.stringify(ui) + ' exp li ' + expLi + ' adm ' + expAdm);
    await page.check('#updOk'); assert(!(await page.$eval('#updDone', (e) => e.disabled)), '체크해도 확인 비활성');
    writes.length = 0; await page.click('#updDone'); await page.waitForTimeout(400);
    const ack = writes.filter((w) => /upd_ack_set/.test(w.url))[0]; assert(ack && JSON.parse(ack.body).p_last_id === Math.max(...pending.notes.map((x) => x.id)), JSON.stringify(ack));
    assert(!(await page.$('#ovlUpd')), '확인 뒤 팝업이 남음');
    // 나중에 보기 → 기록 안 함 / 안내 대상 아님 → 팝업 없음
    await page.evaluate(async () => { SVC.UPD.checked = false; await SVC.updCheck(); }); await page.waitForTimeout(150);
    writes.length = 0; await page.click('#updLater'); await page.waitForTimeout(200);
    assert(!(await page.$('#ovlUpd')) && !writes.some((w) => /upd_ack_set/.test(w.url)), '나중에 보기가 확인으로 기록됨');
    pending = { notify: false }; await page.evaluate(async () => { SVC.UPD.checked = false; await SVC.updCheck(); }); await page.waitForTimeout(150);
    assert(!(await page.$('#ovlUpd')), '안내 대상이 아닌데 팝업');
    return n + '개 시드 · ack ' + JSON.parse(ack.body).p_last_id;
  });
  await S.t('㊿+149 관리자 화면 탭 4개: 한 번에 한 구역만 · 탭 전환 · 메뉴를 다시 누르면 첫 탭 · 뒤로가기는 보던 탭', async () => {
    await page.evaluate(() => SVC.navMenu('adminx')); await page.waitForTimeout(700);
    const vis = () => page.evaluate(() => [...document.querySelectorAll('#viewAdmin .adm-pane')].filter((p) => p.getClientRects().length).map((p) => p.dataset.pane).join(','));
    const tabs = await page.$$eval('#admTabs button', (b) => b.map((x) => x.textContent.trim()));
    assert(tabs.length === 5 && (await vis()) === 'acct', JSON.stringify({ tabs, vis: await vis() }));
    assert(await page.evaluate(() => { const d = document.getElementById('axNewBox'); return d && !d.open && !!document.getElementById('axTable') && document.getElementById('axTable').getClientRects().length > 0; }), '새 계정 접힘·계정 표 보임 아님');
    await page.click('#admTabs [data-t="cfg"]'); await page.waitForTimeout(200);
    assert((await vis()) === 'cfg' && (await page.$eval('#admTabs [data-t="cfg"]', (b) => b.getAttribute('aria-pressed'))) === 'true', 'cfg 전환 ' + (await vis()));
    const h = await page.evaluate(() => document.querySelector('#viewAdmin section').getBoundingClientRect().height);
    await page.evaluate(() => SVC.navMenu('dash')); await page.waitForTimeout(300); await page.evaluate(() => SVC.goBack()); await page.waitForTimeout(500);
    assert((await page.evaluate(() => SVC.ST.CUR_VIEW)) === 'adminx' && (await vis()) === 'cfg', '뒤로가기 → 보던 탭 아님 ' + (await vis()));
    await page.evaluate(() => SVC.navMenu('adminx')); await page.waitForTimeout(400);
    assert((await vis()) === 'acct', '메뉴 다시 누르면 첫 탭 아님 ' + (await vis()));
    return tabs.join(' | ') + ' · 설정 탭 높이 ' + Math.round(h) + 'px';
  });
  await S.t('㊿+164 관리자 › 🔌 외부 연동: SQL 102 전이면 안내 · 키 발급(이름·범위 필수) → 원문 한 번만 · 복사 · 목록 · 폐기 확인 → 폐기 · 다시 열면 원문 사라짐', async () => {
    apiKeysDb = null; await page.evaluate(() => SVC.navMenu('adminx')); await page.waitForTimeout(500); await page.click('#admTabs [data-t="api"]'); await page.waitForTimeout(300);
    const pre = await page.$eval('#apiBox', (e) => e.textContent); assert(/SQL 102 를 먼저 실행/.test(pre), 'SQL 102 전 안내 없음 ' + pre.slice(0, 120));
    apiKeysDb = []; apiLogDb = [{ id: 1, at: '2026-10-08T09:10:00Z', key_id: null, key_name: 'svc_ffffffff…', resource: 'contracts', query: '', rows: 0, status: 401, ip: '203.0.113.9', ms: 3 }];
    await page.evaluate(() => SVC.apiLoad()); await page.waitForTimeout(300);
    assert(await page.$eval('#apiNewBox', (e) => e.open) && /아직 발급한 키가 없습니다/.test(await page.$eval('#apiBox', (e) => e.textContent)), '키 없을 때 발급 칸이 열려 있지 않음');
    assert((await page.$$eval('#apiLog tbody tr', (r) => r.length)) === 1 && /401/.test(await page.$eval('#apiLog', (e) => e.textContent)), '호출 기록 표');
    writes.length = 0; await page.click('#apiCreate'); await page.waitForTimeout(150);
    assert(/이름/.test(await page.$eval('#apiMsg', (e) => e.textContent)) && !writes.some((w) => /api_key_create/.test(w.url)), '이름 없이 발급됨');
    await page.fill('#apiName', '가상 ERP'); await page.evaluate(() => document.querySelectorAll('#apiBox .apiScope').forEach((c) => { c.checked = false; })); await page.click('#apiCreate'); await page.waitForTimeout(150);
    assert(/하나 이상/.test(await page.$eval('#apiMsg', (e) => e.textContent)) && !writes.some((w) => /api_key_create/.test(w.url)), '범위 없이 발급됨');
    await page.check('#apiBox .apiScope[value="contracts"]'); await page.check('#apiBox .apiScope[value="mrr"]'); await page.uncheck('#apiNames'); await page.selectOption('#apiDays', '90'); await page.fill('#apiNote', '회계팀');
    await page.click('#apiCreate'); await page.waitForTimeout(500);
    const cw = writes.find((w) => /api_key_create/.test(w.url)); const cb = JSON.parse(cw.body);
    assert(cb.p_name === '가상 ERP' && cb.p_scopes.join() === 'contracts,mrr' && cb.p_names === false && cb.p_days === 90 && cb.p_note === '회계팀', '발급 요청 ' + cw.body);
    const made = await page.evaluate(() => ({ key: (document.getElementById('apiKeyText') || {}).textContent, curl: (document.querySelector('.api-made .api-code') || {}).textContent, rows: [...document.querySelectorAll('#apiKeys tbody tr')].map((r) => r.textContent) }));
    assert(/^svc_1{64}$/.test(made.key) && /X-API-Key: svc_1{64}/.test(made.curl) && /functions\/v1\/export\/contracts/.test(made.curl), '원문·예시 ' + JSON.stringify(made).slice(0, 200));
    assert(made.rows.length === 1 && /가상 ERP/.test(made.rows[0]) && /계약 · 월 매출 합계/.test(made.rows[0]) && /빼고/.test(made.rows[0]) && /사용 중/.test(made.rows[0]), '목록 ' + made.rows[0]);
    await page.click('#apiMadeOk'); await page.waitForTimeout(100); assert(!(await page.$('#apiKeyText')), '숨기기 뒤에도 원문이 보임');
    dialogs.length = 0; writes.length = 0; await page.click('#apiKeys [data-revoke="1"]'); await page.waitForTimeout(400);
    assert(/폐기/.test(dialogs[0] || '') && /되살릴 수 없/.test(dialogs[0] || '') && JSON.parse(writes.find((w) => /api_key_revoke/.test(w.url)).body).p_id === 1, '폐기 확인·요청 ' + (dialogs[0] || '').slice(0, 80));
    assert(/폐기 2026-10-08/.test(await page.$eval('#apiKeys', (e) => e.textContent)) && !(await page.$('#apiKeys [data-revoke="1"]')), '폐기 표시');
    assert(!(await page.$eval('#apiNewBox', (e) => e.open)), '키가 있으면 발급 칸은 접힘'); await page.click('#apiNewBox summary'); await page.fill('#apiName', '가상 BI'); await page.click('#apiCreate'); await page.waitForTimeout(400); assert(await page.$('#apiKeyText'), '두 번째 발급 원문 없음');
    await page.evaluate(() => SVC.navMenu('dash')); await page.waitForTimeout(200); await page.evaluate(() => SVC.navMenu('adminx')); await page.waitForTimeout(500);
    assert(!(await page.$('#apiKeyText')) && !(await page.evaluate(() => SVC.API.made)), '관리자 화면을 다시 열어도 원문이 남음');
    assert(!errs.length, errs.join(' | ')); return '발급 2 · 폐기 1 · 원문 한 번만';
  });
  await S.t('㊿+148 관리자 › 업데이트 안내: 계정 «받기» upsert · 처음부터 다시 DELETE · 새 안내 POST · 내 계정 › 업데이트 내역', async () => {
    notifyDb = [{ email: 'sales@example.com', enabled: true }]; ackDb = [{ email: 'sales@example.com', last_id: notesDb.length - 1, acked_at: '2026-10-05T01:00:00Z' }];
    await page.evaluate(async () => { await SVC.lazyLoad('admin'); SVC.switchView('adminx'); SVC.admTab('cfg'); });
    await page.waitForFunction(() => { const u = document.getElementById('updUsers'); return u && u.textContent.includes('1건'); }, null, { timeout: 6000 }).catch(() => {});
    const t = await page.evaluate(() => { const u = document.getElementById('updUsers'), n = document.getElementById('updNotes'); return u && n && { users: u.querySelectorAll('tbody tr').length, unread: u.textContent.includes('1건'), notes: n.querySelectorAll('tbody tr').length }; });
    assert(t && t.users === 2 && t.unread && t.notes === notesDb.length, JSON.stringify(t));
    writes.length = 0; await page.check('#updUsers [data-updn="tester@example.com"]'); await page.waitForTimeout(500);
    const up = writes.filter((w) => w.m === 'POST' && /upd_notify\?on_conflict=email/.test(w.url))[0]; assert(up && JSON.parse(up.body).email === 'tester@example.com' && JSON.parse(up.body).enabled === true, JSON.stringify(writes.map((w) => w.url)));
    await page.waitForTimeout(400); writes.length = 0; await page.click('#updUsers [data-updreset="sales@example.com"]'); await page.waitForTimeout(500);
    assert(writes.some((w) => w.m === 'DELETE' && /upd_ack\?email=eq\.sales%40example\.com/.test(w.url)) && dialogs.some((d) => /처음부터|다시 뜹니다/.test(d)), '처음부터 다시 DELETE 없음');
    await page.waitForTimeout(400); await page.click('#updNew'); await page.waitForTimeout(150);
    await page.fill('#updETitle', '시험 안내'); await page.fill('#updEBody', '- 한 줄\n- (관리자) 두 줄'); writes.length = 0; await page.click('#updESave'); await page.waitForTimeout(500);
    const np = writes.filter((w) => w.m === 'POST' && /upd_notes/.test(w.url))[0]; assert(np && JSON.parse(np.body).title === '시험 안내' && /두 줄/.test(JSON.parse(np.body).body), '새 안내 POST 없음');
    await page.evaluate(() => SVC.switchView('account')); await page.waitForTimeout(700);
    const btn = await page.$$eval('#accBody button', (b) => b.map((x) => x.textContent)); assert(btn.some((x) => /업데이트 내역/.test(x)), '내 계정 버튼 없음 ' + btn.join(','));
    await page.evaluate(() => [...document.querySelectorAll('#accBody button')].find((x) => /업데이트 내역/.test(x.textContent)).click()); await page.waitForTimeout(400);
    const all = await page.evaluate(() => { const o = document.getElementById('ovlUpd'); return o && { secs: o.querySelectorAll('.upd-sec').length, chk: !!o.querySelector('#updOk'), close: !!o.querySelector('#updClose') }; });
    assert(all && all.secs === notesDb.length && !all.chk && all.close, JSON.stringify(all));
    await page.click('#updClose'); assert(!errs.length, errs.join(' | ')); return JSON.stringify(t);
  });
  await ctx.close();
}
{ // 권한: 계약 쓰기 없음(admin_viewer) → 수정 창은 보기만
  const { ctx, page, errs } = await open({ role: 'admin_viewer' });
  await S.t('㊿+148 수정 창 권한: 쓰기 없는 계정은 칸 비활성 · 저장 버튼 없음', async () => {
    await page.evaluate(() => { SVC.switchView('dcheck'); }); await page.waitForTimeout(300);
    const r = await page.evaluate(() => { const rule = SVC.dcRules().find((x) => x.items.some((i) => i.fix)); if (!rule) return null; SVC.dcFixOpen(rule.id, 0); const o = document.getElementById('ovlDcFix'); return { save: !!o.querySelector('#dcfSave'), en: [...o.querySelectorAll('#dcfForm select,#dcfForm input')].filter((e) => !e.disabled).length, note: /쓰기 권한이 없어/.test(o.textContent) }; });
    assert(r && !r.save && r.en === 0 && r.note, JSON.stringify(r)); assert(!errs.length, errs.join(' | ')); return JSON.stringify(r);
  });
  await ctx.close();
}
// 가격표 가짜 데이터(실제 모양 · 판 1개 · SaaS) — 가격표 폭·QA 테스트 공용
const PB_AT = ['1~49', '50~99', '100~299', '300~499', '500~999', '1000~2999', '3000~4999', '5000~9999', '10000~'], PB_NT = ['1~100', '101~200', '201~300', '301~400', '401~500', '501~600', '601~700', '701~800', '801~900', '901~1000', '1001~1500', '1501~2000', '2001~2500', '2501~3000'];
const pbSv = (name, base) => ({ name, icon: '🛡️', sub: '24시간 365일 관제 · Cloud Insights E 에 추가', tiers: PB_AT, cons: PB_AT.map((_, i) => base - i * 5000), minD: PB_AT.map((_, i) => Math.round((base - i * 5000) * .75)), dist: PB_AT.map((_, i) => Math.round((base - i * 5000) * .4)), minP: PB_AT.map((_, i) => Math.round((base - i * 5000) * .9)), ptn: PB_AT.map((_, i) => Math.round((base - i * 5000) * .48)) });
const PRICE_BOOK = [{ id: 1, seg: 'saas', label: '2026-09 MDR 3종 (Cloud Insights E · Add-on 24×7 · MDR 통합)', applied: '2026-09-21', note: '', data: { supply_rate: { cnac: 0.5 }, cnac: { rows: PB_NT.map((t, i) => [t, 16000 - i * 900, 7200 - i * 400, 5500 - i * 300, 4800 - i * 280]) }, ztna: { rows: PB_NT.map((t, i) => [t, 13300 - i * 800, 6000 - i * 350, 4500 - i * 280, 4000 - i * 250]) }, services: [pbSv('Cloud Insights E', 86900), pbSv('MDR Add-on 24×7', 43300), pbSv('Genian MDR 통합', 130200), pbSv('AV Service', 74400)], addons: [] } }];
// ㊿+152 가격표(실제 모양 데이터)가 1280px·폰에서 페이지를 옆으로 밀지 않음 — fixture 에 가격표가 없어 그동안 빈 화면만 검사됐음
{
  for (const [W, H, mob] of [[1280, 800, false], [390, 844, true]]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: mob, hasTouch: mob }); const page = await ctx.newPage(); const c = collect(page);
    await mockBackend(page, { extra: async (route, u) => { if (!/\/rest\/v1\/price_books/.test(u)) return false; await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/1', 'Access-Control-Expose-Headers': 'content-range' }, body: JSON.stringify(PRICE_BOOK) }); return true; } });
    await page.goto(url + '/index.html'); await page.waitForTimeout(2200);
    await S.t('㊿+152 가격표 ' + W + 'px — 표 6개 · 페이지 옆 넘침 0 (좁으면 카드 안에서만 스크롤)', async () => {
      await page.evaluate(() => SVC.navMenu('price')); await page.waitForTimeout(800);
      const r = await page.evaluate(() => ({ t: document.querySelectorAll('#viewPrice table.pr').length, over: document.documentElement.scrollWidth - innerWidth, cols: getComputedStyle(document.querySelector('#viewPrice .pr-grid')).gridTemplateColumns.split(' ').length }));
      assert(r.t >= 6 && r.over <= 1, JSON.stringify(r)); assert(!c.errs.length, c.errs.join(' | ')); return JSON.stringify(r);
    });
    await ctx.close();
  }
}
// ㊿+151 스테이징 QA — 같은 파일을 /staging/ 경로로도 서빙(route) · 서비스 워커는 막음(route 를 가로채므로)
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' }); const page = await ctx.newPage(); const c = collect(page);
  const writes = [], dialogs = []; let breakDcheck = false, breakCss = false;
  await mockBackend(page, { onWrite: (w) => writes.push(w), extra: async (route, u) => { if (/\/rest\/v1\/price_books/.test(u)) { await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/1', 'Access-Control-Expose-Headers': 'content-range' }, body: JSON.stringify(PRICE_BOOK) }); return true; } if (!u.includes('/functions/v1/ops')) return false; const b = JSON.parse(route.request().postData() || '{}'); const out = b.action === 'status' ? { ok: true, pin_set: true, github: { repo: 'x/svc', branch: 'main', token_set: true }, recent: [] } : b.action === 'gh_copy' ? { ok: true, commit: 'c0ffee1', copied: 3 } : { ok: true }; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }); return true; } });
  await page.route('**/svc/staging/**', async (route) => { const u = new URL(route.request().url()); const rel = decodeURIComponent(u.pathname.replace('/svc/staging/', ''));
    if (breakCss && rel === 'app.css') { await route.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync(path.join(ROOT, rel), 'utf8') + '\n#viewPrice .pr-grid{grid-template-columns:900px 900px!important}\n' }); return; }
    if (breakDcheck && rel === 'js/analysis.js') { const src = fs.readFileSync(path.join(ROOT, rel), 'utf8') + "\nrenderDataCheck = function(){ throw new Error('QA 시험 오류'); };\n";   /* ㊿+153: 모듈이라 같은 이름 선언은 문법 오류 — 값을 바꿔 끼움(export 는 살아 있는 연결) */ await route.fulfill({ status: 200, contentType: 'application/javascript', body: src }); return; }
    await route.fulfill({ path: path.join(ROOT, rel) }); });
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss(); });
  await page.goto(url + '/index.html'); await page.waitForTimeout(2200);
  await page.evaluate(() => SVC.switchView('ops')); await page.waitForTimeout(500);
  await S.t('㊿+151 스테이징 QA: 버튼 → 스테이징 iframe 로그인 → 메뉴 전부 + 폰 → 핵심 숫자 일치 → 통과 · change_log · 승격 가능', async () => {
    assert(/QA 아직 안 함/.test(await page.$eval('#qaBadge', (e) => e.textContent)), '배지 초기값');
    writes.length = 0; await page.click('#opsQa');
    await page.waitForFunction(() => SVC.QA && !SVC.QA.on && SVC.QA.res, null, { timeout: 120000 });
    const r = await page.evaluate(() => ({ res: SVC.QA.res, steps: SVC.QA.steps.map((s) => ({ l: (s.group || '') + s.label, st: s.st, d: s.detail })), ver: document.getElementById('qaVer').textContent, promote: document.getElementById('qaPromote').disabled, isQa: SVC.QA.w && (SVC.QA.w.SVC || SVC.QA.w).IS_QA, stagingBar: !!(SVC.QA.w && SVC.QA.w.document.getElementById('stagingBar')) }));
    assert(r.res.fail === 0 && r.res.total >= 30 && !r.promote, JSON.stringify({ fail: r.res.fail, total: r.res.total, promote: r.promote, fails: r.res.fails }));
    const kpi = r.steps.find((s) => /핵심 숫자/.test(s.l)); assert(kpi && kpi.st === 'ok' && /\d+개 숫자 일치/.test(kpi.d), JSON.stringify(kpi));
    assert(r.steps.some((s) => /^📱/.test(s.l)) && r.steps.filter((s) => s.st === 'ok').length >= 25, '메뉴/폰 단계 부족');
    assert(r.isQa === true && r.stagingBar, 'iframe 이 ?qa=1 · staging 경로가 아님');
    assert(/스테이징 ㊿\+\d+ · 운영\(이 화면\) ㊿\+\d+/.test(r.ver), r.ver);
    /* ㊿+157 «데이터 입력·수정» 단계 — 가짜 DB 로 다시 열어 시나리오 전부 통과 · 실제(여기선 mockBackend) 쪽으로는 한 건도 안 씀 · 이 창의 로그인 그대로 */
    const dsteps = r.steps.filter((s) => /^🧾/.test(s.l)); assert(dsteps.length >= 8 && dsteps.every((s) => s.st === 'ok'), '데이터 입력·수정 단계 ' + JSON.stringify(dsteps.filter((s) => s.st !== 'ok')));
    assert(!writes.some((w) => /\/rest\/v1\/(contracts|monthly_revenue|equipment_|oi_deals|install_extra|monthly_targets|targets|customers)/.test(w.url)), 'QA 데이터 단계가 DB 로 씀 ' + writes.map((w) => w.url.split('/rest/v1/')[1]).join(','));
    assert((await page.evaluate(() => JSON.parse(sessionStorage.getItem('svc_sess')).a)) === 'tok', '이 창의 로그인 세션이 바뀜');
    assert(writes.some((w) => /change_log/.test(w.url) && /staging_qa/.test(w.body)), 'change_log staging_qa 없음');
    assert(!writes.some((w) => /client_errors|upd_notes/.test(w.url)) && !writes.some((w) => /change_log/.test(w.url) && /data_check/.test(w.body)), 'QA 중 스테이징이 기록을 남김(IS_QA 게이트 실패) ' + writes.filter((w) => /client_errors|upd_notes|data_check/.test(w.url + w.body)).map((w) => w.url.split('/rest/v1/')[1]).join(','));
    await page.click('#qaClose'); await page.waitForTimeout(300);
    const badge = await page.$eval('#qaBadge', (e) => e.textContent); assert(/QA ✅ \d+\/\d+/.test(badge), '배지 ' + badge);
    dialogs.length = 0; await page.fill('#opsPin', '0000'); await page.click('#opsPromote'); await page.waitForTimeout(200);
    assert(dialogs.length === 1 && /✅ 스테이징 QA 통과/.test(dialogs[0]), '승격 확인 창에 QA 통과 표시 없음 ' + dialogs[0]);
    assert(!c.errs.length, c.errs.join(' | ')); return r.res.pass + '/' + r.res.total + (r.res.warn ? ' ⚠' + r.res.warn : '') + ' · ' + kpi.d;
  });
  await S.t('㊿+152 QA 보고서(Claude 에게): 넘침이 생기면 원인 요소 경로·폭·grid 열까지 · JS 오류는 파일:줄 · 복사 버튼', async () => {
    breakCss = true; await page.evaluate(() => { const o = document.getElementById('ovlQa'); if (o) SVC.qaClose(); }); await page.click('#opsQa');
    await page.waitForFunction(() => SVC.QA && !SVC.QA.on && SVC.QA.res, null, { timeout: 120000 });
    const rep = await page.evaluate(() => SVC.qaReport());
    assert(/^# 포탈 스테이징 QA 결과 — ❌ 실패 \d+건/.test(rep) && /## ❌ 실패/.test(rep) && /가격표.*\(`price` · 1280×800\)/.test(rep), rep.slice(0, 400));
    assert(/페이지가 옆으로 \d+px 넘침/.test(rep) && /넘친 바깥 요소: .*pr-grid.* — 폭 \d+px/.test(rep) && /grid-template-columns: /.test(rep) && /화면 폭 1280px · 문서 폭 \d+px/.test(rep), '넘침 진단 부족\n' + rep.split('\n').filter((l) => /넘침|요소|폭/.test(l)).join('\n'));
    assert(/브라우저: \S+/.test(rep) && /미리보기 크기: 데스크톱 1280×800/.test(rep) && /## ✅ 통과 \(\d+\)/.test(rep), '환경 줄 없음');
    const cp = await page.evaluate(() => { const b = document.getElementById('qaCopy'); return { dis: b.disabled, ghost: b.classList.contains('ghost') }; }); assert(!cp.dis && !cp.ghost, '복사 버튼 비활성 ' + JSON.stringify(cp));
    await page.evaluate(() => { window.__clip = null; try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { window.__clip = t; return Promise.resolve(); } } }); } catch (e) { /* */ } });
    await page.click('#qaCopy'); await page.waitForTimeout(200);
    assert((await page.evaluate(() => window.__clip)) === rep, '복사된 내용이 보고서와 다름');
    await page.click('#qaClose'); await page.waitForTimeout(200); breakCss = false;
    return rep.split('\n').filter((l) => /넘친 바깥/.test(l))[0].slice(0, 120);
  });
  await S.t('㊿+151 스테이징 QA: 스테이징 코드가 깨지면(데이터 점검 render 오류) 그 메뉴 ❌ · 승격 버튼 비활성 · 승격 확인 창 경고', async () => {
    breakCss = false; breakDcheck = true; await page.evaluate(() => { const o = document.getElementById('ovlQa'); if (o) SVC.qaClose(); }); await page.click('#opsQa');
    await page.waitForFunction(() => SVC.QA && !SVC.QA.on && SVC.QA.res, null, { timeout: 120000 });
    const r = await page.evaluate(() => ({ res: SVC.QA.res, dc: SVC.QA.steps.filter((s) => /데이터 점검/.test(s.label)).map((s) => s.st + ':' + s.detail), promote: document.getElementById('qaPromote').disabled, sum: document.getElementById('qaSum').textContent }));
    assert(r.res.fail >= 1 && r.dc.length >= 1 && r.dc.every((x) => /^fail:/.test(x) && /QA 시험 오류|빈 화면|이동 오류/.test(x)) && r.promote && /실패/.test(r.sum), JSON.stringify(r));
    await page.click('#qaClose'); await page.waitForTimeout(300);
    assert(/QA ❌ \d+건 실패/.test(await page.$eval('#qaBadge', (e) => e.textContent)), '실패 배지 없음');
    dialogs.length = 0; await page.click('#opsPromote'); await page.waitForTimeout(200);
    assert(dialogs.length === 1 && /⚠ 스테이징 QA 에서 \d+건 실패/.test(dialogs[0]), '경고 없음 ' + dialogs[0]);
    breakDcheck = false; return r.dc.join(' / ').slice(0, 120);
  });
  await ctx.close();
}
// ㊿+153: ES 모듈 — 시작점 main.js 하나 · importmap 의 ?v= · 리포트·관리자·가격표는 처음 열 때 · window.SVC · 서비스 워커 오프라인
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' }); const page = await ctx.newPage(); const c = collect(page);
  const js = []; let failReport = false; const writes = [];
  page.on('request', (r) => { const u = r.url(); if (/\/js\/[\w-]+\.js/.test(u)) js.push(u.replace(/^.*\/svc\//, '')); });
  await page.route('**/svc/js/report.js*', (route) => (failReport ? route.fulfill({ status: 503, body: 'down' }) : route.continue()));
  await mockBackend(page, { onWrite: (w) => writes.push(w) }); await page.goto(url + '/index.html');
  await page.waitForFunction(() => window.SVC && SVC.ST && SVC.ST.DATA, null, { timeout: 15000 }); await page.waitForTimeout(400);
  const ver = await page.evaluate(() => SVC.APP_VER); const v = encodeURIComponent(ver);
  await S.t('㊿+153 모듈: 첫 화면에 report·admin·price 를 받지 않음 · 모든 코드 요청에 ?v=<버전> · boot.js/load.js 안 씀 · 오류 0 · ㊿+154 window 다리 없음(SVC 만)', async () => {
    const lazy = js.filter((u) => /js\/(report|admin|price)\.js/.test(u)); const noV = js.filter((u) => u.indexOf('?v=' + v) < 0);
    assert(!lazy.length, '처음부터 받음: ' + lazy.join(', ')); assert(!noV.length, '?v= 없음: ' + noV.slice(0, 4).join(', '));
    assert(!js.some((u) => /js\/(boot|load)\.js/.test(u)), 'boot/load 요청'); assert(js.some((u) => /js\/main\.js\?v=/.test(u)), 'main.js 없음');
    assert(!c.errs.length && !c.csp.length, c.errs.concat(c.csp).join(' | '));
    const st = await page.evaluate(() => ({ svc: Object.keys(SVC).length, fn: typeof SVC.navMenu, win: typeof window.navMenu + typeof window.ST + typeof window.RAWX, lazy: typeof SVC.renderReport }));
    assert(st.svc > 800 && st.fn === 'function' && st.win === 'undefinedundefinedundefined' && st.lazy === 'undefined', JSON.stringify(st));   /* ㊿+154: window 다리 없음 — 포탈 이름은 window.SVC 에만 */ return js.length + '개 파일 · SVC ' + st.svc + '개 이름';
  });
  await S.t('㊿+153 처음 열 때 불러오기: 메뉴를 열면 그때 받고 그림 · 받는 동안 «불러오는 중…» · 두 번째는 바로', async () => {
    await page.route('**/svc/js/price.js*', async (route) => { await new Promise((ok) => setTimeout(ok, 700)); route.continue(); });
    await page.evaluate(() => SVC.navMenu('price')); await page.waitForTimeout(300);
    const mid = await page.evaluate(() => { const h = document.getElementById('viewPrice'); return { wait: h.classList.contains('lazy-wait'), text: h.innerText.trim() }; });
    assert(mid.wait && /화면을 불러오는 중/.test(mid.text) && mid.text.length < 40, '받는 중 안내 없음 ' + JSON.stringify(mid));
    await page.waitForFunction(() => !document.getElementById('viewPrice').classList.contains('lazy-wait') && typeof SVC.renderPrice === 'function', null, { timeout: 8000 });
    await page.waitForTimeout(200); const t = await page.$eval('#viewPrice', (e) => e.innerText); assert(/제품 가격표/.test(t) && !/불러오는 중…$/.test(t.trim()), t.slice(0, 80));
    for (const [m, host, re] of [['report', 'viewReport', /리포트/], ['adminx', 'viewAdmin', /관리자/], ['ops', 'viewOps', /배포·운영/], ['account', 'viewAccount', /내 계정/]]) {
      await page.evaluate((m) => SVC.navMenu(m), m); await page.waitForFunction((h) => !document.getElementById(h).classList.contains('lazy-wait'), host, { timeout: 8000 }); await page.waitForTimeout(250);
      const tx = await page.$eval('#' + host, (e) => e.innerText); assert(re.test(tx) && tx.length > 100, m + ' 화면 ' + tx.slice(0, 60));
    }
    const n0 = js.length; await page.evaluate(() => SVC.navMenu('report')); const sync = await page.evaluate(() => !document.getElementById('viewReport').classList.contains('lazy-wait'));
    assert(sync && js.length === n0, '두 번째 열기에 다시 받음 ' + (js.length - n0)); assert(!c.errs.length, c.errs.join(' | '));
    return 'price·report·admin·ops·account';
  });
  await S.t('㊿+153 처음 열 때 불러오는 화면도 메뉴를 다시 누르면 «첫 화면»(코드를 받은 직후의 사본으로 되돌림)', async () => {
    const r = await page.evaluate(async () => {
      SVC.navMenu('price'); const seg0 = SVC.PR.seg; SVC.PR.seg = seg0 === 'saas' ? 'onprem' : 'saas'; SVC.PR.q = 'zz'; SVC.navMenu('dash'); SVC.navMenu('price'); const back = SVC.PR.seg === seg0 && !SVC.PR.q;
      SVC.navMenu('ops'); const t0 = SVC.OPS.tab; SVC.OPS.tab = t0 === 'gh' ? 'sql' : 'gh'; SVC.navMenu('dash'); SVC.navMenu('ops'); const opsBack = SVC.OPS.tab === t0;
      return { back, opsBack, seg0 }; });
    assert(r.back && r.opsBack, JSON.stringify(r)); return JSON.stringify(r);
  });
  await S.t('㊿+153 코드 파일을 못 받으면 그 화면에 «오류가 발생 — 새로고침» · 오류 기록 · 다시 열면 다시 시도', async () => {
    failReport = true; const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' }); const p2 = await ctx2.newPage(); const w2 = [];
    await p2.route('**/svc/js/report.js*', (route) => (failReport ? route.fulfill({ status: 503, body: 'down' }) : route.continue()));
    await mockBackend(p2, { onWrite: (w) => w2.push(w) }); await p2.goto(url + '/index.html'); await p2.waitForFunction(() => window.SVC && SVC.ST && SVC.ST.DATA, null, { timeout: 15000 });
    await p2.evaluate(() => SVC.navMenu('report')); await p2.waitForTimeout(800);
    const t = await p2.$eval('#viewReport', (e) => e.innerText.trim()); assert(/오류가 발생/.test(t) && /새로고침/.test(t), t.slice(0, 100));
    assert(w2.some((w) => /client_errors/.test(w.url) && /지연 모듈 report/.test(w.body)), 'client_errors 기록 없음');
    failReport = false; await p2.evaluate(() => { SVC.navMenu('dash'); SVC.navMenu('report'); }); await p2.waitForFunction(() => typeof SVC.renderReport === 'function', null, { timeout: 8000 }); await p2.waitForTimeout(300);
    const t2 = await p2.$eval('#viewReport', (e) => e.innerText); assert(!/오류가 발생/.test(t2) && t2.length > 100, '다시 시도 실패 ' + t2.slice(0, 80));
    await ctx2.close(); return t.slice(0, 50);
  });
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const page = await ctx.newPage(); const c = collect(page);
  await mockBackend(page); await page.goto(url + '/index.html');
  await S.t('㊿+153 서비스 워커: 코드 파일 전부 미리 저장 → 오프라인에서 다시 열어도 뜸 · 처음 열 때 받는 화면(리포트)도', async () => {
    const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn).catch(() => false)) return true; await page.waitForTimeout(250); } return false; };   /* waitForFunction 은 Promise 를 기다리지 않음 */
    await until(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.active && navigator.serviceWorker.controller); }, 20000);
    await until(async () => { const ks = await caches.keys(); return ks.length === 1 && (await (await caches.open(ks[0])).keys()).length >= 28; }, 20000);
    const keys = await page.evaluate(async () => { const ks = await caches.keys(); const c0 = await caches.open(ks[0]); return { name: ks[0], n: (await c0.keys()).length }; });
    const swv = /const SW_VER = '([^']+)'/.exec(fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8'))[1];
    assert(keys.name === swv && keys.n >= 28, JSON.stringify(keys) + ' · sw.js ' + swv);
    await page.reload(); await page.waitForFunction(() => window.SVC && SVC.ST && SVC.ST.DATA, null, { timeout: 15000 });
    await ctx.setOffline(true); await page.reload(); await page.waitForFunction(() => window.SVC && typeof SVC.navMenu === 'function', null, { timeout: 15000 });
    const off = await page.evaluate(async () => { await SVC.lazyLoad('report'); return { ver: SVC.APP_VER, rep: typeof SVC.renderReport }; });
    await ctx.setOffline(false);
    assert(off.rep === 'function' && /㊿\+\d+/.test(off.ver), JSON.stringify(off)); return JSON.stringify(keys) + ' · 오프라인 ' + JSON.stringify(off);
  });
  await ctx.close();
}
// ㊿+154: 위성 페이지 — 코드는 sat/*.js · 인라인 onclick → data-click 등(sat/common.js 위임) · CSP 'unsafe-inline' 없음 · 버튼이 그대로 동작
{
  const satOpen = async (f, w = 1280) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, serviceWorkers: 'block' }); const page = await ctx.newPage(); const c = collect(page);
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    await mockBackend(page); await page.goto(url + '/' + f); await page.waitForTimeout(1200); return { ctx, page, c };
  };
  /* 공통: 오류·CSP 위반 0 · 화면에 있는 data-* 가 전부 읽히고 등록된 함수 · 인라인 스크립트를 끼워 넣어도 실행 안 됨 */
  const satCommon = async (page, c) => {
    assert(!c.errs.length, 'JS 오류: ' + c.errs.join(' | ')); assert(!c.csp.length, 'CSP 위반: ' + c.csp.join(' | '));
    const r = await page.evaluate(() => { const bad = []; let n = 0;
      document.querySelectorAll('[data-click],[data-change],[data-input]').forEach((el) => ['click', 'change', 'input'].forEach((t) => { const v = el.getAttribute('data-' + t); if (!v) return; n++;
        try { SAT.parse(v).forEach((x) => { if (!SAT.has(x.fn)) bad.push(x.fn); }); } catch (e) { bad.push(v + ' — ' + e.message); } }));
      return { n, bad, inline: document.querySelectorAll('script:not([src])').length }; });
    assert(r.n >= 5 && !r.bad.length && r.inline === 0, JSON.stringify(r));
    await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" onload="window.__inl=1" onerror="window.__inl=1">'; document.body.appendChild(d); }); await page.waitForTimeout(300);
    assert(!(await page.evaluate(() => window.__inl)), '끼워 넣은 인라인 핸들러가 실행됨(CSP 가 안 막음)'); c.csp.length = 0;
    return r.n;
  };
  { const { ctx, page, c } = await satOpen('quote.html');
    await S.t('㊿+154 위성 quote.html: 종류 고르기 · 항목 추가/삭제 · 비고 칸 · 파일 메뉴 — data-click/input 으로 · 인라인 없음 · CSP 막힘', async () => {
      const n = await satCommon(page, c);
      await page.click('button:has-text("견적서 종류 선택") >> xpath=..', { trial: true }).catch(() => null);
      await page.locator('#quoteTypeOverlay button').first().click(); await page.waitForTimeout(400);
      const t0 = await page.evaluate(() => ({ ov: getComputedStyle(document.getElementById('quoteTypeOverlay')).display, badge: document.getElementById('quoteTypeBadge').innerText, rows: document.querySelectorAll('#itemTable tbody tr').length }));
      assert(t0.ov === 'none' && /기업용/.test(t0.badge), JSON.stringify(t0));
      await page.click('[data-click="addRow()"]'); await page.waitForTimeout(150);
      const r1 = await page.evaluate(() => document.querySelectorAll('#itemTable tbody tr').length); assert(r1 === t0.rows + 1, '항목 추가 ' + t0.rows + '→' + r1);
      await page.locator('#itemTable tbody tr').last().locator('[data-click^="rowRemove"]').click(); await page.waitForTimeout(150);
      const r2 = await page.evaluate(() => document.querySelectorAll('#itemTable tbody tr').length); assert(r2 === t0.rows, '항목 삭제 ' + r1 + '→' + r2);
      await page.fill('.remarks-section textarea', '줄1\n줄2\n줄3'); const rm = await page.evaluate(() => ({ auto: window.lastAutoRemarks, h: document.querySelector('.remarks-section textarea').style.height }));
      assert(rm.auto === 'modified' && /px$/.test(rm.h), JSON.stringify(rm));
      await page.click('[data-click="toggleDropdown(\'fileDropdown\')"]'); await page.waitForTimeout(150);
      const dd = await page.evaluate(() => getComputedStyle(document.getElementById('fileDropdown')).display); assert(dd !== 'none', '파일 메뉴가 안 열림');
      await page.mouse.click(5, 300); await page.waitForTimeout(150);
      const dd2 = await page.evaluate(() => getComputedStyle(document.getElementById('fileDropdown')).display); assert(dd2 === 'none', '바깥 클릭에 안 닫힘 ' + dd2);
      assert(!c.errs.length, c.errs.join(' | ')); return 'data-* ' + n + '개 · 행 ' + t0.rows + '→' + r1 + '→' + r2;
    });
    await ctx.close(); }
  { const { ctx, page, c } = await satOpen('report.html');
    await S.t('㊿+154 위성 report.html: 납품·매입 행 복사/삭제 · 관리원가 창 · 새 항목 칸 입력/삭제 — data-click/input', async () => {
      const n = await satCommon(page, c);
      const d0 = await page.evaluate(() => document.querySelectorAll('#tDeliv tbody tr').length);
      const rowBtn = async (tb, which, act) => { const tr = page.locator(tb + ' tbody tr')[which](); await tr.hover(); await tr.locator('[data-click="' + act + '"]').click(); await page.waitForTimeout(100); };   /* 행 버튼은 마우스를 올려야 보임 */
      await rowBtn('#tDeliv', 'first', 'dupDeliv(this)');
      const d1 = await page.evaluate(() => document.querySelectorAll('#tDeliv tbody tr').length); assert(d1 === d0 + 1, '납품 행 복사 ' + d0 + '→' + d1);
      const b0 = await page.evaluate(() => document.querySelectorAll('#tBuy tbody tr').length);
      await rowBtn('#tBuy', 'first', 'dupBuy(this)');
      assert((await page.evaluate(() => document.querySelectorAll('#tBuy tbody tr').length)) === b0 + 1, '매입 행 복사');
      await rowBtn('#tDeliv', 'last', 'delRow(this)');
      assert((await page.evaluate(() => document.querySelectorAll('#tDeliv tbody tr').length)) === d0, '납품 행 삭제');
      await page.click('[data-click="openCost()"]'); await page.waitForTimeout(300); assert(await page.evaluate(() => document.getElementById('ovlCost').classList.contains('show')), '관리원가 창 안 열림');
      await page.click('[data-click="costAddRow()"]'); await page.waitForTimeout(150);
      await page.locator('#ovlCost input[data-input^="costSet"]').first().fill('2031'); await page.waitForTimeout(100);
      const cy = await page.evaluate(() => COST_NEW.length && COST_NEW[0].year); assert(String(cy) === '2031', '새 항목 연도 ' + cy);
      await page.locator('#ovlCost [data-click^="costDel"]').first().click(); await page.waitForTimeout(150);
      assert((await page.evaluate(() => COST_NEW.length)) === 0, '새 항목 삭제');
      await page.click('#ovlCost [data-click="closeOvl(\'ovlCost\')"]'); await page.waitForTimeout(150); assert(!(await page.evaluate(() => document.getElementById('ovlCost').classList.contains('show'))), '닫기');
      assert(!c.errs.length, c.errs.join(' | ')); return 'data-* ' + n + '개';
    });
    await ctx.close(); }
  for (const f of ['s1.html', 'kk.html']) {
    const { ctx, page, c } = await satOpen(f);
    await S.t('㊿+154 위성 ' + f + ': 저장 목록 창 열기/닫기 · 더보기 · 정산서 인쇄 창(새 창 버튼은 여기서 연결) — 공통 sat/db.js · sat/settle.js', async () => {
      const n = await satCommon(page, c);
      await page.click('[data-click="openSettles()"]'); await page.waitForTimeout(300); assert(await page.evaluate(() => document.getElementById('ovlSet').classList.contains('show')), '목록 창 안 열림');
      await page.click('[data-click="closeOvl(\'ovlSet\')"]'); await page.waitForTimeout(150); assert(!(await page.evaluate(() => document.getElementById('ovlSet').classList.contains('show'))), '목록 창 안 닫힘');
      const more = page.locator('[data-click="toggleMore(this)"]').first();
      if (await more.isVisible()) { const h0 = await page.evaluate(() => document.body.innerHTML.length); await more.click(); await page.waitForTimeout(100); }
      const [pop] = await Promise.all([page.waitForEvent('popup'), page.evaluate(() => printDoc({ title: '시험 정산서', sub: 'smoke', cols: [{ l: '고객' }, { l: '금액', n: 1 }], rows: [['가상고객01', 1000]] }))]);
      await pop.waitForLoadState(); const btns = await pop.$$eval('[data-pd]', (b) => b.map((x) => x.dataset.pd)); assert(btns.join() === 'print,close', '인쇄 창 버튼 ' + btns);
      /* ㊿+158 닫기 버튼은 창 자체를 닫으므로 click 이 끝나기를 기다리면 가끔 «page closed» (부하가 큰 CI) — 누르기는 창 안에서 다음 틱에, 우리는 close 만 기다림 */
      const closed = pop.waitForEvent('close', { timeout: 10000 }); await pop.evaluate(() => { setTimeout(() => document.querySelector('[data-pd="close"]').click(), 0); }); await closed;
      assert(!c.errs.length, c.errs.join(' | ')); return 'data-* ' + n + '개 · 인쇄 창 닫기 OK';
    });
    await ctx.close();
  }
  await S.t('㊿+154 orders.html(옛 발주 화면) → 포탈 «임대 장비 신청» 으로 넘어감 · 스크립트 없음', async () => {
    const ctx = await browser.newContext({ serviceWorkers: 'block' }); const page = await ctx.newPage(); await mockBackend(page);
    await page.goto(url + '/orders.html'); await page.waitForURL(/index\.html\?v=ordernew/, { timeout: 5000 }); const u = page.url(); await ctx.close(); return u.replace(/^.*\/svc\//, '');
  });
}
// ㊿+155: 화면 HTML 은 tpl`` (특수문자 자동 처리) · 타입 검사로 찾은 고객 360 «기간» 빈칸 수정
{
  const { ctx, page } = await open();
  await S.t('㊿+155 tpl``: ${값} 은 자동 esc · rawHtml(…) 만 그대로 · null/undefined 는 빈칸 · 숫자 그대로 · 위성 페이지 tpl 도 같은 규칙', async () => {
    const r = await page.evaluate(() => { const t = SVC.tpl, R = SVC.rawHtml; const x = '<img src=x onerror=alert(1)> & "q"';
      return { a: t`<b title="${x}">${x}</b>`, b: t`<ul>${R('<li>1</li>')}</ul>`, c: t`[${null}][${undefined}][${0}][${12.5}]`, d: t`${R(t`<i>${'<'}</i>`)}`, e: SVC.esc('<a href="x">&</a>') }; });
    assert(r.a === '<b title="&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;">&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;</b>', r.a);
    assert(r.b === '<ul><li>1</li></ul>' && r.c === '[][][0][12.5]' && r.d === '<i>&lt;</i>' && r.e === '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;', JSON.stringify(r));
    const ctx2 = await browser.newContext({ serviceWorkers: 'block' }); const p2 = await ctx2.newPage(); await mockBackend(p2); await p2.goto(url + '/report.html'); await p2.waitForTimeout(800);
    const sat = await p2.evaluate(() => tpl`<b>${'<x>'}</b>${rawHtml('<i>y</i>')}`); await ctx2.close();
    assert(sat === '<b>&lt;x&gt;</b><i>y</i>', 'sat ' + sat); return r.a.slice(0, 60);
  });
  await S.t('㊿+155 고객 360 «계약» 표의 기간이 채워짐 (예전엔 없는 키 r.start·r.end 를 읽어 늘 « ~ » — 타입 검사가 찾음)', async () => {
    await page.evaluate(() => SVC.openCust360(SVC.ST.DATA.rows[0].cust)); await page.waitForTimeout(400);
    const per = await page.evaluate(() => [...document.querySelectorAll('#c360Body .c360-sec')][0].querySelectorAll('tbody tr td:nth-child(6)')[0].textContent);
    assert(/^\d{4}-\d{2} ~ \d{4}-\d{2}$/.test(per), '기간 «' + per + '»'); return per;
  });
  await ctx.close();
}
// ㊿+156: 버튼으로 펼친 목록·결과·미리보기는 «✕ 닫기»(core.js closeBtn · .x-close) 로 닫힘
{
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const { ctx, page, errs } = await open({ extra: async (route, u) => {
    if (/\/storage\/v1\/object\/authenticated\//.test(u)) { await route.fulfill({ status: 200, contentType: 'image/png', body: PNG }); return true; }
    if (!u.includes('/functions/v1/ops')) return false;
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch { /* noop */ }
    const A = body.action; let out = { ok: true };
    if (A === 'status') out = { ok: true, pin_set: true, github: { repo: 'x/svc', branch: 'main', token_set: true }, mgmt_token_set: true, log_ok: true, recent: [] };
    else if (A === 'gh_list') out = { ok: true, files: [{ path: 'index.html', size: 10 }, { path: 'js/core.js', size: 20 }, { path: 'js/boot.js', size: 5 }] };
    else if (A === 'gh_history') out = { ok: true, commits: [{ sha: 'a'.repeat(40), short: 'aaaaaaa', date: '2026-10-05T10:00:00Z', message: '커밋 1', url: 'https://github.com/x' }] };
    else if (A === 'gh_get') out = { ok: true, content: 'name: x' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }); return true; } });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.evaluate(async () => { await SVC.lazyLoad('admin'); SVC.switchView('ops'); }); await page.waitForTimeout(600);
  await page.fill('#opsPin', '7391');
  const has = (k) => page.evaluate((k) => !!document.querySelector('#opsBody [data-ops-close="' + k + '"]'), k);
  const closeIt = async (k) => { await page.click('#opsBody [data-ops-close="' + k + '"]'); await page.waitForTimeout(150); return !(await has(k)); };
  await S.t('㊿+156 배포·운영 GitHub: 저장소 파일 보기 · index.html 이력 · 🧹 저장소 점검 · 직인 미리보기 · 올릴 파일 — 각각 «✕ 닫기» 로 닫힘', async () => {
    const done = [];
    await page.click('#opsGhList'); await page.waitForTimeout(400);
    assert(await has('ghList') && await page.evaluate(() => document.querySelector('#opsBody').innerText.includes('js/core.js')), '저장소 파일 목록이 안 뜸');
    assert(await closeIt('ghList') && await page.evaluate(() => SVC.OPS.ghList === null && !document.querySelector('#opsBody').innerText.includes('js/core.js')), '목록이 안 닫힘'); done.push('파일');
    await page.click('#opsGhHist'); await page.waitForTimeout(400); assert(await has('hist'), '이력 안 뜸');
    assert(await closeIt('hist') && await page.evaluate(() => SVC.OPS.hist === null && SVC.OPS.histPath === ''), '이력 안 닫힘'); done.push('이력');
    await page.click('#opsRepoCheck'); await page.waitForTimeout(500); assert(await has('repo') && await page.evaluate(() => !!document.querySelector('#opsBody .ops-repo')), '점검 결과 안 뜸');
    assert(await closeIt('repo') && await page.evaluate(() => !document.querySelector('#opsBody .ops-repo')), '점검 결과 안 닫힘'); done.push('점검');
    await page.click('#opsSealCheck'); await page.waitForTimeout(500); assert(await page.evaluate(() => !!document.querySelector('#opsBody img[alt="직인 미리보기"]')) && await has('seal'), '직인 미리보기 안 뜸');
    assert(await closeIt('seal') && await page.evaluate(() => !document.querySelector('#opsBody img[alt="직인 미리보기"]') && /✓ Storage 에 있음/.test(document.getElementById('opsSealSt').textContent)), '직인 미리보기 안 닫힘(상태 줄은 남아야)'); done.push('직인');
    await page.evaluate(() => { SVC.OPS.files = [{ path: 'index.html', size: 3, content: 'x' }, { path: 'js/core.js', size: 3, content: 'y' }]; SVC.renderOps(true); });
    assert(await page.evaluate(() => document.querySelector('#opsBody [data-ops-close="files"]').textContent.includes('모두 빼기')), '모두 빼기 버튼 없음');
    assert(await closeIt('files') && await page.evaluate(() => SVC.OPS.files.length === 0), '올릴 파일이 안 비워짐'); done.push('올릴 파일');
    return done.join(' · ');
  });
  await S.t('㊿+156 배포·운영 SQL 결과 · 기록 탭(시스템 점검 · 브라우저 오류 · AI 점검) 결과 «✕ 닫기» · 점검 중엔 버튼 없음', async () => {
    await page.evaluate(() => { SVC.OPS.tab = 'sql'; SVC.OPS.sqlRes = { rows: [{ ok: 1 }], row_count: 1, ms: 5 }; SVC.renderOps(true); });
    assert(await has('sqlRes') && await closeIt('sqlRes') && await page.evaluate(() => SVC.OPS.sqlRes === null), 'SQL 결과');
    await page.evaluate(() => { SVC.OPS.tab = 'log'; SVC.OPS.health = { running: true, rows: [{ name: 'a', ok: true, info: 'i', ms: 1 }] }; SVC.OPS.errs = []; SVC.OPS.aic = { running: false, rows: [{ q: '질문', l: '기대', st: '통과', ok: true, ms: 1000 }], at: '2026-10-05T10:00:00Z', summary: { pass: 1, total: 1, avg_ms: 1000, cut: 0, models: [] } }; SVC.renderOps(true); });
    assert(!(await has('health')), '점검 중인데 닫기 버튼이 있음');
    await page.evaluate(() => { SVC.OPS.health.running = false; SVC.OPS.health.at = new Date(); SVC.renderOps(true); });
    assert(await closeIt('health') && await page.evaluate(() => SVC.OPS.health === null), '시스템 점검');
    assert(await closeIt('errs') && await page.evaluate(() => SVC.OPS.errs === null), '브라우저 오류');
    assert(await closeIt('aic') && await page.evaluate(() => SVC.OPS.aic === null), 'AI 점검');
    const btn = await page.evaluate(() => { const b = SVC.closeBtn({ 'data-x': 'a"b' }, '제목<'); return String(b); });
    assert(btn === '<button type="button" class="cbtn x-close" title="제목&lt;" aria-label="제목&lt;" data-x="a&quot;b">✕ 닫기</button>', btn);
    return 'SQL · 점검 · 오류 · AI';
  });
  await S.t('㊿+156 장비 «🩺 진단» 결과 닫기 · 프로젝트 리포트(위성) 창 Esc · 바깥 클릭으로 닫힘', async () => {
    await page.evaluate(() => SVC.navMenu('orders')); await page.waitForTimeout(500);
    await page.click('#eqDiag'); await page.waitForTimeout(900);
    assert(await page.evaluate(() => getComputedStyle(document.getElementById('eqDiagOut')).display !== 'none' && /진단/.test(document.getElementById('eqDiagBody').textContent)), '진단 결과 안 뜸');
    await page.click('#eqDiagClose'); await page.waitForTimeout(150);
    assert(await page.evaluate(() => getComputedStyle(document.getElementById('eqDiagOut')).display === 'none'), '진단 결과 안 닫힘');
    const ctx2 = await browser.newContext({ serviceWorkers: 'block' }); const p2 = await ctx2.newPage(); await mockBackend(p2); await p2.goto(url + '/report.html'); await p2.waitForTimeout(800);
    await p2.evaluate(() => document.getElementById('ovlList').classList.add('show')); await p2.keyboard.press('Escape'); await p2.waitForTimeout(100);
    const esc1 = await p2.evaluate(() => document.getElementById('ovlList').classList.contains('show'));
    await p2.evaluate(() => document.getElementById('ovlCost').classList.add('show')); await p2.mouse.click(5, 5); await p2.waitForTimeout(100);
    const out1 = await p2.evaluate(() => document.getElementById('ovlCost').classList.contains('show')); await ctx2.close();
    assert(!esc1 && !out1, 'report.html 창 Esc ' + esc1 + ' · 바깥 ' + out1);
    assert(!errs.length, errs.join(' | ')); return '진단 · 리포트 창';
  });
  await ctx.close();
}
// ㊿+157: 금액 입력은 전부 천원(표시와 같은 단위) · 저장은 원 · 이상한 금액 확인 · 계약 표 ✎ 의 MRR·기간·상태 → 월 매출도 맞춤
//   «저장하면 실제로 바뀌는» 가짜 DB(tests/fakedb.mjs)로 사람처럼 입력 → 저장 → DB 값(원) · 다시 읽은 화면 · 합계 · LIVE 를 대조 (2026-10 월 4.8억 입력 사고 재현 포함)
{
  const T = nowIdx(), YM = (i) => idxYm(i).slice(0, 7), ix = (s) => (+s.slice(0, 4) - 2020) * 12 + (+s.slice(5, 7) - 6);
  async function fboot() {
    const db = new FakeDB(seedData()); const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' }); const page = await ctx.newPage();
    const errs = [], dialogs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    page.on('dialog', (d) => { dialogs.push(d.message().replace(/\s+/g, ' ')); (page.__dlg ? page.__dlg(d) : d.accept()).catch(() => {}); });
    await fakeBackend(page, db); await page.goto(url + '/index.html'); await fready(page);
    return { db, ctx, page, errs, dialogs };
  }
  async function fready(page) { await page.waitForFunction(() => window.SVC && SVC.ST && SVC.ST.DATA && SVC.ST.DATA.rows.length, null, { timeout: 20000 }); await page.waitForTimeout(400); }
  const cOf = (db, name) => { const cu = db.t.customers.find((c) => c.name === name); return db.t.contracts.filter((c) => c.customer_id === cu.id); };
  const psum = (page, i) => page.evaluate((i) => SVC.ST.DATA.rows.reduce((a, r) => a + r.segs.reduce((b, sg) => b + (sg[0] <= i && i <= sg[1] ? sg[2] : 0), 0), 0), i);
  const liveN = (page, i) => page.evaluate((i) => SVC.liveCalc(i).uniq, i);
  async function openEdit(page, tab) { if (!(await page.$('#ovlEdit.on'))) { await page.evaluate(() => SVC.switchView('dash')); await page.click('#btnEdit'); await page.waitForTimeout(150); } await page.click('#eTabs button[data-t="' + tab + '"]'); await page.waitForTimeout(80); }
  async function pick(page, find, pk, cust) { await page.fill('#' + find, cust); await page.waitForTimeout(120); await page.click('#' + pk + ' .pi'); await page.waitForTimeout(80); }
  async function saveEdit(page) { await page.click('#eGo'); await page.waitForFunction(() => { const m = document.getElementById('eMsg'); return m && /✅|bad/.test(m.textContent + ' ' + m.className) && !document.getElementById('eGo').disabled; }, null, { timeout: 10000 }); await page.waitForTimeout(300); return page.$eval('#eMsg', (e) => e.textContent); }
  async function gridEdit(page, view, cust, pairs) {
    await page.evaluate((v) => { SVC.wvSet(v, '전체'); SVC.switchView(v); }, view); await page.fill('#dvSearch', cust); await page.waitForTimeout(350);   /* ㊿+169 업무 보기 «전체» = 모든 열 */
    await page.click('#dvTable tbody tr:has-text("' + cust + '") button[data-act="edit"]'); await page.waitForTimeout(150);
    const info = await page.evaluate((pairs) => { const tr = [...document.querySelectorAll('#dvTable tbody tr')].find((x) => x.querySelector('button.sv')); const hs = [...document.querySelectorAll('#dvTable thead th')].map((h) => h.textContent.trim()); const out = {};
      for (const [h, v] of pairs) { const k = hs.findIndex((x) => x.startsWith(h)); const el = tr.children[k].querySelector('input,select'); out[h] = el.value; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
      const hint = tr.querySelector('.amt-hint'); out._hint = hint ? hint.textContent : ''; return out; }, pairs);
    await page.click('#dvTable button.sv'); await page.waitForTimeout(1300); return info;
  }
  await S.t('㊿+157 ?qa=data 가짜 DB 모드: Supabase 로 나가는 요청 0 · 로그인·저장소 분리(토큰 qa-fake) · QA 시나리오 전부 통과', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' }); const page = await ctx.newPage();
    const real = [], errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); page.on('dialog', (d) => { errs.push('네이티브 창: ' + d.message().slice(0, 80)); d.dismiss(); });
    await page.route('**/*supabase.co/**', (r) => { real.push(r.request().method() + ' ' + r.request().url().slice(0, 90)); r.abort(); });
    await page.route(/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    await page.addInitScript(() => { try { sessionStorage.setItem('svc_sess', JSON.stringify({ a: 'REAL-TOKEN', r: null, e: Math.floor(Date.now() / 1000) + 3600, u: 'real@example.com', p: true })); } catch (e) { /* noop */ } });
    await page.goto(url + '/index.html?qa=data'); await fready(page);
    const who = await page.evaluate(() => ({ t: SVC.ST.SB_TOKEN, u: SVC.ST.AUTH_USER, bar: !!document.getElementById('qaDataBar') }));
    const list = await page.evaluate(() => SVC.qaDataList()), out = [];
    for (let i = 0; i < list.length; i++) { const r = await page.evaluate((i) => SVC.qaDataRun(i), i); out.push((r.ok ? '✓' : '✗ ' + list[i].id + ': ' + r.detail)); }
    await ctx.close();
    assert(who.t === 'qa-fake' && who.u === 'qa@fake.local' && who.bar, '가짜 세션·안내 띠 ' + JSON.stringify(who));
    assert(!real.length, 'Supabase 로 나간 요청 ' + real.slice(0, 3).join(' | '));
    assert(list.length >= 7 && out.every((x) => x === '✓'), out.filter((x) => x !== '✓').join(' / ')); assert(!errs.length, errs.join(' | '));
    return list.length + '개 시나리오 · 실제 요청 0';
  });
  await S.t('㊿+157 금액 도우미: kwToWon(천원→원) · wonToKw · wonKo(읽기 쉬운 금액) · amtWhy(5배·1/5·1만원 미만·월 1억↑)', async () => {
    const { ctx, page } = await fboot();
    const r = await page.evaluate(() => ({ a: [SVC.kwToWon('480'), SVC.kwToWon('52.8'), SVC.kwToWon('1,200'), SVC.kwToWon(''), SVC.kwToWon('x')], b: [SVC.wonToKw(480000), SVC.wonToKw(52800), SVC.wonToKw(null)],
      c: [SVC.wonKo(480000000), SVC.wonKo(480000), SVC.wonKo(52800), SVC.wonKo(9000)], d: [SVC.amtWhy(480000000, 300000, true), SVC.amtWhy(480, 500000, true), SVC.amtWhy(500000, 400000, true), SVC.amtWhy(150000000, 0, true), SVC.amtWhy(150000000, 0, false)] }));
    await ctx.close();
    assert(JSON.stringify(r.a) === JSON.stringify([480000, 52800, 1200000, null, null]), 'kwToWon ' + JSON.stringify(r.a));
    assert(JSON.stringify(r.b) === JSON.stringify(['480', '52.8', '']), 'wonToKw ' + JSON.stringify(r.b));
    assert(JSON.stringify(r.c) === JSON.stringify(['4.8억원', '48만원', '5.3만원', '9,000원']), 'wonKo ' + JSON.stringify(r.c));
    assert(/1,600배/.test(r.d[0]) && /1만원 미만/.test(r.d[1]) && r.d[2] === '' && /1억원/.test(r.d[3]) && r.d[4] === '', 'amtWhy ' + JSON.stringify(r.d)); return r.c.join(' · ');
  });
  await S.t('㊿+157 만기 처리 › 연장: «480» = 48만원 저장 · «480000»(원으로 착각) 은 «1,600배» 확인 창 → 취소하면 저장 안 됨 (2026-10 실제 사고)', async () => {
    const { db, ctx, page, dialogs } = await fboot(); const c = cOf(db, '가상고객_만기지남')[0];
    page.__dlg = (d) => (/단위입니다/.test(d.message()) ? d.dismiss() : d.accept());
    await page.evaluate(() => SVC.openRenewList('lapsed')); await page.waitForTimeout(250);
    await page.click('#rnList tr[data-id="' + c.id + '"] .cbtn[data-a="renew"]'); await page.waitForTimeout(120);
    assert((await page.$eval('#rnMrr', (e) => e.value)) === '300', '미리 채움(천원) ' + (await page.$eval('#rnMrr', (e) => e.value)));
    await page.fill('#rnMrr', '480000'); await page.fill('#rnEnd', YM(T + 11));
    const hint = await page.$eval('#rnMrr + .amt-hint', (e) => ({ t: e.textContent, w: e.classList.contains('warn') })); assert(hint.w && /4\.8억원/.test(hint.t) && /1,600배/.test(hint.t), '환산 ' + JSON.stringify(hint));
    await page.click('#rnGo'); await page.waitForTimeout(700);
    assert(db.ct(c.id).mrr === 300000 && db.ct(c.id).renew_count === 0 && dialogs.some((x) => /1,600배/.test(x)), '취소했는데 저장됨 ' + db.ct(c.id).mrr);
    await page.fill('#rnMrr', '480'); await page.click('#rnGo'); await page.waitForTimeout(900);
    const d = db.ct(c.id), rv = db.rev(c.id); await ctx.close();
    assert(d.mrr === 480000 && d.renew_count === 1 && rv[YM(T)] === 480000 && rv[YM(T + 11)] === 480000 && d.end_month.slice(0, 7) === YM(T + 11), 'DB ' + d.mrr + ' · ' + rv[YM(T)]);
    return '취소 → 그대로 · 480 → 480,000원 × 12개월';
  });
  await S.t('㊿+157 계약 표 ✎: MRR 칸은 천원(«500» 표시) · 480 저장 → 48만원 + 이번 달~종료월 월 매출도 맞춤 · 확인 창 «취소»면 아무것도 안 바뀜', async () => {
    const { db, ctx, page, dialogs } = await fboot(); const c = cOf(db, '가상고객07')[0], m0 = c.mrr;
    page.__dlg = (d) => (/같이 맞춥니다/.test(d.message()) ? d.dismiss() : d.accept());
    const i1 = await gridEdit(page, 'contracts', '가상고객07', [['MRR', '999']]);
    assert(i1.MRR === String(m0 / 1000) && db.ct(c.id).mrr === m0 && db.rev(c.id)[YM(T)] === m0 && dialogs.length === 1, '취소 ' + JSON.stringify(i1) + ' ' + db.ct(c.id).mrr);
    page.__dlg = null; const c2 = cOf(db, '가상고객_이달만기')[0];
    const i2 = await gridEdit(page, 'contracts', '가상고객_이달만기', [['MRR', '480']]);
    const s0 = await psum(page, T); const d = db.ct(c2.id);
    assert(i2.MRR === '500' && d.mrr === 480000 && db.rev(c2.id)[YM(T)] === 480000, 'MRR ' + JSON.stringify(i2) + ' → ' + d.mrr + ' · 월 ' + db.rev(c2.id)[YM(T)]);
    assert(dialogs.some((x) => /같이 맞춥니다/.test(x) && /50만원 → 48만원/.test(x)), '맞춤 확인 창 ' + dialogs.slice(-1));
    await page.reload(); await fready(page); const s1 = await psum(page, T); await ctx.close();
    assert(s1 === s0, '다시 읽은 합계가 다름 ' + s0 + ' / ' + s1); return 'MRR 칸 «' + i2.MRR + '» → 480,000원 · 이달 장표 반영';
  });
  await S.t('㊿+157 계약 표 ✎: 종료월 당김 → 뒤 매출 삭제 · 늘림 → 늘린 달을 MRR 로 채움 · 상태 «해지» → 해지월 뒤 매출 삭제', async () => {
    const { db, ctx, page } = await fboot();
    const a = cOf(db, '가상고객04')[0], ea = ix(a.end_month); await gridEdit(page, 'contracts', '가상고객04', [['종료월', YM(ea - 3)]]);
    const ra = db.rev(a.id); assert(!Object.keys(ra).some((k) => k > YM(ea - 3)) && ra[YM(ea - 3)], '당김 ' + Object.keys(ra).slice(-4));
    const b = cOf(db, '가상고객05')[0], eb = ix(b.end_month); await gridEdit(page, 'contracts', '가상고객05', [['종료월', YM(eb + 6)]]);
    const rb = db.rev(b.id); assert(rb[YM(eb + 1)] === b.mrr && rb[YM(eb + 6)] === b.mrr && !rb[YM(eb + 7)], '늘림 ' + Object.keys(rb).slice(-3));
    const c = cOf(db, '가상고객06')[0]; await gridEdit(page, 'contracts', '가상고객06', [['상태', '해지'], ['해지월', YM(T)], ['해지사유', '비용이슈']]);
    const rc = db.rev(c.id); await ctx.close(); assert(db.ct(c.id).status === '해지' && rc[YM(T)] && !rc[YM(T + 1)], '해지 ' + Object.keys(rc).slice(-3));
    return '당김 · 늘림 · 해지';
  });
  await S.t('㊿+157 계약 표 ✎ 경계: 연도 오타로 기간을 통째로 1년 당김 → 새 기간 밖 매출 없음 · 빈 달만 예전 MRR 로 채움 · 시작>종료는 저장 안 함 · 해지 계약은 늘려도 매출 안 만듦', async () => {
    const { db, ctx, page, dialogs } = await fboot();
    const a = cOf(db, '가상고객08')[0], s0 = ix(a.start_month), e0 = ix(a.end_month), m0 = a.mrr;
    await gridEdit(page, 'contracts', '가상고객08', [['시작월', YM(s0 - 12)], ['종료월', YM(e0 - 12)]]);
    const ra = db.rev(a.id), ks = Object.keys(ra);
    assert(ks.length && ks[0] === YM(s0 - 12) && ks[ks.length - 1] === YM(e0 - 12) && ks.every((k) => ra[k] === m0) && ks.length === e0 - s0 + 1, '당긴 기간 ' + ks[0] + '~' + ks[ks.length - 1] + ' · ' + ks.length + '개월');
    const b = cOf(db, '가상고객09')[0], bs = ix(b.start_month), be = ix(b.end_month);
    const n0 = dialogs.length; await gridEdit(page, 'contracts', '가상고객09', [['종료월', YM(bs - 2)]]);
    assert(db.ct(b.id).end_month.slice(0, 7) === YM(be) && dialogs.length === n0 && /시작월/.test(await page.$eval('#dvMsg', (e) => e.textContent)), '시작>종료가 저장됨');
    await page.click('#dvTable button:has-text("취소")').catch(() => {});
    const h = cOf(db, '가상고객_해지')[0], he = ix(h.end_month), hn = Object.keys(db.rev(h.id)).length;
    await gridEdit(page, 'contracts', '가상고객_해지', [['종료월', YM(he + 3)]]);
    await ctx.close(); assert(Object.keys(db.rev(h.id)).length === hn, '해지 계약에 매출이 생김'); return '당김 · 막음 · 해지 그대로';
  });
  await S.t('㊿+157 붙여넣기: 원으로 된 시트를 그대로 붙이면(1000배) «금액이 이상해 보이는 칸» 확인 → 취소하면 추가 안 됨 · 미리보기는 «= 15억원» 처럼', async () => {
    const { db, ctx, page, dialogs } = await fboot(); page.__dlg = (d) => (/이상해 보이는/.test(d.message()) ? d.dismiss() : d.accept());
    await page.evaluate(() => SVC.switchView('targets')); await page.waitForTimeout(250); await page.evaluate(() => SVC.openPaste());
    const yr = new Date().getFullYear() + 2, heads = await page.evaluate(() => SVC.pasteCols(SVC.GRIDS.targets).map((c) => c.k));
    await page.fill('#pasteTa', heads.map((k) => (k === 'year' ? String(yr) : k === 'amount' ? '1500000000' : '')).join('\t'));
    const prev = await page.$eval('#pastePrev', (e) => e.textContent); await page.click('#pasteGo'); await page.waitForTimeout(600);
    const t = db.t.targets.find((x) => +x.year === yr); await ctx.close();
    assert(/1,500,000억원|150조|억원/.test(prev) && !t && dialogs.some((x) => /이상해 보이는/.test(x)), '미리보기 «' + prev + '» · 저장 ' + JSON.stringify(t));
    return prev.slice(0, 60);
  });
  await S.t('㊿+157 입력·수정 (천원 칸): 신규 385 · 에스원 설치비 2000 · 추가 90 · 갱신 550 · 금액 수정 700 · 해지 — DB 는 원 · LIVE · 이번 달 합계', async () => {
    const { db, ctx, page } = await fboot(); const l0 = await liveN(page, T), s0 = await psum(page, T);
    await openEdit(page, 'new'); await page.fill('#nCust', '가상고객_신규'); await page.fill('#nStart', YM(T)); await page.fill('#nEnd', YM(T + 11)); await page.fill('#nMrr', '385');
    assert(/38\.5만원/.test(await page.$eval('#nMrr + .amt-hint', (e) => e.textContent)), '환산 표시'); await saveEdit(page);
    const n1 = cOf(db, '가상고객_신규')[0]; assert(n1.mrr === 385000 && n1.total_amount === 4620000 && Object.keys(db.rev(n1.id)).length === 12, '신규 ' + n1.mrr);
    await openEdit(page, 'new'); await page.fill('#nCust', '가상고객_에스원2'); await page.selectOption('#nLine', 'S1'); await page.dispatchEvent('#nLine', 'change'); await page.fill('#nStart', YM(T)); await page.fill('#nEnd', YM(T + 23)); await page.fill('#nMrr', '1200'); await page.fill('#nFee', '2000'); await saveEdit(page);
    const n2 = cOf(db, '가상고객_에스원2')[0]; assert(n2.mrr === 1200000 && n2.install_fee === 2000000, '에스원 ' + n2.mrr + '/' + n2.install_fee);
    await openEdit(page, 'add'); await pick(page, 'aFind', 'aPick', '가상고객_MDR'); await page.fill('#aQty', '30'); await page.fill('#aStart', YM(T)); await page.fill('#aMrr', '90'); await saveEdit(page);
    const kid = cOf(db, '가상고객_MDR').filter((c) => c.parent_contract_id).sort((x, y) => y.id - x.id)[0]; assert(kid.mrr === 90000, '추가 ' + kid.mrr);
    const r0 = cOf(db, '가상고객_이달만기')[0]; await openEdit(page, 'renew'); await pick(page, 'rFind', 'rPick', '가상고객_이달만기'); await page.fill('#rEnd', YM(T + 12)); await page.fill('#rMrr', '550'); await saveEdit(page);
    assert(db.ct(r0.id).mrr === 550000 && db.rev(r0.id)[YM(T)] === 500000 && db.rev(r0.id)[YM(T + 1)] === 550000, '갱신');
    const f0 = cOf(db, '가상고객01')[0], fm0 = f0.mrr; await openEdit(page, 'fix'); await pick(page, 'fFind', 'fPick', '가상고객01'); await page.fill('#fFrom', YM(T)); await page.fill('#fMrr', '700'); await saveEdit(page);
    assert(db.ct(f0.id).mrr === 700000 && db.rev(f0.id)[YM(T)] === 700000, '금액 수정');
    const h0 = cOf(db, '가상고객03')[0]; await openEdit(page, 'churn'); await pick(page, 'cFind', 'cPick', '가상고객03'); await page.fill('#cMonth', YM(T)); await page.fill('#cReason', '비용이슈'); await saveEdit(page);
    assert(db.ct(h0.id).status === '해지' && !db.rev(h0.id)[YM(T + 1)], '해지');
    await page.reload(); await fready(page);
    const s1 = await psum(page, T), want = s0 + 385000 + 1200000 + 90000 + (700000 - fm0); const l1 = await liveN(page, T); await ctx.close();
    assert(s1 === want, '이번 달 합계 ' + s1 + ' ≠ ' + want); assert(l1 === l0 + 1, 'LIVE ' + l0 + '→' + l1 + ' (신규 2 − 이번 달 해지 1 · 해지는 해지월부터 LIVE 제외)');
    return '합계 +' + (s1 - s0).toLocaleString('ko-KR') + '원 · LIVE ' + l0 + '→' + l1;
  });
  await S.t('㊿+157 장비: 신청 폼 접수 즉시 현황(재고) 생김 · 붙여넣기 신청도 현황 반영', async () => {
    const { db, ctx, page } = await fboot();
    await page.evaluate(() => SVC.switchView('ordernew')); await page.waitForTimeout(250); await page.fill('#odCustomer', '가상고객05'); await page.fill('#odMgr', '담당자B'); await page.fill('#odQty', '2'); await page.fill('#odSerials', 'TSTN0001, TSTN0002'); await page.click('#odGo'); await page.waitForTimeout(800);
    const a1 = db.t.equipment_assets.filter((a) => /^TSTN/.test(a.serial)).map((a) => a.status + ':' + a.customer);
    assert(a1.length === 2 && a1.every((x) => x.startsWith('재고')), '폼 ' + JSON.stringify(a1));
    await page.evaluate(() => SVC.switchView('orders')); await page.waitForTimeout(250); await page.evaluate(() => SVC.openPaste());
    const heads = await page.evaluate(() => SVC.pasteCols(SVC.GRIDS.orders).map((c) => c.k)); const line = (o) => heads.map((k) => o[k] || '').join('\t');
    await page.fill('#pasteTa', line({ channel: '일반', order_type: '신규발주', customer: '가상고객09', model: 'S100', qty: '1', serials: 'TSTP0002', status: '설치완료' })); await page.click('#pasteGo'); await page.waitForTimeout(1300);
    const a2 = db.t.equipment_assets.find((a) => a.serial === 'TSTP0002'); await ctx.close(); assert(a2 && a2.status === '임대중' && a2.customer === '가상고객09', '붙여넣기 ' + JSON.stringify(a2));
    return '폼 2대 재고 · 붙여넣기 1대 임대중';
  });
  await S.t('㊿+157 데이터 점검 «금액 단위 실수 의심»: 실제 사고와 같은 상태(월 4.8억 · MRR 480원)를 잡고 · 수정 창에서 MRR 480(천원) → 이번 달~종료월 월 매출까지 복구', async () => {
    const { db, ctx, page } = await fboot(); const c = cOf(db, '가상고객_만기지남')[0]; c.end_month = idxYm(T + 11); c.mrr = 480; c.renew_count = 1;
    for (let i = T; i <= T + 11; i++) db.t.monthly_revenue.push({ contract_id: c.id, month: idxYm(i), amount: 480000000 });
    await page.reload(); await fready(page); await page.evaluate(() => SVC.navMenu('dcheck')); await page.waitForTimeout(500);
    const it = await page.evaluate(() => { const x = SVC.dcRules().find((q) => q.id === 'c_amt_odd'); return x && x.sev + ' ' + x.items.map((i) => i.label + ' | ' + i.sub).join(' / '); });
    assert(it && /^crit/.test(it) && /가상고객_만기지남/.test(it) && /4\.8억원/.test(it) && /MRR 480원/.test(it), '규칙 ' + it);
    assert(!/가상고객_에스원(일할|해지)/.test(it), '에스원 일할 계산(첫 달 2,433원 · 해지 달 3,000원)을 실수로 잡음 ' + it);
    await page.evaluate(() => { const x = SVC.dcRules().find((q) => q.id === 'c_amt_odd'); SVC.dcFixOpen('c_amt_odd', x.items.findIndex((i) => /가상고객_만기지남/.test(i.label)), ''); }); await page.waitForTimeout(300);
    assert((await page.$eval('#dcfForm [data-k="mrr"]', (e) => e.value)) === '0.48', 'MRR 칸(천원) ' + (await page.$eval('#dcfForm [data-k="mrr"]', (e) => e.value)));
    await page.fill('#dcfForm [data-k="mrr"]', '480'); await page.click('#dcfSave'); await page.waitForTimeout(1600);
    const d = db.ct(c.id), rv = db.rev(c.id); const left = await page.evaluate(() => SVC.dcRules().find((q) => q.id === 'c_amt_odd').items.length); await ctx.close();
    assert(d.mrr === 480000 && rv[YM(T)] === 480000 && rv[YM(T + 11)] === 480000 && left === 0, '복구 ' + d.mrr + ' · ' + rv[YM(T)] + ' · 남은 ' + left);
    return it.slice(0, 90);
  });
  await S.t('㊿+157 설치비 칸 · 월 목표 · OI 예상단가 · 연간 목표 붙여넣기 — 전부 천원으로 입력 → DB 는 원', async () => {
    const { db, ctx, page } = await fboot(); const c = cOf(db, '가상고객_에스원')[0]; const y = +c.settle_month.slice(0, 4), m = +c.settle_month.slice(5, 7);
    await page.evaluate(() => { SVC.navMenu('dash'); try { SVC.ccAnalysisOpen(true, true); } catch (e) { /* noop */ } const w = document.querySelector('[data-w="ifee"]'); if (w) { w.classList.remove('w-off'); w.scrollIntoView(); } }); await page.waitForTimeout(500);
    await page.click('td.ifc[data-y="' + y + '"][data-m="' + m + '"]'); await page.waitForTimeout(350);
    assert((await page.$eval('.ifin[data-f="c' + c.id + '"]', (e) => e.value)) === '2000', '설치비 칸(천원)');
    await page.fill('.ifin[data-f="c' + c.id + '"]', '2500'); await page.click('#ifSave'); await page.waitForTimeout(700); assert(db.ct(c.id).install_fee === 2500000, '설치비 ' + db.ct(c.id).install_fee);
    const yr = new Date().getFullYear(); await page.evaluate((y) => SVC.openTargetEditor(y), yr); await page.waitForTimeout(250);
    assert((await page.$eval('#ovlTarget input[data-m="1"]', (e) => e.value)) === '90000', '월 목표 칸(천원)'); await page.fill('#ovlTarget input[data-m="1"]', '95000'); await page.click('#tgSave'); await page.waitForTimeout(600);
    assert(db.t.monthly_targets.find((x) => x.year === yr && x.month === 1).amount === 95000000, '월 목표');
    await page.evaluate(() => SVC.switchView('oinew')); await page.waitForTimeout(250); await page.fill('#oiCust', '가상고객_OI2'); await page.fill('#oiAmt', '12000'); await page.click('#oiGo'); await page.waitForTimeout(700);
    assert(db.t.oi_deals.find((x) => x.customer === '가상고객_OI2').expect_amount === 12000000, 'OI');
    await page.evaluate(() => SVC.switchView('targets')); await page.waitForTimeout(250); await page.evaluate(() => SVC.openPaste());
    assert(/금액은 천원/.test(await page.$eval('#pasteCols', (e) => e.textContent)), '붙여넣기 안내');
    const heads = await page.evaluate(() => SVC.pasteCols(SVC.GRIDS.targets).map((c) => c.k)); await page.fill('#pasteTa', heads.map((k) => (k === 'year' ? String(yr + 1) : k === 'amount' ? '1,500,000' : '')).join('\t'));
    await page.click('#pasteGo'); await page.waitForTimeout(1000); const t = db.t.targets.find((x) => +x.year === yr + 1); await ctx.close();
    assert(t && t.amount === 1500000000, '연간 목표 ' + (t && t.amount)); return '설치비 · 월 목표 · OI · 붙여넣기';
  });
  // ㊿+159 재약정(연장) — 실제 문의와 같은 모양: 신규 240노드(월 240) + 추가 30노드(월 42) · 같은 달 만기 → 270노드 월 270 으로 재약정
  //   연장은 원계약 한 줄(«연장 n회») · 그 전 달 월 매출은 그대로 · 추가 계약은 합치기 · 겹치는 재약정 행 확인 · 두 번 연장 → 점검 · 되돌리기
  async function fbootWith(prep, opt) {
    const db = new FakeDB(seedData()); const info = prep ? prep(db) : null;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' }); const page = await ctx.newPage();
    const errs = [], dialogs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    page.on('dialog', (d) => { dialogs.push(d.message().replace(/\s+/g, ' ')); (page.__dlg ? page.__dlg(d) : d.accept()).catch(() => {}); });
    await fakeBackend(page, db, opt || {}); await page.goto(url + '/index.html'); await fready(page);
    return { db, ctx, page, errs, dialogs, info };
  }
  const addMerge = (db) => {
    const cu = Math.max(...db.t.customers.map((c) => c.id)) + 1, id = Math.max(...db.t.contracts.map((c) => c.id)) + 1, e0 = T - 3;
    db.t.customers.push({ id: cu, name: '가상고객_통합', industry: '기업', sector: 'IT·소프트웨어', aliases: [] });
    const base = { customer_id: cu, line: 'Cloud', partner: '직접(계산서)', biller: null, channel: '일반', billing: '월납입', install_fee: null, settle_month: null, renew_count: 0, renew_history: [], auto_renew: false, version: 'V6.0', combine: null, csm: null, s1_no: null, live_override: null, churn_reason: null, churn_month: null, note: null, lead_src: null };
    db.t.contracts.push({ ...base, id, contract_type: '신규', status: '신규', parent_contract_id: null, qty: 240, mrr: 240000, start_month: idxYm(T - 14), end_month: idxYm(e0), term_months: 12, total_amount: 2880000 });
    db.t.contracts.push({ ...base, id: id + 1, contract_type: '추가', status: '추가', parent_contract_id: id, qty: 30, mrr: 42000, start_month: idxYm(T - 8), end_month: idxYm(e0), term_months: 6, total_amount: 252000 });
    for (let i = T - 14; i <= e0; i++) db.t.monthly_revenue.push({ contract_id: id, month: idxYm(i), amount: 240000 });
    for (let i = T - 8; i <= e0; i++) db.t.monthly_revenue.push({ contract_id: id + 1, month: idxYm(i), amount: 42000 });
    return { id, kid: id + 1, e0 };
  };
  const pastOf = (db, id, e0) => { const r = db.rev(id); return JSON.stringify(Object.keys(r).filter((k) => k <= YM(e0)).map((k) => k + '=' + r[k])); };
  const reloadData = (page) => page.evaluate(async () => { const nd = await SVC.loadFromDb(); SVC.onData(nd); }).then(() => page.waitForTimeout(250));
  await S.t('㊿+159 만기 처리 › 연장: 노드 240+30=270 · 같이 끝나는 추가 계약 합치기(체크 끄면 240) · 그 전 달 월 매출 그대로 · 재약정 행 안 생김 · 추가 계약은 원래 종료월에 끝', async () => {
    const { db, ctx, page, errs, info } = await fbootWith(addMerge), { id, kid, e0 } = info;
    const p0 = pastOf(db, id, e0), n0 = db.t.contracts.length, s0 = db.monthSum(idxYm(e0)), k0 = JSON.stringify(db.rev(kid));
    await page.evaluate(() => SVC.openRenewList('lapsed')); await page.waitForTimeout(250);
    await page.click('#rnList tr[data-id="' + id + '"] .cbtn[data-a="renew"]'); await page.waitForTimeout(200);
    const f0 = await page.evaluate(() => ({ q: document.getElementById('rnQty').value, m: [...document.querySelectorAll('#rnList .rnMate')].map((c) => c.value + ':' + c.checked), pv: document.getElementById('rnPrev').textContent }));
    assert(f0.q === '270' && f0.m.join() === kid + ':true', '처음 폼 ' + JSON.stringify(f0));
    await page.click('#rnList .rnMate'); const q1 = await page.$eval('#rnQty', (e) => e.value); await page.click('#rnList .rnMate'); const q2 = await page.$eval('#rnQty', (e) => e.value);
    assert(q1 === '240' && q2 === '270', '체크 끄고 켜기 → 노드 ' + q1 + ' / ' + q2);
    await page.fill('#rnMrr', '270'); await page.fill('#rnEnd', YM(e0 + 12)); await page.waitForTimeout(80);
    const pv = await page.$eval('#rnPrev', (e) => e.textContent);
    assert(pv.includes(YM(e0) + '까지 월 매출은 그대로') && pv.includes(YM(e0 + 1) + '~' + YM(e0 + 12) + ' 12개월 월 270천원') && /노드 240 → 270/.test(pv) && /재약정 행은 따로 만들지 않음/.test(pv), '미리보기 ' + pv);
    await page.click('#rnGo'); await page.waitForFunction(({ id, kid }) => /재약정 통합/.test(document.getElementById('rnMsg').textContent + '') || document.getElementById('rnMsg').className.includes('ok'), { id, kid }, { timeout: 8000 });
    await page.waitForTimeout(300);
    const c = db.ct(id), rv = db.rev(id), k = db.ct(kid); await ctx.close();
    assert(c.renew_count === 1 && c.mrr === 270000 && c.qty === 270 && ix(c.end_month) === e0 + 12 && c.status === '재약정' && c.contract_type === '재약정' && c.renew_history[0].prev_ctype === '신규', '원계약 ' + JSON.stringify({ n: c.renew_count, mrr: c.mrr, qty: c.qty, end: c.end_month, ct: c.contract_type, st: c.status }));
    assert(pastOf(db, id, e0) === p0, '그 전 달 월 매출이 바뀜');
    assert(rv[YM(e0 + 1)] === 270000 && rv[YM(e0 + 12)] === 270000 && !rv[YM(e0 + 13)], '새 기간 월 매출');
    assert(/재약정 통합 → #/.test(k.note || '') && k.status === '추가' && JSON.stringify(db.rev(kid)) === k0, '추가 계약 ' + k.status + ' · ' + k.note);
    const cs = (i) => (db.rev(id)[YM(i)] || 0) + (db.rev(kid)[YM(i)] || 0);
    assert(db.t.contracts.length === n0 && db.monthSum(idxYm(e0)) === s0 && cs(e0) === 282000 && cs(e0 + 1) === 270000, '재약정 행 ' + (db.t.contracts.length - n0) + ' · 고객 합계 ' + cs(e0) + ' → ' + cs(e0 + 1));
    const h = c.renew_history[0]; assert(h.prev_qty === 240 && h.qty === 270 && h.prev_mrr === 240000 && h.merged && h.merged[0].id === kid, '연장 기록 ' + JSON.stringify(h).slice(0, 200));
    assert(!errs.length, errs.join(' | ')); return YM(e0) + '까지 240+42 그대로 · ' + YM(e0 + 1) + '~ 270 · 노드 270 · 추가 통합';
  });
  await S.t('㊿+159 신규 등록: 연장한 계약과 같은 기간의 «재약정» 행 → «겹치는 계약» 확인 · 취소면 저장 안 됨 · 확인하면 저장되고 데이터 점검 «겹치는 재약정 행»이 잡음', async () => {
    const { db, ctx, page, errs, dialogs, info } = await fbootWith(addMerge), { id, kid, e0 } = info;
    await page.evaluate(async ({ id, kid, ne }) => { const r = SVC.ST.DATA.rows.find((x) => x._id === id); await SVC.doRenew(r, ne, 270000, '', { qty: 270, merge: [kid] }); }, { id, kid, ne: e0 + 12 }); await reloadData(page);
    const n0 = db.t.contracts.length;
    const fillNew = async () => { await openEdit(page, 'new'); await page.fill('#nCust', '가상고객_통합'); await page.selectOption('#nType', '재약정'); await page.fill('#nStart', YM(e0 + 1)); await page.fill('#nEnd', YM(e0 + 12)); await page.fill('#nMrr', '270'); };
    page.__dlg = (d) => (/겹치는 계약/.test(d.message()) ? d.dismiss() : d.accept());
    await fillNew(); await page.click('#eGo'); await page.waitForTimeout(700);
    const m1 = await page.$eval('#eMsg', (e) => e.textContent);
    assert(db.t.contracts.length === n0 && /갱신/.test(m1) && dialogs.some((x) => /겹치는 계약/.test(x) && /#\d+ 재약정/.test(x) && /12개월/.test(x) && /두 번 잡힙니다/.test(x)), '취소했는데 저장됨 / 안내 ' + m1 + ' / ' + dialogs.slice(-1));
    page.__dlg = null; await saveEdit(page); assert(db.t.contracts.length === n0 + 1, '확인했는데 저장 안 됨');
    await page.evaluate(() => document.getElementById('ovlEdit').classList.remove('on')); await reloadData(page);
    const R = await page.evaluate(() => { const r = SVC.dcRules().find((x) => x.id === 'c_renew_overlap'); return r ? { sev: r.sev, items: r.items.map((x) => x.label + ' | ' + x.sub) } : null; });
    await ctx.close();
    assert(R && R.sev === 'warn' && R.items.some((x) => /가상고객_통합/.test(x) && /#\d+ 연장 1회/.test(x)), '데이터 점검 ' + JSON.stringify(R));
    assert(!errs.length, errs.join(' | ')); return '취소 → 그대로 · 확인 → 저장 + 점검 1건';
  });
  await S.t('㊿+159 «↩ 마지막 연장 되돌리기»: 두 번 연장(중복) → 데이터 점검 «연장이 짧은 사이에 두 번» → 갱신 탭에서 2번 되돌리면 처음과 같음 · 이관 기록은 못 되돌린다고 안내', async () => {
    const prep = (db) => { const r = addMerge(db); const o = db.t.contracts.find((c) => c.customer_id === db.t.customers.find((x) => x.name === '가상고객01').id); o.renew_count = 1; o.renew_history = [{ no: 1, from: o.start_month, to: o.end_month, mrr: o.mrr, by: 'sheet-sync' }]; return r; };
    const { db, ctx, page, errs, dialogs, info } = await fbootWith(prep), { id, kid, e0 } = info;
    const snap = () => { const c = db.ct(id), k = db.ct(kid); return JSON.stringify({ e: c.end_month, m: c.mrr, q: c.qty, s: c.status, n: c.renew_count, h: c.renew_history.length, rv: db.rev(id), kn: k.note, ks: k.status }); };
    const s0 = snap();
    await page.evaluate(async ({ id, kid, e0 }) => { let r = SVC.ST.DATA.rows.find((x) => x._id === id); await SVC.doRenew(r, e0 + 12, 270000, '', { qty: 270, merge: [kid] }); const nd = await SVC.loadFromDb(); SVC.onData(nd);
      r = SVC.ST.DATA.rows.find((x) => x._id === id); await SVC.doRenew(r, e0 + 24, 270000, '', {}); }, { id, kid, e0 }); await reloadData(page);
    assert(db.ct(id).renew_count === 2 && ix(db.ct(id).end_month) === e0 + 24, '두 번 연장 준비');
    const R = await page.evaluate(() => { const r = SVC.dcRules().find((x) => x.id === 'c_renew_dup'); return r ? r.items.map((x) => x.label + ' | ' + x.sub + ' | ' + (x.act ? x.act.label : '')) : null; });
    assert(R && R.length === 1 && /가상고객_통합/.test(R[0]) && /연장 2회/.test(R[0]) && /되돌리기/.test(R[0]), '데이터 점검 ' + JSON.stringify(R));
    await openEdit(page, 'renew'); await page.fill('#rFind', '가상고객_통합'); await page.waitForTimeout(120); await page.click('#rPick .pi:has-text("연장 ")'); await page.waitForTimeout(120);
    assert(await page.$('#rUndoGo'), '되돌리기 버튼 없음');
    await page.click('#rUndoGo'); await page.waitForFunction((id) => document.querySelector('#rUndo') && /연장 1회/.test(document.querySelector('#rUndo').textContent), id, { timeout: 8000 });
    const u1 = db.ct(id), d1 = dialogs.slice(-1)[0] || '';
    assert(u1.renew_count === 1 && ix(u1.end_month) === e0 + 12 && u1.mrr === 270000 && u1.qty === 270 && !db.rev(id)[YM(e0 + 13)] && db.rev(id)[YM(e0 + 12)] === 270000, '1번 되돌린 뒤 ' + JSON.stringify({ n: u1.renew_count, e: u1.end_month }));
    assert(/연장 2회 → 1회/.test(d1) && d1.includes('종료월 ' + YM(e0 + 24) + ' → ' + YM(e0 + 12)) && d1.includes(YM(e0 + 12) + '까지는 그대로'), '확인 창 ' + d1);
    await page.click('#rUndoGo'); await page.waitForFunction(() => !document.querySelector('#rUndoGo') || /연장 0회/.test(document.querySelector('#eMsg').textContent), null, { timeout: 8000 }); await page.waitForTimeout(200);
    const d2 = dialogs.slice(-1)[0] || '';
    assert(snap() === s0, '두 번 되돌린 뒤 처음과 다름\n' + s0 + '\n' + snap());
    assert(/노드수 270 → 240/.test(d2) && /#\d+ 의 «재약정 통합» 표시 되돌림/.test(d2), '두 번째 확인 창 ' + d2);
    await page.fill('#rFind', '가상고객01'); await page.waitForTimeout(120); await page.click('#rPick .pi'); await page.waitForTimeout(120);
    const mig = await page.evaluate(() => ({ btn: !!document.getElementById('rUndoGo'), t: (document.getElementById('rUndo') || {}).textContent || '' }));
    await ctx.close();
    assert(!mig.btn && /자동으로 되돌릴 수 없습니다/.test(mig.t), '이관 기록 ' + JSON.stringify(mig));
    assert(!errs.length, errs.join(' | ')); return '2회 → 1회 → 0회 = 처음 상태 · 이관 기록 안내';
  });
  await S.t('㊿+159 연장 경계: 다른 사이트 원계약의 추가·사이트별 하위 계약은 합치기 목록에 안 나옴 · 따로 등록된 추가는 체크 안 된 채로 · 옛 행으로 두 번 저장 막음 · 무약정 계약 되돌리면 종료월 다시 비움', async () => {
    const prep = (db) => { const r = addMerge(db), cu = db.ct(r.id).customer_id, b = { ...db.ct(r.kid) };
      const site2 = r.id + 10, add2 = r.id + 11, sub = r.id + 12, loose = r.id + 13, open = r.id + 14;
      db.t.contracts.push({ ...db.ct(r.id), id: site2, renew_history: [], csm: 'SITE-B' }, { ...b, id: add2, parent_contract_id: site2 }, { ...b, id: sub, contract_type: '신규', status: '신규', qty: 5 }, { ...b, id: loose, parent_contract_id: null, qty: 7 });
      const ocu = Math.max(...db.t.customers.map((c) => c.id)) + 1; db.t.customers.push({ id: ocu, name: '가상고객_무약정', industry: '기업', sector: 'IT·소프트웨어', aliases: [] });
      db.t.contracts.push({ ...db.ct(r.id), id: open, customer_id: ocu, end_month: null, term_months: null, total_amount: null, renew_history: [] });
      for (let i = T - 14; i <= T + 2; i++) db.t.monthly_revenue.push({ contract_id: open, month: idxYm(i), amount: 240000 });
      void cu; return { ...r, site2, add2, sub, loose, open }; };
    const { db, ctx, page, errs, info } = await fbootWith(prep), { id, kid, e0, add2, sub, loose, open } = info;
    const m = await page.evaluate((id) => { const r = SVC.ST.DATA.rows.find((x) => x._id === id); const ms = SVC.renewMates(r); return { ids: ms.map((x) => x._id), q0: SVC.renewQty0(r, ms), html: SVC.renewMatesHtml(r, ms, 'rn') }; }, id);
    assert(m.ids.includes(kid) && m.ids.includes(loose) && !m.ids.includes(add2) && !m.ids.includes(sub), '합치기 목록 ' + JSON.stringify(m.ids));
    assert(m.q0 === 270 && new RegExp('value="' + kid + '"[^>]*checked').test(m.html) && !new RegExp('value="' + loose + '"[^>]*checked').test(m.html) && /따로 등록/.test(m.html), '기본 체크 ' + m.q0);
    const stale = await page.evaluate(async ({ id, ne }) => { const r = SVC.ST.DATA.rows.find((x) => x._id === id); await SVC.doRenew(r, ne, 270000, '', {}); const nd = await SVC.loadFromDb(); SVC.onData(nd);
      try { await SVC.doRenew(r, ne + 12, 270000, '', {}); return 'saved'; } catch (e) { return String(e.message); } }, { id, ne: e0 + 12 });
    assert(/방금 바뀌었습니다/.test(stale) && db.ct(id).renew_count === 1, '옛 행으로 두 번째 저장 ' + stale + ' · 회차 ' + db.ct(id).renew_count);
    const o0 = JSON.stringify({ e: db.ct(open).end_month, rv: db.rev(open) });
    await page.evaluate(async ({ open, ne }) => { const r = SVC.ST.DATA.rows.find((x) => x._id === open); await SVC.doRenew(r, ne, 300000, '', {}); const nd = await SVC.loadFromDb(); SVC.onData(nd);
      const r2 = SVC.ST.DATA.rows.find((x) => x._id === open); await SVC.doUndoRenew(r2, SVC.renewUndoPlan(r2)); }, { open, ne: T + 12 });
    const o1 = JSON.stringify({ e: db.ct(open).end_month, rv: db.rev(open) }); await ctx.close();
    assert(o1 === o0 && db.ct(open).end_month === null, '무약정 되돌리기 ' + db.ct(open).end_month);
    assert(!errs.length, errs.join(' | ')); return '목록 2건(부속 체크 · 따로 등록 미체크) · 옛 행 거부 · 무약정 그대로';
  });
  await S.t('㊿+160 연장하면 상태 «재약정»(구분은 그대로) · 해지였던 계약도 재약정으로 되살림 · 추가 계약은 «추가» · 계약 상세 👁 에 «계약 기간 · 연장 이력»(최초 + 회차 · 시트 이관 기록 포함) · ㊿+161 고객 360 계약 표에도 연장', async () => {
    const prep = (db) => { const r = addMerge(db), o = db.t.contracts.find((c) => c.customer_id === db.t.customers.find((x) => x.name === '가상고객02').id);
      o.renew_count = 1; o.contract_type = '재약정'; o.status = '재약정'; o.renew_history = [{ renew_no: 1, new_end: o.end_month, mrr: o.mrr, merged: 973, by: 'migration-57' }]; return { ...r, mig: o.id }; };
    const { db, ctx, page, errs, info } = await fbootWith(prep), { id, e0, mig } = info;
    const st = await page.evaluate(() => [SVC.renewStatus({ status: '신규', ctype: '신규' }), SVC.renewStatus({ status: '해지', ctype: '신규' }), SVC.renewStatus({ status: '서비스종료', ctype: '재약정' }), SVC.renewStatus({ status: '추가', ctype: '추가' }), SVC.renewStatus({ status: 'CN전환', ctype: '신규' })]);
    assert(st.join() === '재약정,재약정,재약정,추가,CN전환', '상태 규칙 ' + st.join());
    await page.evaluate(async ({ id, ne }) => { const r = SVC.ST.DATA.rows.find((x) => x._id === id); await SVC.doRenew(r, ne, 141000, '', { qty: 52 }); const nd = await SVC.loadFromDb(); SVC.onData(nd); }, { id, ne: e0 + 12 });
    assert(db.ct(id).status === '재약정' && db.ct(id).contract_type === '재약정' && db.ct(id).renew_history[0].prev_ctype === '신규', '연장 뒤 ' + db.ct(id).contract_type + '|' + db.ct(id).status);
    const det = async (cid) => { await page.evaluate((cid) => { const c = SVC.ST.RAWX.contracts.find((x) => x.id === cid); SVC.openDetail(c); }, cid); await page.waitForTimeout(300);
      return page.evaluate(() => ({ meta: document.getElementById('dtMeta').textContent, rows: [...document.querySelectorAll('#dtRenew tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent.trim()).join(' | ')) })); };
    const d1 = await det(id);
    assert(/구분 재약정/.test(d1.meta) && /상태 재약정/.test(d1.meta) && /연장 1회/.test(d1.meta) && /52노드/.test(d1.meta), '상세 머리 ' + d1.meta);
    assert(/구분 신규/.test(d1.rows[0]), '최초 줄은 처음 구분(신규) ' + d1.rows[0]);
    assert(d1.rows.length === 2 && d1.rows[0].startsWith('최초 | ' + YM(T - 14) + ' ~ ' + YM(e0) + ' | 240 | 240') && d1.rows[1].startsWith('연장 1회 | ' + YM(e0 + 1) + ' ~ ' + YM(e0 + 12) + ' | 141 | 52'), '연장 이력 ' + JSON.stringify(d1.rows));
    await page.evaluate(() => SVC.closeOvl('ovlDetail'));
    const d2 = await det(mig); await page.evaluate(() => SVC.closeOvl('ovlDetail'));
    /* ㊿+161 고객 360 계약 표: «연장» 칸 + 연장한 계약 아래 한 줄(최초 → 연장 n회 · 기간 · 월 금액 · 노드) */
    const c3 = await page.evaluate((id) => { const r = SVC.ST.DATA.rows.find((x) => x._id === id); SVC.openCust360(r.cust); const t = document.querySelector('#c360Body .c360-sec table');
      return { head: [...t.querySelectorAll('thead th')].map((e) => e.textContent).join('|'), rows: [...t.querySelectorAll('tbody tr')].map((tr) => (tr.className || '-') + ':' + [...tr.children].map((td) => td.textContent.trim()).join(' | ')) }; }, id);
    await ctx.close();
    assert(c3.head === '서비스|채널|파트너|구분|상태|기간|연장|MRR(천원)', c3.head);
    const main = c3.rows.findIndex((x) => /^c360-has:/.test(x) && / \| 1회 \| 141$/.test(x));
    assert(main >= 0 && c3.rows[main + 1] === 'c360-rn:최초 ' + YM(T - 14) + '~' + YM(e0) + ' · 240 · 240노드→연장 1회 ' + YM(e0 + 1) + '~' + YM(e0 + 12) + ' · 141 · 52노드', '고객 360 ' + JSON.stringify(c3.rows));
    assert(c3.rows.filter((x) => /^c360-rn:/.test(x)).length === 1, '연장 안 한 계약에도 줄이 붙음 ' + JSON.stringify(c3.rows));
    assert(d2.rows.length === 2 && /^연장 1회/.test(d2.rows[1]) && /시트 이관/.test(d2.rows[1]) && /재약정 행 #973 합침/.test(d2.rows[1]), '이관 기록 ' + JSON.stringify(d2.rows));
    assert(!errs.length, errs.join(' | ')); return d1.rows.join(' / ').slice(0, 110);
  });
  await S.t('㊿+162 연장 메모 → 계약 관리 «비고»에 덧붙임(같은 글이면 그대로) · 되돌리면 그 메모만 빠짐 · 고객 360 계약 행을 누르면 계약 상세(연장 이력)', async () => {
    const prep = (db) => { const r = addMerge(db); db.t.contracts.find((c) => c.id === r.id).note = '정부 지원'; return r; };
    const { db, ctx, page, errs, dialogs, info } = await fbootWith(prep), { id, e0 } = info;
    const renew = (ne, memo) => page.evaluate(async ({ id, ne, memo }) => { const r = SVC.ST.DATA.rows.find((x) => x._id === id); await SVC.doRenew(r, ne, 250000, memo, {}); SVC.onData(await SVC.loadFromDb()); }, { id, ne, memo });
    await renew(e0 + 12, '3년 재약정 · 단가 조정');
    assert(db.ct(id).note === '정부 지원 · 3년 재약정 · 단가 조정', '비고 ' + db.ct(id).note);
    await renew(e0 + 24, '정부 지원');
    assert(db.ct(id).note === '정부 지원 · 3년 재약정 · 단가 조정', '같은 글 두 번 ' + db.ct(id).note);
    await page.evaluate((id) => { const c = SVC.ST.RAWX.contracts.find((x) => x.id === id); c.note = c.note + ' · 담당 변경'; }, id);
    db.ct(id).note = db.ct(id).note + ' · 담당 변경';
    const undo = () => page.evaluate(async (id) => SVC.renewUndoFlow(SVC.ST.DATA.rows.find((x) => x._id === id)), id);
    assert(await undo() === true && db.ct(id).note === '정부 지원 · 3년 재약정 · 단가 조정 · 담당 변경', '되돌리기 1(같은 글이라 안 붙었던 메모) ' + db.ct(id).note);
    assert(await undo() === true && db.ct(id).note === '정부 지원 · 담당 변경' && /비고에서 연장 메모 «3년 재약정 · 단가 조정» 빼기/.test(dialogs.join(' ')), '되돌리기 2 ' + db.ct(id).note + ' / ' + dialogs.slice(-1)[0]);
    await renew(e0 + 12, '재약정 완료');
    const c3 = await page.evaluate(async (id) => { const r = SVC.ST.DATA.rows.find((x) => x._id === id); SVC.openCust360(r.cust); await new Promise((f) => setTimeout(f, 200));
      const tr = document.querySelector('#c360Body tr[data-c360ct="' + id + '"]'); const sub = tr && tr.nextElementSibling; (sub || tr).click(); await new Promise((f) => setTimeout(f, 300));
      const top = document.getElementById('ovlDetail'); return { has: !!tr, sub: sub ? sub.className : '', open: top.classList.contains('on'), c360: document.getElementById('ovlC360').classList.contains('on'),
        title: document.getElementById('dtTitle').textContent, rows: [...document.querySelectorAll('#dtRenew tbody tr')].map((x) => x.children[0].textContent + ' ' + x.children[1].textContent),
        z: getComputedStyle(top).zIndex + '/' + getComputedStyle(document.getElementById('ovlC360')).zIndex, after: [...document.querySelectorAll('.ovl.on')].map((e) => e.id).join(',') }; }, id);
    assert(c3.has && c3.sub === 'c360-rn' && c3.open && c3.c360 && c3.title === '가상고객_통합' && c3.rows.join('|') === '최초 ' + YM(T - 14) + ' ~ ' + YM(e0) + '|연장 1회 ' + YM(e0 + 1) + ' ~ ' + YM(e0 + 12), '고객 360 → 상세 ' + JSON.stringify(c3));
    const top = await page.evaluate(() => { const a = document.getElementById('ovlDetail'), b = document.getElementById('ovlC360'); return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING); });
    assert(top, '계약 상세가 고객 360 뒤에 깔림');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const back = await page.evaluate(() => [document.getElementById('ovlDetail').classList.contains('on'), document.getElementById('ovlC360').classList.contains('on')].join());
    await ctx.close();
    assert(back === 'false,true', 'Esc 뒤 ' + back);
    assert(!errs.length, errs.join(' | ')); return '비고 «' + db.ct(id).note + '» · 고객 360 → 상세 ' + c3.rows.length + '줄';
  });
  await S.t('㊿+159 홈 AI 답변: «✕ 닫기» · 다른 메뉴로 가면 닫힘(돌아와도 없음) · 생각 중엔 메뉴를 옮겨도 유지 · 생각 중 ✕ 는 멈추고 닫음', async () => {
    let slow = 0;
    const extra = async (route, u) => { if (u.includes('/functions/v1/ask') && slow) { await new Promise((r) => setTimeout(r, slow)); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: 'mock 늦은 답', queries: [] }) }).catch(() => {}); return true; } return false; };
    const { ctx, page, errs } = await fbootWith(null, { extra });
    const st = () => page.evaluate(() => ({ on: document.getElementById('answer').classList.contains('on'), say: document.getElementById('aiSay').textContent, asking: SVC.isAsking(), x: !!document.getElementById('ansClose') }));
    await page.evaluate(() => SVC.ask('이번 달 MRR?')); await page.waitForFunction(() => /mock/.test(document.getElementById('aiSay').textContent), null, { timeout: 8000 });
    const a = await st(); assert(a.on && a.x, '답 ' + JSON.stringify(a));
    await page.evaluate(() => { SVC.switchView('contracts'); SVC.switchView('dash'); }); await page.waitForTimeout(150);
    const b = await st(); assert(!b.on, '다른 메뉴 갔다 와도 남아 있음');
    await page.evaluate(() => SVC.ask('이번 달 MRR?')); await page.waitForFunction(() => /mock/.test(document.getElementById('aiSay').textContent), null, { timeout: 8000 });
    await page.click('#ansClose'); const c = await st(); assert(!c.on, '✕ 닫기로 안 닫힘');
    slow = 1500; await page.evaluate(() => SVC.ask('천천히')); await page.waitForTimeout(200);
    await page.evaluate(() => { SVC.switchView('orders'); SVC.switchView('dash'); }); await page.waitForTimeout(100);
    const d = await st(); assert(d.on && d.asking, '생각 중인데 닫힘 ' + JSON.stringify(d));
    await page.waitForFunction(() => /늦은 답/.test(document.getElementById('aiSay').textContent), null, { timeout: 8000 });
    await page.evaluate(() => SVC.ask('또 천천히')); await page.waitForTimeout(200); await page.click('#ansClose'); await page.waitForTimeout(100);
    const e = await st(); await page.waitForTimeout(1600); const f = await st(); await ctx.close();
    assert(!e.on && !e.asking && !f.on, '생각 중 ✕ ' + JSON.stringify({ e, f }));
    assert(!errs.length, errs.join(' | ')); return '✕ · 메뉴 이동 · 생각 중 유지 · 멈춤';
  });
}
// ㊿+166~167: 새 디자인 «지니언스»(기본) — 정식 로고 · 상단 메뉴(묶음 + 펼침 메뉴 · ㊿+167) · 상단 화면 제목 · 홈(오늘 처리할 일 3칸 → 사업 현황) · 타원 목표 트랙 · 새 로그인 화면 · 2단계 인증 창
{
  const { ctx, page, errs } = await open();
  await page.evaluate(() => SVC.ST.RAWX.targets = [{ year: 2026, amount: 2000000000 }]); await page.evaluate(() => { SVC.renderAll(); SVC.switchView('dash'); }); await page.waitForTimeout(400);
  await S.t('㊿+166 지니언스 기본: data-skin=gn + data-look=cc(커맨드 센터 기능 그대로) · ㊿+167 상단 메뉴 = 정식 로고 + 묶음 버튼(상단바 첫 줄) · 화면 디자인 목록 맨 앞', async () => {
    const r = await page.evaluate(() => { const rail = document.getElementById('rail'), tb = document.querySelector('#app .topbar');
      return { skin: document.documentElement.getAttribute('data-skin'), look: document.documentElement.getAttribute('data-look'), cc: SVC.isCC(), gn: SVC.isGN(), cur: SVC.curLook(), keys: Object.keys(SVC.LOOKS).join(','),
        inTop: rail.parentElement === tb && tb.firstElementChild === rail, logo: !!rail.querySelector('.gn-logo use[href="#gnLogo"]') && !!document.getElementById('gnLogo'),
        tabs: [...rail.querySelectorAll('.gn-tabs .gn-tb')].map((b) => b.dataset.v || b.dataset.seg).join('|'), right: [...rail.querySelectorAll('.gn-right .gn-tb')].map((b) => b.dataset.seg).join('|'),
        left: Math.round(rail.getBoundingClientRect().left), w: Math.round(rail.getBoundingClientRect().width), W: document.documentElement.clientWidth, pad: getComputedStyle(document.body).paddingLeft,
        home: (rail.querySelector('.gn-tb[aria-current="true"]') || {}).dataset.v, ttl: document.getElementById('gnTitle').textContent }; });
    assert(r.skin === 'gn' && r.look === 'cc' && r.cc && r.gn && r.cur === 'gn' && /^gn,cc,simple,classic$/.test(r.keys), JSON.stringify(r));
    assert(r.inTop && r.logo && /^dash\|weekly\|g:전체 데이터\|g:사업 영역\|g:장비\|m:영업\|m:정산·도구$/.test(r.tabs) && r.right === 'm:관리' && r.left === 0 && r.w === r.W && r.pad === '0px' && r.home === 'dash' && r.ttl === '홈', JSON.stringify(r));
    return r.tabs.split('|').length + '개 묶음 + 관리';
  });
  await S.t('㊿+167 상단 메뉴: 묶음 누르면 펼침(소제목·그룹마다 칸) · 항목 누르면 이동·닫힘 · 지금 화면 묶음 표시 · 다른 묶음에 마우스 → 옮겨 감 · Esc·바깥 클릭 닫힘 · ↓ 첫 항목 · 배지 합계', async () => {
    const seg = (k) => '#rail .gn-tb[data-seg="' + k + '"]';
    await page.click(seg('g:사업 영역')); await page.waitForTimeout(150);
    const a = await page.evaluate(() => { const m = document.getElementById('gnMenu'); return { open: !m.hidden, exp: document.querySelector('#rail .gn-tb[data-seg="g:사업 영역"]').getAttribute('aria-expanded'), cols: [...m.querySelectorAll('.gn-st')].map((x) => x.textContent).join('|'), n: m.querySelectorAll('.gn-mi').length, inView: m.getBoundingClientRect().right <= document.documentElement.clientWidth }; });
    assert(a.open && a.exp === 'true' && /Cloud NAC/.test(a.cols) && /MDR/.test(a.cols) && a.n >= 3 && a.inView, '사업 영역 ' + JSON.stringify(a));
    await page.hover(seg('m:영업')); await page.waitForTimeout(120);
    const b = await page.evaluate(() => ({ cols: [...document.querySelectorAll('#gnMenu .gn-st')].map((x) => x.textContent).join('|'), e1: document.querySelector('#rail .gn-tb[data-seg="g:사업 영역"]').getAttribute('aria-expanded') }));
    assert(/PoC·데모/.test(b.cols) && /영업/.test(b.cols) && /인바운드/.test(b.cols) && b.e1 === 'false', '영업 묶음 ' + JSON.stringify(b));
    await page.click('#gnMenu .gn-mi[data-v="oi"]'); await page.waitForTimeout(300);
    const c = await page.evaluate(() => ({ v: SVC.ST.CUR_VIEW, open: !document.getElementById('gnMenu').hidden, cur: (document.querySelector('#rail .gn-tb[aria-current="true"]') || {}).dataset.seg, ttl: document.getElementById('gnTitle').textContent }));
    assert(c.v === 'oi' && !c.open && c.cur === 'm:영업' && c.ttl === 'OI 현황', '이동 ' + JSON.stringify(c));
    await page.click(seg('g:전체 데이터')); await page.waitForTimeout(100); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    const d1 = await page.evaluate(() => document.getElementById('gnMenu').hidden);
    await page.click(seg('g:전체 데이터')); await page.waitForTimeout(100); await page.mouse.click(700, 600); await page.waitForTimeout(100);
    const d2 = await page.evaluate(() => document.getElementById('gnMenu').hidden);
    await page.focus(seg('g:장비')); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100);
    const d3 = await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('gn-mi') && document.activeElement === document.querySelector('#gnMenu .gn-mi'));
    await page.keyboard.press('Escape');
    const bd = await page.evaluate(() => { const g = (s) => { const b = document.querySelector(s + ' .gn-bd'); return b && !b.hidden ? +b.textContent : 0; };
      return { eq: g('#rail .gn-tb[data-eq]'), pend: (SVC.ST.RAWX.orders || []).filter((o) => ['접수', '출하요청', '배송중'].indexOf(o.status) >= 0).length, home: g('#rail .gn-tb[data-v="dash"]'), lane1: document.querySelectorAll('#ccInbox .ib-lane.crit .ib-row').length }; });
    assert(d1 && d2 && d3 && bd.eq === bd.pend && bd.home === bd.lane1, JSON.stringify({ d1, d2, d3, bd }));
    assert(!errs.length, errs.join(' | ')); return 'OI 로 이동 · 배지 장비 ' + bd.eq + ' · 홈 ' + bd.home;
  });
  await S.t('㊿+167 홈: 오늘 처리할 일(전체 폭 · 즉시 처리/확인 필요/예정 3칸) → 사업 현황 제목 → MRR 카드(옅은 연두) 옆 타일 4 → AI 분석 → 지표 3 · 목표 ARR 타원 트랙 · 검색 바와 AI 칸 역할 문구', async () => {
    await page.evaluate(() => SVC.switchView('dash')); await page.waitForTimeout(300);
    const r = await page.evaluate(() => { const R = (s) => document.querySelector(s).getBoundingClientRect(); const ib = R('#ccInbox'), bh = R('#gnBizH'), h = R('#ccHeroHost .kpi'), k = R('#kpis'), a = R('#viewDash .ask'), m = R('#ccMoreTiles');
      const lanes = [...document.querySelectorAll('#ccInbox .ib-lane')].map((l) => l.querySelector('.ib-lh b').textContent + ':' + l.querySelectorAll('.ib-row').length).join('|');
      const t = document.querySelector('#ccHeroHost #goalBar .gn-trk .t1'); const bg = getComputedStyle(document.querySelector('#ccHeroHost .kpi')).backgroundImage;
      return { lanes, rows: document.querySelectorAll('#ccInbox .ib-row').length, cnt: +document.querySelector('#ccInbox .ib-head .ctag').dataset.n, full: ib.width > 1300, order: ib.bottom < bh.top && bh.bottom < h.top, side: Math.abs(h.top - k.top) < 2 && h.right < k.left, ask: a.top > Math.max(h.bottom, k.bottom) && a.bottom < m.top,
        light: (() => { const m = getComputedStyle(document.querySelector('#ccHeroHost .kpi')).backgroundColor.match(/\d+/g).map(Number); return !/gradient/.test(bg) && m[0] > 200 && m[1] > 200 && m[2] > 200; })(),   /* ㊿+169 그라데이션 없이 옅은 단색 */ dash: t && t.getAttribute('stroke-dasharray'), txt: (document.querySelector('#goalBar .gn-gtx') || {}).textContent || '', ph: document.querySelector('#cmdBar .ph').textContent, q: document.getElementById('q').placeholder, h2: document.querySelector('#ccInbox .ib-head h2').textContent }; });
    assert(/^즉시 처리:\d+\|확인 필요:\d+\|예정:\d+$/.test(r.lanes) && r.rows === r.cnt && r.full && r.order && r.side && r.ask && r.light && /오늘 처리할 일/.test(r.h2), JSON.stringify(r));
    assert(/^\d+(\.\d)? 100$/.test(r.dash || '') && /목표 ARR/.test(r.txt) && /현재 ARR/.test(r.txt) && /필요 12월 MRR/.test(r.txt) && /^화면 이동/.test(r.ph) && /^AI 분석/.test(r.q), JSON.stringify(r));
    return r.lanes;
  });
  await S.t('㊿+166 «커맨드 센터»로 바꾸면 예전 아이콘 레일(제자리 · 왼쪽) · 지니언스 표시 없음 · 인박스는 한 줄 목록 · 다시 기본으로', async () => {
    await page.evaluate(() => { localStorage.setItem('svc_look', 'cc'); SVC.applyLook(); SVC.buildRail(); SVC.renderInbox(); });
    const a = await page.evaluate(() => ({ skin: document.documentElement.getAttribute('data-skin'), look: document.documentElement.getAttribute('data-look'), rlogo: !!document.querySelector('#rail .rlogo'), gn: !!document.querySelector('#rail .gn-bar'), body: document.getElementById('rail').parentElement === document.body, seg: document.querySelectorAll('#rail [data-seg]').length, ttl: getComputedStyle(document.querySelector('.gn-ttl')).display, lanes: document.querySelectorAll('#ccInbox .ib-lanes').length, h2: document.querySelector('#ccInbox .ib-head h2').textContent }));
    await page.evaluate(() => { localStorage.removeItem('svc_look'); SVC.applyLook(); SVC.buildRail(); SVC.renderInbox(); });
    const b = await page.evaluate(() => ({ skin: document.documentElement.getAttribute('data-skin'), gn: !!document.querySelector('#rail .gn-bar'), inTop: document.getElementById('rail').parentElement === document.querySelector('#app .topbar'), lanes: document.querySelectorAll('#ccInbox .ib-lanes').length }));
    assert(a.skin === null && a.look === 'cc' && a.rlogo && !a.gn && a.body && a.seg > 3 && a.ttl === 'none' && a.lanes === 0 && /^인박스/.test(a.h2) && b.skin === 'gn' && b.gn && b.inTop && b.lanes === 1, JSON.stringify({ a, b }));
    assert(!errs.length, errs.join(' | ')); return 'cc ↔ gn';
  });
  await S.t('㊿+167 2단계 인증 창: 6칸 숫자 상자(진짜 입력칸 #mfaCode 하나) · 30초 링 · 입력하면 칸에 숫자 · 틀리면 흔들림 · 등록 창은 QR + 3단계 + 키 복사', async () => {
    await page.evaluate(() => { SVC.mfaPrompt({ id: 'f1' }, 'tok', 'tester@example.com'); }); await page.waitForTimeout(300);
    await page.type('#mfaCode', '12'); await page.waitForTimeout(100);
    const a = await page.evaluate(() => ({ cells: document.querySelectorAll('#ovlMfa .otp-cells span').length, txt: [...document.querySelectorAll('#ovlMfa .otp-cells span')].map((s) => s.textContent).join(''), ring: !!document.querySelector('#ovlMfa .mfa-ring .r1[stroke-dasharray]'), sec: document.querySelector('#ovlMfa .mfa-sec').textContent, inputs: document.querySelectorAll('#ovlMfa input').length }));
    await page.evaluate(() => { const i = document.getElementById('mfaCode'); i.value = '12'; }); await page.click('#mfaGo'); await page.waitForTimeout(100);
    const bad = await page.evaluate(() => document.querySelector('#ovlMfa .otp').classList.contains('bad') && /6자리/.test(document.getElementById('mfaMsg').textContent));
    await page.click('#mfaCancel'); await page.waitForTimeout(100);
    assert(a.cells === 6 && a.txt === '12' && a.ring && /\d+초/.test(a.sec) && a.inputs === 1 && bad && !(await page.$('#ovlMfa')), JSON.stringify({ a, bad }));
    return a.sec;
  });
  await ctx.close();
  await S.t('㊿+166 로그인 화면: 정식 로고 · 같은 칸(lsEmail·lsPw·lsKeep 스위치·lsGo) · 날짜·버전 · 폰은 위아래(가로 넘침 없음) · 로그인 동작 그대로', async () => {
    const out = [];
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const ctx2 = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' }); const p2 = await ctx2.newPage(); const c2 = collect(p2);
      const tokx = async (route, u) => { if (!/\/auth\/v1\/token/.test(u)) return false; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'tok', refresh_token: 'r', expires_in: 3600, user: { id: 'u1', email: 'tester@example.com', user_metadata: { pw_changed: true }, factors: [] } }) }); return true; };
      await mockBackend(p2, { noSession: true, extra: tokx }); await p2.goto(url + '/index.html'); await p2.waitForSelector('#viewLogin:not(.hidden)', { timeout: 10000 });
      const r = await p2.evaluate(() => ({ logo: !!document.querySelector('#viewLogin use[href="#gnLogo"]'), ids: ['lsEmail', 'lsPw', 'lsKeep', 'lsGo', 'lsForce', 'lsNpw1', 'lsNpw2', 'lsPwGo', 'lsMsg'].every((id) => document.getElementById(id)),
        sw: document.getElementById('lsKeep').getAttribute('role'), date: document.getElementById('lgDate').textContent, ver: document.getElementById('lgVer').textContent, stage: getComputedStyle(document.querySelector('.lg-orbit')).display, sx: document.documentElement.scrollWidth, W: document.documentElement.clientWidth, form: document.getElementById('lsEmail').form && document.getElementById('lsEmail').form.id }));
      assert(r.logo && r.ids && r.sw === 'switch' && /\d+월 \d+일/.test(r.date) && /㊿\+\d+/.test(r.ver) && r.sx <= r.W && r.form === 'lsLogin' && (w > 800 ? r.stage !== 'none' : r.stage === 'none'), w + ' ' + JSON.stringify(r));
      if (w > 800) { await p2.fill('#lsEmail', 'tester@example.com'); await p2.fill('#lsPw', 'pw'); await p2.click('#lsGo'); await p2.waitForFunction(() => document.getElementById('viewLogin').classList.contains('hidden'), null, { timeout: 10000 }); }
      assert(!c2.errs.length, c2.errs.join(' | ')); out.push(w + ' ok'); await ctx2.close();
    }
    return out.join(' · ');
  });
}
// ㊿+168 1차: 집계 기준(만료 = 공통 집계) · 사업 영역 기준월 보기 · 고객 360 후속 계약/OI/장비 구분 · 정산 미입력·0원 · 화면별 단위
//   오늘 날짜 기준 상대 월로 만든 검증 사례(가상 «검증_» 고객)를 픽스처에 덧붙여 가짜 DB 로 읽음 — 운영 데이터와 무관
{
  const { FIX } = await import('./lib.mjs');
  const now = new Date(), T0 = now.getFullYear() * 12 + now.getMonth();
  const ym = (o) => { const x = T0 + o; return Math.floor(x / 12) + '-' + String(x % 12 + 1).padStart(2, '0'); };
  const F = JSON.parse(JSON.stringify(FIX)), base = F.contracts[0];
  const C = (id, cid, line, ch, ctype, st, s, e, mrr, parent) => Object.assign({}, base, { id, customer_id: cid, line, channel: ch, contract_type: ctype, status: st, start_month: ym(s) + '-01', end_month: ym(e) + '-01', mrr, qty: 100, parent_contract_id: parent || null, partner: '직접', biller: '직접', sale_type: ctype === '신규' ? '신규' : ctype, total_amount: mrr * 12 });
  [[901, '검증_재약정'], [902, '검증_부속'], [903, '검증_종료추가'], [904, '검증_후보'], [905, '검증_OI'], [906, '검증_장비']].forEach(([id, name]) => F.customers.push({ id, name, industry: '공공', aliases: [] }));
  const cs = [C(9011, 901, 'Cloud', '조달', '재약정', '재약정', -33, 2, 300000), C(9012, 901, 'Cloud', '조달', '재약정', '재약정', 3, 38, 320000),
    C(9021, 902, 'Cloud', '일반', '신규', '활성', -23, 1, 200000), C(9022, 902, 'Cloud', '일반', '추가', '추가', -16, 1, 50000, 9021),
    C(9031, 903, 'Cloud', '조달', '신규', '활성', -21, 14, 150000), C(9032, 903, 'Cloud', '조달', '추가', '추가', -9, -4, 30000, 9031),
    C(9041, 904, 'MDR', '일반', '신규', '활성', -24, 1, 100000), C(9042, 904, 'Cloud', '일반', '신규', '활성', 5, 16, 120000),
    C(9051, 905, 'Cloud', '일반', '신규', '활성', -21, 2, 90000), C(9061, 906, 'Cloud', '일반', '신규', '활성', -33, 1, 110000)];
  F.contracts.push(...cs); cs.forEach((c) => F.mrsegs.push([c.id, c.start_month, c.end_month, c.mrr]));
  F.oi.push({ id: 905, customer: '검증_OI', stage: '제안', prob: 50, amount: 90000000, line: 'Cloud', owner: '담당자B', created_at: ym(-1) + '-01', expected_month: ym(2) + '-01', deal_name: '검증_OI 재계약' });
  const O = (id, model, qty, serials, status, ret) => ({ id, channel: '일반', order_type: '신규발주', customer: '검증_장비', model, qty, serials, status, install_date: ym(-30) + '-10', created_at: ym(-30) + '-02T00:00:00', returned_date: null, returned_serials: ret, request_note: '' });
  F.orders.push(O(9601, 'S100', 3, 'VF0000001, VF0000002, VF0000003', '설치완료', 'VF0000001'), O(9602, 'S200', 2, 'VF0000004, VF0000005', '회수예정', 'VF0000004'), O(9603, 'S100', 1, '', '접수', null));
  const A = (id, sn, st, oid) => ({ id, serial: sn, model: 'S100', usage: '임대', status: st, customer: '검증_장비', channel: '일반', order_id: oid, deployed_date: ym(-30) + '-10', returned_date: null, note: null });
  F.assets.push(A(9701, 'VF0000001', '회수완료', 9601), A(9702, 'VF0000002', '임대중', 9601), A(9703, 'VF0000003', '임대중', 9601), A(9704, 'VF0000004', '회수완료', 9602), A(9705, 'VF0000005', '임대중', 9602), A(9706, '미등록-9603-1', '재고', 9603));
  const PY = now.getFullYear() - 1, Bz = (m, item, v) => ({ ym: m + '월', kind: 'sum', item, biz: v, sheet: null, diff: null, note: null, as_of: PY + '-' + String(m + 1).padStart(2, '0') + '-05' });
  F.biz = [Bz(7, '비즈포탈 회계매출', 70000000), Bz(7, '매출시트 매출', 72000000), Bz(8, '비즈포탈 회계매출', 78000000), Bz(8, '매출시트 매출', 0)];
  F.mtargets = (F.mtargets || []).concat(Array.from({ length: 12 }, (_, i) => ({ year: PY, month: i + 1, amount: 80000000 })));
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' }); const page = await ctx.newPage(); const c = collect(page);
  await mockBackend(page, { extra: async (route, u) => { if (u.includes('/rpc/load_all')) { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Object.assign({}, F, { roles: [{ role: 'super_admin' }] })) }); return true; } return false; } });
  await page.goto(url + '/index.html'); await page.waitForFunction(() => window.SVC && SVC.ST && SVC.ST.DATA, null, { timeout: 15000 }); await page.waitForTimeout(600);
  await S.t('㊿+168 만료 집계: 사업 현황 타일 = 오늘 처리할 일 = 만료 예정 위젯 = 타일 목록(건수·금액·고객사) · 부속 계약 제외(비고 «함께 만료») · 후속 계약 비고', async () => {
    const r = await page.evaluate(() => { const S = SVC, list = S.idxs(), xs = S.expScan(list); const tile = [...document.querySelectorAll('#kpis .kpi')].find((k) => /개월 내 만료/.test(k.textContent));
      const ib = [...document.querySelectorAll('#ccInbox .ib-row')].find((x) => /만료 원계약/.test(x.textContent)); S.renderExpiring(list); const cap = document.getElementById('capExp').textContent;
      S.kpiOpen('exp'); const rows = [...document.querySelectorAll('#crList tbody tr')], title = document.getElementById('crTitle').textContent, notes = rows.map((tr) => tr.children[7].textContent).join('|'); S.closeOvl('ovlCr');
      const kids = xs.rows.filter((k) => S.ST.DATA.rows[k].parent).length;
      return { n: xs.rows.length, amt: S.won(xs.amt), cust: xs.custN, tile: tile.querySelector('.v').textContent + ' ' + tile.querySelector('.d').textContent, ib: ib ? ib.textContent : '', cap, rows: rows.length, title, notes, kids }; });
    const has = (s) => s.includes(r.n + '건') && s.includes(r.amt);
    assert(r.kids === 0 && has(r.tile) && has(r.ib) && has(r.cap) && r.rows === r.n && has(r.title) && r.ib.includes('고객사 ' + r.cust + '곳') && r.title.includes('고객사 ' + r.cust + '곳'), JSON.stringify(r));
    assert(/부속 1건 함께 만료/.test(r.notes) && /재약정 등록됨/.test(r.notes) && /후속 계약 확인 필요/.test(r.notes), '비고 ' + r.notes);
    return r.n + '건 · ' + r.amt + '천원 · ' + r.cust + '곳';
  });
  await S.t('㊿+168 사업 영역(조달): 기본 «현재 유효» — 기준월 유효 계약의 고객 합계(=당월 MRR) · 현행 기간 · 갱신 상태(재약정 등록됨) · 종료된 추가 계약이 대표로 안 나옴 · «시작 예정» · «전체 이력» 기준월 상태', async () => {
    await page.evaluate(() => { localStorage.removeItem('svc_chv_mode'); SVC.switchView('cnpub'); }); await page.waitForTimeout(500);
    const r = await page.evaluate(() => { const rows = () => [...document.querySelectorAll('#chvCt tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent.trim()));
      const mode = document.querySelector('#chvMode [aria-pressed="true"]').dataset.m, cur = rows(); const tile = SVC.won(SVC.monthlyTotal(SVC.CHV.all.map((x) => SVC.ST.DATA.rows.indexOf(x)), SVC.STATE.base));
      const sum = SVC.chvCurRows(SVC.CHV.all, SVC.STATE.base).reduce((a, x) => a + (x._sum || 0), 0);
      document.querySelector('#chvMode button[data-m="next"]').click(); const nx = rows(); document.querySelector('#chvMode button[data-m="all"]').click(); const al = rows(); document.querySelector('#chvMode button[data-m="cur"]').click();
      return { mode, re: cur.find((x) => /^검증_재약정/.test(x[0])), ad: cur.find((x) => /^검증_종료추가/.test(x[0])), tile, sum: SVC.won(sum), nx: nx.filter((x) => /^검증_/.test(x[0])), al: al.filter((x) => /^검증_종료추가/.test(x[0])).map((x) => x[1]) }; });
    assert(r.mode === 'cur' && r.re && /재약정 등록됨/.test(r.re[5]) && r.re[6] === '300' && r.ad && r.ad[6] === '150' && /~/.test(r.ad[4]) && r.tile === r.sum, JSON.stringify(r));
    assert(r.nx.length === 1 && /^검증_재약정/.test(r.nx[0][0]) && r.al.some((x) => /추가 계약 · 종료/.test(x)) && r.al.includes('유효'), JSON.stringify(r));
    return '고객 합계 ' + r.sum + ' = 당월 MRR ' + r.tile;
  });
  await S.t('㊿+168 고객 360: 재약정 등록 → «후속 계약 보기»(재계약 OI 제안 없음) · 서비스가 다른 후보 → «후속 계약 확인 필요» · 진행 중 OI → 그 OI 로 · 장비 = 임대중/회수 예정/회수 완료/신청 · 기본 탭 요약', async () => {
    const one = (nm) => page.evaluate((nm) => { SVC.openCust360(nm); const n = document.querySelector('#c360Body .c360-next'); const o = { tips: n.textContent, acts: [...n.querySelectorAll('.cbtn')].map((x) => x.textContent).join('|'), eq: [...document.querySelectorAll('#c360Body .c360-eq4 b')].map((x) => x.textContent).join('/'), tab: document.querySelector('#c360Body [role="tab"][aria-selected="true"]').textContent, secHidden: [...document.querySelectorAll('#c360Body .c360-sec')].every((s) => s.style.display === 'none') }; SVC.closeOvl('ovlC360'); return o; }, nm);
    const a = await one('검증_재약정'), b = await one('검증_후보'), o = await one('검증_OI'), e = await one('검증_장비');
    assert(/재약정 등록됨/.test(a.tips) && /후속 계약 보기/.test(a.acts) && !/재계약 OI/.test(a.acts) && a.tab === '요약' && a.secHidden, '재약정 ' + JSON.stringify(a));
    assert(/후속 계약 확인 필요/.test(b.tips) && /후보 계약 보기/.test(b.acts), '후보 ' + JSON.stringify(b));
    assert(/진행 중 OI/.test(o.tips) && /진행 중 OI 보기/.test(o.acts) && !/재계약 OI 만들기/.test(o.acts), 'OI ' + JSON.stringify(o));
    assert(e.eq === '3/1/2/3' && /재약정하면 그대로/.test(e.tips) && /미등록/.test(e.tips) && /부분 회수/.test(e.tips), '장비 ' + JSON.stringify(e));
    return '장비 ' + e.eq;
  });
  await S.t('㊿+168 정산 달성률: 미입력 달은 0 이 아님 · 분기 «잠정 · 3개월 중 2개월 입력» + 입력 월 기준 달성률 + 기간 목표 대비 · 입력 없는 분기 «미집계» · 입력된 0 은 0', async () => {
    await page.evaluate(() => SVC.switchView('biz')); await page.waitForTimeout(400);
    const r = await page.evaluate(() => [...document.querySelectorAll('.biz-tg tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent.trim())));
    const q3 = r.find((x) => x[0] === '3분기'), q4 = r.find((x) => x[0] === '4분기'), m8 = r.find((x) => x[0] === '8월'), m9 = r.find((x) => x[0] === '9월');
    assert(q3 && /잠정 · 3개월 중 2개월 입력/.test(q3[1]) && /^92\.5%/.test(q3[4]) && /기간 목표 대비 61\.7%/.test(q3[4]) && q4 && q4[1] === '미집계' && q4[4] === '미집계' && m8 && m8[5] === '0' && m8[6] === '0.0%' && m9 && m9[1] === '미입력' && m9[3] === '—', JSON.stringify({ q3, q4, m8, m9 }));
    return q3[4];
  });
  await S.t('㊿+168 단위: 상단 단위 안내가 화면마다(홈 천원 · 가격표 원·VAT별도 · 장비 신청 내역 숨김 · 주간회의 백만원 안내) · 누르면 용어 설명(MRR·당월 인식·ARR·회계매출·곳/건/대)', async () => {
    const u = {}; for (const v of ['dash', 'price', 'orders', 'weekly']) { await page.evaluate((v) => SVC.switchView(v), v); await page.waitForTimeout(200); u[v] = await page.evaluate(() => { const b = document.getElementById('unitBadge'); return b.hidden ? '숨김' : b.textContent; }); }
    await page.evaluate(() => SVC.switchView('dash')); await page.click('#unitBadge'); await page.waitForTimeout(100);
    const terms = await page.evaluate(() => [...document.querySelectorAll('#ovlTerms dt')].map((x) => x.textContent).join('|')); await page.keyboard.press('Escape');
    assert(/천원/.test(u.dash) && /원 단위/.test(u.price) && /VAT/.test(u.price) && u.orders === '숨김' && /백만원/.test(u.weekly) && /계약 MRR/.test(terms) && /당월 인식/.test(terms) && /ARR/.test(terms) && /회계매출/.test(terms) && /곳 · 건 · 대/.test(terms), JSON.stringify({ u, terms }));
    assert(!c.errs.length, c.errs.join(' | ')); return JSON.stringify(u);
  });
  await ctx.close();
}
// ㊿+169 2차: 계약·OI 표 기본 보기(업무 보기 · 고정 열 · 상태 배지 · 미입력/해당 없음 · 아이콘 버튼 이름 · 삭제는 더보기) · 목록 상태 유지 · 홈 밀도 · 장비 상태·수량·조작 · 공통 디자인
//   가짜 DB(FIX + 가상 «검증_» 행) — 운영 데이터와 무관 · 쓰기는 가짜 응답
{
  const { FIX } = await import('./lib.mjs');
  const now = new Date(), d10 = new Date(now.getTime() - 10 * 864e5).toISOString().slice(0, 10);
  const F = JSON.parse(JSON.stringify(FIX));
  F.oi.push({ id: 9901, customer: '검증_OI2', stage: '진행', prob: 50, win_prob: 50, owner: '담당A', deal_name: '검증 갱신', expect_amount: 50000000, next_date: d10, next_action: '제안서 회신', created_at: d10 });
  F.orders[0].mgr_name = '장비담당';
  F.orders.push({ id: 9700, channel: '일반', order_type: '신규발주', customer: '검증_미등록', model: 'S100', qty: 1, serials: '', status: '접수', created_at: d10 + 'T00:00:00', install_date: null, returned_date: null, returned_serials: null, request_note: '' });
  F.assets.push({ id: 9800, serial: '미등록-9700-1', model: 'S100', usage: '임대', status: '재고', customer: '검증_미등록', channel: '일반', order_id: 9700, deployed_date: null, returned_date: null, note: '⚠ 시리얼 미입력' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' }); const page = await ctx.newPage(); const c = collect(page);
  const writes = [];
  await mockBackend(page, { onWrite: (w) => writes.push(w.m + ' ' + w.url), extra: async (route, u) => { if (u.includes('/rpc/load_all')) { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Object.assign({}, F, { roles: [{ role: 'super_admin' }] })) }); return true; } return false; } });
  await page.goto(url + '/index.html'); await page.waitForFunction(() => window.SVC && SVC.ST && SVC.ST.DATA, null, { timeout: 15000 }); await page.waitForTimeout(600);
  await S.t('㊿+169 계약 표: 기본 «운영» 보기(고객사·상태 맨 앞 고정) · 갱신/정산/전체 · 고른 보기·보기별 열 설정 기억 · 상태 = 글자+배지 · «—» 미입력 / 빈칸 해당 없음 · 아이콘 버튼 이름 · 삭제는 «더보기»', async () => {
    await page.evaluate(() => SVC.navMenu('contracts')); await page.waitForTimeout(300);
    const hs = () => page.evaluate(() => [...document.querySelectorAll('#dvTable thead th')].map((h) => h.textContent.replace(/[▼▲]/g, '').trim()).filter(Boolean));
    const a = await page.evaluate(() => { const t = document.getElementById('dvTable'), p1 = t.querySelector('tbody td.pin1'), p2 = t.querySelector('tbody td.pin2');
      return { wv: [...document.querySelectorAll('#dvWvBar [data-wv]')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join('|'), sticky: p1 && getComputedStyle(p1).position, p2l: p2 && p2.getBoundingClientRect().left - p1.getBoundingClientRect().right,
        badge: !!t.querySelector('tbody td.pin2 .ctag'), nil: !!t.querySelector('td.nil[title="미입력"]'), na: !!t.querySelector('td.na[title="해당 없음"]'),
        acts: [...t.querySelectorAll('tbody tr:first-child td.act button')].map((b) => b.dataset.act + ':' + (b.getAttribute('aria-label') ? 'L' : '-') + ':' + b.textContent.trim()).join('|') }; });
    const h1 = await hs();
    assert(a.wv === '운영*|갱신|정산|전체' && h1.length === 10 && h1[0] === '고객사' && h1[1] === '상태' && a.sticky === 'sticky' && Math.abs(a.p2l) < 2 && a.badge && a.nil && a.na, JSON.stringify({ a, h1 }));
    assert(a.acts === 'view:L:|edit:L:|more:L:', '버튼 ' + a.acts);
    await page.click('#dvTable tbody tr:first-child button[data-act="more"]'); await page.waitForTimeout(100);
    const m = await page.evaluate(() => ({ items: [...document.querySelectorAll('#rowMenu [role="menuitem"]')].map((b) => b.textContent.trim()).join('|'), foc: document.activeElement && document.activeElement.closest('#rowMenu') ? 1 : 0 }));
    await page.keyboard.press('Escape'); await page.waitForTimeout(80);
    const m2 = await page.evaluate(() => ({ gone: !document.getElementById('rowMenu'), back: document.activeElement && document.activeElement.dataset.act }));
    assert(m.items === '삭제…' && m.foc && m2.gone && m2.back === 'more', JSON.stringify({ m, m2 }));
    await page.click('#dvWvBar [data-wv="갱신"]'); await page.waitForTimeout(150); const h2 = await hs();
    await page.click('#dvWvBar [data-wv="정산"]'); await page.waitForTimeout(150);
    await page.click('#dvCols'); await page.waitForTimeout(100); await page.click('#colPick label:has-text("과금방식") input'); await page.waitForTimeout(150); await page.mouse.click(5, 300); const h3 = await hs();
    await page.click('#dvWvBar [data-wv="운영"]'); await page.waitForTimeout(100); const h4 = await hs();
    await page.click('#dvWvBar [data-wv="정산"]'); await page.waitForTimeout(100); const h5 = await hs();
    await page.click('#dvWvBar [data-wv="전체"]'); await page.waitForTimeout(150); const h6 = await hs();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem(SVC.wvKey()) || '{}').contracts);
    assert(h2.includes('자동연장') && h2.includes('해지사유') && !h2.includes('계산서발행처') && !h3.includes('과금방식') && h3.includes('계산서발행처') && h4.length === 10 && !h5.includes('과금방식') && h6.length === 27 && saved === '전체', JSON.stringify({ h2, h3, h5: h5.length, h6: h6.length, saved }));
    return '운영 10열 · 전체 27열';
  });
  await S.t('㊿+169 목록 상태 유지: 검색·정렬·스크롤 → 다른 화면 → «뒤로» 오면 그대로 · 메뉴로 다시 들어오면 처음부터', async () => {
    await page.setViewportSize({ width: 1440, height: 600 });
    await page.evaluate(() => { SVC.wvSet('contracts', '운영'); SVC.navMenu('contracts'); }); await page.waitForTimeout(250);
    await page.fill('#dvSearch', '가상'); await page.waitForTimeout(150);
    await page.click('#dvTable thead th[data-k="mrr"] .thw > span'); await page.waitForTimeout(150);
    await page.evaluate(() => window.scrollTo(0, 400)); await page.waitForTimeout(100);
    const before = await page.evaluate(() => ({ q: document.getElementById('dvSearch').value, k: SVC.DV.sortK, y: Math.round(window.scrollY), first: document.querySelector('#dvTable tbody tr td').textContent }));
    await page.evaluate(() => SVC.switchView('oi')); await page.waitForTimeout(250);
    await page.goBack(); await page.waitForTimeout(500);
    const back = await page.evaluate(() => ({ v: SVC.ST.CUR_VIEW, q: document.getElementById('dvSearch').value, k: SVC.DV.sortK, y: Math.round(window.scrollY), first: document.querySelector('#dvTable tbody tr td').textContent }));
    await page.evaluate(() => { SVC.navMenu('oi'); SVC.navMenu('contracts'); }); await page.waitForTimeout(200);
    const fresh = await page.evaluate(() => ({ q: document.getElementById('dvSearch').value, k: SVC.DV.sortK }));
    await page.setViewportSize({ width: 1440, height: 1000 });
    assert(before.q === '가상' && before.k === 'mrr' && back.v === 'contracts' && back.q === '가상' && back.k === 'mrr' && Math.abs(back.y - before.y) < 30 && back.first === before.first && fresh.q === '' && fresh.k === null, JSON.stringify({ before, back, fresh }));
    return '뒤로 = 그대로 · 메뉴 = 처음';
  });
  await S.t('㊿+169 홈: 맨 위 요약(매출·고객·만료 위험·처리 필요) · «주의 항목 n종 · 대상 n건» · 할 일마다 대상/담당/기한/영향 · 구체적인 버튼 · 칸마다 2개 + 더 보기 · 알림 → 걸러진 목록(같은 건수)', async () => {
    await page.evaluate(() => SVC.navMenu('dash')); await page.waitForTimeout(400);
    const r = await page.evaluate(() => { const cells = [...document.querySelectorAll('#gnSum .gs-c')].map((c) => c.dataset.k + ':' + c.querySelector('.gs-v b').textContent);
      const xs = SVC.expScan(SVC.idxs()); const head = document.querySelector('#ccInbox .ib-head .ctag').textContent; const rows = [...document.querySelectorAll('#ccInbox .ib-row')];
      const meta = rows.every((x) => [...x.querySelectorAll('.ib-meta dt')].map((d) => d.textContent).join('') === '대상담당기한영향');
      const btns = [...document.querySelectorAll('#ccInbox .cbtn.pri')].map((b) => b.textContent);
      const top = document.getElementById('gnSum').getBoundingClientRect().bottom <= document.getElementById('ccInbox').getBoundingClientRect().top;
      return { cells, xsN: xs.rows.length, head, n: rows.length, meta, btns, top }; });
    const m = /주의 항목 (\d+)종 · 대상 (\d+)건/.exec(r.head);
    assert(r.cells.length === 4 && r.cells[2] === 'exp:' + r.xsN && m && +m[1] === r.n && r.meta && r.top && !r.btns.some((b) => /처리하기|대시보드 →|OI 현황 →|^재계약 타진$/.test(b)) && r.btns.some((b) => /일정 지난 OI \d+건 보기/.test(b)), JSON.stringify(r));
    const oiN = await page.evaluate(() => { const t = new Date().toISOString().slice(0, 10); return SVC.ST.RAWX.oi.filter((o) => o.next_date && String(o.next_date).slice(0, 10) < t && !/수주|실패/.test(String(o.stage || ''))).length; });
    const lane = await page.evaluate(() => { const b = [...document.querySelectorAll('#ccInbox .cbtn.pri')].find((x) => /일정 지난 OI/.test(x.textContent)); const row = b.closest('.ib-row'), ln = row.closest('.ib-lane');
      return { hid: row.hidden, more: !!ln.querySelector('.ib-more'), shown: [...ln.querySelectorAll('.ib-row')].filter((x) => !x.hidden).length, lv: ln.querySelector('.ib-more') && ln.querySelector('.ib-more').dataset.lv }; });
    if (lane.hid) { await page.click('#ccInbox .ib-more[data-lv="' + lane.lv + '"]'); await page.waitForTimeout(150); }
    const opened = await page.evaluate(() => { const b = [...document.querySelectorAll('#ccInbox .cbtn.pri')].find((x) => /일정 지난 OI/.test(x.textContent)); return !b.closest('.ib-row').hidden; });
    assert(!lane.hid || (lane.more && lane.shown === 2 && opened), '칸 접기 ' + JSON.stringify({ lane, opened }));
    await page.click('#ccInbox .cbtn.pri:has-text("일정 지난 OI")'); await page.waitForTimeout(400);
    const g = await page.evaluate(() => ({ v: SVC.ST.CUR_VIEW, pre: document.getElementById('dvPreBar').textContent, rows: document.querySelectorAll('#dvTable tbody tr:not(.dg-empty)').length }));
    await page.click('#dvPreX'); await page.waitForTimeout(150); const all = await page.evaluate(() => document.querySelectorAll('#dvTable tbody tr').length);
    assert(g.v === 'oi' && /다음 일정이 지난 OI/.test(g.pre) && g.rows === oiN && all > oiN, JSON.stringify({ g, oiN, all }));
    return r.head;
  });
  await S.t('㊿+169 장비: 타일 이름에 범위(현황·대 / 신청·건) · «회수 완료 n대 / 대상 n대» · 타일 = 보드 같은 건수 · 빈 열 안 접힘 · 시리얼 칩 = 상세(바뀌지 않음) · 미등록 시리얼 표시 · 회수 처리 미리 보기(부분/전체/없음) → 저장 → 되돌리기', async () => {
    await page.evaluate(() => SVC.navMenu('eqboard')); await page.waitForTimeout(500);
    const t = await page.evaluate(() => [...document.querySelectorAll('#eqbKpis .kpi')].map((k) => k.querySelector('.k').textContent.trim() + '=' + k.querySelector('.v').textContent.trim() + '|' + k.querySelector('.d').textContent.trim()));
    const pendN = +/=(\d+)/.exec(t[1])[1];
    await page.click('#eqbKpis .kpi[data-go="only:pend"]'); await page.waitForTimeout(250);
    const p = await page.evaluate(() => ({ cards: document.querySelectorAll('#eqbCols .eqb-card').length, chip: (document.querySelector('#eqbChips .eqb-only') || {}).textContent || '', w: [...document.querySelectorAll('#eqbCols .eqb-col')].map((c) => Math.round(c.getBoundingClientRect().width)) }));
    await page.click('#eqbChips .eqb-only button'); await page.waitForTimeout(200);
    const ph = await page.evaluate(() => { const c = document.querySelector('.eqsn.ph'); return c ? c.textContent : ''; });
    const o303 = await page.evaluate(() => SVC.eqOrderById(303).returned_serials || '');
    await page.click('.eqb-card[data-oid="303"] .eqsn.act >> nth=0'); await page.waitForTimeout(150);
    const pop = await page.evaluate(() => ({ on: !!document.getElementById('eqSnPop'), txt: (document.getElementById('eqSnPop') || {}).textContent || '', same: (SVC.eqOrderById(303).returned_serials || '') }));
    await page.keyboard.press('Escape'); await page.waitForTimeout(80);
    assert(/임대중 · 현황=\d+대/.test(t[0]) && /처리 대기 · 신청=\d+건/.test(t[1]) && /회수 진행 · 신청=\d+건\|회수 완료 \d+대 \/ 대상 \d+대/.test(t[2]) && /회수 완료 · 현황=\d+대/.test(t[3]), JSON.stringify(t));
    assert(p.cards === pendN && /처리 대기/.test(p.chip) && Math.min(...p.w) / Math.max(...p.w) > 0.8 && ph === '미등록 시리얼 1' && pop.on && /현황 상태/.test(pop.txt) && pop.same === o303 && !(await page.evaluate(() => !!document.getElementById('eqSnPop'))), JSON.stringify({ p, pendN, ph, pop }));
    await page.click('.eqb-card[data-oid="303"] [data-ret="303"]'); await page.waitForTimeout(200);
    const st = async () => page.evaluate(() => ({ s: document.getElementById('erSum').className.replace('er-sum ', ''), b: document.getElementById('erSave').textContent, dis: document.getElementById('erSave').disabled }));
    const s0 = await st(); await page.click('#erList input >> nth=0'); const s1 = await st(); await page.click('#erAll'); const s2 = await st(); await page.click('#erNone'); await page.click('#erList input >> nth=0'); const s3 = await st();
    writes.length = 0; await page.click('#erSave'); await page.waitForTimeout(700);
    const after = await page.evaluate(() => ({ rs: SVC.eqOrderById(303).returned_serials, open: document.getElementById('ovlEqRet').classList.contains('on'), undo: !!document.querySelector('.toast .tact') }));
    await page.click('.toast .tact'); await page.waitForTimeout(700);
    const undone = await page.evaluate(() => SVC.eqOrderById(303).returned_serials || '');
    assert(s0.s === 'none' && s0.dis && s1.s === 'part' && /부분 회수/.test(s1.b) && s2.s === 'all' && /전체 회수/.test(s2.b) && s3.s === 'part' && after.rs && !after.open && after.undo && undone === o303 && writes.some((w) => /PATCH .*equipment_orders/.test(w)), JSON.stringify({ s0, s1, s2, s3, after, undone, o303, w: writes.slice(0, 4) }));
    return t.map((x) => x.split('|')[0]).join(' · ');
  });
  await S.t('㊿+169 공통: 글자 아이콘 → 같은 선 아이콘(도구 버튼) · 위젯은 홈에서만 · 계정 진입점 하나(오른쪽 위) · 정산·도구 묶음 정리(정산·목표 5 / 도구 5~6 — Cloud 사이트 관리는 슈퍼 관리자만) + 자주 쓰는 화면 · LIVE «제품별 합» 설명 · 장비 채널 막대 단위 «대»', async () => {
    await page.evaluate(() => SVC.navMenu('dash')); await page.waitForTimeout(250);
    const w1 = await page.evaluate(() => getComputedStyle(document.getElementById('btnWidgets')).display !== 'none');
    await page.evaluate(() => SVC.navMenu('contracts')); await page.waitForTimeout(200);
    const r = await page.evaluate(() => ({ w2: getComputedStyle(document.getElementById('btnWidgets')).display, auth: getComputedStyle(document.getElementById('btnAuth')).display,
      tools: ['dvReload', 'dvCsv', 'dvDense', 'dvCols', 'btnEdit', 'btnReload', 'btnTheme'].map((id) => { const b = document.getElementById(id); return id + ':' + (b.querySelector('svg') ? 'svg' : '-') + ':' + (/[\u{1F300}-\u{1FAFF}☀-➿⊞↻⬇☰]/u.test(b.textContent) ? 'emoji' : 'ok'); }).join(' ') }));
    await page.click('#rail .gn-me'); await page.waitForTimeout(120);
    const am = await page.evaluate(() => (document.getElementById('authMenu') || {}).textContent || '');
    await page.keyboard.press('Escape'); await page.waitForTimeout(80);
    const amGone = await page.evaluate(() => !document.getElementById('authMenu') && document.activeElement && document.activeElement.classList.contains('gn-me'));
    assert(amGone, '계정 메뉴 Esc 로 닫힘 · 초점 복귀');
    await page.evaluate(() => { ['biz', 'biz', 'price', 'oi'].forEach((v) => SVC.switchView(v)); SVC.navMenu('dash'); }); await page.waitForTimeout(200);
    await page.click('#rail .gn-tb[data-seg="m:정산·도구"]'); await page.waitForTimeout(150);
    const mn = await page.evaluate(() => ({ cols: [...document.querySelectorAll('#gnMenu .gn-sec')].map((s) => s.querySelector('.gn-st').textContent + ':' + s.querySelectorAll('.gn-mi').length).join('|'), s1: [...document.querySelectorAll('#gnMenu .gn-sec')][0].textContent.includes('에스원 정산'), fq: [...document.querySelectorAll('#gnMenu .gn-mf .gn-mi')].map((b) => b.dataset.v).join(',') }));
    await page.keyboard.press('Escape');
    const live = await page.evaluate(() => [...document.querySelectorAll('#kpis .kpi')].map((k) => k.textContent).find((x) => /LIVE/.test(x)) || '');
    await page.evaluate(() => SVC.navMenu('eqboard')); await page.waitForTimeout(400);
    const bar = await page.evaluate(() => [...document.querySelectorAll('#eqcCh .vv')].map((x) => x.textContent).join(' '));
    assert(w1 && r.w2 === 'none' && r.auth === 'none' && !/-|emoji/.test(r.tools.replace(/[a-zA-Z]+:/g, (x) => x)) && /내 계정/.test(am) && /로그아웃/.test(am), JSON.stringify({ w1, r, am }));
    assert(/^정산·목표:5\|도구:[56]$/.test(mn.cols) && mn.s1 && /biz/.test(mn.fq) && /제품별 합 \d+ — (회사 수와 같음|두 제품 이상)/.test(live) && /\d+대/.test(bar) && !/건/.test(bar), JSON.stringify({ mn, live: live.slice(0, 120), bar }));
    assert(!c.errs.length, c.errs.join(' | ')); return mn.cols + ' · 자주 ' + mn.fq;
  });
  await ctx.close();
}
await browser.close(); srv.close();
const ok = S.report();
fs.writeFileSync(path.join(OUT, 'smoke.json'), JSON.stringify(S.results, null, 1));
process.exit(ok ? 0 : 1);
