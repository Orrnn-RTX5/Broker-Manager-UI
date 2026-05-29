import React, { useState } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import SymbolSelector from './SymbolSelector';
import { fetchManagerApi } from '../../../services/managerFetch';

const defaultPayload = {
  name: "",
  description: "",
  currency: "",
  leverage: 0,
  marginCallLevel: 0,
  stopOutLevel: 0,
  commissionRate: 0,
  commissionType: "",
  swapMultiplier: 0,
  spreadMarkup: 0,
  maxLotPerTrade: 0,
  maxTotalLots: 0,
  executionMode: "",
  bookType: "",
  negativeBalanceProtection: false,
  tradeAllowed: false,
  demo: false,
  accountType: "",
  lotDivisor: 0,
  routingMode: "b_book",
  symbolsAllowed: [],       
  symbolsBlocked: []
};

const InputGroup = ({ label, type = "text", value, onChange, width = "w-[200px]" }) => (
  <div className="flex flex-col gap-1">
    <label className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">{label}</label>
    {type === 'boolean' || type === 'checkbox' ? (
      <input 
        type="checkbox" 
        checked={value} 
        onChange={(e) => onChange(e.target.checked)} 
        className="w-4 h-4 mt-1 accent-blue-500"
      />
    ) : (
      <input
        type={type === 'number' ? 'text' : type}
        value={type === 'number' && value === 0 ? '' : value}
        onChange={(e) => {
          const val = e.target.value;
          if (type === 'number') {
            onChange(val === '' ? 0 : Number(val));
          } else {
            onChange(val);
          }
        }}
        className={`${width} h-[24px] bg-white dark:bg-[#1a1b1f] border border-gray-300 dark:border-gray-700 rounded-sm px-2 text-[12px] text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500`}
      />
    )}
  </div>
);

