import { isPaymentRow, type SplitwiseFile, type SplitwiseRow } from "./splitwise-parse";

// Checks that a parsed Splitwise export is internally consistent before anything is imported.
// Errors block the import; warnings are shown to the user, who decides.

export interface Issue {
  level: "error" | "warning";
  message: string;
}

const ROUNDING_CENTS = 1;

const error = (message: string): Issue => ({ level: "error", message });
const warning = (message: string): Issue => ({ level: "warning", message });
const money = (cents: number) => (cents / 100).toFixed(2);
const sum = (values: Array<number>) => values.reduce((a, b) => a + b, 0);

function checkRow(r: SplitwiseRow, members: Array<string>): Array<Issue> {
  const label = `Row ${r.row}`;
  const issues: Array<Issue> = [];

  const drift = Math.abs(sum(r.netCents));
  if (drift > ROUNDING_CENTS) issues.push(error(`${label}: the amounts do not add up to zero.`));
  else if (drift > 0) issues.push(warning(`${label}: off by one cent, probably rounding.`));

  r.netCents.forEach((net, i) => {
    if (Math.abs(net) > Math.abs(r.costCents)) {
      issues.push(error(`${label}: ${members[i]}'s amount is more than the cost.`));
    }
  });

  if (isPaymentRow(r)) {
    const moved = r.netCents.filter((n) => n !== 0);
    const [a = 0, b = 0] = moved;
    if (moved.length !== 2 || a !== -b || Math.abs(a) !== Math.abs(r.costCents)) {
      issues.push(error(`${label}: a Payment must move the full cost between exactly two people.`));
    }
  } else if (r.netCents.every((n) => n === 0)) {
    issues.push(
      warning(`${label}: every amount is zero, so it is unclear whether it involves you.`),
    );
  }

  if (r.costCents < 0)
    issues.push(warning(`${label}: the cost is negative (a refund?). Review it.`));
  return issues;
}

function checkTotals(file: SplitwiseFile): Array<Issue> {
  if (!file.total) {
    return [
      warning("There is no totals row, so the file cannot be checked against Splitwise's total."),
    ];
  }
  const expected = file.total.netCents;
  return file.members.flatMap((member, i) => {
    const actual = sum(file.rows.map((r) => r.netCents[i] ?? 0));
    return actual === (expected[i] ?? 0)
      ? []
      : [
          error(
            `${member}'s column adds up to ${money(actual)} but the totals row says ${money(expected[i] ?? 0)}.`,
          ),
        ];
  });
}

function checkCurrency(file: SplitwiseFile): Array<Issue> {
  const currencies = new Set(file.rows.map((r) => r.currency));
  if (file.total) currencies.add(file.total.currency);
  return currencies.size > 1
    ? [error("The file has more than one currency. Export each currency on its own.")]
    : [];
}

function listRows(rows: Array<number>): string {
  return rows.length < 2
    ? `${rows[0]}`
    : `${rows.slice(0, -1).join(", ")} and ${rows[rows.length - 1]}`;
}

function checkDuplicates(file: SplitwiseFile): Array<Issue> {
  const groups = new Map<string, Array<number>>();
  for (const r of file.rows) {
    const key = JSON.stringify([r.date, r.description, r.costCents, r.netCents]);
    groups.set(key, [...(groups.get(key) ?? []), r.row]);
  }
  return [...groups.values()]
    .filter((rows) => rows.length > 1)
    .map((rows) => warning(`Rows ${listRows(rows)} are identical. They may be real repeats.`));
}

function checkMembers(members: Array<string>): Array<Issue> {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const name of members) (seen.has(name) ? repeated : seen).add(name);
  return [...repeated].map((name) =>
    warning(`"${name}" appears as more than one column. Columns are told apart by position.`),
  );
}

/** Every problem found in a parsed Splitwise export, errors and warnings together. */
export function validateSplitwise(file: SplitwiseFile): Array<Issue> {
  return [
    ...file.rows.flatMap((r) => checkRow(r, file.members)),
    ...checkTotals(file),
    ...checkCurrency(file),
    ...checkDuplicates(file),
    ...checkMembers(file.members),
  ];
}

export const hasErrors = (issues: Array<Issue>): boolean => issues.some((i) => i.level === "error");
