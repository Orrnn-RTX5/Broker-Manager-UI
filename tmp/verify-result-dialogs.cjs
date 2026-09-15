const { chromium } = require('C:/Users/ADMIN/AppData/Local/Temp/rtx5-playwright-tools/node_modules/playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => { errors.push('Unexpected native ' + dialog.type()); dialog.dismiss(); });
    await page.goto('http://localhost:5180');
    await page.locator('#manager-login').waitFor();
    for (const dark of [false, true]) {
      await page.evaluate(async dark => {
        document.documentElement.classList.toggle('dark', dark);
        document.querySelector('#manager-login').focus();
        const { showResult } = await import('/src/store/resultDialogStore.js');
        showResult({ retcode: 'MT_RET_ERR_PARAMS', message: 'Close Position #19325 failed\n\nclient_order_id is required exactly once for an engine command' });
        showResult.success('Account restrictions updated successfully.');
      }, dark);
      await page.locator('.result-dialog.is-error').waitFor();
      assert.match(await page.locator('.result-dialog').innerText(), /MT_RET_ERR_PARAMS/);
      assert.equal(await page.locator('.result-dialog-done').evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.closest('.result-dialog') !== null), true);
      await page.screenshot({ path: `artifacts/result-error-${dark ? 'dark' : 'light'}.png` });
      await page.keyboard.press('Escape');
      await page.locator('.result-dialog.is-success').waitFor();
      await page.screenshot({ path: `artifacts/result-success-${dark ? 'dark' : 'light'}.png` });
      await page.locator('.result-dialog-done').click();
      await page.locator('.result-dialog').waitFor({ state: 'detached' });
      assert.equal(await page.locator('#manager-login').evaluate(el => el === document.activeElement), true);
    }
    await page.setViewportSize({ width: 360, height: 640 });
    await page.evaluate(async () => {
      const { showResult } = await import('/src/store/resultDialogStore.js');
      showResult.error('Long error detail '.repeat(200));
    });
    await page.locator('.result-dialog').waitFor();
    const geometry = await page.locator('.result-dialog').evaluate(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth, height: el.getBoundingClientRect().height }));
    assert.equal(geometry.scrollWidth, geometry.width);
    assert.ok(geometry.height <= 600);
    await page.locator('.result-dialog-done').click();
    assert.deepEqual(errors, []);
    console.log('PASS: Success/error in both themes; queue; focus trap and restoration; Escape/OK; long mobile messages; no native alerts or runtime errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
