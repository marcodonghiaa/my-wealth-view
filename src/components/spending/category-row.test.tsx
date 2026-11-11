import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({
    children,
    search,
    className,
  }: {
    children: React.ReactNode;
    search: Record<string, string>;
    className?: string;
  }) => (
    <a href={`/transactions?${new URLSearchParams(search)}`} className={className}>
      {children}
    </a>
  ),
}));

import { CategoryRow } from "./category-row";

const renderRow = (category: string) =>
  render(
    <ul>
      <CategoryRow category={category} total={801.96} share="58%" month={new Date(2026, 9, 1)} />
    </ul>,
  );

// protects=every category row leads to its transactions for the same month;
// fails_when=the row is a dead end, links to another month, or loses the Uncategorized bucket
describe("CategoryRow", () => {
  it("links to Activity filtered by category and month", () => {
    renderRow("Dine Out");
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/transactions?category=Dine+Out&month=2026-10");
    expect(link).toHaveTextContent("Dine Out");
    expect(link).toHaveTextContent("58%");
    expect(link).toHaveTextContent("€801.96");
  });

  it("links Uncategorized to rows without a category", () => {
    renderRow("Uncategorized");
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/transactions?category=__uncategorized__&month=2026-10",
    );
  });
});
