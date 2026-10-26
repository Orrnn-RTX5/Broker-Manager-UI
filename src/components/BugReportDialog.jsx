import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Copy, FileText, Image as ImageIcon, Loader2, Paperclip, X } from 'lucide-react';

import {
  CATEGORY_LABELS,
  MAX_ATTACHMENTS,
  MAX_FILE_BYTES,
  SEVERITY_LABELS,
  buildReportSubmittedNotice,
  fetchBugReportOptions,
  submitBugReport,
  validateAttachment,
} from '../services/bugReportService';
import { getBrokerInfo } from '../services/brokerAuth.js';
import './BugReportDialog.css';

// Kept low on purpose, and matched by the control plane. The first live test
// reports ("check", "check ing") were blocked by a 10-character minimum the
// form never mentioned; only an empty-ish field is worth refusing.
const MIN_TITLE_LENGTH = 3;
const MIN_DESCRIPTION_LENGTH = 3;
const EMPTY_FORM = {
  title: '',
  description: '',
  category: 'other',
  severity: 'medium',
  steps: '',
  expected: '',
  actual: '',
};

const labelClass = 'bug-report-label';
const fieldClass = 'bug-report-field';

/**
 * Report a Bug.
 *
 * The form asks for the minimum a reader needs to reproduce a fault, and
 * collects the technical context automatically rather than making the reporter
 * describe their own browser. Everything beyond title and description sits
 * behind a disclosure, so filing a quick report stays quick.
 */
