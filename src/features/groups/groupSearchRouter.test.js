import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractAccountFields,
  filterAccountRowsBySearch,
  filterGroupRowsBySearch,
  getGroupSearchSuggestions,
  matchAccountField,
  parseGroupSearchRoute,
  resolveGroupEnterTarget,
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

// B3-R: an account with a BLANK stored group has no owner. No query spelling, case or fuzzy
// typo may route it to any group, including the group the typed segment matches.
test('an account with an empty stored group never routes to any group, whatever the typed group', () => {
  const blankRows = [
    [{ login: '500003', Name: 'Blank Owner', group: '', balance: 10, equity: 10, leverage: 100 }],
    [{ login: '500003', Name: 'Blank Owner', group: '   ', balance: 10, equity: 10, leverage: 100 }],
  ];
  for (const accountRows of blankRows) {
    for (const query of ['ALPHA / 500003', 'alpha / 500003', 'Beta / 500003', 'Alph / 500003', 'Bet / 500003', 'ALPHA /500003']) {
      const route = resolveGroupSearchRoute({ query, groups: CASE_SAMPLE_GROUPS, accountRows });
      assert.equal(route, null, `${query} must not route (blank group: ${JSON.stringify(accountRows[0].group)})`);
      const suggestions = getGroupSearchSuggestions({ query, groups: CASE_SAMPLE_GROUPS, accountRows });
      assert.ok(
        suggestions.every((item) => item.type !== 'account' && item.type !== 'account-field' && item.type !== 'group' && item.type !== 'folder'),
        `${query} must not suggest any group or account route`,
      );
    }
  }
});

// B3-R2 / round 5: the blank-group account may sit in any segment after the group. The fixture is shared
// by every Enter test below. The Enter decision is made as GroupsPage makes it, on the root folder.
const BLANK_OWNER_ROWS = [
  { login: '500003', Name: 'Blank Owner', group: '', balance: 10, equity: 10, leverage: 100 },
  { login: '500002', Name: 'Beta Acc', group: 'Beta', balance: 10, equity: 10, leverage: 100 },
  { login: '500001', Name: 'Alpha Acc', group: 'ALPHA', balance: 10, equity: 10, leverage: 100 },
];

const enterTargetFor = (query, { accountRows = BLANK_OWNER_ROWS, groups = CASE_SAMPLE_GROUPS, openedGroup = null, visibleAccounts = [] } = {}) => {
  const visibleRows = filterGroupRowsBySearch(getGroupFolderRows(groups, ''), query, '');
  const route = resolveGroupSearchRoute({ query, groups, accountRows, currentFolder: '', openedGroup });
  const suggestions = getGroupSearchSuggestions({ query, groups, accountRows, currentFolder: '', openedGroup });
  return resolveGroupEnterTarget({ route, suggestions, openedGroup, visibleRows, visibleAccounts, query, groups });
};

test('Enter opens nothing for a blank-group account, in every path and field-suffix form', () => {
  for (const query of [
    'Beta / 500003', 'Beta / 500003 /', 'Beta / 500003 / email', 'Beta / 500003 / balance',
    'Be / 500003', 'Be / 500003 / email', 'Be / 500003 / balance', 'beta / 500003 / email',
    'ALPHA / 500003 / email', 'Beta /500003/email', '/ 500003 / email', '/ 500003 / balance',
  ]) {
    assert.equal(enterTargetFor(query), null, `Enter on "${query}" must open nothing`);
  }
});

// Round 5 (B1): a multi-segment path opens only a route the router fully resolved. Name forms of a
// blank-group account used to open the visible group Beta through the single-row fallback.
test('Enter opens nothing for the review name forms of a blank-group account', () => {
  for (const query of [
    'Beta / Blank Owner', 'Beta / Blank O', 'Beta / Blank Owner / email',
    'Beta / 500002 / Blank Owner', 'Beta / Blank Owner / 500002',
  ]) {
    assert.equal(enterTargetFor(query), null, `Enter on "${query}" must open nothing`);
    assert.equal(resolveGroupSearchRoute({ query, groups: CASE_SAMPLE_GROUPS, accountRows: BLANK_OWNER_ROWS }), null, `"${query}" must not route`);
  }
});

// Round 5 (SF4): the name of an account in another group is not a match under the typed group.
test('Enter opens nothing when the typed account name belongs to another group', () => {
  assert.equal(enterTargetFor('Beta / Alpha Acc'), null, 'Alpha Acc is in ALPHA, not Beta');
  assert.equal(enterTargetFor('ALPHA / Beta Acc'), null, 'Beta Acc is in Beta, not ALPHA');
});

// Round 5 regression: single-segment queries and resolved path routes keep opening.
test('Enter still opens a plain group name, a resolved account path, and a resolved subgroup path', () => {
  const beta = enterTargetFor('Beta');
  assert.equal(beta?.kind, 'route');
  assert.equal(beta.route.group.name, 'Beta');

  const ownAccount = enterTargetFor('Beta / 500002');
  assert.equal(ownAccount?.kind, 'route');
  assert.equal(ownAccount.route.type, 'account');
  assert.equal(ownAccount.route.login, '500002');
  assert.equal(ownAccount.route.group.name, 'Beta');

  const aliasAccount = enterTargetFor('ALPHA / 500002');
  assert.equal(aliasAccount?.kind, 'route');
  assert.equal(aliasAccount.route.login, '500002', 'an account in Beta still opens under Beta from an ALPHA path');
  assert.equal(aliasAccount.route.group.name, 'Beta');

  const subgroupGroups = [{ name: 'Beta', currency: 'USD', leverage: 100 }, { name: 'Beta/Sub', currency: 'USD', leverage: 100 }];
  const sub = enterTargetFor('Beta / Sub', { groups: subgroupGroups });
  assert.equal(sub?.kind, 'route');
  assert.equal(sub.route.group.name, 'Beta/Sub');
});

test('Enter still activates the single visible group when no route or suggestion applies (no regression)', () => {
  const beta = getGroupFolderRows(CASE_SAMPLE_GROUPS, '').find((row) => row.name === 'Beta');
  const target = resolveGroupEnterTarget({ visibleRows: [beta], query: 'Bet', groups: CASE_SAMPLE_GROUPS });
  assert.equal(target?.kind, 'row');
  assert.equal(target.row.name, 'Beta');
  assert.equal(enterTargetFor('Beta')?.kind, 'route', 'a plain group name still resolves to its group route first');
});

test('Enter still routes a valid account path and field path', () => {
  const account = enterTargetFor('ALPHA / 500001');
  assert.equal(account?.kind, 'route');
  assert.equal(account.route.type, 'account');
  assert.equal(account.route.login, '500001');
  const field = enterTargetFor('ALPHA / 500001 / email');
  assert.equal(field?.kind, 'route');
  assert.equal(field.route.type, 'account-field');
});

test('Enter activates the single visible account of the opened group (no regression)', () => {
  const beta = CASE_SAMPLE_GROUPS[1];
  const onlyAccount = { login: '500002', account: BLANK_OWNER_ROWS[1] };
  const target = resolveGroupEnterTarget({ openedGroup: beta, visibleRows: [], visibleAccounts: [onlyAccount], query: '500002' });
  assert.equal(target?.kind, 'account');
  assert.equal(target.account.login, '500002');
});
