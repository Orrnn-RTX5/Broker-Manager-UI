export const DEFAULT_MW_COLUMNS = {
  bid: true,
  ask: true,
  spread: true,
  highLow: false,
  time: false,
  volume: false,
};

export const MT5_SYMBOL_PROFILES = [
  { id: 'Default', label: 'Default' },
  { id: 'Forex', label: 'Forex' },
  { id: 'Metals', label: 'Metals' },
  { id: 'Indices', label: 'Indices' },
  { id: 'Crypto', label: 'Crypto' },
];

export function matchesSymbolProfile(symbolName, profileId = 'Default', category = '') {
  if (!profileId || profileId === 'Default') return true;
  const sym = String(symbolName || '').toUpperCase();
  const cat = String(category || '').toUpperCase();
  if (profileId === 'Metals') {
    return cat.includes('METAL') || /^(XAU|XAG|XPT|XPD|GOLD|SILVER)/.test(sym);
  }
  if (profileId === 'Crypto') {
    return cat.includes('CRYPTO') || /^(BTC|ETH|SOL|XRP|ADA|DOT|DOGE|LTC|BNB|AVAX)/.test(sym);
  }
  if (profileId === 'Indices') {
    return (
      cat.includes('INDEX')
      || cat.includes('INDICES')
      || /^(US30|US100|US500|UK100|GER40|DE40|FRA40|EU50|JAP225|JP225|AUS200|HKG33|HK50|BRA50|USTEC|NAS100|SPX500)/.test(sym)
    );
  }
  if (profileId === 'Forex') {
    return (
      cat.includes('FOREX')
      || cat.includes('FX')
      || (/^[A-Z]{6}$/.test(sym) && !/^(XAU|XAG|XPT|XPD|BTC|ETH|SOL|XRP|ADA|DOT|LTC|BNB)/.test(sym))
    );
  }
  return true;
}

