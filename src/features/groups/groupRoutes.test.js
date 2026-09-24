import test from 'node:test';
import assert from 'node:assert/strict';
import { matchRoutes } from 'react-router';
import { getGroupDetailsPath, getGroupNameFromRouteParam, getGroupsFolderFromSearch, getGroupsFolderPath, getGroupsSelectedFromSearch } from './groupRoutes.js';

const GROUP_DETAILS_ROUTES = [{ path: '/groups/:groupName' }];

test('group detail paths encode route-breaking characters', () => {
  const cases = [
    ['Broker\\Live\\ECN', '/groups/Broker%5CLive%5CECN'],
    ['Broker/Live/ECN', '/groups/Broker%2FLive%2FECN'],
    ['Name With Space', '/groups/Name%20With%20Space'],
    ['Percent%Name', '/groups/Percent%25Name'],
    ['Question?Hash#', '/groups/Question%3FHash%23'],
  ];

  cases.forEach(([groupName, expectedPath]) => {
    assert.equal(getGroupDetailsPath(groupName), expectedPath);
  });
});

test('encoded group detail paths still match the group route', () => {
  [
    'Broker\\Live\\ECN',
    'Broker/Live/ECN',
    'Name With Space',
    'Percent%Name',
    'Question?Hash#',
  ].forEach((groupName) => {
    const match = matchRoutes(GROUP_DETAILS_ROUTES, getGroupDetailsPath(groupName));

    assert.equal(match?.[0]?.params?.groupName, groupName);
    assert.equal(getGroupNameFromRouteParam(match?.[0]?.params?.groupName), groupName);
  });
});

test('group route param normalization avoids double-decoding literal percent values', () => {
  assert.equal(getGroupNameFromRouteParam('Percent%25Name'), 'Percent%25Name');
  assert.equal(getGroupNameFromRouteParam(undefined), '');
});

test('explorer folder paths round-trip backslash names through the query string', () => {
  assert.equal(getGroupsFolderPath(''), '/groups');
  assert.equal(getGroupsFolderPath('PREP\\contest'), '/groups?path=PREP%5Ccontest');
  assert.equal(getGroupsFolderFromSearch('?path=PREP%5Ccontest'), 'PREP\\contest');
  assert.equal(getGroupsFolderFromSearch(''), '');
  assert.equal(getGroupsFolderPath('', 'ornn/demo-std'), '/groups?group=ornn%2Fdemo-std');
  assert.equal(getGroupsFolderPath('PREP\\demo', 'PREP\\demo\\Client 01'), '/groups?path=PREP%5Cdemo&group=PREP%5Cdemo%5CClient%2001');
  assert.equal(getGroupsSelectedFromSearch('?path=PREP%5Cdemo&group=PREP%5Cdemo%5CClient%2001'), 'PREP\\demo\\Client 01');
  assert.equal(getGroupsFolderFromSearch('?group=Arijit'), '');
});
