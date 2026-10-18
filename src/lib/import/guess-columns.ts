export const ROLES = [
  "month",
  "total",
  "stocks",
  "bonds",
  "crypto",
  "cash",
  "category",
  "amount",
  "currency",
] as const;

export type Role = (typeof ROLES)[number];

// Header names people really use, English and Italian, lower-cased and without accents.
const SYNONYMS: Record<Role, Array<string>> = {
  month: ["month", "mese", "date", "data", "period", "periodo"],
  total: [
    "total",
    "totale",
    "net worth",
    "networth",
    "patrimonio",
    "patrimonio netto",
    "balance",
    "saldo",
  ],
  stocks: ["stocks", "stock", "azioni", "etf", "equity", "equities"],
  bonds: ["bonds", "bond", "obbligazioni"],
  crypto: ["crypto", "cripto", "criptovalute"],
  cash: ["cash", "liquidita", "liquidity", "contanti"],
  category: ["category", "categoria"],
  amount: ["amount", "importo", "spend", "spesa", "spese", "spending", "expenses"],
  currency: ["currency", "valuta", "curr"],
};

function normalize(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const matches = (header: string, synonym: string) =>
  header === synonym || header.startsWith(`${synonym} `);

/**
 * For each role, the index of the header that most likely holds it, or null. A column is given
 * to at most one role: the first role in ROLES order that matches it.
 */
export function guessColumns(headers: Array<string>): Record<Role, number | null> {
  const normalized = headers.map(normalize);
  const taken = new Set<number>();
  const result = Object.fromEntries(ROLES.map((role) => [role, null])) as Record<
    Role,
    number | null
  >;

  for (const role of ROLES) {
    const index = normalized.findIndex(
      (header, i) => !taken.has(i) && SYNONYMS[role].some((synonym) => matches(header, synonym)),
    );
    if (index !== -1) {
      result[role] = index;
      taken.add(index);
    }
  }
  return result;
}
