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
    await page.goto('http://localhost:5180/dashboard');
    await page.locator('.cc-metric-card').first().waitFor();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'artifacts/light-theme-dashboard.png' });
    const navbarGeometry = () => page.evaluate(() => [...document.querySelectorAll('.manager-menu-brand, .manager-brand-symbol, .manager-brand-caption, .manager-menu-item')].map(el => {
      const { x, y, width, height } = el.getBoundingClientRect();
      return { x, y, width, height };
    }));
    const lightNavbar = await navbarGeometry();
    await page.evaluate(async () => (await import('/src/store/themeStore.js')).default.getState().setTheme(true));
    await page.waitForTimeout(300);
    assert.deepEqual(await navbarGeometry(), lightNavbar, 'Navbar logo and menu geometry must match between themes');
    const [darkWith, darkWithout] = await page.evaluate(() => {
      const snapshot = () => [...document.querySelectorAll('.rtx5-command-shell, .rtx5-command-shell *')].map(el => {
        const style = getComputedStyle(el);
        return [style.color, style.backgroundColor, style.borderColor, style.padding, style.gap, style.fontSize, style.borderRadius];
      });
      // Compare synchronously so simulated market ticks cannot change the DOM.
      const before = snapshot();
      document.querySelector('style[data-vite-dev-id$="/styles/light-theme.css"]').sheet.disabled = true;
      return [before, snapshot()];
    });
    assert.deepEqual(darkWithout, darkWith, 'Dark computed styles must be identical with and without the new stylesheet');
    await page.evaluate(async () => {
      document.querySelector('style[data-vite-dev-id$="/styles/light-theme.css"]').sheet.disabled = false;
      (await import('/src/store/themeStore.js')).default.getState().setTheme(false);
    });
    for (const width of [1440, 1100]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(200);
      const overflow = await page.locator('.cc-dashboard').evaluate(el => el.scrollWidth > el.clientWidth);
      assert.equal(overflow, false, `Dashboard must fit available space at ${width}px`);
      await page.screenshot({ path: `artifacts/light-theme-${width}.png` });
    }
    assert.deepEqual(errors, [], 'No browser runtime errors');
    console.log('PASS: Light dashboard at 1920, 1440 and 1100px; dark computed styles unchanged; no browser errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
