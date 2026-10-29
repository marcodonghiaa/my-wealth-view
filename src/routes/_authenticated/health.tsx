import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { PushSubscribeButton, pushSupport } from "@/components/push-subscribe";
import { isDemoMode } from "@/lib/demo/mode";
import { supabase } from "@/integrations/supabase/client";
import {
  accessRows,
  attentionCount,
  bySeverity,
  originRow,
  pushRow,
  syncRows,
  type HealthAccount,
  type HealthRow,
  type HealthState,
} from "@/lib/health";

export const Route = createFileRoute("/_authenticated/health")({
  head: () => ({
    meta: [
      { title: "Health — MyFinances" },
      { name: "description", content: "Anything that could be silently failing." },
    ],
  }),
  component: HealthPage,
});

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

const DOT: Record<HealthState, string> = {
  ok: "bg-positive",
  warn: "bg-warning",
  bad: "bg-negative",
};
const STATE_LABEL: Record<HealthState, string> = {
  ok: "Healthy",
  warn: "Needs attention",
  bad: "Broken",
};

function HealthRowItem({ row, onPushed }: { row: HealthRow; onPushed: () => void }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          role="img"
          aria-label={STATE_LABEL[row.state]}
          className={`mt-1.5 size-2.5 shrink-0 rounded-full ${DOT[row.state]}`}
        />
        <div className="min-w-0">
          <p className="text-[0.9375rem] font-medium text-foreground">{row.title}</p>
          <p className="max-w-xl text-sm text-muted-foreground">{row.detail}</p>
        </div>
      </div>
      {row.fix && "push" in row.fix && <PushSubscribeButton onSubscribed={onPushed} />}
      {row.fix && "to" in row.fix && (
        <Link
          to={row.fix.to}
          className="min-h-11 content-center rounded-full px-3 text-sm font-medium text-primary hover:bg-primary/10"
        >
          {row.fix.label}
        </Link>
      )}
    </li>
  );
}

function HealthPage() {
  const queryClient = useQueryClient();
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
      support && (support !== "ok" || subscribed.data !== undefined)
        ? pushRow(support, subscribed.data ?? false)
        : null,
      origin.data === undefined ? null : originRow(origin.data),
    ]
      .filter((r): r is HealthRow => r !== null)
      .sort(bySeverity);
  }, [accounts.data, support, subscribed.data, origin.data]);

  const attention = attentionCount(rows);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 md:py-12">
      <header className="mb-10">
        <h1 className="text-[0.9375rem] font-medium text-muted-foreground">Health</h1>
        <div className="mt-1 min-h-16">
          {accounts.isPending ? (
            <div className="h-16 w-40 animate-pulse rounded-2xl bg-muted" />
          ) : (
            <p className="figure-display">
              {attention}
              <span className="text-[0.5em] font-medium tracking-[-0.02em] text-muted-foreground">
                {" "}
                need{attention === 1 ? "s" : ""} attention
              </span>
            </p>
          )}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Everything here can fail without an error message. Worst first.
        </p>
      </header>

      {accounts.isError && (
        <div
          role="alert"
          className="mb-4 rounded-2xl bg-negative/10 px-4 py-3 text-sm text-negative"
        >
          Couldn't load your accounts: {accounts.error.message}
        </div>
      )}

      {rows.length > 0 && (
        <ul className="divide-y rounded-2xl border bg-card px-5 card-ring">
          {rows.map((row) => (
            <HealthRowItem
              key={row.id}
              row={row}
              onPushed={() => void queryClient.invalidateQueries({ queryKey: ["push-subscribed"] })}
            />
          ))}
        </ul>
      )}
      {!accounts.isPending && !accounts.isError && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing to check yet. Connect a bank first.</p>
      )}
    </div>
  );
}
