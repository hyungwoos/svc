/* ===== tools.js — 전역 검색 · 고객 360 · 표 밀도 · 엑셀 붙여넣기 · 메뉴 편집 · 글자 크기 =====
   ES 모듈(㊿+153) — 다른 파일의 이름은 아래 import 로만 씀 · 이 파일의 최상위 var/function 은 전부 export · 즉시 실행 문장은 js/init.js 의 start() 에 */
import { ST } from './state.js';
import { $, amtWhy, lline, mk, navText, rawHtml, tpl, won, wonKo } from './core.js';
import { buildRail, c360Enhance, cmdAskHit, cmdMenuHits, dIdx, ico, loadFromDb, onData, renderInbox, sbTry, sbWrite, toast, todayStr, visBtn } from './shell.js';
import { GRIDS } from './grids.js';
import { applyChannelMenu, ctRawOf, liveData } from './analysis.js';
import { goInbList, loadInbound } from './inbound.js';
import { applyMenuFold } from './sales.js';
import { ctPeriods, navMenu, openDetail, renderGrid, switchView } from './grid.js';
import { syncOrderAssets } from './equipment.js';
import { closeOvl, openOvl, ovlMarkDirty } from './edit.js';


/* ===== 전역 검색 (Ctrl+K) ===== */
export function fkNorm(s){ return String(s==null?'':s).toLowerCase().replace(/\s+/g,''); }
export function fkSources(){
  var out=[];
  (ST.DATA&&ST.DATA.rows||[]).forEach(function(r){
    out.push({t:'계약', nm:r.cust, sb:lline(r.line)+' · '+(r.channel||'')+' · '+(r.partner||'')+' · '+(r.csm||''), go:function(){ switchView('contracts'); $('#dvSearch').value=r.cust; renderGrid(); }, cust:r.cust});
  });
  (function(){ var lv=(ST.DATA&&ST.DATA.rows)? liveData() : null; (lv&&lv.ok? lv.rows:[]).forEach(function(r){
    out.push({t:'LIVE', nm:r.cust, sb:(r.prod||'')+' · '+(r.nodes||'')+'노드'+(r.basis? ' · '+r.basis:''), go:function(){ switchView('live'); $('#dvSearch').value=r.cust; renderGrid(); }, cust:r.cust});
  }); })();
  (ST.RAWX.oi||[]).forEach(function(r){
    out.push({t:'OI', nm:r.customer, sb:(r.deal_name||'')+' · '+(r.stage||'')+' · '+(r.owner||'')+' '+(r.requester||''), go:function(){ switchView('oi'); $('#dvSearch').value=r.customer; renderGrid(); }, cust:r.customer});
  });
  (ST.RAWX.inbound||[]).forEach(function(r){
    out.push({t:'인바운드', nm:r.org, sb:(r.on_date||'')+' · '+(r.product||'')+' · '+(r.result||'')+' · '+(r.owner||'')+' '+(r.requester||''), go:function(){ goInbList(); $('#dvSearch').value=r.org; renderGrid(); }, cust:r.org});
  });
  (ST.RAWX.mdrops||[]).forEach(function(r){
    out.push({t:'MDR', nm:r.customer, sb:(r.svc_type||'')+' · '+(r.status||'')+' · '+(r.sales_name||'')+' '+(r.requester||'')+' '+(r.mgr_name||''), go:function(){ switchView('mdrops'); $('#dvSearch').value=r.customer; renderGrid(); }, cust:r.customer});
  });
  (ST.RAWX.assets||[]).forEach(function(r){
    out.push({t:'장비', nm:r.serial, sb:(r.model||'')+' · '+(r.status||'')+' · '+(r.customer||''), go:function(){ switchView('assets'); $('#dvSearch').value=r.serial; renderGrid(); }});
  });
  (ST.RAWX.orders||[]).forEach(function(r){
    out.push({t:'임대신청', nm:r.customer||'-', sb:(r.status||'')+' · '+(r.requester||'')+' '+(r.mgr_name||''), go:function(){ switchView('orders'); $('#dvSearch').value=r.customer||''; renderGrid(); }, cust:r.customer});
  });
  return out;
}
export function openFind(){
  if(!ST.SB_TOKEN || !ST.DATA) return;
  if(ST.RAWX.inbound===undefined && !ST.IS_EQUIP) try{ loadInbound(function(){}); }catch(e){}
  openOvl('ovlFind');
  var inp=$('#fkInput'); inp.value=''; $('#fkOut').innerHTML='';
  setTimeout(function(){ inp.focus(); },60);
  var hits=[];
  inp.onkeydown=function(e){                                        // 입력 전에도 ESC·Enter 동작
    if(e.key==='Escape'){ e.preventDefault(); closeOvl('ovlFind'); }
    if(e.key==='Enter' && hits.length){ closeOvl('ovlFind'); hits[0].go(); }
  };
  var ov=document.getElementById('ovlFind');
  ov.onmousedown=function(e){ if(e.target===ov) closeOvl('ovlFind'); };   // 바깥 클릭으로 닫기
  inp.oninput=function(){
    var q=fkNorm(inp.value), out=$('#fkOut');
    hits=[];
    if(q.length<1){ out.innerHTML=''; return; }
    // ⓞ 화면 이동 (메뉴 이름 매치)
    try{ hits=hits.concat(cmdMenuHits(inp.value)); }catch(e){}
    if(q.length<2){ out.innerHTML=hits.map(function(h,i){ return tpl`<div class="fk-row" data-i="${rawHtml(i)}"><span class="tp" style="background:var(--surface-2);color:var(--ink-2)">${rawHtml(h.t)}</span><span class="nm">${h.nm||''}</span><span class="sb">${h.sb||''}</span></div>`; }).join('');
      out.querySelectorAll('.fk-row').forEach(function(row){ row.onclick=function(){ closeOvl('ovlFind'); hits[+row.dataset.i].go(); }; }); return; }
    var src=fkSources(), seen={};
    // ① 고객 360 후보 (고객사명 매치, 중복 제거)
    var custs={};
    src.forEach(function(s){ if(s.cust && fkNorm(s.cust).indexOf(q)>=0) custs[s.cust]=1; });
    Object.keys(custs).slice(0,4).forEach(function(c){
      hits.push({t:'고객 360', nm:c, sb:'이 고객사의 계약·OI·인바운드·PoC·장비 한눈에', go:function(){ openCust360(c); }, k360:1});
    });
    // ② 개별 결과
    src.forEach(function(s){
      if(hits.length>=32) return;
      if(fkNorm(s.nm).indexOf(q)<0 && fkNorm(s.sb).indexOf(q)<0) return;
      var key=s.t+'|'+s.nm+'|'+s.sb; if(seen[key]) return; seen[key]=1;
      hits.push(s);
    });
    // ③ AI에게 그대로 물어보기
    try{ var ai=cmdAskHit(inp.value); if(ai) hits.push(ai); }catch(e){}
    out.innerHTML=hits.map(function(h,i){
      return tpl`<div class="fk-row" data-i="${rawHtml(i)}"><span class="tp"${rawHtml(h.k360?' style="background:rgba(42,120,214,.12);color:var(--s1-ink)"':(h.kmenu?' style="background:var(--surface-2);color:var(--ink-2)"':(h.kai?' style="background:var(--brand);color:#fff"':'')))}>${rawHtml(h.t)}</span>`+
        tpl`<span class="nm">${h.nm||''}</span><span class="sb">${h.sb||''}</span></div>`;
    }).join('')||'<p class="cap" style="padding:8px">결과 없음</p>';
    out.querySelectorAll('.fk-row').forEach(function(row){
      row.onclick=function(){ closeOvl('ovlFind'); hits[+row.dataset.i].go(); };
    });
  };
}


