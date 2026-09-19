// Matching for the sidebar's member search. No imports, so it can be unit tested directly.

export type MemberSearchResult = { id: string; name: string; detail: string };

export type SearchableMember = { id: string; fullName: string; email: string | null };

/** Fewer characters than this would match most of the register. */
export const minimumMemberQueryLength = 2;

/**
 * Members whose name or correspondence email contains every word typed. Names that start with the
 * first word rank first, then other name matches, then email-only matches.
 */
export function matchMembers<T extends SearchableMember>(members: T[], query: string, limit = 6): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (query.trim().length < minimumMemberQueryLength || !words.length) return [];
  const ranked: { member: T; rank: number }[] = [];
  for (const member of members) {
    const name = member.fullName.toLowerCase();
    const email = (member.email ?? "").toLowerCase();
    if (!words.every((word) => name.includes(word) || email.includes(word))) continue;
    const rank = name.startsWith(words[0]) ? 0 : words.every((word) => name.includes(word)) ? 1 : 2;
    ranked.push({ member, rank });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.member.fullName.localeCompare(b.member.fullName));
  return ranked.slice(0, limit).map((entry) => entry.member);
}
