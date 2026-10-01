import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, Pencil, Users, X } from 'lucide-react';
import { usePermissions } from '../../../hooks/usePermissions';
import { PERMISSIONS } from '../../../utils/permissions';
import { groupSymbolOverridesGet, groupSymbolOverridesSave } from '../../../services/api.js';
import { GROUP_DEFAULT_PAYLOAD, buildGroupSavePayload, submitGroup, toSymbolList } from '../groupPayload.js';
import { readLeverageRatio } from '../groupAccountRows.js';
import { NEW_GROUP_FINANCIAL_DEFAULTS } from '../groupFinancialPresets.js';
import { ROUTING_LABELS } from '../groupTree.js';
import {
  GROUP_SYMBOL_FILTERS,
  GROUP_SYMBOL_STATUS,
  applyStagedOverride,
  buildGroupSymbolOverrideChanges,
  filterGroupSymbolRows,
  isGroupSymbolEditable,
  normalizeGroupSymbolOverrides,
  summarizeGroupSymbols,
  toggleStagedOverride,
} from '../groupSymbolOverrides.js';
import AccountDetailsModal from '../../../components/Popups/AccountDetailsModal';
import GroupAccountsTab from './GroupAccountsTab';
import GroupPermissionNotice from './GroupPermissionNotice';
import NewGroupModal from './NewGroupModal';

// Mirrors the MT5 Manager "Group: <name>" window; it opens on the group's accounts.
const TABS = ['Accounts', 'Margin', 'Symbols', 'Commissions'];
const ROUTING_OPTIONS = Object.entries(ROUTING_LABELS).map(([value, label]) => ({ value, label }));
const numberValue = (value) => (value === '' || value === null || value === undefined ? '' : String(value));
const toNumber = (value) => (value === '' ? 0 : Number(value));

