export const REFERENCE_SUPABASE_URL = "https://diwezyrtlwdbrsgegkay.supabase.co";
export const REFERENCE_SUPABASE_KEY = "sb_publishable_TUrIFr1vCjdFi7UF81VWhA_Qu8FiCe1";

// Lovable's hosting builds without VITE_SUPABASE_*, so these hosts keep the reference project.
const LOVABLE_ZONES = ["lovable.app", "lovableproject.com", "lovableproject-dev.com"];

type Input = {
  url: string | undefined;
  key: string | undefined;
  hostname: string | undefined; // undefined on the server
  dev: boolean;
};

// A browser on any other host with missing variables would send the user's login to the
// reference project instead of their own, so that case throws instead of falling back.
export function resolveSupabaseConfig({ url, key, hostname, dev }: Input) {
  if (url && key) return { url, key, usingFallback: false };

  const fallbackAllowed =
    dev ||
    hostname === undefined ||
    LOVABLE_ZONES.some((zone) => hostname === zone || hostname.endsWith(`.${zone}`));
  if (!fallbackAllowed) {
    throw new Error(
      "VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set at build time (see .env.example).",
    );
  }
  return { url: REFERENCE_SUPABASE_URL, key: REFERENCE_SUPABASE_KEY, usingFallback: true };
}
