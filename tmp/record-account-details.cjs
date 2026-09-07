const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
  'C:/Users/ADMIN/AppData/Local/Temp/rtx5-playwright-tools/node_modules/playwright'
);
const fs = require('fs');
const path = require('path');

const baseUrl = String(process.env.RECORD_BASE_URL || 'http://localhost:5173').replace(/\/+$/, '');
const login = String(process.env.RECORD_LOGIN || '');
const password = String(process.env.RECORD_PASSWORD || '');
const accountLogin = String(process.env.RECORD_ACCOUNT || '200008');
const browserPath = process.env.RECORD_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const artifactDir = path.resolve(__dirname, '..', 'artifacts');
const outputName = process.env.RECORD_OUTPUT_NAME || 'account-details-professional-walkthrough.webm';
const overviewOnly = process.env.RECORD_OVERVIEW_ONLY === 'true';
const outputPath = path.join(artifactDir, outputName);
const screenshotPath = path.join(artifactDir, outputName.replace(/\.webm$/i, '.png'));

if (!login || !password) throw new Error('RECORD_LOGIN and RECORD_PASSWORD are required.');
fs.mkdirSync(artifactDir, { recursive: true });

const pause = (page, milliseconds = 900) => page.waitForTimeout(milliseconds);
const mark = (message) => process.stderr.write(`[record] ${message}\n`);

const main = async () => {
  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: ['--disable-gpu', '--disable-software-rasterizer', '--disable-features=Vulkan'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: artifactDir, size: { width: 1440, height: 900 } },
  });
  await context.addInitScript(() => {
    localStorage.setItem('theme-storage', JSON.stringify({ state: { isDarkMode: true }, version: 0 }));
  });
  const page = await context.newPage();
  const recordedVideo = page.video();
  page.setDefaultTimeout(30_000);
  mark('browser ready');

  await page.goto(`${baseUrl}/manager-login`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.locator('#manager-login').fill(login);
  await page.locator('#manager-password').fill(password);
  await pause(page, 700);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/dashboard(?:$|[?#])/, { timeout: 30_000 });
  mark('dashboard ready');
  await pause(page, 1_800);

  if (!(await page.locator('.accounts-sidebar-grid').count())) {
    await page.getByRole('button', { name: /show account panel/i }).click();
  }
  const accountRows = page.locator('.accounts-sidebar-grid tbody tr');
  await accountRows.first().waitFor({ state: 'visible' });
  const requestedAccount = accountRows.filter({ hasText: accountLogin }).first();
  const firstAccount = (await requestedAccount.count()) ? requestedAccount : accountRows.first();
  await pause(page, 900);
  await firstAccount.dblclick();

  const dialog = page.locator('[role="dialog"][aria-label^="Account details for"]');
  await dialog.waitFor({ state: 'visible' });
  await dialog.locator('.account-details-status').waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});
  await pause(page, 1_300);
  mark(`account ${accountLogin} dialog ready`);

  if (!overviewOnly) {
    for (const tabName of ['Personal', 'Account', 'Limits', 'Balance', 'Trade', 'History', 'Security', 'Overview']) {
      await dialog.getByRole('tab', { name: tabName, exact: true }).click();
      if (tabName === 'History') {
        await dialog.locator('tbody tr').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
      }
      await pause(page, tabName === 'Trade' || tabName === 'History' ? 1_600 : 1_000);
    }
  }

  await dialog.screenshot({ path: screenshotPath });
  mark('screenshot saved');

  const audit = await dialog.evaluate((root) => {
    const sample = (selector) => {
      const node = root.querySelector(selector);
      if (!node) return null;
      const style = getComputedStyle(node);
      return { selector, fontSize: style.fontSize, fontWeight: style.fontWeight };
    };
    const metrics = root.querySelector('.account-balance-metrics');
    const metricItems = [...root.querySelectorAll('.account-balance-stat')];
    const content = root.querySelector('.account-details-content');
    const positionsBody = root.querySelector('.account-positions-body');
    const emptyState = root.querySelector('.account-positions-empty');
    const bodyRect = positionsBody?.getBoundingClientRect();
    const emptyRect = emptyState?.getBoundingClientRect();
    let stressScroll = null;

    if (positionsBody) {
      const previousEmptyDisplay = emptyState?.style.display || '';
      if (emptyState) emptyState.style.display = 'none';
      const probes = Array.from({ length: 24 }, (_, rowIndex) => {
        const row = document.createElement('div');
        row.className = 'account-positions-grid account-positions-row';
        row.dataset.scrollProbe = 'true';
        row.innerHTML = Array.from({ length: 10 }, (__, columnIndex) =>
          `<div>${columnIndex === 0 ? `TEST${rowIndex + 1}` : '0.00'}</div>`
        ).join('');
        positionsBody.appendChild(row);
        return row;
      });
      const initialTop = positionsBody.scrollTop;
      positionsBody.scrollTop = 80;
      stressScroll = {
        overflowCreated: positionsBody.scrollHeight > positionsBody.clientHeight,
        scrollMoved: positionsBody.scrollTop > initialTop,
      };
      probes.forEach((row) => row.remove());
      positionsBody.scrollTop = 0;
      if (emptyState) emptyState.style.display = previousEmptyDisplay;
    }

    return {
      typography: [
        sample('.account-details-title'),
        sample('.account-details-tab'),
        sample('.account-overview-eyebrow'),
        sample('.account-overview-heading h2'),
        sample('.account-overview-details span'),
        sample('.account-overview-details strong'),
        sample('.account-balance-stat dt'),
        sample('.account-balance-stat dd'),
        sample('.account-details-footer button'),
      ],
      financialSnapshot: {
        itemCount: metricItems.length,
        columns: metrics ? getComputedStyle(metrics).gridTemplateColumns : null,
        overflowFree: metricItems.every((item) => item.scrollWidth <= item.clientWidth),
        labelsVisible: metricItems.every((item) => {
          const label = item.querySelector('dt');
          return label && label.scrollWidth <= label.clientWidth;
        }),
      },
      positionsViewport: {
        bodyHeight: bodyRect?.height ?? null,
        overflowY: positionsBody ? getComputedStyle(positionsBody).overflowY : null,
        outerOverflowY: content ? getComputedStyle(content).overflowY : null,
        emptyStateCentered: bodyRect && emptyRect
          ? Math.abs((bodyRect.top + bodyRect.height / 2) - (emptyRect.top + emptyRect.height / 2)) < 1
          : null,
        stressScroll,
      },
    };
  });

  await pause(page, 900);
  await context.close();
  mark('browser context closed');
  await recordedVideo.saveAs(outputPath);
  mark('video saved');
  await browser.close();
  process.stdout.write(`${JSON.stringify({ outputPath, screenshotPath, ...audit }, null, 2)}\n`);
};

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
