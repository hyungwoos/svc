// export Edge Function 테스트 — deno run -A tests/fn/export.test.ts
//   DB(REST · rpc/api_key_auth)는 전부 가짜(가상 고객명). 키 검사(없음·형식·모름·폐기·만료·분당 한도) · 범위(403) · 고객사명 옵션 · 내부 칸 제외
//   · 필터(updated_since · line · status · contract_id · 기간) · 페이지(limit·offset·next_offset) · CSV(BOM · 수식 글자) · 호출 기록 · ?key= 거부
import { installFetch, loadFn, ok, report, J, realFetch } from './_mock.ts';

const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, '0')).join('');
const K_ALL = 'svc_' + 'a'.repeat(64), K_REV = 'svc_' + 'b'.repeat(64), K_OLD = 'svc_' + 'c'.repeat(64), K_OFF = 'svc_' + 'd'.repeat(64), K_BUSY = 'svc_' + 'e'.repeat(64), K_UNK = 'svc_' + 'f'.repeat(64);
const KEYS: Record<string, any> = {
  [await sha(K_ALL)]: { id: 1, name: '가상 ERP', scopes: ['contracts', 'revenue', 'customers', 'mrr', 'poc', 'orders', 'assets'], opts: { names: true }, expires_at: '2027-10-08T00:00:00Z' },
  [await sha(K_REV)]: { id: 2, name: '가상 BI', scopes: ['revenue', 'customers', 'mrr', 'assets'], opts: { names: false }, expires_at: null },
  [await sha(K_OLD)]: { id: 3, name: '옛 시스템', bad: 'expired', expires_at: '2026-01-01T00:00:00Z' },
  [await sha(K_OFF)]: { id: 4, name: '끊은 시스템', bad: 'revoked' },
  [await sha(K_BUSY)]: { id: 5, name: '바쁜 시스템', bad: 'rate' },
};
const CUST = [{ id: 10, name: '가상고객01', industry: '제조', sector: 'IT' }, { id: 11, name: '=가상고객02', industry: '공공', sector: null }];
const CT = [1, 2, 3, 4, 5].map((i) => ({ id: 100 + i, customer_id: i % 2 ? 10 : 11, line: i <= 3 ? 'Cloud' : 'MDR', version: 'V6.0', channel: '일반', partner: '파트너A', biller: null, billing: '월납입',
  contract_type: i === 1 ? '재약정' : '신규', status: i === 1 ? '재약정' : '신규', start_month: '2025-0' + i + '-01', end_month: '2027-0' + i + '-01', term_months: 24, mrr: 100000 * i, qty: 10 * i, install_fee: null,
  renew_count: i === 1 ? 1 : 0, auto_renew: false, parent_contract_id: null, churn_reason: null, churn_month: null, csm: 'site' + i, s1_no: null, updated_at: '2026-10-0' + i + 'T00:00:00Z',
  note: '내부 비고 ' + i, renew_history: [{ no: 1 }], live_override_note: '메모' }));
const POC = [
  { id: 1, apply_date: '2026-09-10', created_at: '2026-09-10T01:00:00Z', svc_type: 'CLOUD', customer: '가상고객_PoC1', status: '데모', channel: '파트너', license: 'EDR', plan_qty: 100, agents_total: 40, agents_win: 38, agents_mac: 2, agents_linux: 0,
    mod_edr: true, mod_ransom: true, mod_av: false, mod_media: false, start_date: '2026-09-15', sales_name: '영업A', mgr_name: '고객담당 홍길동', mgr_phone: '010-0000-0000', progress: '내부 진행 메모', note: '비고', requester: '신청자' },
  { id: 2, apply_date: '2026-10-02', created_at: '2026-10-02T01:00:00Z', svc_type: 'IDC 상면', customer: '가상고객_PoC2', status: '구독', channel: '직접', license: 'EDR+AV', plan_qty: 300, agents_total: 290, mod_edr: true, mod_av: true, mgr_phone: '010-1111-1111' },
  { id: 3, apply_date: '2026-10-05', created_at: '2026-10-05T01:00:00Z', svc_type: 'CLOUD', customer: '가상고객_PoC3', status: '신청', channel: '파트너', plan_qty: 50 },
];
const ORD = [{ id: 7, created_at: '2026-10-01T00:00:00Z', channel: '일반', order_type: '신규발주', customer: '가상고객01', contract_no: 'C-1', model: 'GPI-100', qty: 2, status: '설치완료', serials: 'S1,S2',
  recv_name: '수령인 김', recv_phone: '010-2222-2222', recv_addr: '서울시 어딘가', mgr_name: '담당 이', request_note: '요청사항 메모' }];
