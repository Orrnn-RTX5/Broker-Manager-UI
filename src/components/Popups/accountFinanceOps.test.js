import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LiveTradingState } from '../../services/liveTradingState.js';
import { PERMISSIONS, decidePermission } from '../../utils/permissions.js';
import {
  normalizeSkipMarginReason,
  DEFAULT_MANAGER_TRANSACTION_TYPE,
  MANAGER_TRANSACTION_TYPES,
  buildManagerTransactionConfirmation,
  buildManagerTransactionFailurePrefix,
  buildManagerTransactionRequest,
  buildManagerTransactionSuccessMessage,
  describeManagerTransactionFailure,
  describeManagerTransactionPending,
  EXPIRED_PENDING_TEXT,
  IN_FLIGHT_PENDING_TEXT,
  OUTCOME_UNKNOWN_PENDING_TEXT,
  STORE_UNAVAILABLE_PENDING_TEXT,
  UNVERIFIED_PENDING_TEXT,
  formatManagerMoneyIfKnown,
  formatManagerMoneyText,
  getManagerBalanceOpDirections,
  MANAGER_REPLAY_TEXT,
  getManagerCommentPresets,
  getManagerTransactionOptions,
  isManagerTransactionAvailable,
  isSupportedManagerTransactionType,
  isTransferType,
  normalizeManagerAmount,
  resolveManagerTransactionType,
  resolveTransferDestination,
  IDEMPOTENCY_CODE_CLASSES,
  KEY_CONFLICT_PENDING_TEXT,
  KEY_HOLD_PENDING_TEXT,
  KEY_REJECTED_PENDING_TEXT,
  isKeyHoldCode,
  LIVE_ONLY_ACCOUNT_METRIC_FIELDS,
  MANAGER_UNKNOWN_MONEY_TEXT,
  deriveAccountFinanceSummary,
  getLiveAccountMetricValue,
  resolveAccountPopupFieldValue,
} from './accountFinanceOps.js';

// Fake logins only. Never real owner or QA-pool accounts in test data.
const LOGIN = 710001;
const DESTINATION = 710002;

const MT5_ORDER = [
  'balance', 'credit', 'charge', 'correction', 'bonus', 'commission',
  'tax', 'so_compensation', 'so_credit_compensation', 'transfer',
];
const DISABLED = ['charge', 'correction', 'bonus', 'commission', 'tax', 'so_compensation', 'so_credit_compensation'];


describe('accountFinanceOps operation list', () => {
  it('defaults to balance and lists the ten MT5 operations in MT5 order', () => {
    assert.equal(DEFAULT_MANAGER_TRANSACTION_TYPE, 'balance');
    assert.deepEqual([...MANAGER_TRANSACTION_TYPES], MT5_ORDER);
  });

  it('enables only balance, credit and transfer in Phase A', () => {
    const options = getManagerTransactionOptions();
    assert.deepEqual(options.map((option) => option.value), MT5_ORDER);
    assert.deepEqual(
      options.filter((option) => option.enabled).map((option) => option.value),
      ['balance', 'credit', 'transfer'],
    );
    assert.equal(options.find((option) => option.value === 'so_credit_compensation').label, 'SO credit compensation');
    assert.equal(options.find((option) => option.value === 'balance').label, 'Balance');
  });

  it('returns fresh option objects on every call', () => {
    const first = getManagerTransactionOptions();
    first[0].value = 'rebate';
    assert.equal(getManagerTransactionOptions()[0].value, 'balance');
  });

  it('reports availability: enabled only for live routes, false for unknown', () => {
    for (const type of ['balance', 'credit', 'transfer']) assert.equal(isManagerTransactionAvailable(type), true);
    for (const type of DISABLED) assert.equal(isManagerTransactionAvailable(type), false);
    assert.equal(isManagerTransactionAvailable('rebate'), false);
    assert.equal(isManagerTransactionAvailable(''), false);
  });

  it('normalizes case and whitespace on every listed key', () => {
    assert.equal(resolveManagerTransactionType('  Balance  '), 'balance');
    assert.equal(resolveManagerTransactionType('CREDIT'), 'credit');
    assert.equal(resolveManagerTransactionType('\tTransfer\n'), 'transfer');
    assert.equal(resolveManagerTransactionType(' SO_CREDIT_COMPENSATION '), 'so_credit_compensation');
    for (const type of MT5_ORDER) assert.equal(isSupportedManagerTransactionType(type), true);
  });

  it('fails closed on unknown, legacy, empty, nullish, and lookalike types', () => {
    const bad = [
      'rebate', 'deposit', 'withdraw', 'deposits', 'balance_op', 'balance-op', 'de posit',
      '', '   ', '\n\t ', null, undefined, 0, 123, -1, true, Number.NaN, {}, [],
      Symbol('balance'), 'toString', '__proto__', 'constructor',
    ];
    for (const value of bad) {
      assert.equal(isSupportedManagerTransactionType(value), false);
      assert.throws(() => resolveManagerTransactionType(value), TypeError);
      assert.throws(() => buildManagerTransactionRequest({ type: value, direction: 'in', login: LOGIN, amount: '1.00' }), TypeError);
      assert.throws(() => buildManagerTransactionConfirmation(value, '1.00 USD', LOGIN, undefined, 'in'), TypeError);
      assert.throws(() => buildManagerTransactionSuccessMessage(value, '1.00 USD', LOGIN, undefined, 'in'), TypeError);
      assert.throws(() => buildManagerTransactionFailurePrefix(value, LOGIN, 'in'), TypeError);
    }
  });

  it('predicates the transfer operation without throwing', () => {
    assert.equal(isTransferType('transfer'), true);
    assert.equal(isTransferType(' Transfer '), true);
    assert.equal(isTransferType('balance'), false);
    assert.equal(isTransferType('credit'), false);
    assert.equal(isTransferType(null), false);
    assert.equal(isTransferType('rebate'), false);
  });
});

