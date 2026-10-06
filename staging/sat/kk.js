/* ===== sat/kk.js — kk.html 의 페이지 스크립트 (㊿+154: 인라인 <script> 에서 파일로 · 인라인 onclick → data-click 등 · sat/common.js 가 연결) ===== */
/* ─────────────────────────────────────────────
   접속·DB — 포탈 로그인 세션(svc_sess) 공유. 서비스 키 없음(anon + 사용자 토큰 + RLS).
   ───────────────────────────────────────────── */
function msg(id,t,cls){ var e=$('#'+id); if(!e) return; e.textContent=t||''; e.className='msg'+(cls||''?' '+cls:''); }
var K={ rows:null, biz:null, maps:[], cfg:{}, settles:[], settleId:null, settleErr:'' };

/* SheetJS — 비즈포탈 엑셀 읽기·리스트 내려받기에만 씀 */
function readB64(f){ return new Promise(function(ok,ng){ var r=new FileReader(); r.onload=function(){ ok(String(r.result).split(',')[1]||''); }; r.onerror=function(){ ng(new Error('파일을 읽지 못했습니다')); }; r.readAsDataURL(f); }); }

/* 이름 비교 — 에스원 정산과 같은 방식 */
function norm(s){ s=String(s||'').toLowerCase(); s=s.replace(/\([^)]*\)/g,' ').replace(/주식회사|㈜/g,' ').replace(/[\s_\-\.,·]/g,''); return s; }
/* 고객사 이름 변형 — «경기도 양평군» ↔ «양평군청», «코드아이티(산림과학원)» ↔ «산림과학원» 처럼
   앞의 시·도 이름이나 괄호 안 이름만 맞아도 같은 곳으로 봅니다 */
var ADMIN=/^(서울특별시|서울시|경기도|강원특별자치도|강원도|충청북도|충청남도|전라북도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도|제주도|서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)\s*/;   // 긴 이름부터 (경기도 → 경기 로 잘리지 않게)
function custKeys(c){
  c=String(c||'').trim(); if(!c) return [];
  var out=[c];
  if(ADMIN.test(c)) out.push(c.replace(ADMIN,''));
  var m=c.match(/\(([^)]+)\)/); if(m) out.push(m[1]);
  out.push(c.replace(/\([^)]*\)/g,''));
  return out.map(norm).filter(function(v,i,a){ return v && v.length>=2 && a.indexOf(v)===i; });
}
function custHit(cust, text){
  var t=norm(text); if(!t) return 0;
  var keys=custKeys(cust), best=0;
  keys.forEach(function(k){
    if(k.length>=3 && t.indexOf(k)>=0) best=Math.max(best, .95);
    best=Math.max(best, sim(k,t));
  });
  return best;
}

/* ─────────────────────────────────────────────
   ① 정산 안내 읽기 (PDF → AI · 또는 붙여넣기)
   ───────────────────────────────────────────── */
