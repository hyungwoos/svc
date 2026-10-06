/* ===== sat/report.js — report.html 의 페이지 스크립트 (㊿+154: 인라인 <script> 에서 파일로 · 인라인 onclick → data-click 등 · sat/common.js 가 연결) ===== */
// ─────────────────────────────────────────────
//  접속·DB — 포탈(index.html) 로그인 세션(svc_sess) 공유. 서비스 키는 어디에도 없습니다(anon 키 + 사용자 토큰, RLS).
// ─────────────────────────────────────────────
async function sbAll(q) {
    var out = [], off = 0;
    while (true) { var p = await sbGet(q + (q.indexOf('?') >= 0 ? '&' : '?') + 'limit=1000&offset=' + off); out = out.concat(p); if (p.length < 1000) break; off += 1000; }
    return out;
}
async function sbWrite(method, path, body, prefer) {
    var r = await fetch(SB_URL + '/rest/v1/' + path, { method: method, headers: Object.assign(hdr(true), prefer ? { Prefer: prefer } : {}), body: body !== undefined ? JSON.stringify(body) : undefined });
    if (!r.ok) { var t = await r.text(); if (r.status === 401) throw new Error('로그인이 만료되었습니다 — 포탈에서 다시 로그인해 주세요'); if (r.status === 403 || /policy/i.test(t)) throw new Error('쓰기 권한이 없습니다 (편집 권한 필요)'); throw new Error('저장 실패 (' + r.status + '): ' + t.slice(0, 160)); }
    var tx = await r.text(); try { return tx ? JSON.parse(tx) : null; } catch (e) { return null; }
}
// ─────────────────────────────────────────────
//  상태
// ─────────────────────────────────────────────
var R = { customers: [], contracts: [], costs: [], reports: [], byCust: {}, id: null, contractId: null, cust: null };
var KIND_LABEL = { new: '신규', add: '추가', renew: '재약정', qty: '수량변경', monthly: '무약정 매월', settle: '월 정산', subs: '구독료' };
var WRITERS = { choihw: '최형우', kmj915: '김민정', kholong: '송기영' };
var LINE_MODEL = { Cloud: 'Cloud NAC', S1: 'Cloud S1', MDR: 'MDR', PNS: 'PNS', DRM: 'DRM', MDR_S1: 'MDR+S1' };
var COST_ALIAS = { 'cloud nac': 'NAC / ZTNA', 'cloud ztna': 'NAC / ZTNA', 'nac': 'NAC / ZTNA', 'ztna': 'NAC / ZTNA', 'mdr': 'EDR / AV / MDR', 'edr': 'EDR / AV / MDR', 'cloud s1': 'EDR / AV / MDR', 's1': 'EDR / AV / MDR', 'mdr+s1': 'EDR / AV / MDR', 'ssl vpn 구독료': 'SSL VPN' };   // 포탈 제품명 → 공지 품목명
function fmt(v) { v = Math.round(v || 0); return v ? v.toLocaleString('ko-KR') : ''; }
function monthEnd(iso, plus) { var d = new Date(iso + 'T00:00:00'); if (isNaN(d)) return ''; var e = new Date(d.getFullYear(), d.getMonth() + 1 + (plus || 0), 0); return e.getFullYear() + '-' + String(e.getMonth() + 1).padStart(2, '0') + '-' + String(e.getDate()).padStart(2, '0'); }
function monthsBetween(aIso, bIso) { var a = new Date(aIso), b = new Date(bIso); return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()); }
function ym(iso) { return iso ? String(iso).slice(0, 7) : ''; }
function kYY(iso) { var d = String(iso || ''); return d.slice(2, 4) + '년' + String(+d.slice(5, 7)) + '월'; }
function setV(k, v) { var el = document.querySelector('[data-k="' + k + '"]'); if (el) el.value = v == null ? '' : v; }
function getV(k) { var el = document.querySelector('[data-k="' + k + '"]'); return el ? el.value : ''; }
function warn(t) { $('#warn').textContent = t || ''; }

// ─────────────────────────────────────────────
//  행 (납품·매입)
// ─────────────────────────────────────────────
function addDeliv(d) {
    d = d || {};
    var tb = $('#tDeliv tbody'), tr = document.createElement('tr');
    tr.innerHTML = '<td class="lbl idx"></td><td><input class="ctr d-model" list="dlModel" placeholder="MODEL"></td><td class="r"><input class="num money d-cost" placeholder="0"></td><td class="r"><input class="num d-qty" placeholder="0"></td><td class="r"><input class="num ro d-tot" readonly></td><td style="position:relative"><textarea class="d-note" rows="1" style="text-align:center;font-size:10px"></textarea><div class="rowact no-print"><button class="dup" title="복제" data-click="dupDeliv(this)">＋</button><button class="del" title="삭제" data-click="delRow(this)">×</button></div></td>';
    tb.appendChild(tr);
    tr.querySelector('.d-model').value = d.model || ''; tr.querySelector('.d-cost').value = d.cost ? fmt(d.cost) : ''; tr.querySelector('.d-qty').value = d.qty || ''; tr.querySelector('.d-note').value = d.note || '';
    if (d.cost && !Number.isInteger(+d.cost)) tr.querySelector('.d-cost').value = (+d.cost).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
    renumber(); calc(); return tr;
}
function delivData(tr) { return { model: tr.querySelector('.d-model').value, cost: n(tr.querySelector('.d-cost').value), qty: n(tr.querySelector('.d-qty').value), note: tr.querySelector('.d-note').value }; }
function addBuy(d) {
    d = d || {};
    var tb = $('#tBuy tbody'), tr = document.createElement('tr');
    var opts = '<option value="">직접입력</option>'; for (var p = 5; p <= 60; p += 5) opts += tpl`<option value="${rawHtml(p)}">${rawHtml(p)}%</option>`;
    tr.innerHTML = tpl`<td class="c1 bold idx"></td><td><input class="ctr b-name" placeholder="회사명"></td><td><input class="ctr b-desc"></td><td class="r"><input class="num b-qty"></td><td class="r" style="position:relative"><input class="num money b-tot" placeholder="0"><div class="ratebox no-print"><span style="font-size:9px;color:#777">수수료</span><select class="b-rate">${rawHtml(opts)}</select><input class="b-ratem" placeholder="%" title="5% 단위가 아니면 직접 입력" style="display:none"></div></td><td style="position:relative"><textarea class="b-term" rows="1" style="text-align:center;font-size:10px"></textarea><div class="rowact no-print"><button class="dup" title="복제" data-click="dupBuy(this)">＋</button><button class="del" title="삭제" data-click="delRow(this)">×</button></div></td>`;
    tb.appendChild(tr);
    tr.querySelector('.b-name').value = d.name || ''; tr.querySelector('.b-desc').value = d.desc || ''; tr.querySelector('.b-qty').value = d.qty || ''; tr.querySelector('.b-tot').value = d.tot ? fmt(d.tot) : ''; tr.querySelector('.b-term').value = d.term || '';
    var rate = d.rate == null ? '' : String(d.rate);
    var sel = tr.querySelector('.b-rate'), man = tr.querySelector('.b-ratem');
    if (rate !== '' && +rate % 5 === 0 && +rate <= 60) sel.value = rate; else if (rate !== '') { sel.value = ''; man.style.display = ''; man.value = rate; }
    sel.addEventListener('change', function () { man.style.display = sel.value === '' ? '' : 'none'; if (sel.value !== '') man.value = ''; applyRate(tr); });
    man.addEventListener('input', function () { applyRate(tr); });
    tr.querySelector('.b-tot').addEventListener('input', function () { sel.value = ''; man.value = ''; man.style.display = 'none'; });
    renumber(); calc(); return tr;
}
function rowRate(tr) { var s = tr.querySelector('.b-rate').value, m = tr.querySelector('.b-ratem').value; return s !== '' ? +s : (m !== '' ? n(m) : null); }
function applyRate(tr) { var r = rowRate(tr); if (r == null) return; tr.querySelector('.b-tot').value = fmt(n(getV('amount')) * r / 100); calc(); }
function buyData(tr) { return { name: tr.querySelector('.b-name').value, desc: tr.querySelector('.b-desc').value, qty: tr.querySelector('.b-qty').value, tot: n(tr.querySelector('.b-tot').value), term: tr.querySelector('.b-term').value, rate: rowRate(tr) }; }
function dupDeliv(btn) { dupRow(btn, addDeliv, delivData); }   // ㊿+154: data-click 은 함수 이름만 받으므로
function dupBuy(btn) { dupRow(btn, addBuy, buyData); }
function dupRow(btn, addFn, dataFn) { var tr = btn.closest('tr'); var nt = addFn(dataFn(tr)); tr.parentNode.insertBefore(nt, tr.nextSibling); renumber(); }
function delRow(btn) { var tr = btn.closest('tr'); var tb = tr.parentNode; if (tb.children.length <= 1) { tr.querySelectorAll('input,textarea').forEach(function (i) { if (!i.readOnly) i.value = ''; }); } else tr.remove(); renumber(); calc(); }
function renumber() { ['#tDeliv', '#tBuy'].forEach(function (t) { document.querySelectorAll(t + ' tbody tr').forEach(function (tr, i) { tr.querySelector('.idx').textContent = i + 1; }); }); }
function padRows() { while ($('#tDeliv tbody').children.length < 5) addDeliv(); while ($('#tBuy tbody').children.length < 3) addBuy(); }

// ─────────────────────────────────────────────
//  계산 — 매출액·관리원가(납품 합)·매입원가(매입 합)·GM·Margin Rate
// ─────────────────────────────────────────────
function calc() {
    var sales = n(getV('amount')), mgmt = 0, qty = 0, buy = 0;
    document.querySelectorAll('#tDeliv tbody tr').forEach(function (tr) {
        var c = n(tr.querySelector('.d-cost').value), q = n(tr.querySelector('.d-qty').value), t = c * q;
        tr.querySelector('.d-tot').value = t ? fmt(t) : (c || q ? '-' : ''); mgmt += t; qty += q;
    });
    document.querySelectorAll('#tBuy tbody tr').forEach(function (tr) {
        var r = rowRate(tr); if (r != null && sales) tr.querySelector('.b-tot').value = fmt(sales * r / 100);
        buy += n(tr.querySelector('.b-tot').value);
    });
    var hw = n(getV('hwcost')), cost = mgmt + hw + buy, gm = sales - cost;
    $('#dQty').value = qty ? fmt(qty) : '-'; $('#dSum').value = mgmt ? fmt(mgmt) : '-'; $('#bSum').value = buy ? fmt(buy) : '-';
    $('#cSales').value = '₩' + (fmt(sales) || '0'); $('#cCost').value = '₩' + (fmt(cost) || '0'); $('#cMgmt').value = '₩ ' + (fmt(mgmt) || '-'); $('#cBuy').value = '₩ ' + (fmt(buy) || '-');
    $('#cGm').value = '₩ ' + (fmt(gm) || '-'); $('#cRate').value = sales ? Math.round(gm / sales * 100) + '%' : '-';
    document.querySelectorAll('textarea').forEach(function (t) { t.style.height = 'auto'; t.style.height = Math.max(20, t.scrollHeight) + 'px'; });
}
document.addEventListener('input', function (e) {
    var el = e.target; if (!el.matches || !el.matches('input,textarea,select')) return;
    if (el.classList.contains('money') && !el.matches(':focus')) el.value = fmt(n(el.value));
    if (el.matches('.page input, .page textarea')) calc();
});
document.addEventListener('blur', function (e) { var el = e.target; if (el && el.classList && el.classList.contains('money')) { el.value = n(el.value) ? (Number.isInteger(n(el.value)) ? fmt(n(el.value)) : n(el.value).toLocaleString('ko-KR', { maximumFractionDigits: 2 })) : ''; calc(); } }, true);
// 결재선: 전결 단계(팀장·본부장·COO·대표이사) + 협조 라인(영업관리팀·경영지원본부) 조합, 칸을 직접 눌러 사선을 바꾸면 «직접 지정»
document.addEventListener('click', function (e) { var td = e.target.closest && e.target.closest('td.sig'); if (td) { td.classList.toggle('skip'); $('#qAppr').value = 'custom'; } });
var APPR_SKIP = { tl: ['a3', 'a4', 'a5'], bu: ['a4', 'a5'], coo: ['a5'], ceo: [] };
function setAppr(mode) {
    if (mode === 'custom') return;
    document.querySelectorAll('td.sig').forEach(function (td) { td.classList.remove('skip'); });
    var skip = (APPR_SKIP[mode] || []).slice();
    if (!$('#qCoop1').checked) skip = skip.concat(['b1', 'b2']);
    if (!$('#qCoop2').checked) skip = skip.concat(['b3', 'b4', 'b5']);
    skip.forEach(function (s) { var td = document.querySelector('td.sig[data-s="' + s + '"]'); if (td) td.classList.add('skip'); });
}
$('#qAppr').addEventListener('change', function () { setAppr(this.value); });
$('#qCoop1').addEventListener('change', function () { if ($('#qAppr').value === 'custom') $('#qAppr').value = 'bu'; setAppr($('#qAppr').value); });
$('#qCoop2').addEventListener('change', function () { if ($('#qAppr').value === 'custom') $('#qAppr').value = 'bu'; setAppr($('#qAppr').value); });
$('#qKind').addEventListener('change', function () { if (R.contractId) prefill(R.contracts.find(function (c) { return c.id === R.contractId; }), true); else if (R.cust) prefillSettle(); });
$('#qMonth').addEventListener('change', function () { if (R.contractId) prefill(R.contracts.find(function (c) { return c.id === R.contractId; }), true); else if (R.cust) prefillSettle(); });

// ─────────────────────────────────────────────
//  데이터 적재 · 고객/계약 선택
// ─────────────────────────────────────────────
async function loadAll() {
    var s = sess(); if (!s) return;
    try {
        var res = await Promise.all([
            sbAll('customers?select=id,name&order=name'), sbAll('contracts?select=*&order=id'),
            sbGet('mgmt_costs?select=*&active=is.true&order=year.desc,item'),
            sbGet('project_reports?select=id,contract_id,customer,kind,report_month,report_no,title,amount,status,updated_at,created_by&order=updated_at.desc&limit=400')
        ]);
        R.customers = res[0]; R.contracts = res[1]; R.costs = res[2]; R.reports = res[3];
    } catch (e) { warn('포탈 데이터를 읽지 못했습니다: ' + e.message); return; }
    R.byCust = {}; R.customers.forEach(function (c) { R.byCust[c.id] = c.name; });
    fillModelList();
    var names = {}; R.contracts.forEach(function (c) { var nm = R.byCust[c.customer_id]; if (nm) names[nm] = 1; });
    $('#dlCust').innerHTML = Object.keys(names).sort().map(function (nm) { return tpl`<option value="${nm}">`; }).join('');
    var who = (s.u || '').split('@')[0]; if (WRITERS[who]) setV('writer', WRITERS[who]);   // 로그인 계정으로 기본 선택 (김민정·최형우·송기영)
}
$('#qCust').addEventListener('change', function () { pickCustomer(this.value); });
$('#qCust').addEventListener('input', function () { var v = this.value; if (Object.keys(R.byCust).some(function (id) { return R.byCust[id] === v; })) pickCustomer(v); });
function pickCustomer(name) {
    R.cust = name; R.contractId = null;
    var ids = Object.keys(R.byCust).filter(function (id) { return R.byCust[id] === name; }).map(Number);
    var rows = R.contracts.filter(function (c) { return ids.indexOf(c.customer_id) >= 0; });
    var live = rows.filter(function (c) { return ['해지', '서비스종료', 'CN전환'].indexOf(c.status) < 0; });
    var old = rows.length - live.length;
    $('#chips').innerHTML = tpl`${rawHtml(live.map(function (c) {
        return tpl`<span class="chip" data-id="${rawHtml(c.id)}">${c.contract_type || c.status || ''} · ${LINE_MODEL[c.line] || c.line || ''}${rawHtml(c.qty ? ' ' + fmt(c.qty) + '노드' : '')}<small> ${ym(c.start_month)}~${ym(c.end_month) || '무약정'} · ${c.billing || ''}${rawHtml(c.mrr ? ' · 월 ' + fmt(c.mrr) + '원' : '')}</small></span>`;
    }).join('') + (old ? tpl`<span class="chip" style="cursor:default;color:#999">종료·해지 ${rawHtml(old)}건 제외</span>` : ''))}`+
        tpl`<span class="chip" data-settle="1" title="이 고객의 이 달 전체 매출을 합산(에스원 월 대금 등)">Σ 월 정산(집계)</span>`;
    setV('customer', name);
    var prev = R.reports.find(function (r) { return r.customer === name; });
    $('#hint').innerHTML = live.length ? '계약을 누르면 자동으로 채워집니다.' + (prev ? ' 이 고객의 이전 리포트(' + esc(prev.title || '') + ')에서 담당자·매출흐름·매입내역을 이어받습니다.' : '') : '진행 중 계약이 없습니다. 「Σ 월 정산」 또는 직접 입력으로 작성하세요.';
}
$('#chips').addEventListener('click', function (e) {
    var ch = e.target.closest('.chip'); if (!ch) return;
    $('#chips').querySelectorAll('.chip').forEach(function (c) { c.classList.remove('on'); }); ch.classList.add('on');
    if (ch.dataset.settle) { R.contractId = null; $('#qKind').value = 'settle'; prefillSettle(); return; }
    var c = R.contracts.find(function (x) { return x.id === +ch.dataset.id; }); if (!c) return;
    R.contractId = c.id;
    var k = c.contract_type === '재약정' ? 'renew' : c.contract_type === '추가' ? 'add' : 'new';
    if (!c.end_month && /월/.test(c.billing || '')) k = 'monthly';
    $('#qKind').value = k; prefill(c, false);
});

// ─────────────────────────────────────────────
//  자동 채움
// ─────────────────────────────────────────────
function costKey(item) { var k = String(item || '').trim().toLowerCase().replace(/\s+/g, ' '); return COST_ALIAS[k] || item; }
function costFor(item, dateIso) {
    var y = +String(dateIso || todayISO()).slice(0, 4), want = String(costKey(item) || '').toLowerCase().replace(/\s+/g, '');
    if (!want) return null;
    var pool = R.costs.filter(function (c) { return c.year <= y; }).sort(function (a, b) { return b.year - a.year; });
    var hit = pool.find(function (c) { return String(c.item || '').toLowerCase().replace(/\s+/g, '') === want; });                         // 정확히 같은 품목
    if (!hit) hit = pool.find(function (c) { return String(c.item || '').toLowerCase().split('/').map(function (t) { return t.trim().replace(/\s+/g, ''); }).indexOf(want) >= 0; });   // «NAC / ZTNA» 의 한 토큰
    return hit || null;
}
// 납품행 MODEL 을 바꾸면 원가 제안: SW = 연 단가(1년차) · HW(임대) = 매입단가 ÷ 5년 ÷ 12 × 계약개월 (감가상각)
function suggestCost(tr) {
    var model = tr.querySelector('.d-model').value, ci = tr.querySelector('.d-cost');
    if (!model || (ci.value && ci.value !== ci.dataset.auto)) return;
    var c = costFor(model, getV('cdate') || todayISO()); if (!c) return;
    var months = n(getV('warranty')) || 12, v;
    if (c.category === 'HW' && c.purchase_cost) v = +c.purchase_cost / 5 / 12 * months; else v = +c.unit_cost;
    ci.value = Number.isInteger(v) ? fmt(v) : v.toLocaleString('ko-KR', { maximumFractionDigits: 2 }); ci.dataset.auto = ci.value; calc();
}
document.addEventListener('change', function (e) { if (e.target && e.target.classList && e.target.classList.contains('d-model')) suggestCost(e.target.closest('tr')); });
function prevReport(name) {
    var p = R.reports.find(function (r) { return r.customer === name; }); return p || null;
}
async function loadPayload(id) { var rows = await sbGet('project_reports?select=payload&id=eq.' + id); return rows && rows[0] ? rows[0].payload : null; }
function clearDoc(keepHeader) {
    document.querySelectorAll('.page [data-k]').forEach(function (el) { if (['team1', 'team2', 'team3', 'dept', 'writer', 'payterm'].indexOf(el.dataset.k) >= 0 && keepHeader) return; el.value = ''; });
    $('#tDeliv tbody').innerHTML = ''; $('#tBuy tbody').innerHTML = ''; padRows();
    setV('payterm', '익월 말 결제'); if ($('#qAppr').value !== 'custom') setAppr($('#qAppr').value);
}
async function prefill(c, keepUser) {
    if (!c) return;
    var kind = $('#qKind').value, name = R.byCust[c.customer_id] || '';
    var user = { no: getV('no'), writer: getV('writer'), contact: getV('contact') };
    clearDoc(true); R.id = null; $('#btnSave').textContent = '저장';
    var today = todayISO(), model = LINE_MODEL[c.line] || c.line || '';
    var term = +c.term_months || 0, years = term ? Math.round(term / 12) : 0;
    var monthly = /월/.test(c.billing || ''), yearly = /연/.test(c.billing || '');
    var mrr = +c.mrr || 0, total = +c.total_amount || (mrr * term) || 0;
    var qm = $('#qMonth').value; var baseMonth = qm ? qm + '-01' : today.slice(0, 7) + '-01';
    var parent = c.parent_contract_id ? R.contracts.find(function (x) { return x.id === c.parent_contract_id; }) : null;
    var root = parent || c;
    var k = monthsBetween(root.start_month, baseMonth) + 1;                      // 이번 달이 전체 기간 중 몇 번째 달인지
    var rootTerm = +root.term_months || 0;
    var titles = { new: model + (c.version === '6.0' ? ' V6.0' : '') + ' 신규 도입', add: model + ' 추가 구매', renew: model + ' ' + (years || 3) + '년 재약정', qty: model + ' 추가 구매 - 수량 변경', monthly: model + ' 신규 도입(무약정)', settle: '클라우드 NAC ' + (+baseMonth.slice(5, 7)) + '월 대금', subs: model + ' 구독료' };
    setV('customer', name); setV('title', titles[kind] || ''); setV('date', today); setV('cdate', today);
    setV('no', user.no); setV('writer', user.writer);
    var amount = (kind === 'monthly' || kind === 'subs') ? mrr : total;
    setV('amount', fmt(amount)); setV('taxdate', monthEnd(today, 0)); setV('paydate', monthEnd(today, 1));
    setV('warranty', (kind === 'monthly' || kind === 'settle' || kind === 'subs') ? '1개월' : (term ? term + '개월' : ''));
    setV('saletype', /에스원/.test(name) ? '직접판매' : (/조달/.test(c.sale_type || '') ? '조달' : '간접판매'));
    // 납품내역 — 관리원가 기준 × 적용개월/12
    // 단가 연도: 신규·재약정은 계약일 기준, 추가·수량변경은 원계약의 현재 연차가 시작된 달 기준(첨부 리포트의 «25년 기준» 방식)
    var costDate = today;
    if ((kind === 'add' || kind === 'qty') && parent && root.start_month) { var cs = new Date(root.start_month + 'T00:00:00'); cs.setMonth(cs.getMonth() + 12 * Math.floor(Math.max(k - 1, 0) / 12)); costDate = cs.getFullYear() + '-' + String(cs.getMonth() + 1).padStart(2, '0') + '-01'; }
    var cost = costFor(model, costDate), unit = cost ? +cost.unit_cost : 0, months = 12, note = '1년차';
    if (kind === 'add' || kind === 'qty') { if (parent && rootTerm) { var cyc = ((k - 1) % 12); months = 12 - cyc; note = '[' + k + '~' + Math.min(k + months - 1, rootTerm) + '/' + rootTerm + '](' + months + '개월)'; } else { months = 12; note = '1년차'; } }
    if (kind === 'monthly') { months = 0; note = '1개월' + (rootTerm ? '[' + k + '/' + rootTerm + ']' : ''); }
    if (kind === 'renew') { months = 12; note = '1년차' + (yearly && mrr ? '\n(' + fmt(mrr) + '원 / 月)' : ''); }
    if (kind === 'subs') { months = 0; note = ''; }
    var d = $('#tDeliv tbody').children[0];
    d.querySelector('.d-model').value = model; d.querySelector('.d-qty').value = c.qty ? +c.qty : ''; d.querySelector('.d-note').value = note;
    var cval = unit * months / 12; d.querySelector('.d-cost').value = cval ? (Number.isInteger(cval) ? fmt(cval) : cval.toLocaleString('ko-KR', { maximumFractionDigits: 2 })) : '0';
    if (!cost) warn('관리원가 기준에 「' + model + '」 ' + costDate.slice(0, 4) + '년 단가가 없습니다 — 「관리원가 기준」에 등록하면 자동 계산됩니다.'); else warn('');
    // 매출흐름·매입·담당자 — 이전 리포트가 있으면 이어받음
    var flow = name + (c.channel ? ' - ' + c.channel : '') + ' - 지니언스' + (c.partner ? ' - ' + c.partner : '');
    var prev = prevReport(name), pl = null;
    if (prev) { try { pl = await loadPayload(prev.id); } catch (e) {} }
    if (pl) {
        setV('contact', pl.contact || user.contact); setV('flow', pl.flow || flow); if (pl.saletype) setV('saletype', pl.saletype);
        if (pl.buy && pl.buy.length) { $('#tBuy tbody').innerHTML = ''; pl.buy.forEach(function (b) { if (b.name || b.tot) addBuy(Object.assign({}, b, { tot: b.rate != null ? 0 : b.tot })); }); padRows(); }
        if (pl.dept) setV('dept', pl.dept); if (pl.team1) setV('team1', pl.team1); if (pl.team2) setV('team2', pl.team2); if (pl.team3) setV('team3', pl.team3);
    } else { setV('contact', user.contact); setV('flow', flow); if (c.partner) { var b = $('#tBuy tbody').children[0]; b.querySelector('.b-name').value = c.partner; } }
    // 비고
    var rem = [];
    var range = ym(c.start_month) && ym(c.end_month) ? kYY(c.start_month) + ' ~ ' + kYY(c.end_month) : '';
    if (kind === 'monthly') rem = ['- 월 과금으로 분할 결제 (' + fmt(mrr) + '원/vat별도)', '- 무약정으로 매월 프로젝트리포트 상신'];
    else if (kind === 'renew') rem = [yearly ? '- 연납입 (연 ' + fmt(total / (years || 1)) + '원 / VAT 별도 * ' + years + '년)' : '- 매월 분할 납부 (월 ' + fmt(mrr) + '원 / VAT별도 * ' + term + '개월)', range ? '- 계약기간 : ' + range : ''];
    else if (kind === 'settle') rem = [' - 신규 0건, 해약 0건, 연장 0건', '  ※ 상세 내역 별첨'];
    else if (kind === 'subs') rem = ['- 고객사별 구독료/월 형태로 과금 (' + fmt(mrr) + '원 / vat별도)'];
    else rem = [yearly ? '- 매년 분할 납부 (연 ' + fmt(total / (years || 1)) + '원 / VAT별도 * ' + years + '년)' : monthly ? '- 매월 분할 납부 (월 ' + fmt(mrr) + '원 / VAT별도 * ' + term + '개월)' : '- 일시납 (' + fmt(total) + '원 / VAT별도)', range ? '- 계약 기간(' + term + '개월) : ' + range : ''];
    setV('remarks', rem.filter(Boolean).join('\n'));
    calc();
}
// 월 정산(집계): 그 고객의 진행 중 계약 월 매출 합산 (monthly_revenue 기준월)
async function prefillSettle() {
    var name = R.cust; if (!name) return;
    var user = { no: getV('no'), writer: getV('writer'), contact: getV('contact') };
    clearDoc(true); R.id = null; $('#btnSave').textContent = '저장';
    var qm = $('#qMonth').value || todayISO().slice(0, 7); var base = qm + '-01', today = todayISO();
    var ids = Object.keys(R.byCust).filter(function (id) { return R.byCust[id] === name; }).map(Number);
    var rows = R.contracts.filter(function (c) { return ids.indexOf(c.customer_id) >= 0; });
    var sum = 0, cnt = 0, newC = 0, endC = 0;
    try {
        var mr = rows.length ? await sbAll('monthly_revenue?select=contract_id,amount&month=eq.' + base + '&contract_id=in.(' + rows.map(function (c) { return c.id; }).join(',') + ')') : [];
        mr.forEach(function (m) { sum += +m.amount || 0; if (+m.amount) cnt++; });
    } catch (e) { warn('월 매출을 읽지 못했습니다: ' + e.message); }
    rows.forEach(function (c) { if (ym(c.start_month) === qm) newC++; if (c.status === '해지' && ym(c.end_month) === qm) endC++; });
    var M = +qm.slice(5, 7);
    setV('customer', name); setV('title', '클라우드 NAC ' + M + '월 대금'); setV('date', today); setV('cdate', today); setV('no', user.no); setV('writer', user.writer); setV('contact', user.contact);
    setV('amount', fmt(sum)); setV('taxdate', today); setV('paydate', monthEnd(today, 1)); setV('warranty', '1개월'); setV('saletype', /에스원/.test(name) ? '직접판매' : '간접판매');
    var d = $('#tDeliv tbody').children[0]; d.querySelector('.d-model').value = name + ' 클라우드 NAC'; d.querySelector('.d-cost').value = '0'; d.querySelector('.d-qty').value = 1; d.querySelector('.d-note').value = kYY(base) + '분';
    setV('flow', name + ' - 지니언스');
    setV('remarks', ' - 신규 ' + newC + '건, 해약 ' + endC + '건, 연장 0건 (과금 ' + cnt + '건)\n  ※ 상세 내역 별첨');
    var prev = prevReport(name); if (prev) { try { var pl = await loadPayload(prev.id); if (pl) { if (pl.contact) setV('contact', pl.contact); if (pl.flow) setV('flow', pl.flow); } } catch (e) {} }
    warn(cnt ? '' : qm + ' 월 매출 데이터가 없습니다 — 금액을 직접 입력하세요.');
    calc();
}

// ─────────────────────────────────────────────
//  저장·불러오기·복제·인쇄
// ─────────────────────────────────────────────
function collect() {
    var p = {};
    document.querySelectorAll('.page [data-k]').forEach(function (el) { p[el.dataset.k] = el.value; });
    p.deliv = Array.from(document.querySelectorAll('#tDeliv tbody tr')).map(delivData).filter(function (r) { return r.model || r.cost || r.qty || r.note; });
    p.buy = Array.from(document.querySelectorAll('#tBuy tbody tr')).map(buyData).filter(function (r) { return r.name || r.tot || r.desc; });
    p.skip = Array.from(document.querySelectorAll('td.sig.skip')).map(function (td) { return td.dataset.s; });
    p.kind = $('#qKind').value; p.appr = $('#qAppr').value; p.coop1 = $('#qCoop1').checked; p.coop2 = $('#qCoop2').checked; p.month = $('#qMonth').value; p.contract_id = R.contractId;
    p.calc = { sales: $('#cSales').value, cost: $('#cCost').value, gm: $('#cGm').value, rate: $('#cRate').value };
    return p;
}
function apply(p) {
    clearDoc(false);
    Object.keys(p).forEach(function (k) { if (['deliv', 'buy', 'skip', 'kind', 'appr', 'coop1', 'coop2', 'month', 'contract_id', 'calc'].indexOf(k) < 0) setV(k, p[k]); });
    $('#tDeliv tbody').innerHTML = ''; (p.deliv || []).forEach(addDeliv); $('#tBuy tbody').innerHTML = ''; (p.buy || []).forEach(function (b) { addBuy(Object.assign({}, b, { rate: b.rate })); }); padRows();
    document.querySelectorAll('td.sig').forEach(function (td) { td.classList.toggle('skip', (p.skip || []).indexOf(td.dataset.s) >= 0); });
    if (p.kind) $('#qKind').value = p.kind; if (p.appr) $('#qAppr').value = p.appr; if (p.coop1 != null) $('#qCoop1').checked = !!p.coop1; if (p.coop2 != null) $('#qCoop2').checked = !!p.coop2; $('#qMonth').value = p.month || ''; R.contractId = p.contract_id || null;
    calc();
}
async function saveReport() {
    var s = sess(); if (!s) { alert('로그인이 필요합니다'); return; }
    var p = collect(); if (!p.customer) { alert('고객명을 입력하세요'); return; }
    var row = { contract_id: p.contract_id || null, customer: p.customer, kind: p.kind, report_month: p.month ? p.month + '-01' : null, report_no: p.no || null, title: p.title || null, amount: n(p.amount) || null, payload: p, created_by: s.u || null };
    $('#btnSave').disabled = true;
    try {
        if (R.id) { await sbWrite('PATCH', 'project_reports?id=eq.' + R.id, row); }
        else { var r = await sbWrite('POST', 'project_reports?select=id', [row], 'return=representation'); R.id = r && r[0] ? r[0].id : null; }
        $('#btnSave').textContent = '저장됨 ✓'; setTimeout(function () { $('#btnSave').textContent = '저장'; }, 1500);
        R.reports = await sbGet('project_reports?select=id,contract_id,customer,kind,report_month,report_no,title,amount,status,updated_at,created_by&order=updated_at.desc&limit=400');
    } catch (e) { alert(e.message); }
    $('#btnSave').disabled = false;
}
function newReport() { if (!confirm('작성 중인 내용을 지우고 새로 시작할까요?')) return; R.id = null; R.contractId = null; clearDoc(true); $('#chips').querySelectorAll('.chip').forEach(function (c) { c.classList.remove('on'); }); setV('date', todayISO()); $('#btnSave').textContent = '저장'; calc(); }
function openList() { $('#ovlList').classList.add('show'); renderList(); }
function closeOvl(id) { $('#' + id).classList.remove('show'); }
function renderList() {
    var q = ($('#lstQ').value || '').trim().toLowerCase();
    var rows = R.reports.filter(function (r) { return !q || ((r.customer || '') + ' ' + (r.title || '')).toLowerCase().indexOf(q) >= 0; }).slice(0, 200);
    $('#lstSt').textContent = rows.length + '건';
    $('#lstT tbody').innerHTML = rows.map(function (r) {
        return tpl`<tr><td>${String(r.updated_at || '').slice(0, 10)}</td><td>${r.customer}</td><td>${KIND_LABEL[r.kind] || r.kind}</td><td>${ym(r.report_month)}</td><td>${r.title || ''}</td><td style="text-align:right">${rawHtml(fmt(r.amount))}</td><td><span class="tag ${r.status === 'issued' ? 'issued' : ''}">${r.status === 'issued' ? '발행' : '작성중'}</span></td>`+
            tpl`<td style="white-space:nowrap"><button class="rowbtn" data-click="loadReport(${rawHtml(r.id)})">열기</button> <button class="rowbtn" data-click="cloneReport(${rawHtml(r.id)})" title="다음 달 리포트로 복제">복제</button> <button class="rowbtn red" data-click="delReport(${rawHtml(r.id)})">삭제</button></td></tr>`;
    }).join('') || '<tr><td colspan="8" style="color:#888">저장된 리포트가 없습니다</td></tr>';
}
async function loadReport(id) {
    try { var p = await loadPayload(id); if (!p) throw new Error('없는 리포트'); if (p.customer) { $('#qCust').value = p.customer; pickCustomer(p.customer); } apply(p); R.id = id; R.cust = p.customer; if (p.contract_id) { var ch = $('#chips .chip[data-id="' + p.contract_id + '"]'); if (ch) ch.classList.add('on'); } $('#btnSave').textContent = '저장'; closeOvl('ovlList'); } catch (e) { alert(e.message); }
}
async function cloneReport(id) {
    try {
        var p = await loadPayload(id); if (!p) return;
        var m = p.month || (p.date || todayISO()).slice(0, 7); var d = new Date(m + '-01T00:00:00'); d.setMonth(d.getMonth() + 1);
        var nm = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        p.month = nm; p.no = ''; p.date = todayISO(); p.cdate = todayISO(); p.taxdate = monthEnd(todayISO(), 0); p.paydate = monthEnd(todayISO(), 1);
        (p.deliv || []).forEach(function (r) { r.note = String(r.note || '').replace(/\[(\d+)(~\d+)?\/(\d+)\]/, function (_, a, b, t) { return '[' + (+a + 1) + (b ? '~' + (+b.slice(1) + 1) : '') + '/' + t + ']'; }); });
        if (/월 대금|월분/.test(p.title || '')) p.title = String(p.title).replace(/(\d+)월/, (+nm.slice(5, 7)) + '월');
        if (p.customer) { $('#qCust').value = p.customer; pickCustomer(p.customer); } apply(p); R.id = null; R.cust = p.customer; $('#btnSave').textContent = '저장 (새 리포트)'; closeOvl('ovlList');
        warn('이전 리포트를 ' + nm + ' 기준으로 복제했습니다. NO.·금액·비고를 확인하고 저장하세요.');
    } catch (e) { alert(e.message); }
}
async function delReport(id) { if (!confirm('이 리포트를 삭제할까요?')) return; try { await sbWrite('DELETE', 'project_reports?id=eq.' + id); R.reports = R.reports.filter(function (r) { return r.id !== id; }); if (R.id === id) R.id = null; renderList(); } catch (e) { alert(e.message); } }
async function printReport() {
    calc();
    var d = (getV('date') || todayISO()).replace(/-/g, '').slice(2);
    var old = document.title; document.title = d + '_' + (getV('customer') || '고객') + '_프로젝트리포트';
    if (R.id) { try { await sbWrite('PATCH', 'project_reports?id=eq.' + R.id, { status: 'issued' }); } catch (e) {} }
    window.print(); setTimeout(function () { document.title = old; }, 1500);
}

