import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';

test('visible accounts share scoped one-time-ticket sockets, reference counts, and teardown', async () => {
  const requests = [], connections = [];
  globalThis.__metricsTest = { requests, connections };
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('./accountMetricsSync.js', import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'browser',
    plugins: [{ name: 'metrics-transport', setup(builder) {
      builder.onResolve({ filter: /(apiClient|endpoints|positionSyncCore)$/ }, ({ path }) => ({ path, namespace: 'mock' }));
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ loader: 'js', contents:
        path.endsWith('apiClient') ? 'export default {post: (path, body) => {globalThis.__metricsTest.requests.push({path,body}); return Promise.resolve({ticket:"one-use"});}};'
          : path.endsWith('endpoints') ? 'export const buildAccountMetricsWsUrl = ticket => "wss://broker.test/OnAccountMetrics?ticket="+ticket;'
            : 'export class PositionSyncClient { constructor(options){this.options=options;globalThis.__metricsTest.connections.push(this);} subscribe(){} start(){this.options.requestTicket();} stop(){this.stopped=true;} }',
      }));
    } }],
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  const releaseA = module.watchAccountMetrics(1001), releaseB = module.watchAccountMetrics(1002), releaseDuplicate = module.watchAccountMetrics(1001);
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(connections.length, 1);
  assert.deepEqual(requests[0].body, { path: '/OnAccountMetrics', logins: [1001,1002] });
  assert.equal(connections[0].options.buildUrl('one-use'), 'wss://broker.test/OnAccountMetrics?ticket=one-use');
  releaseDuplicate(); await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(connections.length, 1);
  releaseA(); releaseB(); await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(connections[0].stopped, true);
  module.stopAccountMetrics(); delete globalThis.__metricsTest;
});
