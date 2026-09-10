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
    const markets = page.locator('.cc-navigator').getByRole('treeitem', { name: 'Markets', exact: true });
    await markets.click();
    for (let i = 0; i < 2; i++) {
      if (i) await page.locator('.cc-navigator').getByRole('treeitem', { name: 'Dashboard', exact: true }).click();
      const timing = await page.evaluate(() => new Promise((resolve, reject) => {
        const start = performance.now();
        const timeout = setTimeout(() => { observer.disconnect(); reject(new Error('Symbols timed out')); }, 45000);
        const observer = new MutationObserver(() => {
          const rows = document.querySelectorAll('.symbols-table tbody tr');
          if (!rows.length) return;
          requestAnimationFrame(() => {
            clearTimeout(timeout); observer.disconnect();
            resolve({ renderMs: performance.now() - start, domRows: document.querySelectorAll('.symbols-table tbody tr').length });
          });
        });
        observer.observe(document.getElementById('root'), { subtree: true, childList: true });
        [...document.querySelectorAll('.cc-navigator [role="treeitem"]')].find(el => el.title === 'Symbol Management').click();
      }));
      console.log(i ? 'Warm navigation:' : 'First navigation:', timing);
      await page.waitForTimeout(1500);
    }  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });




