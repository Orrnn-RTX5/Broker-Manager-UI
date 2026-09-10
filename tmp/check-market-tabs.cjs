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
    const market = page.locator('.market-data-compact').first();
    await market.locator('tr.market-row').first().waitFor({timeout:45000});
    await market.getByRole('button',{name:'Details',exact:true}).click();
    await market.locator('.market-quote-details').waitFor();
    console.log('Details', await market.locator('.market-quote-details').innerText());
    await market.getByRole('button',{name:'Ticks',exact:true}).click();
    await market.locator('svg[role=img]').waitFor();
    await page.waitForTimeout(5000);
    console.log('Ticks', await market.locator('.market-quote-ticks').innerText());
    console.log('Chart dimensions',await market.locator('svg[role=img]').boundingBox());
    await page.screenshot({path:'tmp/market-ticks-fixed.png'});
    await market.getByRole('button',{name:'Symbols',exact:true}).click();
    const second = market.locator('tr.market-row').nth(1);
    const name = await second.locator('.market-quote-symbol span').first().innerText();
    await second.click();
    await market.getByRole('button',{name:'Details',exact:true}).click();
    if (!(await market.locator('.market-quote-details').innerText()).includes(name)) throw Error('Selection did not update details');
    await page.screenshot({path:'tmp/market-details-fixed.png'});
    console.log('Selected symbol updates details:',name);  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });




