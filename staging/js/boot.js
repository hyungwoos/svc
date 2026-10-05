/* boot.js — <head> 에서 가장 먼저 실행 (④ 아키텍처 2단계 · ㊿+136)
   · APP_VER 를 <meta name="app-ver"> 에서 읽어 전역으로 두고, app.css 를 같은 버전 꼬리표로 불러옵니다(캐시 무효화).
   · 이 파일 자체는 버전 꼬리표 없이 불러도 됩니다 — 내용이 바뀌는 일이 없게 설계(버전·파일 목록은 index.html 의 meta 에만).
   · 인라인 <script> 가 없어져 CSP script-src 에서 'unsafe-inline' 을 뺄 수 있습니다. */
var APP_VER=(function(){ var m=document.querySelector('meta[name="app-ver"]'); return (m&&m.content)||'0000-00-00 ㊿+0'; })();
document.write('<link rel="stylesheet" href="app.css?v='+encodeURIComponent(APP_VER)+'">');
/* ㊿+147: 코드 파일 미리 받기 — load.js 가 <body> 끝에서 document.write 로 넣기 전에, 여기(<head>)서 같은 주소로 미리 받기 시작
   (화면 HTML 을 읽는 동안 19개 파일이 함께 내려와 처음 열 때·로그아웃 뒤 다시 열 때 빨라짐). 같은 ?v= 주소라 두 번 받지 않음 */
(function(){ try{
  var m=document.querySelector('meta[name="app-js"]'); if(!m) return; var v=encodeURIComponent(APP_VER);
  m.content.split(',').forEach(function(f){ f=f.trim(); if(!f) return; var l=document.createElement('link'); l.rel='preload'; l.as='script'; l.href=f+'?v='+v; document.head.appendChild(l); });
}catch(e){} })();
