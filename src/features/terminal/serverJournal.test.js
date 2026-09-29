import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildServerJournalQuery,
  describeServerJournalError,
  describeServerJournalScope,
  formatServerJournalTime,
  matchesServerJournalSearch,
  mergeServerJournalPages,
  serverJournalDetail,
  severityClass,
} from './serverJournalCore.js';

test('filters and paging become journal query parameters', () => {
  const query = new URLSearchParams(buildServerJournalQuery({ filter: 'security', cursor: '1790000000000.2.5', limit: 50 }));
  assert.equal(query.get('category'), 'SECURITY,AUTH');
  assert.equal(query.get('cursor'), '1790000000000.2.5');
  assert.equal(query.get('limit'), '50');
  const all = new URLSearchParams(buildServerJournalQuery());
  assert.equal(all.get('category'), null);
  assert.equal(all.get('limit'), '200');
  assert.equal(new URLSearchParams(buildServerJournalQuery({ filter: 'errors' })).get('severity'), 'error');
});

test('scope text tells a manager what the journal covers', () => {
  assert.equal(describeServerJournalScope({ mode: 'unrestricted' }), 'Journal · all broker events');
  assert.equal(describeServerJournalScope({ mode: 'groups', groups: ['demo'] }), 'Journal · groups demo + your actions');
  assert.match(describeServerJournalScope({ mode: 'own_actions', system: true }), /own actions only \+ broker-wide/);
  assert.equal(describeServerJournalScope(null), '');
});

test('a missing permission is explained instead of shown as a failure', () => {
  assert.match(describeServerJournalError({ status: 403, message: 'Permission denied: view_journal' }), /View Journal/);
  assert.match(describeServerJournalError({ status: 503, message: 'Journal unavailable' }), /Journal unavailable/);
});

test('rows format, search and page without duplicates', () => {
  const entry = {
    id: 'm1', time: new Date(2026, 8, 28, 13, 45, 13, 7).getTime(), severity: 'warning', source: 'Manager',
    category: 'CONFIG', action: 'GroupUpdate', actor_type: 'admin', actor_id: '9001', actor_ip: '10.0.0.5',
    result: 'success', group: 'demo', message: 'GroupUpdate completed', request_id: 'req-1',
    before: { leverage: 100 }, after: { leverage: 200 },
  };
  assert.equal(formatServerJournalTime(entry.time), '2026.09.28 13:45:13.007');
  assert.equal(severityClass('warning'), 'is-warn');
  assert.equal(severityClass('critical'), 'is-error');
  assert.equal(severityClass('info'), 'is-info');
  const detail = serverJournalDetail(entry);
  assert.match(detail, /By admin 9001/);
  assert.match(detail, /IP 10\.0\.0\.5/);
  assert.match(detail, /leverage: 100 → 200/);
  assert.equal(matchesServerJournalSearch(entry, 'groupupdate'), true);
  assert.equal(matchesServerJournalSearch(entry, 'btcusd'), false);
  assert.deepEqual(mergeServerJournalPages([entry], [entry, { id: 't2' }]).map((e) => e.id), ['m1', 't2']);
});
