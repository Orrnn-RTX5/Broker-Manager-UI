import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildTradingAccountFilterOptions,
  buildTradingAccountReport,
  parseTradingAccountRegistration,
} from '../../utils/tradingAccountAnalytics.js';

test('trading analytics renders live registration, country, and group visualizations', () => {
  const source = readFileSync(new URL('./TradingAccountsDashboard.jsx', import.meta.url), 'utf8');
  for (const title of ['Trading Accounts by Registration Date', 'Trading Accounts by Country', 'Trading Accounts by Group']) {
    assert.ok(source.includes(title));
  }
  assert.match(source, /getTradingAccountsAnalyticsQueryOptions/);
  assert.match(source, /<LineChart/);
  assert.match(source, /<ComposableMap/);
  assert.match(source, /<DonutChart|<PieChart/);
  assert.match(source, /DateRangePicker onChange=/);
  assert.doesNotMatch(source, /reports are not available yet|Report unavailable|ComingSoon|trading-analytics-group-legend/);
  assert.match(source, /navigate\('\/clients\/trading-accounts'\)/);
  assert.match(source, /useOwnerConsoleAutoCollapse/);
});

test('registration timestamps accept manager epoch and calendar formats without inventing invalid dates', () => {
  const expected = new Date(2026, 7, 31).getTime();
  assert.equal(parseTradingAccountRegistration('2026.08.31'), expected);
  assert.equal(parseTradingAccountRegistration('20260831'), expected);
  assert.equal(parseTradingAccountRegistration(Math.floor(expected / 1000)), Math.floor(expected / 1000) * 1000);
  assert.equal(parseTradingAccountRegistration(expected), expected);
  assert.equal(parseTradingAccountRegistration('2026.02.31'), null);
  assert.equal(parseTradingAccountRegistration('not-a-date'), null);
  assert.equal(parseTradingAccountRegistration(null), null);
});

test('trading account aggregation applies every filter and keeps measured totals consistent', () => {
  const accounts = [
    { login: '1', registration: new Date(2026, 7, 31), country: 'India', group: 'demo\\main', leadCampaign: 'Alpha', leadSource: 'Google' },
    { login: '2', registration: new Date(2026, 8, 7, 9), country: 'India', group: 'demo\\main', leadCampaign: 'Alpha', leadSource: 'Direct' },
    { login: '3', registration: new Date(2026, 8, 7, 18), country: 'Brazil', group: 'demo\\extra', leadCampaign: 'Beta', leadSource: 'Google' },
    { login: '4', registration: null, country: '', group: '', leadCampaign: 'Alpha', leadSource: 'Google' },
  ];

  assert.deepEqual(buildTradingAccountFilterOptions(accounts), {
    campaigns: ['Alpha', 'Beta'],
    sources: ['Direct', 'Google'],
    countries: ['Brazil', 'India'],
    groups: ['demo\\extra', 'demo\\main'],
  });

  assert.deepEqual(buildTradingAccountReport(accounts), {
    total: 4,
    registrations: [
      { date: '2026.08.31', count: 1 },
      { date: '2026.09.07', count: 2 },
    ],
    countries: [
      { name: 'India', count: 2 },
      { name: 'Brazil', count: 1 },
      { name: 'Unspecified', count: 1 },
    ],
    groups: [
      { name: 'demo\\main', count: 2 },
      { name: 'demo\\extra', count: 1 },
      { name: 'Unspecified', count: 1 },
    ],
  });

  const filtered = buildTradingAccountReport(accounts, {
    campaign: 'Alpha',
    source: 'Direct',
    country: 'India',
    group: 'demo\\main',
    start: new Date(2026, 8, 7),
    end: new Date(2026, 8, 7),
  });
  assert.equal(filtered.total, 1);
  assert.deepEqual(filtered.registrations, [{ date: '2026.09.07', count: 1 }]);
  assert.deepEqual(filtered.countries, [{ name: 'India', count: 1 }]);
  assert.deepEqual(filtered.groups, [{ name: 'demo\\main', count: 1 }]);
});
