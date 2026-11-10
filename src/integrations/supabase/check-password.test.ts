import { beforeEach, describe, expect, it, vi } from "vitest";

const probe = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  created: [] as Array<{ auth: Record<string, unknown> }>,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, opts: { auth: Record<string, unknown> }) => {
    probe.created.push(opts);
    return {
      auth: {
        signInWithPassword: probe.signInWithPassword,
        signOut: probe.signOut,
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    };
  },
}));

import { checkPassword } from "./client";

// protects=checking the current password leaves this tab's (two-step) session alone;
// fails_when=the check signs in on the main client or keeps the throwaway session alive
describe("checkPassword", () => {
  beforeEach(() => {
    probe.signInWithPassword.mockReset();
    probe.signOut.mockReset().mockResolvedValue({ error: null });
  });

  it("signs in on a client that never stores a session, then signs that session out", async () => {
    probe.signInWithPassword.mockResolvedValue({ error: null });
    expect(await checkPassword("me@example.com", "pw")).toEqual({ error: null });
    expect(probe.signInWithPassword).toHaveBeenCalledWith({
      email: "me@example.com",
      password: "pw",
    });
    expect(probe.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(probe.created.at(-1)?.auth).toMatchObject({
      persistSession: false,
      autoRefreshToken: false,
    });
  });

  it("returns a wrong password's error and signs nothing out", async () => {
    const error = Object.assign(new Error("Invalid login credentials"), {
      code: "invalid_credentials",
    });
    probe.signInWithPassword.mockResolvedValue({ error });
    expect(await checkPassword("me@example.com", "bad")).toEqual({ error });
    expect(probe.signOut).not.toHaveBeenCalled();
  });
});