const GroupPropertiesModal = ({ group, onClose, onSaved }) => {
  const queryClient = useQueryClient();
  const { canAct } = usePermissions();
  const canManageGroups = canAct(PERMISSIONS.MANAGE_GROUPS);
  const [tab, setTab] = useState('Accounts');
  const [openAccount, setOpenAccount] = useState(null);
  const [initialForm, setInitialForm] = useState(() => ({
    ...GROUP_DEFAULT_PAYLOAD,
    ...(group?.isNew ? NEW_GROUP_FINANCIAL_DEFAULTS : {}),
    ...group,
    leverage: readLeverageRatio(group) || (group?.isNew ? NEW_GROUP_FINANCIAL_DEFAULTS.leverage : 0),
    name: String(group?.name ?? ''),
    symbolsAllowed: toSymbolList(group?.symbolsAllowed),
    symbolsBlocked: toSymbolList(group?.symbolsBlocked),
  }));
  const [form, setForm] = useState(initialForm);
  const [overridesView, setOverridesView] = useState(null);
  const [overridesLoading, setOverridesLoading] = useState(false);
  const [overridesError, setOverridesError] = useState('');
  const [stagedOverrides, setStagedOverrides] = useState(() => new Map());
  const [symbolQuery, setSymbolQuery] = useState('');
  const [symbolFilter, setSymbolFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [editing, setEditing] = useState(false);

  // While an account window is open on top, Escape belongs to it.
  useEffect(() => {
    if (openAccount) return undefined;
    const handleKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, openAccount]);

  const update = (key, value) => setForm((prev) => {
    const next = { ...prev, [key]: value };
    if (key === 'routingMode') next.bookType = ROUTING_LABELS[value] ?? prev.bookType;
    return next;
  });

  const symbolRows = useMemo(
    () => (overridesView ? overridesView.rows.map((row) => applyStagedOverride(row, stagedOverrides)) : []),
    [overridesView, stagedOverrides]
  );
  const visibleSymbolRows = useMemo(
    () => filterGroupSymbolRows(symbolRows, symbolQuery, symbolFilter),
    [symbolRows, symbolQuery, symbolFilter]
  );
  const symbolSummary = useMemo(() => summarizeGroupSymbols(symbolRows), [symbolRows]);

  const loadSymbolOverrides = useCallback(async () => {
    if (!group?.name || group?.isNew) return;
    setOverridesLoading(true);
    setOverridesError('');
    try {
      setOverridesView(normalizeGroupSymbolOverrides(await groupSymbolOverridesGet(group.name)));
      setStagedOverrides(new Map());
    } catch (err) {
      setOverridesError(err.message || 'Failed to load group symbols.');
    } finally {
      setOverridesLoading(false);
    }
  }, [group?.isNew, group?.name]);

  useEffect(() => {
    if (tab === 'Symbols' && !overridesView && !overridesLoading && !overridesError) loadSymbolOverrides();
  }, [loadSymbolOverrides, overridesError, overridesLoading, overridesView, tab]);

  const handleSave = async () => {
    if (!canManageGroups) { setPermissionDenied(true); return; }
    setSaving(true);
    setError(null);
    try {
      if (stagedOverrides.size > 0 && !group.isNew) {
        const savedOverrides = await groupSymbolOverridesSave(
          group.name,
          buildGroupSymbolOverrideChanges(stagedOverrides)
        );
        setOverridesView(normalizeGroupSymbolOverrides(savedOverrides));
        setStagedOverrides(new Map());
      }
      const payload = buildGroupSavePayload(initialForm, form, { isNew: group.isNew });
      const saved = await submitGroup({ originalName: group.isNew ? '' : group.name, payload, queryClient });
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
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
          <button type="button" className="groups-props-edit" onClick={() => { if (canManageGroups) setEditing(true); else setPermissionDenied(true); }}>
            <Pencil size={12} />
            Edit
          </button>
        </div>

        <div id="groups-props-panel" role="tabpanel" aria-labelledby={`groups-props-tab-${tab.toLowerCase()}`} className="ui-modal-body groups-props-body">
          {error && (
            <div className="groups-props-error" role="alert"><AlertCircle size={14} /><span>{error}</span></div>
          )}

          {tab === 'Accounts' && <GroupAccountsTab groupName={group?.name} groupLeverage={form.leverage} onOpenAccount={setOpenAccount} />}

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
              <div className="groups-props-intro"><Users size={40} className="groups-props-icon" /><span>Every symbol is shown here. Enable or disable trading for this group.</span></div>
              {!overridesView?.groupTrading && overridesView && (
                <div className="groups-symbols-notice is-danger">Trading is disabled for this group, so every symbol is currently off.</div>
              )}
              {overridesView?.legacyAllowList && (
                <div className="groups-symbols-notice">This group has a legacy allowed-symbol list of {overridesView.allowListCount} symbols. Symbols outside that list cannot be enabled here.</div>
              )}
              <div className="groups-symbols-toolbar">
                <input
                  type="search"
                  className="ui-input ui-input-sm"
                  placeholder="Search symbol or category"
                  aria-label="Search group symbols"
                  value={symbolQuery}
                  onChange={(event) => setSymbolQuery(event.target.value)}
                />
                <select className="ui-input ui-input-sm" aria-label="Filter group symbols" value={symbolFilter} onChange={(event) => setSymbolFilter(event.target.value)}>
                  {GROUP_SYMBOL_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              {overridesView && (
                <div className="groups-symbols-summary">
                  {symbolSummary.enabled} of {symbolSummary.total} symbols enabled · {symbolSummary.overrides} group override{symbolSummary.overrides === 1 ? '' : 's'}
                  {visibleSymbolRows.length !== symbolRows.length ? ` · showing ${visibleSymbolRows.length}` : ''}
                </div>
              )}
              <div className="groups-props-list groups-symbols-list">
                  <table className="ui-grid groups-props-grid" aria-label={`Symbols for ${form.name}`}>
                    <thead><tr><th scope="col">Symbol</th><th scope="col">Global</th><th scope="col">Group</th><th scope="col">Effective</th><th scope="col">Action</th></tr></thead>
                    <tbody>
                      {overridesLoading && <tr><td colSpan={5} className="groups-symbols-state"><Loader2 size={14} className="animate-spin" /> Loading every symbol…</td></tr>}
                      {!overridesLoading && overridesError && <tr><td colSpan={5} className="groups-symbols-state is-error">{overridesError} <button type="button" onClick={loadSymbolOverrides}>Retry</button></td></tr>}
                      {!overridesLoading && !overridesError && visibleSymbolRows.map((row) => {
                        const editable = isGroupSymbolEditable(row);
                        const status = GROUP_SYMBOL_STATUS[row.status];
                        return (
                          <tr key={row.symbol} className={row.staged ? 'groups-symbols-staged' : ''}>
                            <td title={row.category || undefined}><span>{row.symbol}</span>{row.category ? <small>{row.category}</small> : null}</td>
                            <td className={row.globalEnabled ? 'is-on' : 'is-off'}>{row.globalEnabled ? 'Enabled' : 'Disabled'}</td>
                            <td title={status.hint}>{status.label}{row.staged ? ' *' : ''}</td>
                            <td className={row.effective ? 'is-on' : 'is-off'}>{row.effective ? 'ON' : 'OFF'}</td>
                            <td>
                              <button
                                type="button"
                                className={`groups-symbol-toggle ${row.override === 'off' ? 'is-enable' : 'is-disable'}`}
                                disabled={!editable || !canManageGroups}
                                title={editable ? (row.override === 'off' ? `Enable ${row.symbol} for this group` : `Disable ${row.symbol} for this group`) : status.hint}
                                onClick={() => setStagedOverrides((current) => toggleStagedOverride(current, row))}
                              >
                                {row.override === 'off' ? 'Enable' : 'Disable'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {!overridesLoading && !overridesError && overridesView && visibleSymbolRows.length === 0 && <tr><td colSpan={5} className="groups-symbols-state">No symbols match.</td></tr>}
                    </tbody>
                  </table>
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
          <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={saving} onClick={handleSave}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : null}
            OK
          </button>
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
    {openAccount && <AccountDetailsModal account={openAccount} onClose={() => setOpenAccount(null)} />}
    {permissionDenied && <GroupPermissionNotice action="change" onClose={() => setPermissionDenied(false)} />}
    {editing && (
      <NewGroupModal
        initialData={group?.isNew ? undefined : form}
        presetName={group?.isNew ? form.name : undefined}
        onClose={() => setEditing(false)}
        onSuccess={(saved) => {
          const submitted = saved?.submitted;
          if (submitted && typeof submitted === 'object') {
            const nextForm = {
              ...form,
              ...submitted,
              leverage: readLeverageRatio(submitted) || form.leverage,
              name: submitted.name || form.name,
              symbolsAllowed: toSymbolList(submitted.symbolsAllowed ?? form.symbolsAllowed),
              symbolsBlocked: toSymbolList(submitted.symbolsBlocked ?? form.symbolsBlocked),
            };
            setForm(nextForm);
            setInitialForm(nextForm);
          }
          setEditing(false);
          onSaved?.(saved);
        }}
      />
    )}
    </>
  );
};

export default GroupPropertiesModal;
