import { useState } from 'react';
import { User, Lock, Server, AlertCircle, Loader2 } from 'lucide-react';
import { DEFAULT_MT5_SERVER } from '../../config/endpoints';

const Login = ({ onLoginSuccess }) => {
  const [user, setUser] = useState('9003');
  const [password, setPassword] = useState('Manager@123');
  const [server, setServer] = useState(DEFAULT_MT5_SERVER);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!user || !password || !server) {
      setError('Please enter username, password, and server.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(
        `/api/manager/Connect?user=${encodeURIComponent(user)}&password=${encodeURIComponent(password)}&server=${encodeURIComponent(server)}`,
        { method: 'GET', headers: { accept: 'application/json' } }
      );

      if (!response.ok) {
        throw new Error('Login failed. Please check your credentials.');
      }

      const data = await response.json();
      const finalToken = data.token;

      if (!finalToken) {
        throw new Error('Invalid credentials. Please check your User ID and password.');
      }

      import('../../services/authService').then(auth => {
        auth.setSession(data);
      });
      
      if (onLoginSuccess) onLoginSuccess(finalToken);
    } catch (err) {
      setError(err.message || 'An error occurred during login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--bg)' }}
    >
      {/* subtle brand-tinted gradient backdrop */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(600px 400px at 15% 10%, var(--accent-soft-2) 0%, transparent 60%), radial-gradient(500px 300px at 90% 90%, var(--accent-soft) 0%, transparent 55%)',
        }}
      />

      <div className="ui-card w-full max-w-md p-8 relative z-10" style={{ boxShadow: 'var(--shadow-xl)' }}>
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
          >
            <Lock size={22} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
            Welcome back
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-3)' }}>
            Sign in to the RTX 5 management dashboard
          </p>
        </div>

        {error && (
          <div
            className="mb-5 flex items-start gap-3 p-3 rounded-lg text-sm"
            style={{
              background: 'var(--danger-soft)',
              border: '1px solid var(--danger-border)',
              color: 'var(--danger-text)',
            }}
          >
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <Field id="user" label="User ID" icon={User} value={user} onChange={setUser} placeholder="Enter your User ID" />
          <Field id="password" label="Password" icon={Lock} type="password" value={password} onChange={setPassword} placeholder="Enter your password" />
          <Field id="server" label="Server" icon={Server} value={server} onChange={setServer} placeholder="e.g. 10.20" />

          <button type="submit" disabled={loading} className="ui-btn ui-btn-primary w-full mt-2" style={{ padding: '10px 16px' }}>
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <div className="mt-6 pt-5 text-center text-xs" style={{ borderTop: '1px solid var(--border-2)', color: 'var(--muted)' }}>
          Secure connection to Manager API
        </div>
      </div>
    </div>
  );
};

const Field = ({ id, label, icon: Icon, type = 'text', value, onChange, placeholder }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
      {label}
    </label>
    <div className="relative">
      <span
        className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"
        style={{ color: 'var(--muted)' }}
      >
        <Icon size={16} />
      </span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="ui-input"
        style={{ paddingLeft: 36 }}
      />
    </div>
  </div>
);

export default Login;
