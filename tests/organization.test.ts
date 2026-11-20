import { describe, expect, it } from "vitest";
import { descendants, dissolveGroup, emptyDetails, matchesSearch, mergeLinks, moveInOrder, organizationSchema,
  parseGithubLink, parseLinks, searchTerms, workspaceKey } from "../shared/organization";

describe("workspace organization", () => {
  it("accepts nested groups and rejects cycles, dangling parents and duplicate IDs", () => {
    const groups = [{ id: "a", name: "A", parentId: null, color: null }, { id: "b", name: "B", parentId: "a", color: null }];
    expect(organizationSchema.parse({ groups }).groups).toEqual(groups);
    expect(organizationSchema.safeParse({ groups: [{ ...groups[0], parentId: "b" }, groups[1]] }).success).toBe(false);
    expect(organizationSchema.safeParse({ groups: [{ ...groups[0], parentId: "missing" }] }).success).toBe(false);
    expect(organizationSchema.safeParse({ groups: [groups[0], groups[0]] }).success).toBe(false);
    expect([...descendants(groups, "a")]).toEqual(["a", "b"]);
  });
  it("dissolves a group without losing child groups or workspace metadata", () => {
    const value = organizationSchema.parse({ groups: [{ id: "a", name: "A", parentId: null }, { id: "b", name: "B", parentId: "a" }],
      workspaces: { w: { ...emptyDetails(), groupId: "a", subtitle: "line 1\nline 2" } } });
    const next = dissolveGroup(value, "a");
    expect(next.groups).toEqual([{ id: "b", name: "B", parentId: null, color: null }]);
    expect(next.workspaces.w).toMatchObject({ groupId: null, subtitle: "line 1\nline 2" });
    expect(organizationSchema.safeParse(next).success).toBe(true);
  });
  it("keeps identical workspace IDs on different hosts separate", () => {
    expect(workspaceKey("a", "id")).not.toBe(workspaceKey("b", "id"));
  });
  it("reorders siblings while preserving all other entries and appending new workspaces", () => {
    expect(moveInOrder(["a", "other", "b"], ["a", "b", "new"], "b", -1)).toEqual(["b", "other", "a", "new"]);
  });
  it("canonicalizes GitHub links and deduplicates a detected PR with a manual link", () => {
    const link = parseGithubLink("https://github.com/Owner/Repo/pull/42/files#diff-1");
    expect(link).toMatchObject({ repository: "owner/repo", kind: "pr", number: 42, url: "https://github.com/owner/repo/pull/42" });
    expect(mergeLinks([link], parseLinks("https://github.com/owner/repo/pull/42\nhttps://github.com/owner/other/issues/99"))).toHaveLength(2);
  });
  it.each(["https://evil.example/a/b/pull/1", "javascript:alert(1)", "https://github.com.evil/a/b/issues/1", "https://github.com/a/b/issues/0", "https://github.com/a/b/pull/9007199254740993"])("rejects invalid link %s", (url) => expect(() => parseGithubLink(url)).toThrow());
  it("matches every PR and issue number, repo, tag, subtitle, and group path", () => {
    const links = parseLinks("https://github.com/o/r/pull/42 https://github.com/o/r/pull/87 https://github.com/o/r/issues/99");
    const terms = searchTerms("Fix reconnect", "fix/socket", ["backend"], { ...emptyDetails(), subtitle: "First line\nNext line" }, links, ["Work / Urgent"]);
    for (const query of ["42", "#87", "PR #87", "issue 99", "o/r#99", "backend", "next line", "urgent"]) expect(matchesSearch(query, terms), query).toBe(true);
    expect(matchesSearch("#1000", terms)).toBe(false);
  });
});
