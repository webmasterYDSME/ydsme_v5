/**
 * Escapes a value for use with `.ilike()` so it matches that exact text, case-insensitively.
 * Without this, `_` and `%` in an email address act as wildcards and can match somebody else's address.
 */
export const likeLiteral = (value: string) => value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
