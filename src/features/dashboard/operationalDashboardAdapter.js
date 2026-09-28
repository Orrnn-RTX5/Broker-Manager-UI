// Presentation adapter for lower dashboard panels whose aggregate APIs are
// not connected yet. The KPI cards read manager data separately.
export const OPERATIONAL_DASHBOARD_PLACEHOLDERS = Object.freeze({
  approvalCount: 5,
  symbols: [
    ['XAUUSD', '12,482.50', '1,248', '28.4%'],
    ['EURUSD', '8,321.20', '931', '18.9%'],
    ['BTCUSD', '5,782.40', '620', '13.1%'],
    ['NAS100', '4,891.75', '542', '11.2%'],
    ['GBPUSD', '3,421.10', '401', '7.8%'],
  ],
  regions: [
    ['Asia', '38.2%', '9.1%'], ['Europe', '27.6%', '4.7%'],
    ['North America', '18.4%', '4.7%'], ['South America', '9.1%', '1.8%'], ['MENA', '6.7%', '2.0%'],
  ],
  approvals: [
    ['Withdrawal', '$25,000', '14:03', 'Pending'],
    ['New Account', '#1023487', '13:52', 'Review'],
    ['IB Application', 'John Carter', '12:41', 'Pending'],
    ['Limit Increase', '#1021203', '11:18', 'Review'],
    ['KYC Document', 'Maria S.', '10:33', 'Pending'],
  ],
});
