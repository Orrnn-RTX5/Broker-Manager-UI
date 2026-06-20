import { useMemo } from 'react';
import { Activity } from 'lucide-react';
import { buildOrdersByReason } from '../../../utils/orderAnalytics';

const COLORS = [
  'var(--accent)',
  'var(--ok)',
  'var(--warn)',
  'var(--info)',
  'var(--danger)',
  'var(--muted)',
];

const OrdersByReasonGrid = ({ orders = [] }) => {
  const data = useMemo(() => buildOrdersByReason(orders), [orders]);
  const total = orders.length;

  return (
    <div className="ui-card p-4">
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <Activity size={14} style={{ color: 'var(--accent)' }} />
          <div>
            <div className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--text-2)' }}>
              Order State
            </div>
            <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
              Backend state distribution for this login.
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 flex-1">
          {data.length === 0 ? (
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              No order rows available.
            </span>
          ) : (
            data.map((item, index) => (
              <div
                key={item.name}
                className="flex items-center gap-2 rounded-md px-3 py-2"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
                  {item.name}
                </span>
                <span className="text-xs tabular font-mono" style={{ color: 'var(--text-3)' }}>
                  {item.value} / {item.percentage.toFixed(0)}%
                </span>
              </div>
            ))
          )}
        </div>

        <div
          className="flex items-center justify-between lg:justify-end gap-2 lg:min-w-28"
          style={{ color: 'var(--text-3)' }}
        >
          <span className="text-[10px] uppercase tracking-widest font-bold">Total</span>
          <span className="text-sm font-bold tabular" style={{ color: 'var(--text)' }}>{total}</span>
        </div>
      </div>
    </div>
  );
};

export default OrdersByReasonGrid;
