"use client";

import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

type DialogControls = { requestClose: () => void };

export function EditorDialog({
  trigger,
  triggerClassName,
  eyebrow,
  title,
  description,
  dirty = false,
  onAfterClose,
  children,
}: {
  trigger: ReactNode;
  triggerClassName?: string;
  eyebrow: string;
  title: string;
  description?: string;
  dirty?: boolean;
  onAfterClose?: () => void;
  children: ReactNode | ((controls: DialogControls) => ReactNode);
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [open, setOpen] = useState(false);

  const requestClose = useCallback(() => {
    if (dirty && !window.confirm("Close this editor and discard the unsaved changes?")) return;
    setOpen(false);
  }, [dirty]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const closeFromBackdrop = (event: MouseEvent) => {
      if (event.target === dialog) requestClose();
    };
    dialog.addEventListener("click", closeFromBackdrop);
    return () => dialog.removeEventListener("click", closeFromBackdrop);
  }, [requestClose]);

  return <>
    <button ref={triggerRef} type="button" className={triggerClassName} onClick={() => setOpen(true)}>{trigger}</button>
    <dialog
      ref={dialogRef}
      className="editor-dialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => { event.preventDefault(); requestClose(); }}
      onClose={() => {
        setOpen(false);
        onAfterClose?.();
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }}
    >
      <div className="editor-dialog-shell">
        <header className="editor-dialog-header">
          <div><span>{eyebrow}</span><h2 id={titleId}>{title}</h2>{description ? <p id={descriptionId}>{description}</p> : null}</div>
          <button type="button" onClick={requestClose} aria-label={`Close ${title}`}><X/></button>
        </header>
        <div className="editor-dialog-content">{typeof children === "function" ? children({ requestClose }) : children}</div>
      </div>
    </dialog>
  </>;
}
