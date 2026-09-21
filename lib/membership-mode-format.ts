// Pure helpers for the "Membership system" screen, where an administrator chooses whether MemberMojo or the
// website runs membership. No imports, so they can be unit tested with `node --experimental-strip-types`.

export type MembershipModeName = "membermojo" | "website";
export type ReadinessLevel = "ok" | "warning" | "blocked";
export type ReadinessCheck = { key: string; level: ReadinessLevel; label: string; detail: string };

/** A member list older than this is too old to start the website from. */
export const IMPORT_FRESH_DAYS = 7;

export type ReadinessInput = {
  now: Date;
  year: number;
  paymentsConfigured: boolean;
  /** The card payment key is a Stripe test key, so no real card can be charged. */
  paymentsInTestMode: boolean;
  emailConfigured: boolean;
  /** Names of active membership types with no fee in force for the year. */
  missingFees: string[];
  /** When the last MemberMojo list was imported. */
  lastImportAt: string | null;
  activeMembers: number;
  activeWithLogin: number;
  /** Null when the email queue could not be read. */
  emailQueue: { failed: number; providerPaused: boolean; bulkPaused: boolean } | null;
};

const DAY = 24 * 60 * 60 * 1000;

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** How long ago, in whole days, rounding down. Never negative. */
export function daysSince(value: string | null, now: Date): number | null {
  if (!value) return null;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / DAY));
}

/**
 * What has to be true before the website takes over. "blocked" stops the switch, because it would leave members
 * unable to pay or unable to be emailed. "warning" can be accepted by the administrator, with the reason recorded.
 */
export function evaluateReadiness(input: ReadinessInput): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [];

  if (!input.paymentsConfigured) {
    checks.push({ key: "payments", level: "blocked", label: "Card payments", detail: "Card payments are not set up on this server, so members could not pay. Add the Stripe keys first." });
  } else if (input.paymentsInTestMode) {
    checks.push({ key: "payments", level: "warning", label: "Card payments", detail: "Card payments are using Stripe test keys. No real card can be charged until the live keys are added." });
  } else {
    checks.push({ key: "payments", level: "ok", label: "Card payments", detail: "Card payments are set up." });
  }

  checks.push(input.emailConfigured
    ? { key: "email", level: "ok", label: "Email sending", detail: "Membership email is set up." }
    : { key: "email", level: "blocked", label: "Email sending", detail: "Membership email is not set up on this server, so members would not get receipts or renewal links." });

  checks.push(input.missingFees.length
    ? { key: "fees", level: "blocked", label: `${input.year} fees`, detail: `No ${input.year} fee is set for ${input.missingFees.join(", ")}. Set them under Memberships > Renewals > Fees and types.` }
    : { key: "fees", level: "ok", label: `${input.year} fees`, detail: `Every membership type has a ${input.year} fee.` });

  const age = daysSince(input.lastImportAt, input.now);
  if (age === null) {
    checks.push({ key: "import", level: "warning", label: "MemberMojo list", detail: "No MemberMojo list has been imported yet. Import the latest list first, so the website starts with the right members." });
  } else if (age > IMPORT_FRESH_DAYS) {
    checks.push({ key: "import", level: "warning", label: "MemberMojo list", detail: `The last import was ${plural(age, "day")} ago. Import the latest list first, so the website starts with the right members.` });
  } else {
    checks.push({ key: "import", level: "ok", label: "MemberMojo list", detail: age === 0 ? "The list was imported today." : `The list was imported ${plural(age, "day")} ago.` });
  }

  if (input.activeMembers > 0 && input.activeWithLogin * 2 < input.activeMembers) {
    checks.push({
      key: "logins", level: "warning", label: "Website sign-ins",
      detail: `Only ${input.activeWithLogin} of ${plural(input.activeMembers, "current member")} can sign in. The others cannot renew online until they are invited.`,
    });
  } else {
    checks.push({
      key: "logins", level: "ok", label: "Website sign-ins",
      detail: `${input.activeWithLogin} of ${plural(input.activeMembers, "current member")} can sign in.`,
    });
  }

  if (!input.emailQueue) {
    checks.push({ key: "queue", level: "warning", label: "Email queue", detail: "The email queue could not be read." });
  } else if (input.emailQueue.providerPaused || input.emailQueue.bulkPaused || input.emailQueue.failed > 0) {
    const problems = [
      input.emailQueue.providerPaused ? "the email provider has asked the club to wait" : null,
      input.emailQueue.bulkPaused ? "queued mail is paused" : null,
      input.emailQueue.failed > 0 ? `${plural(input.emailQueue.failed, "email")} failed` : null,
    ].filter(Boolean).join(", ");
    checks.push({ key: "queue", level: "warning", label: "Email queue", detail: `Look at the email queue first: ${problems}.` });
  } else {
    checks.push({ key: "queue", level: "ok", label: "Email queue", detail: "The queue is healthy." });
  }

  return checks;
}

export const blockers = (checks: ReadinessCheck[]) => checks.filter((check) => check.level === "blocked");
export const warnings = (checks: ReadinessCheck[]) => checks.filter((check) => check.level === "warning");

/** Typing the word is the confirmation for handing membership to the website. */
export const WEBSITE_CONFIRMATION_WORD = "website";
export const websiteConfirmationMatches = (typed: string) => typed.trim().toLowerCase() === WEBSITE_CONFIRMATION_WORD;

export const REASON_MAX = 500;

/** The reason kept with a switch to MemberMojo when the administrator writes none: in an emergency, one click is enough. */
export const DEFAULT_SWITCH_BACK_REASON = "Switched back to MemberMojo";

export const modeLabel = (mode: MembershipModeName) => mode === "website" ? "The website" : "MemberMojo";
