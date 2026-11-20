import { describe, expect, it } from "vitest";
import * as search from "../shared/search";
import { organization, organizationSchema, preferences, preferencesSchema } from "../shared/organization";
import { cards } from "../shared/cards";

const input = { indicator: "running", tags: ["Backend", "review"], hostId: "host-a", projectKey: '["host-a","project"]' };

describe("workspace filters", () => {
  it("matches attributed tags by the name before the first colon", () => {
    const filters = search.filtersSchema.parse({ tags: ["tag"] });
    for (const tag of ["tag:abc", "tag:def", "tag", " TAG : abc:more "]) {
      expect(search.matchesFilters({ ...input, tags: [tag] }, filters), tag).toBe(true);
    }
    expect(search.matchesFilters({ ...input, tags: ["tagged:abc"] }, filters)).toBe(false);
  });
  it("groups tags that start with an emoji by that emoji", () => {
    expect(search.tagName("🔥urgent")).toBe("🔥");
    expect(search.tagName(" 🔥 urgent ")).toBe("🔥");
    expect(search.tagName("🔥")).toBe("🔥");
    expect(search.tagName("❤️ love")).toBe("❤️");
    expect(search.tagName("👍🏽 approved")).toBe("👍🏽");
    expect(search.tagName("👩‍💻 pairing")).toBe("👩‍💻");
    expect(search.tagName("🇺🇸 launch")).toBe("🇺🇸");
    expect(search.tagName("🔥:abc")).toBe("🔥");
    expect(search.tagName("abc:def")).toBe("abc");
    expect(search.tagName("v2 🔥")).toBe("v2 🔥");
    const filters = search.filtersSchema.parse({ tags: ["🔥 anything"] });
    expect(filters.tags).toEqual(["🔥"]);
    for (const tag of ["🔥urgent", "🔥 later", "🔥"]) expect(search.matchesFilters({ ...input, tags: [tag] }, filters), tag).toBe(true);
    expect(search.matchesFilters({ ...input, tags: ["🧊 cold", "fire"] }, filters)).toBe(false);
  });
  it("normalizes and deduplicates attributed tag selections in saved searches", () => {
    expect(search.filtersSchema.parse({ tags: ["Tag:abc", "tag:def", "plain"] }).tags).toEqual(["tag", "plain"]);
  });
  it("combines choices within each category with OR and categories with AND", () => {
    const filters = search.filtersSchema.parse({ statuses: ["running", "failed"], tags: ["backend", "urgent"], hostIds: ["host-a"], projectKeys: ['["host-a","project"]'] });
    expect(search.matchesFilters(input, filters)).toBe(true);
    expect(search.matchesFilters({ ...input, indicator: "done" }, filters)).toBe(false);
    expect(search.matchesFilters({ ...input, tags: ["unrelated"] }, filters)).toBe(false);
    expect(search.matchesFilters({ ...input, hostId: "host-b" }, filters)).toBe(false);
    expect(search.matchesFilters({ ...input, projectKey: '["host-b","project"]' }, filters)).toBe(false);
  });
  it("does not widen a saved search when a selected host or project is missing", () => {
    expect(search.matchesFilters(input, search.filtersSchema.parse({ hostIds: ["disconnected-host"] }))).toBe(false);
    expect(search.matchesFilters(input, search.filtersSchema.parse({ projectKeys: ["deleted-project"] }))).toBe(false);
  });
  it("compares saved criteria independent of selection order and query whitespace", () => {
    const a = { query: " #42 ", filters: search.filtersSchema.parse({ tags: ["alpha", "beta"], statuses: ["running", "done"] }) };
    const b = { query: "#42", filters: search.filtersSchema.parse({ tags: ["beta", "alpha"], statuses: ["done", "running"] }) };
    expect(search.sameCriteria(a, b)).toBe(true);
    expect(search.sameCriteria(a, { ...b, query: "#43" })).toBe(false);
  });
});


