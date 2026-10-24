import { createElement, useState } from 'react';
import {
  Activity, ArrowRight, CheckCircle2, CircleDollarSign, ClipboardCheck,
  FileBarChart, Gavel, Handshake, ServerCog, Settings,
  ShieldCheck, UserPlus, UserRoundCheck, Users,
} from 'lucide-react';
import useWorkspaceNavigation from '../../hooks/useWorkspaceNavigation';
import { usePermissions } from '../../hooks/usePermissions.js';
import { PERMISSIONS } from '../../utils/permissions.js';
import { useMultiScreenStore } from '../../store/multiScreenStore';
import {
  OWNER_CONSOLE_ALERTS,
  OWNER_CONSOLE_APPROVALS,
} from './ownerConsoleData';
import {
  countUnreviewedOwnerWorkflows,
  markOwnerConsoleWorkflowReviewed,
  readOwnerConsoleReviewState,
} from './ownerConsoleReviewState';

const ACTIONS = [
  { label: 'Add New Client', icon: UserPlus, action: 'new-account' },
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
  const openAccountScreen = useMultiScreenStore((state) => state.openAccountScreen);
  const [reviewed, setReviewed] = useState(readOwnerConsoleReviewState);
  const navigate = useWorkspaceNavigation();
  const { canAct } = usePermissions();
  const canViewPositions = canAct(PERMISSIONS.VIEW_POSITIONS);
  const alerts = canViewPositions
    ? OWNER_CONSOLE_ALERTS
    : OWNER_CONSOLE_ALERTS.filter((item) => item.id !== 'position-exposure');
  const alertCount = countUnreviewedOwnerWorkflows(alerts, reviewed.alerts);
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
          <section className="cc-owner-section cc-owner-quick-actions">
            <div className="cc-section-title"><strong>Quick Actions</strong></div>
            <div className="cc-quick-grid">
              {ACTIONS.map(({ label, icon: Icon, path, action }) => (
                <button
                  key={label}
                  type="button"
                  onPointerEnter={() => path && navigate.preload?.(path)}
                  onFocus={() => path && navigate.preload?.(path)}
                  onClick={() => action === 'new-account' ? openAccountScreen() : navigate(path)}
                >
                  {createElement(Icon, { size: 15 })}<span>{label}</span>
                </button>
              ))}
            </div>
          </section>

        </div>
      )}

      {tab === 'Alerts' && (
        <WorkflowPanel
          title="Operational Alerts"
          description="Open the workspaces most likely to need attention."
          items={alerts}
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
