import { createFileRoute, redirect } from "@tanstack/react-router";

// Health moved into Settings; old links and bookmarks land on its section.
export const Route = createFileRoute("/_authenticated/health")({
  beforeLoad: () => {
    throw redirect({ to: "/settings", hash: "health", replace: true });
  },
});
