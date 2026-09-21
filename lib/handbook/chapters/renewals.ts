import type { HandbookChapter } from "../types";

export const renewals: HandbookChapter = {
  slug: "renewals",
  title: "Renewals",
  summary: "Opening renewals, sending invitations and reminders, checking who has paid, and bringing back lapsed members.",
  audience: "officer",
  websiteMode: true,
  reviewed: "2026-09-21",
  sections: [
    {
      id: "overview",
      title: "How renewals work",
      blocks: [
        { type: "p", text: "Renewals are run by you, from the [Renewals](/admin/memberships/renewals) tab, not by the calendar. **Nothing is sent to members automatically.** The steps are: open renewals for the year, send the invitations, chase with reminders if you want to, and record any payments that arrive by cash, cheque or bank transfer. Card payments record themselves." },
        { type: "p", text: "Choose the year with the year chips at the top of the card. By default it shows next year, unless only this year’s renewals are open. The card shows whether the year is **Open** or **Not opened yet**, the fees for the year, how many members were **invited**, **renewed** and are **waiting**, and when the last reminder went out." },
      ],
    },
    {
      id: "opening",
      title: "Opening renewals and sending invitations",
      blocks: [
        { type: "steps", items: [
          "Check the fees for the year on the card. Every membership type that is on offer needs one (see [Membership types and fees](/admin/handbook/types-and-fees)).",
          "Press **Open renewals**. This opens the year, so members can renew online, but nobody is emailed yet.",
          "Press **Send me a test**. It emails only you, with a copy of the invitation, so you can check the wording, the fee and the payment details before anyone else sees it.",
          "Press **Send invitations**. Each member who can renew gets an email with their personal renewal link, their fee and every way to pay. The confirmation says how many will be queued.",
        ] },
        { type: "p", text: "Nobody is invited twice for the same year. If you add members later, or some were missed, the **Send invitations** button appears again and invites only the people who have not had one yet." },
        { type: "note", tone: "info", title: "Invitations do not all go at once", text: "The Society’s email service can send only 100 emails a day, so invitations join a queue and go out in small batches. A large invitation run can take a few days. See [Emails members receive](/admin/handbook/emails#queue) for how the queue works and how to watch it." },
        { type: "note", tone: "info", title: "Who is not invited", text: "Honorary members are skipped, as are members who are suspended or archived, and members whose payment is being checked. Members with no email address are not emailed; the card shows how many, and you contact them another way (see the To contact filter in [The Inbox](/admin/handbook/inbox#to-contact))." },
      ],
    },
    {
      id: "reminders",
      title: "Sending reminders",
      blocks: [
        { type: "p", text: "**Send reminder** queues a reminder email for members who were invited but have not paid. It is manual: press it when you want to chase, as often as you like." },
        { type: "list", items: [
          "It reaches only invited members with an email address who are Active, in Grace or Lapsed, have no paid or part-paid term for the year, and are not covered by honorary membership.",
          "The invitation email must already have been **sent**. A reminder never goes ahead of the invitation.",
          "A member is reminded **at most once every 7 days**, however many times you press the button.",
          "Reminders carry the member’s own renewal link, the same one as in their invitation, so they expire on the same day. After the link has expired a reminder cannot reach anyone.",
        ] },
        { type: "p", text: "The card shows when the last reminder was sent. The button is greyed out when nobody can be reminded." },
      ],
    },
    {
      id: "link-expiry",
      title: "How long the renewal link lasts",
      blocks: [
        { type: "p", text: "A member’s renewal link works until the **end of the grace period**, so a link for 2027 stops on 1 March 2027 (the email says it works until 28 February). The renewal page also needs renewals to be open, and it will not take a payment from a suspended, archived, honorary or payment-being-checked member." },
        { type: "p", text: "After the link has expired, the member sees a message asking them to contact the membership officer, who can send a new link (next section)." },
      ],
    },
    {
      id: "waiting-list",
      title: "Who has renewed",
      blocks: [
        { type: "p", text: "The card at the bottom of the tab is the working list. Search by name or email, and use **Waiting**, **Renewed** and **All** to filter. The status tells you where each person stands:" },
        { type: "table", head: ["Status", "Meaning"], rows: [
          ["Waiting", "Has not renewed yet."],
          ["Renewed", "Paid for the year."],
          ["Checking", "A payment is being reviewed."],
          ["Not due", "Nothing to pay: honorary cover, a Student request waiting for you, or no fee."],
        ] },
        { type: "p", text: "**Record payment** on a row opens the payment panel (see [Payments](/admin/handbook/payments)). The name links to the full record." },
      ],
    },
    {
      id: "lapsed",
      title: "Bringing back a lapsed member",
      blocks: [
        { type: "p", text: "A member who lapses can no longer sign in, cannot pay from their account, and cannot re-apply (the application says they are already a member). Their record is kept until the retention rules apply, so you can always bring them back." },
        { type: "steps", items: [
          "Make sure renewals are open for the current year (or next year, in December).",
          "Open the member’s record and press **Send new renewal link**, or press **Send new link** beside their name in the Renewals list. The member must have an email address.",
          "The member is emailed straight away. The link lasts 30 days and shows the **part-year fee**. If you send another later, the earlier link stops working.",
          "They pay online, or you record a payment. Their account and status come back as soon as it is recorded.",
        ] },
        { type: "note", tone: "warning", text: "A lapsed member cannot be brought back once their record has been anonymised under the retention rules. They would have to join again as a new member." },
      ],
    },
    {
      id: "after-the-deadline",
      title: "After the grace period",
      blocks: [
        { type: "p", text: "On 1 March, unpaid members lapse and their links stop working. That is automatic. You do not need to press anything; just be ready to send a new link when someone gets in touch. Members who lapse get an email telling them how to come back, and those with no email address appear in your To contact list." },
      ],
    },
  ],
};
