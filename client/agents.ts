import { getPaseoClient, useAgents, type AgentRef, type WorkspaceRef } from "@getpaseo/plugin/client";
import { useEffect, useSyncExternalStore } from "react";
import { buildProviderCatalog, type ProviderCatalog, type ProviderSnapshot } from "../shared/agent-labels";

// One provider snapshot per host, refreshed when that host reports provider changes.
const catalogs = new Map<string, ProviderCatalog | null>();
const loading = new Map<string, () => void>();
const listeners = new Set<() => void>();
let version = 0;
const notify = () => { version++; listeners.forEach((listener) => listener()); };
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
  useSyncExternalStore(subscribe, () => version);
  useEffect(() => load(hostId), [hostId]);
  return catalogs.get(hostId) ?? null;
}

export function disposeProviderCatalogs() {
  for (const unsubscribe of loading.values()) unsubscribe();
  loading.clear(); catalogs.clear(); notify();
}

// The workspace's most recently active top-level agent, and its subagents by state.
export function useWorkspaceAgents(workspace: WorkspaceRef): { main: AgentRef | null; running: number; done: number; failed: number } {
  const main = useAgents({
    where: (agent) => agent.workspace.key === workspace.key && !agent.background && !agent.parentAgentId,
    orderBy: ["lastActivityAt", "desc"],
  })[0] ?? null;
  const subtasks = useAgents({
    where: (agent) => agent.workspace.key === workspace.key && !agent.background && Boolean(agent.parentAgentId),
    groupBy: (agent) => agent.status === "running" || agent.status === "initializing" ? "running" : agent.status === "error" ? "failed" : "done",
  });
  const count = (key: string) => subtasks.find((group) => group.key === key)?.items.length ?? 0;
  return { main, running: count("running"), done: count("done"), failed: count("failed") };
}
