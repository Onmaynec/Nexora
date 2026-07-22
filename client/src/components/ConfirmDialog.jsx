import { useEffect, useId, useRef } from "react";
import { AlertTriangle, LoaderCircle, X } from "lucide-react";

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const frame = requestAnimationFrame(() => cancelRef.current?.focus());
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel?.();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, [busy, onCancel, open]);

  if (!open) return null;

  return (
    <div className="confirm-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel?.();
    }}>
      <section
        className={`confirm-dialog${danger ? " danger" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header>
          <span><AlertTriangle size={21} /></span>
          <div>
            <small>{danger ? "ОПАСНОЕ ДЕЙСТВИЕ" : "ПОДТВЕРЖДЕНИЕ"}</small>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Закрыть"><X size={18} /></button>
        </header>
        <p id={descriptionId}>{description}</p>
        <footer>
          <button ref={cancelRef} type="button" className="secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button type="button" className={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
            {busy && <LoaderCircle className="spin" size={16} />}
            {confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
