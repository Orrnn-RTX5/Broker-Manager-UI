import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { showResult } from '../../store/resultDialogStore';
import './PushNotificationModal.css';

const SEND_BY_OPTIONS = [
  'Login',
  'Group',
  'MetaQuotes ID',
  'Phone Number',
];

const normalizeAccountItem = (acc) => {
  if (!acc) return null;
  const isPrimitive = typeof acc === 'string' || typeof acc === 'number';
  const login = String(isPrimitive ? acc : (acc.login ?? acc.Login ?? acc.id ?? '')).trim();
  if (!login) return null;
  const group = isPrimitive
    ? ''
    : String(acc.group ?? acc.Group ?? acc.raw?.Group ?? '').trim();
  const mqid = isPrimitive
    ? ''
    : String(acc.mqid ?? acc.Mqid ?? acc.metaquotesId ?? acc.raw?.Mqid ?? '').trim();
  const phone = isPrimitive
    ? ''
    : String(acc.phone ?? acc.Phone ?? acc.raw?.Phone ?? '').trim();
  return { login, group, mqid, phone };
};

const NotificationTitleEnvelopeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="1.5" y="3" width="13" height="10" rx="1.2" stroke="#f59e0b" strokeWidth="1.3" fill="none" />
    <path d="M2 3.8L8 8.3L14 3.8" stroke="#f59e0b" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PhoneSpeechBannerIcon = () => (
  <svg width="42" height="42" viewBox="0 0 42 42" fill="none" aria-hidden="true">
    {/* Smartphone body */}
    <rect x="3" y="2" width="22" height="38" rx="3" fill="#0284c7" />
    {/* Top & bottom dark-blue bezels */}
    <path d="M3 5C3 3.34315 4.34315 2 6 2H22C23.6569 2 25 3.34315 25 5V7H3V5Z" fill="#0369a1" />
    <path d="M3 34H25V37C25 38.6569 23.6569 40 22 40H6C4.34315 40 3 38.6569 3 37V34Z" fill="#1d4ed8" />
    {/* Bright cyan phone screen */}
    <rect x="3" y="7" width="22" height="27" fill="#38bdf8" />
    {/* Subtle diagonal screen reflection */}
    <path d="M3 7H17L9 34H3V7Z" fill="#7dd3fc" fillOpacity="0.35" />
    {/* Overlapping yellow speech bubble */}
    <path
      d="M17 11C17 9.89543 17.8954 9 19 9H37C38.1046 9 39 9.89543 39 11V24C39 25.1046 38.1046 26 37 26H25L18.5 31.5V26H19C17.8954 26 17 25.1046 17 24V11Z"
      fill="#fbbf24"
    />
    <path
      d="M17 18H39V24C39 25.1046 38.1046 26 37 26H25L18.5 31.5V26H19C17.8954 26 17 25.1046 17 24V18Z"
      fill="#f59e0b"
      fillOpacity="0.45"
    />
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M2.5 4.25L6 7.75L9.5 4.25" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CheckmarkIcon = () => (
  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M2.3 6.2L4.9 8.7L9.8 3.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PushNotificationModal = ({ accounts = [], onClose, onSent }) => {
  const normalizedAccounts = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const item of Array.isArray(accounts) ? accounts : [accounts]) {
      const normalized = normalizeAccountItem(item);
      if (normalized && !seen.has(normalized.login)) {
        seen.add(normalized.login);
        list.push(normalized);
      }
    }
    return list;
  }, [accounts]);

  const computeRecipientsForMode = useCallback((mode) => {
    if (mode === 'Group') {
      const groups = [...new Set(normalizedAccounts.map((a) => a.group).filter(Boolean))];
      return groups.join(', ') || normalizedAccounts.map((a) => a.login).join(', ');
    }
    if (mode === 'MetaQuotes ID') {
      const mqids = [...new Set(normalizedAccounts.map((a) => a.mqid).filter(Boolean))];
      return mqids.join(', ') || normalizedAccounts.map((a) => a.login).join(', ');
    }
    if (mode === 'Phone Number') {
      const phones = [...new Set(normalizedAccounts.map((a) => a.phone).filter(Boolean))];
      return phones.join(', ') || normalizedAccounts.map((a) => a.login).join(', ');
    }
    return normalizedAccounts.map((a) => a.login).join(', ');
  }, [normalizedAccounts]);

  const [sendBy, setSendBy] = useState('Login');
  const [recipientsValue, setRecipientsValue] = useState(() => computeRecipientsForMode('Login'));
  const [senderName, setSenderName] = useState('');
  const [sendPushByMqid, setSendPushByMqid] = useState(true);
  const [sendSms, setSendSms] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [sendByOpen, setSendByOpen] = useState(false);

  const textareaRef = useRef(null);
  const selectWrapRef = useRef(null);

  const [winState, setWinState] = useState(() => {
    const width = 540;
    const height = 375;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    return {
      x: Math.max(24, Math.round((vw - width) / 2) - 20),
      y: Math.max(28, Math.round((vh - height) / 2) - 10),
      width,
      height,
    };
  });

  const dragRef = useRef(null);
  const resizeRef = useRef(null);

  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (sendByOpen) {
          setSendByOpen(false);
          return;
        }
        event.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, sendByOpen]);

  useEffect(() => {
    if (!sendByOpen) return undefined;
    const onPointerDown = (event) => {
      if (selectWrapRef.current && !selectWrapRef.current.contains(event.target)) {
        setSendByOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [sendByOpen]);

  useEffect(() => {
    const onMouseMove = (event) => {
      if (dragRef.current) {
        const dx = event.clientX - dragRef.current.startX;
        const dy = event.clientY - dragRef.current.startY;
        setWinState((prev) => ({
          ...prev,
          x: Math.max(0, Math.min(window.innerWidth - 120, dragRef.current.origX + dx)),
          y: Math.max(0, Math.min(window.innerHeight - 60, dragRef.current.origY + dy)),
        }));
      } else if (resizeRef.current) {
        const dx = event.clientX - resizeRef.current.startX;
        const dy = event.clientY - resizeRef.current.startY;
        setWinState((prev) => ({
          ...prev,
          width: Math.max(460, resizeRef.current.origW + dx),
          height: Math.max(340, resizeRef.current.origH + dy),
        }));
      }
    };
    const onMouseUp = () => {
      dragRef.current = null;
      resizeRef.current = null;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const handleTitleMouseDown = (event) => {
    if (event.target.closest('button')) return;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      origX: winState.x,
      origY: winState.y,
    };
  };

  const handleResizeMouseDown = (event) => {
    event.stopPropagation();
    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      origW: winState.width,
      origH: winState.height,
    };
  };

  const recipientTokens = useMemo(
    () =>
      String(recipientsValue || '')
        .split(/[,;\s]+/)
        .map((token) => token.trim())
        .filter(Boolean),
    [recipientsValue]
  );

  const canSend =
    recipientTokens.length > 0 &&
    (sendPushByMqid || sendSms) &&
    messageText.trim().length > 0;

  const handleSelectSendBy = (option) => {
    setSendBy(option);
    setRecipientsValue(computeRecipientsForMode(option));
    setSendByOpen(false);
  };

  const handleSend = () => {
    if (!canSend) return;
    const channels = [
      sendPushByMqid ? 'Push notification' : null,
      sendSms ? 'SMS' : null,
    ].filter(Boolean);

    showResult.success(
      `${channels.join(' & ')} sent to ${recipientTokens.length} recipient(s) (${recipientTokens.slice(0, 4).join(', ')}${recipientTokens.length > 4 ? '...' : ''}).`
    );
    onSent?.({
      sendBy,
      recipients: recipientTokens,
      senderName: senderName.trim(),
      sendPushByMqid,
      sendSms,
      message: messageText.trim(),
    });
    onClose?.();
  };

  const modal = (
    <div className="mt5-notify-backdrop" role="presentation">
      <div
        className="mt5-notify-window"
        role="dialog"
        aria-modal="true"
        aria-label="Notification"
        style={{
          left: `${winState.x}px`,
          top: `${winState.y}px`,
          width: `${winState.width}px`,
          height: `${winState.height}px`,
        }}
      >
        {/* Title Bar */}
        <div className="mt5-notify-titlebar" onMouseDown={handleTitleMouseDown}>
          <div className="mt5-notify-title-left">
            <NotificationTitleEnvelopeIcon />
            <span className="mt5-notify-title-text">Notification</span>
          </div>
          <div className="mt5-notify-title-actions">
            <button
              type="button"
              className="mt5-notify-title-btn"
              title="Help"
              aria-label="Help"
              onClick={() =>
                showResult.info(
                  'Send internal push notifications by MetaQuotes ID and/or SMS messages to selected accounts.'
                )
              }
            >
              ?
            </button>
            <button
              type="button"
              className="mt5-notify-title-btn is-close"
              title="Close"
              aria-label="Close"
              onClick={() => onClose?.()}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Top Description Banner */}
        <div className="mt5-notify-banner">
          <div className="mt5-notify-banner-icon">
            <PhoneSpeechBannerIcon />
          </div>
          <div className="mt5-notify-banner-text">
            Sending internal push notification and/or SMS. You can specify several MetaQuotes IDs separated by a comma.
          </div>
        </div>

        {/* Form Fields */}
        <div className="mt5-notify-form">
          {/* Send by: */}
          <div className="mt5-notify-row">
            <label className="mt5-notify-label">Send by:</label>
            <div className="mt5-notify-select-wrap" ref={selectWrapRef}>
              <button
                type="button"
                className={`mt5-notify-select-trigger${sendByOpen ? ' is-open' : ''}`}
                aria-label="Send by"
                onClick={() => setSendByOpen((prev) => !prev)}
              >
                <span>{sendBy}</span>
                <span className="mt5-notify-select-arrow">
                  <ChevronDownIcon />
                </span>
              </button>
              {sendByOpen && (
                <div className="mt5-notify-dropdown-menu" role="listbox">
                  {SEND_BY_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`mt5-notify-dropdown-option${sendBy === option ? ' is-selected' : ''}`}
                      onClick={() => handleSelectSendBy(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recipients: */}
          <div className="mt5-notify-row">
            <label className="mt5-notify-label" htmlFor="mt5-notify-recipients-input">
              Recipients:
            </label>
            <input
              id="mt5-notify-recipients-input"
              type="text"
              className="mt5-notify-input"
              value={recipientsValue}
              onChange={(event) => setRecipientsValue(event.target.value)}
              spellCheck={false}
            />
            <span className="mt5-notify-count" title="Recipient count">
              {recipientTokens.length}
            </span>
          </div>

          {/* Sender name: */}
          <div className="mt5-notify-row">
            <label className="mt5-notify-label" htmlFor="mt5-notify-sender-input">
              Sender name:
            </label>
            <input
              id="mt5-notify-sender-input"
              type="text"
              className="mt5-notify-input"
              value={senderName}
              onChange={(event) => setSenderName(event.target.value)}
              spellCheck={false}
            />
          </div>

          {/* Checkboxes */}
          <div className="mt5-notify-checkbox-row">
            <label className="mt5-notify-checkbox-label">
              <input
                type="checkbox"
                className="mt5-notify-checkbox-input"
                checked={sendPushByMqid}
                onChange={(event) => setSendPushByMqid(event.target.checked)}
              />
              <span className={`mt5-notify-checkbox-box${sendPushByMqid ? ' is-checked' : ''}`}>
                {sendPushByMqid && <CheckmarkIcon />}
              </span>
              <span>Internal push notification by MetaQuotes ID</span>
            </label>
          </div>

          <div className="mt5-notify-checkbox-row">
            <label className="mt5-notify-checkbox-label">
              <input
                type="checkbox"
                className="mt5-notify-checkbox-input"
                checked={sendSms}
                onChange={(event) => setSendSms(event.target.checked)}
              />
              <span className={`mt5-notify-checkbox-box${sendSms ? ' is-checked' : ''}`}>
                {sendSms && <CheckmarkIcon />}
              </span>
              <span>SMS</span>
            </label>
          </div>
        </div>

        {/* Message Editor */}
        <div className="mt5-notify-editor-wrap">
          <textarea
            ref={textareaRef}
            className="mt5-notify-textarea"
            aria-label="Notification message"
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
          />
          <div className="mt5-notify-scrollbar-rail" aria-hidden="true">
            <button
              type="button"
              className="mt5-notify-scroll-arrow"
              tabIndex={-1}
              onClick={() => {
                if (textareaRef.current) textareaRef.current.scrollTop -= 28;
              }}
            >
              <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                <path d="M4 1L7.5 5H0.5L4 1Z" fill="currentColor" />
              </svg>
            </button>
            <button
              type="button"
              className="mt5-notify-scroll-arrow"
              tabIndex={-1}
              onClick={() => {
                if (textareaRef.current) textareaRef.current.scrollTop += 28;
              }}
            >
              <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                <path d="M4 5L0.5 1H7.5L4 5Z" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="mt5-notify-footer">
          <button
            type="button"
            className="mt5-notify-btn is-primary"
            disabled={!canSend}
            onClick={handleSend}
          >
            Send
          </button>
          <button
            type="button"
            className="mt5-notify-btn"
            onClick={() => onClose?.()}
          >
            Cancel
          </button>
          <span
            className="mt5-notify-resize-grip"
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
  );

  if (typeof document !== 'undefined') {
    const portalTarget =
      document.querySelector('.rtx5-command-shell')
      || document.getElementById('root')
      || document.body;
    return createPortal(modal, portalTarget);
  }
  return modal;
};

export default PushNotificationModal;
