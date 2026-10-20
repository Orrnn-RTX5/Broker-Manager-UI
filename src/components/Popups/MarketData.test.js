import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Regression pins for the MarketData lint fixes (manager-cand-m3): the
// Ticks tab crashed with ReferenceError (remoteHistoryMap state missing)
// and dead tick-fetch plumbing was removed. No DOM harness here, so these
// pin the REAL source text (repo style, cf. AccountTradeTab.test.js).
const src = readFileSync(fileURLToPath(new URL('./MarketData.jsx', import.meta.url)), 'utf8');

test('remote history state is declared and consumed (no ReferenceError)', () => {
  assert.ok(src.includes('const [remoteHistoryMap, setRemoteHistoryMap] = useState({});'), 'remoteHistoryMap state must be declared');
  assert.ok(src.includes('setRemoteHistoryMap((prev)'), 'effect must store fetched history');
  assert.ok(src.includes('remoteHistoryMap['), 'render must read stored history');
});

test('removed dead tick plumbing stays removed', () => {
  for (const name of ['ensureSymbolTickSeries', 'subscribeSymbolTicks', 'fetchRemoteTickSeries', 'handleChartCanvasRef', 'remoteTickCache', 'inFlightTickRequests', 'unsupportedTickSymbols', 'isLikelyUnsupportedTickSymbol', 'REMOTE_TICK_FETCH_LIMIT']) {
    assert.ok(!src.includes(name), `dead identifier ${name} must not reappear`);
  }
  assert.ok(src.includes('parseRemoteTickHistory'), 'live effect still parses remote history');
});
