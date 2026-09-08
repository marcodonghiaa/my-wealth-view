import { createFileRoute } from "@tanstack/react-router";
import { SubscriptionsPage } from "../_authenticated/subscriptions";

export const Route = createFileRoute("/demo/subscriptions")({
  component: SubscriptionsPage,
});
