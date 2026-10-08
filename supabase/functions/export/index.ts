// ============================================================================
//  Supabase Edge Function: export  (v1.1 · 2026-10-08 · v1.1 = MDR PoC·운영 · 장비 신청 · 장비 현황 추가)
//   외부 시스템이 포탈 데이터를 «읽기 전용»으로 가져가는 API — 시스템마다 API 키 (관리자 › 🔌 외부 연동에서 발급 · SQL 102)
//   호출: GET https://<프로젝트>.supabase.co/functions/v1/export/<자료>?…   헤더 X-API-Key: svc_…  (또는 Authorization: Bearer svc_…)
//     /export              이 키로 볼 수 있는 자료 · 단위 · 사용법
//     /export/contracts    계약 — updated_since(날짜/시각) · line · status · limit(≤5000) · offset
//     /export/revenue      월 매출 — from · to (YYYY-MM · 기본 최근 12개월 · 최대 120개월) · contract_id · limit · offset
//     /export/customers    고객사 — limit · offset
//     /export/mrr          월 매출 합계(포탈 «월 MRR»과 같은 원천) — month 또는 from~to · 서비스별
//     /export/poc          MDR PoC·운영 내역 — status(쉼표로 여러 개: 신청,대기,진행중,데모 = PoC 단계 · 구독 · 종료) · svc_type · since(신청일 기준)
//     /export/orders       임대 장비 신청 — status · channel · order_type · since(신청일)
//     /export/assets       임대 장비 현황(시리얼 단위) — status · model · usage · channel · updated_since
//     ?format=csv          CSV(엑셀에서 바로 열리게 BOM) · 기본 JSON
//   금액 단위: 원 · 월: YYYY-MM
//   보안: 키 원문은 DB 에 없음(SHA-256 만 · 발급할 때 한 번만 보여 줌) · 범위(scopes) 밖 403 · 만료·폐기 401 · 분당 60회 429(DB 에서 키 행을 잠그고 셈 — 동시 호출로 못 넘음)
//         모든 호출은 api_access_log 에 남음 · 비고·연장 이력·LIVE 예외 메모 같은 내부 칸은 내보내지 않음 · 고객사명은 키 옵션(names)
//         키는 주소(?key=)로 받지 않음 — 서버 로그·브라우저 기록에 남기 때문. CORS 헤더 없음(서버끼리 호출용)
//   ★ 배포: 포탈 › 배포·운영 › Edge Function › ＋ 새 함수 «export» · Verify JWT 끔 (외부 시스템에는 Supabase 로그인 토큰이 없음 — 이 함수가 API 키를 직접 검사)
// ============================================================================
export const VERSION = 'export v1.1';
const SB_URL = Deno.env.get('SUPABASE_URL') || '';
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
export const RATE_PER_MIN = 60;
const DEF_LIMIT = 1000, MAX_LIMIT = 5000;
const PAGE = Math.max(1, Number(Deno.env.get('EXPORT_PAGE') || 1000));   // PostgREST 한 번에 최대 행(Supabase 기본 max_rows 1000) — 이보다 큰 limit 은 여러 번 나눠 읽음
export const RESOURCES = ['contracts', 'revenue', 'customers', 'mrr', 'poc', 'orders', 'assets'];
const LINE: Record<string, string> = { Cloud: 'Cloud NAC', S1: 'S1 Cloud NAC', MDR: 'MDR', MDR_S1: 'S1 MDR', PNS: 'PNS', DRM: 'DRM', DLP: 'DLP' };
/* 계약에서 내보내는 칸 — note(비고) · renew_history · live_override(_note) · combine · lead_src 는 내부용이라 뺌 */
export const CT_COLS = ['id', 'customer_id', 'line', 'version', 'channel', 'partner', 'biller', 'billing', 'contract_type', 'status', 'start_month', 'end_month', 'term_months',
  'mrr', 'qty', 'install_fee', 'renew_count', 'auto_renew', 'parent_contract_id', 'churn_reason', 'churn_month', 'csm', 's1_no', 'updated_at'];

/* v1.1 PoC·장비 — 표의 칸이 바뀌어도 깨지지 않게 select=* 로 읽고 아래 칸만 내보냄
   빼는 것: 고객 담당자 이름·연락처(mgr_name · mgr_phone) · 수령인·주소·연락처(recv_*) · 진행 내역·요청사항·비고(progress · request_note · note) · 신청자 */