describe('accountFinanceOps route mapping (existing routes)', () => {
  it('maps balance in to deposit and balance out to withdraw, with no credit_out', () => {
    assert.deepEqual(
      buildManagerTransactionRequest({ type: 'balance', direction: 'in', login: LOGIN, amount: '100.00', comment: 'Deposit' }),
      { endpointKey: 'deposit', payload: { login: LOGIN, amount: '100.00', comment: 'Deposit' } },
    );
    assert.deepEqual(
      buildManagerTransactionRequest({ type: 'balance', direction: 'out', login: LOGIN, amount: '100.00' }),
      { endpointKey: 'withdraw', payload: { login: LOGIN, amount: '100.00', comment: '' } },
    );
  });

  it('maps credit in to credit without credit_out', () => {
    const request = buildManagerTransactionRequest({ type: 'credit', direction: 'in', login: LOGIN, amount: '500.00' });
    assert.equal(request.endpointKey, 'credit');
    assert.equal('credit_out' in request.payload, false);
  });

  it('maps credit out to credit with credit_out: true', () => {
    const request = buildManagerTransactionRequest({ type: 'credit', direction: 'out', login: LOGIN, amount: '200.00', comment: 'Remove credit' });
    assert.deepEqual(request, {
      endpointKey: 'credit',
      payload: { login: LOGIN, amount: '200.00', comment: 'Remove credit', credit_out: true },
    });
  });

  it('maps transfer to from_login and to_login only, with no login key', () => {
    const request = buildManagerTransactionRequest({
      type: 'transfer', direction: null, login: LOGIN, destination: String(DESTINATION), amount: '250.00', comment: 'Internal move',
    });
    assert.deepEqual(request, {
      endpointKey: 'transfer',
      payload: { from_login: LOGIN, to_login: DESTINATION, amount: '250.00', comment: 'Internal move' },
    });
    assert.equal('login' in request.payload, false);
  });

  it('requires a direction for balance and credit, and none for transfer', () => {
    for (const direction of [undefined, null, '', 'IN', 'sideways', 'both']) {
      assert.throws(() => buildManagerTransactionRequest({ type: 'balance', direction, login: LOGIN, amount: '1.00' }), TypeError);
      assert.throws(() => buildManagerTransactionRequest({ type: 'credit', direction, login: LOGIN, amount: '1.00' }), TypeError);
    }
    for (const direction of ['in', 'out']) {
      assert.throws(() => buildManagerTransactionRequest({
        type: 'transfer', direction, login: LOGIN, destination: DESTINATION, amount: '1.00',
      }), /does not take a direction/);
    }
  });

  it('fails closed on a transfer to the same account and on a missing destination', () => {
    assert.throws(() => buildManagerTransactionRequest({
      type: 'transfer', direction: null, login: LOGIN, destination: LOGIN, amount: '1.00',
    }), /different from the source/);
    assert.throws(() => buildManagerTransactionRequest({
      type: 'transfer', direction: null, login: LOGIN, destination: '', amount: '1.00',
    }), /Enter a destination login/);
  });

  it('refuses every disabled operation in both directions, so no balance-op route is reachable', () => {
    for (const type of DISABLED) {
      for (const direction of ['in', 'out']) {
        assert.throws(() => buildManagerTransactionRequest({ type, direction, login: LOGIN, amount: '1.00' }), /not available yet/);
      }
    }
  });

  it('gives SO credit compensation no deposit path and SO compensation no withdrawal path', () => {
    assert.throws(() => buildManagerTransactionRequest({ type: 'so_credit_compensation', direction: 'in', login: LOGIN, amount: '1.00' }), /not available yet/);
    assert.throws(() => buildManagerTransactionRequest({ type: 'so_compensation', direction: 'out', login: LOGIN, amount: '1.00' }), /not available yet/);
  });

  it('rejects invalid logins before building a request', () => {
    for (const login of [0, -1, 1.5, '', 'abc', '12abc', null, undefined, Number.NaN]) {
      assert.throws(() => buildManagerTransactionRequest({ type: 'balance', direction: 'in', login, amount: '1.00' }), /invalid login/);
    }
  });

  it('trims the comment and refuses one longer than 500 characters', () => {
    assert.equal(buildManagerTransactionRequest({ type: 'balance', direction: 'in', login: LOGIN, amount: '1.00', comment: '  Bonus note  ' }).payload.comment, 'Bonus note');
    assert.throws(() => buildManagerTransactionRequest({
      type: 'balance', direction: 'in', login: LOGIN, amount: '1.00', comment: 'x'.repeat(501),
    }), /500 characters/);
    assert.equal(buildManagerTransactionRequest({
      type: 'balance', direction: 'in', login: LOGIN, amount: '1.00', comment: 'x'.repeat(500),
    }).payload.comment.length, 500);
  });
});

describe('accountFinanceOps amount handling (exact decimal text)', () => {
  it('returns a canonical two-decimal string', () => {
    assert.equal(normalizeManagerAmount('1.5'), '1.50');
    assert.equal(normalizeManagerAmount(1.5), '1.50');
    assert.equal(normalizeManagerAmount('12'), '12.00');
    assert.equal(normalizeManagerAmount('  12  '), '12.00');
    assert.equal(normalizeManagerAmount('0.01'), '0.01');
    assert.equal(normalizeManagerAmount('00.50'), '0.50');
    assert.equal(normalizeManagerAmount('1000000'), '1000000.00');
    assert.equal(normalizeManagerAmount('1000000.00'), '1000000.00');
  });

  it('rejects exponents, signs, zero, extra decimals, grouping, and out-of-range values', () => {
    for (const bad of ['1e3', '-1', '0', '0.00', '1.005', '.5', '1.', '1,000.00', 'abc', '', '   ', '1000000.01', '1000001', '10000000', 1e21, null, undefined, Number.NaN, true]) {
      assert.equal(normalizeManagerAmount(bad), null, String(bad));
    }
  });

  it('formats money text exactly and shows unknown values as a dash, never 0.00', () => {
    assert.equal(formatManagerMoneyText('9737.5'), '9,737.50');
    assert.equal(formatManagerMoneyText('1234567'), '1,234,567.00');
    assert.equal(formatManagerMoneyText('-1234.5'), '-1,234.50');
    assert.equal(formatManagerMoneyText(0), '0.00');
    assert.equal(formatManagerMoneyText('0'), '0.00');
    assert.equal(formatManagerMoneyText(9737.5), '9,737.50');
    for (const unknown of [null, undefined, '', '   ', 'abc', Number.NaN, Number.POSITIVE_INFINITY, {}]) {
      assert.equal(formatManagerMoneyText(unknown), '—');
    }
  });
});

