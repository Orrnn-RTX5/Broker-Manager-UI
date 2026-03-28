import { useState } from 'react';
import { Settings, Power, ChevronDown, Search } from 'lucide-react';
import OrdersDataGrid from './components/OrdersDataGrid';
import ClientsContextMenu from './components/ClientsContextMenu';

const Dropdown = ({ value, width = 'w-32', options = [], onChange }) => (
  <div className={`relative ${width}`}>
    <select
      onChange={onChange}
      className="appearance-none bg-white dark:bg-[#1e1e1e] border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-[10px] py-1 pl-2 pr-6 focus:outline-none focus:border-blue-400 w-full rounded-sm h-[22px] cursor-pointer"
    >
      <option>{value}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
    <ChevronDown size={10} className="absolute right-1.5 top-1.5 text-gray-500 pointer-events-none" />
  </div>
);

const OrdersPage = () => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All Types');
  const [symbolFilter, setSymbolFilter] = useState('All Symbols');
  const [reasonFilter, setReasonFilter] = useState('All Reasons');
  const [contextMenu, setContextMenu] = useState(null);

  const handleContextMenu = (e) => {
    e.preventDefault();
    setContextMenu({
      mouseX: e.clientX,
      mouseY: e.clientY,
    });
  };

  return (
    <div 
      className="p-4 w-full h-full flex flex-col gap-4 overflow-y-auto bg-white dark:bg-[#1e1e1e]"
      onContextMenu={handleContextMenu}
    >

      {/* Top Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 text-blue-500">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
            </svg>
          </div>
          <h1 className="text-[14px] text-gray-900 dark:text-gray-200 tracking-tight">Orders</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-2 md:mt-0">
          <Dropdown value="All Types" width="w-[100px]" options={['Buy', 'Sell']} onChange={(e) => setTypeFilter(e.target.value)} />
          <Dropdown value="All Symbols" width="w-[120px]" options={['xauusd.c', 'xauusd', 'Nubjpy.c']} onChange={(e) => setSymbolFilter(e.target.value)} />
          <Dropdown value="All Reasons" width="w-[120px]" options={['Mobile', 'Client', 'Expert']} onChange={(e) => setReasonFilter(e.target.value)} />

          <button className="text-blue-500 hover:text-blue-400 ml-1 transition-colors">
            <Settings size={14} />
          </button>
          <button className="text-blue-500 hover:text-blue-400 ml-1 transition-colors">
            <Power size={14} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative w-full max-w-xs">
        <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search login, ticket, symbol..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-7 pr-3 py-0.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] text-gray-800 dark:text-gray-200 text-[10px] rounded-sm focus:outline-none focus:border-blue-400 h-[22px] transition-colors"
        />
      </div>

      {/* Data Grid */}
      <OrdersDataGrid
        search={search}
        typeFilter={typeFilter}
        symbolFilter={symbolFilter}
        reasonFilter={reasonFilter}
      />

      {contextMenu && (
        <ClientsContextMenu
          x={contextMenu.mouseX}
          y={contextMenu.mouseY}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};

export default OrdersPage;
