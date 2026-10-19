import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSession, getUser } = vi.hoisted(() => ({ getSession: vi.fn(), getUser: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession, getUser } },
}));

import { Route } from "./route";

const beforeLoad = () => (Route.options.beforeLoad as () => Promise<unknown>)();

describe("authenticated layout guard", () => {
  beforeEach(() => {
    getSession.mockReset();
    getUser.mockReset();
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
});
