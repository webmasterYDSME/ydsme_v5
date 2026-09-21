import type { HandbookChapter } from "../types";

export const members: HandbookChapter = {
  slug: "members",
  title: "Members and their records",
  summary: "Finding a member, reading their record, adding a new member, and changing their details.",
  audience: "officer",
  websiteMode: true,
  reviewed: "2026-09-21",
  sections: [
    {
      id: "register",
      title: "The register",
      blocks: [
        { type: "p", text: "**Members** lists everyone on the register. Search by name or email address, filter by status with the chips, and use the page controls at the bottom. Each row shows the member’s type, status and the year they are paid to. **View membership** opens the record." },
        { type: "p", text: "Archived members are not on the register (see [Old records and privacy](/admin/handbook/old-records#archived)). Members who have been anonymised are gone for good." },
      ],
    },
    {
      id: "record",
      title: "A member’s record",
      blocks: [
        { type: "p", text: "The record page shows the person’s status, type and the year they are paid to, with the main actions in the header." },
        { type: "list", items: [
          "**Record payment** records cash, cheque or bank payments for a year. See [Payments](/admin/handbook/payments).",
          "**Make honorary** or **End honorary**. See [Honorary members](/admin/handbook/honorary).",
          "**Send new renewal link**, for a lapsed member who has an email address. See [Renewals](/admin/handbook/renewals#lapsed).",
          "The left card lists each membership year with its status and amount, then each payment with method, amount, date, reference and who recorded it. A paid cash, cheque or bank payment has a **Report a problem** link if it turns out to be wrong (for example, a cheque that bounced).",
          "The right column has **Contact** (change email, phone or address), **Personal details** with their age (correct the date of birth or eligibility), and **Website login** (assign or remove the sign-in account).",
        ] },
        { type: "note", tone: "info", text: "Changing a member’s email address asks the new address to confirm it first, so a typo cannot lock someone out or send their emails to a stranger." },
      ],
    },
    {
      id: "adding",
      title: "Adding a new member",
      blocks: [
        { type: "p", text: "Use **Add membership** (top right) for someone who joins on paper, in person or by phone. The form is one column, top to bottom." },
        { type: "steps", items: [
          "Enter the name, date of birth and contact details. The membership type is worked out from the date of birth and the fee shown; the form warns you if the person seems to be on the register already (same email, or same name and date of birth). If they are a real duplicate, cancel and use the existing record. If not, give a short reason and carry on.",
          "For a **Junior** (under 18), the guardian section appears. Enter the guardian’s details and how consent was given. A Junior never gets their own website login; the guardian’s account is used.",
          "Choose whether the fee is **Paid in full** or **Not yet paid**. If paid, add the reference (and, for a cheque, whether it has cleared). If not paid, a payment task is created in the Inbox.",
          "If the person agrees to the newsletter, tick it and record **how** they agreed (paper form, in person or by phone) and the date. A newsletter subscription needs an email address, and the agreement must be recorded, so we can show it later.",
          "Save. The drawer offers **Open record**, **Add another** and **Done**.",
        ] },
        { type: "note", tone: "tip", text: "Names are tidied so each part starts with a capital, and capitals you type yourself are kept (McDonald stays McDonald). Check the spelling rather than relying on the tidy-up." },
      ],
    },
    {
      id: "logins",
      title: "Website logins",
      blocks: [
        { type: "p", text: "A member’s **website login** is a separate thing from their membership. A membership can exist without a login (a member who does not use the website), and a login is linked to one membership." },
        { type: "list", items: [
          "**Assign** a login to link an existing sign-in account to the member. **Remove** it to unlink it. When a login is left with no membership it is suspended, unless it belongs to an officer or a committee member.",
          "Two members cannot share one login. A husband and wife who share an email address each need their own account, or one of them goes without.",
          "Juniors (under 18) cannot have their own login. When they turn 18 they become Adult and a login can be assigned.",
          "A member’s login follows their membership: when they lapse, their access closes; when they renew, it reopens.",
        ] },
      ],
    },
    {
      id: "corrections",
      title: "Correcting details",
      blocks: [
        { type: "list", items: [
          "**Date of birth wrong?** Use **Correct** under Personal details. You must give a reason (at least a few words); it is written to the Important changes log with the old and new dates. Ages are counted on 1 January, so the correction can change which type the member moves to at the next year’s changes. See [Age changes](/admin/handbook/types-and-fees#age-changes).",
          "**Wrong contact details?** Use **Change** under Contact. A new email address has to be confirmed by the member first.",
          "**Wrong payment?** Use **Report a problem** on the payment line. Do not record a second payment to cancel the first.",
        ] },
      ],
    },
  ],
};
