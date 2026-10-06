/* ===== price.js — 제품 가격표 · 견적·TCO 비교 (리포트·관리자와 함께 «처음 열 때 불러오기» · js/lazy.js) =====
   ES 모듈(㊿+153) — 다른 파일의 이름은 아래 import 로만 씀 · 이 파일의 최상위 var/function 은 전부 export · 즉시 실행 문장은 js/init.js 의 start() 에 */
import { ST } from './state.js';
import { Viz } from './viz.js';
import { $, cssv } from './core.js';
import { sbTry, sbWrite, toast, todayStr } from './shell.js';
import { esc } from './dash.js';
import { aiFetch } from './ai.js';
import { PR } from './tools.js';
import { closeOvl, openOvl } from './edit.js';

export function loadPrice(cb){
  if(loadPrice._q){ loadPrice._q.push(cb); return; }   // 중복 호출 방지 — 한 번만 불러옴
  loadPrice._q=[cb];
  sbTry('price_books?select=id,seg,label,applied,data,note&order=applied.desc,id.desc').then(function(rows){
    ST.RAWX.price=rows||[];
    var q=loadPrice._q; loadPrice._q=null;
    q.forEach(function(f){ if(f) try{ f(); }catch(e){} });
  });
}
export function prBooks(seg){ return (ST.RAWX.price||[]).filter(function(b){return b.seg===seg;}); }
export function prCur(seg){ return prBooks(seg)[PR.ver[seg]||0]||null; }
export function prWon(v){ return typeof v==='number'? v.toLocaleString('ko-KR'):(v||'—'); }
export function prMatch(t){ return !PR.q || String(t).toLowerCase().indexOf(PR.q)>=0; }
export var PR_NAC_LIM=[100,200,300,400,500,600,700,800,900,1000,1500,2000,2500,3000];
export function prNacTier(n){ for(var i=0;i<PR_NAC_LIM.length;i++) if(n<=PR_NAC_LIM[i]) return i; return -1; }
export function prTierIdx(q){ var lim=[49,99,299,499,999,2999,4999,9999,1e9]; for(var i=0;i<lim.length;i++) if(q<=lim[i]) return i; return 8; }

