import { useState } from 'react';
import { X, UserPlus, CheckCircle, AlertCircle, Loader } from 'lucide-react';

const GROUPS = [
  'demo/STD', 'demo/ECN', 'demo/PRO',
  'real/STD', 'real/ECN', 'real/PRO',
];

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'AUD', 'CAD', 'JPY'];
const LEVERAGES = [1, 10, 25, 50, 100, 200, 300, 400, 500];

const COUNTRIES = [
  'Afghanistan','Albania','Algeria','Andorra','Angola','Argentina','Armenia','Australia','Austria',
  'Azerbaijan','Bahamas','Bahrain','Bangladesh','Belarus','Belgium','Belize','Benin','Bolivia',
  'Bosnia','Botswana','Brazil','Brunei','Bulgaria','Burkina Faso','Burundi','Cambodia','Cameroon',
  'Canada','Chad','Chile','China','Colombia','Congo','Croatia','Cuba','Cyprus','Czech Republic',
  'Denmark','Djibouti','Dominican Republic','Ecuador','Egypt','El Salvador','Estonia','Ethiopia',
  'Fiji','Finland','France','Gabon','Gambia','Georgia','Germany','Ghana','Greece','Guatemala',
  'Guinea','Haiti','Honduras','Hungary','Iceland','India','Indonesia','Iran','Iraq','Ireland',
  'Israel','Italy','Jamaica','Japan','Jordan','Kazakhstan','Kenya','Kuwait','Kyrgyzstan','Laos',
  'Latvia','Lebanon','Libya','Liechtenstein','Lithuania','Luxembourg','Madagascar','Malawi',
  'Malaysia','Maldives','Mali','Malta','Mauritania','Mauritius','Mexico','Moldova','Monaco',
  'Mongolia','Montenegro','Morocco','Mozambique','Myanmar','Namibia','Nepal','Netherlands',
  'New Zealand','Nicaragua','Niger','Nigeria','North Korea','North Macedonia','Norway','Oman',
  'Pakistan','Palestine','Panama','Papua New Guinea','Paraguay','Peru','Philippines','Poland',
  'Portugal','Qatar','Romania','Russia','Rwanda','Saudi Arabia','Senegal','Serbia','Sierra Leone',
  'Singapore','Slovakia','Slovenia','Somalia','South Africa','South Korea','Spain','Sri Lanka',
  'Sudan','Sweden','Switzerland','Syria','Taiwan','Tajikistan','Tanzania','Thailand','Togo',
  'Trinidad and Tobago','Tunisia','Turkey','Turkmenistan','Uganda','Ukraine','United Arab Emirates',
  'United Kingdom','United States','Uruguay','Uzbekistan','Venezuela','Vietnam','Yemen','Zambia','Zimbabwe',
];

