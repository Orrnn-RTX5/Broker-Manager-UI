import { useMemo, useState } from 'react';
import useNotificationStore from '../../store/notificationStore';

const BASE_LOGS = [
  ['14:10:32', 'INFO', 'Server', 'Connected to RTX5-Live', '—', 'system', 'Latency: live'],
  ['14:09:18', 'INFO', 'Market', 'Symbol prices updated', '—', 'system', 'Streaming feed'],
  ['14:08:54', 'WARN', 'Risk Engine', 'Margin level below configured threshold', '1023487', 'system', 'Margin: 82.3%'],
  ['14:07:21', 'INFO', 'Dealing', 'Order executed', '1021203', 'trade', 'BUY XAUUSD'],
  ['14:06:33', 'INFO', 'Finance', 'Deposit received', '1020876', 'finance', 'Approved'],
  ['14:05:12', 'INFO', 'Compliance', 'KYC document approved', '1020411', 'reviewer', 'Identity verified'],
];

export default function TerminalDock() {
  const [activeTab, setActiveTab] = useState('Terminal');
  const notifications = useNotificationStore((state) => state.notifications);
  const tabs = useMemo(() => [
    ['Terminal', null], ['Audit Trail', null], ['Notifications', notifications.length || 3], ['Tasks', 5],
  ], [notifications.length]);
  const rows = activeTab === 'Notifications' && notifications.length
    ? notifications.map((item, index) => [new Date().toLocaleTimeString([], { hour12: false }), String(item.type || 'info').toUpperCase(), 'Application', item.message, '—', 'system', `Notification ${index + 1}`])
    : BASE_LOGS;

  return (
    <div className="cc-terminal">
      <div className="cc-terminal-tabs" role="tablist">
        {tabs.map(([label, count]) => (
          <button key={label} type="button" role="tab" aria-selected={activeTab === label} className={activeTab === label ? 'is-active' : ''} onClick={() => setActiveTab(label)}>
            {label}{count ? <b>{count}</b> : null}
          </button>
        ))}
        <div className="cc-terminal-filter">All Levels <span>⌄</span></div>
      </div>
      <div className="cc-terminal-table-wrap">
        <table className="cc-terminal-table">
          <thead><tr>{['Time', 'Level', 'Source', 'Message', 'Account', 'User', 'Details'].map((item) => <th key={item}>{item}</th>)}</tr></thead>
          <tbody>{rows.map((row, rowIndex) => (
            <tr key={`${row[0]}-${rowIndex}`}>{row.map((cell, index) => (
              <td key={index} className={index === 1 ? `is-${String(cell).toLowerCase()}` : ''}>{index === 1 ? <span>{cell}</span> : cell}</td>
            ))}</tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
