import { describe, expect, it } from "vitest";
import { RULE_COLUMNS } from "./rules-query";

// Polish 3 #12: the demo and the page mocks ignore select columns, so only this sees one dropped.
describe("RULE_COLUMNS", () => {
  it("reads every action, the income kind included", () => {
    expect(RULE_COLUMNS.split(", ")).toEqual(
      expect.arrayContaining([
        "set_category",
        "set_transaction_type",
        "set_flow_type",
        "set_income_kind",
      ]),
    );
  });
});