async function onPdf(f,d){
  try{
    if(f.size>4*1024*1024) throw new Error('4MB 이하 PDF만 가능합니다');
    msg('mK','⏳ AI가 정산 안내를 읽는 중… (10~20초)');
    var j=await aiFetch({mode:'kakao', pdf:await readB64(f)});
    if(!j||!j.ok||!j.kakao) throw new Error((j&&j.error)||'분석 실패');
    applyRows(j.kakao.rows||[], j.kakao.use_month, j.kakao.total);
    markDrop(d,f);
    msg('mK', (K.rows||[]).length+'건을 읽었습니다'+(j.kakao.total? ' · 안내 합계 '+fmt(j.kakao.total)+'원':'')+
        (K.biz? '':' — 비즈포탈 엑셀을 올리면 등록번호까지 맞춰 줍니다'),'ok');
  }catch(e){ msg('mK',e.message,'bad'); }
}
function readPaste(){
  var t=$('#kkPaste').value||'';
  if(!t.trim()){ msg('mK','붙여넣은 내용이 없습니다','bad'); return; }
  var rows=[];
  t.split(/\r?\n/).forEach(function(line){
    var m=line.match(/(SCP[0-9A-Za-z]+)/); if(!m) return;
    var nums=(line.match(/[\d,]{3,}/g)||[]).map(function(x){ return n(x); }).filter(function(x){ return x>=1000; });
    var amt=nums.length? nums[nums.length-1] : 0;
    var unit=nums.length>1? nums[nums.length-2] : amt;
    var proj=line.split(m[1])[1]||'';
    proj=proj.replace(/SSL[^\S\n]*PNS.*$/,'').replace(/\s{2,}/g,' ').trim();
    rows.push({ code:m[1], project:proj, qty:1, unit_price:unit||amt, amount:amt });
  });
  if(!rows.length){ msg('mK','프로젝트 코드(SCP…)가 있는 줄을 찾지 못했습니다','bad'); return; }
  applyRows(rows, null, rows.reduce(function(a,r){ return a+r.amount; },0));
  msg('mK', rows.length+'건을 읽었습니다 (붙여넣기)','ok');
}
/* 읽은 행 → 화면 데이터 (매핑으로 고객사·회차·계약기간 채움) */
function applyRows(rows, useMonth, total){
  var byCode={}; K.maps.forEach(function(m){ byCode[String(m.project_code).trim().toUpperCase()]=m; });
  var unit0=n((K.cfg.basic&&K.cfg.basic.unit_price)||24000);
  K.rows=(rows||[]).map(function(r){
    var code=String(r.code||'').trim().toUpperCase();
    var m=byCode[code]||null;
    return { code:code, project:r.project||'', product:r.product||((K.cfg.basic&&K.cfg.basic.product)||'SSL PNS'),
             qty:n(r.qty)||1, unit:n(r.unit_price)||unit0, amt:n(r.amount)|| (n(r.unit_price)||unit0)*(n(r.qty)||1),
             cust:m? m.customer : '', map:m||null, mapped:!!m,
             start:m&&m.start_date? String(m.start_date).slice(0,10):'', end:m&&m.end_date? String(m.end_date).slice(0,10):'',
             termTotal:(m&&m.term_total)||1, note:(m&&m.note)||'', biz:null, by:null };
  });
  if(useMonth && /^\d{4}-\d{2}$/.test(useMonth)){
    $('#um').value=useMonth;
    var d=new Date(useMonth+'-01T00:00:00'); d.setMonth(d.getMonth()+1);
    $('#ym').value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  K.total=n(total)|| K.rows.reduce(function(a,r){ return a+r.amt; },0);
  calcTerms(); matchBiz(); renderRun();
}
/* 회차 — 이전 달 저장분의 회차 +1 (없으면 1) */
function calcTerms(){
  var ym=$('#ym').value;
  var prev=(K.settles||[]).filter(function(s){ return String(s.month||'').slice(0,7)<ym; })
    .sort(function(a,b){ return String(b.month).localeCompare(String(a.month)); })[0];
  var pm={}; if(prev&&prev.payload&&prev.payload.rows) prev.payload.rows.forEach(function(r){ pm[r.code]=r; });
  (K.rows||[]).forEach(function(r){
    var p=pm[r.code];
    r.termNo = p&&p.termNo? Math.min(p.termNo+1, r.termTotal||1) : 1;
    if((r.termTotal||1)===1) r.termNo=1;
    r.isNew = !p;
  });
}
/* 비즈포탈 등록번호 맞추기 (이번 청구월 카카오 건) */
function matchBiz(){
  var biz=(K.biz||[]).filter(function(b){ return /카카오|kakao/i.test(b.cust+' '+b.proj) || /SSL|VPN|구독/i.test(b.proj); });
  var used={};
  (K.rows||[]).forEach(function(r){
    r.biz=null; r.by=null;
    if(!biz.length) return;
    var scored=biz.filter(function(b){ return !used[b.no]; })
      .map(function(b){ return { b:b, s:Math.max(custHit(r.cust,b.proj), custHit(r.cust,b.cust)) }; })
      .filter(function(x){ return x.s>=.55; }).sort(function(x,y){ return y.s-x.s; });
    if(scored.length){ r.biz=scored[0].b; r.by='name'; used[scored[0].b.no]=1; return; }
    var c2=biz.filter(function(b){ return !used[b.no] && Math.abs(b.acc-r.amt)<1; });
    if(c2.length===1){ r.biz=c2[0]; r.by='amt'; used[c2[0].no]=1; }
  });
  K.bizPool=biz;
}
/* 비즈포탈 엑셀 */
async function onBiz(f,d){
  try{
    msg('mK','⏳ 비즈포탈 엑셀을 읽는 중…'); await loadXlsx();
    var wb=XLSX.read(await readFile(f),{type:'array'});
    var ws=wb.Sheets[wb.SheetNames[0]];
    var aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:null});
    var hi=-1, H=null;
    for(var i=0;i<Math.min(aoa.length,15);i++){
      var line=(aoa[i]||[]).map(function(x){ return String(x==null?'':x).replace(/\s/g,''); });
      if(line.some(function(v){ return v.indexOf('등록번호')>=0; }) && line.some(function(v){ return v.indexOf('고객사')>=0; })){ hi=i; H=line; break; }
    }
    if(hi<0) throw new Error('비즈포탈 엑셀 머리글(등록번호·고객사)을 찾지 못했습니다');
    function col(names){ for(var i=0;i<H.length;i++){ for(var j=0;j<names.length;j++){ if(H[i]&&H[i].indexOf(names[j])>=0) return i; } } return -1; }
    var C={no:col(['등록번호']), proj:col(['프로젝트명']), cust:col(['고객사']), acc:col(['회계매출']), stage:col(['진행상태'])};
    K.biz=[];
    for(var r=hi+1;r<aoa.length;r++){
      var row=aoa[r]||[]; var no=row[C.no]; if(!no) continue;
      K.biz.push({ no:Math.round(n(no)), proj:String(row[C.proj]||''), cust:String(row[C.cust]||''), acc:n(row[C.acc]), stage:String(row[C.stage]||'') });
    }
    markDrop(d,f);
    msg('mK','비즈포탈 '+K.biz.length+'건을 읽었습니다','ok');
    if(K.rows){ matchBiz(); renderRun(); }
  }catch(e){ msg('mK',e.message,'bad'); }
}

