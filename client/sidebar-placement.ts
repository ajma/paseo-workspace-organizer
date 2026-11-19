// Paseo loads a copy of the plugin per host that has it, all in this window, and shows the first copy's sidebar
// whatever its host. The copies share this record on globalThis (which hosts run, which is picked) and each applies
// sidebarHostFor, so exactly one adds the sidebar. If copies don't share globalThis, each decides alone, as before.
import { useSyncExternalStore } from "react";
import { sidebarHostFor } from "../shared/sidebar-placement";

// Versioned, and checked before use: copies on different hosts may run different versions of the plugin, and a
// window keeps globalThis across plugin reloads, so a record in another shape may already be here.
const REGISTRY_KEY = "__workspaceOrganizerCopies.v2";
// Long enough for this computer's daemon to report its host before another host's copy steps in.
export const LOCAL_COPY_WAIT_MS = 2000;

type Registry = {
  copies: Map<symbol, string | null>; chosen: string | null | undefined; waited: boolean; timer?: ReturnType<typeof setTimeout>;
  listeners: Set<() => void>; version: number; snapshot?: { version: number; running: string[]; chosen: string | null };
};

function registry(): Registry {
  const existing = Reflect.get(globalThis, REGISTRY_KEY) as Partial<Registry> | undefined;
  if (existing && existing.copies instanceof Map && existing.listeners instanceof Set && typeof existing.version === "number") return existing as Registry;
  const created: Registry = { copies: new Map(), chosen: undefined, waited: false, listeners: new Set(), version: 0 };
  Reflect.set(globalThis, REGISTRY_KEY, created);
  return created;
}
function changed(state: Registry) { state.version++; state.listeners.forEach((listener) => listener()); }

export function runningHosts(): Set<string> {
  try { return new Set([...registry().copies.values()].filter((id): id is string => id !== null)); } catch { return new Set(); }
}

// The host picked on this device (null: this computer's). Every copy moves its sidebar accordingly.
export function chooseSidebarHost(hostId: string | null) {
  try {
    const state = registry();
    if (state.chosen === hostId) return;
    state.chosen = hostId;
    changed(state);
  } catch { /* Without the shared record there's nothing to coordinate. */ }
}

// A drawn sidebar's saved pick, for when none was known at startup (a phone, which can't read it early). It never
// overrides a pick already made: a sidebar that just took over may still be reading the value from before the switch.
export function initializeSidebarHost(hostId: string | null) {
  try {
    const state = registry();
    if (state.chosen !== undefined) return;
    state.chosen = hostId;
    changed(state);
  } catch { /* Without the shared record there's nothing to coordinate. */ }
}

// For the ⋯ menu: the hosts whose copies run, and the pick.
const NO_HOSTS = { running: [] as string[], chosen: null };
export function useSidebarHosts(): { running: string[]; chosen: string | null } {
  let state: Registry | null = null;
  try { state = registry(); } catch { /* The menu then offers no choice. */ }
  return useSyncExternalStore((listener) => { state?.listeners.add(listener); return () => { state?.listeners.delete(listener); }; }, () => {
    if (!state) return NO_HOSTS;
    if (state.snapshot?.version !== state.version) state.snapshot = { version: state.version, running: [...runningHosts()].sort(), chosen: state.chosen ?? null };
    return state.snapshot;
  });
}

export function placeSidebar({ hostId, subscribe, localHosts, initialChoice, add, waitMs = LOCAL_COPY_WAIT_MS }: {
  hostId: () => string | null; subscribe: (listener: () => void) => () => void; localHosts: ReadonlySet<string>;
  // The pick saved on this device, read before any sidebar has drawn.
  initialChoice: string | null; add: () => () => void; waitMs?: number;
}): () => void {
  // Coordinating is a nicety: if it fails, offer the sidebar as before rather than stop the plugin from starting.
  let state: Registry;
  try { state = registry(); } catch { return add(); }
  // Unread or unset leaves the pick unknown, so the first drawn sidebar can supply it.
  if (state.chosen === undefined && initialChoice !== null) state.chosen = initialChoice;
  if (!state.timer && !state.waited) state.timer = setTimeout(() => { state.waited = true; changed(state); }, waitMs);
  const me = Symbol("copy");
  state.copies.set(me, null);
  let remove: (() => void) | null = null, stopped = false;
  const update = () => {
    if (stopped) return;
    const id = hostId();
    if (state.copies.get(me) !== id) { state.copies.set(me, id); changed(state); return; }
    const host = sidebarHostFor({ chosen: state.chosen ?? null, localHosts, running: runningHosts(), waited: state.waited });
    const show = id !== null && id === host;
    if (show && !remove) remove = add();
    if (!show && remove) { remove(); remove = null; }
  };
  state.listeners.add(update);
  const unsubscribe = subscribe(update);
  update();
  return () => {
    stopped = true;
    unsubscribe();
    state.listeners.delete(update);
    remove?.(); remove = null;
    state.copies.delete(me);
    changed(state);
  };
}

// Tests start each case with no copies.
export function resetCopies() {
  try {
    const state = Reflect.get(globalThis, REGISTRY_KEY) as Registry | undefined;
    if (state?.timer) clearTimeout(state.timer);
  } catch { /* A broken record is simply removed. */ }
  Reflect.deleteProperty(globalThis, REGISTRY_KEY);
}
