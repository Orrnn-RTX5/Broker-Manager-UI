import { Children, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, RefreshCw } from 'lucide-react';
import usePagedData from '../../hooks/usePagedData';
import { usePermissions } from '../../hooks/usePermissions';
import { useLivePositions } from '../../hooks/useLiveTrading';
import { fetchAllPositionsDataset, getPositionsPage, invalidateGlobalPositionsCache } from '../../services/api';
import { getDealerQueue } from '../../services/tradeApi';
import { getDataAccessScope } from '../../services/dataAccessScope.js';
import { subscribeToPositionSync, requiresPositionReconciliation } from '../../services/positionSync';
import { liveTradingState } from '../../services/liveTradingState.js';
import { PERMISSIONS } from '../../utils/permissions.js';
import { TRADE_COLUMNS, tradeCells } from './terminalTrades.js';
import { formatJournalTime } from './tradeJournalCore.js';
import { getTerminalNewsEntries, subscribeToTerminalNews } from './terminalNews.js';
import { fetchExposure } from '../exposure/exposureApi.js';
import useSymbolStore from '../../store/symbolStore.js';
import {
  buildMt5AssetExposure,
  buildMt5ExposureChartSlices,
  buildMt5SymbolSummary,
  buildSymbolExposure,
  formatMt5ExposureCompactQty,
  formatMt5ExposureRate,
  formatMt5SpaceGroupedInt,
  formatMt5SpaceGroupedMoney,
  getMt5ExposureDiagramTitle,
  positionCurrentPrice,
  positionLots,
  positionOpenPrice,
  positionSide,
  readNumber,
} from './terminalOperationsData.js';
import useMarginAlerts from './useMarginAlerts.js';
import './TerminalOperations.css';

const EMPTY = [];
const PAGE_SIZE = 30;
const SUMMARY_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF'];
const SUMMARY_PROFIT_MODES = [
  { id: 'points', label: 'In Points' },
  { id: 'term', label: 'In Term Currency' },
  { id: 'deposit', label: 'In Deposit Currency' },
];
const FALLBACK_USD_RATES = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 155.0,
  CHF: 0.88,
  CAD: 1.38,
  AUD: 1.52,
  NZD: 1.66,
};

const fmtNumber = (value) => value == null || !Number.isFinite(Number(value)) ? '—'
  : Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPrice = (value) => Number(value) > 0 ? String(value) : '—';
const fmtClock = (value) => Number(value) > 0
  ? new Date(Number(value) > 100000000000 ? Number(value) : Number(value) * 1000).toLocaleTimeString('en-GB', { hour12: false }) : '—';
const fmtSummaryLots = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || Math.abs(num) < 1e-9) return '0';
  return Number(num.toFixed(2)).toString();
};
const fmtSummaryPrice = (value, digits = 5) => {
  const num = Number(value);
  return (Number.isFinite(num) ? num : 0).toFixed(digits);
};
const fmtSummaryProfit = (value, decimals = 2) => {
  const num = Number(value);
  return (Number.isFinite(num) ? num : 0).toFixed(decimals);
};
const matchesNeedle = (needle, values) => !needle || values.join(' ').toLowerCase().includes(needle);
const denied = (query) => query.isError && [401, 403].includes(Number(query.error?.status));
const profitClass = (value) => value == null ? undefined : value < 0 ? 'operations-negative' : value > 0 ? 'operations-positive' : undefined;

