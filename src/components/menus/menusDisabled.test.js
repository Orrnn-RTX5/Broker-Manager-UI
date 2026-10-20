import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const readComponent = (name) => readFileSync(join(here, name), 'utf8');

// SUI-M6: no-op Window/Tools/View entries must render disabled with an
// explicit reason and no live onClick, while wired neighbors stay enabled.
const unavailableUsages = (source) => source.match(/<UnavailableMenuItem[\s\S]*?\/>/g) || [];

const findUnavailableUsage = (source, key) => {
  const hit = unavailableUsages(source).find((el) => el.includes(key));
  assert.ok(hit, `expected a disabled UnavailableMenuItem for ${key}`);
  return hit;
};

test('Window menu renders every MDI no-op entry disabled with no live onClick', () => {
  const windowMenu = readComponent('WindowMenu.jsx');
  const noOpKeys = [
    'window.tileWindows',
    'window.cascade',
    'window.tileHorizontally',
    'window.tileVertically',
    'window.arrangeIcons',
    'window.layouts',
    '1 Accounts',
  ];

  for (const key of noOpKeys) {
    const usage = findUnavailableUsage(windowMenu, key);
    assert.ok(!usage.includes('onClick'), `expected no onClick on the disabled ${key} entry`);
  }

  // None of the no-op entries may also exist as an enabled MenuItem.
  for (const key of ['window.tileWindows', 'window.cascade', 'window.tileHorizontally', 'window.tileVertically', 'window.arrangeIcons', 'window.layouts']) {
    const escaped = key.replace('.', '\\.');
    assert.doesNotMatch(windowMenu, new RegExp(`<MenuItem[^>]*${escaped}[^>]*onClick`));
  }
  assert.doesNotMatch(windowMenu, /<MenuItem[^>]*1 Accounts[^>]*onClick/);
});

test('Window menu disabled entries carry an explicit reason and real disabled behavior', () => {
  const windowMenu = readComponent('WindowMenu.jsx');
  const menuItem = readComponent('MenuItem.jsx');

  const reason = windowMenu.match(/const NO_MDI_REASON = '([^']+)'/);
  assert.ok(reason && reason[1].length > 0, 'expected a non-empty NO_MDI_REASON');
  assert.match(windowMenu, /title=\{\s*`\$\{label\} — \$\{NO_MDI_REASON\}`\s*\}/);
  assert.match(windowMenu, /aria-disabled="true"/);
  assert.match(windowMenu, /<MenuItem icon=\{icon\} text=\{label\} shortcut=\{shortcut\} iconColor=\{iconColor\} disabled \/>/);

  const wrapper = windowMenu.match(/const UnavailableMenuItem[\s\S]*?\);/);
  assert.ok(wrapper && !wrapper[0].includes('onClick'), 'expected the disabled wrapper to accept and forward no onClick');

  // Disabled MenuItems never fire a handler at the behavior level.
  assert.match(menuItem, /onClick=\{disabled \? undefined : onClick\}/);
});

test('Window menu keeps wired neighbors enabled', () => {
  const windowMenu = readComponent('WindowMenu.jsx');

  assert.match(windowMenu, /text=\{t\('window\.resetToDefault'\)\}[\s\S]*?onClick/);
  assert.match(windowMenu, /text=\{t\('window\.analytics'\)\}[\s\S]*?onClick=\{\(\) => handleMenuClick/);
  assert.match(windowMenu, /text=\{t\('window\.accounts'\)\}[\s\S]*?onClick=\{\(\) => handleMenuClick/);
});

test('Tools menu disables Global Settings with a reason and keeps Options wired', () => {
  const toolsMenu = readComponent('ToolsMenu.jsx');

  const reason = toolsMenu.match(/const NO_GLOBAL_SETTINGS_REASON = '([^']+)'/);
  assert.ok(reason && reason[1].length > 0, 'expected a non-empty NO_GLOBAL_SETTINGS_REASON');
  assert.match(toolsMenu, /title=\{\s*`\$\{t\('tools\.globalSettings'\)\} — \$\{NO_GLOBAL_SETTINGS_REASON\}`\s*\} aria-disabled="true"/);

  const disabledItem = toolsMenu.match(/<MenuItem[^>]*tools\.globalSettings[^>]*\/>/);
  assert.ok(disabledItem, 'expected a MenuItem for tools.globalSettings');
  assert.ok(disabledItem[0].includes('disabled'), 'expected the Global Settings MenuItem to be disabled');
  assert.ok(!disabledItem[0].includes('onClick'), 'expected no onClick on the disabled Global Settings entry');
  assert.doesNotMatch(toolsMenu, /<MenuItem[^>]*tools\.globalSettings[^>]*onClick/);

  assert.match(toolsMenu, /text=\{t\('tools\.options'\)\}[\s\S]*?onClick=\{\(\) => setIsOptionsOpen/);
});

test('View menu disables Depth Of Market with a reason and keeps neighbors wired', () => {
  const viewMenu = readComponent('ViewMenu.jsx');

  const reason = viewMenu.match(/const NO_DEPTH_REASON = '([^']+)'/);
  assert.ok(reason && reason[1].length > 0, 'expected a non-empty NO_DEPTH_REASON');
  assert.match(viewMenu, /title=\{\s*`\$\{t\('view\.depthOfMarket'\)\} — \$\{NO_DEPTH_REASON\}`\s*\} aria-disabled="true"/);

  const disabledItem = viewMenu.match(/<MenuItem[^>]*view\.depthOfMarket[^>]*\/>/);
  assert.ok(disabledItem, 'expected a MenuItem for view.depthOfMarket');
  assert.ok(disabledItem[0].includes('disabled'), 'expected the Depth Of Market MenuItem to be disabled');
  assert.ok(!disabledItem[0].includes('onClick'), 'expected no onClick on the disabled Depth Of Market entry');
  assert.doesNotMatch(viewMenu, /<MenuItem[^>]*view\.depthOfMarket[^>]*onClick/);

  assert.match(viewMenu, /text=\{t\('view\.marketWatch'\)\}[\s\S]*?onClick=\{runViewAction\('market-watch'/);
  assert.match(viewMenu, /text=\{t\('view\.navigator'\)\}[\s\S]*?onClick=\{runViewAction\('navigator'/);
  assert.match(viewMenu, /text=\{t\('view\.fullscreen'\)\}[\s\S]*?onClick=\{runViewAction\('fullscreen'/);
});
