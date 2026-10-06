/* ===== upd.js — 로그인할 때 업데이트 안내 팝업 · 안내문 시드(UPD_SEED) =====
   ㊿+153: admin.js 에서 나눔 — 모든 계정이 로그인 때 쓰므로 처음부터 불러옴. 관리자 › 업데이트 안내 화면(updAdmin*)은 admin.js 에 그대로 */
import { APP_VER, IS_QA, ST } from './state.js';
import { refreshToken, SB_URL } from './core.js';
import { sbHeaders, toast } from './shell.js';
import { esc } from './dash.js';

/* ===== ㊿+148 업데이트 안내 — 로그인할 때 팝업 (SQL 96 · 사용자: «담당자를 체크해 놓으면 로그인할 때 업데이트 내용을 안내 · 다 확인했다고 체크하면 다시 안 뜨고 · 다음 업데이트면 새 내용으로 다시») =====
   · 안내문은 아래 UPD_SEED 에 코드와 함께 실려 옴 → 슈퍼 관리자가 포탈을 열 때 DB(upd_notes)에 없는 ver 만 자동으로 넣음(관리자가 고친 내용은 덮어쓰지 않음)
   · 대상 = 관리자 › 업데이트 안내에서 체크한 계정(upd_notify) · 확인 = upd_ack(마지막 안내 id) — 새 안내는 id 가 커서 다시 뜸
   · 읽기 호출은 sbWrite 대신 직접 fetch(캐시를 지우지 않게) · 표가 없으면(SQL 96 전) 조용히 아무것도 안 함
   · 새 업데이트를 낼 때: UPD_SEED 맨 끝에 {ver, date, title, body} 한 개 추가(본문은 한 줄에 하나 «- » · 관리자용은 «(관리자)»로 시작) */
export var UPD={checked:false, rows:null, users:null, notify:null, ack:null, edit:null, err:''};
export var UPD_SEED=[
  {ver:'㊿+98~117', date:'2026-09-27', title:'화면 디자인 개편 · 임대 장비 대시보드 · 리포트', body:[
    '- 새 화면 디자인 «커맨드 센터»가 기본이 되었습니다. 왼쪽 아이콘 메뉴와 위쪽 검색창(Ctrl+K)으로 화면 이동·AI 질문을 합니다.',
    '- 홈 첫 화면이 «처리할 일 → MRR → 주요 지표 → AI 질문» 순서로 바뀌었고, 차트·표 분석은 «분석» 칸을 펼치면 보입니다.',
    '- 내 계정 › 설정에서 화면 디자인(커맨드 센터·심플·클래식)과 자동 로그아웃 시간을 고를 수 있습니다.',
    '- 장비 › 임대 장비 대시보드: 임대중·처리 대기·회수 현황과 상태 보드(카드를 끌어 다음 단계로).',
    '- 가격표 › 견적·비교: Cloud NAC·MDR 빠른 견적, SaaS와 구축형 비용 비교, 견적서 PDF 비교.',
    '- 클라우드 비용 화면을 요약 타일 + 월별 추이로 정리했습니다.',
    '- 리포트: 계약·매출·장비·OI 등 포탈 데이터를 골라 합치고 묶어 표·차트로 보고, 엑셀·PPT로 내보냅니다. SQL로 직접 쓸 수도 있습니다.',
    '- 고객 360: 요약 4칸(MRR·누적·장비·다음 만료)과 다음 할 일 제안.',
    '- AI 지식: AI에게 팀 규칙·용어를 가르칠 수 있습니다(메뉴 «AI 지식»).',
    '- 표에서 «행 추가» 저장이 안 되던 문제를 고쳤습니다.'].join('\n')},
  {ver:'㊿+118', date:'2026-09-28', title:'휴대폰 홈 화면 앱 · 로그인 유지', body:[
    '- 포탈을 앱처럼 설치할 수 있습니다. 아이폰은 Safari 공유 › 홈 화면에 추가, 안드로이드는 Chrome «앱 설치» (내 계정 › 설정 › 앱으로 설치).',
    '- 로그인 화면에 «로그인 유지»가 생겼습니다. 휴대폰에서는 기본으로 켜집니다.'].join('\n')},
  {ver:'㊿+119~121', date:'2026-09-29', title:'메뉴 권한 · 유입경로 · 뒤로가기', body:[
    '- 계약에 «유입경로»(직접영업·파트너영업·인바운드·프로모션·기타) 칸이 생겼고, 전체 데이터 › 유입경로 분석에서 경로별 매출을 봅니다.',
    '- 위쪽 «←» 버튼, 브라우저 뒤로가기, 휴대폰 뒤로 제스처로 이전 화면에 돌아갑니다. 주소에 화면 이름이 붙어 새로고침·링크 공유 때 그 화면이 열립니다.',
    '- (관리자) 계정마다 메뉴별 보기/읽기/쓰기 권한을 정할 수 있습니다(관리자 › 메뉴 권한).'].join('\n')},
  {ver:'㊿+122~126', date:'2026-09-30', title:'계약 노드수·버전 · 장비 모델 · 인쇄', body:[
    '- 계약 관리에 «Ver.»(V6.0·V5.0·ZTNA)와 «노드수» 칸이 생겼습니다. 서비스가 «Cloud NAC 6.0 / 5.0»으로 구분돼 보입니다.',
    '- 장비 모델 목록: S100·S200·S10_R2·S20_R2·S30H_R1·ES30.',
    '- 발주 신청서의 계약번호·관리자 계정·설치 희망일·에디션·요청 기능은 판매 채널이 «에스원»일 때만 보입니다.',
    '- 입력칸 밖에서 Backspace 키로도 뒤로 갑니다.',
    '- 프로젝트 리포트를 인쇄할 때 아래쪽 주소·로고가 잘리던 문제를 고쳤습니다.'].join('\n')},
  {ver:'㊿+127', date:'2026-10-02', title:'계약 만기 처리 · 견적서 모바일', body:[
    '- 홈에 «만기 지났는데 미처리», «이달 만기» 알림이 뜨고, «처리하기»에서 연장·서비스종료·해지·자동연장을 바로 처리합니다.',
    '- LIVE 타일에 전월 대비 늘고 준 이유(신규·복귀·해지·만기 미처리)가 나옵니다.',
    '- 계약 관리에 «자동연장» 칸이 생겼습니다(매월 자동 연장 계약은 만기 목록에서 빠집니다).',
    '- 휴대폰에서 만든 견적서 PDF의 «공급자» 글자 밀림과 주소 줄바꿈을 고쳤습니다.',
    '- (관리자) 만기 처리 창에서 «슬랙으로 보내기»로 갱신 대상을 팀 슬랙에 보낼 수 있습니다.',
    '- (관리자) AI 지식은 관리자만 쓸 수 있게 바꾸고, AI 사용량에 하루 한도를 두었습니다.'].join('\n')},
  {ver:'㊿+128~132', date:'2026-10-03', title:'2단계 인증 · 보안 · 배포·운영', body:[
    '- 내 계정 › 보안 › 2단계 인증: 휴대폰 인증 앱(Google Authenticator 등)으로 로그인 때 6자리 코드를 한 번 더 확인합니다.',
    '- 견적서 직인을 로그인한 사람만 볼 수 있는 저장소로 옮겼습니다.',
    '- 포탈에서 생기는 오류가 자동으로 기록되고, 매일 새벽 데이터가 백업됩니다(7일 보관).',
    '- (관리자) 계정별로 2단계 인증을 «필수»로 지정하고 기한을 줄 수 있습니다.',
    '- (관리자) 관리자 › 배포·운영: 포탈 안에서 파일 배포, DB 쿼리 실행, 서버 함수 배포(작업 PIN 필요). 스테이징(시험판)에서 먼저 확인하고 운영에 올립니다.'].join('\n')},
  {ver:'㊿+133~136', date:'2026-10-03', title:'데이터 점검 · 화면 다듬기', body:[
    '- 전체 데이터 › 🩺 데이터 점검: 고객사 연결 없음·만기 미처리·목록에 없는 값·에스원 계약번호 누락 등 어긋난 데이터를 모아 보여 줍니다. 바로 고칠 게 있으면 홈에 알림이 뜹니다.',
    '- 표 검색 결과가 0건이면 «검색어 지우기 / 필터 지우기» 버튼이 나옵니다.',
    '- 계약 관리의 관점 칩 중 0건인 것은 접혀서 한 줄로 보입니다.',
    '- Esc 키로 맨 위 창이 닫힙니다. 경고 알림 아이콘은 주황 «!»로 바뀌었습니다.',
    '- AI가 포탈 사용법(만기 처리·2단계 인증·리포트 등)도 답할 수 있게 했습니다.',
    '- (관리자) AI 15문 점검: 대표 질문 15개로 AI 답이 맞는지 확인합니다(배포·운영 › 기록).'].join('\n')},
  {ver:'㊿+137~139', date:'2026-10-03', title:'코드 관리 · 고객사 병합 · 도움말 · AI 피드백', body:[
    '- 데이터 점검 › 고객사 이름 중복은 «병합»으로 하나로 합칠 수 있고(관리자), «LIVE인데 이달 매출 0»은 mrr 금액으로 한 번에 채울 수 있습니다.',
    '- 표 위 «❔ 이 화면 사용법»을 누르면 AI가 그 화면 쓰는 법을 알려 줍니다.',
    '- 입력칸 밖에서 «?» 키를 누르면 단축키 안내가 나옵니다.',
    '- 표 설명이 길면 첫 문장만 보이고 «도움말 ▾»로 펼칩니다.',
    '- 표를 옆으로 끝까지 밀어도 ✎/🗑 버튼이 마지막 칸을 가리지 않습니다.',
    '- AI 답 밑 👍/👎로 답이 맞았는지 알려 주세요(👎는 메모를 남길 수 있습니다).',
    '- 상태·채널·서비스처럼 정해진 목록에 없는 값은 저장할 때 막습니다(오타 방지).',
    '- (관리자) 관리자 › 코드 관리: 선택 목록을 화면에서 추가·숨기기·순서 변경 — 모든 화면에 바로 반영됩니다.'].join('\n')},
  {ver:'㊿+140~142', date:'2026-10-04', title:'견적 저장 · 창 사용성 · 화면 정리', body:[
    '- 견적서 저장·불러오기가 공용 비밀번호 대신 포탈 로그인으로 동작합니다(비밀번호 입력 없음 · 누가 저장했는지 기록).',
    '- 창 바깥(어두운 곳)을 눌러도 창이 닫힙니다. 입력하던 내용이 있으면 닫기 전에 물어봅니다.',
    '- 서버 오류일 때 «데이터 없음» 대신 «불러오지 못했습니다»로 알려 줍니다.',
    '- 글자 크기·버튼 모양을 통일했고, 회색 글씨를 더 진하게 해서 읽기 쉬워졌습니다.',
    '- 표 머리 칸 오른쪽 경계를 끌어 열 너비를 바꿀 수 있습니다(화면별로 기억 · 경계를 두 번 누르면 원래대로).',
    '- 메뉴의 Cloud NAC·MDR·기타(유통) 세 그룹을 «사업 영역» 한 그룹으로 합쳤습니다.'].join('\n')},
  {ver:'㊿+143~146', date:'2026-10-04', title:'로그인 속도 · 메뉴 이동 · 휴대폰 화면', body:[
    '- 로그인·로그아웃·새로고침이 빨라졌습니다.',
    '- 로그인하면 항상 홈(대시보드)에서 시작합니다.',
    '- 메뉴를 누르면 그 화면의 처음 상태(검색·탭·스크롤 초기화)로 열립니다. 뒤로가기는 보던 그대로 돌아갑니다.',
    '- 휴대폰에서 대시보드 «월별 종합 장표» 제목이 세로로 쌓이고 연도 탭이 넘치던 문제를 고쳤습니다.',
    '- (관리자) 배포·운영: 파일을 넣으면 저장소 자리를 자동으로 잡고, 🧹 저장소 점검으로 안 쓰는 파일을 정리합니다.'].join('\n')},
  {ver:'㊿+147', date:'2026-10-04', title:'읽기 쉬운 색 · 관리자 2단계 인증 필수', body:[
    '- 모든 화면·다크 모드에서 글자와 바탕의 대비를 접근성 기준(WCAG AA)에 맞췄습니다. 초록 버튼이 조금 진해졌습니다.',
    '- 관리자 계정(super_admin·admin)은 2단계 인증이 필수입니다(적용일부터 14일 유예 · 기한 전에는 로그인할 때 안내만 뜹니다).',
    '- 리포트의 SQL 실행을 격리된 칸에서 돌려 더 안전해졌습니다.',
    '- AI 점검이 «9,956만원» 같은 만원 표기도 맞게 읽습니다.'].join('\n')},
  {ver:'㊿+148', date:'2026-10-05', title:'데이터 점검에서 바로 고치기 · 업데이트 안내', body:[
    '- 데이터 점검 항목을 누르면 수정 창이 열려 그 자리에서 고칩니다. 저장하면 다음 항목으로 넘어갑니다.',
    '- 로그인할 때 이렇게 업데이트 내용을 알려 드립니다. «모두 확인했습니다»에 체크하고 확인을 누르면 다음 업데이트 전까지 다시 뜨지 않습니다.',
    '- 지난 안내는 내 계정 › «📢 업데이트 내역»에서 언제든 다시 볼 수 있습니다.',
    '- (관리자) 매일 새벽 3시 AI 자동 점검 결과를 슬랙에 «성공/실패» 한 줄로 알립니다.'].join('\n')},
  {ver:'㊿+149', date:'2026-10-05', title:'관리자 화면 정리', body:[
    '- (관리자) 관리자 화면을 탭 4개(계정·권한 · 보안 · 설정 · AI 비용)로 나눠 긴 스크롤을 없앴습니다. «새 계정 만들기»는 접어 두었습니다.'].join('\n')},
  {ver:'㊿+150', date:'2026-10-05', title:'내부 구조 정리 (모듈 전환 1단계)', body:[
    '- (관리자) 여러 화면이 함께 쓰는 상태 값 17개를 한 파일(js/state.js)로 모았습니다. 화면·기능 변화는 없습니다.'].join('\n')},
  {ver:'㊿+151', date:'2026-10-05', title:'스테이징 QA', body:[
    '- (관리자) 배포·운영 › GitHub 탭에 «🧪 스테이징 QA» — 스테이징 포탈을 창 안에서 열어 메뉴 전부를 자동으로 눌러 보고(JS 오류·빈 화면·깨진 값·넘침·폰 폭), 핵심 숫자가 운영과 같은지 비교합니다. 통과하면 그 자리에서 승격.'].join('\n')},
  {ver:'㊿+152', date:'2026-10-05', title:'가격표 화면 폭 · QA 보고서', body:[
    '- 노트북(1280px)·휴대폰에서 가격표가 화면 옆으로 넘치던 문제를 고쳤습니다. 화면이 좁으면 표가 한 줄에 하나씩, 폰에서는 표 안에서만 옆으로 밀립니다.',
    '- (관리자) 스테이징 QA 결과를 «📋 Claude 에게 보낼 내용 복사»로 정리해 붙여넣을 수 있습니다(화면 크기·요소 경로·오류 위치 포함).',
    '- (관리자) 스테이징 QA 가 «불러오는 중» 화면을 실패로 잡던 것을 고쳤습니다(최대 6초 기다림).'].join('\n')},
  {ver:'㊿+153', date:'2026-10-05', title:'첫 화면이 더 빨리 뜹니다', body:[
    '- 리포트 · 가격표 · 내 계정 · 관리자 · 배포·운영 화면은 그 메뉴를 처음 열 때 받습니다. 그래서 로그인 뒤 첫 화면에 받는 코드가 약 1/3 줄었습니다.',
    '- 그 메뉴를 처음 열 때 잠깐 «화면을 불러오는 중…» 이 보일 수 있습니다. 한 번 열면 다음부터는 바로 뜹니다.',
    '- (관리자) 포탈 코드를 ES 모듈로 바꿨습니다. 파일끼리 주고받는 이름이 import/export 로 드러나서, 빠진 이름이나 잘못 쓴 이름을 배포 전에 검사기가 잡습니다.',
    '- (관리자) 새 버전을 올리면 브라우저가 옛 파일을 섞어 쓰지 않도록 모든 코드 파일 주소에 버전 꼬리표를 붙였습니다.'].join('\n')},
  {ver:'㊿+154', date:'2026-10-05', title:'견적서·정산·리포트 페이지 보안 강화', body:[
    '- 견적서 · S1 정산 · KK 정산 · 프로젝트 리포트 화면의 코드를 파일로 분리했습니다. 끼워 넣은 스크립트는 브라우저가 실행하지 않도록 막습니다. 버튼과 기능은 그대로입니다.',
    '- 예전 «임대장비 발주» 단독 페이지(orders.html) 주소로 들어오면 포탈의 «📝 임대 장비 신청»으로 바로 넘어갑니다.',
    '- (관리자) 두 정산 페이지에 똑같이 복사돼 있던 코드(세션·DB·엑셀·인쇄 창)를 한 곳(sat/)으로 합쳤습니다.',
    '- (관리자) 포탈 코드가 window 전역에 기대던 부분을 모두 걷어냈습니다(공유 값은 ST · 함수는 import). 테스트·스테이징 QA 는 window.SVC 하나로 봅니다.'].join('\n')}
];
export async function updFetch(path, opt){   /* 캐시를 건드리지 않는 직접 호출 — 401 이면 토큰 갱신 뒤 1회 재시도 */
  if(!ST.SB_TOKEN) throw new Error('로그인이 필요합니다');
  var go=function(){ return fetch(SB_URL+'/rest/v1/'+path, Object.assign({headers:sbHeaders(true)}, opt||{})); };
  var r=await go(); if(r.status===401 && await refreshToken()) r=await go();
  var t=await r.text(); if(!r.ok) throw new Error('HTTP '+r.status+' '+t.slice(0,160));
  return t? JSON.parse(t) : null;
}
export function updRpc(fn, args){ return updFetch('rpc/'+fn, {method:'POST', body:JSON.stringify(args||{})}); }
export function updBodyHtml(body){
  var lines=String(body||'').split(/\r?\n/).map(function(x){ return x.trim(); }).filter(Boolean), h='', inList=false;
  lines.forEach(function(l){
    var li=/^[-•·]\s*/.test(l);
    if(li && !inList){ h+='<ul>'; inList=true; } if(!li && inList){ h+='</ul>'; inList=false; }
    var t=l.replace(/^[-•·]\s*/,''), adm=/^\(관리자\)\s*/.test(t); t=t.replace(/^\(관리자\)\s*/,'');
    var x=(adm? '<span class="upd-adm">관리자</span> ':'')+esc(t);
    h+= li? '<li>'+x+'</li>' : '<p>'+x+'</p>';
  });
  return h+(inList? '</ul>':'');
}
/* 팝업 — opt.mode: 'ack'(로그인 안내 · 확인 체크) | 'all'(내 계정 › 업데이트 내역) | 'preview'(관리자 미리보기) */
export function updShow(notes, opt){
  opt=opt||{}; notes=(notes||[]).slice().sort(function(a,b){ return (b.id||0)-(a.id||0); });
  var old=document.getElementById('ovlUpd'); if(old) old.remove();
  var ov=document.createElement('div'); ov.id='ovlUpd'; ov.className='ovl on'; ov.style.cssText='z-index:9500;align-items:center';
  var sub=opt.mode==='ack'? (opt.first? '지금까지 포탈에서 바뀐 내용입니다 ('+notes.length+'번의 업데이트)' : '지난번 확인한 뒤 바뀐 내용입니다 ('+notes.length+'건)') : opt.mode==='preview'? '관리자 미리보기 — 체크된 계정에게 이렇게 보입니다' : '지금까지의 업데이트 내역';
  ov.innerHTML='<div class="modal upd" style="width:min(680px,100%);padding:20px 22px" role="dialog" aria-modal="true" aria-labelledby="updTitle">'+
    '<div class="upd-head"><span class="upd-ic" aria-hidden="true">📢</span><div><h3 id="updTitle" style="margin:0;font-size:18px">포탈 업데이트 안내</h3><div class="mini">'+esc(sub)+'</div></div></div>'+
    '<div class="upd-body" tabindex="0">'+(notes.length? notes.map(function(n,i){ return '<section class="upd-sec"><div class="upd-meta"><b>'+esc(n.title||'')+'</b>'+(i===0&&opt.mode==='ack'? '<span class="ctag ok">최신</span>':'')+'<span class="mini">'+esc(String(n.published_on||'').slice(0,10))+(n.ver? ' · '+esc(n.ver):'')+'</span></div>'+updBodyHtml(n.body)+'</section>'; }).join('') : '<p class="cap">안내가 없습니다.</p>')+'</div>'+
    '<div class="upd-foot">'+(opt.mode==='ack'? '<label class="upd-chk"><input type="checkbox" id="updOk"> 업데이트 내용을 모두 확인했습니다</label><span style="flex:1"></span><button type="button" class="pill ghost" id="updLater">나중에 보기</button><button type="button" class="pill pri" id="updDone" disabled>확인</button>'
      : '<span style="flex:1"></span><button type="button" class="pill" id="updClose">닫기</button>')+'</div></div>';
  document.body.appendChild(ov);
  var ok=ov.querySelector('#updOk'), done=ov.querySelector('#updDone');
  if(ok) ok.onchange=function(){ done.disabled=!ok.checked; };
  var later=ov.querySelector('#updLater'); if(later) later.onclick=function(){ ov.remove(); toast('업데이트 안내', '다음에 로그인할 때 다시 보여 드립니다', 'info'); };
  var cl=ov.querySelector('#updClose'); if(cl) cl.onclick=function(){ ov.remove(); };
  if(done) done.onclick=async function(){
    var top=notes.reduce(function(a,n){ return Math.max(a, +n.id||0); }, 0); done.disabled=true;
    try{ await updRpc('upd_ack_set', {p_last_id:top}); ov.remove(); toast('확인했습니다', '다음 업데이트가 있으면 다시 알려 드립니다'); }
    catch(e){ done.disabled=false; toast('확인 기록 실패', String(e.message||e).slice(0,140), 'warn'); }
  };
  setTimeout(function(){ try{ (ok||cl||ov.querySelector('.upd-body')).focus(); }catch(e){} }, 30);
}
/* 슈퍼 관리자가 열 때 — DB 에 없는 ver 만 넣기(오래된 것부터 → id 가 날짜 순) */
export async function updSyncSeed(){
  if(!ST.IS_SUPER || IS_QA) return 0;
  var have=await updFetch('upd_notes?select=ver');
  var set={}; (have||[]).forEach(function(r){ if(r.ver) set[r.ver]=1; });
  var add=UPD_SEED.filter(function(s){ return !set[s.ver]; }).map(function(s){ return {ver:s.ver, title:s.title, body:s.body, published_on:s.date, created_by:'포탈 '+(APP_VER||'')+' (자동)'}; });
  if(add.length) await updFetch('upd_notes', {method:'POST', body:JSON.stringify(add), headers:Object.assign(sbHeaders(true), {Prefer:'return=minimal'})});
  return add.length;
}
/* 로그인 뒤 첫 데이터 표시 때 1번 (onData) */
export async function updCheck(){
  if(UPD.checked || !ST.SB_TOKEN || IS_QA) return; UPD.checked=true;
  try{ await updSyncSeed(); }catch(e){ /* 표 없음(SQL 96 전) 등 — 조용히 */ }
  try{
    var r=await updRpc('upd_pending', {});
    if(r && r.notify && Array.isArray(r.notes) && r.notes.length) updShow(r.notes, {mode:'ack', first:!r.last_id});
  }catch(e){ /* SQL 96 전 — 조용히 */ }
}
/* 내 계정 › 업데이트 내역 — 누구나 */
export async function updOpenAll(){
  try{ var rows=await updFetch('upd_notes?select=id,ver,title,body,published_on&active=eq.true&order=id.desc'); updShow(rows||[], {mode:'all'}); }
  catch(e){ toast('업데이트 내역', /404|PGRST|does not exist|schema cache/i.test(String(e.message))? '아직 준비되지 않았습니다 (SQL 96)' : String(e.message||e).slice(0,140), 'warn'); }
}
