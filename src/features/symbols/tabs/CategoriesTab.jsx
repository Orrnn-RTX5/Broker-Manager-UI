import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Loader2, ChevronRight, ChevronDown, FolderOpen, Folder, X } from 'lucide-react';
import { symbolCategoryList, symbolCategoryCreate, symbolCategoryUpdate, symbolCategoryDelete } from '../../../services/api';

// ─── Category Form Modal ───────────────────────────────────────────────────────
const CategoryFormModal = ({ category: existing, allCategories, onClose, onSuccess }) => {
  const isEdit = !!existing;
  const [form, setForm] = useState({
    name: existing?.name || '',
    parentId: existing?.parentId || '',
    path: existing?.path || '',
    description: existing?.description || '',
    enabled: existing?.enabled ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      if (isEdit) {
        await symbolCategoryUpdate({ id: existing.id, name: form.name, path: form.path, description: form.description, enabled: form.enabled });
      } else {
        await symbolCategoryCreate({ name: form.name, parentId: form.parentId || undefined, path: form.path, description: form.description });
      }
      onSuccess();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const parents = allCategories.filter(c => !existing || c.id !== existing.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="ui-card w-full max-w-sm p-6 flex flex-col gap-4" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>{isEdit ? 'Edit Category' : 'New Category'}</h2>
          <button onClick={onClose} className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm"><X size={14} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Name *</label>
            <input className="ui-input ui-input-sm" value={form.name} onChange={e => set('name', e.target.value)} required />
          </div>
          {!isEdit && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Parent Category</label>
              <select className="ui-input ui-input-sm" value={form.parentId} onChange={e => set('parentId', e.target.value)}>
                <option value="">— top level —</option>
                {parents.map(c => <option key={c.id || c.name} value={c.id || c.name}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Path</label>
            <input className="ui-input ui-input-sm" value={form.path} onChange={e => set('path', e.target.value)} placeholder="e.g. Forex/Majors" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Description</label>
            <input className="ui-input ui-input-sm" value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          {isEdit && (
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-2)' }}>
              <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} />
              Enabled
            </label>
          )}
          {err && <p className="text-xs" style={{ color: 'var(--danger)' }}>{err}</p>}
          <div className="flex justify-end gap-2 mt-1">
            <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary ui-btn-sm">Cancel</button>
            <button type="submit" disabled={saving} className="ui-btn ui-btn-primary ui-btn-sm">
              {saving ? <Loader2 size={13} className="animate-spin" /> : (isEdit ? 'Save' : 'Create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Tree Node ─────────────────────────────────────────────────────────────────
const CategoryTreeNode = ({ cat, allCategories, depth = 0, onEdit, onDelete }) => {
  const [expanded, setExpanded] = useState(depth === 0);
  const children = allCategories.filter(c => c.parentId === (cat.id || cat.name));

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1.5 px-2 rounded transition-colors group"
        style={{ paddingLeft: 8 + depth * 20 }}
        onMouseOver={e => e.currentTarget.style.background = 'var(--accent-soft)'}
        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
      >
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-4 h-4 flex items-center justify-center shrink-0"
          style={{ color: 'var(--muted)', visibility: children.length > 0 ? 'visible' : 'hidden' }}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        {children.length > 0
          ? <FolderOpen size={14} className="text-yellow-500 shrink-0" />
          : <Folder size={14} className="shrink-0" style={{ color: 'var(--muted)' }} />
        }
        <span className="text-[13px] flex-1" style={{ color: 'var(--text)' }}>{cat.name}</span>
        {cat.path && <span className="text-[11px] mr-2" style={{ color: 'var(--muted)' }}>{cat.path}</span>}
        <span className={`ui-badge text-[10px] mr-2 ${cat.enabled !== false ? 'ui-badge-success' : 'ui-badge-danger'}`}>
          {cat.enabled !== false ? 'on' : 'off'}
        </span>
        <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
          <button onClick={() => onEdit(cat)} className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm" title="Edit"><Edit2 size={12} /></button>
          <button onClick={() => onDelete(cat)} className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm" style={{ color: 'var(--danger)' }} title="Delete"><Trash2 size={12} /></button>
        </div>
      </div>
      {expanded && children.map(child => (
        <CategoryTreeNode key={child.id || child.name} cat={child} allCategories={allCategories} depth={depth + 1} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  );
};

// ─── Main Tab ──────────────────────────────────────────────────────────────────
const CategoriesTab = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'add' | 'edit'
  const [editTarget, setEditTarget] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await symbolCategoryList();
      setCategories(Array.isArray(data) ? data : []);
    } catch (e) {
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (cat) => {
    if (!window.confirm(`Delete category "${cat.name}"? This will fail if symbols are still assigned to it.`)) return;
    setDeleting(cat.name);
    try {
      await symbolCategoryDelete(cat.name);
      load();
    } catch (e) {
      alert('Delete failed: ' + e.message);
    } finally {
      setDeleting(null);
    }
  };

  const roots = categories.filter(c => !c.parentId);

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          {categories.length} categories total
        </p>
        <button onClick={() => { setEditTarget(null); setModal('add'); }} className="ui-btn ui-btn-primary ui-btn-sm">
          <Plus size={13} /> New Category
        </button>
      </div>

      <div className="ui-card flex-1 overflow-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-sm" style={{ color: 'var(--muted)' }}>
            <Loader2 size={16} className="animate-spin mr-2" /> Loading categories…
          </div>
        ) : roots.length === 0 ? (
          <p className="text-center py-10 text-sm" style={{ color: 'var(--muted)' }}>No categories configured.</p>
        ) : (
          roots.map(cat => (
            <CategoryTreeNode
              key={cat.id || cat.name}
              cat={cat}
              allCategories={categories}
              onEdit={c => { setEditTarget(c); setModal('edit'); }}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {(modal === 'add' || modal === 'edit') && (
        <CategoryFormModal
          category={editTarget}
          allCategories={categories}
          onClose={() => { setModal(null); setEditTarget(null); }}
          onSuccess={() => { setModal(null); setEditTarget(null); load(); }}
        />
      )}
    </div>
  );
};

export default CategoriesTab;
