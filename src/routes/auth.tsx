import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Github, Loader2, LockKeyhole, Sparkles, TrendingUp } from "lucide-react";
import { getSupabase } from "@/integrations/supabase/client";

export function safeNext(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/")) return undefined;
  // Parse (not regex-match) so the URL parser's own backslash/protocol-relative
  // normalization catches bypasses like "/\evil.com" -> "//evil.com" that a
  // leading-slash regex alone would miss.
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.origin === window.location.origin ? value : undefined;
  } catch {
    return undefined;
  }
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => {
    const next = safeNext(s["next"]);
    return next ? { next } : {};
  },
  head: () => ({
    meta: [
      { title: "Sign in — MyFinances" },
      {
        name: "description",
        content: "Sign in to your personal finance dashboard.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Sign in — MyFinances" },
      {
        property: "og:description",
        content: "Sign in to your personal finance dashboard.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();

  const goNext = (replace = true) => {
    if (next) {
      window.location.replace(next);
      return Promise.resolve();
    }
    return navigate({ to: "/", replace });
  };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  // Already signed in? Go straight to the dashboard.
  useEffect(() => {
    let cancelled = false;
    let sessionPromise: ReturnType<
      ReturnType<typeof getSupabase>["auth"]["getSession"]
    >;
    try {
      sessionPromise = getSupabase().auth.getSession();
    } catch {
      setCheckingSession(false);
      return;
    }
    sessionPromise
      .then(({ data }) => {
        if (cancelled) return;
        if (data.session) {
          void goNext();
        } else {
          setCheckingSession(false);
        }
      })
      .catch(() => setCheckingSession(false));
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { error: signInError } = await getSupabase().auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;
      await goNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <TrendingUp className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            MyFinances
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to view your finances
          </p>
        </div>

        <a
          href="/demo"
          className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <Sparkles className="size-4" />
          Just here to look around? View the live demo
        </a>

        <div className="rounded-2xl border bg-card p-6 card-ring">
          {checkingSession ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-2 focus:ring-ring"
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-2 focus:ring-ring"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p role="alert" className="text-sm text-negative">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={pending}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-50"
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <LockKeyhole className="size-4" />
                )}
                Sign in
              </button>
            </form>
          )}

          <div className="mt-5 border-t pt-4 text-center">
            <a
              href="https://github.com/marcodonghiaa/my-wealth-view"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Github className="size-3.5" />
              No account? Self-host your own
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
