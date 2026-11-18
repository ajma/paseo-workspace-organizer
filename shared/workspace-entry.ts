// Turns a Paseo workspace into the PR links, git status and PR status cards show. Used by the daemon side for its own
// host and by the app for every other connected host.
import { parseGithubLink } from "./organization";
import type { IndexEntry } from "./workspace-index";
import type { GithubStatus } from "./github-status";
import { requestedGroup } from "./new-workspace-group";

// The parts of a Paseo workspace read here. The daemon and the app each pass their own workspace type, which has these.
type WorkspaceSnapshot = {
  id: string; name: string; title?: string | null; labels?: string[] | null;
  metadata?: Readonly<Record<string, unknown>> | null;
  gitRuntime?: { currentBranch?: string | null; isDirty?: boolean | null; aheadOfOrigin?: number | null; behindOfOrigin?: number | null;
    aheadBehind?: { ahead?: number | null; behind?: number | null } | null } | null;
  githubRuntime?: { refreshedAt?: string | null; pullRequest?: { url?: string | null; state?: string | null; isMerged?: boolean | null;
    isDraft?: boolean | null; checksStatus?: GithubStatus["checks"]; reviewDecision?: GithubStatus["review"] } | null } | null;
};

// Paseo's detected PR wins; `fallbackUrl` is the plugin's own lookup when Paseo has none.
export function workspaceEntry(workspace: WorkspaceSnapshot, fallbackUrl?: string | null): IndexEntry {
  const links: IndexEntry["links"] = [];
  const git = workspace.gitRuntime;
  const url = workspace.githubRuntime?.pullRequest?.url ?? fallbackUrl;
  if (url) { try { links.push(parseGithubLink(url)); } catch { /* Other forges are not GitHub links. */ } }
  return { id: workspace.id, name: workspace.title ?? workspace.name,
    branch: git?.currentBranch ?? null, labels: workspace.labels ?? [], links,
    git: git ? { dirty: git.isDirty ?? null, ahead: git.aheadOfOrigin ?? git.aheadBehind?.ahead ?? null,
      behind: git.behindOfOrigin ?? git.aheadBehind?.behind ?? null } : null,
    group: requestedGroup(workspace.metadata) };
}

// The status Paseo already knows for its detected PR.
export function detectedStatus(workspace: WorkspaceSnapshot, now = Date.now()): GithubStatus | null {
  const pr = workspace.githubRuntime?.pullRequest;
  if (!pr?.state) return null;
  return {
    state: pr.isMerged ? "merged" : pr.state.toUpperCase() === "CLOSED" ? "closed" : pr.isDraft ? "draft" : pr.state.toUpperCase() === "OPEN" ? "open" : "unknown",
    checks: pr.checksStatus ?? "unknown", review: pr.reviewDecision ?? "none",
    updatedAt: workspace.githubRuntime?.refreshedAt ?? null,
    stale: !workspace.githubRuntime?.refreshedAt || now - Date.parse(workspace.githubRuntime.refreshedAt) > 120_000,
    error: null,
  };
}
