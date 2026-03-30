import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle } from 'lucide-react';
import useDataSource from '../../../hooks/useDataSource';
import { getBrokerDeals } from '../../../services/api';
import AccountDetailsModal from '../../../components/Popups/AccountDetailsModal';

const DEALS_FALLBACK = []; 

const fmt = (n, d = 2) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const fmtDate = (ts) => {
  if (!ts) return '-';
  const dateObj = new Date(ts > 1e11 ? ts : ts * 1000); 
  if (isNaN(dateObj.getTime())) return String(ts);
  return dateObj.toLocaleString('en-US', { 
    year: 'numeric', month: '2-digit', day: '2-digit', 
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
};

const SortIcon = ({ col, sortCol, sortDir }) => {
  if (sortCol !== col) return <ChevronsUpDown size={9} className="text-gray-400 ml-0.5 inline" />;
  return sortDir === 'asc'
    ? <ChevronUp size={9} className="text-blue-500 ml-0.5 inline" />
    : <ChevronDown size={9} className="text-blue-500 ml-0.5 inline" />;
};

const DealsDataGrid = ({ search = '', actionFilter = 'All Actions', symbolFilter = 'All Symbols', entryFilter = 'All Entries' }) => {
  const { data: rawData, isLoading, isFallback, error } = useDataSource(getBrokerDeals, DEALS_FALLBACK);
  const [sortCol, setSortCol] = useState('ticket');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedRow, setSelectedRow] = useState(null);
  const [activeAccountDetailsId, setActiveAccountDetailsId] = useState(null);
  const [activeAccountTicket, setActiveAccountTicket] = useState(null);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
    setPage(0);
  };

  const filtered = useMemo(() => {
    let rows = [...rawData];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        String(r.login).includes(q) ||
        String(r.ticket).includes(q) ||
        String(r.orderTicket).includes(q) ||
        (r.symbol || '').toLowerCase().includes(q) ||
        (r.accountName || '').toLowerCase().includes(q) ||
        (r.username || '').toLowerCase().includes(q)
      );
    }
    if (actionFilter !== 'All Actions') rows = rows.filter(r => (r.action || '').toLowerCase() === actionFilter.toLowerCase());
    if (symbolFilter !== 'All Symbols') rows = rows.filter(r => r.symbol === symbolFilter);
    if (entryFilter !== 'All Entries') rows = rows.filter(r => r.entry === entryFilter);

    rows.sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc'
        ? String(av || '').localeCompare(String(bv || ''))
        : String(bv || '').localeCompare(String(av || ''));
    });
    return rows;
  }, [rawData, search, actionFilter, symbolFilter, entryFilter, sortCol, sortDir]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const pageRows = filtered.slice(0, (page + 1) * pageSize);

  const TH = ({ col, label, align = 'left' }) => (
    <th
      className={`px-2 py-1 font-normal border-l border-gray-200 dark:border-[#333333] cursor-pointer select-none whitespace-nowrap hover:bg-gray-200 dark:hover:bg-[#333333] transition-colors ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => handleSort(col)}
    >
      {label}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
    </th>
  );

  return (
    <div className="bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#333333] shadow-sm rounded-sm flex flex-col w-full overflow-hidden transition-colors">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 p-2 text-xs border-b border-red-200 dark:border-red-800 break-all w-full max-w-full">
          <strong>API Error Detected. Developer Error Details:</strong> {error}
        </div>
      )}
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-max">
          <thead>
            <tr className="bg-[#f0f0f0] dark:bg-[#2d2d30] border-b border-gray-200 dark:border-[#333333] text-[11px] text-gray-700 dark:text-gray-300 h-8 select-none transition-colors">
              <TH col="ticket" label="Ticket" />
              <TH col="orderTicket" label="Order Ticket" />
              <TH col="login" label="Login" />
              <TH col="username" label="Username (Email)" />
              <TH col="accountName" label="Account Name" />
              <TH col="accountGroup" label="Group" />
              <TH col="symbol" label="Symbol" />
              <TH col="action" label="Action" />
              <TH col="entry" label="Entry" />
              <TH col="volume" label="Volume" align="right" />
              <TH col="price" label="Price" align="right" />
              <TH col="profit" label="Profit" align="right" />
              <TH col="commission" label="Commission" align="right" />
              <TH col="swap" label="Swap" align="right" />
              <TH col="fee" label="Fee" align="right" />
              <TH col="time" label="Time" />
              <TH col="comment" label="Comment" />
            </tr>
          </thead>
          <tbody className="text-[12px] text-gray-800 dark:text-gray-200">
            {isLoading && pageRows.length === 0 ? (
              <tr>
                <td colSpan={17} className="text-center py-12 text-gray-400 dark:text-gray-500">Loading deals...</td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={17} className="text-center py-12 text-gray-400 dark:text-gray-500">No deals match the current filters.</td>
              </tr>
            ) : pageRows.map((row, idx) => {
              const rowKey = `${row.ticket}-${idx}`;
              const isBuy = row.action === 'deal_buy';
              return (
                <tr
                  key={rowKey}
                  onClick={() => setSelectedRow(selectedRow === rowKey ? null : rowKey)}
                  onDoubleClick={() => {
                    setActiveAccountDetailsId(row.login);
                    setActiveAccountTicket(row.ticket);
                  }}
                  className={`border-b border-gray-100 dark:border-[#333333] h-7 cursor-pointer transition-colors
                    ${selectedRow === rowKey
                      ? 'bg-blue-100 dark:bg-blue-900/30'
                      : 'hover:bg-blue-50/50 dark:hover:bg-[#252526]'}`}
                >
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-gray-800 dark:text-gray-200">{row.ticket}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-gray-500 dark:text-gray-400">{row.orderTicket}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-gray-500 dark:text-gray-400">{row.login}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-gray-500 dark:text-gray-400">{row.username}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-gray-800 dark:text-gray-200 font-medium">{row.accountName}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-gray-500 dark:text-gray-400">{row.accountGroup}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] font-medium">{row.symbol}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] capitalize">
                    <span className={isBuy ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}>
                      {row.action}
                    </span>
                  </td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333]">{row.entry}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-right">{row.volume}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-right font-mono text-[11px]">{fmt(row.price, 5)}</td>
                  <td className={`px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-right font-mono text-[11px] ${row.profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{fmt(row.profit)}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-right font-mono text-[11px]">{fmt(row.commission)}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-right font-mono text-[11px]">{fmt(row.swap)}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-right font-mono text-[11px]">{fmt(row.fee)}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-gray-500 dark:text-gray-400">{fmtDate(row.time)}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-gray-500 dark:text-gray-400">{row.comment}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      {filtered.length > 50 && (
        <div className="h-7 border-t border-gray-200 dark:border-[#333333] bg-gray-50 dark:bg-[#252526] flex items-center justify-between px-3 text-[11px] text-gray-500 dark:text-gray-400 transition-colors">
          <span className="flex items-center gap-2">
            Showing 1–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length} deals
            {isFallback && (
              <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-sm">
                <AlertTriangle size={9} />
                DEMO DATA
              </span>
            )}
          </span>
          <div className="flex items-center gap-1">
            { (page + 1) * pageSize < filtered.length ? (
              <button
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-0.5 bg-blue-500 hover:bg-blue-600 text-white rounded-sm text-[10px] transition-colors font-medium h-[20px] flex items-center"
              >
                Show More
              </button>
            ) : (
              <span className="text-[10px] text-gray-400 italic">No more deals to load</span>
            )}
          </div>
        </div>
      )}

      {activeAccountDetailsId && (
        <AccountDetailsModal
          account={activeAccountDetailsId}
          targetTicket={activeAccountTicket}
          initialTab="Trade"
          onClose={() => {
            setActiveAccountDetailsId(null);
            setActiveAccountTicket(null);
          }}
        />
      )}
    </div>
  );
};

export default DealsDataGrid;
