// The "Made with MyFinances" credit is on by default; a self-hoster can hide it with
// VITE_HIDE_BRANDING=true.
export const showBranding = (env: Record<string, unknown> = import.meta.env): boolean =>
  env["VITE_HIDE_BRANDING"] !== "true";
