import { useEffect, useState } from 'react';
import AccountDialog from './AccountDialog';
import { useAccountSummary } from '../../hooks/useAccountDetails';
import { loadAccountSummary, peekAccountSummary } from '../../services/accountDetails';
import { buildAccountSummaryRows } from '../../utils/accountSummaryData';

export default function AccountsSummaryModal({ account, onClose }) {
  const cached = useAccountSummary(account.login);
  const [loading, setLoading] = useState(() => !peekAccountSummary(account.login));
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    loadAccountSummary(account.login, { force: revision > 0 }).then(() => {
      if (active) setError('');
    }).catch(failure => {
      if (active) setError(failure.message || 'Unable to refresh the summary.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [account.login, revision]);
  const rows = buildAccountSummaryRows(account.data ?? cached, account.row, account.login);
  return (
    <AccountDialog title={`Account Summary · ${account.login}`} className="account-summary-dialog" onClose={onClose}
      footer={<>
        <span className="account-summary-status" role="status">{loading ? 'Updating summary…' : ''}</span>
        <button type="button" className="account-panel-button" onClick={onClose}>Close</button>
      </>}>
      <dl className="account-summary-rows" aria-label="Account financial summary">
        {rows.map(row => <div key={row.label}><dt>{row.label}</dt><dd className={`tabular ${row.tone}`}>{row.value}</dd></div>)}
      </dl>
      {error && <div className="account-panel-error" role="alert"><span>{error}</span><button type="button" className="account-panel-button" disabled={loading} onClick={() => { setLoading(true); setRevision(value => value + 1); }}>Retry</button></div>}
    </AccountDialog>
  );
}
