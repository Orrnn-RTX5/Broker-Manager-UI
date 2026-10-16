import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  RefreshCw,
  Server,
  ShieldCheck,
  User,
} from 'lucide-react';
import {
  clearBrokerInfo,
  discoverBrokerById,
  fetchBrokerList,
  getBrokerInfo,
  getRecentBrokers,
  loginAdmin,
  loginManager,
  rememberBroker,
  resolveBrokerSelection,
  resolveInteractiveBrokerSelection,
  setAuthSession,
  setBrokerInfo,
  getBrokerDisplayServerName,
  getBrokerSelectionId,
} from '../../services/brokerAuth';
import { isDesktopBackendTarget } from '../../config/backendTarget';

const AUTH_HERO_IMAGE = '/login-trading-hero.png';
const BRAND_LOGO = '/brand-logo.png';
const MANAGER_LOGIN_HINT_KEY = 'manager_login_hint';

const readRememberedManagerLogin = () => {
  try {
    return localStorage.getItem(MANAGER_LOGIN_HINT_KEY) || '';
  } catch {
    return '';
  }
};

const writeRememberedManagerLogin = (login) => {
  try {
    if (login) {
      localStorage.setItem(MANAGER_LOGIN_HINT_KEY, login);
    } else {
      localStorage.removeItem(MANAGER_LOGIN_HINT_KEY);
    }
  } catch {
    // Non-critical preference storage. Login must continue even if storage is blocked.
  }
};

// ---------------------------------------------------------------------------
// Shell & shared UI primitives
// ---------------------------------------------------------------------------
const AuthShell = ({ children }) => (
  <div
    className="min-h-screen relative overflow-y-auto"
    style={{
      background:
        'linear-gradient(135deg, #f7f8fa 0%, #ffffff 42%, #edf7e7 100%)',
    }}
  >
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      style={{
        background:
          'radial-gradient(680px 420px at 76% 14%, rgba(122, 193, 61, 0.14) 0%, transparent 62%), radial-gradient(520px 360px at 96% 96%, rgba(16, 24, 40, 0.08) 0%, transparent 58%)',
      }}
    />
    <div className="relative z-10 flex min-h-screen flex-col lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)]">
      <div className="relative h-44 overflow-hidden lg:h-auto lg:min-h-screen">
        <img
          src={AUTH_HERO_IMAGE}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable="false"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(8, 12, 14, 0.18) 0%, rgba(8, 12, 14, 0.02) 48%, rgba(8, 12, 14, 0.70) 100%)',
          }}
        />
      </div>

      <main className="flex w-full flex-1 items-center justify-center px-4 py-8 sm:px-6 lg:px-10">
        <div
          className="ui-card w-full min-w-0 p-7 sm:p-8"
          style={{
            boxSizing: 'border-box',
            borderColor: 'rgba(208, 213, 221, 0.84)',
            boxShadow: '0 22px 52px rgba(16, 24, 40, 0.14)',
            maxWidth: 440,
            width: 'calc(100vw - 80px)',
          }}
        >
          {children}
        </div>
      </main>
    </div>
  </div>
);

const ProductHeader = ({ subtitle }) => (
  <div className="text-center mb-8">
    <span
      className="mx-auto mb-4 flex h-16 w-56 items-center justify-center overflow-hidden"
    >
      <img
        src={BRAND_LOGO}
        alt="RTX5"
        className="h-full w-full object-contain"
        draggable="false"
      />
    </span>
    <p className="mt-1 text-sm" style={{ color: 'var(--text-3)' }}>
      {subtitle}
    </p>
  </div>
);

const InlineError = ({ children }) => {
  if (!children) return null;
  return (
    <div
      className="manager-inline-error mb-4 flex items-center gap-2.5 p-3 rounded-lg text-sm"
      role="alert"
      style={{
        background: 'var(--danger-soft)',
        border: '1px solid var(--danger-border)',
        color: 'var(--danger-text)',
      }}
    >
      <AlertCircle size={16} className="flex-shrink-0" />
      <span>{children}</span>
    </div>
  );
};

