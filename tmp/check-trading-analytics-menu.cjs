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

    const tradingAnalytics = page.getByRole('treeitem', { name: 'Trading Analytics', exact: true });
    await tradingAnalytics.waitFor();

    // Right-click on Trading Analytics: cancels native menu and opens custom MetaTrader menu
    const cancelled = await tradingAnalytics.evaluate(el =>
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 150 })));
    assert.equal(cancelled, false, 'Trading Analytics cancels the native context menu');

    const menu = page.locator('[role="menu"][aria-label="Trading Analytics actions"]');
    await menu.waitFor();
    assert.equal(await menu.count(), 1, 'Trading Analytics context menu opened');

    // Check item texts
    const items = menu.locator('> .cc-server-context-menu-row > [role="menuitem"]');
    assert.equal(await items.count(), 12, '12 total actions/presets in Trading Analytics context menu');
    assert.equal(await menu.locator('> [role="separator"]').count(), 1, '1 separator present');

    const itemDetails = await items.evaluateAll(els => els.map(el => ({
      label: el.querySelector('span').textContent,
      kbd: el.querySelector('kbd')?.textContent ?? null,
      action: el.dataset.action,
      arrow: el.querySelector('.cc-menu-arrow')?.textContent ?? null,
    })));

    assert.equal(itemDetails[0].label, 'Add');
    assert.equal(itemDetails[0].kbd, 'Insert');
    assert.equal(itemDetails[1].label, 'Add Folder');
    assert.equal(itemDetails[1].kbd, 'Alt+Insert');
    assert.equal(itemDetails[2].label, 'Rename');
    assert.equal(itemDetails[2].kbd, 'F2');
    assert.equal(itemDetails[3].label, 'Delete');
    assert.equal(itemDetails[3].kbd, 'Delete');

    assert.equal(itemDetails[4].label, 'Add Preset Trading Accounts');
    assert.equal(itemDetails[5].label, 'Add Preset Online Users');
    assert.equal(itemDetails[6].label, 'Add Preset Open Positions');
    assert.equal(itemDetails[7].label, 'Add Preset Open Orders');
    assert.equal(itemDetails[8].label, 'Add Preset Advertising Campaigns');
    assert.equal(itemDetails[9].label, 'Add Preset By Country');

    assert.equal(itemDetails[10].label, 'Add Preset Finteza Website');
    assert.equal(itemDetails[10].arrow, '▶');
    assert.equal(itemDetails[11].label, 'Add Preset Finteza Campaign');
    assert.equal(itemDetails[11].arrow, '▶');

    // Hover on 'Add Preset Finteza Campaign' to trigger campaign submenu
    const fintezaCampaignRow = menu.locator('.cc-server-context-menu-row[data-action="preset-finteza-campaign"]');
    await fintezaCampaignRow.hover();
    const campaignSubmenu = page.locator('.cc-context-submenu');
    await campaignSubmenu.waitFor();
    assert.equal(await campaignSubmenu.count(), 1, 'Finteza Campaign submenu opened');

    const campaignSubItems = await campaignSubmenu.locator('[role="menuitem"]').evaluateAll(els => els.map(el => el.querySelector('span').textContent));
    assert.deepEqual(campaignSubItems, [
      'Advertising Sources',
      'UTM Campaigns',
      'Ad Banners Performance',
      'Cost & ROI Tracking',
    ]);

    await page.screenshot({ path: 'tmp/trading-analytics-campaign-submenu.png' });
    console.log('Saved screenshot tmp/trading-analytics-campaign-submenu.png');

    // Test clicking a submenu item closes the menu
    await campaignSubmenu.locator('[role="menuitem"]').first().click();
    assert.equal(await menu.count(), 0, 'Clicking a submenu item closes menu');

    assert.deepEqual(errors, [], 'No browser console errors');
    console.log('All Trading Analytics context menu and submenu checks passed!');
  } finally {
    await browser.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
