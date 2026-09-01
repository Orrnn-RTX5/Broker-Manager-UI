const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
  'C:/Users/ADMIN/AppData/Local/Temp/rtx5-playwright-tools/node_modules/playwright'
);

const baseUrl = String(process.env.AUDIT_BASE_URL || 'http://127.0.0.1:5173').replace(/\/+$/, '');
const login = String(process.env.AUDIT_LOGIN || '');
const password = String(process.env.AUDIT_PASSWORD || '');
const runLabel = String(process.env.AUDIT_LABEL || 'analytics-navigation');
const auditSuite = String(process.env.AUDIT_SUITE || 'analytics').trim().toLowerCase();
const outputDir = path.resolve(process.env.AUDIT_OUTPUT_DIR || path.join(__dirname, 'performance-evidence'));
const executablePath = process.env.AUDIT_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const dashboardSettleMs = Number(process.env.AUDIT_DASHBOARD_SETTLE_MS ?? 1_500);
const progress = (message) => process.stderr.write(`[audit] ${message}\n`);

let activeBrowser = null;
let activeContext = null;
let activeVideo = null;

if (!login || !password) {
  throw new Error('AUDIT_LOGIN and AUDIT_PASSWORD are required.');
}

fs.mkdirSync(outputDir, { recursive: true });

const targetRequests = [
  { view: 'online-users', pattern: /\/OnlineUsers(?:\?|$)/i },
  { view: 'open-positions', pattern: /\/PositionsAll(?:\?|$)/i },
  { view: 'open-orders', pattern: /\/OpenedOrders(?:\?|$)/i },
  { view: 'clients', pattern: /\/AccountDetailsMany(?:\?|$)/i },
  { view: 'orders', pattern: /\/BrokerOrders(?:\?|$)/i },
  { view: 'groups', pattern: /\/(?:GroupList|UserGroups)(?:\?|$)/i },
];

const navigationSuites = {
  analytics: [
    {
      label: 'Online Users',
      pathName: '/analytics/online-users',
      heading: 'Online Users',
      pendingText: ['Loading online users'],
    },
    {
      label: 'Open Positions',
      pathName: '/analytics/open-positions',
      heading: 'Open Positions',
      pendingText: ['Loading positions', 'Loading open positions'],
    },
    {
      label: 'Open Orders',
      pathName: '/analytics/open-orders',
      heading: 'Opened Orders',
    },
  ],
  workspace: [
    {
      label: 'Clients',
      pathName: '/clients',
      heading: 'Clients',
      pendingText: ['Loading clients'],
    },
    {
      label: 'Orders',
      pathName: '/clients/orders',
      heading: 'Orders',
      pendingText: ['Loading orders'],
    },
    {
      label: 'Groups',
      pathName: '/groups',
      heading: 'Groups',
      pendingText: ['Fetching groups'],
    },
  ],
};

if (!navigationSuites[auditSuite]) {
  throw new Error(`Unsupported AUDIT_SUITE: ${auditSuite}`);
}

const sanitizeUrl = (rawUrl) => {
  const url = new URL(rawUrl);
  return `${url.pathname}${url.search ? `?${[...url.searchParams.keys()].join('&')}` : ''}`;
};

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const navigatorItem = (page, label) => page.locator('.navigator-type').getByRole('treeitem', {
  name: new RegExp(`^${escapeRegExp(label)}(?:\\s*\\([^)]*\\))?$`),
}).first();

