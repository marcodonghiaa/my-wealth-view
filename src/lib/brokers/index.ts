import { tradeRepublic } from "./trade-republic";
import type { BrokerParser } from "./types";

export type { BrokerParser, CsvResult, ParseContext } from "./types";

/** Every broker export Alopex reads. docs/BROKERS.md is checked against this list. */
export const BROKERS: Array<BrokerParser> = [tradeRepublic];

/** Where someone whose broker isn't listed asks for it. */
export const NEW_BROKER_URL =
  "https://github.com/marcodonghiaa/alopex/issues/new?template=new-broker.yml";

/** The markdown table in docs/BROKERS.md, so the public list can't drift from the code. */
export function brokerTable(brokers: Array<BrokerParser> = BROKERS): string {
  const rows = brokers.map(
    (b) => `| ${b.name} | ${b.country} | CSV | ${b.verifiedAt ?? "not yet, sample only"} |`,
  );
  return [
    "| Broker | Accounts in | File | Last checked with a real export |",
    "|---|---|---|---|",
    ...rows,
  ].join("\n");
}
