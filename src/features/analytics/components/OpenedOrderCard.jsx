import { Activity, BarChart3, Clock, DollarSign, Hash, Info, User, Wallet } from 'lucide-react';

const toFiniteNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;

  const parsed = Number(value.trim().replace(/[\s,]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatPrice = (value) => {
  const numericValue = toFiniteNumber(value);
  if (!numericValue) return '-';

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 5,
  }).format(numericValue);
};

const formatMoney = (value) => new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(toFiniteNumber(value));

const formatDate = (timestamp) => {
  if (!timestamp) return '-';
  const numericValue = toFiniteNumber(timestamp);
  const date = new Date(numericValue > 1e11 ? numericValue : numericValue * 1000);
  if (Number.isNaN(date.getTime())) return String(timestamp);

  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

const DetailItem = ({ icon: Icon, label, value, description, color = 'var(--text)' }) => (
  <div className="opened-order-detail min-w-0">
    <div
      className="opened-order-detail-label flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold"
      style={{ color: 'var(--text-3)' }}
    >
      {Icon && <Icon size={12} style={{ color: 'var(--accent)' }} />}
      {label}
    </div>
    <div className="opened-order-detail-value text-[14px] font-semibold tabular font-mono mt-1 truncate" style={{ color }}>
      {value}
    </div>
    <div className="opened-order-detail-description text-[11px] leading-snug mt-1" style={{ color: 'var(--muted)' }}>
      {description}
    </div>
  </div>
);

const OpenedOrderCard = ({ order }) => {
  const side = String(order.side || '').toLowerCase();
  const isBuy = side === 'buy';
  const isSell = side === 'sell';
  const profit = toFiniteNumber(order.profit);
  const swap = toFiniteNumber(order.swap);
  const commission = toFiniteNumber(order.commission);
  const costs = swap + commission;
  const profitTone = profit < 0 ? 'var(--danger-text)' : profit > 0 ? 'var(--ok-text)' : 'var(--text-3)';
  const badgeClass = isBuy ? 'ui-badge-success' : isSell ? 'ui-badge-danger' : 'ui-badge-info';
  const state = String(order.state || 'active').toUpperCase();

  return (
    <div className="opened-order-card ui-card flex flex-col p-5 gap-5 transition-all hover:shadow-md">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 pb-4 border-b border-[var(--border-2)]">
        <div className="flex items-start gap-3 min-w-0">
          <span className={`ui-badge ${badgeClass} px-2 py-1 shrink-0`}>
            <Activity size={14} />
            <span className="font-bold uppercase tracking-wider">{order.side || 'Order'}</span>
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="opened-order-ticket text-[15px] font-bold tabular" style={{ color: 'var(--text)' }}>
                #{order.ticket || '-'}
              </span>
              <span className="opened-order-symbol text-[13px] font-semibold" style={{ color: 'var(--accent-text)' }}>
                {order.symbol || '-'}
              </span>
              <span className="ui-badge ui-badge-neutral">{state}</span>
            </div>
            <div className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
              Ticket, symbol, direction, and current backend state.
            </div>
          </div>
        </div>

        <div className="md:text-right">
          <div className="opened-order-profit text-xl font-bold tabular font-mono" style={{ color: profitTone }}>
            {formatMoney(profit)}
          </div>
          <div className="opened-order-profit-label text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--muted)' }}>
            Floating P/L
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-y-5 gap-x-5">
        <DetailItem
          icon={User}
          label="Login"
          value={order.login || '-'}
          description="Trading account that owns this order."
        />
        <DetailItem
          icon={BarChart3}
          label="Size"
          value={`${formatMoney(order.lots)} lot`}
          description={`Order exposure. Raw volume ${order.volume || 0}.`}
        />
        <DetailItem
          icon={DollarSign}
          label="Entry Price"
          value={formatPrice(order.openPrice)}
          description="Price where the order was opened."
        />
        <DetailItem
          icon={DollarSign}
          label="Current / Close"
          value={formatPrice(order.closePrice)}
          description="Latest close/current price returned by backend."
        />
        <DetailItem
          icon={Clock}
          label="Open Time"
          value={formatDate(order.openTime)}
          description="Backend timestamp for when the order opened."
        />
        <DetailItem
          icon={Wallet}
          label="Costs"
          value={formatMoney(costs)}
          description="Swap plus commission for this order."
          color={costs < 0 ? 'var(--danger-text)' : 'var(--text)'}
        />
      </div>

      <div className="opened-order-footer flex items-center gap-2 pt-4 border-t border-[var(--border-2)] text-[11px]" style={{ color: 'var(--text-3)' }}>
        <Info size={12} style={{ color: 'var(--accent)' }} />
        <span>
          Showing the fields that matter for monitoring: ownership, direction, exposure, entry/current price, P/L, costs, and state.
        </span>
      </div>
    </div>
  );
};

export default OpenedOrderCard;
