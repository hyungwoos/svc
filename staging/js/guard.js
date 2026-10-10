/* ===== guard.js — 운영 · 안정성 (㊿+175) =====
   ES 모듈 — 다른 파일의 이름은 아래 import 로만 씀 · 이 파일의 최상위 var/function 은 전부 export · 즉시 실행 문장은 js/init.js 의 start() 에
   ① 옛 탭 막기 — 이 탭의 버전(APP_VER)과 지금 서버에 올라가 있는 index.html 의 버전이 다르면
        화면 아래 띠 «새 버전이 올라왔습니다 — 새로고침» + 업무 데이터 저장(sbWrite)을 막음 (2026-10-08 옛 탭에서 연장 → 상태가 옛 방식으로 저장된 사고)
        · 확인: 처음 20초 뒤 · 10분마다(보일 때) · 창으로 돌아올 때(2분에 한 번) · 저장 직전(1분에 한 번 · 2.5초 안에 답이 없으면 그냥 진행)
        · 서버 버전이 «더 옛것»이면(되돌림 또는 잠깐의 CDN 지연) 1분 넘게 계속될 때만 옛 탭으로 봄
        · 기록 · 개인 표(change_log · client_errors · client_perf · notify_reads · AI 대화)는 막지 않음
   ② 동시 수정 — 표에서 행을 저장하기 직전에 DB 의 지금 값과 «이 탭이 읽어 온 값»을 대조(rowGuard)
        · 남이 바꾼 칸 중 내가 안 바꾼 칸 → 저장에서 빼서 남의 값을 그대로 둠(알림만)
        · 남도 나도 바꾼 칸 → 칸마다 «내가 본 값 → 지금 값 → 내가 넣을 값» + 마지막으로 바꾼 사람 → [내 값으로 저장] / [취소하고 새로 읽기]
   ③ 저장 확인 · 다시 시도 — 반영된 행이 0이면 «저장되지 않았습니다»(권한 · 지워진 행) · 연결이 끊기거나 응답이 없으면 «다시 시도» */
import { APP_VER, IS_QA } from './state.js';
import { rawHtml, SB_URL, tpl, won } from './core.js';
import { sbHeaders, toast } from './shell.js';
import { closeOvl, openOvl } from './edit.js';

export var VW={latest:null, at:0, stale:false, older:0, busy:null, fails:0, started:false};
/** 옛 탭이어도 막지 않는 쓰기 — 기록 · 개인 표 · 읽기 RPC */
export var VW_FREE=/^(change_log|client_errors|client_perf|notify_reads|ai_chat_history|ai_feedback|ai_check_log)\b|^rpc\/(load_|admin_list_users|is_super_admin|notify_reads_trim|client_perf_trim|ops_status)\b/;
export function verOn(){ return /^https?:$/.test(location.protocol) && !IS_QA; }
/** '2026-09-16 ㊿+175' → 175 (없으면 null) */
export function verNum(v){ var m=/㊿\+(\d+)/.exec(String(v||'')); return m? +m[1] : null; }
export function vwShort(v){ var n=verNum(v); return n!=null? '㊿+'+n : String(v||''); }
/** 서버의 index.html 버전을 읽어 VW 를 갱신 — 돌려주는 값: 옛 탭인지 */
export function verCheck(ms){
  if(!verOn()) return Promise.resolve(VW.stale);
  if(VW.busy) return VW.busy;
  VW.busy=(async function(){
    var ctl=new AbortController(), t=setTimeout(function(){ try{ ctl.abort(); }catch(e){} }, ms||8000);
    try{
      var p=location.pathname, r=await fetch(p+'?vw='+Date.now(), {cache:'no-store', signal:ctl.signal});
      if(!r.ok) throw new Error('HTTP '+r.status);
      var m=/name="app-ver" content="([^"]+)"/.exec(await r.text());
      if(m){ VW.latest=m[1]; VW.at=Date.now(); VW.fails=0; verJudge(); }
    }catch(e){ VW.fails++; }
    finally{ clearTimeout(t); }
    return VW.stale;
  })();
  VW.busy.then(function(){ VW.busy=null; }, function(){ VW.busy=null; });
  return VW.busy;
}
/** 같으면 정상 · 서버가 더 새것이면 바로 옛 탭 · 서버가 더 옛것이면(되돌림 · CDN 지연) 1분 넘게 계속될 때 */
export function verJudge(){
  var was=VW.stale, a=verNum(APP_VER), b=verNum(VW.latest);
  if(!VW.latest || VW.latest===APP_VER){ VW.stale=false; VW.older=0; }
  else if(a!=null && b!=null && b<a){ if(!VW.older) VW.older=Date.now(); VW.stale=(Date.now()-VW.older>=60000); }
  else { VW.stale=true; VW.older=0; }
  if(was!==VW.stale) verBar();
}
export function verBar(){
  var b=document.getElementById('verBar');
  if(!VW.stale){ if(b) b.remove(); return; }
  if(!b){ b=document.createElement('div'); b.id='verBar'; b.className='ver-bar'; b.setAttribute('role','status'); b.setAttribute('aria-live','polite'); document.body.insertBefore(b, document.body.firstChild); }
  var newer=(verNum(VW.latest)||0)>(verNum(APP_VER)||0);
  b.innerHTML=tpl`<span><b>${newer? '새 버전('+vwShort(VW.latest)+')이 올라왔습니다' : '운영 버전이 '+vwShort(VW.latest)+'(으)로 바뀌었습니다'}</b> — 이 탭은 ${vwShort(APP_VER)} 입니다. 새로고침한 뒤에 저장할 수 있습니다.</span>`+
    tpl`<button type="button" class="pill" id="verReload">지금 새로고침</button>`;
  /** @type {any} */(b.querySelector('#verReload')).onclick=verReload;
}
export function verReload(){
  var dirty=Array.prototype.some.call(document.querySelectorAll('.ovl.on'), function(o){ return !!o.__dirty; }) || !!document.querySelector('#dvTable tr.editing');
  if(dirty && !confirm('입력하던 내용이 있습니다. 새로고침하면 사라집니다 — 필요하면 먼저 복사해 두세요.\n\n새로고침할까요?')) return;
  try{ location.reload(); }catch(e){}
}
export function verIsWrite(method){ return /^(POST|PATCH|PUT|DELETE)$/i.test(String(method||'')); }
/** sbWrite 맨 앞 — 저장 직전 확인(1분에 한 번 · 2.5초 안) 뒤 옛 탭이면 막음 */
export async function verBeforeWrite(method, path){
  if(!verIsWrite(method) || VW_FREE.test(String(path||'')) || !verOn()) return;
  if(Date.now()-VW.at>60000) await verCheck(2500);
  verWriteGuard(method, path);
}
export function verWriteGuard(method, path){
  if(!VW.stale || !verIsWrite(method) || VW_FREE.test(String(path||''))) return;
  var e=/** @type {any} */(new Error('새 버전('+vwShort(VW.latest)+')이 올라와서 이 탭('+vwShort(APP_VER)+')에서는 저장하지 않았습니다 — 화면 아래 «지금 새로고침» 뒤 다시 저장해 주세요. 적던 내용은 먼저 복사해 두세요.'));
  e.stale=true; throw e;
}
export function verStart(){
  if(VW.started || !verOn()) return; VW.started=true;
  setTimeout(function(){ verCheck(); }, 20000);
  setInterval(function(){ if(!document.hidden) verCheck(); }, 600000);
  var back=function(){ if(!document.hidden && Date.now()-VW.at>120000) verCheck(); };
  document.addEventListener('visibilitychange', back); window.addEventListener('focus', back);
}

/* ── ② 동시 수정 · ③ 저장 확인 ── */
/** 값 비교용 정리 — 빈 칸 = null · 숫자 글자 = 숫자 · 날짜는 앞 10자리 · 목록/객체는 JSON */
export function vNorm(v){
  if(v==null) return null;
  if(typeof v==='boolean') return v;
  if(typeof v==='number') return isFinite(v)? v : null;
  if(typeof v==='object') return JSON.stringify(v);
  var s=String(v).trim(); if(s==='') return null;
  if(/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if(/^\d{4}-\d{2}-\d{2}([T ]|$)/.test(s)) return s.slice(0,10);
  if(s==='true' || s==='false') return s==='true';
  return s;
}
export function vEq(a, b){ return vNorm(a)===vNorm(b); }
export function isNetErr(e){ return !!(e && (/** @type {any} */(e).net || /** @type {any} */(e).name==='AbortError' || /Failed to fetch|NetworkError|Load failed|network/i.test(String(/** @type {any} */(e).message||'')))); }
/** 마지막으로 이 행을 바꾼 기록(change_log) — 없으면 null */
export async function lastChange(table, id){
  try{ var r=await fetch(SB_URL+'/rest/v1/change_log?select=actor,at&target=eq.'+encodeURIComponent(table)+'&target_id=eq.'+encodeURIComponent(String(id))+'&order=id.desc&limit=1', {headers:sbHeaders()});
    if(!r.ok) return null; var a=await r.json(); return (a && a[0]) || null; }catch(e){ return null; }
}
/**
 * 표 행 저장 직전 대조 — body 는 고쳐질 수 있음(남이 바꾼 · 내가 안 바꾼 칸은 빼서 남의 값을 그대로 둠)
 * @returns {Promise<{ok:boolean, kept?:string[], over?:string[], cancel?:boolean, gone?:boolean, skipped?:string}>}
 */
export async function rowGuard(table, r, body, cols){
  var keys=Object.keys(body||{}).filter(function(k){ return /^[a-z_][a-z0-9_]*$/.test(k); });
  if(!keys.length || !r || r.id==null || !table) return {ok:true};
  var res;
  try{ res=await fetch(SB_URL+'/rest/v1/'+table+'?id=eq.'+encodeURIComponent(String(r.id))+'&select='+keys.join(','), {headers:sbHeaders()}); }
  catch(e){ var ne=/** @type {any} */(new Error('서버에 연결하지 못했습니다 — 인터넷 연결을 확인해 주세요')); ne.net=true; throw ne; }
  if(!res.ok) return {ok:true, skipped:'대조 못 함 ('+res.status+')'};   /* 대조를 못 하면 예전처럼 저장(막지 않음) */
  var arr=null; try{ arr=await res.json(); }catch(e){}
  var cur=Array.isArray(arr)? arr[0] : null;
  if(!cur) return {ok:false, gone:true};
  var theirs=keys.filter(function(k){ return !vEq(cur[k], r[k]); });
  if(!theirs.length) return {ok:true};
  var kept=[], clash=[];
  theirs.forEach(function(k){ if(vEq(body[k], r[k])) kept.push(k); else if(!vEq(body[k], cur[k])) clash.push(k); });
  kept.forEach(function(k){ delete body[k]; r[k]=cur[k]; });
  theirs.filter(function(k){ return kept.indexOf(k)<0 && clash.indexOf(k)<0; }).forEach(function(k){ r[k]=cur[k]; });   /* 둘이 같은 값으로 바꾼 칸 */
  if(!clash.length) return {ok:true, kept:kept};
  var who=await lastChange(table, r.id);
  var go=await conflictAsk(r, body, cur, clash, kept, who, cols||[]);
  if(go){ clash.forEach(function(k){ r[k]=cur[k]; }); return {ok:true, kept:kept, over:clash}; }
  return {ok:false, cancel:true, kept:kept};
}
export function conflictVal(v, c){
  if(v==null || v==='') return '(비어 있음)';
  if(c && c.won && typeof v!=='object' && v!=='' && !isNaN(+v)) return won(+v)+'천원';
  if(typeof v==='boolean') return v? '예' : '아니오';
  if(typeof v==='object') return JSON.stringify(v).slice(0,80);
  var s=String(v); return /^\d{4}-\d{2}-\d{2}T/.test(s)? s.slice(0,16).replace('T',' ') : s.slice(0,120);
}
/** 충돌 창 — [내 값으로 저장] true / [취소하고 새로 읽기] · Esc · 바깥 false */
export function conflictAsk(r, body, cur, clash, kept, who, cols){
  return new Promise(function(resolve){
    var ov=document.getElementById('ovlConflict');
    if(!ov){ ov=document.createElement('div'); ov.id='ovlConflict'; ov.className='ovl'; document.body.appendChild(ov); }
    var lab=function(k){ var c=cols.filter(function(x){ return x.k===k; })[0]; return c? String(c.l||k).replace(/\(천원\)/,'') : k; };
    var col=function(k){ return cols.filter(function(x){ return x.k===k; })[0]; };
    var whoTxt=who? (String(who.actor||'').split('@')[0]+' · '+String(who.at||'').slice(0,16).replace('T',' ')) : '기록 없음(포탈 밖에서 바뀌었을 수 있음)';
    ov.innerHTML=tpl`<div class="modal cf-m" role="dialog" aria-modal="true" aria-labelledby="cfH" style="width:min(640px,100%)"><h3 id="cfH">다른 사람이 먼저 고쳤습니다</h3>`+
      tpl`<p class="cap">이 행을 연 뒤에 같은 칸이 바뀌었습니다 — 마지막 변경: ${whoTxt}. 어느 값으로 할지 골라 주세요.</p>`+
      tpl`<div class="tbl-wrap"><table class="rn-tbl cf-tbl"><thead><tr><th>칸</th><th>내가 본 값</th><th>지금 값(다른 사람)</th><th>내가 넣을 값</th></tr></thead><tbody>${rawHtml(clash.map(function(k){ var c=col(k);
        return tpl`<tr><th scope="row">${lab(k)}</th><td class="old">${conflictVal(r[k], c)}</td><td class="now">${conflictVal(cur[k], c)}</td><td class="mine">${conflictVal(body[k], c)}</td></tr>`; }).join(''))}</tbody></table></div>`+
      tpl`${rawHtml(kept.length? tpl`<p class="mini">다른 사람이 바꾼 칸 중 내가 안 바꾼 칸(${kept.map(lab).join(', ')})은 그 사람의 값을 그대로 둡니다.</p>` : '')}`+
      tpl`<div class="mact"><span class="mmsg"></span><button type="button" class="pill ghost" data-close="ovlConflict" id="cfCancel">취소하고 새로 읽기</button><button type="button" class="pill" id="cfMine">내 값으로 저장</button></div></div>`;
    var done=false, fin=function(v){ if(done) return; done=true; closeOvl('ovlConflict'); resolve(v); };
    /** @type {any} */(ov.querySelector('#cfCancel')).onclick=function(){ fin(false); };
    /** @type {any} */(ov.querySelector('#cfMine')).onclick=function(){ fin(true); };
    var mo=new MutationObserver(function(){ if(!ov.classList.contains('on')){ mo.disconnect(); fin(false); } });
    openOvl('ovlConflict'); mo.observe(ov, {attributes:true, attributeFilter:['class']});
    setTimeout(function(){ var b=/** @type {any} */(ov.querySelector('#cfCancel')); if(b) try{ b.focus(); }catch(e){} }, 30);
  });
}
/** 저장 결과 확인 — PATCH(return=representation)가 0행이면 실제로 저장되지 않은 것 */
export function savedRows(res){ return Array.isArray(res)? res.length : (res? 1 : 0); }
export function saveFailMsg(){ return '저장되지 않았습니다 — 이 행을 고칠 권한이 없거나, 그 사이에 행이 지워졌습니다. 새로 읽어 확인해 주세요.'; }
/** 연결 오류 알림 + 다시 시도 */
export function netToast(e, retry){
  var to=/** @type {any} */(e) && /** @type {any} */(e).timeout;
  toast('저장하지 못했습니다', to? '서버 응답이 없습니다 — 저장됐는지 «다시 시도» 전에 새로 읽어 확인해도 됩니다' : '연결이 끊겼습니다 — 입력한 값은 그대로 있습니다', 'bad', retry? {l:'다시 시도', go:retry} : undefined);
}
