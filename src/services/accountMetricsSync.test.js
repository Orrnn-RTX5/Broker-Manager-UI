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

test('F1 & F2: real PositionSyncClient WS drop and stopAccountMetrics invalidate live metrics so popup figures become "\u2014"', async () => {
  const sockets = [];
  const reconnectCallbacks = [];
  let ticketSeq = 0;
  const OriginalWebSocket = globalThis.WebSocket;
  const originalSetTimeout = globalThis.setTimeout;

  class FakeMetricsWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 1;
      sockets.push(this);
    }
    close() {
      this.readyState = 3;
    }
  }

  globalThis.WebSocket = FakeMetricsWebSocket;
  globalThis.__realMetricsTest = {
    nextTicket: () => ({ data: { ws_ticket: `metrics-ticket-${++ticketSeq}` } }),
  };

  try {
    const bundle = await build({
      stdin: {
        contents: [
          "export { watchAccountMetrics, stopAccountMetrics } from './accountMetricsSync.js';",
          "export { liveTradingState } from './liveTradingState.js';",
          "export { deriveAccountFinanceSummary } from '../components/Popups/accountFinanceOps.js';",
        ].join('\n'),
        resolveDir: fileURLToPath(new URL('.', import.meta.url)),
        sourcefile: 'realMetricsEntry.js',
      },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      plugins: [{
        name: 'metrics-real-core-mock-transport',
        setup(builder) {
          builder.onResolve({ filter: /(apiClient|endpoints)$/ }, ({ path }) => ({ path, namespace: 'mock' }));
          builder.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({
            loader: 'js',
            contents: path.endsWith('apiClient')
              ? 'export default { post: () => Promise.resolve(globalThis.__realMetricsTest.nextTicket()) };'
              : 'export const buildAccountMetricsWsUrl = (ticket) => "wss://broker.test/OnAccountMetrics?ticket=" + ticket; export const ENDPOINTS = {};',
          }));
        },
      }],
    });

    const mod = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
    const storedRow = {
      Balance: 899900,
      Credit: 50,
      Equity: 899900,
      Margin: 506631.72,
      MarginFree: 393268.28,
      MarginLevel: 177.62,
    };

    const unwatch = mod.watchAccountMetrics(710001);
    await new Promise((resolve) => originalSetTimeout(resolve, 80));
    assert.equal(sockets.length, 1);

    // Deliver live metrics_update frame over the real PositionSyncClient socket
    sockets[0].onmessage({
      data: JSON.stringify({
        type: 'metrics_update',
        publication_token: '18000000000000000050',
        data: {
          login: 710001,
          balance: 899900,
          credit: 50,
          equity: 950030.02,
          used_margin: 506631.72,
          free_margin: 443398.3,
          margin_level: 187.52,
        },
      }),
    });

    const liveBeforeDrop = mod.liveTradingState.account(710001);
    assert.equal(liveBeforeDrop?.equity, 950030.02);
    const summaryBeforeDrop = mod.deriveAccountFinanceSummary({
      liveMetrics: liveBeforeDrop,
      accountData: storedRow,
      rowData: storedRow,
    });
    assert.equal(summaryBeforeDrop.equityText, '950,030.02');
    assert.equal(summaryBeforeDrop.marginText, '506,631.72');
    assert.equal(summaryBeforeDrop.freeMarginText, '443,398.30');
    assert.equal(summaryBeforeDrop.marginLevelText, '187.52');

    // F1: Trigger real socket.onclose() -> PositionSyncClient emits disconnected -> invalidateMetrics -> '\u2014'
    sockets[0].onclose();
    assert.equal(mod.liveTradingState.account(710001), undefined);
    const summaryAfterDrop = mod.deriveAccountFinanceSummary({
      liveMetrics: mod.liveTradingState.account(710001),
      accountData: storedRow,
      rowData: storedRow,
    });
    assert.equal(summaryAfterDrop.equityText, '\u2014');
    assert.equal(summaryAfterDrop.marginText, '\u2014');
    assert.equal(summaryAfterDrop.freeMarginText, '\u2014');
    assert.equal(summaryAfterDrop.marginLevelText, '\u2014');
    assert.equal(summaryAfterDrop.equitySpaceText, '\u2014');
    assert.equal(summaryAfterDrop.marginSpaceText, '\u2014');
    assert.equal(summaryAfterDrop.freeMarginSpaceText, '\u2014');
    assert.equal(summaryAfterDrop.marginLevelSpaceText, '\u2014');
    assert.equal(summaryAfterDrop.balanceText, '899,900.00');
    assert.equal(summaryAfterDrop.creditText, '50.00');

    // F2: Re-ingest a newer live frame, then call stopAccountMetrics() -> batch is invalidated back to '\u2014'
    mod.liveTradingState.ingest({
      type: 'metrics_update',
      publication_token: '18000000000000000051',
      data: {
        login: 710001,
        balance: 899900,
        credit: 50,
        equity: 950030.02,
        used_margin: 506631.72,
        free_margin: 443398.3,
        margin_level: 187.52,
      },
    });
    assert.equal(mod.liveTradingState.account(710001)?.equity, 950030.02);
    mod.stopAccountMetrics();
    assert.equal(mod.liveTradingState.account(710001), undefined);
    const summaryAfterStop = mod.deriveAccountFinanceSummary({
      liveMetrics: mod.liveTradingState.account(710001),
      accountData: storedRow,
      rowData: storedRow,
    });
    assert.equal(summaryAfterStop.equityText, '\u2014');
    assert.equal(summaryAfterStop.freeMarginText, '\u2014');
    unwatch();
    mod.stopAccountMetrics();
  } finally {
    globalThis.WebSocket = OriginalWebSocket;
    delete globalThis.__realMetricsTest;
    void reconnectCallbacks;
  }
});