describe('accountFinanceOps confirmation, success and failure copy', () => {
  it('builds exact confirmation copy per route', () => {
    assert.equal(buildManagerTransactionConfirmation('balance', '100.00 USD', LOGIN, undefined, 'in'), 'Deposit 100.00 USD into account #710001?');
    assert.equal(buildManagerTransactionConfirmation('balance', '100.00 USD', LOGIN, undefined, 'out'), 'Withdraw 100.00 USD from account #710001?');
    assert.equal(buildManagerTransactionConfirmation('credit', '100.00 USD', LOGIN, undefined, 'in'), 'Credit 100.00 USD to account #710001?');
    assert.equal(buildManagerTransactionConfirmation('credit', '100.00 USD', LOGIN, undefined, 'out'), 'Withdraw credit 100.00 USD from account #710001?');
    assert.equal(buildManagerTransactionConfirmation('transfer', '100.00 USD', LOGIN, DESTINATION, null), 'Transfer 100.00 USD from account #710001 to account #710002?');
    assert.equal(buildManagerTransactionConfirmation('transfer', '100.00 USD', LOGIN, null, null), 'Transfer 100.00 USD from account #710001?');
  });

  it('builds exact success copy per route', () => {
    assert.equal(buildManagerTransactionSuccessMessage('balance', '100.00 USD', LOGIN, undefined, 'in'), 'Deposited 100.00 USD into account #710001 successfully.');
    assert.equal(buildManagerTransactionSuccessMessage('balance', '100.00 USD', LOGIN, undefined, 'out'), 'Withdrew 100.00 USD from account #710001 successfully.');
    assert.equal(buildManagerTransactionSuccessMessage('credit', '100.00 USD', LOGIN, undefined, 'in'), 'Credited 100.00 USD to account #710001 successfully.');
    assert.equal(buildManagerTransactionSuccessMessage('credit', '100.00 USD', LOGIN, undefined, 'out'), 'Credit withdrawn 100.00 USD from account #710001 successfully.');
    assert.equal(buildManagerTransactionSuccessMessage('transfer', '100.00 USD', LOGIN, DESTINATION, null), 'Transferred 100.00 USD from account #710001 to account #710002 successfully.');
  });

  it('builds failure prefixes per route', () => {
    assert.equal(buildManagerTransactionFailurePrefix('balance', LOGIN, 'in'), 'Deposit for account #710001');
    assert.equal(buildManagerTransactionFailurePrefix('balance', LOGIN, 'out'), 'Withdraw for account #710001');
    assert.equal(buildManagerTransactionFailurePrefix('credit', LOGIN, 'out'), 'Withdraw credit for account #710001');
    assert.equal(buildManagerTransactionFailurePrefix(' TRANSFER ', LOGIN, null), 'Transfer for account #710001');
  });

  it('keeps the server code and maps INSUFFICIENT_FUNDS to the balance copy', () => {
    assert.deepEqual(
      describeManagerTransactionFailure({ code: 'INSUFFICIENT_FUNDS', message: 'Not enough balance' }, 'balance'),
      { text: 'Insufficient balance / free margin', detail: 'Not enough balance', code: 'INSUFFICIENT_FUNDS' },
    );
  });

  it('maps engine-owned codes on transfer, and shows the backend message for them on other operations', () => {
    for (const code of ['ACCOUNT_ENGINE_OWNED', 'ACCOUNT_NOT_ENGINE_OWNED']) {
      assert.deepEqual(
        describeManagerTransactionFailure({ code, message: 'server says no' }, 'transfer'),
        { text: 'Transfer not available on this server version', detail: 'server says no', code },
      );
    }
    assert.deepEqual(
      describeManagerTransactionFailure({ code: 'ACCOUNT_ENGINE_OWNED', message: 'server says no' }, 'balance'),
      { text: 'server says no', detail: '', code: 'ACCOUNT_ENGINE_OWNED' },
    );
  });

  it('shows the backend message for unlisted codes and a fallback when there is no message', () => {
    assert.deepEqual(
      describeManagerTransactionFailure({ code: 'CREDIT_OUT_ENGINE_ONLY', message: 'Credit out needs an engine account' }, 'credit'),
      { text: 'Credit out needs an engine account', detail: '', code: 'CREDIT_OUT_ENGINE_ONLY' },
    );
    assert.deepEqual(describeManagerTransactionFailure({}, 'balance'), { text: 'The request was not completed.', detail: '', code: null });
  });

  it('describes pending, expired, and exact idempotency pending codes with specific copy, never as success or Unrecognised status', () => {
    assert.deepEqual(describeManagerTransactionPending('balance', 'pending', null), {
      text: 'Pending: check history, do not repeat. Send the same form again only to retry it.', detail: '', code: null,
    });
    assert.deepEqual(describeManagerTransactionPending('transfer', 'unresolved', 'TRANSFER_UNRESOLVED'), {
      text: 'Transfer is half applied. Send the same form again to complete it. Do not change the form.',
      detail: '',
      code: 'TRANSFER_UNRESOLVED',
    });
    assert.deepEqual(describeManagerTransactionPending('balance', 'expired', null), {
      text: EXPIRED_PENDING_TEXT,
      detail: '',
      code: null,
    });
    for (const code of ['IDEMPOTENCY_IN_FLIGHT', 'IN_FLIGHT', 'IN_PROGRESS']) {
      assert.deepEqual(describeManagerTransactionPending('balance', 'pending', code), {
        text: IN_FLIGHT_PENDING_TEXT,
        detail: '',
        code,
      });
    }
    for (const code of ['IDEMPOTENCY_OUTCOME_UNKNOWN', 'OUTCOME_UNKNOWN']) {
      assert.deepEqual(describeManagerTransactionPending('balance', 'pending', code), {
        text: OUTCOME_UNKNOWN_PENDING_TEXT,
        detail: '',
        code,
      });
    }
    for (const code of ['IDEMPOTENCY_STORE_UNAVAILABLE', 'STORE_UNAVAILABLE', 'IDEMPOTENCY_UNAVAILABLE', 'UNAVAILABLE']) {
      assert.deepEqual(describeManagerTransactionPending('balance', 'pending', code), {
        text: STORE_UNAVAILABLE_PENDING_TEXT,
        detail: '',
        code,
      });
    }
    for (const code of ['IDEMPOTENCY_UNVERIFIED', 'UNVERIFIED']) {
      assert.deepEqual(describeManagerTransactionPending('balance', 'pending', code), {
        text: UNVERIFIED_PENDING_TEXT,
        detail: '',
        code,
      });
    }
    assert.match(describeManagerTransactionPending('transfer', 'pending', null).text, /^Pending:/);
  });
});

