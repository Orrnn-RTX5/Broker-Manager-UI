import React, { useEffect, useRef } from 'react';
import { Info, Ban, CheckCircle, FileText, Trash2 } from 'lucide-react';

const SidebarContextMenu = ({ x, y, account, onClose, onAction, isBlocked }) => {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    // Also handle escape key
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  // Adjust position to keep menu inside viewport
  const style = {
    top: `${y}px`,
    left: `${x}px`,
  };

  return (
    <div 
      ref={menuRef}
      className="fixed z-[1000] bg-[#f2f2f2] dark:bg-[#252526] border border-[#a0a0a0] dark:border-[#333333] shadow-[2px_2px_4px_rgba(0,0,0,0.2)] dark:shadow-[2px_2px_4px_rgba(0,0,0,0.6)] py-1 min-w-[160px] text-[12px] text-gray-800 dark:text-gray-200"
      style={style}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >

      <button 
        className="w-full px-4 py-1 flex items-center gap-2 hover:bg-[#e6e6e6] dark:hover:bg-[#3e3e42] transition-colors"
        onClick={() => { onAction('details', account); onClose(); }}
      >
        <Info size={14} className="text-blue-500 dark:text-blue-400" />
        <span>Details</span>
      </button>

      <div className="h-px bg-gray-300 dark:bg-[#333333] my-1"></div>
      <button 
        className="w-full px-4 py-1 flex items-center gap-2 hover:bg-[#e6e6e6] dark:hover:bg-[#3e3e42] transition-colors"
        onClick={() => { onAction('summary', account); onClose(); }}
      >
        <FileText size={14} className="text-purple-500 dark:text-purple-400" />
        <span>Summary</span>
      </button>

      <button 
        className={`w-full px-4 py-1 flex items-center gap-2 transition-colors ${isBlocked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#e6e6e6] dark:hover:bg-[#3e3e42]'}`}
        onClick={() => { if (!isBlocked) { onAction('block', account); onClose(); } }}
        disabled={isBlocked}
      >
        <Ban size={14} className="text-red-500" />
        <span>Block</span>
      </button>
      
      <button 
        className={`w-full px-4 py-1 flex items-center gap-2 transition-colors ${!isBlocked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#e6e6e6] dark:hover:bg-[#3e3e42]'}`}
        onClick={() => { if (isBlocked) { onAction('unblock', account); onClose(); } }}
        disabled={!isBlocked}
      >
        <CheckCircle size={14} className="text-green-500" />
        <span>Unblock</span>
      </button>

      <div className="h-px bg-gray-300 dark:bg-[#333333] my-1"></div>
      <button 
        className="w-full px-4 py-1 flex items-center gap-2 hover:bg-red-50 dark:hover:bg-red-900/40 transition-colors text-red-600 dark:text-red-400"
        onClick={() => { onAction('delete', account); onClose(); }}
      >
        <Trash2 size={14} />
        <span>Delete</span>
      </button>
    </div>
  );
};

export default SidebarContextMenu;
