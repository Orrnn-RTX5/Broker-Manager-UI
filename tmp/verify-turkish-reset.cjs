const { chromium } = require('C:/Users/ADMIN/AppData/Local/Temp/rtx5-playwright-tools/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const {default:hi} = await import('../src/i18n/locales/tr.js');
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: {width:1440,height:1000} });
    const errors=[];
    page.on('pageerror', error=>errors.push(error.message));
    await page.goto('http://localhost:5180/manager-login');
    await page.locator('#manager-login').waitFor();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(/(B\u00f6lgesel faaliyet|Parolay\u0131 g\u00f6ster|H\u0131zl\u0131 ayarlar)/.test(await page.locator('body').innerText()), false);
    console.log('PASS: first visit and login screen are English');
    await page.locator('#manager-login').fill('9000');
    await page.locator('#manager-password').fill(process.env.TURKISH_AUDIT_PASSWORD);
    await page.locator('button[type=submit]').click();
    await page.waitForURL('**/dashboard', {timeout:45000});
    await page.locator('.rtx5-command-shell').waitFor();
    async function selectTurkish() {
      await page.getByText('View', {exact:true}).first().click();
      await page.getByText('Languages', {exact:true}).click();
      await page.getByRole('button', {name:'Turkish (TR)',exact:true}).click();
      await page.waitForTimeout(300);
      assert.equal(await page.locator('html').getAttribute('lang'), 'tr');
      assert.equal(await page.evaluate(()=>localStorage.getItem('manager_language')), 'tr');
    }
    async function verifyReset(name) {
      await page.waitForTimeout(600);
      assert.equal(await page.locator('html').getAttribute('lang'),'en',name);
      assert.equal(await page.evaluate(()=>localStorage.getItem('manager_language')),null,name);
      assert.equal(await page.evaluate(()=>sessionStorage.getItem('manager_language')),null,name);
      const turkishText=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>el.children.length===0&&el.getClientRects().length&&/(B\u00f6lgesel faaliyet|Parolay\u0131 g\u00f6ster|H\u0131zl\u0131 ayarlar)/.test(el.textContent)).map(el=>el.textContent));
      assert.deepEqual(turkishText,[],`${name}: leftover Turkish`);
      console.log('PASS: '+name+' clears Turkish and restores English');
    }
    await selectTurkish();
    await page.reload();
    await page.locator('.rtx5-command-shell').waitFor();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('html').getAttribute('lang'),'tr');
    console.log('PASS: selected Turkish survives reload');
    await page.getByRole('button',{name:"Çalışma alanı düzenini sıfırla",exact:true}).click();
    await verifyReset('toolbar Reset');
    await selectTurkish();
    await page.getByRole('button',{name:hi['bar.quickSettings'],exact:true}).click();
    await page.getByRole('menuitem').filter({hasText:hi['bar.resetLayout']}).click();
    await verifyReset('quick settings Reset');
    await selectTurkish();
    await page.getByText(hi['menu.window'],{exact:true}).first().click();
    await page.getByText(hi['window.resetToDefault'],{exact:true}).click();
    await verifyReset('Window menu Reset');
    await page.reload();
    await page.locator('.rtx5-command-shell').waitFor();
    await verifyReset('reload after Reset');
    await selectTurkish();
    await page.locator('.cc-map-visual').waitFor();
    await page.waitForTimeout(500);
    const cdp=await page.context().newCDPSession(page);
    const shot=await cdp.send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync('artifacts/turkish-dashboard.png',Buffer.from(shot.data,'base64'));
    assert.deepEqual(errors,[],'browser errors');
    fs.writeFileSync('C:/Users/ADMIN/AppData/Local/Temp/turkish-reset-results.json',JSON.stringify({firstVisit:'en',savedSelection:'tr',toolbarReset:'en',settingsReset:'en',windowReset:'en',afterResetReload:'en',pageErrors:errors},null,2));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error.message);process.exit(1);});
