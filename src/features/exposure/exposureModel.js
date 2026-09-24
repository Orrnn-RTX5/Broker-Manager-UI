const number = (value) => value === null || value === undefined || value === '' || typeof value === 'boolean'
  ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const pick = (row, ...keys) => {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null) return row[key];
  return null;
};

// Only explicit quantities are mapped. A count of clients or an unqualified
// net volume must never be interpreted as asset units or USD notional.
export function normalizeExposure(payload) {
  const body = payload?.data ?? payload;
  const records = Array.isArray(body) ? body : body?.rows ?? body?.exposures ?? body?.items ?? body?.exposure;
  if (!Array.isArray(records)) throw new Error('The exposure response has an unsupported format. A documented rows array is required.');
  const seen = new Set();
  const rows = records.map((row) => {
    const asset = String(pick(row, 'asset', 'symbol', 'Asset', 'Symbol') ?? '').trim();
    if (!asset || seen.has(asset)) throw new Error('Exposure must contain one uniquely identified row per asset or symbol.');
    seen.add(asset);
    const clients = number(pick(row, 'clientQuantity', 'client_quantity'));
    const coverage = number(pick(row, 'coverageQuantity', 'coverage_quantity'));
    const suppliedNet = number(pick(row, 'netQuantity', 'net_quantity'));
    const net = suppliedNet ?? (clients !== null && coverage !== null ? clients + coverage : null);
    const suppliedRate = number(pick(row, 'usdRate', 'usd_rate'));
    const rate = suppliedRate !== null && suppliedRate > 0 ? suppliedRate : null;
    const netUsd = number(pick(row, 'netUsd', 'net_usd', 'netTotalUsd')) ?? (net !== null && rate !== null ? net * rate : null);
    return { asset, unit: String(row.unit ?? ''), clients, coverage, net, rate, netUsd,
      positiveUsd: netUsd === null ? null : Math.max(0, netUsd),
      netLots: number(pick(row, 'netLots', 'net_lots')) };
  });
  return { rows, asOf: body?.asOf ?? payload?.asOf ?? null,
    partial: body?.complete === false || body?.hasMore === true || (number(body?.total) !== null && Number(body.total) > rows.length) };
}

export function exposureTotals(rows) {
  const valued = rows.filter((row) => row.netUsd !== null);
  return { net: valued.reduce((sum, row) => sum + row.netUsd, 0),
    long: valued.reduce((sum, row) => sum + Math.max(0, row.netUsd), 0),
    short: valued.reduce((sum, row) => sum + Math.min(0, row.netUsd), 0),
    missing: rows.length - valued.length };
}

export function exposureCsv(rows) {
  const quote = (value) => `"${String(value ?? '').replace(/^[=+@\t\r]/, "'$&").replaceAll('"', '""')}"`;
  return [['Asset', 'Unit', 'Client quantity', 'Coverage quantity', 'Net quantity', 'USD rate', 'Net USD', 'Positive USD', 'Net lots'],
    ...rows.map((r) => [r.asset.startsWith('-') ? `'${r.asset}` : r.asset, r.unit, r.clients, r.coverage, r.net, r.rate, r.netUsd, r.positiveUsd, r.netLots])]
    .map((row) => row.map(quote).join(',')).join('\r\n');
}
