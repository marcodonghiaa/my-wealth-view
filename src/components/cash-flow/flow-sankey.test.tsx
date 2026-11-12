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
    expect(payerLabel().firstElementChild).toHaveTextContent(/^ACME CONSULTING GMB…$/);
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
