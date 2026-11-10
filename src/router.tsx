import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { onMfaRequired, retryUnlessRefused } from "@/lib/mfa";
import { backHereSearch } from "@/lib/next-url";

export const getRouter = () => {
  // The database refuses a session that skipped the authenticator code: send it to the code step,
  // then back to the page it was on.
  const handleRefusal = onMfaRequired(() =>
    router.navigate({ to: "/auth", search: backHereSearch(router.state.location) }),
  );
  // Already on sign-in (a request that failed after the redirect): it is already asking.
  const onError = (error: unknown) =>
    router.state.location.pathname === "/auth" ? undefined : handleRefusal(error);
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
