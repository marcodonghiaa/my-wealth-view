import { createFileRoute } from "@tanstack/react-router";
import { SpendingPage } from "../_authenticated/spending";

export const Route = createFileRoute("/demo/spending")({
  component: SpendingPage,
});
