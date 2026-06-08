import { createElement, useEffect, useRef, useState } from 'react';
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
  loginAdmin,
  loginManager,
  rememberBroker,
  setAuthSession,
  setBrokerInfo,
  getBrokerSelectionId,
} from '../../services/brokerAuth';

// ---------------------------------------------------------------------------
// Shell & shared UI primitives
// ---------------------------------------------------------------------------
const AuthShell = ({ children }) => (
  <div
    className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
    style={{ background: 'var(--bg)' }}
  >
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      style={{
        background:
          'radial-gradient(600px 400px at 15% 10%, var(--accent-soft-2) 0%, transparent 60%), radial-gradient(500px 300px at 90% 90%, var(--accent-soft) 0%, transparent 55%)',
      }}
    />
    <div className="ui-card w-full max-w-md p-8 relative z-10" style={{ boxShadow: 'var(--shadow-xl)' }}>
      {children}
    </div>
  </div>
);

const InlineError = ({ children }) => {
  if (!children) return null;
  return (
    <div
      className="mb-5 flex items-start gap-3 p-3 rounded-lg text-sm"
      role="alert"
      style={{
        background: 'var(--danger-soft)',
        border: '1px solid var(--danger-border)',
        color: 'var(--danger-text)',
      }}
    >
      <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
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

const BrokerDropdown = ({ brokers, selectedId, disabled, onChange }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
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
        className="ui-input w-full h-auto min-h-[56px] flex items-center gap-3 pr-9 text-left cursor-pointer disabled:opacity-50"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <BrokerLogo broker={selectedBroker} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium" style={{ color: 'var(--text)' }}>
            {selectedBroker?.name || 'Select broker'}
          </span>
          <span className="block truncate text-xs tabular" style={{ color: 'var(--text-3)' }}>
            {selectedBroker ? getBrokerSelectionId(selectedBroker) || selectedBroker.broker_id : 'No broker selected'}
          </span>
        </span>
        <ChevronDown
          size={16}
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
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-black/5"
                style={{
                  background: selected ? 'var(--accent-soft)' : 'transparent',
                }}
              >
                <BrokerLogo broker={broker} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium" style={{ color: 'var(--text)' }}>
                    {broker.name}
                  </span>
                  <span className="block truncate text-xs tabular" style={{ color: 'var(--text-3)' }}>
                    {broker.broker_id}
                    {optionId && optionId !== broker.broker_id ? ` / ${optionId}` : ''}
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
        if (list.length > 0) setSelectedId(getBrokerSelectionId(list[0]));
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
      <div className="text-center mb-8">
        <div
          className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
        >
          <Building2 size={22} aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>
          RTX 5
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-3)' }}>
          Select your broker to continue
        </p>
      </div>

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
            <label htmlFor="broker-select" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
              Broker
            </label>
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
            <p className="mt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
              {brokerList.length} broker{brokerList.length !== 1 ? 's' : ''} available
            </p>
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
  const [brokerInfo, setBrokerInfoState] = useState(() => getBrokerInfo());
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const storedBroker = getBrokerInfo();
    if (!storedBroker) {
      navigate('/', { replace: true });
      return;
    }
    setBrokerInfoState(storedBroker);
    setServer(getBrokerSelectionId(storedBroker));
  }, [navigate]);

  const handleSwitchBroker = () => {
    clearBrokerInfo();
    navigate('/', { replace: true });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!user || !password || !server) {
      setError('Login, password, and server are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const currentBrokerInfo = getBrokerInfo() || brokerInfo;
      const auth = await loginManager(currentBrokerInfo, { user, password, server });
      const session = setAuthSession(auth, currentBrokerInfo);
      onLoginSuccess?.(session);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  if (!brokerInfo) return null;

  return (
    <LoginScreen
      brokerInfo={brokerInfo}
      subtitle="Manager Login"
      tone="manager"
      error={error}
      loading={loading}
      onSubmit={handleSubmit}
      onSwitchBroker={handleSwitchBroker}
    >
      <Field id="manager-login" label="Login" type="number" icon={User} value={user} onChange={setUser} required />
      <PasswordField id="manager-password" value={password} onChange={setPassword} />
      <Field id="manager-server" label="Server" icon={Server} value={server} onChange={setServer} readOnly required />
    </LoginScreen>
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

  return (
    <LoginScreen
      brokerInfo={brokerInfo}
      subtitle="Admin Login"
      tone="admin"
      error={error}
      loading={loading}
      onSubmit={handleSubmit}
      onSwitchBroker={handleSwitchBroker}
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
      <button type="button" onClick={onSwitchBroker} className="ui-btn ui-btn-ghost ui-btn-sm">
        &larr; Switch broker
      </button>
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
const Field = ({ id, label, icon: Icon, value, onChange, type = 'text', readOnly = false, required = false }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
      {label}
    </label>
    <div className="relative">
      <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: 'var(--muted)' }}>
        {createElement(Icon, { size: 16, 'aria-hidden': 'true' })}
      </span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        readOnly={readOnly}
        required={required}
        className="ui-input"
        style={{ paddingLeft: 36 }}
      />
    </div>
  </div>
);

const PasswordField = ({ id, value, onChange }) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
        Password
      </label>
      <div className="relative">
        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: 'var(--muted)' }}>
          <Lock size={16} aria-hidden="true" />
        </span>
        <input
          id={id}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          className="ui-input"
          style={{ paddingLeft: 36, paddingRight: 36 }}
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          className="absolute inset-y-0 right-0 pr-3 flex items-center hover:opacity-80 transition-opacity"
          style={{ color: 'var(--muted)' }}
          tabIndex={-1}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
};
