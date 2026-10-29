export const MIN_PASSWORD_LENGTH = 8;

/** The one rule for a new password, shared by reset and change. Null when valid. */
export function validateNewPassword(password: string, confirmation?: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (confirmation !== undefined && password !== confirmation) {
    return "The two new passwords don't match.";
  }
  return null;
}

const BY_CODE: Record<string, string> = {
  invalid_credentials: "Your current password is wrong.",
  same_password: "Choose a password different from your current one.",
  weak_password: "That password is too easy to guess. Try a longer or less common one.",
  reauthentication_needed: "For safety, sign out and sign in again, then retry.",
};

/** User-facing text for a Supabase auth failure, by error code first, then its own message. */
export function passwordErrorMessage(err: unknown): string {
  const code =
    err && typeof err === "object" && "code" in err && typeof err.code === "string"
      ? err.code
      : null;
  if (code && BY_CODE[code]) return BY_CODE[code];
  return err instanceof Error ? err.message : "Couldn't change the password";
}
