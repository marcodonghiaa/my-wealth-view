import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { functionErrorMessage } from "@/lib/function-error";

const CONFIRM_WORD = "DELETE";

/** Deletes the signed-in user and all their data via the delete-account Edge Function. */
export function DeleteAccount() {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    setPending(true);
    const { error: invokeError } = await supabase.functions.invoke("delete-account", {
      body: { confirm: CONFIRM_WORD, password },
    });
    if (invokeError) {
      setError(await functionErrorMessage(invokeError, "Couldn't delete your account, try again."));
      setPending(false);
      return;
    }
    await supabase.auth.signOut();
    await navigate({ to: "/auth", replace: true });
  }

  return (
    <section
      aria-labelledby="delete-account-heading"
      className="max-w-sm space-y-4 rounded-2xl border border-negative/30 bg-card p-5"
    >
      <div>
        <h3 id="delete-account-heading" className="text-[0.9375rem] font-medium text-negative">
          Delete account
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Deletes your login and everything stored for it on this instance: accounts, transactions,
          holdings, rules. Banks you linked recently are disconnected too; for older links, revoke
          access in your bank's app. This can't be undone. Export your data first if you want a
          copy.
        </p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="delete-confirm" className="text-xs font-medium text-muted-foreground">
          Type {CONFIRM_WORD} to confirm
        </label>
        <input
          id="delete-confirm"
          autoComplete="off"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base text-foreground outline-none transition-colors focus:border-negative/60 focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="delete-password" className="text-xs font-medium text-muted-foreground">
          Your password
        </label>
        <input
          id="delete-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base text-foreground outline-none transition-colors focus:border-negative/60 focus:ring-2 focus:ring-ring"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending || confirm !== CONFIRM_WORD || !password}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-negative/10 px-4 text-sm font-semibold text-negative transition-colors hover:bg-negative/20 disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        Delete account
      </button>
    </section>
  );
}
