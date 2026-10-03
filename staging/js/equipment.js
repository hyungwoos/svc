/* ===== equipment.js — 임대 장비: 신청 ↔ 현황 대조 · 원복 · 대조 패널 · 비즈포탈 월 입력 =====
   포탈 본체(js/app.js)를 ④ 아키텍처 2단계(㊿+136)에서 기능별로 나눈 파일. 전역 var/function 그대로 — 즉시 실행 문장은 전부 js/init.js 에.
   로드 순서는 index.html <meta name="app-js"> (js/load.js 가 그 순서대로 ?v=APP_VER 를 붙여 불러옴) */


/* ===== 임대 장비: 신청 내역 ↔ 장비 현황 자동 대조 ==============================
   기준(원본)은 «임대 장비 신청 내역» 입니다.  현황은 신청 내역을 따라갑니다.
     · 신청 1건 = 현황 «수량»대  (취소만 빼고 전부 현황에 행이 생깁니다)
     · 접수·출하요청·배송중 → 재고   (아직 안 나갔지만 현황에는 있어야 합니다)
     · 설치완료·회수예정   → 임대중
     · 회수완료           → 회수완료
     · 취소               → 현황에서 내림 (임시행 삭제 · 실물은 재고로)
     · 현황의 상태·고객사·모델·채널 은 신청 내역 값으로 덮어씁니다 (회수완료도 고객사를 남깁니다)
     · 같은 시리얼이 여러 신청에 있으면(장비 이전) 가장 최근 신청이 주인, 이전 신청은 «이전됨»
   시리얼을 아직 모르면 «미등록-신청번호-번호» 로 수량만큼 임시 등록해 두고,
   나중에 신청 행의 «시리얼» 칸에 실제 시리얼을 넣고 저장하면 임시 행이 사라지고
   진짜 시리얼로 바뀝니다.
   일괄 작업(맞추기·재고 되돌리기)은 실행 직전 현황 전체를 찍어두므로 «원복» 이 됩니다.
   ---------------------------------------------------------------------------- */
var EQ_ST={ '접수':'재고', '출하요청':'재고', '배송중':'재고',        /* 아직 안 나갔어도 현황에 행은 만듭니다 */
            '설치완료':'임대중', '회수예정':'임대중', '회수완료':'회수완료' };   /* «취소» 만 현황에 두지 않습니다 */
var EQ_COLS=['serial','model','usage','status','customer','channel','partner','in_date','deployed_date','returned_date','note','order_id'];
function eqSerials(r){
  return String(r.serials||'').split(/[,\s]+/)
    .map(function(s){ return s.trim().toUpperCase(); }).filter(function(s){ return s; });
}
function eqIsPh(s){ return /^미등록-/.test(String(s||'')); }
/* 같은 시리얼이 여러 신청에 들어 있으면(장비 이전 · 재임대) 가장 최근 신청이 그 시리얼의 주인입니다.
   예) #171 크린에이스 S7DE23435FB (2024) → #242 에이티이엔지 S7DE23435FB (2025) : #242 가 주인, #171 은 «이전됨» */
