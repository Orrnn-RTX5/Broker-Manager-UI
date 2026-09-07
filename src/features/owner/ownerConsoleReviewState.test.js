import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  countUnreviewedOwnerWorkflows,
  markOwnerConsoleWorkflowReviewed,
  readOwnerConsoleReviewState,
} from './ownerConsoleReviewState.js';

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};

test('reviewing alert items decrements the unread count only once per item', () => {
  const storage = createStorage();
  const items = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];
  let state = readOwnerConsoleReviewState(storage);

  assert.equal(countUnreviewedOwnerWorkflows(items, state.alerts), 3);
  state = markOwnerConsoleWorkflowReviewed(state, 'alerts', 'one', storage);
  assert.equal(countUnreviewedOwnerWorkflows(items, state.alerts), 2);
  state = markOwnerConsoleWorkflowReviewed(state, 'alerts', 'one', storage);
  assert.equal(countUnreviewedOwnerWorkflows(items, state.alerts), 2);
  state = markOwnerConsoleWorkflowReviewed(state, 'alerts', 'two', storage);
  assert.equal(countUnreviewedOwnerWorkflows(items, state.alerts), 1);
});

test('alert and approval review counts are independent and restored from storage', () => {
  const storage = createStorage();
  let state = readOwnerConsoleReviewState(storage);
  state = markOwnerConsoleWorkflowReviewed(state, 'alerts', 'risk', storage);
  markOwnerConsoleWorkflowReviewed(state, 'approvals', 'account', storage);

  assert.deepEqual(readOwnerConsoleReviewState(storage), {
    alerts: ['risk'],
    approvals: ['account'],
  });
});
