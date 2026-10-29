import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH, passwordErrorMessage, validateNewPassword } from "./password";

describe("validateNewPassword", () => {
  it("rejects a password shorter than the minimum", () => {
    expect(validateNewPassword("a".repeat(MIN_PASSWORD_LENGTH - 1))).toMatch(/at least 8/i);
  });
  it("accepts exactly the minimum", () => {
    expect(validateNewPassword("a".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });
  it("rejects a confirmation that differs", () => {
    expect(validateNewPassword("longenough1", "longenough2")).toMatch(/don't match/);
  });
  it("accepts a matching confirmation", () => {
    expect(validateNewPassword("longenough1", "longenough1")).toBeNull();
  });
});

describe("passwordErrorMessage", () => {
  it.each([
    ["invalid_credentials", /current password is wrong/],
    ["same_password", /different/],
    ["weak_password", /too easy/],
    ["reauthentication_needed", /sign in again/],
  ])("maps %s", (code, text) => {
    expect(passwordErrorMessage(Object.assign(new Error("raw"), { code }))).toMatch(text);
  });
  it("falls back to the error's own message, then a generic one", () => {
    expect(passwordErrorMessage(new Error("Network down"))).toBe("Network down");
    expect(passwordErrorMessage("nope")).toBe("Couldn't change the password");
  });
});
