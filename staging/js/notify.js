/* ===== notify.js — 알림함 · Slack 보내기(기본 꺼짐) (㊿+174 · SQL 105) =====
   ES 모듈 — 다른 파일의 이름은 아래 import 로만 씀 · 이 파일의 최상위 var/function 은 전부 export · 즉시 실행 문장은 js/init.js 의 start() 에
   · 알림 항목은 포탈이 화면과 같은 계산으로 만듦(홈 «우선 업무» · 데이터 점검 · 만기 처리와 같은 기준) — 서버가 따로 계산하지 않아 숫자가 어긋나지 않음
       재약정 만기  = 홈 «재약정 대응 필요»와 같은 행(expEligible · 자동연장 · 후속 계약 확실 제외) · 종료월 말일까지 남은 날이 기준(60 · 30일) 이하 — 단계마다 한 번 · 열기 = 고객 360
       만기 미처리  = 만기 처리 «미처리»(renewScan.lapsed) 건수
       장비 지연    = 접수 · 출하요청 · 배송중인 신청이 접수 뒤 n일(기본 3) 지남 — 상태가 바뀌면 새 알림
       월말 마감    = 말일까지 n일(기본 5) 이하인데 그달 비즈포탈 차액이 없음
       데이터 점검  = «바로 고쳐야 함»(만기 지남 규칙 제외 — 위 «만기 미처리»와 겹치지 않게)
   · 받는 사람 = 관리자 › 설정 › 알림(notify_settings)의 이메일
       + 재약정은 계약의 CSM 이름이 내 계정(담당자 연결 SQL 103)과 맞으면 나에게도
       + 장비는 «처리 담당»(work_assign · 알림함에서 지정)이 있으면 그 사람에게만 — 신청서의 «고객 담당자»(mgr_name)는 고객 쪽 사람이라 쓰지 않음
   · 읽음 표시는 계정별(notify_reads) · SQL 105 전이면 이 브라우저에만 기억
   · Slack 은 기본 꺼짐 — 슈퍼 관리자가 켜야 «Slack 으로 보내기»가 보이고, 눌러서 미리 보고 확인할 때만 보냄
   · ㊿+177 예약 발송(선택 · 기본 꺼짐 · SQL 108): 설정에서 요일 · 시각(한국 시각)을 고르면 서버(pg_cron → notify 함수)가 그때 팀 채널로 보냄
       보낼 글은 슈퍼 관리자가 포탈을 열 때 이 파일의 같은 계산(ntfSlackPlan)으로 만들어 notify_snapshot 에 둠(ntfSnapSave) — 서버에 계산식을 따로 두지 않음 */
import { APP_VER, IS_STAGING, ST } from './state.js';
import { bizHas, canWrite, lline, mk, monOf, rawHtml, SB_URL, tickMemo, tpl, won } from './core.js';
import { expAmtOf, expEligible } from './dash.js';
import { ico, sbHeaders, sbTry, sbWrite, toast, todayStr } from './shell.js';
import { ctSuccessor, dcRules, openRenewList, renewScan } from './analysis.js';
import { gridGoPre, meMatch, switchView } from './grid.js';
import { closeOvl, logChange, openOvl } from './edit.js';
import { openCust360, renderTodo } from './tools.js';
import { placeSearchBtn } from './home.js';
import { verNum } from './guard.js';

export var NTF_DEF={renew_days:[60,30], eq_days:3, month_end_days:5, renew_emails:[], eq_emails:[], biz_emails:[], dc_emails:[], slack_on:false, team_channel:'C08RA3PPDH8', auto_on:false, auto_days:[1], auto_time:'09:00', auto_dm:false};
export var NTF={memo:null, ops:null, opsOk:null, set:null, sqlOk:null, reads:{}, readsOk:false, asg:{}, asgOk:false, omap:null, users:null, open:false, tab:'me', loading:false, at:0, busy:false, snapOk:null, snapKey:'', snapAt:0, snap:null};
export var NTF_KIND={ops:'운영 상태', renew:'재약정 만기', lapsed:'만기 미처리', eq:'장비 처리 지연', biz:'월말 마감', dc:'데이터 점검'};
export var OPS_TBL={customers:'고객사', contracts:'계약', monthly_revenue:'월 매출', equipment_orders:'장비 신청', equipment_assets:'장비 현황', oi_deals:'OI'};

/** 설정(없으면 기본값) */
export function ntfSet(){ return Object.assign({}, NTF_DEF, NTF.set||{}); }
/** 오늘(현지) — 날짜 비교용 정오 기준 */
export function ntfToday(){ var t=todayStr(); return new Date(+t.slice(0,4), +t.slice(5,7)-1, +t.slice(8,10), 12); }
/** 월 인덱스의 말일까지 남은 날(오늘 기준 · 음수 = 지남) */
export function ntfDaysLeft(idx){
  var ym=mk(idx); if(!ym) return null;
  var last=new Date(+ym.slice(0,4), +ym.slice(5,7), 0, 12);
  return Math.round((last.getTime()-ntfToday().getTime())/864e5);
}
export function ntfDaysSince(dateStr){
  var s=String(dateStr||'').slice(0,10); if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  var d=new Date(+s.slice(0,4), +s.slice(5,7)-1, +s.slice(8,10), 12);
  return Math.round((ntfToday().getTime()-d.getTime())/864e5);
}
export function ntfMe(){ return String(ST.AUTH_USER||'').toLowerCase(); }
export function ntfIsMe(list){ var me=ntfMe(); return !!me && (list||[]).some(function(e){ return String(e||'').toLowerCase()===me; }); }
/** 이메일 → 짧은 이름(앞부분) */
export function ntfWho(e){ return String(e||'').split('@')[0]; }

