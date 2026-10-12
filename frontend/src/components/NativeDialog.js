import React, { useEffect, useRef } from 'react';
import './SharedRecordUI.css';
import './NativeContentUI.css';

export default function NativeDialog({ title, onClose, busy = false, children, actions }) {
  const dialog = useRef(null); const close = useRef(onClose); close.current = onClose;
  const writing = useRef(busy); writing.current = busy;
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; dialog.current?.querySelector('button,input,textarea,select')?.focus();
    const keyboard = (event) => {
      if (event.key === 'Escape' && !writing.current) { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const fields = [...(dialog.current?.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]') || [])];
      if (event.shiftKey && document.activeElement === fields[0]) { event.preventDefault(); fields.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === fields.at(-1)) { event.preventDefault(); fields[0]?.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keyboard); previous?.focus?.(); };
  }, []);
  return <div className="sr-dialog-overlay native-content-ui" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="sr-dialog" ref={dialog} role="dialog" aria-modal="true" aria-label={title}><header className="sr-dialog-header"><h2>{title}</h2><button type="button" className="btn btn-ghost" disabled={busy} aria-label="Cancel" onClick={onClose}>×</button></header><div className="sr-dialog-body">{children}</div><footer className="sr-dialog-footer">{actions}<button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>Cancel</button></footer></section></div>;
}
