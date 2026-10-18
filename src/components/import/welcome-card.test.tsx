import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

let facts = { count: 0, dismissed: false };
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ count: facts.count, error: null }) }),
    auth: {
      getUser: async () => ({
        data: { user: { user_metadata: { welcome_dismissed: facts.dismissed } } },
      }),
      updateUser: async () => ({ error: null }),
    },
  },
}));

import { WelcomeCard } from "./welcome-card";

function setup(props: { snapshots: number; history: number }) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <WelcomeCard {...props} />
    </QueryClientProvider>,
  );
}

describe("WelcomeCard", () => {
  // protects=new users get pointed at import; fails_when=it shows to people with data or after
  // dismissal; no_claim=the dismiss write reaching the real auth service
  it("shows on an empty instance with import and bank links", async () => {
    facts = { count: 0, dismissed: false };
    setup({ snapshots: 0, history: 0 });
    expect(await screen.findByText("Import a CSV")).toBeTruthy();
    expect(screen.getByText("Connect a bank")).toBeTruthy();
  });

  it("stays hidden when there is data", async () => {
    facts = { count: 2, dismissed: false };
    setup({ snapshots: 0, history: 0 });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("Import a CSV")).toBeNull();
  });

  it("stays hidden once dismissed", async () => {
    facts = { count: 0, dismissed: true };
    setup({ snapshots: 0, history: 0 });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("Import a CSV")).toBeNull();
  });
});
