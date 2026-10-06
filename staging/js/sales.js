/* ===== sales.js — Cloud 사이트 · OI · 견적→OI · 수주→계약 · 사이드바 접기 · 해지 분석 =====
   ES 모듈(㊿+153) — 다른 파일의 이름은 아래 import 로만 씀 · 이 파일의 최상위 var/function 은 전부 export · 즉시 실행 문장은 js/init.js 의 start() 에 */
import { ST } from './state.js';
import { $, doLogout, lline, mk, refreshToken, SB_KEY, SB_URL, won } from './core.js';
import { dIdx, EQB, loadFromDb, onData, renderEqBoard, SB_RAW, sbTry, sbWrite, toast, todayStr } from './shell.js';
import { esc, kpiTable, toggleWidgetPanel } from './dash.js';
import { OI_IND, OI_OWNERS, OI_PARTNERS, OI_PROB, OI_PRODUCTS, OI_TYPE } from './grids.js';
import { CH_DEFS, chOf } from './analysis.js';
import { applyDense, denseKey, openFind, openPaste } from './tools.js';
import { loadInbound } from './inbound.js';
import { a11yTileRole, BLANK_LABEL, clearFilters, closeColFilter, DV, exportXlsx, gridAddRow, navMenu, openColPick, openFilterPanel, renderGrid,
  switchView, xlsxAoa, xlsxBook } from './grid.js';
import { closeOvl, FORM_FN, logChange, msg, openOvl } from './edit.js';


/* ================= Cloud 사이트 생성·수정 (my.genians.co.kr cloudsite / cloudsite-update · Edge Function cloudsite 경유) ================= */
export var CS={wired:false, hist:undefined, creds:undefined, tab:'create'};
export async function csFn(payload){
  var r=await fetch(SB_URL+'/functions/v1/cloudsite',{ method:'POST', headers:{'Content-Type':'application/json', apikey:SB_KEY, Authorization:'Bearer '+(ST.SB_TOKEN||'')}, body:JSON.stringify(payload) });
  var j=null; try{ j=await r.json(); }catch(e){}
  if(!j || !('ok' in j)) throw new Error('HTTP '+r.status+(r.status===404? ' — Edge Function «cloudsite» 가 아직 배포되지 않았습니다':''));
  return j;
}
export function csVal(sel, etc){ var v=$('#'+sel).value; if(v==='__etc') v=($('#'+etc).value||'').trim().toLowerCase(); return v; }
export function csBody(){
  if(CS.tab==='update'){
    return {action:'update', cred_id:$('#csCred').value, sitename:($('#cuName').value||'').trim().toLowerCase(), nodes:String(+$('#cuNodes').value||''), sra:$('#cuSra').value===''? null : +$('#cuSra').value, expiredate:$('#cuExp').value||'', send_mail:$('#cuMail').checked?1:0};
  }
  return {action:'create', cred_id:$('#csCred').value, sitename:($('#csName').value||'').trim().toLowerCase(), product:csVal('csProd','csProdEtc')||'ztna', edition:csVal('csEd','csEdEtc')||'ent', language:$('#csLang').value, branch:$('#csBranch').value||'candidate', numberofdevices:String(+$('#csDev').value||'')};
}
/* 계약의 CSM(영문 사이트명) → 고객사. 같은 CSM 이 여러 계약에 있으면 가장 최근 시작 계약 기준 */
export function csCsmMap(){
  var m={};
  (ST.DATA&&ST.DATA.rows||[]).forEach(function(r){ var k=String(r.csm||'').trim().toLowerCase(); if(!k) return;
    var cur=m[k]; if(!cur || (r.startIdx||0)>(cur.startIdx||0)) m[k]={cust:r.cust, line:r.line, status:r.status||'', startIdx:r.startIdx, qty:r.qty||0, csm:String(r.csm).trim()}; });
  return m;
}
export function csFillSiteList(){
  var dl=$('#dlCsSites'); if(!dl) return; dl.innerHTML='';
  var seen={}, m=csCsmMap();
  Object.keys(m).sort(function(a,b){ return m[a].cust.localeCompare(m[b].cust,'ko'); }).forEach(function(k){ var x=m[k]; seen[k]=1; var o=document.createElement('option'); o.value=x.csm; o.label=x.cust+' · '+lline(x.line)+(x.qty? ' · '+x.qty+'노드':''); dl.appendChild(o); });
  var extra=csPortalSites();
  extra.list.forEach(function(x){ var k=x.sitename.toLowerCase(); if(seen[k]) return; seen[k]=1; var o=document.createElement('option'); o.value=x.sitename; o.label=(x.customer||'포탈 생성')+(x.devices? ' · '+x.devices+'노드':'')+' · 포탈에서 생성'; dl.appendChild(o); });
  csRenderChips(extra);
}
/* 계약에는 없고 이 포탈에서만 만든 사이트 — 목록에서 숨김/복구 가능 */
export function csPortalSites(){
  var m=csCsmMap(), byName={}, hiddenBy={};
  (CS.hist||[]).forEach(function(x){ var k=String(x.sitename||'').toLowerCase(); if(!k || !x.result) return; if(x.hidden) hiddenBy[k]=1;
    if(x.action==='update' && !byName[k]) return; if(!byName[k]) byName[k]={sitename:k, customer:x.customer||'', devices:x.devices, created_at:x.created_at}; });
  var list=[], hidden=[];
  Object.keys(byName).forEach(function(k){ if(m[k]) return; (hiddenBy[k]? hidden : list).push(byName[k]); });
  return {list:list, hidden:hidden};
}
export function csRenderChips(x){
  var box=$('#cuChips'); if(!box) return;
  if(!x.list.length && !x.hidden.length){ box.style.display='none'; box.innerHTML=''; return; }
  box.style.display='';
  var h='<span style="color:var(--muted)">포탈에서 만든 사이트 (계약 없음) — 누르면 사이트명에 입력 · ✕ 는 목록에서 숨김:</span> ';
  h+=x.list.map(function(p){ return '<span class="chip" style="display:inline-flex;align-items:center;gap:6px;margin:3px 4px 0 0;padding-right:4px"><span class="cu-pick" data-s="'+esc(p.sitename)+'" style="cursor:pointer" title="'+esc((p.customer||'')+' · '+String(p.created_at||'').slice(0,10))+'">'+esc(p.sitename)+(p.customer? ' <span style="color:var(--muted)">'+esc(p.customer)+'</span>':'')+'</span>'+(ST.IS_SUPER? '<button class="cu-hide" data-s="'+esc(p.sitename)+'" title="목록에서 숨기기 (이력은 남음)" style="border:0;background:transparent;cursor:pointer;color:var(--muted);font-size:12px;line-height:1;padding:2px 4px">✕</button>':'')+'</span>'; }).join('');
  if(x.hidden.length) h+='<details style="display:inline-block;margin-left:6px"><summary style="cursor:pointer;color:var(--muted)">숨긴 사이트 '+x.hidden.length+'</summary>'+x.hidden.map(function(p){ return '<span class="chip" style="display:inline-flex;align-items:center;gap:6px;margin:3px 4px 0 0;opacity:.7">'+esc(p.sitename)+(ST.IS_SUPER? '<button class="cu-unhide" data-s="'+esc(p.sitename)+'" title="목록에 다시 표시" style="border:0;background:transparent;cursor:pointer;color:var(--s1-ink);font-size:12px;padding:2px 4px">↩ 복구</button>':'')+'</span>'; }).join('')+'</details>';
  box.innerHTML=h;
  box.querySelectorAll('.cu-pick').forEach(function(el){ el.onclick=function(){ $('#cuName').value=el.dataset.s; cuSyncCust(); csPreview(); $('#cuNodes').focus(); }; });
  box.querySelectorAll('.cu-hide').forEach(function(b){ b.onclick=function(){ csHideSite(b.dataset.s, true); }; });
  box.querySelectorAll('.cu-unhide').forEach(function(b){ b.onclick=function(){ csHideSite(b.dataset.s, false); }; });
}
export async function csHideSite(sn, hide){
  if(!ST.SB_TOKEN){ openOvl('ovlAuth'); return; }
  if(hide && !confirm('«'+sn+'» 를 사이트 목록에서 숨길까요?\n요청 이력은 그대로 남고, 자동완성과 이 칩 목록에서만 빠집니다. «숨긴 사이트»에서 복구할 수 있습니다.')) return;
  try{ var j=await csFn({action:'site_hide', sitename:sn, hidden:hide}); if(!j.ok) throw new Error(j.error);
    (CS.hist||[]).forEach(function(x){ if(String(x.sitename).toLowerCase()===sn) x.hidden=hide; });
    logChange('update','cloud_sites',0,{sitename:sn, hidden:hide});
    toast(hide? '목록에서 숨김':'목록에 복구', sn); csHist(); cuSyncCust(); csPreview();
  }catch(e){ toast('실패', String(e.message||e).slice(0,120), 'info'); }
}
/* 수정 탭: 사이트명 → 고객사 자동 표시 (+ 힌트) */
export function cuSyncCust(){
  var k=($('#cuName').value||'').trim().toLowerCase(), m=csCsmMap(), hit=m[k], hint=$('#cuNameHint');
  var h=(CS.hist||[]).filter(function(x){ return x.result && String(x.sitename).toLowerCase()===k; })[0];
  var nodesEl=$('#cuNodes'), canFill=(!nodesEl.value || String(nodesEl.value)===String(CS.autoNodes||''));   // 사용자가 직접 친 값은 건드리지 않음
  function fillNodes(v){ if(canFill && v){ nodesEl.value=v; CS.autoNodes=String(v); } }
  if(hit){ $('#cuCust').value=hit.cust; hint.style.color='var(--muted)'; hint.textContent='계약: '+lline(hit.line)+' · '+(hit.status||'')+(hit.qty? ' · 현재 '+hit.qty+'노드':'')+(hit.startIdx!=null? ' · '+mk(hit.startIdx)+'~':''); fillNodes(hit.qty); }
  else if(h){ $('#cuCust').value=h.customer||''; hint.style.color='var(--muted)'; hint.textContent='이 포탈에서 '+String(h.created_at).slice(0,10)+'에 만든 사이트'+(h.devices? ' · '+h.devices+'노드':''); fillNodes(h.devices); }
  else { $('#cuCust').value=''; if(k){ hint.style.color='var(--warn,#b26a00)'; hint.textContent='계약 CSM·생성 이력에 없는 사이트명 — 철자를 확인하세요 (그래도 실행은 가능)'; } else { hint.style.color='var(--muted)'; hint.textContent=''; } }
}
/* 생성 탭: 사이트명 중복 = 계약 CSM 에 이미 있거나, 이 포탈에서 성공적으로 만든 이력이 있음 */
export function csDupOf(name){
  var k=String(name||'').trim().toLowerCase(); if(!k) return null;
  var hit=csCsmMap()[k]; if(hit) return {kind:'csm', txt:'계약의 CSM 으로 이미 사용 중 — '+hit.cust+' ('+lline(hit.line)+(hit.status? ' · '+hit.status:'')+')'};
  var h=(CS.hist||[]).filter(function(x){ return x.result && x.action!=='update' && String(x.sitename).toLowerCase()===k; })[0];
  if(h) return {kind:'hist', txt:'이 포탈에서 '+String(h.created_at).slice(0,10)+'에 이미 만든 사이트'+(h.customer? ' — '+h.customer:'')};
  return null;
}
export var CS_PROD={ztna:'Cloud ZTNA'}, CS_ED={ent:'Enterprise', bas:'Basic', basic:'Basic', std:'Standard'}, CS_LANG={ko:'한국어',en:'English',ja:'日本語',zh:'中文'}, CS_BR={candidate:'RC(candidate)', release:'R 정식(release)', beta:'베타(beta)', current:'최신 개발(current)'};
export function csPreview(){
  var b=csBody(), ok=/^[a-z0-9][a-z0-9-]{1,62}$/.test(b.sitename||'');
  if(CS.tab==='create') $('#csNameHint').style.color=(!b.sitename||ok)? 'var(--muted)' : 'var(--critical)';
  if(CS.tab==='creds') return b;
  var show=Object.assign({}, b); delete show.action; delete show.cred_id;
  var cred=(CS.creds||[]).filter(function(c){ return String(c.id)===String($('#csCred').value); })[0];
  var box=$('#csSum'), miss=[], html;
  if(!b.sitename) miss.push('사이트명'); else if(!ok) miss.push('사이트명 형식(영문 소문자·숫자·하이픈)');
  if(CS.tab==='update'){
    if(!(+b.nodes)) miss.push('노드 수'); if(!b.expiredate) miss.push('만료일');
    var prevH=(CS.hist||[]).filter(function(x){ return x.result && x.sitename===b.sitename; })[0], csmHit=csCsmMap()[b.sitename];
    html=(($('#cuCust').value||'').trim()? '<b>'+esc($('#cuCust').value.trim())+'</b> 고객사의 ':'')+'<b>'+esc(b.sitename||'(사이트명)')+'</b> 사이트의 라이선스를 <b>'+(b.nodes? Number(b.nodes).toLocaleString('ko-KR')+'노드':'(노드 수)')+'</b>'+(b.sra!=null? ' · SRA <b>'+b.sra+'</b>':'')+', 만료일 <b>'+(b.expiredate||'(만료일)')+'</b>로 바꿉니다'+(b.send_mail? ' — 고객에게 안내 메일을 <b>보냅니다</b>':' — 안내 메일은 보내지 않습니다')+'.'+
         (csmHit? '<div class="mini" style="color:var(--muted);margin-top:4px">계약 CSM 확인됨 — '+esc(csmHit.cust)+' · '+esc(lline(csmHit.line))+(csmHit.qty? ' · 현재 계약 '+csmHit.qty+'노드':'')+'</div>' : '')+
         (prevH? '<div class="mini" style="color:var(--muted);margin-top:4px">이 포탈에서 '+esc(String(prevH.created_at).slice(0,10))+'에 '+esc(prevH.action==='update'?'수정':'생성')+'한 이력 있음'+(prevH.devices? ' · 당시 '+prevH.devices+'노드':'')+(prevH.customer? ' · '+esc(prevH.customer):'')+'</div>' : (b.sitename&&ok&&!csmHit? '<div class="mini" style="color:var(--warn,#b26a00);margin-top:4px">계약 CSM·포탈 이력에 없는 사이트명 — 철자를 한 번 더 확인하세요</div>':''));
  } else {
    if(!(+b.numberofdevices)) miss.push('노드 수');
    var dup=csDupOf(b.sitename);
    if(dup) miss.push('사이트명 중복');
    $('#csNameHint').style.color=dup? 'var(--critical)' : ((!b.sitename||ok)? 'var(--muted)':'var(--critical)');
    $('#csNameHint').textContent=dup? '⚠ 중복: '+dup.txt : '영문 소문자·숫자·하이픈(-) 2~63자 · 계약의 CSM 및 이전 생성 이력과 중복을 확인합니다';
    html=(($('#csCust').value||'').trim()? '<b>'+esc($('#csCust').value.trim())+'</b> 고객사의 ':'')+'<b>'+esc(b.sitename||'(사이트명)')+'</b> 사이트를 <b>'+esc(CS_PROD[b.product]||b.product)+' '+esc(CS_ED[b.edition]||b.edition)+'</b> 에디션, '+esc(CS_LANG[b.language]||b.language)+' 화면, <b>'+esc(CS_BR[b.branch]||b.branch)+'</b> 브랜치, <b>'+(b.numberofdevices? Number(b.numberofdevices).toLocaleString('ko-KR')+'노드':'(노드 수)')+'</b>로 새로 만듭니다.'+
         (dup? '<div class="mini" style="color:var(--critical);margin-top:4px">⚠ '+esc(dup.txt)+' — 기존 사이트라면 «기존 사이트 수정»을, 새 사이트라면 다른 이름을 쓰세요</div>':'');
  }
  html+='<div class="mini" style="margin-top:4px;color:var(--muted)">API 계정: '+(cred? esc(cred.label+' — '+cred.apiemail) : '<span style="color:var(--critical)">선택 필요</span>')+'</div>';
  if(miss.length) html='<div style="color:var(--critical);font-weight:650;margin-bottom:4px">아직 비어 있음: '+miss.join(' · ')+'</div>'+html;
  html+='<details><summary>실제로 보내는 요청 보기 (API 형식)</summary><pre>POST my.genians.co.kr/genians/api/v1/'+(CS.tab==='update'?'cloudsite-update':'cloudsite')+'\n'+esc(JSON.stringify(Object.assign({apikey:'(서버 보관)', apiemail:cred? cred.apiemail : '(계정 선택)'}, show), null, 1))+'</pre></details>';
  box.className='cs-sum'+(miss.length?' bad':''); box.innerHTML=html;
  $('#csGo').disabled=!!miss.length || !cred;
  return b;
}
export function csSetTab(t){
  CS.tab=t;
  $('#csTabs').querySelectorAll('button').forEach(function(b){ b.setAttribute('aria-pressed', b.dataset.t===t? 'true':'false'); });
  $('#csPaneCreate').style.display=t==='create'?'':'none'; $('#csPaneUpdate').style.display=t==='update'?'':'none'; $('#csPaneCreds').style.display=t==='creds'?'':'none';
  $('#csSecRun').style.display=t==='creds'?'none':'';
  $('#csGo').textContent=t==='update'? '✏️ 사이트 수정 실행' : '➕ 사이트 만들기';
  msg('csMsg',''); csPreview();
  if(t==='creds') csRenderCreds();
}
export async function csLoadCreds(force){
  if(CS.creds!==undefined && !force) return CS.creds;
  try{ var j=await csFn({action:'creds'}); CS.creds=j.ok? (j.creds||[]) : []; if(!j.ok) msg('csMsg',j.error||'','bad'); }catch(e){ CS.creds=[]; msg('csMsg',String(e.message||e),'bad'); }
  var sel=$('#csCred'), cur=sel.value; sel.innerHTML='';
  if(!CS.creds.length){ sel.innerHTML='<option value="">등록된 API 계정 없음 — 관리자가 «계정·API Key 관리»에서 추가</option>'; }
  CS.creds.forEach(function(c){ var o=document.createElement('option'); o.value=String(c.id); o.textContent=c.label+' — '+c.apiemail; sel.appendChild(o); });
  if(cur && CS.creds.some(function(c){ return String(c.id)===cur; })) sel.value=cur;
  csPreview(); return CS.creds;
}
export function csRenderCreds(){
  var tb=$('#ccList tbody'), list=CS.creds||[];
  tb.innerHTML=list.length? list.map(function(c){ return '<tr><td><b>'+esc(c.label)+'</b></td><td>'+esc(c.apiemail)+'</td><td class="mini">'+esc(String(c.created_at||'').slice(0,10))+(c.created_by? ' · '+esc(c.created_by):'')+'</td><td>'+(c.id? '<button class="chip cc-del" data-id="'+c.id+'">삭제</button>' : '<span class="mini" style="color:var(--muted)">Secrets 에서 관리</span>')+'</td></tr>'; }).join('')
    : '<tr><td colspan="4" class="mini" style="color:var(--muted)">등록된 계정이 없습니다</td></tr>';
  tb.querySelectorAll('.cc-del').forEach(function(b){ b.onclick=async function(){ var c=list.filter(function(x){ return String(x.id)===b.dataset.id; })[0];
    if(!confirm('«'+c.label+' — '+c.apiemail+'» API 계정을 삭제할까요? 이 계정으로는 더 이상 사이트를 만들 수 없습니다.')) return;
    try{ var j=await csFn({action:'cred_del', id:+b.dataset.id}); if(!j.ok) throw new Error(j.error); toast('API 계정 삭제', c.label); logChange('delete','api_credentials',+b.dataset.id,{label:c.label}); await csLoadCreds(true); csRenderCreds(); }catch(e){ msg('ccMsg',String(e.message||e),'bad'); } }; });
}
export function renderCsite(){
  msg('csMsg',''); msg('ccMsg','');
  $('#csFormWrap').style.display=''; $('#csDone').style.display='none';
  $('#csTabCreds').style.display=ST.IS_SUPER? '':'none';
  csFillSiteList();
  if(!CS.wired){
    CS.wired=true;
    ['csName','csDev','csProd','csProdEtc','csEd','csEdEtc','csLang','csBranch','csCred','cuName','cuNodes','cuSra','cuExp','cuMail'].forEach(function(i){ var e=$('#'+i); e.addEventListener('input',csPreview); e.addEventListener('change',csPreview); });
    $('#csProd').addEventListener('change',function(){ $('#csProdEtc').style.display=this.value==='__etc'?'':'none'; });
    $('#csEd').addEventListener('change',function(){ $('#csEdEtc').style.display=this.value==='__etc'?'':'none'; });
    $('#csTabs').querySelectorAll('button').forEach(function(b){ b.onclick=function(){ csSetTab(b.dataset.t); }; });
    /* 수정 탭: 사이트명(계약 CSM)을 고르면 고객사·계약 정보를 자동 표시 */
    $('#cuName').addEventListener('input',function(){ cuSyncCust(); csPreview(); });
    $('#cuName').addEventListener('change',function(){ cuSyncCust(); csPreview(); });
    $('#csGo').onclick=csSubmit;
    $('#ccAdd').onclick=csAddCred;
    $('#csDoneNew').onclick=function(){ ['csName','csDev','csMemo','csCust','csProdEtc','csEdEtc','cuName','cuNodes','cuSra','cuExp','cuCust','cuMemo'].forEach(function(i){ $('#'+i).value=''; }); $('#cuMail').checked=false; $('#csProd').value='ztna'; $('#csEd').value='ent'; $('#csLang').value='ko'; $('#csBranch').value='candidate'; renderCsite(); };
    $('#csHistRefresh').onclick=function(){ CS.hist=undefined; csHist(); };
    $('#csHistQ').addEventListener('input',function(){ csHist(); });
    $('#csCust').addEventListener('input',csPreview);
  }
  csSetTab(CS.tab||'create'); csLoadCreds(); csHist();
  setTimeout(function(){ var f=CS.tab==='update'? '#cuName' : '#csCust'; if(!$(f).value) $(f).focus(); },50);
}
export async function csHist(){
  var tb=$('#csHist tbody');
  if(CS.hist===undefined){ tb.innerHTML='<tr><td colspan="10" class="mini" style="color:var(--muted)">불러오는 중…</td></tr>';
    try{ CS.hist=await sbTry('cloud_sites?select=*&order=id.desc&limit=300')||[]; }catch(e){ CS.hist=[]; } }
  var q=($('#csHistQ').value||'').trim().toLowerCase();
  var h=CS.hist.filter(function(x){ return !q || String(x.sitename||'').toLowerCase().indexOf(q)>=0 || String(x.customer||'').toLowerCase().indexOf(q)>=0; });
  csFillSiteList();
  $('#csHistCap').textContent=CS.hist.length? (q? h.length+'건 (전체 '+CS.hist.length+')' : h.length+'건')+' · 성공 '+h.filter(function(x){return x.result;}).length : '';
  tb.innerHTML=h.length? h.map(function(x){ var up=x.action==='update', ex=x.extra||{};
      var what=up? ('노드 '+(x.devices||'')+(ex.sra!=null? ' · SRA '+ex.sra:'')+(ex.expiredate? ' · 만료 '+ex.expiredate:'')+(ex.send_mail? ' · 메일':'')) : ((x.product||'')+'/'+(x.edition||'')+(ex.branch? ' · '+(CS_BR[ex.branch]||ex.branch):'')+(x.language&&x.language!=='ko'? ' · '+x.language:'')+' · '+(x.devices||'')+'노드');
      return '<tr'+(x.result?'':' style="color:var(--muted)"')+'><td style="white-space:nowrap">'+esc(String(x.created_at||'').replace('T',' ').slice(0,16))+'</td><td>'+(up? '<span class="badge b-re">수정</span>':'<span class="badge b-new">생성</span>')+'</td><td><b>'+esc(x.sitename)+'</b>'+(x.hidden? ' <span class="mini" style="color:var(--muted)" title="사이트 목록에서 숨김">(숨김)</span>':'')+'</td><td>'+esc(x.customer||'')+'</td><td class="mini">'+esc(what)+'</td><td>'+(x.result? '<span class="badge b-new">성공</span>':'<span class="badge b-churn">실패</span>')+'</td><td class="mini">'+esc(x.message||'')+'</td><td class="mini">'+esc(x.requested_by||'')+'</td><td class="mini">'+esc(x.cred_label||'')+'</td><td class="mini">'+esc(x.memo||'')+'</td></tr>'; }).join('')
    : '<tr><td colspan="10" class="mini" style="color:var(--muted)">'+(q? '검색 결과 없음' : '아직 이력이 없습니다 — 66_cloud_sites.sql 이 아직 실행되지 않았다면 표가 없어 비어 보입니다.')+'</td></tr>';
  try{ if(CS.tab!=='creds') csPreview(); }catch(e){}
}
export async function csAddCred(){
  if(!ST.SB_TOKEN){ openOvl('ovlAuth'); return; }
  var label=($('#ccLabel').value||'').trim(), email=($('#ccEmail').value||'').trim(), key=($('#ccKey').value||'').trim();
  if(!label||!email||!key){ msg('ccMsg','라벨·이메일·API 키를 모두 입력하세요.','bad'); return; }
  var btn=$('#ccAdd'); btn.disabled=true; msg('ccMsg','저장 중…');
  try{ var j=await csFn({action:'cred_add', label:label, apiemail:email, apikey:key}); if(!j.ok) throw new Error(j.error);
    $('#ccLabel').value=''; $('#ccEmail').value=''; $('#ccKey').value='';
    toast('API 계정 추가', label+' — '+email); logChange('insert','api_credentials',(j.cred&&j.cred.id)||0,{label:label, apiemail:email});
    msg('ccMsg','추가되었습니다 ✅ (키는 서버에만 저장되어 다시 표시되지 않습니다)','ok');
    await csLoadCreds(true); csRenderCreds();
  }catch(e){ msg('ccMsg',String(e.message||e),'bad'); }
  btn.disabled=false;
}
export async function csSubmit(){
  if(!ST.SB_TOKEN){ openOvl('ovlAuth'); return; }
  var b=csPreview(), up=(CS.tab==='update');
  var cust=(up? $('#cuCust').value : $('#csCust').value||'').trim(), memo=(up? $('#cuMemo').value : $('#csMemo').value||'').trim();
  if(!$('#csCred').value){ msg('csMsg','API 계정을 선택하세요 (없으면 관리자가 «계정·API Key 관리»에서 추가).','bad'); return; }
  if(!/^[a-z0-9][a-z0-9-]{1,62}$/.test(b.sitename)){ msg('csMsg','사이트명은 영문 소문자·숫자·하이픈 2~63자여야 합니다.','bad'); $(up?'#cuName':'#csName').focus(); return; }
  var q;
  if(up){
    if(!(+b.nodes)){ msg('csMsg','노드 수를 입력하세요.','bad'); $('#cuNodes').focus(); return; }
    if(!b.expiredate){ msg('csMsg','만료일을 입력하세요.','bad'); $('#cuExp').focus(); return; }
    /* 포탈이 아는 이 사이트의 마지막 «성공» 기록과 값이 전부 같으면 — API 가 «변경 없음» 을 실패로 돌려주고
       이력에 실패로 남는 일을 막기 위해 먼저 알려드립니다 (포탈 밖에서 바꾼 값은 모를 수 있어 강행은 가능) */
    var last=(CS.hist||[]).filter(function(x){ return x.result && String(x.sitename||'').toLowerCase()===b.sitename; })[0];
    if(last){
      var ex=last.extra||{}, lastNodes=String(last.devices||''), lastExp=String(ex.expiredate||''), lastSra=(ex.sra==null? null : +ex.sra);
      var same=(lastNodes===String(b.nodes)) && (!lastExp || lastExp===String(b.expiredate)) && (last.action!=='update' || lastSra===b.sra);
      if(same){
        if(!confirm('바뀐 내용이 없습니다.\n\n포탈에 기록된 마지막 값과 노드 수'+(lastExp? '·만료일':'')+(last.action==='update'? '·SRA':'')+' 이 모두 같습니다 ('+String(last.created_at||'').slice(0,10)+' 기준).\n'+
          '같은 값으로 보내면 my.genians 쪽에서 «변경 없음» 으로 거절해 이력에 실패로 남을 수 있습니다.\n\n'+
          '포탈 밖(관리자 콘솔 등)에서 값이 바뀐 게 확실할 때만 [확인] 을 누르세요.')){ msg('csMsg','보내지 않았습니다 — 값을 바꾼 뒤 다시 실행하세요.'); return; }
      }
    }
    q='사이트 정보를 수정합니다.\n\n사이트명: '+b.sitename+'\n노드 수: '+b.nodes+(b.sra!=null? '\nSRA: '+b.sra:'')+'\n만료일: '+b.expiredate+'\n안내 메일: '+(b.send_mail?'발송':'안 함')+'\n\n실제 사이트 라이선스가 바뀝니다. 진행할까요?';
  } else {
    var dv=+b.numberofdevices; if(!dv||dv<1){ msg('csMsg','노드 수를 입력하세요.','bad'); $('#csDev').focus(); return; }
    var dup=csDupOf(b.sitename); if(dup){ msg('csMsg','사이트명이 중복됩니다 — '+dup.txt,'bad'); $('#csName').focus(); return; }
    q='Cloud 사이트를 만듭니다.\n\n사이트명: '+b.sitename+'\n제품/에디션: '+b.product+' / '+b.edition+'\n브랜치: '+(CS_BR[b.branch]||b.branch)+'\n언어: '+b.language+'\n노드: '+dv+(cust? '\n고객사: '+cust:'')+'\n\n실제 사이트가 생성되며 되돌릴 수 없습니다. 진행할까요?';
  }
  if(!confirm(q)) return;
  var btn=$('#csGo'); btn.disabled=true; msg('csMsg','my.genians.co.kr 에 요청 중…');
  try{
    var j=await csFn(Object.assign({customer:cust, memo:memo}, b));
    CS.hist=undefined;
    $('#csFormWrap').style.display='none'; $('#csDone').style.display='';
    var sum=up? (b.sitename+' · 노드 '+b.nodes+' · 만료 '+b.expiredate) : (b.sitename+' · '+b.product+'/'+b.edition+' · '+(CS_BR[b.branch]||b.branch)+' · '+b.numberofdevices+'노드');
    if(j.ok){
      $('#csDoneIcon').style.background='rgba(12,163,12,.12)'; $('#csDoneIcon').style.color='var(--good,#0ca30c)'; $('#csDoneIcon').textContent='✓';
      $('#csDoneTitle').textContent=up? '사이트 정보가 수정되었습니다' : '사이트가 만들어졌습니다'; $('#csDoneSum').textContent=sum+' · '+(j.message||'');
      toast(up? 'Cloud 사이트 수정':'Cloud 사이트 생성', b.sitename+' — '+(j.message||'완료'));
      try{ logChange('insert','cloud_sites',0,{action:b.action, sitename:b.sitename, customer:cust}); }catch(e){}
    } else {
      $('#csDoneIcon').style.background='rgba(208,59,59,.12)'; $('#csDoneIcon').style.color='var(--critical)'; $('#csDoneIcon').textContent='!';
      var er=String(j.error||'알 수 없는 오류');
      var noChg=up && /같|동일|변경\s*없|no\s*change|nothing|unchanged|already|same/i.test(er);
      $('#csDoneTitle').textContent=up? (noChg? '바뀐 내용이 없어 수정되지 않았습니다' : '수정하지 못했습니다') : '사이트를 만들지 못했습니다';
      $('#csDoneSum').textContent=sum+' — '+er+' (이력에 실패로 기록됨'+(noChg? ' · 사이트 자체는 그대로 정상입니다':'')+')';
    }
    csHist();
  }catch(e){ msg('csMsg',String(e.message||e),'bad'); }
  btn.disabled=false;
}

