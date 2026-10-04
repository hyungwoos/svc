/* ===== report.js — 리포트 빌더 · 심화 분석 · PPT 덱 · 데이터 조합(QB) · SQL 모드 =====
   포탈 본체(js/app.js)를 ④ 아키텍처 2단계(㊿+136)에서 기능별로 나눈 파일. 전역 var/function 그대로 — 즉시 실행 문장은 전부 js/init.js 에.
   로드 순서는 index.html <meta name="app-js"> (js/load.js 가 그 순서대로 ?v=APP_VER 를 붙여 불러옴) */


/* ===== 리포트 — 커스텀 리포트 빌더 (모든 값 클릭 수정 · 행 추가 · 자유 슬라이드 → PPT) ===== */
var RP={j:null};
function rpMonthData(j){
  var tot=0, prev=0, act={}, newCt=[], endCt=[];
  DATA.rows.forEach(function(r,i){
    var v=MAT[i][j]; tot+=v;
    if(j>0) prev+=MAT[i][j-1];
    if(v>0) act[r.cust]=1;
    if(r.startIdx===j) newCt.push({r:r, v:v||r.mrr||0});
    if((/해지|종료/.test(r.status||'')) && r.endIdx===j) endCt.push({r:r, v:MAT[i][Math.max(j-1,0)]||r.mrr||0});
  });
  newCt.sort(function(a,b){ return b.v-a.v; }); endCt.sort(function(a,b){ return b.v-a.v; });
  var ym=mk(j), year=+ym.slice(0,4), mon=+ym.slice(5,7);
  var ytd=0;
  for(var jj=Math.max(0,j-mon+1); jj<=j; jj++){ if(mk(jj).slice(0,4)===String(year)) for(var i2=0;i2<MAT.length;i2++) ytd+=MAT[i2][jj]; }
  var mtg=0; (RAWX.mtargets||[]).forEach(function(t){ if(+t.year===year&&+t.month===mon) mtg=Number(t.amount)||0; });
  var ytg=0; (RAWX.targets||[]).forEach(function(t){ if(+t.year===year) ytg=Number(t.amount)||0; });
  var poc=(RAWX.mdrops||[]).filter(function(x){ return String(x.apply_date||'').slice(0,7)===ym; });
  var inb=(RAWX.inbound||[]).filter(function(x){ return String(x.on_date||'').slice(0,7)===ym; });
  var inbWon=inb.filter(function(x){ return /수주/.test(x.result||''); });
  var oiOpen=(RAWX.oi||[]).filter(function(x){ return x.stage==='등록'||x.stage==='진행'; });
  var oiSum=0, oiW=0; oiOpen.forEach(function(x){ var a=Number(x.expect_amount)||0; oiSum+=a; oiW+=a*(Number(x.win_prob)||0)/100; });
  var trend=[]; for(var t=Math.max(0,j-11); t<=j; t++){ var s=0; for(var i3=0;i3<MAT.length;i3++) s+=MAT[i3][t]; trend.push([mk(t),s]); }
  return {j:j, ym:ym, tot:tot, prev:prev, actCnt:Object.keys(act).length, newCt:newCt, endCt:endCt,
    ytd:ytd, mtg:mtg, ytg:ytg, poc:poc, inb:inb, inbWon:inbWon, oiOpen:oiOpen, oiSum:oiSum, oiW:oiW, trend:trend};
}
function rpTotAt(idx){ if(idx==null||idx<0||idx>=M) return 0; var s=0; for(var i=0;i<MAT.length;i++) s+=MAT[i][idx]; return s; }
/* QBR «매출 Review» — 헤드라인 불릿 + 제품별×월별 매출 표 (해당 연도) */
function rpRevData(j){
  var ym=mk(j), year=+ym.slice(0,4), mon=+ym.slice(5,7), jan=j-mon+1;
  var mrr=rpTotAt(j), arrN=mrr*12, yoyA=rpTotAt(j-12)*12;
  var decI=dIdx((year-1)+'-12'), decA=rpTotAt(decI)*12;
  function nacCnt(idx){
    var g={},s1={},all={};
    if(idx!=null&&idx>=0) DATA.rows.forEach(function(r,i){
      if(MAT[i][idx]>0){ if(r.line==='Cloud'){g[r.cust]=1;all[r.cust]=1;} if(r.line==='S1'){s1[r.cust]=1;all[r.cust]=1;} } });
    return {g:Object.keys(g).length, s1:Object.keys(s1).length, all:Object.keys(all).length};
  }
  var nc=nacCnt(j), ncY=nacCnt(j-12);
  var bullets=[''+ym+' 기준 ARR '+won(arrN)+'천원 (월 매출 '+won(mrr)+'천원)'];
  if(yoyA>0) bullets.push('전년 동기 대비 ARR '+pct((arrN/yoyA-1)*100)+' ('+(year-1)+'년 '+mon+'월 ARR '+won(yoyA)+'천원)');
  if(decA>0) bullets.push('전년 12월말 대비 ARR '+pct((arrN/decA-1)*100)+' ('+(year-1)+'년 12월 ARR '+won(decA)+'천원)');
  if(nc.all) bullets.push('Cloud NAC 고객사 '+nc.all+'개사 (일반 '+nc.g+'개사 · 에스원 '+nc.s1+'개사)'+(ncY.all? ' · 전년 동기 대비 '+pct((nc.all/ncY.all-1)*100)+' ('+ncY.all+'개사 → '+nc.all+'개사)':''));
  var groups=[
    {label:'Cloud NAC 일반', f:function(r){return r.line==='Cloud';}},
    {label:'Cloud NAC 에스원', f:function(r){return r.line==='S1';}},
    {label:'MDR', f:function(r){return r.line==='MDR'||r.line==='MDR_S1';}},
    {label:'DRM', f:function(r){return r.line==='DRM';}},
    {label:'DLP', f:function(r){return r.line==='DLP';}},
    {label:'PNS', f:function(r){return r.line==='PNS';}}];
  var cols=[];                                   // {t:'1', idxs:[...]} — 월·분기소계·누계
  var qb=[];
  for(var t=jan;t<=j;t++){
    var mn=t-jan+1;
    cols.push({t:String(mn), idxs:[t]}); qb.push(t);
    if(mn%3===0){ cols.push({t:Math.ceil(mn/3)+'Q', idxs:qb.slice()}); qb=[]; }
  }
  var allM=[]; for(var t2=jan;t2<=j;t2++) allM.push(t2);
  cols.push({t:'누계', idxs:allM});
  function sumG(f,idxs){ var s=0; DATA.rows.forEach(function(r,i){ if(f(r)) idxs.forEach(function(x){ s+=MAT[i][x]; }); }); return s; }
  var rows=[], nacSub=null;
  groups.forEach(function(g,gi){
    var vals=cols.map(function(c){ return sumG(g.f,c.idxs); });
    if(gi>=2 && vals[vals.length-1]===0) return;          // 매출 없는 제품군 생략 (NAC 2행은 유지)
    rows.push([g.label].concat(vals.map(function(v){ return {t:Math.round(v/1000).toLocaleString('ko-KR'), n:1}; })));
    if(gi===1){
      nacSub=cols.map(function(c){ return sumG(function(r){return r.line==='Cloud'||r.line==='S1';},c.idxs); });
      rows.push(['Cloud NAC 소계'].concat(nacSub.map(function(v){ return {t:Math.round(v/1000).toLocaleString('ko-KR'), n:1}; })));
    }
  });
  rows.push(['합계'].concat(cols.map(function(c){ var s=0; c.idxs.forEach(function(x){ s+=rpTotAt(x); }); return {t:Math.round(s/1000).toLocaleString('ko-KR'), n:1}; })));
  var head=[['구분']].concat(cols.map(function(c){ return [c.t,1]; }));
  return {bullets:bullets, head:head, rows:rows, year:year};
}
/* QBR «MDR 고객 현황» — 총 고객사·연도별 신규 수주 나열·PoC 진행 나열 */
function rpMdrData(j){
  var ym=mk(j), year=+ym.slice(0,4);
  function isM(r){ return r.line==='MDR'||r.line==='MDR_S1'; }
  var act={}, actAdd={}, ep=0;
  DATA.rows.forEach(function(r,i){ if(isM(r)&&MAT[i][j]>0){ act[r.cust]=1; if(/Add-?on/i.test(r.combine||'')) actAdd[r.cust]=1; ep+=r.qty||0; } });
  function yearNew(y){
    var out=[];
    DATA.rows.forEach(function(r){
      if(!isM(r)||r.startIdx==null) return;
      if(mk(r.startIdx).slice(0,4)!==String(y)) return;
      out.push(r.cust+(/Add-?on/i.test(r.combine||'')?' (Add-on'+(r.qty?', '+r.qty:'')+')':(r.qty?' ('+r.qty+')':'')));
    });
    return out;
  }
  var cur=yearNew(year), prv=yearNew(year-1);
  var poc=(RAWX.mdrops||[]).filter(function(x){ return ['신청','대기','진행중','데모'].indexOf(x.status||'')>=0; });
  var pocEp=0; poc.forEach(function(x){ pocEp+=Number(x.plan_qty)||0; });
  var actN=Object.keys(act).length, addN=Object.keys(actAdd).length;
  var lines=['총 '+actN+'개 고객사 확보 (MDR '+(actN-addN)+'개사, Add-on '+addN+'개사)'+(ep?' · '+ep.toLocaleString('ko-KR')+'개 엔드포인트 관리 중':'')];
  if(prv.length) lines.push('- '+(year-1)+'년 '+prv.length+'개사 신규 수주: '+prv.join(', '));
  if(cur.length) lines.push('- '+year+'년 '+cur.length+'개사 신규 수주: '+cur.join(', '));
  if(poc.length) lines.push('- '+poc.length+'개사 PoC 진행 중'+(pocEp?' ('+pocEp.toLocaleString('ko-KR')+' 엔드포인트)':'')+': '+poc.map(function(x){ return (x.customer||'-')+(x.plan_qty?' ('+x.plan_qty+')':''); }).join(', '));
  return {lines:lines};
}
/* ==================================================================
   리포트 · 심화 분석 (옵션 — 체크한 것만 리포트에 붙습니다)
   ================================================================== */
var RP_AN={cap:0, seg:0, src:0, arpu:0, chr:0};
var RP_AN_DEFS=[
  ['cap','📈 신규 등록 처리량', '한 달에 최대 몇 개사까지 소화했는지 (조직 Max output)'],
  ['seg','🏭 제품별 고객 집단',  '제품마다 어떤 산업군 고객이 가장 많은지'],
  ['src','🔀 주요 유입 경로',    '고객이 어느 채널·파트너를 통해 들어왔는지'],
  ['arpu','💵 고객 월 매출 평균', '고객사 한 곳당 월 매출 (평균·중앙값·분포)'],
  ['chr','📉 해지율 12개월 추이','최근 1년 churn rate 변화와 주요 원인']
];
function rpAnKey(){ return 'svc_rp_an_'+(AUTH_USER||'anon'); }
function rpAnLoad(){
  try{ var o=JSON.parse(localStorage.getItem(rpAnKey())||'null'); if(o) RP_AN=Object.assign(RP_AN,o); }catch(e){}
}
function rpAnSave(){ try{ localStorage.setItem(rpAnKey(), JSON.stringify(RP_AN)); }catch(e){} }

/* ① 신규 등록 처리량 — 월별 신규 «고객사» 수 (같은 달 여러 계약은 1개사) */
function rpAnCap(j){
  var n=Math.min(24, j+1), from=j-n+1;
  var custM={}, ctM={};
  for(var t=from;t<=j;t++){ custM[t]={}; ctM[t]=0; }
  DATA.rows.forEach(function(r){
    var st=(r.startIdx!=null? r.startIdx : r._f);
    if(st==null||st<from||st>j) return;
    custM[st][r.cust]=1; ctM[st]++;
  });
  var series=[];
  for(var t2=from;t2<=j;t2++) series.push({ym:mk(t2), cust:Object.keys(custM[t2]).length, ct:ctM[t2]});
  var v=series.map(function(x){ return x.cust; });
  var max=Math.max.apply(null, v.concat([0]));
  var maxM=series.filter(function(x){ return x.cust===max; }).map(function(x){ return x.ym; });
  var sorted=v.slice().sort(function(a,b){ return a-b; }), N=sorted.length;
  var med=N? (N%2? sorted[(N-1)/2] : (sorted[N/2-1]+sorted[N/2])/2) : 0;
  var avg=N? v.reduce(function(a,b){return a+b;},0)/N : 0;
  var l12=v.slice(-12), avg12=l12.length? l12.reduce(function(a,b){return a+b;},0)/l12.length : 0;
  var p90=N? sorted[Math.min(N-1, Math.floor(N*0.9))] : 0;
  var zero=v.filter(function(x){ return x===0; }).length;
  return {series:series, n:n, max:max, maxM:maxM, med:med, avg:avg, avg12:avg12, p90:p90, zero:zero,
    ctMax:Math.max.apply(null, series.map(function(x){return x.ct;}).concat([0]))};
}
/* ② 제품별 고객 집단 — 활성 고객사의 산업군 분포 */
function rpAnSeg(j){
  var by={};
  DATA.rows.forEach(function(r,i){
    if(!(MAT[i][j]>0)) return;
    var L=lline(r.line), ind=r.sector||('미분류'+(r.ind&&r.ind!=='미분류'? '('+r.ind+')':''));   // 세부 업종(sector) 우선
    var o=(by[L]=by[L]||{});
    var g=(o[ind]=o[ind]||{n:0, mrr:0, custs:{}});
    if(!g.custs[r.cust]){ g.custs[r.cust]=1; g.n++; }
    g.mrr+=MAT[i][j];
  });
  return Object.keys(by).map(function(L){
    var arr=Object.keys(by[L]).map(function(k){ return {ind:k, n:by[L][k].n, mrr:by[L][k].mrr}; })
      .sort(function(a,b){ return b.n-a.n || b.mrr-a.mrr; });
    return {line:L, tot:arr.reduce(function(s,x){return s+x.n;},0), top:arr.slice(0,3), all:arr};
  }).sort(function(a,b){ return b.tot-a.tot; });
}
/* ③ 유입 경로 — 채널·파트너별 고객사 수와 매출 + 올해 인바운드 유입 */
function rpAnSrc(j){
  var ch={}, pt={}, all={}, mrr=0;
  DATA.rows.forEach(function(r,i){
    var v=MAT[i][j]; if(!(v>0)) return;
    all[r.cust]=1; mrr+=v;
    [[ch, chOf(r)], [pt, r.ptn||'직접']].forEach(function(pair){   // ptn = 실제 영업 파트너 (partner 는 계산서 발행처)
      var m=pair[0], k=pair[1];
      var o=(m[k]=m[k]||{n:0, mrr:0, custs:{}});
      if(!o.custs[r.cust]){ o.custs[r.cust]=1; o.n++; }
      o.mrr+=v;
    });
  });
  function arr(m){ return Object.keys(m).map(function(k){ return {name:k, n:m[k].n, mrr:m[k].mrr}; })
    .sort(function(a,b){ return b.n-a.n || b.mrr-a.mrr; }); }
  var yr=mk(j).slice(0,4), inb={};
  (RAWX.inbound||[]).forEach(function(x){ if(String(x.y)!==yr) return; inb[x.channel||'미기재']=(inb[x.channel||'미기재']||0)+1; });
  var inbArr=Object.keys(inb).map(function(k){ return {name:k, n:inb[k]}; }).sort(function(a,b){ return b.n-a.n; });
  return {ch:arr(ch), ptn:arr(pt), custN:Object.keys(all).length, mrr:mrr, inb:inbArr, inbYear:yr};
}
/* ④ 고객 월 매출 평균 — 고객사 단위로 합산 후 평균·중앙값·분포 */
function rpAnArpu(j){
  var perCust={}, perLine={};
  DATA.rows.forEach(function(r,i){
    var v=MAT[i][j]; if(!(v>0)) return;
    perCust[r.cust]=(perCust[r.cust]||0)+v;
    var L=lline(r.line), o=(perLine[L]=perLine[L]||{custs:{}, mrr:0});
    o.custs[r.cust]=1; o.mrr+=v;
  });
  var vals=Object.keys(perCust).map(function(k){ return perCust[k]; }).sort(function(a,b){ return a-b; });
  var n=vals.length, sum=vals.reduce(function(a,b){return a+b;},0);
  function pctl(p){ return n? vals[Math.min(n-1, Math.floor(n*p))] : 0; }
  var lines=Object.keys(perLine).map(function(L){
    var cs=Object.keys(perLine[L].custs).length;
    return {line:L, n:cs, mrr:perLine[L].mrr, avg: cs? perLine[L].mrr/cs : 0};
  }).sort(function(a,b){ return b.avg-a.avg; });
  var bands=[[0,5e5,'50만원 미만'],[5e5,1e6,'50~100만원'],[1e6,3e6,'100~300만원'],
             [3e6,5e6,'300~500만원'],[5e6,Infinity,'500만원 이상']];
  var dist=bands.map(function(b){
    var c=vals.filter(function(v){ return v>=b[0]&&v<b[1]; }).length;
    return {label:b[2], n:c, pct: n? c/n*100 : 0};
  });
  var top=Object.keys(perCust).map(function(k){ return {cust:k, v:perCust[k]}; })
    .sort(function(a,b){ return b.v-a.v; }).slice(0,5);
  return {n:n, sum:sum, avg: n? sum/n : 0,
    med: n? (n%2? vals[(n-1)/2] : (vals[n/2-1]+vals[n/2])/2) : 0,
    p25:pctl(.25), p75:pctl(.75), lines:lines, dist:dist, top:top};
}
/* ⑤ 최근 12개월 해지율 — 재약정(계약 승계)은 이탈에서 제외 */
function rpAnChurn(j){
  var all=churnRows(), from=Math.max(0, j-11);
  var real=all.filter(function(x){ return !x.renew; });
  var byM={}; real.forEach(function(x){ (byM[x.e]=byM[x.e]||[]).push(x); });
  function activeN(t){ if(t<0) return 0; var s={}; DATA.rows.forEach(function(r,i){ if(MAT[i][t]>0) s[r.cust]=1; }); return Object.keys(s).length; }
  var series=[];
  for(var t=from;t<=j;t++){
    var base=activeN(t-1);
    var lost={}; (byM[t]||[]).forEach(function(x){ lost[x.cust]=1; });
    var ln=Object.keys(lost).length;
    series.push({ym:mk(t), base:base, lost:ln, rate: base? ln/base*100 : 0,
      amt:(byM[t]||[]).reduce(function(s2,x){ return s2+x.amt; },0)});
  }
  function avgR(a){ return a.length? a.reduce(function(s2,x){ return s2+x.rate; },0)/a.length : 0; }
  var rs={};
  real.filter(function(x){ return x.e>=from&&x.e<=j; }).forEach(function(x){
    var k=x.reason||'미기재', o=(rs[k]=rs[k]||{n:0, amt:0}); o.n++; o.amt+=x.amt; });
  var reasons=Object.keys(rs).map(function(k){ return {reason:k, n:rs[k].n, amt:rs[k].amt}; })
    .sort(function(a,b){ return b.n-a.n || b.amt-a.amt; });
  var half=Math.floor(series.length/2);
  return {series:series, avg:avgR(series), h1:avgR(series.slice(0,half)), h2:avgR(series.slice(half)),
    reasons:reasons,
    totLost:series.reduce(function(s2,x){ return s2+x.lost; },0),
    totAmt:series.reduce(function(s2,x){ return s2+x.amt; },0),
    renewN:all.filter(function(x){ return x.renew && x.e>=from && x.e<=j; }).length};
}

