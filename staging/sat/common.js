/* ===== sat/common.js — 위성 페이지 공통 (견적서 quote · 프로젝트 리포트 report · S1 정산 s1 · KK 정산 kk) · ㊿+154 =====
   · 홈 화면 앱(서비스 워커) 등록 — 예전엔 페이지마다 <head> 의 인라인 한 줄
   · 버튼·입력칸 동작 연결: 인라인 onclick 대신 data-click · data-change · data-input 속성 + 아래 위임 처리
     → 페이지에 인라인 스크립트가 하나도 없어 CSP script-src 에서 'unsafe-inline' 을 뺄 수 있음(XSS 로 끼워 넣은 스크립트가 실행되지 않음)
   · data-* 값 문법(코드를 실행하지 않고 읽기만 함 — eval 없음): 「함수(인자, …); 함수2()」
       함수 = 페이지가 SAT.act({…}) 로 등록한 것 + print · close · reload
       인자 = 숫자 · '문자' · "문자" · true · false · null · [숫자, …] · event · this · this.속성(.속성…) · this.메서드('문자')  예: this.value · this.closest('tr')
   · 고전 스크립트(전역 SAT 하나) — <head> 에서 페이지 스크립트(sat/<페이지>.js)보다 먼저 */
(function(){ if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) addEventListener('load', function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); }); })();

var SAT=(function(){
  var ACTS={ print:function(){ window.print(); }, close:function(){ window.close(); }, reload:function(){ location.reload(); } };
  var CACHE={};
  /** 페이지 함수 등록 — 이름: 함수 */
  function act(o){ Object.keys(o).forEach(function(k){ if(typeof o[k]!=='function') throw new Error('SAT.act: '+k+' 는 함수가 아님'); ACTS[k]=o[k]; }); }
  function has(name){ return Object.prototype.hasOwnProperty.call(ACTS, name); }
  /* ── data-* 값 읽기 (작은 구문 분석기) ── */
  function parse(src){
    if(CACHE[src]) return CACHE[src];
    var i=0, s=String(src);
    function ws(){ while(i<s.length && /\s/.test(s[i])) i++; }
    function err(m){ throw new Error('data-* 문법 오류: '+m+' — «'+s+'» '+i+'번째 글자'); }
    function ident(){ ws(); var m=/^[A-Za-z_$][\w$]*/.exec(s.slice(i)); if(!m) err('이름이 필요'); i+=m[0].length; return m[0]; }
    function str(){ var q=s[i++], out=''; while(i<s.length && s[i]!==q){ if(s[i]==='\\'){ i++; out+=s[i++]; } else out+=s[i++]; } if(s[i]!==q) err('따옴표가 닫히지 않음'); i++; return out; }
    function num(){ var m=/^-?\d+(?:\.\d+)?(?:e-?\d+)?/i.exec(s.slice(i)); if(!m) err('숫자'); i+=m[0].length; return Number(m[0]); }
    function arg(){
      ws(); var c=s[i];
      if(c==="'" || c==='"'){ var v=str(); return {k:'v', v:v}; }
      if(c==='-' || /\d/.test(c)) return {k:'v', v:num()};
      if(c==='['){ i++; var arr=[]; ws(); if(s[i]===']'){ i++; return {k:'v', v:arr}; }
        for(;;){ var a=arg(); if(a.k!=='v') err('배열 안에는 값만'); arr.push(a.v); ws(); if(s[i]===','){ i++; continue; } if(s[i]===']'){ i++; break; } err('] 가 필요'); }
        return {k:'v', v:arr}; }
      var id=ident();
      if(id==='true') return {k:'v', v:true}; if(id==='false') return {k:'v', v:false}; if(id==='null') return {k:'v', v:null};
      if(id==='event') return {k:'ev'};
      if(id!=='this') err('알 수 없는 인자 '+id);
      var path=[]; ws();
      while(s[i]==='.'){ i++; var p=ident(); ws(); var call=null;
        if(s[i]==='('){ i++; call=[]; ws(); if(s[i]!==')'){ for(;;){ var ca=arg(); if(ca.k!=='v') err('메서드 인자는 값만'); call.push(ca.v); ws(); if(s[i]===','){ i++; continue; } break; } } ws(); if(s[i]!==')') err(') 가 필요'); i++; ws(); }
        path.push({p:p, call:call}); }
      return {k:'this', path:path};
    }
    var list=[];
    for(;;){ ws(); if(i>=s.length) break; if(s[i]===';'){ i++; continue; }
      var fn=ident(); ws(); var args=[];
      if(s[i]==='('){ i++; ws(); if(s[i]!==')'){ for(;;){ args.push(arg()); ws(); if(s[i]===','){ i++; continue; } break; } } ws(); if(s[i]!==')') err(') 가 필요'); i++; }
      list.push({fn:fn, args:args}); ws(); if(i<s.length && s[i]!==';') err('; 가 필요'); }
    return (CACHE[src]=list);
  }
  function val(a, el, ev){
    if(a.k==='v') return a.v; if(a.k==='ev') return ev;
    var o=el; for(var j=0;j<a.path.length;j++){ var st=a.path[j]; if(o==null) return undefined; o= st.call? o[st.p].apply(o, st.call) : o[st.p]; }
    return o;
  }
  /** 한 요소의 data-<type> 실행 */
  function run(el, ev, src){
    parse(src).forEach(function(c){
      if(!has(c.fn)) throw new Error('SAT: 등록되지 않은 함수 «'+c.fn+'» — 페이지 스크립트 끝의 SAT.act({…}) 에 추가하세요');
      ACTS[c.fn].apply(el, c.args.map(function(a){ return val(a, el, ev); }));
    });
  }
  /* 위임 — 인라인 핸들러와 같은 순서: 이벤트가 난 요소부터 위로 올라가며 data-<type> 가 있는 요소마다 (stopPropagation 하면 멈춤) */
  ['click','change','input'].forEach(function(type){
    document.addEventListener(type, function(ev){
      for(var el=ev.target; el && el.nodeType===1; el=el.parentElement){
        var src=el.getAttribute('data-'+type); if(src) run(el, ev, src);
        if(ev.cancelBubble) break;
      }
    });
  });
  return { act:act, has:has, parse:parse, run:run };
})();

/* ===== HTML 만들기 — 특수문자 자동 처리 (포탈 js/core.js 의 tpl · rawHtml 과 같은 규칙 · ㊿+155) =====
   · tpl`…${값}…` : ${} 안의 값은 자동으로 & < > " 처리 · 이미 만든 HTML 조각만 rawHtml(…) 로 그대로 */
var rawHtml, tpl;
(function(){
  function RawHtml(s){ this.html=s; }
  function e(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  rawHtml=function(s){ return new RawHtml(String(s)); };
  tpl=function(strs){ var out=strs[0]; for(var i=1;i<strs.length;i++){ var v=arguments[i]; out+=(v instanceof RawHtml? v.html : e(v))+strs[i]; } return out; };
})();
/* ㊿+156 창(.ovl.show) 바깥 클릭 · Esc 로 닫기 — 예전엔 정산(s1·kk)만 · 이제 프로젝트 리포트(저장 목록 · 관리원가)도 */
document.addEventListener('click', function(ev){ var t=ev.target; if(t&&t.classList&&t.classList.contains('ovl')) t.classList.remove('show'); });
document.addEventListener('keydown', function(ev){ if(ev.key==='Escape') document.querySelectorAll('.ovl.show').forEach(function(o){ o.classList.remove('show'); }); });
/* ㊿+172 포탈 안(견적 · 프로젝트 리포트 · 정산 화면)에서 입력하다가 Ctrl+K → 포탈 검색 · AI 질문 창(쓰던 내용은 이 화면에 그대로) */
document.addEventListener('keydown', function(ev){
  if(!(ev.ctrlKey || ev.metaKey) || (ev.key!=='k' && ev.key!=='K') || window.parent===window) return;
  ev.preventDefault(); try{ window.parent.postMessage({type:'svcFind'}, location.origin); }catch(e){}
});
