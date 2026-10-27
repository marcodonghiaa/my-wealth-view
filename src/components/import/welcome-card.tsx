import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { PushSubscribeButton, pushSupport } from "@/components/push-subscribe";
import { supabase } from "@/integrations/supabase/client";
import { checklistSteps, shouldShowChecklist, type StepId } from "@/lib/import/welcome";

const count = async (
  table: "accounts" | "portfolio_holdings" | "crypto_holdings" | "push_subscriptions",
  col: string,
) => {
  const { count: n, error } = await supabase
    .from(table)
    .select(col, { count: "exact", head: true });
  if (error) throw error;
  return n ?? 0;
};

async function fetchWelcomeFacts() {
  const [accounts, portfolio, crypto, notifications, user] = await Promise.all([
    count("accounts", "uid"),
    count("portfolio_holdings", "isin"),
    count("crypto_holdings", "asset_symbol"),
    count("push_subscriptions", "id"),
    supabase.auth.getUser(),
  ]);
  return {
    accounts,
    holdings: portfolio + crypto,
    notifications,
    dismissed: user.data.user?.user_metadata?.["welcome_dismissed"] === true,
  };
}

const STEP_COPY: Record<StepId, { title: string; detail: string; to?: string; cta?: string }> = {
  bank: {
    title: "Connect a bank",
    detail: "Balances show at once; transactions follow within minutes.",
    to: "/accounts",
    cta: "Connect",
  },
  investments: {
    title: "Add your investments and crypto",
    detail: "Search by name, ticker or ISIN, then enter how many you hold.",
    to: "/portfolio",
    cta: "Add",
  },
  history: {
    title: "Import your history",
    detail: "Past net worth or spending from a spreadsheet, so charts start earlier.",
    to: "/import",
    cta: "Import",
  },
  notifications: {
    title: "Turn on notifications",
    detail: "A nudge after discretionary purchases, and before a bank's access runs out.",
  },
};

// Push only works from the installed app, so a browser tab gets install steps instead of a button.
// Computed after mount: pushSupport() reads window, and SSR must render the same first pass.
function NotificationsAction() {
  const [support, setSupport] = useState<ReturnType<typeof pushSupport> | null>(null);
  useEffect(() => setSupport(pushSupport()), []);
  if (support === "ok") return <PushSubscribeButton />;
  if (support !== "install") return null;
  return (
    <p className="max-w-xs text-xs text-muted-foreground">
      Install the app first: on iPhone, Safari → Share → Add to Home Screen; on Android, Chrome menu
      → Install app; on a computer, the install icon in the address bar. Then open the app and turn
      this on.
    </p>
  );
}

/** Getting-started checklist. Ticks itself off from your data; gone once a bank and investments are in, or when dismissed. */
export function WelcomeCard({ history }: { history: number }) {
  const queryClient = useQueryClient();
  const facts = useQuery({ queryKey: ["welcome-facts"], queryFn: fetchWelcomeFacts });
  const dismiss = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.updateUser({ data: { welcome_dismissed: true } });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["welcome-facts"] }),
  });

  if (!facts.data) return null;
  const all = { ...facts.data, history };
  if (!shouldShowChecklist(all)) return null;
  const steps = checklistSteps(all);
  const done = steps.filter((s) => s.done).length;

  return (
    <section
      className="mb-8 rounded-2xl border bg-card p-5 card-ring"
      aria-labelledby="getting-started"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="getting-started" className="text-base font-semibold">
            Get started
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {done} of {steps.length} done. Each step ticks itself off once its data is in.
          </p>
        </div>
        <button
          type="button"
          onClick={() => dismiss.mutate()}
          disabled={dismiss.isPending}
          className="min-h-11 shrink-0 px-2 text-sm text-muted-foreground hover:text-foreground"
        >
          Dismiss
        </button>
      </div>

      <ol className="mt-4 divide-y rounded-xl border">
        {steps.map((step) => {
          const copy = STEP_COPY[step.id];
          return (
            <li key={step.id} className="flex items-center gap-3 px-4 py-3">
              <span
                aria-hidden
                className={`flex size-6 shrink-0 items-center justify-center rounded-full border ${step.done ? "border-positive bg-positive/15 text-positive" : "text-muted-foreground"}`}
              >
                {step.done && <Check className="size-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium ${step.done ? "text-muted-foreground line-through" : "text-foreground"}`}
                >
                  {copy.title}
                  {step.optional && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      optional
                    </span>
                  )}
                  <span className="sr-only">{step.done ? " (done)" : " (to do)"}</span>
                </p>
                {!step.done && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{copy.detail}</p>
                )}
              </div>
              {!step.done &&
                (copy.to ? (
                  <Link
                    to={copy.to}
                    className="inline-flex min-h-11 shrink-0 items-center rounded-lg border px-3 text-sm font-medium hover:bg-muted"
                  >
                    {copy.cta}
                  </Link>
                ) : (
                  <NotificationsAction />
                ))}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
