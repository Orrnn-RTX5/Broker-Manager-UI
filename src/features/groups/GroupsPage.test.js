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
