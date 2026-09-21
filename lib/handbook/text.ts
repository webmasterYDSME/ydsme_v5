// Small helpers for the handbook's text and search. No imports, so they can be unit tested directly.

import type { HandbookBlock, HandbookChapter } from "./types";

export type InlineToken = { kind: "text" | "bold" | "code" | "link"; text: string; href?: string };

const inlinePattern = /\*\*(.+?)\*\*|`(.+?)`|\[(.+?)\]\((.+?)\)/g;

/** Splits handbook text into plain, bold, code and link pieces. Nothing is ever treated as HTML. */
export function inlineTokens(source: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let last = 0;
  for (const match of source.matchAll(inlinePattern)) {
    const index = match.index ?? 0;
    if (index > last) tokens.push({ kind: "text", text: source.slice(last, index) });
    if (match[1] !== undefined) tokens.push({ kind: "bold", text: match[1] });
    else if (match[2] !== undefined) tokens.push({ kind: "code", text: match[2] });
    else tokens.push({ kind: "link", text: match[3], href: match[4] });
    last = index + match[0].length;
  }
  if (last < source.length) tokens.push({ kind: "text", text: source.slice(last) });
  return tokens;
}

export const plainText = (source: string) => inlineTokens(source).map((token) => token.text).join("");

/** Every link written in a piece of text. */
export const linksIn = (source: string) => inlineTokens(source).flatMap((token) => (token.kind === "link" && token.href ? [token.href] : []));

export function blockTexts(block: HandbookBlock): string[] {
  switch (block.type) {
    case "p": return [block.text];
    case "steps":
    case "list": return block.items;
    case "note": return [block.title ?? "", block.text];
    case "table": return [...block.head, ...block.rows.flat()];
  }
}

export const chapterHref = (slug: string, sectionId?: string) => `/admin/handbook/${slug}${sectionId ? `#${sectionId}` : ""}`;

export type HandbookHit = {
  chapterSlug: string;
  chapterTitle: string;
  sectionId: string;
  sectionTitle: string;
  snippet: string;
  score: number;
};

const escapeForRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A short piece of the section around the first word found, with the words the reader typed left as they are. */
function snippetFor(text: string, words: string[]) {
  const lower = text.toLowerCase();
  const found = words.map((word) => lower.indexOf(word)).filter((index) => index >= 0);
  const start = found.length ? Math.max(0, Math.min(...found) - 60) : 0;
  const piece = text.slice(start, start + 220).trim();
  return `${start > 0 ? "… " : ""}${piece}${start + 220 < text.length ? " …" : ""}`;
}

/**
 * Sections that contain every word typed. A word in the section title counts most, then one in the chapter
 * title, then the text. The best sections come first.
 */
export function searchHandbook(chapters: HandbookChapter[], query: string, limit = 30): HandbookHit[] {
  const words = query.toLowerCase().split(/\s+/).map((word) => word.replace(/[^\p{L}\p{N}£'’-]/gu, "")).filter((word) => word.length > 1);
  if (!words.length) return [];
  const hits: HandbookHit[] = [];
  for (const chapter of chapters) {
    for (const section of chapter.sections) {
      const body = section.blocks.flatMap(blockTexts).map(plainText).join(" ");
      const title = section.title.toLowerCase();
      const chapterTitle = chapter.title.toLowerCase();
      const all = `${title} ${chapterTitle} ${chapter.summary.toLowerCase()} ${body.toLowerCase()}`;
      if (!words.every((word) => all.includes(word))) continue;
      let score = 0;
      for (const word of words) {
        if (title.includes(word)) score += 10;
        if (chapterTitle.includes(word)) score += 4;
        score += Math.min(5, (body.toLowerCase().match(new RegExp(escapeForRegExp(word), "g")) ?? []).length);
      }
      hits.push({ chapterSlug: chapter.slug, chapterTitle: chapter.title, sectionId: section.id, sectionTitle: section.title, snippet: snippetFor(body, words), score });
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.chapterTitle.localeCompare(b.chapterTitle)).slice(0, limit);
}

export const audienceLabels = { officer: "Membership officers", administrator: "Administrators", everyone: "Everyone on the membership team" } as const;
