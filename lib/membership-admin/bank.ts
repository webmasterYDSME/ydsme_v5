// Bank details helpers. No imports, so they can be unit tested with `node --experimental-strip-types`.

/** Shows what has been typed so far as a UK sort code: digits only, at most six, hyphen after every two. */
export function formatSortCodeAsTyped(input: string) {
  const digits = input.replace(/\D/g, "").slice(0, 6);
  return (digits.match(/.{1,2}/g) ?? []).join("-");
}

/**
 * A complete sort code as 12-34-56, from 123456, 12 34 56 or 12-34-56 (spaces, dots and dashes are
 * ignored). Anything else, including letters or the wrong number of digits, returns null.
 */
export function normaliseSortCode(input: string) {
  const compact = input.trim().replace(/[\s.\-‐-―]/g, "");
  return /^[0-9]{6}$/.test(compact) ? `${compact.slice(0, 2)}-${compact.slice(2, 4)}-${compact.slice(4)}` : null;
}
