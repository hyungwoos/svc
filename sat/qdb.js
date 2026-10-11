/* ===== sat/qdb.js — 견적을 포탈 DB 에(quotes · SQL 109) · ㊿+177 =====
   · 고전 스크립트 · sat/quote.js 다음(SB_URL · SB_KEY · qToken · qRefresh · portalSess · collectQuoteData · applyQuoteData · selectQuoteType · isPo · enterDocViewMode)
   · 💾 저장: DB 에 넣거나 고침 — 처음 저장할 때 DB 가 견적 번호(Q-YYMM-NNN · 견적일의 연월)를 매김 → 문서 «견적번호»에 표시
   · PDF 발행: 먼저 DB 저장 → 상태 «발송» → (예전 그대로) GitHub 자동 저장 → 인쇄
   · 발송한 견적은 내용을 고칠 수 없음(DB 가 막음) → 고쳐서 저장하면 «새 번호로 저장»(원래 견적과 parent_id 로 이어짐)
   · 📋 견적 목록: 최근 견적 — 번호 · 고객 · 금액 · 상태 · 불러오기
   · 주소 ?qid=번호(id) — 그 견적 불러오기 · ?oi=OI번호 — 저장할 때 그 OI 에 연결(고객사명이 비었으면 OI 고객사로) · ?view=q:Q-… — 읽기 전용
   · SQL 109 전(표 없음)이면 저장 단추가 안내만 하고 예전처럼 동작(GitHub 저장 · JSON 파일은 그대로) */
var QDB = { ok: null, id: null, no: null, status: null, oi: null, oiName: '', saved: '', busy: false, list: [] };
var QDB_ST = { '작성': 'draft', '발송': 'sent', '수주': 'won', '실주': 'lost' };

