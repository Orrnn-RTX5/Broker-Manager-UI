import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';

// Render the real dialog to static markup. A `note` field is display-only: it
// shows its text and renders no input, so a market-only action cannot collect a price.
const here = dirname(fileURLToPath(import.meta.url));
const bundled = await build({
  stdin: {
    contents: [
      "import DealerPromptDialog from './DealerPromptDialog.jsx';",
      "import { createElement } from 'react';",
      "import { renderToStaticMarkup } from 'react-dom/server';",
      'export const render = (fields) => renderToStaticMarkup(createElement(DealerPromptDialog, {',
      '  title: "Test", fields, onSubmit: () => {}, onCancel: () => {}, loading: false,',
      '}));',
    ].join('\n'),
    resolveDir: here,
    loader: 'js',
  },
  bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
  // react-dom/server reaches Node builtins through require; give the ESM bundle a real one.
  banner: { js: `import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(${JSON.stringify(import.meta.url)});` },
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.jsx': 'jsx' },
  logLevel: 'silent',
});
const { render } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

test('a note field shows its text and renders no input', () => {
  const html = render([{ key: 'market', type: 'note', text: 'Closes at the current market price.' }]);
  assert.match(html, /Closes at the current market price\./);
  assert.doesNotMatch(html, /<input/);
  assert.doesNotMatch(html, /<label/);
});

test('an ordinary field still renders its label and input', () => {
  const html = render([{ key: 'comment', label: 'Comment', type: 'text' }]);
  assert.match(html, /Comment/);
  assert.match(html, /<input/);
});
