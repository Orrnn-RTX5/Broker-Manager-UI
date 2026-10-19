import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReportSubmittedNotice,
  mapBugReportSubmitError,
  resolveBrokerSupportEmail,
} from './bugReportService.js';

test('resolveBrokerSupportEmail returns the trimmed broker support address', () => {
  assert.equal(
    resolveBrokerSupportEmail({ support_email: '  support@example.broker  ' }),
    'support@example.broker'
  );
  assert.equal(
    resolveBrokerSupportEmail({ supportEmail: 'help@example.broker' }),
    'help@example.broker'
  );
});

test('resolveBrokerSupportEmail falls back to empty string without broker data', () => {
  assert.equal(resolveBrokerSupportEmail(null), '');
  assert.equal(resolveBrokerSupportEmail(undefined), '');
  assert.equal(resolveBrokerSupportEmail('not-an-object'), '');
  assert.equal(resolveBrokerSupportEmail({}), '');
  assert.equal(resolveBrokerSupportEmail({ support_email: '   ' }), '');
});

test('buildReportSubmittedNotice names the broker support contact when configured', () => {
  const notice = buildReportSubmittedNotice({ support_email: 'support@example.broker' });
  assert.match(notice, /support@example\.broker/);
  assert.match(notice, /Quote this reference/);
  assert.doesNotMatch(notice, /RTX5/i);
});

test('buildReportSubmittedNotice stays vendor-free without broker support data', () => {
  for (const brokerInfo of [null, undefined, {}, { support_email: '' }]) {
    const notice = buildReportSubmittedNotice(brokerInfo);
    assert.equal(
      notice,
      'Your support team can see this report. Quote this reference if you follow it up.'
    );
    assert.doesNotMatch(notice, /RTX5/i);
  }
});

test('mapBugReportSubmitError keeps the not-configured message for 503', () => {
  assert.equal(
    mapBugReportSubmitError({ status: 503 }),
    'Bug reporting is not configured on this server yet. Please contact your administrator.'
  );
});

test('mapBugReportSubmitError stays vendor-free when the support service is unreachable', () => {
  const message = mapBugReportSubmitError({ status: 502 });
  assert.equal(message, 'The support service could not be reached. Please try again in a moment.');
  assert.doesNotMatch(message, /RTX5/i);
});

test('mapBugReportSubmitError passes backend detail through for other failures', () => {
  assert.equal(
    mapBugReportSubmitError({ status: 400, message: 'Title is required' }),
    'Title is required'
  );
  assert.equal(
    mapBugReportSubmitError({ status: 500 }),
    'The report could not be submitted'
  );
  assert.equal(mapBugReportSubmitError(), 'The report could not be submitted');
});
