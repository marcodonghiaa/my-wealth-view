import { bankOf } from "@/components/bank-badge";

// Countries offered in the Connect a bank form: the EEA and the UK, where Enable Banking
// connects banks under PSD2. Alphabetical; a country without banks just shows an empty list.
export const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "BG", name: "Bulgaria" },
  { code: "HR", name: "Croatia" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czechia" },
  { code: "DK", name: "Denmark" },
  { code: "EE", name: "Estonia" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "GR", name: "Greece" },
  { code: "HU", name: "Hungary" },
  { code: "IS", name: "Iceland" },
  { code: "IE", name: "Ireland" },
  { code: "IT", name: "Italy" },
  { code: "LV", name: "Latvia" },
  { code: "LI", name: "Liechtenstein" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "MT", name: "Malta" },
  { code: "NL", name: "Netherlands" },
  { code: "NO", name: "Norway" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "ES", name: "Spain" },
  { code: "SE", name: "Sweden" },
  { code: "GB", name: "UK" },
];

// The form's first country: the region of the browser's language (de-AT -> AT, a bare "it" ->
// IT, "sv" -> SE) when it is in the list, else the first one listed.
export function defaultCountry(languages: readonly string[]): string {
  for (const lang of languages) {
    let region: string | undefined;
    try {
      region = new Intl.Locale(lang).maximize().region;
    } catch {
      continue; // not a valid language tag
    }
    if (region && COUNTRIES.some((c) => c.code === region)) return region;
  }
  return COUNTRIES[0]!.code;
}

// Toast text after the bank-consent-callback redirect or the complete-bank-consent reply:
// "Revolut: EUR, GBP, USD" when it names the bank and currencies, else the account count.
export function linkedMessage(params: URLSearchParams): string | null {
  const linked = params.get("bank_linked");
  if (!linked) return null;
  const bank = params.get("bank");
  const currencies = params.get("currencies"); // unique and sorted by the callback
  if (bank && currencies) return `${bank}: ${currencies.split(",").join(", ")}`;
  return `${linked} account${linked === "1" ? "" : "s"} connected`;
}

// The bank's redirect hands the dashboard the one-time code (#bank_code=&bank_state=, in the
// fragment so it never reaches the dashboard host's logs; older backends used the query); the
// signed-in dashboard finishes the link with complete-bank-consent. Null when not both are there.
export function pendingLink(params: URLSearchParams): { code: string; state: string } | null {
  const code = params.get("bank_code");
  const state = params.get("bank_state");
  return code && state ? { code, state } : null;
}

// Every message bank-consent-callback (?bank_link_error) or complete-bank-consent can send. The
// URL can be crafted, so anything else shows a fixed message instead of the link's own text.
const LINK_ERRORS = new Set([
  "Couldn't link the bank, please try again",
  "The bank did not approve the connection",
  "Missing code or state",
  "Invalid or expired consent request",
  "Consent request expired, please try again",
  "Not signed in",
  "Enable Banking didn't share any accounts. Link this bank once on enablebanking.com → API applications → your app → Link accounts, then try again.",
]);

export function linkErrorMessage(params: URLSearchParams): string | null {
  const error = params.get("bank_link_error");
  if (error == null) return null;
  return LINK_ERRORS.has(error) ? error : "Couldn't link the bank, please try again";
}

// The bank and country to prefill when renewing `bank`, from the first of its rows that stored
// both at link time. Null for rows linked before they were stored: the form opens unprefilled.
export function renewTarget(
  bank: string,
  accounts: Array<{
    bank_name?: string | null;
    bank_country?: string | null;
    label: string | null;
  }>,
): { bankName: string; country: string } | null {
  const a = accounts.find(
    (a) => bankOf(a) === bank && a.bank_name && COUNTRIES.some((c) => c.code === a.bank_country),
  );
  return a?.bank_name && a.bank_country ? { bankName: a.bank_name, country: a.bank_country } : null;
}
