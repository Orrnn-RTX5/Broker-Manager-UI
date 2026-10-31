import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Bug, Check, Copy, Plus, Search, SearchX } from 'lucide-react';
import { CATEGORY_LABELS } from '../../services/bugReportService';
import {
  BUG_REPORT_HISTORY_EVENT,
  bugReportHistoryScope,
  readBugReportHistory,
  requestOpenBugReport,
} from '../../services/bugReportHistory';
import { usePermissions } from '../../hooks/usePermissions';
import { getBrokerInfo } from '../../services/brokerAuth';
import './BugReportsView.css';

const severityLabel = (value) => value.charAt(0).toUpperCase() + value.slice(1);

export default function BugReportsView({ onReportBug }) {
  const { manager } = usePermissions();
  const scope = useMemo(() => {
    const broker = getBrokerInfo();
    return bugReportHistoryScope(
      { login: manager.login, id: manager.id, broker_id: manager.brokerId },
      broker?.broker_id || ''
    );
  }, [manager.brokerId, manager.id, manager.login]);

  const subscribe = useCallback((listener) => {
    const onReceipt = (event) => {
      if (event.detail === scope) listener();
    };
    window.addEventListener(BUG_REPORT_HISTORY_EVENT, onReceipt);
    return () => window.removeEventListener(BUG_REPORT_HISTORY_EVENT, onReceipt);
  }, [scope]);

  const getSnapshot = useCallback(() => readBugReportHistory(scope), [scope]);
  const rows = useSyncExternalStore(subscribe, getSnapshot);
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [copyState, setCopyState] = useState(null);

  useEffect(() => {
    if (!copyState) return undefined;
    const timer = setTimeout(() => setCopyState(null), 2500);
    return () => clearTimeout(timer);
  }, [copyState]);

  const handleOpenBugReport = useCallback(() => {
    if (onReportBug) onReportBug();
    else requestOpenBugReport();
  }, [onReportBug]);

  const query = searchQuery.trim().toLowerCase();
  const filtered = rows.filter(
    (row) =>
      (!query || `${row.title} ${row.report_id}`.toLowerCase().includes(query)) &&
      (category === 'all' || category === row.category) &&
      (severity === 'all' || severity === row.severity)
  );

  const copy = async (id) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopyState({ id, message: 'Report reference copied.' });
    } catch {
      setCopyState({ id, message: 'Select the report reference to copy it manually.' });
    }
  };

  return (
    <section className="bug-reports-workspace" aria-labelledby="bug-reports-heading">
      <header className="bug-reports-toolbar">
        <h1 id="bug-reports-heading"><Bug size={15} aria-hidden="true" />Bug Reports</h1>
        <label className="bug-reports-search"><Search size={13} aria-hidden="true" />
          <input
            aria-label="Search bug reports"
            placeholder="Search title or reference…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
        <select aria-label="Filter reports by category" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="all">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select aria-label="Filter reports by severity" value={severity} onChange={(event) => setSeverity(event.target.value)}>
          <option value="all">All Severities</option>
          {['low', 'medium', 'high', 'critical'].map((value) => <option key={value} value={value}>{severityLabel(value)}</option>)}
        </select>
        <button className="bug-reports-primary" type="button" onClick={handleOpenBugReport}><Plus size={13} aria-hidden="true" />Report a Bug</button>
      </header>
      <div className="bug-reports-scroll" tabIndex={0} role="region" aria-label="Bug report submissions">
        <table className="bug-reports-table">
          <caption className="sr-only">Confirmed bug report submissions from this browser session</caption>
          <colgroup><col className="bug-report-title-col" /><col /><col /><col /><col /><col /><col className="bug-report-action-col" /></colgroup>
          <thead><tr>{['Report', 'Reference', 'Category', 'Severity', 'Submitted', 'Status', 'Actions'].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{filtered.map((row) => <tr key={row.report_id}>
            <td title={row.title} className="bug-report-row-title">{row.title}</td>
            <td className="bug-reports-reference" title={row.report_id}>{row.report_id}</td>
            <td>{CATEGORY_LABELS[row.category] || row.category}</td>
            <td><span className={`bug-report-severity bug-report-severity-${row.severity}`}>{severityLabel(row.severity)}</span></td>
            <td title={new Date(row.submitted_at).toLocaleString()}>{new Date(row.submitted_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
            <td><span className="bug-report-submitted"><Check size={11} aria-hidden="true" />Submitted</span>{row.attachment_issue && <span className="bug-report-attachment-warning" title="The report was received, but some attachments could not be uploaded.">Attachment issue</span>}</td>
            <td><button type="button" className="bug-reports-copy" aria-label={`Copy reference ${row.report_id}`} title="Copy report reference" onClick={() => copy(row.report_id)}>{copyState?.id === row.report_id ? <Check size={13} /> : <Copy size={13} />}</button></td>
          </tr>)}</tbody>
        </table>
        {!filtered.length && <div className="bug-reports-empty">
          <span className="bug-reports-empty-icon">{rows.length ? <SearchX size={25} aria-hidden="true" /> : <Bug size={25} aria-hidden="true" />}</span>
          <h2>{rows.length ? 'No matching reports' : 'No reports submitted in this session'}</h2>
          <p>{rows.length ? 'Try another search or clear the filters.' : 'Found an issue? Send the details to the RTX5 platform team. Your submission reference will appear here.'}</p>
          {rows.length ? <button type="button" onClick={() => { setSearchQuery(''); setCategory('all'); setSeverity('all'); }}>Clear filters</button> : <button className="bug-reports-primary" type="button" onClick={handleOpenBugReport}><Plus size={13} aria-hidden="true" />Report a Bug</button>}
        </div>}
      </div>
      <span className="sr-only" role="status">{copyState?.message || ''}</span>
    </section>
  );
}
