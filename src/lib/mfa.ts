import { supabase } from "@/integrations/supabase/client";

// Two-step sign-in with an authenticator app (Supabase Auth TOTP). The database enforces it:
// once a user has a verified factor, a session without the code (aal1) sees no data.

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

/**
 * Start adding an authenticator. Leftover unfinished ones (a closed tab mid-setup) are removed
 * first: they hold a name and count against the factor limit.
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
    friendlyName: name.trim() || `Authenticator ${new Date().toISOString().slice(0, 10)}`,
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
