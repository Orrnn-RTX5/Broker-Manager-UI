import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Exercise the real service, URL builders and connection lifecycle; replace
// only the HTTP transport, WebSocket and unrelated position-cache operations.
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('./positionSync.js', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'browser',
  define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'position-routing-transport', setup(builder) {
    builder.onResolve({ filter: /^\.\/(apiClient|api\.js)$/ }, ({ path }) => ({ path, namespace: 'transport' }));
    builder.onLoad({ filter: /.*/, namespace: 'transport' }, ({ path }) => ({ loader: 'js', contents:
      path === './apiClient'
        ? 'export default { post: (path, body) => globalThis.__positionRoutingTest.post(path, body) };'
        : 'export const applyPositionsSnapshot = () => {}; export const fetchAllPositionsDataset = async () => [];',
    }));
  } }],
});
const service = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const originalSocket = globalThis.WebSocket;
afterEach(() => {
  service.stopPositionSync();
  globalThis.WebSocket = originalSocket;
  delete globalThis.__RTX_RUNTIME_CONFIG__;
  delete globalThis.__positionRoutingTest;
});

for (const { broker, origin, path, strip, expectedPath } of [
  { broker: 'achiever', origin: 'https://service.achiever.orrnn.com', path: '/manager/OnPositionUpdate', strip: 'false', expectedPath: '/manager/OnPositionUpdate' },
  { broker: 'orrnn', origin: 'https://service.orrnn.com', path: '/OnPositionUpdate', strip: 'true', expectedPath: '/OnPositionUpdate' },
  { broker: 'custom', origin: 'https://api.new-broker.example:8443', path: '/custom/positions', strip: 'false', expectedPath: '/custom/positions' },
  { broker: 'proxy-default', origin: 'https://api.proxy-broker.example', strip: 'false', expectedPath: '/manager/OnPositionUpdate' },
  { broker: 'direct-default', origin: 'https://api.direct-broker.example', strip: 'true', expectedPath: '/OnPositionUpdate' },
]) {
  test(`position tickets use the canonical route while ${broker} retains its external URL`, async () => {
    const requests = [], sockets = [];
    globalThis.__RTX_RUNTIME_CONFIG__ = {
      CONFIG_SOURCE: 'deployment', BACKEND_TARGET: 'web', BROKER_ID: broker,
      API_HOST: origin, MANAGER_PROXY_STRIP_MANAGER_PREFIX: strip,
      ...(path ? { POSITION_UPDATES_WS_PATH: path } : {}),
    };
    globalThis.__positionRoutingTest = { post: async (url, body) => {
      requests.push({ url, body });
      // The backend accepts its exact route, never an external proxy prefix.
      if (body.path !== '/OnPositionUpdate') throw new Error('Invalid websocket path or login scope');
      return { ticket: 'one-use' };
    } };
    globalThis.WebSocket = class {
      constructor(url) { this.url = url; this.readyState = 0; sockets.push(this); }
      close() { this.readyState = 3; }
    };
    service.startPositionSync();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(requests, [{ url: '/api/v1/manager/ws-ticket', body: { path: '/OnPositionUpdate' } }]);
    assert.equal(sockets.length, 1);
    assert.equal(sockets[0].url, `${origin.replace(/^https:/, 'wss:')}${expectedPath}?ticket=one-use`);
  });
}
