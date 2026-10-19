// Fund names arrive with share-class boilerplate ("UCITS ETF USD (Acc)") that the group
// header and the Price column already convey. Strip it so the useful part fits on a phone.
const DISTRIBUTION_SUFFIX = /\s*\((?:Acc|Dist)\)\s*$/i;
const CURRENCY_SUFFIX = /\s+(?:USD|EUR|GBP|CHF)\s*$/;
const UCITS_ETF_SUFFIX = /\s+UCITS\s+ETF\s*$/i;

export function shortHoldingName(name: string): string {
  const short = name
    .replace(DISTRIBUTION_SUFFIX, "")
    .replace(CURRENCY_SUFFIX, "")
    .replace(UCITS_ETF_SUFFIX, "")
    .trim();
  return short === "" ? name : short;
}