/* ===== 고객 360 — 한 고객사의 모든 정보 ===== */
export function c360Match(a,b){
  var x=fkNorm(a), y=fkNorm(b);
  if(!x||!y) return false;
  return x.indexOf(y)>=0 || y.indexOf(x)>=0;
}
/* ㊿+161 고객 360 계약 표의 연장 — 연장한 계약 바로 아래 한 줄: 최초 → 연장 n회 (기간 · 월 금액(천원) · 노드) · 계약 상세(ctPeriods)와 같은 값 */
export function c360RenewLine(r){
  if(!r || !(r.renew>0 || (r.renewHist||[]).length)) return '';
  var raw=ctRawOf(r._id) || {start_month:(r.startIdx!=null? mk(r.startIdx)+'-01' : null), contract_type:r.ctype, renew_history:r.renewHist, qty:r.qty};
  var mine=((ST.RAWX&&ST.RAWX.mrs)||[]).filter(function(x){ return x.contract_id===r._id; });
  var ps=ctPeriods(raw, mine); if(!ps.length) return '';
  return ps.map(function(p){ return tpl`<span class="c360-rp"><b>${p.k}</b> ${p.from||'?'}~${p.to||'?'}${rawHtml(p.mrr!=null? ' · '+won(p.mrr) : '')}${rawHtml(p.qty!=null? ' · '+Number(p.qty).toLocaleString('ko-KR')+'노드' : '')}</span>`; }).join(tpl`<span class="c360-ra">→</span>`);
}
export function openCust360(name){
  var nm=name;
  /* sub[i] — i번째 행 바로 아래에 붙일 한 줄(계약 표의 연장 이력) · ids[i] — 누르면 그 계약 상세(㊿+162) */
  function tb(cols, rows, sub, ids){
    if(!rows.length) return '<p class="cap" style="margin:2px 0 0">없음</p>';
    return tpl`<table><thead><tr>${rawHtml(cols.map(function(c){return tpl`<th>${rawHtml(c)}</th>`;}).join(''))}</tr></thead><tbody>`+
      tpl`${rawHtml(rows.map(function(r,i){ var s=sub&&sub[i], id=ids&&ids[i]; return tpl`<tr${rawHtml(s? ' class="c360-has"':'')}${rawHtml(id!=null? tpl` data-c360ct="${id}" tabindex="0" title="계약 상세 — 계약 기간 · 연장 이력 · 월별 금액 · 변경 이력"`:'')}>${rawHtml(r.map(function(v){return tpl`<td>${String(v==null||v===''?'·':v)}</td>`;}).join(''))}</tr>`+
        (s? tpl`<tr class="c360-rn"><td colspan="${rawHtml(cols.length)}">${rawHtml(s)}</td></tr>` : ''); }).join(''))}</tbody></table>`;
  }
  var cts=(ST.DATA&&ST.DATA.rows||[]).filter(function(r){return c360Match(r.cust,nm);});
  var lvAll=(ST.DATA&&ST.DATA.rows)? liveData() : null;
  var lives=(lvAll&&lvAll.ok? lvAll.rows:[]).filter(function(r){return c360Match(r.cust,nm);});
  var ois=(ST.RAWX.oi||[]).filter(function(r){return c360Match(r.customer,nm);});
  var inbs=(ST.RAWX.inbound||[]).filter(function(r){return c360Match(r.org,nm);});
  var mdrs=(ST.RAWX.mdrops||[]).filter(function(r){return c360Match(r.customer,nm);});
  var asts=(ST.RAWX.assets||[]).filter(function(r){return c360Match(r.customer,nm);});
  var ords=(ST.RAWX.orders||[]).filter(function(r){return c360Match(r.customer,nm);});
  $('#c360Title').textContent='🏢 '+nm;
  $('#c360Cap').textContent='계약 '+cts.length+'건 · LIVE '+lives.length+'건 · OI '+ois.length+'건 · 인바운드 '+inbs.length+'건 · MDR 운영 '+mdrs.length+'건 · 장비 현황 '+asts.length+'대(임대중 '+asts.filter(function(a){ return a.status==='임대중'; }).length+'대) · 장비 신청 '+ords.length+'건'+
    (ST.RAWX.inbound===undefined? ' · (인바운드는 메뉴를 한 번 연 뒤 집계됩니다)':'');
  /* ㊿+169 섹션 머리: 이모지 대신 같은 모양 선 아이콘 · data-l = 탭 이름 */
  var SEC_ICO={'📋':'doc','🟢':'check','🎯':'target','📥':'inbox','🛰️':'shield','🔧':'box'};
  function sec(icon,label,n,html){ return tpl`<div class="c360-sec"><h4 data-l="${String(label).replace(/<[^>]*>.*$/,'').trim()}">${rawHtml(SEC_ICO[icon]? ico(SEC_ICO[icon],15) : icon)} ${rawHtml(label)} <span class="ct">${rawHtml(typeof n==='string'? n : n+'건')}</span></h4>${rawHtml(html)}</div>`; }   /* ㊿+168 n 이 글자면 단위 포함(장비 = 대) */
  $('#c360Body').innerHTML=
    sec('📋','계약',cts.length, tb(['서비스','채널','파트너','구분','상태','기간','연장','MRR(천원)'],
      cts.map(function(r){ return [(r.parent? '↳ ':'')+lline(r.line), r.channel, r.partner, r.ctype, r.status,
        /* ㊿+155: 예전엔 r.start · r.end(없는 키)를 읽어 «기간» 이 늘 빈칸이었음 — 계약 행은 월 인덱스(startIdx · endIdx) */
        (r.startIdx!=null? mk(r.startIdx):'')+' ~ '+(r.endIdx!=null? mk(r.endIdx):''), r.renew>0? r.renew+'회' : '', r.mrr? Math.round(Number(r.mrr)/1000).toLocaleString('ko-KR'):'' ]; }),
      cts.map(function(r){ try{ return c360RenewLine(r); }catch(e){ return ''; } }), cts.map(function(r){ return r._id; })))+
    sec('🟢','LIVE'+(lvAll&&lvAll.src==='db'? tpl` <span class="mini" style="font-weight:400;color:var(--muted)">계약 기준 ${mk(lvAll.T)}</span>`:''),lives.length, tb(['제품','서비스','노드','최초 개시','현행 종료','근거'],
      lives.map(function(r){ return [r.prod, lline(r.line), r.nodes, r.start||'', r.end||'', r.basis||(r.dup?'중복표시':'')]; })))+
    sec('🎯','OI (영업기회)',ois.length, tb(['사업명','상태','예상시기','예상단가(천원)','담당'],
      ois.map(function(r){ return [r.deal_name, r.stage, String(r.expect_month||'').slice(0,7), r.expect_amount? Math.round(Number(r.expect_amount)/1000).toLocaleString('ko-KR'):'', r.owner]; })))+
    sec('📥','인바운드',inbs.length, tb(['접수일','문의 제품','유형','상태','담당'],
      inbs.map(function(r){ return [r.on_date, r.product, r.qtype, r.result, r.owner]; })))+
    sec('🛰️','MDR 운영·PoC',mdrs.length, tb(['유형','상태','라이선스','시작일','설치/계약'],
      mdrs.map(function(r){ return [r.svc_type, r.status, r.license, r.start_date, (r.agents_total||0)+'/'+(r.plan_qty||0)]; })))+
    /* ㊿+168 장비: 실물(시리얼 현황 · 대)과 신청(발주) 이력(건)을 나눔 — 미등록 시리얼은 «보완 필요» */
    sec('🔧','장비',asts.filter(function(a){ return a.status==='임대중'; }).length+'대 임대중',
      tpl`<div class="c360-sub">장비 현황(시리얼) · ${rawHtml(asts.length)}대</div>`+ tb(['시리얼','모델','상태','설치·입고일','신청'],
        asts.map(function(r){ var ph=/^미등록-/.test(String(r.serial||'')); return [ph? '미등록 시리얼 (보완 필요)' : r.serial, r.model, r.status, r.deployed_date||r.in_date, r.order_id? '#'+r.order_id : '']; }))+
      tpl`<div class="c360-sub">신청(발주) 이력 · ${rawHtml(ords.length)}건</div>`+ tb(['신청','모델','수량','상태','신청일','회수'],
        ords.map(function(r){ var rs=String(r.returned_serials||'').split(/[,\s]+/).filter(Boolean).length; return ['#'+r.id, r.model, (r.qty||'')+(r.qty?'대':''), r.status, String(r.created_at||'').slice(0,10), r.status==='회수완료'? '전체 회수' : (rs? '부분 회수 '+rs+'대' : '')]; })));
  /* ㊿+162 계약 행(과 그 아래 연장 줄)을 누르면 계약 상세 — 고객 360 위에 열리고, 닫으면 고객 360 으로 돌아옴 */
  $('#c360Body').querySelectorAll('tr[data-c360ct]').forEach(function(tr){
    var go=function(){ var c=ctRawOf(Number(tr.getAttribute('data-c360ct'))); if(c) openDetail(c); else toast('계약 상세', '이 계약 원본을 아직 불러오지 못했습니다 — 잠시 뒤 다시 눌러 주세요', 'info'); };
    tr.onclick=go; tr.onkeydown=function(e){ if(e.key==='Enter'){ e.preventDefault(); go(); } };
    var nx=tr.nextElementSibling; if(nx && nx.classList.contains('c360-rn')) nx.onclick=go;
  });
  try{ c360Enhance(nm, cts, lives, ois, inbs, asts, ords); }catch(e){ console.warn('c360', e); }
  openOvl('ovlC360');
}

