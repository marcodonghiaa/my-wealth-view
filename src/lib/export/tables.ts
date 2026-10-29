/** Every table of the user's own data that goes into data.json, with a stable order for paging. */
export const EXPORT_TABLES = [
  { name: "accounts", order: ["uid"] },
  { name: "transactions", order: ["account_uid", "entry_reference"] },
  { name: "category_rules", order: ["id"] },
  { name: "cd_holdings", order: ["id"] },
  { name: "crypto_holdings", order: ["source", "asset_symbol"] },
  { name: "portfolio_holdings", order: ["broker_label", "isin"] },
  { name: "crypto_snapshots", order: ["snapshot_date", "source", "asset_symbol"] },
  { name: "portfolio_snapshots", order: ["snapshot_date", "isin"] },
  { name: "net_worth_snapshots", order: ["id"] },
  { name: "net_worth_history", order: ["snapshot_date"] },
  { name: "net_worth_reconstructed", order: ["snapshot_date", "source"] },
  { name: "spend_history", order: ["month", "category"] },
  { name: "splitwise_balances", order: ["group_name", "person"] },
  { name: "splitwise_expenses", order: ["id"] },
  { name: "subscription_billing_overrides", order: ["creditor_name"] },
] as const;

export type ExportTableName = (typeof EXPORT_TABLES)[number]["name"];
export type ExportRow = Record<string, unknown>;
export type ExportData = Record<ExportTableName, Array<ExportRow>>;
