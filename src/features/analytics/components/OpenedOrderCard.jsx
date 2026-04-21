import React from 'react';
import { Hash, User, Activity, Clock, DollarSign, BarChart3, Info } from 'lucide-react';

const OpenedOrderCard = ({ order }) => {
  const isBuy = order.side?.toLowerCase() === 'buy';
  const profitTone = order.profit < 0 ? 'var(--danger-text)' : order.profit > 0 ? 'var(--ok-text)' : 'var(--text-3)';

  const fmtDate = (ts) => {
    if (!ts) return '—';
    const dateObj = new Date(ts * 1000);
    return dateObj.toLocaleString('en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  };

  const DetailItem = ({ icon: Icon, label, value, color = 'var(--text)', extra = null }) => (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-3)' }}>
        {Icon && <Icon size={12} style={{ color: 'var(--accent)' }} />}
        {label}
      </div>
      <div className="text-[13px] font-medium flex items-center gap-1 tabular font-mono" style={{ color }}>
        {value}
        {extra && <span className="text-[11px] font-normal" style={{ color: 'var(--muted)' }}>{extra}</span>}
      </div>
    </div>
  );

  return (
    <div className="ui-card flex flex-col p-5 gap-5 transition-all hover:shadow-md">
      {/* Header with Ticket and Side */}
      <div className="flex items-center justify-between pb-4 border-b border-[var(--border-2)]">
        <div className="flex items-center gap-3">
          <div className={`ui-badge ${isBuy ? 'ui-badge-success' : 'ui-badge-danger'} px-2 py-1`}>
            <Activity size={14} />
            <span className="font-bold uppercase tracking-wider">{order.side}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold tabular" style={{ color: 'var(--text)' }}>#{order.ticket}</span>
              <span className="text-[13px] font-semibold" style={{ color: 'var(--accent-text)' }}>{order.symbol}</span>
            </div>
            <div className="text-[10px] uppercase tracking-widest font-medium" style={{ color: 'var(--muted)' }}>Order identification</div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-lg font-bold tabular font-mono" style={{ color: profitTone }}>
            ${Number(order.profit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--muted)' }}>Net Profit</div>
        </div>
      </div>

      {/* Main Grid Details */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-y-5 gap-x-4">
        <DetailItem icon={User} label="Login ID" value={order.login} />
        <DetailItem icon={BarChart3} label="Lots / Vol." value={`${order.lots} Lot`} extra={`(${order.volume})`} />
        <DetailItem icon={DollarSign} label="Open Price" value={order.openPrice} />
        <DetailItem icon={DollarSign} label="Close Price" value={order.closePrice || '—'} />

        <DetailItem icon={Clock} label="Open Time" value={fmtDate(order.openTime)} />
        <DetailItem icon={Clock} label="Close Time" value={order.closeTime ? fmtDate(order.closeTime) : 'ACTIVE'} color={order.closeTime ? 'var(--text)' : 'var(--ok-text)'} />
        <DetailItem icon={Hash} label="Swap" value={order.swap.toFixed(2)} color={order.swap < 0 ? 'var(--danger-text)' : 'var(--text)'} />
        <DetailItem icon={Info} label="Commission" value={order.commission.toFixed(2)} />
      </div>

      {/* Footer State */}
      <div className="flex items-center justify-between pt-4 border-t border-[var(--border-2)]">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
          <span className={`w-2 h-2 rounded-full ${order.state === 'filled' ? 'bg-[var(--ok)]' : 'bg-[var(--accent)]'} animate-pulse`}></span>
          State: <span className="font-bold" style={{ color: 'var(--text)' }}>{order.state?.toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
};

export default OpenedOrderCard;
