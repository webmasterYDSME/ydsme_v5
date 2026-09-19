"use server";

import { requireUser } from "@/lib/auth";
import { membershipAdministrationEnabled } from "@/lib/features";
import { memberStateName } from "@/lib/membership-admin/format";
import { matchMembers, type MemberSearchResult } from "@/lib/membership-admin/member-search";
import { loadMemberRegister } from "@/lib/membership-admin/records";

/**
 * Members matching what was typed in the sidebar search. Only people who can manage memberships
 * get results; anyone else gets an empty list rather than an error, so the search box never leaks
 * whether a member exists.
 */
export async function searchMembersForPortal(query: string): Promise<MemberSearchResult[]> {
  if (typeof query !== "string" || query.length > 100) return [];
  const session = await requireUser();
  if (!session.membershipOfficer || !membershipAdministrationEnabled()) return [];
  const register = await loadMemberRegister();
  return matchMembers(register, query).map((member) => ({
    id: member.id,
    name: member.fullName,
    detail: [member.plan, memberStateName(member.state)].filter(Boolean).join(" · "),
  }));
}
