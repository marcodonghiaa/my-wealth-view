// Exports of apps and banks whose layout is known, read exactly instead of guessed.
// To add one: an entry in PRESETS, a sample in fixtures/ with no personal data, and a test.
import type { StatementColumns } from "./statement";
import type { DecimalMark } from "./normalize";

export interface StatementPreset {
  name: string;
  /** Lower-cased header names that must all be there. Strict: two presets never match one file. */
  requires: Array<string>;
  date: string;
  /** Description columns, best first: the first non-empty one is used. */
  description: Array<string>;
  /** Signed amount, unless `direction` says the sign. */
  amount: string;
  /** A column whose value says out or in (withdrawal/deposit, D/C…); else the amount's sign. */
  direction?: string;
  /** A fee charged on top of the amount, as a positive number. */
  fee?: string;
  /** Currency code column; rows without one are in EUR. */
  currency?: string;
  /** Rows to leave out. A missing column skips nothing. */
  skip?: RowRule;
  /** Rows that move money between your own accounts: imported as Transfer, not spending. */
  transfer?: Array<RowRule>;
  decimal?: DecimalMark;
}

/** Matches a row by a column's lower-cased value: one of `when`, or anything but `unless`. */
export interface RowRule {
  column: string;
  when?: Array<string>;
  unless?: Array<string>;
}

export const PRESETS: Array<StatementPreset> = [
  {
    // Revolut app: Statements → Excel/CSV. Pending, reverted and declined rows never happened.
    name: "Revolut",
    requires: [
      "type",
      "product",
      "started date",
      "completed date",
      "description",
      "amount",
      "fee",
      "currency",
      "state",
    ],
    date: "completed date",
    description: ["description"],
    amount: "amount",
    fee: "fee",
    currency: "currency",
    skip: { column: "state", unless: ["completed"] },
    // Currency exchanges and moves to Savings or other pockets stay your money.
    transfer: [
      { column: "type", when: ["exchange"] },
      { column: "product", unless: ["current"] },
    ],
    decimal: ".",
  },
  {
    // Spiir: Export → CSV. Rows Spiir itself marked as duplicates are left out.
    name: "Spiir",
    requires: ["date", "description", "amount", "maincategoryname"],
    date: "date",
    description: ["description", "originaldescription"],
    amount: "amount",
    currency: "currency",
    skip: { column: "duplicate", when: ["true", "1", "yes", "ja"] },
  },
  {
    // Actual Budget: Account → Export. Payee is the merchant; notes when there is no payee.
    name: "Actual Budget",
    requires: ["account", "date", "payee", "notes", "category", "amount"],
    date: "date",
    description: ["payee", "notes"],
    amount: "amount",
  },
  {
    // Firefly III: Export data → transactions. Transfers between your own accounts and opening
    // balances are not spending or income, so they are left out.
    name: "Firefly III",
    requires: ["type", "amount", "description", "date", "source_name", "destination_name"],
    date: "date",
    description: ["description", "destination_name"],
    amount: "amount",
    direction: "type",
    currency: "currency_code",
    skip: { column: "type", unless: ["withdrawal", "deposit"] },
    decimal: ".",
  },
];

const lower = (headers: Array<string>) => headers.map((h) => h.trim().toLowerCase());

/** The preset this header line belongs to, or null. */
export function findPreset(
  headers: Array<string>,
  presets: Array<StatementPreset> = PRESETS,
): StatementPreset | null {
  const names = new Set(lower(headers));
  return presets.find((p) => p.requires.every((r) => names.has(r))) ?? null;
}

/** The preset's columns as indexes into this header line. */
export function presetColumns(preset: StatementPreset, headers: Array<string>) {
  const names = lower(headers);
  const at = (name: string | undefined) => {
    const i = name == null ? -1 : names.indexOf(name);
    return i === -1 ? null : i;
  };
  const [main, ...alt] = preset.description.map(at);
  const columns: StatementColumns = {
    date: at(preset.date),
    description: main ?? null,
    amount: at(preset.amount),
    direction: at(preset.direction),
    in: null,
    out: null,
  };
  const rule = (r: RowRule | undefined) => {
    const i = at(r?.column);
    return (row: Array<string>) => {
      if (!r || i == null) return false;
      const value = (row[i] ?? "").trim().toLowerCase();
      return r.when ? r.when.includes(value) : r.unless != null && !r.unless.includes(value);
    };
  };
  const transferRules = (preset.transfer ?? []).map(rule);
  return {
    columns,
    descriptionAlt: alt.filter((i): i is number => i != null),
    fee: at(preset.fee),
    currency: at(preset.currency),
    skip: rule(preset.skip),
    transfer: (row: Array<string>) => transferRules.some((matches) => matches(row)),
  };
}
