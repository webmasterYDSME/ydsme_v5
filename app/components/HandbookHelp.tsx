import Link from "next/link";
import { BookOpen } from "lucide-react";
import type { ReactNode } from "react";
import { chapterHref } from "@/lib/handbook/text";

/** A small link from a screen to the part of the Membership officer handbook that explains it. */
export function HandbookHelp({ chapter, section, children }: { chapter: string; section?: string; children?: ReactNode }) {
  return <Link className="handbook-help" href={chapterHref(chapter, section)} prefetch={false}><BookOpen aria-hidden="true"/>{children ?? "Handbook"}</Link>;
}
