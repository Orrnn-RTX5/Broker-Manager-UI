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
  const [actionsHost, setActionsHost] = useState(null);

  return (
    <div className="symbol-management-page p-3 w-full h-full min-h-0 flex flex-col gap-2.5 overflow-hidden" style={{ background: 'var(--bg)' }}>
      <div className="symbol-management-header grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 shrink-0">
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>Symbol Management</h1>
          <div ref={setActionsHost} className="symbols-header-actions" />
          <p className="text-sm col-span-2" style={{ color: 'var(--text-3)' }}>
            Configure instruments, categories, LP mappings, sessions, commissions, and visibility.
          </p>
      </div>

      {/* Tab bar */}
      <div className="symbol-management-tabs flex items-center border-b shrink-0 overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
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
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'symbols'    && <SymbolsTab actionsHost={actionsHost} />}
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
