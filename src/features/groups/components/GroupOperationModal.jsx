import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { groupOperationRequest, readSavedOperation, saveOperation } from '../groupOperations.js';
import { canRefreshRejectedOperation, createGroupOperationKey, isTerminalOperation, settingDifferences } from '../groupOperationState.js';
import './GroupOperationModal.css';

export default function GroupOperationModal({ selection, moveOnly = false, initialDestination = '', onClose, onComplete }) {
  const saved = useMemo(() => readSavedOperation(), []);
  const [action, setAction] = useState(saved?.request?.action || (moveOnly ? 'migrate' : 'migrate_and_delete'));
  const [destination, setDestination] = useState(saved?.request?.destination || initialDestination);
  const [search, setSearch] = useState('');
  const [confirmation, setConfirmation] = useState(saved?.submission?.confirmation || '');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [operation, setOperation] = useState(saved?.id ? { id: saved.id, state: 'loading' } : null);
  const [refresh, setRefresh] = useState(0);
  const dialog = useRef(null);
  const [submission, setSubmission] = useState(saved?.submission || null);
  const submitted = useRef(false);
  const complete = useRef(onComplete);
  useEffect(() => { complete.current = onComplete; }, [onComplete]);
  const request = useMemo(() => ({ action, ...selection, ...(action === 'close_and_delete' ? {} : { destination }) }), [action, selection, destination]);
  const label = selection.folder || selection.sources?.[0] || 'Selected groups';
  const active = Boolean(operation && !isTerminalOperation(operation.state));
  const operationId = operation?.id;
  const recovering = Boolean(submission && !preview);
  const differences = settingDifferences(preview?.source_settings, preview?.destination_settings);

  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.focus();
    const key = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]')];
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
    };
    const element = dialog.current;
    element.addEventListener('keydown', key);
    return () => { element.removeEventListener('keydown', key); previous?.focus?.(); };
  }, [onClose]);

  useEffect(() => {
    if (operation || submission) return;
    const controller = new AbortController();
    setPreview(null); setError(''); setBusy(true);
    groupOperationRequest('/preview', request, controller.signal)
      .then(data => { if (!controller.signal.aborted) setPreview(data); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [request, operation, submission, refresh]);

  useEffect(() => {
    if (!operationId || !active) return;
    let cancelled = false, timer;
    const poll = async () => {
      try {
        const next = await groupOperationRequest('/' + encodeURIComponent(operationId));
        if (cancelled) return;
        setOperation(next); setError('');
        if (next.request?.action) setAction(next.request.action);
        if (next.request?.destination) setDestination(next.request.destination);
        if (next.state === 'succeeded') { saveOperation(null); complete.current?.(next); }
        if (next.state === 'failed') saveOperation(null);
        if (isTerminalOperation(next.state)) return;
      } catch (err) { if (!cancelled) setError(err.message); }
      if (!cancelled) timer = setTimeout(poll, 1500);
    };
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [operationId, active]);

  const submit = async () => {
    if (submitted.current) return;
    submitted.current = true; setBusy(true); setError('');
    try {
      const payload = submission || {
        preview_token: preview.preview_token, idempotency_key: createGroupOperationKey(), confirmation,
      };
      setSubmission(payload);
      saveOperation({ selection, request, submission: payload });
      const next = await groupOperationRequest('', payload);
      saveOperation({ id: next.id, selection, request, submission: payload });
      setOperation({ id: next.id, state: 'queued' });
    } catch (err) {
      setError(err.message);
      if (canRefreshRejectedOperation(err)) {
        setSubmission(null); saveOperation(null); setPreview(null); setConfirmation('');
      }
    }
    finally { submitted.current = false; setBusy(false); }
  };
  const reset = () => {
    setSubmission(null); saveOperation(null); setOperation(null); setPreview(null); setConfirmation(''); setRefresh(value => value + 1);
  };
  const display = value => value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return createPortal(
    <div className="ui-modal-backdrop group-operation-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="group-operation-title" className="ui-modal group-operation-dialog">
        <header className="ui-modal-header">
          <span id="group-operation-title">{recovering && !saved?.request ? 'Group operation' : action === 'migrate' ? 'Move accounts' : 'Delete group'}: {label}</span>
          <button type="button" className="ui-btn ui-btn-ghost" aria-label="Close panel" onClick={onClose}><X size={14} /></button>
        </header>
        <div className="ui-modal-body group-operation-body">
          {!operation && recovering && <p>A submission is saved for this selection. Retry to recover its result using the same request.</p>}
          {!operation && !recovering && <>
            {action !== 'migrate' && <fieldset disabled={busy || Boolean(submission)}>
              <legend>Choose an action</legend>
              <label><input type="radio" name="group-action" checked={action === 'migrate_and_delete'} onChange={() => setAction('migrate_and_delete')} /> Migrate accounts and delete group</label>
              <label><input type="radio" name="group-action" checked={action === 'close_and_delete'} onChange={() => setAction('close_and_delete')} /> Permanently close accounts and delete group</label>
            </fieldset>}
            {action !== 'close_and_delete' && <div className="group-operation-target">
              <label htmlFor="group-destination-search">Search destination groups</label>
              <input id="group-destination-search" className="ui-input" value={search} onChange={event => setSearch(event.target.value)} disabled={Boolean(submission)} />
              <label htmlFor="group-destination">Destination group</label>
              <select id="group-destination" className="ui-input" value={destination} onChange={event => setDestination(event.target.value)} disabled={busy || Boolean(submission)}>
                <option value="">Select an existing group</option>
                {(preview?.destinations || []).filter(group => group.name === destination || group.name.toLowerCase().includes(search.toLowerCase())).map(group => <option key={group.name} value={group.name}>{group.name}</option>)}
              </select>
              <p>Accounts will inherit the destination settings. Group-owned account overrides will be reset. Existing access restrictions remain.</p>
            </div>}
            {action === 'close_and_delete' && <p>Account access will be permanently revoked. Account records and financial history are retained. Client profiles and accounts in other groups remain intact.</p>}
            {busy && <p role="status">Checking accounts and settings…</p>}
            {preview && <>
              <h2>Affected groups ({preview.sources.length})</h2>
              <ul>{preview.sources.map(name => <li key={name}>{name}</li>)}</ul>
              <p>{preview.accounts.length} accounts · {preview.accounts.reduce((sum, a) => sum + a.open_positions, 0)} open positions · {preview.accounts.reduce((sum, a) => sum + a.pending_orders, 0)} pending orders</p>
              <details><summary>Affected accounts</summary><ul>{preview.accounts.map(a => <li key={a.login}>{a.login} — {a.group} — {a.status}</li>)}</ul></details>
              {differences.length > 0 && <details><summary>Destination settings changes ({differences.length})</summary>
                <table><thead><tr><th>Group</th><th>Setting</th><th>Current</th><th>Destination</th></tr></thead><tbody>{differences.map(change => <tr key={change.source + change.key}><td>{change.source}</td><td>{change.key.replaceAll('_', ' ')}</td><td>{display(change.before)}</td><td>{display(change.after)}</td></tr>)}</tbody></table>
              </details>}
              <p>Historical fills and posted charges stay unchanged. One incompatible account blocks the entire operation.</p>
              {preview.blockers.length > 0 && <div role="alert"><h2>Resolve before continuing</h2><ul>{preview.blockers.map((blocker, index) => <li key={index}>{blocker.login ? `Account ${blocker.login}: ` : ''}{blocker.message}</li>)}</ul></div>}
            </>}
            {action === 'close_and_delete' && <label>Type “{label}” to confirm permanent closure<input className="ui-input" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" disabled={Boolean(submission)} /></label>}
          </>}
          {operation && <div role="status" aria-live="polite">
            <p>Operation: {operation.id}</p>
            <p>{({ loading: 'Restoring operation status…', queued: 'Validating and applying the operation…', synchronizing: 'Changes committed. Synchronizing account access and connected views…', succeeded: 'Operation completed.', failed: 'Operation failed. Account membership and settings were not changed.' })[operation.state]}</p>
            {operation.result?.accounts !== undefined && <p>{operation.result.accounts} accounts · {operation.result.groups} groups</p>}
            {operation.error?.message && <p>{operation.error.message}</p>}
            {operation.error?.blockers?.map((b, index) => <p key={index}>{b.login ? `Account ${b.login}: ` : ''}{b.message}</p>)}
          </div>}
          {error && <p role="alert" className="group-operation-error">{error}</p>}
          {active && <p>You can close this panel. The accepted operation continues and its progress can be reopened.</p>}
        </div>
        <footer className="ui-modal-footer">
          <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose}>Close</button>
          {!operation && <button type="button" className="ui-btn ui-btn-secondary" disabled={busy || Boolean(submission)} onClick={reset}>Refresh preview</button>}
          {operation?.state === 'failed' && <button type="button" className="ui-btn ui-btn-secondary" onClick={reset}>Preview again</button>}
          {!operation && <button type="button" className={`ui-btn ${action === 'close_and_delete' ? 'ui-btn-danger' : 'ui-btn-primary'}`} disabled={busy || (!submission && (!preview?.preview_token || preview.blockers.length > 0 || action === 'close_and_delete' && confirmation !== label))} onClick={submit}>{submission ? 'Retry submission' : action === 'close_and_delete' ? 'Permanently close and delete' : action === 'migrate' ? 'Migrate accounts' : 'Migrate and delete'}</button>}
        </footer>
      </section>
    </div>, document.body,
  );
}
