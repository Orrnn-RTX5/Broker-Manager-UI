// Temporary verification for the Daily Report and Nexa navigator context menus.
const assert = require('node:assert/strict');
const { chromium } = require('./browser-tools/node_modules/playwright');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
    page.setDefaultTimeout(20_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__navigator_menu_check', route => route.fulfill({
      contentType: 'text/html', body: `<!doctype html><html><head><script src="/runtime-config.js"></script>
        <script type="module">
          import RefreshRuntime from '/@react-refresh';
          RefreshRuntime.injectIntoGlobalHook(window);
          window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
          window.__vite_plugin_react_preamble_installed__ = true;
          import '/src/index.css'; import '/src/styles/light-theme.css'; import '/src/styles/command-center.css';
          window.__navReady = true;
        </script></head><body><div id="root"></div></body></html>`,
    }));
    await page.route(/\/GroupList(?:\?|$)/, route => route.fulfill({
      contentType: 'application/json', body: JSON.stringify({ groups: [], total: 0 }),
    }));
    await page.route('**/auth/me', route => route.fulfill({
      contentType: 'application/json', body: JSON.stringify({ login: 4014, is_admin: true, permissions: [] }),
    }));
    await page.goto('http://localhost:5180/__navigator_menu_check');
    await page.waitForFunction(() => window.__navReady);
    await page.evaluate(async () => {
      const dep = (source, pattern) => {
        const value = source.match(pattern)?.[1];
        if (!value) throw new Error(`Missing Vite dependency ${pattern}`);
        return value;
      };
      const source = await (await fetch('/src/components/NavigatorPanel.jsx')).text();
      const reactPath = dep(source, /from ["']([^"']*\/deps\/react\.js[^"']*)["']/);
      const queryPath = dep(source, /from ["']([^"']*tanstack_react-query[^"']*)["']/);
      const routerPath = dep(source, /from ["']([^"']*react-router-dom[^"']*)["']/);
      const mainSource = await (await fetch('/src/main.jsx')).text();
      const domPath = dep(mainSource, /from ["']([^"']*react-dom[^"']*)["']/);
      const React = (await import(reactPath)).default;
      const { createRoot } = (await import(domPath)).default;
      const { QueryClient, QueryClientProvider } = await import(queryPath);
      const { MemoryRouter } = await import(routerPath);
      const NavigatorPanel = (await import('/src/components/NavigatorPanel.jsx')).default;
      sessionStorage.setItem('broker_info', JSON.stringify({ broker_id: 'Nexa', name: 'Nexa', backend_url: 'https://nexa.orrnn.com' }));
      sessionStorage.setItem('auth', JSON.stringify({ login: 4014, token: 'test-token' }));
      localStorage.setItem('authToken', 'test-token');
      document.documentElement.classList.add('dark');
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      createRoot(document.getElementById('root')).render(
        React.createElement('div', { className: 'rtx5-command-shell', style: { height: '100vh' } },
          React.createElement(QueryClientProvider, { client: queryClient },
            React.createElement(MemoryRouter, null, React.createElement(NavigatorPanel)))));
    });

    const server = page.getByRole('treeitem', { name: 'Nexa', exact: true });
    const dailyReport = page.getByRole('treeitem', { name: '(4014)- Daily Report', exact: true });
    const dashboard = page.getByRole('treeitem', { name: 'Dashboard', exact: true });
    await server.waitFor();
    await dailyReport.waitFor();
    assert.equal(await server.getAttribute('aria-haspopup'), 'menu');
    assert.equal(await dailyReport.getAttribute('aria-haspopup'), 'menu');
    assert.equal(await page.locator('[role="treeitem"][aria-haspopup]').count(), 9,
      'Nexa, Daily Report, and Analytics advertise context menus');

    // Unrelated navigator items keep the native context menu.
    const nativeKept = await dashboard.evaluate(el =>
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 220, clientY: 320 })));
    assert.equal(nativeKept, true, 'Dashboard keeps the native context menu');
    assert.equal(await page.locator('[role="menu"]').count(), 0);

    // Right-click Daily Report: open the solid four-action menu.
    const dailyCancelled = await dailyReport.evaluate(el =>
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 220, clientY: 320 })));
    assert.equal(dailyCancelled, false, 'Daily Report cancels the native context menu');
    const menu = page.locator('[role="menu"]');
    await menu.waitFor();
    assert.equal(await menu.count(), 1);
    assert.equal(await menu.evaluate(el => el.parentElement?.classList.contains('rtx5-command-shell')), true,
      'Menu portals to the themed command shell');
    assert.equal(await menu.getAttribute('aria-label'), 'Daily Report actions');
    const appearance = await menu.evaluate(el => {
      const style = getComputedStyle(el);
      return { backgroundColor: style.backgroundColor, borderRadius: style.borderRadius, fontSize: style.fontSize };
    });
    assert.notEqual(appearance.backgroundColor, 'rgba(0, 0, 0, 0)', 'Menu background must be opaque');
    assert.equal(appearance.borderRadius, '6px');
    assert.equal(appearance.fontSize, '11px');

    const items = menu.locator('[role="menuitem"]');
    assert.equal(await items.count(), 4);
    assert.equal(await menu.locator('[role="separator"]').count(), 1);
    const itemDetails = () => items.evaluateAll(els => els.map(el => ({
      label: el.querySelector('span').textContent,
      kbd: el.querySelector('kbd')?.textContent ?? null,
      action: el.dataset.action,
      disabled: el.disabled,
    })));
    assert.deepEqual(await itemDetails(), [
      { label: 'Connect to the Server', kbd: 'Enter', action: 'connect', disabled: false },
      { label: 'Disconnect from the Server', kbd: null, action: 'disconnect', disabled: false },
      { label: 'Change Password', kbd: null, action: 'change-password', disabled: false },
      { label: 'Delete the Account', kbd: 'Delete', action: 'delete-account', disabled: false },
    ]);

    const focusedIndex = () => page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="menuitem"]')).indexOf(document.activeElement));
    assert.equal(await focusedIndex(), 0, 'First Daily Report option is focused on open');
    await page.keyboard.press('ArrowDown');
    assert.equal(await focusedIndex(), 1, 'ArrowDown moves focus down');
    await page.keyboard.press('End');
    assert.equal(await focusedIndex(), 3, 'End moves focus to the last option');
    await page.keyboard.press('ArrowUp');
    assert.equal(await focusedIndex(), 2, 'ArrowUp moves focus up');
    await page.keyboard.press('Home');
    assert.equal(await focusedIndex(), 0, 'Home moves focus to the first option');
    await page.screenshot({ path: 'tmp/daily-report-context-menu.png' });
    await page.keyboard.press('Escape');
    assert.equal(await menu.count(), 0, 'Escape closes the Daily Report menu');

    // Right-click Nexa: open only Connect and disabled Disconnect.
    const serverCancelled = await server.evaluate(el =>
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 220, clientY: 200 })));
    assert.equal(serverCancelled, false, 'Nexa cancels the native context menu');
    await menu.waitFor();
    assert.equal(await menu.getAttribute('aria-label'), 'Nexa connection actions');
    assert.equal(await items.count(), 2);
    assert.equal(await menu.locator('[role="separator"]').count(), 0);
    assert.deepEqual(await itemDetails(), [
      { label: 'Connect to the Server', kbd: 'Enter', action: 'connect', disabled: false },
      { label: 'Disconnect from the Server', kbd: null, action: 'disconnect', disabled: true },
    ]);
    assert.equal(await focusedIndex(), 0, 'Connect is focused on open');
    await page.keyboard.press('ArrowDown');
    assert.equal(await focusedIndex(), 0, 'Keyboard navigation skips disabled Disconnect');
    await page.screenshot({ path: 'tmp/nexa-server-context-menu.png' });
    await page.keyboard.press('Escape');

    // Outside pointer-down and enabled item selection close either menu.
    await server.evaluate(el =>
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 220, clientY: 320 })));
    await menu.waitFor();
    await page.mouse.click(700, 600);
    assert.equal(await menu.count(), 0, 'Outside pointer-down closes the menu');
    await dailyReport.evaluate(el =>
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 220, clientY: 320 })));
    await menu.waitFor();
    await items.first().click();
    assert.equal(await menu.count(), 0, 'Choosing an enabled option closes the menu');

    // Opening the taller Daily Report menu near the corner keeps it inside the viewport.
    await dailyReport.evaluate(el =>
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: innerWidth - 6, clientY: innerHeight - 6 })));
    await menu.waitFor();
    const box = await menu.boundingBox();
    assert.ok(box, 'Menu has a bounding box');
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1440 && box.y + box.height <= 920,
      `Menu must stay inside the viewport, got ${JSON.stringify(box)}`);
    await page.keyboard.press('Escape');

    assert.deepEqual(errors, [], 'No browser runtime errors');
    console.log(JSON.stringify({ passed: true, checks: [
      'Daily Report and Nexa are the only custom-menu targets',
      'Daily Report opens four actions with one separator',
      'Nexa opens only Connect and disabled Disconnect',
      'both menus use an opaque themed surface',
      'keyboard navigation skips disabled actions',
      'Escape, outside pointer-down and enabled option click close menus',
      'bottom-right open clamps inside the viewport',
      'no page errors',
    ] }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
