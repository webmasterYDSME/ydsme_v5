import type { HandbookChapter } from "../types";

export const payments: HandbookChapter = {
  slug: "payments",
  title: "Payments",
  summary: "How members pay, how to record cash, cheque and bank payments, and what to do when the amount is wrong or a payment goes astray.",
  audience: "officer",
  websiteMode: true,
  reviewed: "2026-09-21",
  sections: [
    {
      id: "ways-to-pay",
      title: "How members can pay",
      blocks: [
        { type: "table", head: ["Method", "How it works", "Recorded by"], rows: [
          ["Bank transfer (preferred)", "No card fee, so the whole payment reaches the Society. The email gives the account name, sort code and account number, the amount, and the reference to use, which is the member’s full name.", "You"],
          ["Card", "The member pays through their personal link. It is one payment, and nothing is set up to charge them again.", "The website, automatically"],
          ["Cheque", "Made payable to the Society and delivered as the instructions say.", "You: when received, and when cleared"],
          ["Cash", "Handed over as the instructions say.", "You"],
        ] },
        { type: "p", text: "The bank details in every email come from **Setup > Payment details** (see [Setup, reports and payment details](/admin/handbook/setup-and-reports#payment-details)). Emails already sent keep the details they were sent with." },
      ],
    },
    {
      id: "recording",
      title: "Recording a cash, cheque or bank payment",
      blocks: [
        { type: "p", text: "You can start from an Inbox payment task, from **Record payment** on a member’s record, or from **Record payment** in the Renewals list. They all open the same panel." },
        { type: "steps", items: [
          "Choose the **year** you are recording for, if it is not already right.",
          "Choose the method and enter the **date received**. The date cannot be in the future.",
          "Check the **Amount received**. It is filled in with the fee, including the part-year fee for a lapsed member.",
          "Add the reference (bank reference or cheque number) if there is one.",
          "Confirm. The membership is marked paid, the member’s status updates, and, if they had an open card payment page, that page is closed so they cannot pay twice.",
        ] },
      ],
    },
    {
      id: "wrong-amount",
      title: "When the amount is not the fee",
      blocks: [
        { type: "table", head: ["Amount received", "What happens"], rows: [
          ["Exactly the fee", "The membership is activated."],
          ["Less than the fee", "Nothing is activated. The payment is noted, and you are asked to collect the balance. Record it again when the rest arrives."],
          ["More than the fee", "The membership is activated for the fee. You must write a note saying what will happen to the extra (for example, treated as a donation, or returned). The extra is written to the Important changes log."],
        ] },
      ],
    },
    {
      id: "problems",
      title: "When a payment goes wrong",
      blocks: [
        { type: "list", items: [
          "**A recorded payment was wrong** (a cheque bounced, or you keyed the wrong amount): on the member’s record, use **Report a problem** on that payment line and explain. Do not record an opposite payment.",
          "**A refund is owed** because you declined an application after they paid: a **Refund to arrange** task appears in Problems. Refund them, then press **Mark as refunded** with a note.",
          "**A card payment was made twice**: a Problem appears with a link to Stripe to refund the second one.",
          "**A card payment was taken but the membership did not update**: a Problem says the payment could not be recorded. Tell the website administrator; the payment is safe and will be applied once fixed.",
          "**A member says they paid but you cannot see it**: check their record first, and the Inbox. If it is a card payment, check Stripe. Do not ask them to pay again until you know.",
        ] },
        { type: "note", tone: "info", text: "Every payment you record, correct or refund is written to the Important changes log with your name." },
      ],
    },
    {
      id: "money-after-the-fact",
      title: "Payment records and privacy",
      blocks: [
        { type: "p", text: "When an old member record is anonymised (see [Old records and privacy](/admin/handbook/old-records)), payment amounts and dates are kept for the Society’s accounts, but the name, references and notes are removed." },
      ],
    },
  ],
};
