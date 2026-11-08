import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type Row = Record<string, unknown>;
const { db } = vi.hoisted(() => ({ db: { rows: [] as Array<Row> } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => Promise.resolve({ data: db.rows, error: null }) }) },
}));
const { demo } = vi.hoisted(() => ({ demo: { on: false } }));
vi.mock("@/lib/demo/mode", () => ({ isDemoMode: () => demo.on }));

const KEY = "mf.subscriptionsReveal.seen";
const stream = (over: Row): Row => ({
  id: "s1",
  display_name: "Streamflix",
  currency: "EUR",
  cadence: "monthly",
  typical_amount_eur: 10,
  charge_count: 4,
  last_charged: "2099-12-01",
  next_expected: "2099-12-31",
  detected_status: "active",
  user_status: null,
  user_cadence: null,
  custom_interval_value: null,
  custom_interval_unit: null,
  ...over,
});
const suggested = stream({ id: "s2", display_name: "Cloudbox", detected_status: "suggested" });

// The seen-this-session flag is module state, so each test gets a fresh module.
async function renderReveal() {
  vi.resetModules();
  const { RevealDialog } = await import("./reveal-dialog");
  const view = () => (
    <QueryClientProvider client={new QueryClient()}>
      <RevealDialog />
    </QueryClientProvider>
  );
  const r = render(view());
  return { ...r, again: () => r.rerender(view()) };
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  demo.on = false;
  db.rows = [stream({})];
  vi.restoreAllMocks();
});

describe("RevealDialog", () => {
  it("shows once, then not again after closing", async () => {
    await renderReveal();
    expect(await screen.findByText("We found 1 subscription")).toBeTruthy();
    expect(screen.getByText("Streamflix")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByText("We found 1 subscription")).toBeNull();
    expect(localStorage.getItem(KEY)).toBe("1");
    cleanup();
    await renderReveal();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("We found 1 subscription")).toBeNull();
  });

  it("renders and closes without looping when storage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { again } = await renderReveal();
    expect(await screen.findByText("We found 1 subscription")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    again();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("We found 1 subscription")).toBeNull();
  });

  it("is not shown with 0 streams", async () => {
    db.rows = [];
    await renderReveal();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/We found/)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("offers to review suggestions when the queue is non-empty, and scrolls to it", async () => {
    db.rows = [stream({}), suggested];
    const section = document.createElement("section");
    section.setAttribute("aria-label", "To review");
    section.scrollIntoView = vi.fn();
    document.body.append(section);
    await renderReveal();
    expect(await screen.findByText("We found 2 subscriptions")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review 1 suggestion" }));
    expect(screen.queryByText("We found 2 subscriptions")).toBeNull();
    await vi.waitFor(() => expect(section.scrollIntoView).toHaveBeenCalled());
    section.remove();
  });

  it("closes from the CTA when there is no To review section on the page", async () => {
    db.rows = [suggested];
    await renderReveal();
    fireEvent.click(await screen.findByRole("button", { name: "Review 1 suggestion" }));
    expect(screen.queryByText(/We found/)).toBeNull();
  });

  it("in the demo shows without persisting the flag", async () => {
    demo.on = true;
    await renderReveal();
    expect(await screen.findByText("We found 1 subscription")).toBeTruthy();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
