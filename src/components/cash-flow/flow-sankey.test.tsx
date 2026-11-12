import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { cloneElement, type ReactElement } from "react";
import { buildFlow } from "@/lib/cash-flow";

let mobile = false;
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => mobile }));
vi.mock("recharts", async (orig) => ({
  ...(await orig<typeof import("recharts")>()),
  ResponsiveContainer: ({ children }: { children: ReactElement }) =>
    cloneElement(children as ReactElement<{ width: number; height: number }>, {
      width: 640,
      height: 320,
    }),
}));

import { FlowSankey } from "./flow-sankey";

const graph = buildFlow({
  income: 3000,
  spending: 2000,
  sources: [{ name: "ACME CONSULTING GMBH AND PARTNERS", value: 3000 }],
  categories: [{ name: "Housing", value: 2000 }],
});
const payerLabel = () =>
  screen.getByText((_, el) => el?.tagName === "tspan" && /^ACME/.test(el.textContent ?? ""))
    .parentElement as Element;

// Polish 3 #16: the two layouts of the diagram's labels.
describe("FlowSankey labels", () => {
  it("puts payers' labels outside their band on desktop, cut to the margin", () => {
    mobile = false;
    render(<FlowSankey graph={graph} label="Cash flow" />);
    expect(payerLabel()).toHaveAttribute("text-anchor", "end");
    expect(payerLabel().firstElementChild).toHaveTextContent(/^ACME CONSULTING GMBH AND…$/);
  });

  it("puts payers' labels on their band on a phone, cut shorter", () => {
    mobile = true;
    render(<FlowSankey graph={graph} label="Cash flow" />);
    expect(payerLabel()).toHaveAttribute("text-anchor", "start");
    expect(payerLabel().firstElementChild).toHaveTextContent(/^ACME CONSUL…$/);
  });
});

// Polish 4 #1: a thick stroke on a steep curve folds over itself; bands are filled outlines.
it("draws each band as a filled outline, not a thick stroke", () => {
  mobile = true;
  const { container } = render(<FlowSankey graph={graph} label="Cash flow" />);
  const links = container.querySelectorAll(".recharts-sankey-links path");
  expect(links.length).toBe(graph.links.length);
  for (const l of links) {
    expect(l.getAttribute("fill")).not.toBe("none");
    expect(l.getAttribute("stroke-width")).toBeNull();
    expect(l.getAttribute("d")).toMatch(/Z$/);
  }
});

// Polish 4 #3: grey on the green band is too faint (4.35:1); an amount on a band is in ink.
it("draws a payer's amount in ink when it sits on its band", () => {
  mobile = true;
  render(<FlowSankey graph={graph} label="Cash flow" />);
  expect(payerLabel().lastElementChild).toHaveClass("fill-foreground");
});

// Polish 4 #8: a cut name can still be read in full, on hover or long-press.
it("gives each node its full name and amount as a title", () => {
  mobile = true;
  const { container } = render(<FlowSankey graph={graph} label="Cash flow" />);
  const titles = [...container.querySelectorAll(".recharts-sankey-nodes title")].map(
    (t) => t.textContent,
  );
  expect(titles).toContain("ACME CONSULTING GMBH AND PARTNERS €3,000.00");
});

// Polish 4 #11: bands are a touch stronger in dark mode, where 0.28 turned muddy.
it("takes the band opacity from the theme", () => {
  mobile = false;
  const { container } = render(<FlowSankey graph={graph} label="Cash flow" />);
  const band = container.querySelector(".recharts-sankey-links path") as SVGPathElement;
  expect(band.style.fillOpacity).toBe("var(--sankey-band-opacity)");
});
