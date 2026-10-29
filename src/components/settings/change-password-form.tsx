import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MIN_PASSWORD_LENGTH, passwordErrorMessage, validateNewPassword } from "@/lib/password";

const INPUT =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base text-foreground outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-ring";

function Field(props: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={props.id} className="text-xs font-medium text-muted-foreground">
        {props.label}
      </label>
      <input
        id={props.id}
        type="password"
        required
        autoComplete={props.autoComplete}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className={INPUT}
      />
      {props.hint && <p className="text-xs text-muted-foreground">{props.hint}</p>}
    </div>
  );
}

/**
 * Change the password of the signed-in account. No email involved: the current password is
 * checked by signing in again (which also gives a fresh session, so the server's
 * recent-sign-in requirement is met), then the new one is saved.
 */
export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDone(false);
    const invalid = validateNewPassword(next, confirmation);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setPending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const email = sessionData.session?.user.email;
      if (!email) throw new Error("You're signed out. Sign in again, then retry.");
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (verifyError) throw verifyError;
      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) throw updateError;
      setCurrent("");
      setNext("");
      setConfirmation("");
      setDone(true);
    } catch (err) {
      setError(passwordErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <section id="account" aria-labelledby="account-heading" className="scroll-mt-6">
      <h2 id="account-heading" className="mb-4 text-[0.9375rem] font-medium text-muted-foreground">
        Account
      </h2>
      <form onSubmit={handleSubmit} className="max-w-sm space-y-4 rounded-2xl border bg-card p-5">
        <h3 className="text-[0.9375rem] font-medium text-foreground">Change password</h3>
        <Field
          id="current-password"
          label="Current password"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
        />
        <Field
          id="new-password"
          label="New password"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        />
        <Field
          id="confirm-password"
          label="Confirm new password"
          value={confirmation}
          onChange={setConfirmation}
          autoComplete="new-password"
        />
        {error && (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        )}
        {done && (
          <p role="status" className="text-sm text-positive">
            Password changed. Use it next time you sign in.
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:brightness-110 disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
          Change password
        </button>
      </form>
    </section>
  );
}
