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
    await page.addInitScript(() => {
      localStorage.setItem('authToken', 'visual-fixture');
      sessionStorage.setItem('auth', JSON.stringify({ token: 'visual-fixture', login: 'preview', is_admin: true, expires_at: Date.now() + 3600000 }));
      localStorage.setItem('theme-storage', JSON.stringify({ state: { isDarkMode: false }, version: 0 }));
    });
    await page.route('**/SymbolsList*',r=>r.fulfill({json:['A.BASE','B.DERIVED']}));
    await page.route('**/SymbolCategoryList*',r=>r.fulfill({json:[{name:'Fast'},{name:'Slow'}]}));
    let releaseSlow;
    const slow=new Promise(resolve=>{releaseSlow=resolve});
    await page.route('**/SymbolsByCategory*',async r=>{if(r.request().url().includes('Slow'))await slow;await r.fulfill({json:r.request().url().includes('Slow')?[]:[{symbol:'A.BASE',enabled:true},{symbol:'B.DERIVED',symbolType:'derived',enabled:false}]});});
    await page.route('**/SymbolsParams*',async r=>{await slow;await r.fulfill({json:[{symbol:'A.BASE',digits:5},{symbol:'B.DERIVED',digits:5}]});});
    await page.goto('http://localhost:5180/symbol-management');


    await page.locator('.symbols-table tbody tr').filter({hasText:'A.BASE'}).waitFor();
    const base=page.locator('.symbols-table tbody tr').filter({hasText:'A.BASE'});
    const derived=page.locator('.symbols-table tbody tr').filter({hasText:'B.DERIVED'});
    await base.locator('td').nth(1).getByText('base',{exact:true}).waitFor();
    assert.equal((await derived.locator('td').nth(1).innerText()).trim(),'derived');
    assert.equal((await base.locator('td').nth(7).innerText()).trim(),'Enabled');
    assert.equal(await base.getByTitle('Edit',{exact:true}).isDisabled(),true);
    const columns = await page.evaluate(() => {
      const headerCells = [...document.querySelectorAll('.symbols-table thead th')];
      const firstRow = document.querySelector('.symbols-table tbody tr:not([aria-hidden="true"])');
      return headerCells.map((header, index) => {
        const head = header.getBoundingClientRect();
        const cell = firstRow.cells[index].getBoundingClientRect();
        return {
          headerLeft: head.left, headerWidth: head.width, cellLeft: cell.left, cellWidth: cell.width,
          headerAlign: getComputedStyle(header).textAlign,
          bodyAlign: getComputedStyle(firstRow.cells[index]).textAlign,
          borderRight: getComputedStyle(header).borderRightWidth,
        };
      });
    });
    columns.forEach((column, index) => {
      assert.ok(Math.abs(column.headerLeft - column.cellLeft) < .5, `column ${index} left edges align`);
      assert.ok(Math.abs(column.headerWidth - column.cellWidth) < .5, `column ${index} widths align`);
      assert.equal(column.headerAlign, 'center', `header ${index} is centered`);
      assert.equal(column.bodyAlign, 'center', `body column ${index} is centered`);
      if (index < columns.length - 1) assert.equal(column.borderRight, '1px', `column ${index} has a vertical grid line`);
    });
    console.log('PASS: Type and Status visible while parameter requests are still pending.');
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.screenshot({path:'artifacts/symbol-management-progress.png'});
    releaseSlow();
    await page.waitForFunction(()=>[...document.querySelectorAll('.symbols-table button[title="Edit"]')].every(b=>!b.disabled));
    const cached=await page.evaluate(async()=>{const api=await import('/src/services/api.js');const start=performance.now();const data=api.peekSymbolManagementData();return {ms:performance.now()-start,types:data.symbols.map(s=>s.symbolType)};});
    assert.deepEqual(cached.types,['base','derived']);
    console.log('PASS: Completed types available synchronously from cache:',cached.ms,'ms');
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
