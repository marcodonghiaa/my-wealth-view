import { describe, expect, it } from "vitest";
import { retryUnlessRefused } from "@/lib/mfa";
import { getRouter } from "./router";

// protects=queries refused for a missing code open the code step without retries;
// fails_when=the router's QueryClient loses the retry rule or the refusal handler
describe("getRouter", () => {
  it("wires the refusal retry rule and error handler into the QueryClient", () => {
    const { queryClient } = getRouter().options.context as {
      queryClient: import("@tanstack/react-query").QueryClient;
    };
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(retryUnlessRefused);
    expect(queryClient.getQueryCache().config.onError).toBeTypeOf("function");
    expect(queryClient.getMutationCache().config.onError).toBeTypeOf("function");
  });
});
