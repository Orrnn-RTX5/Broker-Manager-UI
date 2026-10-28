import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Regression pins for the GroupsPage refs-during-render fixes
// (manager-cand-m3). The ref bridge to the stable window listener must be
// published from an effect (never a render-phase write), and the Find menu
// item must use the file's menuAction(() => ...) pattern. Pins the REAL
// source text (repo style, cf. AccountTradeTab.test.js).
const src = readFileSync(fileURLToPath(new URL('./GroupsPage.jsx', import.meta.url)), 'utf8');

test('handlers ref is published from an effect, not during render', () => {
  const idx = src.indexOf('handlersRef.current = { selectedNode');
  assert.ok(idx !== -1, 'ref publication must exist');
  const before = src.slice(Math.max(0, idx - 200), idx);
  assert.ok(before.includes('useEffect(() => {'), 'publication must sit inside a passive effect');
  assert.ok(!/^[^/\n]*handlersRef\.current = /m.test(src.replace(/useEffect\(\(\) => \{\s*\n\s*handlersRef\.current = \{[^}]*\};?\s*\n\s*\}\);?/, '')), 'no render-phase ref write may remain');
});

test('Find menu item uses a stable callback, never a render-time ref pass', () => {
  assert.ok(src.includes('handleFindClick'), 'Find must use the stable click handler');
  assert.ok(src.includes('useCallback(() => { setContextMenu(null); focusSearch(); }'), 'handler must close menu then focus, running only on click');
  assert.ok(!src.includes('menuAction(focusSearch)'), 'bare ref-reading function must not be passed during render');
  assert.ok(!src.includes('menuAction(() => focusSearch())'), 'wrapped ref-reading function must not be passed during render');
});

test('folder/selection/intent sync uses render-phase adjustments, not setState in effects', () => {
  assert.ok(src.includes('const [prevFolderKey, setPrevFolderKey] = useState(folder);'), 'folder reset must track the previous folder');
  assert.ok(src.includes('if (prevFolderKey !== folder) {'), 'folder reset must compare during render');
  assert.ok(src.includes('const [prevNavigatorRowKey, setPrevNavigatorRowKey] = useState(null);'), 'navigator selection must track its sync key');
  assert.ok(src.includes('const [prevNavIntentKey, setPrevNavIntentKey] = useState(null);'), 'navigator intents must track their sync key');
  assert.ok(src.includes("if (navigatorGroup) setSelectedId(`group:${navigatorGroup}`);"), 'navigator selection must apply during render');
  assert.ok(src.includes('setPropertiesGroup(navIntentGroup);'), 'properties intent must apply during render');
  // The remaining effects must only do external sync (scroll/navigate), never setState.
  const scrollFx = src.slice(src.indexOf('// A group picked in the Navigator is scrolled into view'));
  assert.ok(!/set[A-Z]\w*\(/.test(scrollFx.slice(0, scrollFx.indexOf('}, [folder, navigatorGroup, loading]);'))), 'scroll effect must not call setState');
  const navFx = src.slice(src.indexOf('navigate(`${location.pathname}${location.search}`, { replace: true, state: null });'));
  assert.ok(navFx.includes('return undefined;'), 'intent effect must navigate then end without setState');
});

// B3-R / round 5: Enter on a multi-segment path opens only a fully resolved route. The decision is the pure
// resolveGroupEnterTarget (behaviour is tested in groupSearchRouter.test.js); this pins that Enter routes
// through it with the typed query and the groups (the helper reads the path segments from them).
test('Enter decides its target through resolveGroupEnterTarget with the typed query and groups', () => {
  assert.ok(src.includes('const target = resolveGroupEnterTarget({'), 'Enter must use the pure target helper');
  assert.ok(src.includes('query: queryText,\n        groups,\n      });'), 'the helper must receive the typed query and the groups for the path check');
  assert.ok(!src.includes('if (!openedGroup && visibleRows.length === 1) {'), 'the visible-row fallback must not be inlined in the page');
});
