import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../../public/theme-init.js', import.meta.url), 'utf8');

test('theme bootstrap is an external blocking head script compatible with the strict CSP', () => {
  const head = html.slice(0, html.indexOf('</head>'));
  assert.match(head, /<script src="%BASE_URL%theme-init\.js"><\/script>/);
  for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    assert.match(attributes, /\bsrc=/);
    assert.equal(body.trim(), '', 'inline JavaScript is blocked by script-src self');
  }
});

test('external theme bootstrap defaults to dark mode and restores a saved light choice', () => {
  for (const [stored, expected] of [
    ['{"state":{"isDarkMode":true}}', ['dark']],
    ['{"state":{"isDarkMode":false}}', []],
    [null, ['dark']], ['{}', ['dark']], ['invalid JSON', ['dark']],
    [new Error('Storage denied'), ['dark']],
  ]) {
    const classes = new Set(['dark']);
    runInNewContext(script, {
      localStorage: { getItem: (key) => {
        assert.equal(key, 'theme-storage');
        if (stored instanceof Error) throw stored;
        return stored;
      } },
      document: { documentElement: { classList: {
        toggle: (value, enabled) => enabled ? classes.add(value) : classes.delete(value),
      } } },
    });
    assert.deepEqual([...classes], expected);
  }
});