test('r4: real accountMetricsSync reconnection re-accepts equal-token snapshot after WS drop and blocks pre-mutation token', async () => {
  const sockets = [];
  const reconnectCallbacks = [];
  let ticketSeq = 0;
  const OriginalWebSocket = globalThis.WebSocket;
  const originalSetTimeout = globalThis.setTimeout;

  class FakeMetricsWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 1;
      sockets.push(this);
    }
    close() {
      this.readyState = 3;
      if (typeof this.onclose === 'function') {
        this.onclose();
      }
    }
  }

  globalThis.WebSocket = FakeMetricsWebSocket;
  globalThis.__realMetricsTest = {
    nextTicket: () => ({ data: { ws_ticket: 'metrics-ticket-' + (++ticketSeq) } }),
  };

  globalThis.setTimeout = (callback, delay, ...args) => {
    if (delay >= 1000) {
      reconnectCallbacks.push(callback);
      return reconnectCallbacks.length;
    }
    return originalSetTimeout(callback, delay, ...args);
  };

  let mod;
  try {
    const bundle = await build({
      stdin: {
        contents: [
          "export { watchAccountMetrics, stopAccountMetrics } from './accountMetricsSync.js';",
          "export { liveTradingState } from './liveTradingState.js';",
          "export { deriveAccountFinanceSummary } from '../components/Popups/accountFinanceOps.js';",
        ].join('\n'),
        resolveDir: fileURLToPath(new URL('.', import.meta.url)),
        sourcefile: 'realMetricsEntry.js',
      },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      plugins: [{
        name: 'metrics-real-core-mock-transport',
        setup(builder) {
          builder.onResolve({ filter: /(apiClient|endpoints)$/ }, ({ path }) => ({ path, namespace: 'mock' }));
          builder.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({
            loader: 'js',
            contents: path.endsWith('apiClient')
              ? 'export default { post: () => Promise.resolve(globalThis.__realMetricsTest.nextTicket()) };'
              : 'export const buildAccountMetricsWsUrl = (ticket) => "wss://broker.test/OnAccountMetrics?ticket=" + ticket; export const ENDPOINTS = {};',
          }));
        },
      }],
    });

    mod = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
    mod.stopAccountMetrics();
    mod.liveTradingState.reset();

    // (a) Flat account: drop, reconnect, same token -> shown again (with observable 1000 -> 1001)
    const unwatchFlat = mod.watchAccountMetrics(720001);
    await new Promise((resolve) => originalSetTimeout(resolve, 80));
    assert.equal(sockets.length, 1);
    const tokenT = '18000000000000000010';

    sockets[0].onmessage({
      data: JSON.stringify({
        type: 'metrics_update',
        publication_token: tokenT,
        data: { login: 720001, balance: 1000, equity: 1000, free_margin: 1000 },
      }),
    });
    assert.equal(mod.liveTradingState.account(720001)?.equity, 1000);

    sockets[0].onclose();
    assert.equal(mod.liveTradingState.account(720001), undefined, 'account should be undefined after socket drop');

    assert.ok(reconnectCallbacks.length > 0, 'reconnect timer should be scheduled');
    const reconnect1 = reconnectCallbacks.shift();
    reconnect1();
    await new Promise((resolve) => originalSetTimeout(resolve, 20));
    assert.equal(sockets.length, 2, 'second socket should be created on reconnect');

    sockets[1].onmessage({
      data: JSON.stringify({
        type: 'metrics_update',
        publication_token: tokenT,
        data: { login: 720001, balance: 1000, equity: 1001, free_margin: 1001 },
      }),
    });
    assert.equal(mod.liveTradingState.account(720001)?.equity, 1001, 'flat account re-accepts equal token with observable new value 1001');

    // (b) Open-position account: drop, reconnect, same token -> shown, then newer token -> updated
    const unwatchOpen = mod.watchAccountMetrics(720002);
    await new Promise((resolve) => originalSetTimeout(resolve, 80));
    const activeSocket = sockets[sockets.length - 1];
    const tokenOpenT = '18000000000000000020';
    activeSocket.onmessage({
      data: JSON.stringify({
        type: 'metrics_update',
        publication_token: tokenOpenT,
        data: { login: 720002, balance: 5000, equity: 5100, free_margin: 4500 },
      }),
    });
    assert.equal(mod.liveTradingState.account(720002)?.equity, 5100);

    activeSocket.onclose();
    assert.equal(mod.liveTradingState.account(720002), undefined);

    assert.ok(reconnectCallbacks.length > 0);
    const reconnect2 = reconnectCallbacks.shift();
    reconnect2();
    await new Promise((resolve) => originalSetTimeout(resolve, 20));
    const reconnectedSocket = sockets[sockets.length - 1];

    reconnectedSocket.onmessage({
      data: JSON.stringify({
        type: 'metrics_update',
        publication_token: tokenOpenT,
        data: { login: 720002, balance: 5000, equity: 5105, free_margin: 4505 },
      }),
    });
    assert.equal(mod.liveTradingState.account(720002)?.equity, 5105, 'open-position account re-accepts equal token with observable new value 5105');

    const tokenOpenNext = '18000000000000000021';
    reconnectedSocket.onmessage({
      data: JSON.stringify({
        type: 'metrics_update',
        publication_token: tokenOpenNext,
        data: { login: 720002, balance: 5000, equity: 5250, free_margin: 4650 },
      }),
    });
    assert.equal(mod.liveTradingState.account(720002)?.equity, 5250, 'open-position account updates with newer token T+1');

    // (c) Older token after reconnect is dropped
    const tokenOlder = '18000000000000000019';
    reconnectedSocket.onmessage({
      data: JSON.stringify({
        type: 'metrics_update',
        publication_token: tokenOlder,
        data: { login: 720002, balance: 5000, equity: 4900, free_margin: 4300 },
      }),
    });
    assert.equal(mod.liveTradingState.account(720002)?.equity, 5250, 'older token T-1 must be dropped');

    // (d) Equal token on an available row is a no-op
    let notifications = 0;
    const initialRevision = mod.liveTradingState.snapshot();
    const unsub = mod.liveTradingState.subscribe(() => { notifications += 1; });
    reconnectedSocket.onmessage({
      data: JSON.stringify({
        type: 'metrics_update',
        publication_token: tokenOpenNext,
        data: { login: 720002, balance: 5000, equity: 5999, free_margin: 4999 },
      }),
    });
    unsub();
    assert.equal(notifications, 0, 'equal token on available row must not notify');
    assert.equal(mod.liveTradingState.snapshot(), initialRevision, 'equal token on available row must not bump revision');
    assert.equal(mod.liveTradingState.account(720002)?.equity, 5250, 'equal token on available row must not modify row');

    // (e) Drop, then mutation (state_changed accounts over socket), reconnect, same token -> still "—", newer token -> shown
    const unwatchMut = mod.watchAccountMetrics(720003);
    await new Promise((resolve) => originalSetTimeout(resolve, 80));
    const mutSocket = sockets[sockets.length - 1];
    const tokenMutT = '18000000000000000030';
    mutSocket.onmessage({
      data: JSON.stringify({
        type: 'metrics_update',
        publication_token: tokenMutT,
        data: { login: 720003, balance: 3000, equity: 3000, free_margin: 3000 },
      }),
    });
    assert.equal(mod.liveTradingState.account(720003)?.equity, 3000);

    mutSocket.onclose();
    assert.equal(mod.liveTradingState.account(720003), undefined);

    // Mutation occurs while disconnected
    mod.liveTradingState.ingest({
      type: 'state_changed',
      data: { entity: 'accounts', account_login: 720003 },
    });
    assert.equal(mod.liveTradingState.account(720003), undefined);

    assert.ok(reconnectCallbacks.length > 0);
    const reconnect3 = reconnectCallbacks.shift();
    reconnect3();
    await new Promise((resolve) => originalSetTimeout(resolve, 20));
    const mutReconnectedSocket = sockets[sockets.length - 1];

    // Same token after mutation must stay undefined
    mutReconnectedSocket.onmessage({
      data: JSON.stringify({
        type: 'metrics_update',
        publication_token: tokenMutT,
        data: { login: 720003, balance: 3000, equity: 3001, free_margin: 3001 },
      }),
    });
    assert.equal(mod.liveTradingState.account(720003), undefined, 'same token after mutation must stay undefined on reconnect');

    // Newer token restores
    const tokenMutNext = '18000000000000000031';
    mutReconnectedSocket.onmessage({
      data: JSON.stringify({
        type: 'metrics_update',
        publication_token: tokenMutNext,
        data: { login: 720003, balance: 3500, equity: 3500, free_margin: 3500 },
      }),
    });
    assert.equal(mod.liveTradingState.account(720003)?.equity, 3500, 'newer token T+1 after mutation restores metrics');

    unwatchFlat();
    unwatchOpen();
    unwatchMut();
    mod.stopAccountMetrics();
  } finally {
    try {
      mod?.stopAccountMetrics();
    } catch {}
    globalThis.WebSocket = OriginalWebSocket;
    globalThis.setTimeout = originalSetTimeout;
    delete globalThis.__realMetricsTest;
  }
});
