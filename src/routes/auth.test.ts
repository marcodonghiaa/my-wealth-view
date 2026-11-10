import { describe, it, expect } from "vitest";
import { safeNext } from "./auth";

describe("safeNext", () => {
  it("accepts a same-origin relative path", () => {
    expect(safeNext("/accounts")).toBe("/accounts");
  });

  it("keeps the search of a bank redirect", () => {
    expect(safeNext("/accounts?bank_code=x&bank_state=y")).toBe(
      "/accounts?bank_code=x&bank_state=y",
    );
  });

  it("rejects a protocol-relative URL", () => {
    expect(safeNext("//evil.com")).toBeUndefined();
  });

  it("rejects the backslash bypass that URL() normalizes to protocol-relative", () => {
    expect(safeNext("/\\evil.com")).toBeUndefined();
  });

  it("rejects a non-string value", () => {
    expect(safeNext(42)).toBeUndefined();
    expect(safeNext(null)).toBeUndefined();
  });

  it("rejects a value that doesn't start with a slash", () => {
    expect(safeNext("evil.com")).toBeUndefined();
    expect(safeNext("https://evil.com")).toBeUndefined();
  });
});
