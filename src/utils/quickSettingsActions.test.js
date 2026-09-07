import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MANAGER_REFRESH_EVENT,
  refreshWorkspaceData,
  resetWorkspaceLayout,
  toggleDocumentFullscreen,
} from './quickSettingsActions.js';

test('refreshWorkspaceData refreshes active queries and legacy data sources', async () => {
  const events = [];
  const invalidateCalls = [];
  const eventTarget = {
    dispatchEvent(event) {
      events.push(event.type);
    },
  };
  const queryClient = {
    async invalidateQueries(options) {
      invalidateCalls.push(options);
    },
  };

  await refreshWorkspaceData(queryClient, eventTarget);

  assert.deepEqual(events, [MANAGER_REFRESH_EVENT]);
  assert.deepEqual(invalidateCalls, [{ refetchType: 'active' }]);
});

test('resetWorkspaceLayout restores panels before returning to the dashboard', () => {
  const actions = [];

  resetWorkspaceLayout(
    () => actions.push('reset'),
    (path) => actions.push(path),
  );

  assert.deepEqual(actions, ['reset', '/dashboard']);
});

test('toggleDocumentFullscreen enters and exits fullscreen', async () => {
  const calls = [];
  const doc = {
    fullscreenElement: null,
    documentElement: {
      requestFullscreen() {
        calls.push('enter');
      },
    },
    exitFullscreen() {
      calls.push('exit');
    },
  };

  assert.equal(await toggleDocumentFullscreen(doc), true);
  doc.fullscreenElement = doc.documentElement;
  assert.equal(await toggleDocumentFullscreen(doc), false);
  assert.deepEqual(calls, ['enter', 'exit']);
});

test('toggleDocumentFullscreen reports unsupported browsers', async () => {
  await assert.rejects(
    toggleDocumentFullscreen({ documentElement: {} }),
    /Fullscreen is not supported/,
  );
});
