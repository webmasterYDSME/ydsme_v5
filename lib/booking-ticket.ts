import "server-only";

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import QRCode from "qrcode";
import sharp from "sharp";

export const TICKET_WIDTH = 1080;
export const TICKET_HEIGHT = 1920;

export type BookingTicketDetails = {
  bookingId: string;
  eventId: number;
  eventName: string;
  eventDate: string;
  startTime: string;
  leadName: string;
  partySize: number;
  referenceCode: string;
};

const themes = [
  { background: "#0b2119", panel: "#173d30", accent: "#e0b455", highlight: "#a64e39", paper: "#f6f0df" },
  { background: "#0c2134", panel: "#173a55", accent: "#e6b96a", highlight: "#b6533e", paper: "#f4efdf" },
  { background: "#35151a", panel: "#57232a", accent: "#e8c66f", highlight: "#d07045", paper: "#f8f0df" },
  { background: "#102e31", panel: "#1d4b4d", accent: "#efbb62", highlight: "#c45b3d", paper: "#f4eedf" },
  { background: "#2d2417", panel: "#50402a", accent: "#e3b856", highlight: "#a94c34", paper: "#f7f0dd" },
  { background: "#1f1c38", panel: "#38315e", accent: "#e8bd63", highlight: "#b95648", paper: "#f5efdf" },
];

const escapeXml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

/*
 * The ticket's text is drawn by sharp from SVG, which looks fonts up on the machine it runs on. A Mac has Arial and Georgia;
 * the Linux servers that run preview and production have no fonts at all, so every letter came out as an empty box.
 * The fonts are therefore shipped with the app in lib/ticket-fonts and fontconfig is pointed at them before the first
 * ticket is drawn (next.config.ts includes them in the deployment). They are Latin-only subsets of Liberation Sans and
 * Serif (SIL Open Font License, see lib/ticket-fonts/README.txt), about 65 KB in all, renamed as the licence requires.
 * The serif is used only at weight 600 or more, so only its bold face is bundled. The Arial and Georgia names stay in the
 * font lists for a local machine that lacks the bundled ones.
 */
const TICKET_SANS = "YME Ticket Sans, Arial, sans-serif";
const TICKET_SERIF = "YME Ticket Serif, Georgia, serif";
const TICKET_FONT_DIRECTORY = path.join(process.cwd(), "lib", "ticket-fonts");
let ticketFontsReady = false;

function pointRendererAtTicketFonts() {
  if (ticketFontsReady) return;
  ticketFontsReady = true;
  if (!existsSync(path.join(TICKET_FONT_DIRECTORY, "TicketSans-Regular.ttf"))) {
    console.error(`Ticket fonts are missing from ${TICKET_FONT_DIRECTORY}; ticket text may not draw.`);
    return;
  }
  try {
    const workDirectory = path.join(tmpdir(), "ydsme-ticket-fonts");
    mkdirSync(workDirectory, { recursive: true });
    const configPath = path.join(workDirectory, "fonts.conf");
    writeFileSync(configPath, `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${escapeXml(TICKET_FONT_DIRECTORY)}</dir>
  <cachedir>${escapeXml(path.join(workDirectory, "cache"))}</cachedir>
</fontconfig>
`);
    process.env.FONTCONFIG_FILE = configPath;
  } catch (error) {
    console.error("Could not set up the ticket fonts", error);
  }
}

function hashValue(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function wrapTitle(value: string, maxCharacters = 22) {
  const words = value.trim().split(/\s+/);
  const lines: string[] = [];
  for (const word of words) {
    const current = lines.at(-1);
    if (!current || current.length + word.length + 1 > maxCharacters) lines.push(word);
    else lines[lines.length - 1] = `${current} ${word}`;
  }
  if (lines.length > 3) {
    const remaining = lines.slice(2).join(" ");
    lines.splice(2, lines.length - 2, `${remaining.slice(0, maxCharacters - 1).trim()}…`);
  }
  return lines;
}

function readableDateParts(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return {
    day: new Intl.DateTimeFormat("en-GB", { day: "2-digit", timeZone: "Europe/London" }).format(date),
    weekday: new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "Europe/London" }).format(date),
    monthYear: new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "Europe/London" }).format(date),
  };
}

function ticketOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || "https://www.yorkmodelengineers.co.uk";
  try {
    return new URL(configured).origin;
  } catch {
    return "https://www.yorkmodelengineers.co.uk";
  }
}

export function bookingVerificationUrl(referenceCode: string) {
  const url = new URL("/admin/bookings", ticketOrigin());
  url.searchParams.set("q", referenceCode);
  return url.toString();
}

export async function generateBookingTicket(details: BookingTicketDetails) {
  const seed = hashValue(`${details.eventId}:${details.eventName}`);
  const theme = themes[seed % themes.length];
  const date = readableDateParts(details.eventDate);
  const titleLines = wrapTitle(details.eventName);
  const verificationUrl = bookingVerificationUrl(details.referenceCode);
  const referenceCode = escapeXml(details.referenceCode);
  const leadName = escapeXml(details.leadName.length > 26 ? `${details.leadName.slice(0, 25).trim()}…` : details.leadName);
  const routeNumber = String((seed % 900) + 100).padStart(3, "0");
  const patternOffset = seed % 54;
  const titleStart = titleLines.length === 1 ? 410 : titleLines.length === 2 ? 360 : 320;
  const titleMarkup = titleLines.map((line, index) =>
    `<text x="80" y="${titleStart + index * 92}" fill="${theme.paper}" font-family="${TICKET_SERIF}" font-size="82" font-weight="600">${escapeXml(line)}</text>`,
  ).join("");
  const qrCode = QRCode.create(verificationUrl, { errorCorrectionLevel: "M" });
  const qrMargin = 2;
  const qrModuleSize = Math.floor(330 / (qrCode.modules.size + qrMargin * 2));
  const qrSize = (qrCode.modules.size + qrMargin * 2) * qrModuleSize;
  const qrLeft = Math.round((TICKET_WIDTH - qrSize) / 2);
  const qrTop = 1280;
  const qrPath: string[] = [];
  for (let row = 0; row < qrCode.modules.size; row += 1) {
    for (let column = 0; column < qrCode.modules.size; column += 1) {
      if (!qrCode.modules.get(row, column)) continue;
      const x = qrLeft + (column + qrMargin) * qrModuleSize;
      const y = qrTop + (row + qrMargin) * qrModuleSize;
      qrPath.push(`M${x} ${y}h${qrModuleSize}v${qrModuleSize}h-${qrModuleSize}z`);
    }
  }

  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${TICKET_WIDTH}" height="${TICKET_HEIGHT}" viewBox="0 0 ${TICKET_WIDTH} ${TICKET_HEIGHT}">
    <defs>
      <linearGradient id="ticket-bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${theme.background}"/><stop offset="1" stop-color="${theme.panel}"/></linearGradient>
      <pattern id="rails" width="92" height="92" patternUnits="userSpaceOnUse" patternTransform="rotate(${18 + seed % 34})"><path d="M0 15H92M0 69H92" stroke="${theme.accent}" stroke-opacity=".08" stroke-width="4"/><path d="M${patternOffset} 0V92" stroke="${theme.paper}" stroke-opacity=".055" stroke-width="13"/></pattern>
    </defs>
    <rect width="1080" height="1920" fill="url(#ticket-bg)"/>
    <rect width="1080" height="1920" fill="url(#rails)"/>
    <circle cx="960" cy="170" r="240" fill="none" stroke="${theme.accent}" stroke-opacity=".15" stroke-width="2"/>
    <circle cx="960" cy="170" r="185" fill="none" stroke="${theme.accent}" stroke-opacity=".12" stroke-width="28"/>
    <circle cx="905" cy="130" r="66" fill="${theme.paper}" fill-opacity=".06"/>
    <circle cx="850" cy="78" r="36" fill="${theme.paper}" fill-opacity=".05"/>
    <rect x="0" y="0" width="20" height="1920" fill="${theme.accent}"/>
    <text x="80" y="100" fill="${theme.accent}" font-family="${TICKET_SANS}" font-size="25" font-weight="700" letter-spacing="5">YORK MODEL ENGINEERS</text>
    <text x="80" y="154" fill="${theme.paper}" fill-opacity=".72" font-family="${TICKET_SANS}" font-size="19" font-weight="700" letter-spacing="4">MOBILE BOARDING TICKET · ROUTE ${routeNumber}</text>
    <path d="M80 218H1000" stroke="${theme.paper}" stroke-opacity=".22" stroke-width="2" stroke-dasharray="10 12"/>
    <rect x="80" y="248" width="225" height="45" rx="22" fill="${theme.highlight}"/>
    <text x="193" y="278" text-anchor="middle" fill="#fff" font-family="${TICKET_SANS}" font-size="19" font-weight="700" letter-spacing="3">PUBLIC EVENT</text>
    ${titleMarkup}
    <g transform="translate(80 650)">
      <text x="0" y="55" fill="${theme.accent}" font-family="${TICKET_SANS}" font-size="190" font-weight="800">${date.day}</text>
      <text x="300" y="-5" fill="${theme.paper}" fill-opacity=".62" font-family="${TICKET_SANS}" font-size="20" font-weight="700" letter-spacing="4">DATE &amp; DEPARTURE</text>
      <text x="300" y="54" fill="${theme.paper}" font-family="${TICKET_SERIF}" font-size="51" font-weight="600">${escapeXml(date.weekday)}</text>
      <text x="300" y="112" fill="${theme.paper}" font-family="${TICKET_SANS}" font-size="29">${escapeXml(date.monthYear)} · ${escapeXml(details.startTime.slice(0, 5))}</text>
    </g>
    <path d="M80 900H1000" stroke="${theme.paper}" stroke-opacity=".22" stroke-width="2" stroke-dasharray="10 12"/>
    <g transform="translate(80 960)">
      <rect width="430" height="150" rx="14" fill="${theme.paper}" fill-opacity=".1" stroke="${theme.paper}" stroke-opacity=".16"/>
      <text x="32" y="46" fill="${theme.paper}" fill-opacity=".62" font-family="${TICKET_SANS}" font-size="18" font-weight="700" letter-spacing="3">LEAD VISITOR</text>
      <text x="32" y="103" fill="${theme.paper}" font-family="${TICKET_SERIF}" font-size="38" font-weight="600">${leadName}</text>
      <rect x="460" width="460" height="150" rx="14" fill="${theme.accent}"/>
      <text x="495" y="47" fill="${theme.background}" fill-opacity=".7" font-family="${TICKET_SANS}" font-size="18" font-weight="800" letter-spacing="3">GROUP ADMISSION</text>
      <text x="495" y="111" fill="${theme.background}" font-family="${TICKET_SANS}" font-size="47" font-weight="800">${details.partySize} ${details.partySize === 1 ? "VISITOR" : "VISITORS"}</text>
    </g>
    <rect x="80" y="1170" width="920" height="500" rx="28" fill="${theme.paper}"/>
    <text x="540" y="1234" text-anchor="middle" fill="${theme.highlight}" font-family="${TICKET_SANS}" font-size="19" font-weight="800" letter-spacing="4">SCAN AT SITE CONTROL</text>
    <rect x="360" y="1264" width="360" height="360" rx="14" fill="#fff"/>
    <path d="${qrPath.join("")}" fill="${theme.background}" shape-rendering="crispEdges"/>
    <circle cx="80" cy="1420" r="34" fill="${theme.background}"/><circle cx="1000" cy="1420" r="34" fill="${theme.background}"/>
    <text x="540" y="1740" text-anchor="middle" fill="${theme.paper}" fill-opacity=".58" font-family="${TICKET_SANS}" font-size="17" font-weight="700" letter-spacing="3">BOOKING REFERENCE</text>
    <text x="540" y="1805" text-anchor="middle" fill="${theme.accent}" font-family="${TICKET_SERIF}" font-size="54" font-weight="700" letter-spacing="5">${referenceCode}</text>
    <text x="540" y="1862" text-anchor="middle" fill="${theme.paper}" fill-opacity=".7" font-family="${TICKET_SANS}" font-size="18">Dringhouses · York · YO24 2JE</text>
    <path d="M120 1890H960" stroke="${theme.accent}" stroke-opacity=".45" stroke-width="3"/>
  </svg>`);

  pointRendererAtTicketFonts();
  const buffer = await sharp(svg)
    .png({ compressionLevel: 9, palette: true, quality: 100 })
    .toBuffer();

  return {
    buffer,
    contentId: `booking-ticket-${details.bookingId}`,
    filename: `york-model-engineers-${details.referenceCode.toLowerCase()}.png`,
    verificationUrl,
  };
}
