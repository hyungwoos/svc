// 단위 시험 — 화면 없이 순수 함수만 (금액 단위 · 날짜 · 비밀번호 규칙 · 붙여넣기 · 데이터 점검 키 · 대시보드 합계)
// 실행: node --test tests/unit.mjs  (브라우저 불필요 · 1초 · npm run check 가 함께 돌림)
// ※ 데이터는 전부 가짜(합성) — 실제 고객사 이름 · 금액을 넣지 말 것 (Public 저장소)
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Asia/Seoul';   // 한국 시간 기준 — todayStr 의 «아침 9시 전» 시험
/* 모듈이 읽어 들일 때 건드리는 브라우저 객체만 최소로 흉내 (화면 동작은 smoke 가 시험) */
const noop = () => {};
const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; };
globalThis.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener: noop,
  createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop, classList: { add: noop, remove: noop, toggle: noop } }),
  documentElement: { dataset: {}, classList: { add: noop, remove: noop, toggle: noop } }, head: { appendChild: noop }, body: null };
globalThis.location = { pathname: '', search: '', hash: '', origin: 'http://localhost', href: 'http://localhost/' };
globalThis.window = globalThis; globalThis.addEventListener = noop;
globalThis.localStorage = store(); globalThis.sessionStorage = store();

const core = await import('../js/core.js');
const shell = await import('../js/shell.js');
const grid = await import('../js/grid.js');
const tools = await import('../js/tools.js');
const ana = await import('../js/analysis.js');
const dash = await import('../js/dash.js');
const { ST } = await import('../js/state.js');

test('날짜: todayStr 는 한국 날짜(UTC 아님 — 아침 9시 전에도 오늘)', () => {
  assert.equal(shell.todayStr(new Date('2026-10-10T23:30:00Z')), '2026-10-11');   // 한국 08:30
  assert.equal(shell.todayStr(new Date('2026-10-11T14:59:00Z')), '2026-10-11');   // 한국 23:59
  assert.equal(shell.todayStr(new Date('2026-12-31T15:00:00Z')), '2027-01-01');
  assert.match(shell.todayStr(), /^\d{4}-\d{2}-\d{2}$/);
});
test('날짜: 월 인덱스(2020-06 = 0) · 미래 월 · 월 더하기', () => {
  assert.equal(shell.dIdx('2020-06-01'), 0); assert.equal(shell.dIdx('2026-10'), 76); assert.equal(shell.dIdx(''), null);
  assert.equal(shell.idxDate(0), '2020-06-01'); assert.equal(shell.idxDate(76), '2026-10-01');
  for (const i of [0, 6, 7, 11, 12, 76, 120]) assert.equal(shell.dIdx(shell.idxDate(i)), i);
  assert.equal(core.mkFuture(0), '2020-06'); assert.equal(core.mkFuture(7), '2021-01'); assert.equal(core.mkFuture(-1), '');
  assert.equal(grid.ymAdd('2026-01', -1), '2025-12'); assert.equal(grid.ymAdd('2026-11', 2), '2027-01'); assert.equal(grid.ymAdd('', 3), '');
});

test('금액: 천원 입력 ↔ 원 저장(㊿+157 — 칸은 천원 · DB 는 원)', () => {
  assert.equal(core.kwToWon('52.8'), 52800); assert.equal(core.kwToWon('1,234'), 1234000); assert.equal(core.kwToWon(' 480 '), 480000);
  assert.equal(core.kwToWon(''), null); assert.equal(core.kwToWon(null), null); assert.equal(core.kwToWon('abc'), null);
  assert.equal(core.wonToKw(52800), '52.8'); assert.equal(core.wonToKw(''), ''); assert.equal(core.wonToKw(null), '');
  for (const w of [0, 1, 999, 52800, 480000, 123456789, -30000]) assert.equal(core.kwToWon(core.wonToKw(w)), w);
  assert.equal(core.won(52800), '53'); assert.equal(core.won(null), '0'); assert.equal(core.wonFull(1234567), '1,235천원');
});
test('금액: 읽기 쉬운 금액(wonKo) · 이상한 금액 이유(amtWhy)', () => {
  assert.equal(core.wonKo(480000000), '4.8억원'); assert.equal(core.wonKo(480000), '48만원'); assert.equal(core.wonKo(53000), '5.3만원');
  assert.equal(core.wonKo(9000), '9,000원'); assert.equal(core.wonKo(-480000), '−48만원'); assert.equal(core.wonKo(12345678901), '123억원');
  assert.equal(core.amtWhy(0, 100000), ''); assert.equal(core.amtWhy(5000, 0), '1만원 미만입니다');
  assert.match(core.amtWhy(500000, 100000), /5배/); assert.match(core.amtWhy(20000, 100000), /1\/5/);
  assert.equal(core.amtWhy(1e8, 0), '월 1억원 이상입니다'); assert.equal(core.amtWhy(1e8, 0, false), ''); assert.equal(core.amtWhy(480000, 450000), '');
});
test('서비스 버전 표기', () => {
  assert.equal(core.verShort('V6.0'), '6.0'); assert.equal(core.verShort('ztna'), 'ZTNA'); assert.equal(core.verShort(''), '');
  assert.equal(core.llineVer('Cloud', 'V5.0'), 'Cloud NAC 5.0'); assert.equal(core.llineVer('Cloud', 'ZTNA'), 'Cloud ZTNA'); assert.equal(core.llineVer('MDR', 'V6.0'), 'MDR');
});

test('비밀번호 규칙(㊿+180)', () => {
  assert.match(core.pwRule('short1', 'a@x.com'), /10자/);
  assert.match(core.pwRule('abcdefghijk', 'a@x.com'), /영문과 숫자/);
  assert.match(core.pwRule('aaaaa11111', 'a@x.com'), /같은 글자/);
  assert.match(core.pwRule('tester1234xy', 'tester@x.com'), /아이디/);
  assert.match(core.pwRule('Password1234', 'a@x.com'), /흔한/);
  assert.match(core.pwRule('Blue7Sky42x', 'a@x.com', 'Blue7Sky42x'), /다르게/);
  assert.equal(core.pwRule('Blue7Sky42x', 'a@x.com', 'Old7Sky42xx'), '');
});
test('비밀번호 자동 만들기: 14자 · 영문+숫자 · 헷갈리는 글자 없음 · 규칙 통과', () => {
  const seen = new Set();
  for (let i = 0; i < 300; i++) { const p = core.pwGen(); seen.add(p);
    assert.equal(p.length, 14); assert.match(p, /\d/); assert.match(p, /[A-Za-z]/); assert.doesNotMatch(p, /[01OIl]/); assert.equal(core.pwRule(p, 'someone@x.com'), ''); }
  assert.equal(seen.size, 300);
});
test('세션: 30일 지난 로그인 유지 · 2단계 인증 기한', () => {
  assert.equal(core.sessTooOld({ l: Date.now() - 31 * 864e5 }), true); assert.equal(core.sessTooOld({ l: Date.now() - 29 * 864e5 }), false); assert.equal(core.sessTooOld({}), false);
  assert.equal(core.mfaDue({ required: true, enrolled: false, deadline: '2026-10-10', today: '2026-10-11' }), true);
  assert.equal(core.mfaDue({ required: true, enrolled: false, deadline: '2026-10-20', today: '2026-10-11' }), false);
  assert.equal(core.mfaDue({ required: true, enrolled: true, deadline: '2026-10-01', today: '2026-10-11' }), false);
  assert.equal(core.mfaDaysLeft({ deadline: '2026-10-20', today: '2026-10-11' }), 9);
});
test('기기 이름(원문 UA 저장 안 함)', () => {
  assert.equal(core.devLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'), 'Windows · Chrome');
  assert.equal(core.devLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0'), 'Windows · Edge');
  assert.equal(core.devLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'), 'iOS · Safari');
  assert.equal(core.devLabel('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36'), 'Android · Samsung');
});
test('토큰 해석(b64url) · HTML 이스케이프', () => {
  const b = Buffer.from(JSON.stringify({ aal: 'aal2', n: '한글' })).toString('base64url');
  assert.deepEqual(core.b64urlJson(b), { aal: 'aal2', n: '한글' });
  assert.equal(core.sessAal('x.' + b + '.y'), 'aal2'); assert.equal(core.sessAal('broken'), 'aal1');
  assert.equal(core.esc('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;'); assert.equal(core.esc(null), '');
});

test('엑셀 내보내기: 수식 주입 막기 · 원 단위 머리글', () => {
  assert.equal(grid.xlsxSafe('=SUM(A1)'), "'=SUM(A1)"); assert.equal(grid.xlsxSafe('@cmd'), "'@cmd"); assert.equal(grid.xlsxSafe('+82-10'), "'+82-10");
  assert.equal(grid.xlsxSafe('-5'), '-5'); assert.equal(grid.xlsxSafe('-12.5%'), '-12.5%'); assert.equal(grid.xlsxSafe('보통 글'), '보통 글'); assert.equal(grid.xlsxSafe(5), 5);
  assert.equal(grid.xlsxHead({ l: 'MRR(천원)', won: true }), 'MRR(원)'); assert.equal(grid.xlsxHead({ l: '총액', won: true }), '총액 (원)'); assert.equal(grid.xlsxHead({ l: '메모' }), '메모');
});
test('붙여넣기: 머리글 맞추기 · 천원→원 · 연월 · 목록 · 필수 칸 · 중복', () => {
  const cols = [{ k: 'customer', l: '고객사', req: true }, { k: 'amount', l: '금액(천원)', t: 'number', won: true }, { k: 'month', l: '월', t: 'month' }, { k: 'kind', l: '구분', t: 'select', opts: ['신규', '갱신'] }];
  const r = tools.pasteParse('고객사\t금액(천원)\t월\t구분\t메모\n가나테스트\t52.8\t2026.3\t신규\tx\n\tabc\t2026-13\t기타\n', cols);
  assert.ok(r.map); assert.deepEqual(r.skipped, ['메모']); assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows[0], { customer: '가나테스트', amount: 52800, month: '2026-03-01', kind: '신규' });
  const e = r.errs.join('\n'); assert.match(e, /숫자가 아님/); assert.match(e, /연월 형식이 아님/); assert.match(e, /목록에 없는 값/); assert.match(e, /2행 고객사: 꼭 넣어야/);
  const noHead = tools.pasteParse('다라테스트\t10', cols); assert.equal(noHead.map, null); assert.equal(noHead.rows[0].amount, 10000);
  const d = tools.pasteDups([{ customer: 'A', month: '2026-03-01' }, { customer: 'B', month: '2026-04-01' }, { customer: 'B', month: '2026-04-01' }, {}], cols.filter((c) => c.k !== 'amount' && c.k !== 'kind'), [{ customer: 'A', month: '2026-03-01T00:00:00' }]);
  assert.deepEqual(d, { old: [0], inner: [2] });
});
test('고객 찾기: 띄어쓰기 · 대소문자 무시 포함 비교', () => {
  assert.equal(tools.c360Match('(주) 테스트 상사', '테스트상사'), true); assert.equal(tools.c360Match('ABC Test', 'abctest'), true);
  assert.equal(tools.c360Match('', 'x'), false); assert.equal(tools.c360Match('가나', '다라'), false);
});

test('데이터 점검: 확인(ack) 키 — 같은 항목은 같은 키 · 내용이 바뀌면 다시 보임', () => {
  assert.equal(ana.dcHash('abc'), ana.dcHash('abc')); assert.notEqual(ana.dcHash('abc'), ana.dcHash('abd'));
  const k1 = ana.dcAckKey({ key: 'c1', label: 'L', sub: 'S' });
  assert.match(k1, /^c1\|/); assert.equal(k1, ana.dcAckKey({ key: 'c1', label: 'L', sub: 'S' }));
  assert.notEqual(k1, ana.dcAckKey({ key: 'c1', label: 'L', sub: 'S2' }));
  assert.equal(ana.dcAckKey({ key: 'c1', label: 'L', sub: 'S', ackSig: 'v1' }), ana.dcAckKey({ key: 'c1', label: 'L2', sub: 'S9', ackSig: 'v1' }));
});
test('데이터 점검: 비슷한 고객사 이름(㊿+179)', () => {
  assert.equal(ana.dcLev1('abcde', 'abxde'), true); assert.equal(ana.dcLev1('abcde', 'abcdef'), true); assert.equal(ana.dcLev1('abcde', 'axcdy'), false);
  const CU = [{ id: 1, name: '테스트전자' }, { id: 2, name: '테스트전지' }, { id: 3, name: '가가구청' }, { id: 4, name: '가나구청' },
    { id: 5, name: '샘플공장1' }, { id: 6, name: '샘플공장2' }, { id: 7, name: '모의물산' }, { id: 8, name: '모의물산솔루션' }, { id: 9, name: '알파합성', aliases: ['베타합성'] }, { id: 10, name: '베타합성' }];
  const res = ana.dcSimilar(CU), ids = res.map((x) => x.id).sort();
  assert.ok(ids.includes('1-2'), '한 글자 차이'); assert.ok(ids.includes('7-8'), '앞부분 같음'); assert.ok(ids.includes('9-10'), '별칭');
  assert.ok(!ids.includes('3-4'), '4글자 이름은 한 글자 차이로 안 묶음'); assert.ok(!ids.includes('5-6'), '숫자만 다른 것은 뺌');
});

test('만기 처리 목록 자리(renewKindOf · ㊿+183) — 만기 처리 창과 같은 기준', () => {
  const r = (o) => Object.assign({ cust: 'A', line: 'Cloud', status: '신규', endRaw: 70, startRaw: 58 }, o);
  assert.equal(ana.renewKindOf(r({ endRaw: 69 }), 70), 'lapsed'); assert.equal(ana.renewKindOf(r({ endRaw: 70 }), 70), 'due'); assert.equal(ana.renewKindOf(r({ endRaw: 71 }), 70), 'next');
  assert.equal(ana.renewKindOf(r({ endRaw: 72 }), 70), null); assert.equal(ana.renewKindOf(r({ endRaw: 45 }), 70), null);   // 24개월 넘게 지난 것은 목록 밖
  assert.equal(ana.renewKindOf(r({ endRaw: 70, autoRenew: true }), 70), null); assert.equal(ana.renewKindOf(r({ endRaw: 70, status: '해지' }), 70), null);
  assert.equal(ana.renewKindOf(r({ endRaw: 70, parent: 5 }), 70), null); assert.equal(ana.renewKindOf(r({ endRaw: 70, liveOv: '제외' }), 70), null);
});
test('대시보드 합계(행 × 월 금액)', () => {
  ST.M = 3; ST.MAT = [[100, 200, 0], [50, 0, 0], [0, 300, 400]];
  ST.DATA = /** @type {any} */ ({ rows: [{ cust: 'A', line: 'Cloud', csm: 'x' }, { cust: 'A', line: 'MDR', csm: 'y' }, { cust: 'B', line: 'Cloud', csm: '' }], lines: [{ label: 'Cloud' }, { label: 'MDR' }], monthKeys: ['2026-08', '2026-09', '2026-10'] });
  assert.equal(dash.monthlyTotal([0, 1, 2], 1), 500); assert.deepEqual(dash.monthlySeries([0, 1, 2]), [150, 500, 400]);
  assert.equal(dash.rangeSum([0, 2], 0, 9), 1000); assert.equal(dash.activeCustomers([0, 1, 2], 0), 1); assert.equal(dash.activeCustomers([0, 1, 2], 1), 2);
  assert.deepEqual(dash.monthlyByLine([0, 1, 2]), { Cloud: [100, 500, 400], MDR: [50, 0, 0] });
  assert.deepEqual(dash.groupSum([0, 1, 2], 'csm', 2), [{ name: '미지정', v: 400 }]);
  assert.deepEqual(dash.groupCount([0, 1, 2], 'cust'), [{ name: 'A', v: 2 }, { name: 'B', v: 1 }]);
  assert.equal(core.yOf(2), 2026); assert.equal(core.monOf(1), 9); assert.equal(core.mkLabel(0), '26.08');
});
test('계약 상태 묶기 · 색 바탕 글자색', () => {
  assert.equal(dash.statusOf({ status: '해지 예정' }), '해지'); assert.equal(dash.statusOf({ status: '서비스 종료' }), '서비스 종료'); assert.equal(dash.statusOf({ status: '갱신' }), '재약정');
  assert.equal(dash.statusOf({ status: '신규' }), '신규'); assert.equal(dash.statusOf({}), '기타'); assert.equal(dash.statusOf({ status: '보류' }), '보류');
  assert.equal(dash.inkOn('#ffff00'), '#111'); assert.equal(dash.inkOn('#1e3a8a'), '#fff'); assert.equal(dash.inkOn('rgb(255, 255, 255)'), '#111'); assert.equal(dash.inkOn('var(--x)'), '#fff');
});
