import { useRef, useState } from 'react';
import { Check, LoaderCircle, Pencil, X } from 'lucide-react';
import { positionCommentChange } from '../../services/tradeApi';
import './tradeCommentCell.css';

export default function TradeCommentCell({ row, disabled, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const triggerRef = useRef(null);
  const comment = String(row.comment ?? '');
  const finish = () => {
    setEditing(false);
    setError('');
    requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const save = async (event) => {
    event.preventDefault();
    if (savingRef.current) return;
    if (draft === comment) { finish(); return; }
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const result = await positionCommentChange({ ticket: row.position, comment: draft });
      if (result?.success === false || result?.error) {
        throw new Error(result?.error?.message || result?.message || String(result.error || 'Could not save comment.'));
      }
      onSaved(draft);
      finish();
    } catch (err) {
      setError(err?.message || 'Could not save comment. Please try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="cc-trade-comment" onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === 'Escape' && !savingRef.current) {
        event.preventDefault();
        finish();
      }
    }}>
      {editing ? (
        <form className="cc-trade-comment-form" onSubmit={save} aria-busy={saving}>
          <div className={`cc-trade-comment-editor${error ? ' has-error' : ''}`}>
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onFocus={(event) => event.target.select()}
              readOnly={saving}
              aria-label={`Comment for ticket ${row.position}`}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `comment-error-${row.login}-${row.position}` : undefined}
              placeholder="Write a comment…"
              title="Enter to save · Escape to cancel"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault();
              }}
            />
            <button type="submit" disabled={saving} aria-label="Save comment" title="Save (Enter)">
              {saving ? <LoaderCircle className="is-spinning" size={12} /> : <Check size={12} />}
            </button>
            <button type="button" disabled={saving} onClick={finish} aria-label="Cancel comment" title="Cancel (Escape)"><X size={12} /></button>
          </div>
          {error && <div id={`comment-error-${row.login}-${row.position}`} className="cc-trade-comment-error" role="alert">{error}</div>}
        </form>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          className={`cc-trade-comment-trigger${comment ? '' : ' is-empty'}`}
          disabled={disabled || !row.position}
          aria-label={`${comment ? 'Edit' : 'Add'} comment for ticket ${row.position}`}
          title={comment || 'Click to add a comment'}
          onClick={() => { setDraft(comment); setError(''); setEditing(true); }}
        >
          <span>{comment || 'Add comment…'}</span><Pencil size={11} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
