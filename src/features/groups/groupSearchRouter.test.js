import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractAccountFields,
  filterAccountRowsBySearch,
  filterGroupRowsBySearch,
  getGroupSearchSuggestions,
  matchAccountField,
  parseGroupSearchRoute,
  resolveGroupSearchRoute,
  scoreSegmentMatch,
} from './groupSearchRouter.js';
import { getGroupFolderRows } from './groupTree.js';
import { GROUP_ACCOUNT_COLUMNS, accountsInGroup } from './groupAccountRows.js';

const SAMPLE_GROUPS = [
  { name: 'dipannita', currency: 'USD', leverage: 100 },
  { name: 'Test', currency: 'USD', leverage: 100 },
  { name: 'Yopips\\demo\\standard', currency: 'USD', leverage: 200 },
  { name: 'Yopips\\demo\\pro', currency: 'USD', leverage: 500 },
  { name: 'Nested/Folder/SubGroup', currency: 'EUR', leverage: 100 },
];

const SAMPLE_ACCOUNTS = [
  {
    login: '200029',
    Name: 'Dipanwita Trader',
    Email: 'trader@example.com',
    Phone: '+1-555-0199',
    Country: 'India',
    group: 'dipannita',
    balance: 1500,
    equity: 1550.25,
    leverage: 100,
  },
  {
    login: '200030',
    Name: 'Second Account',
    Email: 'second@example.com',
    group: 'dipannita',
    balance: 2500,
    equity: 2500,
    leverage: 100,
  },
  {
    login: '300101',
    Name: 'Pro Account',
    Email: 'pro@example.com',
    group: 'Yopips\\demo\\pro',
    balance: 5000,
    equity: 5200,
    leverage: 500,
  },
  {
    login: '400555',
    Name: 'Nested Trader',
    Email: 'nested@example.com',
    group: 'Nested/Folder/SubGroup',
    balance: 900,
    equity: 900,
    leverage: 100,
  },
];

test('parseGroupSearchRoute splits slash and backslash routes and strips root Groups label', () => {
  const simple = parseGroupSearchRoute('dipanwita', SAMPLE_GROUPS);
  assert.equal(simple.isPathQuery, false);
  assert.deepEqual(simple.segments, ['dipanwita']);

  const withSpaces = parseGroupSearchRoute('dipanwita / folder name / 200029', SAMPLE_GROUPS);
  assert.equal(withSpaces.isPathQuery, true);
  assert.deepEqual(withSpaces.segments, ['dipanwita', 'folder name', '200029']);
  assert.equal(withSpaces.activeSegment, '200029');

  const withRootPrefix = parseGroupSearchRoute('Groups / dipanwita / 200029', SAMPLE_GROUPS);
  assert.deepEqual(withRootPrefix.segments, ['dipanwita', '200029']);

  const trailing = parseGroupSearchRoute('dipanwita / ', SAMPLE_GROUPS);
  assert.equal(trailing.hasTrailingSeparator, true);
  assert.deepEqual(trailing.segments, ['dipanwita']);
  assert.equal(trailing.activeSegment, '');
});

test('scoreSegmentMatch ranks exact > prefix > substring > phonetic/fuzzy and blocks numeric fuzzy matches', () => {
  assert.equal(scoreSegmentMatch('dipannita', 'dipannita'), 100);
  assert.ok(scoreSegmentMatch('dipannita', 'dipan') >= 80);
  assert.ok(scoreSegmentMatch('dipannita', 'dipanwita') >= 38, 'dipanwita must phonetically/fuzzily match dipannita');
  assert.ok(scoreSegmentMatch('leverage', 'lavaerage') >= 38, 'lavaerage must fuzzily match leverage');
  assert.equal(scoreSegmentMatch('200029', '200028'), 0, 'numeric account logins must never fuzzy match a different digit');
});

test('resolveGroupSearchRoute opens a leaf group when typing its name (including dipanwita -> dipannita)', () => {
  const route = resolveGroupSearchRoute({
    query: 'dipanwita',
    groups: SAMPLE_GROUPS,
    accountRows: SAMPLE_ACCOUNTS,
  });
  assert.ok(route);
  assert.equal(route.type, 'group');
  assert.equal(route.group.name, 'dipannita');
  assert.equal(route.folder, '');
});

test('resolveGroupSearchRoute opens a branch folder when typing a container folder name', () => {
  const folderRoute = resolveGroupSearchRoute({
    query: 'Yopips',
    groups: SAMPLE_GROUPS,
    accountRows: SAMPLE_ACCOUNTS,
  });
  assert.ok(folderRoute);
  assert.equal(folderRoute.type, 'folder');
  assert.equal(folderRoute.folder, 'Yopips');

  const subFolderRoute = resolveGroupSearchRoute({
    query: 'Yopips / demo',
    groups: SAMPLE_GROUPS,
    accountRows: SAMPLE_ACCOUNTS,
  });
  assert.ok(subFolderRoute);
  assert.equal(subFolderRoute.type, 'folder');
  assert.equal(subFolderRoute.folder, 'Yopips\\demo');
});

test('resolveGroupSearchRoute opens account details for group / account_number and group / folder / account_number', () => {
  const directAccount = resolveGroupSearchRoute({
    query: 'dipanwita / 200029',
    groups: SAMPLE_GROUPS,
    accountRows: SAMPLE_ACCOUNTS,
  });
  assert.ok(directAccount);
  assert.equal(directAccount.type, 'account');
  assert.equal(directAccount.login, '200029');
  assert.equal(directAccount.group.name, 'dipannita');
  assert.equal(directAccount.account.login, '200029');

  const nestedAccount = resolveGroupSearchRoute({
    query: 'Yopips / demo / pro / 300101',
    groups: SAMPLE_GROUPS,
    accountRows: SAMPLE_ACCOUNTS,
  });
  assert.ok(nestedAccount);
  assert.equal(nestedAccount.type, 'account');
  assert.equal(nestedAccount.login, '300101');
  assert.equal(nestedAccount.group.name, 'Yopips\\demo\\pro');

  const skippedFolderAccount = resolveGroupSearchRoute({
    query: 'Nested / Folder / 400555',
    groups: SAMPLE_GROUPS,
    accountRows: SAMPLE_ACCOUNTS,
  });
  assert.ok(skippedFolderAccount);
  assert.equal(skippedFolderAccount.type, 'account');
  assert.equal(skippedFolderAccount.login, '400555');
  assert.equal(skippedFolderAccount.group.name, 'Nested/Folder/SubGroup');
});

test('resolveGroupSearchRoute resolves account fields after account number (/ email, / lavaerage, / balance)', () => {
  const emailRoute = resolveGroupSearchRoute({
    query: 'dipanwita / 200029 / email',
    groups: SAMPLE_GROUPS,
    accountRows: SAMPLE_ACCOUNTS,
  });
  assert.ok(emailRoute);
  assert.equal(emailRoute.type, 'account-field');
  assert.equal(emailRoute.login, '200029');
  assert.equal(emailRoute.field.key, 'email');
  assert.equal(emailRoute.field.label, 'Email');
  assert.equal(emailRoute.field.value, 'trader@example.com');
  assert.equal(emailRoute.field.tab, 'Personal');

  // Supports misspelled "lavaerage" as well as "leverage"
  const leverageRoute = resolveGroupSearchRoute({
    query: 'dipanwita / 200029 / lavaerage',
    groups: SAMPLE_GROUPS,
    accountRows: SAMPLE_ACCOUNTS,
  });
  assert.ok(leverageRoute);
  assert.equal(leverageRoute.type, 'account-field');
  assert.equal(leverageRoute.login, '200029');
  assert.equal(leverageRoute.field.key, 'leverage');
  assert.equal(leverageRoute.field.label, 'Leverage');
  assert.equal(leverageRoute.field.value, '1 : 100');
  assert.equal(leverageRoute.field.tab, 'Account');

  // Deep folder / group / account / field
  const deepBalanceRoute = resolveGroupSearchRoute({
    query: 'Yopips / demo / pro / 300101 / balance',
    groups: SAMPLE_GROUPS,
    accountRows: SAMPLE_ACCOUNTS,
  });
  assert.ok(deepBalanceRoute);
  assert.equal(deepBalanceRoute.type, 'account-field');
  assert.equal(deepBalanceRoute.login, '300101');
  assert.equal(deepBalanceRoute.field.key, 'balance');
  assert.equal(deepBalanceRoute.field.value, '5,000.00 USD');

  // Relative `/ email` and `/ lavaerage` when an account is selected inside an opened group
  const relativeField = resolveGroupSearchRoute({
    query: '/ lavaerage',
    groups: SAMPLE_GROUPS,
    accountRows: SAMPLE_ACCOUNTS,
    openedGroup: SAMPLE_GROUPS[0],
    selectedLogin: '200029',
  });
  assert.ok(relativeField);
  assert.equal(relativeField.type, 'account-field');
  assert.equal(relativeField.login, '200029');
  assert.equal(relativeField.field.key, 'leverage');
  assert.equal(relativeField.field.value, '1 : 100');
});

test('extractAccountFields and matchAccountField read all standard account properties', () => {
  const fields = extractAccountFields(SAMPLE_ACCOUNTS[0], SAMPLE_GROUPS[0]);
  const byKey = Object.fromEntries(fields.map((f) => [f.key, f.value]));
  assert.equal(byKey.email, 'trader@example.com');
  assert.equal(byKey.leverage, '1 : 100');
  assert.equal(byKey.balance, '1,500.00 USD');
  assert.equal(byKey.equity, '1,550.25 USD');
  assert.equal(byKey.phone, '+1-555-0199');
  assert.equal(byKey.country, 'India');

  const matched = matchAccountField(SAMPLE_ACCOUNTS[0], SAMPLE_GROUPS[0], 'lavaerage');
  assert.ok(matched);
  assert.equal(matched.field.key, 'leverage');
  assert.equal(matched.field.value, '1 : 100');
});

test('resolveGroupSearchRoute supports uncached numeric account login under a valid group path', () => {
  const uncached = resolveGroupSearchRoute({
    query: 'dipanwita / 999888',
    groups: SAMPLE_GROUPS,
    accountRows: SAMPLE_ACCOUNTS,
  });
  assert.ok(uncached);
  assert.equal(uncached.type, 'account');
  assert.equal(uncached.login, '999888');
  assert.equal(uncached.group.name, 'dipannita');
});

test('getGroupSearchSuggestions returns group, subfolder, account, and account-field route completions', () => {
  const onGroupType = getGroupSearchSuggestions({
    query: 'dipanwita',
    groups: SAMPLE_GROUPS,
    accountRows: SAMPLE_ACCOUNTS,
  });
  assert.ok(onGroupType.length > 0);
  assert.equal(onGroupType[0].type, 'group');
  assert.equal(onGroupType[0].group.name, 'dipannita');
  assert.ok(onGroupType.some((item) => item.type === 'account' && item.login === '200029'));

  const onTrailingSlash = getGroupSearchSuggestions({
    query: 'dipanwita / ',
    groups: SAMPLE_GROUPS,
    accountRows: SAMPLE_ACCOUNTS,
  });
  assert.ok(onTrailingSlash.some((item) => item.type === 'account' && item.login === '200029'));

  const onAccountTrailingSlash = getGroupSearchSuggestions({
    query: 'dipanwita / 200029 / ',
    groups: SAMPLE_GROUPS,
    accountRows: SAMPLE_ACCOUNTS,
  });
  assert.ok(onAccountTrailingSlash.some((item) => item.type === 'account-field' && item.field.key === 'email' && item.field.value === 'trader@example.com'));
  assert.ok(onAccountTrailingSlash.some((item) => item.type === 'account-field' && item.field.key === 'leverage' && item.field.value === '1 : 100'));

  const onFieldQuery = getGroupSearchSuggestions({
    query: 'dipanwita / 200029 / lavaerage',
    groups: SAMPLE_GROUPS,
    accountRows: SAMPLE_ACCOUNTS,
  });
  assert.equal(onFieldQuery[0].type, 'account-field');
  assert.equal(onFieldQuery[0].field.key, 'leverage');
  assert.equal(onFieldQuery[0].field.value, '1 : 100');
});

test('filterGroupRowsBySearch and filterAccountRowsBySearch keep relevant rows visible during router input', () => {
  const rootRows = getGroupFolderRows(SAMPLE_GROUPS, '');
  const filteredFuzzy = filterGroupRowsBySearch(rootRows, 'dipanwita');
  assert.equal(filteredFuzzy.length, 1);
  assert.equal(filteredFuzzy[0].name, 'dipannita');

  const filteredPath = filterGroupRowsBySearch(rootRows, 'dipanwita / 200029 / email');
  assert.equal(filteredPath.length, 1);
  assert.equal(filteredPath[0].name, 'dipannita');

  const dipannitaAccounts = accountsInGroup(SAMPLE_ACCOUNTS, 'dipannita', SAMPLE_GROUPS[0]);
  const filteredAccounts = filterAccountRowsBySearch(dipannitaAccounts, 'dipanwita / 200029 / lavaerage', GROUP_ACCOUNT_COLUMNS);
  assert.equal(filteredAccounts.length, 1);
  assert.equal(filteredAccounts[0].login, '200029');
});

const CASE_SAMPLE_GROUPS = [
  { name: 'ALPHA', currency: 'USD', leverage: 100 },
  { name: 'Beta', currency: 'USD', leverage: 100 },
];

// Owner rule: search may fold case, group identity may not. An account keeps its stored group
// however the query spells or places the segment, and never takes the typed group's name.
test('group identity is exact: an account stored under "Alpha" always routes with group "Alpha", never the typed group', () => {
  for (const query of ['Beta / 500001', 'ALPHA / 500001', 'alpha / 500001']) {
    const route = resolveGroupSearchRoute({
      query,
      groups: CASE_SAMPLE_GROUPS,
      accountRows: [{ login: '500001', Name: 'Case Variant', group: 'Alpha', balance: 10, equity: 10, leverage: 100 }],
    });
    assert.ok(route, query);
    assert.equal(route.type, 'account', query);
    assert.equal(route.login, '500001', query);
    assert.equal(route.group.name, 'Alpha', query);
  }
});

test('an exact group name still owns the account route', () => {
  const route = resolveGroupSearchRoute({
    query: 'Beta / 500002',
    groups: CASE_SAMPLE_GROUPS,
    accountRows: [{ login: '500002', Name: 'Exact Owner', group: 'ALPHA', balance: 10, equity: 10, leverage: 100 }],
  });
  assert.ok(route);
  assert.equal(route.type, 'account');
  assert.equal(route.login, '500002');
  assert.equal(route.group.name, 'ALPHA');
});
