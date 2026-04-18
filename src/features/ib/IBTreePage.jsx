import { useState } from 'react';
import { Search, GitBranch, ChevronRight, ChevronDown, User, AlertTriangle, Loader, RefreshCw } from 'lucide-react';
import { ibTree } from '../../services/api';

const STATUS_COLOR = {
  active:   'var(--ok-text)',
  approved: 'var(--info-text)',
  pending:  'var(--warn-text)',
  removed:  'var(--danger-text)',
};

const STATUS_BADGE = {
  active:   'ui-badge-success',
  approved: 'ui-badge-info',
  pending:  'ui-badge-warn',
  removed:  'ui-badge-danger',
};

/** Renders one node and its children (safe up to 2 levels, warns beyond) */
const IBNode = ({ node, depth = 0, onSelect }) => {
  const [expanded, setExpanded] = useState(depth === 0);
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const isTooDeep = depth >= 2;

  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer transition-colors"
        style={{ background: 'transparent' }}
        onMouseOver={e => e.currentTarget.style.background = 'var(--accent-soft)'}
        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
        onClick={() => { if (hasChildren) setExpanded(e => !e); onSelect?.(node); }}
      >
        <div className="w-4 flex items-center justify-center shrink-0">
          {hasChildren
            ? (expanded ? <ChevronDown size={13} style={{ color: 'var(--muted)' }} /> : <ChevronRight size={13} style={{ color: 'var(--muted)' }} />)
            : <span style={{ width: 13 }} />}
        </div>
        <User size={13} style={{ color: STATUS_COLOR[node.status] || 'var(--text-3)', shrink: 0 }} />
        <span className="tabular font-mono text-xs" style={{ color: 'var(--accent-text)' }}>{node.login}</span>
        {node.company_name && (
          <span className="text-xs" style={{ color: 'var(--text-2)' }}>{node.company_name}</span>
        )}
        <span className={`ui-badge text-[8px] px-1 ml-1 ${STATUS_BADGE[node.status] || 'ui-badge-neutral'}`}>
          {(node.status || '').toUpperCase()}
        </span>
        <span className="text-[10px] ml-1" style={{ color: 'var(--text-3)' }}>
          Lv.{node.level} · {node.client_count ?? 0} clients
        </span>
        {hasChildren && (
          <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
            ({node.children.length} sub-IB{node.children.length !== 1 ? 's' : ''})
          </span>
        )}
      </div>

      {hasChildren && expanded && (
        isTooDeep ? (
          <div className="ml-10 py-1 text-[10px] flex items-center gap-1" style={{ color: 'var(--warn-text)' }}>
            <AlertTriangle size={11} />
            Depth ≥3 not rendered (issue #8 — tree may be incomplete at this level).
          </div>
        ) : (
          node.children.map(child => (
            <IBNode key={child.login} node={child} depth={depth + 1} onSelect={onSelect} />
          ))
        )
      )}
    </div>
  );
};


const IBTreePage = () => {
  const [loginInput, setLoginInput] = useState('');
  const [tree, setTree]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);
  const [selected, setSelected] = useState(null);

  const handleLoad = async () => {
    if (!loginInput) return;
    setLoading(true);
    setError(null);
    setTree(null);
    setSelected(null);
    try {
      const data = await ibTree(loginInput);
      setTree(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 w-full h-full flex flex-col gap-4 overflow-y-auto">
      <div className="flex items-end justify-between">
        <div className="flex items-center gap-2">
          <GitBranch size={18} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>IB Tree</h1>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              Recursive sub-IB hierarchy. Safe up to 2 levels (issue #8).
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
          <input
            type="number"
            placeholder="Root IB login…"
            value={loginInput}
            onChange={e => setLoginInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLoad()}
            className="ui-input ui-input-sm"
            style={{ paddingLeft: 32, width: 180 }}
          />
        </div>
        <button className="ui-btn ui-btn-primary ui-btn-sm flex items-center gap-1.5" onClick={handleLoad} disabled={loading || !loginInput}>
          {loading ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Load Tree
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded text-xs" style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)' }}>
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      <div className="flex gap-4 flex-1 overflow-hidden">
        {/* Tree panel */}
        <div className="ui-card flex-1 p-3 overflow-y-auto">
          {!tree && !loading && (
            <div className="text-xs text-center py-12" style={{ color: 'var(--muted)' }}>Enter a root IB login and click Load Tree.</div>
          )}
          {loading && (
            <div className="flex justify-center py-12"><Loader size={20} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
          )}
          {tree && <IBNode node={tree} depth={0} onSelect={setSelected} />}
        </div>

        {/* Selected node info panel */}
        {selected && (
          <div className="ui-card p-4 flex flex-col gap-3" style={{ width: 240, flexShrink: 0 }}>
            <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Selected</div>
            {[
              ['Login',    selected.login],
              ['Company',  selected.company_name],
              ['Level',    selected.level],
              ['Status',   <span key="s" className={`ui-badge text-[9px] ${STATUS_BADGE[selected.status] || 'ui-badge-neutral'}`}>{selected.status}</span>],
              ['Clients',  selected.client_count],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col gap-0.5">
                <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>{label}</span>
                <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>{value ?? '—'}</span>
              </div>
            ))}
            {Array.isArray(selected.children) && selected.children.length > 0 && (
              <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                {selected.children.length} direct sub-IB{selected.children.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default IBTreePage;
