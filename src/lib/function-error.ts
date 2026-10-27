// supabase.functions.invoke turns a non-2xx reply into an error whose `context` is the raw
// fetch Response. Our functions put a user-facing reason in its `{ error }` body -- surface it.
export async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  try {
    const context = (error as { context?: unknown } | null)?.context;
    if (!(context instanceof Response)) return fallback;
    const body: unknown = await context.clone().json();
    const message = (body as { error?: unknown } | null)?.error;
    return typeof message === "string" && message.trim() ? message : fallback;
  } catch {
    return fallback;
  }
}
