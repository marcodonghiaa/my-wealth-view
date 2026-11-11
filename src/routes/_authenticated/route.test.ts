import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSession, getUser, aal } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  aal: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession, getUser, mfa: { getAuthenticatorAssuranceLevel: aal } } },
  loadDemoClient: async () => {},
}));
const demo = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/demo/mode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/demo/mode")>()),
  isDemoMode: () => demo.on,
}));

import { Route } from "./route";

const beforeLoad = (
  location: { pathname: string; searchStr: string; hash?: string } = {
    pathname: "/",
    searchStr: "",
  },
) =>
  (Route.options.beforeLoad as (args: { location: typeof location }) => Promise<unknown>)({
    location,
  });

describe("authenticated layout guard", () => {
  beforeEach(() => {
    getSession.mockReset();
    getUser.mockReset();
    aal.mockReset().mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
      error: null,
    });
  });

  // protects=a password alone never opens the dashboard of a user with an authenticator;
  // fails_when=the guard skips the assurance-level check
  it("sends a session still missing its authenticator code back to sign-in", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } }, error: null });
    aal.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null });
    await expect(beforeLoad()).rejects.toMatchObject({ options: { to: "/auth" } });
  });

  // fails_when=the demo's fake client is asked for an assurance level it doesn't have
  it("skips the code check in the demo", async () => {
    demo.on = true;
    getSession.mockResolvedValue({ data: { session: { user: { id: "demo" } } }, error: null });
    await expect(beforeLoad()).resolves.toEqual({ user: { id: "demo" } });
    expect(aal).not.toHaveBeenCalled();
    demo.on = false;
  });

  it("lets a signed-in user through using the local session, with no server round trip", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } }, error: null });
    await expect(beforeLoad()).resolves.toEqual({ user: { id: "u1" } });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("sends a visitor without a session to the sign-in page", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(beforeLoad()).rejects.toMatchObject({ options: { to: "/auth" } });
  });

  it("sends the visitor to sign-in when the session lookup fails", async () => {
    getSession.mockRejectedValue(new Error("storage unavailable"));
    await expect(beforeLoad()).rejects.toMatchObject({ options: { to: "/auth" } });
  });

  it("keeps the bank redirect as next, so sign-in returns to it", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    const location = { pathname: "/accounts", searchStr: "?bank_code=x&bank_state=y" };
    await expect(beforeLoad(location)).rejects.toMatchObject({
      options: { to: "/auth", search: { next: "/accounts?bank_code=x&bank_state=y" } },
    });
  });

  it("keeps the fragment too: the code travels there, never to the server", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    const location = { pathname: "/accounts", searchStr: "", hash: "bank_code=x&bank_state=y" };
    await expect(beforeLoad(location)).rejects.toMatchObject({
      options: { to: "/auth", search: { next: "/accounts#bank_code=x&bank_state=y" } },
    });
  });

  it("adds no next for the home page", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(beforeLoad()).rejects.toMatchObject({ options: { to: "/auth", search: {} } });
  });
});
