import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

let counts: Record<string, number> = {};
let dismissed = false;
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
let demo = false;
vi.mock("@/lib/demo/mode", () => ({ isDemoMode: () => demo }));
// Real pushSupport(), stub button (the real one talks to the service worker and Supabase).
vi.mock("@/components/push-subscribe", async (importActual) => ({
  ...(await importActual<typeof import("@/components/push-subscribe")>()),
  PushSubscribeButton: () => <button type="button">Enable purchase check-ins</button>,
}));
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

  describe("notifications row", () => {
    const INSTALL_HINT =
      "Install the app first: on iPhone, Safari → Share → Add to Home Screen; on Android, Chrome menu → Install app; on a computer, the install icon in the address bar. Then open the app and turn this on.";

    afterEach(() => {
      demo = false;
      vi.unstubAllGlobals();
      Reflect.deleteProperty(navigator, "serviceWorker");
    });

    function standaloneWithPush() {
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: query === "(display-mode: standalone)",
        media: query,
      }));
      vi.stubGlobal("PushManager", function PushManager() {});
      Object.defineProperty(navigator, "serviceWorker", { value: {}, configurable: true });
    }

    // protects=a browser-tab user learns push needs the installed app instead of a silent empty row;
    // fails_when=the row shows no action in a plain tab, or the hint shows where the button works / in the demo
    it("shows the install hint in a regular browser tab", async () => {
      counts = {};
      dismissed = false;
      setup();
      expect(await screen.findByText(INSTALL_HINT)).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Enable purchase check-ins" })).toBeNull();
    });

    it("shows the subscribe button once installed with push support", async () => {
      counts = {};
      dismissed = false;
      standaloneWithPush();
      setup();
      expect(await screen.findByRole("button", { name: "Enable purchase check-ins" })).toBeTruthy();
      expect(screen.queryByText(INSTALL_HINT)).toBeNull();
    });

    it("shows neither hint nor button in the demo", async () => {
      counts = {};
      dismissed = false;
      demo = true;
      standaloneWithPush();
      setup();
      await screen.findByText(/^0 of 4 done/);
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByText(INSTALL_HINT)).toBeNull();
      expect(screen.queryByRole("button", { name: "Enable purchase check-ins" })).toBeNull();
    });
  });
});
