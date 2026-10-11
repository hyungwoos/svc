/* ===== sat/close.js — 정산 월 마감 · 수정 이력 (S1 정산 s1 · KK 정산 kk · 프로젝트 리포트 report) · ㊿+176 · SQL 107 =====
   · 고전 스크립트 · sat/db.js 다음(sbGet · hdr · esc) · 쓰기는 페이지의 sbWrite(settle.js · report.js)
   · 월 마감(period_locks): 마감한 달은 DB 가 저장 · 삭제를 막음 → 화면은 미리 알려 주고 버튼을 숨김
       마감 = 그 화면 «쓰기» 권한(admin · editor) · 마감 풀기 = 슈퍼 관리자 · 사유 필수 → 변경 이력
   · 수정 이력(doc_hist): 고치거나 지우기 «전»의 값 → «이 판으로 되돌리기»(되돌린 것도 이력에 남음)
   · 프로젝트 리포트는 달이 아니라 «발행»(인쇄)하면 잠김 → 슈퍼 관리자 «발행 취소»(사유 필수)
   · SQL 107 전이면(표가 없음) 아무것도 보이지 않고 예전처럼 동작 */
var CLS = { kind: null, table: null, label: '', ok: null, sup: false, locks: {}, hist: [], onRefresh: null };
var CLS_OP = { update: '고침', delete: '삭제', issue: '발행', reopen: '발행 취소', restore: '되돌림' };