/* 분석 카드 HTML — 켜진 것만 그립니다 */
function rpAnHtml(j, inc, tbl){
  var h='';
  function card(key, title, sub, inner){
    return '<div class="pr-card" style="margin-bottom:14px"><h3>'+title+
      '<span class="ubadge sm">₩ 천원</span>'+
      '<small>'+esc(sub)+'</small>'+inc(key)+'</h3>'+inner+'</div>';
  }
  function kpi(l,v,s2,kx){ return '<div class="pr-ob"'+(kx?' data-kx="'+kx+'"':'')+'><div class="l">'+l+'</div><div class="v">'+v+'</div><div class="pr-note">'+(s2||'&nbsp;')+'</div></div>'; }
  function obox(inner){ return '<div class="pr-out" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:10px">'+inner+'</div>'; }
  function n0(v){ return Math.round(v).toLocaleString('ko-KR'); }

  /* ① 신규 등록 처리량 */
  if(RP_AN.cap){
    var c=rpAnCap(j);
    var inner=obox(
      kpi('월 최대 신규', c.max+'개사', c.maxM.join(', ')+' 달성','an_cap')+
      kpi('상위 10% 수준', c.p90+'개사', '이 정도면 «잘 돌아간 달»','an_cap')+
      kpi('월 평균', (Math.round(c.avg*10)/10)+'개사', '최근 '+c.n+'개월','an_cap')+
      kpi('최근 12개월 평균', (Math.round(c.avg12*10)/10)+'개사', c.avg12>=c.avg? '평균 이상 유지':'평균보다 낮아짐','an_cap')+
      kpi('중앙값', c.med+'개사', '신규 0건인 달 '+c.zero+'회','an_cap'));
    inner+=tbl('rpTblCap',[['월'],['신규 고객사',1],['신규 계약',1]],
      c.series.slice().reverse().map(function(x){ return [x.ym,{t:x.cust,n:1},{t:x.ct,n:1}]; }),'데이터 없음');
    inner+='<p class="pr-note" style="margin-top:6px">같은 달에 한 고객사가 여러 계약을 해도 <b>1개사</b>로 셉니다 (계약 건수는 따로 표시). '+
      '지금 인원·프로세스에서 실제로 소화한 상한이 <b>월 '+c.max+'개사</b>, 평상시 처리량은 <b>월 '+(Math.round(c.avg12*10)/10)+'개사</b> 수준입니다.</p>';
    h+=card('cap','📈 <span contenteditable spellcheck="false">신규 등록 처리량</span>',
      '최근 '+c.n+'개월 · 조직 Max output 판단용', inner);
  }
  /* ② 제품별 고객 집단 */
  if(RP_AN.seg){
    var sg=rpAnSeg(j), rows2=[];
    sg.forEach(function(x){
      x.top.forEach(function(t,ti){
        rows2.push([ti?'':x.line, t.ind, {t:t.n,n:1},
          {t:(x.tot? Math.round(t.n/x.tot*100):0)+'%',n:1}, {t:won(t.mrr),n:1}]);
      });
    });
    var inner2=tbl('rpTblSeg',[['제품'],['산업군'],['고객사',1],['비중',1],['월 매출',1]],rows2,'활성 계약이 없습니다');
    var head2=sg.filter(function(x){ return x.top.length; }).map(function(x){
      return x.line+' → '+x.top[0].ind+' '+x.top[0].n+'개사('+(x.tot? Math.round(x.top[0].n/x.tot*100):0)+'%)'; });
    inner2='<div class="pr-note" style="margin:0 0 9px;font-size:13px;line-height:1.9;color:var(--ink-2)">'+
      head2.map(function(t){ return '· '+esc(t); }).join('<br>')+'</div>'+inner2;
    inner2+='<p class="pr-note" style="margin-top:6px">제품별 상위 3개 산업군만 표시합니다. 산업군이 비어 있는 계약은 «미지정»으로 묶입니다.</p>';
    var segSrc=DATA.rows.some(function(r){ return r.sector; })?
      '세부 업종 기준' : '⚠ 세부 업종 미입력 — 기업/공공 2분류로만 집계됩니다 (50단계 SQL 필요)';
    h+=card('seg','🏭 <span contenteditable spellcheck="false">제품별 고객 집단</span>',
      mk(j)+' 활성 고객 기준 · '+segSrc, inner2);
  }
  /* ③ 유입 경로 */
  if(RP_AN.src){
    var sc=rpAnSrc(j);
    var inner3=obox(kpi('활성 고객사', sc.custN+'곳', mk(j)+' 매출 발생 기준','an_cust')+
      kpi('월 매출 합', won(sc.mrr)+'천원','','an_mrr')+
      kpi('최대 경로', (sc.ch[0]? sc.ch[0].name+' '+sc.ch[0].n+'곳':'—'),
          sc.ch[0]&&sc.custN? '전체의 '+Math.round(sc.ch[0].n/sc.custN*100)+'%':''));
    inner3+='<div class="pr-note" style="margin:2px 0 6px"><b>채널별</b></div>'+
      tbl('rpTblSrc',[['채널'],['고객사',1],['비중',1],['월 매출',1]],
        sc.ch.map(function(x){ return [x.name,{t:x.n,n:1},{t:(sc.custN? Math.round(x.n/sc.custN*100):0)+'%',n:1},{t:won(x.mrr),n:1}]; }),
        '데이터 없음');
    inner3+='<div class="pr-note" style="margin:12px 0 6px"><b>영업 파트너·직접별</b> <span style="color:var(--muted)">(계산서 발행처가 아닌 실제 영업 경로)</span></div>'+
      tbl('rpTblSrcP',[['영업 파트너'],['고객사',1],['비중',1],['월 매출',1]],
        sc.ptn.slice(0,8).map(function(x){ return [x.name,{t:x.n,n:1},{t:(sc.custN? Math.round(x.n/sc.custN*100):0)+'%',n:1},{t:won(x.mrr),n:1}]; }),
        '데이터 없음');
    if(sc.inb.length) inner3+='<div class="pr-note" style="margin:12px 0 6px"><b>'+sc.inbYear+'년 인바운드 문의 유입 경로</b> (계약 전 단계)</div>'+
      tbl('rpTblSrcI',[['경로'],['문의 건수',1]], sc.inb.map(function(x){ return [x.name,{t:x.n,n:1}]; }),'인바운드 데이터 없음');
    h+=card('src','🔀 <span contenteditable spellcheck="false">주요 유입 경로</span>',
      '계약 채널·파트너 + 인바운드 문의 경로', inner3);
  }
  /* ④ 고객 월 매출 평균 */
  if(RP_AN.arpu){
    var ar=rpAnArpu(j);
    var inner4=obox(kpi('고객사당 월 평균', won(ar.avg)+'천원', ar.n+'개사 · 합계 '+won(ar.sum)+'천원','an_cust')+
      kpi('중앙값', won(ar.med)+'천원', '평균보다 '+(ar.med<ar.avg?'낮음 — 소수 대형 고객이 평균을 올림':'높음'),'an_cust')+
      kpi('하위 25%', won(ar.p25)+'천원','','an_cust')+
      kpi('상위 25%', won(ar.p75)+'천원','','an_cust'));
    inner4+='<div class="pr-note" style="margin:2px 0 6px"><b>제품별 고객사당 평균</b></div>'+
      tbl('rpTblArpu',[['제품'],['고객사',1],['월 매출',1],['고객사당 평균',1]],
        ar.lines.map(function(x){ return [x.line,{t:x.n,n:1},{t:won(x.mrr),n:1},{t:won(x.avg),n:1}]; }),'데이터 없음');
    inner4+='<div class="pr-note" style="margin:12px 0 6px"><b>월 매출 구간 분포</b></div>'+
      tbl('rpTblArpuD',[['구간'],['고객사',1],['비중',1]],
        ar.dist.map(function(x){ return [x.label,{t:x.n,n:1},{t:Math.round(x.pct)+'%',n:1}]; }),'데이터 없음');
    inner4+='<p class="pr-note" style="margin-top:6px">한 고객사가 여러 제품을 쓰면 <b>합산해서 1개사</b>로 셉니다. '+
      '상위 5개사: '+ar.top.map(function(x){ return esc(x.cust)+' '+won(x.v)+'천원'; }).join(' · ')+'</p>';
    h+=card('arpu','💵 <span contenteditable spellcheck="false">고객 월 매출 평균</span>',
      mk(j)+' 기준 · 고객사 단위 합산', inner4);
  }
  /* ⑤ 해지율 12개월 추이 */
  if(RP_AN.chr){
    var cr=rpAnChurn(j), dv=cr.h2-cr.h1;
    var inner5=obox(kpi('12개월 평균 해지율', (Math.round(cr.avg*100)/100)+'%', '월 기초 고객사 대비','an_lost')+
      kpi('추세', (dv>0?'▲ ':(dv<0?'▼ ':''))+(Math.round(Math.abs(dv)*100)/100)+'%p',
          '전반 6개월 '+(Math.round(cr.h1*100)/100)+'% → 후반 '+(Math.round(cr.h2*100)/100)+'%','an_lost')+
      kpi('이탈 고객사', cr.totLost+'곳', '재약정 '+cr.renewN+'건은 제외','an_lost')+
      kpi('이탈 월 매출', won(cr.totAmt)+'천원', '연환산 '+won(cr.totAmt*12)+'천원','an_lost'));
    inner5+=tbl('rpTblChr',[['월'],['기초 고객사',1],['이탈',1],['해지율',1],['이탈 월 매출',1]],
      cr.series.slice().reverse().map(function(x){
        return [x.ym,{t:x.base,n:1},{t:x.lost,n:1},{t:(Math.round(x.rate*100)/100)+'%',n:1},{t:won(x.amt),n:1}]; }),
      '데이터 없음');
    inner5+='<div class="pr-note" style="margin:12px 0 6px"><b>주요 원인</b> (최근 12개월)</div>'+
      tbl('rpTblChrR',[['사유'],['건수',1],['비중',1],['이탈 월 매출',1]],
        cr.reasons.map(function(x){
          var tn=cr.reasons.reduce(function(s2,y){ return s2+y.n; },0);
          return [x.reason,{t:x.n,n:1},{t:(tn? Math.round(x.n/tn*100):0)+'%',n:1},{t:won(x.amt),n:1}]; }),
        '해지 건이 없습니다');
    inner5+='<p class="pr-note" style="margin-top:6px">해지율 = 그 달 이탈 고객사 ÷ <b>전월</b> 활성 고객사. '+
      '재약정으로 이어진 계약 종료는 이탈로 세지 않습니다'+(cr.renewN? ' (기간 내 '+cr.renewN+'건 제외)':'')+'.'+
      (cr.reasons[0]&&/미기재/.test(cr.reasons[0].reason)? ' ⚠ 사유 «미기재»가 가장 많습니다 — 해지 시 사유 입력이 필요합니다.':'')+'</p>';
    h+=card('chr','📉 <span contenteditable spellcheck="false">해지율 12개월 추이</span>',
      cr.series.length? cr.series[0].ym+' ~ '+cr.series[cr.series.length-1].ym : '', inner5);
  }
  return h;
}


/* ==================================================================
   PPT 슬라이드 덱 — 데이터 조합 결과를 슬라이드 항목으로 쌓아 QBR 양식 PPT 로 내보냄
   · 항목: localStorage svc_rpb_<user> — {id,t:'table'|'chart'|'kpi'|'text',title,sub,table:{head,rows,total},chart:{type,labels,series,money},spec}
   · 만드는 곳: 리포트(데이터 조합) 결과 «＋ PPT 슬라이드에 추가» (qbDeckAdd) · 내보내기 rpbMakePpt()
   ================================================================== */
