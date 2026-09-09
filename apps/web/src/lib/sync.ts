import { fetchSchedule } from "./api";
import { itemsFromSchedule } from "./import";
import { store } from "./store";

/**
 * Mirror this device's state to the server, keyed by its push subscription.
 * Nothing is sent until the user turns notifications on; after that every
 * change and every app open re-sends the whole (tiny) state — simpler and more
 * robust than diffs, and idempotent on the server side.
 */

const PUSH_KEY = "sopkoll:push";

export interface PushKeys {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function savedSubscription(): PushKeys | null {
  try {
    const raw = localStorage.getItem(PUSH_KEY);
    return raw ? (JSON.parse(raw) as PushKeys) : null;
  } catch {
    return null;
  }
}

export function rememberSubscription(sub: PushKeys | null) {
  try {
    if (sub) localStorage.setItem(PUSH_KEY, JSON.stringify(sub));
    else localStorage.removeItem(PUSH_KEY);
  } catch {
    // ignore
  }
}

export async function pushDevice(sub: PushKeys): Promise<void> {
  const { settings, items } = store.get();
  const res = await fetch("/api/devices", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subscription: sub,
      userAgent: navigator.userAgent,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      settings,
      items,
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
}

export async function deleteDevice(endpoint: string): Promise<void> {
  await fetch("/api/devices", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

export async function sendTest(endpoint: string): Promise<void> {
  const res = await fetch("/api/devices/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
}

export async function fetchVapidKey(): Promise<string | null> {
  try {
    const res = await fetch("/api/push/vapid");
    if (!res.ok) return null;
    const { publicKey } = (await res.json()) as { publicKey?: string };
    return publicKey || null;
  } catch {
    return null;
  }
}

/** Start mirroring: once now, then debounced on every store change. */
export function startSync() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    const sub = savedSubscription();
    if (!sub) return;
    pushDevice(sub).catch(() => {
      // Offline or server down: the next change or app open retries.
    });
  };
  flush();
  return store.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(flush, 800);
  });
}

const REFRESH_KEY = "sopkoll:refreshed";
const REFRESH_MAX_AGE_MS = 6 * 3600 * 1000;

/**
 * Re-anchor SVOA items on app open when the last refresh is older than six
 * hours. SVOA only publishes the next date; holidays move it, and this is how
 * the phone finds out. The server does the same nightly for closed phones.
 */
export async function refreshScheduleIfStale(): Promise<void> {
  const { settings, items } = store.get();
  if (!settings.address || !items.some((i) => i.source === "svoa")) return;
  try {
    const last = Number(localStorage.getItem(REFRESH_KEY) ?? 0);
    if (Date.now() - last < REFRESH_MAX_AGE_MS) return;
  } catch {
    // fall through and refresh
  }
  try {
    const pickups = await fetchSchedule(settings.address);
    if (pickups.length > 0) {
      store.replaceSvoaItems(settings.address, itemsFromSchedule(settings.address, pickups, items));
    }
    localStorage.setItem(REFRESH_KEY, String(Date.now()));
  } catch {
    // Offline: the stored dates and the interval carry us until next time.
  }
}
