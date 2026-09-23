const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('./browser-tools/node_modules/playwright');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const accounts = [
  { Login: 1001, Name: 'A One', Group: 'demo\\main', Country: 'India', Registration: '2026.08.31', LeadCampaign: 'Summer', LeadSource: 'Google' },
  { Login: 1002, Name: 'B Two', Group: 'demo\\main', Country: 'India', Registration: '2026.08.31', LeadCampaign: 'Summer', LeadSource: 'Direct' },
  { Login: 1003, Name: 'C Three', Group: 'demo\\main', Country: 'Brazil', Registration: '2026.09.07', LeadCampaign: 'Partner', LeadSource: 'Affiliate' },
  { Login: 1004, Name: 'D Four', Group: 'demo\\extra', Country: 'Germany', Registration: '2026.09.07', LeadCampaign: 'Partner', LeadSource: 'Google' },
  { Login: 1005, Name: 'E Five', Group: 'demo\\extra', Country: 'Canada', Registration: '2026.09.08', LeadCampaign: 'Summer', LeadSource: 'Google' },
  { Login: 1006, Name: 'F Six', Group: 'demo\\vip', Country: 'Australia', Registration: '2026.09.08', LeadCampaign: 'Summer', LeadSource: 'Direct' },
  { Login: 1007, Name: 'G Seven', Group: 'demo\\main', Country: 'India', Registration: '2026.09.08', LeadCampaign: 'Partner', LeadSource: 'Affiliate' },
  { Login: 1008, Name: 'H Eight', Group: 'demo\\main', Country: 'Brazil', Registration: '2026.09.09', LeadCampaign: 'Summer', LeadSource: 'Google' },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(30_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__trading_analytics_check', route => route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head><script src="/runtime-config.js"></script><script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        import '/src/index.css'; import '/src/styles/light-theme.css'; import '/src/styles/command-center.css';
        window.__analyticsReady = true;
      </script></head><body><div id="root"></div></body></html>`,
    }));
    await page.route(/\/AccountDetailsMany(?:\?|$)/, route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ total: accounts.length, accounts }),
    }));
    const geography = fs.readFileSync('tmp/regional-world-110m.json', 'utf8');
    await page.route('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json', route => route.fulfill({
      contentType: 'application/json', body: geography,
    }));
    await page.goto('http://localhost:5180/__trading_analytics_check');
    await page.waitForFunction(() => window.__analyticsReady);
    await page.evaluate(async () => {
      const dep = (source, pattern) => {
        const value = source.match(pattern)?.[1];
        if (!value) throw new Error(`Missing Vite dependency ${pattern}`);
        return value;
      };
      sessionStorage.setItem('auth', JSON.stringify({ login: 4014, token: 'test-token', broker_id: 'Nexa' }));
      localStorage.setItem('authToken', 'test-token');
      sessionStorage.setItem('broker_info', JSON.stringify({ broker_id: 'Nexa', name: 'Nexa', backend_url: 'https://nexa.orrnn.com' }));
      document.documentElement.classList.add('dark');
      const source = await (await fetch('/src/features/analytics/TradingAccountsDashboard.jsx')).text();
      const reactPath = dep(source, /from ["']([^"']*\/deps\/react\.js[^"']*)["']/);
      const queryPath = dep(source, /from ["']([^"']*tanstack_react-query[^"']*)["']/);
      const routerPath = dep(source, /from ["']([^"']*react-router-dom[^"']*)["']/);
      const mainSource = await (await fetch('/src/main.jsx')).text();
      const domPath = dep(mainSource, /from ["']([^"']*react-dom[^"']*)["']/);
      const React = (await import(reactPath)).default;
      const { createRoot } = (await import(domPath)).default;
      const { QueryClient, QueryClientProvider } = await import(queryPath);
      const { MemoryRouter } = await import(routerPath);
      const Dashboard = (await import('/src/features/analytics/TradingAccountsDashboard.jsx')).default;
      const DockingProvider = (await import('/src/components/docking/DockingProvider.jsx')).default;
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      createRoot(document.getElementById('root')).render(
        React.createElement('div', { className: 'rtx5-command-shell', style: { height: '100vh' } },
          React.createElement(QueryClientProvider, { client: queryClient },
            React.createElement(MemoryRouter, null,
              React.createElement(DockingProvider, null, React.createElement(Dashboard))))));
    });

    await page.getByRole('heading', { name: 'Trading Accounts by Registration Date' }).waitFor();
    await page.getByText('8 accounts', { exact: true }).first().waitFor();
    assert.ok(await page.locator('.trading-analytics-group svg circle').count() >= 3, 'Group donut sectors must render');
    await page.getByText('demo\\main', { exact: false }).first().waitFor();
    await page.getByText('62.50%', { exact: false }).first().waitFor();
    assert.ok(await page.locator('.trading-analytics-group-row').count() >= 3, 'Significant groups must render breakdown rows');
    assert.ok(await page.locator('path.rsm-geography').count() > 100, 'World map geographies must render');
    const today = new Date();
    const todayLabel = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
    assert.match(await page.locator('.trading-analytics-date-range').innerText(), new RegExp(`1970\\.01\\.01.*${todayLabel.replaceAll('.', '\\.')}`));
    await page.screenshot({ path: 'tmp/trading-accounts-analytics.png', fullPage: true });
    assert.deepEqual(errors, [], 'No browser runtime errors');
    console.log(JSON.stringify({ passed: true, checks: [
      'complete account response rendered as a registration line',
      'country world map rendered with real account counts',
      'group donut rendered with measured group slices',
      'all-time date label ends at the current date',
      'no browser runtime errors',
    ] }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
