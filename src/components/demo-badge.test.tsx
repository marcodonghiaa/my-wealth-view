import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DemoBadge } from "./demo-badge";
import { enterDemoMode, exitDemoMode } from "@/lib/demo/mode";

describe("DemoBadge", () => {
  afterEach(() => exitDemoMode());

  it("is hidden outside demo mode", () => {
    render(<DemoBadge />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says the data is fake", () => {
    enterDemoMode();
    render(<DemoBadge />);
    expect(screen.getByRole("status").textContent).toBe("Demo, fake data");
  });

  // Regression: the full badge overlapped the centred "Alopex" title in the mobile top bar.
  // jsdom has no layout, so check that phones show only "Demo".
  it("shortens to Demo on phones but keeps the full text for screen readers", () => {
    enterDemoMode();
    render(<DemoBadge />);
    const rest = screen.getByText(", fake data");
    expect(rest.className).toContain("max-md:sr-only");
    expect(rest.className).not.toMatch(/(^|\s)hidden/);
  });

  it("is inline, never fixed over the page", () => {
    enterDemoMode();
    render(<DemoBadge className="ml-auto" />);
    const badge = screen.getByRole("status");
    expect(badge.className).not.toContain("fixed");
    expect(badge.className).toContain("ml-auto");
  });
});
