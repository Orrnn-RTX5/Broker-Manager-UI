import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIbEndpoint, sanitizeIbPayload } from './ibApiPaths.js';

test('buildIbEndpoint uses query params for IB action endpoints and strips broker scope', () => {
  assert.equal(
    buildIbEndpoint('/IBApprove', { login: 2001, notes: 'ok', broker_id: 'broker-a' }),
    '/IBApprove?login=2001&notes=ok'
  );
  assert.equal(
    buildIbEndpoint('/IBPayoutApprove', { payout_id: 9, external_ref: 'WIRE-1', brokerId: 'broker-a' }),
    '/IBPayoutApprove?payout_id=9&external_ref=WIRE-1'
  );
});

test('buildIbEndpoint keeps false query values for explicit force/delete flows', () => {
  assert.equal(
    buildIbEndpoint('/IBDelete', { login: 2001, force: false }),
    '/IBDelete?login=2001&force=false'
  );
});

test('sanitizeIbPayload removes forbidden broker fields from JSON bodies', () => {
  assert.deepEqual(
    sanitizeIbPayload({
      login: 2001,
      broker_id: 'broker-a',
      brokerId: 'broker-b',
      referral_code: '',
      company_name: 'Alpha Partners',
    }),
    {
      login: 2001,
      company_name: 'Alpha Partners',
    }
  );
});