const SelectGroup = ({ label, value, options, onChange, width = "w-full" }) => (
  <div className="flex flex-col gap-1">
    <label className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${width} h-[24px] bg-white dark:bg-[#1a1b1f] border border-gray-300 dark:border-gray-700 rounded-sm px-1.5 text-[12px] text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500 cursor-pointer`}
    >
      {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
  </div>
);

const NewGroupModal = ({ initialData, onClose, onSuccess }) => {
  const [formData, setFormData] = useState(() => {
    const data = { ...(initialData || defaultPayload) };
    if (Array.isArray(data.symbolsAllowed)) data.symbolsAllowed = data.symbolsAllowed.join(', ');
    if (Array.isArray(data.symbolsBlocked)) data.symbolsBlocked = data.symbolsBlocked.join(', ');
    return data;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (key, val) => {
    setFormData(prev => {
      const next = { ...prev, [key]: val };
      // Sync bookType with routingMode if routingMode changed
      if (key === 'routingMode') {
        next.bookType = val === 'b_book' ? 'B-Book' : val === 'a_book' ? 'A-Book' : 'Hybrid';
      }
      return next;
    });
  };

  const handleArrayChange = (key, csvString) => {
    setFormData(prev => ({ ...prev, [key]: csvString }));
  };

  const handleSubmit = async () => {
    if (!formData.name) {
      setError("Group Name is required.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('authToken');
      const url = initialData 
        ? `/GroupUpdate?id=${token}&group=${initialData.name}`
        : `/GroupCreate?id=${token}`;

      const payload = { ...formData };
      if (typeof payload.symbolsAllowed === 'string') {
        payload.symbolsAllowed = payload.symbolsAllowed.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (typeof payload.symbolsBlocked === 'string') {
        payload.symbolsBlocked = payload.symbolsBlocked.split(',').map(s => s.trim()).filter(Boolean);
      }

      const res = await fetchManagerApi(url, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const responseText = await res.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        throw new Error(responseText || "Invalid JSON received from server");
      }

      if (!res.ok) {
        throw new Error(responseData.error || responseData.message || 'Failed to create group');
      }

      if (onSuccess) onSuccess(responseData);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[#f0f0f0] dark:bg-[#1e1e1e] w-[700px] border border-[#cccccc] dark:border-[#333333] shadow-2xl flex flex-col font-sans select-none rounded-md overflow-hidden">
        
        {/* Header */}
        <div className="h-8 bg-gradient-to-b from-[#f9f9f9] to-[#e4e4e4] dark:from-[#2d2d30] dark:to-[#252526] border-b border-[#cccccc] dark:border-[#333333] flex justify-between items-center px-3">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-black dark:text-gray-200 font-semibold tracking-wide">
               {initialData ? `Edit Group: ${initialData.name}` : 'Create New Group'}
            </span>
          </div>
          <button onClick={onClose} className="hover:bg-red-500 hover:text-white text-gray-600 dark:text-gray-400 p-0.5 rounded-sm transition-colors mt-0.5">
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 max-h-[70vh] bg-white dark:bg-[#1e1e1e] text-[12px]">
          {error && (
            <div className="mb-4 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            
            {/* Core Box */}
            <div className="col-span-2 md:col-span-1 p-3 border border-gray-200 dark:border-[#333] rounded-sm bg-gray-50 dark:bg-[#252526] flex flex-col gap-3">
              <h3 className="font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-[#333] pb-1 mb-1">General</h3>
              <InputGroup label="Group Name" value={formData.name} onChange={(v) => handleChange('name', v)} width="w-full" />
              <InputGroup label="Description" value={formData.description} onChange={(v) => handleChange('description', v)} width="w-full" />
              <div className="flex gap-4">
                <InputGroup label="Currency" value={formData.currency} onChange={(v) => handleChange('currency', v)} width="w-full" />
                <InputGroup label="Account Type" value={formData.accountType} onChange={(v) => handleChange('accountType', v)} width="w-full" />
              </div>
              <div className="flex gap-6 mt-1">
                <InputGroup label="Demo Group" type="boolean" value={formData.demo} onChange={(v) => handleChange('demo', v)} />
                <InputGroup label="Trade Allowed" type="boolean" value={formData.tradeAllowed} onChange={(v) => handleChange('tradeAllowed', v)} />
                <InputGroup label="Negative Balance Protection" type="boolean" value={formData.negativeBalanceProtection} onChange={(v) => handleChange('negativeBalanceProtection', v)} />
              </div>
            </div>

            {/* Finance Limits Box */}
            <div className="col-span-2 md:col-span-1 p-3 border border-gray-200 dark:border-[#333] rounded-sm bg-gray-50 dark:bg-[#252526] flex flex-col gap-3">
              <h3 className="font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-[#333] pb-1 mb-1">Financial</h3>
              <div className="grid grid-cols-2 gap-4">
                <InputGroup label="Leverage" type="number" value={formData.leverage} onChange={(v) => handleChange('leverage', v)} width="w-full" />
                <InputGroup label="Margin Call Level (%)" type="number" value={formData.marginCallLevel} onChange={(v) => handleChange('marginCallLevel', v)} width="w-full" />
                <InputGroup label="Stop Out Level (%)" type="number" value={formData.stopOutLevel} onChange={(v) => handleChange('stopOutLevel', v)} width="w-full" />
                <InputGroup label="Spread Markup" type="number" value={formData.spreadMarkup} onChange={(v) => handleChange('spreadMarkup', v)} width="w-full" />
              </div>
            </div>

             {/* Trading Box */}
             <div className="col-span-2 md:col-span-1 p-3 border border-gray-200 dark:border-[#333] rounded-sm bg-gray-50 dark:bg-[#252526] flex flex-col gap-3">
              <h3 className="font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-[#333] pb-1 mb-1">Execution & Commission</h3>
              <div className="grid grid-cols-2 gap-4">
                <InputGroup label="Execution Mode" value={formData.executionMode} onChange={(v) => handleChange('executionMode', v)} width="w-full" />
                <SelectGroup 
                  label="Book Type / Routing" 
                  value={formData.routingMode} 
                  options={[
                    { value: 'b_book', label: 'B-Book' },
                    { value: 'a_book', label: 'A-Book' },
                    { value: 'hybrid', label: 'Hybrid' }
                  ]}
                  onChange={(v) => handleChange('routingMode', v)} 
                />
                <InputGroup label="Commission Rate" type="number" value={formData.commissionRate} onChange={(v) => handleChange('commissionRate', v)} width="w-full" />
                <InputGroup label="Commission Type" value={formData.commissionType} onChange={(v) => handleChange('commissionType', v)} width="w-full" />
                <InputGroup label="Max Lot Per Trade" type="number" value={formData.maxLotPerTrade} onChange={(v) => handleChange('maxLotPerTrade', v)} width="w-full" />
                <InputGroup label="Max Total Lots" type="number" value={formData.maxTotalLots} onChange={(v) => handleChange('maxTotalLots', v)} width="w-full" />
                <InputGroup label="Lot Divisor" type="number" value={formData.lotDivisor} onChange={(v) => handleChange('lotDivisor', v)} width="w-full" />
                <InputGroup label="Swap Multiplier" type="number" value={formData.swapMultiplier} onChange={(v) => handleChange('swapMultiplier', v)} width="w-full" />
              </div>
            </div>

            {/* Symbols */}
            <div className="col-span-2 md:col-span-1 p-3 border border-gray-200 dark:border-[#333] rounded-sm bg-gray-50 dark:bg-[#252526] flex flex-col gap-3">
              <h3 className="font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-[#333] pb-1 mb-1">Symbols</h3>
              <SymbolSelector
                 label="Allowed Symbols" 
                 value={formData.symbolsAllowed} 
                 onChange={(v) => handleArrayChange('symbolsAllowed', v)} 
              />
              <SymbolSelector
                 label="Blocked Symbols" 
                 value={formData.symbolsBlocked} 
                 onChange={(v) => handleArrayChange('symbolsBlocked', v)} 
              />
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="h-12 bg-[#f0f0f0] dark:bg-[#2d2d30] border-t border-[#cccccc] dark:border-[#333333] flex justify-end items-center px-4 gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-1.5 min-w-[80px] text-[12px] bg-[#e1e1e1] dark:bg-[#3e3e42] hover:bg-[#d1d1d1] dark:hover:bg-[#4a4a4f] text-black dark:text-gray-200 border border-[#cccccc] dark:border-[#555] rounded-sm transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={loading}
            className="px-4 py-1.5 min-w-[80px] text-[12px] bg-blue-600 hover:bg-blue-700 text-white border border-blue-700 rounded-sm flex justify-center items-center gap-2 transition-colors disabled:opacity-50"
          >
            <Save size={13} />
            {loading ? (initialData ? 'Updating...' : 'Creating...') : (initialData ? 'Update' : 'Create')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewGroupModal;
