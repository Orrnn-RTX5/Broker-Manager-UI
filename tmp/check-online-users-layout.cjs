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
    await page.goto('http://localhost:5180/analytics/online-users');
    await page.locator('.online-users-grid').waitFor();
    const load = page.locator('.online-users-grid-header').getByRole('button', { name: 'Load', exact: true });
    if (await load.count()) await load.click();
    await page.waitForFunction(() => document.querySelector('.online-users-grid tbody td:not(.online-users-grid-empty)'));
    await page.waitForTimeout(1500);
    console.log(await page.locator('.online-users-grid').evaluate(grid => {
      const measure = selector => { const el = grid.querySelector(selector); return { height: el.getBoundingClientRect().height, font: getComputedStyle(el).fontSize }; };
      return { header: measure('.online-users-grid-header'), column: measure('th'), row: measure('td'), footer: measure('.online-users-grid-footer'), button: measure('button'), arrows: grid.querySelectorAll('th svg').length, labels: [...grid.querySelectorAll('th')].map(th => th.textContent) };
    }));
    await page.screenshot({ path: 'tmp/online-users-layout-check.png' });
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