const Field = ({ label, required, children }) => (
  <div className="flex flex-col gap-1">
    <label className="text-[12px] text-gray-400 leading-none">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const inputClass = "h-7 px-2 text-[13px] bg-[#1a1b1f] border border-gray-700 text-gray-200 rounded-[3px] focus:outline-none focus:border-blue-500 focus:bg-[#1e2030] transition-colors w-full";
const selectClass = inputClass + " cursor-pointer";

const NewAccountModal = ({ isOpen, onClose, onSuccess }) => {
  const [form, setForm] = useState({
    master_pass: '',
    investor_pass: '',
    Group: 'demo/STD',
    Leverage: 100,
    FirstName: '',
    LastName: '',
    Email: '',
    Phone: '',
    Country: 'India',
    Currency: 'USD',
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { success: bool, data or message }

  if (!isOpen) return null;

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const id = localStorage.getItem('authToken');
    if (!id) {
      setResult({ success: false, message: 'Not authenticated. Please log in again.' });
      return;
    }

    setLoading(true);
    setResult(null);

    const params = new URLSearchParams({
      id,
      master_pass: form.master_pass,
      investor_pass: form.investor_pass,
      Group: form.Group,
      Leverage: form.Leverage,
      FirstName: form.FirstName,
      LastName: form.LastName,
      Email: form.Email,
      Phone: form.Phone,
      Country: form.Country,
      Currency: form.Currency,
    });

    try {
      const response = await fetch(`http://69.197.178.27/manager/AccountCreate?${params.toString()}`, {
        method: 'GET',
        headers: { 'accept': 'application/json' },
      });

      const data = await response.json();

      // A successful account creation always returns a numeric `login` ID.
      // If the API returns anything else (error msg, wrong creds response, etc.) we reject it.
      if (!response.ok || !data.login || typeof data.login !== 'number') {
        const errMsg = data?.error || data?.message || data?.detail
          || (typeof data === 'string' ? data : null)
          || 'Account creation failed. Check your credentials and try again.';
        throw new Error(errMsg);
      }

      setResult({ success: true, data });
    } catch (err) {
      setResult({ success: false, message: err.message || 'An error occurred.' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    setForm({
      master_pass: '', investor_pass: '', Group: 'demo/STD', Leverage: 100,
      FirstName: '', LastName: '', Email: '', Phone: '', Country: 'India', Currency: 'USD',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[540px] max-h-[90vh] bg-[#1e2025] border border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden font-sans">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-[#252830] border-b border-gray-700 select-none flex-shrink-0">
          <div className="flex items-center gap-2">
            <UserPlus size={16} className="text-blue-400" />
            <div>
              <span className="text-[14px] font-semibold text-gray-100">New Trading Account</span>
              <span className="ml-2 text-[11px] text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded">Step 2 of 2</span>
            </div>
          </div>
          <button onClick={handleClose} className="text-gray-500 hover:text-gray-200 hover:bg-red-500/20 p-1 rounded transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {result ? (
            result.success ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-400">
                  <CheckCircle size={18} />
                  <span className="text-[14px] font-semibold">Account Created Successfully</span>
                </div>
                <div className="bg-[#14151a] border border-gray-700 rounded-lg p-4 text-[13px] space-y-2">
                  {[
                    ['Login ID', result.data.login],
                    ['Full Name', result.data.Name],
                    ['Group', result.data.Group],
                    ['Leverage', `1:${result.data.Leverage}`],
                    ['Currency', result.data.Currency],
                    ['Status', result.data.Status],
                    ['Account Mode', result.data.AccountMode],
                    ['Balance', result.data.balance],
                    ['Email', result.data.Email],
                    ['Phone', result.data.Phone],
                    ['Country', result.data.Country],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-gray-500">{label}</span>
                      <span className="text-gray-100 font-medium">{String(value)}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    handleClose();
                    if (onSuccess) onSuccess();
                  }}
                  className="w-full py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-[13px] font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                  Enter Dashboard
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-red-400">
                  <AlertCircle size={18} />
                  <span className="text-[14px] font-semibold">Account Creation Failed</span>
                </div>
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-[13px] text-red-300">
                  {result.message}
                </div>
                <button
                  onClick={() => setResult(null)}
                  className="w-full py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-[13px] font-semibold transition-colors"
                >
                  Try Again
                </button>
              </div>
            )
          ) : (
            <form id="new-account-form" onSubmit={handleSubmit} className="space-y-4">
              {/* Name Row */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="First Name" required>
                  <input className={inputClass} value={form.FirstName} onChange={e => set('FirstName', e.target.value)} required placeholder="e.g. John" />
                </Field>
                <Field label="Last Name" required>
                  <input className={inputClass} value={form.LastName} onChange={e => set('LastName', e.target.value)} required placeholder="e.g. Smith" />
                </Field>
              </div>

              {/* Contact Row */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email" required>
                  <input type="email" className={inputClass} value={form.Email} onChange={e => set('Email', e.target.value)} required placeholder="email@example.com" />
                </Field>
                <Field label="Phone">
                  <input className={inputClass} value={form.Phone} onChange={e => set('Phone', e.target.value)} placeholder="+1234567890" />
                </Field>
              </div>

              {/* Country & Currency */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Country" required>
                  <select className={selectClass} value={form.Country} onChange={e => set('Country', e.target.value)} required>
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Currency" required>
                  <select className={selectClass} value={form.Currency} onChange={e => set('Currency', e.target.value)} required>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>

              {/* Group & Leverage */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Group" required>
                  <select className={selectClass} value={form.Group} onChange={e => set('Group', e.target.value)} required>
                    {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </Field>
                <Field label="Leverage" required>
                  <select className={selectClass} value={form.Leverage} onChange={e => set('Leverage', Number(e.target.value))} required>
                    {LEVERAGES.map(l => <option key={l} value={l}>1:{l}</option>)}
                  </select>
                </Field>
              </div>

              {/* Passwords */}
              <div className="pt-2 border-t border-gray-700/50">
                <p className="text-[11px] text-gray-500 mb-3 uppercase tracking-wide">Passwords</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Master Password" required>
                    <input type="password" className={inputClass} value={form.master_pass} onChange={e => set('master_pass', e.target.value)} required placeholder="Master password" />
                  </Field>
                  <Field label="Investor Password" required>
                    <input type="password" className={inputClass} value={form.investor_pass} onChange={e => set('investor_pass', e.target.value)} required placeholder="Investor password" />
                  </Field>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="px-5 py-3 border-t border-gray-700 flex justify-end gap-2 bg-[#252830] flex-shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200 text-[13px] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="new-account-form"
              disabled={loading}
              className="px-5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-semibold transition-colors flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader size={13} className="animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <UserPlus size={13} />
                  Create Account
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewAccountModal;
