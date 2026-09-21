import type { HandbookChapter } from "../types";

export const typesAndFees: HandbookChapter = {
  slug: "types-and-fees",
  title: "Membership types and fees",
  summary: "The types of membership, their age limits, how fees are changed, and how members move between types as they age.",
  audience: "officer",
  websiteMode: true,
  reviewed: "2026-09-21",
  sections: [
    {
      id: "where",
      title: "Where to find them",
      blocks: [
        { type: "p", text: "On the [Renewals](/admin/memberships/renewals) tab, the card at the top shows the fees for the year you are looking at, with a **Fees and types** link. That link opens a panel listing every membership type with its fee for each year. From the panel:" },
        { type: "list", items: [
          "**Change fee** sets a new annual fee for one type, from a year you choose.",
          "**Edit type** changes the description, the youngest and oldest age, whether applications need approval, and whether the type is offered on the application form.",
        ] },
        { type: "p", text: "Closing either form returns you to the list. A warning on a type means it has no fee for one of the years, and online payment cannot work until it does; saving the fee again fixes it." },
      ],
    },
    {
      id: "types",
      title: "The types",
      blocks: [
        { type: "table", head: ["Type", "Ages", "Notes"], rows: [
          ["Junior associate", "14 to 17", "Needs approval. A parent or guardian gives consent and receives the emails. Juniors have no website login of their own."],
          ["Student", "18 to 24", "Needs approval: the applicant declares they are a student and an officer checks."],
          ["Adult", "18 to 79", "The standard membership."],
          ["Concession", "80 and over", "Needs approval."],
        ] },
        { type: "p", text: "The limits shown here are the ones currently set. If the Society changes them, use **Edit type**; the application form and the age changes follow." },
      ],
    },
    {
      id: "changing-a-fee",
      title: "Changing a fee",
      blocks: [
        { type: "steps", items: [
          "Open **Fees and types** and choose **Change fee** on the type.",
          "Choose the year the change **starts in** and type the new annual fee.",
          "Read the note. Fees already paid do not change. Members on that type are told the new price, and members who renew by card are switched to it.",
          "Press **Save fee** and confirm. The confirmation says how many members will be told.",
        ] },
        { type: "note", tone: "tip", title: "Fees carry on from year to year", text: "You set a fee once and it stays the same for later years until you change it again. Only change it when the amount actually changes." },
        { type: "note", tone: "warning", text: "Renewals cannot be opened for a year while a type that is on offer has no fee for that year. The Renewals card tells you which one." },
      ],
    },
    {
      id: "age-changes",
      title: "Age changes",
      blocks: [
        { type: "p", text: "Members move between types as they age. The rule is applied to the age they will be **on 1 January of the year**:" },
        { type: "list", items: [
          "A **Junior** who is 18 or over becomes **Adult**.",
          "A **Student** who is 25 or over becomes **Adult**.",
          "An **Adult** who is 80 or over becomes **Concession**.",
        ] },
        { type: "p", text: "The daily job prepares next year’s changes in November and applies them on 1 January. The renewal invitation, the renewal page, the card payment and the amount you record all use the new type’s fee, so nobody is charged at the wrong rate. A Student turning 25 or someone who may still qualify for Student is decided by an officer (see the Requests filter in [The Inbox](/admin/handbook/inbox#requests)); until you decide, they cannot pay for that year." },
        { type: "note", tone: "warning", text: "A member without a date of birth cannot be moved automatically. Add the date of birth to their record when you have it. People imported from MemberMojo may have none; the import preview lists them." },
      ],
    },
    {
      id: "part-year",
      title: "Part-year fees",
      blocks: [
        { type: "p", text: "A **lapsed** member who comes back part-way through the year pays a **part-year fee**: the annual fee times the months left, divided by 12, with December counting as a full year and January as a whole year. It is the same as a new member joining that month." },
        { type: "p", text: "Someone still in grace, or anyone paying for next year (for example in December), pays the full fee. The renewal email, the renewal page and the amount box on Record payment all show the right figure and say why." },
      ],
    },
  ],
};
