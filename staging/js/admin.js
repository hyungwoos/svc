/* ===== admin.js — 관리자(계정·권한·MFA 정책) · 배포·운영 · AI 점검 · 내 계정 · 수령처 =====
   ES 모듈(㊿+153) — 다른 파일의 이름은 아래 import 로만 씀 · 이 파일의 최상위 var/function 은 전부 export · 즉시 실행 문장은 js/init.js 의 start() 에 */
import { APP_VER, IS_STAGING, ST } from './state.js';
import { $, applyPerms, axTime, curLook, doLogout, esc, IDLE_KEY, IDLE_OPTS, idleLabel, idleMin, idleTouch, loadPerms, LOOKS, mfaCardRender, navText,
  PERM_EXEMPT, pwaHintHtml, pwaInstall, rawHtml, closeBtn, SB_KEY, SB_URL, sessRead, setLook, STATE, tpl } from './core.js';
import { cacheDrop, idxDate, ROLE_VIEWS, sbTry, sbWrite, thisMonthStr, toast, todayStr } from './shell.js';
import { aiFetch, buildDigest } from './ai.js';
import { applyCodes, CODE_KIND, CODE_KIND_LABEL, CODE_KIND_NOTE } from './grids.js';
import { navSub, openMenuEdit } from './tools.js';
import { UPD, updFetch, updOpenAll, updShow, updSyncSeed } from './upd.js';
import { switchView, xlsxAoa } from './grid.js';
import { logChange, openOvl, setAuthTab } from './edit.js';


/* ===== 관리자 (super_admin 전용) — 계정·권한 관리 ===== */
export var AX_ROLES=['super_admin','admin','admin_viewer','poc','equipment_poc'];
export var AX_ROLE_KO={super_admin:'슈퍼 관리자',admin:'관리자 (조회+수정)',admin_viewer:'관리자-조회 전용',
  poc:'PoC 전용',equipment_poc:'장비·PoC 전용',
  editor:'(구) 편집자→관리자',viewer:'(구) 조회→관리자-조회',equipment:'(구) 장비→장비·PoC'};
export var AX_USERS=[];
export function axMsg(t,bad){ var e=$('#axMsg'); e.textContent=t||''; e.style.color=bad?'var(--critical)':'var(--ink-2)'; }
export async function adminFetch(payload){
  var r=await fetch(SB_URL+'/functions/v1/admin',{
    method:'POST',
    headers:{'Content-Type':'application/json', apikey:SB_KEY, Authorization:'Bearer '+(ST.SB_TOKEN||'')},
    body:JSON.stringify(payload)
  });
  var j=null; try{ j=await r.json(); }catch(e){}
  if(!r.ok || !j || !j.ok) throw new Error((j&&j.error)||('HTTP '+r.status));
  cacheDrop();   // 권한 변경 등도 캐시 무효화
  return j;
}
/* ────────────────────────────────────────────────────────────────────────────
   관리자 › 배포·운영 (㊿+128) — Edge Function ops 중계
   · 포탈(공개 HTML)에는 토큰이 하나도 없음. GitHub·Supabase 토큰은 전부 함수 Secrets. 여기엔 «작업 PIN» 입력칸만 있고 PIN 은 메모리에만(저장 안 함).
   · 함수가 ① 로그인 ② OPS_OWNER(지정 계정) ③ super_admin ④ PIN 을 전부 검사 — 화면은 슈퍼 관리자에게만 보이지만 실제 열쇠는 함수 쪽.
   · 탭: GitHub 배포(끌어다 놓기 → 커밋 · 이력 · 복원) · SQL 실행(읽기 전용 토글 · 결과 표) · Edge Function(코드 불러오기 · 배포 · Verify JWT) · 기록(ops_log)
   ──────────────────────────────────────────────────────────────────────────── */
export var OPS={tab:'gh', pin:'', st:null, files:[], msg:'', ghList:null, hist:null, histPath:'', fnList:null, fnSel:'', fnMeta:null, fnCode:'', fnName:'index.ts', fnVerify:false, sqlRes:null, busy:false, target:'prod', errs:null, health:null, aic:null, seal:null, repo:null};
export function opsPrefix(){ return OPS.target==='staging'? 'staging/' : ''; }
/* ── ㊿+143 배포 안전장치 (2026-10-04 · check.mjs 가 루트에 잘못 올라가 Actions 가 두 번 실패한 일 뒤) ──
   ① 파일 하나만 끌어 넣어도 자리를 맞춤: check/smoke/lib.mjs → tests/ · *.test.ts·_mock.ts → tests/fn/ · deploy.yml → .github/workflows/ · worker.js → cloudflare/quote-worker/
   ② «저장소 파일»(.github·supabase·cloudflare·tests/fn·README·package.json·.gitignore)은 스테이징을 골라도 루트로 — 승격으로 옮겨지지 않고 CI 는 루트만 봄
   ③ .github/workflows/* 는 포탈 토큰에 Workflows 권한이 없어 커밋에서 빼고 «복사 · GitHub 에서 열기»로 안내
   ④ 커밋 전 경고: 루트에 .mjs/.ts/.yml 이 놓임 · 포탈이 불러오지 않는 js/ 파일
   ⑤ 🧹 저장소 점검: 안 쓰는 파일 · 스테이징에만 있는 저장소 파일 · 루트에 없는 저장소 파일 · deploy.yml 상태 → 정리(gh_delete) */
