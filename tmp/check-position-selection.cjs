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
    const rows = panel.locator('tbody tr').filter({ has: page.locator('input[type="checkbox"]') });
    await rows.nth(1).waitFor();
    const first = rows.nth(0);
    const second = rows.nth(1);
    const ticket = (await second.locator('td').nth(1).innerText()).trim();
    const login = (await second.locator('td').nth(2).innerText()).trim();
    await first.locator('input').check();
    await second.locator('input').check();
    if (await first.locator('input').isChecked()) throw new Error('Previous position remains checked');
    if (await panel.locator('tbody input:checked').count() !== 1) throw new Error('Multiple positions selected');
    const selected = panel.getByRole('button', { name: 'Selected', exact: true });
    await selected.click();
    const modal = page.locator(`[aria-label="Account details for ${login}"]`);
    await modal.waitFor();
    await page.waitForFunction(({ login, ticket }) => {
      const dialog = document.querySelector(`[aria-label="Account details for ${login}"]`);
      return dialog?.innerText.includes(ticket);
    }, { login, ticket });
    await page.getByRole('button', { name: 'Close account details', exact: true }).click();
    await second.locator('td').nth(1).dblclick();
    await modal.waitFor();
    await page.waitForFunction(({ login, ticket }) => document.querySelector(`[aria-label="Account details for ${login}"]`)?.innerText.includes(ticket), { login, ticket });
    await page.getByRole('button', { name: 'Close account details', exact: true }).click();
    await second.locator('input').uncheck();
    if (await selected.count()) throw new Error('Selected remains after deselection');
    await first.locator('input').check();
    await page.screenshot({ path: 'tmp/position-selection-check.png' });
    console.log('PASS: single checkbox selection; Selected opens correct account and ticket; double-click parity; deselection.');
    console.log(await panel.evaluate(el => ({ shield: el.querySelectorAll('.lucide-shield').length, searchIcon: el.querySelectorAll('.lucide-search').length, refresh: [...el.querySelectorAll('button')].some(b => b.textContent.includes('Refresh')), topPadding: getComputedStyle(el).paddingTop, gap: getComputedStyle(el).rowGap, searchPresent: !!el.querySelector('input') })));
    await page.screenshot({ path: 'tmp/open-positions-layout-check.png' });  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });



