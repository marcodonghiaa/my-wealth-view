import type { Trade } from "@/lib/trades";

export interface CsvResult {
  trades: Array<Trade>;
  errors: Array<string>;
  /** Left out on purpose, but you should know. */
  notes: Array<string>;
  /** The file is your broker's full record, so it can correct how many shares you hold. */
  setsShares?: boolean;
  /** No parser recognised the file: the screen offers to ask for your broker. */
  unknownFormat?: boolean;
}

export interface ParseContext {
  kind: "stock" | "crypto";
  knownKeys: Set<string>;
  today: string;
}

/**
 * One broker's export. To add a broker: one file in this folder, a sample export in
 * `fixtures/` with no personal data, a test, and an entry in BROKERS (index.ts).
 */
export interface BrokerParser {
  /** Stored on each trade as `source`, so never rename it. */
  id: string;
  name: string;
  country: string;
  /** Which page imports it: stock trades on Portfolio, coins on Crypto. */
  kind: "stock" | "crypto";
  /** Where to find the file in the broker's app, shown before you upload. */
  howToExport: string;
  /** Last day a real export was imported without problems, or null if only the sample was tested. */
  verifiedAt: string | null;
  /** Lowercased header cells. Must be strict: two parsers may never accept the same file. */
  detect: (header: Array<string>) => boolean;
  parse: (
    lines: Array<string>,
    separator: string,
    header: Array<string>,
    ctx: ParseContext,
  ) => CsvResult;
}
