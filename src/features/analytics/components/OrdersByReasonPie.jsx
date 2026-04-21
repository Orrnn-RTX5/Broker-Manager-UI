import React from 'react';
import { Activity } from 'lucide-react';

const data = [
  { name: 'Mobile', value: 124, percentage: 95.38, color: '#7f56d9' }, // Using brand purple
  { name: 'Expert', value: 4, percentage: 3.0, color: '#f79009' }, // Using warn orange
  { name: 'Terminal', value: 2, percentage: 1.62, color: '#12b76a' }, // Using ok green
];

const OrdersByReasonGrid = () => {
  return (
    <div className="ui-card flex flex-col overflow-hidden h-full">
      <div className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        <div className="flex items-center gap-2">
          <Activity size={14} style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--text-2)' }}>Orders by Reason</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="ui-grid">
          <thead>
            <tr>
              <th className="text-left">Reason</th>
              <th className="text-right">Orders</th>
              <th className="text-right">Breakdown</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <tr key={item.name} className="group cursor-default">
                <td className="relative pl-5">
                  <div className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.color }}></div>
                  <span className="font-medium text-[var(--text-2)]">{item.name}</span>
                </td>
                <td className="tabular text-right font-mono" style={{ color: 'var(--text)' }}>
                  {item.value}
                </td>
                <td className="tabular text-right font-mono" style={{ color: 'var(--text-3)' }}>
                  {item.percentage.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2 bg-[var(--surface-2)] border-t border-[var(--border)] flex justify-between items-center">
         <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--muted)' }}>Total Orders</span>
         <span className="text-sm font-bold tabular" style={{ color: 'var(--text)' }}>130</span>
      </div>
    </div>
  );
};

export default OrdersByReasonGrid;