/* ─────────────────────────────────────────────
   화면
   ───────────────────────────────────────────── */
function renderRun(){
  if(!K.rows) return;
  var sum=K.rows.reduce(function(a,r){ return a+r.amt; },0);
  var bizSum=K.rows.reduce(function(a,r){ return a+(r.biz? r.biz.acc:0); },0);
  var need=K.rows.filter(function(r){ return !r.mapped; }).length;
  var needBiz=K.rows.filter(function(r){ return !r.biz; }).length;
  $('#kTiles').innerHTML=
    tile('고객사', K.rows.length+'곳')+
    tile('청구 합계', fmt(sum)+'원')+
    tile('안내 합계', fmt(K.total||sum)+'원', Math.abs((K.total||sum)-sum)<1?'ok':'bad')+
    tile('비즈포탈 회계매출', fmt(bizSum)+'원')+
    tile('차액', fmt(sum-bizSum), Math.abs(sum-bizSum)<1?'ok':'bad')+
    tile('고객사 미확인 / 등록번호 미매칭', need+' / '+needBiz, (need+needBiz)?'bad':'ok');
  var nNew=K.rows.filter(function(r){ return r.isNew; }).length;
  if($('#cNew').value==='') $('#cNew').value=nNew;
  if($('#cEnd').value==='') $('#cEnd').value=0;
  $('#kCnt').textContent=K.rows.length+'건 · 이용월 '+($('#um').value||'-')+' · 청구월 '+($('#ym').value||'-');
  var tb=$('#tK tbody'); tb.innerHTML='';
  K.rows.forEach(function(r,i){
    var st=!r.mapped? 'need' : (!r.biz? 'need':'auto');
    var tag=r.mapped? '<span class="tag map">매핑</span>' : '<span class="tag need">고객사 확인</span>';
    if(r.isNew) tag+=' <span class="tag new">신규</span>';
    var cust=r.mapped? esc(r.cust)
      : '<input type="text" value="'+esc(r.cust)+'" placeholder="고객사 입력" style="width:150px" data-change="setCust('+i+',this.value)">';
    var pick='<select class="pick" data-change="pickBiz('+i+',this.value)"><option value="">— 선택 —</option>'+
      (K.bizPool||[]).map(function(b){ return '<option value="'+b.no+'"'+(r.biz&&r.biz.no===b.no?' selected':'')+'>'+esc(b.no+' · '+(b.cust||b.proj).slice(0,22)+' · '+fmt(b.acc))+'</option>'; }).join('')+'</select>';
    var tr=document.createElement('tr'); tr.className='st-'+st+' kkrow';
    tr.innerHTML='<td>'+tag+'</td><td>'+cust+'</td><td class="mini">'+esc(r.code)+'<div class="mini" style="color:#98a2ab">'+esc(String(r.project).slice(0,34))+'</div></td>'+
      '<td class="n">'+r.qty+'</td><td class="n">'+fmt(r.unit)+'</td><td class="n">'+fmt(r.amt)+'</td>'+
      '<td class="mini">'+(r.termNo||1)+'/'+(r.termTotal||1)+'</td>'+
      '<td class="mini">'+esc(r.start||'')+(r.end? ' ~ '+esc(r.end):'')+'</td>'+
      '<td>'+pick+'</td><td class="n">'+(r.biz? fmt(r.biz.acc):'')+'</td>'+
      '<td><input type="text" value="'+esc(r.note||'')+'" placeholder="비고" style="width:140px" data-change="setNote('+i+',this.value)"></td>';
    tb.appendChild(tr);
  });
  $('#kRes').classList.remove('hidden');
}
function setCust(i,v){ K.rows[i].cust=String(v||'').trim(); K.rows[i].mapped=!!K.rows[i].cust; matchBiz(); renderRun(); }
function setNote(i,v){ K.rows[i].note=String(v||'').trim(); }
function pickBiz(i,v){ var no=+v; K.rows[i].biz=no? (K.bizPool||[]).filter(function(b){ return b.no===no; })[0]||null : null; K.rows[i].by=no?'pick':null; renderRun(); }

/* ─────────────────────────────────────────────
   저장·내보내기
   ───────────────────────────────────────────── */
