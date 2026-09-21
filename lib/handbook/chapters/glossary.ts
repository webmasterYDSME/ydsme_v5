import type { HandbookChapter } from "../types";

export const glossary: HandbookChapter = {
  slug: "glossary",
  title: "Glossary",
  summary: "The words used on the membership screens, in one place.",
  audience: "everyone",
  reviewed: "2026-09-21",
  sections: [
    {
      id: "words",
      title: "Words and what they mean",
      blocks: [
        { type: "table", head: ["Word", "Meaning"], rows: [
          ["Active", "A member who has paid for the current year."],
          ["Anonymised", "A former member’s personal details have been removed under the retention rules. Payment amounts and dates remain, without a name."],
          ["Archived", "Off the active register and without website access, but not deleted. Can be restored for a limited time."],
          ["Billing year", "The year a payment is for. It is this year, except in December, when it is next year."],
          ["Bulk email", "An email sent as part of a batch. It waits in the queue and goes out a few at a time."],
          ["Committee login", "A website account that belongs to a committee member. Never archived by the import."],
          ["Grace period", "The time after a membership year ends when an unpaid member still has access: 1 January to the end of the grace period (1 March)."],
          ["Guardian", "The parent or carer of a Junior member. Receives the emails and gives consent."],
          ["Honorary", "A lifetime member who pays nothing and never renews."],
          ["Immediate email", "An email sent straight away because someone is waiting for it."],
          ["Important changes", "The log of who changed what and when."],
          ["Invitation", "The email that gives a member their personal renewal link. Also the email that invites someone to the website."],
          ["Lapsed", "The grace period ended without a payment. Website access is closed."],
          ["Membership officer", "A committee member (or administrator) responsible for the membership register."],
          ["Part-year fee", "The reduced fee a lapsed member pays when they come back part-way through the year."],
          ["Payment being checked", "A payment that is under review, for example a refund or dispute."],
          ["Register", "The list of everyone who is a member, with their type and what they have paid."],
          ["Retention", "The rules about how long a former member’s details are kept."],
          ["Source of truth", "The list that is treated as correct when two lists disagree. For now, MemberMojo’s list."],
          ["Suspended", "Website access stopped by a person, but the member stays on the register."],
          ["Term", "One membership year for one member, with its fee and whether it is paid."],
          ["Website login", "A member’s sign-in account for the website. Separate from their membership record."],
        ] },
      ],
    },
  ],
};
