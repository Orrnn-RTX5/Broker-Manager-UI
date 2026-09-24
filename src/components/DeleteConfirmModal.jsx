import { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export default function DeleteConfirmModal({ item, onConfirm, onCancel }) {
  const confirmBtnRef = useRef(null);

  useEffect(() => {
    confirmBtnRef.current?.focus();
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  if (!item) return null;

  const isFolder = item.type === 'folder';

  return (
    <div
      className="fixed inset-0 z-[100050] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
    >
      <div
        className="w-full max-w-[420px] rounded-md border border-[#3f4146] bg-[#1e1e22] text-[#d6d8db] shadow-2xl flex flex-col font-sans select-none overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-9 px-3.5 bg-[#25262a] border-b border-[#383a3f] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-400" />
            <span id="delete-dialog-title" className="text-[12px] font-semibold text-white">
              {isFolder ? 'Delete Folder' : 'Delete File'}
            </span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-[#9ea0a6] hover:text-white hover:bg-[#383a3f] p-1 rounded transition-colors"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 text-[12px] flex flex-col gap-2 leading-relaxed">
          <p className="text-white">
            Are you sure you want to delete{' '}
            <strong className="text-amber-300 font-semibold">{item.label}</strong>
            {isFolder ? ' and all of its contents?' : '?'}
          </p>
          {item.isDefault || item.id === 'analytics-trading-accounts' ? (
            <p className="text-[#e0a82e] text-[11px] bg-amber-500/10 border border-amber-500/20 rounded p-2">
              Note: &quot;{item.label}&quot; is a default analytics view. You can restore it anytime by right-clicking Analytics → &quot;Restore Default Analytics&quot;, or by pressing{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-[#2c2d33] border border-[#3f4146] text-[#d6d8db] font-mono text-[10px]">
                Ctrl+Z
              </kbd>.
            </p>
          ) : (
            <p className="text-[#8f9298] text-[11px]">
              This action will remove it from your Analytics navigator. You can undo this deletion at any time by pressing{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-[#2c2d33] border border-[#3f4146] text-[#d6d8db] font-mono text-[10px]">
                Ctrl+Z
              </kbd>.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="h-12 px-3.5 bg-[#18191b] border-t border-[#313338] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-1.5 rounded text-[11.5px] font-medium text-[#c4c6ca] hover:bg-[#2e3036] hover:text-white border border-[#3f4146] transition-colors"
          >
            Cancel
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            className="px-3.5 py-1.5 rounded text-[11.5px] font-medium bg-[#dc2626] hover:bg-[#ef4444] text-white transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500/50"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
