import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAvailableSymbolNames, normalizeAvailableSymbolNames } from './symbolCatalogue.js';

const originalFetch = globalThis.fetch;
const originalRuntimeConfig = globalThis.__RTX_RUNTIME_CONFIG__;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalRuntimeConfig === undefined) delete globalThis.__RTX_RUNTIME_CONFIG__;
  else globalThis.__RTX_RUNTIME_CONFIG__ = originalRuntimeConfig;
});

test('available catalogue includes both advertised names and status-only names without duplicates', () => {
  assert.deepEqual(normalizeAvailableSymbolNames({
    available_symbols: [' EURUSD ', 'GBPUSD', 'EURUSD'],
    symbol_status: [{ symbol: 'EURUSD' }, { symbol: 'USDJPY' }, { symbol: 'EURUSDpro' }],
  }), [
    { symbol: 'EURUSD' }, { symbol: 'GBPUSD' }, { symbol: 'USDJPY' }, { symbol: 'EURUSDpro' },
  ]);
});

test('available catalogue keeps names only and never turns feed properties into management settings', () => {
  assert.deepEqual(normalizeAvailableSymbolNames({
    available_symbols: [{ Symbol: 'BTCUSD', digits: 2, enabled: true, category: 'Crypto' }],
    symbol_status: [{ symbol: 'ETHUSD', bid: 100, ask: 101, has_data: true }],
  }), [{ symbol: 'BTCUSD' }, { symbol: 'ETHUSD' }]);
});

test('available catalogue supports either list and ignores malformed names', () => {
  assert.deepEqual(normalizeAvailableSymbolNames({
    symbol_status: [null, '', 123, {}, { symbol: {} }, { Name: 'usdJPY' }, { symbol_name: 'EURUSD' }],
  }), [{ symbol: 'usdJPY' }, { symbol: 'EURUSD' }]);
  assert.deepEqual(normalizeAvailableSymbolNames({ available_symbols: [] }), []);
});

test('invalid status payloads fail instead of silently reporting an empty complete catalogue', () => {
  for (const status of [null, [], 'invalid', {}, { error: 'unavailable' }, { available_symbols: {} },
    { available_symbols: [], symbol_status: null }]) {
    assert.throws(() => normalizeAvailableSymbolNames(status), /Invalid available symbol catalogue/);
  }
});

test('available catalogue reads the configured broker status URL with the supplied signal', async () => {
  globalThis.__RTX_RUNTIME_CONFIG__ = { FEED_STATUS_URL: 'https://broker.example/ws/feed/status' };
  const controller = new AbortController();
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://broker.example/ws/feed/status');
    assert.equal(options.method, 'GET');
    assert.equal(options.signal, controller.signal);
    assert.deepEqual(options.headers, { accept: 'application/json' });
    return Response.json({ available_symbols: ['EURUSD'], symbol_status: [{ symbol: 'USDJPY' }] });
  };
  assert.deepEqual(await fetchAvailableSymbolNames({ signal: controller.signal }), [
    { symbol: 'EURUSD' }, { symbol: 'USDJPY' },
  ]);
});

test('available catalogue preserves HTTP, parse, and abort failures for the caller', async () => {
  globalThis.__RTX_RUNTIME_CONFIG__ = { FEED_STATUS_URL: 'https://broker.example/ws/feed/status' };
  globalThis.fetch = async () => new Response('', { status: 503 });
  await assert.rejects(fetchAvailableSymbolNames(), /HTTP 503/);
  globalThis.fetch = async () => new Response('not json');
  await assert.rejects(fetchAvailableSymbolNames(), SyntaxError);
  const controller = new AbortController();
  controller.abort();
  globalThis.fetch = async (_url, { signal }) => signal.throwIfAborted();
  await assert.rejects(fetchAvailableSymbolNames({ signal: controller.signal }), { name: 'AbortError' });
});
