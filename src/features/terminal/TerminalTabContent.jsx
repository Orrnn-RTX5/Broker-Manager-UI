import { Children, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
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
import { buildAccountSummary, buildSymbolExposure, positionLots, positionSide, readNumber } from './terminalOperationsData.js';
import useMarginAlerts from './useMarginAlerts.js';
import './TerminalOperations.css';

const EMPTY = [];
const PAGE_SIZE = 30;
const fmtNumber = (value) => value == null || !Number.isFinite(Number(value)) ? '—'
  : Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPrice = (value) => Number(value) > 0 ? String(value) : '—';
const fmtClock = (value) => Number(value) > 0
  ? new Date(Number(value) > 100000000000 ? Number(value) : Number(value) * 1000).toLocaleTimeString('en-GB', { hour12: false }) : '—';
const matchesNeedle = (needle, values) => !needle || values.join(' ').toLowerCase().includes(needle);
const denied = (query) => query.isError && [401, 403].includes(Number(query.error?.status));
const profitClass = (value) => value == null ? undefined : value < 0 ? 'operations-negative' : value > 0 ? 'operations-positive' : undefined;

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

const TerminalTable = ({ label, columns, children, empty, busy = false }) => (
  <div className="cc-terminal-table-wrap">
    <table className="cc-terminal-table" aria-label={label} aria-busy={busy}>
      <thead><tr>{columns.map((col) => <th key={col} scope="col">{col}</th>)}</tr></thead>
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
const summarySearch = (row) => [row.login, row.name, row.group, row.currency];
const exposureSearch = (row) => [row.symbol, row.currency];
const dealerSearch = (row) => [row.id, row.orderTicket, row.accountLogin, row.symbol, row.side, row.reason, row.comment];
const alertSearch = (row) => [row.login, row.name, row.group, row.label, row.reason];

function SummaryTab({ needle, isAuthenticated, canViewPositions }) {
  const accounts = useMarginAlerts(isAuthenticated);
  const positions = usePositionsBook(isAuthenticated && canViewPositions);
  const rows = useMemo(() => buildAccountSummary({ accounts: accounts.accounts, positions: positions.rows,
    positionsLoaded: positions.loaded }), [accounts.accounts, positions.rows, positions.loaded]);
  const book = useFilteredPage(rows, needle, summarySearch);
  const busy = accounts.isFetching || positions.isFetching;
  return <OperationsView label="Summary" subtitle="Account metrics and open positions" isAuthenticated={isAuthenticated}
    allowed={accounts.canViewAccounts || canViewPositions} busy={busy} updatedAt={Math.max(accounts.dataUpdatedAt, positions.dataUpdatedAt)}
    onRefresh={() => Promise.all([accounts.canViewAccounts ? accounts.refetch() : undefined, canViewPositions ? positions.refresh() : undefined])}>
    {accounts.isError && <Notice>Account or group refresh failed. Available values remain visible; use Refresh to retry.</Notice>}
    {positions.isError && <Notice>Position refresh failed. Position totals may be unavailable or from the last snapshot.</Notice>}
    {!canViewPositions && <Notice>Position totals require View Positions permission.</Notice>}
    <TerminalTable label="Account summary" busy={busy}
      columns={['Login', 'Name', 'Group', 'Currency', 'Balance', 'Equity', 'Used margin', 'Free margin', 'Margin level', 'Positions', 'Lots', 'Floating profit']}
      empty={busy ? 'Loading account summary…' : accounts.isError || positions.isError ? 'The account summary could not be loaded.' : needle ? 'No accounts match the search.' : 'No accounts or open positions.'}>
      {book.rows.map((row) => <tr key={row.login}>
        <td>{row.login}</td><td title={row.name}>{row.name || '—'}</td><td title={row.group}>{row.group || '—'}</td><td>{row.currency || '—'}</td>
        <td>{fmtNumber(row.balance)}</td><td>{fmtNumber(row.equity)}</td><td>{fmtNumber(row.margin)}</td><td>{fmtNumber(row.marginFree)}</td>
        <td>{row.marginLevel == null ? '—' : `${fmtNumber(row.marginLevel)}%`}</td><td>{row.positions ?? '—'}</td><td>{fmtNumber(row.lots)}</td>
        <td className={profitClass(row.profit)}>{fmtNumber(row.profit)}</td>
      </tr>)}
    </TerminalTable>
    <Pagination book={book} unit="accounts" />
  </OperationsView>;
}

function ExposureTab({ needle, isAuthenticated, canViewPositions }) {
  const positions = usePositionsBook(isAuthenticated && canViewPositions);
  const accounts = useMarginAlerts(isAuthenticated);
  const rows = useMemo(() => buildSymbolExposure(positions.rows, accounts.accounts), [positions.rows, accounts.accounts]);
  const book = useFilteredPage(rows, needle, exposureSearch);
  return <OperationsView label="Exposure" subtitle="Open client positions by symbol · volume in lots" isAuthenticated={isAuthenticated}
    allowed={canViewPositions} busy={positions.isFetching} updatedAt={positions.dataUpdatedAt} onRefresh={positions.refresh}>
    {positions.isError && <Notice>Position refresh failed. Showing available snapshot values.</Notice>}
    <TerminalTable label="Symbol exposure" busy={positions.isFetching}
      columns={['Symbol', 'Accounts', 'Positions', 'Buy lots', 'Sell lots', 'Net lots', 'Direction', 'Currency', 'Floating profit']}
      empty={positions.isLoading ? 'Loading symbol exposure…' : positions.isError ? 'Unable to load symbol exposure.' : needle ? 'No symbols match the search.' : 'No open positions.'}>
      {book.rows.map((row) => <tr key={row.symbol}>
        <td>{row.symbol}</td><td>{row.accounts}</td><td>{row.positions}</td><td className="operations-positive">{fmtNumber(row.buyLots)}</td>
        <td className="operations-negative">{fmtNumber(row.sellLots)}</td><td>{fmtNumber(row.netLots)}</td>
        <td>{row.netLots == null ? 'Unavailable' : Math.abs(row.netLots) < 1e-9 ? 'Flat' : row.netLots > 0 ? 'Net buy' : 'Net sell'}</td>
        <td>{row.currency || (row.mixedCurrencies ? 'Multiple' : '—')}</td><td className={profitClass(row.profit)} title={row.currency ? row.currency : 'A single profit currency is required'}>{fmtNumber(row.profit)}</td>
      </tr>)}
    </TerminalTable>
    <Pagination book={book} unit="symbols" />
  </OperationsView>;
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
