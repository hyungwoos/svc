/* ===== cloud.js — 클라우드 비용 (AWS·NCP 인보이스 · 환율 · 화면) =====
   ㊿+153: price.js 에서 나눔 — 포탈 AI 가 클라우드 숫자(clBuild·clFxRate)를 쓰므로 처음부터 불러오고, 가격표(price.js)는 처음 열 때 불러옴 */
import { ST } from './state.js';
import { Viz } from './viz.js';
import { $, cssv } from './core.js';
import { sbTry, sbWrite, toast } from './shell.js';
import { esc } from './dash.js';
import { loadLib, loadWorkerBlob, PDFJS_WORKER } from './analysis.js';
import { logChange, ovlMarkDirty } from './edit.js';

/* ==================================================================
   도구 › 클라우드 비용
   · 계정(AWS 5+1 · 공공기관 NCP) × 월 × 서비스 금액 — cloud_costs 표
   · 매달 받는 클라이온 AWS 인보이스(PDF)를 올리면 브라우저(pdf.js)에서 읽어 행으로 저장합니다
     PDF 파일은 저장하지 않습니다 (용량) — 읽은 값과 파일명만 남김
   ================================================================== */
export var CL={mode:'aws', sel:null, months:null, mon:'all',
  cur:(function(){ try{ return localStorage.getItem('svc_cloud_cur')||'usd'; }catch(e){ return 'usd'; } })(),   // 통화 표시 usd|krw (이 브라우저 설정)
  fxNow:null};   // sel = 선택된 AWS 계정 id 집합

export function loadCloud(cb){
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
export function clSvcKey(n){
  n=String(n||'').trim().replace(/\s+/g,' ');
  if(/^AmazonCloudWatch$/i.test(n)) return 'CloudWatch';
  n=n.replace(/^(Amazon|AWS)\s+/,'');
  n=n.replace(/^Elastic Container Service for Kubernetes$/,'Elastic Kubernetes Service');
  return n;
}
/* cloud_costs 행 → 화면용 구조 {months[], acc:{id:{label,color,currency,rows:[{n,v[]}],totals[],linked:[...]}}} */
export function clBuild(){
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

export var CL_FX_DEFAULT=1400;
/* 현재 환율(원/USD) — 외부에서 받아 6시간 캐시. 실패하면 가장 최근 인보이스의 적용 환율, 그것도 없으면 기본값 */

export function clFxCached(){ try{ var c=JSON.parse(sessionStorage.getItem('svc_fx_usdkrw')||'null'); if(c && Date.now()-c.at<6*3600*1000) return c; }catch(e){} return null; }
export async function clFetchFx(force){
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
export function clFxRate(){ return (CL.fxNow&&CL.fxNow.rate)||CL_FX_DEFAULT; }
/* 값 변환: 원 통화(a.currency) → 표시 통화. krw 모드는 «천원» 숫자 · 환율은 현재 환율 하나를 전 기간에 적용 */
export function clConv(v, currency){
  if(v==null) return null;
  var fx=clFxRate();
  if(CL.cur==='krw') return (currency==='KRW'? v : v*fx)/1000;
  return currency==='KRW'? v/fx : v;
}
export function clIsK(){ return CL.cur==='krw'; }
/* 표시 통화 포맷 — krw 모드: 천원 숫자(단위 배지가 따로 있음), usd 모드: $ */
export function clF(v){ return clIsK()? Math.round(v).toLocaleString('ko-KR') : '$'+Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
export function clFk(v){ return clIsK()? Math.round(v).toLocaleString('ko-KR') : '$'+Math.round(v).toLocaleString('en-US'); }
export function clUnit(){ return clIsK()? '천원' : 'USD'; }
/* AI 질문 전에 클라우드 비용 데이터를 한 번 확보 (없으면 조용히 통과) */
export function clEnsure(){
  var pf = CL.fxNow? Promise.resolve() : clFetchFx().catch(function(){});
  var pd = RAWX.cloud? Promise.resolve() : new Promise(function(res){ var t=setTimeout(res, 4000); try{ loadCloud(function(){ clearTimeout(t); res(); }); }catch(e){ res(); } });
  return Promise.all([pf,pd]);
}
export var clU=function(v){ return '$'+Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); };
export var clUk=function(v){ return '$'+Math.round(v).toLocaleString('en-US'); };
export var clW=function(v){ return '₩'+Math.round(v).toLocaleString('ko-KR'); };
export function clSum(a){ return a.reduce(function(s,x){ return s+(x||0); },0); }
export function clCell(v){ if(v==null) return '<td class="n z">–</td>'; if(Math.abs(v)<(clIsK()?0.5:0.005)) return '<td class="n z">0</td>'; return '<td class="n">'+clF(v)+'</td>'; }
export function clDelta(prev,cur){
  if(prev==null||cur==null) return '<span class="dl flat">–</span>';
  var d=cur-prev; if(Math.abs(d)<(clIsK()?0.5:0.005)) return '<span class="dl flat">±0</span>';
  var p=prev? Math.abs(d/prev*100).toFixed(1)+'%':'';
  return '<span class="dl '+(d>0?'up':'down')+'">'+(d>0?'▲':'▼')+' '+clF(Math.abs(d))+(p?' ('+p+')':'')+'</span>';
}
export function clMonLabel(m){ return m.slice(2,4)+'.'+m.slice(5,7); }

export function renderCloud(){
  var host=$('#clBody');
  if(!RAWX.cloud){
    host.innerHTML='<div class="cap" style="padding:40px;text-align:center">클라우드 비용을 불러오는 중…</div>';
    loadCloud(function(){ if(ST.CUR_VIEW==='cloud') renderCloud(); });
    return;
  }
  if(!CL.fxNow){
    host.innerHTML='<div class="cap" style="padding:40px;text-align:center">현재 환율을 확인하는 중…</div>';
    clFetchFx().then(function(){ if(ST.CUR_VIEW==='cloud') renderCloud(); });
    return;
  }
  var B=clBuild(); CL.B=B;
  if(!B.months.length){
    host.innerHTML='<section class="card c12" style="max-width:640px;margin:0 auto;text-align:center;padding:40px">'+
      '<h3 style="margin:0 0 8px">☁️ 클라우드 비용</h3><p class="cap">데이터가 없습니다 — 54_cloud_cost.sql 실행이 필요합니다.</p></section>';
    return;
  }
  if(!CL.sel) CL.sel={}; if(!Object.keys(CL.sel).length) B.awsKeys.forEach(function(k){ CL.sel[k]=1; });
  var canEdit=!!(ST.SB_TOKEN && !window.IS_VIEWER && (window.IS_SUPER || window.MY_ROLE==='admin'));
  var first=B.months[0], last=B.months[B.months.length-1];
  var head='<div class="pr-top">'+
    '<span style="font-size:18px;font-weight:600;letter-spacing:-.01em">클라우드 비용</span>'+
    '<div class="eqb-seg" id="clCur" role="group" aria-label="통화"><button type="button" data-c="usd" aria-pressed="'+(!clIsK())+'">$ USD 세전</button><button type="button" data-c="krw" aria-pressed="'+clIsK()+'">₩ 천원 환산</button></div>'+
    '<span class="pr-ver">'+esc(first.replace('-','년 ')+'월')+' ~ '+esc(last.replace('-','년 ')+'월')+' · 인보이스 '+B.inv.length+'건</span>'+
    '<span style="flex:1"></span>'+
    '<button class="pill ghost" id="clFxBtn" title="'+esc('출처: '+CL.fxNow.src+(CL.fxNow.when? ' · '+CL.fxNow.when:'')+' · 누르면 다시 받아옵니다')+'">환율 '+Number(CL.fxNow.rate).toLocaleString('ko-KR')+'원/$'+(CL.fxNow.live? '':' (외부 조회 실패 · '+esc(CL.fxNow.src)+')')+'</button>'+
    (canEdit? '<button class="pill pri" id="clAdd">＋ 인보이스 PDF 추가</button>':'')+
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
    det('tbl','서비스 × 월 비용 내역', '<h3 id="clTableT" style="margin:0 0 8px;font-size:13.5px">서비스 × 월 비용 내역</h3><div class="tbl-wrap" tabindex="0" style="max-height:none"><table class="pr" id="clTable"></table></div><p class="cap" id="clNote" style="margin-top:8px"></p>')+
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
export function clSummary(B){
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
export function clDetVis(){
  var m=document.getElementById('clMdr'), d1=document.querySelector('details.cl-det[data-k="mdr"]'); if(m&&d1) d1.style.display=(m.style.display==='none')? 'none':'';
  var a=document.getElementById('clAcct'), l=document.getElementById('clLinked'), d2=document.querySelector('details.cl-det[data-k="acct"]');
  if(d2){ var vis=(a&&a.style.display!=='none')||(l&&l.style.display!=='none'); d2.style.display=vis? '':'none';
    var cap=document.getElementById('clAcctCap'); if(cap) cap.textContent=(a&&a.style.display!=='none')? '선택 계정 '+((CL.B&&clSelKeys(CL.B).length)||0)+'개' : (l&&l.style.display!=='none'? '통합청구 연결 계정':''); }
}
/* 포탈 공통 차트(Viz) — 계정이 여러 개면 누적 영역(MRR 추이와 같은 형태), 하나면 막대 */
export function clBars(el, M, series, fmt, forceBars){
  el.className='chartbox '+(el.dataset.h||'h260'); el.innerHTML='';
  var labels=M.map(clMonLabel);
  var sers=series.map(function(s0){ return {label:s0.label||'', data:s0.vals.map(function(v){ return v||0; }), color:s0.color}; });
  if(!sers.some(function(s0){ return s0.data.some(function(v){ return v; }); })){ el.innerHTML='<p class="cap" style="padding:20px">표시할 데이터가 없습니다</p>'; return; }
  var f=function(v){ return fmt(v); };
  if(sers.length===1 || forceBars) Viz.bars(el,{labels:labels, series:sers, fmt:f, padL:64, maxBar:sers.length>1? 18:30});
  else Viz.area(el,{labels:labels, series:sers, fmt:f, padL:64});
}
export function clMdr(B){
  var box=$('#clMdr'); var A=B.acc.edr, T=B.acc.tac;
  if(!A||!T||!A.rows.length||!T.rows.length){ box.style.display='none'; return; }
  var M=B.months;
  box.style.display='';
  box.innerHTML='<p class="cap" style="margin:0 0 6px">'+(clIsK()? '원화 환산 천원':'세전 USD')+'</p><div class="cl-legend">'+
    [A,T].map(function(a){ return '<span><i style="background:'+a.color+'"></i>'+esc(a.label+' · '+a.purpose)+'</span>'; }).join('')+'</div><div id="clMdrChart" class="chartbox h220" data-h="h220"></div>'+
    '<div class="tbl-wrap" tabindex="0" style="max-height:none;margin-top:10px"><table class="pr" id="clMdrT"></table></div>';
  clBars(document.getElementById('clMdrChart'), M, [{label:A.label,vals:A.dtotals,color:A.color},{label:T.label,vals:T.dtotals,color:T.color}], clFk, true);
  var li=M.length-1;
  var h='<thead><tr><th>계정</th>'+M.map(function(m){ return '<th class="n">'+clMonLabel(m)+'</th>'; }).join('')+'<th class="n">합계</th><th class="n">'+clMonLabel(M[li])+' 전월비</th></tr></thead><tbody>';
  function row(a){ return '<tr><td><span style="display:inline-block;width:8px;height:8px;background:'+a.color+';margin-right:6px;border-radius:2px"></span>'+esc(a.label+' · '+a.purpose)+'</td>'+
    a.dtotals.map(function(v){ return clCell(v); }).join('')+'<td class="n"><b>'+clF(clSum(a.dtotals))+'</b></td><td class="n">'+clDelta(a.dtotals[li-1],a.dtotals[li])+'</td></tr>'; }
  var comb=M.map(function(_,i){ return (A.dtotals[i]==null&&T.dtotals[i]==null)? null : (A.dtotals[i]||0)+(T.dtotals[i]||0); });
  h+=row(A)+row(T)+'<tr class="tot"><td>합계</td>'+comb.map(function(v){ return clCell(v); }).join('')+'<td class="n">'+clF(clSum(comb))+'</td><td class="n">'+clDelta(comb[li-1],comb[li])+'</td></tr></tbody>';
  document.getElementById('clMdrT').innerHTML=h;
}
export function clSelKeys(B){ return B.awsKeys.filter(function(k){ return CL.sel[k]; }); }
export function clChips(B){
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
export function clChart(B){
  var isN=CL.mode==='ncp', M=B.months;
  var series=isN? [{label:B.acc[B.ncp].label,color:B.acc[B.ncp].color,vals:B.acc[B.ncp].dtotals}]
                : clSelKeys(B).map(function(k){ var a=B.acc[k]; return {label:a.label+' · '+a.purpose,color:a.color,vals:a.dtotals}; });
  $('#clLegend').innerHTML=series.map(function(s){ return '<span><i style="background:'+s.color+'"></i>'+esc(s.label)+'</span>'; }).join('');
  clBars(document.getElementById('clChart'), M, series, clFk);
  var ks=clSelKeys(B);
  var U=clUnit();
  $('#clChartT').textContent= isN? '월별 비용 추이 · 공공기관 NCP ('+U+')' : ks.length===B.awsKeys.length? '월별 비용 추이 · AWS '+ks.length+'개 계정 누적 ('+U+')' : ks.length===1? '월별 비용 추이 · '+B.acc[ks[0]].label+' ('+U+')' : '월별 비용 추이 · 선택 '+ks.length+'개 계정 누적 ('+U+')';
}
export function clAcctOverview(B){
  var p=$('#clAcct'), ks=clSelKeys(B), M=B.months, li=M.length-1;
  if(CL.mode==='ncp'||ks.length<2){ p.style.display='none'; return; }
  p.style.display='';
  var grand=ks.reduce(function(s,k){ return s+clSum(B.acc[k].dtotals); },0);
  var rows=ks.map(function(k){ var a=B.acc[k], sum=clSum(a.dtotals), nm=a.dtotals.filter(function(x){ return x!=null; }).length;
    return {sum:sum, html:'<tr><td><span style="display:inline-block;width:8px;height:8px;background:'+a.color+';margin-right:6px;border-radius:2px"></span>'+esc(a.purpose)+'</td>'+
      '<td>'+esc(a.email)+'<br><span class="cap">'+esc(a.acct)+' · '+esc(a.label)+'</span></td><td class="n"><b>'+clF(sum)+'</b></td><td class="n">'+clFk(sum/(nm||1))+'</td>'+
      '<td class="n">'+(sum/grand*100).toFixed(1)+'%</td><td class="n">'+clDelta(a.dtotals[li-1],a.dtotals[li])+'</td></tr>'}; }).sort(function(a,b){ return b.sum-a.sum; });
  p.innerHTML='<h3>선택 계정 개요 <small>용도별 비용 · '+clUnit()+'</small></h3><div class="tbl-wrap" tabindex="0" style="max-height:none"><table class="pr"><thead><tr><th>용도</th><th>계정</th><th class="n">합계</th><th class="n">월평균</th><th class="n">선택 내 비중</th><th class="n">'+clMonLabel(M[li])+' 전월비</th></tr></thead><tbody>'+
    rows.map(function(r){ return r.html; }).join('')+'</tbody></table></div><p class="cap" style="margin-top:8px">비중은 현재 선택된 계정 합계 대비 · 월평균은 각 계정의 집계 월수 기준</p>';
}
export function clLinked(B){
  var p=$('#clLinked'), ks=clSelKeys(B), M=B.months, li=M.length-1;
  var only=(CL.mode==='aws'&&ks.length===1)? B.acc[ks[0]] : null;
  if(!only || !only.linked.length){ p.style.display='none'; return; }
  p.style.display='';
  var rows=only.linked.slice().sort(function(a,b){ return clSum(b.d)-clSum(a.d); });
  var tot=M.map(function(_,i){ return rows.reduce(function(s,r){ return s+(r.v[i]||0); },0)||null; });
  p.innerHTML='<h3>'+esc(only.label)+' 통합청구 · 연결 계정별 비용 <small>'+clUnit()+'</small></h3><div class="tbl-wrap" tabindex="0" style="max-height:none"><table class="pr"><thead><tr><th>연결 계정</th>'+
    M.map(function(m){ return '<th class="n">'+clMonLabel(m)+'</th>'; }).join('')+'<th class="n">합계</th><th class="n">'+clMonLabel(M[li])+' 전월비</th></tr></thead><tbody>'+
    rows.map(function(r){ return '<tr><td>'+esc(r.n)+'</td>'+r.d.map(function(x){ return clCell(x); }).join('')+'<td class="n"><b>'+clF(clSum(r.d))+'</b></td><td class="n">'+clDelta(r.d[li-1],r.d[li])+'</td></tr>'; }).join('')+
    '<tr class="tot"><td>합계</td>'+tot.map(function(t){ return clCell(t); }).join('')+'<td class="n">'+clF(clSum(tot))+'</td><td class="n">'+clDelta(tot[li-1],tot[li])+'</td></tr></tbody></table></div>'+
    '<p class="cap" style="margin-top:8px">통합청구서의 계정별 요금 기준 · «–»는 해당 월 청구 내역 없음</p>';
}
export function clTable(B){
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
export function clInvList(B, canEdit){
  var p=$('#clInv'); var inv=(B.inv||[]).slice();
  var byM={}; inv.forEach(function(i){ (byM[String(i.ym).slice(0,7)]=byM[String(i.ym).slice(0,7)]||[]).push(i); });
  var months=B.months.slice().reverse();
  var h='';
  if(!inv.length) h+='<p class="cap">보관된 인보이스가 없습니다'+(canEdit? ' — 위 «＋ 인보이스 PDF 추가» 로 올려주세요.':'.')+'</p>';
  else{
    h+='<div class="tbl-wrap" tabindex="0" style="max-height:none"><table class="pr"><thead><tr><th>사용 월</th><th>계정</th><th class="n">전체합계(USD)</th><th class="n">환율</th><th class="n">공급가액(₩)</th><th class="n">총 청구(VAT 포함)</th><th>파일</th><th>올린 사람</th>'+(canEdit?'<th></th>':'')+'</tr></thead><tbody>';
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
export async function clDeleteInvoice(id){
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
export function clLoadPdfjs(){
  if(window.pdfjsLib && clLoadPdfjs._w) return Promise.resolve(window.pdfjsLib);
  return loadLib('pdfjs').then(function(){ return loadWorkerBlob(PDFJS_WORKER); }).then(function(u){
    try{ window.pdfjsLib.GlobalWorkerOptions.workerSrc=u||PDFJS_WORKER.urls[0]; }catch(e){}   // 검증 실패 시 pdf.js 가 원격 URL 로 가짜 워커(메인 스레드) 폴백
    clLoadPdfjs._w=true; return window.pdfjsLib;
  }, function(e){ throw new Error('pdf.js 를 불러오지 못했습니다 (네트워크 차단?)'); });
}
/* PDF → 줄 배열 (같은 y 좌표의 글자 조각을 한 줄로) */
export async function clPdfLines(file){
  var lib=await clLoadPdfjs();
  var buf=await file.arrayBuffer();
  var doc=await lib.getDocument({data:new Uint8Array(buf), isEvalSupported:false}).promise;   /* ㊿+147: CSP 에 'unsafe-eval' 없음 — 글꼴 그리기용 eval 시도도 안 함 */
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
export function clParseInvoice(lines){
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
export function clAcctByNo(no){
  var acc=(RAWX.cloud&&RAWX.cloud.acc)||[];
  return acc.filter(function(a){ return String(a.acct_no||'')===String(no); })[0]||null;
}

/* ---------- 인보이스 추가 모달 ---------- */
export function clOpenAdd(){
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
export async function clHandleFiles(files){
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
export function clRenderPreview(){
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
        '<span class="cap">→ 포탈 계정</span><select aria-label="포탈 계정 연결" data-acc="'+ix+':'+ai+'" class="pill" style="height:26px;font:inherit;font-size:12px">'+
          '<option value="">— 선택 —</option>'+accOpts.map(function(o){ return '<option value="'+esc(o.id)+'"'+(o.id===a.accId?' selected':'')+'>'+esc(o.label)+' ('+esc(o.acct_no||'')+')</option>'; }).join('')+
          '<option value="__new">＋ 새 계정으로 등록…</option></select>'+
        '<span class="cap">서비스 '+nz.length+'행 · Sub Total '+(a.subUsd!=null? clU(a.subUsd):'?')+(a.subKrw!=null? ' / '+clW(a.subKrw):'')+'</span>'+
        (dup? '<span class="st dup">이미 있음 → 교체됨'+(dup.file_name? ' ('+esc(dup.file_name)+')':'')+'</span>':'')+
        '</div>';
      if(nz.length) h+='<details style="margin:2px 0 6px"><summary class="cap" style="cursor:pointer">서비스 행 보기</summary><table class="pr" style="font-size:12px"><thead><tr><th>서비스</th><th class="n">금액(USD)</th><th class="n">Credit</th><th class="n">청구(USD)</th><th class="n">청구(₩)</th></tr></thead><tbody>'+
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
export async function clNewAccount(a, done, cancel){
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
export async function clSaveParsed(){
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
          source:'pdf', uploaded_by:ST.AUTH_USER||null, uploaded_at:new Date().toISOString()};
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
  RAWX.cloud=null; if(ST.CUR_VIEW==='cloud') renderCloud();
}
