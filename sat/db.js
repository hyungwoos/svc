/* ===== sat/db.js — 위성 페이지 공통: 포탈 로그인 세션 · Supabase 읽기 · 작은 도우미 (리포트 report · S1 정산 s1 · KK 정산 kk) · ㊿+154 =====
   · 예전엔 세 페이지에 같은 코드가 복사돼 있었음 → 여기 한 곳(고전 스크립트 · 전역 이름). 견적서(quote)는 저장 서버 쪽 코드가 달라 안 씀
   · 세션: 포탈(index.html)이 sessionStorage(로그인 유지면 localStorage) 의 svc_sess 에 둔 토큰을 같이 씀 */
var SB_URL='https://amzbrdhkvzsyxjfjtugu.supabase.co';
var SB_KEY='sb_publishable_s_BGJf84vUQoASbT8F0H4g_L2MBOGZF';
var $=function(s){ return document.querySelector(s); };
function sess(){ try{ var s=JSON.parse(sessionStorage.getItem('svc_sess')||localStorage.getItem('svc_sess')||'null'); if(s&&s.a&&s.p!==false&&Math.floor(Date.now()/1000)<(s.e||0)-60) return s; }catch(e){} return null; }
function goPortalLogin(){ if(window.top!==window.self){ alert('좌측 메뉴의 다른 탭에서 로그인한 뒤 다시 열어주세요.'); return; } location.href='index.html'; }
function hdr(json){ var s=sess(); var h={apikey:SB_KEY, Authorization:'Bearer '+(s?s.a:SB_KEY)}; if(json) h['Content-Type']='application/json'; return h; }
async function sbGet(q){ var r=await fetch(SB_URL+'/rest/v1/'+q,{headers:hdr()}); if(!r.ok) throw new Error('DB 읽기 실패 ('+r.status+')'); return r.json(); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function n(v){ var x=parseFloat(String(v==null?'':v).replace(/[^\d.\-]/g,'')); return isNaN(x)?0:x; }
function todayISO(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
async function aiFetch(payload){
  var r=await fetch(SB_URL+'/functions/v1/ask',{method:'POST',headers:hdr(true),body:JSON.stringify(payload)});
  var j=null; try{ j=await r.json(); }catch(e){}
  if(!r.ok) throw new Error((j&&j.error)||('HTTP '+r.status));
  return j;
}
