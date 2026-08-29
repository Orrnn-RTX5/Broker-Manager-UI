import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const readComponent = (name) => readFileSync(join(here, name), 'utf8');

test('Manager File menu Exit invokes the supplied logout callback', () => {
  const fileMenu = readComponent('menus/FileMenu.jsx');
  const menuBar = readComponent('MenuBar.jsx');

  assert.match(fileMenu, /text="Exit"[\s\S]*?onClick=\{onExitClick\}/);
  assert.match(menuBar, /const handleExitClick = \(\) => \{[\s\S]*?setActiveMenu\(null\);[\s\S]*?onLogout\(\);[\s\S]*?\};/);
  assert.match(menuBar, /onExitClick=\{handleExitClick\}/);
});
