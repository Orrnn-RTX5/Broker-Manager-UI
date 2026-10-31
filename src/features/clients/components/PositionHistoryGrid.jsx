import { useState, useMemo } from 'react';
import { useI18nStore } from '../../../i18n/index.js';
import { AlertTriangle, Loader, History } from 'lucide-react';

const fmt = (n, d = 2) => {
  if (n === undefined || n === null) return '0.00';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
};

const formatDate = (ts, language) => {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString(language === 'en' ? 'en-US' : language, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
};

const HeaderCell = ({ col, label, sortCol, sortDir, onSort }) => (
  <th
    scope="col"
    onClick={() => onSort(col)}
    aria-sort={sortCol === col ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    title={`Sort by ${label}`}
    style={{ textAlign: 'left' }}
    className="cursor-pointer select-none whitespace-nowrap transition-colors"
  >
    {label}
  </th>
);

const PositionHistoryGrid = ({ data = [], isLoading, error, login }) => {
  const language = useI18nStore((state) => state.language);
  const [sortCol, setSortCol] = useState('openTime');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedRow, setSelectedRow] = useState(null);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const sortedData = useMemo(() => {
    const rows = [...data];
    rows.sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return rows;
  }, [data, sortCol, sortDir]);

  const hasNoHistory = !isLoading && sortedData.length === 0;

  return (
    <div className="position-history-grid ui-card flex flex-col w-full flex-1 min-h-0 overflow-hidden">
      {error && (
        <div className="px-4 py-2 text-xs flex items-center gap-1.5" style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)', borderBottom: '1px solid var(--danger-border)' }}>
          <AlertTriangle size={12} /> {error}
        </div>
      )}

      {isLoading ? (
        <div className="position-history-grid-state flex-1 min-h-0 flex items-center justify-center px-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{
                background: 'var(--accent-soft)',
                border: '1px solid var(--accent-border)',
                color: 'var(--accent-text)',
              }}
            >
              <Loader size={20} className="animate-spin" />
            </div>
            <div>
              <div className="position-history-heading font-semibold" style={{ color: 'var(--text)' }}>
                Loading position history
              </div>
              <div className="position-history-copy mt-1" style={{ color: 'var(--text-3)' }}>
                Fetching closed trade records for this account.
              </div>
            </div>
          </div>
        </div>
      ) : hasNoHistory ? (
        <div className="position-history-grid-state flex-1 min-h-0 flex items-center justify-center px-6 text-center">
          <div className="max-w-sm flex flex-col items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border-3)',
                color: 'var(--text-3)',
              }}
            >
              <History size={20} strokeWidth={1.8} />
            </div>
            <div>
              <div className="position-history-heading font-semibold" style={{ color: 'var(--text)' }}>
                No closed positions
              </div>
              <div className="position-history-copy mt-1" style={{ color: 'var(--text-3)' }}>
                Account <span className="tabular" style={{ color: 'var(--text-2)' }}>{login}</span> has no closed trade history.
              </div>
            </div>
          </div>
        </div>
      ) : (
      <div className="position-history-grid-scroll w-full min-h-0 overflow-auto flex-1">
        <table className="ui-grid position-history-table">
          <colgroup>
            <col className="position-history-col-data" />
            <col className="position-history-col-data" />
            <col className="position-history-col-data" />
            <col className="position-history-col-data" />
            <col className="position-history-col-data" />
            <col className="position-history-col-data" />
            <col className="position-history-col-data" />
            <col className="position-history-col-data" />
            <col className="position-history-col-data" />
            <col className="position-history-col-data" />
            <col className="position-history-col-data" />
            <col className="position-history-col-data" />
            <col className="position-history-col-data" />
            <col className="position-history-col-data" />
            <col className="position-history-col-data" />
          </colgroup>
          <thead className="sticky top-0 z-10" style={{ boxShadow: '0 1px 0 var(--border)' }}>
            <tr>
              <HeaderCell col="order" label="Order ID" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="login" label="Login" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="symbol" label="Symbol" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="type" label="Type" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="volume" label="Volume" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="openPrice" label="Open Price" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="closePrice" label="Close Price" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="openTime" label="Open Time" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="closeTime" label="Close Time" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="sl" label="S/L" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="tp" label="T/P" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="profit" label="Profit" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="swap" label="Swap" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="commission" label="Comm." sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="comment" label="Comment" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, idx) => {
              const rowKey = `${row.order}-${idx}`;
              const isBuy = row.type === 'buy';
              const profitTone = row.profit < 0 ? 'var(--danger-text)' : 'var(--ok-text)';
              const openPriceFormatted = fmt(row.openPrice, 5);
              const closePriceFormatted = fmt(row.closePrice, 5);
              const openTimeFormatted = formatDate(row.openTime, language);
              const closeTimeFormatted = formatDate(row.closeTime, language);
              const slFormatted = fmt(row.sl);
              const tpFormatted = fmt(row.tp);
              const profitFormatted = fmt(row.profit);
              const swapFormatted = fmt(row.swap);
              const commFormatted = fmt(row.commission);

              return (
                <tr
                  key={rowKey}
                  onClick={() => setSelectedRow(selectedRow === rowKey ? null : rowKey)}
                  className={selectedRow === rowKey ? 'is-selected' : ''}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="tabular font-mono text-[11px]" title={String(row.order ?? '')}>{row.order}</td>
                  <td className="tabular" style={{ color: 'var(--text-3)' }} title={String(row.login ?? '')}>{row.login}</td>
                  <td style={{ fontWeight: 600 }} title={row.symbol || ''}>{row.symbol}</td>
                  <td title={String(row.type || '').toUpperCase()}>
                    <span className="ui-status" style={{ color: isBuy ? 'var(--ok-text)' : 'var(--danger-text)' }}>
                      {row.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="tabular" title={String(row.volume ?? '')}>{row.volume}</td>
                  <td className="tabular font-mono" title={openPriceFormatted}>{openPriceFormatted}</td>
                  <td className="tabular font-mono" title={closePriceFormatted}>{closePriceFormatted}</td>
                  <td className="tabular text-[11px]" style={{ color: 'var(--text-3)' }} title={openTimeFormatted}>{openTimeFormatted}</td>
                  <td className="tabular text-[11px]" style={{ color: 'var(--text-3)' }} title={closeTimeFormatted}>{closeTimeFormatted}</td>
                  <td className="tabular font-mono text-xs opacity-70" title={slFormatted}>{slFormatted}</td>
                  <td className="tabular font-mono text-xs opacity-70" title={tpFormatted}>{tpFormatted}</td>
                  <td className="tabular font-mono" style={{ color: profitTone, fontWeight: 600 }} title={profitFormatted}>
                    {profitFormatted}
                  </td>
                  <td className="tabular font-mono" style={{ color: row.swap < 0 ? 'var(--danger-text)' : 'var(--text-2)' }} title={swapFormatted}>{swapFormatted}</td>
                  <td className="tabular font-mono text-xs opacity-60" title={commFormatted}>{commFormatted}</td>
                  <td style={{ color: 'var(--text-3)', fontSize: '11px' }} title={row.comment || ''}>{row.comment || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
      
      {!isLoading && data.length > 0 && (
        <div
          className="position-history-grid-footer px-3 py-1 text-[10px] uppercase tracking-wider shrink-0 flex items-center"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--muted)' }}
        >
          TOTAL RECORDS: {data.length}
        </div>
      )}
    </div>
  );
};

export default PositionHistoryGrid;