// ─────────────────────────────────────────────
//  관리원가 기준 — 표 + 공지 PDF → AI 추출(mode: mgmtcost) → 확인 후 저장
// ─────────────────────────────────────────────
var COST_NEW = [];
// ㊿+154: 새 원가 항목 칸 — 예전 인라인 COST_NEW[i].x=this.value
function costSet(i, k, v) { if (COST_NEW[i]) COST_NEW[i][k] = v; }
function costDel(i) { COST_NEW.splice(i, 1); renderCost(); }
function openCost() { $('#ovlCost').classList.add('show'); COST_NEW = []; renderCost(); }
function renderCost() {
    var st = $('#costSt');
    var html = (COST_NEW.length ? '<tr><td colspan="9" style="background:#fff3cd;font-size:11px;color:#7a5c00">새 항목 (연도 · 구분 · 품목명 · 매입단가 · 관리원가 · 기준 · 비고 · 근거) — 확인 후 「새 항목 저장」</td></tr>' : '') + COST_NEW.map(function (c, i) {
        return tpl`<tr style="background:#fffbe6"><td><input value="${c.year}" data-input="costSet(${rawHtml(i)},'year',this.value)"></td><td><select data-change="costSet(${rawHtml(i)},'category',this.value)" style="border:1px solid #ddd;border-radius:5px;background:#fff"><option${c.category === 'HW' ? ' selected' : ''}>HW</option><option${c.category !== 'HW' ? ' selected' : ''}>SW</option></select></td><td><input value="${c.item}" data-input="costSet(${rawHtml(i)},'item',this.value)"></td><td><input value="${c.purchase_cost || ''}" data-input="costSet(${rawHtml(i)},'purchase_cost',this.value)" style="text-align:right" placeholder="HW만"></td><td><input value="${c.unit_cost}" data-input="costSet(${rawHtml(i)},'unit_cost',this.value)" style="text-align:right"></td><td><input value="${c.unit || '노드/년'}" data-input="costSet(${rawHtml(i)},'unit',this.value)"></td><td><input value="${c.note || ''}" data-input="costSet(${rawHtml(i)},'note',this.value)"></td><td><input value="${c.source || ''}" data-input="costSet(${rawHtml(i)},'source',this.value)"></td><td><button class="rowbtn red" data-click="costDel(${rawHtml(i)})">빼기</button></td></tr>`;
    }).join('');
    // 공지 표와 같은 모양(구분 · 품목명 · 매입단가 · 연도별 관리원가)으로 피벗
    var years = []; R.costs.forEach(function (c) { if (years.indexOf(c.year) < 0) years.push(c.year); }); years.sort();
    var groups = {}, order = [];
    R.costs.forEach(function (c) { var key = (c.category || 'SW') + '|' + c.item; if (!groups[key]) { groups[key] = { category: c.category || 'SW', item: c.item, purchase_cost: c.purchase_cost, note: c.note, unit: c.unit, by: {}, ids: [] }; order.push(key); } groups[key].by[c.year] = c; groups[key].ids.push(c.id); if (c.purchase_cost) groups[key].purchase_cost = c.purchase_cost; if (c.note) groups[key].note = c.note; });
    order.sort(function (a, b) { var ga = groups[a], gb = groups[b]; if (ga.category !== gb.category) return ga.category === 'HW' ? -1 : 1; return String(ga.item).localeCompare(String(gb.item), 'ko', { numeric: true }); });
    $('#costT thead').innerHTML = tpl`<tr><th style="width:50px">구분</th><th>품목명</th><th style="width:100px">매입단가</th>${rawHtml(years.map(function (y) { return tpl`<th style="width:110px;text-align:right">${rawHtml(String(y).slice(2))}년 관리원가</th>`; }).join(''))}<th style="width:70px">기준</th><th>비고(적용 규칙)</th><th style="width:60px"></th></tr>`;
    var last = null;
    html += order.map(function (k) {
        var g = groups[k]; var sep = last && last !== g.category ? ' style="border-top:2px solid #333"' : ''; last = g.category;
        return tpl`<tr${rawHtml(sep)}><td><b>${g.category}</b></td><td>${g.item}</td><td style="text-align:right;color:#777">${rawHtml(g.purchase_cost ? fmt(g.purchase_cost) : '')}</td>`+
            tpl`${rawHtml(years.map(function (y) { var c = g.by[y]; return tpl`<td style="text-align:right${c ? '' : ';color:#bbb'}">${rawHtml(c ? fmt(c.unit_cost) : '-')}</td>`; }).join(''))}`+
            tpl`<td>${g.unit || ''}</td><td style="font-size:11px;color:#555">${g.note || ''}</td><td><button class="rowbtn red" data-click="costDelMany([${rawHtml(g.ids.join(','))}])">삭제</button></td></tr>`;
    }).join('');
    $('#costT tbody').innerHTML = html || '<tr><td colspan="9" style="color:#888">등록된 기준이 없습니다</td></tr>';
    if (!st.textContent) st.textContent = R.costs.length + '건 등록';
}
function fillModelList() { var seen = {}; var opts = ['Cloud NAC', 'Cloud ZTNA']; R.costs.forEach(function (c) { if (!seen[c.item]) { seen[c.item] = 1; opts.push(c.item); } }); $('#dlModel').innerHTML = opts.map(function (o) { return tpl`<option value="${o}">`; }).join(''); }
function costAddRow() { COST_NEW.unshift({ year: new Date().getFullYear(), category: 'SW', item: '', purchase_cost: '', unit_cost: '', unit: '노드/년', note: '', source: '' }); renderCost(); }
async function costFromPdf() {
    var f = $('#costPdf').files && $('#costPdf').files[0], st = $('#costSt');
    if (!f) { st.textContent = 'PDF 파일을 먼저 선택하세요'; st.className = 'st bad'; return; }
    if (f.size > 4 * 1024 * 1024) { st.textContent = '4MB 이하 PDF만 가능합니다'; st.className = 'st bad'; return; }
    st.textContent = '⏳ AI가 공지 PDF를 읽는 중… (10~20초)'; st.className = 'st';
    try {
        var b64 = await new Promise(function (res, rej) { var rd = new FileReader(); rd.onload = function () { res(String(rd.result).split(',')[1] || ''); }; rd.onerror = function () { rej(new Error('파일을 읽지 못했습니다')); }; rd.readAsDataURL(f); });
        var j = await aiFetch({ mode: 'mgmtcost', pdf: b64 });
        if (!j || !j.ok || !j.costs) throw new Error((j && j.error) || '분석 실패');
        var rows = (j.costs.items || []).map(function (r) { var hw = String(r.category || '').toUpperCase() === 'HW'; return { year: r.year || j.costs.year || new Date().getFullYear(), category: hw ? 'HW' : 'SW', item: r.item || '', purchase_cost: r.purchase_cost || '', unit_cost: r.unit_cost || '', unit: r.unit || (hw ? '대/년' : '노드/년'), note: r.note || '', source: f.name }; });
        if (!rows.length) throw new Error('표에서 항목을 찾지 못했습니다');
        COST_NEW = rows.concat(COST_NEW); renderCost();
        st.textContent = rows.length + '개 항목을 읽었습니다 — 노란 줄을 확인·수정한 뒤 「새 항목 저장」'; st.className = 'st ok';
    } catch (e) { st.textContent = e.message; st.className = 'st bad'; }
}
async function costSaveNew() {
    var s = sess(); var st = $('#costSt');
    var rows = COST_NEW.filter(function (c) { return c.item && n(c.unit_cost); }).map(function (c) { return { year: +c.year || new Date().getFullYear(), category: c.category || 'SW', item: String(c.item).trim(), purchase_cost: n(c.purchase_cost) || null, unit_cost: n(c.unit_cost), unit: c.unit || (c.category === 'HW' ? '대/년' : '노드/년'), note: c.note || null, source: c.source || null, created_by: s ? s.u : null }; });
    if (!rows.length) { st.textContent = '저장할 새 항목이 없습니다 (항목·단가 필수)'; st.className = 'st bad'; return; }
    try {
        for (var i = 0; i < rows.length; i++) {   // 같은 연도·항목이 있으면 비활성으로 돌리고 새 값 저장
            var dup = R.costs.filter(function (c) { return c.year === rows[i].year && c.item === rows[i].item; });
            for (var k = 0; k < dup.length; k++) await sbWrite('PATCH', 'mgmt_costs?id=eq.' + dup[k].id, { active: false });
        }
        await sbWrite('POST', 'mgmt_costs', rows);
        R.costs = await sbGet('mgmt_costs?select=*&active=is.true&order=year.desc,item'); COST_NEW = []; fillModelList();
        st.textContent = rows.length + '건 저장'; st.className = 'st ok'; renderCost();
    } catch (e) { st.textContent = e.message; st.className = 'st bad'; }
}
async function costDelMany(ids) { if (!confirm('이 품목의 기준(' + ids.length + '건)을 삭제(비활성)할까요?')) return; try { await sbWrite('PATCH', 'mgmt_costs?id=in.(' + ids.join(',') + ')', { active: false }); R.costs = R.costs.filter(function (c) { return ids.indexOf(c.id) < 0; }); renderCost(); fillModelList(); } catch (e) { alert(e.message); } }

