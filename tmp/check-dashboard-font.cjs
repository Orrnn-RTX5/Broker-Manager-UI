const { chromium } = require('C:/Users/ADMIN/AppData/Local/Temp/rtx5-playwright-tools/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1365, height: 600 } });
    await page.addInitScript(() => localStorage.setItem('theme-storage', JSON.stringify({ state: { isDarkMode: true }, version: 0 })));
    await page.goto('http://localhost:5180/manager-login');
    await page.locator('#manager-login').fill('9000');
    await page.locator('#manager-password').fill(process.env.AUDIT_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/dashboard', { timeout: 45000 });
    const dashboard = await page.evaluate(() => ({ title: getComputedStyle(document.querySelector('.cc-dashboard-header h1')).fontSize, subtitle: getComputedStyle(document.querySelector('.cc-dashboard-header p')).fontSize, metric: getComputedStyle(document.querySelector('.cc-metric-main strong')).fontSize }));
    await page.screenshot({ path: 'tmp/dashboard-small-font-check.png' });
    await page.goto('http://localhost:5180/analytics/trading-accounts');
    await page.locator('.trading-analytics-page h1').waitFor();
    const reference = await page.evaluate(() => ({ title: getComputedStyle(document.querySelector('.trading-analytics-page h1')).fontSize, subtitle: getComputedStyle(document.querySelector('.trading-analytics-page p')).fontSize }));
    if (dashboard.title !== reference.title || dashboard.subtitle !== reference.subtitle || dashboard.metric !== reference.title) throw new Error('Dashboard font sizes do not match');
    console.log({ dashboard, reference });  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });




