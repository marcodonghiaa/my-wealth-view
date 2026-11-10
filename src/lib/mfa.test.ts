import { beforeEach, describe, expect, it, vi } from "vitest";

const mfa = vi.hoisted(() => ({
  getAuthenticatorAssuranceLevel: vi.fn(),
  listFactors: vi.fn(),
  challengeAndVerify: vi.fn(),
  enroll: vi.fn(),
  unenroll: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { mfa } } }));

import {
  cleanCode,
  finishEnrollment,
  listAuthenticators,
  needsMfaCode,
  removeAuthenticator,
  startEnrollment,
  verifyMfaCode,
} from "./mfa";

const totp = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  factor_type: "totp",
  status: "verified",
  friendly_name: `Phone ${id}`,
  created_at: "2026-11-10T00:00:00Z",
  ...extra,
});

beforeEach(() => {
  for (const fn of Object.values(mfa)) fn.mockReset();
  mfa.challengeAndVerify.mockResolvedValue({ error: null });
  mfa.unenroll.mockResolvedValue({ error: null });
});

describe("cleanCode", () => {
  it("keeps 6 digits, ignoring spaces and dashes", () => {
    expect(cleanCode("123 456")).toBe("123456");
    expect(cleanCode("123-456")).toBe("123456");
  });
  it("rejects anything else", () => {
    expect(cleanCode("12345")).toBeNull();
    expect(cleanCode("12345a")).toBeNull();
    expect(cleanCode("")).toBeNull();
  });
});

describe("needsMfaCode", () => {
  it("is true only when the account has a factor and the session hasn't used it", async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    expect(await needsMfaCode()).toBe(true);
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null,
    });
    expect(await needsMfaCode()).toBe(false);
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
      error: null,
    });
    expect(await needsMfaCode()).toBe(false);
  });
  it("is false on an error or a client without MFA", async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: null, error: new Error("x") });
    expect(await needsMfaCode()).toBe(false);
    mfa.getAuthenticatorAssuranceLevel.mockImplementation(() => {
      throw new TypeError("not a function");
    });
    expect(await needsMfaCode()).toBe(false);
  });
});

describe("verifyMfaCode", () => {
  it("rejects a malformed code before any request", async () => {
    await expect(verifyMfaCode("12")).rejects.toThrow(/6-digit/);
    expect(mfa.listFactors).not.toHaveBeenCalled();
  });
  it("accepts a code from the second authenticator", async () => {
    mfa.listFactors.mockResolvedValue({ data: { totp: [totp("a"), totp("b")] }, error: null });
    mfa.challengeAndVerify
      .mockResolvedValueOnce({ error: new Error("Invalid TOTP code entered") })
      .mockResolvedValueOnce({ error: null });
    await verifyMfaCode("123 456");
    expect(mfa.challengeAndVerify).toHaveBeenLastCalledWith({ factorId: "b", code: "123456" });
  });
  it("reports a wrong code", async () => {
    mfa.listFactors.mockResolvedValue({ data: { totp: [totp("a")] }, error: null });
    mfa.challengeAndVerify.mockResolvedValue({ error: new Error("Invalid TOTP code entered") });
    await expect(verifyMfaCode("123456")).rejects.toThrow(/Invalid TOTP/);
  });
  it("says when there is no authenticator", async () => {
    mfa.listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
    await expect(verifyMfaCode("123456")).rejects.toThrow(/no authenticator/);
  });
});

describe("enrollment", () => {
  it("clears unfinished factors, then enrolls a named TOTP", async () => {
    mfa.listFactors.mockResolvedValue({
      data: { all: [totp("old", { status: "unverified" }), totp("keep")] },
      error: null,
    });
    mfa.enroll.mockResolvedValue({
      data: { id: "new", totp: { qr_code: "data:image/svg+xml;x", secret: "SECRET" } },
      error: null,
    });
    await expect(startEnrollment(" Phone ")).resolves.toEqual({
      factorId: "new",
      qrCode: "data:image/svg+xml;x",
      secret: "SECRET",
    });
    expect(mfa.unenroll).toHaveBeenCalledTimes(1);
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: "old" });
    expect(mfa.enroll).toHaveBeenCalledWith({
      factorType: "totp",
      friendlyName: "Phone",
      issuer: "Alopex",
    });
  });
  it("surfaces an enroll error", async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [] }, error: null });
    mfa.enroll.mockResolvedValue({ data: null, error: new Error("MFA enroll is disabled") });
    await expect(startEnrollment("")).rejects.toThrow(/disabled/);
  });
  it("finishes with the typed code", async () => {
    await finishEnrollment("f1", "654321");
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "f1", code: "654321" });
    await expect(finishEnrollment("f1", "nope")).rejects.toThrow(/6-digit/);
  });
  it("lists and removes authenticators", async () => {
    mfa.listFactors.mockResolvedValue({
      data: { totp: [totp("a", { friendly_name: "" })] },
      error: null,
    });
    expect(await listAuthenticators()).toEqual([
      { id: "a", name: "Authenticator app", createdAt: "2026-11-10T00:00:00Z" },
    ]);
    await removeAuthenticator("a");
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: "a" });
    mfa.unenroll.mockResolvedValue({ error: new Error("AAL2 required") });
    await expect(removeAuthenticator("a")).rejects.toThrow(/AAL2/);
  });
});