/* ================= OI (영업기회) ================= */
export function oiProbLabel(p){
  var hit=OI_PROB.filter(function(x){ return x[0]===Number(p); })[0];
  return hit? hit[0]+'% — '+hit[1] : (p||0)+'%';
}
export function initOiForm(){
  // 수주 가능성
  var sel=$('#oiProb');
  if(!sel.options.length){
    sel.innerHTML=OI_PROB.map(function(x){
      return '<option value="'+x[0]+'">'+x[0]+'% ('+esc(x[1])+')</option>'; }).join('');
  }
  // 사업형태 · 산업군
  var ty=$('#oiType');
  if(!ty.options.length) ty.innerHTML=OI_TYPE.map(function(n){ return '<option>'+esc(n)+'</option>'; }).join('');
  var ind=$('#oiInd');
  if(!ind.options.length) ind.innerHTML=OI_IND.map(function(n){
    return '<option'+(n==='기업'?' selected':'')+'>'+esc(n)+'</option>'; }).join('');
  // 지니언스 담당자 · 구축 파트너
  var ow=$('#oiOwner');
  if(!ow.options.length){
    ow.innerHTML='<option value="">— 선택 —</option>'+
      OI_OWNERS.map(function(n){ return '<option>'+esc(n)+'</option>'; }).join('');
  }
  var pt=$('#oiPartner');
  if(!pt.options.length){
    pt.innerHTML='<option value="">— 선택 —</option>'+
      OI_PARTNERS.map(function(n){ return '<option>'+esc(n)+'</option>'; }).join('');
  }
  // 제품군 + 수량
  var pb=$('#oiProducts');
  if(!pb.children.length){
    var h=OI_PRODUCTS.map(function(name){
      return '<div class="oi-prow">'+
        '<label class="mpchk" style="min-width:190px"><input type="checkbox" data-oip="'+esc(name)+'"> '+esc(name)+'</label>'+
        '<input class="oi-qty" type="number" min="1" placeholder="수량" disabled></div>';
    }).join('');
    h+='<div class="oi-prow">'+
       '<label class="mpchk" style="min-width:190px"><input type="checkbox" data-oip="__etc"> 직접 입력</label>'+
       '<input class="oi-etc" placeholder="제품명" disabled style="flex:1;max-width:220px">'+
       '<input class="oi-qty" type="number" min="1" placeholder="수량" disabled></div>';
    h+='<div style="margin-top:8px"><button class="pill ghost" type="button" id="oiEtcAdd" '+
       'style="height:28px;padding:0 12px;font-size:12px">＋ 직접 입력 항목 추가</button></div>';
    pb.innerHTML=h;
    var addBtn=pb.querySelector('#oiEtcAdd');
    if(addBtn) addBtn.onclick=function(){ var r=oiAddEtcRow(); if(r){
      var c=r.querySelector('input[data-oip]'); c.checked=true; c.onchange(); r.querySelector('.oi-etc').focus(); } };
    pb.querySelectorAll('input[data-oip]').forEach(function(cb){
      cb.onchange=function(){
        var row=this.closest('.oi-prow');
        row.querySelectorAll('.oi-qty,.oi-etc').forEach(function(i){
          i.disabled=!cb.checked; if(!cb.checked) i.value='';
        });
        if(cb.checked){ var f=row.querySelector('.oi-etc')||row.querySelector('.oi-qty'); if(f) f.focus(); }
      };
    });
  }
}

/* ===== 견적서 → OI 자동 채움 ===================================
   견적서는 견적 시스템(Worker→GitHub)에 JSON으로 저장됩니다.
   Worker v2(2026-10-04 · cloudflare/quote-worker/worker.js)부터 팀 공용 비밀번호 대신 **포탈 로그인 토큰**(Authorization: Bearer)으로 인증 —
   Worker 가 Supabase 로 토큰·역할·메뉴 권한(quote)을 확인합니다. 예전 localStorage 의 비밀번호는 읽을 때 지웁니다. */
export var QCFG_KEY='genians_quote_worker_config_v1';
export var QCFG_DEF='https://aged-union-cdd3.choihw.workers.dev';
/* 견적서 서비스명 → 포탈 OI 제품군 */
export var QPROD_MAP={
  'GIES (MDR Service)':'MDR',
  'GIEA (AV Service)':'AV (안티바이러스)',
  'GIER (Ransomware Service)':'AR (안티랜섬웨어)',
  'DocuRay DRM':'DRM',
  'DocuRay DLP':'DLP',
  'Cloud NAC V6.0':'Cloud NAC',
  'Cloud NAC V5.0':'Cloud NAC'
};
export var QMGR_MAP={'kholong':'송기영 부장','choihw':'최형우 차장'};
export var OI_QUOTE=null;   // {file, date, total}

export function qCfg(){
  var o={};
  try{ o=JSON.parse(localStorage.getItem(QCFG_KEY)||'{}')||{}; }catch(e){}
  if(o && o.accessPassword!==undefined){ try{ delete o.accessPassword; localStorage.setItem(QCFG_KEY, JSON.stringify(o)); }catch(e){} }   // 옛 팀 공용 비밀번호(평문) 정리
  return { base:String(o.baseUrl||QCFG_DEF).replace(/\/+$/,'') };
}
/* 견적 Worker 호출 — 포탈 로그인 토큰을 Bearer 로 · 401 이면 토큰을 한 번 갱신하고 다시 시도 */
export async function qFetch(path, opts){
  opts=opts||{}; var cfg=qCfg();
  if(!ST.SB_TOKEN) throw new Error('포탈 로그인이 필요합니다');
  var go=function(){ return fetch(cfg.base+path, Object.assign({}, opts, {headers:Object.assign({}, opts.headers||{}, {Authorization:'Bearer '+ST.SB_TOKEN})})); };
  var res=await go();
  if(res.status===401 && await refreshToken()) res=await go();
  return res;
}
export function qNum(v){ return +String(v==null?'':v).replace(/[^0-9.-]/g,'')||0; }
/* 파일명 20260826_고객사_1756000000000.json → 보기 좋게 */
export function qLabel(name){
  var m=/^(\d{4})(\d{2})(\d{2})_(.+)_\d+\.json$/i.exec(name||'');
  if(!m) return {d:'', c:(name||'').replace(/\.json$/i,'')};
  return { d:m[1]+'-'+m[2]+'-'+m[3], c:m[4] };
}

export var QP_TARGET=null;   // null = OI 등록 폼 채우기 · {row:r} = 기존 OI 에 연결
export function openQuotePick(target){
  QP_TARGET=(target&&target.row)? target : null;
  msg('qpMsg', QP_TARGET? ('「'+(QP_TARGET.row.customer||'')+'」 OI에 연결할 견적서를 고르세요') : '');
  var ul=$('#qpUnlink');
  ul.style.display=(QP_TARGET && QP_TARGET.row.quote_file)? '':'none';
  ul.onclick=function(){
    var r=QP_TARGET.row;
    if(!confirm(r.customer+' OI의 견적서 연결을 해제할까요?\n(견적서 파일 자체는 지워지지 않습니다)')) return;
    sbWrite('PATCH','oi_deals?id=eq.'+r.id,{quote_file:null,quote_date:null,quote_total:null,updated_at:new Date().toISOString()})
      .then(function(){
        r.quote_file=null; r.quote_date=null; r.quote_total=null;
        logChange('update','oi_deals',r.id,{quote:'연결 해제'});
        toast('견적서 연결 해제', r.customer,'info');
        closeOvl('ovlQuote'); renderGrid();
      }).catch(function(e){ msg('qpMsg',String(e.message||e),'bad'); });
  };
  $('#qpList').innerHTML='';
  openOvl('ovlQuote');
  qpLoadList();
}
/* OI 현황 행 → 견적서 연결/변경 */
export function oiLinkQuote(r){
  if(!ST.SB_TOKEN){ openOvl('ovlAuth'); return; }
  openQuotePick({row:r});
}
export async function qpLoadList(){
  $('#qpList').innerHTML='<div class="cap" style="padding:16px;text-align:center">불러오는 중…</div>';
  try{
    var res=await qFetch('/list');
    if(!res.ok){ var e=await res.json().catch(function(){return {};});
      throw new Error(e.error||('HTTP '+res.status)); }
    var out=await res.json();
    var files=(out.files||[]).filter(function(f){ return /\.json$/i.test(f.name||''); });
    files.sort(function(a,b){ return String(b.name).localeCompare(String(a.name)); });
    if(!files.length){ $('#qpList').innerHTML='<div class="cap" style="padding:16px;text-align:center">저장된 견적서가 없습니다.</div>'; return; }
    $('#qpList').innerHTML=files.slice(0,80).map(function(f){
      var L=qLabel(f.name);
      return '<div class="qp-row" data-path="'+esc(f.path||f.name)+'" data-name="'+esc(f.name)+'">'+
        '<div style="min-width:0"><div style="font-weight:650;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(L.c)+'</div>'+
        '<div class="cap" style="font-size:11px">'+esc(L.d||'')+'</div></div>'+
        '<button class="pill ghost" type="button" style="height:28px;padding:0 12px;font-size:12px;flex:0 0 auto">불러오기</button></div>';
    }).join('');
    $('#qpList').querySelectorAll('.qp-row').forEach(function(r){
      r.onclick=function(){ qpPick(r.dataset.path, r.dataset.name); };
    });
    if(files.length>80) msg('qpMsg','최근 80건만 표시했습니다');
  }catch(err){
    $('#qpList').innerHTML='<div class="cap" style="padding:16px;text-align:center;color:var(--critical)">목록 조회 실패: '+esc(String(err.message||err))+'</div>';
  }
}
export async function qpPick(path, name){
  msg('qpMsg','견적서를 읽는 중…');
  try{
    var res=await qFetch('/load?path='+encodeURIComponent(path));
    if(!res.ok){ var e0=await res.json().catch(function(){ return {}; }); throw new Error(e0.error||('HTTP '+res.status)); }
    var data=JSON.parse(await res.text());
    if(QP_TARGET && QP_TARGET.row){
      // 기존 OI 에 연결만 — 폼은 건드리지 않음
      var r=QP_TARGET.row;
      var body={ quote_file:path, quote_date:data.quoteDate||null,
                 quote_total:qNum(data.grandTotal)||null, updated_at:new Date().toISOString() };
      await sbWrite('PATCH','oi_deals?id=eq.'+r.id, body);
      r.quote_file=path; r.quote_date=body.quote_date; r.quote_total=body.quote_total;
      logChange('update','oi_deals',r.id,{quote:path});
      closeOvl('ovlQuote');
      toast('견적서 연결됨', r.customer+' ← '+(data.customerName||name));
      renderGrid();
      return;
    }
    oiApplyQuote(data, path, name);
    closeOvl('ovlQuote');
    toast('견적서 불러옴', (data.customerName||name));
  }catch(err){ msg('qpMsg','불러오기 실패: '+String(err.message||err),'bad'); }
}

/* 직접 입력 제품 행 하나 추가 */
export function oiAddEtcRow(prodName, qty){
  var pb=$('#oiProducts'); if(!pb) return null;
  var row=document.createElement('div');
  row.className='oi-prow'; row.dataset.extra='1';
  row.innerHTML='<label class="mpchk" style="min-width:190px"><input type="checkbox" data-oip="__etc"> 직접 입력</label>'+
    '<input class="oi-etc" placeholder="제품명" disabled style="flex:1;max-width:220px">'+
    '<input class="oi-qty" type="number" min="1" placeholder="수량" disabled>'+
    '<button class="pill ghost" type="button" style="height:26px;padding:0 9px;font-size:11px" title="행 삭제">✕</button>';
  var cb=row.querySelector('input[data-oip]');
  cb.onchange=function(){
    row.querySelectorAll('.oi-qty,.oi-etc').forEach(function(i){ i.disabled=!cb.checked; if(!cb.checked) i.value=''; });
  };
  row.querySelector('button').onclick=function(){ row.remove(); };
  var addWrap=pb.querySelector('#oiEtcAdd');
  if(addWrap) pb.insertBefore(row, addWrap.parentNode); else pb.appendChild(row);
  if(prodName){
    cb.checked=true; cb.onchange();
    row.querySelector('.oi-etc').value=prodName;
    if(qty) row.querySelector('.oi-qty').value=qty;
  }
  return row;
}

