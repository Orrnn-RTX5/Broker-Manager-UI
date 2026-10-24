import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_MULTI_SCREENS,
  buildScreenGridRows,
  useMultiScreenStore,
} from './multiScreenStore.js';

test('New Account opens 1 screen on 1st click, 2 on 2nd click, up to maximum 6 screens', () => {
  useMultiScreenStore.getState().resetMultiScreens();

  for (let click = 1; click <= MAX_MULTI_SCREENS; click += 1) {
    const result = useMultiScreenStore.getState().openAccountScreen();
    const state = useMultiScreenStore.getState();
    assert.equal(result.status, 'added');
    assert.equal(state.accountScreens.length, click);
    assert.equal(state.activeAccountScreenId, result.screenId);
    assert.equal(state.activeView, 'account');
  }

  // 7th click must not exceed 6 screens
  const seventh = useMultiScreenStore.getState().openAccountScreen();
  const capped = useMultiScreenStore.getState();
  assert.equal(seventh.status, 'limit-reached');
  assert.equal(capped.accountScreens.length, 6);
});

test('New Group opens 1 screen on 1st click, 2 on 2nd click, up to maximum 6 screens', () => {
  useMultiScreenStore.getState().resetMultiScreens();

  for (let click = 1; click <= MAX_MULTI_SCREENS; click += 1) {
    const result = useMultiScreenStore.getState().openGroupScreen({ presetName: `demo\\g${click}` });
    const state = useMultiScreenStore.getState();
    assert.equal(result.status, 'added');
    assert.equal(state.groupScreens.length, click);
    assert.equal(state.activeGroupScreenId, result.screenId);
    assert.equal(state.activeView, 'group');
  }

  // 7th click must not exceed 6 screens
  const seventh = useMultiScreenStore.getState().openGroupScreen({ presetName: 'demo\\g7' });
  const capped = useMultiScreenStore.getState();
  assert.equal(seventh.status, 'limit-reached');
  assert.equal(capped.groupScreens.length, 6);
});

test('Active screen switches when user is present on a screen and closes cleanly', () => {
  useMultiScreenStore.getState().resetMultiScreens();

  const first = useMultiScreenStore.getState().openAccountScreen();
  const second = useMultiScreenStore.getState().openAccountScreen();
  const third = useMultiScreenStore.getState().openAccountScreen();

  assert.equal(useMultiScreenStore.getState().activeAccountScreenId, third.screenId);

  useMultiScreenStore.getState().setActiveAccountScreen(first.screenId);
  assert.equal(useMultiScreenStore.getState().activeAccountScreenId, first.screenId);

  useMultiScreenStore.getState().closeAccountScreen(first.screenId);
  assert.equal(useMultiScreenStore.getState().accountScreens.length, 2);
  assert.equal(useMultiScreenStore.getState().activeAccountScreenId, second.screenId);

  useMultiScreenStore.getState().closeAccountScreen(second.screenId);
  useMultiScreenStore.getState().closeAccountScreen(third.screenId);
  assert.equal(useMultiScreenStore.getState().accountScreens.length, 0);
  assert.equal(useMultiScreenStore.getState().activeView, null);
});

test('buildScreenGridRows divides 1 to 6 screens into balanced rows', () => {
  const make = (n) => Array.from({ length: n }, (_, index) => ({ id: `s-${index + 1}` }));

  assert.deepEqual(buildScreenGridRows(make(1)).map((r) => r.length), [1]);
  assert.deepEqual(buildScreenGridRows(make(2)).map((r) => r.length), [2]);
  assert.deepEqual(buildScreenGridRows(make(3)).map((r) => r.length), [2, 1]);
  assert.deepEqual(buildScreenGridRows(make(4)).map((r) => r.length), [2, 2]);
  assert.deepEqual(buildScreenGridRows(make(5)).map((r) => r.length), [3, 2]);
  assert.deepEqual(buildScreenGridRows(make(6)).map((r) => r.length), [3, 3]);
});

