import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const upsert = vi.fn(async () => ({ error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    from: () => ({ upsert, delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }),
  },
}));

import { ImportWizard } from "./import-wizard";

function setup() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ImportWizard />
    </QueryClientProvider>,
  );
}
const upload = (text: string) =>
  fireEvent.change(document.querySelector("input[type=file]") as HTMLInputElement, {
    target: { files: [new File([text], "h.csv", { type: "text/csv" })] },
  });

describe("ImportWizard", () => {
  // protects=a user can go file -> check -> import; fails_when=columns are not guessed, the
  // preview is wrong or Import does not write; no_claim=the real database
  it("previews a file, then writes the rows on Import", async () => {
    setup();
    upload("Month,Total\n2024-02,100\n2024-03,150\nbad,1\n");
    expect(await screen.findByText(/2 rows ready, 1 skipped/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Import 2 rows/ }));
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Undo this import/)).toBeTruthy();
  });

  it("shows a plain message for an empty file", async () => {
    setup();
    upload("   ");
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "The file is empty.");
  });

  it("asks for the required column when none was guessed", async () => {
    setup();
    upload("a,b\n1,2\n");
    expect(await screen.findByText(/Choose a column for: Month/)).toBeTruthy();
  });
});
