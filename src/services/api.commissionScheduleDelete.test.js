import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// CommissionScheduleDelete mutates state, so it must be sent as a POST with a
// JSON body. The backend accepts POST /CommissionScheduleDelete with
// {"schedule_id": N} (legacy_mutations.go POST bridge); a GET would put the id
// in the query string and is the deprecated mutating-GET path.
const runtime = { calls: [] };
globalThis.__commissionScheduleDeleteTest = runtime;
const bundle = await build({
  stdin: { contents: "export { commissionScheduleDelete } from './api.js';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'js' },
  bundle: true, write: false, format: 'esm', platform: 'browser', define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'commission-schedule-delete-network', setup(builder) {
    builder.onResolve({ filter: /\/apiClient(\.js)?$/ }, args => ({ path: args.path, namespace: 'commission-delete-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'commission-delete-test' }, () => ({ loader: 'js', contents:
      "export default {" +
      " get: (...args) => globalThis.__commissionScheduleDeleteTest.record('GET', args)," +
      " post: (...args) => globalThis.__commissionScheduleDeleteTest.record('POST', args) };",
    }));
  } }],
});
const { commissionScheduleDelete } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

runtime.record = (method, [endpoint, body]) => {
  runtime.calls.push({ method, endpoint, body });
  return Promise.resolve({ success: true });
};

beforeEach(() => {
  runtime.calls = [];
});
after(() => { delete globalThis.__commissionScheduleDeleteTest; });

test('commissionScheduleDelete POSTs the schedule id as a JSON body, never as a GET query', async () => {
  await commissionScheduleDelete(7);
  assert.deepEqual(runtime.calls, [
    { method: 'POST', endpoint: '/CommissionScheduleDelete', body: { schedule_id: 7 } },
  ]);
  assert.equal(runtime.calls.some(call => call.method === 'GET'), false);
  assert.equal(runtime.calls[0].endpoint.includes('?'), false);
});
