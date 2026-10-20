import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';

// Exercise the REAL routing helper exported by TradeCommentCell.jsx. The
// bundle stubs every UI-only dependency (react, icons, tradeApi, css) while
// services/apiClient.js and utils/resultMessage.js stay REAL, so
// classification is tested — never mirrored.
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('./TradeCommentCell.jsx', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic',
  plugins: [{ name: 'trade-comment-cell-host', setup(builder) {
    builder.onResolve({ filter: /^(react|lucide-react)$|^react\/jsx-runtime$|services\/tradeApi$|\.css$/ }, ({ path }) => ({ path, namespace: 'trade-comment-cell-host' }));
    builder.onLoad({ filter: /.*/, namespace: 'trade-comment-cell-host' }, ({ path }) => {
      if (path === 'react') {
        return { loader: 'js', contents: 'export const useRef = (v) => ({ current: v }); export const useState = (i) => [typeof i === "function" ? i() : i, () => {}];' };
      }
      if (path === 'react/jsx-runtime') {
        return { loader: 'js', contents: 'export const jsx = () => null; export const jsxs = () => null; export const Fragment = "fragment";' };
      }
      if (path === 'lucide-react') {
        return { loader: 'js', contents: 'export const Check = "Check"; export const LoaderCircle = "LoaderCircle"; export const Pencil = "Pencil"; export const X = "X";' };
      }
      if (/services\/tradeApi$/.test(path)) {
        return { loader: 'js', contents: 'export const positionCommentChange = async () => ({});' };
      }
      return { loader: 'js', contents: 'export default () => null;' };
    });
  } }],
});
const { resolveCommentSaveOutcome } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

test('comment-save successes stay saved', () => {
  for (const payload of [
    { success: true },
    { success: true, message: 'Comment updated' },
    { ok: true },
    { success: true, retcode: 'MT_RET_OK' },
  ]) {
    assert.deepEqual(resolveCommentSaveOutcome(payload), { ok: true }, `must accept ${JSON.stringify(payload)}`);
  }
});

test('comment-save transport-flag failures surface with the server message', () => {
  for (const [payload, message] of [
    [{ success: false, message: 'Could not save comment.' }, 'Could not save comment.'],
    [{ ok: false, message: 'Comment rejected' }, 'Comment rejected'],
    [{ error: 'Market is closed.' }, 'Market is closed.'],
  ]) {
    const outcome = resolveCommentSaveOutcome(payload);
    assert.equal(outcome.ok, false, `must reject ${JSON.stringify(payload)}`);
    assert.equal(outcome.message, message, `must preserve the message for ${JSON.stringify(payload)}`);
  }
});

test('comment-save retcode rejections surface even when transport flags pass', () => {
  const payload = { success: true, retcode: 'MT_RET_ERR_PARAMS', message: 'Invalid comment' };
  const outcome = resolveCommentSaveOutcome(payload);
  assert.equal(outcome.ok, false, 'must reject a retcode failure');
  assert.equal(outcome.message, 'Invalid comment');
  assert.equal(outcome.code, 'MT_RET_ERR_PARAMS');
});

test('comment-save mixed success/error signals read as failure', () => {
  for (const payload of [
    { ok: true, success: false, message: 'Could not save comment.' },
    { ok: false, success: true, message: 'Comment rejected' },
    { success: true, error: { message: 'Invalid price', code: 'MT_RET_ERR_PARAMS' } },
  ]) {
    assert.equal(resolveCommentSaveOutcome(payload).ok, false, `must reject ${JSON.stringify(payload)}`);
  }
});

test('comment-save nested error message survives the routing decision', () => {
  const outcome = resolveCommentSaveOutcome({ error: { message: 'Invalid comment', code: 'MT_RET_ERR_PARAMS' } });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.message, 'Invalid comment');
});
