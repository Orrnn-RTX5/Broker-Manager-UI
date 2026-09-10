import test from 'node:test';
import assert from 'node:assert/strict';
import { requestReportsSummary } from './reportsSummary.js';

test('unsupported report deployment makes no request, including repeated loads', async () => {
  const previous = globalThis.__RTX_RUNTIME_CONFIG__;
  globalThis.__RTX_RUNTIME_CONFIG__ = { REPORTS_SUMMARY_ENABLED: 'false' };
  try {
    let calls = 0;
    for (let i = 0; i < 3; i++) {
      await assert.rejects(requestReportsSummary(() => { calls++; }), { code: 'REPORTS_SUMMARY_UNAVAILABLE' });
    }
    assert.equal(calls, 0);
  } finally { globalThis.__RTX_RUNTIME_CONFIG__ = previous; }
});

test('enabled report deployments keep date and request options', async () => {
  const previous = globalThis.__RTX_RUNTIME_CONFIG__;
  globalThis.__RTX_RUNTIME_CONFIG__ = { REPORTS_SUMMARY_ENABLED: 'true' };
  try {
    const signal = new AbortController().signal;
    const result = await requestReportsSummary((endpoint, options) => {
      assert.equal(endpoint, '/reports/v1/summary?date=2026-09-09');
      assert.equal(options.signal, signal);
      return { deposits: 10 };
    }, { date: '2026-09-09', signal });
    assert.deepEqual(result, { deposits: 10 });
  } finally { globalThis.__RTX_RUNTIME_CONFIG__ = previous; }
});
