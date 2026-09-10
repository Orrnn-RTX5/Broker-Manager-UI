import { useRef, useState } from 'react';
import { Search, RefreshCw, X, Clock3 } from 'lucide-react';
import PositionHistoryGrid from './components/PositionHistoryGrid';
import { getPositionHistory } from '../../services/api';

const PositionHistoryEmptyState = ({ onSelectAccount }) => (
  <div
    className="position-history-empty-state ui-card h-full min-h-0 flex items-center justify-center overflow-hidden"
    style={{
      background: 'linear-gradient(180deg, var(--surface) 0%, var(--surface-2) 100%)',
    }}
  >
    <div className="w-full max-w-md px-6 text-center">
      <div
        className="mx-auto w-12 h-12 rounded-xl flex items-center justify-center shadow-sm"
        style={{
          background: 'var(--accent-soft)',
          border: '1px solid var(--accent-border)',
          color: 'var(--accent-text)',
        }}
      >
        <Search size={22} strokeWidth={1.8} />
      </div>
      <div className="mt-3">
        <h2 className="position-history-heading font-semibold" style={{ color: 'var(--text)' }}>
          Choose an account to get started
        </h2>
        <p className="position-history-copy mt-1.5" style={{ color: 'var(--text-3)' }}>
          Enter the account login ID above to view its position history.
        </p>
      </div>
      <button type="button" onClick={onSelectAccount} className="ui-btn ui-btn-primary ui-btn-sm mt-4 inline-flex items-center gap-1.5">
        <Search size={12} /> Enter login ID
      </button>
    </div>
  </div>
);

const PositionsPage = () => {
  const loginInputRef = useRef(null);
  const [loginInput, setLoginInput] = useState('');
  const [currentLogin, setCurrentLogin] = useState('');
  const [historyData, setHistoryData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const canSearch = Boolean(loginInput.trim()) && !isLoading;

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    const login = loginInput.trim() || currentLogin;
    if (!login) return;

    setIsLoading(true);
    setError(null);
    setCurrentLogin(login);

    try {
      const data = await getPositionHistory(login);
      setHistoryData(data);
    } catch (err) {
      console.error('History fetch error:', err);
      setError(err.message || 'Failed to fetch history');
      setHistoryData([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setLoginInput('');
    setCurrentLogin('');
    setHistoryData([]);
    setError(null);
  };

  return (
    <div className="position-history-page p-6 w-full h-full min-h-0 flex flex-col gap-3 overflow-hidden">
      <div className="position-history-header shrink-0">
        <h1 className="position-history-title" style={{ color: 'var(--text)' }}>Position History</h1>
        <p className="position-history-subtitle" style={{ color: 'var(--text-3)' }}>Search historical records by account login ID</p>
      </div>

      <div
        className="position-history-search-panel ui-card p-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between shrink-0"
        style={{ background: 'var(--surface-2)' }}
      >
        <form onSubmit={handleSearch} className="position-history-search-form flex flex-col sm:flex-row sm:items-center gap-2 w-full min-w-0 lg:max-w-2xl">
          <div className="relative w-full sm:max-w-sm">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--muted)' }}
            />
            <input
              ref={loginInputRef}
              type="text"
              inputMode="numeric"
              placeholder="Enter account login ID"
              value={loginInput}
              onChange={(e) => setLoginInput(e.target.value)}
              className="ui-input ui-input-sm w-full"
              style={{ paddingLeft: 32, paddingRight: loginInput ? 32 : 10 }}
            />
            {loginInput && (
              <button
                type="button"
                onClick={() => setLoginInput('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 rounded-md flex items-center justify-center"
                style={{ color: 'var(--muted)' }}
                aria-label="Clear login input"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={!canSearch}
            className="ui-btn ui-btn-primary ui-btn-sm flex items-center justify-center gap-1.5 min-w-[132px]"
          >
            {isLoading ? <RefreshCw size={12} className="animate-spin" /> : <Search size={12} />}
            View history
          </button>
        </form>

        <div className="position-history-search-actions flex items-center justify-between gap-2 lg:justify-end shrink-0">
          {currentLogin ? (
            <div
              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-2)',
              }}
            >
              <Clock3 size={13} style={{ color: 'var(--accent-text)' }} />
              <span className="font-medium">Login</span>
              <span className="tabular" style={{ color: 'var(--text)' }}>{currentLogin}</span>
            </div>
          ) : (
            <span className="position-history-search-status position-history-copy" style={{ color: 'var(--muted)' }}>Select an account</span>
          )}
          <div className="flex items-center gap-1.5">
            {currentLogin && (
              <button
                type="button"
                onClick={handleClear}
                className="ui-btn ui-btn-ghost ui-btn-sm"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              className="ui-btn ui-btn-secondary ui-btn-icon ui-btn-sm"
              onClick={handleSearch}
              disabled={isLoading || !currentLogin}
              title="Refresh history"
              aria-label="Refresh history"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      <div className="position-history-content flex-1 flex flex-col min-h-0">
        {currentLogin ? (
          <PositionHistoryGrid
            data={historyData}
            isLoading={isLoading}
            error={error}
            login={currentLogin}
          />
        ) : (
          <PositionHistoryEmptyState onSelectAccount={() => loginInputRef.current?.focus()} />
        )}
      </div>
    </div>
  );
};

export default PositionsPage;
