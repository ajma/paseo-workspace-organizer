// Turns a Paseo workspace into the PR links, git status and PR status cards show. Used by the daemon side for its own
// host and by the app for every other connected host.
import type { PaseoWorkspace } from "@getpaseo/client";
import { parseGithubLink } from "./organization";
import type { IndexEntry } from "./workspace-index";
import type { GithubStatus } from "./github-status";
import { requestedGroup } from "./new-workspace-group";

// Paseo's detected PR wins; `fallbackUrl` is the plugin's own lookup when Paseo has none.
export function workspaceEntry(workspace: PaseoWorkspace, fallbackUrl?: string | null): IndexEntry {
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
export function detectedStatus(workspace: PaseoWorkspace, now = Date.now()): GithubStatus | null {
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
