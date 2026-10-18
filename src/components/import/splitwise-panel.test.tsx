import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The bank review is tested on its own; here it only needs something to read.
vi.mock("./splitwise-review", () => ({
  SplitwiseReview: ({ group }: { group: string }) => <p>review of {group}</p>,
}));

import { SplitwisePanel } from "./splitwise-panel";

const CSV = [
  "Date,Description,Category,Cost,Currency,Ann,Bob",
  "",
  "2026-08-16,Dinner,Dining out,30.00,USD,-15.00,15.00",
  "2026-08-17,Taxi,Taxi,20.00,USD,10.00,-10.00",
  "2026-08-18,Ann paid Bob,Payment,5.00,USD,5.00,-5.00",
  "",
  "2026-08-18,Total balance, , ,USD,0.00,0.00",
].join("\n");

const upload = (text: string, name = "berkeley_2026-10-18_export.csv") =>
  fireEvent.change(document.querySelector("input[type=file]") as HTMLInputElement, {
    target: { files: [new File([text], name, { type: "text/csv" })] },
  });

describe("SplitwisePanel", () => {
  // protects=the user must choose who they are before anything is summed; fails_when=a default
  // member is silently picked or the summary shows early
  it("asks who you are after the file and shows no summary until chosen", async () => {
    render(<SplitwisePanel />);
    upload(CSV);
    expect(await screen.findByLabelText(/Which one are you/)).toBeTruthy();
    expect(screen.queryByText(/paid by others/i)).toBeNull();
  });

  it("takes the group name from the file name", async () => {
    render(<SplitwisePanel />);
    upload(CSV);
    expect(((await screen.findByLabelText(/Group name/)) as HTMLInputElement).value).toBe(
      "berkeley",
    );
  });

  // protects=the summary numbers shown to the user; fails_when=share or totals are wrong
  it("shows the summary once a member is chosen", async () => {
    render(<SplitwisePanel />);
    upload(CSV);
    fireEvent.change(await screen.findByLabelText(/Which one are you/), { target: { value: "0" } });
    expect(await screen.findByText(/1 paid by others, your share 15\.00 USD/)).toBeTruthy();
    expect(screen.getByText(/1 paid by you/)).toBeTruthy();
    expect(screen.getByText(/You paid back 5\.00 USD/)).toBeTruthy();
  });

  it("tells apart two members with the same name", async () => {
    render(<SplitwisePanel />);
    upload(CSV.replace("Ann,Bob", "Ann,Ann"));
    const options = await screen.findAllByRole("option", { name: /Ann/ });
    expect(options.map((o) => o.textContent)).toEqual(["Ann (column 1)", "Ann (column 2)"]);
  });

  // protects=a broken file never gets to the choice step; fails_when=errors are not blocking
  it("shows a blocking error for rows that do not add up", async () => {
    render(<SplitwisePanel />);
    upload(CSV.replace("-15.00,15.00", "-15.00,10.00"));
    expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(/Which one are you/)).toBeNull();
  });

  it("rejects a file that is not a Splitwise export", async () => {
    render(<SplitwisePanel />);
    upload("hello,world\n1,2\n");
    expect((await screen.findByRole("alert")).textContent).toMatch(/Splitwise|column/i);
  });

  it("rejects an oversized file without reading it", async () => {
    render(<SplitwisePanel />);
    const big = new File(["x"], "big.csv");
    Object.defineProperty(big, "size", { value: 3_000_000 });
    fireEvent.change(document.querySelector("input[type=file]") as HTMLInputElement, {
      target: { files: [big] },
    });
    expect((await screen.findByRole("alert")).textContent).toMatch(/too large/);
  });

  // protects=the bank is not re-read on every letter typed; fails_when=the review follows the
  // draft name instead of the finished one
  it("passes the group name to the review only when typing is done", async () => {
    render(<SplitwisePanel />);
    upload(CSV);
    fireEvent.change(await screen.findByLabelText(/Which one are you/), { target: { value: "0" } });
    const input = screen.getByLabelText(/Group name/);
    fireEvent.change(input, { target: { value: "trip" } });
    expect(screen.getByText("review of berkeley")).toBeTruthy();
    fireEvent.blur(input);
    expect(screen.getByText("review of trip")).toBeTruthy();
  });
});
