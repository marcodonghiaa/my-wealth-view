import { createFileRoute } from "@tanstack/react-router";
import { ReportsPage } from "../_authenticated/reports";

export const Route = createFileRoute("/demo/reports")({
  component: ReportsPage,
});
