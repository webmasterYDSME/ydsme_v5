// An "Add to calendar" link that needs no server: a small .ics file inside the link itself.
// Times are written without a time zone ("floating"), so a calendar shows them as the same clock time
// wherever it is opened, which is right for a club that meets in one place.

export type CalendarEntry = {
  /** Anything stable and unique for the entry, for example "event-12". */
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  /** yyyy-mm-dd */
  startDate: string;
  /** hh:mm or hh:mm:ss */
  startTime: string;
  endDate?: string | null;
  endTime?: string | null;
};

const stamp = (date: string, time: string) => `${date.replaceAll("-", "")}T${time.replaceAll(":", "").padEnd(6, "0").slice(0, 6)}`;

const escapeText = (value: string) => value.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replace(/\r?\n/g, "\\n");

/** Lines in a calendar file are folded at 75 characters, with a space starting each continuation. */
const fold = (line: string) => {
  const pieces = [line.slice(0, 75)];
  for (let at = 75; at < line.length; at += 74) pieces.push(line.slice(at, at + 74));
  return pieces.join("\r\n ");
};

export function calendarFile(entry: CalendarEntry) {
  const end = stamp(entry.endDate || entry.startDate, entry.endTime || entry.startTime);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//York Model Engineers//Members//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${entry.uid}@yorkmodelengineers`,
    `DTSTAMP:${stamp(entry.startDate, "000000")}Z`,
    `DTSTART:${stamp(entry.startDate, entry.startTime)}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeText(entry.title)}`,
    ...(entry.location ? [`LOCATION:${escapeText(entry.location)}`] : []),
    ...(entry.description ? [`DESCRIPTION:${escapeText(entry.description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

export const calendarHref = (entry: CalendarEntry) => `data:text/calendar;charset=utf-8,${encodeURIComponent(calendarFile(entry))}`;
