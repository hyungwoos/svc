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
  await S.t('데이터 점검: 규칙 카드 · 요약 · 항목 → 바로가기', async () => {
    await page.keyboard.press('Escape'); await page.evaluate(() => switchView('dcheck')); await page.waitForTimeout(400);
    const n = await page.$$eval('#bizHost .dc-rule', (e) => e.length); assert(n >= 18, '규칙 ' + n);
    const sum = await page.evaluate(() => dcSummary()); assert(typeof sum.crit === 'number' && typeof sum.warn === 'number', 'dcSummary');
    const withItems = await page.$$eval('#bizHost .dc-rule', (e) => e.filter((x) => !/이상 없음/.test(x.textContent)).map((x) => x.querySelector('[data-dc]').dataset.dc));
    if (withItems.length) {
      await page.click('#bizHost [data-dc="' + withItems[0] + '"]'); await page.waitForTimeout(200);
      const links = await page.$$('#bizHost [data-dcgo]'); assert(links.length >= 1, '항목 링크 없음');
      await links[0].click(); await page.waitForTimeout(400);
      assert(await page.evaluate(() => CUR_VIEW !== 'dcheck' || !!document.getElementById('ovlRenew')), '바로가기 이동 안 됨 (' + withItems[0] + ')');
    }
    const dig = await page.evaluate(() => buildDigest().데이터점검); assert(dig && '바로고침' in dig, 'digest 데이터점검 없음');
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
  await S.t('배포·운영: AI 15문 점검 실행(가짜 ask) · 요약 · change_log', async () => {
    const before = opsCalls.length;
    await page.click('#opsAiCheck'); await page.waitForTimeout(2500);
    const n = await page.$$eval('#opsBody table tbody tr td:first-child', (t) => t.filter((x) => /^\d+$/.test(x.textContent.trim())).length); assert(n === 15, '질문 행 ' + n);
    const sum = await page.evaluate(() => OPS.aic && OPS.aic.summary); assert(sum && sum.total === 15 && typeof sum.pass === 'number', 'summary ' + JSON.stringify(sum));
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
    const check = async (v) => { await page.evaluate((v) => switchView(v), v); await page.waitForTimeout(300); return page.evaluate(() => { const t = document.getElementById('dvTable'), w = t.parentElement; return { over: w.scrollWidth > w.clientWidth + 2, pad: t.classList.contains('act-pad'), actw: t.style.getPropertyValue('--actw'), hasAct: !!t.querySelector('thead th.act') }; }); };
    const a = await check('contracts'); assert(!a.hasAct || a.pad === a.over, 'contracts ' + JSON.stringify(a)); if (a.pad) assert(/^\d+px$/.test(a.actw), 'actw ' + a.actw);
    await page.setViewportSize({ width: 900, height: 900 }); await page.waitForTimeout(400);
    const b = await check('orders'); assert(b.hasAct && b.over && b.pad && /^\d+px$/.test(b.actw), '900px orders ' + JSON.stringify(b));
    const padPx = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#dvTable thead th:nth-last-child(2)')).paddingRight)); assert(padPx >= parseFloat(b.actw) + 10, '여백 ' + padPx + ' vs ' + b.actw);
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.waitForTimeout(400);
    return JSON.stringify({ wide: a.pad, narrow: b.pad, actw: b.actw });
  });
  await S.t('표 설명 접기: 긴 cap → 첫 문장 + «도움말 ▾» → 펼침 기억', async () => {
    await page.evaluate(() => { try { localStorage.removeItem('svc_capopen_orders'); } catch (e) { /* noop */ } switchView('orders'); }); await page.waitForTimeout(300);
    const a = await page.evaluate(() => ({ len: document.querySelector('#dvCap .cap-head').textContent.length, btn: (document.querySelector('#dvCap .cap-more') || {}).textContent }));
    assert(a.len < 120 && /도움말/.test(a.btn), JSON.stringify(a));
    await page.click('#dvCap .cap-more'); await page.waitForTimeout(100);
    const b = await page.evaluate(() => ({ len: document.querySelector('#dvCap .cap-head').textContent.length, btn: document.querySelector('#dvCap .cap-more').textContent, saved: localStorage.getItem('svc_capopen_orders') }));
    assert(b.len > a.len + 40 && /접기/.test(b.btn) && b.saved === '1', JSON.stringify(b));
    await page.evaluate(() => { switchView('assets'); switchView('orders'); }); await page.waitForTimeout(300);
    const c = await page.evaluate(() => /접기/.test(document.querySelector('#dvCap .cap-more').textContent)); assert(c, '펼침 상태 기억 안 됨');
    const d = await page.evaluate(() => { switchView('contracts'); return document.querySelector('#dvCap .cap-more'); }); assert(!d, '짧은 cap 에 버튼이 생김');
    return a.len + '→' + b.len;
  });
  await S.t('❔ 이 화면 사용법 → 홈 AI 질문 · ? 단축키 안내 · Esc 닫기', async () => {
    await page.evaluate(() => switchView('orders')); await page.waitForTimeout(200);
    await page.click('#dvHelp'); await page.waitForTimeout(900);
    const st = await page.evaluate(() => ({ v: CUR_VIEW, on: document.getElementById('answer').classList.contains('on'), title: document.getElementById('ansTitle').textContent, say: document.getElementById('aiSay').textContent }));
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
    await page.evaluate(() => { switchView('dash'); ask('LIVE 고객사 몇 곳이야?'); }); await page.waitForTimeout(900);
    const fb = await page.$$('#aiSay .ai-fb button'); assert(fb.length === 2, '피드백 버튼 ' + fb.length);
    writes.length = 0; await fb[0].click(); await page.waitForTimeout(400);
    const up = writes.filter((w) => /ai_feedback/.test(w.url) && w.m === 'POST')[0]; assert(up, '👍 POST 없음 ' + JSON.stringify(writes.map((w) => w.url.split('/rest/v1/')[1])));
    const ub = JSON.parse(up.body); assert(ub.verdict === 'up' && ub.email === 'tester@example.com' && /LIVE/.test(ub.question) && ub.answer_head && ub.app_ver, JSON.stringify(ub).slice(0, 200));
    const pressed = await page.evaluate(() => [...document.querySelectorAll('#aiSay .ai-fb button')].map((b) => b.getAttribute('aria-pressed') + ':' + b.disabled)); assert(pressed[0] === 'true:true' && pressed[1] === 'false:true', JSON.stringify(pressed));
    await page.evaluate(() => ask('에스원 MRR 은?')); await page.waitForTimeout(900);
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
  await S.t('스테이징: STAGING 띠 · 배포 기본 대상 스테이징', async () => { assert(!c.errs.length, c.errs.join(' | ')); assert(await page.$('#stagingBar'), '띠 없음'); assert(await page.evaluate(() => IS_STAGING && /STAGING/.test(document.title)), 'IS_STAGING/title'); await page.evaluate(() => switchView('ops')); await page.waitForTimeout(300); assert(await page.evaluate(() => OPS.target === 'staging'), 'target ' + await page.evaluate(() => OPS.target)); });
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
  // E) 관리자가 필수(즉시) 지정 + 미등록 → 등록 강제 창 → QR·코드 → aal2 입장
  {
    factors = []; policy = { required: true, deadline: null };
    const { ctx, page, errs } = await open({ token: jwt('aal1'), extra: mfaExtra });
    await S.t('MFA 강제: 필수(즉시)·미등록 → 등록 창 → 등록 → 입장', async () => {
      assert(await page.$('#ovlMfa #mfaForceHost'), '강제 등록 창 없음'); assert(await page.evaluate(() => document.getElementById('app').classList.contains('hidden')), '등록 전에 앱이 열림');
      await page.waitForTimeout(500); assert(await page.$('#mfaForceHost img[alt="인증 앱 등록 QR"]'), 'QR 없음'); assert(!(await page.$eval('#mfaEnCancel', (e) => e.offsetParent !== null)), '안쪽 취소 버튼이 보임');
      await page.fill('#mfaEnCode', '123456'); await page.click('#mfaEnGo'); await page.waitForTimeout(2500);
      assert(!(await page.$('#ovlMfa')), '창이 남음'); assert(await page.evaluate(() => !document.getElementById('app').classList.contains('hidden') && !!window.DATA), '앱 미표시');
      assert(await page.evaluate(() => JSON.parse(sessionStorage.getItem('svc_sess')).a) === jwt('aal2'), 'aal2 세션 아님'); assert(!errs.length, errs.join(' | '));
      return authCalls.filter((x) => /enroll|verify:f2/.test(x)).join(' → ');
    });
    await S.t('MFA 강제: 관리자 › 2단계 인증 정책 — 목록 · 필수 지정 저장 · 초기화', async () => {
      page.on('dialog', (d) => d.accept());
      await page.evaluate(() => switchView('adminx')); await page.waitForTimeout(900);
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
      assert(!(await page.$('#ovlMfa')), '창이 떴음'); assert(await page.evaluate(() => !!window.DATA), 'DATA 없음');
      const t = await page.$$eval('#toasts .toast', (e) => e.map((x) => x.textContent).join(' | ')); assert(/2단계 인증 등록이 필요/.test(t) && t.includes(dl), '토스트: ' + t.slice(0, 120));
      await page.evaluate(() => switchView('account')); await page.waitForTimeout(700);
      assert(/관리자 지정: 필수/.test(await page.$eval('#accMfa', (e) => e.textContent)), '카드에 필수 표시 없음'); return dl;
    });
    await ctx.close();
    policy = { required: false, deadline: null };
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
    const st = await page.evaluate(() => ({ ch: CH_OPTS.slice(), model: MODEL_OPTS.slice(), ordCh: ORD_CH_OPTS.slice(), gridOpts: GRIDS.orders.cols.filter((c) => c.k === 'model')[0].opts === MODEL_OPTS, od: [...document.querySelectorAll('#odModel option')].map((o) => o.value), codes: !!CODES, active: codeActive('channel', '옛채널'), active2: codeActive('channel', '테스트채널') }));
    assert(st.codes, 'CODES 비어 있음'); assert(st.ch.includes('테스트채널') && !st.ch.includes('옛채널'), 'CH_OPTS ' + st.ch.join(','));
    assert(st.model.includes('S900') && st.od.includes('S900'), 'MODEL_OPTS/#odModel ' + st.od.join(','));
    assert(st.gridOpts, 'GRIDS.orders 모델 열이 MODEL_OPTS 배열을 참조하지 않음'); assert(st.ordCh.length === 5, 'ORD_CH_OPTS(표에 없음) 는 기본값 유지');
    assert(st.active === false && st.active2 === true, 'codeActive');
    assert(!errs.length, errs.join(' | ')); return st.ch.join(',');
  });
  await S.t('관리자 › 코드 관리: 표 · 추가(POST) · 숨기기(PATCH) · 순서(PATCH×2)', async () => {
    await page.evaluate(() => switchView('adminx')); await page.waitForTimeout(800);
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
    await page.evaluate(() => { RAWX.customers.push({ id: 99901, name: '(주)가상고객01', aliases: [] }); switchView('dcheck'); }); await page.waitForTimeout(500);
    const dup = await page.evaluate(() => { const r = dcRules().filter((x) => x.id === 'cu_dup')[0]; return r.items.map((i) => ({ label: i.label, act: !!i.act })); });
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
    const exp = await page.evaluate(async () => { const r = DATA.rows.filter((x) => x.mrr > 0)[0]; await dcFillMrr([r], DATA.nowIdx); return { id: r._id, mrr: r.mrr, month: idxDate(DATA.nowIdx) }; });
    await page.waitForTimeout(500);
    const post = writes.filter((w) => /monthly_revenue/.test(w.url) && w.m === 'POST')[0]; assert(post, 'monthly_revenue POST 없음 ' + JSON.stringify(writes.map((w) => w.m + ' ' + w.url.split('/rest/v1/')[1])));
    const b = JSON.parse(post.body); assert(Array.isArray(b) && b.length === 1 && b[0].contract_id === exp.id && b[0].amount === Math.round(exp.mrr) && b[0].month === exp.month, JSON.stringify(b) + ' vs ' + JSON.stringify(exp));
    assert(writes.some((w) => /change_log/.test(w.url) && /bulk_fill/.test(w.body)), 'change_log bulk_fill 없음');
    const dc = writes.filter((w) => /change_log/.test(w.url) && /data_check/.test(w.body)); assert(dc.length <= 1, 'data_check 로그가 세션당 1회를 넘음 ' + dc.length);
    assert(!errs.length, errs.join(' | ')); return b[0].amount + '원';
  });
  await S.t('데이터 점검: 만기 판정 포탈 ↔ DB(renew_watch) 대조 규칙', async () => {
    const rs = await page.evaluate(() => { const R = renewScan(DATA.nowIdx); return { lapsed: R.lapsed.map((r) => r._id), due: R.due.map((r) => r._id), next: R.next.map((r) => r._id) }; });
    rwRows = rs.due.map((id) => ({ kind: 'due', contract_id: id, customer: 'x' })).concat([{ kind: 'lapsed', contract_id: 999999, customer: '가상DB전용' }]);
    await page.evaluate(() => { DC.rw = null; switchView('dcheck'); }); await page.waitForTimeout(900);
    const r = await page.evaluate(() => { const x = dcRules().filter((q) => q.id === 'c_renew_sync')[0]; return { sev: x.sev, n: x.items.length, subs: x.items.map((i) => i.sub.slice(0, 20)), rw: DC.rw && { portalN: DC.rw.portalN, dbN: DC.rw.dbN, pending: !!DC.rw.pending } }; });
    const expect = rs.lapsed.length + rs.next.length + 1;
    assert(r.rw && !r.rw.pending && r.rw.dbN === rs.due.length + 1, 'rw ' + JSON.stringify(r.rw));
    assert(r.sev === 'warn' && r.n === expect, 'diff ' + r.n + ' vs ' + expect + ' ' + JSON.stringify(r.subs).slice(0, 200));
    assert(r.subs.some((s) => /^DB\(renew_watch\)만/.test(s)) && (expect === 1 || r.subs.some((s) => /^포탈만/.test(s))), '양쪽 방향 표시 ' + JSON.stringify(r.subs).slice(0, 200));
    assert(!errs.length, errs.join(' | ')); rwRows = null; return 'portal ' + r.rw.portalN + ' · db ' + r.rw.dbN + ' · diff ' + r.n;
  });
  await S.t('코드 목록 표 없음(SQL 93 전) → 기본값 그대로 · 코드 관리는 안내', async () => {
    const { ctx: c2, page: p2, errs: e2 } = await open({ extra: async (route, u, m) => { if (!u.includes('/rest/v1/code_lists')) return false; await route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"relation \\"public.code_lists\\" does not exist"}' }); return true; } });
    const st = await p2.evaluate(() => ({ codes: CODES, ch: CH_OPTS.slice() })); assert(st.codes === null && st.ch.length === 5, JSON.stringify(st));
    await p2.evaluate(() => switchView('adminx')); await p2.waitForTimeout(800);
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
      wk.length = 0; await page.evaluate(() => openQuotePick()); await page.waitForTimeout(600);
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
    await page.evaluate(() => { openOvl('ovlC360'); }); await page.waitForTimeout(120);
    await page.mouse.click(30, 500); await page.waitForTimeout(150); assert(!(await isOn('ovlC360')), '고객 360 바깥 클릭으로 안 닫힘');
    /* 창 안에서 누르고 배경에서 뗌(글자 끌어 선택) → 닫지 않음 */
    await page.evaluate(() => document.getElementById('ovlKeys').classList.add('on')); await page.waitForTimeout(120);
    const r = await page.$eval('#ovlKeys .keys-tbl', (e) => { const b = e.getBoundingClientRect(); return { x: b.left + 20, y: b.top + 10 }; });
    await page.mouse.move(r.x, r.y); await page.mouse.down(); await page.mouse.move(6, 880); await page.mouse.up(); await page.waitForTimeout(150);
    assert(await isOn('ovlKeys'), '드래그 선택이 배경에서 끝났는데 닫힘'); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    return 'keys·c360';
  });
  await S.t('입력 중인 창: 바깥 클릭 → 확인(취소면 유지 · 확인이면 닫힘) · 동적 창(월 목표)은 제거', async () => {
    await page.evaluate(() => openTargetEditor(2026)); await page.waitForTimeout(150);
    await page.focus('#ovlTarget input[data-m="1"]'); await page.keyboard.type('5000000');
    let dlg = null; page.once('dialog', async (d) => { dlg = d.message(); await d.dismiss(); });
    await backdrop('#ovlTarget'); assert(dlg && /저장되지 않았습니다/.test(dlg), '확인 창 없음 ' + dlg); assert(await page.$('#ovlTarget'), '취소했는데 닫힘');
    page.once('dialog', async (d) => { await d.accept(); }); await backdrop('#ovlTarget'); assert(!(await page.$('#ovlTarget')), '확인했는데 남음(동적 창은 제거)');
    /* 손대지 않은 창은 묻지 않고 닫힘 */
    await page.evaluate(() => openTargetEditor(2026)); await page.waitForTimeout(150);
    let asked = false; const h = () => { asked = true; }; page.on('dialog', h); await backdrop('#ovlTarget'); page.off('dialog', h);
    assert(!asked && !(await page.$('#ovlTarget')), '입력 없는데 확인을 물음/안 닫힘');
    /* 메뉴 편집: ↑↓ 로 순서만 바꿔도 «입력 중» */
    await page.evaluate(() => openMenuEdit()); await page.waitForTimeout(150);
    await page.click('#mcBody [data-mv="dn"]'); dlg = null; page.once('dialog', async (d) => { dlg = d.message(); await d.dismiss(); }); await backdrop('#ovlMenu');
    assert(dlg && (await isOn('ovlMenu')), '메뉴 순서 변경 후 확인 없음'); await page.evaluate(() => closeOvl('ovlMenu'));
    return 'confirm·remove·clean·menu';
  });
  await S.t('2단계 인증 창은 바깥 클릭·Esc 로 닫히지 않음 · 저장 성공 뒤엔 확인 없이 닫힘', async () => {
    const t = await page.evaluate(() => { const o = document.createElement('div'); o.id = 'ovlMfa'; o.className = 'ovl on'; o.style.zIndex = '100000'; o.innerHTML = '<div class="modal"><h3>코드</h3><input id="mfX"></div>'; document.body.appendChild(o); return true; });
    await page.waitForTimeout(100); await page.mouse.click(6, 880); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    assert(await page.$('#ovlMfa.on'), 'MFA 창이 닫힘'); await page.evaluate(() => document.getElementById('ovlMfa').remove());
    await page.evaluate(() => openTargetEditor(2026)); await page.waitForTimeout(150);
    await page.focus('#ovlTarget input[data-m="2"]'); await page.keyboard.type('7000000');
    await page.evaluate(() => sbWrite('POST', 'monthly_targets', [{ year: 2026, month: 2, amount: 7000000 }]));
    let asked = false; const h = (d) => { asked = true; d.dismiss(); }; page.on('dialog', h); await backdrop('#ovlTarget'); page.off('dialog', h);
    assert(!asked && !(await page.$('#ovlTarget')), '저장 뒤에도 확인을 물음'); return String(t);
  });
  await S.t('창 초점: 열리면 창 안으로 · Tab 은 창 안에서만 · 닫히면 연 버튼으로 · role=dialog 자동', async () => {
    await page.evaluate(() => switchView('dash')); await page.waitForTimeout(200);
    await page.focus('#btnTheme'); await page.keyboard.press('Shift+?'); await page.waitForTimeout(200);
    const a = await page.evaluate(() => { const o = document.getElementById('ovlKeys'); return { inside: o.contains(document.activeElement) }; }); assert(a.inside, '초점이 창 밖');
    let out = 0; for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); if (!(await page.evaluate(() => document.getElementById('ovlKeys').contains(document.activeElement)))) out++; }
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Shift+Tab');
    if (!(await page.evaluate(() => document.getElementById('ovlKeys').contains(document.activeElement)))) out++;
    assert(out === 0, 'Tab 이 창 밖으로 ' + out + '회');
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    const back = await page.evaluate(() => document.activeElement && document.activeElement.id); assert(back === 'btnTheme', '닫힌 뒤 초점 ' + back);
    await page.evaluate(() => openRenewList('due')); await page.waitForTimeout(300);
    const d = await page.evaluate(() => { const m = document.querySelector('#ovlRenew .modal'); return { role: m.getAttribute('role'), modal: m.getAttribute('aria-modal'), lb: m.getAttribute('aria-labelledby'), inside: document.getElementById('ovlRenew').contains(document.activeElement) }; });
    assert(d.role === 'dialog' && d.modal === 'true' && d.lb === 'rnTitle' && d.inside, JSON.stringify(d));
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    return JSON.stringify(d);
  });
  await S.t('배포·운영 › 기록: 긴 파일 목록이 카드 밖으로 넘치지 않음 · 접힌 목록 펼치기', async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => switchView('ops')); await page.waitForTimeout(700);
    await page.evaluate(() => { OPS.tab = 'log'; renderOps(); }); await page.waitForTimeout(300);
    const m = await page.evaluate(() => { const host = document.getElementById('opsHost').getBoundingClientRect(); const t = [...document.querySelectorAll('#opsHost table')].pop().getBoundingClientRect(); return { doc: document.documentElement.scrollWidth - window.innerWidth, over: Math.round(t.right - host.right), det: document.querySelectorAll('#opsHost details.ops-tgt').length, sum: (document.querySelector('#opsHost details.ops-tgt summary') || {}).textContent }; });
    assert(m.doc <= 0 && m.over <= 0, '넘침 ' + JSON.stringify(m)); assert(m.det >= 4 && /staging\/.*파일 24개/.test(m.sum), JSON.stringify(m));
    await page.click('#opsHost details.ops-tgt summary'); const open = await page.$eval('#opsHost details.ops-tgt', (d) => d.open && /file21\.js/.test(d.textContent)); assert(open, '펼쳐도 전체 목록 없음');
    const m2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert(m2 <= 0, '펼친 뒤 넘침 ' + m2);
    await page.setViewportSize({ width: 1440, height: 1000 });
    assert(!errs.length, errs.join(' | ')); return m.sum.slice(0, 40);
  });
  await S.t('접근성: 이름 없는 select 0 · 차트 aria-label · 버튼 속 버튼 0 · 조합 결과 표 tabindex', async () => {
    const bad = []; for (const v of ['churn', 'report', 'account', 'adminx', 'dash', 'eqboard', 'leadsrc']) {
      await page.evaluate((v) => switchView(v), v); await page.waitForTimeout(350);
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
    const t = await page.evaluate(() => ({ load: (document.getElementById('loading') || {}).textContent || '', data: !!window.DATA }));
    assert(/불러오지 못했습니다/.test(t.load) && /503/.test(t.load), JSON.stringify(t).slice(0, 200)); return t.load.slice(0, 40);
  });
  await ctx.close();
}
{
  let fail = false;
  const { ctx, page } = await open({ extra: async (route, u) => { if (fail && (u.includes('/rpc/load_all') || /\/rest\/v1\/(customers|contracts|monthly_revenue)\b/.test(u))) { await route.fulfill({ status: 502, contentType: 'application/json', body: '{}' }); return true; } return false; } });
  await S.t('캐시로 그린 뒤 최신 데이터 실패 → 경고 토스트', async () => {
    /* lib 의 init 스크립트가 새로고침마다 저장소를 비우므로, 같은 페이지에서 boot() 를 다시 불러 «캐시로 먼저 그리기» 경로를 탐 */
    const c = await page.evaluate(() => !!sessionStorage.getItem(CACHE_KEY)); assert(c, '캐시 없음');
    fail = true; await page.evaluate(() => boot()); await page.waitForTimeout(1500);
    const t = await page.evaluate(() => ({ data: !!window.DATA, toast: [...document.querySelectorAll('.toast')].map((e) => e.textContent).join(' | ') }));
    assert(t.data && /최신 데이터를 불러오지 못했습니다/.test(t.toast), JSON.stringify(t).slice(0, 200)); return 'toast';
  });
  await ctx.close();
}
await browser.close(); srv.close();
const ok = S.report();
fs.writeFileSync(path.join(OUT, 'smoke.json'), JSON.stringify(S.results, null, 1));
process.exit(ok ? 0 : 1);
