import { emails } from "./chapters/emails";
import { glossary } from "./chapters/glossary";
import { honorary } from "./chapters/honorary";
import { inbox } from "./chapters/inbox";
import { members } from "./chapters/members";
import { membermojoImport } from "./chapters/membermojo-import";
import { membershipYear } from "./chapters/membership-year";
import { oldRecords } from "./chapters/old-records";
import { payments } from "./chapters/payments";
import { renewals } from "./chapters/renewals";
import { setupAndReports } from "./chapters/setup-and-reports";
import { startHere } from "./chapters/start-here";
import { troubleshooting } from "./chapters/troubleshooting";
import { typesAndFees } from "./chapters/types-and-fees";
import type { HandbookChapter } from "./types";

/** In reading order. Add a chapter file, then list it here. */
export const handbookChapters: HandbookChapter[] = [
  startHere,
  membershipYear,
  inbox,
  members,
  typesAndFees,
  renewals,
  payments,
  honorary,
  emails,
  membermojoImport,
  oldRecords,
  setupAndReports,
  troubleshooting,
  glossary,
];

export const findChapter = (slug: string) => handbookChapters.find((chapter) => chapter.slug === slug) ?? null;