describe('accountFinanceOps margin-check skip (Withdrawal only)', () => {
  const REASON = 'Owner-approved withdrawal below zero, ticket OPS-124';

  it('sends skip_margin_check and the reason only on withdraw', () => {
    assert.deepEqual(buildManagerTransactionRequest({
      type: 'balance', direction: 'out', login: LOGIN, amount: '1500.00', comment: 'Balance withdrawal',
      skipMarginCheck: true, skipMarginReason: REASON,
    }), {
      endpointKey: 'withdraw',
      payload: { login: LOGIN, amount: '1500.00', comment: 'Balance withdrawal', skip_margin_check: true, skip_margin_reason: REASON },
    });
  });

  it('never sends the flag on deposit, credit in, or credit out when it is not set', () => {
    for (const [type, direction] of [['balance', 'in'], ['credit', 'in'], ['credit', 'out']]) {
      const request = buildManagerTransactionRequest({ type, direction, login: LOGIN, amount: '1.00', skipMarginCheck: false });
      assert.equal('skip_margin_check' in request.payload, false);
      assert.equal('skip_margin_reason' in request.payload, false);
    }
  });

  it('refuses the flag on deposit, credit in, credit out, and transfer', () => {
    for (const [type, direction] of [['balance', 'in'], ['credit', 'in'], ['credit', 'out']]) {
      assert.throws(() => buildManagerTransactionRequest({
        type, direction, login: LOGIN, amount: '1.00', skipMarginCheck: true, skipMarginReason: REASON,
      }), /only be skipped on a withdrawal/);
    }
    assert.throws(() => buildManagerTransactionRequest({
      type: 'transfer', direction: null, login: LOGIN, destination: DESTINATION, amount: '1.00', skipMarginCheck: true, skipMarginReason: REASON,
    }), /cannot be skipped on a transfer/);
  });

  it('requires a reason of 10 to 500 characters when the flag is set', () => {
    for (const reason of ['', '   ', 'short', 'a'.repeat(9), 'a'.repeat(501), undefined, null]) {
      assert.throws(() => buildManagerTransactionRequest({
        type: 'balance', direction: 'out', login: LOGIN, amount: '1.00', skipMarginCheck: true, skipMarginReason: reason,
      }), /characters to skip the margin check/);
    }
    assert.equal(normalizeSkipMarginReason(`  ${'a'.repeat(10)}  `), 'a'.repeat(10));
    assert.equal(normalizeSkipMarginReason('a'.repeat(500)).length, 500);
  });

  it('refuses a non-boolean skip flag instead of guessing', () => {
    assert.throws(() => buildManagerTransactionRequest({
      type: 'balance', direction: 'out', login: LOGIN, amount: '1.00', skipMarginCheck: 'yes',
    }), /true or false/);
  });

  it('gates the checkbox on manage_finances_skip_margin: visible when granted, hidden otherwise', () => {
    assert.equal(PERMISSIONS.MANAGE_FINANCES_SKIP_MARGIN, 'manage_finances_skip_margin');
    const granted = { isAdmin: false, permissions: ['manage_finances', 'manage_finances_skip_margin'], isLoading: false, isError: false };
    const withoutSkip = { isAdmin: false, permissions: ['manage_finances'], isLoading: false, isError: false };
    const failed = { isAdmin: false, permissions: [], isLoading: false, isError: true };
    assert.equal(decidePermission(granted, PERMISSIONS.MANAGE_FINANCES_SKIP_MARGIN), true);
    assert.equal(decidePermission(withoutSkip, PERMISSIONS.MANAGE_FINANCES_SKIP_MARGIN), false);
    assert.equal(decidePermission(failed, PERMISSIONS.MANAGE_FINANCES_SKIP_MARGIN), false);
  });

  it('keeps the server code for each skip refusal and shows the backend message', () => {
    for (const code of ['SKIP_MARGIN_NOT_PERMITTED', 'INVALID_INPUT', 'SKIP_MARGIN_ENGINE_ONLY', 'IDEMPOTENCY_MISMATCH']) {
      assert.deepEqual(
        describeManagerTransactionFailure({ code, message: 'server text' }, 'balance'),
        { text: 'server text', detail: '', code },
      );
    }
  });

  it('keeps a negative balance_after exact as decimal text', () => {
    assert.equal(formatManagerMoneyText('-500.00'), '-500.00');
    assert.equal(formatManagerMoneyText('-1234.5'), '-1,234.50');
  });
});

describe('accountFinanceOps transfer reversal and unrecognised outcomes', () => {
  it('shows TRANSFER_REVERSED as a refusal with the leg code and the returned amount', () => {
    assert.deepEqual(describeManagerTransactionFailure({
      code: 'TRANSFER_REVERSED',
      message: 'Transfer refused by the receiving account',
      body: { status: 'REVERSED', in_leg: 'refused', in_leg_code: 'ACCOUNT_DISABLED', reversal: 'applied', from: { login: LOGIN, balance_after: '10000.00' } },
    }, 'transfer'), {
      text: 'Transfer refused: ACCOUNT_DISABLED. The amount was returned to #710001.',
      detail: '',
      code: 'TRANSFER_REVERSED',
    });
  });

  it('falls back to the server message when there is no leg code', () => {
    assert.deepEqual(describeManagerTransactionFailure({
      code: 'TRANSFER_REVERSED', message: 'Receiver refused.', body: {},
    }, 'transfer'), {
      text: 'Transfer refused: Receiver refused. The amount was returned to the sending account.',
      detail: '',
      code: 'TRANSFER_REVERSED',
    });
  });

  it('shows an unrecognised status as a failure with the raw code', () => {
    assert.deepEqual(describeManagerTransactionFailure({ code: 'PARTIAL_REVERSAL', message: '', unrecognized: true }, 'transfer'), {
      text: 'Unrecognised status', detail: '', code: 'PARTIAL_REVERSAL',
    });
  });

  it('uses the retry-with-same-key copy for a 202 whose reversal is pending', () => {
    assert.deepEqual(describeManagerTransactionPending('transfer', 'unresolved', 'TRANSFER_UNRESOLVED', 'pending'), {
      text: 'Transfer is unresolved: the return of the amount is pending. Retry with the same key. Do not change the form.',
      detail: '',
      code: 'TRANSFER_UNRESOLVED',
    });
    assert.equal(
      describeManagerTransactionPending('transfer', 'unresolved', 'TRANSFER_UNRESOLVED', 'none').text,
      'Transfer is half applied. Send the same form again to complete it. Do not change the form.',
    );
  });
});

