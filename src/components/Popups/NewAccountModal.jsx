import { useState, useEffect } from 'react';
import { X, HelpCircle, CheckCircle, AlertCircle } from 'lucide-react';
import { useGroupList } from '../../hooks/useGroupList';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'AUD', 'CAD', 'JPY'];
const LEVERAGES = [1, 10, 25, 50, 100, 200, 300, 400, 500];

const COUNTRIES = [
  'India','United States','United Kingdom','Australia','Canada','Germany','France','Japan'
];

const FieldRow = ({ label, width = "100%", children }) => (
  <div className="flex items-center mb-1.5 min-h-[22px]">
    <div className="w-[110px] text-right pr-2 text-[12px] text-[#e0e0e0] flex-shrink-0">
      {label}
    </div>
    <div style={{ width }} className="flex-shrink-0">
      {children}
    </div>
  </div>
);

const inputClass = "h-[22px] w-full bg-transparent border border-white text-white px-1.5 text-[12px] focus:outline-none focus:border-blue-500";
const selectClass = "h-[22px] w-full bg-[#1e1e1e] border border-white text-white px-1 text-[12px] focus:outline-none focus:border-blue-500 cursor-pointer";

const NewAccountModal = ({ isOpen, onClose, onSuccess }) => {
  const [form, setForm] = useState({
    Group: 'demo\\forex-hedge-usd-01',
    Leverage: 100,
    FirstName: '',
    LastName: '',
    Email: '',
    Phone: '',
    Country: 'India',
    Currency: 'USD',
    master_pass: '',
    investor_pass: ''
  });
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const { groups, loading: loadingGroups } = useGroupList();
  // Make sure we have a valid group selected when groups finish loading
  useEffect(() => {
    if (!loadingGroups && groups && groups.length > 0) {
      if (!groups.find(g => g.name === form.Group)) {
        setForm(prev => ({ ...prev, Group: groups[0].name }));
      }
    }
  }, [groups, loadingGroups, form.Group]);

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

      if (!response.ok || !data.login || typeof data.login !== 'number') {
        throw new Error(data?.error || data?.message || 'Account creation failed.');
      }

      setResult({ success: true, data });
    } catch (err) {
      setResult({ success: false, message: err.message || 'An error occurred.' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setResult(null);
    setForm({
      Group: 'demo\\forex-hedge-usd-01', Leverage: 100,
      FirstName: '', LastName: '', Email: '', Phone: '', Country: 'India', Currency: 'USD',
      master_pass: '', investor_pass: ''
    });
    if (onClose) onClose();
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 shadow-2xl">
      <div className="w-[660px] bg-[#1e1e1e] border border-[#444] rounded-[2px] flex flex-col font-sans overflow-hidden shadow-2xl">
        
        {/* Title Bar */}
        <div className="h-8 bg-[#1e1e1e] flex items-center justify-between pl-3 pr-2 flex-shrink-0 cursor-default select-none">
          <span className="text-[13px] text-[#e0e0e0]">New Account</span>
          <div className="flex gap-2 text-[#a0a0a0]">
            <button className="hover:text-white p-1 leading-none rounded transition-colors"><HelpCircle size={14} /></button>
            <button onClick={handleClose} className="hover:text-white hover:bg-red-500/80 p-1 rounded transition-colors"><X size={14} /></button>
          </div>
        </div>

        {/* Body content */}
        <div className="p-3 pb-8">
          {result ? (
            <div className="flex flex-col items-center justify-center h-[400px]">
               {result.success ? (
                 <div className="text-center space-y-4">
                   <CheckCircle size={48} className="text-green-500 mx-auto" />
                   <h2 className="text-xl text-white">Account Created: {result.data.login}</h2>
                   <button onClick={() => { handleClose(); if (onSuccess) onSuccess(); }} className="px-6 py-2 bg-[#333] border border-[#555] text-white rounded-[2px] hover:bg-[#444]">
                     OK
                   </button>
                 </div>
               ) : (
                 <div className="text-center space-y-4">
                   <AlertCircle size={48} className="text-red-500 mx-auto" />
                   <h2 className="text-xl text-red-500">Creation Failed</h2>
                   <p className="text-[#ccc]">{result.message}</p>
                   <button onClick={() => setResult(null)} className="px-6 py-2 bg-[#333] border border-[#555] text-white rounded-[2px] hover:bg-[#444]">
                     Try Again
                   </button>
                 </div>
               )}
            </div>
          ) : (
            <form id="new-account-form" onSubmit={handleSubmit}>
              <div className="flex">
                {/* Left Column */}
                <div className="w-[430px]">
                  <FieldRow label="Group:" width="280px">
                    <select className={selectClass} value={form.Group} onChange={e => set('Group', e.target.value)}>
                      {loadingGroups ? (
                        <option value="">Loading groups...</option>
                      ) : (
                        groups.map(g => <option key={g.name} value={g.name}>{g.name}</option>)
                      )}
                    </select>
                  </FieldRow>

                  <FieldRow label="Leverage:" width="120px">
                    <select className={selectClass} value={form.Leverage} onChange={e => set('Leverage', Number(e.target.value))}>
                      {LEVERAGES.map(l => <option key={l} value={l}>1:{l}</option>)}
                    </select>
                  </FieldRow>

                  <div className="h-4" />

                  <FieldRow label="First name:" width="280px">
                    <input className={inputClass} value={form.FirstName} onChange={e => set('FirstName', e.target.value)} required />
                  </FieldRow>
                  
                  <FieldRow label="Last name:" width="220px">
                    <input className={inputClass} value={form.LastName} onChange={e => set('LastName', e.target.value)} required />
                  </FieldRow>

                  <FieldRow label="Email:" width="320px">
                    <input type="email" className={inputClass} value={form.Email} onChange={e => set('Email', e.target.value)} required />
                  </FieldRow>

                  <FieldRow label="Phone:" width="145px">
                    <input className={inputClass} value={form.Phone} onChange={e => set('Phone', e.target.value)} />
                  </FieldRow>

                  <div className="h-4" />

                  <FieldRow label="Country:" width="145px">
                    <select className={selectClass} value={form.Country} onChange={e => set('Country', e.target.value)}>
                      {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </FieldRow>

                  <FieldRow label="Currency:" width="100px">
                    <select className={selectClass} value={form.Currency} onChange={e => set('Currency', e.target.value)}>
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </FieldRow>
                </div>

                {/* Right Column */}
                <div className="flex-1 pt-[124px] pr-4 flex flex-col items-center">
                  <div className="w-[200px]">
                    <div className="text-[12px] text-[#e0e0e0] mb-2 pl-2">Passwords</div>
                    
                    <div className="flex items-center mb-1.5 min-h-[22px]">
                      <div className="w-[70px] text-right pr-2 text-[12px] text-[#e0e0e0] flex-shrink-0">Master:</div>
                      <div className="w-[120px]"><input type="password" value={form.master_pass} onChange={e => set('master_pass', e.target.value)} className={inputClass} required /></div>
                    </div>
                    
                    <div className="flex items-center mb-1.5 min-h-[22px]">
                      <div className="w-[70px] text-right pr-2 text-[12px] text-[#e0e0e0] flex-shrink-0">Investor:</div>
                      <div className="w-[120px]"><input type="password" value={form.investor_pass} onChange={e => set('investor_pass', e.target.value)} className={inputClass} required /></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Buttons */}
              <div className="flex justify-center gap-[10px] mt-6">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-[85px] h-[24px] bg-[#1e1e1e] hover:bg-[#333] border border-white text-white rounded-[2px] text-[12px] flex items-center justify-center transition-colors disabled:opacity-50"
                >
                  OK
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-[85px] h-[24px] bg-[#1e1e1e] hover:bg-[#333] border border-[#555] text-[#ccc] hover:text-white hover:border-white rounded-[2px] text-[12px] flex items-center justify-center transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
export default NewAccountModal;
