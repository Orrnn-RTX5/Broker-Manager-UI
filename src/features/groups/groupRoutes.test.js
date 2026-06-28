import test from 'node:test';
import assert from 'node:assert/strict';
import { matchRoutes } from 'react-router';
import { getGroupDetailsPath, getGroupNameFromRouteParam } from './groupRoutes.js';

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
