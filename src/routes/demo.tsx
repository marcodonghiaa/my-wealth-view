import { createFileRoute, redirect } from "@tanstack/react-router";
import { pauseRealClient } from "@/integrations/supabase/client";
import { enterDemoMode } from "@/lib/demo/mode";

// /demo switches the tab into demo mode, then lands on the normal dashboard.
export const Route = createFileRoute("/demo")({
  ssr: false,
  beforeLoad: () => {
    enterDemoMode();
    pauseRealClient();
    throw redirect({ to: "/", replace: true });
  },
});
