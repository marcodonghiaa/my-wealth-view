import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

let accountsResult: { data: unknown; error: unknown } = { data: [], error: null };
let support: "ok" | "install" | "unsupported" = "unsupported";
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const q: Record<string, unknown> = { select: () => q };
      q["then"] = (resolve: (v: unknown) => void) =>
        resolve(table === "v_bank_accounts_latest" ? accountsResult : { data: null, error: {} });
      return q;
    },
  },
}));
vi.mock("@/components/push-subscribe", () => ({
  pushSupport: () => support,
  PushSubscribeButton: () => <button type="button">Enable purchase check-ins</button>,
}));
vi.mock("@/lib/demo/mode", () => ({ isDemoMode: () => false }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

import { HealthSection, NotificationsSection } from "./health-section";

const renderWith = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>,
  );

const staleAccount = {
  uid: "a1",
  label: "Main",
  currency: "EUR",
  bank_name: "Revolut",
  consent_valid_until: "2999-01-01T00:00:00Z",
  snapshot_date: "2000-01-01",
};

describe("HealthSection", () => {
  beforeEach(() => {
    accountsResult = { data: [], error: null };
    support = "unsupported";
  });

  // protects=Health output is unchanged by the move; fails_when=sync rows or the count are lost
  it("lists a stale sync as needing attention", async () => {
    accountsResult = { data: [staleAccount], error: null };
    renderWith(<HealthSection />);
    expect(await screen.findByText("Revolut EUR sync")).toBeInTheDocument();
    expect(await screen.findByText(/need.? attention/)).toBeInTheDocument();
  });

  it("keeps the push row out of Health", async () => {
    support = "install";
    renderWith(<HealthSection />);
    expect(await screen.findByText(/Nothing to check yet/)).toBeInTheDocument();
    expect(screen.queryByText("Push notifications")).not.toBeInTheDocument();
  });

  it("shows why the accounts failed to load", async () => {
    accountsResult = { data: null, error: new Error("boom") };
    renderWith(<HealthSection />);
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
  });
});

describe("NotificationsSection", () => {
  beforeEach(() => {
    accountsResult = { data: [], error: null };
  });

  it("renders nothing where push can't work", () => {
    support = "unsupported";
    const { container } = renderWith(<NotificationsSection />);
    expect(container).toBeEmptyDOMElement();
  });

  // protects=the install hint reaches users in a plain browser tab, with no enable button
  it("shows the install hint in a plain browser tab", async () => {
    support = "install";
    renderWith(<NotificationsSection />);
    expect(await screen.findByText(/Add to Home Screen/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers the enable button once installed and not subscribed", async () => {
    support = "ok";
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration: async () => undefined },
    });
    renderWith(<NotificationsSection />);
    expect(
      await screen.findByRole("button", { name: /Enable purchase check-ins/ }),
    ).toBeInTheDocument();
  });
});
