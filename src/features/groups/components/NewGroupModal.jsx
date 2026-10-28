import React, { useEffect, useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, X, AlertCircle, Move } from 'lucide-react';
import SymbolSelector from './SymbolSelector';
import { ALLOW_ALL_SYMBOLS, emptyAllowedSymbolsError, isAllowAllSymbols, symbolKey } from '../groupSymbolAvailability.js';
import GroupPermissionNotice from './GroupPermissionNotice';
import './NewGroupModal.css';
import { usePermissions } from '../../../hooks/usePermissions';
import { PERMISSIONS } from '../../../utils/permissions';
import { useGroupList } from '../../../hooks/useGroupList';
import { EXECUTION_MODE_OPTIONS, GROUP_PURPOSE_OPTIONS, bookTypeForRoutingMode, buildGroupSavePayload, buildNewGroupPayload, resolveNewGroupTradeAllowed, submitGroup, validateNewGroupFields } from '../groupPayload.js';
import { buildNewGroupFormData } from '../newGroupForm.js';
import { fetchBrokerDefaultLeverage } from '../groupDefaults.js';
import { GROUP_LEVERAGE_NO_DEFAULT_HINT, isBlankLeverage, resolveCreateLeverage } from '../groupLeverage.js';
import {
  GROUP_LEVERAGE_INVALID,
  GROUP_POLICY_DEFAULT_INVALID,
  GROUP_POLICY_DEFAULT_MISSING,
  groupPolicyErrorField,
  mapGroupPolicyError,
} from '../groupPolicyErrors.js';
import {
  LEVERAGE_PRESETS,
  MARGIN_CALL_PRESETS,
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

// Per-field server error: the form-level alert pattern below (role=alert,
// AlertCircle + message) adapted to a single field. Fields stay optional in
// the UI — no required markers; the backend 400 path handles missing values
// and the raw policy code never renders.
const FieldError = ({ id, message }) => (
  <p id={id} className="group-create-error group-create-field-error" role="alert">
    <AlertCircle size={14} />
    <span>{message}</span>
  </p>
);

const CheckField = ({ label, checked, onChange, error = null }) => {
  const errorId = useId();
  return (
    <>
      <label className="group-create-check">
        <input
          type="checkbox"
          checked={Boolean(checked)}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <span>{label}</span>
      </label>
      {error ? <FieldError id={errorId} message={error} /> : null}
    </>
  );
};

const GroupChoice = ({ label, value, options, onChange, placeholder = 'Select', error = null }) => {
  const labelId = useId();
  const fieldErrorId = useId();
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
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? fieldErrorId : undefined}
        onClick={() => {
          if (open) setOpen(false);
          else { placeMenu(); setOpen(true); }
        }}
      >
        <span>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {error ? <FieldError id={fieldErrorId} message={error} /> : null}
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
// clearedValue is what a cleared custom box reports (leverage passes '' so a
// cleared box is never sent as 0).
const PresetSelect = ({ label, value, presets, onChange, placeholder, customPlaceholder, error = null, hint = null, clearedValue = 0 }) => {
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
        error={error}
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
            onChange(raw === '' || raw === '.' ? clearedValue : Number(raw));
          }}
          className="group-create-control"
        />
      )}
      {hint ? <p className="group-create-note">{hint}</p> : null}
    </div>
  );
};

