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
    for (const [route, selector] of [['/clients/trading-accounts', '.trading-accounts-page'], ['/dealing', '.deals-page']]) {
      await page.goto('http://localhost:5180' + route);
      const panel = page.locator(selector);
      await panel.waitFor();
      await panel.locator('tbody tr').first().waitFor();
      await page.waitForTimeout(1500);
      console.log(route, await panel.evaluate(el => {
        const style = sel => { const n = el.querySelector(sel); if (!n) return null; const s = getComputedStyle(n); return {size:s.fontSize,weight:s.fontWeight,height:n.getBoundingClientRect().height}; };
        return {title:style('h1'), subtitle:style('p'), cell:style('tbody td'), header:style('th'), input:style('input'), button:style('[class*="grid-footer"] button'), footer:style('[class*="grid-footer"]'), padding:getComputedStyle(el).padding, overflow:el.scrollWidth > el.clientWidth, headers:el.querySelectorAll('th').length, cells:el.querySelector('tbody tr')?.children.length, arrows:el.querySelectorAll('th svg').length};
      }));
    }
    await page.screenshot({path:'tmp/dealing-layout-check.png'});  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });




