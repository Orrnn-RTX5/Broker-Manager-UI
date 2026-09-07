import { createElement, useState } from 'react';
import {
  Activity, ArrowRight, CalendarDays, CheckCircle2, CircleDollarSign, ClipboardCheck,
  FileBarChart, Gavel, Handshake, Landmark, ServerCog, Settings,
  ShieldCheck, UserPlus, UserRoundCheck, Users,
} from 'lucide-react';
import useWorkspaceNavigation from '../../hooks/useWorkspaceNavigation';
import useDashboardMetrics from '../dashboard/useDashboardMetrics';
import {
  OWNER_CONSOLE_ALERTS,
  OWNER_CONSOLE_APPROVALS,
} from './ownerConsoleData';
import {
  countUnreviewedOwnerWorkflows,
  markOwnerConsoleWorkflowReviewed,
  readOwnerConsoleReviewState,
} from './ownerConsoleReviewState';

const money = (value, currency = 'USD') => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0,
}).format(value || 0);

const ACTIONS = [
  { label: 'Add New Client', icon: UserPlus, path: '/clients' },
  { label: 'Manage IB Accounts', icon: Users, path: '/ib' },
  { label: 'Server Management', icon: ServerCog, path: '/dashboard' },
  { label: 'Risk Settings', icon: ShieldCheck, path: '/dealer/restrictions' },
  { label: 'View Reports', icon: FileBarChart, path: '/analytics/trading-accounts' },
  { label: 'System Configuration', icon: Settings, path: '/symbol-management' },
];

const WORKFLOW_ICONS = {
  account: UserRoundCheck,
  activity: Activity,
  client: Users,
  finance: CircleDollarSign,
  ib: Handshake,
  queue: Gavel,
  shield: ShieldCheck,
};

const WorkflowPanel = ({ title, description, items, navigate, panelId, labelledBy, collection, reviewedIds, onReview }) => (
  <section className="cc-owner-workflows" id={panelId} role="tabpanel" aria-labelledby={labelledBy}>
    <header>
      <strong>{title}</strong>
      <small>{description}</small>
    </header>
    <div className="cc-owner-workflow-list">
      {items.map((item) => {
        const Icon = WORKFLOW_ICONS[item.icon] || ClipboardCheck;
        const isReviewed = reviewedIds.includes(item.id);
        return (
          <button
            key={item.id}
            type="button"
            className={`cc-owner-workflow is-${item.tone} ${isReviewed ? 'is-reviewed' : ''}`}
            onPointerEnter={() => navigate.preload?.(item.path)}
            onFocus={() => navigate.preload?.(item.path)}
            onClick={() => {
              onReview(collection, item.id);
              navigate(item.path);
            }}
          >
            <span className="cc-owner-workflow-icon">{isReviewed ? <CheckCircle2 size={15} /> : <Icon size={15} />}</span>
            <span className="cc-owner-workflow-copy">
              <span><strong>{item.title}</strong><small>{isReviewed ? 'Reviewed' : item.meta}</small></span>
              <em>{item.description}</em>
              <b>{item.action}<ArrowRight size={10} /></b>
            </span>
          </button>
        );
      })}
    </div>
    <p className="cc-owner-workflow-note">These are review shortcuts. Live alert and approval records will appear here when the manager API exposes those queues.</p>
  </section>
);

