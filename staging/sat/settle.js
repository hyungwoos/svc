/* ===== sat/settle.js — S1 정산(s1.html) · KK 정산(kk.html) 공통 · ㊿+154 =====
   · 두 페이지에 똑같이 들어 있던 함수(쓰기 · 숫자 표시 · 엑셀 읽기 · 정산서 인쇄 창 · 파일 끌어 놓기 · 창 닫기 …)를 한 곳으로 — sat/db.js 다음에 */
async function sbWrite(m,p,b,pref){
  var r=await fetch(SB_URL+'/rest/v1/'+p,{method:m,headers:Object.assign(hdr(true),pref?{Prefer:pref}:{}),body:b!==undefined?JSON.stringify(b):undefined});
  if(!r.ok){ var t=await r.text(), dm=clsErrText(t);
    if(r.status===401) throw new Error('로그인이 만료되었습니다 — 포탈에서 다시 로그인해 주세요');
    if(/마감|발행/.test(dm)) throw new Error(dm);   /* ㊿+176 월 마감 · 발행 잠금(SQL 107) — DB 가 막은 이유 그대로 */
    if(r.status===403||/policy/i.test(t)) throw new Error('쓰기 권한이 없습니다 (편집 권한 필요)');
    throw new Error('저장 실패 ('+r.status+'): '+t.slice(0,150)); }
  var tx=await r.text(); try{ return tx?JSON.parse(tx):null; }catch(e){ return null; }
}
function fmt(v){ v=Math.round(v||0); return v?v.toLocaleString('ko-KR'):'0'; }
function readFile(f){ return new Promise(function(ok,ng){ var r=new FileReader(); r.onload=function(){ ok(new Uint8Array(r.result)); }; r.onerror=function(){ ng(new Error('파일을 읽지 못했습니다')); }; r.readAsArrayBuffer(f); }); }
function grams(s){ var g={}; for(var i=0;i<s.length-1;i++) g[s.substr(i,2)]=1; if(s.length===1) g[s]=1; return g; }
function tile(t,v,cls){ return tpl`<div class="tile ${rawHtml(cls||'')}"><div class="t">${t}</div><div class="v">${rawHtml(v)}</div></div>`; }
function printDoc(o){
  var base=location.href.replace(/[^\/]*$/,'');
  var w=window.open('', '_blank');
  if(!w){ alert('팝업이 막혀 있습니다 — 이 사이트의 팝업을 허용해 주세요'); return; }
  function cell(v,i){ var c=o.cols[i]||{}; var t=(v==null?'':String(v));
    return tpl`<td class="${c.n?'n':''}${c.mini?' mini':''}${c.wrap?' wrap':''}">${rawHtml(t.replace(/&/g,'&amp;').replace(/</g,'&lt;'))}</td>`; }
  var rows=(o.rows||[]).map(function(r,ri){
    return tpl`<tr${rawHtml(r.__hl?' class="hl"':'')}>${rawHtml(o.cols.map(function(c,i){ return cell(r[c.k],i); }).join(''))}</tr>`;
  }).join('');
  var sums=(o.summary||[]).map(function(s){
    return tpl`<div class="sum${s.bad?' bad':''}${s.ok?' ok':''}"><span>${rawHtml(s.k)}</span><b>${rawHtml(s.v)}</b></div>`; }).join('');
  var foot=(o.foot||[]).map(function(f){
    return tpl`<tr class="ft">${rawHtml(o.cols.map(function(c,i){ return tpl`<td class="${c.n?'n':'wrap'}">${rawHtml(f[c.k]==null?'':String(f[c.k]))}</td>`; }).join(''))}</tr>`; }).join('');
  var html=tpl`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>${rawHtml(o.title)}</title><style>`+
    tpl`*{box-sizing:border-box}`+
    tpl`body{font-family:"Noto Sans KR","Malgun Gothic","맑은 고딕",sans-serif;margin:0;background:#eceef0;color:#1c1f22;-webkit-print-color-adjust:exact;print-color-adjust:exact}`+
    tpl`.page{width:210mm;min-height:297mm;margin:12px auto;background:#fff;padding:14mm 14mm 10mm;box-shadow:0 6px 24px rgba(0,0,0,.12)}`+
    tpl`.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.5px solid #1fb53a;padding-bottom:9px;margin-bottom:14px}`+
    tpl`.hd h1{font-size:19px;margin:0 0 3px;letter-spacing:-.3px}`+
    tpl`.hd .sub{font-size:11.5px;color:#6b7176}`+
    tpl`.hd img{height:26px}`+
    tpl`.sums{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}`+
    tpl`.sum{flex:1;min-width:104px;border:1px solid #e3e6e8;border-radius:9px;padding:8px 10px;background:#fafbfc}`+
    tpl`.sum span{display:block;font-size:10.5px;color:#6b7176;margin-bottom:2px}`+
    tpl`.sum b{font-size:14px;font-variant-numeric:tabular-nums}`+
    tpl`.sum.ok b{color:#1e8e3e} .sum.bad b{color:#c0392b}`+
    tpl`table{width:100%;border-collapse:collapse;font-size:10.5px}`+
    tpl`th{background:#1fb53a;color:#fff;font-weight:600;padding:6px 6px;text-align:left;border:1px solid #1fb53a;white-space:nowrap}`+
    tpl`td{padding:5px 6px;border:1px solid #e3e6e8;vertical-align:middle}`+
    tpl`td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}`+
    tpl`td.mini{font-size:9.5px;color:#6b7176}`+
    tpl`tbody tr:nth-child(even) td{background:#fafbfc}`+
    tpl`tr.hl td{background:#fff8e1}`+
    tpl`tbody tr.ft td{background:#eef3f8!important;font-weight:700;border-top:2px solid #b8cce4}`+
    tpl`tbody tr.ft:last-child td{background:#e3ecf6!important;border-bottom:2px solid #b8cce4}`+
    tpl`tr.ft,tr.hl{page-break-inside:avoid;break-inside:avoid}`+
    tpl`thead{display:table-header-group}`+
    tpl`.note{margin-top:10px;font-size:10.5px;color:#4a5055;line-height:1.6;white-space:pre-line}`+
    tpl`td.wrap{white-space:normal;word-break:keep-all}`+
    tpl`td:not(.wrap){white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`+
    tpl`.ft2{margin-top:auto;padding-top:12px;display:flex;justify-content:space-between;font-size:9.5px;color:#8b9298}`+
    tpl`.bar{position:fixed;top:0;left:0;right:0;background:#22262a;color:#fff;padding:9px 14px;display:flex;gap:10px;align-items:center;font-size:12px;z-index:9}`+
    tpl`.bar button{background:#1fb53a;color:#fff;border:none;border-radius:8px;padding:7px 14px;font-weight:700;cursor:pointer;font-family:inherit;font-size:12px}`+
    tpl`.bar button.g{background:#55595d}`+
    tpl`.bar+.page{margin-top:52px}`+
    tpl`@media print{@page{size:A4 portrait;margin:0}body{background:#fff}.bar{display:none}.page{margin:0;box-shadow:none;width:210mm;min-height:0}}`+
    tpl`</style></head><body>`+
    tpl`<div class="bar"><b>${rawHtml(o.title)}</b><span style="flex:1"></span>`+
      tpl`<button data-pd="print">인쇄 · PDF로 저장</button>`+
      tpl`<button class="g" data-pd="close">닫기</button></div>`+
    tpl`<div class="page">`+
      tpl`<div class="hd"><div><h1>${rawHtml(o.title)}</h1><div class="sub">${rawHtml(o.sub||'')}</div></div>`+
        tpl`<img src="${rawHtml(base)}Logo.jpg" alt="Genians"></div>`+ tpl`${rawHtml(sums? tpl`<div class="sums">${rawHtml(sums)}</div>`:'')}`+
      tpl`<table><thead><tr>${rawHtml(o.cols.map(function(c){ return tpl`<th class="${c.n?'n':''}"${rawHtml(c.w? ' style="width:'+c.w+'"':'')}>${rawHtml(c.l)}</th>`; }).join(''))}</tr></thead>`+
      tpl`<tbody>${rawHtml(rows)}${rawHtml(foot)}</tbody></table>`+ tpl`${rawHtml(o.note? tpl`<div class="note">${rawHtml(o.note)}</div>`:'')}`+
      tpl`<div class="ft2"><span>지니언스㈜ 서비스사업부 · 내부 참고용</span><span>출력 ${rawHtml(new Date().toLocaleString('ko-KR'))}</span></div>`+
    tpl`</div></body></html>`;
  w.document.open(); w.document.write(html); w.document.close();
  /* ㊿+154: 새 창은 이 페이지의 CSP(인라인 금지)를 물려받아 onclick 이 안 됨 — 여기서 연결 · 로고가 없으면 숨김 */
  w.document.querySelectorAll('[data-pd]').forEach(function(b){ b.addEventListener('click', function(){ if(b.dataset.pd==='print') w.print(); else w.close(); }); });
  w.document.querySelectorAll('img').forEach(function(im){ im.addEventListener('error', function(){ im.style.display='none'; }); });
  setTimeout(function(){ try{ w.focus(); }catch(e){} }, 300);
}
function toggleMore(btn){
  var m=btn.nextElementSibling, on=m.classList.contains('on');
  document.querySelectorAll('.moremenu').forEach(function(x){ x.classList.remove('on'); });
  if(!on){ m.classList.add('on');
    setTimeout(function(){ document.addEventListener('click', function off(ev){
      if(m.contains(ev.target)||ev.target===btn) return; m.classList.remove('on'); document.removeEventListener('click',off); }); },0); }
}
function closeOvl(id){ var e=$('#'+id); if(e) e.classList.remove('show'); }
function openSettles(){ $('#ovlSet').classList.add('show'); msg('mS',''); Promise.all([loadSettles(), typeof clsLoad==='function'? clsLoad() : null]).then(renderSettles); renderSettles(); }   /* ㊿+176 마감 상태도 다시 읽음 */
function bindDrop(dropId,inputId,handler){
  var d=$('#'+dropId), inp=$('#'+inputId);
  inp.addEventListener('change',function(){ if(inp.files&&inp.files[0]) handler(inp.files[0],d); });
  ['dragover','dragenter'].forEach(function(ev){ d.addEventListener(ev,function(e){ e.preventDefault(); d.classList.add('has'); }); });
  d.addEventListener('dragleave',function(){ if(!d.dataset.done) d.classList.remove('has'); });
  d.addEventListener('drop',function(e){ e.preventDefault(); var f=e.dataTransfer.files&&e.dataTransfer.files[0]; if(f) handler(f,d); });
}
function loadXlsx(){ return new Promise(function(ok,ng){
  if(window.XLSX) return ok();
  /* SRI(무결성 해시, npm 배포본 sha384) + CDN 폴백 — 해시가 다르면 브라우저가 실행을 거부하고 다음 주소로 */
  var urls=['https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js','https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js','https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'], sri='sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw';
  (function nx(i){ if(i>=urls.length) return ng(new Error('엑셀 라이브러리를 불러오지 못했습니다 (네트워크·사내 차단 확인)'));
    var sc=document.createElement('script'); sc.src=urls[i]; sc.integrity=sri; sc.crossOrigin='anonymous';
    sc.onload=function(){ ok(); }; sc.onerror=function(){ sc.remove(); nx(i+1); }; document.head.appendChild(sc); })(0);
  }); }
function sim(a,b){ a=norm(a); b=norm(b); if(!a||!b) return 0; if(a===b) return 1;
  if(a.indexOf(b)>=0||b.indexOf(a)>=0) return .88;
  var ga=grams(a), gb=grams(b), hit=0, ka=Object.keys(ga), kb=Object.keys(gb);
  ka.forEach(function(k){ if(gb[k]) hit++; }); return ka.length+kb.length? 2*hit/(ka.length+kb.length):0; }
/* 창 바깥 클릭 · Esc 로 닫기 → sat/common.js 로 옮김(㊿+156 · 프로젝트 리포트 창도 같이) */
