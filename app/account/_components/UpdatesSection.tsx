import { Bell } from "lucide-react";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { markMembershipNotificationRead } from "@/lib/actions/membership";
import styles from "../account.module.css";

export type AccountNotification = { id: string; title: string; body: string; created_at: string; read_at: string | null };

/** Notices about the membership, newest first, with a way to mark each one as read. */
export function UpdatesSection({ notifications }: { notifications: AccountNotification[] }) {
  return <section className={styles.card} id="updates" aria-labelledby="updates-heading">
    <header className={styles.cardHead}>
      <span className={styles.badge}><Bell/></span>
      <div className={styles.headText}><h2 id="updates-heading">Membership updates</h2><p>Notices about your membership, kept here as well as in your inbox.</p></div>
    </header>
    <div className={styles.cardBody}>
      {notifications.length ? <div className={styles.updates}>{notifications.map((notification) => <article key={notification.id} className={`${styles.update} ${notification.read_at ? "" : styles.unread}`}>
        <div>
          <strong>{notification.title}</strong>
          <p>{notification.body}</p>
          <small>{new Date(notification.created_at).toLocaleString("en-GB")}</small>
        </div>
        {!notification.read_at ? <form action={markMembershipNotificationRead}>
          <input type="hidden" name="notification_id" value={notification.id}/>
          <PendingSubmitButton className="button outline" pendingLabel="Saving…">Mark read</PendingSubmitButton>
        </form> : null}
      </article>)}</div> : <p className={styles.empty}>No membership notifications yet.</p>}
    </div>
  </section>;
}