async function saveMaps(){
  var s=sess(); if(!s){ alert('로그인이 필요합니다'); return; }
  var rows=(K.rows||[]).filter(function(r){ return r.code && r.cust; });
  if(!rows.length){ msg('mK2','저장할 매핑이 없습니다','bad'); return; }
  try{
    var have={}; K.maps.forEach(function(m){ have[String(m.project_code).trim().toUpperCase()]=m; });
    var ins=[], upd=0;
    for(var i=0;i<rows.length;i++){
      var r=rows[i], m=have[r.code];
      var body={ project_code:r.code, customer:r.cust, kakao_project:r.project||null,
                 start_date:r.start||null, end_date:r.end||null, term_total:r.termTotal||1, note:r.note||null };
      if(!m) ins.push(Object.assign({created_by:s.u||null, active:true}, body));
      else if(m.customer!==r.cust || (m.kakao_project||'')!==(r.project||'') || (m.term_total||1)!==(r.termTotal||1)){
        await sbWrite('PATCH','kk_map?id=eq.'+m.id, body); upd++;
      }
    }
    if(ins.length) await sbWrite('POST','kk_map',ins);
    K.maps=await sbGet('kk_map?select=*&active=is.true&order=project_code');
    msg('mK2','매핑 저장 완료 — 새로 '+ins.length+'건, 갱신 '+upd+'건 (다음 달부터 자동으로 채워집니다)','ok');
    renderMaps();
  }catch(e){ msg('mK2',e.message,'bad'); }
}
async function saveSettle(){
  var s=sess(); if(!s){ alert('로그인이 필요합니다'); return; }
  var ym=$('#ym').value; if(!ym){ alert('청구월을 고르세요'); return; }
  try{
    var sum=K.rows.reduce(function(a,r){ return a+r.amt; },0);
    var row={ month:ym+'-01', use_month:($('#um').value? $('#um').value+'-01':null),
      total:sum, biz_total:K.rows.reduce(function(a,r){ return a+(r.biz?r.biz.acc:0); },0),
      cnt:K.rows.length, cnt_new:n($('#cNew').value), cnt_end:n($('#cEnd').value),
      payload:{ rows:K.rows.map(function(r){ return { code:r.code, cust:r.cust, project:r.project, qty:r.qty, unit:r.unit, amt:r.amt,
                termNo:r.termNo, termTotal:r.termTotal, start:r.start, end:r.end, note:r.note, biz:r.biz? r.biz.no:null, acc:r.biz? r.biz.acc:null }; }) },
      created_by:s.u||null };
    var have=await sbGet('kk_settle?select=id&month=eq.'+row.month);
    if(have&&have[0]){ delete row.created_by; await sbWrite('PATCH','kk_settle?id=eq.'+have[0].id,row); K.settleId=have[0].id; }
    else{ var r2=await sbWrite('POST','kk_settle?select=id',[row],'return=representation'); K.settleId=r2&&r2[0]?r2[0].id:null; }
    await loadSettles();
    var back=(K.settles||[]).filter(function(v){ return String(v.month||'').slice(0,7)===ym; })[0];
    if(!back) throw new Error('저장은 됐지만 다시 읽히지 않습니다 — 읽기 권한(RLS)이나 72_kakao.sql 적용을 확인해 주세요');
    msg('mK2','정산 저장 완료 ('+ym+' · '+fmt(back.total)+'원) — 「저장 내역」에서 불러오거나 지울 수 있습니다','ok');
  }catch(e){ msg('mK2',e.message,'bad'); }
}
async function delSettle(){
  var ym=$('#ym').value; if(!ym) return;
  try{
    var have=await sbGet('kk_settle?select=id,total&month=eq.'+ym+'-01');
    if(!have||!have[0]){ msg('mK2', ym+' 로 저장된 정산이 없습니다','bad'); return; }
    if(!confirm(ym+' 저장분('+fmt(have[0].total)+'원)을 지울까요?')) return;
    await sbWrite('DELETE','kk_settle?id=eq.'+have[0].id);
    K.settleId=null; await loadSettles(); renderSettles();
    msg('mK2','저장분을 지웠습니다 ('+ym+')','ok');
  }catch(e){ msg('mK2',e.message,'bad'); }
}
async function dlListXlsx(){
  await loadXlsx();
  var ym=$('#ym').value||'', um=$('#um').value||'';
  var M=+ym.slice(5,7), UM=+um.slice(5,7);
  var aoa=[[],['','','','','','신규 :',$('#cNew').value],['','','','','','해약 :',$('#cEnd').value],
    ["'"+ym.slice(2,4)+'.'+M+"월 카카오엔터프라이즈 구독료 리스트('"+um.slice(2,4)+'.'+UM+"월이용분 청구건)"],
    ['Bizpotal \n등록번호','\u00a0서비스제공처(고객사명)','제공서비스(품명)','수량','단가','계약시작일','계약종료일','','']];
  K.rows.forEach(function(r){
    aoa.push([ r.biz? r.biz.no:'', r.cust, r.product, r.qty, r.unit, r.start||'', r.end||'', (r.termNo||1)+'/'+(r.termTotal||1), r.note||'' ]);
  });
  aoa.push([' - 이 하 여 백 -']);
  aoa.push([]); aoa.push([]); aoa.push([]); aoa.push([]);
  aoa.push(['','','','TOTAL', K.rows.reduce(function(a,r){ return a+r.amt; },0)]);
  var wb=XLSX.utils.book_new(), ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:12},{wch:24},{wch:16},{wch:7},{wch:10},{wch:13},{wch:13},{wch:7},{wch:34}];
  XLSX.utils.book_append_sheet(wb,ws,(M||'')+'월_계산서');
  XLSX.writeFile(wb,'카카오_'+ym.slice(2,4)+'년'+M+'월정산'+(UM? UM+'월사용분청구':'')+'_SSL VPN 리스트.xlsx');
}
function copyBizCol(){
  var txt=K.rows.map(function(r){ return r.biz? String(r.biz.no):''; }).join('\n');
  (navigator.clipboard&&navigator.clipboard.writeText? navigator.clipboard.writeText(txt):Promise.reject())
    .then(function(){ msg('mK2','등록번호 '+K.rows.length+'줄을 복사했습니다 — 리스트 엑셀의 첫 데이터 행에 붙여넣으세요','ok'); })
    .catch(function(){ var ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select();
      try{ document.execCommand('copy'); msg('mK2','복사했습니다','ok'); }catch(e){ msg('mK2','복사 실패','bad'); } ta.remove(); });
}
/* 프로젝트 리포트 초안 */
async function makeReport(){
  var s=sess(); if(!s){ alert('로그인이 필요합니다'); return; }
  var ym=$('#ym').value, um=$('#um').value; if(!ym){ alert('청구월을 고르세요'); return; }
  var b=K.cfg.basic||{};
  var M=+ym.slice(5,7), UM=um? +um.slice(5,7) : (M===1?12:M-1);
  var today=todayISO(), day=String(n(b.invoice_day)||15).padStart(2,'0');
  var d=new Date(ym+'-01T00:00:00'); d.setMonth(d.getMonth()+2); d.setDate(0);
  var pay=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  var sum=K.rows.reduce(function(a,r){ return a+r.amt; },0);
  var nos=K.rows.map(function(r){ return r.biz? r.biz.no:null; }).filter(Boolean);
  nos.sort(function(x,y){ return x-y; });
  var noTxt=nos.length? (nos.length>2? nos[0]+', '+nos[1]+'~'+nos[nos.length-1] : nos.join(', ')) : '';
  try{
    var p={ no:noTxt, team1:'서비스사업부', team2:'영업지원팀', team3:'경영지원본부', dept:b.dept||'서비스사업부',
      customer:b.customer||'카카오엔터프라이즈', writer:b.writer||'김민정',
      title:b.title||'카카오클라우드 마켓플레이스 SSL VPN 구독료', date:today, contact:b.contact||'권중혁 매니저',
      cdate:today, amount:String(sum), paydate:pay, payterm:b.pay_term||'익월 말 결제', taxdate:ym+'-'+day,
      warranty:'1개월', saletype:'간접판매', hwcost:'', flow:'고객사 - 카카오엔터프라이즈 - 지니언스',
      remarks:'- 고객사별 구독료/월 형태로 과금 ('+fmt(K.rows[0]? K.rows[0].unit:24000)+'원 * '+K.rows.length+'개사 = '+fmt(sum)+'원 / vat별도)',
      deliv:[{ model:'SSL VPN 구독료', cost:0, qty:1, note:' '+K.rows.length+'개 고객사\n('+UM+'월 이용분)' }],
      buy:[], skip:['a4','a5','b1','b2'], kind:'subs', appr:'bu', coop1:false, coop2:true, month:ym, contract_id:null };
    var row={ contract_id:null, customer:b.customer||'카카오엔터프라이즈', kind:'subs', report_month:ym+'-01',
      report_no:noTxt||null, title:p.title, amount:sum, payload:p, created_by:s.u||null };
    var r=await sbWrite('POST','project_reports?select=id',[row],'return=representation');
    var id=r&&r[0]?r[0].id:null;
    if(!id) throw new Error('리포트를 만들지 못했습니다');
    if(K.settleId){ try{ await sbWrite('PATCH','kk_settle?id=eq.'+K.settleId,{report_id:id}); }catch(e){} }
    msg('mK2','프로젝트 리포트 초안을 만들었습니다 — 리포트 화면에서 NO.·비고를 확인하고 발행하세요','ok');
    if(window.parent!==window) window.parent.postMessage({type:'openReport', id:id},'*');
    else window.open('report.html?id='+id,'_blank');
  }catch(e){ msg('mK2',e.message,'bad'); }
}

