// Browser integration fixtures only. No sample values are shipped in the report.
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
    await page.route('**/__daily_report_check', route => route.fulfill({
      contentType: 'text/html', body: `<!doctype html><html><head><script src="/runtime-config.js"></script>
        <script type="module">
          import RefreshRuntime from '/@react-refresh';
          RefreshRuntime.injectIntoGlobalHook(window);
          window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
          window.__vite_plugin_react_preamble_installed__ = true;
          import '/src/index.css'; import '/src/styles/light-theme.css';
          window.__reportReady = true;
        </script></head><body><div id="root"></div></body></html>`,
    }));
    await page.goto('http://localhost:5180/__daily_report_check');
    await page.waitForFunction(() => window.__reportReady);
    await page.evaluate(async () => {
      const dep = (source, pattern) => {
        const value = source.match(pattern)?.[1];
        if (!value) throw new Error(`Missing Vite dependency ${pattern}`);
        return value;
      };
      const path = '/src/features/reports/DailyReportPage.jsx';
      const source = await (await fetch(path)).text();
      const hookPath = dep(source, /from ["']([^"']*\/useDailyReport\.js[^"']*)["']/);
      const hook = await (await fetch(hookPath)).text();
      const apiPath = dep(hook, /from ["']([^"']*\/services\/api\.js[^"']*)["']/);
      const queryPath = dep(hook, /from ["']([^"']*tanstack_react-query[^"']*)["']/);
      const authPath = dep(hook, /from ["']([^"']*\/authService\.js[^"']*)["']/);
      const apiSource = await (await fetch(apiPath)).text();
      const clientPath = dep(apiSource, /from ["']([^"']*\/apiClient\.js[^"']*)["']/);
      const api = await import(apiPath);
      const client = (await import(clientPath)).default;
      const auth = (await import(authPath)).default;
      const React = (await import('/node_modules/.vite/deps/react.js')).default;
      const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
      const { QueryClient, QueryClientProvider } = await import(queryPath);
      const Component = (await import(path)).default;
      const state = { version: 1, fail: false, sourceFields: true, partial: false, missingUsd: false, calls: [], session: 1 };
      const rows = Array.from({ length: 501 }, (_, i) => ({ Login: 1000 + i, LeadSource: i < 300 ? 'Website' : i < 450 ? 'Partner' : '' }));
      window.__RTX_RUNTIME_CONFIG__.REPORTS_SUMMARY_ENABLED = 'true';
      localStorage.setItem('broker_info', JSON.stringify({ broker_id: 'Nexa', name: 'Nexa', backend_url: 'https://nexa.orrnn.com' }));
      auth.getAuthToken = () => `fixture-session-${state.session}`;
      auth.getSessionClaims = () => ({ login: 9000, brokerId: 'Nexa' });
      client.get = async endpoint => {
        state.calls.push(endpoint);
        if (state.fail) throw new Error('Fixture connection interrupted');
        if (endpoint === '/AccountLimitStatus') return { real_account_count: 400 + state.version, demo_account_count: 100 };
        if (endpoint.startsWith('/reports/v1/summary?')) {
          const date = new URL(endpoint, location.origin).searchParams.get('date');
          return { data: [
            { date, currency: 'USD', total_deposits: state.missingUsd ? null : 1000 * state.version, total_withdrawals: state.missingUsd ? null : -250 },
            { date, currency: 'EUR', total_deposits: 700 * state.version, total_withdrawals: 100 },
          ] };
        }
        throw new Error(`Unexpected fixture request ${endpoint}`);
      };
      // Seed the shared account-grid cache with an unrelated one-row page.
      client.getRaw = async () => new Response(JSON.stringify({ accounts: [{ Login: 1, LeadSource: 'STALE GRID CACHE' }], total: 1 }));
      await api.getTradingAccountsPage({ limit: 30, offset: 0 });
      client.getRaw = async endpoint => {
        state.calls.push(endpoint);
        if (state.fail) throw new Error('Fixture connection interrupted');
        const url = new URL(endpoint, location.origin);
        const offset = Number(url.searchParams.get('offset'));
        const limit = Number(url.searchParams.get('limit'));
        if (offset > 0 && state.partial) throw new Error('Fixture second page failed');
        const items = rows.slice(offset, offset + limit).map(row => state.sourceFields ? row : { Login: row.Login });
        return new Response(JSON.stringify({ accounts: items, total: rows.length }), { headers: { 'content-type': 'application/json' } });
      };
      let root;
      let queryClient;
      const mount = (fresh = true) => {
        root?.unmount();
        if (fresh) { queryClient?.clear(); queryClient = new QueryClient(); }
        root = createRoot(document.getElementById('root'));
        root.render(React.createElement(QueryClientProvider, { client: queryClient }, React.createElement(Component)));
      };
      mount();
      window.__dailyReport = { state, mount, client: () => queryClient,
        cache: () => queryClient.getQueryCache().getAll().map(query => ({ key: query.queryKey, data: query.state.data })) };
    });
    const report = page.locator('.daily-report');
    await page.waitForFunction(() => document.querySelector('.daily-report-donut-total strong')?.textContent === '501');
    assert.match(await report.innerText(), /Nexa · Daily Report/);
    assert.equal(await report.locator('svg.recharts-surface').count(), 3);
    assert.equal(await report.getByText('STALE GRID CACHE').count(), 0, 'Report must bypass the grid cache');
    assert.deepEqual(await page.evaluate(() => window.__dailyReport.cache().filter(row => row.key.at(-1) !== 'sources').map(row => row.data.observations.length)), [1, 1]);
    const sourceCounts = await report.locator('.daily-report-source-list strong').allTextContents();
    assert.deepEqual(sourceCounts, ['300', '150', '51']);
    await report.getByLabel('Report currency').selectOption('EUR');
    assert.match(await report.locator('.daily-report-metric').nth(2).innerText(), /EUR\s+700.00/);
    await report.getByLabel('Report currency').selectOption('USD');
    await page.evaluate(() => { window.__dailyReport.state.version = 2; });
    await report.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.daily-report-metric strong')[0]?.textContent === '402');
    assert.match(await report.locator('.daily-report-metric').nth(2).innerText(), /2,000.00/);
    assert.equal(await page.evaluate(() => window.__dailyReport.cache().find(row => row.key.at(-1) === 'accounts').data.observations.length), 2);
    await page.screenshot({ path: 'tmp/daily-report-verified.png', fullPage: true });

    await page.evaluate(() => { window.__dailyReport.state.fail = true; });
    await report.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.daily-report-status.is-stale').length === 3);
    assert.match(await report.locator('.daily-report-metric').first().innerText(), /402/);
    assert.equal(await page.evaluate(() => window.__dailyReport.cache().find(row => row.key.at(-1) === 'accounts').data.observations.length), 2, 'Errors must not add fake observations');

    await page.evaluate(() => { const check = window.__dailyReport; check.state.fail = false; check.state.missingUsd = true; check.mount(); });
    await page.waitForFunction(() => document.querySelector('#report-cash-heading')?.textContent.includes('EUR'));
    assert.match(await report.locator('.daily-report-metric').nth(2).innerText(), /EUR\s+1,400.00/);

    await page.evaluate(() => { const check = window.__dailyReport; check.state.sourceFields = false; check.state.partial = false;
      window.__RTX_RUNTIME_CONFIG__.REPORTS_SUMMARY_ENABLED = 'false'; check.mount(); });
    await report.getByText('Cash-flow reporting is not enabled for this broker.').waitFor();
    await report.getByText('Account source information is not provided by this server.').waitFor();
    assert.equal(await report.locator('.daily-report-donut').count(), 0);
    assert.equal(await report.locator('#report-cash-heading').locator('..').locator('..').locator('svg.recharts-surface').count(), 0);
    await page.screenshot({ path: 'tmp/daily-report-unavailable.png', fullPage: true });

    await page.evaluate(() => { const check = window.__dailyReport; check.state.sourceFields = true; check.state.partial = true; check.mount(); });
    await report.getByText('A complete account list with source information is required. An incomplete list is never shown as the total.').waitFor();
    assert.equal(await report.locator('.daily-report-donut').count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Report must fit mobile width');
    assert.deepEqual(errors, [], 'No browser runtime errors');
    console.log(JSON.stringify({ passed: true, checks: ['three real components with API fixtures', '501 accounts over two pages', 'stale grid cache bypass', 'single measured first point', 'refresh appends server readings', 'currency separation', 'stale data labeling', 'missing USD fallback', 'disabled reporting without graph', 'source metadata unavailable', 'incomplete pagination rejected', 'mobile width'], limitations: 'Isolated browser API fixtures; no authenticated company results were supplied.' }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
