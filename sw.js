/* ============================================================================
   서비스사업부 통합 관리 포탈 — 서비스 워커 (PWA)
   · 목적: 홈 화면 앱으로 설치되게 하고, 껍데기(HTML·아이콘)를 캐시해 오프라인·저속에서도 바로 뜨게 함
   · 원칙: HTML 은 항상 «네트워크 먼저» — index.html 을 새로 올리면 다음 실행 때 바로 새 버전 (캐시는 네트워크가 안 될 때만)
           아이콘·매니페스트는 «캐시 먼저». Supabase·Anthropic·CDN 같은 외부 요청은 건드리지 않음(데이터는 절대 캐시하지 않음)
   · 갱신: 아래 SW_VER 를 올리면 예전 캐시가 정리됨 (index.html 만 바꿀 때는 올릴 필요 없음)
   ============================================================================ */
const SW_VER = 'svc-pwa-1';
const SHELL = ['./index.html', './manifest.webmanifest', './pwa-192.png', './pwa-512.png', './pwa-maskable-512.png', './apple-touch-icon.png'];
const PAGES = /\/(index|kk|quote|report|s1|orders)\.html$/;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SW_VER).then((c) => c.addAll(SHELL)).catch(() => null).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SW_VER).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                 // 외부(Supabase·API·CDN)는 그대로 통과 — 캐시 안 함
  const path = url.pathname;
  const isPage = req.mode === 'navigate' || PAGES.test(path);
  if (isPage) {
    // 네트워크 먼저 (새 버전 즉시 반영) → 실패하면 캐시 (오프라인) → 그것도 없으면 안내 페이지
    e.respondWith(fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(SW_VER).then((c) => c.put(stripQuery(req), copy)); }
      return res;
    }).catch(() => caches.match(stripQuery(req)).then((hit) => hit || caches.match('./index.html')).then((hit) => hit || offlinePage())));
    return;
  }
  if (/\.(png|webmanifest|ico|svg)$/.test(path)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res && res.ok) { const copy = res.clone(); caches.open(SW_VER).then((c) => c.put(req, copy)); } return res; })));
  }
});
function stripQuery(req) { const u = new URL(req.url); u.search = ''; return new Request(u.toString(), { method: 'GET' }); }
function offlinePage() {
  return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>오프라인</title>' +
    '<body style="font-family:system-ui,sans-serif;padding:40px 24px;color:#333"><h2 style="margin:0 0 8px">인터넷 연결이 없습니다</h2>' +
    '<p style="color:#666">포탈은 서버(Supabase)에서 데이터를 읽어야 동작합니다. 연결된 뒤 다시 열어 주세요.</p>' +
    '<button onclick="location.reload()" style="margin-top:12px;padding:10px 16px;border:0;border-radius:8px;background:#149e40;color:#fff;font-size:14px">다시 시도</button></body>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