/* ─────────────────────────────────────────────
   내부용 출력 — 엑셀 말고 «보기 좋은 한 장»으로 인쇄·PDF 저장
   새 창에 A4 한 장을 그려서 바로 인쇄창을 띄웁니다. (여백은 문서 안쪽에 고정)
   ───────────────────────────────────────────── */
/* 카카오 — SSL VPN 리스트 한 장 출력 */
function printList(){
  if(!K.rows||!K.rows.length){ msg('mK2','먼저 정산 안내를 읽어주세요','bad'); return; }
  var ym=$('#ym').value||'', um=$('#um').value||'';
  var M=+ym.slice(5,7), UM=um? +um.slice(5,7):'';
  var sum=K.rows.reduce(function(a,r){ return a+r.amt; },0);
  var bizSum=K.rows.reduce(function(a,r){ return a+(r.biz? r.biz.acc:0); },0);
  printDoc({
    title:'카카오엔터프라이즈 구독료 리스트 — '+ym.slice(0,4)+'년 '+M+'월 청구',
    sub:(um? um.slice(0,4)+'년 '+UM+'월 이용분 · ':'')+'카카오클라우드 마켓플레이스 SSL VPN · 단위: 원(VAT 별도)',
    summary:[{k:'고객사',v:K.rows.length+'곳'},{k:'청구 합계',v:fmt(sum)+'원'},
             {k:'비즈포탈 회계매출',v:fmt(bizSum)+'원'},
             {k:'차액',v:fmt(sum-bizSum)+'원', ok:Math.abs(sum-bizSum)<1, bad:Math.abs(sum-bizSum)>=1},
             {k:'신규 / 해약',v:($('#cNew').value||0)+' / '+($('#cEnd').value||0)}],
    cols:[{k:'no',l:'Bizportal 등록번호',w:'15%'},{k:'cust',l:'서비스제공처(고객사명)',w:'20%'},{k:'prod',l:'제공서비스'},
          {k:'qty',l:'수량',n:true,w:'7%'},{k:'unit',l:'단가',n:true,w:'10%'},{k:'amt',l:'금액',n:true,w:'11%'},
          {k:'term',l:'회차',w:'7%'},{k:'period',l:'계약기간',mini:true,w:'16%'},{k:'note',l:'비고',mini:true,wrap:true}],
    rows:K.rows.map(function(r){ return { no:r.biz? r.biz.no:'', cust:r.cust, prod:r.product, qty:r.qty,
      unit:fmt(r.unit), amt:fmt(r.amt), term:(r.termNo||1)+'/'+(r.termTotal||1),
      period:(r.start||'')+(r.end? ' ~ '+r.end:''), note:String(r.note||'').replace(/\s*\n\s*/g,' '), __hl:!r.biz }; }),
    foot:[{ cust:'합계', amt:fmt(sum), qty:K.rows.length+'건' }],
    note:'· 연한 노란 줄은 비즈포탈 등록번호가 아직 연결되지 않은 건입니다.\n· 계산서 발행일: 매월 '+((K.cfg.basic&&K.cfg.basic.invoice_day)||15)+'일 · 수금: '+((K.cfg.basic&&K.cfg.basic.pay_term)||'익월 말 결제')
  });
}

