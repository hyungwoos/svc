/* ===== price.js — 제품 가격표 · 클라우드 비용 · PDF 읽기 · 견적·TCO 비교 =====
   포탈 본체(js/app.js)를 ④ 아키텍처 2단계(㊿+136)에서 기능별로 나눈 파일. 전역 var/function 그대로 — 즉시 실행 문장은 전부 js/init.js 에.
   로드 순서는 index.html <meta name="app-js"> (js/load.js 가 그 순서대로 ?v=APP_VER 를 붙여 불러옴) */
   // 업로드한 구축형 견적서 분석 결과 (메모리에만 — 새로고침 시 소멸)
/* ==================================================================
   도구 › 클라우드 비용
   · 계정(AWS 5+1 · 공공기관 NCP) × 월 × 서비스 금액 — cloud_costs 표
   · 매달 받는 클라이온 AWS 인보이스(PDF)를 올리면 브라우저(pdf.js)에서 읽어 행으로 저장합니다
     PDF 파일은 저장하지 않습니다 (용량) — 읽은 값과 파일명만 남김
   ================================================================== */
var CL={mode:'aws', sel:null, months:null, mon:'all'};   // sel = 선택된 AWS 계정 id 집합

function loadCloud(cb){
  if(loadCloud._q){ loadCloud._q.push(cb); return; }
  loadCloud._q=[cb];
  Promise.all([
    sbTry('cloud_accounts?select=*&order=sort,id'),
    sbTry('cloud_costs?select=ym,account_id,service,usd,credit_usd,krw,kind,source,invoice_id&order=ym'),
    sbTry('cloud_invoices?select=*&order=ym.desc,account_id')
  ]).then(function(r){
    RAWX.cloud={acc:r[0]||[], costs:r[1]||[], inv:r[2]||[], _at:Date.now()};
    var q=loadCloud._q; loadCloud._q=null;
    q.forEach(function(f){ if(f) try{ f(); }catch(e){} });
  });
}
/* 서비스명 정규화 — 인보이스마다 «Amazon »/«AWS » 접두가 붙거나 빠져서 같은 서비스가 두 줄로 갈라지는 것을 막습니다 */
function clSvcKey(n){
  n=String(n||'').trim().replace(/\s+/g,' ');
  if(/^AmazonCloudWatch$/i.test(n)) return 'CloudWatch';
  n=n.replace(/^(Amazon|AWS)\s+/,'');
  n=n.replace(/^Elastic Container Service for Kubernetes$/,'Elastic Kubernetes Service');
  return n;
}
/* cloud_costs 행 → 화면용 구조 {months[], acc:{id:{label,color,currency,rows:[{n,v[]}],totals[],linked:[...]}}} */
function clBuild(){
  var C=RAWX.cloud||{acc:[],costs:[],inv:[]};
  var mset={}; C.costs.forEach(function(r){ if(r.kind==='service') mset[String(r.ym).slice(0,7)]=1; });
  var months=Object.keys(mset).sort();
  var mi={}; months.forEach(function(m,i){ mi[m]=i; });
  var acc={};
  C.acc.forEach(function(a){ acc[a.id]={id:a.id,label:a.label,acct:a.acct_no||'',email:a.email||'',purpose:a.purpose||'',color:a.color||'#666',
    currency:a.currency||'USD',vendor:a.vendor||'AWS',sort:a.sort||50,active:a.active!==false,rows:{},linked:{},totals:months.map(function(){return null;})}; });
  C.costs.forEach(function(r){
    var a=acc[r.account_id]; if(!a) return;
    var i=mi[String(r.ym).slice(0,7)]; if(i==null) return;
    var val = a.currency==='KRW'? Number(r.krw||0) : Number(r.usd||0);
    if(r.kind==='linked'){
      var L=(a.linked[r.service]=a.linked[r.service]||{n:r.service,v:months.map(function(){return null;})});
      L.v[i]=(L.v[i]||0)+val; return;
    }
    var k=clSvcKey(r.service);
    var row=(a.rows[k]=a.rows[k]||{n:k,v:months.map(function(){return null;})});
    row.v[i]=(row.v[i]||0)+val;
    a.totals[i]=(a.totals[i]||0)+val;
  });
  // 색은 저장된 hex 대신 포탈 공통 시리즈 팔레트(--s1~--s8)를 정렬 순서대로 씁니다 — 다른 차트와 톤을 맞추기 위해
  Object.keys(acc).sort(function(x,y){ return (acc[x].vendor==='NCP')-(acc[y].vendor==='NCP') || acc[x].sort-acc[y].sort; })
    .forEach(function(k,i){ acc[k].color=cssv('--s'+((i%8)+1))||acc[k].color; });
  Object.keys(acc).forEach(function(k){
    var a=acc[k];
    a.rows=Object.keys(a.rows).map(function(n){ return a.rows[n]; }).filter(function(r){ return r.v.some(function(x){ return x; }); });
    a.linked=Object.keys(a.linked).map(function(n){ return a.linked[n]; });
    a.totals=a.totals.map(function(t){ return t==null? null : Math.round(t*100)/100; });
  });
  var awsKeys=Object.keys(acc).filter(function(k){ return acc[k].vendor!=='NCP' && acc[k].active && acc[k].rows.length; })
    .sort(function(x,y){ return acc[x].sort-acc[y].sort; });
  var ncp=Object.keys(acc).filter(function(k){ return acc[k].vendor==='NCP' && acc[k].rows.length; })[0]||null;
  var B={months:months, acc:acc, awsKeys:awsKeys, ncp:ncp, inv:C.inv};
  // 표시 통화로 변환한 값 (rows[].d, totals → dtotals, linked[].d) — 현재 환율 하나를 전 기간에 적용
  Object.keys(acc).forEach(function(k){ var a=acc[k];
    a.rows.forEach(function(r){ r.d=r.v.map(function(x){ return clConv(x,a.currency); }); });
    a.linked.forEach(function(r){ r.d=r.v.map(function(x){ return clConv(x,a.currency); }); });
    a.dtotals=a.totals.map(function(x){ return clConv(x,a.currency); });
  });
  return B;
}
/* ── 통화 표시 모드: 'usd'(세전 USD) | 'krw'(원화 환산 · 천원) ── */

var CL_FX_DEFAULT=1400;
/* 현재 환율(원/USD) — 외부에서 받아 6시간 캐시. 실패하면 가장 최근 인보이스의 적용 환율, 그것도 없으면 기본값 */

function clFxCached(){ try{ var c=JSON.parse(sessionStorage.getItem('svc_fx_usdkrw')||'null'); if(c && Date.now()-c.at<6*3600*1000) return c; }catch(e){} return null; }
async function clFetchFx(force){
  var c=!force && clFxCached(); if(c){ CL.fxNow=c; return c; }
  var out=null;
  var srcs=[
    {name:'open.er-api.com', url:'https://open.er-api.com/v6/latest/USD', pick:function(j){ return j&&j.rates&&j.rates.KRW; }, when:function(j){ return j&&j.time_last_update_utc; }},
    {name:'frankfurter.app (ECB)', url:'https://api.frankfurter.app/latest?from=USD&to=KRW', pick:function(j){ return j&&j.rates&&j.rates.KRW; }, when:function(j){ return j&&j.date; }}
  ];
  for(var i=0;i<srcs.length && !out;i++){
    try{
      var ctl=new AbortController(); var t=setTimeout(function(){ ctl.abort(); },6000);
      var r=await fetch(srcs[i].url,{signal:ctl.signal}); clearTimeout(t);
      if(!r.ok) continue;
      var j=await r.json(); var v=Number(srcs[i].pick(j));
      if(v>0) out={rate:Math.round(v*100)/100, src:srcs[i].name, when:String(srcs[i].when(j)||''), at:Date.now(), live:true};
    }catch(e){}
  }
  if(!out){
    var inv=((RAWX.cloud&&RAWX.cloud.inv)||[]).filter(function(x){ return x.fx_rate; }).sort(function(x,y){ return String(y.ym).localeCompare(String(x.ym)); })[0];
    out= inv? {rate:Number(inv.fx_rate), src:'최근 인보이스 적용 환율 ('+String(inv.ym).slice(0,7)+')', when:'', at:Date.now(), live:false}
            : {rate:CL_FX_DEFAULT, src:'기본값', when:'', at:Date.now(), live:false};
  }
  CL.fxNow=out; try{ if(out.live) sessionStorage.setItem('svc_fx_usdkrw', JSON.stringify(out)); }catch(e){}
  return out;
}
function clFxRate(){ return (CL.fxNow&&CL.fxNow.rate)||CL_FX_DEFAULT; }
/* 값 변환: 원 통화(a.currency) → 표시 통화. krw 모드는 «천원» 숫자 · 환율은 현재 환율 하나를 전 기간에 적용 */
function clConv(v, currency){
  if(v==null) return null;
  var fx=clFxRate();
  if(CL.cur==='krw') return (currency==='KRW'? v : v*fx)/1000;
  return currency==='KRW'? v/fx : v;
}
function clIsK(){ return CL.cur==='krw'; }
/* 표시 통화 포맷 — krw 모드: 천원 숫자(단위 배지가 따로 있음), usd 모드: $ */
function clF(v){ return clIsK()? Math.round(v).toLocaleString('ko-KR') : '$'+Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function clFk(v){ return clIsK()? Math.round(v).toLocaleString('ko-KR') : '$'+Math.round(v).toLocaleString('en-US'); }
function clUnit(){ return clIsK()? '천원' : 'USD'; }
/* AI 질문 전에 클라우드 비용 데이터를 한 번 확보 (없으면 조용히 통과) */
function clEnsure(){
  var pf = CL.fxNow? Promise.resolve() : clFetchFx().catch(function(){});
  var pd = RAWX.cloud? Promise.resolve() : new Promise(function(res){ var t=setTimeout(res, 4000); try{ loadCloud(function(){ clearTimeout(t); res(); }); }catch(e){ res(); } });
  return Promise.all([pf,pd]);
}
var clU=function(v){ return '$'+Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); };
var clUk=function(v){ return '$'+Math.round(v).toLocaleString('en-US'); };
var clW=function(v){ return '₩'+Math.round(v).toLocaleString('ko-KR'); };
function clSum(a){ return a.reduce(function(s,x){ return s+(x||0); },0); }
function clCell(v){ if(v==null) return '<td class="n z">–</td>'; if(Math.abs(v)<(clIsK()?0.5:0.005)) return '<td class="n z">0</td>'; return '<td class="n">'+clF(v)+'</td>'; }
function clDelta(prev,cur){
  if(prev==null||cur==null) return '<span class="dl flat">–</span>';
  var d=cur-prev; if(Math.abs(d)<(clIsK()?0.5:0.005)) return '<span class="dl flat">±0</span>';
  var p=prev? Math.abs(d/prev*100).toFixed(1)+'%':'';
  return '<span class="dl '+(d>0?'up':'down')+'">'+(d>0?'▲':'▼')+' '+clF(Math.abs(d))+(p?' ('+p+')':'')+'</span>';
}
function clMonLabel(m){ return m.slice(2,4)+'.'+m.slice(5,7); }

function renderCloud(){
  var host=$('#clBody');
  if(!RAWX.cloud){
    host.innerHTML='<div class="cap" style="padding:40px;text-align:center">클라우드 비용을 불러오는 중…</div>';
    loadCloud(function(){ if(CUR_VIEW==='cloud') renderCloud(); });
    return;
  }
  if(!CL.fxNow){
    host.innerHTML='<div class="cap" style="padding:40px;text-align:center">현재 환율을 확인하는 중…</div>';
    clFetchFx().then(function(){ if(CUR_VIEW==='cloud') renderCloud(); });
    return;
  }
  var B=clBuild(); CL.B=B;
  if(!B.months.length){
    host.innerHTML='<section class="card c12" style="max-width:640px;margin:0 auto;text-align:center;padding:40px">'+
      '<h3 style="margin:0 0 8px">☁️ 클라우드 비용</h3><p class="cap">데이터가 없습니다 — 54_cloud_cost.sql 실행이 필요합니다.</p></section>';
    return;
  }
  if(!CL.sel) CL.sel={}; if(!Object.keys(CL.sel).length) B.awsKeys.forEach(function(k){ CL.sel[k]=1; });
  var canEdit=!!(SB_TOKEN && !window.IS_VIEWER && (window.IS_SUPER || window.MY_ROLE==='admin'));
  var first=B.months[0], last=B.months[B.months.length-1];
  var head='<div class="pr-top">'+
    '<span style="font-size:19px;font-weight:600;letter-spacing:-.01em">클라우드 비용</span>'+
    '<div class="eqb-seg" id="clCur" role="group" aria-label="통화"><button type="button" data-c="usd" aria-pressed="'+(!clIsK())+'">$ USD 세전</button><button type="button" data-c="krw" aria-pressed="'+clIsK()+'">₩ 천원 환산</button></div>'+
    '<span class="pr-ver">'+esc(first.replace('-','년 ')+'월')+' ~ '+esc(last.replace('-','년 ')+'월')+' · 인보이스 '+B.inv.length+'건</span>'+
    '<span style="flex:1"></span>'+
    '<button class="pill ghost" id="clFxBtn" title="'+esc('출처: '+CL.fxNow.src+(CL.fxNow.when? ' · '+CL.fxNow.when:'')+' · 누르면 다시 받아옵니다')+'">환율 '+Number(CL.fxNow.rate).toLocaleString('ko-KR')+'원/$'+(CL.fxNow.live? '':' (외부 조회 실패 · '+esc(CL.fxNow.src)+')')+'</button>'+
    (canEdit? '<button class="pill" id="clAdd" style="background:var(--brand);border-color:var(--brand);color:#fff">＋ 인보이스 PDF 추가</button>':'')+
    '</div>';
  /* 1차: 요약 타일 + 월별 추이 · 2차(접힘): MDR 인프라 · 계정 개요 · 서비스×월 표 · 인보이스 */
  function det(k, title, inner){ var open=false; try{ open=localStorage.getItem('svc_cl_open_'+k)==='1'; }catch(e){}
    return '<details class="pr-det cl-det" data-k="'+k+'"'+(open?' open':'')+'><summary>'+title+'</summary><div class="cl-detb">'+inner+'</div></details>'; }
  host.innerHTML=head+
    '<div class="eqb-kpis cl-kpis" id="clSum"></div>'+
    '<div class="pr-card" style="margin-bottom:18px"><div id="clChips" style="display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-bottom:8px"></div>'+
      '<p class="cap" id="clHint" style="margin:0 0 10px"></p>'+
      '<h3 id="clChartT">월별 비용 추이</h3><div class="cl-legend" id="clLegend"></div><div id="clChart" class="chartbox h260"></div></div>'+
    det('mdr','MDR 서비스 인프라 월별 비용 <span class="mini">EDR(KR) + awstac</span>', '<div id="clMdr"></div>')+
    det('acct','계정 개요 · 통합청구 연결 계정 <span class="mini" id="clAcctCap"></span>', '<div id="clAcct" style="display:none"></div><div id="clLinked" style="display:none;margin-top:12px"></div>')+
    det('tbl','서비스 × 월 비용 내역', '<h3 id="clTableT" style="margin:0 0 8px;font-size:13px">서비스 × 월 비용 내역</h3><div class="tbl-wrap" style="max-height:none"><table class="pr" id="clTable"></table></div><p class="cap" id="clNote" style="margin-top:8px"></p>')+
    det('inv','인보이스 등록 내역 <span class="mini">'+B.inv.length+'건 · PDF 는 읽은 뒤 보관하지 않고 파일명만</span>', '<div id="clInv"></div>');
  clSummary(B); clMdr(B); clChips(B); clChart(B); clAcctOverview(B); clLinked(B); clTable(B); clInvList(B, canEdit);
  host.querySelectorAll('details.cl-det').forEach(function(d){
    d.addEventListener('toggle', function(){ try{ localStorage.setItem('svc_cl_open_'+d.dataset.k, d.open?'1':'0'); }catch(e){}
      if(d.open && d.dataset.k==='mdr') try{ clMdr(B); }catch(e){} });
  });
  clDetVis();
  var add=document.getElementById('clAdd'); if(add) add.onclick=function(){ clOpenAdd(); };
  host.querySelectorAll('#clCur button').forEach(function(b){ b.onclick=function(){ CL.cur=b.dataset.c; try{ localStorage.setItem('svc_cloud_cur',CL.cur); }catch(e){} renderCloud(); }; });
  var fxb=document.getElementById('clFxBtn'); if(fxb) fxb.onclick=function(){
    fxb.textContent='환율 받는 중…'; fxb.disabled=true;
    clFetchFx(true).then(function(f){ toast('현재 환율 '+Number(f.rate).toLocaleString('ko-KR')+'원/$', f.src+(f.when? ' · '+f.when:''), f.live?'info':'warn'); renderCloud(); });
  };
}
function clSummary(B){
  var M=B.months, ks=B.awsKeys;
  var awsMonth=M.map(function(_,i){ return ks.reduce(function(s,k){ return s+(B.acc[k].dtotals[i]||0); },0); });
  var lastFull=M.length-1; while(lastFull>0 && ks.filter(function(k){ return B.acc[k].dtotals[lastFull]!=null; }).length<ks.length*0.6) lastFull--;
  var shares=ks.map(function(k){ return {k:k,s:clSum(B.acc[k].dtotals)}; }).sort(function(a,b){ return b.s-a.s; });
  var awsSum=clSum(awsMonth);
  var U=clUnit();
  var ncpSum=B.ncp? clSum(B.acc[B.ncp].dtotals) : 0, ncpN=B.ncp? B.acc[B.ncp].dtotals.filter(function(x){return x!=null;}).length : 0;
  var ncpLast=B.ncp? (B.acc[B.ncp].dtotals[lastFull]||0) : 0;
  var mdrA=B.acc.edr, mdrT=B.acc.tac, mdrLast=null, mdrPrev=null;
  if(mdrA&&mdrT){ mdrLast=(mdrA.dtotals[lastFull]||0)+(mdrT.dtotals[lastFull]||0); if(lastFull>0) mdrPrev=(mdrA.dtotals[lastFull-1]||0)+(mdrT.dtotals[lastFull-1]||0); }
  var top=shares[0];
  function tile(k, v, u, d){ return '<div class="kpi"><div class="k">'+k+'</div><div class="v">'+v+(u? '<small>'+u+'</small>':'')+'</div><div class="d">'+d+'</div></div>'; }
  $('#clSum').innerHTML=
    tile(clMonLabel(M[lastFull])+' 월 비용 <span class="mini">최근 완전 집계월</span>', clFk(awsMonth[lastFull]+ncpLast), U,
      (lastFull>0? '전월비 '+clDelta(awsMonth[lastFull-1]+(B.ncp? (B.acc[B.ncp].dtotals[lastFull-1]||0):0), awsMonth[lastFull]+ncpLast)+' · ':'')+'AWS '+clFk(awsMonth[lastFull])+(B.ncp? ' · NCP '+clFk(ncpLast):''))+
    tile('기간 합계 <span class="mini">'+clMonLabel(M[0])+'~'+clMonLabel(M[M.length-1])+'</span>', clFk(awsSum+ncpSum), U,
      'AWS '+ks.length+'개 계정 '+clFk(awsSum)+(B.ncp? ' · NCP '+clFk(ncpSum)+' (월평균 '+clFk(ncpSum/(ncpN||1))+')':'')+(clIsK()? ' · 환율 환산':' 세전'))+
    (mdrLast!=null? tile('MDR 인프라 <span class="mini">EDR + awstac · '+clMonLabel(M[lastFull])+'</span>', clFk(mdrLast), U, (mdrPrev!=null? '전월비 '+clDelta(mdrPrev,mdrLast)+' · ':'')+'전체의 '+(awsMonth[lastFull]? Math.round(mdrLast/awsMonth[lastFull]*100):0)+'%')
                  : tile('AWS 계정', ks.length, '개', B.ncp? '+ 공공기관 NCP 1개':'NCP 없음'))+
    tile('계정별 비중 <span class="mini">기간 합계 기준</span>', top? esc(B.acc[top.k].label)+' '+(top.s/awsSum*100).toFixed(0)+'%':'—', '',
      shares.slice(1,4).map(function(x){ return esc(B.acc[x.k].label)+' '+(x.s/awsSum*100).toFixed(0)+'%'; }).join(' · '));
}
/* 접힘 섹션 안 내용이 비면(계정 1개 선택 등) 섹션 자체를 숨김 */
function clDetVis(){
  var m=document.getElementById('clMdr'), d1=document.querySelector('details.cl-det[data-k="mdr"]'); if(m&&d1) d1.style.display=(m.style.display==='none')? 'none':'';
  var a=document.getElementById('clAcct'), l=document.getElementById('clLinked'), d2=document.querySelector('details.cl-det[data-k="acct"]');
  if(d2){ var vis=(a&&a.style.display!=='none')||(l&&l.style.display!=='none'); d2.style.display=vis? '':'none';
    var cap=document.getElementById('clAcctCap'); if(cap) cap.textContent=(a&&a.style.display!=='none')? '선택 계정 '+((CL.B&&clSelKeys(CL.B).length)||0)+'개' : (l&&l.style.display!=='none'? '통합청구 연결 계정':''); }
}
/* 포탈 공통 차트(Viz) — 계정이 여러 개면 누적 영역(MRR 추이와 같은 형태), 하나면 막대 */
function clBars(el, M, series, fmt, forceBars){
  el.className='chartbox '+(el.dataset.h||'h260'); el.innerHTML='';
  var labels=M.map(clMonLabel);
  var sers=series.map(function(s0){ return {label:s0.label||'', data:s0.vals.map(function(v){ return v||0; }), color:s0.color}; });
  if(!sers.some(function(s0){ return s0.data.some(function(v){ return v; }); })){ el.innerHTML='<p class="cap" style="padding:20px">표시할 데이터가 없습니다</p>'; return; }
  var f=function(v){ return fmt(v); };
  if(sers.length===1 || forceBars) Viz.bars(el,{labels:labels, series:sers, fmt:f, padL:64, maxBar:sers.length>1? 18:30});
  else Viz.area(el,{labels:labels, series:sers, fmt:f, padL:64});
}
function clMdr(B){
  var box=$('#clMdr'); var A=B.acc.edr, T=B.acc.tac;
  if(!A||!T||!A.rows.length||!T.rows.length){ box.style.display='none'; return; }
  var M=B.months;
  box.style.display='';
  box.innerHTML='<p class="cap" style="margin:0 0 6px">'+(clIsK()? '원화 환산 천원':'세전 USD')+'</p><div class="cl-legend">'+
    [A,T].map(function(a){ return '<span><i style="background:'+a.color+'"></i>'+esc(a.label+' · '+a.purpose)+'</span>'; }).join('')+'</div><div id="clMdrChart" class="chartbox h220" data-h="h220"></div>'+
    '<div class="tbl-wrap" style="max-height:none;margin-top:10px"><table class="pr" id="clMdrT"></table></div>';
  clBars(document.getElementById('clMdrChart'), M, [{label:A.label,vals:A.dtotals,color:A.color},{label:T.label,vals:T.dtotals,color:T.color}], clFk, true);
  var li=M.length-1;
  var h='<thead><tr><th>계정</th>'+M.map(function(m){ return '<th class="n">'+clMonLabel(m)+'</th>'; }).join('')+'<th class="n">합계</th><th class="n">'+clMonLabel(M[li])+' 전월비</th></tr></thead><tbody>';
  function row(a){ return '<tr><td><span style="display:inline-block;width:8px;height:8px;background:'+a.color+';margin-right:6px;border-radius:2px"></span>'+esc(a.label+' · '+a.purpose)+'</td>'+
    a.dtotals.map(function(v){ return clCell(v); }).join('')+'<td class="n"><b>'+clF(clSum(a.dtotals))+'</b></td><td class="n">'+clDelta(a.dtotals[li-1],a.dtotals[li])+'</td></tr>'; }
  var comb=M.map(function(_,i){ return (A.dtotals[i]==null&&T.dtotals[i]==null)? null : (A.dtotals[i]||0)+(T.dtotals[i]||0); });
  h+=row(A)+row(T)+'<tr class="tot"><td>합계</td>'+comb.map(function(v){ return clCell(v); }).join('')+'<td class="n">'+clF(clSum(comb))+'</td><td class="n">'+clDelta(comb[li-1],comb[li])+'</td></tr></tbody>';
  document.getElementById('clMdrT').innerHTML=h;
}
function clSelKeys(B){ return B.awsKeys.filter(function(k){ return CL.sel[k]; }); }
function clChips(B){
  var box=$('#clChips'); var ks=clSelKeys(B);
  var h='<span class="cap" style="font-weight:650;margin-right:4px">AWS 계정 (다중 선택)</span>';
  B.awsKeys.forEach(function(k){ var a=B.acc[k];
    h+='<button class="cl-chip'+(CL.mode==='aws'&&CL.sel[k]?' on':'')+'" data-k="'+k+'" style="--c:'+a.color+'" title="'+esc(a.purpose)+'"><i></i>'+esc(a.label)+'</button>'; });
  h+='<button class="cl-chip util'+(CL.mode==='aws'&&ks.length===B.awsKeys.length?' on':'')+'" data-all="1">전체 선택</button>';
  if(B.ncp) h+='<button class="cl-chip util'+(CL.mode==='ncp'?' on':'')+'" data-ncp="1">공공기관 NCP</button>';
  box.innerHTML=h;
  box.onclick=function(e){
    var b=e.target.closest('button'); if(!b) return;
    if(b.dataset.ncp){ CL.mode='ncp'; }
    else if(b.dataset.all){ CL.mode='aws'; CL.sel={}; B.awsKeys.forEach(function(k){ CL.sel[k]=1; }); }
    else { var k=b.dataset.k;
      if(CL.mode==='ncp'){ CL.mode='aws'; CL.sel={}; CL.sel[k]=1; }
      else if(CL.sel[k]){ if(clSelKeys(B).length>1) delete CL.sel[k]; }
      else CL.sel[k]=1; }
    clChips(B); clChart(B); clAcctOverview(B); clLinked(B); clTable(B); clDetVis();
  };
  var hint=$('#clHint');
  if(CL.mode==='ncp') hint.textContent='공공기관 NCP 단독 보기 (₩, 공급가액) — AWS 계정을 누르면 AWS 보기로 돌아갑니다.';
  else hint.textContent= ks.length===B.awsKeys.length? 'AWS '+ks.length+'개 계정 전체 합산 (세전 USD) — 계정을 눌러 켜고 끌 수 있습니다.'
    : '선택 합산: '+ks.map(function(k){ return B.acc[k].label+'('+B.acc[k].purpose+')'; }).join(' + ')+' · 세전 USD';
}
function clChart(B){
  var isN=CL.mode==='ncp', M=B.months;
  var series=isN? [{label:B.acc[B.ncp].label,color:B.acc[B.ncp].color,vals:B.acc[B.ncp].dtotals}]
                : clSelKeys(B).map(function(k){ var a=B.acc[k]; return {label:a.label+' · '+a.purpose,color:a.color,vals:a.dtotals}; });
  $('#clLegend').innerHTML=series.map(function(s){ return '<span><i style="background:'+s.color+'"></i>'+esc(s.label)+'</span>'; }).join('');
  clBars(document.getElementById('clChart'), M, series, clFk);
  var ks=clSelKeys(B);
  var U=clUnit();
  $('#clChartT').textContent= isN? '월별 비용 추이 · 공공기관 NCP ('+U+')' : ks.length===B.awsKeys.length? '월별 비용 추이 · AWS '+ks.length+'개 계정 누적 ('+U+')' : ks.length===1? '월별 비용 추이 · '+B.acc[ks[0]].label+' ('+U+')' : '월별 비용 추이 · 선택 '+ks.length+'개 계정 누적 ('+U+')';
}
function clAcctOverview(B){
  var p=$('#clAcct'), ks=clSelKeys(B), M=B.months, li=M.length-1;
  if(CL.mode==='ncp'||ks.length<2){ p.style.display='none'; return; }
  p.style.display='';
  var grand=ks.reduce(function(s,k){ return s+clSum(B.acc[k].dtotals); },0);
  var rows=ks.map(function(k){ var a=B.acc[k], sum=clSum(a.dtotals), nm=a.dtotals.filter(function(x){ return x!=null; }).length;
    return {sum:sum, html:'<tr><td><span style="display:inline-block;width:8px;height:8px;background:'+a.color+';margin-right:6px;border-radius:2px"></span>'+esc(a.purpose)+'</td>'+
      '<td>'+esc(a.email)+'<br><span class="cap">'+esc(a.acct)+' · '+esc(a.label)+'</span></td><td class="n"><b>'+clF(sum)+'</b></td><td class="n">'+clFk(sum/(nm||1))+'</td>'+
      '<td class="n">'+(sum/grand*100).toFixed(1)+'%</td><td class="n">'+clDelta(a.dtotals[li-1],a.dtotals[li])+'</td></tr>'}; }).sort(function(a,b){ return b.sum-a.sum; });
  p.innerHTML='<h3>선택 계정 개요 <small>용도별 비용 · '+clUnit()+'</small></h3><div class="tbl-wrap" style="max-height:none"><table class="pr"><thead><tr><th>용도</th><th>계정</th><th class="n">합계</th><th class="n">월평균</th><th class="n">선택 내 비중</th><th class="n">'+clMonLabel(M[li])+' 전월비</th></tr></thead><tbody>'+
    rows.map(function(r){ return r.html; }).join('')+'</tbody></table></div><p class="cap" style="margin-top:8px">비중은 현재 선택된 계정 합계 대비 · 월평균은 각 계정의 집계 월수 기준</p>';
}
function clLinked(B){
  var p=$('#clLinked'), ks=clSelKeys(B), M=B.months, li=M.length-1;
  var only=(CL.mode==='aws'&&ks.length===1)? B.acc[ks[0]] : null;
  if(!only || !only.linked.length){ p.style.display='none'; return; }
  p.style.display='';
  var rows=only.linked.slice().sort(function(a,b){ return clSum(b.d)-clSum(a.d); });
  var tot=M.map(function(_,i){ return rows.reduce(function(s,r){ return s+(r.v[i]||0); },0)||null; });
  p.innerHTML='<h3>'+esc(only.label)+' 통합청구 · 연결 계정별 비용 <small>'+clUnit()+'</small></h3><div class="tbl-wrap" style="max-height:none"><table class="pr"><thead><tr><th>연결 계정</th>'+
    M.map(function(m){ return '<th class="n">'+clMonLabel(m)+'</th>'; }).join('')+'<th class="n">합계</th><th class="n">'+clMonLabel(M[li])+' 전월비</th></tr></thead><tbody>'+
    rows.map(function(r){ return '<tr><td>'+esc(r.n)+'</td>'+r.d.map(function(x){ return clCell(x); }).join('')+'<td class="n"><b>'+clF(clSum(r.d))+'</b></td><td class="n">'+clDelta(r.d[li-1],r.d[li])+'</td></tr>'; }).join('')+
    '<tr class="tot"><td>합계</td>'+tot.map(function(t){ return clCell(t); }).join('')+'<td class="n">'+clF(clSum(tot))+'</td><td class="n">'+clDelta(tot[li-1],tot[li])+'</td></tr></tbody></table></div>'+
    '<p class="cap" style="margin-top:8px">통합청구서의 계정별 요금 기준 · «–»는 해당 월 청구 내역 없음</p>';
}
function clTable(B){
  var isN=CL.mode==='ncp', ks=clSelKeys(B), M=B.months, li=M.length-1;
  var rows, totals;
  if(isN){ rows=B.acc[B.ncp].rows.map(function(r){ return {n:r.n,d:r.d,src:null}; }); totals=B.acc[B.ncp].dtotals; }
  else if(ks.length===1){ rows=B.acc[ks[0]].rows.map(function(r){ return {n:r.n,d:r.d,src:null}; }); totals=B.acc[ks[0]].dtotals; }
  else{
    var map={};
    ks.forEach(function(k){ B.acc[k].rows.forEach(function(r){
      var t=(map[r.n]=map[r.n]||{n:r.n,d:M.map(function(){return null;}),src:[]});
      r.d.forEach(function(x,i){ if(x!=null) t.d[i]=(t.d[i]||0)+x; }); t.src.push(k); }); });
    rows=Object.keys(map).map(function(n){ return map[n]; });
    totals=M.map(function(_,i){ return ks.reduce(function(a,k){ return a+(B.acc[k].dtotals[i]||0); },0)||null; });
  }
  rows.forEach(function(r){ r.sum=clSum(r.d); }); rows.sort(function(a,b){ return b.sum-a.sum; });
  var multi=!isN&&ks.length>1;
  var tag=function(src){ return (multi&&src)? src.map(function(k){ return '<span title="'+esc(B.acc[k].label)+'" style="display:inline-block;width:8px;height:8px;background:'+B.acc[k].color+';margin-right:4px;border-radius:2px"></span>'; }).join('') : ''; };
  var h='<thead><tr><th>서비스</th>'+M.map(function(m){ return '<th class="n">'+clMonLabel(m)+'</th>'; }).join('')+'<th class="n">합계</th><th class="n">'+clMonLabel(M[li])+' 전월비</th></tr></thead><tbody>';
  h+=rows.map(function(r){ return '<tr><td>'+tag(r.src)+esc(r.n)+'</td>'+r.d.map(function(x){ return clCell(x); }).join('')+'<td class="n"><b>'+clF(r.sum)+'</b></td><td class="n">'+clDelta(r.d[li-1],r.d[li])+'</td></tr>'; }).join('');
  h+='<tr class="tot"><td>합계</td>'+totals.map(function(t){ return clCell(t); }).join('')+'<td class="n">'+clF(clSum(totals))+'</td><td class="n">'+clDelta(totals[li-1],totals[li])+'</td></tr></tbody>';
  document.getElementById('clTable').innerHTML=h;
  var a1=ks.length===1? B.acc[ks[0]] : null;
  var U2=clUnit();
  $('#clTableT').textContent= isN? '공공기관 NCP · 서비스 × 월 ('+U2+(clIsK()?', 공급가액':', 환율 환산')+')' : ks.length===B.awsKeys.length? '전체 AWS '+ks.length+'개 계정 · 서비스 × 월 ('+U2+(clIsK()?', 환율 환산':', 세전')+')' : a1? a1.purpose+' · '+a1.email+' ('+a1.acct+') · '+U2 : '선택 합산('+ks.map(function(k){ return B.acc[k].label; }).join(' + ')+') · 서비스 × 월 ('+U2+')';
  $('#clNote').textContent=(isN? 'NCP 금액은 공급가액(VAT 별도) 기준 · «Other Services»는 명세서에 분리되지 않은 고정 비용. ' : 'AWS 금액은 세전 USD 기준'+(clIsK()? '을 현재 환율('+Number(clFxRate()).toLocaleString('ko-KR')+'원/$)로 원화 환산(천원)한 값':'')+' · 서비스명 앞 색 점은 비용이 발생한 계정. ')+'전 기간 0인 서비스는 제외했고 «–»는 해당 월 미발생/미집계입니다. 서비스명의 «Amazon/AWS» 접두는 통일해 표시합니다.';
}
/* 인보이스 보관 목록 */
function clInvList(B, canEdit){
  var p=$('#clInv'); var inv=(B.inv||[]).slice();
  var byM={}; inv.forEach(function(i){ (byM[String(i.ym).slice(0,7)]=byM[String(i.ym).slice(0,7)]||[]).push(i); });
  var months=B.months.slice().reverse();
  var h='';
  if(!inv.length) h+='<p class="cap">보관된 인보이스가 없습니다'+(canEdit? ' — 위 «＋ 인보이스 PDF 추가» 로 올려주세요.':'.')+'</p>';
  else{
    h+='<div class="tbl-wrap" style="max-height:none"><table class="pr"><thead><tr><th>사용 월</th><th>계정</th><th class="n">전체합계(USD)</th><th class="n">환율</th><th class="n">공급가액(₩)</th><th class="n">총 청구(VAT 포함)</th><th>파일</th><th>올린 사람</th>'+(canEdit?'<th></th>':'')+'</tr></thead><tbody>';
    months.forEach(function(m){ (byM[m]||[]).forEach(function(i){ var a=B.acc[i.account_id]||{label:i.account_id};
      h+='<tr><td>'+m+'</td><td><span style="display:inline-block;width:8px;height:8px;background:'+(a.color||'#999')+';margin-right:6px;border-radius:2px"></span>'+esc(a.label)+(i.vendor? ' <span class="cap">· '+esc(i.vendor)+'</span>':'')+'</td>'+
        '<td class="n">'+(i.total_usd!=null? clU(i.total_usd):'–')+'</td><td class="n">'+(i.fx_rate!=null? Number(i.fx_rate).toLocaleString('ko-KR'):'–')+'</td><td class="n">'+(i.supply_krw!=null? clW(i.supply_krw):'–')+'</td><td class="n">'+(i.total_krw!=null? clW(i.total_krw):'–')+'</td>'+
        '<td class="cap">'+(i.file_name? '📄 '+esc(i.file_name) : esc(i.source||''))+'</td>'+
        '<td class="cap">'+esc((i.uploaded_by||'').split('@')[0])+' · '+String(i.uploaded_at||'').slice(0,10)+'</td>'+
        (canEdit? '<td><button class="pill ghost" data-del="'+i.id+'" style="height:24px;padding:0 8px;font-size:11px;color:var(--critical)">삭제</button></td>':'')+'</tr>'; }); });
    h+='</tbody></table></div>';
  }
  p.innerHTML=h;
  p.querySelectorAll('[data-del]').forEach(function(b){ b.onclick=function(){ clDeleteInvoice(+b.dataset.del); }; });
}
async function clDeleteInvoice(id){
  var inv=(RAWX.cloud.inv||[]).filter(function(i){ return i.id===id; })[0]; if(!inv) return;
  if(!confirm(String(inv.ym).slice(0,7)+' '+inv.account_id+' 인보이스 기록과 그 달 서비스 행을 지울까요?')) return;
  try{
    await sbWrite('DELETE','cloud_costs?invoice_id=eq.'+id);
    await sbWrite('DELETE','cloud_invoices?id=eq.'+id);
    logChange('delete','cloud_invoices',id,{ym:inv.ym,account:inv.account_id});
    toast('삭제했습니다', String(inv.ym).slice(0,7)+' · '+inv.account_id);
    RAWX.cloud=null; renderCloud();
  }catch(e){ toast('삭제 실패', String(e.message||e), 'warn'); }
}

/* ---------- PDF 읽기 ---------- */
function clLoadPdfjs(){
  if(window.pdfjsLib && clLoadPdfjs._w) return Promise.resolve(window.pdfjsLib);
  return loadLib('pdfjs').then(function(){ return loadWorkerBlob(PDFJS_WORKER); }).then(function(u){
    try{ window.pdfjsLib.GlobalWorkerOptions.workerSrc=u||PDFJS_WORKER.urls[0]; }catch(e){}   // 검증 실패 시 pdf.js 가 원격 URL 로 가짜 워커(메인 스레드) 폴백
    clLoadPdfjs._w=true; return window.pdfjsLib;
  }, function(e){ throw new Error('pdf.js 를 불러오지 못했습니다 (네트워크 차단?)'); });
}
/* PDF → 줄 배열 (같은 y 좌표의 글자 조각을 한 줄로) */
async function clPdfLines(file){
  var lib=await clLoadPdfjs();
  var buf=await file.arrayBuffer();
  var doc=await lib.getDocument({data:new Uint8Array(buf)}).promise;
  var out=[];
  for(var p=1;p<=doc.numPages;p++){
    var page=await doc.getPage(p), tc=await page.getTextContent();
    var items=tc.items.filter(function(i){ return i.str && i.str.trim(); }).map(function(i){ return {x:i.transform[4], y:Math.round(i.transform[5]), s:i.str}; });
    var rows=[];
    items.forEach(function(i){ var r=rows.filter(function(r){ return Math.abs(r.y-i.y)<=2; })[0]; if(!r){ r={y:i.y,items:[]}; rows.push(r); } r.items.push(i); });
    rows.sort(function(a,b){ return b.y-a.y; }).forEach(function(r){ out.push(r.items.sort(function(a,b){ return a.x-b.x; }).map(function(i){ return i.s; }).join(' ')); });
  }
  return out;
}
/* 클라이온 인보이스 텍스트 줄 → {ym, fx, billDate, accounts:[{acct,email,rows:[{service,usd,credit,billUsd,krw}],subUsd,subKrw}], totalUsd, supplyKrw, vatKrw, totalKrw, vendor} */
function clParseInvoice(lines){
  var num=function(s){ return s==null? null : Number(String(s).replace(/[^\d.\-]/g,'')); };
  var text=lines.join('\n');
  var r={vendor:null, accounts:[], warnings:[]};
  var m=text.match(/사용기간\s*(\d{4})\s*년\s*(\d{1,2})\s*월/); if(m) r.ym=m[1]+'-'+('0'+m[2]).slice(-2);
  m=text.match(/청구일자\s*(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/); if(m) r.billDate=m[1]+'-'+('0'+m[2]).slice(-2)+'-'+('0'+m[3]).slice(-2);
  m=text.match(/적용\s*환율\s*[:：]?\s*([\d,]+(?:\.\d+)?)/); if(m) r.fx=num(m[1]);
  m=text.match(/전체합계\s*\$\s*([\d,]+(?:\.\d+)?)/); if(m) r.totalUsd=num(m[1]);
  m=text.match(/공급가액\s*[￦₩]\s*([\d,]+)/); if(m) r.supplyKrw=num(m[1]);
  m=text.match(/부가세\s*[￦₩]\s*([\d,]+)/); if(m) r.vatKrw=num(m[1]);
  m=text.match(/총\s*청구금액\s*[￦₩]\s*([\d,]+)/); if(m) r.totalKrw=num(m[1]);
  if(/클라이온/.test(text)) r.vendor='클라이온';
  // 계정 블록: Sub Total 로 끊고, 블록 안의 12자리 계정번호·이메일을 그 블록의 계정으로
  var cur={rows:[], raw:[]};
  var svcRe=/^(.*?)\s*\$\s*([\d,]+(?:\.\d+)?)\s*\$\s*([\d,]+(?:\.\d+)?)\s*\$\s*([\d,]+(?:\.\d+)?)\s*[￦₩]\s*([\d,]+)\s*$/;
  lines.forEach(function(ln){
    var s=ln.trim();
    if(/^전체합계/.test(s)) return;
    var am=s.match(/\((\d{12})\)/); if(am) cur.acct=am[1];
    var em=s.match(/[\w.+-]+@[\w.-]+\.\w+/); if(em) cur.email=em[0];
    var sm=s.match(svcRe);
    if(sm){
      var name=sm[1].replace(/[\w.+-]+@[\w.-]+\.\w+/,'').replace(/\(\d{12}\)/,'').trim();
      if(/^Sub\s*Total/i.test(name)){
        cur.subUsd=num(sm[4]); cur.subKrw=num(sm[5]);
        r.accounts.push(cur); cur={rows:[], raw:[]}; return;
      }
      if(!name) return;
      cur.rows.push({service:name, usd:num(sm[2]), credit:num(sm[3]), billUsd:num(sm[4]), krw:num(sm[5])});
    }
  });
  if(cur.rows.length) r.accounts.push(cur);   // Sub Total 없이 끝난 블록
  r.accounts.forEach(function(a){
    var s=a.rows.reduce(function(x,y){ return x+(y.billUsd||0); },0);
    if(a.subUsd!=null && Math.abs(s-a.subUsd)>0.05) r.warnings.push((a.email||a.acct||'?')+': 서비스 합 '+s.toFixed(2)+' ≠ Sub Total '+a.subUsd);
    if(!a.acct) r.warnings.push('계정번호를 못 찾은 블록이 있습니다 ('+a.rows.length+'행)');
  });
  if(!r.ym) r.warnings.push('사용기간(YYYY년 MM월)을 찾지 못했습니다');
  if(!r.accounts.length) r.warnings.push('계정별 사용 내역 표를 찾지 못했습니다 — 클라이온 양식이 맞는지 확인하세요');
  return r;
}
/* 계정번호 → cloud_accounts id */
function clAcctByNo(no){
  var acc=(RAWX.cloud&&RAWX.cloud.acc)||[];
  return acc.filter(function(a){ return String(a.acct_no||'')===String(no); })[0]||null;
}

/* ---------- 인보이스 추가 모달 ---------- */
function clOpenAdd(){
  var old=document.getElementById('clOvl'); if(old) old.remove();
  var ov=document.createElement('div'); ov.className='ovl on'; ov.id='clOvl';
  ov.innerHTML='<div class="modal" style="width:min(860px,100%)"><h3>인보이스 PDF 추가</h3>'+
    '<p class="cap">클라이온 AWS 인보이스 PDF 를 올리면 브라우저에서 사용기간·계정·서비스별 금액을 읽어 표에 넣습니다. <b>PDF 파일 자체는 저장하지 않습니다</b>(읽은 값과 파일명만 기록). 같은 달·같은 계정이 이미 있으면 새 값으로 교체되고, 여러 파일을 한 번에 올릴 수 있습니다.</p>'+
    '<div class="cl-drop" id="clDrop">여기에 PDF 를 끌어다 놓거나 클릭해서 선택<br><span class="cap">application/pdf · 최대 20MB</span><input type="file" id="clFile" accept="application/pdf" multiple style="display:none"></div>'+
    '<div id="clPrev"></div>'+
    '<div class="mact"><span class="mmsg" id="clMsg"></span><button class="pill ghost" id="clClose">닫기</button><button class="btn" style="height:36px" id="clSave" disabled>저장</button></div></div>';
  document.body.appendChild(ov);
  var drop=document.getElementById('clDrop'), inp=document.getElementById('clFile');
  drop.onclick=function(){ inp.click(); };
  drop.ondragover=function(e){ e.preventDefault(); drop.classList.add('on'); };
  drop.ondragleave=function(){ drop.classList.remove('on'); };
  drop.ondrop=function(e){ e.preventDefault(); drop.classList.remove('on'); clHandleFiles(e.dataTransfer.files); };
  inp.onchange=function(){ clHandleFiles(inp.files); };
  document.getElementById('clClose').onclick=function(){ ov.remove(); };
  document.getElementById('clSave').onclick=clSaveParsed;
  CL.parsed=[];
}
async function clHandleFiles(files){
  var msg=document.getElementById('clMsg'); var prev=document.getElementById('clPrev');
  var list=Array.prototype.slice.call(files||[]).filter(function(f){ return /pdf$/i.test(f.name)||f.type==='application/pdf'; });
  if(!list.length){ msg.textContent='PDF 파일이 아닙니다'; return; }
  msg.textContent='PDF 를 읽는 중… ('+list.length+'개)';
  for(var i=0;i<list.length;i++){
    var f=list[i], item={file:f, name:f.name};
    try{
      var lines=await clPdfLines(f);
      item.parsed=clParseInvoice(lines);
      // 계정 배정: 블록마다 계정번호 → cloud_accounts
      item.parsed.accounts.forEach(function(a){ var acc=clAcctByNo(a.acct); a.accId=acc? acc.id : null; a.accLabel=acc? acc.label : null; });
    }catch(e){ item.error=String(e.message||e); }
    CL.parsed.push(item);
  }
  msg.textContent='';
  if(CL.parsed.length) ovlMarkDirty('clOvl');   /* ㊿+141: 읽어 둔 인보이스가 있으면 바깥 클릭 시 확인 */
  clRenderPreview();
}
function clRenderPreview(){
  var prev=document.getElementById('clPrev'), inv=(RAWX.cloud&&RAWX.cloud.inv)||[];
  var accOpts=((RAWX.cloud&&RAWX.cloud.acc)||[]).filter(function(a){ return a.vendor!=='NCP'; });
  var h='', ready=0;
  CL.parsed.forEach(function(it,ix){
    h+='<div class="cl-prev" data-ix="'+ix+'"><h4>📄 '+esc(it.name)+' <button class="pill ghost" data-rm="'+ix+'" style="height:22px;padding:0 8px;font-size:11px;margin-left:auto">제거</button></h4>';
    if(it.error){ h+='<span class="st bad">읽기 실패</span> <span class="cap">'+esc(it.error)+'</span></div>'; return; }
    var p=it.parsed;
    h+='<div class="cap" style="margin-bottom:6px">사용기간 <b>'+esc(p.ym||'?')+'</b> · 청구일 '+esc(p.billDate||'?')+' · 환율 '+(p.fx||'?')+' · 전체합계 '+(p.totalUsd!=null? clU(p.totalUsd):'?')+' · 공급가액 '+(p.supplyKrw!=null? clW(p.supplyKrw):'?')+' · VAT 포함 '+(p.totalKrw!=null? clW(p.totalKrw):'?')+(p.vendor? ' · '+esc(p.vendor):'')+'</div>';
    p.accounts.forEach(function(a,ai){
      var dup=inv.filter(function(x){ return String(x.ym).slice(0,7)===p.ym && x.account_id===a.accId; })[0];
      var nz=a.rows.filter(function(r){ return (r.billUsd||0)>0 || (r.krw||0)>0; });
      h+='<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:4px 0">'+
        '<span class="st '+(a.accId?'ok':'bad')+'">'+esc(a.email||'')+' ('+esc(a.acct||'?')+')</span>'+
        '<span class="cap">→ 포탈 계정</span><select data-acc="'+ix+':'+ai+'" class="pill" style="height:26px;font:inherit;font-size:12px">'+
          '<option value="">— 선택 —</option>'+accOpts.map(function(o){ return '<option value="'+esc(o.id)+'"'+(o.id===a.accId?' selected':'')+'>'+esc(o.label)+' ('+esc(o.acct_no||'')+')</option>'; }).join('')+
          '<option value="__new">＋ 새 계정으로 등록…</option></select>'+
        '<span class="cap">서비스 '+nz.length+'행 · Sub Total '+(a.subUsd!=null? clU(a.subUsd):'?')+(a.subKrw!=null? ' / '+clW(a.subKrw):'')+'</span>'+
        (dup? '<span class="st dup">이미 있음 → 교체됨'+(dup.file_name? ' ('+esc(dup.file_name)+')':'')+'</span>':'')+
        '</div>';
      if(nz.length) h+='<details style="margin:2px 0 6px"><summary class="cap" style="cursor:pointer">서비스 행 보기</summary><table class="pr" style="font-size:11.5px"><thead><tr><th>서비스</th><th class="n">금액(USD)</th><th class="n">Credit</th><th class="n">청구(USD)</th><th class="n">청구(₩)</th></tr></thead><tbody>'+
        nz.map(function(r){ return '<tr><td>'+esc(clSvcKey(r.service))+'</td><td class="n">'+clU(r.usd||0)+'</td><td class="n">'+clU(r.credit||0)+'</td><td class="n">'+clU(r.billUsd||0)+'</td><td class="n">'+clW(r.krw||0)+'</td></tr>'; }).join('')+'</tbody></table></details>';
      if(a.accId) ready++;
    });
    if(p.warnings.length) h+='<div class="cap" style="color:var(--critical)">⚠ '+p.warnings.map(esc).join(' · ')+'</div>';
    h+='</div>';
  });
  prev.innerHTML=h;
  prev.querySelectorAll('[data-rm]').forEach(function(b){ b.onclick=function(){ CL.parsed.splice(+b.dataset.rm,1); clRenderPreview(); }; });
  prev.querySelectorAll('select[data-acc]').forEach(function(sel){ sel.onchange=function(){
    var p=sel.dataset.acc.split(':'), a=CL.parsed[+p[0]].parsed.accounts[+p[1]];
    if(sel.value==='__new'){ clNewAccount(a, function(id){ a.accId=id; clRenderPreview(); }, function(){ sel.value=a.accId||''; }); return; }
    a.accId=sel.value||null; clRenderPreview();
  }; });
  var ok=CL.parsed.some(function(it){ return !it.error && it.parsed.ym && it.parsed.accounts.some(function(a){ return a.accId; }); });
  document.getElementById('clSave').disabled=!ok;
}
/* 인보이스에 처음 나온 AWS 계정을 cloud_accounts 에 등록 */
async function clNewAccount(a, done, cancel){
  var label=prompt('새 계정 표시 이름 (예: Cloud(신규))', (a.email||'').split('@')[0]||'');
  if(!label){ cancel(); return; }
  var purpose=prompt('용도 (예: 개발/테스트용)', '')||'';
  var id=(a.email||'acct').split('@')[0].replace(/[^a-z0-9]/gi,'').toLowerCase()||('a'+String(a.acct).slice(-4));
  try{
    await sbWrite('POST','cloud_accounts',[{id:id,label:label,acct_no:a.acct||null,email:a.email||null,purpose:purpose,color:'#'+((Math.random()*0x7fffff|0x333333)>>>0).toString(16).padStart(6,'0'),currency:'USD',vendor:'AWS',sort:50}]);
    RAWX.cloud.acc.push({id:id,label:label,acct_no:a.acct,email:a.email,purpose:purpose,currency:'USD',vendor:'AWS',sort:50,active:true});
    toast('계정을 등록했습니다', label+' ('+(a.acct||'')+')');
    done(id);
  }catch(e){ toast('계정 등록 실패', String(e.message||e), 'warn'); cancel(); }
}
/* 저장: PDF 업로드 → 인보이스 upsert → 그 달·계정 서비스 행 교체 */
async function clSaveParsed(){
  var btn=document.getElementById('clSave'), msg=document.getElementById('clMsg');
  btn.disabled=true; var done=0, fail=0;
  for(var i=0;i<CL.parsed.length;i++){
    var it=CL.parsed[i]; if(it.error||!it.parsed.ym) continue;
    var p=it.parsed;
    for(var ai=0;ai<p.accounts.length;ai++){
      var a=p.accounts[ai]; if(!a.accId) continue;
      msg.textContent='저장 중… '+it.name+' · '+a.accId;
      try{
        // ① PDF 는 읽기만 하고 저장하지 않습니다 (용량) — 파일명·읽은 값만 기록
        // ② 인보이스 행 (ym, account 유일) — 기존 것 있으면 갱신
        var body={ym:p.ym+'-01', account_id:a.accId, vendor:p.vendor||null, file_path:null, file_name:it.name, fx_rate:p.fx||null,
          total_usd:a.subUsd!=null? a.subUsd : p.totalUsd, supply_krw:(p.accounts.length===1? p.supplyKrw : a.subKrw)||null,
          vat_krw:(p.accounts.length===1? p.vatKrw : null), total_krw:(p.accounts.length===1? p.totalKrw : null),
          source:'pdf', uploaded_by:AUTH_USER||null, uploaded_at:new Date().toISOString()};
        var rows=await sbWrite('POST','cloud_invoices?on_conflict=ym,account_id&select=id',[body],'resolution=merge-duplicates,return=representation');
        var invId=rows&&rows[0]&&rows[0].id;
        // ③ 그 달·계정의 서비스 행 교체
        await sbWrite('DELETE','cloud_costs?ym=eq.'+p.ym+'-01&account_id=eq.'+encodeURIComponent(a.accId)+'&kind=eq.service');
        var costRows=a.rows.filter(function(r){ return (r.billUsd||0)!==0 || (r.krw||0)!==0; }).map(function(r){
          return {ym:p.ym+'-01', account_id:a.accId, service:clSvcKey(r.service), usd:r.billUsd, credit_usd:r.credit||0, krw:r.krw, kind:'service', source:'pdf', invoice_id:invId||null}; });
        // 같은 서비스명이 두 줄(접두 차이)이면 합침
        var merged={}; costRows.forEach(function(r){ var k=r.service; if(merged[k]){ merged[k].usd+=r.usd||0; merged[k].krw=(merged[k].krw||0)+(r.krw||0); } else merged[k]=r; });
        var arr=Object.keys(merged).map(function(k){ return merged[k]; });
        if(arr.length) await sbWrite('POST','cloud_costs',arr);
        logChange('insert','cloud_invoices',invId||0,{ym:p.ym,account:a.accId,rows:arr.length,file:it.name});
        done++;
      }catch(e){ fail++; msg.textContent='⚠ '+it.name+': '+String(e.message||e); console.error(e); }
    }
  }
  if(fail===0){
    toast('인보이스를 저장했습니다', done+'건 · 읽은 값만 기록, PDF 는 보관하지 않음');
    var ov=document.getElementById('clOvl'); if(ov) ov.remove();
  }else{
    toast('일부 저장 실패', done+'건 성공 · '+fail+'건 실패 — 메시지를 확인하세요', 'warn'); btn.disabled=false;
  }
  RAWX.cloud=null; if(CUR_VIEW==='cloud') renderCloud();
}

function loadPrice(cb){
  if(loadPrice._q){ loadPrice._q.push(cb); return; }   // 중복 호출 방지 — 한 번만 불러옴
  loadPrice._q=[cb];
  sbTry('price_books?select=id,seg,label,applied,data,note&order=applied.desc,id.desc').then(function(rows){
    RAWX.price=rows||[];
    var q=loadPrice._q; loadPrice._q=null;
    q.forEach(function(f){ if(f) try{ f(); }catch(e){} });
  });
}
function prBooks(seg){ return (RAWX.price||[]).filter(function(b){return b.seg===seg;}); }
function prCur(seg){ return prBooks(seg)[PR.ver[seg]||0]||null; }
function prWon(v){ return typeof v==='number'? v.toLocaleString('ko-KR'):(v||'—'); }
function prMatch(t){ return !PR.q || String(t).toLowerCase().indexOf(PR.q)>=0; }
var PR_NAC_LIM=[100,200,300,400,500,600,700,800,900,1000,1500,2000,2500,3000];
function prNacTier(n){ for(var i=0;i<PR_NAC_LIM.length;i++) if(n<=PR_NAC_LIM[i]) return i; return -1; }
function prTierIdx(q){ var lim=[49,99,299,499,999,2999,4999,9999,1e9]; for(var i=0;i<lim.length;i++) if(q<=lim[i]) return i; return 8; }

function renderPrice(){
  var host=$('#prBody');
  if(!RAWX.price){
    host.innerHTML='<div class="cap" style="padding:40px;text-align:center">가격표를 불러오는 중…</div>';
    loadPrice(function(){ if(CUR_VIEW==='price') renderPrice(); });
    return;
  }
  var segBook=PR.seg==='onprem'? 'onprem':'saas';        // 견적·비교 탭은 SaaS 판(+구축형 참고)을 씁니다
  var book=prCur(segBook);
  if(!book){
    host.innerHTML='<section class="card c12" style="max-width:640px;margin:0 auto;text-align:center;padding:40px">'+
      '<h3 style="margin:0 0 8px">💰 제품 가격표</h3><p class="cap">등록된 가격표가 없습니다 — 44_price.sql 실행이 필요합니다.</p></section>';
    return;
  }
  var vers=prBooks(segBook), isCalc=PR.seg==='calc';
  var verSel='<select id="prVer" class="pill" style="height:31px;font-family:inherit">'+
    vers.map(function(b,i){ return '<option value="'+i+'"'+(i===(PR.ver[segBook]||0)?' selected':'')+'>'+esc(b.label)+(i===0?' (현행)':' (이력)')+'</option>'; }).join('')+'</select>';
  var TABS=[['saas','SaaS 가격표'],['onprem','On-prem 가격표'],['calc','견적 · 비교']];
  var head='<div class="pr-top">'+
    '<span style="font-size:19px;font-weight:600;letter-spacing:-.01em">가격표</span>'+
    '<div class="eqb-seg" role="tablist" aria-label="가격표 구분">'+TABS.map(function(t){ return '<button type="button" role="tab" data-prseg="'+t[0]+'" aria-pressed="'+(PR.seg===t[0])+'">'+t[1]+'</button>'; }).join('')+'</div>'+
    '<span class="ubadge sm won">₩ 원 단위</span>'+
    '<span style="flex:1"></span>'+
    (isCalc? '<span class="pr-ver">SaaS 판 '+esc(book.label||'')+' · 적용일 '+esc(String(book.applied||''))+'</span>'
           : '<input id="prQ" class="pill" style="height:33px;min-width:200px" placeholder="제품·모델명 검색" value="'+esc(PR.q)+'">'+verSel+'<span class="pr-ver">적용일 '+esc(String(book.applied||''))+'</span>')+
    (window.IS_SUPER && !isCalc? '<button class="pill ghost" id="prNew">＋ 새 판 등록</button>':'')+
    '</div>';
  host.innerHTML=head+'<div id="prMain"></div>';
  var vs=$('#prVer'); if(vs) vs.onchange=function(){ PR.ver[segBook]=+this.value; renderPrice(); };
  host.querySelectorAll('[data-prseg]').forEach(function(b){ b.onclick=function(){ PR.seg=b.dataset.prseg; renderPrice(); }; });
  var q=$('#prQ'); if(q) q.oninput=function(){ PR.q=this.value.trim().toLowerCase(); prPaintMain(); };
  var bn=document.getElementById('prNew');
  if(bn) bn.onclick=function(){ $('#pnMsg').textContent=''; if(!$('#pnDate').value) $('#pnDate').value=todayStr(); openOvl('ovlPrNew'); };
  prPaintMain();
}
function prPaintMain(){
  var main=$('#prMain'); if(!main) return;
  if(PR.seg==='calc'){ main.innerHTML=prCalcHtml(); prBindSaas(); return; }
  main.innerHTML = PR.seg==='saas'? prSaasHtml() : prOnpremHtml();
  if(PR.seg==='saas'){ document.querySelectorAll('[data-prbasis]').forEach(function(b){ b.onclick=function(){ PR.basis=b.dataset.prbasis; prPaintMain(); }; }); }
  else prBindOnprem();
}
function prSaasHtml(){
  var D=prCur('saas').data;
  var SUP=PR.basis==='supply';                       // Cloud NAC·ZTNA PA 표시 기준
  var RT=(D.supply_rate&&D.supply_rate.cnac)||0.5;   // 총판 공급가 = 표시가 × 50%
  function pv(v){ return typeof v==='number'? prWon(SUP? Math.round(v*RT):v) : prWon(v); }
  var basisBtn='<span style="display:inline-flex;gap:4px;margin-left:8px">'+
    '<button class="pill" data-prbasis="cons" style="height:26px;font-size:11px;'+(!SUP?'background:var(--brand-t);border-color:var(--brand);color:var(--brand);font-weight:700':'')+'">소비자가</button>'+
    '<button class="pill" data-prbasis="supply" style="height:26px;font-size:11px;'+(SUP?'background:var(--brand-t);border-color:var(--brand);color:var(--brand);font-weight:700':'')+'">총판 공급가 '+(RT*100)+'% 🔒</button></span>';
  var h='';
  // 표
  var t='';
  var bLab=SUP?'공급가':'소비자가';
  var cn=(D.cnac?D.cnac.rows:[]).filter(function(r){return prMatch('cloud nac v6 '+r[0]);}).map(function(r){
    return '<tr><td>'+r[0]+'</td><td class="n">'+pv(r[1])+'</td><td class="n">'+pv(r[2])+'</td><td class="n">'+pv(r[3])+'</td><td class="n">'+pv(r[4])+'</td></tr>'; }).join('');
  if(cn) t+='<div class="pr-card"><h3>☁️ Cloud NAC V6.0 '+basisBtn+' <small>SaaS 기본 · 원/노드·월 · VAT별도</small></h3>'+
    '<p class="cap" style="margin:0 0 8px">3,000노드 초과 별도 협의 · ZTNA 사용 시 PA Agent 추가 구매 · 총판 공급가 = 표시가의 '+(RT*100)+'%</p>'+
    '<table class="pr"><thead><tr><th>구분(NODE)</th><th class="n">'+bLab+'(무약정)</th><th class="n">1년</th><th class="n">2년</th><th class="n">3년</th></tr></thead><tbody>'+cn+'</tbody></table></div>';
  var zr=(D.ztna?D.ztna.rows:[]).filter(function(r){return prMatch('ztna pa '+r[0]);}).map(function(r){
    return '<tr><td>'+r[0]+'</td><td class="n">'+pv(r[1])+'</td><td class="n">'+pv(r[2])+'</td><td class="n">'+pv(r[3])+'</td><td class="n">'+pv(r[4])+'</td></tr>'; }).join('');
  if(zr) t+='<div class="pr-card"><h3>🌐 Cloud ZTNA PA Agent '+basisBtn+' <small>Cloud NAC 추가 옵션 · 원/Agent·월 · VAT별도</small></h3>'+
    '<p class="cap" style="margin:0 0 8px">동시접속자 기준 수량 구매 · Cloud Gateway는 고객사 인프라에 구성 · 총판 공급가 = 표시가의 '+(RT*100)+'%</p>'+
    '<table class="pr"><thead><tr><th>구분(Agent)</th><th class="n">'+bLab+'(무약정)</th><th class="n">1년</th><th class="n">2년</th><th class="n">3년</th></tr></thead><tbody>'+zr+'</tbody></table></div>';
  (D.services||[]).forEach(function(s){
    var rows=s.tiers.map(function(tt,i){
      if(!prMatch(s.name+' '+tt)) return '';
      var g=function(arr){ return (arr||[])[i]; };   // 파트너가 등이 아직 없는 서비스는 — 로
      return '<tr><td>'+tt+'</td><td class="n">'+prWon(g(s.cons))+'</td><td class="n">'+prWon(g(s.minD))+'</td><td class="n">'+prWon(g(s.dist))+'</td><td class="n">'+prWon(g(s.minP))+'</td><td class="n">'+prWon(g(s.ptn))+'</td></tr>'; }).join('');
    if(!rows) return;
    t+='<div class="pr-card"><h3>'+esc(s.icon)+' '+esc(s.name)+' <small>'+esc(s.sub)+' · 원/Agent·1년 · VAT별도</small></h3>'+
      '<table class="pr"><thead><tr><th>구분(Agent)</th><th class="n">소비자가</th><th class="n">최소제안가<span class="pr-lock">🔒</span></th><th class="n">총판가<span class="pr-lock">🔒</span></th><th class="n">파트너 최소제안<span class="pr-lock">🔒</span></th><th class="n">파트너가<span class="pr-lock">🔒</span></th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  });
  var ar=(D.addons||[]).filter(function(r){return prMatch(r[0]);}).map(function(r){
    return '<tr><td>'+r[0]+'</td><td class="n">'+prWon(r[1])+'</td><td class="n">'+prWon(r[2])+'</td><td class="n">'+prWon(r[3])+'</td><td style="color:var(--muted)">'+r[4]+'</td></tr>'; }).join('');
  if(ar) t+='<div class="pr-card"><h3>📦 부가 서비스 <small>원/년 · VAT별도</small></h3>'+
    '<table class="pr"><thead><tr><th>구분</th><th class="n">소비자가</th><th class="n">최소제안가<span class="pr-lock">🔒</span></th><th class="n">파트너가<span class="pr-lock">🔒</span></th><th>비고</th></tr></thead><tbody>'+ar+'</tbody></table></div>';
  return h+'<div class="pr-grid">'+(t||'<div class="pr-card">검색 결과가 없습니다</div>')+'</div>';
}

/* ===== 견적 · 비교 탭 — ① 빠른 견적 ② TCO 비교(SaaS vs 구축형) ③ 실제 견적서(PDF) AI 비교
   결과는 «판정 → 큰 숫자 → 근거» 순서로, 설정은 접힘(details) 안에 */
function prCalcHtml(){
  var D=prCur('saas').data, h='';
  var inSt='height:34px;border:1px solid var(--ring);border-radius:9px;padding:0 10px;font:inherit;background:var(--surface)';
  var yOpt=''; for(var yk=1;yk<=10;yk++) yOpt+='<option value="'+yk+'"'+(yk===5?' selected':'')+'>'+yk+'년</option>';
  /* ① 빠른 견적 — 두 카드 나란히 */
  h+='<div class="pr-sec"><div class="pr-sech"><span class="no">1</span><b>빠른 견적</b><span class="mini">단가표 그대로 계산 · 할인은 별도 협의 · 실제 견적은 견적·발주 시스템에서</span></div>'+
    '<div class="pr-two">'+
    '<div class="pr-card"><h3>Cloud NAC <small>기본 구독 · ZTNA 사용 시 PA Agent 추가</small></h3>'+
      '<div class="row">노드 <input type="number" id="pnQty" value="300" min="1" style="width:90px">'+
      '<select id="pnTerm"><option value="0">무약정</option><option value="1" selected>1년 약정</option><option value="2">2년</option><option value="3">3년</option></select>'+
      '<label class="svc"><input type="checkbox" id="pnZ">+ ZTNA (PA Agent)</label>'+
      '<span id="pnZW" style="display:none">동시접속 <input type="number" id="pnZQ" value="100" min="1" style="width:80px"></span></div>'+
      '<div class="pr-out"><div class="pr-ob"><div class="l">Cloud NAC 월</div><div class="v" id="pvMon">—</div></div>'+
      '<div class="pr-ob"><div class="l">ZTNA PA 월</div><div class="v" id="pvZ">—</div></div>'+
      '<div class="pr-ob fin"><div class="l">월 합계 · 연간</div><div class="v" id="pvTot">—</div></div></div>'+
      '<div class="pr-note" id="pvNote" style="margin-top:8px"></div></div>'+
    '<div class="pr-card"><h3>MDR 서비스군 <small>1년 기준 · 통합 = Cloud Insights E + Add-on 24×7</small></h3>'+
      '<div class="row">'+
      (function(){
        var LAB={CIE:'Cloud Insights E (단독)', MDRA:'+ MDR Add-on 24×7', MDR:'Genian MDR 통합', AV:'AV (백신)', RW:'랜섬웨어', DC:'매체제어'};
        var ORDER=['MDR','CIE','MDRA','AV','RW','DC'];
        var have={}; (D.services||[]).forEach(function(x){ have[x.key]=x; });
        var def=have.MDR? 'MDR' : (have.CIE? 'CIE' : (D.services&&D.services[0]? D.services[0].key : ''));
        return ORDER.filter(function(k){ return have[k]; }).map(function(k){
          return '<label class="svc"><input type="checkbox" data-prs="'+k+'"'+(k===def?' checked':'')+'>'+(LAB[k]||have[k].name)+'</label>'; }).join('');
      })()+
      ' Agent <input type="number" id="pmQty" value="100" min="1" style="width:90px">'+
      '<select id="pmWho"><option value="dist">총판가 기준</option><option value="ptn">파트너가 기준</option></select></div>'+
      '<div class="pr-out"><div class="pr-ob"><div class="l">소비자가 합계(연)</div><div class="v" id="pmCons">—</div></div>'+
      '<div class="pr-ob fin"><div class="l">공급가 합계(연)</div><div class="v" id="pmSup">—</div></div>'+
      '<div class="pr-ob"><div class="l">Agent당 공급 단가 합</div><div class="v" id="pmUnit">—</div></div></div>'+
      '<div class="pr-note" id="pmNote" style="margin-top:8px"></div></div>'+
    '</div></div>';
  /* ② TCO 비교 */
  h+='<div class="pr-sec"><div class="pr-sech"><span class="no">2</span><b>TCO 비교 — SaaS vs 구축형</b><span class="mini">SaaS = 3년 약정 엔드가 + 센서 · 구축형 = 라이선스+정책서버+센서 할인가 + 유지보수 10~15%/년(2년차~) · 구축비·설치비 제외 · VAT별도</span></div>'+
    '<div class="pr-card">'+
    '<div class="pr-ctl">'+
      '<span class="pr-f"><span class="l">제품</span><span class="eqb-seg"><button type="button" data-tcop="nac" id="tpNac">NAC</button><button type="button" data-tcop="ztna" id="tpZtna">ZTNA</button></span></span>'+
      '<span class="pr-f"><span class="l">노드</span><input type="number" id="ptQty" value="500" min="1" style="'+inSt+';width:96px"></span>'+
      '<span class="pr-f" id="ptZW" style="display:none"><span class="l">동시접속 Agent</span><input type="number" id="ptZQ" value="100" min="1" style="'+inSt+';width:90px"></span>'+
      '<span class="pr-f"><span class="l">검토 기간</span><select id="ptY" style="'+inSt+'">'+yOpt+'</select></span>'+
      '<span class="pr-f"><span class="l">구축형 할인</span><span class="eqb-seg">'+
        '<button type="button" data-tcod="60" id="td60" title="SR파트너가 영업하는 일반 채널 딜의 통상 엔드가 — SR 마진 10%p 포함">60% SR채널</button>'+
        '<button type="button" data-tcod="70" id="td70" title="SR 배제선 — 직판·PR 직대응 딜의 하한가 (인바운드 견적 수준)">70% 직판·PR</button>'+
        '<button type="button" data-tcod="80" id="td80" title="PR 배제선 — 사실상 방어 최저가">80% 최저</button></span></span>'+
    '</div>'+
    '<details class="pr-det"><summary>센서 구성 조정 <span class="mini">SaaS 센서(월/대) · 구축형 센서 모델</span></summary>'+
      '<div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap;margin-top:8px" class="pr-note">'+
      '<span style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap">SaaS 센서(월/대) <span id="ptSsL" style="display:inline-flex;gap:6px;flex-wrap:wrap"></span><button class="pill" id="ptSsAdd" title="센서 종류 추가" style="height:26px;padding:0 9px">＋</button></span>'+
      '<span style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap">구축형 센서(모델 선택) <span id="ptOsL" style="display:inline-flex;gap:6px;flex-wrap:wrap"></span><button class="pill" id="ptOsAdd" title="센서 모델 추가" style="height:26px;padding:0 9px">＋</button></span>'+
      '</div></details>'+
    '<div id="ptCmp" style="margin-top:14px"></div>'+
    '<span hidden id="ptV"></span><span hidden id="ptS"></span><span hidden id="ptSs"></span><span hidden id="ptOL"></span><span hidden id="ptO"></span><span hidden id="ptOs"></span><span hidden id="ptB"></span>'+
    '<details class="pr-det" style="margin-top:10px"><summary>구축형 구성 · 산정 근거</summary><div class="pr-note" id="ptCfg" style="margin-top:6px"></div></details>'+
    '</div></div>';
  /* ③ 실제 견적서 PDF */
  h+='<div class="pr-sec"><div class="pr-sech"><span class="no">3</span><b>실제 구축형 견적서(PDF)와 비교</b><span class="mini">AI가 견적서를 읽어 위 계산기에 자동 입력 · 파일과 결과는 저장하지 않음(새로고침 시 사라짐)</span></div>'+
    '<div class="pr-card">'+
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">'+
      '<input type="file" id="ptQF" accept="application/pdf" style="font-size:12px;max-width:300px">'+
      '<button class="pill" id="ptQGo" style="height:32px;background:var(--brand);border-color:var(--brand);color:#fff;font-weight:600">AI 분석 → 비교</button>'+
      '<span class="pr-note">4MB 이하 PDF · 10~20초</span></div>'+
      '<div id="ptQR" style="margin-top:12px"></div></div></div>';
  return h;
}

/* ===== SaaS vs 구축형 비교 표 + 누적 비용 선 그래프 (TCO 계산기 · PDF 견적 비교 공용)
   m = {y, n, saasMon, intro, mL, mH, saasLabel, onLabel, onSub, saasSub, cols:['SaaS 라벨','구축형 라벨'], best:{k,target,needDisc}|null}
   · 판정을 글자로 외치지 않고, 같은 행에 두 값을 나란히 두고 싼 쪽에 ✓ · 차이 열 · 손익분기 시점을 보여줍니다 */
function prCmpRender(host, m){
  if(!host) return;
  var W=function(v){ return '₩'+prWon(Math.round(v)); };
  var yrs=[3,5,6]; if(yrs.indexOf(m.y)<0) yrs.push(m.y); yrs.sort(function(a,b){ return a-b; });
  var maxY=Math.max.apply(null, yrs.concat([m.y]));
  function onL(k){ return m.intro*(1+m.mL*Math.max(k-1,0)); }
  function onH(k){ return m.intro*(1+m.mH*Math.max(k-1,0)); }
  function onM(k){ return (onL(k)+onH(k))/2; }
  function sa(k){ return m.saasMon!=null? m.saasMon*12*k : null; }
  if(m.saasMon==null || !m.intro){
    host.innerHTML='<p class="cap" style="padding:14px 0">'+(m.saasMon==null? '노드 수를 입력하면 SaaS 비용이 계산됩니다.':'구축형 가격 데이터를 찾을 수 없습니다.')+'</p>'; return;
  }
  /* 손익분기: SaaS 누적 = 구축형(중간 유지보수) 누적 이 되는 시점 */
  var mid=(m.mL+m.mH)/2, a=m.saasMon*12 - m.intro*mid, b=m.intro*(1-mid), be=null, always='';
  if(a<=0) always='saas';                    // SaaS 연 비용 ≤ 구축형 유지보수 → 언제나 SaaS 가 적음
  else if(b<=0) always='on';
  else { be=b/a; if(be<1) always='on'; }
  var cur={s:sa(m.y), l:onL(m.y), h:onH(m.y)}, curMid=(cur.l+cur.h)/2, dif=cur.s-curMid, pct=Math.round(Math.abs(dif)/Math.max(cur.s,curMid)*100);
  var summary= always==='saas'? '검토 기간과 무관하게 SaaS가 적게 듭니다 (SaaS 연 비용이 구축형 유지보수보다 낮음).'
    : always==='on'? '첫해부터 구축형이 적게 듭니다.'
    : '약 <b>'+be.toFixed(1)+'년</b>까지는 SaaS가, 그 이후에는 구축형이 적게 듭니다.';
  summary+=' '+m.y+'년 검토 기준 '+(dif>0? '구축형이 <b>'+W(Math.abs(dif))+'</b> ('+pct+'%) 적게' : 'SaaS가 <b>'+W(Math.abs(dif))+'</b> ('+pct+'%) 적게')+' 듭니다.';
  var ck='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:4px"><path d="M5 12l5 5L20 7"/></svg>';
  var rows='';
  rows+='<tr><th>초기 비용</th><td class="n"><span class="mini">없음 — 월 구독</span></td><td class="n">'+W(m.intro)+' <span class="mini">도입가</span></td><td></td></tr>';
  rows+='<tr><th>월 비용</th><td class="n">'+W(m.saasMon)+'<span class="mini">/월'+(m.n? ' · 노드당 '+prWon(Math.round(m.saasMon/m.n))+'원':'')+'</span></td>'+
        '<td class="n">'+W(m.intro*m.mL/12)+(m.mL!==m.mH? ' ~ '+W(m.intro*m.mH/12):'')+'<span class="mini">/월 유지보수 (2년차~)</span></td><td></td></tr>';
  yrs.forEach(function(k){
    var S=sa(k), L=onL(k), H=onH(k), M2=(L+H)/2, sw=S<=M2, d=Math.abs(S-M2), p=Math.round(d/Math.max(S,M2)*100);
    rows+='<tr'+(k===m.y?' class="cur"':'')+'><th>'+k+'년 누적'+(k===m.y? ' <span class="mini">검토 기간</span>':'')+'</th>'+
      '<td class="n'+(sw?' win':'')+'">'+(sw?ck:'')+W(S)+'</td>'+
      '<td class="n'+(!sw?' win':'')+'">'+(!sw?ck:'')+W(L)+(Math.round(L)!==Math.round(H)? ' ~ '+W(H):'')+'</td>'+
      '<td class="n mini dif">'+(sw? 'SaaS가':'구축형이')+' '+W(d)+' 적음 <b>('+p+'%)</b></td></tr>';
  });
  if(m.best && m.best.target!=null){
    var bt=m.best;
    rows+='<tr class="best"><th>'+bt.k+'년 방어 SaaS 월액</th><td class="n">'+W(bt.target)+'<span class="mini"> 이하'+(m.n? ' · 노드당 '+prWon(Math.round(bt.target/m.n))+'원':'')+'</span></td>'+
      '<td class="n mini">= 구축형 '+bt.k+'년 최저 누적 '+W(onL(bt.k))+'</td>'+
      '<td class="n mini">'+(bt.needDisc>0? '표준 대비 −'+bt.needDisc+'% <span style="color:var(--critical)">(가격표 미만 — 내부 협의)</span>':'표준가로도 충족')+'</td></tr>';
  }
  host.innerHTML='<p class="pr-cmp-sum">'+summary+'</p>'+
    '<div class="pr-cmp-wrap"><div class="pr-cmp-chart"><div class="mini" style="margin-bottom:4px">누적 비용 · 연차별 <span style="margin-left:8px"><i class="lg" style="background:var(--brand)"></i>SaaS <i class="lg" style="background:var(--axis)"></i>구축형(유지보수 중간값)</span></div><div class="chartbox h200" id="'+(host.id||'cmp')+'Ch"></div></div>'+
    '<div class="pr-cmp-tbl"><table class="pr pr-cmp"><thead><tr><th></th><th class="n">'+esc(m.cols[0])+(m.saasSub? '<div class="mini">'+esc(m.saasSub)+'</div>':'')+'</th><th class="n">'+esc(m.cols[1])+(m.onSub? '<div class="mini">'+esc(m.onSub)+'</div>':'')+'</th><th class="n">차이</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
  try{
    var labels=[], ds=[], dn=[]; for(var k=1;k<=maxY;k++){ labels.push(k+'년'); ds.push(sa(k)); dn.push(onM(k)); }
    Viz.lines(document.getElementById((host.id||'cmp')+'Ch'),{labels:labels, fmt:function(v){ return prWon(Math.round(v/1e6))+'M'; }, tipFmt:function(v){ return '₩'+prWon(Math.round(v)); }, fill:false, padL:52,
      series:[{label:'SaaS 누적', data:ds, color:cssv('--brand')},{label:'구축형 누적', data:dn, color:cssv('--axis')}]});
  }catch(e){}
}
function prOnpremHtml(){
  var D=prCur('onprem').data;
  var keys=Object.keys(D);
  if(!D[PR.op]) PR.op=keys[0];
  var h='<div class="pr-chips">'+keys.map(function(k){
    return '<button data-prop="'+k+'" class="'+(PR.op===k?'on':'')+'">'+esc(D[k].name)+'</button>'; }).join('')+'</div>';
  var p=D[PR.op], t='';
  (p.tables||[]).forEach(function(tb){
    var rows=(tb.rows||[]).filter(function(r){return prMatch(p.name+' '+r[0]+' '+r[1]);}).map(function(r){
      var num=typeof r[2]==='number';
      return '<tr><td>'+esc(String(r[0]))+'</td><td>'+esc(String(r[1]))+'</td><td class="n">'+prWon(r[2])+'</td>'+
        '<td class="n">'+(num?prWon(Math.round(r[2]*0.175)):'—')+'</td><td class="n">'+(num?prWon(Math.round(r[2]*0.20)):'—')+'</td><td class="n">'+(num?prWon(Math.round(r[2]*0.30)):'—')+'</td></tr>'; }).join('');
    if(!rows) return;
    t+='<div class="pr-card"><h3>'+esc(tb.t)+' <small>원 · VAT별도</small></h3>'+
      '<table class="pr"><thead><tr><th>기준</th><th>모델명</th><th class="n">소비자가</th><th class="n">총판가 17.5%<span class="pr-lock">🔒</span></th><th class="n">PR 20%<span class="pr-lock">🔒</span></th><th class="n">SR 30%<span class="pr-lock">🔒</span></th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  });
  var notes=(p.notes||[]).map(function(n){return '<li>'+esc(n)+'</li>';}).join('')+
    '<li>공급가 = 소비자가 × 통상 요율 (총판 17.5% · PR파트너 20% · SR파트너 30%) — 자동 계산, 건별 협의로 변동 가능</li>'+
    '<li>유지보수: 2년차부터 도입가의 약 10~15%/년</li>';
  return h+'<div class="pr-grid">'+(t||'<div class="pr-card">검색 결과가 없습니다</div>')+'</div>'+
    '<div class="pr-card" style="margin-top:14px"><h3>비고</h3><ul class="pr-note">'+notes+'</ul></div>';
}
function prBindOnprem(){
  document.querySelectorAll('[data-prop]').forEach(function(b){
    b.onclick=function(){ PR.op=b.dataset.prop; prPaintMain(); };
  });
}
/* 구축형 표에서 «기준 노드 ≥ n» 인 가장 작은 티어 선택 (초과 시 최대 티어 + over 표시) */
function prPickTier(rows, n){
  var best=null, max=null;
  (rows||[]).forEach(function(r){
    if(typeof r[2]!=='number') return;
    var nn=parseInt(String(r[0]).replace(/[^\d]/g,''),10);
    if(!nn) return;
    if(!max || nn>max.n) max={n:nn,name:r[0],model:String(r[1]),price:r[2]};
    if(nn>=n && (!best || nn<best.n)) best={n:nn,name:r[0],model:String(r[1]),price:r[2]};
  });
  if(!best && max){ max.over=true; return max; }
  return best;
}
/* 구축형 라이선스+정책서버 자동 산출 — key: 'nac'|'ztna' (센서는 수동 선택) */
function prOnpremBuild(key, n){
  var ob=prCur('onprem'); if(!ob||!ob.data[key]) return null;
  var tbs=ob.data[key].tables;
  var lic=prPickTier(tbs[0]&&tbs[0].rows, n);
  var pc =prPickTier(tbs[1]&&tbs[1].rows, n);
  if(!lic) return null;
  return {lic:lic, pc:pc, cons:lic.price+(pc?pc.price:0), over:(lic.over||(pc&&pc.over))};
}
function prBindSaas(){
  var D=prCur('saas').data;
  function nac(){
    var n=+$('#pnQty').value||0, tm=+$('#pnTerm').value, z=$('#pnZ').checked;
    $('#pnZW').style.display=z?'':'none';
    var ti=prNacTier(n), col=tm===0?1:tm+1;
    if(!n||ti<0){ $('#pvMon').textContent=$('#pvZ').textContent=$('#pvTot').textContent='—';
      $('#pvNote').textContent=(ti<0&&n)?'3,000노드 초과는 별도 협의입니다.':''; return; }
    var f=PR.basis==='supply'? ((D.supply_rate&&D.supply_rate.cnac)||0.5) : 1;   // 총판 공급가 = 표시가 × 50%
    var rate=Math.round(D.cnac.rows[ti][col]*f), mon=rate*n, zmon=0, zq=0;
    if(z){ zq=+$('#pnZQ').value||0; var zi=prNacTier(zq); if(zq&&zi>=0) zmon=Math.round(D.ztna.rows[zi][col]*f)*zq; }
    $('#pvMon').textContent='₩'+prWon(mon);
    $('#pvZ').textContent=z?(zmon?'₩'+prWon(zmon):'—'):'미사용';
    $('#pvTot').textContent='₩'+prWon(mon+zmon)+' · 연 ₩'+prWon((mon+zmon)*12);
    $('#pvNote').textContent='Cloud NAC '+D.cnac.rows[ti][0]+' 구간 노드당 '+prWon(rate)+'원/월'+(z&&zmon?' · ZTNA PA '+prWon(zq)+'개':'')+
      ' · '+(f===1?'소비자가':'총판 공급가('+(f*100)+'%)')+' 기준 · VAT별도';
  }
  function mdr(){
    var sel=[].slice.call(document.querySelectorAll('[data-prs]:checked')).map(function(x){return x.dataset.prs;});
    var qn=+$('#pmQty').value||0, who=$('#pmWho').value, ti=prTierIdx(qn), note='';
    if(!sel.length||!qn){ $('#pmCons').textContent=$('#pmSup').textContent=$('#pmUnit').textContent='—'; $('#pmNote').textContent=''; return; }
    /* 통합(MDR) = Cloud Insights E + Add-on 이므로 함께 고르면 중복 — 통합만 계산합니다 */
    if(sel.indexOf('MDR')>=0 && (sel.indexOf('CIE')>=0||sel.indexOf('MDRA')>=0)){
      note+='ⓘ 통합에 Cloud Insights E·Add-on 이 이미 들어 있어 통합만 계산했습니다 · ';
      sel=sel.filter(function(k){ return k!=='CIE'&&k!=='MDRA'; });
    }
    if(sel.indexOf('MDRA')>=0 && sel.indexOf('CIE')<0) note+='⚠ Add-on 24×7 은 Cloud Insights E 위에 얹는 옵션입니다 · ';
    if(sel.indexOf('MDR')<0&&sel.indexOf('CIE')<0&&sel.indexOf('AV')<0) note+='⚠ MDR 통합·Cloud Insights E·AV 중 하나는 필수 (랜섬웨어·매체제어 단독 구매 불가) · ';
    var cons=0,sup=0,unit=0,noPtn=[];
    sel.forEach(function(k){ var s=(D.services||[]).filter(function(x){return x.key===k;})[0]; if(!s) return;
      var u=(who==='dist'? (s.dist||[])[ti] : (s.ptn||[])[ti]);
      if(typeof u!=='number'){ noPtn.push(s.name); u=(typeof (s.dist||[])[ti]==='number'? s.dist[ti]:0); }   // 파트너가 미정 → 총판가로 대신
      cons+=((s.cons||[])[ti]||0)*qn; sup+=u*qn; unit+=u; });
    if(noPtn.length) note+='⚠ '+noPtn.join('·')+' 은 파트너가가 아직 없어 총판가로 계산 · ';
    $('#pmCons').textContent='₩'+prWon(cons); $('#pmSup').textContent='₩'+prWon(sup); $('#pmUnit').textContent='₩'+prWon(unit);
    $('#pmNote').textContent=note+'구간 '+D.services[0].tiers[ti]+' · '+(who==='dist'?'총판':'파트너')+' 공급가 기준 · 할인은 별도 협의 · 실제 견적은 견적 시스템에서';
  }
  var SEN_P=[50000,100000,150000];                                   // SaaS 센서 월 요금(엔드가) 선택지
  if(!PR.tcoSS||!PR.tcoSS.length) PR.tcoSS=[{p:50000,q:1}];
  function tcoSenRowsO(){                                            // 현재 제품(NAC/ZTNA)의 구축형 센서 모델 목록
    var ob=prCur('onprem'); if(!ob) return [];
    function tb(k){ var t=ob.data[k]&&ob.data[k].tables&&ob.data[k].tables[2];
      return ((t&&t.rows)||[]).filter(function(r){ return typeof r[2]==='number'; }); }
    var rows=tb(PR.tcoP).slice();
    if(PR.tcoP==='nac'){                                             // V6.0부터 NAC 딜도 V6(ZTNA 명칭) 센서로 견적됨 — V6 센서도 함께 제공
      var have={}; rows.forEach(function(r){ have[String(r[1])]=1; });
      tb('ztna').forEach(function(r){ if(!have[String(r[1])]) rows.push(r); });
    }
    return rows;
  }
  function tcoOsDefault(){                                           // 새 행 기본값 = 현재 노드 규모에 맞는 추천 모델
    var rec=prPickTier(tcoSenRowsO(), +$('#ptQty').value||0);
    return {m:rec?String(rec.model):'', q:1};
  }
  function renderSen(){
    var sSt='height:28px;border:1px solid var(--ring);border-radius:8px;padding:0 6px;font:inherit;font-size:11.5px;background:var(--surface)';
    $('#ptSsL').innerHTML=PR.tcoSS.map(function(r,i){
      return '<span style="display:inline-flex;gap:4px;align-items:center">'+
        '<select data-ssp="'+i+'" style="'+sSt+'">'+SEN_P.map(function(pv2){ return '<option value="'+pv2+'"'+(r.p===pv2?' selected':'')+'>'+(pv2/10000)+'만원</option>'; }).join('')+'</select>'+
        '<input type="number" data-ssq="'+i+'" value="'+(+r.q||0)+'" min="0" style="'+sSt+';width:52px">대'+
        (PR.tcoSS.length>1?'<button data-ssx="'+i+'" class="pill" style="height:24px;padding:0 7px">×</button>':'')+'</span>';
    }).join('');
    var rows=tcoSenRowsO();
    var names=rows.map(function(x){ return String(x[1]); });
    if(!PR.tcoOS||!PR.tcoOS.length||PR.tcoOS.some(function(r){ return names.indexOf(r.m)<0; })) PR.tcoOS=[tcoOsDefault()];
    $('#ptOsL').innerHTML=PR.tcoOS.map(function(r,i){
      return '<span style="display:inline-flex;gap:4px;align-items:center">'+
        '<select data-osm="'+i+'" style="'+sSt+'">'+rows.map(function(x){ return '<option value="'+esc(String(x[1]))+'"'+(String(x[1])===r.m?' selected':'')+'>'+esc(String(x[1]))+' · '+esc(String(x[0]))+' · '+prWon(x[2])+'원</option>'; }).join('')+'</select>'+
        '<input type="number" data-osq="'+i+'" value="'+(+r.q||0)+'" min="0" style="'+sSt+';width:52px">대'+
        (PR.tcoOS.length>1?'<button data-osx="'+i+'" class="pill" style="height:24px;padding:0 7px">×</button>':'')+'</span>';
    }).join('');
    document.querySelectorAll('[data-ssp]').forEach(function(e){ e.onchange=function(){ PR.tcoSS[+e.dataset.ssp].p=+e.value; tco(); }; });
    document.querySelectorAll('[data-ssq]').forEach(function(e){ e.oninput=e.onchange=function(){ PR.tcoSS[+e.dataset.ssq].q=Math.max(0,+e.value||0); tco(); }; });
    document.querySelectorAll('[data-ssx]').forEach(function(e){ e.onclick=function(){ PR.tcoSS.splice(+e.dataset.ssx,1); renderSen(); tco(); }; });
    document.querySelectorAll('[data-osm]').forEach(function(e){ e.onchange=function(){ PR.tcoOS[+e.dataset.osm].m=e.value; tco(); }; });
    document.querySelectorAll('[data-osq]').forEach(function(e){ e.oninput=e.onchange=function(){ PR.tcoOS[+e.dataset.osq].q=Math.max(0,+e.value||0); tco(); }; });
    document.querySelectorAll('[data-osx]').forEach(function(e){ e.onclick=function(){ PR.tcoOS.splice(+e.dataset.osx,1); renderSen(); tco(); }; });
  }
  var LASTT=null;                                                    // 마지막 SaaS 계산값 (견적서 비교용)
  function tco(){
    var p=PR.tcoP||'nac', dRate=PR.tcoD||0.30;                       // dRate = 지불 비율 (70%할인=0.30)
    var n=+$('#ptQty').value||0, y=+$('#ptY').value||1;
    var zq=p==='ztna'? Math.max(0,+$('#ptZQ').value||0) : 0;
    $('#ptZW').style.display=p==='ztna'?'':'none';
    function clear(){ $('#ptO').textContent=$('#ptV').textContent='—'; $('#ptOs').textContent=''; $('#ptCfg').innerHTML=''; $('#ptB').innerHTML=''; var c0=document.getElementById('ptCmp'); if(c0) c0.innerHTML='<p class="cap" style="padding:14px 0">노드 수를 입력하면 비교합니다.</p>'; }
    if(!n){ $('#ptS').textContent='—'; $('#ptSs').textContent=''; clear(); LASTT={saas:null,y:y}; renderQuoteCmp(); return; }
    // ── SaaS: 3년 약정 엔드가(소비자가) + 센서(월 5·10·15만원/대) (+ ZTNA 선택 시 PA Agent)
    var ti=prNacTier(n), saasMon=null, sTxt='';
    if(ti>=0){
      var rate=D.cnac.rows[ti][4];                                   // 3년 약정 단가
      saasMon=rate*n;
      sTxt='Cloud NAC '+D.cnac.rows[ti][0]+' 구간 '+prWon(rate)+'원/노드·월';
      if(p==='ztna'){
        var zi=prNacTier(zq);
        if(zq&&zi>=0){ var zr=D.ztna.rows[zi][4]; saasMon+=zr*zq; sTxt+=' + ZTNA PA '+prWon(zq)+'개 × '+prWon(zr)+'원/월'; }
        else { saasMon=null; sTxt=zq?'ZTNA 동시접속 3,000 초과 — 별도 협의':'ZTNA 동시접속 수를 입력하세요'; }
      }
      var sMon=0, sParts=[];
      PR.tcoSS.forEach(function(r){ if(!r.q) return; sMon+=r.p*r.q; sParts.push((r.p/10000)+'만원×'+r.q+'대'); });
      if(saasMon!=null&&sMon>0){ saasMon+=sMon; sTxt+=' + 센서 '+sParts.join('·')+' (월 '+prWon(sMon)+'원)'; }
    } else sTxt='3,000노드 초과 — 별도 협의';
    var saas=saasMon!=null? saasMon*12*y : null;
    LASTT={saas:saas, saasMon:saasMon, sTxt:sTxt, y:y};
    $('#ptS').textContent=saas!=null?'₩'+prWon(saas):'별도 협의';
    $('#ptSs').textContent=sTxt+(p==='ztna'?' · SaaS ZTNA는 Cloud NAC 기본 포함':'');
    // ── 구축형: 라이선스 + 정책서버(자동) + 차단센서(수동 선택) → 소비자가 합 × 할인 + 유지보수 10~15%/년
    var bld=prOnpremBuild(p,n);
    $('#ptOL').textContent='구축형 누적 ('+Math.round((1-dRate)*100)+'% 할인가)';
    if(!bld){ clear();
      $('#ptO').textContent='구간 초과 — 별도 협의';
      $('#ptCfg').innerHTML='구축형 '+(p==='nac'?'NAC':'ZTNA')+' 가격표 데이터를 찾을 수 없습니다'; renderQuoteCmp(); return; }
    var senRows=tcoSenRowsO(), senCost=0, senDesc=[];
    PR.tcoOS.forEach(function(r){
      if(!r.q) return;
      var x=senRows.filter(function(v){ return String(v[1])===r.m; })[0]; if(!x) return;
      senCost+=x[2]*r.q; senDesc.push(esc(String(x[1]))+'('+esc(String(x[0]))+') × '+r.q+'대 '+prWon(x[2]*r.q)+'원');
    });
    var consAll=bld.cons+senCost;
    var intro=Math.round(consAll*dRate);
    var cfg='<b>구축형 구성</b> · 라이선스 '+esc(bld.lic.model)+'('+esc(String(bld.lic.name))+') '+prWon(bld.lic.price)+'원';
    if(bld.pc) cfg+=' · 정책서버 '+esc(bld.pc.model)+' '+prWon(bld.pc.price)+'원';
    cfg+=senDesc.length? ' · 센서 '+senDesc.join(' + ') : ' · 센서 없음';
    cfg+=' → 소비자가 합 <b>'+prWon(consAll)+'원</b> → '+Math.round((1-dRate)*100)+'% 할인 도입가 <b>'+prWon(intro)+'원</b>';
    var dMean=dRate===0.40? 'SR 채널 통상가 — 제조사 17.5%p·총판 2.5%p·PR 10%p·SR 10%p'
            : dRate===0.30? '직판·PR 딜 하한(SR 배제선) — 제조사 17.5%p·총판 2.5%p·PR 10%p'
            : '방어 최저가(PR 배제선) — 제조사 17.5%p·총판 2.5%p';
    cfg+=' <span style="color:var(--muted)">('+dMean+')</span>';
    if(bld.over) cfg+=' · <span style="color:var(--critical)">⚠ 일부 구성이 최대 모델 기준 초과 — 별도 협의 필요</span>';
    $('#ptCfg').innerHTML=cfg;
    var onLow=intro+intro*0.10*Math.max(y-1,0), onHigh=intro+intro*0.15*Math.max(y-1,0);
    $('#ptO').textContent='₩'+prWon(Math.round(onLow))+' ~ '+prWon(Math.round(onHigh));
    $('#ptOs').textContent='도입가 '+prWon(intro)+'원 + 유지보수 10~15%/년 × '+Math.max(y-1,0)+'년';
    var verdict='—', vcls='';
    if(saas!=null){ var mid=(onLow+onHigh)/2, diff=Math.round((1-saas/mid)*100);
      if(diff>3){ verdict=y+'년 기준 SaaS가 약 '+diff+'% 저렴'; vcls='win'; }
      else if(diff<-100){ verdict=y+'년 기준 구축형이 저렴 — SaaS가 약 '+(saas/mid).toFixed(1)+'배'; vcls='lose'; }
      else if(diff<-3){ verdict=y+'년 기준 구축형이 약 '+(-diff)+'% 저렴'; vcls='lose'; }
      else { verdict=y+'년 기준 비슷한 수준'; vcls='even'; } }
    if(bld.over) verdict+=(verdict==='—'?'':' · ')+'구축형 별도 협의 필요';
    $('#ptV').textContent=verdict;
    var vb=document.getElementById('ptVbox'); if(vb) vb.className='pr-verdict '+vcls;
    prCmpRender(document.getElementById('ptCmp'), {y:y, n:n, saasMon:saasMon, intro:intro, mL:0.10, mH:0.15,
      cols:['SaaS · 3년 약정 엔드가','구축형 · '+Math.round((1-dRate)*100)+'% 할인가'], saasSub:String(sTxt||'').split(' + ')[0], onSub:'도입가 + 유지보수 10~15%/년'});
    renderQuoteCmp();
  }
  /* ── 실제 구축형 견적서(PDF) 비교 — 휘발성: TCOQ 메모리 변수에만 존재 ── */
  function renderQuoteCmp(){
    var m=document.getElementById('ptQR'); if(!m) return;
    if(!TCOQ){ m.innerHTML=''; return; }
    var q=TCOQ, y=(LASTT&&LASTT.y)||(+$('#ptY').value||1);
    var mr=(typeof q.maint_rate==='number'&&q.maint_rate>0&&q.maint_rate<1)? q.maint_rate:null;
    var mL=(mr!==null?mr:0.10), mH=(mr!==null?mr:0.15);
    var intro=+q.total_offer||0, nQ=+$('#ptQty').value||0, saasMon=LASTT?LASTT.saasMon:null;
    var items=(q.items||[]).map(function(i){ return esc(String((i&&(i.model||i.desc))||''))+((i&&+i.qty>1)?'×'+i.qty:''); }).filter(Boolean).join(' · ');
    /* 승부 월액 = 검토 기간의 구축형 최저 누적과 같아지는 SaaS 월액 */
    var best=null;
    if(intro && saasMon!=null){ var target=Math.floor(intro*(1+mL*Math.max(y-1,0))/(12*y)/1000)*1000; best={k:y, target:target, needDisc: saasMon>target? Math.ceil((1-target/saasMon)*100):0}; }
    var ch=(function(){ var tl=+q.total_list, to=+q.total_offer; if(!tl||!to) return '';
      var rr=to/tl, dd=Math.round((1-rr)*100), c;
      if(rr<=0.22) c='PR 배제선 이하 — 방어 최저가·총판 직대응 수준';
      else if(rr<=0.33) c='SR 배제선 수준 — 직판 또는 PR 직대응 딜 (SR 마진 자리 없음)';
      else if(rr<=0.50) c='SR 채널 딜 범위 — SR 마진 약 '+Math.round((rr-0.30)*100)+'%p 추정';
      else c='채널 마진 여유 충분';
      return '<li>채널 판정: 엔드가 = 소비자가의 '+Math.round(rr*100)+'% (할인 '+dd+'%) → '+c+'</li>'; })();
    m.innerHTML='<div class="pr-qres">'+
      '<div class="pr-qhead"><b>'+esc(String(q.customer||'고객사 미상'))+'</b>'+(q.quote_date?' · '+esc(String(q.quote_date)):'')+' · '+esc(String(q._file||''))+
      (q._model?' <span class="pr-note">(분석: '+esc(String(q._model).replace(/^claude-/,''))+')</span>':'')+
      '<span class="pr-note" style="margin-left:6px">견적 도입가 ₩'+prWon(intro)+' (VAT별도'+(+q.total_vat?' · VAT포함 '+prWon(+q.total_vat)+'원':'')+') · 유지보수 '+(mr!==null? (mr*100)+'%':'10~15%')+'/년</span>'+
      '<button class="pill" id="ptQX" style="height:24px;padding:0 9px;margin-left:auto">지우기</button></div>'+
      '<div id="ptQCmp"></div>'+
      '<details class="pr-det" style="margin-top:10px"><summary>견적 품목 · 산정 근거 · 채널 판정</summary><ul class="pr-note" style="margin:6px 0 0;padding-left:18px">'+
      (items? '<li>견적 품목: '+items+'</li>':'')+
      (saasMon!=null&&LASTT&&LASTT.sTxt? '<li>SaaS 산정: '+LASTT.sTxt+' = 월 '+prWon(saasMon)+'원</li>':'')+
      '<li>방어 SaaS 월액 = 검토 기간의 구축형 총비용(유지보수 최저 가정)과 같아지는 SaaS 월액. 그 이하로 제안하면 SaaS가 이기며, 운영 인력·상면·장비 교체 비용까지 더하면 실제 우위는 더 큽니다.</li>'+
      ch+
      '<li>견적 구성이 위 TCO 계산기에 자동 입력되었습니다'+(PR.tcoP==='ztna'?' — ZTNA 동시접속 Agent 수는 노드수로 가정했으니 실제 값으로 조정하세요.':'.')+' 파일과 결과는 저장되지 않습니다.</li></ul></details></div>';
    prCmpRender(document.getElementById('ptQCmp'), {y:y, n:nQ, saasMon:saasMon, intro:intro, mL:mL, mH:mH, best:best,
      cols:['SaaS · 3년 약정 표준가','실제 구축형 견적'], saasSub:(nQ? nQ+'노드 기준':''), onSub:'도입가 + 유지보수 '+(mr!==null? (mr*100)+'%':'10~15%')+'/년'});
    var x=document.getElementById('ptQX');
    if(x) x.onclick=function(){ TCOQ=null; var f=document.getElementById('ptQF'); if(f) f.value=''; renderQuoteCmp(); };
  }
  function applyQuote(){
    var q=TCOQ; if(!q) return;
    if(q.product==='nac'||q.product==='ztna'){
      PR.tcoP=q.product;
      document.querySelectorAll('[data-tcop]').forEach(function(x){ x.setAttribute('aria-pressed', x.dataset.tcop===q.product?'true':'false'); });
    }
    var lic=(q.items||[]).filter(function(i){ return i&&i.kind==='license'; })[0];
    var n=(lic&&+lic.nodes)? +lic.nodes : 0;
    if(!n&&lic){ var mm=String(lic.model||'').match(/(\d{2,5})/); if(mm) n=+mm[1]; }
    if(n){ $('#ptQty').value=n; if(PR.tcoP==='ztna') $('#ptZQ').value=n; }
    if(+q.total_list&&+q.total_offer){                               // 할인 토글: 제안가/소비자가 비율 근사 (60/70/80 중 최근접)
      var ratio=q.total_offer/q.total_list, best=0.30;
      [0.40,0.30,0.20].forEach(function(c){ if(Math.abs(ratio-c)<Math.abs(ratio-best)) best=c; });
      PR.tcoD=best;
      var bid=best===0.20?'td80':(best===0.40?'td60':'td70');
      document.querySelectorAll('[data-tcod]').forEach(function(x){ x.setAttribute('aria-pressed', x.id===bid?'true':'false'); });
    }
    var names=tcoSenRowsO().map(function(x){ return String(x[1]); });  // 센서 품목 → 가격표 모델 매칭
    var os=[];
    (q.items||[]).forEach(function(i){
      if(!i||i.kind!=='sensor') return;
      var mdl=String(i.model||'').trim();
      var hit=names.filter(function(nm){ return nm===mdl || nm.replace(/[\s_-]/g,'').toLowerCase()===mdl.replace(/[\s_-]/g,'').toLowerCase(); })[0];
      if(hit) os.push({m:hit, q:+i.qty||1});
    });
    if(os.length) PR.tcoOS=os;
    renderSen(); tco();
  }
  async function quoteGo(){
    var fi=document.getElementById('ptQF'), m=document.getElementById('ptQR');
    var f=fi&&fi.files&&fi.files[0];
    if(!f){ m.innerHTML='<span class="pr-note">PDF 파일을 먼저 선택하세요</span>'; return; }
    if(!/pdf$/i.test(f.type||'')&&!/\.pdf$/i.test(f.name||'')){ m.innerHTML='<span style="color:var(--critical)">PDF 파일만 분석할 수 있습니다</span>'; return; }
    if(f.size>4*1024*1024){ m.innerHTML='<span style="color:var(--critical)">4MB 이하 PDF만 가능합니다</span>'; return; }
    m.innerHTML='<span class="pr-note">⏳ AI가 견적서를 읽는 중… (10~20초)</span>';
    try{
      var b64=await new Promise(function(res,rej){
        var rd=new FileReader();
        rd.onload=function(){ res(String(rd.result).split(',')[1]||''); };
        rd.onerror=function(){ rej(new Error('파일을 읽지 못했습니다')); };
        rd.readAsDataURL(f);
      });
      var j=await aiFetch({mode:'quote', pdf:b64});
      if(!j||!j.ok||!j.quote) throw new Error((j&&j.error)||'분석 실패');
      TCOQ=j.quote; TCOQ._file=f.name; TCOQ._model=j.model||'';
      applyQuote();
      toast('견적서 분석 완료', (TCOQ.customer||'')+' → TCO 계산기에 적용');
    }catch(e){ m.innerHTML='<span style="color:var(--critical)">분석 실패: '+esc(String(e.message||e))+'</span>'; }
  }
  document.querySelectorAll('[data-prbasis]').forEach(function(b){
    b.onclick=function(){ PR.basis=b.dataset.prbasis; prPaintMain(); };
  });
  ['pnQty','pnTerm','pnZ','pnZQ'].forEach(function(i){ var e=document.getElementById(i); if(e){ e.onchange=nac; e.oninput=nac; } });
  document.querySelectorAll('[data-prs]').forEach(function(e){ e.onchange=mdr; });
  ['pmQty','pmWho'].forEach(function(i){ var e=document.getElementById(i); if(e){ e.onchange=mdr; e.oninput=mdr; } });
  ['ptQty','ptY','ptZQ'].forEach(function(i){ var e=document.getElementById(i); if(e){ e.onchange=tco; e.oninput=tco; } });
  var eA=document.getElementById('ptSsAdd'); if(eA) eA.onclick=function(){ PR.tcoSS.push({p:50000,q:1}); renderSen(); tco(); };
  var eB=document.getElementById('ptOsAdd'); if(eB) eB.onclick=function(){ PR.tcoOS.push(tcoOsDefault()); renderSen(); tco(); };
  var eQ=document.getElementById('ptQGo'); if(eQ) eQ.onclick=quoteGo;
  document.querySelectorAll('[data-tcop]').forEach(function(b){
    b.onclick=function(){ PR.tcoP=b.dataset.tcop;
      document.querySelectorAll('[data-tcop]').forEach(function(x){ x.setAttribute('aria-pressed', x===b?'true':'false'); });
      PR.tcoOS=null; renderSen(); tco(); };            // 제품 전환 시 센서 모델 목록도 교체
  });
  document.querySelectorAll('[data-tcod]').forEach(function(b){
    b.onclick=function(){ PR.tcoD=b.dataset.tcod==='80'?0.20:(b.dataset.tcod==='60'?0.40:0.30);
      document.querySelectorAll('[data-tcod]').forEach(function(x){ x.setAttribute('aria-pressed', x===b?'true':'false'); });
      tco(); };
  });
  var _tp=document.getElementById(PR.tcoP==='ztna'?'tpZtna':'tpNac'); if(_tp)_tp.setAttribute('aria-pressed','true');
  var _td=document.getElementById(PR.tcoD===0.20?'td80':(PR.tcoD===0.40?'td60':'td70')); if(_td)_td.setAttribute('aria-pressed','true');
  nac(); mdr(); renderSen(); tco();
}
/* 새 판 등록 (슈퍼 관리자) */
