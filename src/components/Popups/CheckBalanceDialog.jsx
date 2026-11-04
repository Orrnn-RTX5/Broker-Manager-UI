import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { loadAccountDetails, peekAccountDetails } from '../../services/accountDetails';
import './CheckBalanceDialog.css';

const formatSpaceAmount = (value) => {
  const num = Number(value ?? 0);
  const safe = Number.isFinite(num) ? num : 0;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(safe)
    .replace(/,/g, ' ');
};

const extractAccountBalance = (details, fallbackRow) => {
  const candidates = [
    details?.balance,
    details?.Balance,
    details?.raw?.Balance,
    details?.raw?.balance,
    fallbackRow?.balance,
    fallbackRow?.Balance,
    fallbackRow?.raw?.Balance,
    fallbackRow?.raw?.balance,
  ];
  for (const val of candidates) {
    const num = Number(val);
    if (val !== undefined && val !== null && val !== '' && Number.isFinite(num)) {
      return num;
    }
  }
  return 0;
};

const extractAccountCurrency = (details, fallbackRow) => {
  const candidates = [
    details?.currency,
    details?.Currency,
    details?.raw?.Currency,
    details?.raw?.currency,
    fallbackRow?.currency,
    fallbackRow?.Currency,
    fallbackRow?.raw?.Currency,
    fallbackRow?.raw?.currency,
  ];
  for (const val of candidates) {
    const str = String(val ?? '').trim();
    if (str) return str;
  }
  return 'USD';
};

const QuestionCircleIcon = () => (
  <svg className="mt5-check-balance-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <circle cx="16" cy="16" r="15" fill="#0078d4" />
    <path
      d="M12.6 12.1c0-2.05 1.58-3.5 3.65-3.5 2.02 0 3.55 1.32 3.55 3.2 0 1.4-.72 2.32-1.88 3.05-.98.62-1.32 1.15-1.32 2.15v.45"
      stroke="#ffffff"
      strokeWidth="2.1"
      strokeLinecap="round"
    />
    <circle cx="16.5" cy="22.3" r="1.3" fill="#ffffff" />
  </svg>
);

