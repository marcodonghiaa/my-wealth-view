import { createFileRoute } from "@tanstack/react-router";
import { PortfolioPage } from "../_authenticated/portfolio";

export const Route = createFileRoute("/demo/portfolio")({
  component: PortfolioPage,
});