/* ── 저장 내역 ── */
async function loadSettles(){
  K.settleErr='';
  try{ K.settles=await sbGet('kk_settle?select=*&order=month.desc'); }
  catch(e){ K.settles=[]; K.settleErr=String(e.message||e);
    msg('mS','저장 내역을 읽지 못했습니다: '+K.settleErr+(/(404|does not exist|relation)/i.test(K.settleErr)? ' — 72_kakao.sql 이 적용되었는지 확인하세요':''),'bad'); }
  saveBadge(); return K.settles;
}
function saveBadge(){
  var n2=$('#setN'); if(n2) n2.textContent=(K.settles||[]).length? '('+K.settles.length+')' : '';
}
async function reloadSettles(btn){
  if(btn){ btn.disabled=true; btn.textContent='읽는 중…'; }
  await loadSettles(); renderSettles();
  if(btn){ btn.disabled=false; btn.textContent='목록 다시 읽기'; }
  if(!K.settleErr) msg('mS','목록을 다시 읽었습니다 ('+(K.settles||[]).length+'건)','ok');
}
function renderSettles(){
  var rows=(K.settles||[]).slice();
  $('#setList').innerHTML=rows.map(function(r){
    var ym=String(r.month||'').slice(0,7), um=String(r.use_month||'').slice(0,7);
    return '<div class="setmon"><span class="ym">'+esc(ym)+' 청구</span><span class="sum">'+(um? um+' 이용분':'')+'</span></div>'+
      '<div class="setrow"><span class="kind u">구독료</span><span class="amt">'+fmt(r.total)+'원</span>'+
      '<span class="diff '+(Math.abs(Number(r.total||0)-Number(r.biz_total||0))<1?'ok':'bad')+'">'+
        (Math.abs(Number(r.total||0)-Number(r.biz_total||0))<1? '대조 일치':'차액 '+fmt(Number(r.total||0)-Number(r.biz_total||0)))+'</span>'+
      '<span class="cnt">고객사 '+(r.cnt||0)+'곳 · 신규 '+(r.cnt_new||0)+' · 해약 '+(r.cnt_end||0)+'</span>'+
      '<span class="who">'+esc(String(r.created_by||'').split('@')[0])+' '+esc(String(r.updated_at||'').slice(5,10))+(r.report_id? ' · 리포트 #'+r.report_id:'')+'</span>'+
      '<span class="acts"><button class="rowbtn" data-click="restoreSettle('+r.id+')">불러오기</button>'+
      '<button class="rowbtn red" data-click="delSettleId('+r.id+')">삭제</button></span></div>';
  }).join('')||'<div class="mini" style="padding:14px 4px;color:#888">'+(K.settleErr? '읽기 실패 — 아래 메시지를 확인하세요':'저장된 정산이 없습니다')+'</div>';
}
function restBar(t){ var b=$('#restBar'); if(!t){ b.classList.add('hidden'); return; } $('#restTxt').innerHTML=t; b.classList.remove('hidden'); }
function clearRestored(){
  K.rows=null; K.biz=null; K.settleId=null;
  $('#kRes').classList.add('hidden'); restBar('');
  msg('mK',''); msg('mK2','');
  $('#cNew').value=''; $('#cEnd').value='';
  ['dK1','dK2'].forEach(function(id){ var d=$('#'+id); if(d){ d.classList.remove('has'); delete d.dataset.done; } });
  $('#fK1').value=''; $('#fK2').value=''; $('#kkPaste').value='';
  var s1=$('#dK1 span'), s2=$('#dK2 span');
  if(s1) s1.textContent="[카카오클라우드] '26년 8월 마켓플레이스 이용료 정산…pdf";
  if(s2) s2.textContent='BIZPORTAL-SALES_…xlsx (선택 — 등록번호 대조용)';
}
async function restoreSettle(id){
  try{
    var rows=await sbGet('kk_settle?select=*&id=eq.'+id);
    var r=rows&&rows[0]; if(!r) throw new Error('없는 기록입니다');
    var p=r.payload||{};
    $('#ym').value=String(r.month||'').slice(0,7);
    $('#um').value=String(r.use_month||'').slice(0,7);
    K.rows=(p.rows||[]).map(function(x){
      return { code:x.code, project:x.project||'', product:(K.cfg.basic&&K.cfg.basic.product)||'SSL PNS', qty:x.qty||1,
               unit:x.unit||0, amt:x.amt||0, cust:x.cust||'', mapped:!!x.cust, start:x.start||'', end:x.end||'',
               termNo:x.termNo||1, termTotal:x.termTotal||1, note:x.note||'',
               biz: x.biz? {no:x.biz, cust:x.cust, acc:Number(x.acc||0), proj:''} : null, by:'map', isNew:false };
    });
    K.bizPool=K.rows.filter(function(x){ return x.biz; }).map(function(x){ return x.biz; });
    K.total=r.total; K.settleId=r.id;
    $('#cNew').value=r.cnt_new||0; $('#cEnd').value=r.cnt_end||0;
    renderRun(); closeOvl('ovlSet');
    restBar('<b>저장된 정산을 보는 중</b> — '+esc(String(r.month||'').slice(0,7))+' 청구 · '+fmt(r.total)+'원 · 새로 만들려면 PDF를 올리거나 오른쪽에서 치우세요');
    msg('mK2','저장된 정산을 불러왔습니다','ok');
  }catch(e){ msg('mS',e.message,'bad'); }
}
async function delSettleId(id){
  if(!confirm('저장된 정산을 지울까요?')) return;
  try{ await sbWrite('DELETE','kk_settle?id=eq.'+id); K.settles=(K.settles||[]).filter(function(x){ return x.id!==id; }); renderSettles(); msg('mS','삭제했습니다','ok'); }
  catch(e){ msg('mS',e.message,'bad'); }
}

