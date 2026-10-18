import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { shouldShowWelcome } from "@/lib/import/welcome";

interface WelcomeCardProps {
  snapshots: number;
  history: number;
}

async function fetchWelcomeFacts() {
  const [accounts, user] = await Promise.all([
    supabase.from("accounts").select("uid", { count: "exact", head: true }),
    supabase.auth.getUser(),
  ]);
  if (accounts.error) throw accounts.error;
  return {
    accounts: accounts.count ?? 0,
    dismissed: user.data.user?.user_metadata?.welcome_dismissed === true,
  };
}

/** First-run card for an empty instance. Renders nothing once there is data or it was dismissed. */
export function WelcomeCard({ snapshots, history }: WelcomeCardProps) {
  const queryClient = useQueryClient();
  const facts = useQuery({ queryKey: ["welcome-facts"], queryFn: fetchWelcomeFacts });
  const dismiss = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.updateUser({ data: { welcome_dismissed: true } });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["welcome-facts"] }),
  });

  if (!facts.data || !shouldShowWelcome({ ...facts.data, snapshots, history })) return null;

  return (
    <section className="mb-8 rounded-2xl border bg-card p-5 card-ring">
      <h2 className="text-base font-semibold">Welcome to MyFinances</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Nothing here yet. Bring in your past from a spreadsheet, or connect a bank to start fresh.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          to="/import"
          className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Import a CSV
        </Link>
        <Link
          to="/accounts"
          className="inline-flex min-h-11 items-center rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Connect a bank
        </Link>
        <button
          type="button"
          onClick={() => dismiss.mutate()}
          disabled={dismiss.isPending}
          className="min-h-11 px-2 text-sm text-muted-foreground hover:text-foreground"
        >
          Dismiss
        </button>
      </div>
    </section>
  );
}
