import type { ComponentType } from "react";
import { Award, Bell, CalendarClock, CircleCheck, CreditCard, GraduationCap, Info, MailCheck, TriangleAlert } from "lucide-react";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { markAllMembershipNotificationsRead } from "@/lib/actions/account";
import { markMembershipNotificationRead } from "@/lib/actions/membership";
import { relativeTime, safeInternalHref } from "../format";
import styles from "../account.module.css";

export type AccountNotification = {
  id: string;
  title: string;
  body: string;
  kind: string;
  action_href: string | null;
  created_at: string;
  read_at: string | null;
};

type Tone = "good" | "warn" | "bad" | "info";

/** An icon and colour for each kind of notice, so a glance says whether it is good news, a reminder or a problem. */
function look(kind: string): { Icon: ComponentType<{ "aria-hidden"?: boolean }>; tone: Tone } {
  const name = kind.replace(/^membership\./, "");
  if (/(overdue|lapsed|failed|action-required|disputed|reversal|unavailable|retention-warning)/.test(name)) return { Icon: TriangleAlert, tone: "bad" };
  if (/(grace|reminder|upcoming|invitation|payment-instructions|price-changed|contact-officer)/.test(name)) return { Icon: CalendarClock, tone: "warn" };
  if (name.includes("honorary")) return { Icon: Award, tone: "good" };
  if (name.includes("student")) return { Icon: GraduationCap, tone: "info" };
  if (name.includes("contact-change") || name.includes("verification")) return { Icon: MailCheck, tone: "info" };
  if (/(activated|reinstated|renewal-paid|resolved)/.test(name)) return { Icon: CircleCheck, tone: "good" };
  if (/(payment|refund|auto-renew|subscription)/.test(name)) return { Icon: CreditCard, tone: "info" };
  return { Icon: Info, tone: "info" };
}

const toneClass: Record<Tone, string> = { good: styles.toneGood, warn: styles.toneWarn, bad: styles.toneBad, info: styles.toneInfo };

const RECENT_READ_SHOWN = 3;

/** What is inside the bell's panel: unread notices first and highlighted, a few recent read ones, and the rest behind a link. */
export function NotificationList({ notifications }: { notifications: AccountNotification[] }) {
  const unread = notifications.filter((notice) => !notice.read_at);
  const read = notifications.filter((notice) => notice.read_at);
  const recent = read.slice(0, RECENT_READ_SHOWN);
  const older = read.slice(RECENT_READ_SHOWN);

  return <>
    <header className={`card-heading ${styles.bellHead}`}>
      <div>
        <p className="eyebrow dark">{unread.length ? `${unread.length} unread` : "All read"}</p>
        <h2>Notifications</h2>
      </div>
      {unread.length > 1 ? <form action={markAllMembershipNotificationsRead}>
        <PendingSubmitButton className={styles.linkButton} pendingLabel="Marking…">Mark all as read</PendingSubmitButton>
      </form> : null}
    </header>
    {notifications.length ? <>
      <ul className={styles.notices}>
        {[...unread, ...recent].map((notice) => <Notice key={notice.id} notice={notice}/>)}
      </ul>
      {older.length ? <details className={styles.older}>
        <summary>Show {older.length} older {older.length === 1 ? "notification" : "notifications"}</summary>
        <ul className={styles.notices}>{older.map((notice) => <Notice key={notice.id} notice={notice}/>)}</ul>
      </details> : null}
    </> : <div className={styles.emptyState}><span className={styles.badge}><Bell/></span><strong>You are all caught up</strong><p>Notices about renewals, payments and changes to your membership will appear here, as well as in your inbox.</p></div>}
  </>;
}

function Notice({ notice }: { notice: AccountNotification }) {
  const { Icon, tone } = look(notice.kind);
  const href = safeInternalHref(notice.action_href);
  const isUnread = !notice.read_at;
  return <li className={`${styles.notice} ${isUnread ? styles.noticeUnread : ""}`}>
    <span className={`${styles.noticeIcon} ${toneClass[tone]}`}><Icon aria-hidden/></span>
    <div className={styles.noticeBody}>
      <div className={styles.noticeTop}>
        <strong>{notice.title}{isUnread ? <span className={styles.srOnly}> (unread)</span> : null}</strong>
        <time dateTime={notice.created_at} title={new Date(notice.created_at).toLocaleString("en-GB", { timeZone: "Europe/London" })}>{relativeTime(notice.created_at)}</time>
      </div>
      <p>{notice.body}</p>
      {href || isUnread ? <div className={styles.noticeActions}>
        {href ? <a className={styles.noticeLink} href={href}>Open</a> : null}
        {isUnread ? <form action={markMembershipNotificationRead}>
          <input type="hidden" name="notification_id" value={notice.id}/>
          <PendingSubmitButton className={styles.linkButton} pendingLabel="Saving…">Mark as read</PendingSubmitButton>
        </form> : null}
      </div> : null}
    </div>
  </li>;
}
