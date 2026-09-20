"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CircleCheck, PenLine, TriangleAlert, X } from "lucide-react";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { createMessage } from "@/lib/actions/content";
import styles from "../dashboard.module.css";

const TITLE_MAX = 120;
const MESSAGE_MAX = 2000;

// After a successful post the confirmation shows briefly, then the dialog closes on the new notice.
const CLOSE_AFTER_POSTING_MS = 1400;

/**
 * "Write a notice": a button that opens a dialog holding guidance on what makes a good notice and the form,
 * with character counts and the result right under the button. The limits here match the ones the server
 * enforces in createMessage. The dialog stays mounted, so a half-written draft survives an accidental close.
 */
export function NoticeComposer({ first = false }: { first?: boolean }) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{ ok: true } | { ok: false; error: string } | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    // A click on the dimmed backdrop (the dialog element itself, outside its content) closes it. Escape already does too.
    const onBackdropClick = (event: MouseEvent) => { if (event.target === dialog) dialog?.close(); };
    dialog?.addEventListener("click", onBackdropClick);
    return () => {
      dialog?.removeEventListener("click", onBackdropClick);
      // Never leave the page locked if the component goes away while the dialog is open.
      clearTimeout(closeTimer.current);
      document.body.style.removeProperty("overflow");
    };
  }, []);

  function open() {
    clearTimeout(closeTimer.current);
    setResult(null);
    document.body.style.overflow = "hidden";
    dialogRef.current?.showModal();
    // On a phone, leave focus on the dialog so the guidance is read first and the keyboard does not cover it.
    if (window.matchMedia("(min-width: 641px)").matches) titleRef.current?.focus({ preventScroll: true });
  }

  function close() {
    dialogRef.current?.close();
  }

  async function submit(formData: FormData) {
    setResult(null);
    const outcome = await createMessage(formData);
    setResult(outcome);
    if (outcome.ok) {
      setTitle("");
      setMessage("");
      clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(close, CLOSE_AFTER_POSTING_MS);
    }
  }

  return <>
    <button type="button" className={styles.composeTrigger} onClick={open}><PenLine aria-hidden="true"/>{first ? "Write the first notice" : "Write a notice"}</button>
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={`${id}-heading`}
      onClose={() => { clearTimeout(closeTimer.current); document.body.style.removeProperty("overflow"); }}
    >
      <header className={styles.dialogHead}>
        <div>
          <p className="eyebrow dark">Post to members</p>
          <h2 id={`${id}-heading`} className={styles.dialogTitle}>Write a notice</h2>
        </div>
        <button type="button" className={styles.dialogClose} onClick={close} aria-label="Close without posting"><X aria-hidden="true"/></button>
      </header>
      <div className={styles.dialogBody}>
        <p className={styles.composeIntro}>Share news, ask for a hand or pass something on to the rest of the Society. Every member sees it on the notice board, with your name on it.</p>
        <div className={styles.composerWrap}><div className={styles.composer}>
    <aside className={styles.guide} aria-labelledby={`${id}-guide`}>
      <h3 id={`${id}-guide`}>Before you post</h3>
      <ul>
        <li><strong>Lead with the point.</strong> A title such as “Spare 5 inch gauge wagons for sale” or “Help needed to move the turntable” tells people at a glance whether it is for them.</li>
        <li><strong>Say when, where and how to reply.</strong> Give the date and place, and how to reach you. Links are not clickable in a notice, so write out any address in full.</li>
        <li><strong>Good things to share:</strong> news from a visit or meeting, things for sale or wanted, a request for help with a build, or a thank-you.</li>
        <li><strong>Please leave out</strong> other people’s private details, and anything confidential from committee business.</li>
      </ul>
      <p>Your notice goes live straight away, for every member, with your name on it. You can archive your own notices at any time.</p>
    </aside>

    <form action={submit} className={styles.composeForm}>
      <label htmlFor={`${id}-title`}>Title</label>
      <input ref={titleRef} id={`${id}-title`} name="title" value={title} onChange={(event) => setTitle(event.target.value)} minLength={2} maxLength={TITLE_MAX} required placeholder="For example: Help needed to move the turntable" aria-describedby={`${id}-title-count`} autoComplete="off"/>
      <small id={`${id}-title-count`} className={styles.count}>{title.length} of {TITLE_MAX}</small>

      <label htmlFor={`${id}-message`}>Message</label>
      <textarea id={`${id}-message`} name="message" value={message} onChange={(event) => setMessage(event.target.value)} rows={6} minLength={2} maxLength={MESSAGE_MAX} required placeholder="What is it, when and where, and how should people get in touch?" aria-describedby={`${id}-message-count`}/>
      <small id={`${id}-message-count`} className={styles.count}>{message.length} of {MESSAGE_MAX}</small>

      <div className={styles.composeActions}>
        <PendingSubmitButton className="button dark" pendingLabel="Posting notice…">Post notice</PendingSubmitButton>
      </div>
      <div aria-live="polite">
        {result?.ok ? <p className={`${styles.composeResult} ${styles.composeGood}`}><CircleCheck aria-hidden="true"/>Posted. Your notice is now on the dashboard for every member.</p> : null}
        {result && !result.ok ? <p className={`${styles.composeResult} ${styles.composeBad}`} role="alert"><TriangleAlert aria-hidden="true"/>{result.error}</p> : null}
      </div>
    </form>
        </div></div>
      </div>
    </dialog>
  </>;
}
