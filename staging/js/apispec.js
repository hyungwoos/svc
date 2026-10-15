// js/apispec.js — ㊿+203 외부 연동 API 명세 한곳 (포탈 «API 문서» 화면 · openapi.json · 포탈 AI 지식이 같은 내용을 씀)
//   · export 함수(supabase/functions/export/index.ts)가 실제로 받는 조건 · 내보내는 칸과 같아야 함 — tests/check.mjs 가 둘을 비교
//   · openapi.json(저장소 맨 위)은 이 파일로 만듦: node tests/openapi.mjs  (check 가 «이 파일로 만든 것 = 올린 파일» 확인)
//   · 예시 값은 전부 가짜(가상고객 · 홍길동) — 실제 고객사 · 사람 이름 금지
//   · DOM · 다른 모듈에 기대지 않음(노드에서도 import)

export var API_VER = '1.2';
export var API_RATE = 60;
export var API_LIMIT = { def: 1000, max: 5000 };

/** 조건 하나: n 이름 · type(string · integer · boolean) · fmt(date · date-time · ym) · d 뜻 · ex 예시 · en 고를 수 있는 값 · multi 쉼표로 여러 개 */
var P = {
  limit: { n: 'limit', type: 'integer', d: '한 번에 받을 줄 수 — 기본 1000 · 최대 5000', ex: '5', min: 1, max: 5000 },
  offset: { n: 'offset', type: 'integer', d: '앞에서 건너뛸 줄 수 — 응답의 next_offset 값을 그대로 넣으면 다음 쪽', ex: '0', min: 0 },
  format: { n: 'format', type: 'string', d: 'json(기본 · 프로그램) · csv(엑셀 · 구글 시트 — 첫 줄이 칸 이름)', ex: 'json', en: ['json', 'csv'] },
  from: { n: 'from', type: 'string', fmt: 'ym', d: '시작 월 YYYY-MM', ex: '2026-01' },
  to: { n: 'to', type: 'string', fmt: 'ym', d: '끝 월 YYYY-MM — 없으면 이번 달', ex: '2026-12' }
};

