import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle } from 'lucide-react';
import useDataSource from '../../../hooks/useDataSource';
import { getPositions } from '../../../services/api';
import { POSITIONS_FALLBACK } from '../../../data/positions';
import AccountDetailsModal from '../../../components/Popups/AccountDetailsModal';

const RAW_DATA = [
  { login: '60015', name: 'Steve Smith', email: 'steve@gmail.com', position: 22668, symbol: 'xauusd.c', type: 'sell', volume: 0.50, priceOpen: 3044.32, priceCurrent: 5023.7, priceSl: 3050.0, priceTp: 3000.0, comment: 'Mobile', swap: -4985.84, profit: -120.50 },
  { login: '60015', name: 'Steve Smith', email: 'steve@gmail.com', position: 22399, symbol: 'xauusd.c', type: 'buy', volume: 0.50, priceOpen: 3044.32, priceCurrent: 5023.7, priceSl: 0, priceTp: 0, comment: 'Mobile', swap: -4685.84, profit: 450.20 },
  { login: '60015', name: 'Steve Smith', email: 'steve@gmail.com', position: 22670, symbol: 'xauusd.c', type: 'sell', volume: 0.50, priceOpen: 3044.32, priceCurrent: 5023.7, priceSl: 3100.0, priceTp: 0, comment: 'Mobile', swap: -4685.84, profit: -15.00 },
  { login: '60015', name: 'Steve Smith', email: 'steve@gmail.com', position: 22671, symbol: 'xauusd.c', type: 'buy', volume: 0.50, priceOpen: 3044.67, priceCurrent: 5022.93, priceSl: 3000.0, priceTp: 3100.0, comment: 'Mobile', swap: 3330.30, profit: 89.40 },
  { login: '60015', name: 'Steve Smith', email: 'steve@gmail.com', position: 22672, symbol: 'xauusd.c', type: 'sell', volume: 0.50, priceOpen: 3044.32, priceCurrent: 5021.7, priceSl: 0, priceTp: 0, comment: 'Mobile', swap: -4985.84, profit: 12.00 },
  { login: '50546', name: 'John Doe', email: 'john.doe@example.com', position: 434078, symbol: 'xauusd', type: 'buy', volume: 0.01, priceOpen: 3348.05, priceCurrent: 5023.23, priceSl: 3300.0, priceTp: 3500.0, comment: 'Client', swap: -85.24, profit: 16.55 },
  { login: '50546', name: 'John Doe', email: 'john.doe@example.com', position: 434830, symbol: 'xauusd', type: 'sell', volume: 0.01, priceOpen: 3348.02, priceCurrent: 5023.23, priceSl: 0, priceTp: 0, comment: 'Client', swap: -40.24, profit: -4.20 },
  { login: '60466', name: 'Alice Wong', email: 'alice.w@ymail.com', position: 418840, symbol: 'Nubjpy.c', type: 'sell', volume: 1.17, priceOpen: 18.483, priceCurrent: 20.305, priceSl: 22.0, priceTp: 16.0, comment: 'Client', swap: -17.31, profit: -213.45 }
];

const fmt = (n, d = 2) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

const SortIcon = ({ col, sortCol, sortDir }) => {
  if (sortCol !== col) return <ChevronsUpDown size={9} className="text-gray-400 ml-0.5 inline" />;
  return sortDir === 'asc'
    ? <ChevronUp size={9} className="text-blue-500 ml-0.5 inline" />
    : <ChevronDown size={9} className="text-blue-500 ml-0.5 inline" />;
};

