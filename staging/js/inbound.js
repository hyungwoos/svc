/* ===== inbound.js — 인바운드 관리 · 장표 메모 · 주간회의 =====
   ES 모듈(㊿+153) — 다른 파일의 이름은 아래 import 로만 씀 · 이 파일의 최상위 var/function 은 전부 export · 즉시 실행 문장은 js/init.js 의 start() 에 */
import { ST } from './state.js';
import { $, axTime, esc, fetchT, lline, rawHtml, tpl, won } from './core.js';
import { SB_RAW, sbTry, sbWrite, toast, todayStr } from './shell.js';
import { idxs, MX_LIST, renderInstall, renderMatrix, statusOf } from './dash.js';
import { DV, renderGrid, switchView, xlsxBook } from './grid.js';
import { closeOvl, logChange, openOvl } from './edit.js';
import { openCust360 } from './tools.js';
import { ask } from './ai.js';
import { ntfName } from './notify.js';


/* ===== 인바운드 관리 — 통계 + 목록 (원본: 구글시트, 매일 아침 자동 동기화) ===== */

/* ===== 월별 종합 장표 셀 메모 ===== */
export var MXM={};                       // 'line|Y|M' → {id, body, updated_by, updated_at}
export function mxKey(line,Y,M){ return (line||'')+'|'+Y+'|'+M; }
export function loadMxMemos(cb){
  sbTry('mx_memos?select=*&order=year.desc,month.desc').then(function(rows){
    MXM={};
    (rows||[]).forEach(function(r){ MXM[mxKey(r.line||'', r.year, r.month)]=r; });
    ST.RAWX._mxAt=Date.now();
    if(cb) cb();
  }).catch(function(){ /* 51단계 SQL 미설치 — 메모 기능만 비활성 */ });
}
export function mxCanEdit(){ return !!(ST.SB_TOKEN && !ST.IS_VIEWER); }
export function closeMxPop(){
  var e=document.getElementById('mxPop'); if(e) e.remove();
  document.removeEventListener('keydown', mxPopEsc);
}
export function mxPopEsc(e){ if(e.key==='Escape') closeMxPop(); }
export function mxPlace(box, td){
  var r=td.getBoundingClientRect(), w=box.offsetWidth, h=box.offsetHeight;
  box.style.left=Math.min(Math.max(8, r.left-w/2+r.width/2), innerWidth-w-8)+'px';
  var top=(r.bottom+h+12>innerHeight? Math.max(8, r.top-h-8) : r.bottom+8);
  if(top+h>innerHeight-8) top=Math.max(8, innerHeight-h-8);
  box.style.top=top+'px';
}
/* 장표 셀 하나에 들어간 계약들 — 장표와 같은 필터(MX_LIST)로 계산 */
export function mxDetailRows(line, Y, M){
  var idx=(Y-2020)*12+(M-6);
  var out=[];
  if(idx<0||idx>=M_TOTAL()) return out;
  (MX_LIST||idxs()).forEach(function(k){
    var r=ST.DATA.rows[k];
    if(line && r.line!==line) return;
    var v=ST.MAT[k][idx]; if(!v) return;
    out.push({k:k, cust:r.cust, line:r.line, ptn:r.ptn||'', ch:r.channel||'', st:statusOf(r)||'', ctype:r.ctype||'', amt:v});
  });
  out.sort(function(a,b){ return b.amt-a.amt; });
  return out;
}
export function M_TOTAL(){ return (typeof ST.M==='number')? ST.M : 0; }
export function mxDetailHtml(rows, cellSum){
  if(!rows.length) return '<div class="ro" style="text-align:center;color:var(--muted)">이 달에 인식 금액이 있는 계약이 없습니다</div>';
  var sum=rows.reduce(function(a,x){ return a+x.amt; },0);
  var h='<div class="mxdet"><table><thead><tr><th>고객사</th><th>서비스</th><th>파트너</th><th>채널</th><th>상태</th><th class="n">월 금액(천원)</th></tr></thead><tbody>';
  rows.slice(0,300).forEach(function(x,i){
    var stc=/해지|중지/.test(x.st)? ' style="color:var(--critical)"' : '';
    h+=tpl`<tr data-i="${rawHtml(i)}" title="계약 화면에서 «${x.cust}» 보기"><td><b>${x.cust}</b></td><td>${lline(x.line)}</td>`+
       tpl`<td>${x.ptn}</td><td>${x.ch}</td><td${rawHtml(stc)}>${x.st}</td><td class="n">${won(x.amt)}</td></tr>`;
  });
  h+=tpl`</tbody><tfoot><tr><td colspan="5">합계 ${rows.length}건${rows.length>300? ' (상위 300건 표시)':''}</td><td class="n">${won(sum)}</td></tr></tfoot></table></div>`;
  if(cellSum!=null && Math.round(cellSum)!==Math.round(sum))
    h+=tpl`<div class="who" style="color:var(--critical);margin-top:6px">⚠ 셀 금액(${won(cellSum)})과 내역 합계(${won(sum)})가 다릅니다 — 화면을 새로고침해 주세요</div>`;
  else h+='<div class="who" style="margin-top:6px">셀 금액과 내역 합계가 일치합니다 · 줄을 누르면 그 고객사의 계약 화면으로 이동</div>';
  return h;
}
/* opts.detail = {html, count, sum, go(i)}  — 설치비처럼 다른 내역을 같은 팝업에 얹을 때 */
export function openMxMemo(td, line, Y, M, label, startTab, opts){
  closeMxPop();
  opts=opts||{};
  var k=mxKey(line,Y,M), cur=MXM[k], ed=mxCanEdit();
  var det, cellSum, detHtml, detGo;
  if(opts.detail){
    det=new Array(opts.detail.count||0); cellSum=opts.detail.sum||0; detHtml=opts.detail.html; detGo=opts.detail.go;
  }else{
    det=mxDetailRows(line,Y,M);
    cellSum=det.reduce(function(a,x){ return a+x.amt; },0);
    detHtml=mxDetailHtml(det, cellSum);
    detGo=function(i){ var x=det[i]; if(!x) return; switchView('contracts'); var sInp=$('#dvSearch'); if(sInp){ sInp.value=x.cust; DV.page=0; renderGrid(); } };
  }
  var tab=startTab || 'det';                      // 기본은 «내역» — 메모는 셀에 마우스만 올려도 미리 보이므로
  var box=document.createElement('div'); box.className='mxpop'+(tab==='det'?' wide':''); box.id='mxPop';
  var when=cur&&cur.updated_at? String(cur.updated_at).replace('T',' ').slice(0,16):'';
  box.innerHTML=
    tpl`<h4>${label} · ${rawHtml(Y)}년 ${rawHtml(M)}월</h4>`+
    tpl`<div class="mxtabs">`+
      tpl`<button data-t="det" aria-pressed="${tab==='det'}">📋 내역 ${det.length}건 · ${won(cellSum)}천원</button>`+
      tpl`<button data-t="memo" aria-pressed="${tab==='memo'}">📝 특이사항 메모${rawHtml(cur? ' <span class="dot"></span>':'')}</button>`+
    tpl`</div>`+
    tpl`<div id="mxPaneDet"${tab==='det'?'':' hidden'}>${rawHtml(detHtml)}`+
      tpl`<div class="act"><span class="sp"></span><button class="pill ghost" id="mxClose2">닫기</button></div></div>`+
    tpl`<div id="mxPaneMemo"${tab==='memo'?'':' hidden'}>`+
    tpl`<div class="who">${rawHtml(cur? esc(cur.updated_by||'')+(when? ' · '+when+' 수정':'') : '아직 메모가 없습니다')}</div>`+ tpl`${rawHtml(ed? tpl`<textarea id="mxTa" placeholder="예)\nVS. 25년12월 -28,733원\n#. 해지 -443,533원\n1. 대신엔에스(와이드넷) : 191,000 > 19,100 (-171,900)\n#. 신규 +414,800원\n1. 서울대학교관악학생생활관 : 242,000원">${cur?cur.body:''}</textarea>`
       : tpl`<div class="ro">${rawHtml(cur? esc(cur.body) : '내용이 없습니다')}</div>`)}`+
    tpl`<div class="act"><span class="msg" id="mxMsg"></span><span class="sp"></span>`+ tpl`${rawHtml(ed&&cur? '<button class="pill ghost" id="mxDel" style="color:var(--critical,#d03b3b);border-color:rgba(208,59,59,.35)">삭제</button>':'')}`+
    tpl`<button class="pill ghost" id="mxCancel">${ed?'취소':'닫기'}</button>`+ tpl`${rawHtml(ed? '<button class="pill pri" id="mxSave">저장</button>':'')}`+
    tpl`</div></div>`;
  document.body.appendChild(box);
  // 탭 전환
  box.querySelectorAll('.mxtabs button').forEach(function(b){
    b.onclick=function(){
      var t=b.dataset.t;
      box.querySelectorAll('.mxtabs button').forEach(function(x){ x.setAttribute('aria-pressed', x.dataset.t===t?'true':'false'); });
      document.getElementById('mxPaneDet').hidden = t!=='det';
      document.getElementById('mxPaneMemo').hidden = t!=='memo';
      box.classList.toggle('wide', t==='det');
      if(t==='memo'){ var ta0=document.getElementById('mxTa'); if(ta0) ta0.focus(); }
      mxPlace(box, td);
    };
  });
  var c2=document.getElementById('mxClose2'); if(c2) c2.onclick=closeMxPop;
  if(opts.detail && typeof opts.detail.ready==='function'){ try{ opts.detail.ready(box); }catch(e){} }
  // 내역 줄 클릭 → 계약 화면
  box.querySelectorAll('.mxdet tbody tr[data-i]').forEach(function(tr){
    tr.onclick=function(){ var i=+tr.dataset.i; closeMxPop(); if(detGo) detGo(i); };
  });
  mxPlace(box, td);
  document.addEventListener('keydown', mxPopEsc);
  setTimeout(function(){
    document.addEventListener('mousedown', function out(e){
      var p=document.getElementById('mxPop');
      if(p && !p.contains(e.target)){ closeMxPop(); document.removeEventListener('mousedown', out); }
    });
  },0);
  var c=document.getElementById('mxCancel'); if(c) c.onclick=closeMxPop;
  var ta=document.getElementById('mxTa'); if(ta) ta.focus();
  var sv=document.getElementById('mxSave');
  if(sv) sv.onclick=async function(){
    var body=(document.getElementById('mxTa').value||'').trim();
    var msg=document.getElementById('mxMsg'); msg.textContent='저장 중…'; this.disabled=true;
    try{
      if(!body){ await mxRemove(k, cur); }
      else{
        await sbWrite('POST','mx_memos?on_conflict=line,year,month',
          /* 합계 행은 line='' — null 이면 unique 제약에 걸리지 않아 on_conflict 가 동작하지 않습니다 (42P10) */
          [{line:line||'', year:Y, month:M, body:body, updated_by:ST.AUTH_USER||'', updated_at:new Date().toISOString()}],
          'resolution=merge-duplicates');
        MXM[k]={line:line||'',year:Y,month:M,body:body,updated_by:ST.AUTH_USER||'',updated_at:new Date().toISOString()};
        logChange('update','mx_memos',0,{cell:k});
      }
      closeMxPop(); renderMatrix(); try{ renderInstall(); }catch(e){}
      toast('특이사항을 저장했습니다', label+' '+Y+'년 '+M+'월');
    }catch(e){
      var em=String(e.message||e);
      if(/42P10|no unique or exclusion/.test(em)) em='DB 에 51단계 SQL(mx_memos) 최신본이 필요합니다 — 51_mx_memo.sql 을 다시 실행해 주세요';
      else if(/42P01|does not exist/.test(em)) em='메모 표(mx_memos)가 없습니다 — 51_mx_memo.sql 을 먼저 실행해 주세요';
      else if(/42501|row-level security/.test(em)) em='저장 권한이 없습니다 (관리자 이상만 메모를 쓸 수 있습니다)';
      msg.textContent=em.slice(0,140); this.disabled=false;
    }
  };
  var dl=document.getElementById('mxDel');
  if(dl) dl.onclick=async function(){
    if(!confirm('이 셀의 특이사항을 삭제할까요?')) return;
    var msg=document.getElementById('mxMsg'); msg.textContent='삭제 중…';
    try{ await mxRemove(k, cur); closeMxPop(); renderMatrix(); try{ renderInstall(); }catch(e2){} toast('삭제했습니다',''); }
    catch(e){ msg.textContent=String(e.message||e).slice(0,90); }
  };
}
export async function mxRemove(k, cur){
  if(!cur) return;
  await sbWrite('DELETE','mx_memos?year=eq.'+cur.year+'&month=eq.'+cur.month+
    '&line=eq.'+encodeURIComponent(cur.line||''));
  delete MXM[k];
  logChange('delete','mx_memos',0,{cell:k});
}

