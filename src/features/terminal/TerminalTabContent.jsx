import ExposurePage from '../exposure/ExposurePage';
import { Children, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import usePagedData from '../../hooks/usePagedData';
import { fetchAllPositionsDataset, getPositionsPage } from '../../services/api';
import { getDealerQueue } from '../../services/tradeApi';
import { subscribeToPositionSync } from '../../services/positionSync';
import { normalizePagedResult } from '../../utils/pagination';
import { TRADE_COLUMNS, tradeCells } from './terminalTrades.js';
import { formatJournalTime } from './tradeJournalCore.js';
import { getTerminalNewsEntries, subscribeToTerminalNews } from './terminalNews.js';
import useMarginAlerts from './useMarginAlerts.js';

const TERMINAL_BOOK_QUERY_KEY = ['terminal-positions-book'];
const TERMINAL_DEALING_QUERY_KEY = ['terminal-dealing-queue'];

const recordLots = (record) => {
  const volumeExt = Number(record?.volumeExt);
  if (Number.isFinite(volumeExt) && volumeExt !== 0) return volumeExt / 10000;
  const lots = Number(record?.lots ?? record?.volume ?? 0);
  return Number.isFinite(lots) ? lots : 0;
};
const recordProfit = (record) => {
  const profit = Number(record?.profit ?? record?.Profit ?? 0);
  return Number.isFinite(profit) ? profit : 0;
};

const fmtLots = (value) => Number(value || 0).toFixed(2);
const fmtMoney = (value) => Number(value || 0).toFixed(2);
const fmtPrice = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric !== 0 ? String(numeric) : '—';
};
const fmtClock = (epochSeconds) => {
  const numeric = Number(epochSeconds);
  if (!Number.isFinite(numeric) || numeric <= 0) return '—';
  const ms = numeric > 100000000000 ? numeric : numeric * 1000;
  return new Date(ms).toLocaleTimeString('en-GB', { hour12: false });
};

// The merged position book is kept fresh by the OnPositionUpdate stream, so
// reading it through fetchAllPositionsDataset is cheap — the query only serves
// as the React binding that repaints aggregates when frames land.
const usePositionsBook = (enabled) => {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return undefined;
    let timer;
    const unsubscribe = subscribeToPositionSync((event) => {
      if (event?.reason === 'connected' || timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        queryClient.invalidateQueries({ queryKey: TERMINAL_BOOK_QUERY_KEY }, { cancelRefetch: false });
      }, 200);
    });
    return () => { unsubscribe(); clearTimeout(timer); };
  }, [enabled, queryClient]);

  return useQuery({
    queryKey: TERMINAL_BOOK_QUERY_KEY,
    queryFn: () => fetchAllPositionsDataset(),
    enabled,
    staleTime: 1000,
    placeholderData: (previous) => previous,
  });
};

const TerminalTable = ({ label, columns, children, empty }) => (
  <div className="cc-terminal-table-wrap">
    <table className="cc-terminal-table" aria-label={label}>
      <thead><tr>{columns.map((col) => <th key={col} scope="col">{col}</th>)}</tr></thead>
      <tbody>
        {children}
        {Children.count(children) === 0 && empty ? (
          <tr><td colSpan={columns.length}>{empty}</td></tr>
        ) : null}
      </tbody>
    </table>
  </div>
);

const matchesNeedle = (needle, values) => (
  !needle || values.join(' ').toLowerCase().includes(needle)
);

function SummaryTab({ needle, isAuthenticated }) {
  const { data = [], isLoading, isError } = usePositionsBook(isAuthenticated);
  const rows = useMemo(() => {
    const byLogin = new Map();
    data.forEach((record) => {
      const login = String(record?.login ?? record?.Login ?? '');
      if (!login) return;
      const row = byLogin.get(login) || { login, positions: 0, volume: 0, profit: 0 };
      row.positions += 1;
      row.volume += recordLots(record);
      row.profit += recordProfit(record);
      byLogin.set(login, row);
    });
    return [...byLogin.values()]
      .filter((row) => matchesNeedle(needle, [row.login]))
      .sort((a, b) => a.login.localeCompare(b.login, undefined, { numeric: true }));
  }, [data, needle]);

  return (
    <div className="cc-terminal-summary">
      <section className="cc-terminal-summary-pane" aria-label="Account summary">
        <header className="cc-terminal-summary-title">
          Accounts<span>{rows.length}</span>
        </header>
        <TerminalTable
          label="Account summary"
          columns={['Login', 'Positions', 'Volume', 'Profit']}
          empty={!isAuthenticated
            ? 'Sign in to view the account summary.'
            : isLoading
              ? 'Loading positions…'
              : isError
                ? 'Unable to load the summary.'
                : 'No open positions.'}
        >
          {rows.map((row) => (
            <tr key={row.login}>
              <td title={row.login}>{row.login}</td>
              <td>{row.positions}</td>
              <td>{fmtLots(row.volume)}</td>
              <td>{fmtMoney(row.profit)}</td>
            </tr>
          ))}
        </TerminalTable>
      </section>
      <SummaryAlerts needle={needle} isAuthenticated={isAuthenticated} />
    </div>
  );
}

function SummaryAlerts({ needle, isAuthenticated }) {
  const { alerts, isLoading, isError } = useMarginAlerts(isAuthenticated);
  const rows = useMemo(() => alerts
    .filter((alert) => matchesNeedle(needle, [alert.login, alert.name, alert.group, alert.label])), [alerts, needle]);

  return (
    <section className="cc-terminal-summary-pane is-alerts" aria-label="Alerts">
      <header className="cc-terminal-summary-title">
        Alerts<span className={alerts.length ? 'has-alerts' : undefined}>{alerts.length}</span>
      </header>
      <TerminalTable
        label="Margin alerts"
        columns={['Login', 'Name', 'Alert', 'Margin level', 'Level']}
        empty={!isAuthenticated
          ? 'Sign in to view alerts.'
          : isLoading
            ? 'Checking accounts…'
            : isError
              ? 'Unable to check alerts.'
              : alerts.length
                ? 'No alerts match the search.'
                : 'No alerts'}
      >
        {rows.map((alert) => (
          <tr key={alert.login}>
            <td title={alert.login}>{alert.login}</td>
            <td title={alert.group ? `${alert.name} · ${alert.group}` : alert.name}>{alert.name || '—'}</td>
            <td>
              <span className={`ui-status ${alert.type === 'stop-out' ? 'ui-status-danger' : 'ui-status-warn'}`}>{alert.label}</span>
            </td>
            <td>{fmtMoney(alert.marginLevel)}%</td>
            <td>{fmtMoney(alert.threshold)}%</td>
          </tr>
        ))}
      </TerminalTable>
    </section>
  );
}

function ExposureTab({ needle, isAuthenticated }) {
  return <ExposurePage compact needle={needle} isAuthenticated={isAuthenticated} />;
}

function NewsTab({ needle, isAuthenticated }) {
  const [entries, setEntries] = useState(() => getTerminalNewsEntries());
  useEffect(() => subscribeToTerminalNews((next) => setEntries(next)), []);
  const rows = useMemo(() => [...entries].reverse()
    .filter((entry) => matchesNeedle(needle, [entry.subject, entry.category])), [entries, needle]);

  return (
    <TerminalTable
      label="Terminal news"
      columns={['Subject', 'Category', 'Time']}
      empty={!isAuthenticated
        ? 'Sign in to view news.'
        : entries.length
          ? 'No news entries match the search.'
          : 'No news yet — symbol and data changes will appear here.'}
    >
      {rows.map((entry) => (
        <tr key={entry.id}>
          <td title={entry.subject}>{entry.subject}</td>
          <td>{entry.category}</td>
          <td>{formatJournalTime(new Date(entry.time))}</td>
        </tr>
      ))}
    </TerminalTable>
  );
}

