import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExposure, exposureTotals, exposureCsv } from './exposureModel.js';

test('signed hedge quantities and explicit USD rate produce residual exposure', () => {
  const { rows } = normalizeExposure({ rows: [{ asset: 'EUR', unit: 'EUR', clientQuantity: '100000', coverageQuantity: '-40000', usdRate: '1.1' }] });
  assert.equal(rows[0].net, 60000);
  assert.equal(rows[0].netUsd, 66000);
  assert.deepEqual(exposureTotals(rows), { net: 66000, long: 66000, short: 0, missing: 0 });
});
test('unknown coverage and unqualified lots do not become zero coverage or USD', () => {
  const { rows } = normalizeExposure([{ symbol: 'EURUSD', clients: 10, netVolume: 2, netLots: 2, clientQuantity: 100000 }]);
  assert.equal(rows[0].clients, 100000);
  assert.equal(rows[0].coverage, null);
  assert.equal(rows[0].net, null);
  assert.equal(rows[0].netUsd, null);
  assert.equal(exposureTotals(rows).missing, 1);
});
test('zero, negative exposures, decimal strings and absent values remain distinct', () => {
  const { rows } = normalizeExposure({ data: { rows: [{ asset: 'USD', netUsd: 0 }, { asset: 'XAU', net_usd: '-125.25' }, { asset: 'GBP', netUsd: '' }] } });
  assert.deepEqual(exposureTotals(rows), { net: -125.25, long: 0, short: -125.25, missing: 1 });
  assert.equal(rows[1].positiveUsd, 0);
});
test('malformed and duplicate rows fail rather than appearing as an empty book', () => {
  assert.throws(() => normalizeExposure({ message: 'failed' }));
  assert.throws(() => normalizeExposure([{ asset: 'EUR' }, { asset: 'EUR' }]));
  assert.throws(() => normalizeExposure([{}]));
  assert.deepEqual(normalizeExposure([]).rows, []);
});
test('truncated snapshots are marked partial and invalid conversion rates stay unavailable', () => {
  const result = normalizeExposure({ rows: [{ asset: 'EUR', netQuantity: 12, usdRate: -1 }], total: 4 });
  assert.equal(result.partial, true);
  assert.equal(result.rows[0].netUsd, null);
});
test('CSV quotes asset names, neutralizes formulas and leaves missing data blank', () => {
  const { rows } = normalizeExposure([{ asset: '=SUM(1,2)', netUsd: -10 }]);
  const csv = exposureCsv(rows);
  assert.ok(csv.includes('"\'=SUM(1,2)"'));
  assert.ok(csv.includes('"-10"'));
  assert.ok(csv.includes(',"",'));
});
