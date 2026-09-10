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
    await page.goto('http://localhost:5180/symbol-management');
    const panel = page.locator('.symbol-management-page');
    await panel.waitFor();
    await panel.locator('.symbols-table tbody tr').nth(2).waitFor({ timeout: 45000 });
    console.log(await panel.evaluate(el => {
      const table = el.querySelector('.symbols-table').getBoundingClientRect();
      const rows = [...el.querySelectorAll('.symbols-table tbody tr')].map(row => row.getBoundingClientRect());
      const tabs = [...el.querySelectorAll('.symbol-management-tab')].map(tab => tab.getBoundingClientRect());
      const visibleRows = rows.filter(r => r.top >= table.top && r.bottom <= table.bottom - 8).length;
      if (visibleRows < 3) throw new Error(`Only ${visibleRows} complete rows visible`);
      return { visibleRows, rowHeight: rows[0].height, tableHeight: table.height, tabHeights: tabs.map(t => t.height) };
    }));
    console.log(await panel.evaluate(el => ({ shield: el.querySelectorAll('.lucide-shield').length, searchIcon: el.querySelectorAll('.lucide-search').length, refresh: [...el.querySelectorAll('button')].some(b => b.textContent.includes('Refresh')), topPadding: getComputedStyle(el).paddingTop, gap: getComputedStyle(el).rowGap, searchPresent: !!el.querySelector('input') })));
    await page.screenshot({ path: 'tmp/symbols-layout-check.png' });  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });




