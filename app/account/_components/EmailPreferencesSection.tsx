import { ShieldCheck } from "lucide-react";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { setNewsletterPreference } from "@/lib/actions/account";
import type { NewsletterPreference } from "@/lib/newsletter-preference";
import { date } from "../format";
import { Section } from "./Section";
import { SectionNotice, type SectionMessage } from "./SectionMessage";
import styles from "../account.module.css";

/** The one optional email the Society sends. Everything else is a system email and cannot be switched off here. */
export function EmailPreferencesSection({ newsletter, message }: { newsletter: NewsletterPreference | null; message: SectionMessage | null }) {
  return <Section id="email-preferences" title="Email preferences" description="Choose whether you would like the Society newsletter. It is optional, and you can change your mind at any time.">
    <SectionNotice message={message}/>
    <Newsletter newsletter={newsletter}/>
    <p className={styles.note} role="note">
      <ShieldCheck aria-hidden="true"/>
      <span><strong>System emails will still be sent.</strong> Whatever you choose here, we will still email you the messages you need to use your account and membership: sign-in links, confirmations when you change an email address, and important notices about your account or membership, such as renewals and receipts. These are not part of the newsletter and cannot be switched off.</span>
    </p>
  </Section>;
}

function Newsletter({ newsletter }: { newsletter: NewsletterPreference | null }) {
  if (!newsletter) return <p className={styles.empty}>We could not load your newsletter choice just now. Please try again shortly.</p>;
  if (!newsletter.linked) {
    return <p className={styles.empty}>Newsletter choices are kept on your membership record, and this account is not linked to one yet. A membership officer can link it for you.</p>;
  }

  const { subscribed, email } = newsletter;
  const explanation = !email
    ? "Add a membership email address (see Sign-in and contact) to be able to receive the newsletter."
    : newsletter.addressBlocked
      ? "Emails to your membership address could not be delivered, so it cannot be added to the newsletter. Please contact the membership officer."
      : newsletter.optedIn && newsletter.mailboxUnsubscribed
        ? `This mailbox was unsubscribed using the link in a newsletter. Subscribe to start receiving it again at ${email}.`
        : subscribed
          ? `News, events and projects from York Model Engineers, sent to ${email}.`
          : `News, events and projects from York Model Engineers, sent to ${email} if you subscribe.`;
  const canChange = Boolean(email) && !newsletter.addressBlocked;

  return <div className={styles.pref}>
    <div className={styles.prefText}>
      <div className={styles.prefTitle}>
        <strong>Society newsletter</strong>
        <span className={`${styles.status} ${subscribed ? styles.statusOn : styles.statusOff}`}>{subscribed ? "Subscribed" : "Not subscribed"}</span>
      </div>
      <p>{explanation}</p>
      {subscribed && newsletter.since ? <small>Subscribed since {date(newsletter.since)}</small> : null}
    </div>
    {canChange ? <form action={setNewsletterPreference}>
      <input type="hidden" name="subscribe" value={subscribed ? "no" : "yes"}/>
      <PendingSubmitButton className={subscribed ? "button outline" : "button dark"} pendingLabel="Saving…">{subscribed ? "Unsubscribe" : "Subscribe"}</PendingSubmitButton>
    </form> : null}
  </div>;
}
