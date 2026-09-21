import type { HandbookChapter } from "../types";

export const troubleshooting: HandbookChapter = {
  slug: "troubleshooting",
  title: "When something looks wrong",
  summary: "Common questions and what to do about them.",
  audience: "officer",
  reviewed: "2026-09-21",
  sections: [
    {
      id: "members",
      title: "A member cannot sign in or has lost access",
      blocks: [
        { type: "table", head: ["What the member says", "What to check", "What to do"], rows: [
          ["“It says my membership has lapsed.”", "Their status on the record is Lapsed.", "Send them a new renewal link (see [Bringing back a lapsed member](/admin/handbook/renewals#lapsed)) or record their payment. Their access returns as soon as it is recorded."],
          ["“It says my access is not active.”", "Their website account may be suspended or archived.", "An administrator can restore it on **Website accounts**. If they were archived by the MemberMojo import, check whether they should be in the list."],
          ["“I paid but I am still lapsed.”", "Look for the payment on their record, then the Inbox, then Stripe if it was by card.", "Record the payment if it arrived by cash, cheque or bank. If it was a card payment that is not shown, look in Problems for **Confirmed payment could not be recorded**."],
          ["“I never got an invitation.”", "Do they have an email address on the record? Is the invitation still waiting in the queue?", "Look in **Problems** for a failed email. Administrators can check the [email queue](/admin/handbook/emails#monitoring). A single member can be sent a new renewal link at once."],
          ["“I have two accounts.”", "Search the register by name and by email.", "Keep the record with the payment history. Ask the website administrator to help merge or remove the other."],
        ] },
      ],
    },
    {
      id: "renewals",
      title: "Renewals",
      blocks: [
        { type: "table", head: ["Problem", "What to do"], rows: [
          ["The Open renewals button is greyed out, or a message says a fee is missing.", "A membership type that is on offer has no fee for the year. Open **Fees and types** from the card and set it. See [Membership types and fees](/admin/handbook/types-and-fees)."],
          ["The Send reminder button is greyed out.", "Nobody can be reminded: they have all paid, were all reminded in the last 7 days, or the invitation has not been sent."],
          ["I pressed Send invitations and nothing has arrived.", "The emails join a queue and go out a few at a time, within 100 emails a day. See [Why some emails wait](/admin/handbook/emails#queue)."],
          ["A member’s link says it has expired.", "Links last until the grace period ends. Send a new link from their record."],
          ["A renewal shows the wrong fee.", "Check the member’s date of birth (age changes apply from 1 January) and whether they are lapsed (part-year fee). See [Part-year fees](/admin/handbook/types-and-fees#part-year)."],
        ] },
      ],
    },
    {
      id: "inbox",
      title: "The Inbox",
      blocks: [
        { type: "list", items: [
          "**A task will not go away.** Most tasks clear when the thing they are about is dealt with. If you have done that and it is still there, reload the page. To contact tasks and bounces need **Mark as contacted** or **Mark as dealt with**.",
          "**The number in the sidebar differs from the Inbox.** They are the same count; the sidebar can take a moment to catch up. Reload the page.",
          "**A member has no email address and nothing has been sent.** That is by design: you will find a task under To contact with the message to pass on.",
        ] },
      ],
    },
    {
      id: "mistakes",
      title: "I have made a mistake",
      blocks: [
        { type: "list", items: [
          "**Recorded a payment against the wrong member or year.** Use **Report a problem** on the payment line and explain. Then record the payment correctly.",
          "**Made someone honorary by mistake.** Use **End honorary** on their record.",
          "**Sent something I should not have.** Emails already sent cannot be recalled. Tell the member, and let the website administrator know if it was a large batch.",
          "**Imported the wrong file.** Import the right file: people the wrong import archived come back automatically. Members it added are added as full members and would need removing by an administrator.",
          "**Not sure what happened.** The **Important changes** page (administrators) shows who did what and when.",
        ] },
      ],
    },
    {
      id: "administrator",
      title: "Tell the website administrator when",
      blocks: [
        { type: "list", items: [
          "A screen will not load, or shows an error.",
          "Card payments are not appearing, or a Problem says a confirmed payment could not be recorded.",
          "Emails are not arriving at all, or the Email queue looks stuck.",
          "The daily job has stopped.",
          "You think the mode (MemberMojo or website) is wrong.",
        ] },
      ],
    },
  ],
};
