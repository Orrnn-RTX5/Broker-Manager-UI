import React, { useEffect, useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, X, AlertCircle } from 'lucide-react';
import SymbolSelector from './SymbolSelector';
import GroupPermissionNotice from './GroupPermissionNotice';
import './NewGroupModal.css';
import { usePermissions } from '../../../hooks/usePermissions';
import { PERMISSIONS } from '../../../utils/permissions';
import { useGroupList } from '../../../hooks/useGroupList';
import { EXECUTION_MODE_OPTIONS, GROUP_PURPOSE_OPTIONS, GROUP_ALLOWED_FIELDS, GROUP_DEFAULT_PAYLOAD as defaultPayload, bookTypeForRoutingMode, buildNewGroupPayload, pickGroupPayloadFields as pickAllowedFields, resolveNewGroupTradeAllowed, submitGroup, validateNewGroupFields } from '../groupPayload.js';
import { readLeverageRatio } from '../groupAccountRows.js';
import {
  LEVERAGE_PRESETS,
  MARGIN_CALL_PRESETS,
  NEW_GROUP_FINANCIAL_DEFAULTS,
  SPREAD_MARKUP_PRESETS,
  STOP_OUT_PRESETS,
  isPresetValue,
} from '../groupFinancialPresets.js';

const InputGroup = ({ label, type = 'text', value, onChange }) => (
  <label className="group-create-field">
    <span>{label}</span>
    <input
      type={type === 'number' ? 'text' : type}
      inputMode={type === 'number' ? 'decimal' : undefined}
      value={type === 'number' && value === 0 ? '' : value}
      onChange={(e) => {
        const val = e.target.value;
        if (type === 'number') onChange(val === '' ? 0 : Number(val));
        else onChange(val);
      }}
      className="group-create-control"
    />
  </label>
);

const CheckField = ({ label, checked, onChange }) => (
  <label className="group-create-check">
    <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
    <span>{label}</span>
  </label>
);

