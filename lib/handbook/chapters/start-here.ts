import type { HandbookChapter } from "../types";

export const startHere: HandbookChapter = {
  slug: "start-here",
  title: "Start here",
  summary: "What the membership system does, who can do what, and how a typical week goes.",
  audience: "everyone",
  reviewed: "2026-09-21",
  sections: [
    {
      id: "what-it-does",
      title: "What the system does",
      blocks: [
        { type: "p", text: "The website keeps the Society’s **membership register**: who is a member, which membership type they hold, what they have paid for each year, and whether they can sign in to the members’ area. Everything a member can see about their own membership comes from this register, and so do the emails they receive about it." },
        { type: "p", text: "A membership officer’s job is to keep that register right: record payments that arrive by cash, cheque or bank transfer, check applications, run the yearly renewals, and deal with the odd problem. This handbook explains each of those jobs in the order you meet them." },
        { type: "note", tone: "tip", title: "Nothing here is permanent by accident", text: "Almost every action asks you to confirm, and almost every change is written to the **Important changes** log with your name and the time. If you are unsure, read the chapter first; if you have already done something you did not mean to, see [When something looks wrong](/admin/handbook/troubleshooting)." },
      ],
    },
    {
      id: "two-modes",
      title: "MemberMojo or the website?",
      blocks: [
        { type: "p", text: "The Society is moving its membership from MemberMojo to this website. The website can run in one of two modes, and the mode decides which screens exist. The banner at the top of every handbook page shows which mode it is in now." },
        { type: "table", head: ["", "MemberMojo mode", "Website mode"], rows: [
          ["Who runs membership", "MemberMojo. Members join and renew there.", "This website. Members join and renew here."],
          ["What the website does", "Keeps a copy of the register so members can sign in, using the list you download from MemberMojo.", "Is the register. Takes applications and payments, sends renewal emails, moves people through grace and lapse."],
          ["Screens you use", "Update members from MemberMojo (administrators), Website accounts, Email queue.", "Memberships (Inbox, Members, Renewals, Setup), plus the same administrator pages."],
          ["Emails to members", "The website sends no membership emails, apart from the invitation to use the website.", "The website sends the membership emails described in [Emails members receive](/admin/handbook/emails)."],
        ] },
        { type: "p", text: "Chapters that only apply once the website runs membership are marked **Website mode** on the contents page. An administrator changes the mode at **Membership system** (Administration), and it takes effect straight away. If you think it is set wrongly, ask them. See [Switching between MemberMojo and the website](/admin/handbook/switching-systems)." },
      ],
    },
    {
      id: "screens",
      title: "The screens you will use",
      blocks: [
        { type: "p", text: "In website mode, **Memberships** in the sidebar opens the membership workspace. It has four tabs and an **Add membership** button." },
        { type: "table", head: ["Tab", "What it is for"], rows: [
          ["Inbox", "Everything that needs you, oldest first: payments to record, applications to check, requests to decide, members to contact, problems. The number on the tab and on the sidebar is the number of open tasks. See [The Inbox](/admin/handbook/inbox)."],
          ["Members", "The register. Search, filter by status, and open anyone’s record. See [Members and their records](/admin/handbook/members)."],
          ["Renewals", "The yearly cycle: open renewals, send invitations and reminders, record payments, and look after the membership types and their fees. See [Renewals](/admin/handbook/renewals)."],
          ["Setup", "Things you change rarely: the treasurer’s payment details, bookkeeping reports, and the list of old records due for removal. See [Setup, reports and payment details](/admin/handbook/setup-and-reports)."],
        ] },
        { type: "p", text: "Two other screens matter to you even though they are not on those tabs: **Website accounts** (the sign-in accounts, which is separate from the membership register) and, for administrators, **Update members from MemberMojo** and **Email queue**." },
      ],
    },
    {
      id: "who-can-do-what",
      title: "Who can do what",
      blocks: [
        { type: "table", head: ["Person", "Can do"], rows: [
          ["Membership officer", "Everything in the Memberships workspace: add members, record and check payments, run renewals, change fees, make people honorary, send new renewal links, mark tasks done, and download reports. A committee member becomes a membership officer when an administrator gives them that responsibility."],
          ["Administrator", "Everything a membership officer can, and also: import the MemberMojo list, switch between MemberMojo and the website, see and manage the email queue, switch automatic removal of old records on or off, restore archived accounts, permanently delete an archived account, and change site settings."],
          ["Committee member", "Can see the register of website accounts but not the Memberships workspace, unless they have been made a membership officer."],
          ["Member", "Sees and manages only their own membership, details and payments."],
        ] },
        { type: "note", tone: "info", text: "Nobody is exempt from lapsing. An administrator or committee member who does not renew loses access to the members’ area like anyone else, so they must stay paid up or be made honorary." },
      ],
    },
    {
      id: "typical-week",
      title: "A typical week",
      blocks: [
        { type: "steps", items: [
          "Open the **Inbox**. Work down the list from the oldest. Most tasks are a payment to record or an application to check; each opens in a panel with the buttons you need.",
          "Look at the **Problems** filter last. Anything there has already been tried by the system, so it needs a person: a bounced email, a payment that could not be matched, a refund to arrange.",
          "During the renewal season (see [The membership year](/admin/handbook/membership-year)), open **Renewals** and check the waiting list. Send a reminder if you want to chase people, then record payments as they arrive.",
          "If you are also an administrator, glance at the **Email queue** once a week to see nothing is stuck.",
        ] },
        { type: "p", text: "In quiet months the Inbox is often empty. That is normal and means nothing is waiting." },
      ],
    },
    {
      id: "help",
      title: "Getting help",
      blocks: [
        { type: "list", items: [
          "Use the search box on the handbook’s contents page. It searches every chapter.",
          "The **Important changes** page (administrators) shows who did what and when, which answers most “how did this happen?” questions.",
          "For anything technical, such as email not arriving, payments not reaching the website, or a screen that will not load, contact the website administrator and tell them what you were doing and what you saw.",
        ] },
      ],
    },
  ],
};
