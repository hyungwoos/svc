/* ===== main.js — 포탈 시작점 (ES 모듈 전환 2단계 ㊿+153 · 다리 제거 ㊿+154) =====
   · index.html 은 <script type="module" src="js/main.js?v=…"> 하나만 부름. 나머지 파일은 아래 import 와 각 파일 맨 위 import 로 따라옴
     (각 파일 주소의 ?v=버전 꼬리표는 index.html 의 <script type="importmap"> 이 붙임 → 새 버전을 올리면 브라우저가 새 파일을 받음)
   · 리포트·관리자·가격표 3개는 여기서 부르지 않음 — 그 메뉴를 처음 열 때 js/lazy.js 가 받음
   · 순서: 모든 파일을 읽음(선언만 · 아무것도 실행 안 함) → window.SVC → init.js start()(이벤트 등록 · 시작)
   · window.SVC = 포탈의 모든 이름을 한곳에서 읽는 손잡이(읽기 전용) — 테스트 · 스테이징 QA(다른 버전 포탈이 이 창을 들여다봄) · 위성 페이지(parent.SVC.refreshToken)가 씀.
     포탈 코드끼리는 SVC 를 쓰지 않고 import 로만 연결(tests/lint.mjs 가 확인). ㊿+154 부터 window.이름 다리는 없음 */
import * as m_state from './state.js';
import * as m_viz from './viz.js';
import * as m_core from './core.js';
import * as m_shell from './shell.js';
import * as m_dash from './dash.js';
import * as m_ai from './ai.js';
import * as m_home from './home.js';
import * as m_notify from './notify.js';
import * as m_guard from './guard.js';
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
import * as m_qadb from './qadb.js';
import * as m_qadata from './qadata.js';
import * as m_init from './init.js';

var SVC={};
function expose(ns){
  Object.keys(ns).forEach(function(k){
    if(k==='start') return;
    Object.defineProperty(SVC, k, {get:function(){ return ns[k]; }, enumerable:true, configurable:true});
  });
}
[m_state, m_viz, m_core, m_shell, m_dash, m_ai, m_home, m_notify, m_guard, m_grids, m_equipment, m_analysis, m_tools, m_cloud, m_inbound, m_upd, m_sales, m_grid, m_edit, m_lazy, m_qadb, m_qadata].forEach(expose);
m_lazy.lazyHook(function(name, ns){ expose(ns); });
Object.defineProperty(window, 'SVC', {value:SVC, enumerable:false, configurable:false, writable:false});
if(m_state.IS_QA_DATA) m_qadata.qaDataInstall();   /* ㊿+157 ?qa=data — 시작 전에 가짜 DB 로 바꿔 끼움(운영 DB 에 닿지 않음) */
m_init.start();
