import { Children, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import {
  Activity, BarChart2, ChevronDown, ChevronRight, CircleDollarSign, ClipboardCheck,
  FileClock, Folder, Gavel, GitBranch, Handshake, Landmark, LayoutDashboard,
  Network, Server, Settings2, Shield, ShieldCheck, TrendingUp, User, Users, Users2,
} from 'lucide-react';
import { useGroupList } from '../hooks/useGroupList';
import useWorkspaceNavigation from '../hooks/useWorkspaceNavigation';
import { usePermissions } from '../hooks/usePermissions';
import { getBrokerInfo } from '../services/brokerAuth';
import NewGroupModal from '../features/groups/components/NewGroupModal';
import { getGroupDetailsPath } from '../features/groups/groupRoutes';
import { PERMISSIONS } from '../utils/permissions';
import { preloadAnalyticsDestination } from '../features/analytics/analyticsQueries.js';
import { preloadWorkspaceDestination } from '../features/workspaceQueries.js';

const TreeNode = ({ label, icon: Icon, children, defaultExpanded = false, count, path, activePath, disabled, onClickNode, onExpandedChange, onIntent }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = Children.count(children) > 0;
  // Clients and IB Tree are separate destinations, not child views of their
  // neighboring list pages. Only detail routes inherit a list highlight.
  const active = path && (
    activePath === path
    || (path === '/symbols' && activePath.startsWith('/symbols/'))
    || (path === '/ib' && /^\/ib\/\d+(?:\/|$)/.test(activePath))
  );
  const activate = (event) => {
    if (disabled) return;
    if (hasChildren) {
      const next = !expanded;
      setExpanded(next);
      onExpandedChange?.(next);
    }
    onClickNode?.(event);
  };
  return (
    <div className={`cc-tree-node ${hasChildren ? 'is-branch' : 'is-leaf'} ${active ? 'is-active' : ''} ${disabled ? 'is-disabled' : ''}`}>
      <div role="treeitem" tabIndex={disabled ? -1 : 0} aria-expanded={hasChildren ? expanded : undefined} aria-disabled={disabled || undefined} title={disabled ? 'Workspace adapter not connected yet' : label} onClick={activate} onPointerEnter={onIntent} onFocus={onIntent} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(event); } }}>
        <span className="cc-tree-chevron">{hasChildren ? (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}</span>
        <span className="cc-tree-icon">{Icon && <Icon size={13} strokeWidth={1.65} />}</span>
        <span>{label}</span>{count != null && <b>{count}</b>}
      </div>
      {hasChildren && expanded && <div className="cc-tree-children">{children}</div>}
    </div>
  );
};

