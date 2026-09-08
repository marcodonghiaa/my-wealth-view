import { createFileRoute } from "@tanstack/react-router";
import { NetWorthPage } from "../_authenticated/index";

export const Route = createFileRoute("/demo/")({
  component: NetWorthPage,
});
