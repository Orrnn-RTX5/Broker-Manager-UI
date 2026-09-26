import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Info, X } from 'lucide-react';
import { useResultDialogStore } from '../store/resultDialogStore.js';
import { getResultPresentation } from '../utils/resultMessage.js';
import './ResultDialog.css';

function Result({ result, dismiss }) {
  const ref = useRef(null);
  const doneRef = useRef(null);
  const id = useId();
  const { message, guidance, technicalMessage } = getResultPresentation(result);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog.showModal();
    doneRef.current?.focus();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  const keepFocusInside = (event) => {
    if (event.key !== 'Tab') return;
    const controls = [...ref.current.querySelectorAll('button:not(:disabled), summary, [tabindex="0"]')]
      .filter(control => control.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const Icon = result.type === 'success' ? Check : result.type === 'error' ? X : Info;
  return <dialog ref={ref} className={`result-dialog is-${result.type}`} role="alertdialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-message`} onKeyDown={keepFocusInside} onCancel={event => { event.preventDefault(); dismiss(); }}>
    <header className="result-dialog-header">
      <div className="result-dialog-icon" aria-hidden="true"><Icon size={16} strokeWidth={2} /></div>
      <h2 id={`${id}-title`}>{result.title}</h2>
      <button type="button" className="result-dialog-close" aria-label="Close result" onClick={dismiss}><X size={14} /></button>
    </header>
    <div className="result-dialog-body" tabIndex={0} role="region" aria-label="Result message">
      <div id={`${id}-message`} className="result-dialog-copy">
        <p className="result-dialog-message">{message}</p>
        {guidance && <p className="result-dialog-guidance">{guidance}</p>}
      </div>
      {(technicalMessage || result.code) && <details className="result-dialog-details">
        <summary><span>Technical details</span><ChevronDown size={15} aria-hidden="true" /></summary>
        {result.code && <dl className="result-dialog-code"><div><dt>Status</dt><dd><code>{result.code}</code></dd></div></dl>}
        <div className="result-dialog-details-copy"><p>{technicalMessage || result.message}</p></div>
      </details>}
    </div>
    <footer><button ref={doneRef} type="button" className="result-dialog-done" onClick={dismiss}>OK</button></footer>
  </dialog>;
}

export default function ResultDialog() {
  const result = useResultDialogStore(state => state.queue[0]);
  const dismiss = useResultDialogStore(state => state.dismiss);
  return result ? createPortal(<Result key={result.id} result={result} dismiss={dismiss} />, document.body) : null;
}