const GroupChoice = ({ label, value, options, onChange, placeholder = 'Select' }) => {
  const labelId = useId();
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState(null);
  const selected = options.find((option) => String(option.value) === String(value));

  const placeMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuHeight = Math.min(options.length * 26 + 8, 188);
    const below = window.innerHeight - rect.bottom;
    const upward = below < menuHeight + 8 && rect.top > below;
    setBox({
      left: rect.left,
      width: rect.width,
      top: upward ? Math.max(8, rect.top - menuHeight - 4) : rect.bottom + 4,
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    const closeFromOutside = (event) => {
      if (buttonRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const closeFromScroll = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('mousedown', closeFromOutside);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', closeFromScroll, true);
    window.addEventListener('resize', closeFromScroll);
    return () => {
      document.removeEventListener('mousedown', closeFromOutside);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', closeFromScroll, true);
      window.removeEventListener('resize', closeFromScroll);
    };
  }, [open]);

  const choose = (option) => {
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div className="group-create-field">
      <span id={labelId}>{label}</span>
      <button
        ref={buttonRef}
        type="button"
        className={`group-create-control group-create-choice${selected ? '' : ' is-empty'}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelId}
        onClick={() => {
          if (open) setOpen(false);
          else { placeMenu(); setOpen(true); }
        }}
      >
        <span>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && box && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-labelledby={labelId}
          className="group-create-menu"
          style={{ top: box.top, left: box.left, width: box.width }}
        >
          {options.map((option) => {
            const isSelected = String(option.value) === String(value);
            return (
              <button
                type="button"
                key={String(option.value)}
                role="option"
                aria-selected={isSelected}
                className={isSelected ? 'is-selected' : ''}
                onClick={() => choose(option)}
              >
                <span>{option.label}</span>
                {isSelected ? <Check size={12} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
};

const CUSTOM_OPTION = '__custom__';

// Dropdown of standard values with a "Custom…" entry that reveals a free input.
const PresetSelect = ({ label, value, presets, onChange, placeholder, customPlaceholder }) => {
  const isPreset = isPresetValue(presets, value);
  const [customOpen, setCustomOpen] = useState(() => !isPreset && Number(value) > 0);
  // The typed text is kept as-is so partial decimals like "0." survive while typing.
  const [draft, setDraft] = useState(() => (Number(value) > 0 ? String(value) : ''));
  const showCustom = customOpen || (!isPreset && Number(value) > 0);
  const selectValue = showCustom ? CUSTOM_OPTION : isPreset ? String(Number(value)) : '';

  return (
    <div className="group-create-preset">
      <GroupChoice
        label={label}
        value={selectValue}
        placeholder={placeholder}
        options={[
          ...presets.map((preset) => ({ value: String(preset.value), label: preset.label })),
          { value: CUSTOM_OPTION, label: 'Custom...' },
        ]}
        onChange={(next) => {
          if (next === CUSTOM_OPTION) {
            setCustomOpen(true);
            setDraft(Number(value) > 0 ? String(value) : '');
            return;
          }
          setCustomOpen(false);
          onChange(Number(next));
        }}
      />
      {showCustom && (
        <input
          type="text"
          inputMode="decimal"
          autoFocus={customOpen}
          aria-label={`${label} (custom)`}
          placeholder={customPlaceholder}
          value={draft}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (!/^\d*\.?\d*$/.test(raw)) return;
            setDraft(raw);
            onChange(raw === '' || raw === '.' ? 0 : Number(raw));
          }}
          className="group-create-control"
        />
      )}
    </div>
  );
};

const NewGroupModal = ({ initialData, duplicateData, presetName, onClose, onSuccess }) => {
  const queryClient = useQueryClient();
  const { canAct } = usePermissions();
  const canManageGroups = canAct(PERMISSIONS.MANAGE_GROUPS);
  const isEditing = Boolean(initialData);
  const [formData, setFormData] = useState(() => {
    const source = initialData || duplicateData;
    const data = { ...defaultPayload, ...(source ? {} : NEW_GROUP_FINANCIAL_DEFAULTS), ...(source || {}) };
    if (source) data.leverage = readLeverageRatio(source) ?? data.leverage;
    if (duplicateData) data.name = `${duplicateData.name || 'New Group'} Copy`;
    // "Add group" inside a folder pre-fills the folder path, e.g. `PREP\demo\`.
    if (!source && presetName) data.name = presetName;
    // New groups trade by default; edits and duplicates keep their source value.
    if (!source) data.tradeAllowed = true;
    // The visible Book choice is routingMode; bookType is its backend-canonical
    // value (b/a/hybrid), never a display label.
    if (!source && data.routingMode) {
      const canonical = bookTypeForRoutingMode(data.routingMode);
      if (canonical) data.bookType = canonical;
    }
    if (source && data.routingMode) {
      const canonical = bookTypeForRoutingMode(data.routingMode);
      if (canonical) data.bookType = canonical;
    }
    if (Array.isArray(data.symbolsAllowed)) data.symbolsAllowed = data.symbolsAllowed.join(', ');
    if (Array.isArray(data.symbolsBlocked)) data.symbolsBlocked = data.symbolsBlocked.join(', ');
    return data;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Duplicate/edit sources keep their value and count as touched, so parent
  // inheritance never overwrites them; an explicit check/uncheck always wins.
  const tradeTouched = useRef(Boolean(initialData || duplicateData));
  // Same ref pattern for leverage: the display default (100) is shown but an
  // untouched leverage is omitted on create so backend tenant/env/parent
  // derivation governs; edit/duplicate sources count as touched and any
  // explicit operator pick (including a re-typed 100) is always sent.
  const leverageTouched = useRef(Boolean(initialData || duplicateData));
  const parentSearch = String(formData.parentGroup ?? '').trim();
  const { groups: parentGroups, loading: parentLoading } = useGroupList({
    limit: 100,
    offset: 0,
    search: parentSearch,
    sort_by: 'name',
    sort_dir: 'asc',
    enabled: parentSearch !== '',
  });

  // While tradeAllowed is untouched, default the checkbox from the exact
  // (case-insensitive) parent match; with no parent or no exact match the
  // global default true applies.
  useEffect(() => {
    if (tradeTouched.current) return;
    if (parentLoading) return;
    const next = resolveNewGroupTradeAllowed({
      groups: parentGroups,
      parentGroup: parentSearch,
      tradeTouched: false,
      currentValue: true,
    });
    setFormData((prev) => (prev.tradeAllowed === next ? prev : { ...prev, tradeAllowed: next }));
  }, [parentGroups, parentLoading, parentSearch]);

  const handleChange = (key, val) => {
    if (key === 'tradeAllowed') tradeTouched.current = true;
    if (key === 'leverage') leverageTouched.current = true;
    setFormData(prev => {
      const next = { ...prev, [key]: val };
      // Sync backend-canonical bookType with the visible routingMode choice.
      if (key === 'routingMode') {
        const canonical = bookTypeForRoutingMode(val);
        if (canonical) next.bookType = canonical;
      }
      return next;
    });
  };

  const handleArrayChange = (key, csvString) => {
    setFormData(prev => ({ ...prev, [key]: csvString }));
  };

  const handleSubmit = async () => {
    if (!canManageGroups) {
      setPermissionDenied(true);
      return;
    }

    const fieldError = validateNewGroupFields({
      name: formData.name,
      parentGroup: formData.parentGroup,
      groupPurpose: formData.groupPurpose,
    });
    if (fieldError) {
      setError(fieldError);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const payload = isEditing
        ? pickAllowedFields(formData, GROUP_ALLOWED_FIELDS)
        : buildNewGroupPayload(formData, { leverageTouched: leverageTouched.current });
      if (typeof payload.symbolsAllowed === 'string') {
        payload.symbolsAllowed = payload.symbolsAllowed.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (typeof payload.symbolsBlocked === 'string') {
        payload.symbolsBlocked = payload.symbolsBlocked.split(',').map(s => s.trim()).filter(Boolean);
      }

      // Update writes the group's leverage, margin, and name onto each account in the group.
      const saved = await submitGroup({
        originalName: isEditing ? String(initialData.name) : '',
        payload,
        queryClient,
      });

      if (onSuccess) onSuccess(saved);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const title = isEditing ? `Edit group: ${initialData.name}` : duplicateData ? `Duplicate group: ${duplicateData.name}` : 'Create group';

  return (
    <div className="ui-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="ui-modal group-create" role="dialog" aria-modal="true" aria-labelledby="group-create-title" onSubmit={(event) => { event.preventDefault(); handleSubmit(); }}>
        <div className="ui-modal-header group-create-header">
          <div className="group-create-heading">
            <span id="group-create-title" className="group-create-title">{title}</span>
            <span className="group-create-subtitle">Book, margin, commission, and the symbols this group can trade.</span>
          </div>
          <button type="button" className="group-create-close" aria-label="Close" onClick={onClose}><X size={14} /></button>
        </div>

        <div className="group-create-body">
          {error && (
            <div className="group-create-error" role="alert">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <section className="group-create-panel">
            <h3>General</h3>
            <InputGroup label="Group name" value={formData.name} onChange={(v) => handleChange('name', v)} />
            <InputGroup label="Description" value={formData.description} onChange={(v) => handleChange('description', v)} />
            <div className="group-create-grid">
              <InputGroup label="Currency" value={formData.currency} onChange={(v) => handleChange('currency', v)} />
              <InputGroup label="Account type" value={formData.accountType} onChange={(v) => handleChange('accountType', v)} />
            </div>
            <div className="group-create-grid">
              <InputGroup label="Parent group (optional)" value={formData.parentGroup || ''} onChange={(v) => handleChange('parentGroup', v)} />
              <GroupChoice
                label="Purpose"
                value={formData.groupPurpose || ''}
                placeholder="Select"
                options={GROUP_PURPOSE_OPTIONS}
                onChange={(v) => handleChange('groupPurpose', v)}
              />
            </div>
            <p className="group-create-note">Leave currency, execution, parent, or purpose blank to use backend derivation. A blank currency is omitted, never hardcoded.</p>
            <div className="group-create-checks">
              <CheckField label="Demo group" checked={formData.demo} onChange={(v) => handleChange('demo', v)} />
              <CheckField label="Trade allowed" checked={formData.tradeAllowed} onChange={(v) => handleChange('tradeAllowed', v)} />
              <CheckField label="Negative balance protection" checked={formData.negativeBalanceProtection} onChange={(v) => handleChange('negativeBalanceProtection', v)} />
            </div>
          </section>

          <section className="group-create-panel">
            <h3>Financial</h3>
            <div className="group-create-grid">
              <PresetSelect label="Leverage" value={formData.leverage} presets={LEVERAGE_PRESETS} onChange={(v) => handleChange('leverage', v)} placeholder="Select leverage" customPlaceholder="Ratio, e.g. 150 for 1:150" />
              <PresetSelect label="Margin call (%)" value={formData.marginCallLevel} presets={MARGIN_CALL_PRESETS} onChange={(v) => handleChange('marginCallLevel', v)} placeholder="Select level" customPlaceholder="Percent, e.g. 90" />
              <PresetSelect label="Stop out (%)" value={formData.stopOutLevel} presets={STOP_OUT_PRESETS} onChange={(v) => handleChange('stopOutLevel', v)} placeholder="Select level" customPlaceholder="Percent, e.g. 45" />
              <PresetSelect label="Spread markup" value={formData.spreadMarkup} presets={SPREAD_MARKUP_PRESETS} onChange={(v) => handleChange('spreadMarkup', v)} placeholder="Select markup" customPlaceholder="Points, e.g. 7" />
            </div>
            {Number(formData.stopOutLevel) > Number(formData.marginCallLevel) && Number(formData.marginCallLevel) > 0 && (
              <p className="group-create-note">Stop out is above the margin call. It is normally lower.</p>
            )}
          </section>

          <section className="group-create-panel">
            <h3>Execution and commission</h3>
            <div className="group-create-grid">
              <GroupChoice
                label="Execution mode"
                value={formData.executionMode || ''}
                placeholder="Select"
                options={EXECUTION_MODE_OPTIONS.some((option) => option.value === formData.executionMode)
                  ? EXECUTION_MODE_OPTIONS
                  : formData.executionMode
                    ? [{ value: formData.executionMode, label: String(formData.executionMode) }, ...EXECUTION_MODE_OPTIONS]
                    : EXECUTION_MODE_OPTIONS}
                onChange={(v) => handleChange('executionMode', v)}
              />
              <GroupChoice
                label="Book"
                value={formData.routingMode}
                options={[
                  { value: 'b_book', label: 'B-Book' },
                  { value: 'a_book', label: 'A-Book' },
                  { value: 'hybrid', label: 'Hybrid' },
                ]}
                onChange={(v) => handleChange('routingMode', v)}
              />
              <InputGroup label="Commission rate" type="number" value={formData.commissionRate} onChange={(v) => handleChange('commissionRate', v)} />
              <InputGroup label="Commission type" value={formData.commissionType} onChange={(v) => handleChange('commissionType', v)} />
              <InputGroup label="Max lot per trade" type="number" value={formData.maxLotPerTrade} onChange={(v) => handleChange('maxLotPerTrade', v)} />
              <InputGroup label="Max total lots" type="number" value={formData.maxTotalLots} onChange={(v) => handleChange('maxTotalLots', v)} />
              <InputGroup label="Lot divisor" type="number" value={formData.lotDivisor} onChange={(v) => handleChange('lotDivisor', v)} />
              <InputGroup label="Swap multiplier" type="number" value={formData.swapMultiplier} onChange={(v) => handleChange('swapMultiplier', v)} />
            </div>
          </section>

          <section className="group-create-panel">
            <h3>Symbols</h3>
            <SymbolSelector label="Allowed symbols" value={formData.symbolsAllowed} onChange={(v) => handleArrayChange('symbolsAllowed', v)} />
            <SymbolSelector label="Blocked symbols" value={formData.symbolsBlocked} onChange={(v) => handleArrayChange('symbolsBlocked', v)} />
          </section>
        </div>

        <div className="group-create-footer">
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={onClose}>Cancel</button>
          <button type="submit" className="ui-btn ui-btn-primary ui-btn-sm" disabled={loading}>
            {loading ? (isEditing ? 'Updating...' : 'Creating...') : (isEditing ? 'Update' : 'Create')}
          </button>
        </div>
      </form>
      {permissionDenied && <GroupPermissionNotice action={isEditing ? 'change' : 'create'} onClose={() => setPermissionDenied(false)} />}
    </div>
  );
};

export default NewGroupModal;