export var OPS_REPO_RE=/^(\.github\/|supabase\/|cloudflare\/|tests\/fn\/|README\.md$|package(-lock)?\.json$|\.gitignore$)/;
export var OPS_WF_RE=/^\.github\/workflows\//;
export var OPS_REPO_NEED=['tests/fn/_mock.ts','tests/fn/ops.test.ts','tests/fn/remind.test.ts','tests/fn/aicheck.test.ts','tests/fn/quote-worker.test.ts','supabase/functions/ops/index.ts','supabase/functions/remind/index.ts','supabase/functions/aicheck/index.ts','supabase/functions/export/index.ts','tests/fn/export.test.ts','cloudflare/quote-worker/worker.js','README.md'];
export function opsRepoFile(p){ return OPS_REPO_RE.test(String(p||'')); }
export function opsDest(p){ return (OPS.target==='staging' && !opsRepoFile(p))? 'staging/'+p : p; }
export function opsRepoName(){ return (OPS.st&&OPS.st.github&&OPS.st.github.repo)||'hyungwoos/svc'; }
export function opsRepoBranch(){ return (OPS.st&&OPS.st.github&&OPS.st.github.branch)||'main'; }
/* ㊿+160 전달 묶음 폴더(1_github/ · 2_repo/ …)를 통째로 끌어 넣으면 그 이름은 자동으로 뗌 — «떼기»를 잊어 staging/2_repo/… 로 올라간 일 */
export var OPS_PKG_RE=/^\d+_(github|repo)\//;
export function opsAutoPath(p){
  p=String(p||'').replace(/^\/+/,'');
  var pk=OPS_PKG_RE.exec(p);
  if(pk && p.length>pk[0].length){ var r=opsAutoPath(p.slice(pk[0].length)); return {path:r.path, auto:'«'+pk[0]+'» 폴더 이름은 떼고 넣었습니다'+(r.auto? ' · '+r.auto:''), bad:r.bad}; }
  if(p.indexOf('/')>=0) return {path:p};
  var dir={'check.mjs':'tests/','smoke.mjs':'tests/','lib.mjs':'tests/','load_all.json':'tests/fixture/','worker.js':'cloudflare/quote-worker/','deploy.yml':'.github/workflows/','deploy.yaml':'.github/workflows/'}[p];
  if(!dir && (/\.test\.ts$/.test(p) || p==='_mock.ts')) dir='tests/fn/';
  if(dir) return {path:dir+p, auto:'«'+p+'» → '+dir+' 에 자동으로 넣었습니다'};
  if(p==='index.ts') return {path:p, bad:'어느 함수인지 경로를 supabase/functions/<함수 이름>/index.ts 로 고치세요'};
  return {path:p};
}
export function opsAppJs(html){
  var m=/name="app-js" content="([^"]+)"/.exec(String(html||'')), s=m? m[1] : ((document.querySelector('meta[name="app-js"]')||{content:''}).content||'');
  return s.split(',').map(function(x){ return x.trim(); }).filter(Boolean).concat(['js/sqlbox.js']);   /* sqlbox.js = 격리 칸(sqlbox.html) 전용 · ㊿+147 · ㊿+153 부터 boot.js·load.js 는 안 씀(🧹 저장소 점검이 «안 쓰는 파일» 로 보여 줌) */
}
export function opsCheckFiles(files){   /* 커밋 전에 한 번 더 물어볼 것 */
  var warn=[], idx=files.filter(function(f){ return f.path==='index.html'; })[0], used=opsAppJs(idx&&idx.content);
  files.forEach(function(f){ var p=f.path;
    if(p.indexOf('/')<0 && /\.(mjs|ts|ya?ml|sh|py)$/i.test(p)) warn.push('· '+p+' — 저장소 맨 위(루트)에 놓입니다. 앞에 tests/ 같은 폴더가 빠지지 않았나요? (Actions 는 tests/check.mjs 를 실행)');
    if(/^js\/[^/]+\.js$/.test(p) && used.indexOf(p)<0) warn.push('· '+p+' — index.html 의 app-js 목록에 없어 포탈이 불러오지 않는 파일입니다');
  });
  return warn;
}
export function opsWfIssues(y){
  /* ㊿+144: 주석(#…) 줄은 빼고 봄 — 새 deploy.yml 의 설명 주석에 «|| echo» 글자가 있어 «실패를 덮음»으로 잘못 잡던 것 */
  var o=[]; y=String(y||'').split('\n').filter(function(l){ return !/^\s*#/.test(l); }).join('\n');
  if(/runs-on:\s*ubuntu-latest/.test(y)) o.push('runs-on: ubuntu-latest — 2026-10-19 부터 Ubuntu 26 으로 바뀌어 Playwright 설치가 깨질 수 있음 → ubuntu-24.04 로 고정');
  if(/node-version:\s*['"]?20\b/.test(y)) o.push('Node 20 — 지원 종료 → 22');
  if(/actions\/(checkout|setup-node|upload-artifact)@v4\b|actions\/deploy-pages@v4\b|actions\/configure-pages@v5\b|actions\/upload-pages-artifact@v3\b/.test(y)) o.push('옛 액션 버전(Node 20 경고) → checkout@v6 · setup-node@v6 · upload-artifact@v6 · configure-pages@v6 · upload-pages-artifact@v5 · deploy-pages@v5');
  if(!/^\s+functions:/m.test(y)) o.push('functions 잡 없음 — Edge Function 테스트가 CI 에서 안 돌아감');
  if(/deno run[^\n]*\|\|\s*echo/.test(y)) o.push('«deno run … || echo» 줄이 함수 테스트 실패를 덮음');
  if(/^\s+functions:/m.test(y) && !/tests\/fn\/export\.test\.ts/.test(y)) o.push('export 함수 테스트 줄 없음 (㊿+164) — «run_t supabase/functions/export/index.ts tests/fn/export.test.ts» 한 줄 추가');
  return o;
}
export function stagingUrl(){ var base=location.origin+location.pathname.replace(/\/staging\//,'/').replace(/[^/]*$/,''); return base+'staging/index.html'; }
export function prodUrl(){ var base=location.origin+location.pathname.replace(/\/staging\//,'/').replace(/[^/]*$/,''); return base+'index.html'; }
export function opsUrl(){ return SB_URL+'/functions/v1/ops'; }
export async function opsCall(action, body){
  var o=Object.assign({action:action}, body||{}); if(action!=='status') o.pin=OPS.pin;
  var r;
  try{ r=await fetch(opsUrl(), {method:'POST', headers:{'Content-Type':'application/json', apikey:SB_KEY, Authorization:'Bearer '+ST.SB_TOKEN}, body:JSON.stringify(o)}); }
  catch(e){ throw new Error('ops 함수에 연결하지 못했습니다 — Edge Functions 에 «ops» 가 배포돼 있고 Verify JWT 가 꺼져 있는지 확인하세요'); }
  var j=null; try{ j=await r.json(); }catch(e){}
  if(!j) throw new Error('ops 함수 응답을 읽지 못했습니다 ('+r.status+')');
  if(!j.ok) throw new Error(j.error||('실패 ('+r.status+')'));
  return j;
}
export function opsFmtBytes(n){ n=Number(n)||0; return n>=1048576? (n/1048576).toFixed(2)+' MB' : n>=1024? Math.round(n/1024)+' KB' : n+' B'; }
export function opsVerOf(text){ var t=String(text||''); var m=/name="app-ver" content="([^"]+)"/.exec(t) || /var APP_VER='([^']+)'/.exec(t); return m? m[1] : null; }   /* ㊿+136: <meta name="app-ver"> (예전 인라인 var 도 인식) */
export function opsIsText(name){ return /\.(html?|js|mjs|ts|json|webmanifest|css|sql|md|txt|csv|svg|xml|yml|yaml|gitignore)$/i.test(name) || /^\.?gitignore$/.test(name); }
export function opsSetMsg(t, cls){ OPS.msg=t||''; OPS.msgCls=cls||''; var e=document.getElementById('opsMsg'); if(e){ e.textContent=OPS.msg; e.className='mmsg'+(OPS.msgCls? ' '+OPS.msgCls:''); } }
export function opsNeedPin(){ if(!OPS.pin){ opsSetMsg('작업 PIN 을 먼저 입력하세요 (위 PIN 칸)','bad'); var p=document.getElementById('opsPin'); if(p) p.focus(); return false; } return true; }
export async function opsStatus(){
  try{ OPS.st=await opsCall('status'); }catch(e){ OPS.st={ok:false, error:String(e.message||e)}; }
  renderOps(true);
}
/* ㊿+156 펼친 목록·결과 닫기(✕ 닫기 · closeBtn) — 올릴 파일(모두 빼기) · 저장소 파일 · 커밋 이력 · 저장소 점검 · 직인 미리보기 · SQL 결과 · 시스템 점검 · 브라우저 오류 · AI 점검 */
export function opsClose(k){
  if(k==='files'){ OPS.files=[]; OPS.commitMsg=''; }
  else if(k==='ghList') OPS.ghList=null;
  else if(k==='hist'){ OPS.hist=null; OPS.histPath=''; }
  else if(k==='repo') OPS.repo=null;
  else if(k==='seal'){ if(OPS.seal&&OPS.seal.url){ try{ URL.revokeObjectURL(OPS.seal.url); }catch(e){} OPS.seal.url=null; } }   // 상태 줄(✓ Storage 에 있음)은 남김
  else if(k==='sqlRes') OPS.sqlRes=null;
  else if(k==='health'){ if(OPS.health&&OPS.health.running) return; OPS.health=null; }
  else if(k==='errs') OPS.errs=null;
  else if(k==='aic'){ if(OPS.aic&&OPS.aic.running) return; OPS.aic=null; }
  else return;
  OPS.msg=''; OPS.msgCls=''; renderOps(true);
}
export function renderOps(keep){
  var host=document.getElementById('opsHost'); if(!host) return;
  if(IS_STAGING && !OPS._tgInit){ OPS.target='staging'; OPS._tgInit=true; }
  if(!ST.IS_SUPER){ host.innerHTML='<p class="cap">슈퍼 관리자만 쓸 수 있습니다.</p>'; return; }
  var st=OPS.st;
  var h=tpl`<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:4px"><h3 style="margin:0;font-size:15px">🚀 배포·운영</h3><span class="ubadge sm">지정 계정 전용</span>`+
    tpl`<span class="mini" style="margin-left:auto">${rawHtml(st? (st.ok? (st.github? '저장소 '+esc(st.github.repo)+' · '+esc(st.github.branch)+' · GitHub 토큰 '+(st.github.token_set?'✓':'✗') : 'ops 함수 응답에 저장소 정보 없음(옛 버전?)')+' · Supabase 토큰 '+(st.mgmt_token_set?'✓':'✗')+' · PIN '+(st.pin_set?'설정됨':'미설정')+(st.slack? ' · 슬랙 알림 ✓':'') : tpl`<span style="color:var(--critical)">${st.error||''}</span>`) : '상태 확인 중…')}</span></div>`+
    tpl`<p class="cap" style="margin:0 0 12px">GitHub 커밋 · SQL 실행 · Edge Function 배포를 포탈 안에서 끝냅니다. 토큰은 전부 함수(ops) Secrets 에만 있고, 여기서는 <b>작업 PIN</b> 만 넣습니다(저장하지 않음 · 5회 틀리면 15분 잠금). 모든 실행은 기록에 남습니다.</p>`+
    tpl`<div class="ops-bar"><label>작업 PIN <input id="opsPin" type="password" autocomplete="off" inputmode="numeric" placeholder="••••" value="${OPS.pin}" style="width:120px"></label>`+
    tpl`<div class="mtabs" id="opsTabs" style="margin:0">${rawHtml([['gh','GitHub 배포'],['sql','SQL 실행'],['fn','Edge Function'],['log','기록']].map(function(t){ return tpl`<button type="button" data-t="${rawHtml(t[0])}" aria-pressed="${OPS.tab===t[0]}">${rawHtml(t[1])}</button>`; }).join(''))}</div>`+
    tpl`<button type="button" class="pill ghost" id="opsRefresh" title="설정 상태·기록 다시 읽기">↻</button></div>`+
    tpl`<div id="opsBody">${rawHtml(OPS.tab==='gh'? opsGhHtml() : OPS.tab==='sql'? opsSqlHtml() : OPS.tab==='fn'? opsFnHtml() : opsLogHtml())}</div>`+
    tpl`<div class="mact" style="margin-top:12px"><span class="mmsg${rawHtml(OPS.msgCls? ' '+OPS.msgCls:'')}" id="opsMsg">${OPS.msg}</span></div>`;
  host.innerHTML=h;
  var pin=document.getElementById('opsPin'); pin.oninput=function(){ OPS.pin=pin.value; };
  host.querySelectorAll('#opsTabs button').forEach(function(b){ b.onclick=function(){ OPS.tab=b.dataset.t; OPS.msg=''; OPS.msgCls=''; renderOps(true); }; });
  document.getElementById('opsRefresh').onclick=function(){ OPS.st=null; renderOps(true); opsStatus(); };
  host.querySelectorAll('[data-ops-close]').forEach(function(b){ b.onclick=function(){ opsClose(b.dataset.opsClose); }; });
  if(OPS.tab==='gh') opsGhBind(host); else if(OPS.tab==='sql') opsSqlBind(host); else if(OPS.tab==='fn') opsFnBind(host); else opsLogBind(host);
  if(!keep && !OPS.st) opsStatus();
}
/* ── GitHub ── */
export function opsGhHtml(){
  var files=OPS.files, cur=APP_VER, stg=OPS.target==='staging';
  var h='<div class="ops-grid">';
  h+=tpl`<div><div class="ops-h" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">① 올릴 파일 <span class="mtabs" style="margin:0" id="opsTarget"><button type="button" data-tg="prod" aria-pressed="${!stg}">운영</button><button type="button" data-tg="staging" aria-pressed="${rawHtml(stg)}" title="staging/ 폴더에 올라가며 …/staging/index.html 에서 열립니다 (같은 DB · 상단에 STAGING 띠)">스테이징</button></span>${rawHtml(stg? tpl`<a class="mini" href="${stagingUrl()}" target="_blank" rel="noopener">스테이징 열기 ↗</a>`:'')}</div>`+
     tpl`<div class="ops-drop" id="opsDrop" tabindex="0">여기에 파일이나 <b>폴더</b>를 끌어다 놓거나 <u>클릭해서 선택</u> — index.html · app.css · js/ 폴더 · 위성 페이지 · sw.js · manifest · 이미지 · tests/ 폴더 (여러 개 가능 · index.html 과 app.css/js 는 항상 같이)<input type="file" id="opsFile" multiple style="display:none"><input type="file" id="opsFolder" webkitdirectory style="display:none"></div>`+
     tpl`<div style="margin-top:6px"><button type="button" class="cbtn" id="opsPickFolder">📁 폴더 선택</button></div>`;
  if(files.length){
    h+=tpl`<div class="x-head mini" style="margin-top:8px">올릴 파일 ${files.length}개${closeBtn({'data-ops-close':'files'},'고른 파일을 전부 목록에서 빼기','✕ 모두 빼기')}</div>`;
    h+=tpl`<table class="rn-tbl" style="margin-top:4px"><thead><tr><th>경로</th><th class="n">크기</th><th>버전</th><th></th></tr></thead><tbody>${rawHtml(files.map(function(f,i){
      var ver=f.ver? (f.ver===cur? tpl`<span class="mini">${f.ver} (지금과 같음)</span>` : tpl`<b>${f.ver}</b> <span class="mini">← 지금 ${cur}</span>`) : '';
      var wf=OPS_WF_RE.test(f.path), repo=opsRepoFile(f.path);
      var tag=wf? tpl`<span class="ctag late" title="포탈 토큰에는 Workflows 권한이 없어 이 파일은 커밋에서 빠집니다">GitHub 웹에서</span> <button type="button" class="cbtn" data-wfcopy="${rawHtml(i)}">내용 복사</button> <a class="cbtn" target="_blank" rel="noopener" href="https://github.com/${opsRepoName()}/edit/${opsRepoBranch()}/${f.path}">GitHub 에서 열기 ↗</a>`
        : repo? '<span class="ctag" title="CI 는 저장소 루트만 보고, 승격은 이 파일을 옮기지 않아 대상과 상관없이 루트로 올립니다">저장소 루트</span>' : '';
      var note=(f.auto? tpl`<div class="mini">↪ ${f.auto}</div>`:'')+(f.bad? tpl`<div class="mini" style="color:var(--critical)">⚠ ${f.bad}</div>`:'');
      return tpl`<tr><td>${rawHtml(stg && !repo? '<span class="mini">staging/</span>':'')}<input data-i="${rawHtml(i)}" class="ops-path" value="${f.path}" style="width:220px">${rawHtml(note)}</td><td class="n">${rawHtml(opsFmtBytes(f.size))}</td><td>${rawHtml(ver)}${rawHtml(f.bin? ' <span class="mini">binary</span>':'')}${rawHtml(tag? ' '+tag:'')}</td><td><button type="button" class="cbtn" data-rm="${rawHtml(i)}">빼기</button></td></tr>`; }).join(''))}`+ tpl`</tbody></table>`;
    var tops={}; files.forEach(function(f){ var seg=f.path.split('/'); if(seg.length>1) tops[seg[0]]=(tops[seg[0]]||0)+1; }); var topKeys=Object.keys(tops);
    if(topKeys.length===1 && tops[topKeys[0]]===files.length && !/^(tests|staging|supabase|\.github|js|css|img|assets)$/.test(topKeys[0])) h+=tpl`<p class="mini" style="margin:6px 0 0">모든 파일이 «${topKeys[0]}/» 폴더 아래에 있습니다 — 저장소 루트에 바로 두려면 <button type="button" class="cbtn" id="opsStripTop">«${topKeys[0]}/» 떼기</button></p>`;
    h+=tpl`<div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><label style="flex:1;min-width:240px">커밋 메시지 <input id="opsCommitMsg" value="${OPS.commitMsg||opsAutoMsg()}" style="width:100%"></label><button type="button" class="pill" id="opsCommit" style="background:${stg? 'var(--s3,#b26a00)':'var(--brand)'};border-color:${stg? 'var(--s3,#b26a00)':'var(--brand)'};color:#fff">${stg? '커밋 → 스테이징':'커밋 → 운영'}</button></div>`;
    h+=tpl`<p class="mini" style="margin:6px 0 0">커밋 하나로 묶여 올라가고, 테스트가 통과하면 GitHub Pages 에 반영(보통 2~3분). ${stg? '스테이징에서 확인한 뒤 «스테이징 → 운영 승격»으로 같은 파일을 운영에 올립니다.':'index.html 은 올린 뒤 이 화면을 새로고침하면 새 버전으로 바뀝니다.'} 저장소 파일(.github · supabase · cloudflare · tests/fn · README · package.json · .gitignore)은 대상과 상관없이 루트로 갑니다.</p>`;
  }
  h+=tpl`<div class="ops-h" style="margin-top:14px">스테이징 ↔ 운영</div><div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="cbtn" id="opsSync" title="운영에 있는 포탈 파일 전부를 staging/ 로 복사(재업로드 없이 같은 내용) — 스테이징을 운영과 똑같이 맞출 때">운영 → 스테이징 동기화</button><button type="button" class="cbtn" id="opsQa" title="스테이징 포탈을 창 안에서 열어 메뉴 전부를 자동으로 눌러 봅니다 — JS 오류·빈 화면·깨진 값·넘침·핵심 숫자 비교 (약 30초)">🧪 스테이징 QA</button>${rawHtml(qaBadgeHtml())}<button type="button" class="cbtn pri" id="opsPromote" title="staging/ 에 있는 파일을 운영(루트)으로 복사 — 스테이징에서 확인이 끝났을 때">스테이징 → 운영 승격</button><a class="cbtn" href="${stagingUrl()}" target="_blank" rel="noopener">스테이징 열기 ↗</a></div>`;
  h+='</div>';
  h+=tpl`<div><div class="ops-h">② 저장소 · 이전 버전</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"><button type="button" class="pill ghost" id="opsGhList">저장소 파일 보기</button><button type="button" class="pill ghost" id="opsGhHist" data-p="index.html">index.html 이력</button><a class="pill ghost" href="https://github.com/${(OPS.st&&OPS.st.github&&OPS.st.github.repo)||'hyungwoos/svc'}/actions" target="_blank" rel="noopener" title="테스트·배포 진행 상황">Actions ↗</a></div>`;
  h+=tpl`<div style="display:flex;gap:6px;flex-wrap:wrap;margin:-2px 0 8px"><button type="button" class="pill ghost" id="opsRepoCheck" title="안 쓰는 파일 · 스테이징에만 있는 저장소 파일 · 루트에 없는 테스트/함수 · 배포 설정(deploy.yml) 상태를 확인">🧹 저장소 점검</button><a class="pill ghost" target="_blank" rel="noopener" href="https://github.com/${opsRepoName()}/settings/pages" title="Source 가 «GitHub Actions» 여야 테스트를 통과한 버전만 배포됩니다">Pages 설정 ↗</a></div>`;
  h+=opsRepoHtml();
  if(OPS.ghList) h+=tpl`<div class="ops-h x-head" style="margin-top:10px">저장소 파일 ${OPS.ghList.length}개${closeBtn({'data-ops-close':'ghList'},'저장소 파일 목록 닫기')}</div><table class="rn-tbl"><thead><tr><th>경로</th><th class="n">크기</th><th></th></tr></thead><tbody>${rawHtml(OPS.ghList.map(function(f){ return tpl`<tr><td>${f.path}</td><td class="n">${rawHtml(opsFmtBytes(f.size))}</td><td><button type="button" class="cbtn" data-hist="${f.path}">이력</button></td></tr>`; }).join(''))}</tbody></table>`;
  if(OPS.hist) h+=tpl`<div class="ops-h x-head" style="margin-top:10px">${OPS.histPath} — 최근 커밋${closeBtn({'data-ops-close':'hist'},'커밋 이력 닫기')}</div><table class="rn-tbl"><thead><tr><th>커밋</th><th>일시</th><th>메시지</th><th></th></tr></thead><tbody>${rawHtml(OPS.hist.map(function(c,i){ return tpl`<tr><td><a href="${c.url}" target="_blank" rel="noopener" style="font-family:ui-monospace,monospace">${c.short}</a></td><td class="mini">${String(c.date||'').replace('T',' ').slice(0,16)}</td><td>${c.message}</td><td>${rawHtml(i===0? '<span class="mini">현재</span>' : tpl`<button type="button" class="cbtn" data-restore="${c.sha}">이 버전으로 복원</button>`)}</td></tr>`; }).join(''))}</tbody></table>`;
  h+=opsSealHtml();
  h+='</div></div>';
  return h;
}
/* 🧹 저장소 점검 결과 */
export function opsRepoHtml(){
  var R=OPS.repo; if(!R) return '';
  var del=opsRepoDeletable(), h='<div class="ops-repo" style="border:1px solid var(--ring);border-radius:10px;padding:10px 12px;margin:0 0 10px">';
  var ok=!R.unused.length && !R.stagingRepo.length && !R.missing.length && !(R.wf&&R.wf.length);
  h+=tpl`<div class="ops-h x-head" style="margin:0 0 6px">🧹 저장소 점검 ${rawHtml(ok? '<span class="up">✓ 문제 없음</span>':'')}${closeBtn({'data-ops-close':'repo'},'저장소 점검 결과 닫기')}</div>`;
  if(R.unused.length) h+=tpl`<div class="mini" style="margin:4px 0 2px"><b>안 쓰는 파일 ${R.unused.length}개</b> — 지워도 됩니다</div><ul class="mini" style="margin:0 0 6px 18px;padding:0">${rawHtml(R.unused.map(function(x){ return tpl`<li><code>${x.p}</code> — ${x.why}</li>`; }).join(''))}</ul>`;
  if(R.stagingRepo.length) h+=tpl`<div class="mini" style="margin:4px 0 2px"><b>스테이징 안의 저장소 파일 ${R.stagingRepo.length}개</b> — CI 는 루트만 봐서 여기 있으면 쓰이지 않습니다</div><ul class="mini" style="margin:0 0 6px 18px;padding:0">${rawHtml(R.stagingRepo.slice(0,40).map(function(x){ return tpl`<li><code>${x.p}</code> — ${rawHtml(x.root? '루트에 있음 · 지워도 됨' : '<span style="color:var(--critical)">루트에 없음 — 먼저 루트에 올리세요</span>')}</li>`; }).join(''))}${rawHtml(R.stagingRepo.length>40? tpl`<li>… 외 ${R.stagingRepo.length-40}개</li>`:'')}</ul>`;
  if(R.missing.length) h+=tpl`<div class="mini" style="margin:4px 0 2px"><b>루트에 없는 저장소 파일 ${R.missing.length}개</b> — 함수 테스트가 CI 에서 돌지 않습니다 (저장소 파일 묶음을 끌어 넣어 커밋 · 대상 상관없이 루트로)</div><ul class="mini" style="margin:0 0 6px 18px;padding:0">${rawHtml(R.missing.map(function(p){ return tpl`<li><code>${p}</code></li>`; }).join(''))}</ul>`;
  if(R.wf && R.wf.length) h+=tpl`<div class="mini" style="margin:4px 0 2px"><b>배포 설정 .github/workflows/deploy.yml</b> — 새 파일을 GitHub 웹에서 붙여 넣으세요 <a target="_blank" rel="noopener" href="https://github.com/${opsRepoName()}/edit/${opsRepoBranch()}/.github/workflows/deploy.yml">GitHub 에서 열기 ↗</a></div><ul class="mini" style="margin:0 0 6px 18px;padding:0">${rawHtml(R.wf.map(function(t){ return tpl`<li>${t}</li>`; }).join(''))}</ul>`;
  else if(R.wf) h+='<div class="mini" style="margin:4px 0">배포 설정 deploy.yml ✓ (Ubuntu·Node·액션 버전·functions 잡)</div>';
  h+=tpl`<div class="mini" style="margin:4px 0 0">Pages 배포 방식은 여기서 볼 수 없습니다 — <a target="_blank" rel="noopener" href="https://github.com/${opsRepoName()}/settings/pages">Settings › Pages</a> 의 Source 가 <b>GitHub Actions</b> 여야 테스트를 통과한 버전만 올라갑니다.</div>`;
  if(del.length) h+=tpl`<div style="margin-top:8px"><button type="button" class="cbtn" id="opsRepoClean">지워도 되는 ${del.length}개 정리(삭제 커밋)</button></div>`;
  return tpl`${rawHtml(h)}</div>`;
}
export function opsRepoDeletable(){
  var R=OPS.repo; if(!R) return [];
  return R.unused.map(function(x){ return x.p; }).concat(R.stagingRepo.filter(function(x){ return x.root; }).map(function(x){ return x.p; }));
}
export async function opsRepoCheck(){
  if(!opsNeedPin() || OPS.busy) return;
  OPS.busy=true; opsSetMsg('저장소 점검 중…');
  try{
    var l=await opsCall('gh_list'), paths=l.files.map(function(f){ return f.path; }), has={};
    paths.forEach(function(p){ has[p]=1; });
    var used=opsAppJs(), R={unused:[], stagingRepo:[], missing:[], wf:null};
    paths.forEach(function(p){
      var rel=p.replace(/^staging\//,''), stg=(rel!==p);
      if(OPS_PKG_RE.test(rel)){ var inner=rel.replace(OPS_PKG_RE,''), home=(stg && !opsRepoFile(inner))? 'staging/'+inner : inner; R.unused.push({p:p, why:'묶음 폴더 이름(«'+rel.split('/')[0]+'/»)이 붙은 채 올라가 쓰이지 않음 — '+(has[home]? '제자리('+home+')에 있음' : '제자리('+home+')에 없음 · 묶음을 다시 올리세요')}); }
      else if(/^js\/[^/]+\.js$/.test(rel) && used.indexOf(rel)<0) R.unused.push({p:p, why:'포탈이 불러오지 않는 js (index.html app-js 목록 밖)'});
      else if(/^(check|smoke|lib)\.mjs$/.test(rel)) R.unused.push({p:p, why:'tests/ 밖에 놓인 테스트 파일 — 실행되지 않음'});
      else if(stg && opsRepoFile(rel)) R.stagingRepo.push({p:p, rel:rel, root:!!has[rel]});
    });
    R.missing=OPS_REPO_NEED.filter(function(p){ return !has[p]; });
    if(has['.github/workflows/deploy.yml']){ try{ var g=await opsCall('gh_get',{path:'.github/workflows/deploy.yml'}); R.wf=opsWfIssues(g.content||''); }catch(e){ R.wf=['deploy.yml 을 읽지 못했습니다: '+String(e.message||e)]; } }
    else R.wf=['.github/workflows/deploy.yml 이 없습니다'];
    OPS.repo=R;
    var n=R.unused.length+R.stagingRepo.length+R.missing.length+(R.wf? R.wf.length:0);
    opsSetMsg(n? '저장소 점검 — 확인할 것 '+n+'건 (아래)' : '저장소 점검 — 문제 없음', n? '':'ok');
  }catch(e){ opsSetMsg(String(e.message||e),'bad'); }
  OPS.busy=false; renderOps(true);
}
export async function opsRepoClean(){
  if(!opsNeedPin() || OPS.busy) return;
  var paths=opsRepoDeletable(); if(!paths.length) return;
  if(!confirm('다음 '+paths.length+'개 파일을 저장소에서 지우는 커밋을 만듭니다 (사이트에서 쓰지 않는 파일 · Git 이력에는 남음):\n\n'+paths.slice(0,40).map(function(p){ return '· '+p; }).join('\n')+(paths.length>40? '\n… 외 '+(paths.length-40)+'개':'')+'\n\n계속할까요?')) return;
  OPS.busy=true; opsSetMsg('정리 중…');
  try{ var r=await opsCall('gh_delete',{paths:paths, message:'저장소 정리 — 안 쓰는 파일 '+paths.length+'개 (포탈 저장소 점검)'}); opsSetMsg('정리 커밋 완료 — '+r.commit.slice(0,7)+' · '+r.deleted.length+'개 삭제'+(r.missing&&r.missing.length? ' · 이미 없음 '+r.missing.length:''),'ok'); toast('저장소 정리', r.deleted.length+'개 파일 삭제 → '+r.commit.slice(0,7)); OPS.repo=null; OPS.ghList=null; }
  catch(e){ opsSetMsg(String(e.message||e),'bad'); }
  OPS.busy=false; renderOps(true);
}
/* ── ③ 보안 자산: 법인 직인 — 공개 저장소(도장.jpg) 대신 Supabase Storage 비공개 버킷 private/seal.jpg (SQL 87) ── */
export var SEAL_OBJECT='private/seal.jpg';
export function opsSealHtml(){
  var st=OPS.seal;
  return tpl`<div class="ops-h" style="margin-top:14px">③ 보안 자산 — 법인 직인</div>`+
    tpl`<p class="mini" style="margin:0 0 6px">견적서(quote.html)의 직인은 공개 저장소가 아니라 Storage 비공개 버킷 <b>private/seal.jpg</b> 에서 로그인한 사용자만 받습니다(SQL 87). 여기서 올린 뒤, 저장소에 남아 있는 도장.jpg 를 지우세요.</p>`+
    tpl`<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><span id="opsSealSt" class="mini">${rawHtml(st? (st.ok? '✓ Storage 에 있음 · '+opsFmtBytes(st.size)+' · '+esc(st.type||'') : '✗ '+esc(st.error||'없음')) : '상태 미확인')}</span>`+
    tpl`<button type="button" class="cbtn" id="opsSealCheck">직인 상태 확인</button>`+
    tpl`<label class="cbtn" style="cursor:pointer">직인 이미지 올리기<input type="file" id="opsSealFile" accept="image/jpeg,image/png,image/webp" style="display:none"></label>`+
    tpl`<button type="button" class="cbtn" id="opsSealRm" title="저장소 루트와 staging/ 의 도장.jpg 를 삭제 커밋 (Git 이력에는 남음)">저장소의 도장.jpg 삭제</button></div>`+ tpl`${rawHtml(st&&st.ok&&st.url? tpl`<div class="x-head" style="margin-top:6px;max-width:360px"><img src="${st.url}" alt="직인 미리보기" style="height:48px;border:1px solid var(--line);border-radius:6px;background:#fff">${closeBtn({'data-ops-close':'seal'},'직인 미리보기 닫기')}</div>`:'')}`;
}
export async function opsSealCheck(quiet){
  try{
    var r=await fetch(SB_URL+'/storage/v1/object/authenticated/'+SEAL_OBJECT, {headers:{apikey:SB_KEY, Authorization:'Bearer '+ST.SB_TOKEN}});
    if(!r.ok){ var t=''; try{ t=(await r.json()).message||''; }catch(e){} OPS.seal={ok:false, error:r.status===400||r.status===404? '아직 없음 (올리기 필요)' : r.status===403? '권한 없음 — SQL 87 정책 확인' : (r.status+' '+t)}; }
    else { var b=await r.blob(); if(OPS.seal&&OPS.seal.url) try{ URL.revokeObjectURL(OPS.seal.url); }catch(e){} OPS.seal={ok:true, size:b.size, type:b.type, url:URL.createObjectURL(b)}; }
  }catch(e){ OPS.seal={ok:false, error:'Storage 에 연결하지 못했습니다'}; }
  if(!quiet) opsSetMsg(OPS.seal.ok? '직인이 Storage 에 있습니다':'직인: '+OPS.seal.error, OPS.seal.ok?'ok':'bad');
  renderOps(true);
}
export async function opsSealUpload(file){
  if(!file) return; if(!/^image\/(jpeg|png|webp)$/.test(file.type)){ opsSetMsg('JPG · PNG · WebP 이미지만 올릴 수 있습니다','bad'); return; }
  if(file.size>2*1024*1024){ opsSetMsg('2MB 이하 이미지로 올려 주세요','bad'); return; }
  if(!confirm('«'+file.name+'» ('+opsFmtBytes(file.size)+') 을 직인으로 올립니다 (private/seal.jpg · 기존 파일은 덮어씀). 견적서에 바로 반영됩니다. 계속할까요?')) return;
  opsSetMsg('직인 올리는 중…');
  try{
    var r=await fetch(SB_URL+'/storage/v1/object/'+SEAL_OBJECT, {method:'POST', headers:{apikey:SB_KEY, Authorization:'Bearer '+ST.SB_TOKEN, 'Content-Type':file.type, 'x-upsert':'true', 'cache-control':'3600'}, body:file});
    if(!r.ok){ var t=''; try{ t=(await r.json()).message||''; }catch(e){} throw new Error(r.status===403||r.status===400&&/policy|row-level/i.test(t)? '권한 없음 — SQL 87 을 실행했는지, 슈퍼 관리자인지 확인하세요' : r.status===404? 'private 버킷이 없습니다 — SQL 87 을 먼저 실행하세요' : (r.status+' '+t)); }
    logChange('seal_upload','storage','private/seal.jpg',{name:file.name, size:file.size, type:file.type});
    toast('직인 저장 완료', 'Storage private/seal.jpg');
    await opsSealCheck(true); opsSetMsg('직인을 Storage 에 저장했습니다 — 이제 «저장소의 도장.jpg 삭제»를 눌러 공개 저장소에서 지우세요','ok');
  }catch(e){ opsSetMsg(String(e.message||e),'bad'); }
}
export async function opsSealRm(){
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
export function opsAutoMsg(){
  var names=OPS.files.map(function(f){ return f.path; }), vers=OPS.files.map(function(f){ return f.ver; }).filter(Boolean);
  return (vers.length? '포탈 '+vers[0].replace(/^.*\s/,'')+' · ' : '')+names.join(', ')+' (포탈에서 배포)';
}
export function opsGhBind(host){
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
  var qb=host.querySelector('#opsQa'); if(qb) qb.onclick=function(){ qaOpen(); };
  host.querySelectorAll('.ops-path').forEach(function(i){ i.onchange=function(){ var f=OPS.files[+i.dataset.i]; f.path=i.value.trim().replace(/^\/+/,''); f.auto=''; if(f.path!=='index.ts') f.bad=''; OPS.commitMsg=''; renderOps(true); }; });
  host.querySelectorAll('[data-rm]').forEach(function(b){ b.onclick=function(){ OPS.files.splice(+b.dataset.rm,1); OPS.commitMsg=''; renderOps(true); }; });
  var st=host.querySelector('#opsStripTop'); if(st) st.onclick=function(){ OPS.files.forEach(function(f){ var ap=opsAutoPath(f.path.replace(/^[^/]+\//,'')); f.path=ap.path; f.auto=ap.auto||''; f.bad=ap.bad||''; }); OPS.commitMsg=''; renderOps(true); };
  var cm=host.querySelector('#opsCommitMsg'); if(cm) cm.oninput=function(){ OPS.commitMsg=cm.value; };
  var go=host.querySelector('#opsCommit'); if(go) go.onclick=opsCommit;
  var rc=host.querySelector('#opsRepoCheck'); if(rc) rc.onclick=opsRepoCheck;
  var rcl=host.querySelector('#opsRepoClean'); if(rcl) rcl.onclick=opsRepoClean;
  host.querySelectorAll('[data-wfcopy]').forEach(function(b){ b.onclick=function(){ var f=OPS.files[+b.dataset.wfcopy]; if(!f) return;
    var done=function(){ toast('복사했습니다','GitHub 편집 화면에서 전체 선택(Ctrl+A) 후 붙여 넣고 «Commit changes»'); };
    try{ navigator.clipboard.writeText(f.content||'').then(done, function(){ prompt('아래 내용을 복사하세요 (Ctrl+C)', f.content||''); }); }catch(e){ prompt('아래 내용을 복사하세요 (Ctrl+C)', f.content||''); } }; });
  var gl=host.querySelector('#opsGhList'); if(gl) gl.onclick=async function(){ if(!opsNeedPin()) return; opsSetMsg('저장소 읽는 중…'); try{ var r=await opsCall('gh_list'); OPS.ghList=r.files; opsSetMsg(r.files.length+'개 파일','ok'); renderOps(true); }catch(e){ opsSetMsg(String(e.message||e),'bad'); } };
  host.querySelectorAll('[data-hist],#opsGhHist').forEach(function(b){ b.onclick=async function(){ if(!opsNeedPin()) return; var p=b.dataset.hist||b.dataset.p; opsSetMsg(p+' 이력 읽는 중…'); try{ var r=await opsCall('gh_history',{path:p, n:10}); OPS.hist=r.commits; OPS.histPath=p; opsSetMsg(r.commits.length+'건','ok'); renderOps(true); }catch(e){ opsSetMsg(String(e.message||e),'bad'); } }; });
  host.querySelectorAll('[data-restore]').forEach(function(b){ b.onclick=async function(){ if(!opsNeedPin()) return; var sha=b.dataset.restore, p=OPS.histPath;
    if(!confirm('«'+p+'» 을 커밋 '+sha.slice(0,7)+' 시점 내용으로 되돌려 새 커밋을 만듭니다. 계속할까요?')) return;
    opsSetMsg('복원 중…'); b.disabled=true;
    try{ var r=await opsCall('gh_restore',{path:p, ref:sha}); opsSetMsg('복원 커밋 완료 — '+r.commit.slice(0,7)+(r.app_ver? ' · '+r.app_ver:'')+' · Pages 반영 1~2분','ok'); toast('GitHub 복원 완료', p+' ← '+sha.slice(0,7)); OPS.hist=null; renderOps(true); }
    catch(e){ opsSetMsg(String(e.message||e),'bad'); b.disabled=false; } }; });
}
/* 끌어다 놓은 항목에 폴더가 있으면 안을 걸어 상대 경로를 유지 (tests/smoke.mjs 처럼) */
export function opsDropItems(dt){
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
export function opsAddFiles(list, keepPath){
  var arr=[].slice.call(list||[]); if(!arr.length) return;
  arr=arr.filter(function(f){ var p=f.relPath||f.webkitRelativePath||f.name; return !/(^|\/)(\.git|node_modules|_site|\.DS_Store)(\/|$)/.test(p); });
  if(!arr.length) return;
  var left=arr.length;
  arr.forEach(function(f){
    var isText=opsIsText(f.name), rd=new FileReader();
    rd.onload=function(){
      var rel=keepPath? (f.relPath||f.webkitRelativePath||f.name) : f.name;
      var ap=opsAutoPath(rel);   /* ㊿+143: 파일 하나만 끌어 넣어도 tests/ 등 제자리로 */
      var item={path:ap.path, size:f.size, bin:!isText, auto:ap.auto||'', bad:ap.bad||''};
      if(isText){ item.content=String(rd.result||''); item.ver=/index\.html$/i.test(f.name)? opsVerOf(item.content) : null; }
      else { item.content_b64=String(rd.result||'').replace(/^data:[^;]*;base64,/,''); }
      var k=OPS.files.findIndex(function(x){ return x.path===item.path; }); if(k>=0) OPS.files[k]=item; else OPS.files.push(item);
      if(--left===0){ OPS.commitMsg=''; renderOps(true); }
    };
    rd.onerror=function(){ if(--left===0) renderOps(true); };
    if(isText) rd.readAsText(f); else rd.readAsDataURL(f);
  });
}
export async function opsCommit(){
  if(!opsNeedPin() || !OPS.files.length || OPS.busy) return;
  var msgEl=document.getElementById('opsCommitMsg'), message=(msgEl&&msgEl.value.trim())||opsAutoMsg();
  if(OPS.files.some(function(f){ return f.path==='index.ts'; })){ opsSetMsg('index.ts 의 경로를 supabase/functions/<함수 이름>/index.ts 로 고친 뒤 커밋하세요','bad'); return; }
  var wfs=OPS.files.filter(function(f){ return OPS_WF_RE.test(f.path); }), puts=OPS.files.filter(function(f){ return !OPS_WF_RE.test(f.path); });
  if(!puts.length){ opsSetMsg('워크플로 파일(.github/workflows)은 포탈로 올릴 수 없습니다 — 목록의 «내용 복사» → «GitHub 에서 열기»에서 붙여 넣고 Commit 하세요','bad'); return; }
  var warn=opsCheckFiles(puts);
  if(warn.length && !confirm('커밋 전에 확인해 주세요:\n\n'+warn.join('\n')+'\n\n그래도 커밋할까요?')) return;
  var idx=OPS.files.filter(function(f){ return /index\.html$/i.test(f.path); })[0];
  if(idx && idx.ver && idx.ver===APP_VER && !confirm('올리는 index.html 의 APP_VER('+idx.ver+')가 지금 실행 중인 버전과 같습니다. 그래도 커밋할까요?')) return;
  if(idx && !idx.ver && !confirm('올리는 index.html 에서 APP_VER 를 찾지 못했습니다 — 포탈 파일이 맞나요? 그래도 커밋할까요?')) return;
  var hasCode=OPS.files.some(function(f){ return /(^|\/)(app\.css|js\/[^/]+\.js)$/.test(f.path); });
  if(hasCode && !idx && !confirm('app.css 또는 js/ 파일만 올리고 index.html 은 없습니다. 포탈은 index.html 의 APP_VER(?v=) 로 캐시를 깨므로 index.html(버전 +1)을 함께 올리지 않으면 사용자 브라우저가 예전 코드를 계속 쓸 수 있습니다. 그래도 커밋할까요?')) return;
  if(!confirm(puts.length+'개 파일을 GitHub('+(OPS.st&&OPS.st.ok&&OPS.st.github? OPS.st.github.repo+' · '+OPS.st.github.branch : '저장소')+')에 커밋합니다.\n\n'+puts.map(function(f){ return '· '+opsDest(f.path)+' ('+opsFmtBytes(f.size)+')'; }).join('\n')+(wfs.length? '\n\n(빠짐 — GitHub 웹에서 직접: '+wfs.map(function(f){ return f.path; }).join(', ')+')':'')+'\n\n'+message)) return;
  OPS.busy=true; var bt=document.getElementById('opsCommit'); if(bt) bt.disabled=true; opsSetMsg('커밋 중… (파일 '+puts.length+'개)');
  try{
    var stg=OPS.target==='staging', anyStg=puts.some(function(f){ return opsDest(f.path)!==f.path; });
    var r=await opsCall('gh_put',{files:puts.map(function(f){ var d=opsDest(f.path); return f.bin? {path:d, content_b64:f.content_b64} : {path:d, content:f.content}; }), message:(anyStg? '[staging] ':'')+message});
    opsSetMsg('커밋 완료 — '+r.commit.slice(0,7)+' · '+r.files.join(', ')+' · 테스트 통과 후 Pages 반영(2~3분)'+(anyStg? ' · 스테이징: '+stagingUrl():'')+(wfs.length? ' · 워크플로 파일은 목록에 남겨 두었습니다(GitHub 웹에서 붙여 넣기)':''),'ok');
    toast('GitHub 커밋 완료', r.files.join(', ')+' → '+r.commit.slice(0,7));
    OPS.files=wfs; OPS.commitMsg=''; OPS.hist=null; renderOps(true);
    if(idx && !stg) setTimeout(function(){ if(confirm('index.html 을 운영에 올렸습니다. 새 버전을 쓰려면 포탈을 새로고침해야 합니다 (테스트·Pages 반영에 2~3분 걸릴 수 있음). 지금 새로고침할까요?')) location.reload(); }, 400);
    if(idx && stg) setTimeout(function(){ if(confirm('스테이징에 올렸습니다. 2~3분 뒤 스테이징 포탈을 새 탭으로 열까요?')) window.open(stagingUrl(), '_blank'); }, 400);
    OPS.repo=null;   /* 저장소가 바뀌었으니 점검 결과는 다시 */
  }catch(e){ opsSetMsg(String(e.message||e),'bad'); }
  OPS.busy=false; if(bt) bt.disabled=false;
}
export async function opsCopy(src, dst){
  if(!opsNeedPin() || OPS.busy) return;
  var promote=(src==='staging');
  var qaLine=promote? (QA.res? (QA.res.fail? '\n\n⚠ 스테이징 QA 에서 '+QA.res.fail+'건 실패('+QA.res.verS+') — 그래도 승격할까요?' : '\n\n✅ 스테이징 QA 통과 '+QA.res.pass+'/'+QA.res.total+' ('+QA.res.verS+')') : '\n\n⚠ 스테이징 QA 를 아직 실행하지 않았습니다 — «🧪 스테이징 QA» 로 먼저 점검하는 것을 권합니다') : '';
  if(!confirm(promote? '스테이징(staging/)의 포탈 파일을 운영(루트)으로 복사합니다. 운영 포탈이 스테이징과 같아집니다 — 스테이징에서 충분히 확인했나요?'+qaLine : '운영(루트)의 포탈 파일을 staging/ 로 복사합니다. 스테이징이 운영과 같아집니다. 계속할까요?')) return;
  OPS.busy=true; opsSetMsg(promote? '승격 중…':'동기화 중…');
  try{ var r=await opsCall('gh_copy',{src:src, dst:dst}); opsSetMsg((promote? '승격 커밋 완료 — ':'동기화 커밋 완료 — ')+r.commit.slice(0,7)+' · '+r.files.length+'개 파일 · '+(r.note||''),'ok'); toast(promote? '스테이징 → 운영 승격':'운영 → 스테이징 동기화', r.files.length+'개 파일 · '+r.commit.slice(0,7)); OPS.hist=null; renderOps(true); }
  catch(e){ opsSetMsg(String(e.message||e),'bad'); }
  OPS.busy=false;
}
/* ── 시스템 점검: 포탈이 의존하는 것들이 살아 있는지 한 번에 (운영 DB 는 읽기 전용 select 1 만) ── */
export async function opsHealth(){
  var out=[], t=function(){ return Date.now(); };
  async function step(name, fn){ var t0=t(); try{ var r=await fn(); out.push({name:name, ok:true, ms:t()-t0, info:r||''}); }catch(e){ out.push({name:name, ok:false, ms:t()-t0, info:String(e.message||e).slice(0,140)}); } }
  OPS.health={running:true, rows:out}; renderOps(true);
  await step('GitHub Pages 최신 index.html', async function(){ var r=await fetch(prodUrl()+'?nocache='+Date.now(), {cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status); var m=opsVerOf(await r.text()); if(!m) throw new Error('APP_VER 없음'); return m+(m===APP_VER? ' (지금과 같음)':' ← 지금 실행 중 '+APP_VER+(IS_STAGING? ' (스테이징)':' — 새로고침 필요')); });
  await step('Supabase REST (load_all)', async function(){ var r=await fetch(SB_URL+'/rest/v1/rpc/load_all', {method:'POST', headers:{'Content-Type':'application/json', apikey:SB_KEY, Authorization:'Bearer '+ST.SB_TOKEN}, body:'{}'}); if(!r.ok) throw new Error('HTTP '+r.status); return 'HTTP 200'; });
  await step('AI (ask ping)', async function(){ var r=await aiFetch({mode:'ping'}, 12000); if(!r || r.ok===false) throw new Error((r&&r.error)||'응답 없음'); return (r.model||'ok'); });
  await step('remind (dry)', async function(){ var r=await fetch(SB_URL+'/functions/v1/remind?dry=1', {method:'POST', headers:{'Content-Type':'application/json', apikey:SB_KEY, Authorization:'Bearer '+ST.SB_TOKEN}, body:JSON.stringify({month:idxDate(STATE.base)})}); var j=await r.json(); if(!j.ok) throw new Error(j.error||('HTTP '+r.status)); return '이달 '+(j.counts&&j.counts.due)+' · 다음 달 '+(j.counts&&j.counts.next)+' · 미처리 '+(j.counts&&j.counts.lapsed); });
  await step('ops (status)', async function(){ var r=await opsCall('status'); return (r.github&&r.github.token_set? 'GitHub ✓':'GitHub ✗')+' · '+(r.mgmt_token_set? 'Supabase ✓':'Supabase ✗')+' · '+(r.log_ok? '기록 ✓':'기록 ✗'); });
  if(OPS.pin) await step('운영 DB (select 1 · 읽기 전용)', async function(){ var r=await opsCall('sql_run',{sql:'select 1 as ok, now() as at', read_only:true}); return Array.isArray(r.rows)&&r.rows[0]? String(r.rows[0].at||'').slice(0,19) : 'ok'; });
  await step('서비스 워커', async function(){ if(!('serviceWorker' in navigator)) return '미지원'; var reg=await navigator.serviceWorker.getRegistration(); return reg? (reg.active? '활성':'등록됨') : '없음 (file:// 또는 미등록)'; });
  OPS.health={running:false, rows:out, at:new Date()}; renderOps(true);
}
export async function opsLoadErrors(){
  try{ var rows=await sbTry('client_errors?select=at,email,ver,view,msg,url,n&order=at.desc&limit=30'); OPS.errs=rows||[]; }catch(e){ OPS.errs=[]; }
  renderOps(true);
}
/* ── SQL ── */
export function opsSqlHtml(){
  var res=OPS.sqlRes;
  var h='<div class="ops-h">SQL 실행 — Supabase Management API (SQL Editor 와 같은 경로) · 여러 문장·DO 블록 가능 · 결과는 마지막 문장 기준</div>';
  h+=tpl`<textarea id="opsSql" class="ops-ta" spellcheck="false" placeholder="-- 제가 드린 sql8N 파일을 그대로 붙여 넣으세요&#10;select now();">${OPS.sql||''}</textarea>`;
  h+=tpl`<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px"><label class="mini" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" id="opsRO"${OPS.sqlRO?' checked':''}> 읽기 전용(SELECT 확인용 · 바뀌는 건 전부 롤백)</label><span class="mini" id="opsSqlInfo">${opsSqlInfo(OPS.sql||'')}</span><button type="button" class="pill pri" id="opsSqlGo" style="margin-left:auto">실행 (Ctrl+Enter)</button></div>`;
  if(res){
    h+=tpl`<div class="ops-h x-head" style="margin-top:12px">결과 — ${rawHtml(res.row_count!=null? res.row_count+'행' : '행 없음')}${res.truncated? ' (500행까지 표시)':''}${res.read_only? ' · 읽기 전용(롤백됨)':''} · ${rawHtml(res.ms)}ms${closeBtn({'data-ops-close':'sqlRes'},'SQL 결과 닫기')}</div>`;
    var rows=Array.isArray(res.rows)? res.rows : (res.rows==null? [] : [res.rows]);
    if(rows.length && typeof rows[0]==='object' && rows[0]!==null){
      var cols=Object.keys(rows[0]); rows.slice(0,200).forEach(function(r){ Object.keys(r||{}).forEach(function(k){ if(cols.indexOf(k)<0) cols.push(k); }); });
      h+=tpl`<div style="max-height:46vh;overflow:auto"><table class="rn-tbl"><thead><tr>${rawHtml(cols.map(function(c){ return tpl`<th>${c}</th>`; }).join(''))}</tr></thead><tbody>${rawHtml(rows.slice(0,200).map(function(r){ return tpl`<tr>${rawHtml(cols.map(function(c){ var v=r? r[c] : null; return tpl`<td title="${v==null?'':(typeof v==='object'? JSON.stringify(v) : String(v))}">${rawHtml(esc(v==null? '' : (typeof v==='object'? JSON.stringify(v) : String(v))).slice(0,160))}</td>`; }).join(''))}</tr>`; }).join(''))}</tbody></table></div>${rawHtml(rows.length>200? '<p class="mini">표에는 200행까지만 — 전체는 엑셀로</p>':'')}`+
         tpl`<div style="margin-top:6px"><button type="button" class="pill ghost" id="opsSqlXls">⬇ 엑셀</button></div>`;
    } else h+=tpl`<pre class="ops-pre">${rawHtml(esc(JSON.stringify(res.rows, null, 1)||'(결과 없음)').slice(0,4000))}</pre>`;
  }
  return h;
}
export function opsSqlInfo(sql){
  var body=String(sql||'').replace(/--[^\n]*/g,'').replace(/\$[a-z0-9_]*\$[\s\S]*?\$[a-z0-9_]*\$/gi,'$$…$$');
  var n=body.split(/;\s*(?:\n|$)/).filter(function(s){ return s.trim(); }).length;
  var t={}; var re=/\b(?:from|join|update|into|table(?:\s+if\s+(?:not\s+)?exists)?|truncate|drop\s+table(?:\s+if\s+exists)?)\s+(?:only\s+)?((?:public\.)?[a-z_][a-z0-9_]*)/gi, m;
  while((m=re.exec(body))){ var nm=m[1].replace(/^public\./,''); if(!/^(select|where|values|set|lateral|unnest|generate_series)$/i.test(nm)) t[nm]=1; }
  var danger=/\b(drop\s+(table|schema|function)|truncate|delete\s+from)\b/i.test(body);
  return (n? n+'개 문장' : '')+(Object.keys(t).length? ' · 표: '+Object.keys(t).slice(0,8).join(', ') : '')+(danger? ' · ⚠ 삭제/드롭 포함':'');
}
export function opsSqlBind(host){
  var ta=host.querySelector('#opsSql'), info=host.querySelector('#opsSqlInfo');
  ta.oninput=function(){ OPS.sql=ta.value; if(info) info.textContent=opsSqlInfo(ta.value); };
  ta.onkeydown=function(e){ if((e.ctrlKey||e.metaKey) && e.key==='Enter'){ e.preventDefault(); opsSqlRun(); } if(e.key==='Tab'){ e.preventDefault(); var s=ta.selectionStart; ta.value=ta.value.slice(0,s)+'  '+ta.value.slice(ta.selectionEnd); ta.selectionStart=ta.selectionEnd=s+2; OPS.sql=ta.value; } };
  var ro=host.querySelector('#opsRO'); ro.onchange=function(){ OPS.sqlRO=ro.checked; };
  host.querySelector('#opsSqlGo').onclick=opsSqlRun;
  var x=host.querySelector('#opsSqlXls'); if(x) x.onclick=function(){ var rows=OPS.sqlRes.rows||[]; var cols=Object.keys(rows[0]||{}); xlsxAoa('sql_결과_'+todayStr(), cols, rows.map(function(r){ return cols.map(function(c){ var v=r[c]; return v!=null&&typeof v==='object'? JSON.stringify(v) : v; }); })); };
}
export async function opsSqlRun(){
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
export function opsFnHtml(){
  var L=OPS.fnList, sel=OPS.fnSel, meta=OPS.fnMeta;
  var h='<div class="ops-grid"><div><div class="ops-h">① 함수</div>';
  h+='<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><button type="button" class="pill ghost" id="opsFnList">목록 불러오기</button>';
  if(L) h+=tpl`<select id="opsFnSel" aria-label="Edge Function" style="min-width:160px"><option value="">— 함수 선택 —</option>${rawHtml(L.map(function(f){ return tpl`<option value="${f.slug}"${f.slug===sel?' selected':''}>${f.slug} · v${f.version}${f.verify_jwt? ' · JWT검사 ON':''}</option>`; }).join(''))}<option value="__new"${sel==='__new'?' selected':''}>＋ 새 함수…</option></select>`;
  if(sel==='__new') h+=tpl`<input id="opsFnNew" placeholder="새 함수 이름(slug · 영문 소문자)" value="${OPS.fnNew||''}" style="width:200px">`;
  if(sel && sel!=='__new') h+='<button type="button" class="pill ghost" id="opsFnGet">코드 불러오기</button>';
  h+='</div>';
  if(meta) h+=tpl`<p class="mini" style="margin:8px 0 0">${meta.slug} · v${meta.version} · 진입점 ${meta.entrypoint_path||'index.ts'} · Verify JWT ${meta.verify_jwt?'ON':'OFF'} · 수정 ${String(meta.updated_at||'').replace('T',' ').slice(0,16)}${rawHtml(OPS.fnFiles&&OPS.fnFiles.length>1? ' · 파일 '+OPS.fnFiles.length+'개(첫 파일만 편집·배포됨)':'')}</p>`;
  h+='<div class="ops-h" style="margin-top:12px">② 코드</div><div class="ops-drop" id="opsFnDrop" tabindex="0">index.ts 파일을 끌어다 놓거나 <u>클릭</u> — 또는 아래 칸에 붙여넣기<input type="file" id="opsFnFile" accept=".ts,.js,.tsx" style="display:none"></div>';
  h+=tpl`<textarea id="opsFnCode" class="ops-ta" spellcheck="false" style="min-height:260px;margin-top:8px" placeholder="// Deno.serve(async (req) => { … })">${OPS.fnCode||''}</textarea>`;
  h+=tpl`<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px"><label class="mini">파일명 <input id="opsFnName" value="${OPS.fnName||'index.ts'}" style="width:140px"></label><label class="mini" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" id="opsFnVerify"${OPS.fnVerify?' checked':''}> Verify JWT (포탈 함수는 전부 OFF)</label><span class="mini" id="opsFnInfo">${rawHtml(OPS.fnCode? (OPS.fnCode.length.toLocaleString('ko-KR')+'자'):'')}</span><button type="button" class="pill pri" id="opsFnDeploy" style="margin-left:auto">배포</button>${rawHtml(sel&&sel!=='__new'? '<button type="button" class="pill ghost" id="opsFnPatch" title="코드는 그대로 두고 Verify JWT 설정만 저장">설정만 저장</button>':'')}</div>`;
  h+='</div><div><div class="ops-h">배포 메모</div><ul class="mini" style="margin:0;padding-left:16px;line-height:1.7"><li>슬러그(이름)는 URL 이 됩니다 — <code>…/functions/v1/슬러그</code>. 한 번 만들면 못 바꿉니다.</li><li>Verify JWT 는 ask·remind·ops 모두 <b>OFF</b> — 함수가 직접 로그인 토큰을 검사합니다. ON 이면 포탈에서 Failed to fetch.</li><li>Secrets 를 바꾼 뒤에는 그 함수를 다시 배포해야 새 값을 읽습니다.</li><li>배포 뒤 10~20초 지나서 포탈에서 호출해 보세요.</li></ul></div></div>';
  return h;
}
export function opsFnBind(host){
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
export async function opsFnDeploy(){
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
export function aiHasNum(a, won){
  if(won==null || isNaN(won)) return true;
  var t=String(a||'').replace(/\s/g,''), cands=[], W=Number(won);
  var k=Math.round(W/1000); cands.push(String(k), k.toLocaleString('ko-KR'));
  /* ㊿+147: 만원·원 표기도 인정 — «약 9,956만원(99,557,735원)»을 «기대값 없음»으로 잘못 떨어뜨리던 것 (반올림·버림 둘 다) */
  [Math.round(W/1e4), Math.floor(W/1e4)].forEach(function(m){ if(m>0) cands.push(m+'만', m.toLocaleString('ko-KR')+'만'); });
  if(Math.abs(W)>=1000) cands.push(Math.round(W).toLocaleString('ko-KR')+'원', String(Math.round(W))+'원');
  var mm=Math.round(Number(won)/1e6); if(mm>0) cands.push(mm+'백만', mm.toLocaleString('ko-KR')+'백만');
  var ek=Number(won)/1e8; if(ek>=0.1) cands.push(ek.toFixed(1)+'억', ek.toFixed(2)+'억', (Math.round(ek*10)/10)+'억');
  return cands.some(function(c){ return c && t.indexOf(c)>=0; });
}
export function aiHasCount(a, n){ if(n==null) return true; var t=String(a||'').replace(/\s/g,''); if(n===0) return /없|0건|0곳|0개|않습니다/.test(t); return t.indexOf(String(n))>=0; }
export var AI_CHECK_QS=[
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
export async function aiCheckRun(){
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
  var failsL=OPS.aic.rows.filter(function(r){ return !r.ok; }).map(function(r){ return {q:r.q, why:r.st, head:String(r.text||'').slice(0,160)}; });
  try{ logChange('ai_check','ask',APP_VER,{pass:pass, total:OPS.aic.rows.length, avg_ms:OPS.aic.summary.avg_ms, cut:cut, fails:failsL.map(function(f){ return f.q+' — '+f.why; })}); }catch(e){}
  /* SQL 94 ai_check_log 에도(표 없으면 조용히 건너뜀) → 기록 탭 «AI 점검 추이»에서 야간 자동 점검(aicheck)과 함께 봄 */
  try{ await sbWrite('POST','ai_check_log',{source:'portal', app_ver:APP_VER, pass:pass, total:OPS.aic.rows.length, avg_ms:OPS.aic.summary.avg_ms, model:OPS.aic.summary.models[0]||null, fails:failsL, rows:OPS.aic.rows.map(function(r){ return {q:r.q, ok:!!r.ok, why:r.st, ms:r.ms||0, tools:r.tools||0}; }), actor:ST.AUTH_USER||null}); AIQ.trend=null; }catch(e){}
  toast('AI 점검 끝', pass+'/'+OPS.aic.rows.length+' 통과 · 평균 '+Math.round(OPS.aic.summary.avg_ms/1000)+'초', pass===OPS.aic.rows.length? 'ok':'warn');
  renderOps(true); aiqLoad();
}
export function aiCheckHtml(){
  var A=OPS.aic;
  var h=tpl`<div class="ops-h" style="display:flex;align-items:center;gap:10px;margin-top:14px">AI 점검 (대표 질문 15개 → ask 함수 → 기대값 확인) <button type="button" class="cbtn" id="opsAiCheck"${A&&A.running? ' disabled':''}>${A&&A.running? '점검 중…':'15문 점검 실행'}</button>`+ tpl`${rawHtml(A&&A.summary? tpl`<span class="mini">${rawHtml(A.summary.pass)}/${rawHtml(A.summary.total)} 통과 · 평균 ${Math.round(A.summary.avg_ms/1000)}초${rawHtml(A.summary.cut? ' · 예산 초과/축약 '+A.summary.cut:'')}${rawHtml(A.summary.models.length? ' · '+esc(A.summary.models.join(', ')):'')} · ${String(A.at||'').replace('T',' ').slice(0,16)}</span><button type="button" class="cbtn" id="opsAiXlsx">엑셀</button>`:'')}${A&&!A.running? closeBtn({'data-ops-close':'aic'},'AI 점검 결과 닫기'):''}</div>`;
  if(!A) h+='<p class="mini" style="margin:0 0 14px">모델·함수 배포 뒤 «AI 가 여전히 숫자를 맞게 말하나»를 확인합니다 — 질문 15개를 동시 3개씩 보내 2~3분 걸리고, 요약은 변경 이력(ai_check)에 남습니다. 질문·기대값은 코드의 AI_CHECK_QS.</p>';
  else h+=tpl`<table class="rn-tbl" style="margin-bottom:14px"><thead><tr><th>#</th><th>질문</th><th>기대</th><th>결과</th><th class="n">시간</th><th>모델 · 도구</th><th>답(앞부분)</th></tr></thead><tbody>${rawHtml(A.rows.map(function(r,i){
      var col=r.st==='통과'? 'var(--brand)' : r.st==='대기'||r.st==='진행'? 'var(--muted)' : 'var(--critical)';
      return tpl`<tr><td class="mini">${rawHtml(i+1)}</td><td class="q-col">${r.q}</td><td class="mini">${r.l}</td><td class="nw" style="color:${rawHtml(col)}">${rawHtml(r.st==='통과'? '✓ 통과': r.st==='진행'? '⏳ 진행' : r.st==='대기'? '· 대기' : '✗ '+esc(r.st))}${rawHtml(r.cut? ' <span class="mini">(축약)</span>':'')}</td><td class="n mini">${rawHtml(r.ms? (r.ms/1000).toFixed(1)+'s':'')}</td><td class="mini">${r.model||''}${rawHtml(r.tools? ' · 도구 '+r.tools:'')}</td><td class="mini wrap ans-col">${r.text||''}</td></tr>`; }).join(''))}`+ tpl`</tbody></table>`;
  return h;
}
/* ===== AI 품질 (SQL 94 · ㊿+139): 점검 추이(포탈 수동 + 야간 자동 aicheck) · 👎 피드백 목록 ===== */
export var AIQ={trend:null, fb:null, loading:false};
export async function aiqLoad(){
  if(AIQ.loading) return; AIQ.loading=true;
  var t=await sbTry('ai_check_log?select=run_at,source,pass,total,avg_ms,model,fails&order=run_at.desc&limit=7');
  var f=await sbTry('ai_feedback?select=created_at,email,verdict,question,answer_head,note&order=created_at.desc&limit=30');
  AIQ.trend=t||[]; AIQ.fb=f||[]; AIQ.loading=false; AIQ.at=Date.now();
  if(ST.CUR_VIEW==='ops' && OPS.tab==='log') renderOps(true);
}
export function aiqHtml(){
  var T=AIQ.trend, F=AIQ.fb;
  var h='<div class="ops-h" style="display:flex;align-items:center;gap:10px;margin-top:14px">AI 점검 추이 <span class="mini">(포탈 15문 + 야간 자동 aicheck · 최근 7회)</span> <button type="button" class="cbtn" id="aiqReload">↻</button></div>';
  if(T===null) h+='<p class="mini" style="margin:0 0 14px">불러오는 중…</p>';
  else if(!T.length) h+='<p class="mini" style="margin:0 0 14px">기록이 없습니다 — SQL 94 를 실행하고 15문 점검을 돌리거나, aicheck 함수를 배포해 야간 자동 점검을 켜면 쌓입니다.</p>';
  else h+=tpl`<table class="rn-tbl" style="margin-bottom:14px"><thead><tr><th>일시</th><th>출처</th><th class="n">통과</th><th class="n">평균</th><th>모델</th><th>실패 질문</th></tr></thead><tbody>${rawHtml(T.map(function(r){
      var rate=r.total? r.pass/r.total:0, col=rate>=0.9? 'var(--brand)': rate>=0.7? 'var(--warn-ink)':'var(--critical)';
      var fl=Array.isArray(r.fails)? r.fails.map(function(f){ return typeof f==='string'? f : (f.q||''); }).filter(Boolean) : [];
      return tpl`<tr><td class="mini">${String(r.run_at||'').replace('T',' ').slice(0,16)}</td><td class="nw">${r.source==='cron'? '🌙 자동':'🧑 수동'}</td><td class="n" style="color:${rawHtml(col)};font-weight:700">${rawHtml(r.pass)}/${rawHtml(r.total)}</td><td class="n mini">${rawHtml(r.avg_ms? (r.avg_ms/1000).toFixed(1)+'s':'')}</td><td class="mini">${String(r.model||'').replace(/^claude-/,'')}</td><td class="mini wrap">${fl.slice(0,3).join(' · ')}${rawHtml(fl.length>3? ' 외 '+(fl.length-3):'')}</td></tr>`; }).join(''))}`+ tpl`</tbody></table>`;
  h+='<div class="ops-h" style="display:flex;align-items:center;gap:10px">답변 피드백 <span class="mini">(홈 AI 답 밑 👍/👎 · 최근 30건)</span></div>';
  if(F===null) h+='<p class="mini" style="margin:0 0 14px">불러오는 중…</p>';
  else if(!F.length) h+='<p class="mini" style="margin:0 0 14px">아직 피드백이 없습니다. 👎 가 쌓이면 여기서 보고 AI 지식에 보강하세요.</p>';
  else { var up=F.filter(function(x){ return x.verdict==='up'; }).length, dn=F.length-up;
    h+=tpl`<p class="mini" style="margin:0 0 6px">👍 ${rawHtml(up)} · 👎 ${rawHtml(dn)}</p><table class="rn-tbl" style="margin-bottom:14px"><thead><tr><th>일시</th><th></th><th>질문</th><th>답(앞부분)</th><th>메모</th><th>누가</th></tr></thead><tbody>${rawHtml(F.filter(function(x){ return x.verdict==='down'; }).concat(F.filter(function(x){ return x.verdict==='up'; }).slice(0,5)).map(function(x){
      return tpl`<tr><td class="mini">${String(x.created_at||'').replace('T',' ').slice(0,16)}</td><td class="nw">${x.verdict==='up'? '👍':'👎'}</td><td class="q-col">${x.question||''}</td><td class="mini wrap ans-col">${String(x.answer_head||'').slice(0,110)}</td><td class="mini wrap" style="--td-min:120px">${x.note||''}</td><td class="mini">${String(x.email||'').split('@')[0]}</td></tr>`; }).join(''))}`+ tpl`</tbody></table>`; }
  return h;
}
export function aiCheckBind(host){
  var q=host.querySelector('#aiqReload'); if(q) q.onclick=function(){ AIQ.trend=null; AIQ.fb=null; renderOps(true); aiqLoad(); };
  if(AIQ.trend===null && !AIQ.loading) aiqLoad();
  var b=host.querySelector('#opsAiCheck'); if(b) b.onclick=aiCheckRun;
  var x=host.querySelector('#opsAiXlsx'); if(x) x.onclick=function(){ var A=OPS.aic; if(!A) return; xlsxAoa('AI점검_'+String(A.at||'').slice(0,10), ['#','질문','기대','결과','시간(s)','모델','도구','답'], A.rows.map(function(r,i){ return [i+1, r.q, r.l, r.st, r.ms? +(r.ms/1000).toFixed(1):'', r.model||'', r.tools||0, r.text||'']; })); };
}
export function opsLogHtml(){
  var st=OPS.st, L=(st&&st.ok&&st.recent)||[], H=OPS.health, E=OPS.errs;
  var h=tpl`<div class="ops-h" style="display:flex;align-items:center;gap:10px">시스템 점검 <button type="button" class="cbtn" id="opsHealth"${H&&H.running? ' disabled':''}>${H&&H.running? '점검 중…':'지금 점검'}</button>${rawHtml(H&&H.at? tpl`<span class="mini">${H.at.toLocaleTimeString('ko-KR')}</span>`:'')}${H&&!H.running&&H.rows.length? closeBtn({'data-ops-close':'health'},'점검 결과 닫기'):''}</div>`;
  if(H && H.rows.length) h+=tpl`<table class="rn-tbl" style="margin-bottom:14px"><tbody>${rawHtml(H.rows.map(function(r){ return tpl`<tr><td style="width:240px">${r.name}</td><td>${rawHtml(r.ok? '<span class="up">✓</span>':'<span style="color:var(--critical)">✗</span>')} ${r.info}</td><td class="n mini">${rawHtml(r.ms)}ms</td></tr>`; }).join(''))}</tbody></table>`;
  else h+='<p class="mini" style="margin:0 0 14px">Pages 최신 버전 · Supabase REST · AI · remind · ops · (PIN 있으면) 운영 DB · 서비스 워커를 순서대로 확인합니다.</p>';
  h+=tpl`<div class="ops-h" style="display:flex;align-items:center;gap:10px">브라우저 오류 (사용자 화면에서 난 JS 오류 · 최근 30건) <button type="button" class="cbtn" id="opsErrs">불러오기</button>${E!=null? closeBtn({'data-ops-close':'errs'},'오류 목록 닫기'):''}</div>`;
  if(E===null) h+='<p class="mini" style="margin:0 0 14px">«불러오기»를 누르면 client_errors 표(SQL 86)를 읽습니다.</p>';
  else if(!E.length) h+='<p class="mini" style="margin:0 0 14px">기록된 오류가 없습니다 ✓</p>';
  else h+=tpl`<table class="rn-tbl" style="margin-bottom:14px"><thead><tr><th>일시</th><th>계정</th><th>버전</th><th>화면</th><th>오류</th><th class="n">반복</th></tr></thead><tbody>${rawHtml(E.map(function(r){ return tpl`<tr><td class="mini">${String(r.at||'').replace('T',' ').slice(0,19)}</td><td class="mini">${r.email||''}</td><td class="mini">${String(r.ver||'').replace(/^.*\s/,'')}</td><td>${r.view||''}</td><td title="${r.msg||''}">${rawHtml(esc(String(r.msg||'')).slice(0,100))}</td><td class="n">${rawHtml(r.n||1)}</td></tr>`; }).join(''))}</tbody></table>`;
  h+=aiCheckHtml();
  h+=aiqHtml();
  h+='<div class="ops-h">배포·운영 기록 (ops_log · 최근 30건)</div>';
  if(!st) h+='<p class="cap">상태 확인 중…</p>';
  else if(!st.ok) h+=tpl`<p class="cap" style="color:var(--critical)">${st.error||''}</p>`;
  else if(!st.log_ok) h+='<p class="cap">기록표(ops_log · SQL 85)가 없거나 함수에 service role 이 없어 기록을 읽지 못합니다.</p>';
  else if(!L.length) h+='<p class="cap">아직 기록이 없습니다.</p>';
  else h+=tpl`<table class="rn-tbl"><thead><tr><th>일시</th><th>계정</th><th>동작</th><th>대상</th><th>요약</th><th>결과</th></tr></thead><tbody>${rawHtml(L.map(function(r){ return tpl`<tr><td class="mini">${String(r.at||'').replace('T',' ').slice(0,19)}</td><td class="mini">${r.actor}</td><td><code>${r.action}</code></td><td class="wrap">${rawHtml(opsTgtHtml(r.target))}</td><td class="wrap" title="${r.summary||''}">${rawHtml(esc(String(r.summary||'')).slice(0,80))}</td><td class="wrap">${rawHtml(r.ok? tpl`<span class="up">✓</span>${rawHtml(r.ms? tpl` <span class="mini">${rawHtml(r.ms)}ms</span>`:'')}` : tpl`<span style="color:var(--critical)" title="${r.error||''}">✗ ${rawHtml(esc(String(r.error||'')).slice(0,60))}</span>`)}</td></tr>`; }).join(''))}</tbody></table>`;
  return h;
}
/* ㊿+141: 기록의 «대상»이 파일 수십 개(콤마 목록)면 표가 카드 밖으로 3,000px 넘게 밀려나던 문제 — 공통 폴더 + 개수 + 앞 3개로 줄이고, 누르면 전체 */
export function opsTgtHtml(t){
  t=String(t||''); var parts=t.split(/,\s*/).filter(Boolean);
  if(parts.length<=3) return esc(t);
  var m=/^([^\/]+\/)/.exec(parts[0]), pre=(m && parts.every(function(p){ return p.indexOf(m[1])===0; }))? m[1] : '';
  var names=parts.map(function(p){ return pre? p.slice(pre.length) : p; });
  return tpl`<details class="ops-tgt"><summary>${rawHtml(pre? tpl`<b>${pre}</b> `:'')}파일 ${names.length}개 — ${names.slice(0,3).join(', ')} …</summary><div class="mini">${names.join(', ')}</div></details>`;
}
export function opsLogBind(host){
  aiCheckBind(host);
  var hb=host.querySelector('#opsHealth'); if(hb) hb.onclick=opsHealth;
  var eb=host.querySelector('#opsErrs'); if(eb) eb.onclick=opsLoadErrors;
}

/* ㊿+149 관리자 화면 탭 4개 (사용자: «너무 지저분 · 스크롤 많고 난잡») — 계정·권한 / 보안 / 설정(코드 관리·업데이트 안내) / AI 비용
   · 메뉴를 누르면 첫 탭(viewReset · VIEW_UI.adminx.ADM) · 뒤로가기는 보던 탭 · 데이터는 예전처럼 한 번에 읽고 보이는 탭만 바꿈 */
export var ADM={tab:'acct'};
export function admTab(t){
  if(t) ADM.tab=t;
  if(!document.querySelector('#viewAdmin .adm-pane[data-pane="'+ADM.tab+'"]')) ADM.tab='acct';
  document.querySelectorAll('#admTabs button').forEach(function(b){ b.setAttribute('aria-pressed', String(b.dataset.t===ADM.tab)); });
  document.querySelectorAll('#viewAdmin .adm-pane').forEach(function(p){ p.hidden=(p.dataset.pane!==ADM.tab); });
}
export function renderAdmin(){
  if(!ST.IS_SUPER){ switchView('dash'); return; }
  var tb=document.getElementById('admTabs');
  if(tb && !tb.__bound){ tb.__bound=1; tb.querySelectorAll('button').forEach(function(b){ b.onclick=function(){ admTab(b.dataset.t); try{ scrollTo(0,0); }catch(e){} }; }); }
  admTab();
  var rs=$('#axRole');
  if(!rs.options.length){
    rs.innerHTML=tpl`<option value="">권한 없음 (나중에 지정)</option>`+
      tpl`${rawHtml(AX_ROLES.map(function(r){ return tpl`<option value="${rawHtml(r)}">${rawHtml(r)} — ${rawHtml(AX_ROLE_KO[r])}</option>`; }).join(''))}`;
    rs.value='viewer';
    $('#axReload').onclick=axLoad;
    $('#axQ').oninput=axPaint;
    $('#axCreate').onclick=axCreate;
    $('#abSave').onclick=abSave;
  }
  try{ apBind(); }catch(e){}
  try{ mfBind(); mfLoad(); }catch(e){}
  try{ cdBind(); cdLoad(); }catch(e){}
  try{ updAdminLoad(); }catch(e){}
  try{ API.made=null; apiLoad(); }catch(e){}   /* ㊿+164 외부 연동 — 다시 열면 발급 직후 보이던 키 원문은 지움 */
  axLoad();
  abLoad();
}
/* ── 메뉴 권한 (user_perms · SQL 79) — 계정마다 보기/읽기/쓰기, 슈퍼 관리자만 ── */
export var AP={user:'', rows:{}, bound:false};
export function apMenus(){
  var out=[], grp='';
  Array.prototype.forEach.call($('#side').children, function(el){
    if(el.classList && el.classList.contains('grp')){ grp=el.textContent.trim(); return; }
    if(el.tagName!=='BUTTON') return;
    var v=el.dataset.v; if(!v || PERM_EXEMPT[v] || el.id==='btnMenuEdit') return;
    var sub=navSub(el); out.push({grp:grp+(sub? ' · '+sub:''), v:v, label:navText(el)});   /* ㊿+142: 소제목별로 묶어 표시 */
  });
  return out;
}
export function apRoleOf(email){ var u=(AX_USERS||[]).filter(function(x){ return String(x.email||'').toLowerCase()===String(email||'').toLowerCase(); })[0]; return u? (u.role||'') : ''; }
export function apDefault(role){ return (role==='admin_viewer'||role==='viewer')? {v:true,r:true,w:false} : {v:true,r:true,w:true}; }
export function apFillUsers(){
  var sel=$('#apUser'), cp=$('#apCopy'); if(!sel) return;
  var cur=sel.value;
  var opts=(AX_USERS||[]).slice().sort(function(a,b){ return String(a.email||'').localeCompare(String(b.email||'')); })
    .map(function(u){ return tpl`<option value="${u.email||''}">${u.email||''}${rawHtml(u.role? ' — '+esc(AX_ROLE_KO[u.role]||u.role):' — 권한 없음')}</option>`; }).join('');
  sel.innerHTML=tpl`<option value="">계정 선택…</option>${rawHtml(opts)}`; sel.value=cur;
  if(cp){ cp.innerHTML=tpl`<option value="">다른 계정 설정 복사…</option>${rawHtml(opts)}`; }
}
export async function apFetch(email){
  var rows=await sbTry('user_perms?select=view,can_view,can_read,can_write&email=eq.'+encodeURIComponent(String(email).toLowerCase()));
  var m={}; (rows||[]).forEach(function(r){ m[r.view]={v:r.can_view!==false, r:r.can_read!==false, w:!!r.can_write}; });
  return {map:m, n:(rows||[]).length};
}
export async function apLoadUser(email){
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
export function apSet(v,k,on){
  var p=AP.rows[v]||{v:true,r:true,w:false};
  if(k==='v'){ p.v=on; if(!on){ p.r=false; p.w=false; } }
  if(k==='r'){ p.r=on; if(on) p.v=true; else p.w=false; }
  if(k==='w'){ p.w=on; if(on){ p.r=true; p.v=true; } }
  AP.rows[v]=p;
}
export function apPaint(){
  var t=$('#apTable'); if(!t) return;
  var role=apRoleOf(AP.user), isSuper=role==='super_admin', roleRO=(role==='admin_viewer'||role==='viewer'), limited=ROLE_VIEWS[role]||null;
  var menus=apMenus(), grp='';
  var h='<thead><tr><th>메뉴</th><th style="width:90px;text-align:center">보기</th><th style="width:90px;text-align:center">읽기</th><th style="width:90px;text-align:center">쓰기</th><th></th></tr></thead><tbody>';
  menus.forEach(function(m){
    if(m.grp!==grp){ grp=m.grp; h+=tpl`<tr><td colspan="5" style="background:var(--surface-2);font-size:11px;font-weight:650;color:var(--ink-2);padding:6px 10px">${grp||'기타'}</td></tr>`; }
    var p=AP.rows[m.v]||{v:true,r:true,w:false};
    var na=limited && !limited[m.v];             // 제한 역할(poc·장비)은 역할에 없는 메뉴 자체가 없음
    var dis=isSuper||na;
    function cb(k,on,disabled){ return tpl`<td style="text-align:center"><input type="checkbox" data-ap="${rawHtml(k)}" data-v="${m.v}"${on?' checked':''}${disabled?' disabled':''} style="width:16px;height:16px"></td>`; }
    h+=tpl`<tr${rawHtml(na?' class="row-dim"':'')}><td>${m.label}</td>`+
      tpl`${rawHtml(cb('v', isSuper||(!na&&p.v), dis))}${rawHtml(cb('r', isSuper||(!na&&p.r), dis))}${rawHtml(cb('w', isSuper||(!na&&p.w), dis||roleRO))}`+
      tpl`<td class="mini">${rawHtml(isSuper? '슈퍼 관리자 — 제한 불가' : na? '역할('+esc(AX_ROLE_KO[role]||role)+')에 없는 메뉴' : roleRO&&p.r? '조회 전용 역할 — 쓰기 불가' : (!p.v? '숨김' : !p.r? '메뉴만 보임' : !p.w? '읽기만' : ''))}</td></tr>`;
  });
  h+='</tbody>';
  t.innerHTML=h;
  t.querySelectorAll('input[data-ap]').forEach(function(inp){ inp.onchange=function(){ apSet(inp.dataset.v, inp.dataset.ap, inp.checked); apPaint(); }; });
}
export function apPreset(mode){
  if(!AP.user) return;
  var role=apRoleOf(AP.user), roleRO=(role==='admin_viewer'||role==='viewer');
  apMenus().forEach(function(m){ AP.rows[m.v]= mode==='all'? {v:true,r:true,w:!roleRO} : mode==='read'? {v:true,r:true,w:false} : {v:false,r:false,w:false}; });
  apPaint();
}
export async function apSave(){
  if(!AP.user){ toast('계정을 먼저 고르세요','','bad'); return; }
  var role=apRoleOf(AP.user); if(role==='super_admin'){ toast('슈퍼 관리자는 제한할 수 없습니다','','info'); return; }
  var now=new Date().toISOString(), em=String(AP.user).toLowerCase();
  var rows=apMenus().map(function(m){ var p=AP.rows[m.v]||{v:true,r:true,w:false}; return {email:em, view:m.v, can_view:!!p.v, can_read:!!(p.v&&p.r), can_write:!!(p.v&&p.r&&p.w), updated_by:ST.AUTH_USER||null, updated_at:now}; });
  var b=$('#apSave'); b.disabled=true; $('#apMsg').textContent='저장 중…';
  try{
    await sbWrite('POST','user_perms?on_conflict=email,view', rows, 'resolution=merge-duplicates,return=minimal');
    try{ logChange('perms','user_perms',null,{email:em, n:rows.length, hidden:rows.filter(function(r){ return !r.can_view; }).map(function(r){ return r.view; }), readonly:rows.filter(function(r){ return r.can_view&&!r.can_write; }).map(function(r){ return r.view; })}); }catch(e){}
    $('#apMsg').textContent='저장됨 — '+em+' 은 다음에 화면을 새로 읽을 때 적용';
    toast('메뉴 권한 저장', em, 'ok');
    if(em===String(ST.AUTH_USER||'').toLowerCase()){ await loadPerms(); applyPerms(); }
  }catch(e){ $('#apMsg').textContent=String(e.message||e).slice(0,160); toast('저장 실패', String(e.message||e).slice(0,120), 'bad'); }
  b.disabled=false;
}
export function apBind(){
  if(AP.bound) return; AP.bound=true;
  $('#apUser').onchange=function(){ apLoadUser(this.value); };
  $('#apAll').onclick=function(){ apPreset('all'); };
  $('#apRead').onclick=function(){ apPreset('read'); };
  $('#apNone').onclick=function(){ apPreset('none'); };
  $('#apSave').onclick=apSave;
  $('#apCopy').onchange=async function(){ var src=String(this.value||''); this.value=''; if(!src||!AP.user) return; if(src.toLowerCase()===String(AP.user).toLowerCase()) return;
    try{ var got=await apFetch(src); var d=apDefault(apRoleOf(src)); apMenus().forEach(function(m){ AP.rows[m.v]=got.map[m.v]? got.map[m.v] : {v:d.v,r:d.r,w:d.w}; }); apPaint(); $('#apMsg').textContent=src+' 설정을 가져왔습니다 — 저장을 눌러야 반영'; }
    catch(e){ toast('복사 실패', String(e.message||e).slice(0,100), 'bad'); } };
}

/* ── AI 사용 비용 (Anthropic Cost API + 충전액 기준 잔여 추정) ── */
export async function abLoad(){
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
  catch(e){ kpi.innerHTML=tpl`<div class="cap">⚠ ${String(e.message||e)}</div>`; return; }
  var credit=bill? Number(bill.credit_usd)||0 : 0;
  var remain=credit? Math.round((credit-r.total_usd)*100)/100 : null;
  function box(l,v,s,warn){
    return tpl`<div class="kpi${warn?'':''}" style="padding:11px 14px"><div style="font-size:11px;color:var(--muted);font-weight:650">${rawHtml(l)}</div>`+
      tpl`<div style="font-size:18px;font-weight:800;margin-top:2px${warn?';color:var(--critical)':''}">${rawHtml(v)}</div>`+
      tpl`<div style="font-size:11px;color:var(--muted)">${rawHtml(s)}</div></div>`;
  }
  var usd=function(v){ return (v!=null && isFinite(Number(v)))? '$'+Number(v).toLocaleString('en-US') : '—'; };   /* ㊿+151: 값 없으면 $NaN 대신 — (스테이징 QA 가 잡음) */
  kpi.innerHTML=
    box('잔여 크레딧 (추정)', remain==null?'충전액 미입력':'$'+remain.toLocaleString('en-US'),
        remain==null?'아래에 충전액·충전일을 입력하세요':'충전액 $'+credit+' − 사용 $'+r.total_usd, remain!=null&&remain<5)+
    box('이번 달 사용액', usd(r.month_usd), thisMonthStr()+' 실측 (Cost API)')+
    box('기준일 이후 사용액', usd(r.total_usd), (r.from||'—')+' 부터 누적')+
    (r.partial? tpl`<div class="cap" style="grid-column:1/-1;color:var(--warn-ink)">⚠ 일부 기간만 집계됐습니다 — ${String(r.partial)}</div>`:'');
  var mx=0.01; (r.daily||[]).forEach(function(d){ mx=Math.max(mx,d.usd); });
  bars.innerHTML=(r.daily&&r.daily.length)?
    tpl`<div class="mini" style="margin-bottom:4px">최근 14일 일별 사용액</div>`+
    tpl`<div style="display:flex;align-items:flex-end;gap:3px;height:52px">`+
    tpl`${rawHtml(r.daily.map(function(d){
      return tpl`<div title="${rawHtml(d.d)} · $${rawHtml(d.usd)}" style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:2px">`+
        tpl`<div style="width:100%;border-radius:3px 3px 0 0;background:var(--brand);height:${Math.max(2,Math.round(d.usd/mx*40))}px"></div>`+
        tpl`<span style="font-size:11px;color:var(--muted)">${rawHtml(d.d.slice(8))}</span></div>`;
    }).join(''))}`+ tpl`</div>` : '';
}
export async function abSave(){
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
export var MF={rows:null, bound:false};
export function mfMsg(t,bad){ var e=$('#mfMsg'); if(e){ e.textContent=t||''; e.style.color=bad? 'var(--critical)':''; } }
export async function mfLoad(){
  mfMsg('불러오는 중…'); mfRoleLoad();
  try{ MF.rows=await sbWrite('POST','rpc/mfa_admin_list',{})||[]; mfMsg(MF.rows.length+'개 계정 · 등록 '+MF.rows.filter(function(r){ return r.enrolled; }).length+' · 필수 '+MF.rows.filter(function(r){ return r.required; }).length); mfPaint(); }
  catch(e){ MF.rows=null; var m=String(e.message||e); mfMsg(/mfa_admin_list|404|schema cache/i.test(m)? 'SQL 89 가 아직 실행되지 않았습니다 (배포·운영 › SQL 탭에서 sql89 실행)' : m.slice(0,120), true); $('#mfTable').innerHTML=''; }
}
export function mfPaint(){
  var t=$('#mfTable'); if(!t||!MF.rows) return;
  t.innerHTML='<thead><tr><th>이메일</th><th>권한</th><th>인증 앱</th><th style="width:60px">필수</th><th style="width:150px">기한</th><th>메모</th><th class="act" style="width:220px"></th></tr></thead>';
  var tb=document.createElement('tbody');
  MF.rows.forEach(function(r){
    var tr=document.createElement('tr'); var me=(r.email||'').toLowerCase()===(ST.AUTH_USER||'').toLowerCase();
    /* ㊿+147 SQL 95: 실제 적용 = 계정 지정 OR 역할 기본 (eff_* 가 없으면 SQL 95 전 — 계정 지정만) */
    var effReq=(r.eff_required!=null)? r.eff_required : r.required, effDl=(r.eff_required!=null)? r.eff_deadline : r.deadline, byRole=/role/.test(r.source||'');
    var due=effReq && !r.enrolled && (!effDl || effDl<=new Date().toISOString().slice(0,10));
    tr.innerHTML=tpl`<td>${r.email||''}${rawHtml(me? ' <span class="mini">(나)</span>':'')}</td>`+
      tpl`<td class="mini">${AX_ROLE_KO[r.role]||r.role||'권한 없음'}</td>`+
      tpl`<td>${rawHtml(r.enrolled? tpl`<span style="color:var(--brand)">✓ 등록</span> <span class="mini">${String(r.factor_at||'').slice(0,10)}</span>` : (effReq? tpl`<span style="color:${due? 'var(--critical)':'var(--warn-ink)'}">${rawHtml(due? '미등록 · 차단 중':'미등록 · 유예 '+esc(effDl||''))}</span>${rawHtml(byRole? ' <span class="ctag" title="역할 기본 정책(SQL 95)으로 필수">역할 기본</span>':'')}` : '<span class="mini">미등록</span>'))}</td>`+
      tpl`<td><input type="checkbox" data-mf-req="${r.email}"${r.required?' checked':''}></td>`+
      tpl`<td><input type="date" data-mf-dl="${r.email}" value="${r.deadline||''}"${r.required?'':' disabled'} style="height:30px;width:140px"></td>`+
      tpl`<td><input data-mf-note="${r.email}" value="${r.note||''}" placeholder="메모" style="height:30px;width:100%;min-width:90px"></td>`+
      tpl`<td class="act"><button type="button" class="cbtn pri" data-mf-save="${r.email}">저장</button>${rawHtml(r.enrolled? tpl` <button type="button" class="cbtn" data-mf-reset="${r.email}" title="폰 분실 등 — 이 계정의 인증 앱 등록을 지웁니다">인증 앱 초기화</button>`:'')}</td>`;
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  t.querySelectorAll('[data-mf-req]').forEach(function(c){ c.onchange=function(){ var d=t.querySelector('[data-mf-dl="'+CSS.escape(c.dataset.mfReq)+'"]'); if(d){ d.disabled=!c.checked; if(c.checked && !d.value) d.value=mfPlus(7); } }; });
  t.querySelectorAll('[data-mf-save]').forEach(function(b){ b.onclick=function(){ mfSave(b.dataset.mfSave); }; });
  t.querySelectorAll('[data-mf-reset]').forEach(function(b){ b.onclick=function(){ mfReset(b.dataset.mfReset); }; });
}
export function mfPlus(days){ var d=new Date(); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); }
export async function mfSave(email){
  var t=$('#mfTable'); var q=function(sel){ return t.querySelector('['+sel+'="'+CSS.escape(email)+'"]'); };
  var req=q('data-mf-req').checked, dl=q('data-mf-dl').value||null, note=q('data-mf-note').value.trim()||null;
  if(req && !dl && !confirm(email+' 을(를) 기한 없이 «즉시 필수»로 지정합니다 — 다음 로그인부터 인증 앱을 등록해야 들어올 수 있습니다. 계속할까요?')) return;
  mfMsg('저장 중…');
  try{ await sbWrite('POST','rpc/mfa_admin_set',{p_email:email, p_required:req, p_deadline:req? dl:null, p_note:note}); toast('2단계 인증 정책 저장', email+' · '+(req? ('필수'+(dl? ' · 기한 '+dl:' · 즉시')):'선택')); mfLoad(); }
  catch(e){ mfMsg(String(e.message||e).slice(0,120), true); }
}
export async function mfReset(email){
  if(!confirm(email+' 의 인증 앱 등록을 지웁니다. 다음 로그인은 비밀번호만으로 되고(필수 지정이면 다시 등록 화면), 본인에게 알려 주세요. 계속할까요?')) return;
  mfMsg('초기화 중…');
  try{ var r=await sbWrite('POST','rpc/mfa_admin_reset',{p_email:email}); toast('인증 앱 초기화', email+' · 삭제 '+(r&&r.deleted!=null? r.deleted:'')+'건', 'warn'); mfLoad(); }
  catch(e){ mfMsg(String(e.message||e).slice(0,120), true); }
}
export async function mfAll(){
  if(!MF.rows) return; var targets=MF.rows.filter(function(r){ return !r.enrolled && !r.required; });
  if(!targets.length){ mfMsg('지정할 계정이 없습니다 (전부 등록됐거나 이미 필수)'); return; }
  var dl=mfPlus(7);
  if(!confirm(targets.length+'개 계정을 2단계 인증 필수로 지정합니다 (기한 '+dl+' · 그때까지는 안내만, 지나면 등록 화면).\n\n'+targets.map(function(r){ return '· '+r.email; }).join('\n'))) return;
  mfMsg('지정 중…'); var n=0;
  for(var i=0;i<targets.length;i++){ try{ await sbWrite('POST','rpc/mfa_admin_set',{p_email:targets[i].email, p_required:true, p_deadline:dl, p_note:'전체 지정'}); n++; }catch(e){} }
  toast('2단계 인증 전체 지정', n+'개 계정 · 기한 '+dl); mfLoad();
}
/* ㊿+147 SQL 95: 역할 기본 — super_admin · admin 필수 + 유예 일수 (없으면 칸을 숨김 = SQL 95 전) */
export async function mfRoleLoad(){
  var box=$('#mfRole'); if(!box) return;
  var rows; try{ rows=await sbWrite('POST','rpc/mfa_role_list',{})||[]; }catch(e){ box.style.display='none'; return; }
  MF.roles=rows; box.style.display='';
  var today=todayStr();
  box.innerHTML=tpl`<b>역할 기본</b> <span class="mini">— 이 역할의 계정은 기한까지 인증 앱을 등록해야 합니다(계정별 지정과 합쳐 더 이른 기한 적용)</span>`+
    tpl`<div class="mf-role-rows">${rawHtml(['super_admin','admin','admin_viewer','viewer'].map(function(role){
      var r=rows.filter(function(x){ return x.role===role; })[0]||{role:role, required:false, grace_days:14};
      var st=r.required? (r.deadline<=today? tpl`<span style="color:var(--critical)">기한 지남 (${r.deadline})</span>` : tpl`<span style="color:var(--warn-ink)">유예 중 · ${r.deadline}까지</span>`) : '<span class="mini">선택</span>';
      return tpl`<label class="mf-role-it"><input type="checkbox" data-mfr="${rawHtml(role)}"${r.required?' checked':''}> ${AX_ROLE_KO[role]||role}`+
        tpl` · 유예 <input type="number" min="0" max="180" step="1" data-mfr-g="${rawHtml(role)}" value="${rawHtml(r.grace_days!=null? r.grace_days:14)}" aria-label="${AX_ROLE_KO[role]||role} 유예 일수" style="width:56px;height:28px"> 일 ${rawHtml(st)}</label>`; }).join(''))}`+
    tpl`<button type="button" class="cbtn pri" id="mfRoleSave">역할 기본 저장</button></div>`;
  $('#mfRoleSave').onclick=mfRoleSave;
}
export async function mfRoleSave(){
  var box=$('#mfRole'); var ch=[]; box.querySelectorAll('[data-mfr]').forEach(function(c){
    var role=c.dataset.mfr, g=+(box.querySelector('[data-mfr-g="'+role+'"]').value||14), old=(MF.roles||[]).filter(function(x){ return x.role===role; })[0];
    if(!old && !c.checked) return; if(old && old.required===c.checked && +old.grace_days===g) return; ch.push({role:role, req:c.checked, g:g}); });
  if(!ch.length){ mfMsg('바뀐 것이 없습니다'); return; }
  if(!confirm('역할 기본 2단계 인증을 바꿉니다:\n\n'+ch.map(function(x){ return '· '+(AX_ROLE_KO[x.role]||x.role)+' → '+(x.req? '필수 (유예 '+x.g+'일)':'선택'); }).join('\n')+'\n\n새로 켠 역할은 오늘부터 유예가 시작됩니다. 계속할까요?')) return;
  mfMsg('저장 중…');
  try{ for(var i=0;i<ch.length;i++) await sbWrite('POST','rpc/mfa_role_set',{p_role:ch[i].role, p_required:ch[i].req, p_grace_days:ch[i].g}); toast('2단계 인증 역할 기본', ch.length+'개 역할 저장'); mfLoad(); }
  catch(e){ mfMsg(String(e.message||e).slice(0,120), true); }
}
export function mfBind(){ if(MF.bound) return; MF.bound=true; var r=$('#mfReload'); if(r) r.onclick=mfLoad; var a=$('#mfAll'); if(a) a.onclick=mfAll; }
/* ===== 관리자 › 코드 관리 (code_lists · SQL 93 · ㊿+137) — 선택 목록을 한 곳에서 추가·숨김·순서 =====
   저장은 code_lists 표에 직접(RLS: super_admin). 저장 뒤 loadCodes() 로 전역 *_OPTS 배열을 갱신 → 열린 표·폼에 즉시 반영. 다른 사용자는 다음 데이터 로드부터. */
export var CD={kind:'contract_status', rows:null, bound:false, showOff:false};
export function cdMsg(t,bad){ var e=$('#cdMsg'); if(e){ e.textContent=t||''; e.style.color=bad? 'var(--critical,#d03b3b)':''; } }
export function cdBind(){
  if(CD.bound) return; CD.bound=true;
  var k=$('#cdKind'); if(k){ k.innerHTML=Object.keys(CODE_KIND).map(function(kind){ return tpl`<option value="${rawHtml(kind)}">${CODE_KIND_LABEL[kind]||kind}</option>`; }).join(''); k.value=CD.kind; k.onchange=function(){ CD.kind=k.value; cdPaint(); }; }
  var r=$('#cdReload'); if(r) r.onclick=cdLoad;
  var so=$('#cdShowOff'); if(so) so.onchange=function(){ CD.showOff=so.checked; cdPaint(); };
  var a=$('#cdAdd'); if(a) a.onclick=cdAdd;
  var nv=$('#cdNewVal'); if(nv) nv.onkeydown=function(e){ if(e.key==='Enter'){ e.preventDefault(); cdAdd(); } };
}
export async function cdLoad(){
  cdMsg('불러오는 중…');
  var rows=await sbTry('code_lists?select=kind,value,label,sort,active,note,updated_by,updated_at&order=kind,sort,value');
  if(!rows || !rows.length){ CD.rows=null; cdMsg('SQL 93 이 아직 실행되지 않았습니다 (배포·운영 › SQL 탭에서 sql93 실행) — 그동안은 포탈 코드의 기본 목록을 씁니다', true); $('#cdTable').innerHTML=''; return; }
  CD.rows=rows; var m=/** @type {Object<string, import('./state.js').CodeItem[]>} */ ({}); rows.forEach(function(r){ (m[r.kind]=m[r.kind]||[]).push(r); }); ST.CODES=m; try{ sessionStorage.setItem('svc_codes', JSON.stringify(m)); }catch(e){} applyCodes();
  cdMsg(rows.length+'개 값 · '+Object.keys(m).length+'개 목록'); cdPaint();
}
export function cdPaint(){
  var t=$('#cdTable'); if(!t||!CD.rows) return;
  var list=CD.rows.filter(function(r){ return r.kind===CD.kind && (CD.showOff || r.active!==false); }).sort(function(a,b){ return (a.sort||0)-(b.sort||0) || String(a.value).localeCompare(String(b.value)); });
  var note=CODE_KIND_NOTE[CD.kind]; var cap=$('#cdCap'); if(cap){ var w=cap.querySelector('.cd-warn'); if(w) w.remove(); if(note){ var sp=document.createElement('div'); sp.className='cd-warn'; sp.style.cssText='margin-top:6px;color:var(--warn-ink)'; sp.textContent='⚠ '+note; cap.appendChild(sp); } }
  t.innerHTML='<thead><tr><th style="width:40px">순서</th><th>값</th><th>표시 이름</th><th>메모</th><th style="width:70px">상태</th><th class="mini">수정</th><th class="act" style="width:170px"></th></tr></thead>';
  var tb=document.createElement('tbody');
  if(!list.length){ var tr0=document.createElement('tr'); tr0.innerHTML=tpl`<td colspan="7" class="mini" style="padding:14px">값이 없습니다 — 아래에서 추가하세요${CD.showOff? '':' (숨긴 값은 «숨긴 값도 보기»)'}</td>`; tb.appendChild(tr0); }
  list.forEach(function(r,i){
    var tr=document.createElement('tr'); if(r.active===false) tr.style.opacity='.55';
    var nUse=cdUsage(CD.kind, r.value);
    tr.innerHTML=tpl`<td class="mini">${rawHtml(i+1)}</td>`+
      tpl`<td><b>${r.value}</b>${rawHtml(nUse!=null? tpl` <span class="mini">· ${rawHtml(nUse)}행</span>`:'')}</td>`+
      tpl`<td><input data-cd-label="${r.value}" value="${r.label||''}" placeholder="(값 그대로)" style="height:30px;width:100%;min-width:90px"></td>`+
      tpl`<td><input data-cd-note="${r.value}" value="${r.note||''}" placeholder="메모" style="height:30px;width:100%;min-width:90px"></td>`+
      tpl`<td>${rawHtml(r.active===false? '<span class="mini">숨김</span>':'<span style="color:var(--brand)">사용</span>')}</td>`+
      tpl`<td class="mini">${String(r.updated_at||'').slice(0,10)}${rawHtml(r.updated_by? tpl`<br>${r.updated_by}`:'')}</td>`+
      tpl`<td class="act"><button type="button" class="cbtn" data-cd-up="${r.value}" title="위로"${i===0? ' disabled':''}>↑</button> <button type="button" class="cbtn" data-cd-down="${r.value}" title="아래로"${i===list.length-1? ' disabled':''}>↓</button> `+
        tpl`<button type="button" class="cbtn pri" data-cd-save="${r.value}">저장</button> `+
        tpl`<button type="button" class="cbtn" data-cd-tog="${r.value}">${r.active===false? '켜기':'숨기기'}</button></td>`;
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  t.querySelectorAll('[data-cd-save]').forEach(function(b){ b.onclick=function(){ cdSave(b.dataset.cdSave); }; });
  t.querySelectorAll('[data-cd-tog]').forEach(function(b){ b.onclick=function(){ cdToggle(b.dataset.cdTog); }; });
  t.querySelectorAll('[data-cd-up]').forEach(function(b){ b.onclick=function(){ cdMove(b.dataset.cdUp, -1, list); }; });
  t.querySelectorAll('[data-cd-down]').forEach(function(b){ b.onclick=function(){ cdMove(b.dataset.cdDown, 1, list); }; });
}
/* 메모리 데이터에서 그 값을 쓰는 행 수(참고용 · 표에 있는 종류만) */
export function cdUsage(kind, v){
  var R=ST.RAWX||{}; var f={contract_status:['contracts','status'], contract_type:['contracts','contract_type'], channel:['contracts','channel'], line:['contracts','line'], lead_src:['contracts','lead_src'], live_override:['contracts','live_override'], billing:['contracts','billing'], version:['contracts','version'],
    order_status:['orders','status'], order_channel:['orders','channel'], model:['orders','model'], industry:['customers','industry']}[kind];
  if(!f || !R[f[0]]) return null; return R[f[0]].filter(function(r){ return r[f[1]]===v; }).length;
}
export function cdRow(v){ return (CD.rows||[]).filter(function(r){ return r.kind===CD.kind && r.value===v; })[0]; }
export async function cdPatch(v, patch, okMsg){
  cdMsg('저장 중…');
  try{
    patch.updated_by=ST.AUTH_USER||null; patch.updated_at=new Date().toISOString();
    await sbWrite('PATCH','code_lists?kind=eq.'+encodeURIComponent(CD.kind)+'&value=eq.'+encodeURIComponent(v), patch);
    await logChange('code_'+(patch.active===false? 'hide': patch.active===true? 'show':'edit'),'code_lists',CD.kind+':'+v, patch);
    if(okMsg) toast('코드 관리', okMsg); await cdLoad();
  }catch(e){ cdMsg(String(e.message||e).slice(0,140), true); }
}
export function cdSave(v){ var t=$('#cdTable'); var q=function(a){ var e=t.querySelector('['+a+'="'+CSS.escape(v)+'"]'); return e? e.value.trim():''; }; cdPatch(v, {label:q('data-cd-label')||null, note:q('data-cd-note')||null}, CODE_KIND_LABEL[CD.kind]+' «'+v+'» 저장'); }
export function cdToggle(v){
  var r=cdRow(v); if(!r) return; var off=r.active!==false;
  if(off){ var n=cdUsage(CD.kind, v); if(!confirm('«'+v+'» 를 숨깁니다 — 새 입력에서 고를 수 없고 데이터 점검이 «목록에 없는 값»으로 표시합니다.'+(n? ' 지금 이 값인 행 '+n+'개는 그대로 둡니다.':'')+' 계속할까요?')) return; }
  cdPatch(v, {active:!off}, '«'+v+'» '+(off? '숨김':'사용'));
}
export async function cdMove(v, dir, list){
  var i=list.findIndex(function(r){ return r.value===v; }); var j=i+dir; if(i<0||j<0||j>=list.length) return;
  var a=list[i], b=list[j], sa=a.sort||0, sb=b.sort||0; if(sa===sb){ sb=sa+dir; }   // 같은 순서값이면 하나를 밀어 구분
  cdMsg('순서 바꾸는 중…');
  try{
    await sbWrite('PATCH','code_lists?kind=eq.'+encodeURIComponent(CD.kind)+'&value=eq.'+encodeURIComponent(a.value), {sort:sb});
    await sbWrite('PATCH','code_lists?kind=eq.'+encodeURIComponent(CD.kind)+'&value=eq.'+encodeURIComponent(b.value), {sort:sa});
    await cdLoad();
  }catch(e){ cdMsg(String(e.message||e).slice(0,140), true); }
}
export async function cdAdd(){
  var v=($('#cdNewVal').value||'').trim(), label=($('#cdNewLabel').value||'').trim()||null, note=($('#cdNewNote').value||'').trim()||null;
  if(!v){ cdMsg('값을 입력하세요', true); $('#cdNewVal').focus(); return; }
  if(cdRow(v)){ cdMsg('이미 있는 값입니다'+(cdRow(v).active===false? ' (숨김 상태 — «켜기»)':''), true); return; }
  if(CODE_KIND_NOTE[CD.kind] && !confirm('⚠ '+CODE_KIND_NOTE[CD.kind]+'\n\n«'+v+'» 를 그래도 추가할까요? (저장은 되지만 화면 로직은 이 값을 모를 수 있습니다)')) return;
  var maxSort=(CD.rows||[]).filter(function(r){ return r.kind===CD.kind; }).reduce(function(m,r){ return Math.max(m, r.sort||0); }, 0);
  cdMsg('추가 중…');
  try{
    await sbWrite('POST','code_lists', {kind:CD.kind, value:v, label:label, note:note, sort:maxSort+1, active:true, updated_by:ST.AUTH_USER||null});
    await logChange('code_add','code_lists',CD.kind+':'+v, {label:label, note:note});
    $('#cdNewVal').value=''; $('#cdNewLabel').value=''; $('#cdNewNote').value='';
    toast('코드 추가', CODE_KIND_LABEL[CD.kind]+' «'+v+'»'); await cdLoad();
  }catch(e){ cdMsg(String(e.message||e).slice(0,140), true); }
}
export async function axLoad(){
  axMsg('불러오는 중…');
  try{
    AX_USERS=await sbWrite('POST','rpc/admin_list_users',{})||[];
    axMsg(AX_USERS.length+'개 계정');
    axPaint();
    try{ apFillUsers(); }catch(e){}
  }catch(e){ axMsg(String(e.message||e).slice(0,120),1); $('#axTable').innerHTML=''; }
}
export function axPaint(){
  var q=($('#axQ').value||'').trim().toLowerCase();
  var rows=AX_USERS.filter(function(u){ return !q || String(u.email||'').toLowerCase().indexOf(q)>=0; });
  var t=$('#axTable');
  t.innerHTML='<thead><tr><th>이메일</th><th>권한</th><th>마지막 로그인</th><th>생성일</th><th class="act" style="width:170px"></th></tr></thead>';
  var tb=document.createElement('tbody');
  rows.forEach(function(u){
    var tr=document.createElement('tr');
    var me=(u.email||'').toLowerCase()===(ST.AUTH_USER||'').toLowerCase();
    var sel=tpl`<select data-ax="${u.email}" style="height:30px;padding:0 8px;border-radius:8px;`+
      tpl`border:1px solid var(--ring);background:var(--surface-2);color:var(--ink);font-family:inherit;font-size:12px"`+ tpl`${rawHtml(me?' disabled title="본인 권한은 여기서 바꿀 수 없습니다"':'')}>`+
      tpl`<option value="">— 권한 없음 —</option>`+
      tpl`${rawHtml(AX_ROLES.map(function(r){ return tpl`<option value="${rawHtml(r)}"${u.role===r?' selected':''}>${rawHtml(r)}</option>`; }).join(''))}`+
      tpl`</select>`;
    tr.innerHTML=tpl`<td>${u.email||''}${rawHtml(me?' <span class="mini">(나)</span>':'')}</td>`+
      tpl`<td>${rawHtml(sel)}</td>`+
      tpl`<td class="mini">${axTime(u.last_sign_in)}</td>`+
      tpl`<td class="mini">${axTime(u.created_at).slice(0,10)}</td>`+
      tpl`<td class="act"></td>`;
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
export async function axCreate(){
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
export async function axResetPw(em){
  var pw=prompt(em+' 의 새 비밀번호 (6자 이상):');
  if(pw==null) return;
  if(String(pw).length<6){ axMsg('6자 이상이어야 합니다',1); return; }
  axMsg('변경 중…');
  try{
    var out=await adminFetch({action:'reset_password', email:em, password:pw});
    axMsg(out.msg); toast('비밀번호 초기화', em,'info');
  }catch(e){ axMsg(String(e.message||e).slice(0,140),1); }
}
export async function axDelete(em){
  if(!confirm(em+' 계정을 삭제할까요?\n로그인이 즉시 막히고 되돌릴 수 없습니다.')) return;
  axMsg('삭제 중…');
  try{
    var out=await adminFetch({action:'delete_user', email:em});
    axMsg(out.msg); toast('계정 삭제', em,'info');
    await axLoad();
  }catch(e){ axMsg(String(e.message||e).slice(0,140),1); }
}

/* ---- 내 계정 ---- */
export var ROLE_INFO={
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
export async function renderAccount(){
  var box=$('#accBody');
  if(!ST.SB_TOKEN){
    box.innerHTML='<p class="cap">로그인이 필요합니다.</p>';
    var lb=document.createElement('button'); lb.className='pill'; lb.textContent='로그인';
    lb.onclick=function(){ openOvl('ovlAuth'); };
    box.appendChild(lb); return;
  }
  box.innerHTML='<p class="cap">불러오는 중…</p>';
  var role=null;
  try{
    var rr=await sbTry('user_roles?select=role&email=eq.'+encodeURIComponent(ST.AUTH_USER||''));
    if(rr && rr.length) role=rr[0].role;
  }catch(e){}
  var ri=ROLE_INFO[role]||['기본 (역할 미지정)','역할이 지정되지 않아 기본 권한으로 동작합니다. 관리자에게 문의하세요.'];
  var sessTxt='로그인 유지 켜짐 · 만료 시 자동 갱신';
  try{
    var s0=sessRead();
    if(s0 && s0.e) sessTxt='로그인 유지 켜짐 · 현재 토큰 만료 '+new Date(s0.e*1000).toLocaleString('ko-KR')+' (자동 갱신)';
  }catch(e){}
  function row(k,v){ return tpl`<div style="display:flex;gap:14px;padding:9px 2px;border-bottom:1px solid var(--ring)">`+
    tpl`<span style="width:110px;color:var(--muted);font-size:12.5px;flex-shrink:0">${rawHtml(k)}</span>`+
    tpl`<span style="font-size:13.5px">${rawHtml(v)}</span></div>`; }
  box.innerHTML=
    row('이메일', esc(ST.AUTH_USER||''))+
    row('권한', tpl`<b>${ri[0]}</b>${rawHtml(role? tpl` <span class="mini">(${role})</span>`:'')}`)+
    row('권한 설명', tpl`<span style="color:var(--ink-2)">${ri[1]}</span>`)+
    row('로그인 세션', tpl`<span style="color:var(--ink-2)">${sessTxt}</span>`);
  var act=document.createElement('div');
  act.style.cssText='display:flex;gap:10px;margin-top:18px';
  var bp=document.createElement('button'); bp.className='pill'; bp.textContent='🔑 비밀번호 변경';
  bp.onclick=function(){ openOvl('ovlAuth'); setAuthTab('pw'); };
  var bo=document.createElement('button'); bo.className='pill ghost'; bo.textContent='로그아웃';
  bo.style.cssText='border-color:var(--critical,#d03b3b);color:var(--critical,#d03b3b)';
  bo.onclick=doLogout;
  var bu=document.createElement('button'); bu.className='pill ghost'; bu.textContent='📢 업데이트 내역'; bu.onclick=updOpenAll;   /* ㊿+148 */
  act.appendChild(bp); act.appendChild(bu); act.appendChild(bo);
  act.style.flexWrap='wrap';
  box.appendChild(act);
  /* 보안 — 2단계 인증(인증 앱) · 계정 단위, 본인이 켬 */
  var sec=document.createElement('div'); sec.style.cssText='margin-top:22px';
  sec.innerHTML=tpl`<div style="font-size:13.5px;font-weight:650;margin-bottom:4px">보안</div>${rawHtml(row('🔐 2단계 인증', '<div id="accMfa"></div>'))}`;
  box.appendChild(sec); mfaCardRender(sec.querySelector('#accMfa'));
  /* 설정 — 이 브라우저에만 저장 (localStorage) */
  var set=document.createElement('div'); set.style.cssText='margin-top:22px';
  var curIdle=idleMin(), look0=curLook();
  set.innerHTML=tpl`<div style="font-size:13.5px;font-weight:650;margin-bottom:4px">설정 <span class="mini" style="font-weight:400">— 이 브라우저에만 저장됩니다</span></div>`+
    tpl`${rawHtml(row('자동 로그아웃', tpl`<select id="accIdle" aria-label="자동 로그아웃" style="height:30px;min-width:200px">${rawHtml(IDLE_OPTS.map(function(m){
        return tpl`<option value="${rawHtml(m)}"${m===curIdle?' selected':''}>${idleLabel(m)}${m? ' 동안 활동 없으면':''}</option>`; }).join(''))}`+ tpl`</select>`+
      tpl`<div class="mini" style="margin-top:5px;line-height:1.6">마우스·키보드·스크롤 입력이 정한 시간 동안 없으면 이 탭에서 자동으로 로그아웃합니다. 끝나기 1분 전에 알림이 뜹니다.</div>`))}`+
    tpl`${rawHtml(row('화면 디자인', tpl`<select id="accLook" aria-label="화면 디자인" style="height:30px;min-width:200px">${rawHtml(Object.keys(LOOKS).map(function(k){ return tpl`<option value="${rawHtml(k)}"${k===look0?' selected':''}>${LOOKS[k]}</option>`; }).join(''))}</select>`+
      tpl`<div class="mini" style="margin-top:5px;line-height:1.6">커맨드 센터: 아이콘 레일 + 상단 커맨드 바(검색·이동·AI) + 인박스 홈 + 장비 운영 보드 + 고객 360 패널 · 심플: 평면 디자인에 기존 사이드바 · 클래식: 이전 디자인. 바꾸면 화면을 다시 읽습니다.</div>`))}`;
  var prow=document.createElement('div'); prow.innerHTML=row('📱 앱으로 설치', tpl`<div id="accPwa">${rawHtml(pwaHintHtml())}</div>`);
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

/* ── 관리자 › 업데이트 안내 ── */
export function updMsg(t, bad){ var e=document.getElementById('updMsg'); if(e){ e.textContent=t||''; e.style.color=bad? 'var(--critical)':'var(--muted)'; } }
export async function updAdminLoad(){
  var host=document.getElementById('updAdmin'); if(!host) return;
  var seq=UPD.seq=(UPD.seq||0)+1;   /* 겹쳐 부르면 마지막 것만 그림 */
  updMsg('불러오는 중…');
  try{
    var n=await updSyncSeed(); if(n) toast('업데이트 안내', '새 안내 '+n+'건을 넣었습니다');
    var res=await Promise.all([
      updFetch('upd_notes?select=id,ver,title,body,published_on,active,updated_by,updated_at&order=id.desc'),
      updFetch('upd_notify?select=email,enabled,updated_at'),
      updFetch('upd_ack?select=email,last_id,acked_at'),
      sbWrite('POST','rpc/admin_list_users',{}).catch(function(){ return null; })
    ]);
    if(seq!==UPD.seq) return;
    UPD.rows=res[0]||[]; UPD.notify=res[1]||[]; UPD.ack=res[2]||[]; UPD.users=res[3]||[]; UPD.err='';
  }catch(e){ if(seq!==UPD.seq) return; UPD.rows=null; UPD.err=/404|PGRST|does not exist|schema cache/i.test(String(e.message))? 'SQL 96 이 아직 실행되지 않았습니다 — 배포·운영 › SQL 탭에서 sql96_update_notes.sql 을 실행하세요' : String(e.message||e).slice(0,200); }
  updAdminPaint();
}
export function updAdminPaint(){
  var host=document.getElementById('updAdmin'); if(!host) return;
  if(!UPD.rows){ host.innerHTML=tpl`<p class="cap" style="color:var(--warn-ink)">${UPD.err||'불러오지 못했습니다'}</p><button type="button" class="pill ghost" id="updReload">↻ 다시 읽기</button>`; host.querySelector('#updReload').onclick=updAdminLoad; return; }
  var act=UPD.rows.filter(function(r){ return r.active; });
  var nmap={}; (UPD.notify||[]).forEach(function(x){ nmap[String(x.email).toLowerCase()]=x; });
  var amap={}; (UPD.ack||[]).forEach(function(x){ amap[String(x.email).toLowerCase()]=x; });
  var emails=(UPD.users||[]).map(function(u){ return {email:u.email, role:u.role}; });
  Object.keys(nmap).forEach(function(e){ if(!emails.some(function(u){ return String(u.email).toLowerCase()===e; })) emails.push({email:nmap[e].email, role:''}); });
  emails.sort(function(a,b){ var x=Number(!!(nmap[String(b.email).toLowerCase()]||{}).enabled) - Number(!!(nmap[String(a.email).toLowerCase()]||{}).enabled); return x || String(a.email).localeCompare(String(b.email)); });
  var h=tpl`<div class="dbar" style="margin-bottom:8px;flex-wrap:wrap;gap:8px;align-items:center"><button type="button" class="pill ghost" id="updReload">↻ 다시 읽기</button><button type="button" class="pill ghost" id="updPreview">👁 팝업 미리보기</button><button type="button" class="pill ghost" id="updNew">＋ 새 안내</button><span class="mini" id="updMsg">게시 ${act.length}건 · 안내 받는 계정 ${(UPD.notify||[]).filter(function(x){ return x.enabled; }).length}명</span></div>`;
  h+=tpl`<div class="tbl-wrap" tabindex="0" style="max-height:40vh"><table class="dgrid" id="updUsers"><thead><tr><th>계정</th><th>권한</th><th>안내 받기</th><th>안 읽은 안내</th><th>마지막 확인</th><th class="act"></th></tr></thead><tbody>`+
    tpl`${rawHtml(emails.map(function(u){ var k=String(u.email).toLowerCase(), on=!!(nmap[k]&&nmap[k].enabled), a=amap[k], last=a? +a.last_id : 0, unread=act.filter(function(r){ return r.id>last; }).length;
      return tpl`<tr><td>${u.email}</td><td class="mini">${u.role||''}</td><td><label class="mini" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" data-updn="${u.email}"${on?' checked':''}> 받기</label></td>`+
        tpl`<td>${rawHtml(on? (unread? tpl`<span class="ctag warn">${rawHtml(unread)}건</span>`:'<span class="ctag ok">다 봄</span>') : '<span class="mini">—</span>')}</td>`+
        tpl`<td class="mini">${rawHtml(a? esc(String(a.acked_at||'').replace('T',' ').slice(0,16)) : '아직 없음')}</td>`+
        tpl`<td class="act">${rawHtml(a? tpl`<button type="button" class="pill ghost" data-updreset="${u.email}" title="확인 기록을 지워 다음 로그인 때 전체 안내를 다시 보여 줌">처음부터 다시</button>`:'')}</td></tr>`; }).join(''))}`+ tpl`</tbody></table></div>`;
  h+='<p class="cap" style="margin:6px 0 14px">«받기»를 켠 계정은 로그인할 때 아직 확인하지 않은 안내를 팝업으로 봅니다(처음이면 지금까지 전체). «모두 확인했습니다»에 체크하고 확인하면 다음 안내 전까지 다시 뜨지 않습니다.</p>';
  h+=tpl`<div class="tbl-wrap" tabindex="0" style="max-height:40vh"><table class="dgrid" id="updNotes"><thead><tr><th>날짜</th><th>버전</th><th>제목</th><th class="n">항목</th><th>상태</th><th class="act"></th></tr></thead><tbody>`+
    tpl`${rawHtml(UPD.rows.map(function(r){ var n=String(r.body||'').split(/\n/).filter(function(x){ return /^\s*[-•·]/.test(x); }).length;
      return tpl`<tr${rawHtml(r.active? '':' class="row-dim"')}><td class="mini">${String(r.published_on||'').slice(0,10)}</td><td class="mini">${r.ver||''}</td><td>${r.title||''}</td><td class="n">${rawHtml(n)}</td><td>${rawHtml(r.active? '<span class="ctag ok">게시</span>':'<span class="ctag">숨김</span>')}</td>`+
        tpl`<td class="act"><button type="button" class="pill ghost" data-upded="${rawHtml(r.id)}">수정</button><button type="button" class="pill ghost" data-updtg="${rawHtml(r.id)}">${r.active? '숨기기':'게시'}</button></td></tr>`; }).join(''))}`+ tpl`</tbody></table></div>`;
  h+='<div id="updEdit"></div>';
  host.innerHTML=h;
  host.querySelector('#updReload').onclick=updAdminLoad;
  host.querySelector('#updPreview').onclick=function(){ updShow(act, {mode:'preview'}); };
  host.querySelector('#updNew').onclick=function(){ UPD.edit={id:null, ver:'', title:'', body:'- ', published_on:new Date(Date.now()+9*3600e3).toISOString().slice(0,10)}; updEditPaint(); };
  host.querySelectorAll('[data-updn]').forEach(function(c){ c.onchange=function(){ updNotifySet(c.dataset.updn, c.checked); }; });
  host.querySelectorAll('[data-updreset]').forEach(function(b){ b.onclick=function(){ updAckReset(b.dataset.updreset); }; });
  host.querySelectorAll('[data-upded]').forEach(function(b){ b.onclick=function(){ var r=UPD.rows.filter(function(x){ return String(x.id)===b.dataset.upded; })[0]; if(r){ UPD.edit=Object.assign({}, r); updEditPaint(); } }; });
  host.querySelectorAll('[data-updtg]').forEach(function(b){ b.onclick=function(){ var r=UPD.rows.filter(function(x){ return String(x.id)===b.dataset.updtg; })[0]; if(r) updNoteSave({id:r.id, active:!r.active}); }; });
  if(UPD.edit) updEditPaint();
}
export function updEditPaint(){
  var box=document.getElementById('updEdit'); if(!box) return; var e=UPD.edit;
  if(!e){ box.innerHTML=''; return; }
  box.innerHTML=tpl`<div class="card" style="padding:14px;margin-top:10px"><div style="font-weight:650;margin-bottom:8px">${rawHtml(e.id? '안내 수정 #'+e.id : '새 안내')}</div>`+
    tpl`<div class="frm" style="grid-template-columns:1fr 1fr 2fr"><div><label for="updEDate">날짜</label><input id="updEDate" type="date" value="${String(e.published_on||'').slice(0,10)}"></div><div><label for="updEVer">버전 (선택)</label><input id="updEVer" value="${e.ver||''}" placeholder="예: ㊿+149"></div><div><label for="updETitle">제목</label><input id="updETitle" value="${e.title||''}"></div></div>`+
    tpl`<div style="margin-top:8px"><label for="updEBody" class="mini">내용 — 한 줄에 하나, «- »로 시작하면 항목 · 관리자용은 «- (관리자) …»</label><textarea id="updEBody" class="ops-ta" style="min-height:180px;margin-top:4px">${e.body||''}</textarea></div>`+
    tpl`<div style="display:flex;gap:8px;margin-top:8px;justify-content:flex-end"><button type="button" class="pill ghost" id="updECancel">취소</button><button type="button" class="pill ghost" id="updEPrev">미리보기</button><button type="button" class="pill pri" id="updESave">저장</button></div></div>`;
  var val=function(){ return {id:e.id, published_on:box.querySelector('#updEDate').value||null, ver:box.querySelector('#updEVer').value.trim()||null, title:box.querySelector('#updETitle').value.trim(), body:box.querySelector('#updEBody').value.replace(/\s+$/,'')}; };
  box.querySelector('#updECancel').onclick=function(){ UPD.edit=null; updEditPaint(); };
  box.querySelector('#updEPrev').onclick=function(){ var v=val(); updShow([{id:1, ver:v.ver, title:v.title, body:v.body, published_on:v.published_on}], {mode:'preview'}); };
  box.querySelector('#updESave').onclick=function(){ var v=val(); if(!v.title){ updMsg('제목을 넣으세요', true); return; } updNoteSave(v); };
}
export async function updNoteSave(v){
  try{
    var me=ST.AUTH_USER||'', now=new Date().toISOString(), body=Object.assign({}, v); delete body.id;
    if(v.id){ body.updated_by=me; body.updated_at=now; await sbWrite('PATCH','upd_notes?id=eq.'+v.id, body); }
    else { body.created_by=me; body.updated_by=me; await sbWrite('POST','upd_notes', body); }
    try{ await logChange(v.id? 'upd_note_edit':'upd_note_add','upd_notes', v.id||'', {title:v.title, ver:v.ver, active:v.active}); }catch(e){}
    UPD.edit=null; toast('업데이트 안내 저장', v.title||(v.active===false? '숨겼습니다':'게시했습니다')); updAdminLoad();
  }catch(e){ updMsg('저장 실패: '+String(e.message||e).slice(0,160), true); }
}
export async function updNotifySet(email, on){
  try{
    await sbWrite('POST','upd_notify?on_conflict=email', {email:email, enabled:!!on, updated_by:ST.AUTH_USER||'', updated_at:new Date().toISOString()}, 'resolution=merge-duplicates');
    try{ await logChange(on? 'upd_notify_on':'upd_notify_off','upd_notify', email, {}); }catch(e){}
    toast('업데이트 안내', email+(on? ' — 다음 로그인 때 안내합니다':' — 안내하지 않습니다')); updAdminLoad();
  }catch(e){ updMsg('저장 실패: '+String(e.message||e).slice(0,160), true); }
}
export async function updAckReset(email){
  if(!confirm(email+' 의 확인 기록을 지웁니다.\n다음 로그인 때 지금까지의 안내 전체가 다시 뜹니다. 계속할까요?')) return;
  try{ await sbWrite('DELETE','upd_ack?email=eq.'+encodeURIComponent(email)); toast('처음부터 다시', email); updAdminLoad(); }
  catch(e){ updMsg('실패: '+String(e.message||e).slice(0,160), true); }
}

/* ===== ㊿+151 스테이징 QA — 배포 전에 스테이징 포탈을 창 안에서 열어 메뉴를 한 바퀴 자동 점검 (사용자: «스테이징에서 메뉴 한 바퀴 검증하는 QA 기능») =====
   · 같은 출처(…/svc/staging/index.html?qa=1)를 iframe 으로 열어 contentWindow 를 직접 다룸 — 세션(sessionStorage svc_sess)이 공유돼 같은 계정으로 자동 로그인
   · ?qa=1 → 스테이징 쪽 IS_QA: 서비스 워커 등록·데이터 사본 쓰기·브라우저 오류 기록·업데이트 팝업·데이터 점검 로그를 하지 않음(검사 결과만 여기로)
   · 메뉴마다(사이드바에 보이는 것 전부 · 홈은 «분석» 펼침 · 관리자는 탭 4개): JS 오류 0 · 빈 화면 아님 · 깨진 값(NaN·undefined) 없음 · 가로 넘침 없음 · 글자 세로 쌓임 없음 · 위성 페이지(iframe)는 떴는지
   · 핵심 숫자: 이 화면(운영)과 스테이징의 buildDigest() 숫자가 같은지(같은 DB 라 다르면 코드가 깨진 것 — 일부러 정의를 바꾼 배포면 사람이 판단)
   · 폰(390px)으로 한 번 더(주요 메뉴) · 결과는 창에 표 + change_log(staging_qa) · GitHub 탭 «승격» 옆에 최근 QA 배지 · 통과 못 하면 승격 확인 창에 경고
   · 보기 위주 — 저장·발송처럼 데이터를 바꾸는 동작은 누르지 않음 */
export var QA={run:0, on:false, res:null, steps:[], w:null, ifr:null, errs:[]};
export var QA_MOBILE=['dash','contracts','orders','eqboard','oi','dcheck','leadsrc','report','price','cloud','adminx','ops','account'];
/* ㊿+153: 들여다보는 창의 포탈 함수·상태 — 모듈 전환 뒤에는 window.SVC 에(예전 버전은 window 에 바로) */
export function qaApi(w){ try{ return (w && w.SVC) || w; }catch(e){ return w; } }
export function qaStagingUrl(){ var dir=location.pathname.replace(/\/staging\//,'/').replace(/[^/]*$/,''); return dir+'staging/index.html?qa=1&t='+Date.now(); }
export function qaVisible(el){ return !!(el && el.getClientRects && el.getClientRects().length); }
export function qaSleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
export function qaRaf(w){ return new Promise(function(r){ var done=false, f=function(){ if(!done){ done=true; r(); } }; try{ w.requestAnimationFrame(function(){ w.requestAnimationFrame(f); }); }catch(e){} setTimeout(f, 400); }); }
export async function qaWait(fn, ms, step){ var t0=Date.now(); while(Date.now()-t0<ms){ try{ if(fn()) return true; }catch(e){} await qaSleep(step||150); } return false; }
export function qaText(s, n){ s=String(s==null? '':s).replace(/\s+/g,' ').trim(); return s.length>(n||90)? s.slice(0,(n||90))+'…' : s; }
/* 이 창·스테이징 창에서 같은 방법으로 뽑는 핵심 숫자 — buildDigest() 의 숫자(깊이 2) + 행 수·월 수 */
export function qaKpi(w){
  var out={}; try{
    var D=qaApi(w).buildDigest();
    (function walk(o,p,d){ if(d>2 || !o) return; Object.keys(o).forEach(function(k){ if(/시간|시각|time|ms$|생성|갱신|오늘|기준일|설명|읽는법|주의/i.test(k)) return; var v=o[k], q=p? p+'.'+k : k;
      if(typeof v==='number' && isFinite(v)) out[q]=v; else if(Array.isArray(v)) out[q+'(개수)']=v.length; else if(v && typeof v==='object') walk(v,q,d+1); }); })(D,'',0);
    out['계약 행 수']=((qaApi(w).ST&&qaApi(w).ST.DATA&&qaApi(w).ST.DATA.rows)||[]).length; out['월 수']=(qaApi(w).ST&&qaApi(w).ST.M)||0;
  }catch(e){ out._err=String(e.message||e); }
  return out;
}
export function qaKpiDiff(a, b){
  var diffs=[], onlyA=0, onlyB=0;
  Object.keys(a).forEach(function(k){ if(k==='_err') return; if(!(k in b)) onlyA++; else if(a[k]!==b[k]) diffs.push(k+': '+a[k]+' → '+b[k]); });
  Object.keys(b).forEach(function(k){ if(k!=='_err' && !(k in a)) onlyB++; });
  return {diffs:diffs, onlyA:onlyA, onlyB:onlyB};
}
/* 요소를 짧은 경로로 (Claude 에게 전달할 때 어느 요소인지 알 수 있게) — #id 가 있으면 거기서 멈춤 */
export function qaPath(el, stop){
  var parts=[]; for(var n=el, k=0; n && n.nodeType===1 && k<5; n=n.parentElement, k++){
    if(n===stop) break;
    if(n.id){ parts.unshift('#'+n.id); break; }
    var cl=[].slice.call(n.classList||[]).filter(function(c){ return !/^(on|open|active|hidden)$/.test(c); }).slice(0,2).join('.');
    var sib=n.parentElement? [].slice.call(n.parentElement.children).filter(function(x){ return x.tagName===n.tagName; }) : [];
    parts.unshift(n.tagName.toLowerCase()+(cl? '.'+cl:'')+(sib.length>1? ':nth-of-type('+(sib.indexOf(n)+1)+')':''));
  }
  return parts.join(' > ');
}
export var QA_LOADING=/(불러오는|읽는|확인하는|계산하는|가져오는|준비하는|만드는|그리는) 중|중…|loading/i;
/* 한 화면 검사 — 결과는 [{m:메시지, w:경고면 true, d:[Claude 에게 넘길 진단 줄]}] */
export async function qaInspect(w, v){
  var d=w.document, out=[], add=function(m, warn, diag){ out.push({m:m, w:!!warn, d:diag||[]}); };
  var hosts=[].slice.call(d.querySelectorAll('#app [id^="view"]')).filter(function(e){ return !e.classList.contains('hidden') && qaVisible(e) && e.id!=='viewLogin'; });
  var host=hosts[0]; if(!host){ add('화면 영역이 보이지 않음', false, ['보이는 #view* 없음 · ST.CUR_VIEW='+(qaApi(w).ST&&qaApi(w).ST.CUR_VIEW)]); return out; }
  var settled=await qaWait(function(){ var t=String(host.innerText||''); return !(t.length<300 && QA_LOADING.test(t)); }, 6000, 200);
  if(!settled){ add('6초가 지나도 «불러오는 중»', true, ['화면: #'+host.id, '보이는 글자: '+qaText(host.innerText, 160)]); return out; }
  var sat=host.querySelector('iframe');
  if(sat){ var ok=await qaWait(function(){ var sd=sat.contentDocument; return sd && sd.readyState==='complete' && sd.body && sd.body.innerText.trim().length>20; }, 8000, 250); if(!ok) add('하위 페이지(iframe)가 뜨지 않음', false, ['iframe src: '+String(sat.getAttribute('src')||'').slice(0,120)]); }
  var text=String(host.innerText||''), vis=[].slice.call(host.querySelectorAll('*')).filter(qaVisible).length, emptyMsg=/없습니다|없음|아직|필요합니다/.test(text);
  if(!sat && (text.trim().length<30 || vis<5)) add(emptyMsg? '빈 상태 안내만 보임 — «'+qaText(text, 50)+'»' : '빈 화면 (글자 '+text.trim().length+'자 · 요소 '+vis+'개)', emptyMsg, ['화면: #'+host.id, '보이는 글자 전체: «'+qaText(text, 200)+'»']);
  var m=/데이터를 불러오지 못했습니다[^\n]*|읽기 권한이 없[^\n]*|오류가 발생[^\n]*/.exec(text); if(m) add(qaText(m[0], 80), false, ['화면: #'+host.id]);
  var re=/(?:^|[^A-Za-z_])(NaN|undefined|\[object Object\])(?![A-Za-z_])/g, bm, found=[];
  while((bm=re.exec(text)) && found.length<3) found.push(bm);
  if(found.length){ var b0=found[0], ctx=function(x){ return '…'+qaText(text.slice(Math.max(0,x.index-40), x.index+40), 90)+'…'; };
    var holder=null; try{ var tw=d.createTreeWalker(host, 4); for(var nd=tw.nextNode(); nd; nd=tw.nextNode()){ if(/(NaN|undefined|\[object Object\])/.test(nd.textContent) && qaVisible(nd.parentElement)){ holder=nd.parentElement; break; } } }catch(e){}
    add('깨진 값 «'+b0[1]+'» — '+ctx(b0), false, found.map(function(x){ return '«'+x[1]+'» 주변 글자: '+ctx(x); }).concat(holder? ['들어 있는 요소: '+qaPath(holder)] : [])); }
  var over=d.documentElement.scrollWidth-w.innerWidth;
  if(over>1){
    var W=w.innerWidth, wide=[].slice.call(host.querySelectorAll('*')).filter(function(e){ if(!qaVisible(e)) return false; var r=e.getBoundingClientRect(); return r.right>W+1 && r.width>0; });
    var tops=wide.filter(function(e){ return !wide.some(function(p){ return p!==e && p.contains(e); }); }).slice(0,2);
    var leaf=wide.filter(function(e){ return /^(TABLE|PRE|IMG|SVG|CANVAS|SELECT|INPUT|TEXTAREA|IFRAME)$/i.test(e.tagName); }).sort(function(a,b){ return b.getBoundingClientRect().width-a.getBoundingClientRect().width; }).slice(0,2);
    var desc=function(e){ var r=e.getBoundingClientRect(), cs=w.getComputedStyle(e), x=qaPath(e)+' — 폭 '+Math.round(r.width)+'px · 오른쪽 끝 '+Math.round(r.right)+'px';
      if(e.tagName==='TABLE'){ var tr=e.querySelector('tr'); x+=' · 열 '+(tr? tr.children.length:'?')+'개'; }
      if(cs.display==='grid') x+=' · grid-template-columns: '+cs.gridTemplateColumns;
      if(cs.whiteSpace==='nowrap') x+=' · white-space:nowrap'; return x; };
    var lay=[]; if(tops[0]) for(var pa=tops[0].parentElement; pa && pa!==host.parentElement && lay.length<1; pa=pa.parentElement){ var pcs=w.getComputedStyle(pa); if(/grid|flex/.test(pcs.display)) lay.push('담고 있는 레이아웃: '+qaPath(pa)+' — display '+pcs.display+(/grid/.test(pcs.display)? ' · grid-template-columns: '+pcs.gridTemplateColumns : ' · flex-wrap '+pcs.flexWrap)+' · 폭 '+Math.round(pa.getBoundingClientRect().width)+'px'); }
    add('페이지가 옆으로 '+over+'px 넘침', false, ['화면 폭 '+W+'px · 문서 폭 '+d.documentElement.scrollWidth+'px'].concat(tops.map(function(e){ return '넘친 바깥 요소: '+desc(e); }), lay, leaf.map(function(e){ return '가장 넓은 내용: '+desc(e); })));
  }
  var els=[].slice.call(host.querySelectorAll('*')), seen=0, stacked=null;
  for(var k=0;k<els.length && seen<600;k++){ var el=els[k]; if(!qaVisible(el) || el.closest('svg')) continue;
    var t=[].slice.call(el.childNodes).filter(function(n){ return n.nodeType===3 && n.textContent.trim().length>=6; }).map(function(n){ return n.textContent.trim(); }).join(''); if(!t) continue; seen++;
    var r=el.getBoundingClientRect(), fs=parseFloat(w.getComputedStyle(el).fontSize)||12; if(r.height>=fs*1.5*3 && r.width<fs*3.2){ stacked={t:t, el:el, w:r.width, h:r.height}; break; } }
  if(stacked) add('글자가 세로로 쌓임 «'+qaText(stacked.t, 20)+'»', false, [qaPath(stacked.el)+' — 폭 '+Math.round(stacked.w)+'px · 높이 '+Math.round(stacked.h)+'px', '부모: '+qaPath(stacked.el.parentElement)+' · display '+w.getComputedStyle(stacked.el.parentElement).display]);
  return out;
}
export function qaStep(id, label, group){ var s={id:id, label:label, group:group||'', st:'wait', ms:0, detail:''}; QA.steps.push(s); return s; }
export function qaPaint(){
  var L=document.getElementById('qaList'); if(!L) return;
  var ic={wait:'·', run:'⏳', ok:'✅', fail:'❌', warn:'⚠️', skip:'—'};
  L.innerHTML=QA.steps.map(function(s){ return tpl`<div class="qa-row ${rawHtml(s.st)}"><span class="qa-ic">${rawHtml(ic[s.st])}</span><span class="qa-lb">${rawHtml(s.group? tpl`<span class="mini">${s.group} </span>`:'')}${s.label}</span><span class="mini qa-ms">${rawHtml(s.ms? (s.ms/1000).toFixed(1)+'s':'')}</span>${rawHtml(s.detail? tpl`<div class="mini qa-dt">${s.detail}</div>`:'')}</div>`; }).join('');
  var run=L.querySelector('.qa-row.run'); if(run) try{ run.scrollIntoView({block:'nearest'}); }catch(e){}
  var cap=document.getElementById('qaPrevCap'), cur=QA.steps.filter(function(s){ return s.st==='run'; })[0], done=QA.steps.filter(function(s){ return /ok|fail|warn/.test(s.st); }).length;
  if(cap) cap.textContent=cur? '지금: '+(cur.group? cur.group+' ':'')+cur.label+' ('+(done+1)+'/'+QA.steps.length+')' : (QA.on? '준비 중…' : '점검 끝 — 미리보기는 스테이징 홈');
}
export function qaFit(fw, fh, keepH){
  var box=document.getElementById('qaFrame'), ifr=QA.ifr; if(!box || !ifr) return;
  var avail=box.clientWidth||600, s=Math.min(1, avail/fw); if(keepH){ s=Math.min(s, keepH/fh); } else box.style.height=Math.round(fh*s)+'px';
  ifr.style.width=fw+'px'; ifr.style.height=fh+'px'; ifr.style.transform='scale('+s+')'; ifr.style.left=Math.max(0, Math.round((avail-fw*s)/2))+'px';
}
export function qaOpen(){
  var old=document.getElementById('ovlQa'); if(old) old.remove();
  var ov=document.createElement('div'); ov.id='ovlQa'; ov.className='ovl on'; ov.style.cssText='z-index:9400;align-items:center';
  ov.innerHTML=tpl`<div class="modal qa" style="width:min(1240px,100%);padding:18px 20px" role="dialog" aria-modal="true" aria-labelledby="qaTitle">`+
    tpl`<div class="qa-head"><h3 id="qaTitle" style="margin:0;font-size:15px">🧪 스테이징 QA</h3><span class="mini" id="qaVer">스테이징을 여는 중…</span><span style="flex:1"></span><button type="button" class="pill ghost" id="qaRerun">↻ 다시 실행</button><button type="button" class="pill ghost" id="qaClose">닫기</button></div>`+
    tpl`<div class="qa-body"><div class="qa-prev"><div class="qa-frame" id="qaFrame"></div><div class="mini" id="qaPrevCap" style="margin-top:4px">준비 중…</div></div><div class="qa-list" id="qaList" tabindex="0" aria-label="점검 항목"></div></div>`+
    tpl`<div class="qa-foot"><div id="qaSum" class="qa-sum">준비 중…</div><span style="flex:1"></span><button type="button" class="pill ghost" id="qaCopy" disabled title="실패·경고 내용을 화면 크기·요소 경로·오류 위치와 함께 정리해 복사 — Claude 대화창에 그대로 붙여넣으면 됩니다">📋 Claude 에게 보낼 내용 복사</button><button type="button" class="pill pri" id="qaPromote" disabled>스테이징 → 운영 승격 →</button></div></div>`;
  document.body.appendChild(ov);
  ov.querySelector('#qaClose').onclick=qaClose;
  ov.querySelector('#qaRerun').onclick=function(){ qaRun(); };
  ov.querySelector('#qaPromote').onclick=function(){ qaClose(); opsCopy('staging',''); };
  ov.querySelector('#qaCopy').onclick=qaCopy;
  qaRun();
}
export function qaClose(){ QA.run++; QA.on=false; QA.w=null; QA.ifr=null; var ov=document.getElementById('ovlQa'); if(ov) ov.remove(); if(ST.CUR_VIEW==='ops') try{ renderOps(true); }catch(e){} }
export async function qaRun(){
  var run=++QA.run; QA.on=true; QA.errs=[]; QA.steps=[]; QA.res=null;
  var alive=function(){ return run===QA.run; };
  var sum=document.getElementById('qaSum'), pb=document.getElementById('qaPromote'), cb=document.getElementById('qaCopy'); if(pb) pb.disabled=true; if(cb) cb.disabled=true; if(sum) sum.textContent='실행 중…';
  var box=document.getElementById('qaFrame'); if(!box) return; box.innerHTML='';
  var ifr=document.createElement('iframe'); ifr.setAttribute('title','스테이징 포탈 미리보기'); ifr.style.cssText='position:absolute;top:0;left:0;border:0;transform-origin:0 0;background:#fff';
  QA.ifr=ifr; box.appendChild(ifr); qaFit(1280, 800); var boxH=box.clientHeight;
  var s0=qaStep('open','스테이징 열기 · 로그인'); s0.st='run'; qaPaint();
  var t0=Date.now();
  var w=await new Promise(function(res){ ifr.onload=function(){ res(ifr.contentWindow); }; setTimeout(function(){ res(ifr.contentWindow); }, 20000); ifr.src=qaStagingUrl(); });
  if(!alive()) return;
  QA.w=w;
  try{ w.addEventListener('error', function(e){ QA.errs.push({m:String((e&&e.message)||'오류'), at:e&&e.filename? String(e.filename).replace(/^.*\/staging\//,'').replace(/\?.*$/,'')+':'+e.lineno+':'+e.colno : '', st:String((e&&e.error&&e.error.stack)||'').split('\n').slice(0,4).join(' ⏎ ')}); });
       w.addEventListener('unhandledrejection', function(e){ var r=e&&e.reason; QA.errs.push({m:'Promise: '+String((r&&(r.message||r))||''), at:'', st:String((r&&r.stack)||'').split('\n').slice(0,4).join(' ⏎ ')}); });
       w.document.addEventListener('securitypolicyviolation', function(e){ QA.errs.push({m:'CSP 차단: '+e.violatedDirective+' '+(e.blockedURI||''), at:String(e.sourceFile||'').replace(/^.*\/staging\//,'')+(e.lineNumber? ':'+e.lineNumber:''), st:''}); }); }catch(e){}
  var ready=await qaWait(function(){ var app=w.document.getElementById('app'); return qaApi(w).ST && qaApi(w).ST.DATA && app && !app.classList.contains('hidden'); }, 30000, 250);
  s0.ms=Date.now()-t0;
  if(!alive()) return;
  var verS=''; try{ verS=String(qaApi(w).APP_VER||''); }catch(e){}
  var verP=String(APP_VER||''); var vs=document.getElementById('qaVer');
  if(vs) vs.textContent='스테이징 '+(verS.match(/㊿\+\d+/)||[verS||'?'])[0]+' · '+(IS_STAGING? '기준(이 화면·스테이징) ':'운영(이 화면) ')+(verP.match(/㊿\+\d+/)||[verP])[0]+(verS && verS===verP? ' — 같은 버전(스테이징에 새로 올린 게 없음?)':'');
  if(!ready){ var ls=w.document&&w.document.getElementById('viewLogin'); var errCard=w.document&&w.document.querySelector('#loading .err');
    s0.st='fail'; s0.detail=errCard? qaText(errCard.innerText, 120) : (ls && qaVisible(ls)? '로그인 화면에 머묾 — 세션이 공유되지 않음(로그인 유지가 꺼진 다른 탭?)' : (QA.errs.length? 'JS 오류: '+qaText(QA.errs[0].m,100) : '30초 안에 데이터가 뜨지 않음'));
    s0.diag=QA.errs.slice(0,3).map(function(x){ return 'JS 오류: '+x.m+(x.at? ' @ '+x.at:'')+(x.st? ' · stack: '+x.st:''); });
    qaPaint(); return qaFinish(run); }
  s0.st='ok'; qaPaint();
  // 메뉴 목록 — 스테이징 사이드바에 보이는 것(권한·메뉴 편집 반영)
  var btns=[].slice.call(w.document.querySelectorAll('#side button[data-v]')).filter(function(b){ return (qaApi(w).visBtn? qaApi(w).visBtn(b) : (b.style.display!=='none' && !b.classList.contains('pdeny'))); });
  var menus=[]; btns.forEach(function(b){ var v=b.dataset.v; if(v && menus.every(function(m){ return m.v!==v; })){ var sub=''; try{ sub=qaApi(w).navSub? qaApi(w).navSub(b) : ''; }catch(e){} menus.push({v:v, label:(sub? sub+' · ':'')+(qaApi(w).navText? qaApi(w).navText(b) : b.textContent).trim()}); } });
  if(!menus.some(function(m){ return m.v==='dash'; })) menus.unshift({v:'dash', label:'홈'});
  var sK=qaStep('kpi','핵심 숫자 운영 = 스테이징');
  var desk=menus.map(function(m){ return {m:m, s:qaStep('d:'+m.v, m.label, '')}; });
  var mob=menus.filter(function(m){ return QA_MOBILE.indexOf(m.v)>=0; }).map(function(m){ return {m:m, s:qaStep('m:'+m.v, m.label, '📱')}; });
  qaPaint();
  var runMenu=async function(item){
    var m=item.m, s=item.s; s.st='run'; qaPaint(); var t=Date.now(), e0=QA.errs.length, res=[];
    var pre=function(tag, list){ list.forEach(function(x){ res.push({m:(tag? '['+tag+'] ':'')+x.m, w:x.w, d:(tag? ['관리자 탭: '+tag]:[]).concat(x.d)}); }); };
    try{
      try{ qaApi(w).navMenu(m.v); }catch(e){ res.push({m:'이동 오류: '+qaText(e.message||e, 100), w:false, d:['navMenu(\''+m.v+'\') 에서 예외: '+String(e.message||e), 'stack: '+String(e.stack||'').split('\n').slice(0,4).join(' ⏎ ')]}); }
      if(m.v==='dash'){ try{ var ab=w.document.getElementById('ccAnaBtn'); if(ab && ab.getAttribute('aria-expanded')!=='true') ab.click(); }catch(e){} }
      await qaRaf(w); await qaSleep(250);
      if(m.v==='adminx' && await qaWait(function(){ return !!qaApi(w).admTab; }, 6000, 100)){   /* ㊿+153: 관리자 코드는 처음 열 때 받음 — 받을 때까지 */ var tabs=['acct','sec','cfg','bill','api']; for(var i=0;i<tabs.length;i++){ if(!alive()) return; qaApi(w).admTab(tabs[i]); await qaRaf(w); pre(tabs[i], await qaInspect(w, m.v)); } qaApi(w).admTab('acct'); }
      else pre('', await qaInspect(w, m.v));
      QA.errs.slice(e0).forEach(function(x){ res.push({m:'JS 오류: '+qaText(x.m, 110), w:false, d:['오류: '+x.m+(x.at? ' @ '+x.at:''), x.st? 'stack: '+x.st : ''].filter(Boolean)}); });
    }catch(e){ res.push({m:'검사 오류: '+qaText(e.message||e, 100), w:true, d:[String(e.stack||e).slice(0,300)]}); }
    var hard=res.filter(function(x){ return !x.w; });
    s.ms=Date.now()-t; s.st=!res.length? 'ok' : hard.length? 'fail' : 'warn';
    s.detail=res.slice(0,4).map(function(x){ return x.m; }).join(' · ');
    s.diag=[].concat.apply([], res.map(function(x){ return ['• '+x.m].concat(x.d.map(function(z){ return '  - '+z; })); }));
    s.view=m.v; s.size=w.innerWidth+'×'+w.innerHeight; qaPaint();
  };
  // 핵심 숫자
  sK.st='run'; qaPaint(); var tk=Date.now();
  try{ var a=qaKpi(window), b=qaKpi(w);
    if(a._err || b._err){ sK.st='warn'; sK.detail='비교 못 함 — '+(a._err? '이 화면: '+a._err : '')+(b._err? ' 스테이징: '+b._err : ''); }
    else { var df=qaKpiDiff(a, b); var n=Object.keys(a).length;
      if(df.diffs.length){ sK.st='fail'; sK.detail=df.diffs.length+'개 다름 — '+df.diffs.slice(0,5).join(' · ')+(df.diffs.length>5? ' 외 '+(df.diffs.length-5):''); sK.diag=['기준(이 화면) → 스테이징, buildDigest() 숫자:'].concat(df.diffs.slice(0,40).map(function(x){ return '  - '+x; })); }
      else { sK.st='ok'; sK.detail=n+'개 숫자 일치'+(df.onlyB? ' · 스테이징에 새 항목 '+df.onlyB:'')+(df.onlyA? ' · 없어진 항목 '+df.onlyA:''); } }
  }catch(e){ sK.st='warn'; sK.detail=qaText(e.message||e, 100); }
  sK.ms=Date.now()-tk; qaPaint();
  for(var i=0;i<desk.length;i++){ if(!alive()) return; await runMenu(desk[i]); }
  // 폰 폭
  if(mob.length){ qaFit(390, 844, boxH); await qaSleep(500); await qaRaf(w);
    for(var j=0;j<mob.length;j++){ if(!alive()) return; await runMenu(mob[j]); }
    qaFit(1280, 800); try{ qaApi(w).navMenu('dash'); }catch(e){} }
  await qaDataPhase(run);
  qaFinish(run);
}
/* ===== ㊿+157 QA «데이터 입력·수정» — 같은 스테이징을 ?qa=data(가짜 DB · js/qadata.js)로 다시 열어, 그 버전에 들어 있는 시나리오를 차례로 실행
   · 칸 채우기 → 저장 → 가짜 DB 값(원) · 다시 읽은 화면 · 합계 · LIVE 대조 — 운영 DB 에는 아무것도 쓰지 않음(가짜 창은 저장소·로그인도 분리)
   · 스테이징이 옛 버전이라 시나리오가 없으면 «—» (건너뜀) */
export function qaDataUrl(){ return qaStagingUrl().replace('qa=1', 'qa=data'); }
export async function qaDataPhase(run){
  var alive=function(){ return run===QA.run; }, ifr=QA.ifr; if(!ifr) return;
  var s0=qaStep('data:open', '가짜 DB 로 다시 열기', '🧾'); s0.st='run'; qaPaint(); var t0=Date.now();
  var w=await new Promise(function(res){ ifr.onload=function(){ res(ifr.contentWindow); }; setTimeout(function(){ res(ifr.contentWindow); }, 20000); ifr.src=qaDataUrl(); });
  if(!alive()) return;
  var errs=[]; try{ w.addEventListener('error', function(e){ errs.push(String((e&&e.message)||'오류')+(e&&e.filename? ' @ '+String(e.filename).replace(/^.*\/staging\//,'').replace(/\?.*$/,'')+':'+e.lineno : '')); });
    w.addEventListener('unhandledrejection', function(e){ var r=e&&e.reason; errs.push('Promise: '+String((r&&(r.message||r))||'')); }); }catch(e){}
  var ready=await qaWait(function(){ var a=qaApi(w); return a.ST && a.ST.DATA && a.ST.DATA.rows && a.ST.DATA.rows.length; }, 30000, 250);
  s0.ms=Date.now()-t0; if(!alive()) return;
  var api=qaApi(w);
  if(!api || !api.qaDataList){ s0.st='skip'; s0.detail='이 스테이징 버전에는 데이터 입력·수정 점검이 없음(㊿+157 부터)'; qaPaint(); return; }
  if(!ready){ s0.st='fail'; s0.detail=errs.length? 'JS 오류: '+qaText(errs[0], 100) : '30초 안에 가짜 데이터가 뜨지 않음'; s0.diag=errs.slice(0,4); qaPaint(); return; }
  if(api.QA_DATA_MSG){ s0.st='warn'; s0.detail=api.QA_DATA_MSG; qaPaint(); return; }
  s0.st='ok'; s0.detail='가짜 DB · 계약 '+api.QADB.t.contracts.length+'건 (운영 DB 에는 쓰지 않음)'; qaPaint();
  var list=api.qaDataList(), steps=list.map(function(x){ return qaStep('data:'+x.id, x.label, '🧾'); }); qaPaint();
  for(var i=0;i<list.length;i++){ if(!alive()) return; var st=steps[i]; st.st='run'; qaPaint(); var e0=errs.length, r;
    try{ r=await api.qaDataRun(i); }catch(e){ r={ok:false, detail:String(e.message||e), diag:[]}; }
    var je=errs.slice(e0);
    st.ms=r.ms||0; st.st=r.skip? 'skip' : (r.ok && !je.length)? 'ok' : 'fail'; st.detail=qaText((je.length && r.ok? 'JS 오류: '+je[0] : r.detail)||'', 160); st.view='qa:data';
    st.diag=(r.diag||[]).map(function(x){ return '  - '+x; }).concat(je.slice(0,3).map(function(x){ return '  - JS 오류: '+x; })); qaPaint(); }
}
export async function qaFinish(run){
  if(run!==QA.run) return; QA.on=false;
  var all=QA.steps.filter(function(s){ return s.st!=='skip'; }), fails=all.filter(function(s){ return s.st==='fail'; }), warns=all.filter(function(s){ return s.st==='warn'; });
  var verS=''; try{ verS=String((QA.w&&qaApi(QA.w).APP_VER)||''); }catch(e){}
  QA.res={at:Date.now(), verS:(verS.match(/㊿\+\d+/)||[verS])[0], verP:(String(APP_VER).match(/㊿\+\d+/)||[APP_VER])[0], total:all.length, pass:all.length-fails.length-warns.length, fail:fails.length, warn:warns.length, fails:fails.map(function(s){ return (s.group? s.group+' ':'')+s.label+' — '+s.detail; })};
  var sum=document.getElementById('qaSum'), pb=document.getElementById('qaPromote');
  if(sum) sum.innerHTML=tpl`${rawHtml(fails.length? tpl`<b style="color:var(--critical)">❌ ${fails.length}건 실패</b>` : '<b style="color:var(--ok,var(--brand-ink))">✅ 전부 통과</b>')} <span class="mini">· ${rawHtml(QA.res.pass)}/${all.length}${rawHtml(warns.length? ' · ⚠️ '+warns.length:'')} · ${rawHtml(QA.res.verS)}${fails.length? ' — 실패 항목을 고친 뒤 다시 올리고 QA 를 다시 돌리세요' : ' — 승격해도 됩니다'}</span>`;
  if(pb) pb.disabled=!!fails.length;
  var cb=document.getElementById('qaCopy'); if(cb){ cb.disabled=false; if(fails.length||warns.length) cb.classList.remove('ghost'); }
  if(sum && (fails.length||warns.length)) sum.innerHTML+='<div class="mini" style="margin-top:2px">«📋 Claude 에게 보낼 내용 복사» 를 눌러 Claude 대화창에 붙여넣으면 — 화면 크기·요소 경로·오류 위치까지 정리돼 있어 바로 고칠 수 있습니다</div>';
  qaPaint();
  try{ await logChange('staging_qa','staging',QA.res.verS,{pass:QA.res.pass, total:QA.res.total, fail:QA.res.fail, warn:QA.res.warn, fails:QA.res.fails.slice(0,20), prod:QA.res.verP}); }catch(e){}
  if(ST.CUR_VIEW==='ops' && OPS.tab==='gh') try{ renderOps(true); }catch(e){}
}
export function qaBadgeHtml(){
  var r=QA.res; if(!r) return '<span class="mini" id="qaBadge">QA 아직 안 함</span>';
  var t=new Date(r.at), hm=('0'+t.getHours()).slice(-2)+':'+('0'+t.getMinutes()).slice(-2);
  return tpl`<span class="ctag${r.fail? ' late':' ok'}" id="qaBadge" title="${r.fails.slice(0,3).join('\n')}">QA ${rawHtml(r.fail? '❌ '+r.fail+'건 실패':'✅ '+r.pass+'/'+r.total)} · ${r.verS} · ${rawHtml(hm)}</span>`;
}

/* ── Claude 에게 넘길 보고서 (마크다운) — 실패·경고 상세 + 실행 환경 · 통과는 이름만 ── */
export function qaReport(){
  var r=QA.res||{}, st=QA.steps||[], at=new Date(r.at||Date.now());
  var kst=new Date(at.getTime()+9*3600e3).toISOString().replace('T',' ').slice(0,16)+' KST';
  var ua=String(navigator.userAgent||''), br=(/Edg\/(\d+)/.exec(ua)? 'Edge '+RegExp.$1 : /Chrome\/(\d+)/.exec(ua)? 'Chrome '+RegExp.$1 : /Version\/([\d.]+).*Safari/.exec(ua)? 'Safari '+RegExp.$1 : /Firefox\/(\d+)/.exec(ua)? 'Firefox '+RegExp.$1 : ua.slice(0,60));
  var os=/Windows NT [\d.]+/.exec(ua)||/Mac OS X [\d_]+/.exec(ua)||/Android [\d.]+/.exec(ua)||/iPhone OS [\d_]+/.exec(ua)||/CrOS|Linux/.exec(ua)||['?'];
  var fails=st.filter(function(s){ return s.st==='fail'; }), warns=st.filter(function(s){ return s.st==='warn'; }), oks=st.filter(function(s){ return s.st==='ok'; });
  var L=[];
  L.push('# 포탈 스테이징 QA 결과 — '+(fails.length? '❌ 실패 '+fails.length+'건' : '✅ 실패 없음')+(warns.length? ' · ⚠ 경고 '+warns.length+'건' : '')+' ('+(r.pass||oks.length)+'/'+(r.total||st.length)+' 통과)');
  L.push('');
  L.push('- 스테이징: '+(r.verS||'?')+' · 기준(이 화면): '+(r.verP||'?')+(IS_STAGING? ' (스테이징에서 실행)' : ' (운영)')+' · '+kst);
  L.push('- 실행: '+(ST.AUTH_USER||'?')+' · 브라우저: '+br+' · '+String(os[0]).replace(/_/g,'.')+' · 이 화면 '+window.innerWidth+'×'+window.innerHeight);
  L.push('- 미리보기 크기: 데스크톱 1280×800 · 📱 폰 390×844 (QA 창 안 iframe)');
  L.push('- 주소: '+location.origin+qaStagingUrl().replace(/&t=\d+/,''));
  var block=function(title, list){ if(!list.length) return; L.push(''); L.push('## '+title); list.forEach(function(s, i){
    L.push(''); L.push('### '+(i+1)+'. '+(s.group? s.group+' ':'')+s.label+(s.view? ' (`'+s.view+'` · '+(s.size||'')+')' : '')+(s.ms? ' · '+(s.ms/1000).toFixed(1)+'초':''));
    (s.diag&&s.diag.length? s.diag : ['• '+(s.detail||'(내용 없음)')]).forEach(function(x){ L.push(x); }); }); };
  block('❌ 실패', fails); block('⚠ 경고 (승격은 막지 않음)', warns);
  L.push(''); L.push('## ✅ 통과 ('+oks.length+')'); L.push(oks.map(function(s){ return (s.group? s.group:'')+s.label; }).join(' · ') || '—');
  L.push(''); L.push('> 검사 항목: JS 오류 · 빈 화면 · 깨진 값(NaN/undefined) · 가로 넘침 · 글자 세로 쌓임 · 하위 페이지 로드 · 핵심 숫자(buildDigest) 운영=스테이징 · 저장/발송은 누르지 않음');
  return L.join('\n');
}
export function qaCopy(){
  var txt=qaReport();
  var done=function(){ toast('복사했습니다', 'Claude 대화창에 붙여넣으세요 ('+txt.split('\n').length+'줄)'); var b=document.getElementById('qaCopy'); if(b){ var o=b.textContent; b.textContent='✓ 복사됨'; setTimeout(function(){ b.textContent=o; }, 1800); } };
  var fallback=function(){
    var old=document.getElementById('ovlQaTxt'); if(old) old.remove();
    var ov=document.createElement('div'); ov.id='ovlQaTxt'; ov.className='ovl on'; ov.style.cssText='z-index:9600;align-items:center';
    ov.innerHTML='<div class="modal" style="width:min(760px,100%);padding:18px 20px" role="dialog" aria-modal="true" aria-labelledby="qaTxtT"><h3 id="qaTxtT" style="margin:0 0 6px;font-size:15px">Claude 에게 보낼 내용</h3><p class="mini" style="margin:0 0 8px">자동 복사가 막혀 있어 아래 글을 전부 선택(Ctrl+A)해 복사(Ctrl+C)하세요.</p><textarea id="qaTxtArea" class="ops-ta" readonly aria-label="QA 보고서" style="min-height:320px"></textarea><div class="mact" style="display:flex;justify-content:flex-end;margin-top:8px"><button type="button" class="pill" id="qaTxtClose">닫기</button></div></div>';
    document.body.appendChild(ov); var ta=ov.querySelector('#qaTxtArea'); ta.value=txt; setTimeout(function(){ ta.focus(); ta.select(); }, 30);
    ov.querySelector('#qaTxtClose').onclick=function(){ ov.remove(); };
  };
  try{ if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fallback); else fallback(); }catch(e){ fallback(); }
  return txt;
}

/* ── ㊿+164 🔌 외부 연동 API 키 (SQL 102 · Edge Function export) — 사용자: «외부 시스템에서 포탈 정보를 가져가는 기능» 1번(읽기 전용 API)
   · 시스템마다 키 한 개 · 범위(계약·월 매출·고객사·월 매출 합계) · 고객사명 포함 여부 · 유효 기간 · 폐기 · 최근 호출 기록
   · 키 원문은 발급 직후 이 화면에서 한 번만 보임(DB 에는 SHA-256 만) — 관리자 화면을 다시 열면 사라짐 */
export var API={keys:null, log:null, made:null, err:'', busy:false};
export var API_SCOPES=[['contracts','계약','고객사 · 서비스 · 구분 · 상태 · 기간 · MRR · 노드 (비고·연장 이력 제외)'],['revenue','월 매출','계약별 월 금액(원)'],['customers','고객사','id · 이름(옵션) · 산업군'],['mrr','월 매출 합계','월별 · 서비스별 합계(포탈 «월 MRR»과 같은 원천)'],
  ['poc','MDR PoC·운영','고객사 · 서비스유형 · 상태(신청~데모 = PoC · 구독 · 종료) · 계약수량 · 설치 수 · 라이선스 · 모듈 · 시작일 (고객 담당자·연락처·진행 메모 제외)'],
  ['orders','장비 신청','신청일 · 유형 · 고객사 · 모델 · 수량 · 상태 · 시리얼 · 회수 (수령인·연락처·주소·요청사항 제외)'],
  ['assets','장비 현황','시리얼 · 모델 · 구분 · 상태 · 고객사 · 출고·회수일 (비고 제외)']];
export function apiBase(){ return SB_URL+'/functions/v1/export'; }
export function apiScopeLabel(s){ var x=API_SCOPES.filter(function(a){ return a[0]===s; })[0]; return x? x[1] : s; }
export async function apiLoad(){
  try{ API.keys=await sbWrite('POST','rpc/api_key_list',{})||[]; API.log=await sbWrite('POST','rpc/api_access_recent',{p_limit:30})||[]; API.err=''; }
  catch(e){ var m=String((e&&e.message)||e); API.keys=null; API.log=null; API.err=/\(404\)|PGRST202|Could not find the function/.test(m)? 'SQL 102 를 먼저 실행하세요 — API 키 표와 함수가 아직 없습니다.' : m; }
  apiPaint();
}
export function apiSnippets(key){
  var b=apiBase(), k=key||'<발급받은 키>';
  return [['curl', 'curl -H "X-API-Key: '+k+'" "'+b+'/contracts?updated_since=2026-10-01"'],
    ['Apps Script', "var res = UrlFetchApp.fetch('"+b+"/mrr?from=2026-01&to=2026-12', {headers: {'X-API-Key': PropertiesService.getScriptProperties().getProperty('SVC_API_KEY')}});\nvar data = JSON.parse(res.getContentText()).data;"],
    ['Python', "import requests\nr = requests.get('"+b+"/revenue', headers={'X-API-Key': KEY}, params={'from': '2026-01', 'to': '2026-12'})\nrows = r.json()['data']"],
    ['엑셀용 CSV', 'curl -H "X-API-Key: '+k+'" "'+b+'/contracts?format=csv" -o contracts.csv']];
}
export function apiPaint(){
  var box=document.getElementById('apiBox'); if(!box) return;
  var h=tpl`<p class="cap" style="margin:0 0 10px">다른 시스템(ERP · BI · 시트 등)이 포탈 데이터를 <b>읽기 전용</b>으로 가져가는 주소입니다 — <code>${apiBase()}/&lt;자료&gt;</code> · 헤더 <code>X-API-Key</code> · 금액은 원 · 월은 YYYY-MM · 분당 60회 · 모든 호출이 아래 기록에 남습니다. 시스템마다 키를 따로 주면 하나만 바로 끊을 수 있습니다.</p>`;
  if(API.err) h+=tpl`<p class="cap" style="color:var(--critical);margin:0 0 10px">⚠ ${API.err}</p>`;
  if(API.made){
    var mk0=API.made;
    h+=tpl`<div class="api-made" role="status"><b>새 키 — «${mk0.name}»</b> <span class="mini">이 화면을 벗어나면 다시 볼 수 없습니다. 지금 복사해서 그 시스템 담당자에게 안전하게(메신저 1:1 · 비밀번호 관리자) 전하세요. 채팅방·메일 본문·GitHub 에는 붙이지 마세요.</span>`+
      tpl`<div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap"><code id="apiKeyText" class="api-key">${mk0.key}</code><button type="button" class="pill" id="apiCopy">복사</button><button type="button" class="pill ghost" id="apiMadeOk">전달했어요 · 숨기기</button></div>`+
      tpl`<pre class="api-code">${apiSnippets(mk0.key)[0][1]}</pre></div>`;
  }
  h+=tpl`<details class="api-new" id="apiNewBox"${rawHtml(API.keys && !API.keys.length? ' open':'')}><summary><b>＋ 새 키 발급</b></summary><div class="frm" style="grid-template-columns:1.4fr 1fr 1fr;margin-top:8px">`+
    tpl`<div><label for="apiName">어느 시스템인지</label><input id="apiName" maxlength="60" placeholder="예: 회계 ERP · 경영 BI · 영업팀 시트"></div>`+
    tpl`<div><label for="apiDays">유효 기간</label><select id="apiDays"><option value="90">90일</option><option value="180">180일</option><option value="365" selected>1년</option><option value="0">무기한</option></select></div>`+
    tpl`<div><label for="apiNote">메모 (선택)</label><input id="apiNote" maxlength="120" placeholder="담당자 · 용도"></div></div>`+
    tpl`<div class="api-scopes" role="group" aria-label="가져갈 데이터">${rawHtml(API_SCOPES.map(function(s){ return tpl`<label><input type="checkbox" class="apiScope" value="${s[0]}"${rawHtml(['contracts','revenue','mrr'].indexOf(s[0])>=0? ' checked':'')}> <b>${s[1]}</b> <span class="mini">${s[2]}</span></label>`; }).join(''))}`+
    tpl`<label><input type="checkbox" id="apiNames" checked> <b>고객사명 포함</b> <span class="mini">끄면 고객사 id 만 (이름이 필요 없는 집계용 시스템)</span></label></div>`+
    tpl`<div style="display:flex;gap:8px;align-items:center;margin-top:8px"><button type="button" class="pill" id="apiCreate">키 발급</button><span class="mini" id="apiMsg"></span></div></details>`;
  var ks=API.keys||[];
  h+=tpl`<div class="adm-h">발급한 키 <span class="mini">${ks.length}개 · 사용 중 ${ks.filter(function(k){ return k.active; }).length}</span> <button type="button" class="pill ghost" id="apiReload" style="margin-left:auto">↻ 다시 읽기</button></div>`;
  h+=ks.length? tpl`<div class="tbl-wrap" tabindex="0"><table class="dgrid" id="apiKeys"><thead><tr><th>시스템</th><th>키 앞자리</th><th>가져가는 데이터</th><th>고객사명</th><th>만료</th><th>마지막 사용</th><th class="n">7일 호출</th><th>상태</th><th></th></tr></thead><tbody>${rawHtml(ks.map(function(k){
      var st=k.revoked_at? tpl`<span class="ctag">폐기 ${String(k.revoked_at).slice(0,10)}</span>` : k.expired? '<span class="ctag late">만료</span>' : '<span class="ctag ok">사용 중</span>';
      return tpl`<tr data-key="${k.id}"><td><b>${k.name}</b>${rawHtml(k.note? tpl`<div class="mini">${k.note}</div>`:'')}</td><td><code>${k.prefix}…</code></td><td>${(k.scopes||[]).map(apiScopeLabel).join(' · ')}</td><td>${k.names? '포함':'빼고'}</td>`+
        tpl`<td>${k.expires_at? String(k.expires_at).slice(0,10) : '무기한'}</td><td class="mini">${k.last_used_at? String(k.last_used_at).replace('T',' ').slice(0,16) : '아직 없음'}</td><td class="n">${rawHtml(String(k.calls_7d||0))}${rawHtml(k.errors_7d? tpl` <span class="mini" style="color:var(--critical)">(거부 ${k.errors_7d})</span>`:'')}</td><td>${rawHtml(st)}</td>`+
        tpl`<td>${rawHtml(k.revoked_at? '' : tpl`<button type="button" class="cbtn" data-revoke="${k.id}">폐기</button>`)}</td></tr>`; }).join(''))}</tbody></table></div>` : (API.keys? '<p class="cap">아직 발급한 키가 없습니다.</p>' : '');
  var lg=API.log||[];
  h+=tpl`<div class="adm-h">최근 호출 <span class="mini">최근 30건 · 180일 지나면 지움</span></div>`;
  h+=lg.length? tpl`<div class="tbl-wrap" tabindex="0" style="max-height:40vh"><table class="dgrid" id="apiLog"><thead><tr><th>시각</th><th>키</th><th>자료</th><th>조건</th><th class="n">행</th><th>결과</th><th>IP</th><th class="n">ms</th></tr></thead><tbody>${rawHtml(lg.map(function(l){
      var ok=l.status>=200 && l.status<300;
      return tpl`<tr><td class="mini">${String(l.at||'').replace('T',' ').slice(0,19)}</td><td>${l.key_name||''}</td><td>${l.resource||''}</td><td class="mini">${String(l.query||'').slice(0,60)}</td><td class="n">${rawHtml(String(l.rows||0))}</td><td><span class="ctag ${rawHtml(ok? 'ok':'late')}">${String(l.status)}</span></td><td class="mini">${l.ip||''}</td><td class="n mini">${rawHtml(String(l.ms||0))}</td></tr>`; }).join(''))}</tbody></table></div>` : '<p class="cap">아직 호출이 없습니다.</p>';
  h+=tpl`<details class="api-help"><summary><b>사용법 · 주소 · 예시</b></summary><ul class="mini" style="line-height:1.8;margin:6px 0">`+
    tpl`<li><code>GET ${apiBase()}</code> — 이 키로 볼 수 있는 자료 · 단위</li>`+
    tpl`<li><code>/contracts</code> — 계약 · <code>updated_since=2026-10-01</code>(그 뒤 바뀐 것만) · <code>line=Cloud</code> · <code>status=재약정</code></li>`+
    tpl`<li><code>/revenue</code> — 월 매출 · <code>from=2026-01&amp;to=2026-12</code>(기본 최근 12개월) · <code>contract_id=</code></li>`+
    tpl`<li><code>/customers</code> — 고객사 · <code>/mrr</code> — 월 매출 합계 · <code>month=2026-10</code> 또는 <code>from~to</code></li>`+
    tpl`<li><code>/poc</code> — MDR PoC·운영 · <code>status=신청,대기,진행중,데모</code>(PoC 단계) · <code>svc_type</code> · <code>since=2026-10-01</code>(신청일)</li>`+
    tpl`<li><code>/orders</code> — 장비 신청 · <code>status</code> · <code>order_type</code> · <code>since</code> · <code>/assets</code> — 장비 현황(시리얼) · <code>status=임대중</code> · <code>model</code> · <code>updated_since</code></li>`+
    tpl`<li>공통: <code>limit</code>(기본 1000 · 최대 5000) · <code>offset</code> · 응답의 <code>next_offset</code> 으로 다음 쪽 · <code>format=csv</code></li>`+
    tpl`<li>오류: 401 키 없음·모름·폐기·만료 · 403 범위 밖 · 429 분당 60회 넘음 · 키는 주소(<code>?key=</code>)로 보내면 거부</li></ul>`+
    tpl`${rawHtml(apiSnippets(null).map(function(s){ return tpl`<div class="mini" style="margin-top:6px"><b>${s[0]}</b></div><pre class="api-code">${s[1]}</pre>`; }).join(''))}</details>`;
  box.innerHTML=h;
  apiBindBox(box);
}
export function apiBindBox(box){
  var g=function(id){ return box.querySelector('#'+id); };
  var rl=g('apiReload'); if(rl) rl.onclick=apiLoad;
  var cr=g('apiCreate'); if(cr) cr.onclick=apiCreate;
  var cp=g('apiCopy'); if(cp) cp.onclick=function(){ var t=(API.made&&API.made.key)||''; var done=function(){ toast('키 복사', '붙여 넣을 곳에만 붙이세요 — 채팅방·메일 본문·GitHub 금지'); };
    try{ navigator.clipboard.writeText(t).then(done, function(){ prompt('아래 키를 복사하세요 (Ctrl+C)', t); }); }catch(e){ prompt('아래 키를 복사하세요 (Ctrl+C)', t); } };
  var mo=g('apiMadeOk'); if(mo) mo.onclick=function(){ API.made=null; apiPaint(); };
  box.querySelectorAll('[data-revoke]').forEach(function(b){ b.onclick=function(){ apiRevoke(Number(b.getAttribute('data-revoke'))); }; });
}
export async function apiCreate(){
  if(API.busy) return;
  var box=document.getElementById('apiBox'), msg=box&&box.querySelector('#apiMsg');
  var say=function(t, bad){ if(msg){ msg.textContent=t; msg.style.color=bad? 'var(--critical)':''; } };
  var name=String(($('#apiName')||{}).value||'').trim(), days=Number(($('#apiDays')||{}).value||365), note=String(($('#apiNote')||{}).value||'').trim();
  var scopes=[].slice.call(box.querySelectorAll('.apiScope')).filter(function(c){ return c.checked; }).map(function(c){ return c.value; });
  var names=!!(/** @type {any} */ ($('#apiNames')||{})).checked;
  if(!name) return say('어느 시스템인지 이름을 넣으세요', true);
  if(!scopes.length) return say('가져갈 데이터를 하나 이상 고르세요', true);
  API.busy=true; say('발급 중…');
  try{
    var r=await sbWrite('POST','rpc/api_key_create',{p_name:name, p_scopes:scopes, p_names:names, p_days:days, p_note:note||null});
    API.made={name:r.name||name, key:r.key, prefix:r.prefix};
    try{ logChange('insert','api_keys',r.id,{name:name, scopes:scopes, names:names, days:days}); }catch(e){}
    toast('API 키 발급', name+' — 지금 복사하세요 (다시 볼 수 없음)');
    await apiLoad();
  }catch(e){ say(String((e&&e.message)||e), true); }
  API.busy=false;
}
export async function apiRevoke(id){
  var k=(API.keys||[]).filter(function(x){ return x.id===id; })[0]; if(!k) return;
  if(!confirm('«'+k.name+'» 키('+k.prefix+'…)를 폐기합니다.\n\n이 키를 쓰는 시스템은 바로 401(폐기된 키)을 받습니다 — 되살릴 수 없고, 계속 쓰려면 새 키를 발급해야 합니다.\n\n폐기할까요?')) return;
  try{ await sbWrite('POST','rpc/api_key_revoke',{p_id:id}); try{ logChange('update','api_keys',id,{action:'폐기', name:k.name}); }catch(e){} toast('API 키 폐기', k.name+' ('+k.prefix+'…)', 'warn'); }
  catch(e){ toast('폐기 실패', String((e&&e.message)||e), 'bad'); }
  await apiLoad();
}