export const POC_COLS = ['id', 'apply_date', 'created_at', 'svc_type', 'customer', 'status', 'channel', 'license', 'plan_qty', 'agents_total', 'agents_win', 'agents_mac', 'agents_linux',
  'mod_edr', 'mod_ransom', 'mod_av', 'mod_media', 'start_date', 'end_date', 'on_rev_sheet', 'sales_name', 'updated_at'];
export const ORD_COLS = ['id', 'created_at', 'channel', 'order_type', 'customer', 'contract_no', 'install_date', 'ship_date', 'edition', 'nodes', 'model', 'qty', 'standalone_pod',
  'status', 'serials', 'returned_date', 'returned_serials', 'updated_at'];
export const AST_COLS = ['id', 'serial', 'model', 'usage', 'status', 'customer', 'channel', 'partner', 'in_date', 'deployed_date', 'returned_date', 'order_id', 'updated_at'];
const MODS: [string, string][] = [['mod_edr', 'EDR'], ['mod_ransom', '랜섬웨어'], ['mod_av', '백신'], ['mod_media', '매체제어']];
type Key = { id: number; name: string; scopes: string[]; opts: { names?: boolean }; expires_at: string | null };
class HttpErr extends Error { constructor(public status: number, msg: string) { super(msg); } }

const svcHdr = (): Record<string, string> => ({ apikey: SB_SVC, Authorization: 'Bearer ' + SB_SVC, 'Content-Type': 'application/json' });   // 새 sb_secret 키도 두 헤더가 같아야 함(aicheck v1.5)
async function fetchT(url: string, opt: RequestInit = {}, ms = 20000): Promise<Response> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opt, signal: ctl.signal }); } finally { clearTimeout(t); }
}
/** REST 읽기 — {rows, total}(Content-Range) */
async function restGet(path: string, count = false): Promise<{ rows: any[]; total: number | null }> {
  const h = svcHdr(); if (count) h.Prefer = 'count=exact';
  const r = await fetchT(SB_URL + '/rest/v1/' + path, { headers: h });
  if (!r.ok) { console.error('export REST', r.status, path.slice(0, 120), (await r.text()).slice(0, 300)); throw new HttpErr(502, 'DB 읽기 실패 — 잠시 뒤 다시 (계속되면 포탈 관리자에게)'); }
  const rows = await r.json(); const cr = r.headers.get('content-range') || ''; const m = /\/(\d+)$/.exec(cr);
  return { rows: Array.isArray(rows) ? rows : [], total: m ? Number(m[1]) : null };
}
async function rpc(name: string, body: unknown): Promise<any> {
  const r = await fetchT(SB_URL + '/rest/v1/rpc/' + name, { method: 'POST', headers: svcHdr(), body: JSON.stringify(body) });
  if (!r.ok) { console.error('export RPC', name, r.status, (await r.text()).slice(0, 300)); throw new HttpErr(r.status === 404 ? 503 : 502, r.status === 404 ? 'API 설정이 아직 없습니다 (포탈 관리자: SQL 102 실행)' : 'DB 오류 — 잠시 뒤 다시'); }
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
export async function sha256hex(s: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
export const KEY_RE = /^svc_[0-9a-f]{64}$/;
const YM_RE = /^(20\d\d|2100)-(0[1-9]|1[0-2])$/;   // 2000-01 ~ 2100-12 (DB 가 못 읽는 해를 막음)
/** 기록에 들어갈 글 — 제어 문자(NUL 등) 빼고 길이 제한 (NUL 이 들어가면 DB 가 기록을 거부해 한도·기록을 피할 수 있었음) */
export const clean = (s: unknown, n: number) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, n);
/** 호출한 곳 IP — 게이트웨이가 넣는 헤더 먼저(cf-connecting-ip · x-real-ip) · 없으면 X-Forwarded-For 의 마지막(클라이언트가 앞에 아무 값이나 넣을 수 있음) */
export function ipOf(req: Request): string {
  const xs = (req.headers.get('x-forwarded-for') || '').split(',').map((x) => x.trim()).filter(Boolean);
  const v = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || xs[xs.length - 1] || '';
  return /^[0-9A-Fa-f:.]{3,45}$/.test(v) ? v : '';
}
const ym = (d: unknown) => (d ? String(d).slice(0, 7) : null);
const ymIdx = (s: string) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) - 1;
const idxYm = (i: number) => Math.floor(i / 12) + '-' + String((i % 12) + 1).padStart(2, '0');
function kstYm(): string { const d = new Date(Date.now() + 9 * 3600 * 1000); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); }
function intParam(p: URLSearchParams, k: string, def: number, min: number, max: number): number {
  const v = p.get(k); if (v == null || v === '') return def;
  if (!/^\d+$/.test(v)) throw new HttpErr(400, k + ' 는 0 이상의 정수여야 합니다');
  const n = Number(v); if (n < min || n > max) throw new HttpErr(400, k + ' 는 ' + min + '~' + max + ' 사이여야 합니다'); return n;
}
function ymParam(p: URLSearchParams, k: string): string | null {
  const v = p.get(k); if (v == null || v === '') return null;
  if (!YM_RE.test(v)) throw new HttpErr(400, k + ' 는 YYYY-MM 형식이어야 합니다 (예: 2026-10)'); return v;
}
/** CSV — 엑셀용 BOM · 따옴표 처리 · 수식으로 읽힐 수 있는 글자(= + - @)로 시작하는 «문자열»은 ' 를 붙임 */
export function toCsv(rows: Record<string, unknown>[]): string {
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const esc = (v: unknown) => {
    if (v == null) return '';
    let s = Array.isArray(v) ? v.join('+') : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n') + '\r\n';
}
const jres = (b: unknown, s = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });

function page(p: URLSearchParams) { return { limit: intParam(p, 'limit', DEF_LIMIT, 1, MAX_LIMIT), offset: intParam(p, 'offset', 0, 0, 10_000_000) }; }
/** limit 만큼 PAGE 씩 나눠 읽기 (서버 max_rows 에 잘리지 않게) — total 은 첫 요청의 Content-Range */
async function restPaged(base: string, limit: number, offset: number): Promise<{ rows: any[]; total: number | null }> {
  const out: any[] = []; let total: number | null = null, off = offset, first = true;
  while (out.length < limit) {
    const n = Math.min(PAGE, limit - out.length);
    const r = await restGet(base + '&limit=' + n + '&offset=' + off, first);
    if (first) { total = r.total; first = false; }
    out.push(...r.rows); off += r.rows.length;
    if (r.rows.length < n) break;
  }
  return { rows: out, total };
}
/** 이 쪽 계약의 고객사 이름만 (전체 고객사 표를 매번 읽지 않음) */
async function namesFor(ids: number[]): Promise<Map<number, string>> {
  const m = new Map<number, string>(), u = [...new Set(ids.filter((x) => Number.isInteger(x)))];
  for (let i = 0; i < u.length; i += 150) { const { rows } = await restGet('customers?select=id,name&id=in.(' + u.slice(i, i + 150).join(',') + ')'); rows.forEach((c) => m.set(c.id, c.name)); }
  return m;
}