/** 알림 항목 — 같은 계산 묶음 안에서는 한 번(tickMemo) */
export function ntfItems(){
  if(!ST.DATA || !ST.DATA.rows || ST.IS_EQUIP) return [];
  var S=ntfSet(), rows=ST.DATA.rows, R=ST.RAWX||{};
  /* 같은 데이터 · 설정 · 담당 · 날짜면 지난 결과(데이터 점검 규칙까지 도는 계산이라 종 숫자를 다시 그릴 때마다 하지 않음) — 데이터를 새로 읽으면 ST.DATA · ST.RAWX 가 새 객체 */
  var sig=(R.orders||[]).map(function(o){ return o.id+':'+o.status; }).join(','), deps=[ST.DATA, R, rows.length, sig, NTF.set, NTF.asg, NTF.ops, ST.AUTH_USER, ST.OWNER_NAMES, todayStr()];
  if(NTF.memo && NTF.memo.deps.length===deps.length && NTF.memo.deps.every(function(d, i){ return d===deps[i]; })) return NTF.memo.v;
  var v=tickMemo('ntfItems', deps, function(){
    var out=[], days=(S.renew_days||[60,30]).slice().sort(function(a,b){ return a-b; }), maxD=days[days.length-1];
    /* 1) 재약정 만기 — 홈 «재약정 대응 필요»와 같은 행(원계약 · 부속 · H/W · 해지 · 중지 제외 · 자동연장 · 후속 계약 확실 제외) · 단계(가장 작은 기준 ≥ 남은 날)마다 한 번 */
    rows.forEach(function(r, k){
      if(!expEligible(r) || r.autoRenew || r.endIdx==null) return;
      var left=ntfDaysLeft(r.endIdx); if(left==null || left<0 || left>maxD) return;
      /** @type {any} */ var sc=null; try{ sc=ctSuccessor(r); }catch(e){} if(sc && sc.sure) return;
      var stage=days.filter(function(d){ return left<=d; })[0], amt=0; try{ amt=expAmtOf(k); }catch(e){ amt=r.mrr||0; }
      out.push({kind:'renew', key:'renew:'+r._id+':'+stage, sev:stage<=30? 'hi' : 'mid', order:left,
        title:r.cust+' · '+lline(r.line)+' 만료 D-'+left, detail:mk(r.endIdx)+' 말 종료 · 월 '+won(amt)+'천원'+(r.renew? ' · 연장 '+r.renew+'회' : '')+(sc && !sc.sure? ' · 후속 계약 확인 필요' : ''),
        to:S.renew_emails, who:String(r.csm||'').trim(), me:ntfIsMe(S.renew_emails) || (!!String(r.csm||'').trim() && meMatch(r.csm)), stage:stage, id:r._id,
        go:function(){ openCust360(r.cust); }});
    });
    /* 2) 만기 미처리(이미 종료월이 지남) — 건수 한 줄 */
    try{ var T=(ST.DATA.nowIdx>=0)? ST.DATA.nowIdx : null; var RS=T!=null? renewScan(T) : null;
      if(RS && RS.lapsed.length){ var to2=S.renew_emails.concat(S.dc_emails);
        out.push({kind:'lapsed', key:'lapsed:'+mk(T)+':'+RS.lapsed.length, sev:'hi', order:-1, title:'만기 지났는데 미처리 '+RS.lapsed.length+'건',
          detail:'이미 LIVE 에서 빠짐 — 연장 · 서비스종료 · 해지 중 하나로 정리', to:to2, me:ntfIsMe(to2), go:function(){ openRenewList('lapsed'); }}); } }catch(e){}
    /* 3) 장비 신청 처리 지연 — 상태마다 한 번 */
    (R.orders||[]).forEach(function(o){
      if(['접수','출하요청','배송중'].indexOf(o.status)<0) return;
      var age=ntfDaysSince(o.created_at); if(age==null || age<S.eq_days) return;
      var a=NTF.asg[String(o.id)], asg=a? String(a.assignee||'').toLowerCase() : '';
      out.push({kind:'eq', key:'eq:'+o.id+':'+o.status, sev:age>=S.eq_days*2? 'hi' : 'mid', order:-age,
        title:(o.customer||'(고객사 없음)')+' · '+(o.model||'모델 미정')+' ×'+(o.qty||1)+' · '+o.status+' '+age+'일째', detail:'신청 #'+o.id+' · 처리 담당 '+(asg? ntfWho(asg) : '미지정'),
        to:asg? [asg] : S.eq_emails, me:asg? asg===ntfMe() : ntfIsMe(S.eq_emails), asg:asg, id:o.id,
        go:function(){ var id=o.id; gridGoPre('orders', '신청 #'+id+' '+(o.customer||''), function(x){ return String(x.id)===String(id); }); }});
    });
    /* 4) 월말 마감 — 비즈포탈 차액 */
    try{ var T2=ST.DATA.nowIdx; if(T2!=null && T2>=0){ var curYm=monOf(T2)+'월', done=bizHas(+mk(T2).slice(0,4), monOf(T2)), left2=ntfDaysLeft(T2);
      if(!done && left2!=null && left2>=0 && left2<=S.month_end_days) out.push({kind:'biz', key:'biz:'+mk(T2), sev:left2<=2? 'hi' : 'mid', order:left2, title:curYm+' 비즈포탈 차액 입력 — 마감 D-'+left2,
        detail:'정산 · 목표 달성률이 «미입력»으로 남음', to:S.biz_emails, me:ntfIsMe(S.biz_emails), go:function(){ switchView('biz'); }}); } }catch(e){}
    /* 5) 데이터 점검 «바로 고쳐야 함» (만기 지남 규칙은 2)와 겹쳐 뺌 — 홈과 같은 기준) */
    try{ var crit=dcRules().filter(function(x){ return x.sev==='crit' && x.id!=='c_lapsed' && x.items.length; }), n=crit.reduce(function(a,x){ return a+x.items.length; }, 0);
      if(n) out.push({kind:'dc', key:'dc:'+mk(ST.DATA.nowIdx)+':'+n, sev:'hi', order:0, title:'데이터 바로 고칠 것 '+n+'건', detail:crit.map(function(x){ return x.title+' '+x.items.length; }).slice(0,3).join(' · '),
        to:S.dc_emails, me:ntfIsMe(S.dc_emails), go:function(){ switchView('dcheck'); }}); }catch(e){}
    /* 6) ㊿+175 운영 상태(슈퍼 관리자 · SQL 106 ops_status) — 야간 백업 · 자동 작업 · AI 점검 · 브라우저 오류 · 옛 버전 · 백업 대비 행 수 */
    if(ST.IS_SUPER && NTF.ops) try{ opsItems(NTF.ops).forEach(function(x){ out.push(x); }); }catch(e){}
    var KO={ops:0, lapsed:1, dc:2, biz:3, renew:4, eq:5};
    out.sort(function(a,b){ return (a.sev==='hi'?0:1)-(b.sev==='hi'?0:1) || KO[a.kind]-KO[b.kind] || a.order-b.order; });
    return out;
  });
  NTF.memo={deps:deps, v:v};
  return v;
}
/** 운영 상태 → 알림 항목(슈퍼 관리자만 · Slack 보내기에는 넣지 않음) */
export function opsItems(o){
  var out=[], now=Date.now(), go=function(){ ntfGoOps(); };
  var add=function(key, sev, title, detail){ out.push({kind:'ops', key:'ops:'+key, sev:sev, order:0, title:title, detail:detail, to:[], me:true, ops:true, go:go}); };
  var sn=o.snap||{};
  if(sn.schema===false) add('snap:none', 'mid', '야간 백업 표(snap)가 없습니다', 'SQL 86 과 자동 작업(pg_cron)이 켜져 있는지 확인 — 배포·운영 › 기록 › 시스템 점검');
  else if(sn.schema && !sn.last_day) add('snap:empty', 'hi', '야간 백업이 한 번도 없습니다', '자동 작업 svc-snap-nightly 를 확인하세요');
  else if(sn.last_day){
    var d=String(sn.last_day), at=Date.UTC(+d.slice(0,4), +d.slice(4,6)-1, +d.slice(6,8), 18, 10), h=Math.round((now-at)/36e5);
    if(h>30) add('snap:late:'+d, 'hi', '야간 백업이 '+h+'시간째 없습니다', '마지막 백업 '+d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6,8)+' · 자동 작업(svc-snap-nightly)을 확인하세요');
    var lr=o.live_rows||{}, sr=sn.rows||{};
    Object.keys(OPS_TBL).forEach(function(t){ var a=+sr[t], b=+lr[t]; if(!(a>0) || isNaN(b) || b>=a) return; var drop=a-b;
      if(drop>=Math.max(3, Math.ceil(a*0.02))) add('drop:'+t+':'+d+':'+b, 'mid', OPS_TBL[t]+' 행이 마지막 백업보다 '+drop+'건 적습니다', a.toLocaleString('ko-KR')+' → '+b.toLocaleString('ko-KR')+' — 지운 것이 맞는지 확인(되살리기는 배포·운영 › SQL 에서 백업 표로)'); });
  }
  (Array.isArray(o.cron)? o.cron : []).forEach(function(j){
    if(j.active===false || !j.last_status || /succeeded|running|starting/.test(String(j.last_status))) return;
    add('cron:'+j.name+':'+String(j.last_start||'').slice(0,16), 'hi', '자동 작업 실패 — '+j.name, String(j.last_start||'').slice(0,16).replace('T',' ')+' · '+String(j.last_msg||j.last_status).slice(0,120));
  });
  var ac=(o.aicheck||{}).last_cron;
  if(ac && ac.run_at){ var ah=Math.round((now-new Date(ac.run_at).getTime())/36e5);
    if(ah>36) add('ai:late:'+String(ac.run_at).slice(0,10), 'mid', '야간 AI 점검이 '+ah+'시간째 없습니다', '마지막 '+String(ac.run_at).slice(0,16).replace('T',' ')+' · 자동 작업(aicheck)을 확인하세요');
    else if(ac.total && ac.pass/ac.total<0.7) add('ai:fail:'+String(ac.run_at).slice(0,16), 'mid', '야간 AI 점검 통과 '+ac.pass+'/'+ac.total, 'AI 답이 포탈 숫자와 다릅니다 — 배포·운영 › 기록 › AI 점검'); }
  var er=o.errors;
  if(er && +er.n24>=5){ var bk=+er.n24>=50? 50 : +er.n24>=20? 20 : 5, top=(er.top||[])[0];
    add('err:'+todayStr()+':'+bk, +er.n24>=20? 'hi' : 'mid', '브라우저 오류 '+er.n24+'건(24시간 · '+(er.users24||0)+'명)', top? '가장 많은 것: '+String(top.msg||'').slice(0,90)+' ('+top.cnt+'건)' : '배포·운영 › 기록 › 브라우저 오류'); }
  var me=verNum(APP_VER), old=(o.vers||[]).filter(function(v){ var n=verNum(v.ver); return n!=null && me!=null && n<me; });
  if(old.length){ var users=old.reduce(function(a, v){ return a+(+v.users||0); }, 0);
    add('old:'+todayStr()+':'+old.map(function(v){ return verNum(v.ver); }).join(','), 'mid', '옛 버전 탭으로 쓰는 사람 '+users+'명(24시간)', old.map(function(v){ return '㊿+'+verNum(v.ver)+' '+v.users+'명'; }).join(' · ')+' — 새로고침(Ctrl+Shift+R) 안내'); }
  return out;
}
export function ntfGoOps(){
  switchView('ops');
  var n=0, go=function(){ var t=/** @type {any} */(document.querySelector('#opsTabs [data-t="log"]')); if(!t){ if(++n<40) setTimeout(go, 50); return; } t.click(); };
  setTimeout(go, 0);
}
/** ㊿+175 운영 상태 읽기(슈퍼 관리자 · SQL 106 전이면 null) */
export async function opsLoad(){
  if(!ST.IS_SUPER || !ST.SB_TOKEN) return null;
  try{ var r=await fetch(SB_URL+'/rest/v1/rpc/ops_status', {method:'POST', headers:sbHeaders(true), body:'{}'}); NTF.opsOk=r.ok; if(!r.ok) return (NTF.ops=null); var j=await r.json(); NTF.ops=(j && typeof j==='object')? j : null; }
  catch(e){ NTF.ops=null; }
  return NTF.ops;
}
export function ntfRead(k){ return !!NTF.reads[k]; }
export function ntfUnread(){ return ntfItems().filter(function(x){ return x.me && !ntfRead(x.key); }).length; }

