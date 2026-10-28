import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';

// Bundles the REAL sidebarAccounts.js with its network and storage edges replaced, so the
// module-level in-flight dedupe runs for real. Only the page collector is controlled here.
const runtime = { collect: null, revision: 0 };
globalThis.__sidebarAccountsFreshTest = runtime;
const STUBS = {
  dataAccessScope: "export const getDataAccessScope = () => 'scope-A'; export const assertDataAccessScope = () => {}; export const matchesDataAccessScope = () => true;",
  managerFetch: "export const fetchManagerApi = async () => { throw new Error('unused'); };",
  api: "export const getAccountDetailsManyPage = async () => { throw new Error('unused'); };",
  pagination: "export const normalizePagedStreamResult = async () => { throw new Error('unused'); };",
  sidebarAccountRows: 'export const normalizeAccount = (row) => row; export const normalizeSidebarAccountPage = (page) => page;',
  collectAccountPages: 'export const collectAccountPages = (...args) => globalThis.__sidebarAccountsFreshTest.collect(...args);',
  realtimeCacheRevision: 'export const getRealtimeCacheRevision = () => globalThis.__sidebarAccountsFreshTest.revision;',
};
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./sidebarAccounts.js', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'browser',
  plugins: [{ name: 'sidebar-accounts-edges', setup(builder) {
    builder.onResolve({ filter: /\/(dataAccessScope|managerFetch|api|pagination|sidebarAccountRows|collectAccountPages|realtimeCacheRevision)(\.js)?$/ }, ({ path }) => ({
      path: path.match(/(dataAccessScope|managerFetch|api|pagination|sidebarAccountRows|collectAccountPages|realtimeCacheRevision)/)[1],
      namespace: 'sidebar-test',
    }));
    builder.onLoad({ filter: /.*/, namespace: 'sidebar-test' }, ({ path }) => ({ loader: 'js', contents: STUBS[path] }));
  } }],
});
const { fetchAllSidebarAccounts } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

// The write path must never reuse a membership read that started before the click.
test('a fresh membership read is never reused from a read that started before it', async () => {
  let reads = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  runtime.collect = async () => {
    reads += 1;
    const seq = String(reads);
    await gate;
    return { rows: [{ login: seq }] };
  };

  const beforeClick = fetchAllSidebarAccounts({});
  const defaultCaller = fetchAllSidebarAccounts({});
  assert.equal(reads, 1, 'default callers still share the read in flight');

  const writePath = fetchAllSidebarAccounts({ fresh: true });
  assert.equal(reads, 2, 'a fresh read starts its own request instead of reusing the in-flight one');

  release();
  assert.deepEqual((await writePath).rows, [{ login: '2' }], 'the write path gets the read it started');
  assert.deepEqual((await beforeClick).rows, [{ login: '1' }]);
  assert.deepEqual((await defaultCaller).rows, [{ login: '1' }], 'the default caller gets the shared read');
});
