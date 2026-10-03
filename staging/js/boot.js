/* boot.js — <head> 에서 가장 먼저 실행 (④ 아키텍처 2단계 · ㊿+136)
   · APP_VER 를 <meta name="app-ver"> 에서 읽어 전역으로 두고, app.css 를 같은 버전 꼬리표로 불러옵니다(캐시 무효화).
   · 이 파일 자체는 버전 꼬리표 없이 불러도 됩니다 — 내용이 바뀌는 일이 없게 설계(버전·파일 목록은 index.html 의 meta 에만).
   · 인라인 <script> 가 없어져 CSP script-src 에서 'unsafe-inline' 을 뺄 수 있습니다. */
var APP_VER=(function(){ var m=document.querySelector('meta[name="app-ver"]'); return (m&&m.content)||'0000-00-00 ㊿+0'; })();
document.write('<link rel="stylesheet" href="app.css?v='+encodeURIComponent(APP_VER)+'">');
