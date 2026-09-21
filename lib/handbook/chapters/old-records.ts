import type { HandbookChapter } from "../types";

export const oldRecords: HandbookChapter = {
  slug: "old-records",
  title: "Old records and privacy",
  summary: "Archived, suspended and lapsed members, how long details are kept, and how old records are removed.",
  audience: "officer",
  reviewed: "2026-09-21",
  sections: [
    {
      id: "principle",
      title: "The rule: keep details only as long as needed",
      blocks: [
        { type: "p", text: "The Society’s Privacy Policy keeps a membership record for **up to 12 months after membership ends**. After that a former member’s personal details are removed. The system does this for you, but only after an administrator has checked the list and switched it on. Until then, nobody’s details are removed automatically." },
        { type: "note", tone: "info", text: "Payment amounts and dates are kept for the Society’s accounts even after a person’s details are removed, but without a name." },
      ],
    },
    {
      id: "archived",
      title: "Archived members",
      blocks: [
        { type: "p", text: "**Archiving** takes a member off the active register and closes their website access, without deleting anything. It is used when someone leaves the Society, and by the [MemberMojo import](/admin/handbook/membermojo-import) for members who are no longer in the MemberMojo list." },
        { type: "list", items: [
          "An archived member’s **website account** is deleted automatically about **12 months after** it was archived. Until then an administrator can restore it.",
          "To restore a website account, an administrator opens **Website accounts**, finds the archived account, and presses **Restore member**. The member’s status is worked out again from what they have paid: Active if they are paid for the year, otherwise Grace or Lapsed.",
          "A member archived by the import who has **no website account** has no Restore button. Include them in the next MemberMojo list and the import restores them, or ask the website administrator.",
          "Archived members do not appear on the Members register, do not get renewal emails, and cannot renew online.",
        ] },
        { type: "note", tone: "warning", title: "Permanent deletion", text: "An administrator can permanently delete an archived account, which needs their own password and typing DELETE and the email address. It cannot be undone, and it is refused for anyone under a legal hold, or who holds an administrator or committee role (restore them and remove the role first)." },
      ],
    },
    {
      id: "suspended",
      title: "Suspended members",
      blocks: [
        { type: "p", text: "**Suspending** stops a member’s website access but keeps them on the register, for example while something is being resolved. It is a decision by a person, and the import and the retention rules leave suspended members as they are. An administrator can restore a suspended account." },
      ],
    },
    {
      id: "retention",
      title: "Automatic removal of old records",
      blocks: [
        { type: "p", text: "Setup has an **Old records** tab (administrators can switch it on). It is both the preview and the switch." },
        { type: "list", items: [
          "A record is due for removal after 31 December of the year **after** the last year the member paid for, or, if they never paid, 12 months after it was created. Records that are already past their date are warned as soon as the switch is on.",
          "About a month before, the member is emailed a warning (a Junior’s guardian is copied). The details are removed once the date has passed and the warning is at least 28 days old. Members with no email have nobody to warn and are removed as soon as the date passes.",
          "Removing a record clears the name, contact details, date of birth, guardian, address and newsletter consent, wipes them from applications and emails sent, and deletes any website login. Payment amounts and dates stay, without a name.",
          "**Never removed automatically:** honorary and active members, administrators and committee members, suspended members, anyone under a legal hold, and anyone with a payment still being checked. They show as **held back** for a person to decide.",
        ] },
        { type: "steps", items: [
          "Open **Setup > Old records** and read the lists: who will be removed at the next run, who will be warned, who has been warned and is waiting, who is held back, and who is coming up in the next two months.",
          "If you are happy, an administrator ticks the box to say they have checked, and presses **Switch on automatic removal**.",
          "It can be switched off again at any time.",
        ] },
        { type: "note", tone: "warning", text: "Removal cannot be undone. A lapsed member whose record has been removed has to join again as a new member. Check the list before you switch it on." },
      ],
    },
    {
      id: "requests",
      title: "If a member asks about their data",
      blocks: [
        { type: "p", text: "A member can see and correct their own details from their account. If someone asks for their details to be removed, or you are unsure, tell the website administrator and follow the Privacy Policy. Do not delete records by hand outside the tools described here, because they keep the accounts and the log consistent." },
      ],
    },
  ],
};