const InlineNotice = ({ children }) => {
  if (!children) return null;
  return (
    <div
      className="manager-inline-notice mb-4 flex items-center gap-2.5 rounded-lg p-3 text-sm"
      role="status"
      style={{
        background: 'rgba(0, 126, 207, 0.14)',
        border: '1px solid rgba(56, 152, 236, 0.36)',
        color: '#e2f1ff',
      }}
    >
      <ShieldCheck size={16} className="flex-shrink-0" style={{ color: '#58b2ff' }} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
};

const SpinnerLabel = ({ children }) => (
  <>
    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
    {children}
  </>
);

const BrokerLogo = ({ broker, size = 40, fallback: Fallback = Building2 }) => {
  const [failed, setFailed] = useState(false);
  const src = broker?.logo_url;

  if (src && !failed) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center overflow-hidden"
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          background: 'var(--surface-2)',
          border: '1px solid var(--border-2)',
        }}
      >
        <img
          src={src}
          alt=""
          className="h-full w-full object-contain p-1.5"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: 'var(--accent-soft)',
        color: 'var(--accent-text)',
      }}
    >
      {createElement(Fallback, { size: Math.max(16, Math.round(size * 0.45)), 'aria-hidden': 'true' })}
    </span>
  );
};

const BrokerDropdown = ({ brokers, selectedId, disabled, onChange, variant = 'default' }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const isManager = variant === 'manager';
  const selectedBroker = brokers.find((broker) => getBrokerSelectionId(broker) === selectedId);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        id="broker-select"
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className={`ui-input w-full h-auto flex items-center text-left cursor-pointer disabled:opacity-50 ${
          isManager ? 'manager-broker-button' : 'min-h-[56px] gap-3 pr-9'
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <BrokerLogo broker={selectedBroker} size={isManager ? 26 : 36} />
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate font-medium ${isManager ? 'manager-broker-name' : 'text-sm'}`}
            style={{ color: 'var(--text)' }}
          >
            {selectedBroker?.name || 'Select broker'}
          </span>
        </span>
        <ChevronDown
          size={isManager ? 16 : 16}
          className="absolute right-3 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--muted)' }}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-labelledby="broker-select"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-72 overflow-y-auto rounded-lg shadow-xl"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          {brokers.map((broker) => {
            const optionId = getBrokerSelectionId(broker);
            const selected = optionId === selectedId;
            return (
              <button
                key={optionId || broker.broker_id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(optionId);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-3 text-left transition-colors hover:bg-black/5 ${
                  isManager ? 'px-4 py-3' : 'px-3 py-2.5'
                }`}
                style={{
                  background: selected ? 'var(--accent-soft)' : 'transparent',
                }}
              >
                <BrokerLogo broker={broker} size={isManager ? 30 : 34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium" style={{ color: 'var(--text)' }}>
                    {broker.name}
                  </span>
                  <span className="block truncate text-xs tabular" style={{ color: 'var(--text-3)' }}>
                    {broker.broker_id || getBrokerDisplayServerName(broker)}
                  </span>
                </span>
                {selected && <Check size={16} style={{ color: 'var(--accent-text)' }} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const BrokerIdentity = ({ broker, variant = 'default' }) => {
  const isManager = variant === 'manager';

  return (
    <div
      className={`ui-input w-full h-auto flex items-center text-left ${
        isManager ? 'manager-broker-identity' : 'min-h-[56px] gap-3'
      }`}
      role="group"
      aria-label="Selected broker"
    >
      <BrokerLogo broker={broker} size={isManager ? 26 : 36} />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate font-medium ${isManager ? 'manager-broker-name' : 'text-sm'}`}
          style={{ color: 'var(--text)' }}
        >
          {broker?.name || 'Broker'}
        </span>
      </span>
    </div>
  );
};

// The dashboard is authenticated. This decorative preview keeps the sign-in
// screen familiar without mounting protected workspace data or its effects.
const ManagerDashboardPreview = () => (
  <div className="manager-dashboard-preview" aria-hidden="true">
    <div className="manager-preview-topbar">
      <div className="manager-preview-brand"><span>RTX5</span> Manager</div>
      <div className="manager-preview-menu">File&nbsp;&nbsp;&nbsp; Edit&nbsp;&nbsp;&nbsp; View&nbsp;&nbsp;&nbsp; Tools&nbsp;&nbsp;&nbsp; Window</div>
      <div className="manager-preview-avatar">M</div>
    </div>
    <div className="manager-preview-toolbar">
      <span>Workspace</span><span className="is-active">Dashboard</span><span>Accounts</span>
      <span>Market Watch</span><span>Operations</span><span>Analytics</span>
    </div>
    <div className="manager-preview-workspace">
      <div className="manager-preview-watch">
        <div className="manager-preview-watch-head">Market Watch <span>⌄</span></div>
        <div className="manager-preview-watch-search">Search symbols...</div>
        <div className="manager-preview-watch-columns"><span>Symbol</span><span>Bid</span><span>Ask</span></div>
        {['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'AUDUSD', 'USDCAD', 'NZDUSD', 'EURJPY', 'BTCUSD', 'ETHUSD', 'GER40', 'US500'].map((symbol, index) => (
          <div className="manager-preview-watch-row" key={symbol}>
            <span>{symbol}</span><span className={index % 4 === 0 ? 'is-down' : 'is-up'}>1.0842</span><span>1.0845</span>
          </div>
        ))}
      </div>
      <div className="manager-preview-navigator">
        <div className="manager-preview-watch-head">Navigator <span>⌄</span></div>
        {['Servers', 'Analytics', 'Dashboard', 'Reports', 'Trading Analytics', 'Online Users', 'Clients & Orders', 'Trading Accounts', 'Dealing', 'Risk Management'].map((item) => (
          <div className={`manager-preview-nav-row${item === 'Dashboard' ? ' is-active' : ''}`} key={item}>{item}</div>
        ))}
      </div>
      <div className="manager-preview-center">
        <div className="manager-preview-tabs"><span className="is-active">Executive Dashboard</span><span>Exposure</span><span>Liquidity</span><span>Risk Monitor</span></div>
        <div className="manager-preview-dashboard">
          <div className="manager-preview-dashboard-head"><span>Executive Dashboard</span><span>Last 24 Hours &nbsp; Refresh</span></div>
          <div className="manager-preview-metrics">
            {['Real Accounts', 'Demo Accounts', 'Net Equity', 'Open Positions', 'Deposit Flow', 'Margin Exposure'].map((label, index) => (
              <div className="manager-preview-metric" key={label}>
                <span>{label}</span><strong>{index === 3 ? '24' : index === 5 ? '68%' : '—'}</strong>
                <i className={index === 3 ? 'is-down' : ''} />
              </div>
            ))}
          </div>
          <div className="manager-preview-chart">
            <div>Trading Activity &amp; Account Equity <span>1H&nbsp;&nbsp; 6H&nbsp;&nbsp; 24H&nbsp;&nbsp; 7D</span></div>
            <svg viewBox="0 0 600 200" preserveAspectRatio="none" focusable="false">
              <path className="manager-preview-chart-grid" d="M0 40H600 M0 80H600 M0 120H600 M0 160H600" />
              <path className="manager-preview-chart-bars" d="M34 145V180 M78 130V180 M122 139V180 M166 112V180 M210 123V180 M254 91V180 M298 116V180 M342 79V180 M386 100V180 M430 65V180 M474 84V180 M518 46V180 M562 70V180" />
              <path className="manager-preview-chart-line" d="M0 153 C45 151 62 134 92 137 S134 151 170 127 S223 126 260 107 S317 113 350 90 S404 98 446 70 S524 66 600 27" />
            </svg>
          </div>
          <div className="manager-preview-detail-row">
            <div><span>Top Traded Symbols</span><i /><i /><i /></div>
            <div><span>Regional Activity</span><i /><i /><i /></div>
            <div><span>Approval Queue</span><i /><i /><i /></div>
          </div>
        </div>
      </div>
      <div className="manager-preview-side">
        <div className="manager-preview-watch-head">Owner Console</div>
        <div className="manager-preview-side-panel"><span>Insights &nbsp;&nbsp; Alerts &nbsp;&nbsp; Approvals</span><p>Quick Actions</p>
          <div className="manager-preview-quick-grid"><span>Add New Client</span><span>Manage Accounts</span><span>View Reports</span><span>Risk Settings</span></div>
        </div>
        <div className="manager-preview-side-panel"><p>Cash Flow</p><span>Deposits &nbsp;&nbsp;&nbsp; Withdrawals &nbsp;&nbsp;&nbsp; Net Flow</span></div>
      </div>
    </div>
    <div className="manager-preview-terminal"><div>Operations Terminal</div><span>Terminal &nbsp;&nbsp; Audit Trail &nbsp;&nbsp; Notifications &nbsp;&nbsp; Tasks</span></div>
  </div>
);

const ManagerLoginShell = ({ children }) => (
  <div className="manager-auth-shell">
    <ManagerDashboardPreview />
    <div className="manager-auth-scrim" aria-hidden="true" />
    <div className="manager-auth-layout">
      <main className="manager-auth-main">
        <section className="manager-auth-card" role="dialog" aria-modal="true" aria-labelledby="manager-login-title">
          {children}
        </section>
      </main>
    </div>
  </div>
);

const ManagerLoginHeader = () => (
  <header className="manager-auth-header">
    <span className="manager-brand-mark">
      <img src={`${import.meta.env.BASE_URL}rtx5-logo.png`} alt="RTX5" draggable="false" />
    </span>
    <h1 id="manager-login-title">MANAGER LOGIN</h1>
    <p>Sign in to access your manager dashboard</p>
    <div className="manager-title-rule" aria-hidden="true">
      <span />
    </div>
  </header>
);

// ---------------------------------------------------------------------------
// BrokerSelector — fetches full broker list from API, shows styled dropdown
// ---------------------------------------------------------------------------
export const BrokerSelector = () => {
  const navigate = useNavigate();
  const [brokerList, setBrokerList] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [error, setError] = useState('');
  const [loadingRole, setLoadingRole] = useState('');

  const loadBrokers = () => {
    setListLoading(true);
    setListError('');
    fetchBrokerList()
      .then((list) => {
        setBrokerList(list);
        const selection = resolveBrokerSelection(list, {
          storedBrokerId: getBrokerSelectionId(getBrokerInfo() || {}),
        });
        setSelectedId(selection.brokerId);
        if (selection.source === 'runtime-broker-missing') {
          setListError('Configured broker was not found in discovery. Check broker configuration.');
        } else if (!selection.brokerId) {
          setListError('No brokers are available from discovery.');
        }
      })
      .catch((err) => setListError(err.message || 'Failed to load brokers.'))
      .finally(() => setListLoading(false));
  };

  useEffect(() => {
    loadBrokers();
  }, []);

  const submit = async (role) => {
    if (!selectedId) {
      setError('Please select a broker.');
      return;
    }
    setLoadingRole(role);
    setError('');
    try {
      const brokerInfo = discoverBrokerById(brokerList, selectedId);
      setBrokerInfo(brokerInfo);
      rememberBroker(selectedId);
      navigate(role === 'admin' ? '/admin-login' : '/manager-login');
    } catch (err) {
      setError(err.message || 'Connection failed');
    } finally {
      setLoadingRole('');
    }
  };

  return (
    <AuthShell>
      <ProductHeader subtitle="Select your broker to continue" />

      <InlineError>{error}</InlineError>

      {/* Loading state */}
      {listLoading && (
        <div className="flex items-center justify-center gap-3 py-8 text-sm" style={{ color: 'var(--text-3)' }}>
          <Loader2 size={16} className="animate-spin" />
          Loading brokers…
        </div>
      )}

      {/* Error state */}
      {!listLoading && listError && (
        <div className="space-y-3">
          <div
            className="flex items-start gap-3 p-3 rounded-lg text-sm"
            role="alert"
            style={{
              background: 'var(--danger-soft)',
              border: '1px solid var(--danger-border)',
              color: 'var(--danger-text)',
            }}
          >
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            <span>{listError}</span>
          </div>
          <button
            type="button"
            onClick={loadBrokers}
            className="ui-btn ui-btn-secondary w-full"
            style={{ padding: '8px 12px' }}
          >
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}

      {/* Broker dropdown form */}
      {!listLoading && !listError && (
        <form
          className="space-y-5"
          onSubmit={(e) => { e.preventDefault(); submit('manager'); }}
        >
          <div>
            <div className="mb-1.5 flex flex-wrap items-baseline gap-3">
              <label htmlFor="broker-select" className="block text-sm font-medium" style={{ color: 'var(--text-2)' }}>
                Broker Server
              </label>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                {brokerList.length} broker{brokerList.length !== 1 ? 's' : ''} available
              </p>
            </div>
            <BrokerDropdown
              brokers={brokerList}
              selectedId={selectedId}
              disabled={!!loadingRole}
              onChange={(brokerId) => { setSelectedId(brokerId); setError(''); }}
            />
            <div className="hidden" aria-hidden="true">
              <select
                id="broker-select-native"
                value={selectedId}
                onChange={(e) => { setSelectedId(e.target.value); setError(''); }}
                disabled={!!loadingRole}
                className="ui-input w-full appearance-none pr-9 cursor-pointer disabled:opacity-50"
                aria-label="Select broker"
              >
                {brokerList.map((broker) => (
                  <option key={getBrokerSelectionId(broker) || broker.broker_id} value={getBrokerSelectionId(broker)}>
                    {broker.name} — {broker.broker_id}
                  </option>
                ))}
              </select>
              <span
                className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none"
                style={{ color: 'var(--muted)' }}
              >
                <ChevronDown size={16} />
              </span>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={!!loadingRole || brokerList.length === 0}
              className="ui-btn ui-btn-primary w-full"
              style={{ padding: '10px 12px' }}
            >
              {loadingRole === 'manager' ? <SpinnerLabel>Checking</SpinnerLabel> : 'Continue as Manager'}
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  );
};

// ---------------------------------------------------------------------------
// ManagerLogin
// ---------------------------------------------------------------------------
export const ManagerLogin = ({ onLoginSuccess }) => {
  const navigate = useNavigate();
  const [brokerList, setBrokerList] = useState([]);
  const [selectedId, setSelectedId] = useState(() => getBrokerSelectionId(getBrokerInfo() || {}));
  const [brokerSelectionLocked, setBrokerSelectionLocked] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [rememberedLogin] = useState(() => readRememberedManagerLogin());
  const [user, setUser] = useState(rememberedLogin);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(() => Boolean(rememberedLogin));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedBroker = brokerList.find((broker) => getBrokerSelectionId(broker) === selectedId);

  const loadBrokers = useCallback(() => {
    setListLoading(true);
    setListError('');

    const storedBroker = getBrokerInfo();
    const storedId = getBrokerSelectionId(storedBroker || {});

    fetchBrokerList()
      .then((list) => {
        const selection = isDesktopBackendTarget()
          ? resolveInteractiveBrokerSelection(list, {
            storedBrokerId: storedId,
            recentBrokerIds: getRecentBrokers(),
          })
          : resolveBrokerSelection(list, { storedBrokerId: storedId });

        setBrokerList(list);
        setSelectedId(selection.brokerId);
        setBrokerSelectionLocked(selection.locked);
        if (selection.source === 'runtime-broker-missing') {
          setListError('Configured broker was not found in discovery. Check broker configuration.');
        }
      })
      .catch((err) => {
        setBrokerList([]);
        setSelectedId('');
        setBrokerSelectionLocked(false);
        setListError(err.message || 'Failed to load brokers.');
      })
      .finally(() => setListLoading(false));
  }, []);

  useEffect(() => {
    loadBrokers();
  }, [loadBrokers]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!user || !password || !selectedId) {
      setNotice('');
      setError('Login, password, and server are required.');
      return;
    }
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const currentBrokerInfo = discoverBrokerById(brokerList, selectedId);
      setBrokerInfo(currentBrokerInfo);
      rememberBroker(selectedId);
      const auth = await loginManager(currentBrokerInfo, { user, password, server: selectedId });
      writeRememberedManagerLogin(rememberMe ? user : '');
      const session = setAuthSession(auth, currentBrokerInfo);
      onLoginSuccess?.(session);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  const showBrokerSupportNotice = () => {
    setError('');
    setNotice('Contact your broker administrator for account access or password recovery.');
  };

  return (
    <ManagerLoginShell>
      <ManagerLoginHeader />

      <InlineError>{error}</InlineError>
      <InlineNotice>{notice}</InlineNotice>

      <form onSubmit={handleSubmit} className="manager-login-form">
        <div className="manager-form-group manager-broker-group">
          <div className="manager-broker-heading">
            <label
              htmlFor={brokerSelectionLocked ? undefined : 'broker-select'}
              className="manager-form-label manager-broker-label"
            >
              {brokerSelectionLocked ? 'Broker' : 'Select your broker to continue'}
            </label>
          </div>

          {listLoading && (
            <div className="manager-loading-row">
              <Loader2 size={16} className="animate-spin" />
              Loading brokers...
            </div>
          )}

          {!listLoading && listError && (
            <div className="space-y-3">
              <div
                className="flex items-start gap-3 p-3 rounded-lg text-sm"
                role="alert"
                style={{
                  background: 'var(--danger-soft)',
                  border: '1px solid var(--danger-border)',
                  color: 'var(--danger-text)',
                }}
              >
                <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
                <span>{listError}</span>
              </div>
              <button
                type="button"
                onClick={loadBrokers}
                className="ui-btn ui-btn-secondary w-full manager-retry-button"
              >
                <RefreshCw size={14} /> Retry
              </button>
            </div>
          )}

          {!listLoading && !listError && (
            <>
              {brokerSelectionLocked ? (
                <BrokerIdentity broker={selectedBroker} variant="manager" />
              ) : (
                <>
                  <BrokerDropdown
                    brokers={brokerList}
                    selectedId={selectedId}
                    disabled={loading}
                    variant="manager"
                    onChange={(brokerId) => {
                      setSelectedId(brokerId);
                      setError('');
                      setNotice('');
                    }}
                  />
                  <p className="manager-broker-count">
                    <span aria-hidden="true" />
                    {brokerList.length} broker{brokerList.length !== 1 ? 's' : ''} available
                  </p>
                  <div className="hidden" aria-hidden="true">
                    <select
                      id="broker-select-native"
                      value={selectedId}
                      onChange={(e) => {
                        setSelectedId(e.target.value);
                        setError('');
                        setNotice('');
                      }}
                      disabled={loading}
                      className="ui-input w-full appearance-none pr-9 cursor-pointer disabled:opacity-50"
                      aria-label="Select broker"
                    >
                      {brokerList.map((broker) => (
                        <option key={getBrokerSelectionId(broker) || broker.broker_id} value={getBrokerSelectionId(broker)}>
                          {broker.name} - {broker.broker_id}
                        </option>
                      ))}
                    </select>
                    <span
                      className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none"
                      style={{ color: 'var(--muted)' }}
                    >
                      <ChevronDown size={16} />
                    </span>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <Field
          id="manager-login"
          label="Login"
          type="number"
          icon={User}
          value={user}
          onChange={setUser}
          placeholder="Enter your manager login ID"
          required
          variant="manager"
        />
        <PasswordField
          id="manager-password"
          value={password}
          onChange={setPassword}
          placeholder="Enter your password"
          variant="manager"
        />
        <Field
          id="manager-server"
          label="Server"
          icon={Server}
          value={selectedBroker ? getBrokerDisplayServerName(selectedBroker) : ''}
          onChange={() => {}}
          readOnly
          required
          variant="manager"
        />

        <div className="manager-login-options">
          <label className="manager-remember-control">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => {
                const nextChecked = event.target.checked;
                setRememberMe(nextChecked);
                if (!nextChecked) writeRememberedManagerLogin('');
              }}
            />
            <span>Remember me</span>
          </label>
          <button type="button" className="manager-link-button" onClick={showBrokerSupportNotice}>
            Forgot password?
          </button>
        </div>

        <button
          type="submit"
          disabled={loading || listLoading || !!listError || !selectedBroker}
          className="manager-submit-button"
        >
          {loading ? <SpinnerLabel>Signing in</SpinnerLabel> : 'Sign in'}
        </button>

        <p className="manager-contact-copy">
          Don't have an account?{' '}
          <button type="button" className="manager-link-button" onClick={showBrokerSupportNotice}>
            Contact your broker
          </button>
        </p>
      </form>
    </ManagerLoginShell>
  );
};

// ---------------------------------------------------------------------------
// AdminLogin
// ---------------------------------------------------------------------------
export const AdminLogin = ({ onLoginSuccess }) => {
  const navigate = useNavigate();
  const [brokerInfo, setBrokerInfoState] = useState(() => getBrokerInfo());
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const storedBroker = getBrokerInfo();
    if (!storedBroker) {
      navigate('/', { replace: true });
      return;
    }
    setBrokerInfoState(storedBroker);
  }, [navigate]);

  const handleSwitchBroker = () => {
    clearBrokerInfo();
    navigate('/', { replace: true });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!user || !password) {
      setError('Login and password are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const currentBrokerInfo = getBrokerInfo() || brokerInfo;
      const auth = await loginAdmin(currentBrokerInfo, { user, password });
      const session = setAuthSession(auth, currentBrokerInfo);
      onLoginSuccess?.(session);
      navigate('/admin-dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  if (!brokerInfo) return null;

  const brokerSelection = resolveBrokerSelection([brokerInfo], {
    storedBrokerId: getBrokerSelectionId(brokerInfo),
  });

  return (
    <LoginScreen
      brokerInfo={brokerInfo}
      subtitle="Admin Login"
      tone="admin"
      error={error}
      loading={loading}
      onSubmit={handleSubmit}
      onSwitchBroker={brokerSelection.locked ? undefined : handleSwitchBroker}
      switchToLabel="Manager login"
      onSwitchRole={() => navigate('/manager-login')}
    >
      <Field id="admin-login" label="Login" type="number" icon={User} value={user} onChange={setUser} required />
      <PasswordField id="admin-password" value={password} onChange={setPassword} />
    </LoginScreen>
  );
};

// ---------------------------------------------------------------------------
// Shared LoginScreen layout
// ---------------------------------------------------------------------------
const LoginScreen = ({
  brokerInfo,
  subtitle,
  tone,
  error,
  loading,
  onSubmit,
  onSwitchBroker,
  switchToLabel,
  onSwitchRole,
  children,
}) => (
  <AuthShell>
    <div className="text-center mb-8">
      <div
        className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
        style={{
          background: tone === 'admin' ? 'var(--info-soft)' : 'var(--accent-soft)',
          color: tone === 'admin' ? 'var(--info-text)' : 'var(--accent-text)',
        }}
      >
        <BrokerLogo broker={brokerInfo} size={48} fallback={tone === 'admin' ? ShieldCheck : Lock} />
      </div>
      <h1 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>
        {brokerInfo.name || brokerInfo.broker_id}
      </h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--text-3)' }}>
        {subtitle}
      </p>
    </div>

    <InlineError>{error}</InlineError>

    <form onSubmit={onSubmit} className="space-y-4">
      {children}
      <button
        type="submit"
        disabled={loading}
        className="ui-btn ui-btn-primary w-full mt-2"
        style={{ padding: '10px 16px' }}
      >
        {loading ? <SpinnerLabel>Signing in</SpinnerLabel> : 'Sign in'}
      </button>
    </form>

    <div className="mt-6 pt-5 flex items-center justify-between text-sm" style={{ borderTop: '1px solid var(--border-2)' }}>
      {onSwitchBroker ? (
        <button type="button" onClick={onSwitchBroker} className="ui-btn ui-btn-ghost ui-btn-sm">
          &larr; Switch broker
        </button>
      ) : (
        <span />
      )}
      {switchToLabel && onSwitchRole && (
        <button type="button" onClick={onSwitchRole} className="ui-btn ui-btn-ghost ui-btn-sm">
          {switchToLabel} <ArrowRight size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  </AuthShell>
);

// ---------------------------------------------------------------------------
// Shared form field components
// ---------------------------------------------------------------------------
const Field = ({
  id,
  label,
  icon: Icon,
  value,
  onChange,
  placeholder,
  type = 'text',
  readOnly = false,
  required = false,
  variant = 'default',
}) => {
  const isManager = variant === 'manager';

  return (
  <div>
    <label
      htmlFor={id}
      className={isManager ? 'manager-form-label' : 'block text-sm font-medium mb-1.5'}
      style={{ color: isManager ? undefined : 'var(--text-2)' }}
    >
      {label}
    </label>
    <div className="relative">
      <span
        className={isManager ? 'manager-input-icon' : 'absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none'}
        style={{ color: isManager ? undefined : 'var(--muted)' }}
      >
        {createElement(Icon, { size: isManager ? 15 : 16, 'aria-hidden': 'true' })}
      </span>
      <input
        id={id}
        type={isManager && type === 'number' ? 'text' : type}
        inputMode={type === 'number' ? 'numeric' : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        required={required}
        className={isManager ? 'ui-input manager-input' : 'ui-input'}
        style={{ paddingLeft: isManager ? undefined : 36 }}
      />
    </div>
  </div>
  );
};

const PasswordField = ({ id, value, onChange, placeholder, variant = 'default' }) => {
  const [showPassword, setShowPassword] = useState(false);
  const isManager = variant === 'manager';

  return (
    <div>
      <label
        htmlFor={id}
        className={isManager ? 'manager-form-label' : 'block text-sm font-medium mb-1.5'}
        style={{ color: isManager ? undefined : 'var(--text-2)' }}
      >
        Password
      </label>
      <div className="relative">
        <span
          className={isManager ? 'manager-input-icon' : 'absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none'}
          style={{ color: isManager ? undefined : 'var(--muted)' }}
        >
          <Lock size={isManager ? 15 : 16} aria-hidden="true" />
        </span>
        <input
          id={id}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required
          className={isManager ? 'ui-input manager-input manager-input-with-action' : 'ui-input'}
          style={{ paddingLeft: isManager ? undefined : 36, paddingRight: isManager ? undefined : 36 }}
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          className={isManager
            ? 'manager-password-toggle'
            : 'absolute inset-y-0 right-0 pr-3 flex items-center hover:opacity-80 transition-opacity'}
          style={{ color: 'var(--muted)' }}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          aria-pressed={showPassword}
        >
          {showPassword
            ? <EyeOff size={isManager ? 15 : 16} aria-hidden="true" />
            : <Eye size={isManager ? 15 : 16} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
};