const VAL_RE = /^[^,()&=*"\\]{1,40}$/;
/** 같음 조건 — status 만 쉼표로 여러 개(in) */
function eqFilters(p: URLSearchParams, allow: string[], q: string[]) {
  for (const k of allow) {
    const v = p.get(k); if (v == null || v === '') continue;
    const vs = k === 'status' ? v.split(',').map((x) => x.trim()).filter(Boolean) : [v];
    if (!vs.length || vs.length > 10 || !vs.every((x) => VAL_RE.test(x))) throw new HttpErr(400, k + ' 값이 올바르지 않습니다');
    q.push(k + '=' + (vs.length > 1 ? 'in.(' + vs.map(encodeURIComponent).join(',') + ')' : 'eq.' + encodeURIComponent(vs[0])));
  }
}
function sinceParam(p: URLSearchParams, name: string, col: string, q: string[]) {
  const v = p.get(name); if (!v) return;
  const t = Date.parse(v); if (!isFinite(t) || t < Date.UTC(2000, 0, 1) || t > Date.UTC(2101, 0, 1)) throw new HttpErr(400, name + ' 는 2000~2100년 날짜/시각이어야 합니다 (예: 2026-10-01)');
  q.push(col + '=gte.' + encodeURIComponent(new Date(t).toISOString()));
}
/** PoC·장비 — 허용 칸만 · 고객사명 옵션 · PoC 는 모듈 이름도 */
async function getList(table: string, cols: string[], order: string, p: URLSearchParams, key: Key, allow: string[], since: [string, string] | null) {
  const { limit, offset } = page(p);
  const q = ['select=*', 'order=' + order]; eqFilters(p, allow, q); if (since) sinceParam(p, since[0], since[1], q);
  for (const k of [...p.keys()]) if (!['limit', 'offset', 'format', ...allow, ...(since ? [since[0]] : [])].includes(k)) throw new HttpErr(400, '모르는 조건입니다: ' + clean(k, 30) + ' — 쓸 수 있는 것: ' + [...allow, ...(since ? [since[0]] : []), 'limit', 'offset', 'format'].join(' · '));
  const { rows, total } = await restPaged(table + '?' + q.join('&'), limit, offset);
  const data = rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const k of cols) if (k in r && !(k === 'customer' && !key.opts?.names)) o[k] = r[k];
    if (table === 'mdr_ops') o.modules = MODS.filter(([k]) => r[k]).map(([, l]) => l);
    return o;
  });
  return { data, total, limit, offset };
}
async function getContracts(p: URLSearchParams, key: Key) {
  const { limit, offset } = page(p);
  const q = ['select=' + CT_COLS.join(','), 'order=id.asc'];
  const us = p.get('updated_since');
  if (us) { const t = Date.parse(us); if (!isFinite(t) || t < Date.UTC(2000, 0, 1) || t > Date.UTC(2101, 0, 1)) throw new HttpErr(400, 'updated_since 는 2000~2100년 날짜/시각이어야 합니다 (예: 2026-10-01 또는 2026-10-01T09:00:00+09:00)'); q.push('updated_at=gte.' + encodeURIComponent(new Date(t).toISOString())); }
  const ln = p.get('line'); if (ln) { if (!/^[A-Za-z0-9_]{1,20}$/.test(ln)) throw new HttpErr(400, 'line 은 영문 코드입니다 (Cloud · S1 · MDR · MDR_S1 …)'); q.push('line=eq.' + ln); }
  const st = p.get('status'); if (st) { if (!/^[^,().]{1,20}$/.test(st)) throw new HttpErr(400, 'status 값이 올바르지 않습니다'); q.push('status=eq.' + encodeURIComponent(st)); }
  const { rows, total } = await restPaged('contracts?' + q.join('&'), limit, offset);
  const names = key.opts?.names ? await namesFor(rows.map((c) => c.customer_id)) : null;
  const data = rows.map((c) => {
    const o: Record<string, unknown> = { id: c.id, customer_id: c.customer_id };
    if (names) o.customer = names.get(c.customer_id) ?? null;
    for (const k of CT_COLS) if (!(k in o)) o[k] = /_month$/.test(k) ? ym(c[k]) : c[k];
    o.line_label = LINE[c.line] || c.line;
    return o;
  });
  return { data, total, limit, offset };
}
async function getRevenue(p: URLSearchParams) {
  const { limit, offset } = page(p);
  const to = ymParam(p, 'to') || kstYm(), from = ymParam(p, 'from') || idxYm(ymIdx(to) - 11);
  if (ymIdx(from) > ymIdx(to)) throw new HttpErr(400, 'from 이 to 보다 늦습니다');
  if (ymIdx(to) - ymIdx(from) >= 120) throw new HttpErr(400, '한 번에 최대 120개월까지입니다');
  const q = ['select=contract_id,month,amount', 'month=gte.' + from + '-01', 'month=lte.' + to + '-01', 'order=month.asc,contract_id.asc'];
  const cid = p.get('contract_id'); if (cid) { if (!/^\d{1,12}$/.test(cid)) throw new HttpErr(400, 'contract_id 는 숫자입니다'); q.push('contract_id=eq.' + cid); }
  const { rows, total } = await restPaged('monthly_revenue?' + q.join('&'), limit, offset);
  return { data: rows.map((r) => ({ contract_id: r.contract_id, month: ym(r.month), amount: Number(r.amount) || 0 })), total, limit, offset, from, to };
}
async function getCustomers(p: URLSearchParams, key: Key) {
  const { limit, offset } = page(p);
  const { rows, total } = await restPaged('customers?select=id,name,industry,sector&order=id.asc', limit, offset);
  return { data: rows.map((c) => (key.opts?.names ? { id: c.id, name: c.name, industry: c.industry ?? null, sector: c.sector ?? null } : { id: c.id, industry: c.industry ?? null, sector: c.sector ?? null })), total, limit, offset };
}
async function getMrr(p: URLSearchParams) {
  const one = ymParam(p, 'month');
  const to = one || ymParam(p, 'to') || kstYm(), from = one || ymParam(p, 'from') || to;
  if (ymIdx(from) > ymIdx(to)) throw new HttpErr(400, 'from 이 to 보다 늦습니다');
  if (ymIdx(to) - ymIdx(from) >= 60) throw new HttpErr(400, '합계는 한 번에 최대 60개월까지입니다');
  const sum = new Map<string, { total: number; by_line: Record<string, number>; contracts: number }>();
  for (let i = ymIdx(from); i <= ymIdx(to); i++) sum.set(idxYm(i), { total: 0, by_line: {}, contracts: 0 });
  const rows = await rpc('api_mrr', { p_from: from + '-01', p_to: to + '-01' });   // DB 에서 월 × 서비스로 묶음 (SQL 102)
  for (const r of Array.isArray(rows) ? rows : []) { const s = sum.get(String(r.month)); const v = Number(r.amount) || 0; if (!s || !v) continue; s.total += v; s.by_line[r.line] = (s.by_line[r.line] || 0) + v; s.contracts += Number(r.contracts) || 0; }
  const data = [...sum.entries()].map(([m, s]) => ({ month: m, total: s.total, contracts: s.contracts, by_line: s.by_line }));
  return { data, total: data.length, from, to };
}
/** CSV 로 낼 때 mrr 은 월 × 서비스 한 줄씩 */
function flatMrr(data: any[]) { const out: Record<string, unknown>[] = []; data.forEach((d) => { Object.keys(d.by_line).sort().forEach((ln) => out.push({ month: d.month, line: ln, line_label: LINE[ln] || ln, amount: d.by_line[ln] })); out.push({ month: d.month, line: '_total', line_label: '합계', amount: d.total }); }); return out; }

