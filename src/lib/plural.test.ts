import { describe, expect, it } from "vitest";
import { plural } from "./plural";

describe("plural", () => {
  it("counts transactions by default, singular only for exactly one", () => {
    expect([0, 1, 2].map((n) => plural(n))).toEqual([
      "0 transactions",
      "1 transaction",
      "2 transactions",
    ]);
  });

  it("takes another word", () => {
    expect([plural(1, "rule"), plural(3, "sell")]).toEqual(["1 rule", "3 sells"]);
  });
});