const AST = [{ id: 1, serial: 'S1', model: 'GPI-100', usage: '임대', status: '임대중', customer: '가상고객01', channel: '일반', deployed_date: '2026-10-03', order_id: 7, note: '비고 메모', updated_at: '2026-10-03T00:00:00Z' },
  { id: 2, serial: 'S9', model: 'GPI-200', usage: '임대', status: '재고', customer: null, channel: null, updated_at: '2026-09-01T00:00:00Z' }];
function eqF(a: any[], q: URLSearchParams, skip: string[] = []) {
  for (const [k, v] of q.entries()) {
    if (['select', 'order', 'limit', 'offset', ...skip].includes(k)) continue;
    if (v.startsWith('eq.')) a = a.filter((r) => String(r[k]) === v.slice(3));
    else if (v.startsWith('in.(')) { const set = v.slice(4, -1).split(','); a = a.filter((r) => set.includes(String(r[k]))); }
    else if (v.startsWith('gte.')) a = a.filter((r) => r[k] && new Date(r[k]).getTime() >= new Date(v.slice(4)).getTime());
  }
  return a;
}
const REV: any[] = []; for (const c of CT) for (let m = 1; m <= 12; m++) REV.push({ contract_id: c.id, month: '2026-' + String(m).padStart(2, '0') + '-01', amount: c.mrr });
const authBodies: any[] = [], patches: any[] = [], restUrls: string[] = []; let authCalls = 0, logSeq = 0, failContracts = false;
const CAP = 7;   // PostgREST max_rows 흉내 — 함수는 EXPORT_PAGE=7 로 나눠 읽어야 함
function qOf(url: string) { return new URL(url).searchParams; }
function rangeRes(all: any[], q: URLSearchParams, cols?: string[]) {
  const lim = Number(q.get('limit') || 1e9), off = Number(q.get('offset') || 0), sel = (q.get('select') || '*').split(',');
  const rows = all.slice(off, off + Math.min(lim, CAP)).map((r) => (sel[0] === '*' ? r : Object.fromEntries(sel.map((k) => [k, r[k]]))));
  return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json', 'content-range': `${off}-${off + rows.length - 1}/${all.length}` } });
}
installFetch(async (url, method, body, init) => {
  const h = (init?.headers || {}) as Record<string, string>;
  if (h.apikey !== 'svc' || h.Authorization !== 'Bearer svc') return J({ message: 'Conflicting API keys' }, 401);
  if (url.includes('/rpc/api_key_auth')) { authCalls++; const b = JSON.parse(body || '{}'); authBodies.push(b); const k = KEYS[b.p_hash]; return J(k ? (k.bad ? k : { ...k, log_id: ++logSeq }) : null); }
  if (url.includes('/rpc/api_mrr')) { const b = JSON.parse(body || '{}'); const g = new Map<string, any>();
    for (const r of REV) { if (r.month < b.p_from || r.month > b.p_to) continue; const ln = CT.find((c) => c.id === r.contract_id)?.line || '기타', k = r.month.slice(0, 7) + '|' + ln; const x = g.get(k) || { month: r.month.slice(0, 7), line: ln, amount: 0, ids: new Set() }; x.amount += r.amount; x.ids.add(r.contract_id); g.set(k, x); }
    return J([...g.values()].map((x) => ({ month: x.month, line: x.line, amount: x.amount, contracts: x.ids.size }))); }
  if (url.includes('/rest/v1/api_access_log') && method === 'PATCH') { patches.push({ id: Number(/id=eq\.(\d+)/.exec(url)?.[1]), ...JSON.parse(body || '{}') }); return new Response('', { status: 204 }); }
  if (url.includes('/rest/v1/api_access_log')) return J({ message: '기록은 api_key_auth 가 만들고 함수는 PATCH 만' }, 400);
  restUrls.push(url);
  const q = qOf(url);
  if (url.includes('/rest/v1/customers')) { const inn = /^in\.\((.*)\)$/.exec(q.get('id') || ''); return rangeRes(inn ? CUST.filter((c) => inn[1].split(',').map(Number).includes(c.id)) : CUST, q); }
  if (url.includes('/rest/v1/contracts')) {
    let a = CT.slice(); const raw = new URL(url).search;
    for (const [k, v] of q.entries()) {
      if (k === 'line') a = a.filter((c) => 'eq.' + c.line === v);
      if (k === 'status') a = a.filter((c) => 'eq.' + c.status === v);
      if (k === 'updated_at') a = a.filter((c) => c.updated_at >= v.replace(/^gte\./, '').replace('.000Z', 'Z'));
    }
    if (/select=.*note/.test(raw)) return J({ message: 'note 를 읽으면 안 됨' }, 400);
    if (failContracts) return J({ message: 'relation secret_table 비밀 내부 오류' }, 500);
    return rangeRes(a, q);
  }
  if (url.includes('/rest/v1/mdr_ops')) return rangeRes(eqF(POC, q), q);
  if (url.includes('/rest/v1/equipment_orders')) return rangeRes(eqF(ORD, q), q);
  if (url.includes('/rest/v1/equipment_assets')) return rangeRes(eqF(AST, q), q);
  if (url.includes('/rest/v1/monthly_revenue')) {
    let a = REV.slice(); const ms = q.getAll('month');
    for (const m of ms) { if (m.startsWith('gte.')) a = a.filter((r) => r.month >= m.slice(4)); if (m.startsWith('lte.')) a = a.filter((r) => r.month <= m.slice(4)); }
    if (q.get('contract_id')) a = a.filter((r) => 'eq.' + r.contract_id === q.get('contract_id'));
    return rangeRes(a, q);
  }
  return undefined;
});
Deno.env.set('SUPABASE_URL', 'https://mock.supabase.co'); Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'svc'); Deno.env.set('EXPORT_PAGE', String(CAP));
await loadFn('export');
async function get(path: string, key: string | null = K_ALL, opt: { auth?: boolean; method?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...(opt.headers || {}) }; if (key) { if (opt.auth) headers.authorization = 'Bearer ' + key; else headers['x-api-key'] = key; }
  const r = await realFetch('http://127.0.0.1:8000/export' + path, { method: opt.method || 'GET', headers });
  const b = new Uint8Array(await r.arrayBuffer()), t = new TextDecoder('utf-8', { ignoreBOM: true }).decode(b); let j: any = null; try { j = JSON.parse(t); } catch { j = null; }
  return { status: r.status, j, t, h: r.headers, bom: b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf };
}

