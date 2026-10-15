export function maskIban(iban: string): string {
  return iban.length > 4 ? `•••• ${iban.slice(-4)}` : "••••";
}