/** 자료 7개 — id · t 이름 · sum 한 줄 · d 설명 · row 한 줄의 뜻 · q 조건 · f 칸[이름, 형, 뜻, 예시, 옵션] (옵션: names = 키가 «고객사명 포함»일 때만 · null · date · date-time = 비어 있을 수 있음) */
export var API_RES = [
  { id: 'contracts', t: '계약', sum: '계약 목록', row: '계약 1건 = 1줄',
    d: '회계 ERP · BI 에서 계약(고객사 · 서비스 · 기간 · 월 금액)을 맞출 때. 비고 · 연장 이력 같은 내부 칸은 나가지 않습니다.',
    q: [({ n: 'updated_since', type: 'string', fmt: 'date-time', d: '이 날(시각) 뒤에 바뀐 계약만 — 날짜만 써도 됨', ex: '2026-10-01' }),
      ({ n: 'line', type: 'string', d: '서비스 코드', ex: 'Cloud', en: ['Cloud', 'S1', 'MDR', 'MDR_S1', 'PNS', 'DRM', 'DLP'] }),
      ({ n: 'status', type: 'string', d: '계약 상태 하나', ex: '재약정', en: ['신규', '재약정', '추가', '서비스종료', '해지'] }),
      P.limit, P.offset, P.format],
    f: [['id', 'integer', '계약 번호', 1024], ['customer_id', 'integer', '고객사 번호(고객사 자료의 id)', 311], ['customer', 'string', '고객사명', '가상고객01', 'names'],
      ['line', 'string', '서비스 코드', 'Cloud'], ['version', 'string', '버전 · 에디션', 'V6.0', 'null'], ['channel', 'string', '판매 채널', '일반', 'null'], ['partner', 'string', '파트너', null, 'null'],
      ['biller', 'string', '계산서 발행처', '지니언스', 'null'], ['billing', 'string', '과금 방식', '월납입', 'null'], ['contract_type', 'string', '계약 유형', '신규', 'null'], ['status', 'string', '상태', '재약정', 'null'],
      ['start_month', 'string', '시작월 YYYY-MM', '2026-01', 'null'], ['end_month', 'string', '종료월 YYYY-MM', '2026-12', 'null'], ['term_months', 'integer', '약정 개월', 12, 'null'],
      ['mrr', 'number', '월 금액(원)', 480000, 'null'], ['qty', 'integer', '수량(노드 · 에이전트)', 300, 'null'], ['install_fee', 'number', '설치비(원)', 0, 'null'],
      ['renew_count', 'integer', '연장 횟수', 1, 'null'], ['auto_renew', 'boolean', '자동 연장', true, 'null'], ['parent_contract_id', 'integer', '원계약 번호', null, 'null'],
      ['churn_reason', 'string', '해지 사유', null, 'null'], ['churn_month', 'string', '해지월 YYYY-MM', null, 'null'], ['csm', 'string', 'CSM 사이트명', 'vcust01', 'null'],
      ['s1_no', 'string', '에스원 계약번호', null, 'null'], ['updated_at', 'string', '마지막 수정 시각', '2026-10-14T09:10:00+09:00', 'date-time'], ['line_label', 'string', '서비스 이름', 'Cloud NAC']] },
  { id: 'revenue', t: '월 매출', sum: '계약별 월 금액', row: '계약 × 월 = 1줄',
    d: '계약별로 달마다 얼마인지 — 회계 매출 대사 · 월 마감. 기간을 안 주면 최근 12개월 · 한 번에 최대 120개월.',
    q: [P.from, P.to, ({ n: 'contract_id', type: 'integer', d: '계약 하나만', ex: '1024' }), P.limit, P.offset, P.format],
    f: [['contract_id', 'integer', '계약 번호(계약 자료의 id)', 1024], ['month', 'string', '월 YYYY-MM', '2026-10'], ['amount', 'number', '금액(원)', 480000]] },
  { id: 'customers', t: '고객사', sum: '고객사 목록', row: '고객사 하나 = 1줄',
    d: '고객사 번호 → 이름 · 산업군을 붙일 때.',
    q: [P.limit, P.offset, P.format],
    f: [['id', 'integer', '고객사 번호', 311], ['name', 'string', '고객사명', '가상고객01', 'names'], ['industry', 'string', '산업군', '제조', 'null'], ['sector', 'string', '구분', '민간', 'null']] },
  { id: 'mrr', t: '월 매출 합계', sum: '월별 · 서비스별 합계', row: '월 1줄 (CSV 는 월 × 서비스 1줄 + 합계 줄)',
    d: 'BI · 경영 보고 — 달마다 전체 · 서비스별 합계(포탈 «월 MRR»과 같은 숫자). month 하나 또는 from~to(최대 60개월).',
    q: [({ n: 'month', type: 'string', fmt: 'ym', d: '한 달만 YYYY-MM (주면 from · to 는 무시)', ex: '2026-10' }), P.from, P.to, P.format],
    f: [['month', 'string', '월 YYYY-MM', '2026-10'], ['total', 'number', '그달 합계(원)', 128450000], ['contracts', 'integer', '계약 수', 214],
      ['by_line', 'object', '서비스별 합계(원) — 서비스 코드: 금액', { Cloud: 61200000, MDR: 40100000 }]] },
  { id: 'poc', t: 'MDR PoC·운영', sum: 'MDR 신청 ~ PoC ~ 구독', row: '신청 1건 = 1줄',
    d: 'MDR 신청부터 PoC · 구독 · 종료까지 진행 현황. 고객 담당자 · 연락처 · 진행 메모는 나가지 않습니다.',
    q: [({ n: 'status', type: 'string', d: '상태 — 쉼표로 여러 개 (PoC 단계 = 신청,대기,진행중,데모)', ex: '신청,대기,진행중,데모', multi: true, en: ['신청', '대기', '진행중', '데모', '구독', '종료'] }),
      ({ n: 'svc_type', type: 'string', d: '서비스 유형', ex: 'CLOUD' }), ({ n: 'channel', type: 'string', d: '판매 채널', ex: '일반' }),
      ({ n: 'since', type: 'string', fmt: 'date', d: '이 날 뒤에 신청한 것만', ex: '2026-10-01' }), P.limit, P.offset, P.format],
    f: [['id', 'integer', '번호', 58], ['apply_date', 'string', '신청일', '2026-09-02', 'date'], ['created_at', 'string', '등록 시각', '2026-09-02T10:00:00+09:00', 'date-time'],
      ['svc_type', 'string', '서비스 유형', 'CLOUD', 'null'], ['customer', 'string', '고객사명', '가상고객07', 'names'], ['status', 'string', '상태', '진행중', 'null'], ['channel', 'string', '판매 채널', '일반', 'null'],
      ['license', 'string', '라이선스', 'EDR+RANSOMWARE', 'null'], ['plan_qty', 'integer', '계약 수량', 300, 'null'], ['agents_total', 'integer', '설치 수', 274, 'null'],
      ['agents_win', 'integer', '설치 수 — Windows', 250, 'null'], ['agents_mac', 'integer', '설치 수 — Mac', 20, 'null'], ['agents_linux', 'integer', '설치 수 — Linux', 4, 'null'],
      ['mod_edr', 'boolean', '모듈 EDR', true, 'null'], ['mod_ransom', 'boolean', '모듈 랜섬웨어', true, 'null'], ['mod_av', 'boolean', '모듈 백신', false, 'null'], ['mod_media', 'boolean', '모듈 매체제어', false, 'null'],
      ['start_date', 'string', '시작일', '2026-09-15', 'date'], ['end_date', 'string', '종료일', null, 'date'], ['on_rev_sheet', 'boolean', '매출 시트에 올라감', false, 'null'],
      ['sales_name', 'string', '영업 담당', '홍길동', 'null'], ['updated_at', 'string', '마지막 수정 시각', '2026-10-02T11:00:00+09:00', 'date-time'], ['modules', 'array', '켠 모듈 이름', ['EDR', '랜섬웨어']]] },
  { id: 'orders', t: '장비 신청', sum: '임대 장비 출고 · 회수 신청', row: '신청 1건 = 1줄',
    d: '임대 장비 출고 · 회수 진행. 수령인 · 연락처 · 주소 · 요청사항은 나가지 않습니다.',
    q: [({ n: 'status', type: 'string', d: '상태 — 쉼표로 여러 개', ex: '배송중,설치완료', multi: true, en: ['접수', '출하요청', '배송중', '설치완료', '회수예정', '회수완료', '취소'] }),
      ({ n: 'channel', type: 'string', d: '채널', ex: '일반' }), ({ n: 'order_type', type: 'string', d: '유형', ex: '신규발주', en: ['신규발주', '추가', '교체', '철거·회수'] }),
      ({ n: 'model', type: 'string', d: '모델', ex: 'S10_R2' }), ({ n: 'since', type: 'string', fmt: 'date', d: '이 날 뒤에 신청한 것만', ex: '2026-10-01' }), P.limit, P.offset, P.format],
    f: [['id', 'integer', '신청 번호', 412], ['created_at', 'string', '신청 시각', '2026-10-02T10:20:00+09:00', 'date-time'], ['channel', 'string', '채널', '일반', 'null'],
      ['order_type', 'string', '유형', '신규발주', 'null'], ['customer', 'string', '고객사명', '가상고객03', 'names'], ['contract_no', 'string', '에스원 계약번호', null, 'null'],
      ['install_date', 'string', '설치 희망일', '2026-10-10', 'date'], ['ship_date', 'string', '출고일', '2026-10-07', 'date'], ['edition', 'string', '에디션', null, 'null'], ['nodes', 'integer', '노드 수', null, 'null'],
      ['model', 'string', '모델', 'S10_R2', 'null'], ['qty', 'integer', '수량', 1, 'null'], ['standalone_pod', 'boolean', '단독 POD', false, 'null'], ['status', 'string', '상태', '배송중', 'null'],
      ['serials', 'string', '시리얼(쉼표로)', 'TST0000001', 'null'], ['returned_date', 'string', '회수일', null, 'date'], ['returned_serials', 'string', '회수 시리얼', null, 'null'],
      ['updated_at', 'string', '마지막 수정 시각', '2026-10-07T15:00:00+09:00', 'date-time']] },
  { id: 'assets', t: '장비 현황', sum: '시리얼별 재고 · 임대 · 회수', row: '장비 1대 = 1줄',
    d: '시리얼별 재고 · 임대 · 회수(회계 재고 파악). 비고는 나가지 않습니다.',
    q: [({ n: 'status', type: 'string', d: '상태 — 쉼표로 여러 개', ex: '임대중', multi: true, en: ['재고', '임대중', '회수완료'] }),
      ({ n: 'model', type: 'string', d: '모델', ex: 'S10_R2' }), ({ n: 'usage', type: 'string', d: '구분', ex: '임대', en: ['임대', '데모', '대여', '판매'] }), ({ n: 'channel', type: 'string', d: '채널', ex: '일반' }),
      ({ n: 'updated_since', type: 'string', fmt: 'date-time', d: '이 날(시각) 뒤에 바뀐 장비만', ex: '2026-10-01' }), P.limit, P.offset, P.format],
    f: [['id', 'integer', '번호', 7001], ['serial', 'string', '시리얼', 'TST0000001'], ['model', 'string', '모델', 'S10_R2', 'null'], ['usage', 'string', '구분', '임대', 'null'],
      ['status', 'string', '상태', '임대중', 'null'], ['customer', 'string', '고객사', '가상고객03', 'names'], ['channel', 'string', '채널', '일반', 'null'], ['partner', 'string', '파트너', null, 'null'],
      ['in_date', 'string', '입고일', '2026-03-02', 'date'], ['deployed_date', 'string', '출고일', '2026-10-07', 'date'], ['returned_date', 'string', '회수일', null, 'date'],
      ['order_id', 'integer', '장비 신청 번호', 412, 'null'], ['updated_at', 'string', '마지막 수정 시각', '2026-10-07T15:00:00+09:00', 'date-time']] }
];

