// The owner's browser tells the backend which address the dashboard is served from, so bank linking
// can send them back here and the Edge Functions accept this site in CORS. The backend reads the
// browser's own Origin header (nothing is sent from here) and only accepts the owner. Best effort: an
// older backend without the function, or a refusal, must never get in the way of the app.
export async function registerDashboardOrigin(register: () => PromiseLike<unknown>): Promise<void> {
  try {
    await register();
  } catch {
    // ignored on purpose, see above
  }
}
