import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, CircleAlert, Info, X } from 'lucide-react';
import { useResultDialogStore } from '../store/resultDialogStore.js';
import './ResultDialog.css';

function Result({ result, dismiss }) {
  const ref = useRef(null);
  const doneRef = useRef(null);
  const id = useId();
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
    const buttons = [...ref.current.querySelectorAll('button:not(:disabled)')];
    const first = buttons[0];
    const last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const Icon = result.type === 'success' ? Check : result.type === 'error' ? CircleAlert : Info;
  return <dialog ref={ref} className={`result-dialog is-${result.type}`} role="alertdialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-message`} onKeyDown={keepFocusInside} onCancel={event => { event.preventDefault(); dismiss(); }}>
    <button type="button" className="result-dialog-close" aria-label="Close result" onClick={dismiss}><X size={18} /></button>
    <div className="result-dialog-icon" aria-hidden="true"><Icon size={28} strokeWidth={1.8} /></div>
    <h2 id={`${id}-title`}>{result.title}</h2>
    <p id={`${id}-message`}>{result.message}</p>
    {result.code && <div className="result-dialog-code"><span>Status</span><code>{result.code}</code></div>}
    <footer><button ref={doneRef} type="button" className="result-dialog-done" onClick={dismiss}>OK</button></footer>
  </dialog>;
}

export default function ResultDialog() {
  const result = useResultDialogStore(state => state.queue[0]);
  const dismiss = useResultDialogStore(state => state.dismiss);
  return result ? createPortal(<Result key={result.id} result={result} dismiss={dismiss} />, document.body) : null;
}
