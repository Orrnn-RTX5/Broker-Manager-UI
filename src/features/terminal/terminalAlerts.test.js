import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroupMarginLevels, buildMarginAlerts } from './terminalAlerts.js';

test('accounts above their margin call level raise no alerts', () => {
  assert.deepEqual(buildMarginAlerts([
    { login: '1', margin: 100, marginLevel: 250 },
    { login: '2', margin: 0, marginLevel: 0 },
    { login: '3', balance: 1000 },
  ]), []);
});

test('margin call and stop out use default levels, stop outs first', () => {
  const alerts = buildMarginAlerts([
    { login: '1', Name: 'Call', margin: 100, marginLevel: 80 },
    { login: '2', Name: 'Stop', margin: 100, marginLevel: 40 },
    { login: '3', margin: 100, marginLevel: 100 },
  ]);
  assert.deepEqual(alerts.map((a) => [a.login, a.type, a.threshold]), [
    ['2', 'stop-out', 50],
    ['1', 'margin-call', 100],
    ['3', 'margin-call', 100],
  ]);
  assert.equal(alerts[0].name, 'Stop');
});

test('group levels override defaults and margin level falls back to equity / margin', () => {
  const groups = buildGroupMarginLevels([{ name: 'PREP\\real\\A', marginCallLevel: 150, stopOutLevel: 120 }]);
  const alerts = buildMarginAlerts([
    { login: '7', group: 'prep\\real\\a', margin: 1000, equity: 1300 },
    { login: '8', group: 'PREP\\real\\A', margin: 1000, equity: 1400 },
    { login: '9', group: 'other', margin: 1000, equity: 1300 },
  ], groups);
  assert.deepEqual(alerts.map((a) => [a.login, a.type, Math.round(a.marginLevel)]), [
    ['7', 'margin-call', 130],
    ['8', 'margin-call', 140],
  ]);
});

test('an account threshold below 100 does not mark a healthy account as a margin call', () => {
  assert.deepEqual(buildMarginAlerts([
    { login: '200005', margin: 0, MarginLevel: 0, MarginCallLevel: 50 },
    { login: '200006', margin: 100, MarginLevel: 80, MarginCallLevel: 50 },
    { login: '200008', margin: 100, equity: 200, marginLevel: 0, MarginCallLevel: 50 },
  ]), []);

  const alerts = buildMarginAlerts([
    { login: '200007', margin: 100, MarginLevel: 40, MarginCallLevel: 50 },
  ]);
  assert.equal(alerts[0].login, '200007');
  assert.equal(alerts[0].threshold, 50);
});
