const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

export function safeHttpUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return HTTP_PROTOCOLS.has(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function safeSearchTerm(value: string | null | undefined, maxLength = 100) {
  return (value ?? "")
    .normalize("NFKC")
    .slice(0, maxLength)
    .replace(/[^\p{L}\p{N}@.+\-\s]/gu, "")
    .trim();
}
