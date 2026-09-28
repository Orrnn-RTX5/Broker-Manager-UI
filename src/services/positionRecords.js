export const getPositionTicket = (row) => String(
  row?.positionTicket ?? row?.position_ticket ?? row?.Position ?? row?.ticket ?? row?.Ticket ?? row?.position ?? '',
);

// Stream frames can contain only one ticket. Missing fields mean unchanged;
// explicit zeroes (profit, stops, volume) are real updates.
const mergePositionRecord = (previous, row) => {
  const record = { ...previous };
  const fields = {
    positionTicket: previous?.positionTicket ?? previous?.position_ticket ?? previous?.Position ?? previous?.ticket ?? previous?.Ticket ?? previous?.position
      ?? row.positionTicket ?? row.position_ticket ?? row.Position ?? row.ticket ?? row.Ticket ?? row.position,
    login: row.account_login ?? row.accountLogin ?? row.login ?? row.Login,
    username: row.username ?? row.Username ?? row.account_email ?? row.accountEmail ?? row.email ?? row.Email,
    accountName: row.accountName ?? row.AccountName ?? row.account_name ?? row.name ?? row.Name,
    accountGroup: row.accountGroup ?? row.AccountGroup ?? row.group ?? row.Group,
    symbol: row.symbol ?? row.Symbol,
    action: row.side ?? row.action ?? row.Action ?? row.type ?? row.Type,
    priceOpen: row.price_open ?? row.priceOpen ?? row.PriceOpen,
    priceCurrent: row.price_current ?? row.priceCurrent ?? row.PriceCurrent,
    priceSl: row.price_sl ?? row.priceSl ?? row.PriceSl ?? row.sl ?? row.SL,
    priceTp: row.price_tp ?? row.priceTp ?? row.PriceTp ?? row.tp ?? row.TP,
    storage: row.swap ?? row.storage ?? row.Storage ?? row.Swap,
    profit: row.profit ?? row.Profit,
    timeCreate: row.time_create ?? row.timeCreate ?? row.TimeCreate,
    timeUpdate: row.time_update ?? row.timeUpdate ?? row.TimeUpdate,
    comment: row.comment ?? row.Comment,
    reason: row.reason ?? row.Reason,
  };
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) record[key] = value;
  });
  const lots = row.lots ?? row.volume_lots ?? row.volume;
  const volumeExt = row.volumeExt ?? row.Volume;
  if (lots !== undefined && lots !== null) {
    record.lots = Number(lots);
    record.volumeExt = Number(lots) * 10000;
  } else if (volumeExt !== undefined && volumeExt !== null) {
    record.volumeExt = Number(volumeExt);
    record.lots = Number(volumeExt) / 10000;
  }
  return record;
};

export const mergePositionUpdates = (previous, updates) => {
  const byTicket = new Map(previous.map((row) => [getPositionTicket(row), row]));
  updates.forEach((row) => {
    const ticket = getPositionTicket(row);
    if (!ticket || ticket === '0') return;
    byTicket.set(ticket, mergePositionRecord(byTicket.get(ticket), row));
  });
  return [...byTicket.values()];
};

// HTTP determines membership, but updates received after its request began
// win for their tickets. This also retains trades opened during the request.
export const reconcilePositionSnapshot = (snapshot, current, isNewer) => {
  const byTicket = new Map(snapshot.map((row) => [getPositionTicket(row), row]));
  current.forEach((row) => {
    const ticket = getPositionTicket(row);
    if (isNewer(ticket)) {
      const fields = byTicket.has(ticket)
        ? Object.fromEntries(Object.entries(row).filter(([field]) => isNewer(ticket, field)))
        : row;
      byTicket.set(ticket, { ...byTicket.get(ticket), ...fields });
    }
  });
  return [...byTicket.values()];
};

