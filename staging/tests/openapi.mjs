// tests/openapi.mjs — ㊿+203 저장소 맨 위 openapi.json 만들기·확인 (js/apispec.js 한곳에서)
//   node tests/openapi.mjs          → openapi.json 을 다시 씀
//   node tests/openapi.mjs --check  → 지금 apispec.js 로 만든 것과 같은지만(다르면 종료 코드 1) · tests/check.mjs 도 같은 함수를 씀
//   · GitHub Pages 가 https://svc.genians.co.kr/openapi.json 으로 내보냄 → Swagger Editor · Postman «URL 로 가져오기»
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function openapiText(root = ROOT) {
  const core = fs.readFileSync(path.join(root, 'js/core.js'), 'utf8');
  const sb = (/export var SB_URL='(https:\/\/[a-z0-9]+\.supabase\.co)';/.exec(core) || [])[1];
  if (!sb) throw new Error('js/core.js 에서 SB_URL 을 못 찾음');
  const m = await import(pathToFileURL(path.join(root, 'js/apispec.js')).href);
  return JSON.stringify(m.buildOpenApi(sb + '/functions/v1/export'), null, 2) + '\n';
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const want = await openapiText(), p = path.join(ROOT, 'openapi.json'), have = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  if (process.argv.includes('--check')) { console.log(want === have ? '✓ openapi.json 최신' : '✗ openapi.json 이 js/apispec.js 와 다름 — node tests/openapi.mjs 실행'); process.exit(want === have ? 0 : 1); }
  if (want !== have) fs.writeFileSync(p, want);
  console.log('openapi.json ' + (want !== have ? '다시 씀' : '그대로') + ' · ' + Object.keys(JSON.parse(want).paths).length + '개 경로');
}
