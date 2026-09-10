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
    await page.goto('http://localhost:5180/analytics/open-positions');
    const panel = page.locator('.open-positions-page');
    await panel.waitFor();
    console.log(await panel.evaluate(el => ({ shield: el.querySelectorAll('.lucide-shield').length, searchIcon: el.querySelectorAll('.lucide-search').length, refresh: [...el.querySelectorAll('button')].some(b => b.textContent.includes('Refresh')), topPadding: getComputedStyle(el).paddingTop, gap: getComputedStyle(el).rowGap, searchPresent: !!el.querySelector('input') })));
    await page.screenshot({ path: 'tmp/open-positions-layout-check.png' });  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });



