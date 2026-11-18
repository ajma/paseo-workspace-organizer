import { expect, it } from "vitest";
import { chipOrder, firstLineCount, moveChip, toolbarChips } from "../shared/toolbar";
import { preferencesSchema } from "../shared/organization";

it("keeps a saved chip order, dropping unknown chips and adding missing ones at the end", () => {
  expect(chipOrder([])).toEqual([...toolbarChips]);
  expect(chipOrder(["sort", "bogus", "search", "sort"])).toEqual(["sort", "search", "filters", "saved", "view", "group"]);
});

it("moves a chip before or after another", () => {
  expect(moveChip([], "sort", "search", "before")).toEqual(["sort", "search", "filters", "saved", "view", "group"]);
  expect(moveChip([], "search", "sort", "after")).toEqual(["filters", "saved", "view", "group", "sort", "search"]);
  expect(moveChip([], "filters", "saved", "after")).toEqual(["search", "saved", "filters", "view", "group", "sort"]);
  expect(moveChip([], "view", "view", "before")).toEqual([...toolbarChips]);
});

it("remembers the chip order and labels on the device, with labels shown by default", () => {
  expect(preferencesSchema.parse({})).toMatchObject({ toolbarOrder: [], toolbarLabels: true, stickyHeaders: true, linksInPaseo: true });
  expect(preferencesSchema.parse({ stickyHeaders: false }).stickyHeaders).toBe(false);
  expect(preferencesSchema.parse({ stickyHeaders: "yes" }).stickyHeaders).toBe(true);
  expect(preferencesSchema.parse({ toolbarLabels: "nope", toolbarOrder: "bad" })).toMatchObject({ toolbarOrder: [], toolbarLabels: true });
});

it("fits as many chips beside the icon buttons as there is room for, and wraps the rest below", () => {
  // A 340px row with 120px of icons: Search (80) and Filters (90) fit; Saved goes below.
  expect(firstLineCount([80, 90, 85, 70], 340, 120, 4)).toBe(2);
  expect(firstLineCount([40, 40], 340, 120, 4)).toBe(2);
  expect(firstLineCount([300], 340, 120, 4)).toBe(0);
  // Not measured yet: keep everything on the first line.
  expect(firstLineCount([80, undefined, 85], 340, 120, 4)).toBe(3);
  expect(firstLineCount([80, 90], 0, 120, 4)).toBe(2);
  expect(firstLineCount([80, 90], 340, undefined, 4)).toBe(2);
  // No icon buttons beside them: the full width is available.
  expect(firstLineCount([150, 150, 150], 340, 0, 4)).toBe(2);
});
