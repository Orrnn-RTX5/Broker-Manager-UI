const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
  'C:/Users/ADMIN/AppData/Local/Temp/rtx5-playwright-tools/node_modules/playwright'
);

const baseUrl = String(process.env.AUDIT_BASE_URL || 'http://localhost:5173').replace(/\/+$/, '');
const login = String(process.env.AUDIT_LOGIN || '');
const password = String(process.env.AUDIT_PASSWORD || '');
const executablePath = process.env.AUDIT_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

if (!login || !password) throw new Error('AUDIT_LOGIN and AUDIT_PASSWORD are required.');

const routes = process.env.AUDIT_SKIP_ROUTES === 'true' ? [] : [
  '/dashboard',
  '/clients',
  '/clients/online-users',
  '/clients/trading-accounts',
  '/clients/positions',
  '/clients/orders',
  '/dealing',
  '/dealer/queue',
  '/dealer/restrictions',
  '/analytics/trading-accounts',
  '/analytics/online-users',
  '/analytics/open-positions',
  '/analytics/open-orders',
  '/analytics/by-country',
  '/groups',
  '/ib',
  '/ib/tree',
  '/symbols',
  '/symbol-management',
];

const isApiRequest = (url) => {
  try {
    const parsed = new URL(url);
    return /^(?:\/manager\/|\/api\/|\/reports\/|\/ext-api\/|\/v2\/)/.test(parsed.pathname);
  } catch {
    return false;
  }
};

const main = async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);

  const calls = [];
  const failures = [];
  const pageErrors = [];
  const startedRequests = new WeakMap();

  page.on('request', (request) => {
    if (isApiRequest(request.url())) startedRequests.set(request, Date.now());
  });
  page.on('response', (response) => {
    const request = response.request();
    if (!isApiRequest(request.url())) return;
    const url = new URL(request.url());
    calls.push({
      method: request.method(),
      path: `${url.pathname}${url.search}`,
      status: response.status(),
      durationMs: Date.now() - (startedRequests.get(request) || Date.now()),
    });
  });
  page.on('requestfailed', (request) => {
    if (!isApiRequest(request.url())) return;
    const url = new URL(request.url());
    failures.push({
      method: request.method(),
      path: `${url.pathname}${url.search}`,
      error: request.failure()?.errorText || 'request failed',
    });
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`${baseUrl}/manager-login`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.locator('#manager-login').fill(login);
  await page.locator('#manager-password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/dashboard(?:$|[?#])/, { timeout: 30_000 });

  const session = await page.evaluate(() => {
    const value = JSON.parse(sessionStorage.getItem('auth') || '{}');
    return {
      login: value.login,
      broker_id: value.broker_id,
      is_admin: value.is_admin,
      has_token: Boolean(value.token || value.access_token || value.session_token),
      has_refresh_token: Boolean(value.refresh_token),
    };
  });

  const routeResults = [];
  for (const route of routes) {
    const callStart = calls.length;
    const failureStart = failures.length;
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.waitForTimeout(2_500);
    const state = await page.evaluate(() => {
      const visible = (element) => {
        if (!element) return false;
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
      };
      const text = [...document.querySelectorAll('h1,h2,h3,[role="alert"],[role="status"],.empty-state,.error-state')]
        .filter(visible)
        .map((element) => element.textContent.trim().replace(/\s+/g, ' '))
        .filter(Boolean)
        .slice(0, 12);
      return { url: location.pathname, title: document.title, text };
    });
    routeResults.push({
      route,
      ...state,
      calls: calls.slice(callStart),
      failures: failures.slice(failureStart),
    });
  }

  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(1_500);
  if (!(await page.locator('.accounts-sidebar-grid').count())) {
    await page.getByRole('button', { name: /show account panel/i }).click();
  }
  const accountRows = page.locator('.accounts-sidebar-grid tbody tr');
  await accountRows.first().waitFor({ state: 'visible', timeout: 20_000 });
  await accountRows.first().dblclick();
  const dialog = page.locator('[role="dialog"][aria-label^="Account details for"]');
  await dialog.waitFor({ state: 'visible', timeout: 20_000 });
  await dialog.getByRole('tab', { name: 'Balance', exact: true }).click();
  const transactionActions = await dialog.locator('button').evaluateAll((buttons) =>
    buttons.map((button) => button.textContent.trim()).filter((text) => ['Deposit', 'Withdraw', 'Credit', 'Transfer'].includes(text))
  );
  await dialog.getByRole('button', { name: 'Transfer', exact: true }).click();
  const hasTransferDestination = await dialog.locator('#transaction-destination-login').isVisible();
  await dialog.getByRole('tab', { name: 'Trade', exact: true }).click();
  const tradeActions = await dialog.locator('button').evaluateAll((buttons) =>
    buttons.map((button) => button.textContent.trim().replace(/\s+/g, ' '))
      .filter((text) => /^(?:SELL \/ BID|BUY \/ ASK|New order)/.test(text))
  );
  const modalAudit = { transactionActions, hasTransferDestination, tradeActions };

  await dialog.getByRole('button', { name: 'Close account details' }).click().catch(() => {});
  await page.goto(`${baseUrl}/symbol-management`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(1_000);
  const symbolTabStart = calls.length;
  for (const tabName of ['Categories', 'LP Mappings', 'Trading Sessions', 'Commission & Swap', 'Advanced']) {
    await page.getByRole('button', { name: tabName, exact: true }).click();
    await page.waitForTimeout(800);
  }
  const symbolTabsAudit = {
    failedResponses: calls.slice(symbolTabStart).filter(({ status }) => status >= 400)
      .map(({ method, path, status }) => ({ method, path: new URL(path, baseUrl).pathname, status })),
  };

  await page.goto(`${baseUrl}/groups`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(1_000);
  const groupDetailStart = calls.length;
  const firstGroupRow = page.locator('tbody tr').first();
  if (await firstGroupRow.isVisible().catch(() => false)) {
    await firstGroupRow.click();
    await page.waitForTimeout(1_200);
  }
  const groupDetailAudit = {
    url: new URL(page.url()).pathname,
    failedResponses: calls.slice(groupDetailStart).filter(({ status }) => status >= 400)
      .map(({ method, path, status }) => ({ method, path: new URL(path, baseUrl).pathname, status })),
  };

  const uniqueCalls = [...calls.reduce((result, call) => {
    const pathname = new URL(call.path, baseUrl).pathname;
    const key = `${call.method} ${pathname} ${call.status}`;
    const current = result.get(key) || { method: call.method, path: pathname, status: call.status, count: 0 };
    current.count += 1;
    result.set(key, current);
    return result;
  }, new Map()).values()];
  const routeSummary = routeResults.map((result) => ({
    route: result.route,
    url: result.url,
    text: result.text,
    failedResponses: result.calls.filter(({ status }) => status >= 400)
      .map(({ method, path, status }) => ({ method, path: new URL(path, baseUrl).pathname, status })),
    failures: result.failures.filter(({ error }) => !/ERR_ABORTED/.test(error)),
  }));
  process.stdout.write(`${JSON.stringify({ session, modalAudit, symbolTabsAudit, groupDetailAudit, routeSummary, uniqueCalls, failures: failures.filter(({ error }) => !/ERR_ABORTED/.test(error)), pageErrors }, null, 2)}\n`);
  await context.close();
  await browser.close();
};

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
