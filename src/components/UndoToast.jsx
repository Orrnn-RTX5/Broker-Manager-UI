import { useEffect } from 'react';
import { RotateCcw, X } from 'lucide-react';

export default function UndoToast({ message, onUndo, onClose, canUndo = true }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose?.();
    }, 6500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className="fixed bottom-5 right-5 z-[100060] flex items-center gap-3 px-3.5 py-2.5 rounded-md bg-[#1e2025] border border-[#3f4146] text-white shadow-2xl text-[12px] select-none"
      role="status"
    >
      <span className="text-[#e2e4e8]">{message}</span>
      {canUndo && (
        <button
          type="button"
          onClick={() => {
            onUndo?.();
            onClose?.();
          }}
          className="px-2.5 py-1 rounded text-[11px] font-semibold bg-[#007ecf] hover:bg-[#0090eb] text-white transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
        >
          <RotateCcw size={12} />
          Undo (Ctrl+Z)
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        className="text-[#9ea0a6] hover:text-white p-0.5 rounded cursor-pointer transition-colors"
        aria-label="Dismiss notification"
      >
        <X size={13} />
      </button>
    </div>
  );
}
