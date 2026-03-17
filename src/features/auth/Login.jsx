import { useState } from 'react';

const Login = ({ onLoginSuccess }) => {
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!user || !password) {
      setError('Please enter both username and password.');
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`http://69.197.178.27/manager/Connect?user=${encodeURIComponent(user)}&password=${encodeURIComponent(password)}`, {
        method: 'GET',
        headers: {
          'accept': 'text/plain',
        },
      });

      if (!response.ok) {
        throw new Error('Login failed. Please check your credentials.');
      }

      const token = await response.text();
      const trimmedToken = token.trim();

      // The real session token is a UUID (e.g. e2787a41-d8ce-a17c-c538-f863c9d8a966).
      // If the API returns anything else (error string, empty, etc.) we reject the login.
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!trimmedToken || !uuidRegex.test(trimmedToken)) {
        throw new Error('Invalid credentials. Please check your User ID and password.');
      }

      localStorage.setItem('authToken', trimmedToken);
      if (onLoginSuccess) {
        onLoginSuccess(trimmedToken);
      }
    } catch (err) {
      setError(err.message || 'An error occurred during login.');
    } finally {
      setLoading(false);
    }
  };

  return (
     <div className="flex items-center justify-center min-h-screen bg-[#0f1115] bg-opacity-100 font-sans relative overflow-hidden">
        {/* Background Decorative Elements */}
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-600 rounded-full mix-blend-screen filter blur-[100px] opacity-20"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-purple-600 rounded-full mix-blend-screen filter blur-[100px] opacity-20"></div>

        <div className="w-full max-w-md p-8 m-4 bg-[#1e2025] border border-gray-800 rounded-2xl shadow-2xl z-10 relative">
           <div className="text-center mb-10">
              <h1 className="text-3xl font-extrabold text-white tracking-tight">Admin Portal</h1>
              <p className="text-gray-400 mt-2 text-sm">Sign in to access the management dashboard</p>
           </div>

           {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center text-red-400 text-sm">
                 <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                 </svg>
                 <span>{error}</span>
              </div>
           )}

           <form onSubmit={handleLogin} className="space-y-6">
              <div>
                 <label className="block text-sm font-medium text-gray-300 mb-2" htmlFor="user">User ID</label>
                 <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                       <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                       </svg>
                    </div>
                    <input
                       id="user"
                       type="text"
                       value={user}
                       onChange={(e) => setUser(e.target.value)}
                       className="block w-full pl-10 pr-3 py-3 border border-gray-700 rounded-xl bg-[#14151a] text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                       placeholder="Enter your User ID"
                    />
                 </div>
              </div>

              <div>
                 <label className="block text-sm font-medium text-gray-300 mb-2" htmlFor="password">Password</label>
                 <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                       <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                       </svg>
                    </div>
                    <input
                       id="password"
                       type="password"
                       value={password}
                       onChange={(e) => setPassword(e.target.value)}
                       className="block w-full pl-10 pr-3 py-3 border border-gray-700 rounded-xl bg-[#14151a] text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                       placeholder="Enter your password"
                    />
                 </div>
              </div>

              <button
                 type="submit"
                 disabled={loading}
                 className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                 {loading ? (
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                       <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                       <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                 ) : (
                    'Sign In'
                 )}
              </button>
           </form>
           
           <div className="mt-8 border-t border-gray-800 pt-6 text-center">
              <p className="text-xs text-gray-600">Secure connection establishing to Manager API</p>
           </div>
        </div>
     </div>
  );
};

export default Login;