/* ── 설정·매핑 ── */
function applyCfg(){
  var b=K.cfg.basic||{};
  $('#cfgUnit').value=b.unit_price||24000; $('#cfgProd').value=b.product||'SSL PNS';
  $('#cfgDay').value=b.invoice_day||15; $('#cfgCust').value=b.customer||'카카오엔터프라이즈';
  $('#cfgContact').value=b.contact||'권중혁 매니저';
}
async function saveCfg(){
  var s=sess(); if(!s){ alert('로그인이 필요합니다'); return; }
  try{
    var b=Object.assign({}, K.cfg.basic||{}, { unit_price:n($('#cfgUnit').value)||24000, product:$('#cfgProd').value||'SSL PNS',
      invoice_day:n($('#cfgDay').value)||15, customer:$('#cfgCust').value||'카카오엔터프라이즈', contact:$('#cfgContact').value||'권중혁 매니저' });
    await sbWrite('POST','kk_config',[{key:'basic', val:b, updated_by:s.u}],'resolution=merge-duplicates');
    K.cfg.basic=b; applyCfg(); msg('mC','설정을 저장했습니다','ok');
  }catch(e){ msg('mC',e.message,'bad'); }
}
function renderMaps(){
  var q=($('#mq').value||'').trim().toLowerCase();
  var list=(K.maps||[]).filter(function(m){ return !q || ((m.project_code||'')+' '+(m.customer||'')+' '+(m.kakao_project||'')).toLowerCase().indexOf(q)>=0; });
  $('#mCnt').textContent=list.length+' / '+(K.maps||[]).length+'건';
  $('#tMap tbody').innerHTML=list.map(function(m){
    return '<tr><td class="mini">'+esc(m.project_code)+'</td>'+
      '<td><input type="text" value="'+esc(m.customer||'')+'" style="width:100%" data-change="editMap('+m.id+',\'customer\',this.value)"></td>'+
      '<td class="mini" title="'+esc(m.kakao_project||'')+'">'+esc(String(m.kakao_project||'').slice(0,40))+'</td>'+
      '<td><input type="date" value="'+esc(String(m.start_date||'').slice(0,10))+'" data-change="editMap('+m.id+',\'start_date\',this.value)"></td>'+
      '<td><input type="date" value="'+esc(String(m.end_date||'').slice(0,10))+'" data-change="editMap('+m.id+',\'end_date\',this.value)"></td>'+
      '<td><input type="number" value="'+(m.term_total||1)+'" style="width:56px" data-change="editMap('+m.id+',\'term_total\',this.value)"></td>'+
      '<td><button class="rowbtn red" data-click="delMap('+m.id+')">삭제</button></td></tr>';
  }).join('')||'<tr><td colspan="7" class="mini">저장된 매핑이 없습니다</td></tr>';
}
async function editMap(id,k,v){
  try{ var o={}; o[k]= k==='term_total'? (n(v)||1) : (v||null);
    await sbWrite('PATCH','kk_map?id=eq.'+id,o);
    var m=(K.maps||[]).filter(function(x){ return x.id===id; })[0]; if(m) m[k]=o[k];
    msg('mC','수정했습니다','ok');
  }catch(e){ msg('mC',e.message,'bad'); }
}
async function delMap(id){
  if(!confirm('이 매핑을 지울까요?')) return;
  try{ await sbWrite('PATCH','kk_map?id=eq.'+id,{active:false}); K.maps=(K.maps||[]).filter(function(m){ return m.id!==id; }); renderMaps(); }
  catch(e){ msg('mC',e.message,'bad'); }
}
/* ── 업로드 연결 ── */
function markDrop(d,f){ d.classList.add('has'); d.dataset.done='1'; var s=d.querySelector('span'); if(s) s.textContent=f.name+' ('+Math.round(f.size/1024)+'KB)'; }
document.querySelectorAll('.tab').forEach(function(b){
  b.addEventListener('click',function(){
    document.querySelectorAll('.tab').forEach(function(x){ x.classList.remove('on'); }); b.classList.add('on');
    $('#vRun').classList.toggle('hidden', b.dataset.t!=='run');
    $('#vCfg').classList.toggle('hidden', b.dataset.t!=='cfg');
    if(b.dataset.t==='cfg') renderMaps();
  });
});
$('#ym').addEventListener('change',function(){
  var ym=this.value;
  if(ym && !$('#um').value){ var d=new Date(ym+'-01T00:00:00'); d.setMonth(d.getMonth()-1);
    $('#um').value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
  if(K.rows){ calcTerms(); renderRun(); }
  var has=(K.settles||[]).filter(function(v){ return String(v.month||'').slice(0,7)===ym; });
  restBar(has.length? '<b>'+esc(ym)+'</b> 청구분이 이미 저장되어 있습니다 — '+fmt(has[0].total)+'원 &nbsp;<span class="lnk" data-click="openSettles()">저장 내역 열기</span>' : '');
});
document.addEventListener('DOMContentLoaded', async function(){
  if(!sess()) return;
  $('#loginOverlay').style.display='none';
  var d=new Date();
  $('#ym').value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  d.setMonth(d.getMonth()-1);
  $('#um').value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  bindDrop('dK1','fK1',onPdf); bindDrop('dK2','fK2',onBiz);
  try{
    var r=await Promise.all([ sbGet('kk_map?select=*&active=is.true&order=project_code'), sbGet('kk_config?select=*') ]);
    K.maps=r[0]; (r[1]||[]).forEach(function(c){ K.cfg[c.key]=c.val; });
  }catch(e){ msg('mK','설정을 읽지 못했습니다: '+e.message,'bad'); }
  applyCfg(); renderMaps(); loadSettles();
});

/* 버튼·입력칸이 부르는 함수 (data-click · data-change · data-input → sat/common.js) — 여기 없는 이름은 실행되지 않음 */
SAT.act({
  clearRestored: clearRestored,
  closeOvl: closeOvl,
  copyBizCol: copyBizCol,
  delMap: delMap,
  delSettle: delSettle,
  delSettleId: delSettleId,
  dlListXlsx: dlListXlsx,
  editMap: editMap,
  goPortalLogin: goPortalLogin,
  makeReport: makeReport,
  openSettles: openSettles,
  pickBiz: pickBiz,
  printList: printList,
  readPaste: readPaste,
  reloadSettles: reloadSettles,
  renderMaps: renderMaps,
  restoreSettle: restoreSettle,
  saveCfg: saveCfg,
  saveMaps: saveMaps,
  saveSettle: saveSettle,
  setCust: setCust,
  setNote: setNote,
  toggleMore: toggleMore
});
