import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OWNER_CONSOLE_ALERTS,
  OWNER_CONSOLE_APPROVALS,
  OWNER_CONSOLE_PLACEHOLDERS,
} from './ownerConsoleData.js';

test('owner console badges match the available alert and approval workflows', () => {
  assert.equal(OWNER_CONSOLE_PLACEHOLDERS.alertCount, OWNER_CONSOLE_ALERTS.length);
  assert.equal(OWNER_CONSOLE_PLACEHOLDERS.approvalCount, OWNER_CONSOLE_APPROVALS.length);
});

test('every owner workflow opens a real manager workspace', () => {
  for (const item of [...OWNER_CONSOLE_ALERTS, ...OWNER_CONSOLE_APPROVALS]) {
    assert.match(item.path, /^\//);
    assert.ok(item.title);
    assert.ok(item.description);
    assert.ok(item.action);
  }
});
