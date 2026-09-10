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
    await page.goto('http://localhost:5180/clients');
    await page.locator('.clients-grid').waitFor();
    const load = page.locator('.clients-grid-header').getByRole('button', { name: 'Load', exact: true });
    if (await load.count()) await load.click();
    await page.waitForFunction(() => document.querySelector('.clients-grid tbody td:not(.clients-grid-empty)'));
    await page.waitForTimeout(1500);
    const rows = page.locator('.clients-grid tbody tr').filter({ has: page.locator('input[type="checkbox"]') });
    const row = rows.nth(1);
    const id = (await row.locator('td').nth(1).innerText()).trim();
    await row.locator('input[type="checkbox"]').check();
    const selected = page.locator('.clients-grid-footer').getByRole('button', { name: 'Selected', exact: true });
    await selected.click();
    const modal = page.locator('.ui-modal');
    await modal.waitFor();
    if (!(await modal.innerText()).includes(`ID ${id}`)) throw new Error('Selection opened the wrong client');
    const selectedDetails = await modal.innerText();
    await modal.getByRole('button', { name: 'Close', exact: true }).click();
    await row.locator('td').nth(1).dblclick();
    await modal.waitFor();
    if ((await modal.innerText()) !== selectedDetails) throw new Error('Selected and double-click dialogs differ');
    await modal.getByRole('button', { name: 'Close', exact: true }).click();
    await rows.nth(0).locator('input[type="checkbox"]').check();
    if (await row.locator('input[type="checkbox"]').isChecked()) throw new Error('Previous checkbox remained selected');
    if (await page.locator('.clients-grid tbody input:checked').count() !== 1) throw new Error('More than one client selected');
    const firstId = (await rows.nth(0).locator('td').nth(1).innerText()).trim();
    await selected.click();
    await modal.waitFor();
    if (!(await modal.innerText()).includes(`ID ${firstId}`)) throw new Error('Multiple selection did not open most recent client');
    await modal.getByRole('button', { name: 'Close', exact: true }).click();
    await page.screenshot({ path: 'tmp/client-selection-check.png' });
    await rows.nth(0).locator('input[type="checkbox"]').uncheck();
    if (await selected.count()) throw new Error('Selected button remains after clearing selection');
    if (await page.locator('.clients-heading svg').count()) throw new Error('Heading icon remains');
    console.log('PASS: single checkbox selection replaces previous selection; Selected opens correct details; double-click parity; deselection.');
    console.log(await page.locator('.clients-grid').evaluate(grid => {
      const measure = selector => { const el = grid.querySelector(selector); return { height: el.getBoundingClientRect().height, font: getComputedStyle(el).fontSize }; };
      return { column: measure('th'), row: measure('td'), footer: measure('.clients-grid-footer'), button: measure('button'), arrows: grid.querySelectorAll('th svg').length, accountIcons: grid.querySelectorAll('tbody .lucide-user').length, filterSearchGap: document.querySelector('.clients-search').getBoundingClientRect().top - document.querySelector('.clients-filters').getBoundingClientRect().bottom, labels: [...grid.querySelectorAll('th')].map(th => th.textContent) };
    }));
    await page.screenshot({ path: 'tmp/clients-layout-check.png' });
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });

