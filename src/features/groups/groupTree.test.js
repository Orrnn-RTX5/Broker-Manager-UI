import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGroupNavigatorTree,
  countGroupsUnder,
  getGroupFolderRows,
  getGroupMarginText,
  getGroupParentPath,
  getGroupRowText,
  isGroupBranch,
  joinGroupPath,
  listGroupContainerPaths,
  listGroupsUnder,
  nestGroupName,
  separatorForContainer,
} from './groupTree.js';

const SERVER_GROUPS = [
  { name: 'PREP\\contest\\4540\\Grp01', currency: 'USD', marginCallLevel: 100, stopOutLevel: 99 },
  { name: 'PREP\\contest\\4540\\Grp02', currency: 'USD' },
  { name: 'PREP\\demo\\4540\\Grp01', currency: 'USD' },
  { name: 'PREP\\real\\4540\\Grp01', currency: 'USD' },
  { name: 'Real', currency: 'USD' },
  { name: 'demo', currency: 'EUR' },
  { name: 'Nexa', currency: 'USD' },
  { name: 'Nexa\\real\\Client01', currency: 'USD' },
];

test('the root folder lists main groups as folders and plain groups as leaves', () => {
  const rows = getGroupFolderRows(SERVER_GROUPS, '');
  assert.deepEqual(rows.map((row) => row.label), ['Nexa', 'PREP', 'demo', 'Real']);
  const nexa = rows.find((row) => row.label === 'Nexa');
  // A group that also prefixes other names is one folder-style row, never two.
  assert.equal(rows.filter((row) => row.label === 'Nexa').length, 1);
  assert.equal(nexa.type, 'group');
  assert.equal(nexa.count, 1);
  assert.ok(isGroupBranch(nexa));
  const prep = rows.find((row) => row.label === 'PREP');
  assert.equal(prep.type, 'folder');
  assert.equal(prep.count, 4);
  assert.equal(isGroupBranch(rows.find((row) => row.label === 'Real')), false);
});

test('opening a folder shows its direct subfolders, then its leaf groups with full names', () => {
  assert.deepEqual(getGroupFolderRows(SERVER_GROUPS, 'PREP').map((row) => row.label), ['contest', 'demo', 'real']);
  assert.deepEqual(getGroupFolderRows(SERVER_GROUPS, 'PREP\\contest').map((row) => row.path), ['PREP\\contest\\4540']);
  const leaves = getGroupFolderRows(SERVER_GROUPS, 'PREP\\contest\\4540');
  assert.deepEqual(leaves.map((row) => row.name), ['PREP\\contest\\4540\\Grp01', 'PREP\\contest\\4540\\Grp02']);
  assert.ok(leaves.every((row) => row.type === 'group' && row.group && !isGroupBranch(row)));
});

test('folder paths compare case-insensitively and count every group underneath', () => {
  assert.equal(countGroupsUnder(SERVER_GROUPS, 'prep'), 4);
  assert.equal(countGroupsUnder(SERVER_GROUPS, 'PREP\\contest'), 2);
  assert.equal(countGroupsUnder(SERVER_GROUPS, ''), SERVER_GROUPS.length);
  assert.deepEqual(listGroupsUnder(SERVER_GROUPS, 'Nexa').map((group) => group.name), ['Nexa', 'Nexa\\real\\Client01']);
  assert.equal(getGroupParentPath('PREP\\contest\\4540'), 'PREP\\contest');
  assert.equal(getGroupParentPath('PREP'), '');
  assert.equal(joinGroupPath('', 'PREP', 'demo'), 'PREP\\demo');
});

test('the navigator tree lists folders with their group counts, then the groups', () => {
  const tree = buildGroupNavigatorTree(SERVER_GROUPS);
  // Folders first (with their group counts), then plain groups by name.
  assert.deepEqual(tree.map((node) => [node.label, node.type, node.count]), [
    ['Nexa', 'folder', 1], ['PREP', 'folder', 4], ['demo', 'group', 0], ['Real', 'group', 0],
  ]);
  assert.equal(tree.filter((node) => node.label === 'Nexa').length, 1);
  assert.equal(tree[0].group?.name, 'Nexa');
  const prep = tree.find((node) => node.label === 'PREP');
  assert.deepEqual(prep.children.map((node) => [node.label, node.count]), [['contest', 2], ['demo', 1], ['real', 1]]);
  assert.deepEqual(prep.children[0].children.map((node) => [node.path, node.count]), [['PREP\\contest\\4540', 2]]);
  assert.deepEqual(prep.children[0].children[0].children.map((node) => [node.label, node.type, node.path]), [
    ['Grp01', 'group', 'PREP\\contest\\4540\\Grp01'],
    ['Grp02', 'group', 'PREP\\contest\\4540\\Grp02'],
  ]);
});

test('container paths include groups and implied folders, parents before children', () => {
  const containers = listGroupContainerPaths([{ name: 'A\\b\\c' }, { name: 'a' }, { name: 'B' }]);
  assert.deepEqual(containers, ['a', 'A\\b', 'A\\b\\c', 'B']);
});

test('slash-separated names become folders and keep the slash', () => {
  const groups = [
    { name: 'Arijit' },
    { name: 'dipannita' },
    { name: 'ormn/demo-std' },
    { name: 'YoPips Demo' },
    { name: 'YoPips real' },
    { name: 'Yopips/demo' },
    { name: 'Yopips/real' },
  ];
  const rows = getGroupFolderRows(groups, '');
  assert.deepEqual(rows.map((row) => [row.label, row.type, row.count]), [
    ['ormn', 'folder', 1],
    ['Yopips', 'folder', 2],
    ['Arijit', 'group', 0],
    ['dipannita', 'group', 0],
    ['YoPips Demo', 'group', 0],
    ['YoPips real', 'group', 0],
  ]);
  assert.deepEqual(getGroupFolderRows(groups, 'Yopips').map((row) => [row.label, row.name]), [
    ['demo', 'Yopips/demo'],
    ['real', 'Yopips/real'],
  ]);
  assert.equal(getGroupParentPath('Yopips/demo'), 'Yopips');
  assert.equal(separatorForContainer(groups, 'Yopips'), '/');
  assert.equal(nestGroupName('Yopips', 'vip', separatorForContainer(groups, 'Yopips')), 'Yopips/vip');
  assert.equal(separatorForContainer(SERVER_GROUPS, 'PREP'), '\\');
});

test('row text mirrors the MT5 columns', () => {
  assert.equal(getGroupMarginText({ marginCallLevel: 100, stopOutLevel: 99 }), '100 / 99 %');
  assert.equal(getGroupMarginText({ marginCallLevel: 50 }), '50 %');
  assert.equal(getGroupMarginText({}), '');
  assert.deepEqual(getGroupRowText({ routingMode: 'a_book', leverage: 100, currency: 'USD', demo: true }), {
    type: 'Demo',
    risk: 'A-Book',
    margin: '',
    leverage: '1:100',
    currency: 'USD',
  });
  assert.equal(getGroupRowText({ riskManagement: 'Retail Forex', bookType: 'B-Book' }).risk, 'Retail Forex');
});
