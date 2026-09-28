import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRADE_COLUMNS,
  tradeCells,
  TERMINAL_POSITIONS_QUERY_KEY,
  TERMINAL_POSITIONS_PARAMS,
  TERMINAL_STORAGE_KEY,
  readStoredTerminalPage,
  writeStoredTerminalPage,
  clearStoredTerminalPage,
} from './terminalTrades.js';

// Setup mock browser storage for testing
const createMockStorage = () => {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, val) => map.set(key, String(val)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
  };
};

test('TERMINAL_POSITIONS query key and default parameters', () => {
  assert.deepEqual(TERMINAL_POSITIONS_QUERY_KEY, ['terminal-positions']);
  assert.equal(TERMINAL_POSITIONS_PARAMS.sort_by, 'position');
  assert.equal(TERMINAL_POSITIONS_PARAMS.sort_dir, 'desc');
  assert.equal(TERMINAL_STORAGE_KEY, 'rtx5:terminal-positions:v2');
});

test('readStoredTerminalPage and writeStoredTerminalPage persist and retrieve rows', () => {
  const originalSession = globalThis.sessionStorage;
  const originalLocal = globalThis.localStorage;

  globalThis.sessionStorage = createMockStorage();
  globalThis.localStorage = createMockStorage();

  try {
    // Initially empty
    assert.equal(readStoredTerminalPage(), undefined);

    const mockPage = {
      rows: [
        { position: 24345, login: 200001, symbol: 'BTCUSD', type: 'buy', volume: 1.0, priceOpen: 79_689.8 },
        { position: 24337, login: 200001, symbol: 'BTCUSD', type: 'buy', volume: 0.01, priceOpen: 79_689.8 },
      ],
      total: 2,
      hasMore: false,
    };

    writeStoredTerminalPage(mockPage, 'manager@broker-a');

    const restored = readStoredTerminalPage('manager@broker-a');
    assert.ok(restored);
    assert.equal(restored.rows.length, 2);
    assert.equal(restored.rows[0].position, 24345);
    assert.equal(restored.total, 2);
    assert.equal(restored.hasMore, false);
    assert.equal(readStoredTerminalPage('manager@broker-b'), undefined);
    assert.equal(globalThis.localStorage.getItem(TERMINAL_STORAGE_KEY), null);

    // Clear storage
    clearStoredTerminalPage();
    assert.equal(readStoredTerminalPage('manager@broker-a'), undefined);
  } finally {
    globalThis.sessionStorage = originalSession;
    globalThis.localStorage = originalLocal;
  }
});

test('terminal cache rejects old and incomplete trades and clears legacy local storage', () => {
  const originalSession = globalThis.sessionStorage;
  const originalLocal = globalThis.localStorage;
  globalThis.sessionStorage = createMockStorage();
  globalThis.localStorage = createMockStorage();
  try {
    globalThis.localStorage.setItem('rtx5:terminal-positions:v1', JSON.stringify({ rows: [{ position: 1 }] }));
    readStoredTerminalPage('manager@broker-a');
    assert.equal(globalThis.localStorage.getItem('rtx5:terminal-positions:v1'), null);

    writeStoredTerminalPage({ rows: [{ position: 1, login: 2, symbol: '', volume: 0, priceOpen: 0 }] }, 'manager@broker-a');
    assert.equal(readStoredTerminalPage('manager@broker-a'), undefined);

    globalThis.sessionStorage.setItem(TERMINAL_STORAGE_KEY, JSON.stringify({
      scope: 'manager@broker-a', timestamp: Date.now() - 61_000,
      rows: [{ position: 1, login: 2, symbol: 'EURUSD', volume: 1, priceOpen: 1.1 }],
    }));
    assert.equal(readStoredTerminalPage('manager@broker-a'), undefined);
  } finally {
    clearStoredTerminalPage();
    globalThis.sessionStorage = originalSession;
    globalThis.localStorage = originalLocal;
  }
});

test('tradeCells accurately maps row properties to column values', () => {
  assert.equal(TRADE_COLUMNS.length, 14);
  const row = {
    position: 24345,
    login: 200001,
    name: 'TEST TEST',
    email: 'TEST@TEST.COM',
    symbol: 'BTCUSD',
    type: 'buy',
    volume: 1.0,
    priceOpen: 79689.8,
    priceCurrent: 79965.21,
    priceSl: 0,
    priceTp: 0,
    swap: 0.0,
    profit: 550.49,
    comment: '',
  };

  const cells = tradeCells(row);
  assert.equal(cells.length, 14);
  assert.equal(cells[0], 24345); // Ticket
  assert.equal(cells[1], 200001); // Login
  assert.equal(cells[2], 'TEST TEST'); // Name
  assert.equal(cells[3], 'TEST@TEST.COM'); // Email
  assert.equal(cells[4], 'BTCUSD'); // Symbol
  assert.equal(cells[5], 'BUY'); // Action
  assert.equal(cells[6], '1.00'); // Lots
  assert.equal(cells[7], '79689.800000000'); // Open
  assert.equal(cells[8], '79965.210000000'); // Current
  assert.equal(cells[9], 0); // S/L
  assert.equal(cells[10], 0); // T/P
  assert.equal(cells[11], '0.00'); // Storage
  assert.equal(cells[12], '550.49'); // Profit
  assert.equal(cells[13], '—'); // Comment
});

test('open and current prices display exactly nine decimals without floating point tails', () => {
  const row = {
    priceOpen: 4177.820000000001,
    priceCurrent: 82970.76999999999,
    priceSl: 1.23,
    priceTp: 2.345,
  };
  const cells = tradeCells(row);

  assert.equal(cells[7], '4177.820000000');
  assert.equal(cells[8], '82970.770000000');
  assert.equal(cells[9], 1.23);
  assert.equal(cells[10], 2.345);
  assert.equal(row.priceOpen, 4177.820000000001);
  assert.equal(row.priceCurrent, 82970.76999999999);

  const precise = tradeCells({ priceOpen: 83827.275, priceCurrent: '1.123456789' });
  assert.equal(precise[7], '83827.275000000');
  assert.equal(precise[8], '1.123456789');
  const missing = tradeCells({ priceOpen: null, priceCurrent: 'invalid' });
  assert.equal(missing[7], '—');
  assert.equal(missing[8], '—');
});
