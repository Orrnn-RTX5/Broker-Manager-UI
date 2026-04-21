import { useState } from 'react';
import { History, Search, RefreshCw, Send } from 'lucide-react';
import PositionHistoryGrid from './components/PositionHistoryGrid';
import { getPositionHistory } from '../../services/api';

const PositionsPage = () => {
  const [loginInput, setLoginInput] = useState('');
  const [currentLogin, setCurrentLogin] = useState('');
  const [historyData, setHistoryData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!loginInput.trim()) return;

    setIsLoading(true);
    setError(null);
    setCurrentLogin(loginInput);

    try {
      const data = await getPositionHistory(loginInput);
      setHistoryData(data);
    } catch (err) {
      console.error('History fetch error:', err);
      setError(err.message || 'Failed to fetch history');
      setHistoryData([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 w-full h-full flex flex-col gap-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <History size={20} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>Position History</h1>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>Search historical records by account login ID</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            className="ui-btn ui-btn-secondary ui-btn-sm h-9 px-3" 
            onClick={handleSearch} 
            disabled={isLoading || !loginInput}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* IB Style Search Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2 w-full max-w-2xl">
          <div className="relative max-w-xs w-full">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
            <input
              type="text"
              placeholder="Enter Login ID…"
              value={loginInput}
              onChange={(e) => setLoginInput(e.target.value)}
              className="ui-input ui-input-sm"
              style={{ paddingLeft: 32 }}
            />
          </div>
          <button 
            type="submit"
            disabled={isLoading || !loginInput}
            className="ui-btn ui-btn-primary ui-btn-sm flex items-center gap-1.5"
          >
            {isLoading ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Search History
          </button>
        </form>
      </div>

      {/* Grid */}
      <div className="flex-1 flex flex-col min-h-0">
        {currentLogin ? (
          <PositionHistoryGrid 
            data={historyData} 
            isLoading={isLoading} 
            error={error} 
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center ui-card bg-white/30 border-dashed border-2">
            <div className="flex flex-col items-center gap-4 text-center max-w-sm px-6">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center border border-gray-100">
                <Search size={28} className="text-gray-300" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-700">Awaiting Input</h3>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  Enter a Login ID above to retrieve the historical position records for that specific account.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PositionsPage;
