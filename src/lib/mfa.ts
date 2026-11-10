import { supabase } from "@/integrations/supabase/client";

// Two-step sign-in with an authenticator app (Supabase Auth TOTP). The database enforces it:
// once a user has a verified factor, a session without the code (aal1) gets 403 on every call.

/** The 6 digits of an authenticator code, or null. Spaces and dashes are ignored ("123 456"). */
export function cleanCode(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

/** True when the user has an authenticator but this session hasn't entered its code yet. */
export async function needsMfaCode(): Promise<boolean> {
  // A client without MFA (the demo) or a broken stored session: no code to ask for here. The
  // database still refuses an aal1 session of a user with an authenticator.
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return false;
    return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
  } catch {
    return false;
  }
}

/** Raise this session to aal2 with a code from any of the user's authenticators. */
export async function verifyMfaCode(input: string): Promise<void> {
  const code = cleanCode(input);
  if (!code) throw new Error("Enter the 6-digit code from your authenticator app.");
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  const factors = data?.totp ?? [];
  if (factors.length === 0) throw new Error("This account has no authenticator.");
  let last: unknown = null;
  // A user with two authenticators can type either one's code: try each.
  for (const factor of factors) {
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code,
    });
    if (!verifyError) return;
    // Supabase allows about 15 code checks a minute per IP: stop instead of spending more.
    if ((verifyError as { status?: unknown }).status === 429) {
      throw new Error("Too many tries. Please wait a minute, then type the newest code.");
    }
    last = verifyError;
  }
  throw last instanceof Error ? last : new Error("That code didn't work. Try the next one.");
}

export interface Authenticator {
  id: string;
  name: string;
  createdAt: string;
}

export async function listAuthenticators(): Promise<Array<Authenticator>> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return (data?.totp ?? []).map((f) => ({
    id: f.id,
    name: f.friendly_name || "Authenticator app",
    createdAt: f.created_at,
  }));
}

export interface Enrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

/** The name an authenticator gets when none is typed: the first "Authenticator N" not taken. */
export function defaultAuthenticatorName(taken: Array<string>): string {
  for (let n = 1; ; n++) if (!taken.includes(`Authenticator ${n}`)) return `Authenticator ${n}`;
}

/**
 * Start adding an authenticator. Leftover unfinished ones (a closed tab or Cancel mid-setup) are
 * removed first, best effort: they hold a name and count against the factor limit.
 */
export async function startEnrollment(name: string): Promise<Enrollment> {
  const { data: list } = await supabase.auth.mfa.listFactors();
  for (const f of list?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName:
      name.trim() || defaultAuthenticatorName((list?.totp ?? []).map((f) => f.friendly_name ?? "")),
    issuer: "Alopex",
  });
  if (error) throw error;
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function finishEnrollment(factorId: string, input: string): Promise<void> {
  const code = cleanCode(input);
  if (!code) throw new Error("Enter the 6-digit code from your authenticator app.");
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw error;
}

export async function removeAuthenticator(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}

/** True when the database or an Edge Function refused because this session skipped the code. */
export async function isMfaRequired(error: unknown): Promise<boolean> {
  const e = error as { code?: unknown; hint?: unknown; context?: unknown } | null;
  if (e?.code === "42501" && e.hint === "mfa_required") return true;
  if (!(e?.context instanceof Response)) return false;
  try {
    const body: unknown = await e.context.clone().json();
    return (body as { code?: unknown } | null)?.code === "mfa_required";
  } catch {
    return false;
  }
}

/**
 * React Query's retry rule: a refused session (database 42501, or a 401/403 from an Edge Function)
 * won't change by asking again, so it goes straight to the error handler below.
 */
export function retryUnlessRefused(failureCount: number, error: unknown): boolean {
  const e = error as { code?: unknown; context?: unknown } | null;
  const status = e?.context instanceof Response ? e.context.status : 0;
  if (e?.code === "42501" || status === 401 || status === 403) return false;
  return failureCount < 3;
}

/**
 * A query/mutation error handler: when the server refuses a session for a missing code (signed
 * in elsewhere before the authenticator was added, so this tab's stored factor list is stale),
 * refresh the session so it knows about the authenticator, then open the sign-in page's code step.
 * A session that can't refresh is signed out here, so sign-in asks for the password instead of
 * sending a stale session back to the dashboard (and here again).
 */
export function onMfaRequired(goToSignIn: () => Promise<unknown>) {
  let busy = false;
  return async (error: unknown): Promise<void> => {
    if (busy || !(await isMfaRequired(error))) return;
    busy = true;
    try {
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) await supabase.auth.signOut({ scope: "local" });
      await goToSignIn();
    } finally {
      busy = false;
    }
  };
}
