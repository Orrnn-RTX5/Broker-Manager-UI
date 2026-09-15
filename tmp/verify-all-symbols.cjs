const { chromium } = require('C:/Users/ADMIN/AppData/Local/Temp/rtx5-playwright-tools/node_modules/playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Isolated visual fixture: no credentials or live account requests.
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (['fetch', 'xhr'].includes(route.request().resourceType()) && (!url.pathname.startsWith('/src/') && !url.pathname.startsWith('/node_modules/'))) {
        return route.fulfill({ json: { data: [], accounts: [], positions: [], symbols: [], total: 0 } });
      }
      return route.continue();
    });
    let requests=0;
    await page.route('**/SymbolsList*', async route => { requests++; await route.fulfill({json:Array.from({length:137},(_,i)=>({symbol:'TEST'+String(i).padStart(3,'0'),description:'Instrument '+i}))}); });
    await page.addInitScript(() => {
      localStorage.setItem('authToken', 'visual-fixture');
      sessionStorage.setItem('auth', JSON.stringify({ token: 'visual-fixture', login: 'preview', is_admin: true, expires_at: Date.now() + 3600000 }));
      localStorage.setItem('theme-storage', JSON.stringify({ state: { isDarkMode: false }, version: 0 }));
    });
    await page.goto('http://localhost:5180/dashboard');
    await page.locator('.cc-metric-card').first().waitFor();

    await page.getByRole('button',{name:'View All Symbols',exact:true}).click();
    await page.locator('.all-symbols-dialog tbody tr').first().waitFor();
    await page.getByText(/1.50 of 137 symbols/).waitFor();
    assert.ok(requests>0,'Click must request the server symbol list');
    assert.equal(await page.locator('.all-symbols-dialog tbody tr').count(),50);
    await page.getByRole('button',{name:'Next',exact:true}).click();
    await page.getByText(/51.100 of 137 symbols/).waitFor();
    await page.getByRole('textbox',{name:'Search symbols',exact:true}).fill('TEST136');
    await page.getByText(/1.1 of 1 symbols/).waitFor();
    assert.equal(await page.locator('.all-symbols-dialog tbody tr').count(),1);
    await page.getByRole('textbox',{name:'Search symbols',exact:true}).fill('');
    await page.screenshot({path:'artifacts/all-symbols-dialog.png'});
    const before=requests;
    await page.locator('.all-symbols-dialog').getByRole('button',{name:'Refresh',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('.all-symbols-table').getAttribute('aria-busy') || document.querySelector('.all-symbols-table').getAttribute('aria-busy')==='false');
    assert.ok(requests>before,'Refresh must fetch again');
    await page.keyboard.press('Escape');
    await page.locator('.all-symbols-dialog').waitFor({state:'detached'});
    assert.deepEqual(errors,[]);
    console.log('PASS: Dashboard click fetches 137 symbols; 50-row pagination; search beyond first page; refresh; Escape; no runtime errors.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