/* ── 읽기 · 저장 ── */
/** 작은 표 한 번 읽기 — 표가 없거나(SQL 105 전 · 404) 권한이 없으면 null (sbTry 는 404 를 빈 목록으로 돌려 «표 없음»을 알 수 없음) */
export async function ntfGet(q){
  try{ var r=await fetch(SB_URL+'/rest/v1/'+q, {headers:sbHeaders()}); if(!r.ok) return null; var j=await r.json(); return Array.isArray(j)? j : null; }catch(e){ return null; }
}
export function ntfLsKey(){ return 'svc_ntf_read_'+String(ST.AUTH_USER||'anon').toLowerCase(); }
export async function ntfLoad(force){
  if(!ST.SB_TOKEN || ST.IS_EQUIP) return;
  if(NTF.loading || (!force && NTF.at && Date.now()-NTF.at<5*60*1000)) return;
  NTF.loading=true;
  try{
    var s=await ntfGet('notify_settings?select=*&id=eq.1');
    if(s===null){ NTF.sqlOk=false; NTF.set=null; } else { NTF.sqlOk=true; NTF.set=(s && s[0])? s[0] : null; }
    var rd=NTF.sqlOk? await ntfGet('notify_reads?select=key,read_at&order=read_at.desc&limit=1000') : null;
    var m={}; if(rd){ NTF.readsOk=true; rd.forEach(function(x){ m[x.key]=x.read_at||1; }); }
    else { NTF.readsOk=false; try{ (JSON.parse(localStorage.getItem(ntfLsKey())||'[]')||[]).forEach(function(k){ m[k]=1; }); }catch(e){} }
    NTF.reads=m;
    var as=NTF.sqlOk? await ntfGet('work_assign?select=kind,ref,assignee,assigned_by,assigned_at&kind=eq.eq&limit=1000') : null;
    var g={}; (as||[]).forEach(function(x){ g[String(x.ref)]=x; }); var hadAsg=Object.keys(NTF.asg).length>0; NTF.asg=g; NTF.asgOk=as!==null;
    if(hadAsg || Object.keys(g).length) try{ renderTodo(); }catch(e){}   /* 홈 «우선 업무»의 장비 담당 = 처리 담당 */
    await opsLoad();
    NTF.at=Date.now();
    ntfSnapSave(false);   /* ㊿+177 예약 발송 «보낼 글» — 켜져 있을 때만 · 슈퍼 관리자만 · 바뀌었거나 6시간 지났을 때만 씀 */
    if(NTF.readsOk && Math.random()<0.05) fetch(SB_URL+'/rest/v1/rpc/notify_reads_trim', {method:'POST', headers:sbHeaders(true), body:'{}'}).catch(function(){});
  }catch(e){} finally{ NTF.loading=false; }
  ntfSync();
}
export function ntfMark(keys, on){
  keys=(keys||[]).filter(Boolean); if(!keys.length) return;
  keys.forEach(function(k){ if(on) NTF.reads[k]=new Date().toISOString(); else delete NTF.reads[k]; });
  ntfSync();
  if(NTF.readsOk && ST.SB_TOKEN && ST.AUTH_USER){
    var em=String(ST.AUTH_USER).toLowerCase();
    var p=on? fetch(SB_URL+'/rest/v1/notify_reads?on_conflict=email,key', {method:'POST', headers:Object.assign(sbHeaders(true), {Prefer:'resolution=merge-duplicates,return=minimal'}), body:JSON.stringify(keys.map(function(k){ return {email:em, key:k}; }))})
      : fetch(SB_URL+'/rest/v1/notify_reads?email=eq.'+encodeURIComponent(em)+'&key=in.('+keys.map(function(k){ return encodeURIComponent('"'+k+'"'); }).join(',')+')', {method:'DELETE', headers:sbHeaders(true)});
    p.catch(function(){});
  } else { try{ localStorage.setItem(ntfLsKey(), JSON.stringify(Object.keys(NTF.reads).slice(-500))); }catch(e){} }
}

/* ── 위쪽 종 단추 ── */
export function ntfBtn(){
  var b=document.getElementById('ntfBtn');
  if(!b){ b=document.createElement('button'); b.type='button'; b.id='ntfBtn'; b.className='pill ghost ntf-btn'; b.hidden=true;
    b.setAttribute('aria-haspopup','dialog'); b.setAttribute('aria-expanded','false');
    b.onclick=function(e){ e.stopPropagation(); if(NTF.open) ntfClose(); else ntfOpen(); };
    var tb=document.querySelector('#app .topbar'); if(tb) tb.appendChild(b); }
  return b;
}
export function ntfSync(){
  var b=ntfBtn(); if(!b) return;
  var show=!!ST.SB_TOKEN && !!ST.DATA && !ST.IS_EQUIP;
  var wasHid=b.hidden; b.hidden=!show; if(!show) return;
  var n=ntfUnread();
  b.innerHTML=tpl`${rawHtml(ico('bell',16))}<span class="sr">알림</span>${rawHtml(n? tpl`<b class="num">${String(n>99? '99+' : n)}</b>` : '')}`;
  b.setAttribute('aria-label', '알림'+(n? ' — 읽지 않은 '+n+'건' : ''));
  b.title='알림 — 재약정 만기 · 장비 처리 지연 · 월말 마감 · 데이터 점검';
  if(wasHid!==b.hidden) try{ placeSearchBtn(); }catch(e){}
  if(NTF.open) ntfRender();
}

/* ── 알림함 ── */
export function ntfOpen(){
  var p=document.getElementById('ntfPanel');
  if(!p){ p=document.createElement('div'); p.id='ntfPanel'; p.className='ntf-panel'; p.setAttribute('role','dialog'); p.setAttribute('aria-label','알림함'); document.body.appendChild(p);
    /* Esc — 알림함 안에서 다시 그려 초점이 잠깐 빠져도 닫히게 문서에서 받음(위에 창이 떠 있으면 그 창이 먼저) */
    document.addEventListener('keydown', function(e){ if(e.key!=='Escape' || !NTF.open || document.querySelector('.ovl.on')) return; e.stopPropagation(); e.preventDefault(); ntfClose(true); }, true);
    /* 바깥을 누르면 닫음 — 알림함 안의 단추는 누르면 다시 그려져 떨어져 나가므로 이벤트 경로(composedPath)로 판단 */
    document.addEventListener('click', function(e){ if(!NTF.open) return; var path=e.composedPath? e.composedPath() : [], pn=document.getElementById('ntfPanel'), bn=document.getElementById('ntfBtn');
      if(path.indexOf(pn)>=0 || path.indexOf(bn)>=0 || path.some(function(n){ return n && n.classList && n.classList.contains('ovl'); })) return; ntfClose(); }); }
  NTF.open=true; p.hidden=false; var b=ntfBtn(); if(b) b.setAttribute('aria-expanded','true');
  if(!NTF.tab || (NTF.tab==='me' && !ntfItems().some(function(x){ return x.me; }))) NTF.tab=ntfItems().some(function(x){ return x.me; })? 'me' : 'team';
  ntfRender(); ntfPlace();
  setTimeout(function(){ var f=/** @type {any} */(p.querySelector('[data-tab][aria-pressed="true"]') || p.querySelector('button')); if(f) try{ f.focus({preventScroll:true}); }catch(e){} }, 0);
  ntfLoad();
}
export function ntfClose(focusBtn){
  var p=document.getElementById('ntfPanel'); NTF.open=false; if(p) p.hidden=true;
  var b=ntfBtn(); if(b){ b.setAttribute('aria-expanded','false'); if(focusBtn) try{ b.focus({preventScroll:true}); }catch(e){} }
}
export function ntfPlace(){
  var p=document.getElementById('ntfPanel'), b=ntfBtn(); if(!p || !b) return;
  if(window.innerWidth<=760){ p.style.left=''; p.style.top=''; p.classList.add('sheet'); return; }
  p.classList.remove('sheet'); var r=b.getBoundingClientRect(), w=Math.min(460, window.innerWidth-24);
  p.style.top=Math.round(r.bottom+8)+'px'; p.style.left=Math.round(Math.max(12, Math.min(window.innerWidth-w-12, r.right-w)))+'px'; p.style.width=w+'px';
}
export function ntfRender(){
  var p=document.getElementById('ntfPanel'); if(!p) return;
  /* 다시 그린 뒤 초점을 같은 단추로(읽음 · 탭) — 없어졌거나 꺼졌으면 첫 탭 */
  var fa=/** @type {any} */(document.activeElement), fk=(fa && p.contains(fa))? (fa.id? '#'+fa.id : fa.dataset.rd!=null? '[data-rd="'+fa.dataset.rd+'"]' : fa.dataset.tab? '[data-tab="'+fa.dataset.tab+'"]' : '') : '';
  var all=ntfItems(), mine=all.filter(function(x){ return x.me; }), list=NTF.tab==='me'? mine : all, S=ntfSet();
  var unM=mine.filter(function(x){ return !ntfRead(x.key); }).length, unA=all.filter(function(x){ return !ntfRead(x.key); }).length;
  var h=tpl`<div class="ntf-h"><h2>알림</h2><div class="seg" role="group" aria-label="알림 범위">`+
    tpl`<button type="button" data-tab="me" aria-pressed="${NTF.tab==='me'?'true':'false'}" title="${'나에게 '+mine.length+'건 · 안 읽음 '+unM+'건'}">나에게 ${String(mine.length)}</button>`+
    tpl`<button type="button" data-tab="team" aria-pressed="${NTF.tab==='team'?'true':'false'}" title="${'팀 전체 '+all.length+'건 · 안 읽음 '+unA+'건'}">팀 전체 ${String(all.length)}</button></div>`+
    tpl`<button type="button" class="cbtn" id="ntfAllRead"${list.some(function(x){ return !ntfRead(x.key); })? '' : ' disabled'}>모두 읽음</button>`+
    tpl`<button type="button" class="cbtn ntf-x" id="ntfX" aria-label="알림함 닫기">✕</button></div>`;
  if(NTF.tab==='me' && !mine.length) h+=tpl`<div class="ntf-empty">${S.renew_emails.length||S.eq_emails.length||S.biz_emails.length||S.dc_emails.length || (ST.OWNER_NAMES||[]).length? '나에게 온 알림이 없습니다 ✓' : '아직 알림 받는 사람이 정해지지 않았습니다 — «팀 전체»에서 모든 알림을 볼 수 있습니다'}${rawHtml(ST.IS_SUPER? ' <a href="#" id="ntfSetGo">받는 사람 정하기</a>' : '')}</div>`;
  else if(!list.length) h+='<div class="ntf-empty">지금 알림이 없습니다 ✓</div>';
  else {
    var last='';
    h+='<div class="ntf-list">';
    list.forEach(function(x, i){
      if(x.kind!==last){ h+=(last? '</ul>' : '')+tpl`<h3 class="ntf-g">${NTF_KIND[x.kind]||x.kind}</h3><ul class="ntf-ul">`; last=x.kind; }
      var rd=ntfRead(x.key);
      h+=tpl`<li class="ntf-it ${x.sev}${rd?' read':''}" data-i="${String(i)}"><i class="dot" aria-hidden="true"></i><div class="tx"><b>${x.title}</b><span>${x.detail}</span></div>`+
        tpl`<div class="ac"><button type="button" class="cbtn pri" data-go="${String(i)}">열기</button>`+
        tpl`${rawHtml(x.kind==='eq' && ntfCanAssign()? tpl`<button type="button" class="cbtn" data-asg="${String(i)}">${x.asg? '담당 바꾸기' : '담당 지정'}</button>` : '')}`+
        tpl`<button type="button" class="cbtn ntf-rd" data-rd="${String(i)}" aria-pressed="${rd?'true':'false'}" title="${rd? '읽음 — 누르면 읽지 않음으로' : '읽음으로 표시'}">읽음</button></div></li>`;
    });
    h+='</ul></div>';
  }
  var basis='기준: 재약정 만료 '+S.renew_days.join(' · ')+'일 전 · 장비 '+S.eq_days+'일 · 월말 '+S.month_end_days+'일 전';
  h+=tpl`<div class="ntf-f"><span>${basis}${NTF.sqlOk===false? ' · SQL 105 전(기본값 · 읽음은 이 브라우저에만)' : ''}</span>`+
    tpl`${rawHtml(ST.IS_SUPER && S.slack_on? '<button type="button" class="cbtn" id="ntfSlack">Slack 으로 보내기…</button>' : '')}${rawHtml(ST.IS_SUPER? '<button type="button" class="cbtn" id="ntfSet">설정</button>' : '')}</div>`;
  p.innerHTML=h;
  p.querySelectorAll('[data-tab]').forEach(function(b){ /** @type {any} */(b).onclick=function(){ NTF.tab=/** @type {any} */(b).dataset.tab; ntfRender(); var f=/** @type {any} */(p.querySelector('[data-tab="'+NTF.tab+'"]')); if(f) f.focus(); }; });
  var ar=/** @type {any} */(p.querySelector('#ntfAllRead')); if(ar) ar.onclick=function(){ ntfMark(list.map(function(x){ return x.key; }), true); };
  var xb=/** @type {any} */(p.querySelector('#ntfX')); if(xb) xb.onclick=function(){ ntfClose(true); };
  p.querySelectorAll('[data-go]').forEach(function(b){ /** @type {any} */(b).onclick=function(){ var x=list[+/** @type {any} */(b).dataset.go]; if(!x) return; ntfMark([x.key], true); ntfClose(); try{ x.go(); }catch(e){} }; });
  p.querySelectorAll('[data-rd]').forEach(function(b){ /** @type {any} */(b).onclick=function(){ var x=list[+/** @type {any} */(b).dataset.rd]; if(x) ntfMark([x.key], !ntfRead(x.key)); }; });
  p.querySelectorAll('[data-asg]').forEach(function(b){ /** @type {any} */(b).onclick=function(){ var x=list[+/** @type {any} */(b).dataset.asg]; if(x){ ntfClose(); ntfAssignOpen(x); } }; });
  var sb=/** @type {any} */(p.querySelector('#ntfSlack')); if(sb) sb.onclick=function(){ ntfClose(); ntfSlackOpen(); };
  var st=/** @type {any} */(p.querySelector('#ntfSet')), sg=/** @type {any} */(p.querySelector('#ntfSetGo'));
  var goSet=function(e){ if(e) e.preventDefault(); ntfClose(); ntfGoSettings(); }; if(st) st.onclick=goSet; if(sg) sg.onclick=goSet;
  if(fk){ var f2=/** @type {any} */(p.querySelector(fk)); if(!f2 || f2.disabled) f2=p.querySelector('[data-tab][aria-pressed="true"]'); if(f2) try{ f2.focus({preventScroll:true}); }catch(e){} }
}

/* ── 처리 담당 지정(장비 신청) — work_assign 표(SQL 105)에만 씀 · 신청서(equipment_orders) 는 건드리지 않음 ──
   · 신청서의 «고객 담당자»(mgr_name)는 고객 쪽 사람이라 그대로 둠 · 지정하면 그 계정의 «나에게»로 감 · 해제하면 다시 «장비 지연 받는 사람»에게 */
export function ntfAsgView(){ return canWrite('orders')? 'orders' : 'eqboard'; }
export function ntfCanAssign(){ return !!ST.SB_TOKEN && NTF.asgOk && (ST.IS_SUPER || ((ST.MY_ROLE==='admin' || ST.MY_ROLE==='editor') && (canWrite('orders') || canWrite('eqboard')))); }   /* DB(work_assign_can)와 같은 기준 */
export function ntfCands(){
  var S=ntfSet(), u={}, add=function(e){ e=String(e||'').trim().toLowerCase(); if(/^[^@\s]+@[^@\s]+$/.test(e)) u[e]=1; };
  add(ntfMe()); [S.eq_emails, S.renew_emails, S.biz_emails, S.dc_emails].forEach(function(a){ (a||[]).forEach(add); });
  Object.keys(NTF.asg).forEach(function(k){ add(NTF.asg[k].assignee); });
  (NTF.users||[]).forEach(function(x){ add(x.email); }); (NTF.omap||[]).forEach(function(x){ add(x.email); });
  return Object.keys(u).sort();
}
export function ntfDlg(id, w){
  var ov=document.getElementById(id);
  if(!ov){ ov=document.createElement('div'); ov.id=id; ov.className='ovl'; document.body.appendChild(ov); }
  ov.innerHTML=tpl`<div class="modal ntf-m" role="dialog" aria-modal="true" aria-labelledby="${id}H" style="width:min(${String(w)}px,100%)"></div>`;
  return /** @type {any} */(ov.firstElementChild);
}
export function ntfAssignOpen(x){
  var o=(ST.RAWX.orders||[]).filter(function(r){ return String(r.id)===String(x.id); })[0]; if(!o) return;
  if(!ntfCanAssign()){ toast('지정할 수 없습니다', NTF.asgOk? '임대 장비 신청 «쓰기» 권한이 필요합니다' : 'SQL 105(work_assign 표)를 먼저 실행해 주세요', 'info'); return; }
  var cur=x.asg||'', cands=ntfCands(), me=ntfMe();
  var m=ntfDlg('ovlNtfAsg', 480);
  m.innerHTML=tpl`<h3 id="ovlNtfAsgH">처리 담당 지정 — 신청 #${String(o.id)}</h3>`+
    tpl`<p class="cap">${o.customer||'(고객사 없음)'} · ${o.model||'모델 미정'} ×${String(o.qty||1)} · ${o.status||''} — 신청서의 «고객 담당자»(${o.mgr_name||'없음'})는 그대로 두고, 우리 쪽에서 처리할 사람만 정합니다. 그 사람의 알림함 «나에게»로 갑니다.</p>`+
    tpl`<div class="frm"><div class="full"><label for="naEm">처리 담당 계정(이메일)</label><input id="naEm" type="email" list="naList" autocomplete="off" value="${cur || ''}" placeholder="name@genians.com"><datalist id="naList">${rawHtml(cands.map(function(e){ return tpl`<option value="${e}">${e===me? '나' : ''}</option>`; }).join(''))}</datalist></div></div>`+
    tpl`<div class="mact"><span class="mmsg" id="naMsg" role="status"></span>`+
    tpl`${rawHtml(cur? '<button type="button" class="pill ghost" id="naClear">담당 해제…</button>' : '')}${rawHtml(cur!==me? '<button type="button" class="pill ghost" id="naMe">나로 지정</button>' : '')}`+
    tpl`<button type="button" class="pill ghost" data-close="ovlNtfAsg">닫기</button><button type="button" class="pill" id="naSave">저장…</button></div>`;
  var msg=m.querySelector('#naMsg'), inp=m.querySelector('#naEm');
  var save=async function(em){
    em=String(em||'').trim().toLowerCase();
    if(em && !/^[^@\s]+@[^@\s]+$/.test(em)){ msg.textContent='이메일 형식이 아닙니다'; msg.className='mmsg bad'; return; }
    if(em===cur){ msg.textContent='바뀐 것이 없습니다'; msg.className='mmsg'; return; }
    if(!confirm('신청 #'+o.id+' '+(o.customer||'')+' — 처리 담당\n전: '+(cur||'(없음)')+'\n후: '+(em||'(없음 — 장비 지연 받는 사람에게)')+'\n\n저장할까요? (변경 이력에 남습니다)')) return;
    try{
      if(em) await sbWrite('POST', 'work_assign?on_conflict=kind,ref', [{kind:'eq', ref:String(o.id), assignee:em}], 'resolution=merge-duplicates,return=minimal', ntfAsgView());
      else await sbWrite('DELETE', 'work_assign?kind=eq.eq&ref=eq.'+encodeURIComponent(String(o.id)), undefined, undefined, ntfAsgView());
      var g=Object.assign({}, NTF.asg); if(em) g[String(o.id)]={kind:'eq', ref:String(o.id), assignee:em, assigned_by:me, assigned_at:new Date().toISOString()}; else delete g[String(o.id)]; NTF.asg=g;
      logChange(em? 'update' : 'delete', 'work_assign', o.id, {kind:'eq', assignee:{from:cur||null, to:em||null}, customer:o.customer||null, _via:'알림함 처리 담당'});
      closeOvl('ovlNtfAsg'); toast(em? '처리 담당을 정했습니다' : '처리 담당을 해제했습니다', '신청 #'+o.id+(em? ' → '+ntfWho(em) : '')); ntfSync(); try{ renderTodo(); }catch(e){}
    }catch(e){ msg.textContent='저장하지 못했습니다 — '+String(/** @type {any} */(e).message||e).slice(0,140); msg.className='mmsg bad'; }
  };
  m.querySelector('#naSave').onclick=function(){ var v=String(inp.value||'').trim(); if(!v){ msg.textContent='이메일을 넣거나 «담당 해제»를 누르세요'; msg.className='mmsg bad'; return; } save(v); };
  var c=m.querySelector('#naClear'); if(c) c.onclick=function(){ save(''); };
  var mb=m.querySelector('#naMe'); if(mb) mb.onclick=function(){ inp.value=me; save(me); };
  openOvl('ovlNtfAsg'); setTimeout(function(){ try{ inp.focus(); }catch(e){} }, 30);
}

/* ── 관리자 › 설정 › 알림 · Slack (슈퍼 관리자) ── */
export function ntfGoSettings(){
  if(!ST.IS_SUPER) return;
  switchView('adminx');
  var n=0, go=function(){   /* 관리자 화면 코드는 처음 열 때 받음(lazy) — 탭이 생길 때까지 잠깐 기다림 */
    var t=/** @type {any} */(document.querySelector('#admTabs [data-t="cfg"]')), f=/** @type {any} */(document.querySelector('#ntfAdmin input'));
    if(!t || !f){ if(++n<40) setTimeout(go, 50); return; }
    t.click(); var h=document.getElementById('ntfAdmin'), hd=/** @type {any} */(h && h.previousElementSibling) || h;
    try{ var tb=document.querySelector('#app .topbar'), off=(tb? tb.getBoundingClientRect().bottom : 0)+16; window.scrollTo({top:Math.max(0, hd.getBoundingClientRect().top+window.scrollY-off)}); f.focus({preventScroll:true}); }catch(e){} };
  setTimeout(go, 0);
}
export async function ntfUsers(){
  if(!ST.IS_SUPER) return [];
  if(NTF.users) return NTF.users;
  try{ var r=await fetch(SB_URL+'/rest/v1/rpc/admin_list_users', {method:'POST', headers:sbHeaders(true), body:'{}'}); NTF.users=r.ok? (await r.json())||[] : []; }catch(e){ NTF.users=[]; }
  return NTF.users;
}
export async function ntfOwnerMap(){
  if(!ST.IS_SUPER) return [];
  if(NTF.omap) return NTF.omap;
  var rows=await sbTry('user_owner_map?select=email,owner_names'); NTF.omap=rows||[];
  return NTF.omap;
}
export var NTF_FIELDS=[
  ['renew_days','nsDays','재약정 만료 며칠 전','쉼표로 · 단계마다 한 번(예: 60, 30) — 계약 CSM 이 담당자 연결된 계정이면 그 사람에게도'],
  ['eq_days','nsEq','장비 처리 지연(일)','접수 뒤 이 날수가 지나도 접수 · 출하요청 · 배송중'],
  ['month_end_days','nsMe','월말 마감 며칠 전','그달 비즈포탈 차액이 없을 때'],
  ['renew_emails','nsRenew','재약정 · 만기 미처리 받는 사람','계정 이메일 · 쉼표로'],
  ['eq_emails','nsEqE','장비 지연 받는 사람','처리 담당이 지정된 신청은 그 사람에게만'],
  ['biz_emails','nsBiz','월말 마감 받는 사람','계정 이메일 · 쉼표로'],
  ['dc_emails','nsDc','데이터 점검 받는 사람','«바로 고쳐야 함»만'],
  ['team_channel','nsCh','Slack 팀 채널 ID','예: C08RA3PPDH8 · 봇을 그 채널에 초대(/invite)해야 보내짐']];
export function ntfFormVal(k, S){ var v=/** @type {any} */(S)[k]; return Array.isArray(v)? v.join(', ') : String(v==null? '' : v); }
export async function ntfAdminRender(){
  var host=document.getElementById('ntfAdmin'); if(!host || !ST.IS_SUPER) return;
  if(NTF.sqlOk==null) await ntfLoad(true);
  var S=ntfSet(), users=await ntfUsers();
  host.innerHTML=tpl`${rawHtml(NTF.sqlOk===false? '<p class="cap warn">SQL 105(notify_settings · notify_reads · notify_log · work_assign)를 먼저 실행해야 저장됩니다 — 지금은 기본값으로 알림함만 동작합니다.</p>' : '')}`+
    tpl`<div class="frm ntf-frm" data-nodirty>${rawHtml(NTF_FIELDS.map(function(f){ return tpl`<div${rawHtml(/emails/.test(f[0])? ' class="full"' : '')}><label for="${f[1]}">${f[2]}</label><input id="${f[1]}" value="${ntfFormVal(f[0], S)}" autocomplete="off"${rawHtml(/emails/.test(f[0])? ' list="nsUsers"' : '')}><small class="mini">${f[3]}</small></div>`; }).join(''))}`+
    tpl`<datalist id="nsUsers">${rawHtml((users||[]).map(function(u){ return tpl`<option value="${String(u.email||'')}">`; }).join(''))}</datalist>`+
    tpl`<div class="full ntf-sw"><label><input type="checkbox" id="nsSlack"${rawHtml(S.slack_on? ' checked' : '')}> <b>Slack 사용</b></label> <span class="mini">— 기본 꺼짐. 알림함의 «Slack 으로 보내기»를 눌러 미리 보고 확인할 때 보냅니다. 아래 «예약 발송»을 켜지 않으면 자동으로 보내지 않습니다.</span></div>`+
    ntfAutoHtml(S)+`</div>`+
    tpl`<div class="dbar" style="margin-top:8px;flex-wrap:wrap;gap:8px;align-items:center"><button type="button" class="pill" id="nsSave"${rawHtml(NTF.sqlOk===false? ' disabled' : '')}>저장…</button>`+
    tpl`${rawHtml(S.slack_on? '<button type="button" class="pill ghost" id="nsSlackGo">Slack 으로 보내기…</button>' : '')}<button type="button" class="pill ghost" id="nsLog">최근 발송 기록</button><span class="mini" id="nsMsg" role="status"></span></div><div id="nsLogBox"></div>`;
  var v=function(id){ return String((/** @type {any} */(host.querySelector('#'+id))||{}).value||''); };
  var emails=function(s){ var u={}; s.split(/[,\s;]+/).forEach(function(x){ x=x.trim().toLowerCase(); if(/^[^@\s]+@[^@\s]+$/.test(x)) u[x]=1; }); return Object.keys(u).sort(); };
  var msg=/** @type {any} */(host.querySelector('#nsMsg'));
  /** @type {any} */(host.querySelector('#nsSave')).onclick=async function(){
    var dRaw=v('nsDays').split(/[,\s]+/).filter(Boolean), days=dRaw.map(Number).filter(function(d){ return d>0 && d<366 && Math.round(d)===d; });
    if(!days.length || days.length!==dRaw.length || days.length>4){ msg.textContent='재약정 기준은 1~365 사이 숫자 1~4개(쉼표로)'; return; }
    days=days.filter(function(d, i){ return days.indexOf(d)===i; }).sort(function(a,b){ return b-a; });
    var eq=+v('nsEq'), me=+v('nsMe');
    if(!(eq>=1 && eq<=60 && Math.round(eq)===eq)){ msg.textContent='장비 처리 지연은 1~60일'; return; }
    if(!(me>=1 && me<=15 && Math.round(me)===me)){ msg.textContent='월말 마감은 1~15일 전'; return; }
    var body={renew_days:days, eq_days:eq, month_end_days:me, renew_emails:emails(v('nsRenew')), eq_emails:emails(v('nsEqE')), biz_emails:emails(v('nsBiz')), dc_emails:emails(v('nsDc')),
      slack_on:!!(/** @type {any} */(host.querySelector('#nsSlack'))||{}).checked, team_channel:v('nsCh').trim()};
    if(ntfAutoOk()){   /* ㊿+177 예약 발송(SQL 108) */
      var ck=function(id){ return !!(/** @type {any} */(host.querySelector('#'+id))||{}).checked; };
      var ad=[1,2,3,4,5,6,7].filter(function(d){ return ck('nsD'+d); });
      Object.assign(body, {auto_on:ck('nsAuto'), auto_days:ad.length? ad : [1], auto_time:v('nsTime')||'09:00', auto_dm:ck('nsAutoDm')});
      if(body.auto_on && !ad.length){ msg.textContent='예약 발송 요일을 하나 이상 고르세요'; return; }
      if(body.auto_on && !body.slack_on){ msg.textContent='예약 발송은 «Slack 사용»을 켜야 켤 수 있습니다'; return; }
      if(!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(body.auto_time)){ msg.textContent='예약 시각 형식이 아닙니다'; return; }
    }
    if(!/^[CG][A-Z0-9]{6,20}$/.test(body.team_channel)){ msg.textContent='팀 채널 ID 형식이 아닙니다(C 로 시작하는 영문 대문자 · 숫자)'; return; }
    var bad=['renew_emails','eq_emails','biz_emails','dc_emails'].filter(function(k){ return /** @type {any} */(body)[k].length>20; }); if(bad.length){ msg.textContent='받는 사람은 칸마다 20명까지'; return; }
    var S0=ntfSet(), ch=[];
    Object.keys(body).forEach(function(k){ var a0=/** @type {any} */(S0)[k], b0=/** @type {any} */(body)[k]; var a=JSON.stringify(Array.isArray(a0)? a0.slice().sort() : a0), b=JSON.stringify(Array.isArray(b0)? b0.slice().sort() : b0); if(a!==b) ch.push(k+': '+ntfFormVal(k, S0)+' → '+ntfFormVal(k, body)); });
    if(!ch.length){ msg.textContent='바뀐 것이 없습니다'; return; }
    if(body.slack_on && !S0.slack_on && !confirm('Slack 사용을 켭니다.\n예약 발송을 켜지 않으면 자동으로 보내지 않고, 알림함 «Slack 으로 보내기»를 눌러 미리 보고 확인할 때만 보냅니다.\n계속할까요?')) return;
    var b2=/** @type {any} */(body);
    if(b2.auto_on && (!S0.auto_on || ntfAutoWhen(b2)!==ntfAutoWhen(S0) || b2.auto_dm!==S0.auto_dm) && !confirm('예약 발송을 '+(S0.auto_on? '바꿉니다' : '켭니다')+' — '+ntfAutoWhen(b2)+'(한국 시각) 팀 채널 '+body.team_channel+(b2.auto_dm? ' + 받는 사람 개인 DM' : '')+'\n\n그 시각에 서버가 확인 없이 자동으로 보냅니다.\n보내는 내용 = 슈퍼 관리자가 포탈을 열 때 계산해 둔 알림함(72시간이 넘은 것이면 보내지 않고 기록만).\n\n계속할까요?')) return;
    if(!confirm('알림 설정을 바꿉니다\n\n'+ch.join('\n')+'\n\n저장할까요? (변경 이력에 남습니다)')) return;
    try{ await sbWrite('PATCH','notify_settings?id=eq.1', body, undefined, 'adminx'); logChange('update','notify_settings',1,{changes:ch});
      NTF.set=Object.assign({}, NTF.set||{}, body); ntfSync(); if(/** @type {any} */(body).auto_on) await ntfSnapSave(true); await ntfAdminRender(); var m2=document.getElementById('nsMsg'); if(m2) m2.textContent='저장했습니다 ✓'; toast('알림 설정을 저장했습니다', ch.length+'가지 바뀜'); }
    catch(e){ msg.textContent='저장하지 못했습니다 — '+String(/** @type {any} */(e).message||e).slice(0,140); }
  };
  var sg=/** @type {any} */(host.querySelector('#nsSlackGo')); if(sg) sg.onclick=function(){ ntfSlackOpen(); };
  ntfAutoBind(host);
  /** @type {any} */(host.querySelector('#nsLog')).onclick=async function(){
    var box=/** @type {any} */(host.querySelector('#nsLogBox')); box.innerHTML='<p class="cap">읽는 중…</p>';
    var rows=await ntfGet('notify_log?select=at,sent_by,target,n_items,ok,error,dry&order=at.desc&limit=20');
    box.innerHTML=rows===null? '<p class="cap">notify_log 표(SQL 105)가 없거나 읽을 수 없습니다</p>' : !rows.length? '<p class="cap">아직 보낸 기록이 없습니다</p>' :
      tpl`<div class="tbl-wrap" tabindex="0" style="max-height:36vh;margin-top:8px"><table class="dgrid"><thead><tr><th>일시</th><th>보낸 사람</th><th>대상</th><th class="n">항목</th><th>결과</th></tr></thead><tbody>${rawHtml(rows.map(function(r){ return tpl`<tr><td class="num">${String(r.at||'').slice(0,16).replace('T',' ')}</td><td>${r.sent_by||''}</td><td>${r.target||''}</td><td class="n">${String(r.n_items==null? '' : r.n_items)}</td><td>${r.ok? '✓' : '✗ '+(r.error||'')}${r.dry? ' (시험)' : ''}</td></tr>`; }).join(''))}</tbody></table></div>`;
  };
}

/* ── ㊿+177 예약 발송(선택 · 기본 꺼짐 · SQL 108) ── */
export var NTF_DOW=['', '월', '화', '수', '목', '금', '토', '일'];
/** SQL 108 이 돌았는지 — 설정 행에 auto_on 칸이 있으면 */
export function ntfAutoOk(){ return !!NTF.set && Object.prototype.hasOwnProperty.call(NTF.set, 'auto_on'); }
/** «매주 월 · 목 09:00» */
export function ntfAutoWhen(S){ var d=(S.auto_days||[]).slice().sort(), all=d.length===7, wk=d.join()==='1,2,3,4,5'; return (all? '매일' : wk? '평일 매일' : '매주 '+d.map(function(x){ return NTF_DOW[x]; }).join(' · '))+' '+(S.auto_time||'09:00'); }
/** 다음 예약 시각(한국 시각 · 화면 표시용) — 서버는 notify_auto_tick() 이 같은 규칙으로 판단 */
export function ntfAutoNext(S, now){
  if(!S.auto_on || !(S.auto_days||[]).length) return null;
  var t=String(S.auto_time||'09:00'), hh=+t.slice(0,2), mm=+t.slice(3,5), k=new Date((now||Date.now())+9*36e5);   /* UTC 필드 = 한국 시각 */
  for(var i=0;i<8;i++){ var c=new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()+i, hh, mm)), dow=c.getUTCDay()||7;
    if(S.auto_days.indexOf(dow)>=0 && c.getTime()>k.getTime()) return {k:c, label:(c.getUTCMonth()+1)+'/'+c.getUTCDate()+'('+NTF_DOW[dow]+') '+t}; }
  return null;
}
export function ntfAutoHtml(S){
  if(!ntfAutoOk()) return tpl`<div class="full ntf-sw"><span class="mini">예약 발송(요일 · 시각을 정해 자동으로 보내기)은 SQL 108 을 실행하면 여기서 켤 수 있습니다.</span></div>`;
  var times=[]; for(var h=6;h<=21;h++) ['00','30'].forEach(function(m){ times.push(('0'+h).slice(-2)+':'+m); });
  if(times.indexOf(S.auto_time)<0) times.push(S.auto_time);
  return tpl`<fieldset class="full ntf-auto" id="nsAutoBox"><legend class="ntf-sw"><label><input type="checkbox" id="nsAuto"${rawHtml(S.auto_on? ' checked' : '')}> <b>예약 발송</b></label> <span class="mini">— 기본 꺼짐. 켜면 고른 요일 · 시각(한국 시각)에 서버가 팀 채널로 자동으로 보냅니다.</span></legend>`+
    tpl`<div class="ntf-auto-row"><div class="ntf-days" role="group" aria-label="보낼 요일">${rawHtml([1,2,3,4,5,6,7].map(function(d){ return tpl`<label class="ntf-day"><input type="checkbox" id="nsD${String(d)}"${rawHtml((S.auto_days||[]).indexOf(d)>=0? ' checked' : '')}><span>${NTF_DOW[d]}</span></label>`; }).join(''))}</div>`+
    tpl`<label class="ntf-time" for="nsTime">시각</label><select id="nsTime">${rawHtml(times.map(function(x){ return tpl`<option${rawHtml(x===S.auto_time? ' selected' : '')}>${x}</option>`; }).join(''))}</select>`+
    tpl`<label class="ntf-adm"><input type="checkbox" id="nsAutoDm"${rawHtml(S.auto_dm? ' checked' : '')}> 받는 사람에게 개인 DM 도</label></div>`+
    tpl`<p class="mini" id="nsAutoInfo">${ntfAutoInfo(S)}</p></fieldset>`;
}
/** '2026-10-09T09:20:00Z' → «10/09 18:20»(한국 시각) */
export function ntfKst(at){ var t=Date.parse(String(at||'')); if(isNaN(t)) return ''; var k=new Date(t+9*36e5), p=function(n){ return ('0'+n).slice(-2); }; return p(k.getUTCMonth()+1)+'/'+p(k.getUTCDate())+' '+p(k.getUTCHours())+':'+p(k.getUTCMinutes()); }
/** 예약 칸 아래 안내 — 저장된 설정 기준 */
export function ntfAutoInfo(S){
  var nx=ntfAutoNext(S), sn=NTF.snap;
  return (S.auto_on? (nx? '다음 발송: '+nx.label+' · ' : '')+ntfAutoWhen(S) : '꺼져 있음 — 켜고 «저장…»')+' · 보내는 내용 = 슈퍼 관리자가 포탈을 열 때 계산해 둔 알림함'+
    (sn? '(마지막 계산 '+ntfKst(sn.at)+' · '+String(sn.n)+'건)' : '')+' · 72시간이 넘은 것이면 보내지 않고 기록만 · 결과는 «최근 발송 기록»(보낸 사람 «예약»)';
}
export function ntfAutoBind(host){
  var sl=/** @type {any} */(host.querySelector('#nsSlack')), box=host.querySelector('#nsAutoBox'); if(!sl || !box) return;
  var sync=function(){ box.querySelectorAll('input,select').forEach(function(x){ if(/** @type {any} */(x).id!=='nsAuto') /** @type {any} */(x).disabled=!sl.checked || !/** @type {any} */(host.querySelector('#nsAuto')).checked; });
    /** @type {any} */(host.querySelector('#nsAuto')).disabled=!sl.checked; };
  sl.addEventListener('change', sync); /** @type {any} */(host.querySelector('#nsAuto')).addEventListener('change', sync); sync();
  if(ST.IS_SUPER && NTF.snapOk!==false && !NTF.snap) ntfGet('notify_snapshot?select=at,by_email,n&id=eq.1').then(function(r){ if(r && r[0]){ NTF.snap=r[0]; var i=document.getElementById('nsAutoInfo'); if(i) i.textContent=ntfAutoInfo(ntfSet()); } });
}
/** 예약 발송용 «보낼 글» 저장 — 슈퍼 관리자 · Slack · 예약이 켜져 있을 때만 · 스테이징은 쓰지 않음 · 바뀌었거나 6시간 지났을 때만 */
export async function ntfSnapSave(force){
  var S=ntfSet();
  if(!ST.IS_SUPER || IS_STAGING || !ntfAutoOk() || !S.slack_on || !S.auto_on || NTF.snapOk===false || !ST.DATA) return false;
  try{
    var omap=await ntfOwnerMap(), plan=ntfSlackPlan(omap);
    var body={id:1, ver:APP_VER, n:plan.team.n, team:{text:plan.team.text, n:plan.team.n}, dms:plan.dms.map(function(d){ return {email:d.email, text:d.text, n:d.n}; })};
    var key=JSON.stringify([body.team, body.dms]);
    if(!force && key===NTF.snapKey && Date.now()-NTF.snapAt<6*36e5) return false;
    await sbWrite('POST','notify_snapshot?on_conflict=id', body, 'resolution=merge-duplicates,return=minimal', 'adminx');
    NTF.snapKey=key; NTF.snapAt=Date.now(); NTF.snapOk=true; NTF.snap={at:new Date().toISOString(), n:body.n, by_email:ST.AUTH_USER};
    return true;
  }catch(e){ if(/\(404\)|PGRST205|does not exist/.test(String(/** @type {any} */(e).message||e))) NTF.snapOk=false; return false; }
}

