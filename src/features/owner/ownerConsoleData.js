// Workflow shortcuts for owner-console aggregates that are not exposed by the
// current manager API. They open real review workspaces instead of presenting
// preview rows as live backend notifications.
export const OWNER_CONSOLE_ALERTS = Object.freeze([
  {
    id: 'risk-controls',
    title: 'Risk controls',
    description: 'Inspect restricted accounts and current protection rules.',
    meta: 'Risk review',
    action: 'Review risk',
    path: '/dealer/restrictions',
    tone: 'danger',
    icon: 'shield',
  },
  {
    id: 'dealer-queue',
    title: 'Dealer queue',
    description: 'Check pending trade requests that need dealer attention.',
    meta: 'Operations',
    action: 'Open queue',
    path: '/dealer/queue',
    tone: 'warning',
    icon: 'queue',
  },
  {
    id: 'position-exposure',
    title: 'Position exposure',
    description: 'Review open positions and current market exposure.',
    meta: 'Live positions',
    action: 'View exposure',
    path: '/analytics/open-positions',
    tone: 'info',
    icon: 'activity',
  },
]);

export const OWNER_CONSOLE_APPROVALS = Object.freeze([
  {
    id: 'withdrawals',
    title: 'Withdrawal review',
    description: 'Inspect dealing activity related to client withdrawals.',
    meta: 'Finance',
    action: 'Review activity',
    path: '/dealing',
    tone: 'warning',
    icon: 'finance',
  },
  {
    id: 'accounts',
    title: 'Account review',
    description: 'Review trading accounts and client account status.',
    meta: 'Accounts',
    action: 'Open accounts',
    path: '/clients/trading-accounts',
    tone: 'info',
    icon: 'account',
  },
  {
    id: 'ib-applications',
    title: 'IB applications',
    description: 'Review introducing-broker accounts and applications.',
    meta: 'IB management',
    action: 'Manage IBs',
    path: '/ib',
    tone: 'success',
    icon: 'ib',
  },
  {
    id: 'dealer-requests',
    title: 'Dealer requests',
    description: 'Accept or reject requests waiting in the dealer queue.',
    meta: 'Dealing',
    action: 'Open queue',
    path: '/dealer/queue',
    tone: 'danger',
    icon: 'queue',
  },
  {
    id: 'client-verification',
    title: 'Client verification',
    description: 'Open the client workspace to review account details.',
    meta: 'Clients',
    action: 'View clients',
    path: '/clients',
    tone: 'info',
    icon: 'client',
  },
]);

export const OWNER_CONSOLE_PLACEHOLDERS = Object.freeze({
  approvalCount: OWNER_CONSOLE_APPROVALS.length,
  alertCount: OWNER_CONSOLE_ALERTS.length,
});
