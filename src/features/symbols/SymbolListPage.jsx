import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import FeedStatusNotice from '../../components/FeedStatusNotice';
import useSymbolStore from '../../store/symbolStore';
import { getSymbolFeedStatus } from '../../utils/feedStatus';

const getStatusDotClass = (status) => {
  if (status.isLive) return 'bg-green-500 animate-pulse';
  if (status.tone === 'warning') return 'bg-amber-500';
  return 'bg-gray-400';
};

const SymbolListPage = () => {
  const { group } = useParams();
  const navigate = useNavigate();
  const symbols = useSymbolStore(useShallow(state => state.getSymbolsByCategory(group)));
  const feedError = useSymbolStore(state => state.feedError);
  const isConnected = useSymbolStore(state => state.isConnected);
  const [search, setSearch] = useState('');

  const filteredSymbols = useMemo(() => {
    return symbols.filter(s => s.symbol.toLowerCase().includes(search.toLowerCase()));
  }, [symbols, search]);

  return (
    <div className="p-6 w-full h-full flex flex-col gap-4 overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate('/symbols')}
          className="ui-btn ui-btn-ghost ui-btn-sm p-2"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{group} Symbols</h1>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>Showing {filteredSymbols.length} symbols in this category</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative w-full max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
        <input 
          type="text" 
          placeholder={`Search in ${group}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ui-input ui-input-sm w-full"
          style={{ paddingLeft: '34px' }}
        />
      </div>

      {feedError && (
        <FeedStatusNotice feedError={feedError} cachedCount={symbols.length} className="max-w-2xl" />
      )}

      {/* List */}
      <div className="ui-card flex-1 overflow-hidden flex flex-col border" style={{ borderColor: 'var(--border)' }}>
        <div className="overflow-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
              <tr className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                <th className="px-4 py-3 font-semibold">Symbol</th>
                <th className="px-4 py-3 font-semibold text-right">Bid</th>
                <th className="px-4 py-3 font-semibold text-right">Ask</th>
                <th className="px-4 py-3 font-semibold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-3)]">
              {filteredSymbols.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-4 py-12 text-center" style={{ color: 'var(--text-3)' }}>
                    No symbols found in this category.
                  </td>
                </tr>
              ) : (
                filteredSymbols.map((item) => {
                  const status = getSymbolFeedStatus({ feedError, isConnected, symbol: item });
                  return (
                    <tr key={item.symbol} className="hover:bg-[var(--surface-hover)] transition-colors">
                      <td className="px-4 py-3 font-bold" style={{ color: 'var(--text)' }}>{item.symbol}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-sm">
                         {item.bid}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-sm">
                         {item.ask}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center items-center">
                          <div
                            className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--surface-2)] border border-[var(--border)]"
                            title={status.title}
                          >
                             <div className={`w-1.5 h-1.5 rounded-full ${getStatusDotClass(status)}`} />
                             <span className="text-[10px] uppercase font-bold" style={{ color: 'var(--text-3)' }}>{status.label}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SymbolListPage;
