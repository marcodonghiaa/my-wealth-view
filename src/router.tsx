import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { onMfaRequired } from "@/lib/mfa";

export const getRouter = () => {
  // The database refuses a session that skipped the authenticator code: send it to the code step.
  const onError = onMfaRequired(() => router.navigate({ to: "/auth" }));
  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