const InfoCircleIcon = () => (
  <svg className="mt5-check-balance-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <circle cx="16" cy="16" r="15" fill="#0078d4" />
    <circle cx="16" cy="10.2" r="1.4" fill="#ffffff" />
    <path d="M16 14.5v8" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

const CheckBalanceDialog = ({
  accounts = [],
  onClose,
  onBalancesChecked,
}) => {
  const normalizedAccounts = useMemo(() => {
    const list = Array.isArray(accounts) ? accounts : [accounts];
    const seen = new Set();
    const out = [];
    for (const item of list) {
      if (!item) continue;
      const login = String(typeof item === 'object' ? (item.login ?? item.Login ?? '') : item).trim();
      if (!login || seen.has(login)) continue;
      seen.add(login);
      out.push(typeof item === 'object' ? item : { login });
    }
    return out;
  }, [accounts]);

  const [step, setStep] = useState('confirm'); // 'confirm' | 'checking' | 'result'
  const [focusedButton, setFocusedButton] = useState('no'); // 'yes' | 'no'
  const [checkedResults, setCheckedResults] = useState([]);

  const yesBtnRef = useRef(null);
  const noBtnRef = useRef(null);
  const okBtnRef = useRef(null);

  useEffect(() => {
    if (step === 'confirm') {
      if (focusedButton === 'yes') {
        yesBtnRef.current?.focus();
      } else {
        noBtnRef.current?.focus();
      }
    } else if (step === 'result') {
      okBtnRef.current?.focus();
    }
  }, [focusedButton, step]);

  const handleConfirmYes = useCallback(async () => {
    if (normalizedAccounts.length === 0) {
      onClose?.();
      return;
    }
    setStep('checking');

    const results = await Promise.all(
      normalizedAccounts.map(async (acc) => {
        const login = String(acc.login ?? acc.Login ?? '').trim();
        let details = peekAccountDetails(login);
        try {
          const fresh = await loadAccountDetails(login, { force: true });
          if (fresh) details = fresh;
        } catch {
          // Fall back to cached or row balance if network fetch fails
        }
        const balance = extractAccountBalance(details, acc);
        const currency = extractAccountCurrency(details, acc);
        return {
          login,
          balance,
          currency,
        };
      })
    );

    const balanceMap = {};
    for (const item of results) {
      balanceMap[item.login] = item.balance;
    }

    onBalancesChecked?.(balanceMap, results);
    setCheckedResults(results);
    setStep('result');
  }, [normalizedAccounts, onBalancesChecked, onClose]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (step === 'checking') return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose?.();
        return;
      }

      if (step === 'confirm') {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          event.stopPropagation();
          setFocusedButton('yes');
          return;
        }
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          event.stopPropagation();
          setFocusedButton('no');
          return;
        }
        if (event.key === 'Tab') {
          event.preventDefault();
          event.stopPropagation();
          setFocusedButton((prev) => (prev === 'yes' ? 'no' : 'yes'));
          return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          if (focusedButton === 'yes') {
            void handleConfirmYes();
          } else {
            onClose?.();
          }
          return;
        }
      } else if (step === 'result') {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          onClose?.();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [focusedButton, handleConfirmYes, onClose, step]);

  const dialogNode = (
    <div
      className="mt5-check-balance-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && step !== 'checking') {
          onClose?.();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mt5-check-balance-title"
        className="mt5-check-balance-dialog"
      >
        <div className="mt5-check-balance-titlebar">
          <span id="mt5-check-balance-title" className="mt5-check-balance-title">
            Accounts
          </span>
          <button
            type="button"
            className="mt5-check-balance-close"
            aria-label="Close"
            disabled={step === 'checking'}
            onClick={() => onClose?.()}
          >
            ✕
          </button>
        </div>

        {step !== 'result' ? (
          <>
            <div className="mt5-check-balance-body">
              <QuestionCircleIcon />
              <div className="mt5-check-balance-message">
                Check balances for selected accounts?
              </div>
            </div>
            <div className="mt5-check-balance-footer">
              <button
                ref={yesBtnRef}
                type="button"
                className={`mt5-check-balance-btn${focusedButton === 'yes' ? ' is-focused' : ''}`}
                disabled={step === 'checking'}
                onFocus={() => setFocusedButton('yes')}
                onMouseDown={() => setFocusedButton('yes')}
                onClick={handleConfirmYes}
              >
                {step === 'checking' ? '...' : 'Yes'}
              </button>
              <button
                ref={noBtnRef}
                type="button"
                className={`mt5-check-balance-btn${focusedButton === 'no' ? ' is-focused' : ''}`}
                disabled={step === 'checking'}
                onFocus={() => setFocusedButton('no')}
                onMouseDown={() => setFocusedButton('no')}
                onClick={() => onClose?.()}
              >
                No
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt5-check-balance-body">
              <InfoCircleIcon />
              <div className="mt5-check-balance-message">
                {checkedResults.map((item) => (
                  <div key={item.login}>
                    <div className="mt5-check-balance-line-title">
                      Account #{item.login} balance checked.
                    </div>
                    <div className="mt5-check-balance-line-value">
                      Balance: {formatSpaceAmount(item.balance)} {item.currency}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt5-check-balance-footer">
              <button
                ref={okBtnRef}
                type="button"
                className="mt5-check-balance-btn is-focused"
                onClick={() => onClose?.()}
              >
                OK
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    const portalTarget =
      document.querySelector('.rtx5-command-shell')
      || document.getElementById('root')
      || document.body;
    return createPortal(dialogNode, portalTarget);
  }
  return dialogNode;
};

export default CheckBalanceDialog;
