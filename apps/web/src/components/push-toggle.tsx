import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import {
  deleteDevice,
  fetchVapidKey,
  pushDevice,
  rememberSubscription,
  sendTest,
} from "@/lib/sync";

type PushState =
  | { phase: "loading" }
  | { phase: "unsupported"; reason: string }
  | { phase: "idle" }
  | { phase: "subscribed"; endpoint: string }
  | { phase: "working" };

export function PushToggle() {
  const [state, setState] = useState<PushState>({ phase: "loading" });
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        // iOS Safari only exposes push once the site runs as an installed
        // home-screen app — the most common reason to land here on a phone.
        const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
        const standalone = window.matchMedia("(display-mode: standalone)").matches;
        setState({
          phase: "unsupported",
          reason: isIos && !standalone ? t.push.iosHint : t.push.unsupported,
        });
        return;
      }
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        const subscription = await registration.pushManager.getSubscription();
        if (!cancelled) {
          setState(
            subscription
              ? { phase: "subscribed", endpoint: subscription.endpoint }
              : { phase: "idle" },
          );
        }
      } catch {
        if (!cancelled) setState({ phase: "unsupported", reason: t.push.unsupported });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setState({ phase: "working" });
    setMessage(null);
    try {
      const key = await fetchVapidKey();
      if (!key) throw new Error(t.push.notConfigured);
      // Must be called from the tap handler — iOS refuses permission prompts
      // that aren't triggered by a user gesture.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState({ phase: "idle" });
        setMessage({ text: t.push.permissionDenied, isError: true });
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const json = subscription.toJSON();
      if (!json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Subscription is missing encryption keys.");
      }
      const sub = {
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      };
      await pushDevice(sub);
      rememberSubscription(sub);
      setState({ phase: "subscribed", endpoint: sub.endpoint });
      setMessage({ text: t.push.on, isError: false });
    } catch (err) {
      setState({ phase: "idle" });
      setMessage({
        text: t.push.failed(err instanceof Error ? err.message : String(err)),
        isError: true,
      });
    }
  }

  async function disable() {
    setState({ phase: "working" });
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        await deleteDevice(subscription.endpoint);
      }
      rememberSubscription(null);
      setState({ phase: "idle" });
    } catch (err) {
      setState({ phase: "idle" });
      setMessage({
        text: t.push.failed(err instanceof Error ? err.message : String(err)),
        isError: true,
      });
    }
  }

  async function test(endpoint: string) {
    setMessage(null);
    try {
      await sendTest(endpoint);
      setMessage({ text: t.push.testSent, isError: false });
    } catch (err) {
      setMessage({
        text: t.push.failed(err instanceof Error ? err.message : String(err)),
        isError: true,
      });
    }
  }

  if (state.phase === "loading") {
    return <p className="text-sm text-muted-foreground">{t.push.checking}</p>;
  }
  if (state.phase === "unsupported") {
    return <p className="max-w-prose text-sm text-muted-foreground">{state.reason}</p>;
  }

  const subscribed = state.phase === "subscribed";
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{subscribed ? t.push.on : t.push.off}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant={subscribed ? "outline" : "default"}
          onClick={subscribed ? disable : enable}
          disabled={state.phase === "working"}
        >
          {state.phase === "working" ? t.push.working : subscribed ? t.push.disable : t.push.enable}
        </Button>
        {state.phase === "subscribed" ? (
          <Button type="button" variant="secondary" onClick={() => test(state.endpoint)}>
            {t.push.test}
          </Button>
        ) : null}
      </div>
      {message ? (
        <span
          role="status"
          className={
            message.isError ? "text-sm text-destructive" : "text-sm font-medium text-primary"
          }
        >
          {message.text}
        </span>
      ) : null}
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
