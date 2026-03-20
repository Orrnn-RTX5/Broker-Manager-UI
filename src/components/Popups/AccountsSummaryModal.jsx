import React from 'react';
import { X, FileText } from 'lucide-react';

const AccountsSummaryModal = ({ account, onClose }) => {
  // Assuming account.data is an array of summaries or an object
  const data = Array.isArray(account.data) ? account.data[0] : account.data;

  // Render a clean key-value grid for the summary data
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[#f0f0f0] dark:bg-[#1e1e1e] w-[400px] border border-[#a0a0a0] dark:border-[#333333] shadow-2xl flex flex-col font-sans select-none rounded-none overflow-hidden">
        
        {/* Header */}
        <div className="h-7 bg-[#e5e5e5] dark:bg-[#2d2d30] border-b border-[#a0a0a0] dark:border-[#333333] flex justify-between items-center px-3">
          <div className="flex items-center gap-2">
            <FileText size={12} className="text-purple-500" />
            <span className="text-[11px] font-bold text-gray-800 dark:text-gray-200 tracking-wide uppercase">
              Summary: {account.login}
            </span>
          </div>
          <button onClick={onClose} className="hover:bg-red-500 hover:text-white text-gray-600 dark:text-gray-400 p-0.5 rounded-sm transition-colors mt-[1px]">
            <X size={12} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 max-h-[60vh] overflow-y-auto bg-white dark:bg-[#252526]">
          {data ? (
            <div className="flex flex-col gap-0.5 border border-[#a0a0a0] dark:border-[#333333]">
              {Object.entries(data).map(([key, val], idx) => (
                <div key={key} className={`flex px-2 py-1 ${idx % 2 === 0 ? 'bg-[#f8f8f8] dark:bg-[#1e1e1e]' : 'bg-white dark:bg-[#2a2a2b]'}`}>
                  <span className="text-[11px] text-gray-600 dark:text-gray-400 w-[120px] shrink-0 font-medium">{key}</span>
                  <span className="text-[11px] text-gray-900 dark:text-gray-200 truncate">
                    {val !== null && val !== undefined ? String(val) : '—'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-gray-500 text-center py-4">No summary data available.</div>
          )}
        </div>

        {/* Footer */}
        <div className="h-10 bg-[#e5e5e5] dark:bg-[#2d2d30] border-t border-[#a0a0a0] dark:border-[#333333] flex justify-end items-center px-4">
          <button 
            onClick={onClose}
            className="w-[80px] h-[22px] bg-[#d4d0c8] dark:bg-[#333333] hover:bg-[#e6e6e6] dark:hover:bg-[#3e3e42] border border-[#a0a0a0] dark:border-[#555] text-gray-800 dark:text-gray-200 text-[11px] rounded-none transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountsSummaryModal;
