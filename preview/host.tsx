// Development-only host simulator. Never included in the plugin package.
import { useSyncExternalStore } from "react";
import { organizationSchema, emptyDetails, parseGithubLink, workspaceKey } from "../shared/organization";

export const theme = { colors: { surface0: "#1c1e23", surface1: "#23262d", surface2: "#2d323b", border: "#353b45",
  foreground: "#e7e9ef", foregroundMuted: "#a5acb9", accent: "#9bb9ff", accentForeground: "#17233e",
  statusSuccess: "#75cba5", statusWarning: "#e7bd78", statusDanger: "#f09090" } };
const ref = (id: string, hostId = "local") => ({ kind: "workspace" as const, hostId, id, key: workspaceKey(hostId, id) });
export const workspace = (id: string, title: string, extra: Record<string, any> = {}) => ({
  hostId: "local", id, title, name: title, directory: `/work/${id}`, projectId: "paseo", projectDisplayName: "paseo",
  projectRootPath: "/work/paseo", projectKind: "git", kind: "worktree", labels: [], branch: `feature/${id}`,
  background: false, archivingAt: null, indicator: "running", indicatorLabel: "Running", status: "running", ...extra,
  ref: ref(id, extra.hostId ?? "local"),
  project: { kind: "project", id: extra.projectId ?? "paseo", hostId: extra.hostId ?? "local", key: workspaceKey(extra.hostId ?? "local", extra.projectId ?? "paseo") },
});
const sampleWorkspaces = () => [workspace("sidebar", "Restructure workspace navigation", { labels: ["plugin"], branch: "feature/sidebar-organizer" }),
  workspace("search", "Search by GitHub references", { indicator: "needs_input", indicatorLabel: "Needs input", labels: ["search"] }),
  workspace("mobile", "Polish compact sidebar layout", { indicator: "done", indicatorLabel: "Done" }),
  workspace("notes", "Explore next ideas", { projectId: "notes", projectDisplayName: "notes", branch: null, indicator: "done", indicatorLabel: "Done" })];
