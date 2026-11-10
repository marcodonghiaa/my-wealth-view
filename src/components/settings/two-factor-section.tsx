import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CodeInput, Input } from "@/components/ui/field";
import {
  defaultAuthenticatorName,
  finishEnrollment,
  listAuthenticators,
  removeAuthenticator,
  startEnrollment,
  type Authenticator,
  type Enrollment,
} from "@/lib/mfa";

const message = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback;

/**
 * Two-step sign-in: add an authenticator app (scan a QR code, type its code), list and remove
 * them. With at least one, sign-in asks for a code and the database refuses sessions without it.
 */
export function TwoFactorSection() {
  const [list, setList] = useState<Array<Authenticator> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  // On a failed load the list stays unknown: showing "Off" could mislead a user who has one.
  const reload = useCallback(async () => {
    setLoadFailed(false);
    try {
      setList(await listAuthenticators());
    } catch (err) {
      setError(message(err, "Couldn't load your authenticators."));
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

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
    }, "Couldn't start the setup.");

  const finish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollment) return;
    void run(async () => {
      await finishEnrollment(enrollment.factorId, code);
      setEnrollment(null);
      setName("");
      await reload();
    }, "That code didn't work. Try the next one.");
  };

  // The unfinished factor stays until the next setup, which clears it first.
  const cancel = () => {
    setError(null);
    setEnrollment(null);
  };

  const remove = (id: string) =>
    run(async () => {
      await removeAuthenticator(id);
      setConfirmRemove(null);
      await reload();
    }, "Couldn't remove the authenticator.");

  const on = (list?.length ?? 0) > 0;

  return (
    <section id="two-step" aria-labelledby="two-step-heading" className="scroll-mt-6">
      <div className="max-w-sm space-y-4 rounded-lg bg-card p-5">
        <div>
          <h3 id="two-step-heading" className="text-[0.9375rem] font-medium text-foreground">
            Two-step sign-in
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {list === null
              ? loadFailed
                ? "Couldn't check right now."
                : "Checking…"
              : on
                ? "On. Sign-in asks for a code from your authenticator app."
                : "Off. Add an authenticator app (1Password, Google Authenticator, Aegis…) so a stolen password alone can't open your finances."}
          </p>
        </div>

        {on && (
          <ul className="space-y-2">
            {list!.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <ShieldCheck className="size-4 shrink-0 text-positive" />
                  <span className="truncate text-foreground">{a.name}</span>
                </span>
                {confirmRemove === a.id ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={pending}
                    onClick={() => void remove(a.id)}
                  >
                    Confirm remove
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${a.name}`}
                    onClick={() => setConfirmRemove(a.id)}
                  >
                    <Trash2 />
                  </Button>
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
            <p className="text-xs text-muted-foreground">
              Can't scan? Enter this key by hand:{" "}
              <code className="break-all font-mono text-foreground">{enrollment.secret}</code>
            </p>
            <div className="space-y-1.5">
              <label htmlFor="enroll-code" className="text-xs font-medium text-muted-foreground">
                Code from the app
              </label>
              <CodeInput id="enroll-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending} className="flex-1">
                {pending && <Loader2 className="animate-spin" />}
                Turn on
              </Button>
              <Button variant="quiet" disabled={pending} onClick={cancel}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          list !== null && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="enroll-name" className="text-xs font-medium text-muted-foreground">
                  Name {on ? "of the new one" : ""}
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
                variant={on ? "quiet" : "primary"}
                disabled={pending}
                onClick={() => void start()}
                className="w-full"
              >
                {pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                {on ? "Add another authenticator" : "Set up two-step sign-in"}
              </Button>
            </div>
          )
        )}

        {loadFailed && (
          <Button
            variant="quiet"
            onClick={() => {
              setError(null);
              void reload();
            }}
          >
            Try again
          </Button>
        )}

        {error && (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          There are no backup codes. Add a second authenticator (a password manager works) so a lost
          phone doesn't lock you out. If every one is gone, the owner of this instance can remove
          them from the Supabase SQL editor (see UPGRADING.md in the backend).
        </p>
      </div>
    </section>
  );
}
