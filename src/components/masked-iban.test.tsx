import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { maskIban } from "@/lib/iban";
import { MaskedIban } from "./masked-iban";

describe("maskIban", () => {
  it("keeps only the last four characters", () => {
    expect(maskIban("BE89905505504568")).toBe("•••• 4568");
  });

  it("masks a short value completely rather than leaking it", () => {
    expect(maskIban("AB12")).toBe("••••");
  });
});

describe("MaskedIban", () => {
  it("hides the full IBAN until the user asks to reveal it", async () => {
    render(<MaskedIban iban="IT44Z0301503200000003949760" />);
    expect(screen.queryByText("IT44Z0301503200000003949760")).toBeNull();
    expect(screen.getByRole("button", { name: /show full iban/i })).toHaveTextContent("•••• 9760");

    await userEvent.click(screen.getByRole("button", { name: /show full iban/i }));
    expect(screen.getByText("IT44Z0301503200000003949760")).toBeInTheDocument();
  });

  it("hides it again on a second tap", async () => {
    render(<MaskedIban iban="IT44Z0301503200000003949760" />);
    await userEvent.click(screen.getByRole("button", { name: /show full iban/i }));
    await userEvent.click(screen.getByRole("button", { name: /hide full iban/i }));
    expect(screen.queryByText("IT44Z0301503200000003949760")).toBeNull();
  });
});
