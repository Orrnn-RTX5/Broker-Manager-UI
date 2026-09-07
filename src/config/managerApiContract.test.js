import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildManagerAccountEndpoint,
  buildManagerOrderCloseEndpoint,
  buildManagerOrderStatusEndpoint,
  buildReportsSummaryEndpoint,
  MANAGER_API,
} from './managerApiContract.js';

test('high-traffic manager routes match the live Swagger contract', () => {
  assert.deepEqual(MANAGER_API, {
    login: '/api/v1/manager/auth/login',
    session: '/api/v1/manager/auth/me',
    refresh: '/api/v1/manager/auth/refresh',
    accounts: '/api/v1/manager/accounts',
    orders: '/api/v1/manager/orders',
    transactionDeposit: '/api/v1/manager/transactions/deposit',
    transactionWithdraw: '/api/v1/manager/transactions/withdraw',
    transactionCredit: '/api/v1/manager/transactions/credit',
    transactionTransfer: '/api/v1/manager/transactions/transfer',
    reportsSummary: '/reports/v1/summary',
    accountLimits: '/AccountLimitStatus',
    accountDetails: '/AccountDetailsMany',
    accountsOnline: '/AccountsOnline',
    positions: '/PositionsAll',
    ibUpdate: '/IBUpdate',
    ibDelete: '/IBDelete',
    ibLinkClient: '/IBLinkClient',
    ibUnlinkClient: '/IBUnlinkClient',
    ibCommissionPay: '/IBCommissionPay',
  });
});

test('versioned manager resource routes encode dynamic path segments', () => {
  assert.equal(buildManagerAccountEndpoint(200001), '/api/v1/manager/accounts/200001');
  assert.equal(buildManagerOrderCloseEndpoint(19916), '/api/v1/manager/orders/19916/close');
  assert.equal(
    buildManagerOrderStatusEndpoint(200001, 'web order/42'),
    '/api/v1/manager/accounts/200001/orders/by-client-id/web%20order%2F42',
  );
  assert.throws(() => buildManagerAccountEndpoint(''), /Account login is required/);
});

test('reports summary route supports the documented UTC report-day query', () => {
  assert.equal(buildReportsSummaryEndpoint(), '/reports/v1/summary');
  assert.equal(
    buildReportsSummaryEndpoint('2026-09-05'),
    '/reports/v1/summary?date=2026-09-05',
  );
  assert.throws(
    () => buildReportsSummaryEndpoint('2026-02-30'),
    /valid YYYY-MM-DD UTC date/,
  );
});