test('MultiScreenWorkspace highlights the active screen with a slight rounded border', () => {
  const workspaceSource = readFileSync(new URL('../components/MultiScreenWorkspace.jsx', import.meta.url), 'utf8');
  const cssSource = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

  assert.match(workspaceSource, /multi-screen-pane\$\{isActive \? ' is-active' : ''\}/);
  assert.match(workspaceSource, /onMouseEnter=/);
  assert.match(workspaceSource, /onPointerDown=/);
  assert.match(workspaceSource, /onFocusCapture=/);
  assert.match(cssSource, /\.multi-screen-pane\.is-active\s*\{[\s\S]*?border-radius:\s*10px;/);
});

test('Opening New Account or New Group forms keeps the existing open workspace view visible alongside the forms', () => {
  const adminLayoutSource = readFileSync(new URL('../layouts/AdminLayout.jsx', import.meta.url), 'utf8');
  const groupsPageSource = readFileSync(new URL('../features/groups/GroupsPage.jsx', import.meta.url), 'utf8');

  assert.match(adminLayoutSource, /<div className="cc-center-split">[\s\S]*?<div className="cc-route-viewport">[\s\S]*?\{children\}[\s\S]*?<\/div>[\s\S]*?\{hasMultiScreens \? \(\s*<MultiScreenWorkspace/);
  assert.doesNotMatch(groupsPageSource, /activeMultiView === 'group' && groupScreenCount > 0 \?/);
});

test('NewGroupModal uses sentence-case New group heading and subtle 1px borders matching NewAccountModal', () => {
  const modalSource = readFileSync(new URL('../features/groups/components/NewGroupModal.jsx', import.meta.url), 'utf8');
  const modalCss = readFileSync(new URL('../features/groups/components/NewGroupModal.css', import.meta.url), 'utf8');

  assert.match(modalSource, /: 'New group';/);
  assert.match(modalSource, /<h2>Group setup<\/h2>/);
  assert.match(modalSource, /<h2>Margin &amp; leverage<\/h2>/);
  assert.match(modalSource, /<h2>Execution &amp; commission<\/h2>/);
  assert.match(modalSource, /<h2>Trading symbols<\/h2>/);
  assert.match(modalCss, /\.group-create-title\s*\{[\s\S]*?text-transform:\s*none;/);
  assert.doesNotMatch(modalCss, /border:\s*1px solid var\(--border-3\)/);
});

test('Add subgroup dialog uses structured trading terminal header, fields, and live path preview', () => {
  const groupsPageSource = readFileSync(new URL('../features/groups/GroupsPage.jsx', import.meta.url), 'utf8');
  const groupsExplorerCss = readFileSync(new URL('../features/groups/GroupsExplorer.css', import.meta.url), 'utf8');

  assert.match(groupsPageSource, /className="groups-subgroup-title">New subgroup<\/span>/);
  assert.match(groupsPageSource, /<h2>Hierarchy &amp; naming<\/h2>/);
  assert.match(groupsPageSource, /className="groups-subgroup-preview"/);
  assert.match(groupsExplorerCss, /\.groups-subgroup-dialog \.groups-subgroup-control\s*\{[\s\S]*?border:\s*1px solid var\(--border\);/);
});

test('Clients page places search in header filter row, removes subtitle line, and uses fixed equal-width columns', () => {
  const clientsDashboardSource = readFileSync(new URL('../features/clients/ClientsDashboard.jsx', import.meta.url), 'utf8');
  const clientsGridSource = readFileSync(new URL('../features/clients/components/ClientsDataGrid.jsx', import.meta.url), 'utf8');
  const cssSource = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

  assert.doesNotMatch(clientsDashboardSource, /Right-click for actions/);
  assert.match(clientsDashboardSource, /<div className="clients-filters[^>]*>[\s\S]*?<div className="clients-search/);
  assert.match(clientsGridSource, /ui-grid clients-table/);
  assert.match(clientsGridSource, /<colgroup>/);
  assert.match(cssSource, /#root \.clients-grid \.clients-table\s*\{[\s\S]*?table-layout:\s*fixed;/);
});

test('Dealing page places search in header filter row, removes subtitle line, and uses fixed equal-width columns', () => {
  const dealsPageSource = readFileSync(new URL('../features/clients/DealsPage.jsx', import.meta.url), 'utf8');
  const dealsGridSource = readFileSync(new URL('../features/clients/components/DealsDataGrid.jsx', import.meta.url), 'utf8');
  const cssSource = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

  assert.doesNotMatch(dealsPageSource, /Right-click for actions/);
  assert.match(dealsPageSource, /<div className="deals-filters[^>]*>[\s\S]*?<div className="deals-search/);
  assert.match(dealsGridSource, /ui-grid deals-table/);
  assert.match(dealsGridSource, /<colgroup>/);
  assert.match(cssSource, /#root \.deals-grid \.deals-table\s*\{[\s\S]*?table-layout:\s*fixed;/);
});
