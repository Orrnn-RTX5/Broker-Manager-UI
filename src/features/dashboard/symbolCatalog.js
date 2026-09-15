export function normalizeSymbolCatalog(response) {
  const rows = Array.isArray(response) ? response : response?.symbols ?? response?.data?.symbols ?? response?.data;
  if (!Array.isArray(rows)) throw new Error('The server returned an invalid symbol list.');
  const unique = new Map();
  for (const row of rows) {
    if (!row) continue;
    const symbol = String(typeof row === 'string' ? row : row.symbol ?? row.Symbol ?? row.name ?? row.Name ?? '').trim();
    if (symbol) unique.set(symbol, { symbol, description: String(row.description ?? row.Description ?? '') });
  }
  return [...unique.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}
