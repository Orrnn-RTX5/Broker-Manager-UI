import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPageLabel } from './pageLabel.js';

test('shows the current page out of the known total', () => {
  assert.equal(formatPageLabel(0, 5), 'Page 1 of 5');
  assert.equal(formatPageLabel(4, 5), 'Page 5 of 5');
  assert.equal(formatPageLabel(0, 1), 'Page 1 of 1');
});

test('does not invent a total when the API does not provide it', () => {
  assert.equal(formatPageLabel(0, null), 'Page 1');
  assert.equal(formatPageLabel(2, undefined), 'Page 3');
});
