import { redirect } from "next/navigation";
import { UserRound } from "lucide-react";
import { switchPortalAccount } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { MEMBERMOJO_MEMBERSHIP_URL, membershipBillingEnabled } from "@/lib/features";

function safeNext(value: string | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/account";
}

export default async function SwitchAccount({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!membershipBillingEnabled()) redirect(MEMBERMOJO_MEMBERSHIP_URL);
  const [{ next }, currentUser] = await Promise.all([searchParams, getCurrentUser()]);
  const destination = safeNext(next);
  if (!currentUser) redirect(`/signin?next=${encodeURIComponent(destination)}`);

  return <main className="simple-auth"><div>
    <span className="membership-result-icon"><UserRound aria-hidden="true"/></span>
    <p className="eyebrow dark">Membership account</p>
    <h1>Use the account for this membership.</h1>
    <p>Another Society account is already open in this browser. Sign out of it before requesting a secure sign-in link for the email address that received the membership message.</p>
    <form action={switchPortalAccount}>
      <input type="hidden" name="next" value={destination}/>
      <button className="button dark" type="submit">Use another account</button>
    </form>
  </div></main>;
}
