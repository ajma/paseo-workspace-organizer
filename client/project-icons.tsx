import { useProject, type PluginClientContext, type ProjectRef } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useEffect, useSyncExternalStore } from "react";
import { Image, Platform } from "react-native";
import { projectIcons, type ProjectIcon } from "../shared/project-icons";

// Caches icons from the installation's host by project and Paseo's icon revision, batching requests.
export function createProjectIconStore(client: Pick<PluginClientContext, "rpc">) {
  const icons = new Map<string, ProjectIcon | null>();
  const pending = new Set<string>();
  let queued = new Map<string, string>();
  const listeners = new Set<() => void>();
  let version = 0, disposed = false, timer: ReturnType<typeof setTimeout> | undefined;
  const keyOf = (projectId: string, revision: string | null) => JSON.stringify([projectId, revision]);
  const notify = () => { version++; listeners.forEach((listener) => listener()); };
  function flush() {
    timer = undefined;
    const batch = queued;
    queued = new Map();
    const settle = (result: Record<string, ProjectIcon | null>) => {
      for (const [projectId, key] of batch) { icons.set(key, result[projectId] ?? null); pending.delete(key); }
      if (!disposed) notify();
    };
    client.rpc(projectIcons, { projectIds: [...batch.keys()] }).then(({ icons: result }) => settle(result), () => settle({}));
  }
  return {
    request(projectId: string, revision: string | null) {
      const key = keyOf(projectId, revision);
      if (disposed || icons.has(key) || pending.has(key)) return;
      pending.add(key);
      queued.set(projectId, key);
      timer ??= setTimeout(flush, 0);
    },
    get: (projectId: string, revision: string | null) => icons.get(keyOf(projectId, revision)) ?? null,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getVersion: () => version,
    dispose() { disposed = true; if (timer) clearTimeout(timer); listeners.clear(); },
  };
}
export type ProjectIconStore = ReturnType<typeof createProjectIconStore>;

const noSubscribe = () => () => {};
const noVersion = () => 0;

// Icons are read from the installation's host, so projects on other hosts show a folder.
export function ProjectIconView({ project, store, installationHostId, size, color }: {
  project: ProjectRef; store?: ProjectIconStore; installationHostId?: string; size: number; color: string;
}) {
  const revision = useProject(project, (snapshot) => snapshot.iconRevision) ?? null;
  const source = store && project.hostId === installationHostId ? store : null;
  useSyncExternalStore(source?.subscribe ?? noSubscribe, source?.getVersion ?? noVersion);
  useEffect(() => { source?.request(project.id, revision); }, [source, project.id, revision]);
  const icon = source?.get(project.id, revision) ?? null;
  // Native image views cannot draw SVG.
  if (!icon || (icon.mimeType === "image/svg+xml" && Platform.OS !== "web")) return <Icon name="Folder" size={size} color={color} />;
  return <Image accessibilityIgnoresInvertColors source={{ uri: `data:${icon.mimeType};base64,${icon.data}` }}
    style={{ width: size, height: size, borderRadius: 3 }} />;
}