export const normalizePositionRow = (p = {}) => {
  let type = 'unknown';
  if (typeof p.action === 'string') type = p.action.toLowerCase();
  else if (typeof p.side === 'string') type = p.side.toLowerCase();
  else if (typeof p.type === 'string') type = p.type.toLowerCase();
  else if (p.Action === 0 || p.action === 0 || p.cmd === 0 || p.Cmd === 0 || p.type === 0 || p.Type === 0) type = 'buy';
  else if (p.Action === 1 || p.action === 1 || p.cmd === 1 || p.Cmd === 1 || p.type === 1 || p.Type === 1) type = 'sell';

  if (type.includes('buy') || type.includes('deal_buy')) type = 'buy';
  else if (type.includes('sell') || type.includes('deal_sell')) type = 'sell';
  else if (type === 'unknown') type = 'buy';

  const normalizeLots = (row) => {
    if (row.lots != null) return Number(row.lots);
    if (row.volume_lots != null) return Number(row.volume_lots);
    if (row.volumeExt != null) return Number(row.volumeExt) / 10000;
    if (row.Volume != null) return Number(row.Volume) / 10000;
    return Number(row.volume ?? 0);
  };

  const volume = normalizeLots(p);

  const reasonRaw = p.reason ?? p.Reason ?? p.reason_type ?? p.comment ?? p.Comment ?? '';
  let reason = 'Client';
  if (typeof reasonRaw === 'number') {
    const reasonMap = { 0: 'Client', 1: 'Expert', 2: 'Dealer', 3: 'Signal', 4: 'Gateway', 5: 'Mobile', 6: 'Web', 7: 'Auto' };
    reason = reasonMap[reasonRaw] || 'Client';
  } else if (String(reasonRaw).toLowerCase().includes('expert') || String(reasonRaw).toLowerCase().includes('ea')) {
    reason = 'Expert';
  } else if (String(reasonRaw).toLowerCase().includes('mobile') || String(reasonRaw).toLowerCase().includes('ios') || String(reasonRaw).toLowerCase().includes('android')) {
    reason = 'Mobile';
  } else if (String(reasonRaw).toLowerCase().includes('dealer')) {
    reason = 'Dealer';
  } else if (String(reasonRaw).toLowerCase().includes('web')) {
    reason = 'Web';
  } else if (reasonRaw) {
    reason = String(reasonRaw);
  }

  return {
    position: p.positionTicket || p.position_ticket || p.Position || p.ticket || p.Ticket || p.position || 0,
    state_version: p.state_version ?? p.stateVersion,
    price_time_msc: p.price_time_msc,
    login: String(p.login || p.Login || p.account_login || p.accountLogin || ''),
    name: p.accountName || p.AccountName || p.account_name || p.name || p.Name || '',
    email: p.username || p.Username || p.account_email || p.accountEmail || p.email || p.Email || '',
    group: p.accountGroup || p.AccountGroup || p.group || p.Group || '',
    symbol: p.symbol || p.Symbol || '',
    type,
    volume,
    reason,
    priceOpen: p.priceOpen ?? p.price_open ?? p.PriceOpen ?? p.openPrice ?? p.OpenPrice ?? p.Price ?? p.price ?? 0,
    priceCurrent: p.priceCurrent ?? p.price_current ?? p.PriceCurrent ?? p.closePrice ?? p.ClosePrice ?? 0,
    priceSl: p.priceSl ?? p.price_sl ?? p.PriceSl ?? p.sl ?? p.SL ?? 0,
    priceTp: p.priceTp ?? p.price_tp ?? p.PriceTp ?? p.tp ?? p.TP ?? 0,
    profit: p.profit !== undefined ? p.profit : (p.Profit !== undefined ? p.Profit : 0),
    comment: String(p.comment || p.Comment || ''),
    swap: p.storage ?? p.Storage ?? p.swap ?? p.Swap ?? 0,
    timeCreate: p.timeCreate || p.TimeCreate || p.openTime || p.OpenTime || 0,
    timeUpdate: p.timeUpdate || p.TimeUpdate || p.closeTime || p.CloseTime || 0,
  };
};