it("persists all criteria and rejects ambiguous duplicate saved-search names", () => {
  const saved = { id: "s", name: "My reviews", query: "#42", filters: { statuses: ["attention"], tags: ["review"], hostIds: ["mac"], projectKeys: ["p"], prs: ["open", "none"] } };
  expect(organizationSchema.parse({ savedSearches: [saved] }).savedSearches).toEqual([saved]);
  expect(organizationSchema.safeParse({ savedSearches: [saved, { ...saved, id: "s2", name: " my REVIEWS " }] }).success).toBe(false);
});

// 0.1.0 shipped every settings document at version 1; preferences gained the picked host in version 2.
it("versions the settings documents and fills missing preferences with defaults", () => {
  expect([organization, cards, preferences].map((definition) => definition.version)).toEqual([2, 1, 3]);
  expect(preferencesSchema.parse({ collapsed: ["active"] })).toEqual({ collapsed: ["active"], sort: "manual", titleLines: "2", groupBy: "groups", toolbarOrder: [], toolbarLabels: true, stickyHeaders: true, linksInPaseo: true, sidebarHost: null, groupColorFill: "group" });
});

it("matches exact tag filters only against that tag and keeps them through saving", () => {
  const filters = search.filtersSchema.parse({ tags: ["=📲 S25", "abc:def", "=Tag:ABC"] });
  expect(filters.tags).toEqual(["=📲 s25", "abc", "=tag:abc"]);
  const tags = (list: string[]) => ({ indicator: "running", tags: list, hostId: "h", projectKey: "p" });
  const exact = search.filtersSchema.parse({ tags: ["=📲 S25"] });
  expect(search.matchesFilters(tags(["📲 s25"]), exact)).toBe(true);
  expect(search.matchesFilters(tags(["📲 P10"]), exact)).toBe(false);
  expect(search.matchesFilters(tags(["📲"]), exact)).toBe(false);
});

it("filters by PR presence and state, and older saved searches gain an empty PR filter", () => {
  const ws = (prStates: string[]) => ({ indicator: "running", tags: [], hostId: "h", projectKey: "p", prStates });
  const f = (prs: string[]) => search.filtersSchema.parse({ prs });
  expect(search.matchesFilters(ws(["open"]), f(["any"]))).toBe(true);
  expect(search.matchesFilters(ws([]), f(["any"]))).toBe(false);
  expect(search.matchesFilters(ws([]), f(["none"]))).toBe(true);
  expect(search.matchesFilters(ws(["unknown"]), f(["any"]))).toBe(true);
  expect(search.matchesFilters(ws(["merged", "open"]), f(["merged"]))).toBe(true);
  expect(search.matchesFilters(ws(["open"]), f(["merged", "closed"]))).toBe(false);
  expect(search.matchesFilters(ws(["draft"]), f(["draft", "none"]))).toBe(true);
  expect(search.filtersSchema.parse({ statuses: ["running"] }).prs).toEqual([]);
});

it("counts each filter option against the other categories, ignoring its own", () => {
  const filters = search.filtersSchema.parse({ statuses: ["running"], hostIds: ["mac"] });
  const options = { statuses: ["running", "done"], tags: ["📲", "=📲 s25"], hostIds: ["mac", "mini"], projectKeys: [], prs: ["any", "none"] } as const;
  const facts = { indicator: "done", tags: ["📲 S25"], hostId: "mac", projectKey: "p", prStates: ["open"] };
  // Done on the Mac: counts under Done (its own status filter is ignored), but nowhere else, because every other
  // category still needs Running.
  expect(search.facetKeys(facts, filters, options)).toEqual([search.facetKey("statuses", "done")]);
  const running = { ...facts, indicator: "running" };
  expect(search.facetKeys(running, filters, options)).toEqual(["statuses:running", "tags:📲", "tags:=📲 s25", "hostIds:mac", "prs:any"]
    .map((key) => search.facetKey(key.slice(0, key.indexOf(":")) as any, key.slice(key.indexOf(":") + 1))));
});
