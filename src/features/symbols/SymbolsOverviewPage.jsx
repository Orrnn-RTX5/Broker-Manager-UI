import { useNavigate } from 'react-router-dom';
import { LayoutGrid, TrendingUp, Coins, BarChart3, Droplets, Hash, ChevronRight } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import FeedStatusNotice from '../../components/FeedStatusNotice';
import useSymbolStore from '../../store/symbolStore';

const CATEGORY_META = {
  'Metals': { icon: TrendingUp, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  'Forex': { icon: LayoutGrid, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  'Indices': { icon: BarChart3, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  'Crypto': { icon: Coins, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  'Commodities': { icon: Droplets, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  'Others': { icon: Hash, color: 'text-gray-500', bg: 'bg-gray-500/10' },
};

const SymbolsOverviewPage = () => {
  const navigate = useNavigate();
  const counts = useSymbolStore(useShallow(state => state.getGroupCounts()));
  const feedError = useSymbolStore(state => state.feedError);

  return (
    <div className="symbol-browser-page p-6 w-full h-full flex flex-col gap-6 overflow-y-auto" style={{ background: 'var(--bg)' }}>
      <div className="symbol-browser-header">
        <h1 className="symbol-browser-title text-[12px] font-bold" style={{ color: 'var(--text)' }}>Symbol Browser</h1>
        <p className="symbol-browser-subtitle text-[10px]" style={{ color: 'var(--text-3)' }}>Select a category to view live market symbols</p>
      </div>

      {feedError && (
        <FeedStatusNotice feedError={feedError} className="max-w-2xl" />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(CATEGORY_META).map(([name, meta]) => {
          const count = counts[name] || 0;
          return (
            <div
              key={name}
              onClick={() => navigate(`/symbols/${name}`)}
              className="symbol-browser-card ui-card p-5 cursor-pointer transition-all hover:translate-y-[-2px] hover:shadow-lg group border border-transparent hover:border-accent/30"
              style={{ background: 'var(--surface)' }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-xl ${meta.bg}`}>
                  <meta.icon size={24} className={meta.color} />
                </div>
                <div className="symbol-browser-card-count bg-surface-2 px-2.5 py-1 rounded-full text-[12px] font-semibold" style={{ color: 'var(--text-3)' }}>
                  {count} Symbols
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="symbol-browser-card-name text-[12px] font-bold" style={{ color: 'var(--text)' }}>{name}</h3>
                  <p className="symbol-browser-card-description text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>View all {name.toLowerCase()} related symbols</p>
                </div>
                <ChevronRight size={18} className="translate-x-0 group-hover:translate-x-1 transition-transform opacity-50 group-hover:opacity-100" style={{ color: 'var(--accent)' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SymbolsOverviewPage;
