import { useCallback, useEffect, useRef, useState } from 'react';
import { Bug, Check, Copy, Image as ImageIcon, Paperclip, X } from 'lucide-react';

import {
  CATEGORY_LABELS,
  MAX_ATTACHMENTS,
  SEVERITY_LABELS,
  fetchBugReportOptions,
  submitBugReport,
  validateAttachment,
} from '../services/bugReportService';

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

const labelClass = 'block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-2)] mb-1';
const fieldClass = 'w-full bg-[var(--surface-2)] border border-[var(--border)] px-2 py-1.5 text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)]';

/**
 * Report a Bug.
 *
 * The form asks for the minimum a reader needs to reproduce a fault, and
 * collects the technical context automatically rather than making the reporter
 * describe their own browser. Everything beyond title and description sits
 * behind a disclosure, so filing a quick report stays quick.
 */
export default function BugReportDialog({ onClose }) {
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

  useEffect(() => {
    let active = true;
    fetchBugReportOptions()
      .then((loaded) => { if (active) setOptions(loaded); })
      .catch(() => { if (active) setOptions({ enabled: true }); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape' && !submitting) onClose?.(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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
  useEffect(() => {
    const onPaste = (event) => {
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
    const node = dialogRef.current;
    node?.addEventListener('paste', onPaste);
    return () => node?.removeEventListener('paste', onPaste);
  }, [addFiles]);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const titleLength = form.title.trim().length;
  const descriptionLength = form.description.trim().length;
  const canSubmit = titleLength >= MIN_TITLE_LENGTH && descriptionLength >= MIN_DESCRIPTION_LENGTH && !submitting;
  // A disabled button with no reason is what stopped the first reports.
  const submitHint = titleLength < MIN_TITLE_LENGTH
      ? `Add a title (at least ${MIN_TITLE_LENGTH} characters) to send the report.`
      : descriptionLength < MIN_DESCRIPTION_LENGTH
          ? `Describe what happened (at least ${MIN_DESCRIPTION_LENGTH} characters) to send the report.`
          : '';

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitBugReport({ form, attachments });
      setReceipt(result);
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

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/60 p-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Report a bug"
        tabIndex={-1}
        className="w-full max-w-[640px] border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Bug size={15} aria-hidden="true" className="text-[var(--accent)]" />
            <h2 className="text-[13px] font-semibold text-[var(--text)]">Report a Bug</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[var(--text-3)] hover:text-[var(--text)]">
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        {receipt ? (
          <div className="px-5 py-8 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
              <Check size={20} aria-hidden="true" />
            </div>
            <p className="text-[13px] font-semibold text-[var(--text)]">Bug report submitted</p>
            <p className="mt-1 text-[11px] text-[var(--text-2)]">
              The RTX5 platform team can see this report. Quote this reference if you follow it up.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
              <code className="font-mono text-[12px] text-[var(--text)]">{receipt.report_id}</code>
              <button type="button" onClick={copyId} aria-label="Copy report id" className="text-[var(--text-3)] hover:text-[var(--text)]">
                {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
              </button>
            </div>
            {receipt.failed_attachments?.length ? (
              <p className="mt-3 text-[11px] text-amber-400">
                The report was filed, but {receipt.failed_attachments.length} attachment
                {receipt.failed_attachments.length === 1 ? '' : 's'} could not be uploaded.
              </p>
            ) : null}
            <div className="mt-5">
              <button type="button" onClick={onClose} className="border border-[var(--border)] bg-[var(--surface-2)] px-4 py-1.5 text-[12px] text-[var(--text)] hover:bg-[var(--surface-3)]">
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="max-h-[70vh] overflow-y-auto px-5 py-4">
            {storageDisabled ? (
              <p className="mb-3 border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                Bug reporting is not configured on this server yet. Submitting will not work until an administrator enables it.
              </p>
            ) : null}

            <div className="mb-3">
              <label className={labelClass} htmlFor="bug-title">Title</label>
              <input
                id="bug-title" className={fieldClass} value={form.title} onChange={update('title')}
                placeholder="Order rejected although the quote is live" maxLength={200} required
              />
            </div>

            <div className="mb-3">
              <label className={labelClass} htmlFor="bug-description">What happened?</label>
              <textarea
                id="bug-description" className={`${fieldClass} min-h-[96px] resize-y`}
                value={form.description} onChange={update('description')}
                placeholder="Describe what you were doing and what went wrong." maxLength={8000} required
              />
            </div>

            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="bug-category">Area</label>
                <select id="bug-category" className={fieldClass} value={form.category} onChange={update('category')}>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="bug-severity">Severity</label>
                <select id="bug-severity" className={fieldClass} value={form.severity} onChange={update('severity')}>
                  {Object.entries(SEVERITY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mb-3">
              <span className={labelClass}>Screenshot or log</span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button" onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-[11px] text-[var(--text)] hover:bg-[var(--surface-3)]"
                >
                  <Paperclip size={13} aria-hidden="true" /> Attach file
                </button>
                <span className="text-[10px] text-[var(--text-3)]">or press Ctrl+V to paste a screenshot</span>
              </div>
              <input
                ref={fileInputRef} type="file" multiple hidden
                accept="image/png,image/jpeg,image/webp,text/plain,.log,.txt"
                onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }}
              />
              {attachments.length ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {attachments.map((file, index) => (
                    <li key={`${file.name}-${index}`} className="flex items-center justify-between border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1">
                      <span className="flex min-w-0 items-center gap-2 text-[11px] text-[var(--text)]">
                        <ImageIcon size={12} aria-hidden="true" className="shrink-0 text-[var(--text-3)]" />
                        <span className="truncate">{file.name}</span>
                        <span className="shrink-0 text-[var(--text-3)]">{Math.round(file.size / 1024)} KB</span>
                      </span>
                      <button
                        type="button" aria-label={`Remove ${file.name}`}
                        onClick={() => setAttachments((current) => current.filter((_, i) => i !== index))}
                        className="text-[var(--text-3)] hover:text-[var(--text)]"
                      >
                        <X size={13} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {/* Stated plainly, because a screenshot of this UI can contain
                  client names, balances and open positions. */}
              <p className="mt-1.5 text-[10px] leading-4 text-[var(--text-3)]">
                Screenshots are sent to the RTX5 platform team. Check the image does not show anything
                you would not want shared.
              </p>
            </div>

            <button
              type="button" onClick={() => setShowDetails((value) => !value)}
              className="mb-2 text-[11px] font-semibold text-[var(--accent)] hover:underline"
              aria-expanded={showDetails}
            >
              {showDetails ? 'Hide' : 'Add'} reproduction details
            </button>

            {showDetails ? (
              <div className="mb-3 flex flex-col gap-3 border-l-2 border-[var(--border)] pl-3">
                <div>
                  <label className={labelClass} htmlFor="bug-steps">Steps to reproduce (one per line)</label>
                  <textarea id="bug-steps" className={`${fieldClass} min-h-[72px] resize-y`} value={form.steps} onChange={update('steps')} placeholder={'Open EURUSD\nClick Buy\nOrder is rejected'} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass} htmlFor="bug-expected">Expected</label>
                    <textarea id="bug-expected" className={`${fieldClass} min-h-[56px] resize-y`} value={form.expected} onChange={update('expected')} />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="bug-actual">Actual</label>
                    <textarea id="bug-actual" className={`${fieldClass} min-h-[56px] resize-y`} value={form.actual} onChange={update('actual')} />
                  </div>
                </div>
              </div>
            ) : null}

            <p className="mb-3 text-[10px] leading-4 text-[var(--text-3)]">
              Your application version, browser, operating system and current screen are attached automatically.
              Passwords and session tokens are never included.
            </p>

            {submitHint && !submitting ? (
              <p className="mb-3 text-[11px] text-amber-300">{submitHint}</p>
            ) : null}

            {error ? (
              <p role="alert" className="mb-3 border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{error}</p>
            ) : null}

            <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-3">
              <button type="button" onClick={onClose} disabled={submitting} className="border border-[var(--border)] px-4 py-1.5 text-[12px] text-[var(--text-2)] hover:text-[var(--text)] disabled:opacity-50">
                Cancel
              </button>
              <button type="submit" disabled={!canSubmit} className="bg-[var(--accent)] px-4 py-1.5 text-[12px] font-semibold text-black disabled:opacity-40">
                {submitting ? 'Submitting…' : 'Submit report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