/** 오류 — [상태, 뜻, 무엇을 할지] */
export var API_ERRS = [
  [400, '조건 형식이 틀림 · 모르는 조건', '응답 error 에 이유가 나옵니다 (예: from 은 YYYY-MM)'],
  [401, '키가 없음 · 형식이 아님 · 등록 안 됨 · 폐기 · 만료', '헤더 이름이 X-API-Key 인지, 키를 끝까지 붙였는지 확인 · 폐기 · 만료면 새 키'],
  [403, '이 키로 볼 수 없는 자료', '키를 발급할 때 그 자료를 체크하지 않음 — 새 키를 발급'],
  [404, '모르는 자료 이름', '/contracts · /revenue · /customers · /mrr · /poc · /orders · /assets'],
  [405, 'GET 이 아닌 방식', '읽기 전용 — GET 만'],
  [429, '분당 60번 넘음', '응답 머리 Retry-After(초)만큼 기다렸다 다시'],
  [502, 'DB 읽기 실패', '잠시 뒤 다시 — 계속되면 포탈 관리자에게']
];

export function apiRes(id) { return API_RES.filter(function (r) { return r.id === id; })[0] || null; }
/** 응답 예시 한 줄(가짜 값) — names 칸은 키 옵션에 따라 */
export function apiRowEx(r, names) {
  var o = {}; r.f.forEach(function (f) { if (f[4] === 'names' && !names) return; o[f[0]] = f[3]; }); return o;
}
/** 응답 예시 전체(JSON) — export 함수의 봉투와 같은 모양 */
export function apiRespEx(r, names) {
  var row = apiRowEx(r, names);
  if (r.id === 'mrr') return { ok: true, resource: 'mrr', count: 1, total: 1, from: '2026-10', to: '2026-10', units: { amount: '원', month: 'YYYY-MM' }, data: [row] };
  var o = { ok: true, resource: r.id, count: 1, total: 1, limit: API_LIMIT.def, offset: 0, next_offset: null };
  if (r.id === 'revenue') { o.from = '2026-01'; o.to = '2026-12'; }
  o.units = { amount: '원', month: 'YYYY-MM' }; o.data = [row]; return o;
}

