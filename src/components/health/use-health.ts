import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { pushSupport } from "@/components/push-subscribe";
import { isDemoMode } from "@/lib/demo/mode";
import { supabase } from "@/integrations/supabase/client";
import {
  accessRows,
  bySeverity,
  originRow,
  pushRow,
  syncRows,
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

// Whether this browser holds a push subscription. Null until known, or where push can't work.
async function fetchPushSubscribed(): Promise<boolean> {
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(await reg?.pushManager.getSubscription());
}

/** Everything Settings needs from the health checks: the rows, split so push shows under Notifications. */
export function useHealth() {
  const accounts = useQuery({ queryKey: ["bank-accounts-latest"], queryFn: fetchAccounts });
  const origin = useQuery({ queryKey: ["dashboard-origins"], queryFn: fetchOriginCount });
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
    ]
      .filter((r): r is HealthRow => r !== null)
      .sort(bySeverity);
  }, [accounts.data, origin.data]);

  const push: HealthRow | null =
    support && (support !== "ok" || subscribed.data !== undefined)
      ? pushRow(support, subscribed.data ?? false)
      : null;

  return { accounts, rows, push };
}
