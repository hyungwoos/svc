/* sqlbox.js — sqlbox.html(격리 칸) 안에서만 실행 (㊿+147)
   · 포탈(report.js qbSqlRun)이 {type:'sqlbox-run', id, tables:{이름:[행…]}, sql, aliases, lineLabel} 를 보내면
     AlaSQL 에 표·보조 함수를 등록해 실행하고 {type:'sqlbox-res', id, ok, data|error} 를 돌려줌.
   · 이 칸은 출처가 없고(sandbox) 외부 연결이 막혀 있어(CSP) 사용자가 쓴 SQL 이 JS 로 바뀌어 돌아도 로그인 토큰·포탈에 닿지 못함.
   · NMKEY 는 포탈 nmKeys() 와 같은 규칙(같은지 tests/smoke.mjs 가 비교) — 바꾸면 둘 다 고칠 것.
   · 이 파일은 포탈 meta app-js 목록에 넣지 않음(포탈 본문에서는 실행되지 않음). */
(function(){
  'use strict';
  var LIB={ sri:'sha384-R+tp+Ayg7ADMu+jC1irp5MN9ay8j2oAu058LGEUO6JumIeTBS3C97SttBKQUY2Qf',
    urls:['https://cdn.jsdelivr.net/npm/alasql@4.19.0/dist/alasql.min.js','https://cdnjs.cloudflare.com/ajax/libs/alasql/4.19.0/alasql.min.js','https://unpkg.com/alasql@4.19.0/dist/alasql.min.js'] };
  var loading=null, ALIAS={}, LINE={};
  function load(){
    if(window.alasql) return Promise.resolve();
    if(loading) return loading;
    loading=new Promise(function(res, rej){
      (function nx(i){
        if(i>=LIB.urls.length){ loading=null; return rej(new Error('SQL 엔진(alasql)을(를) 불러오지 못했습니다 — 네트워크·사내 차단을 확인해 주세요')); }
        var s=document.createElement('script'); s.src=LIB.urls[i]; s.integrity=LIB.sri; s.crossOrigin='anonymous';
        s.onload=function(){ if(window.alasql) res(); else { s.remove(); nx(i+1); } };
        s.onerror=function(){ s.remove(); nx(i+1); };
        document.head.appendChild(s);
      })(0);
    });
    return loading;
  }
  /* 포탈 analysis.js nmKeys() 와 같은 규칙 */
  function nmKeys(n){
    function k1(t){ var out=[], base=t.replace(/\([^)]*\)/g,''), m2; out.push(base); var re=/\(([^)]*)\)/g; while((m2=re.exec(t))) out.push(m2[1].replace(/^구\.?\s*/,'')); return out; }
    var t=String(n||''), out=k1(t); (ALIAS[t]||[]).forEach(function(a){ out=out.concat(k1(String(a))); });
    return out.map(function(x){ return x.replace(/^\(?주\)?|주식회사|\(주\)|\s|_/g,'').toLowerCase(); }).filter(function(x){ return x.length>=2; });
  }
  function fns(){
    if(alasql.fn.__qb) return;
    alasql.fn.WON=function(v){ return v==null? null : Math.round(Number(v)/1000); };
    alasql.fn.NMKEY=function(s){ var k=nmKeys(s); return k.length? k[0] : String(s==null?'':s).toLowerCase(); };
    alasql.fn.YM=function(d){ return d==null? null : String(d).slice(0,7); };
    alasql.fn.YR=function(d){ return d==null? null : String(d).slice(0,4); };
    alasql.fn.QTR=function(d){ if(d==null||d==='') return d; var s=String(d).slice(0,7), m=+s.slice(5,7)||1; return s.slice(0,4)+'-Q'+(Math.floor((m-1)/3)+1); };
    alasql.fn.MON=function(d){ return d==null? null : (+String(d).slice(5,7)||null); };
    alasql.fn.SVC=function(l){ return l==null? null : (LINE[l]||l); };
    alasql.fn.__qb=true;
  }
  var P=window.parent;
  function reply(o){ try{ P.postMessage(o, '*'); }catch(e){} }   // 받는 쪽(포탈)이 e.source 로 이 칸인지 확인
  window.addEventListener('message', function(e){
    if(e.source!==P) return;
    var m=e.data||{}; if(m.type!=='sqlbox-run') return;
    load().then(function(){
      fns(); ALIAS=m.aliases||{}; LINE=m.lineLabel||{};
      Object.keys(m.tables||{}).forEach(function(t){ alasql.tables[t]=new alasql.Table({data:m.tables[t]}); });
      var data=alasql(String(m.sql||''));
      reply({type:'sqlbox-res', id:m.id, ok:true, data:data});
    }).catch(function(err){ reply({type:'sqlbox-res', id:m.id, ok:false, error:String(err && err.message || err)}); });
  });
  reply({type:'sqlbox-ready'});
})();
