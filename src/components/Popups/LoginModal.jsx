import { useState } from 'react';
import { X, AlertCircle, Loader2, Link2 } from 'lucide-react';

const LoginModal = ({ isOpen, onClose, onLoginSuccess }) => {
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState('10.20');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!user || !password || !server) {
      setError('Please enter User ID, password, and server.');
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
        throw new Error('Connection failed. Please check your credentials.');
      }

      const data = await response.json();
      const finalToken = data.token;

      if (!finalToken) {
        throw new Error('Invalid credentials. Server rejected the connection.');
      }

      localStorage.setItem('authToken', finalToken);
      localStorage.setItem('refreshToken', data.refresh_token || '');
      localStorage.setItem('brokerLogin', String(data.login || ''));
      localStorage.setItem('brokerId', data.broker_id || '');
      if (onLoginSuccess) onLoginSuccess(finalToken);
      onClose();
    } catch (err) {
      setError(err.message || 'An error occurred during connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ui-modal-backdrop" style={{ zIndex: 99999 }}>
      <div className="ui-modal" style={{ width: 420 }}>
        <div className="ui-modal-header">
          <span
            className="w-8 h-8 rounded-lg flex items-center justify-center mr-3"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
          >
            <Link2 size={15} />
          </span>
          Connect to Server
          <span className="x" onClick={onClose}><X size={16} /></span>
        </div>

        <div className="ui-modal-body">
          {error && (
            <div
              className="mb-4 flex items-start gap-2.5 p-3 rounded-lg text-sm"
              style={{
                background: 'var(--danger-soft)',
                border: '1px solid var(--danger-border)',
                color: 'var(--danger-text)',
              }}
            >
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form id="connect-form" onSubmit={handleLogin} className="space-y-3.5">
            <Field id="user"     label="User ID"  value={user}     onChange={setUser}     placeholder="Enter User ID" autoFocus />
            <Field id="password" label="Password" value={password} onChange={setPassword} placeholder="Enter password" type="password" />
            <Field id="server"   label="Server"   value={server}   onChange={setServer}   placeholder="e.g. 10.20" />
          </form>
        </div>

        <div className="ui-modal-footer">
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary ui-btn-sm">
            Cancel
          </button>
          <button type="submit" form="connect-form" disabled={loading} className="ui-btn ui-btn-primary ui-btn-sm">
            {loading ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Connecting…
              </>
            ) : (
              <>
                <Link2 size={13} />
                Connect
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const Field = ({ id, label, value, onChange, placeholder, type = 'text', autoFocus }) => (
  <div>
    <label htmlFor={id} className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
      {label}
    </label>
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="ui-input"
      autoFocus={autoFocus}
      required
    />
  </div>
);

export default LoginModal;
