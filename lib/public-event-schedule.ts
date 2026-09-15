type ScheduledEvent = { id: number; start_date: string; start_time: string; end_date: string; end_time: string };

// Event dates and times are entered in the club's local time, including BST.
export function upcomingEvents<T extends ScheduledEvent>(events: T[], now = new Date()): T[] {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map(part => [part.type, part.value]));
  const localNow = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  const time = (value: string) => value.length === 5 ? `${value}:00` : value;
  return events.filter(event => `${event.end_date}T${time(event.end_time)}` > localNow)
    .sort((a, b) => `${a.start_date}T${time(a.start_time)}`.localeCompare(`${b.start_date}T${time(b.start_time)}`) || a.id - b.id);
}
