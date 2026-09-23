import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendDailyObservation,
  buildAccountSources,
  loadCompleteReportAccounts,
  normalizeDailyCashSummary,
  utcReportDate,
} from './dailyReportData.js';

const date = '2026-09-15';
const cashRow = (values = {}) => ({ date, currency: 'USD', total_deposits: '120.5', total_withdrawals: '-20', ...values });

test('report date follows UTC boundaries and rejects invalid time', () => {
  assert.equal(utcReportDate('2026-09-15T00:10:00+05:30'), '2026-09-14');
  assert.throws(() => utcReportDate('invalid'), /valid date/);
});

test('cash summary keeps currencies separate and normalizes signed withdrawals', () => {
  const result = normalizeDailyCashSummary({ data: [cashRow(), cashRow({ currency: 'EUR', total_deposits: 70, total_withdrawals: 12 })] }, date);
  assert.deepEqual(result, [
    { currency: 'EUR', deposits: 70, withdrawals: 12, netFlow: 58 },
    { currency: 'USD', deposits: 120.5, withdrawals: 20, netFlow: 100.5 },
  ]);
});

test('cash summary excludes missing dates, other dates, absent currency, and ambiguous duplicates', () => {
  assert.deepEqual(normalizeDailyCashSummary({ data: [
    cashRow({ date: undefined }), cashRow({ date: '2026-09-14' }), cashRow({ currency: '' }),
  ] }, date), []);
  assert.deepEqual(normalizeDailyCashSummary({ data: [cashRow(), cashRow()] }, date), []);
  assert.deepEqual(normalizeDailyCashSummary({ success: false, data: [cashRow()] }, date), []);
  assert.throws(() => normalizeDailyCashSummary({}, '2026-02-30'), /valid YYYY-MM-DD/);
});

test('missing, invalid, and negative deposit amounts never become zero', () => {
  for (const value of [undefined, null, '', ' ', 'broken', false, Infinity, -5]) {
    assert.deepEqual(normalizeDailyCashSummary({ data: [cashRow({ total_deposits: value })] }, date), [
      { currency: 'USD', deposits: null, withdrawals: 20, netFlow: null },
    ]);
  }
  assert.deepEqual(normalizeDailyCashSummary({ data: [cashRow({ total_deposits: 0, total_withdrawals: 0 })] }, date), [
    { currency: 'USD', deposits: 0, withdrawals: 0, netFlow: 0 },
  ]);
});

test('source reporting distinguishes an omitted raw field from a normalized blank default', () => {
  const result = buildAccountSources([{ login: '1', leadSource: '', raw: { login: '1' } }]);
  assert.deepEqual(result.items, []);
  assert.equal(result.total, 1);
  assert.match(result.unavailableReason, /not provided/);
  assert.deepEqual(result.coverage, { reported: 0, total: 1, missing: 1 });
});

test('explicit blank sources are Unspecified and partial source coverage is disclosed', () => {
  const complete = buildAccountSources([{ raw: { LeadSource: '' } }, { raw: { lead_source: 'Partner' } }]);
  assert.deepEqual(complete.items, [{ name: 'Partner', value: 1 }, { name: 'Unspecified', value: 1 }]);
  assert.equal(complete.unavailableReason, null);
  assert.equal(complete.coverageNote, null);
  const partial = buildAccountSources([{ raw: { LeadSource: 'Web' } }, { raw: {} }, { raw: { leadSource: 'Web' } }]);
  assert.deepEqual(partial.items, [{ name: 'Web', value: 2 }, { name: 'Unspecified', value: 1 }]);
  assert.match(partial.coverageNote, /1 of 3/);
  assert.equal(buildAccountSources([]).total, 0);
  assert.deepEqual(buildAccountSources([]).items, []);
});

test('account loader obtains every page in stable login order and forwards cancellation', async () => {
  const signal = new AbortController().signal;
  const requests = [];
  const rows = await loadCompleteReportAccounts(async (params, options) => {
    requests.push(params);
    assert.equal(options.signal, signal);
    return params.offset === 0
      ? { rows: [{ login: '1' }, { login: '2' }], total: 3, hasMore: true, nextOffset: 2 }
      : { rows: [{ login: '3' }], total: 3, hasMore: false };
  }, { signal, pageSize: 2 });
  assert.deepEqual(rows.map((row) => row.login), ['1', '2', '3']);
  assert.deepEqual(requests, [
    { limit: 2, offset: 0, sort_by: 'login', sort_dir: 'asc' },
    { limit: 2, offset: 2, sort_by: 'login', sort_dir: 'asc' },
  ]);
});

