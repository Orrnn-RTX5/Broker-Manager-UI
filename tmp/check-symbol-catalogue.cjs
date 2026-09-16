const assert = require('node:assert/strict');
const { chromium } = require('./browser-tools/node_modules/playwright');

const BASE_URL = process.env.SYMBOL_CHECK_URL || 'http://localhost:5180';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let browser;
const watchdog = setTimeout(async () => {
  console.error('Symbol catalogue browser check exceeded 90 seconds.');
  await browser?.close().catch(() => {});
  process.exit(1);
}, 90_000);

(async () => {
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(20_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // This isolated document loads the real Vite environment and styles, but
    // does not mount the application or create an authenticated user session.
    await page.route('**/__symbol_catalogue_check', route => route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head><script src="/runtime-config.js"></script>
        <script type="module">
          import RefreshRuntime from '/@react-refresh';
          RefreshRuntime.injectIntoGlobalHook(window);
          window.$RefreshReg$ = () => {};
          window.$RefreshSig$ = () => type => type;
          window.__vite_plugin_react_preamble_installed__ = true;
          import '/src/index.css';
          import '/src/styles/light-theme.css';
          window.__catalogueCheckReady = true;
        </script></head><body><div id="root"></div></body></html>`,
    }));
    await page.goto(`${BASE_URL}/__symbol_catalogue_check`);
    await page.waitForFunction(() => window.__catalogueCheckReady);

    const initial = await page.evaluate(async () => {
      const path = '/src/features/symbols/tabs/SymbolsTab.jsx';
      const source = await (await fetch(path)).text();
      const dependency = (text, expression, name) => {
        const match = text.match(expression);
        if (!match) throw new Error(`Cannot find transformed ${name} dependency`);
        return match[1];
      };
      const apiPath = dependency(source, /from ["']([^"']*\/services\/api\.js[^"']*)["']/, 'api.js');
      const api = await import(apiPath);
      const apiSource = await (await fetch(apiPath)).text();
      const clientPath = dependency(apiSource, /from ["']([^"']*\/apiClient\.js[^"']*)["']/, 'apiClient.js');
      const cataloguePath = dependency(apiSource, /from ["']([^"']*\/symbolCatalogue\.js[^"']*)["']/, 'symbolCatalogue.js');
      const client = (await import(clientPath)).default;
      const catalogue = await import(cataloguePath);
      const React = (await import('/node_modules/.vite/deps/react.js')).default;
      const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
      const Component = (await import(path)).default;
      const realNames = (await catalogue.fetchAvailableSymbolNames({ signal: AbortSignal.timeout(15_000) })).map(row => row.symbol);
      const configured = ['BTCUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD'];
      const configuredSet = new Set(configured);
      const configuredRows = configured.map(symbol => ({
        symbol, digits: 5, enabled: true, symbolType: 'base',
        contractSize: 100000, spread: 10, calcMode: 'forex',
      }));
      const expectedNames = [...new Set([...realNames, ...configured])].sort((a, b) => a.localeCompare(b));
      const feedOnlyName = realNames.find(name => !configuredSet.has(name));
      const originalGet = client.get;
      let requestCount = 0;
      client.get = async endpoint => {
        requestCount += 1;
        if (endpoint === '/SymbolsList') return configured;
        if (endpoint === '/SymbolCategoryList') return [];
        if (endpoint.startsWith('/SymbolsParams?')) {
          const requested = new Set(new URL(endpoint, location.origin).searchParams.getAll('symbols[]'));
          return configuredRows.filter(row => requested.has(row.symbol));
        }
        throw new Error(`Unexpected manager fixture request: ${endpoint.split('?')[0]}`);
      };

      let root;
      let host;
      const unmount = () => {
        root?.unmount();
        host?.remove();
        root = null;
        host = null;
      };
      const mount = async expectedCount => {
        unmount();
        host = document.createElement('main');
        host.id = 'symbol-catalogue-fixture';
        host.className = 'symbol-management-page';
        host.style = 'position:fixed;inset:0;padding:20px;background:var(--bg);';
        document.getElementById('root').append(host);
        root = createRoot(host);
        const started = performance.now();
        const requestsBefore = requestCount;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => { observer.disconnect(); reject(new Error('Timed out waiting for complete symbol table')); }, 20_000);
          const observer = new MutationObserver(() => {
            if (host.querySelector('table')?.getAttribute('aria-rowcount') !== String(expectedCount + 1)) return;
            if (!host.querySelector('tbody tr[aria-rowindex]')) return;
            observer.disconnect();
            clearTimeout(timer);
            requestAnimationFrame(resolve);
          });
          observer.observe(host, { subtree: true, childList: true, attributes: true, characterData: true });
          root.render(React.createElement(Component));
        });
        return { readyMs: +(performance.now() - started).toFixed(1), requests: requestCount - requestsBefore };
      };
      window.__symbolCatalogueCheck = { api, expectedNames, feedOnlyName, mount, requestCount: () => requestCount,
        cleanup: () => { unmount(); client.get = originalGet; } };
      api.invalidateSymbolManagementData();
      const cold = await mount(expectedNames.length);
      const complete = await api.symbolManagementList();
      const stored = JSON.parse(sessionStorage.getItem('rtx5_symbol_management_v2'));
      return {
        realFeedCount: realNames.length, expectedCount: expectedNames.length, feedOnlyName, cold,
        completeNames: complete.symbols.map(row => row.symbol), expectedNames,
        error: complete.error || '',
        cachedCount: stored?.symbols?.length,
        cachedFeedOnlyCount: stored?.symbols?.filter(row => row.__managementFeedOnly).length,
        feedOnlyHasGuessedFields: complete.symbols.filter(row => row.__managementFeedOnly).some(row =>
          ['enabled', 'digits', 'contractSize', 'spread', 'calcMode', 'symbolType'].some(key => row[key] !== undefined)),
      };
    });
    assert.ok(initial.realFeedCount >= 701, `Expected at least 701 real feed names; got ${initial.realFeedCount}`);
    assert.deepEqual(initial.completeNames, initial.expectedNames, 'All real feed and configured symbols must be present');
    assert.equal(initial.error, '');
    assert.equal(initial.cachedCount, initial.expectedCount, 'Complete union is saved to session cache');
    assert.ok(initial.cachedFeedOnlyCount >= 696);
    assert.equal(initial.feedOnlyHasGuessedFields, false);

    const fixture = page.locator('#symbol-catalogue-fixture');
    assert.equal(await fixture.locator('table').getAttribute('aria-rowcount'), String(initial.expectedCount + 1));
    await fixture.locator('.symbols-table').evaluate(element => { element.scrollTop = element.scrollHeight; });
    const lastExpected = initial.expectedNames.at(-1);
    await page.waitForFunction(name => [...document.querySelectorAll('#symbol-catalogue-fixture td.symbol-name-cell')]
      .some(cell => cell.textContent.trim() === name), lastExpected);
    assert.equal(await fixture.locator('tbody tr[aria-rowindex]').last().getAttribute('aria-rowindex'), String(initial.expectedCount + 1));
    await fixture.getByPlaceholder('Search symbols…').fill(initial.feedOnlyName);
    const feedRow = fixture.locator('tbody tr[aria-rowindex]').filter({ hasText: initial.feedOnlyName }).first();
    await feedRow.waitFor();
    assert.equal((await feedRow.locator('td').nth(1).innerText()).trim(), 'Feed only');
    assert.equal((await feedRow.locator('td').nth(7).innerText()).trim(), 'Unavailable');
    assert.equal(await feedRow.getByTitle('Edit', { exact: true }).isDisabled(), true);
    assert.equal(await feedRow.getByTitle('Enable', { exact: true }).isDisabled(), true);
    await fixture.getByPlaceholder('Search symbols…').fill('EURUSD');
    const configuredRow = fixture.locator('tbody tr[aria-rowindex]').filter({ has: page.locator('td.symbol-name-cell', { hasText: /^EURUSD$/ }) });
    assert.equal(await configuredRow.getByTitle('Edit', { exact: true }).isDisabled(), false);

    const cached = await page.evaluate(async () => {
      const check = window.__symbolCatalogueCheck;
      const measurements = [];
      for (let i = 0; i < 5; i += 1) measurements.push(await check.mount(check.expectedNames.length));
      return measurements;
    });
    assert.ok(cached.every(result => result.requests === 0), 'Cached reopen must make zero manager requests');

    const requestsBeforeRefresh = await page.evaluate(() => window.__symbolCatalogueCheck.requestCount());
    await fixture.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.waitForFunction(previous => window.__symbolCatalogueCheck.requestCount() > previous, requestsBeforeRefresh);
    await fixture.getByRole('button', { name: 'Refresh', exact: true }).waitFor();
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll('#symbol-catalogue-fixture button')].find(node => node.textContent.trim() === 'Refresh');
      return button && !button.disabled;
    });
    const refreshed = await page.evaluate(() => {
      const check = window.__symbolCatalogueCheck;
      const data = check.api.peekSymbolManagementData();
      return { names: data.symbols.map(row => row.symbol), error: data.error || '', requests: check.requestCount() };
    });
    assert.deepEqual(refreshed.names, initial.expectedNames);
    assert.equal(refreshed.error, '');
    assert.deepEqual(errors, []);
    await page.screenshot({ path: 'tmp/check-symbol-catalogue.png' });
    console.log(JSON.stringify({
      result: 'PASS', realFeedCount: initial.realFeedCount, completeCount: initial.expectedCount,
      cachedFeedOnlyCount: initial.cachedFeedOnlyCount, cold: initial.cold, cachedReopen: cached,
      feedOnlySearch: initial.feedOnlyName, lastSymbolAfterScroll: lastExpected,
      editProtection: 'passed', refresh: 'passed', runtimeErrors: errors,
      measurementScope: 'Real public feed catalogue; five mocked manager configurations; standalone SymbolsTab render',
    }, null, 2));
    await page.evaluate(() => window.__symbolCatalogueCheck.cleanup());
  } finally {
    await browser.close();
    clearTimeout(watchdog);
  }
})().catch(error => {
  clearTimeout(watchdog);
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