async function qdbFetch(path, opts) {
    opts = opts || {};
    var go = async function () { var t = await qToken(); return fetch(SB_URL + '/rest/v1/' + path, Object.assign({}, opts, { headers: Object.assign({ apikey: SB_KEY, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, opts.headers || {}) })); };
    var r = await go();
    if (r.status === 401 && await qRefresh()) r = await go();
    return r;
}
async function qdbErr(r) {
    var t = await r.text(), m = '';
    try { m = JSON.parse(t).message || ''; } catch (e) {}
    if (r.status === 404 || /PGRST205|does not exist/.test(t)) { QDB.ok = false; return 'SQL 109(견적 DB)를 먼저 실행해 주세요 — 그 전에는 «GitHub ▾» 저장을 쓰세요'; }
    if (/row-level security/.test(t)) return '견적을 저장할 권한이 없습니다(견적·발주 시스템 «쓰기»)';
    return m || ('HTTP ' + r.status);
}
/** 지금 화면 → DB 한 줄 */
function qdbNum(s) { return Number(String(s == null ? '' : s).replace(/[^0-9.-]/g, '')) || 0; }
function qdbRow() {
    var d = collectQuoteData(), po = isPo();
    return { doc_type: po ? 'po' : 'quote', qtype: po ? 'po' : (window.currentQuoteType === 'public' ? 'public' : 'enterprise'),
        customer_name: String(d.customerName || '').trim(), quote_date: d.quoteDate || null, manager: d.manager || null,
        supply_total: qdbNum(d.supplyTotal), grand_total: qdbNum(d.grandTotal), data: d, oi_id: QDB.oi || null };
}
/** 저장된 뒤 화면을 고쳤는지 비교용(저장 시각은 빼고) */
function qdbSig() { var d = collectQuoteData(); delete d.savedAt; return JSON.stringify(d) + '|' + (QDB.oi || ''); }
function qdbShow() {
    var row = document.getElementById('quoteNoRow'), t = document.getElementById('quoteNoTxt'), st = document.getElementById('qdbState');
    if (row && t) { row.style.display = QDB.no && !isPo() ? 'flex' : 'none'; t.textContent = QDB.no || ''; }
    if (st) {
        var bits = [];
        if (QDB.id) bits.push((QDB.no || '발주서 #' + QDB.id) + ' · ' + QDB.status + (qdbSig() !== QDB.saved ? ' · 고친 내용 저장 안 됨' : ''));
        else if (QDB.ok !== false) bits.push('DB 에 저장 안 됨');
        if (QDB.oi) bits.push('OI #' + QDB.oi + (QDB.oiName ? ' ' + QDB.oiName : '') + ' 연결');
        st.textContent = bits.join(' · ');
        st.className = 'qdb-state no-print' + (QDB.status ? ' ' + (QDB_ST[QDB.status] || '') : '');
    }
}
/** 💾 저장 — 반환: 저장된 줄 | null(취소 · 실패) */
async function qdbSave(quiet) {
    if (QDB.busy) return null;
    if (!portalSess()) { alert('포탈 로그인이 필요합니다'); return null; }
    var row = qdbRow();
    if (!row.customer_name) { alert('고객사명을 입력해 주세요'); return null; }
    var sent = !!QDB.id && QDB.status && QDB.status !== '작성';
    if (sent && qdbSig() === QDB.saved) { if (!quiet) alert(QDB.no + ' 은(는) 이미 저장돼 있습니다(바뀐 것 없음)'); return { id: QDB.id, quote_no: QDB.no, status: QDB.status }; }
    if (sent && !confirm((QDB.no || '#' + QDB.id) + ' 은(는) 이미 발송한 견적입니다(' + QDB.status + ').\n고친 내용은 «새 번호»로 저장합니다 — 원래 견적은 그대로 남습니다.\n\n새 번호로 저장할까요?')) return null;
    QDB.busy = true;
    try {
        var r;
        if (QDB.id && !sent) r = await qdbFetch('quotes?id=eq.' + QDB.id + '&select=id,quote_no,status', { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
        else { if (sent) row.parent_id = QDB.id; r = await qdbFetch('quotes?select=id,quote_no,status', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) }); }
        if (!r.ok) throw new Error(await qdbErr(r));
        var x = ((await r.json()) || [])[0];
        if (!x) throw new Error('저장되지 않았습니다 — 권한(견적·발주 시스템 «쓰기»)을 확인하거나 목록을 다시 열어 주세요');
        QDB.ok = true; QDB.id = x.id; QDB.no = x.quote_no; QDB.status = x.status; QDB.saved = qdbSig();
        qdbShow();
        if (!quiet) qdbToast((x.quote_no || '발주서 #' + x.id) + ' 저장했습니다' + (sent ? ' (새 번호)' : ''));
        return x;
    } catch (e) { if (!quiet) alert('저장하지 못했습니다 — ' + e.message); else throw e; return null; }
    finally { QDB.busy = false; }
}
/** PDF 발행 직전(quote.js prepareAndPrint) — DB 저장 + «발송» · 실패해도 발행은 계속(예전과 같게) · false = 사용자가 취소 */
async function qdbBeforePrint() {
    if (QDB.ok === false || !portalSess()) return true;
    if (!String((document.getElementById('customerName') || {}).value || '').trim()) return true;   // 고객사명이 없으면 DB 저장 없이 예전처럼 발행
    try {
        if (!QDB.id || qdbSig() !== QDB.saved) { var x = await qdbSave(true); if (!x) return QDB.ok === false ? true : false; }
        if (QDB.id && QDB.status === '작성') {
            var r = await qdbFetch('quotes?id=eq.' + QDB.id + '&select=id,status', { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: '발송' }) });
            if (!r.ok) throw new Error(await qdbErr(r));
            var y = ((await r.json()) || [])[0]; if (y) { QDB.status = y.status; QDB.saved = qdbSig(); }
        }
        qdbShow();
    } catch (e) { if (QDB.ok !== false) alert('⚠ 포탈 DB 에 저장하지 못했지만 발행은 계속합니다.\n' + e.message); }
    return true;
}
function qdbToast(t) {
    var el = document.getElementById('qdbToast');
    if (!el) { el = document.createElement('div'); el.id = 'qdbToast'; el.className = 'qdb-toast no-print'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = t; el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(function () { el.classList.remove('show'); }, 3200);
}
/** DB 의 한 줄을 화면으로 */
async function qdbApply(x, view) {
    var type = x.doc_type === 'po' ? 'po' : (x.qtype === 'public' ? 'public' : 'enterprise');
    if (window.currentQuoteType !== type || !window.__quoteInit) { selectQuoteType(type); await new Promise(function (res) { setTimeout(res, 50); }); }
    applyQuoteData(x.data || {});
    QDB.id = x.id; QDB.no = x.quote_no; QDB.status = x.status; QDB.oi = x.oi_id || null; QDB.oiName = ''; QDB.ok = true;
    QDB.saved = qdbSig(); qdbShow();
    if (view) enterDocViewMode();
}
async function qdbOpen(id, view) {
    if (QDB.id !== id && QDB.id && qdbSig() !== QDB.saved && !confirm('지금 견적에 저장하지 않은 내용이 있습니다. 다른 견적을 열까요?')) return false;
    var r = await qdbFetch('quotes?select=*&id=eq.' + encodeURIComponent(id));
    if (!r.ok) { alert('견적을 불러오지 못했습니다 — ' + await qdbErr(r)); return false; }
    var x = ((await r.json()) || [])[0]; if (!x) { alert('그 견적이 없거나 볼 권한이 없습니다'); return false; }
    await qdbApply(x, view); qdbListClose(); return true;
}
/** 주소로 열기(quote.js enterQuote) — 처리하면 true */
function qdbFromUrl(params) {
    var qid = params.get('qid'), v = params.get('view') || '';
    if (!qid && !/^q:/.test(v)) return false;
    (async function () {
        var path = qid ? 'quotes?select=*&id=eq.' + encodeURIComponent(qid) : 'quotes?select=*&quote_no=eq.' + encodeURIComponent(v.slice(2));
        try {
            var r = await qdbFetch(path); if (!r.ok) throw new Error(await qdbErr(r));
            var x = ((await r.json()) || [])[0]; if (!x) throw new Error('그 견적이 없거나 볼 권한이 없습니다');
            await qdbApply(x, !qid);
        } catch (e) { selectQuoteType('enterprise'); alert('견적을 불러오지 못했습니다 — ' + e.message); }
    })();
    return true;
}
/** ?oi= — 저장할 때 그 OI 에 연결 · 고객사명이 비었으면 OI 고객사로 */
async function qdbOiFromUrl() {
    var oi = new URLSearchParams(location.search).get('oi'); if (!oi || !/^\d+$/.test(oi)) return;
    QDB.oi = +oi;
    try {
        var r = await qdbFetch('oi_deals?select=id,customer,deal_name&id=eq.' + oi);
        var x = r.ok ? ((await r.json()) || [])[0] : null;
        if (x) { QDB.oiName = x.customer || ''; var c = document.getElementById('customerName'); if (c && !c.value.trim() && x.customer) { c.value = x.customer; if (typeof updateQuoteMessage === 'function') try { updateQuoteMessage(); } catch (e) {} } }
    } catch (e) {}
    qdbShow();
}
/** 📋 견적 목록(최근 60) */
async function qdbList() {
    var m = document.getElementById('qdbListModal'), b = document.getElementById('qdbListBody');
    if (!m || !b) return;
    m.style.display = 'flex'; b.innerHTML = '<div class="qdb-empty">불러오는 중…</div>';
    var q = (document.getElementById('qdbQ') || {}).value || '';
    var r = await qdbFetch('quotes?select=id,quote_no,doc_type,customer_name,quote_date,grand_total,status,oi_id,created_by&order=id.desc&limit=60' + (q.trim() ? '&or=(customer_name.ilike.*' + encodeURIComponent(q.trim().replace(/[*,()]/g, '')) + '*,quote_no.ilike.*' + encodeURIComponent(q.trim().replace(/[*,()]/g, '')) + '*)' : ''));
    if (!r.ok) { b.innerHTML = tpl`<div class="qdb-empty bad">${await qdbErr(r)}</div>`; return; }
    var rows = (await r.json()) || []; QDB.list = rows;
    b.innerHTML = rows.length ? tpl`<table class="qdb-tbl"><thead><tr><th>번호</th><th>견적일</th><th>고객사</th><th style="text-align:right">합계(원)</th><th>상태</th><th></th></tr></thead><tbody>${rawHtml(rows.map(function (x, i) {
        return tpl`<tr${rawHtml(x.id === QDB.id ? ' class="on"' : '')}><td>${x.quote_no || '발주서 #' + x.id}</td><td>${String(x.quote_date || '')}</td><td>${x.customer_name}${rawHtml(x.oi_id ? tpl` <span class="qdb-oi">OI #${String(x.oi_id)}</span>` : '')}</td>` +
            tpl`<td style="text-align:right">${Math.round(Number(x.grand_total) || 0).toLocaleString('ko-KR')}</td><td><span class="qdb-st ${QDB_ST[x.status] || ''}">${x.status}</span></td><td><button type="button" class="qdb-open" data-click="qdbOpenAt(${rawHtml(i)})">불러오기</button></td></tr>`;
    }).join(''))}</tbody></table>` : '<div class="qdb-empty">저장된 견적이 없습니다 — 💾 저장을 누르면 여기에 쌓입니다</div>';
}
function qdbOpenAt(i) { var x = QDB.list[i]; if (x) qdbOpen(x.id, false); }
function qdbListClose() { var m = document.getElementById('qdbListModal'); if (m) m.style.display = 'none'; }
function qdbSaveClick() { qdbSave(false); }
/** 새 견적(번호 없이) — 화면 내용은 그대로 두고 DB 연결만 끊음 · «다른 이름으로» */
function qdbDetach() {
    if (!QDB.id) return;
    if (!confirm('지금 화면 내용을 «새 견적»으로 시작합니다 — 다음 저장 때 새 번호를 받습니다(원래 ' + (QDB.no || '#' + QDB.id) + ' 은 그대로).\n계속할까요?')) return;
    QDB.id = null; QDB.no = null; QDB.status = null; QDB.saved = ''; qdbShow();
}
document.addEventListener('input', function () { if (QDB.id) qdbShow(); }, true);
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { var m = document.getElementById('qdbListModal'); if (m && m.style.display === 'flex') qdbListClose(); } });
SAT.act({ qdbSaveClick: qdbSaveClick, qdbList: qdbList, qdbOpenAt: qdbOpenAt, qdbListClose: qdbListClose, qdbDetach: qdbDetach });
