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
    for (const [label, path] of [['Clients', '/clients'], ['Position History', '/clients/positions'], ['Trading Accounts', '/clients/trading-accounts'], ['Orders', '/clients/orders']]) {
      await page.locator('.cc-navigator').getByRole('treeitem', { name: label, exact: true }).click();
      await page.waitForURL(`**${path}`);
      const active = await page.locator('.cc-navigator .is-active > [role="treeitem"]').allTextContents();
      if (active.length !== 1 || active[0].trim() !== label) throw new Error(`Incorrect highlights for ${label}: ${active}`);
      console.log(`PASS: ${label} is the only active Navigator item`);
    }
    await page.locator('.cc-navigator').getByRole('treeitem', { name: 'Position History', exact: true }).click();
    await page.screenshot({ path: 'tmp/navigator-selection-check.png' });  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });




