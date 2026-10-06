/* ===== tools.js — 전역 검색 · 고객 360 · 표 밀도 · 엑셀 붙여넣기 · 메뉴 편집 · 글자 크기 =====
   ES 모듈(㊿+153) — 다른 파일의 이름은 아래 import 로만 씀 · 이 파일의 최상위 var/function 은 전부 export · 즉시 실행 문장은 js/init.js 의 start() 에 */
import { ST } from './state.js';
import { $, lline, mk, navText } from './core.js';
import { buildRail, c360Enhance, cmdAskHit, cmdMenuHits, dIdx, loadFromDb, onData, renderInbox, sbTry, sbWrite, toast, todayStr, visBtn } from './shell.js';
import { esc } from './dash.js';
import { GRIDS } from './grids.js';
import { applyChannelMenu, liveData } from './analysis.js';
import { goInbList, loadInbound } from './inbound.js';
import { applyMenuFold } from './sales.js';
import { navMenu, renderGrid, switchView } from './grid.js';
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
    if(q.length<2){ out.innerHTML=hits.map(function(h,i){ return '<div class="fk-row" data-i="'+i+'"><span class="tp" style="background:var(--surface-2);color:var(--ink-2)">'+h.t+'</span><span class="nm">'+esc(h.nm||'')+'</span><span class="sb">'+esc(h.sb||'')+'</span></div>'; }).join('');
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
      return '<div class="fk-row" data-i="'+i+'"><span class="tp"'+(h.k360?' style="background:rgba(42,120,214,.12);color:var(--s1-ink)"':(h.kmenu?' style="background:var(--surface-2);color:var(--ink-2)"':(h.kai?' style="background:var(--brand);color:#fff"':'')))+'>'+h.t+'</span>'+
        '<span class="nm">'+esc(h.nm||'')+'</span><span class="sb">'+esc(h.sb||'')+'</span></div>';
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
export function openCust360(name){
  var nm=name;
  function tb(cols, rows){
    if(!rows.length) return '<p class="cap" style="margin:2px 0 0">없음</p>';
    return '<table><thead><tr>'+cols.map(function(c){return '<th>'+c+'</th>';}).join('')+'</tr></thead><tbody>'+
      rows.map(function(r){ return '<tr>'+r.map(function(v){return '<td>'+esc(String(v==null||v===''?'·':v))+'</td>';}).join('')+'</tr>'; }).join('')+'</tbody></table>';
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
  $('#c360Cap').textContent='계약 '+cts.length+' · LIVE '+lives.length+' · OI '+ois.length+' · 인바운드 '+inbs.length+' · MDR 운영 '+mdrs.length+' · 장비 '+(asts.length+ords.length)+
    (ST.RAWX.inbound===undefined? ' · (인바운드는 메뉴를 한 번 연 뒤 집계됩니다)':'');
  function sec(icon,label,n,html){ return '<div class="c360-sec"><h4>'+icon+' '+label+' <span class="ct">'+n+'건</span></h4>'+html+'</div>'; }
  $('#c360Body').innerHTML=
    sec('📋','계약',cts.length, tb(['서비스','채널','파트너','구분','상태','기간','MRR(천원)'],
      cts.map(function(r){ return [(r.parent? '↳ ':'')+lline(r.line), r.channel, r.partner, r.ctype||r.contract_type, r.status,
        (r.start||'')+' ~ '+(r.end||''), r.mrr? Math.round(Number(r.mrr)/1000).toLocaleString('ko-KR'):'' ]; })))+
    sec('🟢','LIVE'+(lvAll&&lvAll.src==='db'? ' <span class="mini" style="font-weight:400;color:var(--muted)">계약 기준 '+mk(lvAll.T)+'</span>':''),lives.length, tb(['제품','서비스','노드','최초 개시','현행 종료','근거'],
      lives.map(function(r){ return [r.prod, lline(r.line), r.nodes, r.start||'', r.end||'', r.basis||(r.dup?'중복표시':'')]; })))+
    sec('🎯','OI (영업기회)',ois.length, tb(['사업명','상태','예상시기','예상단가(천원)','담당'],
      ois.map(function(r){ return [r.deal_name, r.stage, String(r.expect_month||'').slice(0,7), r.expect_amount? Math.round(Number(r.expect_amount)/1000).toLocaleString('ko-KR'):'', r.owner]; })))+
    sec('📥','인바운드',inbs.length, tb(['접수일','문의 제품','유형','상태','담당'],
      inbs.map(function(r){ return [r.on_date, r.product, r.qtype, r.result, r.owner]; })))+
    sec('🛰️','MDR 운영·PoC',mdrs.length, tb(['유형','상태','라이선스','시작일','설치/계약'],
      mdrs.map(function(r){ return [r.svc_type, r.status, r.license, r.start_date, (r.agents_total||0)+'/'+(r.plan_qty||0)]; })))+
    sec('🔧','장비',asts.length+ords.length, tb(['구분','시리얼/발주','모델','상태','일자'],
      asts.map(function(r){ return ['자산', r.serial, r.model, r.status, r.deployed_date||r.in_date]; })
      .concat(ords.map(function(r){ return ['발주', '#'+r.id, r.model, r.status, String(r.created_at||'').slice(0,10)]; }))));
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
  $('#pasteCols').innerHTML='열 순서: '+cols.map(function(c){return '<b>'+esc(c.l)+'</b>';}).join(' → ')+
    ' <span class="mini">(엑셀에서 이 순서로 열을 맞춰 복사하세요 · 빈 칸은 비워둬도 됩니다)</span>';
  $('#pasteTa').value=''; $('#pastePrev').textContent=''; $('#pasteMsg').textContent='';
  function parse(){
    var lines=$('#pasteTa').value.split(/\r?\n/).filter(function(l){return l.trim();});
    return lines.map(function(l){
      var cells=l.split('\t'), row={};
      cols.forEach(function(c,i){
        var v=(cells[i]||'').trim();
        if(v===''){ row[c.k]=null; return; }
        if(c.t==='number'){ var n=parseFloat(v.replace(/[^\d.\-]/g,'')); row[c.k]=isNaN(n)?null:n; }
        else if(c.t==='month'){ var m=v.match(/(\d{4})[.\-\/년\s]*(\d{1,2})/); row[c.k]=m? m[1]+'-'+('0'+m[2]).slice(-2)+'-01':null; }
        else if(c.t==='bool'){ row[c.k]=/^(o|y|true|1|예|중복)$/i.test(v); }
        else row[c.k]=v;
      });
      return row;
    });
  }
  $('#pasteTa').oninput=function(){
    var rows=parse();
    $('#pastePrev').textContent=rows.length? rows.length+'행 인식됨 — 첫 행: '+JSON.stringify(rows[0]).slice(0,140):'';
  };
  $('#pasteGo').onclick=async function(){
    var rows=parse();
    if(!rows.length){ $('#pasteMsg').textContent='붙여넣은 내용이 없습니다'; return; }
    if(!confirm(rows.length+'행을 「'+g.title+'」에 추가할까요?')) return;
    $('#pasteMsg').textContent='저장 중…';
    try{
      for(var i=0;i<rows.length;i+=100) await sbWrite('POST', g.table, rows.slice(i,i+100));
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
      h+='<div class="mc-row"><button class="mv" data-mv="up" data-i="'+i+'">↑</button>'+
        '<button class="mv" data-mv="dn" data-i="'+i+'">↓</button>'+
        '<span class="nm"><b>'+esc(s.label)+'</b></span>'+
        '<label><input type="checkbox" data-hk="'+esc(s.key)+'"'+(hid[s.key]?' checked':'')+'>숨김</label></div>';
      if(s.grp) s.buttons.forEach(function(b){
        var v=b.dataset.v;
        if(v==='adminx') return;   // 관리자 메뉴는 권한으로만 제어
        h+='<div class="mc-row child"><span class="nm">'+esc(b.textContent.trim())+'</span>'+
          '<label><input type="checkbox" data-hk="b:'+esc(v)+'"'+(hid['b:'+v]?' checked':'')+'>숨김</label></div>';
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
  }catch(e){}
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
    return '<div class="todo-card '+cls+'" data-go="'+go+'"><div class="l">'+icon+' '+label+'</div>'+
      '<div class="v">'+val+'</div><div class="s">'+sub+'</div></div>';
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
    '<span class="ql-l">바로가기</span>'+
    fav.map(function(v){return '<button data-go="'+v+'">'+esc(viewLabel(v))+'</button>';}).join('')+
    (rec.length? '<span class="ql-l" style="margin-left:8px">최근</span>'+
      rec.map(function(v){return '<button data-go="'+v+'">'+esc(viewLabel(v))+'</button>';}).join(''):'');
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
    b.innerHTML = '가<b style="font-size:13.5px">A</b>'+(n===1?' 크게':n===2?' 최대':'');
  }
}


/* ===== 제품 가격표 — 판(개정판) 단위 관리 ===== */
export var PR={seg:'saas', ver:{saas:0,onprem:0}, op:'ztna', q:'', tcoP:'nac', tcoD:0.30};
