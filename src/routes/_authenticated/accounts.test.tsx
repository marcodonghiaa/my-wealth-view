import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", () => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "order", "eq"]) q[m] = () => q;
  q["then"] = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
  return { supabase: { from: () => q } };
});
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/import">{children}</a>,
}));

import { Route } from "./accounts";

const Page = Route.options.component as () => React.JSX.Element;

describe("Add certificate of deposit form", () => {
  const originalTz = process.env["TZ"];
  beforeEach(() => {
    // 00:30 on 20 Oct in Dublin (UTC+1): still 19 Oct in UTC.
    process.env["TZ"] = "Europe/Dublin";
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-19T23:30:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env["TZ"];
    else process.env["TZ"] = originalTz;
  });

  it("starts on the user's local day, not the UTC day", async () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /add certificate|add cd|add/i }));
    const start = container.querySelector<HTMLInputElement>('input[type="date"]');
    expect(start?.value).toBe("2026-10-20");
  });
});