export default function NavigatorPanel() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useWorkspaceNavigation();
  const [loadGroups, setLoadGroups] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const { groups, total, loading } = useGroupList({ limit: 100, offset: 0, sort_by: 'name', sort_dir: 'asc', enabled: loadGroups });
  const { canAct } = usePermissions();
  const canManageGroups = canAct(PERMISSIONS.MANAGE_GROUPS);
  const [brokerInfo] = useState(() => getBrokerInfo());
  const serverLabel = brokerInfo?.name || brokerInfo?.broker_id || 'RTX5-Live';
  const go = (path) => () => navigate(path);
  const node = (label, icon, path, preload = 'workspace') => (
    <TreeNode key={label} label={label} icon={icon} path={path} activePath={location.pathname} onIntent={() => preload === 'analytics' ? preloadAnalyticsDestination(queryClient, path) : preloadWorkspaceDestination(queryClient, path)} onClickNode={go(path)} />
  );

  useEffect(() => {
    const start = () => setLoadGroups(true);
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(start, { timeout: 2000 });
      return () => window.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(start, 1000);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="cc-navigator workspace-ui" role="tree" aria-label="Brokerage workspaces">
      <div className="cc-navigator-scroll">
        <TreeNode label="Servers" icon={Server} defaultExpanded>
          <TreeNode label={serverLabel} icon={Server} />
          <TreeNode label="RTX5-Demo" icon={Server} />
          <TreeNode label="Backup Servers" icon={Network} disabled />
        </TreeNode>

        <TreeNode label="Analytics" icon={BarChart2} defaultExpanded>
          {node('Dashboard', LayoutDashboard, '/dashboard', 'analytics')}
          <TreeNode label="Reports" icon={FileClock} disabled />
          {node('Trading Analytics', TrendingUp, '/analytics/trading-accounts', 'analytics')}
          {node('Online Users', Users, '/analytics/online-users', 'analytics')}
          {node('Open Positions', Activity, '/analytics/open-positions', 'analytics')}
          {node('Open Orders', ClipboardCheck, '/analytics/open-orders', 'analytics')}
        </TreeNode>

        <TreeNode label="Clients & Orders" icon={Users} defaultExpanded>
          {node('Clients', User, '/clients')}
          {node('Trading Accounts', User, '/clients/trading-accounts')}
          {node('Orders', ClipboardCheck, '/clients/orders')}
          {node('Position History', FileClock, '/clients/positions')}
        </TreeNode>

        <TreeNode label="Dealing" icon={Gavel} defaultExpanded>
          {node('Dealing Desk', Activity, '/dealing')}
          {node('Dealer Queue', Gavel, '/dealer/queue')}
          <TreeNode label="Price Management" icon={TrendingUp} disabled />
          <TreeNode label="Liquidity Providers" icon={Network} disabled />
        </TreeNode>

        <TreeNode label="IB Management" icon={Handshake} defaultExpanded>
          {node('IB Accounts', Handshake, '/ib')}
          {node('IB Tree', GitBranch, '/ib/tree')}
          <TreeNode label="Commissions" icon={CircleDollarSign} disabled />
          <TreeNode label="Payouts" icon={Landmark} disabled />
        </TreeNode>

        <TreeNode label="Risk Management" icon={Shield} defaultExpanded>
          {node('Exposure', Activity, '/analytics/open-positions')}
          <TreeNode label="Margin Rules" icon={Settings2} disabled />
          {node('Restricted Accounts', Shield, '/dealer/restrictions')}
        </TreeNode>

        <TreeNode label="Compliance" icon={ShieldCheck}>
          <TreeNode label="KYC / AML" icon={ShieldCheck} disabled />
          <TreeNode label="Verification Queue" icon={ClipboardCheck} disabled />
          <TreeNode label="Approval Queue" icon={ClipboardCheck} disabled />
          <TreeNode label="Audit Review" icon={FileClock} disabled />
        </TreeNode>

        <TreeNode label="Finance" icon={Landmark}>
          <TreeNode label="Deposits / Withdrawals" icon={CircleDollarSign} disabled />
          <TreeNode label="Revenue & Payouts" icon={Landmark} disabled />
          <TreeNode label="Cash Flow" icon={Activity} disabled />
        </TreeNode>

        <TreeNode label="Markets" icon={TrendingUp}>
          {node('Symbols Browser', TrendingUp, '/symbols')}
          {node('Symbol Management', Settings2, '/symbol-management')}
        </TreeNode>

        <TreeNode label="Account Groups" icon={Users2} count={loadGroups ? (loading ? '…' : total ?? groups.length) : null} onExpandedChange={(open) => open && setLoadGroups(true)}>
          {groups.map((group) => <TreeNode key={group.name} label={group.name} icon={Folder} path={getGroupDetailsPath(group.name)} activePath={location.pathname} onClickNode={go(getGroupDetailsPath(group.name))} />)}
          {canManageGroups && <TreeNode label="New Group" icon={Users2} onClickNode={() => setNewGroupOpen(true)} />}
        </TreeNode>

        <TreeNode label="System" icon={Settings2}>
          <TreeNode label="Servers" icon={Server} disabled />
          <TreeNode label="Users & Permissions" icon={Users} disabled />
          <TreeNode label="Configuration" icon={Settings2} disabled />
          <TreeNode label="API Connections" icon={Network} disabled />
          <TreeNode label="Audit Logs" icon={FileClock} disabled />
        </TreeNode>
      </div>
      {newGroupOpen && canManageGroups && <NewGroupModal onClose={() => setNewGroupOpen(false)} onSuccess={() => setNewGroupOpen(false)} />}
    </div>
  );
}
