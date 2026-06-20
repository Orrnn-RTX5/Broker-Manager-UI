const asRows = (value) => (Array.isArray(value) ? value : []);

export const toFiniteNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;

  const parsed = Number(value.trim().replace(/[\s,]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeText = (value) => String(value ?? '').trim();

const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const getOrderSide = (order = {}) => (
  normalizeText(order.side ?? order.Side ?? order.type ?? order.Type ?? order.action ?? order.Action).toLowerCase()
);

const getOrderLots = (order = {}) => {
  const lots = toFiniteNumber(order.lots ?? order.Lots);
  if (lots) return lots;

  const volume = toFiniteNumber(order.volume ?? order.Volume);
  return volume >= 100 ? volume / 10000 : volume;
};

export const getOrderReason = (order = {}) => (
  normalizeText(
    order.reason ??
    order.Reason ??
    order.comment ??
    order.Comment ??
    order.state ??
    order.State ??
    order.status ??
    order.Status
  ) || 'Unspecified'
);

export const buildOrderMetrics = (orders = []) => {
  const rows = asRows(orders);
  const symbols = new Set(rows.map((order) => normalizeText(order.symbol || order.Symbol)).filter(Boolean));

  return {
    totalOrders: rows.length,
    buyOrders: rows.filter((order) => getOrderSide(order) === 'buy').length,
    sellOrders: rows.filter((order) => getOrderSide(order) === 'sell').length,
    symbols: symbols.size,
    totalVolume: rows.reduce((total, order) => total + getOrderLots(order), 0),
    netProfit: roundMoney(rows.reduce((total, order) => total + toFiniteNumber(order.profit ?? order.Profit), 0)),
  };
};

export const buildOrdersByReason = (orders = [], limit = 6) => {
  const rows = asRows(orders);
  const total = rows.length;
  const counts = rows.reduce((acc, order) => {
    const reason = getOrderReason(order);
    acc.set(reason, (acc.get(reason) || 0) + 1);
    return acc;
  }, new Map());

  return [...counts.entries()]
    .map(([name, value]) => ({
      name,
      value,
      percentage: total > 0 ? (value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, limit);
};
