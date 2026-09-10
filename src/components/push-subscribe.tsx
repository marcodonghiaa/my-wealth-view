import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, BellOff } from "lucide-react";
import { getSupabase, isDemoRoute } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY =
  "BIthbr3RMWAWQn-NihzYuqyX5KV15WTTTleWj2fW_q4AgiC294nCkioyipSDk5fc7ZStbNjmVoGsSJEpkaMkVd8";

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's own flag, not in the standard lib.dom types
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// Only renders once installed to the home screen and notifications are supported --
// iOS Safari silently refuses permission requests from a regular browser tab.
export function PushSubscribeButton() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  // Tracks an actual saved subscription, not just OS-level permission -- granting
  // permission can still be followed by a failed subscribe/insert, and permission
  // alone would then wrongly keep showing "enabled" with no way to retry.
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ok = isStandalone() && "serviceWorker" in navigator && "PushManager" in window;
    setSupported(ok);
    if ("Notification" in window) setPermission(Notification.permission);
    if (!ok) return;
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      const existing = await reg?.pushManager.getSubscription();
      if (existing) setSubscribed(true);
    });
  }, []);

  if (!supported || isDemoRoute()) return null;

  async function subscribe() {
    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        toast.error("Notification permission denied");
        return;
      }

      await navigator.serviceWorker.register("/sw.js");
      // register() can resolve before the worker is actually active -- pushManager.subscribe
      // needs an active worker, so wait for the ready promise rather than the raw registration.
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const supabase = getSupabase();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw userError ?? new Error("Not signed in");

      const json = subscription.toJSON();
      const { error } = await supabase.from("push_subscriptions" as never).insert({
        user_id: userData.user.id,
        endpoint: json.endpoint,
        p256dh: json.keys?.["p256dh"],
        auth: json.keys?.["auth"],
      } as never);
      if (error) throw error;

      setSubscribed(true);
      toast.success("Purchase check-ins enabled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't enable check-ins");
    } finally {
      setBusy(false);
    }
  }

  if (subscribed) {
    return (
      <div className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground">
        <Bell className="size-4" />
        Check-ins enabled
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={subscribe}
      disabled={busy}
      className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:opacity-50"
    >
      {permission === "denied" ? (
        <BellOff className="size-4" />
      ) : (
        <Bell className="size-4" />
      )}
      {permission === "denied"
        ? "Notifications blocked"
        : busy
          ? "Enabling…"
          : "Enable purchase check-ins"}
    </button>
  );
}
