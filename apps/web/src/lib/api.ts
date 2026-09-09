/**
 * The backend proxies Stockholm Vatten och Avfall (their endpoints have no
 * CORS) and, later, holds push subscriptions. Same-origin `/api` everywhere:
 * Vite proxies it in dev, CloudFront routes it to the box in production.
 */

export interface AddressSuggestion {
  value: string;
  postcode: string;
}

export interface SvoaPickup {
  group: string;
  fetchFrequency: string;
  executionDate: string;
  weekday: string;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export function suggestAddresses(query: string, signal?: AbortSignal) {
  return getJson<AddressSuggestion[]>(
    `/api/address/suggest?q=${encodeURIComponent(query)}`,
    signal,
  );
}

export function fetchSchedule(address: string, signal?: AbortSignal) {
  return getJson<SvoaPickup[]>(
    `/api/address/schedule?address=${encodeURIComponent(address)}`,
    signal,
  );
}