const PositionsDataGrid = ({ search = '', typeFilter = 'All Types', symbolFilter = 'All Symbols', reasonFilter = 'All Reasons' }) => {
  const { data: rawData, isLoading, isFallback, error } = useDataSource(getPositions, POSITIONS_FALLBACK);
  const [sortCol, setSortCol] = useState('position');
  const [sortDir, setSortDir] = useState('asc');
  const [selectedRow, setSelectedRow] = useState(null);
  const [activeAccountDetailsId, setActiveAccountDetailsId] = useState(null);
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
        r.login.includes(q) ||
        String(r.position).includes(q) ||
        r.symbol.toLowerCase().includes(q) ||
        (r.name || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q)
      );
    }
    if (typeFilter !== 'All Types') rows = rows.filter(r => r.type === typeFilter.toLowerCase());
    if (symbolFilter !== 'All Symbols') rows = rows.filter(r => r.symbol === symbolFilter);
    if (reasonFilter !== 'All Reasons') rows = rows.filter(r => r.comment === reasonFilter);

    rows.sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return rows;
  }, [rawData, search, typeFilter, symbolFilter, reasonFilter, sortCol, sortDir]);

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
          <strong>API Fallback Detected. Developer Error Details:</strong> {error}
        </div>
      )}
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-max">
          <thead>
            <tr className="bg-[#f0f0f0] dark:bg-[#2d2d30] border-b border-gray-200 dark:border-[#333333] text-[11px] text-gray-700 dark:text-gray-300 h-8 select-none transition-colors">
              <TH col="position" label="Ticket" />
              <th
                className="px-2 py-1 font-normal text-left cursor-pointer whitespace-nowrap hover:bg-gray-200 dark:hover:bg-[#333333] transition-colors"
                onClick={() => handleSort('login')}
              >
                Login<SortIcon col="login" sortCol={sortCol} sortDir={sortDir} />
              </th>
              <TH col="name" label="User Name" />
              <TH col="email" label="Email" />
              <TH col="symbol" label="Symbol" />
              <TH col="type" label="Action" />
              <TH col="volume" label="Lots" align="right" />
              <TH col="priceOpen" label="Open Price" align="right" />
              <TH col="priceCurrent" label="Current" align="right" />
              <TH col="priceSl" label="S/L" align="right" />
              <TH col="priceTp" label="T/P" align="right" />
              <TH col="swap" label="Storage" align="right" />
              <TH col="profit" label="Profit" align="right" />
              <TH col="comment" label="Comment" />
            </tr>
          </thead>
          <tbody className="text-[12px] text-gray-800 dark:text-gray-200">
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-gray-400 dark:text-gray-500">No positions match the current filters.</td>
              </tr>
            ) : pageRows.map((row, idx) => {
              const rowKey = `${row.position}-${idx}`;
              const isBuy = row.type === 'buy';
              const isNegSwap = row.swap < 0;
              return (
                <tr
                  key={rowKey}
                  onClick={() => setSelectedRow(selectedRow === rowKey ? null : rowKey)}
                  onDoubleClick={() => setActiveAccountDetailsId(row.login)}
                  className={`border-b border-gray-100 dark:border-[#333333] h-7 cursor-pointer transition-colors
                    ${selectedRow === rowKey
                      ? 'bg-blue-100 dark:bg-blue-900/30'
                      : 'hover:bg-blue-50/50 dark:hover:bg-[#252526]'}`}
                >
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-gray-800 dark:text-gray-200">{row.position}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-gray-500 dark:text-gray-400">{row.login}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-gray-800 dark:text-gray-200 font-medium">{row.name}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-gray-500 dark:text-gray-400">{row.email}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] font-medium">{row.symbol}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333]">
                    <span className={isBuy ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}>
                      {row.type}
                    </span>
                  </td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-right">{row.volume}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-right font-mono text-[11px]">{fmt(row.priceOpen)}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-right font-mono text-[11px]">{fmt(row.priceCurrent, 1)}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-right font-mono text-[11px]">{fmt(row.priceSl)}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-right font-mono text-[11px]">{fmt(row.priceTp)}</td>
                  <td className={`px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-right font-mono text-[11px]
                    ${isNegSwap ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
                    {fmt(row.swap)}
                  </td>
                  <td className={`px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-right font-mono text-[11px] font-medium
                    ${row.profit < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {fmt(row.profit)}
                  </td>
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
            Showing 1–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length} positions
            &nbsp;|&nbsp;
            Buy: <span className="text-blue-600 dark:text-blue-400">{filtered.filter(r => r.type === 'buy').length}</span>
            &nbsp;
            Sell: <span className="text-red-600 dark:text-red-400">{filtered.filter(r => r.type === 'sell').length}</span>
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
              <span className="text-[10px] text-gray-400 italic">No more positions to load</span>
            )}
          </div>
        </div>
      )}

      {activeAccountDetailsId && (
        <AccountDetailsModal
          account={activeAccountDetailsId}
          initialTab="Trade"
          onClose={() => setActiveAccountDetailsId(null)}
        />
      )}
    </div>
  );
};

export default PositionsDataGrid;
