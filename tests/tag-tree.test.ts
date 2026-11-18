import { expect, it } from "vitest";
import { childChecked, groupState, toggleChild, toggleGroup } from "../shared/tag-tree";

const group = { id: "a", childIds: ["=a:b", "=a:c"] };

it("checks every sub-level tag from the group and clears them all again", () => {
  const all = toggleGroup(group, ["x"]);
  expect(all.sort()).toEqual(["=a:b", "=a:c", "x"]);
  expect(groupState(group, all)).toBe("all");
  expect(toggleGroup(group, all)).toEqual(["x"]);
});

it("unchecks one sub-level tag, leaving the rest, and completes a partial group", () => {
  const partial = toggleChild(group, "=a:b", ["=a:b", "=a:c"]);
  expect(partial).toEqual(["=a:c"]);
  expect(groupState(group, partial)).toBe("some");
  expect(toggleGroup(group, partial).sort()).toEqual(["=a:b", "=a:c"]);
});

it("treats an older whole-group selection as every sub-level tag", () => {
  expect(groupState(group, ["a"])).toBe("all");
  expect(childChecked(group, "=a:b", ["a"])).toBe(true);
  expect(toggleChild(group, "=a:b", ["a", "y"]).sort()).toEqual(["=a:c", "y"]);
  expect(toggleGroup(group, ["a"])).toEqual([]);
});

it("toggles a plain tag with no sub-level tags as one value", () => {
  const plain = { id: "mobile", childIds: [] };
  expect(toggleGroup(plain, [])).toEqual(["mobile"]);
  expect(groupState(plain, ["mobile"])).toBe("all");
  expect(toggleGroup(plain, ["mobile"])).toEqual([]);
});
