"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Bell } from "lucide-react";
import styles from "../account.module.css";

/**
 * The bell in the page heading. The notification list is drawn on the server and passed in as children, so the
 * mark-as-read forms keep working; this component only decides whether the panel is showing. The panel stays in the
 * page while closed, which means it keeps its place after a notice is marked as read.
 */
export function NotificationsBell({ unread, children }: { unread: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (root.current && event.target instanceof Node && !root.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return <div className={styles.bell} ref={root}>
    <button
      ref={button}
      type="button"
      className={`${styles.bellButton} ${open ? styles.bellButtonOpen : ""}`}
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      onClick={() => setOpen((value) => !value)}
    >
      <Bell aria-hidden="true"/>
      {unread ? <span className={styles.bellBadge} aria-hidden="true">{unread > 99 ? "99+" : unread}</span> : null}
    </button>
    <div id={panelId} className={styles.bellPanel} role="region" aria-label="Notifications" hidden={!open}>{children}</div>
  </div>;
}
