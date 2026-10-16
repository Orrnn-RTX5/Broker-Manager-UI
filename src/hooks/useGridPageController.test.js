import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';

// Exercise the real controller and selection hook with a small hook host.
// State writes are observable so a live-row echo into parent state is caught.
const host = { cursor: 0, slots: [], writes: 0 };
globalThis.__gridControllerHost = host;
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('./useGridPageController.js', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'browser',
  plugins: [{ name: 'grid-hook-host', setup(builder) {
    builder.onResolve({ filter: /^react$|resultDialogStore\.js$/ }, ({ path }) => ({ path, namespace: 'hook-host' }));
    builder.onLoad({ filter: /.*/, namespace: 'hook-host' }, ({ path }) => ({ loader: 'js', contents: path === 'react' ? `
      const host = globalThis.__gridControllerHost;
      export const useState = initial => {
        const index = host.cursor++;
        if (!(index in host.slots)) host.slots[index] = typeof initial === 'function' ? initial() : initial;
        return [host.slots[index], value => { host.writes++; host.slots[index] = typeof value === 'function' ? value(host.slots[index]) : value; }];
      };
      export const useRef = initial => {
        const index = host.cursor++;
        return host.slots[index] ??= { current: initial };
      };
      export const useCallback = callback => callback;
      export const useMemo = factory => factory();
    ` : 'export const showResult = { info() {}, success() {}, error() {} };' }));
  } }],
});
const { default: createController } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const render = () => {
  host.cursor = 0;
  return createController({ columns: [{ key: 'position', label: 'Ticket' }], rowKey: 'position' });
};

test('live row bursts do not update parent state and the context menu captures the latest rows', () => {
  host.slots = []; host.writes = 0;
  const controller = render();
  let latest;
  for (let profit = 0; profit < 200; profit += 1) {
    latest = [{ position: 42, profit }];
    controller.gridProps.onRowsChange(latest);
  }
  assert.equal(host.writes, 0, 'price frames must not cause parent render feedback');
  const event = { clientX: 10, clientY: 20, preventDefault() {}, stopPropagation() {} };
  controller.gridProps.onRowContext(event, latest[0]);
  const opened = render();
  assert.equal(host.writes, 1);
  assert.equal(opened.contextMenuProps.isOpen, true);
  assert.equal(opened.contextMenuProps.rows, latest);
  assert.equal(opened.contextMenuProps.selectedRow.profit, 199);
  opened.contextMenuProps.onClose();
  assert.equal(render().contextMenuProps.isOpen, false);
});
