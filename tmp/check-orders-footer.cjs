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
    await page.goto('http://localhost:5180/clients/orders');
    const panel = page.locator('.orders-page');
    await panel.waitFor();
    await page.waitForTimeout(1500);
    console.log(await panel.locator('.orders-grid-footer').evaluate(footer => {
      const box = footer.getBoundingClientRect();
      return [...footer.querySelectorAll('button, div > .tabular')].map(el => { const r = el.getBoundingClientRect(); return { label: el.textContent, centerOffset: Math.round((r.y + r.height / 2 - box.y - box.height / 2) * 10) / 10 }; });
    }));
    await panel.locator('table th').first().waitFor();
    await page.waitForTimeout(1500);
    console.log(await panel.evaluate(el => {
      const rect = s => el.querySelector(s).getBoundingClientRect();
      return { checkboxCount: el.querySelectorAll('input[type="checkbox"]').length, sortArrows: el.querySelectorAll('th svg').length, headingIcons: el.querySelectorAll('.orders-header > div:first-child svg').length,
        filtersBelowTitle: rect('.orders-filters').top > rect('.orders-subtitle').bottom,
        searchWidth: rect('.orders-search').width, headerHeight: rect('th').height, footerHeight: rect('.orders-grid-footer').height,
        filterWidths: [...el.querySelector('.orders-filters').children].map(n => n.getBoundingClientRect().width) };
    }));
    console.log(await panel.evaluate(el => ({ shield: el.querySelectorAll('.lucide-shield').length, searchIcon: el.querySelectorAll('.lucide-search').length, refresh: [...el.querySelectorAll('button')].some(b => b.textContent.includes('Refresh')), topPadding: getComputedStyle(el).paddingTop, gap: getComputedStyle(el).rowGap, searchPresent: !!el.querySelector('input') })));
    await page.screenshot({ path: 'tmp/orders-layout-check.png' });  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });





