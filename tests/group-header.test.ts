import { expect, it } from "vitest";
import { GROUP_HEADER, stickyTop, SUBGROUP_HEADER } from "../shared/group-header";

it("makes subgroup headers about a fifth shorter, and pins each header below the ones above it", () => {
  expect(SUBGROUP_HEADER.height / GROUP_HEADER.height).toBeCloseTo(0.8, 1);
  // Each height is its line, its padding above and below, and a 1px border top and bottom.
  for (const header of [GROUP_HEADER, SUBGROUP_HEADER]) expect(header.line + header.padding * 2 + 2).toBe(header.height);
  expect([0, 1, 2, 3].map(stickyTop)).toEqual([0, 42, 76, 110]);
});