function schemaOf(type, fmt) {
  var s = { type: type };
  if (fmt === 'ym') { s.pattern = '^\\d{4}-(0[1-9]|1[0-2])$'; s.example = '2026-10'; }
  else if (fmt === 'date' || fmt === 'date-time') s.format = fmt;
  return s;
}
/** OpenAPI 3.0 문서 — base = export 함수 주소 */
export function buildOpenApi(base) {
  var paths = {};
  var errDefs = {}; API_ERRS.forEach(function (e) { errDefs['E' + e[0]] = { description: e[1] + ' — ' + e[2], content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { ok: false, error: e[1] } } } }; });
  var errResp = function () { var o = {}; API_ERRS.forEach(function (e) { o[String(e[0])] = { $ref: '#/components/responses/E' + e[0] }; }); return o; };
  paths['/'] = { get: { operationId: 'index', tags: ['안내'], summary: '이 키로 볼 수 있는 자료', description: '키 이름 · 허용 자료 · 단위 · 한도를 돌려줍니다. 키가 맞는지 처음 확인할 때.',
    responses: Object.assign({ 200: { description: '키 정보', content: { 'application/json': { example: { ok: true, version: 'export v' + API_VER, key: { name: '회계 ERP', scopes: ['contracts', 'revenue'], names: true, expires_at: '2027-10-15T00:00:00+09:00' },
      resources: API_RES.map(function (r) { return { name: r.id, allowed: r.id === 'contracts' || r.id === 'revenue', url: base + '/' + r.id }; }), units: { amount: '원', month: 'YYYY-MM' }, rate: '분당 ' + API_RATE + '회' } } } } }, errResp()) } };
  var schemas = { Error: { type: 'object', required: ['ok', 'error'], properties: { ok: { type: 'boolean', example: false }, error: { type: 'string', description: '한국어 이유' } } } };
  API_RES.forEach(function (r) {
    var props = {}; r.f.forEach(function (f) {
      var s = f[1] === 'object' ? { type: 'object', additionalProperties: { type: 'number' } } : f[1] === 'array' ? { type: 'array', items: { type: 'string' } } : schemaOf(f[1], f[4] === 'date' || f[4] === 'date-time' ? f[4] : '');
      s.description = f[2] + (f[4] === 'names' ? ' — 키가 «고객사명 포함»일 때만' : '');
      if (f[4] && f[4] !== 'names') s.nullable = true;
      if (f[3] != null) s.example = f[3];
      props[f[0]] = s; });
    var nm = r.id.charAt(0).toUpperCase() + r.id.slice(1);
    schemas[nm] = { type: 'object', description: r.row, properties: props };
    var env = { type: 'object', properties: { ok: { type: 'boolean' }, resource: { type: 'string', example: r.id }, count: { type: 'integer', description: '이번에 받은 줄 수' }, total: { type: 'integer', nullable: true, description: '조건에 맞는 전체 줄 수' } } };
    if (r.id !== 'mrr') { env.properties.limit = { type: 'integer' }; env.properties.offset = { type: 'integer' }; env.properties.next_offset = { type: 'integer', nullable: true, description: '더 있으면 다음 offset · 없으면 null' }; }
    env.properties.units = { type: 'object', example: { amount: '원', month: 'YYYY-MM' } };
    env.properties.data = { type: 'array', items: { $ref: '#/components/schemas/' + nm } };
    schemas[nm + 'List'] = env;
    paths['/' + r.id] = { get: { operationId: r.id, tags: ['자료'], summary: r.t + ' — ' + r.sum, description: r.d + ' (' + r.row + ')',
      parameters: r.q.map(function (q) {
        var s = schemaOf(q.type, q.fmt); if (q.en && !q.multi) s.enum = q.en; if (q.min != null) s.minimum = q.min; if (q.max != null) s.maximum = q.max;
        if (q.n === 'limit') s.default = API_LIMIT.def; if (q.n === 'offset') s.default = 0; if (q.n === 'format') s.default = 'json';
        return { name: q.n, in: 'query', required: false, description: q.d + (q.en && q.multi ? ' — 값: ' + q.en.join(', ') : ''), schema: s, example: q.ex }; }),
      responses: Object.assign({ 200: { description: '성공 — JSON 이면 data 목록 · CSV 면 첫 줄이 칸 이름(엑셀용 BOM)',
        headers: { 'X-Total-Count': { description: 'CSV 일 때 전체 줄 수', schema: { type: 'integer' } } },
        content: { 'application/json': { schema: { $ref: '#/components/schemas/' + nm + 'List' }, example: apiRespEx(r, true) }, 'text/csv': { schema: { type: 'string' } } } } }, errResp()) } };
  });
  return { openapi: '3.0.3',
    info: { title: 'SVC 포탈 데이터 API', version: API_VER,
      description: '지니언스 서비스사업부 포탈 데이터를 외부 시스템(회계 ERP · BI · 구글 시트 · 엑셀)이 읽기 전용으로 가져가는 API.\n\n' +
        '· 인증: 헤더 X-API-Key 에 포탈 관리자가 발급한 키(svc_ + 64자). 주소에 ?key= 로 넣으면 거부\n· 금액 단위 원 · 월 YYYY-MM · 시각 ISO 8601\n' +
        '· 한 번에 최대 ' + API_LIMIT.max + '줄 — 더 있으면 응답의 next_offset 을 offset 으로\n· 키마다 분당 ' + API_RATE + '번 · 모든 호출 기록이 남음 · 고객 담당자 · 연락처 · 주소 · 메모 칸은 내보내지 않음' },
    servers: [{ url: base, description: '운영' }],
    security: [{ ApiKey: [] }],
    tags: [{ name: '안내', description: '키 확인' }, { name: '자료', description: '가져갈 수 있는 자료 7개' }],
    paths: paths,
    components: { responses: errDefs, securitySchemes: { ApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key', description: '포탈 › 관리자 › 외부 연동 › 키 관리에서 발급 (슈퍼 관리자)' } }, schemas: schemas } };
}