const NewGroupModal = ({
  initialData,
  duplicateData,
  presetName,
  onClose,
  onSuccess,
  embedded = false,
  screenNumber,
  isMovable: controlledMovable,
  onToggleMovable,
  onMoveButtonPointerDown,
  onHeaderPointerDown,
}) => {
  const titleId = useId();
  const refusedSymbolsId = useId();
  const queryClient = useQueryClient();
  const { canAct } = usePermissions();
  const canManageGroups = canAct(PERMISSIONS.MANAGE_GROUPS);
  const isEditing = Boolean(initialData);
  const isFreshCreate = !initialData && !duplicateData;
  const [localMovable, setLocalMovable] = useState(false);
  const [localPosition, setLocalPosition] = useState({ x: 0, y: 0 });
  const suppressToggleClickRef = useRef(false);
  const isMovable = controlledMovable !== undefined ? Boolean(controlledMovable) : localMovable;

  const handleToggleMovable = (event) => {
    if (onToggleMovable) {
      onToggleMovable(event);
      return;
    }
    if (suppressToggleClickRef.current) {
      suppressToggleClickRef.current = false;
      return;
    }
    setLocalMovable((prev) => {
      const next = !prev;
      if (!next) setLocalPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const handleLocalMoveButtonPointerDown = (event) => {
    if (onMoveButtonPointerDown) {
      onMoveButtonPointerDown(event);
      return;
    }
    if (event.button !== 0) return;
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const basePos = { ...localPosition };
    let moved = false;

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!moved && Math.hypot(dx, dy) >= 4) {
        moved = true;
        suppressToggleClickRef.current = true;
        setLocalMovable(true);
      }
      if (moved) {
        moveEvent.preventDefault();
        setLocalPosition({
          x: basePos.x + dx,
          y: basePos.y + dy,
        });
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleLocalPointerDown = (event) => {
    if (onHeaderPointerDown) {
      onHeaderPointerDown(event);
      return;
    }
    if (!isMovable || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('button, input, select, textarea, a, label, [role="listbox"], [role="option"], [role="combobox"]')) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const basePos = { ...localPosition };
    const onMove = (moveEvent) => {
      moveEvent.preventDefault();
      setLocalPosition({
        x: basePos.x + (moveEvent.clientX - startX),
        y: basePos.y + (moveEvent.clientY - startY),
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };
  const [initialForm] = useState(() => buildNewGroupFormData({ initialData, duplicateData, presetName }));
  const [formData, setFormData] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Mapped GROUP_POLICY server errors, keyed by policy field and rendered
  // inline on the named field. Cleared per field on edit and on resubmit.
  const [fieldErrors, setFieldErrors] = useState({});
  // Allowed symbols the last save refused (no enabled instrument). Shown as one
  // list and marked in the picker; cleared on resubmit.
  const [refusedSymbols, setRefusedSymbols] = useState([]);
  // The explicit list kept while "Allow all symbols" is on, restored when it
  // is turned off again in the same edit.
  const explicitAllowedRef = useRef('');
  const allowAllSymbols = isAllowAllSymbols(formData.symbolsAllowed);
  const setAllowAllSymbols = (on) => {
    setFormData((prev) => {
      if (on === isAllowAllSymbols(prev.symbolsAllowed)) return prev;
      if (on) {
        explicitAllowedRef.current = prev.symbolsAllowed;
        return { ...prev, symbolsAllowed: ALLOW_ALL_SYMBOLS };
      }
      return { ...prev, symbolsAllowed: explicitAllowedRef.current };
    });
    setRefusedSymbols([]);
  };
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Duplicate/edit sources keep their value and count as touched, so parent
  // inheritance never overwrites them; an explicit check/uncheck always wins.
  const tradeTouched = useRef(Boolean(initialData || duplicateData));
  // Same ref pattern for leverage: a fresh create starts blank (with a
  // `Select leverage…` placeholder) and is pre-filled from the broker's group
  // default when one resolves. A top-level create always sends a whole-number
  // leverage (pre-filled or entered) and is blocked inline otherwise; with a
  // parent group an untouched leverage is omitted so the parent governs.
  // Edit/duplicate sources count as touched and are always sent.
  const leverageTouched = useRef(Boolean(initialData || duplicateData));
  const [leveragePrefilled, setLeveragePrefilled] = useState(false);
  const [leverageDefaultMissing, setLeverageDefaultMissing] = useState(false);
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

  // Fresh creates read the broker's default group leverage once. A miss
  // (null, refused, unavailable) leaves the field blank with a hint.
  useEffect(() => {
    if (!isFreshCreate) return undefined;
    let cancelled = false;
    fetchBrokerDefaultLeverage().then((brokerLeverage) => {
      if (cancelled) return;
      if (brokerLeverage === null) {
        setLeverageDefaultMissing(true);
        return;
      }
      if (leverageTouched.current) return;
      setFormData((prev) => (isBlankLeverage(prev.leverage) ? { ...prev, leverage: brokerLeverage } : prev));
      setLeveragePrefilled(true);
    });
    return () => { cancelled = true; };
  }, [isFreshCreate]);

  const handleChange = (key, val) => {
    if (key === 'tradeAllowed') tradeTouched.current = true;
    if (key === 'leverage') leverageTouched.current = true;
    // Editing a field clears its inline policy error; the visible Book choice
    // edits routingMode, which carries the backend-canonical bookType error.
    setFieldErrors((prev) => {
      if (!prev[key] && !(key === 'routingMode' && prev.bookType)) return prev;
      const next = { ...prev };
      delete next[key];
      if (key === 'routingMode') delete next.bookType;
      return next;
    });
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
    // A refused symbol the operator removed is no longer flagged.
    if (key === 'symbolsAllowed') {
      const kept = new Set(String(csvString ?? '').split(',').map(symbolKey).filter(Boolean));
      setRefusedSymbols((prev) => (prev.some((symbol) => !kept.has(symbolKey(symbol))) ? prev.filter((symbol) => kept.has(symbolKey(symbol))) : prev));
    }
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
      setFieldErrors({});
      return;
    }
    const allowedError = emptyAllowedSymbolsError({
      value: formData.symbolsAllowed,
      initialValue: initialData?.symbolsAllowed,
      isEditing,
    });
    if (allowedError) {
      setError(allowedError);
      setFieldErrors({});
      return;
    }
    if (!isEditing) {
      const leverageCheck = resolveCreateLeverage({
        leverage: formData.leverage,
        parentGroup: formData.parentGroup,
        leverageTouched: leverageTouched.current,
      });
      if (leverageCheck.error) {
        setError(null);
        setFieldErrors({ leverage: leverageCheck.error });
        return;
      }
    }

    try {
      setLoading(true);
      setError(null);
      setFieldErrors({});
      setRefusedSymbols([]);

      // Edits send only the changed fields (like GroupPropertiesModal), so an
      // untouched save never re-pushes leverage/margin onto the group's
      // accounts. A changed name is refused by submitGroup (no group rename).
      const payload = isEditing
        ? buildGroupSavePayload(initialForm, formData)
        : buildNewGroupPayload(formData, { leverageTouched: leverageTouched.current });
      if (typeof payload.symbolsAllowed === 'string') {
        payload.symbolsAllowed = payload.symbolsAllowed.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (typeof payload.symbolsBlocked === 'string') {
        payload.symbolsBlocked = payload.symbolsBlocked.split(',').map(s => s.trim()).filter(Boolean);
      }

      // Update writes the changed leverage/margin onto each account of exactly this group.
      const saved = await submitGroup({
        originalName: isEditing ? String(initialData.name) : '',
        payload,
        queryClient,
      });

      if (onSuccess) onSuccess(saved);
      onClose();
    } catch (err) {
      // Mapped GROUP_POLICY errors render inline on the named field; the raw
      // code never renders. A recognized code with no parseable field falls
      // back to the mapper's generic friendly text at form level. Unknown
      // errors keep the existing verbatim form-level passthrough.
      const mapped = mapGroupPolicyError(err);
      const raw = err instanceof Error ? err.message : String(err?.message ?? err ?? '');
      const code = err && typeof err === 'object' && !(err instanceof Error) ? err.code : undefined;
      const isPolicyError =
        raw.includes(GROUP_POLICY_DEFAULT_MISSING) ||
        raw.includes(GROUP_POLICY_DEFAULT_INVALID) ||
        raw.includes(GROUP_LEVERAGE_INVALID) ||
        code === GROUP_POLICY_DEFAULT_MISSING ||
        code === GROUP_POLICY_DEFAULT_INVALID ||
        code === GROUP_LEVERAGE_INVALID;
      if (isPolicyError) {
        const field = groupPolicyErrorField(err);
        if (field) {
          setFieldErrors({ [field]: mapped });
          setError(null);
        } else {
          setFieldErrors({});
          setError(mapped);
        }
      } else {
        setFieldErrors({});
        const refused = Array.isArray(err?.unavailableSymbols) ? err.unavailableSymbols : [];
        if (refused.length > 0 && err.symbolsNotConfigured) {
          setRefusedSymbols(refused);
          setError(null);
        } else {
          // Any other refusal (feed scope, group in use, ...) keeps the server text.
          setError(err instanceof Error ? err.message : mapped);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const title = isEditing ? `Edit group: ${initialData.name}` : duplicateData ? `Duplicate group: ${duplicateData.name}` : 'New group';

  const formContent = (
    <form
      className={`ui-modal group-create${embedded ? ' group-create-embedded' : ''}${isMovable ? ' is-movable' : ''}`}
      role={embedded ? 'region' : 'dialog'}
      aria-modal={embedded ? undefined : 'true'}
      aria-labelledby={titleId}
      onPointerDown={!embedded ? handleLocalPointerDown : undefined}
      onSubmit={(event) => { event.preventDefault(); handleSubmit(); }}
      style={!embedded && isMovable && (localPosition.x || localPosition.y)
        ? { transform: `translate3d(${localPosition.x}px, ${localPosition.y}px, 0)` }
        : undefined}
    >
      <div
        className={`ui-modal-header group-create-header${isMovable ? ' is-movable' : ''}`}
        onPointerDown={handleLocalPointerDown}
      >
        <div className="group-create-heading">
          <span id={titleId} className="group-create-title">
            {title}{screenNumber ? <span className="multi-screen-badge">#{screenNumber}</span> : null}
          </span>
        </div>
        <div className="new-account-header-actions">
          <button
            type="button"
            className={`ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm new-account-move-toggle${isMovable ? ' is-active' : ''}`}
            onClick={(event) => {
              event.stopPropagation();
              handleToggleMovable(event);
            }}
            onPointerDown={handleLocalMoveButtonPointerDown}
            aria-label={isMovable ? 'Dock group window' : 'Make group window movable'}
            aria-pressed={isMovable}
            title={isMovable ? 'Movable mode ON — drag header or icon to move (click to dock)' : 'Click or drag to move window'}
            data-testid={screenNumber ? `new-group-move-toggle-${screenNumber}` : 'new-group-move-toggle'}
          >
            <Move size={14} />
          </button>
          <button
            type="button"
            className="group-create-close"
            aria-label="Close"
            onClick={onClose}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="group-create-body">
        {error && (
          <div className="group-create-error" role="alert">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        <section className="group-create-panel">
          <div className="group-create-section-heading">
            <h2>Group setup</h2>
            <p>Set the group name, currency, and account flags.</p>
          </div>
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

          <div className="group-create-checks">
            <CheckField label="Demo group" checked={formData.demo} onChange={(v) => handleChange('demo', v)} error={fieldErrors.demo} />
            <CheckField label="Trade allowed" checked={formData.tradeAllowed} onChange={(v) => handleChange('tradeAllowed', v)} error={fieldErrors.tradeAllowed} />
            <CheckField label="Negative balance protection" checked={formData.negativeBalanceProtection} onChange={(v) => handleChange('negativeBalanceProtection', v)} />
          </div>
        </section>

        <section className="group-create-panel">
          <div className="group-create-section-heading">
            <h2>Margin &amp; leverage</h2>
            <p>Configure leverage, margin call, and stop out levels.</p>
          </div>
          <div className="group-create-grid">
            <PresetSelect
              key={leveragePrefilled ? 'leverage-prefilled' : 'leverage'}
              label="Leverage"
              value={formData.leverage}
              presets={LEVERAGE_PRESETS}
              onChange={(v) => handleChange('leverage', v)}
              clearedValue=""
              placeholder="Select leverage…"
              customPlaceholder="Ratio, e.g. 150 for 1:150"
              error={fieldErrors.leverage}
              hint={leverageDefaultMissing && isBlankLeverage(formData.leverage) && String(formData.parentGroup ?? '').trim() === '' ? GROUP_LEVERAGE_NO_DEFAULT_HINT : null}
            />
            <PresetSelect label="Margin call (%)" value={formData.marginCallLevel} presets={MARGIN_CALL_PRESETS} onChange={(v) => handleChange('marginCallLevel', v)} placeholder="Select level" customPlaceholder="Percent, e.g. 90" error={fieldErrors.marginCallLevel} />
            <PresetSelect label="Stop out (%)" value={formData.stopOutLevel} presets={STOP_OUT_PRESETS} onChange={(v) => handleChange('stopOutLevel', v)} placeholder="Select level" customPlaceholder="Percent, e.g. 45" error={fieldErrors.stopOutLevel} />
            <PresetSelect label="Spread markup" value={formData.spreadMarkup} presets={SPREAD_MARKUP_PRESETS} onChange={(v) => handleChange('spreadMarkup', v)} placeholder="Select markup" customPlaceholder="Points, e.g. 7" />
          </div>
          {Number(formData.stopOutLevel) > Number(formData.marginCallLevel) && Number(formData.marginCallLevel) > 0 && (
            <p className="group-create-note">Stop out is above the margin call. It is normally lower.</p>
          )}
        </section>

        <section className="group-create-panel">
          <div className="group-create-section-heading">
            <h2>Execution &amp; commission</h2>
            <p>Define order routing, lot limits, and commissions.</p>
          </div>
          <div className="group-create-grid">
            <GroupChoice
              label="Execution mode"
              value={formData.executionMode || ''}
              placeholder="Select"
              error={fieldErrors.executionMode}
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
              error={fieldErrors.bookType}
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
          <div className="group-create-section-heading">
            <h2>Trading symbols</h2>
            <p>Choose allowed and restricted trading instruments.</p>
          </div>
          <CheckField label="Allow all symbols" checked={allowAllSymbols} onChange={setAllowAllSymbols} />
          <p className="group-create-hint">
            {allowAllSymbols
              ? 'Every symbol with an enabled instrument is allowed, including symbols enabled later. Blocked symbols still apply.'
              : String(formData.symbolsAllowed ?? '').trim() === ''
                ? 'No symbols are listed: the server then allows every enabled instrument. Select symbols, or tick "Allow all symbols" to make that explicit.'
                : 'Only symbols with an enabled instrument can be selected.'}
          </p>
          <SymbolSelector label="Allowed symbols" value={formData.symbolsAllowed} onChange={(v) => handleArrayChange('symbolsAllowed', v)} restrictToConfigured refusedSymbols={refusedSymbols} disabled={allowAllSymbols} />
          {refusedSymbols.length > 0 ? (
            <FieldError
              id={refusedSymbolsId}
              message={`These symbols are not configured: ${refusedSymbols.join(', ')}. Remove them from Allowed symbols, or enable them in Admin → Symbol Management, then save again.`}
            />
          ) : null}
          <SymbolSelector label="Blocked symbols" value={formData.symbolsBlocked} onChange={(v) => handleArrayChange('symbolsBlocked', v)} />
        </section>
      </div>

      <div className="group-create-footer">
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={onClose}>Cancel</button>
        <button type="submit" className="ui-btn ui-btn-primary ui-btn-sm" disabled={loading}>
          {loading ? (isEditing ? 'Updating...' : 'Creating...') : (isEditing ? 'Update Group' : 'Create Group')}
        </button>
      </div>
    </form>
  );

  if (embedded) {
    return (
      <>
        {formContent}
        {permissionDenied && <GroupPermissionNotice action={isEditing ? 'change' : 'create'} onClose={() => setPermissionDenied(false)} />}
      </>
    );
  }

  return (
    <div className="ui-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      {formContent}
      {permissionDenied && <GroupPermissionNotice action={isEditing ? 'change' : 'create'} onClose={() => setPermissionDenied(false)} />}
    </div>
  );
};

export default NewGroupModal;
