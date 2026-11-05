import { createFileRoute, redirect } from "@tanstack/react-router";
import { loadDemoClient, pauseRealClient } from "@/integrations/supabase/client";
import { enterDemoMode } from "@/lib/demo/mode";

// /demo switches the tab into demo mode, then lands on the normal dashboard.
export const Route = createFileRoute("/demo")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await loadDemoClient();
    enterDemoMode();
    // Real data cached earlier in this tab must not show under the Demo badge.
    context.queryClient.clear();
    pauseRealClient();
    throw redirect({ to: "/", replace: true });
  },
});
