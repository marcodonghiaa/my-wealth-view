// Format a Date's LOCAL calendar day as YYYY-MM-DD. `date.toISOString()`
// converts to UTC first, which shifts the date across midnight in any
// positive UTC-offset zone (e.g. Europe/Dublin in summer) -- the wrong
// value for "which day/month did the user mean".
export function formatISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
