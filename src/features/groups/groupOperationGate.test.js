import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GROUP_OPERATIONS_DISABLED_MESSAGE, groupOperationErrorMessage, groupOperationsEnabled } from './groupOperations.js';
import { canRefreshRejectedOperation } from './groupOperationState.js';

const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

// Runs fn with a runtime broker allowlist and a stored session broker id, then restores globals.
const withEnv = (runtime, brokerId, fn) => {
  const previousRuntime = globalThis.__RTX_RUNTIME_CONFIG__;
  const previousWindow = globalThis.window;
  try {
    globalThis.__RTX_RUNTIME_CONFIG__ = runtime;
    globalThis.window = {
      sessionStorage: { getItem: key => (key === 'auth' ? JSON.stringify({ broker_id: brokerId, login: 501 }) : null) },
    };
    return fn();
  } finally {
    if (previousRuntime === undefined) delete globalThis.__RTX_RUNTIME_CONFIG__;
    else globalThis.__RTX_RUNTIME_CONFIG__ = previousRuntime;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
};

test('a boolean session field is authoritative when true, regardless of the deprecated runtime list', () => {
  withEnv({ GROUP_OPERATIONS_BROKERS: '', VITE_GROUP_OPERATIONS_BROKERS: '' }, 'fx1', () => {
    assert.equal(groupOperationsEnabled(true), true);
  });
});

test('a boolean session field is authoritative when false, even if the deprecated list names the broker or *', () => {
  withEnv({ GROUP_OPERATIONS_BROKERS: 'fx1,*' }, 'fx1', () => {
    assert.equal(groupOperationsEnabled(false), false);
  });
  withEnv({ VITE_GROUP_OPERATIONS_BROKERS: '*' }, 'fx1', () => {
    assert.equal(groupOperationsEnabled(false), false);
  });
});

test('an absent session field falls back to the deprecated runtime broker list', () => {
  for (const absent of [undefined, null, 'true', 1]) {
    withEnv({ GROUP_OPERATIONS_BROKERS: '*' }, 'fx1', () => assert.equal(groupOperationsEnabled(absent), true));
    withEnv({ GROUP_OPERATIONS_BROKERS: 'fx1' }, 'fx1', () => assert.equal(groupOperationsEnabled(absent), true));
    withEnv({ GROUP_OPERATIONS_BROKERS: 'fx2' }, 'fx1', () => assert.equal(groupOperationsEnabled(absent), false));
    withEnv({ GROUP_OPERATIONS_BROKERS: '' }, 'fx1', () => assert.equal(groupOperationsEnabled(absent), false));
    withEnv({ VITE_GROUP_OPERATIONS_BROKERS: '*' }, null, () => assert.equal(groupOperationsEnabled(absent), true));
  }
});

test('error or no-token path (loading finished, field absent) falls back to the config list, as decided', () => {
  // No stored session means no broker claim, so only the wildcard or an explicit list entry can enable.
  withEnv({ GROUP_OPERATIONS_BROKERS: '*' }, null, () => assert.equal(groupOperationsEnabled(undefined, false), true));
  withEnv({ GROUP_OPERATIONS_BROKERS: 'fx1' }, null, () => assert.equal(groupOperationsEnabled(undefined, false), false));
  withEnv({ GROUP_OPERATIONS_BROKERS: '' }, 'fx1', () => assert.equal(groupOperationsEnabled(undefined, false), false));
  withEnv({ GROUP_OPERATIONS_BROKERS: 'fx1' }, 'fx1', () => assert.equal(groupOperationsEnabled(undefined, false), true));
});

test('while the session is loading and the field is absent, the answer is unknown and the config list is not consulted', () => {
  for (const config of [{ GROUP_OPERATIONS_BROKERS: '*' }, { GROUP_OPERATIONS_BROKERS: 'fx1' }, { GROUP_OPERATIONS_BROKERS: '' }]) {
    for (const absent of [undefined, null]) {
      withEnv(config, 'fx1', () => assert.equal(groupOperationsEnabled(absent, true), null));
    }
  }
  withEnv({ GROUP_OPERATIONS_BROKERS: '*' }, 'fx1', () => assert.equal(groupOperationsEnabled(true, true), true));
  withEnv({ GROUP_OPERATIONS_BROKERS: '*' }, 'fx1', () => assert.equal(groupOperationsEnabled(false, true), false));
  withEnv({ GROUP_OPERATIONS_BROKERS: '*' }, 'fx1', () => assert.equal(groupOperationsEnabled(undefined, false), true));
});

test('an entitlement refusal (403 GROUP_LIFECYCLE_NOT_ENTITLED) shows the actionable disabled message instead of the raw error', () => {
  assert.equal(GROUP_OPERATIONS_DISABLED_MESSAGE, 'Group operations are not enabled for this broker. Ask your platform administrator to enable them.');
  assert.equal(groupOperationErrorMessage({ status: 403, code: 'GROUP_LIFECYCLE_NOT_ENTITLED', message: 'raw' }), GROUP_OPERATIONS_DISABLED_MESSAGE);
});

test('the submit kill switch (503 feature_disabled) shows the backend message, not the entitlement text', () => {
  assert.equal(groupOperationErrorMessage({ status: 503, code: 'feature_disabled', message: 'New group operations are disabled' }), 'New group operations are disabled');
});

test('other group operation errors keep their own message', () => {
  assert.equal(groupOperationErrorMessage({ status: 403, code: 'forbidden', message: 'Access denied' }), 'Access denied');
  assert.equal(groupOperationErrorMessage({ status: 503, code: 'unavailable', message: 'Try later' }), 'Try later');
  assert.equal(groupOperationErrorMessage({ status: 409, code: 'GROUP_LIFECYCLE_NOT_ENTITLED', message: 'conflict' }), 'conflict');
  assert.equal(groupOperationErrorMessage({ status: 200, code: 'GROUP_LIFECYCLE_NOT_ENTITLED', message: 'odd' }), 'odd');
  assert.equal(groupOperationErrorMessage(new Error('network failure')), 'network failure');
});

test('a not-entitled refusal is a definitive rejection, so the saved submission is cleared', () => {
  assert.equal(canRefreshRejectedOperation({ status: 403, code: 'GROUP_LIFECYCLE_NOT_ENTITLED' }), true);
  assert.equal(canRefreshRejectedOperation({ status: 503, code: 'feature_disabled' }), true);
});

test('pages gate on the session field and never show the old message or the bare config gate', () => {
  for (const path of ['./GroupsPage.jsx', './GroupDetailsPage.jsx']) {
    const src = read(path);
    assert.ok(src.includes('groupOperationsEnabled: sessionGroupOperationsEnabled'), `${path} must read the session gate from usePermissions`);
    assert.ok(src.includes('groupOperationsLoading: sessionGroupOperationsLoading'), `${path} must read the loading state from usePermissions`);
    assert.ok(src.includes('GROUP_OPERATIONS_DISABLED_MESSAGE'), `${path} must use the shared disabled message`);
    assert.ok(!src.includes("'Group operations are not enabled for this broker.'"), `${path} must not keep the old message`);
    assert.ok(!/groupOperationsEnabled\(\)/.test(src), `${path} must pass the session value into groupOperationsEnabled`);
    assert.ok(src.includes('groupOperationsEnabled(sessionGroupOperationsEnabled, sessionGroupOperationsLoading)'), `${path} must pass the loading state too`);
    assert.ok(src.includes('=== null) return; // still loading: show nothing'), `${path} must show nothing while loading`);
  }
  assert.ok(read('./GroupDetailsPage.jsx').includes('disabled={operationsEnabled === null}'), 'the Move button must be disabled while the session answer is loading');
});

test('the permissions hook exposes the backend boolean, leaves it undefined when absent, and exposes loading', () => {
  const src = read('../../hooks/usePermissions.js');
  assert.ok(src.includes("typeof data?.group_operations_enabled === 'boolean'"));
  assert.ok(src.includes('? data.group_operations_enabled'));
  assert.ok(/return \{[\s\S]*groupOperationsEnabled,[\s\S]*groupOperationsLoading: isLoading,[\s\S]*\};/.test(src), 'hook must return groupOperationsEnabled and groupOperationsLoading');
});

test('the operation modal maps preview and submit errors only; the status poll keeps the raw message', () => {
  const src = read('./components/GroupOperationModal.jsx');
  assert.equal(src.split('setError(groupOperationErrorMessage(err))').length - 1, 2, 'preview and submit errors must be mapped');
  assert.ok(src.includes('} catch (err) { if (!cancelled) setError(err.message); }'), 'the status-poll catch must keep the raw message');
});

test('the deprecated runtime-config fallback is marked for removal in one place', () => {
  const src = read('./groupOperations.js');
  assert.ok(src.includes('DEPRECATED'), 'the runtime-config fallback must carry a deprecation comment');
  assert.equal(src.split("'GROUP_OPERATIONS_BROKERS'").length - 1, 1, 'the broker list must be read in one place only');
});
