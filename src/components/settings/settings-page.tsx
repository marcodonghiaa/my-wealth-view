import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { HealthSection, NotificationsSection } from "@/components/health/health-section";
import { isDemoMode } from "@/lib/demo/mode";

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-8 sm:px-8 md:py-12">
      <h1 className="text-[0.9375rem] font-medium text-muted-foreground">Settings</h1>
      {/* The demo has no real account, so a password change there would do nothing. */}
      {!isDemoMode() && <ChangePasswordForm />}
      <HealthSection />
      <NotificationsSection />
    </div>
  );
}
