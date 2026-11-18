import { getPaseoClient, type WorkspaceRef } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef } from "react";
import { ARCHIVE_CONFIRM_MS } from "../shared/archive";
import { isMacPlatform, onArchiveShortcut } from "./web";

export { ARCHIVE_CONFIRM_MS };
type Notify = { show(message: string, options?: { variant?: "default" | "info" | "success" | "warning" | "error"; durationMs?: number }): void; error(message: string): void };

// Archives a workspace on its own host and reports the result; `onFailed` runs when it could not be archived.
export function archiveWorkspace(workspace: WorkspaceRef, notify: Notify, connect: typeof getPaseoClient = getPaseoClient, onFailed?: () => void) {
  let paseo: ReturnType<typeof getPaseoClient>;
  try { paseo = connect(workspace.hostId); } catch { notify.error("Host is not connected."); onFailed?.(); return; }
  paseo.workspaces.archive(workspace.id).then(
    () => notify.show("Workspace archived", { variant: "success" }),
    (error: unknown) => { notify.error(`Failed to archive workspace${error instanceof Error ? `: ${error.message}` : ""}`); onFailed?.(); },
  );
}

// A workspace's row can take over archiving it, to animate the row away first; otherwise it is archived directly.
const rowArchivers = new Map<string, () => void>();
export function useRowArchiver(key: string, archive: () => void) {
  const latest = useRef(archive);
  latest.current = archive;
  useEffect(() => {
    const run = () => latest.current();
    rowArchivers.set(key, run);
    return () => { if (rowArchivers.get(key) === run) rowArchivers.delete(key); };
  }, [key]);
}
export function requestArchive(workspace: WorkspaceRef, notify: Notify, connect: typeof getPaseoClient = getPaseoClient) {
  const row = rowArchivers.get(workspace.key);
  if (row) row(); else archiveWorkspace(workspace, notify, connect);
}

// Paseo's own sidebar handles its archive shortcut; this sidebar replaces it, so it handles the shortcut itself.
// Plugins cannot undo an archive, so the shortcut asks for a second press within a few seconds before archiving.
export function useArchiveShortcut(active: WorkspaceRef | null, connect: typeof getPaseoClient = getPaseoClient) {
  const toast = useToast();
  const latest = useRef({ active, toast, connect });
  latest.current = { active, toast, connect };
  const armed = useRef<{ key: string; at: number } | null>(null);
  useEffect(() => onArchiveShortcut(() => {
    const { active: workspace, toast: notify, connect: client } = latest.current;
    const combo = isMacPlatform() ? "⌘⇧⌫" : "Ctrl+Shift+Backspace";
    if (!workspace) { notify.show("Open a workspace to archive it."); return; }
    const pending = armed.current;
    if (!pending || pending.key !== workspace.key || Date.now() - pending.at > ARCHIVE_CONFIRM_MS) {
      armed.current = { key: workspace.key, at: Date.now() };
      notify.show(`Press ${combo} again to archive this workspace.`, { durationMs: ARCHIVE_CONFIRM_MS });
      return;
    }
    armed.current = null;
    requestArchive(workspace, notify, client);
  }), []);
}
