import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIbEndpoint, sanitizeIbPayload } from './ibApiPaths.js';

test('buildIbEndpoint uses query params for documented IB read endpoints and strips broker scope', () => {
  assert.equal(
    buildIbEndpoint('/IBGet', { login: 2001, broker_id: 'broker-a' }),
    '/IBGet?login=2001'
  );
  assert.equal(
    buildIbEndpoint('/IBCommissions', { ib_login: 2001, brokerId: 'broker-a' }),
    '/IBCommissions?ib_login=2001'
  );
});

test('buildIbEndpoint keeps false query values for documented filters', () => {
  assert.equal(
    buildIbEndpoint('/IBCommissions', { ib_login: 2001, paid: false }),
    '/IBCommissions?ib_login=2001&paid=false'
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
