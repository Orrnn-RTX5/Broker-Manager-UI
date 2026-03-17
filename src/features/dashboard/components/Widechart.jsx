import { User } from 'lucide-react';

const tableData = [
  { login: '633701', name: 'sarmad riyadh', group: 'FlexyB\\CENT', country: 'Iraq', client: '', balance: '10.00', checked: '', equity: '10.00', profit: '0.00 USC' },
  { login: '633801', name: 'HUYNH NGOC TAI', group: 'FlexyB\\CENT', country: 'Vietnam', client: '', balance: '1.46', checked: '', equity: '1.46', profit: '0.00 USC' },
  { login: '900701', name: 'cent test', group: 'FlexyB\\CENT', country: 'India', client: '', balance: '99 833.00', checked: '', equity: '99 833.00', profit: '0.00 USC' },
  { login: '50055', name: 'Parimal Patel', group: 'FlexyB\\YOFXNET', country: 'India', client: '', balance: '0.00', checked: '', equity: '0.00', profit: '0.00 USD' },
  { login: '50150', name: 'Raj Choudhary Main', group: 'Demo\\extra', country: 'United Arab Emirates', client: '', balance: '11 104.00', checked: '', equity: '11 104.00', profit: '0.00 USD' },
  { login: '50153', name: 'shri krishna', group: 'Demo\\extra', country: 'India', client: '1003', balance: '16 868.19', checked: '', equity: '16 004.52', profit: '-826.73 USD' },
  { login: '50154', name: 'YoForex Investor\'s', group: 'YOFX\\YOFX', country: 'India', client: '1004', balance: '256 989.63', checked: '', equity: '256 989.63', profit: '0.00 USD' },
  { login: '50156', name: 'Chintan', group: 'FlexyB\\Social', country: 'United Arab Emirates', client: '1006', balance: '0.00', checked: '', equity: '0.00', profit: '0.00 USD' },
  { login: '50157', name: 'Arijeet Nayak', group: 'YOFX\\YOFX', country: 'India', client: '1005', balance: '9 698.56', checked: '', equity: '9 698.56', profit: '0.00 USD' },
  { login: '50158', name: 'AUNALI CHAUDHARI', group: 'FlexyB\\Social', country: 'India', client: '1007', balance: '0.00', checked: '', equity: '0.00', profit: '0.00 USD' },
  { login: '50159', name: 'Chifamba dilan', group: 'FlexyB\\Social', country: 'Zimbabwe', client: '1000', balance: '0.00', checked: '', equity: '0.00', profit: '0.00 USD' },
  { login: '50160', name: 'Rup Kumar Panday Chhetri', group: 'FlexyB\\YOFX', country: 'United Arab Emirates', client: '1001', balance: '0.00', checked: '', equity: '0.00', profit: '0.00 USD' },
  { login: '50161', name: 'Suresh Kumar H', group: 'FlexyB\\Superfast', country: 'India', client: '', balance: '0.00', checked: '', equity: '0.00', profit: '0.00 USD' },
  { login: '50164', name: 'Jagdish Kumar', group: 'FlexyB\\STD', country: 'India', client: '', balance: '0.00', checked: '', equity: '0.00', profit: '0.00 USD' },
  { login: '50165', name: 'Arjun', group: 'YOFX\\YOFX', country: 'United Arab Emirates', client: '', balance: '62 015.51', checked: '', equity: '62 015.51', profit: '0.00 USD' },
  { login: '50170', name: 'S M Rafsan Jahan', group: 'Demo\\extra', country: 'Bangladesh', client: '', balance: '18.69', checked: '', equity: '18.69', profit: '0.00 USD' },
];

const Widechart = ({ onClose }) => {
  return (
    <div className="bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#333333] shadow-sm rounded-sm mt-6 flex flex-col w-full overflow-hidden transition-colors">

      {/* Table Header / Toolbar */}
      <div className="h-10 border-b border-gray-200 dark:border-[#333333] bg-gray-50 dark:bg-[#252526] flex items-center justify-between px-3 transition-colors">
        <div className="font-semibold text-[13px] text-gray-800 dark:text-gray-200">Accounts by Source Details</div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs text-blue-600 hover:text-blue-800 hover:underline px-2 py-1"
          >
            Close View
          </button>
        )}
      </div>

      {/* Table Container */}
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-max">
          <thead>
            <tr className="bg-[#f0f0f0] dark:bg-[#2d2d30] border-b border-gray-200 dark:border-[#333333] text-[11px] text-gray-700 dark:text-gray-300 font-semibold h-8 select-none transition-colors">
              <th className="px-2 py-1 font-normal w-24">Login</th>
              <th className="px-2 py-1 font-normal border-l border-gray-200 dark:border-[#333333]">Name</th>
              <th className="px-2 py-1 font-normal border-l border-gray-200 dark:border-[#333333]">Group</th>
              <th className="px-2 py-1 font-normal border-l border-gray-200 dark:border-[#333333]">Country</th>
              <th className="px-2 py-1 font-normal border-l border-gray-200 dark:border-[#333333]">Client</th>
              <th className="px-2 py-1 font-normal border-l border-gray-200 dark:border-[#333333] text-right">Balance</th>
              <th className="px-2 py-1 font-normal border-l border-gray-200 dark:border-[#333333] text-right">Balance / Checked</th>
              <th className="px-2 py-1 font-normal border-l border-gray-200 dark:border-[#333333] text-right">Equity</th>
              <th className="px-2 py-1 font-normal border-l border-gray-200 dark:border-[#333333] text-right">Profit / Credit</th>
            </tr>
          </thead>
          <tbody className="text-[12px] text-gray-800 dark:text-gray-200 font-sans">
            {tableData.map((row, idx) => (
              <tr
                key={idx}
                className="border-b border-gray-100 dark:border-[#333333] hover:bg-blue-50/50 dark:hover:bg-[#252526] h-7 transition-colors"
              >
                <td className="px-2 py-0.5 whitespace-nowrap flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                  <User size={12} className="text-blue-500 dark:text-blue-400" />
                  {row.login}
                </td>
                <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333]">{row.name}</td>
                <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333]">{row.group}</td>
                <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333]">{row.country}</td>
                <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-center">{row.client}</td>
                <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-right font-medium">{row.balance}</td>
                <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-right">{row.checked}</td>
                <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-right font-medium">{row.equity}</td>
                <td className="px-2 py-0.5 whitespace-nowrap border-l border-gray-100 dark:border-[#333333] text-right">{row.profit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer / Status bar */}
      <div className="h-7 border-t border-gray-200 dark:border-[#333333] bg-gray-50 dark:bg-[#252526] flex items-center px-3 text-[11px] text-gray-500 dark:text-gray-400 transition-colors">
        Showing {tableData.length} records
      </div>
    </div>
  );
};

export default Widechart;
