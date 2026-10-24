import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

let counts: Record<string, number> = {};
let dismissed = false;
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/components/push-subscribe", () => ({ PushSubscribeButton: () => null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({ select: async () => ({ count: counts[table] ?? 0, error: null }) }),
    auth: {
      getUser: async () => ({
        data: { user: { user_metadata: { welcome_dismissed: dismissed } } },
      }),
      updateUser: async () => ({ error: null }),
    },
  },
}));

import { WelcomeCard } from "./welcome-card";

function setup(history = 0) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <WelcomeCard history={history} />
    </QueryClientProvider>,
  );
}

describe("WelcomeCard", () => {
  // protects=new users get a checklist that ticks itself off and leaves once set up;
  // fails_when=it nags a set-up instance, or comes back after dismissal;
  // no_claim=the dismiss write reaching the real auth service
  it("lists every step with a link on an empty instance", async () => {
    counts = {};
    dismissed = false;
    setup();
    expect(
      await screen.findByText("0 of 4 done. Each step ticks itself off once its data is in."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Connect" }).getAttribute("href")).toBe("/accounts");
    expect(screen.getByRole("link", { name: "Add" }).getAttribute("href")).toBe("/portfolio");
    expect(screen.getByRole("link", { name: "Import" }).getAttribute("href")).toBe("/import");
  });

  it("ticks off the bank once one is linked, and counts imported history", async () => {
    counts = { accounts: 2 };
    dismissed = false;
    setup(12);
    expect(await screen.findByText(/^2 of 4 done/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Connect" })).toBeNull();
    expect(screen.getAllByText("(done)", { exact: false })).toHaveLength(2);
  });

  it("counts crypto as investments and leaves once a bank and holdings are in", async () => {
    counts = { accounts: 1, crypto_holdings: 2 };
    dismissed = false;
    setup();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/of 4 done/)).toBeNull();
  });

  it("stays hidden once dismissed", async () => {
    counts = {};
    dismissed = true;
    setup();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/of 4 done/)).toBeNull();
  });
});