console.log('export 함수');
{ const r = await get('/contracts', null); ok(r.status === 401 && /X-API-Key/.test(r.j.error), '키 없음 → 401 · 헤더 안내', r.j?.error); }
{ const n = authCalls; const r = await get('/contracts', 'svc_123'); ok(r.status === 401 && /형식/.test(r.j.error) && authCalls === n, '형식이 다른 키 → 401 · DB 에 안 감(마구 보내도 기록이 안 불어남)', r.j?.error); }
{ const r = await get('/contracts', K_UNK); ok(r.status === 401 && /등록되지 않은/.test(r.j.error), '모르는 키 → 401', r.j?.error); }
{ const r = await get('/contracts', K_OLD); ok(r.status === 401 && /만료/.test(r.j.error) && /2026-01-01/.test(r.j.error), '만료된 키 → 401 · 만료일', r.j?.error); }
{ const r = await get('/contracts', K_OFF); ok(r.status === 401 && /폐기/.test(r.j.error), '폐기된 키 → 401', r.j?.error); }
{ const r = await get('/contracts', K_BUSY); ok(r.status === 429 && r.h.get('retry-after') === '60', '분당 한도 → 429 · Retry-After', r.j?.error); }
{ const n = authCalls; const r = await realFetch('http://127.0.0.1:8000/export/contracts?key=' + K_ALL); const j = await r.json(); ok(r.status === 400 && /헤더/.test(j.error) && authCalls === n, '?key= 로 보낸 키는 쓰지 않음 → 400', j.error); }
{ const r = await get('/contracts', K_ALL, { method: 'POST' }); ok(r.status === 405, 'POST → 405 (읽기 전용)', r.status); }
{ const r = await get(''); ok(r.status === 200 && r.j.ok && r.j.key.name === '가상 ERP' && r.j.resources.length === 7 && r.j.resources.every((x: any) => x.allowed) && r.j.units.amount === '원' && /functions\/v1\/export\/contracts$/.test(r.j.resources[0].url), '/export → 키 정보 · 자료 7개 · 단위', r.j?.resources?.[0]); }
{ const r = await get('/', K_REV); ok(r.status === 200 && r.j.resources.find((x: any) => x.name === 'contracts').allowed === false, '범위 밖 자료는 allowed:false', r.j?.key); }
{ const r = await get('/contracts', K_REV); ok(r.status === 403 && /contracts/.test(r.j.error) && /revenue/.test(r.j.error), '범위 밖 → 403 · 허용 목록', r.j?.error); }
{ const r = await get('/nope'); ok(r.status === 404 && /contracts/.test(r.j.error), '모르는 자료 → 404', r.j?.error); }
{ const r = await get('/contracts', K_ALL, { auth: true }); ok(r.status === 200 && r.j.count === 5, 'Authorization: Bearer svc_… 도 됨', r.j?.count); }
{
  const r = await get('/contracts'); const c = r.j.data[0];
  ok(r.status === 200 && r.j.count === 5 && r.j.total === 5 && r.j.next_offset === null, '계약 5건 · total · next_offset 없음', { count: r.j.count, total: r.j.total });
  ok(c.customer === '가상고객01' && c.line_label === 'Cloud NAC' && c.start_month === '2025-01' && c.end_month === '2027-01' && c.mrr === 100000 && c.contract_type === '재약정', '계약 칸: 고객사명 · 서비스 이름 · YYYY-MM · 원', c);
  ok(!('note' in c) && !('renew_history' in c) && !('live_override_note' in c), '비고·연장 이력·LIVE 메모는 안 나감', Object.keys(c));
}
{ const r = await get('/contracts?line=MDR'); ok(r.j.count === 2 && r.j.data.every((c: any) => c.line === 'MDR'), 'line=MDR', r.j.count); }
{ const r = await get('/contracts?status=' + encodeURIComponent('재약정')); ok(r.j.count === 1 && r.j.data[0].id === 101, 'status=재약정', r.j.count); }
{ const r = await get('/contracts?updated_since=2026-10-04'); ok(r.j.count === 2 && r.j.data.map((c: any) => c.id).join() === '104,105', 'updated_since=2026-10-04 → 4·5일 바뀐 것만', r.j.data.map((c: any) => c.id)); }
{ const r = await get('/contracts?updated_since=어제'); ok(r.status === 400 && /updated_since/.test(r.j.error), 'updated_since 잘못 → 400', r.j?.error); }
{ const r = await get('/contracts?line=Cloud%27%3B'); ok(r.status === 400, 'line 에 이상한 글자 → 400', r.j?.error); }
{ const r = await get('/contracts?limit=2&offset=2'); ok(r.j.count === 2 && r.j.data[0].id === 103 && r.j.next_offset === 4 && r.j.total === 5, '페이지: limit 2 · offset 2 → next_offset 4', { n: r.j.next_offset }); }
{ const r = await get('/contracts?limit=99999'); ok(r.status === 400 && /limit/.test(r.j.error), 'limit 5000 초과 → 400', r.j?.error); }
{ const r = await get('/revenue?from=2026-10&to=2026-12', K_REV); ok(r.status === 200 && r.j.count === 15 && r.j.from === '2026-10' && r.j.data[0].month === '2026-10' && typeof r.j.data[0].amount === 'number', '월 매출 3개월 × 5계약 = 15', { n: r.j.count, d: r.j.data[0] }); }
{ const r = await get('/revenue?from=2026-01&to=2026-12&contract_id=103', K_REV); ok(r.j.count === 12 && r.j.data.every((x: any) => x.contract_id === 103 && x.amount === 300000), 'contract_id=103 · 12개월', r.j.count); }
{ const r = await get('/revenue?from=2026-13', K_REV); ok(r.status === 400 && /YYYY-MM/.test(r.j.error), 'from 형식 → 400', r.j?.error); }
{ const r = await get('/revenue?from=2010-01&to=2026-12', K_REV); ok(r.status === 400 && /120/.test(r.j.error), '120개월 넘음 → 400', r.j?.error); }
{ const r = await get('/customers', K_REV); ok(r.j.count === 2 && !('name' in r.j.data[0]) && r.j.data[0].industry === '제조', '고객사명 옵션 끔 → 이름 없음', r.j.data[0]); }
{ const r = await get('/customers'); ok(r.j.data[0].name === '가상고객01', '고객사명 옵션 켬 → 이름', r.j.data[0]); }
{ const r = await get('/mrr?month=2026-10', K_REV); const d = r.j.data[0]; ok(r.status === 200 && d.month === '2026-10' && d.total === 1500000 && d.by_line.Cloud === 600000 && d.by_line.MDR === 900000 && d.contracts === 5, 'mrr 2026-10: 합계 1,500,000 · Cloud 600,000 · MDR 900,000', d); }
{ const r = await get('/mrr?from=2026-11&to=2026-12', K_REV); ok(r.j.data.length === 2 && r.j.data[1].month === '2026-12', 'mrr 기간 2개월', r.j.data.map((x: any) => x.month)); }
{
  const r = await get('/customers?format=csv'); const lines = r.t.replace(/^﻿/, '').trim().split('\r\n');
  ok(r.status === 200 && /text\/csv/.test(r.h.get('content-type') || '') && r.bom && lines[0] === 'id,name,industry,sector' && lines.length === 3, 'CSV: BOM · 머리글 · 2행', lines);
  ok(lines[2].startsWith("11,'=가상고객02"), 'CSV: = 로 시작하는 글자는 \' 를 붙임(엑셀 수식 방지)', lines[2]);
}
{ const r = await get('/mrr?month=2026-10&format=csv', K_REV); const lines = r.t.trim().split('\r\n'); ok(lines[0].replace(/^﻿/, '') === 'month,line,line_label,amount' && lines.some((l) => l === '2026-10,_total,합계,1500000'), 'mrr CSV: 월 × 서비스 + 합계 줄', lines.slice(0, 4)); }
{ const r = await get('/contracts?format=xml'); ok(r.status === 400 && /csv/.test(r.j.error), 'format 잘못 → 400', r.j?.error); }
{
  const r = await get('/poc'); const d = r.j.data[0], all = JSON.stringify(r.j.data);
  ok(r.status === 200 && r.j.count === 3 && d.customer === '가상고객_PoC1' && d.status === '데모' && d.plan_qty === 100 && d.agents_total === 40 && d.modules.join('+') === 'EDR+랜섬웨어', 'poc: 3건 · 상태 · 수량 · 설치 수 · 모듈 이름', d);
  ok(!/010-|홍길동|내부 진행|비고|신청자/.test(all) && !('mgr_phone' in d) && !('progress' in d) && !('note' in d), 'poc: 고객 담당자·연락처·진행 메모·비고·신청자 안 나감', Object.keys(d));
}
{ const r = await get('/poc?status=' + encodeURIComponent('신청,대기,진행중,데모')); ok(r.j.count === 2 && r.j.data.map((x: any) => x.id).join() === '1,3', 'poc status 여러 개(in) → PoC 단계만', r.j.data.map((x: any) => x.status)); }
{ const r = await get('/poc?since=2026-10-01&svc_type=CLOUD'); ok(r.j.count === 1 && r.j.data[0].id === 3, 'poc since(신청일) + svc_type', r.j.data.map((x: any) => x.id)); }
{ const r = await get('/poc?status=' + encodeURIComponent('데모),or=(id.gt.0')); ok(r.status === 400, 'poc status 에 괄호·쉼표 꼼수 → 400', r.j?.error); }
{ const r = await get('/poc?mgr_phone=eq.010'); ok(r.status === 400 && /모르는 조건/.test(r.j.error), 'poc: 모르는 조건(칸 이름으로 거르기) → 400', r.j?.error); }
{ const r = await get('/poc', K_REV); ok(r.status === 403, 'poc 범위 없는 키 → 403', r.j?.error); }
{
  const r = await get('/orders?status=' + encodeURIComponent('설치완료')); const d = r.j.data[0], all = JSON.stringify(r.j.data);
  ok(r.status === 200 && r.j.count === 1 && d.model === 'GPI-100' && d.qty === 2 && d.serials === 'S1,S2' && d.customer === '가상고객01', 'orders: 신청 · 모델 · 수량 · 시리얼', d);
  ok(!/수령인|010-|서울시|요청사항|담당 이/.test(all), 'orders: 수령인·연락처·주소·담당자·요청사항 안 나감', Object.keys(d));
}
{ const r = await get('/assets?status=' + encodeURIComponent('임대중'), K_REV); const d = r.j.data[0]; ok(r.status === 200 && r.j.count === 1 && d.serial === 'S1' && !('customer' in d) && !('note' in d) && d.deployed_date === '2026-10-03', 'assets: 임대중 1대 · 고객사명 옵션 끔 → customer 없음 · 비고 없음', d); }
{ const r = await get('/assets?updated_since=2026-10-01'); ok(r.j.count === 1 && r.j.data[0].customer === '가상고객01', 'assets updated_since · 고객사명 켬', r.j.data.map((x: any) => x.serial)); }
{ const r = await get('/poc?format=csv&status=' + encodeURIComponent('데모')); const ls = r.t.trim().split('\r\n'); ok(/,EDR\+랜섬웨어$/.test(ls[1]), 'poc CSV: 모듈은 EDR+랜섬웨어', ls[1]?.slice(-30)); }
{ const r = await get('/assets?format=csv'); const ls = r.t.trim().split('\r\n'); ok(r.bom && ls[0] === 'id,serial,model,usage,status,customer,channel,deployed_date,order_id,updated_at' && ls.length === 3, 'assets CSV', ls[0]); }
{ const r = await get('/revenue?from=2026-01&to=2026-12&limit=30', K_REV); ok(r.j.count === 30 && r.j.total === 60 && r.j.next_offset === 30 && new Set(r.j.data.map((x: any) => x.month + x.contract_id)).size === 30, 'limit 30 > 서버 한 번 최대(7) → 나눠 읽어 30행 · next_offset 30', { n: r.j.count, next: r.j.next_offset }); }
{ restUrls.length = 0; const r = await get('/contracts?limit=3'); ok(r.j.count === 3 && restUrls.some((u) => /customers\?select=id,name&id=in\.\(10,11\)/.test(decodeURIComponent(u))) && !restUrls.some((u) => /customers\?select=id,name&order/.test(u)), '고객사 이름은 이 쪽 계약 것만 읽음 (전체 표 안 읽음)', restUrls.filter((u) => /customers/.test(u)).map((u) => decodeURIComponent(u).slice(28, 90))); }
{ const r = await get('/revenue?from=0000-01&to=0000-12', K_REV); ok(r.status === 400 && /YYYY-MM/.test(r.j.error), '0000년 → 400 (DB 오류 안 냄)', r.j?.error); }
{ const r = await get('/contracts?updated_since=' + encodeURIComponent('12/31/20000')); ok(r.status === 400 && /2000~2100/.test(r.j.error), 'updated_since 20000년 → 400', r.j?.error); }
{ failContracts = true; const r = await get('/contracts'); failContracts = false; ok(r.status === 502 && !/secret_table|비밀/.test(r.t) && /잠시 뒤/.test(r.j.error), 'DB 오류 내용은 밖으로 안 나감 (502 · 일반 문구)', r.j?.error); }
{ authBodies.length = 0; await get('/contracts?a=%00b%01&limit=1'); const b = authBodies[0]; ok(b && !/[\u0000-\u001f]/.test(b.p_query) && b.p_query === 'a=b&limit=1' && b.p_resource === 'contracts', 'NUL·제어 문자는 기록에서 뺌 (DB 가 기록을 거부해 한도를 피하던 것)', b?.p_query); }
{ authBodies.length = 0; await get('/contracts?limit=1', K_ALL, { headers: { 'x-forwarded-for': '6.6.6.6, 198.51.100.7' } }); await get('/contracts?limit=1', K_ALL, { headers: { 'x-forwarded-for': '6.6.6.6', 'cf-connecting-ip': '203.0.113.5' } }); await get('/contracts?limit=1', K_ALL, { headers: { 'x-forwarded-for': '<script>' } });
  ok(authBodies.map((b) => b.p_ip).join('|') === '198.51.100.7|203.0.113.5|', 'IP: 게이트웨이 헤더 먼저 · X-Forwarded-For 는 마지막 · 이상한 값은 비움', authBodies.map((b) => b.p_ip)); }
{
  const okP = patches.find((x) => x.status === 200 && x.rows === 5); ok(okP && okP.id > 0 && typeof okP.ms === 'number', '통과한 호출: DB 가 만든 기록 줄(log_id)에 결과(status·rows·ms)를 채움', okP);
  ok(patches.some((x) => x.status === 403) && patches.some((x) => x.status === 400) && patches.some((x) => x.status === 502), '거부·오류도 그 줄에 결과', [...new Set(patches.map((x) => x.status))]);
  const ab = authBodies.concat(); ok(!JSON.stringify(ab).includes('a'.repeat(64)) && !JSON.stringify(patches).includes('a'.repeat(64)), '기록·DB 요청에 키 원문 없음 (해시만)');
  const bad = await get('/contracts', K_OFF); ok(bad.status === 401 && !patches.some((x) => x.id === 0), '폐기된 키: 함수는 기록 안 씀 (DB 함수가 1분에 한 줄)', bad.status);
}
report('export');