export default function BugReportDialog({ onClose, onSubmitted, page = '' }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [attachments, setAttachments] = useState([]);
  const [options, setOptions] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef(null);
  const dialogRef = useRef(null);
  const returnFocusRef = useRef(typeof document !== 'undefined' ? document.activeElement : null);

  useEffect(() => {
    let active = true;
    fetchBugReportOptions()
      .then((loaded) => { if (active) setOptions(loaded); })
      .catch(() => { if (active) setOptions({ enabled: true }); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const focusNode = returnFocusRef.current;
    dialogRef.current?.querySelector('#bug-title')?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !submitting) {
        event.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      focusNode?.focus?.();
    };
  }, [onClose, submitting]);

  const addFiles = useCallback((incoming) => {
    const candidates = Array.from(incoming || []);
    if (!candidates.length) return;
    setError(null);
    setAttachments((current) => {
      const next = [...current];
      for (const file of candidates) {
        if (next.length >= MAX_ATTACHMENTS) {
          setError(`At most ${MAX_ATTACHMENTS} attachments`);
          break;
        }
        const problem = validateAttachment(file);
        if (problem) { setError(problem); continue; }
        next.push(file);
      }
      return next;
    });
  }, []);

  // Paste-to-attach. Most people take a screenshot with the OS shortcut and
  // have it on the clipboard already; asking them to save it to disk first is
  // the step that stops reports being filed.
  const onPaste = (event) => {
    if (submitting) return;
    const items = Array.from(event.clipboardData?.items || []);
    const images = items.filter((item) => item.kind === 'file' && item.type.startsWith('image/'));
    if (!images.length) return;
    event.preventDefault();
    addFiles(images.map((item, index) => {
      const blob = item.getAsFile();
      if (!blob) return null;
      const extension = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
      return new File([blob], `pasted-${Date.now()}-${index}.${extension}`, { type: blob.type });
    }).filter(Boolean));
  };

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const titleLength = form.title.trim().length;
  const descriptionLength = form.description.trim().length;
  const titleReady = titleLength >= MIN_TITLE_LENGTH;
  const descriptionReady = descriptionLength >= MIN_DESCRIPTION_LENGTH;
  const canSubmit = titleReady && descriptionReady && !submitting;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitBugReport({ form: { ...form, page }, attachments });
      setReceipt(result);
      onSubmitted?.(result, form);
    } catch (submitError) {
      setError(submitError?.message || 'The report could not be submitted');
    } finally {
      setSubmitting(false);
    }
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(receipt.report_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable; the id is on screen to read */ }
  };

  const storageDisabled = options && options.enabled === false;

  // Per-broker support contact merged from the broker config (see brokerAuth
  // fetchBrokerConfig); falls back to vendor-free generic wording when absent.
  // Captured once so typing in the form does not re-read session storage.
  const [brokerInfo] = useState(() => getBrokerInfo());
  const supportNotice = buildReportSubmittedNotice(brokerInfo);

  const dialogNode = (
    <>
      <div className="bug-report-overlay" aria-hidden="true" onClick={!submitting ? onClose : undefined} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bug-report-dialog-title"
        tabIndex={-1}
        className="bug-report-dialog"
        onPaste={onPaste}
      >
        <header className="bug-report-header">
          <div className="bug-report-heading">
            <div className="bug-report-title-row">
              <h2 id="bug-report-dialog-title" className="bug-report-title">Report a bug</h2>
            </div>
          </div>
          <div className="bug-report-header-meta">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              aria-label="Close report dialog"
              className="bug-report-icon-button bug-report-close-button"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        </header>

        {receipt ? (
          <div className="bug-report-receipt">
            <div className="bug-report-receipt-icon">
              <Check size={20} aria-hidden="true" />
            </div>
            <h3>Bug report submitted</h3>
            <p className="bug-report-help">
              {supportNotice}
            </p>
            <div className="bug-report-reference">
              <code>{receipt.report_id}</code>
              <button type="button" onClick={copyId} aria-label="Copy report id" className="bug-report-icon-button">
                {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
              </button>
            </div>
            {receipt.failed_attachments?.length ? (
              <p className="bug-report-notice bug-report-notice--warning" role="status">
                The report was filed, but {receipt.failed_attachments.length} attachment
                {receipt.failed_attachments.length === 1 ? '' : 's'} could not be uploaded.
              </p>
            ) : null}
            <div className="bug-report-receipt-action">
              <button type="button" onClick={onClose} className="bug-report-button">
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bug-report-form">
            <div className="bug-report-body">
              {storageDisabled ? (
                <p className="bug-report-notice bug-report-notice--warning" role="status">
                  Bug reporting is not configured on this server yet. Submitting will not work until an administrator enables it.
                </p>
              ) : null}

              <div className="bug-report-form-group">
                <label className={labelClass} htmlFor="bug-title">
                  <span className="bug-report-label-text">
                    Title <span className="bug-report-required-star" aria-hidden="true">*</span>
                  </span>
                </label>
                <input
                  id="bug-title"
                  className={fieldClass}
                  value={form.title}
                  onChange={update('title')}
                  placeholder="Order rejected although the quote is live"
                  maxLength={200}
                  required
                  disabled={submitting}
                />
              </div>

              <div className="bug-report-form-group">
                <label className={labelClass} htmlFor="bug-description">
                  <span className="bug-report-label-text">
                    What happened? <span className="bug-report-required-star" aria-hidden="true">*</span>
                  </span>
                </label>
                <textarea
                  id="bug-description"
                  className={`${fieldClass} bug-report-description`}
                  value={form.description}
                  onChange={update('description')}
                  placeholder="Describe what you were doing and what went wrong."
                  maxLength={8000}
                  required
                  disabled={submitting}
                />
              </div>

              <div className="bug-report-columns">
                <div className="bug-report-form-group">
                  <label className={labelClass} htmlFor="bug-category">
                    <span className="bug-report-label-text">Area</span>
                  </label>
                  <div className="bug-report-select-wrap">
                    <select
                      id="bug-category"
                      className={fieldClass}
                      value={form.category}
                      onChange={update('category')}
                      disabled={submitting}
                    >
                      {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="bug-report-select-chevron" aria-hidden="true" />
                  </div>
                </div>

                <div className="bug-report-form-group">
                  <label className={labelClass} htmlFor="bug-severity">
                    <span className="bug-report-label-text">Severity</span>
                  </label>
                  <div className="bug-report-select-wrap">
                    <select
                      id="bug-severity"
                      className={fieldClass}
                      value={form.severity}
                      onChange={update('severity')}
                      disabled={submitting}
                    >
                      {Object.entries(SEVERITY_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="bug-report-select-chevron" aria-hidden="true" />
                  </div>
                </div>
              </div>

              <section className="bug-report-attachments" aria-labelledby="bug-attachments-title">
                <div className="bug-report-section-heading">
                  <h3 id="bug-attachments-title">
                    Screenshots and logs <span className="bug-report-optional-inline">(Optional)</span>
                  </h3>
                  <span className="bug-report-counter-pill">
                    {attachments.length}/{MAX_ATTACHMENTS} files
                  </span>
                </div>
                <div className="bug-report-upload-row">
                  <div className="bug-report-upload-copy">
                    <div className="bug-report-upload-text">
                      <p className="bug-report-upload-primary">Attach a file or paste a screenshot (Ctrl+V)</p>
                      <p className="bug-report-help">
                        PNG, JPG, WebP, TXT or LOG · Up to {MAX_FILE_BYTES / (1024 * 1024)} MB each
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={submitting || attachments.length >= MAX_ATTACHMENTS}
                    className="bug-report-button bug-report-attach-btn"
                  >
                    <Paperclip size={12} aria-hidden="true" /> Attach file
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  hidden
                  disabled={submitting}
                  accept="image/png,image/jpeg,image/webp,text/plain,.log,.txt"
                  onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }}
                />
                {attachments.length ? (
                  <ul className="bug-report-file-list">
                    {attachments.map((file, index) => (
                      <li key={`${file.name}-${index}`}>
                        <span className="bug-report-file-name">
                          {file.type.startsWith('image/') ? (
                            <ImageIcon size={13} aria-hidden="true" />
                          ) : (
                            <FileText size={13} aria-hidden="true" />
                          )}
                          <span title={file.name}>{file.name}</span>
                        </span>
                        <span className="bug-report-file-size">{Math.max(1, Math.round(file.size / 1024))} KB</span>
                        <button
                          type="button"
                          aria-label={`Remove ${file.name}`}
                          onClick={() => {
                            setAttachments((current) => current.filter((_, i) => i !== index));
                            setError(null);
                          }}
                          disabled={submitting}
                          className="bug-report-icon-button"
                        >
                          <X size={13} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <div className={`bug-report-accordion ${showDetails ? 'bug-report-accordion--open' : ''}`}>
                <button
                  type="button"
                  onClick={() => setShowDetails((value) => !value)}
                  className="bug-report-disclosure"
                  aria-expanded={showDetails}
                  aria-controls="bug-reproduction-details"
                  disabled={submitting}
                >
                  <span className="bug-report-disclosure-copy">
                    <span className="bug-report-disclosure-label">
                      <span className="bug-report-disclosure-title">
                        Reproduction details <span className="bug-report-optional-inline">(Optional)</span>
                      </span>
                    </span>
                  </span>
                  <span className="bug-report-disclosure-chevron">
                    <ChevronDown size={14} aria-hidden="true" />
                  </span>
                </button>

                {showDetails ? (
                  <div id="bug-reproduction-details" className="bug-report-details">
                    <div className="bug-report-form-group">
                      <label className={labelClass} htmlFor="bug-steps">
                        <span className="bug-report-label-text">
                          Steps to reproduce <span className="bug-report-optional-inline">(Optional)</span>
                        </span>
                      </label>
                      <textarea
                        id="bug-steps"
                        className={fieldClass}
                        value={form.steps}
                        onChange={update('steps')}
                        placeholder={'1. Open EURUSD\n2. Click Buy\n3. Order is rejected'}
                        disabled={submitting}
                      />
                    </div>
                    <div className="bug-report-columns">
                      <div className="bug-report-form-group">
                        <label className={labelClass} htmlFor="bug-expected">
                          <span className="bug-report-label-text">
                            Expected <span className="bug-report-optional-inline">(Optional)</span>
                          </span>
                        </label>
                        <textarea
                          id="bug-expected"
                          className={fieldClass}
                          value={form.expected}
                          onChange={update('expected')}
                          placeholder="What should happen?"
                          disabled={submitting}
                        />
                      </div>
                      <div className="bug-report-form-group">
                        <label className={labelClass} htmlFor="bug-actual">
                          <span className="bug-report-label-text">
                            Actual <span className="bug-report-optional-inline">(Optional)</span>
                          </span>
                        </label>
                        <textarea
                          id="bug-actual"
                          className={fieldClass}
                          value={form.actual}
                          onChange={update('actual')}
                          placeholder="What happened instead?"
                          disabled={submitting}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {error ? (
                <p role="alert" className="bug-report-notice bug-report-notice--error">{error}</p>
              ) : null}
            </div>

            <footer className="bug-report-footer">
              <div className="bug-report-actions">
                <button type="button" onClick={onClose} disabled={submitting} className="bug-report-button">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="bug-report-button bug-report-button--primary"
                >
                  {submitting && <Loader2 size={13} className="bug-report-spinner" aria-hidden="true" />}
                  {submitting ? 'Submitting…' : 'Submit report'}
                </button>
              </div>
            </footer>
          </form>
        )}
      </div>
    </>
  );

  return typeof document !== 'undefined' ? createPortal(dialogNode, document.body) : dialogNode;
}
