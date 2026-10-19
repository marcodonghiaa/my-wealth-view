import type { Database } from "@/integrations/supabase/types";

// Shared building blocks for the demo generator: types, ids, and day-based deterministic helpers.

type Public = Database["public"];
type Sources = Public["Tables"] & Public["Views"];
export type DemoDb = { [K in keyof Sources]: Array<Sources[K]["Row"]> };
export type Tx = DemoDb["transactions"][number];

export const DEMO_USER_ID = "00000000-0000-4000-8000-00000000demo";
// Not UI sections: bank-consent handshakes and browser push endpoints. Empty on purpose.
export const DEMO_EXEMPT_TABLES = ["pending_bank_consents", "push_subscriptions"] as const;

export const DEMO_WINDOW_DAYS = 90;
export const DAY_MS = 86_400_000;
export const MAIN = "demo-acc-main";
export const SAVINGS = "demo-acc-savings";

// ---------- deterministic helpers ----------

export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function rngFor(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const iso = (dayNum: number) => new Date(dayNum * DAY_MS).toISOString().slice(0, 10);
export const dayOfMonth = (dayNum: number) => new Date(dayNum * DAY_MS).getUTCDate();
export const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
export const stamp = (date: string) => `${date}T09:00:00Z`;
export const between = (r: () => number, lo: number, hi: number) => round2(lo + r() * (hi - lo));
export const pick = <T>(r: () => number, list: ReadonlyArray<T>): T =>
  list[Math.floor(r() * list.length)]!;
export const sum = (xs: Array<number>) => xs.reduce((s, x) => s + x, 0);

// Smooth wobble plus daily noise, so charts move but a given date always gives the same value.
export const price = (base: number, key: string, dayNum: number) =>
  round2(
    base *
      (1 +
        0.04 * Math.sin(dayNum / 9 + (hash(key) % 7)) +
        0.01 * (rngFor(`${key}|${dayNum}`)() - 0.5)),
  );
