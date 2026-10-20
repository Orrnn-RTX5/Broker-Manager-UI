import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { joinMoneyAmount } from './accountTransactionCopy.js';

describe('joinMoneyAmount', () => {
  it('joins a formatted amount and currency with a single space', () => {
    assert.equal(joinMoneyAmount('1,000.00', 'USD'), '1,000.00 USD');
  });

  it('omits the separating space when currency is an empty string', () => {
    assert.equal(joinMoneyAmount('1,000.00', ''), '1,000.00');
  });

  it('omits the separating space when currency is nullish', () => {
    assert.equal(joinMoneyAmount('1,000.00', null), '1,000.00');
    assert.equal(joinMoneyAmount('1,000.00', undefined), '1,000.00');
  });

  it('treats whitespace-only currency as blank', () => {
    assert.equal(joinMoneyAmount('1,000.00', '   '), '1,000.00');
    assert.equal(joinMoneyAmount('1,000.00', '\t\n '), '1,000.00');
  });

  it('trims surrounding whitespace around the currency code', () => {
    assert.equal(joinMoneyAmount('1,000.00', '  USD  '), '1,000.00 USD');
  });

  it('never leaves a double space before surrounding copy', () => {
    const confirmation = `Deposit ${joinMoneyAmount('1,000.00', '')} into account #123?`;
    assert.equal(confirmation, 'Deposit 1,000.00 into account #123?');
    assert.ok(!confirmation.includes('  '));
  });
});