describe('accountFinanceOps balance-op directions (contract v4)', () => {
  const BALANCE_OP_TYPES = ['charge', 'correction', 'bonus', 'commission', 'tax', 'so_compensation', 'so_credit_compensation'];

  it('gives each balance-op type the directions contract v4 allows', () => {
    for (const type of ['charge', 'correction', 'bonus', 'commission', 'tax']) {
      assert.deepEqual(getManagerBalanceOpDirections(type), ['in', 'out']);
    }
    assert.deepEqual(getManagerBalanceOpDirections('so_compensation'), ['in']);
    assert.deepEqual(getManagerBalanceOpDirections('so_credit_compensation'), ['out']);
  });

  it('gives no balance-op directions to the existing-route operations', () => {
    for (const type of ['balance', 'credit', 'transfer']) assert.deepEqual(getManagerBalanceOpDirections(type), []);
    assert.throws(() => getManagerBalanceOpDirections('rebate'), TypeError);
  });

  it('never offers dividend or dividend_franked', () => {
    for (const type of ['dividend', 'dividend_franked']) {
      assert.equal(isSupportedManagerTransactionType(type), false);
      assert.throws(() => buildManagerTransactionRequest({ type, direction: 'in', login: LOGIN, amount: '1.00' }), TypeError);
    }
    assert.equal(getManagerTransactionOptions().some((option) => /dividend/.test(option.value)), false);
    assert.equal(getManagerTransactionOptions().some((option) => /Dividend/.test(option.label)), false);
  });

  it('keeps every balance-op type disabled in Phase A, whatever direction v4 names', () => {
    for (const type of BALANCE_OP_TYPES) {
      assert.equal(isManagerTransactionAvailable(type), false);
      for (const direction of ['in', 'out']) {
        assert.throws(() => buildManagerTransactionRequest({ type, direction, login: LOGIN, amount: '1.00' }), /not available yet/);
      }
    }
  });
});

describe('accountFinanceOps comment presets', () => {
  it('offers non-empty, fresh suggestion lists per operation', () => {
    assert.deepEqual(getManagerCommentPresets('balance'), ['Deposit', 'Withdrawal']);
    assert.deepEqual(getManagerCommentPresets('credit'), ['Credit in', 'Credit out']);
    assert.deepEqual(getManagerCommentPresets('transfer'), ['Transfer']);
    assert.deepEqual(getManagerCommentPresets('tax'), ['Tax']);
    for (const type of MT5_ORDER) {
      const presets = getManagerCommentPresets(type);
      assert.ok(presets.length > 0);
      assert.ok(presets.every((preset) => preset.length > 0));
    }
    const first = getManagerCommentPresets('balance');
    first.push('rebate');
    assert.deepEqual(getManagerCommentPresets('balance'), ['Deposit', 'Withdrawal']);
  });
});

describe('accountFinanceOps transfer destination plumbing', () => {
  it('resolves a valid destination login against a different source', () => {
    assert.equal(resolveTransferDestination('710002', 710001), 710002);
    assert.equal(resolveTransferDestination(710002, 710001), 710002);
    assert.equal(resolveTransferDestination('  710002  ', 710001), 710002);
    assert.equal(resolveTransferDestination(710002, '710001'), 710002);
  });

  it('throws a clear TypeError for blank, zero, negative, float, non-numeric, and same-account destinations', () => {
    for (const blank of ['', '   ', null, undefined]) {
      assert.throws(() => resolveTransferDestination(blank, 710001), /Enter a destination login\./);
    }
    for (const zero of [0, '0', ' 0 ']) assert.throws(() => resolveTransferDestination(zero, 710001), /positive integer/i);
    for (const negative of [-5, '-5']) assert.throws(() => resolveTransferDestination(negative, 710001), /positive integer/i);
    for (const fraction of ['12.5', 12.5, '710002.5']) assert.throws(() => resolveTransferDestination(fraction, 710001), TypeError);
    for (const bad of ['abc', '12abc', '--5', '1,000', Number.NaN, Number.POSITIVE_INFINITY, true, {}]) {
      assert.throws(() => resolveTransferDestination(bad, 710001), TypeError);
    }
    assert.throws(() => resolveTransferDestination(710001, 710001), /different/i);
    assert.throws(() => resolveTransferDestination('710001', '  710001  '), /different/i);
  });
});

describe('accountFinanceOps exact money display (M2, contract v5)', () => {
  it('shows a JS number at two decimals, without float artefacts', () => {
    assert.equal(formatManagerMoneyText(10012.345678901234), '10,012.35');
    assert.equal(formatManagerMoneyText(0.1 + 0.2), '0.30');
    assert.equal(formatManagerMoneyText(1234.5), '1,234.50');
    assert.equal(formatManagerMoneyText(0), '0.00');
    assert.equal(formatManagerMoneyText(-12.3), '-12.30');
    assert.equal(formatManagerMoneyText(123456789.12), '123,456,789.12');
    assert.equal(formatManagerMoneyText(1.005), '1.01');
  });

  it('shows a value of 1e21 and above as its full number, never the dash', () => {
    assert.equal(formatManagerMoneyText(1e21), '1,000,000,000,000,000,000,000.00');
    assert.equal(formatManagerMoneyText(-1e21), '-1,000,000,000,000,000,000,000.00');
    assert.equal(formatManagerMoneyText(1.5e21), '1,500,000,000,000,000,000,000.00');
  });

  it('expands a large number from its shortest decimal text, with no binary artefact (L1)', () => {
    assert.equal(formatManagerMoneyText(1e23), '100,000,000,000,000,000,000,000.00');
    assert.equal(formatManagerMoneyText(-2.5e22), '-25,000,000,000,000,000,000,000.00');
    assert.equal(formatManagerMoneyText('100000000000000000000000.00'), '100,000,000,000,000,000,000,000.00');
  });

  it('shows a very small number as 0.00, with no negative zero', () => {
    assert.equal(formatManagerMoneyText(5e-7), '0.00');
    assert.equal(formatManagerMoneyText(-5e-7), '0.00');
    assert.equal(formatManagerMoneyText('-0.001'), '0.00');
  });

  it('rounds a decimal string by string arithmetic and keeps every digit beyond 2^53', () => {
    assert.equal(formatManagerMoneyText('10012.345678901234'), '10,012.35');
    assert.equal(formatManagerMoneyText('10012.344'), '10,012.34');
    assert.equal(formatManagerMoneyText('0.125'), '0.13');
    assert.equal(formatManagerMoneyText('-0.125'), '-0.13');
    assert.equal(formatManagerMoneyText('999.999'), '1,000.00');
    assert.equal(formatManagerMoneyText('-999.999'), '-1,000.00');
    assert.equal(formatManagerMoneyText('9007199254740993.00'), '9,007,199,254,740,993.00');
    assert.equal(formatManagerMoneyText('123456789012345678901234567890.505'), '123,456,789,012,345,678,901,234,567,890.51');
  });

  it('keeps the unknown marker for missing or non-decimal values, never an invented number', () => {
    for (const unknown of [null, undefined, '', 'abc', '1e5', Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, {}, true]) {
      assert.equal(formatManagerMoneyText(unknown), '—', String(unknown));
    }
  });

  it('exposes the replay copy used when the server answers from its idempotency cache', () => {
    assert.equal(MANAGER_REPLAY_TEXT, 'Already done — balance refreshed');
  });
});

describe('accountFinanceOps balance_after (contract v5: JSON number on existing routes, string on new routes)', () => {
  it('formats the number form and the string form of the same amount the same way', () => {
    const cases = [
      [1234.5, '1,234.50'], ['1234.50', '1,234.50'],
      [0, '0.00'], ['0', '0.00'],
      [-12.3, '-12.30'], ['-12.30', '-12.30'],
      [123456789.12, '123,456,789.12'], ['123456789.12', '123,456,789.12'],
      ['-500.00', '-500.00'],
    ];
    for (const [value, text] of cases) {
      assert.equal(formatManagerMoneyIfKnown(value), text, String(value));
    }
  });

  it('returns null, not the dash, for a value that is not money, so the sentence is omitted', () => {
    for (const value of [undefined, null, '', 'abc', Number.NaN, Number.POSITIVE_INFINITY, {}, [], true]) {
      assert.equal(formatManagerMoneyIfKnown(value), null, String(value));
    }
  });
});

describe('accountFinanceOps refuses a JS number amount (spec)', () => {
  it('buildManagerTransactionRequest refuses a JS number on every route, and accepts the decimal string', () => {
    for (const amount of [100, 1.5, 0, 1e21]) {
      assert.throws(() => buildManagerTransactionRequest({ type: 'balance', direction: 'in', login: LOGIN, amount }), /never a JS number/);
      assert.throws(() => buildManagerTransactionRequest({ type: 'credit', direction: 'out', login: LOGIN, amount }), /never a JS number/);
      assert.throws(() => buildManagerTransactionRequest({
        type: 'transfer', direction: null, login: LOGIN, destination: DESTINATION, amount,
      }), /never a JS number/);
    }
    assert.equal(buildManagerTransactionRequest({ type: 'balance', direction: 'in', login: LOGIN, amount: '100' }).payload.amount, '100.00');
  });
});

describe('accountFinanceOps unknown status copy keeps the raw HTTP status (contract v5 section 3)', () => {
  it('shows an unknown status or code with its HTTP status and the raw code', () => {
    assert.deepEqual(describeManagerTransactionFailure({
      code: 'SOMETHING_NEW', message: 'raw text', unrecognized: true, httpStatus: 422,
    }, 'balance'), {
      text: 'Unrecognised status', detail: 'raw text HTTP 422', code: 'SOMETHING_NEW',
    });
    assert.deepEqual(describeManagerTransactionFailure({
      code: null, message: '', unrecognized: true, httpStatus: 400,
    }, 'balance'), {
      text: 'Unrecognised status', detail: 'HTTP 400', code: null,
    });
  });
});

