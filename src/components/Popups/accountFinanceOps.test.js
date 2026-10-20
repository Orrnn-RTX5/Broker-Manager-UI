import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MANAGER_TRANSACTION_TYPE,
  MANAGER_TRANSACTION_TYPES,
  buildManagerTransactionConfirmation,
  buildManagerTransactionFailurePrefix,
  buildManagerTransactionSuccessMessage,
  getManagerTransactionActionLabel,
  getManagerTransactionOptions,
  getManagerTransactionPendingLabel,
  getManagerTransactionPendingNoun,
  isSupportedManagerTransactionType,
  resolveManagerTransactionType,
} from './accountFinanceOps.js';

describe('accountFinanceOps transaction type mapping', () => {
  it('defaults to deposit', () => {
    assert.equal(DEFAULT_MANAGER_TRANSACTION_TYPE, 'deposit');
    assert.equal(resolveManagerTransactionType(DEFAULT_MANAGER_TRANSACTION_TYPE), 'deposit');
  });

  it('exposes exactly the four mapped types in selector order', () => {
    assert.deepEqual([...MANAGER_TRANSACTION_TYPES], ['deposit', 'withdraw', 'credit', 'transfer']);
  });

  it('routes each supported type to its own endpoint key', () => {
    assert.equal(resolveManagerTransactionType('deposit'), 'deposit');
    assert.equal(resolveManagerTransactionType('withdraw'), 'withdraw');
    assert.equal(resolveManagerTransactionType('credit'), 'credit');
    assert.equal(resolveManagerTransactionType('transfer'), 'transfer');
  });

  it('accepts surrounding whitespace and casing on supported types', () => {
    assert.equal(resolveManagerTransactionType('  Deposit  '), 'deposit');
    assert.equal(resolveManagerTransactionType('WITHDRAW'), 'withdraw');
  });

  it('offers one generic selector option per supported type', () => {
    assert.deepEqual(getManagerTransactionOptions(), [
      { value: 'deposit', label: 'Deposit' },
      { value: 'withdraw', label: 'Withdraw' },
      { value: 'credit', label: 'Credit' },
      { value: 'transfer', label: 'Transfer' },
    ]);
  });

  it('labels every supported type generically', () => {
    assert.equal(getManagerTransactionActionLabel('deposit'), 'Deposit');
    assert.equal(getManagerTransactionActionLabel('withdraw'), 'Withdraw');
    assert.equal(getManagerTransactionActionLabel('credit'), 'Credit');
    assert.equal(getManagerTransactionActionLabel('transfer'), 'Transfer');
    assert.equal(getManagerTransactionPendingLabel('deposit'), 'Depositing...');
    assert.equal(getManagerTransactionPendingLabel('withdraw'), 'Withdrawing...');
    assert.equal(getManagerTransactionPendingLabel('credit'), 'Applying...');
    assert.equal(getManagerTransactionPendingLabel('transfer'), 'Transferring...');
    assert.equal(getManagerTransactionPendingNoun('deposit'), 'deposit');
    assert.equal(getManagerTransactionPendingNoun('withdraw'), 'withdrawal');
    assert.equal(getManagerTransactionPendingNoun('credit'), 'credit');
    assert.equal(getManagerTransactionPendingNoun('transfer'), 'transfer');
  });

  it('builds per-type confirmation and result copy naming the amount and account', () => {
    assert.equal(
      buildManagerTransactionConfirmation('deposit', '100.00 USD', 200001),
      'Deposit 100.00 USD into account #200001?',
    );
    assert.equal(
      buildManagerTransactionConfirmation('withdraw', '100.00 USD', 200001),
      'Withdraw 100.00 USD from account #200001?',
    );
    assert.equal(
      buildManagerTransactionSuccessMessage('deposit', '100.00 USD', 200001),
      'Deposited 100.00 USD into account #200001 successfully.',
    );
    assert.equal(
      buildManagerTransactionSuccessMessage('withdraw', '100.00 USD', 200001),
      'Withdrew 100.00 USD from account #200001 successfully.',
    );
    assert.equal(
      buildManagerTransactionSuccessMessage('credit', '100.00 USD', 200001),
      'Credited 100.00 USD to account #200001 successfully.',
    );
    assert.equal(
      buildManagerTransactionSuccessMessage('transfer', '100.00 USD', 200001),
      'Transferred 100.00 USD from account #200001 successfully.',
    );
    assert.equal(buildManagerTransactionFailurePrefix('credit', 200001), 'Credit for account #200001');
    assert.equal(buildManagerTransactionFailurePrefix('transfer', 200001), 'Transfer for account #200001');
  });

  it('fails closed on unknown, empty, and nullish types', () => {
    for (const bad of ['rebate', 'bonus', '', '   ', null, undefined, 0, 123, {}, []]) {
      assert.throws(() => resolveManagerTransactionType(bad), TypeError);
      assert.equal(isSupportedManagerTransactionType(bad), false);
      assert.throws(() => getManagerTransactionActionLabel(bad), TypeError);
      assert.throws(() => buildManagerTransactionConfirmation(bad, '10.00', 1), TypeError);
      assert.throws(() => buildManagerTransactionSuccessMessage(bad, '10.00', 1), TypeError);
      assert.throws(() => buildManagerTransactionFailurePrefix(bad, 1), TypeError);
    }
  });

  it('reports support for exactly the four mapped types', () => {
    for (const good of ['deposit', 'withdraw', 'credit', 'transfer']) {
      assert.equal(isSupportedManagerTransactionType(good), true);
    }
  });

  it('normalizes case and surrounding whitespace for every type key', () => {
    const variants = {
      deposit: ['deposit', ' Deposit', 'DEPOSIT', '  Deposit  ', '\tdeposit\n', 'dEpOsIt'],
      withdraw: ['withdraw', ' WITHDRAW ', 'Withdraw', '\nwithdraw\t', 'wItHdRaW'],
      credit: ['credit', ' CREDIT ', 'Credit', '\tCREDIT\n', 'cReDiT'],
      transfer: ['transfer', ' TRANSFER ', 'Transfer', '\nTransfer\t', 'tRaNsFeR'],
    };
    for (const [expected, forms] of Object.entries(variants)) {
      for (const form of forms) {
        assert.equal(resolveManagerTransactionType(form), expected);
        assert.equal(isSupportedManagerTransactionType(form), true);
      }
    }
    assert.equal(getManagerTransactionActionLabel(' deposit '), 'Deposit');
    assert.equal(getManagerTransactionActionLabel('CREDIT'), 'Credit');
    assert.equal(getManagerTransactionPendingLabel(' WITHDRAW '), 'Withdrawing...');
    assert.equal(getManagerTransactionPendingLabel('credit'), 'Applying...');
    assert.equal(getManagerTransactionPendingNoun(' TRANSFER '), 'transfer');
    assert.equal(getManagerTransactionPendingNoun('Withdraw'), 'withdrawal');
  });

  it('maps every selector option value straight onto its endpoint key', () => {
    const options = getManagerTransactionOptions();
    assert.equal(options.length, 4);
    assert.deepEqual(
      options.map((option) => option.value),
      ['deposit', 'withdraw', 'credit', 'transfer'],
    );
    for (const option of options) {
      assert.equal(resolveManagerTransactionType(option.value), option.value);
      assert.equal(isSupportedManagerTransactionType(option.value), true);
    }
    assert.equal(new Set(options.map((option) => option.value)).size, 4);
  });

  it('builds confirmation copy for credit and transfer without mirroring logic', () => {
    assert.equal(
      buildManagerTransactionConfirmation('credit', '100.00 USD', 200001),
      'Credit 100.00 USD to account #200001?',
    );
    assert.equal(
      buildManagerTransactionConfirmation('transfer', '100.00 USD', 200001),
      'Transfer 100.00 USD from account #200001?',
    );
    assert.equal(
      buildManagerTransactionConfirmation(' CREDIT ', '100.00 USD', 200001),
      'Credit 100.00 USD to account #200001?',
    );
    assert.equal(
      buildManagerTransactionConfirmation('Transfer', '100.00 USD', 200001),
      'Transfer 100.00 USD from account #200001?',
    );
  });

  it('builds failure prefixes for deposit and withdraw without mirroring logic', () => {
    assert.equal(buildManagerTransactionFailurePrefix('deposit', 200001), 'Deposit for account #200001');
    assert.equal(buildManagerTransactionFailurePrefix('withdraw', 200001), 'Withdraw for account #200001');
    assert.equal(buildManagerTransactionFailurePrefix(' DEPOSIT ', 200001), 'Deposit for account #200001');
    assert.equal(buildManagerTransactionFailurePrefix('Withdraw', 200001), 'Withdraw for account #200001');
  });

  it('accepts normalized variants in every copy builder', () => {
    assert.equal(
      buildManagerTransactionSuccessMessage(' DEPOSIT ', '100.00 USD', 200001),
      'Deposited 100.00 USD into account #200001 successfully.',
    );
    assert.equal(
      buildManagerTransactionSuccessMessage('withdraw', '100.00 USD', 200001),
      'Withdrew 100.00 USD from account #200001 successfully.',
    );
    assert.equal(
      buildManagerTransactionSuccessMessage('  CREDIT  ', '100.00 USD', 200001),
      'Credited 100.00 USD to account #200001 successfully.',
    );
    assert.equal(
      buildManagerTransactionSuccessMessage('TRANSFER', '100.00 USD', 200001),
      'Transferred 100.00 USD from account #200001 successfully.',
    );
    assert.equal(
      buildManagerTransactionConfirmation('  Deposit  ', '100.00 USD', 200001),
      'Deposit 100.00 USD into account #200001?',
    );
    assert.equal(
      buildManagerTransactionConfirmation('WITHDRAW', '100.00 USD', 200001),
      'Withdraw 100.00 USD from account #200001?',
    );
  });

  it('fails closed on pending labels, nouns, and lookalike keys', () => {
    const lookalikes = [
      'deposits',
      'withdraws',
      'credits',
      'transfers',
      'de posit',
      'with-draw',
      'deposit_withdraw',
      'CREDITS',
      '\n\t ',
      true,
      false,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -1,
      Symbol('deposit'),
    ];
    for (const bad of lookalikes) {
      assert.equal(isSupportedManagerTransactionType(bad), false);
      assert.throws(() => resolveManagerTransactionType(bad), TypeError);
      assert.throws(() => getManagerTransactionActionLabel(bad), TypeError);
      assert.throws(() => getManagerTransactionPendingLabel(bad), TypeError);
      assert.throws(() => getManagerTransactionPendingNoun(bad), TypeError);
      assert.throws(() => buildManagerTransactionConfirmation(bad, '10.00', 1), TypeError);
      assert.throws(() => buildManagerTransactionSuccessMessage(bad, '10.00', 1), TypeError);
      assert.throws(() => buildManagerTransactionFailurePrefix(bad, 1), TypeError);
    }
  });

  it('throws a descriptive TypeError instead of defaulting', () => {
    assert.throws(() => resolveManagerTransactionType('rebate'), /Unsupported manager transaction type/);
    try {
      resolveManagerTransactionType('');
      assert.fail('expected resolveManagerTransactionType to throw');
    } catch (error) {
      assert.equal(error instanceof TypeError, true);
      assert.match(error.message, /Unsupported manager transaction type/);
    }
  });

  it('keeps the selector contract stable: frozen types, default membership, fresh options', () => {
    assert.equal(Object.isFrozen(MANAGER_TRANSACTION_TYPES), true);
    assert.equal(MANAGER_TRANSACTION_TYPES.includes(DEFAULT_MANAGER_TRANSACTION_TYPE), true);
    assert.equal(resolveManagerTransactionType(DEFAULT_MANAGER_TRANSACTION_TYPE), 'deposit');
    assert.equal(isSupportedManagerTransactionType(DEFAULT_MANAGER_TRANSACTION_TYPE), true);
    const first = getManagerTransactionOptions();
    const second = getManagerTransactionOptions();
    assert.notEqual(first, second);
    assert.notEqual(first[0], second[0]);
    first[0].value = 'rebate';
    assert.equal(getManagerTransactionOptions()[0].value, 'deposit');
  });
});
