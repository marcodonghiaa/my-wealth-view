export interface WelcomeFacts {
  accounts: number;
  snapshots: number;
  history: number;
  dismissed: boolean;
}

/** The first-run welcome is only for an empty instance that has not dismissed it. */
export function shouldShowWelcome({
  accounts,
  snapshots,
  history,
  dismissed,
}: WelcomeFacts): boolean {
  return !dismissed && accounts === 0 && snapshots === 0 && history === 0;
}
