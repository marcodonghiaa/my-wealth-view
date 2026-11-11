// Where sign-in sends the user back to afterwards. Kept out of the route file so importing it
// doesn't pull the sign-in page into the main bundle.

export function safeNext(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/")) return undefined;
  // Parse (not regex-match) so the URL parser's own backslash/protocol-relative
  // normalization catches bypasses like "/\evil.com" -> "//evil.com" that a
  // leading-slash regex alone would miss.
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.origin === window.location.origin ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Sign-in's search for coming back to this page afterwards (hash included: a bank's #bank_code). */
export function backHereSearch(location: { pathname: string; searchStr: string; hash: string }): {
  next?: string;
} {
  const next = location.pathname + location.searchStr + (location.hash ? `#${location.hash}` : "");
  return next === "/" ? {} : { next };
}
