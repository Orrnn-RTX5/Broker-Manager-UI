const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
  'C:/Users/ADMIN/AppData/Local/Temp/rtx5-playwright-tools/node_modules/playwright'
);
const fs = require('fs');
const path = require('path');

const baseUrl = String(process.env.RECORD_BASE_URL || 'http://localhost:5173').replace(/\/+$/, '');
const managerLogin = String(process.env.RECORD_LOGIN || '');
const managerPassword = String(process.env.RECORD_PASSWORD || '');
const accountLogin = String(process.env.RECORD_ACCOUNT || '200008');
const preOpenWaitMs = Math.max(0, Number(process.env.RECORD_PRE_OPEN_WAIT_MS || 0));
const hoverLeadMs = Math.max(0, Number(process.env.RECORD_HOVER_LEAD_MS || 0));
const blockPositionsAll = process.env.RECORD_BLOCK_POSITIONS_ALL === '1';
const outputName = process.env.RECORD_OUTPUT_NAME || 'account-positions-performance.webm';
const browserPath = process.env.RECORD_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const artifactDir = path.resolve(__dirname, '..', 'artifacts');
const outputPath = path.join(artifactDir, outputName);
const screenshotPath = path.join(artifactDir, outputName.replace(/\.webm$/i, '.png'));
const reportPath = path.join(artifactDir, outputName.replace(/\.webm$/i, '.json'));
const POSITIONS_SETTLE_TIMEOUT_MS = 12_000;
const EMPTY_CACHE_GRACE_MS = 500;
const SETTLED_STATE_STABILITY_MS = 120;
const PERFORMANCE_BUDGET_MS = Math.max(1, Number(process.env.RECORD_PERFORMANCE_BUDGET_MS || 1_000));

if (!managerLogin || !managerPassword) throw new Error('RECORD_LOGIN and RECORD_PASSWORD are required.');
fs.mkdirSync(artifactDir, { recursive: true });

const getPositionEndpoint = (value) => {
  try {
    const parsedUrl = new URL(value, baseUrl);
    const endpointMatch = parsedUrl.pathname.match(/\/(PositionsAll|Positions)\/?$/i);
    if (!endpointMatch) return null;
    return {
      endpoint: endpointMatch[1],
      pathname: parsedUrl.pathname,
      logins: parsedUrl.searchParams.getAll('logins[]'),
    };
  } catch {
    return null;
  }
};

let activeBrowser = null;

const main = async () => {
  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: ['--disable-gpu', '--disable-software-rasterizer', '--disable-features=Vulkan'],
  });
  activeBrowser = browser;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: artifactDir, size: { width: 1440, height: 900 } },
  });
  await context.addInitScript(() => {
    localStorage.setItem('theme-storage', JSON.stringify({ state: { isDarkMode: true }, version: 0 }));
  });
  const page = await context.newPage();
  const video = page.video();
  page.setDefaultTimeout(30_000);

  if (blockPositionsAll) {
    await page.route(/\/PositionsAll(?:\?|$)/i, (route) => route.abort('blockedbyclient'));
  }

  const startedRequests = new Map();
  const positionRequests = [];
  page.on('request', (request) => {
    const endpoint = getPositionEndpoint(request.url());
    if (!endpoint) return;

    const startedAt = performance.now();
    const timing = {
      endpoint: endpoint.endpoint,
      pathname: endpoint.pathname,
      logins: endpoint.logins,
      method: request.method(),
      url: request.url(),
      status: null,
      responseMs: null,
      finishedMs: null,
      failure: null,
      startedAt,
    };
    startedRequests.set(request, timing);
    positionRequests.push(timing);
  });
  page.on('response', (response) => {
    const request = response.request();
    const timing = startedRequests.get(request);
    if (!timing) return;
    timing.status = response.status();
    timing.responseMs = Math.round(performance.now() - timing.startedAt);
  });
  page.on('requestfinished', (request) => {
    const timing = startedRequests.get(request);
    if (!timing) return;
    timing.finishedMs = Math.round(performance.now() - timing.startedAt);
  });
  page.on('requestfailed', (request) => {
    const timing = startedRequests.get(request);
    if (!timing) return;
    timing.finishedMs = Math.round(performance.now() - timing.startedAt);
    timing.failure = request.failure()?.errorText || 'Request failed';
  });

  await page.goto(`${baseUrl}/manager-login`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.locator('#manager-login').fill(managerLogin);
  await page.locator('#manager-password').fill(managerPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/dashboard(?:$|[?#])/, { timeout: 30_000 });

  if (!(await page.locator('.accounts-sidebar-grid').count())) {
    await page.getByRole('button', { name: /show account panel/i }).click();
  }
  const accountRows = page.locator('.accounts-sidebar-grid tbody tr');
  await accountRows.first().waitFor({ state: 'visible' });
  const escapedAccountLogin = accountLogin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const requestedAccount = accountRows.filter({
    has: page.locator('td:first-child').filter({
      hasText: new RegExp(`^\\s*${escapedAccountLogin}\\s*$`),
    }),
  }).first();
  if (!(await requestedAccount.count())) {
    const accountSearch = page.getByPlaceholder('Search login...');
    await accountSearch.fill(accountLogin);
    await accountSearch.press('Enter');
    await requestedAccount.waitFor({ state: 'visible', timeout: 15_000 });
  }
  if (preOpenWaitMs > 0) await page.waitForTimeout(preOpenWaitMs);
  if (hoverLeadMs > 0) {
    await requestedAccount.hover();
    await page.waitForTimeout(hoverLeadMs);
  }

  const flowStartedAt = performance.now();
  const requestsActiveAtFlowStart = new Set(
    positionRequests.filter((request) => request.finishedMs === null)
  );
  await requestedAccount.dblclick();
  const dialog = page.locator('[role="dialog"][aria-label^="Account details for"]');
  await dialog.waitFor({ state: 'visible' });
  const modalVisibleMs = Math.round(performance.now() - flowStartedAt);
  const positionsBody = dialog.locator('.account-positions-body');
  await positionsBody.waitFor({ state: 'visible' });

  const readRenderedState = () => positionsBody.evaluate((body) => {
    const isVisible = (node) => {
      if (!node) return false;
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
    };
    const visibleRows = [...body.querySelectorAll('.account-positions-row')].filter((row) => (
      isVisible(row)
      && !row.matches('.account-positions-skeleton, [data-loading="true"], [aria-hidden="true"]')
    ));
    const stateScope = body.closest('.account-positions-card') || body;
    const empty = body.querySelector('.account-positions-empty, [data-position-state="empty"], [data-state="empty"]');
    const error = stateScope.querySelector('.account-positions-error, .account-positions-state.is-error, [data-position-state="error"], [data-state="error"]');
    const loadingCandidates = [
      ...stateScope.querySelectorAll('.account-positions-loading, .account-positions-state.is-loading, [data-position-state="loading"], [data-state="loading"], [aria-busy="true"]'),
      ...[...stateScope.querySelectorAll('[role="status"], [aria-live]')].filter((node) => (
        /(?:loading|fetching|refreshing).*position/i.test(node.textContent || '')
      )),
    ];
    const loading = (
      body.getAttribute('aria-busy') === 'true'
      || stateScope.getAttribute('aria-busy') === 'true'
      || body.dataset.positionState === 'loading'
      || body.dataset.state === 'loading'
      || stateScope.dataset.positionState === 'loading'
      || stateScope.dataset.state === 'loading'
      || loadingCandidates.some(isVisible)
    );

    return {
      rowCount: visibleRows.length,
      emptyVisible: isVisible(empty),
      errorVisible: isVisible(error),
      loadingVisible: loading,
      emptyText: isVisible(empty) ? empty.textContent.trim() : '',
      errorText: isVisible(error) ? error.textContent.trim() : '',
    };
  });

  const stateTransitions = [];
  let lastState = '';
  let settledCandidate = '';
  let settledCandidateAt = 0;
  let loadOutcome = 'timeout';
  let renderedState = await readRenderedState();
  const settleDeadline = performance.now() + POSITIONS_SETTLE_TIMEOUT_MS;

  while (performance.now() < settleDeadline) {
    renderedState = await readRenderedState();
    // The account-details modal now owns only the account-scoped /Positions
    // request. Dashboard /PositionsAll work must not hold its empty state open.
    const flowRequests = positionRequests.filter((request) => (
      String(request.endpoint).toLowerCase() === 'positions'
      && request.logins.some((login) => String(login) === accountLogin)
      && (requestsActiveAtFlowStart.has(request) || request.startedAt >= flowStartedAt)
    ));
    const requestSeen = flowRequests.length > 0;
    const requestPending = flowRequests.some((request) => request.finishedMs === null);
    const elapsedMs = performance.now() - flowStartedAt;

    let observedState = 'pending';
    if (renderedState.loadingVisible || requestPending) observedState = 'loading';
    else if (renderedState.rowCount > 0) observedState = 'rows';
    else if (renderedState.errorVisible) observedState = 'error';
    else if (renderedState.emptyVisible) observedState = 'empty';

    if (observedState !== lastState) {
      stateTransitions.push({ state: observedState, atMs: Math.round(elapsedMs) });
      lastState = observedState;
    }

    const emptyCanSettle = (
      observedState === 'empty'
      && !requestPending
      && (requestSeen || elapsedMs >= EMPTY_CACHE_GRACE_MS)
    );
    const errorCanSettle = observedState === 'error' && !requestPending;
    const nextCandidate = observedState === 'rows'
      ? 'rows'
      : emptyCanSettle
        ? 'empty'
        : errorCanSettle
          ? 'error'
          : '';

    if (nextCandidate !== settledCandidate) {
      settledCandidate = nextCandidate;
      settledCandidateAt = performance.now();
    } else if (
      nextCandidate
      && performance.now() - settledCandidateAt >= SETTLED_STATE_STABILITY_MS
    ) {
      loadOutcome = nextCandidate;
      break;
    }

    await page.waitForTimeout(25);
  }

  const positionsSettledMs = Math.round(performance.now() - flowStartedAt);
  await page.waitForTimeout(1_000);
  await dialog.screenshot({ path: screenshotPath });

  // Keep a visual proof in the recording that long position lists scroll
  // inside the table viewport while the financial snapshot stays anchored.
  const scrollDemo = await positionsBody.evaluate((body) => ({
    clientHeight: body.clientHeight,
    scrollHeight: body.scrollHeight,
    scrollable: body.scrollHeight > body.clientHeight + 1,
  }));
  if (scrollDemo.scrollable) {
    await positionsBody.evaluate((body) => body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' }));
    await page.waitForTimeout(700);
    await positionsBody.evaluate((body) => body.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(700);
  }

  const rendered = {
    outcome: loadOutcome,
    rowCount: renderedState.rowCount,
    emptyVisible: renderedState.emptyVisible,
    loadingVisible: renderedState.loadingVisible,
    errorVisible: renderedState.errorVisible,
    emptyText: renderedState.emptyText,
    errorText: renderedState.errorText,
    stateTransitions,
  };
  const reportPositionRequests = positionRequests.map(({ startedAt, ...request }) => ({
    ...request,
    startedAtMs: Math.round(startedAt - flowStartedAt),
  }));
  const report = {
    accountLogin,
    performanceBudgetMs: PERFORMANCE_BUDGET_MS,
    preOpenWaitMs,
    hoverLeadMs,
    blockPositionsAll,
    modalVisibleMs,
    positionsSettledMs,
    scrollDemo,
    rendered,
    positionRequests: reportPositionRequests,
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const targetRequests = reportPositionRequests.filter((request) => (
    String(request.endpoint).toLowerCase() === 'positions'
    && request.logins.some((login) => String(login) === accountLogin)
  ));
  const completedTargetRequest = targetRequests.find((request) => (
    request.status === 200
    && request.responseMs !== null
    && request.finishedMs !== null
    && !request.failure
  ));
  const outcomeTransition = stateTransitions.find((transition) => transition.state === loadOutcome);

  if (!['rows', 'empty'].includes(loadOutcome)) {
    throw new Error(`Position flow ended in ${loadOutcome}; expected rows or an empty result.`);
  }
  if (targetRequests.length !== 1 || !completedTargetRequest) {
    throw new Error(`Expected exactly one completed account-scoped Positions request; observed ${targetRequests.length}.`);
  }
  const targetRequestDurationMs = Math.max(
    completedTargetRequest.responseMs,
    completedTargetRequest.finishedMs,
  );
  if (targetRequestDurationMs >= PERFORMANCE_BUDGET_MS) {
    throw new Error(`Positions response body took ${targetRequestDurationMs}ms (budget: <${PERFORMANCE_BUDGET_MS}ms).`);
  }
  if (!outcomeTransition || outcomeTransition.atMs >= PERFORMANCE_BUDGET_MS) {
    throw new Error(`Position ${loadOutcome} state was not visible within ${PERFORMANCE_BUDGET_MS}ms.`);
  }

  await context.close();
  await video.saveAs(outputPath);
  await browser.close();
  activeBrowser = null;
  process.stdout.write(`${JSON.stringify({ outputPath, screenshotPath, reportPath, ...report }, null, 2)}\n`);
};

main().catch(async (error) => {
  await activeBrowser?.close().catch(() => undefined);
  activeBrowser = null;
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