/* 새 판 등록 창(#ovlPrNew) 저장 버튼 — 처음 그릴 때 한 번 연결 (㊿+153: init.js 의 DOMContentLoaded 에서 옮김) */
export function prBindNew(){
  var b=document.getElementById('pnSave');
  if(!b || b.__bound) return; b.__bound=1;
  b.onclick=async function(){
    var seg=$('#pnSeg').value, lab=$('#pnLabel').value.trim(), dt=$('#pnDate').value, js=$('#pnJson').value.trim();
    var m=$('#pnMsg');
    if(!lab||!dt||!js){ m.textContent='판 이름·적용일·JSON은 필수입니다'; m.style.color='var(--critical)'; return; }
    var data; try{ data=JSON.parse(js); }catch(e){ m.textContent='JSON 형식 오류: '+e.message; m.style.color='var(--critical)'; return; }
    try{
      await sbWrite('POST','price_books',{seg:seg,label:lab,applied:dt,data:data});
      closeOvl('ovlPrNew'); toast('가격표 새 판 등록', lab);
      ST.RAWX.price=null; PR.ver={saas:0,onprem:0};
      if(ST.CUR_VIEW==='price') renderPrice();
    }catch(e){ m.textContent=String(e.message||e); m.style.color='var(--critical)'; }
  };
}
export function renderPrice(){
  prBindNew();
  var host=$('#prBody');
  if(!ST.RAWX.price){
    host.innerHTML='<div class="cap" style="padding:40px;text-align:center">가격표를 불러오는 중…</div>';
    loadPrice(function(){ if(ST.CUR_VIEW==='price') renderPrice(); });
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
  var verSel='<select id="prVer" aria-label="가격표 판" class="pill" style="height:31px;font-family:inherit">'+
    vers.map(function(b,i){ return '<option value="'+i+'"'+(i===(PR.ver[segBook]||0)?' selected':'')+'>'+esc(b.label)+(i===0?' (현행)':' (이력)')+'</option>'; }).join('')+'</select>';
  var TABS=[['saas','SaaS 가격표'],['onprem','On-prem 가격표'],['calc','견적 · 비교']];
  var head='<div class="pr-top">'+
    '<span style="font-size:18px;font-weight:600;letter-spacing:-.01em">가격표</span>'+
    '<div class="eqb-seg" role="tablist" aria-label="가격표 구분">'+TABS.map(function(t){ return '<button type="button" role="tab" data-prseg="'+t[0]+'" aria-pressed="'+(PR.seg===t[0])+'">'+t[1]+'</button>'; }).join('')+'</div>'+
    '<span class="ubadge sm won">₩ 원 단위</span>'+
    '<span style="flex:1"></span>'+
    (isCalc? '<span class="pr-ver">SaaS 판 '+esc(book.label||'')+' · 적용일 '+esc(String(book.applied||''))+'</span>'
           : '<input id="prQ" class="pill" style="height:33px;min-width:200px" placeholder="제품·모델명 검색" value="'+esc(PR.q)+'">'+verSel+'<span class="pr-ver">적용일 '+esc(String(book.applied||''))+'</span>')+
    (ST.IS_SUPER && !isCalc? '<button class="pill ghost" id="prNew">＋ 새 판 등록</button>':'')+
    '</div>';
  host.innerHTML=head+'<div id="prMain"></div>';
  var vs=$('#prVer'); if(vs) vs.onchange=function(){ PR.ver[segBook]=+this.value; renderPrice(); };
  host.querySelectorAll('[data-prseg]').forEach(function(b){ b.onclick=function(){ PR.seg=b.dataset.prseg; renderPrice(); }; });
  var q=$('#prQ'); if(q) q.oninput=function(){ PR.q=this.value.trim().toLowerCase(); prPaintMain(); };
  var bn=document.getElementById('prNew');
  if(bn) bn.onclick=function(){ $('#pnMsg').textContent=''; if(!$('#pnDate').value) $('#pnDate').value=todayStr(); openOvl('ovlPrNew'); };
  prPaintMain();
}
export function prPaintMain(){
  var main=$('#prMain'); if(!main) return;
  if(PR.seg==='calc'){ main.innerHTML=prCalcHtml(); prBindSaas(); return; }
  main.innerHTML = PR.seg==='saas'? prSaasHtml() : prOnpremHtml();
  if(PR.seg==='saas'){ document.querySelectorAll('[data-prbasis]').forEach(function(b){ b.onclick=function(){ PR.basis=b.dataset.prbasis; prPaintMain(); }; }); }
  else prBindOnprem();
}
export function prSaasHtml(){
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
export function prCalcHtml(){
  var D=prCur('saas').data, h='';
  var inSt='height:34px;border:1px solid var(--ring);border-radius:9px;padding:0 10px;font:inherit;background:var(--surface)';
  var yOpt=''; for(var yk=1;yk<=10;yk++) yOpt+='<option value="'+yk+'"'+(yk===5?' selected':'')+'>'+yk+'년</option>';
  /* ① 빠른 견적 — 두 카드 나란히 */
  h+='<div class="pr-sec"><div class="pr-sech"><span class="no">1</span><b>빠른 견적</b><span class="mini">단가표 그대로 계산 · 할인은 별도 협의 · 실제 견적은 견적·발주 시스템에서</span></div>'+
    '<div class="pr-two">'+
    '<div class="pr-card"><h3>Cloud NAC <small>기본 구독 · ZTNA 사용 시 PA Agent 추가</small></h3>'+
      '<div class="row">노드 <input type="number" id="pnQty" value="300" min="1" style="width:90px">'+
      '<select id="pnTerm" aria-label="약정 기간"><option value="0">무약정</option><option value="1" selected>1년 약정</option><option value="2">2년</option><option value="3">3년</option></select>'+
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
      '<select id="pmWho" aria-label="견적 대상"><option value="dist">총판가 기준</option><option value="ptn">파트너가 기준</option></select></div>'+
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
      '<span class="pr-f"><span class="l">검토 기간</span><select id="ptY" aria-label="검토 기간" style="'+inSt+'">'+yOpt+'</select></span>'+
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
      '<button class="pill pri" id="ptQGo" style="height:32px">AI 분석 → 비교</button>'+
      '<span class="pr-note">4MB 이하 PDF · 10~20초</span></div>'+
      '<div id="ptQR" style="margin-top:12px"></div></div></div>';
  return h;
}

/* ===== SaaS vs 구축형 비교 표 + 누적 비용 선 그래프 (TCO 계산기 · PDF 견적 비교 공용)
   m = {y, n, saasMon, intro, mL, mH, saasLabel, onLabel, onSub, saasSub, cols:['SaaS 라벨','구축형 라벨'], best:{k,target,needDisc}|null}
   · 판정을 글자로 외치지 않고, 같은 행에 두 값을 나란히 두고 싼 쪽에 ✓ · 차이 열 · 손익분기 시점을 보여줍니다 */
export function prCmpRender(host, m){
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
export function prOnpremHtml(){
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
export function prBindOnprem(){
  document.querySelectorAll('[data-prop]').forEach(function(b){
    b.onclick=function(){ PR.op=b.dataset.prop; prPaintMain(); };
  });
}
/* 구축형 표에서 «기준 노드 ≥ n» 인 가장 작은 티어 선택 (초과 시 최대 티어 + over 표시) */
export function prPickTier(rows, n){
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
export function prOnpremBuild(key, n){
  var ob=prCur('onprem'); if(!ob||!ob.data[key]) return null;
  var tbs=ob.data[key].tables;
  var lic=prPickTier(tbs[0]&&tbs[0].rows, n);
  var pc =prPickTier(tbs[1]&&tbs[1].rows, n);
  if(!lic) return null;
  return {lic:lic, pc:pc, cons:lic.price+(pc?pc.price:0), over:(lic.over||(pc&&pc.over))};
}
export function prBindSaas(){
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
    var sSt='height:28px;border:1px solid var(--ring);border-radius:8px;padding:0 6px;font:inherit;font-size:12px;background:var(--surface)';
    $('#ptSsL').innerHTML=PR.tcoSS.map(function(r,i){
      return '<span style="display:inline-flex;gap:4px;align-items:center">'+
        '<select aria-label="구독형 단가" data-ssp="'+i+'" style="'+sSt+'">'+SEN_P.map(function(pv2){ return '<option value="'+pv2+'"'+(r.p===pv2?' selected':'')+'>'+(pv2/10000)+'만원</option>'; }).join('')+'</select>'+
        '<input type="number" data-ssq="'+i+'" value="'+(+r.q||0)+'" min="0" style="'+sSt+';width:52px">대'+
        (PR.tcoSS.length>1?'<button data-ssx="'+i+'" class="pill" style="height:24px;padding:0 7px">×</button>':'')+'</span>';
    }).join('');
    var rows=tcoSenRowsO();
    var names=rows.map(function(x){ return String(x[1]); });
    if(!PR.tcoOS||!PR.tcoOS.length||PR.tcoOS.some(function(r){ return names.indexOf(r.m)<0; })) PR.tcoOS=[tcoOsDefault()];
    $('#ptOsL').innerHTML=PR.tcoOS.map(function(r,i){
      return '<span style="display:inline-flex;gap:4px;align-items:center">'+
        '<select aria-label="구축형 유지보수 비율" data-osm="'+i+'" style="'+sSt+'">'+rows.map(function(x){ return '<option value="'+esc(String(x[1]))+'"'+(String(x[1])===r.m?' selected':'')+'>'+esc(String(x[1]))+' · '+esc(String(x[0]))+' · '+prWon(x[2])+'원</option>'; }).join('')+'</select>'+
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
    if(!ST.TCOQ){ m.innerHTML=''; return; }
    var q=ST.TCOQ, y=(LASTT&&LASTT.y)||(+$('#ptY').value||1);
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
    if(x) x.onclick=function(){ ST.TCOQ=null; var f=document.getElementById('ptQF'); if(f) f.value=''; renderQuoteCmp(); };
  }
  function applyQuote(){
    var q=ST.TCOQ; if(!q) return;
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
      ST.TCOQ=j.quote; ST.TCOQ._file=f.name; ST.TCOQ._model=j.model||'';
      applyQuote();
      toast('견적서 분석 완료', (ST.TCOQ.customer||'')+' → TCO 계산기에 적용');
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