test('account loader accepts a confirmed empty catalogue and a terminal page without a total', async () => {
  assert.deepEqual(await loadCompleteReportAccounts(async () => ({ rows: [], total: 0, hasMore: false })), []);
  assert.deepEqual(await loadCompleteReportAccounts(async () => ({ rows: [{ Login: 7 }], hasMore: false })), [{ Login: 7 }]);
});

test('account loader rejects partial pages, missing pagination and missing account identifiers', async () => {
  await assert.rejects(loadCompleteReportAccounts(async () => ({ rows: [{ login: '1' }], total: 2, hasMore: false })), /only part/);
  await assert.rejects(loadCompleteReportAccounts(async () => ({ rows: [{ login: '1' }] })), /completeness/);
  await assert.rejects(loadCompleteReportAccounts(async () => ({ rows: [{}], total: 1, hasMore: false })), /no login/);
  await assert.rejects(loadCompleteReportAccounts(async () => ({ rows: [], total: 2, hasMore: true })), /stopped/);
});

test('account loader rejects repeated pages, total changes, and skipped offsets', async () => {
  await assert.rejects(loadCompleteReportAccounts(async () => ({ rows: [{ login: '1' }], total: 2, hasMore: true }), { pageSize: 1 }), /overlapping/);
  await assert.rejects(loadCompleteReportAccounts(async ({ offset }) => ({
    rows: [{ login: String(offset + 1) }], total: offset === 0 ? 2 : 3, hasMore: true,
  }), { pageSize: 1 }), /total changed/);
  await assert.rejects(loadCompleteReportAccounts(async () => ({ rows: [{ login: '1' }], total: 2, hasMore: true, nextOffset: 2 }), { pageSize: 1 }), /skipped/);
});

test('account loader enforces its budget and never returns an account sample after a failed page', async () => {
  await assert.rejects(loadCompleteReportAccounts(async () => ({ rows: [], total: 10001, hasMore: true })), /10000 account limit/);
  await assert.rejects(loadCompleteReportAccounts(async ({ offset }) => ({ rows: [{ login: String(offset + 1) }], hasMore: true }), { maxAccounts: 2, pageSize: 1 }), /2 account limit/);
  await assert.rejects(loadCompleteReportAccounts(async ({ offset }) => {
    if (offset) throw new Error('Forbidden');
    return { rows: [{ login: '1' }], total: 2, hasMore: true };
  }, { pageSize: 1 }), /Forbidden/);
});

test('account loader stops on abort before making a request', async () => {
  const controller = new AbortController();
  controller.abort();
  let called = false;
  await assert.rejects(loadCompleteReportAccounts(async () => { called = true; }, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(called, false);
});

test('observations only contain measured instants and replace stale values at the same instant', () => {
  const original = [{ timestamp: 1000, realAccounts: 10, cash: [{ currency: 'USD', deposits: 5 }] }];
  const result = appendDailyObservation(original, { timestamp: 90000, realAccounts: null, cash: [{ currency: 'USD', deposits: undefined }] });
  assert.deepEqual(result.map((point) => point.timestamp), [1000, 90000]);
  assert.equal(result[1].realAccounts, null);
  assert.equal(result[1].cash[0].deposits, null);
  const replaced = appendDailyObservation(result, { timestamp: 1000, realAccounts: undefined });
  assert.deepEqual(replaced[0], { timestamp: 1000, realAccounts: null });
  assert.equal(original[0].realAccounts, 10);
  assert.throws(() => appendDailyObservation([], { timestamp: NaN }), /finite timestamp/);
});

test('observations are sorted, bounded, and do not extend known values into missing periods', () => {
  const history = Array.from({ length: 2880 }, (_, index) => ({ timestamp: index + 1, realAccounts: 10 }));
  const result = appendDailyObservation(history, { timestamp: 4000, realAccounts: Infinity });
  assert.equal(result.length, 2880);
  assert.equal(result[0].timestamp, 2);
  assert.deepEqual(result.at(-1), { timestamp: 4000, realAccounts: null });
});
