// Edge Function 테스트 공용 — 가짜 fetch 설치 · 함수 모듈 로드(Deno.serve :8000) · 요청 · 단언
//   deno run -A tests/fn/ops.test.ts  /  tests/fn/remind.test.ts  (각 파일이 별도 프로세스 — Deno.serve 가 8000 포트를 하나씩 씀)
//   외부(GitHub · Supabase Management · Auth · REST · Slack)는 전부 가짜 — 운영 DB·토큰 접근 없음.
export const realFetch = globalThis.fetch;
export type Call = { url: string; method: string; body: string | null; form?: FormData };
export const calls: Call[] = [];
export const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });

/** 가짜 fetch 설치 — route(url, method, bodyText, init) 가 Response 를 돌려주면 그걸 쓰고, undefined 면 500 */
export function installFetch(route: (url: string, method: string, body: string | null, init: RequestInit | undefined) => Promise<Response | undefined> | Response | undefined) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method || 'GET';
    if (url.startsWith('http://127.0.0.1')) return realFetch(input, init);
    const bodyTxt = init?.body && typeof init.body === 'string' ? init.body : null;
    calls.push({ url, method, body: bodyTxt, form: init?.body instanceof FormData ? init.body : undefined });
    const r = await route(url, method, bodyTxt, init);
    return r ?? new Response('not mocked ' + url, { status: 500 });
  }) as typeof fetch;
}

/** 함수 모듈 로드 (상대 경로 — 저장소 어디서 실행해도 됨) 후 서버가 뜰 때까지 잠깐 대기 */
export async function loadFn(name: string) {
  await import(new URL(`../../supabase/functions/${name}/index.ts`, import.meta.url).href);
  await new Promise((r) => setTimeout(r, 300));
}

/** 함수 호출 */
export async function call(body: unknown, opts: { token?: string | null; path?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.token !== null) headers.authorization = 'Bearer ' + (opts.token ?? 'tok');   // null = Authorization 헤더 자체를 보내지 않음
  const r = await realFetch('http://127.0.0.1:8000/' + (opts.path || ''), { method: 'POST', headers, body: JSON.stringify(body ?? {}) });
  let j: any = null; try { j = await r.json(); } catch { j = null; }
  return { status: r.status, j };
}

let pass = 0, fail = 0; const fails: string[] = [];
export function ok(cond: unknown, label: string, extra?: unknown) {
  if (cond) { pass++; console.log('  ✓ ' + label + (extra !== undefined ? ' — ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 160) : '')); }
  else { fail++; fails.push(label); console.log('  ✗ ' + label + (extra !== undefined ? ' — ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 300) : '')); }
}
export function report(name: string) {
  console.log(`\n${name}: ${pass}/${pass + fail} 통과` + (fail ? ` · 실패 ${fail} — ${fails.join(' | ')}` : ''));
  Deno.exit(fail ? 1 : 0);
}
