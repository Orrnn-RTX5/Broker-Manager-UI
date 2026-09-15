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