describe('round 7 key-hold and key-rejection text', () => {
  it('the key-rejection, key-conflict and key-reuse codes get their own specific text', () => {
    assert.equal(describeManagerTransactionPending('balance', 'pending', 'KEY_REQUIRED').text, KEY_REJECTED_PENDING_TEXT);
    assert.equal(describeManagerTransactionPending('balance', 'pending', 'IDEMPOTENCY_CONFLICT').text, KEY_CONFLICT_PENDING_TEXT);
    assert.equal(describeManagerTransactionPending('balance', 'pending', 'KEY_CONFLICT').text, KEY_CONFLICT_PENDING_TEXT);
    assert.equal(describeManagerTransactionPending('balance', 'pending', 'KEY_REUSED').text, KEY_HOLD_PENDING_TEXT);
    assert.equal(describeManagerTransactionPending('balance', 'pending', 'MISMATCH').code, 'MISMATCH');
  });

  it('an expired key-hold record keeps its key-hold text and also says the status is unknown (L3)', () => {
    const expired = describeManagerTransactionPending('balance', 'expired', 'KEY_REUSED');
    assert.equal(expired.text, `${KEY_HOLD_PENDING_TEXT} ${EXPIRED_PENDING_TEXT}`);
    assert.equal(expired.code, 'KEY_REUSED');
    assert.equal(describeManagerTransactionPending('balance', 'expired', 'KEY_CONFLICT').text, `${KEY_CONFLICT_PENDING_TEXT} ${EXPIRED_PENDING_TEXT}`);
    assert.equal(describeManagerTransactionPending('balance', 'expired', null).text, EXPIRED_PENDING_TEXT);
  });

  it('every key-hold code is held (no same-key retry), and KEY_INVALID is not', () => {
    for (const code of ['KEY_REQUIRED', 'IDEMPOTENCY_KEY_REQUIRED', 'KEY_CONFLICT', 'IDEMPOTENCY_KEY_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'KEY_REUSED', 'MISMATCH']) {
      assert.equal(isKeyHoldCode(code), true, code);
    }
    assert.equal(isKeyHoldCode('KEY_INVALID'), false);
    assert.equal(isKeyHoldCode('IDEMPOTENCY_KEY_INVALID'), false);
  });
});

it('R8 (a): the expired text says a same-key retry is safe, and key-hold codes are unchanged', () => {
  assert.equal(EXPIRED_PENDING_TEXT, 'Status unknown: retry with the same key (recommended) or check history');
  assert.equal(describeManagerTransactionPending('balance', 'expired', null).text, EXPIRED_PENDING_TEXT);
  assert.equal(IDEMPOTENCY_CODE_CLASSES.keyHold.includes('IDEMPOTENCY_KEY_REUSED'), true);
});

describe('account popup live Equity and Free margin (owner bug 11-04)', () => {
  it('live row present -> equity and free margin come from liveMetrics', () => {
    const state = new LiveTradingState();
    state.ingest({
      type: 'metrics_update',
      publication_token: '18000000000000000010',
      data: {
        login: LOGIN,
        balance: 899900,
        credit: 50,
        equity: 950030.02,
        used_margin: 506631.72,
        free_margin: 443398.3,
      },
    });
    const liveMetrics = state.account(LOGIN);
    const staleRow = {
      Balance: 899900,
      Credit: 50,
      Equity: 899900,
      Margin: 506631.72,
      MarginFree: 393268.28,
    };

    const summary = deriveAccountFinanceSummary({
      liveMetrics,
      accountData: staleRow,
      rowData: staleRow,
    });
    assert.equal(summary.balanceText, '899,900.00');
    assert.equal(summary.creditText, '50.00');
    assert.equal(summary.equityText, '950,030.02');
    assert.equal(summary.freeMarginText, '443,398.30');
    assert.equal(summary.equitySpaceText, '950 030.02');
    assert.equal(summary.freeMarginSpaceText, '443 398.30');
    assert.equal(summary.rawEquity, 950030.02);
    assert.equal(summary.rawFreeMargin, 443398.3);
    assert.equal(
      resolveAccountPopupFieldValue({ field: 'Equity', fallback: null, liveMetrics, accountData: staleRow, fieldSources: [staleRow] }),
      950030.02,
    );
    assert.equal(
      resolveAccountPopupFieldValue({ field: 'MarginFree', fallback: null, liveMetrics, accountData: staleRow, fieldSources: [staleRow] }),
      443398.3,
    );
  });

  it('live row absent -> "—" for both even when the stored row or accountData has Equity and MarginFree', () => {
    const state = new LiveTradingState();
    const liveMetrics = state.account(LOGIN);
    assert.equal(liveMetrics, undefined);

    for (const stored of [
      {
        Balance: 899900,
        Credit: 50,
        Equity: 899900,
        equity: 899900,
        Margin: 506631.72,
        MarginFree: 393268.28,
        marginFree: 393268.28,
        FreeMargin: 393268.28,
        free_margin: 393268.28,
      },
      {
        Balance: 3160.49,
        Credit: 500,
        Equity: 3160.49,
        equity: 3160.49,
        Margin: 231.49,
        MarginFree: 2929,
        marginFree: 2929,
        FreeMargin: 2929,
      },
    ]) {
      const summary = deriveAccountFinanceSummary({
        liveMetrics,
        accountData: stored,
        rowData: stored,
        fieldSources: [stored],
      });
      assert.equal(summary.balanceText, formatManagerMoneyText(stored.Balance));
      assert.equal(summary.creditText, formatManagerMoneyText(stored.Credit));
      assert.equal(summary.equityText, MANAGER_UNKNOWN_MONEY_TEXT);
      assert.equal(summary.freeMarginText, MANAGER_UNKNOWN_MONEY_TEXT);
      assert.equal(summary.equitySpaceText, MANAGER_UNKNOWN_MONEY_TEXT);
      assert.equal(summary.freeMarginSpaceText, MANAGER_UNKNOWN_MONEY_TEXT);
      assert.equal(summary.rawEquity, null);
      assert.equal(summary.rawFreeMargin, null);
      for (const field of Object.keys(LIVE_ONLY_ACCOUNT_METRIC_FIELDS)) {
        assert.equal(
          resolveAccountPopupFieldValue({
            field,
            fallback: null,
            liveMetrics,
            accountData: stored,
            fieldSources: [stored],
            fieldKeys: { [field]: [field, field.toLowerCase(), 'free_margin', 'marginFree'] },
          }),
          null,
          `${field} must not fall back to stored accountData or rowData`,
        );
      }
    }
  });

  it('available: false -> "—" for both Equity and Free margin', () => {
    const state = new LiveTradingState();
    state.ingest({
      type: 'metrics_update',
      publication_token: '18000000000000000010',
      data: {
        login: LOGIN,
        balance: 3160.49,
        credit: 500,
        equity: 3661.15,
        used_margin: 7.73,
        free_margin: 3653.42,
      },
    });
    state.invalidateMetrics([LOGIN]);
    const invalidatedEntry = state.metrics.get(String(LOGIN));
    assert.equal(invalidatedEntry.available, false);
    assert.equal(state.account(LOGIN), undefined);

    const storedRow = {
      Balance: 3160.49,
      Credit: 500,
      Equity: 3160.49,
      Margin: 231.49,
      MarginFree: 2929,
    };

    for (const unavailableCandidate of [
      state.account(LOGIN),
      invalidatedEntry,
      { available: false, equity: 3661.15, free_margin: 3653.42 },
      { available: true, row: { available: false, equity: 3661.15, free_margin: 3653.42 } },
    ]) {
      assert.equal(getLiveAccountMetricValue(unavailableCandidate, 'equity'), null);
      assert.equal(getLiveAccountMetricValue(unavailableCandidate, 'free_margin'), null);
      const summary = deriveAccountFinanceSummary({
        liveMetrics: unavailableCandidate,
        accountData: storedRow,
        rowData: storedRow,
      });
      assert.equal(summary.equityText, '—');
      assert.equal(summary.freeMarginText, '—');
      assert.equal(summary.equitySpaceText, '—');
      assert.equal(summary.freeMarginSpaceText, '—');
    }
  });

  it('no Balance - Margin fallback anywhere when live keys are missing or in AccountDetailsModal source', () => {
    const partialLive = {
      login: LOGIN,
      balance: 899900,
      credit: 50,
      used_margin: 506631.72,
    };
    const storedRow = {
      Balance: 899900,
      Credit: 50,
      Equity: 899900,
      Margin: 506631.72,
      MarginFree: 393268.28,
    };
    const summary = deriveAccountFinanceSummary({
      liveMetrics: partialLive,
      accountData: storedRow,
      rowData: storedRow,
    });
    assert.equal(summary.equityText, '—');
    assert.equal(summary.freeMarginText, '—');
    assert.notEqual(summary.freeMarginText, '393,268.28');
    assert.notEqual(summary.equityText, '899,900.00');

    const modalSource = readFileSync(new URL('./AccountDetailsModal.jsx', import.meta.url), 'utf8');
    assert.doesNotMatch(modalSource, /getFieldValue\(['"]Equity['"],\s*rawBalanceVal\)/);
    assert.doesNotMatch(modalSource, /Number\(rawEquityVal\s*\|\|\s*0\)\s*-\s*Number\(rawMarginVal\s*\|\|\s*0\)/);
    assert.doesNotMatch(modalSource, /rawBalanceVal\s*-\s*rawMarginVal/);
    assert.match(modalSource, /const summaryEquityText = financeSummary\.equityText;/);
    assert.match(modalSource, /const summaryFreeMarginText = financeSummary\.freeMarginText;/);
    assert.match(modalSource, /const equityVal = financeSummary\.equityText;/);
    assert.match(modalSource, /const freeMarginVal = financeSummary\.freeMarginText;/);
    assert.match(modalSource, /const equitySpaceVal = financeSummary\.equitySpaceText;/);
    assert.match(modalSource, /const freeMarginSpaceVal = financeSummary\.freeMarginSpaceText;/);
    assert.match(modalSource, /const marginVal = financeSummary\.marginText;/);
    assert.match(modalSource, /const marginSpaceVal = financeSummary\.marginSpaceText;/);
    assert.match(modalSource, /const marginLevelVal = financeSummary\.marginLevelText;/);
    assert.match(modalSource, /const marginLevelSpaceVal = financeSummary\.marginLevelSpaceText;/);
    assert.doesNotMatch(modalSource, /computedMarginLevel/);
    assert.doesNotMatch(modalSource, /rawEquityVal\)\s*\/\s*Number\(rawMarginVal/);
  });

  it('r2 (c): stored Margin and MarginLevel present + no live (or available: false) -> "—" (never stored values, never "0.00")', () => {
    const storedRow = {
      Balance: 899900,
      Credit: 50,
      Equity: 899900,
      Margin: 506631.72,
      margin: 506631.72,
      used_margin: 506631.72,
      MarginFree: 393268.28,
      MarginLevel: 177.62,
      marginLevel: 177.62,
      margin_level: 177.62,
    };

    for (const candidate of [
      undefined,
      null,
      { available: false, used_margin: 506631.72, margin_level: 187.52 },
      { available: true, row: { available: false, used_margin: 506631.72, margin_level: 187.52 } },
    ]) {
      const summary = deriveAccountFinanceSummary({
        liveMetrics: candidate,
        accountData: storedRow,
        rowData: storedRow,
        fieldSources: [storedRow],
      });
      assert.equal(summary.rawMargin, null);
      assert.equal(summary.rawMarginLevel, null);
      assert.equal(summary.marginText, '—');
      assert.equal(summary.marginSpaceText, '—');
      assert.equal(summary.marginLevelText, '—');
      assert.equal(summary.marginLevelSpaceText, '—');
      assert.notEqual(summary.marginLevelSpaceText, '0.00');
      assert.equal(
        resolveAccountPopupFieldValue({
          field: 'Margin',
          fallback: null,
          liveMetrics: candidate,
          accountData: storedRow,
          fieldSources: [storedRow],
          fieldKeys: { Margin: ['Margin', 'margin', 'used_margin'] },
        }),
        null,
      );
      assert.equal(
        resolveAccountPopupFieldValue({
          field: 'MarginLevel',
          fallback: null,
          liveMetrics: candidate,
          accountData: storedRow,
          fieldSources: [storedRow],
          fieldKeys: { MarginLevel: ['MarginLevel', 'marginLevel', 'margin_level'] },
        }),
        null,
      );
    }
  });

  it('r2 (a) & (b): live equity + no live margin_level -> "—" (never computed from live or stored Margin, never "0.00")', () => {
    const storedRow = {
      Balance: 899900,
      Credit: 50,
      Margin: 506631.72,
      MarginLevel: null,
    };

    // Subcase 1a: live equity + live used_margin, but no live margin_level
    const liveWithMarginOnly = {
      login: LOGIN,
      balance: 899900,
      credit: 50,
      equity: 950030.02,
      used_margin: 506631.72,
      free_margin: 443398.3,
    };
    const summary1a = deriveAccountFinanceSummary({
      liveMetrics: liveWithMarginOnly,
      accountData: storedRow,
      rowData: storedRow,
    });
    assert.equal(summary1a.equityText, '950,030.02');
    assert.equal(summary1a.marginText, '506,631.72');
    assert.equal(summary1a.marginSpaceText, '506 631.72');
    assert.equal(summary1a.rawMarginLevel, null);
    assert.equal(summary1a.marginLevelText, '—');
    assert.equal(summary1a.marginLevelSpaceText, '—');
    assert.notEqual(summary1a.marginLevelSpaceText, '187.52');
    assert.notEqual(summary1a.marginLevelSpaceText, '0.00');

    // Subcase 1b: live equity only + stored Margin > 0 (hybrid live equity / stored Margin must never happen)
    const liveEquityOnly = {
      login: LOGIN,
      balance: 899900,
      credit: 50,
      equity: 950030.02,
      free_margin: 443398.3,
    };
    const summary1b = deriveAccountFinanceSummary({
      liveMetrics: liveEquityOnly,
      accountData: storedRow,
      rowData: storedRow,
    });
    assert.equal(summary1b.rawMargin, null);
    assert.equal(summary1b.marginText, '—');
    assert.equal(summary1b.marginSpaceText, '—');
    assert.equal(summary1b.rawMarginLevel, null);
    assert.equal(summary1b.marginLevelText, '—');
    assert.equal(summary1b.marginLevelSpaceText, '—');
  });

  it('r2: live used_margin and live margin_level present -> shown in both comma and space formats', () => {
    const state = new LiveTradingState();
    state.ingest({
      type: 'metrics_update',
      publication_token: '18000000000000000020',
      data: {
        login: LOGIN,
        balance: 899900,
        credit: 50,
        equity: 950030.02,
        used_margin: 506631.72,
        free_margin: 443398.3,
        margin_level: 1875.19,
      },
    });
    const liveMetrics = state.account(LOGIN);
    const staleRow = {
      Balance: 899900,
      Credit: 50,
      Margin: 231.49,
      MarginLevel: 120.0,
    };
    const summary = deriveAccountFinanceSummary({
      liveMetrics,
      accountData: staleRow,
      rowData: staleRow,
    });
    assert.equal(summary.rawMargin, 506631.72);
    assert.equal(summary.marginText, '506,631.72');
    assert.equal(summary.marginSpaceText, '506 631.72');
    assert.equal(summary.rawMarginLevel, 1875.19);
    assert.equal(summary.marginLevelText, '1,875.19');
    assert.equal(summary.marginLevelSpaceText, '1 875.19');
    assert.equal(
      resolveAccountPopupFieldValue({ field: 'Margin', fallback: null, liveMetrics, accountData: staleRow, fieldSources: [staleRow] }),
      506631.72,
    );
    assert.equal(
      resolveAccountPopupFieldValue({ field: 'MarginLevel', fallback: null, liveMetrics, accountData: staleRow, fieldSources: [staleRow] }),
      1875.19,
    );
  });

  it('r3 (F3): resolveAccountPopupFieldValue and deriveAccountFinanceSummary reject non-decimal live/accountData Balance and Credit ("", "   ", true, false, []) and fall back to accountData/rowData', () => {
    const validStored = {
      Balance: 899900,
      Credit: 50,
    };
    for (const bogus of ['', '   ', true, false, [], {}]) {
      const liveWithBogusBalanceCredit = {
        login: LOGIN,
        balance: bogus,
        credit: bogus,
        equity: 950030.02,
        used_margin: 506631.72,
        free_margin: 443398.3,
        margin_level: 187.52,
      };
      assert.equal(
        resolveAccountPopupFieldValue({
          field: 'Balance',
          fallback: null,
          liveMetrics: liveWithBogusBalanceCredit,
          accountData: validStored,
          fieldSources: [validStored],
        }),
        899900,
      );
      assert.equal(
        resolveAccountPopupFieldValue({
          field: 'Credit',
          fallback: null,
          liveMetrics: liveWithBogusBalanceCredit,
          accountData: validStored,
          fieldSources: [validStored],
        }),
        50,
      );
      const summary = deriveAccountFinanceSummary({
        liveMetrics: liveWithBogusBalanceCredit,
        accountData: validStored,
        rowData: validStored,
      });
      assert.equal(summary.balanceText, '899,900.00');
      assert.equal(summary.creditText, '50.00');
      assert.equal(summary.equityText, '950,030.02');
    }
  });
});
