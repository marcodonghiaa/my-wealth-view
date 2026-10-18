// Optional YYYY-MM-DD from which "change since the start" is measured. Set it when your first
// snapshots only held part of your net worth (e.g. before investments were added), which would
// otherwise read as a huge percentage. Unset: measure from the very first snapshot.
export const NET_WORTH_START: string | undefined = import.meta.env["VITE_NET_WORTH_START"];

export function periodBaseline<T extends { snapshot_date: string }>(
  snapshots: Array<T>,
  start: string | undefined = NET_WORTH_START,
): T | undefined {
  return start ? snapshots.find((s) => s.snapshot_date >= start) : snapshots.at(0);
}
