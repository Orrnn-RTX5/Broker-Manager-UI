import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { normalizeResult } from '../utils/resultMessage.js';

// Exercise the real useDealerMenu hook with stubbed react/store/trade layers.
// Every dealer grid action funnels through exec(), so driving Flip Position
// proves the feedback path: successes surface via showResult (the existing
// dealer-queue pattern) and failures via showResult.error. Recorded payloads
// are classified with the real normalizeResult — logic is never mirrored.
const resultCalls = [];
const stubs = {
  positionFlip: async () => ({ success: true }),
  positionPriceChange: async () => ({ success: true }),
  positionVolumeChange: async () => ({ success: true }),
  positionCommentChange: async () => ({ success: true }),
  positionForceClose: async () => ({ success: true }),
  positionForceCloseAll: async () => ({ success: true }),
  orderPriceChange: async () => ({ success: true }),
  orderReject: async () => ({ success: true }),
  orderApprove: async () => ({ success: true }),
  dealRollback: async () => ({ success: true }),
};
const hookState = { cursor: 0, slots: [] };
globalThis.__dealerMenuResultCalls = resultCalls;
globalThis.__dealerMenuStubs = stubs;
globalThis.__dealerMenuState = hookState;

const bundled = await build({
  entryPoints: [fileURLToPath(new URL('./useDealerMenu.js', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'browser',
  plugins: [{ name: 'dealer-menu-host', setup(builder) {
    builder.onResolve({ filter: /^(react|lucide-react)$|resultDialogStore\.js$|DealerPromptDialog$|tradeApi$|commentTranslation$/ }, ({ path }) => ({ path, namespace: 'dealer-menu-host' }));
    builder.onLoad({ filter: /.*/, namespace: 'dealer-menu-host' }, ({ path }) => {
      if (path === 'react') {
        return { loader: 'js', contents: `
          const state = globalThis.__dealerMenuState;
          export const useState = initial => {
            const index = state.cursor++;
            if (!(index in state.slots)) state.slots[index] = typeof initial === 'function' ? initial() : initial;
            const set = value => { state.slots[index] = typeof value === 'function' ? value(state.slots[index]) : value; };
            return [state.slots[index], set];
          };
          export const createElement = (type, props) => ({ type, props });
        ` };
      }
      if (path === 'lucide-react') {
        return { loader: 'js', contents: `
          export const ArrowLeftRight = 'ArrowLeftRight';
          export const DollarSign = 'DollarSign';
          export const BarChart3 = 'BarChart3';
          export const MessageSquare = 'MessageSquare';
          export const XCircle = 'XCircle';
          export const XSquare = 'XSquare';
          export const Undo2 = 'Undo2';
          export const CheckCircle2 = 'CheckCircle2';
        ` };
      }
      if (/resultDialogStore\.js$/.test(path)) {
        return { loader: 'js', contents: `
          const calls = globalThis.__dealerMenuResultCalls;
          export const showResult = (...args) => { calls.push({ kind: 'result', args }); };
          showResult.error = (...args) => { calls.push({ kind: 'error', args }); };
          showResult.success = (...args) => { calls.push({ kind: 'success', args }); };
          showResult.info = (...args) => { calls.push({ kind: 'info', args }); };
        ` };
      }
      if (/tradeApi$/.test(path)) {
        return { loader: 'js', contents: `
          const stubs = globalThis.__dealerMenuStubs;
          export const positionFlip = (...args) => stubs.positionFlip(...args);
          export const positionPriceChange = (...args) => stubs.positionPriceChange(...args);
          export const positionVolumeChange = (...args) => stubs.positionVolumeChange(...args);
          export const positionCommentChange = (...args) => stubs.positionCommentChange(...args);
          export const positionForceClose = (...args) => stubs.positionForceClose(...args);
          export const positionForceCloseAll = (...args) => stubs.positionForceCloseAll(...args);
          export const orderPriceChange = (...args) => stubs.orderPriceChange(...args);
          export const orderReject = (...args) => stubs.orderReject(...args);
          export const orderApprove = (...args) => stubs.orderApprove(...args);
          export const dealRollback = (...args) => stubs.dealRollback(...args);
        ` };
      }
      return { loader: 'js', contents: 'export default () => null; export const normalizeCommentForDefault = (v) => v;' };
    });
  } }],
});
const { useDealerMenu } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

const flush = () => new Promise((resolve) => { setTimeout(resolve, 10); });

const renderMenu = (onRefresh = () => { hookState.refreshed = (hookState.refreshed || 0) + 1; }) => {
  hookState.cursor = 0;
  // Test host drives the real hook outside React; state is stubbed above.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useDealerMenu(onRefresh);
};

const flipPosition = () => {
  const menu = renderMenu();
  const flip = menu.getPositionActions({ position: 101, login: '1001' }).find((a) => a.text === 'Flip Position');
  flip.onClick();
};

// Dialog actions stage through slots[0] (dialog) in the stubbed useState host:
// onClick sets the dialog config, then the operator submits its fields.
const submitPositionDialog = (actionText, values, pos = { position: 101, login: '1001', priceOpen: 1.1, volume: 1, priceCurrent: 1.2 }) => {
  const menu = renderMenu();
  const action = menu.getPositionActions(pos).find((a) => a.text === actionText);
  assert.ok(action, `missing position action ${actionText}`);
  action.onClick();
  const dialog = hookState.slots[0];
  assert.ok(dialog && typeof dialog.onSubmit === 'function', `${actionText} must open a dialog`);
  dialog.onSubmit(values);
};

const submitOrderDialog = (actionText, values, order = { ticket: 201, priceOpen: 1.1 }) => {
  const menu = renderMenu();
  const action = menu.getOrderActions(order).find((a) => a.text === actionText);
  assert.ok(action, `missing order action ${actionText}`);
  action.onClick();
  const dialog = hookState.slots[0];
  assert.ok(dialog && typeof dialog.onSubmit === 'function', `${actionText} must open a dialog`);
  dialog.onSubmit(values);
};

beforeEach(() => {
  resultCalls.length = 0;
  hookState.cursor = 0;
  hookState.slots = [];
  hookState.refreshed = 0;
  stubs.positionFlip = async () => ({ success: true });
  stubs.positionPriceChange = async () => ({ success: true });
  stubs.positionVolumeChange = async () => ({ success: true });
  stubs.positionCommentChange = async () => ({ success: true });
  stubs.positionForceClose = async () => ({ success: true });
  stubs.positionForceCloseAll = async () => ({ success: true });
  stubs.orderPriceChange = async () => ({ success: true });
  stubs.orderReject = async () => ({ success: true });
  stubs.orderApprove = async () => ({ success: true });
  stubs.dealRollback = async () => ({ success: true });
  globalThis.window = { confirm: () => true };
});

afterEach(() => {
  delete globalThis.window;
});

test('a successful dealer action surfaces the server result to the operator', async () => {
  stubs.positionFlip = async (ticket) => {
    assert.equal(ticket, 101);
    return { success: true, message: 'Position flipped' };
  };
  flipPosition();
  await flush();
  assert.equal(resultCalls.length, 1);
  assert.equal(resultCalls[0].kind, 'result');
  assert.deepEqual(resultCalls[0].args[0], { success: true, message: 'Position flipped' });
  assert.equal(normalizeResult(resultCalls[0].args[0]).type, 'success');
  assert.equal(hookState.refreshed, 1);
});

test('a rejected dealer action surfaces an error to the operator', async () => {
  stubs.positionFlip = async () => { throw new Error('No price'); };
  flipPosition();
  await flush();
  assert.equal(resultCalls.length, 1);
  assert.equal(resultCalls[0].kind, 'error');
  // Error feedback is a structured { message, code, status } payload so the
  // dialog's code field survives (intentional shape change; prefix kept).
  assert.match(resultCalls[0].args[0].message, /Error: No price/);
  assert.equal(hookState.refreshed, 0);
});

test('an application-level rejection surfaced to the operator reads as failure', async () => {
  stubs.positionFlip = async () => ({ success: false, message: 'Rejected by dealer' });
  flipPosition();
  await flush();
  assert.equal(resultCalls.length, 1);
  assert.equal(resultCalls[0].kind, 'result');
  assert.equal(normalizeResult(resultCalls[0].args[0]).type, 'error');
  // Error-classified payloads never refresh (intentional change: exec
  // re-classifies via normalizeResult and treats them like the catch path).
  assert.equal(hookState.refreshed, 0);
});

test('Force Close All is note-only: no symbol or comment input, and it names the login', () => {
  const menu = renderMenu();
  const action = menu.getPositionActions({ position: 101, login: '1001', symbol: 'EURUSD' }).find((a) => a.text === 'Force Close All (Login)');
  action.onClick();
  const fields = hookState.slots[0].fields;
  assert.deepEqual(fields.map((field) => field.type), ['note']);
  assert.deepEqual(fields.map((field) => field.text), ['Closes every open position on login 1001 at the current market price.']);
});

test('a Force Close All success sends the account-scoped close, then refreshes and closes the prompt', async () => {
  stubs.positionForceCloseAll = async (params) => {
    assert.deepEqual(params, { login: '1001' });
    return { success: true, reachedServer: true, message: 'Close All finished' };
  };
  submitPositionDialog('Force Close All (Login)', {});
  await flush();
  assert.equal(resultCalls.length, 1);
  assert.equal(hookState.refreshed, 1);
  assert.equal(hookState.slots[0], null);
});

test('a mixed Close All refreshes the grid, closes the prompt, and shows the actionable message', async () => {
  const message = 'Close All finished with some positions still open (3 closed, 1 open) - check the list and run Close All again.';
  stubs.positionForceCloseAll = async () => ({ success: false, reachedServer: true, message });
  submitPositionDialog('Force Close All (Login)', {});
  await flush();
  assert.equal(resultCalls.length, 1);
  assert.equal(resultCalls[0].kind, 'result');
  assert.equal(normalizeResult(resultCalls[0].args[0]).type, 'error');
  assert.equal(resultCalls[0].args[0].message, message);
  assert.equal(hookState.refreshed, 1);
  assert.equal(hookState.slots[0], null);
});

test('a Close All refusal the server answered refreshes the grid but keeps the prompt open to retry', async () => {
  stubs.positionForceCloseAll = async () => {
    throw Object.assign(new Error('Another Close All is already running for this account.'), { status: 409, code: 'BULK_CLOSE_ACCOUNT_BUSY', reachedServer: true });
  };
  submitPositionDialog('Force Close All (Login)', {});
  await flush();
  assert.equal(resultCalls.length, 1);
  assert.equal(resultCalls[0].kind, 'error');
  assert.equal(hookState.refreshed, 1);
  assert.ok(hookState.slots[0] && typeof hookState.slots[0].onSubmit === 'function', 'prompt must stay open');
});

test('a network failure shows the no-answer message, refreshes the list, and keeps the prompt open', async () => {
  const message = 'No answer from the server - the close may or may not have happened. Check the positions list, then retry (a retry within 2 minutes is safe).';
  stubs.positionForceClose = async () => { throw Object.assign(new Error(message), { reachedServer: true, actionable: true }); };
  submitPositionDialog('Force Close', {});
  await flush();
  assert.equal(resultCalls[0].kind, 'error');
  // Our own actionable message is shown as written, without the "Error: " prefix.
  assert.equal(resultCalls[0].args[0].message, message);
  assert.equal(hookState.refreshed, 1);
  assert.ok(hookState.slots[0] && typeof hookState.slots[0].onSubmit === 'function', 'prompt must stay open');
});

test('a 5xx unconfirmed close refreshes the list and keeps the prompt open to retry within the window', async () => {
  stubs.positionForceClose = async () => {
    throw Object.assign(new Error('Trading service did not confirm the close - check the positions list, then retry within 2 minutes (safe).'), { status: 503, reachedServer: true });
  };
  submitPositionDialog('Force Close', {});
  await flush();
  assert.equal(resultCalls[0].kind, 'error');
  assert.equal(hookState.refreshed, 1);
  assert.ok(hookState.slots[0] && typeof hookState.slots[0].onSubmit === 'function', 'prompt must stay open');
});

test('a Close All 202 refreshes the list and closes the prompt with the accepted message', async () => {
  stubs.positionForceCloseAll = async () => ({ success: true, reachedServer: true, message: 'Close All accepted for login 1001. Closing is in progress; the positions list will update.' });
  submitPositionDialog('Force Close All (Login)', {});
  await flush();
  assert.equal(normalizeResult(resultCalls[0].args[0]).type, 'success');
  assert.equal(hookState.refreshed, 1);
  assert.equal(hookState.slots[0], null);
});

test('a single close the server accepted (202) refreshes and closes the prompt with the accepted message', async () => {
  stubs.positionForceClose = async () => ({ success: true, reachedServer: true, message: 'Close accepted - the list will update.' });
  submitPositionDialog('Force Close', {});
  await flush();
  assert.equal(normalizeResult(resultCalls[0].args[0]).type, 'success');
  assert.equal(resultCalls[0].args[0].message, 'Close accepted - the list will update.');
  assert.equal(hookState.refreshed, 1);
  assert.equal(hookState.slots[0], null);
});

test('a Change Price success surfaces the server result to the operator', async () => {
  stubs.positionPriceChange = async (ticket, newPrice) => {
    assert.equal(ticket, 101);
    assert.equal(newPrice, 1.5);
    return { success: true, message: 'Price updated' };
  };
  submitPositionDialog('Change Price', { new_price: 1.5 });
  await flush();
  assert.equal(resultCalls.length, 1);
  assert.equal(resultCalls[0].kind, 'result');
  assert.deepEqual(resultCalls[0].args[0], { success: true, message: 'Price updated' });
  assert.equal(normalizeResult(resultCalls[0].args[0]).type, 'success');
  assert.equal(hookState.refreshed, 1);
});

test('a Change Price failure surfaces an error to the operator', async () => {
  stubs.positionPriceChange = async () => { throw new Error('Invalid price'); };
  submitPositionDialog('Change Price', { new_price: 1.5 });
  await flush();
  assert.equal(resultCalls.length, 1);
  assert.equal(resultCalls[0].kind, 'error');
  assert.match(resultCalls[0].args[0].message, /Error: Invalid price/);
  assert.equal(hookState.refreshed, 0);
});

test('Force Close is market-only: the dialog has no price input and says so', () => {
  const menu = renderMenu();
  const action = menu.getPositionActions({ position: 101, login: '1001', priceCurrent: 1.2 }).find((a) => a.text === 'Force Close');
  action.onClick();
  const fields = hookState.slots[0].fields;
  assert.equal(fields.some((field) => field.type === 'number' || field.key === 'price'), false);
  assert.deepEqual(fields.map((field) => field.text), ['Closes at the current market price.']);
});

test('a Force Close success surfaces the server result to the operator', async () => {
  stubs.positionForceClose = async (params) => {
    assert.deepEqual(params, { ticket: 101 });
    return { success: true, message: 'Position closed' };
  };
  submitPositionDialog('Force Close', {});
  await flush();
  assert.equal(resultCalls.length, 1);
  assert.equal(resultCalls[0].kind, 'result');
  assert.deepEqual(resultCalls[0].args[0], { success: true, message: 'Position closed' });
  assert.equal(normalizeResult(resultCalls[0].args[0]).type, 'success');
  assert.equal(hookState.refreshed, 1);
});

test('a Force Close application-level rejection reads as failure', async () => {
  stubs.positionForceClose = async () => ({ success: false, message: 'Force close failed' });
  submitPositionDialog('Force Close', {});
  await flush();
  assert.equal(resultCalls.length, 1);
  assert.equal(resultCalls[0].kind, 'result');
  assert.equal(normalizeResult(resultCalls[0].args[0]).type, 'error');
  // Error-classified payloads never refresh and leave the prompt open
  // (intentional change, matching catch-path semantics).
  assert.equal(hookState.refreshed, 0);
  assert.ok(hookState.slots[0] && typeof hookState.slots[0].onSubmit === 'function', 'prompt must stay open on error');
});

test('an Approve Order success surfaces the server result to the operator', async () => {
  stubs.orderApprove = async (params) => {
    assert.equal(params.ticket, 201);
    return { success: true, message: 'Order approved' };
  };
  submitOrderDialog('Approve Order', { comment: 'ok' });
  await flush();
  assert.equal(resultCalls.length, 1);
  assert.equal(resultCalls[0].kind, 'result');
  assert.deepEqual(resultCalls[0].args[0], { success: true, message: 'Order approved' });
  assert.equal(normalizeResult(resultCalls[0].args[0]).type, 'success');
  assert.equal(hookState.refreshed, 1);
});

test('a Reject Order failure surfaces an error to the operator', async () => {
  stubs.orderReject = async () => { throw new Error('Order reject failed'); };
  submitOrderDialog('Reject Order', { comment: 'no liquidity' });
  await flush();
  assert.equal(resultCalls.length, 1);
  assert.equal(resultCalls[0].kind, 'error');
  assert.match(resultCalls[0].args[0].message, /Error: Order reject failed/);
  assert.equal(hookState.refreshed, 0);
});

test('a Reject Order application-level rejection reads as failure', async () => {
  stubs.orderReject = async (params) => {
    assert.equal(params.ticket, 201);
    return { success: false, message: 'Rejected by dealer' };
  };
  submitOrderDialog('Reject Order', { comment: 'no liquidity' });
  await flush();
  assert.equal(resultCalls.length, 1);
  assert.equal(resultCalls[0].kind, 'result');
  assert.equal(normalizeResult(resultCalls[0].args[0]).type, 'error');
  // Error-classified payloads never refresh and leave the prompt open
  // (intentional change, matching catch-path semantics).
  assert.equal(hookState.refreshed, 0);
  assert.ok(hookState.slots[0] && typeof hookState.slots[0].onSubmit === 'function', 'prompt must stay open on error');
});

test('a text-classified failure payload shows an error with no refresh and the prompt stays open', async () => {
  // Passes the explicit-flag transport check (success: true, no error
  // member) but normalizeResult types the wording as error.
  stubs.positionPriceChange = async () => ({ success: true, message: 'Failed to update price' });
  submitPositionDialog('Change Price', { new_price: 1.5 });
  await flush();
  assert.equal(resultCalls.length, 1);
  assert.equal(resultCalls[0].kind, 'result');
  assert.equal(normalizeResult(resultCalls[0].args[0]).type, 'error');
  assert.equal(hookState.refreshed, 0);
  assert.ok(hookState.slots[0] && typeof hookState.slots[0].onSubmit === 'function', 'prompt must stay open on error');
});

test('a throwing onRefresh queues a single dialog and still closes the prompt', async () => {
  stubs.positionPriceChange = async () => ({ success: true, message: 'Price updated' });
  hookState.cursor = 0;
  const menu = useDealerMenu(() => { throw new Error('refresh boom'); });
  const action = menu.getPositionActions({ position: 101, login: '1001', priceOpen: 1.1, volume: 1, priceCurrent: 1.2 }).find((a) => a.text === 'Change Price');
  action.onClick();
  const dialog = hookState.slots[0];
  assert.ok(dialog && typeof dialog.onSubmit === 'function', 'Change Price must open a dialog');
  dialog.onSubmit({ new_price: 1.5 });
  await flush();
  assert.equal(resultCalls.length, 1);
  assert.equal(normalizeResult(resultCalls[0].args[0]).type, 'success');
  assert.equal(hookState.slots[0], null, 'prompt must close even when refresh throws');
});

test('a non-Error throw surfaces a safe message that never renders "Error: undefined"', async () => {
  stubs.positionFlip = async () => { throw 'boom'; };
  flipPosition();
  await flush();
  assert.equal(resultCalls.length, 1);
  assert.equal(resultCalls[0].kind, 'error');
  assert.match(resultCalls[0].args[0].message, /Error: boom/);
  assert.doesNotMatch(resultCalls[0].args[0].message, /undefined/);
  assert.equal(hookState.refreshed, 0);
});

test('an empty throw surfaces a safe fallback message', async () => {
  stubs.positionFlip = async () => { throw undefined; };
  flipPosition();
  await flush();
  assert.equal(resultCalls.length, 1);
  assert.equal(resultCalls[0].kind, 'error');
  assert.match(resultCalls[0].args[0].message, /Error: Unknown error/);
  assert.doesNotMatch(resultCalls[0].args[0].message, /undefined/);
  assert.equal(hookState.refreshed, 0);
});

test('a transport error preserves its code through the error feedback', async () => {
  stubs.positionFlip = async () => {
    throw Object.assign(new Error('No price'), { code: 'MT_RET_ERR_TRADE_TIMEOUT', status: 500 });
  };
  flipPosition();
  await flush();
  assert.equal(resultCalls.length, 1);
  assert.equal(resultCalls[0].kind, 'error');
  assert.match(resultCalls[0].args[0].message, /Error: No price/);
  assert.equal(normalizeResult(resultCalls[0].args[0]).code, 'MT_RET_ERR_TRADE_TIMEOUT');
  assert.equal(hookState.refreshed, 0);
});
