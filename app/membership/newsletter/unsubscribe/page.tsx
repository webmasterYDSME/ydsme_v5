import { MailX } from "lucide-react";
import { redirect } from "next/navigation";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { unsubscribeMembershipNewsletter } from "@/lib/actions/membership";
import { emailFromNewsletterUnsubscribeToken } from "@/lib/membership";

export const dynamic = "force-dynamic";

export default async function NewsletterUnsubscribe({ searchParams }: { searchParams: Promise<{ token?: string; result?: string }> }) {
  const query = await searchParams;
  if (query.result) return <main className="membership-apply-page"><section className="membership-completion-card">
    <div className="membership-completion-icon"><MailX/></div><p className="eyebrow dark">Society newsletter</p>
    <h1>{query.result === "confirmed" ? "Newsletter emails stopped" : "This unsubscribe link is invalid"}</h1>
    <p>{query.result === "confirmed" ? "The shared mailbox will no longer be included in newsletter exports. Essential membership administration messages are unchanged." : "Use the link from the latest newsletter or contact the Society."}</p>
  </section></main>;
  const token = query.token ?? "";
  if (!emailFromNewsletterUnsubscribeToken(token)) redirect("/membership/newsletter/unsubscribe?result=invalid");
  return <main className="membership-apply-page"><section className="membership-completion-card">
    <div className="membership-completion-icon"><MailX/></div><p className="eyebrow dark">Society newsletter</p>
    <h1>Stop newsletter emails?</h1>
    <p>This removes the whole mailbox from newsletter exports, including when several members share it. Essential messages about each membership will continue.</p>
    <form action={unsubscribeMembershipNewsletter}><input type="hidden" name="token" value={token}/><PendingSubmitButton className="button dark" pendingLabel="Saving…">Unsubscribe this mailbox</PendingSubmitButton></form>
  </section></main>;
}
