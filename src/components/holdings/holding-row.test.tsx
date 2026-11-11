import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DetailRow, HoldingRow } from "./holding-row";

const renderRow = () =>
  render(
    <HoldingRow
      name="World ETF"
      title="iShares Core MSCI World UCITS ETF USD (Acc)"
      amount="12 shares"
      value="€1,234.00"
      returnText="+4.00%"
    >
      <DetailRow label="Price">€102.83</DetailRow>
    </HoldingRow>,
  );

describe("HoldingRow", () => {
  it("shows name and amount, value and return, with the details closed", () => {
    renderRow();
    const row = screen.getByRole("button", { name: /World ETF/ });
    expect(row).toHaveTextContent("12 shares");
    expect(row).toHaveTextContent("€1,234.00");
    expect(row).toHaveTextContent("+4.00%");
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTitle(/MSCI World/)).toBeInTheDocument();
    expect(screen.queryByText("Price")).not.toBeInTheDocument();
  });

  it("opens and closes its details on tap", async () => {
    renderRow();
    const row = screen.getByRole("button", { name: /World ETF/ });
    await userEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Price")).toBeInTheDocument();
    expect(screen.getByText("€102.83")).toBeInTheDocument();
    await userEvent.click(row);
    expect(screen.queryByText("Price")).not.toBeInTheDocument();
  });
});