var RPB={items:null};
function rpbKey(){ return 'svc_rpb_'+(AUTH_USER||'anon'); }
function rpbList(){ if(!RPB.items){ try{ RPB.items=JSON.parse(localStorage.getItem(rpbKey())||'[]')||[]; }catch(e){ RPB.items=[]; } } return RPB.items; }
function rpbSave(){ try{ localStorage.setItem(rpbKey(), JSON.stringify(RPB.items||[])); }catch(e){ toast('저장 공간 부족','담은 항목이 너무 많거나 표가 큽니다 — 일부를 지워주세요','bad'); } try{ rpbBadge(); }catch(e){} }
function rpbBadge(){
  var n=rpbList().length;
  var b=document.querySelector('.side button[data-v="report"]'); if(b){ var old=b.querySelector('.rpb-cnt'); if(old) old.remove(); if(n){ var s=document.createElement('span'); s.className='rpb-cnt'; s.textContent=n; b.appendChild(s); } }
}
var RPV={tab:'build', title:'서비스사업부 리포트', sub:'', ai:false};
function rpbSents(t){ return (String(t||'').replace(/\n+/g,' ').match(/[^.。!?]+[.。!?]?/g)||[]).map(function(x){ return x.trim(); }).filter(Boolean); }
function rpbSvgPng(svg){
  return new Promise(function(res){
    try{
      var img=new Image(); var url='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg.s)));
      img.onload=function(){ var c=document.createElement('canvas'); c.width=svg.w*2; c.height=svg.h*2; var x=c.getContext('2d'); x.fillStyle='#ffffff'; x.fillRect(0,0,c.width,c.height); x.drawImage(img,0,0,c.width,c.height); res(c.toDataURL('image/png')); };
      img.onerror=function(){ res(null); }; img.src=url;
    }catch(e){ res(null); }
  });
}
/* 연속한 KPI 타일은 한 슬라이드(최대 6칸)로 묶음 */
function rpbKpiGroup(L,i){ var grp=[L[i]], cnt=(L[i].kpis||[]).length; while(i+1<L.length && L[i+1].t==='kpi' && cnt+(L[i+1].kpis||[]).length<=6){ i++; grp.push(L[i]); cnt+=(L[i].kpis||[]).length; } return grp; }
async function rpbMakePpt(){
  var L=rpbList(), m=$('#rpbMsg'); if(!L.length) return;
  var bp=$('#qbDeckPpt'); if(bp) bp.disabled=true;
  if(m) m.textContent='PPT 생성 중…';
  try{
    await rpLoadPptx();
    var NAVY='0E2852', GRN='7EBA25', GRN2='67BF00', BAND='EFF8E5', THD='C6E0B4', INK='1F2937', MUT='6B7280', BORD='D8DEE4', F='나눔바른고딕';
    var PAL=[GRN,NAVY,'00B3AC','F59E0B','8B5CF6','EF4444','0EA5E9','9CA3AF'];
    var title=RPV.title||'서비스사업부 리포트', sub=RPV.sub||thisMonthStr();
    var p=new PptxGenJS(); p.layout='LAYOUT_WIDE';
    p.defineSlideMaster({ title:'M', background:{color:'FFFFFF'},
      objects:[ {rect:{x:0,y:0,w:'100%',h:0.85,fill:{color:BAND}}}, {rect:{x:0.45,y:0.97,w:12.3,h:0.026,fill:{color:GRN}}}, {ellipse:{x:12.78,y:0.905,w:0.15,h:0.15,fill:{color:GRN2}}}, {image:{data:RP_IMG.logoG,x:0.42,y:7.05,w:1.12,h:0.25}} ],
      slideNumber:{x:12.85,y:7.05,w:0.4,h:0.3,fontSize:10,color:'9AA0A6',fontFace:F} });
    var s1=p.addSlide(); s1.background={color:NAVY};
    s1.addImage({data:RP_IMG.pat,x:8.3,y:0,w:5.03,h:7.5});
    s1.addText('통합 보안 플랫폼 기업, 지니언스.',{x:0.55,y:0.42,w:5,h:0.35,fontSize:11,color:'D9E2F2',fontFace:F});
    s1.addText(title,{x:0.6,y:2.55,w:7.6,h:1.0,fontSize:33,bold:true,color:'FFFFFF',fontFace:F});
    s1.addText(sub,{x:0.62,y:3.62,w:6,h:0.55,fontSize:20,bold:true,color:GRN,fontFace:F});
    s1.addText(todayStr().replace(/-/g,'.')+'\n서비스사업부',{x:0.62,y:4.25,w:6,h:0.85,fontSize:14,color:'D9E2F2',fontFace:F,lineSpacing:24});
    s1.addText('※ 금액 단위는 각 슬라이드 표기 기준(천원/원)입니다.',{x:0.62,y:5.35,w:7,h:0.32,fontSize:11,color:'A9BCD9',fontFace:F});
    s1.addImage({data:RP_IMG.logoW,x:0.55,y:6.78,w:1.35,h:0.30});
    var secN=0;
    function head(s,t,sb){ secN++; s.addText(secN+'. '+(t||''),{x:0.5,y:0.13,w:11.6,h:0.62,fontSize:20,bold:true,color:NAVY,fontFace:F,valign:'middle'}); if(sb) s.addText(sb,{x:0.5,y:1.02,w:12.3,h:0.32,fontSize:11,color:MUT,fontFace:F}); }
    /* 코멘트(AI 작성) — 길이에 맞춰 글자 크기·상자 높이, 하단 로고 위에 딱 맞게 */
    function noteH(it){ var n=String(it.note||'').length; return !n? 0 : n>230? 0.95 : n>150? 0.8 : n>75? 0.62 : 0.45; }
    function noteOf(s,it,y){ if(!it.note) return; var n=String(it.note).length, h=noteH(it), fs= n>230? 10.5 : n>150? 11 : 12;
      s.addShape('rect',{x:0.5,y:6.98-h,w:0.06,h:h,fill:{color:GRN}});
      s.addText(it.note,{x:0.65,y:6.98-h,w:12.15,h:h,fontSize:fs,color:NAVY,bold:n<=150,fontFace:F,valign:'middle',lineSpacingMultiple:1.05});
      s.addNotes(it.note); }
    function kpiSlide(items){
      var s=p.addSlide({masterName:'M'}); head(s, items.length===1? items[0].title : '요약 지표');
      var ks=[]; items.forEach(function(it){ (it.kpis||[]).forEach(function(k){ ks.push(k); }); });
      var n=ks.length, cols=n<=2? n : (n<=4? 2 : 3), w=(12.3-(cols-1)*0.25)/cols, hgt=n<=cols? 2.6 : 2.2;
      ks.slice(0,6).forEach(function(k,i){ var x=0.5+(i%cols)*(w+0.25), y=1.35+Math.floor(i/cols)*(hgt+0.25);
        s.addShape('roundRect',{x:x,y:y,w:w,h:hgt,fill:{color:'F7FAF2'},line:{color:THD,width:1},rectRadius:0.07});
        s.addShape('rect',{x:x,y:y,w:0.07,h:hgt,fill:{color:GRN}});
        s.addText(k[0],{x:x+0.28,y:y+0.25,w:w-0.5,h:0.4,fontSize:12,color:MUT,fontFace:F});
        s.addText(k[1],{x:x+0.28,y:y+0.7,w:w-0.5,h:0.85,fontSize:Math.min(30, 30-Math.max(0,String(k[1]).length-14)),bold:true,color:NAVY,fontFace:F});
        if(k[2]) s.addText(k[2],{x:x+0.28,y:y+hgt-0.75,w:w-0.5,h:0.55,fontSize:10.5,color:'4E8A1E',fontFace:F,valign:'top'}); });
      noteOf(s, items.length===1? items[0] : {note:items.map(function(x){ return x.note||''; }).filter(Boolean).map(function(t){ return rpbSents(t)[0]||''; }).join(' ')});
    }
    /* 표: 열 수에 맞춰 글자 크기·열 폭(내용 길이 비례) 조정, 넘치면 «(계속)» 슬라이드로 직접 나눔 */
    function tableOn(s, T, y, ttl, bottom){
      bottom=bottom||6.35;
      var nc=T.head.length, fs= nc>16? 7.5 : nc>12? 8.5 : nc>8? 9.5 : 10.5, rowH= fs<9? 0.26 : 0.3;
      var lens=T.head.map(function(h,ci){ var m=String(h||'').length; T.rows.forEach(function(r){ m=Math.max(m, Math.min(28, String(r[ci]||'').length)); }); return Math.max(3, m); });
      var tot=lens.reduce(function(a,b){ return a+b; },0), colW=lens.map(function(l){ return Math.max(0.55, 12.3*l/tot); }); var cw=colW.reduce(function(a,b){ return a+b; },0); colW=colW.map(function(w){ return w*12.3/cw; });
      var per=Math.max(4, Math.floor((bottom-y)/rowH)-1);
      function mk(rows0, ri0){ return [T.head.map(function(x){ return {text:x, options:{bold:true,color:NAVY,fill:{color:THD},fontSize:fs,fontFace:F}}; })]
        .concat(rows0.map(function(r,ri){ var last=/^(합계|소계|총계)$/.test(String(r[0]||'')); return r.map(function(c,ci){ return {text:String(c==null?'':c), options:{fontSize:fs-0.5,color:INK,fontFace:F,bold:last,fill:{color:last?'E2EFD9':((ri+ri0)%2?'F7FAF2':'FFFFFF')},align:(ci&&/^[₩$\-−▲▼]?[\d,.\s%~]+[a-zA-Z가-힣]*$/.test(String(c||'').trim())?'right':'left')}}; }); })); }
      var first=T.rows.slice(0,per);
      s.addTable(mk(first,0),{x:0.5,y:y,w:12.3,colW:colW,border:{pt:0.5,color:BORD},rowH:rowH,autoPage:false,margin:0.04});
      var k=per, pg=1;
      while(k<T.rows.length){ var s2=p.addSlide({masterName:'M'}); s2.addText(secN+'. '+(ttl||'')+' (계속 '+(++pg)+')',{x:0.5,y:0.13,w:11.6,h:0.62,fontSize:20,bold:true,color:NAVY,fontFace:F,valign:'middle'});
        var per2=Math.floor((6.35-1.3)/rowH)-1, chunk=T.rows.slice(k,k+per2); s2.addTable(mk(chunk,k),{x:0.5,y:1.3,w:12.3,colW:colW,border:{pt:0.5,color:BORD},rowH:rowH,autoPage:false,margin:0.04}); k+=per2; }
      if(T.total && T.total>T.rows.length) s.addText('※ '+T.rows.length+'행만 수록 (전체 '+T.total+'행)',{x:7,y:7.02,w:5.8,h:0.3,fontSize:10,italic:true,color:MUT,fontFace:F,align:'right'});
    }
    var i=0;
    while(i<L.length){
      var it=L[i];
      if(it.t==='kpi'){ var grp=rpbKpiGroup(L,i); kpiSlide(grp); i+=grp.length; continue; }
      var s=p.addSlide({masterName:'M'}); head(s, it.title, it.sub);
      var y=it.sub? 1.4:1.3, unit=false;
      if(it.kpis&&it.kpis.length){ var k=it.kpis[0]; s.addText([{text:k[1],options:{bold:true,fontSize:24,color:NAVY}},{text:(k[2]? '   '+k[2]:''),options:{fontSize:12,color:MUT}}],{x:0.5,y:y,w:12.3,h:0.6,fontFace:F}); y+=0.7; }
      if(it.text && it.t!=='text'){ var lines=String(it.text).split(/\n+/).filter(Boolean).slice(0,8); s.addText(lines.map(function(x){ return {text:x, options:{bullet:{code:'25B8',color:GRN}, breakLine:true}}; }),{x:0.55,y:y,w:12.3,h:0.34*lines.length+0.1,fontSize:12.5,color:INK,fontFace:F,valign:'top',lineSpacing:20}); y+=0.34*lines.length+0.25; }
      if(it.t==='text'){ var ls=String(it.text||'').split(/\n+/).filter(Boolean); if(ls.length) s.addText(ls.map(function(x){ return {text:x.replace(/^[-•]\s*/,''), options:{bullet:{code:'25B8',color:GRN}, breakLine:true}}; }),{x:0.55,y:y,w:12.3,h:Math.min(5.2,0.42*ls.length+0.2),fontSize:14,color:INK,fontFace:F,valign:'top',lineSpacing:26}); }
      var bot=6.98-(noteH(it)? noteH(it)+0.12 : 0), tb=Math.min(6.35, bot-0.08);
      var hasT=!!(it.table&&it.table.head&&it.table.rows.length), tLim=Math.floor((tb-(y+3.15))/0.3)-1;
      var tFit= hasT && (it.chart||it.svg) && tLim>=3 && it.table.rows.length<=tLim;      // 표가 차트 아래에 들어가면 차트를 낮게, 아니면 표는 다음 슬라이드·차트는 크게
      var chartH= tFit? 3.0 : Math.min(5.5, bot-0.15-y);
      if(it.chart){
        var c=it.chart, div=c.money? 1000:1; unit=c.money;
        var data=c.series.map(function(sr){ return {name:sr.label||'값', labels:c.labels, values:sr.data.map(function(v){ return Math.round(v/div); })}; });
        var type= c.type==='bars'? p.ChartType.bar : (c.type==='area'? p.ChartType.area : p.ChartType.line);
        s.addChart(type, data, {x:0.5,y:y,w:12.3,h:chartH, barDir:'col', barGrouping:(c.type==='area'?'stacked':'clustered'), chartColors:PAL.slice(0,Math.max(1,data.length)), showLegend:data.length>1, legendPos:'b', legendFontSize:10,
          catAxisLabelFontSize:9, valAxisLabelFontSize:9, valAxisLabelFormatCode:'#,##0', valGridLine:{color:'E5EAE0',style:'solid',size:0.5}, catAxisLabelColor:MUT, valAxisLabelColor:MUT, lineDataSymbol:'none', lineSize:2, fontFace:F});
        y+=chartH+0.15;
      } else if(it.svg){
        var png=await rpbSvgPng(it.svg);
        if(png){ var ar=it.svg.w/it.svg.h, w=12.3, h2=Math.min(chartH, w/ar); s.addImage({data:png,x:0.5,y:y,w:h2*ar>12.3? 12.3:h2*ar,h:h2}); y+=h2+0.15; }
      }
      if(it.table&&it.table.head&&it.table.rows.length){
        var T=it.table; if(!unit) unit=T.head.some(function(x){ return /천원|금액|월액|MRR|ARR/.test(String(x)); });
        if(it.chart||it.svg){ if(tFit) tableOn(s,T,y,it.title,tb); else { var s2=p.addSlide({masterName:'M'}); secN--; head(s2, it.title+' — 표'); tableOn(s2,T,1.3,it.title+' — 표'); } }
        else tableOn(s,T,y,it.title,tb);
      }
      noteOf(s,it);
      if(unit) s.addText('※ 금액 단위: 천원',{x:1.75,y:7.02,w:5.2,h:0.3,fontSize:10,italic:true,color:MUT,fontFace:F});
      i++;
    }
    var fn=(title+'_'+sub).replace(/[\\/:*?"<>|]/g,' ').replace(/\s+/g,'_')+'.pptx';
    await p.writeFile({fileName:fn});
    if(m) m.textContent='다운로드했습니다 — '+fn;
    toast('PPT 생성 완료', L.length+'개 항목 · '+fn, 'ok');
  }catch(e){ if(m) m.textContent='실패: '+String(e.message||e).slice(0,120); toast('PPT 생성 실패', String(e.message||e).slice(0,100), 'bad'); }
  finally{ var bp2=$('#qbDeckPpt'); if(bp2) bp2.disabled=false; }
}

/* ==================================================================
   데이터 조합 (QB) — 포탈 안의 표를 기준 표 → 연결(JOIN) → 조건 → 묶기·집계·피벗 → 정렬 순서로 조합해 표·차트로 보는 엔진
   · 데이터는 이미 메모리에 있는 RAWX/DATA (서버 왕복 없음). 스펙(spec)은 JSON 이라 저장·공유·PPT 재생성이 가능
   · 열 주소는 «표.열» (예: contracts.mrr). 조인 결과 행은 {contracts:{…}, customers:{…}|null, …} 모양의 복합 행
   · 조인은 SQL 처럼 행을 펼침(1:N → N행, LEFT). «일치하는 행만»(INNER) 옵션. 고객명 연결은 nmKeys()(별칭·(주)·띄어쓰기 무시)
   · 집계: count · dcount(고유 개수) · sum · avg · min · max · list(값 목록) — 여러 1:N 을 겹치면 합계가 중복될 수 있어 dcount 를 권장 (화면에 경고)
   ================================================================== */
var QB_TYPES={text:'글자', num:'숫자', month:'월', date:'날짜', bool:'예/아니오'};
function qbColsFromGrid(gk, skip){
  var g=GRIDS[gk]; if(!g) return [];
  var sk={}; (skip||[]).forEach(function(k){ sk[k]=1; });
  var out=[];
  (g.cols||[]).forEach(function(c){
    if(sk[c.k] || c.html) return;
    var t= c.t==='number'? 'num' : c.t==='month'? 'month' : c.t==='date'? 'date' : c.t==='bool'? 'bool' : 'text';
    var d={k:c.k, l:String(c.l||c.k), t:t, won:!!c.won};
    if(c.k==='line') d.fmt=function(v){ return lline(v); };
    out.push(d);
  });
  return out;
}
function qbSources(){
  if(qbSources._c && qbSources._d===DATA) return qbSources._c;
  var cmap={}; (RAWX.customers||[]).forEach(function(c){ cmap[c.id]=c; });
  var dmap={}; (DATA&&DATA.rows||[]).forEach(function(r){ dmap[r._id]=r; });
  var S={
    customers:{ label:'고객사', icon:'🏢', key:'id', rows:function(){ return RAWX.customers||[]; },
      cols:[{k:'id',l:'고객 번호',t:'num'},{k:'name',l:'고객사',t:'text'},{k:'industry',l:'산업군',t:'text'},{k:'sector',l:'업종',t:'text'},{k:'sector_detail',l:'업종 상세',t:'text'},
            {k:'_nct',l:'계약 수',t:'num',get:function(r){ return (RAWX.contracts||[]).filter(function(c){ return c.customer_id===r.id; }).length; }},
            {k:'_alias',l:'별칭',t:'text',get:function(r){ return (r.aliases||[]).join(', '); }}] },
    contracts:{ label:'계약', icon:'📄', key:'id', rows:function(){ return (RAWX.contracts||[]).map(function(c){ var cu=cmap[c.customer_id]||{}; c._custName=cu.name||'?'; c._sector=cu.sector||''; c._industry=cu.industry||''; return c; }); },
      cols:[{k:'id',l:'계약 번호',t:'num'},{k:'_custName',l:'고객사',t:'text'},{k:'_industry',l:'산업군',t:'text'},{k:'_sector',l:'업종',t:'text'},
            {k:'line',l:'서비스',t:'text',fmt:function(v){ return lline(v); }},{k:'version',l:'Ver.',t:'text'},{k:'_lineVer',l:'서비스(버전)',t:'text',get:function(r){ return llineVer(r.line, r.version); }},{k:'channel',l:'판매 채널',t:'text'},{k:'lead_src',l:'유입경로',t:'text'},{k:'auto_renew',l:'자동연장',t:'bool'},{k:'partner',l:'파트너',t:'text'},{k:'biller',l:'계산서발행처',t:'text'},
            {k:'combine',l:'모듈',t:'text'},{k:'contract_type',l:'구분',t:'text'},{k:'status',l:'상태',t:'text'},
            {k:'_live',l:'LIVE 여부',t:'bool',get:function(r){ var d=dmap[r.id]; try{ return !!(d && liveActiveAt(d, DATA.nowIdx)); }catch(e){ return false; } }},
            {k:'start_month',l:'시작월',t:'month'},{k:'end_month',l:'종료월',t:'month'},{k:'churn_month',l:'해지월',t:'month'},{k:'churn_reason',l:'해지사유',t:'text'},
            {k:'mrr',l:'MRR(천원)',t:'num',won:true},{k:'_sum',l:'누적 매출(천원)',t:'num',won:true,get:function(r){ var d=dmap[r.id]; return d? d.sum : 0; }},
            {k:'install_fee',l:'설치비(천원)',t:'num',won:true},{k:'settle_month',l:'대금정산일',t:'month'},{k:'term_months',l:'계약기간(개월)',t:'num'},{k:'qty',l:'노드/수량',t:'num'},
            {k:'csm',l:'CSM(사이트명)',t:'text'},{k:'billing',l:'과금방식',t:'text'},{k:'sale_type',l:'판매유형',t:'text'},{k:'renew_count',l:'연장 회차',t:'num'},{k:'s1_no',l:'에스원 계약번호',t:'text'},
            {k:'parent_contract_id',l:'원계약 번호',t:'num'},{k:'customer_id',l:'고객 번호',t:'num'},{k:'note',l:'비고',t:'text'}] },
    mrs:{ label:'월 매출', icon:'₩', key:null, rows:function(){ return RAWX.mrs||[]; },
      cols:[{k:'contract_id',l:'계약 번호',t:'num'},{k:'month',l:'월',t:'month'},{k:'amount',l:'금액(천원)',t:'num',won:true}] },
    live:{ label:'LIVE 고객사 (계약 기준)', icon:'🟢', key:null, rows:function(){ try{ return liveCalc().rows||[]; }catch(e){ return []; } },
      cols:[{k:'cust',l:'고객사',t:'text'},{k:'ind',l:'산업군',t:'text'},{k:'line',l:'서비스',t:'text',fmt:function(v){ return lline(v); }},{k:'channel',l:'판매 채널',t:'text'},{k:'partner',l:'파트너',t:'text'},
            {k:'nodes',l:'노드',t:'num'},{k:'start',l:'최초 개시월',t:'month'},{k:'curStart',l:'현행 시작월',t:'month'},{k:'end',l:'현행 종료월',t:'month'},{k:'csm',l:'CSM(사이트명)',t:'text'},{k:'status',l:'상태',t:'text'},{k:'ctId',l:'현행 계약 번호',t:'num'},{k:'n',l:'유효 계약 수',t:'num'}] },
    orders:{ label:'임대 장비 신청', icon:'📦', key:'id', rows:function(){ return RAWX.orders||[]; },
      cols:[{k:'id',l:'신청 번호',t:'num'}].concat(qbColsFromGrid('orders',['returned_serials']), [{k:'serials',l:'시리얼',t:'text'},{k:'_nret',l:'회수 시리얼 수',t:'num',get:function(r){ try{ return eqRetSet(r).length; }catch(e){ return 0; } }}]) },
    assets:{ label:'장비 현황 (시리얼)', icon:'🔩', key:'serial', rows:function(){ return RAWX.assets||[]; },
      cols:[{k:'id',l:'현황 번호',t:'num'}].concat(qbColsFromGrid('assets',['_ostat','order_id']), [{k:'order_id',l:'신청 번호',t:'num'}]) },
    oi:{ label:'OI (영업기회)', icon:'🎯', key:'id', rows:function(){ return RAWX.oi||[]; },
      cols:[{k:'id',l:'OI 번호',t:'num'}].concat(qbColsFromGrid('oi',['products','items','quote_file','contract_id']), [{k:'contract_id',l:'전환 계약 번호',t:'num'},{k:'products',l:'제품군',t:'text',get:function(r){ return (r.products||[]).join(', '); }}]) },
    mdrops:{ label:'MDR 운영·신청', icon:'🛡', key:'id', rows:function(){ return RAWX.mdrops||[]; },
      cols:[{k:'id',l:'번호',t:'num'}].concat(qbColsFromGrid('mdrops',['_fill','_mods','on_rev_sheet'])) },
    inbound:{ label:'인바운드', icon:'📥', key:'no', lazy:function(cb){ if(RAWX.inbound===undefined) loadInbound(cb); else cb(); }, rows:function(){ return RAWX.inbound||[]; },
      cols:qbColsFromGrid('inbound',['_last','_days']).concat([{k:'no',l:'번호',t:'num'}]) },
    lg:{ label:'LG U+ 판매', icon:'📡', key:'id', rows:function(){ return RAWX.lg||[]; }, cols:qbColsFromGrid('lg') },
    cloud:{ label:'클라우드 비용 (월·서비스)', icon:'☁', key:null, lazy:function(cb){ if(!RAWX.cloud) loadCloud(cb); else cb(); },
      rows:function(){ var c=RAWX.cloud||{acc:[],costs:[]}, am={}; (c.acc||[]).forEach(function(a){ am[a.id]=a; }); return (c.costs||[]).map(function(x){ var a=am[x.account_id]||{}; x._acct=a.label||('#'+x.account_id); x._vendor=a.vendor||''; x._cur=a.currency||'USD'; return x; }); },
      cols:[{k:'ym',l:'월',t:'month'},{k:'_acct',l:'계정',t:'text'},{k:'_vendor',l:'벤더',t:'text'},{k:'service',l:'서비스',t:'text'},{k:'kind',l:'종류',t:'text'},{k:'usd',l:'USD',t:'num'},{k:'credit_usd',l:'크레딧 USD',t:'num'},
            {k:'_krwCalc',l:'원화 환산(천원)',t:'num',won:true,get:function(r){ var fx=1400; try{ fx=clFxRate(); }catch(e){} return r._cur==='KRW'? Number(r.krw||0) : Number(r.usd||0)*fx; }},{k:'krw',l:'원화 청구(천원)',t:'num',won:true},{k:'source',l:'출처',t:'text'}] }
  };
  var byId={};
  Object.keys(S).forEach(function(id){ S[id].id=id; S[id].cols.forEach(function(c){ c.id=id+'.'+c.k; c.src=id; byId[c.id]=c; if(c.t==='num' && (c.k==='id'||c.k==='no'||/_id$|_no$|Id$/.test(c.k)||/번호/.test(c.l))) c.noSum=true; }); });   // 번호(식별자) 열은 합계 안 냄
  S._byId=byId; qbSources._c=S; qbSources._d=DATA; return S;
}
/* 표 사이 연결(키) — a.ak = b.bk. fuzzy 면 회사명 매칭(nmKeys) */
var QB_REL=[
  {a:'contracts',ak:'customer_id', b:'customers',bk:'id'},
  {a:'mrs',ak:'contract_id', b:'contracts',bk:'id'},
  {a:'assets',ak:'order_id', b:'orders',bk:'id'},
  {a:'oi',ak:'contract_id', b:'contracts',bk:'id'},
  {a:'live',ak:'ctId', b:'contracts',bk:'id'},
  {a:'live',ak:'cust', b:'customers',bk:'name', fuzzy:true},
  {a:'orders',ak:'customer', b:'customers',bk:'name', fuzzy:true},
  {a:'assets',ak:'customer', b:'customers',bk:'name', fuzzy:true},
  {a:'oi',ak:'customer', b:'customers',bk:'name', fuzzy:true},
  {a:'mdrops',ak:'customer', b:'customers',bk:'name', fuzzy:true},
  {a:'inbound',ak:'org', b:'customers',bk:'name', fuzzy:true},
  {a:'lg',ak:'customer', b:'customers',bk:'name', fuzzy:true},
  {a:'orders',ak:'customer', b:'contracts',bk:'_custName', fuzzy:true},
  {a:'assets',ak:'customer', b:'contracts',bk:'_custName', fuzzy:true},
  {a:'oi',ak:'customer', b:'contracts',bk:'_custName', fuzzy:true},
  {a:'assets',ak:'customer', b:'orders',bk:'customer', fuzzy:true}
];
/* 이미 들어온 표(have) 와 연결 가능한 후보 목록 — [{t, on:[a,b], fuzzy, via}] */
function qbJoinCands(have){
  var S=qbSources(), out=[], seen={};
  QB_REL.forEach(function(r){
    var pairs=[[r.a,r.ak,r.b,r.bk],[r.b,r.bk,r.a,r.ak]];
    pairs.forEach(function(p){ var from=p[0], to=p[2];
      if(have.indexOf(from)<0 || have.indexOf(to)>=0 || !S[to]) return;
      var key=to+'|'+p[1]+'|'+p[3]; if(seen[key]) return; seen[key]=1;
      out.push({t:to, on:[from+'.'+p[1], to+'.'+p[3]], fuzzy:!!r.fuzzy, via:from});
    });
  });
  return out;
}
function qbCol(id){ var S=qbSources(); return (id && S._byId[id]) || null; }
function qbColLabel(id){ var c=qbCol(id), S=qbSources(); return c? (S[c.src].label+' › '+c.l) : String(id); }
function qbRaw(row, c){ var v= c.get? c.get(row) : row[c.k]; if(v==null) return null;
  if(c.t==='month') return String(v).slice(0,7); if(c.t==='date') return String(v).slice(0,10); if(c.t==='num'){ var n=Number(v); return isFinite(n)? n : null; } if(c.t==='bool') return !!v; return String(v); }
function qbGet(cr, id){ var c=qbCol(id); if(!c) return null; var r=cr[c.src]; return r? qbRaw(r,c) : null; }
/* 월·날짜 변환: ym 그대로 / y 연도 / q 분기 / m 월(1~12) */
function qbTr(v, tr){ if(v==null||v==='') return v; var s=String(v);
  if(tr==='y') return s.slice(0,4); if(tr==='q'){ var m=+s.slice(5,7)||1; return s.slice(0,4)+'-Q'+(Math.floor((m-1)/3)+1); } if(tr==='m') return String(+s.slice(5,7)||'')+'월'; if(tr==='ym') return s.slice(0,7); return v; }
function qbFmt(v, c, tr){
  if(v==null||v==='') return '';
  if(c.t==='bool') return v? '예':'아니오';
  if(c.t==='num'){ if(c.won) return won(v); return (Math.round(v*100)/100).toLocaleString('ko-KR'); }
  if((c.t==='month'||c.t==='date') && tr && tr!=='raw') return String(v);
  if(c.fmt && !tr) try{ return c.fmt(v); }catch(e){}
  return String(v);
}
/* 조건 값 토큰 */
function qbTok(v){
  var s=String(v==null?'':v).trim(), d=new Date();
  function ym(dt){ return dt.getFullYear()+'-'+('0'+(dt.getMonth()+1)).slice(-2); }
  if(s==='@이번달'||s==='@thismonth') return ym(d);
  if(s==='@지난달'||s==='@lastmonth') return ym(new Date(d.getFullYear(), d.getMonth()-1, 1));
  if(s==='@올해'||s==='@thisyear') return String(d.getFullYear());
  if(s==='@오늘'||s==='@today') return todayStr();
  var m=s.match(/^@(\d+)개월(전|후)$/); if(m) return ym(new Date(d.getFullYear(), d.getMonth()+(+m[1])*(m[2]==='전'?-1:1), 1));
  var m2=s.match(/^@(\d+)일(전|후)$/); if(m2){ var dd=new Date(d.getTime()+(+m2[1])*(m2[2]==='전'?-1:1)*864e5); return dd.getFullYear()+'-'+('0'+(dd.getMonth()+1)).slice(-2)+'-'+('0'+dd.getDate()).slice(-2); }
  return s;
}
var QB_OPS={eq:'=', ne:'≠', contains:'포함', ncontains:'미포함', starts:'시작', gt:'>', gte:'≥', lt:'<', lte:'≤', between:'사이', in:'목록 중', empty:'비어 있음', nempty:'비어 있지 않음'};
function qbTest(v, f, c){
  var op=f.op||'eq', a=qbTok(f.v), b=qbTok(f.v2);
  if(op==='empty') return v==null||v===''||v===false; if(op==='nempty') return !(v==null||v===''||v===false);
  if(v==null) return op==='ne'||op==='ncontains';
  if(c.t==='num'){ var n=Number(v), x=parseFloat(String(a).replace(/[^\d.\-]/g,'')), y=parseFloat(String(b).replace(/[^\d.\-]/g,'')); if(c.won){ x*=1000; y*=1000; }
    if(op==='eq') return n===x; if(op==='ne') return n!==x; if(op==='gt') return n>x; if(op==='gte') return n>=x; if(op==='lt') return n<x; if(op==='lte') return n<=x; if(op==='between') return n>=x&&n<=y;
    if(op==='in') return String(a).split(/[,\s]+/).some(function(t){ return parseFloat(t)*(c.won?1000:1)===n; }); return true; }
  if(c.t==='bool'){ var want=/^(예|true|1|y|o|✓)$/i.test(a); return op==='ne'? v!==want : v===want; }
  var s=String(v), sl=s.toLowerCase(), al=String(a).toLowerCase();
  if(c.t==='date'){ if(/^\d{4}-\d{2}$/.test(a)){ if(op==='eq') return s.indexOf(a)===0; if(op==='ne') return s.indexOf(a)!==0; if(op==='lte'||op==='between') { if(op==='lte') a=a+'-31'; } } if(op==='between' && /^\d{4}-\d{2}$/.test(b)) b=b+'-31'; if(op==='lt' && /^\d{4}-\d{2}$/.test(a)) a=a+'-01'; }
  if(op==='eq') return sl===al; if(op==='ne') return sl!==al; if(op==='contains') return sl.indexOf(al)>=0; if(op==='ncontains') return sl.indexOf(al)<0; if(op==='starts') return sl.indexOf(al)===0;
  if(op==='gt') return s>a; if(op==='gte') return s>=a; if(op==='lt') return s<a; if(op==='lte') return s<=a; if(op==='between') return s>=a && s<=b;
  if(op==='in') return String(a).split(/[,\n]+/).map(function(t){ return t.trim().toLowerCase(); }).filter(Boolean).indexOf(sl)>=0;
  return true;
}
/* 회사명 키 맵 (fuzzy 조인용) */
function qbNameIdx(rows, c){
  var idx={}; rows.forEach(function(r){ var v=qbRaw(r,c); if(v==null||v==='') return; var ks=nmKeys(v); if(!ks.length) ks=[String(v).toLowerCase()]; ks.forEach(function(k){ (idx[k]=idx[k]||[]).push(r); }); }); return idx;
}
function qbNameLookup(idx, v){ if(v==null||v==='') return []; var ks=nmKeys(v); if(!ks.length) ks=[String(v).toLowerCase()]; for(var i=0;i<ks.length;i++){ if(idx[ks[i]]) return idx[ks[i]]; } return []; }
/* ---- 실행 ---- */
function qbRun(spec){
  var t0=Date.now(), S=qbSources(), warn=[];
  var base=S[spec.base]; if(!base) return {cols:[],rows:[],total:0,warn:['기준 표가 없습니다']};
  var have=[spec.base];
  var rows=base.rows().map(function(r){ var o={}; o[spec.base]=r; return o; });
  var baseN=rows.length;
  (spec.joins||[]).forEach(function(j){
    var s=S[j.t]; if(!s || have.indexOf(j.t)>=0) return;
    var aId=j.on[0], bId=j.on[1]; var ca=qbCol(aId), cb=qbCol(bId); if(!ca||!cb) return;
    if(ca.src===j.t){ var tmp=ca; ca=cb; cb=tmp; }             // a 는 이미 들어온 표, b 는 새 표
    var src=s.rows(), idx={}, fuzzy=!!j.fuzzy;
    var jw=(j.where||[]).filter(function(f){ return f.c && qbCol(f.c) && qbCol(f.c).src===j.t && (f.op==='empty'||f.op==='nempty'||String(f.v||'').trim()!==''); });
    if(jw.length) src=src.filter(function(r){ return jw.every(function(f){ var c=qbCol(f.c); return qbTest(qbRaw(r,c), f, c); }); });   // 연결 표 자체 조건 (ON … AND) — 기준 행은 남기고 붙는 쪽만 걸러냄
    if(fuzzy) idx=qbNameIdx(src, cb); else src.forEach(function(r){ var v=qbRaw(r,cb); if(v==null||v==='') return; (idx[String(v)]=idx[String(v)]||[]).push(r); });
    var out=[], expanded=0;
    rows.forEach(function(cr){ var ar=cr[ca.src]; var v=ar? qbRaw(ar,ca) : null;
      var m= (v==null||v==='')? [] : (fuzzy? qbNameLookup(idx,v) : (idx[String(v)]||[]));
      if(!m.length){ if(!j.inner){ var o=Object.assign({},cr); o[j.t]=null; out.push(o); } return; }
      if(m.length>1) expanded+=m.length-1;
      m.forEach(function(x){ var o=Object.assign({},cr); o[j.t]=x; out.push(o); }); });
    if(expanded>0) j._expanded=expanded;
    rows=out; have.push(j.t);
  });
  var joinedN=rows.length;
  if(joinedN>baseN && (spec.joins||[]).filter(function(j){ return j._expanded; }).length>=2) warn.push('1:N 연결이 두 개 이상 겹쳐 행이 '+baseN.toLocaleString()+' → '+joinedN.toLocaleString()+' 로 늘었습니다 — «건수(행)» 는 늘어난 행을 세므로 «고유 개수» 를 쓰세요 (합계·평균은 원본 행 기준으로 한 번씩만 더합니다).');
  /* 조건 (AND) */
  var fs=(spec.filters||[]).filter(function(f){ return f.c && qbCol(f.c) && (f.op==='empty'||f.op==='nempty'||String(f.v||'').trim()!==''); });
  if(fs.length) rows=rows.filter(function(cr){ return fs.every(function(f){ return qbTest(qbGet(cr,f.c), f, qbCol(f.c)); }); });
  var filteredN=rows.length;
  var cols=[], out=[];
  var G=spec.group||{}, by=(G.by||[]).filter(function(b){ return b.c && qbCol(b.c); }), aggs=(G.aggs||[]).filter(function(a){ return a.fn==='count' || (a.c && qbCol(a.c)); });
  var piv=(G.pivot && G.pivot.c && qbCol(G.pivot.c))? G.pivot : null;
  if(by.length || aggs.length || piv){
    if(!aggs.length) aggs=[{fn:'count'}];
    var keys=by.slice(); if(piv) keys.push(piv);
    var groups={}, order=[];
    rows.forEach(function(cr){
      var kv=keys.map(function(b){ return qbTr(qbGet(cr,b.c), b.tr); });
      var k=kv.map(function(x){ return x==null? '\u0000':String(x); }).join('\u0001');
      var g=groups[k]; if(!g){ g=groups[k]={kv:kv, rows:[]}; order.push(g); } g.rows.push(cr);
    });
    function aggVal(g, a){
      /* 값 집계는 «같은 원본 행은 한 번만» — 1:N 연결로 행이 늘어도 합계가 중복되지 않게 (count 는 늘어난 행 수 그대로) */
      var vals=[]; if(a.c){ var c=qbCol(a.c), seen=new Set(); g.rows.forEach(function(cr){ var sr=cr[c.src]; if(!sr || seen.has(sr)) return; seen.add(sr); var v=qbRaw(sr,c); if(v!=null && v!=='') vals.push(v); }); }
      switch(a.fn){
        case 'count': return g.rows.length;
        case 'dcount': var s={}; vals.forEach(function(v){ s[String(v)]=1; }); return Object.keys(s).length;
        case 'sum': return vals.reduce(function(x,y){ return x+(Number(y)||0); },0);
        case 'avg': return vals.length? vals.reduce(function(x,y){ return x+(Number(y)||0); },0)/vals.length : null;
        case 'min': return vals.length? vals.reduce(function(x,y){ return (x==null||y<x)? y : x; }, null) : null;
        case 'max': return vals.length? vals.reduce(function(x,y){ return (x==null||y>x)? y : x; }, null) : null;
        case 'list': var u={}, L=[]; vals.forEach(function(v){ var k=String(v); if(!u[k]){ u[k]=1; L.push(k); } }); return L.slice(0,12).join(', ')+(L.length>12? ' 외 '+(L.length-12):'');
        case 'first': return vals.length? vals[0] : null;
      } return null;
    }
    function aggDef(a, i){ var c=a.c? qbCol(a.c) : null, FN={count:'건수',dcount:'고유 개수',sum:'합계',avg:'평균',min:'최소',max:'최대',list:'목록',first:'첫 값'};
      var isNum=(a.fn==='count'||a.fn==='dcount'||a.fn==='sum'||a.fn==='avg') || (c && c.t==='num' && (a.fn==='min'||a.fn==='max'));
      var l=a.alias || (a.fn==='count'? '건수' : (c? c.l.replace(/\(천원\)/,'') : '')+' '+FN[a.fn]);
      var won=!!(c && c.won && (a.fn==='sum'||a.fn==='avg'||a.fn==='min'||a.fn==='max'||a.fn==='first'));
      return {id:'a'+i, l:l+(won?'(천원)':''), t: isNum? 'num' : (c? (a.fn==='list'? 'text' : c.t) : 'text'), won:won, noSum:(a.fn==='avg'||a.fn==='min'||a.fn==='max'||a.fn==='dcount'||a.fn==='list'||a.fn==='first'), agg:a.fn};
    }
    by.forEach(function(b,i){ var c=qbCol(b.c); cols.push({id:'g'+i, l:c.l+(b.tr&&b.tr!=='raw'? ' ('+({y:'연도',q:'분기',ym:'월',m:'월(1~12)'})[b.tr]+')':''), t:(b.tr&&b.tr!=='raw')? 'text' : c.t, src:c, tr:b.tr, group:true}); });
    if(!piv){
      aggs.forEach(function(a,i){ cols.push(aggDef(a,i)); });
      order.forEach(function(g){ out.push(g.kv.concat(aggs.map(function(a){ return aggVal(g,a); }))); });
    } else {
      var a=aggs[0], ad=aggDef(a,0), pc=qbCol(piv.c), pvals={}, pl=[];
      order.forEach(function(g){ var pv=g.kv[by.length]; var k=pv==null? '(없음)':String(pv); if(!pvals[k]){ pvals[k]=1; pl.push(k); } });
      pl.sort(function(x,y){ return (pc.t==='num')? (parseFloat(x)-parseFloat(y)) : String(x).localeCompare(String(y),'ko'); });
      if(pl.length>60){ warn.push('피벗 열이 '+pl.length+'개 — 60개까지만 표시'); pl=pl.slice(0,60); }
      pl.forEach(function(p,i){ cols.push({id:'p'+i, l:p, t:ad.t, won:ad.won, noSum:ad.noSum, pivot:true}); });
      cols.push({id:'ptot', l:'합계', t:ad.t, won:ad.won, noSum:ad.noSum, ptot:true});
      var rowsBy={}, rorder=[];
      order.forEach(function(g){ var rk=g.kv.slice(0,by.length).map(function(x){ return x==null?'\u0000':String(x); }).join('\u0001'); var R=rowsBy[rk]; if(!R){ R=rowsBy[rk]={kv:g.kv.slice(0,by.length), cells:{}}; rorder.push(R); } var pv=g.kv[by.length]; R.cells[pv==null?'(없음)':String(pv)]=aggVal(g,a); });
      rorder.forEach(function(R){ var cells=pl.map(function(p){ return R.cells[p]==null? null : R.cells[p]; }); var tot=null;
        if(!ad.noSum) tot=cells.reduce(function(x,y){ return x+(Number(y)||0); },0); else if(a.fn==='avg'){ var vs=cells.filter(function(v){ return v!=null; }); tot=vs.length? vs.reduce(function(x,y){ return x+y; },0)/vs.length : null; }
        out.push(R.kv.concat(cells,[tot])); });
    }
  } else {
    var sel=(spec.sel||[]).filter(function(id){ return qbCol(id); });
    if(!sel.length){ sel=base.cols.slice(0,10).map(function(c){ return c.id; }); var num=base.cols.filter(function(c){ return c.t==='num' && !c.noSum; })[0]; if(num && sel.indexOf(num.id)<0) sel.push(num.id); }   // 기본 열에 금액·수량 열 하나는 포함 (차트용)
    sel.forEach(function(id){ var c=qbCol(id); cols.push({id:id, l:(c.src===spec.base? '' : S[c.src].label+' › ')+c.l, t:c.t, won:c.won, src:c, noSum:!!c.noSum}); });
    out=rows.map(function(cr){ return sel.map(function(id){ return qbGet(cr,id); }); });
  }
  /* 결과 조건 */
  var pf=(spec.post||[]).filter(function(f){ return f.c!=null && (f.op==='empty'||f.op==='nempty'||String(f.v||'').trim()!==''); });
  if(pf.length){ out=out.filter(function(r){ return pf.every(function(f){ var ci=cols.findIndex(function(c){ return c.id===f.c; }); if(ci<0) return true; var c=cols[ci]; return qbTest(r[ci], f, {t:c.t, won:c.won}); }); }); }
  /* 정렬 */
  var so=(spec.sort||[]).filter(function(s){ return cols.some(function(c){ return c.id===s.c; }); });
  if(so.length){ out.sort(function(x,y){ for(var i=0;i<so.length;i++){ var ci=cols.findIndex(function(c){ return c.id===so[i].c; }), c=cols[ci], a=x[ci], b=y[ci], d=0;
      if(a==null&&b==null) d=0; else if(a==null) d=1; else if(b==null) d=-1; else if(c.t==='num') d=a-b; else d=String(a).localeCompare(String(b),'ko');
      if(d) return so[i].dir==='desc'? -d : d; } return 0; }); }
  var total=out.length;
  if(spec.limit>0 && out.length>spec.limit) out=out.slice(0, spec.limit);
  /* 합계 행 (숫자 열) */
  var sums=null; if(out.length>1){ sums=cols.map(function(c,ci){ if(c.t!=='num'||c.noSum||c.group) return null; var s=0, n=0; out.forEach(function(r){ if(r[ci]!=null){ s+=Number(r[ci])||0; n++; } }); return n? s : null; }); if(!sums.some(function(v){ return v!=null; })) sums=null; }
  return {cols:cols, rows:out, total:total, baseN:baseN, joinedN:joinedN, filteredN:filteredN, sums:sums, warn:warn, ms:Date.now()-t0, grouped:!!(by.length||aggs.length||piv), pivot:!!piv};
}
/* 결과 → 차트 데이터 (묶기가 있을 때): x = 첫 묶음 열, 계열 = 집계 열(또는 피벗 열) */
function qbPickMeasures(all){
  var measures=all, pick=QB.chartM;                                   // 차트에 그릴 값: 선택(QB.chartM) 또는 자동
  if(pick && pick!=='all'){ measures=all.filter(function(m){ return m.c.id===pick; }); if(!measures.length) measures=all; }
  else if(!pick || pick==='auto'){ var wonM=all.filter(function(m){ return m.c.won; }); if(wonM.length && wonM.length<all.length) measures=wonM; }   // 금액과 건수가 섞이면 금액만 (축 단위가 다름)
  return measures;
}
/* 결과 → 차트 데이터
   · 묶기(집계)가 있으면: x = 첫 묶음 열, 계열 = 집계/피벗 열
   · 행 그대로면: x = 구분 열(고객사·서비스·월 …, 선택 가능 QB.chartX) 로 행을 합산해서 그림 — 숫자 열이 없으면 건수 */
function qbChart(res){
  if(!res || !res.rows.length) return null;
  var cols=res.cols;
  if(res.grouped){
    var gi=cols.findIndex(function(c){ return c.group; }); if(gi<0) return null;
    var all=cols.map(function(c,i){ return {c:c,i:i}; }).filter(function(x){ return !x.c.group && x.c.t==='num' && !x.c.ptot; });
    if(!all.length) return null;
    var measures=qbPickMeasures(all);
    var rows=res.rows.slice(0,40), labels=rows.map(function(r){ return r[gi]==null? '(없음)':String(qbFmtCell(r[gi], cols[gi])||'(없음)'); });
    var gcol=cols[gi], isTime= gcol.tr==='ym'||gcol.tr==='y'||gcol.tr==='q'||(gcol.src&&(gcol.src.t==='month'||gcol.src.t==='date')&&!gcol.tr);
    var series=measures.slice(0,12).map(function(m){ return {label:m.c.l, data:rows.map(function(r){ return Number(r[m.i])||0; })}; });
    return {type: isTime? 'lines':'bars', labels:labels, series:series, money:measures.every(function(m){ return m.c.won; }), truncated:res.rows.length>40, all:all, picked:measures.length===all.length? 'all' : (measures.length===1? measures[0].c.id : 'auto'), xLabel:gcol.l};
  }
  var xs=cols.map(function(c,i){ return {c:c,i:i}; }).filter(function(x){ return x.c.t!=='num' && x.c.t!=='bool'; });
  if(!xs.length) return null;
  var xi=xs.filter(function(x){ return x.c.id===QB.chartX; })[0] || xs.filter(function(x){ return !/번호|시리얼|비고|요청|메모|note/i.test(x.c.l); })[0] || xs[0];
  var ms=cols.map(function(c,i){ return {c:c,i:i}; }).filter(function(x){ return x.c.t==='num' && !x.c.noSum; });
  var count=!ms.length; if(count) ms=[{c:{id:'__count', l:'건수', t:'num'}, i:-1}];
  var meas=qbPickMeasures(ms);
  var isTime= xi.c.t==='month'||xi.c.t==='date';
  var map={}, order=[];
  res.rows.forEach(function(r){ var v=r[xi.i]; var k= v==null||v===''? '(없음)' : String(isTime? qbTr(v,'ym') : (qbFmtCell(v, xi.c)||v)); if(!map[k]){ map[k]=meas.map(function(){ return 0; }); order.push(k); } meas.forEach(function(m,j){ map[k][j]+= count? 1 : (Number(r[m.i])||0); }); });
  if(isTime) order.sort(); else order.sort(function(a,b){ return map[b][0]-map[a][0]; });
  var labels=order.slice(0,40);
  var series=meas.slice(0,12).map(function(m,j){ return {label:m.c.l, data:labels.map(function(k){ return map[k][j]; })}; });
  return {type: isTime? 'lines':'bars', labels:labels, series:series, money:!count && meas.every(function(m){ return m.c.won; }), truncated:order.length>40, all:ms, picked:meas.length===ms.length? 'all' : (meas.length===1? meas[0].c.id : 'auto'), xs:xs, xi:xi.c.id, xLabel:xi.c.l, merged:order.length<res.rows.length, count:count};
}

/* ---- 데이터 조합 화면 (리포트 메뉴) ---- */
var QB={spec:null, res:null, view:'table', title:'', page:300, savedId:null, deckOpen:false, mode:'ui', sql:''};
function qbKey(){ return 'svc_qb_'+(AUTH_USER||'anon'); }
function qbSaved(){ try{ return JSON.parse(localStorage.getItem(qbKey())||'[]')||[]; }catch(e){ return []; } }
function qbSavedSet(L){ try{ localStorage.setItem(qbKey(), JSON.stringify(L)); }catch(e){ toast('저장 실패','브라우저 저장 공간이 부족합니다','bad'); } }
function qbNewSpec(base){ return {base:base||'contracts', joins:[], filters:[], sel:[], group:{by:[], aggs:[], pivot:null}, post:[], sort:[], limit:0}; }
/* 프리셋 — 자주 쓰는 조합 예시 (스펙은 저장한 조합과 같은 모양) */
var QB_PRESETS=[
  {id:'p_cust', name:'고객사별 계약 수 · MRR · 임대 장비', spec:{base:'customers', joins:[{t:'contracts',on:['customers.id','contracts.customer_id']},{t:'assets',on:['customers.name','assets.customer'],fuzzy:true,where:[{c:'assets.status',op:'eq',v:'임대중'}]}], filters:[], sel:[],
     group:{by:[{c:'customers.name'}], aggs:[{fn:'dcount',c:'contracts.id',alias:'계약 수'},{fn:'sum',c:'contracts.mrr',alias:'MRR'},{fn:'dcount',c:'assets.serial',alias:'임대중 장비(대)'}], pivot:null}, post:[], sort:[{c:'a1',dir:'desc'}], limit:0}},
  {id:'p_line_month', name:'서비스별 월 매출 추이 (최근 12개월)', spec:{base:'mrs', joins:[{t:'contracts',on:['mrs.contract_id','contracts.id']}], filters:[{c:'mrs.month',op:'gte',v:'@11개월전'},{c:'mrs.month',op:'lte',v:'@이번달'}], sel:[],
     group:{by:[{c:'mrs.month',tr:'ym'}], aggs:[{fn:'sum',c:'mrs.amount',alias:'매출'}], pivot:{c:'contracts.line'}}, post:[], sort:[{c:'g0',dir:'asc'}], limit:0}},
  {id:'p_ch_month', name:'채널 × 설치 월 — 장비 설치 대수 (피벗)', spec:{base:'orders', joins:[], filters:[{c:'orders.status',op:'in',v:'설치완료, 회수예정, 회수완료'}], sel:[],
     group:{by:[{c:'orders.channel'}], aggs:[{fn:'sum',c:'orders.qty',alias:'설치 대수'}], pivot:{c:'orders.install_date',tr:'ym'}}, post:[], sort:[{c:'ptot',dir:'desc'}], limit:0}},
  {id:'p_expire', name:'3개월 내 만료 계약 + 고객 산업군·임대 장비', spec:{base:'contracts', joins:[{t:'customers',on:['contracts.customer_id','customers.id']},{t:'assets',on:['contracts._custName','assets.customer'],fuzzy:true,where:[{c:'assets.status',op:'eq',v:'임대중'}]}], filters:[{c:'contracts.end_month',op:'between',v:'@이번달',v2:'@3개월후'}], sel:[],
     group:{by:[{c:'contracts._custName'},{c:'contracts.line'},{c:'contracts.end_month'},{c:'customers.industry'}], aggs:[{fn:'sum',c:'contracts.mrr',alias:'MRR'},{fn:'dcount',c:'assets.serial',alias:'임대중 장비(대)'}], pivot:null}, post:[], sort:[{c:'g2',dir:'asc'}], limit:0}},
  {id:'p_ind_live', name:'산업군별 LIVE 고객 수 · 노드', spec:{base:'live', joins:[], filters:[], sel:[], group:{by:[{c:'live.ind'}], aggs:[{fn:'dcount',c:'live.cust',alias:'LIVE 고객 수'},{fn:'sum',c:'live.nodes',alias:'노드 합계'}], pivot:null}, post:[], sort:[{c:'a0',dir:'desc'}], limit:0}},
  {id:'p_return', name:'회수 예정 장비 목록 (신청 ↔ 현황)', spec:{base:'assets', joins:[{t:'orders',on:['assets.order_id','orders.id'],inner:true}], filters:[{c:'orders.status',op:'eq',v:'회수예정'}], sel:['assets.serial','assets.model','assets.status','assets.customer','assets.channel','assets.deployed_date','orders.id','orders.status','orders.returned_date','orders.request_note'],
     group:{by:[],aggs:[],pivot:null}, post:[], sort:[{c:'assets.customer',dir:'asc'}], limit:0}},
  {id:'p_oi', name:'OI 진행상태별 건수 · 예상 금액', spec:{base:'oi', joins:[], filters:[], sel:[], group:{by:[{c:'oi.stage'}], aggs:[{fn:'count'},{fn:'sum',c:'oi.expect_amount',alias:'예상 금액'}], pivot:null}, post:[], sort:[{c:'a1',dir:'desc'}], limit:0}},
  {id:'p_cloud', name:'클라우드 비용 — 계정 × 월 (원화 환산)', spec:{base:'cloud', joins:[], filters:[{c:'cloud.ym',op:'gte',v:'@11개월전'}], sel:[], group:{by:[{c:'cloud.ym',tr:'ym'}], aggs:[{fn:'sum',c:'cloud._krwCalc',alias:'비용'}], pivot:{c:'cloud._acct'}}, post:[], sort:[{c:'g0',dir:'asc'}], limit:0}}
];
function qbTables(spec){ return [spec.base].concat((spec.joins||[]).map(function(j){ return j.t; })); }
function qbColOpts(spec, cur, filterFn){
  var S=qbSources(), h='';
  qbTables(spec).forEach(function(t){ var s=S[t]; if(!s) return; var cs=s.cols.filter(function(c){ return !filterFn || filterFn(c); }); if(!cs.length) return;
    h+='<optgroup label="'+esc(s.label)+'">'+cs.map(function(c){ return '<option value="'+c.id+'"'+(c.id===cur?' selected':'')+'>'+esc(c.l)+'</option>'; }).join('')+'</optgroup>'; });
  return h;
}
function qbOutColOpts(cols, cur){ return (cols||[]).map(function(c){ return '<option value="'+c.id+'"'+(c.id===cur?' selected':'')+'>'+esc(c.l)+'</option>'; }).join(''); }
var QB_SEL_LBL={base:'기준 표', jadd:'표 연결', seladd:'열 추가', pc:'피벗 열', tr:'날짜 묶기 단위'};   /* ㊿+141 접근성: 이름 없는 select */
function qbSel(name, opts, cur, cls){ return '<select data-qb="'+name+'" aria-label="'+(QB_SEL_LBL[name]||'선택')+'" class="qb-sel'+(cls? ' '+cls:'')+'">'+opts+'</select>'; }
function qbOpOpts(cur){ return Object.keys(QB_OPS).map(function(k){ return '<option value="'+k+'"'+(k===cur?' selected':'')+'>'+QB_OPS[k]+'</option>'; }).join(''); }
function qbTrOpts(c, cur){ if(!c || !(c.t==='month'||c.t==='date')) return ''; return '<select data-qb="tr" aria-label="날짜 묶기 단위" class="qb-sel qb-tr"><option value="raw"'+(!cur||cur==='raw'?' selected':'')+'>'+(c.t==='date'?'날짜 그대로':'월 그대로')+'</option><option value="ym"'+(cur==='ym'?' selected':'')+'>월(YYYY-MM)</option><option value="q"'+(cur==='q'?' selected':'')+'>분기</option><option value="y"'+(cur==='y'?' selected':'')+'>연도</option><option value="m"'+(cur==='m'?' selected':'')+'>월(1~12)</option></select>'; }
function qbFnOpts(c, cur){ var F=[['count','건수(행)'],['dcount','고유 개수'],['sum','합계'],['avg','평균'],['min','최소'],['max','최대'],['list','값 목록'],['first','첫 값']]; if(c && c.t!=='num') F=F.filter(function(f){ return f[0]!=='sum'&&f[0]!=='avg'; }); return F.map(function(f){ return '<option value="'+f[0]+'"'+(f[0]===cur?' selected':'')+'>'+f[1]+'</option>'; }).join(''); }
function qbFilterRow(f, i, spec, kind){
  var c=qbCol(f.c), needV=!(f.op==='empty'||f.op==='nempty');
  var vals=''; if(c && c.t==='text' && kind!=='post'){ try{ var vs=qbDistinct(spec, f.c); if(vs.length && vs.length<=200) vals='<datalist id="qbdl_'+kind+i+'">'+vs.map(function(v){ return '<option value="'+esc(v)+'">'; }).join('')+'</datalist>'; }catch(e){} }
  return '<div class="qb-row" data-i="'+i+'" data-kind="'+kind+'">'+(kind==='post'? qbSel('c','<option value="">열…</option>'+qbOutColOpts(QB.res&&QB.res.cols, f.c), f.c) : qbSel('c', qbColOpts(spec, f.c), f.c))+
    qbSel('op', qbOpOpts(f.op||'eq'), f.op, 'qb-op')+
    (needV? '<input data-qb="v" class="qb-in" value="'+esc(f.v||'')+'" placeholder="'+(c&&c.t==='month'? 'YYYY-MM · @이번달 · @3개월전' : c&&c.t==='num'? (c.won? '천원':'숫자') : '값')+'"'+(vals? ' list="qbdl_'+kind+i+'"':'')+'>'+vals : '')+
    (needV && f.op==='between'? '<input data-qb="v2" class="qb-in" value="'+esc(f.v2||'')+'" placeholder="~ 까지">' : '')+
    '<button type="button" class="cbtn qb-x" data-qb="del" title="빼기">×</button></div>';
}
function qbDistinct(spec, cid){ var c=qbCol(cid); if(!c) return []; var S=qbSources(), rows=S[c.src].rows(), u={}, out=[]; for(var i=0;i<rows.length && out.length<=200;i++){ var v=qbRaw(rows[i],c); if(v==null||v==='') continue; var k=String(v); if(!u[k]){ u[k]=1; out.push(k); } } return out.sort(function(a,b){ return a.localeCompare(b,'ko'); }); }
function qbModeHtml(){ return '<div class="qb-mode"><div class="eqb-seg"><button type="button" data-qbmode="ui" aria-pressed="'+(QB.mode!=='sql')+'">UI 로 조합</button><button type="button" data-qbmode="sql" aria-pressed="'+(QB.mode==='sql')+'">SQL 직접 작성</button></div></div>'; }
function qbPanelHtml(){
  if(QB.mode==='sql') return qbModeHtml()+qbSqlPanelHtml();
  var spec=QB.spec, S=qbSources(), have=qbTables(spec), G=spec.group||{by:[],aggs:[]};
  var h=qbModeHtml();
  /* ① 기준 표 */
  h+='<section class="qb-sec"><div class="qb-h"><span class="qb-n">1</span>기준 표</div>'+qbSel('base', Object.keys(S).filter(function(k){ return k[0]!=='_'; }).map(function(k){ return '<option value="'+k+'"'+(k===spec.base?' selected':'')+'>'+esc(S[k].label)+'</option>'; }).join(''), spec.base, 'qb-base')+
    '<span class="mini qb-cnt">'+(S[spec.base]? S[spec.base].rows().length.toLocaleString()+'행' : '')+'</span></section>';
  /* ② 연결 */
  var cands=qbJoinCands(have);
  h+='<section class="qb-sec"><div class="qb-h"><span class="qb-n">2</span>연결 (JOIN)<span class="mini" style="margin-left:auto">키가 맞는 표만 목록에 나옵니다</span></div>';
  (spec.joins||[]).forEach(function(j,i){ var s=S[j.t]; if(!s) return;
    var ca=qbCol(j.on[0]), cb=qbCol(j.on[1]);
    h+='<div class="qb-join" data-i="'+i+'"><div class="qb-join-h"><b>'+esc(s.label)+'</b><span class="mini">'+esc(ca? S[ca.src].label+' › '+ca.l : j.on[0])+' '+(j.fuzzy?'≈':'=')+' '+esc(cb? cb.l : j.on[1])+(j._expanded? ' · 행 +'+j._expanded.toLocaleString():'')+'</span>'+
      '<label class="mini qb-chk"><input type="checkbox" data-qb="inner"'+(j.inner?' checked':'')+'> 일치하는 행만</label><button type="button" class="cbtn qb-x" data-qb="jdel" title="연결 빼기">×</button></div>'+
      '<div class="qb-join-w"><span class="mini">이 표의 조건</span>'+(j.where||[]).map(function(f,k){ return '<div class="qb-row" data-i="'+k+'" data-kind="jw'+i+'">'+qbSel('c','<optgroup label="'+esc(s.label)+'">'+s.cols.map(function(c){ return '<option value="'+c.id+'"'+(c.id===f.c?' selected':'')+'>'+esc(c.l)+'</option>'; }).join('')+'</optgroup>', f.c)+qbSel('op', qbOpOpts(f.op||'eq'), f.op,'qb-op')+((f.op==='empty'||f.op==='nempty')? '':'<input data-qb="v" class="qb-in" value="'+esc(f.v||'')+'" placeholder="값">')+'<button type="button" class="cbtn qb-x" data-qb="del">×</button></div>'; }).join('')+
      '<button type="button" class="cbtn qb-add" data-qb="jwadd">＋ 조건</button></div></div>';
  });
  if(cands.length) h+='<select data-qb="jadd" aria-label="표 연결" class="qb-sel qb-addsel"><option value="">＋ 표 연결…</option>'+cands.map(function(c,i){ var ca=qbCol(c.on[0]), cb=qbCol(c.on[1]); return '<option value="'+i+'">'+esc(S[c.t].label)+' — '+esc(S[ca.src].label+' › '+ca.l)+' '+(c.fuzzy?'≈':'=')+' '+esc(cb.l)+'</option>'; }).join('')+'</select>';
  else h+='<div class="mini">더 연결할 수 있는 표가 없습니다</div>';
  h+='</section>';
  /* ③ 조건 */
  h+='<section class="qb-sec"><div class="qb-h"><span class="qb-n">3</span>조건 (모두 만족)</div>'+(spec.filters||[]).map(function(f,i){ return qbFilterRow(f,i,spec,'f'); }).join('')+
    '<button type="button" class="cbtn qb-add" data-qb="fadd">＋ 조건</button><div class="mini" style="margin-top:6px">값에 <code>@이번달</code> <code>@지난달</code> <code>@올해</code> <code>@오늘</code> <code>@3개월전</code> <code>@3개월후</code> 를 쓸 수 있습니다 · 금액 조건은 천원 단위</div></section>';
  /* ④ 묶기·집계·피벗 */
  h+='<section class="qb-sec"><div class="qb-h"><span class="qb-n">4</span>묶기 · 집계 · 피벗<span class="mini" style="margin-left:auto">비우면 행 그대로</span></div>';
  h+='<div class="qb-sub">묶을 열</div>'+(G.by||[]).map(function(b,i){ var c=qbCol(b.c); return '<div class="qb-row" data-i="'+i+'" data-kind="by">'+qbSel('c', qbColOpts(spec,b.c), b.c)+qbTrOpts(c,b.tr)+'<button type="button" class="cbtn qb-x" data-qb="del">×</button></div>'; }).join('')+'<button type="button" class="cbtn qb-add" data-qb="byadd">＋ 묶을 열</button>';
  h+='<div class="qb-sub">집계</div>'+(G.aggs||[]).map(function(a,i){ var c=a.c? qbCol(a.c):null; return '<div class="qb-row" data-i="'+i+'" data-kind="agg">'+qbSel('fn', qbFnOpts(c,a.fn), a.fn,'qb-fn')+(a.fn==='count'? '' : qbSel('c', qbColOpts(spec,a.c), a.c))+'<input data-qb="alias" class="qb-in qb-alias" value="'+esc(a.alias||'')+'" placeholder="열 이름(선택)"><button type="button" class="cbtn qb-x" data-qb="del">×</button></div>'; }).join('')+'<button type="button" class="cbtn qb-add" data-qb="aggadd">＋ 집계</button>';
  var pv=G.pivot||null, pc=pv? qbCol(pv.c):null;
  h+='<div class="qb-sub">피벗 (열로 펼칠 항목 · 첫 집계 값)</div><div class="qb-row" data-kind="pivot">'+qbSel('pc','<option value="">없음</option>'+qbColOpts(spec, pv&&pv.c), pv&&pv.c)+(pc? qbTrOpts(pc, pv.tr):'')+'</div>';
  h+='</section>';
  /* ⑤ 열 선택 (묶기 없을 때) */
  var grouped=!!((G.by||[]).length||(G.aggs||[]).length||(G.pivot&&G.pivot.c));
  if(!grouped){
    var sel=(spec.sel||[]).filter(function(id){ return qbCol(id); });
    h+='<section class="qb-sec"><div class="qb-h"><span class="qb-n">5</span>보일 열<span class="mini" style="margin-left:auto">'+(sel.length? sel.length+'개':'기본 열')+'</span></div><div class="qb-chips">'+
      sel.map(function(id,i){ var c=qbCol(id); return '<span class="qb-chip" data-i="'+i+'">'+esc((c.src===spec.base?'':S[c.src].label+' › ')+c.l)+'<button type="button" data-qb="seldel" title="빼기">×</button></span>'; }).join('')+'</div>'+
      '<select data-qb="seladd" aria-label="열 추가" class="qb-sel qb-addsel"><option value="">＋ 열 추가…</option>'+qbColOpts(spec, null, function(c){ return sel.indexOf(c.id)<0; })+'</select> <button type="button" class="cbtn" data-qb="selall">기준 표 전체</button> <button type="button" class="cbtn" data-qb="selclr">비우기</button></section>';
  }
  /* ⑥ 결과 조건·정렬·상위 */
  h+='<section class="qb-sec"><div class="qb-h"><span class="qb-n">'+(grouped?5:6)+'</span>결과 조건 · 정렬 · 상위</div>';
  h+='<div class="qb-sub">결과 조건 (집계 값에도)</div>'+(spec.post||[]).map(function(f,i){ return qbFilterRow(f,i,spec,'post'); }).join('')+'<button type="button" class="cbtn qb-add" data-qb="padd">＋ 결과 조건</button>';
  h+='<div class="qb-sub">정렬</div>'+(spec.sort||[]).map(function(s,i){ return '<div class="qb-row" data-i="'+i+'" data-kind="sort">'+qbSel('c', qbOutColOpts(QB.res&&QB.res.cols, s.c), s.c)+'<select data-qb="dir" class="qb-sel qb-dir"><option value="asc"'+(s.dir!=='desc'?' selected':'')+'>오름차순 ↑</option><option value="desc"'+(s.dir==='desc'?' selected':'')+'>내림차순 ↓</option></select><button type="button" class="cbtn qb-x" data-qb="del">×</button></div>'; }).join('')+'<button type="button" class="cbtn qb-add" data-qb="sadd">＋ 정렬</button>';
  h+='<div class="qb-sub">상위 N행만 <input data-qb="limit" class="qb-in" type="number" min="0" style="width:80px" value="'+(spec.limit||'')+'" placeholder="전체"></div></section>';
  return h;
}
function qbResultHtml(){
  var r=QB.res, S=qbSources(); if(!r) return '';
  var ch=qbChart(r);
  var h='<div class="qb-res-h"><input id="qbTitle" class="qb-title" value="'+esc(QB.title||qbAutoTitle())+'" placeholder="결과 제목">'+
    '<span class="mini qb-meta">'+r.total.toLocaleString()+'행'+(r.rows.length<r.total? ' (상위 '+r.rows.length.toLocaleString()+')':'')+(r.sql? ' · SQL' : ' · 기준 '+r.baseN.toLocaleString()+(r.joinedN!==r.baseN? ' → 연결 후 '+r.joinedN.toLocaleString():'')+(r.filteredN!==r.joinedN? ' → 조건 후 '+r.filteredN.toLocaleString():''))+' · '+r.ms+'ms</span></div>'+
    '<div class="qb-res-t"><div class="eqb-seg"><button type="button" data-qbv="table" aria-pressed="'+(QB.view==='table')+'">표</button><button type="button" data-qbv="chart" aria-pressed="'+(QB.view==='chart')+'">차트</button><button type="button" data-qbv="both" aria-pressed="'+(QB.view==='both')+'">둘 다</button></div>'+
    (ch && QB.view!=='table' && ch.xs && ch.xs.length>1? '<label class="mini qb-chk">가로축 <select id="qbChartX" class="qb-sel">'+ch.xs.map(function(x){ return '<option value="'+x.c.id+'"'+(ch.xi===x.c.id?' selected':'')+'>'+esc(x.c.l)+'</option>'; }).join('')+'</select></label>' : '')+
    (ch && QB.view!=='table' && ch.all.length>1? '<label class="mini qb-chk">값 <select id="qbChartM" class="qb-sel" title="차트에 그릴 값"><option value="auto"'+(ch.picked==='auto'?' selected':'')+'>자동</option><option value="all"'+(ch.picked==='all'?' selected':'')+'>모든 값</option>'+ch.all.map(function(m){ return '<option value="'+m.c.id+'"'+(ch.picked===m.c.id?' selected':'')+'>'+esc(m.c.l)+'</option>'; }).join('')+'</select></label>' : '')+
    '<span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="cbtn" id="qbSave" title="이 조합을 저장해 두고 다음에 바로 불러옵니다">'+(QB.savedId? '💾 저장(덮어쓰기)':'💾 저장')+'</button><button type="button" class="cbtn" id="qbXlsx">⬇ 엑셀</button><button type="button" class="cbtn pri" id="qbDeck">＋ PPT 슬라이드에 추가</button></span></div>';
  if(r.warn&&r.warn.length) h+='<div class="qb-warn">'+r.warn.map(function(w){ return '⚠ '+esc(w); }).join('<br>')+'</div>';
  if((QB.view==='chart'||QB.view==='both') && ch) h+='<div class="legend" id="qbLegend">'+ch.series.map(function(sr,i){ return '<span class="li"><span class="sw" style="background:'+cssv('--s'+((i%8)+1))+'"></span>'+esc(sr.label)+'</span>'; }).join('')+(ch.money? '<span class="mini" style="margin-left:auto">단위: 천원</span>':'')+'</div><div class="chartbox h260" id="qbChart"></div><div class="mini">'+esc(ch.xLabel||'')+'별 '+esc(ch.series.map(function(x){ return x.label; }).join(' · '))+(ch.merged? ' — 같은 '+esc(ch.xLabel)+' 행은 '+(ch.count?'건수로 셈':'합산')+'':'')+(ch.truncated? ' · 상위 40개만':'')+'</div>';
  if(QB.view!=='chart'){
    var rows=r.rows.slice(0, QB.page);
    h+='<div class="tbl-wrap qb-tbl" tabindex="0" role="region" aria-label="조합 결과 표" style="max-height:'+(QB.view==='both'? 360:620)+'px"><table class="pr"><thead><tr>'+r.cols.map(function(c){ return '<th'+(c.t==='num'?' class="n"':'')+(c.pivot?' style="text-align:right"':'')+'>'+esc(c.l)+'</th>'; }).join('')+'</tr></thead><tbody>'+
      rows.map(function(row){ return '<tr>'+row.map(function(v,ci){ var c=r.cols[ci]; return '<td'+(c.t==='num'?' class="n"':'')+'>'+esc(qbFmtCell(v,c))+'</td>'; }).join('')+'</tr>'; }).join('')+'</tbody>'+
      (r.sums? '<tfoot><tr>'+r.cols.map(function(c,ci){ var v=r.sums[ci]; return '<td'+(c.t==='num'?' class="n"':'')+'>'+(ci===0&&v==null? '합계' : (v==null? '' : esc(qbFmtCell(v,c))))+'</td>'; }).join('')+'</tr></tfoot>':'')+'</table></div>';
    if(r.rows.length>QB.page) h+='<div style="text-align:center;margin-top:8px"><button type="button" class="cbtn" id="qbMore">더 보기 (+300 · 남은 '+(r.rows.length-QB.page).toLocaleString()+'행)</button></div>';
    if(!r.rows.length) h+='<div class="cap" style="padding:30px;text-align:center">조건에 맞는 행이 없습니다</div>';
  }
  return h;
}
function qbFmtCell(v, c){ if(c.src && !c.pivot && !c.agg) return qbFmt(v, c.src, c.tr); if(v==null||v==='') return ''; if(c.t==='num'){ if(c.won) return won(v); return (Math.round(Number(v)*100)/100).toLocaleString('ko-KR'); } if(c.t==='bool') return v?'예':'아니오'; return String(v); }
function qbAutoTitle(){ if(QB.mode==='sql') return 'SQL 조회'; var S=qbSources(), sp=QB.spec, s=S[sp.base]; if(!s) return '데이터 조합'; var G=sp.group||{}; var by=(G.by||[]).map(function(b){ var c=qbCol(b.c); return c? c.l:''; }).filter(Boolean);
  var t=s.label+(sp.joins&&sp.joins.length? ' + '+sp.joins.map(function(j){ return S[j.t]? S[j.t].label:''; }).filter(Boolean).join(' + ') : '');
  if(by.length) t=by.join(' · ')+'별 '+t; if(G.pivot&&G.pivot.c){ var pc=qbCol(G.pivot.c); if(pc) t+=' × '+pc.l; } return t; }
function qbRunNow(){
  var host=$('#qbRes'); if(!host) return;
  if(QB.mode==='sql'){ qbSqlRun(); return; }
  var S=qbSources(); QB._ld=QB._ld||{};
  var pending=qbTables(QB.spec).filter(function(t){ var s=S[t]; if(!s||!s.lazy) return false; var need=(t==='inbound'? RAWX.inbound===undefined : t==='cloud'? !RAWX.cloud : false); if(need && !QB._ld[t]){ QB._ld[t]=1; s.lazy(function(){ QB._ld[t]=0; qbSources._c=null; if(CUR_VIEW==='report') qbRunNow(); }); } return need; });
  if(pending.length){ host.innerHTML='<div class="cap" style="padding:30px;text-align:center">'+pending.map(function(t){ return S[t].label; }).join(', ')+' 데이터를 불러오는 중…</div>'; return; }
  try{ QB.res=qbRun(QB.spec); }catch(e){ host.innerHTML='<div class="qb-warn">실행 오류: '+esc(String(e.message||e))+'</div>'; return; }
  qbResultDraw();
}
/* 결과 그리기 (UI 빌더·SQL 공용) */
function qbResultDraw(){
  var host=$('#qbRes'); if(!host||!QB.res) return;
  if(QB.view!=='table' && !qbChart(QB.res)) QB.view='table';
  host.innerHTML=qbResultHtml();
  var ch=qbChart(QB.res), cb=document.getElementById('qbChart');
  if(ch && cb){ try{ var fmt=ch.money? won : function(v){ return Math.round(v).toLocaleString('ko-KR'); }; var sers=ch.series.map(function(s,i){ return {label:s.label, data:s.data, color:cssv('--s'+((i%8)+1))}; });
    if(ch.type==='lines') Viz.lines(cb,{labels:ch.labels, series:sers, fmt:fmt, fill:sers.length===1, padL:56}); else Viz.bars(cb,{labels:ch.labels, series:sers, fmt:fmt, padL:56}); }catch(e){} }
  var ti=$('#qbTitle'); if(ti) ti.oninput=function(){ QB.title=this.value; };
  host.querySelectorAll('[data-qbv]').forEach(function(b){ b.onclick=function(){ if(b.dataset.qbv!=='table' && !qbChart(QB.res)){ toast('차트를 그릴 수 없습니다', QB.res&&QB.res.rows.length? '고객사·서비스·월처럼 구분이 되는 열을 «보일 열» 에 넣어 주세요' : '결과 행이 없습니다', 'bad'); return; } QB.view=b.dataset.qbv; qbResultDraw(); }; });
  var mb=$('#qbMore'); if(mb) mb.onclick=function(){ QB.page+=300; qbResultDraw(); };
  var cm=$('#qbChartM'); if(cm) cm.onchange=function(){ QB.chartM=cm.value; qbResultDraw(); };
  var cx=$('#qbChartX'); if(cx) cx.onchange=function(){ QB.chartX=cx.value; qbResultDraw(); };
  var sv=$('#qbSave'); if(sv) sv.onclick=qbSaveCur;
  var xl=$('#qbXlsx'); if(xl) xl.onclick=function(){ var r=QB.res; xlsxAoa(QB.title||qbAutoTitle(), r.cols.map(function(c){ return c.l; }), r.rows.map(function(row){ return row.map(function(v,ci){ var c=r.cols[ci]; return (c.t==='num'&&v!=null)? (c.won? Math.round(v/1000) : v) : qbFmtCell(v,c); }); })).catch(function(e){ toast('엑셀 실패', String(e.message||e).slice(0,80),'bad'); }); };
  var dk=$('#qbDeck'); if(dk) dk.onclick=qbDeckAdd;
  if(QB.mode!=='sql') qbPanelSyncCols();
}
/* 정렬·결과 조건의 열 목록은 결과 열에 따라 달라짐 — 패널을 다시 그리지 않고 select 옵션만 맞춤 (한글 입력 중 초점 유지) */
function qbPanelSyncCols(){ var p=$('#qbPanel'); if(!p||!QB.res) return; p.querySelectorAll('.qb-row[data-kind="sort"] select[data-qb="c"], .qb-row[data-kind="post"] select[data-qb="c"]').forEach(function(sel){ var cur=sel.value; sel.innerHTML=(sel.closest('.qb-row').dataset.kind==='post'? '<option value="">열…</option>':'')+qbOutColOpts(QB.res.cols, cur); if(cur && !QB.res.cols.some(function(c){ return c.id===cur; })) sel.value=''; }); }
var QB_T=null;
function qbRun_(){ clearTimeout(QB_T); QB_T=setTimeout(function(){ QB.page=300; qbRunNow(); }, 180); }
function qbPanelRefresh(){ var p=$('#qbPanel'); if(!p) return; p.innerHTML=qbPanelHtml(); if(QB.mode==='sql') qbSqlBind(); }
function qbBindPanel(){
  var p=$('#qbPanel'); if(!p || p._qb) return; p._qb=1;
  function rowOf(el){ var r=el.closest('.qb-row'); return r? {kind:r.dataset.kind, i:+r.dataset.i} : null; }
  function listFor(kind){ var sp=QB.spec; if(kind==='f') return sp.filters; if(kind==='post') return sp.post; if(kind==='by') return sp.group.by; if(kind==='agg') return sp.group.aggs; if(kind==='sort') return sp.sort; if(/^jw\d+$/.test(kind)){ var j=sp.joins[+kind.slice(2)]; if(j){ j.where=j.where||[]; return j.where; } } return null; }
  p.addEventListener('change', function(e){
    var el=e.target, k=el.dataset.qb, sp=QB.spec; if(!k) return;
    var row=rowOf(el), L=row? listFor(row.kind) : null;
    if(k==='base'){ QB.spec=qbNewSpec(el.value); QB.title=''; QB.savedId=null; QB.chartM=null; QB.chartX=null; qbPanelRefresh(); qbRun_(); return; }
    if(k==='jadd'){ var cands=qbJoinCands(qbTables(sp)), c=cands[+el.value]; if(c){ sp.joins.push({t:c.t, on:c.on, fuzzy:c.fuzzy, where:[]}); qbPanelRefresh(); qbRun_(); } return; }
    if(k==='inner'){ var ji=+el.closest('.qb-join').dataset.i; sp.joins[ji].inner=el.checked; qbRun_(); return; }
    if(k==='pc'){ sp.group.pivot= el.value? {c:el.value, tr:'raw'} : null; qbPanelRefresh(); qbRun_(); return; }
    if(k==='tr' && row && row.kind==='pivot'){ if(sp.group.pivot) sp.group.pivot.tr=el.value; qbRun_(); return; }
    if(k==='seladd'){ if(el.value){ sp.sel.push(el.value); qbPanelRefresh(); qbRun_(); } return; }
    if(k==='limit'){ sp.limit=Math.max(0, parseInt(el.value,10)||0); qbRun_(); return; }
    if(row && L){ var it=L[row.i]; if(!it) return;
      if(k==='c'){ it.c=el.value; if(row.kind==='by'){ var cc=qbCol(el.value); if(!(cc&&(cc.t==='month'||cc.t==='date'))) delete it.tr; } if(row.kind==='agg'){ var ac=qbCol(el.value); if(ac && ac.t!=='num' && (it.fn==='sum'||it.fn==='avg')) it.fn='dcount'; } qbPanelRefresh(); qbRun_(); return; }
      if(k==='op'){ it.op=el.value; qbPanelRefresh(); qbRun_(); return; }
      if(k==='tr'){ it.tr=el.value; qbRun_(); return; }
      if(k==='fn'){ it.fn=el.value; if(it.fn==='count') delete it.c; else if(!it.c){ var first=qbColOpts(sp,null,function(c){ return c.t==='num'; }).match(/value="([^"]+)"/); it.c=first? first[1] : null; } qbPanelRefresh(); qbRun_(); return; }
      if(k==='dir'){ it.dir=el.value; qbRun_(); return; }
      if(k==='v'||k==='v2'||k==='alias'){ it[k]=el.value; qbRun_(); return; }
    }
  });
  p.addEventListener('input', function(e){ var el=e.target, k=el.dataset.qb; if(!k) return; var row=rowOf(el), L=row? listFor(row.kind) : null; if(row && L && L[row.i] && (k==='v'||k==='v2'||k==='alias')){ L[row.i][k]=el.value; qbRun_(); } if(k==='limit'){ QB.spec.limit=Math.max(0, parseInt(el.value,10)||0); qbRun_(); } });
  p.addEventListener('click', function(e){
    var mb=e.target.closest('[data-qbmode]'); if(mb){ var m=mb.dataset.qbmode; if(m!==QB.mode){ QB.mode=m; QB.page=300; if(m==='sql' && !String(QB.sql||'').trim()) QB.sql=qbSpecToSql(QB.spec); qbPanelRefresh(); qbRunNow(); } return; }
    var el=e.target.closest('[data-qb]'); if(!el) return; var k=el.dataset.qb, sp=QB.spec;
    if(k==='del'){ var row=rowOf(el), L=row? listFor(row.kind) : null; if(L){ L.splice(row.i,1); qbPanelRefresh(); qbRun_(); } return; }
    if(k==='jdel'){ var ji=+el.closest('.qb-join').dataset.i, t=sp.joins[ji].t; sp.joins.splice(ji,1);
      /* 그 표를 쓰는 조건·열·묶기도 함께 정리 */ var keep=qbTables(sp); function ok(id){ var c=qbCol(id); return c && keep.indexOf(c.src)>=0; }
      sp.filters=sp.filters.filter(function(f){ return ok(f.c); }); sp.sel=sp.sel.filter(ok); sp.group.by=sp.group.by.filter(function(b){ return ok(b.c); }); sp.group.aggs=sp.group.aggs.filter(function(a){ return a.fn==='count'||ok(a.c); }); if(sp.group.pivot&&!ok(sp.group.pivot.c)) sp.group.pivot=null; sp.joins=sp.joins.filter(function(j){ return ok(j.on[0])&&ok(j.on[1]); });
      qbPanelRefresh(); qbRun_(); return; }
    if(k==='jwadd'){ var ji2=+el.closest('.qb-join').dataset.i, j=sp.joins[ji2]; j.where=j.where||[]; j.where.push({c:qbSources()[j.t].cols[0].id, op:'eq', v:''}); qbPanelRefresh(); return; }
    if(k==='fadd'){ sp.filters.push({c:qbSources()[sp.base].cols[1]? qbSources()[sp.base].cols[1].id : qbSources()[sp.base].cols[0].id, op:'eq', v:''}); qbPanelRefresh(); return; }
    if(k==='padd'){ if(!QB.res||!QB.res.cols.length) return; sp.post.push({c:QB.res.cols[QB.res.cols.length-1].id, op:'gte', v:''}); qbPanelRefresh(); return; }
    if(k==='byadd'){ sp.group.by.push({c:qbSources()[sp.base].cols[1]? qbSources()[sp.base].cols[1].id : qbSources()[sp.base].cols[0].id}); if(!sp.group.aggs.length) sp.group.aggs.push({fn:'count'}); qbPanelRefresh(); qbRun_(); return; }
    if(k==='aggadd'){ var nc=qbColOpts(sp,null,function(c){ return c.t==='num'; }).match(/value="([^"]+)"/); sp.group.aggs.push(nc? {fn:'sum', c:nc[1]} : {fn:'count'}); qbPanelRefresh(); qbRun_(); return; }
    if(k==='sadd'){ if(!QB.res||!QB.res.cols.length) return; var last=QB.res.cols[QB.res.cols.length-1]; sp.sort.push({c:last.id, dir:last.t==='num'?'desc':'asc'}); qbPanelRefresh(); qbRun_(); return; }
    if(k==='seldel'){ var i=+el.closest('.qb-chip').dataset.i; sp.sel.splice(i,1); qbPanelRefresh(); qbRun_(); return; }
    if(k==='selall'){ sp.sel=qbSources()[sp.base].cols.map(function(c){ return c.id; }); qbPanelRefresh(); qbRun_(); return; }
    if(k==='selclr'){ sp.sel=[]; qbPanelRefresh(); qbRun_(); return; }
  });
}
/* 저장·불러오기 */
function qbLoadSql(sql, name, id){ QB.mode='sql'; QB.sql=sql||''; QB.title=name||''; QB.savedId=id||null; QB.page=300; QB.chartM=null; QB.chartX=null; qbPanelRefresh(); qbSqlRun(); qbLibRefresh(); }
function qbLoad(spec, name, id){ QB.mode='ui'; QB.chartM=null; QB.chartX=null; QB.spec=JSON.parse(JSON.stringify(spec)); QB.spec.group=QB.spec.group||{by:[],aggs:[],pivot:null}; QB.spec.joins=QB.spec.joins||[]; QB.spec.filters=QB.spec.filters||[]; QB.spec.sel=QB.spec.sel||[]; QB.spec.post=QB.spec.post||[]; QB.spec.sort=QB.spec.sort||[]; QB.title=name||''; QB.savedId=id||null; QB.page=300; QB.view= (QB.spec.group.by.length||QB.spec.group.pivot)? 'both':'table'; qbPanelRefresh(); qbRunNow(); qbLibRefresh(); }
function qbSaveCur(){
  var L=qbSaved(), name=(QB.title||qbAutoTitle()).trim();
  var cur=QB.savedId? L.filter(function(x){ return x.id===QB.savedId; })[0] : null;
  var nm=prompt(cur? '이름 (덮어쓰기)':'저장할 이름', cur? cur.name : name); if(nm==null) return; nm=nm.trim()||name;
  var payload= QB.mode==='sql'? {sql:QB.sql||'', spec:null} : {spec:JSON.parse(JSON.stringify(QB.spec)), sql:null};
  if(cur){ cur.name=nm; cur.spec=payload.spec; cur.sql=payload.sql; cur.at=new Date().toISOString(); }
  else { var id='q'+Date.now().toString(36); L.push({id:id, name:nm, spec:payload.spec, sql:payload.sql, at:new Date().toISOString()}); QB.savedId=id; }
  QB.title=nm; qbSavedSet(L); qbLibRefresh(); var ti=$('#qbTitle'); if(ti) ti.value=nm; var sv=$('#qbSave'); if(sv) sv.textContent='💾 저장(덮어쓰기)'; toast('저장했습니다', nm, 'ok');
}
function qbLibHtml(){
  var L=qbSaved(), h='<div class="qb-lib"><span class="mini" style="font-weight:600">저장한 조합</span>';
  if(!L.length) h+='<span class="mini">없음 — 결과 위 «저장» 으로 보관</span>';
  L.forEach(function(x){ h+='<span class="qb-chip'+(x.id===QB.savedId?' on':'')+'" data-load="'+x.id+'">'+(x.sql? '<code>SQL</code> ':'')+esc(x.name)+'<button type="button" data-qdel="'+x.id+'" title="삭제">×</button></span>'; });
  h+='<span class="qb-lib-sep"></span><span class="mini" style="font-weight:600">예시</span>'+QB_PRESETS.map(function(p){ return '<span class="qb-chip ghost" data-preset="'+p.id+'">'+esc(p.name)+'</span>'; }).join('')+'</div>';
  return h;
}
function qbLibRefresh(){ var el=$('#qbLib'); if(!el) return; el.innerHTML=qbLibHtml();
  el.querySelectorAll('[data-load]').forEach(function(c){ c.onclick=function(e){ if(e.target.closest('[data-qdel]')) return; var x=qbSaved().filter(function(y){ return y.id===c.dataset.load; })[0]; if(!x) return; if(x.sql) qbLoadSql(x.sql, x.name, x.id); else qbLoad(x.spec, x.name, x.id); }; });
  el.querySelectorAll('[data-qdel]').forEach(function(b){ b.onclick=function(){ var L=qbSaved(), x=L.filter(function(y){ return y.id===b.dataset.qdel; })[0]; if(!x || !confirm('«'+x.name+'» 을 삭제할까요?')) return; qbSavedSet(L.filter(function(y){ return y.id!==x.id; })); if(QB.savedId===x.id) QB.savedId=null; qbLibRefresh(); }; });
  el.querySelectorAll('[data-preset]').forEach(function(c){ c.onclick=function(){ var p=QB_PRESETS.filter(function(x){ return x.id===c.dataset.preset; })[0]; if(p) qbLoad(p.spec, p.name, null); }; });
}
/* PPT 덱 — 결과를 슬라이드 항목으로 (rpbMakePpt 재사용, AI 코멘트 없음) */
function qbDeckAdd(){
  var r=QB.res; if(!r||!r.rows.length){ toast('추가할 결과가 없습니다','', 'bad'); return; }
  var title=(QB.title||qbAutoTitle()).trim(), ch=qbChart(r), L=rpbList();
  var head=r.cols.map(function(c){ return c.l; }), rows=r.rows.slice(0,300).map(function(row){ return row.map(function(v,ci){ return qbFmtCell(v, r.cols[ci]); }); });
  if(r.sums) rows.push(r.cols.map(function(c,ci){ return ci===0? '합계' : (r.sums[ci]==null? '' : qbFmtCell(r.sums[ci], c)); }));
  var isSql=QB.mode==='sql';
  var it={t: (ch && QB.view!=='table')? 'chart':'table', title:title, sub:r.total.toLocaleString()+'행 · '+(isSql? 'SQL 조회' : qbSpecText(QB.spec)), from:'report', note:'', noteSrc:'user', spec: isSql? null : JSON.parse(JSON.stringify(QB.spec)), sql: isSql? QB.sql : null, chartX:QB.chartX||null, chartM:QB.chartM||null,
    table:{head:head, rows:rows, total:r.total}, chart: (ch && QB.view!=='table')? {type:ch.type, labels:ch.labels, series:ch.series, money:ch.money} : null};
  it.id='r'+Date.now().toString(36)+Math.random().toString(36).slice(2,5); it.at=new Date().toISOString(); L.push(it); rpbSave();
  QB.deckOpen=true; qbDeckRefresh(); toast('PPT 슬라이드에 추가했습니다 ('+L.length+')', title, 'ok');
}
function qbSpecText(sp){ var S=qbSources(), G=sp.group||{}; var parts=[S[sp.base]? S[sp.base].label:''].concat((sp.joins||[]).map(function(j){ return '+ '+(S[j.t]? S[j.t].label:''); }));
  var f=(sp.filters||[]).filter(function(x){ return x.c&&qbCol(x.c); }).map(function(x){ return qbCol(x.c).l+' '+QB_OPS[x.op||'eq']+' '+qbTok(x.v||'')+(x.op==='between'? '~'+qbTok(x.v2||''):''); });
  return parts.join(' ')+(f.length? ' · '+f.join(', '):'')+((G.by||[]).length? ' · '+G.by.map(function(b){ var c=qbCol(b.c); return c? c.l:''; }).join('·')+'별':''); }
function qbDeckHtml(){
  var L=rpbList();
  var h='<div class="qb-deck-h"><b>PPT 슬라이드</b><span class="mini">'+L.length+'장 · 순서대로 슬라이드가 됩니다</span><span style="margin-left:auto;display:flex;gap:6px"><button type="button" class="cbtn" id="qbDeckTog">'+(QB.deckOpen?'접기':'펼치기')+'</button><button type="button" class="cbtn pri" id="qbDeckPpt"'+(L.length?'':' disabled')+'>⬇ PPT 내보내기</button></span></div>';
  if(QB.deckOpen && L.length){
    h+='<div class="pr-ctl" style="margin:8px 0 6px"><span class="pr-f"><span class="l">제목</span><input id="rpbTitle" value="'+esc(RPV.title)+'" class="qb-in" style="width:280px"></span><span class="pr-f"><span class="l">표지 라벨</span><input id="rpbSub" value="'+esc(RPV.sub||thisMonthStr())+'" class="qb-in" style="width:120px"></span><span class="pr-note" id="rpbMsg" style="margin-left:auto"></span></div>';
    h+='<div class="qb-deck-list">'+L.map(function(it,i){ return '<div class="qb-deck-it" data-id="'+it.id+'"><span class="rpb-n">'+(i+1)+'</span><input class="qb-in" data-f="title" value="'+esc(it.title||'')+'" style="flex:1;min-width:0"><span class="ctag">'+(it.t==='chart'?'차트+표':it.t==='table'?'표':it.t)+'</span><span class="mini">'+esc(String(it.sub||'').slice(0,60))+'</span>'+
      '<span style="margin-left:auto;display:flex;gap:4px"><button type="button" class="cbtn" data-qload="1" title="이 조합을 다시 불러와 편집"'+((it.spec||it.sql)?'':' disabled')+'>↺</button><button type="button" class="cbtn" data-mv="-1">▲</button><button type="button" class="cbtn" data-mv="1">▼</button><button type="button" class="cbtn" data-del="1" style="color:var(--critical)">×</button></span></div>'; }).join('')+'</div>';
  }
  return h;
}
function qbDeckRefresh(){ var el=$('#qbDeck2'); if(!el) return; el.innerHTML=qbDeckHtml(); var L=rpbList();
  var tg=$('#qbDeckTog'); if(tg) tg.onclick=function(){ QB.deckOpen=!QB.deckOpen; qbDeckRefresh(); };
  var pp=$('#qbDeckPpt'); if(pp) pp.onclick=function(){ RPV.ai=false; rpbMakePpt(); };
  var ti=$('#rpbTitle'); if(ti) ti.oninput=function(){ RPV.title=this.value; }; var si=$('#rpbSub'); if(si) si.oninput=function(){ RPV.sub=this.value; };
  el.querySelectorAll('.qb-deck-it').forEach(function(row){ var it=L.filter(function(x){ return x.id===row.dataset.id; })[0]; if(!it) return;
    var t=row.querySelector('[data-f="title"]'); t.oninput=function(){ it.title=t.value; }; t.onblur=function(){ rpbSave(); };
    row.querySelectorAll('[data-mv]').forEach(function(b){ b.onclick=function(){ var i=L.indexOf(it), j=i+(+b.dataset.mv); if(j<0||j>=L.length) return; L.splice(i,1); L.splice(j,0,it); rpbSave(); qbDeckRefresh(); }; });
    var d=row.querySelector('[data-del]'); d.onclick=function(){ L.splice(L.indexOf(it),1); rpbSave(); qbDeckRefresh(); };
    var ld=row.querySelector('[data-qload]'); if(ld && (it.spec||it.sql)) ld.onclick=function(){ if(it.sql) qbLoadSql(it.sql, it.title, null); else qbLoad(it.spec, it.title, null); };
  });
}
/* ---- SQL 직접 작성 (수기 쿼리) — 같은 표를 SQL 로 조회. 엔진은 AlaSQL(브라우저 안, 메모리 표) — 서버·DB 에는 닿지 않음 ----
   · 표 이름: customers · contracts · mrs · live · orders · assets · oi · mdrops · inbound · lg · cloud (UI 빌더와 같은 열 + 계산 열 · 월 열은 'YYYY-MM')
   · 보조 함수: WON(x) 원→천원 · NMKEY(s) 회사명 매칭 키(별칭·㈜·띄어쓰기 무시) · YM(d) 'YYYY-MM' · YR(d) 연도 · QTR(d) 'YYYY-Qn' · MON(d) 월(1~12) · SVC(line) 서비스 이름 · 한글 식별자는 qbSqlKo() 가 자동 인용
   · SELECT / WITH 만 허용. 표는 복사본으로 등록하므로 원본 메모리 데이터는 바뀌지 않음                                              */
var QB_SQL_ALIAS={customers:'cu', contracts:'ct', mrs:'m', live:'lv', orders:'o', assets:'a', oi:'oi', mdrops:'md', inbound:'ib', lg:'lg', cloud:'cl'};
function loadAlasql(){ return loadLib('alasql'); }
function qbSqlFns(){
  if(!window.alasql || alasql.fn.__qb) return;
  alasql.fn.WON=function(v){ return v==null? null : Math.round(Number(v)/1000); };
  alasql.fn.NMKEY=function(s){ var k=nmKeys(s); return k.length? k[0] : String(s==null?'':s).toLowerCase(); };
  alasql.fn.YM=function(d){ return d==null? null : String(d).slice(0,7); };
  alasql.fn.YR=function(d){ return d==null? null : String(d).slice(0,4); };
  alasql.fn.QTR=function(d){ return d==null? null : qbTr(String(d).slice(0,7),'q'); };
  alasql.fn.MON=function(d){ return d==null? null : (+String(d).slice(5,7)||null); };
  alasql.fn.SVC=function(l){ return l==null? null : lline(l); };
  alasql.fn.__qb=true;
}
/* 소스 표 → 복사본 행(계산 열·회사명 키 포함) 을 alasql 에 등록 */
function qbSqlTables(){
  var S=qbSources(), names=Object.keys(S).filter(function(k){ return k[0]!=='_'; });
  names.forEach(function(t){
    var s=S[t], cols=s.cols, rows=s.rows().map(function(r){
      var o=Object.assign({}, r);
      cols.forEach(function(c){ if(c.get) o[c.k]=c.get(r); if((c.t==='month'||c.t==='date') && o[c.k]!=null) o[c.k]=String(o[c.k]).slice(0, c.t==='month'? 7:10); });
      Object.keys(o).forEach(function(k){ if(k[0]==='_' && !cols.some(function(c){ return c.k===k; })) delete o[k]; });   // 화면용 임시 필드는 뺌
      var nm= t==='customers'? o.name : t==='contracts'? o._custName : t==='live'? o.cust : t==='inbound'? o.org : o.customer;
      if(nm!==undefined){ var ks=nmKeys(nm); o._key= ks.length? ks[0] : String(nm==null?'':nm).toLowerCase(); }
      return o;
    });
    alasql.tables[t]=new alasql.Table({data:rows});
  });
}
function qbSqlStrip(sql){ return String(sql||'').replace(/\/\*[\s\S]*?\*\//g,'').replace(/--[^\n]*/g,'').trim(); }
/* 한글 별칭·열 이름을 따옴표 없이 써도 되게 — 문자열·인용 식별자는 건너뛰고, «AS 계약 수» 처럼 띄어쓴 별칭도 하나로 묶음 */
function qbSqlKo(sql){
  var RES=/^(FROM|WHERE|GROUP|ORDER|LIMIT|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|HAVING|UNION|AND|OR|DESC|ASC|BY|WITH|SELECT|AS|CASE|WHEN|THEN|ELSE|END|IN|NOT|LIKE|BETWEEN|IS|NULL|DISTINCT|TOP|OFFSET|FETCH|USING|NATURAL)$/i;
  function code(seg){
    seg=seg.replace(/\bAS\s+([^\s,()"'\[\]`][^,()\n"'\[\]`]*)/gi, function(m, al){
      var toks=al.trim().split(/\s+/), keep=[], rest=[];
      for(var k=0;k<toks.length;k++){ if(RES.test(toks[k])){ rest=toks.slice(k); break; } keep.push(toks[k]); }
      var name=keep.join(' '); if(!/[가-힣]/.test(name)) return m;
      return 'AS "'+name+'"'+(rest.length? ' '+rest.join(' '):'');
    });
    return seg.split('"').map(function(part,k){ return k%2? part : part.replace(/[\w가-힣]*[가-힣][\w가-힣]*/g, function(t){ return '"'+t+'"'; }); }).join('"');   // AS 로 이미 인용된 부분은 건너뜀
  }
  var s=String(sql||''), out='', buf='', i=0, n=s.length;
  while(i<n){ var ch=s[i];
    if(ch==="'"||ch==='"'||ch==='['||ch==='`'){ out+=code(buf); buf=''; var close= ch==='['? ']' : ch, j=i+1;
      while(j<n){ if(s[j]===close){ if(close==="'" && s[j+1]==="'"){ j+=2; continue; } break; } j++; }
      out+=s.slice(i, j+1); i=j+1; continue; }
    buf+=ch; i++; }
  return out+code(buf);
}
function qbSqlRefs(sql){ var S=qbSources(), out=[]; Object.keys(S).forEach(function(t){ if(t[0]!=='_' && new RegExp('\\b'+t+'\\b','i').test(sql)) out.push(t); }); return out; }
async function qbSqlRun(){
  var host=$('#qbRes'), errBox=$('#qbSqlErr'); if(!host) return;
  var sql=QB.sql||''; var body=qbSqlStrip(sql);
  function fail(msg){ if(errBox){ errBox.textContent=msg; errBox.style.display=''; } }
  if(errBox){ errBox.style.display='none'; errBox.textContent=''; }
  if(!body){ host.innerHTML='<div class="cap" style="padding:30px;text-align:center">왼쪽에 SQL 을 쓰고 실행하세요 — 예시를 골라 시작할 수 있습니다</div>'; return; }
  if(!/^(select|with)\b/i.test(body)){ fail('SELECT 또는 WITH 로 시작하는 조회만 실행할 수 있습니다 (INSERT·UPDATE·DELETE·DROP 은 막혀 있습니다).'); return; }
  if(/;\s*\S/.test(body.replace(/;\s*$/,''))){ fail('한 번에 하나의 SELECT 만 실행합니다.'); return; }
  /* 지연 로드 표 */
  var S=qbSources(), refs=qbSqlRefs(body); QB._ld=QB._ld||{};
  var pending=refs.filter(function(t){ var s=S[t]; if(!s.lazy) return false; var need=(t==='inbound'? RAWX.inbound===undefined : t==='cloud'? !RAWX.cloud : false); if(need && !QB._ld[t]){ QB._ld[t]=1; s.lazy(function(){ QB._ld[t]=0; qbSources._c=null; if(CUR_VIEW==='report' && QB.mode==='sql') qbSqlRun(); }); } return need; });
  if(pending.length){ host.innerHTML='<div class="cap" style="padding:30px;text-align:center">'+pending.map(function(t){ return S[t].label; }).join(', ')+' 데이터를 불러오는 중…</div>'; return; }
  host.innerHTML='<div class="cap" style="padding:30px;text-align:center">실행 중…</div>';
  try{ await loadAlasql(); }catch(e){ fail(String(e.message||e)); host.innerHTML=''; return; }
  qbSqlFns();
  var t0=Date.now(), data;
  try{ qbSqlTables(); data=alasql(qbSqlKo(body.replace(/;\s*$/,''))); }
  catch(e){ var m=String(e.message||e); m=m.replace(/^Parse error on line (\d+):\n?/,'문법 오류 ($1번째 줄): ').replace(/Expecting[\s\S]*$/,'').replace(/Table does not exist: (\w+)/,'표가 없습니다: $1 (표 이름은 아래 «표·열» 참고)').replace(/Column not found/,'열을 찾을 수 없습니다'); fail(m.trim()); host.innerHTML=''; QB.res=null; return; }
  if(!Array.isArray(data)) data=[{결과:data}];
  if(data.length && Array.isArray(data[0])) data=data[data.length-1];      // 여러 문장이면 마지막
  /* 결과 → 공용 표 모양 */
  var keys=[]; data.slice(0,200).forEach(function(r){ Object.keys(r||{}).forEach(function(k){ if(keys.indexOf(k)<0) keys.push(k); }); });
  if(!keys.length && data.length) keys=Object.keys(data[0]);
  var cols=keys.map(function(k){ var vals=data.slice(0,500).map(function(r){ return r[k]; }).filter(function(v){ return v!=null && v!==''; });
    var isNum=vals.length && vals.every(function(v){ return typeof v==='number' && isFinite(v); }), isBool=vals.length && vals.every(function(v){ return typeof v==='boolean'; });
    var isMonth=!isNum && vals.length && vals.every(function(v){ return /^\d{4}-\d{2}$/.test(String(v)); });
    return {id:k, l:k, t: isNum? 'num' : isBool? 'bool' : 'text', noSum: isNum && (/(^|_)(id|no)$|번호|_id$|^id$/i.test(k)), sqlMonth:isMonth}; });
  var rows=data.map(function(r){ return keys.map(function(k){ var v=r[k]; if(v!=null && typeof v==='object'){ try{ v=JSON.stringify(v); }catch(e){ v=String(v); } } return v; }); });
  var sums=null; if(rows.length>1){ sums=cols.map(function(c,ci){ if(c.t!=='num'||c.noSum) return null; var s=0,n=0; rows.forEach(function(r){ if(r[ci]!=null){ s+=Number(r[ci])||0; n++; } }); return n? s:null; }); if(!sums.some(function(v){ return v!=null; })) sums=null; }
  QB.res={cols:cols, rows:rows, total:rows.length, baseN:rows.length, joinedN:rows.length, filteredN:rows.length, sums:sums, warn:[], ms:Date.now()-t0, grouped:false, pivot:false, sql:true};
  if(QB.view!=='table' && !qbChart(QB.res)) QB.view='table';
  qbResultDraw();
}
/* 표·열 목록 (클릭하면 커서 위치에 삽입) */
function qbSchemaHtml(){
  var S=qbSources(), h='<div class="qb-sub">표 · 열 <span class="mini">(클릭하면 SQL 에 삽입 · 이름은 영문)</span></div>';
  Object.keys(S).filter(function(k){ return k[0]!=='_'; }).forEach(function(t){ var s=S[t], n=0; try{ n=s.lazy? null : s.rows().length; }catch(e){}
    h+='<details class="qb-tb"><summary><code data-ins="'+t+'">'+t+'</code> <span>'+esc(s.label)+'</span><span class="mini" style="margin-left:auto">'+(n==null? '지연 로드' : n.toLocaleString()+'행')+'</span></summary><div class="qb-cols">'+
      s.cols.map(function(c){ return '<span class="qb-colchip" data-ins="'+(QB_SQL_ALIAS[t]||t)+'.'+c.k+'" title="'+esc(c.l)+' · '+(QB_TYPES[c.t]||c.t)+(c.won?' · 원 단위(WON 으로 천원)':'')+'"><code>'+esc(c.k)+'</code> '+esc(c.l)+'</span>'; }).join('')+
      '<span class="qb-colchip" data-ins="'+(QB_SQL_ALIAS[t]||t)+'._key" title="회사명 매칭 키 — 다른 표의 _key 와 = 로 연결"><code>_key</code> 회사명 키</span></div></details>'; });
  h+='<div class="mini" style="margin-top:8px;line-height:1.7">함수: <code data-ins="WON()">WON(x)</code> 원→천원 · <code data-ins="NMKEY()">NMKEY(s)</code> 회사명 키 · <code data-ins="YM()">YM(d)</code> 월 · <code data-ins="YR()">YR(d)</code> 연도 · <code data-ins="QTR()">QTR(d)</code> 분기 · <code data-ins="MON()">MON(d)</code> 월(1~12) · <code data-ins="SVC()">SVC(line)</code> 서비스 코드→이름 · 그 외 SUM COUNT(DISTINCT …) AVG MIN MAX CASE WHEN LIKE IN BETWEEN SUBSTR ROUND 서브쿼리 WITH</div>';
  return h;
}
function qbSqlExamples(){
  var now=new Date(), ym=function(k){ var d=new Date(now.getFullYear(), now.getMonth()+k, 1); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2); };
  return [
    {name:'고객사별 계약 수 · MRR · 임대중 장비', sql:
'-- 고객사 기준으로 계약(고객 번호)과 장비 현황(회사명 키)을 붙여 집계\nSELECT cu.name AS "고객사", cu.industry AS "산업군",\n       COUNT(DISTINCT ct.id) AS "계약 수",\n       WON(SUM(ct.mrr)) AS "MRR(천원)",\n       COUNT(DISTINCT a.serial) AS "임대중 장비"\nFROM customers cu\nLEFT JOIN contracts ct ON ct.customer_id = cu.id\nLEFT JOIN assets a ON a._key = cu._key AND a.status = \'임대중\'\nGROUP BY cu.name, cu.industry\nORDER BY "MRR(천원)" DESC'},
    {name:'서비스별 월 매출 (최근 12개월, 가로 펼침)', sql:
'-- CASE WHEN 으로 서비스를 열로 펼침 (금액 천원)\nSELECT m.month AS "월",\n       WON(SUM(CASE WHEN ct.line=\'Cloud\' THEN m.amount ELSE 0 END)) AS "Cloud NAC",\n       WON(SUM(CASE WHEN ct.line=\'S1\' THEN m.amount ELSE 0 END)) AS "S1 Cloud NAC",\n       WON(SUM(CASE WHEN ct.line IN (\'MDR\',\'MDR_S1\') THEN m.amount ELSE 0 END)) AS "MDR",\n       WON(SUM(m.amount)) AS "합계"\nFROM mrs m\nJOIN contracts ct ON ct.id = m.contract_id\nWHERE m.month BETWEEN \''+ym(-11)+'\' AND \''+ym(0)+'\'\nGROUP BY m.month\nORDER BY m.month'},
    {name:'3개월 내 만료 계약 + 임대중 장비 대수', sql:
'SELECT ct._custName AS "고객사", ct.line AS "서비스", ct.end_month AS "종료월", WON(ct.mrr) AS "MRR(천원)",\n       (SELECT COUNT(*) FROM assets a WHERE a._key = ct._key AND a.status = \'임대중\') AS "임대중 장비"\nFROM contracts ct\nWHERE ct.end_month BETWEEN \''+ym(0)+'\' AND \''+ym(3)+'\'\nORDER BY ct.end_month, "MRR(천원)" DESC'},
    {name:'채널 × 설치월 장비 대수', sql:
'SELECT o.channel AS "채널", YM(o.install_date) AS "설치월", SUM(o.qty) AS "대수"\nFROM orders o\nWHERE o.status IN (\'설치완료\',\'회수예정\',\'회수완료\')\nGROUP BY o.channel, YM(o.install_date)\nORDER BY "설치월", "채널"'},
    {name:'회수 예정 장비 — 신청과 현황 대조', sql:
'SELECT a.serial, a.model, a.status AS "현황 상태", a.customer AS "고객사", o.id AS "신청 번호", o.status AS "신청 상태", o.returned_date AS "회수일"\nFROM assets a\nJOIN orders o ON o.id = a.order_id\nWHERE o.status = \'회수예정\'\nORDER BY a.customer, a.serial'},
    {name:'산업군별 LIVE 고객 수 · 노드 · MRR', sql:
'SELECT lv.ind AS "산업군", COUNT(DISTINCT lv.cust) AS "LIVE 고객", SUM(lv.nodes) AS "노드",\n       WON(SUM(ct.mrr)) AS "현행 계약 MRR(천원)"\nFROM live lv\nLEFT JOIN contracts ct ON ct.id = lv.ctId\nGROUP BY lv.ind\nORDER BY "LIVE 고객" DESC'}
  ];
}
/* UI 빌더 스펙 → SQL (시작점 · 피벗은 GROUP BY 로 풀어서) */
function qbSpecToSql(sp){
  var S=qbSources(), al={}; qbTables(sp).forEach(function(t){ al[t]=QB_SQL_ALIAS[t]||t; });
  function ref(id){ var c=qbCol(id); return c? al[c.src]+'.'+c.k : id; }
  function lit(v, c){ v=qbTok(v); if(c && c.t==='num'){ var n=parseFloat(String(v).replace(/[^\d.\-]/g,'')); if(!isFinite(n)) return '0'; return String(c.won? n*1000 : n); } return "'"+String(v).replace(/'/g,"''")+"'"; }
  function cond(f, c){ var x=ref(f.c), op=f.op||'eq';
    switch(op){ case 'eq': return x+' = '+lit(f.v,c); case 'ne': return x+' <> '+lit(f.v,c); case 'contains': return x+" LIKE '%"+String(f.v).replace(/'/g,"''")+"%'"; case 'ncontains': return x+" NOT LIKE '%"+String(f.v).replace(/'/g,"''")+"%'"; case 'starts': return x+" LIKE '"+String(f.v).replace(/'/g,"''")+"%'";
      case 'gt': return x+' > '+lit(f.v,c); case 'gte': return x+' >= '+lit(f.v,c); case 'lt': return x+' < '+lit(f.v,c); case 'lte': return x+' <= '+lit(f.v,c); case 'between': return x+' BETWEEN '+lit(f.v,c)+' AND '+lit(f.v2,c);
      case 'in': return x+' IN ('+String(f.v).split(/[,\n]+/).map(function(s){ return s.trim(); }).filter(Boolean).map(function(s){ return lit(s,c); }).join(', ')+')'; case 'empty': return '('+x+" IS NULL OR "+x+" = '')"; case 'nempty': return '('+x+" IS NOT NULL AND "+x+" <> '')"; } return '1=1'; }
  function tr(x, t){ return t==='ym'? 'YM('+x+')' : t==='y'? 'YR('+x+')' : t==='q'? 'QTR('+x+')' : t==='m'? 'MON('+x+')' : x; }
  var G=sp.group||{}, by=(G.by||[]).filter(function(b){ return qbCol(b.c); }), aggs=(G.aggs||[]).filter(function(a){ return a.fn==='count'||qbCol(a.c); }), piv=(G.pivot&&qbCol(G.pivot.c))? G.pivot : null;
  var grouped=!!(by.length||aggs.length||piv), sel=[], grp=[], lines=[], subJ={};
  if(grouped && !aggs.length) aggs=[{fn:'count'}];
  /* 1:N 으로 행을 늘리는 연결 표에 «집계만» 걸려 있으면 — JOIN 대신 상관 서브쿼리로 집계해 SUM/COUNT 중복을 피함 */
  if(grouped){
    var jinfo=(sp.joins||[]).map(function(j){ var a=qbCol(j.on[0]), b=qbCol(j.on[1]); if(!a||!b) return null; if(a.src===j.t){ var t2=a; a=b; b=t2; } return {j:j, a:a, b:b}; }).filter(Boolean);
    var usedT={}; by.concat(piv? [piv]:[]).forEach(function(x){ usedT[qbCol(x.c).src]=1; }); (sp.filters||[]).forEach(function(f){ var c=qbCol(f.c); if(c) usedT[c.src]=1; }); (sp.sort||[]).forEach(function(){});
    jinfo.forEach(function(ji){ var fan=!(S[ji.j.t].key && ji.b.k===S[ji.j.t].key); var on=aggs.filter(function(x){ return x.c && qbCol(x.c).src===ji.j.t; });
      if(fan && !usedT[ji.j.t] && on.length && on.every(function(x){ return /^(dcount|sum|avg|min|max)$/.test(x.fn); })) subJ[ji.j.t]=ji; });
    var changed=true; while(changed){ changed=false; jinfo.forEach(function(ji){ if(!subJ[ji.j.t] && subJ[ji.a.src]){ delete subJ[ji.a.src]; changed=true; } }); }   // 서브쿼리로 뺀 표를 다른 연결이 참조하면 되돌림
  }
  if(grouped){
    by.concat(piv? [piv]:[]).forEach(function(b){ var c=qbCol(b.c), x=tr(ref(b.c), b.tr); sel.push(x+' AS "'+c.l.replace(/"/g,'')+(b.tr&&b.tr!=='raw'? ' ('+({y:'연도',q:'분기',ym:'월',m:'월(1~12)'})[b.tr]+')':'')+'"'); grp.push(x); });
    aggs.forEach(function(a){ var c=a.c? qbCol(a.c):null, x=c? ref(a.c):'*', FN={count:'건수',dcount:'고유 개수',sum:'합계',avg:'평균',min:'최소',max:'최대',list:'목록',first:'첫 값'};
      var expr, sj=c? subJ[c.src] : null;
      if(sj){ var inner= a.fn==='dcount'? 'COUNT(DISTINCT '+x+')' : a.fn.toUpperCase()+'('+x+')';
        var corr= sj.j.fuzzy? (al[sj.j.t]+'._key = '+al[sj.a.src]+'._key') : (ref(sj.b.id)+' = '+ref(sj.a.id));
        (sj.j.where||[]).forEach(function(f){ var c2=qbCol(f.c); if(c2 && (f.op==='empty'||f.op==='nempty'||String(f.v||'').trim()!=='')) corr+=' AND '+cond(f,c2); });
        var outer= (a.fn==='dcount'||a.fn==='sum')? 'SUM' : a.fn.toUpperCase();
        expr= outer+'((SELECT '+inner+' FROM '+sj.j.t+' '+al[sj.j.t]+' WHERE '+corr+'))'; }
      else expr= a.fn==='count'? 'COUNT(*)' : a.fn==='dcount'? 'COUNT(DISTINCT '+x+')' : a.fn==='sum'? 'SUM('+x+')' : a.fn==='avg'? 'AVG('+x+')' : a.fn==='min'? 'MIN('+x+')' : a.fn==='max'? 'MAX('+x+')' : a.fn==='first'? 'FIRST('+x+')' : 'ARRAY('+x+')';
      var won=!!(c&&c.won&&(a.fn==='sum'||a.fn==='avg'||a.fn==='min'||a.fn==='max'||a.fn==='first')); if(won) expr='WON('+expr+')';
      var l=a.alias || (a.fn==='count'? '건수' : (c? c.l.replace(/\(천원\)/,''):'')+' '+FN[a.fn]); sel.push(expr+' AS "'+(l+(won?'(천원)':'')).replace(/"/g,'')+'"'); });
  } else {
    var ids=(sp.sel||[]).filter(function(id){ return qbCol(id); }); if(!ids.length) ids=S[sp.base].cols.slice(0,10).map(function(c){ return c.id; });
    ids.forEach(function(id){ var c=qbCol(id); sel.push(ref(id)+' AS "'+((c.src===sp.base? '' : S[c.src].label+' › ')+c.l).replace(/"/g,'')+'"'); });
  }
  lines.push('SELECT '+sel.join(',\n       '));
  lines.push('FROM '+sp.base+' '+al[sp.base]);
  (sp.joins||[]).forEach(function(j){ var a=qbCol(j.on[0]), b=qbCol(j.on[1]); if(!a||!b || subJ[j.t]) return; if(a.src===j.t){ var t2=a; a=b; b=t2; }
    var on= j.fuzzy? (al[a.src]+'._key = '+al[b.src]+'._key') : (ref(a.id)+' = '+ref(b.id));
    (j.where||[]).forEach(function(f){ var c=qbCol(f.c); if(c && (f.op==='empty'||f.op==='nempty'||String(f.v||'').trim()!=='')) on+=' AND '+cond(f,c); });
    lines.push((j.inner? 'JOIN ':'LEFT JOIN ')+j.t+' '+al[j.t]+' ON '+on); });
  var wh=(sp.filters||[]).filter(function(f){ var c=qbCol(f.c); return c && (f.op==='empty'||f.op==='nempty'||String(f.v||'').trim()!==''); }).map(function(f){ return cond(f, qbCol(f.c)); });
  if(wh.length) lines.push('WHERE '+wh.join('\n  AND '));
  if(grp.length) lines.push('GROUP BY '+grp.join(', '));
  var sql=lines.join('\n');
  var post=(sp.post||[]).filter(function(f){ return f.c && (f.op==='empty'||f.op==='nempty'||String(f.v||'').trim()!==''); });
  var outCols=QB.res&&QB.res.cols? QB.res.cols : [];
  function outName(id){ var c=outCols.filter(function(x){ return x.id===id; })[0]; return c? c.l : id; }
  if(post.length){ sql='SELECT * FROM (\n'+sql.replace(/^/gm,'  ')+'\n) t\nWHERE '+post.map(function(f){ var c=outCols.filter(function(x){ return x.id===f.c; })[0]||{t:'text'}; return cond({c:'"'+outName(f.c)+'"', op:f.op, v:f.v, v2:f.v2}, {t:c.t, won:false}).replace(/^"([^"]+)"/,'"$1"'); }).join('\n  AND '); }
  var so=(sp.sort||[]).filter(function(s){ return s.c; }); if(so.length) sql+='\nORDER BY '+so.map(function(s){ return '"'+outName(s.c).replace(/"/g,'')+'"'+(s.dir==='desc'? ' DESC':''); }).join(', ');
  if(sp.limit>0) sql+='\nLIMIT '+sp.limit;
  var notes=['-- UI 빌더 조건을 SQL 로 옮긴 것입니다 — 자유롭게 고쳐서 실행하세요 (금액은 원 단위 → WON() 으로 천원)'];
  var subNames=Object.keys(subJ); if(subNames.length) notes.push('-- '+subNames.join(', ')+' 는 1:N 으로 행이 늘어나는 표라 JOIN 대신 서브쿼리로 집계했습니다 (합계·건수 중복 방지)');
  else if((sp.joins||[]).length>1 && grouped) notes.push('-- 주의: 1:N 연결이 겹치면 SUM/COUNT 가 중복될 수 있습니다 — COUNT(DISTINCT …) 또는 서브쿼리를 쓰세요');
  if(piv) notes.push('-- 피벗(가로 펼침)은 SQL 에서는 CASE WHEN 열로 만들거나, 결과의 «가로축/값» 차트로 보세요');
  return notes.join('\n')+'\n'+sql;
}
/* 결과 조건의 ref() 가 이미 따옴표 이름인 경우 그대로 */
function qbSqlPanelHtml(){
  var ex=qbSqlExamples();
  return '<section class="qb-sec"><div class="qb-h"><span class="qb-n">SQL</span>직접 작성<span class="mini" style="margin-left:auto">Ctrl/⌘+Enter 실행</span></div>'+
    '<textarea id="qbSqlTa" class="qb-sql" spellcheck="false" placeholder="SELECT cu.name AS &quot;고객사&quot;, WON(SUM(ct.mrr)) AS &quot;MRR(천원)&quot;\nFROM customers cu\nLEFT JOIN contracts ct ON ct.customer_id = cu.id\nGROUP BY cu.name\nORDER BY 2 DESC">'+esc(QB.sql||'')+'</textarea>'+
    '<div class="qb-err" id="qbSqlErr" style="display:none"></div>'+
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;align-items:center"><button type="button" class="cbtn pri" id="qbSqlRun">▶ 실행</button>'+
    '<button type="button" class="cbtn" id="qbSqlFromUi" title="UI 빌더에 설정한 조건을 SQL 로 옮겨 옵니다">UI 조건 → SQL</button>'+
    '<select id="qbSqlEx" class="qb-sel" style="flex:1 1 120px"><option value="">예시 SQL…</option>'+ex.map(function(e,i){ return '<option value="'+i+'">'+esc(e.name)+'</option>'; }).join('')+'</select></div>'+
    '<div class="mini" style="margin-top:6px;line-height:1.6">브라우저 안 메모리 표를 조회합니다(서버 DB 아님) · SELECT/WITH 만 · 월 열은 \'YYYY-MM\' 글자 · 회사명은 <code>_key</code> 열로 연결</div></section>'+
    '<section class="qb-sec">'+qbSchemaHtml()+'</section>';
}
function qbInsertAtCursor(ta, text){
  var s=ta.selectionStart||0, e=ta.selectionEnd||0, v=ta.value;
  var before=v.slice(0,s), after=v.slice(e), sp=(before && !/[\s(,]$/.test(before))? ' ':'';
  ta.value=before+sp+text+after; var pos=before.length+sp.length+text.length; if(/\(\)$/.test(text)) pos-=1; ta.selectionStart=ta.selectionEnd=pos; ta.focus(); QB.sql=ta.value;
}
function qbSqlBind(){
  var p=$('#qbPanel'), ta=$('#qbSqlTa'); if(!p||!ta) return;
  ta.oninput=function(){ QB.sql=ta.value; };
  ta.onkeydown=function(e){ if((e.ctrlKey||e.metaKey) && e.key==='Enter'){ e.preventDefault(); qbSqlRun(); } if(e.key==='Tab'){ e.preventDefault(); qbInsertAtCursor(ta,'  '); } };
  var rb=$('#qbSqlRun'); if(rb) rb.onclick=function(){ QB.sql=ta.value; qbSqlRun(); };
  var fu=$('#qbSqlFromUi'); if(fu) fu.onclick=function(){ QB.sql=qbSpecToSql(QB.spec); ta.value=QB.sql; qbSqlRun(); };
  var ex=$('#qbSqlEx'); if(ex) ex.onchange=function(){ var e=qbSqlExamples()[+ex.value]; if(e){ QB.sql=e.sql; ta.value=e.sql; QB.title=e.name; QB.savedId=null; qbSqlRun(); } ex.value=''; };
  p.querySelectorAll('[data-ins]').forEach(function(el){ el.onclick=function(ev){ ev.preventDefault(); ev.stopPropagation(); qbInsertAtCursor(ta, el.dataset.ins); }; });
}
function qbAutoView(){
  renderReportAuto();
  var h2=$('#rpBody'); if(!h2 || h2.querySelector('#qbBack')) return;
  var back=document.createElement('div'); back.className='pr-top'; back.innerHTML='<button type="button" class="cbtn" id="qbBack">← 데이터 조합으로</button><span class="mini">월간 자동 리포트 (고정 양식)</span>'; h2.insertBefore(back, h2.firstChild);
  $('#qbBack').onclick=function(){ RPV.tab='build'; renderReport(); };
}
function renderReport(){
  var host=$('#rpBody'); if(!host) return;
  if(!DATA||!DATA.rows){ host.innerHTML='<div class="cap" style="padding:40px;text-align:center">데이터를 불러오는 중…</div>'; return; }
  if(RPV.tab==='auto'){ qbAutoView(); return; }
  if(!QB.spec) QB.spec=qbNewSpec('contracts');
  if(host.querySelector('#qbPanel')){ qbPanelRefresh(); qbRunNow(); qbLibRefresh(); qbDeckRefresh(); return; }
  host.innerHTML='<div class="pr-top"><span style="font-size:19px;font-weight:600;letter-spacing:-.01em">리포트</span><span class="mini">포탈 안의 표를 골라 연결(JOIN)·조건·묶기·피벗으로 조합하고 표·차트로 봅니다 — 저장해 두고 엑셀·PPT 로 내보내기</span>'+
    '<button type="button" class="cbtn" id="qbAuto" style="margin-left:auto" title="예전 월간 자동 리포트(고정 양식)">월간 자동 리포트 →</button></div>'+
    '<div id="qbLib"></div>'+
    '<div class="qb-wrap"><aside class="pr-card qb-panel-card"><div id="qbPanel"></div></aside><section class="pr-card qb-res-card"><div id="qbRes"></div></section></div>'+
    '<div class="pr-card" id="qbDeck2" style="margin-top:14px"></div>';
  $('#qbAuto').onclick=function(){ RPV.tab='auto'; renderReport(); };
  qbPanelRefresh(); qbBindPanel(); qbLibRefresh(); qbDeckRefresh(); qbRunNow();
}

function renderReportAuto(){
  var host=$('#rpBody');
  if(!DATA||!DATA.rows||!DATA.rows.length){ host.innerHTML='<div class="cap" style="padding:40px;text-align:center">데이터를 불러오는 중…</div>'; return; }
  if(!RAWX.inbound){ loadInbound(function(){ if(CUR_VIEW==='report'&&!RP._touched) renderReport(); }); }
  rpAnLoad();
  var maxJ=Math.min(DATA.nowIdx>=0? DATA.nowIdx : M-1, M-1);       // 미래(계약상 예정) 월은 리포트 대상에서 제외
  if(RP.j==null||RP.j>maxJ) RP.j=maxJ;                             // 기본 = 최신달(현재월)
  RP._touched=false;
  var d=rpMonthData(RP.j);
  var opts=''; for(var i=maxJ;i>=Math.max(0,maxJ-35);i--) opts+='<option value="'+i+'"'+(i===RP.j?' selected':'')+'>'+mk(i)+'</option>';
  var dif=d.prev? (d.tot/d.prev-1)*100 : 0;
  var inSt='height:34px;border:1px solid var(--ring);border-radius:9px;padding:0 10px;font:inherit;background:var(--surface)';
  function kpi(l,v,s,kx){ return '<div class="pr-ob"><div class="l" contenteditable spellcheck="false">'+l+'</div><div class="v" contenteditable spellcheck="false">'+v+'</div><div class="pr-note" contenteditable spellcheck="false">'+(s||'&nbsp;')+'</div>'+(kx?'<a href="#" class="mini rpkx" data-kx="'+kx+'" contenteditable="false" style="display:inline-block;margin-top:4px;color:var(--s1);text-decoration:none" title="이 숫자의 근거 내역">🔍 내역</a>':'')+'</div>'; }
  function inc(k){ return '<label style="font-size:11px;color:var(--muted);font-weight:400;display:inline-flex;gap:4px;align-items:center;margin-left:auto"><input type="checkbox" data-rpinc="'+k+'" checked> PPT 포함</label>'; }
  function tbl(id,head,rows2,empty){
    var h2='<div style="overflow-x:auto"><table class="pr" id="'+id+'"><thead><tr>'+
      head.map(function(x){ return '<th'+(x[1]?' class="n"':'')+' contenteditable spellcheck="false">'+x[0]+'</th>'; }).join('')+
      '<th class="rpCtl" style="width:30px"></th></tr></thead><tbody>'+
      rows2.map(function(cells){ return '<tr>'+cells.map(function(c){ return '<td'+(c&&c.n?' class="n"':'')+' contenteditable spellcheck="false">'+esc(String((c&&c.t!==undefined)?c.t:c))+'</td>'; }).join('')+
        '<td class="rpCtl"><button data-rpdel title="행 삭제" style="border:none;background:none;cursor:pointer;color:var(--muted)">×</button></td></tr>'; }).join('')+'</tbody></table></div>'+
      '<div style="margin-top:6px;display:flex;gap:8px;align-items:center"><button class="pill" data-rpadd="'+id+'" style="height:24px;padding:0 9px;font-size:11px">＋ 행 추가</button>'+
      (rows2.length?'':'<span class="pr-note">'+empty+' — 필요하면 직접 행을 추가하세요</span>')+'</div>';
    return h2;
  }
  var h='<div class="pr-card" style="margin-bottom:14px"><h3>📑 커스텀 리포트 <span class="ubadge sm">₩ 금액 단위 = 천원</span>'+
    '<small>숫자·표·제목 전부 클릭해서 직접 수정 가능 · 자동 계산값은 시작점일 뿐입니다 · 대상월을 바꾸면 초기화됩니다</small></h3>'+
    '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:8px 0 0">'+
    '대상월 <select id="rpM" style="'+inSt+'">'+opts+'</select>'+
    '제목 <input id="rpTitle" value="서비스사업부 월간 사업 리포트" style="'+inSt+';width:280px">'+
    '표지 라벨 <input id="rpSub" value="'+d.ym+'" style="'+inSt+';width:120px">'+
    '<button class="pill" id="rpPpt" style="height:34px">⬇ PPT 다운로드</button>'+
    '<button class="pill" id="rpNoteAdd" style="height:34px">＋ 메모 슬라이드</button>'+
    '<span class="pr-note" id="rpMsg"></span></div>'+
    '<div style="margin:12px 0 0;padding-top:11px;border-top:1px solid var(--grid)">'+
      '<div class="pr-note" style="margin:0 0 7px">＋ 심화 분석 — 필요한 것만 켜세요 (선택은 이 브라우저에 기억됩니다)</div>'+
      '<div style="display:flex;gap:7px;flex-wrap:wrap">'+
      RP_AN_DEFS.map(function(a){
        var on=!!RP_AN[a[0]];
        return '<button class="pill'+(on?'':' ghost')+'" data-rpan="'+a[0]+'" title="'+esc(a[2])+'" '+
          'style="height:30px;font-size:12px'+(on?';background:var(--brand-t);border-color:var(--brand);color:var(--brand);font-weight:700':'')+'">'+
          (on?'✓ ':'＋ ')+esc(a[1])+'</button>';
      }).join('')+
      '</div></div></div>';
  var rv=rpRevData(RP.j), md=rpMdrData(RP.j);
  h+='<div class="pr-card" style="margin-bottom:14px"><h3>💰 <span contenteditable spellcheck="false" id="rpRevT">'+rv.year+'년 매출 Review</span>'+rpCopyBtn('rpTblRev')+inc('rev')+'</h3>'+
    '<div id="rpRevB" contenteditable spellcheck="false" style="font-size:13px;line-height:1.9;margin:4px 0 10px">'+rv.bullets.map(function(x){return esc(x);}).join('<br>')+'</div>'+
    tbl('rpTblRev', rv.head, rv.rows,'매출 데이터가 없습니다')+
    '<p class="pr-note" style="margin-top:4px">단위: 천원 · 월 숫자는 해당 연도 1월부터 기준월까지 · Q=분기 소계</p></div>';
  h+='<div class="pr-card" style="margin-bottom:14px"><h3>🛡️ <span contenteditable spellcheck="false" id="rpMdrT">MDR 고객 현황</span>'+inc('mdrc')+'</h3>'+
    '<div id="rpMdrB" contenteditable spellcheck="false" style="font-size:13px;line-height:2.0">'+md.lines.map(function(x){return esc(x);}).join('<br>')+'</div></div>';
  h+='<div class="pr-card" style="margin-bottom:14px"><h3><span contenteditable spellcheck="false" id="rpKT">'+d.ym+' 요약</span> <span class="ubadge sm">₩ 천원</span>'+rpCopyBtn('rpK')+inc('sum')+'</h3><div class="pr-out" id="rpK" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">'+
    kpi('월 매출(MRR)',won(d.tot)+'천원', d.prev?('전월 대비 '+pct(dif)):'','rp_mrr')+
    kpi('ARR 환산',won(d.tot*12)+'천원','','rp_mrr')+
    kpi('월 목표 달성률', d.mtg? Math.round(d.tot/d.mtg*100)+'%':'목표 없음', d.mtg?('목표 '+won(d.mtg)+'천원'):'')+
    kpi('연 누계', won(d.ytd)+'천원', d.ytg?('연 목표 '+won(d.ytg)+'천원 의 '+Math.round(d.ytd/d.ytg*100)+'%'):'')+
    kpi('활성 고객사', d.actCnt+'곳','매출 발생 기준','rp_cust')+
    kpi('신규 / 해지', d.newCt.length+'건 / '+d.endCt.length+'건','아래 «신규 계약»·«해지·종료» 표 참조','rp_nc')+
    '</div></div>';
  var tr=''; var mx=Math.max.apply(null,d.trend.map(function(x){return x[1];}).concat([1]));
  d.trend.forEach(function(x){
    tr+='<div style="display:flex;align-items:center;gap:8px;margin:2px 0;font-size:11px"><span style="width:52px;color:var(--muted)">'+x[0]+'</span>'+
      '<div style="flex:1"><div style="height:9px;border-radius:4px;background:'+(x[0]===d.ym?'var(--brand)':'var(--brand-t)')+';width:'+Math.round(x[1]/mx*100)+'%"></div></div>'+
      '<span style="width:98px;text-align:right;color:var(--ink-2)">'+won(x[1])+'</span></div>';
  });
  h+='<div class="pr-card" style="margin-bottom:14px"><h3>최근 12개월 매출 추이 <span class="ubadge sm">₩ 천원</span><small>이 카드만 자동값 고정 (PPT에서는 수정 가능한 차트)</small>'+inc('trend')+'</h3>'+tr+'</div>';
  h+='<div class="pr-card" style="margin-bottom:14px"><h3>🆕 <span contenteditable spellcheck="false">신규 계약</span> <small>'+d.newCt.length+'건</small>'+rpCopyBtn('rpTblNew')+inc('new')+'</h3>'+
    tbl('rpTblNew',[['고객사'],['서비스'],['채널'],['구분'],['수량',1],['월액(천원)',1]],
      d.newCt.map(function(x){ return [x.r.cust, LINE_LABEL[x.r.line]||x.r.line, x.r.channel, x.r.ctype||'-', {t:x.r.qty||'-',n:1}, {t:Math.round(x.v/1000).toLocaleString('ko-KR'),n:1}]; }),'신규 계약이 없습니다')+'</div>';
  h+='<div class="pr-card" style="margin-bottom:14px"><h3>📉 <span contenteditable spellcheck="false">해지·종료</span> <small>'+d.endCt.length+'건</small>'+rpCopyBtn('rpTblEnd')+inc('end')+'</h3>'+
    tbl('rpTblEnd',[['고객사'],['서비스'],['채널'],['사유'],['직전 월액(천원)',1]],
      d.endCt.map(function(x){ return [x.r.cust, LINE_LABEL[x.r.line]||x.r.line, x.r.channel, x.r.churn||x.r.status||'-', {t:Math.round(x.v/1000).toLocaleString('ko-KR'),n:1}]; }),'해지·종료가 없습니다')+'</div>';
  h+='<div class="pr-card" style="margin-bottom:14px"><h3>🛡️ <span contenteditable spellcheck="false">신규 PoC 신청</span> <small>'+d.poc.length+'건</small>'+rpCopyBtn('rpTblPoc')+inc('poc')+'</h3>'+
    tbl('rpTblPoc',[['고객사'],['서비스 유형'],['상태'],['계약예정수량',1],['영업담당']],
      d.poc.map(function(x){ return [x.customer||'-', x.svc_type||'-', x.status||'-', {t:x.plan_qty||'-',n:1}, x.sales_name||'-']; }),'해당 월 PoC 신청이 없습니다')+'</div>';
  var inbBy={}; d.inb.forEach(function(x){ var k=x.result||'미기재'; inbBy[k]=(inbBy[k]||0)+1; });
  var inbNote='접수 '+d.inb.length+'건'+(d.inbWon.length?' · 수주 전환 '+d.inbWon.length+'건'+(function(){var s2=0;d.inbWon.forEach(function(x){s2+=Number(x.amount)||0;});return s2?' · 수주액 합 '+won(s2)+'천원':'';})():'');
  h+='<div class="pr-card" style="margin-bottom:14px"><h3>📨 <span contenteditable spellcheck="false">인바운드</span> <small>'+d.inb.length+'건'+(RAWX.inbound?'':' · 불러오는 중…')+'</small>'+rpCopyBtn('rpTblInb')+inc('inb')+'</h3>'+
    tbl('rpTblInb',[['상태'],['건수',1]], Object.keys(inbBy).sort(function(a,b){return inbBy[b]-inbBy[a];}).map(function(k){ return [k,{t:inbBy[k],n:1}]; }),'해당 월 인바운드가 없습니다')+
    '<p class="pr-note" id="rpInbX" contenteditable spellcheck="false" style="margin-top:6px">'+inbNote+'</p></div>';
  h+='<div class="pr-card" style="margin-bottom:14px"><h3>🎯 <span contenteditable spellcheck="false">OI 파이프라인</span> <span class="ubadge sm">₩ 천원</span><small>현재 시점 스냅샷</small>'+rpCopyBtn('rpK2')+inc('oi')+'</h3><div class="pr-out" id="rpK2" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">'+
    kpi('진행 중 OI', d.oiOpen.length+'건','등록+진행 단계','rp_oi')+
    kpi('예상 금액 합',won(d.oiSum)+'천원','전부 수주 가정 · VAT별도','rp_oi')+
    kpi('기대 수주액',won(d.oiW)+'천원','수주가능성 가중','rp_oi')+
    '</div></div>';
  h+=rpAnHtml(RP.j, inc, tbl);
  h+='<div id="rpNotes"></div>';
  host.innerHTML=h;
  (function(){ var j=RP.j, all=idxs();
    var H={
      rp_mrr:function(){ kxMrr(all, j, mk(j)+' 월 매출(MRR)', '커스텀 리포트 요약'); },
      rp_cust:function(){ kxCustMrr(all, j, mk(j)+' 활성 고객사', '커스텀 리포트 요약 · 매출 발생 기준'); },
      rp_nc:function(){ var el2=document.getElementById('rpTblNew'); if(el2) el2.scrollIntoView({behavior:'smooth',block:'start'}); },
      rp_oi:function(){ kxOi(d.oiOpen, '진행 중 OI '+d.oiOpen.length+'건', '커스텀 리포트 · 현재 시점 스냅샷'); },
      an_cap:function(){ var c=rpAnCap(j); kxSimple('월별 신규 등록 (최근 '+c.n+'개월)', '신규 고객사 = 그 달 시작한 계약의 고객사 수 · 계약 = 시작 계약 건수', ['월',{l:'신규 고객사',n:true},{l:'신규 계약',n:true}], c.series.slice().reverse().map(function(x){ return [x.ym, x.cust, x.ct]; })); },
      an_cust:function(){ kxCustMrr(all, j, mk(j)+' 활성 고객사 · 고객사별 월 매출', '커스텀 리포트 분석'); },
      an_mrr:function(){ kxMrr(all, j, mk(j)+' 월 매출 합', '커스텀 리포트 분석'); },
      an_lost:function(){ var from=Math.max(0,j-11), items=churnRows().filter(function(x){ return x.e>=from && x.e<=j; }); kxChurn(items, mk(from)+'~'+mk(j)+' 이탈 고객사 '+items.length+'건', '커스텀 리포트 · 최근 12개월', false); }
    };
    host.querySelectorAll('a.rpkx').forEach(function(a){ a.onclick=function(ev){ ev.preventDefault(); ev.stopPropagation(); var f=H[a.dataset.kx]; if(f) f(); }; });
    kxWire(host, H);
  })();
  var s=$('#rpM'); if(s) s.onchange=function(){ RP.j=+s.value; renderReport(); };
  var pb=$('#rpPpt'); if(pb) pb.onclick=rpMakePpt;
  var nb=$('#rpNoteAdd'); if(nb) nb.onclick=rpAddNote;
  document.querySelectorAll('[data-rpan]').forEach(function(b){
    b.onclick=function(){
      var k=b.dataset.rpan;
      RP_AN[k]=RP_AN[k]?0:1; rpAnSave(); RP._touched=false; renderReport();
      if(RP_AN[k]) setTimeout(function(){
        var t=document.querySelector('[data-rpinc="'+k+'"]');
        var c=t? t.closest('.pr-card'):null;
        if(c) c.scrollIntoView({behavior:'smooth',block:'center'});
      },60);
    };
  });
  document.querySelectorAll('[data-rpcopy]').forEach(function(b){ b.onclick=function(){ rpCopy(b.dataset.rpcopy, b); }; });
  host.onclick=function(e){
    var del=e.target.closest? e.target.closest('[data-rpdel]') : null;
    if(del){ var tr2=del.closest('tr'); if(tr2) tr2.remove(); RP._touched=true; return; }
    var add=e.target.closest? e.target.closest('[data-rpadd]') : null;
    if(add){
      var tb2=document.getElementById(add.dataset.rpadd); if(!tb2) return;
      var n=tb2.tHead.rows[0].cells.length-1, tr3=tb2.tBodies[0].insertRow(-1);
      for(var c=0;c<n;c++){ var td=tr3.insertCell(-1); td.contentEditable='true'; td.spellcheck=false; if(tb2.tHead.rows[0].cells[c].className.indexOf('n')>=0) td.className='n'; }
      var tc=tr3.insertCell(-1); tc.className='rpCtl'; tc.innerHTML='<button data-rpdel title="행 삭제" style="border:none;background:none;cursor:pointer;color:var(--muted)">×</button>';
      tr3.cells[0].focus(); RP._touched=true;
    }
  };
  host.oninput=function(){ RP._touched=true; };
}
function rpAddNote(){
  var wrap=$('#rpNotes'); if(!wrap) return;
  var blk=document.createElement('div');
  blk.className='pr-card rpNoteBlk'; blk.style.marginBottom='14px';
  blk.innerHTML='<h3>📝 <span class="rpNT" contenteditable spellcheck="false">특이사항·하이라이트</span>'+
    '<button class="pill" data-rpnx style="height:24px;padding:0 9px;font-size:11px;margin-left:auto">× 슬라이드 삭제</button></h3>'+
    '<div class="rpNB" contenteditable spellcheck="false" style="min-height:70px;border:1px dashed var(--ring);border-radius:9px;padding:10px 12px;font-size:13px;line-height:1.8">· 여기에 내용을 입력하세요 (줄마다 불릿 하나)</div>';
  blk.querySelector('[data-rpnx]').onclick=function(){ blk.remove(); };
  wrap.appendChild(blk); RP._touched=true;
  var b=blk.querySelector('.rpNB'); var r=document.createRange(); r.selectNodeContents(b); var sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
}
function rpCopyBtn(id){ return ' <button class="pill" data-rpcopy="'+id+'" style="height:24px;padding:0 9px;font-size:11px">📋 복사</button>'; }
function rpCopy(id, btn){
  var el=document.getElementById(id); if(!el) return;
  var target=el, tmp=null;
  if(el.tagName==='TABLE'){                       // 컨트롤 열(×) 빼고 복사
    tmp=el.cloneNode(true);
    tmp.querySelectorAll('.rpCtl').forEach(function(x){ x.remove(); });
    tmp.querySelectorAll('[contenteditable]').forEach(function(x){ x.removeAttribute('contenteditable'); });
    tmp.style.position='fixed'; tmp.style.left='-9999px'; document.body.appendChild(tmp); target=tmp;
  }
  try{
    var rng=document.createRange(); rng.selectNode(target);
    var sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(rng);
    document.execCommand('copy'); sel.removeAllRanges();
    if(btn){ var o=btn.textContent; btn.textContent='✓ 복사됨'; setTimeout(function(){ btn.textContent=o; },1500); }
  }catch(e){ toast('복사 실패', String(e.message||e)); }
  if(tmp) tmp.remove();
}
function rpTableData(id){
  var t=document.getElementById(id); if(!t) return {head:[],rows:[]};
  var head=[].slice.call(t.tHead.rows[0].cells).filter(function(c){return c.className.indexOf('rpCtl')<0;}).map(function(c){return c.textContent.trim();});
  var rows=[].slice.call(t.tBodies[0].rows).map(function(r){
    return [].slice.call(r.cells).filter(function(c){return c.className.indexOf('rpCtl')<0;}).map(function(c){return c.textContent.trim();});
  }).filter(function(r){ return r.some(function(c){ return c!==''; }); });
  return {head:head, rows:rows};
}
function rpKpiData(id){
  var el=document.getElementById(id); if(!el) return [];
  return [].slice.call(el.querySelectorAll('.pr-ob')).map(function(b){
    var l=b.querySelector('.l'), v=b.querySelector('.v'), n=b.querySelector('.pr-note');
    return [l?l.textContent.trim():'', v?v.textContent.trim():'', n?n.textContent.replace(/ /g,'').trim():''];
  });
}
function rpLoadPptx(){ return loadLib('pptx'); }
var RP_IMG={
 logoW:'data:image/png;base64,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',
 logoG:'data:image/png;base64,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',
 pat:'data:image/png;base64,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'
};
async function rpMakePpt(){
  var m=$('#rpMsg'); m.textContent='PPT 생성 중…';
  try{
    await rpLoadPptx();
    var d=rpMonthData(RP.j);
    // ── QBR 양식 팔레트 (2Q QBR 서비스사업부 PPT 기준) ──
    var NAVY='0E2852', GRN='7EBA25', GRN2='67BF00', TEAL='00B3AC', BAND='EFF8E5',
        THD='C6E0B4', INK='1F2937', MUT='6B7280', BORD='D8DEE4', F='나눔바른고딕';
    var title=($('#rpTitle')&&$('#rpTitle').value)||'서비스사업부 월간 사업 리포트';
    var sub=($('#rpSub')&&$('#rpSub').value)||d.ym;
    function on(k){ var c=document.querySelector('[data-rpinc="'+k+'"]'); return !c||c.checked; }
    var p=new PptxGenJS(); p.layout='LAYOUT_WIDE';
    p.defineSlideMaster({ title:'M', background:{color:'FFFFFF'},
      objects:[
        {rect:{x:0,y:0,w:'100%',h:0.85,fill:{color:BAND}}},
        {rect:{x:0.45,y:0.97,w:12.3,h:0.026,fill:{color:GRN}}},
        {ellipse:{x:12.78,y:0.905,w:0.15,h:0.15,fill:{color:GRN2}}},
        {image:{data:RP_IMG.logoG,x:0.42,y:7.05,w:1.12,h:0.25}}
      ],
      slideNumber:{x:12.85,y:7.05,w:0.4,h:0.3,fontSize:10,color:'9AA0A6',fontFace:F} });
    var secN=0;
    function slTitle(s,t){ secN++; s.addText(secN+'. '+t,{x:0.5,y:0.13,w:11.6,h:0.62,fontSize:20,bold:true,color:NAVY,fontFace:F,valign:'middle'}); }
    /* 금액이 들어간 슬라이드에는 «단위: 천원» 각주를 항상 표시 */
    function uNote(s,y){ s.addText('※ 금액 단위: 천원 (1,000원)',{x:1.75,y:(y==null?7.02:y),w:5.2,h:0.3,fontSize:10,italic:true,color:MUT,fontFace:F}); }
    // ── 표지 (네이비 + 패턴 + CONFIDENTIAL) ──
    var s1=p.addSlide();
    s1.background={color:NAVY};
    s1.addImage({data:RP_IMG.pat,x:8.3,y:0,w:5.03,h:7.5});
    s1.addText('통합 보안 플랫폼 기업, 지니언스.',{x:0.55,y:0.42,w:5,h:0.35,fontSize:11,color:'D9E2F2',fontFace:F});
    s1.addShape('rect',{x:11.5,y:0.38,w:1.62,h:0.44,fill:{color:'FFFFFF'},line:{color:'E60012',width:2}});
    s1.addText('CONFIDENTIAL',{x:11.5,y:0.38,w:1.62,h:0.44,fontSize:11,bold:true,color:'E60012',align:'center',valign:'middle',fontFace:F});
    s1.addText(title,{x:0.6,y:2.55,w:7.6,h:1.0,fontSize:33,bold:true,color:'FFFFFF',fontFace:F});
    s1.addText(sub,{x:0.62,y:3.62,w:6,h:0.55,fontSize:20,bold:true,color:'7EBA25',fontFace:F});
    s1.addText(todayStr().replace(/-/g,'.')+'\n서비스사업부',{x:0.62,y:4.25,w:6,h:0.85,fontSize:14,color:'D9E2F2',fontFace:F,lineSpacing:24});
    s1.addText('※ 본 자료의 모든 금액 단위는 천원(1,000원) 입니다.',{x:0.62,y:5.35,w:7,h:0.32,fontSize:11,color:'A9BCD9',fontFace:F});
    s1.addImage({data:RP_IMG.logoW,x:0.55,y:6.78,w:1.35,h:0.30});
    // ── 매출 Review (QBR 본문 1) ──
    if(on('rev')){
      var sR=p.addSlide({masterName:'M'});
      slTitle(sR, (($('#rpRevT')&&$('#rpRevT').textContent)||'매출 Review').trim());
      var rB=($('#rpRevB')?$('#rpRevB').innerText:'').split('\n').map(function(x){return x.trim();}).filter(Boolean);
      if(rB.length) sR.addText(rB.map(function(x){ return {text:x, options:{bullet:{code:'25B8',color:GRN}, breakLine:true}}; }),
        {x:0.55,y:1.15,w:12.3,h:0.42*rB.length,fontSize:13,bold:true,color:NAVY,fontFace:F,valign:'top',lineSpacing:22});
      var rT=rpTableData('rpTblRev');
      if(rT.rows.length){
        var ry=1.25+0.34*rB.length+0.25;
        var rtx=[rT.head.map(function(x){ return {text:x, options:{bold:true,color:NAVY,fill:{color:THD},fontSize:9,fontFace:F,align:'center'}}; })]
          .concat(rT.rows.map(function(r){
            var last=/합계|소계/.test(r[0]);
            return r.map(function(c,ci){ return {text:String(c), options:{fontSize:8.5,color:INK,fontFace:F,bold:last,align:ci?'right':'left',fill:{color:last?(r[0]==='합계'?'BFBFBF':'E2EFD9'):'FFFFFF'}}}; });
          }));
        sR.addTable(rtx,{x:0.5,y:ry,w:12.3,border:{pt:0.5,color:BORD},autoPage:false,rowH:0.3,colW:[1.55].concat(rT.head.slice(1).map(function(){ return 10.75/(rT.head.length-1); }))});
      }
      uNote(sR);
    }
    // ── MDR 고객 현황 (QBR 본문 2) ──
    if(on('mdrc')){
      var sM=p.addSlide({masterName:'M'});
      slTitle(sM, (($('#rpMdrT')&&$('#rpMdrT').textContent)||'MDR 고객 현황').trim());
      var mB=($('#rpMdrB')?$('#rpMdrB').innerText:'').split('\n').map(function(x){return x.trim();}).filter(Boolean);
      var yy=1.25;
      mB.forEach(function(ln,li){
        var head=li===0, sub=/^-/.test(ln);
        var txt=ln.replace(/^-\s*/,'');
        var lines=Math.ceil(txt.length/95)||1;
        sM.addText(head? [{text:txt, options:{bullet:{code:'27A4',color:GRN}}}] : txt,
          {x:head?0.55:0.8,y:yy,w:12.2,h:0.34*lines+0.12,fontSize:head?15:12,bold:head||sub,color:head?NAVY:INK,fontFace:F,valign:'top',lineSpacing:19});
        yy+=0.34*lines+(head?0.28:0.16);
      });
    }
    // ── 요약 KPI ──
    if(on('sum')){
      var s2=p.addSlide({masterName:'M'});
      slTitle(s2, (($('#rpKT')&&$('#rpKT').textContent)||sub+' 요약').trim());
      rpKpiData('rpK').forEach(function(k,i){
        var x=0.5+(i%3)*4.28, y=1.35+Math.floor(i/3)*2.75;
        s2.addShape('roundRect',{x:x,y:y,w:4.05,h:2.45,fill:{color:'F7FAF2'},line:{color:THD,width:1},rectRadius:0.07});
        s2.addShape('rect',{x:x,y:y,w:0.07,h:2.45,fill:{color:GRN}});
        s2.addText(k[0],{x:x+0.28,y:y+0.28,w:3.5,h:0.4,fontSize:12,color:MUT,fontFace:F});
        s2.addText(k[1],{x:x+0.28,y:y+0.78,w:3.5,h:0.85,fontSize:27,bold:true,color:NAVY,fontFace:F});
        if(k[2]) s2.addText(k[2],{x:x+0.28,y:y+1.72,w:3.5,h:0.4,fontSize:11,color:'4E8A1E',fontFace:F});
      });
      uNote(s2);
    }
    // ── 매출 추이 차트 ──
    if(on('trend')){
      var s3=p.addSlide({masterName:'M'});
      slTitle(s3,'최근 12개월 매출 추이');
      s3.addChart(p.ChartType.bar,[{name:'월 매출(천원)', labels:d.trend.map(function(x){return x[0];}), values:d.trend.map(function(x){return Math.round(x[1]/1000);})}],
        {x:0.5,y:1.35,w:12.3,h:5.3, barDir:'col', chartColors:[GRN], catAxisLabelFontSize:10, valAxisLabelFontSize:10,
         showValue:false, valAxisLabelFormatCode:'#,##0', valGridLine:{color:'E5EAE0',style:'solid',size:0.5},
         catAxisLabelColor:MUT, valAxisLabelColor:MUT, fontFace:F});
      uNote(s3);
    }
    // ── 표 슬라이드 (QBR 표 스타일: 연두 헤더 밴딩) ──
    function tSlide(key, tblId, ttl){
      if(!on(key)) return;
      var td=rpTableData(tblId);
      if(!td.rows.length) return;
      var s=p.addSlide({masterName:'M'});
      slTitle(s, ttl+' — '+td.rows.length+'건');
      var lim=td.rows.slice(0,14);
      var trx=[td.head.map(function(x){ return {text:x, options:{bold:true,color:NAVY,fill:{color:THD},fontSize:11,fontFace:F}}; })]
        .concat(lim.map(function(r,ri){ return r.map(function(c){ return {text:String(c), options:{fontSize:10.5,color:INK,fontFace:F,fill:{color:ri%2? 'F7FAF2':'FFFFFF'}}}; }); }));
      s.addTable(trx,{x:0.5,y:1.3,w:12.3, border:{pt:0.5,color:BORD}, autoPage:false, rowH:0.34});
      if(tblId==='rpTblInb'){ var xn=$('#rpInbX'); if(xn&&xn.textContent.trim()) s.addText('➤ '+xn.textContent.trim(),{x:0.5,y:6.25,w:12,h:0.4,fontSize:12,color:NAVY,bold:true,fontFace:F}); }
      if(td.rows.length>14) s.addText('외 '+(td.rows.length-14)+'건 — 포탈에서 전체 확인',{x:0.5,y:6.65,w:12,h:0.35,fontSize:11,color:MUT,fontFace:F});
      if(td.head.some(function(x){ return /천원|금액|월액/.test(String(x)); })) uNote(s);
    }
    tSlide('new','rpTblNew', sub+' 신규 계약');
    tSlide('end','rpTblEnd', sub+' 해지·종료');
    tSlide('poc','rpTblPoc', sub+' 신규 PoC 신청');
    tSlide('inb','rpTblInb', sub+' 인바운드');
    // ── 심화 분석 (켜둔 것만) ──
    function anTitle(k, dflt){
      var t=document.querySelector('[data-rpinc="'+k+'"]');
      var hd=t? t.closest('h3') : null;
      if(!hd) return dflt;
      var sp=hd.querySelector('[contenteditable]');
      return sp? sp.textContent.trim() : dflt;
    }
    /* 표 여러 장을 한 슬라이드에 세로로 쌓습니다 */
    function anSlide(key, dflt, tbls, note){
      if(!RP_AN[key] || !on(key)) return;
      var sA=p.addSlide({masterName:'M'});
      slTitle(sA, anTitle(key, dflt));
      var y=1.28;
      tbls.forEach(function(spec){
        var td=rpTableData(spec.id);
        if(!td.rows.length) return;
        if(spec.cap){ sA.addText(spec.cap,{x:0.52,y:y,w:12,h:0.26,fontSize:11,bold:true,color:NAVY,fontFace:F}); y+=0.3; }
        var lim=td.rows.slice(0, spec.max||13);
        var trx=[td.head.map(function(x){ return {text:x, options:{bold:true,color:NAVY,fill:{color:THD},fontSize:9.5,fontFace:F,align:'center'}}; })]
          .concat(lim.map(function(r,ri){ return r.map(function(c,ci){
            return {text:String(c), options:{fontSize:9,color:INK,fontFace:F,align:ci?'right':'left',fill:{color:ri%2?'F7FAF2':'FFFFFF'}}}; }); }));
        sA.addTable(trx,{x:0.5,y:y,w:12.3,border:{pt:0.5,color:BORD},autoPage:false,rowH:0.26});
        y += 0.26*(lim.length+1) + 0.26;
      });
      if(note) sA.addText('➤ '+note,{x:0.5,y:Math.min(y+0.05,6.55),w:12.2,h:0.42,fontSize:10.5,color:NAVY,fontFace:F});
      uNote(sA);
    }
    if(RP_AN.cap){
      var cD=rpAnCap(d.j);
      anSlide('cap','신규 등록 처리량',[{id:'rpTblCap',max:13}],
        '월 최대 '+cD.max+'개사('+cD.maxM.join(', ')+') · 최근 12개월 평균 '+(Math.round(cD.avg12*10)/10)+'개사 — 현 조직 처리 상한 판단 근거');
    }
    anSlide('seg','제품별 고객 집단',[{id:'rpTblSeg',max:15}]);
    anSlide('src','주요 유입 경로',[{id:'rpTblSrc',cap:'채널별',max:6},{id:'rpTblSrcP',cap:'파트너·직접별',max:6}]);
    if(RP_AN.arpu){
      var aD=rpAnArpu(d.j);
      anSlide('arpu','고객 월 매출 평균',[{id:'rpTblArpu',cap:'제품별',max:7},{id:'rpTblArpuD',cap:'구간 분포',max:5}],
        '고객사당 월 평균 '+won(aD.avg)+'천원 · 중앙값 '+won(aD.med)+'천원 ('+aD.n+'개사)');
    }
    if(RP_AN.chr){
      var rD=rpAnChurn(d.j);
      anSlide('chr','해지율 12개월 추이',[{id:'rpTblChr',cap:'월별',max:12},{id:'rpTblChrR',cap:'주요 원인',max:5}],
        '12개월 평균 해지율 '+(Math.round(rD.avg*100)/100)+'% · 전반 '+(Math.round(rD.h1*100)/100)+'% → 후반 '+(Math.round(rD.h2*100)/100)+'% (재약정 제외)');
    }
    // ── OI 파이프라인 ──
    if(on('oi')){
      var kk=rpKpiData('rpK2');
      if(kk.length){
        var s7=p.addSlide({masterName:'M'});
        slTitle(s7,'OI 파이프라인 (현재 시점)');
        kk.forEach(function(k,i){
          var x=0.5+(i%3)*4.28, y=1.6;
          s7.addShape('roundRect',{x:x,y:y,w:4.05,h:2.45,fill:{color:'F7FAF2'},line:{color:THD,width:1},rectRadius:0.07});
          s7.addShape('rect',{x:x,y:y,w:0.07,h:2.45,fill:{color:TEAL}});
          s7.addText(k[0],{x:x+0.28,y:y+0.28,w:3.5,h:0.4,fontSize:12,color:MUT,fontFace:F});
          s7.addText(k[1],{x:x+0.28,y:y+0.78,w:3.5,h:0.85,fontSize:27,bold:true,color:NAVY,fontFace:F});
          if(k[2]) s7.addText(k[2],{x:x+0.28,y:y+1.72,w:3.5,h:0.4,fontSize:11,color:'4E8A1E',fontFace:F});
        });
        uNote(s7);
      }
    }
    // ── 메모(자유) 슬라이드 ──
    document.querySelectorAll('.rpNoteBlk').forEach(function(blk){
      var t=blk.querySelector('.rpNT'), b=blk.querySelector('.rpNB');
      var lines=(b?b.innerText:'').split('\n').map(function(x){ return x.replace(/^[·•\-\s]+/,'').trim(); }).filter(Boolean);
      var sN=p.addSlide({masterName:'M'});
      slTitle(sN,(t?t.textContent.trim():'특이사항'));
      if(lines.length) sN.addText(lines.map(function(x){ return {text:x, options:{bullet:{code:'25B8',color:GRN}, breakLine:true}}; }),
        {x:0.7,y:1.5,w:11.9,h:5.2,fontSize:15,color:INK,valign:'top',lineSpacing:30,fontFace:F});
    });
    await p.writeFile({fileName:'서비스사업부_리포트_'+sub.replace(/[\\/:*?"<>|\s]+/g,'_')+'.pptx'});
    m.textContent='✓ PPT 다운로드 완료';
  }catch(e){ m.textContent='PPT 생성 실패: '+String(e.message||e); }
}