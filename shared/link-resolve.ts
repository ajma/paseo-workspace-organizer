// A workspace's GitHub links may be written as a bare number (123 or #123), meaning that PR or issue in the
// workspace's own repository. The daemon looks the number up to learn the repository and whether it's a PR.
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { githubLinkSchema, mergeLinks, parseGithubLink, type GithubLink } from "./organization";

const BARE_NUMBER = /^#?([1-9]\d*)$/;

// Full URLs become links; bare numbers are returned to be looked up. Anything else is an error, as before.
export function parseLinkInput(text: string): { links: GithubLink[]; numbers: number[] } {
  const links: GithubLink[] = [], numbers: number[] = [];
  for (const token of text.split(/\s+/).filter(Boolean)) {
    const bare = BARE_NUMBER.exec(token);
    if (bare && Number.isSafeInteger(Number(bare[1]))) { if (!numbers.includes(Number(bare[1]))) numbers.push(Number(bare[1])); }
    else links.push(parseGithubLink(token));
  }
  return { links: mergeLinks(links), numbers };
}

// "owner/repo" from a GitHub git remote (HTTPS or SSH), lowercased like stored links; null for other forges.
export function githubRepositoryOf(remote: string | null | undefined): string | null {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i.exec(remote?.trim() ?? "");
  return match ? match[1].toLowerCase() : null;
}

// The daemon finds the workspace's repository from its git remote itself; only workspaces on its own host qualify.
export const resolveLinkNumbers = defineRpc({
  name: "links.resolve",
  input: z.object({ hostId: z.string().min(1), workspaceId: z.string().min(1), numbers: z.array(z.number().int().positive()).max(50) }),
  output: z.object({ links: z.array(githubLinkSchema), errors: z.array(z.string()) }),
});