export function exportMarketWatchCsv(rows = [], filename = 'market-watch-quotes.csv') {
  if (typeof document === 'undefined') return;
  const header = ['Symbol', 'Bid', 'Ask', 'Spread', 'Time'];
  const escapeCsv = (val) => {
    const str = String(val ?? '');
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [
    header.join(','),
    ...rows.map((row) => [
      escapeCsv(row.symbol),
      escapeCsv(row.bid),
      escapeCsv(row.ask),
      escapeCsv(row.spread),
      escapeCsv(row.time || ''),
    ].join(',')),
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildMt5SymbolContextMenuItems({
  symbolName = '',
  activeProfile = 'Default',
  onSelectProfile,
  showRawQuotes = false,
  onToggleRawQuotes,
  onOpenDetails,
  onOpenTickChart,
  onOpenSpecification,
  onHideSymbol,
  onHideAllSymbols,
  onShowAllSymbols,
  onOpenSymbolsDialog,
  sortField = 'Default',
  onSelectSortField,
  onExportCsv,
  useSystemColors = false,
  onToggleSystemColors,
  showMilliseconds = false,
  onToggleMilliseconds,
  trackRequests = true,
  onToggleTrackRequests,
  autoArrange = true,
  onToggleAutoArrange,
  showGrid = true,
  onToggleGrid,
  columns = DEFAULT_MW_COLUMNS,
  onToggleColumn,
} = {}) {
  const resolvedColumns = { ...DEFAULT_MW_COLUMNS, ...(columns || {}) };

  return [
    {
      key: 'properties',
      label: 'Properties',
      icon: 'properties',
      onSelect: () => onOpenSpecification?.(symbolName),
    },
    {
      key: 'profiles',
      label: 'Profiles',
      submenu: MT5_SYMBOL_PROFILES.map((profile) => ({
        key: `profile-${profile.id}`,
        label: profile.label,
        checked: activeProfile === profile.id,
        onSelect: () => onSelectProfile?.(profile.id),
      })),
    },
    { divider: true },
    {
      key: 'show-raw-quotes',
      label: 'Show Raw Quotes',
      icon: 'raw-quotes',
      checked: Boolean(showRawQuotes),
      onSelect: () => onToggleRawQuotes?.(),
    },
    {
      key: 'details',
      label: 'Details',
      icon: 'details',
      onSelect: () => onOpenDetails?.(symbolName),
    },
    {
      key: 'tick-chart',
      label: 'Tick Chart',
      icon: 'tick-chart',
      onSelect: () => onOpenTickChart?.(symbolName),
    },
    {
      key: 'dom',
      label: 'Depth Of Market',
      icon: 'dom',
      shortcut: 'Alt+B',
      disabled: true,
    },
    {
      key: 'specification',
      label: 'Specification',
      icon: 'specification',
      onSelect: () => onOpenSpecification?.(symbolName),
    },
    { divider: true },
    {
      key: 'hide',
      label: 'Hide',
      shortcut: 'Delete',
      muted: true,
      disabled: !symbolName,
      onSelect: () => {
        if (symbolName) onHideSymbol?.(symbolName);
      },
    },
    {
      key: 'hide-all',
      label: 'Hide All',
      onSelect: () => onHideAllSymbols?.(symbolName),
    },
    {
      key: 'show-all',
      label: 'Show All',
      onSelect: () => onShowAllSymbols?.(),
    },
    {
      key: 'symbols',
      label: 'Symbols',
      icon: 'symbols',
      shortcut: 'Ctrl+U',
      onSelect: () => onOpenSymbolsDialog?.(),
    },
    {
      key: 'sort',
      label: 'Sort',
      submenu: [
        {
          key: 'sort-symbol',
          label: 'Symbol',
          checked: sortField === 'Symbol',
          onSelect: () => onSelectSortField?.('Symbol'),
        },
        {
          key: 'sort-bid',
          label: 'Bid',
          checked: sortField === 'Bid',
          onSelect: () => onSelectSortField?.('Bid'),
        },
        {
          key: 'sort-ask',
          label: 'Ask',
          checked: sortField === 'Ask',
          onSelect: () => onSelectSortField?.('Ask'),
        },
        {
          key: 'sort-spread',
          label: 'Spread',
          checked: sortField === 'Spread',
          onSelect: () => onSelectSortField?.('Spread'),
        },
        { divider: true },
        {
          key: 'sort-default',
          label: 'Reset Sort',
          checked: !sortField || sortField === 'Default',
          onSelect: () => onSelectSortField?.('Default'),
        },
      ],
    },
    {
      key: 'export',
      label: 'Export',
      icon: 'export',
      onSelect: () => onExportCsv?.(),
    },
    { divider: true },
    {
      key: 'use-system-colors',
      label: 'Use System Colors',
      checked: Boolean(useSystemColors),
      onSelect: () => onToggleSystemColors?.(),
    },
    {
      key: 'show-milliseconds',
      label: 'Show Milliseconds',
      checked: Boolean(showMilliseconds),
      onSelect: () => onToggleMilliseconds?.(),
    },
    {
      key: 'track-requests',
      label: 'Track Requests',
      checked: Boolean(trackRequests),
      onSelect: () => onToggleTrackRequests?.(),
    },
    {
      key: 'auto-arrange',
      label: 'Auto Arrange',
      checked: Boolean(autoArrange),
      onSelect: () => onToggleAutoArrange?.(),
    },
    {
      key: 'grid',
      label: 'Grid',
      checked: Boolean(showGrid),
      onSelect: () => onToggleGrid?.(),
    },
    { divider: true },
    {
      key: 'columns',
      label: 'Columns',
      submenu: [
        {
          key: 'col-bid',
          label: 'Bid',
          checked: Boolean(resolvedColumns.bid),
          onSelect: () => onToggleColumn?.('bid'),
        },
        {
          key: 'col-ask',
          label: 'Ask',
          checked: Boolean(resolvedColumns.ask),
          onSelect: () => onToggleColumn?.('ask'),
        },
        {
          key: 'col-spread',
          label: 'Spread',
          checked: Boolean(resolvedColumns.spread),
          onSelect: () => onToggleColumn?.('spread'),
        },
        {
          key: 'col-high-low',
          label: 'High / Low',
          checked: Boolean(resolvedColumns.highLow),
          onSelect: () => onToggleColumn?.('highLow'),
        },
        {
          key: 'col-time',
          label: 'Time',
          checked: Boolean(resolvedColumns.time),
          onSelect: () => onToggleColumn?.('time'),
        },
        {
          key: 'col-volume',
          label: 'Volume',
          checked: Boolean(resolvedColumns.volume),
          onSelect: () => onToggleColumn?.('volume'),
        },
      ],
    },
  ];
}

export function buildMt5TickChartContextMenuItems({
  tickSourceMode = 'current',
  onSelectTickSource,
  onSaveTickChart,
  autoScroll = true,
  onToggleAutoScroll,
  crosshairEnabled = true,
  onToggleCrosshair,
  showBidLine = true,
  onToggleBidLine,
  showAskLine = true,
  onToggleAskLine,
  showLastLine = true,
  onToggleLastLine,
  showTickGrid = true,
  onToggleGrid,
} = {}) {
  return [
    {
      key: 'current',
      label: 'Current',
      checked: tickSourceMode === 'current',
      onSelect: () => onSelectTickSource?.('current'),
    },
    {
      key: 'request',
      label: 'Request',
      checked: tickSourceMode === 'request',
      onSelect: () => onSelectTickSource?.('request'),
    },
    {
      key: 'save',
      label: 'Save',
      onSelect: () => onSaveTickChart?.(),
    },
    { divider: true },
    {
      key: 'auto-scroll',
      label: 'Auto Scroll',
      shortcut: 'S',
      checked: Boolean(autoScroll),
      onSelect: () => onToggleAutoScroll?.(),
    },
    {
      key: 'crosshair',
      label: 'Crosshair',
      shortcut: 'C',
      checked: Boolean(crosshairEnabled),
      onSelect: () => onToggleCrosshair?.(),
    },
    {
      key: 'bid-line',
      label: 'Bid Line',
      shortcut: 'B',
      checked: Boolean(showBidLine),
      onSelect: () => onToggleBidLine?.(),
    },
    {
      key: 'ask-line',
      label: 'Ask Line',
      shortcut: 'A',
      checked: Boolean(showAskLine),
      onSelect: () => onToggleAskLine?.(),
    },
    {
      key: 'last-line',
      label: 'Last Line',
      shortcut: 'L',
      checked: Boolean(showLastLine),
      onSelect: () => onToggleLastLine?.(),
    },
    {
      key: 'grid',
      label: 'Grid',
      shortcut: 'G',
      checked: Boolean(showTickGrid),
      onSelect: () => onToggleGrid?.(),
    },
  ];
}

const TICK_CHART_EXPORT_CSS = `
  svg { background: #141414; font-family: "Segoe UI", Tahoma, sans-serif; font-size: 11px; font-variant-numeric: tabular-nums; }
  text { font-family: "Segoe UI", Tahoma, sans-serif; font-size: 11px; font-variant-numeric: tabular-nums; }
  .rtx-market-tick-chart__plot { fill: #141414; }
  .rtx-market-tick-chart__grid line { stroke: #3b3b3f; stroke-dasharray: 3 3; shape-rendering: crispEdges; }
  .rtx-market-tick-chart__separators line { stroke: #696969; stroke-dasharray: 4 3; shape-rendering: crispEdges; }
  .rtx-market-tick-chart__line { fill: none; stroke-width: 1.1; stroke-linejoin: round; stroke-linecap: round; }
  .rtx-market-tick-chart__line--bid { stroke: #0066ff; }
  .rtx-market-tick-chart__line--ask { stroke: #ff5252; }
  .rtx-market-tick-chart__line--last { stroke: #22c55e; }
  .rtx-market-tick-chart__price-line--bid { stroke: #0066ff; stroke-width: 1; shape-rendering: crispEdges; }
  .rtx-market-tick-chart__price-line--ask { stroke: #ff5252; stroke-width: 1; shape-rendering: crispEdges; }
  .rtx-market-tick-chart__price-line--last { stroke: #22c55e; stroke-width: 1; shape-rendering: crispEdges; }
  .rtx-market-tick-chart__frame { fill: none; stroke: #d4d4d8; shape-rendering: crispEdges; }
  .rtx-market-tick-chart__axis line { stroke: #d4d4d8; shape-rendering: crispEdges; }
  .rtx-market-tick-chart__axis text, .rtx-market-tick-chart__symbol { fill: #d4d4d8; }
  .rtx-market-tick-chart__tag--bid rect { fill: #0066ff; }
  .rtx-market-tick-chart__tag--ask rect { fill: #ff5252; }
  .rtx-market-tick-chart__tag--last rect { fill: #22c55e; }
  .rtx-market-tick-chart__tag--bid text, .rtx-market-tick-chart__tag--ask text, .rtx-market-tick-chart__tag--last text { fill: #ffffff; font-weight: 500; }
`;

export function exportTickChartImage(chartContainer, symbolName = 'TICK_CHART') {
  if (typeof document === 'undefined') return false;
  const svgNode = chartContainer?.tagName?.toLowerCase() === 'svg'
    ? chartContainer
    : chartContainer?.querySelector?.('svg');
  if (!svgNode) return false;

  const width = Math.max(320, Number(svgNode.getAttribute('width')) || svgNode.clientWidth || 640);
  const height = Math.max(200, Number(svgNode.getAttribute('height')) || svgNode.clientHeight || 360);
  const clone = svgNode.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`);

  // Remove transient hover crosshair overlay from saved chart image
  const crosshairNode = clone.querySelector('.rtx-market-tick-chart__crosshair');
  if (crosshairNode) {
    crosshairNode.remove();
  }

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.textContent = TICK_CHART_EXPORT_CSS;
  defs.appendChild(styleEl);
  clone.insertBefore(defs, clone.firstChild);

  const serializer = new XMLSerializer();
  const svgMarkup = serializer.serializeToString(clone);
  const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  const cleanSymbol = String(symbolName || 'ticks').replace(/[^a-zA-Z0-9._-]/g, '_');
  const dateStamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const pngFilename = `${cleanSymbol}-ticks-${dateStamp}.png`;

  const triggerDownload = (href, filename) => {
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (typeof Image === 'undefined') {
    triggerDownload(svgUrl, `${cleanSymbol}-ticks-${dateStamp}.svg`);
    setTimeout(() => URL.revokeObjectURL(svgUrl), 1500);
    return true;
  }

  const image = new Image();
  image.decoding = 'sync';
  image.onload = () => {
    try {
      const scale = Math.min(2, Math.max(1, Number(globalThis.devicePixelRatio) || 2));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        triggerDownload(svgUrl, `${cleanSymbol}-ticks-${dateStamp}.svg`);
        return;
      }
      ctx.scale(scale, scale);
      ctx.fillStyle = '#141414';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);

      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob((pngBlob) => {
          if (!pngBlob) {
            triggerDownload(canvas.toDataURL('image/png'), pngFilename);
            return;
          }
          const pngUrl = URL.createObjectURL(pngBlob);
          triggerDownload(pngUrl, pngFilename);
          setTimeout(() => URL.revokeObjectURL(pngUrl), 1500);
        }, 'image/png');
      } else {
        triggerDownload(canvas.toDataURL('image/png'), pngFilename);
      }
    } finally {
      setTimeout(() => URL.revokeObjectURL(svgUrl), 1500);
    }
  };
  image.onerror = () => {
    triggerDownload(svgUrl, `${cleanSymbol}-ticks-${dateStamp}.svg`);
    setTimeout(() => URL.revokeObjectURL(svgUrl), 1500);
  };
  image.src = svgUrl;
  return true;
}