const main = async () => {
  const auditStartedAt = Date.now();
  const milestones = {};
  progress(`launching ${runLabel}`);
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  activeBrowser = browser;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: outputDir, size: { width: 1280, height: 800 } },
  });
  activeContext = context;
  await context.addInitScript(() => {
    window.__RTX5_LONG_TASKS__ = [];
    if (typeof PerformanceObserver !== 'function') return;
    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          window.__RTX5_LONG_TASKS__.push({
            startTime: entry.startTime,
            duration: entry.duration,
          });
        });
      });
      observer.observe({ type: 'longtask', buffered: true });
    } catch {
      // Long-task entries are diagnostic only.
    }
  });
  const page = await context.newPage();
  activeVideo = page.video();
  const requestStarts = new WeakMap();
  const requests = [];

  page.on('request', (request) => {
    const target = targetRequests.find(({ pattern }) => pattern.test(request.url()));
    if (!target) return;
    const record = {
      view: target.view,
      path: sanitizeUrl(request.url()),
      startedAtMs: Date.now() - auditStartedAt,
      status: null,
      responseMs: null,
      failure: null,
    };
    requests.push(record);
    requestStarts.set(request, { startedAt: Date.now(), record });
  });

  page.on('response', (response) => {
    const request = response.request();
    const start = requestStarts.get(request);
    if (!start) return;
    start.record.status = response.status();
    start.record.responseMs = Date.now() - start.startedAt;
  });

  page.on('requestfailed', (request) => {
    const start = requestStarts.get(request);
    if (!start) return;
    start.record.failure = request.failure()?.errorText || 'request failed';
    start.record.responseMs = Date.now() - start.startedAt;
  });

  progress('opening login');
  await page.goto(`${baseUrl}/manager-login`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.locator('#manager-login').waitFor({ state: 'visible', timeout: 30_000 });
  progress('submitting login');
  await page.locator('#manager-login').fill(login);
  await page.locator('#manager-password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/dashboard(?:$|[?#])/, { timeout: 30_000 });
  await navigatorItem(page, 'Online Users').waitFor({ state: 'visible' });
  milestones.dashboardReadyAtMs = Date.now() - auditStartedAt;
  progress('dashboard ready');

  // Let the authenticated shell settle. Optimized builds use this idle period
  // to warm the three frequent analytics destinations.
  await page.waitForTimeout(Math.max(0, dashboardSettleMs));

  const navigateAndMeasure = async ({ label, pathName, heading, pendingText = [] }) => {
    progress(`opening ${pathName}`);
    const requestIndex = requests.length;
    const startedAt = Date.now();
    const clickStartedAtMs = startedAt - auditStartedAt;
    const browserClickStartedAt = await page.evaluate(() => performance.now());
    const item = navigatorItem(page, label);
    await item.click();
    await page.waitForURL((url) => url.pathname === pathName, { timeout: 15_000 });
    const urlChangedMs = Date.now() - startedAt;
    await page.getByRole('heading', { name: heading, exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 });
    const headingVisibleMs = Date.now() - startedAt;
    let contentSettledMs = headingVisibleMs;
    let settleOutcome = 'route-only';

    if (pendingText.length > 0) {
      try {
        await page.waitForFunction((labels) => {
          const body = document.body.innerText;
          return !body.includes('Opening view') && labels.every((text) => !body.includes(text));
        }, pendingText, { timeout: 20_000, polling: 50 });
        contentSettledMs = Date.now() - startedAt;
        settleOutcome = 'settled';
      } catch {
        contentSettledMs = Date.now() - startedAt;
        settleOutcome = 'timeout';
      }
    }

    await page.waitForTimeout(1_200);
    progress(`measured ${pathName}: heading=${headingVisibleMs}ms settled=${contentSettledMs}ms`);
    const appTimings = await page.evaluate(() => (window.__RTX5_ANALYTICS_TIMINGS__ || []).slice(-5));
    const longTasks = await page.evaluate((startTime) => (
      (window.__RTX5_LONG_TASKS__ || []).filter((entry) => entry.startTime >= startTime)
    ), browserClickStartedAt);
    return {
      view: pathName,
      clickStartedAtMs,
      urlChangedMs,
      headingVisibleMs,
      contentSettledMs,
      settleOutcome,
      requests: requests.slice(requestIndex),
      longTasks,
      appTimings,
    };
  };

  const results = [];
  for (const destination of navigationSuites[auditSuite]) {
    results.push(await navigateAndMeasure(destination));
  }

  const screenshotPath = path.join(outputDir, `${runLabel}-final.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  const videoPath = path.join(outputDir, `${runLabel}.webm`);
  const video = activeVideo;
  await context.close();
  activeContext = null;
  await video.saveAs(videoPath);
  await browser.close();
  activeBrowser = null;

  const report = {
    label: runLabel,
    suite: auditSuite,
    baseUrl,
    capturedAt: new Date().toISOString(),
    milestones,
    results,
    allRequests: requests,
    videoPath,
    screenshotPath,
  };
  const reportPath = path.join(outputDir, `${runLabel}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
};

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  Promise.resolve()
    .then(() => activeContext?.close().catch(() => undefined))
    .then(() => activeBrowser?.close().catch(() => undefined))
    .finally(() => { process.exitCode = 1; });
});
