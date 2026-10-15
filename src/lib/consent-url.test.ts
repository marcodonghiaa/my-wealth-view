import { describe, it, expect } from "vitest";
import { assertHttpsUrl } from "./consent-url";

describe("assertHttpsUrl", () => {
  it("returns an https URL unchanged", () => {
    expect(assertHttpsUrl("https://bank.example.com/auth?x=1")).toBe(
      "https://bank.example.com/auth?x=1",
    );
  });

  it("rejects a javascript: URL", () => {
    expect(() => assertHttpsUrl("javascript:alert(1)")).toThrow(/https/);
  });

  it("rejects plain http", () => {
    expect(() => assertHttpsUrl("http://bank.example.com")).toThrow();
  });

  it("rejects a relative path and garbage", () => {
    expect(() => assertHttpsUrl("/accounts")).toThrow();
    expect(() => assertHttpsUrl("not a url")).toThrow();
  });
});
