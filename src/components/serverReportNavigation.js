// Report folders visible in the supplied Manager navigator reference.
// These reports have no corresponding manager views/data sources yet.
// The reference clips the individual "Lifetime Value Detailed by ..."
// suffixes, so keep one entry until the exact breakdown names are supplied.
export const SERVER_REPORT_FOLDERS = [
  {
    label: 'Accounts',
    reports: [
      'Accounts Groups',
      'Accounts Growth',
      'Accounts Lifetime by Country',
      'Accounts Assets and Liabilities',
      'Accounts Stop Out Statistics',
      'Accounts Lifetime',
      'Clients Statistics',
    ],
  },
  {
    label: 'Capital',
    reports: [
      'First Time Deposit',
      'First Time Deposit Daily',
      'First Time Deposit Amount',
      'Lifetime Value',
      'Lifetime Value Daily',
      'Lifetime Value Detailed',
      'Money Flow Daily',
      'Money Flow Daily by Lead Source',
      'Money Flow Daily by Lead Campaign',
      'Money Flow Daily by Country',
      'Money Flow Weekly',
      'Clients Activity',
      'Retention of Clients',
      'Retention of Trading Accounts',
    ],
  },
  {
    label: 'Daily',
    reports: [
      'Daily Trades',
      'Daily Server Logs',
      'Daily Dealing',
      'Daily Expert Advisors',
      'Daily Orders',
    ],
  },
  {
    label: 'Trades',
    reports: [
      'Trade Accounts',
      'Trade Modifications',
      'Agents Detailed',
      'StopOut Compensations',
      'Fast Profit Deals',
      'Trade Groups Statistics',
      // The reference clips the suffixes of three different summary reports.
      'Trade Performance Summary',
      'Autotrading Statistics',
      'Abook & Bbook Exposure',
      'Trade Transactions',
    ],
  },
  {
    label: 'Ultency',
    reports: [
      'Turnover by LP',
      'LP Slippage by Symbols',
      'LP Imbalance',
      'Markouts Report',
    ],
  },
];
