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
    await page.locator('[data-panel-id="market_data"] button[title="Close"]').click();
    await page.locator('[data-panel-id="owner_console"] button[title="Close"]').click();
    await page.getByRole('button', { name: 'Maximize Operations Terminal', exact: true }).click();
    await page.getByRole('button', { name: 'Reset workspace layout', exact: true }).click();
    await page.waitForTimeout(1500);
    for (const id of ['market_data', 'navigator', 'owner_console', 'terminal']) {
      if (!await page.locator(`[data-panel-id="${id}"]`).isVisible()) throw new Error(`Reset did not restore ${id}`);
    }
    if (await page.getByRole('button', { name: 'Restore Operations Terminal', exact: true }).count()) throw new Error('Reset left terminal maximized');
    console.log(await page.locator('[data-panel-id]').evaluateAll(nodes => nodes.map(n => ({ id: n.dataset.panelId, x: n.getBoundingClientRect().x, y: n.getBoundingClientRect().y, width: n.getBoundingClientRect().width, height: n.getBoundingClientRect().height }))));
    await page.screenshot({ path: 'tmp/reset-layout-check.png' });
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
