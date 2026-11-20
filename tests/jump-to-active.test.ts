import { expect, it } from "vitest";
import { collapsedAround, groupChain, rowOutOfView, scrollOffsetFor } from "../shared/jump-to-active";

const list = { y: 100, height: 400 };

it("counts a row as out of view only when none of it shows in the list", () => {
  expect(rowOutOfView({ y: 20, height: 60 }, list)).toBe(true);    // above
  expect(rowOutOfView({ y: 60, height: 60 }, list)).toBe(false);   // partly showing at the top
  expect(rowOutOfView({ y: 300, height: 60 }, list)).toBe(false);
  expect(rowOutOfView({ y: 480, height: 60 }, list)).toBe(false);  // partly showing at the bottom
  expect(rowOutOfView({ y: 500, height: 60 }, list)).toBe(true);   // below
  // Before layout nothing is known, so nothing is out of view.
  expect(rowOutOfView({ y: 0, height: 0 }, { y: 0, height: 0 })).toBe(false);
});

it("scrolls so the row sits in the middle of the list, never before the start", () => {
  expect(scrollOffsetFor({ y: 900, height: 60 }, list, 200)).toBe(200 + 800 - 170);
  expect(scrollOffsetFor({ y: 20, height: 60 }, list, 50)).toBe(0);
  // Taller than the list: its top goes to the list's top.
  expect(scrollOffsetFor({ y: 900, height: 600 }, list, 0)).toBe(800);
});

it("finds the collapsed groups around a workspace, outermost first", () => {
  const groups = [{ id: "a", parentId: null }, { id: "b", parentId: "a" }, { id: "c", parentId: "b" }, { id: "x", parentId: "y" }, { id: "y", parentId: "x" }];
  expect(groupChain(groups, "c")).toEqual(["a", "b", "c"]);
  expect(groupChain(groups, null)).toEqual([]);
  expect(groupChain(groups, "gone")).toEqual([]);
  expect(groupChain(groups, "x")).toEqual(["y", "x"]);
  expect(collapsedAround(["a", "b", "c"], ["c", "a", "other"])).toEqual(["a", "c"]);
});
