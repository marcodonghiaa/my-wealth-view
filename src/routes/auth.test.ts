import { describe, it, expect } from "vitest";
import { backHereSearch, safeNext } from "./auth";

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

// protects=after sign-in (or the authenticator code) the user is back on the page they were on;
// fails_when=the search or a bank's #bank_code is dropped, or "/" adds a useless ?next=
describe("backHereSearch", () => {
  it("keeps path, search and hash", () => {
    expect(
      backHereSearch({ pathname: "/accounts", searchStr: "?a=1", hash: "bank_code=x" }),
    ).toEqual({
      next: "/accounts?a=1#bank_code=x",
    });
  });
  it("adds nothing for the home page", () => {
    expect(backHereSearch({ pathname: "/", searchStr: "", hash: "" })).toEqual({});
  });
});