const escapeXml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const downloadBlob = (content, mimeType, filename) => {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

function deriveUsdConversionRates(positions = []) {
  const rates = { ...FALLBACK_USD_RATES };
  for (const pos of positions) {
    const sym = String(pos?.symbol || pos?.Symbol || '').toUpperCase().replace(/[^A-Z]/g, '');
    const price = positionCurrentPrice(pos) || positionOpenPrice(pos);
    if (!price || price <= 0) continue;
    if (sym === 'EURUSD') rates.EUR = 1 / price;
    else if (sym === 'GBPUSD') rates.GBP = 1 / price;
    else if (sym === 'AUDUSD') rates.AUD = 1 / price;
    else if (sym === 'NZDUSD') rates.NZD = 1 / price;
    else if (sym === 'USDJPY') rates.JPY = price;
    else if (sym === 'USDCHF') rates.CHF = price;
    else if (sym === 'USDCAD') rates.CAD = price;
  }
  return rates;
}

function resolveSymbolTermRate(symbol, rates) {
  const clean = String(symbol || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (clean.length >= 6) {
    const quote = clean.slice(3, 6);
    if (rates[quote]) return { rate: rates[quote], decimals: quote === 'JPY' ? 0 : 2 };
  }
  return { rate: 1, decimals: 2 };
}

function usePositionsBook(enabled) {
  const queryClient = useQueryClient();
  const scope = getDataAccessScope();
  useEffect(() => {
    if (!enabled) return undefined;
    let timer;
    const unsubscribe = subscribeToPositionSync((event) => {
      if (event?.reason === 'connected' || timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        queryClient.invalidateQueries({ queryKey: ['terminal-positions-book', scope] }, { cancelRefetch: false });
      }, 200);
    });
    return () => { unsubscribe(); clearTimeout(timer); };
  }, [enabled, queryClient, scope]);
  const query = useQuery({
    queryKey: ['terminal-positions-book', scope],
    queryFn: async ({ signal }) => {
      const liveRevision = liveTradingState.snapshot();
      const rows = await fetchAllPositionsDataset({ signal });
      return { rows: rows.map((row) => ({ ...row,
        login: row.login ?? row.Login ?? row.account_login,
        position: row.position ?? row.positionTicket ?? row.Position ?? row.ticket,
        lots: undefined, volume_lots: undefined, volume: positionLots(row), type: positionSide(row),
        priceOpen: positionOpenPrice(row) ?? row.priceOpen,
        priceCurrent: positionCurrentPrice(row) ?? row.priceCurrent,
        profit: readNumber(row, ['profit', 'Profit']),
      })), liveRevision };
    }, enabled, staleTime: 1000, refetchInterval: enabled ? 30_000 : false,
    meta: { suppressGlobalLoader: true },
  });
  const rows = useLivePositions(enabled && !denied(query) ? query.data?.rows ?? EMPTY : EMPTY,
    undefined, false, query.data?.liveRevision || 0);
  return { ...query, rows, loaded: enabled && !!query.data && !denied(query),
    refresh: () => { invalidateGlobalPositionsCache(); return query.refetch(); } };
}

const TerminalTable = ({ label, columns, children, empty, busy = false, className = '', onHeaderClick, onContextMenu }) => (
  <div className="cc-terminal-table-wrap" onContextMenu={onContextMenu}>
    <table className={`cc-terminal-table ${className}`.trim()} aria-label={label} aria-busy={busy}>
      <colgroup>
        {columns.map((col) => (
          <col key={col} className="cc-terminal-col" style={{ width: `${100 / columns.length}%` }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {columns.map((col, index) => (
            <th
              key={col}
              scope="col"
              onClick={onHeaderClick ? () => onHeaderClick(index, col) : undefined}
            >
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}{Children.count(children) === 0 && empty
        ? <tr><td colSpan={columns.length} className="operations-empty">{empty}</td></tr> : null}</tbody>
    </table>
  </div>
);

function OperationsView({ label, subtitle, isAuthenticated, allowed = true, busy, updatedAt, onRefresh, children }) {
  return <section className="cc-operations-view" aria-label={`${label} view`}>
    <header className="operations-toolbar">
      <span>{label}</span><span className="operations-caption">{subtitle}</span>
      <span className="operations-read-time" role="status">{busy ? 'Updating…' : updatedAt ? `Read ${fmtClock(updatedAt)}` : ''}</span>
      <button type="button" onClick={onRefresh} disabled={!isAuthenticated || !allowed || busy} aria-label={`Refresh ${label.toLowerCase()}`}>
        <RefreshCw size={12} aria-hidden="true" /> Refresh
      </button>
    </header>
    {!isAuthenticated ? <div className="operations-empty">Sign in to view {label.toLowerCase()}.</div>
      : !allowed ? <div className="operations-empty">Your manager account does not have permission to view {label.toLowerCase()}.</div>
        : children}
  </section>;
}

function useFilteredPage(rows, needle, values) {
  const filtered = useMemo(() => rows.filter((row) => matchesNeedle(needle, values(row))), [rows, needle, values]);
  const [state, setState] = useState({ page: 0, needle });
  if (state.needle !== needle) setState({ page: 0, needle });
  const page = Math.min(state.needle === needle ? state.page : 0, Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1));
  return { rows: filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), total: filtered.length,
    page, offset: page * PAGE_SIZE, hasMore: (page + 1) * PAGE_SIZE < filtered.length,
    nextPage: () => setState({ needle, page: page + 1 }), prevPage: () => setState({ needle, page: Math.max(0, page - 1) }) };
}
function Pagination({ book, busy = false, unit = 'results' }) {
  return <footer className="operations-pagination">
    <span>{book.rows.length ? `${book.offset + 1}–${book.offset + book.rows.length}` : '0'}{book.total != null ? ` of ${book.total}` : ''} {unit}</span>
    <button type="button" onClick={book.prevPage} disabled={book.page === 0 || busy} aria-label={`Previous ${unit}`}>Previous</button>
    <span>Page {book.page + 1}</span>
    <button type="button" onClick={book.nextPage} disabled={!book.hasMore || busy} aria-label={`Next ${unit}`}>Next</button>
  </footer>;
}
const Notice = ({ children }) => <div className="operations-notice" role="status">{children}</div>;
const summarySearch = (row) => [row.symbol];
const exposureSearch = (row) => [row.symbol, row.currency];
const dealerSearch = (row) => [row.id, row.orderTicket, row.accountLogin, row.symbol, row.side, row.reason, row.comment];
const alertSearch = (row) => [row.login, row.name, row.group, row.label, row.reason];

const SUMMARY_SORT_KEYS = [
  'symbol',
  'positions',
  'buyVolume',
  'buyPrice',
  'sellVolume',
  'sellPrice',
  'netVolume',
  'displayProfit',
  'displayUncovered',
];

function SummaryContextMenu({
  x,
  y,
  currency,
  profitMode,
  autoArrange,
  showGrid,
  onSelectCurrency,
  onSelectProfitMode,
  onCopy,
  onExportReport,
  onResetSortOrder,
  onToggleAutoArrange,
  onToggleGrid,
  onClose,
}) {
  const menuRef = useRef(null);
  const [openSubmenu, setOpenSubmenu] = useState(null);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  const menuWidth = 188;
  const menuHeight = 196;
  const safeLeft = typeof window !== 'undefined'
    ? Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8))
    : x;
  const safeTop = typeof window !== 'undefined'
    ? Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8))
    : y;
  const flipSubmenuLeft = typeof window !== 'undefined' && safeLeft + menuWidth + 190 > window.innerWidth;

  const portalRoot = (typeof document !== 'undefined' && document.querySelector('.rtx5-command-shell')) || document.body;

  return createPortal(
    <div
      ref={menuRef}
      className={`cc-journal-context-menu${flipSubmenuLeft ? ' flip-submenu-left' : ''}`}
      role="menu"
      aria-label="Summary context menu"
      style={{ left: safeLeft, top: safeTop }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div
        className="cc-journal-context-menu-submenu-wrap"
        onMouseEnter={() => setOpenSubmenu('currency')}
        onMouseLeave={() => setOpenSubmenu((prev) => (prev === 'currency' ? null : prev))}
      >
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={openSubmenu === 'currency'}
          className={`cc-journal-context-menu-item${openSubmenu === 'currency' ? ' is-open' : ''}`}
          onClick={() => setOpenSubmenu((prev) => (prev === 'currency' ? null : 'currency'))}
        >
          <span className="cc-journal-ctx-icon" aria-hidden="true" />
          <span className="cc-journal-ctx-label">Currency</span>
          <span className="cc-journal-ctx-arrow" aria-hidden="true">▸</span>
        </button>
        {openSubmenu === 'currency' && (
          <div className="cc-journal-context-submenu" role="menu" aria-label="Summary currency">
            {SUMMARY_CURRENCIES.map((item) => {
              const active = currency === item;
              return (
                <button
                  key={item}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={active}
                  className="cc-journal-context-menu-item"
                  onClick={() => {
                    onSelectCurrency(item);
                    onClose();
                  }}
                >
                  <span className="cc-journal-ctx-icon is-check" aria-hidden="true">
                    {active ? <Check size={13} strokeWidth={2.2} /> : null}
                  </span>
                  <span className="cc-journal-ctx-label">{item}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div
        className="cc-journal-context-menu-submenu-wrap"
        onMouseEnter={() => setOpenSubmenu('profit')}
        onMouseLeave={() => setOpenSubmenu((prev) => (prev === 'profit' ? null : prev))}
      >
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={openSubmenu === 'profit'}
          className={`cc-journal-context-menu-item${openSubmenu === 'profit' ? ' is-open' : ''}`}
          onClick={() => setOpenSubmenu((prev) => (prev === 'profit' ? null : 'profit'))}
        >
          <span className="cc-journal-ctx-icon" aria-hidden="true" />
          <span className="cc-journal-ctx-label">Profit</span>
          <span className="cc-journal-ctx-arrow" aria-hidden="true">▸</span>
        </button>
        {openSubmenu === 'profit' && (
          <div className="cc-journal-context-submenu" role="menu" aria-label="Summary profit mode">
            {SUMMARY_PROFIT_MODES.map((mode) => {
              const active = profitMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={active}
                  className="cc-journal-context-menu-item"
                  onClick={() => {
                    onSelectProfitMode(mode.id);
                    onClose();
                  }}
                >
                  <span className="cc-journal-ctx-icon is-check" aria-hidden="true">
                    {active ? <Check size={13} strokeWidth={2.2} /> : null}
                  </span>
                  <span className="cc-journal-ctx-label">{mode.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="cc-journal-context-menu-separator" role="separator" />

      <button
        type="button"
        role="menuitem"
        className="cc-journal-context-menu-item"
        onMouseEnter={() => setOpenSubmenu(null)}
        onClick={() => {
          onCopy();
          onClose();
        }}
      >
        <span className="cc-journal-ctx-icon is-copy" aria-hidden="true">
          <Copy size={13} strokeWidth={1.8} />
        </span>
        <span className="cc-journal-ctx-label">Copy</span>
        <span className="cc-journal-ctx-shortcut">Ctrl+C</span>
      </button>

      <div className="cc-journal-context-menu-separator" role="separator" />

      <div
        className="cc-journal-context-menu-submenu-wrap"
        onMouseEnter={() => setOpenSubmenu('report')}
        onMouseLeave={() => setOpenSubmenu((prev) => (prev === 'report' ? null : prev))}
      >
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={openSubmenu === 'report'}
          className={`cc-journal-context-menu-item${openSubmenu === 'report' ? ' is-open' : ''}`}
          onClick={() => setOpenSubmenu((prev) => (prev === 'report' ? null : 'report'))}
        >
          <span className="cc-journal-ctx-icon" aria-hidden="true" />
          <span className="cc-journal-ctx-label">Report</span>
          <span className="cc-journal-ctx-arrow" aria-hidden="true">▸</span>
        </button>
        {openSubmenu === 'report' && (
          <div className="cc-journal-context-submenu" role="menu" aria-label="Export summary report">
            <button
              type="button"
              role="menuitem"
              className="cc-journal-context-menu-item"
              onClick={() => {
                onExportReport('xml');
                onClose();
              }}
            >
              <span className="cc-journal-ctx-icon" aria-hidden="true" />
              <span className="cc-journal-ctx-label">XML (MS Office Excel)</span>
              <span className="cc-journal-ctx-shortcut">Ctrl+E</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="cc-journal-context-menu-item"
              onClick={() => {
                onExportReport('html');
                onClose();
              }}
            >
              <span className="cc-journal-ctx-icon" aria-hidden="true" />
              <span className="cc-journal-ctx-label">HTML (Internet Explorer)</span>
              <span className="cc-journal-ctx-shortcut">Ctrl+H</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="cc-journal-context-menu-item"
              onClick={() => {
                onExportReport('csv');
                onClose();
              }}
            >
              <span className="cc-journal-ctx-icon" aria-hidden="true" />
              <span className="cc-journal-ctx-label">CSV (Text file)</span>
            </button>
          </div>
        )}
      </div>

      <div className="cc-journal-context-menu-separator" role="separator" />

      <button
        type="button"
        role="menuitem"
        className="cc-journal-context-menu-item"
        onMouseEnter={() => setOpenSubmenu(null)}
        onClick={() => {
          onResetSortOrder();
          onClose();
        }}
      >
        <span className="cc-journal-ctx-icon" aria-hidden="true" />
        <span className="cc-journal-ctx-label">Reset Sort Order</span>
        <span className="cc-journal-ctx-shortcut">R</span>
      </button>

      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={autoArrange}
        className="cc-journal-context-menu-item"
        onMouseEnter={() => setOpenSubmenu(null)}
        onClick={() => {
          onToggleAutoArrange();
          onClose();
        }}
      >
        <span className="cc-journal-ctx-icon is-check" aria-hidden="true">
          {autoArrange ? <Check size={13} strokeWidth={2.2} /> : null}
        </span>
        <span className="cc-journal-ctx-label">Auto Arrange</span>
        <span className="cc-journal-ctx-shortcut">A</span>
      </button>

      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={showGrid}
        className="cc-journal-context-menu-item"
        onMouseEnter={() => setOpenSubmenu(null)}
        onClick={() => {
          onToggleGrid();
          onClose();
        }}
      >
        <span className="cc-journal-ctx-icon is-check" aria-hidden="true">
          {showGrid ? <Check size={13} strokeWidth={2.2} /> : null}
        </span>
        <span className="cc-journal-ctx-label">Grid</span>
        <span className="cc-journal-ctx-shortcut">G</span>
      </button>
    </div>,
    portalRoot
  );
}

function SummaryTab({ needle, isAuthenticated, canViewPositions }) {
  const positions = usePositionsBook(isAuthenticated && canViewPositions);
  const baseRows = useMemo(() => buildMt5SymbolSummary(positions.rows), [positions.rows]);
  const fxRates = useMemo(() => deriveUsdConversionRates(positions.rows), [positions.rows]);

  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [summaryCurrency, setSummaryCurrency] = useState('USD');
  const [profitMode, setProfitMode] = useState('deposit');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [autoArrange, setAutoArrange] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [contextMenu, setContextMenu] = useState(null);
  const sectionRef = useRef(null);

  const profitUnitLabel = profitMode === 'points'
    ? 'Points'
    : profitMode === 'term'
      ? 'Term'
      : summaryCurrency;

  const columns = useMemo(() => [
    'Symbol',
    'Positions',
    'Buy Volume',
    'Buy Price',
    'Sell Volume',
    'Sell Price',
    'Net Volume',
    `Profit (${profitUnitLabel})`,
    `Uncovered (${profitUnitLabel})`,
  ], [profitUnitLabel]);

  const enrichedRows = useMemo(() => {
    const rate = fxRates[summaryCurrency] ?? 1;
    const depositDecimals = summaryCurrency === 'JPY' ? 0 : 2;
    return baseRows.map((row) => {
      let displayProfit = row.profit * rate;
      let displayCoverageProfit = row.coverageProfit * rate;
      let displayUncovered = row.uncoveredProfit * rate;
      let profitDecimals = depositDecimals;

      if (profitMode === 'points') {
        displayProfit = row.pointsProfit ?? 0;
        displayCoverageProfit = 0;
        displayUncovered = row.pointsProfit ?? 0;
        profitDecimals = 1;
      } else if (profitMode === 'term') {
        const term = resolveSymbolTermRate(row.symbol, fxRates);
        displayProfit = row.profit * term.rate;
        displayCoverageProfit = row.coverageProfit * term.rate;
        displayUncovered = row.uncoveredProfit * term.rate;
        profitDecimals = term.decimals;
      }

      const zeroPrice = fmtSummaryPrice(row.coverageBuyPrice, row.digits);
      const formattedProfitCell = `${fmtSummaryProfit(displayProfit, profitDecimals)} / ${fmtSummaryProfit(displayCoverageProfit, profitDecimals)}`;
      const formattedUncoveredCell = fmtSummaryProfit(displayUncovered, profitDecimals);

      return {
        ...row,
        displayProfit,
        displayUncovered,
        cells: [
          row.symbol,
          `${row.positions} / ${row.coveragePositions}`,
          `${fmtSummaryLots(row.buyVolume)} / ${fmtSummaryLots(row.coverageBuyVolume)}`,
          `${fmtSummaryPrice(row.buyPrice, row.digits)} / ${zeroPrice}`,
          `${fmtSummaryLots(row.sellVolume)} / ${fmtSummaryLots(row.coverageSellVolume)}`,
          `${fmtSummaryPrice(row.sellPrice, row.digits)} / ${zeroPrice}`,
          fmtSummaryLots(row.netVolume),
          formattedProfitCell,
          formattedUncoveredCell,
        ],
      };
    });
  }, [baseRows, fxRates, summaryCurrency, profitMode]);

  const filteredRows = useMemo(() => {
    const matched = enrichedRows.filter((row) => matchesNeedle(needle, summarySearch(row)));
    if (!sortConfig.key) return matched;
    const sorted = [...matched].sort((a, b) => {
      const valA = a[sortConfig.key];
      const valB = b[sortConfig.key];
      if (typeof valA === 'string' || typeof valB === 'string') {
        return String(valA || '').localeCompare(String(valB || ''), undefined, { numeric: true });
      }
      return Number(valA || 0) - Number(valB || 0);
    });
    return sortConfig.direction === 'desc' ? sorted.reverse() : sorted;
  }, [enrichedRows, needle, sortConfig]);

  const handleHeaderClick = useCallback((colIndex) => {
    const sortKey = SUMMARY_SORT_KEYS[colIndex];
    if (!sortKey) return;
    setSortConfig((prev) => {
      if (prev.key === sortKey) {
        return { key: sortKey, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key: sortKey, direction: 'asc' };
    });
  }, []);

  const handleCopySummary = useCallback(async (targetRow = null) => {
    const activeRow = targetRow || filteredRows.find((r) => r.symbol === selectedSymbol) || null;
    const text = activeRow
      ? activeRow.cells.join('\t')
      : [columns.join('\t'), ...filteredRows.map((r) => r.cells.join('\t'))].join('\n');
    if (!text) return;
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      // Clipboard write may be restricted in non-secure contexts.
    }
  }, [filteredRows, selectedSymbol, columns]);

  const handleExportReport = useCallback((format) => {
    if (format === 'csv') {
      const csvLines = [
        columns.map((col) => `"${String(col).replace(/"/g, '""')}"`).join(','),
        ...filteredRows.map((row) => row.cells.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
      ];
      downloadBlob(csvLines.join('\r\n'), 'text/csv;charset=utf-8', 'summary-report.csv');
      return;
    }

    if (format === 'html') {
      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Summary Report</title>
<style>
  body { font-family: Tahoma, Arial, sans-serif; font-size: 12px; background: #ffffff; color: #111827; margin: 20px; }
  h2 { font-size: 15px; margin-bottom: 10px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: right; white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; }
  th { background: #f1f5f9; font-weight: 600; }
  tr:nth-child(even) { background: #f8fafc; }
</style>
</head>
<body>
<h2>Summary Report (${escapeXml(profitUnitLabel)})</h2>
<table>
  <thead>
    <tr>${columns.map((col) => `<th>${escapeXml(col)}</th>`).join('')}</tr>
  </thead>
  <tbody>
    ${filteredRows.map((row) => `<tr>${row.cells.map((cell) => `<td>${escapeXml(cell)}</td>`).join('')}</tr>`).join('\n    ')}
  </tbody>
</table>
</body>
</html>`;
      downloadBlob(html, 'text/html;charset=utf-8', 'summary-report.html');
      return;
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Summary">
  <Table>
   <Row>${columns.map((col) => `<Cell><Data ss:Type="String">${escapeXml(col)}</Data></Cell>`).join('')}</Row>
   ${filteredRows.map((row) => `<Row>${row.cells.map((cell) => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join('')}</Row>`).join('\n   ')}
  </Table>
 </Worksheet>
</Workbook>`;
    downloadBlob(xml, 'application/vnd.ms-excel;charset=utf-8', 'summary-report.xml');
  }, [columns, filteredRows, profitUnitLabel]);

  const handleContextMenu = useCallback((event, row = null) => {
    event.preventDefault();
    event.stopPropagation();
    if (row) {
      setSelectedSymbol(row.symbol);
    }
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      row,
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.isContentEditable
      );
      if (isInput) return;

      const terminal = sectionRef.current?.closest('[data-panel-id]') || sectionRef.current;
      const insideSummary = Boolean(terminal && terminal.contains(activeEl));
      if (!selectedSymbol && !insideSummary) return;

      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
        if (key === 'c') {
          const selectionText = typeof window !== 'undefined' ? String(window.getSelection?.() || '') : '';
          if (!selectionText) {
            event.preventDefault();
            void handleCopySummary(null);
          }
        } else if (key === 'e') {
          event.preventDefault();
          handleExportReport('xml');
        } else if (key === 'h') {
          event.preventDefault();
          handleExportReport('html');
        }
        return;
      }

      if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        if (key === 'r') {
          event.preventDefault();
          setSortConfig({ key: null, direction: 'asc' });
        } else if (key === 'a') {
          event.preventDefault();
          setAutoArrange((prev) => !prev);
        } else if (key === 'g') {
          event.preventDefault();
          setShowGrid((prev) => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSymbol, handleCopySummary, handleExportReport]);

  const busy = positions.isFetching;
  const tableModifiers = [
    'cc-summary-table',
    !showGrid ? 'is-no-grid' : '',
    !autoArrange ? 'is-manual-arrange' : '',
  ].filter(Boolean).join(' ');

  return (
    <section
      ref={sectionRef}
      className="cc-operations-view cc-summary-operations-view"
      aria-label="Summary view"
      tabIndex={-1}
    >
      {!isAuthenticated ? (
        <div className="operations-empty">Sign in to view summary.</div>
      ) : !canViewPositions ? (
        <div className="operations-empty">Your manager account does not have permission to view summary positions.</div>
      ) : (
        <>
          {positions.isError && <Notice>Position refresh failed. Showing available snapshot values.</Notice>}
          <TerminalTable
            label="Symbol summary"
            className={tableModifiers}
            busy={busy}
            columns={columns}
            onHeaderClick={handleHeaderClick}
            onContextMenu={(event) => handleContextMenu(event, null)}
            empty={
              positions.isLoading
                ? 'Loading symbol summary…'
                : positions.isError
                  ? 'The symbol summary could not be loaded.'
                  : needle
                    ? 'No symbols match the search.'
                    : 'No open positions.'
            }
          >
            {filteredRows.map((row) => {
              const isSelected = selectedSymbol === row.symbol;
              return (
                <tr
                  key={row.symbol}
                  className={isSelected ? 'is-selected' : undefined}
                  aria-selected={isSelected}
                  onClick={() => setSelectedSymbol((prev) => (prev === row.symbol ? null : row.symbol))}
                  onContextMenu={(event) => handleContextMenu(event, row)}
                >
                  <td className="cc-summary-col-symbol" title={row.symbol}>
                    <span className="cc-summary-symbol-name">{row.symbol}</span>
                  </td>
                  <td>{row.cells[1]}</td>
                  <td>{row.cells[2]}</td>
                  <td>{row.cells[3]}</td>
                  <td>{row.cells[4]}</td>
                  <td>{row.cells[5]}</td>
                  <td>{row.cells[6]}</td>
                  <td>{row.cells[7]}</td>
                  <td>{row.cells[8]}</td>
                </tr>
              );
            })}
          </TerminalTable>

          {contextMenu && (
            <SummaryContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              currency={summaryCurrency}
              profitMode={profitMode}
              autoArrange={autoArrange}
              showGrid={showGrid}
              onSelectCurrency={setSummaryCurrency}
              onSelectProfitMode={setProfitMode}
              onCopy={() => void handleCopySummary(contextMenu.row)}
              onExportReport={handleExportReport}
              onResetSortOrder={() => setSortConfig({ key: null, direction: 'asc' })}
              onToggleAutoArrange={() => setAutoArrange((prev) => !prev)}
              onToggleGrid={() => setShowGrid((prev) => !prev)}
              onClose={() => setContextMenu(null)}
            />
          )}
        </>
      )}
    </section>
  );
}

const EXPOSURE_SORT_KEYS = [
  'asset',
  'clients',
  'coverage',
  'net',
  'rate',
  'netUsd',
  'positiveUsd',
  'netUsd',
];

export function Mt5ExposureAssetBadge() {
  return (
    <span className="cc-exposure-asset-badge" aria-hidden="true">
      <span>$</span>
    </span>
  );
}

const computeHalfTrackBarStyle = (signedPct) => {
  const num = Number(signedPct) || 0;
  const halfWidth = Math.min(49, Math.max(0, Math.abs(num) * 0.48));
  if (halfWidth <= 0) return null;
  if (num < 0) {
    return { right: '50%', width: `${halfWidth.toFixed(1)}%` };
  }
  return { left: '50%', width: `${halfWidth.toFixed(1)}%` };
};

export function Mt5ExposureGraphBar({ clientsBarPct = 0, netBarPct = 0, title }) {
  const greenStyle = computeHalfTrackBarStyle(clientsBarPct);
  const blueStyle = computeHalfTrackBarStyle(netBarPct);
  return (
    <div className="cc-exposure-graph-track" title={title}>
      <span className="cc-exposure-graph-axis" aria-hidden="true" />
      {greenStyle && <span className="cc-exposure-bar-green" style={greenStyle} />}
      {blueStyle && <span className="cc-exposure-bar-blue" style={blueStyle} />}
    </div>
  );
}

export function Mt5ExposurePieChart({
  slices = EMPTY,
  chartMode = 'longs',
  title,
  currency = 'USD',
  onToggleMode,
  onContextMenu,
}) {
  const [hoveredAsset, setHoveredAsset] = useState(null);
  const decimals = currency === 'JPY' ? 0 : 2;
  const total = useMemo(
    () => slices.reduce((sum, item) => sum + (Number(item.value) > 0 ? Number(item.value) : 0), 0),
    [slices]
  );

  const cx = 135;
  const cy = 96;
  const r = 72;
  const labelR = 86;

  const geometry = useMemo(() => {
    if (!total || slices.length === 0) return EMPTY;
    let currentTheta = 0; // Start at 3 o'clock (0 rad) and sweep counter-clockwise
    return slices.map((item, idx) => {
      const value = Math.max(0, Number(item.value) || 0);
      const ratio = value / total;
      const sweep = ratio * Math.PI * 2;
      const startTheta = currentTheta;
      const endTheta = currentTheta + sweep;
      const midTheta = startTheta + sweep / 2;
      currentTheta = endTheta;

      const x1 = cx + r * Math.cos(startTheta);
      const y1 = cy - r * Math.sin(startTheta);
      const x2 = cx + r * Math.cos(endTheta);
      const y2 = cy - r * Math.sin(endTheta);
      const largeArc = sweep > Math.PI ? 1 : 0;
      const isFullCircle = sweep >= Math.PI * 2 - 1e-5;
      const path = isFullCircle
        ? null
        : `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 0 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;

      const tickX1 = cx + (r + 1) * Math.cos(midTheta);
      const tickY1 = cy - (r + 1) * Math.sin(midTheta);
      const tickX2 = cx + (labelR - 4) * Math.cos(midTheta);
      const tickY2 = cy - (labelR - 4) * Math.sin(midTheta);

      const lx = cx + labelR * Math.cos(midTheta);
      const ly = cy - labelR * Math.sin(midTheta);
      const cosMid = Math.cos(midTheta);
      const textAnchor = Math.abs(cosMid) < 0.22 ? 'middle' : cosMid > 0 ? 'start' : 'end';

      return {
        ...item,
        gradId: `cc-exp-slice-grad-${idx}`,
        ratio,
        isFullCircle,
        path,
        tickX1,
        tickY1,
        tickX2,
        tickY2,
        lx,
        ly,
        textAnchor,
        showLabel: ratio >= 0.035,
      };
    });
  }, [slices, total]);

  const activeSlice = useMemo(
    () => geometry.find((s) => s.asset === hoveredAsset) || null,
    [geometry, hoveredAsset]
  );

  const titleLabel = title || (chartMode === 'shorts' ? 'Net Shorts' : 'Net Longs');

  return (
    <aside
      className="cc-exposure-chart-pane"
      aria-label="Exposure composition chart"
      onContextMenu={onContextMenu}
    >
      <div className="cc-exposure-chart-header">
        <button
          type="button"
          className="cc-exposure-chart-title-btn"
          onClick={onToggleMode}
          title="Click to switch between Long Positions and Short Positions"
        >
          {titleLabel}
        </button>
      </div>
      <div className="cc-exposure-chart-canvas">
        {geometry.length > 0 ? (
          <>
            <svg
              viewBox="0 0 270 194"
              className="cc-exposure-pie-svg"
              role="img"
              aria-label={`${titleLabel} pie chart`}
            >
              <defs>
                {geometry.map((slice) => (
                  <linearGradient key={slice.gradId} id={slice.gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={slice.color} stopOpacity="1" />
                    <stop offset="100%" stopColor={slice.color} stopOpacity="0.78" />
                  </linearGradient>
                ))}
              </defs>
              <circle
                cx={cx}
                cy={cy}
                r={r + 2}
                fill="none"
                stroke="rgba(148, 163, 184, 0.14)"
                strokeWidth="1"
              />
              {geometry.map((slice) => {
                const isHovered = hoveredAsset === slice.asset;
                return (
                  <g
                    key={slice.asset}
                    className="cc-exposure-pie-slice"
                    onMouseEnter={() => setHoveredAsset(slice.asset)}
                    onMouseLeave={() => setHoveredAsset(null)}
                  >
                    {slice.isFullCircle ? (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={r}
                        fill={`url(#${slice.gradId})`}
                        stroke={isHovered ? '#f8fafc' : '#181c24'}
                        strokeWidth={isHovered ? '1.6' : '1.2'}
                      />
                    ) : (
                      <path
                        d={slice.path}
                        fill={`url(#${slice.gradId})`}
                        stroke={isHovered ? '#f8fafc' : '#181c24'}
                        strokeWidth={isHovered ? '1.6' : '1.2'}
                      />
                    )}
                  </g>
                );
              })}
              <circle
                cx={cx}
                cy={cy}
                r={18}
                fill="var(--operations-row, #1e1e1e)"
                stroke="rgba(148, 163, 184, 0.22)"
                strokeWidth="1"
                pointerEvents="none"
              />
              {geometry.map((slice) =>
                slice.showLabel ? (
                  <g key={`label-${slice.asset}`} pointerEvents="none">
                    <line
                      x1={slice.tickX1}
                      y1={slice.tickY1}
                      x2={slice.tickX2}
                      y2={slice.tickY2}
                      stroke="rgba(148, 163, 184, 0.45)"
                      strokeWidth="0.9"
                    />
                    <text
                      x={slice.lx}
                      y={slice.ly}
                      textAnchor={slice.textAnchor}
                      dominantBaseline="central"
                      className="cc-exposure-pie-label"
                    >
                      {slice.asset}
                    </text>
                  </g>
                ) : null
              )}
            </svg>
            <div className="cc-exposure-pie-legend" aria-label="Exposure breakdown">
              {geometry.slice(0, 5).map((slice) => (
                <div
                  key={`legend-${slice.asset}`}
                  className={`cc-exposure-pie-legend-item${hoveredAsset === slice.asset ? ' is-active' : ''}`}
                  onMouseEnter={() => setHoveredAsset(slice.asset)}
                  onMouseLeave={() => setHoveredAsset(null)}
                  title={`${slice.asset}: ${formatMt5SpaceGroupedMoney(slice.netUsd, decimals)} ${currency} (${(slice.ratio * 100).toFixed(1)}%)`}
                >
                  <span className="cc-exposure-pie-legend-dot" style={{ backgroundColor: slice.color }} />
                  <span className="cc-exposure-pie-legend-asset">{slice.asset}</span>
                  <span className="cc-exposure-pie-legend-pct">{(slice.ratio * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
            {activeSlice && (
              <div className="cc-exposure-pie-tooltip" role="status">
                <span className="cc-exposure-pie-tooltip-swatch" style={{ background: activeSlice.color }} />
                <strong>{activeSlice.asset}</strong>
                <span>{formatMt5SpaceGroupedMoney(activeSlice.netUsd, decimals)} {currency}</span>
                <span>({(activeSlice.ratio * 100).toFixed(1)}%)</span>
              </div>
            )}
          </>
        ) : (
          <div className="cc-exposure-chart-empty">No {titleLabel.toLowerCase()} exposure</div>
        )}
      </div>
    </aside>
  );
}

function ExposureContextMenu({
  x,
  y,
  currency,
  diagramDirection,
  diagramBasis,
  diagramHidden,
  autoArrange,
  showGrid,
  onSelectCurrency,
  onSelectDiagramDirection,
  onSelectDiagramBasis,
  onToggleDiagramHidden,
  onCopy,
  onExportReport,
  onResetSortOrder,
  onToggleAutoArrange,
  onToggleGrid,
  onClose,
}) {
  const menuRef = useRef(null);
  const [openSubmenu, setOpenSubmenu] = useState(null);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  const menuWidth = 188;
  const menuHeight = 204;
  const safeLeft = typeof window !== 'undefined'
    ? Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8))
    : x;
  const safeTop = typeof window !== 'undefined'
    ? Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8))
    : y;
  const flipSubmenuLeft = typeof window !== 'undefined' && safeLeft + menuWidth + 190 > window.innerWidth;

  const portalRoot = (typeof document !== 'undefined' && document.querySelector('.rtx5-command-shell')) || document.body;

  return createPortal(
    <div
      ref={menuRef}
      className={`cc-journal-context-menu${flipSubmenuLeft ? ' flip-submenu-left' : ''}`}
      role="menu"
      aria-label="Exposure context menu"
      style={{ left: safeLeft, top: safeTop }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div
        className="cc-journal-context-menu-submenu-wrap"
        onMouseEnter={() => setOpenSubmenu('currency')}
        onMouseLeave={() => setOpenSubmenu((prev) => (prev === 'currency' ? null : prev))}
      >
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={openSubmenu === 'currency'}
          className={`cc-journal-context-menu-item${openSubmenu === 'currency' ? ' is-open' : ''}`}
          onClick={() => setOpenSubmenu((prev) => (prev === 'currency' ? null : 'currency'))}
        >
          <span className="cc-journal-ctx-icon" aria-hidden="true" />
          <span className="cc-journal-ctx-label">Currency</span>
          <span className="cc-journal-ctx-arrow" aria-hidden="true">▸</span>
        </button>
        {openSubmenu === 'currency' && (
          <div className="cc-journal-context-submenu" role="menu" aria-label="Exposure currency">
            {SUMMARY_CURRENCIES.map((item) => {
              const active = currency === item;
              return (
                <button
                  key={item}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={active}
                  className="cc-journal-context-menu-item"
                  onClick={() => {
                    onSelectCurrency(item);
                    onClose();
                  }}
                >
                  <span className="cc-journal-ctx-icon is-check" aria-hidden="true">
                    {active ? <Check size={13} strokeWidth={2.2} /> : null}
                  </span>
                  <span className="cc-journal-ctx-label">{item}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div
        className="cc-journal-context-menu-submenu-wrap"
        onMouseEnter={() => setOpenSubmenu('diagram')}
        onMouseLeave={() => setOpenSubmenu((prev) => (prev === 'diagram' ? null : prev))}
      >
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={openSubmenu === 'diagram'}
          className={`cc-journal-context-menu-item${openSubmenu === 'diagram' ? ' is-open' : ''}`}
          onClick={() => setOpenSubmenu((prev) => (prev === 'diagram' ? null : 'diagram'))}
        >
          <span className="cc-journal-ctx-icon" aria-hidden="true" />
          <span className="cc-journal-ctx-label">Diagram</span>
          <span className="cc-journal-ctx-arrow" aria-hidden="true">▸</span>
        </button>
        {openSubmenu === 'diagram' && (
          <div className="cc-journal-context-submenu" role="menu" aria-label="Exposure diagram mode">
            {[
              { id: 'long', label: 'Long Positions' },
              { id: 'short', label: 'Short Positions' },
            ].map((mode) => {
              const active = !diagramHidden && diagramDirection === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={active}
                  className="cc-journal-context-menu-item"
                  onClick={() => {
                    onSelectDiagramDirection(mode.id);
                    onClose();
                  }}
                >
                  <span className="cc-journal-ctx-icon is-check" aria-hidden="true">
                    {active ? <Check size={13} strokeWidth={2.2} /> : null}
                  </span>
                  <span className="cc-journal-ctx-label">{mode.label}</span>
                </button>
              );
            })}

            <div className="cc-journal-context-menu-separator" role="separator" />

            {[
              { id: 'clients', label: 'Clients' },
              { id: 'coverage', label: 'Coverage' },
              { id: 'net', label: 'Net Total' },
            ].map((basis) => {
              const active = !diagramHidden && diagramBasis === basis.id;
              return (
                <button
                  key={basis.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={active}
                  className="cc-journal-context-menu-item"
                  onClick={() => {
                    onSelectDiagramBasis(basis.id);
                    onClose();
                  }}
                >
                  <span className="cc-journal-ctx-icon is-check" aria-hidden="true">
                    {active ? <Check size={13} strokeWidth={2.2} /> : null}
                  </span>
                  <span className="cc-journal-ctx-label">{basis.label}</span>
                </button>
              );
            })}

            <div className="cc-journal-context-menu-separator" role="separator" />

            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={diagramHidden}
              className="cc-journal-context-menu-item"
              onClick={() => {
                onToggleDiagramHidden();
                onClose();
              }}
            >
              <span className="cc-journal-ctx-icon is-check" aria-hidden="true">
                {diagramHidden ? <Check size={13} strokeWidth={2.2} /> : null}
              </span>
              <span className="cc-journal-ctx-label">Hide</span>
            </button>
          </div>
        )}
      </div>

      <div className="cc-journal-context-menu-separator" role="separator" />

      <button
        type="button"
        role="menuitem"
        className="cc-journal-context-menu-item"
        onMouseEnter={() => setOpenSubmenu(null)}
        onClick={() => {
          onCopy();
          onClose();
        }}
      >
        <span className="cc-journal-ctx-icon is-copy" aria-hidden="true">
          <Copy size={13} strokeWidth={1.8} />
        </span>
        <span className="cc-journal-ctx-label">Copy</span>
        <span className="cc-journal-ctx-shortcut">Ctrl+C</span>
      </button>

      <div className="cc-journal-context-menu-separator" role="separator" />

      <div
        className="cc-journal-context-menu-submenu-wrap"
        onMouseEnter={() => setOpenSubmenu('report')}
        onMouseLeave={() => setOpenSubmenu((prev) => (prev === 'report' ? null : prev))}
      >
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={openSubmenu === 'report'}
          className={`cc-journal-context-menu-item${openSubmenu === 'report' ? ' is-open' : ''}`}
          onClick={() => setOpenSubmenu((prev) => (prev === 'report' ? null : 'report'))}
        >
          <span className="cc-journal-ctx-icon" aria-hidden="true" />
          <span className="cc-journal-ctx-label">Report</span>
          <span className="cc-journal-ctx-arrow" aria-hidden="true">▸</span>
        </button>
        {openSubmenu === 'report' && (
          <div className="cc-journal-context-submenu" role="menu" aria-label="Export exposure report">
            <button
              type="button"
              role="menuitem"
              className="cc-journal-context-menu-item"
              onClick={() => {
                onExportReport('xml');
                onClose();
              }}
            >
              <span className="cc-journal-ctx-icon" aria-hidden="true" />
              <span className="cc-journal-ctx-label">XML (MS Office Excel)</span>
              <span className="cc-journal-ctx-shortcut">Ctrl+E</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="cc-journal-context-menu-item"
              onClick={() => {
                onExportReport('html');
                onClose();
              }}
            >
              <span className="cc-journal-ctx-icon" aria-hidden="true" />
              <span className="cc-journal-ctx-label">HTML (Internet Explorer)</span>
              <span className="cc-journal-ctx-shortcut">Ctrl+H</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="cc-journal-context-menu-item"
              onClick={() => {
                onExportReport('csv');
                onClose();
              }}
            >
              <span className="cc-journal-ctx-icon" aria-hidden="true" />
              <span className="cc-journal-ctx-label">CSV (Text file)</span>
            </button>
          </div>
        )}
      </div>

      <div className="cc-journal-context-menu-separator" role="separator" />

      <button
        type="button"
        role="menuitem"
        className="cc-journal-context-menu-item"
        onMouseEnter={() => setOpenSubmenu(null)}
        onClick={() => {
          onResetSortOrder();
          onClose();
        }}
      >
        <span className="cc-journal-ctx-icon" aria-hidden="true" />
        <span className="cc-journal-ctx-label">Reset Sort Order</span>
        <span className="cc-journal-ctx-shortcut">R</span>
      </button>

      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={autoArrange}
        className="cc-journal-context-menu-item"
        onMouseEnter={() => setOpenSubmenu(null)}
        onClick={() => {
          onToggleAutoArrange();
          onClose();
        }}
      >
        <span className="cc-journal-ctx-icon is-check" aria-hidden="true">
          {autoArrange ? <Check size={13} strokeWidth={2.2} /> : null}
        </span>
        <span className="cc-journal-ctx-label">Auto Arrange</span>
        <span className="cc-journal-ctx-shortcut">A</span>
      </button>

      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={showGrid}
        className="cc-journal-context-menu-item"
        onMouseEnter={() => setOpenSubmenu(null)}
        onClick={() => {
          onToggleGrid();
          onClose();
        }}
      >
        <span className="cc-journal-ctx-icon is-check" aria-hidden="true">
          {showGrid ? <Check size={13} strokeWidth={2.2} /> : null}
        </span>
        <span className="cc-journal-ctx-label">Grid</span>
        <span className="cc-journal-ctx-shortcut">G</span>
      </button>
    </div>,
    portalRoot
  );
}

function ExposureTab({ needle, isAuthenticated, canViewPositions }) {
  const positions = usePositionsBook(isAuthenticated && canViewPositions);
  const symbols = useSymbolStore((state) => state.symbols);
  const scope = getDataAccessScope();
  const apiExposureQuery = useQuery({
    queryKey: ['terminal-exposure-api', scope],
    queryFn: fetchExposure,
    enabled: Boolean(isAuthenticated && canViewPositions),
    staleTime: 10_000,
    refetchInterval: isAuthenticated && canViewPositions ? 15_000 : false,
    retry: false,
    meta: { suppressGlobalLoader: true },
  });

  const [selectedAsset, setSelectedAsset] = useState(null);
  const [exposureCurrency, setExposureCurrency] = useState('USD');
  const [diagramDirection, setDiagramDirection] = useState('long');
  const [diagramBasis, setDiagramBasis] = useState('net');
  const [diagramHidden, setDiagramHidden] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [autoArrange, setAutoArrange] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [contextMenu, setContextMenu] = useState(null);
  const sectionRef = useRef(null);

  const exposureModel = useMemo(
    () =>
      buildMt5AssetExposure({
        positions: positions.rows,
        symbols,
        apiExposureRows: apiExposureQuery.data?.rows ?? EMPTY,
        currency: exposureCurrency,
      }),
    [positions.rows, symbols, apiExposureQuery.data?.rows, exposureCurrency]
  );

  const moneyDecimals = exposureCurrency === 'JPY' ? 0 : 2;
  const columns = useMemo(
    () => [
      'Asset',
      'Clients',
      'Coverage',
      'Net Total',
      'Rate',
      `Net Total (${exposureCurrency})`,
      `Positive (${exposureCurrency})`,
      'Graph',
    ],
    [exposureCurrency]
  );

  const enrichedRows = useMemo(
    () =>
      exposureModel.rows.map((row) => {
        const formattedClients = formatMt5ExposureCompactQty(row.clients);
        const formattedCoverage = formatMt5ExposureCompactQty(row.coverage);
        const formattedNet = formatMt5SpaceGroupedInt(row.net);
        const formattedRate = formatMt5ExposureRate(row.rate, row.digits);
        const formattedNetUsd = row.netUsd !== null ? formatMt5SpaceGroupedMoney(row.netUsd, moneyDecimals) : '—';
        const formattedPositiveUsd =
          row.positiveUsd !== null && row.positiveUsd > 0
            ? formatMt5SpaceGroupedMoney(row.positiveUsd, moneyDecimals)
            : '';

        return {
          ...row,
          formattedClients,
          formattedCoverage,
          formattedNet,
          formattedRate,
          formattedNetUsd,
          formattedPositiveUsd,
          cells: [
            row.asset,
            formattedClients,
            formattedCoverage,
            formattedNet,
            formattedRate,
            formattedNetUsd,
            formattedPositiveUsd,
          ],
        };
      }),
    [exposureModel.rows, moneyDecimals]
  );

  const filteredRows = useMemo(() => {
    const matched = enrichedRows.filter((row) => matchesNeedle(needle, [row.asset]));
    if (!sortConfig.key) return matched;
    const sorted = [...matched].sort((a, b) => {
      const valA = a[sortConfig.key];
      const valB = b[sortConfig.key];
      if (typeof valA === 'string' || typeof valB === 'string') {
        return String(valA || '').localeCompare(String(valB || ''), undefined, { numeric: true });
      }
      return Number(valA ?? 0) - Number(valB ?? 0);
    });
    return sortConfig.direction === 'desc' ? sorted.reverse() : sorted;
  }, [enrichedRows, needle, sortConfig]);

  const longSlicesForBasis = useMemo(
    () => buildMt5ExposureChartSlices(exposureModel.allRows, { direction: 'long', basis: diagramBasis }),
    [exposureModel.allRows, diagramBasis]
  );
  const shortSlicesForBasis = useMemo(
    () => buildMt5ExposureChartSlices(exposureModel.allRows, { direction: 'short', basis: diagramBasis }),
    [exposureModel.allRows, diagramBasis]
  );

  const effectiveDirection = useMemo(() => {
    if (diagramDirection === 'long' && longSlicesForBasis.length === 0 && shortSlicesForBasis.length > 0) {
      return 'short';
    }
    if (diagramDirection === 'short' && shortSlicesForBasis.length === 0 && longSlicesForBasis.length > 0) {
      return 'long';
    }
    return diagramDirection;
  }, [diagramDirection, longSlicesForBasis.length, shortSlicesForBasis.length]);

  const activeChartSlices = effectiveDirection === 'short' ? shortSlicesForBasis : longSlicesForBasis;
  const diagramTitle = useMemo(
    () => getMt5ExposureDiagramTitle({ direction: effectiveDirection, basis: diagramBasis }),
    [effectiveDirection, diagramBasis]
  );

  const handleHeaderClick = useCallback((colIndex) => {
    const sortKey = EXPOSURE_SORT_KEYS[colIndex];
    if (!sortKey) return;
    setSortConfig((prev) => {
      if (prev.key === sortKey) {
        return { key: sortKey, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key: sortKey, direction: 'asc' };
    });
  }, []);

  const totalNetFormatted = formatMt5SpaceGroupedMoney(exposureModel.totals.netUsd, moneyDecimals);
  const totalPositiveFormatted = formatMt5SpaceGroupedMoney(exposureModel.totals.positiveUsd, moneyDecimals);

  const handleCopyExposure = useCallback(
    async (targetRow = null) => {
      const activeRow = targetRow || filteredRows.find((r) => r.asset === selectedAsset) || null;
      const exportColumns = columns.slice(0, 7);
      const totalLine = ['Total', '', '', '', '', totalNetFormatted, totalPositiveFormatted].join('\t');
      const text = activeRow
        ? activeRow.cells.join('\t')
        : [exportColumns.join('\t'), ...filteredRows.map((r) => r.cells.join('\t')), totalLine].join('\n');
      if (!text) return;
      try {
        await navigator.clipboard?.writeText(text);
      } catch {
        // Clipboard write may be restricted in non-secure contexts.
      }
    },
    [filteredRows, selectedAsset, columns, totalNetFormatted, totalPositiveFormatted]
  );

  const handleExportReport = useCallback(
    (format) => {
      const exportColumns = columns.slice(0, 7);
      const totalCells = ['Total', '', '', '', '', totalNetFormatted, totalPositiveFormatted];
      if (format === 'csv') {
        const csvLines = [
          exportColumns.map((col) => `"${String(col).replace(/"/g, '""')}"`).join(','),
          ...filteredRows.map((row) => row.cells.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
          totalCells.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','),
        ];
        downloadBlob(csvLines.join('\r\n'), 'text/csv;charset=utf-8', 'exposure-report.csv');
        return;
      }

      if (format === 'html') {
        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Exposure Report</title>
<style>
  body { font-family: Tahoma, Arial, sans-serif; font-size: 12px; background: #ffffff; color: #111827; margin: 20px; }
  h2 { font-size: 15px; margin-bottom: 10px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: right; white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; }
  th { background: #f1f5f9; font-weight: 600; }
  tr:nth-child(even) { background: #f8fafc; }
  tfoot td { font-weight: 700; background: #f1f5f9; }
</style>
</head>
<body>
<h2>Exposure Report (${escapeXml(exposureCurrency)})</h2>
<table>
  <thead>
    <tr>${exportColumns.map((col) => `<th>${escapeXml(col)}</th>`).join('')}</tr>
  </thead>
  <tbody>
    ${filteredRows.map((row) => `<tr>${row.cells.map((cell) => `<td>${escapeXml(cell)}</td>`).join('')}</tr>`).join('\n    ')}
  </tbody>
  <tfoot>
    <tr>${totalCells.map((cell) => `<td>${escapeXml(cell)}</td>`).join('')}</tr>
  </tfoot>
</table>
</body>
</html>`;
        downloadBlob(html, 'text/html;charset=utf-8', 'exposure-report.html');
        return;
      }

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Exposure">
  <Table>
   <Row>${exportColumns.map((col) => `<Cell><Data ss:Type="String">${escapeXml(col)}</Data></Cell>`).join('')}</Row>
   ${filteredRows.map((row) => `<Row>${row.cells.map((cell) => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join('')}</Row>`).join('\n   ')}
   <Row>${totalCells.map((cell) => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join('')}</Row>
  </Table>
 </Worksheet>
</Workbook>`;
      downloadBlob(xml, 'application/vnd.ms-excel;charset=utf-8', 'exposure-report.xml');
    },
    [columns, filteredRows, exposureCurrency, totalNetFormatted, totalPositiveFormatted]
  );

  const handleContextMenu = useCallback((event, row = null) => {
    event.preventDefault();
    event.stopPropagation();
    if (row) {
      setSelectedAsset(row.asset);
    }
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      row,
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          activeEl.isContentEditable);
      if (isInput) return;

      const terminal = sectionRef.current?.closest('[data-panel-id]') || sectionRef.current;
      const insideExposure = Boolean(terminal && terminal.contains(activeEl));
      if (!selectedAsset && !insideExposure) return;

      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
        if (key === 'c') {
          const selectionText = typeof window !== 'undefined' ? String(window.getSelection?.() || '') : '';
          if (!selectionText) {
            event.preventDefault();
            void handleCopyExposure(null);
          }
        } else if (key === 'e') {
          event.preventDefault();
          handleExportReport('xml');
        } else if (key === 'h') {
          event.preventDefault();
          handleExportReport('html');
        }
        return;
      }

      if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        if (key === 'r') {
          event.preventDefault();
          setSortConfig({ key: null, direction: 'asc' });
        } else if (key === 'a') {
          event.preventDefault();
          setAutoArrange((prev) => !prev);
        } else if (key === 'g') {
          event.preventDefault();
          setShowGrid((prev) => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAsset, handleCopyExposure, handleExportReport]);

  const busy = positions.isFetching || apiExposureQuery.isFetching;
  const tableModifiers = [
    'cc-exposure-table',
    !showGrid ? 'is-no-grid' : '',
    !autoArrange ? 'is-manual-arrange' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const emptyMessage = positions.isLoading
    ? 'Loading symbol exposure…'
    : positions.isError && !filteredRows.length
      ? 'Unable to load symbol exposure.'
      : needle
        ? 'No assets match the search.'
        : 'No open exposure.';

  return (
    <section
      ref={sectionRef}
      className="cc-operations-view cc-exposure-operations-view"
      aria-label="Exposure view"
      tabIndex={-1}
      onContextMenu={(event) => handleContextMenu(event, null)}
    >
      {!isAuthenticated ? (
        <div className="operations-empty">Sign in to view exposure.</div>
      ) : !canViewPositions ? (
        <div className="operations-empty">Your manager account does not have permission to view exposure.</div>
      ) : (
        <>
          {positions.isError && <Notice>Position refresh failed. Showing available snapshot values.</Notice>}
          <div className="cc-exposure-split-layout">
            <div className="cc-terminal-table-wrap cc-exposure-table-pane">
              <table className={`cc-terminal-table ${tableModifiers}`.trim()} aria-label="Symbol exposure" aria-busy={busy}>
                <colgroup>
                  {columns.map((col) => (
                    <col key={col} className="cc-exposure-col" />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {columns.map((col, idx) => (
                      <th
                        key={col}
                        scope="col"
                        onClick={() => handleHeaderClick(idx)}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const isSelected = selectedAsset === row.asset;
                    return (
                      <tr
                        key={row.asset}
                        className={isSelected ? 'is-selected' : undefined}
                        aria-selected={isSelected}
                        onClick={() => setSelectedAsset((prev) => (prev === row.asset ? null : row.asset))}
                        onContextMenu={(event) => handleContextMenu(event, row)}
                      >
                        <td className="cc-exposure-cell-asset" title={row.asset}>
                          <span className="cc-exposure-asset-name">{row.asset}</span>
                        </td>
                        <td className="cc-exposure-cell-num">{row.formattedClients}</td>
                        <td className="cc-exposure-cell-num">{row.formattedCoverage}</td>
                        <td className="cc-exposure-cell-num">{row.formattedNet}</td>
                        <td className="cc-exposure-cell-num">{row.formattedRate}</td>
                        <td className="cc-exposure-cell-num">{row.formattedNetUsd}</td>
                        <td className="cc-exposure-cell-num">{row.formattedPositiveUsd}</td>
                        <td className="cc-exposure-cell-graph">
                          <div className="cc-exposure-graph-cell-inner">
                            <Mt5ExposureGraphBar
                              clientsBarPct={row.clientsBarPct}
                              netBarPct={row.netBarPct}
                              title={`Clients: ${row.formattedClients} | Net Total (${exposureCurrency}): ${row.formattedNetUsd}`}
                            />
                            <span
                              className="cc-exposure-color-swatch"
                              style={{ backgroundColor: row.color }}
                              title={`${row.asset}: ${row.formattedNetUsd} ${exposureCurrency}`}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="operations-empty">
                        {emptyMessage}
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="cc-exposure-total-row">
                    <td className="cc-exposure-cell-asset is-total">
                      <strong className="cc-exposure-total-label">Total</strong>
                    </td>
                    <td className="cc-exposure-cell-num" />
                    <td className="cc-exposure-cell-num" />
                    <td className="cc-exposure-cell-num" />
                    <td className="cc-exposure-cell-num" />
                    <td className="cc-exposure-cell-num is-total">
                      <strong>{totalNetFormatted}</strong>
                    </td>
                    <td className="cc-exposure-cell-num is-total">
                      <strong>{totalPositiveFormatted}</strong>
                    </td>
                    <td className="cc-exposure-cell-graph" />
                  </tr>
                </tfoot>
              </table>
            </div>

            {!diagramHidden && (
              <Mt5ExposurePieChart
                slices={activeChartSlices}
                chartMode={effectiveDirection === 'short' ? 'shorts' : 'longs'}
                title={diagramTitle}
                currency={exposureCurrency}
                onToggleMode={() => setDiagramDirection((prev) => (prev === 'long' ? 'short' : 'long'))}
                onContextMenu={(event) => handleContextMenu(event, null)}
              />
            )}
          </div>

          {contextMenu && (
            <ExposureContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              currency={exposureCurrency}
              diagramDirection={effectiveDirection}
              diagramBasis={diagramBasis}
              diagramHidden={diagramHidden}
              autoArrange={autoArrange}
              showGrid={showGrid}
              onSelectCurrency={setExposureCurrency}
              onSelectDiagramDirection={(dir) => {
                setDiagramHidden(false);
                setDiagramDirection(dir);
              }}
              onSelectDiagramBasis={(basis) => {
                setDiagramHidden(false);
                setDiagramBasis(basis);
              }}
              onToggleDiagramHidden={() => setDiagramHidden((prev) => !prev)}
              onCopy={() => void handleCopyExposure(contextMenu.row)}
              onExportReport={handleExportReport}
              onResetSortOrder={() => setSortConfig({ key: null, direction: 'asc' })}
              onToggleAutoArrange={() => setAutoArrange((prev) => !prev)}
              onToggleGrid={() => setShowGrid((prev) => !prev)}
              onClose={() => setContextMenu(null)}
            />
          )}
        </>
      )}
    </section>
  );
}

function AlertsTab({ needle, isAuthenticated }) {
  const data = useMarginAlerts(isAuthenticated);
  const rows = useMemo(() => [...data.alerts, ...data.unresolved.map((row) => ({ ...row, label: 'Data unavailable', type: 'unavailable' }))], [data.alerts, data.unresolved]);
  const book = useFilteredPage(rows, needle, alertSearch);
  return <OperationsView label="Alerts" subtitle="Margin call and stop out · broker thresholds" isAuthenticated={isAuthenticated}
    allowed={data.canViewAccounts} busy={data.isFetching} updatedAt={data.dataUpdatedAt} onRefresh={data.refetch}>
    {data.isError && <Notice>Account or group refresh failed. Alert coverage may be incomplete.</Notice>}
    {data.unresolved.length > 0 && <Notice>{data.unresolved.length} {data.unresolved.length === 1 ? 'account cannot' : 'accounts cannot'} be checked until margin readings and broker thresholds are available.</Notice>}
    <TerminalTable label="Margin alerts" busy={data.isFetching} columns={['Login', 'Name', 'Group', 'Status', 'Margin level', 'Threshold', 'Details']}
      empty={data.isLoading ? 'Checking account margins…' : data.isError ? 'Unable to complete margin checks.' : needle ? 'No alerts match the search.' : 'No accounts at margin-call or stop-out level.'}>
      {book.rows.map((row) => <tr key={row.login}>
        <td>{row.login}</td><td title={row.name}>{row.name || '—'}</td><td title={row.group}>{row.group || '—'}</td>
        <td><span className={`operations-severity ${row.type}`}>{row.label}</span></td>
        <td>{row.marginLevel == null ? '—' : `${fmtNumber(row.marginLevel)}%`}</td><td>{row.threshold == null ? '—' : `${fmtNumber(row.threshold)}%`}</td>
        <td>{row.reason || 'At or below the configured broker threshold'}</td>
      </tr>)}
    </TerminalTable>
    <Pagination book={book} unit="alerts" />
  </OperationsView>;
}

function DealingTab({ needle, isAuthenticated }) {
  const { resolved, hasPermission } = usePermissions();
  const allowed = resolved && hasPermission(PERMISSIONS.DEALER_QUEUE);
  const query = useQuery({ queryKey: ['terminal-dealing-queue', getDataAccessScope()], queryFn: getDealerQueue,
    enabled: isAuthenticated && allowed, staleTime: 4000, refetchInterval: isAuthenticated && allowed ? 5000 : false,
    meta: { suppressGlobalLoader: true } });
  const book = useFilteredPage(isAuthenticated && allowed && !denied(query) ? query.data ?? EMPTY : EMPTY, needle, dealerSearch);
  return <OperationsView label="Dealing" subtitle="Pending dealer requests · refreshes every 5s" isAuthenticated={isAuthenticated}
    allowed={allowed} busy={query.isFetching} updatedAt={query.dataUpdatedAt} onRefresh={query.refetch}>
    {query.isError && <Notice>The dealer queue could not be refreshed. Use Refresh to retry.</Notice>}
    <TerminalTable label="Dealer queue" busy={query.isFetching} columns={['Request', 'Ticket', 'Login', 'Symbol', 'Side', 'Lots', 'Requested price', 'Reason', 'Time', 'Comment']}
      empty={query.isLoading ? 'Loading dealer requests…' : query.isError ? 'Dealer requests unavailable.' : needle ? 'No requests match the search.' : 'The dealer queue is empty.'}>
      {book.rows.map((row) => <tr key={row.id}>
        <td>{row.id}</td><td>{row.orderTicket || '—'}</td><td>{row.accountLogin || '—'}</td><td>{row.symbol || '—'}</td>
        <td className={row.side === 'buy' ? 'operations-positive' : row.side === 'sell' ? 'operations-negative' : undefined}>{row.side?.toUpperCase() || '—'}</td>
        <td>{row.volume > 0 ? fmtNumber(row.volume) : '—'}</td><td>{fmtPrice(row.requestedPrice)}</td><td>{row.reason || '—'}</td><td>{fmtClock(row.queuedAt)}</td><td title={row.comment}>{row.comment || '—'}</td>
      </tr>)}
    </TerminalTable>
    <Pagination book={book} unit="requests" />
  </OperationsView>;
}

function SearchTab({ search, isAuthenticated }) {
  const queryClient = useQueryClient();
  const scope = getDataAccessScope();
  const key = ['terminal-search-positions', scope];
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let timer;
    const unsubscribe = subscribeToPositionSync((event) => {
      if (event?.type === 'position' && !requiresPositionReconciliation(event?.payload)) return;
      if (event?.type !== 'position' && event?.reason !== 'reconciled') return;
      if (timer) return;
      timer = setTimeout(() => { timer = undefined; queryClient.invalidateQueries({ queryKey: ['terminal-search-positions', scope] }, { cancelRefetch: false }); }, 200);
    });
    return () => { unsubscribe(); clearTimeout(timer); };
  }, [isAuthenticated, scope, queryClient]);
  const query = usePagedData({ queryKey: key, queryFn: getPositionsPage,
    params: { search, sort_by: 'position', sort_dir: 'desc' }, pageSize: PAGE_SIZE, enabled: isAuthenticated,
    refetchOnMount: 'always', refetchOnReconnect: true, meta: { suppressGlobalLoader: true } });
  const rows = useLivePositions(!denied(query) ? query.rows : EMPTY, undefined, false, query.data?.liveRevision || 0);
  const book = { ...query, rows };
  return <OperationsView label="Search" subtitle="Find positions by account, ticket or symbol" isAuthenticated={isAuthenticated}
    busy={query.isFetching} updatedAt={query.dataUpdatedAt} onRefresh={() => { invalidateGlobalPositionsCache(); return query.refetch(); }}>
    {query.isError && <Notice>Position search failed. Use Refresh to retry.</Notice>}
    <TerminalTable label="Search positions" columns={TRADE_COLUMNS} busy={query.isFetching || query.isSearchDebouncing}
      empty={query.isLoading || query.isFetching ? 'Searching positions…' : query.isError ? 'Position search unavailable.' : search.trim() ? 'No positions match the search.' : 'No open positions.'}>
      {rows.map((row) => <tr key={`${row.login}-${row.position}`}>{tradeCells(row).map((cell, index) =>
        <td key={TRADE_COLUMNS[index]} title={String(cell)} className={TRADE_COLUMNS[index] === 'Profit / Loss' ? profitClass(row.profit) : undefined}>{cell}</td>)}</tr>)}
    </TerminalTable>
    <Pagination book={book} busy={query.isFetching || query.isSearchDebouncing} unit="positions" />
  </OperationsView>;
}

function NewsTab({ needle, isAuthenticated }) {
  const [entries, setEntries] = useState(() => getTerminalNewsEntries());
  useEffect(() => subscribeToTerminalNews((next) => setEntries(next)), []);
  const rows = useMemo(() => [...entries].reverse()
    .filter((entry) => matchesNeedle(needle, [entry.subject, entry.category])), [entries, needle]);
  return <TerminalTable label="Terminal news" columns={['Subject', 'Category', 'Time']}
    empty={!isAuthenticated ? 'Sign in to view news.' : entries.length ? 'No news entries match the search.' : 'No news yet — symbol and data changes will appear here.'}>
    {rows.map((entry) => <tr key={entry.id}><td title={entry.subject}>{entry.subject}</td><td>{entry.category}</td><td>{formatJournalTime(new Date(entry.time))}</td></tr>)}
  </TerminalTable>;
}

export default function TerminalTabContent({ tab, search = '', isAuthenticated = false, canViewPositions = false }) {
  const needle = search.trim().toLowerCase();
  switch (tab) {
    case 'summary': return <SummaryTab needle={needle} isAuthenticated={isAuthenticated} canViewPositions={canViewPositions} />;
    case 'exposure': return <ExposureTab needle={needle} isAuthenticated={isAuthenticated} canViewPositions={canViewPositions} />;
    case 'dealing': return <DealingTab needle={needle} isAuthenticated={isAuthenticated} />;
    case 'search': return canViewPositions ? <SearchTab search={search} isAuthenticated={isAuthenticated} /> : null;
    case 'alerts': return <AlertsTab needle={needle} isAuthenticated={isAuthenticated} />;
    case 'news': return <NewsTab needle={needle} isAuthenticated={isAuthenticated} />;
    case 'calendar': return <TerminalTable label="Economic calendar" columns={['Time', 'Event', 'Impact', 'Symbol']} empty="No economic calendar feed connected." />;
    default: return null;
  }
}
