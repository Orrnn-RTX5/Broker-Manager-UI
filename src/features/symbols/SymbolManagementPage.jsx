import { useState } from 'react';
import SymbolsTab from './tabs/SymbolsTab';
import CategoriesTab from './tabs/CategoriesTab';
import LpMappingsTab from './tabs/LpMappingsTab';
import SessionsTab from './tabs/SessionsTab';
import CommissionSwapTab from './tabs/CommissionSwapTab';
import AdvancedTab from './tabs/AdvancedTab';

const TABS = [
  { id: 'symbols', label: 'Symbols' },
  { id: 'categories', label: 'Categories' },
  { id: 'mappings', label: 'LP Mappings' },
  { id: 'sessions', label: 'Trading Sessions' },
  { id: 'commission', label: 'Commission & Swap' },
  { id: 'advanced', label: 'Advanced' },
];

const SymbolManagementPage = () => {
  const [activeTab, setActiveTab] = useState('symbols');

  return (
    <div className="symbol-management-page p-6 w-full h-full flex flex-col gap-4 overflow-hidden" style={{ background: 'var(--bg)' }}>
      <div className="flex items-end justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>Symbol Management</h1>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>
            Configure instruments, categories, LP mappings, sessions, commissions, and visibility.
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="symbol-management-tab flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium rounded-t transition-colors"
            style={{
              color: activeTab === id ? 'var(--accent-text)' : 'var(--text-3)',
              borderBottom: activeTab === id ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'transparent',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'symbols'    && <SymbolsTab />}
        {activeTab === 'categories' && <CategoriesTab />}
        {activeTab === 'mappings'   && <LpMappingsTab />}
        {activeTab === 'sessions'   && <SessionsTab />}
        {activeTab === 'commission' && <CommissionSwapTab />}
        {activeTab === 'advanced'   && <AdvancedTab />}
      </div>
    </div>
  );
};

export default SymbolManagementPage;
