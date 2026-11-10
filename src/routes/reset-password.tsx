import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { openedFromRecoveryLink, supabase } from "@/integrations/supabase/client";
import { exitDemoMode } from "@/lib/demo/mode";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { needsMfaCode, verifyMfaCode } from "@/lib/mfa";
import { CodeInput } from "@/components/ui/field";

/** Where the recovery email sends the user: this page, on the dashboard's own origin. */
export const resetPasswordUrl = (origin: string) => `${origin}/reset-password`;

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  // The recovery link signs in for real, so a demo visit in this tab ends here.
  beforeLoad: ({ context }) => {
    exitDemoMode();
    context.queryClient.clear();
  },
  head: () => ({
    meta: [{ title: "Choose a new password — Alopex" }, { name: "robots", content: "noindex" }],
  }),
  component: ResetPasswordPage,
});

// Supabase signs the user in from the link in the recovery email (the token is in the URL).
// The form shows only for that sign-in: a tab that was already signed in (say, an unlocked
// laptop) must change the password in Settings, which asks for the current one.
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // The recovery link signs in with the password level only; with an authenticator, Supabase
  // takes the new password only after its code.
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(
        ({ data }) =>
          !cancelled &&
          setHasSession((now) => now || (Boolean(data.session) && openedFromRecoveryLink())),
      )
      .catch(() => !cancelled && setHasSession((now) => now ?? false));
    // The event can come after getSession has answered.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setHasSession(true);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!hasSession) return;
    let cancelled = false;
    void needsMfaCode().then((needed) => !cancelled && setNeedsCode(needed));
    return () => {
      cancelled = true;
    };
  }, [hasSession]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (needsCode) {
        await verifyMfaCode(code);
        setNeedsCode(false); // The session is now aal2: a retry needs no new code.
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      await navigate({ to: "/", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the new password");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark className="mb-4 size-12" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Choose a new password
          </h1>
        </div>

        <div className="rounded-2xl bg-card p-6">
          {hasSession === null ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : hasSession ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="new-password" className="text-xs font-medium text-muted-foreground">
                  New password
                </label>
                <input
                  id="new-password"
                  type="password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-2 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground">
                  At least {MIN_PASSWORD_LENGTH} characters.
                </p>
              </div>

              {needsCode && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="reset-mfa-code"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Authenticator code
                  </label>
                  <CodeInput
                    id="reset-mfa-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    large
                  />
                  <p className="text-xs text-muted-foreground">
                    Your account has two-step sign-in: type the 6-digit code from your authenticator
                    app.
                  </p>
                </div>
              )}

              {error && (
                <p role="alert" className="text-sm text-negative">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={pending}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:brightness-110 disabled:opacity-50"
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <KeyRound className="size-4" />
                )}
                Save and sign in
              </button>
            </form>
          ) : (
            <div className="space-y-4 text-center text-sm">
              <p role="alert" className="text-muted-foreground">
                This reset link has expired or was already used. Ask for a new one from the sign-in
                page.
              </p>
              <Link
                to="/auth"
                className="flex w-full items-center justify-center rounded-full border border-input px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
              >
                Back to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
