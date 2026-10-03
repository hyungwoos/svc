/* ===== admin.js — 관리자(계정·권한·MFA 정책) · 배포·운영 · AI 점검 · 내 계정 · 수령처 =====
   포탈 본체(js/app.js)를 ④ 아키텍처 2단계(㊿+136)에서 기능별로 나눈 파일. 전역 var/function 그대로 — 즉시 실행 문장은 전부 js/init.js 에.
   로드 순서는 index.html <meta name="app-js"> (js/load.js 가 그 순서대로 ?v=APP_VER 를 붙여 불러옴) */


/* ===== 관리자 (super_admin 전용) — 계정·권한 관리 ===== */
var AX_ROLES=['super_admin','admin','admin_viewer','poc','equipment_poc'];
var AX_ROLE_KO={super_admin:'슈퍼 관리자',admin:'관리자 (조회+수정)',admin_viewer:'관리자-조회 전용',
  poc:'PoC 전용',equipment_poc:'장비·PoC 전용',
  editor:'(구) 편집자→관리자',viewer:'(구) 조회→관리자-조회',equipment:'(구) 장비→장비·PoC'};
var AX_USERS=[];
function axMsg(t,bad){ var e=$('#axMsg'); e.textContent=t||''; e.style.color=bad?'var(--critical)':'var(--ink-2)'; }
/* DB의 UTC 시각 → 보는 사람 시간대(한국이면 KST)로 */
function axTime(v){
  if(!v) return '·';
  var d=new Date(/[zZ]|[+\-]\d\d:?\d\d$/.test(String(v))? v : v+'Z');   // 시간대 없으면 UTC 로 간주
  if(isNaN(d)) return String(v).replace('T',' ').slice(0,16);
  var p=function(n){ return (n<10?'0':'')+n; };
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());
}
async function adminFetch(payload){
  var r=await fetch(SB_URL+'/functions/v1/admin',{
    method:'POST',
    headers:{'Content-Type':'application/json', apikey:SB_KEY, Authorization:'Bearer '+(SB_TOKEN||'')},
    body:JSON.stringify(payload)
  });
  var j=null; try{ j=await r.json(); }catch(e){}
  if(!r.ok || !j || !j.ok) throw new Error((j&&j.error)||('HTTP '+r.status));
  try{ sessionStorage.removeItem(CACHE_KEY); }catch(e){}   // 권한 변경 등도 캐시 무효화
  return j;
}
/* ────────────────────────────────────────────────────────────────────────────
   관리자 › 배포·운영 (㊿+128) — Edge Function ops 중계
   · 포탈(공개 HTML)에는 토큰이 하나도 없음. GitHub·Supabase 토큰은 전부 함수 Secrets. 여기엔 «작업 PIN» 입력칸만 있고 PIN 은 메모리에만(저장 안 함).
   · 함수가 ① 로그인 ② OPS_OWNER(지정 계정) ③ super_admin ④ PIN 을 전부 검사 — 화면은 슈퍼 관리자에게만 보이지만 실제 열쇠는 함수 쪽.
   · 탭: GitHub 배포(끌어다 놓기 → 커밋 · 이력 · 복원) · SQL 실행(읽기 전용 토글 · 결과 표) · Edge Function(코드 불러오기 · 배포 · Verify JWT) · 기록(ops_log)
   ──────────────────────────────────────────────────────────────────────────── */