/* ── Slack 으로 보내기 (슈퍼 관리자 · 켜져 있을 때만 · 미리 보기 → 확인 · 자동 발송 없음) ── */
export function ntfPortalUrl(){ try{ return /^https:$/.test(location.protocol)? location.origin+location.pathname : ''; }catch(e){ return ''; } }
/** Slack 글자 — & < > 는 Slack 규칙대로 바꿈(고객사 이름에 < 가 있어도 링크 · 호출로 읽히지 않게) */
export function ntfSl(t){ return String(t==null? '' : t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
export function ntfSlackText(items, head){
  var url=ntfPortalUrl(), by={};
  items.forEach(function(x){ (by[x.kind]=by[x.kind]||[]).push(x); });
  var lines=[ntfSl(head)];
  ['lapsed','dc','biz','renew','eq'].forEach(function(k){ var a=by[k]; if(!a || !a.length) return;
    lines.push('*'+(NTF_KIND[k]||k)+'* '+a.length+'건');
    a.slice(0,10).forEach(function(x){ lines.push('• '+ntfSl(x.title)+(x.detail? ' — '+ntfSl(x.detail) : '')); });
    if(a.length>10) lines.push('… 외 '+(a.length-10)+'건'); });
  lines.push(url? '<'+url+'|포탈 › 알림함>에서 열기' : '포탈 › 알림함에서 열기');
  var t=lines.join('\n'); return t.length>2900? t.slice(0, 2880)+'\n…(잘림)' : t;
}
/** 항목 → 받을 계정(이메일) — 설정의 받는 사람 + 재약정 CSM 이 담당자 연결된 계정 + 장비 처리 담당 */
export function ntfTargets(x, omap){
  var u={}; (x.to||[]).forEach(function(e){ u[String(e).toLowerCase()]=1; });
  if(x.who) (omap||[]).forEach(function(m){ if((m.owner_names||[]).some(function(n){ return !!n && String(x.who).indexOf(n)>=0; })) u[String(m.email).toLowerCase()]=1; });
  return Object.keys(u);
}
export function ntfSlackPlan(omap){
  var all=ntfItems(), S=ntfSet(), day=todayStr(), per={};
  all=all.filter(function(x){ return x.kind!=='ops'; });   /* 운영 상태는 관리자 화면 안에서만(Slack 에 안 보냄) */
  all.forEach(function(x){ ntfTargets(x, omap).forEach(function(e){ (per[e]=per[e]||[]).push(x); }); });
  var dms=Object.keys(per).sort().slice(0, 30).map(function(e){ return {email:e, n:per[e].length, text:ntfSlackText(per[e], '🔔 '+ntfWho(e)+' 님 포탈 알림 '+day+' — '+per[e].length+'건')}; });
  return {team:{channel:S.team_channel, n:all.length, text:ntfSlackText(all, '🔔 포탈 알림 '+day+' — '+all.length+'건')}, dms:dms, more:Math.max(0, Object.keys(per).length-30)};
}
export async function ntfCall(body){
  var r=await fetch(SB_URL+'/functions/v1/notify', {method:'POST', headers:sbHeaders(true), body:JSON.stringify(body)});
  /** @type {any} */ var j=null; try{ j=await r.json(); }catch(e){}
  if(!r.ok || !j) throw new Error((j && j.error) || ('notify 함수 응답 '+r.status+(r.status===404? ' — Edge Function «notify» 를 먼저 배포하세요(README)' : '')));
  return j;
}
export async function ntfSlackOpen(){
  var S=ntfSet();
  if(!ST.IS_SUPER){ toast('권한 없음','Slack 보내기는 슈퍼 관리자만','info'); return; }
  if(!S.slack_on){ toast('Slack 이 꺼져 있습니다','관리자 › 설정 › 알림 · Slack 에서 켠 뒤 보낼 수 있습니다','info'); return; }
  var omap=await ntfOwnerMap(), plan=ntfSlackPlan(omap), m=ntfDlg('ovlNtfSlack', 640);
  m.innerHTML=tpl`<h3 id="ovlNtfSlackH">Slack 으로 보내기 — 미리 보기</h3><p class="cap">지금 알림함 내용 그대로입니다. 아래 «보내기»를 누르고 한 번 더 확인할 때만 보냅니다(자동 발송 없음).</p>`+
    tpl`<label class="ntf-sw"><input type="checkbox" id="slTeam"${rawHtml(plan.team.n? ' checked' : '')}> 팀 채널 <b>${plan.team.channel}</b>에 요약 1번 — ${String(plan.team.n)}건</label>`+
    tpl`<pre class="ntf-pre" tabindex="0" aria-label="팀 채널 메시지 미리 보기">${plan.team.text}</pre>`+
    tpl`<label class="ntf-sw"><input type="checkbox" id="slDm"${rawHtml(plan.dms.length? ' checked' : ' disabled')}> 받는 사람에게 개인 메시지(DM) ${String(plan.dms.length)}명${plan.more? ' (30명까지 · '+plan.more+'명 빠짐)' : ''}</label>`+
    tpl`${rawHtml(plan.dms.length? tpl`<ul class="ntf-dm">${rawHtml(plan.dms.map(function(d){ return tpl`<li>${d.email} — ${String(d.n)}건</li>`; }).join(''))}</ul>` : '<p class="cap">받는 사람이 정해지지 않았습니다 — 관리자 › 설정 › 알림 · Slack</p>')}`+
    tpl`<div class="mact"><span class="mmsg" id="slMsg" role="status"></span><button type="button" class="pill ghost" data-close="ovlNtfSlack">닫기</button><button type="button" class="pill" id="slGo">보내기…</button></div>`;
  m.querySelector('#slGo').onclick=async function(){
    var team=!!m.querySelector('#slTeam').checked, dm=!!m.querySelector('#slDm').checked, msg=m.querySelector('#slMsg');
    if(!team && !dm){ msg.textContent='보낼 곳을 하나 이상 고르세요'; msg.className='mmsg bad'; return; }
    var what=[team? '팀 채널 '+plan.team.channel : '', dm? 'DM '+plan.dms.length+'명' : ''].filter(Boolean).join(' · ');
    if(!confirm('Slack 으로 보냅니다 — '+what+'\n\n실제로 메시지가 갑니다. 보낼까요?')) return;
    if(NTF.busy) return; NTF.busy=true; msg.textContent='보내는 중…'; msg.className='mmsg';
    try{
      var j=await ntfCall({team:team? {channel:plan.team.channel, text:plan.team.text, n:plan.team.n} : null, dms:dm? plan.dms : [], ver:APP_VER});
      var res=(j.results||[]), bad=res.filter(function(x){ return !x.ok; });
      msg.innerHTML=tpl`${String(res.length-bad.length)}곳 보냄${rawHtml(bad.length? tpl` · <b>${String(bad.length)}곳 실패</b> ${bad.slice(0,4).map(function(x){ return x.target+' ('+x.error+')'; }).join(' · ')}` : ' ✓')}${rawHtml(j.hint? tpl`<br>${j.hint}` : '')}`;
      msg.className='mmsg '+(bad.length? 'bad' : 'ok');
      toast(bad.length? 'Slack 일부 실패' : 'Slack 으로 보냈습니다', what, bad.length? 'warn' : undefined);
    }catch(e){ msg.textContent='보내지 못했습니다 — '+String(/** @type {any} */(e).message||e).slice(0,160); msg.className='mmsg bad'; }
    finally{ NTF.busy=false; }
  };
  openOvl('ovlNtfSlack');
}
/** 데이터를 새로 읽은 뒤(shell.js) — 종 숫자만 다시 · 설정 · 읽음은 5분에 한 번 */
export function ntfAfterData(){ try{ ntfSync(); ntfLoad(); }catch(e){} }
