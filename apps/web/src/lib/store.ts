import { useSyncExternalStore } from "react";
import { DEFAULT_SETTINGS, type Item, type Settings } from "./model";

/**
 * localStorage is the device's source of truth. There is no account: when the
 * user enables push, this same state is mirrored to the server keyed by the
 * push subscription, and re-mirrored on every change. Until then the app is
 * fully usable offline from this store alone.
 */

const KEY = "sopkoll:v1";

export interface State {
  settings: Settings;
  items: Item[];
  /** Set once the welcome flow has been seen or skipped. */
  onboarded: boolean;
}

const EMPTY: State = { settings: DEFAULT_SETTINGS, items: [], onboarded: false };

let state: State = load();
const listeners = new Set<() => void>();

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<State>;
    return {
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      items: Array.isArray(parsed.items) ? parsed.items : [],
      onboarded: Boolean(parsed.onboarded),
    };
  } catch {
    return EMPTY;
  }
}

function commit(next: State) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or full storage: keep the in-memory copy going.
  }
  for (const l of listeners) l();
}

export const store = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  setSettings(patch: Partial<Settings>) {
    commit({ ...state, settings: { ...state.settings, ...patch } });
  },
  upsertItem(item: Item) {
    const idx = state.items.findIndex((i) => i.id === item.id);
    const items = idx === -1 ? [...state.items, item] : state.items.with(idx, item);
    commit({ ...state, items, onboarded: true });
  },
  /** Replace all SVOA items for an address with a fresh import. */
  replaceSvoaItems(address: string, fresh: Item[]) {
    const kept = state.items.filter((i) => !(i.source === "svoa" && i.address === address));
    commit({
      ...state,
      items: [...kept, ...fresh],
      settings: { ...state.settings, address },
      onboarded: true,
    });
  },
  removeItem(id: string) {
    commit({ ...state, items: state.items.filter((i) => i.id !== id) });
  },
  setOnboarded() {
    commit({ ...state, onboarded: true });
  },
  wipe() {
    commit(EMPTY);
  },
};

export function useStore(): State {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
