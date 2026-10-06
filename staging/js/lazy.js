/* ===== lazy.js — 큰 화면은 처음 열 때 불러오기 (ES 모듈 전환 3단계 · ㊿+153) =====
   · 리포트(report.js) · 관리자·배포·운영·내 계정(admin.js) · 가격표(price.js) — 합치면 포탈 코드의 약 1/3. 첫 화면을 띄울 때는 받지 않고,
     그 메뉴를 처음 열 때 한 번만 받음(이후로는 그대로 · 주소는 index.html importmap 이 ?v=버전 을 붙임)
   · 받는 동안(0.12초가 넘으면) 그 화면에 «화면을 불러오는 중…» · 실패하면 «… 오류가 발생했습니다 — 새로고침» (스테이징 QA 가 둘 다 알아봄)
   · 규칙: 이 셋을 다른 파일이 import 하면 처음부터 같이 내려오므로 안 됨(tests/lint.mjs 가 막음) — 대신 lazyView(화면 열기) · lazyGet(이미 받았으면 그 모듈) */
import { ST } from './state.js';
import { logClientError } from './core.js';

var LOAD={
  report:function(){ return import('./report.js'); },
  admin:function(){ return import('./admin.js'); },
  price:function(){ return import('./price.js'); }
};
var MOD={}, WAIT={}, HOOKS=[], TRY={};
/* 다시 시도 — 브라우저는 한 번 실패한 모듈 주소를 기억해 같은 주소로는 다시 받지 않음 → 주소 끝에 &retry=N (importmap 이 붙인 ?v= 는 그대로) */
function lazyRetry(name){
  var u='./'+name+'.js'; try{ u=import.meta.resolve(u); }catch(e){}
  return import(u+(u.indexOf('?')<0? '?':'&')+'retry='+TRY[name]);
}

/** 이미 받은 모듈(없으면 null) — 동기 코드에서 «열려 있으면 다시 그리기» 같은 데 씀 */
export function lazyGet(name){ return MOD[name]||null; }

/** 모듈을 받을 때마다 부를 함수 (main.js: window 다리 · grid.js: 메뉴 «첫 화면» 사본) — 이미 받은 것에도 바로 부름 */
export function lazyHook(fn){ HOOKS.push(fn); Object.keys(MOD).forEach(function(n){ try{ fn(n, MOD[n]); }catch(e){} }); }

/** 모듈 받기 (한 번만 · 실패하면 다음에 부를 때 다시 시도) */
export function lazyLoad(name){
  if(MOD[name]) return Promise.resolve(MOD[name]);
  if(!LOAD[name]) return Promise.reject(new Error('모르는 지연 모듈: '+name));
  if(!WAIT[name]) WAIT[name]=(TRY[name]? lazyRetry(name) : LOAD[name]()).then(function(ns){
    MOD[name]=ns; delete WAIT[name];
    HOOKS.forEach(function(h){ try{ h(name, ns); }catch(e){} });
    return ns;
  }, function(err){ delete WAIT[name]; TRY[name]=(TRY[name]||0)+1; throw err; });
  return WAIT[name];
}

/** 화면 열기 — 받았으면 바로(예전과 똑같이 동기), 아니면 받은 뒤 그 화면에 아직 있을 때만 그림
 *  name: 모듈 · viewId: 화면 영역 id(#viewReport 등) · fn: 그릴 함수 이름 */
export function lazyView(name, viewId, fn){
  var m=MOD[name]; if(m){ m[fn](); return; }
  var v=ST.CUR_VIEW, host=document.getElementById(viewId);
  var t=setTimeout(function(){ if(!host || MOD[name]) return; host.classList.add('lazy-wait'); lazyNote(host, '화면을 불러오는 중…'); }, 120);
  var done=function(){ clearTimeout(t); if(!host) return; host.classList.remove('lazy-wait'); var old=host.querySelector(':scope > .lazy-msg'); if(old) old.remove(); };   /* 지난번 실패 안내도 지움 */
  lazyLoad(name).then(function(ns){ done(); if(ST.CUR_VIEW===v) ns[fn](); }, function(err){
    done();
    if(host && ST.CUR_VIEW===v){ host.classList.add('lazy-wait'); lazyNote(host, '화면 코드를 받는 중 오류가 발생했습니다 — 새로고침해 주세요 ('+String((err&&err.message)||err).slice(0,120)+')').classList.add('bad'); }
    try{ logClientError('지연 모듈 '+name+': '+String((err&&err.message)||err), '', null, null, err&&err.stack); }catch(e){}
  });
}
function lazyNote(host, text){
  var old=host.querySelector(':scope > .lazy-msg'); if(old) old.remove();
  var d=document.createElement('div'); d.className='lazy-msg'; d.setAttribute('role','status'); d.textContent=text; host.prepend(d); return d;
}
