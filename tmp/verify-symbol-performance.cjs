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
    for (let i = 0; i < 4; i++) {
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
      await page.waitForTimeout(i === 0 ? 8000 : 1500);
    }
    const table = page.locator('.symbols-table');
    await table.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(250);
    const end = await table.evaluate(el => {
      const total = Number(el.querySelector('table').getAttribute('aria-rowcount')) - 1;
      const actual = [...el.querySelectorAll('tbody tr[aria-rowindex]')];
      const last = actual.at(-1);
      if (Number(last.getAttribute('aria-rowindex')) !== total + 1) throw new Error('Last symbol inaccessible');
      if (actual.length > 25) throw new Error('Unbounded row rendering');
      return { total, rendered: actual.length, rowHeight: actual[0].getBoundingClientRect().height, symbol: last.querySelector('td').textContent.trim() };
    });
    await page.locator('.symbols-search input').fill(end.symbol);
    await page.waitForTimeout(300);
    if (await table.evaluate(el => el.scrollTop) !== 0) throw new Error('Search did not reset scroll');
    if (!(await table.innerText()).includes(end.symbol)) throw new Error('Search result missing');
    await page.locator('.symbols-search input').fill('zz-no-such-symbol-zz');
    await table.getByText('No symbols found.', { exact: true }).waitFor();
    await page.locator('.symbols-search input').fill('');
    console.log('PASS: last symbol reachable, bounded DOM rows, search from bottom, empty search, restore.', end);
    await page.screenshot({ path: 'tmp/symbol-performance-check.png' });
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });




