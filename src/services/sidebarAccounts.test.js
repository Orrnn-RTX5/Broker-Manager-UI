import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSidebarAccountPage } from '../utils/sidebarAccountRows.js';

test('sidebar account cache unwraps shared trading-account rows', () => {
  const page = normalizeSidebarAccountPage({
    rows: [{ raw: { Login: 200001, Balance: 1250.5, Name: 'Test Account' } }],
    total: 1,
  });

  assert.equal(page.rows[0].login, '200001');
  assert.equal(page.rows[0].balance, 1250.5);
  assert.equal(page.rows[0].Name, 'Test Account');
});

test('sidebar account cache rejects rows without a usable login', () => {
  assert.equal(normalizeSidebarAccountPage({ rows: [{ Balance: 100 }] }), undefined);
});

test('sidebar account cache accepts normalized client ids and nested balances', () => {
  const page = normalizeSidebarAccountPage({
    rows: [{ id: '200008', account: [{ Balance: '373.46' }] }],
  });

  assert.equal(page.rows[0].login, '200008');
  assert.equal(page.rows[0].balance, '373.46');
});

test('sidebar account cache deduplicates logins and keeps the available balance', () => {
  const page = normalizeSidebarAccountPage({
    rows: [
      { Login: 200008 },
      { login: '200008', balance: 100398 },
      { Login: 200001, Balance: 0 },
      { login: '200001' },
    ],
  });

  assert.deepEqual(page.rows.map((account) => account.login), ['200008', '200001']);
  assert.equal(page.rows[0].balance, 100398);
  assert.equal(page.rows[1].balance, 0);
});
