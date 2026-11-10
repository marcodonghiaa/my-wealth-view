import { beforeEach, describe, expect, it, vi } from "vitest";

const mfa = vi.hoisted(() => ({
  getAuthenticatorAssuranceLevel: vi.fn(),
  listFactors: vi.fn(),
  challengeAndVerify: vi.fn(),
  enroll: vi.fn(),
  unenroll: vi.fn(),
}));
const refreshSession = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { mfa, refreshSession, signOut } },
}));

import {
  cleanCode,
  defaultAuthenticatorName,
  finishEnrollment,
  isMfaRequired,
  listAuthenticators,
  needsMfaCode,
  onMfaRequired,
  removeAuthenticator,
  retryUnlessRefused,
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
  // protects=a user who hit Supabase's MFA limit (15/min per IP) is told to wait, and no more
  // attempts are spent; fails_when=the raw 429 shows or the next authenticator is still tried
  it("stops at the rate limit and says to wait", async () => {
    mfa.listFactors.mockResolvedValue({ data: { totp: [totp("a"), totp("b")] }, error: null });
    mfa.challengeAndVerify.mockResolvedValue({
      error: Object.assign(new Error("Request rate limit reached"), { status: 429 }),
    });
    await expect(verifyMfaCode("123456")).rejects.toThrow(/Too many tries.*wait a minute/);
    expect(mfa.challengeAndVerify).toHaveBeenCalledTimes(1);
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
  // protects=an unnamed authenticator gets a name the account doesn't already use;
  // fails_when=the default counts factors, so removing one makes the next name collide
  // (Supabase refuses a duplicate name and setup fails)
  it("names an unnamed one with the first free number", async () => {
    mfa.listFactors.mockResolvedValue({
      data: {
        all: [totp("b", { status: "unverified", friendly_name: "Authenticator 1" })],
        totp: [totp("a", { friendly_name: "Authenticator 2" })],
      },
      error: null,
    });
    mfa.enroll.mockResolvedValue({
      data: { id: "n", totp: { qr_code: "q", secret: "s" } },
      error: null,
    });
    expect(defaultAuthenticatorName([])).toBe("Authenticator 1");
    expect(defaultAuthenticatorName(["Authenticator 1", "Authenticator 2"])).toBe(
      "Authenticator 3",
    );
    await startEnrollment("  ");
    expect(mfa.enroll).toHaveBeenCalledWith(
      expect.objectContaining({ friendlyName: "Authenticator 1" }),
    );
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

const dbRefusal = {
  code: "42501",
  hint: "mfa_required",
  message: "Enter your authenticator code first",
};
const fnRefusal = (body: unknown, status = 403) =>
  Object.assign(new Error("Edge Function returned a non-2xx status code"), {
    context: new Response(JSON.stringify(body), { status }),
  });

// protects=a refused session is recognised from the database and from Edge Functions;
// fails_when=an unrelated permission error or a 503 is taken for a missing code
describe("isMfaRequired", () => {
  it("recognises the database's and the functions' refusal", async () => {
    expect(await isMfaRequired(dbRefusal)).toBe(true);
    expect(await isMfaRequired(fnRefusal({ error: "x", code: "mfa_required" }))).toBe(true);
  });

  it("ignores other errors", async () => {
    expect(await isMfaRequired({ code: "42501", hint: null, message: "permission denied" })).toBe(
      false,
    );
    expect(await isMfaRequired(fnRefusal({ error: "Server update incomplete" }, 503))).toBe(false);
    expect(await isMfaRequired(new Error("boom"))).toBe(false);
    expect(await isMfaRequired(null)).toBe(false);
  });
});

// protects=a session the database refuses lands on the code step instead of error screens;
// fails_when=the stale factor list is not refreshed, or every failing query navigates again
describe("onMfaRequired", () => {
  beforeEach(() => {
    refreshSession.mockReset().mockResolvedValue({ error: null });
    signOut.mockReset().mockResolvedValue({ error: null });
  });

  it("refreshes the session, then goes to sign-in, once for a burst of refusals", async () => {
    let finish: () => void = () => {};
    const go = vi.fn(() => new Promise<void>((r) => (finish = r)));
    const onError = onMfaRequired(go);
    const first = onError(dbRefusal);
    await vi.waitFor(() => expect(go).toHaveBeenCalledTimes(1));
    await onError(dbRefusal);
    finish();
    await first;
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(refreshSession.mock.invocationCallOrder[0]).toBeLessThan(
      go.mock.invocationCallOrder[0]!,
    );
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("keeps the session when the refresh works", async () => {
    const go = vi.fn(async () => {});
    await onMfaRequired(go)(dbRefusal);
    expect(signOut).not.toHaveBeenCalled();
    expect(go).toHaveBeenCalledTimes(1);
  });

  // protects=no bounce between sign-in and the dashboard;
  // fails_when=a session that can't refresh stays signed in with its stale factor list
  it("signs this tab out when the session can't refresh, then goes to sign-in", async () => {
    refreshSession.mockResolvedValue({ error: new Error("Invalid Refresh Token") });
    const go = vi.fn(async () => {});
    await onMfaRequired(go)(dbRefusal);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("does nothing for other errors", async () => {
    const go = vi.fn(async () => {});
    await onMfaRequired(go)(new Error("boom"));
    expect(go).not.toHaveBeenCalled();
    expect(refreshSession).not.toHaveBeenCalled();
  });
});

// protects=a session refused for a missing code reaches the code step at once;
// fails_when=the refusal is retried 3 times with backoff (about 7s of spinner) first
describe("retryUnlessRefused", () => {
  it("never retries a refusal, retries other errors up to 3 times", () => {
    expect(retryUnlessRefused(0, dbRefusal)).toBe(false);
    expect(retryUnlessRefused(0, fnRefusal({ code: "mfa_required" }))).toBe(false);
    expect(retryUnlessRefused(0, new Error("Failed to fetch"))).toBe(true);
    expect(retryUnlessRefused(2, new Error("Failed to fetch"))).toBe(true);
    expect(retryUnlessRefused(3, new Error("Failed to fetch"))).toBe(false);
  });
});
