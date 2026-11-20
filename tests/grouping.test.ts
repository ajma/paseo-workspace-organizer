import { expect, it } from "vitest";
import { groupByModes, prBucket } from "../shared/grouping";
import { preferencesSchema, emptyDetails, organizationSchema, placeGroup, placeWorkspace } from "../shared/organization";

it("offers your groups, host, project, PR status and none", () => {
  expect([...groupByModes]).toEqual(["groups", "host", "project", "pr", "none"]);
  expect(preferencesSchema.parse({ groupBy: "none" }).groupBy).toBe("none");
  // A device that chose the removed Last active grouping falls back to your groups.
  expect(preferencesSchema.parse({ groupBy: "activity" }).groupBy).toBe("groups");
  expect(preferencesSchema.parse({}).groupBy).toBe("groups");
  expect(preferencesSchema.parse({ groupBy: "weird" }).groupBy).toBe("groups");
});

it("puts a workspace under its most active PR state", () => {
  expect(prBucket([])).toBe("none");
  expect(prBucket(["closed", "open", "merged"])).toBe("open");
  expect(prBucket(["merged", "draft"])).toBe("draft");
  expect(prBucket(["closed", "merged"])).toBe("merged");
  expect(prBucket(["closed"])).toBe("closed");
  expect(prBucket(["unknown"])).toBe("unknown");
});

const org = (extra = {}) => organizationSchema.parse({
  groups: [{ id: "a", name: "A", parentId: null }, { id: "a1", name: "A1", parentId: "a" }, { id: "b", name: "B", parentId: null }],
  workspaces: { w1: { ...emptyDetails(), groupId: "a" }, w2: { ...emptyDetails(), groupId: "a" } }, workspaceOrder: ["w1", "w2", "w3"], ...extra });

it("drops a workspace before another, or last, in a group, and can ungroup it", () => {
  const before = placeWorkspace(org(), "w3", { groupId: "a", siblings: ["w1", "w2"], before: "w2" });
  expect(before.workspaces.w3.groupId).toBe("a");
  expect(before.workspaceOrder).toEqual(["w1", "w3", "w2"]);
  const last = placeWorkspace(org(), "w1", { groupId: "a", siblings: ["w1", "w2"], before: null });
  expect(last.workspaceOrder).toEqual(["w2", "w1", "w3"]);
  const ungrouped = placeWorkspace(org(), "w1", { groupId: null, siblings: ["w3"], before: null });
  expect(ungrouped.workspaces.w1.groupId).toBeNull();
  expect(ungrouped.workspaceOrder).toEqual(["w2", "w3", "w1"]);
  // Groups chosen automatically (host, project…) only reorder.
  const reordered = placeWorkspace(org(), "w2", { groupId: undefined, siblings: ["w1", "w2"], before: "w1" });
  expect(reordered.workspaces.w2.groupId).toBe("a");
  expect(reordered.workspaceOrder).toEqual(["w2", "w1", "w3"]);
  expect(() => organizationSchema.parse(before)).not.toThrow();
});

it("drops a group before another or inside one, never inside itself", () => {
  const moved = placeGroup(org(), "b", { parentId: null, before: "a" });
  expect(moved!.groups.map((group) => group.id)).toEqual(["b", "a", "a1"]);
  const nested = placeGroup(org(), "b", { parentId: "a", before: null });
  expect(nested!.groups.find((group) => group.id === "b")!.parentId).toBe("a");
  expect(nested!.groups.map((group) => group.id)).toEqual(["a", "a1", "b"]);
  const outward = placeGroup(org(), "a1", { parentId: null, before: null });
  expect(outward!.groups.map((group) => [group.id, group.parentId])).toEqual([["a", null], ["b", null], ["a1", null]]);
  expect(placeGroup(org(), "a", { parentId: "a1", before: null })).toBeNull();
  expect(placeGroup(org(), "a", { parentId: "a", before: null })).toBeNull();
});
