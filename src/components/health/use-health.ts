import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { pushSupport } from "@/components/push-subscribe";
import { isDemoMode } from "@/lib/demo/mode";
import { supabase } from "@/integrations/supabase/client";
import {
  accessRows,
  aiRow,
  bySeverity,
  originRow,
  pushRow,
  supabaseSecretsUrl,
  syncRows,
  syncStatus,
  type HealthAccount,
  type HealthRow,
} from "@/lib/health";

async function fetchAccounts(): Promise<Array<HealthAccount>> {
  const { data, error } = await supabase.from("v_bank_accounts_latest").select("*");
  if (error) throw error;
  return (data ?? []) as Array<HealthAccount>;
}

// Not in the generated types and not a screen section, so no demo data: the demo skips the row.
const ORIGINS_TABLE = "dashboard_origins";

// The row is skipped (null) when this database doesn't let the owner read the table.
async function fetchOriginCount(): Promise<number | null> {
  if (isDemoMode()) return null;
  const { data, error } = await supabase.from(ORIGINS_TABLE as never).select("*");
  return error || !Array.isArray(data) ? null : data.length;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Last 30 days: transactions sorted by AI, and ones still without a category a day after they
// arrived. Null in the demo (its rows say nothing about a real key) or when a count can't be read.
async function fetchAiCounts(): Promise<{ ai: number; stuck: number } | null> {
  if (isDemoMode()) return null;
  const since = new Date(Date.now() - 30 * DAY_MS).toISOString().slice(0, 10);
  const dayAgo = new Date(Date.now() - DAY_MS).toISOString();
  const count = (filter: "ai" | "none") => {
    const q = supabase
      .from("transactions")
      .select("entry_reference", { count: "exact", head: true })
      .gte("booking_date", since)
      .is("deleted_at", null);
    return filter === "ai"
      ? q.eq("category_source" as never, "ai")
      : q.is("category", null).lt("created_at", dayAgo);
  };
  const [ai, none] = await Promise.all([count("ai"), count("none")]);
  if (ai.error || none.error || ai.count === null || none.count === null) return null;
  return { ai: ai.count, stuck: none.count };
}

// Whether this browser holds a push subscription. Null until known, or where push can't work.
async function fetchPushSubscribed(): Promise<boolean> {
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(await reg?.pushManager.getSubscription());
}

/** Everything Settings needs from the health checks: the rows, split so push shows under Notifications. */
export function useHealth() {
  const accounts = useQuery({ queryKey: ["bank-accounts-latest"], queryFn: fetchAccounts });
  const origin = useQuery({ queryKey: ["dashboard-origins"], queryFn: fetchOriginCount });
  const ai = useQuery({ queryKey: ["ai-categorized"], queryFn: fetchAiCounts });
  // Client-only: pushSupport() reads window, and SSR must render the same first pass.
  const [support, setSupport] = useState<ReturnType<typeof pushSupport> | null>(null);
  useEffect(() => setSupport(pushSupport()), []);
  const subscribed = useQuery({
    queryKey: ["push-subscribed"],
    queryFn: fetchPushSubscribed,
    enabled: support === "ok",
  });

  const rows = useMemo(() => {
    const now = new Date();
    const list = accounts.data ?? [];
    return [
      ...accessRows(list, now),
      ...syncRows(list, now),
      origin.data === undefined ? null : originRow(origin.data),
      ai.data === undefined
        ? null
        : aiRow(ai.data, supabaseSecretsUrl(import.meta.env["VITE_SUPABASE_URL"])),
    ]
      .filter((r): r is HealthRow => r !== null)
      .sort(bySeverity);
  }, [accounts.data, origin.data, ai.data]);

  const push: HealthRow | null =
    support && (support !== "ok" || subscribed.data !== undefined)
      ? pushRow(support, subscribed.data ?? false)
      : null;

  return { accounts, rows, push };
}

/** Just the freshness line for Net Worth: shares the accounts query with Settings › Health. */
export function useSyncStatus() {
  const accounts = useQuery({ queryKey: ["bank-accounts-latest"], queryFn: fetchAccounts });
  return useMemo(
    () => (accounts.data ? syncStatus(accounts.data, new Date()) : null),
    [accounts.data],
  );
}
