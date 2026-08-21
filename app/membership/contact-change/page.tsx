import { MailCheck, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { confirmMembershipContactChange } from "@/lib/actions/membership";
import { MEMBERMOJO_MEMBERSHIP_URL, membershipRecoveryEnabled } from "@/lib/features";
import { membershipTokenHash } from "@/lib/membership";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function MembershipContactChange({ searchParams }: { searchParams: Promise<{ token?: string; result?: string }> }) {
  if (!membershipRecoveryEnabled()) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  const query = await searchParams;
  if (query.result) return <main className="membership-apply-page"><section className="membership-completion-card">
    <div className="membership-completion-icon"><MailCheck/></div>
    <p className="eyebrow dark">Membership contact details</p>
    <h1>{query.result === "confirmed" ? "Email address confirmed" : "This link is no longer valid"}</h1>
    <p>{query.result === "confirmed" ? "Future essential membership messages for this member will use the confirmed correspondence address." : "Ask the membership officer to issue a new contact confirmation email."}</p>
    <a className="button outline" href="/membership">Membership information</a>
  </section></main>;
  const token = query.token ?? "";
  if (token.length < 20 || token.length > 200) redirect("/membership/contact-change?result=invalid");
  const { data } = await createServiceClient().from("membership_contact_change_requests")
    .select("member_id,requested_email,status,expires_at,members(full_name)")
    .eq("token_hash", membershipTokenHash(token)).maybeSingle();
  if (!data || data.status !== "pending" || new Date(data.expires_at) <= new Date()) {
    redirect("/membership/contact-change?result=invalid");
  }
  const member = Array.isArray(data.members) ? data.members[0] : data.members;
  return <main className="membership-apply-page"><section className="membership-completion-card">
    <div className="membership-completion-icon"><ShieldCheck/></div>
    <p className="eyebrow dark">{member?.full_name || "Membership"}</p>
    <h1>Confirm this correspondence email</h1>
    <p>Confirm that <strong>{data.requested_email}</strong> may receive essential membership messages concerning {member?.full_name || "this member"}. This does not create or change a website login.</p>
    <form action={confirmMembershipContactChange}>
      <input type="hidden" name="token" value={token}/>
      <PendingSubmitButton className="button dark" pendingLabel="Confirming…">Confirm email address</PendingSubmitButton>
    </form>
  </section></main>;
}
