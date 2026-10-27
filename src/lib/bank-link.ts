import { bankOf } from "@/components/bank-badge";

// Countries offered in the Connect a bank form, in display order.
export const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "IT", name: "Italy" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "GB", name: "UK" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "AT", name: "Austria" },
  { code: "PT", name: "Portugal" },
  { code: "IE", name: "Ireland" },
];

// Toast text after the bank-consent-callback redirect: "Revolut: EUR, GBP, USD" when the
// callback names the bank and currencies, else the account count (older callback).
export function linkedMessage(params: URLSearchParams): string | null {
  const linked = params.get("bank_linked");
  if (!linked) return null;
  const bank = params.get("bank");
  const currencies = params.get("currencies"); // unique and sorted by the callback
  if (bank && currencies) return `${bank}: ${currencies.split(",").join(", ")}`;
  return `${linked} account${linked === "1" ? "" : "s"} connected`;
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
