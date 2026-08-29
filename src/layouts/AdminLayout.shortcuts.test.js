import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const layoutSource = readFileSync(join(here, 'AdminLayout.jsx'), 'utf8');
const appSource = readFileSync(join(here, '..', 'App.jsx'), 'utf8');

test('Manager View shortcuts activate their matching workspace actions', () => {
  for (const [key, action] of Object.entries({
    m: 'market-watch',
    l: 'margin-calls',
    q: 'queue',
    t: 'toolbox',
  })) {
    assert.match(layoutSource, new RegExp(`${key}: '${action}'`));
  }

  assert.match(layoutSource, /e\.altKey && !ctrlKey && !e\.shiftKey && key === 'n'/);
  assert.match(layoutSource, /handleViewAction\('navigator'\)/);
  assert.match(layoutSource, /handleViewAction\('fullscreen'\)/);
  assert.match(layoutSource, /window\.addEventListener\('keydown', handleKeyDown, true\)/);
  assert.doesNotMatch(appSource, /e\.key\.toLowerCase\(\) === 'm'/);
});