/* ===== 표 밀도 (보통/컴팩트) ===== */
export function denseKey(){ return 'svc_dense_'+(ST.AUTH_USER||'anon'); }
export function applyDense(){
  var on=false; try{ on=localStorage.getItem(denseKey())==='1'; }catch(e){}
  var t=document.getElementById('dvTable'); if(t) t.classList.toggle('dense', on);
  var b=document.getElementById('dvDense');
  if(b) b.style.background = on? 'var(--brand-t,rgba(46,189,87,.13))':'';
}

/* ===== 엑셀 붙여넣기 대량 입력 ===== */
export function pasteCols(g){ return g.cols.filter(function(c){ return !c.ro && c.k[0]!=='_'; }); }
export function openPaste(){
  var g=GRIDS[ST.CUR_VIEW]; if(!g||!g.add) return;
  var cols=pasteCols(g);
  $('#pasteCols').innerHTML=tpl`열 순서: ${rawHtml(cols.map(function(c){return tpl`<b>${c.l}</b>`;}).join(' → '))}`+ tpl`${rawHtml(cols.some(function(c){ return c.won; })? ' <span class="mini"><b>금액은 천원</b>(표와 같은 단위)</span>' : '')}`+
    tpl` <span class="mini">(엑셀에서 이 순서로 열을 맞춰 복사하세요 · 빈 칸은 비워둬도 됩니다)</span>`;
  $('#pasteTa').value=''; $('#pastePrev').textContent=''; $('#pasteMsg').textContent='';
  function parse(){
    var lines=$('#pasteTa').value.split(/\r?\n/).filter(function(l){return l.trim();});
    return lines.map(function(l){
      var cells=l.split('\t'), row={};
      cols.forEach(function(c,i){
        var v=(cells[i]||'').trim();
        if(v===''){ row[c.k]=null; return; }
        if(c.t==='number'){ var n=parseFloat(v.replace(/[^\d.\-]/g,'')); row[c.k]=isNaN(n)?null:(c.won? Math.round(n*1000) : n); }   /* 금액 열은 천원으로 붙여넣기 → 원 (㊿+157) */
        else if(c.t==='month'){ var m=v.match(/(\d{4})[.\-\/년\s]*(\d{1,2})/); row[c.k]=m? m[1]+'-'+('0'+m[2]).slice(-2)+'-01':null; }
        else if(c.t==='bool'){ row[c.k]=/^(o|y|true|1|예|중복)$/i.test(v); }
        else row[c.k]=v;
      });
      return row;
    });
  }
  $('#pasteTa').oninput=function(){
    var rows=parse();
    /* ㊿+157 첫 행을 «열 이름: 값»으로 · 금액은 읽기 쉬운 금액(= 48만원)으로 보여 줌 */
    $('#pastePrev').textContent=rows.length? rows.length+'행 인식됨 — 첫 행: '+cols.map(function(c){ var v=rows[0][c.k]; return v==null? '' : c.l.replace(/\(천원\)/,'')+' '+(c.won? wonKo(v) : String(v)); }).filter(Boolean).join(' · ').slice(0,220):'';
  };
  $('#pasteGo').onclick=async function(){
    var rows=parse();
    if(!rows.length){ $('#pasteMsg').textContent='붙여넣은 내용이 없습니다'; return; }
    /* ㊿+157 금액이 이상한 행(1만원 미만 · 월 금액 1억↑ · 1,000억↑)이 있으면 먼저 보여 주고 묻기 — 원으로 된 시트를 그대로 붙이면 1000배가 됨 */
    var odd=[]; rows.forEach(function(r, i){ cols.forEach(function(c){ if(!c.won || !r[c.k]) return; var why=amtWhy(r[c.k], 0, /^(mrr|monthly_fee)$/.test(c.k)) || (Math.abs(r[c.k])>=1e11? '1,000억원 이상입니다':''); if(why) odd.push((i+1)+'행 '+c.l.replace(/\(천원\)/,'')+' '+wonKo(r[c.k])+' — '+why); }); });
    if(odd.length && !confirm('금액이 이상해 보이는 칸이 '+odd.length+'개 있습니다 (금액은 «천원» 단위로 붙여넣기):\n\n'+odd.slice(0,5).join('\n')+(odd.length>5? '\n… 외 '+(odd.length-5)+'개':'')+'\n\n그래도 추가할까요?')) return;
    if(!confirm(rows.length+'행을 「'+g.title+'」에 추가할까요?')) return;
    $('#pasteMsg').textContent='저장 중…';
    try{
      for(var i=0;i<rows.length;i+=100){
        if(g.table==='equipment_orders'){   /* ㊿+157 붙여넣은 신청도 장비 현황에 바로 반영 */
          var got=await sbWrite('POST', g.table+'?select=*', rows.slice(i,i+100), 'return=representation');
          for(var j=0;j<(got||[]).length;j++){ try{ ST.RAWX.orders=(ST.RAWX.orders||[]).concat([got[j]]); await syncOrderAssets(got[j], null, true); }catch(e){} }
        } else await sbWrite('POST', g.table, rows.slice(i,i+100));
      }
      closeOvl('ovlPaste');
      toast('붙여넣기 입력', rows.length+'행 추가됨 — '+g.title);
      loadFromDb().then(function(nd){ onData(nd); if(GRIDS[ST.CUR_VIEW]) renderGrid(); });
    }catch(e){ $('#pasteMsg').textContent=String(e.message||e).slice(0,140); }
  };
  openOvl('ovlPaste');
}

