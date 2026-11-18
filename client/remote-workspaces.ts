// Follows the workspace list of every other connected host, so cards there show Paseo's detected PR and git status
// even when this plugin is installed only on one host.
import type { PaseoWorkspace } from "@getpaseo/client";
import { getPaseoClient } from "@getpaseo/plugin/client";
import { useEffect, useSyncExternalStore } from "react";

export function createRemoteWorkspaces(connect: (hostId: string) => ReturnType<typeof getPaseoClient> = getPaseoClient) {
  const hosts = new Map<string, { workspaces: Map<string, PaseoWorkspace>; stop: () => void }>();
  const listeners = new Set<() => void>();
  let version = 0, disposed = false;
  const notify = () => { version++; listeners.forEach((listener) => listener()); };
  function watch(hostId: string) {
    const state = { workspaces: new Map<string, PaseoWorkspace>(), stop: () => {} };
    hosts.set(hostId, state);
    let paseo: ReturnType<typeof getPaseoClient>;
    try { paseo = connect(hostId); } catch { hosts.delete(hostId); return; }
    void paseo.workspaces.list({ subscribe: {}, page: { limit: 200 } }).then((result) => {
      if (disposed || hosts.get(hostId) !== state) { void result.subscription.release(); return; }
      const unobserve = result.subscription.subscribe({
        snapshot: ({ entries }) => { state.workspaces = new Map(entries.map((workspace) => [workspace.id, workspace])); notify(); },
        update: (message) => {
          if (message.type !== "workspace_update") return;
          if (message.payload.kind === "upsert") state.workspaces.set(message.payload.workspace.id, message.payload.workspace);
          else state.workspaces.delete(message.payload.id);
          notify();
        },
        // A dropped host is watched again the next time it is listed as online.
        error: () => { if (hosts.get(hostId) === state) { state.stop(); hosts.delete(hostId); notify(); } },
      });
      state.stop = () => { unobserve(); void result.subscription.release(); };
    }, () => { if (hosts.get(hostId) === state) hosts.delete(hostId); });
  }
  return {
    // Watch exactly these hosts.
    sync(hostIds: readonly string[]) {
      if (disposed) return;
      for (const [hostId, state] of hosts) if (!hostIds.includes(hostId)) { state.stop(); hosts.delete(hostId); }
      for (const hostId of hostIds) if (!hosts.has(hostId)) watch(hostId);
    },
    get: (hostId: string, workspaceId: string) => hosts.get(hostId)?.workspaces.get(workspaceId),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getVersion: () => version,
    dispose() { disposed = true; for (const state of hosts.values()) state.stop(); hosts.clear(); listeners.clear(); },
  };
}
export type RemoteWorkspaces = ReturnType<typeof createRemoteWorkspaces>;

const none = () => () => {};
const zero = () => 0;
export function useRemoteWorkspaces(store: RemoteWorkspaces | undefined, hostIds: readonly string[]) {
  useSyncExternalStore(store?.subscribe ?? none, store?.getVersion ?? zero);
  const key = [...hostIds].sort().join(",");
  useEffect(() => { store?.sync(key ? key.split(",") : []); }, [store, key]);
  return store;
}
