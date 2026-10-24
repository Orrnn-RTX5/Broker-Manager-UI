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
test('light-theme.css applies the RTX5 light color tokens across root and command shell', () => {
  const rootLight = tokens('./light-theme.css', 'html:not(.dark)');
  const shellLight = tokens('./light-theme.css', 'html:not(.dark) .rtx5-command-shell');

  assert.equal(rootLight['rtx-light-panel'], '#ffffff');
  assert.equal(rootLight['rtx-light-canvas'], '#f5f7fa');
  assert.equal(rootLight['rtx-light-panel-subtle'], '#f8fafc');
  assert.equal(rootLight['rtx-light-panel-header'], '#f2f4f7');
  assert.equal(rootLight['rtx-light-text'], '#101828');
  assert.equal(rootLight['rtx-light-text-alt'], '#0f172a');
  assert.equal(rootLight['rtx-light-text-secondary'], '#344054');
  assert.equal(rootLight['text-secondary'], '#475467');
  assert.equal(rootLight['rtx-light-text-muted'], '#667085');
  assert.equal(rootLight['rtx-light-border'], '#e4e7ec');
  assert.equal(rootLight['rtx-light-border-strong'], '#d0d5dd');
  assert.equal(rootLight['color-primary'], '#7f56d9');
  assert.equal(rootLight['rtx-light-accent'], '#6941c6');
  assert.equal(rootLight['color-profit'], '#1d4ed8');
  assert.equal(rootLight['color-quote-up'], '#1d4ed8');
  assert.equal(rootLight['color-loss'], '#f04438');
  assert.equal(rootLight['rtx-light-quote-down'], '#dc2626');

  assert.equal(shellLight['bg-app'], 'var(--rtx-light-canvas)');
  assert.equal(shellLight['bg-panel'], 'var(--rtx-light-panel)');
  assert.equal(shellLight['bg-elevated'], 'var(--rtx-light-panel-subtle)');
  assert.equal(shellLight['bg-hover'], 'var(--rtx-light-panel-header)');
  assert.equal(shellLight['accent'], 'var(--color-primary)');
  assert.equal(shellLight['accent-hover'], 'var(--rtx-light-accent)');
  assert.equal(shellLight['success'], 'var(--color-profit)');
  assert.equal(shellLight['danger'], 'var(--color-loss)');
});

