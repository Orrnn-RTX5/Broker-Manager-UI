import apiClient from './apiClient';

// ─── Online Users ──────────────────────────────────────────────────────────────
export const getOnlineUsers = async () => {
  return apiClient.get('/OnlineUsers');
};

// ─── Clients ───────────────────────────────────────────────────────────────────
export const getClients = async () => {
  const data = await apiClient.get('/AccountDetailsMany');
  const records = Array.isArray(data) ? data : data.answer || [];

  return records.map(p => ({
    id: String(p.login || p.Login || ''),
    name: p.Name || p.name || [p.FirstName || p.firstName, p.LastName || p.lastName].filter(Boolean).join(' ') || '',
    city: p.City || p.city || '',
    type: p.Type || p.type || 'Individual',
    status: p.status || p.Status || 'Active',
    lead: p.Lead || p.lead || '',
    email: p.email || p.Email || '',
    phone: p.phone || p.Phone || '',
    country: p.Country || p.country || '',
    balance: p.balance !== undefined ? p.balance : (p.Balance !== undefined ? p.Balance : 0),
  }));
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

export const getOpenedOrders = async (login) => {
  if (!login) return [];
  const data = await apiClient.get(`/OpenedOrders?logins[]=${login}`);
  const records = Array.isArray(data) ? data : data.answer || [];
  
  return records.map(p => ({
    ticket: p.ticket || 0,
    login: p.login || 0,
    symbol: p.symbol || '',
    side: p.side || '',
    volume: p.volume || 0,
    lots: p.lots || 0,
    openPrice: p.openPrice || 0,
    closePrice: p.closePrice || 0,
    openTime: p.openTime || 0,
    closeTime: p.closeTime || 0,
    profit: p.profit || 0,
    swap: p.swap || 0,
    commission: p.commission || 0,
    state: p.state || ''
  }));
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

// ─── IB Management ───────────────────────────────────────────────────────────
export const ibList            = ()       => apiClient.get('/IBList');
export const ibGet             = (login)  => apiClient.get(`/IBGet?login=${login}`);
export const ibCreate          = (body)   => apiClient.post('/IBCreate', body);
export const ibUpdate          = (body)   => apiClient.post('/IBUpdate', body);
export const ibDelete          = (login)  => apiClient.post('/IBDelete', { login });
export const ibLinkClient      = (body)   => apiClient.post('/IBLinkClient', body);
export const ibUnlinkClient    = (body)   => apiClient.post('/IBUnlinkClient', body);
export const ibClientList      = (login)  => apiClient.get(`/IBClientList?login=${login}`);
export const ibClientListAll   = (login)  => apiClient.get(`/IBClientListAll?login=${login}`);
export const ibPlanCreate      = (body)   => apiClient.post('/IBPlanCreate', body);
export const ibPlanList        = (login)  => apiClient.get(`/IBPlanList?login=${login}`);
export const ibCommissions     = (params) => apiClient.get(`/IBCommissions?${new URLSearchParams(params).toString()}`);
export const ibCommissionPay   = (body)   => apiClient.post('/IBCommissionPay', body);
export const ibStats           = (params) => apiClient.get(`/IBStats?${new URLSearchParams(params).toString()}`);
export const ibTree            = (login)  => apiClient.get(`/IBTree?login=${login}`);

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
