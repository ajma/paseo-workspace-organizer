import { execFile } from "node:child_process";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { parseGithubLink, type GithubLink } from "../shared/organization";
import { githubRepositoryOf, resolveLinkNumbers } from "../shared/link-resolve";

// A PR or issue's canonical URL from the GitHub CLI: the issues endpoint answers for PRs too, with a /pull/ URL.
export type NumberLookup = (repository: string, number: number) => Promise<string>;
export const lookUpNumber: NumberLookup = (repository, number) => new Promise((resolve, reject) => {
  execFile("gh", ["api", `repos/${repository}/issues/${number}`, "--jq", ".html_url"], {
    encoding: "utf8", timeout: 10_000, maxBuffer: 256 * 1024, windowsHide: true,
    env: { ...process.env, GH_PROMPT_DISABLED: "1", GH_PAGER: "cat" },
  }, (error, output, stderr) => { if (error) reject(new Error(stderr?.trim() || error.message)); else resolve(output.trim()); });
});

type Remote = { id: string; gitRuntime?: { remoteUrl?: string | null } | null; project?: { checkout?: { remoteUrl?: string | null } | null } | null };

// Numbers are only looked up in the repository the daemon finds for the workspace itself, never one the client names,
// so the daemon's GitHub login can't be pointed at other repositories. Workspaces it can't check keep full URLs.
export function registerLinkResolver(server: PluginServerContext, lookUp: NumberLookup = lookUpNumber) {
  server.handle(resolveLinkNumbers, async ({ hostId, workspaceId, numbers }, { paseo }) => {
    const refuse = (reason: string) => ({ links: [], errors: [`${reason} Paste the full URL instead.`] });
    const { self } = await paseo.hosts.list();
    if (hostId !== self.serverId) return refuse("Numbers can only be looked up for workspaces on this plugin's host.");
    let cursor: string | undefined, found: Remote | undefined;
    do {
      const page = await paseo.workspaces.list({ page: { limit: 200, cursor } });
      found = (page.entries as Remote[]).find((workspace) => workspace.id === workspaceId);
      cursor = page.pageInfo.nextCursor ?? undefined;
    } while (!found && cursor);
    if (!found) return refuse("Couldn't find this workspace.");
    const repo = githubRepositoryOf(found.gitRuntime?.remoteUrl ?? found.project?.checkout?.remoteUrl);
    if (!repo) return refuse("Couldn't tell which GitHub repository this workspace uses.");
    const links: GithubLink[] = [], errors: string[] = [];
    for (const number of numbers) {
      try { links.push(parseGithubLink(await lookUp(repo, number))); }
      catch (failure) {
        const message = failure instanceof Error ? failure.message : String(failure);
        errors.push(/404|not found/i.test(message) ? `#${number} wasn't found in ${repo}.` : `Couldn't look up #${number} in ${repo}: ${message.split("\n")[0]}`);
      }
    }
    return { links, errors };
  });
}
