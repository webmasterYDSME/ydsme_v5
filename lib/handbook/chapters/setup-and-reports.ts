import type { HandbookChapter } from "../types";

export const setupAndReports: HandbookChapter = {
  slug: "setup-and-reports",
  title: "Setup, reports and payment details",
  summary: "The treasurer’s payment details, bookkeeping downloads, and the other settings you touch rarely.",
  audience: "officer",
  websiteMode: true,
  reviewed: "2026-09-21",
  sections: [
    {
      id: "payment-details",
      title: "Payment details",
      blocks: [
        { type: "p", text: "**Setup > Payment details** holds the treasurer’s details for members who pay by bank transfer, cheque or cash: the account name, sort code and account number, who cheques are made payable to, and instructions for cash and cheques. They are printed in the applicant instructions and the renewal emails." },
        { type: "list", items: [
          "Press **Save payment details** to save. A change affects only emails sent from then on. Emails already sent keep the details they went out with, so an old email will still show the old account.",
          "The treasurer’s telephone number is optional and is not shown to members. The treasurer’s email address is the public **Email Membership Officer** link on the application page.",
          "Check the details carefully. A wrong sort code in a renewal email sends money to the wrong place, and it cannot be recalled from the emails already sent.",
        ] },
        { type: "note", tone: "tip", text: "After you change the details, use **Send me a test** on the Renewals card to see exactly what members will get." },
      ],
    },
    {
      id: "reports",
      title: "Reports",
      blocks: [
        { type: "p", text: "**Setup > Reports** prepares a download of the complete membership records, with a summary and the financial totals, for the treasurer and the accounts." },
        { type: "steps", items: [
          "Press **Prepare records download**. It is prepared in the background.",
          "When the row says **Complete membership records**, download it.",
          "Downloads stay available for 24 hours. Prepare a new one after that. If a row says **Report needs retrying**, press the button again.",
        ] },
        { type: "note", tone: "warning", text: "A download contains members’ personal details. Keep it only as long as you need it, store it securely, and delete it afterwards." },
      ],
    },
    {
      id: "old-records",
      title: "Old records",
      blocks: [
        { type: "p", text: "The **Old records** tab lists former members who are due to have their details removed. Administrators switch removal on. See [Old records and privacy](/admin/handbook/old-records)." },
      ],
    },
    {
      id: "before-you-change",
      title: "Before you change anything here",
      blocks: [
        { type: "list", items: [
          "Fees and membership types are not in Setup: they live on the Renewals tab. See [Membership types and fees](/admin/handbook/types-and-fees).",
          "Email limits, the queue and the choice between MemberMojo and website mode are for the website administrator.",
        ] },
      ],
    },
  ],
};
