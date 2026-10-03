/* load.js — <body> 끝에서 실행 (④ 아키텍처 2단계 · ㊿+136)
   · <meta name="app-js"> 에 적힌 파일을 그 순서대로 ?v=APP_VER 를 붙여 동기 로드(document.write → 파서 삽입 스크립트라 순서 보장).
   · 파일을 추가·삭제·순서 변경할 때는 index.html 의 meta 와 sw.js 의 SHELL 만 고치면 됩니다. 마지막은 항상 js/init.js. */
(function(){
  var m=document.querySelector('meta[name="app-js"]'); var list=((m&&m.content)||'').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
  var v=encodeURIComponent(window.APP_VER||'');
  document.write(list.map(function(f){ return '<script src="'+f+'?v='+v+'"><\/script>'; }).join(''));
})();
