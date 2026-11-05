// Placeholder used when the variables are missing in the dev server or during server rendering:
// an address that never resolves, so nothing is ever sent to any real project. Only /demo works
// until VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are set.
export const NOT_CONFIGURED_URL = "https://not-configured.invalid";
const NOT_CONFIGURED_KEY = "not-configured";

type Input = {
  url: string | undefined;
  key: string | undefined;
  hostname: string | undefined; // undefined on the server
  dev: boolean;
};

// There is no shared fallback project: a copy without its own variables must never send logins
// or data to someone else's Supabase. A production build in a browser throws; the dev server and
// server rendering get the placeholder, so the demo still runs.
export function resolveSupabaseConfig({ url, key, hostname, dev }: Input) {
  if (url && key) return { url, key, configured: true };

  if (!dev && hostname !== undefined) {
    throw new Error(
      "VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set at build time (see .env.example).",
    );
  }
  return { url: NOT_CONFIGURED_URL, key: NOT_CONFIGURED_KEY, configured: false };
}
