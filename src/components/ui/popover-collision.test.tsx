import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const seen: Array<Record<string, unknown>> = [];
vi.mock("@radix-ui/react-popover", async (original) => ({
  ...(await original<typeof import("@radix-ui/react-popover")>()),
  Portal: ({ children }: { children: React.ReactNode }) => children,
  Content: (props: Record<string, unknown>) => {
    seen.push(props);
    return null;
  },
}));

import { PopoverContent } from "./popover";

describe("PopoverContent", () => {
  it("polish-5 #11 keeps a 16px gap from the screen edge on phones", () => {
    render(<PopoverContent />);
    expect(seen.at(-1)?.["collisionPadding"]).toBe(16);
  });
});
