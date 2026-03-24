import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle } from 'lucide-react';
import useDataSource from '../../../hooks/useDataSource';
import { getPositions } from '../../../services/api';
import { POSITIONS_FALLBACK } from '../../../data/positions';

const RAW_DATA = [
  { login: '60015', position: 22668, symbol: 'xauusd.c', type: 'sell', volume: 0.50, priceOpen: 3044.32, priceCurrent: 5023.7, reason: 'Mobile', swap: -4985.84 },
  { login: '60015', position: 22399, symbol: 'xauusd.c', type: 'buy', volume: 0.50, priceOpen: 3044.32, priceCurrent: 5023.7, reason: 'Mobile', swap: -4685.84 },
  { login: '60015', position: 22670, symbol: 'xauusd.c', type: 'sell', volume: 0.50, priceOpen: 3044.32, priceCurrent: 5023.7, reason: 'Mobile', swap: -4685.84 },
  { login: '60015', position: 22671, symbol: 'xauusd.c', type: 'buy', volume: 0.50, priceOpen: 3044.67, priceCurrent: 5022.93, reason: 'Mobile', swap: 3330.30 },
  { login: '60015', position: 22672, symbol: 'xauusd.c', type: 'sell', volume: 0.50, priceOpen: 3044.32, priceCurrent: 5021.7, reason: 'Mobile', swap: -4985.84 },
  { login: '60015', position: 22673, symbol: 'xauusd.c', type: 'buy', volume: 0.51, priceOpen: 3044.32, priceCurrent: 5022.93, reason: 'Mobile', swap: -4339.00 },
  { login: '60015', position: 22674, symbol: 'xauusd.c', type: 'sell', volume: 0.50, priceOpen: 3044.31, priceCurrent: 5022.7, reason: 'Mobile', swap: -4985.84 },
  { login: '60015', position: 22675, symbol: 'xauusd.c', type: 'buy', volume: 0.50, priceOpen: 3044.62, priceCurrent: 5022.93, reason: 'Mobile', swap: -4339.34 },
  { login: '60015', position: 22676, symbol: 'xauusd.c', type: 'sell', volume: 0.50, priceOpen: 3044.77, priceCurrent: 5021.7, reason: 'Mobile', swap: -4985.64 },
  { login: '60015', position: 22677, symbol: 'xauusd.c', type: 'buy', volume: 0.50, priceOpen: 3044.35, priceCurrent: 5022.93, reason: 'Mobile', swap: 3330.00 },
  { login: '60015', position: 22678, symbol: 'xauusd.c', type: 'sell', volume: 0.50, priceOpen: 3044.18, priceCurrent: 5021.7, reason: 'Mobile', swap: -1114.30 },
  { login: '60015', position: 22679, symbol: 'xauusd.c', type: 'buy', volume: 0.50, priceOpen: 3044.68, priceCurrent: 5027.03, reason: 'Mobile', swap: -4985.84 },
  { login: '60015', position: 22680, symbol: 'xauusd.c', type: 'sell', volume: 0.50, priceOpen: 3044.08, priceCurrent: 5023.7, reason: 'Mobile', swap: 4085.84 },
  { login: '60015', position: 22683, symbol: 'xauusd.c', type: 'buy', volume: 0.50, priceOpen: 3044.04, priceCurrent: 5022.93, reason: 'Mobile', swap: -4985.84 },
  { login: '60015', position: 22684, symbol: 'xauusd.c', type: 'sell', volume: 0.50, priceOpen: 3044.44, priceCurrent: 5022.93, reason: 'Mobile', swap: -4339.30 },
  { login: '60015', position: 77695, symbol: 'xauusd.c', type: 'buy', volume: 0.50, priceOpen: 3044.10, priceCurrent: 5021.7, reason: 'Mobile', swap: -4338.30 },
  { login: '60015', position: 22689, symbol: 'xauusd.c', type: 'buy', volume: 0.50, priceOpen: 3044.39, priceCurrent: 5022.93, reason: 'Mobile', swap: -3339.30 },
  { login: '50546', position: 434078, symbol: 'xauusd', type: 'buy', volume: 0.01, priceOpen: 3348.05, priceCurrent: 5023.23, reason: 'Client', swap: -85.24 },
  { login: '50546', position: 434830, symbol: 'xauusd', type: 'sell', volume: 0.01, priceOpen: 3348.02, priceCurrent: 5023.23, reason: 'Client', swap: -40.24 },
  { login: '50546', position: 434822, symbol: 'xauusd', type: 'buy', volume: 0.01, priceOpen: 3049.02, priceCurrent: 5027.98, reason: 'Client', swap: -85.42 },
  { login: '60466', position: 418840, symbol: 'Nubjpy.c', type: 'sell', volume: 1.17, priceOpen: 18.483, priceCurrent: 20.305, reason: 'Client', swap: -17.31 },
  { login: '60723', position: 1504760, symbol: 'xauusd', type: 'buy', volume: 0.01, priceOpen: 3041.73, priceCurrent: 5022.99, reason: 'Expert', swap: -98.21 },
  { login: '60723', position: 1504752, symbol: 'xauusd', type: 'sell', volume: 0.01, priceOpen: 3041.76, priceCurrent: 5023.33, reason: 'Expert', swap: -46.95 },
  { login: '60723', position: 1504706, symbol: 'xauusd', type: 'sell', volume: 0.01, priceOpen: 3040.42, priceCurrent: 5023.23, reason: 'Expert', swap: 5.44 },
  { login: '615349', position: 1611246, symbol: 'xauusd', type: 'buy', volume: 0.01, priceOpen: 3406.00, priceCurrent: 5022.86, reason: 'Mobile', swap: -98.15 },
  { login: '615349', position: 1604250, symbol: 'xauusd', type: 'buy', volume: 0.01, priceOpen: 3406.58, priceCurrent: 5022.86, reason: 'Mobile', swap: -4.99 },
  { login: '627788', position: 1604334, symbol: 'xauusd', type: 'buy', volume: 0.02, priceOpen: 3101.03, priceCurrent: 5022.88, reason: 'Mobile', swap: -136.70 },
  { login: '620697', position: 1749386, symbol: 'xauusd', type: 'buy', volume: 0.01, priceOpen: 4185.51, priceCurrent: 5022.49, reason: 'Expert', swap: -80.78 },
  { login: '60000', position: 1749390, symbol: 'xauusd', type: 'buy', volume: 0.01, priceOpen: 4183.10, priceCurrent: 5023.33, reason: 'Expert', swap: 2.12 },
  { login: '60000', position: 1749391, symbol: 'xauusd', type: 'sell', volume: 0.01, priceOpen: 4186.18, priceCurrent: 5023.21, reason: 'Expert', swap: -55.11 },
  { login: '60000', position: 1749407, symbol: 'xauusd', type: 'buy', volume: 0.01, priceOpen: 4177.23, priceCurrent: 5023.33, reason: 'Expert', swap: -3.36 },
  { login: '60000', position: 1749325, symbol: 'xauusd', type: 'sell', volume: 0.02, priceOpen: 4174.15, priceCurrent: 5022.33, reason: 'Expert', swap: 3.38 },
  { login: '60097', position: 1749353, symbol: 'xauusd', type: 'sell', volume: 0.03, priceOpen: 4171.78, priceCurrent: 5023.23, reason: 'Expert', swap: -5.30 },
  { login: '60000', position: 1750511, symbol: 'xauusd', type: 'sell', volume: 0.04, priceOpen: 4168.16, priceCurrent: 5023.33, reason: 'Expert', swap: 7.24 },
  { login: '60097', position: 1504980, symbol: 'xauusd', type: 'sell', volume: 0.05, priceOpen: 4165.04, priceCurrent: 5023.33, reason: 'Expert', swap: -9.30 },
  { login: '60009', position: 1751675, symbol: 'xauusd', type: 'buy', volume: 0.02, priceOpen: 4140.33, priceCurrent: 5022.86, reason: 'Expert', swap: -18.68 },
  { login: '60009', position: 1753435, symbol: 'xauusd', type: 'buy', volume: 0.04, priceOpen: 4195.54, priceCurrent: 5022.89, reason: 'Expert', swap: -305.60 },
  { login: '60009', position: 1754809, symbol: 'xauusd', type: 'buy', volume: 0.04, priceOpen: 4198.32, priceCurrent: 5022.86, reason: 'Expert', swap: -273.72 },
  { login: '60009', position: 1759451, symbol: 'xauusd', type: 'sell', volume: 0.05, priceOpen: 4021.51, priceCurrent: 5022.85, reason: 'Expert', swap: -342.12 },
  { login: '60009', position: 1750257, symbol: 'xauusd', type: 'buy', volume: 0.06, priceOpen: 4954.59, priceCurrent: 5023.85, reason: 'Expert', swap: 410.24 },
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
        r.symbol.toLowerCase().includes(q)
      );
    }
    if (typeFilter !== 'All Types') rows = rows.filter(r => r.type === typeFilter.toLowerCase());
    if (symbolFilter !== 'All Symbols') rows = rows.filter(r => r.symbol === symbolFilter);
    if (reasonFilter !== 'All Reasons') rows = rows.filter(r => r.reason === reasonFilter);

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
              <th
                className="px-2 py-1 font-normal text-left cursor-pointer whitespace-nowrap hover:bg-gray-200 dark:hover:bg-[#333333] transition-colors w-20"
                onClick={() => handleSort('login')}
              >
                Login<SortIcon col="login" sortCol={sortCol} sortDir={sortDir} />
              </th>
              <TH col="position" label="Position" />
              <TH col="symbol" label="Symbol" />
              <TH col="type" label="Type" />
              <TH col="volume" label="Volume" align="right" />
              <TH col="priceOpen" label="Price" align="right" />
              <TH col="priceCurrent" label="Price" align="right" />
              <TH col="reason" label="Reason" />
              <TH col="swap" label="Swap" align="right" />
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
                  className={`border-b border-gray-100 dark:border-[#333333] h-7 cursor-pointer transition-colors
                    ${selectedRow === rowKey
                      ? 'bg-blue-100 dark:bg-blue-900/30'
                      : 'hover:bg-blue-50/50 dark:hover:bg-[#252526]'}`}
                >
                  <td className="px-2 py-0.5 whitespace-nowrap text-gray-500 dark:text-gray-400">{row.login}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-gray-500 dark:text-gray-400">{row.position}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333]">{row.symbol}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333]">
                    <span className={isBuy ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}>
                      {row.type}
                    </span>
                  </td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-right">{row.volume}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-right font-mono text-[11px]">{fmt(row.priceOpen)}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-right font-mono text-[11px]">{fmt(row.priceCurrent, 1)}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-gray-500 dark:text-gray-400">{row.reason}</td>
                  <td className={`px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-right font-mono text-[11px]
                    ${isNegSwap ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {fmt(row.swap)}
                  </td>
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
    </div>
  );
};

export default PositionsDataGrid;
