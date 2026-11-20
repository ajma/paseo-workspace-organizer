// @vitest-environment node
import { expect, it, vi } from "vitest";
import { githubRepositoryOf, parseLinkInput, resolveLinkNumbers } from "../shared/link-resolve";
import { registerLinkResolver } from "../server/link-resolve";

it("reads full GitHub URLs and bare numbers (123 or #123) from the links field", () => {
  expect(parseLinkInput("https://github.com/o/r/pull/1\n#42  7")).toEqual({
    links: [{ repository: "o/r", number: 1, kind: "pr", url: "https://github.com/o/r/pull/1" }], numbers: [42, 7] });
  expect(parseLinkInput("#42 42").numbers).toEqual([42]);
  expect(() => parseLinkInput("abc")).toThrow(/Use a GitHub PR or issue URL/);
  expect(() => parseLinkInput("#0")).toThrow();
});

it("finds a GitHub repository in a git remote", () => {
  expect(githubRepositoryOf("git@github.com:Acme/App.git")).toBe("acme/app");
  expect(githubRepositoryOf("https://github.com/acme/app")).toBe("acme/app");
  expect(githubRepositoryOf("ssh://git@github.com/acme/app.git")).toBe("acme/app");
  expect(githubRepositoryOf("https://gitlab.com/acme/app.git")).toBeNull();
  expect(githubRepositoryOf(null)).toBeNull();
});

function serverWith(entries: unknown[], lookup: (repository: string, number: number) => Promise<string>) {
  let handler!: (input: unknown, context: unknown) => Promise<{ links: unknown[]; errors: string[] }>;
  registerLinkResolver({ handle: (contract: { name: string }, fn: typeof handler) => { if (contract.name === resolveLinkNumbers.name) handler = fn; } } as never, lookup);
  const paseo = { hosts: { list: async () => ({ self: { serverId: "h1" } }) },
    workspaces: { list: vi.fn(async () => ({ entries, pageInfo: { nextCursor: null } })) } };
  return (input: object) => handler(input, { paseo });
}

it("looks numbers up in the workspace's own repository, as a PR or an issue", async () => {
  const lookup = vi.fn(async (repository: string, number: number) => {
    if (number === 404) throw new Error("HTTP 404: Not Found");
    return `https://github.com/${repository}/${number === 42 ? "pull" : "issues"}/${number}`;
  });
  const resolve = serverWith([{ id: "w", gitRuntime: { remoteUrl: "git@github.com:Acme/App.git" } }], lookup);
  expect(await resolve({ hostId: "h1", workspaceId: "w", repository: null, numbers: [42, 43, 404] })).toEqual({
    links: [{ repository: "acme/app", number: 42, kind: "pr", url: "https://github.com/acme/app/pull/42" },
      { repository: "acme/app", number: 43, kind: "issue", url: "https://github.com/acme/app/issues/43" }],
    errors: ["#404 wasn't found in acme/app."] });
  expect(lookup).toHaveBeenCalledWith("acme/app", 42);
});

it("uses the repository the sidebar sends for another host's workspace, and says when there is none", async () => {
  const lookup = vi.fn(async (repository: string, number: number) => `https://github.com/${repository}/issues/${number}`);
  const resolve = serverWith([], lookup);
  expect((await resolve({ hostId: "h2", workspaceId: "w", repository: "acme/web", numbers: [5] })).links[0]).toMatchObject({ url: "https://github.com/acme/web/issues/5" });
  expect(await resolve({ hostId: "h2", workspaceId: "w", repository: null, numbers: [5] })).toEqual({ links: [],
    errors: ["Couldn't tell which GitHub repository this workspace uses. Paste the full URL instead."] });
});
