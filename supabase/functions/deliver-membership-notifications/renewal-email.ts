// Lays out the renewal invitation and reminder emails. The notification body is plain text in
// blocks separated by a blank line (see membership_renewal_payment_text in the database):
//
//   intro
//   Membership: ... / Fee for 2027: ...        -> the "facts" box
//   Pay by bank transfer (preferred) ...        -> one card per way to pay, best first
//   Pay by card ...                              -> the card card carries the renewal button
//   anything else                                -> ordinary paragraphs
//
// The plain-text body stays readable on its own (it is also what the member portal shows and
// what goes in the text version of the email). Emails queued before this layout have no
// "Pay by" block, so `parseRenewalBody` returns null and the caller uses the simple layout.

const LABELS = /^(Membership|Fee for \d{4}|Account name|Sort code|Account number|Amount|Reference|Payable to): (.+)$/;

export type RenewalBlock =
  | { type: "paragraph"; text: string }
  | { type: "facts"; rows: Array<[string, string]>; notes: string[] }
  | { type: "method"; name: string; preferred: boolean; card: boolean; text: string[]; rows: Array<[string, string]> };

export const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function splitRows(lines: string[]) {
  const rows: Array<[string, string]> = [];
  const rest: string[] = [];
  for (const line of lines) {
    const match = line.match(LABELS);
    if (match) rows.push([match[1], match[2]]);
    else rest.push(line);
  }
  return { rows, rest };
}

export function parseRenewalBody(body: string): RenewalBlock[] | null {
  const blocks = body.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  if (!blocks.some((block) => block.startsWith("Pay by "))) return null;
  return blocks.map((block): RenewalBlock => {
    const lines = block.split("\n");
    if (block.startsWith("Pay by ")) {
      const heading = lines[0];
      const { rows, rest } = splitRows(lines.slice(1));
      return {
        type: "method",
        name: heading.replace(/\s*\(preferred\)\s*$/, ""),
        preferred: /\(preferred\)\s*$/.test(heading),
        card: /^Pay by card$/i.test(heading),
        text: rest,
        rows,
      };
    }
    if (lines[0].startsWith("Membership: ")) {
      const { rows, rest } = splitRows(lines);
      return { type: "facts", rows, notes: rest };
    }
    return { type: "paragraph", text: lines.join("\n") };
  });
}

/** Text version: the body as written, with the renewal link straight after the card block. */
export function renewalText(body: string, actionUrl: string | null, linkLabel: string) {
  if (!actionUrl) return body;
  const blocks = body.split(/\n{2,}/);
  const at = blocks.findIndex((block) => /^Pay by card\b/.test(block.trim()));
  if (at === -1) return [body, `${linkLabel}: ${actionUrl}`].join("\n\n");
  blocks.splice(at + 1, 0, `${linkLabel}: ${actionUrl}`);
  return blocks.join("\n\n");
}

const TEXT = "color:#39443e;font-size:16px;line-height:25px";

const detailRows = (rows: Array<[string, string]>, top = 14) => rows.length
  ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:${top}px 0 0;border-collapse:collapse">${rows.map(([label, value]) => `<tr><td style="padding:7px 12px 7px 0;border-top:1px solid #e6e0cf;color:#68716c;font-size:14px;width:38%;vertical-align:top">${escapeHtml(label)}</td><td style="padding:7px 0;border-top:1px solid #e6e0cf;color:#13241d;font-size:16px;font-weight:700;vertical-align:top">${escapeHtml(value)}</td></tr>`).join("")}</table>`
  : "";

const paragraphs = (lines: string[]) => lines.map((line) => `<p style="margin:10px 0 0;${TEXT}">${escapeHtml(line)}</p>`).join("");

function renderBlock(block: RenewalBlock, actionUrl: string | null, buttonLabel: string) {
  if (block.type === "paragraph") {
    // The closing "automated email" note is small print.
    if (block.text.startsWith("This is an automated email")) {
      return `<p style="margin:26px 0 0;color:#68716c;font-size:14px;line-height:22px">${escapeHtml(block.text)}</p>`;
    }
    return `<p style="margin:24px 0 0;${TEXT};white-space:pre-line">${escapeHtml(block.text)}</p>`;
  }
  if (block.type === "facts") {
    const notes = block.notes.map((note) => `<p style="margin:10px 0 0;color:#39443e;font-size:14px;line-height:22px">${escapeHtml(note)}</p>`).join("");
    return `<div style="margin:24px 0 0;padding:16px 18px;background:#f5f0e2;border-left:4px solid #d5a84b">${detailRows(block.rows, 0)}${notes}</div>`;
  }
  const border = block.preferred ? "2px solid #18382d" : "1px solid #e2dccb";
  const background = block.preferred ? "#eef4ef" : "#ffffff";
  const badge = block.preferred
    ? `<span style="display:inline-block;margin-left:10px;padding:3px 9px;background:#18382d;color:#fff;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;vertical-align:middle">Preferred</span>`
    : "";
  const button = block.card && actionUrl
    ? `<p style="margin:18px 0 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#18382d;color:#fff;padding:13px 18px;text-decoration:none;font-weight:700">${escapeHtml(buttonLabel)}</a></p>`
    : "";
  return `<div style="margin:16px 0 0;padding:18px 20px;background:${background};border:${border}"><p style="margin:0;color:#13241d;font-family:Georgia,serif;font-size:20px;line-height:26px">${escapeHtml(block.name)}${badge}</p>${block.preferred ? paragraphs(block.text) + detailRows(block.rows) : detailRows(block.rows, 12) + paragraphs(block.text)}${button}</div>`;
}

/** HTML version of the whole email. Falls back to null for bodies in the older layout. */
export function renewalHtml(input: { eyebrow: string; title: string; body: string; actionUrl: string | null; buttonLabel: string }) {
  const blocks = parseRenewalBody(input.body);
  if (!blocks) return null;
  const firstMethod = blocks.findIndex((block) => block.type === "method");
  const content = blocks.map((block, index) => {
    const heading = index === firstMethod
      ? `<p style="margin:30px 0 0;color:#8a6a1d;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase">How to pay</p>`
      : "";
    return heading + renderBlock(block, input.actionUrl, input.buttonLabel);
  }).join("");
  return `<!doctype html><html><body style="margin:0;background:#eee9dc;color:#13241d;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:36px 20px"><div style="background:#18382d;color:#fff;padding:34px;border-top:6px solid #d5a84b"><p style="margin:0 0 12px;color:#d5a84b;font-size:12px;letter-spacing:2px;text-transform:uppercase">${escapeHtml(input.eyebrow)}</p><h1 style="margin:0;font-family:Georgia,serif;font-size:32px;line-height:38px;font-weight:500">${escapeHtml(input.title)}</h1></div><div style="background:#fffdf7;padding:10px 34px 34px">${content}</div><p style="padding:18px;text-align:center;color:#68716c;font-size:12px">York City &amp; District Society of Model Engineers</p></div></body></html>`;
}