/* 견적서 JSON → OI 폼 */
export function oiApplyQuote(data, path, name){
  initOiForm();
  // 고객사 · 견적일 · 담당자
  if(data.customerName) $('#oiCust').value=data.customerName;
  if(data.contactPerson) $('#oiCName').value=data.contactPerson;
  var mgr='';
  Object.keys(QMGR_MAP).forEach(function(k){ if(String(data.manager||'').indexOf(k)>=0) mgr=QMGR_MAP[k]; });
  if(mgr) $('#oiOwner').value=mgr;

  // 금액 — OI 예상단가는 VAT 별도
  var supply=qNum(data.supplyTotal);
  if(!supply) supply=Math.round(qNum(data.grandTotal)/1.1);
  if(supply) $('#oiAmt').value=supply;

  // 제품군 · 수량
  var rows=data.rows||[], hasPublic=false, etcs=[];
  $('#oiProducts').querySelectorAll('.oi-prow').forEach(function(r){
    if(r.dataset.extra){ r.remove(); return; }
    var cb=r.querySelector('input[data-oip]');
    if(cb){ cb.checked=false; }
    r.querySelectorAll('.oi-qty,.oi-etc').forEach(function(i){ i.value=''; i.disabled=true; });
  });
  rows.forEach(function(r){
    var raw=(r.prod==='direct')? String(r.prodCustom||'').trim() : String(r.prod||'').trim();
    if(!raw) return;
    if(/\(공공\)/.test(raw)) hasPublic=true;
    var mapped=QPROD_MAP[raw]||raw;
    var qty=qNum(r.qty)||null;
    var hit=$('#oiProducts').querySelector('input[data-oip="'+mapped.replace(/"/g,'\\"')+'"]');
    if(hit){
      var row=hit.closest('.oi-prow');
      if(!hit.checked){ hit.checked=true; hit.onchange(); }
      var q=row.querySelector('.oi-qty');
      if(qty) q.value = q.value? (qNum(q.value)+qty) : qty;   // 같은 제품 여러 줄이면 수량 합산
    }else{
      etcs.push({name:raw, qty:qty});
    }
  });
  etcs.forEach(function(e){ oiAddEtcRow(e.name, e.qty); });
  if(hasPublic) $('#oiInd').value='공공';

  // 수주가능성 — 견적 제출 = 10% (신규일 때만, 이미 올려둔 값은 건드리지 않음)
  if(!+$('#oiProb').value) $('#oiProb').value='10';

  // 비고
  if(!$('#oiNote').value.trim()){
    $('#oiNote').value='견적서 자동 입력'+(data.quoteDate? ' · 견적일 '+data.quoteDate:'')+
      (qNum(data.grandTotal)? ' · 총액 '+won(qNum(data.grandTotal))+'천원(VAT 포함)':'');
  }

  OI_QUOTE={ file:path, date:data.quoteDate||null, total:qNum(data.grandTotal)||null };
  var L=qLabel(name||path);
  $('#oiQuoteTag').innerHTML='📎 연결된 견적서: <b>'+esc(L.c)+'</b>'+(L.d? ' ('+esc(L.d)+')':'')+
    ' · <a href="quote.html?view='+encodeURIComponent(path)+'" target="_blank" style="color:var(--s1-ink)">원본 보기</a>'+
    ' · <a href="#" id="oiQuoteClr" style="color:var(--critical)">연결 해제</a>';
  var clr=$('#oiQuoteClr');
  if(clr) clr.onclick=function(ev){ ev.preventDefault(); oiClearQuote(); };
}
export function oiClearQuote(){
  OI_QUOTE=null;
  $('#oiQuoteTag').textContent='저장된 견적서를 고르면 고객사·제품·수량·금액이 자동으로 채워집니다.';
}

export async function submitOi(){
  var cust=$('#oiCust').value.trim(), name=$('#oiName').value.trim(), owner=$('#oiOwner').value;
  if(!cust){ msg('oiMsg','고객사는 필수입니다','bad'); return; }
  if(!name) name=cust+' '+$('#oiType').value;            // 사업명이 없으면 자동 생성
  var btn=$('#oiGo'); btn.disabled=true; msg('oiMsg','등록 중…');
  try{
    var prods=[], items=[];
    $('#oiProducts').querySelectorAll('.oi-prow').forEach(function(row){
      var cb=row.querySelector('input[data-oip]');
      if(!cb || !cb.checked) return;
      var etc=row.querySelector('.oi-etc');
      var name=(cb.dataset.oip==='__etc')? (etc&&etc.value.trim()) : cb.dataset.oip;
      if(!name) return;
      var q=row.querySelector('.oi-qty');
      prods.push(name);
      items.push({product:name, qty:+(q&&q.value)||null});
    });
    var row={
      requester: ST.AUTH_USER||null,
      industry: $('#oiInd').value,
      customer: cust,
      cust_dept: $('#oiCDept').value.trim()||null,
      cust_name: $('#oiCName').value.trim()||null,
      cust_email: $('#oiCEmail').value.trim()||null,
      cust_phone: $('#oiCPhone').value.trim()||null,
      owner: owner||null,
      deal_type: $('#oiType').value,
      deal_name: name,
      sales_route: $('#oiRoute').value.trim()||null,
      partner: $('#oiPartner').value.trim()||null,
      free_months: $('#oiFree').value===''? null : +$('#oiFree').value,
      expect_month: $('#oiMonth').value? $('#oiMonth').value+'-01' : null,
      expect_amount: $('#oiAmt').value===''? null : +$('#oiAmt').value,
      rival_price: $('#oiRival').value===''? null : +$('#oiRival').value,
      strategy: $('#oiStrategy').value.trim()||null,
      products: prods,
      items: items,
      stage: '등록',
      win_prob: +$('#oiProb').value||0,
      next_action: $('#oiNext').value.trim()||null,
      next_date: $('#oiNextDate').value||null,
      note: $('#oiNote').value.trim()||null,
      quote_file:  OI_QUOTE? OI_QUOTE.file  : null,
      quote_date:  OI_QUOTE? OI_QUOTE.date  : null,
      quote_total: OI_QUOTE? OI_QUOTE.total : null
    };
    var out=await sbWrite('POST','oi_deals?select=*',[row],'return=representation');
    ST.RAWX.oi=ST.RAWX.oi||[]; ST.RAWX.oi.unshift(out[0]);
    logChange('insert','oi_deals',out[0].id,{customer:cust,deal:name});
    msg('oiMsg','');
    $('#oiDoneSum').textContent=[cust, name, row.deal_type,
      row.expect_amount? won(row.expect_amount)+'천원':'',
      items.map(function(x){ return x.product+(x.qty? ' '+x.qty:''); }).join(', ')].filter(Boolean).join(' · ');
    $('#oiFormWrap').style.display='none';
    $('#oiDone').style.display='';
    toast('OI 등록 완료', cust+' · '+name);
    ['oiCust','oiCDept','oiCName','oiCEmail','oiCPhone','oiName','oiRoute','oiFree','oiMonth',
     'oiAmt','oiRival','oiStrategy','oiNext','oiNextDate','oiNote'].forEach(function(i){ $('#'+i).value=''; });
    $('#oiPartner').value='';
    $('#oiProducts').querySelectorAll('.oi-prow').forEach(function(row){
      if(row.dataset.extra){ row.remove(); return; }
      var c=row.querySelector('input[data-oip]'); if(c) c.checked=false;
      row.querySelectorAll('.oi-qty,.oi-etc').forEach(function(i){ i.value=''; i.disabled=true; });
    });
    $('#oiProb').value='0';
    oiClearQuote();
  }catch(e){ msg('oiMsg',String(e.message||e),'bad'); }
  btn.disabled=false;
}
/* ===== OI 수주 건 → 신규 계약 전환 =====
   입력·수정 모달(신규 탭)을 OI 값으로 채워서 열고,
   저장이 끝나면 그 OI 에 contract_id 를 기록합니다. */
export var OIP2LINE={'Cloud NAC':'Cloud','S1 Cloud NAC':'S1','MDR':'MDR','S1 MDR':'MDR_S1',
  'MDR Add-on':'MDR','AV (안티바이러스)':'MDR','AR (안티랜섬웨어)':'MDR',
  'PNS':'PNS','DRM':'DRM','DLP':'DLP'};
export function oiToContract(r){
  if(!ST.SB_TOKEN){ openOvl('ovlAuth'); return; }
  if(!confirm(r.customer+' · '+(r.deal_name||'')+'\n이 수주 건을 신규 계약으로 전환할까요?\n\n'+
    '계약 입력창이 OI 내용으로 채워져 열립니다. 금액(MRR)·기간을 확인하고 저장하세요.')) return;
  $('#btnEdit').click();                              // 열면서 폼이 초기화됨
  $('#eTabs').querySelector('button[data-t="new"]').click();
  ST.OI_CONVERT=r;                                       // 초기화 이후에 지정
  $('#nCust').value=r.customer||'';
  if(r.industry) $('#nInd').value=(['기업','공공','금융','의료'].indexOf(r.industry)>=0)? r.industry:'기업';
  // 제품군 첫 항목 → 서비스
  var line=null;
  (r.products||[]).some(function(pn){ if(OIP2LINE[pn]){ line=OIP2LINE[pn]; return true; } return false; });
  if(line){ var nl=$('#nLine'); nl.value=line; nl.dispatchEvent(new Event('change')); }
  // 파트너 매핑 (목록에 없으면 직접 입력으로)
  var ptn=String(r.partner||'').trim();
  if(ptn){
    if(/지니언스/.test(ptn)) $('#nPtn').value='지니언스(직접)';
    else if(['다원티에스','글로웰시스템'].indexOf(ptn)>=0) $('#nPtn').value=ptn;
    else{ $('#nPtn').value='__etc'; $('#nPtn').dispatchEvent(new Event('change')); $('#nPtnEtc').value=ptn; }
  }
  // 시작월 = 계약 예상 시기
  if(r.expect_month) $('#nStart').value=String(r.expect_month).slice(0,7);
  if(FORM_FN.nLivePreview) try{ FORM_FN.nLivePreview(); }catch(e){}
  // 수량 = 제품 수량 합
  try{
    var q=(r.items||[]).reduce(function(a,x){ return a+(+x.qty||0); },0);
    if(q) $('#nQty').value=q;
  }catch(e){}
  $('#nNote').value='OI 전환 · '+(r.deal_name||'')+
    (r.expect_amount? ' · 예상단가 '+won(r.expect_amount)+'천원(VAT별도)':'');
  msg('eMsg','OI 「'+(r.deal_name||r.customer)+'」 전환 중 — MRR·종료월을 채우고 저장하세요','ok');
}

/* OI 현황 위 요약 타일 */
export function renderOiTiles(on){
  var host=document.getElementById('oiTiles');
  if(!on){ if(host) host.style.display='none'; return; }
  if(!host){
    host=document.createElement('div'); host.id='oiTiles'; host.className='kpis';
    var t=document.getElementById('dvTitle');
    var card=t? t.closest('.card') : null;
    var bar=document.querySelector('#viewData .dbar');
    if(bar && bar.parentElement) bar.parentElement.insertBefore(host, bar);
  }
  host.style.display='';
  var rows=(ST.RAWX.oi||[]);
  var open=rows.filter(function(r){ return ['등록','진행'].indexOf(r.stage)>=0; });
  var sum=function(a){ return a.reduce(function(s,r){ return s+(Number(r.expect_amount)||0); },0); };
  var wsum=open.reduce(function(s,r){ return s+(Number(r.expect_amount)||0)*(Number(r.win_prob)||0)/100; },0);
  var now=new Date(), q=Math.floor(now.getMonth()/3), qs=new Date(now.getFullYear(), q*3, 1), qe=new Date(now.getFullYear(), q*3+3, 1);
  var thisQ=rows.filter(function(r){
    if(!r.expect_month) return false;
    var d=new Date(String(r.expect_month).slice(0,10));
    return d>=qs && d<qe && ['수주','계산서발행','종료','실패','중지'].indexOf(r.stage)<0;
  });
  var won2=rows.filter(function(r){ return ['수주','계산서발행','종료'].indexOf(r.stage)>=0; });
  var late=open.filter(function(r){ return r.next_date && String(r.next_date).slice(0,10) < todayStr(); });
  host.innerHTML=
    '<div class="kpi" data-kx="oi_open"><div class="k">진행 중</div><div class="v">'+open.length+'<small>건</small></div>'+
      '<div class="d">예상 '+won(sum(open))+'천원</div></div>'+
    '<div class="kpi" data-kx="oi_w"><div class="k">기대 수주액</div><div class="v">'+won(Math.round(wsum))+'<small>천원</small></div>'+
      '<div class="d">예상금액 × 수주가능성% 합계</div></div>'+
    '<div class="kpi" data-kx="oi_q"><div class="k">이번 분기 계약예상</div><div class="v">'+thisQ.length+'<small>건</small></div>'+
      '<div class="d">'+won(sum(thisQ))+'천원</div></div>'+
    '<div class="kpi" data-kx="oi_won"><div class="k">수주 확정</div><div class="v">'+won2.length+'<small>건</small></div>'+
      '<div class="d">'+won(sum(won2))+'천원</div></div>'+
    (late.length? '<div class="kpi" data-kx="oi_late" style="border-color:var(--critical,#d03b3b)"><div class="k">⏰ 액션 지연</div>'+
      '<div class="v" style="color:var(--critical,#d03b3b)">'+late.length+'<small>건</small></div>'+
      '<div class="d">'+esc(late.slice(0,2).map(function(r){return r.customer;}).join(', '))+'</div></div>' : '');
  kxWire(host, {
    oi_open:function(){ kxOi(open, '진행 중 OI '+open.length+'건', '단계 등록·진행'); },
    oi_w:function(){ kxOi(open, '기대 수주액 — 진행 중 OI '+open.length+'건', '기대액 = 예상금액 × 수주가능성% · 합계 '+won(Math.round(wsum))+'천원'); },
    oi_q:function(){ kxOi(thisQ, '이번 분기 계약예상 '+thisQ.length+'건', '계약예상시기가 '+qs.getFullYear()+'년 '+(q+1)+'분기이고 아직 수주·종료·실패·중지가 아닌 건'); },
    oi_won:function(){ kxOi(won2, '수주 확정 '+won2.length+'건', '단계 수주·계산서발행·종료'); },
    oi_late:function(){ kxOi(late, '액션 지연 '+late.length+'건', '진행 중인데 다음 일정(next_date)이 오늘보다 지난 건'); }
  });
}

export function closeDrawer(){ $('#side').classList.remove('open'); $('#sideDim').classList.remove('on'); }
/* ===== 사이드바 그룹 접기 =====
   · 처음엔 모두 접힌 채로 시작, 그룹 제목을 누르면 펼침/접힘
   · 펼침 상태는 계정별로 저장 → 다음 접속에도 그대로
   · 현재 보고 있는 화면의 그룹은 자동으로 펼쳐집니다               */
export function menuKey(){ return 'svc_menu_'+(ST.AUTH_USER||'anon'); }
export function menuOpenSet(){
  try{ return JSON.parse(localStorage.getItem(menuKey())||'null')||{}; }catch(e){ return {}; }
}
export function menuSave(o){ try{ localStorage.setItem(menuKey(), JSON.stringify(o)); }catch(e){} }
export function grpButtons(g){
  var out=[], el=g.nextElementSibling;
  while(el && !el.classList.contains('grp')){
    if(el.tagName==='BUTTON') out.push(el);
    el=el.nextElementSibling;
  }
  return out;
}
export function applyMenuFold(){
  var open=menuOpenSet();
  $('#side').querySelectorAll('.grp').forEach(function(g){
    var name=g.textContent.trim();
    var isOpen=!!open[name];
    g.classList.toggle('open', isOpen);
    grpButtons(g).forEach(function(b){ b.classList.toggle('clps', !isOpen); });
    for(var el=g.nextElementSibling; el && !el.classList.contains('grp'); el=el.nextElementSibling){ if(el.classList.contains('subgrp')) el.classList.toggle('clps', !isOpen); }   /* ㊿+142 소제목도 접힘 */
  });
}
export function ensureGroupOpen(view){
  var btn=$('#side').querySelector('button[data-v="'+view+'"]');
  if(!btn || !btn.classList.contains('clps')) return;
  // 이 버튼이 속한 그룹을 찾아 펼침
  var el=btn.previousElementSibling;
  while(el && !el.classList.contains('grp')) el=el.previousElementSibling;
  if(!el) return;
  var open=menuOpenSet(); open[el.textContent.trim()]=true; menuSave(open);
  applyMenuFold();
}
export function setupSide(){
  $('#side').querySelectorAll('button').forEach(function(b){
    b.onclick=function(){ navMenu(this.dataset.v); closeDrawer(); };
  });
  $('#side').querySelectorAll('.grp').forEach(function(g){
    g.onclick=function(){
      var name=g.textContent.trim();
      var open=menuOpenSet();
      open[name]=!open[name]; menuSave(open);
      applyMenuFold();
    };
  });
  applyMenuFold();
  $('#btnMenu').onclick=function(){
    var open=$('#side').classList.toggle('open');
    $('#sideDim').classList.toggle('on', open);
  };
  $('#sideDim').onclick=closeDrawer;
  /* 커맨드 바 · 운영 보드 컨트롤 */
  var cb=document.getElementById('cmdBar'); if(cb) cb.onclick=function(){ openFind(); };
  var eqbNew=document.getElementById('eqbNew'); if(eqbNew) eqbNew.onclick=function(){ switchView('ordernew'); };
  document.querySelectorAll('#viewEqBoard .eqb-seg [data-go]').forEach(function(b){ b.onclick=function(){ switchView(b.dataset.go); }; });
  var eqbQ=document.getElementById('eqbQ'); if(eqbQ) eqbQ.oninput=function(){ EQB.q=this.value; renderEqBoard(); };
  var eqbR=document.getElementById('eqbReload'); if(eqbR) eqbR.onclick=function(){ eqbR.disabled=true; loadFromDb().then(function(nd){ onData(nd); if(ST.CUR_VIEW==='eqboard') renderEqBoard(); }).catch(function(e){ toast('다시 읽기 실패', String(e.message||e).slice(0,80), 'bad'); }).then(function(){ eqbR.disabled=false; }); };
  $('#dvSearch').oninput=function(){ DV.page=0; renderGrid(); };
  $('#dvFclr').onclick=clearFilters;
  window.addEventListener('resize',closeColFilter);
  var tw0=document.querySelector('#dvTable').parentElement;
  if(tw0) tw0.addEventListener('scroll',closeColFilter);
  $('#dvAdd').onclick=function(){
    if(ST.CUR_VIEW==='orders'){ openOrderForm(); return; }
    gridAddRow();
  };
  $('#odGo').onclick=submitOrder;
  /* 계약번호·관리자 계정·설치 희망일·서비스 에디션·요청 서비스 기능은 에스원 발주에만 쓰는 칸 — 다른 채널이면 숨기고 저장값도 비움 */
  function odS1Sync(){ var s1=$('#odChannel').value==='에스원'; document.querySelectorAll('#odFormWrap .od-s1').forEach(function(d){ d.style.display=s1? '':'none'; }); }
  $('#odChannel').onchange=odS1Sync; odS1Sync();
  $('#mpGo').onclick=submitMdrPoc;
  $('#oiGo').onclick=submitOi;
  $('#oiQuoteBtn').onclick=openQuotePick;
  $('#oiDoneList').onclick=function(){ switchView('oi'); };
  $('#oiDoneNew').onclick=function(){ $('#oiDone').style.display='none'; $('#oiFormWrap').style.display=''; $('#oiCust').focus(); };
  $('#mpDoneList').onclick=function(){ switchView('mdrops'); };
  $('#mpDoneNew').onclick=function(){ $('#mpDone').style.display='none'; $('#mpFormWrap').style.display=''; $('#mpCompany').focus(); };
  $('#odDoneList').onclick=function(){ switchView('orders'); };
  $('#odDoneNew').onclick=function(){ $('#odDone').style.display='none'; $('#odFormWrap').style.display=''; $('#odCustomer').focus(); };
  $('#btnLogout').onclick=doLogout;
  $('#btnWidgets').onclick=toggleWidgetPanel;
  $('#dvCsv').onclick=function(){ exportXlsx(); };
  $('#dvCols').onclick=function(ev){ ev.stopPropagation(); openColPick(this); };

  $('#dvDense').onclick=function(){
    try{ localStorage.setItem(denseKey(), localStorage.getItem(denseKey())==='1'?'0':'1'); }catch(e){}
    applyDense();
  };
  $('#dvPaste').onclick=openPaste;
  var bf2=document.getElementById('btnFind'); if(bf2) bf2.onclick=openFind;
  $('#dvReload').onclick=function(){
    if(ST.CUR_VIEW==='inbound'){ loadInbound(function(){ renderGrid(); }); return; }
    loadFromDb().then(function(nd){
      if(ST.IS_EQUIP){ renderGrid(); return; }   // 장비 전용: RAWX만 갱신
      onData(nd); if(ST.CUR_VIEW!=='dash') renderGrid();
    });
  };
}

/* ===== 해지 분석 — 기간별 해지 사유·기업 리스트 ===== */
export var CHURN={f:null,t:null,q:'',fil:{},sk:'',sd:1,inclRenew:false};   // fil: 열별 «볼 값 고르기» · inclRenew: 재약정 포함 여부
export var CH_COLS=[['cust','고객사',0],['line','서비스',0],['channel','채널',0],['ctype','구분',0],
              ['ym','해지월',0],['reason','사유',0],['amt','직전 월액(천원)',1],['note','비고',0],['rw','구분',0]];
export function chVal(x,k){                                            // 필터·표시용 셀 값
  if(k==='amt') return Math.round(x.amt/1000).toLocaleString('ko-KR');   // 천원
  if(k==='rw') return x.sup? '지원사업':'일반';
  var v=x[k];
  return (v==null||v==='')? BLANK_LABEL : String(v);
}
export function churnRows(){
  /* 회사 공식 해지 정의 (매출시트 규칙과 동일)
     · 상태 «해지» 인 원계약(부속 계약 제외) — 시트의 «해지년월 기입» 과 같음 (시트 동기화가 해지년월 → 상태 해지 · 종료월로 옮겨 놓음)
     · S1 은 서비스 종류 CND 제외 (sale_type = 'CND')
     · 해지월 = 종료월(end_month) · 지원사업 = 판매형태에 «지원»
     · 재약정 승계는 더 이상 추정하지 않음 — 연장은 원계약 한 줄에 «연장 n회» 로 기록되므로 종료 행이 생기지 않음 */
  var out=[];
  ST.DATA.rows.forEach(function(r,i){
    if(r.parent || r.noCount) return;
    if(String(r.status||'')!=='해지') return;
    if(r.line==='S1' && String(r.saleType||'')==='CND') return;
    var e=r.endIdx!=null? r.endIdx : r._l; if(e==null||e<0) return;
    var amt=ST.MAT[i][e]||ST.MAT[i][Math.max(e-1,0)]||r.mrr||0;
    out.push({cust:r.cust, line:lline(r.line), channel:chOf(r), ctype:r.ctype||'', ym:mk(e), e:e,
      reason:r.churn||'미기재', amt:amt, note:r.note||'', sup:/지원/.test(String(r.saleType||'')), renew:false, rwhy:''});
  });
  return out;
}

/* ═══════════════════════ 해지율 (기간 × 제품 · 사업영역 · 다양한 필터) ═══════════════════════
   회사 공식 해지 정의(매출시트 규칙)로 해지율을 계산합니다. 옵션으로 통계 탭(고객 관리 블록) 방식도 그대로 재현할 수 있습니다.
   · 해지 = 상태 «해지» 인 원계약(부속 제외) · 해지월 = 종료월(시트 해지년월) · 지원사업 = 판매형태에 «지원»
   · 분모 = 기간 시작 직전 달의 활성 고객사 — «계약 유효»(기본) / «과금»(그 달 인식 금액) / «누적고객»(통계 탭: 신규 누계 − 해지 누계)
   숫자를 누르면 그 칸의 계약 내역이 뜹니다. */
export var CR={unit:'year', base:'valid', cnd:true, rows:false, exDen:'org', sup:'all', from:2021, upto:null, open:false,
        f:{line:[], area:[], sale:[], ind:[], sector:[], ch:[], ptn:[], billing:[], svc:[]}};
export var CR_PRESET={
  portal:{base:'valid', cnd:true, rows:false, exDen:'org', sup:'all', f:{line:[],area:[],sale:[],ind:[],sector:[],ch:[],ptn:[],billing:[],svc:[]}},
  sheet: {base:'cum',   cnd:true,  rows:true,  exDen:'all', sup:'all', f:{line:['Cloud','S1'],area:[],sale:[],ind:[],sector:[],ch:[],ptn:[],billing:[],svc:[]}}
};
export function crFilterGroups(){
  var vals=function(fn){ var u={}; ST.DATA.rows.forEach(function(r){ if(r.parent) return; var v=fn(r); if(v) u[v]=1; }); return Object.keys(u); };
  var LN=['Cloud','S1','MDR','MDR_S1','DRM','PNS','DLP'].filter(function(l){ return ST.DATA.rows.some(function(r){return r.line===l;}); });
  var groups=[
    {k:'line', l:'제품', opts:LN.map(function(l){return [l,lline(l)];}), get:function(r){return r.line;}},
    {k:'area', l:'사업영역', opts:Object.keys(CH_DEFS).filter(function(k){return ST.DATA.rows.some(CH_DEFS[k][3]);}).map(function(k){return [k,CH_DEFS[k][0].replace(/^\S+ /,'')];}),
       test:function(r,sel){ return sel.some(function(k){ return CH_DEFS[k]&&CH_DEFS[k][3](r); }); }},
    {k:'sale', l:'판매형태', opts:vals(function(r){return /^CN[BDE]$/.test(r.saleType||'')? '' : r.saleType;}).sort().map(function(v){return [v,v];}), get:function(r){return r.saleType;}},
    {k:'ind', l:'산업군', opts:vals(function(r){return r.ind;}).sort().map(function(v){return [v,v];}), get:function(r){return r.ind;}},
    {k:'ch', l:'판매 채널', opts:vals(function(r){return chOf(r);}).sort().map(function(v){return [v,v];}), get:function(r){return chOf(r);}},
    {k:'sector', l:'업종', opts:vals(function(r){return r.sector;}).sort().map(function(v){return [v,v];}), get:function(r){return r.sector;}, more:true},
    {k:'ptn', l:'파트너', opts:vals(function(r){return r.ptn;}).sort().map(function(v){return [v,v];}), get:function(r){return r.ptn;}, more:true},
    {k:'billing', l:'과금방식', opts:vals(function(r){return r.billing;}).sort().map(function(v){return [v,v];}), get:function(r){return r.billing;}, more:true},
    {k:'svc', l:'S1 서비스 종류', opts:vals(function(r){return /^CN[BDE]$/.test(r.saleType||'')? r.saleType : '';}).sort().map(function(v){return [v,v==='CND'?'CND (DeviceKeeper · 단종 → Basic 전환)':v==='CNB'?'CNB (Basic)':v==='CNE'?'CNE (Enterprise)':v];}), get:function(r){return r.saleType;}, more:true}
  ];
  return groups;
}
export var CR_G=null;                                   // 필터 그룹 캐시 — 행마다 다시 계산하면 화면이 멈춥니다
export function crMatch(r){
  var G=CR_G||(CR_G=crFilterGroups());
  for(var i=0;i<G.length;i++){ var g=G[i], sel=CR.f[g.k]||[]; if(!sel.length) continue;
    if(g.test){ if(!g.test(r,sel)) return false; } else if(sel.indexOf(g.get(r)||'')<0) return false; }
  return true;
}
export function crMaxJ(){ var maxJ=Math.min(ST.DATA.nowIdx>=0? ST.DATA.nowIdx : ST.M-1, ST.M-1); if(CR.upto!=null) maxJ=Math.min(maxJ, CR.upto); return maxJ; }
export function crPeriods(){
  var maxJ=crMaxJ(), out=[];
  var y0=CR.from, yN=2020+Math.floor((maxJ+5)/12);
  for(var y=y0;y<=yN;y++){
    var yStart=dIdx(y+'-01');
    if(CR.unit==='year'){ var e=Math.min(yStart+11,maxJ); if(yStart<=maxJ) out.push({l:String(y)+(e<yStart+11?' (~'+(+mk(e).slice(5))+'월)':''), s:yStart, e:e}); }
    else if(CR.unit==='half'){ for(var h=0;h<2;h++){ var s0=yStart+h*6, e0=Math.min(s0+5,maxJ); if(s0<=maxJ) out.push({l:y+' '+(h+1)+'H'+(e0<s0+5?' (~'+(+mk(e0).slice(5))+'월)':''), s:s0, e:e0}); } }
    else { for(var q=0;q<4;q++){ var s1=yStart+q*3, e1=Math.min(s1+2,maxJ); if(s1<=maxJ) out.push({l:y+' '+(q+1)+'Q'+(e1<s1+2?' (~'+(+mk(e1).slice(5))+'월)':''), s:s1, e:e1}); } }
  }
  return out;
}
export function crEligible(r){
  if(r.parent) return false;                                   // 부속 계약(추가 구매) 제외
  if(CR.sup==='ex' && crIsSup(r)) return false;                // 지원사업 제외
  if(CR.sup==='only' && !crIsSup(r)) return false;             // 지원사업만
  if(String(r.status||'')==='통합과금') return false;                                                              // 에스원 통합 과금 행(CND→Basic 전환 고객 묶음 청구) — 매출만, 고객사 아님
  if(r.noCount || String(r.saleType||'')==='H/W') return false;                                                   // 고객 수 집계 제외 행(시트 «중복») · H/W 일시 판매(구독 고객 아님)
  if(!CR.cnd && (String(r.status||'')==='CN전환' || (r.line==='S1' && String(r.saleType||'')==='CND'))) return false;   // CND(DeviceKeeper→S1 Basic 전환) 고객은 LIVE 고객 — 기본 포함. «제외»는 매출시트 통계 탭과 맞출 때만
  if(CR.base!=='sheet' && (r.startIdx==null || r.startIdx<0)) return false;                                        // 시작월이 없고 매출도 없는 행(계약 예정) — 시트 LIVE 규칙일 때만 포함
  if(r.endIdx!=null && r.endIdx>=0 && r.endIdx<r.startIdx) return false;                                          // 종료월이 시작월보다 앞선 행(데이터 오류) 제외
  return true;
}
export function crIsSup(r){ return /지원/.test(String(r.saleType||'')); }
export function crActive(t, match){
  var out=[];
  ST.DATA.rows.forEach(function(r,i){
    if(!crEligible(r) || !match(r)) return;
    if(CR.base==='rev'){ if(ST.MAT[i][t]>0) out.push(r); return; }
    if(CR.base==='sheet'){                                                                                          // 매출시트 LIVE 규칙: 상태 글자 기준 (신규·재약정·CN전환 = LIVE, 서비스종료·추가 = 아님, 해지는 해지월 전까지) · 날짜 없는 행도 포함
      var st0=String(r.status||''); if(st0==='추가' || /종료/.test(st0)) return;
      if(r.startIdx!=null && r.startIdx>=0 && r.startIdx>t) return;
      if(st0==='해지'){ var xe=(r.endIdx!=null&&r.endIdx>=0)? r.endIdx : null; if(xe==null || xe<=t) return; }
      out.push(r); return; }
    if(r.startIdx==null || r.startIdx>t) return;
    var e=(r.endIdx!=null && r.endIdx>=0)? r.endIdx : (r._l>=0? r._l : null);   // 종료월 없고 매출도 없으면(통합 과금 전환 고객) 열린 계약으로 봄
    if(CR.base==='cum'){ if(String(r.status||'')==='해지' && e!=null && e<=t) return; out.push(r); return; }   // 누적고객: 신규 누계 − 해지 누계 (만기·서비스종료는 안 뺌)
    if(e!=null && e<t) return;                                                                                  // 계약 유효: 종료월(해지월) 이 그 달 이후
    if(e===t && String(r.status||'')==='해지') return;                                                          // 해지월 = 마지막 매출월 → 그 달 말(다음 기간 기초)엔 이미 빠진 것으로 (누적고객 기준과 동일)
    out.push(r);
  });
  return out;
}
export function crLost(s,e,match){
  var out=[];
  ST.DATA.rows.forEach(function(r){
    if(!crEligible(r) || !match(r)) return;
    if(String(r.status||'')!=='해지') return;
    if(r.line==='S1' && String(r.saleType||'')==='CND') return;          // CND(DeviceKeeper) 해지는 매출시트 규칙대로 해지 집계에서 항상 제외
    var x=r.endIdx!=null? r.endIdx : r._l; if(x==null) return;
    if(x>=s && x<=e) out.push(r);
  });
  return out;
}
export function crN(list){ if(CR.rows) return list.length; var u={}; list.forEach(function(r){ u[r.cust]=1; }); return Object.keys(u).length; }
export function crRate(a,b){ return b? (a/b*100).toFixed(1)+'%' : '–'; }
export function crLink(list,s,e,extra,kind,label,cls){
  var n=crN(list); if(!n) return '<span style="color:var(--muted)">0</span>';
  return '<a href="#" class="crk" data-s="'+s+'" data-e="'+e+'" data-x="'+esc(extra||'')+'" data-k="'+kind+'" data-l="'+esc(label)+'" style="'+(cls||'color:var(--s1-ink);font-weight:700')+';text-decoration:none">'+n.toLocaleString('ko-KR')+'</a>';
}
export function crSeg(name,key,opts,val){
  return '<div class="crseg"><span>'+name+'</span><div class="seg">'+opts.map(function(o){ return '<button data-g="'+key+'" data-v="'+o[0]+'" aria-pressed="'+(o[0]===val)+'"'+(o[2]?' title="'+esc(o[2])+'"':'')+'>'+o[1]+'</button>'; }).join('')+'</div></div>';
}
export function crChips(g){
  var sel=CR.f[g.k]||[];
  return '<div class="crchips"><span class="crlab">'+g.l+(sel.length?' <b>'+sel.length+'</b>':'')+'</span>'+
    g.opts.map(function(o){ var on=sel.indexOf(o[0])>=0; return '<button class="chip" data-fg="'+g.k+'" data-fv="'+esc(o[0])+'" aria-pressed="'+on+'">'+esc(o[1])+'</button>'; }).join('')+
    (sel.length? '<button class="chip clr" data-fclr="'+g.k+'" title="이 조건 지우기">✕</button>':'')+'</div>';
}
export function crSummary(){
  var G=CR_G||(CR_G=crFilterGroups()), parts=[];
  G.forEach(function(g){ var sel=CR.f[g.k]||[]; if(!sel.length) return; var lab={}; g.opts.forEach(function(o){lab[o[0]]=o[1];}); parts.push(g.l+': '+sel.map(function(v){return lab[v]||v;}).join('·')); });
  return parts.length? parts.join(' / ') : '전체 계약';
}
export function renderChurnRate(){
  if(CR.crCnd==null) CR.crCnd=CR.cnd; CR.cnd=CR.crCnd;
  var host=$('#crBody');
  if(!ST.DATA||!ST.DATA.rows||!ST.DATA.rows.length){ host.innerHTML='<div class="cap" style="padding:40px;text-align:center">데이터를 불러오는 중…</div>'; return; }
  CR_G=crFilterGroups();
  var P=crPeriods(), G=CR_G, maxAll=Math.min(ST.DATA.nowIdx>=0? ST.DATA.nowIdx : ST.M-1, ST.M-1);
  var isSheet=(CR.base==='cum'&&CR.cnd&&CR.rows&&CR.exDen==='all'), isPortal=(CR.base==='valid'&&CR.cnd&&!CR.rows&&CR.exDen==='org');
  var h='<div class="pr-top"><div><h2 style="margin:0;font-size:18px">📐 해지율</h2><p class="cap" style="margin:2px 0 0">기간 · 제품 · 사업영역 · 판매형태 · 업종 등으로 잘라 보는 해지율 — 숫자를 누르면 그 칸의 계약 내역</p></div>'+
    '<span class="spacer"></span><div class="seg"><button data-preset="portal" aria-pressed="'+isPortal+'" title="고객사 단위 · 계약 유효 분모 · CND 제외 · 지원 제외율은 지원 제외 활성 대비">포탈 기준</button><button data-preset="sheet" aria-pressed="'+isSheet+'" title="계약 행 단위 · 누적고객 분모 · CND 포함 · Cloud NAC + 에스원 · 지원 제외율은 전체 활성 대비 (통계 탭 고객 관리 블록과 같은 방식)">통계 탭 기준</button></div></div>';
  h+=helpBox('churnrate','이 화면 읽는 법 (처음 보시는 분께)',[
     ['해지율','그 기간에 해지한 고객사 ÷ 기간 시작 직전 달의 활성 고객사. 연도면 «전년 12월 활성»이 분모라서, 그 해에 새로 들어온 고객은 분모에 없습니다.'],
     ['해지','상태가 «해지»인 원계약(부속 계약 제외). 해지월은 종료월(매출시트의 해지년월)과 같습니다. 약정 만기 후 그냥 끝난 «서비스종료»는 해지가 아닙니다.'],
     ['분모 3가지','<b>계약 유효</b> = 그 달에 유효 계약이 있는 고객사(포탈 기본) · <b>과금</b> = 그 달 매출이 있는 고객사 · <b>누적고객</b> = 신규 누계 − 해지 누계(매출시트 통계 탭 방식, 만기 종료를 빼지 않아 분모가 커서 해지율이 낮게 나옴)'],
     ['포탈 기준 / 매출시트 기준','오른쪽 위 버튼. 매출시트 통계 탭과 같은 숫자를 보려면 «매출시트 기준»(누적고객 · CND 포함 · 계약 행 단위 · Cloud NAC+에스원)을 누르세요.'],
     ['지원사업 제외율','판매형태 «정부 지원» 고객을 빼고 계산한 해지율. 바우처 만기 해지를 걷어낸 «순수 이탈률»입니다.'],
     ['CND 전환 고객','CND = Cloud NAC DeviceKeeper. 예전에 에스원으로 납품하던 제품인데 단종되어 전부 S1 Cloud NAC Basic으로 교체됐고, 과금은 에스원에 한 건으로 묶어 받습니다(«에스원 통합과금» 행). 이 고객들은 <b>LIVE 고객으로 항상 포함</b>합니다(기본). 다만 옛 DeviceKeeper 계약의 해지는 매출시트 규칙대로 해지 건수에 넣지 않습니다. «제외»는 매출시트 통계 탭이 CND를 통째로 빼고 계산한 값과 맞출 때만 쓰세요.'],
     ['분모가 작을 때','시작 활성이 20곳 미만(PNS·DRM·초기 MDR)이면 한 곳 차이가 10%p 이상 움직입니다. 그런 칸은 비율보다 «7곳 중 2곳»처럼 건수로 읽어 주세요.']
   ],'모든 숫자는 «계약» 메뉴의 데이터로 계산하며, 파란 숫자를 누르면 그 칸을 만든 계약 명단이 열립니다. 제품별·사업영역별 표의 오른쪽 «합계 → 전체» 열은 두 제품을 함께 쓰는 고객사 때문에 생기는 차이를 보여줍니다.');
  /* 계산 규칙 */
  h+='<div class="pr-card crpanel" style="margin-bottom:12px">'+
     '<div class="crrow">'+
       crSeg('기간','unit',[['year','연도'],['half','반기'],['quarter','분기']],CR.unit)+
       crSeg('지원사업','sup',[['all','포함','지원사업 고객을 포함해 계산하고 표 안에서 지원사업/그 외로 나눠 보여줍니다'],['ex','제외','지원사업(판매형태 정부 지원) 계약을 분모·분자에서 모두 뺍니다'],['only','지원사업만','지원사업 계약만 봅니다']],CR.sup)+
       crSeg('분모','base',[['valid','계약 유효','시작월 ≤ 그 달 ≤ 종료월인 고객사 · 해지 고객사는 해지월 말에 빠짐 (CN전환 제외)'],['rev','과금','그 달에 인식 금액이 있는 고객사'],['cum','누적고객','통계 탭 방식: 신규 누계 − 해지 누계 (만기 종료는 안 뺌)'],['sheet','시트 LIVE 규칙','매출시트 LIVE 고객사 산정 방식: 계약구분·계약상세 글자로 판단(신규·재약정·CN전환), 날짜 없는 행 포함, 해지는 해지월 전까지']],CR.base)+
       crSeg('단위','rows',[['cust','고객사'],['rows','계약 행','통계 탭은 계약 행 수']],CR.rows?'rows':'cust')+
       crSeg('CND 전환 고객','cnd',[['in','포함 (기본)','DeviceKeeper→S1 Basic 전환 고객을 LIVE 고객으로 셉니다 · 해지 집계는 어차피 CND를 빼므로 분모에만 영향'],['ex','제외','매출시트 통계 탭이 CND를 통째로 빼고 계산한 것과 맞출 때만']],CR.cnd?'in':'ex')+
       crSeg('지원 제외율 분모','exDen',[['org','지원 제외 활성'],['all','전체 활성','통계 탭 장표 방식']],CR.exDen)+
       '<div class="crseg"><span>기준월</span><select id="crUpto" aria-label="기준월">'+(function(){ var o=''; for(var j=maxAll;j>=Math.max(0,maxAll-35);j--) o+='<option value="'+j+'"'+(j===crMaxJ()?' selected':'')+'>'+mk(j)+'</option>'; return o; })()+'</select></div>'+
     '</div>'+
     '<div class="crrow crfilters">'+G.filter(function(g){return !g.more;}).map(crChips).join('')+
       '<details'+(CR.open?' open':'')+' id="crMore"><summary>업종 · 파트너 · 과금방식 · S1 서비스 종류 '+(G.filter(function(g){return g.more&&(CR.f[g.k]||[]).length;}).length? '<b>선택됨</b>':'')+'</summary>'+G.filter(function(g){return g.more;}).map(crChips).join('')+'</details>'+
     '</div></div>';
  /* ① 상세표 */
  var m=crMatch, baseLab={valid:'계약 유효 고객사',rev:'과금 고객사',cum:'누적고객(신규 − 해지)'}[CR.base];
  h+='<div class="pr-card" style="margin-bottom:12px"><h3>'+esc(crSummary())+' — '+(CR.unit==='year'?'연도별':CR.unit==='half'?'반기별':'분기별')+' 해지율'+
     ' <span class="ubadge sm">분모 = 기간 시작 전 달 '+baseLab+'</span><small>'+(CR.rows?'계약 행 단위':'고객사 단위')+' · 지원사업 '+({all:'포함',ex:'제외',only:'만'}[CR.sup])+' · CND '+(CR.cnd?'포함':'제외')+' · 지원 제외율 = 그 외 해지 ÷ '+(CR.exDen==='all'?'전체 활성':'지원 제외 활성')+'</small></h3>'+
     '<div style="overflow-x:auto"><table class="pr"><thead><tr><th>기간</th><th class="n" title="기간 시작 직전 달 기준 — 연도면 전년 12월">시작 활성<br><span class="mini">(직전 달)</span></th><th class="n">└ 지원사업</th><th class="n" title="기간 마지막 달 기준">기간 말 활성</th><th class="n">해지</th><th class="n">└ 지원사업</th><th class="n">└ 그 외</th><th class="n">해지율 (지원 포함)</th><th class="n">해지율 (지원 제외)</th><th class="n">해지 MRR(천원)</th></tr></thead><tbody>';
  var tot={lost:[],sup:[],org:[],amt:0};
  P.forEach(function(p){
    var base=crActive(p.s-1,m), baseSup=base.filter(crIsSup), lost=crLost(p.s,p.e,m), sup=lost.filter(crIsSup), org=lost.filter(function(r){return !crIsSup(r);});
    var endA=crActive(p.e,m);
    var nb=crN(base), nbs=crN(baseSup), nl=crN(lost), no=crN(org);
    var amt=lost.reduce(function(a,r){ var i=r._k, e=r.endIdx!=null?r.endIdx:r._l; return a+((ST.MAT[i]&&(ST.MAT[i][e]||ST.MAT[i][Math.max(e-1,0)]))||r.mrr||0); },0);
    tot.lost=tot.lost.concat(lost); tot.sup=tot.sup.concat(sup); tot.org=tot.org.concat(org); tot.amt+=amt;
    h+='<tr><td><b>'+esc(p.l)+'</b></td><td class="n">'+crLink(base,p.s-1,p.s-1,'','base',p.l+' 시작 활성 ('+mk(p.s-1)+')','color:var(--ink-2);font-weight:600')+'</td><td class="n">'+crLink(baseSup,p.s-1,p.s-1,'','basesup',p.l+' 시작 활성 · 지원사업','color:var(--muted)')+'</td>'+
       '<td class="n">'+crLink(endA,p.e,p.e,'','base',p.l+' 기간 말 활성 ('+mk(p.e)+')','color:var(--ink-2)')+'</td>'+
       '<td class="n">'+crLink(lost,p.s,p.e,'','lost',p.l+' 해지')+'</td><td class="n">'+crLink(sup,p.s,p.e,'','sup',p.l+' 해지 · 지원사업','color:var(--muted);font-weight:600')+'</td><td class="n">'+crLink(org,p.s,p.e,'','org',p.l+' 해지 · 그 외','color:var(--muted);font-weight:600')+'</td>'+
       '<td class="n"><b>'+crRate(nl,nb)+'</b></td><td class="n"><b>'+crRate(no, CR.exDen==='all'? nb : nb-nbs)+'</b></td><td class="n">'+won(amt)+'</td></tr>';
  });
  h+='<tr style="background:var(--surface-2)"><td><b>누계</b></td><td></td><td></td><td></td><td class="n"><b>'+crN(tot.lost)+'</b></td><td class="n">'+crN(tot.sup)+'</td><td class="n">'+crN(tot.org)+'</td><td></td><td></td><td class="n">'+won(tot.amt)+'</td></tr>';
  h+='</tbody></table></div>'+
     '<p class="pr-note" style="margin:8px 0 0">해지율 분모는 <b>기간 시작 직전 달</b>의 활성(연도면 전년 12월)이라, 그 기간에 새로 들어온 고객은 분모에 없고 «기간 말 활성»에서만 보입니다 — 예: MDR은 2025년 7월 시작이라 2025년 시작 활성은 0, 기간 말 활성부터 잡힙니다. 해지 = 상태 «해지» 원계약(부속 계약 제외) · 해지월 = 종료월(시트 해지년월) · 지원사업 = 판매형태 «정부 지원» · 계약 유효 = 시작월 ≤ 그 달 ≤ 종료월, 해지 고객사는 해지월(마지막 매출월) 말에 빠짐 (CN전환 아님) · 누적고객 = 통계 탭 방식(신규 누계 − 해지 누계, 서비스 종료·만기는 안 뺌) · 에스원 CND 제외 시 LIVE 메뉴보다 그만큼 적게 보임</p></div>';
  /* ② ③ 매트릭스 */
  [['제품별','line'],['사업영역별','area']].forEach(function(gg){
    var g=G.filter(function(x){return x.k===gg[1];})[0]; if(!g) return;
    var cols=g.opts.filter(function(o){ var sel=CR.f[g.k]||[]; return !sel.length || sel.indexOf(o[0])>=0; });
    h+='<div class="pr-card" style="margin-bottom:12px"><h3>'+gg[0]+' 해지율 <small>칸 = 해지 / 기간 시작 활성 · 해지율(지원 포함) · 다른 필터는 그대로 적용 · 맨 오른쪽 = 칸 합계와 전체 표(회사 단위) 대조</small></h3><div style="overflow-x:auto"><table class="pr"><thead><tr><th>기간</th>'+
       cols.map(function(o){ return '<th class="n">'+esc(o[1])+'</th>'; }).join('')+'<th class="n" title="칸을 그대로 더한 값 / 전체 표 값 — 두 제품(영역)을 함께 쓰는 고객사는 칸마다 1곳씩 잡히지만 전체 표에서는 회사 단위로 1곳이라 그만큼 차이가 납니다">합계 → 전체(회사 단위)</th></tr></thead><tbody>';
    P.forEach(function(p){
      var sB=0, sL=0;
      h+='<tr><td><b>'+esc(p.l)+'</b></td>'+cols.map(function(o){
        var mm=function(r){ return crMatch(r) && (g.test? g.test(r,[o[0]]) : g.get(r)===o[0]); };
        var base=crActive(p.s-1,mm), lost=crLost(p.s,p.e,mm), nb=crN(base), nl=crN(lost); sB+=nb; sL+=nl;
        if(!nb && !nl) return '<td class="n" style="color:var(--muted)">–</td>';
        var x=g.k+'='+o[0];
        return '<td class="n">'+crLink(lost,p.s,p.e,x,'lost',o[1]+' · '+p.l+' 해지')+' / '+crLink(base,p.s-1,p.s-1,x,'base',o[1]+' · '+p.l+' 시작 활성','color:var(--ink-2)')+'<div class="mini" style="font-weight:700">'+crRate(nl,nb)+'</div></td>';
      }).join('');
      var tB=crN(crActive(p.s-1,crMatch)), tL=crN(crLost(p.s,p.e,crMatch)), dB=sB-tB, dL=sL-tL;
      h+='<td class="n" style="color:var(--muted)">'+sL+' / '+sB+(dB||dL? ' <span title="'+gg[0]+' 칸 합계와 전체 표 차이 = 두 개 이상 '+gg[0]+'을 함께 쓰는 고객사 (전체 표에서는 1곳)">→ <b style="color:var(--ink-2)">'+tL+' / '+tB+'</b> <span class="mini">(중복 '+(dB? dB+'곳':'')+(dL? (dB?' · ':'')+'해지 '+dL:'')+')</span></span>':' <span class="mini">= 전체</span>')+'</td></tr>';
    });
    h+='</tbody></table></div></div>';
  });
  host.innerHTML=h; helpWire(host);
  host.querySelectorAll('button[data-preset]').forEach(function(b){ b.onclick=function(){ var p=CR_PRESET[b.dataset.preset]; CR.base=p.base; CR.cnd=CR.crCnd=p.cnd; CR.rows=p.rows; CR.exDen=p.exDen; CR.sup=p.sup; CR.f=JSON.parse(JSON.stringify(p.f)); renderChurnRate(); }; });
  host.querySelectorAll('.crseg button[data-g]').forEach(function(b){ b.onclick=function(){
    var g=b.dataset.g, v=b.dataset.v;
    if(g==='unit') CR.unit=v; else if(g==='base') CR.base=v; else if(g==='cnd') CR.cnd=CR.crCnd=(v==='in'); else if(g==='rows') CR.rows=(v==='rows'); else if(g==='exDen') CR.exDen=v; else if(g==='sup') CR.sup=v;
    renderChurnRate(); }; });
  host.querySelectorAll('button.chip[data-fg]').forEach(function(b){ b.onclick=function(){
    var k=b.dataset.fg, v=b.dataset.fv, sel=CR.f[k]=CR.f[k]||[]; var i=sel.indexOf(v); if(i>=0) sel.splice(i,1); else sel.push(v);
    CR.open=!!(host.querySelector('#crMore')||{}).open; renderChurnRate(); }; });
  host.querySelectorAll('button.chip[data-fclr]').forEach(function(b){ b.onclick=function(){ CR.f[b.dataset.fclr]=[]; CR.open=!!(host.querySelector('#crMore')||{}).open; renderChurnRate(); }; });
  var up=$('#crUpto'); if(up) up.onchange=function(){ CR.upto=+up.value; renderChurnRate(); };
  var det=$('#crMore'); if(det) det.ontoggle=function(){ CR.open=det.open; };
  host.querySelectorAll('a.crk').forEach(function(a){ a.onclick=function(ev){ ev.preventDefault(); crOpen(a.dataset); }; });
}
/* 셀 내역 팝업 */
export var CR_LAST=[];
export function crOpen(d){
  var s=+d.s, e=+d.e, m=crMatch;
  var gfn=null;
  if(d.x){ var kv=d.x.split('='), gk=kv[0], gv=kv.slice(1).join('='); var G=CR_G||(CR_G=crFilterGroups()), g=G.filter(function(x){return x.k===gk;})[0];
    if(g){ gfn=function(r){ return cfVal(g,r)===gv; }; m=function(r){ return crMatch(r) && gfn(r); }; } }
  var list;
  if(d.k==='base') list=crActive(s,m);
  else if(d.k==='new') list=crNew(s,e,crMatch).filter(function(r){ return !gfn || gfn(r); });   // 유입 경로: 회사의 첫 계약을 기준으로 구분
  else if(d.k==='ret') list=crRet(s,e,m);
  else if(d.k==='keep') list=crLostKeep(s,e,m);
  else if(d.k==='ended') list=crEnded(s,e,m);
  else if(d.k==='basesup') list=crActive(s,m).filter(crIsSup);
  else { list=crLost(s,e,m); if(d.k==='sup') list=list.filter(crIsSup); if(d.k==='org') list=list.filter(function(r){return !crIsSup(r);}); }
  var isLost=(d.k==='lost'||d.k==='sup'||d.k==='org'||d.k==='ended'||d.k==='keep');
  list=list.slice().sort(function(a,b){ var ea=a.endIdx!=null?a.endIdx:a._l, eb=b.endIdx!=null?b.endIdx:b._l; return isLost? (ea-eb || a.cust.localeCompare(b.cust)) : a.cust.localeCompare(b.cust); });
  CR_LAST=list.map(function(r){ var i=r._k, en=r.endIdx!=null?r.endIdx:r._l; var amt=isLost? ((ST.MAT[i]&&(ST.MAT[i][en]||ST.MAT[i][Math.max(en-1,0)]))||r.mrr||0) : ((ST.MAT[i]&&ST.MAT[i][s])||r.mrr||0);
    return {cust:r.cust, line:lline(r.line), ch:chOf(r), sale:r.saleType||'', ind:r.ind||'', sector:r.sector||'', st:r.status||'', start:mk(r.startIdx)||'', end:en!=null?mk(en):'', reason:r.churn||'', note:r.note||'', amt:amt, renew:r.renew||0}; });
  $('#crTitle').textContent=d.l;
  var u={}; CR_LAST.forEach(function(x){u[x.cust]=1;});
  $('#crCap').textContent=crSummary()+' · 계약 '+CR_LAST.length+'건 · 고객사 '+Object.keys(u).length+'곳 · 행을 누르면 계약 화면에서 그 고객사를 찾습니다';
  $('#crList').innerHTML='<table class="pr"><thead><tr><th>고객사</th><th>서비스</th><th>채널</th><th>판매형태</th><th>산업군</th><th>업종</th><th>상태</th><th>시작월</th><th>'+(isLost?'해지월':'종료월')+'</th>'+(isLost?'<th>사유</th>':'')+'<th>비고</th><th class="n">'+(isLost?'해지 직전 월액(천원)':'월액(천원)')+'</th></tr></thead><tbody>'+
    CR_LAST.map(function(x,i){ return '<tr data-i="'+i+'" style="cursor:pointer"><td>'+esc(x.cust)+(x.renew?' <span class="ubadge sm">연장 '+x.renew+'회</span>':'')+'</td><td>'+esc(x.line)+'</td><td>'+esc(x.ch)+'</td><td>'+esc(x.sale)+'</td><td>'+esc(x.ind)+'</td><td>'+esc(x.sector)+'</td><td>'+esc(x.st)+'</td><td>'+x.start+'</td><td>'+x.end+'</td>'+(isLost?'<td>'+esc(x.reason)+'</td>':'')+'<td>'+esc(x.note)+'</td><td class="n">'+won(x.amt)+'</td></tr>'; }).join('')+'</tbody></table>';
  $('#crList').querySelectorAll('tr[data-i]').forEach(function(tr){ tr.onclick=function(){ var x=CR_LAST[+tr.dataset.i]; closeOvl('ovlCr'); switchView('contracts'); $('#dvSearch').value=x.cust; renderGrid(); }; });
  $('#crXls').onclick=function(){
    var hd=['고객사','서비스','채널','판매형태','산업군','업종','상태','시작월',(isLost?'해지월':'종료월'),'사유','비고','월액(천원)'];
    var rows=CR_LAST.map(function(x){ return [x.cust,x.line,x.ch,x.sale,x.ind,x.sector,x.st,x.start,x.end,x.reason,x.note,Math.round(x.amt/1000)]; });
    xlsxAoa($('#crTitle').textContent.replace(/[\\/:*?"<>|]/g,' '), hd, rows);
  };
  openOvl('ovlCr');
}


/* ═══════════════════════ 고객사 증감 (기초 → +신규 −해지 → 기말) ═══════════════════════
   해지율 화면과 같은 규칙·필터(CR)를 씁니다. 활성 = 계약 기간 유효 고객사(해지·CN전환·부속·CND 제외).
   신규 = 그 기간에 첫 계약을 시작한 고객사 · 해지 = 상태 «해지» 종료월이 그 기간인 고객사
   기타 조정 = 기말 − (기초 + 신규 − 해지): 약정 만기 뒤 재약정 없이 끝난 고객, 데이터 보정 등 */
export function crNew(s,e,match){
  var first={};
  ST.DATA.rows.forEach(function(r){
    if(!crEligible(r) || !match(r) || r.startIdx==null) return;
    var k=r.cust; if(!first[k] || r.startIdx<first[k].startIdx) first[k]=r;
  });
  return Object.keys(first).map(function(k){ return first[k]; }).filter(function(r){ return r.startIdx>=s && r.startIdx<=e; });
}
/* 해지 후 잔존 = 그 기간에 해지 계약이 있지만 기말에도 다른 유효 계약(다른 서비스·재계약)이 남아 고객사 수에서는 빠지지 않는 곳 */
export function crLostKeep(s,e,match){
  var a1=crCustSet(crActive(e,match)), seen={};
  return crLost(s,e,match).filter(function(r){ if(!a1[r.cust]||seen[r.cust]) return false; seen[r.cust]=1; return true; });
}
/* 유입 경로 구분값: 그룹 정의의 값에 에스원 S1 서비스 종류(CNE/CNB/CND)를 «에스원»으로 묶음 */
export function cfVal(g,r){
  if(g.k==='sale'){ var v=r.saleType||''; return /^CN[BDE]$/.test(v)? '에스원' : v; }
  if(g.test){ var hit=g.opts.filter(function(o){ return g.test(r,[o[0]]); })[0]; return hit? hit[0] : ''; }
  return g.get(r)||'';
}
export function crCustSet(list){ var u={}; list.forEach(function(r){ u[r.cust]=1; }); return u; }
/* 복귀 = 기말에 유효한데 기초엔 없었고 «신규(첫 계약)»도 아닌 고객사 → 예전에 끊겼다가 다시 계약한 곳 */
export function crRet(s,e,match){
  var a0=crCustSet(crActive(s-1,match)), nw=crCustSet(crNew(s,e,match)), seen={};
  return crActive(e,match).filter(function(r){ if(a0[r.cust]||nw[r.cust]||seen[r.cust]) return false; seen[r.cust]=1; return true; });
}
/* 종료(해지 외) = 기초에 있었거나 기간 중 신규였는데 기말엔 없고, «해지» 로도 안 잡힌 고객사 → 만기 후 미연장·서비스종료·CN전환 등 */
export function crEnded(s,e,match){
  var a1=crCustSet(crActive(e,match)), lost=crCustSet(crLost(s,e,match)), pool=crActive(s-1,match).concat(crNew(s,e,match)), last={};
  pool.forEach(function(r){ if(a1[r.cust]||lost[r.cust]) return; var x=r.endIdx!=null? r.endIdx : r._l; if(!last[r.cust] || (x||0)>(last[r.cust]._x||0)){ r._x=x; last[r.cust]=r; } });
  return Object.keys(last).map(function(k){ return last[k]; });
}
export function renderCustFlow(){
  var host=$('#cfBody');
  if(!ST.DATA||!ST.DATA.rows||!ST.DATA.rows.length){ host.innerHTML='<div class="cap" style="padding:40px;text-align:center">데이터를 불러오는 중…</div>'; return; }
  CR_G=crFilterGroups(); CR.base='valid'; if(CR.cfCnd==null) CR.cfCnd=true; CR.cnd=CR.cfCnd;
  var P=crPeriods(), G=CR_G, m=crMatch, maxAll=Math.min(ST.DATA.nowIdx>=0? ST.DATA.nowIdx : ST.M-1, ST.M-1);
  var lineG=G.filter(function(g){return g.k==='line';})[0];
  var isLive=(CR.cnd && CR.sup==='all'), isSheet=(!CR.cnd && CR.sup==='all');
  var h='<div class="pr-top"><div><h2 style="margin:0;font-size:18px">👥 고객사 증감</h2><p class="cap" style="margin:2px 0 0">우리 고객사가 언제 몇 곳 들어오고 나갔는지 — 기간별 증감, 어디서 들어왔는지(유입 경로), 제품별 고객사 수. 파란 숫자를 누르면 그 명단이 열립니다</p></div>'+
     '<span class="spacer"></span><div class="seg" title="자주 쓰는 기준을 한 번에 맞춥니다"><button data-cfp="live" aria-pressed="'+isLive+'" title="LIVE 고객사 메뉴·대시보드와 같은 범위 — 에스원 CND 사이트 포함">LIVE 기준</button><button data-cfp="sheet" aria-pressed="'+isSheet+'" title="매출시트 해지 통계와 같은 범위 — 에스원 CND 사이트 제외">매출시트 기준</button></div></div>';
  h+=helpBox('custflow','이 화면 읽는 법 (처음 보시는 분께)',[
     ['고객사 1곳','회사 하나를 1곳으로 셉니다. 한 회사가 Cloud NAC와 MDR을 같이 써도 1곳이고, 계약이 여러 건이어도 1곳입니다. 부속 계약(라이선스·센서 추가)은 세지 않습니다.'],
     ['기초 · 기말','기간 시작 직전 달 말 / 기간 마지막 달 말에 유효한 계약이 있는 고객사 수. 해지한 고객사는 해지월(마지막 매출월) 말에 빠집니다.'],
     ['신규','그 기간에 <b>회사의 첫 계약</b>을 시작한 고객사. 기존 고객이 다른 제품을 추가한 건 신규가 아닙니다(그건 제품별 표에서 보입니다).'],
     ['복귀','예전에 끊겼다가 다시 계약한 고객사. 첫 계약이 아니라서 신규에 안 잡히고 따로 보여줍니다.'],
     ['해지 (잔존)','상태가 «해지»이고 해지월이 그 기간인 고객사 — 해지율·해지 분석 화면과 같은 수. 괄호는 해지했지만 다른 서비스 계약이 남아 고객사로는 유지된 곳.'],
     ['종료(해지 외)','해지로 기록되지 않았는데 기간 말에 유효 계약이 없는 곳: 약정 만기 후 미연장, 서비스종료 등. 최근 기간에 잡히면 «만기 지났는데 처리 안 된 계약»일 수 있으니 명단을 확인해 주세요.'],
     ['CND 전환 고객','CND = Cloud NAC DeviceKeeper. 예전에 에스원으로 납품하던 제품이 단종되어 전부 <b>S1 Cloud NAC Basic</b>으로 교체된 고객사입니다. 과금은 에스원에 한 건으로 묶어 받아서(«에스원 통합과금» 행) 고객별 매출 행이 없지만, <b>LIVE 고객으로 항상 포함</b>합니다(기본). 옛 DeviceKeeper 계약의 해지만 매출시트 규칙대로 해지 건수에서 빠집니다. «매출시트 기준»(제외)은 통계 탭이 CND를 통째로 빼고 낸 숫자와 맞출 때만 쓰세요.'],
     ['지원사업','판매형태가 «정부 지원»(바우처)인 계약. 제외하면 분모·분자에서 모두 빠집니다.'],
     ['유입 경로','신규 고객사를 첫 계약의 판매형태·채널·사업영역·파트너·제품·산업군으로 나눈 표. 어디서 고객이 들어오는지 보는 용도입니다.']
   ],'화면의 모든 숫자는 «계약» 메뉴의 계약 데이터에서 계산합니다. LIVE 고객사 메뉴는 별도의 LIVE 명단 시트라 조금 다를 수 있고, 증감표 아래 «vs LIVE 메뉴» 대조표가 그 차이를 항목별로 보여줍니다.');
  h+='<div class="pr-card crpanel" style="margin-bottom:12px"><div class="crrow">'+
     crSeg('기간','unit',[['year','연도'],['half','반기'],['quarter','분기']],CR.unit)+
     crSeg('지원사업','sup',[['all','포함','지원사업(정부 지원) 고객을 포함해 셉니다'],['ex','제외','지원사업 고객을 빼고 셉니다'],['only','지원사업만','지원사업 고객만 봅니다']],CR.sup)+
     crSeg('CND 전환 고객','cnd',[['in','포함 (기본)','DeviceKeeper→S1 Basic 전환 고객(통합 과금)은 LIVE 고객이므로 항상 포함이 기본'],['ex','제외','매출시트 통계 탭과 맞출 때만']],CR.cnd?'in':'ex')+
     '<div class="crseg"><span>기준월</span><select id="cfUpto" title="이 달까지의 데이터로 계산합니다 (기본 = 최신 달)">'+(function(){ var o=''; for(var j=maxAll;j>=Math.max(0,maxAll-35);j--) o+='<option value="'+j+'"'+(j===crMaxJ()?' selected':'')+'>'+mk(j)+'</option>'; return o; })()+'</select></div>'+
     '</div><div class="crrow crfilters">'+G.filter(function(g){return !g.more;}).map(crChips).join('')+'</div></div>';
  /* 지금 보고 있는 기준을 말로 풀어 보여줌 */
  (function(){ var cndN=0; if(CR.cnd){ var u={}; ST.DATA.rows.forEach(function(r){ if(!r.parent && r.line==='S1' && String(r.saleType||'')==='CND' && r.startIdx!=null && r.startIdx>=0) u[r.cust]=1; }); cndN=Object.keys(u).length; }
     var fsel=[]; G.forEach(function(g){ var sel=CR.f[g.k]||[]; if(sel.length) fsel.push(g.l+' '+sel.map(function(v){ var o=g.opts.filter(function(x){return x[0]===v;})[0]; return o? o[1]:v; }).join('·')); });
     h+='<div class="crnow">지금 보는 기준 — <b>'+({year:'연도별',half:'반기별',quarter:'분기별'}[CR.unit])+'</b> · <b>'+mk(crMaxJ())+'</b>까지 · 회사 단위 · CND 전환 고객 <b>'+(CR.cnd? '포함 (LIVE 기준'+(cndN? ' · '+cndN+'곳':'')+')':'제외 (매출시트 기준)')+'</b> · 지원사업 <b>'+({all:'포함',ex:'제외',only:'만'}[CR.sup])+'</b>'+(fsel.length? ' · 필터: <b>'+esc(fsel.join(' / '))+'</b>':'')+
       '<span class="mini" style="color:var(--ink-2)"> — '+(CR.cnd? '매출시트 통계나 해지율 화면(CND 제외)과 비교하려면 «매출시트 기준»을 누르세요':'LIVE 고객사 메뉴·대시보드와 비교하려면 «LIVE 기준»을 누르세요')+'</span></div>'; })();
  /* ① 롤포워드 (2020년부터) */
  var from0=CR.from; CR.from=2020; P=crPeriods(); CR.from=from0;
  h+='<div class="pr-card" style="margin-bottom:12px"><h3>'+esc(crSummary())+' — 고객사 증감<small>고객사 단위 · 계약 유효 기준(해지 고객사는 해지월 말에 빠짐) · 지원사업 '+({all:'포함',ex:'제외',only:'만'}[CR.sup])+' · CND '+(CR.cnd?'포함':'제외')+'</small></h3>'+
     '<div style="overflow-x:auto"><table class="pr"><thead><tr><th>기간</th><th class="n">기초</th><th class="n" title="그 기간에 첫 계약을 시작한 고객사">+ 신규</th><th class="n" title="예전에 끊겼다가 다시 계약한 고객사 (첫 계약이 아님)">+ 복귀</th><th class="n" title="상태 «해지» · 해지월이 그 기간 (해지율 화면과 같은 수) · 괄호 = 그중 다른 서비스 계약·재계약이 남아 고객사로는 유지된 곳">− 해지 <span class="mini">(잔존)</span></th><th class="n" title="해지가 아닌데 기간 말에 유효 계약이 없는 고객사: 약정 만기 후 미연장 · 서비스종료 · CN전환 등">− 종료(해지 외)</th><th class="n">기말</th><th class="n">순증</th><th class="n">증가율</th></tr></thead><tbody>';
  var sumN=0,sumR=0,sumL=0,sumK=0,sumX=0;
  P.forEach(function(p){
    var b0=crActive(p.s-1,m), nw=crNew(p.s,p.e,m), rt=crRet(p.s,p.e,m), lo=crLost(p.s,p.e,m), kp=crLostKeep(p.s,p.e,m), xd=crEnded(p.s,p.e,m), e1=crActive(p.e,m);
    var nb=crN(b0), nn=crN(nw), nr=crN(rt), nl=crN(lo), nk=crN(kp), nx=crN(xd), ne=crN(e1), net=ne-nb, adj=ne-(nb+nn+nr-(nl-nk)-nx);
    sumN+=nn; sumR+=nr; sumL+=nl; sumK+=nk; sumX+=nx;
    h+='<tr><td><b>'+esc(p.l)+'</b></td><td class="n">'+crLink(b0,p.s-1,p.s-1,'','base',p.l+' 기초 ('+mk(p.s-1)+')','color:var(--ink-2);font-weight:600')+'</td>'+
       '<td class="n">'+crLink(nw,p.s,p.e,'','new',p.l+' 신규 고객사','color:var(--ok,#2e7d32);font-weight:700')+'</td>'+
       '<td class="n">'+crLink(rt,p.s,p.e,'','ret',p.l+' 복귀 고객사','color:var(--ok,#2e7d32)')+'</td>'+
       '<td class="n">'+crLink(lo,p.s,p.e,'','lost',p.l+' 해지')+(nk? ' <span class="mini">('+crLink(kp,p.s,p.e,'','keep',p.l+' 해지 후 잔존 (다른 계약 유지)','color:var(--muted)')+')</span>':'')+'</td>'+
       '<td class="n">'+crLink(xd,p.s,p.e,'','ended',p.l+' 종료(해지 외)','color:var(--muted)')+(adj? ' <span class="mini" title="집계 보정: 같은 기간에 신규·해지가 겹친 고객사 등">('+(adj>0?'+':'')+adj+')</span>':'')+'</td>'+
       '<td class="n">'+crLink(e1,p.e,p.e,'','base',p.l+' 기말 ('+mk(p.e)+')','color:var(--ink-2);font-weight:700')+'</td>'+
       '<td class="n"><b style="color:'+(net>=0?'var(--ok,#2e7d32)':'var(--critical)')+'">'+(net>0?'+':'')+net+'</b></td><td class="n">'+(nb? (net/nb*100).toFixed(1)+'%':'–')+'</td></tr>';
  });
  if(P.length){ var pf=P[0], pl=P[P.length-1], bF=crN(crActive(pf.s-1,m)), eL=crN(crActive(pl.e,m));
    h+='<tr style="background:var(--surface-2,rgba(0,0,0,.03))"><td><b>합계</b></td><td class="n">'+bF+'</td><td class="n" style="color:var(--ok,#2e7d32);font-weight:700">+'+sumN+'</td><td class="n" style="color:var(--ok,#2e7d32)">+'+sumR+'</td><td class="n" style="color:var(--critical);font-weight:700">−'+sumL+(sumK?' <span class="mini" style="color:var(--muted)">('+sumK+')</span>':'')+'</td><td class="n" style="color:var(--muted)">−'+sumX+'</td><td class="n"><b>'+eL+'</b></td><td class="n"><b>'+(eL-bF>0?'+':'')+(eL-bF)+'</b></td><td class="n">–</td></tr>'; }
  h+='</tbody></table></div>';
  h+='<p class="pr-note" style="margin:8px 0 0">기말 = 기초 + 신규 + 복귀 − (해지 − 잔존) − 종료(해지 외) · 신규 = 그 기간에 첫 계약을 시작한 고객사 · 해지 = 상태 «해지»(부속 계약 제외 · CND는 위 옵션대로) · 잔존 = 해지 계약이 있어도 다른 서비스 계약·재계약이 남아 고객사로는 유지된 곳 · 종료(해지 외) = 만기 후 미연장·서비스종료·CN전환처럼 해지로 기록되지 않고 끝난 곳 — 최근 기간에 잡히면 만기가 지났는데 연장·해지 처리가 안 된 계약일 수 있으니 명단을 확인하세요 · 숫자를 누르면 명단</p>';
  /* 현재 LIVE 와 대조 — 왜 다른지 항목별로 */
  if(ST.DATA.live&&ST.DATA.live.ok){
    var nowA=crActive(maxAll,m), nowN=crN(nowA);
    var lv=ST.DATA.live.rows.filter(function(x){ var sel=CR.f.line||[]; return !sel.length || sel.indexOf(x.line)>=0; });
    // 이름 매칭: 괄호 안 별칭(구. ○○ 등)도 같은 회사로 봄
    var ALIAS={}; (SB_RAW.customers||[]).forEach(function(c){ if(c.aliases&&c.aliases.length) ALIAS[c.name]=c.aliases; });
    function keys1(t){ var out=[], base=t.replace(/\([^)]*\)/g,''), m2; out.push(base); var re=/\(([^)]*)\)/g; while((m2=re.exec(t))) out.push(m2[1].replace(/^구\.?\s*/,'')); return out; }
    function keys(n){ var t=String(n||''), out=keys1(t); (ALIAS[t]||[]).forEach(function(a){ out=out.concat(keys1(String(a))); });   // 사명 변경 때 남긴 별칭도 같은 회사로
      return out.map(function(x){ return x.replace(/^\(?주\)?|주식회사|\(주\)|\s|_/g,'').toLowerCase(); }).filter(function(x){ return x.length>=2; }); }
    var actK={}; nowA.forEach(function(r){ keys(r.cust).forEach(function(k){ actK[k]=r; }); });
    var liveK={}; lv.forEach(function(x){ keys(x.cust).forEach(function(k){ liveK[k]=x; }); });
    var liveU={}; lv.forEach(function(x){ liveU[x.cust]=x; }); var ln=Object.keys(liveU).length;
    var cats={cnd:[],expired:[],ended:[],none:[],nostart:[],bad:[],recent:[],other:[]};
    Object.keys(liveU).forEach(function(c){
      if(keys(c).some(function(k){ return actK[k]; })) return;
      var rows=ST.DATA.rows.filter(function(r){ return !r.parent && keys(r.cust).some(function(k){ return keys(c).indexOf(k)>=0; }); });
      if(!rows.length){ cats.none.push(c); return; }
      if(!CR.cnd && rows.some(function(r){ return r.line==='S1' && (String(r.saleType||'')==='CND' || String(r.status||'')==='CN전환'); })){ cats.cnd.push(c); return; }
      if(rows.every(function(r){ return r.startIdx==null || r.startIdx<0; })){ cats.nostart.push(c+' ('+lline(rows[0].line)+(rows[0].endIdx>=0?' ~'+mk(rows[0].endIdx):'')+')'); return; }
      if(rows.some(function(r){ return r.endIdx!=null && r.endIdx>=0 && r.startIdx>=0 && r.endIdx<r.startIdx; })){ var bd=rows.filter(function(r){ return r.endIdx>=0 && r.endIdx<r.startIdx; })[0]; cats.bad.push(c+' ('+lline(bd.line)+' '+mk(bd.startIdx)+'~'+mk(bd.endIdx)+')'); return; }
      var last=rows.slice().sort(function(a,b){ return (b.endIdx||0)-(a.endIdx||0); })[0];
      if(/해지|종료/.test(String(last.status||''))) cats.ended.push(c+' ('+lline(last.line)+' '+last.status+' '+(last.endIdx!=null?mk(last.endIdx):'')+')');
      else cats.expired.push(c+' ('+lline(last.line)+' ~'+(last.endIdx!=null?mk(last.endIdx):'?')+')');
    });
    var seenA={}; nowA.forEach(function(r){ if(seenA[r.cust]) return; seenA[r.cust]=1; if(keys(r.cust).some(function(k){ return liveK[k]; })) return;
      if(r.startIdx!=null && r.startIdx>=maxAll-3) cats.recent.push(r.cust+' ('+lline(r.line)+' '+mk(r.startIdx)+'~)'); else cats.other.push(r.cust+' ('+lline(r.line)+' '+String(r.status||'')+' '+mk(r.startIdx)+'~'+(r.endIdx!=null?mk(r.endIdx):'')+')'); });
    function det(label,arr,sign,hint){ if(!arr.length) return ''; return '<tr><td>'+sign+'</td><td>'+label+(hint?' <span class="mini" style="color:var(--muted)">'+hint+'</span>':'')+'</td><td class="n"><b>'+arr.length+'</b></td><td><details><summary style="cursor:pointer;color:var(--s1-ink)">명단</summary><div class="mini" style="margin-top:4px;line-height:1.6">'+esc(arr.join(' · '))+'</div></details></td></tr>'; }
    var plus=cats.cnd.length+cats.expired.length+cats.ended.length+cats.none.length+cats.nostart.length+cats.bad.length, minus=cats.recent.length+cats.other.length;
    h+='<div style="margin-top:14px;padding-top:10px;border-top:1px dashed var(--ring)"><b>'+mk(maxAll)+' 기말 '+nowN+'곳 vs LIVE 메뉴 '+ln+'곳</b> <span class="mini" style="color:var(--muted)">('+nowN+' + '+plus+' − '+minus+' = '+(nowN+plus-minus)+(nowN+plus-minus===ln?' ✓':' · 나머지 '+Math.abs(ln-(nowN+plus-minus))+'곳은 사명 표기가 달라 양쪽 매칭이 어긋난 것')+') — 기말은 계약 데이터에서, LIVE 메뉴는 LIVE 명단 시트에서 나오므로 아래 항목만큼 차이가 납니다. 항목이 0이 되면 두 숫자가 같아집니다.</span>'+
       '<table class="pr" style="margin-top:6px"><thead><tr><th></th><th>왜 다른가</th><th class="n">곳</th><th>확인</th></tr></thead><tbody>'+
       det('LIVE 명단에 있는데 계약이 없음', cats.none, '+', '계약 미등록 또는 사명이 달라 못 찾음')+
       det('CND(DeviceKeeper→S1 Basic) 전환 고객', cats.cnd, '+', 'CND 제외 옵션이라 빠짐 — «LIVE 기준»으로 바꾸면 사라짐')+
       det('계약 예정 — 시작·종료월이 비어 있음', cats.nostart, '+', '시트에는 신규로 적혀 있지만 날짜가 없어 아직 시작 전으로 봄 · 시작하면 계약 화면에서 시작월 입력')+
       det('종료월이 시작월보다 앞선 계약', cats.bad, '+', '날짜 오류 — 계약 화면에서 수정')+
       det('계약 종료월이 지났는데 연장·해지 처리 안 됨', cats.expired, '+', '재약정이면 연장 등록, 끝났으면 해지로')+
       det('계약은 해지·서비스종료인데 LIVE 명단에 남아 있음', cats.ended, '+', 'LIVE 명단에서 빼야 함')+
       det('최근 4개월 안에 시작한 신규 — LIVE 명단 미등재', cats.recent, '−', 'LIVE 명단에 추가해야 함')+
       det('계약은 유효한데 LIVE 명단에 없음', cats.other, '−', '계약 상태·기간 또는 LIVE 명단 확인')+
       '</tbody></table></div>';
  }
  h+='</div>';
  /* ①-b 유입 경로 — 그 기간 첫 계약을 시작한 고객사를 첫 계약의 판매형태·채널·사업영역·파트너·제품으로 나눔 */
  (function(){
    var DIMS=[['sale','판매형태'],['ch','판매 채널'],['area','사업영역'],['ptn','파트너'],['line','제품'],['ind','산업군']];
    if(!CR.cfSrc) CR.cfSrc='sale';
    var g=G.filter(function(x){ return x.k===CR.cfSrc; })[0]||G.filter(function(x){return x.k==='sale';})[0];
    var per=P.map(function(p){ return {p:p, nw:crNew(p.s,p.e,m)}; });
    var val=function(r){ return cfVal(g,r); };
    var used={}; per.forEach(function(x){ x.nw.forEach(function(r){ used[val(r)]=(used[val(r)]||0)+1; }); });
    var lab={}; g.opts.forEach(function(o){ lab[o[0]]=o[1]; }); lab['에스원']='에스원 (CNE/CNB)'; lab['']='(미지정)';
    var cols=Object.keys(used).filter(function(v){ return v!==''; }).sort(function(a,b2){ return used[b2]-used[a]; }).map(function(v){ return [v, lab[v]||v]; });
    if(used['']) cols.push(['','(미지정)']);
    h+='<div class="pr-card" style="margin-bottom:12px"><h3>유입 경로 — 신규 고객사<small>그 기간에 첫 계약을 시작한 고객사를 첫 계약의 '+esc(g.l)+'로 나눔 · 칸을 누르면 명단</small></h3>'+
       '<div class="crrow" style="margin:6px 0 8px">'+crSeg('기준','cfSrc',DIMS,CR.cfSrc)+'</div>'+
       '<div style="overflow-x:auto"><table class="pr"><thead><tr><th>기간</th>'+cols.map(function(o){ return '<th class="n">'+esc(o[1])+'</th>'; }).join('')+'<th class="n" style="border-left:1px solid var(--ring)">신규 합계</th></tr></thead><tbody>';
    per.forEach(function(x){
      var byV={}; x.nw.forEach(function(r){ var v=val(r); (byV[v]=byV[v]||[]).push(r); });
      var tot=crN(x.nw);
      h+='<tr><td><b>'+esc(x.p.l)+'</b></td>'+cols.map(function(o){ var arr=byV[o[0]]||[], n=crN(arr); if(!n) return '<td class="n" style="color:var(--muted)">–</td>';
        return '<td class="n">'+crLink(arr,x.p.s,x.p.e,g.k+'='+o[0],'new',x.p.l+' 신규 · '+o[1],'color:var(--ok,#2e7d32);font-weight:700')+' <span class="mini" style="color:var(--muted)">'+(tot? Math.round(n/tot*100):0)+'%</span></td>'; }).join('')+
        '<td class="n" style="border-left:1px solid var(--ring)">'+crLink(x.nw,x.p.s,x.p.e,'','new',x.p.l+' 신규 고객사','font-weight:700;color:var(--ink-2)')+'</td></tr>';
    });
    var allNw=[]; per.forEach(function(x){ allNw=allNw.concat(x.nw); }); var byAll={}; allNw.forEach(function(r){ var v=val(r); (byAll[v]=byAll[v]||[]).push(r); });
    h+='<tr style="background:var(--surface-2,rgba(0,0,0,.03));font-weight:700"><td>합계</td>'+cols.map(function(o){ var n=crN(byAll[o[0]]||[]); return '<td class="n">'+(n||'–')+' <span class="mini" style="color:var(--muted)">'+(allNw.length? Math.round(n/allNw.length*100):0)+'%</span></td>'; }).join('')+'<td class="n" style="border-left:1px solid var(--ring)">'+crN(allNw)+'</td></tr>';
    var cndIn=0; allNw.forEach(function(r){ if(r.line==='S1' && String(r.saleType||'')==='CND') cndIn++; });
    h+='</tbody></table></div><p class="pr-note" style="margin:8px 0 0">신규 = 회사의 첫 원계약(부속 계약 제외) · 두 제품을 같은 달에 시작하면 먼저 등록된 계약 기준 · 판매 채널·파트너가 비어 있으면 (미지정) · 위의 지원사업·CND 옵션과 필터가 그대로 적용됩니다'+
       (CR.cnd? (cndIn? ' · <b>이 표에는 CND(DeviceKeeper→S1 Basic) 전환 고객 '+cndIn+'곳이 들어 있습니다</b> — 매출시트 통계와 맞추려면 위에서 «매출시트 기준»을 누르세요':'') : ' · <b>CND 전환 고객은 제외된 상태</b>입니다 — LIVE 고객사 수와 맞추려면 «LIVE 기준»을 누르세요')+'</p></div>';
  })();
  /* ② 제품별 기말 고객사 */
  if(lineG){
    var cols=lineG.opts.filter(function(o){ var sel=CR.f.line||[]; return !sel.length || sel.indexOf(o[0])>=0; });
    h+='<div class="pr-card" style="margin-bottom:12px"><h3>제품별 기말 고객사 <small>칸 = 기말 고객사 (순증) · 한 고객이 두 제품을 쓰면 제품마다 1곳 — 전체는 회사 단위라 제품 합보다 작을 수 있음</small></h3><div style="overflow-x:auto"><table class="pr"><thead><tr><th>기간</th>'+cols.map(function(o){return '<th class="n">'+esc(o[1])+'</th>';}).join('')+'<th class="n">전체(중복 제거)</th></tr></thead><tbody>';
    P.forEach(function(p){
      h+='<tr><td><b>'+esc(p.l)+'</b></td>'+cols.map(function(o){
        var mm=function(r){ return crMatch(r) && r.line===o[0]; };
        var e1=crActive(p.e,mm), b0=crActive(p.s-1,mm), ne=crN(e1), nb=crN(b0);
        if(!ne&&!nb) return '<td class="n" style="color:var(--muted)">–</td>';
        return '<td class="n">'+crLink(e1,p.e,p.e,'line='+o[0],'base',o[1]+' · '+p.l+' 기말','color:var(--ink-2);font-weight:700')+' <span class="mini" style="color:'+(ne-nb>=0?'var(--ok,#2e7d32)':'var(--critical)')+'">('+(ne-nb>0?'+':'')+(ne-nb)+')</span></td>';
      }).join('')+'<td class="n"><b>'+crN(crActive(p.e,m))+'</b></td></tr>';
    });
    h+='</tbody></table></div></div>';
  }
  host.innerHTML=h;
  host.querySelectorAll('button[data-cfp]').forEach(function(b){ b.onclick=function(){ CR.cfCnd=(b.dataset.cfp==='live'); CR.sup='all'; renderCustFlow(); }; });
  helpWire(host);
  host.querySelectorAll('.crseg button[data-g]').forEach(function(b){ b.onclick=function(){ var g=b.dataset.g, v=b.dataset.v;
    if(g==='unit') CR.unit=v; else if(g==='cnd') CR.cfCnd=(v==='in'); else if(g==='sup') CR.sup=v; else if(g==='cfSrc') CR.cfSrc=v; renderCustFlow(); }; });
  host.querySelectorAll('button.chip[data-fg]').forEach(function(b){ b.onclick=function(){ var k=b.dataset.fg, v=b.dataset.fv, sel=CR.f[k]=CR.f[k]||[]; var i=sel.indexOf(v); if(i>=0) sel.splice(i,1); else sel.push(v); renderCustFlow(); }; });
  host.querySelectorAll('button.chip[data-fclr]').forEach(function(b){ b.onclick=function(){ CR.f[b.dataset.fclr]=[]; renderCustFlow(); }; });
  var up=$('#cfUpto'); if(up) up.onchange=function(){ CR.upto=+up.value; renderCustFlow(); };
  host.querySelectorAll('a.crk').forEach(function(a){ a.onclick=function(ev){ ev.preventDefault(); crOpen(a.dataset); }; });
}

/* ══════════ 합계 타일 → 근거 내역 (공통) ══════════
   화면의 요약 타일(kpi / pr-ob)에 data-kx="키" 를 붙이고 kxWire(host, {키: 함수}) 로 연결하면
   타일이 클릭 가능해지고(커서·툴팁), 누르면 그 숫자를 만든 행이 팝업으로 뜹니다. */
/* «이 화면 읽는 법» — 처음 접속한 사람도 이해할 수 있게 용어와 기준을 풀어 쓴 상자. 펼침 상태는 브라우저에 기억됩니다 */
export function helpBox(key, title, items, note){
  var open=false; try{ open=localStorage.getItem('svc_help_'+key)==='1'; }catch(e){}
  return '<details class="help" data-help="'+esc(key)+'"'+(open?' open':'')+'><summary>❔ '+esc(title)+'</summary><div class="hb">'+
    items.map(function(it){ return '<b>'+esc(it[0])+'</b><span>'+it[1]+'</span>'; }).join('')+(note? '<p>'+note+'</p>':'')+'</div></details>';
}
export function helpWire(host){ host.querySelectorAll('details.help[data-help]').forEach(function(d){ d.ontoggle=function(){ try{ localStorage.setItem('svc_help_'+d.dataset.help, d.open?'1':'0'); }catch(e){} }; }); }
export function kxWire(host, map){
  if(!host) return;
  host.querySelectorAll('[data-kx]').forEach(function(el0){
    var k=el0.dataset.kx; if(!map[k]) return;
    el0.style.cursor='pointer'; el0.setAttribute('role','button'); el0.tabIndex=0;
    if(!/클릭/.test(el0.title||'')) el0.title=(el0.title? el0.title+' · ':'')+'클릭: 이 숫자의 근거 내역';
    el0.onclick=function(ev){ if(ev.target && ev.target.isContentEditable) return; map[k](); };
    el0.onkeydown=function(ev){ if(ev.key==='Enter'){ ev.preventDefault(); map[k](); } };
    a11yTileRole(el0);   /* ㊿+141 */
  });
}
export var KX_H6=[{l:'고객사'},{l:'서비스'},{l:'채널'},{l:'상태'},{l:'시작월'},{l:'종료월'}];
export function kxBase(r){ return [esc(r.cust), esc(lline(r.line)), esc(chOf(r)), esc(r.status||'활성')+(r.renew?' <span class="ubadge sm">연장 '+r.renew+'회</span>':''), mk(r.startIdx)||'', r.endIdx!=null? mk(r.endIdx):'']; }
/* 특정 달에 인식 금액이 있는 계약 목록 (MRR 타일) */
export function kxMrr(list, j, title, cap){
  var rows=[], tot=0;
  list.forEach(function(k){ var r=ST.DATA.rows[k], a=ST.MAT[k][j]||0; if(!a) return; tot+=a; rows.push({_cust:r.cust, c:kxBase(r).concat([r.parent?'부속':'', won(a)]), s:a}); });
  rows.sort(function(x,y){ return y.s-x.s; });
  kpiTable(title+' — '+won(tot)+'천원', (cap||'')+' · 계약 '+rows.length+'건 · '+mk(j)+' 월 매출표에 금액이 있는 계약 전부(부속 포함) · 행을 누르면 계약 화면', KX_H6.concat([{l:'구분'},{l:mk(j)+' 금액(천원)',n:true}]), rows, title);
}
/* 고객사 단위로 합산한 월 금액 (고객사당 평균·활성 고객사 타일) */
export function kxCustMrr(list, j, title, cap){
  var m={}; list.forEach(function(k){ var r=ST.DATA.rows[k], a=ST.MAT[k][j]||0; if(!a) return; var o=(m[r.cust]=m[r.cust]||{a:0,n:0,ln:{},ch:chOf(r)}); o.a+=a; o.n++; o.ln[lline(r.line)]=1; });
  var rows=Object.keys(m).map(function(c){ var o=m[c]; return {_cust:c, c:[esc(c), esc(Object.keys(o.ln).join(' + ')), esc(o.ch), o.n, won(o.a)], s:o.a}; }).sort(function(x,y){ return y.s-x.s; });
  var tot=rows.reduce(function(a,x){ return a+x.s; },0);
  kpiTable(title+' — '+rows.length+'곳 · '+won(tot)+'천원', (cap||'')+' · '+mk(j)+' 인식 금액이 있는 고객사(계약 여러 건은 합산) · 행을 누르면 계약 화면', [{l:'고객사'},{l:'서비스'},{l:'채널'},{l:'계약 수',n:true},{l:'월 금액(천원)',n:true}], rows, title);
}
/* 해지 분석 행(churnRows 결과) 목록 */
export function kxChurn(items, title, cap, byAmt){
  var rows=items.slice().sort(function(a,b){ return byAmt? (b.amt-a.amt) : (b.e-a.e || b.amt-a.amt); }).map(function(x){
    return {_cust:x.cust, c:[esc(x.cust), esc(x.line), esc(x.channel), esc(x.ctype), x.ym, esc(x.reason), esc(x.note), x.sup?'지원사업':'일반', won(x.amt)]}; });
  var tot=items.reduce(function(a,x){ return a+x.amt; },0), cu={}; items.forEach(function(x){ cu[x.cust]=1; });
  kpiTable(title, (cap||'')+' · '+items.length+'건 · 고객사 '+Object.keys(cu).length+'곳 · 직전 월액 합 '+won(tot)+'천원 (연환산 '+won(tot*12)+'천원) · 행을 누르면 계약 화면',
    [{l:'고객사'},{l:'서비스'},{l:'채널'},{l:'구분'},{l:'해지월'},{l:'사유'},{l:'비고'},{l:'지원'},{l:'직전 월액(천원)',n:true}], rows, title);
}
/* LIVE 명단 행 목록 */
export function kxLive(lv, title, cap){
  var rows=lv.slice().sort(function(a,b){ return String(a.cust).localeCompare(String(b.cust),'ko'); }).map(function(x){
    return {_cust:x.cust, c:[esc(x.cust), esc(lline(x.line)), esc(x.prod||''), esc(x.ind||''), x.nodes!=null? Number(x.nodes).toLocaleString('ko-KR'):'', esc(String(x.start||'').slice(0,7)), esc(String(x.end||'').slice(0,7)), (x.dup?'중복표시':'')]}; });
  var u={}; lv.forEach(function(x){ u[x.cust]=1; });
  kpiTable(title, (cap||'')+' · '+lv.length+'건 · 고객사 '+Object.keys(u).length+'곳 · LIVE 명단 시트 기준 · 행을 누르면 LIVE 화면', [{l:'고객사'},{l:'서비스'},{l:'제품'},{l:'산업군'},{l:'노드',n:true},{l:'시작'},{l:'종료'},{l:''}], rows, title, 'live');
}
/* OI 건 목록 */
export function kxOi(items, title, cap){
  var rows=items.slice().sort(function(a,b){ return (Number(b.expect_amount)||0)-(Number(a.expect_amount)||0); }).map(function(r){
    var ea=Number(r.expect_amount)||0, wp=Number(r.win_prob)||0;
    return {_cust:r.customer, c:[esc(r.customer||''), esc(r.deal_name||''), esc(r.stage||''), wp+'%', esc(String(r.expect_month||'').slice(0,7)), won(ea), won(ea*wp/100), esc(r.owner||''), esc(String(r.next_date||'').slice(0,10))]}; });
  var sum=items.reduce(function(a,r){ return a+(Number(r.expect_amount)||0); },0), w=items.reduce(function(a,r){ return a+(Number(r.expect_amount)||0)*(Number(r.win_prob)||0)/100; },0);
  kpiTable(title, (cap||'')+' · '+items.length+'건 · 예상 합 '+won(sum)+'천원 · 기대(가중) '+won(w)+'천원 · VAT 별도 · 행을 누르면 OI 화면',
    [{l:'고객사'},{l:'사업명'},{l:'단계'},{l:'수주가능성',n:true},{l:'계약예상'},{l:'예상금액(천원)',n:true},{l:'기대액(천원)',n:true},{l:'담당'},{l:'다음 일정'}], rows, title, 'oi');
}
/* 단순 표(월별 시계열 등) */
export function kxSimple(title, cap, head, rows2){
  kpiTable(title, cap, head.map(function(h){ return typeof h==='string'? {l:h}:h; }), rows2.map(function(r){ return {c:r}; }), title);
}

export function renderChurn(){
  var host=$('#churnBody');
  if(!ST.DATA||!ST.DATA.rows||!ST.DATA.rows.length){ host.innerHTML='<div class="cap" style="padding:40px;text-align:center">데이터를 불러오는 중…</div>'; return; }
  var maxJ=Math.min(ST.DATA.nowIdx>=0? ST.DATA.nowIdx : ST.M-1, ST.M-1);
  if(CHURN.t==null||CHURN.t>maxJ) CHURN.t=maxJ;
  if(CHURN.f==null){ var jan=dIdx(mk(maxJ).slice(0,4)+'-01'); CHURN.f=(jan!=null&&jan>=0)? jan:0; }
  if(CHURN.f>CHURN.t) CHURN.f=CHURN.t;
  var all=churnRows();
  var inRAll=all.filter(function(x){ return x.e>=CHURN.f && x.e<=CHURN.t; });
  var renewN=inRAll.filter(function(x){ return x.renew; }).length;
  // 재약정(계약 승계)은 실제 이탈이 아니므로 기본 제외
  var inR0=CHURN.inclRenew? inRAll : inRAll.filter(function(x){ return !x.renew; });
  var qw=String(CHURN.q||'').toLowerCase().split(/\s+/).filter(Boolean);
  function passQ(x){
    if(!qw.length) return true;
    var hay=(x.cust+' '+x.line+' '+x.channel+' '+x.ctype+' '+x.ym+' '+x.reason+' '+x.note).toLowerCase();
    return qw.every(function(w){ return hay.indexOf(w)>=0; });
  }
  function chPass(x, skipK){                                    // 열별 필터 통과 여부
    for(var k in CHURN.fil){
      if(k===skipK) continue;
      var sel=CHURN.fil[k]; if(!sel||!sel.length) continue;
      if(sel.indexOf(chVal(x,k))<0) return false;
    }
    return true;
  }
  // 사유별 집계 = 검색 + (사유 외) 열 필터 반영 — 사유 선택 자체는 빼야 다른 사유도 보임
  var inR=inR0.filter(function(x){ return passQ(x) && chPass(x,'reason'); });
  var list=inR0.filter(function(x){ return passQ(x) && chPass(x); });
  var SK={cust:'cust',line:'line',channel:'channel',ctype:'ctype',ym:'e',reason:'reason',amt:'amt',note:'note'};
  if(CHURN.sk && SK[CHURN.sk]){
    var kk=SK[CHURN.sk];
    list.sort(function(a,b){
      var va=a[kk], vb=b[kk];
      if(typeof va==='number'&&typeof vb==='number') return (va-vb)*CHURN.sd;
      return String(va).localeCompare(String(vb),'ko')*CHURN.sd;
    });
  } else list.sort(function(a,b){ return b.e-a.e || b.amt-a.amt; });
  var by={}; inR.forEach(function(x){ var o=(by[x.reason]=by[x.reason]||{n:0,amt:0}); o.n++; o.amt+=x.amt; });
  var keys=Object.keys(by).sort(function(a,b){ return by[b].n-by[a].n; });
  var totN=inR.length, totA=0, custN={};
  inR.forEach(function(x){ totA+=x.amt; custN[x.cust]=1; });
  var inSt='height:34px;border:1px solid var(--ring);border-radius:9px;padding:0 10px;font:inherit;background:var(--surface)';
  function mopt(sel){ var s2=''; for(var i2=maxJ;i2>=0;i2--) s2+='<option value="'+i2+'"'+(i2===sel?' selected':'')+'>'+mk(i2)+'</option>'; return s2; }
  function kpi(l,v,s,kx){ return '<div class="pr-ob"'+(kx?' data-kx="'+kx+'"':'')+'><div class="l">'+l+'</div><div class="v">'+v+'</div>'+(s?'<div class="pr-note">'+s+'</div>':'')+'</div>'; }
  var h='<div class="pr-card" style="margin-bottom:14px"><h3>📉 해지 분석 <span class="ubadge sm">₩ 금액 단위 = 천원</span>'+
    '<small>해지·서비스 종료 계약 기준 · 해지월 = 마지막 매출월(또는 계약 종료월)</small></h3>'+
    '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:8px 0 0">기간 '+
    '<select id="chF" aria-label="시작 월" style="'+inSt+'">'+mopt(CHURN.f)+'</select> ~ '+
    '<select id="chT" aria-label="끝 월" style="'+inSt+'">'+mopt(CHURN.t)+'</select>'+
    '<button class="pill" id="chY" style="height:34px">올해</button>'+
    '<button class="pill ghost" id="chY1" style="height:34px">작년</button>'+
    '<button class="pill ghost" id="chAll" style="height:34px">전체 기간</button>'+
    '</div>'+
    '<p class="pr-note" style="margin:8px 0 0">해지 = 상태 «해지» 인 원계약 (매출시트의 해지년월 기입 건과 동일 · 부속 계약 · S1 CND 제외) · 해지월 = 종료월 · 지원사업 = 판매형태 «정부 지원»</p></div>';
  var supN=inR.filter(function(x){ return x.sup; }).length;
  h+=helpBox('churn','이 화면 읽는 법 (처음 보시는 분께)',[
     ['해지','상태가 «해지»인 원계약 — 매출시트에 해지년월이 적힌 건과 같습니다. 부속 계약(라이선스·센서 추가)은 세지 않고, 옛 CND(DeviceKeeper) 계약의 해지도 매출시트 규칙대로 세지 않습니다. 전환 고객 자체는 LIVE 고객으로 분모에 들어갑니다.'],
     ['해지월','종료월 = 마지막으로 매출이 잡힌 달. «이탈 월액»은 그 달의 월 매출입니다.'],
     ['지원사업','판매형태가 «정부 지원»인 계약. 바우처 만기로 끝난 해지라 일반 해지와 성격이 다릅니다.'],
     ['제품별 해지율','그 제품의 해지 고객사 ÷ 기간 시작 직전 달 활성 고객사(계약 유효). 해지율 화면의 «포탈 기준»과 같은 숫자입니다.'],
     ['사유','계약에 적힌 해지 사유 그대로. «고객변심/고객사정»과 «고객 변심»처럼 표기가 갈린 것은 같은 사유입니다.']
   ],'요약 타일·제품 칩·사유 행·리스트 열 제목의 ▼ 모두 눌러서 좁혀 볼 수 있고, 타일을 누르면 그 숫자를 만든 명단이 열립니다.');
  h+='<div class="pr-card" style="margin-bottom:14px"><h3>'+mk(CHURN.f)+' ~ '+mk(CHURN.t)+' 요약 <span class="ubadge sm">₩ 천원</span></h3>'+
    '<div class="pr-out" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">'+
    kpi('해지', totN+'건', '지원사업 <a href="#" data-kxs="sup" style="font-weight:700">'+supN+'건</a> · 그 외 <a href="#" data-kxs="org" style="font-weight:700">'+(totN-supN)+'건</a>','ch_all')+
    kpi('고객사', Object.keys(custN).length+'곳','','ch_cust')+
    kpi('이탈 월액 합',won(totA)+'천원','해지 직전 월 매출 기준','ch_amt')+
    kpi('연환산 손실',won(totA*12)+'천원','ARR 감소분','ch_amt')+
    '</div></div>';
  /* ── 제품별 ── 기간 시작 직전 달 활성 고객사(계약 유효 · 부속·통합과금 제외 · CN전환 고객 포함)를 분모로 제품별 해지율까지 */
  var inRL=inR0.filter(function(x){ return passQ(x) && chPass(x,'line'); });     // 제품 선택 자체는 빼야 다른 제품도 보임
  var lineOrder=ST.DATA.lines.map(function(l){ return lline(l.label); });
  var byL={}; inRL.forEach(function(x){ var o=(byL[x.line]=byL[x.line]||{n:0,amt:0,sup:0,cu:{},rs:{}}); o.n++; o.amt+=x.amt; if(x.sup) o.sup++; o.cu[x.cust]=1; o.rs[x.reason]=(o.rs[x.reason]||0)+1; });
  function lineBase(lbl, t){ var u={}; ST.DATA.rows.forEach(function(r){ if(r.parent||r.noCount||String(r.saleType||'')==='H/W'||lline(r.line)!==lbl||String(r.status||'')==='통합과금') return;
      if(r.startIdx==null||r.startIdx<0||r.startIdx>t) return; var e=r.endIdx!=null? r.endIdx : r._l; if(e!=null&&e>=0&&(e<t||(e===t&&String(r.status||'')==='해지'))) return; u[r.cust]=1; }); return Object.keys(u).length; }
  var lKeys=Object.keys(byL).sort(function(a,b2){ var ia=lineOrder.indexOf(a), ib=lineOrder.indexOf(b2); return (ia<0?99:ia)-(ib<0?99:ib); });
  var lTot=inRL.length, lSel=(CHURN.fil.line||[]);
  h+='<div class="pr-card" style="margin-bottom:14px"><h3>제품별 해지 <small>행을 클릭하면 아래 사유·리스트가 그 제품으로 좁혀집니다 · 해지율 분모 = '+mk(Math.max(CHURN.f-1,0))+' 활성 고객사(계약 유효)</small></h3>'+
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 10px">'+
      '<button class="chip" data-ln="" aria-pressed="'+(!lSel.length)+'">전체 '+lTot+'</button>'+
      lKeys.map(function(k2){ return '<button class="chip" data-ln="'+esc(k2)+'" aria-pressed="'+(lSel.indexOf(k2)>=0)+'">'+esc(k2)+' '+byL[k2].n+'</button>'; }).join('')+
      '<span class="mini" style="align-self:center;color:var(--muted)">여러 개 선택 가능 · 다시 누르면 해제'+(lSel.length>1? ' · 선택 '+lSel.length+'개 합산은 아래 리스트·사유 표에 반영':'')+'</span></div>'+
    '<div style="overflow-x:auto"><table class="pr" id="chLine"><thead><tr><th>제품</th><th class="n">해지 건수</th><th class="n">비중</th><th class="n">고객사</th><th class="n">지원사업</th><th class="n">시작 활성</th><th class="n">해지율</th><th class="n">월액 합(천원)</th><th class="n">연환산(천원)</th><th>주요 사유</th></tr></thead><tbody>'+
    (lKeys.map(function(k2){
      var o=byL[k2], on=(lSel.indexOf(k2)>=0), cu=Object.keys(o.cu).length, base=lineBase(k2, CHURN.f-1);
      var top=Object.keys(o.rs).sort(function(a,b2){ return o.rs[b2]-o.rs[a]; }).slice(0,3).map(function(r2){ return r2+' '+o.rs[r2]; }).join(' · ');
      return '<tr data-ln="'+esc(k2)+'" style="cursor:pointer'+(on?';background:var(--brand-t);font-weight:700':'')+'"><td>'+esc(k2)+(on?' ✓':'')+'</td><td class="n">'+o.n+'</td><td class="n">'+(lTot?Math.round(o.n/lTot*100):0)+'%</td><td class="n">'+cu+'</td><td class="n">'+(o.sup||'–')+'</td>'+
        '<td class="n">'+(base||'–')+'</td><td class="n">'+(base? (cu/base*100).toFixed(1)+'%':'–')+'</td><td class="n">'+Math.round(o.amt/1000).toLocaleString('ko-KR')+'</td><td class="n">'+Math.round(o.amt*12/1000).toLocaleString('ko-KR')+'</td><td class="mini">'+esc(top)+'</td></tr>';
    }).join('') || '<tr><td colspan="10" class="cap">해당 기간 해지가 없습니다</td></tr>')+
    (lSel.length>1? (function(){ var sk=lKeys.filter(function(k2){ return lSel.indexOf(k2)>=0; }), sr=inRL.filter(function(x){ return lSel.indexOf(x.line)>=0; }), cuS={}; sr.forEach(function(x){ cuS[x.cust]=1; });
        var cuN=Object.keys(cuS).length, bS=sk.reduce(function(a,k2){ return a+lineBase(k2,CHURN.f-1); },0), supS=sr.filter(function(x){return x.sup;}).length, amtS=sr.reduce(function(a,x){return a+x.amt;},0);
        return '<tr style="background:var(--brand-t);font-weight:700"><td>선택 '+sk.length+'개 소계</td><td class="n">'+sr.length+'</td><td class="n">'+(lTot?Math.round(sr.length/lTot*100):0)+'%</td><td class="n">'+cuN+'</td><td class="n">'+(supS||'–')+'</td><td class="n">'+(bS||'–')+'</td><td class="n">'+(bS?(cuN/bS*100).toFixed(1)+'%':'–')+'</td><td class="n">'+Math.round(amtS/1000).toLocaleString('ko-KR')+'</td><td class="n">'+Math.round(amtS*12/1000).toLocaleString('ko-KR')+'</td><td class="mini">'+esc(sk.join(' + '))+'</td></tr>'; })() : '')+
    (lKeys.length>1? (function(){ var cuAll={}; inRL.forEach(function(x){ cuAll[x.cust]=1; }); var cuN=Object.keys(cuAll).length, bAll=lKeys.reduce(function(a,k2){ return a+lineBase(k2,CHURN.f-1); },0), supAll=inRL.filter(function(x){return x.sup;}).length, amtAll=inRL.reduce(function(a,x){return a+x.amt;},0);
        return '<tr style="background:var(--surface-2,rgba(0,0,0,.03))"><td><b>합계</b></td><td class="n"><b>'+lTot+'</b></td><td class="n">100%</td><td class="n">'+cuN+'</td><td class="n">'+(supAll||'–')+'</td><td class="n">'+(bAll||'–')+'</td><td class="n">'+(bAll?(cuN/bAll*100).toFixed(1)+'%':'–')+'</td><td class="n">'+Math.round(amtAll/1000).toLocaleString('ko-KR')+'</td><td class="n">'+Math.round(amtAll*12/1000).toLocaleString('ko-KR')+'</td><td class="mini">시작 활성 합은 제품별 합(두 제품 고객은 2번)</td></tr>'; })() : '')+
    '</tbody></table></div>';
  /* 사유 × 제품 매트릭스 */
  if(lKeys.length>1){
    var rsAll={}; inRL.forEach(function(x){ rsAll[x.reason]=(rsAll[x.reason]||0)+1; });
    var rsKeys=Object.keys(rsAll).sort(function(a,b2){ return rsAll[b2]-rsAll[a]; });
    h+='<details style="margin-top:10px"><summary style="cursor:pointer;color:var(--s1-ink);font-size:12.5px">사유 × 제품 표 펼치기</summary><div style="overflow-x:auto;margin-top:6px"><table class="pr"><thead><tr><th>해지 사유</th>'+lKeys.map(function(k2){ return '<th class="n">'+esc(k2)+'</th>'; }).join('')+'<th class="n">합계</th></tr></thead><tbody>'+
      rsKeys.map(function(r2){ return '<tr><td>'+esc(r2)+'</td>'+lKeys.map(function(k2){ var v=byL[k2].rs[r2]||0; return '<td class="n"'+(v?'':' style="color:var(--muted)"')+'>'+(v||'–')+'</td>'; }).join('')+'<td class="n"><b>'+rsAll[r2]+'</b></td></tr>'; }).join('')+
      '</tbody></table></div></details>';
  }
  h+='</div>';
  h+='<div class="pr-card" style="margin-bottom:14px"><h3>사유별 집계 <small>행을 클릭하면 아래 리스트가 그 사유로 좁혀집니다</small></h3>'+
    '<div style="overflow-x:auto"><table class="pr" id="chAgg"><thead><tr><th>해지 사유</th><th class="n">건수</th><th class="n">비중</th><th class="n">월액 합(천원)</th><th class="n">연환산(천원)</th></tr></thead><tbody>'+
    (keys.map(function(k2){
      var o=by[k2], on=!!(CHURN.fil.reason && CHURN.fil.reason.length===1 && CHURN.fil.reason[0]===k2);
      return '<tr data-rs="'+esc(k2)+'" style="cursor:pointer'+(on?';background:var(--brand-t);font-weight:700':'')+'">'+
        '<td>'+esc(k2)+(on?' ✓':'')+'</td><td class="n">'+o.n+'</td><td class="n">'+(totN?Math.round(o.n/totN*100):0)+'%</td>'+
        '<td class="n">'+Math.round(o.amt/1000).toLocaleString('ko-KR')+'</td><td class="n">'+Math.round(o.amt*12/1000).toLocaleString('ko-KR')+'</td></tr>';
    }).join('') || '<tr><td colspan="5" class="cap">해당 기간 해지가 없습니다</td></tr>')+
    '</tbody></table></div>'+
    ((CHURN.fil.reason&&CHURN.fil.reason.length)?'<p class="pr-note" style="margin-top:6px"><button class="pill" id="chRsClr" style="height:24px;padding:0 9px;font-size:11px">✕ 사유 필터 해제 ('+esc(CHURN.fil.reason.join(', '))+')</button></p>':'')+'</div>';
  var nFil=(CHURN.q?1:0); for(var fk in CHURN.fil){ if(CHURN.fil[fk]&&CHURN.fil[fk].length) nFil++; }
  var sArrow=function(k2){ return CHURN.sk===k2? (CHURN.sd>0?' ▲':' ▼') : ''; };
  var cols=CH_COLS;
  h+='<div class="pr-card"><h3>해지 기업 리스트 <small>'+list.length+'건'+(CHURN.sk?'':' · 해지월 최신순')+'</small></h3>'+
    '<div class="dbar" style="margin:6px 0 10px">'+
      '<input type="search" id="chQ" placeholder="검색 — 고객사·사유·비고 등 (여러 단어)" value="'+esc(CHURN.q||'')+'">'+
      '<button class="pill ghost" id="chXls" title="현재 기간·필터가 적용된 목록을 엑셀 파일로 저장">⬇ 엑셀</button>'+
      (nFil? '<button class="pill ghost" id="chFclr" style="border-color:var(--critical);color:var(--critical)">✕ 필터 해제 ('+nFil+')</button>':'')+
      '<span class="mini" id="chXmsg"></span>'+
      '<span class="spacer"></span><span class="mini">열 제목의 ▼ 로 값 골라 보기 · '+list.length+'건 / 기간 내 '+inR0.length+'건</span>'+
    '</div>'+
    '<div style="overflow-x:auto"><table class="pr" id="chList"><thead><tr>'+
    cols.map(function(c){
      var on=!!(CHURN.fil[c[0]] && CHURN.fil[c[0]].length);
      return '<th'+(c[2]?' class="n"':'')+'><div class="thw">'+
        '<span data-sk="'+c[0]+'" style="cursor:pointer" title="클릭: 정렬">'+c[1]+sArrow(c[0])+'</span>'+
        '<button type="button" class="fbtn'+(on?' on':'')+'" data-fk="'+c[0]+'" title="'+(on?'필터 적용 중 ('+CHURN.fil[c[0]].length+'개 값) — 클릭해서 바꾸기':'값 골라 보기')+'">▼</button>'+
        '</div></th>';
    }).join('')+
    '</tr></thead><tbody>'+
    (list.map(function(x){
      return '<tr'+(x.renew?' class="row-dim"':'')+'><td>'+esc(x.cust)+'</td><td>'+esc(x.line)+'</td><td>'+esc(x.channel)+'</td><td>'+esc(x.ctype)+'</td>'+
        '<td>'+x.ym+'</td><td>'+esc(x.reason)+'</td><td class="n">'+Math.round(x.amt/1000).toLocaleString('ko-KR')+'</td><td>'+esc(x.note)+'</td>'+
        '<td>'+(x.sup?'<span style="color:var(--muted)">지원사업</span>':'일반')+'</td></tr>';
    }).join('') || '<tr><td colspan="9" class="cap">해당 조건의 해지 기업이 없습니다</td></tr>')+
    '</tbody></table></div></div>';
  host.innerHTML=h; helpWire(host);
  var f=$('#chF'), t2=$('#chT');
  if(f) f.onchange=function(){ CHURN.f=+f.value; if(CHURN.f>CHURN.t){CHURN.t=CHURN.f;} renderChurn(); };
  if(t2) t2.onchange=function(){ CHURN.t=+t2.value; if(CHURN.t<CHURN.f){CHURN.f=CHURN.t;} renderChurn(); };
  function setRange(f2,t3){ CHURN.f=Math.max(0,f2); CHURN.t=Math.min(maxJ,t3); CHURN.fil={}; renderChurn(); }
  var y0=+mk(maxJ).slice(0,4);
  var bY=$('#chY'); if(bY) bY.onclick=function(){ setRange(dIdx(y0+'-01'), maxJ); };
  var bY1=$('#chY1'); if(bY1) bY1.onclick=function(){ setRange(dIdx((y0-1)+'-01'), dIdx((y0-1)+'-12')); };
  var bA=$('#chAll'); if(bA) bA.onclick=function(){ setRange(0, maxJ); };
  var rw=$('#chRenew'); if(rw) rw.onchange=function(){ CHURN.inclRenew=rw.checked; renderChurn(); };
  document.querySelectorAll('#chAgg tbody tr[data-rs]').forEach(function(row){
    row.onclick=function(){
      var v=row.dataset.rs, cur=CHURN.fil.reason;
      if(cur && cur.length===1 && cur[0]===v) delete CHURN.fil.reason; else CHURN.fil.reason=[v];
      renderChurn();
    };
  });
  var rc=$('#chRsClr'); if(rc) rc.onclick=function(){ delete CHURN.fil.reason; renderChurn(); };
  (function(){ var per=mk(CHURN.f)+'~'+mk(CHURN.t), capC='해지 분석 '+per+' · 현재 검색·열 필터 적용';
    kxWire(host, {
      ch_all:function(){ kxChurn(inR, per+' 해지 '+inR.length+'건', capC, false); },
      ch_cust:function(){ var seen={}, one=inR.filter(function(x){ if(seen[x.cust]) return false; seen[x.cust]=1; return true; }); kxChurn(one, per+' 해지 고객사 '+one.length+'곳', capC+' · 고객사마다 1행', false); },
      ch_amt:function(){ kxChurn(inR, per+' 이탈 월액 — 금액순', capC+' · 해지 직전 월 매출 기준', true); }
    });
    host.querySelectorAll('a[data-kxs]').forEach(function(a){ a.onclick=function(ev){ ev.preventDefault(); ev.stopPropagation(); var sup=a.dataset.kxs==='sup'; var sub=inR.filter(function(x){ return !!x.sup===sup; }); kxChurn(sub, per+' 해지 — '+(sup?'지원사업':'지원사업 외')+' '+sub.length+'건', capC, false); }; });
  })();
  document.querySelectorAll('#chLine tbody tr[data-ln], #churnBody button.chip[data-ln]').forEach(function(el3){
    el3.onclick=function(){
      var v=el3.dataset.ln, cur=(CHURN.fil.line||[]).slice();
      if(!v) delete CHURN.fil.line;                                   // «전체» → 해제
      else { var ix=cur.indexOf(v); if(ix>=0) cur.splice(ix,1); else cur.push(v); if(cur.length) CHURN.fil.line=cur; else delete CHURN.fil.line; }
      renderChurn();
    };
  });
  function chExport(){
    var msg=$('#chXmsg'); if(msg) msg.textContent='엑셀 생성 중…';
    var fnx=[]; for(var fk2 in CHURN.fil){ var sv=CHURN.fil[fk2]; if(sv&&sv.length&&sv.length<=2) fnx.push(sv.join('·')); }
    var fn='해지분석_'+mk(CHURN.f)+'~'+mk(CHURN.t)+(fnx.length?'_'+fnx.join('_'):'');
    xlsxBook(fn, [
      {name:'제품별', head:['제품','해지 건수','고객사','지원사업','시작 활성','해지율(%)','월액 합(천원)','연환산(천원)'],
       rows:lKeys.map(function(k2){ var o4=byL[k2], cu4=Object.keys(o4.cu).length, b4=lineBase(k2,CHURN.f-1); return [k2,o4.n,cu4,o4.sup,b4,(b4? +(cu4/b4*100).toFixed(1):''),Math.round(o4.amt/1000),Math.round(o4.amt*12/1000)]; })},
      {name:'사유별 집계', head:['해지 사유','건수','비중(%)','월액 합(천원)','연환산(천원)'],
       rows:keys.map(function(k2){ var o3=by[k2]; return [k2,o3.n,(totN?Math.round(o3.n/totN*100):0),Math.round(o3.amt/1000),Math.round(o3.amt*12/1000)]; })},
      {name:'해지 기업 리스트', head:['고객사','서비스','채널','구분','해지월','사유','직전 월액(천원)','비고','재약정'],
       rows:list.map(function(x){ return [x.cust,x.line,x.channel,x.ctype,x.ym,x.reason,Math.round(x.amt/1000),x.note,(x.sup?'지원사업':'일반')]; })}
    ]).then(function(){ if(msg) msg.textContent='✓ 다운로드 완료 (시트 2장: 사유별 집계 + 기업 리스트)'; })
      .catch(function(e){ if(msg) msg.textContent='실패: '+String(e.message||e); toast('엑셀 생성 실패', String(e.message||e)); });
  }
  var bx=$('#chXls'); if(bx) bx.onclick=chExport;
  var q=$('#chQ');
  if(q){
    q.oninput=function(){ CHURN.q=q.value; CHURN._focus=true; renderChurn(); };
    if(CHURN._focus){ CHURN._focus=false; q.focus(); try{ q.setSelectionRange(q.value.length,q.value.length); }catch(e){} }
  }
  var fc=$('#chFclr'); if(fc) fc.onclick=function(){ CHURN.q=''; CHURN.fil={}; renderChurn(); };
  document.querySelectorAll('#chList thead [data-sk]').forEach(function(el2){
    el2.onclick=function(){
      var k2=el2.dataset.sk;
      if(CHURN.sk===k2) CHURN.sd*=-1; else { CHURN.sk=k2; CHURN.sd=1; }
      renderChurn();
    };
  });
  // 열 제목 ▼ — 계약 그리드와 동일한 «볼 값 고르기» 패널
  document.querySelectorAll('#chList thead .fbtn[data-fk]').forEach(function(btn){
    btn.onclick=function(ev){
      ev.stopPropagation();
      var k2=btn.dataset.fk;
      var base=inR0.filter(function(x){ return passQ(x) && chPass(x,k2); });
      var cnt={}, order=[];
      base.forEach(function(x){ var t=chVal(x,k2); if(cnt[t]===undefined){ cnt[t]=0; order.push(t); } cnt[t]++; });
      var col=null; CH_COLS.forEach(function(c){ if(c[0]===k2) col=c; });
      openFilterPanel(btn,{
        label:(col?col[1]:k2), order:order, cnt:cnt, num:(k2==='amt'),
        selected:CHURN.fil[k2]||null,
        onApply:function(sel){
          if(sel) CHURN.fil[k2]=sel; else delete CHURN.fil[k2];
          renderChurn();
        }
      });
    };
  });
}

/* ===== ㊿+153: admin.js 에서 옮김 — 장비 신청·MDR PoC 신청 폼은 영업 화면 것(관리자 화면은 처음 열 때만 불러오므로) ===== */
/* ---- 수령처 프리셋 (DB recv_presets · 로그인 필요) ---- */
export var RECV_PRESETS=null;
export function loadRecvPresets(){
  if(RECV_PRESETS) return;
  sbTry('recv_presets?select=*&order=sort').then(function(rows){
    if(!rows || !rows.length) return;
    RECV_PRESETS=rows;
    var sel=$('#odRecvPick'); if(!sel) return;
    sel.innerHTML='<option value="">— 직접 입력 —</option>';
    var groups={};
    rows.forEach(function(r){
      if(!groups[r.grp]){ groups[r.grp]=document.createElement('optgroup'); groups[r.grp].label=r.grp; sel.appendChild(groups[r.grp]); }
      var o=document.createElement('option');
      o.value=r.id; o.textContent=r.name+(r.grp!=='지니언스'&&r.grp!=='본사(서울)'? '':'');
      groups[r.grp].appendChild(o);
    });
    sel.onchange=function(){
      var v=this.value;
      var r=(RECV_PRESETS||[]).filter(function(x){ return String(x.id)===v; })[0];
      if(!r) return;
      $('#odRecvAddr').value=r.addr||'';
      $('#odRecvName').value=(r.name||'').replace(/\s*\(.*\)$/,'').replace(/\s(부장|차장|과장|대리|사원|팀장)$/,'');
      $('#odRecvPhone').value=r.phone||'';
    };
  });
}

export function openOrderForm(){ switchView('ordernew'); }
export async function submitOrder(){
  var cust=$('#odCustomer').value.trim(), mgr=$('#odMgr').value.trim();
  if(!cust||!mgr){ msg('odMsg','고객사명과 담당자는 필수입니다','bad'); return; }
  var btn=$('#odGo'); btn.disabled=true; msg('odMsg','접수 중…');
  var isS1=$('#odChannel').value==='에스원';
  try{
    var row={
      channel: $('#odChannel').value, order_type: $('#odType').value,
      serials: $('#odSerials').value.trim()||null,
      requester: ST.AUTH_USER||null,
      customer: cust,
      contract_no: isS1? ($('#odContract').value.trim()||null) : null,
      mgr_name: mgr,
      mgr_phone: $('#odPhone').value.trim()||null,
      admin_account: isS1? ($('#odAdmin').value.trim()||null) : null,
      install_date: isS1? ($('#odInstall').value||null) : null,
      customer_addr: $('#odAddr').value.trim()||null,
      edition: isS1? $('#odEdition').value : null,
      features: isS1? ($('#odFeat').value.trim()||null) : null,
      nodes: +$('#odNodes').value||null,
      model: $('#odModel').value,
      qty: +$('#odQty').value||1,
      standalone_pod: $('#odPod').checked,
      recv_addr: $('#odRecvAddr').value.trim()||null,
      recv_name: $('#odRecvName').value.trim()||null,
      recv_phone: $('#odRecvPhone').value.trim()||null,
      ship_date: $('#odShip').value||null,
      request_note: $('#odNote').value.trim()||null,
      status:'접수'
    };
    var out=await sbWrite('POST','equipment_orders?select=*',[row],'return=representation');
    ST.RAWX.orders=ST.RAWX.orders||[]; ST.RAWX.orders.unshift(out[0]);
    logChange('insert','equipment_orders',out[0].id,{customer:cust,model:row.model,qty:row.qty});
    msg('odMsg','');
    // 명시적 완료 화면
    $('#odDoneSum').textContent=[row.channel, cust, row.model+' × '+row.qty, row.order_type, row.standalone_pod?'단독 Pod':''].filter(Boolean).join(' · ');
    $('#odFormWrap').style.display='none';
    $('#odDone').style.display='';
    toast('발주 신청 접수 완료', cust+' · '+row.model+' × '+row.qty);
    ['odCustomer','odContract','odMgr','odPhone','odAdmin','odInstall','odAddr','odNodes','odRecvAddr','odRecvName','odRecvPhone','odShip','odNote','odSerials'].forEach(function(i){ $('#'+i).value=''; });
    $('#odQty').value='1'; $('#odPod').checked=false;
  }catch(e){ msg('odMsg',String(e.message||e),'bad'); }
  btn.disabled=false;
}

export async function submitMdrPoc(){
  var comp=$('#mpCompany').value.trim(), mgr=$('#mpMgr').value.trim();
  if(!comp||!mgr){ msg('mpMsg','회사명과 고객 담당자 이름은 필수입니다','bad'); return; }
  var btn=$('#mpGo'); btn.disabled=true; msg('mpMsg','접수 중…');
  try{
    var osSum=(+$('#mpWin').value||0)+(+$('#mpLinux').value||0)+(+$('#mpMac').value||0);
    var row={
      requester: ST.AUTH_USER||null,
      customer: comp,
      svc_type: 'CLOUD',
      plan_qty: osSum||null,
      license: 'EDR'+($('#mpRansom').checked?'+RANSOMWARE':'')+($('#mpAv').checked?'+AV':''),
      mgr_name: mgr,
      mgr_phone: $('#mpPhone').value.trim()||null,
      mgr_email: $('#mpEmail').value.trim()||null,
      device_count: $('#mpDev').value.trim()||null,
      mod_edr: $('#mpEdr').checked,
      mod_av: $('#mpAv').checked,
      mod_ransom: $('#mpRansom').checked,
      mod_media: $('#mpMedia').checked,
      os_win: $('#mpWin').value===''? null : +$('#mpWin').value,
      os_linux: $('#mpLinux').value===''? null : +$('#mpLinux').value,
      os_mac: $('#mpMac').value===''? null : +$('#mpMac').value,
      webui_email: $('#mpWebui').value.trim()||null,
      nac_use: $('#mpNac').value,
      sales_name: $('#mpSales').value.trim()||null,
      sales_phone: $('#mpSalesPh').value.trim()||null,
      apply_date: $('#mpDate').value||null,
      note: $('#mpNote').value.trim()||null,
      status:'신청'
    };
    var out=await sbWrite('POST','mdr_ops?select=*',[row],'return=representation');
    ST.RAWX.mdrops=ST.RAWX.mdrops||[]; ST.RAWX.mdrops.unshift(out[0]);
    logChange('insert','mdr_ops',out[0].id,{company:comp,mgr:mgr});
    msg('mpMsg','');
    var mods=[row.mod_edr?'EDR+MDR':'',row.mod_av?'백신':'',row.mod_ransom?'랜섬웨어':'',row.mod_media?'매체제어':''].filter(Boolean).join('·');
    $('#mpDoneSum').textContent=[comp, mgr, row.device_count||'', mods].filter(Boolean).join(' · ');
    $('#mpFormWrap').style.display='none';
    $('#mpDone').style.display='';
    toast('POC 신청 접수 완료', comp+' · '+(mods||'모듈 미선택'));
    ['mpCompany','mpMgr','mpPhone','mpEmail','mpDev','mpWin','mpLinux','mpMac','mpWebui','mpSales','mpSalesPh','mpNote'].forEach(function(i){ $('#'+i).value=''; });
    $('#mpEdr').checked=true; ['mpAv','mpRansom','mpMedia'].forEach(function(i){ $('#'+i).checked=false; });
  }catch(e){ msg('mpMsg',String(e.message||e),'bad'); }
  btn.disabled=false;
}
