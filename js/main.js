/* ===== main.js — 포탈 시작점 (ES 모듈 전환 2단계 · ㊿+153) =====
   · index.html 은 <script type="module" src="js/main.js?v=…"> 하나만 부름. 나머지 파일은 아래 import 와 각 파일 맨 위 import 로 따라옴
     (각 파일 주소의 ?v=버전 꼬리표는 index.html 의 <script type="importmap"> 이 붙임 → 새 버전을 올리면 브라우저가 새 파일을 받음)
   · 리포트·관리자·가격표 3개는 여기서 부르지 않음 — 그 메뉴를 처음 열 때 js/lazy.js 가 받음
   · 순서: 모든 파일을 읽음(선언만 · 아무것도 실행 안 함) → window 다리 → init.js start()(이벤트 등록 · 시작)
   · window 다리(임시 · 다음 단계에서 뺄 예정): 예전 고전 스크립트처럼 window.이름 으로도 보이게 — 테스트 · 스테이징 QA(다른 버전 포탈이 이 창을 들여다봄) ·
     위성 페이지(parent.refreshToken)가 아직 그렇게 씀. 읽기 전용(모듈 값은 그 파일 안에서만 바꿈). 같은 것을 window.SVC 에도 — 앞으로는 이쪽만 씀 */
import * as m_state from './state.js';
import * as m_viz from './viz.js';
import * as m_core from './core.js';
import * as m_shell from './shell.js';
import * as m_dash from './dash.js';
import * as m_ai from './ai.js';
import * as m_grids from './grids.js';
import * as m_equipment from './equipment.js';
import * as m_analysis from './analysis.js';
import * as m_tools from './tools.js';
import * as m_cloud from './cloud.js';
import * as m_inbound from './inbound.js';
import * as m_upd from './upd.js';
import * as m_sales from './sales.js';
import * as m_grid from './grid.js';
import * as m_edit from './edit.js';
import * as m_lazy from './lazy.js';
import * as m_init from './init.js';

var SVC={}, SKIP=[];
function expose(ns){
  Object.keys(ns).forEach(function(k){
    if(k==='start') return;
    var get=function(){ return ns[k]; };
    Object.defineProperty(SVC, k, {get:get, enumerable:true, configurable:true});
    var d=Object.getOwnPropertyDescriptor(window, k);
    if(d && !d.configurable){ SKIP.push(k); return; }   // 브라우저 고유 이름(바꿀 수 없음) — 고전 스크립트였어도 못 덮었음
    Object.defineProperty(window, k, {get:get, set:function(){ throw new TypeError('window.'+k+' 는 모듈 값이라 밖에서 바꿀 수 없습니다 — '+k+' 의 속성을 바꾸거나 그 파일의 함수를 쓰세요'); }, enumerable:false, configurable:true});
  });
}
[m_state, m_viz, m_core, m_shell, m_dash, m_ai, m_grids, m_equipment, m_analysis, m_tools, m_cloud, m_inbound, m_upd, m_sales, m_grid, m_edit, m_lazy].forEach(expose);
m_lazy.lazyHook(function(name, ns){ expose(ns); });
Object.defineProperty(SVC, '__skip', {value:SKIP});
window.SVC=SVC;
m_init.start();
