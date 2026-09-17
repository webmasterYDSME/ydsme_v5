import styles from "../components/LegalPage.module.css";
import cookieStyles from "./cookies.module.css";
import { LegalPage } from "../components/LegalPage";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "Cookie Notice",
  description: "The essential cookies and related browser storage used by the York Model Engineers website and members’ area.",
  path: "/cookie-policy",
});

export default function CookiePolicy() {
  return <LegalPage
    className={`${styles.legal} ${cookieStyles.cookies}`}
    eyebrow="Legal · Browser storage"
    title="Cookie notice"
    summary="The public website does not use advertising or analytics cookies. Essential storage supports secure member sign-in and abuse prevention."
    updated="18 August 2026"
  >
    <section>
      <h2>What cookies are</h2>
      <p>Cookies are small pieces of data stored by a website in your browser. Similar browser storage may be used for the same kinds of purpose. Cookies can be set by the site you visit or by a service embedded in that site.</p>
    </section>

    <section>
      <h2>What this website uses</h2>
      <p>We currently use only storage that is necessary to provide requested features, maintain member authentication and protect account and booking forms. The public information pages do not use advertising, cross-site tracking or audience-measurement cookies.</p>
      <div className="legal-table-wrap"><table>
        <thead><tr><th scope="col">Provider or identifier</th><th scope="col">Purpose</th><th scope="col">Typical duration</th></tr></thead>
        <tbody>
          <tr><td data-label="Provider or identifier"><code>sb-&lt;project&gt;-auth-token</code> and numbered fragments, where required (Supabase)</td><td data-label="Purpose">Keeps a Society member securely signed in, refreshes the authenticated session and applies the correct access permissions.</td><td data-label="Typical duration">For the authenticated session, until sign-out or expiry. The exact expiry may be renewed while the account remains signed in.</td></tr>
          <tr><td data-label="Provider or identifier"><code>ydsme-booking-security</code></td><td data-label="Purpose">Assigns a random, first-party browser identifier used in pseudonymous checks that prevent rapid repeated reservations for the same event. It does not contain your name, email address or IP address.</td><td data-label="Typical duration">24 hours.</td></tr>
          <tr><td data-label="Provider or identifier">Cloudflare Turnstile security storage; this may include <code>cf_clearance</code> if challenge clearance is enabled</td><td data-label="Purpose">Helps identify automated or abusive sign-in, password-reset and magic-link requests and may remember that a browser passed a security challenge.</td><td data-label="Typical duration">Short-lived or for the configured challenge period.</td></tr>
        </tbody>
      </table></div>
      <p>Cookie names can include a project-specific reference or be split into fragments because browsers limit the size of an individual cookie.</p>
    </section>

    <section>
      <h2>Why there is no cookie banner</h2>
      <p>Consent is not required for storage that is strictly necessary to deliver a service requested by the user or to secure that service. Because this site does not currently set non-essential analytics or advertising cookies, displaying an “accept” banner would not give you a meaningful choice.</p>
      <p>If we introduce non-essential cookies, we will update this notice and provide an appropriate consent control before those cookies are set.</p>
    </section>

    <section>
      <h2>Third-party destinations</h2>
      <p>The website links to external services such as membermojo for membership applications and renewals, Stripe for voluntary donation payments, and Facebook. Once you follow an external link, that service may use cookies under its own notice and controls. Those cookies are not set by this website merely because a link is displayed.</p>
    </section>

    <section>
      <h2>Managing cookies</h2>
      <p>You can inspect, delete or block cookies using your browser settings. Blocking essential cookies may prevent member login, account security checks, visitor bookings or other protected features from working. Signing out ends the active Society authentication session; you can also clear the site’s stored data in your browser.</p>
    </section>

    <section>
      <h2>Contact and updates</h2>
      <p>For questions about cookies or privacy, email <a href="mailto:secretary@yorkmodelengineers.co.uk">secretary@yorkmodelengineers.co.uk</a>. We will update this notice if the website’s storage practices change.</p>
    </section>
  </LegalPage>;
}