let workspaces = sampleWorkspaces();
export const sampleOrganization = () => organizationSchema.parse({
  groups: [{ id: "active", name: "In progress", parentId: null }, { id: "interface", name: "Interface", parentId: "active" }, { id: "later", name: "Later", parentId: null }],
  workspaces: {
    [workspaceKey("local", "sidebar")]: { ...emptyDetails(), groupId: "interface", subtitle: "Custom groups and a calmer workspace list.\nKeep tags and GitHub references on their own lines.", tags: ["design", "in review"],
      links: [parseGithubLink("https://github.com/getpaseo/paseo/pull/412"), parseGithubLink("https://github.com/getpaseo/paseo/pull/427"), parseGithubLink("https://github.com/getpaseo/paseo/issues/385")] },
    [workspaceKey("local", "search")]: { ...emptyDetails(), groupId: "active", subtitle: "Find any linked PR or issue from Command Center.", links: [parseGithubLink("https://github.com/getpaseo/paseo/issues/399")] },
    [workspaceKey("local", "mobile")]: { ...emptyDetails(), groupId: "later", tags: ["mobile"] },
  },
});
const listeners = new Set<() => void>();
let documents: Record<string, { revision: string; values: any }>;
let version = 0;
const saveErrors: Record<string, string | null> = {};
const emit = () => { version++; listeners.forEach((listener) => listener()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
// Agents: tests replace them with setAgents.
let agents: any[] = [];
// Archiving marks the workspace as archiving, which hides it like Paseo does; tests can make it fail instead.
export const archiveCalls: string[] = [];
let archiveError: string | null = null;
export function failArchives(message: string | null) { archiveError = message; }
// The New workspace screen's setup, and metadata the plugin sets on existing workspaces.
let newWorkspaceMetadata: Record<string, unknown> = {};
export const metadataCalls: { hostId: string; id: string; patch: Record<string, unknown> }[] = [];
export function useNewWorkspace() {
  useSyncExternalStore(subscribe, () => version);
  return { host: { id: "local", label: "This Mac" }, project: null, isolation: "worktree", baseRef: null, branch: null,
    metadata: newWorkspaceMetadata,
    setMetadata: async (patch: Record<string, unknown>) => {
      const next = { ...newWorkspaceMetadata, ...patch };
      for (const [key, value] of Object.entries(patch)) if (value === null) delete next[key];
      newWorkspaceMetadata = next; emit();
    },
    setIsolation: async () => {}, setBaseRef: async () => {}, setBranch: async () => {} };
}
export function resetHost() { workspaces = sampleWorkspaces(); agents = []; archiveCalls.length = 0; archiveError = null;
  newWorkspaceMetadata = {}; metadataCalls.length = 0; documents = { organization: { revision: "1", values: sampleOrganization() }, preferences: { revision: "1", values: { collapsed: [] } }, cards: { revision: "1", values: {} } }; for (const key of Object.keys(saveErrors)) delete saveErrors[key]; emit(); }
resetHost();
export function getOrganization() { return documents.organization.values; }
export function getDocument(id: string) { return documents[id]?.values; }
export function changeOrganization(update: (values: any) => any) { documents.organization = { revision: String(Number(documents.organization.revision) + 1), values: update(documents.organization.values) }; emit(); }
export function setWorkspaces(next: typeof workspaces) { workspaces = next; emit(); }
export function useSettings(definition: any) {
  useSyncExternalStore(subscribe, () => version);
  const doc = documents[definition.id];
  return { status: "ready", revision: doc.revision, values: definition.schema.parse(doc.values), saving: false, saveError: saveErrors[definition.id] ?? null,
    save: async (values: any, revision: string) => {
      if (revision !== documents[definition.id].revision) { saveErrors[definition.id] = "Settings changed elsewhere. Reload and try again."; emit(); return false; }
      documents[definition.id] = { revision: String(Number(revision) + 1), values: definition.schema.parse(values) }; emit(); return true;
    }, reload: async () => { saveErrors[definition.id] = null; emit(); }, reset: async () => true };
}
export function useWorkspaces(query: any = {}) {
  useSyncExternalStore(subscribe, () => version);
  const items = workspaces.filter((item) => (!query.hosts || query.hosts.includes(item.hostId)) && (!query.where || query.where(item)));
  if (typeof query.orderBy === "function") items.sort(query.orderBy);
  if (query.groupBy) {
    const groups = new Map<string, { key: string; title: string; items: typeof items[number]["ref"][] }>();
    for (const item of items) {
      const result = query.groupBy(item);
      for (const group of Array.isArray(result) ? result : [result]) {
        const key = typeof group === "string" ? group : group.key;
        if (!groups.has(key)) groups.set(key, { key, title: typeof group === "string" ? group : group.title, items: [] });
        if (!groups.get(key)!.items.includes(item.ref)) groups.get(key)!.items.push(item.ref);
      }
    }
    return [...groups.values()];
  }
  return items.map((item) => item.ref);
}
export function useWorkspace(reference: any) { useSyncExternalStore(subscribe, () => version); return workspaces.find((item) => item.ref.key === reference.key) ?? null; }
// Host names for the showcase; other hosts are named by their id.
const hostLabels: Record<string, string> = {};
export function setHostLabels(labels: Record<string, string>) { Object.assign(hostLabels, labels); emit(); }
export function useHosts() { return [...new Set(workspaces.map((item) => item.hostId))].map((id) => ({ serverId: id, label: hostLabels[id] ?? (id === "local" ? "This Mac" : id), status: "online" })); }
export const openedLinks: string[] = [];
export async function openExternalUrl(url: string) { openedLinks.push(url); }
// The showcase passes its own index entries (git status, detected PRs) and GitHub statuses.
export function makeIndex(extra: { entries?: any[]; github?: Record<string, any> } = {}) {
  const status = (state: string, checks: string | null = null, review: string | null = null) => ({ state, checks, review, updatedAt: "2026-11-11T12:00:00Z", stale: false, error: null });
  const snapshot = { hostId: "local", entries: extra.entries ?? [], organization: null, error: null, github: { ...extra.github,
    "https://github.com/getpaseo/paseo/pull/412": status("open", "success", "approved"),
    "https://github.com/getpaseo/paseo/pull/427": status("draft", "pending", "pending"),
    "https://github.com/getpaseo/paseo/issues/385": status("closed"),
    "https://github.com/getpaseo/paseo/issues/399": status("open"),
  } };
  return { subscribe, getSnapshot: () => snapshot, getError: () => null, dispose() {} };
}
export function useProjects() {
  useSyncExternalStore(subscribe, () => version);
  return [...new Map(workspaces.map((item) => [item.project.key, item.project])).values()];
}
export function useProject(reference: any, selector?: (snapshot: any) => any) {
  useSyncExternalStore(subscribe, () => version);
  const item = workspaces.find((workspace) => workspace.project.key === reference.key);
  if (!item) return null;
  const snapshot = { ref: item.project, hostId: item.hostId, displayName: item.projectDisplayName, rootPath: item.projectRootPath,
    kind: item.projectKind, iconRevision: item.projectIconRevision ?? null };
  return selector ? selector(snapshot) : snapshot;
}
export function setAgents(next: any[]) { agents = next; emit(); }
export const agent = (id: string, workspaceId: string, extra: Record<string, any> = {}) => ({
  id, hostId: "local", workspaceId, provider: "codex", status: "idle", background: false, parentAgentId: null, parentAgent: null,
  model: "gpt-5.5", thinkingOptionId: "medium", lastActivityAt: "2026-11-17T10:00:00Z", createdAt: "2026-11-17T09:00:00Z",
  updatedAt: "2026-11-17T10:00:00Z", title: null, cwd: "/work", currentModeId: null, requiresAttention: false, attentionReason: null,
  labels: {}, metadata: {}, backgroundWork: { count: 0 }, ...extra,
  ref: { kind: "agent", hostId: extra.hostId ?? "local", id, key: workspaceKey(extra.hostId ?? "local", id) },
  workspace: ref(workspaceId, extra.hostId ?? "local"),
});
export function useAgents(query: any = {}) {
  useSyncExternalStore(subscribe, () => version);
  const items = agents.filter((item) => !query.where || query.where(item));
  if (Array.isArray(query.orderBy)) {
    const [key, direction] = query.orderBy;
    items.sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (direction === "desc" ? -1 : 1));
  }
  if (query.groupBy) {
    const groups = new Map<string, { key: string; title: string; items: any[] }>();
    for (const item of items) {
      const key = query.groupBy(item);
      if (!groups.has(key)) groups.set(key, { key, title: key, items: [] });
      groups.get(key)!.items.push(item.ref);
    }
    return [...groups.values()];
  }
  return items.map((item) => item.ref);
}
export function useAgent(reference: any, selector?: (snapshot: any) => any) {
  useSyncExternalStore(subscribe, () => version);
  const item = agents.find((candidate) => candidate.ref.key === reference.key);
  return item ? (selector ? selector(item) : item) : null;
}
export const providerSnapshot = { entries: [{ provider: "codex", label: "Codex",
  models: [{ id: "gpt-5.5", label: "GPT-5.5 Codex", thinkingOptions: [{ id: "medium", label: "Medium" }] }] },
  { provider: "claude", label: "Claude", models: [{ id: "opus", label: "Opus", thinkingOptions: [{ id: "high", label: "High" }] }] }] };
export function getPaseoClient(_hostId: string) {
  return {
    providers: { snapshot: async () => providerSnapshot, subscribe: () => () => {} },
    workspaces: {
      ref: (id: string) => ({ setMetadata: async (patch: Record<string, unknown>) => { metadataCalls.push({ hostId: _hostId, id, patch }); },
        setPinned: async () => ({}) }),
      archive: async (id: string) => {
        archiveCalls.push(id);
        if (archiveError) throw new Error(archiveError);
        workspaces = workspaces.map((item) => item.id === id ? { ...item, archivingAt: new Date().toISOString() } : item);
        emit();
      },
    },
  };
}