export function loadInbound(cb){
  sbTry('inbound_leads?select=*&order=on_date.desc,no.desc').then(function(rows){
    ST.RAWX.inbound=rows||[]; ST.RAWX._inbAt=Date.now(); if(cb) cb();
  });
}
export function inbLast(r){
  return [r.on_date,r.s1d,r.s2d,r.s21d,r.s3d].filter(function(d){return d&&/^\d{4}-\d{2}-\d{2}/.test(d);}).sort().pop()||'';
}
export function goInbList(colK, val){
  switchView('inbound');
  if(colK){ DV.filters={}; DV.filters[colK]=[val]; DV.page=0; renderGrid(); }
}
/* ===== 인바운드 «가져온 기록» — Apps Script 가 시트에서 가져올 때마다 inbound_sync_log 에 한 줄 (SQL 74) =====
   주간회의의 «파일명 · 시각 취합» 칩과 같은 역할. 표가 아직 없으면 inbound_leads.synced_at 으로 대신 보여줍니다 */
export var INB_LOG_OPEN=false;
export function loadInbLog(cb){
  sbTry('inbound_sync_log?select=*&order=at.desc&limit=30').then(function(rows){
    ST.RAWX.inbLog=rows||[]; ST.RAWX._inbLogAt=Date.now(); if(cb) cb();
  });
}
export function inbLastSync(){                       // {at, src, ok, counts, error} 또는 null
  var L=ST.RAWX.inbLog||[];
  if(L.length) return L[0];
  var last=''; (ST.RAWX.inbound||[]).forEach(function(r){ if(r.synced_at && String(r.synced_at)>last) last=String(r.synced_at); });
  return last? {at:last, src:'(기록 표 없음 · synced_at 기준)', ok:true, counts:null, _fallback:true} : null;
}
export function inbAgo(v){
  var ms=Date.now()-new Date(/[zZ]|[+\-]\d\d:?\d\d$/.test(String(v))? v : v+'Z').getTime();
  var h=Math.floor(ms/36e5); if(h<1) return '방금'; if(h<48) return h+'시간 전'; return Math.floor(h/24)+'일 전';
}
export function inbCounts(c){ if(!c) return ''; return Object.keys(c).sort().map(function(y){ return y+'년 '+c[y]+'건'; }).join(' · '); }
export function inbSyncBadge(){
  var x=inbLastSync();
  if(!x) return '<span class="mini" style="color:var(--critical,#d03b3b)">· 가져온 기록 없음</span>';
  var h=Math.floor((Date.now()-new Date(/[zZ]|[+\-]\d\d:?\d\d$/.test(String(x.at))? x.at : x.at+'Z').getTime())/36e5);
  var stale=h>=30, bad=(x.ok===false);
  var col=(bad||stale)? 'color:var(--critical,#d03b3b);font-weight:700' : 'color:var(--ink-2)';
  return tpl`<span class="mini" style="${rawHtml(col)}" title="${x.src||''}">· 마지막 가져오기 ${axTime(x.at)} (${inbAgo(x.at)})`+ tpl`${rawHtml(x.src&&!x._fallback? ' · '+esc(x.src):'')}${rawHtml(x.counts? ' · '+esc(inbCounts(x.counts)):'')}`+ tpl`${bad? ' ✕ 실패':''}${stale&&!bad? ' ⚠ 자동 동기화가 멈춘 것 같습니다':''}</span>`;
}
export function inbLogTable(){
  var L=ST.RAWX.inbLog;
  if(L===undefined) return '<div class="mini" style="color:var(--muted);padding:6px 0">기록을 읽는 중…</div>';
  if(!L.length) return '<div class="mini" style="color:var(--muted);padding:6px 0">아직 기록이 없습니다 — Supabase 에서 <b>SQL 74</b> 를 실행하고 Apps Script 를 새 버전으로 배포하면 다음 가져오기부터 여기에 쌓입니다.</div>';
  return tpl`<table class="mini" style="width:100%;border-collapse:collapse;margin-top:6px">`+
    tpl`<thead><tr style="color:var(--muted);text-align:left"><th style="padding:4px 8px">시각</th><th style="padding:4px 8px">방법</th><th style="padding:4px 8px">결과</th><th style="padding:4px 8px">가져온 건수</th><th style="padding:4px 8px">소요</th></tr></thead><tbody>`+
    tpl`${rawHtml(L.map(function(r){
      return tpl`<tr style="border-top:1px solid var(--line,#eee)">`+
        tpl`<td style="padding:4px 8px;white-space:nowrap">${axTime(r.at)} <span style="color:var(--muted)">(${inbAgo(r.at)})</span></td>`+
        tpl`<td style="padding:4px 8px">${r.src||''}</td>`+
        tpl`<td style="padding:4px 8px">${rawHtml(r.ok? '<span style="color:var(--good,#0ca30c)">✓ 성공</span>' : tpl`<span style="color:var(--critical,#d03b3b)">✕ 실패</span>${rawHtml(r.error? tpl` <span title="${r.error}">${String(r.error).slice(0,60)}</span>`:'')}`)}</td>`+
        tpl`<td style="padding:4px 8px">${inbCounts(r.counts)}</td>`+
        tpl`<td style="padding:4px 8px;color:var(--muted)">${rawHtml(r.duration_ms? (r.duration_ms/1000).toFixed(1)+'초':'')}</td></tr>`;
    }).join(''))}`+ tpl`</tbody></table>`;
}
/* 통계·목록 화면 공용: 마지막 가져오기 + 지금 가져오기 + 기록 펼치기 */
export function inbSyncPanel(){
  return tpl`<div class="card" style="padding:10px 14px;margin-bottom:10px">`+
    tpl`<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">`+
      tpl`<b style="font-size:14px">원본(구글시트) → 포탈</b>${rawHtml(inbSyncBadge())}`+
      tpl`<span class="mini" style="color:var(--muted)">· 포탈 목록 읽은 시각 ${rawHtml(ST.RAWX._inbAt? esc(new Date(ST.RAWX._inbAt).toTimeString().slice(0,5)) : '—')}</span>`+
      tpl`<span style="flex:1"></span>`+
      tpl`<button class="pill ghost" id="inbReloadP" title="포탈 DB 에 이미 들어온 인바운드를 다시 읽기만 합니다 (시트·DB 를 바꾸지 않음)">다시 조회</button>`+
      tpl`${rawHtml(ST.IS_VIEWER? '' : '<button class="pill" id="inbFetchP" title="구글시트 원본을 지금 가져와 포탈 DB 에 반영합니다 (매일 아침 7시 자동과 같은 작업 · 최대 1분)">시트에서 가져와 반영…</button>')}`+
      tpl`<button class="pill ghost" id="inbLogTg">🕘 가져온 기록${rawHtml(ST.RAWX.inbLog&&ST.RAWX.inbLog.length? ' ('+ST.RAWX.inbLog.length+')':'')}</button>`+
    tpl`</div>`+
    tpl`<div id="inbLogBox" style="display:${INB_LOG_OPEN?'':'none'}">${rawHtml(inbLogTable())}</div></div>`+
    tpl`${rawHtml(ST.IS_EQUIP? '' : iaCard())}`;   /* ㊿+193 자동 회신 카드 */
}
export function inbWirePanel(host){
  iaWire(host);
  var b=host.querySelector('#inbFetchP'); if(b) b.onclick=function(){ if(confirm('구글시트 원본을 지금 가져와 포탈 DB 에 반영할까요?\n(매일 아침 7시 자동 가져오기와 같은 작업 · 시트에서 지운 행은 포탈에서도 바뀔 수 있음)')) inbRefetch(); };
  var rl=host.querySelector('#inbReloadP'); if(rl) rl.onclick=function(){ rl.disabled=true; ST.RAWX.inbLog=undefined; loadInbLog(function(){ loadInbound(function(){ toast('다시 조회', '포탈 DB 의 인바운드 '+(ST.RAWX.inbound||[]).length+'건을 다시 읽었습니다(시트는 그대로)', 'info'); if(ST.CUR_VIEW==='inbstat') renderInbStat(); else if(ST.CUR_VIEW==='inbound') renderGrid(); }); }); };
  var t=host.querySelector('#inbLogTg'); if(t) t.onclick=function(){
    INB_LOG_OPEN=!INB_LOG_OPEN;
    var box=host.querySelector('#inbLogBox'); if(box) box.style.display=INB_LOG_OPEN?'':'none';
    if(INB_LOG_OPEN && ST.RAWX.inbLog===undefined) loadInbLog(function(){ var bx=host.querySelector('#inbLogBox'); if(bx) bx.innerHTML=inbLogTable(); });
  };
}
/* 인바운드 목록(표) 위에 붙는 패널 */
export function renderInbPanel(){
  var host=document.getElementById('inbHost');
  if(ST.CUR_VIEW!=='inbound'){ if(host) host.style.display='none'; return; }
  if(!host){ var tw=$('#dvTable').parentElement; host=document.createElement('div'); host.id='inbHost'; tw.parentElement.insertBefore(host,tw); }
  host.style.display=''; host.innerHTML=inbSyncPanel(); inbWirePanel(host);
  if(ST.RAWX.inbLog===undefined) loadInbLog(function(){ if(ST.CUR_VIEW==='inbound') renderInbPanel(); });
  if(IA.cfg===undefined) iaLoad(function(){ if(ST.CUR_VIEW==='inbound'){ renderInbPanel(); renderGrid(); } });   /* ㊿+193 */
}
export function renderInbStat(){
  var host=$('#inbBody');
  if(!ST.RAWX.inbound){
    host.innerHTML='<div class="cap" style="padding:40px;text-align:center">인바운드 데이터를 불러오는 중…</div>';
    loadInbound(function(){ if(ST.CUR_VIEW==='inbstat') renderInbStat(); });
    return;
  }
  var ALL=ST.RAWX.inbound;
  if(!ALL.length){
    host.innerHTML=tpl`<section class="card c12" style="max-width:640px;margin:0 auto;text-align:center;padding:40px">`+
      tpl`<h3 style="margin:0 0 8px">📥 인바운드 관리</h3>`+
      tpl`<p class="cap">아직 인바운드 데이터가 없습니다.${rawHtml(ST.IS_SUPER? ' <span class="mini">(관리자: 43_inbound.sql 실행과 Apps Script 배포가 필요합니다)</span>' : ' 회사 인바운드 시트에서 자동으로 가져옵니다.')}</p>`+
      tpl`<button class="pill" id="inbFetch0">↻ 지금 시트에서 가져오기</button></section>`;
    var b0=document.getElementById('inbFetch0'); if(b0) b0.onclick=inbRefetch;
    return;
  }
  var R=ALL.filter(function(x){ return ST.INB_Y==='all' || String(x.y)===ST.INB_Y; });
  var wonL=R.filter(function(x){return x.result==='수주';});
  var amt=wonL.reduce(function(s,x){return s+(Number(x.amount)||0);},0);
  var prog=R.filter(function(x){return /진행중|방문미팅|데모|파트너사|수주 예정|26년 진행/.test(x.result||'');}).length;
  var conv=R.length? Math.round(wonL.length/R.length*1000)/10:0;
  // 오래 머문 진행중 (올해 기준 — 월요일 아침 슬랙 리마인드와 같은 기준)
  var today=Date.now(), stale=[];
  ALL.forEach(function(x){
    if(String(x.y)!==String(new Date().getFullYear()) || x.result!=='진행중') return;
    var last=inbLast(x); if(!last) return;
    var dd=Math.floor((today-new Date(last).getTime())/864e5);
    if(dd>=90) stale.push([dd,x]);   // 3개월
  });
  stale.sort(function(a,b){return b[0]-a[0];});
  // 월별 추이 (선택 연도 vs 전년)
  var curY=ST.INB_Y==='all'? String(new Date().getFullYear()) : ST.INB_Y;
  var prvY=String(+curY-1);
  var cur={}, prv={};
  ALL.forEach(function(x){
    var m=+String(x.on_date||'').slice(5,7); if(!m) return;
    if(String(x.y)===curY) cur[m]=(cur[m]||0)+1;
    else if(String(x.y)===prvY) prv[m]=(prv[m]||0)+1;
  });
  var mx=1; for(var m=1;m<=12;m++) mx=Math.max(mx,cur[m]||0,prv[m]||0);
  var bars='';
  for(m=1;m<=12;m++){
    bars+=tpl`<div class="inb-bc"><div class="c">${rawHtml(cur[m]||'')}</div><div class="bb">`+
      tpl`<div class="b" style="height:${Math.round((cur[m]||0)/mx*88)}px"></div>`+
      tpl`<div class="b prev" style="height:${Math.round((prv[m]||0)/mx*88)}px"></div>`+
      tpl`</div><div class="n">${rawHtml(m)}월</div></div>`;
  }
  function dist(key, top){
    var c={};
    R.forEach(function(x){ var v=x[key]||'-'; c[v]=(c[v]||0)+1; });
    var arr=Object.keys(c).map(function(k){return [k,c[k]];}).sort(function(a,b){return b[1]-a[1];}).slice(0,top);
    var mm=arr.length?arr[0][1]:1;
    return arr.map(function(a){
      return tpl`<div class="inb-dr" data-k="${rawHtml(key)}" data-v="${a[0]}"><span class="nm" title="${a[0]}">${a[0]}</span>`+
        tpl`<span class="tr"><i style="width:${Math.round(a[1]/mm*100)}%"></i></span><span class="ct">${rawHtml(a[1])}건</span></div>`;
    }).join('');
  }
  var yb=['all','2026','2025'].map(function(y){
    var lab=y==='all'?'전체':y+'년';
    return tpl`<button class="pill" data-inby="${rawHtml(y)}" style="${ST.INB_Y===y?'background:var(--brand-t);border-color:var(--brand);color:var(--brand);font-weight:700':''}">${rawHtml(lab)}</button>`;
  }).join(' ');
  host.innerHTML=
    tpl`<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">`+
    tpl`<span style="font-size:18px;font-weight:800">📥 인바운드 통계</span>`+
    tpl`<span class="ubadge sm">₩ 금액 단위 = 천원</span>`+
    tpl`<span class="mini">원본: 구글시트 · 매일 아침 7시 자동 동기화</span>`+
    tpl`<span style="flex:1"></span>${rawHtml(yb)}`+
    tpl`<button class="pill ghost" id="inbGoList">목록 보기 →</button></div>`+
    tpl`${rawHtml(inbSyncPanel())}`+
    tpl`<div class="inb-kpis">`+
    tpl`<div class="inb-kpi"><div class="l">유입 건수</div><div class="v">${rawHtml(R.length.toLocaleString())}건</div><div class="s">${rawHtml(ST.INB_Y==='all'?'25년~현재 누적':ST.INB_Y+'년')}</div></div>`+
    tpl`<div class="inb-kpi"><div class="l">진행중</div><div class="v">${rawHtml(prog)}건</div><div class="s">방문미팅·데모·이관 포함</div></div>`+
    tpl`<div class="inb-kpi"><div class="l">수주</div><div class="v">${wonL.length}건</div><div class="s">전환율 ${rawHtml(conv)}%</div></div>`+
    tpl`<div class="inb-kpi"><div class="l">수주액</div><div class="v">${won(amt)}<small style="font-size:12px;font-weight:600"> 천원</small></div><div class="s">단위: 천원</div></div>`+
    tpl`<div class="inb-kpi warn"><div class="l">3개월+ 무응답</div><div class="v">${stale.length}건</div><div class="s">진행중인데 대응 기록이 오래됨</div></div></div>`+
    tpl`<div class="inb-2">`+
    tpl`<div class="inb-card"><h3>월별 유입 추이 <small><span style="color:var(--brand)">■</span> ${rawHtml(curY)}년 · <span style="color:var(--muted)">■</span> ${rawHtml(prvY)}년</small></h3><div class="inb-bars">${rawHtml(bars)}</div></div>`+
    tpl`<div class="inb-card"><h3>⚠ 오래 머문 진행중 <small>마지막 대응 후 3개월 경과 · 월요일 아침 슬랙 리마인드</small></h3>`+
    tpl`<div class="inb-stale" style="max-height:150px;overflow:auto">`+ tpl`${rawHtml(stale.slice(0,30).map(function(a){
      return tpl`<a data-inbid="${rawHtml(a[1].id)}"><span><b>${a[1].org}</b> · ${a[1].product||''} <span class="mini">${a[1].owner||''}</span></span><span class="dd">${rawHtml(a[0])}일</span></a>`;
    }).join('')||'<div class="mini" style="padding:8px">없음 🎉</div>')}`+ tpl`</div></div></div>`+
    tpl`<div class="inb-2">`+
    tpl`<div class="inb-card"><h3>상태 분포 <small>클릭하면 목록으로 이동</small></h3><div class="inb-dist">${rawHtml(dist('result',10))}</div></div>`+
    tpl`<div class="inb-card"><h3>산업군 <small>클릭하면 목록으로 이동</small></h3><div class="inb-dist">${rawHtml(dist('industry',10))}</div></div></div>`+
    tpl`<div class="inb-2">`+
    tpl`<div class="inb-card"><h3>제품유형 · 문의유형</h3><div class="inb-dist">${rawHtml(dist('ptype',6))}${rawHtml(dist('qtype',4))}</div></div>`+
    tpl`<div class="inb-card"><h3>담당자별 처리</h3><div class="inb-dist">${rawHtml(dist('owner',10))}</div></div></div>`;
  host.querySelectorAll('[data-inby]').forEach(function(b){
    b.onclick=function(){ ST.INB_Y=b.dataset.inby; renderInbStat(); };
  });
  host.querySelectorAll('.inb-dr').forEach(function(d){
    d.onclick=function(){ goInbList(d.dataset.k, d.dataset.v); };
  });
  host.querySelectorAll('[data-inbid]').forEach(function(a){
    a.onclick=function(){
      var r=(ST.RAWX.inbound||[]).filter(function(x){return String(x.id)===a.dataset.inbid;})[0];
      if(r) openInbDetail(r);
    };
  });
  inbWirePanel(host);
  if(ST.RAWX.inbLog===undefined) loadInbLog(function(){ if(ST.CUR_VIEW==='inbstat') renderInbStat(); });
  if(IA.cfg===undefined) iaLoad(function(){ if(ST.CUR_VIEW==='inbstat') renderInbStat(); });   /* ㊿+193 */
  var bl=document.getElementById('inbGoList'); if(bl) bl.onclick=function(){ goInbList(); };
}
export function inbRefetch(){
  if(!ST.SB_TOKEN){ openOvl('ovlAuth'); return; }
  var b=document.getElementById('inbFetchP'); if(b){ b.disabled=true; b.textContent='가져오는 중…'; }
  toast('인바운드 가져오기','시트에서 가져오는 중… (최대 1분)','info');
  function done(){
    ST.RAWX.inbLog=undefined;                       // 기록도 새로 읽습니다
    loadInbLog(function(){ loadInbound(function(){
      if(ST.CUR_VIEW==='inbstat') renderInbStat(); else if(ST.CUR_VIEW==='inbound') renderGrid(); }); });
  }
  fetchT(WEEKLY_GAS+'?action=inbound_fetch', {}, 180000, '시트 가져오기(GAS)').then(function(r){return r.json();})   /* ㊿+182 시간 제한 */.then(function(j){
    if(j&&j.ok) toast('가져오기 완료', j.msg || inbCounts(j.counts) || '');
    else toast('가져오기 실패', (j&&j.error)||'', 'bad');
    done();
  }).catch(function(e){
    if(e && e.timeout){ toast('가져오기 응답 없음', String(e.message||e)+' (시트에서 이미 가져왔을 수 있어 다시 실행하지 않음)', 'bad'); done(); return; }   /* ㊿+182 시간 초과는 새 탭으로 다시 실행하지 않음(두 번 가져오기 방지) */
    window.open(WEEKLY_GAS+'?action=inbound_fetch','_blank');   // CORS 차단 등 — 새 탭에서 실행
    setTimeout(done, 5000);
  });
}
export function openInbDetail(r){
  var steps=[['1차',r.s1,r.s1d],['2차',r.s2,r.s2d],['2-1차',r.s21,r.s21d],['3차',r.s3,r.s3d]]
    .filter(function(s){return s[1]||s[2];});
  $('#inbDBody').innerHTML=
    tpl`<h3 style="margin:0 0 2px">${r.org||'?'} <span class="mini" style="font-weight:400">— ${r.result||'-'}</span></h3>`+
    tpl`<p class="cap" style="margin:0">${r.on_date||''} 접수 · ${rawHtml(r.y)}년 연번 ${r.no} · ${r.channel||''}`+ tpl`${rawHtml(r.dup?' · <b style="color:var(--warn-ink)">중복 문의</b>':'')}</p>`+
    tpl`<div class="inb-meta">`+
    tpl`<div><b>문의 제품</b>${r.product||'-'} <span class="mini">(${r.ptype||''})</span></div>`+
    tpl`<div><b>지니 담당</b>${r.owner||'-'}</div>`+
    tpl`<div><b>노드수</b>${r.nodes||'-'}</div>`+
    tpl`<div><b>요청자</b>${r.requester? ntfName(r.requester) : '-'}</div>`+
    tpl`<div><b>부서</b>${r.dept||'-'}</div>`+
    tpl`<div><b>기 고객</b>${r.existing||'-'}</div>`+
    tpl`<div><b>이메일</b>${r.email||'-'}</div>`+
    tpl`<div><b>연락처</b>${r.phone||'-'}</div>`+ tpl`${rawHtml(iaFor(r)? tpl`<div><b>자동 회신</b>${rawHtml(iaBadge(r))}${rawHtml(iaFor(r).reason? tpl` <span class="mini">${iaFor(r).reason}</span>`:'')}</div>` : '')}`+ tpl`${rawHtml(r.biz_no?tpl`<div><b>영업현황 번호</b>${r.biz_no}</div>`:'')}`+ tpl`${rawHtml(r.amount?tpl`<div><b>수주액</b>${won(r.amount)}천원</div>`:'')}`+
    tpl`</div>`+
    tpl`<div class="inb-body">${r.content||'(요청내용 없음)'}</div>`+ tpl`${rawHtml(steps.length?tpl`<div class="inb-tl">${rawHtml(steps.map(function(s){
      return tpl`<div class="st"><b>${rawHtml(s[0])}</b> ${s[1]||''}<div class="d">${s[2]||''}</div></div>`;
    }).join(''))}`+ tpl`</div>`:'')}`+ tpl`${rawHtml(r.note?tpl`<div class="mini" style="margin-top:6px">비고: ${r.note}</div>`:'')}`+
    tpl`${rawHtml(r.org? tpl`<div class="inb-go"><button type="button" class="cbtn" id="inbD360">고객 한눈에 — ${r.org}</button><span class="mini">원본: 인바운드 시트 ${String(r.y||'')}년 연번 ${String(r.no||'')}(수정은 시트에서)</span></div>` : '')}`;
  var g360=document.getElementById('inbD360'); if(g360) g360.onclick=function(){ closeOvl('ovlInb'); openCust360(r.org); };   /* ㊿+172 인바운드 → 고객 한눈에 */
  openOvl('ovlInb');
}