/* ===== 홈 — 오늘 할 일 카드 + 바로가기 ===== */
export function viewLabel(v){
  var b=document.querySelector('.side button[data-v="'+v+'"]');
  return b? navText(b):v;
}
export function recentKey(){ return 'svc_recent_'+(ST.AUTH_USER||'anon'); }

/* ===== 메뉴 편집 — 순서·숨김 (admin 이상 · 내 계정/브라우저에만 적용) ===== */
export function menuConfKey(){ return 'svc_menuconf_'+(ST.AUTH_USER||'anon'); }
export function menuSegments(){
  var out=[], kids=Array.prototype.slice.call($('#side').children);
  kids.forEach(function(el){
    if(el.classList && el.classList.contains('grp')){
      out.push({key:'g:'+el.textContent.trim(), label:el.textContent.trim(), grp:el, buttons:[], items:[]});
    }else if(el.classList && el.classList.contains('subgrp')){   /* ㊿+142: 그룹 안 소제목(사업 영역 › Cloud NAC/MDR/기타) — 순서 이동 때 같이 움직임 */
      var lg=out[out.length-1]; if(lg && lg.grp) lg.items.push(el);
    }else if(el.tagName==='BUTTON'){
      var v=el.dataset.v;
      if(!v || v==='dash' || v==='account' || el.id==='btnMenuEdit') return;   // 고정 항목
      var last=out[out.length-1];
      if(last && last.grp){ last.buttons.push(el); last.items.push(el); }
      else out.push({key:'b:'+v, label:el.textContent.trim(), btn:el});
    }
  });
  return out;
}
export function applyMenuConf(){
  if(ST.IS_EQUIP) return;   // 제한 계정은 기본 메뉴 그대로
  var conf=null; try{ conf=JSON.parse(localStorage.getItem(menuConfKey())||'null'); }catch(e){}
  conf=menuConfMigrate(conf);
  var segs=menuSegments(), side=$('#side');
  if(conf && conf.order && conf.order.length){
    var map={}; segs.forEach(function(s){ map[s.key]=s; });
    var ordered=conf.order.filter(function(k){return map[k];}).map(function(k){return map[k];});
    segs.forEach(function(s){ if(conf.order.indexOf(s.key)<0) ordered.push(s); });   // 새로 생긴 메뉴는 뒤에
    ordered.forEach(function(s){
      if(s.grp){ side.appendChild(s.grp); (s.items||s.buttons).forEach(function(b){ side.appendChild(b); }); }
      else side.appendChild(s.btn);
    });
    // 고정 항목은 항상 맨 아래
    var acc=side.querySelector('button[data-v="account"]'), me=document.getElementById('btnMenuEdit');
    if(acc) side.appendChild(acc); if(me) side.appendChild(me);
  }
  var hid=(conf && conf.hidden)||{};
  segs.forEach(function(s){
    var h=!!hid[s.key];
    if(s.grp){
      s.grp.classList.toggle('mhide', h);
      s.buttons.forEach(function(b){ b.classList.toggle('mhide', h || !!hid['b:'+b.dataset.v]); });
    }else s.btn.classList.toggle('mhide', h);
  });
  subgrpSync();
}
/* ㊿+142 메뉴 그룹 정리: 예전 «사업 영역 · Cloud NAC / MDR / 기타 (유통)» 3그룹 → «사업 영역» 1그룹(소제목 3개).
   저장된 메뉴 편집(순서·숨김)을 새 그룹 이름으로 옮김 — 옛 그룹을 숨겼으면 그 안 메뉴를 하나씩 숨김 */
