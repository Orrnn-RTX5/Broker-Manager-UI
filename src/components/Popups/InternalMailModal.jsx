import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { showResult } from '../../store/resultDialogStore';
import './InternalMailModal.css';

const SUBJECT_PRESETS = [
  'Welcome to Trading Platform',
  'Margin Call Notification',
  'Account Verification Required',
  'Important Account Update',
  'Monthly Statement',
];

const MAIL_TEMPLATES = [
  { value: 'default', label: 'default', subject: '', body: '' },
  {
    value: 'welcome',
    label: 'welcome',
    subject: 'Welcome to Trading Platform',
    body: 'Dear Client,\n\nYour trading account is ready. Please keep your login credentials secure.\n\nBest regards,\nBrokerage Support',
  },
  {
    value: 'margin_call',
    label: 'margin_call',
    subject: 'Margin Call Notification',
    body: 'Dear Client,\n\nYour account margin level requires attention. Please review your open positions or deposit additional funds.\n\nBest regards,\nRisk Management',
  },
  {
    value: 'verification',
    label: 'verification',
    subject: 'Account Verification Required',
    body: 'Dear Client,\n\nPlease complete your profile and verification documents at your earliest convenience.\n\nBest regards,\nCompliance Team',
  },
  {
    value: 'statement',
    label: 'statement',
    subject: 'Monthly Statement',
    body: 'Dear Client,\n\nYour account statement has been generated and is available for review.\n\nBest regards,\nBrokerage Operations',
  },
];

const MAIL_SERVERS = [
  'Default SMTP Server',
  'Transactional Mail Server',
];

const FONT_FAMILIES = [
  'Default font',
  'Segoe UI',
  'Tahoma',
  'Arial',
  'Verdana',
  'Consolas',
  'Times New Roman',
];

const FONT_SIZES = ['Size', '8', '9', '10', '11', '12', '14', '16', '18', '24'];

const normalizeRecipientAccount = (acc) => {
  if (!acc) return null;
  const isPrimitive = typeof acc === 'string' || typeof acc === 'number';
  const login = String(isPrimitive ? acc : (acc.login ?? acc.Login ?? acc.id ?? '')).trim();
  if (!login) return null;
  const email = isPrimitive
    ? ''
    : String(acc.email ?? acc.Email ?? acc.raw?.Email ?? acc.raw?.email ?? '').trim();
  const name = isPrimitive
    ? ''
    : String(acc.name ?? acc.Name ?? acc.raw?.Name ?? '').trim();
  return { login, email, name };
};

const MailTitleEnvelopeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="1.5" y="3" width="13" height="10" rx="1.2" stroke="#f59e0b" strokeWidth="1.3" fill="none" />
    <path d="M2 3.8L8 8.3L14 3.8" stroke="#f59e0b" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M2.5 4.25L6 7.75L9.5 4.25" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const InternalMailModal = ({ accounts = [], onClose, onSent }) => {
  const recipients = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const item of Array.isArray(accounts) ? accounts : [accounts]) {
      const normalized = normalizeRecipientAccount(item);
      if (normalized && !seen.has(normalized.login)) {
        seen.add(normalized.login);
        list.push(normalized);
      }
    }
    return list;
  }, [accounts]);

  const initialToValue = useMemo(
    () => recipients.map((r) => r.login).join(', '),
    [recipients]
  );

  const [toValue, setToValue] = useState(initialToValue);
  const [subjectValue, setSubjectValue] = useState('');
  const [templateValue, setTemplateValue] = useState('default');
  const [sendAsEmail, setSendAsEmail] = useState(false);
  const [mailServer, setMailServer] = useState('');
  const [fontFamily, setFontFamily] = useState('Default font');
  const [fontSize, setFontSize] = useState('Size');
  const [openMenu, setOpenMenu] = useState(null); // 'subject' | 'template' | 'server' | null
  const [attachments, setAttachments] = useState([]);

  const toInputRef = useRef(null);
  const editorRef = useRef(null);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const formRef = useRef(null);

  const initialWidth = 688;
  const initialHeight = 446;
  const [size, setSize] = useState({ width: initialWidth, height: initialHeight });
  const [position, setPosition] = useState(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    return {
      x: Math.max(16, Math.round((vw - initialWidth) / 2)),
      y: Math.max(36, Math.round((vh - initialHeight) / 2)),
    };
  });

  useEffect(() => {
    const input = toInputRef.current;
    if (input) {
      input.focus();
      input.select();
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (openMenu) {
          event.preventDefault();
          setOpenMenu(null);
          return;
        }
        event.preventDefault();
        onClose?.();
      }
    };
    const onMouseDownOutside = (event) => {
      if (formRef.current && !formRef.current.contains(event.target)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onMouseDownOutside);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onMouseDownOutside);
    };
  }, [onClose, openMenu]);

  const recipientCount = useMemo(() => {
    const tokens = String(toValue || '')
      .split(/[,;\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    return tokens.length;
  }, [toValue]);

  const execEditorCommand = useCallback((cmd, value = null) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    try {
      if (typeof document.execCommand === 'function') {
        document.execCommand(cmd, false, value);
      }
    } catch {
      // Ignore unsupported execCommand in test environments
    }
  }, []);

  const handleSelectTemplate = useCallback((tpl) => {
    setTemplateValue(tpl.value);
    setOpenMenu(null);
    if (tpl.subject) {
      setSubjectValue(tpl.subject);
    }
    if (tpl.body && editorRef.current) {
      editorRef.current.innerText = tpl.body;
    }
  }, []);

  const handleSend = useCallback(() => {
    const tokens = String(toValue || '')
      .split(/[,;\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (tokens.length === 0) {
      showResult.error('Please specify at least one recipient login in the "To:" field.');
      toInputRef.current?.focus();
      return;
    }

    const bodyText = String(editorRef.current?.innerText || '').trim();
    const finalSubject = String(subjectValue || '').trim() || `(No subject)`;
    const modeLabel = sendAsEmail ? 'Email' : 'Internal mail';

    showResult.success(
      `${modeLabel} "${finalSubject}" queued for ${tokens.length} account(s): ${tokens.join(', ')}.`,
      { title: 'Mail' }
    );
    onSent?.({
      to: tokens,
      subject: finalSubject,
      template: templateValue,
      sendAsEmail,
      mailServer: sendAsEmail ? (mailServer || MAIL_SERVERS[0]) : '',
      body: bodyText,
      attachments,
    });
    onClose?.();
  }, [attachments, mailServer, onClose, onSent, sendAsEmail, subjectValue, templateValue, toValue]);

  const handleTitleMouseDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest('button')) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const origX = position.x;
    const origY = position.y;

    const onMove = (moveEvent) => {
      const nextX = Math.max(8, Math.min(window.innerWidth - size.width - 8, origX + (moveEvent.clientX - startX)));
      const nextY = Math.max(8, Math.min(window.innerHeight - size.height - 8, origY + (moveEvent.clientY - startY)));
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
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const origW = size.width;
    const origH = size.height;

    const onMove = (moveEvent) => {
      setSize({
        width: Math.max(580, origW + (moveEvent.clientX - startX)),
        height: Math.max(340, origH + (moveEvent.clientY - startY)),
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
    <div className="mt5-mail-backdrop">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mail"
        className="mt5-mail-window"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${size.width}px`,
          height: `${size.height}px`,
        }}
      >
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setAttachments((prev) => [...prev, file.name]);
            if (editorRef.current) {
              editorRef.current.innerText = `${editorRef.current.innerText || ''}\n[Image: ${file.name}]`.trim();
            }
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setAttachments((prev) => [...prev, file.name]);
            if (editorRef.current) {
              editorRef.current.innerText = `${editorRef.current.innerText || ''}\n[Attachment: ${file.name}]`.trim();
            }
          }}
        />

        {/* Title Bar */}
        <div className="mt5-mail-titlebar" onMouseDown={handleTitleMouseDown}>
          <div className="mt5-mail-title-left">
            <MailTitleEnvelopeIcon />
            <span className="mt5-mail-title-text">Mail</span>
          </div>
          <div className="mt5-mail-title-actions">
            <button
              type="button"
              className="mt5-mail-title-btn"
              title="Help"
              aria-label="Help"
              onClick={() =>
                showResult.info(
                  'Enter recipient logins in To:, specify a Subject and message body, then click Send.',
                  { title: 'Mail Help' }
                )
              }
            >
              ?
            </button>
            <button
              type="button"
              className="mt5-mail-title-btn is-close"
              title="Close"
              aria-label="Close"
              onClick={() => onClose?.()}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Form Header */}
        <div className="mt5-mail-form" ref={formRef}>
          {/* Row 1: To */}
          <div className="mt5-mail-row">
            <label htmlFor="mt5-mail-to" className="mt5-mail-label">
              To:
            </label>
            <input
              ref={toInputRef}
              id="mt5-mail-to"
              type="text"
              className="mt5-mail-input mt5-mail-to-input"
              value={toValue}
              onChange={(e) => setToValue(e.target.value)}
            />
            <span className="mt5-mail-recipient-count" aria-label="Recipient count">
              {recipientCount}
            </span>
          </div>

          {/* Row 2: Subject */}
          <div className="mt5-mail-row">
            <label htmlFor="mt5-mail-subject" className="mt5-mail-label">
              Subject:
            </label>
            <div className="mt5-mail-combo">
              <input
                id="mt5-mail-subject"
                type="text"
                className="mt5-mail-combo-input"
                value={subjectValue}
                onChange={(e) => setSubjectValue(e.target.value)}
              />
              <button
                type="button"
                className="mt5-mail-combo-toggle"
                aria-label="Subject presets"
                onClick={() => setOpenMenu((prev) => (prev === 'subject' ? null : 'subject'))}
              >
                <ChevronDownIcon />
              </button>
              {openMenu === 'subject' && (
                <ul className="mt5-mail-dropdown-menu" role="listbox" aria-label="Subject presets">
                  {SUBJECT_PRESETS.map((preset) => (
                    <li key={preset} role="option" aria-selected={subjectValue === preset}>
                      <button
                        type="button"
                        className={`mt5-mail-dropdown-option${subjectValue === preset ? ' is-active' : ''}`}
                        onClick={() => {
                          setSubjectValue(preset);
                          setOpenMenu(null);
                        }}
                      >
                        {preset}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Row 3: Template + Mail server + Send */}
          <div className="mt5-mail-row">
            <label className="mt5-mail-label">Template:</label>
            <div className="mt5-mail-dropdown">
              <button
                type="button"
                className="mt5-mail-dropdown-trigger"
                aria-haspopup="listbox"
                aria-expanded={openMenu === 'template'}
                onClick={() => setOpenMenu((prev) => (prev === 'template' ? null : 'template'))}
              >
                <span>{templateValue}</span>
                <ChevronDownIcon />
              </button>
              {openMenu === 'template' && (
                <ul className="mt5-mail-dropdown-menu" role="listbox" aria-label="Template">
                  {MAIL_TEMPLATES.map((tpl) => (
                    <li key={tpl.value} role="option" aria-selected={templateValue === tpl.value}>
                      <button
                        type="button"
                        className={`mt5-mail-dropdown-option${templateValue === tpl.value ? ' is-active' : ''}`}
                        onClick={() => handleSelectTemplate(tpl)}
                      >
                        {tpl.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <label className="mt5-mail-label-inline">Mail server:</label>
            <div className="mt5-mail-dropdown">
              <button
                type="button"
                className="mt5-mail-dropdown-trigger"
                disabled={!sendAsEmail}
                aria-haspopup="listbox"
                aria-expanded={openMenu === 'server'}
                onClick={() => {
                  if (!sendAsEmail) return;
                  setOpenMenu((prev) => (prev === 'server' ? null : 'server'));
                }}
              >
                <span>{sendAsEmail ? (mailServer || MAIL_SERVERS[0]) : ''}</span>
                <ChevronDownIcon />
              </button>
              {openMenu === 'server' && sendAsEmail && (
                <ul className="mt5-mail-dropdown-menu" role="listbox" aria-label="Mail server">
                  {MAIL_SERVERS.map((srv) => (
                    <li key={srv} role="option" aria-selected={mailServer === srv}>
                      <button
                        type="button"
                        className={`mt5-mail-dropdown-option${mailServer === srv ? ' is-active' : ''}`}
                        onClick={() => {
                          setMailServer(srv);
                          setOpenMenu(null);
                        }}
                      >
                        {srv}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="button"
              className="mt5-mail-send-btn"
              onClick={handleSend}
            >
              Send
            </button>
          </div>

          {/* Row 4: Email checkbox */}
          <label className="mt5-mail-checkbox-row">
            <input
              type="checkbox"
              className="mt5-mail-checkbox"
              checked={sendAsEmail}
              onChange={(e) => {
                const next = e.target.checked;
                setSendAsEmail(next);
                if (next && !mailServer) {
                  setMailServer(MAIL_SERVERS[0]);
                }
              }}
            />
            <span>Email</span>
          </label>
        </div>

        {/* Rich Text Formatting Toolbar */}
        <div className="mt5-mail-toolbar" role="toolbar" aria-label="Formatting toolbar">
          <select
            aria-label="Font family"
            className="mt5-mail-toolbar-select is-font"
            value={fontFamily}
            onChange={(e) => {
              const val = e.target.value;
              setFontFamily(val);
              if (val !== 'Default font') {
                execEditorCommand('fontName', val);
              }
            }}
          >
            {FONT_FAMILIES.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>

          <select
            aria-label="Font size"
            className="mt5-mail-toolbar-select is-size"
            value={fontSize}
            onChange={(e) => {
              const val = e.target.value;
              setFontSize(val);
              if (val !== 'Size' && editorRef.current) {
                editorRef.current.style.fontSize = `${val}px`;
              }
            }}
          >
            {FONT_SIZES.map((sz) => (
              <option key={sz} value={sz}>
                {sz}
              </option>
            ))}
          </select>

          {/* Undo & Redo */}
          <button
            type="button"
            className="mt5-mail-tool-btn"
            title="Undo"
            aria-label="Undo"
            onClick={() => execEditorCommand('undo')}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M5.5 4.5L2.5 7.5L5.5 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 7.5H10C12.2 7.5 13.5 9 13.5 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className="mt5-mail-tool-btn"
            title="Redo"
            aria-label="Redo"
            onClick={() => execEditorCommand('redo')}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M10.5 4.5L13.5 7.5L10.5 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13 7.5H6C3.8 7.5 2.5 9 2.5 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>

          <span className="mt5-mail-toolbar-sep" aria-hidden="true" />

          {/* Lists & Indentation */}
          <button
            type="button"
            className="mt5-mail-tool-btn"
            title="Bulleted list"
            aria-label="Bulleted list"
            onClick={() => execEditorCommand('insertUnorderedList')}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="3" cy="4.5" r="1" fill="currentColor" />
              <circle cx="3" cy="8" r="1" fill="currentColor" />
              <circle cx="3" cy="11.5" r="1" fill="currentColor" />
              <line x1="6" y1="4.5" x2="13.5" y2="4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <line x1="6" y1="8" x2="13.5" y2="8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <line x1="6" y1="11.5" x2="13.5" y2="11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className="mt5-mail-tool-btn"
            title="Numbered list"
            aria-label="Numbered list"
            onClick={() => execEditorCommand('insertOrderedList')}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <text x="1.8" y="6" fill="currentColor" fontSize="5.2" fontFamily="Segoe UI, sans-serif">1</text>
              <text x="1.8" y="10" fill="currentColor" fontSize="5.2" fontFamily="Segoe UI, sans-serif">2</text>
              <text x="1.8" y="14" fill="currentColor" fontSize="5.2" fontFamily="Segoe UI, sans-serif">3</text>
              <line x1="6" y1="4.5" x2="13.5" y2="4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <line x1="6" y1="8" x2="13.5" y2="8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <line x1="6" y1="11.5" x2="13.5" y2="11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className="mt5-mail-tool-btn"
            title="Decrease indent"
            aria-label="Decrease indent"
            onClick={() => execEditorCommand('outdent')}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M5 5.5L2.5 8L5 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="7.5" y1="4" x2="13.5" y2="4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <line x1="7.5" y1="8" x2="13.5" y2="8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <line x1="7.5" y1="12" x2="13.5" y2="12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className="mt5-mail-tool-btn"
            title="Increase indent"
            aria-label="Increase indent"
            onClick={() => execEditorCommand('indent')}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2.5 5.5L5 8L2.5 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="7.5" y1="4" x2="13.5" y2="4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <line x1="7.5" y1="8" x2="13.5" y2="8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <line x1="7.5" y1="12" x2="13.5" y2="12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>

          <span className="mt5-mail-toolbar-sep" aria-hidden="true" />

          {/* Media, Attachments, Links, Table */}
          <button
            type="button"
            className="mt5-mail-tool-btn"
            title="Insert image"
            aria-label="Insert image"
            onClick={() => imageInputRef.current?.click()}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2.5" width="12" height="11" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="5.5" cy="6" r="1.1" fill="currentColor" />
              <path d="M2.5 11.8L6 8.5L9 11L11 9.2L13.5 11.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className="mt5-mail-tool-btn"
            title="Attach file"
            aria-label="Attach file"
            onClick={() => fileInputRef.current?.click()}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M9.8 4.5L5.2 9.1C4.4 9.9 4.4 11.1 5.2 11.9C6 12.7 7.2 12.7 8 11.9L12.8 7.1C14 5.9 14 3.9 12.8 2.7C11.6 1.5 9.6 1.5 8.4 2.7L3.6 7.5C2 9.1 2 11.7 3.6 13.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className="mt5-mail-tool-btn"
            title="Insert link"
            aria-label="Insert link"
            onClick={() => execEditorCommand('createLink', 'https://')}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M6.8 9.2L9.2 6.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M5.5 7.2L4 8.7C2.9 9.8 2.9 11.5 4 12.6C5.1 13.7 6.8 13.7 7.9 12.6L9.4 11.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M10.5 8.8L12 7.3C13.1 6.2 13.1 4.5 12 3.4C10.9 2.3 9.2 2.3 8.1 3.4L6.6 4.9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className="mt5-mail-tool-btn"
            title="Insert table"
            aria-label="Insert table"
            onClick={() => {
              if (editorRef.current) {
                editorRef.current.focus();
                editorRef.current.innerText = `${editorRef.current.innerText || ''}\n| Column 1 | Column 2 |\n| --- | --- |\n`.trimStart();
              }
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2.5" width="12" height="11" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
              <line x1="2" y1="6.2" x2="14" y2="6.2" stroke="currentColor" strokeWidth="1.1" />
              <line x1="2" y1="9.8" x2="14" y2="9.8" stroke="currentColor" strokeWidth="1.1" />
              <line x1="6" y1="2.5" x2="6" y2="13.5" stroke="currentColor" strokeWidth="1.1" />
              <line x1="10" y1="2.5" x2="10" y2="13.5" stroke="currentColor" strokeWidth="1.1" />
            </svg>
          </button>

          <span className="mt5-mail-toolbar-sep" aria-hidden="true" />

          {/* Text Style: Bold, Italic, Underline, Color */}
          <button
            type="button"
            className="mt5-mail-tool-btn"
            title="Bold"
            aria-label="Bold"
            onClick={() => execEditorCommand('bold')}
          >
            <span style={{ fontWeight: 700, fontSize: 12 }}>B</span>
          </button>
          <button
            type="button"
            className="mt5-mail-tool-btn"
            title="Italic"
            aria-label="Italic"
            onClick={() => execEditorCommand('italic')}
          >
            <span style={{ fontStyle: 'italic', fontFamily: 'Georgia, serif', fontSize: 12 }}>I</span>
          </button>
          <button
            type="button"
            className="mt5-mail-tool-btn"
            title="Underline"
            aria-label="Underline"
            onClick={() => execEditorCommand('underline')}
          >
            <span style={{ textDecoration: 'underline', fontSize: 12 }}>U</span>
          </button>
          <button
            type="button"
            className="mt5-mail-tool-btn"
            title="Text color"
            aria-label="Text color"
            onClick={() => execEditorCommand('foreColor', '#60a5fa')}
          >
            <span style={{ fontWeight: 600, fontSize: 12 }}>A</span>
          </button>
        </div>

        {/* Message Body Editor + Right Scrollbar Rail */}
        <div className="mt5-mail-editor-wrap">
          <div
            ref={editorRef}
            className="mt5-mail-editor"
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label="Mail message body"
          />
          <div className="mt5-mail-scrollbar-rail" aria-hidden="true">
            <button
              type="button"
              tabIndex={-1}
              className="mt5-mail-scroll-arrow"
              onClick={() => {
                if (editorRef.current) editorRef.current.scrollTop -= 24;
              }}
            >
              ▲
            </button>
            <div className="mt5-mail-scroll-thumb" />
            <button
              type="button"
              tabIndex={-1}
              className="mt5-mail-scroll-arrow"
              onClick={() => {
                if (editorRef.current) editorRef.current.scrollTop += 24;
              }}
            >
              ▼
            </button>
          </div>
          <span
            className="mt5-mail-resize-grip"
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
    return createPortal(modalNode, portalTarget);
  }
  return modalNode;
};

export default InternalMailModal;
