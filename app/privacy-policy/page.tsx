import { LegalPage } from "../components/LegalPage";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "Privacy Notice",
  description: "How York City & District Society of Model Engineers Limited collects, uses, shares and protects personal information.",
  path: "/privacy-policy",
});

export default function PrivacyPolicy() {
  return <LegalPage
    eyebrow="Legal · Your information"
    title="Privacy notice"
    summary="A plain-English account of the personal information the Society uses, why we use it, and the choices and rights available to you."
    updated="17 August 2026"
  >
    <section>
      <h2>Who we are</h2>
      <p>York City & District Society of Model Engineers Limited (the “Society”, “we”, “us”) is the controller of the personal information described in this notice. Our registered number is 26478R and our registered office is Hill House, Stocks Hill, Huggate, York, YO42 1YQ.</p>
      <p>For privacy questions or to exercise a data protection right, email <a href="mailto:chairman@yorkmodelengineers.co.uk">chairman@yorkmodelengineers.co.uk</a>. General enquiries may be sent to <a href="mailto:secretary@yorkmodelengineers.co.uk">secretary@yorkmodelengineers.co.uk</a>.</p>
    </section>

    <section>
      <h2>Information we collect</h2>
      <h3>Members and applicants</h3>
      <ul>
        <li>Identity and contact details, including name, title, email address, telephone number, postal or billing address and, where needed, date or month and year of birth.</li>
        <li>Membership information, including membership status, Society role, rules agreement and account identifiers.</li>
        <li>Account and security information used to authenticate you and protect the members’ area. We do not have access to your password in readable form.</li>
        <li>Event and workshop participation, documents or notices you submit, and associated authorship records.</li>
        <li>Membership application, renewal and subscription records managed through membermojo, including membership type, status, renewal dates and related payment references.</li>
        <li>If you make a donation through Stripe, we may receive limited transaction information such as the donation amount, date, status and payment reference. Full payment-card details are entered into and retained by Stripe, not this website.</li>
      </ul>
      <h3>Public visitors and correspondents</h3>
      <ul>
        <li>Information you choose to send by email or otherwise provide when contacting the Society.</li>
        <li>Basic technical and security information generated when the website is used, such as IP address, browser or device information, request time and security events.</li>
      </ul>
      <p>Committee names, Society roles, role email addresses and photographs may be published where needed to identify current officers and provide a point of contact.</p>
    </section>

    <section>
      <h2>Why we use information</h2>
      <div className="legal-table-wrap"><table>
        <thead><tr><th>Purpose</th><th>Typical lawful basis</th></tr></thead>
        <tbody>
          <tr><td>Process applications and administer membership, renewals, member access and benefits through membermojo</td><td>Performance of the membership agreement and the Society’s legitimate interests in running the club</td></tr>
          <tr><td>Collect membership subscriptions through membermojo, process voluntary donations through Stripe and maintain financial records</td><td>Performance of the membership agreement, the Society’s legitimate interests and compliance with legal obligations</td></tr>
          <tr><td>Organise events, workshops, volunteer activity and Society communications</td><td>Legitimate interests in operating and promoting the Society; consent where the law requires it</td></tr>
          <tr><td>Protect accounts, prevent abuse and investigate security incidents</td><td>Legitimate interests in keeping members, systems and information secure</td></tr>
          <tr><td>Meet safety, insurance, governance and other legal requirements, or establish and defend legal claims</td><td>Legal obligation and legitimate interests</td></tr>
        </tbody>
      </table></div>
      <p>Some identity and contact information is necessary to administer membership. If it is not provided, we may be unable to create or maintain a membership or online account. We do not use personal information for solely automated decisions that produce legal or similarly significant effects.</p>
    </section>

    <section>
      <h2>Where information comes from</h2>
      <p>We normally receive information directly from you, from a parent or guardian where appropriate, or from a Society officer acting on an application or existing membership record. Membership application, renewal and subscription updates may also be received from membermojo. Donation-payment confirmations may be received from Stripe.</p>
    </section>

    <section>
      <h2>Who we share it with</h2>
      <p>Information is available only to members and Society officers who need it for their role. We also use carefully selected service providers, including:</p>
      <ul>
        <li><strong>Supabase</strong> for authentication, database and file storage;</li>
        <li><strong>Vercel</strong> for website hosting, delivery and operational logs;</li>
        <li><strong>membermojo Ltd</strong> for membership applications, renewals, subscription collection and membership record administration;</li>
        <li><strong>Stripe</strong> solely for processing voluntary donations and associated fraud prevention and payment records; and</li>
        <li><strong>Cloudflare Turnstile</strong> to distinguish genuine sign-in and recovery attempts from automated abuse.</li>
      </ul>
      <p>We may disclose information to insurers, professional advisers, regulators, law-enforcement bodies or other parties where the law requires or permits it. We do not sell personal information.</p>
    </section>

    <section>
      <h2>International processing</h2>
      <p>Some providers may process information in the UK, the EEA or other countries. Where a restricted international transfer occurs, we require an appropriate UK transfer mechanism, such as an adequacy regulation or approved contractual safeguards. Contact us if you would like more information about the safeguards relevant to your information.</p>
    </section>

    <section>
      <h2>How long we keep information</h2>
      <p>The core membership record is normally kept throughout membership and for up to 12 months after membership ends. Records required for accounting, tax, insurance, safety, dispute or legal purposes may be retained for the longer period required by law or reasonably needed for those purposes. Public committee details are updated when roles change. Provider backups and security logs expire according to controlled retention schedules.</p>
      <p>When information is no longer required, we delete it or render it anonymous.</p>
    </section>

    <section>
      <h2>Your data protection rights</h2>
      <p>Depending on the circumstances and our lawful basis, you may have rights to:</p>
      <ul>
        <li>ask for access to your personal information;</li>
        <li>ask us to correct inaccurate or incomplete information;</li>
        <li>ask us to erase or restrict the use of information;</li>
        <li>object to processing based on legitimate interests;</li>
        <li>receive information you provided in a portable format; and</li>
        <li>withdraw consent at any time where processing relies on consent.</li>
      </ul>
      <div className="legal-callout"><strong>Your right to object</strong><p>You may object at any time to processing based on our legitimate interests. Tell us what you object to and why; we will stop unless we have compelling legitimate grounds to continue or need the information for legal claims.</p></div>
      <p>There is usually no fee. We may need to confirm your identity and will normally respond within one calendar month.</p>
    </section>

    <section>
      <h2>Security and junior members</h2>
      <p>We use access controls, encrypted connections, role-based permissions and other organisational and technical safeguards. No internet service can guarantee absolute security, so please keep sign-in links and passwords private.</p>
      <p>Where a junior member’s information is provided, we use it only to administer membership, activities and safety requirements, and involve a parent or guardian where appropriate.</p>
    </section>

    <section>
      <h2>Complaints and changes</h2>
      <p>Please contact the Chairman first so we can try to resolve a concern. You may also complain to the Information Commissioner’s Office at <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noreferrer">ico.org.uk/make-a-complaint</a>, by telephone on 0303 123 1113, or by post at Wycliffe House, Water Lane, Wilmslow, Cheshire, SK9 5AF.</p>
      <p>We review this notice when our services or legal obligations change. Material updates will be identified by the review date above.</p>
    </section>
  </LegalPage>;
}
