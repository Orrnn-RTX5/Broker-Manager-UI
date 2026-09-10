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
    await page.getByRole('button', {name:'New account', exact:true}).click();
    const panel = page.locator('.new-account-modal');
    await panel.waitFor();
    console.log(await panel.evaluate(el => {
      const style = sel => {const n=el.querySelector(sel), s=getComputedStyle(n); return {size:s.fontSize,weight:s.fontWeight,height:n.getBoundingClientRect().height};};
      return {title:style('#new-account-title'), section:style('h2'), label:style('label'), input:style('#new-account-first-name'), button:style('button[type=submit]'), overflow:el.scrollWidth>el.clientWidth};
    }));
    await page.locator('#new-account-first-name').fill('Preview');
    await page.screenshot({path:'tmp/new-account-compact.png'});
    await page.getByRole('button', {name:'Cancel',exact:true}).click();
    await panel.waitFor({state:'hidden'});  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });




