import { useState, useMemo } from 'react';
import { User, ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle } from 'lucide-react';
import useDataSource from '../../../hooks/useDataSource';
import { getTradingAccounts } from '../../../services/api';
import { TRADING_ACCOUNTS_FALLBACK } from '../../../data/tradingAccounts';

const RAW_DATA = [
  { login: '633701', name: 'sarmad riyadh', group: 'FlexyB\\CENT', country: 'Iraq', client: '', balance: 10.00, equity: 10.00, profit: 0.00, currency: 'USC' },
  { login: '633801', name: 'HUYNH NGOC TAI', group: 'FlexyB\\CENT', country: 'Vietnam', client: '', balance: 1.46, equity: 1.46, profit: 0.00, currency: 'USC' },
  { login: '900701', name: 'cent test', group: 'FlexyB\\CENT', country: 'India', client: '', balance: 99833.00, equity: 99833.00, profit: 0.00, currency: 'USC' },
  { login: '50055', name: 'Parimal Patel', group: 'FlexyB\\YOFXNET', country: 'India', client: '', balance: 0.00, equity: 0.00, profit: 0.00, currency: 'USD' },
  { login: '50150', name: 'Raj Choudhary Main', group: 'Demo\\extra', country: 'United Arab Emirates', client: '', balance: 11104.00, equity: 11104.00, profit: 0.00, currency: 'USD' },
  { login: '50153', name: 'shri krishna', group: 'Demo\\extra', country: 'India', client: '1003', balance: 16868.19, equity: 16004.52, profit: -826.73, currency: 'USD' },
  { login: '50154', name: "YoForex Investor's", group: 'YOFX\\YOFX', country: 'India', client: '1004', balance: 256989.63, equity: 256989.63, profit: 0.00, currency: 'USD' },
  { login: '50156', name: 'Chintan', group: 'FlexyB\\Social', country: 'United Arab Emirates', client: '1006', balance: 0.00, equity: 0.00, profit: 0.00, currency: 'USD' },
  { login: '50157', name: 'Arijeet Nayak', group: 'YOFX\\YOFX', country: 'India', client: '1005', balance: 9698.56, equity: 9698.56, profit: 0.00, currency: 'USD' },
  { login: '50158', name: 'AUNALI CHAUDHARI', group: 'FlexyB\\Social', country: 'India', client: '1007', balance: 0.00, equity: 0.00, profit: 0.00, currency: 'USD' },
  { login: '50159', name: 'Chifamba dilan', group: 'FlexyB\\Social', country: 'Zimbabwe', client: '1000', balance: 0.00, equity: 0.00, profit: 0.00, currency: 'USD' },
  { login: '50160', name: 'Rup Kumar Panday Chhetri', group: 'FlexyB\\YOFX', country: 'United Arab Emirates', client: '1001', balance: 0.00, equity: 0.00, profit: 0.00, currency: 'USD' },
  { login: '50161', name: 'Suresh Kumar H', group: 'FlexyB\\Superfast', country: 'India', client: '', balance: 0.00, equity: 0.00, profit: 0.00, currency: 'USD' },
  { login: '50164', name: 'Jagdish Kumar', group: 'FlexyB\\STD', country: 'India', client: '', balance: 0.00, equity: 0.00, profit: 0.00, currency: 'USD' },
  { login: '50165', name: 'Arjun', group: 'YOFX\\YOFX', country: 'United Arab Emirates', client: '', balance: 62015.51, equity: 62015.51, profit: 0.00, currency: 'USD' },
  { login: '50170', name: 'S M Rafsan Jahan', group: 'Demo\\extra', country: 'Bangladesh', client: '', balance: 18.69, equity: 18.69, profit: 0.00, currency: 'USD' },
  { login: '50171', name: 'utkarsh verma', group: 'FlexyB\\STD', country: 'India', client: '', balance: 0.87, equity: 0.87, profit: 0.00, currency: 'USD' },
  { login: '50172', name: 'RATHOD NEHNDRASINH S', group: 'FlexyB\\STD', country: 'India', client: '', balance: 0.12, equity: 0.12, profit: 0.00, currency: 'USD' },
  { login: '50174', name: 'RAJESH LIRIMBARIV', group: 'FlexyB\\STD', country: 'India', client: '', balance: 0.00, equity: 0.00, profit: 0.00, currency: 'USD' },
  { login: '50175', name: 'Chiranjit Maity', group: 'FlexyB\\STD', country: 'India', client: '', balance: 0.00, equity: 0.00, profit: 0.00, currency: 'USD' },
  { login: '50176', name: 'Harsha ac pranosth', group: 'FlexyB\\STD', country: 'India', client: '', balance: 0.00, equity: 0.00, profit: 0.00, currency: 'USD' },
  { login: '50178', name: 'Yash patel', group: 'FlexyB\\STD', country: 'India', client: '', balance: 0.41, equity: 0.41, profit: 0.00, currency: 'USD' },
  { login: '50179', name: 'SUHAS', group: 'Demo\\extra', country: 'India', client: '', balance: 0.00, equity: 0.00, profit: 0.00, currency: 'USD' },
  { login: '50180', name: 'Gowthamum G V', group: 'FlexyB\\STD', country: 'India', client: '', balance: 0.00, equity: 0.00, profit: 0.00, currency: 'USD' },
  { login: '50182', name: 'Manoj M', group: 'FlexyB\\Social', country: 'India', client: '', balance: 0.23, equity: 0.23, profit: 0.00, currency: 'USD' },
  { login: '50183', name: 'Arijeet Nayak', group: 'YOFX\\YOFX', country: 'Finland', client: '', balance: 55111.31, equity: 55111.31, profit: 0.00, currency: 'USD' },
  { login: '50185', name: 'Mano M', group: 'FlexyB\\STD', country: 'India', client: '', balance: 4.00, equity: 4.00, profit: 0.00, currency: 'USD' },
  { login: '50186', name: 'S M Ratan Jahan', group: 'FlexyB\\Superfast', country: 'Bangladesh', client: '', balance: 0.00, equity: 0.00, profit: 0.00, currency: 'USD' },
  { login: '50191', name: 'YoForex Premium', group: 'YOFX\\YOFX', country: 'India', client: '1004', balance: -10751.09, equity: -10751.09, profit: 0.00, currency: 'USD' },
  { login: '50192', name: 'MOHAMED AADAM HAMDHAAN AA', group: 'FlexyB\\Social', country: 'Sri Lanka', client: '', balance: 0.38, equity: 0.38, profit: 0.00, currency: 'USD' },
  { login: '50194', name: 'Praveen C Chaudhary', group: 'Demo\\extra', country: 'India', client: '', balance: -319.01, equity: -319.01, profit: 0.00, currency: 'USD' },
  { login: '50199', name: 'Piyush Seth', group: 'FlexyB\\STD', country: 'India', client: '', balance: 0.00, equity: 0.00, profit: 0.00, currency: 'USD' },
  { login: '20200', name: 'Arijeet Nayak', group: 'YOFX\\YOFX', country: 'India', client: '', balance: 77438.83, equity: 77438.83, profit: 0.00, currency: 'USD' },
  { login: '50201', name: 'Inniyeent Mutwanobaga', group: 'FlexyB\\STD', country: 'Zimbabwe', client: '', balance: 0.00, equity: 0.00, profit: 0.00, currency: 'USD' },
  { login: '50209', name: 'Saymhoze Shresthu', group: 'Demo\\extra', country: 'United Arab Emirates', client: '', balance: 22.55, equity: 22.55, profit: 0.00, currency: 'USD' },
  { login: '50210', name: 'Ankur jyoti Chakrabarty', group: 'FlexyB\\STD', country: 'India', client: '', balance: 0.00, equity: 0.00, profit: 0.00, currency: 'USD' },
  { login: '50209', name: 'Ali Awod', group: 'FlexyB\\STD', country: 'Pakistan', client: '', balance: 0.35, equity: 0.35, profit: 0.00, currency: 'USD' },
  { login: '50210', name: 'Furkan', group: 'FlexyB\\STD', country: 'Turkey', client: '', balance: 0.00, equity: 0.00, profit: 0.00, currency: 'USD' },
  { login: '50211', name: 'Ali Awod', group: 'FlexyB\\STD', country: 'Pakistan', client: '', balance: 0.00, equity: 0.00, profit: 0.00, currency: 'USD' },
  { login: '50212', name: 'Ali Awod', group: 'FlexyB\\STD', country: 'Pakistan', client: '', balance: 0.77, equity: 0.77, profit: 0.00, currency: 'USD' },
  { login: '50213', name: 'Furkan', group: 'FlexyB\\STD', country: 'Turkey', client: '', balance: 0.44, equity: 0.44, profit: 0.00, currency: 'USD' },
  { login: '50214', name: 'Subhamkar Banerjee', group: 'FlexyB\\STD', country: 'India', client: '', balance: 0.00, equity: 0.00, profit: 0.00, currency: 'USD' },
  { login: '50217', name: 'Sajal', group: 'FlexyB\\STD', country: 'India', client: '', balance: 0.00, equity: 0.00, profit: 0.00, currency: 'USD' },
  { login: '50218', name: 'ABDULBAST QURESHI', group: 'FlexyB\\Superfast', country: 'Saudi Arabia', client: '', balance: 0.00, equity: 0.00, profit: 0.00, currency: 'USD' },
  { login: '50219', name: 'Mohammad Sohail Khan', group: 'FlexyB\\Superfast', country: 'India', client: '', balance: 0.00, equity: 0.00, profit: 0.00, currency: 'USD' },
];