export var MENU_OLD_CHGRP={'g:사업 영역 · Cloud NAC':['cngen','cnpub','cns1','cnlgu'], 'g:사업 영역 · MDR':['mdrgen','mdrs1','mdrlgu'], 'g:사업 영역 · 기타 (유통)':['chdist','cnpns']};
export function menuConfMigrate(conf){
  if(!conf) return conf; var NEW='g:사업 영역', olds=Object.keys(MENU_OLD_CHGRP), touched=false;
  if(conf.order && conf.order.some(function(k){ return MENU_OLD_CHGRP[k]; })){
    var seen={}; conf.order=conf.order.map(function(k){ return MENU_OLD_CHGRP[k]? NEW : k; }).filter(function(k){ if(seen[k]) return false; seen[k]=1; return true; }); touched=true; }
  var hid=conf.hidden||{};
  if(olds.some(function(k){ return hid[k]; })){
    if(olds.every(function(k){ return hid[k]; })) hid[NEW]=1;
    else olds.forEach(function(k){ if(hid[k]) MENU_OLD_CHGRP[k].forEach(function(v){ hid['b:'+v]=1; }); });
    olds.forEach(function(k){ delete hid[k]; }); conf.hidden=hid; touched=true; }
  if(touched) try{ localStorage.setItem(menuConfKey(), JSON.stringify(conf)); }catch(e){}
  return conf;
}
/* 소제목 아래 보이는 메뉴가 하나도 없으면(권한·채널 계약 없음·메뉴 편집 숨김) 소제목도 숨김 */
export function subgrpSync(){
  var side=document.getElementById('side'); if(!side) return;
  side.querySelectorAll('.subgrp').forEach(function(s){
    var el=s.nextElementSibling, vis=false;
    while(el && !(el.classList && (el.classList.contains('grp')||el.classList.contains('subgrp')))){ if(el.tagName==='BUTTON' && visBtn(el)) vis=true; el=el.nextElementSibling; }
    s.classList.toggle('sub-empty', !vis);
  });
}
/* 메뉴 버튼의 소제목(없으면 '') — Ctrl+K·권한 표에서 «일반 판매»가 Cloud NAC 것인지 MDR 것인지 구분 */
export function navSub(b){
  for(var el=b && b.previousElementSibling; el; el=el.previousElementSibling){
    if(el.classList && el.classList.contains('subgrp')) return el.dataset.sub || el.textContent.trim();
    if(el.classList && el.classList.contains('grp')) return '';
  }
  return '';
}
export function openMenuEdit(){
  var conf=null; try{ conf=JSON.parse(localStorage.getItem(menuConfKey())||'null'); }catch(e){}
  var segs=menuSegments();
  var hid=(conf&&conf.hidden)||{};
  // 현재 화면 순서 그대로 시작 (applyMenuConf 후의 DOM 순서)
  var st=segs.map(function(s){ return s; });
  function paint(){
    var h='';
    st.forEach(function(s,i){
      h+=tpl`<div class="mc-row"><button class="mv" data-mv="up" data-i="${rawHtml(i)}">↑</button>`+
        tpl`<button class="mv" data-mv="dn" data-i="${rawHtml(i)}">↓</button>`+
        tpl`<span class="nm"><b>${s.label}</b></span>`+
        tpl`<label><input type="checkbox" data-hk="${s.key}"${hid[s.key]?' checked':''}>숨김</label></div>`;
      if(s.grp) s.buttons.forEach(function(b){
        var v=b.dataset.v;
        if(v==='adminx') return;   // 관리자 메뉴는 권한으로만 제어
        h+=tpl`<div class="mc-row child"><span class="nm">${b.textContent.trim()}</span>`+
          tpl`<label><input type="checkbox" data-hk="b:${v}"${hid['b:'+v]?' checked':''}>숨김</label></div>`;
      });
    });
    $('#mcBody').innerHTML=h;
    $('#mcBody').querySelectorAll('[data-mv]').forEach(function(bt){
      bt.onclick=function(){
        var i=+bt.dataset.i, j=bt.dataset.mv==='up'? i-1 : i+1;
        if(j<0||j>=st.length) return;
        var t=st[i]; st[i]=st[j]; st[j]=t; ovlMarkDirty('ovlMenu');   /* ㊿+141: 순서를 바꾼 채 바깥을 누르면 확인 */
        // 체크 상태 먼저 반영
        $('#mcBody').querySelectorAll('[data-hk]').forEach(function(c){ if(c.checked) hid[c.dataset.hk]=1; else delete hid[c.dataset.hk]; });
        paint();
      };
    });
  }
  paint();
  $('#mcSave').onclick=function(){
    $('#mcBody').querySelectorAll('[data-hk]').forEach(function(c){ if(c.checked) hid[c.dataset.hk]=1; else delete hid[c.dataset.hk]; });
    try{ localStorage.setItem(menuConfKey(), JSON.stringify({order:st.map(function(s){return s.key;}), hidden:hid})); }catch(e){}
    closeOvl('ovlMenu');
    applyMenuConf(); applyChannelMenu(); applyMenuFold(); try{ buildRail(); }catch(e){}
    toast('메뉴 편집','저장됨 — 내 화면에만 적용됩니다');
  };
  $('#mcReset').onclick=function(){
    if(!confirm('메뉴 순서·숨김을 기본값으로 되돌릴까요?')) return;
    try{ localStorage.removeItem(menuConfKey()); }catch(e){}
    closeOvl('ovlMenu');
    location.reload();   // DOM 순서 원복은 새로고침이 가장 확실
  };
  openOvl('ovlMenu');
}
export function pushRecent(v){
  if(v==='dash'||v==='account'||v==='adminx') return;
  try{
    var a=JSON.parse(localStorage.getItem(recentKey())||'[]').filter(function(x){return x!==v;});
    a.unshift(v); localStorage.setItem(recentKey(), JSON.stringify(a.slice(0,6)));
    var f=JSON.parse(localStorage.getItem(freqKey())||'{}')||{}; f[v]=(f[v]||0)+1; localStorage.setItem(freqKey(), JSON.stringify(f));   /* ㊿+169 자주 쓰는 화면 */
  }catch(e){}
}
export function freqKey(){ return 'svc_freq_'+(ST.AUTH_USER||'anon'); }
/** 많이 연 화면 n개 — 지금 메뉴에 보이는 것만 */
export function freqTop(n){
  try{ var f=JSON.parse(localStorage.getItem(freqKey())||'{}')||{};
    return Object.keys(f).filter(function(v){ var b=document.querySelector('#side button[data-v="'+v+'"]'); return !!b && visBtn(b); }).sort(function(x,y){ return f[y]-f[x]; }).slice(0, n||5); }
  catch(e){ return []; }
}
export function renderTodo(){
  var wrap=document.getElementById('todoWrap'); if(!wrap) return;
  if(!ST.SB_TOKEN || !ST.DATA || ST.IS_EQUIP){ wrap.style.display='none'; return; }
  wrap.style.display='';
  var today=new Date(), t0=today.getTime(), todayS=todayStr(today);
  // ① 인바운드 장기 미대응 — 10분 캐시, 필요한 열만 가볍게 조회
  if(!ST.INB_TODO || t0-ST.INB_TODO.t>10*60*1000){
    ST.INB_TODO={t:t0, n:ST.INB_TODO? ST.INB_TODO.n:null};
    sbTry('inbound_leads?y=eq.'+today.getFullYear()+'&result=eq.'+encodeURIComponent('진행중')+'&select=on_date,s1d,s2d,s21d,s3d')
      .then(function(rows){
        var n=null;
        if(rows){ n=0; rows.forEach(function(x){
          var last=[x.on_date,x.s1d,x.s2d,x.s21d,x.s3d].filter(function(d){return d&&/^\d{4}-\d{2}-\d{2}/.test(d);}).sort().pop();
          if(last && (t0-new Date(last).getTime())/864e5>=90) n++;   // 대시보드 기준: 3개월
        }); }
        ST.INB_TODO={t:t0, n:n};
        if(ST.CUR_VIEW==='dash') renderTodo();
      });
  }
  var inbN=ST.INB_TODO? ST.INB_TODO.n:null;
  // ② OI 밀린 액션 — 예정일이 지났는데 아직 진행 중
  var oiLate=(ST.RAWX.oi||[]).filter(function(o){
    return o.next_date && String(o.next_date).slice(0,10)<todayS && !/수주|실패/.test(String(o.stage||''));
  }).length;
  // ③ 재약정 도래 — 60일(2개월) 안에 종료되는 계약
  var nowI=dIdx(todayS), renewN=0;
  (ST.DATA.rows||[]).forEach(function(r){
    if(r._hw || /해지/.test(String(r.status||''))) return;
    if(r.endIdx!=null && r.endIdx>=nowI && r.endIdx<=nowI+2) renewN++;
  });
  // ④ 다음 주간회의 (월요일)
  var dow=today.getDay(), toMon=(8-dow)%7;
  var wkTxt= dow===1? '오늘':'D-'+(toMon===0?7:toMon);
  function card(cls,icon,label,val,sub,go){
    return tpl`<div class="todo-card ${rawHtml(cls)}" data-go="${rawHtml(go)}"><div class="l">${rawHtml(icon)} ${rawHtml(label)}</div>`+
      tpl`<div class="v">${rawHtml(val)}</div><div class="s">${rawHtml(sub)}</div></div>`;
  }
  document.getElementById('todoCards').innerHTML=
    card(inbN>0?'crit':'ok','📥','인바운드 미대응', inbN==null?'…':inbN+'건', inbN>0?'진행중인데 3개월+ 대응 없음':'밀린 건 없음','inbstat')+
    card(oiLate>0?'warn':'ok','🎯','OI 밀린 액션', oiLate+'건', oiLate>0?'다음 할 일 예정일 지남':'예정일 지난 건 없음','oi')+
    card(renewN>0?'warn':'ok','📋','재약정 도래', renewN+'건','60일 안에 계약 종료','contracts')+
    card('','📊','주간회의', wkTxt,'매주 월요일 · 일요일 저녁 자동 취합','weekly');
  // 바로가기 + 최근 방문
  var fav=['contracts','oi','inbstat','weekly','quote'];
  var rec=[]; try{ rec=JSON.parse(localStorage.getItem(recentKey())||'[]'); }catch(e){}
  rec=rec.filter(function(v){return fav.indexOf(v)<0;}).slice(0,3);
  document.getElementById('quickLinks').innerHTML=
    tpl`<span class="ql-l">바로가기</span>`+
    tpl`${rawHtml(fav.map(function(v){return tpl`<button data-go="${rawHtml(v)}">${viewLabel(v)}</button>`;}).join(''))}`+ tpl`${rawHtml(rec.length? tpl`<span class="ql-l" style="margin-left:8px">최근</span>`+
      tpl`${rawHtml(rec.map(function(v){return tpl`<button data-go="${rawHtml(v)}">${viewLabel(v)}</button>`;}).join(''))}`:'')}`;
  wrap.querySelectorAll('[data-go]').forEach(function(el){
    el.onclick=function(){ navMenu(el.dataset.go); };   /* ㊿+145: 바로가기·최근도 메뉴처럼 첫 화면 */
  });
  try{ renderInbox(); }catch(e){}
}

/* ===== 포탈 전체 글자 크기 (보통/크게/아주 크게 — 이 브라우저에 기억) ===== */
export function applyFs(n){
  document.body.style.zoom = n===1? '1.12' : n===2? '1.24' : '';
  var b=document.getElementById('btnFont');
  if(b){
    b.style.background = n>0? 'var(--brand-t,rgba(46,189,87,.13))':'';
    b.innerHTML = tpl`가<b style="font-size:14px">A</b>${n===1?' 크게':n===2?' 최대':''}`;
  }
}


/* ===== 제품 가격표 — 판(개정판) 단위 관리 ===== */
export var PR={seg:'saas', ver:{saas:0,onprem:0}, op:'ztna', q:'', tcoP:'nac', tcoD:0.30};
