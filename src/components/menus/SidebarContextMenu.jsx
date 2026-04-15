import { useEffect, useRef } from 'react';
import { Info, Ban, CheckCircle, FileText, Trash2 } from 'lucide-react';

const SidebarContextMenu = ({ x, y, account, onClose, onAction, isBlocked }) => {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const style = {
    top:  Math.min(y, window.innerHeight - 260),
    left: Math.min(x, window.innerWidth - 240),
  };

  return (
    <div
      ref={menuRef}
      className="ui-ctxmenu fixed z-[1000]"
      style={{ ...style, minWidth: 200 }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <div className="ui-ctxmenu-item" onClick={() => { onAction('details', account); onClose(); }}>
        <Info size={14} style={{ color: 'var(--accent-text)' }} strokeWidth={1.75} />
        <span className="flex-1">Details</span>
      </div>

      <div className="ui-ctxmenu-sep" />

      <div className="ui-ctxmenu-item" onClick={() => { onAction('summary', account); onClose(); }}>
        <FileText size={14} style={{ color: 'var(--accent-text)' }} strokeWidth={1.75} />
        <span className="flex-1">Summary</span>
      </div>

      <div
        className={`ui-ctxmenu-item ${isBlocked ? 'is-disabled' : ''}`}
        onClick={() => { if (!isBlocked) { onAction('block', account); onClose(); } }}
      >
        <Ban size={14} style={{ color: 'var(--danger-text)' }} strokeWidth={1.75} />
        <span className="flex-1">Block</span>
      </div>

      <div
        className={`ui-ctxmenu-item ${!isBlocked ? 'is-disabled' : ''}`}
        onClick={() => { if (isBlocked) { onAction('unblock', account); onClose(); } }}
      >
        <CheckCircle size={14} style={{ color: 'var(--ok-text)' }} strokeWidth={1.75} />
        <span className="flex-1">Unblock</span>
      </div>

      <div className="ui-ctxmenu-sep" />

      <div
        className="ui-ctxmenu-item"
        style={{ color: 'var(--danger-text)' }}
        onClick={() => { onAction('delete', account); onClose(); }}
      >
        <Trash2 size={14} strokeWidth={1.75} />
        <span className="flex-1">Delete</span>
      </div>
    </div>
  );
};

export default SidebarContextMenu;