export default function OwnerConsole() {
  const [tab, setTab] = useState('Insights');
  const [reportDate, setReportDate] = useState('');
  const [reviewed, setReviewed] = useState(readOwnerConsoleReviewState);
  const navigate = useWorkspaceNavigation();
  const { data, isLoading, isError } = useDashboardMetrics({
    reportDate: reportDate || undefined,
    summaryOnly: Boolean(reportDate),
  });
  const metrics = data?.metrics || {};
  const deposits = metrics.deposits24h;
  const withdrawals = metrics.withdrawals24h;
  const netFlow = metrics.netFlow24h;
  const currency = metrics.reportCurrency || 'USD';
  const loadingReport = isLoading && !data;
  const reportAvailable = deposits != null || withdrawals != null;
  const cashFlowMax = Math.max(deposits || 0, withdrawals || 0, 1);
  const alertCount = countUnreviewedOwnerWorkflows(OWNER_CONSOLE_ALERTS, reviewed.alerts);
  const approvalCount = countUnreviewedOwnerWorkflows(OWNER_CONSOLE_APPROVALS, reviewed.approvals);
  const markReviewed = (collection, id) => {
    // Persist before navigating because this dock can unmount immediately.
    const next = markOwnerConsoleWorkflowReviewed(reviewed, collection, id);
    setReviewed(next);
  };

  return (
    <aside className="cc-owner-console">
      <div className="cc-owner-tabs" role="tablist" aria-label="Owner console views">
        {['Insights', 'Alerts', 'Approvals'].map((item) => {
          const id = item.toLowerCase();
          return (
            <button
              key={item}
              id={`owner-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={tab === item}
              aria-controls={`owner-panel-${id}`}
              className={tab === item ? 'is-active' : ''}
              onClick={() => setTab(item)}
            >
              {item}
              {item === 'Alerts' && alertCount > 0 && <b>{alertCount}</b>}
              {item === 'Approvals' && approvalCount > 0 && <b>{approvalCount}</b>}
            </button>
          );
        })}
      </div>

      {tab === 'Insights' && (
        <div id="owner-panel-insights" role="tabpanel" aria-labelledby="owner-tab-insights">
          <section className="cc-owner-section">
            <div className="cc-section-title"><strong>Quick Actions</strong></div>
            <div className="cc-quick-grid">
              {ACTIONS.map(({ label, icon: Icon, path }) => (
                <button
                  key={label}
                  type="button"
                  onPointerEnter={() => navigate.preload?.(path)}
                  onFocus={() => navigate.preload?.(path)}
                  onClick={() => navigate(path)}
                >
                  {createElement(Icon, { size: 15 })}<span>{label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="cc-owner-section cc-cashflow">
            <div className="cc-section-title">
              <strong><Landmark size={14} />Cash Flow (Report Day)</strong>
              <label className="cc-report-date" title="Select a UTC report day">
                <CalendarDays size={11} />
                <input
                  type="date"
                  aria-label="Cash flow report day"
                  max={new Date().toISOString().slice(0, 10)}
                  value={reportDate || metrics.reportDate || ''}
                  onChange={(event) => setReportDate(event.target.value)}
                />
              </label>
            </div>
            <div className="cc-cashflow-values">
              <div><small>Total Deposits</small><strong>{loadingReport ? 'Loading…' : deposits == null ? '—' : money(deposits, currency)}</strong><span>{currency}</span></div>
              <div><small>Total Withdrawals</small><strong>{loadingReport ? 'Loading…' : withdrawals == null ? '—' : money(withdrawals, currency)}</strong><span>{currency}</span></div>
              <div><small>Net Flow</small><strong className={netFlow >= 0 ? 'is-positive' : 'is-negative'}>{loadingReport ? 'Loading…' : netFlow == null ? '—' : money(netFlow, currency)}</strong><span>{metrics.reportFinalized ? 'Finalized' : 'Provisional'}</span></div>
            </div>
            {reportAvailable && !loadingReport ? (
              <div className="cc-cashflow-breakdown" aria-label="Daily cash flow totals">
                <div><span>Deposits</span><i><b style={{ width: `${((deposits || 0) / cashFlowMax) * 100}%` }} /></i></div>
                <div className="is-outflow"><span>Withdrawals</span><i><b style={{ width: `${((withdrawals || 0) / cashFlowMax) * 100}%` }} /></i></div>
              </div>
            ) : !loadingReport && (
              <div className="cc-cashflow-empty">{isError ? 'No daily report is available for this date.' : 'Cash-flow totals are unavailable for this report day.'}</div>
            )}
          </section>
          <div className="cc-owner-footnote"><Activity size={11} /> Daily totals from the Manager report API. Intraday candles are not exposed.</div>
        </div>
      )}

      {tab === 'Alerts' && (
        <WorkflowPanel
          title="Operational Alerts"
          description="Open the workspaces most likely to need attention."
          items={OWNER_CONSOLE_ALERTS}
          navigate={navigate}
          panelId="owner-panel-alerts"
          labelledBy="owner-tab-alerts"
          collection="alerts"
          reviewedIds={reviewed.alerts}
          onReview={markReviewed}
        />
      )}

      {tab === 'Approvals' && (
        <WorkflowPanel
          title="Approval Workflows"
          description="Jump to the available review and decision screens."
          items={OWNER_CONSOLE_APPROVALS}
          navigate={navigate}
          panelId="owner-panel-approvals"
          labelledBy="owner-tab-approvals"
          collection="approvals"
          reviewedIds={reviewed.approvals}
          onReview={markReviewed}
        />
      )}
    </aside>
  );
}
