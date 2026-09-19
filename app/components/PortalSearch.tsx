"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { searchMembersForPortal } from "@/lib/actions/portal-search";
import { minimumMemberQueryLength, type MemberSearchResult } from "@/lib/membership-admin/member-search";
import { searchPages, type PortalNavItem } from "@/lib/portal-nav";
import styles from "./portal-navigation.module.css";

/**
 * Jump to a page, or (for membership officers) straight to a member's record. It is a native modal
 * dialog, so focus stays inside it and Escape closes it. It is only mounted while open, so every
 * opening starts empty.
 */
export function PortalSearch({ items, canSearchMembers, onClose }: { items: PortalNavItem[]; canSearchMembers: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ query: string; results: MemberSearchResult[] }>({ query: "", results: [] });
  const trimmed = query.trim();
  const lookingUpMembers = canSearchMembers && trimmed.length >= minimumMemberQueryLength;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!element.open) element.showModal();
    // A click on the dimmed backdrop lands on the dialog element itself.
    const closeOnBackdrop = (event: MouseEvent) => { if (event.target === element) element.close(); };
    element.addEventListener("click", closeOnBackdrop);
    return () => element.removeEventListener("click", closeOnBackdrop);
  }, []);

  // Wait for a pause in typing, and ignore an answer that arrives after the words have changed.
  useEffect(() => {
    if (!lookingUpMembers) return;
    let stale = false;
    const timer = window.setTimeout(async () => {
      let results: MemberSearchResult[] = [];
      try { results = await searchMembersForPortal(trimmed); } catch { results = []; }
      if (!stale) setFound({ query: trimmed, results });
    }, 250);
    return () => { stale = true; window.clearTimeout(timer); };
  }, [lookingUpMembers, trimmed]);

  const pages = searchPages(items, query);
  const members = lookingUpMembers && found.query === trimmed ? found.results : [];
  const waiting = lookingUpMembers && found.query !== trimmed;
  const nothing = !pages.length && !members.length && !waiting;

  function moveThroughResults(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      dialog.current?.querySelector<HTMLAnchorElement>("a[data-result]")?.click();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const stops = [dialog.current?.querySelector<HTMLElement>("input"), ...Array.from(dialog.current?.querySelectorAll<HTMLElement>("a[data-result]") ?? [])].filter((stop): stop is HTMLElement => Boolean(stop));
    const at = stops.indexOf(document.activeElement as HTMLElement);
    const next = stops[Math.max(0, Math.min(stops.length - 1, at + (event.key === "ArrowDown" ? 1 : -1)))];
    if (next) { event.preventDefault(); next.focus(); }
  }

  return <dialog ref={dialog} className={styles.palette} aria-label="Search" onClose={onClose} onKeyDown={moveThroughResults}>
    <div className={styles.paletteBody}>
      <div className={styles.paletteInput}>
        <Search aria-hidden="true"/>
        <input type="search" aria-label={canSearchMembers ? "Search pages and members" : "Search pages"} placeholder={canSearchMembers ? "Search pages and members" : "Search pages"} value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" spellCheck={false}/>
        <button type="button" className={styles.paletteClose} onClick={() => dialog.current?.close()}>Close</button>
      </div>
      <div className={styles.paletteResults}>
        {pages.length ? <>
          <p className={styles.resultHeading}>{trimmed ? "Pages" : "Suggested pages"}</p>
          {pages.map((item) => <Link key={item.key} className={styles.result} href={item.href} prefetch={false} data-result="" onClick={onClose}>{item.label}</Link>)}
        </> : null}
        {members.length ? <>
          <p className={styles.resultHeading}>Members</p>
          {members.map((member) => <Link key={member.id} className={styles.result} href={`/admin/memberships/members/${member.id}`} prefetch={false} data-result="" onClick={onClose}>{member.name}<small>{member.detail}</small></Link>)}
        </> : null}
        <div role="status" aria-live="polite">
          {waiting ? <p className={styles.paletteNote}>Looking for members…</p> : null}
          {nothing ? <p className={styles.paletteNote}>Nothing matches “{trimmed}”. Try another word{canSearchMembers ? " or a member’s name" : ""}.</p> : null}
        </div>
      </div>
    </div>
  </dialog>;
}
