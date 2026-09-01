const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
  'C:/Users/ADMIN/AppData/Local/Temp/rtx5-playwright-tools/node_modules/playwright'
);

const baseUrl = String(process.env.AUDIT_BASE_URL || 'http://127.0.0.1:5173').replace(/\/+$/, '');
const login = String(process.env.AUDIT_LOGIN || '');
const password = String(process.env.AUDIT_PASSWORD || '');
const executablePath = process.env.AUDIT_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

if (!login || !password) throw new Error('AUDIT_LOGIN and AUDIT_PASSWORD are required.');

const main = async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await page.goto(`${baseUrl}/manager-login`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.locator('#manager-login').fill(login);
  await page.locator('#manager-password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/dashboard(?:$|[?#])/, { timeout: 30_000 });

  const results = await page.evaluate(async () => {
    const { getClientsPage } = await import('/src/services/api.js');
    const cases = [null, 'id', 'login', null];
    const output = [];
    for (const sort_by of cases) {
      const startedAt = performance.now();
      try {
        const data = await getClientsPage({
          search: '',
          ...(sort_by ? { sort_by } : {}),
          sort_dir: 'asc',
          filters: {},
          limit: 30,
          offset: 0,
        });
        output.push({
          sort_by: sort_by || 'none',
          durationMs: Math.round(performance.now() - startedAt),
          rows: data?.rows?.length ?? null,
          total: data?.total ?? null,
        });
      } catch (error) {
        output.push({ sort_by: sort_by || 'none', durationMs: Math.round(performance.now() - startedAt), error: error.message });
      }
    }
    return output;
  });

  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  await context.close();
  await browser.close();
};

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
