// Run with: node --test src/features/groups/groupLeverage.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

// Group-create leverage gate: a whole number in the named 1..10000 bounds is
// required for a top-level create (the backend refuses an omitted top-level
// leverage instead of defaulting it), a cleared value is never sent as 0, and
// a create with a parent group keeps inheriting the parent's leverage when the
// operator leaves the field alone. Pure module, imported directly.
//
// The import is guarded so a missing module reports each test by name.
const leverage = await import('./groupLeverage.js').catch(() => ({}));
const {
  GROUP_LEVERAGE_MIN,
  GROUP_LEVERAGE_MAX,
  GROUP_LEVERAGE_RANGE_MESSAGE,
  GROUP_LEVERAGE_NO_DEFAULT_HINT,
  parseGroupLeverage,
  resolveCreateLeverage,
} = leverage;

// Generic fixtures only: synthetic group names, no tenant/broker/host values.
const PARENT = 'Fixture/Parent';
const INVALID_VALUES = ['', '   ', null, undefined, 0, '0', -1, 1.5, '1.5', 'abc', '1:200', true, Number.NaN];

test('leverage bounds are named constants 1..10000', () => {
  assert.equal(GROUP_LEVERAGE_MIN, 1);
  assert.equal(GROUP_LEVERAGE_MAX, 10000);
  assert.equal(typeof GROUP_LEVERAGE_RANGE_MESSAGE, 'string');
  assert.ok(GROUP_LEVERAGE_RANGE_MESSAGE.includes(String(GROUP_LEVERAGE_MIN)));
  assert.ok(GROUP_LEVERAGE_RANGE_MESSAGE.includes(String(GROUP_LEVERAGE_MAX)));
  assert.equal(typeof GROUP_LEVERAGE_NO_DEFAULT_HINT, 'string');
  assert.ok(GROUP_LEVERAGE_NO_DEFAULT_HINT.length > 0);
});

test('parseGroupLeverage accepts whole numbers inside the bounds, as integers', () => {
  assert.equal(parseGroupLeverage(GROUP_LEVERAGE_MIN), GROUP_LEVERAGE_MIN);
  assert.equal(parseGroupLeverage(GROUP_LEVERAGE_MAX), GROUP_LEVERAGE_MAX);
  assert.equal(parseGroupLeverage(String(GROUP_LEVERAGE_MAX)), GROUP_LEVERAGE_MAX);
  assert.equal(parseGroupLeverage(' 250 '), 250);
  assert.equal(typeof parseGroupLeverage('250'), 'number');
});

test('parseGroupLeverage refuses blank, 0, out of range, fractional, and non-numeric values', () => {
  for (const value of [...INVALID_VALUES, GROUP_LEVERAGE_MAX + 1, String(GROUP_LEVERAGE_MAX + 1), GROUP_LEVERAGE_MIN - 1]) {
    assert.equal(parseGroupLeverage(value), null, `value ${JSON.stringify(value)} must be refused`);
  }
});

test('top-level create: blank, 0, 10001, 1.5 and abc are blocked with the range message', () => {
  for (const value of [...INVALID_VALUES, GROUP_LEVERAGE_MAX + 1]) {
    for (const leverageTouched of [false, true]) {
      const result = resolveCreateLeverage({ leverage: value, parentGroup: '', leverageTouched });
      assert.deepEqual(
        result,
        { error: GROUP_LEVERAGE_RANGE_MESSAGE },
        `top-level ${JSON.stringify(value)} (touched=${leverageTouched}) must be blocked`,
      );
    }
  }
});

test('top-level create: a valid value (pre-filled or typed) is sent as an integer', () => {
  assert.deepEqual(resolveCreateLeverage({ leverage: 250, parentGroup: '', leverageTouched: false }), { leverage: 250 });
  assert.deepEqual(resolveCreateLeverage({ leverage: '250', parentGroup: '  ', leverageTouched: true }), { leverage: 250 });
});

test('create with a parent group: an untouched or cleared leverage is omitted so the parent governs', () => {
  assert.deepEqual(resolveCreateLeverage({ leverage: 250, parentGroup: PARENT, leverageTouched: false }), { omit: true });
  assert.deepEqual(resolveCreateLeverage({ leverage: '', parentGroup: PARENT, leverageTouched: false }), { omit: true });
  assert.deepEqual(resolveCreateLeverage({ leverage: '', parentGroup: PARENT, leverageTouched: true }), { omit: true });
});

test('create with a parent group: an explicit value is validated and sent, never 0', () => {
  assert.deepEqual(resolveCreateLeverage({ leverage: '300', parentGroup: PARENT, leverageTouched: true }), { leverage: 300 });
  for (const value of [0, 1.5, GROUP_LEVERAGE_MAX + 1]) {
    assert.deepEqual(
      resolveCreateLeverage({ leverage: value, parentGroup: PARENT, leverageTouched: true }),
      { error: GROUP_LEVERAGE_RANGE_MESSAGE },
    );
  }
});
