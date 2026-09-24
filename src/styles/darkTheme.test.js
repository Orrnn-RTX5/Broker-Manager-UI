import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tokens = (file, selector) => {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const block = source.slice(source.indexOf(`${selector} {`)).split('}')[0];
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]));
};
test('workspace and portalled dialogs share the requested dark palette', () => {
  const shell = tokens('./command-center.css', '.dark .rtx5-command-shell');
  const global = tokens('../index.css', '.dark');
  assert.equal(shell['bg-app'], '#181818');
  assert.equal(shell['text-primary'], 'var(--ink-1)');
  assert.equal(shell['accent-soft'], '#2f2f2f');
  for (const palette of [shell, global]) {
    assert.equal(palette.accent, '#007ecf');
    assert.equal(palette['ok-soft'], '#252e28');
    assert.equal(palette['danger-soft'], '#351e1a');
  }
  assert.ok(!Object.values(shell).includes('#343b58'));
  assert.ok(!Object.values(global).includes('#343b58'));
  assert.equal(global.bg, shell['bg-app']);
  assert.equal(global.text, shell['text-primary']);
  assert.equal(global['accent-soft'], shell['accent-soft']);
  assert.equal(global['surface-2'], shell['bg-elevated']);
});
test('light workspace palette stays unchanged', () => {
  const light = tokens('./command-center.css', '.rtx5-command-shell');
  assert.equal(light['bg-app'], '#f3f6fa');
  assert.equal(light['text-primary'], '#172033');
  assert.equal(light['accent-soft'], '#eaf2ff');
});
