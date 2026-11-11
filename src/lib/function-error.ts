// supabase.functions.invoke turns a non-2xx reply into an error whose `context` is the raw
// fetch Response. Our functions put a JSON body in it: `{ error }` for the user, `{ code }` for us.

/** The JSON body of a failed Edge Function call, or null when there is none to read. */
export async function functionErrorBody(error: unknown): Promise<unknown> {
  try {
    const context = (error as { context?: unknown } | null)?.context;
    if (!(context instanceof Response)) return null;
    return await context.clone().json();
  } catch {
    return null;
  }
}

/** The function's user-facing reason from its `{ error }` body, or the fallback. */
export async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const message = ((await functionErrorBody(error)) as { error?: unknown } | null)?.error;
  return typeof message === "string" && message.trim() ? message : fallback;
}
