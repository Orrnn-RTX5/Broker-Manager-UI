import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('trading analytics retains report coverage without oversized waiting cards or inert action buttons', () => {
  const source = readFileSync(new URL('./TradingAccountsDashboard.jsx', import.meta.url), 'utf8');
  for (const title of ['Registration Date', 'Accounts by Country', 'Accounts by Group']) assert.ok(source.includes(title));
  assert.doesNotMatch(source, /ComingSoon|Waiting for live aggregation|<Power|<Settings/);
  assert.match(source, /reports are not available yet/);
  assert.match(source, /navigate\('\/clients\/trading-accounts'\)/);
  assert.match(source, /useOwnerConsoleAutoCollapse/);
});
