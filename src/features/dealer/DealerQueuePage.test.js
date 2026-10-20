import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';

// Exercise the REAL routing helpers exported by DealerQueuePage.jsx. The
// bundle stubs every UI-only dependency (react, icons, store, hooks,
// tradeApi) while services/apiClient.js and utils/resultMessage.js stay
// REAL, so classification is tested — never mirrored.
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('./DealerQueuePage.jsx', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic',
  plugins: [{ name: 'dealer-queue-page-host', setup(builder) {
    builder.onResolve({ filter: /^(react|lucide-react)$|^react\/jsx-runtime$|resultDialogStore\.js$|services\/tradeApi$|hooks\/useDataSource$|hooks\/usePermissions$|utils\/permissions$|components\/GridLoadingState$|i18n\/index\.js$|\.css$/ }, ({ path }) => ({ path, namespace: 'dealer-queue-page-host' }));
    builder.onLoad({ filter: /.*/, namespace: 'dealer-queue-page-host' }, ({ path }) => {
      if (path === 'react') {
        return { loader: 'js', contents: 'export const useEffect = () => {}; export const useState = (i) => [typeof i === "function" ? i() : i, () => {}];' };
      }
      if (path === 'react/jsx-runtime') {
        return { loader: 'js', contents: 'export const jsx = () => null; export const jsxs = () => null; export const Fragment = "fragment";' };
      }
      if (path === 'lucide-react') {
        return { loader: 'js', contents: 'export const Search = "Search"; export const AlertTriangle = "AlertTriangle"; export const User = "User"; export const CheckCircle2 = "CheckCircle2"; export const XCircle = "XCircle";' };
      }
      if (/resultDialogStore\.js$/.test(path)) {
        return { loader: 'js', contents: 'export const showResult = () => {}; showResult.error = () => {};' };
      }
      if (/services\/tradeApi$/.test(path)) {
        return { loader: 'js', contents: 'export const getDealerQueue = async () => []; export const orderApprove = async () => ({}); export const orderReject = async () => ({});' };
      }
      if (/hooks\/useDataSource$/.test(path)) {
        return { loader: 'js', contents: 'export default () => ({ data: [], isLoading: false, error: null, reload: () => {} });' };
      }
      if (/hooks\/usePermissions$/.test(path)) {
        return { loader: 'js', contents: 'export const usePermissions = () => ({ canAct: () => true });' };
      }
      if (/utils\/permissions$/.test(path)) {
        return { loader: 'js', contents: 'export const PERMISSIONS = { DEALER_QUEUE: "dealer_queue" };' };
      }
      if (/components\/GridLoadingState$/.test(path)) {
        return { loader: 'js', contents: 'export default () => null;' };
      }
      if (/i18n\/index\.js$/.test(path)) {
        return { loader: 'js', contents: 'export const useI18nStore = () => "en";' };
      }
      return { loader: 'js', contents: 'export default () => null;' };
    });
  } }],
});
const { resolveDealerActionOutcome, shouldCloseDealerDialog } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

test('dealer approve/reject successes route to close + refetch', () => {
  for (const payload of [
    { success: true },
    { success: true, message: 'Order approved' },
    { ok: true },
    { success: true, retcode: 'MT_RET_OK' },
  ]) {
    assert.deepEqual(resolveDealerActionOutcome(payload), { ok: true }, `must accept ${JSON.stringify(payload)}`);
    assert.equal(shouldCloseDealerDialog(payload), true, `must close for ${JSON.stringify(payload)}`);
  }
});

test('dealer transport-flag failures route to keep-open with the server message', () => {
  for (const [payload, message] of [
    [{ success: false, message: 'Rejected by dealer' }, 'Rejected by dealer'],
    [{ ok: false, message: 'Order reject failed' }, 'Order reject failed'],
    [{ error: 'Market is closed.' }, 'Market is closed.'],
    [false, 'false'],
  ]) {
    const outcome = resolveDealerActionOutcome(payload);
    assert.equal(outcome.ok, false, `must reject ${JSON.stringify(payload)}`);
    assert.equal(outcome.message, message, `must preserve the message for ${JSON.stringify(payload)}`);
    assert.equal(shouldCloseDealerDialog(payload), false, `must keep the dialog open for ${JSON.stringify(payload)}`);
  }
});

test('dealer retcode rejections route to keep-open even when transport flags pass', () => {
  const payload = { success: true, retcode: 'MT_RET_ERR_TRADE', message: 'Engine rejected approval' };
  const outcome = resolveDealerActionOutcome(payload);
  assert.equal(outcome.ok, false, 'must reject a retcode failure');
  assert.match(outcome.message, /Engine rejected approval/);
  assert.equal(outcome.code, 'MT_RET_ERR_TRADE');
  assert.equal(shouldCloseDealerDialog(payload), false, 'must keep the dialog open on retcode failure');
});

test('dealer mixed success/error signals read as failure', () => {
  for (const payload of [
    { ok: true, success: false, message: 'Rejected by dealer' },
    { ok: false, success: true, message: 'Order reject failed' },
    { success: true, error: { message: 'Invalid price', code: 'MT_RET_ERR_PARAMS' } },
  ]) {
    assert.equal(resolveDealerActionOutcome(payload).ok, false, `must reject ${JSON.stringify(payload)}`);
    assert.equal(shouldCloseDealerDialog(payload), false, `must keep the dialog open for ${JSON.stringify(payload)}`);
  }
});

test('dealer nested error code and message survive the routing decision', () => {
  const outcome = resolveDealerActionOutcome({ error: { message: 'Invalid price', code: 'MT_RET_ERR_PARAMS' } });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.message, 'Invalid price');
  const coded = resolveDealerActionOutcome({ success: false, code: 'MT_RET_ERR_TRADE', message: 'Rejected by dealer' });
  assert.equal(coded.ok, false);
  assert.equal(coded.code, 'MT_RET_ERR_TRADE');
  assert.equal(coded.message, 'Rejected by dealer');
});
