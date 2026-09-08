import { createFileRoute } from "@tanstack/react-router";
import { RulesPage } from "../_authenticated/rules";

export const Route = createFileRoute("/demo/rules")({
  component: RulesPage,
});
