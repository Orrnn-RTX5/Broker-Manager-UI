import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Keep the real metrics service, endpoint builders and socket lifecycle. Only
// the HTTP transport and WebSocket are replaced, so a lost prefix is observable.
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./accountMetricsSync.js', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'browser',
  define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'metrics-routing-transport', setup(builder) {
    builder.onResolve({ filter: /^\.\/apiClient$/ }, ({ path }) => ({ path, namespace: 'transport' }));
    builder.onLoad({ filter: /.*/, namespace: 'transport' }, () => ({ loader: 'js', contents:
      'export default { post: (path, body) => globalThis.__metricsRoutingTest.post(path, body) };',
    }));
  } }],
});
const service = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const originalSocket = globalThis.WebSocket;
afterEach(() => {
  service.stopAccountMetrics();
  globalThis.WebSocket = originalSocket;
  delete globalThis.__RTX_RUNTIME_CONFIG__;
  delete globalThis.__metricsRoutingTest;
});

for (const { broker, origin, strip, managerHost, expectedUrl } of [
  { broker: 'achiever', origin: 'https://service.achiever.orrnn.com', strip: 'false', expectedUrl: 'wss://service.achiever.orrnn.com/manager/OnAccountMetrics' },
  { broker: 'orrnn', origin: 'https://service.orrnn.com', strip: 'false', expectedUrl: 'wss://service.orrnn.com/manager/OnAccountMetrics' },
  { broker: 'direct', origin: 'https://api.direct.example', strip: 'true', expectedUrl: 'wss://api.direct.example/OnAccountMetrics' },
  { broker: 'custom-host', origin: 'https://api.new-broker.example', managerHost: 'https://stream.new-broker.example:8443', strip: 'false', expectedUrl: 'wss://stream.new-broker.example:8443/manager/OnAccountMetrics' },
  { broker: 'direct-port', origin: 'http://127.0.0.1:8091', strip: 'false', expectedUrl: 'ws://127.0.0.1:8091/OnAccountMetrics' },
]) {
  test(`account metrics honors ${broker} routing and requests a canonical scoped ticket`, { timeout: 2500 }, async () => {
    const requests = [], sockets = [];
    let connected;
    const socketReady = new Promise(resolve => { connected = resolve; });
    globalThis.__RTX_RUNTIME_CONFIG__ = {
      CONFIG_SOURCE: 'deployment', BACKEND_TARGET: 'web', BROKER_ID: broker,
      API_HOST: origin, MANAGER_PROXY_STRIP_MANAGER_PREFIX: strip,
      ...(managerHost ? { MANAGER_WS_HOST: managerHost } : {}),
      // A position-only override must not reroute account metrics.
      POSITION_UPDATES_WS_PATH: '/custom/positions',
    };
    globalThis.__metricsRoutingTest = { post: async (url, body) => {
      requests.push({ url, body });
      if (body.path !== '/OnAccountMetrics' || body.logins.length === 0) {
        throw new Error('Invalid websocket path or login scope');
      }
      return { ticket: 'scoped-one-use' };
    } };
    globalThis.WebSocket = class {
      constructor(url) { this.url = url; this.readyState = 0; sockets.push(this); connected(); }
      close() { this.readyState = 3; }
    };
    service.watchAccountMetrics(1001);
    service.watchAccountMetrics(1002);
    service.watchAccountMetrics(1001);
    await socketReady;
    assert.deepEqual(requests, [{ url: '/api/v1/manager/ws-ticket', body: { path: '/OnAccountMetrics', logins: [1001, 1002] } }]);
    assert.equal(sockets.length, 1);
    assert.equal(sockets[0].url, `${expectedUrl}?ticket=scoped-one-use`);
    service.stopAccountMetrics();
    assert.equal(sockets[0].readyState, 3);
  });
}
