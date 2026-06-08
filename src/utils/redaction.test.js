// Unit tests for the log-redaction helpers.
// Run with: node --test src/utils/redaction.test.js
//
// Covers manager-ui-N4-02: the sensitive-key pattern was over-broad — it matched
// any key ending in url/uri and any key containing "pass" (e.g. "passenger"),
// corrupting benign diagnostic fields. The narrowed pattern must still redact
// real secrets while leaving diagnostics intact, and redactUrl must still scrub
// secret-bearing URL values.
import test from 'node:test';
import assert from 'node:assert/strict';
import { redactSensitive, redactHeaders, redactUrl } from './redaction.js';

test('N4-02: redactSensitive still redacts real secret keys', () => {
  const out = redactSensitive({
    password: 'hunter2',
    access_token: 'abc',
    authorization: 'Bearer x',
    secret: 's',
    master_pass: 'm',
    investor_pass: 'i',
    pass: 'p',
  });
  assert.equal(out.password, '[REDACTED]');
  assert.equal(out.access_token, '[REDACTED]');
  assert.equal(out.authorization, '[REDACTED]');
  assert.equal(out.secret, '[REDACTED]');
  assert.equal(out.master_pass, '[REDACTED]');
  assert.equal(out.investor_pass, '[REDACTED]');
  assert.equal(out.pass, '[REDACTED]');
});

test('N4-02: redactSensitive no longer corrupts benign *_url / pass-substring fields', () => {
  const out = redactSensitive({
    backend_url: 'host-a',
    redirect_uri: 'host-b',
    passenger_count: 4,
    passed: true,
    url: 'host-c',
  });
  // These are NOT secrets — the narrowed key pattern must leave the field names
  // un-redacted (the values may still be URL-scrubbed by redactUrl when they look
  // like URLs, but plain identifiers/numbers pass through).
  assert.equal(out.passenger_count, 4);
  assert.equal(out.passed, true);
  assert.equal(out.backend_url, 'host-a');
  assert.equal(out.redirect_uri, 'host-b');
  assert.equal(out.url, 'host-c');
});

test('N4-02: redactHeaders redacts auth-bearing headers only', () => {
  const out = redactHeaders({ Authorization: 'Bearer x', 'X-Backend-Url': 'host', 'Content-Type': 'json' });
  assert.equal(out.Authorization, '[REDACTED]');
  assert.equal(out['X-Backend-Url'], 'host');
  assert.equal(out['Content-Type'], 'json');
});

test('redactUrl still strips secret query params and bearer tokens from URL values', () => {
  const out = redactUrl('/api/v2/OnAccountMetrics?id=SECRET_TOKEN&login=900001');
  assert.ok(!out.includes('SECRET_TOKEN'), `token leaked: ${out}`);
  assert.ok(out.includes('login=900001'), `non-secret param dropped: ${out}`);
});

test('R03: redactUrl strips tokens from full metrics websocket URLs', () => {
  const out = redactUrl('wss://example.test/manager/OnAccountMetrics?id=SECRET_TOKEN&login=900001');
  assert.ok(!out.includes('SECRET_TOKEN'), `token leaked: ${out}`);
  assert.ok(out.includes('login=900001'), `non-secret param dropped: ${out}`);
});
