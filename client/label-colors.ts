import type { PluginClientContext } from "@getpaseo/plugin/client";
import { useEffect, useSyncExternalStore } from "react";
import type { IdentityColor } from "../shared/identity-colors";
import { labelColors } from "../shared/label-colors";

// Label colors from the installation's host, read once and again whenever a surface asks for a refresh.
export function createLabelColorStore(client: Pick<PluginClientContext, "rpc">) {
  let labels: { name: string; color: IdentityColor }[] = [];
  let version = 0, disposed = false, inFlight = false;
  const listeners = new Set<() => void>();
  return {
    refresh() {
      if (disposed || inFlight) return;
      inFlight = true;
      client.rpc(labelColors, {}).then((result) => { labels = result.labels; }, () => {}).finally(() => {
        inFlight = false;
        if (!disposed) { version++; listeners.forEach((listener) => listener()); }
      });
    },
    get: () => labels,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getVersion: () => version,
    dispose() { disposed = true; listeners.clear(); },
  };
}
export type LabelColorStore = ReturnType<typeof createLabelColorStore>;

const none = () => () => {};
const zero = () => 0;
export function useLabelColors(store?: LabelColorStore) {
  useSyncExternalStore(store?.subscribe ?? none, store?.getVersion ?? zero);
  useEffect(() => { store?.refresh(); }, [store]);
  return store?.get() ?? [];
}
