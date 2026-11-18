// Paseo binds ⌘[ / ⌘] on macOS to Previous and Next workspace. The sidebar can use them for back and forward once
// those bindings are cleared, which this does the way Paseo's own Settings → Shortcuts does. Paseo keeps shortcut
// changes in app storage, loaded into a react-query cache; neither is a published plugin API, so this stays small,
// only writes when the user flips the setting, and falls back to storage alone without the cache.
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { isMacPlatform } from "./web";

const STORAGE_KEY = "@paseo:keyboard-shortcut-overrides";
const QUERY_KEY = ["keyboard-shortcut-overrides"];
const BINDINGS = ["workspace-navigate-relative-cmd-left-mac", "workspace-navigate-relative-cmd-right-mac"] as const;
type Overrides = Record<string, string | null>;
type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void };

const storage = () => Reflect.get(globalThis, "localStorage") as StorageLike | undefined;
const listeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) listener(); };

function stored(): Overrides {
  try {
    const parsed: unknown = JSON.parse(storage()?.getItem(STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Overrides : {};
  } catch { return {}; }
}
const current = (client: QueryClient | null) => client?.getQueryData<Overrides>(QUERY_KEY) ?? stored();
// Cleared bindings are stored as null; an absent entry means Paseo's default.
const freedIn = (overrides: Overrides) => BINDINGS.every((id) => overrides[id] === null);

function useOptionalQueryClient(): QueryClient | null {
  try { return useQueryClient(); } catch { return null; }
}

export function useBracketShortcuts() {
  const client = useOptionalQueryClient();
  const available = Platform.OS === "web" && isMacPlatform() && Boolean(storage());
  useEffect(() => client?.getQueryCache().subscribe(notify), [client]);
  const freed = useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => available && freedIn(current(client)), () => false);
  return {
    available,
    freed,
    // On clears Paseo's two bindings; off removes the change, restoring its defaults. Other shortcut changes stay.
    setFreed(free: boolean) {
      if (!available) return;
      const next = { ...current(client) };
      for (const id of BINDINGS) { if (free) next[id] = null; else delete next[id]; }
      try { storage()?.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { return; }
      client?.setQueryData(QUERY_KEY, next);
      notify();
    },
  };
}
