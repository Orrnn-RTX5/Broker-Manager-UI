import { useState, useMemo } from 'react';
import { User, Monitor, Smartphone, ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle } from 'lucide-react';
import useDataSource from '../../../hooks/useDataSource';
import { getOnlineUsers } from '../../../services/api';
import { ONLINE_USERS_FALLBACK } from '../../../data/onlineUsers';



const fmt = (n) => {
  if (n === 0) return '0.00';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

const SortIcon = ({ col, sortCol, sortDir }) => {
  if (sortCol !== col) return <ChevronsUpDown size={10} className="text-gray-400 ml-0.5 inline" />;
  return sortDir === 'asc'
    ? <ChevronUp size={10} className="text-blue-500 ml-0.5 inline" />
    : <ChevronDown size={10} className="text-blue-500 ml-0.5 inline" />;
};

const OnlineUsersDataGrid = () => {
  const { data: rawData, isLoading, isFallback } = useDataSource(getOnlineUsers, ONLINE_USERS_FALLBACK);
  const [sortCol, setSortCol] = useState('login');
  const [sortDir, setSortDir] = useState('asc');
  const [selectedRow, setSelectedRow] = useState(null);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const sorted = useMemo(() => {
    return [...rawData].sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [sortCol, sortDir]);

  const TH = ({ col, label, align = 'left', w = '' }) => (
    <th
      className={`px-2 py-1 font-semibold border-l border-gray-200 dark:border-[#333333] cursor-pointer select-none whitespace-nowrap hover:bg-gray-200 dark:hover:bg-[#383838] transition-colors ${align === 'right' ? 'text-right' : 'text-left'} ${w}`}
      onClick={() => handleSort(col)}
    >
      {label}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
    </th>
  );

  return (
    <div className="bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#333333] shadow-sm rounded-sm flex flex-col w-full overflow-hidden transition-colors">
      {/* Table Toolbar */}
      <div className="h-8 border-b border-gray-200 dark:border-[#333333] bg-gray-50 dark:bg-[#252526] flex items-center px-3 gap-2 transition-colors">
        <span className="text-[11px] text-gray-700 dark:text-gray-300">Online Users</span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">({sorted.length} sessions)</span>
        {isFallback && (
          <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-sm">
            <AlertTriangle size={9} />
            DEMO
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {isLoading ? (
            <span className="text-[11px] text-gray-400">Loading...</span>
          ) : (
            <>
              <div className={`w-2 h-2 rounded-full ${isFallback ? 'bg-amber-400' : 'bg-green-500 animate-pulse'}`} />
              <span className={`text-[11px] font-medium ${isFallback ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                {isFallback ? 'Fallback' : 'Live'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-max">
          <thead>
            <tr className="bg-[#f0f0f0] dark:bg-[#2d2d30] border-b border-gray-200 dark:border-[#333333] text-[11px] text-gray-700 dark:text-gray-300 h-8 select-none transition-colors">
              <th
                className="px-2 py-1 font-normal text-left cursor-pointer whitespace-nowrap hover:bg-gray-200 dark:hover:bg-[#383838] transition-colors w-20"
                onClick={() => handleSort('login')}
              >
                Login<SortIcon col="login" sortCol={sortCol} sortDir={sortDir} />
              </th>
              <TH col="group" label="Group" />
              <TH col="name" label="Name" />
              <TH col="client" label="Client" />
              <TH col="version" label="Version" align="right" />
              <TH col="ip" label="IP" />
              <TH col="equity" label="Equity" align="right" w="w-36" />
              <TH col="currency" label="Currency" />
            </tr>
          </thead>
          <tbody className="text-[12px] text-gray-800 dark:text-gray-200">
            {sorted.map((row, idx) => {
              const isNeg = row.equity < 0;
              const isPos = row.equity > 0;
              const rowKey = `${row.login}-${idx}`;
              return (
                <tr
                  key={rowKey}
                  onClick={() => setSelectedRow(selectedRow === rowKey ? null : rowKey)}
                  className={`border-b border-gray-100 dark:border-[#2a2a2a] h-7 cursor-pointer transition-colors
                    ${selectedRow === rowKey
                      ? 'bg-blue-100 dark:bg-blue-900/30'
                      : 'hover:bg-blue-50 dark:hover:bg-[#252526]'
                    }`}
                >
                  <td className="px-2 py-0.5 whitespace-nowrap flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                    <User size={11} className="text-blue-500 dark:text-blue-400 shrink-0" />
                    {row.login}
                  </td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#2a2a2a] text-gray-500 dark:text-gray-400">{row.group}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#2a2a2a] font-medium">{row.name}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#2a2a2a]">
                    <span className="flex items-center gap-1">
                      {row.client === 'Android'
                        ? <Smartphone size={11} className="text-green-500 shrink-0" />
                        : <Monitor size={11} className="text-blue-500 shrink-0" />
                      }
                      {row.client}
                    </span>
                  </td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#2a2a2a] text-right font-mono text-[12px]">{row.version}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#2a2a2a] font-mono text-[12px] text-gray-500 dark:text-gray-400">{row.ip}</td>
                  <td className={`px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#2a2a2a] text-right font-semibold font-mono
                    ${isNeg ? 'text-red-600 dark:text-red-400' : isPos ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    {fmt(row.equity)}
                  </td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#2a2a2a] text-gray-500 dark:text-gray-400">{row.currency}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="h-7 border-t border-gray-200 dark:border-[#333333] bg-gray-50 dark:bg-[#252526] flex items-center px-3 text-[11px] text-gray-500 dark:text-gray-400 gap-4 transition-colors">
        <span>Total sessions: <span className="font-semibold text-gray-700 dark:text-gray-300">{sorted.length}</span></span>
        <span>|</span>
        <span>Windows: <span className="font-semibold text-blue-600 dark:text-blue-400">{sorted.filter(r => r.client === 'Windows').length}</span></span>
        <span>Android: <span className="font-semibold text-green-600 dark:text-green-400">{sorted.filter(r => r.client === 'Android').length}</span></span>
      </div>
    </div>
  );
};

export default OnlineUsersDataGrid;
