import { ShieldCheck, UserRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateProfile } from "@/lib/actions/content";
import { updateLoginEmail } from "@/lib/actions/auth";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";

export const dynamic = "force-dynamic";

export default async function Account({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const [{ user, role }, query] = await Promise.all([requireUser(), searchParams]);
  const { data, error } = await createAdminClient().from("users").select("title,full_name,email,contact_number,birthday,club_rules_agreement").eq("id", user.id).single();
  if (error) throw new Error("Unable to load account details.");
  return <div className="portal-content narrow"><header className="portal-heading"><div><p className="eyebrow dark">Your membership</p><h1>Account details</h1><p>Keep your contact details accurate. Access controls are managed separately by an administrator.</p></div><UserRound/></header>{query.error ? <p className="form-message error">{query.error}</p> : null}{query.notice ? <p className="form-message success">Account update accepted. Check your email if confirmation is required.</p> : null}<section className="portal-card account-card"><div className="security-strip"><ShieldCheck/><div><strong>Secure Society account</strong><span>{role.replaceAll("-"," ")} · {data.email}</span></div></div><form action={updateProfile} className="editor-form"><label>Title<input name="title" defaultValue={data.title || ""}/></label><label>Full name<input name="full_name" defaultValue={data.full_name || ""} required/></label><label>Contact number<input name="contact_number" defaultValue={data.contact_number || ""}/></label><PendingSubmitButton className="button dark">Save profile</PendingSubmitButton></form><div className="account-action"><div><strong>Login email</strong><p>A confirmation will be sent before the new address becomes active.</p></div><form action={updateLoginEmail} className="disabled-form"><input type="email" name="email" defaultValue={data.email} required disabled/><PendingSubmitButton className="button outline" pendingLabel="Updating…" disabled>Change email</PendingSubmitButton></form></div><div className="billing-panel"><div><strong>Membership & renewals</strong><p>Membermojo securely manages membership subscriptions, renewals and related payment details outside this website.</p></div><a className="button outline" href="https://membermojo.co.uk/york-model-engineers" target="_blank" rel="noreferrer">Manage membership</a></div></section></div>;
}
