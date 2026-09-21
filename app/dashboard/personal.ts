// What the dashboard says about the signed-in member: a greeting, a one-line membership status
// and their next workshop. Plain functions with no data access, so they can be tested on their own.

import type { MembershipAccount } from "@/lib/membership";

export type TileTone = "good" | "warn" | "bad" | "quiet";

export type PersonalTile = {
  tone: TileTone;
  headline: string;
  detail: string;
  action: { label: string; href: string } | null;
};

const longDate = (value: string) => new Date(`${value}T12:00:00Z`)
  .toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

/** "Good morning" until noon, "Good afternoon" until six, then "Good evening". The hour is the London hour. */
export function greetingFor(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export const londonHour = (now = new Date()) => Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/London" }).format(now)) % 24;

export function firstNameOf(fullName: string | null | undefined) {
  return (fullName ?? "").trim().split(/\s+/)[0] ?? "";
}

const MEMBERSHIP_PAGE = "/account?tab=membership";

export function membershipTile({ membership, campaignYear, renewalAvailable, honoraryTransitionPayment }: {
  membership: MembershipAccount | null;
  campaignYear: number | null;
  renewalAvailable: boolean;
  honoraryTransitionPayment: boolean;
}): PersonalTile {
  if (!membership) {
    return { tone: "quiet", headline: "Not linked yet", detail: "Your login is not linked to a membership record. A membership officer can do that for you.", action: null };
  }
  const state = membership.member.effective_state;
  const term = membership.term;
  const view = { label: "View membership", href: MEMBERSHIP_PAGE };
  const renew = { label: "Renew online", href: MEMBERSHIP_PAGE };

  if (state === "honorary" && !honoraryTransitionPayment) {
    return { tone: "good", headline: "Lifetime honorary member", detail: "No fee, expiry date or renewal.", action: view };
  }
  if (renewalAvailable || honoraryTransitionPayment) {
    return {
      tone: "warn",
      headline: campaignYear ? `Renew for ${campaignYear}` : "Renewal is open",
      detail: term ? `Your current membership ends on ${longDate(term.ends_on)}.` : "Renewals are open now.",
      action: renew,
    };
  }
  if (state === "grace") {
    return { tone: "warn", headline: "Renewal due", detail: term ? `Please renew by ${longDate(term.grace_ends_on)}.` : "Please renew soon.", action: renew };
  }
  if (state === "payment_review") {
    return { tone: "warn", headline: "Payment being checked", detail: "A membership officer is confirming your payment. Nothing more to do for now.", action: view };
  }
  if (state === "lapsed" || state === "suspended" || state === "archived") {
    const headline = state === "lapsed" ? "Membership lapsed" : state === "suspended" ? "Access suspended" : "Account archived";
    return { tone: "bad", headline, detail: "Please contact the membership officer to put this right.", action: view };
  }
  if (state === "active") {
    const autoRenews = Boolean(membership.subscription
      && !["canceled", "incomplete_expired"].includes(membership.subscription.status)
      && !membership.subscription.cancel_at_period_end && !membership.subscription.renewal_locked);
    return {
      tone: "good",
      headline: "Membership active",
      detail: term ? `Paid until ${longDate(term.ends_on)}${autoRenews ? ", and set to renew automatically" : ""}.` : "Your membership is in good standing.",
      action: view,
    };
  }
  return { tone: "quiet", headline: state.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()), detail: "See your membership page for details.", action: view };
}

type WorkshopLike = { id: string; date: string; start_time: string };

/** The soonest workshop the member has reserved, or null. Workshops are matched by id against the member's reservations. */
export function nextReservedWorkshop<T extends WorkshopLike>(workshops: T[], reservedIds: Set<string>): T | null {
  return [...workshops]
    .filter((workshop) => reservedIds.has(workshop.id))
    .sort((a, b) => `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`))[0] ?? null;
}
