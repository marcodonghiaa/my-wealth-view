import { HealthSection, NotificationsSection } from "@/components/health/health-section";

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-8 sm:px-8 md:py-12">
      <h1 className="text-[0.9375rem] font-medium text-muted-foreground">Settings</h1>
      <HealthSection />
      <NotificationsSection />
    </div>
  );
}