// ─────────────────────────────────────────────
//  시작
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function () {
    if (!sess()) return;
    $('#loginOverlay').style.display = 'none';
    padRows(); setV('date', todayISO()); setAppr('bu'); calc();
    await loadAll();
    var params = new URLSearchParams(location.search);
    if (params.get('id')) loadReport(+params.get('id'));
    else if (params.get('cust')) { $('#qCust').value = params.get('cust'); pickCustomer(params.get('cust')); }
});
window.addEventListener('message', function (ev) { if (ev && ev.data && ev.data.type === 'reportReset') { /* 포탈 메뉴 재클릭: 그대로 유지 */ } });

/* 버튼·입력칸이 부르는 함수 (data-click · data-change · data-input → sat/common.js) — 여기 없는 이름은 실행되지 않음 */
SAT.act({
  cloneReport: cloneReport,
  closeOvl: closeOvl,
  costAddRow: costAddRow,
  costDel: costDel,
  costDelMany: costDelMany,
  costFromPdf: costFromPdf,
  costSaveNew: costSaveNew,
  costSet: costSet,
  delReport: delReport,
  delRow: delRow,
  dupBuy: dupBuy,
  dupDeliv: dupDeliv,
  goPortalLogin: goPortalLogin,
  loadReport: loadReport,
  newReport: newReport,
  openCost: openCost,
  openList: openList,
  printReport: printReport,
  renderList: renderList,
  saveReport: saveReport
});
