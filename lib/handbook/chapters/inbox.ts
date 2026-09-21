import type { HandbookChapter } from "../types";

export const inbox: HandbookChapter = {
  slug: "inbox",
  title: "The Inbox",
  summary: "Every task that needs a person, what each kind means, and how to clear it.",
  audience: "officer",
  websiteMode: true,
  reviewed: "2026-09-21",
  sections: [
    {
      id: "how-it-works",
      title: "How the Inbox works",
      blocks: [
        { type: "p", text: "The Inbox lists every open task in one place, oldest first, so nothing waits behind something newer. The number on the **Inbox** tab, on **Memberships** in the sidebar, and on the phone menu button are all the same count." },
        { type: "p", text: "Use the filter chips to narrow the list to **Payments**, **To verify**, **Requests**, **To contact** or **Problems**. Click a task to open it in a panel on the right. The panel has the same buttons wherever you open it from, and the link at its bottom left, **Open full membership record**, takes you to the person’s record." },
        { type: "note", tone: "tip", text: "A task disappears from the Inbox when the thing it is about is dealt with. Most tasks clear themselves when you do the job (for example, recording a payment); a few need you to press a button to say they are done, and those are described below." },
      ],
    },
    {
      id: "payments",
      title: "Payments",
      blocks: [
        { type: "p", text: "Someone has chosen to pay by cash, cheque or bank transfer and the money has not been recorded yet. This covers new applications and renewals." },
        { type: "steps", items: [
          "Open the task. It shows the person, the membership type and the amount due.",
          "When the money has arrived, choose **Record payment**, check the **Amount received** and the **date received**, add the reference if there is one (the bank reference or cheque number), and confirm.",
          "For a cheque, first record that it has been **received**, and complete the payment once it has cleared.",
        ] },
        { type: "p", text: "More on the amounts and on what to do if the money is short or too much is in [Payments](/admin/handbook/payments)." },
      ],
    },
    {
      id: "to-verify",
      title: "To verify",
      blocks: [
        { type: "p", text: "Applications that need a person to look before the membership goes ahead: an eligibility check (for example, that a Student really is a student) and Junior applications, where you also check the guardian’s consent. The panel shows the applicant, the guardian if there is one, and the payment." },
        { type: "list", items: [
          "**Approve** when you are satisfied. The person becomes a member and is told.",
          "**Decline** when they are not eligible. If they have already paid, a **Refund to arrange** task appears in Problems (see below).",
          "Notices about a member’s record that an officer should look at also appear here, such as a possible duplicate or a Junior about to turn 18. Read the note, act on the record if needed, and mark it as reviewed.",
        ] },
      ],
    },
    {
      id: "requests",
      title: "Requests",
      blocks: [
        { type: "p", text: "Mostly **Student membership requests**. A member who is entitled to the Student rate asks for it, and you decide. A request that is waiting stops the member paying for that year, so decide promptly." },
      ],
    },
    {
      id: "to-contact",
      title: "To contact",
      blocks: [
        { type: "p", text: "The system needed to tell a member something, but they have **no email address and no website account**, so it could not. It creates a task for the officers instead. The title says why (for example, “Membership has lapsed”), and the panel shows the message they would have received, so you can phone them, write to them or tell them in person." },
        { type: "steps", items: [
          "Open the task and read the reasons. If several things need saying to the same person, they are listed together, oldest first.",
          "Contact the member.",
          "Press **Mark as contacted** and add a short note of how (for example, “phoned on 3 October”). This closes all of that person’s contact tasks.",
        ] },
        { type: "note", tone: "warning", text: "Nothing closes these tasks automatically, not even if the member later gives an email address. Only **Mark as contacted** clears them." },
      ],
    },
    {
      id: "problems",
      title: "Problems",
      blocks: [
        { type: "p", text: "Things the system could not settle by itself. Each panel explains the problem and offers the fix." },
        { type: "table", head: ["Problem", "What it means", "What you do"], rows: [
          ["Refund or disputed payment", "A payment was refunded or disputed. The member keeps access until you decide.", "Open it and decide the outcome (keep the membership, or end it)."],
          ["Refund to arrange", "A membership was declined after the person paid, so money is owed back.", "Refund them (card refunds can be made in Stripe; cash and cheque by hand), then press **Mark as refunded** with a note saying how. A card refund made in Stripe clears the task by itself."],
          ["Honorary payment clash", "A payment arrived for a year that honorary membership will cover.", "Open it and decide whether to refund it or keep it."],
          ["Paid by card twice", "A second card payment came in for someone who was already a member.", "Refund the duplicate in Stripe (the panel links to it), then mark it as dealt with."],
          ["Confirmed payment could not be recorded", "Stripe says the member paid, but the website could not apply it.", "Ask the website administrator. Once fixed, mark it as dealt with."],
          ["Email could not be delivered", "A membership email failed to send.", "Open it, correct the address on the member’s record if it is wrong, and retry. See [Emails members receive](/admin/handbook/emails#failed)."],
          ["Bounce, complaint or stopped delivery", "The member’s email provider rejected our email, or they marked it as spam.", "Contact the member another way and check their address. Press **Mark as dealt with**. Note that the address stays blocked for membership emails."],
          ["Renewals are not open", "It is between 20 November and the end of February and renewals have not been opened.", "Open them on the [Renewals](/admin/handbook/renewals) tab."],
          ["Daily membership updates have stopped", "The daily job has not run for three days.", "Ask the website administrator."],
          ["Old member records are past their date", "Some former members are due for removal, but automatic removal is switched off.", "An administrator checks the list and decides. See [Old records and privacy](/admin/handbook/old-records)."],
          ["Online payments or emails not fully set up", "Configuration is missing.", "Ask the website administrator."],
        ] },
      ],
    },
  ],
};