/* ===== 주간회의 — 주간업무보고 자동 취합 화면 ===== */
export var WEEKLY_GAS='https://script.google.com/macros/s/AKfycbz0PDzgvgtM0ZZHEfMwEzPpgoPYidD6ElPx3oTGsgnVuveCnVA9PmYPB4WAPfr9a6DY/exec';
export var WK={data:null, week:null, secs:[]};
export var WK_BIZ_ORDER=['계약현황','영업','기획','마케팅','기획·마케팅'];
export function wkTime(v){ return v? axTime(v):'·'; }
export function wkChipCls(st){
  st=String(st||'');
  if(/완료/.test(st)) return 'wkc-grn';
  if(/진행|접수/.test(st)) return 'wkc-yel';
  if(/보류|중지|대기/.test(st)) return 'wkc-gry';
  return 'wkc-gry';
}
export function wkCustMatch(name){
  var n=String(name||'').replace(/\s+|\(.*?\)/g,'').toLowerCase();
  if(!n) return null;
  var hit=(ST.RAWX.customers||[]).some(function(c){
    var m=String(c.name||'').replace(/\s+|\(.*?\)/g,'').toLowerCase();
    return m && (m.indexOf(n)>=0 || n.indexOf(m)>=0);
  });
  return hit;
}

/* ── 주간보고 통합 양식 (전사 «주간 업무보고» 서비스사업부 탭 레이아웃) ──
   열: A 전주 · B 구분(팀) · C 구분 · D 업무세부내용 · E 고객명 · F 담당자 · G 예상매출(백만) · H 관련부서/파트너 · I 비고
   · 계약현황은 포탈 DB에서 자동 생성 (전주에 등록된 신규·추가 계약 + 연장 회차)
   · 영업·기획·마케팅·MSS팀 항목은 취합된 주간보고(weekly_reports)의 «전주 실적» 을 그대로 옮김 */
