const { chromium } = require('C:/Users/ADMIN/AppData/Local/Temp/rtx5-playwright-tools/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1365, height: 600 } });
    await page.addInitScript(() => localStorage.setItem('theme-storage', JSON.stringify({ state: { isDarkMode: true }, version: 0 })));
    const reportRequests = [];
    const errors = [];
    page.on('request', r => { if (new URL(r.url()).pathname.includes('/reports/v1/summary')) reportRequests.push(new URL(r.url()).pathname); });
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text().slice(0, 200)); });
    await page.goto('http://localhost:5180/manager-login');
    await page.locator('#manager-login').fill('9000');
    await page.locator('#manager-password').fill(process.env.AUDIT_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/dashboard', { timeout: 45000 });
    await page.waitForTimeout(2000);
    const results = await page.evaluate(async () => {
      const { loadDashboardMetrics } = await import('/src/features/dashboard/useDashboardMetrics.js');
      const results = [];
      for (let i = 0; i < 2; i++) {
        const result = await loadDashboardMetrics();
        results.push({ mode: result.sourceMode, reportStatus: result.sources.summary.error, accountLimitAvailable: result.sources.accountLimit.ok });
      }
      return results;
    });
    await page.waitForTimeout(32000);
    console.log(JSON.stringify({ results, reportRequests, errors }));
    if (reportRequests.length) throw new Error('Unsupported report endpoint was still requested');
    if (!results.every(r => r.mode === 'paged-fallback' && r.accountLimitAvailable)) throw new Error('Fallback metrics did not load');
    console.log('PASS: no summary requests across initial load, repeated loads and automatic refresh; account metrics available.');  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });




