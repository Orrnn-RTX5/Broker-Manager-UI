const { chromium } = require('C:/Users/ADMIN/AppData/Local/Temp/rtx5-playwright-tools/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const sockets = [];
    const errors = [];
    page.on('websocket', ws => {
      const entry = { path: new URL(ws.url()).pathname, frames: 0, ticks: 0, closed: false, samples: [] };
      sockets.push(entry);
      ws.on('framereceived', ({ payload }) => {
        entry.frames++;
        if (entry.samples.length < 2) entry.samples.push(String(payload).slice(0, 400));
        if (String(payload).includes('bid')) entry.ticks++;
      });
      ws.on('close', () => entry.closed = true);
    });
    page.on('response', r => { if (r.status() >= 400) errors.push({ path: new URL(r.url()).pathname, status: r.status() }); });
    await page.goto('http://localhost:5180/manager-login');
    if (await page.locator('#manager-login').count()) {
      await page.locator('#manager-login').fill('9000');
      await page.locator('#manager-password').fill(process.env.AUDIT_PASSWORD);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    }
    await page.waitForTimeout(45000);
    console.log('Network:', JSON.stringify({ sockets: sockets.map(({ samples, ...s }) => s), errors }));
    if (new URL(page.url()).pathname !== '/manager-login') {
      console.log('Store:', await page.evaluate(async () => {
        const { default: store } = await import('/src/store/symbolStore.js');
        const s = store.getState();
        return { connected: s.isConnected, error: s.feedError, symbolCount: Object.keys(s.symbols).length,
          staleCount: Object.values(s.symbols).filter(q => q.isStale).length };
      }));
    }
    await page.screenshot({ path: 'tmp/market-feed-check.png' });
    const regression = await browser.newPage();
    await regression.goto('http://localhost:5180/manager-login');
    console.log('Lifecycle regressions:', await regression.evaluate(async () => {
      const { default: store } = await import('/src/store/symbolStore.js');
      const sockets = [];
      window.WebSocket = class {
        readyState = 0;
        constructor() { sockets.push(this); }
        send() {}
        close() { this.readyState = 3; this.onclose?.(); }
      };
      const check = (ok, message) => { if (!ok) throw new Error(message); };
      const state = () => store.getState();
      state().initWebSocket();
      const old = state().ws;
      old.readyState = 3;
      state().initWebSocket();
      const current = state().ws;
      current.readyState = 1;
      current.onopen();
      old.onerror();
      check(state().ws === current && state().isConnected, 'Old error destroyed current socket');
      const started = performance.now();
      current.onmessage({ data: JSON.stringify({ symbol: 'TESTQUOTE', bid: 1, ask: 2, stale: true }) });
      await new Promise(resolve => setTimeout(resolve, 180));
      check(state().symbols.TESTQUOTE?.isStale, 'Stale tick was marked live or batch is too slow');
      const batchMs = performance.now() - started;
      state().upsertSymbols([{ symbol: 'TESTQUOTE', bid: 1, ask: 2, fresh: true }]);
      check(!state().symbols.TESTQUOTE.isStale, 'Identical fresh tick did not clear stale status');
      current.close();
      check(state().symbols.TESTQUOTE.isStale && !state().isConnected, 'Closed socket left live prices');
      state().initWebSocket();
      check(sockets.length === 2, 'Mount bypassed reconnect timer');
      return { passed: true, batchObservedWithinMs: Math.round(batchMs) };
    }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
