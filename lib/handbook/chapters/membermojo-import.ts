import type { HandbookChapter } from "../types";

export const membermojoImport: HandbookChapter = {
  slug: "membermojo-import",
  title: "The MemberMojo list",
  summary: "Bringing the website’s register into line with the list you download from MemberMojo. The list is the source of truth.",
  audience: "administrator",
  reviewed: "2026-09-21",
  sections: [
    {
      id: "principle",
      title: "The list is the source of truth",
      blocks: [
        { type: "p", text: "While MemberMojo runs membership, the list of active members you download from it is the definitive register. Importing it makes the website match: **everyone in the list is a member for the current year, and members who are not in the list are archived.** Only an administrator can use this page, at **Update members from MemberMojo** (Administration)." },
        { type: "note", tone: "info", text: "Importing does not email anyone. The invitation to use the website is a separate step that you start afterwards." },
        { type: "note", tone: "warning", title: "Only while MemberMojo runs membership", text: "Once the website runs membership, an import still adds and renews the people in the file but **never archives anyone**, because members who join and pay on the website are not in MemberMojo. See [Switching between MemberMojo and the website](/admin/handbook/switching-systems)." },
      ],
    },
    {
      id: "steps",
      title: "Importing the list, step by step",
      blocks: [
        { type: "steps", items: [
          "In MemberMojo, download the member list as a CSV file. Make sure it is the list of **active** members: people whose Membership state is not Active are left out.",
          "On **Update members from MemberMojo**, choose the file and press **Show me what will happen**. This changes nothing.",
          "Read the results (see the next section). Look at the lists under **Will be archived**, **Left out** and **Worth a look**.",
          "If it is right, tick the box, choose **the same file again**, and press **Save member list**. The file must be exactly the one you checked; if it is different the save is refused.",
          "If a large number of people would be archived, you must first **type that number** in the box provided.",
          "When it says Saved, start the website invitations for anyone new (see below).",
        ] },
        { type: "note", tone: "warning", title: "Check the file before you save", text: "A clear-out of the register is much more often a wrong file than a real change. If the number of people to archive surprises you, stop and check you downloaded the right list." },
      ],
    },
    {
      id: "preview",
      title: "Reading the preview",
      blocks: [
        { type: "table", head: ["Box", "What it tells you"], rows: [
          ["New people", "People in the file who are not on the register. They are added as full members for the year, paid through MemberMojo. Life (Honorary) and Associate Volunteer people are added as lifetime honorary members."],
          ["Existing members", "People already on the register who are renewed for the year, and how many were already paid."],
          ["Website login", "How many people can be invited to the website, and how many already have a login and are linked."],
          ["Not in the file", "Members on the register who are not in the file and will be archived, and how many were kept."],
          ["Personal details", "How many people have no date of birth, which matters for age changes (see [Age changes](/admin/handbook/types-and-fees#age-changes))."],
          ["To look at", "People left out (duplicates, bad or missing names, bad email addresses) and people worth a second look."],
        ] },
        { type: "p", text: "People are matched to the register by **name and email address**. Someone who has changed their email address in MemberMojo will not match by email, but if their **name** matches a member on the register they are kept, not archived, and listed under **Not in the file, but kept**. They are also added as a new person, so check for duplicates." },
      ],
    },
    {
      id: "archiving",
      title: "Who is archived, and who never is",
      blocks: [
        { type: "p", text: "**Archiving** removes a member from the active register and closes their website access. Nothing is deleted: the record is kept, an entry is written to the Important changes log for each person, and an administrator can restore them. Their website account is deleted automatically about 12 months after archiving, and the record is anonymised under the retention rules. See [Old records and privacy](/admin/handbook/old-records#archived)." },
        { type: "p", text: "**The import archives** every member who is Active, in Grace, Lapsed or Honorary and is not in the file. Honorary members and members added by hand are not exempt: if they are not in the MemberMojo list, they are archived." },
        { type: "p", text: "**The import never archives:**" },
        { type: "list", items: [
          "Administrators, and anyone with a committee login or a committee listing.",
          "Anyone under a legal hold.",
          "Suspended members, and members whose payment is being checked. They are left as they are.",
          "Anyone whose name is in the list, even if the email address is different.",
          "Anyone already archived.",
          "Anyone who joined, renewed or was added on the website since it last took over from MemberMojo. This only matters if membership is handed back to MemberMojo. They are listed under **Not in the file, but kept**, as “Joined or paid on the website”.",
        ] },
        { type: "note", tone: "tip", text: "If an administrator or committee member is missing from MemberMojo, they stay on the register. Because nobody is exempt from lapsing, they will lapse in the usual way if they do not renew." },
      ],
    },
    {
      id: "restoring",
      title: "Restoring people",
      blocks: [
        { type: "p", text: "Someone the import archived who appears in a later list is **restored automatically**: they become a full member for the year again and, if they had a login, it is reopened. (If they have no login they can be invited again in the usual way.)" },
        { type: "p", text: "Someone an **officer** archived on purpose is not restored by the import: the list cannot overrule that decision. It says “Archived by an officer: left as it is” in the results. To restore a website account by hand, an administrator uses **Restore member** on the Website accounts page." },
      ],
    },
    {
      id: "details",
      title: "What else the import fills in",
      blocks: [
        { type: "list", items: [
          "**Membership type** comes from the Membership column: Junior, Student, Concession or Senior or Over 80, otherwise Adult. An unrecognised type is imported as Adult and listed under Worth a look.",
          "**Details**: title, date of birth, phone number and address. Existing members only have blank details filled in; nothing already on their record is overwritten. MemberMojo only records the month and year of birth, so dates are saved as the 1st of the month.",
          "**Newsletter**: a new member who has not unsubscribed from MemberMojo’s group emails is subscribed, and the record says where that came from. Juniors and existing members are never subscribed by the import.",
          "**Years**: whoever is in the file is treated as paid for the current year. Their MemberMojo expiry date is ignored.",
        ] },
      ],
    },
    {
      id: "invitations",
      title: "Inviting people to the website",
      blocks: [
        { type: "p", text: "Below the import is **Website invitations**. Press **Invite everyone** once. The website sends a few invitations every five minutes (about 60 an hour), retries any that fail, waits if the email service’s hourly limit is reached, and switches itself off when everyone has been invited. You can leave the page; it refreshes itself." },
        { type: "list", items: [
          "Each person gets one email with a secure link that opens their account. No password is needed; later they sign in with a one-time link sent to their email.",
          "People who already have a login are linked without an email.",
          "Juniors, people with no email address, and adults who share an email address with another adult get no login. See [Website logins](/admin/handbook/members#logins).",
          "A person whose invitation fails five times is listed as “could not be invited”. Check their address, then press the button again to try them once more.",
        ] },
      ],
    },
  ],
};
