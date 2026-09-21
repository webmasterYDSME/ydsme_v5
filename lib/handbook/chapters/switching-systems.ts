import type { HandbookChapter } from "../types";

export const switchingSystems: HandbookChapter = {
  slug: "switching-systems",
  title: "Switching between MemberMojo and the website",
  summary: "How an administrator hands membership to the website, or back to MemberMojo, what changes when they do, and what to check first.",
  audience: "administrator",
  reviewed: "2026-09-21",
  sections: [
    {
      id: "what",
      title: "Who runs membership",
      blocks: [
        { type: "p", text: "Membership is run either by **MemberMojo** or by **this website**. An administrator chooses at **Membership system** (Administration). The choice is stored in the website’s database, not in a server setting, so it takes effect **straight away, everywhere**: no one has to redeploy anything." },
        { type: "table", head: ["", "MemberMojo runs membership", "The website runs membership"], rows: [
          ["Applying, paying, renewing", "On MemberMojo. The website’s apply, checkout and renew pages send people there.", "On the website, by card. Officers record cash, bank and cheque payments."],
          ["Memberships area", "Hidden.", "Open to membership officers."],
          ["Membership emails", "None sent by the website.", "Sent through the email queue, inside the daily limit."],
          ["The MemberMojo list import", "Archives members who are not in the list.", "Adds and renews, but never archives anyone."],
        ] },
        { type: "note", tone: "info", text: "If the setting ever cannot be read, everything behaves as if MemberMojo runs membership: nothing is charged and nobody is emailed. That is the safe way to fail." },
      ],
    },
    {
      id: "before",
      title: "Before the website takes over",
      blocks: [
        { type: "p", text: "The **Membership system** page checks the website is ready. A check marked **Fix first** stops the switch; a check marked **Check** can be accepted, and your reason is recorded." },
        { type: "table", head: ["Check", "What it means"], rows: [
          ["Card payments", "The Stripe keys are set. A warning means they are test keys, so no real card can be charged."],
          ["Email sending", "The email service and sender address are set."],
          ["Fees", "Every membership type has a fee for the current year. Set them under [Types and fees](/admin/handbook/types-and-fees)."],
          ["MemberMojo list", "The list was imported in the last week. Import the latest list just before you switch, so the website starts with the right members. See [The MemberMojo list](/admin/handbook/membermojo-import)."],
          ["Website sign-ins", "How many current members can sign in. The rest cannot renew online until they are invited."],
          ["Email queue", "Nothing is paused or failing. See [Emails and the queue](/admin/handbook/emails)."],
        ] },
      ],
    },
    {
      id: "switching",
      title: "Handing membership to the website",
      blocks: [
        { type: "steps", items: [
          "Import the latest MemberMojo list and, if you have not already, send the website invitations.",
          "Open **Membership system** and read the checks. Sort out anything marked **Fix first**.",
          "Press **Hand membership to the website…**.",
          "Write why you are switching, tick the box to accept any warnings, and type the word **website** to confirm.",
          "Press **Switch to the website**. It is live at once.",
        ] },
        { type: "note", tone: "tip", text: "Choose a quiet day, not the week of a renewal deadline, and tell the committee first. From that moment members who visit the apply, checkout or renew pages use the website." },
      ],
    },
    {
      id: "back",
      title: "Going back to MemberMojo",
      blocks: [
        { type: "p", text: "Going back is the emergency brake, so it is **one button and one confirmation**, with no typing and no checks. Use it if something is going wrong on the website, or to return to MemberMojo for good." },
        { type: "list", items: [
          "The apply, checkout and renew pages send people to MemberMojo again, and the Memberships area is hidden.",
          "No more membership emails go out. You can also stop the ones still waiting in the queue in the same step, because they would be out of date if the website took over again. They can be put back from the email queue.",
          "Payments already in progress are still recorded when they arrive.",
          "**Card renewals already set up with Stripe carry on** until they are cancelled in Stripe. Going back does not cancel them.",
          "Members who joined or paid on the website are not in MemberMojo. The next MemberMojo import **keeps them** instead of archiving them, and lists them as “Joined or paid on the website”. Decide about each one yourself.",
        ] },
      ],
    },
    {
      id: "record",
      title: "The record of changes",
      blocks: [
        { type: "p", text: "Every switch is listed at the bottom of the **Membership system** page, with who made it, when, and the reason, and it is also written to the [Important changes log](/admin/audit). Only administrators can see or change this page." },
      ],
    },
  ],
};
