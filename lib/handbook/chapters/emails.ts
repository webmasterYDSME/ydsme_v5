import type { HandbookChapter } from "../types";

export const emails: HandbookChapter = {
  slug: "emails",
  title: "Emails members receive",
  summary: "Which emails the website sends, why some wait in a queue, and what to do when one fails.",
  audience: "officer",
  reviewed: "2026-09-21",
  sections: [
    {
      id: "which",
      title: "Which emails are sent",
      blocks: [
        { type: "p", text: "In website mode the system emails members about their membership. The main ones:" },
        { type: "table", head: ["Email", "When it is sent"], rows: [
          ["Application emails", "Confirming an email address, asking a guardian for consent, and the payment instructions for an application."],
          ["Membership active", "When an application is approved and paid, or a payment is recorded."],
          ["Renewal invitation", "When you press **Send invitations**, and when you send a member a new renewal link. It has the member’s own link, the fee, and every way to pay."],
          ["Renewal reminder", "When you press **Send reminder**."],
          ["Grace and lapsed notices", "Automatically, when a member enters the grace period or lapses. They do not need you to do anything."],
          ["Payment and refund notices", "When a payment is confirmed, refunded, disputed or reversed."],
          ["Type changes and price changes", "When a member moves type at a birthday or 1 January, or a fee changes."],
          ["Honorary notices", "When honorary membership is granted, scheduled, starts or ends."],
          ["Retention warning", "About a month before an old record is removed, if an administrator has switched removal on."],
        ] },
        { type: "p", text: "**Renewal reminders are not automatic.** Nothing chases members unless you press the button. In MemberMojo mode the website sends no membership emails at all, apart from the invitation to use the website." },
        { type: "note", tone: "info", text: "Members with no email address cannot receive any of these. The system makes a task for you in the **To contact** filter instead, with the message they would have received. See [The Inbox](/admin/handbook/inbox#to-contact)." },
      ],
    },
    {
      id: "queue",
      title: "Why some emails wait: the queue",
      blocks: [
        { type: "p", text: "The Society’s email service can send **100 emails a day**. So that a big batch of renewal invitations cannot use the whole allowance and block an important email, every email is placed in one of two classes:" },
        { type: "table", head: ["Class", "What it covers", "How it is sent"], rows: [
          ["Immediate", "Anything a person is waiting for: payment and application results, sign-in codes, booking tickets, alerts to officers, your test email, and a new renewal link.", "Straight away. They may use any of the day’s allowance, and about 30 emails a day are kept back for them."],
          ["Bulk", "Batches and automatic notices: renewal invitations and reminders, grace and lapsed notices, price and type changes, and retention warnings.", "A few at a time, every minute, using only the allowance above the 30 kept back (about 70 a day). A run of 200 invitations can take a few days."],
        ] },
        { type: "p", text: "You see this when you press **Send invitations** or **Send reminder**: the confirmation says the emails go out a few at a time. Nobody needs to press anything again. If the email service says the daily limit has been reached, sending pauses for an hour and carries on by itself." },
        { type: "note", tone: "tip", text: "Members who ask for a new renewal link get it immediately, even in the middle of a big invitation run." },
      ],
    },
    {
      id: "monitoring",
      title: "Watching the queue (administrators)",
      blocks: [
        { type: "p", text: "Administrators have an **Email queue** page (Administration in the sidebar). It shows today’s allowance, what is waiting, how long it should take to clear, and a list of emails you can filter by status (Waiting, Sending, Sent, Failed, Stopped) and class." },
        { type: "list", items: [
          "**Put ticked back in the queue** re-queues emails that failed or were stopped. Tick them first; the button is only available when something is ticked.",
          "**Stop ticked** cancels waiting emails you no longer want sent.",
          "Emails that fail are retried automatically a few times before they appear as Failed.",
        ] },
      ],
    },
    {
      id: "failed",
      title: "When an email fails",
      blocks: [
        { type: "p", text: "A failed email appears in **Problems** as **Email could not be delivered**, with the member’s name and the subject." },
        { type: "steps", items: [
          "Open it and check the member’s email address on their record. A typo is the most common cause.",
          "Correct the address if needed (the member confirms a new address themselves).",
          "Press **Retry**. It is refused while the address is blocked (see below).",
        ] },
        { type: "p", text: "A **bounce** (the address does not exist), a **complaint** (the member marked the email as spam) or a **stopped delivery** blocks that address for membership emails, so we do not keep writing to someone who does not want it. Contact the member another way, then press **Mark as dealt with**. That clears the task but does not lift the block on the address." },
      ],
    },
  ],
};
