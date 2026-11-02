// Manager endpoints verified against the live swagger-all.yaml contract.
// Keeping these high-traffic routes centralized makes accidental drift visible.
export const MANAGER_API = Object.freeze({
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

export const PENDING_ORDERS_ENDPOINT = '/api/v2/orders/pending';

const encodePathSegment = (value, label) => {
  const segment = String(value ?? '').trim();
  if (!segment) throw new TypeError(`${label} is required`);
  return encodeURIComponent(segment);
};

export const buildManagerAccountEndpoint = (login) =>
  `${MANAGER_API.accounts}/${encodePathSegment(login, 'Account login')}`;

export const buildManagerOrderCloseEndpoint = (ticket) =>
  `${MANAGER_API.orders}/${encodePathSegment(ticket, 'Order ticket')}/close`;

export const buildManagerOrderStatusEndpoint = (login, clientOrderId) =>
  `${buildManagerAccountEndpoint(login)}/orders/by-client-id/${encodePathSegment(clientOrderId, 'Client order ID')}`;

export const buildPendingOrderTicketEndpoint = (ticket, accountLogin) => {
  const base = `${PENDING_ORDERS_ENDPOINT}/${encodePathSegment(ticket, 'Pending order ticket')}`;
  if (accountLogin !== undefined && accountLogin !== null && String(accountLogin).trim() !== '') {
    return `${base}?account_login=${encodePathSegment(accountLogin, 'Account login')}`;
  }
  return base;
};

export const buildPendingOrdersListEndpoint = (accountLogin) =>
  `${PENDING_ORDERS_ENDPOINT}?account_login=${encodePathSegment(accountLogin, 'Account login')}`;

const REPORT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const buildReportsSummaryEndpoint = (date) => {
  const reportDate = String(date || '').trim();
  if (!reportDate) return MANAGER_API.reportsSummary;

  const parsedDate = new Date(`${reportDate}T00:00:00.000Z`);
  if (!REPORT_DATE_PATTERN.test(reportDate) || Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== reportDate) {
    throw new TypeError('Report date must be a valid YYYY-MM-DD UTC date');
  }

  return `${MANAGER_API.reportsSummary}?date=${encodeURIComponent(reportDate)}`;
};

export default MANAGER_API;
