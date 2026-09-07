import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeManagerSession } from './managerSession.js';

test('manager session details use the authenticated API response', () => {
  assert.deepEqual(normalizeManagerSession({
    login: 501,
    display_name: 'Dealing Manager',
    role: 'risk_manager',
    broker_id: 'fxtrust',
    permissions: ['view_accounts'],
  }), {
    login: '501',
    displayName: 'Dealing Manager',
    role: 'Risk Manager',
    brokerId: 'fxtrust',
    permissions: ['view_accounts'],
    isAdmin: false,
    initial: 'D',
  });
});

test('manager session details fall back to stored login claims', () => {
  assert.deepEqual(normalizeManagerSession({}, {
    login: 'dipankar', brokerId: 'TEST', isAdmin: true,
  }), {
    login: 'dipankar',
    displayName: 'dipankar',
    role: 'Admin',
    brokerId: 'TEST',
    permissions: [],
    isAdmin: true,
    initial: 'D',
  });
});
