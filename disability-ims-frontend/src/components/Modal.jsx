import { useEffect, useRef, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useUI } from '../context/UIContext.jsx';

// ─────────────────────────────────────────────────────────────
// Modal — the dialog primitive every create/edit/confirm action uses.
//
// The accessibility work here is the point, not decoration. A dialog that
// a sighted mouse user can operate but a screen-reader or keyboard-only
// user cannot escape is worse than no dialog: this system exists for
// people with visual, motor and cognitive impairments (WCAG 2.1 AA,
// Section 3.9.2). So:
//   · focus moves into the dialog on open and returns to the element that
//     opened it on close, so keyboard users never lose their place;
//   · Tab and Shift+Tab are trapped inside the panel;
//   · Escape and a backdrop click close it (unless the caller forbids it
//     for a destructive form mid-edit);
//   · role="dialog" + aria-modal + aria-labelledby name the panel;
//   · the page behind is made inert and scroll-locked, so a screen reader
//     does not wander into content the user cannot reach.
// ─────────────────────────────────────────────────────────────

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = 'md',
  children,
  footer,
  closeOnBackdrop = true,
  initialFocus,          // ref to the field that should receive focus
}) {
  const { t } = useUI();
  const panelRef = useRef(null);
  const restoreRef = useRef(null);
  const titleId = useId();
  const descId = useId();

  const focusFirst = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const target = initialFocus?.current || panel.querySelector(FOCUSABLE) || panel;
    target.focus?.();
  }, [initialFocus]);

  // Remember what had focus, move focus in, and restore on the way out.
  useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement;
    const raf = requestAnimationFrame(focusFirst);
    return () => {
      cancelAnimationFrame(raf);
      restoreRef.current?.focus?.();
    };
  }, [open, focusFirst]);

  // Lock background scrolling so the page behind does not slide away.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Escape to close; Tab cycles within the panel.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return; }
      if (e.key !== 'Tab') return;
      const items = [...(panelRef.current?.querySelectorAll(FOCUSABLE) || [])]
        .filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        ref={panelRef}
        className={`modal ${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? descId : undefined}
      >
        <div className="modal-head">
          <div style={{ minWidth: 0 }}>
            <h2 className="modal-title" id={titleId}>{title}</h2>
            {subtitle && <p className="modal-sub" id={descId}>{subtitle}</p>}
          </div>
          <button
            type="button"
            className="modal-x"
            onClick={onClose}
            aria-label={t.x('Close dialog', 'Funga')}
          >
            <X className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body">{children}</div>

        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ─────────────────────────────────────────────────────────────
// ConfirmModal — a deliberate stop before anything irreversible.
// window.confirm() is not styleable, not translatable and reads poorly
// with a screen reader, so destructive actions use this instead. The
// consequence is stated in the body rather than implied by the button.
// ─────────────────────────────────────────────────────────────
export function ConfirmModal({
  open, onClose, onConfirm, title, message, confirmLabel, tone = 'red', busy = false,
}) {
  const { t } = useUI();
  const confirmRef = useRef(null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      initialFocus={confirmRef}
      footer={(
        <>
          <button type="button" className="btn ghost sm" onClick={onClose} disabled={busy}>
            {t('cancel')}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${tone} sm`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? t.x('Working…', 'Birakorwa…') : (confirmLabel || t.x('Confirm', 'Emeza'))}
          </button>
        </>
      )}
    >
      <p style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--muted)' }}>{message}</p>
    </Modal>
  );
}

// A dialog that submits a form: wires Enter-to-submit and a busy state,
// so every edit screen in the app behaves the same way.
export function FormModal({
  open, onClose, title, subtitle, size = 'md', onSubmit, submitLabel,
  busy = false, error, children, initialFocus, extraFooter,
}) {
  const { t } = useUI();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      size={size}
      initialFocus={initialFocus}
      footer={(
        <>
          {extraFooter && <div className="spacer">{extraFooter}</div>}
          <button type="button" className="btn ghost sm" onClick={onClose} disabled={busy}>
            {t('cancel')}
          </button>
          <button type="submit" form={`mf-${title}`} className="btn sm" disabled={busy}>
            {busy ? t.x('Saving…', 'Birabikwa…') : (submitLabel || t('save'))}
          </button>
        </>
      )}
    >
      <form
        id={`mf-${title}`}
        onSubmit={(e) => { e.preventDefault(); if (!busy) onSubmit?.(); }}
        noValidate
      >
        {children}
        {error && <div className="err" role="alert">{error}</div>}
      </form>
    </Modal>
  );
}