const DEALING_COLUMNS = ['Login', 'Symbol', 'Side', 'Volume', 'Price', 'Reason', 'Time', 'Comment'];

function DealingTab({ needle, isAuthenticated }) {
  const { rows, isLoading, isError, isFetching } = usePagedData({
    queryKey: TERMINAL_DEALING_QUERY_KEY,
    queryFn: (params) => getDealerQueue()
      .then((queue) => normalizePagedResult(queue, params, (row) => row)),
    params: {},
    pageSize: 200,
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });
  const filtered = needle
    ? rows.filter((row) => matchesNeedle(needle, [row.accountLogin, row.symbol, row.side, row.reason, row.comment]))
    : rows;

  return (
    <TerminalTable
      label="Dealer queue"
      columns={DEALING_COLUMNS}
      empty={!isAuthenticated
        ? 'Sign in to view the dealer queue.'
        : isError
          ? 'Unable to load the dealer queue.'
          : isLoading || (isFetching && !rows.length)
            ? 'Loading the dealer queue…'
            : rows.length
              ? 'No queued requests match the search.'
              : 'The dealer queue is empty.'}
    >
      {filtered.map((row) => (
        <tr key={row.id}>
          <td title={String(row.accountLogin)}>{row.accountLogin || '—'}</td>
          <td title={row.symbol}>{row.symbol || '—'}</td>
          <td>{row.side || '—'}</td>
          <td>{row.volume ? fmtLots(row.volume) : '—'}</td>
          <td>{fmtPrice(row.requestedPrice)}</td>
          <td title={String(row.reason)}>{row.reason || '—'}</td>
          <td>{fmtClock(row.queuedAt)}</td>
          <td title={String(row.comment)}>{row.comment || ''}</td>
        </tr>
      ))}
    </TerminalTable>
  );
}

function SearchTab({ search, isAuthenticated }) {
  const { rows, isLoading, isError, isFetching } = usePagedData({
    queryKey: ['terminal-search-positions'],
    queryFn: getPositionsPage,
    params: { search },
    pageSize: 30,
    enabled: isAuthenticated,
  });

  return (
    <TerminalTable
      label="Search positions"
      columns={TRADE_COLUMNS}
      empty={!isAuthenticated
        ? 'Sign in to search positions.'
        : isLoading || (isFetching && !rows.length)
          ? 'Searching…'
          : isError
            ? 'Unable to search positions.'
            : search.trim()
              ? 'No positions match the search.'
              : 'Type in the search box to find positions.'}
    >
      {rows.map((row) => (
        <tr key={`${row.login}-${row.position}`}>
          {tradeCells(row).map((cell, index) => <td key={TRADE_COLUMNS[index]} title={String(cell)}>{cell}</td>)}
        </tr>
      ))}
    </TerminalTable>
  );
}

function PlaceholderTab({ label, columns, message }) {
  return <TerminalTable label={label} columns={columns} empty={message} />;
}

export default function TerminalTabContent({ tab, search = '', isAuthenticated = false }) {
  const needle = search.trim().toLowerCase();
  switch (tab) {
    case 'summary':
      return <SummaryTab needle={needle} isAuthenticated={isAuthenticated} />;
    case 'exposure':
      return <ExposureTab needle={needle} isAuthenticated={isAuthenticated} />;
    case 'dealing':
      return <DealingTab needle={needle} isAuthenticated={isAuthenticated} />;
    case 'search':
      return <SearchTab search={search} isAuthenticated={isAuthenticated} />;
    case 'news':
      return <NewsTab needle={needle} isAuthenticated={isAuthenticated} />;
    case 'calendar':
      return <PlaceholderTab label="Economic calendar" columns={['Time', 'Event', 'Impact', 'Symbol']} message="No economic calendar feed connected." />;
    case 'alerts':
      return <PlaceholderTab label="Alerts" columns={['Time', 'Login', 'Message']} message="No alerts configured." />;
    default:
      return null;
  }
}
