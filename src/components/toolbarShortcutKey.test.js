import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeShortcutKey } from './toolbarShortcutKey.js';

test('normalizes missing and present toolbar shortcut keys', () => {
  assert.equal(normalizeShortcutKey(undefined), '');
  assert.equal(normalizeShortcutKey(null), '');
  assert.equal(normalizeShortcutKey('K'), 'k');
  assert.equal(normalizeShortcutKey('Escape'), 'escape');
});
