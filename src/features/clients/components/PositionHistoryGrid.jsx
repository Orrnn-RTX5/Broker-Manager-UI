import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle, Loader, History } from 'lucide-react';

const fmt = (n, d = 2) => {
  if (n === undefined || n === null) return '0.00';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
};

const formatDate = (ts) => {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
};

const SortIcon = ({ col, sortCol, sortDir }) => {
  if (sortCol !== col) return <ChevronsUpDown size={11} className="inline ml-1" style={{ color: 'var(--muted)' }} />;
  return sortDir === 'asc'
    ? <ChevronUp size={11} className="inline ml-1" style={{ color: 'var(--accent)' }} />
    : <ChevronDown size={11} className="inline ml-1" style={{ color: 'var(--accent)' }} />;
};

const HeaderCell = ({ col, label, align = 'left', sortCol, sortDir, onSort }) => (
  <th
    scope="col"
    onClick={() => onSort(col)}
    style={{ textAlign: align }}
    className="cursor-pointer select-none whitespace-nowrap transition-colors"
  >
    {label}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
  </th>
);

const PositionHistoryGrid = ({ data = [], isLoading, error, login }) => {
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
    <div className="ui-card flex flex-col w-full flex-1 overflow-hidden">
      {error && (
        <div className="px-4 py-2 text-xs flex items-center gap-1.5" style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)', borderBottom: '1px solid var(--danger-border)' }}>
          <AlertTriangle size={12} /> {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex-1 min-h-[300px] flex items-center justify-center px-6 text-center">
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
        <div className="flex-1 min-h-[300px] flex items-center justify-center px-6 text-center">
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
      <div className="w-full overflow-x-auto flex-1">
        <table className="ui-grid min-w-max">
          <thead>
            <tr>
              <HeaderCell col="order" label="Order ID" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="login" label="Login" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="symbol" label="Symbol" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="type" label="Type" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="volume" label="Volume" align="right" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="openPrice" label="Open Price" align="right" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="closePrice" label="Close Price" align="right" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="openTime" label="Open Time" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="closeTime" label="Close Time" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="sl" label="S/L" align="right" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="tp" label="T/P" align="right" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="profit" label="Profit" align="right" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="swap" label="Swap" align="right" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="commission" label="Comm." align="right" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <HeaderCell col="comment" label="Comment" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, idx) => {
              const rowKey = `${row.order}-${idx}`;
              const isBuy = row.type === 'buy';
              const profitTone = row.profit < 0 ? 'var(--danger-text)' : 'var(--ok-text)';
              
              return (
                <tr
                  key={rowKey}
                  onClick={() => setSelectedRow(selectedRow === rowKey ? null : rowKey)}
                  className={selectedRow === rowKey ? 'is-selected' : ''}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="tabular font-mono text-[11px]">{row.order}</td>
                  <td className="tabular" style={{ color: 'var(--text-3)' }}>{row.login}</td>
                  <td style={{ fontWeight: 600 }}>{row.symbol}</td>
                  <td>
                    <span className={`ui-badge text-[9px] px-1.5 ${isBuy ? 'ui-badge-success' : 'ui-badge-danger'}`}>
                      {row.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="tabular" style={{ textAlign: 'right' }}>{row.volume}</td>
                  <td className="tabular font-mono" style={{ textAlign: 'right' }}>{fmt(row.openPrice, 5)}</td>
                  <td className="tabular font-mono" style={{ textAlign: 'right' }}>{fmt(row.closePrice, 5)}</td>
                  <td className="tabular text-[11px]" style={{ color: 'var(--text-3)' }}>{formatDate(row.openTime)}</td>
                  <td className="tabular text-[11px]" style={{ color: 'var(--text-3)' }}>{formatDate(row.closeTime)}</td>
                  <td className="tabular font-mono text-xs opacity-70" style={{ textAlign: 'right' }}>{fmt(row.sl)}</td>
                  <td className="tabular font-mono text-xs opacity-70" style={{ textAlign: 'right' }}>{fmt(row.tp)}</td>
                  <td className="tabular font-mono" style={{ textAlign: 'right', color: profitTone, fontWeight: 600 }}>
                    {fmt(row.profit)}
                  </td>
                  <td className="tabular font-mono" style={{ textAlign: 'right', color: row.swap < 0 ? 'var(--danger-text)' : 'var(--text-2)' }}>{fmt(row.swap)}</td>
                  <td className="tabular font-mono text-xs opacity-60" style={{ textAlign: 'right' }}>{fmt(row.commission)}</td>
                  <td style={{ color: 'var(--text-3)', fontSize: '11px' }}>{row.comment}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
      
      {!isLoading && data.length > 0 && (
        <div className="px-4 py-2.5 text-[10px] uppercase tracking-wider font-bold shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--muted)' }}>
          TOTAL RECORDS: {data.length}
        </div>
      )}
    </div>
  );
};

export default PositionHistoryGrid;
