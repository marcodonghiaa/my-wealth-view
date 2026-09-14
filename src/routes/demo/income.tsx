import { createFileRoute } from "@tanstack/react-router";
import { IncomePage } from "../_authenticated/income";

export const Route = createFileRoute("/demo/income")({
  component: IncomePage,
});
