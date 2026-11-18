import type { PluginClientContext } from "@getpaseo/plugin/client";
import { useSyncExternalStore } from "react";
import { emptyDetails, mergeLinks, searchTerms, workspaceKey } from "../shared/organization";
import { workspaceIndex, type IndexEvent } from "../shared/workspace-index";

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000, 30000];
const RETRIES_BEFORE_ERROR = 3;

export function createWorkspaceIndex(client: PluginClientContext) {
  let snapshot: IndexEvent | null = null;
  let error: string | null = null;
  const listeners = new Set<() => void>();
  const commands = new Map<string, { signature: string; remove: () => void | Promise<void> }>();
  const notify = () => listeners.forEach((listener) => listener());
  const clear = () => { for (const item of commands.values()) void item.remove(); commands.clear(); };
  // A daemon or plugin restart closes the connection, and it usually comes back within seconds, so reconnect quietly
  // with growing waits and only name the failure once several tries in a row have failed.
  let subscription: (() => void) | null = null, timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0, disposed = false;
  const onEvent = (event: IndexEvent) => {
    failures = 0;
    snapshot = event;
    error = event.error;
    const current = new Set<string>();
    if (event.organization) for (const entry of event.entries) {
      const details = event.organization.workspaces[workspaceKey(event.hostId, entry.id)] ?? emptyDetails();
      const links = mergeLinks(entry.links, details.links);
      const group = event.organization.groups.find((item) => item.id === details.groupId);
      const keywords = searchTerms(entry.name, entry.branch, entry.labels, details, links, group ? [group.name] : []);
      const title = `Open ${entry.name}${links.length ? ` · ${links.map((link) => `${link.kind === "pr" ? "PR" : "Issue"} #${link.number}`).join(" · ")}` : ""}`;
      const signature = JSON.stringify([title, keywords]);
      current.add(entry.id);
      if (commands.get(entry.id)?.signature === signature) continue;
      void commands.get(entry.id)?.remove();
      // Hex encoding preserves uniqueness while satisfying Paseo's command ID syntax.
      const id = `workspace-${Array.from(entry.id).map((letter) => letter.codePointAt(0)!.toString(16)).join("-")}`;
      commands.set(entry.id, { signature, remove: client.addCommandCenterItem({
        id, title, keywords, context: "global", icon: "PanelsTopLeft",
        onSelect: ({ openScreen }) => openScreen({ screenId: "jump", params: { workspaceId: entry.id, serverId: event.hostId } }),
      }) });
    }
    for (const [id, item] of commands) if (!current.has(id)) { void item.remove(); commands.delete(id); }
    notify();
  };
  function connect() {
    if (disposed) return;
    let ended = false;
    const end = (failure: unknown) => {
      if (ended || disposed) return;
      ended = true; subscription = null; failures++;
      if (failures >= RETRIES_BEFORE_ERROR) {
        const message = failure instanceof Error ? failure.message : failure ? String(failure) : "Workspace index connection closed";
        error = `${message.replace(/\.$/, "")}. Retrying…`;
        notify();
      }
      timer = setTimeout(connect, RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length) - 1]);
    };
    const handle = client.subscribe(workspaceIndex, {}, onEvent, { onClosed: ({ error: failure }) => end(failure) });
    subscription = handle;
    void handle.ready.catch(end);
  }
  connect();
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    getError: () => error,
    dispose: () => { disposed = true; if (timer !== undefined) clearTimeout(timer); subscription?.(); clear(); listeners.clear(); },
  };
}
export type WorkspaceIndex = ReturnType<typeof createWorkspaceIndex>;
export function useWorkspaceIndex(index: WorkspaceIndex) {
  useSyncExternalStore(index.subscribe, index.getError, index.getError);
  return useSyncExternalStore(index.subscribe, index.getSnapshot, index.getSnapshot);
}
