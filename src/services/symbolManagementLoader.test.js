import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { loadSymbolManagement } from './symbolManagementLoader.js';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const tick = () => new Promise(resolve => setImmediate(resolve));

test('all 701 available symbols publish before a slow five-symbol manager list', async () => {
  const names = deferred();
  const available = Array.from({ length: 701 }, (_, i) => `S${String(i).padStart(3, '0')}`);
  const configured = available.slice(0, 5);
  const progress = [];
  const result = loadSymbolManagement({
    getNames: () => names.promise,
    getAvailableNames: async () => available.concat(available[0]),
    getCategories: async () => [],
    getCategorySymbols: async () => [],
    getParams: async batch => batch.filter(symbol => configured.includes(symbol)).map(symbol => ({ symbol, digits: 5, enabled: true })),
    onProgress: data => progress.push(data),
  });
  await tick();
  assert.equal(progress.at(-1).symbols.length, 701);
  assert.ok(progress.at(-1).symbols.every(row => row.__managementFeedOnly && row.enabled === undefined));
  names.resolve(configured);
  const data = await result;
  assert.equal(data.symbols.length, 701);
  assert.equal(data.symbols.filter(row => !row.__managementPartial).length, 5);
  assert.ok(data.symbols.slice(5).every(row => row.__managementFeedOnly && row.symbolType === undefined && row.enabled === undefined));
  assert.equal(data.error, '');
});

test('category-only derived instruments are included and fetched separately from feed-only names', async () => {
  const calls = [];
  const data = await loadSymbolManagement({
    getNames: async () => ['EURUSD'],
    getAvailableNames: async () => ['EURUSD', 'AAA-FEED'],
    getCategories: async () => [{ name: 'Derived' }],
    getCategorySymbols: async () => [{ symbol: 'EURUSDpro', symbolType: 'derived', enabled: false }],
    getParams: async batch => {
      calls.push(batch);
      if (batch.includes('AAA-FEED')) throw Error('Unknown symbol');
      return batch.map(symbol => ({ symbol, digits: 5 }));
    },
  });
  assert.deepEqual(data.symbols.map(row => row.symbol), ['AAA-FEED', 'EURUSD', 'EURUSDpro']);
  const derived = data.symbols.find(row => row.symbol === 'EURUSDpro');
  assert.equal(derived.symbolType, 'derived');
  assert.equal(derived.enabled, false);
  assert.equal(derived.__managementPartial, false);
  assert.ok(calls.every(batch => !(batch.includes('AAA-FEED') && batch.includes('EURUSDpro'))));
  assert.match(data.error, /Retry/);
});

test('a feed failure preserves broker symbols with a retryable error', async () => {
  const data = await loadSymbolManagement({
    getNames: async () => ['EURUSD'],
    getAvailableNames: async () => { throw Error('Offline'); },
    getCategories: async () => [], getCategorySymbols: async () => [],
    getParams: async () => [{ symbol: 'EURUSD', digits: 5 }],
  });
  assert.equal(data.symbols[0].symbol, 'EURUSD');
  assert.equal(data.symbols[0].__managementLoading, false);
  assert.match(data.error, /Retry/);
});

test('type and status publish before slow parameters and unrelated categories', async () => {
  const params = deferred();
  const slowCategory = deferred();
  const progress = [];
  const result = loadSymbolManagement({
    getNames: async () => ['EURUSD', 'EURUSDpro'],
    getCategories: async () => [{ name: 'Forex' }, { name: 'Slow' }],
    getParams: () => params.promise,
    getCategorySymbols: category => category === 'Slow' ? slowCategory.promise : Promise.resolve([
      { symbol: 'EURUSD', enabled: true },
      { symbol: 'EURUSDpro', symbolType: 'derived', enabled: false },
    ]),
    onProgress: data => progress.push(data),
  });
  await tick();
  assert.equal(progress.at(-1).symbols[0].symbolType, 'base');
  assert.equal(progress.at(-1).symbols[1].symbolType, 'derived');
  assert.equal(progress.at(-1).symbols[1].enabled, false);
  assert.equal(progress.at(-1).symbols[0].__managementPartial, true);
  params.resolve([{ symbol: 'EURUSD', digits: 5 }, { symbol: 'EURUSDpro', digits: 5 }]);
  await tick();
  assert.equal(progress.at(-1).symbols[0].__managementPartial, false);
  slowCategory.resolve([]);
  assert.equal((await result).error, '');
});

test('cached derived types stay visible until verified metadata replaces them', async () => {
  const category = deferred();
  const progress = [];
  const task = loadSymbolManagement({
    getNames: async () => ['EURUSDpro'], getCategories: async () => [{ name: 'Forex' }],
    getParams: async () => [{ symbol: 'EURUSDpro', digits: 5 }],
    getCategorySymbols: () => category.promise,
    cachedSymbols: [{ symbol: 'EURUSDpro', symbolType: 'derived', enabled: true }],
    onProgress: data => progress.push(data),
  });
  await tick();
  assert.ok(progress.every(data => data.symbols[0].symbolType === 'derived'));
  category.resolve([{ symbol: 'EURUSDpro', symbolType: 'derived', enabled: false }]);
  assert.equal((await task).symbols[0].enabled, false);
});

test('failed batches keep successful rows and stop loading without guessing types', async () => {
  const result = await loadSymbolManagement({
    getNames: async () => Array.from({ length: 61 }, (_, i) => `S${String(i).padStart(3, '0')}`),
    getCategories: async () => { throw Error('offline'); },
    getParams: async batch => { if (batch.includes('S060')) throw Error('failed'); return batch.map(symbol => ({ symbol, digits: 5 })); },
    getCategorySymbols: async () => [],
  });
  assert.equal(result.symbols.length, 61);
  assert.equal(result.symbols[0].digits, 5);
  assert.equal(result.symbols[60].digits, undefined);
  assert.equal(result.symbols[0].symbolType, undefined);
  assert.ok(result.symbols.every(row => row.__managementLoading === false));
  assert.match(result.error, /Retry/);
});

test('later batches reuse unchanged rows without mutating earlier snapshots', async () => {
  const later = deferred();
  const metadata = deferred();
  const names = Array.from({ length: 121 }, (_, i) => `S${String(i).padStart(3, '0')}`);
  const progress = [];
  const task = loadSymbolManagement({
    getNames: async () => [...names].reverse(),
    getCategories: () => metadata.promise,
    getCategorySymbols: async () => [],
    getParams: batch => batch.includes('S060') ? later.promise : Promise.resolve(batch.map(symbol => ({ symbol, digits: 5 }))),
    onProgress: data => progress.push(data),
  });
  await tick();
  const before = progress.at(-1);
  assert.deepEqual(before.symbols.map(row => row.symbol), names);
  assert.equal(before.symbols[60].digits, undefined);
  later.resolve(names.slice(60, 120).map(symbol => ({ symbol, digits: 3 })));
  await tick();
  const after = progress.at(-1);
  assert.equal(after.symbols[0], before.symbols[0]);
  assert.notEqual(after.symbols[60], before.symbols[60]);
  assert.equal(before.symbols[60].digits, undefined);
  assert.equal(after.symbols[60].digits, 3);
  metadata.resolve([]);
  const result = await task;
  assert.ok(result.symbols.every(row => !row.__managementPartial && !row.__managementLoading));
  assert.ok(before.symbols.every(row => row.__managementLoading));
  assert.equal(progress.at(-1), result);
});
