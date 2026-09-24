import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Plus, Trash2, Users, X } from 'lucide-react';
import { usePermissions } from '../../../hooks/usePermissions';
import { PERMISSIONS } from '../../../utils/permissions';
import { GROUP_DEFAULT_PAYLOAD, pickGroupPayloadFields, submitGroup, toSymbolList } from '../groupPayload.js';
import { ROUTING_LABELS } from '../groupTree.js';

// Mirrors the MT5 Manager "Group: <name>" window: Margin / Symbols / Commissions tabs.
const TABS = ['Margin', 'Symbols', 'Commissions'];
const ROUTING_OPTIONS = Object.entries(ROUTING_LABELS).map(([value, label]) => ({ value, label }));
const NO_PERMISSION = 'Your role does not have permission to manage groups.';

const numberValue = (value) => (value === '' || value === null || value === undefined ? '' : String(value));
const toNumber = (value) => (value === '' ? 0 : Number(value));

const GroupPropertiesModal = ({ group, onClose, onSaved }) => {
  const { canAct } = usePermissions();
  const canManageGroups = canAct(PERMISSIONS.MANAGE_GROUPS);
  const [tab, setTab] = useState('Margin');
  const [form, setForm] = useState(() => ({
    ...GROUP_DEFAULT_PAYLOAD,
    ...group,
    name: String(group?.name ?? ''),
    symbolsAllowed: toSymbolList(group?.symbolsAllowed),
    symbolsBlocked: toSymbolList(group?.symbolsBlocked),
  }));
  const [symbolDraft, setSymbolDraft] = useState({ symbol: '', access: 'allowed' });
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const update = (key, value) => setForm((prev) => {
    const next = { ...prev, [key]: value };
    if (key === 'routingMode') next.bookType = ROUTING_LABELS[value] ?? prev.bookType;
    return next;
  });

  const symbolRows = [
    ...form.symbolsAllowed.map((symbol) => ({ symbol, access: 'allowed' })),
    ...form.symbolsBlocked.map((symbol) => ({ symbol, access: 'blocked' })),
  ];
  const listKey = (access) => (access === 'blocked' ? 'symbolsBlocked' : 'symbolsAllowed');

  const addSymbol = (event) => {
    event.preventDefault();
    const symbol = symbolDraft.symbol.trim();
    if (!symbol) return;
    const key = listKey(symbolDraft.access);
    setForm((prev) => (prev[key].includes(symbol) ? prev : { ...prev, [key]: [...prev[key], symbol] }));
    setSelectedSymbol({ symbol, access: symbolDraft.access });
    setSymbolDraft((draft) => ({ ...draft, symbol: '' }));
  };

  const removeSelectedSymbol = () => {
    if (!selectedSymbol) return;
    const key = listKey(selectedSymbol.access);
    setForm((prev) => ({ ...prev, [key]: prev[key].filter((symbol) => symbol !== selectedSymbol.symbol) }));
    setSelectedSymbol(null);
  };

  const handleSave = async () => {
    if (!canManageGroups) { setError(NO_PERMISSION); return; }
    setSaving(true);
    setError(null);
    try {
      await submitGroup({ originalName: group.name, payload: pickGroupPayloadFields(form) });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const isSelected = (row) => selectedSymbol?.symbol === row.symbol && selectedSymbol?.access === row.access;

  return (
    <div className="ui-modal-backdrop groups-props-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="ui-modal groups-props" role="dialog" aria-modal="true" aria-labelledby="groups-props-title">
        <div className="ui-modal-header groups-props-header">
          <span id="groups-props-title">Group: {form.name}</span>
          <button type="button" className="x" aria-label="Close group properties" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="groups-props-tabs" role="tablist" aria-label="Group property sections">
          {TABS.map((item) => (
            <button
              type="button"
              key={item}
              role="tab"
              id={`groups-props-tab-${item.toLowerCase()}`}
              aria-selected={tab === item}
              aria-controls="groups-props-panel"
              className={`groups-props-tab${tab === item ? ' is-active' : ''}`}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div id="groups-props-panel" role="tabpanel" aria-labelledby={`groups-props-tab-${tab.toLowerCase()}`} className="ui-modal-body groups-props-body">
          {error && (
            <div className="groups-props-error" role="alert"><AlertCircle size={14} /><span>{error}</span></div>
          )}

          {tab === 'Margin' && (
            <div className="groups-props-page">
              <div className="groups-props-intro"><Users size={40} className="groups-props-icon" /><span>Please set up margin requirements.</span></div>
              <div className="groups-props-form">
                <label className="groups-props-row">
                  <span>Risk management:</span>
                  <select className="ui-input ui-input-sm" value={form.routingMode || 'b_book'} onChange={(event) => update('routingMode', event.target.value)}>
                    {ROUTING_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <div className="groups-props-row groups-props-levels">
                  <span>Margin call level:</span>
                  <div className="groups-props-inline">
                    <input className="ui-input ui-input-sm groups-props-number" type="number" min="0" step="1" aria-label="Margin call level" value={numberValue(form.marginCallLevel)} onChange={(event) => update('marginCallLevel', toNumber(event.target.value))} />
                    <span>Stop out level:</span>
                    <input className="ui-input ui-input-sm groups-props-number" type="number" min="0" step="1" aria-label="Stop out level" value={numberValue(form.stopOutLevel)} onChange={(event) => update('stopOutLevel', toNumber(event.target.value))} />
                    <span>in</span>
                    <select className="ui-input ui-input-sm groups-props-unit" aria-label="Level unit" value="percent" readOnly disabled>
                      <option value="percent">%, percent</option>
                    </select>
                  </div>
                </div>
                <label className="groups-props-check">
                  <input type="checkbox" checked={Boolean(form.negativeBalanceProtection)} onChange={(event) => update('negativeBalanceProtection', event.target.checked)} />
                  <span>Compensate negative balance after stop out</span>
                </label>
                <label className="groups-props-check is-disabled" title="Not supported by this server">
                  <input type="checkbox" disabled checked={false} readOnly />
                  <span>Withdraw credit after negative balance compensation</span>
                </label>
                <label className="groups-props-row">
                  <span>Leverage:</span>
                  <div className="groups-props-inline">
                    <span className="groups-props-prefix">1 :</span>
                    <input className="ui-input ui-input-sm groups-props-number" type="number" min="0" step="1" aria-label="Leverage" value={numberValue(form.leverage)} onChange={(event) => update('leverage', toNumber(event.target.value))} />
                  </div>
                </label>
              </div>
            </div>
          )}

          {tab === 'Symbols' && (
            <div className="groups-props-page">
              <div className="groups-props-intro"><Users size={40} className="groups-props-icon" /><span>Please set up individual parameters of symbols trade for the group.</span></div>
              <div className="groups-props-list-layout">
                <div className="groups-props-side">
                  <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={!selectedSymbol} onClick={removeSelectedSymbol}><Trash2 size={12} /> Delete</button>
                </div>
                <div className="groups-props-list">
                  <table className="ui-grid groups-props-grid" aria-label="Group symbols">
                    <thead><tr><th scope="col">Symbol</th><th scope="col">Access</th></tr></thead>
                    <tbody>
                      {symbolRows.map((row) => (
                        <tr
                          key={`${row.access}:${row.symbol}`}
                          className={isSelected(row) ? 'is-selected' : ''}
                          aria-selected={isSelected(row)}
                          onClick={() => setSelectedSymbol(row)}
                        >
                          <td>{row.symbol}</td>
                          <td>{row.access === 'blocked' ? 'Blocked' : 'Allowed'}</td>
                        </tr>
                      ))}
                      <tr className="groups-props-add-row">
                        <td colSpan={2}>
                          <form className="groups-props-inline" onSubmit={addSymbol}>
                            <Plus size={12} />
                            <input className="ui-input ui-input-sm" placeholder="click to add..." aria-label="Symbol to add" value={symbolDraft.symbol} onChange={(event) => setSymbolDraft((draft) => ({ ...draft, symbol: event.target.value }))} />
                            <select className="ui-input ui-input-sm" aria-label="Symbol access" value={symbolDraft.access} onChange={(event) => setSymbolDraft((draft) => ({ ...draft, access: event.target.value }))}>
                              <option value="allowed">Allowed</option>
                              <option value="blocked">Blocked</option>
                            </select>
                            <button type="submit" className="ui-btn ui-btn-secondary ui-btn-xs" disabled={!symbolDraft.symbol.trim()}>Add</button>
                          </form>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  {symbolRows.length === 0 && <p className="groups-props-empty">No symbol rules yet: every symbol is available to this group.</p>}
                </div>
              </div>
            </div>
          )}

          {tab === 'Commissions' && (
            <div className="groups-props-page">
              <div className="groups-props-intro"><Users size={40} className="groups-props-icon" /><span>Please set up commissions for accounts in the group.</span></div>
              <div className="groups-props-list">
                <table className="ui-grid groups-props-grid" aria-label="Group commissions">
                  <thead><tr><th scope="col">Name</th><th scope="col">Symbol</th><th scope="col">Type</th><th scope="col" style={{ textAlign: 'right' }}>Charge</th></tr></thead>
                  <tbody>
                    <tr className="is-selected">
                      <td>Standard commission</td>
                      <td>*</td>
                      <td>{form.commissionType || <span className="groups-cell-empty">—</span>}</td>
                      <td style={{ textAlign: 'right' }}>{numberValue(form.commissionRate) || '0'}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="groups-props-form groups-props-commission">
                  <label className="groups-props-row">
                    <span>Commission type:</span>
                    <input className="ui-input ui-input-sm" value={form.commissionType || ''} placeholder="e.g. per lot" onChange={(event) => update('commissionType', event.target.value)} />
                  </label>
                  <label className="groups-props-row">
                    <span>Commission rate:</span>
                    <input className="ui-input ui-input-sm groups-props-number" type="number" step="any" value={numberValue(form.commissionRate)} onChange={(event) => update('commissionRate', toNumber(event.target.value))} />
                  </label>
                  <label className="groups-props-row">
                    <span>Spread markup:</span>
                    <input className="ui-input ui-input-sm groups-props-number" type="number" step="any" value={numberValue(form.spreadMarkup)} onChange={(event) => update('spreadMarkup', toNumber(event.target.value))} />
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="ui-modal-footer">
          <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={saving || !canManageGroups} title={canManageGroups ? undefined : NO_PERMISSION} onClick={handleSave}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : null}
            OK
          </button>
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default GroupPropertiesModal;
