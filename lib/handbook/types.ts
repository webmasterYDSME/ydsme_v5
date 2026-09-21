// The Membership officer handbook is written here, in the code, so it changes together with the screens it describes.
// Chapter files import only types, so unit tests can read them directly.
//
// Text may use **bold**, `a screen name or value` and [a link](/admin/memberships/renewals). Links must be
// addresses inside the website (a test checks each one exists).

export type HandbookBlock =
  | { type: "p"; text: string }
  | { type: "steps"; items: string[] }
  | { type: "list"; items: string[] }
  | { type: "note"; tone: "tip" | "warning" | "info"; title?: string; text: string }
  | { type: "table"; head: string[]; rows: string[][] };

export type HandbookSection = {
  /** Used in the address (`#id`), so it must be unique inside the chapter. */
  id: string;
  title: string;
  blocks: HandbookBlock[];
};

export type HandbookAudience = "officer" | "administrator" | "everyone";

export type HandbookChapter = {
  slug: string;
  title: string;
  /** One sentence for the contents page and for search results. */
  summary: string;
  audience: HandbookAudience;
  /** True when the chapter describes the Memberships screens, which only exist while the website runs membership. */
  websiteMode?: boolean;
  /** The day this chapter was last checked against the screens (YYYY-MM-DD). Update it whenever you change the chapter. */
  reviewed: string;
  sections: HandbookSection[];
};
