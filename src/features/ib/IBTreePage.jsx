import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, GitBranch, Loader, RefreshCw, Search, User } from 'lucide-react';
import ibApi from '../../services/ibApi';
import {
  normalizeIBAccount,
  normalizeIBTreeNode,
  normalizeObject,
  normalizeRecords,
} from './ibDomain';

const STATUS_BADGE = {
  active: 'ui-badge-success',
  approved: 'ui-badge-info',
  pending: 'ui-badge-warn',
  suspended: 'ui-badge-neutral',
  rejected: 'ui-badge-danger',
  removed: 'ui-badge-danger',
};

const StatusBadge = ({ status }) => (
  <span className={`ui-badge text-[10px] px-1 ${STATUS_BADGE[status] || 'ui-badge-neutral'}`}>
    {String(status || '-').toUpperCase()}
  </span>
);

const IBNode = ({ node, depth = 0, onSelect }) => {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;

  return (
    <div style={{ marginLeft: depth ? 18 : 0 }}>
      <div
        className="ib-tree-node flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer transition-colors"
        onMouseOver={(event) => { event.currentTarget.style.background = 'var(--accent-soft)'; }}
        onMouseOut={(event) => { event.currentTarget.style.background = 'transparent'; }}
        onClick={() => {
          if (hasChildren) setExpanded((value) => !value);
          onSelect?.(node);
        }}
      >
        <span className="ib-tree-node-expander w-4 text-center text-[10px]" style={{ color: 'var(--muted)' }}>{hasChildren ? (expanded ? '-' : '+') : ''}</span>
        <User size={13} style={{ color: 'var(--accent)' }} />
        <span className="ib-tree-node-primary tabular font-mono text-[12px]">{node.login}</span>
        <span className="ib-tree-node-primary text-[12px]" style={{ color: 'var(--text-2)' }}>{node.company_name || '-'}</span>
        <StatusBadge status={node.status} />
        <span className="ib-tree-node-meta text-[10px]" style={{ color: 'var(--text-3)' }}>Lv.{node.level} - {node.client_count} clients</span>
      </div>
      {hasChildren && expanded && (
        <div className="ml-4" style={{ borderLeft: '1px solid var(--border)' }}>
          {node.children.map((child) => <IBNode key={child.login} node={child} depth={depth + 1} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  );
};

const IBTreePage = () => {
  const [accounts, setAccounts] = useState([]);
  const [rootLogin, setRootLogin] = useState('');
  const [tree, setTree] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingTree, setLoadingTree] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoadingAccounts(true);
    ibApi.list()
      .then((response) => {
        if (!alive) return;
        const rows = normalizeRecords(response, ['accounts']).map(normalizeIBAccount);
        setAccounts(rows);
        const firstRoot = rows.find((account) => !account.parent_ib_login) || rows[0];
        if (firstRoot && !rootLogin) setRootLogin(String(firstRoot.login));
      })
      .catch((err) => {
        if (alive) setError(err.message || 'Failed to load IB accounts.');
      })
      .finally(() => {
        if (alive) setLoadingAccounts(false);
      });
    return () => { alive = false; };
  }, [rootLogin]);

  const rootOptions = useMemo(() => accounts.filter((account) => account.status !== 'removed'), [accounts]);

  const loadTree = useCallback(async () => {
    if (!rootLogin) {
      setError('Root IB login is required.');
      return;
    }
    setLoadingTree(true);
    setError('');
    setTree(null);
    setSelected(null);
    try {
      const response = await ibApi.tree(rootLogin);
      setTree(normalizeIBTreeNode(normalizeObject(response, ['tree']) || response));
    } catch (err) {
      setError(err.message || 'Failed to load IB tree.');
    } finally {
      setLoadingTree(false);
    }
  }, [rootLogin]);

  return (
    <div className="ib-tree-page p-6 w-full h-full flex flex-col gap-4 overflow-y-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <GitBranch size={18} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 className="ib-tree-title text-[12px] font-semibold" style={{ color: 'var(--text)' }}>IB Tree</h1>
            <p className="ib-tree-subtitle text-[10px]" style={{ color: 'var(--text-3)' }}>Recursive broker-scoped IB hierarchy.</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="ib-tree-error flex items-center gap-2 p-3 rounded text-[10px]" style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)' }}>
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      <div className="ib-tree-controls flex flex-wrap items-center gap-2">
        <div className="ib-tree-search relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
          <input
            type="number"
            list="ib-tree-roots"
            placeholder="Root IB login"
            value={rootLogin}
            onChange={(event) => setRootLogin(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && loadTree()}
            className="ui-input ui-input-sm"
            style={{ paddingLeft: 32, width: 190 }}
          />
          <datalist id="ib-tree-roots">
            {rootOptions.map((account) => (
              <option key={account.login} value={account.login}>{account.company_name || account.referral_code}</option>
            ))}
          </datalist>
        </div>
        <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={loadTree} disabled={loadingTree || loadingAccounts || !rootLogin}>
          {loadingTree ? <Loader size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Load Tree
        </button>
      </div>

      <div className="ib-tree-content flex gap-4 flex-1 overflow-hidden">
        <div className="ib-tree-canvas ui-card flex-1 p-3 overflow-y-auto">
          {!tree && !loadingTree && (
            <div className="ib-tree-empty text-[10px] text-center py-12" style={{ color: 'var(--muted)' }}>Select a root IB login and load the tree.</div>
          )}
          {loadingTree && (
            <div className="flex justify-center py-12"><Loader size={20} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
          )}
          {tree && <IBNode node={tree} onSelect={setSelected} />}
        </div>

        {selected && (
          <div className="ib-tree-selected ui-card p-4 flex flex-col gap-3" style={{ width: 260, flexShrink: 0 }}>
            <div className="ib-tree-selected-title text-[12px] font-semibold" style={{ color: 'var(--text)' }}>Selected IB</div>
            <div className="ib-tree-selected-details grid grid-cols-1 gap-2 text-[12px]">
              <span><strong>Login:</strong> <span className="tabular">{selected.login}</span></span>
              <span><strong>Company:</strong> {selected.company_name || '-'}</span>
              <span><strong>Level:</strong> {selected.level}</span>
              <span><strong>Status:</strong> <StatusBadge status={selected.status} /></span>
              <span><strong>Clients:</strong> {selected.client_count}</span>
              <span><strong>Children:</strong> {selected.children?.length || 0}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default IBTreePage;
