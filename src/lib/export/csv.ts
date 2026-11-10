import Papa from "papaparse";
import type { ExportData, ExportRow } from "./tables";

const BOM = "﻿"; // so Excel reads the file as UTF-8

const cell = (v: unknown): string | number | boolean =>
  v === null || v === undefined
    ? ""
    : typeof v === "object"
      ? JSON.stringify(v)
      : (v as string | number | boolean);

/**
 * One CSV. Text starting with = + - @ (or a tab/return) gets a leading quote so a spreadsheet
 * never runs it as a formula; real numbers stay numbers, so -12.5 is untouched.
 */
export function toCsv(columns: ReadonlyArray<string>, rows: ReadonlyArray<ExportRow>): string {
  const data = rows.map((r) => columns.map((c) => cell(r[c])));
  return BOM + Papa.unparse({ fields: [...columns], data }, { escapeFormulae: true });
}

const columnsOf = (rows: ReadonlyArray<ExportRow>, skip: ReadonlyArray<string>) =>
  [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => !skip.includes(c));

const HOLDING_COLUMNS = [
  "kind",
  "name",
  "identifier",
  "type",
  "source",
  "amount",
  "currency",
  "annual_rate",
  "start_date",
  "maturity_date",
] as const;

// amount is shares for portfolio, coins for crypto, principal for a deposit.
function holdingRows(d: ExportData): Array<ExportRow> {
  return [
    ...d.portfolio_holdings.map((h) => ({
      kind: "portfolio",
      name: h["name"],
      identifier: h["isin"],
      type: h["asset_type"],
      source: h["broker_label"],
      amount: h["shares"],
    })),
    ...d.crypto_holdings.map((h) => ({
      kind: "crypto",
      name: h["name"],
      identifier: h["asset_symbol"],
      source: h["source"],
      amount: h["amount"],
    })),
    ...d.cd_holdings.map((h) => ({
      kind: "cd",
      name: h["label"],
      source: h["bank_label"],
      amount: h["principal"],
      currency: h["currency"],
      annual_rate: h["annual_rate"],
      start_date: h["start_date"],
      maturity_date: h["maturity_date"],
    })),
  ];
}

const NET_WORTH_COLUMNS = [
  "source",
  "snapshot_date",
  "total_eur",
  "stocks_eur",
  "bonds_eur",
  "crypto_eur",
  "cash_eur",
  "other_eur",
  "liabilities_eur",
  "account_uid",
  "currency",
  "amount",
  "eur_equivalent",
] as const;

// Three sources side by side, told apart by `source`; nothing is added up.
function netWorthRows(d: ExportData): Array<ExportRow> {
  return [
    ...d.net_worth_history.map((r) => ({ ...r, source: "history" })),
    ...d.net_worth_reconstructed.map((r) => ({ ...r, source: "reconstructed" })),
    ...d.net_worth_snapshots.map((r) => ({ ...r, source: "account_snapshot" })),
  ];
}

/** The four spreadsheet files, by file name. */
export function buildCsvFiles(d: ExportData): Record<string, string> {
  const skip = ["user_id", "raw"];
  return {
    "transactions.csv": toCsv(columnsOf(d.transactions, skip), d.transactions),
    "accounts.csv": toCsv(columnsOf(d.accounts, skip), d.accounts),
    "holdings.csv": toCsv(HOLDING_COLUMNS, holdingRows(d)),
    "net_worth.csv": toCsv(NET_WORTH_COLUMNS, netWorthRows(d)),
  };
}
