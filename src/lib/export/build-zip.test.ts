// @vitest-environment node
// (jsdom swaps in a different Uint8Array class, which fflate then mistakes for a folder)
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildZip, exportFileName } from "./build-zip";
import { EXPORT_TABLES, type ExportData } from "./tables";

const empty = () =>
  Object.fromEntries(EXPORT_TABLES.map((t) => [t.name, []])) as unknown as ExportData;

function sample(): ExportData {
  const d = empty();
  d.accounts = [{ uid: "a1", iban: "NL00", user_id: "u" }];
  d.transactions = [
    {
      account_uid: "a1",
      entry_reference: "e1",
      amount: -5,
      creditor_name: "=EVIL()",
      raw: { k: 1 },
      user_id: "u",
    },
  ];
  d.portfolio_holdings = [{ name: "ACME", isin: "X1", shares: 2, broker_label: "b" }];
  d.crypto_holdings = [{ name: "Bitcoin", asset_symbol: "BTC", amount: 0.5, source: "s" }];
  d.cd_holdings = [{ label: "CD", principal: 1000, currency: "EUR", annual_rate: 3 }];
  d.net_worth_history = [{ snapshot_date: "2026-01-01", total_eur: 10 }];
  d.net_worth_reconstructed = [{ snapshot_date: "2026-02-01", stocks_eur: 4 }];
  d.net_worth_snapshots = [{ snapshot_date: "2026-03-01", account_uid: "a1", amount: 7 }];
  return d;
}

// protects=the one download holds every promised file with complete data;
// fails_when=a file goes missing, a holding kind drops out, or data.json loses a table
describe("buildZip", () => {
  const files = unzipSync(buildZip(sample(), new Date("2026-10-30T10:00:00Z")));
  const text = (n: string) => strFromU8(files[n]!);

  it("contains exactly the five files", () => {
    expect(Object.keys(files).sort()).toEqual(
      ["accounts.csv", "data.json", "holdings.csv", "net_worth.csv", "transactions.csv"].sort(),
    );
  });

  it("keeps raw payloads in data.json only and drops user_id from the CSVs", () => {
    expect(text("transactions.csv")).not.toContain("raw");
    expect(text("transactions.csv")).not.toContain("user_id");
    expect(JSON.parse(text("data.json")).tables.transactions[0].raw).toEqual({ k: 1 });
  });

  it("data.json has every table", () => {
    const json = JSON.parse(text("data.json"));
    expect(Object.keys(json.tables).sort()).toEqual(EXPORT_TABLES.map((t) => t.name).sort());
    expect(json.exported_at).toBe("2026-10-30T10:00:00.000Z");
  });

  it("makes one holdings row per holding of every kind", () => {
    const lines = text("holdings.csv").trim().split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines.map((l) => l.split(",")[0]).slice(1)).toEqual(["portfolio", "crypto", "cd"]);
  });

  it("lists the three net worth sources side by side", () => {
    const lines = text("net_worth.csv").trim().split("\r\n");
    expect(lines.slice(1).map((l) => l.split(",")[0])).toEqual([
      "history",
      "reconstructed",
      "account_snapshot",
    ]);
  });

  it("neutralises a formula in a merchant name", () => {
    expect(text("transactions.csv")).toContain("'=EVIL()");
  });

  it("names the file with the day", () => {
    expect(exportFileName("2026-10-30")).toBe("myfinances-export-2026-10-30.zip");
  });
});
