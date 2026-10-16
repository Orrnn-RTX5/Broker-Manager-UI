import { useState } from 'react';
import AccountDialog from './AccountDialog';

const ACTIONS = {
  block: { title: 'Block account', button: 'Block account', message: 'Archive this account and block its access?', tone: 'is-danger' },
  unblock: { title: 'Unblock account', button: 'Unblock account', message: 'Restore this account and its access?', tone: 'is-primary' },
  delete: { title: 'Delete account', button: 'Delete account', message: 'Permanently delete this account? This action cannot be undone.', tone: 'is-danger' },
};

export default function AccountActionDialog({ action, account, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const settings = ACTIONS[action];
  const login = typeof account === 'object' ? account.login : account;
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await onConfirm(action, account); onClose(); }
    catch (failure) { setError(failure.message || 'Unable to complete the account action.'); }
    finally { setBusy(false); }
  };
  return (
    <AccountDialog title={`${settings.title} · ${login}`} className="account-action-dialog" busy={busy} onClose={onClose}
      footer={<>
        <button type="button" className="account-panel-button" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={`account-panel-button ${settings.tone}`} onClick={confirm} disabled={busy}>{busy ? 'Processing…' : settings.button}</button>
      </>}>
      <p className="account-action-message">{settings.message}</p>
      <dl className="account-action-identity"><div><dt>Login</dt><dd>{login}</dd></div>{account.Name && <div><dt>Name</dt><dd>{account.Name}</dd></div>}</dl>
      {error && <p className="account-panel-error" role="alert">{error}</p>}
    </AccountDialog>
  );
}
