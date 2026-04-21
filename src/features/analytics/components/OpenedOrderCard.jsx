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

  const DetailItem = ({ icon: Icon, label, value, color = 'var(--text-2)', extra = null }) => (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--muted)' }}>
        {Icon && <Icon size={12} />}
        {label}
      </div>
      <div className="text-[13px] font-medium flex items-center gap-2" style={{ color }}>
        {value}
        {extra}
      </div>
    </div>
  );

  return (
    <div 
      className="group relative flex flex-col gap-5 p-5 rounded-lg border transition-all hover:shadow-lg"
      style={{ 
        background: 'var(--surface)', 
        borderColor: 'var(--border)',
        boxShadow: '0 4px 20px -10px rgba(0,0,0,0.1)'
      }}
    >
      {/* Header with Ticket and Side */}
      <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: 'var(--border-2)' }}>
        <div className="flex items-center gap-3">
          <div 
            className={`p-2 rounded-md ${isBuy ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}
          >
            <Activity size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>#{order.ticket}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${
                isBuy ? 'border-emerald-500/20 text-emerald-500 bg-emerald-500/5' : 'border-rose-500/20 text-rose-500 bg-rose-500/5'
              }`}>
                {order.side?.toUpperCase()}
              </span>
            </div>
            <div className="text-[11px]" style={{ color: 'var(--muted)' }}>{order.symbol}</div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-sm font-bold" style={{ color: profitTone }}>
            ${order.profit.toFixed(2)}
          </div>
          <div className="text-[10px] uppercase tracking-tighter font-bold" style={{ color: 'var(--muted)' }}>Profit</div>
        </div>
      </div>

      {/* Main Grid Details */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-y-5 gap-x-4">
        <DetailItem icon={User} label="Login ID" value={order.login} />
        <DetailItem icon={BarChart3} label="Lots / Vol." value={`${order.lots} Lot`} extra={<span style={{ color: 'var(--muted)' }}>({order.volume})</span>} />
        <DetailItem icon={DollarSign} label="Open Price" value={order.openPrice} />
        <DetailItem icon={DollarSign} label="Close Price" value={order.closePrice || '—'} />
        
        <DetailItem icon={Clock} label="Open Time" value={fmtDate(order.openTime)} />
        <DetailItem icon={Clock} label="Close Time" value={order.closeTime ? fmtDate(order.closeTime) : 'ACTIVE'} color={order.closeTime ? 'var(--text-2)' : 'var(--ok-text)'} />
        <DetailItem icon={Hash} label="Swap" value={order.swap.toFixed(2)} color={order.swap < 0 ? 'var(--danger-text)' : 'var(--text-2)'} />
        <DetailItem icon={Info} label="Commission" value={order.commission.toFixed(2)} />
      </div>

      {/* Footer State */}
      <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: 'var(--border-2)' }}>
        <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
          State: <span className="font-bold text-blue-500">{order.state?.toUpperCase()}</span>
        </div>

      </div>

      {/* Contextual Glow Effect based on side */}
      <div 
        className={`absolute -left-px top-1/4 bottom-1/4 w-[3px] rounded-r-full ${
          isBuy ? 'bg-emerald-500' : 'bg-rose-500'
        } opacity-50`}
      ></div>
    </div>
  );
};

export default OpenedOrderCard;
