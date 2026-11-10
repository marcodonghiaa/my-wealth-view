import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "./button";
import { Input, Select, fieldClass } from "./field";
import { GroupedList, SectionTitle } from "./grouped-list";
import { Alert } from "./alert";
import { Skeleton } from "./skeleton";

describe("Button", () => {
  it("is a 44px ink button by default, never submits a form by accident", () => {
    render(<Button>Save</Button>);
    const b = screen.getByRole("button", { name: "Save" });
    expect(b).toHaveAttribute("type", "button");
    expect(b.className).toContain("bg-primary");
    expect(b.className).toContain("min-h-11");
    expect(b.className).toContain("rounded-sm");
    expect(b.className).not.toContain("rounded-full");
  });

  it("supports quiet, ghost, destructive and icon variants", () => {
    render(
      <>
        <Button variant="quiet">Q</Button>
        <Button variant="ghost">G</Button>
        <Button variant="destructive">D</Button>
        <Button size="icon" aria-label="I" />
        <Button size="sm">S</Button>
      </>,
    );
    expect(screen.getByText("Q").className).toContain("bg-card");
    expect(screen.getByText("G").className).toContain("text-muted-foreground");
    expect(screen.getByText("D").className).toContain("text-negative");
    expect(screen.getByLabelText("I").className).toContain("size-11");
    expect(screen.getByText("S").className).toContain("min-h-9");
  });

  it("lets a caller override classes and type", () => {
    render(
      <Button type="submit" className="w-full">
        Go
      </Button>,
    );
    const b = screen.getByRole("button");
    expect(b).toHaveAttribute("type", "submit");
    expect(b.className).toContain("w-full");
  });
});

describe("fields", () => {
  it("outlines form fields and leaves on-ground fields white", () => {
    expect(fieldClass()).toContain("border-rule");
    expect(fieldClass(true)).toContain("bg-card");
    expect(fieldClass(true)).not.toContain("border-rule");
  });

  it("renders Input and Select with the field style", () => {
    render(
      <>
        <Input aria-label="name" />
        <Select aria-label="pick" onGround>
          <option>a</option>
        </Select>
      </>,
    );
    expect(screen.getByLabelText("name").className).toContain("h-11");
    expect(screen.getByLabelText("pick").className).toContain("bg-card");
  });
});

describe("lists, alerts, skeletons", () => {
  it("renders a grouped list with a section title and action", () => {
    render(
      <>
        <SectionTitle action={<span>act</span>}>Accounts</SectionTitle>
        <GroupedList data-testid="list" />
      </>,
    );
    expect(screen.getByRole("heading", { name: "Accounts" })).toBeInTheDocument();
    expect(screen.getByText("act")).toBeInTheDocument();
    expect(screen.getByTestId("list").className).toContain("rounded-lg");
  });

  it("announces alerts and hides skeletons from assistive tech", () => {
    render(
      <>
        <Alert>Broke</Alert>
        <Skeleton data-testid="sk" />
      </>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Broke");
    expect(screen.getByTestId("sk")).toHaveAttribute("aria-hidden");
  });
});
