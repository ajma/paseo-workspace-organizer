import type { PluginHookContext, PluginServerContext } from "@getpaseo/plugin/server";
import { mergeLinks, organization, workspaceKey } from "../shared/organization";
import { detectedStatus, workspaceEntry } from "../shared/workspace-entry";
import { workspaceIndex, type IndexEntry } from "../shared/workspace-index";
import type { GithubStatus } from "../shared/github-status";
import { createStatusCache, readGithubStatus, type StatusReader } from "./github-status";
import { createPrLookup, findPullRequest, type PrFinder } from "./pr-lookup";

type PrLookup = ReturnType<typeof createPrLookup>;
// A workspace as the daemon's Paseo API lists it (its own type lives in a package plugins can't import).
type PaseoWorkspace = Awaited<ReturnType<PluginHookContext["paseo"]["workspaces"]["list"]>>["entries"][number];

function entry(workspace: PaseoWorkspace, prs?: PrLookup): IndexEntry {
  return workspaceEntry(workspace, workspace.githubRuntime?.pullRequest?.url ? null : prs?.get(workspace.workspaceDirectory, workspace.gitRuntime?.currentBranch));
}

export function registerIndex(server: PluginServerContext, readStatus: StatusReader = readGithubStatus, findPr: PrFinder = findPullRequest) {
  const cache = createStatusCache(readStatus);
  const prs = createPrLookup(findPr);
  const settings = server.registerSettings(organization);
  server.handle(workspaceIndex, async (_input, context) => {
    const { paseo, signal, push } = context;
    const { self } = await paseo.hosts.list();
    let document = await settings.read();
    const workspaces = new Map<string, PaseoWorkspace>();
    let github: Record<string, GithubStatus> = {};
    let refreshing = false;
    let refreshAgain = false;
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const links = () => {
      const active = [...workspaces.values()].filter((w) => !w.background && !w.archivingAt);
      const manual = document.status === "ready" ? Object.entries(document.values.workspaces).flatMap(([key, details]) => {
        // Cross-host manual links are also visible in this installation's sidebar.
        // Skip retained metadata for archived/deleted workspaces on this host.
        let hostId: unknown;
        try { const reference: unknown = JSON.parse(key); hostId = Array.isArray(reference) ? reference[0] : undefined; }
        catch { /* Older or hand-edited metadata keys do not identify a local workspace. */ }
        return hostId === self.serverId && !active.some((workspace) => workspaceKey(hostId, workspace.id) === key) ? [] : details.links;
      }) : [];
      return mergeLinks(active.flatMap((workspace) => entry(workspace, prs).links), manual);
    };
    let complete!: (error?: unknown) => void;
    const completed = new Promise<unknown>((resolve) => { complete = resolve; });
    const finish = (error?: unknown) => { closed = true; complete(error); };
    const abort = () => finish();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) finish();
    let sending = Promise.resolve();
    const send = () => {
      if (closed || signal.aborted) return;
      const statuses = { ...github };
      for (const workspace of workspaces.values()) {
        const url = entry(workspace, prs).links[0]?.url, status = detectedStatus(workspace);
        if (url && status) {
          const fetched = statuses[url];
          const nativeTime = status.updatedAt ? Date.parse(status.updatedAt) : 0;
          const fetchedTime = fetched?.updatedAt ? Date.parse(fetched.updatedAt) : 0;
          // A failed refresh must never regress a newer known state to an older native snapshot.
          if (!fetched || fetched.state === "unknown" || nativeTime > fetchedTime) statuses[url] = status;
        }
      }
      const event = { hostId: self.serverId,
        entries: [...workspaces.values()].filter((w) => !w.background && !w.archivingAt).map((w) => entry(w, prs)),
        organization: document.status === "ready" ? document.values : null,
        error: document.status === "invalid" ? document.error : null, github: statuses };
      sending = sending.then(() => { if (!closed && !signal.aborted) return push(event); }).catch(finish);
    };
    const refresh = async () => {
      if (closed || signal.aborted) return;
      if (refreshing) { refreshAgain = true; return; }
      if (timer) { clearTimeout(timer); timer = undefined; }
      refreshing = true;
      try {
        do {
          refreshAgain = false;
          const wanted = links();
          const results: [string, GithubStatus][] = [];
          let next = 0;
          await Promise.all(Array.from({ length: Math.min(4, wanted.length) }, async () => {
            while (next < wanted.length && !closed && !signal.aborted) {
              const link = wanted[next++];
              results.push([link.url, await cache.get(link)]);
            }
          }));
          if (closed || signal.aborted) break;
          github = Object.fromEntries(results);
          send();
        } while (refreshAgain && !closed && !signal.aborted);
      } catch (error) { finish(error); }
      finally {
        refreshing = false;
        if (!closed && !signal.aborted) timer = setTimeout(() => { void refresh(); }, 60_000);
      }
    };
    const changed = () => { send(); void refresh(); };
    let release = async () => {};
    let stop = () => {};
    let unobserve = () => {};
    try {
      // The protocol rejects page.limit above 200, so request the maximum page.
      const result = await paseo.workspaces.list({ subscribe: {}, page: { limit: 200 } });
      release = () => result.subscription.release();
      const stopSettings = settings.subscribe((next) => { document = next; changed(); });
      // A newly found PR is sent and its status fetched like Paseo's detected ones.
      const stopPrs = prs.subscribe(changed);
      stop = () => { stopSettings(); stopPrs(); };
      unobserve = result.subscription.subscribe({
      snapshot: ({ entries }) => { workspaces.clear(); for (const item of entries) workspaces.set(item.id, item); changed(); },
      update: (message) => {
        if (message.type !== "workspace_update") return;
        const update = message.payload;
        if (update.kind === "upsert") workspaces.set(update.workspace.id, update.workspace);
        else workspaces.delete(update.id);
        changed();
      },
      error: finish,
      });
      const failure = await completed;
      await sending;
      if (failure && !signal.aborted) throw failure;
    } finally { closed = true; if (timer) clearTimeout(timer); signal.removeEventListener("abort", abort); stop(); unobserve(); await release(); }
  });
  return () => { cache.dispose(); prs.dispose(); };
}
