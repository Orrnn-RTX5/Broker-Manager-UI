const KNOWN_ASSETS = [
  'USDT',
  'USDC',
  'BTC',
  'ETH',
  'SOL',
  'XRP',
  'BNB',
  'ADA',
  'DOGE',
  'LTC',
  'XAU',
  'XAG',
  'XPT',
  'XPD',
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CHF',
  'CAD',
  'AUD',
  'NZD',
  'SGD',
  'HKD',
  'NOK',
  'SEK',
  'DKK',
  'PLN',
  'TRY',
  'ZAR',
  'MXN',
  'CNH',
  'CNY',
  'INR',
];

const FIAT_ASSETS = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD',
  'SGD', 'HKD', 'NOK', 'SEK', 'DKK', 'PLN', 'TRY', 'ZAR',
  'MXN', 'CNH', 'CNY', 'INR',
]);

const METAL_ASSETS = new Set(['XAU', 'XAG', 'XPT', 'XPD']);
const CRYPTO_ASSETS = new Set(['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'ADA', 'DOGE', 'LTC', 'USDT', 'USDC']);

const ASSET_COLOR_MAP = {
  USD: '#10b981',
  EUR: '#f59e0b',
  GBP: '#a855f7',
  JPY: '#f43f5e',
  CHF: '#14b8a6',
  AUD: '#eab308',
  CAD: '#f97316',
  NZD: '#2dd4bf',
  XAU: '#fbbf24',
  XAG: '#cbd5e1',
  BTC: '#f7931a',
  ETH: '#c084fc',
};

const FALLBACK_PALETTE = [
  '#10b981',
  '#f59e0b',
  '#a855f7',
  '#f43f5e',
  '#14b8a6',
  '#f97316',
  '#eab308',
  '#ec4899',
];

const toFiniteNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export const formatAccountExposureSpaceNumber = (val, decimals = 2) => {
  const n = Number(val);
  if (val === null || val === undefined || val === '' || !Number.isFinite(n)) {
    return (0).toFixed(decimals);
  }
  const fixed = Math.abs(n).toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0 ? '-' : ''}${withSpaces}${decPart !== undefined ? `.${decPart}` : ''}`;
};

export const formatAccountExposureVolume = (asset, value) => {
  const num = toFiniteNumber(value, 0);
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  const code = String(asset || '').toUpperCase();

  if (FIAT_ASSETS.has(code)) {
    if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(2)}K`;
    return `${sign}${abs.toFixed(2)}`;
  }

  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}${(abs / 1_000).toFixed(2)}K`;
  if (abs >= 100) return `${sign}${abs.toFixed(2)}`;
  if (abs >= 1) return `${sign}${abs.toFixed(2)}`;
  if (abs === 0) return '0.00';
  return `${sign}${abs.toFixed(4).replace(/0+$/, '').replace(/\.$/, '.00')}`;
};

export const formatAccountExposureRate = (rate, { isAccountCurrency = false, digits = null } = {}) => {
  const num = toFiniteNumber(rate, 0);
  if (num <= 0) return '—';
  if (isAccountCurrency && Math.abs(num - 1) < 1e-6) return '1.00';
  if (Number.isInteger(digits) && digits >= 0 && digits <= 8) {
    return num.toFixed(Math.max(2, Math.min(5, digits)));
  }
  if (num >= 1000) return num.toFixed(2);
  if (num >= 10) return num.toFixed(3);
  return num.toFixed(5).replace(/0{1,3}$/, (match) => (match.length === 3 ? '0' : ''));
};

export const getAccountExposureAssetBadge = (asset) => {
  const code = String(asset || '').toUpperCase();
  if (code === 'USD' || code === 'USDT' || code === 'USDC' || code === 'CAD' || code === 'AUD' || code === 'NZD' || code === 'SGD' || code === 'HKD') {
    return { symbol: '$', tone: 'usd' };
  }
  if (code === 'EUR') return { symbol: '€', tone: 'eur' };
  if (code === 'GBP') return { symbol: '£', tone: 'gbp' };
  if (code === 'JPY' || code === 'CNY' || code === 'CNH') return { symbol: '¥', tone: 'jpy' };
  if (code === 'CHF') return { symbol: 'Fr', tone: 'chf' };
  if (code === 'XAU') return { symbol: 'Au', tone: 'metal' };
  if (code === 'XAG') return { symbol: 'Ag', tone: 'silver' };
  if (code === 'BTC') return { symbol: '₿', tone: 'crypto' };
  if (code === 'ETH') return { symbol: 'Ξ', tone: 'eth' };
  return { symbol: code.slice(0, 2) || '$', tone: 'default' };
};

export const getAccountExposureAssetColor = (asset, index = 0) => {
  const code = String(asset || '').toUpperCase();
  return ASSET_COLOR_MAP[code] || FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
};

export const parseAccountExposureSymbol = (rawSymbol) => {
  const raw = String(rawSymbol ?? '').trim();
  if (!raw) return null;
  const cleaned = raw
    .toUpperCase()
    .replace(/[._-](MICRO|MINI|STD|PRO|ECN|RAW|CASH|SPOT|FUT|PERP|M|C|I|R|Z)$/i, '')
    .replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return null;

  for (const base of KNOWN_ASSETS) {
    if (!cleaned.startsWith(base)) continue;
    const rest = cleaned.slice(base.length);
    for (const quote of KNOWN_ASSETS) {
      if (rest.startsWith(quote)) {
        return { base, quote: quote === 'USDT' ? 'USD' : quote };
      }
    }
  }

  if (cleaned.length >= 6 && /^[A-Z]{6}/.test(cleaned)) {
    return {
      base: cleaned.slice(0, 3),
      quote: cleaned.slice(3, 6),
    };
  }

  return {
    base: cleaned,
    quote: 'USD',
  };
};

export const resolvePositionContractSize = (position, spec, base, quote) => {
  const explicitPos = toFiniteNumber(
    position?.contractSize ?? position?.contract_size ?? position?.ContractSize,
    0
  );
  if (explicitPos > 0) return explicitPos;

  const explicitSpec = toFiniteNumber(
    spec?.contractSize ?? spec?.contract_size ?? spec?.ContractSize,
    0
  );
  if (explicitSpec > 0) return explicitSpec;

  if (base === 'XAU') return 100;
  if (base === 'XAG') return 5000;
  if (METAL_ASSETS.has(base)) return 100;
  if (CRYPTO_ASSETS.has(base)) return 1;
  if (FIAT_ASSETS.has(base) && FIAT_ASSETS.has(quote)) return 100000;
  return 1;
};

const readLiveQuotePrice = (spec) => {
  if (!spec || typeof spec !== 'object') return 0;
  const bid = toFiniteNumber(spec.bid ?? spec.Bid, 0);
  const ask = toFiniteNumber(spec.ask ?? spec.Ask, 0);
  if (bid > 0 && ask > 0) return (bid + ask) / 2;
  if (bid > 0) return bid;
  if (ask > 0) return ask;
  return toFiniteNumber(spec.last ?? spec.price ?? spec.rate, 0);
};

const resolvePositionSideDirection = (position) => {
  const raw = String(
    position?.type ?? position?.side ?? position?.action ?? position?.cmd ?? ''
  )
    .trim()
    .toLowerCase();
  if (!raw) return 0;
  if (raw === '0' || raw === 'buy' || raw === 'long' || raw.startsWith('buy')) return 1;
  if (raw === '1' || raw === 'sell' || raw === 'short' || raw.startsWith('sell')) return -1;
  return 0;
};

export function buildAccountExposureBreakdown({
  positions = [],
  symbols = {},
  accountCurrency = 'USD',
  balance = 0,
  equity = 0,
  margin = 0,
  freeMargin = 0,
  leverage = 100,
} = {}) {
  const depositCurrency = String(accountCurrency || 'USD').trim().toUpperCase() || 'USD';
  const safeBalance = toFiniteNumber(balance, 0);
  const safeEquity = toFiniteNumber(equity, safeBalance);
  const safeMargin = Math.max(0, toFiniteNumber(margin, 0));
  const safeFreeMargin = toFiniteNumber(freeMargin, safeEquity - safeMargin);
  const safeLeverage = Math.max(1, toFiniteNumber(leverage, 100));

  const specBySymbol = new Map();
  if (symbols && typeof symbols === 'object') {
    const entries = Array.isArray(symbols)
      ? symbols.map((item) => [item?.symbol || item?.name, item])
      : Object.entries(symbols);
    for (const [key, item] of entries) {
      const sym = String(item?.symbol || key || '').trim().toUpperCase();
      if (!sym) continue;
      specBySymbol.set(sym, item);
      const clean = sym.replace(/[^A-Z0-9]/g, '');
      if (clean && !specBySymbol.has(clean)) {
        specBySymbol.set(clean, item);
      }
    }
  }

  const parsedPositions = [];
  const safePositions = Array.isArray(positions) ? positions : [];

  for (const pos of safePositions) {
    const rawSymbol = String(pos?.symbol ?? pos?.Symbol ?? '').trim();
    if (!rawSymbol) continue;
    const direction = resolvePositionSideDirection(pos);
    const lots = Math.abs(
      toFiniteNumber(pos?.volume ?? pos?.lots ?? pos?.quantity ?? pos?.Volume, 0)
    );
    if (!direction || lots <= 0) continue;

    const parsed = parseAccountExposureSymbol(rawSymbol);
    if (!parsed) continue;

    const upperSym = rawSymbol.toUpperCase();
    const cleanSym = upperSym.replace(/[^A-Z0-9]/g, '');
    const spec = specBySymbol.get(upperSym) || specBySymbol.get(cleanSym) || null;

    const posPrice = toFiniteNumber(
      pos?.priceCurrent
        ?? pos?.currentPrice
        ?? pos?.price_current
        ?? pos?.current_price
        ?? readLiveQuotePrice(spec)
        ?? pos?.priceOpen
        ?? pos?.openPrice
        ?? pos?.price_open
        ?? pos?.open_price,
      0
    );
    if (posPrice <= 0) continue;

    const contractSize = resolvePositionContractSize(pos, spec, parsed.base, parsed.quote);
    const baseUnits = lots * contractSize;
    const digits = Number.isInteger(Number(spec?.digits ?? pos?.digits))
      ? Number(spec?.digits ?? pos?.digits)
      : null;

    // If base is the deposit currency (e.g. USDJPY on a USD account), the
    // foreign currency exposure leg is the quote currency (JPY).
    if (parsed.base === depositCurrency && parsed.quote && parsed.quote !== depositCurrency) {
      const quoteUnits = baseUnits * posPrice;
      const quoteRate = posPrice > 0 ? 1 / posPrice : 0;
      const notionalInDeposit = baseUnits;
      parsedPositions.push({
        asset: parsed.quote,
        volumeDelta: -direction * quoteUnits,
        direction: -direction,
        notionalValue: notionalInDeposit,
        rate: quoteRate,
        digits: 5,
      });
    } else {
      const notionalInDeposit =
        parsed.base === depositCurrency ? baseUnits : baseUnits * posPrice;
      parsedPositions.push({
        asset: parsed.base,
        volumeDelta: direction * baseUnits,
        direction,
        notionalValue: notionalInDeposit,
        rate: parsed.base === depositCurrency ? 1 : posPrice,
        digits,
      });
    }
  }

  const totalNotionalValue = parsedPositions.reduce(
    (sum, item) => sum + item.notionalValue,
    0
  );

  const buckets = new Map();
  const addLeg = (asset, volumeDelta, valueDelta, rate, digits = null) => {
    const code = String(asset || '').trim().toUpperCase();
    if (!code) return;
    const existing = buckets.get(code) || {
      asset: code,
      volume: 0,
      value: 0,
      rate: code === depositCurrency ? 1 : 0,
      digits: null,
    };
    existing.volume += volumeDelta;
    existing.value += valueDelta;
    if (rate > 0) existing.rate = rate;
    if (digits !== null && existing.digits === null) existing.digits = digits;
    buckets.set(code, existing);
  };

  for (const item of parsedPositions) {
    const marginVal =
      safeMargin > 0 && totalNotionalValue > 0
        ? (item.notionalValue / totalNotionalValue) * safeMargin
        : item.notionalValue / safeLeverage;
    const signedValue = (item.volumeDelta < 0 ? -1 : 1) * marginVal;
    addLeg(item.asset, item.volumeDelta, signedValue, item.rate, item.digits);
  }

  const nonCashLongExposure = Array.from(buckets.values())
    .filter((b) => b.asset !== depositCurrency && b.value > 0)
    .reduce((sum, b) => sum + b.value, 0);

  const cashBasis =
    safeFreeMargin > 0
      ? safeFreeMargin
      : safeEquity > 0
        ? safeEquity
        : safeBalance;
  const depositCurrencyValue = Math.max(0, cashBasis - nonCashLongExposure);

  if (depositCurrencyValue > 0.004) {
    addLeg(depositCurrency, depositCurrencyValue, depositCurrencyValue, 1, 2);
  }

  const rawRows = Array.from(buckets.values())
    .filter((row) => Math.abs(row.volume) > 1e-7 || Math.abs(row.value) > 1e-4)
    .sort((a, b) => {
      if (a.asset === depositCurrency) return -1;
      if (b.asset === depositCurrency) return 1;
      return Math.abs(b.value) - Math.abs(a.value) || a.asset.localeCompare(b.asset);
    });

  const maxAbsValue = Math.max(1, ...rawRows.map((row) => Math.abs(row.value)));
  const totalAbsValue = rawRows.reduce((sum, row) => sum + Math.abs(row.value), 0);
  const moneyDecimals = depositCurrency === 'JPY' ? 0 : 2;

  const rows = rawRows.map((row, idx) => {
    const absRatio = Math.min(1, Math.abs(row.value) / maxAbsValue);
    const barMagnitude = Math.abs(row.value) <= 1e-6 ? 0 : Math.max(8, Math.round(Math.pow(absRatio, 0.55) * 100));
    const barPct = row.value < 0 ? -barMagnitude : barMagnitude;
    const sharePct = totalAbsValue > 0 ? (Math.abs(row.value) / totalAbsValue) * 100 : 0;
    const color = getAccountExposureAssetColor(row.asset, idx);
    const badge = getAccountExposureAssetBadge(row.asset);
    const isAccountCurrency = row.asset === depositCurrency;

    return {
      asset: row.asset,
      badge,
      color,
      isAccountCurrency,
      volume: Number(row.volume.toFixed(6)),
      formattedVolume: formatAccountExposureVolume(row.asset, row.volume),
      rate: row.rate,
      formattedRate: formatAccountExposureRate(row.rate, {
        isAccountCurrency,
        digits: row.digits,
      }),
      value: Number(row.value.toFixed(2)),
      formattedValue: formatAccountExposureSpaceNumber(row.value, moneyDecimals),
      isNegative: row.value < -1e-6,
      barPct,
      sharePct,
      longValue: row.value > 0 ? Number(row.value.toFixed(2)) : 0,
      shortValue: row.value < 0 ? Number(Math.abs(row.value).toFixed(2)) : 0,
    };
  });

  const longRows = rows.filter((row) => row.longValue > 0);
  const shortRows = rows.filter((row) => row.shortValue > 0);
  const totalLongValue = Number(
    longRows.reduce((sum, row) => sum + row.longValue, 0).toFixed(2)
  );
  const totalShortValue = Number(
    shortRows.reduce((sum, row) => sum + row.shortValue, 0).toFixed(2)
  );
  const netValue = Number(
    rows.reduce((sum, row) => sum + row.value, 0).toFixed(2)
  );

  const longSlices = longRows.map((row) => {
    const ratio = totalLongValue > 0 ? row.longValue / totalLongValue : 0;
    return {
      asset: row.asset,
      color: row.color,
      value: row.longValue,
      signedValue: row.value,
      formattedValue: formatAccountExposureSpaceNumber(row.longValue, moneyDecimals),
      ratio,
      percentLabel: `${(ratio * 100).toFixed(1)}%`,
    };
  });

  const shortSlices = shortRows.map((row) => {
    const ratio = totalShortValue > 0 ? row.shortValue / totalShortValue : 0;
    return {
      asset: row.asset,
      color: row.color,
      value: row.shortValue,
      signedValue: row.value,
      formattedValue: formatAccountExposureSpaceNumber(row.value, moneyDecimals),
      ratio,
      percentLabel: `${(ratio * 100).toFixed(1)}%`,
    };
  });

  return {
    accountCurrency: depositCurrency,
    moneyDecimals,
    rows,
    longSlices,
    shortSlices,
    totalLongValue,
    totalShortValue,
    netValue,
    formattedTotalLong: formatAccountExposureSpaceNumber(totalLongValue, moneyDecimals),
    formattedTotalShort: formatAccountExposureSpaceNumber(-totalShortValue, moneyDecimals),
    formattedNetValue: formatAccountExposureSpaceNumber(netValue, moneyDecimals),
  };
}

export function easeOutCubic(progress) {
  const clamped = Math.max(0, Math.min(1, toFiniteNumber(progress, 1)));
  return 1 - Math.pow(1 - clamped, 3);
}

export function buildExposureChartSignature(side = 'long', slices = []) {
  const safeSide = side === 'short' ? 'short' : 'long';
  if (!Array.isArray(slices) || slices.length === 0) {
    return `${safeSide}:empty`;
  }
  const tokens = slices.map((slice) => {
    const asset = String(slice?.asset || '').trim().toUpperCase();
    const pct = (toFiniteNumber(slice?.ratio, 0) * 100).toFixed(1);
    const val = Math.round(toFiniteNumber(slice?.value, 0));
    return `${asset}:${pct}:${val}`;
  });
  return `${safeSide}:${tokens.join('|')}`;
}

export function interpolateExposureChartSlices(
  targetSlices = [],
  fromStateByAsset = {},
  rawProgress = 1,
  {
    isInitialEntrance = true,
    moneyDecimals = 2,
    reducedMotion = false,
  } = {}
) {
  const safeSlices = Array.isArray(targetSlices) ? targetSlices : [];
  const clampedProgress = reducedMotion
    ? 1
    : Math.max(0, Math.min(1, toFiniteNumber(rawProgress, 1)));
  const isStatic = clampedProgress >= 1 - 1e-4;
  const overallEased = isStatic ? 1 : easeOutCubic(clampedProgress);
  const rotationDeg = isStatic
    ? 0
    : Number(((isInitialEntrance ? -18 : -6) * (1 - overallEased)).toFixed(2));

  const slices = safeSlices.map((slice, idx) => {
    if (isStatic) {
      return {
        ...slice,
        animatedRatio: slice.ratio,
        animatedSignedValue: slice.signedValue,
        animatedFormattedValue: slice.formattedValue,
        animatedPercentLabel: slice.percentLabel,
        sliceProgress: 1,
      };
    }

    const prevEntry = fromStateByAsset?.[slice.asset] || null;
    const fromRatio = isInitialEntrance ? 0 : toFiniteNumber(prevEntry?.ratio, 0);
    const fromSignedValue = isInitialEntrance
      ? 0
      : toFiniteNumber(prevEntry?.signedValue, 0);

    const staggerOffset = isInitialEntrance ? Math.min(0.32, idx * 0.1) : 0;
    const localRaw =
      staggerOffset > 0
        ? Math.max(0, Math.min(1, (clampedProgress - staggerOffset) / (1 - staggerOffset)))
        : clampedProgress;
    const sliceProgress = easeOutCubic(localRaw);

    const animatedRatio = Math.max(
      0,
      Math.min(1, fromRatio + (slice.ratio - fromRatio) * sliceProgress)
    );
    const animatedSignedValue =
      fromSignedValue + (slice.signedValue - fromSignedValue) * sliceProgress;

    return {
      ...slice,
      animatedRatio,
      animatedSignedValue,
      animatedFormattedValue: formatAccountExposureSpaceNumber(
        animatedSignedValue,
        moneyDecimals
      ),
      animatedPercentLabel: `${(animatedRatio * 100).toFixed(1)}%`,
      sliceProgress,
    };
  });

  return {
    slices,
    isStatic,
    overallEased,
    rotationDeg,
  };
}

export function buildExposureContextMenuItems({
  chartSide = 'long',
  autoArrange = true,
  showGrid = true,
  onSelectChartSide,
  onCopyReport,
  onExportCsv,
  onExportHtml,
  onToggleAutoArrange,
  onToggleGrid,
} = {}) {
  const effectiveSide = chartSide === 'short' ? 'short' : 'long';
  return [
    {
      key: 'diagram',
      label: 'Diagram',
      submenu: [
        {
          key: 'diagram-long',
          label: 'Long Positions',
          checked: effectiveSide === 'long',
          onSelect: () => onSelectChartSide?.('long'),
        },
        {
          key: 'diagram-short',
          label: 'Short Positions',
          checked: effectiveSide === 'short',
          onSelect: () => onSelectChartSide?.('short'),
        },
      ],
    },
    { divider: true, key: 'div-1' },
    {
      key: 'report',
      label: 'Report',
      submenu: [
        {
          key: 'report-copy',
          label: 'Copy',
          shortcut: 'Ctrl+C',
          onSelect: () => onCopyReport?.(),
        },
        {
          key: 'report-csv',
          label: 'Export to CSV',
          onSelect: () => onExportCsv?.(),
        },
        {
          key: 'report-html',
          label: 'Export to HTML',
          onSelect: () => onExportHtml?.(),
        },
      ],
    },
    { divider: true, key: 'div-2' },
    {
      key: 'auto-arrange',
      label: 'Auto Arrange',
      shortcut: 'A',
      checked: Boolean(autoArrange),
      onSelect: () => onToggleAutoArrange?.(),
    },
    {
      key: 'grid',
      label: 'Grid',
      shortcut: 'G',
      checked: Boolean(showGrid),
      onSelect: () => onToggleGrid?.(),
    },
  ];
}
