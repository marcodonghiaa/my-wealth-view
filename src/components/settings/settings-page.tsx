import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { DeleteAccount } from "@/components/settings/delete-account";
import { TwoFactorSection } from "@/components/settings/two-factor-section";
import { ExportData } from "@/components/settings/export-data";
import { FormatsSection } from "@/components/settings/formats-section";
import { CategoriesSection } from "@/components/settings/categories-section";
import { HealthSection, NotificationsSection } from "@/components/health/health-section";
import { isDemoMode } from "@/lib/demo/mode";

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-8 sm:px-8 md:py-12">
      <h1 className="ios-large-title">Settings</h1>
      {/* Health first: it answers "can I trust these numbers?" (#14). */}
      <HealthSection />
      <NotificationsSection />
      <CategoriesSection />
      <FormatsSection />
      {/* The demo has no real account: a password change or account deletion would do nothing and an export would be fake data. */}
      {!isDemoMode() && (
        <div className="space-y-10">
          <div className="space-y-4">
            <ChangePasswordForm />
            <TwoFactorSection />
          </div>
          <div className="space-y-4">
            <ExportData />
            <DeleteAccount />
          </div>
        </div>
      )}
    </div>
  );
}
