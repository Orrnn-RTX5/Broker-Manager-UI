// Position volumes are lots, except the documented extended-volume fields.
// Missing financial values remain unavailable; never sum different currencies.
export const readNumber = (row, keys) => {
  for (const key of keys) {
    const value = row?.[key];
    if (value == null || typeof value === 'boolean' || String(value).trim() === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
};

export const readText = (row, keys) => {
  for (const key of keys) {
    if (row?.[key] != null && String(row[key]).trim()) return String(row[key]).trim();
  }
  return '';
};
export const accountCurrency = (row) => readText(row, ['currency', 'Currency', 'accountCurrency', 'AccountCurrency']).toUpperCase();
export const positionLots = (row) => readNumber(row, ['lots', 'volume_lots', 'volume'])
  ?? (readNumber(row, ['volumeExt', 'Volume']) === null ? null : readNumber(row, ['volumeExt', 'Volume']) / 10000);
export const positionSide = (row) => {
  const side = readText(row, ['type', 'side', 'action', 'Action', 'Type', 'cmd', 'Cmd']).toLowerCase();
  if (['buy', 'deal_buy', '0'].includes(side)) return 'buy';
  if (['sell', 'deal_sell', '1'].includes(side)) return 'sell';
  return null;
};
export const positionOpenPrice = (row) => readNumber(row, [
  'priceOpen', 'price_open', 'PriceOpen', 'openPrice', 'OpenPrice', 'open_price', 'Price', 'price',
]);
export const positionCurrentPrice = (row) => readNumber(row, [
  'priceCurrent', 'price_current', 'PriceCurrent', 'currentPrice', 'CurrentPrice',
]);
export const symbolPriceDigits = (symbol, explicitDigits = null) => {
  if (Number.isInteger(explicitDigits) && explicitDigits >= 0 && explicitDigits <= 8) {
    return explicitDigits;
  }
  const sym = String(symbol || '').toUpperCase();
  if (/JPY/.test(sym)) return 3;
  if (/(JAP225|US30|US500|NAS100|UT100|SPX|GER40|DE30|UK100|AUS200|FRA40|EU50|HK50|XAU|XAG|GOLD|SILVER|BTC|ETH|LTC|XRP|BCH|SOL|DOGE|OIL|WTI|BRENT|NGAS)/.test(sym)) {
    return 2;
  }
  return 5;
};
const loginOf = (row) => readText(row, ['login', 'Login', 'account_login', 'accountLogin']);
const addKnown = (total, value) => total === null || value === null ? null : total + value;
const uniquePositions = (positions) => {
  const seen = new Set();
  return positions.filter((row) => {
    const ticket = readText(row, ['position', 'positionTicket', 'position_ticket', 'Position', 'ticket', 'Ticket']);
    if (!ticket || ticket === '0') return false;
    const key = `${loginOf(row)}:${ticket}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export function buildAccountSummary({ accounts = [], positions = [], positionsLoaded = true } = {}) {
  const byLogin = new Map();
  const makeRow = (login, account = {}) => {
    const equity = readNumber(account, ['equity', 'Equity']);
    const margin = readNumber(account, ['margin', 'Margin', 'used_margin']);
    const suppliedLevel = readNumber(account, ['marginLevel', 'MarginLevel', 'margin_level']);
    return { login, name: readText(account, ['Name', 'name', 'accountName', 'account_name']),
      group: readText(account, ['group', 'Group', 'accountGroup']), currency: accountCurrency(account),
      balance: readNumber(account, ['balance', 'Balance']), equity, margin,
      marginFree: readNumber(account, ['marginFree', 'MarginFree', 'free_margin', 'freeMargin']),
      marginLevel: margin > 0 ? (suppliedLevel === null || suppliedLevel === 0 ? equity === null ? null : equity / margin * 100 : suppliedLevel) : null,
      positions: positionsLoaded ? 0 : null, lots: positionsLoaded ? 0 : null, profit: positionsLoaded ? 0 : null };
  };
  for (const account of accounts) {
    const login = loginOf(account);
    if (login) byLogin.set(login, makeRow(login, account));
  }
  if (positionsLoaded) for (const position of uniquePositions(positions)) {
    const login = loginOf(position);
    if (!login) continue;
    const row = byLogin.get(login) || makeRow(login, position);
    row.positions += 1;
    row.lots = addKnown(row.lots, positionLots(position));
    row.profit = addKnown(row.profit, readNumber(position, ['profit', 'Profit']));
    byLogin.set(login, row);
  }
  return [...byLogin.values()].sort((a, b) => a.login.localeCompare(b.login, undefined, { numeric: true }));
}

export function buildSymbolExposure(positions = [], accounts = []) {
  const accountCurrencies = new Map(accounts.map((row) => [loginOf(row), accountCurrency(row)]));
  const symbols = new Map();
  for (const position of uniquePositions(positions)) {
    const symbol = readText(position, ['symbol', 'Symbol']);
    if (!symbol) continue;
    const row = symbols.get(symbol) || { symbol, positions: 0, logins: new Set(), buyLots: 0, sellLots: 0,
      sidesComplete: true, profit: 0, currencies: new Set() };
    const login = loginOf(position);
    const side = positionSide(position);
    const lots = positionLots(position);
    row.positions += 1;
    if (login) row.logins.add(login);
    if (!side || lots === null || lots < 0) row.sidesComplete = false;
    else if (side === 'buy') row.buyLots += lots;
    else row.sellLots += lots;
    row.profit = addKnown(row.profit, readNumber(position, ['profit', 'Profit']));
    row.currencies.add(accountCurrencies.get(login) || accountCurrency(position));
    symbols.set(symbol, row);
  }
  return [...symbols.values()].map((row) => {
    const currency = row.currencies.size === 1 ? [...row.currencies][0] : '';
    return { symbol: row.symbol, positions: row.positions, accounts: row.logins.size,
      buyLots: row.sidesComplete ? row.buyLots : null, sellLots: row.sidesComplete ? row.sellLots : null,
      netLots: row.sidesComplete ? row.buyLots - row.sellLots : null,
      profit: currency ? row.profit : null, currency, mixedCurrencies: row.currencies.size > 1 };
  }).sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export function buildMt5SymbolSummary(positions = []) {
  const symbols = new Map();
  for (const position of uniquePositions(positions)) {
    const symbol = readText(position, ['symbol', 'Symbol']);
    if (!symbol) continue;
    const existing = symbols.get(symbol) || {
      symbol,
      positions: 0,
      buyVolume: 0,
      buyPriceWeight: 0,
      buyPriceVolume: 0,
      sellVolume: 0,
      sellPriceWeight: 0,
      sellPriceVolume: 0,
      profit: 0,
      pointsProfit: 0,
      digits: null,
    };
    const side = positionSide(position);
    const lots = positionLots(position);
    const openPrice = positionOpenPrice(position);
    const currentPrice = positionCurrentPrice(position);
    const posProfit = readNumber(position, ['profit', 'Profit']);
    const posDigits = readNumber(position, ['digits', 'Digits']);

    existing.positions += 1;
    if (existing.digits === null && posDigits !== null && Number.isInteger(posDigits)) {
      existing.digits = posDigits;
    }
    const digits = symbolPriceDigits(symbol, existing.digits);
    const pointSize = Math.pow(10, -digits);

    if (lots !== null && lots > 0) {
      if (side === 'buy') {
        existing.buyVolume += lots;
        if (openPrice !== null && openPrice > 0) {
          existing.buyPriceWeight += lots * openPrice;
          existing.buyPriceVolume += lots;
          if (currentPrice !== null && currentPrice > 0 && pointSize > 0) {
            existing.pointsProfit += ((currentPrice - openPrice) / pointSize) * lots;
          }
        }
      } else if (side === 'sell') {
        existing.sellVolume += lots;
        if (openPrice !== null && openPrice > 0) {
          existing.sellPriceWeight += lots * openPrice;
          existing.sellPriceVolume += lots;
          if (currentPrice !== null && currentPrice > 0 && pointSize > 0) {
            existing.pointsProfit += ((openPrice - currentPrice) / pointSize) * lots;
          }
        }
      }
    }
    if (posProfit !== null) {
      existing.profit += posProfit;
      if ((currentPrice === null || currentPrice <= 0) && pointSize > 0) {
        existing.pointsProfit += posProfit;
      }
    }
    symbols.set(symbol, existing);
  }

  return [...symbols.values()]
    .map((row) => {
      const buyVolume = Number(row.buyVolume.toFixed(4));
      const sellVolume = Number(row.sellVolume.toFixed(4));
      const netVolume = Number((buyVolume - sellVolume).toFixed(4));
      const buyPrice = row.buyPriceVolume > 0 ? row.buyPriceWeight / row.buyPriceVolume : 0;
      const sellPrice = row.sellPriceVolume > 0 ? row.sellPriceWeight / row.sellPriceVolume : 0;
      const profit = Number(row.profit.toFixed(2));
      const pointsProfit = Number(row.pointsProfit.toFixed(1));
      const digits = symbolPriceDigits(row.symbol, row.digits);
      return {
        symbol: row.symbol,
        digits,
        positions: row.positions,
        coveragePositions: 0,
        buyVolume,
        coverageBuyVolume: 0,
        buyPrice,
        coverageBuyPrice: 0,
        sellVolume,
        coverageSellVolume: 0,
        sellPrice,
        coverageSellPrice: 0,
        netVolume,
        profit,
        pointsProfit,
        coverageProfit: 0,
        uncoveredProfit: profit,
      };
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

const ISO_CURRENCY_ORDER = [
  'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'NZD', 'USD',
  'SGD', 'HKD', 'NOK', 'SEK', 'DKK', 'PLN', 'TRY', 'ZAR',
  'MXN', 'CNH', 'CNY', 'RUB', 'INR', 'BRL', 'HUF', 'CZK',
  'ILS', 'KRW', 'TWD', 'THB',
];
const ISO_CURRENCIES = new Set(ISO_CURRENCY_ORDER);
const PRECIOUS_METALS = new Set(['XAU', 'XAG', 'XPT', 'XPD']);
const CRYPTO_ASSETS = new Set([
  'BTC', 'ETH', 'LTC', 'XRP', 'BCH', 'SOL', 'DOGE', 'ADA',
  'DOT', 'AVAX', 'LINK', 'MATIC', 'SHIB', 'BNB', 'TRX', 'TON',
  'UNI', 'XLM', 'ATOM', 'ETC', 'FIL', 'NEAR', 'APT', 'ARB', 'OP',
]);

const MT5_EXPOSURE_COLOR_BY_ASSET = {
  USD: '#2563eb',
  EUR: '#6366f1',
  GBP: '#10b981',
  CHF: '#06b6d4',
  JPY: '#f59e0b',
  AUD: '#3b82f6',
  CAD: '#14b8a6',
  NZD: '#8b5cf6',
  XAU: '#eab308',
  XAG: '#38bdf8',
  BTC: '#f97316',
  ETH: '#818cf8',
  ADA: '#0ea5e9',
  SOL: '#a855f7',
  XRP: '#2dd4bf',
  JAP225: '#f43f5e',
  UK100: '#06b6d4',
  US100: '#8b5cf6',
  US30: '#3b82f6',
  US500: '#10b981',
  'USOIL>': '#f59e0b',
  USOIL: '#f59e0b',
  BRA50: '#14b8a6',
};

const MT5_EXPOSURE_PALETTE = [
  '#2563eb', '#10b981', '#f59e0b', '#6366f1', '#06b6d4',
  '#8b5cf6', '#14b8a6', '#f97316', '#0ea5e9', '#eab308',
  '#ec4899', '#3b82f6', '#2dd4bf', '#a855f7', '#38bdf8',
  '#f43f5e', '#84cc16', '#60a5fa', '#34d399', '#fbbf24',
];

export function getExposureAssetColor(asset, index = 0) {
  const key = String(asset || '').trim().toUpperCase();
  if (MT5_EXPOSURE_COLOR_BY_ASSET[key]) {
    return MT5_EXPOSURE_COLOR_BY_ASSET[key];
  }
  let hash = index;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return MT5_EXPOSURE_PALETTE[hash % MT5_EXPOSURE_PALETTE.length];
}

export function formatMt5ExposureCompactQty(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '0';
  const num = Number(value);
  if (Math.abs(num) < 1e-9) return '0';
  const abs = Math.abs(num);
  if (abs >= 1_000_000) {
    return `${Number((num / 1_000_000).toFixed(6))}M`;
  }
  if (abs >= 1_000) {
    return `${Number((num / 1_000).toFixed(5))}K`;
  }
  return `${Number(num.toFixed(4))}`;
}

export function formatMt5SpaceGroupedInt(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '0';
  const rounded = Math.round(Number(value));
  if (Object.is(rounded, -0) || rounded === 0) return '0';
  const sign = rounded < 0 ? '-' : '';
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${digits}`;
}

export function formatMt5SpaceGroupedMoney(value, decimals = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '0.00';
  const num = Number(value);
  const precision = Number.isInteger(decimals) ? Math.max(0, Math.min(8, decimals)) : 2;
  const fixed = Math.abs(num).toFixed(precision);
  const [intPart, fracPart] = fixed.split('.');
  const groupedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const sign = num < -1e-9 ? '-' : '';
  return fracPart !== undefined ? `${sign}${groupedInt}.${fracPart}` : `${sign}${groupedInt}`;
}

export function formatMt5ExposureRate(rate, digits = null) {
  if (rate === null || rate === undefined || !Number.isFinite(Number(rate)) || Number(rate) <= 0) return '—';
  const num = Number(rate);
  if (Number.isInteger(digits) && digits >= 0 && digits <= 8) {
    const formatted = num.toFixed(Math.min(5, digits));
    return num >= 1000 && formatted.endsWith('.00') && Number.isInteger(num)
      ? String(Math.round(num))
      : formatted;
  }
  if (num >= 1000) {
    return Number.isInteger(Number(num.toFixed(2)))
      ? Number(num).toFixed(2).replace(/\.00$/, '')
      : Number(num).toFixed(2);
  }
  if (num >= 10) {
    return `${Number(num.toFixed(3))}`;
  }
  return `${Number(num.toFixed(5))}`;
}

const cleanSymbolToken = (symbol) => String(symbol || '')
  .trim()
  .replace(/(\.[a-z0-9]+|_[a-z0-9]+|#[a-z0-9]*|-.*)$/i, '')
  .replace(/[^A-Za-z0-9]/g, '')
  .toUpperCase();

const readSpecNumber = (spec, keys) => {
  if (!spec || typeof spec !== 'object') return null;
  for (const nestedKey of ['brokerSpecification', 'specification', 'spec', 'contract', 'trading_conditions', 'tradingConditions']) {
    const nested = spec[nestedKey];
    if (nested && typeof nested === 'object') {
      const val = readNumber(nested, keys);
      if (val !== null && val > 0) return val;
    }
  }
  const direct = readNumber(spec, keys);
  return direct !== null && direct > 0 ? direct : null;
};

const readSpecText = (spec, keys) => {
  if (!spec || typeof spec !== 'object') return '';
  for (const nestedKey of ['brokerSpecification', 'specification', 'spec', 'contract', 'trading_conditions', 'tradingConditions']) {
    const nested = spec[nestedKey];
    if (nested && typeof nested === 'object') {
      const val = readText(nested, keys);
      if (val) return val;
    }
  }
  return readText(spec, keys);
};

const readLiveSymbolPrice = (spec) => {
  if (!spec || typeof spec !== 'object') return null;
  const bid = readNumber(spec, ['bid', 'Bid', 'price_bid', 'priceBid']);
  const ask = readNumber(spec, ['ask', 'Ask', 'price_ask', 'priceAsk']);
  if (bid !== null && bid > 0) return bid;
  if (ask !== null && ask > 0) return ask;
  const last = readNumber(spec, ['last', 'Last', 'price', 'Price', 'close', 'Close']);
  return last !== null && last > 0 ? last : null;
};

const decomposeSymbolInstrument = (rawSymbol, spec = null, pos = null) => {
  const clean = cleanSymbolToken(rawSymbol);
  const explicitContract = readSpecNumber(spec, [
    'contract_size', 'contractSize', 'trade_contract_size', 'tradeContractSize', 'lot_size', 'lotSize', 'units_per_lot', 'unitsPerLot',
  ]) ?? readSpecNumber(pos, [
    'contract_size', 'contractSize', 'trade_contract_size', 'tradeContractSize', 'lot_size', 'lotSize',
  ]);
  const explicitBase = readSpecText(spec, ['base_currency', 'currency_base', 'baseCurrency', 'baseAsset']).toUpperCase();
  const explicitQuote = readSpecText(spec, ['quote_currency', 'currency_profit', 'profitCurrency', 'quoteCurrency']).toUpperCase();

  if (clean.length === 6) {
    const left = clean.slice(0, 3);
    const right = clean.slice(3, 6);
    if (ISO_CURRENCIES.has(left) && ISO_CURRENCIES.has(right)) {
      return {
        kind: 'fx',
        baseAsset: left,
        quoteCurrency: right,
        contractSize: explicitContract ?? 100_000,
      };
    }
    if (PRECIOUS_METALS.has(left) && ISO_CURRENCIES.has(right)) {
      const defaultMetalContract = left === 'XAG' ? 5_000 : 100;
      return {
        kind: 'metal',
        baseAsset: left,
        quoteCurrency: right,
        contractSize: explicitContract ?? defaultMetalContract,
      };
    }
  }

  const cryptoMatch = clean.match(/^([A-Z0-9]{2,5})(USDT|USD|EUR|GBP|JPY|CHF|CAD|AUD|NZD)$/);
  if (cryptoMatch && (CRYPTO_ASSETS.has(cryptoMatch[1]) || PRECIOUS_METALS.has(cryptoMatch[1]))) {
    const baseAsset = cryptoMatch[1];
    const quoteCurrency = cryptoMatch[2] === 'USDT' ? 'USD' : cryptoMatch[2];
    const defaultContract = PRECIOUS_METALS.has(baseAsset) ? (baseAsset === 'XAG' ? 5_000 : 100) : 1;
    return {
      kind: PRECIOUS_METALS.has(baseAsset) ? 'metal' : 'crypto',
      baseAsset,
      quoteCurrency,
      contractSize: explicitContract ?? defaultContract,
    };
  }

  if (explicitBase && explicitQuote && ISO_CURRENCIES.has(explicitBase) && ISO_CURRENCIES.has(explicitQuote)) {
    return {
      kind: 'fx',
      baseAsset: explicitBase,
      quoteCurrency: explicitQuote,
      contractSize: explicitContract ?? 100_000,
    };
  }

  return {
    kind: 'cfd',
    baseAsset: String(rawSymbol || '').trim(),
    quoteCurrency: (explicitQuote && ISO_CURRENCIES.has(explicitQuote)) ? explicitQuote : 'USD',
    contractSize: explicitContract ?? 1,
  };
};

export function buildMt5AssetExposure({
  positions = [],
  symbols = {},
  apiExposureRows = [],
  currency = 'USD',
} = {}) {
  const targetCurrency = String(currency || 'USD').trim().toUpperCase() || 'USD';
  const symbolSpecByRaw = new Map();
  const symbolSpecByClean = new Map();
  const livePriceByRaw = new Map();
  const livePriceByClean = new Map();

  if (symbols && typeof symbols === 'object') {
    for (const [key, entry] of Object.entries(symbols)) {
      const symName = String(entry?.symbol || key || '').trim();
      if (!symName) continue;
      const clean = cleanSymbolToken(symName);
      symbolSpecByRaw.set(symName.toUpperCase(), entry);
      if (clean) symbolSpecByClean.set(clean, entry);
      const price = readLiveSymbolPrice(entry);
      if (price !== null && price > 0) {
        livePriceByRaw.set(symName.toUpperCase(), price);
        if (clean) livePriceByClean.set(clean, price);
      }
    }
  }

  const dedupedPositions = uniquePositions(positions);
  for (const pos of dedupedPositions) {
    const symName = readText(pos, ['symbol', 'Symbol']);
    if (!symName) continue;
    const upper = symName.toUpperCase();
    const clean = cleanSymbolToken(symName);
    const posPrice = positionCurrentPrice(pos) ?? positionOpenPrice(pos);
    if (posPrice !== null && posPrice > 0) {
      if (!livePriceByRaw.has(upper)) livePriceByRaw.set(upper, posPrice);
      if (clean && !livePriceByClean.has(clean)) livePriceByClean.set(clean, posPrice);
    }
  }

  // Build dynamic USD conversion map (1 unit of asset -> USD)
  const usdRateByAsset = new Map([['USD', 1]]);
  const pairQuotes = [];

  for (const [clean, price] of livePriceByClean.entries()) {
    if (!price || price <= 0) continue;
    if (clean.length === 6) {
      const base = clean.slice(0, 3);
      const quote = clean.slice(3, 6);
      if ((ISO_CURRENCIES.has(base) || PRECIOUS_METALS.has(base) || CRYPTO_ASSETS.has(base)) && ISO_CURRENCIES.has(quote)) {
        pairQuotes.push({ base, quote, price });
        if (quote === 'USD') {
          usdRateByAsset.set(base, price);
        } else if (base === 'USD') {
          usdRateByAsset.set(quote, 1 / price);
        }
      }
    } else {
      const cryptoMatch = clean.match(/^([A-Z0-9]{2,5})(USDT|USD)$/);
      if (cryptoMatch && (CRYPTO_ASSETS.has(cryptoMatch[1]) || PRECIOUS_METALS.has(cryptoMatch[1]))) {
        usdRateByAsset.set(cryptoMatch[1], price);
      }
    }
  }

  // Resolve cross-pair rates dynamically if a currency only has a cross quote open
  for (let pass = 0; pass < 2; pass += 1) {
    for (const { base, quote, price } of pairQuotes) {
      if (!usdRateByAsset.has(base) && usdRateByAsset.has(quote)) {
        usdRateByAsset.set(base, price * usdRateByAsset.get(quote));
      } else if (!usdRateByAsset.has(quote) && usdRateByAsset.has(base)) {
        usdRateByAsset.set(quote, usdRateByAsset.get(base) / price);
      }
    }
  }

  // Also incorporate explicit rates from apiExposureRows if supplied
  if (Array.isArray(apiExposureRows)) {
    for (const row of apiExposureRows) {
      const asset = String(row?.asset || row?.symbol || '').trim();
      const rate = readNumber(row, ['rate', 'usdRate', 'usd_rate']);
      if (asset && rate !== null && rate > 0 && !usdRateByAsset.has(asset.toUpperCase())) {
        usdRateByAsset.set(asset.toUpperCase(), rate);
      }
    }
  }

  const buckets = new Map();
  const ensureBucket = (asset, meta = {}) => {
    const key = String(asset || '').trim();
    if (!key) return null;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        asset: key,
        isCurrency: ISO_CURRENCIES.has(key.toUpperCase()),
        clients: 0,
        coverage: 0,
        directPrice: null,
        digits: null,
        ...meta,
      };
      buckets.set(key, bucket);
    } else if (meta.directPrice && !bucket.directPrice) {
      bucket.directPrice = meta.directPrice;
    }
    if (meta.digits !== null && meta.digits !== undefined && bucket.digits === null) {
      bucket.digits = meta.digits;
    }
    return bucket;
  };

  for (const pos of dedupedPositions) {
    const rawSymbol = readText(pos, ['symbol', 'Symbol']);
    if (!rawSymbol) continue;
    const side = positionSide(pos);
    const lots = positionLots(pos);
    if (!side || lots === null || lots <= 0) continue;

    const upper = rawSymbol.toUpperCase();
    const clean = cleanSymbolToken(rawSymbol);
    const spec = symbolSpecByRaw.get(upper) || symbolSpecByClean.get(clean) || null;
    const instrument = decomposeSymbolInstrument(rawSymbol, spec, pos);
    const signedLots = side === 'buy' ? lots : -lots;
    const isCoverage = Boolean(
      pos?.isCoverage ||
      pos?.coverage ||
      String(pos?.book || '').toUpperCase() === 'LP' ||
      String(pos?.group || pos?.Group || '').toLowerCase().includes('coverage')
    );

    const openPrice = positionOpenPrice(pos) ?? positionCurrentPrice(pos) ?? livePriceByRaw.get(upper) ?? livePriceByClean.get(clean) ?? null;
    const currentPrice = livePriceByRaw.get(upper) ?? livePriceByClean.get(clean) ?? positionCurrentPrice(pos) ?? openPrice;
    const specDigits = readNumber(spec, ['digits', 'Digits']) ?? readNumber(pos, ['digits', 'Digits']);

    const baseQty = signedLots * instrument.contractSize;
    const baseBucket = ensureBucket(instrument.baseAsset, {
      isCurrency: ISO_CURRENCIES.has(instrument.baseAsset.toUpperCase()),
      directPrice: instrument.kind === 'cfd' ? currentPrice : null,
      digits: instrument.kind === 'cfd' ? (specDigits !== null ? Math.trunc(specDigits) : null) : null,
    });

    if (baseBucket) {
      if (isCoverage) baseBucket.coverage += baseQty;
      else baseBucket.clients += baseQty;
    }

    if (openPrice !== null && openPrice > 0 && instrument.quoteCurrency) {
      const quoteBucket = ensureBucket(instrument.quoteCurrency, {
        isCurrency: ISO_CURRENCIES.has(instrument.quoteCurrency.toUpperCase()),
      });
      if (quoteBucket) {
        const quoteLegQty = -baseQty * openPrice;
        if (isCoverage) quoteBucket.coverage += quoteLegQty;
        else quoteBucket.clients += quoteLegQty;
      }
    }
  }

  // Merge API exposure rows when present (e.g. coverage quantities or pre-aggregated server rows when positions are empty)
  if (Array.isArray(apiExposureRows) && apiExposureRows.length > 0) {
    const hasPositionBuckets = buckets.size > 0;
    for (const apiRow of apiExposureRows) {
      const asset = String(apiRow?.asset || apiRow?.symbol || '').trim();
      if (!asset) continue;
      const apiClients = readNumber(apiRow, ['clients', 'clientQuantity', 'client_quantity']);
      const apiCoverage = readNumber(apiRow, ['coverage', 'coverageQuantity', 'coverage_quantity']);
      const apiRate = readNumber(apiRow, ['rate', 'usdRate', 'usd_rate']);
      const existing = buckets.get(asset);
      if (existing) {
        if (apiCoverage !== null && Math.abs(existing.coverage) < 1e-9) {
          existing.coverage = apiCoverage;
        }
        if (apiRate !== null && apiRate > 0 && !existing.directPrice) {
          existing.directPrice = apiRate;
        }
      } else if (!hasPositionBuckets) {
        ensureBucket(asset, {
          isCurrency: ISO_CURRENCIES.has(asset.toUpperCase()),
          clients: apiClients ?? 0,
          coverage: apiCoverage ?? 0,
          directPrice: apiRate,
        });
      }
    }
  }

  const targetCurrencyUsdRate = usdRateByAsset.get(targetCurrency) ?? 1;

  const resolveAssetRate = (bucket) => {
    const upper = bucket.asset.toUpperCase();
    if (upper === targetCurrency) return 1;
    let usdRate = usdRateByAsset.get(upper) ?? null;
    if ((usdRate === null || usdRate <= 0) && bucket.directPrice !== null && bucket.directPrice > 0) {
      usdRate = bucket.directPrice;
    }
    if ((usdRate === null || usdRate <= 0) && livePriceByRaw.has(upper)) {
      usdRate = livePriceByRaw.get(upper);
    }
    if (usdRate === null || usdRate <= 0) return null;
    return targetCurrencyUsdRate > 0 ? usdRate / targetCurrencyUsdRate : usdRate;
  };

  const sortAssetsMt5Order = (a, b) => {
    const aUpper = a.asset.toUpperCase();
    const bUpper = b.asset.toUpperCase();
    const aCurrIdx = ISO_CURRENCY_ORDER.indexOf(aUpper);
    const bCurrIdx = ISO_CURRENCY_ORDER.indexOf(bUpper);
    if (aCurrIdx !== -1 && bCurrIdx !== -1) return aCurrIdx - bCurrIdx;
    if (aCurrIdx !== -1) return -1;
    if (bCurrIdx !== -1) return 1;
    return a.asset.localeCompare(b.asset, undefined, { numeric: true });
  };

  const allValuedRows = [...buckets.values()]
    .filter((b) => Math.abs(b.clients) > 1e-9 || Math.abs(b.coverage) > 1e-9)
    .sort(sortAssetsMt5Order)
    .map((bucket, idx) => {
      const clients = Number(bucket.clients.toFixed(6));
      const coverage = Number(bucket.coverage.toFixed(6));
      const net = Number((clients + coverage).toFixed(6));
      const rate = resolveAssetRate(bucket);
      const clientsUsd = rate !== null ? Number((clients * rate).toFixed(2)) : null;
      const coverageUsd = rate !== null ? Number((coverage * rate).toFixed(2)) : null;
      const netUsd = rate !== null ? Number((net * rate).toFixed(2)) : null;
      const positiveUsd = netUsd !== null && netUsd > 0 ? netUsd : null;
      const color = getExposureAssetColor(bucket.asset, idx);
      return {
        asset: bucket.asset,
        isCurrency: bucket.isCurrency,
        clients,
        coverage,
        net,
        rate,
        digits: bucket.digits,
        clientsUsd,
        coverageUsd,
        netUsd,
        positiveUsd,
        color,
      };
    });

  // In MT5, table rows exclude the valuation currency itself (e.g. USD when valuating in USD)
  // unless it is the only asset present, while the Pie Chart and Total footer include all assets.
  const nonBaseRows = allValuedRows.filter((row) => row.asset.toUpperCase() !== targetCurrency);
  const rawTableRows = nonBaseRows.length > 0 ? nonBaseRows : allValuedRows;

  const maxAbsUsd = Math.max(
    1,
    ...rawTableRows.map((row) =>
      Math.max(
        Math.abs(row.clientsUsd ?? row.clients ?? 0),
        Math.abs(row.netUsd ?? row.net ?? 0),
        Math.abs(row.coverageUsd ?? row.coverage ?? 0)
      )
    )
  );

  const computeSignedBarPct = (val) => {
    const num = Number(val);
    if (!Number.isFinite(num) || Math.abs(num) <= 1e-9) return 0;
    const ratio = Math.min(1, Math.abs(num) / maxAbsUsd);
    const pct = Math.max(14, Math.round(Math.pow(ratio, 0.45) * 96));
    return num < 0 ? -pct : pct;
  };

  const tableRows = rawTableRows.map((row) => ({
    ...row,
    clientsBarPct: computeSignedBarPct(row.clientsUsd ?? row.clients),
    netBarPct: computeSignedBarPct(row.netUsd ?? row.net),
  }));

  const valuedForTotals = allValuedRows.filter((row) => row.netUsd !== null);
  const netTotalValue = Number(valuedForTotals.reduce((sum, row) => sum + row.netUsd, 0).toFixed(2));
  const positiveTotalValue = Number(
    valuedForTotals.reduce((sum, row) => sum + (row.netUsd > 0 ? row.netUsd : 0), 0).toFixed(2)
  );
  const negativeTotalValue = Number(
    valuedForTotals.reduce((sum, row) => sum + (row.netUsd < 0 ? row.netUsd : 0), 0).toFixed(2)
  );

  const longChartSlices = buildMt5ExposureChartSlices(allValuedRows, { direction: 'long', basis: 'net' });
  const shortChartSlices = buildMt5ExposureChartSlices(allValuedRows, { direction: 'short', basis: 'net' });

  return {
    currency: targetCurrency,
    rows: tableRows,
    allRows: allValuedRows,
    maxAbsUsd,
    totals: {
      netUsd: netTotalValue,
      positiveUsd: positiveTotalValue,
      negativeUsd: negativeTotalValue,
    },
    longChartSlices,
    shortChartSlices,
  };
}

export function buildMt5ExposureChartSlices(allRows = [], { direction = 'long', basis = 'net' } = {}) {
  const metricKey = basis === 'clients' ? 'clientsUsd' : basis === 'coverage' ? 'coverageUsd' : 'netUsd';
  const fallbackKey = basis === 'clients' ? 'clients' : basis === 'coverage' ? 'coverage' : 'net';
  return (Array.isArray(allRows) ? allRows : [])
    .map((row, idx) => {
      const signedValue = row?.[metricKey] !== null && row?.[metricKey] !== undefined
        ? Number(row[metricKey])
        : Number(row?.[fallbackKey] ?? 0);
      return {
        asset: row.asset,
        signedValue,
        value: Math.abs(signedValue),
        netUsd: signedValue,
        color: row.color || getExposureAssetColor(row.asset, idx),
      };
    })
    .filter((item) => Number.isFinite(item.signedValue) && (direction === 'short' ? item.signedValue < -1e-9 : item.signedValue > 1e-9))
    .sort((a, b) => b.value - a.value);
}

export function getMt5ExposureDiagramTitle({ direction = 'long', basis = 'net' } = {}) {
  const prefix = basis === 'clients' ? 'Clients' : basis === 'coverage' ? 'Coverage' : 'Net';
  const suffix = direction === 'short' ? 'Shorts' : 'Longs';
  return `${prefix} ${suffix}`;
}

// Group thresholds require every page, not the Navigator's first page.
export async function collectTerminalGroups(fetchPage, { signal } = {}) {
  const groups = new Map();
  let offset = 0;
  for (let page = 0; page < 100; page += 1) {
    signal?.throwIfAborted();
    const result = await fetchPage({ limit: 100, offset, search: '', sort_by: 'name', sort_dir: 'asc' }, { signal });
    if (!Array.isArray(result?.rows)) throw new Error('Group settings are unavailable.');
    const before = groups.size;
    for (const row of result.rows) {
      const name = readText(row, ['name', 'Name', 'group', 'Group']).toLowerCase();
      if (name) groups.set(name, row);
    }
    if (!result.hasMore) return [...groups.values()];
    const next = result.nextOffset ?? offset + result.rows.length;
    if (next <= offset || groups.size === before) throw new Error('Group settings are incomplete.');
    offset = next;
  }
  throw new Error('Group settings are incomplete.');
}