var OPS={tab:'gh', pin:'', st:null, files:[], msg:'', ghList:null, hist:null, histPath:'', fnList:null, fnSel:'', fnMeta:null, fnCode:'', fnName:'index.ts', fnVerify:false, sqlRes:null, busy:false, target:'prod', errs:null, health:null, aic:null, seal:null};
function opsPrefix(){ return OPS.target==='staging'? 'staging/' : ''; }
function stagingUrl(){ var base=location.origin+location.pathname.replace(/\/staging\//,'/').replace(/[^/]*$/,''); return base+'staging/index.html'; }
function prodUrl(){ var base=location.origin+location.pathname.replace(/\/staging\//,'/').replace(/[^/]*$/,''); return base+'index.html'; }
function opsUrl(){ return SB_URL+'/functions/v1/ops'; }
async function opsCall(action, body){
  var o=Object.assign({action:action}, body||{}); if(action!=='status') o.pin=OPS.pin;
  var r;
  try{ r=await fetch(opsUrl(), {method:'POST', headers:{'Content-Type':'application/json', apikey:SB_KEY, Authorization:'Bearer '+SB_TOKEN}, body:JSON.stringify(o)}); }
  catch(e){ throw new Error('ops 함수에 연결하지 못했습니다 — Edge Functions 에 «ops» 가 배포돼 있고 Verify JWT 가 꺼져 있는지 확인하세요'); }
  var j=null; try{ j=await r.json(); }catch(e){}
  if(!j) throw new Error('ops 함수 응답을 읽지 못했습니다 ('+r.status+')');
  if(!j.ok) throw new Error(j.error||('실패 ('+r.status+')'));
  return j;
}
function opsFmtBytes(n){ n=Number(n)||0; return n>=1048576? (n/1048576).toFixed(2)+' MB' : n>=1024? Math.round(n/1024)+' KB' : n+' B'; }
function opsVerOf(text){ var t=String(text||''); var m=/name="app-ver" content="([^"]+)"/.exec(t) || /var APP_VER='([^']+)'/.exec(t); return m? m[1] : null; }   /* ㊿+136: <meta name="app-ver"> (예전 인라인 var 도 인식) */
function opsIsText(name){ return /\.(html?|js|mjs|ts|json|webmanifest|css|sql|md|txt|csv|svg|xml|yml|yaml|gitignore)$/i.test(name) || /^\.?gitignore$/.test(name); }
function opsSetMsg(t, cls){ OPS.msg=t||''; OPS.msgCls=cls||''; var e=document.getElementById('opsMsg'); if(e){ e.textContent=OPS.msg; e.className='mmsg'+(OPS.msgCls? ' '+OPS.msgCls:''); } }
function opsNeedPin(){ if(!OPS.pin){ opsSetMsg('작업 PIN 을 먼저 입력하세요 (위 PIN 칸)','bad'); var p=document.getElementById('opsPin'); if(p) p.focus(); return false; } return true; }
async function opsStatus(){
  try{ OPS.st=await opsCall('status'); }catch(e){ OPS.st={ok:false, error:String(e.message||e)}; }
  renderOps(true);
}
function renderOps(keep){
  var host=document.getElementById('opsHost'); if(!host) return;
  if(IS_STAGING && !OPS._tgInit){ OPS.target='staging'; OPS._tgInit=true; }
  if(!window.IS_SUPER){ host.innerHTML='<p class="cap">슈퍼 관리자만 쓸 수 있습니다.</p>'; return; }
  var st=OPS.st;
  var h='<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:4px"><h3 style="margin:0;font-size:16px">🚀 배포·운영</h3><span class="ubadge sm">지정 계정 전용</span>'+
    '<span class="mini" style="margin-left:auto">'+(st? (st.ok? (st.github? '저장소 '+esc(st.github.repo)+' · '+esc(st.github.branch)+' · GitHub 토큰 '+(st.github.token_set?'✓':'✗') : 'ops 함수 응답에 저장소 정보 없음(옛 버전?)')+' · Supabase 토큰 '+(st.mgmt_token_set?'✓':'✗')+' · PIN '+(st.pin_set?'설정됨':'미설정')+(st.slack? ' · 슬랙 알림 ✓':'') : '<span style="color:var(--critical)">'+esc(st.error||'')+'</span>') : '상태 확인 중…')+'</span></div>'+
    '<p class="cap" style="margin:0 0 12px">GitHub 커밋 · SQL 실행 · Edge Function 배포를 포탈 안에서 끝냅니다. 토큰은 전부 함수(ops) Secrets 에만 있고, 여기서는 <b>작업 PIN</b> 만 넣습니다(저장하지 않음 · 5회 틀리면 15분 잠금). 모든 실행은 기록에 남습니다.</p>'+
    '<div class="ops-bar"><label>작업 PIN <input id="opsPin" type="password" autocomplete="off" inputmode="numeric" placeholder="••••" value="'+esc(OPS.pin)+'" style="width:120px"></label>'+
    '<div class="mtabs" id="opsTabs" style="margin:0">'+[['gh','GitHub 배포'],['sql','SQL 실행'],['fn','Edge Function'],['log','기록']].map(function(t){ return '<button type="button" data-t="'+t[0]+'" aria-pressed="'+(OPS.tab===t[0])+'">'+t[1]+'</button>'; }).join('')+'</div>'+
    '<button type="button" class="pill ghost" id="opsRefresh" title="설정 상태·기록 다시 읽기">↻</button></div>'+
    '<div id="opsBody">'+(OPS.tab==='gh'? opsGhHtml() : OPS.tab==='sql'? opsSqlHtml() : OPS.tab==='fn'? opsFnHtml() : opsLogHtml())+'</div>'+
    '<div class="mact" style="margin-top:12px"><span class="mmsg'+(OPS.msgCls? ' '+OPS.msgCls:'')+'" id="opsMsg">'+esc(OPS.msg)+'</span></div>';
  host.innerHTML=h;
  var pin=document.getElementById('opsPin'); pin.oninput=function(){ OPS.pin=pin.value; };
  host.querySelectorAll('#opsTabs button').forEach(function(b){ b.onclick=function(){ OPS.tab=b.dataset.t; OPS.msg=''; OPS.msgCls=''; renderOps(true); }; });
  document.getElementById('opsRefresh').onclick=function(){ OPS.st=null; renderOps(true); opsStatus(); };
  if(OPS.tab==='gh') opsGhBind(host); else if(OPS.tab==='sql') opsSqlBind(host); else if(OPS.tab==='fn') opsFnBind(host); else opsLogBind(host);
  if(!keep && !OPS.st) opsStatus();
}
/* ── GitHub ── */
function opsGhHtml(){
  var files=OPS.files, cur=APP_VER, stg=OPS.target==='staging';
  var h='<div class="ops-grid">';
  h+='<div><div class="ops-h" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">① 올릴 파일 <span class="mtabs" style="margin:0" id="opsTarget"><button type="button" data-tg="prod" aria-pressed="'+(!stg)+'">운영</button><button type="button" data-tg="staging" aria-pressed="'+stg+'" title="staging/ 폴더에 올라가며 …/staging/index.html 에서 열립니다 (같은 DB · 상단에 STAGING 띠)">스테이징</button></span>'+(stg? '<a class="mini" href="'+esc(stagingUrl())+'" target="_blank" rel="noopener">스테이징 열기 ↗</a>':'')+'</div>'+
     '<div class="ops-drop" id="opsDrop" tabindex="0">여기에 파일이나 <b>폴더</b>를 끌어다 놓거나 <u>클릭해서 선택</u> — index.html · app.css · js/ 폴더 · 위성 페이지 · sw.js · manifest · 이미지 · tests/ 폴더 (여러 개 가능 · index.html 과 app.css/js 는 항상 같이)<input type="file" id="opsFile" multiple style="display:none"><input type="file" id="opsFolder" webkitdirectory style="display:none"></div>'+
     '<div style="margin-top:6px"><button type="button" class="cbtn" id="opsPickFolder">📁 폴더 선택</button></div>';
  if(files.length){
    h+='<table class="rn-tbl" style="margin-top:8px"><thead><tr><th>경로</th><th class="n">크기</th><th>버전</th><th></th></tr></thead><tbody>'+files.map(function(f,i){
      var ver=f.ver? (f.ver===cur? '<span class="mini">'+esc(f.ver)+' (지금과 같음)</span>' : '<b>'+esc(f.ver)+'</b> <span class="mini">← 지금 '+esc(cur)+'</span>') : '';
      return '<tr><td>'+(stg? '<span class="mini">staging/</span>':'')+'<input data-i="'+i+'" class="ops-path" value="'+esc(f.path)+'" style="width:220px"></td><td class="n">'+opsFmtBytes(f.size)+'</td><td>'+ver+(f.bin? ' <span class="mini">binary</span>':'')+'</td><td><button type="button" class="cbtn" data-rm="'+i+'">빼기</button></td></tr>'; }).join('')+'</tbody></table>';
    var tops={}; files.forEach(function(f){ var seg=f.path.split('/'); if(seg.length>1) tops[seg[0]]=(tops[seg[0]]||0)+1; }); var topKeys=Object.keys(tops);
    if(topKeys.length===1 && tops[topKeys[0]]===files.length && !/^(tests|staging|supabase|\.github|js|css|img|assets)$/.test(topKeys[0])) h+='<p class="mini" style="margin:6px 0 0">모든 파일이 «'+esc(topKeys[0])+'/» 폴더 아래에 있습니다 — 저장소 루트에 바로 두려면 <button type="button" class="cbtn" id="opsStripTop">«'+esc(topKeys[0])+'/» 떼기</button></p>';
    h+='<div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><label style="flex:1;min-width:240px">커밋 메시지 <input id="opsCommitMsg" value="'+esc(OPS.commitMsg||opsAutoMsg())+'" style="width:100%"></label><button type="button" class="pill" id="opsCommit" style="background:'+(stg? 'var(--s3,#b26a00)':'var(--brand)')+';border-color:'+(stg? 'var(--s3,#b26a00)':'var(--brand)')+';color:#fff">'+(stg? '커밋 → 스테이징':'커밋 → 운영')+'</button></div>';
    h+='<p class="mini" style="margin:6px 0 0">커밋 하나로 묶여 올라가고, 테스트가 통과하면 GitHub Pages 에 반영(보통 2~3분). '+(stg? '스테이징에서 확인한 뒤 «스테이징 → 운영 승격»으로 같은 파일을 운영에 올립니다.':'index.html 은 올린 뒤 이 화면을 새로고침하면 새 버전으로 바뀝니다.')+'</p>';
  }
  h+='<div class="ops-h" style="margin-top:14px">스테이징 ↔ 운영</div><div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="cbtn" id="opsSync" title="운영에 있는 포탈 파일 전부를 staging/ 로 복사(재업로드 없이 같은 내용) — 스테이징을 운영과 똑같이 맞출 때">운영 → 스테이징 동기화</button><button type="button" class="cbtn pri" id="opsPromote" title="staging/ 에 있는 파일을 운영(루트)으로 복사 — 스테이징에서 확인이 끝났을 때">스테이징 → 운영 승격</button><a class="cbtn" href="'+esc(stagingUrl())+'" target="_blank" rel="noopener">스테이징 열기 ↗</a></div>';
  h+='</div>';
  h+='<div><div class="ops-h">② 저장소 · 이전 버전</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"><button type="button" class="pill ghost" id="opsGhList">저장소 파일 보기</button><button type="button" class="pill ghost" id="opsGhHist" data-p="index.html">index.html 이력</button><a class="pill ghost" href="https://github.com/'+esc((OPS.st&&OPS.st.github&&OPS.st.github.repo)||'hyungwoos/svc')+'/actions" target="_blank" rel="noopener" title="테스트·배포 진행 상황">Actions ↗</a></div>';
  if(OPS.ghList) h+='<table class="rn-tbl"><thead><tr><th>경로</th><th class="n">크기</th><th></th></tr></thead><tbody>'+OPS.ghList.map(function(f){ return '<tr><td>'+esc(f.path)+'</td><td class="n">'+opsFmtBytes(f.size)+'</td><td><button type="button" class="cbtn" data-hist="'+esc(f.path)+'">이력</button></td></tr>'; }).join('')+'</tbody></table>';
  if(OPS.hist) h+='<div class="ops-h" style="margin-top:10px">'+esc(OPS.histPath)+' — 최근 커밋</div><table class="rn-tbl"><thead><tr><th>커밋</th><th>일시</th><th>메시지</th><th></th></tr></thead><tbody>'+OPS.hist.map(function(c,i){ return '<tr><td><a href="'+esc(c.url)+'" target="_blank" rel="noopener" style="font-family:ui-monospace,monospace">'+esc(c.short)+'</a></td><td class="mini">'+esc(String(c.date||'').replace('T',' ').slice(0,16))+'</td><td>'+esc(c.message)+'</td><td>'+(i===0? '<span class="mini">현재</span>' : '<button type="button" class="cbtn" data-restore="'+esc(c.sha)+'">이 버전으로 복원</button>')+'</td></tr>'; }).join('')+'</tbody></table>';
  h+=opsSealHtml();
  h+='</div></div>';
  return h;
}
/* ── ③ 보안 자산: 법인 직인 — 공개 저장소(도장.jpg) 대신 Supabase Storage 비공개 버킷 private/seal.jpg (SQL 87) ── */
var SEAL_OBJECT='private/seal.jpg';
function opsSealHtml(){
  var st=OPS.seal;
  return '<div class="ops-h" style="margin-top:14px">③ 보안 자산 — 법인 직인</div>'+
    '<p class="mini" style="margin:0 0 6px">견적서(quote.html)의 직인은 공개 저장소가 아니라 Storage 비공개 버킷 <b>private/seal.jpg</b> 에서 로그인한 사용자만 받습니다(SQL 87). 여기서 올린 뒤, 저장소에 남아 있는 도장.jpg 를 지우세요.</p>'+
    '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><span id="opsSealSt" class="mini">'+(st? (st.ok? '✓ Storage 에 있음 · '+opsFmtBytes(st.size)+' · '+esc(st.type||'') : '✗ '+esc(st.error||'없음')) : '상태 미확인')+'</span>'+
    '<button type="button" class="cbtn" id="opsSealCheck">직인 상태 확인</button>'+
    '<label class="cbtn" style="cursor:pointer">직인 이미지 올리기<input type="file" id="opsSealFile" accept="image/jpeg,image/png,image/webp" style="display:none"></label>'+
    '<button type="button" class="cbtn" id="opsSealRm" title="저장소 루트와 staging/ 의 도장.jpg 를 삭제 커밋 (Git 이력에는 남음)">저장소의 도장.jpg 삭제</button></div>'+
    (st&&st.ok&&st.url? '<div style="margin-top:6px"><img src="'+esc(st.url)+'" alt="직인 미리보기" style="height:48px;border:1px solid var(--line);border-radius:6px;background:#fff"></div>':'');
}
async function opsSealCheck(quiet){
  try{
    var r=await fetch(SB_URL+'/storage/v1/object/authenticated/'+SEAL_OBJECT, {headers:{apikey:SB_KEY, Authorization:'Bearer '+SB_TOKEN}});
    if(!r.ok){ var t=''; try{ t=(await r.json()).message||''; }catch(e){} OPS.seal={ok:false, error:r.status===400||r.status===404? '아직 없음 (올리기 필요)' : r.status===403? '권한 없음 — SQL 87 정책 확인' : (r.status+' '+t)}; }
    else { var b=await r.blob(); if(OPS.seal&&OPS.seal.url) try{ URL.revokeObjectURL(OPS.seal.url); }catch(e){} OPS.seal={ok:true, size:b.size, type:b.type, url:URL.createObjectURL(b)}; }
  }catch(e){ OPS.seal={ok:false, error:'Storage 에 연결하지 못했습니다'}; }
  if(!quiet) opsSetMsg(OPS.seal.ok? '직인이 Storage 에 있습니다':'직인: '+OPS.seal.error, OPS.seal.ok?'ok':'bad');
  renderOps(true);
}
async function opsSealUpload(file){
  if(!file) return; if(!/^image\/(jpeg|png|webp)$/.test(file.type)){ opsSetMsg('JPG · PNG · WebP 이미지만 올릴 수 있습니다','bad'); return; }
  if(file.size>2*1024*1024){ opsSetMsg('2MB 이하 이미지로 올려 주세요','bad'); return; }
  if(!confirm('«'+file.name+'» ('+opsFmtBytes(file.size)+') 을 직인으로 올립니다 (private/seal.jpg · 기존 파일은 덮어씀). 견적서에 바로 반영됩니다. 계속할까요?')) return;
  opsSetMsg('직인 올리는 중…');
  try{
    var r=await fetch(SB_URL+'/storage/v1/object/'+SEAL_OBJECT, {method:'POST', headers:{apikey:SB_KEY, Authorization:'Bearer '+SB_TOKEN, 'Content-Type':file.type, 'x-upsert':'true', 'cache-control':'3600'}, body:file});
    if(!r.ok){ var t=''; try{ t=(await r.json()).message||''; }catch(e){} throw new Error(r.status===403||r.status===400&&/policy|row-level/i.test(t)? '권한 없음 — SQL 87 을 실행했는지, 슈퍼 관리자인지 확인하세요' : r.status===404? 'private 버킷이 없습니다 — SQL 87 을 먼저 실행하세요' : (r.status+' '+t)); }
    logChange('seal_upload','storage','private/seal.jpg',{name:file.name, size:file.size, type:file.type});
    toast('직인 저장 완료', 'Storage private/seal.jpg');
    await opsSealCheck(true); opsSetMsg('직인을 Storage 에 저장했습니다 — 이제 «저장소의 도장.jpg 삭제»를 눌러 공개 저장소에서 지우세요','ok');
  }catch(e){ opsSetMsg(String(e.message||e),'bad'); }
}
async function opsSealRm(){
  if(!opsNeedPin() || OPS.busy) return;
  if(!(OPS.seal&&OPS.seal.ok) && !confirm('Storage 에 직인이 아직 확인되지 않았습니다. 저장소에서 지우면 견적서에 직인이 안 나올 수 있습니다. 그래도 지울까요?')) return;
  OPS.busy=true; opsSetMsg('저장소에서 도장 파일 찾는 중…');
  try{
    var l=await opsCall('gh_list'); var paths=l.files.map(function(f){ return f.path; }).filter(function(p){ return /(^|\/)도장\.(jpe?g|png)$/i.test(p); });
    if(!paths.length){ opsSetMsg('저장소에 도장 파일이 없습니다 (이미 지워짐)','ok'); OPS.busy=false; return; }
    if(!confirm('다음 파일을 저장소에서 삭제하는 커밋을 만듭니다:\n\n'+paths.map(function(p){ return '· '+p; }).join('\n')+'\n\nGit 이력에는 남습니다(완전 삭제는 로컬 git filter-repo). 계속할까요?')){ OPS.busy=false; return; }
    var r=await opsCall('gh_delete',{paths:paths});
    opsSetMsg('삭제 커밋 완료 — '+r.commit.slice(0,7)+' · '+r.deleted.join(', ')+' · Pages 반영 2~3분','ok'); toast('도장 파일 삭제 커밋', r.deleted.join(', '));
    OPS.ghList=null; renderOps(true);
  }catch(e){ opsSetMsg(String(e.message||e),'bad'); }
  OPS.busy=false;
}
function opsAutoMsg(){
  var names=OPS.files.map(function(f){ return f.path; }), vers=OPS.files.map(function(f){ return f.ver; }).filter(Boolean);
  return (vers.length? '포탈 '+vers[0].replace(/^.*\s/,'')+' · ' : '')+names.join(', ')+' (포탈에서 배포)';
}
function opsGhBind(host){
  host.querySelectorAll('#opsTarget button').forEach(function(b){ b.onclick=function(){ OPS.target=b.dataset.tg; OPS.commitMsg=''; renderOps(true); }; });
  var drop=host.querySelector('#opsDrop'), inp=host.querySelector('#opsFile'), finp=host.querySelector('#opsFolder');
  if(drop){
    drop.onclick=function(){ inp.click(); }; drop.onkeydown=function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); inp.click(); } };
    drop.ondragover=function(e){ e.preventDefault(); drop.classList.add('on'); }; drop.ondragleave=function(){ drop.classList.remove('on'); };
    drop.ondrop=function(e){ e.preventDefault(); drop.classList.remove('on'); opsDropItems(e.dataTransfer); };
    inp.onchange=function(){ opsAddFiles(inp.files); inp.value=''; };
    if(finp) finp.onchange=function(){ opsAddFiles(finp.files, true); finp.value=''; };
    var pf=host.querySelector('#opsPickFolder'); if(pf) pf.onclick=function(){ finp.click(); };
  }
  var sy=host.querySelector('#opsSync'); if(sy) sy.onclick=function(){ opsCopy('', 'staging'); };
  var sc=host.querySelector('#opsSealCheck'); if(sc) sc.onclick=function(){ opsSealCheck(); };
  var sf=host.querySelector('#opsSealFile'); if(sf) sf.onchange=function(){ opsSealUpload(sf.files[0]); sf.value=''; };
  var sr=host.querySelector('#opsSealRm'); if(sr) sr.onclick=opsSealRm;
  var pm=host.querySelector('#opsPromote'); if(pm) pm.onclick=function(){ opsCopy('staging', ''); };
  host.querySelectorAll('.ops-path').forEach(function(i){ i.onchange=function(){ OPS.files[+i.dataset.i].path=i.value.trim().replace(/^\/+/,''); }; });
  host.querySelectorAll('[data-rm]').forEach(function(b){ b.onclick=function(){ OPS.files.splice(+b.dataset.rm,1); OPS.commitMsg=''; renderOps(true); }; });
  var st=host.querySelector('#opsStripTop'); if(st) st.onclick=function(){ OPS.files.forEach(function(f){ f.path=f.path.replace(/^[^/]+\//,''); }); OPS.commitMsg=''; renderOps(true); };
  var cm=host.querySelector('#opsCommitMsg'); if(cm) cm.oninput=function(){ OPS.commitMsg=cm.value; };
  var go=host.querySelector('#opsCommit'); if(go) go.onclick=opsCommit;
  var gl=host.querySelector('#opsGhList'); if(gl) gl.onclick=async function(){ if(!opsNeedPin()) return; opsSetMsg('저장소 읽는 중…'); try{ var r=await opsCall('gh_list'); OPS.ghList=r.files; opsSetMsg(r.files.length+'개 파일','ok'); renderOps(true); }catch(e){ opsSetMsg(String(e.message||e),'bad'); } };
  host.querySelectorAll('[data-hist],#opsGhHist').forEach(function(b){ b.onclick=async function(){ if(!opsNeedPin()) return; var p=b.dataset.hist||b.dataset.p; opsSetMsg(p+' 이력 읽는 중…'); try{ var r=await opsCall('gh_history',{path:p, n:10}); OPS.hist=r.commits; OPS.histPath=p; opsSetMsg(r.commits.length+'건','ok'); renderOps(true); }catch(e){ opsSetMsg(String(e.message||e),'bad'); } }; });
  host.querySelectorAll('[data-restore]').forEach(function(b){ b.onclick=async function(){ if(!opsNeedPin()) return; var sha=b.dataset.restore, p=OPS.histPath;
    if(!confirm('«'+p+'» 을 커밋 '+sha.slice(0,7)+' 시점 내용으로 되돌려 새 커밋을 만듭니다. 계속할까요?')) return;
    opsSetMsg('복원 중…'); b.disabled=true;
    try{ var r=await opsCall('gh_restore',{path:p, ref:sha}); opsSetMsg('복원 커밋 완료 — '+r.commit.slice(0,7)+(r.app_ver? ' · '+r.app_ver:'')+' · Pages 반영 1~2분','ok'); toast('GitHub 복원 완료', p+' ← '+sha.slice(0,7)); OPS.hist=null; renderOps(true); }
    catch(e){ opsSetMsg(String(e.message||e),'bad'); b.disabled=false; } }; });
}
/* 끌어다 놓은 항목에 폴더가 있으면 안을 걸어 상대 경로를 유지 (tests/smoke.mjs 처럼) */
function opsDropItems(dt){
  var items=dt&&dt.items? [].slice.call(dt.items) : [];
  var entries=items.map(function(it){ return it.webkitGetAsEntry? it.webkitGetAsEntry() : null; }).filter(Boolean);
  if(!entries.length || !entries.some(function(e){ return e.isDirectory; })){ opsAddFiles(dt.files); return; }
  var files=[], pending=0, done=function(){ if(--pending===0) opsAddFiles(files, true); };
  function walk(entry, prefix){
    if(entry.isFile){ pending++; entry.file(function(f){ try{ Object.defineProperty(f,'relPath',{value:prefix+f.name}); }catch(e){} files.push(f); done(); }, done); return; }
    if(entry.isDirectory){ if(/^(\.git|node_modules|_site)$/.test(entry.name)) return; pending++; var rd=entry.createReader(); var all=[];
      (function more(){ rd.readEntries(function(es){ if(es.length){ all=all.concat(es); more(); } else { all.forEach(function(e){ walk(e, prefix+entry.name+'/'); }); done(); } }, done); })(); }
  }
  entries.forEach(function(e){ walk(e, ''); });
}
function opsAddFiles(list, keepPath){
  var arr=[].slice.call(list||[]); if(!arr.length) return;
  arr=arr.filter(function(f){ var p=f.relPath||f.webkitRelativePath||f.name; return !/(^|\/)(\.git|node_modules|_site|\.DS_Store)(\/|$)/.test(p); });
  if(!arr.length) return;
  var left=arr.length;
  arr.forEach(function(f){
    var isText=opsIsText(f.name), rd=new FileReader();
    rd.onload=function(){
      var rel=keepPath? (f.relPath||f.webkitRelativePath||f.name) : f.name;
      var item={path:rel.replace(/^\/+/,''), size:f.size, bin:!isText};
      if(isText){ item.content=String(rd.result||''); item.ver=/index\.html$/i.test(f.name)? opsVerOf(item.content) : null; }
      else { item.content_b64=String(rd.result||'').replace(/^data:[^;]*;base64,/,''); }
      var k=OPS.files.findIndex(function(x){ return x.path===item.path; }); if(k>=0) OPS.files[k]=item; else OPS.files.push(item);
      if(--left===0){ OPS.commitMsg=''; renderOps(true); }
    };
    rd.onerror=function(){ if(--left===0) renderOps(true); };
    if(isText) rd.readAsText(f); else rd.readAsDataURL(f);
  });
}
async function opsCommit(){
  if(!opsNeedPin() || !OPS.files.length || OPS.busy) return;
  var msgEl=document.getElementById('opsCommitMsg'), message=(msgEl&&msgEl.value.trim())||opsAutoMsg();
  var idx=OPS.files.filter(function(f){ return /index\.html$/i.test(f.path); })[0];
  if(idx && idx.ver && idx.ver===APP_VER && !confirm('올리는 index.html 의 APP_VER('+idx.ver+')가 지금 실행 중인 버전과 같습니다. 그래도 커밋할까요?')) return;
  if(idx && !idx.ver && !confirm('올리는 index.html 에서 APP_VER 를 찾지 못했습니다 — 포탈 파일이 맞나요? 그래도 커밋할까요?')) return;
  var hasCode=OPS.files.some(function(f){ return /(^|\/)(app\.css|js\/[^/]+\.js)$/.test(f.path); });
  if(hasCode && !idx && !confirm('app.css 또는 js/ 파일만 올리고 index.html 은 없습니다. 포탈은 index.html 의 APP_VER(?v=) 로 캐시를 깨므로 index.html(버전 +1)을 함께 올리지 않으면 사용자 브라우저가 예전 코드를 계속 쓸 수 있습니다. 그래도 커밋할까요?')) return;
  if(!confirm(OPS.files.length+'개 파일을 GitHub('+(OPS.st&&OPS.st.ok&&OPS.st.github? OPS.st.github.repo+' · '+OPS.st.github.branch : '저장소')+')에 커밋합니다.\n\n'+OPS.files.map(function(f){ return '· '+f.path+' ('+opsFmtBytes(f.size)+')'; }).join('\n')+'\n\n'+message)) return;
  OPS.busy=true; var bt=document.getElementById('opsCommit'); if(bt) bt.disabled=true; opsSetMsg('커밋 중… (파일 '+OPS.files.length+'개)');
  try{
    var pre=opsPrefix(), stg=OPS.target==='staging';
    var r=await opsCall('gh_put',{files:OPS.files.map(function(f){ return f.bin? {path:pre+f.path, content_b64:f.content_b64} : {path:pre+f.path, content:f.content}; }), message:(stg? '[staging] ':'')+message});
    opsSetMsg('커밋 완료 — '+r.commit.slice(0,7)+' · '+r.files.join(', ')+' · 테스트 통과 후 Pages 반영(2~3분)'+(stg? ' · 스테이징: '+stagingUrl():''),'ok');
    toast('GitHub 커밋 완료', r.files.join(', ')+' → '+r.commit.slice(0,7));
    OPS.files=[]; OPS.commitMsg=''; OPS.hist=null; renderOps(true);
    if(idx && !stg) setTimeout(function(){ if(confirm('index.html 을 운영에 올렸습니다. 새 버전을 쓰려면 포탈을 새로고침해야 합니다 (테스트·Pages 반영에 2~3분 걸릴 수 있음). 지금 새로고침할까요?')) location.reload(); }, 400);
    if(idx && stg) setTimeout(function(){ if(confirm('스테이징에 올렸습니다. 2~3분 뒤 스테이징 포탈을 새 탭으로 열까요?')) window.open(stagingUrl(), '_blank'); }, 400);
  }catch(e){ opsSetMsg(String(e.message||e),'bad'); }
  OPS.busy=false; if(bt) bt.disabled=false;
}
async function opsCopy(src, dst){
  if(!opsNeedPin() || OPS.busy) return;
  var promote=(src==='staging');
  if(!confirm(promote? '스테이징(staging/)의 포탈 파일을 운영(루트)으로 복사합니다. 운영 포탈이 스테이징과 같아집니다 — 스테이징에서 충분히 확인했나요?' : '운영(루트)의 포탈 파일을 staging/ 로 복사합니다. 스테이징이 운영과 같아집니다. 계속할까요?')) return;
  OPS.busy=true; opsSetMsg(promote? '승격 중…':'동기화 중…');
  try{ var r=await opsCall('gh_copy',{src:src, dst:dst}); opsSetMsg((promote? '승격 커밋 완료 — ':'동기화 커밋 완료 — ')+r.commit.slice(0,7)+' · '+r.files.length+'개 파일 · '+(r.note||''),'ok'); toast(promote? '스테이징 → 운영 승격':'운영 → 스테이징 동기화', r.files.length+'개 파일 · '+r.commit.slice(0,7)); OPS.hist=null; renderOps(true); }
  catch(e){ opsSetMsg(String(e.message||e),'bad'); }
  OPS.busy=false;
}
/* ── 시스템 점검: 포탈이 의존하는 것들이 살아 있는지 한 번에 (운영 DB 는 읽기 전용 select 1 만) ── */
async function opsHealth(){
  var out=[], t=function(){ return Date.now(); };
  async function step(name, fn){ var t0=t(); try{ var r=await fn(); out.push({name:name, ok:true, ms:t()-t0, info:r||''}); }catch(e){ out.push({name:name, ok:false, ms:t()-t0, info:String(e.message||e).slice(0,140)}); } }
  OPS.health={running:true, rows:out}; renderOps(true);
  await step('GitHub Pages 최신 index.html', async function(){ var r=await fetch(prodUrl()+'?nocache='+Date.now(), {cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status); var m=opsVerOf(await r.text()); if(!m) throw new Error('APP_VER 없음'); m=[m,m]; return m[1]+(m[1]===APP_VER? ' (지금과 같음)':' ← 지금 실행 중 '+APP_VER+(IS_STAGING? ' (스테이징)':' — 새로고침 필요')); });
  await step('Supabase REST (load_all)', async function(){ var r=await fetch(SB_URL+'/rest/v1/rpc/load_all', {method:'POST', headers:{'Content-Type':'application/json', apikey:SB_KEY, Authorization:'Bearer '+SB_TOKEN}, body:'{}'}); if(!r.ok) throw new Error('HTTP '+r.status); return 'HTTP 200'; });
  await step('AI (ask ping)', async function(){ var r=await aiFetch({mode:'ping'}, 12000); if(!r || r.ok===false) throw new Error((r&&r.error)||'응답 없음'); return (r.model||'ok'); });
  await step('remind (dry)', async function(){ var r=await fetch(SB_URL+'/functions/v1/remind?dry=1', {method:'POST', headers:{'Content-Type':'application/json', apikey:SB_KEY, Authorization:'Bearer '+SB_TOKEN}, body:JSON.stringify({month:idxDate(STATE.base)})}); var j=await r.json(); if(!j.ok) throw new Error(j.error||('HTTP '+r.status)); return '이달 '+(j.counts&&j.counts.due)+' · 다음 달 '+(j.counts&&j.counts.next)+' · 미처리 '+(j.counts&&j.counts.lapsed); });
  await step('ops (status)', async function(){ var r=await opsCall('status'); return (r.github&&r.github.token_set? 'GitHub ✓':'GitHub ✗')+' · '+(r.mgmt_token_set? 'Supabase ✓':'Supabase ✗')+' · '+(r.log_ok? '기록 ✓':'기록 ✗'); });
  if(OPS.pin) await step('운영 DB (select 1 · 읽기 전용)', async function(){ var r=await opsCall('sql_run',{sql:'select 1 as ok, now() as at', read_only:true}); return Array.isArray(r.rows)&&r.rows[0]? String(r.rows[0].at||'').slice(0,19) : 'ok'; });
  await step('서비스 워커', async function(){ if(!('serviceWorker' in navigator)) return '미지원'; var reg=await navigator.serviceWorker.getRegistration(); return reg? (reg.active? '활성':'등록됨') : '없음 (file:// 또는 미등록)'; });
  OPS.health={running:false, rows:out, at:new Date()}; renderOps(true);
}
async function opsLoadErrors(){
  try{ var rows=await sbTry('client_errors?select=at,email,ver,view,msg,url,n&order=at.desc&limit=30'); OPS.errs=rows||[]; }catch(e){ OPS.errs=[]; }
  renderOps(true);
}
/* ── SQL ── */
function opsSqlHtml(){
  var res=OPS.sqlRes;
  var h='<div class="ops-h">SQL 실행 — Supabase Management API (SQL Editor 와 같은 경로) · 여러 문장·DO 블록 가능 · 결과는 마지막 문장 기준</div>';
  h+='<textarea id="opsSql" class="ops-ta" spellcheck="false" placeholder="-- 제가 드린 sql8N 파일을 그대로 붙여 넣으세요&#10;select now();">'+esc(OPS.sql||'')+'</textarea>';
  h+='<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px"><label class="mini" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" id="opsRO"'+(OPS.sqlRO?' checked':'')+'> 읽기 전용(SELECT 확인용 · 바뀌는 건 전부 롤백)</label><span class="mini" id="opsSqlInfo">'+esc(opsSqlInfo(OPS.sql||''))+'</span><button type="button" class="pill" id="opsSqlGo" style="margin-left:auto;background:var(--brand);border-color:var(--brand);color:#fff">실행 (Ctrl+Enter)</button></div>';
  if(res){
    h+='<div class="ops-h" style="margin-top:12px">결과 — '+(res.row_count!=null? res.row_count+'행' : '행 없음')+(res.truncated? ' (500행까지 표시)':'')+(res.read_only? ' · 읽기 전용(롤백됨)':'')+' · '+res.ms+'ms</div>';
    var rows=Array.isArray(res.rows)? res.rows : (res.rows==null? [] : [res.rows]);
    if(rows.length && typeof rows[0]==='object' && rows[0]!==null){
      var cols=Object.keys(rows[0]); rows.slice(0,200).forEach(function(r){ Object.keys(r||{}).forEach(function(k){ if(cols.indexOf(k)<0) cols.push(k); }); });
      h+='<div style="max-height:46vh;overflow:auto"><table class="rn-tbl"><thead><tr>'+cols.map(function(c){ return '<th>'+esc(c)+'</th>'; }).join('')+'</tr></thead><tbody>'+rows.slice(0,200).map(function(r){ return '<tr>'+cols.map(function(c){ var v=r? r[c] : null; return '<td title="'+esc(v==null?'':(typeof v==='object'? JSON.stringify(v) : String(v)))+'">'+esc(v==null? '' : (typeof v==='object'? JSON.stringify(v) : String(v))).slice(0,160)+'</td>'; }).join('')+'</tr>'; }).join('')+'</tbody></table></div>'+(rows.length>200? '<p class="mini">표에는 200행까지만 — 전체는 엑셀로</p>':'')+
         '<div style="margin-top:6px"><button type="button" class="pill ghost" id="opsSqlXls">⬇ 엑셀</button></div>';
    } else h+='<pre class="ops-pre">'+esc(JSON.stringify(res.rows, null, 1)||'(결과 없음)').slice(0,4000)+'</pre>';
  }
  return h;
}
function opsSqlInfo(sql){
  var body=String(sql||'').replace(/--[^\n]*/g,'').replace(/\$[a-z0-9_]*\$[\s\S]*?\$[a-z0-9_]*\$/gi,'$$…$$');
  var n=body.split(/;\s*(?:\n|$)/).filter(function(s){ return s.trim(); }).length;
  var t={}; var re=/\b(?:from|join|update|into|table(?:\s+if\s+(?:not\s+)?exists)?|truncate|drop\s+table(?:\s+if\s+exists)?)\s+(?:only\s+)?((?:public\.)?[a-z_][a-z0-9_]*)/gi, m;
  while((m=re.exec(body))){ var nm=m[1].replace(/^public\./,''); if(!/^(select|where|values|set|lateral|unnest|generate_series)$/i.test(nm)) t[nm]=1; }
  var danger=/\b(drop\s+(table|schema|function)|truncate|delete\s+from)\b/i.test(body);
  return (n? n+'개 문장' : '')+(Object.keys(t).length? ' · 표: '+Object.keys(t).slice(0,8).join(', ') : '')+(danger? ' · ⚠ 삭제/드롭 포함':'');
}
function opsSqlBind(host){
  var ta=host.querySelector('#opsSql'), info=host.querySelector('#opsSqlInfo');
  ta.oninput=function(){ OPS.sql=ta.value; if(info) info.textContent=opsSqlInfo(ta.value); };
  ta.onkeydown=function(e){ if((e.ctrlKey||e.metaKey) && e.key==='Enter'){ e.preventDefault(); opsSqlRun(); } if(e.key==='Tab'){ e.preventDefault(); var s=ta.selectionStart; ta.value=ta.value.slice(0,s)+'  '+ta.value.slice(ta.selectionEnd); ta.selectionStart=ta.selectionEnd=s+2; OPS.sql=ta.value; } };
  var ro=host.querySelector('#opsRO'); ro.onchange=function(){ OPS.sqlRO=ro.checked; };
  host.querySelector('#opsSqlGo').onclick=opsSqlRun;
  var x=host.querySelector('#opsSqlXls'); if(x) x.onclick=function(){ var rows=OPS.sqlRes.rows||[]; var cols=Object.keys(rows[0]||{}); xlsxAoa('sql_결과_'+todayStr(), cols, rows.map(function(r){ return cols.map(function(c){ var v=r[c]; return v!=null&&typeof v==='object'? JSON.stringify(v) : v; }); })); };
}
async function opsSqlRun(){
  if(!opsNeedPin() || OPS.busy) return;
  var sql=(OPS.sql||'').trim(); if(!sql){ opsSetMsg('SQL 을 입력하세요','bad'); return; }
  var info=opsSqlInfo(sql), ro=!!OPS.sqlRO;
  if(!ro && !confirm('운영 DB 에 실행합니다 — '+info+'\n\n'+sql.replace(/\s+/g,' ').slice(0,300)+(sql.length>300?' …':'')+'\n\n계속할까요?')) return;
  OPS.busy=true; var bt=document.getElementById('opsSqlGo'); if(bt) bt.disabled=true; opsSetMsg('실행 중…'); var t0=Date.now();
  try{ var r=await opsCall('sql_run',{sql:sql, read_only:ro}); r.ms=Date.now()-t0; OPS.sqlRes=r; opsSetMsg('완료 — '+(r.row_count!=null? r.row_count+'행':'행 없음')+(ro? ' (읽기 전용·롤백)':''),'ok'); renderOps(true); }
  catch(e){ OPS.sqlRes=null; opsSetMsg(String(e.message||e),'bad'); renderOps(true); }
  OPS.busy=false;
}
/* ── Edge Function ── */
function opsFnHtml(){
  var L=OPS.fnList, sel=OPS.fnSel, meta=OPS.fnMeta;
  var h='<div class="ops-grid"><div><div class="ops-h">① 함수</div>';
  h+='<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><button type="button" class="pill ghost" id="opsFnList">목록 불러오기</button>';
  if(L) h+='<select id="opsFnSel" style="min-width:160px"><option value="">— 함수 선택 —</option>'+L.map(function(f){ return '<option value="'+esc(f.slug)+'"'+(f.slug===sel?' selected':'')+'>'+esc(f.slug)+' · v'+esc(f.version)+(f.verify_jwt? ' · JWT검사 ON':'')+'</option>'; }).join('')+'<option value="__new"'+(sel==='__new'?' selected':'')+'>＋ 새 함수…</option></select>';
  if(sel==='__new') h+='<input id="opsFnNew" placeholder="새 함수 이름(slug · 영문 소문자)" value="'+esc(OPS.fnNew||'')+'" style="width:200px">';
  if(sel && sel!=='__new') h+='<button type="button" class="pill ghost" id="opsFnGet">코드 불러오기</button>';
  h+='</div>';
  if(meta) h+='<p class="mini" style="margin:8px 0 0">'+esc(meta.slug)+' · v'+esc(meta.version)+' · 진입점 '+esc(meta.entrypoint_path||'index.ts')+' · Verify JWT '+(meta.verify_jwt?'ON':'OFF')+' · 수정 '+esc(String(meta.updated_at||'').replace('T',' ').slice(0,16))+(OPS.fnFiles&&OPS.fnFiles.length>1? ' · 파일 '+OPS.fnFiles.length+'개(첫 파일만 편집·배포됨)':'')+'</p>';
  h+='<div class="ops-h" style="margin-top:12px">② 코드</div><div class="ops-drop" id="opsFnDrop" tabindex="0">index.ts 파일을 끌어다 놓거나 <u>클릭</u> — 또는 아래 칸에 붙여넣기<input type="file" id="opsFnFile" accept=".ts,.js,.tsx" style="display:none"></div>';
  h+='<textarea id="opsFnCode" class="ops-ta" spellcheck="false" style="min-height:260px;margin-top:8px" placeholder="// Deno.serve(async (req) => { … })">'+esc(OPS.fnCode||'')+'</textarea>';
  h+='<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px"><label class="mini">파일명 <input id="opsFnName" value="'+esc(OPS.fnName||'index.ts')+'" style="width:140px"></label><label class="mini" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" id="opsFnVerify"'+(OPS.fnVerify?' checked':'')+'> Verify JWT (포탈 함수는 전부 OFF)</label><span class="mini" id="opsFnInfo">'+(OPS.fnCode? (OPS.fnCode.length.toLocaleString('ko-KR')+'자'):'')+'</span><button type="button" class="pill" id="opsFnDeploy" style="margin-left:auto;background:var(--brand);border-color:var(--brand);color:#fff">배포</button>'+(sel&&sel!=='__new'? '<button type="button" class="pill ghost" id="opsFnPatch" title="코드는 그대로 두고 Verify JWT 설정만 저장">설정만 저장</button>':'')+'</div>';
  h+='</div><div><div class="ops-h">배포 메모</div><ul class="mini" style="margin:0;padding-left:16px;line-height:1.7"><li>슬러그(이름)는 URL 이 됩니다 — <code>…/functions/v1/슬러그</code>. 한 번 만들면 못 바꿉니다.</li><li>Verify JWT 는 ask·remind·ops 모두 <b>OFF</b> — 함수가 직접 로그인 토큰을 검사합니다. ON 이면 포탈에서 Failed to fetch.</li><li>Secrets 를 바꾼 뒤에는 그 함수를 다시 배포해야 새 값을 읽습니다.</li><li>배포 뒤 10~20초 지나서 포탈에서 호출해 보세요.</li></ul></div></div>';
  return h;
}
function opsFnBind(host){
  var lb=host.querySelector('#opsFnList'); if(lb) lb.onclick=async function(){ if(!opsNeedPin()) return; opsSetMsg('함수 목록 읽는 중…'); try{ var r=await opsCall('fn_list'); OPS.fnList=r.functions; opsSetMsg(r.functions.length+'개','ok'); renderOps(true); }catch(e){ opsSetMsg(String(e.message||e),'bad'); } };
  var sel=host.querySelector('#opsFnSel'); if(sel) sel.onchange=function(){ OPS.fnSel=sel.value; OPS.fnMeta=null; OPS.fnFiles=null; var f=(OPS.fnList||[]).filter(function(x){ return x.slug===sel.value; })[0]; if(f){ OPS.fnVerify=!!f.verify_jwt; OPS.fnName=(f.entrypoint_path||'index.ts').split('/').pop(); } renderOps(true); };
  var nw=host.querySelector('#opsFnNew'); if(nw) nw.oninput=function(){ OPS.fnNew=nw.value.trim(); };
  var gb=host.querySelector('#opsFnGet'); if(gb) gb.onclick=async function(){ if(!opsNeedPin()) return; opsSetMsg('코드 읽는 중…'); try{ var r=await opsCall('fn_get',{slug:OPS.fnSel}); OPS.fnMeta=r.meta; OPS.fnFiles=r.files; var f0=(r.files||[])[0]; OPS.fnCode=f0&&f0.content!=null? f0.content : ''; OPS.fnName=f0? (f0.name||'index.ts').split('/').pop() : 'index.ts'; OPS.fnVerify=!!r.meta.verify_jwt; opsSetMsg(f0? (f0.name+' · '+opsFmtBytes(f0.size)) : '코드 본문을 받지 못했습니다 (body '+r.body_status+')', f0?'ok':'bad'); renderOps(true); }catch(e){ opsSetMsg(String(e.message||e),'bad'); } };
  var drop=host.querySelector('#opsFnDrop'), inp=host.querySelector('#opsFnFile');
  function take(files){ var f=files&&files[0]; if(!f) return; var rd=new FileReader(); rd.onload=function(){ OPS.fnCode=String(rd.result||''); OPS.fnName=f.name; renderOps(true); }; rd.readAsText(f); }
  drop.onclick=function(){ inp.click(); }; drop.ondragover=function(e){ e.preventDefault(); drop.classList.add('on'); }; drop.ondragleave=function(){ drop.classList.remove('on'); }; drop.ondrop=function(e){ e.preventDefault(); drop.classList.remove('on'); take(e.dataTransfer.files); }; inp.onchange=function(){ take(inp.files); inp.value=''; };
  var ta=host.querySelector('#opsFnCode'); ta.oninput=function(){ OPS.fnCode=ta.value; var i=host.querySelector('#opsFnInfo'); if(i) i.textContent=ta.value.length.toLocaleString('ko-KR')+'자'; };
  ta.onkeydown=function(e){ if(e.key==='Tab'){ e.preventDefault(); var s=ta.selectionStart; ta.value=ta.value.slice(0,s)+'  '+ta.value.slice(ta.selectionEnd); ta.selectionStart=ta.selectionEnd=s+2; OPS.fnCode=ta.value; } };
  var nm=host.querySelector('#opsFnName'); nm.oninput=function(){ OPS.fnName=nm.value.trim(); };
  var vf=host.querySelector('#opsFnVerify'); vf.onchange=function(){ OPS.fnVerify=vf.checked; };
  host.querySelector('#opsFnDeploy').onclick=opsFnDeploy;
  var pb=host.querySelector('#opsFnPatch'); if(pb) pb.onclick=async function(){ if(!opsNeedPin()) return; opsSetMsg('설정 저장 중…'); try{ var r=await opsCall('fn_patch',{slug:OPS.fnSel, verify_jwt:OPS.fnVerify}); opsSetMsg(r.slug+' · Verify JWT '+(r.verify_jwt?'ON':'OFF')+' 저장됨','ok'); OPS.fnList=null; }catch(e){ opsSetMsg(String(e.message||e),'bad'); } };
}
async function opsFnDeploy(){
  if(!opsNeedPin() || OPS.busy) return;
  var slug=OPS.fnSel==='__new'? (OPS.fnNew||'') : OPS.fnSel;
  if(!/^[a-z0-9_-]{1,64}$/.test(slug)){ opsSetMsg('함수를 고르거나 새 이름(영문 소문자·숫자·-·_)을 입력하세요','bad'); return; }
  var code=(OPS.fnCode||'').trim(); if(code.length<20){ opsSetMsg('배포할 코드가 비어 있습니다','bad'); return; }
  if(!/Deno\.serve|serve\(/.test(code) && !confirm('코드에 Deno.serve(…) 가 보이지 않습니다. 그래도 배포할까요?')) return;
  var isNew=OPS.fnSel==='__new';
  if(!confirm((isNew? '새 함수 «'+slug+'» 를 만들어 배포합니다' : '«'+slug+'» 에 새 버전을 배포합니다')+'\n\n파일 '+(OPS.fnName||'index.ts')+' · '+code.length.toLocaleString('ko-KR')+'자 · Verify JWT '+(OPS.fnVerify?'ON':'OFF')+'\n\n계속할까요?')) return;
  OPS.busy=true; var bt=document.getElementById('opsFnDeploy'); if(bt) bt.disabled=true; opsSetMsg('배포 중… (30초쯤 걸릴 수 있음)');
  try{ var r=await opsCall('fn_deploy',{slug:slug, files:[{name:OPS.fnName||'index.ts', content:code}], verify_jwt:OPS.fnVerify, entrypoint_path:(OPS.fnMeta&&OPS.fnMeta.entrypoint_path)||undefined});
    opsSetMsg((r.created? '새 함수 생성·':'')+'배포 완료 — '+r.slug+' v'+r.version+' · Verify JWT '+(r.verify_jwt?'ON':'OFF')+' · '+r.url,'ok'); toast('Edge Function 배포 완료', r.slug+' v'+r.version);
    OPS.fnList=null; OPS.fnMeta=null; if(isNew){ OPS.fnSel=slug; OPS.fnNew=''; } renderOps(true); }
  catch(e){ opsSetMsg(String(e.message||e),'bad'); }
  OPS.busy=false; if(bt) bt.disabled=false;
}
/* ── 기록 ── */
/* ── AI 점검 (⑥ · ㊿+135): 대표 질문 15개를 실제 ask 함수에 보내고, 답에 포탈이 계산한 기대 값·단어가 들어 있는지 확인 — 배포·운영 › 기록 탭
   · 목적: 모델/함수 배포 뒤 «AI 가 여전히 숫자를 맞게 말하나»를 5분 안에 확인. 결과 요약은 change_log(ai_check)에 남겨 추이 비교.
   · 기대값은 buildDigest() 로 계산(답과 같은 데이터) — 숫자는 천원/백만원/억원 어느 표기든 인정. 질문 추가 = AI_CHECK_QS 에 한 줄 */
function aiHasNum(a, won){
  if(won==null || isNaN(won)) return true;
  var t=String(a||'').replace(/\s/g,''), cands=[];
  var k=Math.round(Number(won)/1000); cands.push(String(k), k.toLocaleString('ko-KR'));
  var mm=Math.round(Number(won)/1e6); if(mm>0) cands.push(mm+'백만', mm.toLocaleString('ko-KR')+'백만');
  var ek=Number(won)/1e8; if(ek>=0.1) cands.push(ek.toFixed(1)+'억', ek.toFixed(2)+'억', (Math.round(ek*10)/10)+'억');
  return cands.some(function(c){ return c && t.indexOf(c)>=0; });
}
function aiHasCount(a, n){ if(n==null) return true; var t=String(a||'').replace(/\s/g,''); if(n===0) return /없|0건|0곳|0개|않습니다/.test(t); return t.indexOf(String(n))>=0; }
var AI_CHECK_QS=[
  {q:'이번 달 MRR 얼마야?',                 l:'기준월 MRR 숫자',      exp:function(D,a){ return aiHasNum(a, D.기준월MRR); }},
  {q:'LIVE 고객사 몇 곳이야?',               l:'LIVE 고객사 수',       exp:function(D,a){ return aiHasCount(a, D.LIVE고객사수); }},
  {q:'서비스별 MRR 알려줘',                   l:'Cloud·MDR 언급',       exp:function(D,a){ return /cloud|클라우드|nac/i.test(a) && /mdr/i.test(a); }},
  {q:'상위 고객사 5곳 알려줘',                l:'1위 고객사 이름',      exp:function(D,a){ var t=(D.상위고객사15||[])[0]; var nm=t&&(t.고객사||t.cust||t.name||t[0]); return !nm || String(a).indexOf(String(nm).replace(/\(.*?\)/g,'').trim().slice(0,3))>=0; }},
  {q:'만기 지났는데 미처리인 계약 몇 건이야?', l:'미처리 건수',          exp:function(D,a){ var m=D.만기관리; return !m || aiHasCount(a, m.미처리_건수); }},
  {q:'이번 달 만기 계약 알려줘',              l:'이달 만기 건수',       exp:function(D,a){ var m=D.만기관리; return !m || aiHasCount(a, m.이달만기_건수); }},
  {q:'지난달 대비 LIVE 가 왜 바뀌었어?',       l:'증감 사유 단어',       exp:function(D,a){ return /신규|해지|만기|복귀|변화\s*없|같|동일|증감/.test(a); }},
  {q:'OI 파이프라인 어때?',                   l:'건수 + 가중 금액',     exp:function(D,a){ return !D.OI파이프라인 || (/건/.test(a) && /가중|기대|금액|원/.test(a)); }},
  {q:'해지 사유별로 몇 건이야?',              l:'해지 사유 이름',       exp:function(D,a){ var c=D.해지사유별건수||{}; var ks=Object.keys(c); return !ks.length || ks.some(function(k){ return String(a).indexOf(k)>=0; }); }},
  {q:'연도별 매출 추이 알려줘',               l:'연도 표기',            exp:function(D,a){ return /20\d{2}/.test(a); }},
  {q:'에스원 채널 MRR 은 얼마야?',            l:'에스원 언급 + 숫자',   exp:function(D,a){ return /에스원|S1/i.test(a) && /\d/.test(a); }},
  {q:'데이터 점검에서 바로 고칠 항목 몇 건이야?', l:'데이터 점검 건수',  exp:function(D,a){ var d=D.데이터점검; return !d || aiHasCount(a, d.바로고침); }},
  {q:'3개월 안에 만료되는 계약 뭐 있어?',      l:'월 표기',              exp:function(D,a){ return /\d{4}-\d{2}|\d+월|없/.test(a); }},
  {q:'MRR 성장률이 어때?',                   l:'퍼센트 표기',          exp:function(D,a){ return /%|퍼센트/.test(a); }},
  {q:'포탈에서 2단계 인증은 어떻게 켜?',       l:'사용법 안내(팀 지식)', exp:function(D,a){ return /내 계정|보안|인증 앱|2단계|OTP|Authenticator/i.test(a); }}
];
async function aiCheckRun(){
  if(OPS.aic && OPS.aic.running) return;
  var D; try{ D=buildDigest(); }catch(e){ opsSetMsg('요약(digest) 계산 실패: '+e.message,'bad'); return; }
  OPS.aic={running:true, rows:AI_CHECK_QS.map(function(x){ return {q:x.q, l:x.l, st:'대기'}; }), at:null}; renderOps(true);
  var i=0, t0=Date.now();
  async function worker(){
    while(i<AI_CHECK_QS.length){
      var k=i++, def=AI_CHECK_QS[k], row=OPS.aic.rows[k]; row.st='진행'; renderOps(true);
      var s0=Date.now();
      try{
        var r=await aiFetch({mode:'chat', question:def.q, digest:D, history:[]}, 60000);
        var text=String((r&&(r.text||r.answer))||'');
        row.ms=Date.now()-s0; row.model=(r&&r.model)||''; row.tools=(r&&r.queries&&r.queries.length)||0; row.cut=!!(r&&(r.cut||r.degraded)); row.text=text.replace(/\s+/g,' ').slice(0,160);
        row.ok=!!text && !!def.exp(D, text); row.st=row.ok? '통과' : (text? '기대값 없음' : '빈 답');
      }catch(e){ row.ms=Date.now()-s0; row.ok=false; row.st='오류'; row.text=String(e.message||e).slice(0,160); }
      renderOps(true);
    }
  }
  await Promise.all([worker(), worker(), worker()]);   // 동시 3개 — ask 함수 예산(78초) 안에서 15문이 2~3분
  OPS.aic.running=false; OPS.aic.at=new Date().toISOString(); OPS.aic.ms=Date.now()-t0;
  var pass=OPS.aic.rows.filter(function(r){ return r.ok; }).length, cut=OPS.aic.rows.filter(function(r){ return r.cut; }).length;
  OPS.aic.summary={pass:pass, total:OPS.aic.rows.length, avg_ms:Math.round(OPS.aic.rows.reduce(function(a,r){ return a+(r.ms||0); },0)/OPS.aic.rows.length), cut:cut, models:Array.from(new Set(OPS.aic.rows.map(function(r){ return r.model; }).filter(Boolean)))};
  try{ logChange('ai_check','ask',APP_VER,{pass:pass, total:OPS.aic.rows.length, avg_ms:OPS.aic.summary.avg_ms, cut:cut, fails:OPS.aic.rows.filter(function(r){ return !r.ok; }).map(function(r){ return r.q+' — '+r.st; })}); }catch(e){}
  toast('AI 점검 끝', pass+'/'+OPS.aic.rows.length+' 통과 · 평균 '+Math.round(OPS.aic.summary.avg_ms/1000)+'초', pass===OPS.aic.rows.length? 'ok':'warn');
  renderOps(true);
}
function aiCheckHtml(){
  var A=OPS.aic;
  var h='<div class="ops-h" style="display:flex;align-items:center;gap:10px;margin-top:14px">AI 점검 (대표 질문 15개 → ask 함수 → 기대값 확인) <button type="button" class="cbtn" id="opsAiCheck"'+(A&&A.running? ' disabled':'')+'>'+(A&&A.running? '점검 중…':'15문 점검 실행')+'</button>'+
    (A&&A.summary? '<span class="mini">'+A.summary.pass+'/'+A.summary.total+' 통과 · 평균 '+Math.round(A.summary.avg_ms/1000)+'초'+(A.summary.cut? ' · 예산 초과/축약 '+A.summary.cut:'')+(A.summary.models.length? ' · '+esc(A.summary.models.join(', ')):'')+' · '+esc(String(A.at||'').replace('T',' ').slice(0,16))+'</span><button type="button" class="cbtn" id="opsAiXlsx">엑셀</button>':'')+'</div>';
  if(!A) h+='<p class="mini" style="margin:0 0 14px">모델·함수 배포 뒤 «AI 가 여전히 숫자를 맞게 말하나»를 확인합니다 — 질문 15개를 동시 3개씩 보내 2~3분 걸리고, 요약은 변경 이력(ai_check)에 남습니다. 질문·기대값은 코드의 AI_CHECK_QS.</p>';
  else h+='<table class="rn-tbl" style="margin-bottom:14px"><thead><tr><th>#</th><th>질문</th><th>기대</th><th>결과</th><th class="n">시간</th><th>모델 · 도구</th><th>답(앞부분)</th></tr></thead><tbody>'+A.rows.map(function(r,i){
      var col=r.st==='통과'? 'var(--brand)' : r.st==='대기'||r.st==='진행'? 'var(--muted)' : 'var(--critical)';
      return '<tr><td class="mini">'+(i+1)+'</td><td>'+esc(r.q)+'</td><td class="mini">'+esc(r.l)+'</td><td style="color:'+col+'">'+(r.st==='통과'? '✓ 통과': r.st==='진행'? '⏳ 진행' : r.st==='대기'? '· 대기' : '✗ '+esc(r.st))+(r.cut? ' <span class="mini">(축약)</span>':'')+'</td><td class="n mini">'+(r.ms? (r.ms/1000).toFixed(1)+'s':'')+'</td><td class="mini">'+esc(r.model||'')+(r.tools? ' · 도구 '+r.tools:'')+'</td><td class="mini">'+esc(r.text||'')+'</td></tr>'; }).join('')+'</tbody></table>';
  return h;
}
function aiCheckBind(host){
  var b=host.querySelector('#opsAiCheck'); if(b) b.onclick=aiCheckRun;
  var x=host.querySelector('#opsAiXlsx'); if(x) x.onclick=function(){ var A=OPS.aic; if(!A) return; xlsxAoa('AI점검_'+String(A.at||'').slice(0,10), ['#','질문','기대','결과','시간(s)','모델','도구','답'], A.rows.map(function(r,i){ return [i+1, r.q, r.l, r.st, r.ms? +(r.ms/1000).toFixed(1):'', r.model||'', r.tools||0, r.text||'']; })); };
}
function opsLogHtml(){
  var st=OPS.st, L=(st&&st.ok&&st.recent)||[], H=OPS.health, E=OPS.errs;
  var h='<div class="ops-h" style="display:flex;align-items:center;gap:10px">시스템 점검 <button type="button" class="cbtn" id="opsHealth"'+(H&&H.running? ' disabled':'')+'>'+(H&&H.running? '점검 중…':'지금 점검')+'</button>'+(H&&H.at? '<span class="mini">'+esc(H.at.toLocaleTimeString('ko-KR'))+'</span>':'')+'</div>';
  if(H && H.rows.length) h+='<table class="rn-tbl" style="margin-bottom:14px"><tbody>'+H.rows.map(function(r){ return '<tr><td style="width:240px">'+esc(r.name)+'</td><td>'+(r.ok? '<span class="up">✓</span>':'<span style="color:var(--critical)">✗</span>')+' '+esc(r.info)+'</td><td class="n mini">'+r.ms+'ms</td></tr>'; }).join('')+'</tbody></table>';
  else h+='<p class="mini" style="margin:0 0 14px">Pages 최신 버전 · Supabase REST · AI · remind · ops · (PIN 있으면) 운영 DB · 서비스 워커를 순서대로 확인합니다.</p>';
  h+='<div class="ops-h" style="display:flex;align-items:center;gap:10px">브라우저 오류 (사용자 화면에서 난 JS 오류 · 최근 30건) <button type="button" class="cbtn" id="opsErrs">불러오기</button></div>';
  if(E===null) h+='<p class="mini" style="margin:0 0 14px">«불러오기»를 누르면 client_errors 표(SQL 86)를 읽습니다.</p>';
  else if(!E.length) h+='<p class="mini" style="margin:0 0 14px">기록된 오류가 없습니다 ✓</p>';
  else h+='<table class="rn-tbl" style="margin-bottom:14px"><thead><tr><th>일시</th><th>계정</th><th>버전</th><th>화면</th><th>오류</th><th class="n">반복</th></tr></thead><tbody>'+E.map(function(r){ return '<tr><td class="mini">'+esc(String(r.at||'').replace('T',' ').slice(0,19))+'</td><td class="mini">'+esc(r.email||'')+'</td><td class="mini">'+esc(String(r.ver||'').replace(/^.*\s/,''))+'</td><td>'+esc(r.view||'')+'</td><td title="'+esc(r.msg||'')+'">'+esc(String(r.msg||'')).slice(0,100)+'</td><td class="n">'+(r.n||1)+'</td></tr>'; }).join('')+'</tbody></table>';
  h+=aiCheckHtml();
  h+='<div class="ops-h">배포·운영 기록 (ops_log · 최근 30건)</div>';
  if(!st) h+='<p class="cap">상태 확인 중…</p>';
  else if(!st.ok) h+='<p class="cap" style="color:var(--critical)">'+esc(st.error||'')+'</p>';
  else if(!st.log_ok) h+='<p class="cap">기록표(ops_log · SQL 85)가 없거나 함수에 service role 이 없어 기록을 읽지 못합니다.</p>';
  else if(!L.length) h+='<p class="cap">아직 기록이 없습니다.</p>';
  else h+='<table class="rn-tbl"><thead><tr><th>일시</th><th>계정</th><th>동작</th><th>대상</th><th>요약</th><th>결과</th></tr></thead><tbody>'+L.map(function(r){ return '<tr><td class="mini">'+esc(String(r.at||'').replace('T',' ').slice(0,19))+'</td><td class="mini">'+esc(r.actor)+'</td><td><code>'+esc(r.action)+'</code></td><td>'+esc(r.target||'')+'</td><td title="'+esc(r.summary||'')+'">'+esc(String(r.summary||'')).slice(0,80)+'</td><td>'+(r.ok? '<span class="up">✓</span>'+(r.ms? ' <span class="mini">'+r.ms+'ms</span>':'') : '<span style="color:var(--critical)" title="'+esc(r.error||'')+'">✗ '+esc(String(r.error||'')).slice(0,60)+'</span>')+'</td></tr>'; }).join('')+'</tbody></table>';
  return h;
}
function opsLogBind(host){
  aiCheckBind(host);
  var hb=host.querySelector('#opsHealth'); if(hb) hb.onclick=opsHealth;
  var eb=host.querySelector('#opsErrs'); if(eb) eb.onclick=opsLoadErrors;
}

function renderAdmin(){
  if(!window.IS_SUPER){ switchView('dash'); return; }
  var rs=$('#axRole');
  if(!rs.options.length){
    rs.innerHTML='<option value="">권한 없음 (나중에 지정)</option>'+
      AX_ROLES.map(function(r){ return '<option value="'+r+'">'+r+' — '+AX_ROLE_KO[r]+'</option>'; }).join('');
    rs.value='viewer';
    $('#axReload').onclick=axLoad;
    $('#axQ').oninput=axPaint;
    $('#axCreate').onclick=axCreate;
    $('#abSave').onclick=abSave;
  }
  try{ apBind(); }catch(e){}
  try{ mfBind(); mfLoad(); }catch(e){}
  try{ cdBind(); cdLoad(); }catch(e){}
  axLoad();
  abLoad();
}
/* ── 메뉴 권한 (user_perms · SQL 79) — 계정마다 보기/읽기/쓰기, 슈퍼 관리자만 ── */
var AP={user:'', rows:{}, bound:false};
function apMenus(){
  var out=[], grp='';
  Array.prototype.forEach.call($('#side').children, function(el){
    if(el.classList && el.classList.contains('grp')){ grp=el.textContent.trim(); return; }
    if(el.tagName!=='BUTTON') return;
    var v=el.dataset.v; if(!v || PERM_EXEMPT[v] || el.id==='btnMenuEdit') return;
    out.push({grp:grp, v:v, label:navText(el)});
  });
  return out;
}
function apRoleOf(email){ var u=(AX_USERS||[]).filter(function(x){ return String(x.email||'').toLowerCase()===String(email||'').toLowerCase(); })[0]; return u? (u.role||'') : ''; }
function apDefault(role){ return (role==='admin_viewer'||role==='viewer')? {v:true,r:true,w:false} : {v:true,r:true,w:true}; }
function apFillUsers(){
  var sel=$('#apUser'), cp=$('#apCopy'); if(!sel) return;
  var cur=sel.value;
  var opts=(AX_USERS||[]).slice().sort(function(a,b){ return String(a.email||'').localeCompare(String(b.email||'')); })
    .map(function(u){ return '<option value="'+esc(u.email||'')+'">'+esc(u.email||'')+(u.role? ' — '+esc(AX_ROLE_KO[u.role]||u.role):' — 권한 없음')+'</option>'; }).join('');
  sel.innerHTML='<option value="">계정 선택…</option>'+opts; sel.value=cur;
  if(cp){ cp.innerHTML='<option value="">다른 계정 설정 복사…</option>'+opts; }
}
async function apFetch(email){
  var rows=await sbTry('user_perms?select=view,can_view,can_read,can_write&email=eq.'+encodeURIComponent(String(email).toLowerCase()));
  var m={}; (rows||[]).forEach(function(r){ m[r.view]={v:r.can_view!==false, r:r.can_read!==false, w:!!r.can_write}; });
  return {map:m, n:(rows||[]).length};
}
async function apLoadUser(email){
  AP.user=email; AP.rows={};
  var role=apRoleOf(email), d=apDefault(role);
  $('#apRole').textContent=email? ('역할: '+(AX_ROLE_KO[role]||role||'권한 없음')) : '';
  if(!email){ $('#apTable').innerHTML=''; return; }
  $('#apMsg').textContent='불러오는 중…';
  try{
    var got=await apFetch(email);
    apMenus().forEach(function(m){ AP.rows[m.v]=got.map[m.v]? got.map[m.v] : {v:d.v, r:d.r, w:d.w}; });
    $('#apMsg').textContent=got.n? got.n+'개 메뉴 지정됨' : '지정 없음 — 역할 기본값 표시';
  }catch(e){ $('#apMsg').textContent='읽기 실패: '+String(e.message||e).slice(0,100); apMenus().forEach(function(m){ AP.rows[m.v]={v:d.v,r:d.r,w:d.w}; }); }
  apPaint();
}
function apSet(v,k,on){
  var p=AP.rows[v]||{v:true,r:true,w:false};
  if(k==='v'){ p.v=on; if(!on){ p.r=false; p.w=false; } }
  if(k==='r'){ p.r=on; if(on) p.v=true; else p.w=false; }
  if(k==='w'){ p.w=on; if(on){ p.r=true; p.v=true; } }
  AP.rows[v]=p;
}
function apPaint(){
  var t=$('#apTable'); if(!t) return;
  var role=apRoleOf(AP.user), isSuper=role==='super_admin', roleRO=(role==='admin_viewer'||role==='viewer'), limited=ROLE_VIEWS[role]||null;
  var menus=apMenus(), grp='';
  var h='<thead><tr><th>메뉴</th><th style="width:90px;text-align:center">보기</th><th style="width:90px;text-align:center">읽기</th><th style="width:90px;text-align:center">쓰기</th><th></th></tr></thead><tbody>';
  menus.forEach(function(m){
    if(m.grp!==grp){ grp=m.grp; h+='<tr><td colspan="5" style="background:var(--surface-2);font-size:11px;font-weight:650;color:var(--ink-2);padding:6px 10px">'+esc(grp||'기타')+'</td></tr>'; }
    var p=AP.rows[m.v]||{v:true,r:true,w:false};
    var na=limited && !limited[m.v];             // 제한 역할(poc·장비)은 역할에 없는 메뉴 자체가 없음
    var dis=isSuper||na;
    function cb(k,on,disabled){ return '<td style="text-align:center"><input type="checkbox" data-ap="'+k+'" data-v="'+esc(m.v)+'"'+(on?' checked':'')+(disabled?' disabled':'')+' style="width:16px;height:16px"></td>'; }
    h+='<tr'+(na?' style="opacity:.45"':'')+'><td>'+esc(m.label)+'</td>'+
      cb('v', isSuper||(!na&&p.v), dis)+cb('r', isSuper||(!na&&p.r), dis)+cb('w', isSuper||(!na&&p.w), dis||roleRO)+
      '<td class="mini">'+(isSuper? '슈퍼 관리자 — 제한 불가' : na? '역할('+esc(AX_ROLE_KO[role]||role)+')에 없는 메뉴' : roleRO&&p.r? '조회 전용 역할 — 쓰기 불가' : (!p.v? '숨김' : !p.r? '메뉴만 보임' : !p.w? '읽기만' : ''))+'</td></tr>';
  });
  h+='</tbody>';
  t.innerHTML=h;
  t.querySelectorAll('input[data-ap]').forEach(function(inp){ inp.onchange=function(){ apSet(inp.dataset.v, inp.dataset.ap, inp.checked); apPaint(); }; });
}
function apPreset(mode){
  if(!AP.user) return;
  var role=apRoleOf(AP.user), roleRO=(role==='admin_viewer'||role==='viewer');
  apMenus().forEach(function(m){ AP.rows[m.v]= mode==='all'? {v:true,r:true,w:!roleRO} : mode==='read'? {v:true,r:true,w:false} : {v:false,r:false,w:false}; });
  apPaint();
}
async function apSave(){
  if(!AP.user){ toast('계정을 먼저 고르세요','','bad'); return; }
  var role=apRoleOf(AP.user); if(role==='super_admin'){ toast('슈퍼 관리자는 제한할 수 없습니다','','info'); return; }
  var now=new Date().toISOString(), em=String(AP.user).toLowerCase();
  var rows=apMenus().map(function(m){ var p=AP.rows[m.v]||{v:true,r:true,w:false}; return {email:em, view:m.v, can_view:!!p.v, can_read:!!(p.v&&p.r), can_write:!!(p.v&&p.r&&p.w), updated_by:AUTH_USER||null, updated_at:now}; });
  var b=$('#apSave'); b.disabled=true; $('#apMsg').textContent='저장 중…';
  try{
    await sbWrite('POST','user_perms?on_conflict=email,view', rows, 'resolution=merge-duplicates,return=minimal');
    try{ logChange('perms','user_perms',null,{email:em, n:rows.length, hidden:rows.filter(function(r){ return !r.can_view; }).map(function(r){ return r.view; }), readonly:rows.filter(function(r){ return r.can_view&&!r.can_write; }).map(function(r){ return r.view; })}); }catch(e){}
    $('#apMsg').textContent='저장됨 — '+em+' 은 다음에 화면을 새로 읽을 때 적용';
    toast('메뉴 권한 저장', em, 'ok');
    if(em===String(AUTH_USER||'').toLowerCase()){ await loadPerms(); applyPerms(); }
  }catch(e){ $('#apMsg').textContent=String(e.message||e).slice(0,160); toast('저장 실패', String(e.message||e).slice(0,120), 'bad'); }
  b.disabled=false;
}
function apBind(){
  if(AP.bound) return; AP.bound=true;
  $('#apUser').onchange=function(){ apLoadUser(this.value); };
  $('#apAll').onclick=function(){ apPreset('all'); };
  $('#apRead').onclick=function(){ apPreset('read'); };
  $('#apNone').onclick=function(){ apPreset('none'); };
  $('#apSave').onclick=apSave;
  $('#apCopy').onchange=async function(){ var src=this.value; this.value=''; if(!src||!AP.user) return; if(src.toLowerCase()===String(AP.user).toLowerCase()) return;
    try{ var got=await apFetch(src); var d=apDefault(apRoleOf(src)); apMenus().forEach(function(m){ AP.rows[m.v]=got.map[m.v]? got.map[m.v] : {v:d.v,r:d.r,w:d.w}; }); apPaint(); $('#apMsg').textContent=src+' 설정을 가져왔습니다 — 저장을 눌러야 반영'; }
    catch(e){ toast('복사 실패', String(e.message||e).slice(0,100), 'bad'); } };
}

/* ── AI 사용 비용 (Anthropic Cost API + 충전액 기준 잔여 추정) ── */
async function abLoad(){
  var kpi=$('#axBillKpi'), bars=$('#axBillBars');
  kpi.innerHTML='<div class="cap">AI 사용 비용을 불러오는 중…</div>'; bars.innerHTML='';
  var bill=null;
  try{ var rows=await sbTry('ai_billing?select=*'); bill=(rows&&rows[0])||null; }catch(e){}
  if(bill){
    if(!$('#abCredit').value && bill.credit_usd) $('#abCredit').value=bill.credit_usd;
    if(!$('#abDate').value && bill.baseline) $('#abDate').value=String(bill.baseline).slice(0,10);
  }
  var from=(bill&&bill.baseline)? String(bill.baseline).slice(0,10) : todayStr(new Date(Date.now()-29*864e5));
  var r;
  try{ r=await adminFetch({action:'ai_cost', from:from}); }
  catch(e){ kpi.innerHTML='<div class="cap">⚠ '+esc(String(e.message||e))+'</div>'; return; }
  var credit=bill? Number(bill.credit_usd)||0 : 0;
  var remain=credit? Math.round((credit-r.total_usd)*100)/100 : null;
  function box(l,v,s,warn){
    return '<div class="kpi'+(warn?'':'')+'" style="padding:11px 14px"><div style="font-size:11px;color:var(--muted);font-weight:650">'+l+'</div>'+
      '<div style="font-size:19px;font-weight:800;margin-top:2px'+(warn?';color:var(--critical)':'')+'">'+v+'</div>'+
      '<div style="font-size:10.5px;color:var(--muted)">'+s+'</div></div>';
  }
  kpi.innerHTML=
    box('잔여 크레딧 (추정)', remain==null?'충전액 미입력':'$'+remain.toLocaleString('en-US'),
        remain==null?'아래에 충전액·충전일을 입력하세요':'충전액 $'+credit+' − 사용 $'+r.total_usd, remain!=null&&remain<5)+
    box('이번 달 사용액','$'+Number(r.month_usd).toLocaleString('en-US'), thisMonthStr()+' 실측 (Cost API)')+
    box('기준일 이후 사용액','$'+Number(r.total_usd).toLocaleString('en-US'), r.from+' 부터 누적')+
    (r.partial? '<div class="cap" style="grid-column:1/-1;color:var(--warning,#a06c00)">⚠ 일부 기간만 집계됐습니다 — '+esc(String(r.partial))+'</div>':'');
  var mx=0.01; (r.daily||[]).forEach(function(d){ mx=Math.max(mx,d.usd); });
  bars.innerHTML=(r.daily&&r.daily.length)?
    '<div class="mini" style="margin-bottom:4px">최근 14일 일별 사용액</div>'+
    '<div style="display:flex;align-items:flex-end;gap:3px;height:52px">'+
    r.daily.map(function(d){
      return '<div title="'+d.d+' · $'+d.usd+'" style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:2px">'+
        '<div style="width:100%;border-radius:3px 3px 0 0;background:var(--brand);height:'+Math.max(2,Math.round(d.usd/mx*40))+'px"></div>'+
        '<span style="font-size:8.5px;color:var(--muted)">'+d.d.slice(8)+'</span></div>';
    }).join('')+'</div>' : '';
}
async function abSave(){
  var c=+$('#abCredit').value||0, d=$('#abDate').value, m=$('#abMsg');
  if(!d){ m.textContent='충전일을 입력하세요'; return; }
  m.textContent='저장 중…';
  try{
    await sbWrite('PATCH','ai_billing?id=eq.1',{credit_usd:c, baseline:d, updated_at:new Date().toISOString()});
    m.textContent='저장됨';
    abLoad();
  }catch(e){ m.textContent=String(e.message||e).slice(0,80); }
}
/* ── 2단계 인증 정책 (mfa_policy · SQL 89) — 슈퍼 관리자가 계정별 필수·기한 지정, 인증 앱 초기화 ── */
var MF={rows:null, bound:false};
function mfMsg(t,bad){ var e=$('#mfMsg'); if(e){ e.textContent=t||''; e.style.color=bad? 'var(--critical)':''; } }
async function mfLoad(){
  mfMsg('불러오는 중…');
  try{ MF.rows=await sbWrite('POST','rpc/mfa_admin_list',{})||[]; mfMsg(MF.rows.length+'개 계정 · 등록 '+MF.rows.filter(function(r){ return r.enrolled; }).length+' · 필수 '+MF.rows.filter(function(r){ return r.required; }).length); mfPaint(); }
  catch(e){ MF.rows=null; var m=String(e.message||e); mfMsg(/mfa_admin_list|404|schema cache/i.test(m)? 'SQL 89 가 아직 실행되지 않았습니다 (배포·운영 › SQL 탭에서 sql89 실행)' : m.slice(0,120), true); $('#mfTable').innerHTML=''; }
}
function mfPaint(){
  var t=$('#mfTable'); if(!t||!MF.rows) return;
  t.innerHTML='<thead><tr><th>이메일</th><th>권한</th><th>인증 앱</th><th style="width:60px">필수</th><th style="width:150px">기한</th><th>메모</th><th class="act" style="width:220px"></th></tr></thead>';
  var tb=document.createElement('tbody');
  MF.rows.forEach(function(r){
    var tr=document.createElement('tr'); var me=(r.email||'').toLowerCase()===(AUTH_USER||'').toLowerCase();
    var due=r.required && !r.enrolled && (!r.deadline || r.deadline<=new Date().toISOString().slice(0,10));
    tr.innerHTML='<td>'+esc(r.email||'')+(me? ' <span class="mini" style="opacity:.6">(나)</span>':'')+'</td>'+
      '<td class="mini">'+esc(AX_ROLE_KO[r.role]||r.role||'권한 없음')+'</td>'+
      '<td>'+(r.enrolled? '<span style="color:var(--brand)">✓ 등록</span> <span class="mini">'+esc(String(r.factor_at||'').slice(0,10))+'</span>' : (r.required? '<span style="color:'+(due? 'var(--critical)':'var(--s3,#b26a00)')+'">'+(due? '미등록 · 차단 중':'미등록 · 유예')+'</span>' : '<span class="mini">미등록</span>'))+'</td>'+
      '<td><input type="checkbox" data-mf-req="'+esc(r.email)+'"'+(r.required?' checked':'')+'></td>'+
      '<td><input type="date" data-mf-dl="'+esc(r.email)+'" value="'+esc(r.deadline||'')+'"'+(r.required?'':' disabled')+' style="height:30px;width:140px"></td>'+
      '<td><input data-mf-note="'+esc(r.email)+'" value="'+esc(r.note||'')+'" placeholder="메모" style="height:30px;width:100%;min-width:90px"></td>'+
      '<td class="act"><button type="button" class="cbtn pri" data-mf-save="'+esc(r.email)+'">저장</button>'+(r.enrolled? ' <button type="button" class="cbtn" data-mf-reset="'+esc(r.email)+'" title="폰 분실 등 — 이 계정의 인증 앱 등록을 지웁니다">인증 앱 초기화</button>':'')+'</td>';
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  t.querySelectorAll('[data-mf-req]').forEach(function(c){ c.onchange=function(){ var d=t.querySelector('[data-mf-dl="'+CSS.escape(c.dataset.mfReq)+'"]'); if(d){ d.disabled=!c.checked; if(c.checked && !d.value) d.value=mfPlus(7); } }; });
  t.querySelectorAll('[data-mf-save]').forEach(function(b){ b.onclick=function(){ mfSave(b.dataset.mfSave); }; });
  t.querySelectorAll('[data-mf-reset]').forEach(function(b){ b.onclick=function(){ mfReset(b.dataset.mfReset); }; });
}
function mfPlus(days){ var d=new Date(); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); }
async function mfSave(email){
  var t=$('#mfTable'); var q=function(sel){ return t.querySelector('['+sel+'="'+CSS.escape(email)+'"]'); };
  var req=q('data-mf-req').checked, dl=q('data-mf-dl').value||null, note=q('data-mf-note').value.trim()||null;
  if(req && !dl && !confirm(email+' 을(를) 기한 없이 «즉시 필수»로 지정합니다 — 다음 로그인부터 인증 앱을 등록해야 들어올 수 있습니다. 계속할까요?')) return;
  mfMsg('저장 중…');
  try{ await sbWrite('POST','rpc/mfa_admin_set',{p_email:email, p_required:req, p_deadline:req? dl:null, p_note:note}); toast('2단계 인증 정책 저장', email+' · '+(req? ('필수'+(dl? ' · 기한 '+dl:' · 즉시')):'선택')); mfLoad(); }
  catch(e){ mfMsg(String(e.message||e).slice(0,120), true); }
}
async function mfReset(email){
  if(!confirm(email+' 의 인증 앱 등록을 지웁니다. 다음 로그인은 비밀번호만으로 되고(필수 지정이면 다시 등록 화면), 본인에게 알려 주세요. 계속할까요?')) return;
  mfMsg('초기화 중…');
  try{ var r=await sbWrite('POST','rpc/mfa_admin_reset',{p_email:email}); toast('인증 앱 초기화', email+' · 삭제 '+(r&&r.deleted!=null? r.deleted:'')+'건', 'warn'); mfLoad(); }
  catch(e){ mfMsg(String(e.message||e).slice(0,120), true); }
}
async function mfAll(){
  if(!MF.rows) return; var targets=MF.rows.filter(function(r){ return !r.enrolled && !r.required; });
  if(!targets.length){ mfMsg('지정할 계정이 없습니다 (전부 등록됐거나 이미 필수)'); return; }
  var dl=mfPlus(7);
  if(!confirm(targets.length+'개 계정을 2단계 인증 필수로 지정합니다 (기한 '+dl+' · 그때까지는 안내만, 지나면 등록 화면).\n\n'+targets.map(function(r){ return '· '+r.email; }).join('\n'))) return;
  mfMsg('지정 중…'); var n=0;
  for(var i=0;i<targets.length;i++){ try{ await sbWrite('POST','rpc/mfa_admin_set',{p_email:targets[i].email, p_required:true, p_deadline:dl, p_note:'전체 지정'}); n++; }catch(e){} }
  toast('2단계 인증 전체 지정', n+'개 계정 · 기한 '+dl); mfLoad();
}
function mfBind(){ if(MF.bound) return; MF.bound=true; var r=$('#mfReload'); if(r) r.onclick=mfLoad; var a=$('#mfAll'); if(a) a.onclick=mfAll; }
/* ===== 관리자 › 코드 관리 (code_lists · SQL 93 · ㊿+137) — 선택 목록을 한 곳에서 추가·숨김·순서 =====
   저장은 code_lists 표에 직접(RLS: super_admin). 저장 뒤 loadCodes() 로 전역 *_OPTS 배열을 갱신 → 열린 표·폼에 즉시 반영. 다른 사용자는 다음 데이터 로드부터. */
var CD={kind:'contract_status', rows:null, bound:false, showOff:false};
function cdMsg(t,bad){ var e=$('#cdMsg'); if(e){ e.textContent=t||''; e.style.color=bad? 'var(--critical,#d03b3b)':''; } }
function cdBind(){
  if(CD.bound) return; CD.bound=true;
  var k=$('#cdKind'); if(k){ k.innerHTML=Object.keys(CODE_KIND).map(function(kind){ return '<option value="'+kind+'">'+esc(CODE_KIND_LABEL[kind]||kind)+'</option>'; }).join(''); k.value=CD.kind; k.onchange=function(){ CD.kind=k.value; cdPaint(); }; }
  var r=$('#cdReload'); if(r) r.onclick=cdLoad;
  var so=$('#cdShowOff'); if(so) so.onchange=function(){ CD.showOff=so.checked; cdPaint(); };
  var a=$('#cdAdd'); if(a) a.onclick=cdAdd;
  var nv=$('#cdNewVal'); if(nv) nv.onkeydown=function(e){ if(e.key==='Enter'){ e.preventDefault(); cdAdd(); } };
}
async function cdLoad(){
  cdMsg('불러오는 중…');
  var rows=await sbTry('code_lists?select=kind,value,label,sort,active,note,updated_by,updated_at&order=kind,sort,value');
  if(!rows || !rows.length){ CD.rows=null; cdMsg('SQL 93 이 아직 실행되지 않았습니다 (배포·운영 › SQL 탭에서 sql93 실행) — 그동안은 포탈 코드의 기본 목록을 씁니다', true); $('#cdTable').innerHTML=''; return; }
  CD.rows=rows; var m={}; rows.forEach(function(r){ (m[r.kind]=m[r.kind]||[]).push(r); }); CODES=m; try{ sessionStorage.setItem('svc_codes', JSON.stringify(m)); }catch(e){} applyCodes();
  cdMsg(rows.length+'개 값 · '+Object.keys(m).length+'개 목록'); cdPaint();
}
function cdPaint(){
  var t=$('#cdTable'); if(!t||!CD.rows) return;
  var list=CD.rows.filter(function(r){ return r.kind===CD.kind && (CD.showOff || r.active!==false); }).sort(function(a,b){ return (a.sort||0)-(b.sort||0) || String(a.value).localeCompare(String(b.value)); });
  var note=CODE_KIND_NOTE[CD.kind]; var cap=$('#cdCap'); if(cap){ var w=cap.querySelector('.cd-warn'); if(w) w.remove(); if(note){ var sp=document.createElement('div'); sp.className='cd-warn'; sp.style.cssText='margin-top:6px;color:var(--s3,#8a5200)'; sp.textContent='⚠ '+note; cap.appendChild(sp); } }
  t.innerHTML='<thead><tr><th style="width:40px">순서</th><th>값</th><th>표시 이름</th><th>메모</th><th style="width:70px">상태</th><th class="mini">수정</th><th class="act" style="width:170px"></th></tr></thead>';
  var tb=document.createElement('tbody');
  if(!list.length){ var tr0=document.createElement('tr'); tr0.innerHTML='<td colspan="7" class="mini" style="padding:14px">값이 없습니다 — 아래에서 추가하세요'+(CD.showOff? '':' (숨긴 값은 «숨긴 값도 보기»)')+'</td>'; tb.appendChild(tr0); }
  list.forEach(function(r,i){
    var tr=document.createElement('tr'); if(r.active===false) tr.style.opacity='.55';
    var nUse=cdUsage(CD.kind, r.value);
    tr.innerHTML='<td class="mini">'+(i+1)+'</td>'+
      '<td><b>'+esc(r.value)+'</b>'+(nUse!=null? ' <span class="mini" style="opacity:.7">· '+nUse+'행</span>':'')+'</td>'+
      '<td><input data-cd-label="'+esc(r.value)+'" value="'+esc(r.label||'')+'" placeholder="(값 그대로)" style="height:30px;width:100%;min-width:90px"></td>'+
      '<td><input data-cd-note="'+esc(r.value)+'" value="'+esc(r.note||'')+'" placeholder="메모" style="height:30px;width:100%;min-width:90px"></td>'+
      '<td>'+(r.active===false? '<span class="mini">숨김</span>':'<span style="color:var(--brand)">사용</span>')+'</td>'+
      '<td class="mini">'+esc(String(r.updated_at||'').slice(0,10))+(r.updated_by? '<br>'+esc(r.updated_by):'')+'</td>'+
      '<td class="act"><button type="button" class="cbtn" data-cd-up="'+esc(r.value)+'" title="위로"'+(i===0? ' disabled':'')+'>↑</button> <button type="button" class="cbtn" data-cd-down="'+esc(r.value)+'" title="아래로"'+(i===list.length-1? ' disabled':'')+'>↓</button> '+
        '<button type="button" class="cbtn pri" data-cd-save="'+esc(r.value)+'">저장</button> '+
        '<button type="button" class="cbtn" data-cd-tog="'+esc(r.value)+'">'+(r.active===false? '켜기':'숨기기')+'</button></td>';
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  t.querySelectorAll('[data-cd-save]').forEach(function(b){ b.onclick=function(){ cdSave(b.dataset.cdSave); }; });
  t.querySelectorAll('[data-cd-tog]').forEach(function(b){ b.onclick=function(){ cdToggle(b.dataset.cdTog); }; });
  t.querySelectorAll('[data-cd-up]').forEach(function(b){ b.onclick=function(){ cdMove(b.dataset.cdUp, -1, list); }; });
  t.querySelectorAll('[data-cd-down]').forEach(function(b){ b.onclick=function(){ cdMove(b.dataset.cdDown, 1, list); }; });
}
/* 메모리 데이터에서 그 값을 쓰는 행 수(참고용 · 표에 있는 종류만) */
function cdUsage(kind, v){
  var R=window.RAWX||{}; var f={contract_status:['contracts','status'], contract_type:['contracts','contract_type'], channel:['contracts','channel'], line:['contracts','line'], lead_src:['contracts','lead_src'], live_override:['contracts','live_override'], billing:['contracts','billing'], version:['contracts','version'],
    order_status:['orders','status'], order_channel:['orders','channel'], model:['orders','model'], industry:['customers','industry']}[kind];
  if(!f || !R[f[0]]) return null; return R[f[0]].filter(function(r){ return r[f[1]]===v; }).length;
}
function cdRow(v){ return (CD.rows||[]).filter(function(r){ return r.kind===CD.kind && r.value===v; })[0]; }
async function cdPatch(v, patch, okMsg){
  cdMsg('저장 중…');
  try{
    patch.updated_by=AUTH_USER||null; patch.updated_at=new Date().toISOString();
    await sbWrite('PATCH','code_lists?kind=eq.'+encodeURIComponent(CD.kind)+'&value=eq.'+encodeURIComponent(v), patch);
    await logChange('code_'+(patch.active===false? 'hide': patch.active===true? 'show':'edit'),'code_lists',CD.kind+':'+v, patch);
    if(okMsg) toast('코드 관리', okMsg); await cdLoad();
  }catch(e){ cdMsg(String(e.message||e).slice(0,140), true); }
}
function cdSave(v){ var t=$('#cdTable'); var q=function(a){ var e=t.querySelector('['+a+'="'+CSS.escape(v)+'"]'); return e? e.value.trim():''; }; cdPatch(v, {label:q('data-cd-label')||null, note:q('data-cd-note')||null}, CODE_KIND_LABEL[CD.kind]+' «'+v+'» 저장'); }
function cdToggle(v){
  var r=cdRow(v); if(!r) return; var off=r.active!==false;
  if(off){ var n=cdUsage(CD.kind, v); if(!confirm('«'+v+'» 를 숨깁니다 — 새 입력에서 고를 수 없고 데이터 점검이 «목록에 없는 값»으로 표시합니다.'+(n? ' 지금 이 값인 행 '+n+'개는 그대로 둡니다.':'')+' 계속할까요?')) return; }
  cdPatch(v, {active:!off}, '«'+v+'» '+(off? '숨김':'사용'));
}
async function cdMove(v, dir, list){
  var i=list.findIndex(function(r){ return r.value===v; }); var j=i+dir; if(i<0||j<0||j>=list.length) return;
  var a=list[i], b=list[j], sa=a.sort||0, sb=b.sort||0; if(sa===sb){ sb=sa+dir; }   // 같은 순서값이면 하나를 밀어 구분
  cdMsg('순서 바꾸는 중…');
  try{
    await sbWrite('PATCH','code_lists?kind=eq.'+encodeURIComponent(CD.kind)+'&value=eq.'+encodeURIComponent(a.value), {sort:sb});
    await sbWrite('PATCH','code_lists?kind=eq.'+encodeURIComponent(CD.kind)+'&value=eq.'+encodeURIComponent(b.value), {sort:sa});
    await cdLoad();
  }catch(e){ cdMsg(String(e.message||e).slice(0,140), true); }
}
async function cdAdd(){
  var v=($('#cdNewVal').value||'').trim(), label=($('#cdNewLabel').value||'').trim()||null, note=($('#cdNewNote').value||'').trim()||null;
  if(!v){ cdMsg('값을 입력하세요', true); $('#cdNewVal').focus(); return; }
  if(cdRow(v)){ cdMsg('이미 있는 값입니다'+(cdRow(v).active===false? ' (숨김 상태 — «켜기»)':''), true); return; }
  if(CODE_KIND_NOTE[CD.kind] && !confirm('⚠ '+CODE_KIND_NOTE[CD.kind]+'\n\n«'+v+'» 를 그래도 추가할까요? (저장은 되지만 화면 로직은 이 값을 모를 수 있습니다)')) return;
  var maxSort=(CD.rows||[]).filter(function(r){ return r.kind===CD.kind; }).reduce(function(m,r){ return Math.max(m, r.sort||0); }, 0);
  cdMsg('추가 중…');
  try{
    await sbWrite('POST','code_lists', {kind:CD.kind, value:v, label:label, note:note, sort:maxSort+1, active:true, updated_by:AUTH_USER||null});
    await logChange('code_add','code_lists',CD.kind+':'+v, {label:label, note:note});
    $('#cdNewVal').value=''; $('#cdNewLabel').value=''; $('#cdNewNote').value='';
    toast('코드 추가', CODE_KIND_LABEL[CD.kind]+' «'+v+'»'); await cdLoad();
  }catch(e){ cdMsg(String(e.message||e).slice(0,140), true); }
}
async function axLoad(){
  axMsg('불러오는 중…');
  try{
    AX_USERS=await sbWrite('POST','rpc/admin_list_users',{})||[];
    axMsg(AX_USERS.length+'개 계정');
    axPaint();
    try{ apFillUsers(); }catch(e){}
  }catch(e){ axMsg(String(e.message||e).slice(0,120),1); $('#axTable').innerHTML=''; }
}
function axPaint(){
  var q=($('#axQ').value||'').trim().toLowerCase();
  var rows=AX_USERS.filter(function(u){ return !q || String(u.email||'').toLowerCase().indexOf(q)>=0; });
  var t=$('#axTable');
  t.innerHTML='<thead><tr><th>이메일</th><th>권한</th><th>마지막 로그인</th><th>생성일</th><th class="act" style="width:170px"></th></tr></thead>';
  var tb=document.createElement('tbody');
  rows.forEach(function(u){
    var tr=document.createElement('tr');
    var me=(u.email||'').toLowerCase()===(AUTH_USER||'').toLowerCase();
    var sel='<select data-ax="'+esc(u.email)+'" style="height:30px;padding:0 8px;border-radius:8px;'+
      'border:1px solid var(--ring);background:var(--surface-2);color:var(--ink);font-family:inherit;font-size:12px"'+
      (me?' disabled title="본인 권한은 여기서 바꿀 수 없습니다"':'')+'>'+
      '<option value="">— 권한 없음 —</option>'+
      AX_ROLES.map(function(r){ return '<option value="'+r+'"'+(u.role===r?' selected':'')+'>'+r+'</option>'; }).join('')+
      '</select>';
    tr.innerHTML='<td>'+esc(u.email||'')+(me?' <span class="mini" style="opacity:.6">(나)</span>':'')+'</td>'+
      '<td>'+sel+'</td>'+
      '<td class="mini">'+esc(axTime(u.last_sign_in))+'</td>'+
      '<td class="mini">'+esc(axTime(u.created_at).slice(0,10))+'</td>'+
      '<td class="act"></td>';
    var act=tr.lastChild;
    var bp=document.createElement('button'); bp.textContent='비번 초기화';
    bp.onclick=function(){ axResetPw(u.email); };
    act.appendChild(bp);
    if(!me){
      var bd=document.createElement('button'); bd.textContent='🗑'; bd.className='dl'; bd.title='계정 삭제';
      bd.onclick=function(){ axDelete(u.email); };
      act.appendChild(bd);
    }
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  t.querySelectorAll('select[data-ax]').forEach(function(sel){
    sel.onchange=function(){
      var em=this.dataset.ax, v=this.value, that=this;
      var u0=AX_USERS.filter(function(x){return x.email===em;})[0];
      var before=(u0&&u0.role)||'권한 없음', after=v||'권한 없음';
      if(!confirm('권한을 변경할까요?\n\n'+em+'\n'+before+' → '+after)){
        that.value=(u0&&u0.role)||'';                 // 취소 → 원래 값으로 복귀
        axMsg('변경 취소');
        return;
      }
      axMsg('변경 중…');
      var call=v? sbWrite('POST','rpc/admin_set_role',{target_email:em,new_role:v})
                : sbWrite('POST','rpc/admin_clear_role',{target_email:em});
      call.then(function(out){
        axMsg(String(out||'완료'));
        toast('권한 변경', em+' → '+(v||'권한 없음'),'info');
        var u=AX_USERS.filter(function(x){return x.email===em;})[0]; if(u) u.role=v||null;
      }).catch(function(e){
        axMsg(String(e.message||e).slice(0,140),1);
        var u=AX_USERS.filter(function(x){return x.email===em;})[0];
        that.value=(u&&u.role)||'';
      });
    };
  });
}
async function axCreate(){
  var em=$('#axEmail').value.trim().toLowerCase(), pw=$('#axPw').value, role=$('#axRole').value;
  if(!em || pw.length<6){ axMsg('이메일과 6자 이상 비밀번호를 입력하세요',1); return; }
  var btn=$('#axCreate'); btn.disabled=true; axMsg('계정 생성 중…');
  try{
    var out=await adminFetch({action:'create_user', email:em, password:pw, role:role||''});
    toast('계정 생성', out.msg,'info');
    $('#axEmail').value=''; $('#axPw').value='';
    await axLoad();
  }catch(e){ axMsg(String(e.message||e).slice(0,140),1); }
  btn.disabled=false;
}
async function axResetPw(em){
  var pw=prompt(em+' 의 새 비밀번호 (6자 이상):');
  if(pw==null) return;
  if(String(pw).length<6){ axMsg('6자 이상이어야 합니다',1); return; }
  axMsg('변경 중…');
  try{
    var out=await adminFetch({action:'reset_password', email:em, password:pw});
    axMsg(out.msg); toast('비밀번호 초기화', em,'info');
  }catch(e){ axMsg(String(e.message||e).slice(0,140),1); }
}
async function axDelete(em){
  if(!confirm(em+' 계정을 삭제할까요?\n로그인이 즉시 막히고 되돌릴 수 없습니다.')) return;
  axMsg('삭제 중…');
  try{
    var out=await adminFetch({action:'delete_user', email:em});
    axMsg(out.msg); toast('계정 삭제', em,'info');
    await axLoad();
  }catch(e){ axMsg(String(e.message||e).slice(0,140),1); }
}

/* ---- 내 계정 ---- */
var ROLE_INFO={
  super_admin:  ['슈퍼 관리자','포탈의 모든 기능을 사용합니다 — 전체 데이터 조회·수정, 계정·권한 관리, 가격표 새 판 등록, 변경 이력, AI 사용 비용 확인까지.'],
  admin:        ['관리자','모든 화면을 조회하고 수정할 수 있습니다 (계약·장비·OI·주간회의 메모 등). 계정 관리와 변경 이력은 슈퍼 관리자 전용입니다.'],
  admin_viewer: ['관리자 — 조회 전용','모든 화면을 볼 수 있지만 어떤 데이터도 수정할 수 없습니다.'],
  poc:          ['PoC 전용','PoC 신청·운영 현황과 주간회의만 사용할 수 있고, 매출 데이터에는 접근할 수 없습니다.'],
  equipment_poc:['장비·PoC 전용','임대 장비(신청·내역·현황), PoC, 주간회의만 사용할 수 있고 매출 데이터에는 접근할 수 없습니다.'],
  /* (구) 역할 — 46단계 실행 전 임시 표시용 */
  editor:    ['(구) 편집자','admin 으로 통합 예정입니다.'],
  viewer:    ['(구) 조회 전용','admin_viewer 로 통합 예정입니다.'],
  equipment: ['(구) 장비 전용','equipment_poc 로 통합 예정입니다.']
};
async function renderAccount(){
  var box=$('#accBody');
  if(!SB_TOKEN){
    box.innerHTML='<p class="cap">로그인이 필요합니다.</p>';
    var lb=document.createElement('button'); lb.className='pill'; lb.textContent='로그인';
    lb.onclick=function(){ openOvl('ovlAuth'); };
    box.appendChild(lb); return;
  }
  box.innerHTML='<p class="cap">불러오는 중…</p>';
  var role=null;
  try{
    var rr=await sbTry('user_roles?select=role&email=eq.'+encodeURIComponent(AUTH_USER||''));
    if(rr && rr.length) role=rr[0].role;
  }catch(e){}
  var ri=ROLE_INFO[role]||['기본 (역할 미지정)','역할이 지정되지 않아 기본 권한으로 동작합니다. 관리자에게 문의하세요.'];
  var sessTxt='로그인 유지 켜짐 · 만료 시 자동 갱신';
  try{
    var s0=sessRead();
    if(s0 && s0.e) sessTxt='로그인 유지 켜짐 · 현재 토큰 만료 '+new Date(s0.e*1000).toLocaleString('ko-KR')+' (자동 갱신)';
  }catch(e){}
  function row(k,v){ return '<div style="display:flex;gap:14px;padding:9px 2px;border-bottom:1px solid var(--ring)">'+
    '<span style="width:110px;color:var(--muted);font-size:12.5px;flex-shrink:0">'+k+'</span>'+
    '<span style="font-size:13.5px">'+v+'</span></div>'; }
  box.innerHTML=
    row('이메일', esc(AUTH_USER||''))+
    row('권한', '<b>'+esc(ri[0])+'</b>'+(role? ' <span class="mini">('+esc(role)+')</span>':''))+
    row('권한 설명', '<span style="color:var(--ink-2)">'+esc(ri[1])+'</span>')+
    row('로그인 세션', '<span style="color:var(--ink-2)">'+esc(sessTxt)+'</span>');
  var act=document.createElement('div');
  act.style.cssText='display:flex;gap:10px;margin-top:18px';
  var bp=document.createElement('button'); bp.className='pill'; bp.textContent='🔑 비밀번호 변경';
  bp.onclick=function(){ openOvl('ovlAuth'); setAuthTab('pw'); };
  var bo=document.createElement('button'); bo.className='pill ghost'; bo.textContent='로그아웃';
  bo.style.cssText='border-color:var(--critical,#d03b3b);color:var(--critical,#d03b3b)';
  bo.onclick=doLogout;
  act.appendChild(bp); act.appendChild(bo);
  box.appendChild(act);
  /* 보안 — 2단계 인증(인증 앱) · 계정 단위, 본인이 켬 */
  var sec=document.createElement('div'); sec.style.cssText='margin-top:22px';
  sec.innerHTML='<div style="font-size:13px;font-weight:650;margin-bottom:4px">보안</div>'+row('🔐 2단계 인증', '<div id="accMfa"></div>');
  box.appendChild(sec); mfaCardRender(sec.querySelector('#accMfa'));
  /* 설정 — 이 브라우저에만 저장 (localStorage) */
  var set=document.createElement('div'); set.style.cssText='margin-top:22px';
  var curIdle=idleMin(), look0=curLook();
  set.innerHTML='<div style="font-size:13px;font-weight:650;margin-bottom:4px">설정 <span class="mini" style="font-weight:400">— 이 브라우저에만 저장됩니다</span></div>'+
    row('자동 로그아웃', '<select id="accIdle" style="height:30px;min-width:200px">'+IDLE_OPTS.map(function(m){
        return '<option value="'+m+'"'+(m===curIdle?' selected':'')+'>'+esc(idleLabel(m))+(m? ' 동안 활동 없으면':'')+'</option>'; }).join('')+'</select>'+
      '<div class="mini" style="margin-top:5px;line-height:1.6">마우스·키보드·스크롤 입력이 정한 시간 동안 없으면 이 탭에서 자동으로 로그아웃합니다. 끝나기 1분 전에 알림이 뜹니다.</div>')+
    row('화면 디자인', '<select id="accLook" style="height:30px;min-width:200px">'+Object.keys(LOOKS).map(function(k){ return '<option value="'+k+'"'+(k===look0?' selected':'')+'>'+esc(LOOKS[k])+'</option>'; }).join('')+'</select>'+
      '<div class="mini" style="margin-top:5px;line-height:1.6">커맨드 센터: 아이콘 레일 + 상단 커맨드 바(검색·이동·AI) + 인박스 홈 + 장비 운영 보드 + 고객 360 패널 · 심플: 평면 디자인에 기존 사이드바 · 클래식: 이전 디자인. 바꾸면 화면을 다시 읽습니다.</div>');
  var prow=document.createElement('div'); prow.innerHTML=row('📱 앱으로 설치', '<div id="accPwa">'+pwaHintHtml()+'</div>');
  set.appendChild(prow.firstChild);
  var meb=document.getElementById('btnMenuEdit');
  if(meb && meb.style.display!=='none'){
    var mrow=document.createElement('div'); mrow.innerHTML=row('메뉴 편집', '<button type="button" class="pill" id="accMenuEdit">⚙ 메뉴 순서·숨김 편집</button><div class="mini" style="margin-top:5px">사이드바(심플·클래식)와 아이콘 레일(커맨드 센터)에 함께 적용됩니다 · 이 브라우저에만 저장</div>');
    set.appendChild(mrow.firstChild);
  }
  box.appendChild(set);
  var ame=set.querySelector('#accMenuEdit'); if(ame) ame.onclick=function(){ try{ openMenuEdit(); }catch(e){} };
  var apg=set.querySelector('#accPwaGo'); if(apg) apg.onclick=function(){ pwaInstall(); };
  set.querySelector('#accIdle').onchange=function(){
    var m=parseInt(this.value,10)||0;
    try{ if(m) localStorage.setItem(IDLE_KEY,String(m)); else localStorage.removeItem(IDLE_KEY); }catch(e){}
    idleTouch();
    toast('자동 로그아웃', m? idleLabel(m)+' 동안 활동이 없으면 로그아웃합니다' : '끔 — 로그인이 계속 유지됩니다', 'ok');
  };
  set.querySelector('#accLook').onchange=function(){
    toast('화면 디자인', (LOOKS[this.value]||'')+' — 화면을 다시 읽습니다', 'ok');
    setLook(this.value);
  };
  var tip=document.createElement('p'); tip.className='cap'; tip.style.marginTop='14px';
  tip.textContent='계정 발급·권한 변경은 관리자가 Supabase 콘솔에서 처리합니다.';
  box.appendChild(tip);
}

/* ---- 수령처 프리셋 (DB recv_presets · 로그인 필요) ---- */
var RECV_PRESETS=null;
function loadRecvPresets(){
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

function openOrderForm(){ switchView('ordernew'); }
async function submitOrder(){
  var cust=$('#odCustomer').value.trim(), mgr=$('#odMgr').value.trim();
  if(!cust||!mgr){ msg('odMsg','고객사명과 담당자는 필수입니다','bad'); return; }
  var btn=$('#odGo'); btn.disabled=true; msg('odMsg','접수 중…');
  var isS1=$('#odChannel').value==='에스원';
  try{
    var row={
      channel: $('#odChannel').value, order_type: $('#odType').value,
      serials: $('#odSerials').value.trim()||null,
      requester: AUTH_USER||null,
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
    RAWX.orders=RAWX.orders||[]; RAWX.orders.unshift(out[0]);
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

async function submitMdrPoc(){
  var comp=$('#mpCompany').value.trim(), mgr=$('#mpMgr').value.trim();
  if(!comp||!mgr){ msg('mpMsg','회사명과 고객 담당자 이름은 필수입니다','bad'); return; }
  var btn=$('#mpGo'); btn.disabled=true; msg('mpMsg','접수 중…');
  try{
    var osSum=(+$('#mpWin').value||0)+(+$('#mpLinux').value||0)+(+$('#mpMac').value||0);
    var row={
      requester: AUTH_USER||null,
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
    RAWX.mdrops=RAWX.mdrops||[]; RAWX.mdrops.unshift(out[0]);
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