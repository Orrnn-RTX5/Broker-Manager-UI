import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Regression pin for the TerminalTabContent missing import (manager-cand-m3):
// SearchTab called requiresPositionReconciliation without importing it, so
// the first position event threw ReferenceError and broke the coalesced
// search-positions invalidation. Pins the REAL source text (repo style).
const src = readFileSync(fileURLToPath(new URL('./TerminalTabContent.jsx', import.meta.url)), 'utf8');

test('position reconciliation guard is imported where used', () => {
  assert.ok(src.includes('requiresPositionReconciliation(event?.payload)'), 'SearchTab must keep the reconciliation guard');
  assert.ok(/import \{[^}]*requiresPositionReconciliation[^}]*\} from '\.\.\/\.\.\/services\/positionSync'/.test(src), 'guard must be imported from the positionSync service');
});