export function wkUnifiedWindow(){
  var wk=WK.week? new Date(WK.week+'T00:00:00') : new Date();
  var end=new Date(wk); end.setDate(end.getDate()-1);          // 보고일 전날까지
  var start=new Date(end); start.setDate(start.getDate()-6);   // 7일 창
  var f=function(d){ return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); };
  return {s:f(start), e:f(end)};
}
export function wkTermTxt(m){ m=Number(m)||0; if(!m) return ''; return (m%12===0)? (m/12)+'년' : m+'개월'; }
export function wkContractRows(win){
  var out=[], cmap={}; (SB_RAW.customers||[]).forEach(function(c){ cmap[c.id]=c; });
  (SB_RAW.contracts||[]).forEach(function(c){
    var cu=cmap[c.customer_id]||{}, nm=cu.name||'?';
    var line=lline(c.line), ver=c.version? ' '+c.version:'', qty=c.qty? ' '+Math.round(Number(c.qty))+'노드':'';
    var ptn=c.partner||c.biller||'';
    var created=String(c.created_at||'').slice(0,10);
    if(created>=win.s && created<=win.e){
      var kind=c.parent_contract_id? '추가' : '신규';
      out.push(['','', '계약현황', '('+kind+') '+line+ver+qty+' '+wkTermTxt(c.term_months), nm, '서비스사업팀', c.total_amount? (Math.round(Number(c.total_amount)/10000)/100):'' , ptn, '']);
    }
    (Array.isArray(c.renew_history)? c.renew_history:[]).forEach(function(h){
      if(/migration|sheet-sync/i.test(String(h.by||''))) return;                  // 이관으로 만들어진 이력은 «전주 연장» 아님
      var at=String(h.at||'').slice(0,10); if(!(at>=win.s && at<=win.e)) return;
      var mo=(h.from&&h.to)? ((+String(h.to).slice(0,4)-+String(h.from).slice(0,4))*12 + (+String(h.to).slice(5,7)-+String(h.from).slice(5,7))+1) : 0;
      var amt=(Number(h.mrr)||0)*mo;
      out.push(['','', '계약현황', '(연장) '+line+ver+qty+' '+wkTermTxt(mo), nm, '서비스사업팀', amt? Math.round(amt/10000)/100:'', ptn, h.note||'']);
    });
  });
  return out;
}
export function wkUnifiedRows(){
  var win=wkUnifiedWindow(), items=(WK.data&&WK.data.items)||[];
  var rows=[['전주','구분','','업무세부내용','고객명','담당자','예상매출','관련부서/파트너','비고']];
  function split(content){ var m=String(content||'').match(/^([\s\S]*?)\n\(비고\)\s*([\s\S]*)$/); return m? [m[1],m[2]] : [String(content||''),'']; }
  // ① 계약현황: DB 자동 + 시트에 적힌 계약현황 중 DB에 없는 고객
  var ct=wkContractRows(win), seen={}; ct.forEach(function(r){ seen[String(r[4]).replace(/\s/g,'')]=1; });
  items.filter(function(x){ return x.part==='실적' && x.team==='사업팀' && x.section==='계약현황'; }).forEach(function(x){
    var k=String(x.customer||'').replace(/\s/g,''); if(seen[k]) return;
    var cd=split(x.content); ct.push(['','', '계약현황', cd[0], x.customer||'', x.owner||'서비스사업팀', x.expect_amt!=null? x.expect_amt:'', x.partner||'', cd[1]]);
  });
  var body=[];
  ct.forEach(function(r,i){ if(i>0) r[2]=''; body.push(r); });
  // ② 영업 · 기획 · 마케팅
  ['영업','기획','마케팅','기획·마케팅'].forEach(function(sec){
    var list=items.filter(function(x){ return x.part==='실적' && x.team==='사업팀' && x.section===sec; });
    list.forEach(function(x,i){ var cd=split(x.content); body.push(['','', i===0? sec:'', cd[0], x.customer||'', x.owner||'', x.expect_amt!=null? x.expect_amt:'', x.partner||'', cd[1]]); });
  });
  if(body.length){ body[0][0]='전주'; body[0][1]='서비스사업팀'; }
  // ③ MSS팀
  var mss=items.filter(function(x){ return x.part==='실적' && x.team==='MSS팀'; }), first=true, lastSec=null;
  mss.forEach(function(x){
    body.push([ '', first? 'MSS팀':'', (x.section!==lastSec)? (x.section||'기타'):'', x.content||'', x.customer||'', x.owner||'', '', x.partner||'-', x.issue_ref||'-' ]);
    first=false; lastSec=x.section;
  });
  return rows.concat(body);
}
export function wkUnifiedTsv(rows){
  return rows.map(function(r){ return r.map(function(c){ var s=String(c==null?'':c); return /[\t\n"]/.test(s)? '"'+s.replace(/"/g,'""')+'"' : s; }).join('\t'); }).join('\n');
}
export async function wkUnifiedCopy(){
  var rows=wkUnifiedRows(); if(rows.length<2){ toast('통합 양식','옮길 항목이 없습니다','warn'); return; }
  try{ await navigator.clipboard.writeText(wkUnifiedTsv(rows)); toast('통합 양식 복사 완료', (rows.length-1)+'줄 — 전사 주간보고 «서비스사업부» 탭 A1 에 붙여넣기'); }
  catch(e){ var ta=document.createElement('textarea'); ta.value=wkUnifiedTsv(rows); document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('통합 양식 복사 완료', (rows.length-1)+'줄'); }
}
export function wkUnifiedXlsx(){
  var rows=wkUnifiedRows(); if(rows.length<2){ toast('통합 양식','옮길 항목이 없습니다','warn'); return; }
  var nm='주간업무보고_서비스사업부_'+(WK.week||todayStr());
  xlsxBook(nm, [{name:'서비스사업부', head:rows[0], rows:rows.slice(1), widths:[12,17,16,92,24,15,19,19,23]}]);
}

export var WK_CACHE={};   // 주차별 캐시 — 주 1회 바뀌는 데이터라 10분 캐시로 즉시 표시
export async function renderWeekly(atWeek){
  var host=$('#wkBody');
  var ck=atWeek||'', cc=WK_CACHE[ck];
  var d=null;
  if(cc && Date.now()-cc.t<10*60*1000){
    d=cc.d;                                   // 캐시로 즉시 렌더 (로딩 화면 없음)
  }else{
    host.innerHTML='<div class="cap" style="padding:40px;text-align:center">주간보고를 불러오는 중…</div>';
    try{
      d=await sbWrite('POST', atWeek? 'rpc/load_weekly_at':'rpc/load_weekly', atWeek? {p_week:atWeek}:{});
      WK_CACHE[ck]={t:Date.now(), d:d};
    }catch(e){
      host.innerHTML=tpl`<section class="card c12"><h3 style="margin:0 0 6px">📊 주간회의</h3>`+
        tpl`<p class="cap">데이터를 불러오지 못했습니다 — 40_weekly.sql 실행 여부를 확인하세요.<br>${String(e.message||e)}</p></section>`;
      return;
    }
  }
  if(!d || !d.items || !d.items.length){
    host.innerHTML=tpl`<section class="card c12" style="max-width:640px;margin:0 auto;text-align:center;padding:40px">`+
      tpl`<h3 style="margin:0 0 8px">📊 주간회의</h3>`+
      tpl`<p class="cap">아직 취합된 주간보고가 없습니다.<br>매주 일요일 19시에 자동으로 가져오며, 지금 바로 가져올 수도 있습니다.</p>`+
      tpl`<button class="pill" id="wkFetch0" style="margin-top:10px">↻ 시트에서 지금 가져오기</button></section>`;
    var b0=document.getElementById('wkFetch0');
    if(b0) b0.onclick=wkRefetch;
    return;
  }
  WK.data=d; WK.week=(d.meta&&d.meta.week)||null;

  var items=d.items, meta=d.meta||{};
  function rows(part,team,sec){
    return items.filter(function(x){ return x.part===part && (!team||x.team===team) && (!sec||x.section===sec); });
  }
  // 실적 섹션 순서: 사업팀 고정 순서 → MSS 시트 등장 순서
  var secs=[];
  WK_BIZ_ORDER.forEach(function(sc){ if(rows('실적','사업팀',sc).length) secs.push({team:'사업팀',sec:sc}); });
  var seen={};
  items.filter(function(x){return x.part==='실적'&&x.team==='MSS팀';}).forEach(function(x){
    if(!seen[x.section]){ seen[x.section]=1; secs.push({team:'MSS팀',sec:x.section}); } });

  var no=0, railPerf=[], railPlan=[], bodyH='';
  function card(id,title,whos,cnt,inner,plan){
    return tpl`<div class="wk-card${plan?' plan':''}" id="${rawHtml(id)}" data-wksec="1">`+
      tpl`<h2><span class="no">${++no}</span>${title}`+
      tpl`${rawHtml((whos||[]).map(function(w){ return tpl`<span class="who">${w}</span>`; }).join(''))}`+
      tpl`<small>${rawHtml(cnt)}건</small></h2>${rawHtml(inner)}</div>`;
  }
  function owners(list){
    var o=[],s={};
    list.forEach(function(x){ String(x.owner||'').split(/[\n,·]/).forEach(function(w){
      w=w.trim(); if(w&&!s[w]&&o.length<3){ s[w]=1; o.push(w); } }); });
    return o;
  }
  function tbl(list,opts){
    opts=opts||{};
    // 칩(상태/구분)이 하나도 없는 목록이면 칩 열 자체를 뺀다
    var hasChips=list.some(function(x){ return (opts.tagChip && x.section) || x.status; });
    return tpl`<table class="wk-tbl">${rawHtml(list.map(function(x){
      var chips='';
      if(opts.tagChip && x.section) chips=tpl`<span class="wk-chip wkc-blu">${x.section}</span>`;
      else if(x.status) chips=tpl`<span class="wk-chip ${rawHtml(wkChipCls(x.status))}">${x.status}</span>`;
      var extra='';
      if(opts.contract){
        var ok=wkCustMatch(x.customer);
        extra=tpl`<td style="width:74px">${rawHtml(ok===null?'·':
          ok? '<span class="wk-chip wkc-grn">일치✓</span>':'<span class="wk-chip wkc-red">미입력</span>')}`+ tpl`</td>`;
      }
      var amt=(x.expect_amt!=null&&x.expect_amt!=='')? tpl` <b style="white-space:nowrap">· ${rawHtml(x.expect_amt)}백만</b>`:'';
      var due=x.due? tpl` <span class="wk-chip wkc-gry">${String(x.due).slice(0,10)}</span>`:'';
      var iss=x.issue_ref? tpl` <span class="mini">${x.issue_ref}</span>`:'';
      return tpl`<tr>`+ tpl`${rawHtml(hasChips? tpl`<td style="width:78px">${rawHtml(chips||'·')}</td>`:'')}`+
        tpl`<td style="width:132px"><b style="font-weight:650">${x.customer||'·'}</b></td>`+
        tpl`<td style="width:100px;color:var(--ink-2)">${String(x.owner||'·').replace(/\n/g,'·')}</td>`+
        tpl`<td><div class="wk-body">${x.content||''}</div>${rawHtml(amt||due||iss? tpl`<div class="mini" style="margin-top:2px">${rawHtml(amt)}${rawHtml(due)}${rawHtml(iss)}</div>`:'')}</td>`+
        tpl`${rawHtml(extra)}</tr>`;
    }).join(''))}`+ tpl`</table>`;
  }

  // ── 전주 실적 ──
  bodyH+=tpl`<div class="wk-phase"><span class="pt">전주 실적</span><span class="ln"></span>`+
    tpl`<span class="mini">사업팀 → MSS팀 순서로 보고</span></div>`;
  secs.forEach(function(g){
    var list=rows('실적',g.team,g.sec);
    var id='wks'+no;
    var title=(g.team==='MSS팀'? 'MSS · ':'')+g.sec;
    bodyH+=card(id,title,owners(list),list.length,tbl(list,{contract:g.sec==='계약현황'}));
    railPerf.push({id:id,label:title,who:owners(list)[0]||''});
  });

  // ── 금주 계획 ──
  var planBiz=rows('계획','사업팀'), planMss=rows('계획','MSS팀');
  bodyH+=tpl`<div class="wk-phase"><span class="pt">금주 계획</span><span class="ln"></span>`+
    tpl`<span class="mini">같은 순서로 한 바퀴</span></div>`;
  if(planBiz.length){ var id1='wks'+no;
    bodyH+=card(id1,'사업팀',[],planBiz.length,tbl(planBiz,{tagChip:true}),true);
    railPlan.push({id:id1,label:'사업팀'}); }
  if(planMss.length){ var id2='wks'+no;
    bodyH+=card(id2,'MSS팀',[],planMss.length,tbl(planMss,{tagChip:true}),true);
    railPlan.push({id:id2,label:'MSS팀'}); }

  // ── 마무리: 특이 + 지난주 액션 + 회의 메모 ──
  var etc=rows('특이');
  var memoId='wks'+no;
  var memoInner='';
  if(etc.length) memoInner+=tpl`<div class="mini" style="margin-bottom:8px;font-weight:700">요청 / 특이사항</div>${rawHtml(tbl(etc))}<div style="height:10px"></div>`;
  if(d.prev_memo) memoInner+=tpl`<div class="ai-comment on" style="margin:0 0 8px"><b>지난주 액션</b><div class="wk-body" style="margin-top:4px">${d.prev_memo}</div></div>`;
  var wkCanMemo=!ST.IS_EQUIP && !ST.IS_VIEWER;   // 메모 저장은 admin 이상만
  memoInner+=tpl`<textarea id="wkMemo"${wkCanMemo?'':' disabled'} style="width:100%;min-height:76px;border:1px solid var(--ring);border-radius:10px;`+
    tpl`background:var(--surface-2);color:var(--ink);padding:10px;font-family:inherit;font-size:13px" `+
    tpl`placeholder="회의에서 정한 것을 적어두면 다음 주 이 화면에 「지난주 액션」으로 표시됩니다">${(meta&&meta.memo)||''}</textarea>`+
    tpl`<div style="display:flex;gap:8px;margin-top:8px;align-items:center"><span class="mini" id="wkMemoMsg"></span>`+
    tpl`<span style="flex:1"></span>${rawHtml(wkCanMemo?'<button class="pill" id="wkMemoSave">메모 저장</button>':'<span class="mini">메모 저장은 관리자만</span>')}</div>`;
  bodyH+=card(memoId,'회의 메모',[],etc.length,memoInner);

  // ── 헤더 + 레일 조립 ──
  var counts=meta.counts||{};
  var weekNav=(d.weeks||[]);   // 저장된 주차 전부 (소급분 포함)
  var head=tpl`<div class="wk-head">`+
    tpl`<span style="font-size:18px;font-weight:800">📊 주간회의</span>`+
    tpl`<span class="wk-chip wkc-blu wk-fsonly">발표 모드 · Space/↓ 다음 · ↑ 이전 · ESC 종료</span>`+
    tpl`<select id="wkWeekSel" aria-label="주차" class="pill" style="height:31px;font-family:inherit">`+
      tpl`${rawHtml(weekNav.map(function(w){ return tpl`<option value="${rawHtml(w)}"${w===WK.week?' selected':''}>${rawHtml(w)} 주간</option>`; }).join(''))}</select>`+
    tpl`<span class="pill ghost" style="font-size:12px">${meta.file_name||''} · ${rawHtml(wkTime(meta.fetched_at))} 취합</span>`+ tpl`${rawHtml(meta.missing&&meta.missing.length? tpl`<span class="wk-chip wkc-red">⚠ 누락 탭: ${meta.missing.join(', ')}</span>`
      : '<span class="wk-chip wkc-grn">누락 팀 없음 ✓</span>')}`+
    tpl`<span style="flex:1"></span>`+
    tpl`<span class="mini">${rawHtml(Object.keys(counts).map(function(k){return k+' '+counts[k]+'건';}).join(' · '))}</span>`+
    tpl`<button class="pill ghost" id="wkZoom" title="글자 크기 — 보통 → 크게 → 아주 크게">가<span style="font-size:15px;font-weight:800">A</span> 글자 크기</button>`+
    tpl`<button class="pill ghost" id="wkFs" title="보고 화면만 전체화면으로 — 사이드바·상단바 없이 발표 (ESC 또는 F로 종료)">⛶ 발표 모드</button>`+
    tpl`<button class="pill ghost" id="wkAiSum" title="AI 요약은 오른쪽 AI 패널에 — 원문(이 화면)은 그대로 보면서 비교 · 결정이 필요한 것 · 미완료 액션 · 담당 · 기한">✦ AI 요약(옆 패널)</button>`+
    tpl`<button class="pill ghost" id="wkFetch">↻ 다시 가져오기</button>`+
    tpl`<button class="pill ghost" id="wkUniCopy" title="전사 «주간 업무보고» 서비스사업부 탭 양식(9열)으로 복사 — 시트의 「통합(자동)」 탭과 같은 내용 · 계약현황은 포탈 DB에서 자동 생성">📋 통합 양식 복사</button>`+
    tpl`<button class="pill ghost" id="wkUniXls" title="같은 양식을 엑셀 파일로">⬇ 통합 양식</button>`+
    tpl`<button class="pill" id="wkNext">▶ 다음 (Space)</button></div>`;

  var rail=tpl`<div class="wk-rail"><div class="ph">전주 실적</div>`+
    tpl`${rawHtml(railPerf.map(function(r){ return tpl`<a data-go="${rawHtml(r.id)}">${r.label}<small>${r.who}</small></a>`; }).join(''))}`+
    tpl`<div class="ph">금주 계획</div>`+
    tpl`${rawHtml(railPlan.map(function(r){ return tpl`<a data-go="${rawHtml(r.id)}">${r.label}</a>`; }).join(''))}`+
    tpl`<div class="ph">마무리</div><a data-go="${rawHtml(memoId)}">회의 메모</a></div>`;

  host.innerHTML=tpl`${rawHtml(head)}<div class="wk-wrap">${rawHtml(rail)}<div id="wkMain">${rawHtml(bodyH)}</div></div>`;
  /* ㊿+172 주간회의 AI 요약 — 원문은 이 화면 그대로 · 요약은 오른쪽 AI 패널(요약이 원문을 가리지 않음 · 문장마다 원문 섹션 이름으로) */
  (function(){ var sb=document.getElementById('wkAiSum'); if(!sb) return; sb.onclick=function(){
    var main=document.getElementById('wkMain'), txt=main? String(main.innerText||'').replace(/\n{3,}/g,'\n\n').slice(0,7000) : '';
    ask('이번 주 주간보고를 요약해줘 — 핵심 변화 · 결정이 필요한 것(담당 · 기한) · 지난주에서 넘어온 미완료 액션 순서로, 각 항목에 원문 섹션 이름을 붙여서', {from:'weekly', ctx:{v:'weekly', label:'주간회의 '+(WK.week||''), parts:['원문 '+txt.length+'자 함께 보냄'], n:null, sums:[], text:'(참고 — 사용자가 보던 주간보고 원문 '+(WK.week||'')+' 주간 · 아래 원문만 근거로, 원문에 없는 내용은 만들지 말 것)\n'+txt}}); }; })();

  // 상단 제목 바·주간 헤더의 실제 높이를 재서 고정 위치를 맞춤 (제목 바 밑에 숨지 않게)
  function wkMeasure(){
    try{
      var tb=document.querySelector('.topbar'), hd=host.querySelector('.wk-head');
      if(tb) document.documentElement.style.setProperty('--tbh', tb.offsetHeight+'px');
      if(hd) document.documentElement.style.setProperty('--wkh', hd.offsetHeight+'px');
    }catch(e){}
  }
  requestAnimationFrame(wkMeasure);
  if(!WK.rz){ WK.rz=1; window.addEventListener('resize', function(){ if(ST.CUR_VIEW==='weekly') wkMeasure(); }); }
  WK.measure=wkMeasure;

  // ── 동작 ──
  WK.secs=Array.prototype.slice.call(host.querySelectorAll('[data-wksec]')).map(function(e){return e.id;});
  host.querySelectorAll('.wk-rail a').forEach(function(a){
    a.onclick=function(){ wkGo(a.dataset.go); };
  });
  $('#wkWeekSel').onchange=function(){ renderWeekly(this.value); };
  // 글자 크기 3단계 (보통/크게/아주 크게) — 이 브라우저에 기억
  function wkApplyZoom(z){
    var vw=document.getElementById('viewWeekly');
    if(z>0) vw.setAttribute('data-zoom', String(z)); else vw.removeAttribute('data-zoom');
    var lb=document.getElementById('wkZoom');
    if(lb){
      lb.style.background = z>0? 'var(--brand-t,rgba(46,189,87,.13))':'';
      lb.innerHTML=tpl`가<span style="font-size:15px;font-weight:800">A</span> ${z===1?'크게':z===2?'최대':'글자 크기'}`;
    }
  }
  var wkZ=0; try{ wkZ=+(localStorage.getItem('svc_wk_zoom')||0); }catch(e){}
  wkApplyZoom(wkZ);
  $('#wkZoom').onclick=function(){
    wkZ=(wkZ+1)%3;
    try{ localStorage.setItem('svc_wk_zoom', String(wkZ)); }catch(e){}
    wkApplyZoom(wkZ);
    requestAnimationFrame(wkMeasure);   // 글자 크기가 바뀌면 헤더 높이도 다시 잼
  };
  $('#wkNext').onclick=function(){ this.blur(); wkNext(); };
  var bfs=$('#wkFs'); if(bfs) bfs.onclick=function(){ this.blur(); wkToggleFs(); };
  $('#wkFetch').onclick=wkRefetch;
  var uc=$('#wkUniCopy'); if(uc) uc.onclick=wkUnifiedCopy;
  var ux=$('#wkUniXls'); if(ux) ux.onclick=wkUnifiedXlsx;
  if($('#wkMemoSave')) $('#wkMemoSave').onclick=async function(){
    var t=$('#wkMemo').value;
    try{
      await sbWrite('PATCH','weekly_meta?week=eq.'+WK.week,{memo:t||null});
      Object.keys(WK_CACHE).forEach(function(k){       // 캐시에도 반영 (다시 열어도 방금 메모 유지)
        try{ if(WK_CACHE[k].d&&WK_CACHE[k].d.meta&&WK_CACHE[k].d.meta.week===WK.week) WK_CACHE[k].d.meta.memo=t||null; }catch(e){}
      });
      msgTo('wkMemoMsg','저장됨 ✓');
    }catch(e){ msgTo('wkMemoMsg',String(e.message||e).slice(0,80)); }
  };
  function msgTo(id,t){ var e=document.getElementById(id); if(e) e.textContent=t; }
}
/* 주간회의 발표(전체화면) 모드 — 보고 화면만 화면 전체에 띄웁니다 */
export function wkFsOn(){ return !!(document.fullscreenElement||document.webkitFullscreenElement); }
export function wkToggleFs(){
  var vw=document.getElementById('viewWeekly'); if(!vw) return;
  try{
    if(wkFsOn()){ (document.exitFullscreen||document.webkitExitFullscreen).call(document); return; }
    var rq=vw.requestFullscreen||vw.webkitRequestFullscreen;
    if(!rq){ toast('전체화면 불가','이 브라우저는 전체화면을 지원하지 않습니다','info'); return; }
    var r=rq.call(vw);
    if(r&&r.catch) r.catch(function(e){ toast('전체화면 실패', String(e.message||e), 'info'); });
  }catch(e){ toast('전체화면 실패', String(e.message||e), 'info'); }
}


export function wkFsSync(){
  var on=wkFsOn();
  var b=document.getElementById('wkFs');
  if(b){ b.textContent = on? '⛶ 발표 종료 (ESC)' : '⛶ 발표 모드';
         b.style.background = on? 'var(--brand-t,rgba(46,189,87,.13))':''; }
  if(!on){ document.documentElement.style.removeProperty('--tbh'); }
  try{ if(WK.measure && !on) WK.measure(); }catch(e){}
}
export function wkGo(id){
  var el=document.getElementById(id); if(!el) return;
  el.scrollIntoView({behavior:'smooth',block:'start'});
  document.querySelectorAll('.wk-rail a').forEach(function(a){ a.classList.toggle('on',a.dataset.go===id); });
}
export function wkNext(){
  var cur=document.querySelector('.wk-rail a.on');
  var links=Array.prototype.slice.call(document.querySelectorAll('.wk-rail a'));
  var i=cur? links.indexOf(cur):-1;
  var nx=links[Math.min(i+1,links.length-1)];
  if(nx) wkGo(nx.dataset.go);
}
export function wkPrev(){
  var cur=document.querySelector('.wk-rail a.on');
  var links=Array.prototype.slice.call(document.querySelectorAll('.wk-rail a'));
  var i=cur? links.indexOf(cur):links.length;
  var pv=links[Math.max(i-1,0)];
  if(pv) wkGo(pv.dataset.go);
}

export async function wkRefetch(){
  toast('주간보고 취합','시트에서 가져오는 중… (수십 초 걸릴 수 있습니다)','info');
  try{
    var r=await fetchT(WEEKLY_GAS+'?action=weekly_fetch', {}, 180000, '주간보고 취합(GAS)');
    var j=await r.json();
    if(!j.ok) throw new Error(j.error||'실패');
    toast('취합 완료', j.msg||('사업팀·MSS팀 갱신'));
  }catch(e){
    if(/** @type {any} */(e) && /** @type {any} */(e).timeout){ toast('주간보고 취합 응답 없음', String(/** @type {any} */(e).message||e)+' — 잠시 뒤 주간 보고를 다시 열어 확인하세요', 'bad'); }
    // CORS 차단 등 — 새 탭에서 실행 (결과 JSON 표시)
    else window.open(WEEKLY_GAS+'?action=weekly_fetch','_blank');
  }
  WK_CACHE={};   // 새로 취합했으니 캐시 비움
  setTimeout(function(){ renderWeekly(); }, 1500);
}
/* ═══ ㊿+193 인바운드 자동 회신 — 설정(inbound_auto) · 기록(inbound_auto_log) · SQL 117 ═══
   Apps Script(Code.gs 자동 회신 구역 v2)가 5분마다 sales@ 의 HubSpot 알림 메일을 읽어 접수 확인 메일을 보내고 시트에 등록하는데,
   켜고 끄기 · 문구 · 규칙은 이 포탈의 inbound_auto 한 줄에서 읽고, 처리한 메일마다 inbound_auto_log 에 한 줄 남김 */
export var IA={cfg:undefined, log:undefined, ok:null, at:0, open:false, map:null, busy:false};
export var IA_MODE={off:'끔', draft:'초안만(임시보관함)', send:'실제 발송'};
export var IA_ACT={sent:'보냄', draft:'초안', skip_replied:'건너뜀 · 사람이 답함', skip_dupe:'건너뜀 · 최근 회신', skip_rule:'건너뜀 · 규칙', skip_old:'건너뜀 · 오래된 메일', skip_off:'건너뜀 · 끔', hold:'확인 필요', error:'오류'};
export function iaKstDate(v){ try{ return new Date(v).toLocaleDateString('sv-SE', {timeZone:'Asia/Seoul'}); }catch(e){ return String(v||'').slice(0,10); } }
export function iaKey(email, date){ return String(email||'').trim().toLowerCase()+'|'+String(date||'').slice(0,10); }
export function iaLoad(cb){
  Promise.all([sbTry('inbound_auto?select=*&id=eq.1'), sbTry('inbound_auto_log?select=*&order=at.desc&limit=200')]).then(function(res){
    var c=res[0], l=res[1];
    IA.ok=!!(c && c.length); IA.cfg=IA.ok? c[0] : null; IA.log=l||[]; IA.at=Date.now();
    var m={}; IA.log.slice().reverse().forEach(function(x){ if(!x.email) return; var k=iaKey(x.email, x.mail_at? iaKstDate(x.mail_at) : iaKstDate(x.at)); if(!m[k] || x.action==='sent' || x.action==='draft') m[k]=x; });
    IA.map=m; if(cb) cb();
  });
}
/** 인바운드 줄(이메일 · 접수일) → 자동 회신 기록 */
export function iaFor(r){ if(!IA.map || !r) return null; return IA.map[iaKey(r.email, r.on_date)] || null; }
export function iaActText(x){ if(!x) return ''; var t=IA_ACT[x.action]||x.action; var hm=''; try{ hm=new Date(x.at).toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'Asia/Seoul'}); }catch(e){} return t+(x.action==='sent'||x.action==='draft'? ' '+hm : ''); }
export function iaBadge(r){ var x=iaFor(r); if(!x) return ''; var cls=x.action==='sent'? 'ok' : (x.action==='hold'||x.action==='error')? 'warn' : ''; return tpl`<span class="ctag ia-tag ${rawHtml(cls)}" title="${x.reason||''}${x.registered? ' · 시트 연번 '+String(x.sheet_no||'')+' 등록':''}">${iaActText(x)}</span>`; }
export function iaToday(){ var d=iaKstDate(new Date()), c={sent:0, draft:0, hold:0, skipped:0}; (IA.log||[]).forEach(function(x){ if(iaKstDate(x.at)!==d) return; if(x.action==='sent') c.sent++; else if(x.action==='draft') c.draft++; else if(x.action==='hold'||x.action==='error') c.hold++; else c.skipped++; }); return c; }
export function iaCard(){
  if(IA.cfg===undefined) return tpl`<div class="card ia-card" style="padding:10px 14px;margin-bottom:10px"><b style="font-size:14px">✉ 자동 회신</b> <span class="mini">읽는 중…</span></div>`;
  if(!IA.ok) return tpl`<div class="card ia-card" style="padding:10px 14px;margin-bottom:10px"><b style="font-size:14px">✉ 자동 회신</b> <span class="mini" style="color:var(--muted)">— 홈페이지 문의 접수 확인 메일을 자동으로 보내는 기능. Supabase 에서 <b>SQL 117</b> 을 실행하고 Code.gs 자동 회신 구역을 v2 로 바꾸면 여기서 켜고 끄고 문구를 고칠 수 있습니다(그 전엔 스크립트의 예비값으로 돕니다).</span></div>`;
  var c=IA.cfg, run=c.last_run||null, t=iaToday(), mode=c.mode||'draft';
  var modeCls=mode==='send'? 'ok' : mode==='off'? 'warn' : '';
  var alive=c.last_run_at? (Date.now()-new Date(c.last_run_at).getTime())<20*60*1000 : false;
  var h=tpl`<div class="card ia-card" style="padding:10px 14px;margin-bottom:10px"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">`+
    tpl`<b style="font-size:14px">✉ 자동 회신</b><span class="ctag ${rawHtml(modeCls)}" id="iaModeTag">${IA_MODE[mode]||mode}</span>`+
    tpl`<span class="mini" title="${rawHtml(c.last_run_at? esc(axTime(c.last_run_at)) : '')}">${rawHtml(c.last_run_at? '· 마지막 실행 '+esc(inbAgo(c.last_run_at))+(alive? '' : tpl` <span style="color:var(--critical)">(5분 트리거가 안 도는 듯 — setupAutoReply 확인)</span>`) : tpl`· <span style="color:var(--critical)">아직 실행 기록 없음 — Code.gs 에서 setupAutoReply() 를 한 번 실행했는지 확인</span>`)}</span>`+
    tpl`<span class="mini">· 오늘 보냄 ${String(t.sent)} · 초안 ${String(t.draft)} · 건너뜀 ${String(t.skipped)}${rawHtml(t.hold? tpl` · <b style="color:var(--critical)">확인 필요 ${String(t.hold)}</b>`:'')}</span>`+
    tpl`<span style="flex:1"></span>`+
    tpl`${rawHtml(ST.IS_SUPER? tpl`<button class="pill ghost" id="iaEdit">설정 · 문구 ✎</button><button class="pill" id="iaRun" title="5분 트리거를 기다리지 않고 지금 한 번 돌립니다(스크립트 실행 · 최대 1분)">지금 실행</button>` : '')}`+
    tpl`<button class="pill ghost" id="iaLogTg">🕘 기록${rawHtml(IA.log&&IA.log.length? ' ('+IA.log.length+')':'')}</button>`+
    tpl`</div>`;
  h+=tpl`<div class="mini" style="margin-top:4px;color:var(--muted)">참조 ${c.cc||'(없음)'} · 보내는 이름 ${c.sender_name||''} · 같은 주소엔 ${String(c.dedupe_days)}일 안 재회신 안 함 · 받은 지 ${String(c.max_age_hours)}시간 넘은 메일엔 안 보냄${rawHtml((c.skip_qtypes||[]).length? ' · 제외 종류 '+esc((c.skip_qtypes||[]).join(', ')):'')}${rawHtml((c.skip_domains||[]).length? ' · 제외 도메인 '+esc((c.skip_domains||[]).join(', ')):'')} · 시트 등록 ${c.register_on? '켜짐':'꺼짐'}${rawHtml(run && run.src && !/^포탈/.test(String(run.src))? tpl` · <span style="color:var(--critical)">스크립트가 포탈 설정 대신 «${String(run.src)}»으로 돌고 있음</span>`:'')}</div>`;
  h+=tpl`<div id="iaLogBox" style="display:${IA.open?'':'none'}">${rawHtml(iaLogTable())}</div></div>`;
  return h;
}
export function iaLogTable(){
  var L=IA.log||[];
  if(!L.length) return '<div class="mini" style="color:var(--muted);padding:6px 0">아직 기록이 없습니다 — 다음 HubSpot 문의 메일부터 여기에 남습니다</div>';
  return tpl`<table class="mini ia-log" style="width:100%;border-collapse:collapse;margin-top:6px"><thead><tr style="color:var(--muted);text-align:left"><th style="padding:4px 8px">시각</th><th style="padding:4px 8px">처리</th><th style="padding:4px 8px">회사 · 요청자</th><th style="padding:4px 8px">제품 · 종류</th><th style="padding:4px 8px">받는 주소</th><th style="padding:4px 8px">시트</th></tr></thead><tbody>`+
    tpl`${rawHtml(L.slice(0,60).map(function(x){ var cls=x.action==='sent'? 'ok' : (x.action==='hold'||x.action==='error')? 'warn' : '';
      return tpl`<tr style="border-top:1px solid var(--line,#eee)"><td style="padding:4px 8px;white-space:nowrap">${axTime(x.at)}</td><td style="padding:4px 8px"><span class="ctag ia-tag ${rawHtml(cls)}" title="${x.reason||''}">${IA_ACT[x.action]||x.action}</span>${rawHtml(x.reason && /hold|error|skip/.test(x.action)? tpl`<div class="mini" style="color:var(--muted)">${x.reason}</div>`:'')}</td><td style="padding:4px 8px">${x.org||'—'}${rawHtml(x.requester? ' · '+esc(x.requester):'')}</td><td style="padding:4px 8px">${x.product||''}${rawHtml(x.qtype? ' · '+esc(x.qtype):'')}</td><td style="padding:4px 8px">${x.email||''}</td><td style="padding:4px 8px">${rawHtml(x.registered? '연번 '+esc(String(x.sheet_no||''))+' ✓' : '')}</td></tr>`; }).join(''))}</tbody></table>`;
}
/** 설정 · 실행 뒤 다시 그리기 — 목록 화면이면 카드 + 표, 통계 화면이면 통계 */
export function iaRefresh(){ if(ST.CUR_VIEW==='inbstat') renderInbStat(); else { renderInbPanel(); if(ST.CUR_VIEW==='inbound') renderGrid(); } }
export function iaWire(host){
  var e=host.querySelector('#iaEdit'); if(e) e.onclick=iaEdit;
  var r=host.querySelector('#iaRun'); if(r) r.onclick=iaRun;
  var t=host.querySelector('#iaLogTg'); if(t) t.onclick=function(){ IA.open=!IA.open; var box=host.querySelector('#iaLogBox'); if(box) box.style.display=IA.open?'':'none'; };
}
/** «지금 실행» — Apps Script 웹앱 action=inbound_autoreply (가져오기 버튼과 같은 방식 · 5분에 1회) */
export function iaRun(){
  if(!ST.IS_SUPER || IA.busy) return;
  if(!confirm('인바운드 자동 회신을 지금 한 번 돌립니다.\n지금 모드: '+(IA_MODE[(IA.cfg||{}).mode]||'')+'\n\n«실제 발송» 모드면 새 문의자에게 메일이 실제로 나갑니다. 계속할까요?')) return;
  IA.busy=true; var b=document.getElementById('iaRun'); if(b) b.disabled=true;
  var done=function(){ IA.busy=false; iaLoad(iaRefresh); };
  fetchT(WEEKLY_GAS+'?action=inbound_autoreply', {}, 120000, '자동 회신(GAS)').then(function(r){ return r.json(); }).then(function(j){
    if(j && j.ok){ var c=j.counts||{}; toast('자동 회신 실행', j.msg || ('처리 '+(c.done||0)+'건 · 보냄 '+(c.sent||0)+' · 초안 '+(c.draft||0)+' · 건너뜀 '+(c.skipped||0)+' · 확인 필요 '+(c.hold||0))); }
    else toast('자동 회신 실행 실패', (j&&j.error)||'스크립트의 doGet 에 inbound_autoreply 가 없으면 Code.gs 를 새 버전으로 배포해 주세요', 'bad');
    done();
  }).catch(function(e){ if(e && e.timeout){ toast('응답 없음', String(e.message||e), 'bad'); done(); return; } window.open(WEEKLY_GAS+'?action=inbound_autoreply','_blank'); setTimeout(done, 5000); });
}
/** 설정 · 문구 창 — inbound_auto 한 줄 PATCH (슈퍼 관리자 · SQL 117 정책) */
export function iaEdit(){
  if(!ST.IS_SUPER || !IA.cfg){ toast('슈퍼 관리자만 고칠 수 있습니다', '', 'info'); return; }
  var c=IA.cfg, id='ovlIa', ov=document.getElementById(id);
  if(!ov){ ov=document.createElement('div'); ov.id=id; ov.className='ovl'; document.body.appendChild(ov); }
  ov.innerHTML=tpl`<div class="modal ia-m" role="dialog" aria-modal="true" aria-labelledby="ovlIaH" style="width:min(720px,100%)">`+
    tpl`<h3 id="ovlIaH">✉ 인바운드 자동 회신 — 설정 · 문구</h3><p class="cap">홈페이지(HubSpot) 제품 문의가 sales@ 로 오면 Apps Script 가 5분 안에 이 문구로 접수 확인 메일을 보냅니다. 저장하면 다음 실행부터 바로 적용(스크립트 수정 불필요). 자리표시: <code>{담당자}</code> <code>{회사}</code> <code>{제품}</code> <code>{문의종류}</code> — 빈 값이면 그 부분은 자연스럽게 빠집니다.</p>`+
    tpl`<div class="frm ia-grid">`+
    tpl`<div class="fld"><label for="iaMode">모드</label><select id="iaMode"><option value="off"${c.mode==='off'? ' selected':''}>끔 — 회신하지 않음(시트 등록은 아래 설정대로)</option><option value="draft"${c.mode==='draft'? ' selected':''}>초안만 — 임시보관함에 만들고 사람이 보냄</option><option value="send"${c.mode==='send'? ' selected':''}>실제 발송 — 문의자에게 바로 보냄</option></select></div>`+
    tpl`<div class="fld"><label for="iaSender">보내는 이름</label><input id="iaSender" maxlength="60" value="${c.sender_name||''}"></div>`+
    tpl`<div class="fld"><label for="iaCc">참조(CC)</label><input id="iaCc" maxlength="120" value="${c.cc||''}" placeholder="sales@genians.com"></div>`+
    tpl`<div class="fld"><label for="iaDedupe">같은 주소 재회신 안 함(일)</label><input id="iaDedupe" type="number" min="0" max="60" value="${String(c.dedupe_days==null? 3 : c.dedupe_days)}"></div>`+
    tpl`<div class="fld"><label for="iaAge">받은 지 n시간 넘은 메일엔 안 보냄</label><input id="iaAge" type="number" min="1" max="720" value="${String(c.max_age_hours==null? 48 : c.max_age_hours)}"></div>`+
    tpl`<div class="fld"><label for="iaSkipQ">보내지 않을 문의 종류(쉼표)</label><input id="iaSkipQ" value="${(c.skip_qtypes||[]).join(', ')}" placeholder="예: 파트너 문의, 채용 문의"></div>`+
    tpl`<div class="fld"><label for="iaSkipD">보내지 않을 도메인(쉼표)</label><input id="iaSkipD" value="${(c.skip_domains||[]).join(', ')}" placeholder="예: partner.co.kr"></div>`+
    tpl`<div class="fld"><label>시트 · 슬랙</label><div class="ia-chk"><label><input type="checkbox" id="iaReg"${c.register_on!==false? ' checked':''}> 인바운드 시트에 자동 등록</label><label><input type="checkbox" id="iaSlack"${c.slack_on? ' checked':''}> 등록 때 슬랙 알림</label></div></div>`+
    tpl`<div class="fld full"><label for="iaSubject">제목</label><input id="iaSubject" maxlength="200" value="${c.subject||''}"></div>`+
    tpl`<div class="fld full"><label for="iaBody">본문</label><textarea id="iaBody" rows="9" maxlength="4000">${c.body||''}</textarea></div>`+
    tpl`<div class="fld full"><label for="iaSign">서명</label><textarea id="iaSign" rows="4" maxlength="1000">${c.signature||''}</textarea></div>`+
    tpl`</div><details class="ia-pv"><summary class="mini">미리 보기(예: 가상기관 · 홍길동 · Genian NAC · 견적 문의)</summary><pre id="iaPv" class="mini"></pre></details>`+
    tpl`<div class="mact"><span class="mmsg" id="iaMsg"></span><button type="button" class="pill ghost" id="iaCancel">닫기</button><button type="button" class="pill" id="iaSave">저장</button></div></div>`;
  openOvl(id);
  var m=/** @type {any} */(ov.firstElementChild);
  var pv=function(){ var f={requester:'홍길동', org:'가상기관', product:'Genian NAC', qtype:'견적 문의'}; var fill=function(s){ return String(s||'').replace(/\{담당자\}/g,f.requester).replace(/\{회사\}/g,f.org).replace(/\{제품\}/g,f.product).replace(/\{문의종류\}/g,f.qtype); };
    m.querySelector('#iaPv').textContent='제목: '+fill(m.querySelector('#iaSubject').value)+'\n\n'+fill(m.querySelector('#iaBody').value).trim()+'\n\n'+String(m.querySelector('#iaSign').value||'').trim(); };
  ['iaSubject','iaBody','iaSign'].forEach(function(i){ m.querySelector('#'+i).addEventListener('input', pv); }); pv();
  m.querySelector('#iaCancel').onclick=function(){ closeOvl(id); };
  m.querySelector('#iaSave').onclick=async function(){
    var msg=m.querySelector('#iaMsg'), v=function(i){ return /** @type {any} */(m.querySelector('#'+i)).value; };
    var list=function(s){ return String(s||'').split(/[,\n]/).map(function(x){ return x.trim(); }).filter(Boolean); };
    var body={mode:v('iaMode'), sender_name:v('iaSender').trim()||'지니언스 서비스사업부', cc:v('iaCc').trim(), dedupe_days:Math.max(0, Math.min(60, +v('iaDedupe')||0)), max_age_hours:Math.max(1, Math.min(720, +v('iaAge')||48)),
      skip_qtypes:list(v('iaSkipQ')), skip_domains:list(v('iaSkipD')).map(function(d){ return d.toLowerCase().replace(/^@/,''); }), register_on:/** @type {any} */(m.querySelector('#iaReg')).checked, slack_on:/** @type {any} */(m.querySelector('#iaSlack')).checked,
      subject:v('iaSubject').trim(), body:v('iaBody'), signature:v('iaSign')};
    if(!body.subject || !body.body.trim()){ msg.textContent='제목과 본문은 비울 수 없습니다'; msg.className='mmsg bad'; return; }
    if(body.cc && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.cc)){ msg.textContent='참조 주소가 이메일 형식이 아닙니다'; msg.className='mmsg bad'; return; }
    if(body.mode==='send' && c.mode!=='send' && !confirm('«실제 발송»으로 바꿉니다. 저장 뒤 5분 안에 들어오는 새 문의부터 문의자에게 메일이 실제로 나갑니다.\n(이미 받은 지 '+body.max_age_hours+'시간 넘은 메일엔 보내지 않음)\n\n계속할까요?')) return;
    msg.textContent='저장 중…'; msg.className='mmsg';
    try{
      await sbWrite('PATCH', 'inbound_auto?id=eq.1', body, 'return=minimal', 'inbound');
      var ch={}; Object.keys(body).forEach(function(k){ if(JSON.stringify(body[k])!==JSON.stringify(c[k])) ch[k]={from:c[k]==null? null : c[k], to:body[k]}; });
      logChange('update', 'inbound_auto', 1, Object.assign({_via:'인바운드 › 자동 회신 설정'}, ch));
      closeOvl(id); toast('자동 회신 설정 저장', IA_MODE[body.mode]+(ch.body||ch.subject||ch.signature? ' · 문구 바뀜':''), 'ok');
      iaLoad(iaRefresh);
    }catch(e){ var s=String(/** @type {any} */(e).message||e); msg.textContent=/PGRST|42501|policy|permission|does not exist/i.test(s)? 'SQL 117 을 먼저 실행해야 저장할 수 있습니다 — '+s.slice(0,100) : '저장하지 못했습니다 — '+s.slice(0,140); msg.className='mmsg bad'; }
  };
  setTimeout(function(){ try{ m.querySelector('#iaMode').focus(); }catch(e){} }, 60);
}
