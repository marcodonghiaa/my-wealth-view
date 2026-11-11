import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Check, Copy, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CodeInput, Input } from "@/components/ui/field";
import {
  defaultAuthenticatorName,
  finishEnrollment,
  listAuthenticators,
  removeAuthenticator,
  retryUnlessRefused,
  startEnrollment,
  type Enrollment,
} from "@/lib/mfa";

const AUTHENTICATORS_KEY = ["mfa-authenticators"];

const message = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback;

/**
 * Two-step sign-in: add an authenticator app (scan a QR code, type its code), list and remove
 * them. With at least one, sign-in asks for a code and the database refuses sessions without it.
 */
export function TwoFactorSection() {
  const queryClient = useQueryClient();
  // One retry, not React Query's three: a failure shows in about a second instead of eight.
  const authenticators = useQuery({
    queryKey: AUTHENTICATORS_KEY,
    queryFn: listAuthenticators,
    retry: (count, err) => count < 1 && retryUnlessRefused(count, err),
  });
  // On a failed load the list stays unknown: showing "Off" could mislead a user who has one.
  const list = authenticators.data ?? null;
  // Stays true while Try again is running, so the button stays put and shows it's busy.
  const loadFailed =
    list === null &&
    (authenticators.isError || (authenticators.errorUpdateCount > 0 && authenticators.isFetching));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const reload = () => queryClient.invalidateQueries({ queryKey: AUTHENTICATORS_KEY });
  // After a step's buttons disappear, keyboard and screen-reader users land back on the section.
  const heading = useRef<HTMLHeadingElement>(null);
  const backToSection = () => heading.current?.focus();
  const shownError =
    error ??
    (authenticators.isError && list !== null && !authenticators.isFetching
      ? message(authenticators.error, "Couldn't load your authenticators.")
      : null);

  async function run(action: () => Promise<void>, fallback: string) {
    setError(null);
    setPending(true);
    try {
      await action();
    } catch (err) {
      setError(message(err, fallback));
    } finally {
      setPending(false);
    }
  }

  const start = () =>
    run(async () => {
      setEnrollment(await startEnrollment(name));
      setCode("");
      setCopied(false);
    }, "Couldn't start the setup.");

  const finish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollment) return;
    void run(async () => {
      await finishEnrollment(enrollment.factorId, code);
      setEnrollment(null);
      setName("");
      await reload();
      backToSection();
    }, "That code didn't work. Try the next one.");
  };

  // The unfinished factor stays until the next setup, which clears it first.
  const cancel = () => {
    setError(null);
    setEnrollment(null);
    backToSection();
  };

  // Cancel and Esc remove the focused button with the panel: put focus back on the row's bin.
  const closeConfirm = (inRow: HTMLElement) => {
    setConfirmRemove(null);
    inRow.closest("li")?.querySelector("button")?.focus();
  };

  const remove = (id: string) =>
    run(async () => {
      await removeAuthenticator(id);
      setConfirmRemove(null);
      await reload();
      backToSection();
    }, "Couldn't remove the authenticator.");

  const on = (list?.length ?? 0) > 0;

  return (
    <section id="two-step" aria-labelledby="two-step-heading" className="scroll-mt-6">
      <div className="max-w-sm space-y-4 rounded-lg bg-card p-5">
        <div>
          <h3
            id="two-step-heading"
            ref={heading}
            tabIndex={-1}
            className="outline-none text-[0.9375rem] font-medium text-foreground"
          >
            Two-step sign-in
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {enrollment
              ? "Setting up…"
              : list === null
                ? loadFailed
                  ? "Couldn't check right now. Check your connection and try again."
                  : "Checking…"
                : on
                  ? "On. Sign-in asks for a code from your authenticator app."
                  : "Off. Add an authenticator app (1Password, Google Authenticator, Aegis…) so a stolen password alone can't open your finances."}
          </p>
        </div>

        {on && (
          <ul className="space-y-2">
            {list!.map((a) => (
              <li
                key={a.id}
                className="space-y-2 text-sm"
                onKeyDown={(e) => e.key === "Escape" && closeConfirm(e.currentTarget)}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <ShieldCheck className="size-4 shrink-0 text-positive" />
                    <span className="truncate text-foreground">{a.name}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${a.name}`}
                    disabled={pending}
                    onClick={() => setConfirmRemove(a.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
                {confirmRemove === a.id && (
                  <div className="space-y-2 rounded-lg bg-negative/10 p-3">
                    <p className="text-xs text-foreground">
                      Remove {a.name}?
                      {list!.length === 1 && " Sign-in won't ask for a code any more."}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={(e) => closeConfirm(e.currentTarget)}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        disabled={pending}
                        onClick={() => void remove(a.id)}
                        className="flex-1 bg-negative text-white"
                      >
                        {pending && <Loader2 className="animate-spin" />}
                        Confirm remove
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {enrollment ? (
          <form onSubmit={finish} className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Scan this with your authenticator app, then type the 6-digit code it shows.
            </p>
            <img
              src={enrollment.qrCode}
              alt="QR code for your authenticator app"
              className="mx-auto size-44 rounded-sm bg-white p-2"
            />
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Can't scan? Enter this key by hand:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-sm tracking-wide text-foreground">
                  {enrollment.secret.match(/.{1,4}/g)?.join(" ")}
                </code>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    void navigator.clipboard?.writeText(enrollment.secret).then(
                      () => setCopied(true),
                      () => undefined,
                    )
                  }
                >
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied" : "Copy key"}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="enroll-code" className="text-xs font-medium text-muted-foreground">
                Authenticator code
              </label>
              <CodeInput
                id="enroll-code"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                aria-invalid={shownError ? true : undefined}
                aria-describedby={shownError ? "two-step-error" : undefined}
              />
              {shownError && (
                <p id="two-step-error" role="alert" className="text-sm text-negative">
                  {shownError}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending} className="flex-1">
                {pending && <Loader2 className="animate-spin" />}
                Turn on
              </Button>
              <Button variant="secondary" disabled={pending} onClick={cancel}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          list !== null && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void start();
              }}
              className="space-y-3"
            >
              <div className="space-y-1.5">
                <label htmlFor="enroll-name" className="text-xs font-medium text-muted-foreground">
                  {on ? "Name of the new one (optional)" : "Name (optional)"}
                </label>
                <Input
                  id="enroll-name"
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={defaultAuthenticatorName(list.map((a) => a.name))}
                />
              </div>
              <Button
                type="submit"
                variant={on ? "secondary" : "primary"}
                disabled={pending}
                className="w-full"
              >
                {pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                {on ? "Add another authenticator" : "Set up two-step sign-in"}
              </Button>
            </form>
          )
        )}

        {loadFailed && (
          <Button
            variant="secondary"
            disabled={authenticators.isFetching}
            onClick={() => void authenticators.refetch().then(backToSection)}
          >
            {authenticators.isFetching && <Loader2 className="animate-spin" />}
            Try again
          </Button>
        )}

        {/* During setup the error sits under the code field instead. */}
        {shownError && !enrollment && (
          <p role="alert" className="text-sm text-negative">
            {shownError}
          </p>
        )}

        {(on || enrollment) && (
          <p className="text-xs text-muted-foreground">
            There are no backup codes. Add a second authenticator (a password manager works) so a
            lost phone doesn't lock you out. If you lose them all, ask the person who runs this app
            to remove them.
          </p>
        )}
      </div>
    </section>
  );
}
