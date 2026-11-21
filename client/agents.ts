import { getPaseoClient, useAgents, type AgentRef } from "@getpaseo/plugin/client";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { buildProviderCatalog, type ProviderCatalog, type ProviderSnapshot } from "../shared/agent-labels";

// One provider snapshot per host, refreshed when that host reports provider changes.
const catalogs = new Map<string, ProviderCatalog | null>();
const loading = new Map<string, () => void>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

function load(hostId: string) {
  if (loading.has(hostId)) return;
  let paseo: ReturnType<typeof getPaseoClient>;
  try { paseo = getPaseoClient(hostId); } catch { return; }
  const fetch = () => void paseo.providers.snapshot().then(
    (snapshot) => { catalogs.set(hostId, buildProviderCatalog(snapshot as ProviderSnapshot)); notify(); },
    () => { if (!catalogs.has(hostId)) { catalogs.set(hostId, null); notify(); } });
  let unsubscribe = () => {};
  try { unsubscribe = paseo.providers.subscribe(fetch); } catch { /* Snapshot only. */ }
  loading.set(hostId, unsubscribe);
  fetch();
}

export function useProviderCatalog(hostId: string): ProviderCatalog | null {
  useEffect(() => load(hostId), [hostId]);
  return useSyncExternalStore(subscribe, () => catalogs.get(hostId) ?? null);
}

export function disposeProviderCatalogs() {
  for (const unsubscribe of loading.values()) unsubscribe();
  loading.clear(); catalogs.clear(); notify();
}

type SubtaskState = "running" | "done" | "failed";
export type WorkspaceAgents = { main: AgentRef | null } & Record<SubtaskState, number>;
export const noWorkspaceAgents: WorkspaceAgents = { main: null, running: 0, done: 0, failed: 0 };

// Both queries scan the host's entire agent collection. Group by workspace once for the whole sidebar.
export function useAgentsByWorkspace() {
  const main = useAgents({
    where: (agent) => !agent.background && !agent.parentAgentId,
    orderBy: ["lastActivityAt", "desc"],
    groupBy: (agent) => agent.workspace.key,
  });
  const subtasks = useAgents({
    where: (agent) => !agent.background && Boolean(agent.parentAgentId),
    groupBy: (agent) => JSON.stringify([agent.workspace.key,
      agent.status === "running" || agent.status === "initializing" ? "running" : agent.status === "error" ? "failed" : "done"]),
  });
  return useMemo(() => {
    const summaries = new Map<string, WorkspaceAgents>(main.map((group) => [group.key, { ...noWorkspaceAgents, main: group.items[0] ?? null }]));
    for (const group of subtasks) {
      const [key, state] = JSON.parse(group.key) as [string, SubtaskState];
      const summary = summaries.get(key) ?? { ...noWorkspaceAgents };
      summary[state] = group.items.length;
      summaries.set(key, summary);
    }
    return summaries;
  }, [main, subtasks]);
}
