"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import styles from "./email-queue.module.css";

const rowBoxes = (form: HTMLFormElement) => [...form.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="ids"]:not(:disabled)')];

/** Tick-all and the two buttons that act on ticked emails. The buttons stay off until something is ticked. */
export function QueueToolbar() {
  const all = useRef<HTMLInputElement>(null);
  const [ticked, setTicked] = useState(0);
  const [total, setTotal] = useState(0);

  const refresh = useCallback(() => {
    const form = all.current?.form;
    if (!form) return;
    const boxes = rowBoxes(form);
    const count = boxes.filter((box) => box.checked).length;
    setTicked(count);
    setTotal(boxes.length);
    if (all.current) {
      all.current.checked = boxes.length > 0 && count === boxes.length;
      all.current.indeterminate = count > 0 && count < boxes.length;
    }
  }, []);

  useEffect(() => {
    const form = all.current?.form;
    if (!form) return;
    refresh();
    form.addEventListener("change", refresh);
    return () => form.removeEventListener("change", refresh);
  }, [refresh]);

  const none = ticked === 0;
  return <div className={styles.toolbar}>
    <label className={styles.selectAll}>
      <input ref={all} type="checkbox" disabled={total === 0} onChange={(event) => {
        const form = all.current?.form;
        if (!form) return;
        for (const box of rowBoxes(form)) box.checked = event.target.checked;
        refresh();
      }}/>
      <span>{none ? "Tick all on this page" : `${ticked} ticked`}</span>
    </label>
    <div className={styles.actions}>
      <PendingSubmitButton name="intent" value="requeue" className="button outline" pendingLabel="Working…" disabled={none}
        confirmMessage={`Put ${ticked} ticked ${ticked === 1 ? "email" : "emails"} back in the queue?`}>Put ticked back in the queue</PendingSubmitButton>
      <PendingSubmitButton name="intent" value="cancel" className={`button outline ${styles.danger}`} pendingLabel="Working…" disabled={none}
        confirmMessage={`Stop ${ticked} ticked ${ticked === 1 ? "email" : "emails"}? They will not be sent unless you put them back.`}>Stop ticked</PendingSubmitButton>
    </div>
  </div>;
}
