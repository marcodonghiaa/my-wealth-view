import { bankOf } from "@/components/bank-badge";
import { consentAlerts } from "@/lib/consent-expiry";
import { plural } from "@/lib/plural";

export type HealthState = "ok" | "warn" | "bad";

export interface HealthRow {
  id: string;
  title: string;
  state: HealthState;
  detail: string;
  // The one fix: a page to open, or a built-in control for the row.
  fix?: { label: string; to: "/accounts" } | { label: string; href: string } | { push: true };
}

export interface HealthAccount {
  uid: string | null;
  label: string | null;
  currency: string | null;
  bank_name?: string | null;
  consent_valid_until: string | null;
  snapshot_date: string | null;
}

const HOUR_MS = 60 * 60 * 1000;
const STALE_AMBER_H = 24;
const STALE_RED_H = 72;

// Worst first, so a page can show what needs attention at the top.
const SEVERITY: Record<HealthState, number> = { bad: 0, warn: 1, ok: 2 };
export const bySeverity = (a: HealthRow, b: HealthRow) => SEVERITY[a.state] - SEVERITY[b.state];

// Hours since the account's latest balance snapshot. The snapshot is a calendar day (UTC), so a
// balance from today reads 0-24 h, yesterday's 24-48 h, and three days back is red.
export function syncAgeHours(snapshotDate: string, now: Date): number {
  return (now.getTime() - Date.parse(snapshotDate.slice(0, 10))) / HOUR_MS;
}

export function syncState(ageHours: number): HealthState {
  if (ageHours > STALE_RED_H) return "bad";
  return ageHours > STALE_AMBER_H ? "warn" : "ok";
}

function ageText(ageHours: number): string {
  const days = Math.floor(ageHours / 24);
  return days < 1 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

// Only accounts with a bank consent are bank-synced; imported and manual ones are skipped.
const connected = (accounts: Array<HealthAccount>) => accounts.filter((a) => a.consent_valid_until);

/** One row per connected bank: how long its access lasts (the bank stops syncing silently after). */
export function accessRows(accounts: Array<HealthAccount>, today: Date): Array<HealthRow> {
  const alerts = new Map(consentAlerts(accounts, today).map((a) => [a.bank, a.daysLeft]));
  const banks = new Set(connected(accounts).map(bankOf));
  const fix = { label: "Renew access", to: "/accounts" } as const;
  return [...banks].map((bank) => {
    const title = `${bank} access`;
    const daysLeft = alerts.get(bank);
    if (daysLeft === undefined) {
      return { id: `access:${bank}`, title, state: "ok", detail: "Bank access is valid." };
    }
    if (daysLeft < 0) {
      return {
        id: `access:${bank}`,
        title,
        state: "bad",
        detail: "Bank access has expired, so it no longer syncs.",
        fix,
      };
    }
    const when = daysLeft === 0 ? "today" : `in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
    return {
      id: `access:${bank}`,
      title,
      state: daysLeft === 0 ? "bad" : "warn",
      detail: `Bank access ends ${when}.`,
      fix,
    };
  });
}

/** One row per connected account: when its balance last updated. */
export function syncRows(accounts: Array<HealthAccount>, now: Date): Array<HealthRow> {
  return connected(accounts).map((a) => {
    const id = `sync:${a.uid ?? a.label}`;
    const title = `${[bankOf(a), a.currency].filter(Boolean).join(" ")} sync`;
    if (!a.snapshot_date) {
      return { id, title, state: "warn", detail: "No balance synced yet." };
    }
    const age = syncAgeHours(a.snapshot_date, now);
    const state = syncState(age);
    return {
      id,
      title,
      state,
      detail: `Last synced ${ageText(age)}.`,
      ...(state !== "ok" && { fix: { label: "Check access", to: "/accounts" } as const }),
    };
  });
}

/** This browser's push status. Null where push can't work (demo, no service worker). */
export function pushRow(
  support: "ok" | "install" | "unsupported",
  subscribed: boolean,
): HealthRow | null {
  const title = "Push notifications";
  if (support === "unsupported") return null;
  if (support === "install") {
    return {
      id: "push",
      title,
      state: "warn",
      detail:
        "Install the app first (iPhone: Safari → Share → Add to Home Screen), then turn this on.",
    };
  }
  return subscribed
    ? { id: "push", title, state: "ok", detail: "This browser gets purchase check-ins." }
    : {
        id: "push",
        title,
        state: "warn",
        detail: "This browser isn't subscribed to purchase check-ins.",
        fix: { push: true },
      };
}

/** Whether the backend knows this dashboard's address. Null when the table isn't readable. */
export function originRow(registered: number | null): HealthRow | null {
  if (registered === null) return null;
  const title = "Dashboard address";
  return registered > 0
    ? { id: "origin", title, state: "ok", detail: "The backend knows this dashboard's address." }
    : {
        id: "origin",
        title,
        state: "warn",
        detail:
          "No address registered yet. Sign in from the dashboard's own address to register it.",
      };
}

// The Edge Function secrets page of this dashboard's own Supabase project ("https://<ref>.supabase.co").
export function supabaseSecretsUrl(projectUrl: string | undefined): string | null {
  const ref = projectUrl?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/)?.[1];
  return ref ? `https://supabase.com/dashboard/project/${ref}/functions/secrets` : null;
}

/**
 * Whether AI categorization works, read from what it did: the key itself never reaches the
 * browser. Last 30 days: rows sorted by AI, and rows still without a category a day after they
 * arrived (each sync run clears them while the key works, so these mean no key, a revoked one or
 * a spent quota). Null when there is nothing to judge or the counts couldn't be read.
 */
export function aiRow(
  counts: { ai: number; stuck: number } | null,
  secretsUrl: string | null,
): HealthRow | null {
  if (!counts || (counts.ai === 0 && counts.stuck === 0)) return null;
  const title = "AI categories";
  if (counts.stuck === 0) {
    return {
      id: "ai",
      title,
      state: "ok",
      detail: `Gemini sorted ${plural(counts.ai)} in the last 30 days.`,
    };
  }
  return {
    id: "ai",
    title,
    state: "warn",
    detail:
      `${plural(counts.stuck)} still ${counts.stuck === 1 ? "has" : "have"} no category a day after syncing. ` +
      "Add or check GEMINI_API_KEY: in Supabase secrets, or in .env / GitHub secrets if you installed " +
      "with setup.sh. Descriptions go to Google; its free tier may train on them.",
    ...(secretsUrl && { fix: { label: "Open Supabase secrets", href: secretsUrl } }),
  };
}

export const attentionCount = (rows: Array<HealthRow>) =>
  rows.filter((r) => r.state !== "ok").length;