/** 페이지 시작 때 — kind: 's1' | 'kk' | null(리포트) · table: 's1_settle' | 'kk_settle' | 'project_reports' */
async function clsInit(kind, table, label, onRefresh) {
  CLS.kind = kind; CLS.table = table; CLS.label = label; CLS.onRefresh = onRefresh || null;
  await clsLoad();
}
async function clsLoad() {
  if (!sess()) return;
  try {
    var r = await fetch(SB_URL + '/rest/v1/period_locks?select=*' + (CLS.kind ? '&kind=eq.' + CLS.kind : '&limit=1'), { headers: hdr() });
    CLS.ok = r.ok; var m = {}; if (r.ok) (await r.json() || []).forEach(function (x) { m[x.period] = x; }); CLS.locks = m;
  } catch (e) { CLS.ok = false; }
  try { var s = await fetch(SB_URL + '/rest/v1/rpc/is_super_admin', { method: 'POST', headers: hdr(true), body: '{}' }); CLS.sup = s.ok ? (await s.json()) === true : false; } catch (e) { CLS.sup = false; }
}
function clsLocked(ym) { return (ym && CLS.locks[String(ym).slice(0, 7)]) || null; }
/** 저장 · 삭제 전에 — 마감된 달이면 안내 문구(막음) · 아니면 '' */
function clsBlockMsg(ym) { var l = clsLocked(ym); return l ? String(ym).slice(0, 7) + ' ' + CLS.label + '은 마감됐습니다(' + String(l.locked_by || '').split('@')[0] + ' · ' + String(l.locked_at || '').slice(0, 10) + ') — 슈퍼 관리자가 «마감 풀기» 후 고칠 수 있습니다' : ''; }
/** 저장 내역의 달 머리에 붙일 것 — 🔒 마감 표시 · 마감 / 마감 풀기 · (이력은 줄마다) */
function clsMonthTag(ym) {
  if (!CLS.ok) return '';
  var l = clsLocked(ym);
  if (l) return tpl`<span class="cls-lock" title="${l.note || '마감됨'}">🔒 마감 · ${String(l.locked_by || '').split('@')[0]} ${String(l.locked_at || '').slice(5, 10)}</span>` +
    (CLS.sup ? tpl`<button class="rowbtn" data-click="clsUnlock('${ym}')">마감 풀기…</button>` : '');
  return tpl`<button class="rowbtn" data-click="clsLock('${ym}')" title="마감하면 슈퍼 관리자가 풀기 전까지 이 달을 고치거나 지울 수 없습니다">🔒 마감…</button>`;
}
async function clsLock(ym) {
  if (!confirm(ym + ' ' + CLS.label + '을 마감합니다.\n마감하면 슈퍼 관리자가 «마감 풀기» 전까지 이 달을 고치거나 지울 수 없습니다. 마감할까요?')) return;
  try { await sbWrite('POST', 'rpc/period_lock', { p_kind: CLS.kind, p_period: ym, p_note: null }); await clsLoad(); if (CLS.onRefresh) CLS.onRefresh(ym + ' 마감했습니다'); }
  catch (e) { alert('마감하지 못했습니다 — ' + e.message); }
}
async function clsUnlock(ym) {
  var why = prompt(ym + ' ' + CLS.label + ' 마감을 풉니다 — 사유를 적어 주세요(변경 이력에 남습니다)', '');
  if (why == null) return; why = String(why).trim(); if (why.length < 2) { alert('사유를 두 글자 이상 적어 주세요'); return; }
  try { await sbWrite('POST', 'rpc/period_unlock', { p_kind: CLS.kind, p_period: ym, p_reason: why }); await clsLoad(); if (CLS.onRefresh) CLS.onRefresh(ym + ' 마감을 풀었습니다'); }
  catch (e) { alert('마감을 풀지 못했습니다 — ' + e.message); }
}
/** 이력 창 — ref 가 있으면 그 행만 · 없으면 이 표 전체(지운 것 포함) 최근 40건 */
async function clsHist(ref) {
  var ov = document.getElementById('ovlHist');
  if (!ov) { ov = document.createElement('div'); ov.id = 'ovlHist'; ov.className = 'ovl'; document.body.appendChild(ov); }
  ov.innerHTML = tpl`<div class="pan" role="dialog" aria-modal="true" aria-labelledby="clsH"><h3><span id="clsH">🕘 ${CLS.label} 수정 이력${ref ? ' — #' + ref : ''}</span><button class="rowbtn" data-click="clsClose()">✕ 닫기</button></h3>` +
    tpl`<p class="st" id="clsCap">읽는 중…</p><div style="max-height:60vh;overflow:auto" id="clsBody"></div><div class="msg" id="clsMsg"></div></div>`;
  ov.classList.add('show');
  var rows = null;
  try { var r = await fetch(SB_URL + '/rest/v1/doc_hist?select=id,at,actor,ref,period,op,old,note&kind=eq.' + CLS.table + (ref ? '&ref=eq.' + encodeURIComponent(String(ref)) : '') + '&order=at.desc&limit=40', { headers: hdr() }); if (r.ok) rows = await r.json(); } catch (e) {}
  var cap = document.getElementById('clsCap'), body = document.getElementById('clsBody');
  if (rows === null) { cap.textContent = '이력을 읽지 못했습니다 — SQL 107 을 실행했는지 확인해 주세요'; return; }
  CLS.hist = rows;
  cap.textContent = rows.length ? '고치거나 지우기 «전»의 내용입니다. «이 판으로 되돌리기»를 누르면 지금 내용도 이력에 남습니다.' : '아직 고치거나 지운 기록이 없습니다.';
  body.innerHTML = rows.length ? tpl`<table><thead><tr><th>언제</th><th>누가</th><th>무엇</th><th>대상</th><th style="text-align:right">그때 금액</th><th></th></tr></thead><tbody>${rawHtml(rows.map(function (h, i) {
    var o = h.old || {}, amt = o.total != null ? o.total : o.amount, what = (o.kind === 'use' ? '사용료' : o.kind === 'install' ? '설치비' : (o.title || o.customer || ''));
    var locked = h.period && clsLocked(h.period), can = CLS.table === 'project_reports' ? h.op !== 'issue' : !locked;
    return tpl`<tr><td>${String(h.at || '').slice(0, 16).replace('T', ' ')}</td><td>${String(h.actor || '').split('@')[0]}</td><td>${CLS_OP[h.op] || h.op}${rawHtml(h.note ? tpl`<div class="mini">${h.note}</div>` : '')}</td>` +
      tpl`<td>${h.period || ''} ${what} #${h.ref}</td><td style="text-align:right">${rawHtml(amt != null ? fmtN(amt) : '')}</td>` +
      tpl`<td>${rawHtml(can ? tpl`<button class="rowbtn" data-click="clsRestore(${rawHtml(i)})">이 판으로 되돌리기…</button>` : (locked ? '<span class="mini">마감된 달</span>' : ''))}</td></tr>`;
  }).join(''))}</tbody></table>` : '';
}
function clsClose() { var o = document.getElementById('ovlHist'); if (o) o.classList.remove('show'); }
function fmtN(v) { v = Math.round(Number(v) || 0); return v.toLocaleString('ko-KR'); }
/** 되돌리기 — 지운 것은 다시 넣고(새 번호) · 고친 것은 그때 값으로 덮어씀 · 리포트는 발행 상태는 건드리지 않음 */
async function clsRestore(i) {
  var h = CLS.hist[i]; if (!h || !h.old) return;
  var o = Object.assign({}, h.old), id = o.id, msgEl = document.getElementById('clsMsg');
  if (h.period && clsLocked(h.period)) { alert(clsBlockMsg(h.period)); return; }
  ['id', 'created_at', 'updated_at', 'report_id'].forEach(function (k) { delete o[k]; });
  if (CLS.table === 'project_reports') { delete o.status; }
  if (!confirm(String(h.at || '').slice(0, 16).replace('T', ' ') + ' ' + (CLS_OP[h.op] || h.op) + ' 전의 내용으로 되돌립니다.\n' + (h.op === 'delete' ? '지운 기록을 다시 넣습니다(새 번호).' : '지금 내용은 이력에 남습니다.') + '\n\n되돌릴까요?')) return;
  try {
    if (h.op === 'delete') { delete o.created_by; await sbWrite('POST', CLS.table, [Object.assign(o, { created_by: (sess() || {}).u || null })], 'return=minimal'); }
    else { delete o.created_by; await sbWrite('PATCH', CLS.table + '?id=eq.' + id, o); }
    clsClose(); if (CLS.onRefresh) CLS.onRefresh('되돌렸습니다 (#' + (id || '') + ')');
  } catch (e) { if (msgEl) { msgEl.textContent = e.message; msgEl.className = 'msg bad'; } }
}
/** 프로젝트 리포트 — 발행 취소(슈퍼 관리자 · 사유) */
async function clsReopen(id) {
  var why = prompt('발행을 취소하고 다시 고칠 수 있게 합니다 — 사유를 적어 주세요(변경 이력에 남습니다)', '');
  if (why == null) return; why = String(why).trim(); if (why.length < 2) { alert('사유를 두 글자 이상 적어 주세요'); return; }
  try { var ok = await sbWrite('POST', 'rpc/report_reopen', { p_id: id, p_reason: why }); if (CLS.onRefresh) CLS.onRefresh(ok ? '발행을 취소했습니다 — 이제 고칠 수 있습니다' : '이미 발행 취소된 리포트입니다'); }
  catch (e) { alert('발행을 취소하지 못했습니다 — ' + e.message); }
}
/** 페이지 sbWrite 공통: DB 오류 본문에서 사람이 읽을 문구(마감 · 발행 · 권한)만 꺼냄 */
function clsErrText(t) { var m = null; try { m = JSON.parse(t).message; } catch (e) {} return m || ''; }
SAT.act({ clsLock: clsLock, clsUnlock: clsUnlock, clsHist: clsHist, clsClose: clsClose, clsRestore: clsRestore, clsReopen: clsReopen });
