import type { HandbookChapter } from "../types";

export const membershipYear: HandbookChapter = {
  slug: "membership-year",
  title: "The membership year",
  summary: "The calendar: when membership ends, when the grace period starts and stops, and what happens to each kind of member.",
  audience: "officer",
  websiteMode: true,
  reviewed: "2026-09-21",
  sections: [
    {
      id: "calendar",
      title: "The calendar at a glance",
      blocks: [
        { type: "p", text: "A membership year is the calendar year: 1 January to 31 December. All dates and times use UK time." },
        { type: "table", head: ["When", "What happens"], rows: [
          ["November", "The daily job prepares the age changes for next year (see [Membership types and fees](/admin/handbook/types-and-fees#age-changes)). If renewals have not been opened by 20 November, the Inbox shows a Problem to remind you."],
          ["Any time from November", "You open renewals for next year and send the invitations. See [Renewals](/admin/handbook/renewals)."],
          ["December", "The renewal year moves on to next year for anyone joining or renewing in December. Members can pay for next year by card, and you can record their cash, cheque or bank payments."],
          ["1 January", "Last year’s paid term ends. Anyone who has not paid for the new year moves to **Grace**. They keep full access. Age changes take effect: someone who has turned 18 moves from Junior to Adult, and so on."],
          ["1 March", "The grace period ends. Anyone still unpaid becomes **Lapsed**: their website account is closed, and the renewal link in their invitation email stops working."],
          ["After 1 March", "A lapsed member can still come back. You send them a new renewal link (see [Bringing back a lapsed member](/admin/handbook/renewals#lapsed)). They pay a part-year fee for the months left."],
          ["12 months after membership ends", "Old records are anonymised, but only if an administrator has switched that on. See [Old records and privacy](/admin/handbook/old-records)."],
        ] },
        { type: "note", tone: "info", title: "The grace period is one rule", text: "The end of the grace period (1 March) is set in one place in the system, so the emails, the renewal link and the daily job all agree. If the Society ever wants a different date, ask the website administrator to change it there rather than working around it." },
      ],
    },
    {
      id: "states",
      title: "What each status means",
      blocks: [
        { type: "table", head: ["Status", "Meaning", "Can the member sign in?"], rows: [
          ["Active", "Paid for the current year.", "Yes"],
          ["Grace", "The year has ended and they have not yet renewed. Runs from 1 January to the end of the grace period.", "Yes"],
          ["Lapsed", "The grace period ended without a payment.", "No. They are told to ask the membership officer for a new link."],
          ["Honorary", "A lifetime honorary member: no fee, no renewals.", "Yes"],
          ["Payment being checked", "A payment is under review, for example a refund or a dispute. You decide the outcome from the Inbox.", "Yes, until you decide"],
          ["Suspended", "Access stopped by an officer or administrator.", "No"],
          ["Archived", "Removed from the active register but not deleted. See [Old records and privacy](/admin/handbook/old-records#archived).", "No"],
        ] },
        { type: "p", text: "The status changes by itself as dates pass, a payment is recorded or a member is made honorary. You never type a status in; you record the event that causes it." },
      ],
    },
    {
      id: "daily-job",
      title: "The daily job",
      blocks: [
        { type: "p", text: "Once a day the website runs a job that moves members into and out of grace, applies age changes and sends the automatic notices (grace, lapsed). If it misses days it catches up on the next run. If it has not run for three days, the Inbox shows a Problem called **Daily membership updates have stopped**; ask the website administrator to check it." },
      ],
    },
  ],
};