const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const SortIcon = ({ col, sortCol, sortDir }) => {
  if (sortCol !== col) return <ChevronsUpDown size={9} className="text-gray-400 ml-0.5 inline" />;
  return sortDir === 'asc'
    ? <ChevronUp size={9} className="text-blue-500 ml-0.5 inline" />
    : <ChevronDown size={9} className="text-blue-500 ml-0.5 inline" />;
};

const TradingAccountsDataGrid = ({ search = '', groupFilter = 'All Groups', countryFilter = 'All Countries' }) => {
  const { data: rawData, isLoading, isFallback, error } = useDataSource(getTradingAccounts, TRADING_ACCOUNTS_FALLBACK);
  const [sortCol, setSortCol] = useState('login');
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
        r.name.toLowerCase().includes(q) ||
        r.login.includes(q) ||
        r.group.toLowerCase().includes(q)
      );
    }
    if (groupFilter !== 'All Groups') rows = rows.filter(r => r.group === groupFilter);
    if (countryFilter !== 'All Countries') rows = rows.filter(r => r.country === countryFilter);

    rows.sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return rows;
  }, [rawData, search, groupFilter, countryFilter, sortCol, sortDir]);

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
                className="px-2 py-1 font-normal text-left cursor-pointer whitespace-nowrap hover:bg-gray-200 dark:hover:bg-[#333333] transition-colors w-24"
                onClick={() => handleSort('login')}
              >
                Login<SortIcon col="login" sortCol={sortCol} sortDir={sortDir} />
              </th>
              <TH col="name" label="Name" />
              <TH col="group" label="Group" />
              <TH col="country" label="Country" />
              <TH col="client" label="Client" />
              <TH col="balance" label="Balance" align="right" />
              <th className="px-2 py-1 font-normal border-l border-gray-200 dark:border-[#333333] text-right whitespace-nowrap">Balance / Checked</th>
              <TH col="equity" label="Equity" align="right" />
              <TH col="profit" label="Profit / Credit" align="right" />
              <TH col="currency" label="Cu." />
            </tr>
          </thead>
          <tbody className="text-[12px] text-gray-800 dark:text-gray-200">
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-12 text-gray-400 dark:text-gray-500">No accounts match the current filters.</td>
              </tr>
            ) : pageRows.map((row, idx) => {
              const rowKey = `${row.login}-${idx}`;
              const isNegProfit = row.profit < 0;
              const isPosProfit = row.profit > 0;
              return (
                <tr
                  key={rowKey}
                  onClick={() => setSelectedRow(selectedRow === rowKey ? null : rowKey)}
                  className={`border-b border-gray-100 dark:border-[#333333] h-7 cursor-pointer transition-colors
                    ${selectedRow === rowKey
                      ? 'bg-blue-100 dark:bg-blue-900/30'
                      : 'hover:bg-blue-50/50 dark:hover:bg-[#252526]'}`}
                >
                  <td className="px-2 py-0.5 whitespace-nowrap flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                    <User size={11} className="text-blue-500 dark:text-blue-400 shrink-0" />
                    {row.login}
                  </td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333]">{row.name}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-gray-500 dark:text-gray-400">{row.group}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333]">{row.country}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-center text-gray-500 dark:text-gray-400">{row.client}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-right">{fmt(row.balance)}</td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-right text-gray-400 dark:text-gray-500"></td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-right">{fmt(row.equity)}</td>
                  <td className={`px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-right
                    ${isNegProfit ? 'text-red-600 dark:text-red-400' : isPosProfit ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    {fmt(row.profit)}
                  </td>
                  <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-gray-500 dark:text-gray-400">{row.currency}</td>
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
            Showing 1–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length} accounts
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
              <span className="text-[10px] text-gray-400 italic">No more accounts to load</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TradingAccountsDataGrid;
