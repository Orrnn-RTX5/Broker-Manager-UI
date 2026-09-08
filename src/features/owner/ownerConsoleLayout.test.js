import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('owner console keeps quick actions without cash flow or its report request', () => {
  const source = readFileSync(new URL('./OwnerConsole.jsx', import.meta.url), 'utf8');
  assert.match(source, /cc-owner-quick-actions/);
  assert.match(source, /Quick Actions/);
  assert.doesNotMatch(source, /Cash Flow|cc-cashflow|cc-owner-footnote|useDashboardMetrics|reportDate/);
  assert.match(source, /Operational Alerts/);
  assert.match(source, /Approval Workflows/);
});
