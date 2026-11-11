import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  refreshSession: vi.fn(async () => ({ error: null })),
  signOut: vi.fn(async () => ({ error: null })),
}));
vi.mock("@/integrations/supabase/client", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/integrations/supabase/client")>();
  return { ...real, supabase: { ...real.supabase, auth: { ...real.supabase.auth, ...auth } } };
});

import type { QueryClient } from "@tanstack/react-query";
import { retryUnlessRefused } from "@/lib/mfa";
import { getRouter } from "./router";

const refusal = { code: "42501", hint: "mfa_required", message: "x" };
const clientOf = (router: ReturnType<typeof getRouter>) =>
  (router.options.context as { queryClient: QueryClient }).queryClient;

beforeEach(() => auth.refreshSession.mockClear());

// protects=queries refused for a missing code open the code step without retries;
// fails_when=the router's QueryClient loses the retry rule or the refusal handler
describe("getRouter", () => {
  it("wires the refusal retry rule and error handler into the QueryClient", () => {
    const queryClient = clientOf(getRouter());
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(retryUnlessRefused);
    expect(queryClient.getQueryCache().config.onError).toBeTypeOf("function");
    expect(queryClient.getMutationCache().config.onError).toBeTypeOf("function");
  });

  it("sends a refused session from a page to the code step, back to that page", async () => {
    window.history.replaceState(null, "", "/accounts");
    const router = getRouter();
    const navigate = vi.spyOn(router, "navigate").mockResolvedValue(undefined);
    await clientOf(router).getMutationCache().config.onError!(
      refusal as never,
      undefined,
      undefined,
      undefined as never,
      undefined as never,
    );
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/auth",
        search: expect.objectContaining({ next: "/accounts" }),
      }),
    );
  });

  // fails_when=a mutation that fails after the redirect navigates again, nesting next=/auth?next=…
  it("does nothing for a refusal that lands while already on the sign-in page", async () => {
    window.history.replaceState(null, "", "/auth?next=%2Faccounts");
    const router = getRouter();
    const navigate = vi.spyOn(router, "navigate").mockResolvedValue(undefined);
    await clientOf(router).getMutationCache().config.onError!(
      refusal as never,
      undefined,
      undefined,
      undefined as never,
      undefined as never,
    );
    expect(navigate).not.toHaveBeenCalled();
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
});
