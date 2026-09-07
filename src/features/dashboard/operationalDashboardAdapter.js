// Presentation adapter for aggregates that the current manager backend does
// not expose yet. Live account/position/equity/deposit fields always override
// these values in Dashboard.jsx.
export const OPERATIONAL_DASHBOARD_PLACEHOLDERS = Object.freeze({
  marginExposure: 68.3,
  activeServers: 2,
  totalServers: 2,
  riskScore: 22,
  approvalCount: 5,
  activity: [
    { time: '00:00', volume: 420, equity: 2310000 },
    { time: '02:00', volume: 690, equity: 2335000 },
    { time: '04:00', volume: 510, equity: 2358000 },
    { time: '06:00', volume: 330, equity: 2320000 },
    { time: '08:00', volume: 470, equity: 2362000 },
    { time: '10:00', volume: 735, equity: 2400000 },
    { time: '12:00', volume: 590, equity: 2412000 },
    { time: '14:00', volume: 840, equity: 2440000 },
    { time: '16:00', volume: 720, equity: 2431000 },
    { time: '18:00', volume: 505, equity: 2468000 },
    { time: '20:00', volume: 890, equity: 2482000 },
    { time: '22:00', volume: 630, equity: 2505000 },
    { time: '24:00', volume: 380, equity: 2540000 },
  ],
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
