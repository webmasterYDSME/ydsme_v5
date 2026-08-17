import { ShieldCheck, UserRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateProfile } from "@/lib/actions/content";
import { openBillingPortal } from "@/lib/actions/billing";
import { updateLoginEmail } from "@/lib/actions/auth";

export const dynamic = "force-dynamic";

export default async function Account({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const [{ user, role }, query] = await Promise.all([requireUser(), searchParams]);
  const { data, error } = await createAdminClient().from("users").select("title,full_name,email,contact_number,birthday,club_rules_agreement").eq("id", user.id).single();
  if (error) throw new Error(error.message);
  return <div className="portal-content narrow"><header className="portal-heading"><div><p className="eyebrow dark">Your membership</p><h1>Account details</h1><p>Keep your contact details accurate. Access controls are managed separately by an administrator.</p></div><UserRound/></header>{query.error ? <p className="form-message error">{query.error}</p> : null}{query.notice ? <p className="form-message success">Account update accepted. Check your email if confirmation is required.</p> : null}<section className="portal-card account-card"><div className="security-strip"><ShieldCheck/><div><strong>Secure Society account</strong><span>{role.replaceAll("-"," ")} · {data.email}</span></div></div><form action={updateProfile} className="editor-form"><label>Title<input name="title" defaultValue={data.title || ""}/></label><label>Full name<input name="full_name" defaultValue={data.full_name || ""} required/></label><label>Contact number<input name="contact_number" defaultValue={data.contact_number || ""}/></label><button type="submit" className="button dark">Save profile</button></form><div className="account-action"><div><strong>Login email</strong><p>Supabase will send confirmation before the new address becomes active.</p></div><form action={updateLoginEmail}><input type="email" name="email" defaultValue={data.email} required/><button type="submit" className="button outline">Change email</button></form></div><div className="billing-panel"><div><strong>Subscription & payments</strong><p>Stripe’s hosted portal keeps payment details outside this website.</p></div><form action={openBillingPortal}><button type="submit" className="button outline">Open billing portal</button></form></div></section></div>;
}