/** 기록 마무리 — api_key_auth 가 미리 만든 줄(log_id)에 결과를 채움 */
async function finishLog(id: number, e: { rows: number; status: number; ms: number }) {
  try {
    const r = await fetchT(SB_URL + '/rest/v1/api_access_log?id=eq.' + id, { method: 'PATCH', headers: { ...svcHdr(), Prefer: 'return=minimal' }, body: JSON.stringify(e) }, 5000);
    if (!r.ok) console.error('export log', r.status, (await r.text()).slice(0, 200));
  } catch (x) { console.error('export log', String(x)); }
}

export async function handle(req: Request): Promise<Response> {
  const t0 = Date.now(), url = new URL(req.url);
  const seg = url.pathname.split('/').filter(Boolean); const at = seg.lastIndexOf('export');
  const resource = (at >= 0 ? seg[at + 1] : seg[0] === 'export' ? '' : seg[0]) || '';
  const ip = ipOf(req);
  const qs = clean([...url.searchParams.entries()].filter(([k]) => !/key|token|secret/i.test(k)).map(([k, v]) => k + '=' + v).join('&'), 300);
  if (url.searchParams.has('key') || url.searchParams.has('api_key')) return jres({ ok: false, error: 'API 키는 주소(?key=)가 아니라 헤더 X-API-Key 로 보내 주세요' }, 400);
  if (req.method !== 'GET' && req.method !== 'HEAD') return jres({ ok: false, error: 'GET 만 됩니다 (읽기 전용)' }, 405, { Allow: 'GET' });
  const raw = (req.headers.get('x-api-key') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')).trim();
  let key: Key | null = null, status = 200, nrows = 0, logId = 0;
  /* 기록: 통과한 호출은 api_key_auth 가 만든 줄에 결과를 채움 · 모르는/폐기/만료 키는 DB 함수가 1분에 한 줄만 남김 · 형식이 아닌 키는 남기지 않음(마구 보내도 표가 안 불어남) */
  const done = async (res: Response) => { if (logId) await finishLog(logId, { rows: nrows, status, ms: Date.now() - t0 }); return res; };
  try {
    if (!raw) { status = 401; return jres({ ok: false, error: 'API 키가 없습니다 — 헤더 X-API-Key: svc_… 로 보내 주세요' }, 401); }
    if (!KEY_RE.test(raw)) { status = 401; return jres({ ok: false, error: 'API 키 형식이 아닙니다 (svc_ + 64자)' }, 401); }
    const k = await rpc('api_key_auth', { p_hash: await sha256hex(raw), p_rate: RATE_PER_MIN, p_resource: clean(resource || '(index)', 40), p_query: qs, p_ip: ip });
    if (!k) { status = 401; return await done(jres({ ok: false, error: '등록되지 않은 API 키입니다' }, 401)); }
    if (k.bad) {
      key = { id: k.id, name: k.name, scopes: [], opts: {}, expires_at: k.expires_at || null };
      if (k.bad === 'rate') { status = 429; return await done(jres({ ok: false, error: '호출이 너무 많습니다 — 분당 ' + RATE_PER_MIN + '회까지 · 잠시 뒤 다시' }, 429, { 'Retry-After': '60' })); }
      status = 401; return await done(jres({ ok: false, error: k.bad === 'expired' ? '만료된 API 키입니다 (' + String(k.expires_at || '').slice(0, 10) + ') — 관리자에게 새 키를 받으세요' : '폐기된 API 키입니다' }, 401));
    }
    key = { id: k.id, name: k.name, scopes: Array.isArray(k.scopes) ? k.scopes : [], opts: k.opts || {}, expires_at: k.expires_at || null }; logId = Number(k.log_id) || 0;
    if (!resource) {
      return await done(jres({ ok: true, version: VERSION, key: { name: key.name, scopes: key.scopes, names: !!key.opts.names, expires_at: key.expires_at },
        resources: RESOURCES.map((r) => ({ name: r, allowed: key!.scopes.includes(r), url: SB_URL + '/functions/v1/export/' + r })),
        units: { amount: '원', month: 'YYYY-MM' }, paging: { limit: DEF_LIMIT + ' (최대 ' + MAX_LIMIT + ')', offset: 0 }, format: 'json (기본) · csv (?format=csv)', rate: '분당 ' + RATE_PER_MIN + '회' }));
    }
    if (!RESOURCES.includes(resource)) { status = 404; return await done(jres({ ok: false, error: '모르는 자료입니다: ' + resource + ' — ' + RESOURCES.join(' · ') }, 404)); }
    if (!key.scopes.includes(resource)) { status = 403; return await done(jres({ ok: false, error: '이 키로는 «' + resource + '» 를 볼 수 없습니다 — 허용: ' + (key.scopes.join(' · ') || '없음') }, 403)); }
    const p = url.searchParams, fmt = (p.get('format') || 'json').toLowerCase();
    if (fmt !== 'json' && fmt !== 'csv') throw new HttpErr(400, 'format 은 json 또는 csv 입니다');
    const out: any = resource === 'contracts' ? await getContracts(p, key) : resource === 'revenue' ? await getRevenue(p) : resource === 'customers' ? await getCustomers(p, key)
      : resource === 'poc' ? await getList('mdr_ops', POC_COLS, 'id.asc', p, key, ['status', 'svc_type', 'channel'], ['since', 'created_at'])
      : resource === 'orders' ? await getList('equipment_orders', ORD_COLS, 'id.asc', p, key, ['status', 'channel', 'order_type', 'model'], ['since', 'created_at'])
      : resource === 'assets' ? await getList('equipment_assets', AST_COLS, 'serial.asc', p, key, ['status', 'model', 'usage', 'channel'], ['updated_since', 'updated_at'])
      : await getMrr(p);
    nrows = out.data.length;
    if (fmt === 'csv') {
      const body = toCsv(resource === 'mrr' ? flatMrr(out.data) : out.data);
      return await done(new Response(req.method === 'HEAD' ? null : body, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="svc_${resource}.csv"`, 'Cache-Control': 'no-store', ...(out.total != null ? { 'X-Total-Count': String(out.total) } : {}) } }));
    }
    const next = (out.limit != null && out.total != null && out.offset + out.data.length < out.total) ? out.offset + out.data.length : null;
    return await done(jres({ ok: true, resource, count: out.data.length, total: out.total ?? null, ...(out.limit != null ? { limit: out.limit, offset: out.offset, next_offset: next } : {}),
      ...(out.from ? { from: out.from, to: out.to } : {}), units: { amount: '원', month: 'YYYY-MM' }, data: out.data }));
  } catch (e) {
    status = e instanceof HttpErr ? e.status : 500;
    if (!(e instanceof HttpErr)) console.error('export', String((e as Error)?.stack || e).slice(0, 500));
    return await done(jres({ ok: false, error: e instanceof HttpErr ? e.message : '처리 중 오류 — 잠시 뒤 다시 (계속되면 포탈 관리자에게)' }, status));
  }
}
Deno.serve(handle);
