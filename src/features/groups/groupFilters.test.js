import test from 'node:test';
import assert from 'node:assert/strict';
import { filterGroupsBySearch } from './groupFilters.js';

test('R02: group search is null-safe for nameless active-only rows', () => {
  const rows = [
    { name: 'forex-real', description: 'USD' },
    { description: 'no name from active groups response' },
    { name: null, description: 'null name from active groups response' },
    null,
  ];

  assert.doesNotThrow(() => filterGroupsBySearch(rows, 'real'));
  assert.deepEqual(filterGroupsBySearch(rows, 'real'), [
    { name: 'forex-real', description: 'USD' },
  ]);
  assert.deepEqual(filterGroupsBySearch(rows, 'missing'), []);
});

test('R02: empty group search preserves renderable source rows', () => {
  const rows = [
    { name: 'forex-real' },
    { description: 'nameless but renderable' },
  ];

  assert.deepEqual(filterGroupsBySearch(rows, ''), rows);
  assert.deepEqual(filterGroupsBySearch(undefined, ''), []);
});
