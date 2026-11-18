// The app session's back/forward history of opened workspaces. It lives outside the sidebar so it survives the sidebar
// remounting. While the sidebar is shown it records every way a workspace gets opened (the sidebar, ⌘K, Paseo itself).
import type { WorkspaceRef } from "@getpaseo/plugin/client";
import { useEffect, useSyncExternalStore } from "react";
import { emptyHistory, step, visit, type History } from "../shared/history";

let history: History<WorkspaceRef> = emptyHistory();
const listeners = new Set<() => void>();
const set = (next: History<WorkspaceRef>) => { history = next; for (const listener of listeners) listener(); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export function resetWorkspaceHistory() { history = emptyHistory(); }

export function useWorkspaceHistory(active: WorkspaceRef | null, open: (workspace: WorkspaceRef) => void, exists: (key: string) => boolean) {
  const current = useSyncExternalStore(subscribe, () => history, () => history);
  // Back and Forward move the current entry before opening it, so arriving there is no visit (visit ignores the entry
  // already current); any other workspace that opens is a new visit.
  useEffect(() => { if (active) set(visit(history, active)); }, [active?.key]);
  // Off any workspace (New workspace, settings), Back returns to the workspace you left.
  const onWorkspace = active !== null;
  const target = (direction: -1 | 1) => step(current, direction, (entry) => exists(entry.key), { onWorkspace });
  const go = (direction: -1 | 1) => {
    const next = step(history, direction, (entry) => exists(entry.key), { onWorkspace });
    if (!next) return;
    set(next.history);
    open(next.entry);
  };
  return { back: target(-1)?.entry ?? null, forward: target(1)?.entry ?? null, goBack: () => go(-1), goForward: () => go(1) };
}
