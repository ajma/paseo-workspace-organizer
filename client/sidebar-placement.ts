// Paseo loads a copy of the plugin per host that has it, all in this window, and shows the first copy's sidebar
// whatever its host. The copies share this record on globalThis (which hosts run, which is picked) and each applies
// sidebarHostFor, so exactly one adds the sidebar. If copies don't share globalThis, each decides alone, as before.
import { useSyncExternalStore } from "react";
import { sidebarHostFor } from "../shared/sidebar-placement";

const REGISTRY_KEY = "__workspaceOrganizerCopies";
// Long enough for this computer's daemon to report its host before another host's copy steps in.
export const LOCAL_COPY_WAIT_MS = 2000;

type Registry = {
  copies: Map<symbol, string | null>; chosen: string | null | undefined; waited: boolean; timer?: ReturnType<typeof setTimeout>;
  listeners: Set<() => void>; version: number; snapshot?: { version: number; running: string[]; chosen: string | null };
};

function registry(): Registry {
  const existing = Reflect.get(globalThis, REGISTRY_KEY) as Registry | undefined;
  if (existing) return existing;
  const created: Registry = { copies: new Map(), chosen: undefined, waited: false, listeners: new Set(), version: 0 };
  Reflect.set(globalThis, REGISTRY_KEY, created);
  return created;
}
function changed(state: Registry) { state.version++; state.listeners.forEach((listener) => listener()); }

export function runningHosts(): Set<string> {
  return new Set([...registry().copies.values()].filter((id): id is string => id !== null));
}

// The host picked on this device (null: this computer's). Every copy moves its sidebar accordingly.
export function chooseSidebarHost(hostId: string | null) {
  const state = registry();
  if (state.chosen === hostId) return;
  state.chosen = hostId;
  changed(state);
}

// For the ⋯ menu: the hosts whose copies run, and the pick.
export function useSidebarHosts(): { running: string[]; chosen: string | null } {
  const state = registry();
  return useSyncExternalStore((listener) => { state.listeners.add(listener); return () => { state.listeners.delete(listener); }; }, () => {
    if (state.snapshot?.version !== state.version) state.snapshot = { version: state.version, running: [...runningHosts()].sort(), chosen: state.chosen ?? null };
    return state.snapshot;
  });
}

export function placeSidebar({ hostId, subscribe, localHosts, initialChoice, add, waitMs = LOCAL_COPY_WAIT_MS }: {
  hostId: () => string | null; subscribe: (listener: () => void) => () => void; localHosts: ReadonlySet<string>;
  // The pick saved on this device, read before any sidebar has drawn.
  initialChoice: string | null; add: () => () => void; waitMs?: number;
}): () => void {
  const state = registry();
  if (state.chosen === undefined) state.chosen = initialChoice;
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
  const state = Reflect.get(globalThis, REGISTRY_KEY) as Registry | undefined;
  if (state?.timer) clearTimeout(state.timer);
  Reflect.deleteProperty(globalThis, REGISTRY_KEY);
}
