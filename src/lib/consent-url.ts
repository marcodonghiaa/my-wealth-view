// The consent URL comes back from an edge function and is assigned to window.location,
// so a javascript: or http: value would run script or downgrade the bank redirect.
export function assertHttpsUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Bank returned an invalid consent URL");
  }
  if (parsed.protocol !== "https:") throw new Error("Bank consent URL must use https");
  return value;
}
