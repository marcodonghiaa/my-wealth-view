import { bankOf } from "@/components/bank-badge";

// Countries offered in the Connect a bank form: the EEA and the UK, where Enable Banking
// connects banks under PSD2. A country without banks says so in the bank list.
const COUNTRY_CODES = [
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IS",
  "IE",
  "IT",
  "LV",
  "LI",
  "LT",
  "LU",
  "MT",
  "NL",
  "NO",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "GB",
];

// The countries named in the given language and sorted in its alphabetical order, so a translated
// UI needs no list of its own.
export function countriesFor(lang: string): Array<{ code: string; name: string }> {
  const names = new Intl.DisplayNames([lang], { type: "region" });
  return COUNTRY_CODES.map((code) => ({ code, name: names.of(code) ?? code })).sort((a, b) =>
    a.name.localeCompare(b.name, lang),
  );
}

// The UI is English for now.
export const COUNTRIES = countriesFor("en");

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
