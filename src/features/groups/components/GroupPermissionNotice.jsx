import { useEffect } from 'react';
import { ShieldAlert } from 'lucide-react';
import './GroupPermissionNotice.css';

const COPY = {
  create: 'You do not have permission to create a group.',
  change: 'You do not have permission to change this group.',
  delete: 'You do not have permission to delete a group.',
};

const GroupPermissionNotice = ({ action = 'change', onClose }) => {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="ui-modal-backdrop group-permission-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="ui-modal group-permission" role="alertdialog" aria-modal="true" aria-labelledby="group-permission-title" aria-describedby="group-permission-message">
        <div className="group-permission-mark" aria-hidden="true"><ShieldAlert size={18} /></div>
        <h2 id="group-permission-title">Permission required</h2>
        <p id="group-permission-message">{COPY[action] || COPY.change}</p>
        <p className="group-permission-note">An administrator must grant group management before this action is allowed.</p>
        <div className="group-permission-actions">
          <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" autoFocus onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  );
};

export default GroupPermissionNotice;
