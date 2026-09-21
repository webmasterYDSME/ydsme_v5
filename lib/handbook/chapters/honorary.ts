import type { HandbookChapter } from "../types";

export const honorary: HandbookChapter = {
  slug: "honorary",
  title: "Honorary members",
  summary: "Lifetime honorary membership: how to grant it, what it changes, and how to end it.",
  audience: "officer",
  websiteMode: true,
  reviewed: "2026-09-21",
  sections: [
    {
      id: "what-it-is",
      title: "What honorary membership is",
      blocks: [
        { type: "p", text: "A **lifetime honorary** member pays nothing, has no yearly renewal, and keeps their website access. They are never sent renewal invitations or reminders, and never appear as waiting on the Renewals list (they show as **Not due**). Honorary members are also never removed automatically under the retention rules." },
        { type: "p", text: "Honorary members still have to be recorded properly, with a reason, because it is a decision by the Society and is written to the Important changes log." },
      ],
    },
    {
      id: "existing-member",
      title: "Making an existing member honorary",
      blocks: [
        { type: "steps", items: [
          "Open the member’s record and press **Make honorary**.",
          "The **start date** is today by default. Choose a later date if the honour begins in the future.",
          "Write the **reason** (at least a few words), for example “Life member, elected at the AGM”.",
          "Press **Make honorary**.",
        ] },
        { type: "note", tone: "info", text: "With a start date in the future the member stays as they are (Active) until that day, then becomes Honorary. Until then the renewal invitations skip them, because the honour will cover the year." },
        { type: "note", tone: "warning", text: "If a payment was taken for a year that honorary membership will cover, a **Honorary payment clash** appears in Problems for you to decide. See [The Inbox](/admin/handbook/inbox#problems)." },
      ],
    },
    {
      id: "new-honorary",
      title: "Adding someone who is not yet on the register",
      blocks: [
        { type: "p", text: "Choose **Add membership**, then **Lifetime honorary** instead of Regular membership. Enter their name and, if you have them, date of birth, email and telephone, plus the start date and the reason. If the email address or the name and date of birth match someone already on the register, you are stopped until you either use that record or give a reason for continuing; a match on the name alone is only a warning." },
        { type: "note", tone: "info", text: "If the person has an email address and the start date is today or earlier, they are invited to the website straight away. If the start date is in the future, no invitation is sent yet, and nothing sends it when the date arrives, so invite them from their record then." },
      ],
    },
    {
      id: "ending",
      title: "Ending honorary membership",
      blocks: [
        { type: "p", text: "On an honorary member’s record, **End honorary** asks for the membership type they move to, the date the change takes effect, and a reason. If the change falls part-way through a year, a reduced fee is due for the rest of that year; the record and the renewal invitation show it." },
      ],
    },
    {
      id: "membermojo",
      title: "Honorary members from MemberMojo",
      blocks: [
        { type: "p", text: "In the MemberMojo list, **Life (Honorary)** and **Associate Volunteer** are treated as lifetime honorary members. A new person of either type is added as honorary automatically. If such a person is already on the register as an ordinary member, the import leaves them alone and lists them; make them honorary from their record. See [The MemberMojo list](/admin/handbook/membermojo-import)." },
      ],
    },
  ],
};
