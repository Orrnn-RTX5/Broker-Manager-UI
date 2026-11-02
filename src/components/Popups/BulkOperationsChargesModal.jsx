import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AccountTypeIcon } from '../../features/clients/components/TradingAccountsDataGrid';
import { submitManagerTransaction } from '../../services/managerFinanceApi';
import { invalidateRealtimeCaches, preloadAccountPositions } from '../../services/api';
import { loadAccountDetails, prefetchAccountDetails, seedAccountDetails } from '../../services/accountDetails';
import { useMultiScreenStore } from '../../store/multiScreenStore';
import { showResult } from '../../store/resultDialogStore';
import './BulkOperationsChargesModal.css';

const BULK_CHARGE_OPERATIONS = [
  { value: 'Balance', label: 'Balance' },
  { value: 'Credit', label: 'Credit' },
  { value: 'Charge', label: 'Charge' },
  { value: 'Correction', label: 'Correction' },
  { value: 'Bonus', label: 'Bonus' },
  { value: 'Commission', label: 'Commission' },
  { value: 'Dividend', label: 'Dividend' },
  { value: 'Franked Dividend', label: 'Franked Dividend' },
  { value: 'Tax', label: 'Tax' },
];

const formatSpaceCurrency = (value) => {
  const num = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(num)) {
    return '0.00';
  }
  const absFixed = Math.abs(num).toFixed(2);
  const [intPart, decPart] = absFixed.split('.');
  const spaced = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${num < 0 ? '-' : ''}${spaced}.${decPart}`;
};

const normalizeBulkAccountRow = (acc) => {
  if (!acc) return null;
  const isPrimitive = typeof acc === 'string' || typeof acc === 'number';
  const login = String(isPrimitive ? acc : (acc.login ?? acc.Login ?? acc.id ?? '')).trim();
  if (!login) return null;
  const firstName = isPrimitive ? '' : String(acc.firstName ?? acc.FirstName ?? acc.raw?.FirstName ?? '').trim();
  const lastName = isPrimitive ? '' : String(acc.lastName ?? acc.LastName ?? acc.raw?.LastName ?? '').trim();
  const fullName = isPrimitive
    ? ''
    : String(
      acc.name
      ?? acc.Name
      ?? ([firstName, lastName].filter(Boolean).join(' '))
      ?? acc.raw?.Name
      ?? ''
    ).trim();
  const group = isPrimitive
    ? ''
    : String(acc.group ?? acc.Group ?? acc.raw?.Group ?? acc.raw?.GroupName ?? '').trim();
  const currency = isPrimitive
    ? 'USD'
    : String(acc.currency ?? acc.Currency ?? acc.raw?.Currency ?? 'USD').trim() || 'USD';
  const rawBalance = isPrimitive
    ? 0
    : Number(acc.balance ?? acc.Balance ?? acc.raw?.Balance ?? 0);
  const balance = Number.isFinite(rawBalance) ? rawBalance : 0;

  return {
    login,
    name: fullName,
    group,
    currency,
    balance,
    raw: isPrimitive ? { login } : acc,
  };
};

const BulkOperationsDocIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="2.5" y="1.5" width="11" height="13" rx="1.3" stroke="#3b82f6" strokeWidth="1.3" fill="#172554" />
    <line x1="5" y1="5" x2="11" y2="5" stroke="#93c5fd" strokeWidth="1.2" strokeLinecap="round" />
    <line x1="5" y1="8" x2="11" y2="8" stroke="#93c5fd" strokeWidth="1.2" strokeLinecap="round" />
    <line x1="5" y1="11" x2="8.8" y2="11" stroke="#93c5fd" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const BulkOperationsChargesModal = ({
  accounts = [],
  groups = [],
  canEditAccounts = true,
  onClose,
  onSuccess,
  onOpenAccountDetails,
}) => {
  const openAccountDetailWindow = useMultiScreenStore((state) => state.openAccountDetailWindow);
  const closeAccountDetailWindow = useMultiScreenStore((state) => state.closeAccountDetailWindow);
  const openAccountWindows = useMultiScreenStore((state) => state.openAccountWindows);
  const hasOpenAccountWindow = openAccountWindows.some((win) => !win.minimized);
  const normalizedRows = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const item of Array.isArray(accounts) ? accounts : [accounts]) {
      const normalized = normalizeBulkAccountRow(item);
      if (normalized && !seen.has(normalized.login)) {
        seen.add(normalized.login);
        list.push(normalized);
      }
    }
    return list;
  }, [accounts]);

  const groupByNameMap = useMemo(() => {
    const map = new Map();
    for (const grp of Array.isArray(groups) ? groups : []) {
      const grpName = String(grp?.name ?? grp?.Name ?? grp?.group ?? grp?.Group ?? '').trim();
      if (grpName) map.set(grpName.toLowerCase(), grp);
    }
    return map;
  }, [groups]);

  const defaultCcy = normalizedRows[0]?.currency || 'USD';

  const [operation, setOperation] = useState('Balance');
  const [operationMenuOpen, setOperationMenuOpen] = useState(false);
  const [hoveredOperation, setHoveredOperation] = useState('Balance');
  const [amountInput, setAmountInput] = useState('');
  const [currencyInput, setCurrencyInput] = useState(defaultCcy);
  const [commentInput, setCommentInput] = useState('');
  const [skipMarginCheck, setSkipMarginCheck] = useState(false);
  const [rowAmounts, setRowAmounts] = useState(() => ({}));
  const [rowBalances, setRowBalances] = useState(() => ({}));
  const [selectedLogin, setSelectedLogin] = useState(() => normalizedRows[0]?.login || null);
  const [showRatesBar, setShowRatesBar] = useState(false);
  const [conversionRate, setConversionRate] = useState('1.0000');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusInfo, setStatusInfo] = useState(null);

  const fileInputRef = useRef(null);
  const amountInputRef = useRef(null);
  const operationDropdownRef = useRef(null);

  const initialWidth = 695;
  const initialHeight = 428;
  const [size, setSize] = useState({ width: initialWidth, height: initialHeight });
  const [position, setPosition] = useState(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    return {
      x: Math.max(16, Math.round((vw - initialWidth) / 2) + 26),
      y: Math.max(42, Math.round((vh - initialHeight) / 2) - 38),
    };
  });

  useEffect(() => {
    amountInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !isProcessing) {
        if (operationMenuOpen) {
          event.preventDefault();
          setOperationMenuOpen(false);
          return;
        }
        if (typeof document !== 'undefined' && document.querySelector('.account-details-window:not([data-minimized="true"])')) {
          return;
        }
        event.preventDefault();
        onClose?.();
      }
    };
    const onMouseDownOutside = (event) => {
      if (operationDropdownRef.current && !operationDropdownRef.current.contains(event.target)) {
        setOperationMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onMouseDownOutside);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onMouseDownOutside);
    };
  }, [isProcessing, onClose, operationMenuOpen]);

  const parsedInputAmount = useMemo(() => {
    const trimmed = String(amountInput ?? '').trim().replace(/\s+/g, '');
    if (!trimmed || !/^-?\d+(\.\d{1,2})?$/.test(trimmed)) return null;
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num === 0) return null;
    return num;
  }, [amountInput]);

  const parsedRate = useMemo(() => {
    const num = Number(String(conversionRate || '1').trim());
    return Number.isFinite(num) && num > 0 ? num : 1;
  }, [conversionRate]);

  const canSetAmount = parsedInputAmount !== null && normalizedRows.length > 0 && !isProcessing;

  const hasMultiCurrency = useMemo(() => {
    const targetCcy = String(currencyInput || 'USD').trim().toUpperCase();
    return normalizedRows.some((r) => String(r.currency || 'USD').toUpperCase() !== targetCcy);
  }, [currencyInput, normalizedRows]);

  const canClickRates = (hasMultiCurrency || showRatesBar || parsedInputAmount !== null) && !isProcessing;

  const handleSetAmounts = useCallback(() => {
    if (parsedInputAmount === null) return;
    const targetCcy = String(currencyInput || 'USD').trim().toUpperCase();
    const next = {};
    for (const row of normalizedRows) {
      const rowCcy = String(row.currency || 'USD').toUpperCase();
      const effective = rowCcy === targetCcy
        ? parsedInputAmount
        : Number((parsedInputAmount * parsedRate).toFixed(2));
      next[row.login] = effective;
    }
    setRowAmounts(next);
    setStatusInfo(null);
  }, [currencyInput, normalizedRows, parsedInputAmount, parsedRate]);

  const handleLoadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleOpenAccount = useCallback((row) => {
    if (!row?.login) return;
    const currentBalance = rowBalances[row.login] ?? row.balance;
    const targetAccount = row.raw && typeof row.raw === 'object'
      ? {
        ...row.raw,
        login: row.login,
        name: row.name || row.raw.name || row.raw.Name || '',
        group: row.group || row.raw.group || row.raw.Group || '',
        currency: row.currency || row.raw.currency || row.raw.Currency || 'USD',
        balance: currentBalance,
      }
      : {
        login: row.login,
        name: row.name,
        group: row.group,
        currency: row.currency,
        balance: currentBalance,
      };

    seedAccountDetails(row.login, targetAccount);
    void prefetchAccountDetails(row.login);
    void preloadAccountPositions(row.login);

    for (const win of openAccountWindows) {
      if (!win.minimized && String(win.login) !== String(row.login)) {
        closeAccountDetailWindow(win.login);
      }
    }

    if (typeof onOpenAccountDetails === 'function') {
      onOpenAccountDetails(targetAccount, 'Overview');
      return;
    }
    openAccountDetailWindow(targetAccount, {
      source: 'trading-accounts',
      initialTab: 'Overview',
    });
  }, [closeAccountDetailWindow, onOpenAccountDetails, openAccountDetailWindow, openAccountWindows, rowBalances]);

  const handleFileChange = useCallback((event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const next = { ...rowAmounts };
      let appliedCount = 0;

      for (const line of lines) {
        const parts = line.split(/[,\t;]+/).map((p) => p.trim());
        if (parts.length >= 2) {
          const [loginCol, amtCol] = parts;
          const amt = Number(amtCol.replace(/\s+/g, ''));
          if (Number.isFinite(amt) && amt !== 0 && normalizedRows.some((r) => r.login === loginCol)) {
            next[loginCol] = Number(amt.toFixed(2));
            appliedCount += 1;
          }
        } else if (parts.length === 1) {
          const amt = Number(parts[0].replace(/\s+/g, ''));
          if (Number.isFinite(amt) && amt !== 0) {
            setAmountInput(amt.toFixed(2));
            for (const row of normalizedRows) {
              next[row.login] = Number(amt.toFixed(2));
              appliedCount += 1;
            }
          }
        }
      }

      if (appliedCount > 0) {
        setRowAmounts(next);
        setStatusInfo({ tone: 'success', text: `Loaded amounts for ${appliedCount} account(s) from "${file.name}".` });
      } else {
        setStatusInfo({ tone: 'error', text: `No matching login/amount pairs found in "${file.name}".` });
      }
    };
    reader.readAsText(file);
  }, [normalizedRows, rowAmounts]);

  const rowsWithAmounts = useMemo(
    () => normalizedRows.filter((row) => {
      const val = rowAmounts[row.login];
      return typeof val === 'number' && Number.isFinite(val) && val !== 0;
    }),
    [normalizedRows, rowAmounts]
  );

  const canProcess = rowsWithAmounts.length > 0 && canEditAccounts && !isProcessing;

  const handleProcess = useCallback(async () => {
    if (!canProcess) return;
    setIsProcessing(true);
    setStatusInfo(null);

    const isCreditOp = operation === 'Credit' || operation === 'SO Credit Compensation';
    const commentPrefix = operation !== 'Balance' && operation !== 'Credit' ? `[${operation}] ` : '';
    const finalComment = `${commentPrefix}${commentInput.trim()}`.trim();

    let successCount = 0;
    let firstError = '';
    const updatedBalances = { ...rowBalances };

    for (const row of rowsWithAmounts) {
      const amountVal = Number(rowAmounts[row.login]);
      const currentBal = rowBalances[row.login] ?? row.balance;

      if (!skipMarginCheck && !isCreditOp && amountVal < 0 && currentBal + amountVal < 0) {
        firstError = firstError || `Account #${row.login}: insufficient balance (${formatSpaceCurrency(currentBal)}) for ${formatSpaceCurrency(amountVal)}.`;
        continue;
      }

      const parsedLogin = Number(row.login);
      if (!Number.isSafeInteger(parsedLogin) || parsedLogin <= 0) {
        firstError = firstError || `Account #${row.login}: invalid numeric login ID.`;
        continue;
      }

      const txType = isCreditOp
        ? 'credit'
        : amountVal < 0
          ? 'withdraw'
          : 'deposit';

      try {
        await submitManagerTransaction(txType, {
          login: parsedLogin,
          amount: Math.abs(amountVal),
          comment: finalComment,
        });
        updatedBalances[row.login] = Number((currentBal + amountVal).toFixed(2));
        successCount += 1;
        void loadAccountDetails(parsedLogin, { force: true }).catch(() => {});
      } catch (err) {
        firstError = firstError || `Account #${row.login}: ${err?.message || 'Operation failed'}`;
      }
    }

    setRowBalances(updatedBalances);
    setIsProcessing(false);

    if (successCount > 0) {
      invalidateRealtimeCaches('accounts');
      onSuccess?.();
    }

    if (successCount === rowsWithAmounts.length && !firstError) {
      showResult.success(`${operation} operation processed for ${successCount} account(s).`);
      onClose?.();
    } else if (successCount > 0 && firstError) {
      setStatusInfo({
        tone: 'error',
        text: `Processed ${successCount}/${rowsWithAmounts.length} account(s). ${firstError}`,
      });
    } else if (firstError) {
      setStatusInfo({ tone: 'error', text: firstError });
    }
  }, [canProcess, commentInput, onClose, onSuccess, operation, rowAmounts, rowBalances, rowsWithAmounts, skipMarginCheck]);

  const handleTitleMouseDown = (event) => {
    if (event.button !== 0 || event.target.closest('button')) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startPos = { ...position };

    const onMove = (moveEvent) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const nextX = Math.max(4, Math.min(vw - size.width - 4, startPos.x + (moveEvent.clientX - startX)));
      const nextY = Math.max(4, Math.min(vh - size.height - 4, startPos.y + (moveEvent.clientY - startY)));
      setPosition({ x: nextX, y: nextY });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleResizeMouseDown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startSize = { ...size };

    const onMove = (moveEvent) => {
      setSize({
        width: Math.max(560, startSize.width + (moveEvent.clientX - startX)),
        height: Math.max(360, startSize.height + (moveEvent.clientY - startY)),
      });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const modalNode = (
    <div className="bulk-ops-backdrop">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bulk Operations"
        className={`bulk-ops-window${hasOpenAccountWindow ? ' is-inactive-window' : ''}`}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${size.width}px`,
          height: `${size.height}px`,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt"
          onChange={handleFileChange}
          style={{ display: 'none' }}
          aria-hidden="true"
          tabIndex={-1}
        />

        {/* Titlebar */}
        <div className="bulk-ops-titlebar" onMouseDown={handleTitleMouseDown}>
          <div className="bulk-ops-title-left">
            <BulkOperationsDocIcon />
            <span className="bulk-ops-title-text">Bulk Operations</span>
          </div>
          <div className="bulk-ops-title-actions">
            <button
              type="button"
              className="bulk-ops-title-btn"
              title="Help"
              aria-label="Help"
              onClick={() =>
                setStatusInfo({
                  tone: 'info',
                  text: 'Enter an amount and click Set to preview account balances, then click Process to execute.',
                })
              }
            >
              ?
            </button>
            <button
              type="button"
              className="bulk-ops-title-btn is-close"
              title="Close"
              aria-label="Close"
              disabled={isProcessing}
              onClick={() => onClose?.()}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="bulk-ops-body">
          <div className="bulk-ops-form">
            {/* Row 1: Operation + Load */}
            <div className="bulk-ops-form-row">
              <label htmlFor="bulk-ops-operation" className="bulk-ops-label">
                Operation:
              </label>
              <div ref={operationDropdownRef} className="bulk-ops-operation-dropdown">
                <button
                  id="bulk-ops-operation"
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={operationMenuOpen}
                  className={`bulk-ops-operation-trigger${operationMenuOpen ? ' is-open' : ''}`}
                  disabled={isProcessing}
                  onClick={() => {
                    setHoveredOperation(operation);
                    setOperationMenuOpen((prev) => !prev);
                  }}
                  onKeyDown={(e) => {
                    const currentIdx = BULK_CHARGE_OPERATIONS.findIndex((o) => o.value === operation);
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      const next = BULK_CHARGE_OPERATIONS[Math.min(BULK_CHARGE_OPERATIONS.length - 1, currentIdx + 1)];
                      if (next) {
                        setOperation(next.value);
                        setHoveredOperation(next.value);
                      }
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      const prev = BULK_CHARGE_OPERATIONS[Math.max(0, currentIdx - 1)];
                      if (prev) {
                        setOperation(prev.value);
                        setHoveredOperation(prev.value);
                      }
                    } else if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setHoveredOperation(operation);
                      setOperationMenuOpen((prev) => !prev);
                    }
                  }}
                >
                  <span>{operation}</span>
                  <svg className="bulk-ops-operation-chevron" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M2.5 4.25L6 7.75L9.5 4.25" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {operationMenuOpen && (
                  <ul role="listbox" aria-label="Operation" className="bulk-ops-operation-menu">
                    {BULK_CHARGE_OPERATIONS.map((opt) => {
                      const isActive = (hoveredOperation || operation) === opt.value;
                      return (
                        <li key={opt.value} role="option" aria-selected={operation === opt.value}>
                          <button
                            type="button"
                            className={`bulk-ops-operation-option${isActive ? ' is-active' : ''}`}
                            onMouseEnter={() => setHoveredOperation(opt.value)}
                            onClick={() => {
                              setOperation(opt.value);
                              setHoveredOperation(opt.value);
                              setOperationMenuOpen(false);
                            }}
                          >
                            {opt.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <button
                type="button"
                className="bulk-ops-btn"
                onClick={handleLoadClick}
                disabled={isProcessing}
              >
                Load
              </button>
            </div>

            {/* Row 2: Amount + Currency + Set + Rates */}
            <div className="bulk-ops-form-row">
              <label htmlFor="bulk-ops-amount" className="bulk-ops-label">
                Amount:
              </label>
              <input
                ref={amountInputRef}
                id="bulk-ops-amount"
                type="text"
                inputMode="decimal"
                className="bulk-ops-input bulk-ops-amount-input"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSetAmount) {
                    e.preventDefault();
                    handleSetAmounts();
                  }
                }}
                disabled={isProcessing}
              />
              <input
                type="text"
                aria-label="Currency"
                className="bulk-ops-input bulk-ops-ccy-input"
                value={currencyInput}
                onChange={(e) => setCurrencyInput(e.target.value.toUpperCase())}
                disabled={isProcessing}
              />
              <button
                type="button"
                className="bulk-ops-btn"
                disabled={!canSetAmount}
                onClick={handleSetAmounts}
              >
                Set
              </button>
              <button
                type="button"
                className="bulk-ops-btn"
                disabled={!canClickRates}
                onClick={() => setShowRatesBar((prev) => !prev)}
              >
                Rates
              </button>
            </div>

            {showRatesBar && (
              <div className="bulk-ops-rates-bar">
                <span>Conversion Rate ({currencyInput || 'USD'} → Account Ccy):</span>
                <input
                  type="text"
                  aria-label="Conversion rate"
                  className="bulk-ops-input"
                  style={{ width: 78 }}
                  value={conversionRate}
                  onChange={(e) => setConversionRate(e.target.value)}
                />
              </div>
            )}

            {/* Row 3: Comment */}
            <div className="bulk-ops-form-row">
              <label htmlFor="bulk-ops-comment" className="bulk-ops-label">
                Comment:
              </label>
              <input
                id="bulk-ops-comment"
                type="text"
                className="bulk-ops-input bulk-ops-comment-input"
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                disabled={isProcessing}
              />
            </div>

            {/* Row 4: Checkbox */}
            <label className="bulk-ops-checkbox-row">
              <input
                type="checkbox"
                className="bulk-ops-checkbox"
                checked={skipMarginCheck}
                onChange={(e) => setSkipMarginCheck(e.target.checked)}
                disabled={isProcessing}
              />
              <span>
                Conduct balance operation without checking the free margin and the current balance on the account
              </span>
            </label>
          </div>

          {/* Accounts Table */}
          <div className="bulk-ops-table-container trading-accounts-grid">
            <table className="bulk-ops-table" aria-label="Bulk operations accounts">
              <colgroup>
                <col style={{ width: '14.2857%' }} />
                <col style={{ width: '14.2857%' }} />
                <col style={{ width: '14.2857%' }} />
                <col style={{ width: '14.2857%' }} />
                <col style={{ width: '14.2857%' }} />
                <col style={{ width: '14.2857%' }} />
                <col style={{ width: '14.2857%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Login</th>
                  <th>Name</th>
                  <th>Group</th>
                  <th>Ccy</th>
                  <th>Balance</th>
                  <th>Amount</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {normalizedRows.map((row) => {
                  const currentBalance = rowBalances[row.login] ?? row.balance;
                  const rowAmount = rowAmounts[row.login];
                  const hasRowAmount = typeof rowAmount === 'number' && Number.isFinite(rowAmount);
                  const projectedResult = hasRowAmount ? currentBalance + rowAmount : currentBalance;
                  const groupRecord = row.group
                    ? groupByNameMap.get(String(row.group).trim().toLowerCase()) || null
                    : null;
                  const isSelected = selectedLogin === row.login;

                  return (
                    <tr
                      key={row.login}
                      tabIndex={0}
                      className={isSelected ? 'is-selected' : ''}
                      onClick={() => setSelectedLogin(row.login)}
                      onDoubleClick={() => {
                        setSelectedLogin(row.login);
                        handleOpenAccount(row);
                      }}
                      onPointerEnter={() => {
                        seedAccountDetails(row.login, row.raw || row);
                        void prefetchAccountDetails(row.login);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          handleOpenAccount(row);
                        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                          event.preventDefault();
                          const idx = normalizedRows.findIndex((item) => item.login === row.login);
                          if (idx === -1) return;
                          const nextIdx = event.key === 'ArrowDown'
                            ? Math.min(normalizedRows.length - 1, idx + 1)
                            : Math.max(0, idx - 1);
                          const nextRow = normalizedRows[nextIdx];
                          if (nextRow) setSelectedLogin(nextRow.login);
                        }
                      }}
                    >
                      <td>
                        <span className="bulk-ops-login-cell">
                          <AccountTypeIcon
                            group={row.group}
                            row={row.raw}
                            groupRecord={groupRecord}
                          />
                          <span>{row.login}</span>
                        </span>
                      </td>
                      <td title={row.name}>{row.name}</td>
                      <td title={row.group}>{row.group}</td>
                      <td>{row.currency}</td>
                      <td>{formatSpaceCurrency(currentBalance)}</td>
                      <td>
                        {hasRowAmount ? formatSpaceCurrency(rowAmount) : ''}
                      </td>
                      <td>{formatSpaceCurrency(projectedResult)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="bulk-ops-footer">
            <div
              className={`bulk-ops-status ${
                statusInfo?.tone === 'error'
                  ? 'is-error'
                  : statusInfo?.tone === 'success'
                    ? 'is-success'
                    : ''
              }`}
              role={statusInfo?.tone === 'error' ? 'alert' : 'status'}
            >
              {statusInfo?.text || ''}
            </div>
            <div className="bulk-ops-footer-buttons">
              <button
                type="button"
                className="bulk-ops-btn"
                disabled={!canProcess}
                onClick={handleProcess}
              >
                {isProcessing ? 'Processing...' : 'Process'}
              </button>
              <button
                type="button"
                className="bulk-ops-btn is-primary-outline"
                disabled={isProcessing}
                onClick={() => onClose?.()}
              >
                Cancel
              </button>
            </div>
            <span
              className="bulk-ops-resize-grip"
              onMouseDown={handleResizeMouseDown}
              aria-hidden="true"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <circle cx="8" cy="8" r="1" fill="currentColor" />
                <circle cx="5" cy="8" r="1" fill="currentColor" />
                <circle cx="8" cy="5" r="1" fill="currentColor" />
                <circle cx="2" cy="8" r="1" fill="currentColor" />
                <circle cx="5" cy="5" r="1" fill="currentColor" />
                <circle cx="8" cy="2" r="1" fill="currentColor" />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    const portalTarget =
      document.querySelector('.rtx5-command-shell')
      || document.getElementById('root')
      || document.body;
    return createPortal(modalNode, portalTarget);
  }
  return modalNode;
};

export default BulkOperationsChargesModal;
