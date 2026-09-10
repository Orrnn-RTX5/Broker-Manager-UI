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
    const toggle = page.getByRole('button',{name:'Show account panel',exact:true});
    if (await toggle.count()) await toggle.click();
    const grid = page.locator('.accounts-sidebar-grid');
    await grid.waitFor({timeout:60000});
    await page.waitForFunction(() => {
      const raw=sessionStorage.getItem('rtx5_sidebar_accounts_cache_v2');
      return raw && JSON.parse(raw).hasMore === false;
    },{},{timeout:60000});
    const count=await grid.locator('tbody tr').count();
    console.log('All account rows:',count,'Load next buttons:',await page.getByRole('button',{name:/Load next/}).count());
    await page.reload();
    await page.waitForTimeout(1500);
    if (await toggle.count()) await toggle.click();
    await grid.waitFor({timeout:60000});
    console.log('Rows after reload:',await grid.locator('tbody tr').count());
    await page.screenshot({path:'tmp/accounts-auto-load.png'});  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });





