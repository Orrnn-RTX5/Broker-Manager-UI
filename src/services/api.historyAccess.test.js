import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const runtime = { calls: [] };
globalThis.__historyAccessTest = runtime;
const bundle = await build({
  stdin: { contents: "export { getPositionHistory } from './api.js';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'js' },
  bundle: true, write: false, format: 'esm', platform: 'browser', define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'history-network', setup(builder) {
    builder.onResolve({ filter: /\/(managerFetch|authRequest|apiClient)(\.js)?$/ }, args => ({ path: args.path, namespace: 'history-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'history-test' }, args => ({ loader: 'js', contents:
      args.path.includes('managerFetch') ? 'export const fetchManagerApi = (...args) => globalThis.__historyAccessTest.manager(...args);' :
      args.path.includes('authRequest') ? 'export const sendWithSessionRefresh = () => globalThis.__historyAccessTest.fallback();' :
      'export default { get: (...args) => globalThis.__historyAccessTest.legacy(...args) };',
    }));
  } }],
});
const { getPositionHistory } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
beforeEach(() => {
  runtime.calls = [];
  runtime.fallback = () => { runtime.calls.push('v2'); return response([], 200); };
  runtime.legacy = () => { runtime.calls.push('legacy'); return []; };
});
after(() => { delete globalThis.__historyAccessTest; });

test('history account-scope denial is terminal and cannot try another API', async () => {
  runtime.manager = () => response({ code: 'MT_RET_ERR_NOTFOUND', message: 'Account not found' }, 404);
  await assert.rejects(getPositionHistory('200001'), error => error.status === 404 && error.code === 'MT_RET_ERR_NOTFOUND');
  assert.deepEqual(runtime.calls, []);
});

test('history permission denial is terminal', async () => {
  runtime.manager = () => response({ code: 'MT_RET_ERR_PERMISSIONS', message: 'Access denied' }, 403);
  await assert.rejects(getPositionHistory('200001'), error => error.status === 403);
  assert.deepEqual(runtime.calls, []);
});

test('authorized empty history stays empty without another endpoint', async () => {
  runtime.manager = () => response([]);
  assert.deepEqual(await getPositionHistory('200035'), []);
  assert.deepEqual(runtime.calls, []);
});

test('missing legacy route retains compatibility fallback', async () => {
  runtime.manager = () => new Response('404 page not found', { status: 404 });
  assert.deepEqual(await getPositionHistory('200035'), []);
  assert.deepEqual(runtime.calls, ['v2']);
});
