import { useState } from 'react';
import { X, CheckCircle, AlertCircle, Loader, Link2 } from 'lucide-react';

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
      const response = await fetch(`http://69.197.178.27/manager/Connect?user=${encodeURIComponent(user)}&password=${encodeURIComponent(password)}&server=${encodeURIComponent(server)}`, {
        method: 'GET',
        headers: {
          'accept': 'text/plain',
        },
      });

      if (!response.ok) {
        throw new Error('Connection failed. Please check your credentials.');
      }

      const token = await response.text();
      const trimmedToken = token.trim();

      // The real session token is a UUID (e.g. e2787a41-d8ce-a17c-c538-f863c9d8a966).
      // If the API returns anything else (error string, empty, etc.) we reject the login.
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!trimmedToken || !uuidRegex.test(trimmedToken)) {
        throw new Error('Invalid credentials. Server rejected the connection.');
      }

      localStorage.setItem('authToken', trimmedToken);
      if (onLoginSuccess) {
        onLoginSuccess(trimmedToken);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'An error occurred during connection.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "h-7 px-2 text-[13px] bg-[#1a1b1f] border border-gray-700 text-gray-200 rounded-[3px] focus:outline-none focus:border-blue-500 focus:bg-[#1e2030] transition-colors w-full";

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[400px] bg-[#1e2025] border border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden font-sans">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-[#252830] border-b border-gray-700 select-none flex-shrink-0">
          <div className="flex items-center gap-2">
            <Link2 size={16} className="text-blue-400" />
            <div>
              <span className="text-[14px] font-semibold text-gray-100">Connect to Server</span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 hover:bg-red-500/20 p-1 rounded transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
           {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center text-red-400 text-[13px]">
                 <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                 <span>{error}</span>
              </div>
           )}

           <form id="connect-form" onSubmit={handleLogin} className="space-y-4">
              <div>
                 <label className="block text-[12px] text-gray-400 mb-1" htmlFor="user">User ID</label>
                 <input
                    id="user"
                    type="text"
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                    className={inputClass}
                    placeholder="Enter User ID"
                    required
                    autoFocus
                 />
              </div>

              <div>
                 <label className="block text-[12px] text-gray-400 mb-1" htmlFor="password">Password</label>
                 <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    placeholder="Enter password"
                    required
                 />
              </div>

              <div>
                 <label className="block text-[12px] text-gray-400 mb-1" htmlFor="server">Server</label>
                 <input
                    id="server"
                    type="text"
                    value={server}
                    onChange={(e) => setServer(e.target.value)}
                    className={inputClass}
                    placeholder="e.g. 10.20"
                    required
                 />
              </div>
           </form>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-700 flex justify-end gap-2 bg-[#252830] flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200 text-[13px] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="connect-form"
            disabled={loading}
            className="px-5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-semibold transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader size={13} className="animate-spin" />
                Connecting...
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

export default LoginModal;
