import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { onMfaRequired, retryUnlessRefused } from "@/lib/mfa";
import { backHereSearch } from "./routes/auth";

export const getRouter = () => {
  // The database refuses a session that skipped the authenticator code: send it to the code step,
  // then back to the page it was on.
  const onError = onMfaRequired(() =>
    router.navigate({ to: "/auth", search: backHereSearch(router.state.location) }),
  );
  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: { queries: { retry: retryUnlessRefused } },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
