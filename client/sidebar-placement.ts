// Coordinates the plugin's copies (one per host that has it, all in this window) so the local host's copy owns the
// sidebar view. They meet in a registry on globalThis; if copies don't share it, each offers its view as before.
import { showsSidebar } from "../shared/sidebar-placement";

const REGISTRY_KEY = "__workspaceOrganizerCopies";
// Long enough for the local daemon to report its host before another host's copy steps in.
export const LOCAL_COPY_WAIT_MS = 2000;

type Registry = { local: Set<symbol>; listeners: Set<() => void> };
function registry(): Registry {
  const existing = Reflect.get(globalThis, REGISTRY_KEY) as Registry | undefined;
  if (existing) return existing;
  const created: Registry = { local: new Set(), listeners: new Set() };
  Reflect.set(globalThis, REGISTRY_KEY, created);
  return created;
}

export function placeSidebar({ hostId, subscribe, localHosts, add, waitMs = LOCAL_COPY_WAIT_MS }: {
  hostId: () => string | null; subscribe: (listener: () => void) => () => void; localHosts: ReadonlySet<string>;
  add: () => () => void; waitMs?: number;
}): () => void {
  const copies = registry();
  const me = Symbol("copy");
  let remove: (() => void) | null = null, waited = false, stopped = false;
  const update = () => {
    if (stopped) return;
    const id = hostId();
    const isLocal = id !== null && localHosts.has(id);
    if (isLocal && !copies.local.has(me)) { copies.local.add(me); copies.listeners.forEach((listener) => { if (listener !== update) listener(); }); }
    const others = [...copies.local].some((copy) => copy !== me);
    const show = showsSidebar({ hostId: id, localHosts, localCopyRunning: isLocal || others, waited });
    if (show && !remove) remove = add();
    if (!show && remove) { remove(); remove = null; }
  };
  copies.listeners.add(update);
  const unsubscribe = subscribe(update);
  const timer = setTimeout(() => { waited = true; update(); }, waitMs);
  update();
  return () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribe();
    copies.listeners.delete(update);
    remove?.(); remove = null;
    // Another host's copy takes over once this local one is gone.
    if (copies.local.delete(me)) copies.listeners.forEach((listener) => listener());
  };
}
