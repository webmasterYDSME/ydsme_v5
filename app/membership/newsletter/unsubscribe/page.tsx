import { MailX } from "lucide-react";
import { redirect } from "next/navigation";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { unsubscribeMembershipNewsletter } from "@/lib/actions/membership";
import { emailFromNewsletterUnsubscribeToken } from "@/lib/membership";
import { PageShell } from "@/app/components/PageShell";
import styles from "../../confirmation.module.css";

export const dynamic = "force-dynamic";

export default async function NewsletterUnsubscribe({ searchParams }: { searchParams: Promise<{ token?: string; result?: string }> }) {
  const query = await searchParams;
  if (query.result) return <PageShell headerTheme="light"><div className={styles.page}><section className={styles.card} aria-labelledby="unsubscribe-title">
    <div className={styles.icon} aria-hidden="true"><MailX/></div><p className="eyebrow dark">Society newsletter</p>
    <h1 id="unsubscribe-title">{query.result === "confirmed" ? "Newsletter emails stopped" : "This unsubscribe link is invalid"}</h1>
    <p>{query.result === "confirmed" ? "The shared mailbox will no longer be included in newsletter exports. Essential membership administration messages are unchanged." : "Use the link from the latest newsletter or contact the Society."}</p>
    <div className={styles.actions}><a className="button outline" href="/membership">Membership information</a></div>
  </section></div></PageShell>;
  const token = query.token ?? "";
  if (!emailFromNewsletterUnsubscribeToken(token)) redirect("/membership/newsletter/unsubscribe?result=invalid");
  return <PageShell headerTheme="light"><div className={styles.page}><section className={styles.card} aria-labelledby="unsubscribe-title">
    <div className={styles.icon} aria-hidden="true"><MailX/></div><p className="eyebrow dark">Society newsletter</p>
    <h1 id="unsubscribe-title">Stop newsletter emails?</h1>
    <p>This removes the whole mailbox from newsletter exports, including when several members share it. Essential messages about each membership will continue.</p>
    <form className={styles.actions} action={unsubscribeMembershipNewsletter}><input type="hidden" name="token" value={token}/><PendingSubmitButton className="button dark" pendingLabel="Saving…">Unsubscribe this mailbox</PendingSubmitButton></form>
  </section></div></PageShell>;
}
