import apiClient from './apiClient';

// ─── Online Users ──────────────────────────────────────────────────────────────
export const getOnlineUsers = async () => {
  return apiClient.get('/OnlineUsers');
};

// ─── Clients ───────────────────────────────────────────────────────────────────
export const getClients = async () => {
  return apiClient.get('/Accounts'); 
};

// ─── Trading Accounts ──────────────────────────────────────────────────────────
export const getTradingAccounts = async () => {
  const data = await apiClient.get('/AccountDetailsMany');
  const records = Array.isArray(data) ? data : data.answer || [];

  return records.map(p => ({
    login: String(p.login || p.Login || ''),
    name: p.Name || p.name || '',
    group: p.Group || p.group || '',
    country: p.Country || p.country || '',
    client: p.client || p.Client || '',
    balance: p.balance !== undefined ? p.balance : (p.Balance !== undefined ? p.Balance : 0),
    equity: p.equity !== undefined ? p.equity : (p.Equity !== undefined ? p.Equity : 0),
    profit: p.profit !== undefined ? p.profit : (p.Profit !== undefined ? p.Profit : 0),
    currency: p.Currency || p.currency || '',
    
    // NEW FIELDS FROM SWAGGER
    leverage: p.leverage || p.Leverage || 100,
    credit: p.credit || p.Credit || 0,
    status: p.status || p.Status || 'active',
    margin: p.margin || p.Margin || 0,
    marginFree: p.marginFree || p.MarginFree || 0,
    marginLevel: p.marginLevel || p.MarginLevel || 0,
    email: p.email || p.Email || '',
    firstName: p.firstName || p.FirstName || '',
    lastName: p.lastName || p.LastName || '',
  }));
};

export const getPositions = async () => {
  const data = await apiClient.get('/PositionsAll');
  const records = Array.isArray(data) ? data : data.answer || [];

  return records.map(p => {
    let type = 'unknown';
    if (typeof p.action === 'string') type = p.action.toLowerCase();
    else if (p.Action === 0 || p.action === 0) type = 'buy';
    else if (p.Action === 1 || p.action === 1) type = 'sell';

    let volume = p.lots !== undefined ? p.lots : (p.volumeExt !== undefined ? p.volumeExt : (p.Volume !== undefined ? p.Volume : 0));
    if (volume >= 100) volume = volume / 10000;

    return {
      position: p.positionTicket || p.Position || p.ticket || p.position || 0,
      login: String(p.login || p.Login || ''),
      name: p.accountName || p.AccountName || '',
      email: p.username || p.Username || '',
      group: p.accountGroup || p.AccountGroup || '',
      symbol: p.symbol || p.Symbol || '',
      type,
      volume,
      priceOpen: p.priceOpen || p.PriceOpen || p.Price || p.price || 0,
      priceCurrent: p.priceCurrent || p.PriceCurrent || 0,
      priceSl: p.priceSl || 0,
      priceTp: p.priceTp || 0,
      profit: p.profit || 0,
      comment: String(p.comment || p.Comment || ''),
      swap: p.storage || p.Storage || p.swap || p.Swap || 0,
      // NEW FIELDS FROM SWAGGER
      timeCreate: p.timeCreate || p.TimeCreate || 0,
      timeUpdate: p.timeUpdate || p.TimeUpdate || 0,
    };
  });
};

// ─── Analytics ─────────────────────────────────────────────────────────────────
export const getTradingAccountsAnalytics = async () => {
  return apiClient.get('/AccountAnalytics');
};

export const getOpenOrders = async () => {
  return apiClient.get('/OrdersAll');
};

export const getOrders = async () => {
  const data = await apiClient.get('/BrokerOrders?limit=100&offset=0');
  const records = Array.isArray(data) ? data : data.answer || [];

  return records.map(p => {
    let type = 'unknown';
    if (typeof p.type === 'string') type = p.type.toLowerCase();
    else if (p.type === 0) type = 'buy';
    else if (p.type === 1) type = 'sell';

    let volume = p.volume !== undefined ? p.volume : 0;
    if (volume >= 100) volume = volume / 10000;

    return {
      ticket: p.ticket || 0,
      login: String(p.login || ''),
      name: p.accountName || p.username || '',
      email: p.username || '',
      group: p.accountGroup || '',
      symbol: p.symbol || '',
      type,
      side: p.side || '',
      volume,
      priceOpen: p.priceOpen || 0,
      priceSl: p.priceSl || 0,
      priceTp: p.priceTp || 0,
      status: p.status || '',
      timeSetup: p.timeSetup || 0,
      timeDone: p.timeDone || 0,
      comment: String(p.comment || ''),
    };
  });
};

export const getBrokerDeals = async () => {
  const data = await apiClient.get('/BrokerDeals?limit=100&offset=0');
  const records = Array.isArray(data) ? data : data.answer || [];

  return records.map(p => ({
    ticket: p.ticket || 0,
    orderTicket: p.orderTicket || 0,
    login: String(p.login || ''),
    username: p.username || '',
    accountName: p.accountName || '',
    accountGroup: p.accountGroup || '',
    symbol: p.symbol || '',
    action: p.action || '',
    entry: p.entry || '',
    volume: p.volume !== undefined ? p.volume : 0,
    price: p.price || 0,
    profit: p.profit || 0,
    commission: p.commission || 0,
    swap: p.swap || 0,
    fee: p.fee || 0,
    time: p.time || 0,
    comment: String(p.comment || ''),
  }));
};

export const getOpenPositions = async () => {
  return apiClient.get('/PositionsAll');
};

export const getAdvertisingCampaigns = async () => {
  return apiClient.get('/AdvertisingCampaigns');
};

export default {
  getOnlineUsers,
  getClients,
  getTradingAccounts,
  getPositions,
  getTradingAccountsAnalytics,
  getOpenOrders,
  getOrders,
  getBrokerDeals,
  getOpenPositions,
  getAdvertisingCampaigns,
};
