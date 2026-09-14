import { createFileRoute } from "@tanstack/react-router";
import { OwedPage } from "../_authenticated/owed";

export const Route = createFileRoute("/demo/owed")({
  component: OwedPage,
});
