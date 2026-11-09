import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/settings/settings-page";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Alopex" },
      { name: "description", content: "Health checks and notifications." },
    ],
  }),
  component: SettingsPage,
});
