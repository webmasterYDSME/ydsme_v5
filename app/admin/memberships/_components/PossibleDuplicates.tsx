"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { findPossibleDuplicateMembers } from "@/lib/actions/membership";
import { memberStateName } from "@/lib/membership-admin/format";
import type { PossibleDuplicate } from "@/lib/membership-admin/officer-member";
import styles from "../memberships.module.css";

/**
 * People already on the register who look like the one being added, looked up as the officer types so a
 * duplicate is caught before the form is sent. A name on its own is only a warning; the same email address,
 * or the same name and date of birth, needs a reason.
 */
export function usePossibleDuplicates({ name, dateOfBirth, email, includeNameOnly = false }: { name: string; dateOfBirth: string; email: string; includeNameOnly?: boolean }) {
  const [matches, setMatches] = useState<PossibleDuplicate[]>([]);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(async () => {
      // Nothing to compare yet: a name needs a date of birth alongside it (unless a name alone is being checked).
      const hasName = name.trim().length > 1;
      if (!email.trim() && !(hasName && (dateOfBirth || includeNameOnly))) { if (current) setMatches([]); return; }
      try {
        const found = await findPossibleDuplicateMembers({ full_name: name, date_of_birth: dateOfBirth, contact_email: email, include_name_only: includeNameOnly });
        if (current) setMatches(found);
      } catch {
        if (current) setMatches([]);
      }
    }, 500);
    return () => { current = false; clearTimeout(timer); };
  }, [name, dateOfBirth, email, includeNameOnly]);
  return matches;
}

export function DuplicateWarning({ matches, forced, defaultReason }: { matches: PossibleDuplicate[]; forced: boolean; defaultReason: string }) {
  if (!matches.length && !forced) return null;
  // The same email, or the same name and date of birth, must be explained. A shared name alone is only a warning.
  const mustExplain = forced || matches.some((match) => match.matchedOn !== "name");
  return <div className={styles.panelWarn} role="status">
    {matches.length ? <>
      <p>Already on the register:</p>
      <ul>{matches.map((match) => <li key={match.id}>
        <Link href={`/admin/memberships/members/${match.id}`} target="_blank" rel="noreferrer">{match.name}<span className="sr-only"> (opens in a new tab)</span></Link> · {memberStateName(match.state)} · same {match.matchedOn}
      </li>)}</ul>
    </> : <p>Someone with the same email address, or the same name and date of birth, is already on the register.</p>}
    <label>{mustExplain ? "If this is a different person, say why" : "If this is a different person, you can say why"}<textarea name="duplicate_override_reason" rows={2} minLength={5} maxLength={500} defaultValue={defaultReason} placeholder="They share the same email address" required={mustExplain}/></label>
  </div>;
}