function eqNewer(a,b){
  var x=String(a.created_at||''), y=String(b.created_at||'');
  if(x!==y) return x>y;
  return (+a.id||0)>(+b.id||0);
}
function eqOwnerMap(){
  var own={};
  (RAWX.orders||[]).forEach(function(o){
    if(!EQ_ST[o.status]) return;                          // 취소된 신청은 주인이 못 됩니다
    eqSerials(o).forEach(function(sn){ if(!own[sn] || eqNewer(o,own[sn])) own[sn]=o; });
  });
  return own;
}
function eqMine(sn, r, own){            // 이 시리얼의 주인이 r 인가 (다른 신청에 없으면 r 것)
  var o=own[String(sn||'').toUpperCase()];
  return !o || String(o.id)===String(r.id);
}
function eqWant(r, own){                // 이 신청이 현황에 갖고 있어야 할 시리얼 목록
  if(!EQ_ST[r.status]) return [];
  own=own||eqOwnerMap();
  var ser=eqSerials(r);
  if(ser.length) return ser.filter(function(sn){ return eqMine(sn,r,own); });   // 더 최근 신청으로 넘어간 시리얼은 뺍니다
  var q=Math.max(1, +r.qty||1), out=[];
  for(var i=1;i<=q;i++) out.push('미등록-'+r.id+'-'+i);
  return out;
}
function eqMoved(r, own){               // 시리얼이 전부 더 최근 신청으로 넘어간 신청인가 («이전됨»)
  if(!EQ_ST[r.status]) return false;
  var ser=eqSerials(r); if(!ser.length) return false;
  own=own||eqOwnerMap();
  return !ser.some(function(sn){ return eqMine(sn,r,own); });
}
function eqHave(r, own){                // 현황에서 이 신청에 붙어 있는 행 (다른 신청이 주인인 시리얼은 뺍니다)
  own=own||eqOwnerMap();
  return (RAWX.assets||[]).filter(function(a){
    return a.order_id!=null && String(a.order_id)===String(r.id) && (eqIsPh(a.serial) || eqMine(a.serial,r,own)); });
}
function eqIn(list){                   // PostgREST in.("A","B") — 한글·하이픈 안전하게
  return 'in.('+list.map(function(s){ return encodeURIComponent('"'+String(s).replace(/"/g,'')+'"'); }).join(',')+')';
}
async function eqPatch(list, body){    // 시리얼이 많아도 URL 이 길어지지 않게 80개씩
  for(var i=0;i<list.length;i+=80) await sbWrite('PATCH','equipment_assets?serial='+eqIn(list.slice(i,i+80)), body);
  var up={}; list.forEach(function(x){ up[String(x).toUpperCase()]=1; });
  (RAWX.assets||[]).forEach(function(a){ if(up[String(a.serial||'').toUpperCase()]) Object.keys(body).forEach(function(k){ a[k]=body[k]; }); });
}
async function eqDel(list){
  for(var i=0;i<list.length;i+=80) await sbWrite('DELETE','equipment_assets?serial='+eqIn(list.slice(i,i+80)));
  var dl={}; list.forEach(function(x){ dl[String(x).toUpperCase()]=1; });
  RAWX.assets=(RAWX.assets||[]).filter(function(a){ return !dl[String(a.serial||'').toUpperCase()]; });
}
async function eqReload(){ try{ RAWX.assets=await sbTry('equipment_assets?select=*&order=serial')||RAWX.assets; }catch(e){} }
/* 시리얼 묶음 표시 — 한 칸에 수십 개가 늘어지지 않게: 첫 시리얼 + «외 N대 ▾», 누르면 전부 펼침. 회수된 시리얼은 줄을 긋습니다 */
/* 시리얼 칩 — 신청 내역에서 칩을 눌러 회수/회수취소를 표시하고, 칸 안의 «저장» 으로 반영합니다 (일부·일괄 모두)
   EQOPEN[신청id]=펼침 상태 · EQP[신청id][시리얼]=원하는 회수 상태(true/false, 아직 저장 안 됨) */
var EQOPEN={}, EQP={};
function eqCanRet(r){ return !window.IS_VIEWER && ['설치완료','회수예정','회수완료'].indexOf(r.status)>=0; }
function eqSerialsHtml(r, opt){
  opt=opt||{};
  var all=eqWant(r); if(!all.length) return r.serials? esc(String(r.serials)) : '·';
  var ret=eqRetSet(r), done=(r.status==='회수완료'), can=eqCanRet(r), pend=EQP[r.id]||{}, oid=r.id;
  var chip=function(sn){
    var U=sn.toUpperCase(), saved=done||ret.indexOf(U)>=0, want=(U in pend)? pend[U] : saved, changed=(U in pend) && pend[U]!==saved;
    var cls='eqsn'+(want?' ret':'')+(changed?' chg':'')+(can?' act':'');
    var tip=can? (want? '회수됨 — 누르면 회수 취소로 표시' : '임대중 — 누르면 회수로 표시') : (want? '회수됨':'');
    return '<span class="'+cls+'" data-oid="'+oid+'" data-sn="'+esc(U)+'" title="'+tip+'">'+esc(sn)+'</span>';
  };
  var nChg=Object.keys(pend).filter(function(U){ var saved=done||ret.indexOf(U)>=0; return pend[U]!==saved; }).length;
  /* 회수 처리 막대: 기본은 항상, bar:'auto' 면 «변경이 있을 때» 또는 «회수예정 카드» 에만 (보드에서 안내 문구 반복을 없앰) */
  var showBar = can && (opt.bar!=='auto' || nChg>0 || r.status==='회수예정');
  var bar='';
  if(showBar){
    bar='<div class="eqbar" data-oid="'+oid+'">'+
      (nChg? '<b>변경 '+nChg+'대</b> · 회수일 <input type="date" class="eqbar-date" value="'+esc(EQP['_d'+oid]||todayStr())+'"> <button type="button" class="eqbar-save">회수 처리 저장</button> <button type="button" class="eqbar-cancel">취소</button>'
           : '<button type="button" class="eqbar-all" title="모든 시리얼을 회수로 표시 — 칩을 누르면 개별 표시">전부 회수 표시</button>'+(opt.bar==='auto'? '' : ' <span class="mini" style="color:var(--muted)">칩을 누르면 개별 표시</span>'))+'</div>';
  }
  var k = opt.max? Math.min(opt.max, all.length) : 1;                 /* 펼쳐 보이는 칩 수 */
  if(all.length===1) return chip(all[0])+bar;
  if(all.length<=k || (opt.full && !opt.max && all.length<=8)) return '<span class="eqser">'+all.map(chip).join(' ')+bar+'</span>';
  var open=!!EQOPEN[oid] || nChg>0;
  return '<span class="eqser">'+all.slice(0,k).map(chip).join(' ')+' <button type="button" class="eqser-more" data-oid="'+oid+'" data-n="'+(all.length-k)+'" title="'+esc(all.join(', '))+'">'+(open? '접기 ▴' : '+'+(all.length-k)+' ▾')+'</button>'+
         '<span class="eqser-full" style="display:'+(open?'block':'none')+'">'+all.slice(k).map(chip).join(' ')+bar+'</span></span>';
}
function eqOrderById(id){ return (RAWX.orders||[]).filter(function(o){ return String(o.id)===String(id); })[0]; }


/* 일부 회수: 신청의 returned_serials(회수된 시리얼 목록) */
function eqRetSet(r){ return String(r.returned_serials||'').split(/[,\s]+/).map(function(s){ return s.trim().toUpperCase(); }).filter(function(s){ return s; }); }
/* 시리얼 하나가 현황에서 가져야 할 상태 — 신청이 임대중이어도 회수된 시리얼은 회수완료 */
function eqSerialStatus(o, sn){
  var stA=EQ_ST[o.status]||null;
  if(stA==='임대중' && eqRetSet(o).indexOf(String(sn||'').toUpperCase())>=0) return '회수완료';
  return stA;
}
var EQR={r:null};
function eqRetOpen(r){
  if(!SB_TOKEN){ openOvl('ovlAuth'); return; }
  EQR.r=r;
  var all=eqWant(r), ret=eqRetSet(r), amap={};       /* 시리얼이 없으면 «미등록-신청번호-n» 임시 시리얼로 처리 */
  (RAWX.assets||[]).forEach(function(a){ amap[String(a.serial||'').toUpperCase()]=a; });
  $('#erTitle').textContent='#'+r.id+' '+(r.customer||'')+' · '+(r.model||'')+' × '+(r.qty||all.length)+' · 현재 '+(r.status||'')+(r.returned_date? ' · 회수일 '+String(r.returned_date).slice(0,10):'');
  $('#erDate').value=todayStr(); $('#erNote').value=''; $('#erMsg').textContent='';
  $('#erList').innerHTML=all.map(function(sn){
    var a=amap[sn], done=(r.status==='회수완료') || ret.indexOf(sn)>=0 || (a && a.status==='회수완료' && String(a.order_id)===String(r.id));
    var sub=a? (a.status+(a.returned_date? ' · '+String(a.returned_date).slice(0,10):'')) : '현황에 없음';
    return '<label style="display:flex;gap:8px;align-items:center;font-size:12.5px;cursor:pointer"><input type="checkbox" data-sn="'+esc(sn)+'"'+(done?' checked':'')+'> <b style="font-family:monospace">'+esc(sn)+'</b> <span class="mini" style="color:var(--muted)">'+esc(sub)+'</span></label>';
  }).join('');
  $('#erAll').onclick=function(){ document.querySelectorAll('#erList input').forEach(function(x){ x.checked=true; }); };
  $('#erNone').onclick=function(){ document.querySelectorAll('#erList input').forEach(function(x){ x.checked=false; }); };
  $('#erSave').onclick=eqRetSave;
  openOvl('ovlEqRet');
}
/* 회수 처리 반영 — checked = 최종적으로 «회수됨» 이어야 하는 시리얼 목록 (일부·전부 모두) */
async function eqRetApply(r, checked, date, note){
  var all=eqWant(r);
  var prev=eqRetSet(r); if(r.status==='회수완료') prev=all.map(function(x){ return x.toUpperCase(); });
  checked=checked.map(function(x){ return String(x).toUpperCase(); });
  var newly=checked.filter(function(sn){ return prev.indexOf(sn)<0; });
  var body={};
  if(checked.length>=all.length && all.length){              /* 전부 회수 → 신청 회수완료 */
    body.returned_serials=checked.join(', '); body.status='회수완료'; body.returned_date=r.returned_date||date;
  } else {                                                    /* 일부(또는 0대) 회수 → 신청은 계속 진행 중 */
    body.returned_serials=checked.length? checked.join(', ') : null;
    if(r.status==='회수완료'){ body.status='설치완료'; body.returned_date=null; }
  }
  if(note) body.request_note=(r.request_note? r.request_note+' · ':'')+'['+date+' 회수 '+checked.length+'/'+all.length+'] '+note;
  await sbWrite('PATCH','equipment_orders?id=eq.'+r.id, body);
  Object.keys(body).forEach(function(k){ r[k]=body[k]; });
  logChange('update','equipment_orders',r.id,{returned_serials:body.returned_serials, status:body.status||r.status, from:'회수 처리'});
  r._retDates={}; newly.forEach(function(sn){ r._retDates[sn]=date; });
  var x=await syncOrderAssets(r); delete r._retDates;
  toast('회수 처리', checked.length+'/'+all.length+'대 회수'+(body.status==='회수완료'? ' · 신청 회수완료':'')+(x? x:''), 'info');
  return body;
}
async function eqRetSave(){
  var r=EQR.r; if(!r) return;
  var checked=[].slice.call(document.querySelectorAll('#erList input:checked')).map(function(x){ return x.dataset.sn; });
  var date=$('#erDate').value||todayStr(), note=$('#erNote').value.trim();
  var btn=$('#erSave'); btn.disabled=true; $('#erMsg').textContent='저장 중…';
  try{
    await eqRetApply(r, checked, date, note);
    closeOvl('ovlEqRet'); DIRTY=true; eqRefresh();
  }catch(e){ $('#erMsg').textContent=String(e.message||e); }
  btn.disabled=false;
}
/* 현황 한 행이 신청과 다른 점 */
function eqFieldDiff(o,a){
  var d=[], stA=eqSerialStatus(o, a.serial);
  if(String(a.status||'')!==String(stA||'')) d.push('상태');
  if(String(a.customer||'')!==String(o.customer||'')) d.push('고객사');
  if(o.model   && String(a.model||'')  !==String(o.model))   d.push('모델');
  if(o.channel && String(a.channel||'')!==String(o.channel)) d.push('채널');
  return d;
}

/* ---- 원복(되돌리기) — 일괄 작업 직전 현황을 통째로 찍어둡니다 ---- */
var EQ_UNDO=null, EQ_ERR='', EQ_DIAG='';
function eqRow(a){ var o={}; EQ_COLS.forEach(function(k){ o[k]=(a[k]===undefined? null : a[k]); }); return o; }
function eqSnap(label){
  EQ_UNDO={ at:new Date().toISOString(), label:label,
            before:(RAWX.assets||[]).map(eqRow) };
  try{ sessionStorage.setItem('eq_undo', JSON.stringify(EQ_UNDO)); }catch(e){}
  return EQ_UNDO;
}
function eqUndoGet(){
  if(EQ_UNDO) return EQ_UNDO;
  try{ var v=sessionStorage.getItem('eq_undo'); if(v) EQ_UNDO=JSON.parse(v); }catch(e){}
  return EQ_UNDO;
}
function eqUndoClear(){ EQ_UNDO=null; try{ sessionStorage.removeItem('eq_undo'); }catch(e){} }
async function eqUndoRun(){
  if(!SB_TOKEN){ openOvl('ovlAuth'); return; }
  var u=eqUndoGet(); if(!u||!u.before) return;
  var when=String(u.at||'').replace('T',' ').slice(0,16);
  var had={}; u.before.forEach(function(a){ had[String(a.serial||'').toUpperCase()]=a; });
  var now=(RAWX.assets||[]);
  var added=now.filter(function(a){ return !had[String(a.serial||'').toUpperCase()]; }).map(function(a){ return a.serial; });
  var nowMap={}; now.forEach(function(a){ nowMap[String(a.serial||'').toUpperCase()]=a; });
  var changed=u.before.filter(function(b){
    var c=nowMap[String(b.serial||'').toUpperCase()];
    if(!c) return true;                                   // 지워졌던 행 → 되살립니다
    return EQ_COLS.some(function(k){ return String(b[k]==null?'':b[k])!==String(c[k]==null?'':c[k]); });
  });
  if(!added.length && !changed.length){ toast('되돌릴 내용이 없습니다','현황이 이미 그때와 같습니다','info'); return; }
  if(!confirm('«'+(u.label||'일괄 작업')+'» ('+when+') 직전 상태로 장비 현황을 되돌릴까요?\n\n'+
    '· 그때 이후 새로 생긴 자산 '+added.length+'대 삭제\n'+
    '· 값이 바뀐 자산 '+changed.length+'대 원래 값으로 복구\n\n'+
    '그 뒤에 손으로 수정하신 내용도 함께 되돌아갑니다.')) return;
  var m=document.getElementById('eqMsg'); if(m) m.textContent='되돌리는 중…';
  try{
    if(added.length) await eqDel(added);
    for(var i=0;i<changed.length;i+=200)
      await sbWrite('POST','equipment_assets?on_conflict=serial',changed.slice(i,i+200),'resolution=merge-duplicates');
    await eqReload();
    eqUndoClear();
    if(m) m.textContent='';
    toast('원복 완료', added.length+'대 삭제 · '+changed.length+'대 복구');
    DIRTY=true; renderGrid();
  }catch(e){
    if(m) m.textContent='';
    toast('원복 실패', String(e.message||e).slice(0,90), 'bad');
  }
}

/* 신청 한 건을 기준으로 현황을 맞춥니다 (항상 신청 → 현황 한 방향) */
async function syncOrderAssets(r, st, quiet){
  if(st) r.status=st;
  var own=eqOwnerMap();
  var real=eqSerials(r), want=eqWant(r,own), stA=EQ_ST[r.status]||null;
  var todayS=todayStr(), out=[];
  try{
    /* 1) 임시행 정리 — 진짜 시리얼이 들어왔거나, 현황에 있으면 안 되는 상태가 된 경우 */
    if((real.length || !stA) && eqHave(r,own).some(function(a){ return eqIsPh(a.serial); })){
      await sbWrite('DELETE','equipment_assets?order_id=eq.'+r.id+'&serial=like.'+encodeURIComponent('미등록-'+r.id+'-*'));
      RAWX.assets=(RAWX.assets||[]).filter(function(a){ return !(String(a.order_id)===String(r.id) && eqIsPh(a.serial)); });
      out.push('임시행 정리');
    }
    /* 2) 아직 안 나간·취소된 신청인데 현황에 «임대중» 으로 남아 있으면 재고로 되돌립니다 */
    if(!stA){
      var back=eqHave(r,own).filter(function(a){ return !eqIsPh(a.serial) && a.status==='임대중'; })
                        .map(function(a){ return a.serial; });
      if(back.length){
        await eqPatch(back,{status:'재고', customer:null, updated_at:new Date().toISOString()});
        out.push('자산 '+back.length+'대 재고 복귀');
      }
    }
    /* 3) 신청에 없는데 이 신청에 붙어 있는 자산은 떼어냅니다 (수량을 줄였거나 시리얼을 바꾼 경우) */
    if(want.length){
      var wu=want.map(function(s){ return s.toUpperCase(); });
      var extra=eqHave(r,own).filter(function(a){ return wu.indexOf(String(a.serial||'').toUpperCase())<0; });
      var exPh=extra.filter(function(a){ return eqIsPh(a.serial); }).map(function(a){ return a.serial; });
      var exRe=extra.filter(function(a){ return !eqIsPh(a.serial); }).map(function(a){ return a.serial; });
      if(exPh.length){ await eqDel(exPh); out.push('임시행 '+exPh.length+'대 정리'); }
      if(exRe.length){ await eqPatch(exRe,{status:'재고', customer:null, order_id:null, updated_at:new Date().toISOString()});
                       out.push('연결 해제 '+exRe.length+'대 재고'); }
    }
    /* 4) 있어야 할 행 만들기 · 신청 값으로 덮어쓰기
          시리얼에 UNIQUE 인덱스가 없어도 되도록 on_conflict(upsert) 를 쓰지 않고
          «현황에 있으면 수정 · 없으면 새로 만들기» 로 처리합니다 */
    if(want.length){
      var isPh=!real.length;
      var gone=(stA!=='재고');                                   // 재고(출고 전)는 출고일을 넣지 않습니다
      var dep=gone? (r.install_date || String(r.created_at||'').slice(0,10) || todayS) : null;
      var rd=(stA==='회수완료')? (String(r.returned_date||'').slice(0,10) || todayS) : null;   /* 신청의 회수일이 기준 · 없으면 오늘 */
      var mk=function(sn){
        var o={ serial:sn, model:r.model||null, usage:'임대', status:stA,
                customer:(r.customer||null),                   /* 회수완료도 고객사를 남깁니다 — 현황에서 고객사로 찾아야 하니까 */
                channel:r.channel||null, order_id:r.id,
                deployed_date:dep, returned_date:rd };
        if(isPh) o.note='⚠ 시리얼 미입력 · 신청 #'+r.id+' ('+(r.status||'')+') 에서 자동 생성';
        return o;
      };
      var cur={}; (RAWX.assets||[]).forEach(function(a){ cur[String(a.serial||'').toUpperCase()]=a; });
      /* 시리얼별 상태: 신청이 임대중이어도 «일부 회수» 된 시리얼은 회수완료 (회수일 = 이번 처리일 › 현황에 있던 날짜 › 신청 회수일 › 오늘) */
      var retSet=(stA==='임대중')? eqRetSet(r) : [];
      var mkFor=function(sn){
        var o=mk(sn), U=sn.toUpperCase(), a=cur[U];
        if(retSet.indexOf(U)>=0){ o.status='회수완료'; o.returned_date=(r._retDates&&r._retDates[U]) || (a&&a.returned_date? String(a.returned_date).slice(0,10):null) || (r.returned_date? String(r.returned_date).slice(0,10):null) || todayS; }
        else if(stA==='회수완료'){   /* 전부 회수: 이번에 처리한 시리얼은 이번 날짜, 예전에 먼저 회수된 시리얼은 그때 날짜를 지킵니다 */
          o.returned_date=(r._retDates&&r._retDates[U]) || (a&&a.returned_date? String(a.returned_date).slice(0,10):null) || (r.returned_date? String(r.returned_date).slice(0,10):null) || todayS; }
        return o;
      };
      var ins=[], upd=[];
      want.forEach(function(sn){ (cur[sn.toUpperCase()]? upd : ins).push(sn); });
      if(ins.length){
        var made=await sbWrite('POST','equipment_assets?select=*', ins.map(mkFor), 'return=representation');
        if(made && made.length) RAWX.assets=(RAWX.assets||[]).concat(made);
        else RAWX.assets=(RAWX.assets||[]).concat(ins.map(mkFor));
      }
      if(upd.length){                                   /* 같은 값끼리 묶어 PATCH (회수일이 다르면 따로) */
        var groups={};
        upd.forEach(function(sn){ var b=mkFor(sn); delete b.serial; b.updated_at=new Date().toISOString(); var key=JSON.stringify([b.status,b.returned_date,b.customer,b.model,b.channel,b.deployed_date]); (groups[key]=groups[key]||{b:b,list:[]}).list.push(sn); });
        for(var gk in groups) await eqPatch(groups[gk].list, groups[gk].b);
      }
      var nRet=want.filter(function(sn){ return retSet.indexOf(sn.toUpperCase())>=0; }).length;
      out.push('자산 '+want.length+'대 '+stA+(nRet? ' (그중 '+nRet+'대 회수완료)':'')+(isPh? ' (시리얼 미등록)':'')+(ins.length? ' · 새로 만든 '+ins.length+'대':''));
    }
    if(!quiet) await eqReload();
    return out.length? ' · '+out.join(' · ') : '';
  }catch(e){ EQ_ERR=String(e.message||e); return ' · ⚠ 자산 동기화 실패: '+EQ_ERR.slice(0,80); }
}

/* ---- 신청 ↔ 현황 대조 패널 (장비 신청 내역 · 장비 현황 화면 위에 표시) ---- */
function eqHostEl(){
  var tw=$('#dvTable').parentElement;
  var host=document.getElementById('eqHost');
  if(!host){ host=document.createElement('div'); host.id='eqHost'; tw.parentElement.insertBefore(host,tw); }
  return host;
}
function eqScan(){
  var orders=(RAWX.orders||[]), assets=(RAWX.assets||[]), own=eqOwnerMap();
  var byOrder={}, oid={};
  orders.forEach(function(o){ oid[String(o.id)]=o; });
  assets.forEach(function(a){ if(a.order_id!=null){ (byOrder[a.order_id]=byOrder[a.order_id]||[]).push(a); } });
  var gap=[], ph=[], cancel=[], moved=[], ok=0;
  orders.forEach(function(o){
    var want=eqWant(o,own);
    var have=(byOrder[o.id]||[]).filter(function(a){ return eqIsPh(a.serial) || eqMine(a.serial,o,own); });
    if(!want.length){
      if(eqMoved(o,own)){ moved.push(o); return; }      // 장비가 더 최근 신청으로 넘어감 — 정상
      var stuck=have.filter(function(a){ return eqIsPh(a.serial) || a.status==='임대중'; });   // 취소된 신청
      if(stuck.length) gap.push({o:o, why:'취소된 신청인데 현황에 '+stuck.length+'대 남아 있음'});
      else cancel.push(o);
      return;
    }
    var wu=want.map(function(s){ return s.toUpperCase(); });
    var mat=have.filter(function(a){ return wu.indexOf(String(a.serial||'').toUpperCase())>=0; });
    var miss=want.length-mat.length, extra=have.length-mat.length, why=[];
    if(miss>0) why.push(eqSerials(o).length
        ? ('시리얼 '+want.length+'대 중 '+mat.length+'대만 현황에 있음')
        : ('현황 미등록 '+miss+'대'));
    if(extra>0) why.push('신청에 없는 '+extra+'대가 연결됨');
    if(!why.length){
      var dl={}; mat.forEach(function(a){ eqFieldDiff(o,a).forEach(function(k){ dl[k]=1; }); });
      var ks=Object.keys(dl);
      if(ks.length) why.push('현황 값이 신청과 다름 — '+ks.join('·'));
    }
    if(why.length) gap.push({o:o, why:why.join(' · ')});
    else { ok++; if(mat.some(function(a){ return eqIsPh(a.serial); })) ph.push(o); }
  });
  /* 신청 내역에 없는데 «임대중» 인 자산 (신청 기록 없이 손으로 넣은 것) */
  var orphan=assets.filter(function(a){
    if(a.status!=='임대중') return false;
    return a.order_id==null || !oid[String(a.order_id)];
  });
  return {orders:orders, gap:gap, ph:ph, cancel:cancel, moved:moved, ok:ok, orphan:orphan};
}
function own_(o){ var own=eqOwnerMap(), ser=eqSerials(o); for(var i=0;i<ser.length;i++){ if(own[ser[i]] && String(own[ser[i]].id)!==String(o.id)) return own[ser[i]]; } return null; }
function renderEqPanel(){
  if(CUR_VIEW!=='orders' && CUR_VIEW!=='assets'){
    var h0=document.getElementById('eqHost'); if(h0) h0.style.display='none'; return;
  }
  var host=eqHostEl(), s=eqScan(), bad=s.gap.length>0, u=eqUndoGet();
  host.style.display='';
  var h='<div class="card" style="padding:11px 14px;margin-bottom:10px;border-left:4px solid '+
        (bad?'var(--warning,#fab219)':'var(--good,#0ca30c)')+'">'+
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'+
      '<b style="font-size:13px">신청 ↔ 현황 대조</b>'+
      '<span class="mini" style="color:var(--ink-2)">신청 '+s.orders.length+'건 · 현황 반영 '+s.ok+'건 · '+
        '<b style="color:'+(bad?'var(--critical,#d03b3b)':'inherit')+'">맞지 않음 '+s.gap.length+'건</b>'+
        ' · 취소 '+s.cancel.length+'건'+(s.moved.length? ' · 이전됨 '+s.moved.length+'건':'')+'</span>'+
      (window.IS_VIEWER? '' : '<button class="pill" id="eqFixAll"'+(bad?'':' disabled style="opacity:.45"')+'>신청 내역 기준으로 현황 맞추기</button>')+
      (window.IS_VIEWER||!u? '' : '<button class="pill ghost" id="eqUndo" title="'+esc(u.label||'')+'">↩ 원복 ('+String(u.at||'').replace('T',' ').slice(5,16)+')</button>')+
      (window.IS_VIEWER? '' : '<button class="pill ghost" id="eqDiag" title="동기화가 안 될 때 원인을 찾아봅니다">🩺 진단</button>')+
      '<span class="mini" id="eqMsg" style="color:var(--muted)"></span>'+
    '</div>'+
    '<div class="mini" style="margin-top:4px;color:var(--muted)">기준은 «임대 장비 신청 내역» 입니다 — 취소를 뺀 모든 신청이 현황에 «수량»대씩 있어야 하고, 상태·고객사·모델·채널은 신청 내역 값으로 맞춥니다 (출고 전이면 재고)'+
      (u? ' · 마지막 일괄 작업은 «↩ 원복» 으로 되돌릴 수 있습니다':'')+'</div>';
  if(bad){
    h+='<div class="mini" style="margin-top:8px;color:var(--ink-2);line-height:1.7">'+
      s.gap.slice(0,20).map(function(x){
        return '· <b>#'+x.o.id+'</b> '+esc(x.o.customer||'(고객사 없음)')+' — '+esc(x.o.status||'')+' · '+
               esc(x.o.model||'')+' × '+(x.o.qty||1)+' → '+esc(x.why);
      }).join('<br>')+
      (s.gap.length>20? '<br>… 외 '+(s.gap.length-20)+'건':'')+'</div>';
  }
  if(s.moved.length){
    h+='<div class="mini" style="margin-top:6px;color:var(--muted)">↪ 장비가 더 최근 신청으로 넘어간 신청 '+s.moved.length+'건 — '+
       esc(s.moved.slice(0,6).map(function(o){ var nx=own_(o); return '#'+o.id+' '+(o.customer||'')+' → #'+(nx? nx.id+' '+(nx.customer||''):'?'); }).join(' / '))+
       (s.moved.length>6? ' 외 '+(s.moved.length-6)+'건':'')+' · 같은 시리얼은 가장 최근 신청이 주인이라 현황에는 새 고객사로 보입니다</div>';
  }
  if(s.ph.length){
    h+='<div class="mini" style="margin-top:6px;color:var(--muted)">⚠ 시리얼을 몰라 «미등록-…» 으로 임시 등록해 둔 신청 '+s.ph.length+
       '건 — 신청 행의 «시리얼» 칸에 실제 시리얼을 넣고 저장하면 자동으로 바뀝니다</div>';
  }
  if(s.orphan.length){
    h+='<div class="mini" style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--line,#e5e7eb);color:var(--ink-2)">'+
      '신청 내역에 없는데 «임대중» 인 자산 <b>'+s.orphan.length+'대</b> — '+
      esc(s.orphan.slice(0,8).map(function(a){ return a.serial; }).join(', '))+
      (s.orphan.length>8? ' 외 '+(s.orphan.length-8)+'대':'')+
      (window.IS_VIEWER? '' : ' <button class="pill ghost" id="eqOrphan" style="margin-left:6px">재고로 되돌리기</button>')+
      '<br><span style="color:var(--muted)">신청 기록 없이 손으로 넣었거나, 신청 행이 지워진 장비입니다 — 맞다면 그대로 두셔도 됩니다</span></div>';
  }
  if(EQ_ERR){
    h+='<div class="mini" style="margin-top:8px;padding:8px 10px;border-radius:8px;background:rgba(208,59,59,.08);'+
       'color:var(--critical,#d03b3b);word-break:break-all">⚠ 마지막 동기화 오류 — '+esc(EQ_ERR)+'</div>';
  }
  h+='<div class="mini" id="eqDiagOut" style="margin-top:8px;padding:8px 10px;border-radius:8px;background:var(--bg-2,#f6f7f9);'+
     'line-height:1.75;word-break:break-all;display:'+(EQ_DIAG?'':'none')+'">'+(EQ_DIAG||'')+'</div>';
  h+='</div>';
  host.innerHTML=h;
  var b=document.getElementById('eqFixAll'); if(b) b.onclick=eqFixAll;
  var b2=document.getElementById('eqOrphan'); if(b2) b2.onclick=eqOrphanFix;
  var b3=document.getElementById('eqUndo');   if(b3) b3.onclick=eqUndoRun;
  var b4=document.getElementById('eqDiag');   if(b4) b4.onclick=eqDiagRun;

}
async function eqFixAll(){
  if(!SB_TOKEN){ openOvl('ovlAuth'); return; }
  var s=eqScan(); if(!s.gap.length) return;
  if(!confirm('신청 내역을 기준으로 장비 현황 '+s.gap.length+'건을 맞출까요?\n\n'+
    '· 현황에 없는 장비 → 신청 내역대로 새로 등록 (시리얼이 비어 있으면 «미등록-신청번호-번호» 로 임시 등록)\n'+
    '· 접수·출하요청·배송중 신청 → 재고 로 등록 / 설치완료·회수예정 → 임대중 / 회수완료 → 회수완료\n'+
    '· 상태·고객사·모델·채널이 다른 장비 → 신청 내역 값으로 덮어쓰기\n'+
    '· 취소된 신청인데 현황에 남아 있던 장비 → 재고로 되돌림\n'+
    '· 신청에 없는데 붙어 있던 장비 → 연결 해제 후 재고\n\n'+
    '실행 직전 현황을 찍어두므로 «↩ 원복» 버튼으로 되돌릴 수 있습니다.')) return;
  eqSnap('신청 내역 기준으로 현황 맞추기 ('+s.gap.length+'건)');
  var m=document.getElementById('eqMsg'), done=0, fail=0, err='';
  for(var i=0;i<s.gap.length;i++){
    if(m) m.textContent='맞추는 중… '+(i+1)+'/'+s.gap.length;
    var x='';
    try{ x=await syncOrderAssets(s.gap[i].o, null, true); }catch(e){ x=' · ⚠ '+String(e.message||e); }
    if(/⚠/.test(x)){ fail++; if(!err) err=x; } else done++;
  }
  await eqReload();
  if(m) m.textContent='';
  if(!fail) EQ_ERR='';
  toast('현황 맞추기 완료', done+'건 반영'+(fail? ' · '+fail+'건 실패'+(err?' ('+err.slice(0,60)+')':'') : '')+' · ↩ 원복 가능', fail? 'bad':'ok');
  DIRTY=true; renderGrid();
}
/* 동기화가 안 될 때 — 어디서 막히는지 실제로 한 번씩 해 봅니다 */
async function eqDiagRun(){
  var log=[];
  function bad(t){ return '<b style="color:var(--critical,#d03b3b)">'+esc(t)+'</b>'; }
  function put(){ EQ_DIAG=log.join('<br>');
    var box=document.getElementById('eqDiagOut'); if(box){ box.style.display=''; box.innerHTML=EQ_DIAG; } }
  log.push('<b>🩺 진단</b> — 포탈 버전 '+esc(APP_VER));
  log.push('읽어온 데이터 — 신청 내역 '+((RAWX.orders||[]).length)+'건 · 장비 현황 '+((RAWX.assets||[]).length)+'대');
  put();
  var need=['serial','model','usage','status','customer','channel','deployed_date','returned_date','note','order_id','updated_at'];
  var miss=[];
  for(var i=0;i<need.length;i++){
    try{ await sbGet('equipment_assets?select='+need[i]+'&limit=1'); }catch(e){ miss.push(need[i]); }
  }
  log.push(miss.length
    ? ('① 현황 표의 열 — '+bad('없는 열: '+miss.join(', '))+' · 이 열이 없으면 동기화가 통째로 실패합니다')
    : '① 현황 표의 열 — 정상 (order_id 포함)');
  put();
  if(!SB_TOKEN){ log.push('② 쓰기 권한 — '+bad('로그인이 필요합니다')); put(); return; }
  var probe='__진단'+Date.now()+'__', okIns=false;
  try{ await sbWrite('POST','equipment_assets',[{serial:probe,status:'재고'}]); okIns=true;
       log.push('② 새 장비 만들기 — 정상'); }
  catch(e){ log.push('② 새 장비 만들기 — '+bad(String(e.message||e).slice(0,240))); }
  put();
  if(okIns){
    try{ await sbWrite('PATCH','equipment_assets?serial='+eqIn([probe]),{status:'재고',customer:null});
         log.push('③ 장비 수정 — 정상'); }
    catch(e){ log.push('③ 장비 수정 — '+bad(String(e.message||e).slice(0,240))); }
    put();
    try{ await sbWrite('DELETE','equipment_assets?serial='+eqIn([probe]));
         log.push('④ 장비 삭제 — 정상'); }
    catch(e){ log.push('④ 장비 삭제 — '+bad(String(e.message||e).slice(0,240))+' · 현황에서 «'+esc(probe)+'» 를 직접 지워주세요'); }
    put();
  }
  await eqReload();
  var s2=eqScan();
  log.push('⑤ 대조 — 맞지 않음 '+s2.gap.length+'건'+(s2.gap.length? ' · «신청 내역 기준으로 현황 맞추기» 를 누르면 만들어집니다':' (이미 다 맞습니다)'));
  if(s2.gap.length) log.push('　 예: '+esc(s2.gap.slice(0,3).map(function(x){ return '#'+x.o.id+' '+(x.o.customer||''); }).join(' / ')));
  if(EQ_ERR) log.push('⑥ 마지막 동기화 오류 — '+bad(EQ_ERR));
  put();
  DIRTY=true; renderGrid();
}
async function eqOrphanFix(){
  if(!SB_TOKEN){ openOvl('ovlAuth'); return; }
  var s=eqScan(); if(!s.orphan.length) return;
  var ser=s.orphan.map(function(a){ return a.serial; });
  if(!confirm('신청 내역에 없는데 «임대중» 으로 되어 있는 자산 '+ser.length+'대를 재고로 되돌릴까요?\n\n'+
    ser.slice(0,15).join(', ')+(ser.length>15? ' 외 '+(ser.length-15)+'대':'')+
    '\n\n고객사 값도 함께 비워집니다. («↩ 원복» 으로 되돌릴 수 있습니다)')) return;
  eqSnap('신청 없는 임대중 자산 '+ser.length+'대 재고 처리');
  try{
    await eqPatch(ser,{status:'재고', customer:null, updated_at:new Date().toISOString()});
    await eqReload();
    toast('정리 완료', ser.length+'대 재고로 되돌림 · ↩ 원복 가능');
    DIRTY=true; renderGrid();
  }catch(e){ toast('정리 실패', String(e.message||e).slice(0,80), 'bad'); }
}

/* ---- 비즈포탈 차액: 월 단위 입력 화면 ---- */
var BIZV={ym:null, edit:false, newMonth:false};
function bizNz(s){ s=String(s==null?'':s).replace(/[^\d.-]/g,''); return s===''||s==='-'? null : +s; }
function bizHostEl(){
  var tw=$('#dvTable').parentElement;
  var host=document.getElementById('bizHost');
  if(!host){ host=document.createElement('div'); host.id='bizHost'; tw.parentElement.insertBefore(host,tw); }
  return host;
}