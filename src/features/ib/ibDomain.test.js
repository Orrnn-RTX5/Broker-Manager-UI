import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCommissionPlanPayload,
  buildIBCreatePayload,
  canRemoveIB,
  canSetCommissionStatus,
  getIBStatusActions,
  isEligibleIBParent,
  normalizeIbBoolean,
  normalizeIBAccount,
  normalizeIBCommission,
  normalizeIBPlan,
  normalizeRecords,
  validateClientLinkInput,
  validateCommissionPlanInput,
  validateIBCreateInput,
  validatePayoutDecisionInput,
  validatePayoutRequestInput,
} from './ibDomain.js';

test('normalizeRecords accepts backend list wrappers', () => {
  assert.deepEqual(normalizeRecords([{ login: 1 }]), [{ login: 1 }]);
  assert.deepEqual(normalizeRecords({ answer: [{ login: 2 }] }), [{ login: 2 }]);
  assert.deepEqual(normalizeRecords({ data: [{ login: 3 }] }), [{ login: 3 }]);
  assert.deepEqual(normalizeRecords({ records: [{ login: 4 }] }), [{ login: 4 }]);
});

test('normalizeIBAccount uses safe defaults for missing fields', () => {
  assert.deepEqual(
    normalizeIBAccount({ login: '2001', status: 'unknown' }),
    {
      login: 2001,
      parent_ib_login: null,
      level: 0,
      company_name: '',
      website: '',
      referral_code: '',
      status: 'pending',
      approved_at: null,
      notes: '',
      created_at: null,
      client_count: 0,
      unpaid_total: 0,
    }
  );
});

test('normalizeIbBoolean accepts common backend boolean encodings', () => {
  for (const value of [true, 1, '1', 'true', 'yes', 'enabled']) {
    assert.equal(normalizeIbBoolean(value, false), true, `expected ${String(value)} to normalize true`);
  }

  for (const value of [false, 0, '0', 'false', 'no', 'disabled']) {
    assert.equal(normalizeIbBoolean(value, true), false, `expected ${String(value)} to normalize false`);
  }

  assert.equal(normalizeIbBoolean(undefined, true), true);
  assert.equal(normalizeIbBoolean('unexpected', false), false);
});

test('normalizeIBPlan preserves DB-style enabled flags', () => {
  for (const enabled of [0, '0', false, 'false', 'no', 'disabled']) {
    assert.equal(normalizeIBPlan({ id: 1, ib_login: 2001, enabled }).enabled, false);
  }

  for (const enabled of [1, '1', true, 'true', 'yes', 'enabled']) {
    assert.equal(normalizeIBPlan({ id: 1, ib_login: 2001, enabled }).enabled, true);
  }

  assert.equal(normalizeIBPlan({ id: 1, ib_login: 2001 }).enabled, true);
  assert.equal(normalizeIBPlan({ id: 1, ib_login: 2001, Enabled: 0 }).enabled, false);
});

test('normalizeIBCommission preserves DB-style paid flags', () => {
  for (const paid of [1, '1', true, 'true', 'yes']) {
    assert.equal(normalizeIBCommission({ id: 1, ib_login: 2001, status: 'approved', paid }).paid, true);
  }

  for (const paid of [0, '0', false, 'false', 'no']) {
    assert.equal(normalizeIBCommission({ id: 1, ib_login: 2001, status: 'approved', paid }).paid, false);
  }

  assert.equal(normalizeIBCommission({ id: 1, ib_login: 2001, status: 'paid', paid: 0 }).paid, true);
  assert.equal(normalizeIBCommission({ id: 1, ib_login: 2001, status: 'approved', Paid: 1 }).paid, true);
});

test('IB status actions follow backend lifecycle rules', () => {
  assert.deepEqual(getIBStatusActions('pending'), ['approve', 'reject']);
  assert.deepEqual(getIBStatusActions('approved'), ['suspend']);
  assert.deepEqual(getIBStatusActions('active'), ['suspend']);
  assert.deepEqual(getIBStatusActions('suspended'), ['activate']);
  assert.deepEqual(getIBStatusActions('rejected'), []);
  assert.deepEqual(getIBStatusActions('removed'), []);
});

test('parent IB eligibility accepts only approved or active accounts', () => {
  assert.equal(isEligibleIBParent('approved'), true);
  assert.equal(isEligibleIBParent('active'), true);
  assert.equal(isEligibleIBParent({ status: 'approved' }), true);
  assert.equal(isEligibleIBParent({ status: 'active' }), true);
  assert.equal(isEligibleIBParent('pending'), false);
  assert.equal(isEligibleIBParent('suspended'), false);
  assert.equal(isEligibleIBParent('rejected'), false);
  assert.equal(isEligibleIBParent('removed'), false);
  assert.equal(isEligibleIBParent({}), false);
  assert.equal(isEligibleIBParent(null), false);
});

test('commission status changes never allow paid or already-paid rows', () => {
  assert.equal(canSetCommissionStatus({ paid: false, status: 'accrued' }, 'approved'), true);
  assert.equal(canSetCommissionStatus({ paid: false, status: 'approved' }, 'paid'), false);
  assert.equal(canSetCommissionStatus({ paid: true, status: 'approved' }, 'rejected'), false);
  assert.equal(canSetCommissionStatus({ paid: false, status: 'approved' }, 'approved'), false);
  assert.equal(canSetCommissionStatus(normalizeIBCommission({ paid: 1, status: 'approved' }), 'rejected'), false);
});

test('IB soft remove eligibility excludes invalid and already-removed rows', () => {
  assert.equal(canRemoveIB({ login: 2001, status: 'active' }), true);
  assert.equal(canRemoveIB({ login: 2001, status: 'removed' }), false);
  assert.equal(canRemoveIB({ Login: '2002', status: 'approved' }), true);
  assert.equal(canRemoveIB({ login: '', status: 'active' }), false);
  assert.equal(canRemoveIB(null), false);
});

test('IB create validation and payload exclude empty optional fields', () => {
  assert.deepEqual(validateIBCreateInput({ login: '' }), ['Account login must be a positive integer.']);
  assert.deepEqual(validateIBCreateInput({ login: '2001', parent_ib_login: '1001' }), []);
  assert.deepEqual(
    buildIBCreatePayload({
      login: '2001',
      parent_ib_login: '',
      company_name: 'Alpha',
      referral_code: '',
      notes: 'Manual',
    }),
    { login: 2001, company_name: 'Alpha', notes: 'Manual' }
  );
});

test('client link validation rejects same login', () => {
  assert.deepEqual(
    validateClientLinkInput({ ib_login: 2001, client_login: 2001 }),
    ['Client login cannot be the same as the IB login.']
  );
});

test('commission plan validation enforces supported types and numeric bounds', () => {
  assert.deepEqual(validateCommissionPlanInput({
    plan_name: '',
    commission_type: 'percentage',
    rate: 0,
    override_rate: -1,
    min_lots: 2,
    max_lots: 1,
  }), [
    'Plan name is required.',
    'Commission type is invalid.',
    'Rate must be greater than zero.',
    'Override rate cannot be negative.',
    'Max lots must be greater than or equal to min lots.',
  ]);

  assert.deepEqual(validateCommissionPlanInput({
    plan_name: 'Forex',
    commission_type: 'per_lot',
    rate: 5,
    override_rate: 0,
    min_lots: 0,
    max_lots: 0,
  }), []);

  assert.deepEqual(
    buildCommissionPlanPayload({ plan_name: 'Forex', commission_type: 'flat', rate: '10' }, 2001),
    {
      ib_login: 2001,
      plan_name: 'Forex',
      commission_type: 'flat',
      rate: 10,
      override_rate: 0,
      min_lots: 0,
      max_lots: 0,
      enabled: true,
    }
  );
});

test('payout validation requires ids and rejection reason', () => {
  assert.deepEqual(validatePayoutRequestInput({ login: 2001, amount: '10' }), []);
  assert.deepEqual(validatePayoutRequestInput({ login: 2001, amount: '-1' }), ['Amount must be greater than zero when provided.']);
  assert.deepEqual(validatePayoutDecisionInput({ payout_id: '', action: 'approve' }), ['Payout ID must be a positive integer.']);
  assert.deepEqual(validatePayoutDecisionInput({ payout_id: 9, action: 'reject', reason: '' }), ['Rejection reason is required.']);
});
