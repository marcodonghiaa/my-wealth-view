import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { Route as AuthRoute } from "./auth";
import { Route as DemoRoute } from "./demo";
import { Route as ResetRoute } from "./reset-password";

type BeforeLoad = (args: { context: { queryClient: QueryClient } }) => unknown;
const run = (route: { options: unknown }, queryClient: QueryClient) => {
  try {
    (route.options as { beforeLoad: BeforeLoad }).beforeLoad({ context: { queryClient } });
  } catch {
    // /demo redirects to the dashboard by throwing.
  }
};

// Regression: data cached in one mode showed in the other (demo numbers on the real dashboard
// after signing out of the demo, or real accounts under the Demo badge).
describe("switching between demo and real data empties the query cache", () => {
  for (const [name, route] of [
    ["/demo", DemoRoute],
    ["/auth", AuthRoute],
    ["/reset-password", ResetRoute],
  ] as const) {
    it(`${name} clears cached queries`, () => {
      const queryClient = new QueryClient();
      queryClient.setQueryData(["accounts"], { real: true });
      const clear = vi.spyOn(queryClient, "clear");
      run(route, queryClient);
      expect(clear).toHaveBeenCalled();
      expect(queryClient.getQueryData(["accounts"])).toBeUndefined();
    });
  }
});
