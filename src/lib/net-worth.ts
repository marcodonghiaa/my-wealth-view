// Snapshots before this day hold only a fraction of today's net worth (investments were
// added on 4 Sept 2026), so "change since the start" measured from them reads as +3000%.
export const TRACKING_START = "2026-09-04";

export function periodBaseline<T extends { snapshot_date: string }>(
  snapshots: Array<T>,
): T | undefined {
  return snapshots.find((s) => s.snapshot_date >= TRACKING_START);
}
